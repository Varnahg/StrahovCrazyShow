/** Two actual SDK peers on the owned isolated server; no GPU or privileged movement. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_PROFILE } from "../shared/types";
import { PROTOCOL_VERSION, SIM_HZ } from "../shared/netcode";
import {
  DEFAULT_INPUT_LEAD_TICKS,
  MAX_FUTURE_INPUT_TICKS,
  type TimelineQueueDiagnostics,
} from "../shared/input-timeline";
import { ScriptTimelineClient, type ScriptAuthority } from "./timeline-client";

const endpoint = process.env.STRAHOV_TEST_URL || "http://127.0.0.1:2568";
assert.equal(
  new URL(endpoint).port,
  "2568",
  "Use the owned isolated integration server",
);
const sdk = new Client(endpoint),
  probes: Probe[] = [];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean, label: string) {
  const deadline = performance.now() + 5000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("Timed out: " + label);
    await sleep(10);
  }
}
type Probe = {
  room: Room;
  inputs: ScriptTimelineClient;
  authority?: ScriptAuthority;
  recoveries: { at: number; authority: ScriptAuthority }[];
  lags: number[];
  record: boolean;
};
async function join(nickname: string) {
  const response = await fetch(endpoint + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "multiplayer",
      profile: { ...DEFAULT_PROFILE, nickname },
    }),
  });
  assert.equal(response.status, 200);
  const session = (await response.json()) as { token: string; worldId: string };
  const room = await sdk.joinById(session.worldId, {
    token: session.token,
    protocol: PROTOCOL_VERSION,
  });
  const probe: Probe = {
    room,
    inputs: new ScriptTimelineClient({
      send: (batch) => room.send("inputs", batch),
    }),
    recoveries: [],
    lags: [],
    record: false,
  };
  probes.push(probe);
  room.onMessage("*", () => {});
  room.onMessage("authoritative", (authority: ScriptAuthority) => {
    if (probe.record && !authority.resync)
      probe.lags.push(probe.inputs.frontier.seq - authority.ack);
    probe.authority = authority;
    probe.inputs.acceptAuthority(authority);
    if (authority.resync)
      probe.recoveries.push({ at: performance.now(), authority });
  });
  await until(() => !!probe.authority, "initial authority");
  return probe;
}
function queue(probe: Probe): TimelineQueueDiagnostics {
  const diagnostic = probe.authority!.network!.queue;
  assert.ok(
    "resolution" in diagnostic && diagnostic.resolution === "scheduled-tick",
  );
  return diagnostic;
}
const controls = { x: 1, z: 0, yaw: Math.PI / 2, jump: false, vehicle: false };
const command = (probe: Probe, seq: number) => ({
  ...controls,
  seq,
  inputEpoch: probe.authority!.inputEpoch,
});
const quantile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];

try {
  const delayed = await join("backlog-delayed"),
    peer = await join("backlog-peer");
  const peerResyncs = peer.recoveries.length,
    initialResyncs = delayed.recoveries.length;
  const before = delayed.authority!,
    started = performance.now();
  const burstEnd = before.ack + MAX_FUTURE_INPUT_TICKS;
  // The full supported window arrives together, but each input belongs to one
  // future tick. Some earliest deadlines may have elapsed while in transport.
  for (let offset = 1; offset <= MAX_FUTURE_INPUT_TICKS; offset += 8)
    delayed.room.send(
      "inputs",
      Array.from({ length: 8 }, (_, i) =>
        command(delayed, before.ack + offset + i),
      ),
    );
  await until(
    () => queue(delayed).receivedSeq === burstEnd,
    "scheduled burst received",
  );
  const first = delayed.authority!,
    firstAt = performance.now();
  const displacement = first.state.position.x - before.state.position.x;
  assert.ok(
    displacement <= ((first.tick - before.tick) * 4.6) / SIM_HZ + 0.005,
    "burst cannot move farther than ordinary pedestrian speed over resolved world ticks",
  );
  assert.ok(
    firstAt - started < 1000,
    "burst reports receipt without a seconds-long FIFO drain",
  );
  assert.equal(first.respawn, undefined);
  assert.equal(first.state.vehicle, before.state.vehicle);
  assert.equal(first.inputEpoch, before.inputEpoch);
  await until(
    () => delayed.authority!.ack >= burstEnd,
    "burst resolves by scheduled time",
  );
  assert.equal(
    delayed.recoveries.length,
    initialResyncs,
    "scheduled burst needs no recovery",
  );

  delayed.record = true;
  await delayed.inputs.holdFor(controls, 2500);
  delayed.record = false;
  await delayed.inputs.settle();
  assert.ok(delayed.lags.length >= 30);
  const leadP95 = quantile(delayed.lags, 0.95);
  assert.ok(
    leadP95 <= DEFAULT_INPUT_LEAD_TICKS,
    `normal cadence remains within intentional lead: p95 ${leadP95}`,
  );
  assert.equal(
    peer.recoveries.length,
    peerResyncs,
    "unaffected peer must not resync",
  );

  const invalidBefore = queue(delayed),
    epochBefore = delayed.authority!.inputEpoch;
  delayed.room.send("inputs", [
    { ...command(delayed, delayed.authority!.ack + 8), x: NaN },
  ]);
  await until(
    () => queue(delayed).rejected.invalid > invalidBefore.rejected.invalid,
    "invalid input rejected",
  );
  assert.equal(queue(delayed).accepted, invalidBefore.accepted);
  assert.equal(queue(delayed).receivedSeq, invalidBefore.receivedSeq);
  assert.ok(
    delayed.authority!.ack > invalidBefore.ack,
    "invalid input cannot stop world time",
  );

  const rejectedBefore = queue(delayed).rejected;
  delayed.room.send("inputs", [
    command(delayed, Math.max(0, delayed.authority!.ack - 1)),
    {
      ...command(delayed, delayed.authority!.ack + 8),
      inputEpoch: epochBefore - 1,
    },
    command(delayed, delayed.authority!.ack + MAX_FUTURE_INPUT_TICKS + 1000),
  ]);
  await until(() => {
    const rejected = queue(delayed).rejected;
    return (
      rejected.late > rejectedBefore.late &&
      rejected.epoch > rejectedBefore.epoch &&
      rejected.ahead > rejectedBefore.ahead
    );
  }, "late, old-epoch and excessive-future commands rejected independently");
  assert.equal(delayed.authority!.inputEpoch, epochBefore);
  assert.equal(
    delayed.recoveries.length,
    initialResyncs,
    "bad packets cannot cause recovery spam",
  );

  const duplicateBefore = queue(delayed),
    duplicateSeq = delayed.authority!.ack + 12;
  const duplicate = command(delayed, duplicateSeq);
  delayed.room.send("inputs", [duplicate, duplicate]);
  await until(
    () =>
      queue(delayed).rejected.duplicate > duplicateBefore.rejected.duplicate,
    "duplicate future input rejected",
  );
  assert.equal(queue(delayed).accepted, duplicateBefore.accepted + 1);
  await until(
    () => delayed.authority!.ack >= duplicateSeq,
    "single accepted duplicate slot resolves once",
  );

  const beforeRecovery = delayed.authority!,
    recoveryCount = delayed.recoveries.length;
  delayed.room.send("resync");
  await until(
    () => delayed.recoveries.length > recoveryCount,
    "explicit client recovery response",
  );
  const recovery = delayed.recoveries[recoveryCount].authority;
  assert.equal(recovery.resyncReason, "client-request");
  assert.ok(recovery.inputEpoch > beforeRecovery.inputEpoch);
  assert.equal(recovery.ack, 0);
  assert.equal(recovery.inputTickBase, recovery.tick);
  assert.equal(recovery.receivedSeq, 0);
  const resumedX = recovery.state.position.x;
  await delayed.inputs.holdUntil(
    controls,
    () => delayed.authority!.state.position.x > resumedX + 1,
    "fresh epoch responds to continuous movement",
  );
  await delayed.inputs.settle();
  assert.equal(peer.recoveries.length, peerResyncs);

  const report = {
    completed: true,
    protocol: PROTOCOL_VERSION,
    endpoint,
    burstReceivedSeq: first.receivedSeq,
    burstResolvedAck: burstEnd,
    firstBurstReplyMs: firstAt - started,
    firstBurstDisplacementX: displacement,
    steadyIntentionalLeadTicksP95: leadP95,
    steadySamples: delayed.lags.length,
    unaffectedPeerResyncs: peer.recoveries.length - peerResyncs,
    rejectionCounters: queue(delayed).rejected,
    recovery: {
      inputEpoch: recovery.inputEpoch,
      inputTickBase: recovery.inputTickBase,
      tick: recovery.tick,
      ack: recovery.ack,
    },
    checks: [
      "future window resolves on world time without acceleration",
      "continuous held input stays within bounded lead",
      "invalid/late/old-epoch/ahead/duplicate input rejected without resync storm",
      "explicit recovery creates fresh epoch and remains responsive",
      "other player unaffected",
    ],
  };
  if (process.env.STRAHOV_INPUT_BACKLOG_EVIDENCE)
    writeFileSync(
      process.env.STRAHOV_INPUT_BACKLOG_EVIDENCE,
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(JSON.stringify(report, null, 2));
} finally {
  probes.forEach((probe) => probe.inputs.dispose());
  await Promise.allSettled(probes.map((probe) => probe.room.leave()));
}
