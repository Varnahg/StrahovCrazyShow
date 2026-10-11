/** Explain source vs baked degenerates using the immutable original transforms. */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  Matrix,
  Quaternion,
  Vector3,
} from "@babylonjs/core/Maths/math.vector.js";
const blob = readFileSync("public/models/transit/city-bus-source.glb");
const length = blob.readUInt32LE(12),
  spec = JSON.parse(blob.subarray(20, 20 + length)),
  binary = blob.subarray(20 + length + 8);
const parents = new Map(),
  matrices = new Map();
spec.nodes.forEach((node, id) =>
  (node.children ?? []).forEach((child) => parents.set(child, id)),
);
function world(id) {
  if (matrices.has(id)) return matrices.get(id);
  const node = spec.nodes[id],
    local = node.matrix
      ? Matrix.FromArray(node.matrix)
      : Matrix.Compose(
          Vector3.FromArray(node.scale ?? [1, 1, 1]),
          Quaternion.FromArray(node.rotation ?? [0, 0, 0, 1]),
          Vector3.FromArray(node.translation ?? [0, 0, 0]),
        );
  const result = parents.has(id)
    ? local.multiply(world(parents.get(id)))
    : local;
  matrices.set(id, result);
  return result;
}
function accessor(id) {
  const a = spec.accessors[id],
    v = spec.bufferViews[a.bufferView],
    size = a.componentType === 5123 ? 2 : 4,
    width = a.type === "VEC3" ? 3 : 1,
    start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
    stride = v.byteStride ?? size * width;
  return {
    count: a.count,
    get: (row, column = 0) =>
      a.componentType === 5126
        ? binary.readFloatLE(start + row * stride + column * size)
        : size === 2
          ? binary.readUInt16LE(start + row * stride + column * size)
          : binary.readUInt32LE(start + row * stride + column * size),
  };
}
const totals = [0, 0, 0],
  rows = [];
spec.nodes.forEach((node, id) => {
  if (node.mesh === undefined) return;
  const counts = [0, 0, 0];
  for (const primitive of spec.meshes[node.mesh].primitives) {
    const positions = accessor(primitive.attributes.POSITION),
      indices = accessor(primitive.indices);
    for (let i = 0; i < indices.count; i += 3) {
      const local = [0, 1, 2].map((j) => {
        const k = indices.get(i + j);
        return new Vector3(
          positions.get(k, 0),
          positions.get(k, 1),
          positions.get(k, 2),
        );
      });
      const transformed = local.map((p) =>
        Vector3.TransformCoordinates(p, world(id)),
      );
      const rounded = transformed.map(
        (p) =>
          new Vector3(Math.fround(p.x), Math.fround(p.y), Math.fround(p.z)),
      );
      [local, transformed, rounded].forEach((p, stage) => {
        if (
          Vector3.Cross(p[1].subtract(p[0]), p[2].subtract(p[0]))
            .asArray()
            .every((n) => Math.abs(n) < 1e-12)
        )
          counts[stage]++;
      });
    }
  }
  counts.forEach((count, stage) => (totals[stage] += count));
  if (counts.some(Boolean))
    rows.push({
      node: node.name,
      localStored: counts[0],
      worldDouble: counts[1],
      worldFloat32: counts[2],
    });
});
const report = {
  sourceSha256: createHash("sha256").update(blob).digest("hex"),
  localStoredDegenerates: totals[0],
  worldDoubleDegenerates: totals[1],
  worldFloat32Degenerates: totals[2],
  explanation:
    "Affine baking into float32 world positions collapses source surfaces thinner than float32 precision at translated coordinates; the original source remains unchanged.",
  rows,
};
writeFileSync(
  "docs/model-review/bus-degenerate-baseline.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, rows: undefined }));
