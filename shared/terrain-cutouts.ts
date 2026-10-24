import earcut, { deviation } from "earcut";

export type TerrainCutoutPoint = readonly [number, number];
export type TerrainCutoutVertex = [number, number, number];
export type TerrainCutoutPolygon = {
  /** Simple outer ring followed by disjoint holes; either winding is accepted. */
  readonly loops: readonly (readonly TerrainCutoutPoint[])[];
};
export type TerrainCutoutBounds = {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
};
type HalfPlane = { readonly x: number; readonly z: number; readonly nx: number; readonly nz: number };
type Cutter = {
  readonly bounds: TerrainCutoutBounds;
  readonly edges: readonly HalfPlane[];
};
type CompiledPolygon = {
  readonly bounds: TerrainCutoutBounds;
  readonly triangles: readonly Cutter[];
};
export type CompiledTerrainCutouts = {
  readonly bounds: TerrainCutoutBounds | null;
  readonly polygons: readonly CompiledPolygon[];
};

// Metres, not a fixed cross-product threshold. An edge of length L therefore
// has a cross-product tolerance L * EPSILON, even for tiny earcut triangles.
const EPSILON = 1e-9;
const cross = (a: TerrainCutoutPoint, b: TerrainCutoutPoint, c: TerrainCutoutPoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const xz = (p: TerrainCutoutVertex): TerrainCutoutPoint => [p[0], p[2]];
const samePoint = (a: TerrainCutoutPoint, b: TerrainCutoutPoint) => a[0] === b[0] && a[1] === b[1];

function boundsOf(points: readonly TerrainCutoutPoint[]): TerrainCutoutBounds {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}
function overlaps(a: TerrainCutoutBounds, b: TerrainCutoutBounds) {
  // Mere edge/vertex contact removes no area and needs no clipping.
  return a.maxX > b.minX && b.maxX > a.minX && a.maxZ > b.minZ && b.maxZ > a.minZ;
}
function signedArea2(points: readonly TerrainCutoutPoint[]) {
  let area = 0;
  for (let i = 1; i + 1 < points.length; i++) area += cross(points[0], points[i], points[i + 1]);
  return area;
}
function hasArea(points: readonly TerrainCutoutPoint[]) {
  if (points.length < 3) return false;
  let longest = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    longest = Math.max(longest, Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const area = Math.abs(signedArea2(points));
  if (!Number.isFinite(area) || !Number.isFinite(longest)) throw new RangeError("Terrain geometry exceeds finite arithmetic");
  return area > longest * EPSILON;
}
function cleanRing(ring: readonly TerrainCutoutPoint[]) {
  const points: TerrainCutoutPoint[] = [];
  for (const point of ring) {
    if (point.length !== 2 || !point.every(Number.isFinite)) throw new TypeError("Cutout coordinates must be finite XZ pairs");
    if (!points.length || !samePoint(points.at(-1)!, point)) points.push([point[0], point[1]]);
  }
  if (points.length > 1 && samePoint(points[0], points.at(-1)!)) points.pop();
  if (!hasArea(points)) throw new RangeError("Cutout rings need a non-degenerate projected area");
  return points;
}

/** Compile once per immutable set of footprints, shared by render and physics.
 * Input rings must be simple, with non-overlapping holes strictly inside the
 * outer ring. Repeated closing/adjacent vertices are normalized. Coordinates,
 * non-degenerate rings and triangulated area are checked; this is not a general
 * polygon repair tool. No caller-owned coordinates are retained or modified.
 */
export function compileTerrainCutouts(polygons: readonly TerrainCutoutPolygon[]): CompiledTerrainCutouts {
  const compiled: CompiledPolygon[] = [];
  let union: TerrainCutoutBounds | null = null;
  for (const polygon of polygons) {
    if (!polygon.loops.length) throw new RangeError("A cutout needs an outer ring");
    const rings = polygon.loops.map(cleanRing), points = rings.flat(), holes: number[] = [];
    let offset = rings[0].length;
    for (const ring of rings.slice(1)) { holes.push(offset); offset += ring.length; }
    // Earcut works in local coordinates to avoid cancellation in large world
    // offsets. The compiled half-planes keep the actual world coordinates.
    const origin = points[0], flat = points.flatMap(([x, z]) => [x - origin[0], z - origin[1]]);
    if (!flat.every(Number.isFinite)) throw new RangeError("Cutout coordinates exceed finite arithmetic");
    const indices = earcut(flat, holes, 2);
    const expectedArea = Math.abs(signedArea2(rings[0])) - rings.slice(1).reduce((sum, ring) => sum + Math.abs(signedArea2(ring)), 0);
    const error = deviation(flat, holes, 2, indices);
    if (!(expectedArea > 0) || !indices.length || !Number.isFinite(error) || error > 1e-8) throw new RangeError("Cutout rings could not be triangulated consistently");
    const triangles: Cutter[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      const triangle = [points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]];
      if (!hasArea(triangle)) continue;
      if (cross(triangle[0], triangle[1], triangle[2]) < 0) [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
      const edges = triangle.map((a, edge) => {
        const b = triangle[(edge + 1) % 3], dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
        return { x: a[0], z: a[1], nx: -dz / length, nz: dx / length };
      });
      triangles.push({ bounds: boundsOf(triangle), edges });
    }
    if (!triangles.length) throw new RangeError("Cutout has no usable triangles");
    const bounds = boundsOf(rings[0]);
    compiled.push({ bounds, triangles });
    union = union ? {
      minX: Math.min(union.minX, bounds.minX), maxX: Math.max(union.maxX, bounds.maxX),
      minZ: Math.min(union.minZ, bounds.minZ), maxZ: Math.max(union.maxZ, bounds.maxZ),
    } : bounds;
  }
  return { bounds: union, polygons: compiled };
}

function addVertex(points: TerrainCutoutVertex[], point: TerrainCutoutVertex) {
  const previous = points.at(-1);
  if (!previous || previous[0] !== point[0] || previous[2] !== point[2]) points.push(point);
}
function finishPolygon(points: TerrainCutoutVertex[]) {
  if (points.length > 1 && points[0][0] === points.at(-1)![0] && points[0][2] === points.at(-1)![2]) points.pop();
  return points;
}
function splitPolygon(polygon: TerrainCutoutVertex[], edge: HalfPlane) {
  const distances = polygon.map(p => {
    const distance = (p[0] - edge.x) * edge.nx + (p[2] - edge.z) * edge.nz;
    return Math.abs(distance) <= EPSILON ? 0 : distance;
  });
  if (distances.every(d => d >= 0)) return { inside: polygon, outside: [] };
  if (distances.every(d => d <= 0)) return { inside: [], outside: polygon };
  const inside: TerrainCutoutVertex[] = [], outside: TerrainCutoutVertex[] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length], da = distances[i], db = distances[(i + 1) % polygon.length];
    if (da >= 0) addVertex(inside, a);
    if (da <= 0) addVertex(outside, a);
    if (da * db < 0) {
      const t = Math.max(0, Math.min(1, da / (da - db)));
      const point: TerrainCutoutVertex = [a[0] * (1 - t) + b[0] * t, a[1] * (1 - t) + b[1] * t, a[2] * (1 - t) + b[2] * t];
      if (!point.every(Number.isFinite)) throw new RangeError("Terrain interpolation exceeds finite arithmetic");
      // The very same interpolated XYZ is shared by both sides of the split.
      addVertex(inside, point); addVertex(outside, point);
    }
  }
  return { inside: finishPolygon(inside), outside: finishPolygon(outside) };
}

/** Difference of a convex polygon and one CCW cutter triangle. The discarded
 * intersection must have area; otherwise preserve the original object intact.
 */
function subtractConvex(polygon: TerrainCutoutVertex[], cutter: Cutter) {
  let inside = polygon;
  const pieces: TerrainCutoutVertex[][] = [];
  for (const edge of cutter.edges) {
    const split = splitPolygon(inside, edge);
    if (hasArea(split.outside.map(xz))) pieces.push(split.outside);
    inside = split.inside;
    if (!hasArea(inside.map(xz))) return [polygon];
  }
  return pieces;
}

/** Subtract the union of compiled footprints from one terrain triangle.
 * Y is interpolated along the original planar surface, never resampled or
 * flattened. Both windings are supported. Finite XYZ triples are required;
 * zero/negligible XZ area (altitude <= 1 nm) is discarded. The compiled value
 * must come from compileTerrainCutouts and be treated as immutable.
 * A triangle with no positive-area intersection is returned by reference.
 */
export function subtractTerrainTriangle(triangle: TerrainCutoutVertex[], compiled: CompiledTerrainCutouts): TerrainCutoutVertex[][] {
  if (triangle.length !== 3 || triangle.some(p => p.length !== 3 || !p.every(Number.isFinite))) throw new TypeError("Terrain input must contain three finite XYZ vertices");
  const projected = triangle.map(xz);
  if (!hasArea(projected)) return [];
  const bounds = boundsOf(projected);
  if (!compiled.bounds || !overlaps(bounds, compiled.bounds)) return [triangle];
  let pieces = [triangle];
  for (const polygon of compiled.polygons) {
    if (!overlaps(bounds, polygon.bounds)) continue;
    for (const cutter of polygon.triangles) {
      const next: TerrainCutoutVertex[][] = [];
      for (const piece of pieces) {
        if (!overlaps(boundsOf(piece.map(xz)), cutter.bounds)) next.push(piece);
        else next.push(...subtractConvex(piece, cutter));
      }
      pieces = next;
      if (!pieces.length) return [];
    }
  }
  if (pieces.length === 1 && pieces[0] === triangle) return [triangle];
  const result: TerrainCutoutVertex[][] = [], sign = Math.sign(signedArea2(projected));
  for (const piece of pieces) for (let i = 1; i + 1 < piece.length; i++) {
    const output = [piece[0], piece[i], piece[i + 1]];
    const points = output.map(xz);
    if (!hasArea(points)) continue;
    if (Math.sign(signedArea2(points)) !== sign) [output[1], output[2]] = [output[2], output[1]];
    result.push(output);
  }
  return result;
}
