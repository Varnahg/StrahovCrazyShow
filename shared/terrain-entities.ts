import { groundHeight } from "./terrain";
import {
  multiplyQuaternions as multiply,
  rotateQuaternionVector,
} from "./quaternion";
export type GroundRotation = { x: number; y: number; z: number; w: number };
export function rotateGroundVector(
  q: GroundRotation,
  v: { x: number; y: number; z: number },
) {
  return rotateQuaternionVector(q, v);
}
/** Fit a vehicle to the mean grade at its wheelbase/track, avoiding 4m normal jumps. */
export function groundRotation(
  x: number,
  z: number,
  yaw: number,
  length = 3.56,
  width = 2.04,
  sampleHeight: (x: number, z: number) => number = groundHeight,
): GroundRotation {
  const s = Math.sin(yaw),
    c = Math.cos(yaw),
    front = sampleHeight(x + (s * length) / 2, z + (c * length) / 2),
    rear = sampleHeight(x - (s * length) / 2, z - (c * length) / 2),
    right = sampleHeight(x + (c * width) / 2, z - (s * width) / 2),
    left = sampleHeight(x - (c * width) / 2, z + (s * width) / 2);
  const pitch = -Math.atan2(front - rear, length),
    roll = Math.atan2(right - left, width);
  return multiply(
    multiply(
      { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      { x: Math.sin(pitch / 2), y: 0, z: 0, w: Math.cos(pitch / 2) },
    ),
    { x: 0, y: 0, z: Math.sin(roll / 2), w: Math.cos(roll / 2) },
  );
}
