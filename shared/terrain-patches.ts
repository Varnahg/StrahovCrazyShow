import raw from "./data/north-court-terrain-patch.json";
import entryGrade from "./data/cad-buildings/b06-entry-grade.json";
import b01EntryGrade from "./data/cad-buildings/b01-entry-grade.json";
import { hasCadBuilding } from "./cad-buildings";

/** Preserve the existing court dataset and its public identity. */
export const TERRAIN_PATCH = raw;
export const B6_ENTRY_GRADE = entryGrade;
export const B1_ENTRY_GRADE = b01EntryGrade;
type Point = [number, number];
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type TerrainPatchDataset = {
  bounds: Bounds;
  sourceGrid: { minX: number; minZ: number; step: number };
  positions: number[];
  indices: number[];
  cells: { column: number; row: number; firstIndex: number; indexCount: number }[];
};
type Triangle = { points: Point[]; heights: number[]; minX: number; maxX: number; minZ: number; maxZ: number; den: number };

function compilePatch(data: TerrainPatchDataset) {
  const cells = new Map<string, Triangle[]>(), pointsByCell = new Map<string, Point[][]>();
  if (!(data.sourceGrid.step > 0) || ![...Object.values(data.bounds), ...Object.values(data.sourceGrid)].every(Number.isFinite) ||
    data.positions.length % 3 || data.indices.length % 3 || !data.positions.every(Number.isFinite)) throw new Error("Invalid terrain patch buffers");
  for (const cell of data.cells) {
    const key = cell.column + ":" + cell.row;
    if (cells.has(key) || ![cell.column, cell.row, cell.firstIndex, cell.indexCount].every(Number.isSafeInteger) || cell.firstIndex < 0 || cell.firstIndex % 3 || cell.indexCount <= 0 || cell.indexCount % 3 || cell.firstIndex + cell.indexCount > data.indices.length) throw new Error("Invalid terrain patch cell");
    const triangles: Triangle[] = [];
    for (let i = cell.firstIndex; i < cell.firstIndex + cell.indexCount; i += 3) {
      const indices = data.indices.slice(i, i + 3);
      if (!indices.every(index => Number.isInteger(index) && index >= 0 && index < data.positions.length / 3)) throw new Error("Invalid terrain patch index");
      const vertices = indices.map(index => data.positions.slice(index * 3, index * 3 + 3));
      const points = vertices.map(p => [p[0], p[2]] as Point), [a, b, c] = points;
      const den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      if (!Number.isFinite(den) || den === 0) throw new Error("Degenerate terrain patch triangle");
      triangles.push({ points, heights: vertices.map(p => p[1]), minX: Math.min(...points.map(p => p[0])), maxX: Math.max(...points.map(p => p[0])),
        minZ: Math.min(...points.map(p => p[1])), maxZ: Math.max(...points.map(p => p[1])), den });
    }
    cells.set(key, triangles); pointsByCell.set(key, triangles.map(triangle => triangle.points));
  }
  function height(x: number, z: number): number | undefined {
    const b = data.bounds;
    if (x < b.minX - 1e-8 || x > b.maxX + 1e-8 || z < b.minZ - 1e-8 || z > b.maxZ + 1e-8) return undefined;
    const step = data.sourceGrid.step;
    // Same boundary-cell selection and barycentric tolerances as the original
    // north-court helper; activating B6 never changes that dataset's sampling.
    const column = Math.min(Math.round((b.maxX - data.sourceGrid.minX) / step) - 1, Math.floor((x - data.sourceGrid.minX) / step));
    const row = Math.min(Math.round((b.maxZ - data.sourceGrid.minZ) / step) - 1, Math.floor((z - data.sourceGrid.minZ) / step));
    const keys = [column + ":" + row];
    // A combined entry dataset can have disconnected cell islands. Its inner
    // island's exact max grid edge must still sample its own boundary, even
    // when the next cell is absent. The original court's selected cells stay
    // first, preserving its existing values and boundary semantics.
    if (!cells.has(keys[0])) {
      const onX = Number.isInteger((x - data.sourceGrid.minX) / step), onZ = Number.isInteger((z - data.sourceGrid.minZ) / step);
      if (onX) keys.push((column - 1) + ":" + row);
      if (onZ) keys.push(column + ":" + (row - 1));
      if (onX && onZ) keys.push((column - 1) + ":" + (row - 1));
    }
    for (const key of keys) for (const t of cells.get(key) ?? []) {
      if (x < t.minX - 1e-8 || x > t.maxX + 1e-8 || z < t.minZ - 1e-8 || z > t.maxZ + 1e-8) continue;
      const [a, b, c] = t.points;
      const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / t.den;
      const v = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / t.den, w = 1 - u - v;
      if (u >= -1e-7 && v >= -1e-7 && w >= -1e-7) return u * t.heights[0] + v * t.heights[1] + w * t.heights[2];
    }
    return undefined;
  }
  return { data, cells, pointsByCell, height };
}

/** Index immutable TINs once. Conditional activation changes only which
 * already-indexed cells participate, never the original court semantics. */
export function createTerrainPatchLookup(entries: readonly { data: TerrainPatchDataset; enabled?: () => boolean }[]) {
  const patches = entries.map(entry => ({ ...compilePatch(entry.data), enabled: entry.enabled ?? (() => true) }));
  const owners = new Set<string>();
  for (const patch of patches) for (const key of patch.cells.keys()) {
    if (owners.has(key)) throw new Error("Overlapping canonical terrain patch cells"); owners.add(key);
  }
  return {
    cellTriangles(column: number, row: number): Point[][] | undefined {
      const key = column + ":" + row;
      for (const patch of patches) if (patch.enabled() && patch.pointsByCell.has(key)) return patch.pointsByCell.get(key);
      return undefined;
    },
    intersects(minX: number, maxX: number, minZ: number, maxZ: number) {
      return patches.some(patch => {
        const b = patch.data.bounds;
        return patch.enabled() && minX < b.maxX && maxX > b.minX && minZ < b.maxZ && maxZ > b.minZ;
      });
    },
    height(x: number, z: number) {
      for (const patch of patches) if (patch.enabled()) { const y = patch.height(x, z); if (y !== undefined) return y; }
      return undefined;
    },
  };
}

const lookup = createTerrainPatchLookup([
  { data: raw },
  { data: b01EntryGrade, enabled: () => hasCadBuilding("53929063") },
  { data: entryGrade, enabled: () => hasCadBuilding("53929071") },
]);
/** Canonical local triangles replace their original source-grid cells. */
export function terrainPatchCellTriangles(column: number, row: number) { return lookup.cellTriangles(column, row); }
export function terrainPatchIntersects(minX: number, maxX: number, minZ: number, maxZ: number) { return lookup.intersects(minX, maxX, minZ, maxZ); }
export function terrainPatchHeight(x: number, z: number) { return lookup.height(x, z); }
