import assert from "node:assert/strict";
import { test } from "node:test";
import { Community } from "../server/community";
import { DEFAULT_PROFILE, type ChatMessage, type Player } from "../shared/types";

const unavailable = { unavailable: true };
const referenceError = { message: "Původní zpráva není dostupná." };

function player(id: string, x = 0, zone = "outside"): Player {
  return {
    ...DEFAULT_PROFILE,
    id,
    nickname: id.toUpperCase(),
    x,
    y: 1,
    z: 0,
    yaw: 0,
    zone,
    speed: 0,
    vehicle: false,
    emote: "",
    ack: 0,
  };
}

function send(
  store: Community,
  from: string,
  channel: string,
  text: string,
  replyTo?: unknown,
  accepted: (recipient: string) => boolean = () => true,
) {
  const delivered = new Map<string, ChatMessage>();
  const ok = store.deliverChat(from, channel, text, replyTo, (recipient, message) => {
    if (!accepted(recipient)) return false;
    delivered.set(recipient, message);
    return true;
  });
  return { ok, delivered, own: delivered.get(from)! };
}

function quote({ id, nickname, text, sender }: ChatMessage) {
  return { id, nickname, text, sender };
}

test("a local reply preserves the exact previously delivered audience within the same zone", () => {
  const store = new Community();
  store.players.set("adam", player("adam"));
  store.players.set("bea", player("bea", 12));
  store.players.set("cyril", player("cyril", 45));
  store.players.set("dan", player("dan", 12));
  const original = send(store, "adam", "local", "uhni prosím", undefined, id => id !== "dan");
  assert.deepEqual([...original.delivered.keys()], ["adam", "bea"]);
  assert.ok(!Object.hasOwn(original.own, "reply"));
  const answer = send(store, "bea", "local", "už jdu", original.own.id);
  assert.equal(answer.ok, true);
  assert.equal(answer.delivered.keys().next().value, "bea");
  assert.deepEqual(answer.own.reply, quote(original.own));
  assert.deepEqual(answer.delivered.get("adam")?.reply, quote(original.own));
  for (const recipient of ["cyril", "dan"]) {
    assert.deepEqual(answer.delivered.get(recipient)?.reply, unavailable);
    assert.equal(answer.delivered.get(recipient)?.text, "už jdu");
  }
  store.players.get("bea")!.zone = "b6:1";
  assert.throws(() => send(store, "bea", "local", "jiné patro", original.own.id), referenceError);
});

test("global replies redact metadata for late arrivals and original-author blocks", () => {
  const store = new Community();
  for (const id of ["adam", "bea", "cyril"]) store.players.set(id, player(id));
  const original = send(store, "adam", "global", "první");
  store.players.set("dan", player("dan"));
  store.block("cyril", "adam", true);
  const answer = send(store, "bea", "global", "druhá", original.own.id);
  assert.deepEqual(answer.own.reply, quote(original.own));
  assert.deepEqual(answer.delivered.get("adam")?.reply, quote(original.own));
  assert.deepEqual(answer.delivered.get("cyril")?.reply, unavailable);
  assert.deepEqual(answer.delivered.get("dan")?.reply, unavailable);
  assert.throws(() => send(store, "dan", "global", "doručit originál", original.own.id), referenceError);
  assert.throws(() => send(store, "cyril", "global", "doručit originál", original.own.id), referenceError);
  assert.throws(() => send(store, "bea", "local", "mimo kanál", original.own.id), referenceError);
  const next = send(store, "dan", "global", "třetí", answer.own.id);
  assert.deepEqual(next.own.reply, quote(answer.own), "a reference never embeds the prior reply");
});

test("both directions of an accepted private conversation share one reference scope", () => {
  const store = new Community();
  for (const id of ["adam", "bea", "cyril"]) store.players.set(id, player(id));
  store.contact("adam", "bea");
  store.contact("bea", "adam", true);
  store.contact("bea", "cyril");
  store.contact("cyril", "bea", true);
  const original = send(store, "adam", "dm:bea", "jen pro Beu");
  const answer = send(store, "bea", "dm:adam", "jen pro Adama", original.own.id);
  assert.deepEqual([...answer.delivered.keys()], ["bea", "adam"]);
  assert.deepEqual(answer.delivered.get("adam")?.reply, quote(original.own));
  assert.throws(() => send(store, "bea", "dm:cyril", "jiná dvojice", original.own.id), referenceError);
  assert.throws(() => send(store, "bea", "global", "mimo soukromý chat", original.own.id), referenceError);
  store.block("adam", "bea", true);
  assert.throws(() => send(store, "bea", "dm:adam", "nedostupný kontakt", original.own.id), {
    message: "Soukromý kontakt není přijatý nebo je nedostupný.",
  });
});

test("event reply considers current attendance, original audience, and the exact demo occurrence", () => {
  const store = new Community();
  for (const id of ["adam", "bea", "cyril", "dan"]) store.players.set(id, player(id));
  for (const id of ["adam", "bea", "dan"]) store.attend(id, "tea", true, false);
  const original = send(store, "adam", "event:tea", "dej vědět");
  store.attend("cyril", "tea", true, false);
  store.attend("dan", "tea", false, false);
  const answer = send(store, "bea", "event:tea", "už jsem tu", original.own.id);
  assert.deepEqual(answer.delivered.get("adam")?.reply, quote(original.own));
  assert.deepEqual(answer.delivered.get("cyril")?.reply, unavailable);
  assert.equal(answer.delivered.has("dan"), false);
  assert.throws(() => send(store, "dan", "event:tea", "bez účasti", original.own.id), {
    message: "Nejprve se přidej k události.",
  });
  const event = store.events.find(({ id }) => id === "tea")!;
  store.events[store.events.indexOf(event)] = { ...event, startsAt: event.startsAt + 86400000 };
  assert.throws(() => send(store, "bea", "event:tea", "nový den", original.own.id), referenceError);
});

test("failed sender transport never broadcasts, and accepted origins expire at the TTL", () => {
  let now = 1;
  const store = new Community(() => now);
  for (const id of ["adam", "bea"]) store.players.set(id, player(id));
  const senderFailure = send(store, "bea", "global", "bez spojení", undefined, id => id === "adam");
  assert.equal(senderFailure.ok, false);
  assert.equal(senderFailure.delivered.size, 0);
  const original = send(store, "adam", "global", "první");
  now = 600_000;
  assert.deepEqual(send(store, "bea", "global", "ještě jde", original.own.id).own.reply, quote(original.own));
  now = 600_001;
  assert.throws(() => send(store, "bea", "global", "právě vypršela", original.own.id), referenceError);
  const next = send(store, "adam", "global", "druhá");
  store.clearChatOrigins();
  assert.throws(() => send(store, "bea", "global", "nová místnost", next.own.id), referenceError);
});

test("room index removes oldest messages when number or audience grants exceed the budget", () => {
  const store = new Community();
  store.players.set("adam", player("adam"));
  store.players.set("bea", player("bea"));
  const original = send(store, "adam", "global", "původní").own;
  let retained = original;
  for (let i = 0; i < 512; i++) {
    store.rates.clear();
    retained = send(store, "adam", "global", "nová").own;
  }
  assert.throws(() => send(store, "bea", "global", "nejstarší", original.id), referenceError);
  assert.deepEqual(send(store, "bea", "global", "nejnovější", retained.id).own.reply, quote(retained));

  store.clearChatOrigins();
  for (let i = 0; i < 30; i++) store.players.set("extra-" + i, player("extra-" + i));
  const wide = send(store, "adam", "global", "stará široká").own;
  for (let i = 0; i < 256; i++) {
    store.rates.clear();
    retained = send(store, "adam", "global", "nová široká").own;
  }
  assert.throws(() => send(store, "bea", "global", "stará", wide.id), referenceError);
  assert.deepEqual(send(store, "bea", "global", "nová", retained.id).own.reply, quote(retained));
});

test("reference errors share a generic result and quote excerpts preserve valid Unicode", () => {
  const store = new Community();
  for (const id of ["adam", "bea"]) store.players.set(id, player(id));
  const original = send(store, "adam", "global", "a".repeat(139) + "😀 nová zpráva").own;
  const answer = send(store, "bea", "global", "odpověď", original.id);
  assert.deepEqual(answer.own.reply, { ...quote(original), text: "a".repeat(139) + "…" });
  for (const invalid of ["", " ordinary message id ", 14, null]) {
    assert.throws(() => send(store, "bea", "global", "nedostupná", invalid), referenceError);
  }
});
