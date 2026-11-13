import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { invalidateTreeDrawRange } from "./tree-draw-cache";

import type { TreeSeasonGeometryPlan } from "./tree-season-plan";
export { createTreeSeasonGeometryPlan, type TreeSeasonGeometryPlan } from "./tree-season-plan";

/** Whole component prefix; low ranks survive longer. O(log distinct ranks),
 * zero allocations or GPU uploads. A zero count is the loader's hide signal. */
export function treeSeasonIndexCount(plan: TreeSeasonGeometryPlan, leafAmount: number): number {
  if (!Number.isFinite(leafAmount) || leafAmount < 0 || leafAmount > 1) throw new RangeError("Invalid tree leaf amount");
  const threshold = Math.floor(leafAmount * 65535);
  let low = 0, high = plan.ranks.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (plan.ranks[middle] <= threshold) low = middle + 1; else high = middle;
  }
  return low ? plan.indexEnds[low - 1] : 0;
}

type Binding = { plan: TreeSeasonGeometryPlan; subMesh: SubMesh; minimum: Vector3; maximum: Vector3; bounds: BoundingInfo };
const bindings = new WeakMap<Mesh, Binding>();

/** Geometry must already contain plan.indices, uploaded ONCE by the prototype
 * owner. Clone visibility/LOD belongs to the caller; this never toggles enabled.
 * Keep full source bounds even after clear→compute→wet or explicit refresh. */
export function applyTreeSeasonGeometry(mesh: Mesh, plan: TreeSeasonGeometryPlan, leafAmount: number): number {
  const count = treeSeasonIndexCount(plan, leafAmount);
  if (mesh.isDisposed() || mesh.getTotalVertices() !== plan.vertexCount || mesh.getTotalIndices() !== plan.indices.length || mesh.subMeshes.length !== 1)
    throw new RangeError("Tree season binding requires one live full prototype submesh");
  const subMesh = mesh.subMeshes[0];
  // Cached NCM bundles include their draw range. Validate and retire only the
  // affected commands before publishing a different seasonal index prefix.
  invalidateTreeDrawRange(mesh, subMesh, 0, count);
  let binding = bindings.get(mesh);
  if (!binding || binding.plan !== plan || binding.subMesh !== subMesh) {
    const box = mesh.getBoundingInfo().boundingBox, minimum = box.minimum.clone(), maximum = box.maximum.clone();
    binding = { plan, subMesh, minimum, maximum, bounds: new BoundingInfo(minimum, maximum) };
    bindings.set(mesh, binding);
  }
  mesh.hasVertexAlpha = false;
  subMesh.indexStart = 0; subMesh.indexCount = count;
  binding.bounds.reConstruct(binding.minimum, binding.maximum, mesh.computeWorldMatrix());
  subMesh.setBoundingInfo(binding.bounds);
  return count;
}
