import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CrazyTypkaChat,
  createCrazyTypkaClient,
  crazyTypkaErrorLabel,
  safeCitationHref,
  type CrazyTypkaState,
} from "../client/crazy-typka";
import {
  CRAZY_TYPKA_SPEAKER,
  type CrazyTypkaSource,
} from "../shared/crazy-typka";

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
    send: client.send,
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
      send: client.send,
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
    { token, message: "Jak se přidám?", locale: "cs" },
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
    messages: [{ id: 1, role: "ai", text: answer.text, sources: [source] }],
    setDraft() {},
    async send() {},
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
