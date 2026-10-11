import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Game } from "../client/game";
import { initPhysics, Simulation } from "../shared/simulation";
import {
  PredictionHistory,
  SnapshotBuffer,
  type Authority,
} from "../shared/netcode";
import { SPAWN } from "../shared/world";

await initPhysics();
function context(network = true) {
  const simulation = new Simulation(),
    actor = simulation.add("local");
  // Exercise the actual Game recovery methods with real Rapier, without a
  // browser/WebGL constructor. These are not rendered/GPU tests.
  const game = Object.create(Game.prototype) as Game;
  let bufferClears = 0,
    animationResets = 0,
    avatarDisposals = 0;
  Object.assign(game, {
    sim: simulation,
    actor,
    ready: true,
    network,
    disposed: false,
    localId: "session-local",
    localPlayer: { id: "session-local" },
    contactShadows: { remove() {} },
    lastAuthorityTick: -1,
    minimumMotionTick: -1,
    respawnPending: false,
    prediction: new PredictionHistory(),
    snapshots: new SnapshotBuffer(),
    seq: 20,
    accumulator: 0.05,
    jumpWasDown: true,
    keys: new Set(["KeyW", "Space"]),
    orbiting: true,
    pointerPress: {},
    canvas: { style: { cursor: "grabbing" }, dataset: {} },
    visualOffset: new Vector3(8, 3, -9),
    previousPosition: new Vector3(40, 50, 60),
    carSnapshots: [{ time: 100, state: simulation.car.capture() }],
    previousCarPose: { position: new Vector3(300, 90, 200) },
    distance: 8,
    cameraArm: 0.22,
    yaw: -2,
    vehicleCameraSnap: false,
    avatars: new Map([
      [
        "session-local",
        {
          target: {},
          root: { dispose: () => avatarDisposals++ },
          animation: { reset: () => animationResets++ },
        },
      ],
    ]),
    onPredictionReset: () => bufferClears++,
  });
  game.snapshots.push(
    {
      time: 100,
      tick: 1,
      rows: [
        [game.localId, 40, 50, 60, 0, 0, 1, 0, "outside"],
        ["other-player", 12, 1, 15, 0, 0, 1, 0, "outside"],
      ],
    },
    100,
  );
  for (let seq = 13; seq <= 20; seq++)
    game.prediction.push(
      { x: 0, z: 1, yaw: 0, seq, vehicle: false, jump: false },
      actor.capture(),
    );
  return {
    game,
    simulation,
    actor,
    counts: () => ({ bufferClears, animationResets, avatarDisposals }),
    dispose: () => simulation.dispose(),
  };
}

test("network respawn clears held controls and transport history before sending one request", () => {
  const c = context();
  let sent = 0;
  c.game.onAction = (action) => {
    assert.equal(action, "respawn");
    assert.equal(c.game.respawnPending, true);
    assert.equal(c.game.keys.size, 0);
    assert.equal(c.game.prediction.inputs.length, 0);
    assert.equal(c.game.accumulator, 0);
    assert.equal(c.counts().bufferClears, 1);
    sent++;
    return true;
  };
  assert.equal(c.game.requestRespawn(), true);
  assert.equal(c.game.requestRespawn(), false);
  assert.equal(sent, 1);
  const old = { ...c.actor.position };
  c.game.reconcile({
    tick: 10,
    time: 1000,
    ack: 12,
    state: { ...c.actor.capture(), position: { x: 500, y: 100, z: 500 } },
  });
  assert.deepEqual(
    { ...c.actor.position },
    old,
    "an ordinary in-flight packet cannot complete/replay a pending recovery",
  );
  assert.equal(c.game.respawnPending, true);
  c.dispose();
});

test("forced authority restores safely without reading the old vehicle pose, replay, or stale camera/car history", () => {
  const c = context(),
    server = new Simulation(),
    authoritative = server.add("server-local");
  c.actor.setVehicle(true);
  c.game.actor = new Proxy(c.actor, {
    get(target, key, receiver) {
      if (key === "position" && target.vehicle)
        throw Error("old vehicle pose was read");
      return Reflect.get(target, key, receiver);
    },
  });
  c.game.onAction = () => true;
  c.game.requestRespawn();
  const oldStep = c.actor.step;
  let replayed = 0;
  c.actor.step = function (...args) {
    replayed++;
    return oldStep.apply(this, args);
  };
  const state = {
    ...authoritative.capture(),
    vehicleState: server.car.capture(),
  };
  const packet: Authority = {
    tick: 40,
    time: 2000,
    ack: 12,
    resync: true,
    respawn: true,
    state,
  };
  assert.doesNotThrow(() => c.game.reconcile(packet));
  assert.equal(c.actor.vehicle, false);
  assert.deepEqual({ ...c.actor.position }, state.position);
  assert.equal(c.game.seq, 12);
  assert.equal(c.game.respawnPending, false);
  assert.equal(replayed, 0);
  assert.equal(c.game.carSnapshots.length, 0);
  assert.equal(c.game.snapshots.entities.has(c.game.localId), false);
  assert.equal(
    c.game.snapshots.entities.has("other-player"),
    true,
    "recovery preserves remote/world identity history",
  );
  assert.deepEqual(c.game.visualOffset.asArray(), [0, 0, 0]);
  assert.deepEqual(c.game.previousPosition.asArray(), [
    state.position.x,
    state.position.y,
    state.position.z,
  ]);
  assert.equal(c.game.vehicleCameraSnap, true);
  assert.equal(c.game.cameraArm, 8);
  assert.equal(c.game.yaw, state.yaw);
  assert.equal(c.game.orbiting, false);
  assert.equal(c.game.pointerPress, undefined);
  assert.equal(c.game.keys.size, 0);
  assert.equal(c.counts().animationResets, 1);
  assert.equal(c.game.canvas.dataset.recoveryStage, "restored");
  const expectedCar = c.simulation.car.capture();
  c.game.syncMotion({
    tick: 39,
    time: 1999,
    rows: [],
    car: { ...expectedCar, position: { x: 999, y: 999, z: 999 } },
  });
  assert.deepEqual({ ...c.simulation.car.position }, expectedCar.position);
  assert.equal(c.game.carSnapshots.length, 0);
  c.game.syncMotion({ tick: 41, time: 2016, rows: [], car: expectedCar });
  assert.equal(c.game.carSnapshots.length, 1);
  server.dispose();
  c.dispose();
});

test("the shared local recovery action restores on foot and leaves other actors in the world", () => {
  const c = context(false),
    other = c.simulation.add("other");
  const body = other.body;
  c.actor.setVehicle(true);
  assert.equal(c.game.requestRespawn(), true);
  assert.equal(c.game.actor, c.actor);
  assert.equal(c.actor.vehicle, false);
  assert.ok(
    Math.hypot(
      c.actor.position.x - SPAWN.x,
      c.actor.position.y - SPAWN.y,
      c.actor.position.z - SPAWN.z,
    ) < 1e-5,
  );
  assert.equal(c.game.carSnapshots.length, 0);
  assert.equal(c.game.previousCarPose, undefined);
  assert.equal(c.game.vehicleCameraSnap, true);
  assert.equal(c.simulation.actors.get("other"), other);
  assert.equal(other.body, body);
  c.dispose();
});

test("rejected or disconnected respawn does not strand a client in a pending state", () => {
  const c = context();
  let notices = 0;
  c.game.onNotice = () => notices++;
  c.game.onAction = () => false;
  assert.equal(c.game.requestRespawn(), false);
  assert.equal(c.game.respawnPending, false);
  assert.equal(notices, 1);
  c.game.onAction = () => true;
  c.game.requestRespawn();
  assert.equal(c.game.respawnPending, true);
  c.game.cancelRespawn();
  assert.equal(c.game.respawnPending, false);
  assert.equal(c.game.keys.size, 0);
  c.dispose();
});

test("generic forced correction preserves held controls and manual camera intent on foot and in a stopped car", () => {
  for (const driving of [false, true]) {
    const c = context();
    if (driving) c.actor.setVehicle(true);
    c.game.yaw = 2.1;
    c.game.pitch = -0.12;
    c.game.distance = 11;
    c.game.lastCameraInput = 4567;
    const pointer = c.game.pointerPress,
      keys = [...c.game.keys];
    c.game.reconcile({
      tick: 50,
      time: 2500,
      ack: 12,
      resync: true,
      state: c.actor.capture(),
    });
    assert.equal(c.game.respawnPending, false);
    assert.deepEqual([...c.game.keys], keys);
    assert.equal(
      c.game.jumpWasDown,
      true,
      "held Space must not become a fresh jump after ordinary resync",
    );
    assert.equal(c.game.orbiting, true);
    assert.equal(c.game.pointerPress, pointer);
    assert.equal(c.game.canvas.style.cursor, "grabbing");
    assert.equal(c.game.yaw, 2.1);
    assert.equal(c.game.pitch, -0.12);
    assert.equal(c.game.distance, 11);
    assert.equal(c.game.lastCameraInput, 4567);
    assert.equal(c.game.vehicleCameraSnap, false);
    assert.equal(c.game.cameraArm, 0.22);
    assert.equal(c.counts().animationResets, 0);
    assert.equal(c.game.seq, 12);
    assert.equal(c.game.accumulator, 0);
    assert.equal(c.game.prediction.inputs.length, 0);
    assert.equal(c.game.carSnapshots.length, 0);
    assert.deepEqual(c.game.visualOffset.asArray(), [0, 0, 0]);
    assert.equal(c.counts().bufferClears, 1);
    c.dispose();
  }
});

test("new local identity accepts a low-tick server epoch after a prior tick 100000", () => {
  const c = context();
  c.game.reconcile({
    tick: 100000,
    time: 3000,
    ack: 300,
    resync: true,
    state: c.actor.capture(),
  });
  c.game.seq = 301;
  c.game.prediction.push(
    { x: 0, z: 1, yaw: 0, seq: 301, jump: false },
    c.actor.capture(),
  );
  c.game.carSnapshots.push({ time: 3016, state: c.simulation.car.capture() });
  const previousClears = c.counts().bufferClears;
  c.game.setLocalId("new-session");
  assert.equal(c.game.localId, "new-session");
  assert.equal(c.game.localPlayer.id, "new-session");
  assert.equal(c.game.lastAuthorityTick, -1);
  assert.equal(c.game.seq, 0);
  assert.equal(c.game.prediction.inputs.length, 0);
  assert.equal(c.game.carSnapshots.length, 0);
  assert.equal(c.game.previousCarPose, undefined);
  assert.equal(c.game.snapshots.entities.size, 0);
  assert.equal(c.game.snapshots.offset, undefined);
  assert.equal(c.counts().bufferClears, previousClears + 1);
  assert.equal(c.counts().avatarDisposals, 1);
  const freshState = {
    ...c.actor.capture(),
    position: { ...c.actor.position, x: SPAWN.x + 1 },
  };
  c.game.reconcile({
    tick: 1,
    time: 4000,
    ack: 0,
    resync: true,
    state: freshState,
  });
  assert.equal(c.game.lastAuthorityTick, 1);
  assert.equal(c.actor.position.x, SPAWN.x + 1);
  c.game.syncMotion({
    tick: 1,
    time: 4001,
    rows: [["new-peer", 20, 1, 25, 0, 0, 0, 0, "outside"]],
    car: c.simulation.car.capture(),
  });
  assert.equal(c.game.carSnapshots.length, 1);
  assert.ok(c.game.snapshots.entities.has("new-peer"));
  c.dispose();
});

test("same-identity reconnect keeps its tick frontier, prediction and avatar against delayed packets", () => {
  const c = context();
  c.game.reconcile({
    tick: 100000,
    time: 3000,
    ack: 300,
    resync: true,
    state: c.actor.capture(),
  });
  c.game.seq = 301;
  c.game.prediction.push(
    { x: 0, z: 1, yaw: 0, seq: 301, jump: false },
    c.actor.capture(),
  );
  c.game.carSnapshots.push({ time: 3016, state: c.simulation.car.capture() });
  const avatar = c.game.avatars.get(c.game.localId),
    clears = c.counts().bufferClears,
    position = { ...c.actor.position };
  c.game.setLocalId(c.game.localId);
  c.game.reconcile({
    tick: 1,
    time: 10,
    ack: 0,
    resync: true,
    state: { ...c.actor.capture(), position: { x: 999, y: 10, z: 999 } },
  });
  c.game.syncMotion({
    tick: 1,
    time: 10,
    rows: [],
    car: { ...c.simulation.car.capture(), position: { x: 999, y: 10, z: 999 } },
  });
  assert.equal(c.game.lastAuthorityTick, 100000);
  assert.equal(c.game.seq, 301);
  assert.equal(c.game.prediction.inputs.length, 1);
  assert.equal(c.game.carSnapshots.length, 1);
  assert.deepEqual({ ...c.actor.position }, position);
  assert.equal(c.game.avatars.get(c.game.localId), avatar);
  assert.equal(c.counts().avatarDisposals, 0);
  assert.equal(c.counts().bufferClears, clears);
  c.dispose();
});

test("an unrelated forced resync cannot finish an outstanding respawn or consume its camera snap", () => {
  const c = context();
  c.actor.setVehicle(true);
  c.game.onAction = () => true;
  const before = { ...c.actor.position },
    oldYaw = c.game.yaw;
  c.game.requestRespawn();
  // Already in flight before the request: a normal input-gap/visibility reply.
  c.game.reconcile({
    tick: 40,
    time: 2000,
    ack: 10,
    resync: true,
    state: c.actor.capture(),
  });
  assert.equal(c.game.respawnPending, true);
  assert.equal(c.game.seq, 20);
  assert.equal(c.game.vehicleCameraSnap, false);
  assert.equal(c.game.yaw, oldYaw);
  assert.deepEqual({ ...c.actor.position }, before);
  assert.equal(c.counts().animationResets, 0);
  const reply: Authority & { respawn: true } = {
    tick: 41,
    time: 2020,
    ack: 12,
    resync: true,
    respawn: true,
    state: {
      ...c.actor.capture(),
      position: { ...SPAWN },
      vehicle: false,
      yaw: 0,
      speed: 0,
      vertical: 0,
      grounded: false,
      vehicleState: c.simulation.car.capture(),
    },
  };
  c.game.reconcile(reply);
  assert.equal(c.game.respawnPending, false);
  assert.equal(c.actor.vehicle, false);
  assert.equal(c.game.seq, 12);
  assert.equal(c.game.vehicleCameraSnap, true);
  assert.equal(c.game.yaw, 0);
  assert.equal(c.game.keys.size, 0);
  assert.equal(c.counts().animationResets, 1);
  c.dispose();
});

test("generic forced exit keeps the car where it stopped instead of emergency-resetting it to spawn", () => {
  const c = context();
  c.actor.setVehicle(true);
  c.simulation.car.reset({ x: 145, y: 2, z: 35 }, 0.3);
  const expectedCar = { ...c.simulation.car.position };
  const state = {
    ...c.actor.capture(),
    vehicle: false,
    vehicleState: undefined,
    position: { x: 148, y: 3, z: 35 },
    yaw: 0.3,
    speed: 0,
    vertical: 0,
    grounded: false,
  };
  c.game.reconcile({ tick: 40, time: 2000, ack: 12, resync: true, state });
  assert.equal(c.actor.vehicle, false);
  assert.deepEqual({ ...c.simulation.car.position }, expectedCar);
  assert.equal(c.game.yaw, -2);
  assert.equal(c.game.vehicleCameraSnap, false);
  c.dispose();
});

test("marked recovery remains an authoritative hard restore outside pending without taking camera control", () => {
  const c = context();
  c.actor.setVehicle(true);
  c.game.actor = new Proxy(c.actor, {
    get(target, key, receiver) {
      if (key === "position" && target.vehicle)
        throw Error("old car pose was read");
      return Reflect.get(target, key, receiver);
    },
  });
  c.game.reconcile({
    tick: 41,
    time: 2020,
    ack: 12,
    resync: true,
    respawn: true,
    state: {
      position: { ...SPAWN },
      vehicle: false,
      yaw: 0,
      speed: 0,
      vertical: 0,
      grounded: false,
      vehicleState: c.simulation.car.capture(),
    },
  });
  assert.equal(c.actor.vehicle, false);
  assert.equal(c.actor.position.x, SPAWN.x);
  assert.equal(c.game.yaw, -2);
  assert.equal(c.game.vehicleCameraSnap, false);
  assert.equal(c.game.orbiting, true);
  assert.ok(c.game.keys.has("KeyW"));
  c.dispose();
});
