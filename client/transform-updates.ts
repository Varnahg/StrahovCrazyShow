import { Quaternion, type Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Exact writes only. Preserve signed zero and never quantize moving poses. */
export function writeVector3(target: Vector3, x: number, y: number, z: number) {
  if (
    Object.is(target.x, x) &&
    Object.is(target.y, y) &&
    Object.is(target.z, z)
  )
    return false;
  target.set(x, y, z);
  return true;
}

/** Retain the node's own quaternion; never alias the caller's scratch storage.
 * Assign it through Babylon's public setter only when changed, preserving the
 * setter's Euler reset and transform invalidation on an actual update.
 */
export function writeQuaternion(
  node: TransformNode,
  value: { x: number; y: number; z: number; w: number },
) {
  const current = node.rotationQuaternion;
  if (
    current &&
    Object.is(current.x, value.x) &&
    Object.is(current.y, value.y) &&
    Object.is(current.z, value.z) &&
    Object.is(current.w, value.w) &&
    Object.is(node.rotation.x, 0) &&
    Object.is(node.rotation.y, 0) &&
    Object.is(node.rotation.z, 0)
  )
    return false;
  const rotation = current ?? new Quaternion();
  rotation.copyFromFloats(value.x, value.y, value.z, value.w);
  node.rotationQuaternion = rotation;
  return true;
}
