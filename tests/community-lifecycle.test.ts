import { test } from "node:test";
import assert from "node:assert/strict";
import { Community } from "../server/community";
import {
  consumeRate,
  expireSessions,
  MAX_SESSION_ISSUE_ADDRESSES,
  pruneRateWindows,
  SESSION_RECONNECT_TTL_MS,
} from "../server/session-lifecycle";
import { QUIZ } from "../shared/events";
import { DEFAULT_PROFILE, type Player } from "../shared/types";
import { HUNT_POINTS } from "../shared/world";

function player(id: string): Player {
  return {
    ...DEFAULT_PROFILE,
    id,
    nickname: id,
    x: 0,
    y: 1,
    z: 0,
    yaw: 0,
    zone: "outside",
    speed: 0,
    vehicle: false,
    emote: "",
    ack: 0,
  };
}
function community(...ids: string[]) {
  const store = new Community();
  for (const id of ids) store.players.set(id, player(id));
  return store;
}

test("reading private state never creates identity maps", () => {
  const store = community("active");
  for (let i = 0; i < 100; i++) store.privateState(`viewer-${i}`);
  assert.equal(
    store.contacts.size + store.requests.size + store.blocks.size,
    0,
  );
});

test("expiry keeps active and reconnectable identities, then expires exactly at the deadline", () => {
  const now = 10_000;
  const sessions = new Map([
    ["active-token", { id: "active", expires: now - 1 }],
    [
      "reconnect-token",
      { id: "reconnect", expires: now + SESSION_RECONNECT_TTL_MS },
    ],
    ["expired-token", { id: "expired", expires: now }],
  ]);
  assert.deepEqual(expireSessions(sessions, new Set(["active"]), now), [
    "expired",
  ]);
  assert.equal(sessions.size, 2);
  assert.deepEqual(
    expireSessions(
      sessions,
      new Set(["active"]),
      now + SESSION_RECONNECT_TTL_MS - 1,
    ),
    [],
  );
  assert.deepEqual(
    expireSessions(
      sessions,
      new Set(["active"]),
      now + SESSION_RECONNECT_TTL_MS,
    ),
    ["reconnect"],
  );
  assert.deepEqual([...sessions.keys()], ["active-token"]);
});

test("another retained token prevents identity cleanup", () => {
  const sessions = new Map([
    ["expired-token", { id: "same", expires: 1 }],
    ["retained-token", { id: "same", expires: 3 }],
  ]);
  assert.deepEqual(expireSessions(sessions, new Set(), 2), []);
  assert.equal(sessions.size, 1);
});

test("reconnect preserves social permissions before expiry; expiry removes every inverse identity edge", () => {
  const store = community("alice", "bob", "other");
  store.contact("alice", "bob");
  store.contact("bob", "alice", true);
  store.contact("alice", "other");
  store.blocks.set("other", new Set(["alice"]));
  store.blocks.set("alice", new Set(["other"]));
  store.attend("alice", "tea", true, true);
  store.attend("bob", "tea", true, false);
  store.startQuiz("alice", "lime");
  assert.equal(store.answer("alice", QUIZ[0].correct), true);
  store.players.delete("alice");
  assert.deepEqual(store.privateState("bob").contacts, ["alice"]);
  assert.throws(() => store.chat("bob", "dm:alice", "offline"));
  store.players.set("alice", player("alice"));
  assert.deepEqual(store.chat("bob", "dm:alice", "back").recipients, [
    "bob",
    "alice",
  ]);
  assert.deepEqual(store.forgetIdentities(["alice"]), {
    social: false,
    activity: false,
  });
  store.players.delete("alice");
  assert.deepEqual(store.forgetIdentities(["alice"]), {
    social: true,
    activity: true,
  });
  for (const map of [store.contacts, store.requests, store.blocks]) {
    assert.equal(map.has("alice"), false);
    for (const edges of map.values()) assert.equal(edges.has("alice"), false);
  }
  assert.deepEqual(
    store.attendance.map((a) => a.playerId),
    ["bob"],
  );
  assert.equal(
    [...store.rates.keys()].some((key) => key.startsWith("alice:")),
    false,
  );
  assert.equal(store.teams.has("alice"), false);
  assert.equal(store.answered.has("alice"), false);
  assert.equal(Object.hasOwn(store.activity.quiz.scores, "alice"), false);
  assert.equal(
    store.activity.quiz.teamScores.lime,
    1,
    "earned team points survive expiry",
  );
  assert.deepEqual(store.forgetIdentities(["alice"]), {
    social: false,
    activity: false,
  });
});

test("identity expiry retains future authored meetings and their private owner marker", () => {
  const store = community("author");
  const event = store.saveEvent("author", {
    title: "Multiplayer meeting",
    placeId: "b6",
    startsAt: Date.now() + 86_400_000,
    endsAt: Date.now() + 90_000_000,
  });
  store.players.delete("author");
  store.forgetIdentities(["author"]);
  assert.equal(store.events.includes(event), true);
  assert.equal(event.owner, "author");
  assert.equal(store.events.filter((e) => !e.owner).includes(event), false);
});

test("rotating expired events also removes their attendance without removing future attendance", () => {
  const store = community("alice");
  store.attend("alice", "tea", true, false);
  store.attend("alice", "hunt", true, false);
  store.events = store.events.filter((event) => event.id !== "tea");
  assert.equal(store.pruneAttendance(), true);
  assert.deepEqual(
    store.attendance.map((a) => a.eventId),
    ["hunt"],
  );
  assert.equal(store.pruneAttendance(), false);
});

test("social mutations distinguish changes, preserve accepted DM permission, and refuse fabricated block targets", () => {
  const store = community("alice", "bob", "carol");
  assert.equal(store.contact("alice", "bob"), true);
  assert.equal(store.contact("alice", "bob"), false);
  assert.equal(store.contact("bob", "alice", true), true);
  assert.equal(store.contact("bob", "alice", true), false);
  assert.equal(store.contact("alice", "bob"), false);
  assert.equal(store.requests.size, 0);
  assert.deepEqual(store.chat("alice", "dm:bob", "accepted").recipients, [
    "alice",
    "bob",
  ]);
  assert.equal(store.contact("carol", "alice"), true);
  assert.equal(store.decline("alice", "carol"), true);
  assert.equal(store.decline("alice", "carol"), false);
  assert.equal(store.requests.size, 0);
  assert.throws(() => store.block("alice", "fabricated", true));
  assert.throws(() => store.block("alice", "alice", true));
  assert.equal(store.blocks.size, 0);
  store.players.delete("bob");
  assert.equal(
    store.block("alice", "bob", true),
    true,
    "accepted offline contacts can be blocked",
  );
  assert.equal(store.block("alice", "bob", true), false);
  assert.equal(store.contacts.size, 0);
  assert.equal(store.block("alice", "bob", false), true);
  assert.equal(store.block("alice", "bob", false), false);
  assert.equal(store.blocks.size, 0);
});

test("attendance toggles share an action limit; duplicate state creates no work or rate cost", () => {
  const store = community("alice");
  assert.equal(store.attend("alice", "tea", true, true), true);
  for (let i = 0; i < 100; i++)
    assert.equal(store.attend("alice", "tea", true, true), false);
  assert.equal(store.rates.get("alice:action")?.length, 1);
  for (let i = 0; i < 11; i++) store.attend("alice", "tea", i % 2 === 1, true);
  assert.equal(store.rates.get("alice:action")?.length, 12);
  assert.throws(() => store.attend("alice", "tea", true, true), /Počkej/);
});

test("saving and cancelling an unchanged meeting does not request another broadcast", () => {
  const store = community("alice");
  const raw = {
    title: "Meeting",
    placeId: "b6",
    startsAt: Date.now() + 60_000,
    endsAt: Date.now() + 120_000,
  };
  const created = store.saveEventChange("alice", raw);
  assert.equal(created.changed, true);
  assert.equal(store.saveEventChange("alice", created.event).changed, false);
  assert.equal(store.rates.get("alice:events")?.length, 1);
  assert.equal(store.cancelEvent("alice", created.event.id), true);
  assert.equal(store.cancelEvent("alice", created.event.id), false);
});

test("only newly collected hunt markers change activity and complete it once", () => {
  const store = community("alice");
  HUNT_POINTS.forEach((point, index) => {
    Object.assign(store.players.get("alice")!, { x: point.x, z: point.z });
    assert.deepEqual(store.findChange("alice", index), {
      changed: true,
      completed: index === HUNT_POINTS.length - 1,
    });
    assert.deepEqual(store.findChange("alice", index), {
      changed: false,
      completed: false,
    });
    assert.equal(
      store.find("alice", index),
      false,
      "completion reward cannot be replayed",
    );
  });
});

test("quiz broadcasts only score changes or starting a round, not repeated joins/answers", () => {
  const store = community("alice", "bob");
  assert.equal(store.startQuiz("alice", "lime"), true);
  assert.equal(store.startQuiz("alice", "lime"), false);
  assert.equal(store.startQuiz("bob", "purple"), false);
  assert.equal(store.teams.get("bob"), "purple");
  for (const invalid of [NaN, -1, 0.5, QUIZ[0].answers.length])
    assert.equal(store.answer("alice", invalid), false);
  assert.equal(store.answered.has("alice"), false);
  assert.equal(store.answer("alice", QUIZ[0].correct), true);
  for (let i = 0; i < 100; i++)
    assert.equal(store.answer("alice", QUIZ[0].correct), false);
  assert.equal(
    store.answer("bob", (QUIZ[0].correct + 1) % QUIZ[0].answers.length),
    false,
  );
  assert.equal(store.answered.has("bob"), true);
  assert.equal(store.answer("bob", QUIZ[0].correct), false);
  assert.deepEqual(store.activity.quiz.scores, { alice: 1 });
  assert.deepEqual(store.activity.quiz.teamScores, { lime: 1, purple: 0 });
});

test("rate buffers are reused, exact window boundaries reopen, and idle buckets are pruned", () => {
  const rates = new Map<string, number[]>();
  assert.equal(consumeRate(rates, "address", 2, 100, 1000), true);
  const buffer = rates.get("address");
  assert.equal(consumeRate(rates, "address", 2, 100, 1001), true);
  assert.equal(consumeRate(rates, "address", 2, 100, 1099), false);
  assert.equal(consumeRate(rates, "address", 2, 100, 1100), true);
  assert.equal(rates.get("address"), buffer);
  assert.deepEqual(buffer, [1001, 1100]);
  assert.equal(pruneRateWindows(rates, 100, 1199), 0);
  assert.deepEqual(buffer, [1100]);
  assert.equal(pruneRateWindows(rates, 100, 1200), 1);
  assert.equal(rates.size, 0);
});

test("the IP bucket cap cannot evict live rate limits, and cleanup permits new addresses", () => {
  const rates = new Map<string, number[]>();
  for (let i = 0; i < MAX_SESSION_ISSUE_ADDRESSES; i++)
    assert.equal(
      consumeRate(rates, `ip-${i}`, 1, 100, 0, MAX_SESSION_ISSUE_ADDRESSES),
      true,
    );
  assert.equal(
    consumeRate(rates, "overflow", 1, 100, 1, MAX_SESSION_ISSUE_ADDRESSES),
    false,
  );
  assert.equal(rates.size, MAX_SESSION_ISSUE_ADDRESSES);
  assert.equal(
    consumeRate(rates, "ip-0", 1, 100, 1, MAX_SESSION_ISSUE_ADDRESSES),
    false,
  );
  assert.equal(pruneRateWindows(rates, 100, 100), MAX_SESSION_ISSUE_ADDRESSES);
  assert.equal(
    consumeRate(rates, "overflow", 1, 100, 100, MAX_SESSION_ISSUE_ADDRESSES),
    true,
  );
});

test("session churn reclaims retained social state without accumulating empty identity entries", () => {
  const store = community("active");
  const sessions = new Map<string, { id: string; expires: number }>();
  for (let wave = 0; wave < 5; wave++) {
    for (let i = 0; i < 100; i++) {
      const id = `departed-${wave}-${i}`;
      sessions.set(id, { id, expires: wave });
      store.contacts.set(id, new Set(["active"]));
      const active = store.contacts.get("active") || new Set<string>();
      active.add(id);
      store.contacts.set("active", active);
      store.teams.set(id, "lime");
      store.answered.add(id);
      store.activity.quiz.scores[id] = 1;
      store.rates.set(`${id}:chat`, [0]);
      store.attendance.push({ playerId: id, eventId: "tea", company: false });
    }
    store.forgetIdentities(expireSessions(sessions, store.players, wave));
    assert.equal(sessions.size, 0);
    assert.equal(
      store.contacts.size + store.requests.size + store.blocks.size,
      0,
    );
    assert.equal(store.teams.size + store.answered.size + store.rates.size, 0);
    assert.equal(
      store.attendance.length + Object.keys(store.activity.quiz.scores).length,
      0,
    );
    assert.equal(store.players.size, 1);
  }
});
