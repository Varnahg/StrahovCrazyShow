/** Relative photometry; the final scene intensities remain an artistic exposure.
 * Sources and scope: docs/weather/atmosphere-lighting.md. */
const clamp = (v: number, lo = 0, hi = 1) =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));

/** Krisciunas & Schaefer (1991), eq. 20, normalized to full moon.
 * The opposition surge makes a quarter much dimmer than half a full moon.
 * Earthshine lights the disc only, never the whole campus at new moon. */
export function lunarRelativeIrradiance(fraction: number, distance = 384400) {
  const lit = clamp(fraction);
  if (lit <= 0) return 0;
  const phaseAngle = (Math.acos(2 * lit - 1) * 180) / Math.PI;
  const phase = 10 ** (-0.4 * (0.026 * phaseAngle + 4e-9 * phaseAngle ** 4));
  const distanceScale = (384400 / clamp(distance, 340000, 410000)) ** 2;
  return phase * Math.min(1, lit / 0.02) * distanceScale;
}

/** Relative airmass extinction for a body above the horizon. The extinction
 * coefficient is an art estimate, not a local aerosol observation. */
export function celestialTransmission(altitude: number) {
  if (!Number.isFinite(altitude) || altitude <= 0) return 0;
  const elevation = Math.min(90, (altitude * 180) / Math.PI);
  const airmass =
    1 / (Math.sin(altitude) + 0.50572 * (elevation + 6.07995) ** -1.6364);
  const rise = clamp(elevation / 3);
  return (
    Math.exp(-0.16 * Math.max(0, airmass - 1)) * rise * rise * (3 - 2 * rise)
  );
}

/** WMO optical range means 5% transmission. Babylon EXP fog uses exp(-d*rho).
 * Missing model visibility uses a labelled artistic campus haze, not a claimed
 * fog measurement; humidity alone never creates dense fog. */
export function atmosphereFogDensity(
  cloud: number,
  rain: number,
  visibility?: number,
) {
  if (
    visibility !== undefined &&
    Number.isFinite(visibility) &&
    visibility >= 0
  )
    return clamp(-Math.log(0.05) / Math.max(80, visibility), 0.000035, 0.025);
  return 0.0003 + clamp(cloud) * 0.00035 + clamp(rain / 8) * 0.0015;
}
