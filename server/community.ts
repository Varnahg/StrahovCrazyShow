import { randomUUID } from "node:crypto";
import { eventStatus, makeDemoEvents, QUIZ } from "../shared/events";
import { cleanText } from "../shared/profile";
import { HUNT_POINTS, PLACES } from "../shared/world";
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
  set(map: Map<string, Set<string>>, id: string) {
    if (!map.has(id)) map.set(id, new Set());
    return map.get(id)!;
  }
  privateState(id: string): SocialState {
    return {
      attendance: this.attendance.filter((a) => this.players.has(a.playerId)),
      contacts: [...this.set(this.contacts, id)],
      requests: [...this.set(this.requests, id)],
      blocked: [...this.set(this.blocks, id)],
    };
  }
  blocked(a: string, b: string) {
    return this.blocks.get(a)?.has(b) || this.blocks.get(b)?.has(a);
  }
  rate(id: string, kind = "chat", limit = 5, window = 10000) {
    const key = id + ":" + kind,
      now = Date.now(),
      list = (this.rates.get(key) || []).filter((t) => now - t < window);
    if (list.length >= limit) return false;
    list.push(now);
    this.rates.set(key, list);
    return true;
  }
  contact(from: string, to: string, accept = false) {
    if (from === to || !this.players.has(to) || this.blocked(from, to))
      throw new Error("Kontakt není dostupný.");
    if (accept) {
      if (!this.set(this.requests, from).delete(to))
        throw new Error("Žádost už není platná.");
      this.set(this.requests, to).delete(from);
      this.set(this.contacts, from).add(to);
      this.set(this.contacts, to).add(from);
    } else {
      if (!this.rate(from, "request", 4, 30000))
        throw new Error("Počkej před další žádostí.");
      this.set(this.requests, to).add(from);
    }
  }
  block(from: string, to: string, enabled: boolean) {
    if (enabled) {
      this.set(this.blocks, from).add(to);
      this.set(this.contacts, from).delete(to);
      this.set(this.contacts, to).delete(from);
      this.set(this.requests, from).delete(to);
      this.set(this.requests, to).delete(from);
    } else this.set(this.blocks, from).delete(to);
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
    const e = this.events.find((e) => e.id === eventId);
    if (!e || (enabled && ["ended", "cancelled"].includes(eventStatus(e))))
      throw new Error("K této akci se už nelze přidat.");
    this.attendance = this.attendance.filter(
      (a) => !(a.playerId === id && a.eventId === eventId),
    );
    if (enabled) this.attendance.push({ playerId: id, eventId, company });
  }
  saveEvent(id: string, raw: any) {
    if (!this.rate(id, "events", 8, 60000))
      throw new Error("Počkej před další změnou setkání.");
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
    return e;
  }
  cancelEvent(id: string, eventId: string) {
    const e = this.events.find((e) => e.id === eventId);
    if (!e || e.owner !== id)
      throw new Error("Upravovat můžeš jen vlastní setkání.");
    e.cancelled = true;
  }
  find(id: string, index: number) {
    const p = this.players.get(id),
      point = HUNT_POINTS[index];
    if (
      !p ||
      !point ||
      p.zone !== "outside" ||
      Math.hypot(p.x - point.x, p.z - point.z) > 4
    )
      throw new Error("Přibliž se ke značce.");
    if (!this.activity.hunt.includes(String(index)))
      this.activity.hunt.push(String(index));
    return this.activity.hunt.length === HUNT_POINTS.length;
  }
  startQuiz(id: string, team: string) {
    this.teams.set(id, team === "lime" ? "lime" : "purple");
    if (!this.activity.quiz.running) {
      this.activity.quiz = {
        question: 0,
        deadline: Date.now() + 20000,
        scores: {},
        running: true,
        teamScores: { lime: 0, purple: 0 },
      };
      this.answered.clear();
    }
  }
  answer(id: string, index: number) {
    const q = this.activity.quiz;
    if (
      !q.running ||
      Date.now() >= q.deadline ||
      this.answered.has(id) ||
      !this.teams.has(id)
    )
      return;
    this.answered.add(id);
    if (QUIZ[q.question].correct === index) {
      q.scores[id] = (q.scores[id] || 0) + 1;
      const team = this.teams.get(id)!;
      q.teamScores[team] = (q.teamScores[team] || 0) + 1;
    }
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
