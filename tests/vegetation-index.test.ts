import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  STREET_SURFACES,
  isStreetSurface,
  streetPolygonContains,
  streetSurfaceAt,
  type StreetPoint,
  type StreetPolygon,
} from "../shared/streets";
import {
  LANDCOVER,
  createGrassPatches,
  placementClassifier,
  pointInPolygon,
  polygonBounds,
  pathWidth,
  segmentDistance,
  grassSurface,
  grassForbiddenSurface,
} from "../shared/vegetation";
import { isRealityGroundSurface } from "../shared/terrain";
import { BOUNDS, BUILDINGS, MAP } from "../shared/world";
import type { Building, WorldMap } from "../shared/types";

/** Compatibility oracle: the original exhaustive edge scan, before indexing. */
function originalRing(x: number, z: number, ring: StreetPoint[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i],
      [bx, bz] = ring[j],
      dx = bx - ax,
      dz = bz - az,
      length2 = dx * dx + dz * dz;
    const t = length2
      ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length2))
      : 0;
    if (Math.hypot(x - ax - t * dx, z - az - t * dz) < 1e-7) return true;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}
const originalPolygon = (p: StreetPolygon, x: number, z: number) =>
  originalRing(x, z, p.outer) && !p.holes.some((r) => originalRing(x, z, r));
function originalSurface(x: number, z: number) {
  for (const s of STREET_SURFACES)
    for (const p of s.polygons) {
      const b = polygonBounds(p.outer);
      if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) continue;
      if (originalPolygon(p, x, z)) return s.material;
    }
  return undefined;
}
/** Independent exhaustive oracle for the intentional 35 cm clump clearance. */
function originalStreetBuffered(x: number, z: number, margin: number) {
  if (originalSurface(x, z) !== undefined) return true;
  for (const surface of STREET_SURFACES)
    for (const polygon of surface.polygons) {
      const b = polygonBounds(polygon.outer);
      if (
        x < b.minX - margin ||
        x > b.maxX + margin ||
        z < b.minZ - margin ||
        z > b.maxZ + margin
      )
        continue;
      for (const ring of [polygon.outer, ...polygon.holes])
        for (let i = 0; i < ring.length; i++)
          if (
            segmentDistance(x, z, ring[i], ring[(i + 1) % ring.length]) <=
            margin
          )
            return true;
    }
  return false;
}
function originalClassifier(buildings: Building[], paths: WorldMap["paths"]) {
  const areas = LANDCOVER.areas.map((area) => ({
    area,
    bounds: polygonBounds(area.points),
  }));
  const structures = buildings.map((b) => ({
    points: b.points,
    bounds: polygonBounds(b.points),
  }));
  const segments = paths.flatMap((path) => {
    const width = pathWidth(path.kind);
    return width
      ? path.points.slice(1).map((b, i) => ({ a: path.points[i], b, width }))
      : [];
  });
  const bounds = (
    x: number,
    z: number,
    b: { minX: number; maxX: number; minZ: number; maxZ: number },
    m = 0,
  ) => x >= b.minX - m && x <= b.maxX + m && z >= b.minZ - m && z <= b.maxZ + m;
  const covers = (
    x: number,
    z: number,
    predicate: (a: (typeof LANDCOVER.areas)[number]) => boolean,
  ) =>
    areas.some(
      (a) =>
        bounds(x, z, a.bounds) &&
        predicate(a.area) &&
        pointInPolygon(x, z, a.area.points),
    );
  const obstructed = (x: number, z: number, bm: number, pm: number) =>
    structures.some(
      (b) =>
        bounds(x, z, b.bounds, bm) &&
        (pointInPolygon(x, z, b.points) ||
          b.points.some(
            (p, i) =>
              segmentDistance(x, z, p, b.points[(i + 1) % b.points.length]) <
              bm,
          )),
    ) ||
    segments.some(
      (p) =>
        x >= Math.min(p.a[0], p.b[0]) - p.width / 2 - pm &&
        x <= Math.max(p.a[0], p.b[0]) + p.width / 2 + pm &&
        z >= Math.min(p.a[1], p.b[1]) - p.width / 2 - pm &&
        z <= Math.max(p.a[1], p.b[1]) + p.width / 2 + pm &&
        segmentDistance(x, z, p.a, p.b) < p.width / 2 + pm,
    );
  return {
    grass: (x: number, z: number) =>
      covers(x, z, grassSurface) &&
      !originalStreetBuffered(x, z, 0.35) &&
      !isRealityGroundSurface(x, z) &&
      !covers(x, z, grassForbiddenSurface) &&
      !obstructed(x, z, 0.6, 0.35),
    forest: (x: number, z: number) =>
      covers(x, z, (a) => a.kind === "wood" || a.kind === "forest"),
    tree: (x: number, z: number, inferred = false) =>
      !covers(x, z, grassForbiddenSurface) &&
      !isRealityGroundSurface(x, z) &&
      originalSurface(x, z) === undefined &&
      !obstructed(x, z, inferred ? 5 : 0.5, inferred ? 4 : 0.1),
  };
}

test("source edge indexing preserves original tolerance, holes and negative row boundaries", () => {
  for (const surface of STREET_SURFACES)
    for (const p of surface.polygons) {
      for (const ring of [p.outer, ...p.holes]) {
        const stride = Math.max(1, Math.floor(ring.length / 16));
        for (let i = 0; i < ring.length; i += stride) {
          const a = ring[i],
            b = ring[(i + 1) % ring.length];
          for (const t of [0, 0.5])
            for (const epsilon of [0, 5e-8, -5e-8, 2e-7, -2e-7]) {
              const x = a[0] + (b[0] - a[0]) * t + epsilon,
                z = a[1] + (b[1] - a[1]) * t - epsilon;
              assert.equal(
                streetPolygonContains(p, x, z),
                originalPolygon(p, x, z),
                `${surface.material} at ${x},${z}`,
              );
            }
        }
      }
    }
  for (let x = -512; x < 448; x += 16)
    for (let z = -288; z < 352; z += 8) {
      assert.equal(
        streetSurfaceAt(x, z),
        originalSurface(x, z),
        `cell boundary ${x},${z}`,
      );
    }
});

test("caller-owned polygons still support mutations and hole boundary semantics", () => {
  const p: StreetPolygon = {
    outer: [
      [0, 0],
      [12, 0],
      [12, 12],
      [0, 12],
    ],
    holes: [
      [
        [3, 3],
        [9, 3],
        [9, 9],
        [3, 9],
      ],
    ],
    area: 108,
  };
  assert.equal(streetPolygonContains(p, 3, 6), false);
  assert.equal(streetPolygonContains(p, 0, 6), true);
  assert.equal(streetPolygonContains(p, 10, 6), true);
  p.outer[1][0] = p.outer[2][0] = 8;
  assert.equal(streetPolygonContains(p, 10, 6), false);
});

test("indexed grass clearance agrees with exhaustive distances across actual pavement edges", () => {
  for (const surface of STREET_SURFACES) {
    const ring = surface.polygons[0]?.outer;
    if (!ring || ring.length < 2) continue;
    const a = ring[0],
      b = ring[1],
      dx = b[0] - a[0],
      dz = b[1] - a[1],
      length = Math.hypot(dx, dz);
    if (length < 1e-7) continue;
    for (const offset of [-0.45, -0.15, 0, 0.15, 0.45]) {
      const x = (a[0] + b[0]) / 2 - (dz / length) * offset,
        z = (a[1] + b[1]) / 2 + (dx / length) * offset;
      assert.equal(
        isStreetSurface(x, z, 0.35),
        originalStreetBuffered(x, z, 0.35),
        `${surface.material} at ${x},${z}`,
      );
    }
  }
});

test("spatial vegetation candidates preserve exhaustive grass, forest and tree decisions", () => {
  const actual = placementClassifier(BUILDINGS, MAP.paths),
    reference = originalClassifier(BUILDINGS, MAP.paths),
    points: StreetPoint[] = [];
  let seed = 319031;
  for (let i = 0; i < 1800; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const x = BOUNDS.minX + (seed / 2 ** 32) * (BOUNDS.maxX - BOUNDS.minX);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const z = BOUNDS.minZ + (seed / 2 ** 32) * (BOUNDS.maxZ - BOUNDS.minZ);
    points.push([x, z]);
  }
  for (const building of BUILDINGS) points.push(...building.points.slice(0, 2));
  for (const path of MAP.paths) points.push(...path.points.slice(0, 1));
  for (const [x, z] of points) {
    assert.equal(actual.grass(x, z), reference.grass(x, z), `grass ${x},${z}`);
    assert.equal(
      actual.forest(x, z),
      reference.forest(x, z),
      `forest ${x},${z}`,
    );
    assert.equal(
      actual.tree(x, z),
      reference.tree(x, z),
      `mapped tree ${x},${z}`,
    );
    assert.equal(
      actual.tree(x, z, true),
      reference.tree(x, z, true),
      `inferred tree ${x},${z}`,
    );
  }
});

test("expanded-campus grass retains the reviewed buffered-placement fingerprint", () => {
  const grass = createGrassPatches(BOUNDS, BUILDINGS, MAP.paths);
  assert.equal(grass.length, 597);
  assert.equal(
    grass.reduce((n, p) => n + p.points.length, 0),
    80576,
  );
  assert.equal(
    createHash("sha256").update(JSON.stringify(grass)).digest("hex"),
    "c852a5980990694f5fced980ce3b980babc6b838e9805fa70f74987f4d3742bd",
  );
});
