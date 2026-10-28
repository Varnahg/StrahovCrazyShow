import map from "../shared/data/map.json";
import streets from "../shared/data/streets.json";
import catalog from "../shared/data/building-catalog.json";

type MapPoint = readonly number[];
type MapRing = readonly MapPoint[];

/** One rigid transform for the whole campus, aligned to B6's longest edge. */
export function welcomeMapAlignmentAngle(points: MapRing): number {
  let longestX = 0,
    longestZ = 0;
  for (let i = 0; i < points.length; i++) {
    const next = points[(i + 1) % points.length];
    const dx = next[0] - points[i][0],
      dz = next[1] - points[i][1];
    if (dx * dx + dz * dz > longestX * longestX + longestZ * longestZ) {
      longestX = dx;
      longestZ = dz;
    }
  }
  if (longestZ < 0) {
    longestX = -longestX;
    longestZ = -longestZ;
  }
  return Math.atan2(longestX, longestZ);
}

const b6 = map.buildings.find((building) => building.id === "53929071");
if (!b6) throw new Error("Welcome map requires the native B6 footprint");
export const WELCOME_MAP_ROTATION = welcomeMapAlignmentAngle(b6.points);
const cosine = Math.cos(WELCOME_MAP_ROTATION),
  sine = Math.sin(WELCOME_MAP_ROTATION);

export function rotateWelcomeMapPoint(point: MapPoint): [number, number] {
  return [
    point[0] * cosine - point[1] * sine,
    point[0] * sine + point[1] * cosine,
  ];
}

function signedArea(points: MapRing): number {
  return points.reduce((area, point, i) => {
    const next = points[(i + 1) % points.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0);
}

/** Keep every vertex; millimetre serialization precision is below UI resolution. */
export function welcomeMapRingPath(
  points: MapRing,
  sameWinding = false,
): string {
  if (!points.length) return "";
  // Combined building subpaths must add, rather than cancel at an overlap.
  const ordered =
    sameWinding && signedArea(points) < 0 ? [...points].reverse() : points;
  return (
    "M" +
    ordered
      .map((point) =>
        rotateWelcomeMapPoint(point)
          .map((coordinate) => Number(coordinate.toFixed(3)))
          .join(","),
      )
      .join("L") +
    "Z"
  );
}

const stadium = catalog.landmarks.find(
  (landmark) => landmark.id === "great-strahov-stadium",
);
if (!stadium) throw new Error("Welcome map requires the native stadium rings");
const isDormitory = (building: (typeof map.buildings)[number]) =>
  /blok\s*\d+/i.test(building.name);
const buildingPath = (dormitory: boolean) =>
  map.buildings
    .filter((building) => isDormitory(building) === dormitory)
    .map((building) => welcomeMapRingPath(building.points, true))
    .join("");

// Construct once at module load. No render-time geometry, tiles, map state or engine.
export const WELCOME_MAP_GEOMETRY = Object.freeze({
  roads: Object.freeze(
    streets.surfaces.map((surface) =>
      Object.freeze({
        material: surface.material,
        path: surface.polygons
          .flatMap((polygon) => [polygon.outer, ...polygon.holes])
          .map((ring) => welcomeMapRingPath(ring))
          .join(""),
      }),
    ),
  ),
  stadium: [...stadium.outerRings, ...stadium.innerRings]
    .map((ring) => welcomeMapRingPath(ring))
    .join(""),
  buildings: buildingPath(false),
  dormitories: buildingPath(true),
});
