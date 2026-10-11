import earcut from "earcut";
import repairs from "./data/photogrammetry-ground-repairs.json";
import map from "./data/map.json";
import landcover from "./data/landcover.json";
import { B6_LAYOUT } from "./b6-interior";
import {
  STREET_SURFACES,
  STREET_FEATURES,
  isStreetSurface,
  type StreetPoint,
  type StreetMaterial,
} from "./streets";
import { drapeTriangles, sourceGroundHeight } from "./terrain";

export const PHOTOGRAMMETRY_GROUND_REPAIRS = repairs;
type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
const bounds = (points: readonly number[][]): Bounds => ({
  minX: Math.min(...points.map((p) => p[0])),
  maxX: Math.max(...points.map((p) => p[0])),
  minZ: Math.min(...points.map((p) => p[1])),
  maxZ: Math.max(...points.map((p) => p[1])),
});
const contains = (x: number, z: number, b: Bounds, pad = 0) =>
  x >= b.minX - pad &&
  x <= b.maxX + pad &&
  z >= b.minZ - pad &&
  z <= b.maxZ + pad;
function inside(x: number, z: number, ring: readonly number[][]) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (
      a[1] > z !== b[1] > z &&
      x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]
    )
      result = !result;
  }
  return result;
}
function edgeDistance(
  x: number,
  z: number,
  a: readonly number[],
  b: readonly number[],
) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    t = Math.max(
      0,
      Math.min(
        1,
        ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1),
      ),
    );
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}
const buildings = map.buildings.map((b) => ({
  points: b.points,
  bounds: bounds(b.points),
}));
const courts = landcover.areas
  .filter((a) => a.kind === "pitch")
  .map((a) => ({ points: a.points, bounds: bounds(a.points) }));
export function isGroundRepairProtected(x: number, z: number) {
  if (
    contains(x, z, B6_LAYOUT.bounds, 0.1) ||
    contains(x, z, B6_LAYOUT.lobby, 0.1) ||
    contains(x, z, {
      minX: B6_LAYOUT.entry.x - 2.1,
      maxX: B6_LAYOUT.entry.x + 2.1,
      minZ: B6_LAYOUT.entry.stepsFromZ - 0.8,
      maxZ: B6_LAYOUT.entry.landingMaxZ + 0.3,
    })
  )
    return true;
  if (repairs.protectedObjects.some((o) => contains(x, z, o.bounds)))
    return true;
  if (
    buildings.some(
      (b) =>
        contains(x, z, b.bounds, 0.1) &&
        (inside(x, z, b.points) ||
          b.points.some(
            (p, i) => i > 0 && edgeDistance(x, z, b.points[i - 1], p) < 0.1,
          )),
    )
  )
    return true;
  return courts.some(
    (b) =>
      contains(x, z, b.bounds, 0.65) &&
      (inside(x, z, b.points) ||
        b.points.some(
          (p, i) => i > 0 && edgeDistance(x, z, b.points[i - 1], p) < 0.65,
        )),
  );
}
const regions = repairs.patches.map((p) => {
  const points = p.polygon as StreetPoint[],
    a: [number, number] = [
      (points[0][0] + points[1][0]) / 2,
      (points[0][1] + points[1][1]) / 2,
    ],
    b: [number, number] = [
      (points[2][0] + points[3][0]) / 2,
      (points[2][1] + points[3][1]) / 2,
    ],
    length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return {
    ...p,
    points,
    bounds: bounds(points),
    a,
    b,
    length,
    dx: (b[0] - a[0]) / length,
    dz: (b[1] - a[1]) / length,
  };
});
function influence(x: number, z: number) {
  if (
    !regions.some((r) => contains(x, z, r.bounds, repairs.repairFeatherMetres))
  )
    return 0;
  if (isGroundRepairProtected(x, z) || !isStreetSurface(x, z)) return 0;
  let value = 0;
  for (const r of regions) {
    if (!contains(x, z, r.bounds, repairs.repairFeatherMetres)) continue;
    const dx = x - r.a[0],
      dz = z - r.a[1],
      along = dx * r.dx + dz * r.dz,
      across = Math.abs(-dx * r.dz + dz * r.dx);
    // Only the real mapped footway width. Feathering lengthens the repaired
    // interval on that same path, never widens it over grass or real curbs.
    if (across > r.widthMetres / 2 + 1e-5) continue;
    const distance = Math.max(-along, along - r.length, 0),
      t = Math.min(1, distance / repairs.repairFeatherMetres);
    value = Math.max(value, 1 - t * t * (3 - 2 * t));
  }
  return value;
}
const vertexKey = (x: number, y: number, z: number) =>
  `${Math.round(x * 100000)}:${Math.round(y * 100000)}:${Math.round(z * 100000)}`;

/** Original positions stay untouched. Only audited public pedestrian intervals
 * are eligible, never all near-ground vertices in the world. Tall objects and
 * steep triangles are retained; a shared vertex touching such a triangle is
 * protected in every duplicate of the triangle soup to avoid opening cracks.
 * Heights use RAW DMR, not B6's separate schematic foundation adaptation.
 */
export function applyPhotogrammetryGroundRepairs(
  source: Float32Array,
): Float32Array {
  if (source.length % 9)
    throw new Error("Ground repair expects original triangle-soup positions");
  const result = new Float32Array(source);
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (let i = 0; i < source.length; i += 3) {
    const x = source[i],
      y = source[i + 1],
      z = source[i + 2];
    if (!Number.isFinite(x + y + z))
      throw new Error("Nonfinite ground repair input");
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  if (
    !regions.some(
      (r) =>
        r.bounds.maxX + repairs.repairFeatherMetres >= minX &&
        r.bounds.minX - repairs.repairFeatherMetres <= maxX &&
        r.bounds.maxZ + repairs.repairFeatherMetres >= minZ &&
        r.bounds.minZ - repairs.repairFeatherMetres <= maxZ,
    )
  )
    return result;
  const candidate: number[] = [],
    protectedVertices = new Set<string>();
  for (let i = 0; i < source.length; i += 9) {
    let relevant = false,
      withinBand = true;
    for (let v = 0; v < 9; v += 3) {
      const x = source[i + v],
        y = source[i + v + 1],
        z = source[i + v + 2];
      if (!Number.isFinite(x + y + z))
        throw new Error("Nonfinite ground repair input");
      if (influence(x, z) > 0) relevant = true;
      if (Math.abs(y - sourceGroundHeight(x, z)) > repairs.nearGroundBandMetres)
        withinBand = false;
    }
    if (!relevant) continue;
    const ux = source[i + 3] - source[i],
      uy = source[i + 4] - source[i + 1],
      uz = source[i + 5] - source[i + 2],
      vx = source[i + 6] - source[i],
      vy = source[i + 7] - source[i + 1],
      vz = source[i + 8] - source[i + 2],
      nx = uy * vz - uz * vy,
      ny = uz * vx - ux * vz,
      nz = ux * vy - uy * vx,
      normalY = Math.abs(ny) / Math.hypot(nx, ny, nz);
    if (withinBand && normalY >= repairs.maxGroundNormalSlopeCos)
      candidate.push(i);
    else
      for (let v = 0; v < 9; v += 3)
        protectedVertices.add(
          vertexKey(source[i + v], source[i + v + 1], source[i + v + 2]),
        );
  }
  for (const i of candidate)
    for (let v = 0; v < 9; v += 3) {
      const index = i + v,
        x = source[index],
        y = source[index + 1],
        z = source[index + 2];
      if (protectedVertices.has(vertexKey(x, y, z))) continue;
      const weight = influence(x, z);
      if (weight > 0)
        result[index + 1] = y + (sourceGroundHeight(x, z) - y) * weight;
    }
  return result;
}
export function groundRepairStats(
  source: Float32Array,
  repaired: Float32Array,
) {
  if (source.length !== repaired.length)
    throw new Error("Ground repair changed vertex count");
  let changedVertices = 0,
    maxDeltaMetres = 0,
    changedTriangles = 0;
  for (let i = 0; i < source.length; i += 9) {
    let changed = false;
    for (let v = 0; v < 9; v += 3) {
      if (
        source[i + v] !== repaired[i + v] ||
        source[i + v + 2] !== repaired[i + v + 2]
      )
        throw new Error("Ground repair changed horizontal coordinates");
      const delta = Math.abs(source[i + v + 1] - repaired[i + v + 1]);
      if (delta > 1e-6) {
        changedVertices++;
        changed = true;
        maxDeltaMetres = Math.max(maxDeltaMetres, delta);
      }
    }
    if (changed) changedTriangles++;
  }
  return {
    changedVertices,
    changedTriangles,
    maxDeltaMetres,
    originalFilesModified: false,
    scope: "audited public footway ground only",
  };
}
type PatchPart = {
  material: StreetMaterial;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  uvs: Float32Array;
  patchIds: string[];
};
export type PhotogrammetryGroundPatchGeometry = {
  parts: PatchPart[];
  positions: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  uvs: Float32Array;
  areaSquareMetres: number;
  patchCount: number;
  provenance: typeof repairs;
};
const cross = (a: StreetPoint, b: StreetPoint, c: StreetPoint) =>
  (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function clip(subject: StreetPoint[], polygon: StreetPoint[]) {
  const signed = polygon.reduce((s, a, i) => {
      const b = polygon[(i + 1) % polygon.length];
      return s + a[0] * b[1] - b[0] * a[1];
    }, 0),
    sign = Math.sign(signed) || 1;
  let points = subject;
  for (let e = 0; e < polygon.length && points.length; e++) {
    const a = polygon[e],
      b = polygon[(e + 1) % polygon.length],
      input = points;
    points = [];
    for (let i = 0; i < input.length; i++) {
      const p = input[i],
        q = input[(i + 1) % input.length],
        dp = sign * cross(a, b, p),
        dq = sign * cross(a, b, q),
        pin = dp >= -1e-8,
        qin = dq >= -1e-8;
      if (pin) points.push(p);
      if (pin !== qin) {
        const t = dp / (dp - dq);
        points.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]);
      }
    }
  }
  return points;
}
let cached: PhotogrammetryGroundPatchGeometry | undefined;
/** Upward mathematical winding is shared verbatim with Rapier. Renderer uses
 * double-sided patch materials. Patches are clipped to existing joined street
 * polygons (including their holes), never a rectangular cover of the world.
 */
export function getPhotogrammetryGroundPatchGeometry(): PhotogrammetryGroundPatchGeometry {
  if (cached) return cached;
  const builders = new Map<
    StreetMaterial,
    {
      positions: number[];
      normals: number[];
      indices: number[];
      uvs: number[];
      patchIds: Set<string>;
    }
  >();
  let area = 0;
  for (const surface of STREET_SURFACES)
    for (const polygon of surface.polygons) {
      const pb = bounds(polygon.outer),
        points = [...polygon.outer],
        holes: number[] = [];
      for (const ring of polygon.holes) {
        holes.push(points.length);
        points.push(...ring);
      }
      const triangles = earcut(points.flat(), holes, 2);
      for (const r of regions) {
        if (
          pb.maxX < r.bounds.minX ||
          pb.minX > r.bounds.maxX ||
          pb.maxZ < r.bounds.minZ ||
          pb.minZ > r.bounds.maxZ
        )
          continue;
        let builder = builders.get(surface.material);
        if (!builder) {
          builder = {
            positions: [],
            normals: [],
            indices: [],
            uvs: [],
            patchIds: new Set(),
          };
          builders.set(surface.material, builder);
        }
        for (let i = 0; i < triangles.length; i += 3) {
          const cut = clip(
            [
              points[triangles[i]],
              points[triangles[i + 1]],
              points[triangles[i + 2]],
            ],
            r.points,
          );
          if (cut.length < 3) continue;
          const data = drapeTriangles(cut, earcut(cut.flat(), [], 2));
          for (let t = 0; t < data.indices.length; t += 3) {
            const ids = data.indices.slice(t, t + 3).map((v) => v * 3),
              cx = ids.reduce((s, v) => s + data.positions[v], 0) / 3,
              cz = ids.reduce((s, v) => s + data.positions[v + 2], 0) / 3;
            if (
              isGroundRepairProtected(cx, cz) ||
              ids.some((v) =>
                isGroundRepairProtected(
                  data.positions[v],
                  data.positions[v + 2],
                ),
              )
            )
              continue;
            const start = builder.positions.length / 3;
            for (const v of ids) {
              const x = data.positions[v],
                z = data.positions[v + 2],
                h = sourceGroundHeight(x, z),
                eps = 0.025,
                dx =
                  (sourceGroundHeight(x + eps, z) -
                    sourceGroundHeight(x - eps, z)) /
                  (2 * eps),
                dz =
                  (sourceGroundHeight(x, z + eps) -
                    sourceGroundHeight(x, z - eps)) /
                  (2 * eps),
                length = Math.hypot(dx, 1, dz);
              builder.positions.push(x, h, z);
              builder.normals.push(-dx / length, 1 / length, -dz / length);
              builder.uvs.push(x / 4, z / 4);
            }
            builder.indices.push(start, start + 2, start + 1);
            builder.patchIds.add(r.id);
            const a = ids[0],
              b = ids[1],
              c = ids[2];
            area +=
              Math.abs(
                (data.positions[b] - data.positions[a]) *
                  (data.positions[c + 2] - data.positions[a + 2]) -
                  (data.positions[b + 2] - data.positions[a + 2]) *
                    (data.positions[c] - data.positions[a]),
              ) / 2;
          }
        }
      }
    }
  const parts: PatchPart[] = [...builders]
    .filter(([, b]) => b.indices.length)
    .map(([material, b]) => {
      const positions = new Float32Array(b.positions),
        indices: number[] = [];
      for (let i = 0; i < b.indices.length; i += 3) {
        const a = b.indices[i] * 3,
          c = b.indices[i + 1] * 3,
          d = b.indices[i + 2] * 3,
          normalY =
            (positions[c + 2] - positions[a + 2]) *
              (positions[d] - positions[a]) -
            (positions[c] - positions[a]) *
              (positions[d + 2] - positions[a + 2]);
        // Polygon/DEM clipping makes microscopic coincident edge slivers.
        // Discard these AFTER Float32 conversion, so visible/native arrays
        // cannot retain a degenerate or numerically inverted support face.
        if (normalY > 1e-5)
          indices.push(b.indices[i], b.indices[i + 1], b.indices[i + 2]);
      }
      return {
        material,
        positions,
        normals: new Float32Array(b.normals),
        indices: new Uint32Array(indices),
        uvs: new Float32Array(b.uvs),
        patchIds: [...b.patchIds],
      };
    });
  const positions = new Float32Array(
      parts.reduce((s, p) => s + p.positions.length, 0),
    ),
    normals = new Float32Array(positions.length),
    uvs = new Float32Array((positions.length / 3) * 2),
    indices = new Uint32Array(parts.reduce((s, p) => s + p.indices.length, 0));
  let pv = 0,
    iv = 0;
  for (const part of parts) {
    positions.set(part.positions, pv);
    normals.set(part.normals, pv);
    uvs.set(part.uvs, (pv / 3) * 2);
    for (const i of part.indices) indices[iv++] = pv / 3 + i;
    pv += part.positions.length;
  }
  area = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3,
      b = indices[i + 1] * 3,
      c = indices[i + 2] * 3;
    area +=
      ((positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) -
        (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2])) /
      2;
  }
  cached = {
    parts,
    positions,
    normals,
    indices,
    uvs,
    areaSquareMetres: area,
    patchCount: repairs.patches.length,
    provenance: repairs,
  };
  return cached;
}
