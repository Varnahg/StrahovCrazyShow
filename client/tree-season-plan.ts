export type TreeSeasonGeometryPlan = Readonly<{
  vertexCount: number;
  indices: Uint16Array | Uint32Array;
  ranks: Uint16Array;
  indexEnds: Uint32Array;
}>;

/** Stable counting sort over the bounded uint16 leaf ranks.
 * Input arrays stay unchanged and the output can be transferred from a worker. */
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
  const counts = new Uint32Array(65536);
  let groups = 0;
  for (let start = 0; start < indices.length; start += 3) {
    for (let corner = 0; corner < 3; corner++) {
      const index = indices[start + corner];
      if (!Number.isSafeInteger(index) || index < 0 || index >= vertexCount)
        throw new RangeError("Invalid tree leaf vertex index");
    }
    const rank = vertexRanks[indices[start]];
    if (rank !== vertexRanks[indices[start + 1]] || rank !== vertexRanks[indices[start + 2]])
      throw new RangeError("Tree leaf triangle crosses component ranks");
    if (!counts[rank]) groups++;
    counts[rank] += 3;
  }
  const sorted = indices instanceof Uint32Array || vertexCount > 65536 ? new Uint32Array(indices.length) : new Uint16Array(indices.length);
  const ranks = new Uint16Array(groups), indexEnds = new Uint32Array(groups);
  let end = 0, group = 0;
  for (let rank = 1; rank < 65535; rank++) {
    const size = counts[rank];
    if (!size) continue;
    counts[rank] = end;
    end += size;
    ranks[group] = rank;
    indexEnds[group++] = end;
  }
  for (let start = 0; start < indices.length; start += 3) {
    const rank = vertexRanks[indices[start]], target = counts[rank];
    sorted[target] = indices[start];
    sorted[target + 1] = indices[start + 1];
    sorted[target + 2] = indices[start + 2];
    counts[rank] += 3;
  }
  return Object.freeze({ vertexCount, indices: sorted, ranks, indexEnds });
}
