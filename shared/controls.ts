/** Camera-relative WASD in the game's right-handed Y-up scene (x east, z south).
 * forward=(sin yaw,0,cos yaw); screen-right=forward × up=(-cos yaw,0,sin yaw).
 * Rapier steering +1 turns toward local +X, which is screen-left when facing +Z.
 */
export function movementFromKeys(
  forward: number,
  right: number,
  yaw: number,
  vehicle = false,
) {
  if (vehicle) return { x: -right, z: forward };
  return {
    x: Math.sin(yaw) * forward - Math.cos(yaw) * right,
    z: Math.cos(yaw) * forward + Math.sin(yaw) * right,
  };
}
/** Follow the vehicle's shortest heading arc, independent of render FPS. */
export function vehicleChaseYaw(current: number, target: number, dt: number) {
  if (!Number.isFinite(current) || !Number.isFinite(target))
    return Number.isFinite(target) ? target : 0;
  const delta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + delta * -Math.expm1(-3 * Math.max(0, Math.min(0.1, dt)));
}
export const VEHICLE_CAMERA_LOOK_HOLD_MS = 3500;
/** A manual look stays put while stopped or while a drag is still held. */
export function vehicleCameraCanFollow(state: {
  driving: boolean;
  speed: number;
  nowMs: number;
  lastLookMs: number;
  orbiting: boolean;
  uiModal: boolean;
}) {
  return (
    state.driving &&
    !state.orbiting &&
    !state.uiModal &&
    Math.abs(state.speed) > 0.75 &&
    state.nowMs - state.lastLookMs >= VEHICLE_CAMERA_LOOK_HOLD_MS
  );
}
/** V changes the exterior car view without modifying the walking FP preference. */
export function nextVehicleCameraDistance(current: number) {
  return [5.5, 8, 11].find((distance) => distance > current + 0.3) ?? 5.5;
}
