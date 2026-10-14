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

test("unsupported bootstrap timing keeps calibration pending through repeated authorities until a supported sample", () => {
  for (const supportedRtt of [0, 34, 200]) {
    const timeline = new NetworkTimeline();
    timeline.setRtt(533.6);
    for (const ack of [0, 3, 6]) {
      timeline.acceptAuthority(authority(ack), ack * (1000 / 60), mode);
      const clock = timeline.snapshot();
      assert.equal(clock.clockSeqAtAnchor, ack);
      assert.equal(clock.clockCalibrated, false);
      assert.equal(clock.rttMs, 533.6);
      assert.equal(clock.deliveryBudgetExceeded, true);
      assert.deepEqual(
        timeline.advance(ack * (1000 / 60), command, () => {
          throw Error("unsupported timing must still wait");
        }),
        { status: "waiting", reason: "latency-budget" },
      );
    }
    timeline.setRtt(supportedRtt);
    timeline.acceptAuthority(authority(9), 150, mode);
    const offset = supportedRtt / 2 / (1000 / 60);
    assert.ok(
      Math.abs(timeline.snapshot().clockSeqAtAnchor - (9 + offset)) < 1e-10,
    );
    assert.equal(timeline.snapshot().clockCalibrated, true);
    timeline.setRtt(200);
    timeline.acceptAuthority(authority(12), 200, mode);
    assert.ok(
      Math.abs(timeline.snapshot().clockSeqAtAnchor - (12 + offset)) < 1e-10,
      "already calibrated clock does not ratchet for another supported RTT",
    );
  }
});

test("new epoch cannot inherit an over-budget clock offset or consume pending calibration with stale or invalid authority", () => {
  const timeline = new NetworkTimeline();
  timeline.setRtt(34);
  timeline.acceptAuthority(authority(100, 1, 0), 0, mode);
  assert.equal(timeline.snapshot().clockCalibrated, true);
  timeline.setRtt(533.6);
  for (const ack of [0, 3, 6]) {
    timeline.acceptAuthority(
      authority(ack, 2, 103),
      50 + ack * (1000 / 60),
      mode,
    );
    assert.equal(timeline.snapshot().clockSeqAtAnchor, ack);
    assert.equal(timeline.snapshot().clockCalibrated, false);
  }
  for (const invalid of [NaN, Infinity, -1]) {
    const before = timeline.snapshot();
    assert.equal(timeline.setRtt(invalid), false);
    assert.deepEqual(timeline.snapshot(), before);
  }
  timeline.setRtt(34);
  const pending = timeline.snapshot();
  assert.deepEqual(timeline.acceptAuthority(authority(6, 2, 103), 180, mode), {
    accepted: false,
    reason: "stale",
  });
  assert.deepEqual(
    timeline.acceptAuthority({ ...authority(9, 2, 103), tick: -1 }, 200, mode),
    { accepted: false, reason: "invalid" },
  );
  assert.deepEqual(timeline.snapshot(), pending);
  assert.equal(timeline.snapshot().clockCalibrated, false);
  timeline.acceptAuthority(authority(9, 2, 103), 200, mode);
  assert.ok(Math.abs(timeline.snapshot().clockSeqAtAnchor - 10.02) < 1e-10);
  assert.equal(timeline.snapshot().clockCalibrated, true);
});

test("a first over-budget sample after unmeasured bootstrap does not finish calibration", () => {
  const timeline = new NetworkTimeline();
  timeline.acceptAuthority(authority(100, 1, 0), 0, mode);
  timeline.setRtt(500);
  timeline.acceptAuthority(authority(103, 1, 0), 50, mode);
  assert.equal(timeline.snapshot().clockSeqAtAnchor, 103);
  assert.equal(timeline.snapshot().clockCalibrated, false);
  timeline.setRtt(200);
  timeline.acceptAuthority(authority(106, 1, 0), 100, mode);
  assert.equal(timeline.snapshot().clockSeqAtAnchor, 112);
  assert.equal(timeline.snapshot().clockCalibrated, true);
});

test("epoch discontinuity and a fresh connection keep independent calibration state", () => {
  const prior = new NetworkTimeline();
  prior.setRtt(200);
  prior.acceptAuthority(authority(1000, 1, 0), 0, mode);
  prior.acceptAuthority(authority(0, 2, 1001), 2000, mode);
  assert.equal(
    prior.snapshot().clockSeqAtAnchor,
    6,
    "clock-drop or respawn epoch uses its own authority basis, not old elapsed time",
  );
  assert.equal(prior.snapshot().clockCalibrated, true);
  const fresh = new NetworkTimeline();
  fresh.acceptAuthority(authority(0, 1, 0), 3000, mode);
  assert.equal(fresh.snapshot().clockSeqAtAnchor, 0);
  assert.equal(fresh.snapshot().clockCalibrated, false);
  fresh.setRtt(200);
  fresh.acceptAuthority(authority(3, 1, 0), 3050, mode);
  assert.equal(fresh.snapshot().clockSeqAtAnchor, 9);
  assert.equal(fresh.snapshot().clockCalibrated, true);
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

test("presentation phase uses the same clock for completed and zero-step frames", () => {
  const timeline = new NetworkTimeline();
  timeline.setRtt(26);
  timeline.acceptAuthority(authority(0), 0, mode);
  const cases = [
    { now: 0, seq: 6, steps: 6, alpha: 0.78 },
    { now: 5, seq: 7, steps: 1, alpha: 0.08 },
    { now: 8, seq: 7, steps: 0, alpha: 0.26 },
    { now: 20, seq: 7, steps: 0, alpha: 0.98 },
    { now: (2 - 0.78) * 1000 / 60, seq: 8, steps: 1, alpha: 0 },
    { now: 21, seq: 8, steps: 0, alpha: 0.04 },
  ];
  for (const expected of cases) {
    const result = timeline.advance(expected.now, command, () => {});
    assert.equal(result.status, "advanced");
    assert.equal(result.steps, expected.steps);
    assert.equal(result.presentation.currentSeq, expected.seq);
    assert.equal(result.presentation.inputEpoch, 1);
    assert.ok(Math.abs(result.presentation.alpha - expected.alpha) < 1e-8);
    assert.ok(result.presentation.alpha >= 0 && result.presentation.alpha <= 1);
  }
});

test("bounded catch-up presentation names the completed tick rather than the future target", () => {
  const timeline = new NetworkTimeline();
  timeline.setRtt(200);
  timeline.acceptAuthority(authority(0), 0, mode);
  const applied: number[] = [];
  const first = timeline.advance(0, command, (step) => applied.push(step.input.seq));
  assert.equal(first.status, "advanced");
  assert.equal(first.steps, MAX_TIMELINE_FRAME_TICKS);
  assert.equal(first.presentation.currentSeq, applied.at(-1));
  assert.ok(first.targetSeq > first.presentation.currentSeq);
  assert.equal(first.presentation.alpha, 1, "never extrapolate past the latest completed pose");
  const second = timeline.advance(0, command, () => {});
  assert.equal(second.status, "advanced");
  assert.equal(second.presentation.currentSeq, first.targetSeq);
  assert.equal(second.remaining, 0);
  assert.ok(second.presentation.alpha >= 0 && second.presentation.alpha < 1e-8);
});

test("a recovered epoch labels its own phase and waiting does not publish a replacement phase", () => {
  const timeline = new NetworkTimeline();
  timeline.setRtt(26);
  timeline.acceptAuthority(authority(0), 0, mode);
  const first = timeline.advance(0, command, () => {});
  assert.equal(first.status, "advanced");
  timeline.acceptAuthority(authority(0, 2, 200), 10, mode);
  const recovered = timeline.advance(10, command, () => {});
  assert.equal(recovered.status, "advanced");
  assert.equal(recovered.presentation.currentSeq, first.presentation.currentSeq);
  assert.equal(recovered.presentation.inputEpoch, 2);
  const waiting = timeline.advance(1000, command, () => assert.fail("waiting cannot step"));
  assert.deepEqual(waiting, { status: "waiting", reason: "stale-authority" });
});
