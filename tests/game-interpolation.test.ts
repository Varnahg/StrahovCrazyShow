import test from "node:test";
import assert from "node:assert/strict";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Game } from "../client/game";
import { NetworkTimeline } from "../client/network-timeline";
import {
  FIXED_DT,
  PredictionHistory,
  SnapshotBuffer,
  type ActorState,
  type Authority,
} from "../shared/netcode";
import type { TimelineInput } from "../shared/input-timeline";
import type { VehicleState } from "../shared/vehicle";
import { initPhysics } from "../shared/simulation";
import { installFixtureDoorHistory } from "./helpers/prediction-replay-fixture";

await initPhysics();

const SPEED = 12;
const ANGULAR_SPEED = 0.24;
const TIME_ORIGIN = 1_000_000;
const INITIAL_BASE = 100;
const close = (actual: number, expected: number, message: string) =>
  assert.ok(
    Math.abs(actual - expected) < 1e-7,
    `${message}: actual=${actual}, expected=${expected}`,
  );

/** Constant-velocity dynamics isolate timing from contacts and input response.
 * All sequence planning, history, Game step bookkeeping and interpolation are
 * production code. Only the door channel owns a tiny Rapier world; motion stays
 * analytic. No full Simulation, scene or render loop is constructed. */
function fixture(t: import("node:test").TestContext) {
  let body = new Vector3(0, 2, 0);
  let angle = 0;
  let physicsSteps = 0;
  const sent: TimelineInput[] = [];
  const requests: string[] = [];
  const carState = (): VehicleState => ({
    id: "timing-car",
    driverId: "local",
    parked: false,
    parking: {
      position: { x: 0, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    },
    position: { x: body.x, y: body.y, z: body.z },
    rotation: { x: 0, y: Math.sin(angle / 2), z: 0, w: Math.cos(angle / 2) },
    linvel: { x: 0, y: 0, z: SPEED },
    angvel: { x: 0, y: ANGULAR_SPEED, z: 0 },
    steering: 0,
    wheelSpin: [0, 0, 0, 0],
    wheelSuspension: [0.2, 0.2, 0.2, 0.2],
    wheelContact: [true, true, true, true],
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0, z: 0 },
    sleeping: false,
  });
  const actor = {
    vehicle: true,
    grounded: true,
    speed: SPEED,
    get yaw() { return angle; },
    get position() { return { x: body.x, y: body.y + 0.8, z: body.z }; },
    step() {
      // The body coasts even in a neutral command slot. Only sim.tick advances it.
    },
    capture(): ActorState {
      return {
        position: { ...this.position },
        yaw: angle,
        speed: SPEED,
        vertical: 0,
        grounded: true,
        vehicle: true,
        vehicleState: carState(),
      };
    },
    restore(state: ActorState) {
      assert.ok(state.vehicle && state.vehicleState);
      body = Vector3.FromArray([
        state.vehicleState.position.x,
        state.vehicleState.position.y,
        state.vehicleState.position.z,
      ]);
      angle = state.yaw;
    },
  };
  const sim = {
    car: { getVisualPose: carState, capture: carState },
    tick() {
      physicsSteps++;
      body.z += SPEED * FIXED_DT;
      angle += ANGULAR_SPEED * FIXED_DT;
    },
  };
  const networkTimeline = new NetworkTimeline();
  networkTimeline.setRtt(26);
  networkTimeline.acceptAuthority(
    { inputEpoch: 1, inputTickBase: INITIAL_BASE, tick: INITIAL_BASE, ack: 0, time: TIME_ORIGIN },
    0,
    { vehicle: true, yaw: 0 },
  );
  const game = Object.assign(Object.create(Game.prototype), {
    actor,
    sim,
    networkTimeline,
    network: true,
    ready: true,
    localId: "local",
    localPlayer: { id: "local" },
    avatars: new Map(),
    contactShadows: { remove() {} },
    canvas: { style: { cursor: "" }, dataset: {} },
    respawnPending: false,
    lastAuthorityTick: -1,
    minimumMotionTick: -1,
    lastTimelineRecoveryAt: -Infinity,
    keys: new Set(["KeyW"]),
    jumpWasDown: false,
    yaw: 0,
    seq: 0,
    accumulator: 0,
    prediction: new PredictionHistory(),
    snapshots: new SnapshotBuffer(),
    carSnapshots: [],
    previousPosition: new Vector3(0, 2.8, 0),
    previousCarPose: { position: body.clone(), rotation: Quaternion.Identity() },
    visualOffset: Vector3.Zero(),
    diagnosticNetwork: {
      authorityPackets: 0,
      motionPackets: 0,
      corrections: 0,
      resyncs: 0,
      lastCorrectionMetres: 0,
      lastMotionAtMs: 0,
    },
    onInput: (input: TimelineInput) => sent.push(input),
    onPredictionReset() {},
    onAction: (action: string) => { requests.push(action); return true; },
  }) as Game;
  const doors = installFixtureDoorHistory(game, INITIAL_BASE);
  t.after(() => game.sim.dispose());
  let lastClockAck = 0;
  function refreshClock(now: number) {
    const ack = Math.floor(now / (FIXED_DT * 1000));
    if (ack <= lastClockAck) return;
    // Supply fresh clock anchors without injecting any physics correction.
    // Recovery below deliberately uses the real Game.reconcile path instead.
    const acceptance = networkTimeline.acceptAuthority(
      {
        inputEpoch: 1,
        inputTickBase: INITIAL_BASE,
        tick: INITIAL_BASE + ack,
        ack,
        time: TIME_ORIGIN + ack * FIXED_DT * 1000,
      },
      now,
      { vehicle: true, yaw: angle },
    );
    assert.ok(acceptance.accepted && !acceptance.rebase, "steady run must not rebase");
    lastClockAck = ack;
  }
  function sample() {
    const current = carState();
    const carPosition = new Vector3(current.position.x, current.position.y, current.position.z);
    const carRotation = new Quaternion(current.rotation.x, current.rotation.y, current.rotation.z, current.rotation.w);
    const localPosition = game.interpolateLocalPosition(actor.position);
    game.interpolateDrivenCarPose(carPosition, carRotation);
    close(localPosition.x, carPosition.x, "root and car share X");
    close(localPosition.y - carPosition.y, 0.8, "camera target retains actor/car height offset");
    close(localPosition.z, carPosition.z, "root and car share Z");
    const yaw = Math.atan2(2 * carRotation.w * carRotation.y, 1 - 2 * carRotation.y * carRotation.y);
    return { localPosition, carPosition, yaw };
  }
  return { game, actor, doors, sent, requests, refreshClock, sample, physicsSteps: () => physicsSteps };
}

for (const fps of [60, 144]) {
  test(`actual Game interpolation preserves constant movement at ${fps} FPS`, (t) => {
    const f = fixture(t);
    let previousNow = 0;
    f.game.advanceSimulation(0, 0);
    let previous = f.sample();
    for (let frame = 1; frame <= fps * 3; frame++) {
      const now = frame * 1000 / fps;
      const elapsed = (now - previousNow) / 1000;
      if (frame % Math.ceil(fps / 20) === 0) f.refreshClock(now);
      f.game.advanceSimulation(elapsed, now);
      const current = f.sample();
      if (frame > fps / 4) {
        close(current.localPosition.z - previous.localPosition.z, SPEED * elapsed,
          `${fps} FPS frame ${frame}, seq ${f.game.seq}: constant translation`);
        close(current.yaw - previous.yaw, ANGULAR_SPEED * elapsed,
          `${fps} FPS frame ${frame}, seq ${f.game.seq}: constant rotation`);
      }
      previous = current;
      previousNow = now;
    }
  });
}

test("actual Game continues interpolation on consecutive zero-step frames", (t) => {
  const f = fixture(t);
  f.game.advanceSimulation(0, 0);
  f.game.advanceSimulation(0.012, 12);
  let previous = f.sample();
  const steps = f.physicsSteps();
  const seq = f.game.seq;
  for (const now of [16, 20]) {
    f.game.advanceSimulation(0.004, now);
    const current = f.sample();
    assert.equal(f.physicsSteps(), steps, "fixture must exercise a frame without a fixed step");
    assert.equal(f.game.seq, seq);
    close(current.localPosition.z - previous.localPosition.z, SPEED * 0.004,
      `zero-step frame at ${now}ms still advances presentation`);
    close(current.yaw - previous.yaw, ANGULAR_SPEED * 0.004,
      `zero-step frame at ${now}ms still rotates presentation`);
    previous = current;
  }
});

for (const reason of ["stale-authority", "latency-budget"] as const) {
  test(`actual Game ${reason} waiting does not rewind the displayed tick pair`, (t) => {
    const f = fixture(t);
    f.game.advanceSimulation(0, 0);
    f.game.advanceSimulation(0.005, 5);
    const before = f.sample();
    const steps = f.physicsSteps();
    const seq = f.game.seq;
    const sent = f.sent.length;
    if (reason === "latency-budget") f.game.networkTimeline.setRtt(533.6);
    f.game.advanceSimulation(
      reason === "stale-authority" ? 0.1 : 0.005,
      reason === "stale-authority" ? 300 : 10,
    );
    const after = f.sample();
    assert.equal(f.physicsSteps(), steps);
    assert.equal(f.game.seq, seq);
    assert.equal(f.sent.length, sent);
    assert.deepEqual(f.requests, reason === "stale-authority" ? ["resync"] : []);
    close(after.localPosition.z, before.localPosition.z, "waiting must retain the displayed translation");
    close(after.yaw, before.yaw, "waiting must retain the displayed rotation");
  });
}

test("actual Game recovery replaces the interpolation pair before the new epoch advances", (t) => {
  const f = fixture(t);
  f.game.advanceSimulation(0, 0);
  f.game.advanceSimulation(0.012, 12);
  const state = f.actor.capture();
  state.position.z = 100;
  state.vehicleState!.position.z = 100;
  state.yaw = 0.4;
  state.vehicleState!.rotation = { x: 0, y: Math.sin(0.2), z: 0, w: Math.cos(0.2) };
  const recovery: Authority = {
    inputEpoch: 2,
    inputTickBase: 1000,
    tick: 1000,
    ack: 0,
    receivedSeq: 0,
    time: TIME_ORIGIN + 300,
    resync: true,
    resyncReason: "client-request",
    state,
  };
  assert.equal(f.game.reconcile(f.doors.withAuthority(recovery), 300), true);
  const restored = f.sample();
  close(restored.localPosition.z, 100, "old-epoch endpoint cannot leak into the restored root");
  close(restored.yaw, 0.4, "old-epoch rotation cannot leak into the restored car");
  const sentBefore = f.sent.length;
  f.game.advanceSimulation(0, 300);
  const resumed = f.sample();
  assert.ok(resumed.localPosition.z >= 100 && resumed.localPosition.z <= 102,
    "new interpolation pair must lie on the new-epoch trajectory");
  const fresh = f.sent.slice(sentBefore);
  assert.ok(fresh.length > 0 && fresh.every((input) => input.inputEpoch === 2));
  const beforeOldReply = f.actor.capture();
  assert.equal(f.game.reconcile(f.doors.withAuthority({
    ...recovery,
    inputEpoch: 1,
    inputTickBase: INITIAL_BASE,
    ack: 1000,
    tick: INITIAL_BASE + 1000,
  }), 301), false);
  assert.deepEqual(f.actor.capture(), beforeOldReply);
  close(f.sample().localPosition.z, resumed.localPosition.z, "rejected epoch cannot alter presentation");
});

test("a lower input lead cannot rewind the same displayed pair while physics waits", (t) => {
  const f = fixture(t);
  f.game.networkTimeline.setRtt(136);
  f.game.advanceSimulation(0, 0);
  f.game.advanceSimulation(0.001, 1);
  const before = f.sample();
  const seq = f.game.seq;
  const steps = f.physicsSteps();
  const sent = f.sent.length;
  f.game.networkTimeline.setRtt(26);
  let previousNow = 1;
  for (const now of [2, 10, 20, 40, 60]) {
    f.game.advanceSimulation((now - previousNow) / 1000, now);
    const current = f.sample();
    assert.equal(f.game.seq, seq);
    assert.equal(f.physicsSteps(), steps);
    assert.equal(f.sent.length, sent);
    close(current.localPosition.z, before.localPosition.z, "lower lead holds this pair's translation");
    close(current.yaw, before.yaw, "lower lead holds this pair's rotation");
    previousNow = now;
  }
  f.game.advanceSimulation(0.02, 80);
  assert.ok(f.game.seq > seq, "prediction resumes when the new horizon catches up");
  assert.ok(f.sample().localPosition.z > before.localPosition.z);
});

test("a replacement timeline cannot inherit alpha from equal epoch and sequence numbers", (t) => {
  const previous = fixture(t);
  previous.game.advanceSimulation(0, 0);
  previous.game.advanceSimulation(0.02, 20);
  const oldSeq = previous.game.seq;
  const reference = fixture(t);
  reference.actor.restore(previous.actor.capture());
  for (const f of [previous, reference]) {
    const timeline = new NetworkTimeline();
    timeline.setRtt(2);
    timeline.acceptAuthority(
      { inputEpoch: 1, inputTickBase: INITIAL_BASE, tick: INITIAL_BASE + 1, ack: 1, time: TIME_ORIGIN },
      20,
      { vehicle: true, yaw: f.actor.yaw },
    );
    f.game.networkTimeline = timeline;
    f.game.advanceSimulation(0, 20);
    assert.equal(f.game.seq, oldSeq, "new timeline deliberately reuses the old pair's sequence");
  }
  const actual = previous.sample();
  const expected = reference.sample();
  close(actual.localPosition.z, expected.localPosition.z, "replacement behaves like a fresh Game phase");
  close(actual.yaw, expected.yaw, "replacement rotation uses the new timeline phase");
});

test("actual identity reset cannot render an old endpoint before fresh authority", (t) => {
  const f = fixture(t);
  f.game.advanceSimulation(0, 0);
  f.game.advanceSimulation(0.02, 20);
  const oldTimeline = f.game.networkTimeline;
  f.game.setLocalId("new-session");
  assert.notEqual(f.game.networkTimeline, oldTimeline);
  assert.equal(f.game.previousCarPose, undefined);
  const current = f.actor.position;
  close(f.game.interpolateLocalPosition(current).z, current.z,
    "no valid new-session segment means current pose, not an old pair");
});

test("actual respawn request retains presentation while clearing transport history", (t) => {
  const f = fixture(t);
  f.game.advanceSimulation(0, 0);
  f.game.advanceSimulation(0.005, 5);
  const before = f.sample();
  const steps = f.physicsSteps();
  const sent = f.sent.length;
  assert.equal(f.game.requestRespawn(), true);
  assert.equal(f.game.prediction.inputs.length, 0);
  assert.equal(f.game.accumulator, 0);
  f.game.advanceSimulation(0.1, 1000);
  assert.equal(f.game.respawnPending, true);
  assert.equal(f.physicsSteps(), steps);
  assert.equal(f.sent.length, sent);
  assert.deepEqual(f.requests, ["respawn"]);
  const after = f.sample();
  close(after.localPosition.z, before.localPosition.z, "history reset is not a displayed-pair reset");
  close(after.yaw, before.yaw, "pending respawn holds car interpolation");
});

test("offline Game keeps fixed-step accumulator interpolation even after a network phase", (t) => {
  const f = fixture(t);
  f.game.advanceSimulation(0, 0);
  f.game.network = false;
  f.game.accumulator = 0;
  f.game.trafficInstant = () => TIME_ORIGIN;
  const before = f.actor.position.z;
  const steps = f.physicsSteps();
  const sent = f.sent.length;
  f.game.advanceSimulation(FIXED_DT * 1.5, 1000);
  const middle = f.sample();
  assert.equal(f.physicsSteps(), steps + 1);
  close(middle.localPosition.z - before, SPEED * FIXED_DT / 2,
    "offline draw retains its half-step remainder");
  f.game.advanceSimulation(FIXED_DT / 4, 2000);
  const later = f.sample();
  assert.equal(f.physicsSteps(), steps + 1);
  assert.equal(f.sent.length, sent);
  close(later.localPosition.z - middle.localPosition.z, SPEED * FIXED_DT / 4,
    "offline phase advances from dt rather than the unrelated now value");
});
