/** Exact source triangles, with bit-identical vertex welding only. Originals
 * and JPEGs are untouched. A documented B6 cutout retains playable rooms. */
import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import {
  decodeI3SGeometry,
  photogrammetryPositions,
  type PhotogrammetryManifest,
} from "../shared/photogrammetry";
import { photoCollisionCutout } from "../shared/photogrammetry-gameplay";
import {
  applyPhotogrammetryGroundRepairs,
  groundRepairStats,
} from "../shared/photogrammetry-ground";
const manifest = JSON.parse(
  await readFile("shared/data/photogrammetry.json", "utf8"),
) as PhotogrammetryManifest;
const vertices: number[] = [],
  indices: number[] = [],
  lookup = new Map<string, number>();
let inputTriangles = 0,
  cutoutTriangles = 0,
  degenerateTriangles = 0;
let repairedVertices = 0,
  maxRepairDelta = 0;
for (const node of manifest.nodes.filter(
  (n) => n.level === manifest.highestDetailLevel,
)) {
  const bytes = await readFile("public" + node.geometry),
    source = decodeI3SGeometry(bytes),
    original = photogrammetryPositions(source, node, manifest),
    p = applyPhotogrammetryGroundRepairs(original),
    bits = new Uint32Array(p.buffer);
  const repaired = groundRepairStats(original, p);
  repairedVertices += repaired.changedVertices;
  maxRepairDelta = Math.max(maxRepairDelta, repaired.maxDeltaMetres);
  for (let i = 0; i < p.length; i += 9) {
    inputTriangles++;
    const point = (o: number) => ({
      x: p[i + o],
      y: p[i + o + 1],
      z: p[i + o + 2],
    });
    if (photoCollisionCutout(point(0), point(3), point(6))) {
      cutoutTriangles++;
      continue;
    }
    const triangle: number[] = [];
    for (const o of [0, 3, 6]) {
      const key = `${bits[i + o]}:${bits[i + o + 1]}:${bits[i + o + 2]}`;
      let id = lookup.get(key);
      if (id === undefined) {
        id = vertices.length / 3;
        lookup.set(key, id);
        vertices.push(p[i + o], p[i + o + 1], p[i + o + 2]);
      }
      triangle.push(id);
    }
    if (new Set(triangle).size !== 3) {
      degenerateTriangles++;
      continue;
    }
    indices.push(...triangle);
  }
}
const binary = Buffer.allocUnsafe(
  16 + vertices.length * 4 + indices.length * 4,
);
binary.writeUInt32LE(0x314d4350, 0);
binary.writeUInt32LE(vertices.length / 3, 4);
binary.writeUInt32LE(indices.length, 8);
binary.writeUInt32LE(0, 12);
new Float32Array(binary.buffer, binary.byteOffset + 16, vertices.length).set(
  vertices,
);
new Uint32Array(
  binary.buffer,
  binary.byteOffset + 16 + vertices.length * 4,
  indices.length,
).set(indices);
const compressed = gzipSync(binary, { level: 6 }),
  url = "/models/photogrammetry/ipr2023/collision.pcm.gz";
await writeFile("public" + url, compressed);
const audit = {
  schemaVersion: 1,
  url,
  sourceLevel: manifest.highestDetailLevel,
  inputTriangles,
  outputTriangles: indices.length / 3,
  vertices: vertices.length / 3,
  cutoutTriangles,
  degenerateTriangles,
  repairedVertices,
  maxRepairDelta,
  repairsSha256: createHash("sha256")
    .update(await readFile("shared/data/photogrammetry-ground-repairs.json"))
    .digest("hex"),
  rawBytes: binary.length,
  gzipBytes: compressed.length,
  sha256: createHash("sha256").update(compressed).digest("hex"),
  rawSha256: createHash("sha256").update(binary).digest("hex"),
  method:
    "All finest source triangles, documented local pedestrian-ground repairs applied identically in rendering and collision. Only bit-identical Float32 vertices welded; no quantization or decimation. Explicit B6 playable-interior and north-entry cutout; original source archive unmodified.",
  sourceGeometrySha256: createHash("sha256")
    .update(
      JSON.stringify(
        manifest.nodes
          .filter((n) => n.level === 16)
          .map((n) => [n.id, n.geometrySha256]),
      ),
    )
    .digest("hex"),
};
await writeFile(
  "shared/data/photogrammetry-collision.json",
  JSON.stringify(audit),
);
await writeFile(
  "docs/photogrammetry/collision-audit.json",
  JSON.stringify(audit, null, 2),
);
console.log(JSON.stringify(audit));
