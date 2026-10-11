import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";

export const STATIC_CHUNK_METRES = 96;
type Range = { indexStart: number; indexCount: number };
type Source = {
  indices: Uint32Array;
  sourceTriangles: Uint32Array;
  ranges: Range[];
  cellSizeMetres: number;
};
const sources = new WeakMap<Mesh, Source>();

/** Original runtime index master, retained separately from reordered draw data.
 * Vertex buffers and all their attributes remain the mesh's original buffers.
 */
export function staticChunkSource(mesh: Mesh) {
  return sources.get(mesh);
}

/** Whole original triangles, deterministic XZ cells, no interpolation/clipping
 * or decimation. Only primitive order changes; vertex IDs and winding do not.
 */
export function chunkStaticMesh(
  mesh: Mesh,
  cellSizeMetres = STATIC_CHUNK_METRES,
) {
  const existing = sources.get(mesh);
  if (existing) {
    if (existing.cellSizeMetres !== cellSizeMetres)
      throw new Error("Static chunk size cannot change during rendering");
    return existing;
  }
  if (!(cellSizeMetres > 0) || !Number.isFinite(cellSizeMetres))
    throw new Error("Invalid static chunk size");
  const input = mesh.getIndices(),
    positions = mesh.getVerticesData("position");
  if (!input?.length || !positions) return;
  if (
    input.length % 3 ||
    mesh.hasInstances ||
    mesh.hasThinInstances ||
    mesh.skeleton ||
    (mesh.geometry?.meshes.length ?? 0) > 1 ||
    mesh.subMeshes.some((sub) => sub.materialIndex !== 0)
  )
    throw new Error(
      "Exact static chunks require a noninstanced triangle material mesh",
    );
  const cells = new Map<
    string,
    { x: number; z: number; indices: number[]; triangles: number[] }
  >();
  let maxIndex = 0;
  for (let offset = 0; offset < input.length; offset += 3) {
    const a = input[offset],
      b = input[offset + 1],
      c = input[offset + 2];
    if (
      [a, b, c].some(
        (index) =>
          !Number.isInteger(index) ||
          index < 0 ||
          index * 3 + 2 >= positions.length,
      )
    )
      throw new Error("Invalid original static triangle index");
    maxIndex = Math.max(maxIndex, a, b, c);
    const x = Math.floor(
      (positions[a * 3] + positions[b * 3] + positions[c * 3]) /
        (3 * cellSizeMetres),
    );
    const z = Math.floor(
      (positions[a * 3 + 2] + positions[b * 3 + 2] + positions[c * 3 + 2]) /
        (3 * cellSizeMetres),
    );
    if (!Number.isFinite(x) || !Number.isFinite(z))
      throw new Error("Invalid original static triangle position");
    const key = x + ":" + z;
    const cell = cells.get(key) ?? { x, z, indices: [], triangles: [] };
    cell.indices.push(a, b, c);
    cell.triangles.push(offset / 3);
    cells.set(key, cell);
  }
  const original = new Uint32Array(input);
  const ordered = new Uint32Array(input.length);
  const sourceTriangles = new Uint32Array(input.length / 3);
  const ranges: Range[] = [];
  let indexStart = 0;
  for (const cell of [...cells.values()].sort(
    (a, b) => a.z - b.z || a.x - b.x,
  )) {
    ordered.set(cell.indices, indexStart);
    sourceTriangles.set(cell.triangles, indexStart / 3);
    ranges.push({ indexStart, indexCount: cell.indices.length });
    indexStart += cell.indices.length;
  }
  const source = { indices: original, sourceTriangles, ranges, cellSizeMetres };
  sources.set(mesh, source);
  mesh.onDisposeObservable.addOnce(() => sources.delete(mesh));
  if (ranges.length < 2) return source;
  const needs32 =
    maxIndex > 65535 ||
    input instanceof Uint32Array ||
    mesh.geometry?.getIndexBuffer()?.is32Bits;
  mesh.setIndices(needs32 ? ordered : new Uint16Array(ordered));
  mesh.releaseSubMeshes();
  for (const range of ranges) {
    const sub = new SubMesh(
      0,
      0,
      mesh.getTotalVertices(),
      range.indexStart,
      range.indexCount,
      mesh,
      mesh,
      true,
    );
    sub.updateBoundingInfo(mesh.getWorldMatrix());
  }
  mesh.metadata = {
    ...mesh.metadata,
    exactStaticSubmeshes: true,
    staticSubmeshChunks: {
      algorithm: "whole-triangle-centroid-v1",
      cellSizeMetres,
      chunks: ranges.length,
      sourceTriangles: input.length / 3,
      originalVertexBuffersPreserved: true,
      originalIndexMasterPreserved: true,
    },
  };
  return source;
}
