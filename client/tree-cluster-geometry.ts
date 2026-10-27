import { TREE_CLUSTER_EXACT, TREE_CLUSTER_GROUP_LIMIT, TREE_CLUSTER_RECORD_BYTES, type TreeClusterBank } from "../shared/tree-cluster-types";

export type TreeClusterCoverage = Readonly<{
  groupCount: number;
  /** Independently decoded fallback GLB ranks. Every sentinel must match exactly. */
  exactRanks: readonly number[];
}>;
const corners = [0, 1, 2, 0, 2, 3] as const;

function rotation(view: DataView, offset: number, matrix: Float64Array) {
  const x = view.getFloat32(offset + 16, true), y = view.getFloat32(offset + 20, true), z = view.getFloat32(offset + 24, true), w = view.getFloat32(offset + 28, true);
  // Preflight accepts Float32 rounding only. Normalize that rounding, never a
  // scaled or arbitrary quaternion, so the source card's metre scale is retained.
  const s = 2 / (x * x + y * y + z * z + w * w);
  matrix[0] = 1 - s * (y * y + z * z); matrix[1] = s * (x * y - z * w); matrix[2] = s * (x * z + y * w);
  matrix[3] = s * (x * y + z * w); matrix[4] = 1 - s * (x * x + z * z); matrix[5] = s * (y * z - x * w);
  matrix[6] = s * (x * z - y * w); matrix[7] = s * (y * z + x * w); matrix[8] = 1 - s * (x * x + y * y);
}

/** Expands compact rigid groups once at load. No engine, IO, cache or frame state.
 * Requires a bank returned by parseTreeClusterBank and actual fallback ranks. */
export function decodeTreeClusterGeometry(buffer: ArrayBuffer, bank: TreeClusterBank, coverage: TreeClusterCoverage) {
  const { groupCount, exactRanks } = coverage;
  if (!Number.isSafeInteger(groupCount) || groupCount < 1 || groupCount > TREE_CLUSTER_GROUP_LIMIT || buffer.byteLength !== groupCount * TREE_CLUSTER_RECORD_BYTES)
    throw Error("Invalid tree cluster placement length");
  if (exactRanks.length > groupCount) throw Error("Invalid tree cluster fallback coverage");
  const exact = new Set<number>();
  for (const rank of exactRanks) {
    if (!Number.isInteger(rank) || rank < 1 || rank > TREE_CLUSTER_GROUP_LIMIT || exact.has(rank)) throw Error("Invalid tree cluster fallback rank");
    exact.add(rank);
  }
  const view = new DataView(buffer);
  let previous = 0, cardCount = 0, cardGroups = 0, exactCount = 0;
  // Inspect every record before allocating large vertex/index arrays. A missing
  // source group is an error rather than a sparse but apparently successful tree.
  for (let group = 0; group < groupCount; group++) {
    const offset = group * TREE_CLUSTER_RECORD_BYTES, rank = view.getUint16(offset, true), prototypeId = view.getUint16(offset + 2, true);
    if (rank <= previous || rank > TREE_CLUSTER_GROUP_LIMIT) throw Error("Tree cluster ranks must be unique sorted uint16 values");
    previous = rank;
    for (let axis = 0; axis < 3; axis++) {
      const value = view.getFloat32(offset + 4 + axis * 4, true);
      if (!Number.isFinite(value) || Math.abs(value) > 256) throw Error("Invalid root-local tree cluster anchor");
    }
    const norm = Math.hypot(view.getFloat32(offset + 16, true), view.getFloat32(offset + 20, true), view.getFloat32(offset + 24, true), view.getFloat32(offset + 28, true));
    if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-4) throw Error("Tree cluster transform must be rigid");
    if (prototypeId === TREE_CLUSTER_EXACT) {
      if (!exact.has(rank)) throw Error("Tree cluster exact group missing from fallback geometry");
      exactCount++;
    } else {
      if (exact.has(rank)) throw Error("Tree cluster group duplicated in fallback geometry");
      const prototype = bank.prototypes[prototypeId];
      if (!prototype || prototype.id !== prototypeId) throw Error("Unknown tree cluster prototype");
      cardCount += prototype.cards.length; cardGroups++;
    }
  }
  if (exactCount !== exact.size) throw Error("Tree cluster fallback has unreferenced ranks");
  const vertexCount = cardCount * 4;
  const positions = new Float32Array(vertexCount * 3), normals = new Float32Array(vertexCount * 3), uvs = new Float32Array(vertexCount * 2), colors = new Float32Array(vertexCount * 4);
  const indices = vertexCount <= 65536 ? new Uint16Array(cardCount * 6) : new Uint32Array(cardCount * 6);
  const matrix = new Float64Array(9);
  let vertexBase = 0, indexBase = 0;
  for (let group = 0; group < groupCount; group++) {
    const offset = group * TREE_CLUSTER_RECORD_BYTES, rank = view.getUint16(offset, true), prototypeId = view.getUint16(offset + 2, true);
    if (prototypeId === TREE_CLUSTER_EXACT) continue;
    rotation(view, offset, matrix);
    for (const card of bank.prototypes[prototypeId].cards) {
      for (let vertex = 0; vertex < 4; vertex++) {
        const from = vertex * 3, to = (vertexBase + vertex) * 3;
        for (let axis = 0; axis < 3; axis++) {
          const row = axis * 3;
          positions[to + axis] = view.getFloat32(offset + 4 + axis * 4, true) + matrix[row] * card.positions[from] + matrix[row + 1] * card.positions[from + 1] + matrix[row + 2] * card.positions[from + 2];
          normals[to + axis] = matrix[row] * card.normals[from] + matrix[row + 1] * card.normals[from + 1] + matrix[row + 2] * card.normals[from + 2];
        }
        uvs[(vertexBase + vertex) * 2] = card.uvs[vertex * 2]; uvs[(vertexBase + vertex) * 2 + 1] = card.uvs[vertex * 2 + 1];
        const color = (vertexBase + vertex) * 4;
        colors[color] = colors[color + 1] = colors[color + 2] = 1; colors[color + 3] = rank / 65535;
      }
      for (const corner of corners) indices[indexBase++] = vertexBase + corner;
      vertexBase += 4;
    }
  }
  return { positions, normals, uvs, colors, indices, cardGroups, exactGroups: exactCount,
    sourceBytes: buffer.byteLength,
    geometryBytes: positions.byteLength + normals.byteLength + uvs.byteLength + colors.byteLength + indices.byteLength };
}
