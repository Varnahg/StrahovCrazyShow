import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalInput,
  FIXED_DT,
  FixedStepClock,
  InputQueue,
  SnapshotBuffer,
} from "../shared/netcode";
import { sanitizeInput } from "../shared/profile";
import { initPhysics, Simulation } from "../shared/simulation";
import { movementFromKeys } from "../shared/controls";
import { groundHeight } from "../shared/terrain";
await initPhysics();
test("diagonal movement has the same direction before and after transport at every camera angle", () => {
  for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
    const input = canonicalInput({
      ...movementFromKeys(1, 1, angle),
      yaw: angle,
      seq: 1,
      jump: false,
    })!;
    assert.deepEqual(sanitizeInput(JSON.parse(JSON.stringify(input))), input);
  }
});
test("fixed simulation time does not depend on irregular callback count", () => {
  for (const hz of [20, 30, 60, 120]) {
    const clock = new FixedStepClock();
    for (let i = 0; i < hz * 2; i++) clock.advance(1 / hz, () => {});
    assert.equal(clock.tick, 120);
    assert.equal(clock.droppedSeconds, 0);
  }
  const clock = new FixedStepClock();
  const result = clock.advance(2, () => {});
  assert.equal(result.steps, 8);
  assert.ok(result.dropped > 1.8);
});
test("input queue does not lose batched commands, repeat jumps, reset acknowledgments or speed up simulation", () => {
  const queue = new InputQueue();
  for (let seq = 1; seq <= 8; seq++)
    assert.equal(
      queue.push({ x: 1, z: 0, yaw: 0, seq, jump: seq === 2 }, 0),
      true,
    );
  assert.equal(
    queue.push({ x: 1, z: 0, yaw: 0, seq: 8, jump: false }, 0),
    false,
  );
  assert.equal(
    queue.push({ x: 1, z: 0, yaw: 0, seq: 10, jump: false }, 0),
    false,
  );
  for (let seq = 1; seq <= 8; seq++) {
    assert.equal(queue.consume(20).seq, seq);
    assert.equal(queue.ack, seq);
  }
  assert.equal(queue.consume(30).jump, false);
  assert.equal(queue.consume(500).seq, 8);
  assert.equal(queue.consume(500).x, 0);
});
test("restore and replay reproduce the local movement and jumping state", () => {
  const client = new Simulation(),
    server = new Simulation(),
    a = client.add("a", { x: 180, y: groundHeight(180, 20) + 1, z: 20 }),
    b = server.add("b", { x: 180, y: groundHeight(180, 20) + 1, z: 20 });
  const inputs = Array.from({ length: 90 }, (_, i) =>
    canonicalInput({
      x: 1,
      z: 0.4,
      yaw: 0.3,
      seq: i + 1,
      jump: i === 35,
      run: i > 60,
    })!,
  );
  for (const input of inputs) {
    a.step(input);
    client.tick(0);
  }
  for (const input of inputs.slice(0, 40)) {
    b.step(input);
    server.tick(0);
  }
  a.restore(b.capture());
  for (const input of inputs.slice(40)) {
    a.step(input);
    client.tick(0);
  }
  for (const input of inputs.slice(40)) {
    b.step(input);
    server.tick(0);
  }
  assert.ok(
    Math.hypot(
      a.position.x - b.position.x,
      a.position.y - b.position.y,
      a.position.z - b.position.z,
    ) < 0.005,
  );
  assert.ok(Math.abs(a.vertical - b.vertical) < 0.005);
  client.dispose();
  server.dispose();
});
test("remote snapshots interpolate time and take the short rotational path", () => {
  const buffer = new SnapshotBuffer();
  buffer.push(
    { time: 1000, tick: 1, rows: [["a", 0, 1, 0, 3.13, 2, 1, 0, "outside"]] },
    1000,
  );
  buffer.push(
    { time: 1200, tick: 2, rows: [["a", 10, 1, 0, -3.13, 2, 2, 0, "outside"]] },
    1200,
  );
  const pose = buffer.sample("a", 1200)!;
  assert.equal(pose.x, 5);
  assert.ok(Math.abs(pose.yaw) > 3);
  assert.equal(buffer.sample("a", 2000)!.x, 10);
});
test("walking avatars do not create an inconsistent crowd collision wall", () => {
  const simulation = new Simulation(),
    a = simulation.add("a", { x: 180, y: groundHeight(180, 20) + 1, z: 20 });
  simulation.add("b", { x: 182, y: groundHeight(182, 20) + 1, z: 20 });
  for (let i = 0; i < 60; i++) {
    a.step({ x: 1, z: 0, yaw: 0, seq: i, jump: false });
    simulation.tick(0);
  }
  assert.ok(a.position.x > 184);
  simulation.dispose();
});
