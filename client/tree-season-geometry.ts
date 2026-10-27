import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { invalidateTreeDrawRange } from "./tree-draw-cache";

export type TreeSeasonGeometryPlan = Readonly<{
  vertexCount: number;
  indices: Uint16Array | Uint32Array;
  ranks: Uint16Array;
  indexEnds: Uint32Array;
}>;

/** Normalized COLOR_0 RGBA from Babylon, NOT raw uint16 values. Source arrays
 * remain untouched. The returned buffers belong to the prototype loader. */
export function createTreeSeasonGeometryPlan(indices: ArrayLike<number>, colors: ArrayLike<number>): TreeSeasonGeometryPlan {
  if (!Number.isSafeInteger(colors.length) || colors.length < 0 || colors.length % 4 ||
      !Number.isSafeInteger(indices.length) || indices.length < 0 || indices.length % 3 || indices.length > 0xffffffff)
    throw new RangeError("Invalid tree-season attribute/index shape");
  const vertexCount = colors.length / 4, vertexRanks = new Uint16Array(vertexCount);
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const offset = vertex * 4, alpha = colors[offset + 3], rank = Math.round(alpha * 65535);
    if (colors[offset] !== 1 || colors[offset + 1] !== 1 || colors[offset + 2] !== 1 ||
        !Number.isFinite(alpha) || rank < 1 || rank > 65534 || Math.abs(alpha * 65535 - rank) > .002)
      throw new RangeError("Invalid normalized tree leaf rank/RGB");
    vertexRanks[vertex] = rank;
  }
  const order = new Uint32Array(indices.length / 3);
  for (let triangle = 0; triangle < order.length; triangle++) {
    const start = triangle * 3;
    for (let corner = 0; corner < 3; corner++) {
      const index = indices[start + corner];
      if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount) throw new RangeError("Invalid tree leaf vertex index");
    }
    if (vertexRanks[indices[start]] !== vertexRanks[indices[start + 1]] || vertexRanks[indices[start]] !== vertexRanks[indices[start + 2]])
      throw new RangeError("Tree leaf triangle crosses component ranks");
    order[triangle] = triangle;
  }
  order.sort((a, b) => vertexRanks[indices[a * 3]] - vertexRanks[indices[b * 3]] || a - b);
  const sorted = indices instanceof Uint32Array || vertexCount > 65536 ? new Uint32Array(indices.length) : new Uint16Array(indices.length);
  let groups = 0, previous = -1;
  for (const triangle of order) {
    const rank = vertexRanks[indices[triangle * 3]];
    if (rank !== previous) { groups++; previous = rank; }
  }
  const ranks = new Uint16Array(groups), indexEnds = new Uint32Array(groups);
  let group = -1;
  for (let n = 0; n < order.length; n++) {
    const start = order[n] * 3, rank = vertexRanks[indices[start]];
    if (group < 0 || ranks[group] !== rank) ranks[++group] = rank;
    sorted[n * 3] = indices[start]; sorted[n * 3 + 1] = indices[start + 1]; sorted[n * 3 + 2] = indices[start + 2];
    indexEnds[group] = (n + 1) * 3;
  }
  return Object.freeze({ vertexCount, indices: sorted, ranks, indexEnds });
}

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
