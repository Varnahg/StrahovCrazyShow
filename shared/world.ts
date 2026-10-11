import { B6_REALITY_BOXES, B6_LAYOUT, type B6Box } from "./b6-interior";
import rawMap from "./data/map.json";
import { createMappedTrees } from "./vegetation";
import rawBuildingCatalog from "./data/building-catalog.json";
import coverage from "./data/campus-coverage.json";
import gameplayPlacement from "./data/gameplay-placement.json";
import stadiumStops from "./data/stadium-stops.json";
import { landmarkBuildingHeight } from "./landmark-reality";
import { PROJECT_PLACES } from "./journal";
import { groundHeight } from "./terrain";
import type { WorldMap, Place, Vec3, Building } from "./types";
const sourceMap = rawMap as unknown as WorldMap;
export const MAP: WorldMap = {
  ...sourceMap,
  // The legacy XML fallback also put untagged boundaries/building parts here.
  // Keep the downloaded JSON as evidence, but share actual highways with all UIs.
  paths: sourceMap.paths.filter(
    (path) => typeof path.kind === "string" && path.kind.trim().length > 0,
  ),
};
export const BOUNDS = coverage.walkBounds;
export const SPAWN: Vec3 = {
  ...gameplayPlacement.spawn,
  y: groundHeight(gameplayPlacement.spawn.x, gameplayPlacement.spawn.z) + 1,
};
export const CAR_SPAWN = gameplayPlacement.car;
export const TERRAIN_COVERAGE = {
  minX: Math.floor((BOUNDS.minX - 5) / 4) * 4,
  maxX: Math.ceil((BOUNDS.maxX + 5) / 4) * 4,
  minZ: Math.floor((BOUNDS.minZ - 5) / 4) * 4,
  maxZ: Math.ceil((BOUNDS.maxZ + 5) / 4) * 4,
};
export const GROUND_RECTS = [
  {
    x: (TERRAIN_COVERAGE.minX - 7) / 2,
    z: (TERRAIN_COVERAGE.minZ + TERRAIN_COVERAGE.maxZ) / 2,
    w: -7 - TERRAIN_COVERAGE.minX,
    d: TERRAIN_COVERAGE.maxZ - TERRAIN_COVERAGE.minZ,
  },
  {
    x: (TERRAIN_COVERAGE.maxX + 16) / 2,
    z: (TERRAIN_COVERAGE.minZ + TERRAIN_COVERAGE.maxZ) / 2,
    w: TERRAIN_COVERAGE.maxX - 16,
    d: TERRAIN_COVERAGE.maxZ - TERRAIN_COVERAGE.minZ,
  },
  {
    x: 4.5,
    z: (TERRAIN_COVERAGE.maxZ - 20) / 2,
    w: 23,
    d: TERRAIN_COVERAGE.maxZ + 20,
  },
  {
    x: 4.5,
    z: (TERRAIN_COVERAGE.minZ - 90) / 2,
    w: 23,
    d: -90 - TERRAIN_COVERAGE.minZ,
  },
  {
    x: (B6_LAYOUT.lobby.minX + B6_LAYOUT.lobby.maxX) / 2,
    z: (B6_LAYOUT.bounds.minZ + B6_LAYOUT.lobby.minZ) / 2,
    w: B6_LAYOUT.lobby.maxX - B6_LAYOUT.lobby.minX,
    d: B6_LAYOUT.lobby.minZ - B6_LAYOUT.bounds.minZ,
  },
  {
    x: (B6_LAYOUT.lobby.minX + B6_LAYOUT.lobby.maxX) / 2,
    z: (B6_LAYOUT.lobby.maxZ + B6_LAYOUT.bounds.maxZ) / 2,
    w: B6_LAYOUT.lobby.maxX - B6_LAYOUT.lobby.minX,
    d: B6_LAYOUT.bounds.maxZ - B6_LAYOUT.lobby.maxZ,
  },
];
export const PLACES: Place[] = [
  {
    id: "b6",
    name: "Blok 6",
    x: B6_LAYOUT.entry.x,
    z: B6_LAYOUT.entry.z,
    description:
      "Vstup do B6. Rozvržení vychází z OSM a orientačního plánu SH; rozměry interiéru jsou přibližné.",
    source: "https://wiki.sh.cvut.cz/kolej/bloky/blok_6",
  },
  {
    id: "club6",
    name: "Klubovna B6",
    x: -3,
    z: -73,
    floor: 4.5,
    description:
      "Klubovna mezi 4. a 5. patrem. Virtuální interiér je demonstrační.",
    source: "https://wiki.sh.cvut.cz/kolej/bloky/blok_6#klubovna",
  },
  {
    id: "seven",
    name: "Sedmička / Klub 007",
    x: 68.3,
    z: -31.5,
    description: "Hudební klub na B7. Akce v tomto demu jsou fiktivní.",
    source: "https://www.siliconhill.cz/koleje-strahov",
  },
  {
    id: "rko",
    name: "R-ko / Recharging Bar",
    x: 103.08,
    z: -57.81,
    description:
      "Recharging Bar ve společné budově Potravin, Olympijská 1913/1. Bod označuje provozovnu; přesné dveře a interiér čekají na zaměření.",
    source: "https://www.openstreetmap.org/node/5508982945",
  },
  {
    id: "sports",
    name: "Mezi bloky",
    x: 130,
    z: 12,
    description: "Otevřený prostor pro společné herní aktivity.",
  },
  ...stadiumStops.platforms.map((platform) => {
    const osm = stadiumStops.osmPlatforms.find(
      (p) => p.tags["ref:PID"] === platform.id,
    );
    return {
      id: "stadium191" + platform.platformCode.toLowerCase(),
      name: "Stadion Strahov · 191 " + platform.platformCode,
      x: osm?.x ?? platform.x,
      z: osm?.z ?? platform.z,
      description:
        platform.platformCode === "A"
          ? "Nástupiště A · 191 směrem Vypich a Letiště. Poloha z PID a OSM; odjezdy linky 191 se v demu nesimulují."
          : "Nástupiště B · 191 směr Na Knížecí. Poloha z PID a OSM; odjezdy linky 191 se v demu nesimulují.",
      source: stadiumStops.officialLine,
    };
  }),
  ...PROJECT_PLACES,
];
export const HUNT_POINTS = [
  { x: gameplayPlacement.spawn.x - 2, z: gameplayPlacement.spawn.z },
  { x: 43, z: -42 },
  { x: 126, z: 12 },
  { x: 225, z: 24 },
  { x: 270, z: -34 },
];
export type Box = B6Box;
export const B6_BOXES = B6_REALITY_BOXES;
export function blockNumber(name: string) {
  const m = name.match(/blok (\d+)/);
  return m ? Number(m[1]) : null;
}
export function buildingVisible(points: [number, number][]) {
  return points.some(
    ([x, z]) =>
      x > BOUNDS.minX - 25 &&
      x < BOUNDS.maxX + 25 &&
      z > BOUNDS.minZ - 25 &&
      z < BOUNDS.maxZ + 25,
  );
}
export type BuildingKind =
  | "dormitory"
  | "administration"
  | "canteen"
  | "commercial"
  | "civic"
  | "garage"
  | "service"
  | "shed"
  | "fortification"
  | "transport"
  | "unknown";
export type FacadeKind =
  | "dormitory-standard"
  | "dormitory-cell"
  | "dormitory-low"
  | "administration"
  | "canteen-glazing"
  | "commercial-low"
  | "industrial"
  | "stone-wall"
  | "none";
export type FootprintEnvelope = {
  center: { x: number; z: number };
  /** Oriented envelope dimensions, including projections; not room dimensions. */
  width: number;
  depth: number;
  /** Babylon rotation.y: local x follows the chosen footprint edge. */
  yaw: number;
  area: number;
  envelopeArea: number;
  precision: "derived-from-osm-not-surveyed";
};
export type BuildingArchitecture = {
  osmId: string;
  name: string;
  kind: BuildingKind;
  facade: FacadeKind;
  roof: string;
  block: number | null;
  confidence: string;
  sourceIds: string[];
  photoIds: string[];
  characteristics: string[];
  renderHeight: number;
  heightProvenance: string;
  sourceHeight: number;
  measuredHeight: null;
  entranceSurveyed: false;
  footprint: FootprintEnvelope;
};
export type StadiumLandmark = {
  id: string;
  name: string;
  kind: "stadium";
  facade: "stadium-concrete";
  decorativeOnly: true;
  addedToCollisionWorld: false;
  source: string;
  identitySource: string;
  height: number;
  heightProvenance: string;
  outerRings: [number, number][][];
  innerRings: [number, number][][];
  parts: {
    osmId: string;
    points: [number, number][];
    height: number;
    heightProvenance: string;
    source: string;
  }[];
  characteristics: string[];
};
export const BUILDING_CATALOG = rawBuildingCatalog as unknown as {
  schemaVersion: number;
  checkedAt: string;
  entries: BuildingArchitecture[];
  landmarks: StadiumLandmark[];
  sources: { id: string; label: string; url: string }[];
  photoReferences: {
    id: string;
    sourceId: string;
    osmIds: string[];
    visuallyReviewed: boolean;
    identity: string;
    observations: string[];
    imageUrl?: string;
    existingAtlasId?: string;
  }[];
};
const ARCHITECTURE_BY_ID = new Map(
  BUILDING_CATALOG.entries.map((entry) => [entry.osmId, entry]),
);
/** Identity uses OSM IDs, never proximity, colour or a generic building name. */
export function buildingArchitecture(building: Building | string) {
  return ARCHITECTURE_BY_ID.get(
    typeof building === "string" ? building : building.id,
  );
}
/** Read-only orientation helper; actual rendering/collisions keep original polygons. */
export function measuredFootprint(building: Building) {
  return buildingArchitecture(building)?.footprint;
}
export const STADIUM = BUILDING_CATALOG.landmarks.find(
  (landmark) => landmark.id === "great-strahov-stadium",
)!;
// Consistent rendering/collision fallback. Explicit OSM heights and level counts
// are preserved. Low-rise service/garage estimates are labelled in the catalogue.
export const BUILDINGS = MAP.buildings
  .filter((b) => buildingVisible(b.points))
  .map((b) => ({
    ...b,
    height: landmarkBuildingHeight({
      ...b,
      height: buildingArchitecture(b)?.renderHeight ?? b.height,
    }),
  }));
export const TREES = createMappedTrees(BOUNDS, BUILDINGS, MAP.paths);
export function nearestPlace(x: number, z: number) {
  return [...PLACES].sort(
    (a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z),
  )[0];
}
export function zoneAt(p: Vec3) {
  const inPart = (r: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
  }) => p.x > r.minX && p.x < r.maxX && p.z > r.minZ && p.z < r.maxZ;
  return (inPart(B6_LAYOUT.bounds) || inPart(B6_LAYOUT.lobby)) &&
    p.y >= B6_LAYOUT.foundationOffset - 3 &&
    p.y < B6_LAYOUT.foundationOffset + 18
    ? `b6:${Math.floor((p.y - B6_LAYOUT.foundationOffset + 0.01) / 3)}`
    : "outside";
}
