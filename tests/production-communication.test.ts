import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Writable } from "node:stream";
import test from "node:test";
import type { PlaybackSummary } from "../shared/production-playback";
import { classifyHttpRoute, ProductionCommunication } from "../server/production-communication";

const summary: PlaybackSummary = {
  v: 1, windowMs: 15_000, frames: 700, hitch100: 2, hitch500: 1, maxFrameMs: 503,
  rttSamples: 10, maxRttMs: 305, overlapSamples: 2, incompleteCoverageSamples: 1, timeouts: 1,
  lastServerTick: 1500, buildId: null,
};

function setup(revision = "aabbccd") {
  const lines: string[] = [];
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  let now = 0;
  const log = new ProductionCommunication(revision, sink, () => now);
  return {
    log,
    lines,
    records: () => lines.map(line => JSON.parse(line)),
    advance: (delta: number) => { now += delta; },
  };
}

function peer() {
  return Object.assign(new EventEmitter(), { bufferedAmount: 0 });
}

function observeResponse(log: ProductionCommunication, url: string, statusCode: number, writableFinished: boolean) {
  const request = { url } as IncomingMessage;
  const response = Object.assign(new EventEmitter(), { statusCode, writableFinished });
  log.observeHttp(request, response as unknown as ServerResponse);
  return response;
}

test("HTTP groups and results are fixed, including a response closed before completion", t => {
  const { log, lines, records, advance } = setup("unknown-build-secret");
  log.start();
  t.after(() => log.stop());
  const oauth = observeResponse(log, "/api/auth/google/callback?code=private-secret", 302, true);
  const matchmake = observeResponse(log, "/matchmake/joinById/private-room-id", 401, true);
  const ai = observeResponse(log, "/api/ai/respond", 429, true);
  const asset = observeResponse(log, "/models/missing.glb", 200, false);
  const health = observeResponse(log, "/api/health", 200, true);
  const failure = observeResponse(log, "/api/weather", 503, true);
  advance(122.5);
  for (const response of [oauth, matchmake, ai, asset, health, failure]) {
    response.emit("finish");
    response.emit("close");
  }
  log.flush();
  const [, window] = records();
  assert.equal(window.v, 1);
  assert.match(window.boot, /^[0-9a-f-]{36}$/);
  assert.equal(new Date(window.time).toISOString(), window.time);
  assert.equal(window.level, "warn");
  assert.equal(window.event, "traffic.window");
  assert.equal(window.http.account.redirect, 1);
  assert.equal(window.http.matchmaking.denied, 1);
  assert.equal(window.http.ai.rateLimited, 1);
  assert.equal(window.http.asset.aborted, 1);
  assert.equal(window.http.asset.ok, 0);
  assert.equal(window.http.health.ok, 1);
  assert.equal(window.http.weather.serverError, 1);
  assert.equal(window.http.weather.maxMs, 122.5);
  assert.equal(classifyHttpRoute("/api/ai?token=private"), "ai");
  assert.equal(classifyHttpRoute("/a-new-path?sensitive=1"), "other");
  assert.equal(classifyHttpRoute("/api/health/private"), "other");
  assert.doesNotMatch(lines.join(""), /private-secret|private-room-id|missing\.glb|unknown-build-secret/);
});

test("one anonymous id links transport, player, and accepted client windows", t => {
  const { log, lines, records, advance } = setup();
  log.start();
  t.after(() => log.stop());
  const ws = peer();
  const socket = { bytesRead: 100, bytesWritten: 20 };
  log.upgradeAuthorization("allowed", 2);
  log.upgradeAuthorization("denied", 1);
  log.gameAuthorization("matchmakingAuthorization", "allowed", 3);
  log.gameAuthorization("authorization", "allowed", 4);
  log.gameAuthorization("authorization", "denied", 2);
  log.open(ws, socket);
  log.playback(ws, 1501, summary);
  log.playerJoin(ws);
  log.playback(ws, 1501, { ...summary, rawChat: "never-log-this" });
  log.playback(ws, 1499, summary);
  log.playback(ws, 1501, summary);
  advance(14_499);
  log.playback(ws, 1501, summary);
  advance(1);
  log.playback(ws, 1501, summary);
  log.received("input");
  log.received("networkProbe");
  log.input("accepted");
  log.input("late");
  log.inputRateDrop();
  log.probeReply();
  log.motionBroadcast(3);
  log.authority("server-clock-drop");
  log.simulation(1501, 8, 400, 15, 250);
  socket.bytesRead += 1_000;
  socket.bytesWritten += 2_000;
  ws.bufferedAmount = 88;
  ws.emit("close", 1006, "never-log-this");
  // The transport listener runs before Colyseus invokes onLeave.
  log.playerLeave(ws, 1006);
  log.accountStorageFailure();
  log.flush();
  const entries = records();
  assert.deepEqual(entries.map(record => record.event), [
    "service.start", "ws.open", "player.join", "client.playback", "client.playback",
    "ws.close", "player.leave", "traffic.window",
  ]);
  for (const entry of entries.slice(1, -1)) assert.equal(entry.connection, 1);
  assert.deepEqual(entries[3].playback, summary);
  assert.equal(entries[3].tick, 1501);
  assert.equal(entries[5].code, 1006);
  const window = entries.at(-1);
  assert.equal(window.revision, "aabbccd");
  assert.deepEqual(window.webSocket.authorization, { allowed: 1, denied: 1, error: 0 });
  assert.equal(window.webSocket.active, 0);
  assert.equal(window.webSocket.abnormalCloses, 1);
  assert.equal(window.webSocket.originReadBytes, 1_000);
  assert.equal(window.webSocket.originWrittenBytes, 2_000);
  assert.equal(window.webSocket.sampledMaxBufferedBytes, 88);
  assert.equal(window.players, 0);
  assert.equal(window.game.joins, 1);
  assert.equal(window.game.leaves, 1);
  assert.deepEqual(window.game.matchmakingAuthorization, { allowed: 1, denied: 0, error: 0, maxMs: 3 });
  assert.deepEqual(window.game.authorization, { allowed: 1, denied: 1, error: 0, maxMs: 4 });
  assert.equal(window.game.inputCommands.accepted, 1);
  assert.equal(window.game.inputCommands.late, 1);
  assert.equal(window.game.inputRateDrops, 1);
  assert.equal(window.game.probeReplies, 1);
  assert.equal(window.game.motionRecipients, 3);
  assert.equal(window.game.resyncSends["server-clock-drop"], 1);
  assert.deepEqual(window.simulation, {
    callbacks: 1, steps: 8, gapMaxMs: 400, gapMaxTick: 1501, workMaxMs: 15,
    droppedMs: 250, clockDrops: 1, lastClockDropTick: 1501,
  });
  assert.equal(window.omitted.invalidPlayback, 2);
  assert.equal(window.omitted.playback, 1);
  assert.equal(window.service.accountStorageErrors, 1);
  assert.doesNotMatch(lines.join(""), /never-log-this/);
});

test("rapid connection churn and client reports retain totals within detail budgets", t => {
  const { log, records, advance } = setup();
  log.start();
  t.after(() => log.stop());
  for (let i = 0; i < 125; i++) {
    const ws = peer();
    log.open(ws, { bytesRead: 0, bytesWritten: 0 });
    log.playerJoin(ws);
    log.playback(ws, 1501, summary);
    log.playerLeave(ws, 1000);
    ws.emit("close", 1000);
  }
  advance(15_000);
  log.flush();
  const entries = records();
  assert.equal(entries.length, 242);
  assert.equal(entries.filter(record => record.event === "client.playback").length, 120);
  const window = entries.at(-1);
  assert.equal(window.webSocket.opens, 125);
  assert.equal(window.webSocket.closes, 125);
  assert.equal(window.omitted.details, 380);
  assert.equal(window.omitted.playback, 5);
});

test("a stalled output skips logs without queuing or interrupting measurements", async t => {
  const lines: string[] = [];
  let release: (() => void) | undefined;
  let stalled = true;
  const sink = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      if (stalled) release = callback;
      else callback();
    },
  });
  const log = new ProductionCommunication(undefined, sink);
  log.start();
  t.after(() => log.stop());
  const firstLineLength = sink.writableLength;
  log.upgradeAuthorization("denied", 1);
  log.flush();
  const ws = peer();
  log.open(ws, { bytesRead: 0, bytesWritten: 0 });
  assert.equal(lines.length, 1);
  assert.equal(sink.writableLength, firstLineLength);
  const drained = once(sink, "drain");
  stalled = false;
  release!();
  await drained;
  log.flush();
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).omitted.output, 2);
  assert.equal(JSON.parse(lines[1]).webSocket.opens, 1);
});

test("framework and shutdown failures are visible before the next traffic window", t => {
  const { log, lines, records } = setup();
  log.start();
  t.after(() => log.stop());
  const libraryError: (...values: unknown[]) => void = log.libraryLogger.error;
  for (let i = 0; i < 8; i++) libraryError(new Error("never-log-this"));
  assert.deepEqual(records().map(record => record.event), [
    "service.start", "library.error", "library.error", "library.error", "library.error",
  ]);
  log.stop("before-shutdown-error");
  const entries = records();
  assert.equal(entries[5].event, "service.shutdown.error");
  assert.equal(entries[5].level, "error");
  assert.equal(entries[5].outcome, "before-shutdown-error");
  assert.equal(entries[6].event, "traffic.window");
  assert.equal(entries[6].library.error, 8);
  assert.equal(entries[6].service.shutdownErrors, 1);
  assert.equal(entries[7].event, "service.stop");
  assert.doesNotMatch(lines.join(""), /never-log-this/);
});
