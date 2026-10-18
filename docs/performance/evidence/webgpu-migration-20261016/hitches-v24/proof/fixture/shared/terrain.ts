import raw from "./data/terrain-grid.json";
import realityRaw from "./data/reality-ground.json";
import {terrainPatchCellTriangles,terrainPatchHeight,terrainPatchIntersects} from "./terrain-patches";

export type GroundPoint = [number, number];
export type GroundBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
export type GroundRect = { x: number; z: number; w: number; d: number };
export type TerrainTile = {
  nrows: number;
  ncols: number;
  heights: Float32Array;
  scale: { x: number; y: number; z: number };
  translation: { x: number; y: number; z: number };
  /** Cropped grid-edge strip: use this exact mesh, not its corner heightfield. */
  mesh?: TerrainMeshData;
};
export type TerrainMeshData = {
  positions: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
};
export const TERRAIN = raw;
export const REALITY_GROUND = realityRaw;
export const PARKING_SLOTS = realityRaw.parkingSlots;
const grid = TERRAIN.grid;
export const TERRAIN_REFERENCE_BPV = TERRAIN.reference.absoluteHeight;
const flat = { minX: -12, maxX: 20, minZ: -96, maxZ: -16 };

function sourceVertex(column: number, row: number) {
  return TERRAIN.heights[row * grid.columns + column] - TERRAIN_REFERENCE_BPV;
}
function adaptedVertex(column: number, row: number) {
  const x = grid.minX + column * grid.step,
    z = grid.minZ + row * grid.step;
  const distance = Math.max(
    flat.minX - x,
    x - flat.maxX,
    flat.minZ - z,
    z - flat.maxZ,
    0,
  );
  // This explicit foundation adaptation keeps the existing schematic B6 floor
  // and basement navigable. Raw DMR samples remain unchanged in the source JSON.
  const weight = Math.min(1, distance / 4);
  return sourceVertex(column, row) * weight;
}
const adapted = new Float32Array(grid.rows * grid.columns);
for (let row = 0; row < grid.rows; row++)
  for (let column = 0; column < grid.columns; column++)
    adapted[row * grid.columns + column] = adaptedVertex(column, row);

function sample(x: number, z: number, source: boolean) {
  const gx = Math.max(
      0,
      Math.min(grid.columns - 1, (x - grid.minX) / grid.step),
    ),
    gz = Math.max(0, Math.min(grid.rows - 1, (z - grid.minZ) / grid.step));
  const column = Math.min(grid.columns - 2, Math.floor(gx)),
    row = Math.min(grid.rows - 2, Math.floor(gz)),
    u = gx - column,
    v = gz - row;
  const at = (c: number, r: number) =>
    source ? sourceVertex(c, r) : adapted[r * grid.columns + c];
  const nw = at(column, row),
    ne = at(column + 1, row),
    sw = at(column, row + 1),
    se = at(column + 1, row + 1);
  // Rapier's default heightfield diagonal is NE--SW, NOT NW--SE. This exact
  // triangle interpolation is also used by the ground mesh and draped surfaces.
  return u + v <= 1
    ? nw + u * (ne - nw) + v * (sw - nw)
    : se + (1 - u) * (sw - se) + (1 - v) * (ne - se);
}
/** Previous foundation-adapted DMR, retained for source-delta verification. */
export const legacyGroundHeight = (x:number,z:number)=>sample(x,z,false);
export const groundHeight = (x: number, z: number) => terrainPatchHeight(x,z)??sample(x, z, false);
export const sourceGroundHeight = (x: number, z: number) => sample(x, z, true);
export function isRealityGroundSurface(x: number, z: number) {
  return REALITY_GROUND.surfaces.some((surface) => {
    const ring = surface.points;
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i],
        b = ring[j];
      if (
        a[1] > z !== b[1] > z &&
        x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
      )
        inside = !inside;
    }
    return inside;
  });
}
export function groundNormal(x: number, z: number) {
  const e = 0.025,
    dx = (groundHeight(x + e, z) - groundHeight(x - e, z)) / (2 * e),
    dz = (groundHeight(x, z + e) - groundHeight(x, z - e)) / (2 * e),
    length = Math.hypot(dx, 1, dz);
  return { x: -dx / length, y: 1 / length, z: -dz / length };
}

/** Horizontal building anchor. Keep roofs/window bands planar; render a skirt
 * down to the terrain at the perimeter instead of bending the whole building.
 * Median samples resist one sharp embankment corner. It is a game foundation,
 * not a surveyed finished-floor/threshold elevation.
 */
export function buildingBaseHeight(points: GroundPoint[]) {
  if (!points.length) return 0;
  const values = points
    .map(([x, z]) => groundHeight(x, z))
    .sort((a, b) => a - b);
  const i = Math.floor(values.length / 2);
  return values.length % 2 ? values[i] : (values[i - 1] + values[i]) / 2;
}

function axisTiles(min: number, max: number, origin: number, cells: number) {
  const entries: { min: number; max: number; cells: number }[] = [];
  let next = origin + Math.ceil((min - origin) / grid.step - 1e-8) * grid.step;
  if (next > min + 1e-6) {
    const end = Math.min(next, max);
    entries.push({ min, max: end, cells: 1 });
    min = end;
  }
  while (min + grid.step <= max + 1e-6) {
    const count = Math.min(cells, Math.floor((max - min) / grid.step + 1e-7));
    next = min + count * grid.step;
    entries.push({ min, max: next, cells: count });
    min = next;
  }
  if (min < max - 1e-6) entries.push({ min, max, cells: 1 });
  return entries;
}

/** The caller supplies the SAME ground rectangles as physics/rendering,
 * including the B6 basement exclusion. No implicit global collider closes it.
 * Interior grid edges align to the source grid. A clipped edge strip contains
 * an exact mesh: its original diagonal cannot be represented by one cropped
 * rectangular heightfield without subtly changing the surface.
 */
export function createTerrainTiles(
  rects: GroundRect[],
  bounds: GroundBounds,
  tileCells = 8,
) {
  const tiles: TerrainTile[] = [];
  for (const rect of rects) {
    const minX = Math.max(rect.x - rect.w / 2, bounds.minX, grid.minX),
      maxX = Math.min(rect.x + rect.w / 2, bounds.maxX, grid.maxX),
      minZ = Math.max(rect.z - rect.d / 2, bounds.minZ, grid.minZ),
      maxZ = Math.min(rect.z + rect.d / 2, bounds.maxZ, grid.maxZ);
    if (minX >= maxX || minZ >= maxZ) continue;
    for (const xs of axisTiles(minX, maxX, grid.minX, tileCells))
      for (const zs of axisTiles(minZ, maxZ, grid.minZ, tileCells)) {
        const heights = new Float32Array((xs.cells + 1) * (zs.cells + 1));
        for (let column = 0; column <= xs.cells; column++)
          for (let row = 0; row <= zs.cells; row++)
            heights[column * (zs.cells + 1) + row] = groundHeight(
              xs.min + (column / xs.cells) * (xs.max - xs.min),
              zs.min + (row / zs.cells) * (zs.max - zs.min),
            );
        const aligned = (value: number, origin: number) =>
          Math.abs(
            (value - origin) / grid.step -
              Math.round((value - origin) / grid.step),
          ) < 1e-7;
        const mesh =
          aligned(xs.min, grid.minX) &&
          aligned(xs.max, grid.minX) &&
          aligned(zs.min, grid.minZ) &&
          aligned(zs.max, grid.minZ)
            && !terrainPatchIntersects(xs.min,xs.max,zs.min,zs.max) ? undefined
            : drapeTriangles(
                [
                  [xs.min, zs.min],
                  [xs.max, zs.min],
                  [xs.max, zs.max],
                  [xs.min, zs.max],
                ],
                [0, 1, 3, 3, 1, 2],
              );
        tiles.push({
          nrows: zs.cells,
          ncols: xs.cells,
          heights,
          scale: { x: xs.max - xs.min, y: 1, z: zs.max - zs.min },
          translation: {
            x: (xs.min + xs.max) / 2,
            y: 0,
            z: (zs.min + zs.max) / 2,
          },
          mesh,
        });
      }
  }
  return tiles;
}

export function terrainMeshData(tiles: TerrainTile[]): TerrainMeshData {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  for (const tile of tiles) {
    const offset = positions.length / 3;
    if (tile.mesh) {
      positions.push(...tile.mesh.positions);
      normals.push(...tile.mesh.normals);
      uvs.push(...tile.mesh.uvs);
      indices.push(...tile.mesh.indices.map((index) => index + offset));
      continue;
    }
    for (let row = 0; row <= tile.nrows; row++)
      for (let col = 0; col <= tile.ncols; col++) {
        const x =
            tile.translation.x -
            tile.scale.x / 2 +
            (col / tile.ncols) * tile.scale.x,
          z =
            tile.translation.z -
            tile.scale.z / 2 +
            (row / tile.nrows) * tile.scale.z;
        positions.push(x, tile.heights[col * (tile.nrows + 1) + row], z);
        const normal = groundNormal(x, z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(x / 4, z / 4);
      }
    for (let row = 0; row < tile.nrows; row++)
      for (let col = 0; col < tile.ncols; col++) {
        const nw = offset + row * (tile.ncols + 1) + col,
          ne = nw + 1,
          sw = nw + tile.ncols + 1,
          se = sw + 1;
        // Same winding as Babylon CreateGround in the RH scene; normals +Y.
        indices.push(nw, ne, sw, sw, ne, se);
      }
  }
  return { positions, normals, indices, uvs };
}

/** One exact shared collision mesh is a simpler integration alternative to
 * hybrid heightfield/edge tiles. Rapier uses mathematical upward winding,
 * whereas Babylon RH ground data uses clockwise indices with explicit normals.
 */
export function terrainCollisionData(tiles: TerrainTile[]) {
  const data = terrainMeshData(tiles),
    indices = new Uint32Array(data.indices);
  for (let i = 0; i < indices.length; i += 3)
    [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
  return { vertices: new Float32Array(data.positions), indices };
}

function cross(a: GroundPoint, b: GroundPoint, c: GroundPoint) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function clipConvex(subject: GroundPoint[], clip: GroundPoint[]) {
  let points = subject;
  for (let edge = 0; edge < clip.length && points.length; edge++) {
    const a = clip[edge],
      b = clip[(edge + 1) % clip.length],
      input = points;
    // The new local breaklines can create short edges. A fixed CROSS-PRODUCT
    // epsilon expands those tiny triangles by centimetres; use a metric edge
    // distance tolerance instead so separate red/green surfaces cannot overlap.
    const edgeLength=Math.hypot(b[0]-a[0],b[1]-a[1]);
    if(edgeLength<1e-12)continue;
    const epsilon=edgeLength*1e-9;
    points = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i],
        q = input[(i + 1) % input.length],
        dp = cross(a, b, p),
        dq = cross(a, b, q),
        pin = dp >= -epsilon,
        qin = dq >= -epsilon;
      if (pin) points.push(p);
      if (pin !== qin) {
        // Near-boundary epsilon classifications can differ even when both
        // signed distances have the same sign. Never extrapolate the segment.
        const t = Math.max(0,Math.min(1,dp / (dp - dq)));
        points.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return points;
}

/** Intersect every polygon triangle with the underlying 4m terrain triangles.
 * Unlike merely sampling a parking polygon's corners, this cannot span across
 * a ridge or bury the middle of a large asphalt surface. Hole triangulation is
 * the caller's job (e.g. earcut); existing street polygons retain their holes.
 */
export function drapeTriangles(
  points: GroundPoint[],
  triangles: ArrayLike<number>,
  offset = 0,
): TerrainMeshData {
  const positions: number[] = [],
    normals: number[] = [],
    indices: number[] = [],
    uvs: number[] = [];
  for (let index = 0; index < triangles.length; index += 3) {
    const subject = [
      points[triangles[index]],
      points[triangles[index + 1]],
      points[triangles[index + 2]],
    ];
    const minX = Math.max(
        0,
        Math.floor(
          (Math.min(...subject.map((p) => p[0])) - grid.minX) / grid.step,
        ),
      ),
      maxX = Math.min(
        grid.columns - 2,
        Math.floor(
          (Math.max(...subject.map((p) => p[0])) - grid.minX) / grid.step,
        ),
      ),
      minZ = Math.max(
        0,
        Math.floor(
          (Math.min(...subject.map((p) => p[1])) - grid.minZ) / grid.step,
        ),
      ),
      maxZ = Math.min(
        grid.rows - 2,
        Math.floor(
          (Math.max(...subject.map((p) => p[1])) - grid.minZ) / grid.step,
        ),
      );
    for (let row = minZ; row <= maxZ; row++)
      for (let column = minX; column <= maxX; column++) {
        const x = grid.minX + column * grid.step,
          z = grid.minZ + row * grid.step;
        const nw: GroundPoint = [x, z],
          ne: GroundPoint = [x + grid.step, z],
          sw: GroundPoint = [x, z + grid.step],
          se: GroundPoint = [x + grid.step, z + grid.step];
        for (const triangle of terrainPatchCellTriangles(column,row)??[
          [nw, ne, sw],
          [sw, ne, se],
        ]) {
          const polygon = clipConvex(subject, triangle);
          if (polygon.length < 3) continue;
          for (let fan = 1; fan < polygon.length - 1; fan++) {
            const vertices = [polygon[0], polygon[fan], polygon[fan + 1]];
            // Millimetre-scale slivers arise at rounded OSM hole boundaries.
            // They are below the source precision and cause unstable pixels.
            if (Math.abs(cross(vertices[0], vertices[1], vertices[2])) < 2e-6)
              continue;
            const start = positions.length / 3;
            if (cross(vertices[0], vertices[1], vertices[2]) < 0)
              [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
            for (const [vx, vz] of vertices) {
              positions.push(vx, groundHeight(vx, vz) + offset, vz);
              const normal = groundNormal(vx, vz);
              normals.push(normal.x, normal.y, normal.z);
              uvs.push(vx / 4, vz / 4);
            }
            indices.push(start, start + 1, start + 2);
          }
        }
      }
  }
  return { positions, normals, indices, uvs };
}
