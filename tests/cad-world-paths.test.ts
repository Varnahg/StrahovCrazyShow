import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Actor, Simulation, initPhysics } from "../shared/simulation";
import { createTraceContext, validateWorldTrace, validateExteriorDoorConfig, entryPlan, replayWorldTrace, type PathBuilding, type TraceIdentity, type WorldRuntime } from "../scripts/cad-buildings/verify_world_paths";
import type { Vec3 } from "../shared/types";

await initPhysics();
const settings = { radius: .25, halfHeight: .55, offset: .02, autostepHeight: .22, autostepWidth: .1, snap: .25, gravity: 18, dt: 1 / 60, speed: 4.6 };
const identity: TraceIdentity = { settings, modelCollisionSha256: "model-fixture", modelGlbSha256: "glb-fixture", actorSourceSha256: "actor-fixture", validatorSha256: "validator-fixture", rapierHelperSha256: "helper-fixture" };
function building(): PathBuilding {
  return { id: "fixture", placement: { translation: { x: 0, y: 40, z: 0 }, yaw: 0 }, glbSha256: identity.modelGlbSha256, site: { sourceCollisionSha256: identity.modelCollisionSha256 },
    model: { id: "fixture", cadOrigin: [0, 0], stairs: [], doors: [{ id: "entry", bottom: 0, top: 2.1, floor: "n01", hinge: [-.45, 1], closedEnd: [.45, 1], depth: .12, accessConfirmed: true }] } };
}
async function fixture(extraDoor = false) {
  const b = building();
  if (extraDoor) b.model.doors.push({ ...b.model.doors[0], id: "unvisited", hinge: [-.45, -2], closedEnd: [.45, -2], accessConfirmed: false });
  const context = await createTraceContext(b, identity), first = context.anchors.get("door:entry:side:0")!, second = context.anchors.get("door:entry:side:1")!;
  const leg = { target: { ...second.point }, passed: true, finish: { x: second.point.x, y: .82, z: second.point.z }, remaining: 0, footError: 0 };
  const trace = { profile: "current", ...identity, inputSha256: { validator: identity.validatorSha256, rapierHelper: identity.rapierHelperSha256 },
    seeds: [first.id], cases: context.expectedDoorIds.length, passed: 2, options: { spacing: .75 }, stats: { moves: 1, restarts: 1 }, excluded: [],
    proofSessions: [{ session: 1, seed: first.id, start: { ...first.point }, setup: { setupValid: true, initialFootError: 0, overlaps: [] },
      steps: [{ passed: true, context: { from: first.id, to: second.id }, legs: [leg] }] }],
    results: [...context.anchors.values()].filter(a => a.kind === "door").map((a, i) => ({ id: a.id, doorId: a.id.split(":")[1], point: { ...a.point }, passed: i < 2,
      proof: i < 2 ? { session: 1, seed: first.id, afterStep: i } : null })) };
  return { context, trace };
}

// The fixture changes only scene geometry. Movement remains the production
// Actor implementation; it never reimplements a character controller.
function tinyWorld(options: { wall?: boolean; wallX?: number; recovery?: boolean; stairs?: boolean; stepHeight?: number; trapReturn?: boolean; trapExteriorReturn?: boolean } = {}) {
  let disposed = 0, removed = 0, ticks = 0, trapped = false;
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = 1 / 60;
  if (options.stairs) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, .1, 2).setTranslation(-2, 39.9, 0));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1, .1, 2).setTranslation(2, 40.5, 0));
    for (let i = 0; i < 4; i++) {
      const top = 40 + .15 * (i + 1), bottom = 39.8;
      world.createCollider(RAPIER.ColliderDesc.cuboid(.25, (top - bottom) / 2, .7).setTranslation(-1 + (i + .5) * .5, (top + bottom) / 2, 0));
    }
  } else world.createCollider(RAPIER.ColliderDesc.cuboid(3, .1, 2).setTranslation(0, 39.9, 0));
  if (options.stepHeight) world.createCollider(RAPIER.ColliderDesc.cuboid(1, options.stepHeight / 2, 2).setTranslation(-2, 40 + options.stepHeight / 2, 0));
  if (options.wall) world.createCollider(RAPIER.ColliderDesc.cuboid(.01, 1.5, 2).setTranslation(options.wallX ?? -1, 41.5, 0));
  const actors = new Map<string, Actor>();
  const runtime = {
    world, actors, walkingColliders: new Set<number>(), groundColliders: new Set<number>(),
    add(id: string, position: Vec3) { const actor = new Actor(runtime as unknown as Simulation, id, position); actors.set(id, actor); return actor; },
    remove(id: string) { removed++; Simulation.prototype.remove.call(runtime, id); },
    tick() {
      ticks++;
      if (options.recovery && ticks === 90) actors.values().next().value!.setPosition({ x: 0, y: 100, z: 0 });
      if (options.trapReturn && !trapped && [...actors.values()].some(actor => actor.position.x < -1.3)) {
        world.createCollider(RAPIER.ColliderDesc.cuboid(.01, 1.5, 2).setTranslation(-1, 41.5, 0)); trapped = true;
      }
      if (options.trapExteriorReturn && !trapped && [...actors.values()].some(actor => actor.id.startsWith("cad-world-exterior:") && actor.position.x < 1.7)) {
        world.createCollider(RAPIER.ColliderDesc.cuboid(.01, 1.5, 2).setTranslation(2, 41.5, 0)); trapped = true;
      }
      world.step();
    },
    dispose() { disposed++; world.free(); },
  };
  return { runtime: runtime as WorldRuntime, counts: () => ({ disposed, removed, actors: actors.size }) };
}

test("trace identity, current profile and every expected door side are mandatory", async () => {
  const { context, trace } = await fixture();
  validateWorldTrace(trace, context);
  assert.throws(() => validateWorldTrace({ ...trace, profile: "cad-compact" }, context), /current-profile/);
  for (const key of ["modelCollisionSha256", "modelGlbSha256", "actorSourceSha256"]) assert.throws(() => validateWorldTrace({ ...trace, [key]: "other" }, context), /identity mismatch/);
  assert.throws(() => validateWorldTrace({ ...trace, settings: { ...settings, radius: .42 } }, context), /settings mismatch/);
  assert.throws(() => validateWorldTrace({ ...trace, inputSha256: { ...trace.inputSha256, validator: "old" } }, context), /validator source/);
  const omitted = structuredClone(trace); omitted.results.pop(); omitted.cases--; omitted.passed--;
  assert.throws(() => validateWorldTrace(omitted, context), /omitted model door/);
});

// Both sides were reached by walking downhill; the truthful local trace ends
// with a FAILED return uphill. A world jump must solve it without resetting.
async function jumpReturnFixture(height: number, declared = true) {
  const { context, trace } = await fixture(), [low, high] = trace.results;
  context.building.model.doors[0].outsideTraversalStatus = declared ? "requires-native-jump-validation" : undefined;
  high.point.floor = height;
  const seed = high.id, lowLeg = { target: { ...low.point }, passed: true, finish: { x: low.point.x, y: .82, z: low.point.z }, remaining: 0, footError: 0 };
  const failedReturn = { target: { ...high.point }, passed: false, finish: { ...lowLeg.finish }, remaining: Math.abs(high.point.x - low.point.x), footError: -height };
  trace.seeds = [seed]; trace.stats.moves = 2;
  trace.proofSessions = [{ session: 1, seed, start: { ...high.point }, setup: { setupValid: true, initialFootError: 0, overlaps: [] }, steps: [
    { passed: true, context: { from: seed, to: low.id }, legs: [lowLeg] },
    { passed: false, context: { from: low.id, to: seed }, legs: [failedReturn] },
  ] }];
  low.proof = { session: 1, seed, afterStep: 1 }; high.proof = { session: 1, seed, afterStep: 0 };
  return { context, trace };
}
type FixtureLeg = { passed: boolean; sourcePassed?: boolean; traversal: string; heldFrames: number; walkFrames: number; jumpFrames: number;
  support: { capsuleFloor: number }; jumpEvidence: null | { reason: string; rise: number; fromFoot: number; targetFloor: number } };
type FixtureSession = { steps: { passed: boolean; sourcePassed: boolean; legs: FixtureLeg[] }[];
  extensions: { outward: FixtureLeg; return: FixtureLeg; returned: boolean }[] };

test("actual held jump solves a declared native door return while preserving source walking failure", async () => {
  const { context, trace } = await jumpReturnFixture(.481), original = JSON.stringify(trace), scene = tinyWorld({ stepHeight: .481 });
  const report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "pass"); assert.equal(report.coveredDoorPoints.length, 2);
  const session = report.sessions[0] as FixtureSession, returned = session.steps[1].legs[0];
  assert.equal(session.steps[0].legs[0].traversal, "walk");
  assert.equal(session.steps[1].sourcePassed, false); assert.equal(returned.sourcePassed, false);
  assert.equal(returned.traversal, "jump"); assert.equal(returned.heldFrames, 8);
  assert.ok(returned.walkFrames >= 180 && returned.jumpFrames > 0 && returned.jumpFrames <= 180);
  assert.equal(returned.jumpEvidence!.reason, "native-declared-threshold");
  assert.ok(Math.abs(returned.support.capsuleFloor - 40.481) < .005);
  assert.ok(Math.abs(returned.jumpEvidence!.rise - .481) < .01);
  assert.equal(JSON.stringify(trace), original);
  assert.deepEqual(scene.counts(), { disposed: 1, removed: 1, actors: 0 });
});

test("undeclared doors and grid targets cannot acquire jump from nearby native metadata", async () => {
  for (const grid of [false, true]) {
    const { context, trace } = await jumpReturnFixture(.481, grid);
    if (grid) {
      // Reach the low side, then ask for a grid point on the high plateau. The
      // nearby native door is declared, but that cannot authorize this leg.
      const step = trace.proofSessions[0].steps[1]; step.context.to = "grid:0:-2:0"; step.legs[0].target.x = -1.5;
    }
    const scene = tinyWorld({ stepHeight: .481 }), report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
    const returned = (report.sessions[0] as FixtureSession).steps[1].legs[0];
    assert.equal(report.status, "partial"); assert.equal(returned.passed, false);
    assert.equal(returned.traversal, "walk"); assert.equal(returned.heldFrames, 0);
    assert.equal(returned.jumpEvidence, null);
  }
});

test("a missing-support counterpart authorizes only the actual uphill return, without native jump flag", async () => {
  const { context, trace } = await jumpReturnFixture(.333, false), [low, high] = trace.results;
  const partial = { ...trace, cases: 1, passed: 1, results: [high], excluded: [{ id: low.id, doorId: "entry", category: "missing-model-floor" }],
    stats: { moves: 0, restarts: 1 }, proofSessions: [{ ...trace.proofSessions[0], steps: [] }] };
  const scene = tinyWorld({ stepHeight: .333 }), report = replayWorldTrace(validateWorldTrace(partial, context), () => scene.runtime);
  assert.equal(report.status, "pass"); assert.equal(report.coveredDoorPoints.length, 2);
  const extension = (report.sessions[0] as FixtureSession).extensions[0];
  assert.equal(extension.outward.traversal, "walk"); assert.equal(extension.return.traversal, "jump");
  assert.equal(extension.return.heldFrames, 8); assert.equal(extension.returned, true);
  assert.equal(extension.return.jumpEvidence!.reason, "missing-support-counterpart");
  assert.equal(report.sourcePassed, 1); assert.equal(report.sourceExcluded.length, 1);
});

test("even a declared native door cannot request jump for a rise of at least one metre", async () => {
  const { context, trace } = await jumpReturnFixture(1.05);
  // Put both native sides within their legitimate +/- .65 m door reference
  // window, while the measured physical difference still exceeds 1 m.
  context.building.model.doors[0].bottom = .525;
  for (const anchor of context.anchors.values()) anchor.reference = .525;
  const scene = tinyWorld({ stepHeight: 1.05 }), report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "partial");
  const returned = (report.sessions[0] as FixtureSession).steps[1].legs[0];
  assert.equal(returned.passed, false); assert.equal(returned.traversal, "walk"); assert.equal(returned.heldFrames, 0);
  assert.equal(returned.jumpEvidence, null);
});

test("jump cannot pass a taller wall and a genuinely blocked return remains partial", async () => {
  const { context, trace } = await jumpReturnFixture(.481), [low, high] = trace.results;
  // This entry begins low; the target is higher but its threshold is also
  // closed by a 3 m wall. The valid authorization must not manufacture PASS.
  trace.seeds = [low.id]; trace.stats.moves = 1; trace.passed = 1;
  low.proof = { session: 1, seed: low.id, afterStep: 0 }; high.passed = false; high.proof = null;
  trace.proofSessions = [{ session: 1, seed: low.id, start: { ...low.point }, setup: { setupValid: true, initialFootError: 0, overlaps: [] },
    steps: [{ passed: false, context: { from: low.id, to: high.id }, legs: [{ target: { ...high.point }, passed: false,
      finish: { x: low.point.x, y: .82, z: low.point.z }, remaining: .9, footError: -.481 }] }] }];
  const scene = tinyWorld({ stepHeight: .481, wall: true }), report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  const blocked = (report.sessions[0] as FixtureSession).steps[0].legs[0];
  assert.equal(blocked.traversal, "jump"); assert.equal(blocked.heldFrames, 8); assert.equal(blocked.jumpFrames, 180);
  assert.equal(blocked.passed, false); assert.equal(report.status, "partial");
  assert.deepEqual(report.unresolvedDoorPointIds, [high.id]);
  assert.deepEqual(scene.counts(), { disposed: 1, removed: 1, actors: 0 });

  const f = await fixture(); f.context.building.model.doors[0].outsideTraversalStatus = "requires-native-jump-validation";
  const other = f.trace.results.pop()!, partial = { ...f.trace, cases: 1, passed: 1, excluded: [{ id: other.id, category: "missing-model-floor" }],
    stats: { moves: 0, restarts: 1 }, proofSessions: [{ ...f.trace.proofSessions[0], steps: [] }] };
  const trap = tinyWorld({ trapReturn: true }), trapped = replayWorldTrace(validateWorldTrace(partial, f.context), () => trap.runtime);
  assert.equal(trapped.status, "partial");
  const returned = (trapped.sessions[0] as FixtureSession).extensions[0].return;
  assert.equal(returned.passed, false); assert.equal(returned.traversal, "walk"); assert.equal(returned.heldFrames, 0);
  assert.deepEqual(trap.counts(), { disposed: 1, removed: 1, actors: 0 });
});

test("trace cannot move a door to another coordinate or floor", async () => {
  const { context, trace } = await fixture();
  const moved = structuredClone(trace); moved.results[1].point.x += 2;
  assert.throws(() => validateWorldTrace(moved, context), /native annotation/);
  const raised = structuredClone(trace); raised.results[1].point.floor = 3;
  assert.throws(() => validateWorldTrace(raised, context), /floor differs/);
  const bad = structuredClone(trace); bad.proofSessions[0].steps[0].legs[0].target.x = NaN;
  assert.throws(() => validateWorldTrace(bad, context), /Invalid trace point/);
});

test("truncated, disconnected and invented proof visits are rejected", async () => {
  const { context, trace } = await fixture();
  const truncated = structuredClone(trace); truncated.proofSessions[0].steps = [];
  assert.throws(() => validateWorldTrace(truncated, context), /totals are incomplete/);
  const disconnected = structuredClone(trace); disconnected.proofSessions[0].steps[0].context.from = "grid:0:99:99";
  assert.throws(() => validateWorldTrace(disconnected, context), /Discontinuous/);
  const invented = structuredClone(trace); invented.results[1].proof!.afterStep = 0;
  assert.throws(() => validateWorldTrace(invented, context), /setup-only visit/);
  const invalidSetup = structuredClone(trace); invalidSetup.proofSessions[0].setup.initialFootError = 1;
  assert.throws(() => validateWorldTrace(invalidSetup, context), /Successful trace setup/);
});

test("an interior door cannot become a fresh exterior seed", async () => {
  const { context, trace } = await fixture();
  const b = building(); b.model.doors[0].accessConfirmed = false;
  const interior = await createTraceContext(b, identity);
  assert.throws(() => validateWorldTrace(trace, interior), /not a native exterior entry/);
  assert.throws(() => validateWorldTrace({ ...trace, seeds: [] }, context), /Invalid trace seeds/);
});

test("a native upper seed prepends the whole route from its explicit outdoor end", async () => {
  const b = building();
  b.model.stairs.push({ id: "entry-flight", routeId: "entry-route", routeIndex: 0, routeSegmentCount: 1, a: [0, 2], b: [0, 0], bottom: -.6, top: 0,
    terrainValidationPending: true, sourcePlanId: "entry-route", sourceEntities: ["A"], lowerLevelKey: "exterior.entry", upperLevelKey: "n01.main" });
  const context = await createTraceContext(b, identity), seed = "route:entry-route:upper";
  const plan = entryPlan({ context, trace: {} as never }, { seed } as never);
  assert.equal(plan.start.floor, -.6); assert.equal(plan.prefix.at(-1)!.floor, 0);
  const modelRoute = context.routes.get("entry-route")!;
  assert.deepEqual(plan.start, modelRoute.path[0]); assert.deepEqual(plan.prefix, modelRoute.path.slice(1));
  b.model.stairs[0].lowerLevelKey = "p01.wing";
  const ambiguous = await createTraceContext(b, identity);
  const limited = entryPlan({ context: ambiguous, trace: {} as never }, { seed } as never);
  assert.equal(limited.prefix.length, 0); assert.match(limited.limitations[0], /does not unambiguously/);
});

test("actual Actor visits both door points continuously and disposes its fixture", async () => {
  const { context, trace } = await fixture(), scene = tinyWorld();
  const report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "pass"); assert.equal(report.expectedDoorPoints, 2); assert.equal(report.coveredDoorPoints.length, 2);
  assert.equal(report.runtimeScope, "fixture");
  assert.deepEqual(report.unresolvedDoorPointIds, []);
  assert.deepEqual(scene.counts(), { disposed: 1, removed: 1, actors: 0 });
});

test("actual Actor traverses an exterior stair prefix before any upper-seed visit", async () => {
  const b = building(); b.model.doors[0] = { ...b.model.doors[0], hinge: [-.45, -2], closedEnd: [.45, -2], bottom: .6, top: 2.7 };
  b.model.stairs.push({ id: "entry-flight", routeId: "entry-route", routeIndex: 0, routeSegmentCount: 1, a: [0, 1], b: [0, -1], bottom: 0, top: .6,
    terrainValidationPending: true, sourcePlanId: "entry-route", sourceEntities: ["A"], lowerLevelKey: "exterior.entry", upperLevelKey: "n01.main" });
  const context = await createTraceContext(b, identity), seed = "route:entry-route:upper";
  const targets = context.expectedDoorIds.map(id => context.anchors.get(id)!);
  const steps = targets.map((target, i) => ({ passed: true, context: { from: i === 0 ? seed : targets[i - 1].id, to: target.id },
    legs: [{ passed: true, target: { ...target.point }, finish: { x: target.point.x, y: 1.42, z: target.point.z }, remaining: 0, footError: 0 }] }));
  const trace = { profile: "current", ...identity, inputSha256: { validator: identity.validatorSha256, rapierHelper: identity.rapierHelperSha256 },
    seeds: [seed], cases: 2, passed: 2, options: { spacing: .75 }, stats: { moves: 2, restarts: 1 }, excluded: [],
    proofSessions: [{ session: 1, seed, start: context.anchors.get(seed)!.point, setup: { setupValid: true, initialFootError: 0, overlaps: [] }, steps }],
    results: targets.map((target, i) => ({ id: target.id, doorId: "entry", point: target.point, passed: true, proof: { session: 1, seed, afterStep: i + 1 } })) };
  const scene = tinyWorld({ stairs: true }), report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "pass"); assert.equal(report.coveredDoorPoints.length, 2);
  const session = report.sessions[0] as { prefix: { passed: boolean; frames: number }[]; entry: { start: { floor: number } } };
  assert.equal(session.entry.start.floor, 0); assert.equal(session.prefix.length, 1);
  assert.ok(session.prefix[0].passed && session.prefix[0].frames > 20);
  assert.deepEqual(scene.counts(), { disposed: 1, removed: 1, actors: 0 });
});

test("a successful small session does not claim unvisited model door points", async () => {
  const { context, trace } = await fixture(true), scene = tinyWorld();
  const report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "partial"); assert.equal(report.expectedDoorPoints, 4); assert.equal(report.coveredDoorPoints.length, 2);
  assert.deepEqual(report.unresolvedDoorPointIds, ["door:unvisited:side:0", "door:unvisited:side:1"]);
});

test("an excluded missing-support counterpart needs a new actual Actor excursion and return", async () => {
  for (const mode of ["open", "wall", "trapped-return"]) {
    const { context, trace } = await fixture(), other = trace.results.pop()!;
    const partial = { ...trace, cases: 1, passed: 1, excluded: [{ id: other.id, doorId: "entry", category: "unclassified-missing-support" }],
      stats: { moves: 0, restarts: 1 }, proofSessions: [{ ...trace.proofSessions[0], steps: [] }] };
    const scene = tinyWorld({ wall: mode === "wall", trapReturn: mode === "trapped-return" }), report = replayWorldTrace(validateWorldTrace(partial, context), () => scene.runtime);
    assert.equal(report.coveredDoorPoints.length, mode === "wall" ? 1 : 2); assert.equal(report.status, mode === "open" ? "pass" : "partial");
    const session = report.sessions[0] as { extensions: { outward: { passed: boolean }; returned: boolean }[] };
    assert.equal(session.extensions.length, 1); assert.equal(session.extensions[0].outward.passed, mode !== "wall"); assert.equal(session.extensions[0].returned, mode !== "trapped-return");
    if (mode !== "wall") assert.equal(report.coveredDoorPoints.find(row => row.id === other.id)!.proofKind, "world-door-extension");
    if (mode === "trapped-return") assert.match(JSON.stringify(report.sessions), /could not return without recovery/);
    assert.deepEqual(scene.counts(), { disposed: 1, removed: 1, actors: 0 });
  }
});

test("an ordinary unreached/blocked source result is not silently treated as missing exterior ground", async () => {
  const { context, trace } = await fixture();
  const partial = { ...trace, passed: 1, stats: { moves: 0, restarts: 1 }, proofSessions: [{ ...trace.proofSessions[0], steps: [] }],
    results: trace.results.map((row, i) => i ? { ...row, passed: false, proof: null } : row) };
  const scene = tinyWorld(), report = replayWorldTrace(validateWorldTrace(partial, context), () => scene.runtime);
  assert.equal(report.coveredDoorPoints.length, 1); assert.equal(report.status, "partial");
  assert.equal((report.sessions[0] as { extensions: unknown[] }).extensions.length, 0);
});

test("the whole-world obstruction overrides a locally successful source trace", async () => {
  const { context, trace } = await fixture(), scene = tinyWorld({ wall: true });
  const report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "partial"); assert.equal(report.coveredDoorPoints.length, 1);
  assert.deepEqual(report.unresolvedDoorPointIds, ["door:entry:side:1"]);
  assert.deepEqual(scene.counts(), { disposed: 1, removed: 1, actors: 0 });
});

test("source capsule support cannot override actual world support", async () => {
  const { context, trace } = await fixture(), scene = tinyWorld();
  const altered = structuredClone(trace), leg = altered.proofSessions[0].steps[0].legs[0];
  Object.assign(leg.target, { support: { height: 0, capsuleFootHeight: .2 } }); leg.finish.y += .2;
  const report = replayWorldTrace(validateWorldTrace(altered, context), () => scene.runtime);
  assert.equal(report.status, "partial"); assert.equal(report.coveredDoorPoints.length, 1);
  assert.match(JSON.stringify(report.sessions), /override rejected/);
});

test("a fabricated source support at the session start cannot seed world coverage", async () => {
  const { context, trace } = await fixture(), scene = tinyWorld();
  Object.assign(trace.proofSessions[0].start, { support: { height: 0, capsuleFootHeight: .2 } });
  const report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "partial"); assert.equal(report.coveredDoorPoints.length, 0);
  assert.match(JSON.stringify(report.sessions), /override rejected/);
  assert.deepEqual(scene.counts(), { disposed: 1, removed: 0, actors: 0 });
});

test("Actor recovery is rejected and cleaned up instead of completing the path", async () => {
  const { context, trace } = await fixture(), scene = tinyWorld({ recovery: true });
  const report = replayWorldTrace(validateWorldTrace(trace, context), () => scene.runtime);
  assert.equal(report.status, "partial"); assert.equal(report.coveredDoorPoints.length, 1);
  assert.match(JSON.stringify(report.sessions), /Forbidden Actor teleport\/recovery/);
  assert.deepEqual(scene.counts(), { disposed: 1, removed: 1, actors: 0 });
});

async function exteriorFixture() {
  const { context, trace } = await fixture(true);
  const native = context.building.model.doors.find(d => d.id === "unvisited")!; native.sourceEntities = ["U1", "U2"];
  const polygon = { id: "native-interior", bounds: { minX: -3, maxX: 2, minZ: -2, maxZ: 2 },
    loops: [[[-3, -2], [2, -2], [2, 2], [-3, 2]] as [number, number][]], sourcePartIds: ["floor"] };
  context.building.site.terrainCutouts = [polygon];
  context.building.site.supportSurfaces = [{ ...polygon, partId: "floor", floor: "n01", role: "slab", plane: { a: 0, b: 0, c: 0 } }];
  const outsideId = "door:unvisited:side:0";
  const partial = { ...trace, cases: 3, results: trace.results.filter(row => row.id !== outsideId),
    excluded: [{ id: outsideId, doorId: "unvisited", category: "unclassified-missing-support" }] };
  const validated = validateWorldTrace(partial, context);
  const config = { schemaVersion: 1, buildingId: "fixture", modelCollisionSha256: identity.modelCollisionSha256,
    entries: [{ id: "unvisited", outsideSide: 0, sourceEntities: ["U2", "U1"], provenance: "Fixture native wall and external-only room evidence." }] };
  return { context, validated, config };
}

test("explicit exterior configuration rejects foreign identity, handles, coordinates and missing provenance", async () => {
  const { validated, config } = await exteriorFixture();
  assert.equal(validateExteriorDoorConfig(config, validated).length, 1);
  assert.throws(() => validateExteriorDoorConfig({ ...config, modelCollisionSha256: "foreign" }, validated), /identity mismatch/);
  assert.throws(() => validateExteriorDoorConfig({ ...config, entries: [{ ...config.entries[0], sourceEntities: ["wrong"] }] }, validated), /handles mismatch/);
  assert.throws(() => validateExteriorDoorConfig({ ...config, entries: [{ ...config.entries[0], provenance: " " }] }, validated), /provenance/);
  assert.throws(() => validateExteriorDoorConfig({ ...config, entries: [{ ...config.entries[0], x: 500 }] }, validated), /forbidden coordinate/);
  assert.throws(() => validateExteriorDoorConfig({ ...config, entries: [{ ...config.entries[0], outsideSide: 1 }] }, validated), /excluded/);
});

test("an explicit config cannot seed inside a closed room or above the wrong native floor", async () => {
  const { context, validated, config } = await exteriorFixture();
  const polygon = context.building.site.terrainCutouts![0];
  context.building.site.terrainCutouts = [{ ...polygon, bounds: { ...polygon.bounds, maxX: 3 }, loops: [[[-3, -2], [3, -2], [3, 2], [-3, 2]]] }];
  assert.throws(() => validateExteriorDoorConfig(config, validated), /inside native geometry/);
  context.building.site.terrainCutouts = [polygon];
  context.building.site.supportSurfaces = context.building.site.supportSurfaces!.map(s => ({ ...s, plane: { a: 0, b: 0, c: 3 } }));
  assert.throws(() => validateExteriorDoorConfig(config, validated), /lacks native interior/);
  context.building.model.doors.find(d => d.id === "unvisited")!.openingClassification = "facade-opening-unconfirmed-access";
  assert.throws(() => validateExteriorDoorConfig(config, validated), /fixed-glass/);
});

test("configured outside entry adds both points only after actual threshold and return pass", async () => {
  for (const mode of ["open", "blocked", "return-blocked"]) {
    const { validated, config } = await exteriorFixture(), original = JSON.stringify(validated.trace);
    const entries = validateExteriorDoorConfig(config, validated);
    const scene = tinyWorld({ wall: mode === "blocked", wallX: 2, trapExteriorReturn: mode === "return-blocked" });
    const report = replayWorldTrace(validated, () => scene.runtime, "fixture", entries);
    assert.equal(report.coveredDoorPoints.length, mode === "open" ? 4 : 2);
    assert.equal(report.status, mode === "open" ? "pass" : "partial");
    if (mode === "open") assert.equal(report.coveredDoorPoints.filter(p => p.proofKind === "configured-exterior-door").length, 2);
    if (mode === "blocked") assert.match(JSON.stringify(report.sessions), /threshold is blocked/);
    if (mode === "return-blocked") assert.match(JSON.stringify(report.sessions), /return failed without recovery/);
    assert.equal(JSON.stringify(validated.trace), original, "Source trace must remain untouched");
    assert.deepEqual(scene.counts(), { disposed: 1, removed: 2, actors: 0 });
  }
});
