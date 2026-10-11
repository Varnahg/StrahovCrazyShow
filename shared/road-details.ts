import {
  STREET_FEATURES,
  CROSSING_MARKINGS,
  nearestStreet,
  streetSurfaceAt,
  STREETS,
  type StreetPoint,
} from "./streets";
import { TRANSIT_FEED } from "./transit";
import coverage from "./data/campus-coverage.json";

export type RoadPaint = {
  id: string;
  kind: "line" | "bicycle" | "bus";
  role: "centre" | "lane-divider" | "edge" | "bicycle" | "bus-stop";
  points: StreetPoint[];
  source: string;
  sourceWay: string;
  laneSide: -1 | 0 | 1;
  forward: StreetPoint;
  dimensions: "photo-informed-generic-not-surveyed";
};
export type RoadSign = {
  id: string;
  kind: "bus" | "crossing" | "parking";
  x: number;
  z: number;
  yaw: number;
  name: string;
  routes: string;
  source: string;
  placement:
    | "gtfs-stop-anchor-not-surveyed-pole"
    | "photo-and-map-interpreted-not-surveyed";
  uncertaintyMetres: number;
};
const inBounds = (x: number, z: number) =>
  x >= coverage.walkBounds.minX &&
  x <= coverage.walkBounds.maxX &&
  z >= coverage.walkBounds.minZ &&
  z <= coverage.walkBounds.maxZ;
function quad(
  x: number,
  z: number,
  dx: number,
  dz: number,
  length: number,
  width: number,
): StreetPoint[] {
  const nx = -dz,
    nz = dx;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([a, b]) => [
    x + (dx * a * length) / 2 + (nx * b * width) / 2,
    z + (dz * a * length) / 2 + (nz * b * width) / 2,
  ]);
}
/** Only the photographed Vaníčkova corridor and mapped cycleway tags. This is
 * the reference-era street, not the future tram alignment announced in 2026. */
export function buildRoadDetailPlan() {
  const paint: RoadPaint[] = [];
  for (const feature of STREET_FEATURES) {
    if (
      feature.kind !== "road" ||
      feature.tags.name !== "Vaníčkova" ||
      feature.interpretationId
    )
      continue;
    const both = ["lane", "soft_lane"].includes(
      feature.tags["cycleway:both"] ?? feature.tags.cycleway,
    );
    const left =
      both || ["lane", "soft_lane"].includes(feature.tags["cycleway:left"]);
    const right =
      both || ["lane", "soft_lane"].includes(feature.tags["cycleway:right"]);
    let distance = 0;
    const rows = [
      {
        side: 0,
        period: 9,
        length: 3,
        width: 0.12,
        kind: "line" as const,
        role: "centre" as const,
      },
      ...[-1, 1]
        .filter((side) => (side < 0 ? left : right))
        .flatMap((side) => [
          {
            side,
            period: 2,
            length: 1,
            width: 0.12,
            kind: "line" as const,
            role: "lane-divider" as const,
          },
          {
            side,
            period: 36,
            length: 1.2,
            width: 0.75,
            kind: "bicycle" as const,
            role: "bicycle" as const,
          },
          {
            side,
            period: 2,
            length: 2,
            width: 0.12,
            kind: "line" as const,
            role: "edge" as const,
          },
        ]),
    ];
    for (let segment = 1; segment < feature.points.length; segment++) {
      const a = feature.points[segment - 1],
        b = feature.points[segment],
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 0.01) continue;
      const dx = (b[0] - a[0]) / length,
        dz = (b[1] - a[1]) / length;
      for (const row of rows)
        for (
          let mark = Math.floor(distance / row.period) * row.period;
          mark < distance + length;
          mark += row.period
        ) {
          const lo = Math.max(distance, mark),
            hi = Math.min(distance + length, mark + row.length);
          if (hi - lo < 0.12) continue;
          if (row.kind === "bicycle" && hi - lo < row.length - 0.001) continue;
          const offset =
            row.role === "edge"
              ? row.side * (feature.width / 2 - 0.14)
              : row.kind === "bicycle"
                ? row.side * (feature.width / 2 - 0.65)
                : row.side * (feature.width / 2 - 1.15);
          const along = (lo + hi) / 2 - distance,
            x = a[0] + dx * along - dz * offset,
            z = a[1] + dz * along + dx * offset;
          if (
            !inBounds(x, z) ||
            CROSSING_MARKINGS.some((c) => Math.hypot(c.x - x, c.z - z) < 5)
          )
            continue;
          // Continuous outer paint is visible in the supplied stadium corridor
          // photographs. Do not extrapolate it around every unphotographed bend.
          if (
            row.role === "edge" &&
            (x < -145 || x > -105 || z < -110 || z > 190)
          )
            continue;
          const nearest = nearestStreet(x, z, true);
          if (!nearest || nearest.feature.id !== feature.id) continue;
          // Leave real road junctions open, and never paint over a sidewalk or lawn.
          if (
            STREET_FEATURES.some(
              (other) =>
                other.kind === "road" &&
                other.tags.name !== feature.tags.name &&
                other.points.some((p) => Math.hypot(p[0] - x, p[1] - z) < 6),
            )
          )
            continue;
          const direction = row.kind === "bicycle" && row.side < 0 ? -1 : 1;
          const points = quad(
            x,
            z,
            dx * direction,
            dz * direction,
            hi - lo,
            row.width,
          );
          if (!points.every((p) => streetSurfaceAt(p[0], p[1]) === "asphalt"))
            continue;
          paint.push({
            id: `road-paint:${feature.id}:${segment}:${row.side}:${row.role}:${mark}`,
            kind: row.kind,
            role: row.role,
            points,
            source: feature.source,
            sourceWay: feature.id,
            laneSide: row.side as -1 | 0 | 1,
            forward: [dx * direction, dz * direction],
            dimensions: "photo-informed-generic-not-surveyed",
          });
        }
      distance += length;
    }
  }
  // The photographs show BUS paint at Koleje Strahov. The GTFS coordinate is a
  // stop anchor, not a surveyed pole or stop-bay corner; project the generic
  // lettering onto the source carriageway instead of painting over the curb.
  for (const id of ["U981Z1P", "U981Z2P"]) {
    const stop = TRANSIT_FEED.stops[id],
      road = nearestStreet(stop.x, stop.z, true);
    if (!road) continue;
    const side: -1 | 1 =
      -road.dz * (stop.x - road.x) + road.dx * (stop.z - road.z) < 0 ? -1 : 1;
    const offset = side * (road.feature.width / 2 - 1.25),
      x = road.x - road.dz * offset,
      z = road.z + road.dx * offset;
    const points = quad(x, z, road.dx * side, road.dz * side, 3.2, 1.8);
    if (!points.every((p) => streetSurfaceAt(p[0], p[1]) === "asphalt"))
      continue;
    paint.push({
      id: `road-paint:stop:${id}:bus`,
      kind: "bus",
      role: "bus-stop",
      points,
      source: TRANSIT_FEED.source,
      sourceWay: road.feature.id,
      laneSide: side,
      forward: [road.dx * side, road.dz * side],
      dimensions: "photo-informed-generic-not-surveyed",
    });
  }
  const signs: RoadSign[] = [];
  for (const [id, stop] of Object.entries(TRANSIT_FEED.stops)) {
    if (!inBounds(stop.x, stop.z)) continue;
    const road = nearestStreet(stop.x, stop.z, true);
    if (!road) continue;
    const routes = [
      ...new Set(
        TRANSIT_FEED.trips
          .filter((t) => t.stops.some((s) => s[0] === id))
          .map((t) => t.route),
      ),
    ]
      .sort()
      .join(" · ");
    signs.push({
      id: `road-sign:stop:${id}`,
      kind: "bus",
      x: stop.x,
      z: stop.z,
      yaw: Math.atan2(road.dx, road.dz),
      name: stop.name,
      routes,
      source: TRANSIT_FEED.source,
      placement: "gtfs-stop-anchor-not-surveyed-pole",
      uncertaintyMetres: 3,
    });
  }
  // The user's Vaníčkova photos show the blue crossing sign beside the stop.
  // OSM anchors the crossing; curb-side pole offsets remain an interpretation.
  const crossing = CROSSING_MARKINGS.find((c) => c.id === "54283786");
  if (crossing)
    for (const side of [-1, 1]) {
      const offset = side * (crossing.roadWidth / 2 + 0.6);
      signs.push({
        id: `road-sign:crossing:${crossing.id}:${side}`,
        kind: "crossing",
        x: crossing.x - crossing.dz * offset + crossing.dx * side * 1.6,
        z: crossing.z + crossing.dx * offset + crossing.dz * side * 1.6,
        yaw: Math.atan2(crossing.dx, crossing.dz) + (side < 0 ? Math.PI : 0),
        name: "Přechod pro chodce",
        routes: "",
        source: crossing.source,
        placement: "photo-and-map-interpreted-not-surveyed",
        uncertaintyMetres: 2,
      });
    }
  const stop = TRANSIT_FEED.stops.U981Z1P;
  const parking = STREETS.parking
    .map((p) => ({
      parking: p,
      distance: Math.min(
        ...p.points.map((q) => Math.hypot(q[0] - stop.x, q[1] - stop.z)),
      ),
    }))
    .sort((a, b) => a.distance - b.distance)[0]?.parking;
  if (parking) {
    const p = [...parking.points].sort(
      (a, b) =>
        Math.hypot(a[0] - stop.x, a[1] - stop.z) -
        Math.hypot(b[0] - stop.x, b[1] - stop.z),
    )[0];
    const road = nearestStreet(p[0], p[1], true)!;
    signs.push({
      id: `road-sign:parking:${parking.id}`,
      kind: "parking",
      x: p[0] + 0.4,
      z: p[1] + 0.4,
      yaw: Math.atan2(road.x - p[0], road.z - p[1]) + Math.PI,
      name: "Parkoviště",
      routes: "",
      source: parking.source,
      placement: "photo-and-map-interpreted-not-surveyed",
      uncertaintyMetres: 6,
    });
  }
  return { paint, signs };
}
