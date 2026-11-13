import { parseTreeClusterBank, TREE_CLUSTER_EXACT, TREE_CLUSTER_GROUP_LIMIT, TREE_CLUSTER_RECORD_BYTES, type TreeClusterBank, type TreeClusterCard } from "../shared/tree-cluster-types";

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

function validatePlacements(buffer: ArrayBuffer, bank: TreeClusterBank, coverage: TreeClusterCoverage) {
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
  return { view, cardCount, cardGroups, exactCount };
}

/** Expands compact rigid groups once at load. No engine, IO, cache or frame state.
 * Requires a bank returned by parseTreeClusterBank and actual fallback ranks. */
export function decodeTreeClusterGeometry(buffer: ArrayBuffer, bank: TreeClusterBank, coverage: TreeClusterCoverage) {
  const { view, cardCount, cardGroups, exactCount } = validatePlacements(buffer, bank, coverage);
  const { groupCount } = coverage;
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


export type FarTriangleAtlas = Readonly<{
  material: TreeClusterBank;
  cards: readonly (readonly TreeClusterCard[])[];
}>;

const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid FAR triangle atlas object");
  return value as Record<string, unknown>;
};
function vector(value: unknown, length: number, low: number, high: number) {
  if (!Array.isArray(value) || value.length !== length) throw Error("Invalid FAR triangle vector");
  const values = Array.from(value);
  if (values.some(n => typeof n !== "number" || !Number.isFinite(n) || n < low || n > high))
    throw Error("Invalid FAR triangle vector");
  return Object.freeze(values as number[]);
}
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: readonly number[], b: readonly number[]) =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Preserve the v1 rectangular bank validator. The optional visual bank must
 * be a coplanar, same-winding replacement for each pinned source rectangle. */
export function parseFarTriangleAtlas(value: unknown, source: TreeClusterBank, sourceSha256: string): FarTriangleAtlas {
  const raw = record(value);
  if (raw.version !== 1 || raw.sourceBankSha256 !== sourceSha256 || !Array.isArray(raw.prototypes) ||
    raw.prototypes.length !== source.prototypes.length) throw Error("Invalid FAR triangle atlas identity");
  const material = parseTreeClusterBank({ ...source, textures: raw.textures });
  const cards = source.prototypes.map((prototype, id) => {
    const group = record((raw.prototypes as unknown[])[id]);
    if (group.id !== id || !Array.isArray(group.cards) || group.cards.length !== prototype.cards.length)
      throw Error("Invalid FAR triangle group identity");
    return Object.freeze(prototype.cards.map((quad, i) => {
      const item = record((group.cards as unknown[])[i]);
      const positions = vector(item.positions, 9, -4, 4), uvs = vector(item.uvs, 6, 0, 1);
      const original = quad.positions.slice(0, 3), normal = quad.normals.slice(0, 3);
      const edges = (offset: number) => [0, 1, 2].map(k => positions[offset + k] - positions[k]);
      const quadEdges = (offset: number) => [0, 1, 2].map(k => quad.positions[offset + k] - original[k]);
      const quadArea = dot(cross(quadEdges(3), quadEdges(9)), normal);
      const area = dot(cross(edges(3), edges(6)), normal) / 2;
      if (!(area > 1e-9 && area < quadArea * 3) ||
        [0, 3, 6].some(offset => Math.abs(dot([0, 1, 2].map(k => positions[offset + k] - original[k]), normal)) > 1e-5) ||
        Math.abs((uvs[2] - uvs[0]) * (uvs[5] - uvs[1]) - (uvs[3] - uvs[1]) * (uvs[4] - uvs[0])) < 1e-10)
        throw Error("Invalid FAR triangle plane, winding or UV");
      return Object.freeze({ positions, uvs, normals: Object.freeze([...normal, ...normal, ...normal]) });
    }));
  });
  return Object.freeze({ material, cards: Object.freeze(cards) });
}
/** Recipe indices address the canonical stream of rectangles. Verify the
 * original groups even when no triangle of their rank enters the visual mesh. */
export function decodeFarTriangleGeometry(buffer: ArrayBuffer, bank: TreeClusterBank, coverage: TreeClusterCoverage,
  atlas: FarTriangleAtlas, recipe: ArrayBuffer) {
  const { view, cardCount } = validatePlacements(buffer, bank, coverage);
  const recordBytes = 12, maskBytes = Math.ceil(cardCount / 8), editStart = 8 + maskBytes;
  if (recipe.byteLength < editStart) throw Error("Truncated FAR triangle recipe");
  const edits = new DataView(recipe), editCount = edits.getUint32(4, true);
  if (edits.getUint32(0, true) !== cardCount || recipe.byteLength !== editStart + editCount * recordBytes)
    throw Error("Invalid FAR triangle recipe header");
  const mask = new Uint8Array(recipe, 8, maskBytes);
  const selected = (slot: number) => (mask[slot >>> 3] & (1 << (slot & 7))) !== 0;
  let count = 0;
  for (let i = 0; i < maskBytes * 8; i++) if (selected(i)) {
    if (i >= cardCount) throw Error("Invalid FAR triangle mask padding");
    count++;
  }
  if (count < 1 || count >= cardCount || editCount > count)
    throw Error("Invalid FAR triangle recipe length");
  let previous = -1;
  for (let offset = editStart; offset < edits.byteLength; offset += recordBytes) {
    const slot = edits.getUint32(offset, true), scale = edits.getUint8(offset + 4);
    const shift = Math.hypot(edits.getInt16(offset + 6, true), edits.getInt16(offset + 8, true), edits.getInt16(offset + 10, true));
    if (slot <= previous || slot >= cardCount || !selected(slot) || !scale || scale > 48 || edits.getUint8(offset + 5) ||
      shift > 181) throw Error("Invalid FAR triangle recipe record");
    previous = slot;
  }
  const vertices = count * 3, positions = new Float32Array(vertices * 3), normals = new Float32Array(vertices * 3);
  const uvs = new Float32Array(vertices * 2), colors = new Float32Array(vertices * 4);
  const indices = vertices <= 65536 ? new Uint16Array(vertices) : new Uint32Array(vertices);
  const ranks: number[] = [], matrix = new Float64Array(9), shift = new Float64Array(3);
  let slot = 0, output = 0, nextEdit = editStart;
  for (let group = 0; group < coverage.groupCount; group++) {
    const offset = group * TREE_CLUSTER_RECORD_BYTES;
    const rank = view.getUint16(offset, true), id = view.getUint16(offset + 2, true);
    ranks.push(rank);
    if (id === TREE_CLUSTER_EXACT) continue;
    const quad = bank.prototypes[id].cards, triangles = atlas.cards[id];
    for (let i = 0; i < quad.length; i++, slot++) {
      if (!selected(slot)) continue;
      const edit = nextEdit < edits.byteLength && edits.getUint32(nextEdit, true) === slot ? nextEdit : undefined;
      if (edit !== undefined) nextEdit += recordBytes;
      const scale = edit === undefined ? 1 : 1 + edits.getUint8(edit + 4) / 128;
      rotation(view, offset, matrix);
      for (let axis = 0; axis < 3; axis++)
        shift[axis] = view.getFloat32(offset + 4 + axis * 4, true) +
          (edit === undefined ? 0 : edits.getInt16(edit + 6 + axis * 2, true) / 1000);
      const triangle = triangles[i], rectangle = quad[i].positions;
      for (let vertex = 0; vertex < 3; vertex++) {
        const dst = output * 3 + vertex, src = vertex * 3;
        const x = triangle.positions[src] * scale + (rectangle[0] + rectangle[6]) * (1 - scale) / 2;
        const y = triangle.positions[src + 1] * scale + (rectangle[1] + rectangle[7]) * (1 - scale) / 2;
        const z = triangle.positions[src + 2] * scale + (rectangle[2] + rectangle[8]) * (1 - scale) / 2;
        for (let axis = 0; axis < 3; axis++) {
          const r = axis * 3;
          positions[dst * 3 + axis] = shift[axis] + matrix[r] * x + matrix[r + 1] * y + matrix[r + 2] * z;
          normals[dst * 3 + axis] = matrix[r] * triangle.normals[src] +
            matrix[r + 1] * triangle.normals[src + 1] + matrix[r + 2] * triangle.normals[src + 2];
        }
        uvs[dst * 2] = triangle.uvs[vertex * 2];
        uvs[dst * 2 + 1] = triangle.uvs[vertex * 2 + 1];
        colors[dst * 4] = colors[dst * 4 + 1] = colors[dst * 4 + 2] = 1;
        colors[dst * 4 + 3] = rank / 65535;
        indices[dst] = dst;
      }
      output++;
    }
  }
  if (output !== count || nextEdit !== edits.byteLength) throw Error("FAR triangle recipe references missing cards");
  return { ranks, positions, normals, uvs, colors, indices };
}
