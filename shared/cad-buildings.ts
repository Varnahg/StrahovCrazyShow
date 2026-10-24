import b01 from "./data/cad-buildings/b01.json";
import b01Site from "./data/cad-buildings/b01-site.json";
import b06 from "./data/cad-buildings/b06.json";
import b06Site from "./data/cad-buildings/b06-site.json";
import photoAlignment from "./data/cad-buildings/photo-alignment.json";
import { osmAssetIdentity } from "./world-asset-identity";
import type { Vec3 } from "./types";
import {
  cadLocalToWorld,
  cadWorldToLocal,
  cadSpaceAtLocalPosition,
  cadSurfaceHeightAtXZ,
  transformCadPositions,
  type CadBuildingSite,
  type CadPlacement,
} from "./cad-building-geometry";

export type CadBuildingModel = {
  id: string;
  identity: string;
  cadOrigin: number[];
  glbSha256: string;
  blendSha256: string;
  floors: { id: string; elevation: number; levelElevations?: Partial<Record<string, number>>; [key: string]: unknown }[];
  parts: { id: string; floor: string; role: string; positions: number[]; indices: number[] }[];
  stairs: {
    id: string; floor: string; a: number[]; b: number[]; bottom: number; top: number; width: number;
    routeId: string; routeIndex: number; routeSegmentCount: number;
    sourcePlanId: string; sourceEntities: string[]; lowerLevelKey: string; upperLevelKey: string;
    routeAccessPath?: { offsetCad?: number[]; lowerApproachCad?: number[]; upperApproachCad?: number[]; viaCad?: number[][] };
    terrainValidationPending?: boolean;
    [key: string]: unknown;
  }[];
  doors: {
    id: string; floor: string; hinge: number[]; closedEnd: number[]; openEnd: number[];
    bottom: number; top: number; depth: number; normalOffset?: number; sourceEntities: string[];
    openingClassification?: string; accessConfirmed?: boolean; outsideTraversalStatus?: string;
    [key: string]: unknown;
  }[];
};

/** CAD2005 footprint / IPR2023 rigid plane fit, not a new as-built survey.
 * The same transform is applied to native GLB and structural triangles. */
function building(model: CadBuildingModel, siteData: unknown, osmId: string, sourceRecipeSha256: string, placement: CadPlacement) {
  // JSON imports widen coordinate pairs; the exporter/source tests validate
  // tuple arity. Keep each model/site pair tied to its actual native exports.
  const site = siteData as CadBuildingSite;
  const identity = osmAssetIdentity("building", "way", osmId);
  if (site.id !== model.id || site.sourceGlbSha256 !== model.glbSha256 ||
      site.sourceBlendSha256 !== model.blendSha256 || model.identity !== identity.key)
    throw new Error(`CAD site ${model.id} neodpovídá exportovanému modelu.`);
  return { id: model.id, osmId, identity, url: `/models/cad-buildings/${model.id}.glb?v=${model.glbSha256}`,
    glbSha256: model.glbSha256, sourceRecipeSha256, placement, model, site };
}

export const CAD_BUILDINGS = [
  building(b01 as CadBuildingModel, b01Site, "53929063",
    "d1202adf453178e8abeeab3096315efd74d99857e68b1182d33cc64c0248ac42", photoAlignment.buildings.b01.placement),
  building(b06 as CadBuildingModel, b06Site, "53929071",
    "e533bb5d7df909746f4f0dc171de8cc332b85ba10e25f4b76958e9f53db8dee8", photoAlignment.buildings.b06.placement),
] as const;

const replacements = new Set<string>(CAD_BUILDINGS.map((building) => building.osmId));
export const hasCadBuilding = (osmId: string) => replacements.has(osmId);

export function cadDoorPosition(buildingId: string, doorId: string): Vec3 | undefined {
  const building = CAD_BUILDINGS.find(item => item.id === buildingId);
  const door = building?.model.doors.find(item => item.id === doorId);
  if (!building || !door) return undefined;
  const dx = door.closedEnd[0] - door.hinge[0], dy = door.closedEnd[1] - door.hinge[1];
  const width = Math.hypot(dx, dy), offset = door.normalOffset ?? 0;
  const x = (door.hinge[0] + door.closedEnd[0]) / 2 - dy / width * offset;
  const y = (door.hinge[1] + door.closedEnd[1]) / 2 + dx / width * offset;
  return cadLocalToWorld({ x: -(y - building.model.cadOrigin[1]), y: door.bottom,
    z: -(x - building.model.cadOrigin[0]) }, building.placement);
}

export function cadLevelHeight(buildingId: string, floorId: string, level = "main"): number | undefined {
  const building = CAD_BUILDINGS.find(item => item.id === buildingId);
  const floor = building?.model.floors.find(item => item.id === floorId);
  const height = level === "main" ? floor?.elevation : floor?.levelElevations?.[level];
  return building && height !== undefined ? height + building.placement.translation.y : undefined;
}

type CadCollisionPart = {
  id: string;
  buildingId: string;
  floor: string;
  role: string;
  positions: Float32Array;
  indices: Uint32Array;
};
let collisionCache: readonly CadCollisionPart[] | undefined;
export function cadCollisionParts(): readonly CadCollisionPart[] {
  return collisionCache ??= CAD_BUILDINGS.flatMap((building) =>
    building.model.parts.map((part) => ({
      id: part.id,
      buildingId: building.id,
      floor: part.floor,
      role: part.role,
      positions: transformCadPositions(part.positions, building.placement),
      indices: Uint32Array.from(part.indices),
    })),
  );
}

export const CAD_TERRAIN_CUTOUTS = CAD_BUILDINGS.flatMap((building) =>
  building.site.terrainCutouts.map((polygon) => ({
    id: `${building.id}:${polygon.id}`,
    loops: polygon.loops.map((ring) => ring.map(([x, z]) => {
      const world = cadLocalToWorld({ x, y: 0, z }, building.placement);
      return [world.x, world.z] as [number, number];
    })),
  })),
);

/** position is the actor capsule center. The roof is outside unless another
 * actual modeled cover lies above it; open courtyards/shafts remain outside. */
export function cadZoneAt(position: Vec3): string | undefined {
  for (const building of CAD_BUILDINGS) {
    const local = cadWorldToLocal(position, building.placement);
    const space = cadSpaceAtLocalPosition(building.site, local);
    if (space) return `${building.id}:${space.floor}`;
  }
  return undefined;
}

/** Native main entrance, including measured stair orientation and support.
 * This is cached once; navigation, labels and NPCs share the authored model. */
export const CAD_B6_ENTRY = (() => {
  const building = CAD_BUILDINGS.find(item => item.id === "b06")!;
  const door = building.model.doors.find(item => item.id === "n01-door-12E1");
  const flight = building.model.stairs.find(item => item.routeId === "b06-main-entry");
  if (!door || !flight) throw new Error("Missing native B6 main entrance annotations");
  const position = cadDoorPosition(building.id, door.id)!;
  const world = (cad: number[], height: number) => cadLocalToWorld({
    x: -(cad[1] - building.model.cadOrigin[1]), y: height, z: -(cad[0] - building.model.cadOrigin[0]),
  }, building.placement);
  const start = world(flight.a, flight.bottom), end = world(flight.b, flight.top);
  const hinge = world(door.hinge, door.bottom), closed = world(door.closedEnd, door.bottom);
  const width = Math.hypot(closed.x - hinge.x, closed.z - hinge.z);
  let nx = -(closed.z - hinge.z) / width, nz = (closed.x - hinge.x) / width;
  if (nx * (start.x - end.x) + nz * (start.z - end.z) < 0) { nx = -nx; nz = -nz; }
  const treads = (flight.surfaces as {centerCad: number[]; height: number}[]).map(item => world(item.centerCad, item.height));
  const margin = flight.width / 2 + .5;
  const bounds = { minX: Math.min(start.x, position.x) - margin, maxX: Math.max(start.x, position.x) + margin,
    minZ: Math.min(start.z, position.z) - margin, maxZ: Math.max(start.z, position.z) + margin };
  const surfaces = building.site.supportSurfaces.filter(surface => surface.floor === flight.floor && surface.role !== "canopy");
  return { ...position, nx, nz, start, end, treads, bounds, surfaces, building, doorId: door.id,
    baseY: start.y, rise: position.y - start.y, steps: treads.length + 1 };
})();

export function cadB6EntranceHeight(x: number, z: number): number | undefined {
  const entry = CAD_B6_ENTRY, b = entry.bounds;
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return undefined;
  const local = cadWorldToLocal({x, y: entry.y, z}, entry.building.placement);
  let height: number | undefined;
  for (const surface of entry.surfaces) {
    const y = cadSurfaceHeightAtXZ(surface, local.x, local.z);
    if (y !== undefined && y <= local.y + .001 && (height === undefined || y > height)) height = y;
  }
  return height === undefined ? undefined : height + entry.building.placement.translation.y;
}
