export type CandidateQuality = "low" | "medium" | "high";
export type CandidateLevel = "near" | "medium" | "far";
export const CANDIDATE_GRASS_LIMITS = {
  low: {
    triangles: 60000,
    draws: 8,
    textureSize: 1024,
    range: 6,
    fadeStart: 3.5,
  },
  medium: {
    triangles: 140000,
    draws: 12,
    textureSize: 1024,
    range: 9,
    fadeStart: 6,
  },
  high: {
    triangles: 280000,
    draws: 16,
    textureSize: 1024,
    range: 12,
    fadeStart: 8,
  },
} as const;
export const CANDIDATE_LOD_TRIANGLES = {
  near: 168,
  medium: 84,
  far: 22,
} as const;
export const CANDIDATE_LOD_LEAVES = { near: 42, medium: 42, far: 11 } as const;
export const GRASS_LEVELS = ["near", "medium", "far"] as const;
export function projectedLeafLevel(
  distance: number,
  renderHeight: number,
  cameraFov: number,
  previous?: CandidateLevel,
): CandidateLevel | null {
  if (
    !(distance > 0) ||
    !(renderHeight > 0) ||
    !(cameraFov > 0 && cameraFov < Math.PI)
  )
    return null;
  const pixels =
    (0.055 * renderHeight) / (2 * Math.tan(cameraFov / 2) * distance);
  if (pixels >= (previous === "near" ? 26 : 32)) return "near";
  if (pixels >= (previous === "medium" ? 8 : 10)) return "medium";
  return pixels >= 2 ? "far" : null;
}
export type RootDemand = { id: number; level: CandidateLevel; score: number };
/** Input is the reusable, priority-sorted camera working set. The output reuses
 * references; the cap counts roots across all LODs, never one draw per tile. */
export function allocateGrassBudget<T extends RootDemand>(
  demands: readonly T[],
  quality: CandidateQuality,
  output: T[] = [],
): T[] {
  output.length = 0;
  let remaining = CANDIDATE_GRASS_LIMITS[quality].triangles;
  for (const demand of demands) {
    const cost = CANDIDATE_LOD_TRIANGLES[demand.level];
    if (!Number.isFinite(demand.score) || cost > remaining) continue;
    output.push(demand);
    remaining -= cost;
  }
  return output;
}
export function grassRootId(
  tileX: number,
  tileZ: number,
  index: number,
): number {
  const x = tileX >= 0 ? tileX * 2 : -tileX * 2 - 1;
  const z = tileZ >= 0 ? tileZ * 2 : -tileZ * 2 - 1;
  return (((x + z) * (x + z + 1)) / 2 + z) * 256 + index;
}
export function grassRootSeed(id: number): number {
  let value = id | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}
/** Capsule around camera→player keeps foreground and the player's nearest lawn
 * inside the same fixed spatial fade even in third person. */
export function grassFocusDistance(
  x: number,
  z: number,
  eyeX: number,
  eyeZ: number,
  focusX: number,
  focusZ: number,
): number {
  const dx = focusX - eyeX,
    dz = focusZ - eyeZ,
    lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared > 1e-8
      ? Math.max(
          0,
          Math.min(1, ((x - eyeX) * dx + (z - eyeZ) * dz) / lengthSquared),
        )
      : 0;
  return Math.hypot(x - eyeX - dx * t, z - eyeZ - dz * t);
}
