import test from "node:test";
import assert from "node:assert/strict";
import {
  NetworkTimeline,
  MAX_TIMELINE_FRAME_TICKS,
} from "../client/network-timeline";
import type { PredictedTimelineStep } from "../client/network-timeline";
import type { TimelineAuthority } from "../shared/input-timeline";
import { TimelineInputQueue } from "../shared/input-timeline";

const mode = { vehicle: false, yaw: 0.3 };
const command = (seq: number) => ({
  seq,
  x: 1,
  z: 0,
  yaw: 0.3,
  jump: seq === 2,
  vehicle: false,
});
const authority = (
  ack: number,
  inputEpoch = 1,
  base = 100,
): TimelineAuthority => ({
  inputEpoch,
  inputTickBase: base,
  tick: base + ack,
  ack,
  time: 100_000 + (ack * 1000) / 60,
});

test("a delayed authority advances state knowledge without rewinding the known server clock", () => {
  const timeline = new NetworkTimeline();
  timeline.acceptAuthority(authority(100, 1, 0), 0, mode);
  timeline.advance(0, command, () => {});
  timeline.acceptAuthority(authority(103, 1, 0), 150, mode);
  const delivered: number[] = [];
  const server = new TimelineInputQueue(1, 0);
  for (let tick = 1; tick <= 109; tick++) server.consume(tick, mode);
  timeline.advance(150, command, (step) => {
    if (step.source === "input") {
      delivered.push(step.input.seq);
      assert.equal(server.push(step.input), "accepted");
    }
  });
  assert.deepEqual(delivered, [110, 111, 112, 113, 114, 115]);
  assert.equal(timeline.snapshot().predictedSeq, 115);
  const epoch = timeline.acceptAuthority(authority(0, 2, 110), 166.7, mode);
  assert.ok(epoch.accepted && epoch.epochChanged);
  assert.equal(
    timeline.snapshot().clockSeqAtAnchor,
    0,
    "new epoch resets the previous clock basis",
  );
});

test("RTT changes affect delivery lead without ratcheting an already calibrated server clock forward", () => {
  const timeline = new NetworkTimeline();
  timeline.setRtt(0);
  timeline.acceptAuthority(authority(100, 1, 0), 0, mode);
  timeline.advance(0, command, () => {});
  timeline.setRtt(200);
  timeline.acceptAuthority(authority(103, 1, 0), 50, mode);
  assert.equal(timeline.snapshot().clockSeqAtAnchor, 103);
  timeline.setRtt(0);
  timeline.acceptAuthority(authority(106, 1, 0), 100, mode);
  assert.equal(timeline.snapshot().clockSeqAtAnchor, 106);
  const result = timeline.advance(100, command, () => {});
  assert.equal(result.status, "advanced");
  if (result.status === "advanced") assert.equal(result.targetSeq, 112);
});

test("first trusted RTT can calibrate an unmeasured bootstrap clock once", () => {
  const timeline = new NetworkTimeline();
  timeline.acceptAuthority(authority(100, 1, 0), 0, mode);
  assert.equal(timeline.snapshot().clockCalibrated, false);
  timeline.setRtt(100);
  timeline.acceptAuthority(authority(103, 1, 0), 50, mode);
  assert.equal(timeline.snapshot().clockSeqAtAnchor, 106);
  assert.equal(timeline.snapshot().clockCalibrated, true);
});

test("initial lead predicts all six time steps instead of relabeling one step", () => {
  const timeline = new NetworkTimeline(),
    steps: PredictedTimelineStep[] = [];
  assert.equal(timeline.acceptAuthority(authority(0), 0, mode).accepted, true);
  const result = timeline.advance(0, command, (step) => steps.push(step));
  assert.equal(result.status, "advanced");
  assert.deepEqual(
    steps.map((s) => s.input.seq),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(
    steps.map((s) => s.time),
    [1, 2, 3, 4, 5, 6].map((s) => 100_000 + (s * 1000) / 60),
  );
  assert.equal(steps.filter((s) => s.input.jump).length, 1);
  assert.equal(timeline.snapshot().predictedSeq, 6);
});

test("replay includes only unresolved future ticks, including neutral holes and mode-filtered time", () => {
  const timeline = new NetworkTimeline();
  timeline.acceptAuthority(authority(0), 0, mode);
  timeline.advance(
    0,
    (seq) => ({ ...command(seq), vehicle: seq === 4 }),
    () => {},
  );
  timeline.forgetInput(3);
  const result = timeline.acceptAuthority(authority(2), 33.4, mode);
  assert.ok(result.accepted);
  assert.deepEqual(
    result.replay.map((s) => s.input.seq),
    [3, 4, 5, 6],
  );
  assert.deepEqual(
    result.replay.map((s) => s.source),
    ["missing", "mode-mismatch", "input", "input"],
  );
  assert.ok(result.replay.every((s) => s.input.seq > 2 && !s.input.jump));
  assert.ok(
    result.replay
      .slice(0, 2)
      .every((s) => s.input.x === 0 && s.input.vehicle === false),
  );
  assert.equal(
    timeline.snapshot().retainedInputs,
    3,
    "the missing slot is not invented as an original wire command",
  );
  const later = timeline.acceptAuthority(authority(5), 83.4, mode);
  assert.ok(later.accepted);
  assert.deepEqual(
    later.replay.map((s) => s.input.seq),
    [6],
  );
});

test("a long stall requires fresh authority then rebases instead of replaying elapsed seconds", () => {
  const timeline = new NetworkTimeline();
  timeline.acceptAuthority(authority(0), 0, mode);
  timeline.advance(0, command, () => {});
  let steps = 0;
  assert.deepEqual(
    timeline.advance(1500, command, () => steps++),
    { status: "waiting", reason: "stale-authority" },
  );
  assert.equal(steps, 0);
  const recovery = timeline.acceptAuthority(authority(90), 1500, mode);
  assert.ok(recovery.accepted && recovery.rebase);
  assert.equal(recovery.replay.length, 0);
  const actual: number[] = [];
  timeline.advance(1500, command, (step) => actual.push(step.input.seq));
  assert.deepEqual(actual, [91, 92, 93, 94, 95, 96]);
});

test("old authority and epoch replies cannot restore expired prediction or alter the clock anchor", () => {
  const timeline = new NetworkTimeline();
  timeline.acceptAuthority(authority(10), 200, mode);
  timeline.advance(200, command, () => {});
  const newer = timeline.acceptAuthority(
    { ...authority(0, 2, 110), time: 100_200 },
    201,
    mode,
  );
  assert.ok(newer.accepted && newer.epochChanged && newer.rebase);
  const before = timeline.snapshot();
  assert.deepEqual(timeline.acceptAuthority(authority(11), 202, mode), {
    accepted: false,
    reason: "stale",
  });
  assert.deepEqual(timeline.snapshot(), before);
  assert.deepEqual(
    timeline.acceptAuthority({ ...authority(0, 2, 110), tick: 111 }, 203, mode),
    { accepted: false, reason: "invalid" },
  );
  assert.deepEqual(timeline.snapshot(), before);
});

test("50–200ms RTT has a bounded transport/frame margin and finite per-frame prediction work", () => {
  for (const rtt of [0, 50, 100, 200]) {
    const timeline = new NetworkTimeline();
    assert.ok(timeline.setRtt(rtt));
    timeline.acceptAuthority(authority(0), 1000, mode);
    let steps = 0;
    const result = timeline.advance(1000, command, () => steps++);
    assert.equal(result.status, "advanced");
    assert.ok(timeline.leadTicks >= 6 && timeline.leadTicks <= 11);
    assert.ok(timeline.leadTicks >= Math.ceil(rtt / 2 / (1000 / 60)) + 5);
    assert.ok(steps <= MAX_TIMELINE_FRAME_TICKS);
    assert.equal(
      steps,
      Math.min(
        MAX_TIMELINE_FRAME_TICKS,
        Math.floor(rtt / 2 / (1000 / 60) + 1e-8) + timeline.leadTicks,
      ),
    );
    assert.equal(timeline.setRtt(NaN), false);
  }
});

test("initial and rebased jump edges are sampled only for deliverable future time", () => {
  const timeline = new NetworkTimeline();
  timeline.setRtt(200);
  for (const epoch of [1, 2]) {
    timeline.acceptAuthority(authority(0, epoch), 100, mode);
    let jumpPending = true;
    const produced: PredictedTimelineStep[] = [];
    timeline.advance(
      100,
      (seq) => {
        const input = { ...command(seq), jump: jumpPending };
        jumpPending = false;
        return input;
      },
      (step) => produced.push(step),
    );
    assert.deepEqual(
      produced.filter((s) => s.source === "missing").map((s) => s.input.seq),
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
    assert.equal(produced.find((s) => s.input.jump)?.input.seq, 14);
    assert.equal(produced.filter((s) => s.input.jump).length, 1);
    assert.ok(
      produced
        .filter((s) => s.source === "missing")
        .every((s) => !s.input.jump && s.input.x === 0),
    );
  }
});

test("temporary mode filtering preserves the original future command for later mode changes", () => {
  const timeline = new NetworkTimeline();
  timeline.acceptAuthority(authority(0), 0, mode);
  timeline.advance(0, command, () => {});
  const vehicle = timeline.acceptAuthority(authority(2), 34, {
    vehicle: true,
    yaw: 0,
  });
  assert.ok(vehicle.accepted);
  assert.ok(
    vehicle.replay.every(
      (s) => s.source === "mode-mismatch" && s.input.x === 0,
    ),
  );
  const foot = timeline.acceptAuthority(authority(4), 67, mode);
  assert.ok(foot.accepted);
  assert.ok(foot.replay.every((s) => s.source === "input" && s.input.x === 1));
});

test("valid but unsupported latency is explicit instead of silently dropping all future input", () => {
  const timeline = new NetworkTimeline();
  timeline.setRtt(700);
  timeline.acceptAuthority(authority(0), 1000, mode);
  assert.equal(timeline.snapshot().deliveryBudgetExceeded, true);
  assert.deepEqual(
    timeline.advance(1000, command, () => {
      throw Error("must not simulate");
    }),
    { status: "waiting", reason: "latency-budget" },
  );
});
