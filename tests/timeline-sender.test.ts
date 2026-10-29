import test from "node:test";
import assert from "node:assert/strict";
import { NetworkTimeline } from "../client/network-timeline";
import { FrameInputBuffer } from "../client/network-input-buffer";
import {
  TimelineInputQueue,
  type TimelineInput,
  type TimelineAuthority,
} from "../shared/input-timeline";

const DT = 1000 / 60;
const mode = { vehicle: false, yaw: 0 };
const controls = (seq: number, jump = false) => ({
  seq,
  x: 1,
  z: 0,
  yaw: 0,
  jump,
  vehicle: false,
});

test("epoch priority prevents the real sender cadence from expiring a jump after a delayed rebase", () => {
  const outcomes: { priority: boolean; jumpTicks: number[]; late: number }[] =
    [];
  for (const priority of [false, true]) {
    let now = 99;
    const packets: { due: number; inputs: TimelineInput[] }[] = [];
    const sender = new FrameInputBuffer({
      now: () => now,
      canSend: () => true,
      send: (inputs) =>
        packets.push({ due: now + 104, inputs: inputs as TimelineInput[] }),
    });
    sender.enqueue({ ...controls(200), inputEpoch: 1 } as TimelineInput);
    sender.flush();
    const queue = new TimelineInputQueue(2, 0),
      timeline = new NetworkTimeline();
    timeline.setRtt(200);
    for (let tick = 1; tick <= 6; tick++) queue.consume(tick, mode);
    now = 100;
    timeline.acceptAuthority(
      { inputEpoch: 2, inputTickBase: 0, tick: 0, ack: 0, time: 0 },
      now,
      mode,
    );
    sender.reset("new-epoch", { priority });
    let jumpPending = true;
    timeline.advance(
      now,
      (seq) => {
        const input = controls(seq, jumpPending);
        jumpPending = false;
        return input;
      },
      (step) => {
        if (step.source === "input") sender.enqueue(step.input);
      },
    );
    sender.flush("frame");
    const jumpTicks: number[] = [];
    let late = 0;
    for (let tick = 7; tick <= 20; tick++) {
      now = tick * DT;
      if (tick % 2 === 0) sender.flush("timer");
      for (let i = 0; i < packets.length;) {
        if (packets[i].due > now + 1e-7) {
          i++;
          continue;
        }
        for (const input of packets.splice(i, 1)[0].inputs)
          if (queue.push(input) === "late") late++;
      }
      if (queue.consume(tick, mode).input.jump) jumpTicks.push(tick);
    }
    outcomes.push({ priority, jumpTicks, late });
    sender.dispose();
  }
  assert.deepEqual(
    outcomes[0].jumpTicks,
    [],
    "old cadence loses the fresh jump at its expired deadline",
  );
  assert.ok(outcomes[0].late > 0);
  assert.deepEqual(outcomes[1].jumpTicks, [14]);
  assert.equal(outcomes[1].late, 0);
});

test("combined sender and timeline preserve held input and one jump per epoch at RTT200, jitter and 15FPS", () => {
  let now = 0,
    epoch = 1;
  const queue = new TimelineInputQueue(epoch, 0),
    timeline = new NetworkTimeline();
  timeline.setRtt(200);
  const inputs: { due: number; input: TimelineInput }[] = [];
  const authorities: { due: number; packet: TimelineAuthority }[] = [
    { due: 100, packet: { ...queue.frontier(), time: 0 } },
  ];
  const sender = new FrameInputBuffer({
    now: () => now,
    canSend: () => true,
    send: (batch) => {
      for (const input of batch as TimelineInput[])
        inputs.push({ due: now + 100 + (input.seq % 3) * 2, input });
    },
  });
  let jumpPending = false,
    lateAfterWarmup = 0,
    activeSteps = 0;
  const jumps: number[] = [];
  for (let tick = 1; tick <= 210; tick++) {
    now = tick * DT;
    for (let i = 0; i < inputs.length;) {
      if (inputs[i].due > now + 1e-7) {
        i++;
        continue;
      }
      const result = queue.push(inputs.splice(i, 1)[0].input);
      if (result === "late" && ((tick > 60 && tick < 90) || tick > 150))
        lateAfterWarmup++;
      assert.notEqual(result, "ahead");
    }
    const resolved = queue.consume(tick, mode);
    if (resolved.input.jump) jumps.push(epoch);
    if (resolved.source === "input" && resolved.input.x === 1) activeSteps++;
    if (tick === 90) {
      epoch++;
      queue.reset(epoch, tick);
      authorities.push({
        due: now + 100,
        packet: { ...queue.frontier(), time: now },
      });
    }
    if (tick % 3 === 0)
      authorities.push({
        due: now + 100 + (tick % 2) * 4,
        packet: { ...queue.frontier(), time: now },
      });
    for (let i = 0; i < authorities.length;) {
      if (authorities[i].due > now + 1e-7) {
        i++;
        continue;
      }
      const item = authorities.splice(i, 1)[0];
      const accepted = timeline.acceptAuthority(item.packet, item.due, mode);
      if (!accepted.accepted) continue;
      if (accepted.epochChanged) {
        sender.reset("new-epoch", { priority: true });
        jumpPending = true;
      }
      sender.acknowledge(item.packet.ack);
    }
    if (tick % 4 === 0) {
      timeline.advance(
        now,
        (seq) => {
          const input = controls(seq, jumpPending);
          jumpPending = false;
          return input;
        },
        (step) => {
          if (step.source === "input") sender.enqueue(step.input);
        },
      );
      sender.flush("frame");
    }
    if (tick % 2 === 0) sender.flush("timer");
    assert.ok(queue.diagnostics().depth <= 16);
  }
  assert.deepEqual(jumps, [1, 2]);
  assert.equal(lateAfterWarmup, 0);
  assert.ok(
    activeSteps > 140,
    "the producer really holds movement through the network",
  );
  assert.equal(sender.snapshot().overflows, 0);
  sender.dispose();
});
