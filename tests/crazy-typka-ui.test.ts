import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getKnowledgeRegistry } from "../server/crazy-typka-retrieval";
import {
  CrazyTypkaChat,
  createCrazyTypkaClient,
  crazyTypkaErrorLabel,
  safeCitationHref,
  type CrazyTypkaState,
} from "../client/crazy-typka";
import {
  CRAZY_TYPKA_SPEAKER,
  isCrazyTypkaSource,
  type CrazyTypkaSource,
  type CrazyTypkaKnowledgeScope,
  type ExtractedCrazyTypkaSource,
} from "../shared/crazy-typka";

test("new verified SUZ and SHerna citations survive client validation and render their actual URLs", () => {
  const selected = getKnowledgeRegistry().chunks.filter((chunk) =>
    ["suz-housing-payment-methods", "sh-game-room-booking"].includes(chunk.id),
  );
  assert.equal(selected.length, 2);
  const sources = selected.map((chunk) => chunk.source);
  sources.forEach((source) => assert.ok(isCrazyTypkaSource(source)));
  assert.equal(
    isCrazyTypkaSource({ ...sources[0], checkedAt: "2026-02-30" }),
    false,
  );
  for (const url of [
    "https://www.suz.cvut.cz.evil.invalid/cz",
    "https://evil.suz.cvut.cz/cz",
    "https://www.suz.cvut.cz:444/cz",
    "http://www.suz.cvut.cz/cz",
    "https://user:pass@www.suz.cvut.cz/cz",
  ])
    assert.equal(isCrazyTypkaSource({ ...sources[0], url }), false, url);
  const state: CrazyTypkaState = {
    availability: "enabled",
    busy: false,
    draft: "",
    error: null,
    notice: null,
    recovery: "none",
    messages: [{ id: 1, role: "ai", text: "Ověřené odkazy", sources }],
    setDraft() {},
    setKnowledgeScope() {},
    knowledgeScope: { kind: "current" },
    async send() {},
    async retry() {},
    async reset() {},
    async cancel() {},
    async refreshStatus() {},
  };
  const html = renderToStaticMarkup(
    createElement(CrazyTypkaChat, { state, locale: "cs" }),
  );
  for (const source of sources) assert.ok(html.includes(source.url));
  assert.match(html, /2026-10-28/);
});

const token = "a".repeat(64);
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const source: CrazyTypkaSource = {
  id: "membership",
  title: "Členství",
  url: "https://www.siliconhill.cz/pages/clenstvi",
  checkedAt: "2026-10-27",
  author: "Silicon Hill",
  license: null,
  licenseUrl: null,
  adaptation: "curated-paraphrase",
};
const answer = {
  requestSeq: 1,
  speaker: CRAZY_TYPKA_SPEAKER,
  text: "Ahoj <script>alert(1)</script>",
  sources: [source],
};

test("the composer stays editable during a reply and preserves the next draft without another request", async () => {
  let complete!: (response: Response) => void;
  let chats = 0;
  const client = createCrazyTypkaClient({
    request: (async (input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session"))
        return Response.json({ token, expiresAt: Date.now() + 60000 });
      chats++;
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("První otázka");
  const pending = client.send("cs");
  await tick();
  client.setDraft("Rozepsaná další otázka");
  const state: CrazyTypkaState = {
    ...client.getSnapshot(),
    setDraft: client.setDraft,
    setKnowledgeScope: client.setKnowledgeScope,
    send: client.send,
    retry: client.retry,
    reset: client.reset,
    cancel: client.cancel,
    refreshStatus: client.refreshStatus,
  };
  const html = renderToStaticMarkup(
    createElement(CrazyTypkaChat, { state, locale: "cs" }),
  );
  assert.doesNotMatch(html.match(/<textarea\b[^>]*>/)![0], /disabled/);
  assert.match(html.match(/<button\b[^>]*type="submit"[^>]*>/)![0], /disabled/);
  await client.send("cs");
  complete(Response.json(answer));
  await pending;
  assert.equal(client.getSnapshot().draft, "Rozepsaná další otázka");
  assert.equal(chats, 1);
  client.dispose();
});

for (const expiry of ["clock", "server"] as const)
  test(`a ${expiry}-expired conversation starts visibly fresh and keeps the new message`, async () => {
    let instant = 1000,
      sessions = 0,
      rejected = false;
    const client = createCrazyTypkaClient({
      now: () => instant,
      request: (async (input, init) => {
        if (init?.method === "DELETE")
          return new Response(null, { status: 204 });
        if (String(input).endsWith("status"))
          return Response.json({ enabled: true });
        if (String(input).endsWith("session")) {
          sessions++;
          return Response.json({ token, expiresAt: instant + 100 });
        }
        if (expiry === "server" && instant === 1050 && !rejected) {
          rejected = true;
          return Response.json({ error: "session-expired" }, { status: 401 });
        }
        return Response.json(answer);
      }) as typeof fetch,
    });
    await client.refreshStatus();
    client.setDraft("Původní otázka");
    await client.send("cs");
    instant = expiry === "clock" ? 1200 : 1050;
    if (expiry === "server") {
      client.setDraft("Vypršelo to na serveru?");
      await client.send("cs");
      assert.equal(client.getSnapshot().error, "session-expired");
    }
    client.setDraft("Nová otázka");
    await client.send("cs");
    const snapshot = client.getSnapshot();
    assert.equal(sessions, 2);
    assert.equal(snapshot.notice, "session-restarted");
    assert.deepEqual(
      snapshot.messages.map((message) => message.text),
      ["Nová otázka", answer.text],
    );
    const state: CrazyTypkaState = {
      ...snapshot,
      setDraft: client.setDraft,
      setKnowledgeScope: client.setKnowledgeScope,
      send: client.send,
      retry: client.retry,
      reset: client.reset,
      cancel: client.cancel,
      refreshStatus: client.refreshStatus,
    };
    assert.match(
      renderToStaticMarkup(
        createElement(CrazyTypkaChat, { state, locale: "cs" }),
      ),
      /Předchozí relace vypršela/,
    );
    await client.reset();
    assert.equal(client.getSnapshot().notice, null);
    client.dispose();
  });

test("status check never issues a session or paid request; disabled sends are inert", async () => {
  const calls: string[] = [];
  const client = createCrazyTypkaClient({
    request: (async (input) => {
      calls.push(String(input));
      return Response.json({ enabled: false });
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("Ahoj");
  await client.send("cs");
  assert.deepEqual(calls, ["/api/ai/status"]);
  assert.equal(client.getSnapshot().messages.length, 0);
  client.dispose();
});

test("private client uses a server session, sends no client history and keeps its token out of snapshots", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  const client = createCrazyTypkaClient({
    request: (async (input, init) => {
      const url = String(input);
      requests.push({ url, init });
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (url.endsWith("status")) return Response.json({ enabled: true });
      if (url.endsWith("session"))
        return Response.json({ token, expiresAt: Date.now() + 60000 });
      return Response.json(answer);
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("Jak se přidám?");
  await client.send("cs");
  assert.deepEqual(
    JSON.parse(
      String(requests.find((value) => value.url.endsWith("chat"))!.init?.body),
    ),
    { token, requestSeq: 1, message: "Jak se přidám?", locale: "cs" },
  );
  assert.equal(client.getSnapshot().messages.length, 2);
  assert.doesNotMatch(JSON.stringify(client.getSnapshot()), new RegExp(token));
  await client.reset();
  assert.equal(client.getSnapshot().messages.length, 0);
  assert.equal(
    (requests.at(-1)?.init?.headers as Record<string, string>).Authorization,
    `Bearer ${token}`,
  );
  client.dispose();
});

test("reset aborts pending generation and ignores an answer arriving after deletion", async () => {
  let finish!: (value: Response) => void;
  let chatSignal: AbortSignal | null | undefined;
  let chatCalls = 0;
  let deletes = 0;
  const client = createCrazyTypkaClient({
    request: (async (input, init) => {
      if (init?.method === "DELETE") {
        deletes++;
        return new Response(null, { status: 204 });
      }
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session"))
        return Response.json({ token, expiresAt: Date.now() + 60000 });
      chatCalls++;
      chatSignal = init?.signal;
      return await new Promise<Response>((resolve) => (finish = resolve));
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("První zpráva");
  const pending = client.send("cs");
  await tick();
  client.setDraft("Nesmí spustit druhou generaci");
  await client.send("cs");
  assert.equal(chatCalls, 1);
  await client.reset();
  assert.equal(chatSignal?.aborted, true);
  assert.equal(deletes, 1);
  finish(Response.json(answer));
  await pending;
  assert.equal(client.getSnapshot().messages.length, 0);
  assert.equal(client.getSnapshot().busy, false);
  client.dispose();
});

test("a late session after cancellation is revoked and never used for generation", async () => {
  let finish!: (value: Response) => void;
  const calls: string[] = [];
  const client = createCrazyTypkaClient({
    request: (async (input, init) => {
      calls.push(`${init?.method ?? "GET"} ${input}`);
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      return await new Promise<Response>((resolve) => (finish = resolve));
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("Ahoj");
  const pending = client.send("en");
  await tick();
  await client.cancel();
  finish(Response.json({ token, expiresAt: Date.now() + 60000 }));
  await pending;
  await tick();
  assert.deepEqual(calls, [
    "GET /api/ai/status",
    "POST /api/ai/session",
    "DELETE /api/ai/session",
  ]);
  assert.equal(client.getSnapshot().messages.length, 0);
  client.dispose();
});

test("invalid model response is rejected without rendering its content or automatic retry", async () => {
  let chats = 0;
  const client = createCrazyTypkaClient({
    request: (async (input) => {
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session"))
        return Response.json({ token, expiresAt: Date.now() + 60000 });
      chats++;
      return Response.json({
        ...answer,
        sources: [{ ...source, url: "javascript:alert(1)" }],
      });
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("Členství");
  await client.send("cs");
  assert.equal(client.getSnapshot().error, "invalid-response");
  assert.equal(client.getSnapshot().messages.length, 1);
  assert.equal(chats, 1);
  client.dispose();
});

test("timeout stops the client request and presents an error without retrying", async () => {
  let calls = 0;
  const client = createCrazyTypkaClient({
    timeoutMs: 5,
    request: (async (input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session"))
        return Response.json({ token, expiresAt: Date.now() + 60000 });
      calls++;
      return await new Promise<Response>((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        ),
      );
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("Ahoj");
  await client.send("cs");
  assert.equal(client.getSnapshot().error, "request-timeout");
  assert.equal(client.getSnapshot().busy, false);
  assert.equal(calls, 1);
  client.dispose();
});

test("failed server deletion reports uncertainty while clearing local memory", async () => {
  const client = createCrazyTypkaClient({
    request: (async (input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 503 });
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session"))
        return Response.json({ token, expiresAt: Date.now() + 60000 });
      return Response.json(answer);
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("Ahoj");
  await client.send("cs");
  await client.reset();
  assert.equal(client.getSnapshot().messages.length, 0);
  assert.equal(client.getSnapshot().error, "reset-unconfirmed");
  client.dispose();
});

test("widget is transparent, escaped and localized with source attribution", () => {
  const state: CrazyTypkaState = {
    availability: "enabled",
    busy: false,
    draft: "",
    error: null,
    notice: null,
    recovery: "none",
    messages: [{ id: 1, role: "ai", text: answer.text, sources: [source] }],
    setDraft() {},
    setKnowledgeScope() {},
    knowledgeScope: { kind: "current" },
    async send() {},
    async retry() {},
    async reset() {},
    async cancel() {},
    async refreshStatus() {},
  };
  for (const locale of ["cs", "en"] as const) {
    const html = renderToStaticMarkup(
      createElement(CrazyTypkaChat, { state, locale }),
    );
    assert.equal((html.match(/class="crazy-ai-badge"/g) ?? []).length, 2);
    assert.match(html, /OpenAI/);
    assert.match(html, /&lt;script&gt;/);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /rel="noopener noreferrer"/);
    assert.match(html, /2026-10-27/);
    assert.match(html, /Silicon Hill/);
    assert.match(
      html,
      locale === "cs"
        ? /Ostatní hráči ji nevidí/
        : /Other players cannot see it/,
    );
  }
});

test("source links and unknown error codes cannot smuggle URL schemes or inherited content", () => {
  assert.equal(safeCitationHref("javascript:alert(1)"), undefined);
  assert.equal(safeCitationHref("https://user:pass@example.com"), undefined);
  assert.equal(safeCitationHref("/relative"), undefined);
  assert.equal(safeCitationHref(source.url), source.url);
  assert.equal(
    crazyTypkaErrorLabel("constructor", "en"),
    "The answer could not be completed safely. Please try again later.",
  );
});

test("retired availability checks cannot update a disposed or remounted client", async () => {
  const pending: ((response: Response) => void)[] = [];
  const client = createCrazyTypkaClient({
    request: (async () =>
      await new Promise<Response>((resolve) =>
        pending.push(resolve),
      )) as typeof fetch,
  });
  const first = client.refreshStatus();
  client.dispose();
  const second = client.refreshStatus();
  pending[1](Response.json({ enabled: false }));
  await second;
  pending[0](Response.json({ enabled: true }));
  await first;
  assert.equal(client.getSnapshot().availability, "disabled");
  client.dispose();
});

type ChatPayload = {
  token: string;
  requestSeq: number;
  message: string;
  locale: "cs" | "en";
  knowledgeScope?: CrazyTypkaKnowledgeScope;
};
function refinementFixture(
  reply: (
    payload: ChatPayload,
    attempt: number,
  ) => Response | Promise<Response>,
  options: { now?: () => number; ttl?: number } = {},
) {
  const payloads: ChatPayload[] = [];
  const bodies: string[] = [];
  let sessions = 0;
  const now = options.now ?? Date.now;
  const client = createCrazyTypkaClient({
    now,
    request: (async (input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session")) {
        sessions++;
        return Response.json({
          token: sessions.toString(16).padStart(64, "0"),
          expiresAt: now() + (options.ttl ?? 60000),
        });
      }
      const body = String(init?.body);
      const payload = JSON.parse(body) as ChatPayload;
      bodies.push(body);
      payloads.push(payload);
      return await reply(payload, payloads.length);
    }) as typeof fetch,
  });
  return { client, payloads, bodies, sessions: () => sessions };
}
function chatState(
  client: ReturnType<typeof createCrazyTypkaClient>,
): CrazyTypkaState {
  return {
    ...client.getSnapshot(),
    setDraft: client.setDraft,
    setKnowledgeScope: client.setKnowledgeScope,
    send: client.send,
    retry: client.retry,
    reset: client.reset,
    cancel: client.cancel,
    refreshStatus: client.refreshStatus,
  };
}

test("archive control captures scope for exact recovery and reset restores current", async () => {
  const f = refinementFixture((payload, attempt) => {
    if (attempt === 1) throw Error("uncertain response");
    return Response.json({ ...answer, requestSeq: payload.requestSeq });
  });
  await f.client.refreshStatus();
  const scope = { kind: "archive" as const, asOf: "2020-06-01T00:00:00.000Z" };
  f.client.setKnowledgeScope(scope);
  f.client.setDraft("Starší podmínky");
  await f.client.send("cs");
  assert.deepEqual(f.payloads[0].knowledgeScope, scope);
  assert.deepEqual(f.client.getSnapshot().knowledgeScope, scope);
  f.client.setKnowledgeScope({ kind: "current" });
  assert.deepEqual(
    f.client.getSnapshot().knowledgeScope,
    scope,
    "pending operation cannot be retargeted",
  );
  await f.client.retry();
  assert.equal(f.bodies[1], f.bodies[0]);
  assert.deepEqual(
    f.client.getSnapshot().messages.at(-1)?.knowledgeScope,
    scope,
  );
  f.client.setKnowledgeScope({ kind: "current" });
  assert.equal(f.client.getSnapshot().notice, "scope-changed");
  assert.equal(f.client.getSnapshot().messages.length, 2);
  await f.client.reset();
  assert.deepEqual(f.client.getSnapshot().knowledgeScope, { kind: "current" });
  f.client.dispose();
});

test("document citations render extraction, archive interval and locators for each distinct version", () => {
  const first: ExtractedCrazyTypkaSource = {
    ...source,
    id: "a".repeat(64),
    title: "Archivní smlouva",
    sourceId: "suz-document",
    sourceVersionId: "a".repeat(64),
    publisher: "suz",
    status: "archived",
    adaptation: "document-extraction",
    url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty",
    extractionMethod: "openai",
    documentFormat: "pdf",
    pageCount: 2,
    effectiveFrom: "2020-01-01T00:00:00.000Z",
    effectiveUntil: "2021-01-01T00:00:00.000Z",
    locators: [{ text: "PDF strana 2", page: 2 }],
  };
  const second = {
    ...first,
    id: "b".repeat(64),
    sourceVersionId: "b".repeat(64),
    title: "Další archivní verze",
  };
  assert.ok(isCrazyTypkaSource(first));
  assert.ok(isCrazyTypkaSource(second));
  const client = createCrazyTypkaClient({
    request: async () => Response.json({ enabled: false }),
  });
  const html = renderToStaticMarkup(
    createElement(CrazyTypkaChat, {
      locale: "cs",
      state: {
        ...chatState(client),
        availability: "enabled",
        knowledgeScope: { kind: "archive" },
        messages: [
          {
            id: 1,
            role: "ai",
            text: "Historická odpověď",
            sources: [first, second],
            knowledgeScope: { kind: "archive" },
          },
        ],
      },
    }),
  );
  assert.match(html, /Archivní podklady/);
  assert.match(html, /extrakce dokumentu \(openai\)/);
  assert.match(html, /PDF strana 2/);
  assert.match(html, /2020-01-01/);
  assert.match(html, /Další archivní verze/);
  assert.doesNotMatch(html, /stručná parafráze/);
  assert.match(html, /datetime-local/);
  client.dispose();
});

test("lost answer recovery reuses the exact message, locale and sequence while preserving the next draft", async () => {
  const f = refinementFixture((payload, attempt) => {
    if (attempt === 1) throw new Error("response lost after server completed");
    return Response.json({ ...answer, requestSeq: payload.requestSeq });
  });
  await f.client.refreshStatus();
  f.client.setDraft("  Jak se přidám?  ");
  await f.client.send("cs");
  assert.equal(f.client.getSnapshot().recovery, "retry");
  assert.equal(f.payloads.length, 1, "recovery is never automatic");
  f.client.setDraft("My next question, not the retry");
  await f.client.send("en");
  assert.equal(
    f.payloads.length,
    1,
    "new sends cannot skip an unresolved answer",
  );
  const html = renderToStaticMarkup(
    createElement(CrazyTypkaChat, { state: chatState(f.client), locale: "en" }),
  );
  assert.match(html, /Recover answer/);
  assert.match(html.match(/<button\b[^>]*type="submit"[^>]*>/)![0], /disabled/);
  assert.doesNotMatch(html.match(/<textarea\b[^>]*>/)![0], /disabled/);
  await f.client.retry();
  assert.equal(f.bodies[1], f.bodies[0]);
  assert.equal(f.payloads[1].message, "Jak se přidám?");
  assert.equal(f.payloads[1].locale, "cs");
  assert.equal(f.payloads[1].requestSeq, 1);
  assert.equal(f.client.getSnapshot().draft, "My next question, not the retry");
  assert.deepEqual(
    f.client.getSnapshot().messages.map((message) => message.role),
    ["user", "ai"],
  );
  assert.equal(f.client.getSnapshot().recovery, "none");
  assert.doesNotMatch(
    JSON.stringify(f.client.getSnapshot()),
    new RegExp(f.payloads[0].token),
  );
  assert.equal("requestSeq" in f.client.getSnapshot(), false);
  await f.client.send("en");
  assert.equal(f.payloads[2].requestSeq, 2);
  assert.equal(f.payloads[2].locale, "en");
  assert.equal(f.payloads[2].message, "My next question, not the retry");
  f.client.dispose();
});

for (const code of [
  "blocked",
  "provider-unavailable",
  "response-expired",
] as const)
  test(`a confirmed ${code} ends its operation and the next intentional send advances once`, async () => {
    const f = refinementFixture((payload, attempt) =>
      attempt === 1
        ? Response.json(
            { error: code, requestSeq: payload.requestSeq },
            { status: 409 },
          )
        : Response.json({ ...answer, requestSeq: payload.requestSeq }),
    );
    await f.client.refreshStatus();
    f.client.setDraft("First");
    await f.client.send("en");
    assert.equal(f.client.getSnapshot().error, code);
    assert.equal(f.client.getSnapshot().recovery, "none");
    await f.client.retry();
    assert.equal(
      f.payloads.length,
      1,
      "confirmed errors are not recovered as a new generation",
    );
    f.client.setDraft("Second");
    await f.client.send("en");
    assert.deepEqual(
      f.payloads.map((payload) => payload.requestSeq),
      [1, 2],
    );
    assert.equal(f.client.getSnapshot().messages.length, 3);
    f.client.dispose();
  });

test("pending busy and unconfirmed admission errors keep one recoverable operation", async () => {
  const f = refinementFixture((payload, attempt) =>
    attempt <= 2
      ? Response.json(
          { error: attempt === 1 ? "busy" : "rate-limited" },
          { status: attempt === 1 ? 409 : 429 },
        )
      : Response.json({ ...answer, requestSeq: payload.requestSeq }),
  );
  await f.client.refreshStatus();
  f.client.setDraft("Same question");
  await f.client.send("en");
  assert.equal(f.client.getSnapshot().recovery, "retry");
  await f.client.retry();
  assert.equal(f.client.getSnapshot().recovery, "retry");
  await f.client.retry();
  assert.deepEqual(f.bodies, [f.bodies[0], f.bodies[0], f.bodies[0]]);
  assert.deepEqual(
    f.client.getSnapshot().messages.map((message) => message.role),
    ["user", "ai"],
  );
  f.client.dispose();
});

for (const malformed of [
  "body",
  "success-sequence",
  "error-sequence",
  "missing-sequence",
] as const)
  test(`${malformed} uncertainty cannot advance sequence or display an unconfirmed reply`, async () => {
    const f = refinementFixture((payload, attempt) => {
      if (attempt > 1)
        return Response.json({ ...answer, requestSeq: payload.requestSeq });
      if (malformed === "body") return new Response("{", { status: 200 });
      if (malformed === "error-sequence")
        return Response.json(
          { error: "blocked", requestSeq: 2 },
          { status: 403 },
        );
      if (malformed === "missing-sequence") {
        const { requestSeq, ...unconfirmed } = answer;
        return Response.json(unconfirmed);
      }
      return Response.json({ ...answer, requestSeq: 2 });
    });
    await f.client.refreshStatus();
    f.client.setDraft("Question");
    await f.client.send("en");
    assert.equal(f.client.getSnapshot().recovery, "retry");
    assert.equal(f.client.getSnapshot().messages.length, 1);
    f.client.setDraft("Next question");
    await f.client.send("cs");
    assert.equal(f.payloads.length, 1);
    await f.client.retry();
    assert.equal(f.bodies[1], f.bodies[0]);
    assert.equal(f.client.getSnapshot().draft, "Next question");
    assert.equal(f.client.getSnapshot().messages.length, 2);
    f.client.dispose();
  });

for (const code of ["request-conflict", "request-out-of-order"] as const)
  test(`${code} requires reset and never tries a guessed next sequence`, async () => {
    const f = refinementFixture((payload, attempt) =>
      attempt === 1
        ? Response.json({ error: code }, { status: 409 })
        : Response.json({ ...answer, requestSeq: payload.requestSeq }),
    );
    await f.client.refreshStatus();
    f.client.setDraft("Question");
    await f.client.send("cs");
    assert.equal(f.client.getSnapshot().recovery, "reset");
    f.client.setDraft("Another");
    await f.client.send("en");
    await f.client.retry();
    assert.equal(f.payloads.length, 1);
    const html = renderToStaticMarkup(
      createElement(CrazyTypkaChat, {
        state: chatState(f.client),
        locale: "cs",
      }),
    );
    assert.match(html, /Začít novou konverzaci/);
    assert.doesNotMatch(
      html,
      /Obnovit odpověď|requestSeq|request-conflict|request-out-of-order/,
    );
    await f.client.reset();
    f.client.setDraft("Fresh");
    await f.client.send("en");
    assert.deepEqual(
      f.payloads.map((payload) => payload.requestSeq),
      [1, 1],
    );
    assert.notEqual(f.payloads[0].token, f.payloads[1].token);
    f.client.dispose();
  });

for (const expiry of ["clock", "server"] as const)
  test(`${expiry} expiry retires an uncertain operation and a fresh session begins at one`, async () => {
    let instant = 1000;
    const f = refinementFixture(
      (payload, attempt) => {
        if (attempt === 1) throw new Error("lost answer");
        if (expiry === "server" && attempt === 2)
          return Response.json({ error: "session-expired" }, { status: 401 });
        return Response.json({ ...answer, requestSeq: payload.requestSeq });
      },
      { now: () => instant, ttl: 100 },
    );
    await f.client.refreshStatus();
    f.client.setDraft("Old");
    await f.client.send("en");
    f.client.setDraft("New draft");
    if (expiry === "clock") instant = 1200;
    await f.client.retry();
    assert.equal(f.client.getSnapshot().recovery, "none");
    assert.equal(f.client.getSnapshot().error, "session-expired");
    assert.equal(f.client.getSnapshot().draft, "New draft");
    await f.client.send("cs");
    assert.equal(f.payloads.at(-1)?.requestSeq, 1);
    assert.notEqual(f.payloads.at(-1)?.token, f.payloads[0].token);
    assert.equal(f.client.getSnapshot().notice, "session-restarted");
    assert.deepEqual(
      f.client.getSnapshot().messages.map((message) => message.text),
      ["New draft", answer.text],
    );
    assert.equal(f.sessions(), 2);
    f.client.dispose();
  });

for (const action of ["reset", "dispose"] as const)
  test(`${action} invalidates a pending recovery and its late reply cannot alter a replacement session`, async () => {
    let complete!: (response: Response) => void;
    const f = refinementFixture((payload, attempt) => {
      if (attempt === 1) throw new Error("lost answer");
      if (attempt === 2)
        return new Promise<Response>((resolve) => {
          complete = resolve;
        });
      return Response.json({
        ...answer,
        text: "New reply",
        requestSeq: payload.requestSeq,
      });
    });
    await f.client.refreshStatus();
    f.client.setDraft("Old");
    await f.client.send("en");
    const recovery = f.client.retry();
    await tick();
    await f.client[action]();
    if (action === "dispose") await f.client.refreshStatus();
    f.client.setDraft("New");
    await f.client.send("cs");
    complete(Response.json(answer));
    await recovery;
    assert.equal(f.client.getSnapshot().recovery, "none");
    assert.deepEqual(
      f.client.getSnapshot().messages.map((message) => message.text),
      ["New", "New reply"],
    );
    assert.deepEqual(
      f.payloads.map((payload) => payload.requestSeq),
      [1, 1, 1],
    );
    assert.notEqual(f.payloads[0].token, f.payloads[2].token);
    f.client.dispose();
  });

test("an uncertain session creation can be explicitly recovered without adding another user message", async () => {
  let sessions = 0;
  let chat: ChatPayload | undefined;
  const client = createCrazyTypkaClient({
    request: (async (input, init) => {
      if (init?.method === "DELETE") return new Response(null, { status: 204 });
      if (String(input).endsWith("status"))
        return Response.json({ enabled: true });
      if (String(input).endsWith("session")) {
        if (++sessions === 1) throw new Error("session response lost");
        return Response.json({ token, expiresAt: Date.now() + 60000 });
      }
      chat = JSON.parse(String(init?.body)) as ChatPayload;
      return Response.json(answer);
    }) as typeof fetch,
  });
  await client.refreshStatus();
  client.setDraft("Original");
  await client.send("cs");
  assert.equal(client.getSnapshot().recovery, "retry");
  client.setDraft("Keep my draft");
  await client.retry();
  assert.deepEqual(chat, {
    token,
    requestSeq: 1,
    message: "Original",
    locale: "cs",
  });
  assert.equal(client.getSnapshot().draft, "Keep my draft");
  assert.equal(client.getSnapshot().messages.length, 2);
  client.dispose();
});

test("recovery of a confirmed cached error advances only after that result is delivered", async () => {
  const f = refinementFixture((payload, attempt) => {
    if (attempt === 1) throw new Error("cached moderation result was lost");
    if (attempt === 2)
      return Response.json(
        { error: "blocked", requestSeq: payload.requestSeq },
        { status: 403 },
      );
    return Response.json({ ...answer, requestSeq: payload.requestSeq });
  });
  await f.client.refreshStatus();
  f.client.setDraft("First");
  await f.client.send("en");
  f.client.setDraft("Next draft");
  await f.client.retry();
  assert.equal(f.client.getSnapshot().error, "blocked");
  assert.equal(f.client.getSnapshot().recovery, "none");
  assert.equal(f.client.getSnapshot().messages.length, 1);
  assert.equal(f.client.getSnapshot().draft, "Next draft");
  await f.client.send("cs");
  assert.deepEqual(
    f.payloads.map((payload) => payload.requestSeq),
    [1, 1, 2],
  );
  assert.equal(f.bodies[0], f.bodies[1]);
  f.client.dispose();
});

test("an answer arriving after local session expiry cannot revive that conversation", async () => {
  let instant = 1000;
  let finish!: (response: Response) => void;
  const f = refinementFixture(
    (payload, attempt) =>
      attempt === 1
        ? new Promise<Response>((resolve) => {
            finish = resolve;
          })
        : Response.json({ ...answer, requestSeq: payload.requestSeq }),
    { now: () => instant, ttl: 100 },
  );
  await f.client.refreshStatus();
  f.client.setDraft("Expired question");
  const first = f.client.send("en");
  await tick();
  instant = 1200;
  finish(Response.json(answer));
  await first;
  assert.equal(f.client.getSnapshot().error, "session-expired");
  assert.equal(f.client.getSnapshot().messages.length, 1);
  assert.equal(f.client.getSnapshot().recovery, "none");
  f.client.setDraft("New question");
  await f.client.send("cs");
  assert.deepEqual(
    f.payloads.map((payload) => payload.requestSeq),
    [1, 1],
  );
  assert.notEqual(f.payloads[0].token, f.payloads[1].token);
  assert.deepEqual(
    f.client.getSnapshot().messages.map((message) => message.text),
    ["New question", answer.text],
  );
  f.client.dispose();
});
