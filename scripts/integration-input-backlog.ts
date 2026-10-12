/** Two actual SDK peers on the owned isolated server; no GPU or privileged movement. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_PROFILE } from "../shared/types";
import {
  INPUT_BACKLOG_RECOVERY_INTERVAL_MS,
  PROTOCOL_VERSION,
  canonicalInput,
  type Authority,
} from "../shared/netcode";

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
  authority?: Authority;
  seq: number;
  recoveries: { at: number; authority: Authority }[];
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
    seq: 0,
    recoveries: [],
    lags: [],
    record: false,
  };
  probes.push(probe);
  room.onMessage("*", () => {});
  room.onMessage("authoritative", (authority: Authority) => {
    probe.authority = authority;
    if (authority.resync)
      probe.recoveries.push({ at: performance.now(), authority });
    if (probe.record && !authority.resync)
      probe.lags.push(probe.seq - authority.ack);
  });
  await until(() => !!probe.authority, "initial authority");
  return probe;
}
function send(probe: Probe, count: number) {
  for (let batch = 0; batch < count; batch += 8)
    probe.room.send(
      "inputs",
      Array.from({ length: Math.min(8, count - batch) }, () =>
        canonicalInput({
          x: 1,
          z: 0,
          yaw: Math.PI / 2,
          jump: false,
          vehicle: false,
          seq: ++probe.seq,
        })!,
      ),
    );
}
async function rhythm(probe: Probe, milliseconds: number) {
  const start = performance.now();
  for (
    let batch = 1;
    batch <= Math.floor(milliseconds / (1000 / 30));
    batch++
  ) {
    await sleep(Math.max(0, start + batch * (1000 / 30) - performance.now()));
    send(probe, 2);
  }
}
const quantile = (values: number[], fraction: number) =>
  [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * fraction)];

try {
  const delayed = await join("backlog-delayed"),
    peer = await join("backlog-peer");
  const peerResyncs = peer.recoveries.length;
  const before = delayed.authority!,
    started = performance.now();
  // Model a paused sender delivering accumulated commands. The server itself is
  // not paused; all sixteen commands use its ordinary public input handler.
  send(delayed, 16);
  await until(
    () =>
      delayed.recoveries.some(
        ({ authority }) => authority.resyncReason === "input-backlog",
      ),
    "explicit backlog authority",
  );
  const first = delayed.recoveries.find(
    ({ authority }) => authority.resyncReason === "input-backlog",
  )!;
  assert.equal(
    first.authority.ack,
    16,
    "reset acknowledges the entire accepted burst",
  );
  assert.ok(
    first.at - started < 1000,
    "recovery is immediate, not a seconds-long FIFO drain",
  );
  assert.ok(
    Math.abs(first.authority.state.position.x - before.state.position.x) < 0.16,
    "burst cannot accelerate movement",
  );
  assert.equal(first.authority.respawn, undefined);
  assert.equal(first.authority.state.vehicle, before.state.vehicle);

  delayed.record = true;
  await rhythm(delayed, 2500);
  delayed.record = false;
  assert.ok(delayed.lags.length >= 30);
  const recoveredLagP95 = quantile(delayed.lags, 0.95);
  assert.ok(
    recoveredLagP95 <= 5,
    `normal cadence remains responsive: p95 lag ${recoveredLagP95}`,
  );
  assert.equal(
    peer.recoveries.length,
    peerResyncs,
    "an unaffected peer must not resync",
  );
  await until(
    () => delayed.authority!.ack === delayed.seq,
    "settled frontier before malformed input",
  );
  const frontier = delayed.seq;
  const recoveriesBeforeInvalid = delayed.recoveries.length;
  delayed.room.send("inputs", [
    { x: NaN, z: 0, yaw: 0, jump: false, seq: frontier + 1 },
  ]);
  await sleep(75);
  assert.equal(
    delayed.authority!.ack,
    frontier,
    "invalid numbers never advance the frontier",
  );
  assert.equal(
    delayed.recoveries.length,
    recoveriesBeforeInvalid,
    "malformed input cannot trigger recovery spam",
  );
  send(delayed, 1);
  await until(
    () => delayed.authority!.ack === delayed.seq,
    "valid next sequence after invalid input",
  );

  const recoveriesBeforeRate = delayed.recoveries.filter(
    ({ authority }) => authority.resyncReason === "input-backlog",
  ).length;
  for (let burst = 0; burst < 3; burst++) {
    send(delayed, 16);
    await sleep(80);
  }
  const duringRate = delayed.recoveries.filter(
    ({ authority }) => authority.resyncReason === "input-backlog",
  );
  assert.equal(
    duringRate.length,
    recoveriesBeforeRate + 1,
    "repeated bursts produce at most one reset in the cooldown",
  );
  await rhythm(delayed, INPUT_BACKLOG_RECOVERY_INTERVAL_MS + 500);
  const backlogRecoveries = delayed.recoveries.filter(
    ({ authority }) => authority.resyncReason === "input-backlog",
  );
  for (let i = 1; i < backlogRecoveries.length; i++)
    assert.ok(
      backlogRecoveries[i].authority.time -
        backlogRecoveries[i - 1].authority.time >=
        INPUT_BACKLOG_RECOVERY_INTERVAL_MS - 2,
    );
  await until(
    () => delayed.authority!.ack === delayed.seq,
    "queue drains after the bounded second recovery",
  );
  assert.equal(peer.recoveries.length, peerResyncs);

  const report = {
    completed: true,
    protocol: PROTOCOL_VERSION,
    endpoint,
    firstRecoveryAck: first.authority.ack,
    firstRecoveryMs: first.at - started,
    firstBurstDisplacementX:
      first.authority.state.position.x - before.state.position.x,
    steadyLagCommandsP95: recoveredLagP95,
    steadySamples: delayed.lags.length,
    unaffectedPeerResyncs: peer.recoveries.length - peerResyncs,
    backlogRecoveries: backlogRecoveries.map(({ authority }) => ({
      time: authority.time,
      tick: authority.tick,
      ack: authority.ack,
      reason: authority.resyncReason,
    })),
    checks: [
      "received frontier acknowledged explicitly",
      "no accelerated movement",
      "continued 60Hz returns to normal lag",
      "other player unaffected",
      "invalid input preserves strict sequence",
      "recovery rate bounded",
    ],
  };
  if (process.env.STRAHOV_INPUT_BACKLOG_EVIDENCE)
    writeFileSync(
      process.env.STRAHOV_INPUT_BACKLOG_EVIDENCE,
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.allSettled(probes.map((probe) => probe.room.leave()));
}
