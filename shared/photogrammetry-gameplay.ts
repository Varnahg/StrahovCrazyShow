import type { PhotogrammetryPoint } from "./photogrammetry";
import { B6_LAYOUT } from "./b6-interior";
export type PhotogrammetryCollision = {
  positions: Float32Array;
  indices: Uint32Array;
};
const inRect = (
  p: PhotogrammetryPoint,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;
export const PHOTO_ENTRY_CUTOUT = {
  minX: -6.9,
  maxX: -2.7,
  minZ: -82.1,
  maxZ: -76.7,
};
export function isPhotogrammetryB6(p: PhotogrammetryPoint) {
  return inRect(p, B6_LAYOUT.bounds) || inRect(p, B6_LAYOUT.lobby);
}
export function isPhotogrammetryB6Shell(p: PhotogrammetryPoint) {
  const expanded = (b: typeof B6_LAYOUT.bounds | typeof B6_LAYOUT.lobby) => ({
    minX: b.minX - 1.2,
    maxX: b.maxX + 1.2,
    minZ: b.minZ - 1.2,
    maxZ: b.maxZ + 1.2,
  });
  return (
    inRect(p, expanded(B6_LAYOUT.bounds)) ||
    inRect(p, expanded(B6_LAYOUT.lobby))
  );
}
export function photoVisualCutout(
  a: PhotogrammetryPoint,
  b: PhotogrammetryPoint,
  c: PhotogrammetryPoint,
) {
  const p = {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
  return inRect(p, PHOTO_ENTRY_CUTOUT) && p.y < 4.12;
}
export function photoCollisionCutout(
  a: PhotogrammetryPoint,
  b: PhotogrammetryPoint,
  c: PhotogrammetryPoint,
) {
  const p = {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
    z: (a.z + b.z + c.z) / 3,
  };
  return isPhotogrammetryB6(p) || photoVisualCutout(a, b, c);
}
export function decodePhotogrammetryCollision(
  buffer: ArrayBuffer,
): PhotogrammetryCollision {
  const view = new DataView(buffer);
  if (view.byteLength < 16 || view.getUint32(0, true) !== 0x314d4350)
    throw new Error("Invalid PCM1 collision header");
  const vertexCount = view.getUint32(4, true),
    indexCount = view.getUint32(8, true);
  if (
    !vertexCount ||
    indexCount % 3 ||
    view.byteLength !== 16 + vertexCount * 12 + indexCount * 4
  )
    throw new Error("Invalid PCM1 collision length");
  const positions = new Float32Array(buffer, 16, vertexCount * 3),
    indices = new Uint32Array(buffer, 16 + vertexCount * 12, indexCount);
  for (const p of positions)
    if (!Number.isFinite(p)) throw new Error("Nonfinite source collision");
  for (const i of indices)
    if (i >= vertexCount) throw new Error("Invalid source collision index");
  return { positions, indices };
}
