import { randomUUID } from "node:crypto";
import { eventStatus, makeDemoEvents, QUIZ } from "../shared/events";
import { cleanText } from "../shared/profile";
import { HUNT_POINTS, PLACES } from "../shared/world";
import { consumeRate } from "./session-lifecycle";
import type {
  ActivityState,
  Attendance,
  ChatMessage,
  EventItem,
  Player,
  SocialState,
} from "../shared/types";
export class Community {
  players = new Map<string, Player>();
  events: EventItem[] = makeDemoEvents();
  attendance: Attendance[] = [];
  contacts = new Map<string, Set<string>>();
  requests = new Map<string, Set<string>>();
  blocks = new Map<string, Set<string>>();
  rates = new Map<string, number[]>();
  activity: ActivityState = {
    hunt: [],
    quiz: {
      question: -1,
      deadline: 0,
      scores: {},
      running: false,
      teamScores: {},
    },
  };
  answered = new Set<string>();
  teams = new Map<string, string>();
  private set(map: Map<string, Set<string>>, id: string) {
    if (!map.has(id)) map.set(id, new Set());
    return map.get(id)!;
  }
  privateState(id: string): SocialState {
    return {
      attendance: this.attendance.filter((a) => this.players.has(a.playerId)),
      contacts: [...(this.contacts.get(id) || [])],
      requests: [...(this.requests.get(id) || [])],
      blocked: [...(this.blocks.get(id) || [])],
    };
  }
  blocked(a: string, b: string) {
    return this.blocks.get(a)?.has(b) || this.blocks.get(b)?.has(a);
  }
  rate(id: string, kind = "chat", limit = 5, window = 10000) {
    return consumeRate(this.rates, id + ":" + kind, limit, window);
  }
  private requirePlayer(id: string) {
    if (!this.players.has(id)) throw new Error("Hráč není připojený.");
  }
  private action(id: string) {
    this.requirePlayer(id);
    if (!this.rate(id, "action", 12, 10000))
      throw new Error("Počkej před další akcí.");
  }
  private removeEdge(map: Map<string, Set<string>>, from: string, to: string) {
    const edges = map.get(from);
    if (!edges?.delete(to)) return false;
    if (!edges.size) map.delete(from);
    return true;
  }
  /** Called only after the reconnect window expires, never on disconnect. */
  forgetIdentities(expired: Iterable<string>) {
    const ids = new Set([...expired].filter((id) => !this.players.has(id)));
    let social = false,
      activity = false;
    if (!ids.size) return { social, activity };
    for (const map of [this.contacts, this.requests, this.blocks]) {
      for (const [owner, edges] of map) {
        if (ids.has(owner)) {
          social = map.delete(owner) || social;
          continue;
        }
        for (const target of edges)
          if (ids.has(target)) {
            edges.delete(target);
            social = true;
          }
        if (!edges.size) map.delete(owner);
      }
    }
    const attendance = this.attendance.filter((a) => !ids.has(a.playerId));
    social = attendance.length !== this.attendance.length || social;
    this.attendance = attendance;
    for (const key of this.rates.keys())
      if (ids.has(key.slice(0, key.lastIndexOf(":")))) this.rates.delete(key);
    for (const id of ids) {
      this.teams.delete(id);
      this.answered.delete(id);
      if (Object.hasOwn(this.activity.quiz.scores, id)) {
        delete this.activity.quiz.scores[id];
        activity = true;
      }
    }
    // Team points describe completed answers, so disconnect/expiry never takes
    // points away. Authored events retain their owner marker until normal event
    // expiry: clearing it would expose their text through the public demo API.
    return { social, activity };
  }
  pruneAttendance() {
    const events = new Set(this.events.map((event) => event.id));
    const attendance = this.attendance.filter((a) => events.has(a.eventId));
    const changed = attendance.length !== this.attendance.length;
    this.attendance = attendance;
    return changed;
  }
  contact(from: string, to: string, accept = false) {
    this.requirePlayer(from);
    if (from === to || !this.players.has(to) || this.blocked(from, to))
      throw new Error("Kontakt není dostupný.");
    if (this.contacts.get(from)?.has(to)) return false;
    if (accept) {
      if (!this.requests.get(from)?.has(to))
        throw new Error("Žádost už není platná.");
      this.action(from);
      this.removeEdge(this.requests, from, to);
      this.removeEdge(this.requests, to, from);
      this.set(this.contacts, from).add(to);
      this.set(this.contacts, to).add(from);
    } else {
      if (this.requests.get(to)?.has(from)) return false;
      if (!this.rate(from, "request", 4, 30000))
        throw new Error("Počkej před další žádostí.");
      this.set(this.requests, to).add(from);
    }
    return true;
  }
  decline(from: string, to: string) {
    if (!this.requests.get(from)?.has(to)) return false;
    this.action(from);
    return this.removeEdge(this.requests, from, to);
  }
  block(from: string, to: string, enabled: boolean) {
    this.requirePlayer(from);
    if (from === to) throw new Error("Kontakt není dostupný.");
    if (enabled) {
      if (this.blocks.get(from)?.has(to)) return false;
      if (
        !this.players.has(to) &&
        !this.contacts.get(from)?.has(to) &&
        !this.requests.get(from)?.has(to)
      )
        throw new Error("Kontakt není dostupný.");
      this.action(from);
      this.set(this.blocks, from).add(to);
      this.removeEdge(this.contacts, from, to);
      this.removeEdge(this.contacts, to, from);
      this.removeEdge(this.requests, from, to);
      this.removeEdge(this.requests, to, from);
    } else {
      if (!this.blocks.get(from)?.has(to)) return false;
      this.action(from);
      this.removeEdge(this.blocks, from, to);
    }
    return true;
  }
  chat(
    id: string,
    channel: unknown,
    text: unknown,
  ): { message: ChatMessage; recipients: string[] } {
    const p = this.players.get(id),
      body = cleanText(text, 500),
      ch = cleanText(channel, 80);
    if (!p || !body) throw new Error("Prázdná zpráva.");
    if (!this.rate(id)) throw new Error("Nejvýše 5 zpráv za 10 sekund.");
    let recipients: string[] = [];
    if (ch === "global") recipients = [...this.players.keys()];
    else if (ch === "local")
      recipients = [...this.players.values()]
        .filter(
          (q) => q.zone === p.zone && Math.hypot(q.x - p.x, q.z - p.z) < 40,
        )
        .map((q) => q.id);
    else if (ch.startsWith("event:")) {
      const eventId = ch.slice(6);
      if (
        !this.attendance.some((a) => a.playerId === id && a.eventId === eventId)
      )
        throw new Error("Nejprve se přidej k události.");
      recipients = this.attendance
        .filter((a) => a.eventId === eventId && this.players.has(a.playerId))
        .map((a) => a.playerId);
    } else if (ch.startsWith("dm:")) {
      const to = ch.slice(3);
      if (
        !this.contacts.get(id)?.has(to) ||
        this.blocked(id, to) ||
        !this.players.has(to)
      )
        throw new Error("Soukromý kontakt není přijatý nebo je nedostupný.");
      recipients = [id, to];
    } else throw new Error("Neznámý kanál.");
    return {
      message: {
        id: randomUUID(),
        sender: id,
        nickname: p.nickname,
        text: body,
        channel: ch,
        at: Date.now(),
      },
      recipients: recipients.filter((to) => !this.blocked(id, to)),
    };
  }
  attend(id: string, eventId: string, enabled: boolean, company: boolean) {
    this.requirePlayer(id);
    const e = this.events.find((e) => e.id === eventId);
    if (!e || (enabled && ["ended", "cancelled"].includes(eventStatus(e))))
      throw new Error("K této akci se už nelze přidat.");
    const index = this.attendance.findIndex(
      (a) => a.playerId === id && a.eventId === eventId,
    );
    if (
      (!enabled && index === -1) ||
      (enabled && index !== -1 && this.attendance[index].company === company)
    )
      return false;
    this.action(id);
    if (!enabled) this.attendance.splice(index, 1);
    else if (index !== -1) this.attendance[index].company = company;
    else this.attendance.push({ playerId: id, eventId, company });
    return true;
  }
  saveEvent(id: string, raw: any) {
    return this.saveEventChange(id, raw).event;
  }
  saveEventChange(id: string, raw: any) {
    this.requirePlayer(id);
    const existing = this.events.find((e) => e.id === raw?.id);
    if (existing && existing.owner !== id)
      throw new Error("Upravovat můžeš jen vlastní setkání.");
    if (
      !existing &&
      this.events.filter((e) => e.owner === id && !e.cancelled).length >= 5
    )
      throw new Error("Nejvýše pět vlastních setkání.");
    const title = cleanText(raw?.title, 80),
      description = cleanText(raw?.description, 600),
      placeId = cleanText(raw?.placeId, 30),
      startsAt = Number(raw?.startsAt),
      endsAt = Number(raw?.endsAt);
    if (
      !title ||
      !PLACES.some((p) => p.id === placeId) ||
      !Number.isFinite(startsAt) ||
      !Number.isFinite(endsAt) ||
      endsAt <= startsAt ||
      endsAt - startsAt > 86400000 ||
      startsAt < Date.now() - 300000 ||
      startsAt > Date.now() + 7 * 86400000
    )
      throw new Error(
        "Zkontroluj název, místo a čas (nejvýše týden dopředu, délka do 24 hodin).",
      );
    if (
      existing &&
      existing.title === title &&
      existing.description === description &&
      existing.placeId === placeId &&
      existing.startsAt === startsAt &&
      existing.endsAt === endsAt &&
      !existing.cancelled
    )
      return { event: existing, changed: false };
    if (!this.rate(id, "events", 8, 60000))
      throw new Error("Počkej před další změnou setkání.");
    const e: EventItem = {
      id: existing?.id || randomUUID(),
      title,
      description,
      placeId,
      startsAt,
      endsAt,
      tags: ["Seznamování"],
      owner: id,
      cancelled: false,
      demo: true,
    };
    if (existing) Object.assign(existing, e);
    else this.events.push(e);
    return { event: existing || e, changed: true };
  }
  cancelEvent(id: string, eventId: string) {
    const e = this.events.find((e) => e.id === eventId);
    if (!e || e.owner !== id)
      throw new Error("Upravovat můžeš jen vlastní setkání.");
    if (e.cancelled) return false;
    this.action(id);
    e.cancelled = true;
    return true;
  }
  find(id: string, index: number) {
    return this.findChange(id, index).completed;
  }
  findChange(id: string, index: number) {
    const p = this.players.get(id),
      point = HUNT_POINTS[index];
    if (
      !p ||
      !point ||
      p.zone !== "outside" ||
      Math.hypot(p.x - point.x, p.z - point.z) > 4
    )
      throw new Error("Přibliž se ke značce.");
    if (this.activity.hunt.includes(String(index)))
      return { changed: false, completed: false };
    this.action(id);
    this.activity.hunt.push(String(index));
    return {
      changed: true,
      completed: this.activity.hunt.length === HUNT_POINTS.length,
    };
  }
  startQuiz(id: string, team: string) {
    this.requirePlayer(id);
    const selected = team === "lime" ? "lime" : "purple";
    if (this.activity.quiz.running && this.teams.get(id) === selected)
      return false;
    this.action(id);
    this.teams.set(id, selected);
    if (!this.activity.quiz.running) {
      this.activity.quiz = {
        question: 0,
        deadline: Date.now() + 20000,
        scores: {},
        running: true,
        teamScores: { lime: 0, purple: 0 },
      };
      this.answered.clear();
      return true;
    }
    // Membership is private bookkeeping, absent from the activity payload.
    return false;
  }
  answer(id: string, index: number) {
    const q = this.activity.quiz;
    if (
      !q.running ||
      Date.now() >= q.deadline ||
      this.answered.has(id) ||
      !this.players.has(id) ||
      !this.teams.has(id) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= QUIZ[q.question].answers.length
    )
      return false;
    this.answered.add(id);
    if (QUIZ[q.question].correct === index) {
      q.scores[id] = (q.scores[id] || 0) + 1;
      const team = this.teams.get(id)!;
      q.teamScores[team] = (q.teamScores[team] || 0) + 1;
      return true;
    }
    return false;
  }
  tick() {
    const q = this.activity.quiz;
    if (q.running && Date.now() >= q.deadline) {
      q.question++;
      q.deadline = Date.now() + 20000;
      this.answered.clear();
      if (q.question >= QUIZ.length) {
        q.running = false;
        q.question = QUIZ.length - 1;
      }
      return true;
    }
    return false;
  }
}
