import { Matrix } from "@babylonjs/core/Maths/math.vector";

export const VEGETATION_TRANSLATION_GUARD = 0.002;
export const VEGETATION_PIXEL_TOLERANCE = 0.25;
type Position = Readonly<{ x: number; y: number; z: number }>;

/** Snapshot-relative PURE translation tolerance. Rotation/projection stay exact.
 * Call accept only when beginning a real selection, include every admitted
 * candidate sphere before LOD/budget thinning, then complete after selection.
 * The caller's range/frustum guard must cover VEGETATION_TRANSLATION_GUARD.
 * No camera, focus, shader uniform or renderer-frustum state is modified here. */
export class VegetationViewStability {
  private initialized = false;
  private boundsComplete = false;
  private view = Matrix.Identity();
  private projection = Matrix.Identity();
  private x = 0;
  private y = 0;
  private z = 0;
  private focusX = 0;
  private focusZ = 0;
  private width = 0;
  private height = 0;
  private fov = 0;
  private depth = Infinity;

  reset() { this.initialized = this.boundsComplete = false; }
  get minimumDepth() { return this.boundsComplete ? this.depth : 0; }

  projectionChanged(projection: Matrix, width: number, height: number, fov: number) {
    if (!this.initialized || width !== this.width || height !== this.height || fov !== this.fov) return true;
    for (let i = 0; i < 16; i++) if (projection.m[i] !== this.projection.m[i]) return true;
    return false;
  }

  changed(view: Matrix, projection: Matrix, eye: Position, focusX: number, focusZ: number, width: number, height: number, fov: number) {
    if (this.projectionChanged(projection, width, height, fov)) return true;
    const current = view.m, previous = this.view.m;
    for (let i = 0; i < 12; i++) if (current[i] !== previous[i]) return true;
    if (current[15] !== previous[15]) return true;
    const ex = eye.x - this.x, ey = eye.y - this.y, ez = eye.z - this.z;
    const fx = focusX - this.focusX, fz = focusZ - this.focusZ;
    // Use the ACTUAL float32 view translations too: world-position deltas alone
    // can underestimate their rounding at large scene coordinates.
    const vx = current[12] - previous[12], vy = current[13] - previous[13], vz = current[14] - previous[14];
    const eyeMotion = Math.hypot(ex, ey, ez), focusMotion = Math.hypot(fx, fz), viewMotion = Math.hypot(vx, vy, vz);
    if (!Number.isFinite(eyeMotion + focusMotion + viewMotion) ||
        eyeMotion > VEGETATION_TRANSLATION_GUARD || focusMotion > VEGETATION_TRANSLATION_GUARD || viewMotion > VEGETATION_TRANSLATION_GUARD) return true;
    if (eyeMotion === 0 && focusMotion === 0 && viewMotion === 0) return false;
    if (!this.boundsComplete || !this.canonicalPerspective()) return true;
    const focusPixels = this.translationPixels(fx * previous[0] + fz * previous[8],
      fx * previous[1] + fz * previous[9], fx * previous[2] + fz * previous[10]);
    return this.translationPixels(vx, vy, vz) > VEGETATION_PIXEL_TOLERANCE || focusPixels > VEGETATION_PIXEL_TOLERANCE;
  }

  accept(view: Matrix, projection: Matrix, eye: Position, focusX: number, focusZ: number, width: number, height: number, fov: number) {
    this.view.copyFrom(view); this.projection.copyFrom(projection);
    this.x = eye.x; this.y = eye.y; this.z = eye.z; this.focusX = focusX; this.focusZ = focusZ;
    this.width = width; this.height = height; this.fov = fov;
    this.initialized = true; this.boundsComplete = false; this.depth = Infinity;
  }

  includeBounds(x: number, y: number, z: number, radius: number) {
    const v = this.view.m, sign = this.projection.m[11];
    const centreDepth = sign * (x * v[2] + y * v[6] + z * v[10] + v[14]);
    const depth = centreDepth - radius * Math.hypot(v[2], v[6], v[10]);
    this.depth = Number.isFinite(depth) && radius >= 0 ? Math.min(this.depth, Math.max(0, depth)) : 0;
  }
  complete() { this.boundsComplete = true; }

  private canonicalPerspective() {
    const p = this.projection.m, v = this.view.m;
    return this.width > 0 && this.height > 0 && Number.isFinite(this.width + this.height + p[0] + p[5] + p[8] + p[9]) &&
      p[0] !== 0 && p[5] !== 0 && p[1] === 0 && p[4] === 0 && p[3] === 0 && p[7] === 0 &&
      Math.abs(p[11]) === 1 && p[12] === 0 && p[13] === 0 && p[15] === 0 &&
      v[3] === 0 && v[7] === 0 && v[11] === 0 && v[15] === 1;
  }

  private translationPixels(dx: number, dy: number, dz: number) {
    if (dx === 0 && dy === 0 && dz === 0) return 0;
    const denominator = this.depth - Math.abs(dz);
    if (!(denominator > 0)) return Infinity;
    const p = this.projection.m;
    // For a point visible in either pose, |NDC|<=1. Off-centre projection
    // contributes |p8/p9|; subtracting |dz| keeps the lower depth conservative.
    const px = this.width * .5 * (Math.abs(p[0] * dx) + (1 + Math.abs(p[8])) * Math.abs(dz)) / denominator;
    const py = this.height * .5 * (Math.abs(p[5] * dy) + (1 + Math.abs(p[9])) * Math.abs(dz)) / denominator;
    return Math.hypot(px, py);
  }
}
