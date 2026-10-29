import { randomBytes, randomUUID } from "node:crypto";
import { Server, Room, matchMaker, type Client } from "@colyseus/core";
import { WebSocketTransport } from "@colyseus/ws-transport";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { Community } from "./community";
import {
  consumeRate,
  expireSessions,
  pruneRateWindows,
  SESSION_RECONNECT_TTL_MS,
  SESSION_ISSUE_WINDOW_MS,
  MAX_SESSION_ISSUE_ADDRESSES,
} from "./session-lifecycle";
import { sanitizeProfile, cleanText } from "../shared/profile";
import { initPhysics, Simulation } from "../shared/simulation";
import { SPAWN } from "../shared/world";
import { groundHeight } from "../shared/terrain";
import { vehicleExitAllowed } from "../shared/vehicle";
import { makeDemoEvents, dateKey } from "../shared/events";
import type { Player, Profile } from "../shared/types";
import { getWeather } from "./weather";
import { createLocalBenchmarkHandler } from "./local-benchmarks";
import { createSessionDiagnosticsHandler } from "./session-diagnostics";
import { respawnServerPlayer, synchronizePlayer } from "./respawn";
import { MotionEncoder } from "../shared/motion-codec";
import {
  TimelineInputQueue,
  TimelineSimulationClock,
} from "../shared/input-timeline";
import {
  NetworkClockTiming,
  networkProbeNonce,
  networkProbeReply,
} from "../shared/network-diagnostics";
import {
  PROTOCOL_VERSION,
  SIM_HZ,
  type ActorState,
  type Authority,
  type MotionPacket,
} from "../shared/netcode";
const sessions = new Map<
  string,
  { id: string; profile: Profile; expires: number; savedState?: ActorState }
>();
const issueRates = new Map<string, number[]>();
let worldId = "";
let singletonRoomId: string | undefined;
const store = new Community();
await initPhysics();
class StrahovRoom extends Room {
  autoDispose = false;
  // Inputs arrive in 30 packets/s; this cap also bounds otherwise unknown messages.
  maxMessagesPerSecond = 150;
  motionEncoder = new MotionEncoder();
  sim = new Simulation();
  inputQueues = new Map<string, TimelineInputQueue>();
  connections = new Map<string, Client>();
  simulationClock = new TimelineSimulationClock(Date.now());
  nextInputEpoch = 0;
  networkClockTiming = new NetworkClockTiming();
  lastSimulationTime = performance.now();
  motionAccumulator = 0;
  day = dateKey(Date.now());
  get carPosition() {
    const p = this.sim.car.position;
    return { x: p.x, y: p.y + 0.8, z: p.z };
  }
  get carYaw() {
    const q = this.sim.car.rotation;
    return Math.atan2(
      2 * (q.w * q.y + q.x * q.z),
      1 - 2 * (q.y * q.y + q.x * q.x),
    );
  }
  emoteExpiry = new Map<string, number>();
  onCreate() {
    if (singletonRoomId)
      throw new Error(
        "Demo používá jediný společný svět. Připoj se k existující instanci.",
      );
    singletonRoomId = this.roomId;
    const receiveInputs = (c: Client, raws: unknown[]) => {
      if (!store.rate(c.auth.id, "input-packet", 90, 1000)) return;
      const queue = this.inputQueues.get(c.auth.id);
      if (!queue) return;
      const receivedAt = performance.now();
      // V11 rejects expired/malformed/foreign-epoch commands. A hole is a
      // neutral future tick, never a reason to replay old time or reset a peer.
      for (const raw of raws.slice(0, 8)) queue.push(raw, receivedAt);
    };
    this.onMessage("input", (c, raw) => receiveInputs(c, [raw]));
    this.onMessage("inputs", (c, raw) => {
      if (Array.isArray(raw)) receiveInputs(c, raw);
    });
    this.onMessage("resync", (c) => {
      if (store.rate(c.auth.id, "resync", 2, 1000)) {
        const queue = this.inputQueues.get(c.auth.id);
        if (!queue) return;
        this.resetInputEpoch(c.auth.id, queue);
        this.sendAuthority(c, true, "client-request");
      }
    });
    this.onMessage("networkProbe", (c, raw: unknown) => {
      const nonce = networkProbeNonce(raw);
      if (
        nonce === null ||
        this.connections.get(c.auth.id) !== c ||
        !this.inputQueues.has(c.auth.id) ||
        !store.rate(c.auth.id, "network-probe", 1, 1000)
      )
        return;
      const reply = networkProbeReply(
        nonce,
        this.simulationClock.tick,
        Date.now(),
      );
      if (reply) c.send("networkProbe", reply);
    });
    this.onMessage("motionResync", (c) => {
      if (store.rate(c.auth.id, "motion-resync", 2, 1000))
        this.sendMotionKeyframe(c);
    });
    this.onMessage("profile", (c, p) =>
      this.safe(c, () => {
        if (!store.rate(c.auth.id, "profile", 5, 1000)) return;
        const profile = sanitizeProfile(p);
        if (
          JSON.stringify(sessions.get(c.auth.token)!.profile) ===
          JSON.stringify(profile)
        )
          return;
        Object.assign(store.players.get(c.auth.id)!, profile);
        sessions.get(c.auth.token)!.profile = profile;
        this.broadcastPresence();
      }),
    );
    this.onMessage("chat", (c, data) =>
      this.safe(c, () => {
        const { message, recipients } = store.chat(
          c.auth.id,
          data?.channel,
          data?.text,
        );
        for (const id of recipients)
          this.connections.get(id)?.send("chat", message);
      }),
    );
    this.onMessage("contact", (c, d) =>
      this.safe(c, () => {
        const to = cleanText(d?.to, 80);
        if (store.contact(c.auth.id, to, d?.accept === true))
          this.syncSocial([c.auth.id, to]);
      }),
    );
    this.onMessage("decline", (c, d) =>
      this.safe(c, () => {
        if (store.decline(c.auth.id, cleanText(d?.to, 80)))
          this.syncSocial([c.auth.id]);
      }),
    );
    this.onMessage("block", (c, d) =>
      this.safe(c, () => {
        const to = cleanText(d?.to, 80);
        if (store.block(c.auth.id, to, d?.enabled !== false))
          this.syncSocial([c.auth.id, to]);
      }),
    );
    this.onMessage("attend", (c, d) =>
      this.safe(c, () => {
        if (
          store.attend(
            c.auth.id,
            cleanText(d?.eventId, 80),
            d?.enabled === true,
            d?.company === true,
          )
        )
          this.syncSocial();
      }),
    );
    this.onMessage("saveEvent", (c, d) =>
      this.safe(c, () => {
        if (store.saveEventChange(c.auth.id, d).changed)
          this.broadcast("events", store.events);
      }),
    );
    this.onMessage("cancelEvent", (c, d) =>
      this.safe(c, () => {
        if (store.cancelEvent(c.auth.id, cleanText(d?.id, 80)))
          this.broadcast("events", store.events);
      }),
    );
    this.onMessage("emote", (c, d) => {
      if (!store.rate(c.auth.id, "emote", 5, 10000)) return;
      const p = store.players.get(c.auth.id)!;
      p.emote = ["👋", "❤️", "🎉", "👍"].includes(d) ? d : "👋";
      this.emoteExpiry.set(p.id, Date.now() + 3500);
      this.broadcast("emote", { id: p.id, emote: p.emote });
    });
    this.onMessage("vehicle", (c) =>
      this.safe(c, () => {
        const p = store.players.get(c.auth.id)!,
          a = this.sim.actors.get(p.id)!;
        if (!a.vehicle && p.zone !== "outside")
          throw new Error("Auto je dostupné pouze venku.");
        if (
          !a.vehicle &&
          Math.hypot(p.x - this.carPosition.x, p.z - this.carPosition.z) > 5
        )
          throw new Error("Dojdi k autu.");
        if (a.vehicle) {
          if (!vehicleExitAllowed(a.speed))
            throw new Error("Nejdřív zastav auto.");
          const exit = this.sim.exitPosition(a);
          if (!exit)
            throw new Error("Vedle auta není bezpečné místo k vystoupení.");
          a.setVehicle(false);
          a.setPosition(exit);
        } else {
          if ([...this.sim.actors.values()].some((q) => q.vehicle))
            throw new Error("Auto právě používá jiný hráč.");
          a.setVehicle(true);
        }
        p.vehicle = a.vehicle;
        this.broadcast("car", {
          ...this.carPosition,
          yaw: this.carYaw,
          parked: !a.vehicle,
          state: this.sim.car.capture(),
        });
        this.broadcastPresence();
      }),
    );
    this.onMessage("respawn", (c) =>
      this.safe(c, () => {
        const player = store.players.get(c.auth.id),
          queue = this.inputQueues.get(c.auth.id);
        if (!player || !queue) return;
        const recovery = respawnServerPlayer(this.sim, player, queue, {
          inputEpoch: ++this.nextInputEpoch,
          tick: this.simulationClock.tick,
          time: this.simulationClock.time,
        });
        if (!recovery) return;
        recovery.authority.resyncReason = "respawn";
        recovery.authority.network = this.captureNetworkDiagnostics(queue);
        // Send immediately, even if the next motion tick has not occurred.
        c.send("authoritative", recovery.authority);
        if (recovery.carRecovered)
          this.broadcast("car", {
            ...this.carPosition,
            yaw: this.carYaw,
            parked: this.sim.car.parked,
            state: this.sim.car.capture(),
          });
        this.broadcastPresence();
      }),
    );
    this.onMessage("find", (c, d) =>
      this.safe(c, () => {
        const result = store.findChange(c.auth.id, Number(d));
        if (result.completed)
          for (const client of this.clients)
            client.send("reward", "Průzkumník kopce");
        if (result.changed) this.broadcast("activity", store.activity);
      }),
    );
    this.onMessage("quizStart", (c, d) =>
      this.safe(c, () => {
        if (store.startQuiz(c.auth.id, d))
          this.broadcast("activity", store.activity);
      }),
    );
    this.onMessage("quizAnswer", (c, d) =>
      this.safe(c, () => {
        if (store.answer(c.auth.id, Number(d)))
          this.broadcast("activity", store.activity);
      }),
    );
    this.setSimulationInterval(() => {
      const now = performance.now(),
        elapsed = (now - this.lastSimulationTime) / 1000;
      this.lastSimulationTime = now;
      for (const [id, until] of this.emoteExpiry)
        if (Date.now() >= until) {
          this.emoteExpiry.delete(id);
          const p = store.players.get(id);
          if (p) {
            p.emote = "";
            this.broadcast("emote", { id, emote: "" });
          }
        }
      const result = this.simulationClock.advance(
        elapsed,
        (dt, tick, time) => {
          for (const [id, a] of this.sim.actors) {
            const queue = this.inputQueues.get(id)!,
              input = queue.consume(tick, {
                vehicle: a.vehicle,
                yaw: a.yaw,
              }).input;
            a.step(input, dt);
            store.players.get(id)!.ack = queue.ack;
          }
          this.sim.tick(time);
        },
        (plan) => {
          if (plan.dropped > 0)
            for (const queue of this.inputQueues.values())
              queue.discardPending();
        },
      );
      for (const [id, a] of this.sim.actors) {
        const p = store.players.get(id)!;
        synchronizePlayer(p, a);
      }
      if (store.tick()) {
        this.broadcast("activity", store.activity);
        if (!store.activity.quiz.running)
          for (const c of this.clients) c.send("reward", "Kvízový nadšenec");
      }
      if (result.dropped > 0)
        for (const [id, queue] of this.inputQueues)
          this.resetInputEpoch(id, queue);
      this.networkClockTiming.record({
        elapsedMs: elapsed * 1000,
        cpuMs: performance.now() - now,
        steps: result.steps,
        droppedMs: result.dropped * 1000,
        accumulatorMs: Math.max(0, this.simulationClock.accumulator * 1000),
      });
      this.motionAccumulator += elapsed;
      if (this.motionAccumulator >= 1 / 20) {
        this.motionAccumulator %= 1 / 20;
        if (this.clients.length)
          this.broadcast(
            "motion",
            this.motionEncoder.encode(this.captureMotion()),
          );
        for (const c of this.clients)
          this.sendAuthority(
            c,
            result.dropped > 0,
            result.dropped > 0 ? "server-clock-drop" : undefined,
          );
      }
    }, 1000 / SIM_HZ);
    this.clock.setInterval(() => {
      const key = dateKey(Date.now());
      if (key !== this.day) {
        this.day = key;
        store.events = [
          ...makeDemoEvents(),
          ...store.events.filter(
            (e) => e.owner && e.endsAt > Date.now() - 86400000,
          ),
        ];
        this.broadcast("events", store.events);
        if (store.pruneAttendance()) this.syncSocial();
      }
      const changes = store.forgetIdentities(
        expireSessions(sessions, this.connections),
      );
      if (changes.social) this.syncSocial();
      if (changes.activity) this.broadcast("activity", store.activity);
      pruneRateWindows(issueRates, SESSION_ISSUE_WINDOW_MS);
    }, 30000);
  }
  onAuth(_c: Client, options: any) {
    if (options?.protocol !== PROTOCOL_VERSION)
      throw new Error("Herní protokol se změnil. Obnov stránku.");
    const token = typeof options?.token === "string" ? options.token : "";
    const s = sessions.get(token);
    if (!s || s.expires < Date.now() || this.connections.has(s.id))
      throw new Error("Platná multiplayerová relace je vyžadována.");
    return { ...s, token };
  }
  onJoin(client: Client) {
    const s = client.auth,
      n = this.clients.length - 1;
    this.connections.set(s.id, client);
    const actor = this.sim.add(s.id, {
      ...SPAWN,
      x: SPAWN.x + (n % 8) * 1.8,
      z: SPAWN.z - Math.floor(n / 8) * 2,
      y:
        groundHeight(SPAWN.x + (n % 8) * 1.8, SPAWN.z - Math.floor(n / 8) * 2) +
        1,
    });
    const saved = sessions.get(s.token)?.savedState;
    if (saved) actor.restore(saved);
    this.inputQueues.set(
      s.id,
      new TimelineInputQueue(++this.nextInputEpoch, this.simulationClock.tick),
    );
    const p: Player = {
      ...s.profile,
      ...actor.position,
      id: s.id,
      yaw: 0,
      emote: "",
      vehicle: false,
      speed: 0,
      ack: 0,
      zone: "outside",
    };
    synchronizePlayer(p, actor);
    store.players.set(p.id, p);
    client.send("welcome", {
      id: p.id,
      players: [...store.players.values()],
      events: store.events,
      activity: store.activity,
    });
    client.send("car", {
      ...this.carPosition,
      yaw: this.carYaw,
      parked: ![...this.sim.actors.values()].some((a) => a.vehicle),
      state: this.sim.car.capture(),
    });
    this.broadcastPresence();
    this.syncSocial();
    this.sendAuthority(client, true, "join");
    this.sendMotionKeyframe(client);
  }
  onLeave(client: Client) {
    const id = client.auth.id,
      a = this.sim.actors.get(id);
    const session = sessions.get(client.auth.token);
    if (a && session) {
      session.savedState = a.capture();
      if (a.vehicle)
        session.savedState = {
          ...session.savedState,
          vehicle: false,
          position: this.sim.exitPosition(a) || SPAWN,
          speed: 0,
          vertical: 0,
          grounded: false,
        };
    }
    if (a?.vehicle) {
      a.setVehicle(false);
      this.broadcast("car", {
        ...this.carPosition,
        yaw: this.carYaw,
        parked: true,
        state: this.sim.car.capture(),
      });
    }
    this.connections.delete(id);
    this.emoteExpiry.delete(id);
    this.sim.remove(id);
    store.players.delete(id);
    this.inputQueues.delete(id);
    const s = sessions.get(client.auth.token);
    if (s) s.expires = Date.now() + SESSION_RECONNECT_TTL_MS;
    this.broadcastPresence();
    this.syncSocial();
  }
  onDispose() {
    this.sim.dispose();
    if (singletonRoomId === this.roomId) singletonRoomId = undefined;
  }
  safe(c: Client, action: () => void) {
    try {
      action();
    } catch (error) {
      c.send(
        "notice",
        error instanceof Error ? error.message : "Akce se nezdařila.",
      );
    }
  }
  sendAuthority(
    c: Client,
    resync = false,
    resyncReason?: Authority["resyncReason"],
  ) {
    const actor = this.sim.actors.get(c.auth.id),
      queue = this.inputQueues.get(c.auth.id);
    if (!actor || !queue) return;
    const authority: Authority = {
      ...queue.frontier(),
      time: this.simulationClock.time,
      state: actor.capture(),
      resync,
      network: this.captureNetworkDiagnostics(queue),
    };
    if (resyncReason) authority.resyncReason = resyncReason;
    c.send("authoritative", authority);
  }
  private resetInputEpoch(id: string, queue: TimelineInputQueue) {
    queue.reset(++this.nextInputEpoch, this.simulationClock.tick);
    const player = store.players.get(id);
    if (player) player.ack = 0;
  }
  private captureNetworkDiagnostics(queue: TimelineInputQueue) {
    return {
      queue: queue.diagnostics(performance.now()),
      clock: this.networkClockTiming.snapshot(),
    };
  }
  captureMotion(): MotionPacket {
    return {
      time: this.simulationClock.time,
      tick: this.simulationClock.tick,
      car: this.sim.car.capture(),
      rows: [...store.players.values()].map((p) => [
        p.id,
        p.x,
        p.y,
        p.z,
        p.yaw,
        p.speed,
        p.ack,
        p.vehicle ? 1 : 0,
        p.zone,
        p.grounded,
      ]),
    };
  }
  sendMotionKeyframe(c: Client) {
    c.send("motion", this.motionEncoder.keyframe(this.captureMotion()));
  }
  broadcastPresence() {
    this.broadcast("presence", [...store.players.values()]);
  }
  syncSocial(ids: Iterable<string> = this.connections.keys()) {
    for (const id of ids)
      this.connections.get(id)?.send("social", store.privateState(id));
  }
}
const http = createServer();
const listenHost = "127.0.0.1";
const sessionDiagnostics = createSessionDiagnosticsHandler({ listenHost });
const localBenchmarks = createLocalBenchmarkHandler({ listenHost });
const handleApi = async (req: IncomingMessage, res: ServerResponse) => {
  if (await sessionDiagnostics(req, res)) return;
  if (await localBenchmarks(req, res)) return;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/api/health") {
    res.end(JSON.stringify({ ok: true, demo: true }));
    return;
  }
  if (req.url === "/api/weather") {
    res.end(JSON.stringify(await getWeather()));
    return;
  }
  if (req.url === "/api/demo-events") {
    res.end(JSON.stringify(store.events.filter((e) => !e.owner)));
    return;
  }
  if (req.url === "/api/session" && req.method === "POST") {
    try {
      const addr = req.socket.remoteAddress || "local";
      if (
        !consumeRate(
          issueRates,
          addr,
          150,
          SESSION_ISSUE_WINDOW_MS,
          Date.now(),
          MAX_SESSION_ISSUE_ADDRESSES,
        )
      ) {
        res.writeHead(429).end(
          JSON.stringify({
            error: "Příliš mnoho vstupů. Zkus to za minutu.",
          }),
        );
        return;
      }
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 12000) throw new Error("Příliš velký požadavek.");
      }
      const raw = JSON.parse(body || "{}");
      if (raw.mode !== "multiplayer") {
        res
          .writeHead(403)
          .end(JSON.stringify({ error: "Host nemá multiplayerovou relaci." }));
        return;
      }
      const previous =
        typeof raw.resumeToken === "string"
          ? sessions.get(raw.resumeToken)
          : undefined;
      if (previous && previous.expires > Date.now()) {
        res.end(
          JSON.stringify({ token: raw.resumeToken, id: previous.id, worldId }),
        );
        return;
      }
      const token = randomBytes(32).toString("hex"),
        id = randomUUID();
      sessions.set(token, {
        id,
        profile: sanitizeProfile(raw.profile),
        expires: Date.now() + SESSION_RECONNECT_TTL_MS,
      });
      res.end(JSON.stringify({ token, id, worldId }));
      return;
    } catch {
      res.writeHead(400).end(JSON.stringify({ error: "Neplatný požadavek." }));
      return;
    }
  }
  if (req.url?.startsWith("/api/")) {
    res.writeHead(403).end(
      JSON.stringify({
        error:
          "Multiplayerová data vyžadují ověřenou dočasnou relaci přes herní spojení.",
      }),
    );
  }
};
const server = new Server({
  transport: new WebSocketTransport({ server: http }),
  greet: false,
  express: (app) => {
    app.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
      if (req.url?.startsWith("/api/")) void handleApi(req, res);
      else if (
        req.url?.startsWith("/matchmake/") &&
        !req.url.startsWith("/matchmake/joinById/" + worldId)
      ) {
        res
          .writeHead(403, { "Content-Type": "application/json" })
          .end(JSON.stringify({ error: "Demo používá jediný společný svět." }));
      } else next();
    });
  },
});
server.define("strahov", StrahovRoom);
await server.listen(Number(process.env.PORT || 2567), listenHost);
const room = await matchMaker.createRoom("strahov", {});
worldId = room.roomId;
console.log(
  `Strahov multiplayer: http://127.0.0.1:${process.env.PORT || 2567} — world ${worldId}`,
);
