import placement from "./data/gameplay-placement.json";
import stops from "./data/stadium-stops.json";
import { B6_LAYOUT } from "./b6-interior";
import { b6StairRoute } from "./b6-stairs";
import { COMMON_DORM_ENTRANCES } from "./landmark-reality";

/** Render evidence scenarios, never authority to move an Actor or alter physics. */
export const PLAYTEST_SCENARIO_VERSION = "strahov-diary-v1";
export const PLAYTEST_LIGHTING_MODES = [
  "day", "night", "golden-hour", "blue-hour", "full-moon", "real",
] as const;
export const PLAYTEST_CAPTURE_PHASES = ["off-before", "on", "off-after"] as const;
export const PLAYTEST_VIEWS = ["first", "third"] as const;
export const PLAYTEST_QUALITIES = ["low", "medium", "high", "auto"] as const;
export type PlaytestStation = Readonly<{
  id: string;
  label: string;
  target: Readonly<{ x: number; z: number }>;
  toleranceMetres: number;
  heightBand?: Readonly<{ min: number; max: number }>;
  route: "campus" | "b6-interior" | "stadium";
  source: string;
  provenance: string;
  checks: readonly string[];
  approach?: readonly (readonly [number, number])[];
}>;

function platform(code: string) {
  const published = stops.platforms.find((p) => p.platformCode === code);
  if (!published) throw Error("Missing playtest platform " + code);
  const mapped = stops.osmPlatforms.find((p) => p.tags["ref:PID"] === published.id);
  return { x: mapped?.x ?? published.x, z: mapped?.z ?? published.z };
}
const b4 = COMMON_DORM_ENTRANCES.find((entry) => entry.block === 4);
if (!b4) throw Error("Missing source-based B4 entrance");
const north = b6StairRoute("north-reception"), south = b6StairRoute("south-service");
const station = (value: PlaytestStation): PlaytestStation => Object.freeze(value);
export const PLAYTEST_STATIONS: readonly PlaytestStation[] = Object.freeze([
  station({ id: "spawn-parking", label: "Start a parkoviště", target: placement.spawn,
    toleranceMetres: 3, route: "campus", source: "shared/data/gameplay-placement.json",
    provenance: "Existing virtual spawn on mapped private parking; no real-world public-access claim.",
    checks: ["car paint and glass", "asphalt", "distant facades", "HUD"] }),
  station({ id: "rko-approach", label: "Potraviny / R-ko z chodníku",
    target: { x: 103.08789883595836, z: -54.92523226749529 }, toleranceMetres: 2,
    route: "campus", source: "docs/model-review/authored-walks-native-20261011-a.json#rko-public-approach",
    provenance: "Archived walked public-approach endpoint, not the indoor venue marker; revalidate current collision traversal.",
    checks: ["shop facade", "glass", "light range", "no invented interior"] }),
  station({ id: "b7-exterior", label: "B7 / Klub 007 zvenku",
    target: { x: 68.3, z: -31.5 }, toleranceMetres: 3, route: "campus",
    source: "shared/world.ts#PLACES/seven", provenance: "Existing named exterior point; stop on collision-validated approach.",
    checks: ["facade", "near and far detail", "street light transitions"] }),
  station({ id: "b6-entry", label: "B6 před vstupními schody",
    target: { x: B6_LAYOUT.approachRoute[0][0], z: B6_LAYOUT.approachRoute[0][1] },
    toleranceMetres: 1.2, route: "campus", source: "shared/b6-interior.ts#B6_LAYOUT.approachRoute",
    provenance: "Shared reconstructed entrance; dimensions are model estimates, not surveyed.",
    approach: B6_LAYOUT.approachRoute, checks: ["stairs", "door frame", "shadow seams", "floor contact"] }),
  station({ id: "b6-reception", label: "B6 recepce",
    target: { x: B6_LAYOUT.serviceRoute[0][0], z: B6_LAYOUT.serviceRoute[0][1] },
    toleranceMetres: 1.2, heightBand: { min: B6_LAYOUT.foundationOffset + 0.3, max: B6_LAYOUT.foundationOffset + 2 },
    route: "b6-interior", source: "shared/b6-interior.ts#B6_LAYOUT.serviceRoute",
    provenance: "Existing playable demonstration interior, reached via the shared stairs.",
    checks: ["opaque envelope behind glass", "flashlight through walls", "local fill light"] }),
  ...([ ["north", north], ["south", south] ] as const).map(([side, route]) => station({
    id: `b6-${side}-landing`, label: `B6 ${side === "north" ? "severní" : "jižní"} podesta 1. patra`,
    target: { x: route[0][0], z: route[0][1] }, toleranceMetres: 1.2,
    heightBand: { min: B6_LAYOUT.foundationOffset + B6_LAYOUT.floorHeight + 0.3, max: B6_LAYOUT.foundationOffset + B6_LAYOUT.floorHeight + 2 },
    route: "b6-interior", approach: route, source: `shared/b6-stairs.ts#b6StairRoute/${side}`,
    provenance: "Shared opposing-flight model; physically walk to the upper landing, never set actor height.",
    checks: ["floor culling", "handrail", "stair contact", "light leaks", "camera collision"],
  })),
  station({ id: "b4-approach", label: "B4 před severním vstupem",
    target: { x: b4.x + b4.nx * 4.8, z: b4.z + b4.nz * 4.8 }, toleranceMetres: 2,
    route: "campus", source: "shared/landmark-reality.ts#COMMON_DORM_ENTRANCES/4",
    provenance: "Same mapped entrance and 4.8m exterior offset as map navigation; not an invented B4 interior.",
    checks: ["panel facade", "window depth", "stairs", "LOD transition"] }),
  ...(["A", "B"] as const).map((code) => station({ id: "stadium-191-" + code.toLowerCase(),
    label: "Stadion Strahov · 191 " + code, target: platform(code), toleranceMetres: 3,
    route: "stadium", source: "shared/data/stadium-stops.json#" + code,
    provenance: "Same OSM-first/PID-fallback point as PLACES; stadium exterior only, closed interior stays closed.",
    checks: ["stadium silhouette", "pavilion glass", "distant trees", "pavement and lamps"] })),
]);

export type PlaytestTrial = Readonly<{
  id: string;
  scenarioId: string;
  scenarioVersion: typeof PLAYTEST_SCENARIO_VERSION;
  stationId: string;
  lightingMode: (typeof PLAYTEST_LIGHTING_MODES)[number];
  view: (typeof PLAYTEST_VIEWS)[number];
  qualityMode: (typeof PLAYTEST_QUALITIES)[number];
  phases: typeof PLAYTEST_CAPTURE_PHASES;
  traversal: "normal-input";
}>;
export const PLAYTEST_LIFECYCLE_CHECKS = [
  "vehicle-enter", "vehicle-first-person", "vehicle-drive", "vehicle-exit",
  "camera-first-third", "avatar-change", "quality-auto-observed",
  "connection-rejoin", "game-exit-and-flush",
] as const;
/** Pilot=20 trials/60 images; full=120 trials/360 images. Auto is observed,
 * never scheduled as a fixed visual A/B because it changes the render budget. */
export function createPlaytestMatrix(scope: "pilot" | "full" = "pilot"): PlaytestTrial[] {
  const lighting = scope === "pilot" ? PLAYTEST_LIGHTING_MODES.slice(0, 2) : PLAYTEST_LIGHTING_MODES;
  const trial = (stationId: string, lightingMode: PlaytestTrial["lightingMode"],
    view: PlaytestTrial["view"], qualityMode: PlaytestTrial["qualityMode"]): PlaytestTrial => ({
      id: [stationId, lightingMode, view, qualityMode].join(":"),
      scenarioId: "campus-lighting", scenarioVersion: PLAYTEST_SCENARIO_VERSION,
      stationId, lightingMode, view, qualityMode,
      phases: PLAYTEST_CAPTURE_PHASES, traversal: "normal-input" as const,
  });
  const result = PLAYTEST_STATIONS.flatMap((point) => lighting.map((mode) => trial(point.id, mode, "third", "medium")));
  if (scope === "full") {
    for (const id of ["b6-entry", "b6-reception", "b6-north-landing", "b6-south-landing"])
      for (const mode of lighting) result.push(trial(id, mode, "first", "medium"));
    for (const id of ["spawn-parking", "b6-reception", "stadium-191-a"])
      for (const mode of lighting)
        for (const quality of ["low", "high"] as const) result.push(trial(id, mode, "third", quality));
  }
  return result;
}

export function playtestStationReached(id: string, point: { x: number; y: number; z: number }) {
  const target = PLAYTEST_STATIONS.find((entry) => entry.id === id);
  return !!target && [point.x, point.y, point.z].every(Number.isFinite) &&
    Math.hypot(point.x - target.target.x, point.z - target.target.z) <= target.toleranceMetres &&
    (!target.heightBand || (point.y >= target.heightBand.min && point.y <= target.heightBand.max));
}
