import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  InputQueue,
  FixedStepClock,
  PROTOCOL_VERSION,
} from "../shared/netcode";
import {
  NetworkClockTiming,
  networkProbeNonce,
  networkProbeReply,
} from "../shared/network-diagnostics";
import { consumeRate } from "../server/session-lifecycle";

const command = (seq: number) => ({ x: 1, z: 0, yaw: 0, seq, jump: seq === 2 });

test("own queue diagnostics distinguish idle physics time from input acknowledgement without mutating inputs", () => {
  const queue = new InputQueue();
  assert.equal(queue.diagnostics(0).lastInputAgeMs, null);
  queue.push(command(1), 10);
  queue.push(command(2), 20);
  const before = JSON.stringify(queue.pending);
  const sample = queue.diagnostics(40);
  assert.equal(sample.depth, 2);
  assert.equal(sample.oldestQueuedAgeMs, 30);
  assert.equal(sample.lastInputAgeMs, 20);
  assert.equal(JSON.stringify(queue.pending), before);
  assert.deepEqual(queue.consume(40, 100), command(1));
  assert.deepEqual(queue.consume(60, 101), command(2));
  assert.equal(queue.consume(80, 102).seq, 2);
  assert.equal(queue.consume(100, 103).seq, 2);
  const idle = queue.diagnostics(100);
  assert.equal(idle.ack, 2);
  assert.equal(idle.receivedSeq, 2);
  assert.equal(idle.lastAppliedTick, 101);
  assert.equal(idle.idleTicksSinceAck, 2);
  assert.equal(idle.oldestQueuedAgeMs, null);
  assert.equal(idle.consumed, 2);
});

test("rejections and resets are distinguishable and measurement never changes queue recovery", () => {
  const queue = new InputQueue();
  for (let seq = 1; seq <= 64; seq++) assert.ok(queue.push(command(seq), seq));
  assert.equal(queue.push(command(64), 65), false);
  assert.equal(queue.push(command(66), 65), false);
  assert.equal(queue.push(command(65), 65), false);
  assert.equal(queue.recoverBacklog(100), true);
  const sample = queue.diagnostics(100);
  assert.equal(sample.rejectedDuplicate, 1);
  assert.equal(sample.rejectedGap, 1);
  assert.equal(sample.rejectedCapacity, 1);
  assert.equal(sample.maxDepth, 64);
  assert.equal(sample.discarded, 64);
  assert.equal(sample.resets, 1);
  assert.equal(sample.ack, 64);
  assert.equal(sample.oldestQueuedAgeMs, null);
  assert.equal(queue.push(command(65), 101), true);
  assert.deepEqual(queue.consume(102, 200), command(65));
  assert.equal(queue.diagnostics(NaN).lastInputAgeMs, null);
});

test("constant-storage clock counters retain a server drop and reject invalid observations", () => {
  const clock = new FixedStepClock(),
    timing = new NetworkClockTiming();
  for (const elapsed of [1 / 60, 2]) {
    const result = clock.advance(elapsed, () => {});
    assert.ok(
      timing.record({
        elapsedMs: elapsed * 1000,
        cpuMs: 2,
        steps: result.steps,
        droppedMs: result.dropped * 1000,
        accumulatorMs: Math.max(0, clock.accumulator * 1000),
      }),
    );
  }
  const sample = timing.snapshot();
  assert.equal(sample.callbacks, 2);
  assert.equal(sample.steps, 8);
  assert.equal(sample.elapsedMaxMs, 2000);
  assert.ok(sample.droppedTotalMs > 1800);
  assert.equal(sample.cpuMeanMs, 2);
  assert.equal(
    timing.record({
      elapsedMs: NaN,
      cpuMs: 0,
      steps: 0,
      droppedMs: 0,
      accumulatorMs: 0,
    }),
    false,
  );
  assert.deepEqual(timing.snapshot(), sample);
  sample.cpuMs = 99;
  assert.equal(
    timing.snapshot().cpuMs,
    2,
    "callers cannot mutate retained counters",
  );
});

test("probe echoes only a bounded nonce and finite server clock, with a one-per-second rate policy", () => {
  for (const raw of [
    null,
    [],
    1,
    {},
    { nonce: -1 },
    { nonce: NaN },
    { nonce: 1.1 },
    { nonce: Infinity },
    { nonce: "1" },
  ])
    assert.equal(networkProbeNonce(raw), null);
  assert.equal(
    networkProbeNonce({ nonce: 0, token: "not echoed", players: ["private"] }),
    0,
  );
  assert.deepEqual(networkProbeReply(0, 40, 123), {
    nonce: 0,
    serverTick: 40,
    serverTimeMs: 123,
  });
  assert.equal(networkProbeReply(0, NaN, 123), null);
  assert.equal(networkProbeReply(0, 40, Infinity), null);
  const rates = new Map<string, number[]>();
  assert.equal(consumeRate(rates, "own:network-probe", 1, 1000, 0), true);
  assert.equal(consumeRate(rates, "own:network-probe", 1, 1000, 999), false);
  assert.equal(consumeRate(rates, "own:network-probe", 1, 1000, 1000), true);
});

test("V14 probe wiring is an authenticated own-room reply, never an HTTP/presence broadcast", () => {
  assert.equal(
    PROTOCOL_VERSION,
    14,
    "Authoritative CAD doors require V14 while retaining epoch-aware scheduled inputs",
  );
  const server = readFileSync(
    new URL("../server/index.ts", import.meta.url),
    "utf8",
  );
  const start = server.indexOf('this.onMessage("networkProbe"');
  const end = server.indexOf('this.onMessage("motionResync"', start);
  assert.ok(start >= 0 && end > start);
  const handler = server.slice(start, end);
  assert.match(handler, /this\.connections\.get\(c\.auth\.id\) !== c/);
  assert.match(handler, /!this\.inputQueues\.has\(c\.auth\.id\)/);
  assert.match(handler, /store\.rate\(c\.auth\.id, "network-probe", 1, 1000\)/);
  assert.match(handler, /c\.send\("networkProbe", reply\)/);
  assert.doesNotMatch(handler, /broadcast|players|token/);
  const http = server.slice(server.indexOf("createServer("));
  assert.doesNotMatch(http, /networkProbe|captureNetworkDiagnostics/);
});
