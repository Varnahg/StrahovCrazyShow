import test from "node:test";
import assert from "node:assert/strict";
import { NetworkTimeline } from "../client/network-timeline";
import { NetworkProbe } from "../client/network-probe";
import {
  TimelineInputQueue,
  type TimelineAuthority,
  type TimelineInput,
} from "../shared/input-timeline";

// Event schedule only: prediction, validation, neutral controls, epoch rejection
// and server consume are the actual production implementations.
const STEP = 1000 / 60;
const HIGH_AT_TICK = 59;
const LOW_AT_TICK = 146;
const mode = { vehicle: false, yaw: 0 };
type Variant = { high: boolean; epoch: boolean; secondEpoch?: boolean };

function run(name: string, variant: Variant) {
  const timeline = new NetworkTimeline();
  const queue = new TimelineInputQueue(1, 0);
  let epoch = 1;
  let probeNow = 0;
  let nonce = 0;
  const probe = new NetworkProbe({
    now: () => probeNow,
    send: (request) => {
      nonce = request.nonce;
    },
    longTasks: () => ({ takeRecords: () => [], disconnect: () => {} }),
  });
  const authorities: { at: number; authority: TimelineAuthority }[] = [];
  const deliveries: { at: number; input: TimelineInput }[] = [];
  const checkpoints: object[] = [];
  let produced = 0,
    waitingFrames = 0,
    rebases = 0;
  const producedFrontier = new Map<number, number>();
  let highSent = false,
    lowSent = false;
  const acceptedMeasurements: {
    rtt: number;
    accepted: boolean;
    overlap: number;
  }[] = [];
  let atFresh = queue.diagnostics();
  let atSecondEpoch = queue.diagnostics();
  timeline.setRtt(34); // A previously accepted stable measurement, before this trace.
  timeline.acceptAuthority({ ...queue.frontier(), time: 100000 }, 0, mode);

  const acceptProbe = (rtt: number, receivedAt: number) => {
    probeNow = receivedAt;
    const measurement = probe.receive({
      nonce,
      serverTimeMs: 100000 + receivedAt - rtt,
      serverTick: Math.floor((receivedAt - rtt) / STEP),
    });
    assert.ok(measurement);
    acceptedMeasurements.push({
      rtt: measurement.rawRoundTripMs,
      accepted: measurement.acceptedForPrediction,
      overlap: measurement.blockedOverlapMs,
    });
    assert.equal(measurement.acceptedForPrediction, true);
    timeline.setRtt(measurement.predictionRoundTripMs!);
  };

  try {
    for (let tick = 0; tick <= 300; tick++) {
      const now = tick * STEP;
      if (variant.high && !highSent && now >= HIGH_AT_TICK * STEP - 533.6) {
        probeNow = HIGH_AT_TICK * STEP - 533.6;
        assert.equal(probe.poll({ enabled: true, ready: true })?.kind, "sent");
        highSent = true;
      }
      if (variant.high && tick === HIGH_AT_TICK) acceptProbe(533.6, now);
      if (variant.high && !lowSent && now >= LOW_AT_TICK * STEP - 34) {
        probeNow = LOW_AT_TICK * STEP - 34;
        assert.equal(probe.poll({ enabled: true, ready: true })?.kind, "sent");
        lowSent = true;
      }
      if (variant.high && tick === LOW_AT_TICK) acceptProbe(34, now);

      // Commands arrive before the next fixed server step, always one tick
      // after creation. No real socket, sender or physics runs in this fixture.
      for (let i = 0; i < deliveries.length;) {
        if (deliveries[i].at > tick) {
          i++;
          continue;
        }
        queue.push(deliveries.splice(i, 1)[0].input, now);
      }
      if (tick > 0) queue.consume(tick, mode);
      if (
        (variant.epoch && tick === 60) ||
        (variant.secondEpoch && tick === 180)
      )
        queue.reset(++epoch, tick);

      // The same receive schedule is used in all controls: during the incident
      // authority callback delay is 100ms, then returns to one tick. It is not
      // an estimate of the user's actual wire delay.
      if (tick % 3 === 0)
        authorities.push({
          at: tick + (tick >= 60 && tick < LOW_AT_TICK ? 6 : 1),
          authority: { ...queue.frontier(), time: 100000 + now },
        });
      for (let i = 0; i < authorities.length;) {
        if (authorities[i].at > tick) {
          i++;
          continue;
        }
        const item = authorities.splice(i, 1)[0];
        const result = timeline.acceptAuthority(item.authority, now, mode);
        if (result.accepted && result.rebase) rebases++;
      }

      const advance = timeline.advance(
        now,
        (seq) => ({ seq, x: 0, z: 1, yaw: 0, vehicle: false, jump: false }),
        (step) => {
          if (step.source !== "input") return;
          const previous = producedFrontier.get(step.input.inputEpoch) ?? -1;
          assert.ok(
            step.input.seq > previous,
            "generated commands never reuse or decrease a sequence within the same epoch",
          );
          producedFrontier.set(step.input.inputEpoch, step.input.seq);
          produced++;
          deliveries.push({ at: tick + 1, input: step.input });
        },
      );
      if (advance.status === "waiting") waitingFrames++;
      if (tick === LOW_AT_TICK) atFresh = queue.diagnostics();
      if (tick === 182) atSecondEpoch = queue.diagnostics();
      if ([58, 66, 145, 146, 160, 179, 182, 220, 300].includes(tick)) {
        const clock = timeline.snapshot(),
          server = queue.frontier();
        const estimated =
          clock.clockSeqAtAnchor + (now - clock.clockAnchorAtMs) / STEP;
        checkpoints.push({
          tick,
          serverEpoch: server.inputEpoch,
          clientEpoch: clock.inputEpoch,
          rtt: clock.rttMs,
          lead: clock.leadTicks,
          clockMinusServer: +(estimated - server.ack).toFixed(6),
          predicted: clock.predictedSeq,
          serverAck: server.ack,
          advance: advance.status,
          produced,
          ahead: queue.diagnostics().rejected.ahead,
        });
      }
    }
    const final = queue.diagnostics();
    const result = {
      name,
      waitingFrames,
      produced,
      rebases,
      acceptedMeasurements,
      aheadAfterFresh: final.rejected.ahead - atFresh.rejected.ahead,
      acceptedAfterFresh: final.accepted - atFresh.accepted,
      aheadAfterSecondEpoch:
        final.rejected.ahead - atSecondEpoch.rejected.ahead,
      acceptedAfterSecondEpoch: final.accepted - atSecondEpoch.accepted,
      final,
      checkpoints,
    };
    return result;
  } finally {
    probe.dispose();
  }
}

test("positive: stable low RTT with the same epoch and authority-delay schedule stays inside future bound", () => {
  const r = run("stable-low-with-epoch", { high: false, epoch: true });
  assert.equal(r.final.rejected.ahead, 0);
  assert.ok(r.acceptedAfterFresh > 100);
  assert.equal(r.waitingFrames, 0);
});

test("positive isolation: high RTT without a new epoch resumes valid commands after the fresh low sample", () => {
  const r = run("high-without-epoch", { high: true, epoch: false });
  assert.equal(r.aheadAfterFresh, 0);
  assert.ok(r.acceptedAfterFresh > 100);
  assert.equal(r.waitingFrames, LOW_AT_TICK - HIGH_AT_TICK);
});

test("high RTT then new epoch resumes deliverable commands after the supported low sample", () => {
  const r = run("high-new-epoch-low", { high: true, epoch: true });
  assert.equal(r.waitingFrames, LOW_AT_TICK - HIGH_AT_TICK);
  assert.equal(r.aheadAfterFresh, 0, JSON.stringify(r.checkpoints));
  assert.ok(r.acceptedAfterFresh > 100);
});

test("another low-RTT epoch keeps the already recovered commands inside the future bound", () => {
  const r = run("high-new-epoch-low-reset", {
    high: true,
    epoch: true,
    secondEpoch: true,
  });
  assert.equal(r.waitingFrames, LOW_AT_TICK - HIGH_AT_TICK);
  assert.equal(
    r.aheadAfterFresh,
    0,
    "the incident must already be fixed before the additional reset",
  );
  assert.equal(r.aheadAfterSecondEpoch, 0);
  assert.ok(r.acceptedAfterSecondEpoch > 100);
});
