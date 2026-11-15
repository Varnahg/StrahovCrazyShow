/** Exercise the actual Node HTTP/Colyseus runtime; never point at production. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Client, type Room } from "@colyseus/sdk";
// @ts-expect-error The existing JavaScript integration harness has no declarations.
import { createIsolatedIntegrationEnvironment } from "./test-integration.mjs";
import type { NetworkProbeReply } from "../shared/network-diagnostics";
import { PROTOCOL_VERSION } from "../shared/netcode";
import type { PlaybackSummary } from "../shared/production-playback";
import { DEFAULT_PROFILE } from "../shared/types";

const endpoint = "http://127.0.0.1:2568";
const secretMarker = "must-not-reach-ops-log";
async function until(check: () => boolean, label: string, limit = 12_000) {
  const deadline = performance.now() + limit;
  while (!check()) {
    if (performance.now() >= deadline) throw new Error("Timed out: " + label);
    await delay(20);
  }
}

// A TCP check keeps the test from using or shutting down any preexisting process.
const occupied = await new Promise<boolean>((resolve, reject) => {
  const socket = connect(2568, "127.0.0.1");
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", (err: NodeJS.ErrnoException) =>
    err.code === "ECONNREFUSED" ? resolve(false) : reject(err));
});
assert.ok(!occupied, "Integration requires an unused port 2568");

const directory = await mkdtemp(join(tmpdir(), "strahov-integration-feedback-"));
const env: NodeJS.ProcessEnv = {
  ...createIsolatedIntegrationEnvironment(process.env, directory),
  STRAHOV_COMMUNICATION_LOG: "1",
  STRAHOV_LOG_REVISION: "e".repeat(40),
};
for (const key of ["STATIC_DIR", "STRAHOV_WIRE_TRACE_FILE", "STRAHOV_AUTHORITY_TRACE", "DEBUG"]) delete env[key];
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
const closed = once(child, "close");
const events: Array<Record<string, any>> = [];
let stdout = "";
let stderr = "";
let pending = "";
let room: Room | undefined;
child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
  stdout = (stdout + chunk).slice(-65_536);
  pending += chunk;
  const lines = pending.split("\n");
  pending = lines.pop() ?? "";
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      if (event?.v === 1 && typeof event.boot === "string") events.push(event);
    } catch {} // Existing startup/status lines are not structured operational events.
  }
});
child.stderr.setEncoding("utf8").on("data", (chunk: string) =>
  { stderr = (stderr + chunk).slice(-65_536); });
const byEvent = (event: string) => events.filter((row) => row.event === event);
const summary: PlaybackSummary = {
  v: 1, windowMs: 15_120, frames: 912, hitch100: 2, hitch500: 1, maxFrameMs: 550,
  rttSamples: 11, maxRttMs: 551, overlapSamples: 2, incompleteCoverageSamples: 1, timeouts: 1, lastServerTick: null,
  buildId: "sha256-" + "a".repeat(64),
};

try {
  await until(
    () => stdout.includes("Strahov multiplayer: " + endpoint),
    "owned server startup",
  );
  assert.deepEqual(await (await fetch(endpoint + "/api/health")).json(), { ok: true, demo: true });
  assert.deepEqual(await (await fetch(endpoint + "/api/presence")).json(), { online: 0 });
  const disabledAi = await fetch(endpoint + "/api/ai/session?" + secretMarker, {
    method: "POST", headers: { Origin: endpoint, "Content-Type": "application/json" }, body: "{}",
  });
  assert.ok(disabledAi.status >= 400);
  assert.equal((await fetch(endpoint + "/api/session", {
    method: "POST", body: JSON.stringify({ mode: "guest" }),
  })).status, 403);
  const response = await fetch(endpoint + "/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": secretMarker },
    body: JSON.stringify({ mode: "multiplayer", profile: {
      ...DEFAULT_PROFILE, nickname: "LogsTestPrivate",
    } }),
  });
  assert.equal(response.status, 200);
  const session = await response.json() as { id: string; token: string; worldId: string };
  const sdk = new Client(endpoint);
  await assert.rejects(() => sdk.joinById(session.worldId, { token: secretMarker, protocol: PROTOCOL_VERSION }));
  room = await sdk.joinById(session.worldId, { token: session.token, protocol: PROTOCOL_VERSION });
  room.onMessage("*", () => {});
  const replies = new Map<number, NetworkProbeReply>();
  room.onMessage("networkProbe", (reply: NetworkProbeReply) => replies.set(reply.nonce, reply));
  const probe = async (nonce: number, playback?: unknown) => {
    room!.send("networkProbe", { nonce, ...(playback ? { playback } : {}) });
    await until(() => replies.has(nonce), "standard probe reply " + nonce, 3000);
    const reply = replies.get(nonce)!;
    assert.deepEqual(Object.keys(reply).sort(), ["nonce", "serverTick", "serverTimeMs"]);
    assert.ok(Number.isSafeInteger(reply.serverTick));
    await delay(1100); // Existing probe limiter stays enabled.
    return reply;
  };
  room.send("inputs", [{}]); // Recognized but invalid command for the rejection count.
  const first = await probe(1);
  await probe(2, { ...summary, extra: secretMarker });
  assert.equal(byEvent("client.playback").length, 0);
  const valid = { ...summary, lastServerTick: first.serverTick };
  await probe(3, valid);
  await probe(4, valid); // Same reply; the report is throttled independently.
  await room.leave();
  room = undefined;
  const traffic = (pick: (row: Record<string, any>) => number | undefined) =>
    byEvent("traffic.window").reduce((total, row) => total + (pick(row) ?? 0), 0);
  await until(
    () => traffic((row) => row.game?.leaves) >= 1 &&
      traffic((row) => row.game?.inbound?.networkProbe) >= 4,
    "flushed traffic through disconnect", 20_000,
  );
  await until(() => byEvent("ws.close").length > 0, "transport close");

  assert.equal(byEvent("service.start").length, 1);
  assert.equal(byEvent("service.start")[0].revision, env.STRAHOV_LOG_REVISION);
  assert.ok(byEvent("ws.open").length >= 1);
  assert.equal(byEvent("player.join").length, 1);
  assert.equal(byEvent("player.leave").length, 1);
  assert.equal(byEvent("client.playback").length, 1);
  const playback = byEvent("client.playback")[0];
  assert.deepEqual(playback.playback, valid);
  assert.ok(playback.tick >= first.serverTick);
  assert.equal(playback.connection, byEvent("player.join")[0].connection);
  const windows = byEvent("traffic.window");
  assert.ok(traffic((row) => row.webSocket?.authorization?.allowed) >= 1);
  assert.ok(traffic((row) => row.game?.matchmakingAuthorization?.allowed) >= 1);
  assert.ok(traffic((row) => row.game?.authorization?.denied) >= 1);
  assert.ok(traffic((row) => row.game?.authorization?.allowed) >= 1);
  assert.ok(traffic((row) => row.http?.health?.ok) >= 1);
  assert.ok(traffic((row) => row.http?.account?.denied) >= 1);
  assert.ok(windows.some((row) => row.http?.ai?.notFound >= 1 || row.http?.ai?.serverError >= 1));
  assert.ok(traffic((row) => row.game?.inputCommands?.invalid) >= 1);
  assert.ok(traffic((row) => row.webSocket?.originReadBytes) > 0);
  assert.ok(windows.some((row) => row.simulation?.callbacks > 0 && row.eventLoop?.samples > 0));
  for (const row of events) assert.ok(Number.isFinite(Date.parse(row.time)));
  const serialized = JSON.stringify(events);
  for (const value of [secretMarker, "LogsTestPrivate", session.token, session.id, session.worldId])
    assert.ok(value && !serialized.includes(value), "diagnostic logs must not contain private input or IDs");
  console.log("Verified real HTTP, WebSocket lifecycle and authorization, legacy and invalid probes, one bounded playback report and redaction.");
} catch (error) {
  console.error(stdout, stderr);
  throw error;
} finally {
  try {
    if (room) await room.leave();
  } finally {
    child.kill();
    await closed;
    await rm(directory, { recursive: true, force: true });
  }
}
