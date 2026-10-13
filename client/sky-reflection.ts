import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  SphericalHarmonics,
  SphericalPolynomial,
} from "@babylonjs/core/Maths/sphericalPolynomial";

const COEFFICIENTS = [
  "l00",
  "l1_1",
  "l10",
  "l11",
  "l2_2",
  "l2_1",
  "l20",
  "l21",
  "l22",
] as const;
const clamp = (value: number) =>
  Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

/** CPU projection of the authored sky, without GPU readback. Cubemap directions
 * and the two radiance basis functions are invariant: integrate them once per
 * owner, then mix the current linear top/horizon colours. */
export class SkyReflectionSampler {
  private readonly elevations: Float64Array;
  private readonly topBasis = new SphericalHarmonics();
  private readonly horizonBasis = new SphericalHarmonics();
  private readonly harmonics = new SphericalHarmonics();
  private readonly top = Color3.Black();
  private readonly horizon = Color3.Black();
  private readonly color = Color3.Black();
  readonly data: { faces: Uint8Array[]; polynomial: SphericalPolynomial };

  constructor(readonly size = 32) {
    if (!Number.isInteger(size) || size < 1)
      throw new RangeError("Sky reflection size must be a positive integer");
    this.elevations = new Float64Array(6 * size * size);
    this.data = {
      faces: Array.from({ length: 6 }, () => new Uint8Array(size * size * 4)),
      polynomial: new SphericalPolynomial(),
    };
    const direction = Vector3.Zero(),
      color = Color3.Black();
    let pixel = 0;
    for (let face = 0; face < 6; face++)
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const u = ((x + 0.5) * 2) / size - 1,
            v = 1 - ((y + 0.5) * 2) / size;
          // Keep the original face order and arithmetic for exact texture bytes.
          switch (face) {
            case 0:
              direction.set(1, v, -u);
              break;
            case 1:
              direction.set(-1, v, u);
              break;
            case 2:
              direction.set(u, 1, -v);
              break;
            case 3:
              direction.set(u, -1, v);
              break;
            case 4:
              direction.set(u, v, 1);
              break;
            case 5:
              direction.set(-u, v, -1);
              break;
          }
          direction.normalize();
          this.elevations[pixel++] = direction.y;
          const t = Math.max(0, direction.y),
            ground = direction.y < 0 ? 0.24 : 1,
            solidAngle =
              4 / (size * size * (1 + u * u + v * v) ** 1.5);
          color.setAll(t * ground);
          this.topBasis.addLight(direction, color, solidAngle);
          color.setAll((1 - t) * ground);
          this.horizonBasis.addLight(direction, color, solidAngle);
        }
    for (const basis of [this.topBasis, this.horizonBasis]) {
      basis.convertIncidentRadianceToIrradiance();
      basis.convertIrradianceToLambertianRadiance();
    }
  }

  /** The returned texture bytes and polynomial belong to this sampler and are
   * reused on the next update; owners needing a snapshot must copy them. */
  update(topDisplay: Color3, horizonDisplay: Color3) {
    topDisplay.toLinearSpaceToRef(this.top);
    horizonDisplay.toLinearSpaceToRef(this.horizon);
    let pixel = 0;
    for (const face of this.data.faces)
      for (let i = 0; i < face.length; i += 4) {
        const elevation = this.elevations[pixel++];
        Color3.LerpToRef(
          this.horizon,
          this.top,
          Math.max(0, elevation),
          this.color,
        );
        if (elevation < 0) this.color.scaleInPlace(0.24);
        face[i] = Math.round(clamp(this.color.r) * 255);
        face[i + 1] = Math.round(clamp(this.color.g) * 255);
        face[i + 2] = Math.round(clamp(this.color.b) * 255);
        face[i + 3] = 255;
      }
    for (const key of COEFFICIENTS) {
      const topWeight = this.topBasis[key].x,
        horizonWeight = this.horizonBasis[key].x;
      this.harmonics[key].set(
        topWeight * this.top.r + horizonWeight * this.horizon.r,
        topWeight * this.top.g + horizonWeight * this.horizon.g,
        topWeight * this.top.b + horizonWeight * this.horizon.b,
      );
    }
    // Babylon prescales these harmonics in place when a PBR material binds them.
    // Replacing every coefficient above and resetting this flag prevents stale
    // daylight or double scaling when the same owned polynomial is reused.
    this.harmonics.preScaled = false;
    this.data.polynomial.updateFromHarmonics(this.harmonics);
    return this.data;
  }
}

/** Independent snapshot for callers that do not own a persistent sampler. */
export function skyReflectionData(top: Color3, horizon: Color3, size = 32) {
  return new SkyReflectionSampler(size).update(top, horizon);
}
