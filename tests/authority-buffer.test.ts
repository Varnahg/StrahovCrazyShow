import test from "node:test";
import assert from "node:assert/strict";
import { AuthorityBuffer } from "../client/authority-buffer";
import { NetworkTimeline } from "../client/network-timeline";
import type { Authority } from "../shared/netcode";

const packet = (ack: number, inputEpoch = 1, base = 0): Authority => ({
  ack,
  inputEpoch,
  inputTickBase: base,
  receivedSeq: ack,
  tick: base + ack,
  time: ((base + ack) * 1000) / 60,
  state: {
    position: { x: 0, y: 1, z: 0 },
    yaw: 0,
    speed: 0,
    vertical: 0,
    grounded: true,
    vehicle: false,
  },
});
const mode = { vehicle: false, yaw: 0 };
const controls = (seq: number) => ({
  seq,
  x: 0,
  z: 0,
  yaw: 0,
  jump: false,
  vehicle: false,
});

test("80 queued snapshots become one ordinary reconciliation with the original receipt time", () => {
  const buffer = new AuthorityBuffer(),
    timeline = new NetworkTimeline();
  const first = buffer.offer(packet(0), 0);
  assert.equal(first.kind, "barrier");
  timeline.acceptAuthority(packet(0), 0, mode);
  timeline.advance(0, controls, () => {});
  for (let ack = 3; ack <= 240; ack += 3)
    assert.equal(buffer.offer(packet(ack), 4000 + ack / 100).kind, "queued");
  const latest = buffer.takeLatest()!;
  assert.equal(latest.packet.ack, 240);
  assert.equal(latest.receivedAt, 4002.4);
  const accepted = timeline.acceptAuthority(
    latest.packet,
    latest.receivedAt,
    mode,
  );
  assert.ok(accepted.accepted && accepted.rebase);
  assert.equal(buffer.takeLatest(), null);
  assert.equal(buffer.snapshot().superseded, 79);
  assert.equal(buffer.snapshot().ordinaryApplied, 1);
});

test("respawn and newer forced epochs are immediate barriers and cannot be coalesced away", () => {
  const buffer = new AuthorityBuffer();
  buffer.offer(packet(0), 0);
  buffer.offer(packet(9), 150);
  const respawn = {
    ...packet(0, 2, 10),
    resync: true,
    respawn: true as const,
    resyncReason: "respawn" as const,
  };
  const recovery = buffer.offer(respawn, 200);
  assert.equal(recovery.kind, "barrier");
  if (recovery.kind === "barrier")
    assert.equal(recovery.authority.packet.respawn, true);
  assert.equal(buffer.takeLatest(), null);
  buffer.offer(packet(3, 2, 10), 250);
  const forced = buffer.offer(
    { ...packet(0, 3, 14), resync: true, resyncReason: "server-clock-drop" },
    300,
  );
  assert.equal(forced.kind, "barrier");
  assert.equal(buffer.takeLatest(), null);
  assert.equal(buffer.offer(packet(15, 1), 301).kind, "rejected");
  assert.equal(buffer.offer(packet(1, 3, 14), 302).kind, "queued");
  assert.equal(buffer.takeLatest()?.receivedAt, 302);
});

test("new-epoch ordinary bootstrap is a barrier and lifecycle reset clears pending old-room state", () => {
  const buffer = new AuthorityBuffer();
  assert.equal(buffer.offer(packet(50, 10, 100), 1000).kind, "barrier");
  buffer.offer(packet(51, 10, 100), 1017);
  buffer.reset();
  assert.equal(buffer.takeLatest(), null);
  assert.equal(buffer.offer(packet(0), 1100).kind, "barrier");
  assert.equal(buffer.offer(packet(0), 1101).kind, "rejected");
  assert.equal(buffer.offer({ ...packet(1), tick: 5 }, 1102).kind, "rejected");
  buffer.dispose();
  assert.equal(buffer.offer(packet(2), 1103).kind, "rejected");
});
