import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export const DEFAULT_ORBIT_DISTANCE = 8;

/** Original follow geometry, independent of camera history and collision IO. */
export function orbitCameraTarget(position: Readonly<{ x: number; y: number; z: number }>, vehicle: boolean) {
  return new Vector3(position.x, position.y + (vehicle ? 0.7 : 0.6), position.z);
}

/** Pitch is the existing height control. Callers retain their own clamp policy. */
export function orbitCameraDesired(target: Vector3, yaw: number, pitch: number, distance: number) {
  return target.add(new Vector3(-Math.sin(yaw) * distance, 2 + pitch * 4, -Math.cos(yaw) * distance));
}
