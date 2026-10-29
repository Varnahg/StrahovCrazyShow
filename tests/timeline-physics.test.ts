import test from "node:test";
import assert from "node:assert/strict";
import { initPhysics, Simulation } from "../shared/simulation";
import { groundHeight } from "../shared/terrain";
import { InputQueue, type ActorState } from "../shared/netcode";
import {
  TimelineInputQueue,
  type TimelineInput,
  type TimelineAuthority,
} from "../shared/input-timeline";
import { NetworkTimeline } from "../client/network-timeline";

await initPhysics();
const DT_MS = 1000 / 60;
const UTC = Date.parse("2026-10-13T21:00:00Z");
const mode = { vehicle: true, yaw: 0 };
const distance = (a: ActorState, b: ActorState) =>
  Math.hypot(
    a.position.x - b.position.x,
    a.position.y - b.position.y,
    a.position.z - b.position.z,
  );

function world() {
  const sim = new Simulation(),
    actor = sim.add("timeline-driver");
  actor.setVehicle(true);
  sim.car.reset({ x: 180, y: groundHeight(180, 20) + 1, z: 20 }, 0);
  sim.car.unpark("timeline-driver");
  const initial = sim.car.capture();
  initial.linvel = { x: 0, y: 0, z: 14 };
  sim.car.restore(initial);
  return { sim, actor };
}

test("two idle car steps keep identical physics but no longer label a 0.46m movement with the same ack", () => {
  const legacy = world(),
    scheduled = world();
  try {
    const old = new InputQueue(),
      next = new TimelineInputQueue(1, 0);
    const input = {
      seq: 1,
      inputEpoch: 1,
      x: 0,
      z: 1,
      yaw: 0,
      jump: false,
      vehicle: true,
    };
    old.push(input, 0);
    next.push(input);
    let first: ActorState | null = null;
    for (let tick = 1; tick <= 3; tick++) {
      legacy.actor.step(old.consume(tick * DT_MS));
      legacy.sim.tick(UTC + tick * DT_MS);
      scheduled.actor.step(next.consume(tick, mode).input);
      scheduled.sim.tick(UTC + tick * DT_MS);
      assert.deepEqual(
        scheduled.actor.capture(),
        legacy.actor.capture(),
        "no freeze, speedup or physics change",
      );
      if (tick === 1) first = scheduled.actor.capture();
    }
    assert.equal(old.ack, 1);
    assert.equal(next.ack, 3);
    assert.equal(next.frontier().receivedSeq, 1);
    assert.ok(distance(first!, scheduled.actor.capture()) > 0.45);
    assert.equal(next.push({ ...input, seq: 2 }), "late");
  } finally {
    legacy.sim.dispose();
    scheduled.sim.dispose();
  }
});

test("actual Rapier prediction/replay uses only future ticks across 0–200ms RTT, jitter and frame cadence", (t) => {
  for (const [rtt, fps, bootstrapJitter] of [
    [0, 60, 0],
    [50, 30, 0],
    [200, 15, 4],
  ]) {
    const server = world(),
      client = world();
    try {
      const queue = new TimelineInputQueue(1, 0),
        timeline = new NetworkTimeline();
      timeline.setRtt(rtt);
      type Packet = TimelineAuthority & { state: ActorState };
      const initial: Packet = {
        ...queue.frontier(),
        time: UTC,
        state: server.actor.capture(),
      };
      const authorities: { due: number; packet: Packet }[] = [
        { due: rtt / 2 + bootstrapJitter, packet: initial },
      ];
      const inputs: { due: number; input: TimelineInput }[] = [];
      const captures = new Map<number, ActorState>();
      let latest: { receivedAt: number; packet: Packet } | undefined;
      let maxSteadyError = 0,
        steadyComparisons = 0,
        lateAfterWarmup = 0;
      const frameEvery = 60 / fps;
      for (let tick = 1; tick <= 120; tick++) {
        const now = tick * DT_MS;
        for (let i = 0; i < inputs.length;) {
          if (inputs[i].due > now + 1e-7) {
            i++;
            continue;
          }
          const result = queue.push(inputs.splice(i, 1)[0].input);
          if (tick > 60 && result === "late") lateAfterWarmup++;
          assert.notEqual(result, "ahead", `RTT ${rtt}: bounded future lead`);
          assert.notEqual(result, "epoch");
        }
        const step = queue.consume(tick, mode);
        server.actor.step(step.input);
        server.sim.tick(UTC + tick * DT_MS);
        assert.equal(queue.ack, tick);
        if (tick % 3 === 0)
          authorities.push({
            due: now + rtt / 2 + (tick % 2) * 4,
            packet: {
              ...queue.frontier(),
              time: UTC + now,
              state: server.actor.capture(),
            },
          });
        for (let i = 0; i < authorities.length;) {
          if (authorities[i].due > now + 1e-7) {
            i++;
            continue;
          }
          const item = authorities.splice(i, 1)[0];
          latest = { receivedAt: item.due, packet: item.packet };
        }
        if (tick % frameEvery !== 0) continue;
        if (latest) {
          const { packet, receivedAt } = latest;
          latest = undefined;
          const predicted = captures.get(packet.ack);
          if (tick > 60 && predicted) {
            maxSteadyError = Math.max(
              maxSteadyError,
              distance(predicted, packet.state),
            );
            steadyComparisons++;
          }
          const accepted = timeline.acceptAuthority(packet, receivedAt, mode);
          if (accepted.accepted) {
            client.actor.restore(packet.state);
            for (const seq of captures.keys())
              if (seq <= packet.ack) captures.delete(seq);
            for (const replay of accepted.replay) {
              assert.ok(
                replay.input.seq > packet.ack,
                "resolved physics time is never replayed",
              );
              client.actor.step(replay.input);
              client.sim.tick(replay.time);
              captures.set(replay.input.seq, client.actor.capture());
            }
          }
        }
        timeline.advance(
          now,
          (seq) => ({ seq, x: 0, z: 1, yaw: 0, jump: false, vehicle: true }),
          (step) => {
            client.actor.step(step.input);
            client.sim.tick(step.time);
            captures.set(step.input.seq, client.actor.capture());
            if (step.source === "input")
              inputs.push({
                due: now + rtt / 2 + (step.input.seq % 3) * 2,
                input: step.input,
              });
          },
        );
        assert.ok(timeline.snapshot().retainedInputs <= 32);
        assert.ok(queue.diagnostics().depth <= 16);
      }
      assert.ok(
        steadyComparisons >= 10,
        `RTT ${rtt}: meaningful steady authority sample count`,
      );
      assert.equal(
        lateAfterWarmup,
        0,
        `RTT ${rtt}, ${fps} FPS must retain its input delivery margin`,
      );
      assert.ok(
        maxSteadyError < 0.03,
        `RTT ${rtt}, ${fps} FPS: ${maxSteadyError}m prediction error`,
      );
      t.diagnostic(
        JSON.stringify({
          rttMs: rtt,
          bootstrapJitterMs: bootstrapJitter,
          fps,
          steadyComparisons,
          maxSteadyErrorMetres: maxSteadyError,
          lateAfterWarmup,
        }),
      );
    } finally {
      server.sim.dispose();
      client.sim.dispose();
    }
  }
});

test("a real walking jump survives 200ms round-trip delay after initial join and a later epoch rebase", () => {
  const server = new Simulation(),
    client = new Simulation();
  const position = { x: 180, y: groundHeight(180, 20) + 1, z: 20 };
  const a = server.add("jump-server", position),
    b = client.add("jump-client", position);
  const foot = { vehicle: false, yaw: 0 };
  const idle = { seq: 0, x: 0, z: 0, yaw: 0, jump: false, vehicle: false };
  try {
    for (let i = -60; i < 0; i++) {
      a.step(idle);
      server.tick(UTC + i * DT_MS);
      b.step(idle);
      client.tick(UTC + i * DT_MS);
    }
    assert.equal(a.grounded, true);
    const queue = new TimelineInputQueue(1, 0),
      timeline = new NetworkTimeline();
    timeline.setRtt(200);
    let tick = 0;
    const until = (target: number) => {
      while (tick < target) {
        tick++;
        a.step(queue.consume(tick, foot).input);
        server.tick(UTC + tick * DT_MS);
      }
    };
    for (const [epoch, base] of [
      [1, 0],
      [2, 90],
    ]) {
      until(base);
      if (epoch > 1) queue.reset(epoch, base);
      assert.equal(
        a.grounded,
        true,
        `epoch${epoch} begins on the actual ground`,
      );
      const packet = {
        ...queue.frontier(),
        time: UTC + base * DT_MS,
        state: a.capture(),
      };
      until(base + 6); // Authority crosses a 100ms one-way link.
      const accepted = timeline.acceptAuthority(
        packet,
        (base + 6) * DT_MS,
        foot,
      );
      assert.ok(accepted.accepted && accepted.rebase);
      b.restore(packet.state);
      let jumpPending = true;
      const outgoing: TimelineInput[] = [];
      timeline.advance(
        (base + 6) * DT_MS,
        (seq) => {
          const input = { ...idle, seq, jump: jumpPending };
          jumpPending = false;
          return input;
        },
        (step) => {
          b.step(step.input);
          client.tick(step.time);
          if (step.source === "input") outgoing.push(step.input);
        },
      );
      assert.equal(outgoing[0].seq, 14);
      assert.equal(outgoing[0].jump, true);
      until(base + 12); // The input packet crosses the second 100ms leg.
      for (const input of outgoing) assert.equal(queue.push(input), "accepted");
      until(base + 14);
      assert.ok(
        a.vertical > 4,
        `epoch${epoch}: server executed the fresh jump, vertical=${a.vertical}`,
      );
      assert.equal(a.grounded, false);
    }
  } finally {
    server.dispose();
    client.dispose();
  }
});
