import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_PROFILE } from "../shared/types";
import { PROTOCOL_VERSION } from "../shared/netcode";
import { MotionDecoder } from "../shared/motion-codec";
import { SPAWN, CAR_SPAWN } from "../shared/world";
import { ScriptTimelineClient, type ScriptAuthority } from "./timeline-client";
const endpoint = process.env.STRAHOV_TEST_URL || "http://127.0.0.1:2567";
const evidence = {
  startedAt: new Date().toISOString(),
  endpoint,
  protocol: PROTOCOL_VERSION,
  spawn: SPAWN,
  carSpawn: CAR_SPAWN,
  collision: {
    mode: "native-dmr-and-independent-authored-assets",
    sourcePhotogrammetry: "reference-only",
  },
  completed: false,
  lastStage: "HTTP guest boundary",
  checks: [] as string[],
  stages: [] as any[],
  failure: null as {
    message: string;
    lastStage: string;
    state: unknown;
  } | null,
};
process.on("exit", (code) => {
  if (process.env.STRAHOV_INTEGRATION_EVIDENCE)
    writeFileSync(
      process.env.STRAHOV_INTEGRATION_EVIDENCE,
      JSON.stringify(
        {
          ...evidence,
          status: code === 0 && evidence.completed ? "passed" : "failed",
          exitCode: code,
          finishedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const until = async (check: () => boolean, label: string) => {
  evidence.lastStage = label;
  for (let i = 0; i < 100; i++) {
    if (check()) {
      evidence.checks.push(label);
      return;
    }
    await sleep(30);
  }
  throw new Error("Timeout: " + label);
};
async function issue(name: string, resumeToken?: string) {
  const r = await fetch(endpoint + "/api/session", {
    method: "POST",
    body: JSON.stringify({
      mode: "multiplayer",
      profile: { ...DEFAULT_PROFILE, nickname: name },
      resumeToken,
    }),
  });
  assert.equal(r.status, 200);
  return r.json();
}
const guest = await fetch(endpoint + "/api/session", {
  method: "POST",
  body: JSON.stringify({ mode: "guest" }),
});
assert.equal(guest.status, 403);
const publicHealth = await (await fetch(endpoint + "/api/health")).json();
assert.deepEqual(publicHealth, { ok: true, demo: true });
assert.deepEqual(await (await fetch(endpoint + "/api/presence")).json(), { online: 0 });
assert.deepEqual(await (await fetch(endpoint + "/api/ai/status")).json(), { enabled: false });
const disabledAi = await fetch(endpoint + "/api/ai/session", {
  method: "POST", headers: { Origin: endpoint, "Content-Type": "application/json" }, body: "{}",
});
assert.equal(disabledAi.status, 503);
assert.deepEqual(await disabledAi.json(), { error: "unavailable" });
const unknownAi = await fetch(endpoint + "/api/ai/unknown");
assert.equal(unknownAi.status, 404);
assert.equal(unknownAi.headers.get("access-control-allow-origin"), null);
evidence.checks.push("isolated AI stays disabled without inherited credentials; its namespace does not expose wildcard CORS");
for (const path of ["/api/players", "/api/chat", "/api/community-events"])
  assert.equal((await fetch(endpoint + path)).status, 403);
evidence.checks.push(
  "guest session and private HTTP endpoints return403; public health contains no presence",
);
assert.notEqual(
  (
    await fetch(endpoint + "/matchmake/create/strahov", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
  ).status,
  200,
);
const sdk = new Client(endpoint);
const sessionA = await issue("Alice"),
  sessionB = await issue("Bob");
assert.equal(
  sessionA.worldId,
  sessionB.worldId,
  "both clients must join the same singleton world",
);
await assert.rejects(
  () => sdk.joinById(sessionA.worldId, {}),
  "no token must be rejected",
);
const rooms: Room[] = [];
let inputs: ScriptTimelineClient | undefined;
let captureState: () => unknown = () => ({ producer: inputs?.snapshot() });
try {
  const a = await sdk.joinById(sessionA.worldId, {
    token: sessionA.token,
    protocol: PROTOCOL_VERSION,
  });
  rooms.push(a);
  const stateA: any = {
    players: [],
    messages: [],
    social: {},
    events: [],
    motion: [],
    notices: [],
    car: null,
  };
  for (const [k, type] of [
    ["players", "presence"],
    ["social", "social"],
    ["events", "events"],
  ])
    a.onMessage(type, (d: any) => (stateA[k] = d));
  const motionA = new MotionDecoder();
  a.onMessage("motion", (wire: unknown) => {
    const packet = motionA.decode(wire);
    assert.ok(packet, "every ordered motion packet must decode");
    stateA.motion = packet.rows;
  });
  inputs = new ScriptTimelineClient({
    send: (batch) => a.send("inputs", batch),
  });
  a.onMessage("authoritative", (packet: ScriptAuthority) => {
    stateA.authority = packet;
    inputs!.acceptAuthority(packet);
  });
  a.onMessage("welcome", (d: any) =>
    Object.assign(stateA, { players: d.players, events: d.events }),
  );
  a.onMessage("chat", (m: any) => stateA.messages.push(m));
  a.onMessage("notice", (n: any) => stateA.notices.push(n));
  a.onMessage("activity", () => {});
  a.onMessage("car", (car: any) => (stateA.car = car));
  const b = await sdk.joinById(sessionB.worldId, {
    token: sessionB.token,
    protocol: PROTOCOL_VERSION,
  });
  rooms.push(b);
  const stateB: any = {
    messages: [],
    social: {},
    notices: [],
    players: [],
    motion: [],
    carState: null,
  };
  b.onMessage("welcome", () => {});
  b.onMessage("presence", (p: any) => (stateB.players = p));
  const motionB = new MotionDecoder();
  b.onMessage("motion", (wire: unknown) => {
    const packet = motionB.decode(wire);
    assert.ok(packet, "observer receives a complete reconstructed world");
    stateB.motion = packet.rows;
    stateB.carState = packet.car;
  });
  b.onMessage("authoritative", () => {});
  b.onMessage("social", (d: any) => (stateB.social = d));
  b.onMessage("chat", (m: any) => stateB.messages.push(m));
  b.onMessage("notice", (n: any) => stateB.notices.push(n));
  b.onMessage("events", () => {});
  b.onMessage("activity", () => {});
  b.onMessage("car", () => {});
  captureState = () => ({
    authority: stateA.authority,
    motion: stateA.motion,
    observerMotion: stateB.motion,
    notices: [...stateA.notices],
    observerNotices: [...stateB.notices],
    car: stateA.car,
    producer: inputs?.snapshot(),
  });
  await until(() => stateA.players.length === 2, "presence of both clients");
  assert.deepEqual(await (await fetch(endpoint + "/api/presence")).json(), { online: 2 });
  const self = () => stateA.motion.find((row: any) => row[0] === sessionA.id);
  const record = (name: string) => {
    const pose = (row: any) =>
      row
        ? {
            x: row[1],
            y: row[2],
            z: row[3],
            yaw: row[4],
            speed: row[5],
            ack: row[6],
            vehicle: !!row[7],
            zone: row[8],
          }
        : null;
    evidence.stages.push({
      name,
      driver: pose(self()),
      observer: pose(stateB.motion.find((row: any) => row[0] === sessionA.id)),
      steering: stateA.authority?.state.vehicleState?.steering,
      observerSteering: stateB.carState?.steering,
      authority: stateA.authority && {
        tick: stateA.authority.tick,
        time: stateA.authority.time,
        inputEpoch: stateA.authority.inputEpoch,
        inputTickBase: stateA.authority.inputTickBase,
        ack: stateA.authority.ack,
        receivedSeq: stateA.authority.receivedSeq,
      },
      producer: inputs?.snapshot(),
      notices: [...stateA.notices],
    });
  };
  await until(() => !!inputs!.authority, "initial input timeline authority");
  const controls = (x: number, z: number, handbrake = false) => ({
    x,
    z,
    yaw: 0,
    jump: handbrake,
    vehicle: inputs!.authority!.state.vehicle,
  });
  const drive = (x: number, z: number, packets: number, handbrake = false) =>
    inputs!.holdFor(() => controls(x, z, handbrake), packets * 34);
  const driveUntil = async (
    x: number,
    z: number,
    check: () => boolean,
    label: string,
    handbrake = false,
    timeoutMs = 3000,
  ) => {
    evidence.lastStage = label;
    try {
      await inputs!.holdUntil(
        () => controls(x, z, handbrake),
        check,
        label,
        timeoutMs,
      );
      evidence.checks.push(label);
    } catch (error) {
      record("failed manoeuvre: " + label);
      throw error;
    }
  };
  await drive(0, 1, 12);
  await inputs.settle();
  a.send("vehicle");
  await until(
    () => stateA.motion.find((r: any) => r[0] === sessionA.id)?.[7] === 1,
    "enter car",
  );
  record("car entry at canonical parking spawn");
  assert.ok(
    Math.hypot(self()[1] - CAR_SPAWN.x, self()[3] - CAR_SPAWN.z) < 0.3,
    "car entry must be the actual canonical car, not an old fixture",
  );
  const startZ = stateA.motion.find((r: any) => r[0] === sessionA.id)[3];
  await driveUntil(
    0,
    1,
    () => stateA.motion.find((r: any) => r[0] === sessionA.id)[3] > startZ + 2,
    "drive car",
  );
  await until(
    () =>
      stateB.motion.some(
        (row: any) =>
          row[0] === sessionA.id && row[7] === 1 && row[3] > startZ + 2,
      ),
    "second client receives actual car motion",
  );
  record("W forward motion received by both clients");
  // The server must refuse a malicious/direct exit request at road speed.
  a.send("vehicle");
  await until(
    () =>
      stateA.notices.some((n: any) =>
        String(n.text ?? n).includes("Nejdřív zastav auto"),
      ),
    "reject car exit while moving",
  );
  assert.equal(stateA.motion.find((r: any) => r[0] === sessionA.id)?.[7], 1);
  await driveUntil(
    0,
    0,
    () =>
      Math.abs(
        stateA.motion.find((r: any) => r[0] === sessionA.id)?.[5] ?? Infinity,
      ) <= 1,
    "brake before safe exit",
    true,
  );
  record("Space stopped car");
  // Short low-speed manoeuvres stay inside the measured clear parking area.
  await driveUntil(
    1,
    0,
    () => stateA.authority?.state.vehicleState?.steering > 0.25,
    "A turns the real front wheels left",
  );
  const leftTurnYaw = self()[4];
  await driveUntil(
    1,
    1,
    () =>
      Math.abs(
        Math.atan2(
          Math.sin(self()[4] - leftTurnYaw),
          Math.cos(self()[4] - leftTurnYaw),
        ),
      ) > 0.01,
    "A changes physical heading while rolling",
    false,
    60 * 34,
  );
  record("A low-speed forward turn");
  await driveUntil(
    0,
    0,
    () => Math.abs(self()[5]) <= 1,
    "stop after A turn",
    true,
  );
  await driveUntil(
    -1,
    0,
    () => stateA.authority?.state.vehicleState?.steering < -0.25,
    "D turns the real front wheels right",
  );
  const reverseTurnYaw = self()[4];
  await driveUntil(
    -1,
    -1,
    () =>
      self()[5] < -0.3 &&
      Math.abs(
        Math.atan2(
          Math.sin(self()[4] - reverseTurnYaw),
          Math.cos(self()[4] - reverseTurnYaw),
        ),
      ) > 0.01,
    "D changes physical heading while reversing",
    false,
    60 * 34,
  );
  record("D low-speed reverse turn");
  const beforeReverseZ = self()[3];
  await driveUntil(
    0,
    -1,
    () => self()[5] < -1 && self()[3] < beforeReverseZ - 0.5,
    "S reverse on native campus collisions",
  );
  record("S reverse");
  await driveUntil(
    0,
    1,
    () => self()[5] > 0.5,
    "W brakes reverse before driving forward",
  );
  record("W recovers from reverse");
  await driveUntil(
    0,
    0,
    () => Math.abs(self()[5]) <= 1,
    "final handbrake before safe exit",
    true,
  );
  await inputs.settle();
  record("resolved final handbrake before exit request");
  a.send("vehicle");
  await until(
    () =>
      stateA.car?.parked === true &&
      stateA.motion.find((r: any) => r[0] === sessionA.id)?.[7] === 0,
    "exit and park car",
  );
  record("safe exit and persistent parking");
  a.send("vehicle");
  await until(
    () => stateA.motion.find((r: any) => r[0] === sessionA.id)?.[7] === 1,
    "enter moved car",
  );
  a.send("vehicle");
  await until(() => self()?.[7] === 0, "exit moved car again");
  a.send("chat", { channel: "global", text: "Ahoj ze Strahova" });
  await until(
    () => stateB.messages.some((m: any) => m.text === "Ahoj ze Strahova"),
    "global chat",
  );
  a.send("contact", { to: sessionB.id });
  await until(
    () => stateB.social.requests?.includes(sessionA.id),
    "contact request",
  );
  b.send("contact", { to: sessionA.id, accept: true });
  await until(
    () => stateA.social.contacts?.includes(sessionB.id),
    "accepted contact",
  );
  await until(
    () => stateB.social.contacts?.includes(sessionA.id),
    "both clients have accepted contact",
  );
  a.send("chat", { channel: "dm:" + sessionB.id, text: "Soukromě" });
  await until(
    () => stateB.messages.some((m: any) => m.text === "Soukromě"),
    "private chat",
  );
  b.send("block", { to: sessionA.id, enabled: true });
  await until(
    () => stateA.social.contacts?.length === 0,
    "blocked contact removal",
  );
  const noticesBeforeBlockedDm = stateA.notices.length;
  a.send("chat", { channel: "dm:" + sessionB.id, text: "Zablokovaná" });
  await until(
    () =>
      stateA.notices
        .slice(noticesBeforeBlockedDm)
        .some((notice: any) =>
          String(notice.text ?? notice).includes(
            "Soukromý kontakt není přijatý",
          ),
        ),
    "new explicit blocked DM rejection",
  );
  assert.ok(!stateB.messages.some((m: any) => m.text === "Zablokovaná"));
  const before = stateA.motion.find((r: any) => r[0] === sessionA.id)?.[1];
  await driveUntil(
    1,
    0,
    () =>
      stateA.motion.find((r: any) => r[0] === sessionA.id)?.[1] > before + 1,
    "server movement",
  );
  a.send("saveEvent", {
    title: "Vlastní setkání",
    description: "Demo",
    placeId: "b6",
    startsAt: Date.now() + 60000,
    endsAt: Date.now() + 120000,
  });
  await until(
    () => stateA.events.some((e: any) => e.title === "Vlastní setkání"),
    "own event",
  );
  const own = stateA.events.find((e: any) => e.title === "Vlastní setkání");
  b.send("cancelEvent", { id: own.id });
  await until(() => stateB.notices.length > 0, "ownership rejection");
  await a.leave();
  rooms.splice(rooms.indexOf(a), 1);
  await until(() => stateB.players.length === 1, "public count follows disconnection");
  assert.deepEqual(await (await fetch(endpoint + "/api/presence")).json(), { online: 1 });
  await sleep(100);
  const resumed = await issue("ignored", sessionA.token);
  assert.equal(resumed.id, sessionA.id);
  const rejoined = await sdk.joinById(resumed.worldId, {
    token: resumed.token,
    protocol: PROTOCOL_VERSION,
  });
  rooms.push(rejoined);
  rejoined.onMessage("*", () => {});
  await until(() => stateB.players.length === 2, "public count follows resume");
  assert.deepEqual(await (await fetch(endpoint + "/api/presence")).json(), { online: 2 });
  evidence.checks.push("public aggregate follows join, leave and resume without exposing identities");
  await sleep(150);
  const weather = await (await fetch(endpoint + "/api/weather")).json();
  assert.ok(["live", "fallback", "unavailable"].includes(weather.status));
  evidence.checks.push(
    "singleton, event ownership, session resume and public weather verified",
  );
  evidence.completed = true;
  console.log(
    "PASS: singleton world, guest boundary, two clients, walking, physical car W/A/D/brake/reverse/exit/re-entry on native DMR and authored assets, global/DM chat, consent, explicit blocking rejection, event ownership, session resume and weather endpoint.",
  );
} catch (error) {
  evidence.failure = {
    message: error instanceof Error ? error.message : String(error),
    lastStage: evidence.lastStage,
    state: captureState(),
  };
  console.error(
    "Integration failure state: " + JSON.stringify(evidence.failure),
  );
  throw error;
} finally {
  inputs?.dispose();
  for (const r of rooms) await r.leave();
}
