import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type {
  Request,
  RequestHandler,
  Response as ExpressResponse,
} from "express";
import { CRAZY_TYPKA_SPEAKER } from "../shared/crazy-typka";
import {
  createChatMonitorAdmin,
  isChatMonitorAdminPath,
} from "../server/chat-monitor-admin";
import type { ChatMonitorExchange } from "../server/chat-monitor-store";

const ORIGIN = "https://strahov.bandportal.cz";
const HOST = "strahov.bandportal.cz";
const CONVERSATION = "437acb58-7efa-40e2-b7ec-5328678da1ae";
const DETAIL = `/admin/conversations/${CONVERSATION}`;
const GITHUB_ID = 123456;
const BASE_DATE = new Date("2026-11-06T16:00:00Z");
const TRANSCRIPT_MARKER = "SYNTHETICKÝ SOUKROMÝ DOTAZ";
const EXCHANGE: ChatMonitorExchange = {
  requestSeq: 3,
  completedAt: BASE_DATE,
  question: `${TRANSCRIPT_MARKER} <script>alert('x')</script>`,
  answer: {
    speaker: CRAZY_TYPKA_SPEAKER,
    requestSeq: 3,
    text: "Odpověď <img onerror=alert(1)>",
    blocks: [
      {
        id: "a".repeat(32),
        text: "Odpověď <img onerror=alert(1)>",
        sourceIds: ["id"],
      },
    ],
    sources: [
      {
        id: "id",
        title: "Citace <svg>",
        url: "https://example.org/doc?a=1&b=2",
        checkedAt: "2026-11-06",
        author: null,
        license: null,
        licenseUrl: null,
        adaptation: "curated-paraphrase",
      },
    ],
  },
};

type Result = {
  status: number;
  headers: Map<string, string | string[]>;
  text: string;
  fallthrough: boolean;
};

function call(
  handler: RequestHandler,
  path: string,
  {
    method = "GET",
    headers = {},
  }: { method?: string; headers?: Record<string, string | undefined> } = {},
): Promise<Result> {
  const request = {
    path: path.split("?", 1)[0],
    originalUrl: path,
    method,
    headers: {
      host: HOST,
      "sec-fetch-mode": "navigate",
      "sec-fetch-dest": "document",
      ...headers,
    },
  } as unknown as Request;
  return new Promise((resolve) => {
    // Model the headers Colyseus can put on the response before Express.
    const responseHeaders = new Map<string, string | string[]>([
      ["access-control-allow-origin", "https://untrusted.example"],
      ["access-control-allow-credentials", "true"],
    ]);
    const append = (name: string, value: string) => {
      const key = name.toLowerCase();
      const previous = responseHeaders.get(key);
      responseHeaders.set(key, [
        ...(Array.isArray(previous) ? previous : previous ? [previous] : []),
        value,
      ]);
    };
    let code = 200;
    const response = {
      getHeaderNames: () => [...responseHeaders.keys()],
      removeHeader: (name: string) =>
        responseHeaders.delete(name.toLowerCase()),
      setHeader: (name: string, value: string) =>
        responseHeaders.set(name.toLowerCase(), value),
      status(value: number) {
        code = value;
        return this;
      },
      type() {
        return this;
      },
      vary(name: string) {
        append("Vary", name);
        return this;
      },
      append(name: string, value: string) {
        append(name, value);
        return this;
      },
      end(text = "") {
        resolve({
          status: code,
          headers: responseHeaders,
          text,
          fallthrough: false,
        });
      },
    } as unknown as ExpressResponse;
    handler(request, response, () =>
      resolve({
        status: 0,
        headers: responseHeaders,
        text: "",
        fallthrough: true,
      }),
    );
  });
}

function responseCookie(response: Result, name: string): string {
  const entries = response.headers.get("set-cookie");
  assert.ok(Array.isArray(entries));
  const value = entries.find((entry) =>
    entry.startsWith(`__Secure-strahov-admin-${name}=`),
  );
  assert.ok(value);
  return value;
}

function fixture() {
  let now = BASE_DATE.getTime();
  let userId: unknown = GITHUB_ID;
  let detailUnavailable = false;
  let auditFailed = false;
  let listFailed = false;
  let beforeDetailRead: (() => Promise<void>) | undefined;
  let beforeTokenExchange: ((code: string) => Promise<void>) | undefined;
  const calls: string[] = [];
  const detailReads: unknown[][] = [];
  const listCursors: (string | undefined)[] = [];
  const parameters: URLSearchParams[] = [];
  const handler = createChatMonitorAdmin({
    origin: ORIGIN,
    clientId: "fixture-oauth-client",
    clientSecret: "fixture-oauth-secret",
    allowedGithubIds: [GITHUB_ID],
    now: () => now,
    fetch: async (url, options) => {
      calls.push(String(url));
      assert.equal(options?.redirect, "error");
      assert.ok(options?.signal);
      if (url === "https://github.com/login/oauth/access_token") {
        assert.equal(options?.method, "POST");
        assert.ok(options.body instanceof URLSearchParams);
        parameters.push(options.body);
        await beforeTokenExchange?.(options.body.get("code") ?? "");
        return Response.json({ access_token: "fixture-token-private" });
      }
      assert.equal(url, "https://api.github.com/user");
      assert.equal(
        new Headers(options?.headers).get("authorization"),
        "Bearer fixture-token-private",
      );
      return Response.json({
        id: userId,
        login: "untrusted-not-the-allowlist-key",
      });
    },
    reader: {
      getDroppedCount: () => 8,
      async listConversations({ before } = {}) {
        listCursors.push(before);
        if (listFailed) throw new Error("internal SQL connection detail");
        if (before === "invalid")
          throw new Error("chat-monitor-invalid-cursor");
        return {
          conversations: [
            {
              id: CONVERSATION,
              firstSeenAt: BASE_DATE,
              lastSeenAt: BASE_DATE,
              exchangeCount: 1,
            },
          ],
          nextCursor: "c3ludGhldGljLWN1cnNvcg",
        };
      },
      async openConversation(id, githubId) {
        detailReads.push([id, githubId]);
        await beforeDetailRead?.();
        if (auditFailed) throw new Error("internal DB location and query");
        return detailUnavailable ? undefined : [EXCHANGE];
      },
    },
  });
  const send = (path: string, options?: Parameters<typeof call>[2]) =>
    call(handler, path, options);
  async function startLogin(code = "fixture-code") {
    const start = await send("/admin/login");
    assert.equal(start.status, 303);
    const auth = new URL(String(start.headers.get("location")));
    const state = auth.searchParams.get("state");
    assert.ok(state);
    const browserCookie = responseCookie(start, "oauth");
    const callback = `/admin/oauth/callback?${new URLSearchParams({ code, state })}`;
    return {
      auth,
      state,
      browserCookie,
      cookie: browserCookie.split(";", 1)[0],
      callback,
    };
  }
  async function signIn() {
    const login = await startLogin();
    const response = await send(login.callback, {
      headers: { cookie: login.cookie },
    });
    assert.equal(response.status, 303);
    return responseCookie(response, "session").split(";", 1)[0];
  }
  return {
    send,
    startLogin,
    signIn,
    calls,
    detailReads,
    listCursors,
    parameters,
    advance: (delta: number) => {
      now += delta;
    },
    useGithubId: (id: unknown) => {
      userId = id;
    },
    beforeTokenExchange: (callback: (code: string) => Promise<void>) => {
      beforeTokenExchange = callback;
    },
    beforeDetailRead: (callback: () => Promise<void>) => {
      beforeDetailRead = callback;
    },
    detailUnavailable: () => {
      detailUnavailable = true;
    },
    failAudit: () => {
      auditFailed = true;
    },
    failList: () => {
      listFailed = true;
    },
  };
}

test("admin route leaves game and sibling paths to their normal handlers", async () => {
  const { send } = fixture();
  for (const path of [
    "/",
    "/api/ai/chat",
    "/administrator",
    "/admin-old",
    "/assets/admin.js",
  ]) {
    assert.equal(isChatMonitorAdminPath(path), false);
    assert.equal((await send(path)).fallthrough, true);
  }
  assert.equal(isChatMonitorAdminPath("/admin?before=a"), true);
  assert.equal(isChatMonitorAdminPath(DETAIL), true);
});

test("anonymous and gameplay tokens do not open transcripts or contact storage", async () => {
  const { send, detailReads, listCursors } = fixture();
  const unauthorized = await send(DETAIL, {
    headers: { authorization: `Bearer ${"x".repeat(64)}` },
  });
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.text, /Přihlásit přes GitHub/);
  assert.doesNotMatch(unauthorized.text, /SYNTHETICKÝ/);
  assert.equal(unauthorized.headers.get("cache-control"), "no-store");
  assert.equal(unauthorized.headers.get("x-frame-options"), "DENY");
  assert.equal(
    unauthorized.headers.get("cross-origin-opener-policy"),
    "same-origin",
  );
  assert.match(
    String(unauthorized.headers.get("content-security-policy")),
    /default-src 'none'.*frame-ancestors 'none'/,
  );
  assert.equal(unauthorized.headers.has("access-control-allow-origin"), false);
  assert.equal(
    unauthorized.headers.has("access-control-allow-credentials"),
    false,
  );
  assert.deepEqual(detailReads, []);
  assert.deepEqual(listCursors, []);
  assert.equal(
    (await send("/admin", { headers: { host: "evil.example" } })).status,
    403,
  );
});

test("GitHub OAuth uses a fixed callback, PKCE and single-use browser state", async () => {
  const { send, startLogin, calls, parameters } = fixture();
  const login = await startLogin();
  assert.equal(login.auth.origin, "https://github.com");
  assert.equal(
    login.auth.searchParams.get("redirect_uri"),
    `${ORIGIN}/admin/oauth/callback`,
  );
  assert.equal(login.auth.searchParams.get("code_challenge_method"), "S256");
  assert.equal(login.auth.searchParams.get("scope"), null);
  assert.match(
    login.browserCookie,
    /Path=\/admin; Max-Age=300; Secure; HttpOnly; SameSite=Lax$/,
  );
  assert.doesNotMatch(login.browserCookie, /Domain=/i);

  assert.equal((await send(login.callback)).status, 403);
  assert.deepEqual(calls, []);
  const result = await send(login.callback, {
    headers: { cookie: login.cookie, "sec-fetch-site": "cross-site" },
  });
  assert.equal(result.status, 303);
  assert.equal(result.headers.get("location"), "/admin");
  const cookie = responseCookie(result, "session");
  assert.match(
    cookie,
    /Path=\/admin; Max-Age=900; Secure; HttpOnly; SameSite=Lax$/,
  );
  assert.doesNotMatch(cookie, /fixture-token-private|Domain=/i);
  const verifier = parameters[0].get("code_verifier");
  assert.ok(verifier);
  assert.ok(!login.cookie.includes(verifier));
  assert.equal(
    createHash("sha256").update(verifier).digest("base64url"),
    login.auth.searchParams.get("code_challenge"),
  );
  assert.equal(
    parameters[0].get("redirect_uri"),
    `${ORIGIN}/admin/oauth/callback`,
  );
  assert.equal(
    (await send(login.callback, { headers: { cookie: login.cookie } })).status,
    403,
  );
  assert.equal(calls.length, 2);
});

test("OAuth refuses wrong or expired state and exact non-allowlisted GitHub identities", async () => {
  const { send, startLogin, useGithubId, advance, calls } = fixture();
  const invalid = await startLogin();
  const wrongState = invalid.callback.replace(invalid.state, "z".repeat(43));
  const rejectedState = await send(wrongState, {
    headers: { cookie: invalid.cookie },
  });
  assert.equal(rejectedState.status, 403);
  assert.match(responseCookie(rejectedState, "oauth"), /Max-Age=0/);
  const otherLogin = await startLogin();
  assert.equal(
    (await send(invalid.callback, { headers: { cookie: otherLogin.cookie } }))
      .status,
    403,
  );
  const [cookieName, cookieValue] = invalid.cookie.split("=");
  const tampered = `${cookieName}=${cookieValue[0] === "a" ? "b" : "a"}${cookieValue.slice(1)}`;
  assert.equal(
    (await send(invalid.callback, { headers: { cookie: tampered } })).status,
    403,
  );
  const expired = await startLogin();
  advance(5 * 60 * 1000);
  assert.equal(
    (await send(expired.callback, { headers: { cookie: expired.cookie } }))
      .status,
    403,
  );
  assert.deepEqual(calls, []);

  for (const identity of [GITHUB_ID + 1, String(GITHUB_ID)]) {
    useGithubId(identity);
    const login = await startLogin();
    const rejected = await send(login.callback, {
      headers: { cookie: login.cookie },
    });
    assert.equal(rejected.status, 403);
    assert.doesNotMatch(
      String(rejected.headers.get("set-cookie")),
      /admin-session=/,
    );
  }
});

test("anonymous OAuth starts cannot exhaust an authenticated login slot", async () => {
  const { send, signIn, calls } = fixture();
  for (let i = 0; i < 300; i++)
    assert.equal((await send("/admin/login")).status, 303);
  assert.deepEqual(calls, []);
  const cookie = await signIn();
  assert.equal((await send("/admin", { headers: { cookie } })).status, 200);
});

test("OAuth deduplicates active and failed states and caps concurrent GitHub exchanges", async (t) => {
  const { send, startLogin, beforeTokenExchange, calls } = fixture();
  const held = new Map<
    string,
    { resolve(): void; reject(error: Error): void }
  >();
  beforeTokenExchange(
    (code) =>
      new Promise<void>((resolve, reject) => {
        held.set(code, { resolve, reject });
      }),
  );
  t.after(() => {
    for (const pending of held.values()) pending.resolve();
  });
  const complete = (login: Awaited<ReturnType<typeof startLogin>>) =>
    send(login.callback, { headers: { cookie: login.cookie } });
  const first = await startLogin("held-0");
  const inFlight = [complete(first)];
  assert.equal((await complete(first)).status, 403);
  assert.equal(calls.length, 1);
  for (let index = 1; index < 4; index++)
    inFlight.push(complete(await startLogin(`held-${index}`)));

  const next = await startLogin("waiting");
  const busy = await complete(next);
  assert.equal(busy.status, 503);
  assert.equal(busy.headers.get("retry-after"), "2");
  assert.equal(busy.headers.has("set-cookie"), false);
  assert.equal(calls.length, 4);

  held
    .get("held-0")
    ?.reject(new DOMException("fixture timed out", "TimeoutError"));
  assert.equal((await inFlight[0]).status, 503);
  assert.equal((await complete(first)).status, 403);
  assert.equal(calls.length, 4);

  const retry = complete(next);
  assert.equal(calls.length, 5);
  for (const pending of held.values()) pending.resolve();
  assert.equal((await retry).status, 303);
  for (const response of await Promise.all(inFlight.slice(1)))
    assert.equal(response.status, 303);
});

test("signed-in admin reads list and audited detail, with script-free escaped text and citations", async () => {
  const { send, signIn, detailReads, listCursors } = fixture();
  const cookie = await signIn();
  const list = await send("/admin?before=Zml4dHVyZQ", { headers: { cookie } });
  assert.equal(list.status, 200);
  assert.match(list.text, /Nezapsané výměny v tomto běhu serveru: 8/);
  assert.match(list.text, new RegExp(DETAIL));
  assert.match(list.text, /before=c3ludGhldGljLWN1cnNvcg/);
  assert.doesNotMatch(list.text, /SYNTHETICKÝ/);
  assert.deepEqual(listCursors, ["Zml4dHVyZQ"]);
  const invalidCursor = await send("/admin?before=invalid", {
    headers: { cookie },
  });
  assert.equal(invalidCursor.status, 400);
  assert.doesNotMatch(invalidCursor.text, /chat-monitor-invalid-cursor/);

  const detail = await send(DETAIL, { headers: { cookie } });
  assert.equal(detail.status, 200);
  assert.deepEqual(detailReads, [[CONVERSATION, GITHUB_ID]]);
  assert.match(
    detail.text,
    /SYNTHETICKÝ SOUKROMÝ DOTAZ &lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/,
  );
  assert.match(detail.text, /Odpověď &lt;img onerror=alert\(1\)&gt;/);
  assert.match(
    detail.text,
    /Citace &lt;svg&gt; · https:\/\/example\.org\/doc\?a=1&amp;b=2/,
  );
  assert.doesNotMatch(detail.text, /<script|<img|<svg/);
  const style = detail.text.match(/<style>([\s\S]+)<\/style>/)?.[1];
  assert.ok(style);
  assert.ok(
    String(detail.headers.get("content-security-policy")).includes(
      createHash("sha256").update(style).digest("base64"),
    ),
  );
  assert.equal(detail.headers.get("cache-control"), "no-store");
  assert.equal(detail.headers.has("access-control-allow-origin"), false);
});

test("authenticated fetch, frame, missing metadata and duplicate session cookies cannot expose transcripts", async () => {
  const { send, signIn, detailReads, listCursors } = fixture();
  const cookie = await signIn();
  for (const headers of [
    { cookie, "sec-fetch-mode": "cors", "sec-fetch-dest": "empty" },
    { cookie, "sec-fetch-mode": "navigate", "sec-fetch-dest": "iframe" },
    { cookie, "sec-fetch-mode": undefined, "sec-fetch-dest": undefined },
  ]) {
    assert.equal((await send(DETAIL, { headers })).status, 403);
    assert.equal((await send("/admin", { headers })).status, 403);
  }
  assert.equal(
    (await send(DETAIL, { headers: { cookie: `${cookie}; ${cookie}` } }))
      .status,
    401,
  );
  assert.deepEqual(detailReads, []);
  assert.deepEqual(listCursors, []);
});

test("only authenticated admins see the dropped count when the conversation database is unavailable", async () => {
  const { send, signIn, failList, listCursors } = fixture();
  const cookie = await signIn();
  failList();
  const guest = await send("/admin");
  assert.equal(guest.status, 401);
  assert.doesNotMatch(guest.text, /Nezapsané výměny/);
  assert.deepEqual(listCursors, []);

  const unavailable = await send("/admin", { headers: { cookie } });
  assert.equal(unavailable.status, 503);
  assert.match(unavailable.text, /Nezapsané výměny v tomto běhu serveru: 8/);
  assert.doesNotMatch(unavailable.text, /internal SQL|SYNTHETICKÝ/);
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
  assert.deepEqual(listCursors, [undefined]);
});

test("expired or unauditable conversations never reach HTML and admin logout invalidates the session", async () => {
  const { send, signIn, detailUnavailable, failAudit, advance } = fixture();
  const cookie = await signIn();
  const headers = { cookie };
  detailUnavailable();
  const missing = await send(DETAIL, { headers });
  assert.equal(missing.status, 404);
  assert.doesNotMatch(missing.text, /SYNTHETICKÝ/);
  failAudit();
  const failed = await send(DETAIL, { headers });
  assert.equal(failed.status, 503);
  assert.doesNotMatch(failed.text, /SYNTHETICKÝ|internal DB/);
  assert.equal(
    (
      await send("/admin/logout", {
        method: "POST",
        headers: { cookie, origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  assert.equal((await send("/admin", { headers })).status, 200);
  assert.equal(
    (
      await send("/admin/logout", {
        method: "POST",
        headers: { cookie, origin: ORIGIN },
      })
    ).status,
    303,
  );
  assert.equal((await send("/admin", { headers })).status, 401);

  const laterCookie = await signIn();
  advance(15 * 60 * 1000);
  assert.equal(
    (await send("/admin", { headers: { cookie: laterCookie } })).status,
    401,
  );
});

test("a detail read cannot return transcript text after concurrent logout", async () => {
  const { send, signIn, beforeDetailRead } = fixture();
  const cookie = await signIn();
  let start!: () => void;
  let resume!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const blocked = new Promise<void>((resolve) => {
    resume = resolve;
  });
  beforeDetailRead(() => {
    start();
    return blocked;
  });
  const detail = send(DETAIL, { headers: { cookie } });
  await started;
  const logout = await send("/admin/logout", {
    method: "POST",
    headers: { cookie, origin: ORIGIN },
  });
  assert.equal(logout.status, 303);
  resume();
  const response = await detail;
  assert.equal(response.status, 401);
  assert.doesNotMatch(response.text, /SYNTHETICKÝ/);
});
