import rawLandcover from "./data/landcover.json";
import surveyedTrees from "./data/surveyed-trees.json";
import treeReconstruction from "./data/tree-reconstruction.json";
import { isStreetSurface } from "./streets";
import { isRealityGroundSurface } from "./terrain";
import { renderBudget } from "./render-quality";
import type { Building, WorldMap } from "./types";

export type LandcoverArea = {
  osmId: string;
  kind: string;
  surface: string | null;
  points: [number, number][];
  source: string;
};
export type Bounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type TreePlacement = {
  x: number;
  z: number;
  size: number;
  yaw: number;
  provenance:
    | "mapped-osm-node"
    | "inferred-within-mapped-forest"
    | "reference-interpreted-not-surveyed";
  osmId: string;
  crownDiameter?: number;
  positionUncertaintyMetres?: number;
  reconstruction?: TreeReconstruction;
};
export type TreeReconstruction = (typeof treeReconstruction.trees)[number];
export const TREE_RECONSTRUCTIONS: readonly TreeReconstruction[] =
  treeReconstruction.trees;
const treeReconstructionById = new Map(
  TREE_RECONSTRUCTIONS.map((tree) => [tree.id, tree]),
);
/** Upright native-ground rooted cylinder; renderer uses exactly this radius. */
export function treeTrunkCollision(tree: TreePlacement) {
  return {
    x: tree.x,
    z: tree.z,
    radius: tree.reconstruction?.trunkRadius ?? (0.18 * tree.size) / 5.8,
    height: Math.min(tree.reconstruction?.height ?? tree.size, 3.5),
  };
}
export function treeDetailLevel(distance: number, quality: string): 0 | 1 | 2 {
  const near = quality === "high" ? 40 : quality === "medium" ? 30 : 22;
  const middle = quality === "high" ? 135 : quality === "medium" ? 100 : 75;
  return distance < near ? 0 : distance < middle ? 1 : 2;
}
export const LANDCOVER = rawLandcover as unknown as {
  source: string;
  attribution: string;
  areas: LandcoverArea[];
  trees: { osmId: string; x: number; z: number; species: string | null }[];
};
const NATURAL_GRASS = new Set(["grass", "meadow", "grassland"]);
const WOODS = new Set(["forest", "wood"]);
const HIGHWAYS = new Set([
  "residential",
  "service",
  "unclassified",
  "secondary",
  "tertiary",
  "footway",
  "path",
  "steps",
  "pedestrian",
  "track",
  "cycleway",
  "living_street",
]);
const ROAD = new Set([
  "residential",
  "service",
  "unclassified",
  "secondary",
  "tertiary",
]);

export function polygonBounds(points: [number, number][]): Bounds {
  const result = {
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  for (const [x, z] of points) {
    result.minX = Math.min(result.minX, x);
    result.maxX = Math.max(result.maxX, x);
    result.minZ = Math.min(result.minZ, z);
    result.maxZ = Math.max(result.maxZ, z);
  }
  return result;
}
export function pointInPolygon(
  x: number,
  z: number,
  points: [number, number][],
) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [ax, az] = points[i],
      [bx, bz] = points[j];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax)
      inside = !inside;
  }
  return inside;
}
export function segmentDistance(
  x: number,
  z: number,
  a: [number, number],
  b: [number, number],
) {
  const dx = b[0] - a[0],
    dz = b[1] - a[1],
    length = dx * dx + dz * dz;
  const t = length
    ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length))
    : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}
const inBounds = (x: number, z: number, b: Bounds, margin = 0) =>
  x >= b.minX - margin &&
  x <= b.maxX + margin &&
  z >= b.minZ - margin &&
  z <= b.maxZ + margin;
export const grassSurface = (area: LandcoverArea) =>
  (NATURAL_GRASS.has(area.kind) &&
    (!area.surface || area.surface === "grass" || area.surface === "ground")) ||
  (area.kind === "pitch" && area.surface === "grass");
export const grassForbiddenSurface = (area: LandcoverArea) =>
  (area.kind === "pitch" && area.surface !== "grass") ||
  !!(
    area.surface && !["grass", "ground", "earth", "soil"].includes(area.surface)
  );
export function pathWidth(kind: string) {
  return !HIGHWAYS.has(kind)
    ? 0
    : ROAD.has(kind)
      ? 6
      : kind === "footway"
        ? 1.8
        : 2.5;
}
export function surfaceColor(area: LandcoverArea) {
  if (area.surface === "artificial_turf") return "#647f67";
  if (area.surface === "sand") return "#bcb08b";
  if (area.surface === "tartan" || area.surface === "clay") return "#946d5e";
  if (grassSurface(area)) return "#788268";
  if (WOODS.has(area.kind) || area.kind === "scrub") return "#6f7561";
  if (area.kind === "pitch") return "#92928a";
  return "#858276";
}
/** Nested park/grass/pitch polygons never share a plane with another material. */
export function surfaceElevation(area: LandcoverArea) {
  if (area.surface === "tartan" || area.surface === "clay") return 0.0075;
  if (area.surface === "sand") return 0.006;
  if (area.surface === "artificial_turf") return 0.0045;
  if (area.kind === "pitch" && !grassSurface(area)) return 0.0035;
  if (grassSurface(area)) return 0.0025;
  if (WOODS.has(area.kind) || area.kind === "scrub") return 0.0015;
  return 0.0008;
}
const mappedAreas = LANDCOVER.areas.map((area) => ({
  area,
  bounds: polygonBounds(area.points),
}));

/** Exact candidate lookup, never a rasterized classification of the ground. */
function spatialCandidates<T>(
  entries: T[],
  bounds: (entry: T) => Bounds,
  padding = 0,
) {
  const cells = new Map<string, T[]>(),
    size = 16;
  for (const entry of entries) {
    const box = bounds(entry);
    for (
      let x = Math.floor((box.minX - padding) / size);
      x <= Math.floor((box.maxX + padding) / size);
      x++
    )
      for (
        let z = Math.floor((box.minZ - padding) / size);
        z <= Math.floor((box.maxZ + padding) / size);
        z++
      ) {
        const key = x + ":" + z,
          values = cells.get(key) ?? [];
        values.push(entry);
        cells.set(key, values);
      }
  }
  return (x: number, z: number): readonly T[] =>
    cells.get(Math.floor(x / size) + ":" + Math.floor(z / size)) ?? [];
}
const areasAt = spatialCandidates(mappedAreas, (entry) => entry.bounds);

/** Shared renderer/collision placement rules; no image-derived survey claims. */
export function placementClassifier(
  buildings: Building[],
  paths: WorldMap["paths"],
) {
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
  const structuresAt = spatialCandidates(
    structures,
    (entry) => entry.bounds,
    5,
  );
  const segmentsAt = spatialCandidates(
    segments,
    (entry) => ({
      minX: Math.min(entry.a[0], entry.b[0]) - entry.width / 2,
      maxX: Math.max(entry.a[0], entry.b[0]) + entry.width / 2,
      minZ: Math.min(entry.a[1], entry.b[1]) - entry.width / 2,
      maxZ: Math.max(entry.a[1], entry.b[1]) + entry.width / 2,
    }),
    4,
  );
  const covers = (
    x: number,
    z: number,
    predicate: (area: LandcoverArea) => boolean,
  ) =>
    areasAt(x, z).some(
      ({ area, bounds }) =>
        inBounds(x, z, bounds) &&
        predicate(area) &&
        pointInPolygon(x, z, area.points),
    );
  const obstructed = (
    x: number,
    z: number,
    buildingMargin: number,
    pathMargin: number,
  ) =>
    structuresAt(x, z).some(
      (b) =>
        inBounds(x, z, b.bounds, buildingMargin) &&
        (pointInPolygon(x, z, b.points) ||
          b.points.some(
            (p, i) =>
              segmentDistance(x, z, p, b.points[(i + 1) % b.points.length]) <
              buildingMargin,
          )),
    ) ||
    segmentsAt(x, z).some(
      (p) =>
        x >= Math.min(p.a[0], p.b[0]) - p.width / 2 - pathMargin &&
        x <= Math.max(p.a[0], p.b[0]) + p.width / 2 + pathMargin &&
        z >= Math.min(p.a[1], p.b[1]) - p.width / 2 - pathMargin &&
        z <= Math.max(p.a[1], p.b[1]) + p.width / 2 + pathMargin &&
        segmentDistance(x, z, p.a, p.b) < p.width / 2 + pathMargin,
    );
  return {
    grass: (x: number, z: number) =>
      covers(x, z, grassSurface) &&
      !isStreetSurface(x, z, 0.35) &&
      !isRealityGroundSurface(x, z) &&
      !covers(x, z, grassForbiddenSurface) &&
      !obstructed(x, z, 0.6, 0.35),
    forest: (x: number, z: number) => covers(x, z, (a) => WOODS.has(a.kind)),
    tree: (x: number, z: number, inferred = false) =>
      !covers(x, z, grassForbiddenSurface) &&
      !isRealityGroundSurface(x, z) &&
      !isStreetSurface(x, z) &&
      !obstructed(x, z, inferred ? 5 : 0.5, inferred ? 4 : 0.1),
  };
}
/** Stable hashes keep placement identical on the server and every client. */
export function sampleHash(value: number) {
  let x = value | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export function createMappedTrees(
  bounds: Bounds,
  buildings: Building[],
  paths: WorldMap["paths"],
): TreePlacement[] {
  const classify = placementClassifier(buildings, paths),
    trees: TreePlacement[] = [];
  for (const tree of LANDCOVER.trees)
    if (inBounds(tree.x, tree.z, bounds) && classify.tree(tree.x, tree.z)) {
      const seed = Number(tree.osmId.slice(-8));
      trees.push({
        ...tree,
        size: 5.2 + sampleHash(seed) * 1.3,
        yaw: sampleHash(seed + 9) * Math.PI * 2,
        provenance: "mapped-osm-node",
      });
    }
  for (const tree of surveyedTrees.trees) {
    if (
      !inBounds(tree.x, tree.z, bounds) ||
      !classify.tree(tree.x, tree.z) ||
      trees.some((t) => Math.hypot(t.x - tree.x, t.z - tree.z) < 3)
    )
      continue;
    trees.push({
      x: tree.x,
      z: tree.z,
      size: Math.max(5, Math.min(15, tree.crownDiameter * 0.9)),
      yaw: sampleHash(Number(tree.id.slice(-3))) * Math.PI * 2,
      provenance: "reference-interpreted-not-surveyed",
      osmId: tree.id,
      crownDiameter: tree.crownDiameter,
      positionUncertaintyMetres: tree.positionUncertaintyMetres,
    });
  }
  for (const tree of treeReconstruction.additionalPlacements) {
    if (!inBounds(tree.x, tree.z, bounds) || !classify.tree(tree.x, tree.z))
      continue;
    if (
      trees.some(
        (existing) => Math.hypot(existing.x - tree.x, existing.z - tree.z) < 3,
      )
    )
      continue;
    trees.push({
      x: tree.x,
      z: tree.z,
      size: tree.size,
      yaw: 0,
      osmId: tree.osmId,
      crownDiameter: tree.crownDiameter,
      provenance: "reference-interpreted-not-surveyed",
      positionUncertaintyMetres: tree.positionUncertaintyMetres,
    });
  }
  for (const tree of trees)
    tree.reconstruction = treeReconstructionById.get(tree.osmId);
  return trees;
}

export type GrassPatch = {
  id: string;
  x: number;
  z: number;
  points: { x: number; z: number; size: number; yaw: number }[];
};
export function createGrassPatches(
  bounds: Bounds,
  buildings: Building[],
  paths: WorldMap["paths"],
  tileSize = 16,
): GrassPatch[] {
  const classify = placementClassifier(buildings, paths),
    patches: GrassPatch[] = [];
  for (
    let x = Math.floor(bounds.minX / tileSize) * tileSize;
    x < bounds.maxX;
    x += tileSize
  )
    for (
      let z = Math.floor(bounds.minZ / tileSize) * tileSize;
      z < bounds.maxZ;
      z += tileSize
    ) {
      if (
        !mappedAreas.some(
          ({ area, bounds: areaBounds }) =>
            grassSurface(area) &&
            areaBounds.maxX > x &&
            areaBounds.minX < x + tileSize &&
            areaBounds.maxZ > z &&
            areaBounds.minZ < z + tileSize,
        )
      )
        continue;
      const points: GrassPatch["points"] = [];
      for (let i = 0; i < 256; i++) {
        const seed = Math.round(x * 491 + z * 899 + i * 31);
        const px = x + sampleHash(seed) * tileSize,
          pz = z + sampleHash(seed + 1) * tileSize;
        if (!inBounds(px, pz, bounds) || !classify.grass(px, pz)) continue;
        points.push({
          x: px - x - tileSize / 2,
          z: pz - z - tileSize / 2,
          size: 0.09 + sampleHash(seed + 2) * 0.1,
          yaw: sampleHash(seed + 3) * Math.PI * 2,
        });
      }
      if (points.length)
        patches.push({
          id: `${x}:${z}`,
          x: x + tileSize / 2,
          z: z + tileSize / 2,
          points,
        });
    }
  return patches;
}
export const grassLod = (quality: string) => {
  const b = renderBudget(quality);
  return {
    range: b.grassRangeMetres,
    tiles: b.grassTiles,
    density: b.grassDensity,
  };
};

/** CPU mirror of the shader wind envelope for zero-wind/regression checks. */
export function windEnvelope(
  time: number,
  x: number,
  z: number,
  speed: number,
) {
  const strength = Math.max(
    0,
    Math.min(16, Number.isFinite(speed) ? speed : 0),
  );
  return (
    (Math.sin(time * 0.85 + x * 0.07 + z * 0.11) * 0.55 +
      Math.sin(time * 1.9 + x * 0.21) * 0.22) *
    strength
  );
}
