import { test } from "node:test";
import assert from "node:assert/strict";
import { Community } from "../server/community";
import { eventStatus, inPeriod, makeDemoEvents } from "../shared/events";
import { sanitizeInput, sanitizeProfile } from "../shared/profile";
import { DEFAULT_PROFILE, type Player } from "../shared/types";
import { parseStation, sunState } from "../shared/weather";
const player = (id: string, x = 22, z = -14): Player => ({
  ...DEFAULT_PROFILE,
  id,
  nickname: id,
  x,
  y: 1,
  z,
  yaw: 0,
  zone: "outside",
  speed: 0,
  vehicle: false,
  emote: "",
  ack: 0,
});
test("channel authorization, accepted contacts and blocking apply server-side", () => {
  const c = new Community();
  c.players.set("a", player("a"));
  c.players.set("b", player("b", 30));
  c.players.set("c", player("c", 130));
  assert.deepEqual(c.chat("a", "local", "ahoj").recipients, ["a", "b"]);
  assert.throws(() => c.chat("a", "dm:b", "no"));
  c.contact("a", "b");
  c.contact("b", "a", true);
  assert.deepEqual(c.chat("a", "dm:b", "ok").recipients, ["a", "b"]);
  c.block("b", "a", true);
  assert.throws(() => c.chat("a", "dm:b", "no"));
  assert.deepEqual(c.chat("a", "global", "global").recipients, ["a", "c"]);
});
test("event membership and ownership cannot be forged", () => {
  const c = new Community();
  c.players.set("a", player("a"));
  c.players.set("b", player("b"));
  assert.throws(() => c.chat("a", "event:tea", "no"));
  c.attend("a", "tea", true, true);
  assert.deepEqual(c.chat("a", "event:tea", "yes").recipients, ["a"]);
  const e = c.saveEvent("a", {
    title: "Test",
    placeId: "b6",
    startsAt: Date.now() + 60000,
    endsAt: Date.now() + 120000,
  });
  assert.throws(() => c.cancelEvent("b", e.id));
  assert.throws(() => c.saveEvent("b", e));
  c.cancelEvent("a", e.id);
  assert.equal(eventStatus(e), "cancelled");
});
test("event time boundaries and Prague DST calendar", () => {
  const now = Date.parse("2026-10-25T00:30:00Z"),
    e = makeDemoEvents(now)[0];
  assert.equal(eventStatus(e, e.startsAt - 1), "planned");
  assert.equal(eventStatus(e, e.startsAt), "live");
  assert.equal(eventStatus(e, e.endsAt), "ended");
  assert.equal(inPeriod(e, "today", now), true);
  e.cancelled = true;
  assert.equal(eventStatus(e, now), "cancelled");
  assert.equal(inPeriod(e, "now", now), false);
});
test("week calendar does not shift Monday across the autumn DST change", () => {
  const monday = makeDemoEvents(Date.parse("2026-10-19T10:00:00Z"))[0];
  assert.equal(
    inPeriod(monday, "week", Date.parse("2026-10-25T22:30:00Z")),
    true,
  );
});
test("untrusted input and profiles are bounded", () => {
  assert.equal(sanitizeInput({ x: Infinity, z: 0, yaw: 0, seq: 1 }), null);
  const bounded = sanitizeInput({ x: 100, z: -100, yaw: 0, seq: 1 })!;
  assert.ok(Math.hypot(bounded.x, bounded.z) <= 1.00003);
  const p = sanitizeProfile({
    nickname: "x".repeat(200),
    avatar: { shirt: "javascript:evil" },
    interests: ["Private", "Hry"],
  });
  assert.equal(p.nickname.length, 24);
  assert.equal(p.avatar.shirt, DEFAULT_PROFILE.avatar.shirt);
  assert.deepEqual(p.interests, ["Hry"]);
});
test("station measurements and timestamp are parsed, forecast is not treated as measured cloud cover", () => {
  const now = Date.parse("2026-10-10T16:00:00Z");
  const w = parseStation(
    "<tr><td>Teplota:</td><td>12.0&nbsp;°C</td></tr><tr><td>Charakter v&#283;tru:</td><td>ESE<br>2.1 m/s</td></tr><tr><td>Intenzita de&#353;t&#283;:</td><td>1.2 mm/h</td></tr>2026-10-10 18:00:00 fc-icon-partlycloudy",
    now,
  );
  assert.equal(w.temperature, 12);
  assert.equal(w.rain, 1.2);
  assert.equal(w.observedAt, now);
  assert.equal(w.stale, false);
  assert.match(w.cloudSource, /předpovědi/);
  assert.throws(() => parseStation("<html>unavailable</html>"));
});
test("astronomical cycle changes daylight over the actual Prague day", () => {
  assert.ok(sunState(Date.parse("2026-06-21T10:00:00Z")).daylight > 0.9);
  assert.equal(sunState(Date.parse("2026-06-21T23:00:00Z")).daylight, 0);
});
