const LOOK_RADIANS_PER_PIXEL = 0.002;
const FIRST_PERSON_LIMIT = (85 * Math.PI) / 180;
const DEFAULT_PITCH = 0.28;

/** Orbit pitch is the existing camera-height control, not an angle. */
export function clampOrbitPitch(pitch: number) {
  return Math.max(
    -0.55,
    Math.min(1.1, Number.isFinite(pitch) ? pitch : DEFAULT_PITCH),
  );
}

/** First-person target is (sin(yaw), -pitch, cos(yaw)), so pitch stores the
 * tangent of the look angle. Apply mouse movement to its angle before restoring
 * that slope; otherwise looking near the zenith becomes progressively slower.
 * Staying 5 degrees from either pole keeps Babylon's upright camera basis valid. */
export function nextCameraPitch(
  pitch: number,
  deltaY: number,
  firstPerson: boolean,
) {
  const value = Number.isFinite(pitch) ? pitch : DEFAULT_PITCH;
  const delta = Number.isFinite(deltaY) ? deltaY * LOOK_RADIANS_PER_PIXEL : 0;
  if (!firstPerson) return clampOrbitPitch(value + delta);
  const angle = Math.max(
    -FIRST_PERSON_LIMIT,
    Math.min(FIRST_PERSON_LIMIT, Math.atan(value) + delta),
  );
  return Math.tan(angle);
}
