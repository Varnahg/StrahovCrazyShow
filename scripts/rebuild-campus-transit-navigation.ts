/** Rebuild public demo passenger approaches from the current walking graph and
 * the same north-facing entrances used by rendering and physics. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { B6_LAYOUT } from "../shared/b6-interior";
import { COMMON_DORM_ENTRANCES } from "../shared/landmark-reality";
import { findCampusWalkRoute } from "../shared/campus-routes";
import { TRANSIT_FEED } from "../shared/transit";
import { BUILDINGS } from "../shared/world";
import {B6_ENTRY_PAVING,type StreetPoint} from "../shared/streets";

const outputArg = process.argv.indexOf("--output");
const output =
  outputArg >= 0
    ? process.argv[outputArg + 1]
    : "shared/data/transit-navigation.json";
if (!output) throw new Error("Missing --output filename");
const files = [
  "shared/data/map.json",
  "shared/world.ts",
  "shared/data/building-catalog.json",
  "shared/data/streets.json",
  "shared/streets.ts",
  "shared/data/b6-entry-paving.json",
  "shared/campus-routes.ts",
  "shared/data/terrain-grid.json",
  "shared/data/reality-ground.json",
  "shared/terrain.ts",
  "shared/terrain-patches.ts",
  "shared/data/north-court-terrain-patch.json",
  "shared/data/north-court-style.json",
  "shared/campus-exterior.ts",
  "shared/b6-interior.ts",
  "shared/b6-stairs.ts",
  "shared/b6-entry.ts",
  "shared/b6-facade-plan.ts",
  "shared/landmark-reality.ts",
  "shared/stadium-exterior.ts",
  "shared/transit.ts",
  "shared/terrain-entities.ts",
  "shared/data/transit.json",
  "scripts/rebuild-campus-transit-navigation.ts",
];
const hashes = Object.fromEntries(
  await Promise.all(
    files.map(async (f) => [
      f,
      createHash("sha256")
        .update(await readFile(f))
        .digest("hex"),
    ]),
  ),
);
const entries = [
  ...COMMON_DORM_ENTRANCES.map((e) => ({ ...e })),
  {
    block: 6,
    buildingId: "53929071",
    x: B6_LAYOUT.entry.x,
    z: B6_LAYOUT.entry.z,
    nx: B6_LAYOUT.entry.outward.x,
    nz: B6_LAYOUT.entry.outward.z,
    baseY: 0,
    rise: B6_LAYOUT.entranceRise,
    steps: B6_LAYOUT.entry.stepCount,
  },
];
const destinations = entries.map((e) => ({
  buildingId: e.buildingId,
  name: BUILDINGS.find((b) => b.id === e.buildingId)?.name ?? `Blok ${e.block}`,
  threshold: [e.x + e.nx * 0.52, e.z + e.nz * 0.52].map(
    (v) => Math.round(v * 1000) / 1000,
  ),
  entranceConfidence:
    e.block === 6
      ? "confirmed-north-orientation-metric-interpreted"
      : "north-OSM-projection-official-photo-typology",
  source: "https://www.openstreetmap.org/way/" + e.buildingId,
}));
const journeys: {
  stopId: string;
  buildingId: string;
  points: StreetPoint[];
  length: number;
  sourceWayIds: string[];
  startConnector: number;
  endConnector: number;
  interpretedConnectorId?: string;
}[] = [];
const skipped: unknown[] = [];
for (const [stopId, stop] of Object.entries(TRANSIT_FEED.stops).filter(
  ([, s]) => s.name === "Koleje Strahov",
)) {
  for (const e of entries) {
    // The photo-informed B6 paving is separate from OSM node topology. Route
    // to its exact mapped anchor, then follow its canonical diagonal points;
    // an ordinary endpoint link would cut the last six metres over the lawn.
    const entryPaving=e.block===6?B6_ENTRY_PAVING.points.map(p=>[p[0],p[1]]as StreetPoint):undefined;
    const approach: StreetPoint = entryPaving?.[0]??[e.x + e.nx * 4.45, e.z + e.nz * 4.45];
    const route = findCampusWalkRoute([stop.x, stop.z], approach, 10);
    if (!route) {
      skipped.push({
        stopId,
        buildingId: e.buildingId,
        reason:
          "No connected public pedestrian route with endpoint connectors <=10m",
      });
      continue;
    }
    const points: StreetPoint[] = route.points.map((p) => [...p]);
    for(const point of entryPaving?.slice(1)??[])
      if(Math.hypot(points.at(-1)![0]-point[0],points.at(-1)![1]-point[1])>.001)points.push(point);
    const end = destinations.find((d) => d.buildingId === e.buildingId)!
      .threshold as StreetPoint;
    if (
      Math.hypot(points.at(-1)![0] - end[0], points.at(-1)![1] - end[1]) > 0.001
    )
      points.push(end);
    const length = points
      .slice(1)
      .reduce(
        (sum, p, i) =>
          sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]),
        0,
      );
    journeys.push({
      stopId,
      buildingId: e.buildingId,
      points,
      length,
      sourceWayIds: [
        ...new Set(
          route.segments.flatMap((s) => (s.featureId ? [s.featureId] : [])),
        ),
      ],
      startConnector: route.startConnector,
      endConnector: route.endConnector,
      ...(entryPaving?{interpretedConnectorId:B6_ENTRY_PAVING.id}:{}),
    });
  }
}
if (journeys.length < 12)
  throw new Error(
    "Too few connected passenger journeys: " +
      JSON.stringify({ journeys: journeys.length, skipped }),
  );
const data = {
  schemaVersion: 2,
  source:
    "OpenStreetMap walking way topology, source-informed native B6 entry paving, official B6 plan/panorama and ELSA entry typology",
  license: "ODbL-1.0",
  referenceAttribution:"© OpenStreetMap contributors · ODbL; datový podklad © IPR Praha · CC BY; © ČÚZK, upraveno · CC BY4.0. Metric native-entry adaptation is an interpretation, not a survey.",
  mapSha256: hashes["shared/data/map.json"],
  sourceHashes: hashes,
  sourceHashesScope:
    "Current pedestrian graph, destination entrances, terrain and court-height support, and passenger height sampling; not a complete game snapshot or proof of every transient obstruction.",
  clearance: 0.5,
  destinations,
  journeys,
  limitations:
    "North-facing doors and shared twelve-step geometry. Metric entrance dimensions are interpreted, not surveyed. Passengers stop on the landing; no full interior navigation.",
  skipped,
};
await writeFile(output, JSON.stringify(data) + "\n");
console.log(
  JSON.stringify({
    output,
    destinations: destinations.length,
    journeys: journeys.length,
    skipped,
    lengths: journeys.map((j) => ({
      stop: j.stopId,
      block: j.buildingId,
      metres: Math.round(j.length),
      startConnector: j.startConnector,
      endConnector: j.endConnector,
    })),
  }),
);
