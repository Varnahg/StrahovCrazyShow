/** Replay native accessibility evidence through the actual game Actor. */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import RAPIER from "@dimforge/rapier3d-compat";
import { cadLocalToWorld, cadPolygonContainsXZ, cadSurfaceHeightAtXZ, type CadPlacement, type CadPolygon, type CadSurface } from "../../shared/cad-building-geometry";
import type { Actor, Simulation } from "../../shared/simulation";
import type { Input, Vec3 } from "../../shared/types";
import type { CadDoorDefinition } from "../../shared/cad-doors";
const doorHelpers = await import(new URL("./rapier_model.mjs", import.meta.url).href);

type Settings = { radius: number; halfHeight: number; offset: number; autostepHeight: number; autostepWidth: number; snap: number; gravity: number; dt: number; speed: number };
type Point = { x: number; z: number; floor: number | null; support?: { height?: number; capsuleFootHeight?: number } };
type Door = { id: string; bottom: number; accessConfirmed?: boolean; openingClassification?: string; [key: string]: unknown };
type Flight = { id: string; routeId?: string; routeIndex?: number; routeSegmentCount?: number; routeAccessPath?: unknown; terrainValidationPending?: boolean; sourcePlanId?: string; sourceEntities?: string[]; lowerLevelKey?: string; upperLevelKey?: string; [key: string]: unknown };
export type PathBuilding = { id: string; placement: CadPlacement; glbSha256: string; site: { sourceCollisionSha256: string; terrainCutouts?: readonly CadPolygon[]; supportSurfaces?: readonly CadSurface[] }; model: { id: string; cadOrigin: number[]; doors: Door[]; stairs: Flight[]; parts?: unknown[]; interactiveDoors?: readonly CadDoorDefinition[] } };
export type TraceIdentity = { modelCollisionSha256: string; modelGlbSha256: string; actorSourceSha256: string; validatorSha256: string; rapierHelperSha256: string; settings: Settings };
type Anchor = { id: string; point: Point; reference: number; kind: "door" | "route"; exterior: boolean; routeId?: string; index?: number; sourceDoorId?: string };
type Route = { path: Point[]; exterior: boolean; outsideIndices: number[] };
type Leg = { target: Point; passed: boolean; finish: Vec3; remaining: number; footError: number | null };
type Step = { passed: boolean; context: { from: string; to: string }; legs: Leg[] };
type Session = { session: number; seed: string; start: Point; setup: { setupValid: boolean; initialFootError: number; overlaps: unknown[] }; steps: Step[] };
type Result = { id: string; doorId: string; point: Point; passed: boolean; proof: null | { session: number; seed: string; afterStep: number } };
type Excluded = { id: string; doorId?: string; category: string; protectionVerified?:boolean;role?:string };
type Trace = { doorRuntimeSha256?: string; doorStateAssumption?: unknown; profile: string; settings: Settings; modelCollisionSha256: string; modelGlbSha256: string; actorSourceSha256: string; inputSha256: { validator: string; rapierHelper: string }; seeds: string[]; cases: number; passed: number; results: Result[]; excluded: Excluded[]; proofSessions: Session[]; options: { spacing: number }; stats: { moves: number; restarts: number } };
export type TraceContext = { building: PathBuilding; identity: TraceIdentity; anchors: Map<string, Anchor>; routes: Map<string, Route>; expectedDoorIds: string[]; fixedDoors: Set<string>; fixedOpenings: Map<string,{category:string;role:string;coverage:{passed:boolean}}> };
export type ValidatedTrace = { context: TraceContext; trace: Trace };
export type ValidatedExteriorDoor = { id: string; outsideId: string; insideId: string; outside: Point; inside: Point; reference: number; sourceEntities: string[]; provenance: string };
export type WorldRuntime = Pick<Simulation, "world" | "walkingColliders" | "add" | "remove" | "tick" | "dispose"> & Partial<Pick<Simulation,"doorPhysics"|"doorCapsules"|"doorObstacles">>;
const sha = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
const close = (a: number, b: number, tolerance = 1e-5) => Math.abs(a - b) <= tolerance;
const sameXZ = (a: Point, b: Point) => close(a.x, b.x) && close(a.z, b.z);
const samePoint = (a: Point, b: Point) => sameXZ(a, b) && (a.floor === null ? b.floor === null : finite(b.floor) && close(a.floor, b.floor));
function need(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
function point(value: Point, nullable = false) {
  need(value && finite(value.x) && finite(value.z) && (finite(value.floor) || (nullable && value.floor === null)), "Invalid trace point");
  if (value.support) {
    need(finite(value.floor) && finite(value.support.height) && close(value.support.height, value.floor), "Invalid trace support height");
    if (value.support.capsuleFootHeight !== undefined) need(finite(value.support.capsuleFootHeight), "Invalid trace capsule support");
  }
}
const canonicalSettings = (settings: Settings) => Object.keys(settings).sort().map(k => `${k}:${settings[k as keyof Settings]}`).join("|");

/** Uses the same native annotation helpers as the source report, without
 * constructing a second physics world or character controller. */
export async function createTraceContext(building: PathBuilding, identity: TraceIdentity): Promise<TraceContext> {
  const { doorApproachGeometry, fixedOpeningSpec } = await import(new URL("./rapier_model.mjs", import.meta.url).href);
  const { fixedOpeningCoverage } = await import(new URL("./verify_doors.mjs", import.meta.url).href);
  const { routePath } = await import(new URL("./verify_routes.mjs", import.meta.url).href);
  need(building.id === building.model.id && building.glbSha256 === identity.modelGlbSha256 && building.site.sourceCollisionSha256 === identity.modelCollisionSha256, "Registered building identity mismatch");
  const local = ([x, y]: number[]) => ({ x: -(y - building.model.cadOrigin[1]), z: -(x - building.model.cadOrigin[0]) });
  const anchors = new Map<string, Anchor>(), routes = new Map<string, Route>(), fixedDoors = new Set<string>(), expectedDoorIds: string[] = [];
  const fixedOpenings:TraceContext['fixedOpenings']=new Map();
  const doorIds = new Set<string>();
  for (const door of building.model.doors) {
    need(typeof door.id === "string" && door.id.length > 0 && !doorIds.has(door.id), "Invalid or duplicate native door ID"); doorIds.add(door.id);
    const fixed=fixedOpeningSpec(door);
    if (fixed) {
      fixedDoors.add(door.id);
      fixedOpenings.set(door.id,{category:fixed.exclusionCategory,role:fixed.role,coverage:fixedOpeningCoverage({local,model:building.model},door)});
      continue;
    }
    const approaches = doorApproachGeometry({ local, settings: identity.settings }, door).points as { x: number; z: number }[];
    for (const [side, p] of approaches.entries()) {
      const id = `door:${door.id}:side:${side}`;
      need(!anchors.has(id), "Duplicate model door ID"); expectedDoorIds.push(id);
      anchors.set(id, { id, point: { ...p, floor: door.bottom }, reference: door.bottom, kind: "door", sourceDoorId:door.id,exterior: door.accessConfirmed === true });
    }
  }
  need(expectedDoorIds.length > 0, "Model has no annotated open door points to verify");
  const groups = new Map<string, Flight[]>();
  for (const flight of building.model.stairs) { const id = flight.routeId ?? flight.id; const group = groups.get(id) ?? []; group.push(flight); groups.set(id, group); }
  for (const [id, flights] of groups) {
    flights.sort((a, b) => (a.routeIndex ?? 0) - (b.routeIndex ?? 0));
    need(flights.every((f, i) => !f.routeId || (f.routeIndex === i && f.routeSegmentCount === flights.length)), "Incomplete native route");
    const path = routePath({ local }, flights, flights[0].routeAccessPath ?? {}) as Point[];
    path.forEach(p => point(p, true)); need(path.length >= 2 && path[0].floor !== null && path.at(-1)!.floor !== null, "Invalid native route endpoints");
    const exterior = flights.every(f => f.terrainValidationPending === true && f.sourcePlanId === id && !!f.sourceEntities?.length);
    const outsideIndices: number[] = [];
    if (exterior && flights[0].lowerLevelKey?.startsWith("exterior.")) outsideIndices.push(0);
    if (exterior && flights.at(-1)!.upperLevelKey?.startsWith("exterior.")) outsideIndices.push(path.length - 1);
    routes.set(id, { path, exterior, outsideIndices });
    path.forEach((p, index) => {
      if (p.floor === null) return;
      const nodeId = `route:${id}:${index === 0 ? "lower" : index === path.length - 1 ? "upper" : `waypoint:${index}`}`;
      anchors.set(nodeId, { id: nodeId, point: p, reference: p.floor, kind: "route", exterior: exterior && (index === 0 || index === path.length - 1), routeId: id, index });
    });
  }
  return { building, identity, anchors, routes, expectedDoorIds, fixedDoors, fixedOpenings };
}

/** Structural validation is deliberately independent of the world replay.
 * A forged success flag cannot omit an expected door side or skip trace legs. */
export function validateWorldTrace(raw: unknown, context: TraceContext): ValidatedTrace {
  const trace = raw as Trace, identity = context.identity;
  need(trace && trace.profile === "current", "Only a fresh current-profile trace is accepted");
  if(context.building.model.interactiveDoors?.length) {
    const expected=doorHelpers.requireCoverageDoorState(context.building.model,'all-interactive-open');
    need(JSON.stringify(trace.doorStateAssumption)===JSON.stringify(expected),'Missing/stale explicit interactive door-state assumption');
    need(trace.doorRuntimeSha256===doorHelpers.doorRuntimeSha256(),'Stale shared door runtime trace');
  }
  for (const key of ["modelCollisionSha256", "modelGlbSha256", "actorSourceSha256"] as const) need(trace[key] === identity[key], `Trace identity mismatch: ${key}`);
  need(canonicalSettings(trace.settings) === canonicalSettings(identity.settings), "Trace controller settings mismatch");
  need(trace.inputSha256?.validator === identity.validatorSha256 && trace.inputSha256?.rapierHelper === identity.rapierHelperSha256, "Trace validator source mismatch");
  need(Array.isArray(trace.results) && Array.isArray(trace.excluded) && Array.isArray(trace.proofSessions) && Array.isArray(trace.seeds), "Incomplete trace arrays");
  need(trace.cases === trace.results.length && trace.passed === trace.results.filter(row => row.passed === true).length, "Trace case totals mismatch");
  need(trace.seeds.length > 0 && new Set(trace.seeds).size === trace.seeds.length, "Invalid trace seeds");
  const spacing = trace.options?.spacing;
  need(finite(spacing) && spacing >= .15 && spacing <= 2, "Invalid trace grid spacing");
  const observed = new Map<string, Point>();
  function checkNode(id: string, p: Point) {
    point(p);
    const native = context.anchors.get(id);
    if (native) {
      need(sameXZ(p, native.point), `Anchor XY differs from native annotation: ${id}`);
      need(Math.abs(p.floor! - native.reference) <= (native.kind === "door" ? .65 : 1e-4), `Anchor floor differs from native annotation: ${id}`);
    } else {
      const match = /^grid:(\d+):(-?\d+):(-?\d+)$/.exec(id);
      need(match && close(p.x, Number(match[2]) * spacing) && close(p.z, Number(match[3]) * spacing), `Unknown or displaced trace node: ${id}`);
    }
    const previous = observed.get(id);
    if (previous) {
      // A native annotation and its ray-measured grid connector can differ by
      // a few tens of micrometres. Use the existing 0.1mm native height bound
      // for this comparison too; XY and anonymous grid nodes stay strict.
      const same = native ? sameXZ(p,previous) && finite(p.floor) && finite(previous.floor) && close(p.floor,previous.floor,1e-4) : samePoint(p,previous);
      need(same, `Node changes position inside trace: ${id}`);
    }
    observed.set(id, p);
  }
  for (const seed of trace.seeds) need(context.anchors.get(seed)?.exterior, `Seed is not a native exterior entry: ${seed}`);
  const sessions = new Map<number, Session>(); let moves = 0;
  for (const session of trace.proofSessions) {
    need(Number.isSafeInteger(session.session) && session.session > 0 && !sessions.has(session.session) && trace.seeds.includes(session.seed), "Invalid or duplicate trace session");
    sessions.set(session.session, session); checkNode(session.seed, session.start);
    need(session.setup && typeof session.setup.setupValid === "boolean" && finite(session.setup.initialFootError) && Array.isArray(session.setup.overlaps) && Array.isArray(session.steps), "Invalid trace setup");
    if (session.setup.setupValid) need(Math.abs(session.setup.initialFootError) < .07 && session.setup.overlaps.length === 0, "Successful trace setup has no valid support/overlap evidence");
    let cursor = session.seed, failed = !session.setup.setupValid;
    for (const step of session.steps) {
      need(!failed && step.context?.from === cursor && typeof step.context.to === "string" && typeof step.passed === "boolean" && Array.isArray(step.legs), "Discontinuous trace context or steps after failure");
      const from = context.anchors.get(step.context.from), to = context.anchors.get(step.context.to);
      let nativePath: Point[] | undefined;
      if (from?.routeId && from.routeId === to?.routeId) {
        const full = context.routes.get(from.routeId)!.path, lo = Math.min(from.index!, to.index!), hi = Math.max(from.index!, to.index!);
        nativePath = full.slice(lo, hi + 1); if (from.index! > to.index!) nativePath.reverse();
      }
      need(step.legs.length > 0 && (nativePath ? step.legs.length <= nativePath.length - 1 : step.legs.length === 1), "Truncated or invented trace route legs");
      if (step.passed && nativePath) need(step.legs.length === nativePath.length - 1, "Successful trace omitted a route waypoint");
      for (const [index, leg] of step.legs.entries()) {
        point(leg.target, !!nativePath); moves++;
        if (nativePath) need(samePoint(leg.target, nativePath[index + 1]), "Trace route target differs from native waypoint");
        need(typeof leg.passed === "boolean" && leg.finish && [leg.finish.x, leg.finish.y, leg.finish.z, leg.remaining].every(finite), "Invalid trace leg evidence");
        if (leg.passed) {
          const remaining = Math.hypot(leg.finish.x - leg.target.x, leg.finish.z - leg.target.z);
          need(remaining < .08 && close(remaining, leg.remaining), "Trace leg has no successful final XY");
          if (leg.target.floor !== null) {
            const sourceFloor = leg.target.support?.capsuleFootHeight ?? leg.target.floor;
            const error = leg.finish.y - sourceFloor - identity.settings.radius - identity.settings.halfHeight - identity.settings.offset;
            need(finite(leg.footError) && Math.abs(error) < .10 && close(error, leg.footError), "Trace leg has no successful final support");
          }
        } else need(index === step.legs.length - 1 && !step.passed, "Trace continues after a failed leg");
      }
      need(!step.passed || step.legs.every(leg => leg.passed), "Successful trace step contains failure");
      if (step.passed || !nativePath) checkNode(step.context.to, step.legs.at(-1)!.target);
      failed = !step.passed; cursor = step.context.to;
    }
  }
  need(trace.stats?.moves === moves && trace.stats.restarts === sessions.size && trace.seeds.every(seed => [...sessions.values()].some(s => s.seed === seed)), "Trace sessions or movement totals are incomplete");
  const accounted = new Set<string>(), fixed = new Set<string>();
  for (const row of trace.results) {
    const native = context.anchors.get(row.id);
    need(native?.kind === "door" && row.id.startsWith(`door:${row.doorId}:side:`) && !accounted.has(row.id) && typeof row.passed === "boolean", "Invalid or duplicate result door ID");
    accounted.add(row.id); checkNode(row.id, row.point);
    if (row.passed) {
      const proof = row.proof, session = proof && sessions.get(proof.session);
      need(proof && session && proof.seed === session.seed && Number.isSafeInteger(proof.afterStep) && proof.afterStep >= 0 && proof.afterStep <= session.steps.length, "Missing or truncated result proof");
      need(session.setup.setupValid && session.steps.slice(0, proof.afterStep).every(step => step.passed), "Result references a failed prefix");
      if (proof.afterStep === 0) need(row.id === session.seed && samePoint(row.point, session.start), "Result invents a setup-only visit");
      else { const last = session.steps[proof.afterStep - 1]; need(last.context.to === row.id && samePoint(last.legs.at(-1)!.target, row.point), "Result proof does not visit its door point"); }
    } else need(row.proof === null, "Unreached result carries a success proof");
  }
  for (const row of trace.excluded) {
    if (row.category === "fixed-facade-glazing" || row.category === "fixed-paired-door-leaf") {
      const protection=context.fixedOpenings.get(row.id);
      need(protection&&protection.category===row.category&&!fixed.has(row.id),"Unknown, misclassified or duplicate fixed opening");
      need(row.protectionVerified===true && row.role===protection.role && protection.coverage.passed,"Fixed opening has no verified native protection");
      fixed.add(row.id);
    }
    else { need(context.expectedDoorIds.includes(row.id) && !accounted.has(row.id) && ["external-pending-terrain", "unclassified-missing-support", "missing-model-floor"].includes(row.category), "Unknown or duplicate excluded door side"); accounted.add(row.id); }
  }
  need(accounted.size === context.expectedDoorIds.length && context.expectedDoorIds.every(id => accounted.has(id)) && fixed.size === context.fixedDoors.size, "Trace omitted model door points");
  return { context, trace };
}

/** Explicit evidence may identify an exterior-only room, but cannot supply
 * coordinates, heights or an arbitrary interior spawn. Native geometry decides. */
export function validateExteriorDoorConfig(raw: unknown, validated: ValidatedTrace): ValidatedExteriorDoor[] {
  const config = raw as { schemaVersion: number; buildingId: string; modelCollisionSha256: string; entries: { id: string; outsideSide: number; sourceEntities: string[]; provenance: string }[] };
  const { context, trace } = validated, { building } = context;
  need(config && Object.keys(config).every(k => ["schemaVersion", "buildingId", "modelCollisionSha256", "entries"].includes(k)) && config.schemaVersion === 1,
    "Invalid exterior-door config schema or forbidden coordinate fields");
  need(config.buildingId === building.id && config.modelCollisionSha256 === context.identity.modelCollisionSha256, "Exterior-door config identity mismatch");
  need(Array.isArray(config.entries) && config.entries.length > 0, "Exterior-door config needs entries");
  const cutouts = building.site.terrainCutouts, surfaces = building.site.supportSurfaces;
  need(Array.isArray(cutouts) && Array.isArray(surfaces), "Exterior-door config requires native site geometry");
  const ids = new Set<string>();
  return config.entries.map(entry => {
    need(entry && Object.keys(entry).every(k => ["id", "outsideSide", "sourceEntities", "provenance"].includes(k)) && [0, 1].includes(entry.outsideSide), "Invalid exterior-door entry or forbidden coordinate fields");
    need(typeof entry.provenance === "string" && entry.provenance.trim().length > 0, "Exterior-door entry requires nonempty provenance");
    need(!ids.has(entry.id), "Duplicate exterior-door entry"); ids.add(entry.id);
    const door = building.model.doors.find(d => d.id === entry.id);
    need(door && !["facade-opening-unconfirmed-access","fixed-paired-door-leaf"].includes(door.openingClassification??""), "Exterior-door config names an unknown or fixed-glass/door-leaf opening");
    const actual = door.sourceEntities;
    need(Array.isArray(actual) && actual.length > 0 && actual.every(x => typeof x === "string") && Array.isArray(entry.sourceEntities) &&
      entry.sourceEntities.length > 0 && entry.sourceEntities.every(x => typeof x === "string" && x.length > 0) &&
      new Set(entry.sourceEntities).size === entry.sourceEntities.length && JSON.stringify([...actual].sort()) === JSON.stringify([...entry.sourceEntities].sort()), "Exterior-door source handles mismatch");
    const outsideId = `door:${door.id}:side:${entry.outsideSide}`, insideId = `door:${door.id}:side:${1 - entry.outsideSide}`;
    const outside = context.anchors.get(outsideId)!, inside = context.anchors.get(insideId)!;
    need(outside && inside && trace.excluded.some(row => row.id === outsideId && ["external-pending-terrain", "unclassified-missing-support", "missing-model-floor"].includes(row.category)),
      "Exterior point must be explicitly excluded for missing native support");
    const hasFloor = (p: Point) => surfaces.some(surface => { const height = cadSurfaceHeightAtXZ(surface, p.x, p.z); return height !== undefined && Math.abs(height - door.bottom) <= .65; });
    const inCutout = (p: Point) => cutouts.some(polygon => cadPolygonContainsXZ(polygon, p.x, p.z));
    need(!inCutout(outside.point) && !hasFloor(outside.point), "Configured outside is inside native geometry or has native floor support");
    need(inCutout(inside.point) && hasFloor(inside.point), "Configured inside lacks native interior footprint/floor support");
    return { id: door.id, outsideId, insideId, outside: { ...outside.point, floor: null }, inside: { ...inside.point, floor: null },
      reference: door.bottom, sourceEntities: [...entry.sourceEntities], provenance: entry.provenance.trim() };
  });
}

/** Spawn at the explicitly annotated outdoor end when it is unambiguous, then
 * traverse the original route to the trace start before accepting any result. */
export function entryPlan(validated: ValidatedTrace, session: Session) {
  const anchor = validated.context.anchors.get(session.seed)!;
  const limitations: string[] = [], prefix: Point[] = [];
  let outdoorEndpointIdentified = false;
  let start = anchor.kind === "door" ? session.start : anchor.point;
  let reference = anchor.reference;
  if (anchor.routeId) {
    const route = validated.context.routes.get(anchor.routeId)!;
    if (route.outsideIndices.length === 1) {
      outdoorEndpointIdentified = true;
      const outside = route.outsideIndices[0]; start = route.path[outside]; reference = start.floor!;
      if (outside !== anchor.index) {
        const path = route.path.slice(Math.min(outside, anchor.index!), Math.max(outside, anchor.index!) + 1);
        if (outside > anchor.index!) path.reverse(); prefix.push(...path.slice(1));
      }
    } else limitations.push("Native exterior route does not unambiguously label which endpoint connects to outdoor terrain; replay begins at the exact declared seed.");
  } else limitations.push("Confirmed exterior door has no native annotation of its outdoor side; replay begins at the exact declared door point.");
  limitations.push("The outdoor journey before the annotated entry is outside this trace; terrainValidationPending is not a terrain-pass certificate.");
  return { start, reference, prefix, outdoorEndpointIdentified, terrainApproachVerified: false, limitations };
}

export function supportAt(sim: WorldRuntime, local: Point, reference: number, validated: ValidatedTrace, capsule: RAPIER.Capsule) {
  const { building, identity: { settings } } = validated.context;
  const world = cadLocalToWorld({ x: local.x, y: reference, z: local.z }, building.placement);
  const filter = (c: RAPIER.Collider) => !sim.walkingColliders.has(c.handle);
  const ray = new RAPIER.Ray({ ...world, y: world.y + .65 }, { x: 0, y: -1, z: 0 });
  const hit = sim.world.castRayAndGetNormal(ray, 1.3, false, undefined, undefined, undefined, undefined, filter);
  if (!hit || hit.normal.y <= .5) return null;
  const height = ray.origin.y - hit.timeOfImpact, footOffset = settings.radius + settings.halfHeight + settings.offset;
  const castY = height + footOffset + .4;
  const sweep = sim.world.castShape({ x: world.x, y: castY, z: world.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: -1, z: 0 },
    capsule, settings.offset, .8, true, undefined, undefined, undefined, undefined, filter);
  const sweptFloor = sweep ? castY - sweep.time_of_impact - footOffset : height;
  const capsuleFloor = sweep && sweep.normal1.y > .5 && Math.abs(sweptFloor - height) <= settings.autostepHeight + .02 ? sweptFloor : height;
  return { x: world.x, z: world.z, height, capsuleFloor, collider: hit.collider.handle, capsuleCollider: sweep?.collider.handle ?? null };
}
export function assertLiveController(actor: Actor, settings: Settings) {
  need(close(actor.controller.offset(), settings.offset) && close(actor.controller.autostepMaxHeight()!, settings.autostepHeight) &&
    close(actor.controller.autostepMinWidth()!, settings.autostepWidth) && close(actor.controller.snapToGroundDistance()!, settings.snap) &&
    actor.controller.slideEnabled() && actor.controller.autostepIncludesDynamicBodies() === false, "Live Actor controller differs from source profile");
  const shape = actor.collider.shape as RAPIER.Capsule;
  need(close(shape.radius, settings.radius) && close(shape.halfHeight, settings.halfHeight), "Live Actor capsule differs from source profile");
}
export function forbidRecovery(actor: Actor) {
  const forbid = () => { throw new Error("Forbidden Actor teleport/recovery during continuous replay"); };
  actor.setPosition = forbid; actor.resetOnFoot = forbid; actor.restore = forbid; actor.setVehicle = forbid;
}
type DoorJumpEvidence = { targetId: string; doorId: string; reason: "native-declared-threshold" | "missing-support-counterpart" };
export function walkActorLeg(actor: Actor, target: { x: number; z: number }, capsuleFloor: number | null, settings: Settings,
  tick: (x: number, z: number, jump: boolean) => void, jumpEvidence?: DoorJumpEvidence,
  interaction?: {beforeMove(actor:Actor,target:{x:number;z:number}):void|{wait?:boolean;target?:{x:number;z:number}}},arrivalTolerance=.1) {
  need(Number.isFinite(arrivalTolerance)&&arrivalTolerance>0&&arrivalTolerance<=.1,"Arrival tolerance cannot loosen the actual path proof");
  const origin = { ...actor.position }, footOffset = settings.radius + settings.halfHeight + settings.offset;
  const budget = Math.ceil(Math.hypot(target.x - origin.x, target.z - origin.z) / settings.speed / settings.dt) + 180;
  const advance = (jump: boolean) => {
    const decision=interaction?.beforeMove(actor,target),moveTarget=decision?.target??target;
    const p = actor.position, dx = moveTarget.x - p.x, dz = moveTarget.z - p.z, scale = Math.max(Math.hypot(dx, dz), .08);
    const waiting=decision?.wait===true,detour=!!decision?.target;
    if(waiting)interactionWaitFrames++;if(detour)interactionDetourFrames++;
    lastJumpApplied=jump&&!waiting&&!detour;
    tick(waiting?0:dx / scale, waiting?0:dz / scale, lastJumpApplied);
    if(waiting||detour)return false;
    return Math.hypot(actor.position.x - target.x, actor.position.z - target.z) < arrivalTolerance && actor.grounded &&
      (capsuleFloor === null || Math.abs(actor.position.y - capsuleFloor - footOffset) < .14);
  };
  let passed = false, walkFrames = 0, heldFrames = 0, heldIterations=0, jumpFrames = 0,interactionWaitFrames=0,interactionDetourFrames=0,lastJumpApplied=false;
  while (walkFrames < budget && !passed) { walkFrames++; passed = advance(false); }
  // Source walking failures stay failures in the input report. Only an actual
  // native door target with evidence may request the same held input as the UI.
  // Measure from the CURRENT foot after walking: never reset to the leg origin.
  const fromFoot = actor.position.y - footOffset, rise = capsuleFloor === null ? null : capsuleFloor - fromFoot;
  const jump = !passed && jumpEvidence && rise !== null && rise > settings.autostepHeight && rise < 1
    ? { ...jumpEvidence, fromFoot, targetFloor: capsuleFloor, rise } : null;
  if (jump) {
    for (; heldFrames < 8&&heldIterations<188; heldIterations++) {advance(true);if(lastJumpApplied)heldFrames++;}
    while (jumpFrames < 180 && !passed) { jumpFrames++; passed = advance(false); }
  }
  return { passed, traversal: heldFrames>0 ? "jump" : "walk", heldFrames, walkFrames, jumpFrames, jumpEvidence: heldFrames>0?jump:null,
    frames: walkFrames + heldIterations + jumpFrames, arrivalTolerance,interactionWaitFrames,interactionDetourFrames, finish: { ...actor.position }, grounded: actor.grounded };
}

/** One Actor per session; no reset/teleport or recovery is permitted once added.
 * The injected runtime exists only to exercise the real Actor with tiny CPU
 * fixtures. The CLI always constructs the complete production Simulation. */
export function replayWorldTrace(validated: ValidatedTrace, createSimulation: () => WorldRuntime, runtimeScope: "full-game" | "fixture" = "fixture", exteriorDoors: readonly ValidatedExteriorDoor[] = []) {
  const { context, trace } = validated, settings = context.identity.settings, footOffset = settings.radius + settings.halfHeight + settings.offset;
  const covered = new Map<string, { session: number; afterStep: number; position: Vec3; proofKind: "source-trace" | "world-door-extension" | "configured-exterior-door"; extension?: number }>(), sessions: unknown[] = [];
  const missingSupport = new Set(trace.excluded.filter(row => ["external-pending-terrain", "unclassified-missing-support", "missing-model-floor"].includes(row.category)).map(row => row.id));
  const doorJumps = new Map<string, DoorJumpEvidence>();
  for (const door of context.building.model.doors) for (const side of [0, 1]) {
    const targetId = `door:${door.id}:side:${side}`, counterpartId = `door:${door.id}:side:${1 - side}`;
    if (context.anchors.get(targetId)?.kind !== "door") continue;
    const reason = door.outsideTraversalStatus === "requires-native-jump-validation" ? "native-declared-threshold" :
      missingSupport.has(counterpartId) ? "missing-support-counterpart" : null;
    if (reason) doorJumps.set(targetId, { targetId, doorId: door.id, reason });
  }
  const capsule = new RAPIER.Capsule(settings.halfHeight, settings.radius);
  const sim = createSimulation(); let liveId: string | undefined;
  let interactions: ReturnType<typeof doorHelpers.createDoorInteractionProbe> | undefined;
  const approachInteraction=(sourceDoorId?:string)=>interactions?{
    beforeMove:(actor:Actor,target:{x:number;z:number})=>interactions!.beforeMove(actor,target,sourceDoorId),
  }:undefined;
  const idle: Input = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  const supportError = (target: Point, support: NonNullable<ReturnType<typeof supportAt>>) => {
    if (target.floor !== null && !close(support.height - context.building.placement.translation.y, target.floor, .005)) return "Trace ray floor differs from actual world";
    if (target.support?.capsuleFootHeight !== undefined && !close(support.capsuleFloor - context.building.placement.translation.y, target.support.capsuleFootHeight, .005)) return "Trace capsule support differs from actual world; override rejected";
    return null;
  };
  try {
    if(context.building.model.interactiveDoors?.length) {
      const physics=doorHelpers.requireNativeDoorPhysics(sim,context.building.model);
      interactions=doorHelpers.createDoorInteractionProbe(physics,settings,sim.doorCapsules?.bind(sim),sim.doorObstacles?.bind(sim));
    }
    need(close(sim.world.timestep, settings.dt) && close(sim.world.gravity.y, -settings.gravity) && close(sim.world.gravity.x, 0) && close(sim.world.gravity.z, 0), "World timestep/gravity differs from trace profile");
    sim.tick(0);interactions?.advance();
    for (const source of trace.proofSessions) {
      const plan = entryPlan(validated, source), measured = supportAt(sim, plan.start, plan.reference, validated, capsule);
      const row = { session: source.session, seed: source.seed, entry: plan, support: measured, entrySupportVerified: false, entryPrefixVerified: null as boolean | null,
        setup: null as unknown, prefix: [] as unknown[], steps: [] as unknown[], extensions: [] as unknown[], passed: false, error: null as string | null };
      sessions.push(row); if (!measured) { row.error = "Entry has no world support"; continue; }
      const entryError = supportError(plan.start, measured); if (entryError) { row.error = entryError; continue; }
      liveId = `cad-world-path:${context.building.id}:${source.session}`;
      const actor = sim.add(liveId, { x: measured.x, y: measured.capsuleFloor + footOffset + .08, z: measured.z });
      let sequence = 0, frames = 0;
      try {
        assertLiveController(actor, settings);
        forbidRecovery(actor);
        const tick = (input: Input) => { actor.step(input, settings.dt); sim.tick(0); interactions?.advance();frames++; };
        for (let i = 0; i < 80; i++) tick(idle);
        const overlaps: number[] = [];
        sim.world.intersectionsWithShape(actor.position, { x: 0, y: 0, z: 0, w: 1 }, actor.collider.shape, c => { overlaps.push(c.handle); return true; }, undefined, undefined, actor.collider, actor.body,c=>!sim.walkingColliders.has(c.handle));
        const setupError = actor.position.y - measured.capsuleFloor - footOffset;
        row.setup = { position: { ...actor.position }, grounded: actor.grounded, setupError, overlaps };
        if (!actor.grounded || Math.abs(setupError) >= .1 || overlaps.length) { row.error = "Invalid Actor entry setup"; continue; }
        row.entrySupportVerified = true;
        function move(target: Point, targetId?: string) {
          const native = targetId && context.anchors.get(targetId);
          const reference = native ? native.reference : target.floor;
          const support = reference === null ? null : supportAt(sim, target, reference, validated, capsule);
          if (reference !== null && !support) return { passed: false, target, support, reason: "No world support at target" };
          const disagreement = support && supportError(target, support);
          if (disagreement) return { passed: false, target, support, reason: disagreement };
          const world = cadLocalToWorld({ x: target.x, y: 0, z: target.z }, context.building.placement);
          return { ...walkActorLeg(actor, world, support?.capsuleFloor ?? null, settings,
            (x, z, jump) => tick({ ...idle, x, z, jump, seq: ++sequence }), targetId ? doorJumps.get(targetId) : undefined,approachInteraction(native?native.sourceDoorId:undefined)), target, support };
        }
        let healthy = true;
        for (const target of plan.prefix) { const leg = move(target); row.prefix.push(leg); if (!leg.passed) { healthy = false; row.error = "Exterior entry prefix failed"; break; } }
        if (plan.prefix.length) row.entryPrefixVerified = healthy;
        if (healthy) {
          const seedSupport = supportAt(sim, source.start, context.anchors.get(source.seed)!.reference, validated, capsule);
          const disagreement = seedSupport && supportError(source.start, seedSupport);
          if (!seedSupport || disagreement) { healthy = false; row.error = disagreement ?? "Trace start has no world support"; }
        }
        const acceptVisits = (afterStep: number) => {
          for (const result of trace.results) if (result.passed && result.proof?.session === source.session && result.proof.afterStep === afterStep) {
            const native = context.anchors.get(result.id)!;
            const support = supportAt(sim, result.point, native.reference, validated, capsule);
            if (!support || supportError(result.point, support) || !actor.grounded || Math.hypot(actor.position.x - support.x, actor.position.z - support.z) >= .1 || Math.abs(actor.position.y - support.capsuleFloor - footOffset) >= .14) continue;
            covered.set(result.id, { session: source.session, afterStep, position: { ...actor.position }, proofKind: "source-trace" });
            // The isolated source model has no outdoor ground. An explicitly
            // missing-support counterpart can be visited from this proven door
            // side, using native XY and independently measured WORLD support.
            const side = Number(result.id.at(-1)), otherId = result.id.slice(0, -1) + (1 - side);
            if (!missingSupport.has(otherId) || covered.has(otherId)) continue;
            const other = context.anchors.get(otherId)!;
            const extensionIndex = row.extensions.length;
            const outward = move({ ...other.point, floor: null }, otherId);
            const extension = { afterStep, from: result.id, to: otherId, outward, return: null as unknown, returned: false };
            row.extensions.push(extension);
            if (outward.passed) covered.set(otherId, { session: source.session, afterStep, position: { ...actor.position }, proofKind: "world-door-extension", extension: extensionIndex });
            const returned = move(result.point, result.id); extension.return = returned; extension.returned = returned.passed;
            if (!returned.passed) { row.error = "World door extension could not return without recovery"; return false; }
          }
          return true;
        };
        if (healthy) healthy = acceptVisits(0);
        for (const [index, step] of source.steps.entries()) {
          if (!healthy) break;
          const actual = { context: step.context, sourcePassed: step.passed, legs: [] as unknown[], passed: true };
          for (const [legIndex, leg] of step.legs.entries()) {
            const result = move(leg.target, legIndex === step.legs.length - 1 ? step.context.to : undefined); actual.legs.push({ ...result, sourcePassed: leg.passed });
            if (!result.passed) { actual.passed = false; healthy = false; break; }
          }
          row.steps.push(actual);
          if (healthy) healthy = acceptVisits(index + 1);
        }
        row.passed = healthy && row.steps.length === source.steps.length;
        if (!row.passed && !row.error) row.error = "Continuous world path failed";
        Object.assign(row, { frames });
      } catch (error) { row.error = error instanceof Error ? error.message : String(error); }
      finally { sim.remove(liveId); liveId = undefined; }
    }
    const firstExtraSession = Math.max(0, ...trace.proofSessions.map(s => s.session)) + 1;
    for (const [index, entry] of exteriorDoors.entries()) {
      const session = firstExtraSession + index;
      const outsideSupport = supportAt(sim, entry.outside, entry.reference, validated, capsule);
      const insideSupport = supportAt(sim, entry.inside, entry.reference, validated, capsule);
      const row = { kind: "configured-exterior-door", session, seed: entry.outsideId, entry, outsideSupport, insideSupport,
        setup: null as unknown, inward: null as unknown, return: null as unknown, passed: false, error: null as string | null };
      sessions.push(row);
      if (!outsideSupport || !insideSupport) { row.error = "Configured entry lacks actual world support"; continue; }
      liveId = `cad-world-exterior:${context.building.id}:${entry.id}`;
      const actor = sim.add(liveId, { x: outsideSupport.x, y: outsideSupport.capsuleFloor + footOffset + .08, z: outsideSupport.z });
      let sequence = 0;
      try {
        assertLiveController(actor, settings); forbidRecovery(actor);
        const tick = (x: number, z: number, jump = false) => { actor.step({ ...idle, x, z, jump, seq: ++sequence }, settings.dt); sim.tick(0); interactions?.advance(); };
        for (let i = 0; i < 80; i++) tick(0, 0);
        const overlaps: number[] = [];
        sim.world.intersectionsWithShape(actor.position, { x: 0, y: 0, z: 0, w: 1 }, actor.collider.shape, c => { overlaps.push(c.handle); return true; }, undefined, undefined, actor.collider, actor.body,c=>!sim.walkingColliders.has(c.handle));
        const setupError = actor.position.y - outsideSupport.capsuleFloor - footOffset;
        row.setup = { position: { ...actor.position }, grounded: actor.grounded, setupError, overlaps };
        if (!actor.grounded || Math.abs(setupError) >= .1 || overlaps.length) { row.error = "Invalid configured exterior setup"; continue; }
        const inward = { ...walkActorLeg(actor, insideSupport, insideSupport.capsuleFloor, settings, tick, doorJumps.get(entry.insideId),approachInteraction(entry.id)), support: insideSupport }; row.inward = inward;
        if (!inward.passed) { row.error = "Configured exterior threshold is blocked"; continue; }
        const returned = { ...walkActorLeg(actor, outsideSupport, outsideSupport.capsuleFloor, settings, tick, doorJumps.get(entry.outsideId),approachInteraction(entry.id)), support: outsideSupport }; row.return = returned;
        if (!returned.passed) { row.error = "Configured exterior return failed without recovery"; continue; }
        row.passed = true;
        covered.set(entry.insideId, { session, afterStep: 1, position: inward.finish, proofKind: "configured-exterior-door" });
        covered.set(entry.outsideId, { session, afterStep: 2, position: returned.finish, proofKind: "configured-exterior-door" });
      } catch (error) { row.error = error instanceof Error ? error.message : String(error); }
      finally { sim.remove(liveId); liveId = undefined; }
    }
  } finally { if (liveId) sim.remove(liveId); interactions?.dispose();sim.dispose(); }
  const unresolved = context.expectedDoorIds.filter(id => !covered.has(id));
  return { scope: runtimeScope === "full-game" ? "Actual Actor in full Simulation placement; continuous annotated entry sessions; CPU only, no GPU/server claim" : "Actual Actor in a small CPU fixture; not the complete game", runtimeScope,
    building: context.building.id, placement: context.building.placement, profile: "current", ...context.identity,
    sourceDoorStateAssumption:trace.doorStateAssumption??null,
    initialDoorState:doorHelpers.doorStateAssumption(context.building.model),doorInteractions:interactions?.events??[],
    doorInteractionManeuvers:interactions?.maneuvers??[],interactionPolicy:interactions?.policy??null,
    doorRuntimeSha256:doorHelpers.doorRuntimeSha256(),
    interactionScope:'Recorded current-Actor requests use shared authority range/LOS/occupied guard. Safe closure may retrace only this Actor’s measured trail; mandatory targets remain unchanged. No open-all override, network or human-playtest claim',
    status: unresolved.length === 0 && sessions.every(s => (s as { passed: boolean }).passed) ? "pass" : "partial",
    expectedDoorPoints: context.expectedDoorIds.length, coveredDoorPoints: [...covered].map(([id, proof]) => ({ id, ...proof })), unresolvedDoorPointIds: unresolved,
    sourceCases: trace.cases, sourcePassed: trace.passed, sourceExcluded: trace.excluded, configuredExteriorDoors: exteriorDoors, sessions,
    limits: ["All expected open door sides are counted, including source-unreached/excluded points.", "A missing-support counterpart is counted only after a new continuous Actor door excursion from a reached source side; source/native annotations are not modified.", "Source support is never used as a movement-height override; actual world ray/capsule support is measured.", "After failed walking, only a native declared door threshold or the counterpart of a missing-support point may use held jump input for an actual rise above autostep and below 1 m; sourcePassed remains unchanged.", "An independent fresh Actor is allowed only at each declared exterior-entry session start.", "Outdoor travel before an annotated entry and time-varying traffic are not covered; tick time is fixed at zero."] };
}

export function sourceManifest() {
  const paths = ["package.json", "pnpm-lock.yaml", "server/door-interactions.ts", "scripts/cad-buildings/verify_world_paths.ts", "scripts/cad-buildings/verify_accessibility.mjs", "scripts/cad-buildings/rapier_model.mjs", "scripts/cad-buildings/verify_routes.mjs", "scripts/cad-buildings/verify_doors.mjs", "scripts/cad-buildings/verify_room_paths.mjs", "scripts/cad-buildings/test_room_paths.mjs", "tests/cad-world-paths.test.ts"];
  const scan = (dir: string) => { for (const item of readdirSync(dir, { withFileTypes: true })) { const path = `${dir}/${item.name}`; if (item.isDirectory()) scan(path); else if (/\.(ts|json)$/.test(item.name)) paths.push(path); } };
  scan("shared"); const files = paths.sort().map(path => ({ path, sha256: sha(readFileSync(path)) }));
  return { sha256: sha(JSON.stringify(files)), files };
}
export async function verifyWorldPaths(args: Map<string, string>) {
  const allowed = new Set(["--building", "--trace", "--output", "--exterior-doors"]);
  for (const key of args.keys()) need(allowed.has(key), `Unknown argument ${key}`);
  const id = args.get("--building"), tracePath = args.get("--trace"); need(id && tracePath, "Required: --building ID --trace FILE --output FILE");
  const before = sourceManifest();
  const { CAD_BUILDINGS } = await import("../../shared/cad-buildings");
  const { Simulation, initPhysics, CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT } = await import("../../shared/simulation");
  const { FIXED_DT } = await import("../../shared/netcode");
  const { profileSettings } = await import(new URL("./rapier_model.mjs", import.meta.url).href);
  const registered = CAD_BUILDINGS.find(building => building.id === id); need(registered, "Building is not registered in the current game");
  const building = registered as unknown as PathBuilding, settings = profileSettings("current") as Settings;
  need(settings.radius === CHARACTER_RADIUS && settings.halfHeight === CHARACTER_HALF_HEIGHT && settings.dt === FIXED_DT && settings.speed === 4.6, "Current Actor constants differ from trace profile");
  const identity: TraceIdentity = { settings, modelCollisionSha256: sha(readFileSync(`shared/data/cad-buildings/${building.id}.json`)), modelGlbSha256: sha(readFileSync(`public/models/cad-buildings/${building.id}.glb`)),
    actorSourceSha256: sha(readFileSync("shared/simulation.ts")), validatorSha256: sha(readFileSync("scripts/cad-buildings/verify_accessibility.mjs")), rapierHelperSha256: sha(readFileSync("scripts/cad-buildings/rapier_model.mjs")) };
  const context = await createTraceContext(building, identity), bytes = readFileSync(tracePath), validated = validateWorldTrace(JSON.parse(bytes.toString("utf8")), context);
  const exteriorPath = args.get("--exterior-doors"), exteriorBytes = exteriorPath ? readFileSync(exteriorPath) : undefined;
  const exteriorDoors = exteriorBytes ? validateExteriorDoorConfig(JSON.parse(exteriorBytes.toString("utf8")), validated) : [];
  await initPhysics();
  const report = replayWorldTrace(validated, () => new Simulation(), "full-game", exteriorDoors), after = sourceManifest();
  need(before.sha256 === after.sha256, "World inputs changed during replay; result must not be accepted");
  need(sha(readFileSync(`public/models/cad-buildings/${building.id}.glb`)) === identity.modelGlbSha256, "Native GLB changed during replay");
  need(sha(readFileSync(tracePath)) === sha(bytes), "Source trace changed during replay");
  if (exteriorPath && exteriorBytes) need(sha(readFileSync(exteriorPath)) === sha(exteriorBytes), "Exterior-door config changed during replay");
  return { ...report, exteriorDoorsConfigSha256: exteriorBytes ? sha(exteriorBytes) : null, sourceTraceSha256: sha(bytes), sourceTracePath: relative(process.cwd(), resolve(tracePath)), sourceManifest: before, registeredBuildingIds: CAD_BUILDINGS.map(b => b.id), recordedAt: new Date().toISOString() };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = new Map<string, string>();
  try {
    need((process.argv.length - 2) % 2 === 0, "Arguments must be --name value pairs");
    for (let i = 2; i < process.argv.length; i += 2) { need(process.argv[i].startsWith("--") && !args.has(process.argv[i]), "Invalid or repeated argument"); args.set(process.argv[i], process.argv[i + 1]); }
    const output = args.get("--output"); need(output, "Missing --output");
    verifyWorldPaths(args).then(report => { mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2));
      console.log(JSON.stringify({ status: report.status, building: report.building, expected: report.expectedDoorPoints, covered: report.coveredDoorPoints.length, unresolved: report.unresolvedDoorPointIds })); process.exitCode = report.status === "pass" ? 0 : 2;
    }).catch(error => { console.error(error); process.exitCode = 1; });
  } catch (error) { console.error(error); process.exitCode = 1; }
}
