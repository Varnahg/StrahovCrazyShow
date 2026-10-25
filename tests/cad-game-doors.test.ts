import { test } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import ts from "typescript";
import RAPIER from "@dimforge/rapier3d-compat";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { readGameSource } from "./helpers/game-source";
import {
  Actor,
  initPhysics,
  CHARACTER_RADIUS,
  CHARACTER_HALF_HEIGHT,
  type Simulation,
} from "../shared/simulation";
import { CadDoorPhysics } from "../shared/cad-door-physics";
import { CadDoorTimeline } from "../shared/cad-door-timeline";
import {
  CadDoorStateStore,
  placeCadDoorDefinition,
  cadDoorPose,
  CAD_DOOR_INTERACTION_RANGE,
  type CadDoorSnapshot,
  type CadDoorDelta,
} from "../shared/cad-doors";
import { FIXED_DT, PredictionHistory, canonicalInput } from "../shared/netcode";
import { movementFromKeys } from "../shared/controls";
import { snapshotAcceptedAuthorityDiagnostics } from "../client/game-diagnostics";

await initPhysics();
const door = placeCadDoorDefinition(
  {
    id: "b06:N01:test",
    buildingId: "b06",
    floor: "N01",
    sourceDoorId: "test",
    renderPartIds: ["leaf", "handle"],
    collisionPartIds: [],
    hingeModel: { x: 0, y: 1, z: 0 },
    closedPose: { position: { x: 0.5, y: 1, z: 0 }, rotationY: 0 },
    collider: { halfExtents: { x: 0.5, y: 1, z: 0.019 } },
    openAngle: Math.PI / 2,
    handleModel: { x: 0.9, y: 1, z: 0.04 },
    defaultOpen: false,
  },
  { translation: { x: 0, y: 40, z: 0 }, yaw: 0 },
);
const identity = { worldEpoch: "server-world", definitionHash: "a".repeat(64) };
const snapshot = (revision = 0, tick = revision): CadDoorSnapshot => ({
  ...identity,
  revision,
  tick,
  states: [
    {
      id: door.id,
      open: revision % 2 === 1,
      revision,
      changedAtTick: revision,
    },
  ],
});
const delta = (revision: number, tick = revision): CadDoorDelta => ({
  ...identity,
  revision,
  tick,
  door: {
    id: door.id,
    open: revision % 2 === 1,
    revision,
    changedAtTick: tick,
  },
});
const { source, gameClass, selectMembers } = readGameSource(
  process.env.CAD_GAME_SOURCE,
);
const names = [
  "doorTimeline",
  "guestDoors",
  "doorSnapshot",
  "doorStates",
  "predictionDoorRevisions",
  "doorRequestId",
  "doorInputTickBase",
  "lastDoorResync",
  "attachDoorTimeline",
  "applyDoorSnapshot",
  "restoreDoorTick",
  "requestDoorResync",
  "pruneDoorPrediction",
  "nearbyDoor",
  "interactDoor",
  "interact",
  "reconcile",
  "advanceSimulation",
  "capturePreviousCarPose",
  "resetPredictionHistory",
];
const compiled = ts.transpileModule(
  `class DoorGame{${selectMembers(names)
    .map((n) => n.getText(source))
    .join("\n")}};DoorGame;`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  },
).outputText;
let startupApply: ts.ExpressionStatement | undefined;
function findStartup(node: ts.Node) {
  if (
    ts.isExpressionStatement(node) &&
    node.getText(source).startsWith("this.applyDoorSnapshot(this.network ?")
  )
    startupApply = node;
  ts.forEachChild(node, findStartup);
}
findStartup(gameClass);
assert.ok(
  startupApply,
  "Actual Game start must apply the owned current baseline",
);
const initializeDoors = new Script(
  ts.transpileModule(`(function(){${startupApply.getText(source)}})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText,
).runInThisContext();
const idle = (seq: number) => ({
  x: 0,
  z: 0,
  yaw: 0,
  jump: false,
  seq,
  inputEpoch: 1,
});
function fixture(network = false) {
  let now = 1000,
    restores = 0,
    advances = 0;
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
    walkingColliders = new Set<number>(),
    groundColliders = new Set<number>(),
    actors = new Map<string, Actor>();
  const floor = world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 0.1, 5).setTranslation(0, 39.9, 0),
  );
  groundColliders.add(floor.handle);
  const doorPhysics = new CadDoorPhysics(world, [door], {
    ignoredColliders: walkingColliders,
  });
  const events: string[] = [],
    actions: { action: string; data: unknown }[] = [],
    notices: string[] = [];
  const sim = {
    world,
    walkingColliders,
    groundColliders,
    actors,
    doorPhysics,
    doorObstacles: () => [],
    doorCapsules: () =>
      [...actors.values()].map((a) => ({
        id: a.id,
        current: a.position,
        next: a.body.nextTranslation(),
        radius: CHARACTER_RADIUS,
        halfHeight: CHARACTER_HALF_HEIGHT,
        skin: 0.02,
      })),
    car: {
      getVisualPose: () => ({
        position: { x: 3, y: 40, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      }),
    },
    tick: () => {
      events.push("world:" + doorPhysics.isOpen(door.id));
      world.step();
    },
  };
  const actor = new Actor(sim as unknown as Simulation, "self", {
    x: 0.8,
    y: 40.8201,
    z: 0.8,
  });
  actors.set(actor.id, actor);
  world.step();
  const actualStep = actor.step.bind(actor),
    actualRestore = actor.restore.bind(actor);
  actor.step = (input, dt) => {
    events.push("actor:" + doorPhysics.isOpen(door.id));
    actualStep(input, dt);
  };
  actor.restore = (state, hard) => {
    restores++;
    actualRestore(state, hard);
  };
  const Game = new Script(compiled).runInNewContext({
    exports: {},
    Vector3,
    Quaternion,
    CAD_DOOR_DEFINITIONS: [door],
    CAD_DOOR_DEFINITION_HASH: identity.definitionHash,
    CadDoorStateStore,
    cadDoorPose,
    CAD_DOOR_INTERACTION_RANGE,
    FIXED_DT,
    canonicalInput,
    movementFromKeys,
    snapshotAcceptedAuthorityDiagnostics,
    performance: { now: () => now },
    sessionDiagnostics: { event() {} },
    HUNT_POINTS: [],
    t: (s: string) => s,
  });
  const game = new Game();
  let replay: any[] = [],
    nextSteps: any[] = [];
  Object.assign(game, {
    network,
    ready: true,
    disposed: false,
    sim,
    actor,
    seq: 0,
    accumulator: 0,
    keys: new Set(),
    yaw: 0,
    localId: "self",
    lastAuthorityTick: -1,
    respawnPending: false,
    previousPosition: Vector3.Zero(),
    visualOffset: Vector3.Zero(),
    carSnapshots: [],
    snapshots: { remove() {} },
    diagnosticNetwork: { authorityPackets: 0, corrections: 0, resyncs: 0 },
    prediction: new PredictionHistory(),
    networkTimeline: {
      acceptAuthority: () => ({ accepted: true, rebase: false, replay }),
      advance: (_n: number, _make: unknown, apply: (s: any) => void) => {
        advances++;
        for (const step of nextSteps) apply(step);
        return {
          status: "advanced",
          steps: nextSteps.length,
          presentation: {},
        };
      },
    },
    cadBuildings: {
      setDoorStates: (states: any[]) => events.push("render:" + states[0].open),
    },
    updateNetworkPresentation() {},
    trafficInstant: () => 0,
    notice: (message: string) => notices.push(message),
    onAction: (action: string, data: unknown) => {
      actions.push({ action, data });
      return true;
    },
    onInput: () => {},
    onInputFrame: () => {},
  });
  if (!network) initializeDoors.call(game);
  const attach = (timeline: CadDoorTimeline) =>
    game.attachDoorTimeline(timeline);
  return {
    game,
    sim,
    actor,
    world,
    events,
    actions,
    notices,
    attach,
    get restores() {
      return restores;
    },
    get advances() {
      return advances;
    },
    setNow(n: number) {
      now = n;
    },
    setReplay(steps: any[]) {
      replay = steps;
    },
    setSteps(steps: any[]) {
      nextSteps = steps;
    },
    dispose() {
      game.guestDoors.dispose();
      doorPhysics.dispose();
      world.removeCharacterController(actor.controller);
      world.free();
    },
  };
}
function timeline() {
  const t = new CadDoorTimeline([door], identity);
  t.acceptSnapshot(snapshot());
  return t;
}
function authority(f: ReturnType<typeof fixture>, tick = 1, revision = 0) {
  return {
    tick,
    ack: tick,
    inputEpoch: 1,
    inputTickBase: 0,
    receivedSeq: tick,
    time: 1000 + tick * FIXED_DT * 1000,
    state: f.actor.capture(),
    doorRevision: revision,
    doorWorldEpoch: identity.worldEpoch,
  };
}

test("actual Game E starts closed, opens/closes real guest collision and never emits a multiplayer request", () => {
  const f = fixture();
  try {
    assert.equal(f.sim.doorPhysics.isOpen(door.id), false);
    assert.equal(f.game.doorStates.get(door.id).open, false);
    f.game.interact();
    assert.equal(f.sim.doorPhysics.isOpen(door.id), true);
    assert.equal(f.game.doorStates.get(door.id).revision, 1);
    f.setNow(1300);
    f.game.interact();
    assert.equal(f.sim.doorPhysics.isOpen(door.id), false);
    assert.equal(f.actions.length, 0);
    const other = new Actor(f.sim as unknown as Simulation, "blocking-player", {
      x: 0.65,
      y: 40.82,
      z: -0.65,
    });
    f.sim.actors.set(other.id, other);
    f.world.step();
    f.setNow(1600);
    f.game.interact();
    assert.equal(f.sim.doorPhysics.isOpen(door.id), false);
    assert.ok(f.notices.length > 0);
    f.world.removeCharacterController(other.controller);
  } finally {
    f.dispose();
  }
});

test("network E sends desired state only; a complete startup baseline and later delta drive physics/render together", () => {
  const f = fixture(true),
    t = timeline();
  try {
    f.game.ready = false;
    t.acceptDelta(delta(1));
    f.attach(t);
    assert.equal(f.sim.doorPhysics.isOpen(door.id), false);
    f.game.ready = true;
    initializeDoors.call(f.game);
    assert.equal(f.sim.doorPhysics.isOpen(door.id), true);
    f.game.interact();
    assert.equal(f.actions[0].action, "doorRequest");
    assert.deepEqual(JSON.parse(JSON.stringify(f.actions[0].data)), {
      ...identity,
      requestId: 1,
      doorId: door.id,
      expectedRevision: 1,
      open: false,
    });
    assert.equal(f.sim.doorPhysics.isOpen(door.id), true);
    t.acceptDelta(delta(2));
    f.attach(t);
    assert.equal(f.sim.doorPhysics.isOpen(door.id), false);
    assert.equal(f.game.doorStates.get(door.id).open, false);
  } finally {
    t.dispose();
    f.dispose();
  }
});

test("reconnect replaces the multiplayer baseline while a separate guest ignores it and keeps its own closed world", () => {
  const f = fixture(true),
    guest = fixture(),
    old = timeline(),
    next = new CadDoorTimeline([door], { ...identity, worldEpoch: "new-room" });
  try {
    old.acceptDelta(delta(1));
    f.attach(old);
    assert.equal(f.sim.doorPhysics.isOpen(door.id), true);
    guest.game.attachDoorTimeline(old);
    assert.equal(guest.game.doorTimeline, null);
    assert.equal(guest.sim.doorPhysics.isOpen(door.id), false);
    f.game.predictionDoorRevisions.set(9, 1);
    f.attach(next);
    assert.equal(f.game.predictionDoorRevisions.size, 0);
    assert.equal(f.game.nearbyDoor(), null);
    next.acceptSnapshot({ ...snapshot(), worldEpoch: "new-room" });
    f.attach(next);
    assert.equal(f.sim.doorPhysics.isOpen(door.id), false);
    assert.equal(
      old.currentSnapshot()?.states[0].open,
      true,
      "Game may not dispose or overwrite the UI's previous timeline",
    );
    assert.equal(guest.game.guestDoors.revision, 0);
  } finally {
    old.dispose();
    next.dispose();
    f.dispose();
    guest.dispose();
  }
});

test("normal prediction applies POST(T-1) to Actor and POST(T) to the same real world tick", () => {
  const f = fixture(true),
    t = timeline();
  try {
    t.acceptDelta(delta(1, 1));
    t.acceptDelta(delta(2, 2));
    f.attach(t);
    f.setSteps(
      [1, 2].map((seq) => ({ input: idle(seq), time: seq, source: "input" })),
    );
    f.events.length = 0;
    f.game.advanceSimulation(FIXED_DT, 1000);
    assert.deepEqual(
      f.events.filter((s) => s.startsWith("actor:") || s.startsWith("world:")),
      ["actor:false", "world:true", "actor:true", "world:false"],
    );
    assert.equal(f.game.predictionDoorRevisions.get(1), 1);
    assert.equal(f.game.predictionDoorRevisions.get(2), 2);
  } finally {
    t.dispose();
    f.dispose();
  }
});

test("a newer snapshot cannot advance a local frontier whose preceding door tick was discarded", () => {
  const f = fixture(true),
    t = new CadDoorTimeline([door], identity);
  try {
    t.acceptSnapshot(snapshot(0, 10));
    f.attach(t);
    f.setSteps([{ input: idle(1), time: 1, source: "input" }]);
    f.events.length = 0;
    f.game.advanceSimulation(FIXED_DT, 1000);
    assert.equal(
      f.advances,
      0,
      "No command planner advance over missing door history",
    );
    assert.equal(f.game.seq, 0);
    assert.deepEqual(f.events, []);
    assert.equal(f.actions.at(-1)?.action, "doorResync");
  } finally {
    t.dispose();
    f.dispose();
  }
});

test("matching ACK pose/revision cannot skip replay when an unacknowledged door revision changed", () => {
  const f = fixture(true),
    t = timeline();
  try {
    t.acceptDelta(delta(1, 2));
    f.attach(t);
    const packet = authority(f, 1, 0);
    f.game.prediction.states.set(1, packet.state);
    f.game.predictionDoorRevisions.set(1, 0);
    f.game.predictionDoorRevisions.set(2, 0);
    f.setReplay([{ input: idle(2), time: 2, source: "input" }]);
    f.events.length = 0;
    assert.equal(f.game.reconcile(packet, 1000), true);
    assert.equal(
      f.restores,
      1,
      "Different replay door revision must restore and replay despite exact ACK pose",
    );
    assert.deepEqual(
      f.events.filter((s) => s.startsWith("actor:") || s.startsWith("world:")),
      ["actor:false", "world:true"],
    );
    assert.equal(f.game.predictionDoorRevisions.get(2), 1);
    assert.equal(f.sim.doorPhysics.isOpen(door.id), true);
  } finally {
    t.dispose();
    f.dispose();
  }
});

test("fully matching replay revisions retain the exact fast path and only prune acknowledged history", () => {
  const f = fixture(true),
    t = timeline();
  try {
    t.acceptDelta(delta(1, 2));
    f.attach(t);
    const packet = authority(f, 1, 0);
    f.game.prediction.states.set(1, packet.state);
    f.game.predictionDoorRevisions.set(1, 0);
    f.game.predictionDoorRevisions.set(2, 1);
    f.setReplay([{ input: idle(2), time: 2, source: "input" }]);
    f.events.length = 0;
    assert.equal(f.game.reconcile(packet, 1000), true);
    assert.equal(f.restores, 0);
    assert.deepEqual(f.events, []);
    assert.equal(f.game.predictionDoorRevisions.has(1), false);
    assert.equal(f.game.predictionDoorRevisions.get(2), 1);
  } finally {
    t.dispose();
    f.dispose();
  }
});

test("missing baseline/revision gaps stop movement and authority, with throttled recovery and no guessed state", () => {
  const f = fixture(true),
    t = timeline();
  try {
    f.setSteps([{ input: idle(1), time: 1, source: "input" }]);
    f.game.advanceSimulation(FIXED_DT, 1000);
    assert.equal(f.advances, 0);
    assert.equal(f.game.reconcile(authority(f), 1000), false);
    assert.equal(f.restores, 0);
    assert.equal(f.actions.filter((a) => a.action === "doorResync").length, 1);
    f.attach(t);
    t.acceptDelta(delta(2));
    f.setNow(2000);
    f.game.advanceSimulation(FIXED_DT, 2000);
    assert.equal(f.advances, 0);
    assert.equal(f.game.reconcile(authority(f), 2000), false);
    assert.equal(f.restores, 0);
    assert.equal(f.actions.filter((a) => a.action === "doorResync").length, 2);
  } finally {
    t.dispose();
    f.dispose();
  }
});

test("revision lookup and immutable state cache are bounded by retained history and release on replacement/dispose", () => {
  const t = new CadDoorTimeline([door], identity, {
    historyTicks: 4,
    maxEvents: 3,
  });
  t.acceptSnapshot(snapshot());
  const cache = (t as unknown as { stateCache: Map<number, unknown> })
    .stateCache;
  for (let n = 0; n < 1000; n++) assert.equal(t.revisionAt(n), 0);
  assert.equal(
    cache.size,
    0,
    "revision-only hot path cannot materialize door arrays",
  );
  const initial = t.snapshotAt(0)!,
    later = t.snapshotAt(100)!;
  assert.equal(initial.states, later.states);
  assert.ok(Object.isFrozen(initial.states));
  assert.ok(Object.isFrozen(initial.states[0]));
  for (let n = 1; n <= 40; n++) {
    t.acceptDelta(delta(n));
    t.snapshotAt(n);
    assert.ok(cache.size <= 4);
  }
  assert.equal(t.snapshotAt(0), null);
  assert.equal(t.revisionAt(40), 40);
  t.acceptDelta(delta(42));
  assert.equal(t.currentSnapshot(), null);
  t.acceptSnapshot(snapshot(42));
  assert.equal(cache.size, 0);
  assert.equal(t.currentSnapshot()?.revision, 42);
  t.dispose();
  assert.equal(cache.size, 0);
  assert.equal(t.revisionAt(100), null);
});
