/** CPU-only source preservation and load-cost audit. No renderer/FPS claims. */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";
import { deriveTreeCrownNormals } from "../client/tree-appearance";
import { decodeTreeRuntimeChunk } from "../client/vegetation";
import { TREES } from "../shared/world";
import manifest from "../public/models/vegetation/runtime/manifest.json";

const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const file = "public" + manifest.bootstrap,
  bytes = readFileSync(file),
  length = bytes.readUInt32LE(12),
  json = JSON.parse(bytes.subarray(20, 20 + length).toString()),
  bin = bytes.subarray(28 + length);
const attr = (id: number) => {
  const a = json.accessors[id],
    v = json.bufferViews[a.bufferView];
  return new Float32Array(
    bin.buffer,
    bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
    a.count * 3,
  );
};
const rows = json.meshes
  .filter((mesh: any) => mesh.name.endsWith("__leaves"))
  .flatMap((mesh: any) => {
    const id = /^tree__(.+)__lod2__/.exec(mesh.name)![1],
      reference = TREES.find((t) => t.osmId === id)?.reconstruction;
    if (!reference || reference.appearance === "bare") return [];
    const p = mesh.primitives[0];
    return [
      {
        id,
        reference,
        positions: attr(p.attributes.POSITION),
        normals: attr(p.attributes.NORMAL),
      },
    ];
  });
let checksum = 0;
function measure(fn: () => void) {
  const first = performance.now();
  fn();
  const coldMs = performance.now() - first,
    samplesMs = [];
  for (let i = 0; i < 9; i++) {
    const start = performance.now();
    fn();
    samplesMs.push(performance.now() - start);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return { coldMs, medianMs: sorted[4], maxMs: sorted[8], samplesMs };
}
const allFar = measure(() => {
  for (const row of rows) {
    const out = deriveTreeCrownNormals(
      row.positions,
      row.normals,
      row.reference,
    );
    checksum += out[0];
  }
});
const details = [];
for (const id of ["ipr-crown-026", "ipr-b6-south-conifer"]) {
  const reference = TREES.find((t) => t.osmId === id)!.reconstruction!;
  for (const lod of [0, 1] as const) {
    const entry = (
        manifest.trees as Record<string, Record<number, { url: string }>>
      )[id][lod],
      bytes = readFileSync("public" + entry.url),
      p = decodeTreeRuntimeChunk(
        bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      ).primitives.find((p) => p.name.endsWith("__leaves"))!;
    details.push({
      id,
      lod,
      vertices: p.positions.length / 3,
      normalBufferBytes: p.normals.byteLength,
      timing: measure(() => {
        const out = deriveTreeCrownNormals(p.positions, p.normals, reference);
        checksum += out[0];
      }),
    });
  }
}
const sources = [
  manifest.source,
  "assets/blender/vegetation/strahov-individual-trees.blend",
  file,
  "shared/data/tree-reconstruction.json",
  "shared/vegetation.ts",
  "public/models/vegetation/realistic/LeafSet001_2K-PNG_Color.png",
  "public/models/vegetation/realistic/Bark012_2K-JPG_Color.jpg",
  "client/tree-appearance.ts",
  "client/tree-wind.ts",
  "client/vegetation.ts",
].map((path) => ({ path, sha256: sha(readFileSync(path)) }));
const result = {
  timestampUTC: new Date().toISOString(),
  node: process.version,
  cpu: cpus()[0].model,
  method:
    "Node CPU transformation only; no GPU, no disk read in timed region, first call + 9 warmed runs. Concurrent OS activity uncontrolled. Not a frame-time/FPS benchmark or upload-cost measurement.",
  treePlacements: TREES.length,
  retainedFarFoliageMeshes: rows.length,
  allFarVertices: rows.reduce(
    (sum: number, row: any) => sum + row.positions.length / 3,
    0,
  ),
  allFarNormalBufferBytes: rows.reduce(
    (sum: number, row: any) => sum + row.normals.byteLength,
    0,
  ),
  allFar,
  details,
  sources,
  checksum,
};
const destination = "docs/vegetation/tree-depth-20261012";
mkdirSync(destination, { recursive: true });
writeFileSync(
  destination + "/cpu-audit.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result, null, 2));
