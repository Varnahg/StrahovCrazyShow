/** Public protocol regression: all peers, compressed motion, recovery and no-op fanout. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_PROFILE, type Player } from "../shared/types";
import {
  PROTOCOL_VERSION,
  type Authority,
  type MotionPacket,
} from "../shared/netcode";
import { MotionDecoder } from "../shared/motion-codec";
import { ScriptTimelineClient, type ScriptAuthority } from "./timeline-client";

const endpoint = process.env.STRAHOV_TEST_URL || "http://127.0.0.1:2568";
assert.equal(
  new URL(endpoint).port,
  "2568",
  "Use the owned isolated integration server",
);
const sdk = new Client(endpoint);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate: () => boolean, label: string) {
  const deadline = performance.now() + 7000;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error("Timed out: " + label);
    await sleep(20);
  }
}
type Session = { id: string; token: string; worldId: string };
type Probe = {
  session: Session;
  room: Room;
  motion?: MotionPacket;
  authority?: Authority;
  presence: Player[];
  decoder: MotionDecoder;
  inputs: ScriptTimelineClient;
  motions: Map<number, MotionPacket>;
  authorities: Map<number, ScriptAuthority>;
  rejected: number;
  socialMessages: number;
  activityMessages: number;
  eventMessages: number;
  events: { id: string; title: string; owner?: string }[];
};
const probes: Probe[] = [];
const checks: string[] = [];
async function issue(index: number, resumeToken?: string): Promise<Session> {
  const response = await fetch(endpoint + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "multiplayer",
      profile: { ...DEFAULT_PROFILE, nickname: "network-" + index },
      resumeToken,
    }),
  });
  assert.equal(response.status, 200);
  return response.json() as Promise<Session>;
}
async function join(session: Session) {
  const room = await sdk.joinById(session.worldId, {
    token: session.token,
    protocol: PROTOCOL_VERSION,
  });
  const probe: Probe = {
    session,
    room,
    decoder: new MotionDecoder(),
    inputs: new ScriptTimelineClient({
      send: (batch) => room.send("inputs", batch),
    }),
    motions: new Map(),
    authorities: new Map(),
    rejected: 0,
    presence: [],
    socialMessages: 0,
    activityMessages: 0,
    eventMessages: 0,
    events: [],
  };
  probes.push(probe);
  room.onMessage("*", () => {});
  room.onMessage(
    "welcome",
    (data: { players: Player[]; events: Probe["events"] }) => {
      probe.presence = data.players;
      probe.events = data.events;
    },
  );
  room.onMessage("presence", (players: Player[]) => (probe.presence = players));
  room.onMessage("motion", (wire: unknown) => {
    const motion = probe.decoder.decode(wire);
    if (motion) {
      probe.motion = motion;
      probe.motions.set(motion.tick, motion);
      if (probe.motions.size > 120)
        probe.motions.delete(probe.motions.keys().next().value!);
    } else probe.rejected++;
  });
  room.onMessage("authoritative", (authority: ScriptAuthority) => {
    probe.inputs.acceptAuthority(authority);
    probe.authority = authority;
    probe.authorities.set(authority.tick, authority);
    if (probe.authorities.size > 120)
      probe.authorities.delete(probe.authorities.keys().next().value!);
  });
  room.onMessage("social", () => probe.socialMessages++);
  room.onMessage("activity", () => probe.activityMessages++);
  room.onMessage("events", (events: Probe["events"]) => {
    probe.events = events;
    probe.eventMessages++;
  });
  return probe;
}
const connected = () =>
  probes.filter((probe) => (probe.room as any).connection.isOpen);
const allSee = (ids: string[]) =>
  connected().every(
    (probe) =>
      probe.motion?.rows.length === ids.length &&
      ids.every((id) => probe.motion!.rows.some((row) => row[0] === id)) &&
      probe.presence.length === ids.length &&
      ids.every((id) => probe.presence.some((player) => player.id === id)),
  );

try {
  const firstSession = await issue(0);
  await assert.rejects(() =>
    sdk.joinById(firstSession.worldId, {
      token: firstSession.token,
      protocol: PROTOCOL_VERSION - 1,
    }),
  );
  const first = await join(firstSession);
  for (let i = 1; i < 12; i++) {
    const session = await issue(i);
    assert.equal(session.worldId, firstSession.worldId);
    await join(session);
  }
  const ids = probes.map((probe) => probe.session.id);
  await until(
    () => allSee(ids),
    "12 peers share all 12 identities and transforms",
  );
  assert.equal(
    probes.reduce((sum, probe) => sum + probe.rejected, 0),
    0,
  );
  checks.push(
    "12 authenticated peers in one world; every peer sees every identity, above the old eight-player boundary",
  );

  await until(() => !!first.authority, "initial exact authority");
  const startX = first.authority!.state.position.x;
  const frontier = await first.inputs.holdFor(
    {
      x: 1,
      z: 0,
      yaw: Math.PI / 2,
      jump: false,
      vehicle: false,
    },
    24 * 34,
  );
  await first.inputs.settle(frontier);
  assert.ok(first.authority!.state.position.x > startX + 1);
  let matchingAuthority: ScriptAuthority | undefined;
  await until(
    () => {
      matchingAuthority = [...first.authorities.values()].find(
        (authority) =>
          authority.inputEpoch === frontier.inputEpoch &&
          authority.ack >= frontier.seq &&
          probes.every((probe) => {
            const row = probe.motions
              .get(authority.tick)
              ?.rows.find((row) => row[0] === firstSession.id);
            return (
              row &&
              row[6] === authority.ack &&
              Math.abs(row[1] - authority.state.position.x) <= 0.00051
            );
          }),
      );
      return !!matchingAuthority;
    },
    "all observers reconstruct millimetre-bounded motion and exact acknowledgements",
  );
  assert.ok(
    probes.every(
      (probe) =>
        typeof probe.motion!.rows.find(
          (row) => row[0] === firstSession.id,
        )![9] === "boolean",
    ),
  );
  checks.push(
    "movement reaches every observer; position error <=0.51mm, exact ack and authoritative grounded bit",
  );

  const observer = probes[1];
  observer.decoder.reset();
  observer.motion = undefined;
  observer.room.send("motionResync");
  await until(
    () => !!observer.motion && allSee(ids),
    "fresh dictionary recovery without movement reset",
  );
  checks.push(
    "targeted keyframe restores an empty decoder without resetting locomotion or losing remote players",
  );

  await sleep(120);
  const counts = probes.map((probe) => [
    probe.socialMessages,
    probe.activityMessages,
    probe.eventMessages,
  ]);
  for (let i = 0; i < 3; i++) {
    first.room.send("quizAnswer", 0); // No quiz is running: no shared state can change.
    first.room.send("decline", { to: probes[1].session.id }); // No pending request.
    await sleep(80);
  }
  probes.forEach((probe, i) =>
    assert.deepEqual(
      [probe.socialMessages, probe.activityMessages, probe.eventMessages],
      counts[i],
    ),
  );
  checks.push(
    "repeated ineffective quiz/decline commands do not fan out state to the world",
  );

  const socialBefore = probes.map((probe) => probe.socialMessages);
  first.room.send("contact", { to: observer.session.id });
  await until(
    () => observer.socialMessages > socialBefore[1],
    "contact request reaches recipient",
  );
  assert.ok(first.socialMessages > socialBefore[0]);
  probes
    .slice(2)
    .forEach((probe, i) =>
      assert.equal(probe.socialMessages, socialBefore[i + 2]),
    );
  checks.push(
    "contact changes update the two participants without broadcasting to ten unrelated peers",
  );

  const departing = probes[11],
    removed = ids.filter((id) => id !== departing.session.id);
  await departing.room.leave();
  await until(() => allSee(removed), "departed player removed everywhere");
  const resumed = await issue(99, departing.session.token);
  assert.equal(resumed.id, departing.session.id);
  const rejoined = await join(resumed);
  await until(
    () => allSee(ids),
    "resumed identity has a fresh baseline and all peers see it",
  );
  assert.equal(rejoined.rejected, 0);
  checks.push(
    "disconnect removes the player everywhere; resuming the same identity reconstructs the full shared world",
  );

  first.room.send("saveEvent", {
    title: "Private network regression",
    description: "Authored multiplayer data",
    placeId: "b6",
    startsAt: Date.now() + 60000,
    endsAt: Date.now() + 120000,
  });
  await until(
    () =>
      first.events.some(
        (event) => event.title === "Private network regression",
      ),
    "authored meeting created",
  );
  const publicEvents = (await (
    await fetch(endpoint + "/api/demo-events")
  ).json()) as Probe["events"];
  assert.ok(
    !publicEvents.some((event) => event.title === "Private network regression"),
  );
  const guest = await fetch(endpoint + "/api/session", {
    method: "POST",
    body: JSON.stringify({ mode: "guest" }),
  });
  assert.equal(guest.status, 403);
  assert.deepEqual(await (await fetch(endpoint + "/api/health")).json(), {
    ok: true,
    demo: true,
  });
  checks.push(
    "guest cannot join or read authored meetings or individual presence from public HTTP",
  );
  assert.deepEqual(await (await fetch(endpoint + "/api/presence")).json(), { online: 12 });
  checks.push("public aggregate reports all twelve connected players and no identities");
  const report = {
    completed: true,
    protocol: PROTOCOL_VERSION,
    endpoint,
    checks,
    peers: 12,
    matchingMotion: {
      tick: matchingAuthority!.tick,
      time: matchingAuthority!.time,
      inputEpoch: matchingAuthority!.inputEpoch,
      ack: matchingAuthority!.ack,
    },
  };
  if (process.env.STRAHOV_NETWORK_EVIDENCE)
    writeFileSync(
      process.env.STRAHOV_NETWORK_EVIDENCE,
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log("PASS: " + checks.join("; "));
} finally {
  probes.forEach((probe) => probe.inputs.dispose());
  await Promise.allSettled(connected().map((probe) => probe.room.leave()));
}
