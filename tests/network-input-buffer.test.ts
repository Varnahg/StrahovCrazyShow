import test from "node:test";
import assert from "node:assert/strict";
import {
  FrameInputBuffer,
  INPUT_PACKET_SIZE,
} from "../client/network-input-buffer";
import type { Input } from "../shared/types";

const command = (seq: number): Input => ({
  x: 0,
  z: 1,
  yaw: 0,
  seq,
  jump: seq === 2,
});

function fixture() {
  let now = 0,
    enabled = true,
    throws = false;
  const sent: { at: number; inputs: Input[] }[] = [];
  const overflows: ReturnType<FrameInputBuffer["snapshot"]>[] = [];
  const errors: unknown[] = [];
  const buffer = new FrameInputBuffer({
    now: () => now,
    canSend: () => enabled,
    send: (inputs) => {
      if (throws) throw new Error("closed transport");
      sent.push({ at: now, inputs });
    },
    onOverflow: (snapshot) => overflows.push(snapshot),
    onSendError: (error) => errors.push(error),
  });
  return {
    buffer,
    sent,
    overflows,
    errors,
    time: (value: number) => (now = value),
    enabled: (value: boolean) => (enabled = value),
    throws: (value: boolean) => (throws = value),
  };
}

test("frame tails deliver every 60Hz command with a completely starved timer", () => {
  for (const fps of [1, 5, 10, 15, 30, 60, 144]) {
    const f = fixture();
    let seq = 0;
    for (let frame = 1; frame <= fps * 3; frame++) {
      const at = (frame * 1000) / fps;
      f.time(at);
      const produced = Math.floor((at * 60) / 1000 + 1e-8);
      while (seq < produced) f.buffer.enqueue(command(++seq));
      f.buffer.flush("frame");
    }
    f.time(3100);
    f.buffer.flush("frame");
    assert.equal(seq, 180);
    assert.deepEqual(
      f.sent.flatMap((p) => p.inputs.map((i) => i.seq)),
      Array.from({ length: 180 }, (_, i) => i + 1),
      `${fps} FPS`,
    );
    assert.ok(f.sent.every((p) => p.inputs.length <= INPUT_PACKET_SIZE));
    assert.ok(f.buffer.snapshot().maxQueued <= 8, `${fps} FPS queue`);
    assert.equal(f.buffer.snapshot().overflows, 0);
    assert.equal(f.buffer.snapshot().lastTimerAgeMs, null);
    assert.equal(
      f.sent.flatMap((p) => p.inputs).filter((i) => i.jump).length,
      1,
    );
  }
});

test("ordinary frames and timer calls share a 30Hz send cadence without duplicate packets", () => {
  const f = fixture();
  let seq = 0;
  for (let ms = 0; ms < 3000; ms++) {
    f.time(ms);
    const produced = Math.floor((ms * 60) / 1000);
    while (seq < produced) f.buffer.enqueue(command(++seq));
    f.buffer.flush("frame");
    f.buffer.flush("timer");
  }
  for (let i = 1; i < f.sent.length; i++)
    assert.ok(f.sent[i].at - f.sent[i - 1].at >= 1000 / 30);
  assert.ok(f.sent.length <= 90);
  const all = f.sent.flatMap((p) => p.inputs.map((i) => i.seq));
  assert.equal(new Set(all).size, all.length);
});

test("pressure uses at most eight inputs per packet and a bounded rolling rate across resets", () => {
  const f = fixture();
  let seq = 0;
  for (let ms = 0; ms < 2500; ms++) {
    f.time(ms);
    // Adversarial recovery/producer load cannot bypass the transport budget.
    f.buffer.reset("test-rebase");
    for (let i = 0; i < 8; i++) f.buffer.enqueue(command(++seq));
    f.buffer.flush("frame");
  }
  assert.ok(f.sent.every((p) => p.inputs.length === 8));
  for (const packet of f.sent)
    assert.ok(
      f.sent.filter((p) => p.at > packet.at - 1000 && p.at <= packet.at)
        .length <= 60,
    );
});

test("timestamps expose timer starvation, unacknowledged age and bounded retention", () => {
  const f = fixture();
  f.buffer.flush("timer");
  for (let seq = 1; seq <= 220; seq++) {
    f.time((seq * 1000) / 60);
    f.buffer.enqueue(command(seq));
    f.buffer.flush("frame");
  }
  f.time(3800);
  f.buffer.flush("frame");
  const before = f.buffer.snapshot();
  assert.equal(before.inFlight, 180);
  assert.equal(before.evictedUnacked, 40);
  assert.ok(before.oldestUnackedAgeMs! > 3000);
  assert.equal(before.lastTimerAgeMs, 3800);
  f.buffer.flush("timer");
  assert.equal(f.buffer.snapshot().lastTimerIntervalMs, 3800);
  f.buffer.acknowledge(219);
  assert.equal(f.buffer.snapshot().inFlight, 1);
  f.buffer.acknowledge(2); // Delayed authority cannot lower telemetry frontier.
  assert.equal(f.buffer.snapshot().lastAck, 219);
  f.buffer.acknowledge(220);
  assert.equal(f.buffer.snapshot().oldestUnackedAgeMs, null);
});

test("recovery, unavailable room and disposal cannot leak old input into a new stream", () => {
  const f = fixture();
  f.enabled(false);
  assert.equal(f.buffer.enqueue(command(1)), false);
  f.buffer.flush();
  assert.equal(f.sent.length, 0, "guest/disconnected sender sends nothing");
  f.enabled(true);
  const input = command(4);
  f.buffer.enqueue(input);
  input.x = 100; // The caller cannot mutate a queued command.
  assert.equal(f.buffer.enqueue(command(4)), false);
  f.buffer.reset("forced-authority");
  const fresh = command(1);
  f.buffer.enqueue(fresh);
  fresh.x = 100;
  f.buffer.flush();
  assert.deepEqual(f.sent[0].inputs, [command(1)]);
  assert.equal(f.buffer.snapshot().discardedInputs, 1);
  f.buffer.dispose();
  assert.equal(f.buffer.enqueue(command(2)), false);
  f.time(1000);
  assert.equal(f.buffer.flush("timer"), 0);
  assert.equal(f.sent.length, 1);
  assert.equal(f.buffer.snapshot().inFlight, 0);
});

test("transport failure retains ordering and abnormal overload has an explicit bounded recovery", () => {
  const f = fixture();
  f.throws(true);
  for (let seq = 1; seq <= 65; seq++) f.buffer.enqueue(command(seq));
  assert.equal(f.overflows.length, 1);
  assert.equal(f.overflows[0].queued, 65);
  assert.equal(f.buffer.snapshot().queued, 0);
  assert.equal(f.buffer.snapshot().discardedInputs, 65);
  assert.ok(f.errors.length > 0);
  f.throws(false);
  f.buffer.enqueue(command(1));
  f.buffer.enqueue(command(2));
  f.buffer.flush();
  assert.deepEqual(f.sent[0].inputs, [command(1), command(2)]);
});

test("new epoch priority skips cadence once, but cannot bypass the rolling packet budget", () => {
  const f = fixture();
  f.buffer.enqueue(command(1));
  f.buffer.flush();
  f.time(1);
  f.buffer.reset("epoch", { priority: true });
  f.buffer.enqueue(command(1));
  assert.equal(f.buffer.flush(), 1);
  assert.equal(f.buffer.snapshot().priorityPending, false);
  f.buffer.enqueue(command(2));
  assert.equal(
    f.buffer.flush(),
    0,
    "priority applies only to the first successful packet",
  );
  for (let i = 2; i < 60; i++) {
    f.time(i);
    f.buffer.reset("epoch", { priority: true });
    f.buffer.enqueue(command(1));
    assert.equal(f.buffer.flush(), 1);
  }
  f.time(60);
  f.buffer.reset("epoch", { priority: true });
  f.buffer.enqueue(command(1));
  assert.equal(
    f.buffer.flush(),
    0,
    "the 61st packet must wait even in a new epoch",
  );
  assert.equal(f.buffer.snapshot().priorityPending, true);
  f.time(1000);
  assert.equal(f.buffer.flush(), 1);
});

test("resolved authority expires queued commands before they can consume transport budget", () => {
  const f = fixture();
  f.buffer.enqueue(command(1));
  f.buffer.flush();
  f.time(1);
  f.buffer.enqueue(command(2));
  f.buffer.enqueue(command(3));
  f.buffer.acknowledge(2);
  assert.equal(f.buffer.snapshot().queued, 1);
  assert.equal(f.buffer.snapshot().queuedFirstSeq, 3);
  assert.equal(f.buffer.snapshot().expiredQueuedInputs, 1);
  assert.equal(f.buffer.snapshot().inFlight, 0);
  assert.equal(f.buffer.enqueue(command(2)), false);
  f.time(40);
  f.buffer.flush();
  assert.deepEqual(
    f.sent.flatMap((p) => p.inputs.map((i) => i.seq)),
    [1, 3],
  );
});
