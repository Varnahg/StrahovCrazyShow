/** Offline deterministic repair: rotate one diagonal in a planar inner
 * shell patch. Original source and every GLB byte outside six indices survive. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { parseGlb } from "./car-glb-reader.mjs";

export const EXPECTED_NEAR_SHA =
  "2805ecfd4dd14ad3ea0511efce8c78d9dd8fc07c9d55dc28bf02e61831afa665";
export const REPAIR = Object.freeze({
  node: "Body:black",
  triangles: [18116, 18117],
  before: [
    [25955, 27830, 27921],
    [25956, 27922, 27927],
  ],
  after: [
    [27830, 27921, 27927],
    [27830, 27927, 25955],
  ],
});
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sub = (a, b) => a.map((x, i) => x - b[i]);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a) => Math.hypot(...a);
const pkey = (p) => p.map((x) => Math.round(x / 1e-6)).join(",");

export function boundary(triangles, positions) {
  const edges = new Map();
  for (const tri of triangles)
    for (let i = 0; i < 3; i++) {
      const a = pkey(positions[tri[i]]),
        b = pkey(positions[tri[(i + 1) % 3]]),
        reverse = b + "|" + a,
        key = a + "|" + b;
      if (edges.has(reverse)) {
        const count = edges.get(reverse) - 1;
        if (count) edges.set(reverse, count);
        else edges.delete(reverse);
      } else edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  return [...edges].sort((a, b) => a[0].localeCompare(b[0]));
}

export function repairNearBytes(input) {
  const inputSha256 = sha(input);
  if (inputSha256 !== EXPECTED_NEAR_SHA)
    throw Error("Near input differs from reviewed source checkpoint");
  const glb = parseGlb(input),
    node = glb.json.nodes.find((n) => n.name === REPAIR.node),
    primitive = glb.json.meshes[node?.mesh]?.primitives;
  if (primitive?.length !== 1)
    throw Error("Unexpected Body:black primitive structure");
  const p = primitive[0],
    indices = glb.accessor(p.indices).flat(),
    positions = glb.accessor(p.attributes.POSITION),
    normals = glb.accessor(p.attributes.NORMAL);
  for (let i = 0; i < 2; i++)
    if (
      JSON.stringify(
        indices.slice(REPAIR.triangles[i] * 3, REPAIR.triangles[i] * 3 + 3),
      ) !== JSON.stringify(REPAIR.before[i])
    )
      throw Error("Repair triangle indices drifted");
  const oldBoundary = boundary(REPAIR.before, positions),
    newBoundary = boundary(REPAIR.after, positions);
  if (JSON.stringify(oldBoundary) !== JSON.stringify(newBoundary))
    throw Error("Outer patch boundary changed");
  const planeX = positions[REPAIR.before[0][0]][0];
  if (REPAIR.after.flat().some((i) => positions[i][0] !== planeX))
    throw Error("Reviewed patch is no longer coplanar");
  const faces = REPAIR.after.map((ids) => {
    const [a, b, c] = ids.map((i) => positions[i]),
      normal = cross(sub(b, a), sub(c, a)),
      average = ids.reduce(
        (a, i) => a.map((x, j) => x + normals[i][j]),
        [0, 0, 0],
      );
    const area = len(normal) / 2,
      normalDot =
        normal.reduce((s, x, i) => s + x * average[i], 0) /
        (len(normal) * len(average));
    if (area < 1e-12 || normalDot < 0.999)
      throw Error(
        "Replacement face is degenerate or faces away from original normals",
      );
    return { indices: ids, area, normalDot };
  });
  let binaryOffset;
  for (let i = 12; i < input.length;) {
    const bytes = input.readUInt32LE(i),
      type = input.readUInt32LE(i + 4);
    if (type === 0x004e4942) binaryOffset = i + 8;
    i += 8 + bytes;
  }
  const accessor = glb.json.accessors[p.indices],
    view = glb.json.bufferViews[accessor.bufferView];
  const size =
    accessor.componentType === 5123
      ? 2
      : accessor.componentType === 5125
        ? 4
        : 0;
  if (
    !size ||
    accessor.type !== "SCALAR" ||
    view.byteStride ||
    binaryOffset === undefined
  )
    throw Error("Unsupported reviewed index layout");
  const result = Buffer.from(input),
    allowed = [];
  for (let i = 0; i < 2; i++)
    for (let j = 0; j < 3; j++) {
      const offset =
        binaryOffset +
        (view.byteOffset ?? 0) +
        (accessor.byteOffset ?? 0) +
        (REPAIR.triangles[i] * 3 + j) * size;
      result[size === 2 ? "writeUInt16LE" : "writeUInt32LE"](
        REPAIR.after[i][j],
        offset,
      );
      for (let b = 0; b < size; b++) allowed.push(offset + b);
    }
  const changed = [],
    allowedBytes = new Set(allowed);
  for (let i = 0; i < input.length; i++)
    if (input[i] !== result[i]) {
      if (!allowedBytes.has(i)) throw Error("Unrelated byte changed");
      changed.push(i);
    }
  return {
    bytes: result,
    audit: {
      inputSha256,
      outputSha256: sha(result),
      bytes: result.length,
      triangleCountUnchanged: true,
      changedTriangles: REPAIR.triangles,
      changedIndexCount: 6,
      changedByteOffsets: changed,
      permittedByteOffsets: allowed,
      patchBoundaryUnchanged: true,
      positionsNormalsUvsMaterialsNodesImagesByteIdentical: true,
      maximumVertexDisplacementMetres: 0,
      replacementFaces: faces,
      boundary: newBoundary,
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [inputPath, outputPath, auditPath] = process.argv.slice(2);
  if (!inputPath || !outputPath || !auditPath)
    throw Error("Expected input GLB, output GLB, audit JSON paths");
  const result = repairNearBytes(readFileSync(inputPath));
  writeFileSync(outputPath, result.bytes);
  writeFileSync(auditPath, JSON.stringify(result.audit, null, 2) + "\n");
  console.log(JSON.stringify(result.audit));
}
