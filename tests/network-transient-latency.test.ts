import test from "node:test";
import assert from "node:assert/strict";
import { NetworkProbe, PROBE_COOLDOWN_MS } from "../client/network-probe";
import { NetworkTimeline } from "../client/network-timeline";
import { FrameInputBuffer } from "../client/network-input-buffer";
import {
  TimelineInputQueue,
  type TimelineAuthority,
  type TimelineInput,
} from "../shared/input-timeline";
import { ScriptTimelineClient } from "../scripts/timeline-client";

const STEP = 1000 / 60;
const mode = { vehicle: false, yaw: 0 };
const controls = (seq: number, jump = false) => ({
  seq,
  x: 1,
  z: 0,
  yaw: 0,
  jump,
  vehicle: false,
});
const measure = (timeline: NetworkTimeline, rtt: number, at: number) =>
  timeline.setRtt(rtt, at);
const authority = (
  ack: number,
  inputEpoch = 1,
  inputTickBase = 0,
): TimelineAuthority => ({
  ack,
  inputEpoch,
  inputTickBase,
  tick: inputTickBase + ack,
  time: (inputTickBase + ack) * STEP,
});

function runTransport(
  rtt: number,
  fps: number,
  spike: boolean,
  sustainedRtt?: number,
) {
  let now = 0,
    probeNow = 0,
    nonce = 0,
    epoch = 1;
  const timeline = new NetworkTimeline(),
    queue = new TimelineInputQueue(1, 0);
  const inbound: { due: number; input: TimelineInput }[] = [];
  const authorities: { due: number; packet: TimelineAuthority }[] = [];
  const sender = new FrameInputBuffer({
    now: () => now,
    canSend: () => true,
    send: (inputs) => {
      for (const input of inputs as TimelineInput[])
        inbound.push({
          due:
            now + (sustainedRtt && now >= highSentAt ? sustainedRtt : rtt) / 2,
          input,
        });
    },
  });
  const probe = new NetworkProbe({
    now: () => probeNow,
    send: (request) => {
      nonce = request.nonce;
    },
    longTasks: () => ({ takeRecords: () => [], disconnect() {} }),
  });
  const highRtt = sustainedRtt ?? (spike ? 533.6 : rtt);
  const highSentAt = rtt + PROBE_COOLDOWN_MS;
  const highAt = highSentAt + highRtt;
  const lowSentAt = highAt + PROBE_COOLDOWN_MS;
  const lowAt = lowSentAt + (sustainedRtt ?? rtt);
  const probes = [
    { at: 0, reply: false },
    { at: rtt, reply: true },
    { at: highSentAt, reply: false },
    { at: highAt, reply: true },
    { at: lowSentAt, reply: false },
    { at: lowAt, reply: true },
  ];
  const raw: number[] = [],
    jumps: number[] = [];
  const produced = new Map<number, number>();
  let probeIndex = 0,
    waiting = 0,
    activeDuringGrace = 0,
    acceptedDuringGrace = 0;
  let lateAfterEpochWarmup = 0,
    jumpPending = false;
  let producedAfterConfirmation = 0,
    waitingAfterConfirmation = 0;
  const epochAt = 1800,
    finish = 4200;
  // 720Hz event grid contains every 15/60/144FPS frame and every server tick.
  const QUANTUM = 1000 / 720;
  try {
    for (let quantum = 0; quantum <= finish / QUANTUM; quantum++) {
      now = quantum * QUANTUM;
      while (
        probeIndex < probes.length &&
        probes[probeIndex].at <= now + 1e-7
      ) {
        const event = probes[probeIndex++];
        probeNow = event.at;
        if (!event.reply)
          assert.equal(
            probe.poll({ enabled: true, ready: true })?.kind,
            "sent",
          );
        else {
          const sample = probe.receive({
            nonce,
            serverTimeMs: event.at,
            serverTick: Math.floor(event.at / STEP),
          })!;
          assert.ok(sample?.acceptedForPrediction);
          raw.push(sample.rawRoundTripMs);
          measure(timeline, sample.predictionRoundTripMs!, sample.measuredAt);
        }
      }
      for (let i = 0; i < inbound.length;) {
        if (inbound[i].due > now + 1e-7) {
          i++;
          continue;
        }
        const result = queue.push(inbound.splice(i, 1)[0].input, now);
        if (now > epochAt + rtt + 200 && now < lowAt) {
          if (result === "accepted") acceptedDuringGrace++;
          if (result === "late") lateAfterEpochWarmup++;
        }
      }
      if (quantum % 12 === 0) {
        const tick = quantum / 12;
        if (tick > 0) {
          const step = queue.consume(tick, mode);
          if (step.input.jump) jumps.push(epoch);
          if (
            now > epochAt + rtt + 200 &&
            now < lowAt &&
            step.source === "input" &&
            step.input.x === 1
          )
            activeDuringGrace++;
        }
        if (tick === 108) queue.reset(++epoch, tick);
        if (tick % 3 === 0)
          authorities.push({
            due:
              now +
              (sustainedRtt && now >= highSentAt ? sustainedRtt : rtt) / 2,
            packet: { ...queue.frontier(), time: now },
          });
      }
      for (let i = 0; i < authorities.length;) {
        if (authorities[i].due > now + 1e-7) {
          i++;
          continue;
        }
        const item = authorities.splice(i, 1)[0];
        const result = timeline.acceptAuthority(item.packet, item.due, mode);
        if (!result.accepted) continue;
        if (result.rebase)
          sender.reset("rebase", { priority: result.epochChanged });
        if (result.epochChanged) jumpPending = true;
        sender.acknowledge(item.packet.ack);
      }
      if (quantum % (720 / fps) === 0 && now >= rtt) {
        const result = timeline.advance(
          now,
          (seq) => {
            const input = controls(seq, jumpPending);
            jumpPending = false;
            return input;
          },
          (step) => {
            if (step.source !== "input") return;
            const previous = produced.get(step.input.inputEpoch) ?? -1;
            assert.ok(
              step.input.seq > previous,
              "same-epoch command frontier must never repeat or rewind",
            );
            produced.set(step.input.inputEpoch, step.input.seq);
            if (now >= lowAt) producedAfterConfirmation++;
            sender.enqueue(step.input);
          },
        );
        if (result.status === "waiting" && now >= highAt && now < lowAt)
          waiting++;
        if (result.status === "waiting" && now >= lowAt)
          waitingAfterConfirmation++;
        sender.flush("frame");
      }
      if (quantum % 24 === 0) sender.flush("timer");
      assert.ok(queue.diagnostics().depth <= 16);
    }
    return {
      waiting,
      activeDuringGrace,
      acceptedDuringGrace,
      lateAfterEpochWarmup,
      raw,
      jumps,
      producedAfterConfirmation,
      waitingAfterConfirmation,
      finalTiming: timeline.snapshot(),
      queue: queue.diagnostics(),
      sender: sender.snapshot(),
    };
  } finally {
    probe.dispose();
    sender.dispose();
  }
}

for (const rtt of [300, 500])
  test(`real transport degradation to${rtt}ms is bounded by the second probe confirmation`, (t) => {
    const result = runTransport(34, 60, true, rtt);
    assert.equal(result.raw[1], rtt);
    assert.equal(result.raw[2], rtt);
    assert.equal(result.finalTiming.rttMs, rtt);
    assert.equal(result.finalTiming.deliveryBudgetExceeded, true);
    assert.equal(result.producedAfterConfirmation, 0);
    assert.ok(result.waitingAfterConfirmation > 40);
    assert.equal(result.queue.rejected.ahead, 0);
    assert.ok(result.queue.maxDepth <= 16);
    assert.equal(result.sender.overflows, 0);
    t.diagnostic(
      JSON.stringify({
        rtt,
        producedAfterConfirmation: result.producedAfterConfirmation,
        waitingAfterConfirmation: result.waitingAfterConfirmation,
        lateDuringTransition: result.queue.rejected.late,
        acceptedDuringTransition: result.queue.accepted,
        maxDepth: result.queue.maxDepth,
      }),
    );
  });

for (const rtt of [34, 200])
  for (const fps of [15, 60, 144]) {
    test(`isolated raw spike preserves actual delivered controls across an epoch at RTT${rtt}, ${fps}FPS`, (t) => {
      const baseline = runTransport(rtt, fps, false);
      const incident = runTransport(rtt, fps, true);
      assert.equal(baseline.waiting, 0);
      assert.ok(
        baseline.queue.accepted > 200,
        "positive control really delivers input",
      );
      assert.equal(
        incident.waiting,
        0,
        "a single uncertain raw spike must not stop a warm supported transport",
      );
      assert.ok(
        Math.abs(incident.raw[1] - 533.6) < 1e-7,
        "raw evidence remains unchanged",
      );
      assert.ok(
        incident.acceptedDuringGrace > 20,
        "real server queue accepts controls while the spike is pending",
      );
      assert.ok(
        incident.activeDuringGrace > 20,
        "server actually simulates held movement",
      );
      assert.equal(incident.lateAfterEpochWarmup, 0);
      assert.equal(incident.queue.rejected.ahead, 0);
      assert.equal(incident.sender.overflows, 0);
      assert.deepEqual(incident.jumps, [1, 2]);
      assert.deepEqual(
        incident.queue,
        baseline.queue,
        "spike must not change actual server input resolution",
      );
      assert.deepEqual(
        incident.sender,
        baseline.sender,
        "spike must not change sender traffic or recovery",
      );
      t.diagnostic(
        JSON.stringify({
          rtt,
          fps,
          rawSpike: incident.raw[1],
          waiting: incident.waiting,
          acceptedDuringGrace: incident.acceptedDuringGrace,
          activeDuringGrace: incident.activeDuringGrace,
          lateAfterEpochWarmup: incident.lateAfterEpochWarmup,
          totalAccepted: incident.queue.accepted,
          ahead: incident.queue.rejected.ahead,
          jumps: incident.jumps,
        }),
      );
    });
  }

test("actual one-second probe polling retains a fresh 0/1/34ms baseline through one533.6ms sample", () => {
  for (const low of [0, 1, 34]) {
    let now = 0,
      nonce = 0;
    const timeline = new NetworkTimeline();
    const probe = new NetworkProbe({
      now: () => now,
      send: (r) => {
        nonce = r.nonce;
      },
      longTasks: () => null,
    });
    const reply = () => {
      const sample = probe.receive({ nonce, serverTick: 0, serverTimeMs: 0 })!;
      assert.ok(sample.acceptedForPrediction);
      measure(timeline, sample.predictionRoundTripMs!, sample.measuredAt);
      return sample;
    };
    assert.equal(probe.poll({ enabled: true, ready: true })?.kind, "sent");
    now = low;
    reply();
    now = 1000;
    assert.equal(probe.poll({ enabled: true, ready: true }), null);
    now = 2000;
    assert.equal(probe.poll({ enabled: true, ready: true })?.kind, "sent");
    now = 2533.6;
    assert.ok(Math.abs(reply().rawRoundTripMs - 533.6) < 1e-7);
    assert.equal(timeline.snapshot().rttMs, low);
    assert.equal(timeline.snapshot().pendingRttExpiresAtMs, 5033.6);
    probe.dispose();
  }
});

test("freshness is inclusive at3000ms; stale, cold and legacy high RTT remain immediately unsupported", () => {
  for (const rtt of [300, 500, 3000]) {
    const cold = new NetworkTimeline();
    measure(cold, rtt, 100);
    assert.equal(cold.deliveryBudgetExceeded, true);
    for (const age of [3000, 3000.001]) {
      const timeline = new NetworkTimeline();
      measure(timeline, 34, 100);
      measure(timeline, rtt, 100 + age);
      assert.equal(timeline.deliveryBudgetExceeded, age > 3000);
      assert.equal(timeline.snapshot().pendingRttMs, age <= 3000 ? rtt : null);
    }
    const legacy = new NetworkTimeline();
    legacy.setRtt(34);
    measure(legacy, rtt, 101);
    assert.equal(legacy.deliveryBudgetExceeded, true);
  }
});

test("the second independent high sample confirms300/500ms without extending a pending deadline", () => {
  for (const high of [300, 500]) {
    const timeline = new NetworkTimeline();
    measure(timeline, 34, 0);
    measure(timeline, high, 1000);
    const pending = timeline.snapshot();
    assert.equal(pending.pendingRttExpiresAtMs, 3500);
    for (const invalidAt of [1000, 999, -1, NaN, Infinity]) {
      assert.equal(measure(timeline, high + 1, invalidAt), false);
      assert.deepEqual(timeline.snapshot(), pending);
    }
    for (const invalid of [NaN, Infinity, -1]) {
      assert.equal(measure(timeline, invalid, 2000), false);
      assert.deepEqual(timeline.snapshot(), pending);
    }
    assert.equal(measure(timeline, high, 1001), true);
    assert.equal(timeline.snapshot().rttMs, high);
    assert.equal(timeline.snapshot().pendingRttMs, null);
    assert.equal(timeline.deliveryBudgetExceeded, true);
    measure(timeline, 34, 2000);
    assert.equal(timeline.deliveryBudgetExceeded, false);
    assert.equal(timeline.snapshot().rawRttMs, 34);
  }
});

test("expiry without another reply is enforced by advance and keeps the over-budget epoch calibration guard", () => {
  const timeline = new NetworkTimeline();
  measure(timeline, 200, 0);
  timeline.acceptAuthority(authority(0), 0, mode);
  measure(timeline, 500, 1000);
  timeline.acceptAuthority(authority(0, 2, 60), 1000, mode);
  assert.equal(
    timeline.snapshot().clockSeqAtAnchor,
    6,
    "epoch uses the same selected baseline as delivery lead",
  );
  assert.equal(timeline.snapshot().clockCalibrated, true);
  timeline.acceptAuthority(authority(149, 2, 60), 3499, mode);
  assert.equal(timeline.advance(3499, controls, () => {}).status, "advanced");
  assert.equal(timeline.snapshot().pendingRttExpiresAtMs, 3500);
  assert.deepEqual(
    timeline.advance(3500, controls, () =>
      assert.fail("expired high must not produce"),
    ),
    { status: "waiting", reason: "latency-budget" },
  );
  timeline.acceptAuthority(authority(0, 3, 210), 3500, mode);
  assert.equal(timeline.snapshot().clockSeqAtAnchor, 0);
  assert.equal(timeline.snapshot().clockCalibrated, false);
  measure(timeline, 34, 3501);
  timeline.acceptAuthority(authority(3, 3, 210), 3550, mode);
  assert.ok(Math.abs(timeline.snapshot().clockSeqAtAnchor - 4.02) < 1e-8);
});

test("only valid accepted authority or a valid new sample expires pending state; snapshots stay read-only", () => {
  const timeline = new NetworkTimeline();
  measure(timeline, 34, 0);
  timeline.acceptAuthority(authority(0), 0, mode);
  measure(timeline, 500, 1000);
  const before = timeline.snapshot();
  assert.deepEqual(timeline.acceptAuthority(authority(0), 4000, mode), {
    accepted: false,
    reason: "stale",
  });
  assert.deepEqual(
    timeline.acceptAuthority({ ...authority(210), tick: -1 }, 4000, mode),
    { accepted: false, reason: "invalid" },
  );
  assert.deepEqual(timeline.snapshot(), before);
  assert.deepEqual(timeline.snapshot(), before);
  timeline.acceptAuthority(authority(210), 3500, mode);
  assert.equal(timeline.snapshot().rttMs, 500);
  assert.equal(timeline.snapshot().pendingRttMs, null);
  const bySample = new NetworkTimeline();
  measure(bySample, 34, 0);
  measure(bySample, 500, 1000);
  measure(bySample, 500, 3500);
  assert.equal(bySample.snapshot().rttMs, 500);
  assert.equal(bySample.snapshot().pendingRttMs, null);
});

test("connection reset and legacy calls discard confidence while preserving frontiers and clock", () => {
  const timeline = new NetworkTimeline();
  measure(timeline, 34, 0);
  timeline.acceptAuthority(authority(0), 0, mode);
  timeline.advance(0, controls, () => {});
  measure(timeline, 500, 1000);
  const frontier = (t: NetworkTimeline) => {
    const s = t.snapshot();
    return {
      inputEpoch: s.inputEpoch,
      ack: s.ack,
      predictedSeq: s.predictedSeq,
      retainedInputs: s.retainedInputs,
      clockSeqAtAnchor: s.clockSeqAtAnchor,
      clockAnchorAtMs: s.clockAnchorAtMs,
      clockCalibrated: s.clockCalibrated,
    };
  };
  const before = frontier(timeline);
  timeline.resetRttSelection();
  assert.deepEqual(frontier(timeline), before);
  assert.equal(
    timeline.snapshot().rttMs,
    500,
    "reset cannot hide a pending high sample",
  );
  assert.equal(timeline.snapshot().supportedRttMeasuredAtMs, null);
  assert.equal(timeline.snapshot().pendingRttMs, null);
  measure(timeline, 500, 2000);
  assert.equal(timeline.deliveryBudgetExceeded, true);
  measure(timeline, 34, 3000);
  measure(timeline, 500, 4000);
  timeline.setRtt(34);
  assert.equal(timeline.snapshot().pendingRttMs, null);
  assert.equal(timeline.snapshot().rttMeasuredAtMs, null);
  measure(timeline, 500, 4001);
  assert.equal(
    timeline.deliveryBudgetExceeded,
    true,
    "legacy seed is not a fresh timestamped baseline",
  );
});

test("SDK adapter supplies the original monotonic sample time and inherits bounded expiry", () => {
  let now = 0;
  const client = new ScriptTimelineClient({ now: () => now, send() {} });
  client.setRtt(34);
  now = 1000;
  client.setRtt(500);
  assert.equal(client.snapshot().timeline.rttMeasuredAtMs, 1000);
  assert.equal(client.snapshot().timeline.rttMs, 34);
  now = 3500;
  client.step(controls(0));
  assert.equal(client.snapshot().timeline.rttMs, 500);
  client.dispose();
});
