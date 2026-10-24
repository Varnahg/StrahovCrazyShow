/** Model-local metres, Y up. Placement is a rigid Babylon-compatible Y rotation. */
export type CadPoint3 = Readonly<{ x: number; y: number; z: number }>;
export type CadPlacement = Readonly<{ translation: CadPoint3; yaw: number }>;
export type CadBoundsXZ = Readonly<{
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}>;
export type CadPlane = Readonly<{ a: number; b: number; c: number }>;
export type CadPolygon = Readonly<{
  id: string;
  bounds: CadBoundsXZ;
  /** First loop is the exterior; subsequent loops are holes. No repeated last vertex. */
  loops: readonly (readonly (readonly [number, number])[])[];
  sourcePartIds: readonly string[];
}>;
export type CadSurface = CadPolygon & Readonly<{
  partId: string;
  floor: string;
  role: "slab" | "stair" | "stair-landing" | "canopy";
  /** y = a*x + b*z + c */
  plane: CadPlane;
}>;
export type CadBuildingSite = Readonly<{
  schemaVersion: 1;
  id: string;
  sourceCollisionSha256: string;
  sourceBlendSha256: string;
  sourceGlbSha256: string;
  coordinateSystem: string;
  terrainCutouts: readonly CadPolygon[];
  supportSurfaces: readonly CadSurface[];
  coverSurfaces: readonly CadSurface[];
  derivation: Readonly<Record<string, unknown>>;
}>;
export type CadSpace = Readonly<{
  floor: string;
  support: CadSurface;
  cover: CadSurface;
  supportHeight: number;
  coverHeight: number;
}>;

export function cadLocalToWorld(point: CadPoint3, placement: CadPlacement): CadPoint3 {
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  return {
    x: placement.translation.x + c * point.x + s * point.z,
    y: placement.translation.y + point.y,
    z: placement.translation.z - s * point.x + c * point.z,
  };
}

export function cadWorldToLocal(point: CadPoint3, placement: CadPlacement): CadPoint3 {
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  const x = point.x - placement.translation.x, z = point.z - placement.translation.z;
  return {
    x: c * x - s * z,
    y: point.y - placement.translation.y,
    z: s * x + c * z,
  };
}

/** Fresh buffer owned by its caller; never changes model positions or caches placement. */
export function transformCadPositions(
  positions: ArrayLike<number>, placement: CadPlacement,
): Float32Array {
  if (positions.length % 3 !== 0 ||
      ![placement.yaw, placement.translation.x, placement.translation.y, placement.translation.z].every(Number.isFinite)) {
    throw new Error("Invalid CAD positions or placement");
  }
  const result = new Float32Array(positions.length);
  const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      throw new Error("Non-finite CAD position");
    }
    result[i] = placement.translation.x + c * x + s * z;
    result[i + 1] = placement.translation.y + y;
    result[i + 2] = placement.translation.z - s * x + c * z;
  }
  return result;
}

const EDGE_EPSILON = 1e-7;
const HEIGHT_EPSILON = 1e-5;

// 0 outside, 1 inside, 2 boundary. Hole boundaries belong to the solid edge.
function loopLocation(loop: CadPolygon["loops"][number], x: number, z: number): number {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [ax, az] = loop[j], [bx, bz] = loop[i];
    const dx = bx - ax, dz = bz - az;
    const length = Math.hypot(dx, dz);
    if (length > 0 && Math.abs(dx * (z - az) - dz * (x - ax)) <= EDGE_EPSILON * length &&
        x >= Math.min(ax, bx) - EDGE_EPSILON && x <= Math.max(ax, bx) + EDGE_EPSILON &&
        z >= Math.min(az, bz) - EDGE_EPSILON && z <= Math.max(az, bz) + EDGE_EPSILON) return 2;
    if ((az > z) !== (bz > z) && x < ax + ((z - az) * dx) / dz) inside = !inside;
  }
  return inside ? 1 : 0;
}

export function cadPolygonContainsXZ(polygon: CadPolygon, x: number, z: number): boolean {
  const b = polygon.bounds;
  if (!Number.isFinite(x) || !Number.isFinite(z) || !polygon.loops.length ||
      x < b.minX - EDGE_EPSILON || x > b.maxX + EDGE_EPSILON ||
      z < b.minZ - EDGE_EPSILON || z > b.maxZ + EDGE_EPSILON) return false;
  if (loopLocation(polygon.loops[0], x, z) === 0) return false;
  for (let i = 1; i < polygon.loops.length; i++) {
    if (loopLocation(polygon.loops[i], x, z) === 1) return false;
  }
  return true;
}

export function cadSurfaceHeightAtXZ(surface: CadSurface, x: number, z: number): number | undefined {
  if (!cadPolygonContainsXZ(surface, x, z)) return undefined;
  return surface.plane.a * x + surface.plane.b * z + surface.plane.c;
}

/** Query Actor.position (capsule centre), not feet. Jumping keeps the same covered space. */
export function cadSpaceAtLocalPosition(site: CadBuildingSite, center: CadPoint3): CadSpace | undefined {
  if (!Number.isFinite(center.y)) return undefined;
  let support: CadSurface | undefined, cover: CadSurface | undefined;
  let supportHeight = -Infinity, coverHeight = Infinity;
  for (const surface of site.supportSurfaces) {
    const height = cadSurfaceHeightAtXZ(surface, center.x, center.z);
    if (height !== undefined && height <= center.y + HEIGHT_EPSILON && height > supportHeight) {
      support = surface;
      supportHeight = height;
    }
  }
  for (const surface of site.coverSurfaces) {
    const height = cadSurfaceHeightAtXZ(surface, center.x, center.z);
    if (height !== undefined && height >= center.y - HEIGHT_EPSILON && height < coverHeight) {
      cover = surface;
      coverHeight = height;
    }
  }
  return support && cover
    ? { floor: support.floor, support, cover, supportHeight, coverHeight }
    : undefined;
}
