import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import RAPIER from "@dimforge/rapier3d-compat";
import { Actor, initPhysics, CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, type Simulation } from "../shared/simulation";
import { FIXED_DT } from "../shared/netcode";
import { textEntryTarget, worldKeyboardAllowed } from "../client/interaction";
import { clampOrbitPitch } from "../client/camera-look";
import { grassFocusDistance } from "../client/photo-grass-budget";
import { resolveTerrainReview, terrainReviewPose, terrainReviewIdentity, TERRAIN_REVIEW_PRESETS } from "../client/terrain-review";
import { readGameSource } from "./helpers/game-source";

const { source, selectMembers } = readGameSource();
const methods = selectMembers(["createStartupActor", "prepareTerrainReviewCamera", "updateCameraFollow", "footFirstPerson",
  "interpolateLocalPosition", "interpolationAlpha", "keyDown", "pointerDown", "moveCamera", "wheel", "lock", "interact", "requestRespawn", "previewTransit"]);
const js = (code: string) => ts.transpileModule(code, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const make = new Script(`(function(env) {
  const { window, resolveTerrainReview, terrainReviewPose, terrainReviewIdentity, sessionDiagnostics,
    CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, Vector3, clampOrbitPitch, FIXED_DT, textEntryTarget, worldKeyboardAllowed } = env;
  ${js(`class TerrainGame { ${methods.map(n => n.getText(source)).join("\n")} }`)}
  return TerrainGame;
})`).runInThisContext();

function fixture(id = "b6-rear-path", height = (x: number, z: number) => 10 + x * .01 + z * .02) {
  const events: unknown[] = [], starts: unknown[] = [];
  const Game = make({ window: { location: { hostname: "localhost", search: `?terrainReview=${id}` } },
    resolveTerrainReview, terrainReviewPose, terrainReviewIdentity, Vector3, clampOrbitPitch, FIXED_DT,
    CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, textEntryTarget, worldKeyboardAllowed,
    sessionDiagnostics: { event: (...args: unknown[]) => events.push(args) } });
  let target: Vector3 | undefined;
  const game = Object.assign(new Game(), {
    network: false, ready: true, accumulator: 0, localId: "guest", keys: new Set(["KeyW"]),
    localPlayer: { x: 110, y: 0, z: 12 }, previousPosition: new Vector3(110, 0, 12), visualOffset: new Vector3(1, 2, 3),
    avatars: new Map([["guest", { eyeHeight: 1.7 }]]), canvas: { dataset: {} },
    camera: { position: Vector3.Zero(), fov: .85, setTarget: (v: Vector3) => { target = v; } },
    sim: { surfaceHeight: height, add(id: string, position: { x: number; y: number; z: number }) {
      starts.push({ id, position: { ...position } });
      return { position: { ...position }, yaw: 0, vehicle: false, controller: { offset: () => .02 } };
    } },
  });
  return { game, starts, events, target: () => target!, height };
}

test("only four exact loopback guest IDs are accepted, including duplicate/forged URL rejection", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]"]) for (const id of Object.keys(TERRAIN_REVIEW_PRESETS)) {
    assert.equal(resolveTerrainReview({ hostname, search: `?terrainReview=${id}` }, false)?.id, id);
    assert.equal(resolveTerrainReview({ hostname, search: `?terrainReview=${id}` }, true), null);
  }
  for (const search of ["", "?terrainReview=", "?terrainReview=unknown", "?terrainReview=__proto__", "?terrainReview=constructor",
    "?terrainReview=b6-rear-path&terrainReview=b6-rear-path", "?terrainReview=b6-rear-path%20", "?x=36&z=-64"]) {
    assert.equal(resolveTerrainReview({ hostname: "localhost", search }, false), null);
  }
  for (const hostname of ["example.com", "localhost.example", "192.168.1.1", "127.0.0.1.example", "0.0.0.0"]) {
    assert.equal(resolveTerrainReview({ hostname, search: "?terrainReview=b6-rear-path" }, false), null);
  }
});

test("source-backed preset coordinates stay immutable and captured identity stays detached", () => {
  assert.deepEqual(Object.values(TERRAIN_REVIEW_PRESETS).map(p => [p.id, p.spawnXZ, p.lookAtXZ]), [
    ["b6-rear-path", [36, -64], [29.24, -64]], ["b6-front-lawn", [-14, -64], [-13, -59]],
    ["osm-grass-control", [-103, -65], [-100, -60]], ["b6-far-context", [40, -75], [28, -32]],
  ]);
  const p = TERRAIN_REVIEW_PRESETS["b6-rear-path"], record = terrainReviewIdentity(p)!;
  assert.equal(record.scope, "static-guest-start"); assert.match(record.source, /25920436/);
  record.spawnXZ[0] = 999; assert.equal(p.spawnXZ[0], 36);
  assert.equal(Reflect.set(p.spawnXZ, "0", 999), false, "preset coordinates cannot be changed at runtime");
  assert.equal(terrainReviewIdentity(null), null);
});

test("pose uses real ground at both ends and first-person slope, rejects nonfinite support", () => {
  const p = TERRAIN_REVIEW_PRESETS["b6-rear-path"], ground = (x: number) => x * .1;
  const pose = terrainReviewPose(p, ground, 1.72);
  assert.equal(pose.position.y, 4.6); assert.equal(pose.yaw, -Math.PI / 2);
  assert.ok(Math.abs(pose.pitch - (3.6 + 1.72 - 2.974) / 6.76) < 1e-12);
  for (const bad of [NaN, Infinity, -Infinity]) assert.throws(() => terrainReviewPose(p, () => bad), /pose\/support/);
  assert.throws(() => terrainReviewPose(p, ground, 0), /pose\/support/);
});

test("actual Game startup, interpolation and follow camera stay at the same preset, including a different avatar height", () => {
  for (const id of Object.keys(TERRAIN_REVIEW_PRESETS)) {
    const f = fixture(id), g = f.game; g.createStartupActor(); g.prepareTerrainReviewCamera();
    const initial = { ...g.actor.position };
    assert.equal(f.starts.length, 1); assert.deepEqual(g.previousPosition.asArray(), [initial.x, initial.y, initial.z]);
    assert.deepEqual(g.visualOffset.asArray(), [0, 0, 0]); assert.equal(g.keys.size, 0);
    assert.deepEqual(g.interpolateLocalPosition(initial).asArray(), [initial.x, initial.y, initial.z]);
    // Present an ordinary settled Actor pose. No world/camera focus override.
    const settled = new Vector3(initial.x, f.height(initial.x, initial.z) + .82, initial.z);
    g.updateCameraFollow(settled, 1.7, FIXED_DT);
    assert.equal(g.camera.fov, .85); assert.equal(g.camera.position.x, initial.x); assert.equal(g.camera.position.z, initial.z);
    assert.ok(Math.abs(g.camera.position.y - f.height(initial.x, initial.z) - 1.72) < 1e-12);
    const direction = f.target().subtract(g.camera.position), p = g.terrainReview;
    const dx = p.lookAtXZ[0] - initial.x, dz = p.lookAtXZ[1] - initial.z, distance = Math.hypot(dx, dz);
    assert.ok(Math.abs(direction.x - dx / distance) < 1e-12); assert.ok(Math.abs(direction.z - dz / distance) < 1e-12);
    assert.ok(Math.abs(g.camera.position.y + direction.y * distance - f.height(p.lookAtXZ[0], p.lookAtXZ[1]) - .05) < 1e-12);
    assert.equal(grassFocusDistance(initial.x, initial.z, g.camera.position.x, g.camera.position.z, initial.x, initial.z), 0);
    if (id === "b6-far-context") assert.ok(grassFocusDistance(p.lookAtXZ[0], p.lookAtXZ[1], initial.x, initial.z, initial.x, initial.z) > 40,
      "distant lookAt never becomes the player's grass focus");
  }
});

test("actual QA handlers cannot move, orbit, enter vehicles, respawn or use transit preview", () => {
  const f = fixture(), g = f.game; g.createStartupActor(); const before = { ...g.actor.position }, yaw = g.yaw, pitch = g.pitch;
  for (const code of ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "Space", "KeyV", "KeyE", "KeyR"]) {
    g.keyDown({ code, target: null, repeat: false, defaultPrevented: false, preventDefault() {} });
  }
  g.pointerDown({ button: 0 }); g.moveCamera({ movementX: 90, movementY: 50 }); g.wheel({ deltaY: 900 }); g.lock();
  g.interact(); assert.equal(g.requestRespawn(), false); assert.equal(g.previewTransit(), null);
  assert.equal(g.keys.size, 0); assert.equal(g.yaw, yaw); assert.equal(g.pitch, pitch);
  assert.deepEqual(g.actor.position, before); assert.equal(f.starts.length, 1);
  assert.equal(f.events.length, 1, "only explicit startup identity is emitted");
  g.terrainReview = null;
  g.keyDown({ code: "KeyW", target: null, repeat: false, defaultPrevented: false, preventDefault() {} });
  assert.equal(g.keys.has("KeyW"), true, "ordinary game controls remain enabled");
});

test("the actual HUD badge identifies only the active guest Game, not a later multiplayer or empty lifecycle", () => {
  const code = readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8");
  const ui = ts.createSourceFile("ui.tsx", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: ts.JsxExpression | undefined;
  function visit(n: ts.Node) {
    if (ts.isJsxExpression(n) && n.expression?.getText(ui).startsWith('mode === "guest" && game.current?.terrainReview')) expression = n;
    ts.forEachChild(n, visit);
  }
  visit(ui); assert.ok(expression?.expression);
  const render = new Script(js(`result = (${expression.expression.getText(ui)});`));
  for (const mode of ["guest", "multi"]) for (const active of [true, false]) {
    const env = { mode, game: { current: active ? { terrainReview: TERRAIN_REVIEW_PRESETS["b6-rear-path"] } : null },
      CLIENT_BUILD_ID: "b".repeat(64), feedbackLocale: "cs", result: undefined as any,
      React: { createElement: (tag: string, props: Record<string, unknown>, ...children: unknown[]) => ({ tag, props, children }) } };
    render.runInNewContext(env);
    if (mode === "guest" && active) {
      assert.equal(env.result.props["data-terrain-review"], "b6-rear-path");
      assert.equal(env.result.props["data-client-build-id"], "b".repeat(64));
      assert.match(env.result.children.join(""), /QA.*pevný pohled/);
    } else assert.ok(!env.result);
  }
});

test("a small real Actor fixture settles at the QA start through idle physics without recovery or hidden movement", async () => {
  await initPhysics();
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 }); world.timestep = FIXED_DT;
  const floor = world.createCollider(RAPIER.ColliderDesc.cuboid(5, .1, 5).setTranslation(36, 39.9, -64));
  const f = fixture("b6-rear-path", () => 40), g = f.game;
  const sim = { world, walkingColliders: new Set<number>(), groundColliders: new Set([floor.handle]), surfaceHeight: () => 40,
    add(id: string, p: { x: number; y: number; z: number }) { return new Actor(sim as unknown as Simulation, id, p); } };
  g.sim = sim;
  try {
    g.createStartupActor(); const actor: Actor = g.actor;
    actor.setPosition = () => { throw Error("Unexpected QA recovery/teleport"); };
    for (let i = 0; i < 90; i++) { actor.step({ x: 0, z: 0, yaw: g.yaw, jump: false, seq: i }, FIXED_DT); world.step(); }
    assert.ok(actor.grounded); assert.ok(Math.abs(actor.position.y - 40.8201) < .001);
    assert.equal(actor.position.x, 36); assert.equal(actor.position.z, -64);
    const capsule = actor.collider.shape; assert.ok(capsule instanceof RAPIER.Capsule);
    assert.equal(capsule.radius, .25); assert.equal(capsule.halfHeight, .55);
  } finally { world.free(); }
});
