import { STRAHOV_LOCATION } from "./weather";

const RAD = Math.PI / 180;
const TAU = Math.PI * 2;
const J2000 = Date.UTC(2000, 0, 1, 12);
const daysSinceJ2000 = (instant: number) => (instant - J2000) / 86400000;
const wrap = (angle: number) => ((angle % TAU) + TAU) % TAU;

/** USNO approximate mean sidereal time; UTC approximates UT1 (<0.9 s). */
export function localSiderealAngle(
  instant: number,
  longitude = STRAHOV_LOCATION.longitude,
) {
  const days = daysSinceJ2000(instant),
    centuries = days / 36525;
  return wrap(
    (280.46061837 +
      360.98564736629 * days +
      0.000387933 * centuries ** 2 -
      centuries ** 3 / 38710000 +
      longitude) *
      RAD,
  );
}

/** Mean equatorial coordinates of date -> map: +X east, +Y up, +Z south. */
export function equatorialDirection(
  rightAscensionHours: number,
  declinationDegrees: number,
  instant: number,
  latitude = STRAHOV_LOCATION.latitude,
  longitude = STRAHOV_LOCATION.longitude,
) {
  const h =
    localSiderealAngle(instant, longitude) - rightAscensionHours * 15 * RAD;
  const dec = declinationDegrees * RAD,
    lat = latitude * RAD;
  return {
    x: -Math.cos(dec) * Math.sin(h),
    y:
      Math.sin(dec) * Math.sin(lat) +
      Math.cos(dec) * Math.cos(h) * Math.cos(lat),
    z:
      Math.cos(dec) * Math.cos(h) * Math.sin(lat) -
      Math.sin(dec) * Math.cos(lat),
  };
}

/** IAU 1976 angles, J2000 to date. Independent evaluation of the IERS polynomials. */
export function precessionAngles(instant: number) {
  const t = daysSinceJ2000(instant) / 36525,
    arcsec = RAD / 3600;
  return {
    zeta: (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * arcsec,
    z: (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * arcsec,
    theta: (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * arcsec,
  };
}

/** Column-major matrix for shader: horizontal world direction -> J2000 xyz.
 * J2000 xyz is RA=0, RA=6h, north pole. Ignores nutation, aberration and proper
 * motion: this is a naked-eye sky, not an astrometry instrument.
 * Caller supplies storage so the frame update never allocates a matrix.
 */
export function worldToJ2000Matrix(
  instant: number,
  out: Float32Array,
  latitude = STRAHOV_LOCATION.latitude,
  longitude = STRAHOV_LOCATION.longitude,
) {
  const sidereal = localSiderealAngle(instant, longitude),
    lat = latitude * RAD;
  const cs = Math.cos(sidereal),
    ss = Math.sin(sidereal),
    cp = Math.cos(lat),
    sp = Math.sin(lat);
  const { zeta, z, theta } = precessionAngles(instant);
  const ca = Math.cos(zeta),
    sa = Math.sin(zeta),
    cb = Math.cos(z),
    sb = Math.sin(z),
    ct = Math.cos(theta),
    st = Math.sin(theta);
  // Invert the precession rotations, then change horizontal basis to equatorial.
  for (let axis = 0; axis < 3; axis++) {
    const ex = axis === 0 ? -ss : axis === 1 ? cp * cs : sp * cs;
    const ey = axis === 0 ? cs : axis === 1 ? cp * ss : sp * ss;
    const ez = axis === 0 ? 0 : axis === 1 ? sp : -cp;
    const x1 = cb * ex + sb * ey,
      y1 = -sb * ex + cb * ey;
    const x2 = ct * x1 + st * ez,
      z2 = -st * x1 + ct * ez;
    out[axis * 3] = ca * x2 + sa * y1;
    out[axis * 3 + 1] = -sa * x2 + ca * y1;
    out[axis * 3 + 2] = z2;
  }
  return out;
}
