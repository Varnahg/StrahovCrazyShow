// Reproduce from repository root: pnpm exec tsx docs/interaction/driving-sdk.ts
import { spawn } from "node:child_process";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { Client, type Room } from "@colyseus/sdk";
import { DEFAULT_PROFILE } from "../../shared/types";
import { PROTOCOL_VERSION, type Authority } from "../../shared/netcode";
const endpoint = "http://127.0.0.1:2574",
  sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: "2574" },
  stdio: "ignore",
  windowsHide: true,
});
let room: Room | undefined,
  authority: Authority | undefined,
  seq = 0,
  car: any = null;
const notices: string[] = [],
  stages: any[] = [];
async function until(check: () => boolean, label: string, timeout = 12000) {
  const start = performance.now();
  while (performance.now() - start < timeout) {
    if (check()) return;
    await sleep(50);
  }
  throw new Error("Timeout: " + label);
}
try {
  let healthy = false;
  for (let i = 0; i < 150 && !healthy; i++) {
    try {
      healthy = (await fetch(endpoint + "/api/health")).ok;
    } catch {}
    if (!healthy) await sleep(100);
  }
  assert.ok(healthy, "isolated server starts");
  const session = await (
    await fetch(endpoint + "/api/session", {
      method: "POST",
      body: JSON.stringify({
        mode: "multiplayer",
        profile: { ...DEFAULT_PROFILE, nickname: "SDK řízení" },
      }),
    })
  ).json();
  room = await new Client(endpoint).joinById(session.worldId, {
    token: session.token,
    protocol: PROTOCOL_VERSION,
  });
  for (const type of [
    "welcome",
    "presence",
    "events",
    "social",
    "activity",
    "chat",
    "emote",
  ])
    room.onMessage(type, () => {});
  room.onMessage("car", (data) => (car = data));
  room.onMessage("motion", () => {});
  room.onMessage("notice", (notice) => notices.push(String(notice)));
  room.onMessage("authoritative", (packet: Authority) => {
    authority = packet;
    if (packet.resync) seq = packet.ack;
  });
  await until(() => !!authority, "initial authority");
  async function drive(x: number, z: number, ticks: number, handbrake = false) {
    for (let i = 0; i < ticks; i += 2) {
      room!.send(
        "inputs",
        Array.from({ length: Math.min(2, ticks - i) }, () => ({
          x,
          z,
          yaw: 0,
          jump: handbrake,
          seq: ++seq,
        })),
      );
      await sleep(34);
    }
    await sleep(100);
  }
  const record = (name: string) =>
    stages.push({
      name,
      position: { ...authority!.state.position },
      speed: authority!.state.speed,
      vehicle: authority!.state.vehicle,
    });
  await drive(0, 1, 30);
  room.send("vehicle");
  await until(() => authority?.state.vehicle === true, "enter car");
  record("entered");
  await drive(0, 1, 70);
  record("forward");
  assert.ok(authority!.state.speed > 1);
  room.send("vehicle");
  await until(
    () => notices.some((notice) => notice.includes("zastav")),
    "unsafe moving exit rejected",
  );
  assert.equal(authority!.state.vehicle, true);
  await drive(-1, 1, 20);
  record("D turn");
  await drive(1, 1, 20);
  record("A turn");
  await drive(0, 0, 120, true);
  record("handbrake stopped");
  assert.ok(Math.abs(authority!.state.speed) < 1);
  await drive(0, -1, 180);
  record("reverse");
  assert.ok(authority!.state.speed < -0.5);
  await drive(0, 1, 120);
  record("W brakes reverse then drives forward");
  assert.ok(authority!.state.speed > 0.5);
  await drive(0, 0, 120, true);
  room.send("vehicle");
  await until(
    () => authority?.state.vehicle === false && car?.parked === true,
    "safe exit and persistent parking",
  );
  record("exited");
  room.send("vehicle");
  await until(() => authority?.state.vehicle === true, "reenter moved car");
  await drive(0, 0, 30, true);
  room.send("vehicle");
  await until(() => authority?.state.vehicle === false, "exit again");
  const result = {
    kind: "isolated real Colyseus SDK/server physics test; not browser/GPU evidence",
    protocol: PROTOCOL_VERSION,
    stages,
    movingExitRejected: true,
    reentry: true,
    notices,
  };
  await writeFile(
    "docs/interaction/driving-sdk.json",
    JSON.stringify(result, null, 2),
  );
  console.log(
    "PASS: isolated SDK entry, W/A/D, moving exit rejection, handbrake, reverse, W recovery, safe exit, persistent reentry.",
  );
} finally {
  if (room) await room.leave().catch(() => {});
  server.kill();
}
