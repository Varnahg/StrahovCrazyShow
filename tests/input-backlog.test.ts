import test from "node:test";
import assert from "node:assert/strict";
import {
  FIXED_DT,
  INPUT_BACKLOG_MAX_COMMANDS,
  INPUT_BACKLOG_RECOVERY_INTERVAL_MS,
  InputQueue,
  canonicalInput,
} from "../shared/netcode";
import type { Input } from "../shared/types";
import { initPhysics, Simulation } from "../shared/simulation";
import { TimelineInputQueue } from "../shared/input-timeline";

const command = (seq: number, vehicle = false): Input => ({
  seq,
  x: 1,
  z: 0,
  yaw: 0,
  jump: true,
  vehicle,
});

test("V11 late bursts expire at their original deadlines instead of creating a permanent FIFO delay", () => {
  const queue = new TimelineInputQueue(1, 0),
    mode = { vehicle: false, yaw: 0 };
  for (let tick = 1; tick <= 14; tick++) queue.consume(tick, mode);
  for (let seq = 1; seq <= 16; seq++)
    assert.equal(
      queue.push({ ...command(seq), inputEpoch: 1 }),
      seq <= 14 ? "late" : "accepted",
    );
  assert.equal(queue.diagnostics().depth, 2);
  for (let tick = 15; tick <= 120; tick++) {
    if (tick > 16)
      assert.equal(queue.push({ ...command(tick), inputEpoch: 1 }), "accepted");
    assert.equal(queue.consume(tick, mode).input.seq, tick);
    assert.equal(queue.ack, tick);
  }
  assert.equal(queue.diagnostics().depth, 0);
  assert.equal(
    queue.diagnostics().resets,
    0,
    "normal missing/late packets do not trigger resync feedback",
  );
});

test("a delayed FIFO burst stays queued at equal production/consumption rates until explicit recovery", () => {
  for (const recover of [false, true]) {
    const delayed = new InputQueue(),
      peer = new InputQueue();
    let seq = 0,
      resets = 0,
      applied = 0;
    for (let i = 0; i < 14; i++)
      assert.equal(delayed.push(command(++seq), 0), true);
    const samples: number[] = [];
    for (let tick = 1; tick <= 600; tick++) {
      const now = tick * FIXED_DT * 1000;
      assert.equal(delayed.push(command(++seq), now), true);
      assert.equal(peer.push(command(tick), now), true);
      if (recover && delayed.recoverBacklog(now)) resets++;
      assert.equal(peer.recoverBacklog(now), false);
      applied += delayed.consume(now).x;
      assert.equal(peer.consume(now).seq, tick);
      if ([1, 60, 600].includes(tick)) samples.push(delayed.pending.length);
    }
    assert.deepEqual(samples, recover ? [0, 0, 0] : [14, 14, 14]);
    assert.equal(resets, recover ? 1 : 0);
    assert.equal(
      applied,
      recover ? 599 : 600,
      "recovery cannot speed up movement",
    );
    assert.equal(delayed.ack, recover ? seq : seq - 14);
    assert.equal(peer.ack, 600);
  }
});

test("recovery acknowledges the received frontier and retains strict next-command ordering", () => {
  for (const vehicle of [false, true]) {
    const queue = new InputQueue();
    for (let seq = 1; seq <= 16; seq++)
      assert.ok(queue.push(command(seq, vehicle), 100));
    assert.equal(queue.recoverBacklog(100), true);
    assert.equal(queue.ack, 16);
    assert.equal(queue.lastReceived, 16);
    assert.equal(queue.pending.length, 0);
    const idle = queue.consume(101);
    assert.equal(idle.x, 0);
    assert.equal(idle.z, 0);
    assert.equal(idle.jump, false);
    assert.equal(queue.push(command(16, vehicle), 101), false);
    assert.equal(queue.push(command(18, vehicle), 101), false);
    assert.equal(queue.push(command(17, vehicle), 101), true);
    assert.deepEqual(queue.consume(102), command(17, vehicle));
  }
});

test("discarding a backlog leaves actual walking and vehicle physics byte-identical", async () => {
  await initPhysics();
  const sim = new Simulation(),
    actor = sim.add("backlog-physics");
  try {
    for (const driving of [false, true]) {
      if (driving) actor.setVehicle(true);
      const queue = new InputQueue();
      for (let seq = 1; seq <= 16; seq++) queue.push(command(seq, driving), 0);
      const before = sim.world.takeSnapshot(),
        state = actor.capture();
      assert.equal(queue.recoverBacklog(1), true);
      assert.deepEqual(actor.capture(), state);
      assert.deepEqual(
        sim.world.takeSnapshot(),
        before,
        "no world step or pose mutation",
      );
    }
  } finally {
    sim.dispose();
  }
});

test("normal batches, invalid inputs and repeated bursts cannot cause unbounded recovery", () => {
  const queue = new InputQueue();
  for (let seq = 1; seq <= INPUT_BACKLOG_MAX_COMMANDS; seq++)
    queue.push(command(seq), 0);
  assert.equal(queue.recoverBacklog(0), false);
  queue.push(command(INPUT_BACKLOG_MAX_COMMANDS + 1), 0);
  assert.equal(queue.recoverBacklog(NaN), false);
  assert.equal(queue.recoverBacklog(0), true);
  for (let seq = 10; seq <= 25; seq++) assert.ok(queue.push(command(seq), 1));
  for (let now = 1; now < INPUT_BACKLOG_RECOVERY_INTERVAL_MS; now++)
    assert.equal(queue.recoverBacklog(now), false);
  assert.equal(queue.recoverBacklog(INPUT_BACKLOG_RECOVERY_INTERVAL_MS), true);
  assert.equal(queue.ack, 25);
  assert.equal(canonicalInput({ ...command(26), x: NaN }), null);
  assert.equal(canonicalInput({ ...command(26), seq: 26.5 }), null);
  assert.equal(queue.lastReceived, 25);
  for (let seq = 26; seq <= 89; seq++)
    assert.ok(queue.push(command(seq), 1001));
  assert.equal(
    queue.push(command(90), 1001),
    false,
    "hard capacity remains bounded",
  );
  queue.reset(); // Explicit/global resync still uses the same accepted frontier.
  assert.equal(queue.ack, 89);
  assert.equal(queue.push(command(90), 1002), true);
});
