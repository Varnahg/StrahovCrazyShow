import test from "node:test";
import assert from "node:assert/strict";
import {
  NetworkProbe,
  PROBE_COOLDOWN_MS,
  type ProbeLongTask,
} from "../client/network-probe";
import { NetworkTimeline } from "../client/network-timeline";
import { consumeRate } from "../server/session-lifecycle";

function fixture() {
  let now = 0,
    callback: ((tasks: readonly ProbeLongTask[]) => void) | undefined,
    disconnects = 0;
  let records: ProbeLongTask[] = [];
  const sent: { nonce: number; at: number }[] = [];
  const probe = new NetworkProbe({
    now: () => now,
    send: ({ nonce }) => sent.push({ nonce, at: now }),
    longTasks: (record) => {
      callback = record;
      return {
        takeRecords: () => {
          const result = records;
          records = [];
          return result;
        },
        disconnect: () => {
          disconnects++;
        },
      };
    },
  });
  return {
    probe,
    sent,
    time: (value: number) => (now = value),
    queued: (value: ProbeLongTask[]) => (records = value),
    callback: () => callback!,
    disconnects: () => disconnects,
    reply: () =>
      probe.receive({
        nonce: sent.at(-1)!.nonce,
        serverTick: 1,
        serverTimeMs: 1000,
      }),
  };
}
const enabled = { enabled: true, ready: true };

test("reply-based cooldown survives the actual 995ms timer phase without server rate rejection", () => {
  const f = fixture(),
    rates = new Map<string, number[]>();
  f.probe.poll(enabled);
  assert.ok(consumeRate(rates, "probe", 1, 1000, 0));
  f.time(50);
  f.reply();
  f.time(995);
  assert.equal(f.probe.poll(enabled), null);
  f.time(1050);
  assert.equal(
    f.probe.poll(enabled),
    null,
    "cooldown starts at reply, not send",
  );
  f.time(50 + PROBE_COOLDOWN_MS);
  assert.equal(f.probe.poll(enabled)?.kind, "sent");
  assert.ok(consumeRate(rates, "probe", 1, 1000, f.sent.at(-1)!.at));
  assert.equal(f.sent.length, 2);
});

test("one pending request, bounded timeout retry and late nonce cannot poison the next sample", () => {
  const f = fixture();
  f.probe.poll(enabled);
  f.time(9999);
  assert.equal(f.probe.poll(enabled), null);
  f.time(10000);
  assert.equal(f.probe.poll(enabled)?.kind, "timeout");
  assert.equal(f.reply(), null);
  f.time(10001);
  assert.equal(f.probe.poll(enabled), null);
  f.time(11050);
  assert.equal(f.probe.poll(enabled)?.kind, "sent");
  assert.equal(
    f.probe.receive({ nonce: 1, serverTick: 0, serverTimeMs: 0 }),
    null,
  );
  f.time(11070);
  assert.equal(f.reply()?.rawRoundTripMs, 20);
});

test("takeRecords detects a 1s main-thread stall before observer callback and preserves raw RTT", () => {
  const f = fixture(),
    timeline = new NetworkTimeline();
  f.probe.poll(enabled);
  f.time(20);
  const good = f.reply()!;
  timeline.setRtt(good.predictionRoundTripMs!);
  f.time(1070);
  f.probe.poll(enabled);
  f.queued([{ startTime: 1075, duration: 980 }]); // Observer callback has not run yet.
  f.time(2070);
  const blocked = f.reply()!;
  assert.equal(blocked.rawRoundTripMs, 1000);
  assert.equal(blocked.blockedOverlapMs, 980);
  assert.equal(blocked.contaminated, true);
  assert.equal(blocked.acceptedForPrediction, false);
  assert.equal(blocked.predictionRoundTripMs, 20);
  assert.equal(timeline.snapshot().rttMs, 20);
  assert.equal(timeline.deliveryBudgetExceeded, false);
});

test("clean high latency is explicit and is never clamped into the prediction budget", () => {
  const f = fixture(),
    timeline = new NetworkTimeline();
  f.probe.poll(enabled);
  f.time(3000);
  const slow = f.reply()!;
  assert.equal(slow.acceptedForPrediction, true);
  assert.equal(slow.predictionRoundTripMs, 3000);
  assert.equal(timeline.setRtt(slow.predictionRoundTripMs!), true);
  assert.equal(timeline.snapshot().rttMs, 3000);
  assert.equal(timeline.deliveryBudgetExceeded, true);
});

test("guest, pre-ready and room lifecycle do not leak requests, RTT or old observer callbacks", () => {
  const f = fixture();
  f.probe.poll({ enabled: false, ready: true });
  assert.equal(f.sent.length, 0);
  f.probe.poll({ enabled: true, ready: false });
  assert.equal(f.sent.length, 0);
  const old = f.callback();
  f.probe.poll(enabled);
  const oldNonce = f.sent[0].nonce;
  f.probe.poll({ enabled: false, ready: false });
  assert.equal(f.disconnects(), 1);
  assert.equal(f.probe.snapshot().pendingNonce, null);
  assert.equal(f.probe.snapshot().predictionRoundTripMs, null);
  f.time(100);
  f.probe.poll(enabled);
  old([{ startTime: 100, duration: 1000 }]);
  assert.equal(
    f.probe.receive({ nonce: oldNonce, serverTick: 1, serverTimeMs: 1 }),
    null,
  );
  f.time(120);
  assert.equal(f.reply()?.contaminated, false);
  f.probe.dispose();
  f.time(2000);
  assert.equal(f.probe.poll(enabled), null);
  assert.equal(f.reply(), null);
});

test("longtask evidence has bounded memory and overlapping intervals are not double-counted", () => {
  const f = fixture();
  f.probe.poll(enabled);
  f.queued([
    { startTime: 0, duration: 100 },
    { startTime: 50, duration: 100 },
  ]);
  f.time(200);
  assert.equal(f.reply()?.blockedOverlapMs, 150);
  f.time(2000);
  f.probe.poll(enabled);
  f.callback()(
    Array.from({ length: 300 }, (_, i) => ({
      startTime: 2000 + i,
      duration: 50,
    })),
  );
  assert.equal(f.probe.snapshot().retainedLongTasks, 256);
  f.time(2400);
  const sample = f.reply()!;
  assert.equal(sample.longTaskCoverage, "overflow");
  assert.equal(sample.acceptedForPrediction, false);
});
