import test from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_DT,
  PredictionHistory,
  SnapshotBuffer,
  type ActorState,
} from "../shared/netcode";
import { initPhysics } from "../shared/simulation";
import {
  createReplayFixture,
  REPLAY_AT,
  REPLAY_INPUTS,
} from "./helpers/prediction-replay-fixture";

await initPhysics();

test("corrected walking and stationary histories avoid subsequent full-world replays", () => {
  for (const movement of ["walking", "stationary"] as const) {
    const results = [];
    for (const staleHistory of [true, false]) {
      const fixture = createReplayFixture(movement, staleHistory);
      try {
        for (let ack = 3; ack <= REPLAY_INPUTS; ack += 3)
          fixture.game.reconcile(fixture.authority(ack));
        const actual = fixture.actor.capture(),
          expected = fixture.authorities.get(REPLAY_INPUTS)!;
        assert.ok(
          Math.hypot(
            actual.position.x - expected.position.x,
            actual.position.y - expected.position.y,
            actual.position.z - expected.position.z,
          ) < 0.003,
          `${movement} must retain authoritative movement`,
        );
        assert.equal(actual.vehicle, false);
        assert.equal(actual.grounded, expected.grounded);
        assert.equal(fixture.prediction.inputs.length, 0);
        assert.equal(fixture.prediction.states.size, 0);
        results.push(fixture.times.length);
      } finally {
        fixture.sim.dispose();
      }
    }
    assert.deepEqual(results, [45, 15], movement);
  }
});

test("replay follows authority time at fixed intervals and records each resulting state", () => {
  const f = createReplayFixture();
  try {
    const packet = f.authority(3);
    f.game.reconcile(packet);
    assert.equal(f.times.length, REPLAY_INPUTS - packet.ack);
    for (let index = 0; index < f.times.length; index++) {
      assert.equal(
        f.times[index],
        packet.time + (index + 1) * FIXED_DT * 1000,
        "no local wall-clock timestamp may enter a replay",
      );
      const seq = packet.ack + index + 1,
        corrected = f.prediction.states.get(seq)!,
        reference = f.authorities.get(seq)!;
      assert.ok(Math.abs(corrected.position.x - reference.position.x) < 0.003);
    }
    assert.deepEqual(f.prediction.states.get(REPLAY_INPUTS), f.actor.capture());
    const steps = f.times.length;
    f.game.reconcile(f.authority(2));
    assert.equal(f.times.length, steps, "older authority remains ignored");
  } finally {
    f.sim.dispose();
  }
});

test("vehicle replay records complete car state and matching authority preserves it", () => {
  const f = createReplayFixture("vehicle");
  try {
    f.game.reconcile(f.authority(3));
    assert.equal(f.times.length, 15);
    assert.deepEqual(f.prediction.states.get(REPLAY_INPUTS), f.actor.capture());
    assert.ok(f.prediction.states.get(6)?.vehicleState);
    const before = f.actor.capture();
    f.game.reconcile(f.authority(6, f.prediction.states.get(6)!));
    assert.equal(f.times.length, 15, "matching car authority must not replay");
    assert.deepEqual(f.actor.capture(), before);
  } finally {
    f.sim.dispose();
  }
});

test("future mode mismatches simulate neutral time without compressing the timeline", () => {
  const f = createReplayFixture("walking", false, [6, 8]);
  try {
    f.prediction.states.set(3, f.authorities.get(3)!);
    f.game.reconcile(f.authority(3));
    assert.equal(
      f.times.length,
      15,
      "matching frontier still replays changed future mode inputs",
    );
    assert.deepEqual(
      f.times,
      Array.from(
        { length: 15 },
        (_, i) => REPLAY_AT + (i + 4) * FIXED_DT * 1000,
      ),
    );
    for (const seq of [6, 8]) {
      assert.equal(
        f.prediction.inputs.find((input) => input.seq === seq)!.vehicle,
        true,
        "original wire input survives a temporary mode filter",
      );
      assert.equal(
        f.prediction.states.get(seq)!.vehicle,
        false,
        "capture records the neutral time step in the authoritative mode",
      );
    }
    assert.deepEqual(f.prediction.states.get(REPLAY_INPUTS), f.actor.capture());
    f.game.reconcile(f.authority(REPLAY_INPUTS));
    assert.equal(f.prediction.states.size, 0);
  } finally {
    f.sim.dispose();
  }
});

test("acknowledgment prunes obsolete vehicle inputs and captures together", () => {
  const history = new PredictionHistory(),
    state: ActorState = {
      position: { x: 0, y: 0, z: 0 },
      yaw: 0,
      speed: 0,
      vertical: 0,
      grounded: true,
      vehicle: false,
    };
  for (let seq = 1; seq <= 5; seq++)
    history.push(
      {
        x: 0,
        z: 0,
        yaw: 0,
        jump: false,
        seq,
        vehicle: seq === 4 ? undefined : seq % 2 === 0,
      },
      { ...state },
    );
  assert.deepEqual(
    history.acknowledge(1, false).map((i) => i.seq),
    [3, 4, 5],
  );
  assert.deepEqual([...history.states.keys()], [3, 4, 5]);
  assert.deepEqual(
    history.acknowledge(4).map((i) => i.seq),
    [5],
  );
  assert.deepEqual([...history.states.keys()], [5]);
  for (let seq = 6; seq <= 200; seq++)
    history.push({ x: 0, z: 0, yaw: 0, jump: false, seq }, state);
  assert.equal(history.inputs.length, 180);
  assert.deepEqual(
    [...history.states.keys()],
    history.inputs.map((i) => i.seq),
  );
  history.clear();
  assert.equal(history.states.size, 0);
});

test("forced authority clears replay history without stepping the world", () => {
  const f = createReplayFixture();
  try {
    f.game.reconcile({ ...f.authority(3), inputEpoch: 2, resync: true });
    assert.equal(f.times.length, 0);
    assert.equal(f.prediction.inputs.length, 0);
    assert.equal(f.prediction.states.size, 0);
    assert.equal(f.game.seq, 3);
    assert.equal(Reflect.get(f.game, "minimumMotionTick"), 3);
  } finally {
    f.sim.dispose();
  }
});

test("remote snapshots preserve optional grounded state without inventing old data", () => {
  const buffer = new SnapshotBuffer();
  const row = ["remote", 0, 1, 0, 0, 0, 1, 0, "outside"];
  buffer.push({ time: REPLAY_AT, tick: 1, rows: [row] }, REPLAY_AT);
  assert.equal(buffer.sample("remote", REPLAY_AT + 100)?.grounded, undefined);
  for (const [index, grounded] of [false, true].entries()) {
    const time = REPLAY_AT + (index + 1) * 100;
    buffer.push({ time, tick: index + 2, rows: [[...row, grounded]] }, time);
    assert.equal(buffer.sample("remote", time + 101)?.grounded, grounded);
  }
  buffer.remove("remote");
  assert.equal(buffer.sample("remote"), undefined);
});

test("matching position cannot hide authoritative grounding or vehicle dynamics changes", () => {
  for (const change of [
    "grounded",
    "steering",
    "rotation",
    "angvel",
    "force",
  ] as const) {
    const f = createReplayFixture(
      change === "grounded" ? "stationary" : "vehicle",
    );
    try {
      const state = structuredClone(f.authorities.get(3)!);
      f.prediction.states.set(3, structuredClone(state));
      if (change === "grounded") state.grounded = !state.grounded;
      else if (change === "steering") state.vehicleState!.steering += 0.2;
      else if (change === "rotation")
        state.vehicleState!.rotation = {
          x: Math.sin(0.1),
          y: 0,
          z: 0,
          w: Math.cos(0.1),
        };
      else state.vehicleState![change].x += 0.2;
      f.game.reconcile(f.authority(3, state));
      assert.equal(
        f.times.length,
        15,
        change +
          " must restore before future replay even when actor position/yaw/linvel match",
      );
    } finally {
      f.sim.dispose();
    }
  }
});
