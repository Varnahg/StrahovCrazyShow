import type { PhotogrammetryCollision } from "./photogrammetry-gameplay";
/** Aerial cameras cannot see the ground below B6's canopy. The original scan
 * is cut only here; this approach meets the source sidewalk and native first
 * 15 cm riser without a 33 cm discontinuity. Dimensions remain interpreted. */
export function photogrammetryEntranceRepair(): PhotogrammetryCollision {
  const x0 = -6.9,
    x1 = -2.7,
    z0 = -82.1,
    z1 = -81.4;
  return {
    positions: new Float32Array([
      x0,
      -0.16,
      z0,
      x1,
      -0.16,
      z0,
      x0,
      0.035,
      z1,
      x1,
      0.035,
      z1,
      x0,
      0,
      z1,
      x1,
      0,
      z1,
      x0,
      0,
      -77.1,
      x1,
      0,
      -77.1,
    ]),
    indices: new Uint32Array([0, 2, 1, 1, 2, 3, 4, 6, 5, 5, 6, 7]),
  };
}
