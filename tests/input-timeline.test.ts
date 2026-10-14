import test from "node:test";
import assert from "node:assert/strict";
import {
  TimelineInputQueue,
  canonicalTimelineInput,
  MAX_FUTURE_INPUT_TICKS,
  TimelineSimulationClock,
} from "../shared/input-timeline";

const mode = { vehicle: false, yaw: 0.4 };
const command = (seq: number, inputEpoch = 4, vehicle = false) => ({
  seq,
  inputEpoch,
  vehicle,
  x: 1,
  z: 0,
  yaw: 0.4,
  jump: true,
  run: true,
});

test("clock drop discards expired controls before exactly eight current-UTC steps and rebases the epoch afterward", () => {
  const initialUTC = Date.parse("2026-10-13T21:00:00Z");
  const clock = new TimelineSimulationClock(initialUTC);
  const queue = new TimelineInputQueue(4, 0);
  const times: number[] = [],
    applied: boolean[] = [];
  const step = (_dt: number, tick: number, time: number) => {
    times.push(time);
    applied.push(queue.consume(tick, mode).input.jump);
  };
  clock.advance(2 / 60, step);
  for (let seq = 3; seq <= 10; seq++) queue.push(command(seq));
  let dropped = 0;
  const result = clock.advance(2, step, (plan) => {
    dropped = plan.dropped;
    if (plan.dropped) queue.discardPending();
  });
  assert.equal(result.steps, 8);
  assert.ok(dropped > 1.8);
  assert.equal(
    applied.filter(Boolean).length,
    0,
    "old queued jumps are not executed after the server stall",
  );
  assert.equal(times.length, 10);
  assert.equal(clock.time, times.at(-1));
  assert.ok(
    Math.abs(
      clock.time + clock.accumulator * 1000 - (initialUTC + 2033.3333333333),
    ) < 0.003,
  );
  assert.ok(
    times[2] - times[1] > 1800,
    "kept physics steps represent the current UTC window",
  );
  for (let i = 3; i < times.length; i++)
    assert.ok(Math.abs(times[i] - times[i - 1] - 1000 / 60) < 0.001);
  queue.reset(5, clock.tick);
  assert.equal(queue.ack, 0);
  assert.equal(queue.frontier().inputTickBase, clock.tick);
  assert.equal(queue.push({ ...command(1), inputEpoch: 4 }), "epoch");
  const before = clock.time;
  clock.advance(1 / 60, step);
  assert.equal(queue.ack, 1);
  assert.ok(Math.abs(clock.time - before - 1000 / 60) < 0.001);
});

test("UTC tick timestamps do not accumulate rounding drift on a long-lived room", () => {
  const initialUTC = Date.parse("2026-10-13T21:00:00Z");
  const clock = new TimelineSimulationClock(initialUTC);
  for (let frame = 0; frame < 3600; frame++) clock.advance(1 / 60, () => {});
  assert.equal(clock.tick, 3600);
  assert.equal(clock.time, initialUTC + 60_000);
});

test("resolved ack follows every world tick, including empty input slots", () => {
  const queue = new TimelineInputQueue(4, 100);
  assert.equal(queue.push(command(1)), "accepted");
  assert.equal(queue.consume(101, mode).source, "input");
  for (let tick = 102; tick <= 104; tick++) {
    const step = queue.consume(tick, mode);
    assert.equal(step.source, "missing");
    assert.equal(step.input.seq, tick - 100);
    assert.equal(step.input.jump, false);
    assert.equal(step.input.x, 0);
    assert.equal(queue.ack, tick - 100);
  }
  assert.equal(
    queue.frontier().receivedSeq,
    1,
    "receipt is not elapsed physics time",
  );
  assert.equal(
    queue.push(command(2)),
    "late",
    "missed time cannot be executed later",
  );
  assert.equal(queue.frontier().ack, 4);
  assert.throws(() => queue.consume(106, mode), /next world tick/);
  assert.throws(() => queue.consume(104, mode), /next world tick/);
  assert.equal(queue.ack, 4, "invalid caller cannot advance the frontier");
});

test("future holes and reordered bursts preserve deadlines, ordering and a hard bound", () => {
  const queue = new TimelineInputQueue(4, 0);
  for (let seq = MAX_FUTURE_INPUT_TICKS; seq >= 1; seq--)
    assert.equal(queue.push(command(seq)), "accepted");
  assert.equal(queue.push(command(17)), "ahead");
  assert.equal(queue.push(command(7)), "duplicate");
  assert.equal(queue.diagnostics().depth, 16);
  for (let tick = 1; tick <= 16; tick++) {
    const next = queue.consume(tick, mode);
    assert.equal(next.input.seq, tick);
    assert.equal(next.source, "input");
  }
  assert.equal(queue.diagnostics().depth, 0);
  assert.equal(queue.push(command(19)), "accepted");
  assert.equal(queue.consume(17, mode).source, "missing");
  assert.equal(queue.consume(18, mode).source, "missing");
  assert.equal(queue.consume(19, mode).source, "input");
});

test("new epoch rejects old in-flight input even with the same reused sequence", () => {
  const queue = new TimelineInputQueue(4, 100);
  queue.push(command(1));
  queue.consume(101, mode);
  queue.push(command(5));
  queue.reset(5, 101);
  assert.deepEqual(queue.frontier(), {
    inputEpoch: 5,
    inputTickBase: 101,
    tick: 101,
    ack: 0,
    receivedSeq: 0,
  });
  assert.equal(queue.push(command(1, 4)), "epoch");
  assert.equal(queue.push(command(1, 5)), "accepted");
  assert.equal(queue.consume(102, mode).input.inputEpoch, 5);
  assert.throws(() => queue.reset(5, 102), /newer epoch/);
  assert.throws(() => queue.reset(6, 101), /current world tick/);
});

test("mode mismatch consumes its time slot using neutral controls without repeating jump", () => {
  const queue = new TimelineInputQueue(4, 0);
  queue.push(command(1, 4, true));
  const filtered = queue.consume(1, mode);
  assert.equal(filtered.source, "mode-mismatch");
  assert.equal(filtered.input.vehicle, false);
  assert.equal(filtered.input.jump, false);
  assert.equal(filtered.input.run, false);
  assert.equal(filtered.input.x, 0);
  assert.equal(queue.ack, 1);
  assert.equal(queue.diagnostics().modeMismatchTicks, 1);
});

test("wire validation requires epoch and canonical numeric input, with copies isolated from callers", () => {
  for (const raw of [
    null,
    {},
    { ...command(1), inputEpoch: -1 },
    { ...command(1), inputEpoch: 1.1 },
    { ...command(1), seq: NaN },
    { ...command(1), x: Infinity },
  ])
    assert.equal(canonicalTimelineInput(raw), null);
  const queue = new TimelineInputQueue(4, 0);
  const input = command(1);
  queue.push(input);
  input.x = -99;
  assert.equal(queue.consume(1, mode).input.x, 1);
  assert.throws(
    () => new TimelineInputQueue(1, 0, { maxFutureTicks: 100 }),
    /future bound/,
  );
});
