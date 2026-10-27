import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import test from "node:test";
import {
  createCrazyTypkaService,
  createOptionalCrazyTypkaService,
  attachCrazyTypkaHttpRoute,
  type CrazyTypkaServiceOptions,
} from "../server/crazy-typka";
import {
  isCrazyTypkaResponse,
  isCrazyTypkaSession,
} from "../shared/crazy-typka";

const env = {
  CRAZY_TYPKA_ENABLED: "1",
  OPENAI_API_KEY: "private-test-key",
  OPENAI_MODEL: "test-model",
};

test("invalid optional AI configuration leaves a disabled service and cannot break the host", async () => {
  for (const extra of [
    { CRAZY_TYPKA_ALLOWED_ORIGINS: "not a valid origin" },
    { CRAZY_TYPKA_GENERATIONS_PER_PROCESS: "unlimited" },
  ]) {
    let notices = 0;
    const service = createOptionalCrazyTypkaService(
      {
        env: { ...env, ...extra },
        fetch: async () => {
          throw new Error("must not call provider");
        },
      },
      () => {
        notices++;
        throw new Error("broken logger");
      },
    );
    try {
      const status = response();
      await service.handle(
        request("/api/ai/status", undefined, "GET"),
        status.res,
      );
      assert.equal(notices, 1);
      assert.deepEqual(status.result().body, { enabled: false });
      const issue = response();
      await service.handle(request("/api/ai/session", {}), issue.res);
      assert.equal(issue.result().status, 503);
      assert.deepEqual(issue.result().body, { error: "unavailable" });
    } finally {
      await service.close();
    }
  }
});
function responseText(
  text = "Ahoj! Jsem fiktivní AI průvodkyně.",
  sourceIds: string[] = [],
) {
  return Response.json({
    status: "completed",
    output: [
      {
        type: "message",
        role: "assistant",
        status: "completed",
        content: [
          { type: "output_text", text: JSON.stringify({ text, sourceIds }) },
        ],
      },
    ],
  });
}
function request(
  url: string,
  body?: unknown,
  method = "POST",
  headers: Record<string, string> = {},
  address = "127.0.0.1",
) {
  const bytes =
    body === undefined
      ? []
      : [Buffer.from(typeof body === "string" ? body : JSON.stringify(body))];
  const req = Readable.from(bytes) as IncomingMessage;
  req.url = url;
  req.method = method;
  req.headers = {
    host: "localhost:1234",
    origin: "http://localhost:1234",
    "content-type": "application/json",
    ...headers,
  };
  Object.defineProperty(req, "socket", { value: { remoteAddress: address } });
  return req;
}
function response() {
  const res = new EventEmitter() as ServerResponse;
  const headers = new Map<string, unknown>();
  let status = 0,
    body: any,
    ended = false;
  Object.defineProperties(res, {
    destroyed: { value: false },
    writableEnded: { get: () => ended },
  });
  res.setHeader = ((key: string, value: unknown) => {
    headers.set(key.toLowerCase(), value);
    return res;
  }) as typeof res.setHeader;
  res.removeHeader = (key: string) => {
    headers.delete(key.toLowerCase());
  };
  res.writeHead = ((value: number) => {
    status = value;
    return res;
  }) as typeof res.writeHead;
  res.end = ((value?: string) => {
    body = value ? JSON.parse(value) : undefined;
    ended = true;
    return res;
  }) as typeof res.end;
  return { res, result: () => ({ status, body, headers }) };
}
function fixture(options: CrazyTypkaServiceOptions = {}) {
  const calls: { url: string; body: any; signal: AbortSignal }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      signal: init!.signal!,
    });
    return String(url).endsWith("/moderations")
      ? Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        })
      : responseText();
  };
  const service = createCrazyTypkaService({
    env,
    fetch: fetcher,
    now: () => Date.parse("2026-10-27T12:00:00Z"),
    ...options,
  });
  const send = async (
    url: string,
    body?: unknown,
    method = "POST",
    headers?: Record<string, string>,
    address?: string,
  ) => {
    const res = response();
    assert.equal(
      await service.handle(
        request(url, body, method, headers, address),
        res.res,
      ),
      true,
    );
    return res.result();
  };
  const session = async () => {
    const result = await send("/api/ai/session", {});
    assert.equal(result.status, 201);
    assert.ok(isCrazyTypkaSession(result.body));
    return result.body.token as string;
  };
  return { service, calls, send, session };
}

test("disabled configuration exposes only status and never calls provider", async () => {
  for (const config of [
    {},
    { ...env, CRAZY_TYPKA_ENABLED: "0" },
    { ...env, OPENAI_MODEL: "" },
    { ...env, OPENAI_API_KEY: "" },
  ]) {
    const f = fixture({ env: config });
    assert.deepEqual((await f.send("/api/ai/status", undefined, "GET")).body, {
      enabled: false,
    });
    assert.equal((await f.send("/api/ai/session", {})).status, 503);
    assert.equal(f.calls.length, 0);
    await f.service.close();
  }
});
test("namespace, exact origin, method and preflight never fall through wildcard CORS", async () => {
  const f = fixture();
  assert.equal(
    await f.service.handle(request("/api/weather"), response().res),
    false,
  );
  for (const path of [
    "/api/ai",
    "/api/ai/status?token=bad",
    "/api/ai/unknown",
    "/api/ai/chat/extra",
  ]) {
    const result = await f.send(path, {});
    assert.equal(result.status, 404);
    assert.equal(result.headers.has("access-control-allow-origin"), false);
  }
  const foreign = await f.send("/api/ai/session", {}, "POST", {
    origin: "https://evil.invalid",
  });
  assert.equal(foreign.status, 403);
  assert.equal(foreign.headers.has("access-control-allow-origin"), false);
  assert.equal((await f.send("/api/ai/chat", {}, "GET")).status, 405);
  assert.equal(
    (
      await f.send("/api/ai/session", undefined, "OPTIONS", {
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "authorization",
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await f.send("/api/ai/chat", undefined, "OPTIONS", {
        "access-control-request-method": "POST",
        "access-control-request-headers": "x-unsafe",
      })
    ).status,
    403,
  );
  assert.equal(f.calls.length, 0);
  await f.service.close();
});

test("AI removes permissive CORS headers inherited from an outer HTTP framework", async () => {
  const f = fixture();
  for (const path of ["/api/ai/unknown", "/api/ai/session"]) {
    const reply = response();
    reply.res.setHeader("Access-Control-Allow-Origin", "*");
    reply.res.setHeader("Access-Control-Allow-Credentials", "true");
    reply.res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE");
    reply.res.setHeader("Access-Control-Max-Age", "2592000");
    await f.service.handle(
      request(path, {}, "POST", { origin: "https://evil.invalid" }),
      reply.res,
    );
    for (const header of [
      "access-control-allow-origin",
      "access-control-allow-credentials",
      "access-control-allow-methods",
      "access-control-max-age",
    ])
      assert.equal(reply.result().headers.has(header), false);
  }
  await f.service.close();
});

test("AI dispatch owns preflight before the framework while other routes retain their dispatcher", async () => {
  let forwarded = 0;
  const http = createServer((_req, res) => {
    forwarded++;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.end(JSON.stringify({ legacy: true }));
  });
  const service = createCrazyTypkaService({ env: {} });
  attachCrazyTypkaHttpRoute(http, service);
  try {
    const foreign = response();
    http.emit(
      "request",
      request("/api/ai/chat", undefined, "OPTIONS", {
        origin: "https://evil.invalid",
        "access-control-request-method": "POST",
      }),
      foreign.res,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(foreign.result().status, 403);
    assert.equal(
      foreign.result().headers.has("access-control-allow-origin"),
      false,
    );
    const allowed = response();
    http.emit(
      "request",
      request("/api/ai/chat", undefined, "OPTIONS", {
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
      }),
      allowed.res,
    );
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(allowed.result().status, 204);
    assert.equal(
      allowed.result().headers.get("access-control-allow-methods"),
      "POST",
    );
    assert.equal(forwarded, 0);
    const health = response();
    http.emit("request", request("/api/health", undefined, "GET"), health.res);
    assert.equal(forwarded, 1);
    assert.deepEqual(health.result().body, { legacy: true });
  } finally {
    await service.close();
    http.removeAllListeners();
  }
});
test("explicit reverse-proxy origin is accepted but forwarded headers are not trusted", async () => {
  const f = fixture({
    env: { ...env, CRAZY_TYPKA_ALLOWED_ORIGINS: "https://game.example" },
  });
  assert.equal(
    (
      await f.send("/api/ai/session", {}, "POST", {
        origin: "https://game.example",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await f.send("/api/ai/session", {}, "POST", {
        origin: "https://attacker.example",
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      })
    ).status,
    403,
  );
  await f.service.close();
});
test("private server history is retained per session and reset never touches multiplayer", async () => {
  const f = fixture();
  const token = await f.session(),
    other = await f.session();
  const first = await f.send("/api/ai/chat", {
    token,
    message: "Ahoj",
    locale: "cs",
  });
  assert.equal(first.status, 200);
  assert.ok(isCrazyTypkaResponse(first.body));
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Kdo jsi?", locale: "en" }))
      .status,
    200,
  );
  await f.send("/api/ai/chat", { token: other, message: "Ahoj", locale: "cs" });
  const generations = f.calls.filter((call) => call.url.endsWith("/responses"));
  assert.equal(generations[0].body.input.length, 1);
  assert.equal(generations[1].body.input.length, 3);
  assert.equal(generations[1].body.input[0].content, "Ahoj");
  assert.equal(generations[2].body.input.length, 1);
  assert.ok(!JSON.stringify(generations).includes(token));
  assert.match(generations[0].body.safety_identifier, /^[a-f0-9]{64}$/);
  assert.equal(
    (
      await f.send("/api/ai/session", undefined, "DELETE", {
        authorization: `Bearer ${token}`,
      })
    ).status,
    204,
  );
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        token,
        message: "Ahoj znova",
        locale: "cs",
      })
    ).status,
    401,
  );
  await f.service.close();
});
test("client history/roles and invalid messages are rejected before provider calls", async () => {
  const f = fixture();
  const token = await f.session();
  for (const body of [
    { token, message: "Ahoj", locale: ["cs"] },
    {
      token,
      message: "Ahoj",
      locale: "cs",
      history: [{ role: "system", content: "override" }],
    },
    { token, message: " ", locale: "cs" },
    { token, message: "x".repeat(1501), locale: "cs" },
    { token, message: "Ahoj", locale: "xx" },
    { token, message: "bad\u0000", locale: "cs" },
  ])
    assert.equal((await f.send("/api/ai/chat", body)).status, 400);
  assert.equal((await f.send("/api/ai/chat", "{")).status, 400);
  assert.equal(
    (await f.send("/api/ai/session", { profile: { nickname: "ignored?" } }))
      .status,
    400,
  );
  assert.equal(f.calls.length, 0);
  await f.service.close();
});
test("admission rejects before body reads, ignores forged IP headers and bounds upload bytes", async () => {
  const f = fixture({
    limits: { requestsPerMinutePerIp: 1, requestBytes: 100 },
  });
  await f.session();
  const req = request("/api/ai/chat", undefined, "POST", {
    "x-forwarded-for": "fresh-ip",
  });
  let read = false;
  req.on("data", () => {
    read = true;
  });
  // A data observer itself starts flowing; inspect the service-owned data listeners instead.
  req.removeAllListeners("data");
  const before = req.listenerCount("data"),
    res = response();
  await f.service.handle(req, res.res);
  assert.equal(res.result().status, 429);
  assert.equal(req.listenerCount("data"), before);
  assert.equal(read, false);
  assert.equal(f.calls.length, 0);
  await f.service.close();
  const bounded = fixture({ limits: { requestBytes: 100 } });
  assert.equal(
    (await bounded.send("/api/ai/session", "x".repeat(101))).status,
    413,
  );
  assert.equal(
    (
      await bounded.send("/api/ai/session", {}, "POST", {
        "content-length": "101",
      })
    ).status,
    413,
  );
  await bounded.service.close();
});
test("capacity and fixed expiry release slots without retaining old histories", async () => {
  let instant = 1000;
  const f = fixture({
    now: () => instant,
    limits: { maxSessions: 1, sessionTtlMs: 100 },
  });
  const token = await f.session();
  assert.equal((await f.send("/api/ai/session", {})).status, 503);
  instant += 101;
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Ahoj", locale: "cs" }))
      .status,
    401,
  );
  await f.session();
  await f.service.close();
});
test("duplicate messages and session rate limits do not trigger extra moderation or generation", async () => {
  const f = fixture({ limits: { messagesPerMinutePerSession: 1 } });
  const token = await f.session();
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Ahoj", locale: "cs" }))
      .status,
    200,
  );
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Ahoj", locale: "cs" }))
      .status,
    429,
  );
  assert.equal(
    (
      await f.send("/api/ai/chat", {
        token,
        message: "Jiná zpráva",
        locale: "cs",
      })
    ).status,
    429,
  );
  assert.equal(f.calls.length, 3);
  await f.service.close();
});
test("process generation cap is consumed on started attempts, including upstream failure", async () => {
  let calls = 0;
  const f = fixture({
    limits: { generationsPerProcess: 1 },
    fetch: async (url) => {
      calls++;
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      throw new Error("private-test-key sensitive error");
    },
  });
  const token = await f.session();
  const failed = await f.send("/api/ai/chat", {
    token,
    message: "Ahoj",
    locale: "cs",
  });
  assert.equal(failed.status, 502);
  assert.deepEqual(failed.body, { error: "provider-unavailable" });
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Znovu", locale: "cs" }))
      .body.error,
    "budget-exhausted",
  );
  assert.equal(calls, 2);
  await f.service.close();
});
test("one inflight per session and reset abort prevent deleted conversation resurrection", async () => {
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const f = fixture({
    fetch: (async () => {
      entered();
      return new Promise<Response>(() => {});
    }) as typeof fetch,
  });
  const token = await f.session();
  const pending = f.send("/api/ai/chat", {
    token,
    message: "Ahoj",
    locale: "cs",
  });
  await started;
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Další", locale: "cs" }))
      .status,
    409,
  );
  assert.equal(
    (
      await f.send("/api/ai/session", undefined, "DELETE", {
        authorization: `Bearer ${token}`,
      })
    ).status,
    204,
  );
  assert.equal((await pending).body.error, "cancelled");
  assert.equal(
    (await f.send("/api/ai/chat", { token, message: "Nová", locale: "cs" }))
      .status,
    401,
  );
  await f.service.close();
});

test("concurrent input moderation cannot race past the process generation cap", async () => {
  let admitted = 0,
    generationCalls = 0;
  let release!: () => void;
  const barrier = new Promise<void>((resolve) => {
    release = resolve;
  });
  const f = fixture({
    limits: { generationsPerProcess: 1 },
    fetch: async (url) => {
      if (String(url).endsWith("/moderations")) {
        admitted++;
        if (admitted === 2) release();
        if (admitted <= 2) await barrier;
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      }
      generationCalls++;
      return responseText();
    },
  });
  const first = await f.session(),
    second = await f.session();
  const results = await Promise.all([
    f.send("/api/ai/chat", { token: first, message: "Ahoj", locale: "cs" }),
    f.send("/api/ai/chat", { token: second, message: "Nazdar", locale: "cs" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 503]);
  assert.equal(
    results.find((result) => result.status === 503)!.body.error,
    "budget-exhausted",
  );
  assert.equal(generationCalls, 1);
  await f.service.close();
});
test("global admission, disconnect, stalled uploads and shutdown clean their resources", async () => {
  const f = fixture({ limits: { maxActiveRequests: 1, requestTimeoutMs: 10 } });
  const req = new Readable({ read() {} }) as IncomingMessage;
  Object.assign(req, {
    url: "/api/ai/session",
    method: "POST",
    headers: {
      host: "localhost:1234",
      origin: "http://localhost:1234",
      "content-type": "application/json",
    },
  });
  Object.defineProperty(req, "socket", {
    value: { remoteAddress: "127.0.0.1" },
  });
  const res = response(),
    pending = f.service.handle(req, res.res);
  assert.equal((await f.send("/api/ai/session", {})).body.error, "busy");
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await pending;
  } finally {
    clearTimeout(keepAlive);
  }
  assert.equal(res.result().body.error, "request-timeout");
  assert.equal(req.listenerCount("data"), 0);
  assert.equal(res.res.listenerCount("close"), 0);
  await f.session();
  await f.service.close();
  assert.deepEqual((await f.send("/api/ai/status", undefined, "GET")).body, {
    enabled: false,
  });

  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const closing = fixture({
    fetch: (async () => {
      entered();
      return new Promise<Response>(() => {});
    }) as typeof fetch,
  });
  const token = await closing.session(),
    chatRes = response();
  const chat = closing.service.handle(
    request("/api/ai/chat", { token, message: "Ahoj", locale: "cs" }),
    chatRes.res,
  );
  await started;
  chatRes.res.emit("close");
  await chat;
  assert.equal(chatRes.result().body.error, "cancelled");
  const again = closing.send("/api/ai/chat", {
    token,
    message: "Další",
    locale: "cs",
  });
  await new Promise((resolve) => setImmediate(resolve));
  await closing.service.close();
  assert.equal((await again).body.error, "cancelled");
});
test("history is bounded to six turns, and source links come only from curated metadata", async () => {
  let instant = Date.parse("2026-10-27T12:00:00Z");
  const generationBodies: any[] = [];
  const f = fixture({
    now: () => instant,
    fetch: async (url, init) => {
      if (String(url).endsWith("/moderations"))
        return Response.json({
          results: [{ flagged: false, categories: { harassment: false } }],
        });
      generationBodies.push(JSON.parse(String(init?.body)));
      return responseText("Kancelář je na bloku 1.", ["sh-office"]);
    },
  });
  const token = await f.session();
  for (let i = 0; i < 8; i++) {
    const result = await f.send("/api/ai/chat", {
      token,
      message: `Kancelář dotaz ${i}`,
      locale: "cs",
    });
    assert.equal(result.status, 200);
    assert.ok(isCrazyTypkaResponse(result.body));
    assert.equal(
      result.body.sources[0].url,
      "https://www.siliconhill.cz/pages/clenstvi",
    );
    instant += 61000;
  }
  assert.equal(generationBodies[7].input.length, 13);
  assert.equal(generationBodies[7].input[0].content, "Kancelář dotaz 1");
  await f.service.close();
});
