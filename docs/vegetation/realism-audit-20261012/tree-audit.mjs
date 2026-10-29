/**
 * Read-only audit of source/runtime tree assets; no Blender, browser or GPU.
 * Run from the repository root:
 *   node --import tsx docs/vegetation/realism-audit-20261012/tree-audit.mjs
 * The only write is the adjacent tree-audit.json. Original assets are untouched.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";

const directory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(directory, "../../..");
const read = (relative) => fs.readFileSync(path.join(root, relative));
const json = (relative) => JSON.parse(read(relative));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const { TREES } = await import(pathToFileURL(path.join(root, "shared/world.ts")));
const modelPath = "public/models/vegetation/realistic/strahov-individual-trees.glb";
const runtimePath = "public/models/vegetation/runtime/manifest.json";
const farPath = "public/models/vegetation/runtime/far.glb";
const geometryPath = "public/models/vegetation/realistic/manifest.json";
const referencePath = "shared/data/tree-reconstruction.json";
const sourceMaterialPath = "public/models/vegetation/realistic/texture-manifest.json";
const runtime = json(runtimePath);
const geometry = json(geometryPath);
const reference = json(referencePath);
const materialSources = json(sourceMaterialPath);
const liveIds = new Set(TREES.map((tree) => tree.osmId));

function glb(bytes) {
  if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2)
    throw Error("Expected GLB 2.0");
  const length = bytes.readUInt32LE(12);
  return {
    metadata: JSON.parse(bytes.subarray(20, 20 + length)),
    binary: bytes.subarray(28 + length),
  };
}

function dimensions(bytes, mimeType) {
  if (mimeType === "image/png") {
    if (bytes.toString("ascii", 1, 4) !== "PNG") throw Error("Bad PNG signature");
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      bitDepth: bytes[24],
      pngColorType: bytes[25],
    };
  }
  if (mimeType !== "image/jpeg" || bytes.readUInt16BE(0) !== 0xffd8)
    throw Error("Expected PNG or JPEG");
  const startOfFrame = new Set([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207]);
  let cursor = 2;
  while (cursor < bytes.length) {
    while (bytes[cursor] === 255) cursor++;
    const marker = bytes[cursor++];
    if (marker === 217 || marker === 218) break;
    const length = bytes.readUInt16BE(cursor);
    if (startOfFrame.has(marker)) return {
      width: bytes.readUInt16BE(cursor + 5),
      height: bytes.readUInt16BE(cursor + 3),
      bitDepth: bytes[cursor + 2],
      channels: bytes[cursor + 7],
    };
    cursor += length;
  }
  throw Error("JPEG dimensions unavailable");
}

function opacityCoverage(relative) {
  const bytes = read(relative);
  const size = dimensions(bytes, "image/png");
  if (size.bitDepth !== 8 || size.pngColorType !== 0)
    throw Error("Opacity audit requires 8-bit grayscale PNG");
  const parts = [];
  for (let cursor = 8; cursor < bytes.length;) {
    const length = bytes.readUInt32BE(cursor);
    if (bytes.toString("ascii", cursor + 4, cursor + 8) === "IDAT")
      parts.push(bytes.subarray(cursor + 8, cursor + 8 + length));
    cursor += length + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const { width, height } = size;
  if (raw.length !== (width + 1) * height) throw Error("Unexpected PNG scanline length");
  const pixels = new Uint8Array(width * height);
  let cursor = 0, acceptedPixels = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++];
    if (filter > 4) throw Error("Invalid PNG filter");
    for (let x = 0; x < width; x++) {
      const left = x ? pixels[y * width + x - 1] : 0;
      const above = y ? pixels[(y - 1) * width + x] : 0;
      const upperLeft = x && y ? pixels[(y - 1) * width + x - 1] : 0;
      let value = raw[cursor++];
      if (filter === 1) value += left;
      else if (filter === 2) value += above;
      else if (filter === 3) value += Math.floor((left + above) / 2);
      else if (filter === 4) {
        const predictor = left + above - upperLeft;
        const a = Math.abs(predictor - left), b = Math.abs(predictor - above), c = Math.abs(predictor - upperLeft);
        value += a <= b && a <= c ? left : b <= c ? above : upperLeft;
      }
      pixels[y * width + x] = value;
      if (pixels[y * width + x] >= 128) acceptedPixels++;
    }
  }
  return {
    source: relative, sha256: sha(bytes), ...size,
    cutoff: 0.5, acceptedPixels, totalPixels: width * height,
    acceptedTextureAreaFraction: acceptedPixels / (width * height),
    discardedTextureAreaFraction: 1 - acceptedPixels / (width * height),
    interpretation: "Base-level opacity texture area only. Not measured screen overdraw, mip coverage, fragment cost or FPS.",
  };
}

const sourceBytes = read(modelPath);
const source = glb(sourceBytes).metadata;
const farBytes = read(farPath);
const far = glb(farBytes);
const farImages = far.metadata.images.map((entry) => {
  const view = far.metadata.bufferViews[entry.bufferView];
  const payload = far.binary.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  return { name: entry.name, mimeType: entry.mimeType, bytes: payload.length,
    sha256: sha(payload), ...dimensions(payload, entry.mimeType) };
});
const lods = [0, 1, 2].map((lod) => {
  const authored = geometry.lods.filter((entry) => liveIds.has(entry.treeId) && entry.lod === lod);
  const nodes = source.nodes.filter((entry) => {
    const match = /^tree__(.+)__lod([012])__(bark|leaves)$/.exec(entry.name);
    return match && liveIds.has(match[1]) && Number(match[2]) === lod;
  });
  const primitives = nodes.flatMap((entry) => source.meshes[entry.mesh].primitives);
  return {
    lod, placedTrees: authored.length, meshCountBeforeFrustumCulling: nodes.length,
    triangles: primitives.reduce((sum, entry) => sum + source.accessors[entry.indices].count / 3, 0),
    exportedPositionAccessorVertices: primitives.reduce((sum, entry) => sum + source.accessors[entry.attributes.POSITION].count, 0),
    authoredPreExportVertices: authored.reduce((sum, entry) => sum + entry.vertices, 0),
    minimumTrianglesPerTree: Math.min(...authored.map((entry) => entry.triangles)),
    maximumTrianglesPerTree: Math.max(...authored.map((entry) => entry.triangles)),
    detailChunkBytes: lod === 2 ? null : authored.reduce((sum, entry) => sum + runtime.trees[entry.treeId][lod].bytes, 0),
  };
});

const testFiles = ["tests/tree-appearance.test.ts", "tests/vegetation-runtime.test.ts", "tests/vegetation-realistic-pack.test.ts"];
const inputPaths = [...new Set([
  "docs/vegetation/realism-audit-20261012/tree-audit.mjs",
  modelPath, farPath, runtimePath, geometryPath, referencePath, sourceMaterialPath,
  "shared/world.ts", "shared/vegetation.ts", "shared/data/landcover.json", "shared/data/surveyed-trees.json",
  "client/vegetation.ts", "client/tree-appearance.ts", "client/tree-wind.ts",
  "scripts/tree-pack-blender.py", "scripts/tree-pack-reference.py", "scripts/tree-pack-fetch.py", "scripts/tree-runtime-pack.mjs",
  ...testFiles,
  ...materialSources.assets.flatMap((entry) => Object.values(entry.channels).map((channel) => "public" + channel.url)),
])];
const inputs = inputPaths.map((relative) => {
  const bytes = relative === modelPath ? sourceBytes : relative === farPath ? farBytes : read(relative);
  return { path: relative, bytes: bytes.length, sha256: sha(bytes) };
});

const result = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  scope: "Read-only static source/asset audit. Not GPU, frame-time, network-transfer or visual acceptance evidence.",
  reproduce: "node --import tsx docs/vegetation/realism-audit-20261012/tree-audit.mjs",
  environment: { node: process.version, platform: process.platform, architecture: process.arch },
  inputs,
  placements: {
    candidateCount: reference.trees.length, runtimeCount: TREES.length,
    excludedCandidateIds: reference.trees.filter((entry) => !liveIds.has(entry.id)).map((entry) => entry.id),
    byProvenance: Object.fromEntries([...new Set(TREES.map((entry) => entry.provenance))].map((kind) => [kind, TREES.filter((entry) => entry.provenance === kind).map((entry) => entry.osmId)])),
    byAppearance: Object.fromEntries([...new Set(TREES.map((entry) => entry.reconstruction.appearance))].map((kind) => [kind, TREES.filter((entry) => entry.reconstruction.appearance === kind).map((entry) => entry.osmId)])),
    sourceCaptureDates: { crown: [...new Set(reference.trees.map((entry) => entry.reference.crownCaptureDate))], height: [...new Set(reference.trees.map((entry) => entry.reference.heightCaptureDate))] },
    limitations: reference.limitations,
  },
  hypotheticalAllTreesAtOneLod: lods,
  lodInterpretation: "Catalog totals for placed tree IDs, before view culling and shadow passes. Real rendering mixes LODs; these are not measured GPU workloads. Export duplicates vertices for seams, so both authored and exported counts are labelled separately.",
  archive: {
    masterBytes: sourceBytes.length, masterSha256: sha(sourceBytes),
    bootstrapBytes: farBytes.length, bootstrapSha256: sha(farBytes),
    embeddedTextureBytes: farImages.reduce((sum, entry) => sum + entry.bytes, 0),
    bootstrapArchiveMeshCount: far.metadata.meshes.length,
    runtimeActiveMeshesBeforeFrustumCulling: lods[2].meshCountBeforeFrustumCulling,
    extensionsUsed: far.metadata.extensionsUsed ?? [],
    embeddedImages: farImages,
    sizeInterpretation: "Local file bytes, not observed network bytes or GPU memory. Bootstrap includes one excluded candidate whose meshes runtime disables.",
  },
  opacityCoverage: ["LeafSet001", "LeafSet019"].map((id) => opacityCoverage(`public/models/vegetation/realistic/${id}_2K-PNG_Opacity.png`)),
  hypotheticalTextureAllocation: {
    assumptions: "Nine 2048x2048 textures uploaded as uncompressed RGBA8 with complete mip chains. Actual GPU format, allocation and duplicate resources were not inspected.",
    estimatedBytes: farImages.reduce((sum, entry) => sum + entry.width * entry.height * 4 * 4 / 3, 0),
    estimatedMiB: farImages.reduce((sum, entry) => sum + entry.width * entry.height * 4 * 4 / 3, 0) / 1024 / 1024,
    measured: false,
  },
  priorSessionTestObservation: {
    date: "2026-10-12",
    command: "pnpm exec tsx --test tests/tree-appearance.test.ts tests/vegetation-runtime.test.ts tests/vegetation-realistic-pack.test.ts",
    exitCode: 0, tests: 13, passed: 13, failed: 0, skipped: 0, runnerDurationMs: 8755.5603,
    provenance: "Observed terminal output in the tree audit agent's current research session before this evidence script was authored. No separate log was saved. This script does not rerun tests; this record is historical session evidence, not a fresh test result.",
    testPaths: testFiles,
    limitation: "Includes Babylon NullEngine checks of data/ownership and source hashes. Not GPU performance or visual-quality validation.",
  },
};
fs.writeFileSync(path.join(directory, "tree-audit.json"), JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ output: "docs/vegetation/realism-audit-20261012/tree-audit.json", placedTrees: TREES.length,
  lodTriangles: lods.map((entry) => entry.triangles), bootstrapBytes: farBytes.length,
  imageDimensions: [...new Set(farImages.map((entry) => `${entry.width}x${entry.height}`))],
  alphaCoverage: result.opacityCoverage.map((entry) => entry.acceptedTextureAreaFraction),
  gpuMeasured: false }, null, 2));
