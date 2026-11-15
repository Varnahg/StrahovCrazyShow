import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { monitorEventLoopDelay } from "node:perf_hooks";
import type { Writable } from "node:stream";
import { WebSocketTransport } from "@colyseus/ws-transport";
import type { TimelinePushResult } from "../shared/input-timeline";
import type { ResyncReason } from "../shared/network-diagnostics";
import { PLAYBACK_INTERVAL_MS, readPlaybackSummary } from "../shared/production-playback";

const WINDOW_MS = 15_000;
const DETAIL_LIMIT = 120;
const PLAYBACK_LIMIT = 120;
const LIBRARY_ERROR_LIMIT = 4;
const PLAYBACK_SERVER_INTERVAL_MS = PLAYBACK_INTERVAL_MS - 500;
const LOG_SCHEMA = 1;

type Event =
  | "service.start" | "service.stop" | "traffic.window" | "ws.open" | "ws.close"
  | "player.join" | "player.leave" | "client.playback" | "library.error" | "service.shutdown.error";
type ShutdownOutcome = "normal" | "before-shutdown-error" | "shutdown-error";
type GameMessage =
  | "input" | "inputs" | "doorRequest" | "doorResync" | "resync" | "networkProbe"
  | "motionResync" | "profile" | "chat" | "contact" | "decline" | "block"
  | "attend" | "saveEvent" | "cancelEvent" | "emote" | "vehicle" | "respawn"
  | "find" | "quizStart" | "quizAnswer";
type HttpRoute =
  | "health" | "weather" | "presence" | "events" | "account" | "matchmaking"
  | "ai" | "feedback" | "page" | "asset" | "other";
type AuthOutcome = "allowed" | "denied" | "error";
type HttpOutcome = "ok" | "redirect" | "denied" | "notFound" | "rateLimited"
  | "clientError" | "serverError" | "aborted";
type HttpStats = Record<HttpOutcome, number> & { maxMs: number };
type Socket = Pick<IncomingMessage["socket"], "bytesRead" | "bytesWritten">;
type WebSocketPeer = {
  readonly bufferedAmount: number;
  once(event: "close", listener: (code: number) => void): unknown;
};
type LogSink = Pick<Writable, "writable" | "writableNeedDrain" | "write" | "on">;
type Connection = {
  readonly id: number;
  readonly openedAt: number;
  readonly socket: Socket;
  lastRead: number;
  lastWritten: number;
  joinedAt?: number;
  lastPlaybackAt?: number;
};

export function classifyHttpRoute(url: string | undefined): HttpRoute {
  const query = url?.indexOf("?") ?? -1;
  const path = query === -1 ? url : url?.slice(0, query);
  if (path === "/api/health") return "health";
  if (path === "/api/weather") return "weather";
  if (path === "/api/presence") return "presence";
  if (path === "/api/demo-events") return "events";
  if (path === "/api/session" || path?.startsWith("/api/auth/") || path?.startsWith("/api/account/"))
    return "account";
  if (path?.startsWith("/matchmake/")) return "matchmaking";
  if (path === "/api/ai" || path?.startsWith("/api/ai/")) return "ai";
  if (path === "/api/feedback") return "feedback";
  if (path === "/" || path === "/index.html" || path === "/privacy.html" || path === "/terms.html")
    return "page";
  if (path?.startsWith("/assets/") || path?.startsWith("/models/") ||
      path?.startsWith("/textures/") || path?.startsWith("/data/") ||
      path?.startsWith("/fonts/") || path?.startsWith("/journal/") ||
      path?.startsWith("/tools/") || path?.startsWith("/ui/"))
    return "asset";
  return "other";
}

function httpOutcome(status: number, complete: boolean): HttpOutcome {
  if (!complete) return "aborted";
  if (status >= 500) return "serverError";
  if (status === 429) return "rateLimited";
  if (status === 404) return "notFound";
  if (status === 401 || status === 403) return "denied";
  if (status >= 400) return "clientError";
  if (status >= 300 && status !== 304) return "redirect";
  return "ok";
}

function emptyWindow() {
  return {
    http: {} as Partial<Record<HttpRoute, HttpStats>>,
    webSocket: {
      authorization: { allowed: 0, denied: 0, error: 0 },
      authMaxMs: 0,
      opens: 0,
      closes: 0,
      abnormalCloses: 0,
      originReadBytes: 0,
      originWrittenBytes: 0,
      sampledMaxBufferedBytes: 0,
    },
    game: {
      joins: 0,
      leaves: 0,
      authorization: { allowed: 0, denied: 0, error: 0, maxMs: 0 },
      matchmakingAuthorization: { allowed: 0, denied: 0, error: 0, maxMs: 0 },
      inbound: {} as Partial<Record<GameMessage, number>>,
      inputCommands: { accepted: 0, invalid: 0, epoch: 0, late: 0, ahead: 0, duplicate: 0 },
      inputRateDrops: 0,
      probeReplies: 0,
      motionBroadcasts: 0,
      motionRecipients: 0,
      authoritySends: 0,
      resyncSends: {} as Partial<Record<ResyncReason, number>>,
    },
    simulation: {
      callbacks: 0, steps: 0, gapMaxMs: 0, gapMaxTick: null as number | null,
      workMaxMs: 0, droppedMs: 0, clockDrops: 0, lastClockDropTick: null as number | null,
    },
    service: { accountStorageErrors: 0, shutdownErrors: 0 },
    library: { warn: 0, error: 0 },
    omitted: { details: 0, playback: 0, invalidPlayback: 0 },
  };
}

const ms = (value: number) => Math.round(value * 100) / 100;
const closeCode = (code?: number) =>
  code !== undefined && Number.isInteger(code) && code >= 1000 && code <= 4999 ? code : null;

export class ProductionCommunication {
  private readonly boot = randomUUID();
  private readonly revision?: string;
  private readonly loop = monitorEventLoopDelay({ resolution: 10 });
  private readonly sockets = new Set<WebSocketPeer>();
  // A raw close may precede the room's leave callback. Keep the metadata
  // weakly reachable for that callback after removing the socket from sampling.
  private readonly connections = new WeakMap<object, Connection>();
  private window = emptyWindow();
  private windowStartedAt = 0;
  private interval?: NodeJS.Timeout;
  private connectedPlayers = 0;
  private sequence = 0;
  private detailCount = 0;
  private playbackCount = 0;
  private droppedOutput = 0;
  private sinkFailed = false;
  private tick = 0;

  // Colyseus error arguments can contain arbitrary values or stack/message text.
  readonly libraryLogger = {
    debug() {},
    trace() {},
    info() {},
    warn: () => { this.window.library.warn++; },
    error: () => {
      const errors = ++this.window.library.error;
      if (errors <= LIBRARY_ERROR_LIMIT) this.write("library.error", {}, "error");
    },
  };

  constructor(
    revision: string | undefined,
    private readonly sink: LogSink = process.stdout,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.revision = revision && /^[0-9a-f]{7,64}$/.test(revision) ? revision : undefined;
    this.sink.on("error", () => { this.sinkFailed = true; });
  }

  start() {
    if (this.interval) return;
    this.windowStartedAt = this.now();
    this.loop.enable();
    this.interval = setInterval(() => this.flush(), WINDOW_MS).unref();
    this.write("service.start", {});
  }

  stop(outcome: ShutdownOutcome = "normal") {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = undefined;
    if (outcome !== "normal") {
      this.window.service.shutdownErrors++;
      this.write("service.shutdown.error", { outcome }, "error");
    }
    this.flush();
    this.loop.disable();
    this.write("service.stop", { tick: this.tick, outcome }, outcome === "normal" ? "info" : "error");
  }

  observeHttp = (req: IncomingMessage, res: ServerResponse) => {
    const route = classifyHttpRoute(req.url);
    const start = this.now();
    // ServerResponse emits close for completed and interrupted responses.
    res.once("close", () => {
      const stats = this.window.http[route] ??= {
        ok: 0, redirect: 0, denied: 0, notFound: 0, rateLimited: 0,
        clientError: 0, serverError: 0, aborted: 0, maxMs: 0,
      };
      stats[httpOutcome(res.statusCode, res.writableFinished)]++;
      stats.maxMs = Math.max(stats.maxMs, ms(this.now() - start));
    });
  };

  upgradeAuthorization(outcome: AuthOutcome, elapsedMs: number) {
    const webSocket = this.window.webSocket;
    webSocket.authorization[outcome]++;
    webSocket.authMaxMs = Math.max(webSocket.authMaxMs, ms(elapsedMs));
  }

  gameAuthorization(
    phase: "authorization" | "matchmakingAuthorization",
    outcome: AuthOutcome,
    elapsedMs: number,
  ) {
    const authorization = this.window.game[phase];
    authorization[outcome]++;
    authorization.maxMs = Math.max(authorization.maxMs, ms(elapsedMs));
  }

  open(peer: WebSocketPeer, socket: Socket) {
    const connection = {
      id: ++this.sequence, openedAt: this.now(), socket,
      lastRead: socket.bytesRead, lastWritten: socket.bytesWritten,
    };
    this.connections.set(peer, connection);
    this.sockets.add(peer);
    this.window.webSocket.opens++;
    this.detail("ws.open", { connection: connection.id });
    peer.once("close", code => {
      this.sampleSocket(peer, connection);
      this.sockets.delete(peer);
      const webSocket = this.window.webSocket;
      webSocket.closes++;
      if (code === 1006) webSocket.abnormalCloses++;
      this.detail("ws.close", {
        connection: connection.id, code: closeCode(code),
        durationMs: ms(this.now() - connection.openedAt),
      });
    });
  }

  playerJoin(peer: object) {
    const connection = this.connections.get(peer);
    if (!connection || connection.joinedAt !== undefined) return;
    connection.joinedAt = this.now();
    this.connectedPlayers++;
    this.window.game.joins++;
    this.detail("player.join", { connection: connection.id, tick: this.tick });
  }

  playerLeave(peer: object, code?: number) {
    const connection = this.connections.get(peer);
    if (connection?.joinedAt === undefined) return;
    this.connectedPlayers--;
    this.window.game.leaves++;
    this.detail("player.leave", {
      connection: connection.id, tick: this.tick, code: closeCode(code),
      durationMs: ms(this.now() - connection.joinedAt),
    });
    connection.joinedAt = undefined;
  }

  received(message: GameMessage) {
    const inbound = this.window.game.inbound;
    inbound[message] = (inbound[message] ?? 0) + 1;
  }

  input(result: TimelinePushResult) { this.window.game.inputCommands[result]++; }
  inputRateDrop() { this.window.game.inputRateDrops++; }
  probeReply() { this.window.game.probeReplies++; }
  accountStorageFailure() { this.window.service.accountStorageErrors++; }

  motionBroadcast(recipients: number) {
    this.window.game.motionBroadcasts++;
    this.window.game.motionRecipients += recipients;
  }

  authority(reason?: ResyncReason) {
    const game = this.window.game;
    game.authoritySends++;
    if (reason) game.resyncSends[reason] = (game.resyncSends[reason] ?? 0) + 1;
  }

  simulation(tick: number, steps: number, gapMs: number, workMs: number, droppedMs: number) {
    this.tick = tick;
    const simulation = this.window.simulation;
    simulation.callbacks++;
    simulation.steps += steps;
    if (gapMs > simulation.gapMaxMs) {
      simulation.gapMaxMs = gapMs;
      simulation.gapMaxTick = tick;
    }
    simulation.workMaxMs = Math.max(simulation.workMaxMs, workMs);
    if (droppedMs > 0) {
      simulation.clockDrops++;
      simulation.droppedMs += droppedMs;
      simulation.lastClockDropTick = tick;
    }
  }

  playback(peer: object, tick: number, value: unknown) {
    if (value === undefined) return;
    const connection = this.connections.get(peer);
    if (connection?.joinedAt === undefined) return;
    const now = this.now();
    const omitted = this.window.omitted;
    if ((connection.lastPlaybackAt !== undefined &&
        now - connection.lastPlaybackAt < PLAYBACK_SERVER_INTERVAL_MS) ||
        this.playbackCount >= PLAYBACK_LIMIT) {
      omitted.playback++;
      return;
    }
    const playback = readPlaybackSummary(value);
    if (!playback || (playback.lastServerTick !== null && playback.lastServerTick > tick)) {
      omitted.invalidPlayback++;
      return;
    }
    connection.lastPlaybackAt = now;
    this.playbackCount++;
    this.write("client.playback", { connection: connection.id, tick, playback });
  }

  flush() {
    const now = this.now();
    for (const peer of this.sockets) this.sampleSocket(peer, this.connections.get(peer)!);
    const windowMs = ms(now - this.windowStartedAt);
    const eventLoop = this.loop.count ? {
      samples: this.loop.count,
      p95Ms: ms(this.loop.percentile(95) / 1e6),
      maxMs: ms(this.loop.max / 1e6),
    } : { samples: 0, p95Ms: null, maxMs: null };
    const { simulation, omitted, library, webSocket, ...rest } = this.window;
    const severity = library.error || webSocket.authorization.error || simulation.clockDrops ||
      rest.service.accountStorageErrors || rest.service.shutdownErrors ||
      rest.game.authorization.error || rest.game.matchmakingAuthorization.error ||
      Object.values(rest.http).some(stats => stats?.serverError) ? "warn" : "info";
    if (this.write("traffic.window", {
      ...rest,
      webSocket: { ...webSocket, active: this.sockets.size },
      simulation: {
        ...simulation, gapMaxMs: ms(simulation.gapMaxMs), workMaxMs: ms(simulation.workMaxMs),
        droppedMs: ms(simulation.droppedMs),
      },
      eventLoop, library, omitted: { ...omitted, output: this.droppedOutput },
      windowMs, tick: this.tick, players: this.connectedPlayers,
    }, severity)) this.droppedOutput = 0;
    this.window = emptyWindow();
    this.windowStartedAt = now;
    this.loop.reset();
    this.detailCount = 0;
    this.playbackCount = 0;
  }

  private sampleSocket(peer: WebSocketPeer, connection: Connection) {
    const { bytesRead, bytesWritten } = connection.socket;
    const stats = this.window.webSocket;
    stats.originReadBytes += Math.max(0, bytesRead - connection.lastRead);
    stats.originWrittenBytes += Math.max(0, bytesWritten - connection.lastWritten);
    stats.sampledMaxBufferedBytes = Math.max(stats.sampledMaxBufferedBytes, peer.bufferedAmount);
    connection.lastRead = bytesRead;
    connection.lastWritten = bytesWritten;
  }

  private detail(event: Event, fields: object) {
    if (this.detailCount >= DETAIL_LIMIT) {
      this.window.omitted.details++;
      return;
    }
    this.detailCount++;
    this.write(event, fields);
  }

  private write(event: Event, fields: object, level: "info" | "warn" | "error" = "info") {
    if (!this.sinkFailed && this.sink.writable && !this.sink.writableNeedDrain) {
      try {
        // If write applies backpressure, this line was accepted. Skip subsequent
        // records while the stream needs to drain so diagnostics build no queue.
        this.sink.write(JSON.stringify({
          v: LOG_SCHEMA, time: new Date().toISOString(), level, event,
          boot: this.boot, revision: this.revision, ...fields,
        }) + "\n");
        return true;
      } catch {
        this.sinkFailed = true;
      }
    }
    this.droppedOutput++;
    return false;
  }
}

export class ObservedWebSocketTransport extends WebSocketTransport {
  constructor(options: ConstructorParameters<typeof WebSocketTransport>[0], production: ProductionCommunication) {
    super(options);
    // Observe the accepted socket before Colyseus can complete a room join.
    this.wss.prependListener("connection", (peer, req) => production.open(peer, req.socket));
  }
}

export type { AuthOutcome, GameMessage };
