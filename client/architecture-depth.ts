export type FacadePoint = [number, number, number];

/** Small construction details interpreted from IPR2023 B6 and the identified
 * B12 window profile. These are game dimensions, not a facade survey. Existing
 * rough openings, frame faces and building envelopes remain unchanged. */
export const FACADE_DEPTH = {
  revealBevel: 0.012,
  frameFront: 0.015,
  glassBack: -0.002,
  metresPerRepeat: 3,
} as const;

/** A real sloped face needs its geometric normal and physical UV lengths.
 * The hint chooses its outward side; Batch keeps the matching RH winding.
 * Runs only while building static, per-material geometry. */
export function metricFacadeFrame(
  a: FacadePoint,
  b: FacadePoint,
  c: FacadePoint,
  outward: FacadePoint,
) {
  const ux = b[0] - a[0],
    uy = b[1] - a[1],
    uz = b[2] - a[2];
  const vx = c[0] - b[0],
    vy = c[1] - b[1],
    vz = c[2] - b[2];
  let nx = uy * vz - uz * vy,
    ny = uz * vx - ux * vz,
    nz = ux * vy - uy * vx;
  const length = Math.hypot(nx, ny, nz);
  if (!(length > 1e-12)) throw new Error("Degenerate facade detail face");
  const sign = nx * outward[0] + ny * outward[1] + nz * outward[2] < 0 ? -1 : 1;
  nx *= sign / length;
  ny *= sign / length;
  nz *= sign / length;
  return {
    normal: [nx, ny, nz] as FacadePoint,
    uv: [
      0,
      0,
      Math.hypot(ux, uy, uz) / FACADE_DEPTH.metresPerRepeat,
      Math.hypot(vx, vy, vz) / FACADE_DEPTH.metresPerRepeat,
    ],
  };
}
