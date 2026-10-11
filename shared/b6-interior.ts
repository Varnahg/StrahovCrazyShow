/** B6 reconstruction in local metres. Shape calibration is not an as-built survey. */
import { B6_STAIR_CORES, B6_STAIR_BOXES, b6StairRoute, type B6StairMaterial } from "./b6-stairs";
import {B6_STAIR_MESHES} from "./b6-stairs";
import {buildB6Entry} from "./b6-entry";
import {B6_FACADE_PLAN,b6LongWindow} from "./b6-facade-plan";
export { B6_STAIR_CORES, B6_STAIR_MESHES, B6_STAIR_DIMENSIONS, b6StairRoute } from "./b6-stairs";
export type B6Box = {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
  kind: "wall" | "floor" | "stair" | "bench" | "base" | "glass";
  role?: "shell" | "partition" | "corridor" | "plinth" | "rail" | "stair-landing" | "exterior-entry" | "roof-detail";
  material?: B6StairMaterial;
  level: number;
};
export type B6RoomArea = {
  id: string;
  level: number;
  index: number;
  side: "west" | "east";
  kind: "bedroom" | "bathroom" | "service" | "gym" | "games";
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  door: { x: number; z: number; yaw: number };
  label: string;
  sourceIds: string[];
  confidence: "medium-plan-derived" | "low-typology-inferred";
  measured: false;
  numberIsIllustrative: true;
};
export const B6_LAYOUT = {
  bounds: { minX: 0, maxX: 16, minZ: -90, maxZ: -20 },
  lobby: { minX: -7, maxX: 0, minZ: -77.1, maxZ: -70 },
  floorHeight: 3,
  floorLevels: [-1, 0, 1, 2, 3, 4, 5],
  foundationOffset: 1.8,
  entranceRise: 1.8,
  entranceRiseConfidence:
    "12 risers follow ELSA typical blocks 2-7 access; 0.15m riser/1.8m total is an unmeasured model estimate",
  roomPitch: 70 / 22,
  roomBaysPerSide: 22,
  roomCountPerResidentialLevel: 35,
  corridor: { minX: 6, maxX: 10 },
  doorWidth: 1.2,
  doorHeight: 2.15,
  window: { width: 2.18, height: 1.5, sill: 0.85, lintel: 2.35 },
  stairs: { cores: B6_STAIR_CORES, type: "two-opposing-flight-cores", measured: false },
  entry: {
    x: -4.85,
    z: -77.15,
    width: 2.4,
    outward: { x: 0, z: -1 },
    direction: "north-to-south",
    sourceFloor: "1.NP; 0.NP bicycle room is below the reception",
    foundationY: 0,
    stepCount: 12,
    stepsFromZ: -81.4,
    stepsToZ: -77.8,
    landingMinZ: -77.8,
    landingMaxZ: -76.95,
  },
  outsideSpawn: { x: -4.85, z: -85 },
  approachRoute: [[-4.85, -82.1], [-4.85, -77.35], [-4.85, -73]] as [number, number][],
  serviceRoute: [
    [-3.5, -73],
    [-1, -71.95],
    ...b6StairRoute("north-reception"),
  ] as [number, number][],
  dimensionsMeasured: false,
  roomCountStatus:
    "35 is an illustrative model count, NOT a confirmed B6 inventory. Three previously invented west room bays per level became the second plan-documented stair core.",
  stairStatus:
    "Two west-side dogleg cores and mezzanines follow the SH schematic. Flight direction, 2.4m width, 10+10 risers and metric positions are unmeasured interpretations. B3 photo supplies material typology only.",
  sources: [
    {
      id: "b6-plan-2023",
      url: "https://wiki.sh.cvut.cz/_media/kolej/bloky/0.jpg",
      date: "2023-03-20",
      use: "Topology and service/core placement; no dimensions or north arrow.",
    },
    {
      id: "b6-wiki-2026",
      url: "https://wiki.sh.cvut.cz/kolej/bloky/blok_6",
      date: "2026-09-26",
      use: "B6 room functions, not current materials or furniture dimensions.",
    },
    {
      id: "b6-pano-2025-north",
      url: "https://www.google.com/maps/@?api=1&map_action=pano&pano=gWCshoWQgiJdy1QWcqe1eQ&heading=178.82123&pitch=20",
      date: "2025-09",
      use: "Direct visual north-facing entrance/covered stairs; positions are photo/map interpretation.",
    },
    {
      id: "elsa-strahov-typical-entry",
      url: "https://www.elsa.cvut.cz/bezbarierove-cvut/pristupnost-objektu/objekt/?o=81",
      date: "checked-2026-10-10",
      use: "Typical blocks 2-7 covered approaches usually have 12 steps; B2 plan confirms orientation only, not B6 measurements.",
    },
    {
      id: "ctu-room-2016",
      url: "https://media.cvut.cz/cs/foto/20161116-pokoje-na-kolejich-strahov",
      date: "2016-11-16",
      use: "Historical Strahov room furniture and vinyl floor typology; block identity not confirmed.",
    },
    {
      id: "ctu-opening-2024",
      url: "https://media.cvut.cz/cs/foto/20240620-slavnostni-otevreni-rekonstruovaneho-bloku-4",
      date: "2024-06-20",
      use: "Older B3 corridor typology and comparison with renovated B4. Not a photo of B6.",
    },
    {
      id: "user-b3-stair-photo-20261011",
      url: "user-attachment:codex-clipboard-dd1cf547-77cc-4c58-8591-56719651b750.png",
      date: "provided-2026-10-11; capture-date-unknown",
      use: "Photo explicitly labelled BLOK 3: continuous painted concrete stair soffit, grey terrazzo treads, slim black vertical balusters, timber handrail and striped dark corridor tiles. Not a verified B6 finish survey.",
    },
    {
      id:"user-typical-entry-photo",
      url:"user-attachment:codex-clipboard-8bfb73f0-f31d-4287-9bd4-72ebd0310732.png",
      date:"provided-2026-10-11; capture-date-unknown",
      use:"Typical covered dorm entrance: flat silver canopy, light side reveals, dark glazed door frames and slim metal handrails. The visible plaque reads 5; the image is not claimed to identify B6. Dimensions unmeasured.",
    },
  ],
} as const;
export const B6_ENTRY_PACK=buildB6Entry(B6_LAYOUT.entry,B6_LAYOUT.entranceRise);
export const B6_ENTRY_MESHES=B6_ENTRY_PACK.meshes;
// One canonical physical mesh collection for renderer, fallback and Simulation.
B6_STAIR_MESHES.push(...B6_ENTRY_MESHES);

export const B6_REALITY_BOXES: B6Box[] = [];
export const B6_ROOM_AREAS: B6RoomArea[] = [];
const add = (
  level: number,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  kind: B6Box["kind"] = "wall",
  role?: B6Box["role"],
) => B6_REALITY_BOXES.push({ level, x, y, z, w, h, d, kind, role });

function longWall(level: number, x: number, spans: [number, number][]) {
  const y = level * 3;
  for (const [from, to] of spans)
    for (let bay = 0; bay < 22; bay++) {
      const lo = Math.max(from, -90 + bay * B6_LAYOUT.roomPitch);
      const hi = Math.min(to, -90 + (bay + 1) * B6_LAYOUT.roomPitch);
      if (hi - lo < 0.001) continue;
      const center = -90 + (bay + 0.5) * B6_LAYOUT.roomPitch;
      const window=b6LongWindow(x,center,B6_LAYOUT.window);
      const projection = x === 0 && center > B6_LAYOUT.lobby.minZ && center < B6_LAYOUT.lobby.maxZ;
      if (projection) {
        add(
          level,
          x,
          y + 1.45,
          (lo + hi) / 2,
          0.35,
          2.9,
          hi - lo,
          "wall",
          "shell",
        );
        continue;
      }
      add(
        level,
        x,
        y + window.sill / 2,
        (lo + hi) / 2,
        0.35,
        window.sill,
        hi - lo,
        "wall",
        "shell",
      );
      add(
        level,
        x,
        y + (window.lintel + 2.9) / 2,
        (lo + hi) / 2,
        0.35,
        2.9 - window.lintel,
        hi - lo,
        "wall",
        "shell",
      );
      const glassLo = Math.max(lo, center - window.width / 2),
        glassHi = Math.min(hi, center + window.width / 2);
      if (glassHi > glassLo)
        add(
          level,
          x,
          y + window.sill + window.height / 2,
          (glassLo + glassHi) / 2,
          0.12,
          window.height,
          glassHi - glassLo,
          "glass",
          "shell",
        );
      for (const [a, b] of [
        [lo, Math.min(hi, center - window.width / 2)],
        [Math.max(lo, center + window.width / 2), hi],
      ])
        if (b - a > 0.001)
          add(
            level,
            x,
            y + 1.45,
            (a + b) / 2,
            0.35,
            2.9,
            b - a,
            "wall",
            "shell",
          );
    }
}

for (const level of B6_LAYOUT.floorLevels) {
  const y = level * 3;
  add(level, 13, y - 0.15, -55, 6, 0.3, 70, "floor");
  // The schematic places both stair wells west of the main corridor. The
  // old centre-corridor ramp is removed; the complete 4m corridor is flat.
  B6_REALITY_BOXES.push({level,x:8,y:y-0.15,z:-55,w:4,h:0.3,d:70,kind:"floor",material:"striped-corridor"});
  if (level === -1) add(level, 3, y - 0.15, -55, 6, 0.3, 70, "floor");
  else {
    let cursor = -90;
    for (const core of B6_STAIR_CORES) {
      if (core.minZ > cursor) add(level, 3, y - 0.15, (cursor + core.minZ) / 2, 6, 0.3, core.minZ - cursor, "floor");
      const openingEnd = core.minZ + 5.8;
      for (const [lo, hi] of [[0, core.minX], [core.maxX, 6]])
        add(level, (lo + hi) / 2, y - 0.15, (core.minZ + openingEnd) / 2, hi - lo, 0.3, openingEnd - core.minZ, "floor");
      B6_REALITY_BOXES.push({level, x:3, y:y-0.15, z:(openingEnd+core.maxZ)/2, w:6, h:0.3, d:core.maxZ-openingEnd, kind:"floor",role:"stair-landing",material:"striped-corridor"});
      cursor = core.maxZ;
    }
    add(level, 3, y - 0.15, (cursor - 20) / 2, 6, 0.3, -20 - cursor, "floor");
  }
  const lobby = B6_LAYOUT.lobby, lobbyCenterZ = (lobby.minZ + lobby.maxZ) / 2;
  add(level, -3.5, y - 0.15, lobbyCenterZ, 7, 0.3, lobby.maxZ - lobby.minZ, "floor");
  for (const core of B6_STAIR_CORES) {
    const openingEnd=core.minZ+5.8;
    // The plan puts the stair wells in the west service strip. Their north
    // partition and corridor-side wall prevent a flat corridor walking route
    // from falling sideways into a half-level opening. Entry is at the broad
    // south floor landing; no invisible guard wall crosses that doorway.
    add(level,3,y+1.45,core.minZ,5.76,2.9,0.14,"wall","partition");
    add(level,5.88,y+1.45,(core.minZ+openingEnd)/2,0.24,2.9,openingEnd-core.minZ,"wall","partition");
    if(level>=0){
      // Room-loop walls belong to their north edge. Skipping a service bay
      // must not also skip the adjoining bedroom's south closing partition.
      const roomServiceBoundary=-20-Math.min(...core.sourceBayIndices)*B6_LAYOUT.roomPitch;
      add(level,3,y+1.45,roomServiceBoundary,6,2.9,.14,"wall","partition");
    }
  }
  longWall(level, 16, [[-90, -20]]);
  add(level, 8, y + 1.45, -90, 16, 2.9, 0.35, "wall", "shell");
  add(level, 8, y + 1.45, -20, 16, 2.9, 0.35, "wall", "shell");
  longWall(level, 0, [
    [-90, lobby.minZ],
    [lobby.maxZ, -20],
  ]);
  // The reception is entered through the NORTH short face. The old west
  // opening contradicted the actual panorama and is now a full solid wall.
  if(level<0)add(level, lobby.minX, y + 1.45, lobbyCenterZ, 0.35, 2.9, lobby.maxZ - lobby.minZ, "wall", "shell");
  else{
    const band=B6_FACADE_PLAN.receptionWestBand;
    add(level,lobby.minX,y+band.sill/2,lobbyCenterZ,.35,band.sill,lobby.maxZ-lobby.minZ,"wall","shell");
    add(level,lobby.minX,y+(band.lintel+2.9)/2,lobbyCenterZ,.35,2.9-band.lintel,lobby.maxZ-lobby.minZ,"wall","shell");
    add(level,lobby.minX,y+band.sill+band.height/2,lobbyCenterZ,.12,band.height,band.width,"glass","shell");
    for(const [lo,hi]of[[lobby.minZ,lobbyCenterZ-band.width/2],[lobbyCenterZ+band.width/2,lobby.maxZ]])
      add(level,lobby.minX,y+1.45,(lo+hi)/2,.35,2.9,hi-lo,"wall","shell");
  }
  add(level, -3.5, y + 1.45, lobby.maxZ, 7, 2.9, 0.3, "wall", "shell");
  if (level !== 0) add(level, -3.5, y + 1.45, lobby.minZ, 7, 2.9, 0.3, "wall", "shell");
  else {
    const fromX = B6_LAYOUT.entry.x - B6_LAYOUT.entry.width / 2, toX = B6_LAYOUT.entry.x + B6_LAYOUT.entry.width / 2;
    for (const [lo, hi] of [[lobby.minX, fromX], [toX, lobby.maxX]]) {
      add(level, (lo + hi) / 2, y + 1.45, lobby.minZ, hi - lo, 2.9, 0.3, "wall", "shell");
      add(level, (lo + hi) / 2, 0.275, lobby.minZ - 0.17, hi - lo, 0.55, 0.1, "base", "plinth");
    }
    add(level, B6_LAYOUT.entry.x, y + (B6_LAYOUT.doorHeight + 2.9) / 2, lobby.minZ, B6_LAYOUT.entry.width, 2.9 - B6_LAYOUT.doorHeight, 0.3, "wall", "shell");
  }

  if (level >= 0)
    for (const side of ["west", "east"] as const) {
      let ordinal = side === "west" ? 1 : 21;
      for (let index = 0; index < 22; index++) {
        const north = -20 - index * B6_LAYOUT.roomPitch,
          south = north - B6_LAYOUT.roomPitch;
        const service = side === "west" && B6_STAIR_CORES.some(core => (core.sourceBayIndices as readonly number[]).includes(index));
        const center = (north + south) / 2,
          wallX = side === "west" ? 6 : 10;
        if (service) continue;
        const bath = side === "east" && index <= 1;
        const label = bath
          ? index === 0
            ? "WC · společné"
            : "SPRCHY · společné"
          : `TYP ${level}${String(ordinal++).padStart(2, "0")}`;
        B6_ROOM_AREAS.push({
          id: `b6:${level}:${side}:${index}`,
          level,
          index,
          side,
          kind: bath ? "bathroom" : "bedroom",
          bounds: {
            minX: side === "west" ? 0 : 10,
            maxX: side === "west" ? 6 : 16,
            minZ: south,
            maxZ: north,
          },
          door: {
            x: wallX,
            z: center,
            yaw: side === "west" ? Math.PI / 2 : -Math.PI / 2,
          },
          label,
          measured: false,
          numberIsIllustrative: true,
          confidence: "low-typology-inferred",
          sourceIds: ["b6-plan-2023", "ctu-room-2016"],
        });
        if (index > 0)
          add(
            level,
            side === "west" ? 3 : 13,
            y + 1.45,
            north,
            6,
            2.9,
            0.14,
            "wall",
            "partition",
          );
        const jamb = (B6_LAYOUT.roomPitch - B6_LAYOUT.doorWidth) / 2;
        for (const sign of [-1, 1])
          add(
            level,
            wallX,
            y + 1.45,
            center + sign * (B6_LAYOUT.doorWidth / 2 + jamb / 2),
            0.16,
            2.9,
            jamb,
            "wall",
            "corridor",
          );
        add(
          level,
          wallX,
          y + (B6_LAYOUT.doorHeight + 2.9) / 2,
          center,
          0.16,
          2.9 - B6_LAYOUT.doorHeight,
          B6_LAYOUT.doorWidth,
          "wall",
          "corridor",
        );
      }
    }
}
B6_REALITY_BOXES.push(...B6_STAIR_BOXES);
B6_REALITY_BOXES.push(...B6_ENTRY_PACK.boxes);
add(6, 8, 18, -55, 16, 0.25, 70, "floor");
add(6, -3.5, 18, (B6_LAYOUT.lobby.minZ + B6_LAYOUT.lobby.maxZ) / 2, 7, 0.25, B6_LAYOUT.lobby.maxZ - B6_LAYOUT.lobby.minZ, "floor");
for(const detail of B6_FACADE_PLAN.roofDetails)B6_REALITY_BOXES.push({
  level:6,kind:"wall",role:"roof-detail",material:"painted-concrete",
  x:(detail.minX+detail.maxX)/2,z:(detail.minZ+detail.maxZ)/2,
  y:18.125+detail.rise/2,w:detail.maxX-detail.minX,d:detail.maxZ-detail.minZ,h:detail.rise,
});
// Exterior approach is relative to the same raised foundation as the interior.
for (let step = 0; step < B6_LAYOUT.entry.stepCount; step++) {
  const run =
    (B6_LAYOUT.entry.stepsToZ - B6_LAYOUT.entry.stepsFromZ) /
    B6_LAYOUT.entry.stepCount;
  const height =
    ((step + 1) * B6_LAYOUT.entranceRise) / B6_LAYOUT.entry.stepCount;
  add(
    0,
    B6_LAYOUT.entry.x,
    -B6_LAYOUT.entranceRise + height / 2,
    B6_LAYOUT.entry.stepsFromZ + (step + 0.5) * run,
    B6_LAYOUT.entry.width,
    height,
    run + 0.002,
    "stair",
  );
}
add(0, B6_LAYOUT.entry.x, -0.075, (B6_LAYOUT.entry.landingMinZ + B6_LAYOUT.entry.landingMaxZ) / 2, B6_LAYOUT.entry.width, 0.15, B6_LAYOUT.entry.landingMaxZ - B6_LAYOUT.entry.landingMinZ + 0.002, "stair");
/** World surface height for NPCs/thresholds; callers must not add the default foundation twice. */
export function b6EntranceHeight(
  x: number,
  z: number,
  foundationOffset: number = B6_LAYOUT.foundationOffset,
): number | undefined {
  if (Math.abs(x - B6_LAYOUT.entry.x) > B6_LAYOUT.entry.width / 2 || z < B6_LAYOUT.entry.stepsFromZ || z > B6_LAYOUT.entry.landingMaxZ)
    return undefined;
  if (z >= B6_LAYOUT.entry.stepsToZ) return foundationOffset;
  const progress =
    (z - B6_LAYOUT.entry.stepsFromZ) /
    (B6_LAYOUT.entry.stepsToZ - B6_LAYOUT.entry.stepsFromZ);
  const step = Math.min(B6_LAYOUT.entry.stepCount, Math.floor(progress * B6_LAYOUT.entry.stepCount) + 1);
  return (
    foundationOffset -
    B6_LAYOUT.entranceRise +
    (step * B6_LAYOUT.entranceRise) / B6_LAYOUT.entry.stepCount
  );
}
// Preserve the source's basement functional distinction without assigning residents.
for (const [kind, minZ, maxZ] of [
  ["games", -90, -53],
  ["gym", -53, -20],
] as const)
  B6_ROOM_AREAS.push({
    id: `b6:-1:${kind}`,
    level: -1,
    index: 0,
    side: "west",
    kind,
    bounds: { minX: 0, maxX: 6, minZ, maxZ },
    door: { x: 6, z: (minZ + maxZ) / 2, yaw: Math.PI / 2 },
    label:
      kind === "gym"
        ? "POSILOVNA · typový interiér"
        : "HERNA · typový interiér",
    measured: false,
    numberIsIllustrative: true,
    confidence: "medium-plan-derived",
    sourceIds: ["b6-plan-2023", "b6-wiki-2026"],
  });
/** Compatibility for the spelling used in the implementation handoff. */
export const B6_REALTITY_BOXES = B6_REALITY_BOXES;
