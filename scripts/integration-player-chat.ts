import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { Client, type Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION } from "../shared/netcode";
import {
  DEFAULT_PROFILE,
  type ChatMessage,
  type ChatSendResult,
  type EventItem,
  type SocialState,
} from "../shared/types";

const configuredUrl = process.env.STRAHOV_TEST_URL;
assert.ok(
  configuredUrl,
  "Set STRAHOV_TEST_URL to the isolated server's loopback URL.",
);
const base = new URL(configuredUrl);
assert.ok(
  ["http:", "https:"].includes(base.protocol) &&
    ["127.0.0.1", "[::1]", "localhost"].includes(base.hostname) &&
    !base.username &&
    !base.password &&
    base.href === base.origin + "/",
  "Use a loopback origin on the owned integration server (SSH forwarding is supported).",
);
const endpoint = base.origin;
const timeoutMs = 8_000;

function boundedFetch(url: string | URL | Request, init?: RequestInit) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return fetch(url, {
    ...init,
    redirect: "error",
    signal: init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout,
  });
}

const api = (path: string, options?: RequestInit) =>
  boundedFetch(endpoint + path, options);
const sdk = new Client(endpoint, {
  fetchFn: boundedFetch,
  urlBuilder(url) {
    assert.equal(
      url.host,
      base.host,
      "Matchmaking must stay on the isolated server.",
    );
    assert.ok(
      url.protocol === base.protocol ||
        url.protocol === (base.protocol === "https:" ? "wss:" : "ws:"),
      "Matchmaking must use the configured HTTP or WebSocket protocol.",
    );
    return url.href;
  },
});

type Session = { id: string; token: string; worldId: string };
type Peer = {
  id: string;
  room: Room;
  messages: ChatMessage[];
  results: ChatSendResult[];
  social?: SocialState;
  events: EventItem[];
};

const peers: Peer[] = [];
const runId = randomUUID().slice(0, 8);
const evidence = {
  startedAt: new Date().toISOString(),
  endpoint,
  protocol: PROTOCOL_VERSION,
  harnessSha256: createHash("sha256")
    .update(await readFile(import.meta.filename))
    .digest("hex"),
  checks: [] as string[],
  lastStage: "isolated world preflight",
  failure: null as string | null,
  failedStage: null as string | null,
  onlineAfterCleanup: null as number | null,
};

async function ready<T>(label: string, read: () => T | undefined): Promise<T> {
  evidence.lastStage = label;
  const deadline = performance.now() + timeoutMs;
  do {
    const result = read();
    if (result !== undefined) return result;
    await sleep(25);
  } while (performance.now() < deadline);
  throw new Error("Timeout: " + label);
}

async function deadline<T>(
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      action(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Timeout: " + label)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function online(): Promise<number> {
  const response = await api("/api/presence");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(
    Object.keys(body),
    ["online"],
    "Public presence contains only the aggregate.",
  );
  assert.ok(Number.isSafeInteger(body.online) && body.online >= 0);
  return body.online;
}

async function waitOnline(expected: number) {
  const deadline = performance.now() + timeoutMs;
  do {
    const count = await online();
    if (count === expected) return count;
    await sleep(50);
  } while (performance.now() < deadline);
  throw new Error("Timeout: expected " + expected + " connected players.");
}

async function issue(nickname: string): Promise<Session> {
  const response = await api("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "multiplayer",
      profile: { ...DEFAULT_PROFILE, nickname },
    }),
  });
  assert.equal(
    response.status,
    200,
    "Use an isolated server in STRAHOV_AUTH_MODE=local.",
  );
  const session = (await response.json()) as Session;
  assert.ok(
    session.id && session.token && session.worldId,
    "Incomplete player session.",
  );
  return session;
}

async function join(session: Session): Promise<Peer> {
  let expired = false;
  try {
    return await deadline("SDK join", async () => {
      const room = await sdk.joinById(session.worldId, {
        token: session.token,
        protocol: PROTOCOL_VERSION,
      });
      if (expired) {
        room.connection.close();
        throw new Error("SDK join completed after its deadline.");
      }
      room.reconnection.enabled = false;
      const peer: Peer = {
        id: session.id,
        room,
        messages: [],
        results: [],
        events: [],
      };
      peers.push(peer);
      room.onMessage<ChatMessage>("chat", (message) =>
        peer.messages.push(message),
      );
      room.onMessage<ChatSendResult>("chat-result", (result) =>
        peer.results.push(result),
      );
      room.onMessage<SocialState>("social", (social) => {
        peer.social = social;
      });
      room.onMessage<EventItem[]>("events", (events) => {
        peer.events = events;
      });
      room.onMessage<{ events: EventItem[] }>("welcome", (data) => {
        peer.events = data.events;
      });
      room.onMessage("*", () => {});
      return peer;
    });
  } catch (error) {
    expired = true;
    throw error;
  }
}

const find = (peer: Peer, text: string) =>
  peer.messages.find((message) => message.text === text);
const received = (peer: Peer, text: string) =>
  ready("deliver " + text, () => find(peer, text));

/** A PING reply crosses the same ordered WebSocket as chat. */
const flush = (peer: Peer) =>
  deadline(
    "SDK WebSocket ping",
    () => new Promise<void>((resolve) => peer.room.ping(() => resolve())),
  );

function original(message: ChatMessage) {
  const { id, sender, nickname, text } = message;
  return { id, sender, nickname, text };
}

async function send(
  peer: Peer,
  channel: string,
  text: string,
  replyTo?: string,
) {
  const requestId = randomUUID();
  peer.room.send("chat", {
    channel,
    text,
    requestId,
    ...(replyTo ? { replyTo } : {}),
  });
  const result = await ready("chat result for " + text, () =>
    peer.results.find((value) => value.requestId === requestId),
  );
  const otherPeers = peers.filter((other) => other !== peer);
  await Promise.all(otherPeers.map(flush));
  for (const other of otherPeers) {
    assert.equal(
      other.results.some((value) => value.requestId === requestId),
      false,
      "Only the sending player's session can receive a send result.",
    );
  }
  return result;
}

function attend(peer: Peer, eventId: string, enabled: boolean) {
  peer.room.send("attend", { eventId, enabled });
  return ready((enabled ? "join " : "leave ") + eventId, () => {
    if (!peer.social) return undefined;
    const joined = peer.social.attendance.some(
      (value) => value.eventId === eventId && value.playerId === peer.id,
    );
    return joined === enabled ? true : undefined;
  });
}

let eventOwner: Peer | undefined;
let event: EventItem | undefined;
const check = (label: string) => {
  evidence.checks.push(label);
  console.log("PASS: " + label);
};

try {
  assert.deepEqual(await (await api("/api/health")).json(), {
    ok: true,
    demo: true,
  });
  assert.deepEqual(
    await (await api("/api/auth/session")).json(),
    { mode: "local", account: null },
    "Use an isolated server in STRAHOV_AUTH_MODE=local.",
  );
  assert.equal(await online(), 0, "The integration world must start empty.");
  assert.equal(
    (
      await api("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "guest" }),
      })
    ).status,
    403,
    "Guest cannot receive a multiplayer session.",
  );
  assert.equal(
    (await api("/api/chat")).status,
    403,
    "Chat is not exposed on public HTTP.",
  );
  check("guest boundary and empty isolated world");

  const names = ["Alice", "Bob", "Cyril"].map(
    (name) => "QA " + name + " " + runId,
  );
  const sessions = await Promise.all(names.map(issue));
  assert.equal(new Set(sessions.map((session) => session.id)).size, 3);
  assert.equal(
    new Set(sessions.map((session) => session.worldId)).size,
    1,
    "Players share one world.",
  );
  const alice = await join(sessions[0]);
  const bob = await join(sessions[1]);
  const cyril = await join(sessions[2]);
  await waitOnline(3);
  check("three connected SDK players in the same room");

  const globalText = "QA Ahoj ze Strahova " + runId;
  alice.room.send("chat", { channel: "global", text: globalText });
  const [globalMessage, bobGlobal, cyrilGlobal] = await Promise.all(
    peers.map((peer) => received(peer, globalText)),
  );
  assert.deepEqual(bobGlobal, globalMessage);
  assert.deepEqual(cyrilGlobal, globalMessage);
  assert.equal(globalMessage.sender, alice.id);
  assert.equal(globalMessage.nickname, names[0]);
  assert.equal(Object.hasOwn(globalMessage, "reply"), false);
  const globalAnswer = "QA Odpověď všem " + runId;
  assert.equal(
    (await send(bob, "global", globalAnswer, bobGlobal.id)).ok,
    true,
  );
  for (const peer of peers) {
    const answer = await received(peer, globalAnswer);
    assert.equal(answer.sender, bob.id);
    assert.equal(answer.channel, "global");
    assert.deepEqual(answer.reply, original(globalMessage));
  }
  check(
    "legacy global chat and exact global reply with a private send acknowledgement",
  );

  const nearbyQuestion = "QA Kudy k bloku šest " + runId;
  assert.equal((await send(alice, "local", nearbyQuestion)).ok, true);
  const nearbyMessage = await received(bob, nearbyQuestion);
  assert.equal(nearbyMessage.channel, "local");
  assert.equal((await received(cyril, nearbyQuestion)).id, nearbyMessage.id);
  const nearbyAnswer = "QA Pozdrav v okolí " + runId;
  assert.equal(
    (await send(bob, "local", nearbyAnswer, nearbyMessage.id)).ok,
    true,
  );
  for (const peer of peers) {
    const answer = await received(peer, nearbyAnswer);
    assert.equal(answer.channel, "local");
    assert.deepEqual(answer.reply, original(nearbyMessage));
  }
  check("nearby players receive the local reply at the shared spawn");

  const title = "QA Setkání " + runId;
  eventOwner = alice;
  alice.room.send("saveEvent", {
    title,
    description: "Smoke test",
    placeId: "b6",
    startsAt: Date.now() + 60_000,
    endsAt: Date.now() + 120_000,
  });
  event = await ready("create chat test event", () =>
    alice.events.find((value) => value.title === title),
  );
  const eventChannel = "event:" + event.id;
  await Promise.all([
    attend(alice, event.id, true),
    attend(bob, event.id, true),
  ]);
  const eventText = "QA Otázka účastníkům " + runId;
  assert.equal((await send(alice, eventChannel, eventText)).ok, true);
  const eventMessage = await received(bob, eventText);
  assert.equal(find(cyril, eventText), undefined);
  await attend(cyril, event.id, true);
  const eventAnswer = "QA Odpověď účastníkům " + runId;
  assert.equal(
    (await send(bob, eventChannel, eventAnswer, eventMessage.id)).ok,
    true,
  );
  assert.deepEqual(
    (await received(alice, eventAnswer)).reply,
    original(eventMessage),
  );
  assert.deepEqual(
    (await received(bob, eventAnswer)).reply,
    original(eventMessage),
  );
  assert.deepEqual((await received(cyril, eventAnswer)).reply, {
    unavailable: true,
  });
  assert.equal(find(cyril, eventText), undefined);
  check(
    "late event attendee receives the new reply without original message metadata",
  );

  alice.room.send("contact", { to: bob.id });
  await ready(
    "contact request",
    () => bob.social?.requests.includes(alice.id) || undefined,
  );
  bob.room.send("contact", { to: alice.id, accept: true });
  await ready(
    "mutual contact",
    () =>
      (alice.social?.contacts.includes(bob.id) &&
        bob.social?.contacts.includes(alice.id)) ||
      undefined,
  );
  const dmText = "QA Soukromá otázka " + runId;
  assert.equal((await send(alice, "dm:" + bob.id, dmText)).ok, true);
  const dmMessage = await received(bob, dmText);
  const dmAnswer = "QA Soukromá odpověď " + runId;
  assert.equal(
    (await send(bob, "dm:" + alice.id, dmAnswer, dmMessage.id)).ok,
    true,
  );
  assert.deepEqual(
    (await received(alice, dmAnswer)).reply,
    original(dmMessage),
  );
  assert.deepEqual((await received(bob, dmAnswer)).reply, original(dmMessage));
  assert.equal(find(cyril, dmText), undefined);
  assert.equal(find(cyril, dmAnswer), undefined);
  check(
    "both peers receive the DM reference across direction changes, third player sees neither DM",
  );

  bob.room.send("block", { to: alice.id, enabled: true });
  await ready(
    "contact block",
    () =>
      (bob.social?.blocked.includes(alice.id) &&
        alice.social?.contacts.includes(bob.id) === false) ||
      undefined,
  );
  const blockedAnswer = "QA Nepřijatá odpověď " + runId;
  const rejected = await send(
    alice,
    "dm:" + bob.id,
    blockedAnswer,
    dmMessage.id,
  );
  assert.equal(rejected.ok, false);
  if (!rejected.ok)
    assert.ok(
      rejected.reason.trim(),
      "The sender gets an actionable rejection.",
    );
  await flush(alice);
  for (const peer of peers) assert.equal(find(peer, blockedAnswer), undefined);
  check("blocked DM returns a private failure without delivering the message");
} catch (error) {
  evidence.failedStage = evidence.lastStage;
  evidence.failure = error instanceof Error ? error.message : String(error);
  console.error(evidence.lastStage + ": " + evidence.failure);
  process.exitCode = 1;
} finally {
  const cleanup = async () => {
    try {
      if (event && eventOwner?.room.connection.isOpen) {
        const eventId = event.id;
        await Promise.all(
          peers
            .filter((peer) => peer.room.connection.isOpen)
            .map((peer) => attend(peer, eventId, false)),
        );
        eventOwner.room.send("cancelEvent", { id: eventId });
        await ready(
          "cancel test event",
          () =>
            eventOwner?.events.find((value) => value.id === eventId)
              ?.cancelled === true || undefined,
        );
      }
    } finally {
      const results = await Promise.allSettled(
        peers.map(async ({ room }) => {
          if (!room.connection.isOpen) return;
          try {
            await deadline("SDK leave", () => room.leave());
          } catch (error) {
            room.connection.close();
            throw error;
          }
        }),
      );
      if (peers.length) evidence.onlineAfterCleanup = await waitOnline(0);
      for (const result of results)
        if (result.status === "rejected") throw result.reason;
    }
  };
  try {
    await cleanup();
    if (peers.length) check("test players left the room");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    evidence.failure = [evidence.failure, message].filter(Boolean).join("; ");
    console.error("Cleanup: " + message);
    process.exitCode = 1;
  }
  if (process.env.STRAHOV_PLAYER_CHAT_EVIDENCE)
    await writeFile(
      process.env.STRAHOV_PLAYER_CHAT_EVIDENCE,
      JSON.stringify(
        {
          ...evidence,
          status: process.exitCode ? "failed" : "passed",
          finishedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
    );
}
