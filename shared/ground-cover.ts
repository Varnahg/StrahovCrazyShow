import references from "./data/ground-cover-reference.json";
import streets from "./data/streets.json";

export type GroundCoverSample = {
  variation: number;
  grassDensity: number;
  wear: number;
  flowerDensity: number;
};
export const GROUND_COVER_REFERENCE = references;
/** Additional interpretations, never edits to the original OSM archive. */
export const GROUND_COVER_AREAS = references.areas.map((area) => ({
  osmId: "reference:" + area.id,
  referenceId: area.id,
  kind: "grass",
  surface: "grass",
  points: area.points as [number, number][],
  source:
    "IPR 2024-06-08 ortho and private B6 reference photographs received 2026-10-24",
  provenance: references.classification,
  sourceIds: area.sourceIds,
  boundaryUncertaintyMetres: area.boundaryUncertaintyMetres,
}));
export const GROUND_DIRT_SEGMENTS = streets.features
  .filter((feature) => feature.surface === "dirt")
  .flatMap((feature) =>
    feature.points.slice(1).map((end, index) => ({
      a: feature.points[index] as [number, number],
      b: end as [number, number],
      radius: feature.width / 2,
      sourceId: feature.id,
      widthBasis: feature.widthProvenance,
      source: feature.source,
    })),
  );
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const smooth = (a: number, b: number, value: number) => {
  const t = clamp((value - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Integer hash has the same operations in GLSL/WGSL; no sin-based GPU hash. */
export function groundCoverHash(x: number, z: number) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function groundCoverNoise(x: number, z: number) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    fx = x - ix,
    fz = z - iz;
  const u = fx * fx * (3 - 2 * fx),
    v = fz * fz * (3 - 2 * fz);
  const a = groundCoverHash(ix, iz) * (1 - u) + groundCoverHash(ix + 1, iz) * u;
  const b =
    groundCoverHash(ix, iz + 1) * (1 - u) + groundCoverHash(ix + 1, iz + 1) * u;
  return a * (1 - v) + b * v;
}
export function groundSegmentDistance(
  x: number,
  z: number,
  a: readonly number[],
  b: readonly number[],
) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = dx * dx + dz * dz;
  const t = length ? clamp(((x - a[0]) * dx + (z - a[1]) * dz) / length) : 0;
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
function polygonContains(
  x: number,
  z: number,
  points: readonly (readonly number[])[],
) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      inside = !inside;
  }
  return inside;
}
/** Soft appearance only. Callers MUST retain placementClassifier hard exclusions. */
export function sampleGroundCover(
  x: number,
  z: number,
  out: GroundCoverSample = {
    variation: 0,
    grassDensity: 0,
    wear: 0,
    flowerDensity: 0,
  },
): GroundCoverSample {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    out.variation = out.grassDensity = out.wear = out.flowerDensity = 0;
    return out;
  }
  const variation =
    0.65 * groundCoverNoise(x / 8, z / 8) +
    0.35 * groundCoverNoise(x / 1.7, z / 1.7);
  let wear = 0;
  for (const segment of GROUND_DIRT_SEGMENTS) {
    const range = segment.radius + 0.9;
    if (
      x < Math.min(segment.a[0], segment.b[0]) - range ||
      x > Math.max(segment.a[0], segment.b[0]) + range ||
      z < Math.min(segment.a[1], segment.b[1]) - range ||
      z > Math.max(segment.a[1], segment.b[1]) + range
    )
      continue;
    wear = Math.max(
      wear,
      1 -
        smooth(
          segment.radius * 0.65,
          segment.radius + 0.65 + 0.25 * variation,
          groundSegmentDistance(x, z, segment.a, segment.b),
        ),
    );
  }
  let flowerMask = 0;
  for (const area of references.areas) {
    if (!area.flowers || !polygonContains(x, z, area.points)) continue;
    let edge = Infinity;
    for (let i = 0; i < area.points.length; i++)
      edge = Math.min(
        edge,
        groundSegmentDistance(
          x,
          z,
          area.points[i],
          area.points[(i + 1) % area.points.length],
        ),
      );
    flowerMask = Math.max(flowerMask, smooth(0, 1.2, edge));
  }
  out.variation = variation;
  out.wear = wear;
  out.grassDensity = (0.76 + 0.24 * variation) * (1 - 0.9 * wear);
  out.flowerDensity =
    flowerMask *
    (0.025 + 0.075 * groundCoverNoise(x / 4, z / 4)) *
    (1 - wear) *
    (1 - wear);
  return out;
}
