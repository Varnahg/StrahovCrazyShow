import test from "node:test";
import assert from "node:assert/strict";
import {
  ScriptTimelineClient,
  type ScriptAuthority,
} from "../scripts/timeline-client";
import {
  TimelineInputQueue,
  type TimelineInput,
} from "../shared/input-timeline";

const controls = { x: 1, z: 0, yaw: 0, jump: false, vehicle: false };
const authority = (
  ack: number,
  inputEpoch = 1,
  base = 100,
): ScriptAuthority => ({
  inputEpoch,
  inputTickBase: base,
  tick: base + ack,
  ack,
  receivedSeq: ack,
  time: 100000 + ((base + ack) * 1000) / 60,
  state: {
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    speed: 0,
    vertical: 0,
    grounded: true,
    vehicle: false,
  },
});

test("SDK producers use the current epoch, reject old authority and stop after disposal", () => {
  let now = 0;
  const sent: TimelineInput[][] = [];
  const client = new ScriptTimelineClient({
    now: () => now,
    send: (inputs) => sent.push(inputs),
  });
  assert.equal(client.step(controls).status, "waiting");
  assert.ok(client.acceptAuthority(authority(0)));
  client.step(controls);
  assert.deepEqual(
    sent.flat().map((input) => input.seq),
    [1, 2, 3, 4, 5, 6],
  );
  now = 1;
  assert.ok(client.acceptAuthority(authority(0, 2)));
  client.step(controls);
  assert.equal(
    sent.length,
    2,
    "new epoch is flushed without old cadence delay",
  );
  assert.ok(sent[1].every((input) => input.inputEpoch === 2));
  assert.equal(client.acceptAuthority(authority(1)), false);
  assert.equal(client.frontier.inputEpoch, 2);
  client.dispose();
  assert.throws(() => client.step(controls), /disposed/);
  assert.equal(client.snapshot().sender.queued, 0);
  assert.equal(client.acceptAuthority(authority(2, 2)), false);
});

test("SDK catch-up never sends neutral missing time or consumes the pending jump there", () => {
  const sent: TimelineInput[] = [];
  const client = new ScriptTimelineClient({
    now: () => 0,
    send: (inputs) => sent.push(...inputs),
  });
  client.setRtt(200);
  client.acceptAuthority(authority(0));
  let jump = true;
  client.step(() => {
    const input = { ...controls, jump };
    jump = false;
    return input;
  });
  assert.ok(sent.length > 0);
  assert.equal(sent[0].seq, 14);
  assert.equal(sent[0].jump, true);
  assert.equal(sent.filter((input) => input.jump).length, 1);
  assert.ok(sent.every((input) => input.x === 1));
  client.dispose();
});

test("held maneuvers keep producing controls until the observed condition, then settle by time", async () => {
  let now = 0;
  const sent: TimelineInput[] = [];
  const client = new ScriptTimelineClient({
    now: () => now,
    send: (inputs) => sent.push(...inputs),
    sleep: async (ms) => {
      now += ms;
      client.acceptAuthority(authority(Math.floor((now * 60) / 1000)));
    },
  });
  client.acceptAuthority(authority(0));
  await client.holdUntil(controls, () => now >= 1100, "physical steering");
  assert.ok(
    sent.length >= 60,
    "input stays held for the full observed maneuver",
  );
  assert.ok(sent.every((input) => input.x === 1));
  const frontier = client.frontier;
  await client.settle(frontier);
  assert.ok(client.authority!.ack >= frontier.seq);
  const count = sent.length;
  now += 1000;
  client.acceptAuthority(authority(Math.floor((now * 60) / 1000)));
  await client.settle(frontier);
  assert.equal(sent.length, count, "settling creates no new movement");
  client.dispose();
});

test("settlement fails across recovery epochs rather than acknowledging unrelated time", async () => {
  const client = new ScriptTimelineClient({ now: () => 0, send: () => {} });
  client.acceptAuthority(authority(0));
  client.step(controls);
  const old = client.frontier;
  client.acceptAuthority(authority(0, 2));
  await assert.rejects(() => client.settle(old), /epoch changed/);
  client.dispose();
});

test("settling flushes a cadence-delayed tail without manufacturing replacement input", async () => {
  let now = 0;
  const sent: TimelineInput[] = [];
  const client = new ScriptTimelineClient({
    now: () => now,
    send: (batch) => sent.push(...batch),
    sleep: async (ms) => {
      now += ms;
      client.acceptAuthority(authority(Math.floor((now * 60) / 1000)));
    },
  });
  client.acceptAuthority(authority(0));
  client.step(controls);
  now = 17;
  client.step(controls);
  assert.equal(client.snapshot().sender.queued, 1);
  const frontier = client.frontier;
  await client.settle(frontier);
  assert.equal(client.snapshot().sender.queued, 0);
  assert.equal(sent.length, 7);
  assert.ok(client.authority!.ack >= frontier.seq);
  assert.equal(client.frontier.seq, frontier.seq);
  client.dispose();
});

test("a paused SDK resumes from the latest resolved tick without sending elapsed history", () => {
  let now = 0;
  const sent: TimelineInput[] = [];
  const client = new ScriptTimelineClient({
    now: () => now,
    send: (batch) => sent.push(...batch),
  });
  client.acceptAuthority(authority(0));
  client.step(controls);
  now = 2000;
  assert.equal(client.step(controls).status, "waiting");
  assert.equal(sent.length, 6);
  client.acceptAuthority(authority(120));
  client.step(controls);
  assert.deepEqual(
    sent.slice(6).map((input) => input.seq),
    [121, 122, 123, 124, 125, 126],
  );
  client.dispose();
});

test("initially safe speed cannot finish braking before newly scheduled brake input resolves", async () => {
  let now = 0,
    worldTick = 100,
    speed = 0.6;
  const queue = new TimelineInputQueue(1, worldTick);
  const sent: TimelineInput[] = [],
    applied: TimelineInput[] = [];
  const serverAuthority = (): ScriptAuthority => ({
    ...authority(queue.ack),
    ...queue.frontier(),
    state: { ...authority(queue.ack).state, speed, vehicle: true },
  });
  const client = new ScriptTimelineClient({
    now: () => now,
    send: (batch) => {
      for (const input of batch) assert.equal(queue.push(input), "accepted");
      sent.push(...batch);
    },
    sleep: async (ms) => {
      now += ms;
      const targetTick = 100 + Math.floor((now * 60) / 1000);
      while (worldTick < targetTick) {
        const { input } = queue.consume(++worldTick, { vehicle: true, yaw: 0 });
        applied.push(input);
        // The transport regression needs only a controllable scalar response;
        // real Rapier/car handling remains covered by the SDK maneuver gate.
        if (input.jump) speed = Math.max(0, speed - 0.35);
        else if (input.z > 0) speed += 0.13;
      }
      client.acceptAuthority(serverAuthority());
    },
  });
  client.acceptAuthority(serverAuthority());
  client.step({ x: 0, z: 1, yaw: 0, jump: false, vehicle: true });
  assert.equal(
    sent.length,
    6,
    "earlier throttle already occupies future slots",
  );
  const oldFrontier = client.frontier;
  assert.ok(speed <= 1, "the stale stopping predicate starts true");
  await client.holdUntil(
    { x: 0, z: 0, yaw: 0, jump: true, vehicle: true },
    () => Math.abs(client.authority!.state.speed) <= 1,
    "final handbrake",
  );
  const firstBrake = sent.find((input) => input.jump);
  assert.ok(firstBrake, "new braking controls must actually be produced");
  assert.ok(firstBrake.seq > oldFrontier.seq);
  assert.equal(client.authority!.inputEpoch, firstBrake.inputEpoch);
  assert.ok(
    client.authority!.ack >= firstBrake.seq,
    "predicate belongs to resolved brake time",
  );
  assert.ok(
    applied.filter((input) => input.jump).length >= 2,
    "queued throttle first raises speed, then held brakes reduce it below the unchanged limit",
  );
  await client.settle();
  assert.ok(
    speed <= 1,
    "settling cannot replay leftover throttle after the accepted brake condition",
  );
  client.dispose();
});

test("held condition cannot pass using a larger ack from a different epoch", async () => {
  let now = 0;
  const client = new ScriptTimelineClient({
    now: () => now,
    send: () => {},
    sleep: async (ms) => {
      now += ms;
      client.acceptAuthority(authority(30, 2));
    },
  });
  client.acceptAuthority(authority(0));
  await assert.rejects(
    () => client.holdUntil(controls, () => true, "held epoch barrier"),
    /epoch changed/,
  );
  client.dispose();
});
