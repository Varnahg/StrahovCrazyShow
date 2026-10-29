import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import test from "node:test";
import {
  createRobotsFetcher,
  createSourceFetcher,
  isPublicSourceAddress,
  SourceFetchError,
  type FetchResponse,
  type SourceFetchOptions,
  type ResolvedAddress,
  type SourceFetcherDependencies,
  type SourceRequestOptions,
} from "../server/rag-source-fetch";

const url = "https://www.suz.cvut.cz/cz/media/file/document";
const pdf = Buffer.from("%PDF-1.7\nSynthetic public fixture\n%%EOF");
type Plan = {
  status?: number;
  headers?: Record<string, string | string[]>;
  chunks?: Buffer[];
  hangBody?: boolean;
  lateResponse?: boolean;
  error?: boolean;
};
function harness(
  plans: Plan[],
  addresses: ResolvedAddress[] = [{ address: "147.32.1.2", family: 4 }],
) {
  const requests: { options: SourceRequestOptions; destroyed: boolean }[] = [],
    responses: { destroyed: boolean }[] = [],
    late: (() => void)[] = [];
  let dnsCalls = 0;
  const deps: SourceFetcherDependencies = {
    resolve: async () => {
      dnsCalls++;
      return addresses;
    },
    now: () => new Date("2026-10-28T16:00:00Z"),
    request: (options, receive) => {
      const plan = plans[requests.length] ?? {};
      const record = { options, destroyed: false };
      requests.push(record);
      const responseState = { destroyed: false };
      responses.push(responseState);
      const response: FetchResponse = {
        statusCode: plan.status ?? 200,
        headers: plan.headers ?? { "content-type": "application/pdf" },
        destroy() {
          responseState.destroyed = true;
        },
        async *[Symbol.asyncIterator]() {
          for (const chunk of plan.chunks ?? [pdf]) yield chunk;
          if (plan.hangBody) await new Promise(() => {});
        },
      };
      const events = new EventEmitter();
      return {
        once: (event, listener) => events.once(event, listener),
        destroy() {
          record.destroyed = true;
        },
        end() {
          if (plan.lateResponse) late.push(() => receive(response));
          else
            queueMicrotask(() => {
              if (plan.error)
                events.emit("error", new Error("Synthetic network failure"));
              else receive(response);
            });
        },
      };
    },
  };
  return { deps, requests, responses, late, dnsCalls: () => dnsCalls };
}
const opts = (
  overrides: Partial<SourceFetchOptions> = {},
): SourceFetchOptions => ({
  url,
  publisher: "suz",
  policy: (value) => new URL(value).hostname === "www.suz.cvut.cz",
  robots: async () => ({ allowed: true, reason: "test robots allow" }),
  limits: { timeoutMs: 1000, maxBytes: 1024, maxRedirects: 3 },
  userAgent: "StrahovRAG-Test/1.0",
  ...overrides,
});

test("limits and synchronous policy approval fail closed before network work", async () => {
  for (const limits of [
    { timeoutMs: 0, maxBytes: 100, maxRedirects: 0 },
    { timeoutMs: 100, maxBytes: Infinity, maxRedirects: 0 },
    { timeoutMs: 100, maxBytes: 100, maxRedirects: 11 },
  ]) {
    const h = harness([]);
    await rejectsCode(
      createSourceFetcher(h.deps)(opts({ limits })),
      "invalid-options",
    );
    assert.equal(h.dnsCalls(), 0);
  }
  const h = harness([]);
  await rejectsCode(
    createSourceFetcher(h.deps)(opts({ policy: (async () => true) as any })),
    "policy",
  );
  assert.equal(h.dnsCalls(), 0);
});
async function rejectsCode(action: Promise<unknown>, code: string) {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof SourceFetchError && error.code === code,
  );
}

test("declared CP1250 HTML preserves original bytes, hash and HTTP charset", async () => {
  // CP1250 bytes for 'Sleva neplatí: 250 Kč.'; deliberately invalid UTF-8.
  const bytes = Buffer.concat([
    Buffer.from("<!DOCTYPE html><html><body><p>Sleva neplat"),
    Buffer.from([0xed]),
    Buffer.from(": 250 K"),
    Buffer.from([0xe8]),
    Buffer.from(".</p></body></html>"),
  ]);
  const h = harness([
    {
      headers: { "content-type": 'text/html; charset="Windows-1250"' },
      chunks: [bytes],
    },
  ]);
  const result = await createSourceFetcher(h.deps)(
    opts({ expectedFormat: "html" }),
  );
  assert.equal(result.kind, "fetched");
  if (result.kind !== "fetched") return;
  assert.equal(result.mime, "text/html");
  assert.equal(result.charset, "windows-1250");
  assert.equal(result.signature, "html");
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(
    new TextDecoder(result.charset!).decode(result.bytes),
    "<!DOCTYPE html><html><body><p>Sleva neplatí: 250 Kč.</p></body></html>",
  );
  assert.ok(h.requests[0].destroyed && h.responses[0].destroyed);
});

test("HTML signature tolerates BOM, whitespace and publisher comments without dropping bytes", async () => {
  const bytes = Buffer.from(
    "\uFEFF \r\n<!-- publisher legal notice -->\n<!-- second notice -->\t<!DOCTYPE html><html><body>Rules</body></html>",
  );
  const h = harness([
    {
      headers: { "content-type": "text/html; charset=UTF-8" },
      chunks: [bytes],
    },
  ]);
  const result = await createSourceFetcher(h.deps)(
    opts({ expectedFormat: "html" }),
  );
  assert.equal(result.kind, "fetched");
  if (result.kind !== "fetched") return;
  assert.equal(result.signature, "html");
  assert.equal(result.charset, "utf-8");
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
});

test("HTML meta charset reaches the worker without inventing an HTTP charset", async () => {
  const bytes = Buffer.concat([
    Buffer.from(
      '<!-- publisher notice --><html><head><meta charset="windows-1250"></head><body>Cena 250 K',
    ),
    Buffer.from([0xe8]),
    Buffer.from("</body></html>"),
  ]);
  const h = harness([
    { headers: { "content-type": "text/html" }, chunks: [bytes] },
  ]);
  const result = await createSourceFetcher(h.deps)(opts());
  assert.equal(result.kind, "fetched");
  if (result.kind !== "fetched") return;
  assert.equal(result.signature, "html");
  assert.equal(result.charset, null);
  assert.deepEqual(result.bytes, bytes);
});

test("charset and comment handling retains binary, PDF and challenge guards", async () => {
  const cases: {
    bytes: Buffer;
    contentType: string;
    expectedFormat?: string;
  }[] = [
    {
      bytes: Buffer.from(
        "<!-- notice --><html><body>Document\u0000\u0001</body></html>",
      ),
      contentType: "text/html; charset=windows-1250",
    },
    {
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentType: "text/html; charset=windows-1250",
    },
    {
      bytes: Buffer.from("<!-- notice --><html><input type='password'></html>"),
      contentType: "text/html; charset=windows-1250",
    },
    {
      bytes: Buffer.from(
        "\uFEFF<!-- notice --><html><title>Just a moment</title></html>",
      ),
      contentType: "text/html; charset=utf-8",
    },
    {
      bytes: Buffer.from(
        "<!-- notice --><html><body>Missing PDF</body></html>",
      ),
      contentType: "text/html; charset=windows-1250",
      expectedFormat: "pdf",
    },
    {
      bytes: Buffer.from(
        "<!-- notice --><html><body>Missing PDF</body></html>",
      ),
      contentType: "application/pdf",
    },
    {
      bytes: Buffer.from(
        "<!-- unclosed notice <html><body>Not confirmed</body></html>",
      ),
      contentType: "text/html",
    },
    {
      bytes: Buffer.from("<html><body>Document</body></html>"),
      contentType: "text/html; charset=x-unknown-encoding",
    },
  ];
  for (const candidate of cases) {
    const h = harness([
      {
        headers: { "content-type": candidate.contentType },
        chunks: [candidate.bytes],
      },
    ]);
    await rejectsCode(
      createSourceFetcher(h.deps)(
        opts({ expectedFormat: candidate.expectedFormat }),
      ),
      "format",
    );
    assert.ok(h.requests[0].destroyed && h.responses[0].destroyed);
  }
});

test("HTTP charset parser handles quoted parameters and leaves absent charset null", async () => {
  for (const [contentType, charset] of [
    [
      'Text/HTML; note="literal; charset=not-a-real-parameter"; Charset="cp1250"',
      "cp1250",
    ],
    ['text/html; note="literal; charset=not-a-real-parameter"', null],
  ] as const) {
    const h = harness([
      {
        headers: { "content-type": contentType },
        chunks: [Buffer.from("<html><body>Text</body></html>")],
      },
    ]);
    const result = await createSourceFetcher(h.deps)(opts());
    assert.equal(result.mime, "text/html");
    assert.equal(result.charset, charset);
  }
});

test("HTTPS pins validated IP while keeping original Host, TLS verification and SNI; cleanup on success", async () => {
  const h = harness([
    {
      headers: {
        "content-type": "application/octet-stream",
        etag: '"v1"',
        "last-modified": "Wed, 28 Oct 2026 12:00:00 GMT",
      },
    },
  ]);
  const result = await createSourceFetcher(h.deps)(
    opts({ expectedFormat: "pdf" }),
  );
  assert.equal(result.kind, "fetched");
  if (result.kind !== "fetched") return;
  assert.equal(result.sha256, createHash("sha256").update(pdf).digest("hex"));
  assert.equal(result.signature, "pdf");
  assert.deepEqual(result.bytes, pdf);
  const o = h.requests[0].options;
  assert.equal(o.hostname, "www.suz.cvut.cz");
  assert.equal(o.servername, o.hostname);
  assert.equal(o.rejectUnauthorized, true);
  assert.equal(o.autoSelectFamily, false);
  assert.deepEqual(o.headers, {
    Host: "www.suz.cvut.cz",
    "User-Agent": "StrahovRAG-Test/1.0",
    Accept:
      "application/pdf, application/xml, text/html, text/plain, application/octet-stream;q=0.8",
    "Accept-Encoding": "identity",
    Connection: "close",
  });
  const pinned = await new Promise((resolve, reject) =>
    (o.lookup as any)(
      "attacker.invalid",
      { all: true },
      (error: Error | null, value: unknown) =>
        error ? reject(error) : resolve(value),
    ),
  );
  assert.deepEqual(pinned, [{ address: "147.32.1.2", family: 4 }]);
  assert.equal(h.dnsCalls(), 1);
  assert.ok(
    o.checkServerIdentity!("attacker.invalid", {
      subjectaltname: "DNS:attacker.invalid",
    } as any),
  );
  assert.ok(h.requests.every((r) => r.destroyed));
  assert.ok(h.responses.every((r) => r.destroyed));
});

test("IP classifier rejects private, special and IPv6 tunnelling ranges", () => {
  for (const address of [
    "0.1.2.3",
    "10.1.2.3",
    "100.64.1.2",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.1.2",
    "192.168.1.2",
    "192.0.2.1",
    "192.88.99.1",
    "198.18.1.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.1.1.1",
    "240.0.0.1",
    "::",
    "::1",
    "::ffff:127.0.0.1",
    "::ffff:808:808",
    "64:ff9b::7f00:1",
    "fc00::1",
    "fe80::1",
    "ff02::1",
    "2001::1",
    "2001:db8::1",
    "2002:7f00:1::",
    "3fff::1",
    "5f00::1",
    "2606:4700::1%eth0",
    "bad",
  ])
    assert.equal(isPublicSourceAddress(address), false, address);
  for (const address of [
    "147.32.1.2",
    "8.8.8.8",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])
    assert.equal(isPublicSourceAddress(address), true, address);
});

test("mixed or private DNS is rejected before any transport; all records must be public", async () => {
  for (const addresses of [
    [{ address: "127.0.0.1", family: 4 }],
    [
      { address: "147.32.1.2", family: 4 },
      { address: "::1", family: 6 },
    ],
    [{ address: "::ffff:147.32.1.2", family: 6 }],
    [{ address: "147.32.1.2", family: 6 }],
    [],
  ]) {
    const h = harness([], addresses);
    await rejectsCode(createSourceFetcher(h.deps)(opts()), "ssrf");
    assert.equal(h.requests.length, 0);
  }
});

test("redirects recheck path policy, DNS and robots without sending cookies or authorization", async () => {
  const calls: string[] = [];
  const h = harness([
    {
      status: 302,
      headers: {
        location: "/cz/media/file/next",
        "set-cookie": "SESSION=secret",
      },
    },
    { headers: { "content-type": "application/pdf" } },
  ]);
  const result = await createSourceFetcher(h.deps)(
    opts({
      robots: async (value) => {
        calls.push(value);
        return { allowed: true, reason: "allowed" };
      },
    }),
  );
  assert.equal(result.finalUrl, "https://www.suz.cvut.cz/cz/media/file/next");
  assert.equal(result.redirects.length, 1);
  assert.equal(h.dnsCalls(), 2);
  assert.equal(calls.length, 2);
  for (const r of h.requests) {
    assert.equal((r.options.headers as any).Cookie, undefined);
    assert.equal((r.options.headers as any).Authorization, undefined);
  }
  for (const location of [
    "https://evil.example/a",
    "https://127.0.0.1/a",
    "http://www.suz.cvut.cz/a",
    "https://user:pass@www.suz.cvut.cz/a",
  ]) {
    const denied = harness([{ status: 302, headers: { location } }]);
    await rejectsCode(createSourceFetcher(denied.deps)(opts()), "policy");
    assert.equal(denied.requests.length, 1);
    assert.ok(denied.responses[0].destroyed);
  }
});

test("DNS rebind across redirects is rejected and existing connection pin cannot re-resolve", async () => {
  const h = harness([{ status: 302, headers: { location: "/next" } }]);
  let count = 0;
  h.deps.resolve = async () =>
    ++count === 1
      ? [{ address: "147.32.1.2", family: 4 }]
      : [{ address: "::1", family: 6 }];
  await rejectsCode(createSourceFetcher(h.deps)(opts()), "ssrf");
  assert.equal(h.requests.length, 1);
  assert.equal(count, 2);
  const pinned = await new Promise((resolve) =>
    (h.requests[0].options.lookup as any)(
      "www.suz.cvut.cz",
      {},
      (_e: unknown, address: string) => resolve(address),
    ),
  );
  assert.equal(pinned, "147.32.1.2");
  assert.equal(count, 2);
});

test("robots denial, missing decision and callback failure fail closed; every redirect needs decision", async () => {
  for (const robots of [
    async () => ({ allowed: false, reason: "disallow" }),
    async () => null as any,
    async () => {
      throw new Error("503 robots");
    },
  ]) {
    const h = harness([]);
    await assert.rejects(
      createSourceFetcher(h.deps)(opts({ robots })),
      (e: unknown) =>
        e instanceof SourceFetchError && e.code.startsWith("robots-"),
    );
    assert.equal(h.requests.length, 0);
  }
  const h = harness([{ status: 302, headers: { location: "/next" } }]);
  let i = 0;
  await rejectsCode(
    createSourceFetcher(h.deps)(
      opts({
        robots: async () => ({
          allowed: ++i === 1,
          reason: "redirect blocked",
        }),
      }),
    ),
    "robots-denied",
  );
  assert.equal(h.requests.length, 1);
});

test("304 is distinct from bytes and preserves matching validators; validators never leak to a different URL", async () => {
  const h = harness([{ status: 304, headers: {} }]);
  const result = await createSourceFetcher(h.deps)(
    opts({
      validators: {
        url,
        etag: '"old"',
        lastModified: "Wed, 28 Oct 2026 12:00:00 GMT",
      },
    }),
  );
  assert.equal(result.kind, "not-modified");
  assert.equal(result.etag, '"old"');
  assert.equal("bytes" in result, false);
  assert.equal(
    (h.requests[0].options.headers as any)["If-None-Match"],
    '"old"',
  );
  const redirect = harness([
    { status: 302, headers: { location: "/next" } },
    { status: 200 },
  ]);
  await createSourceFetcher(redirect.deps)(
    opts({ validators: { url, etag: '"origin-specific"' } }),
  );
  assert.equal(
    (redirect.requests[1].options.headers as any)["If-None-Match"],
    undefined,
  );
  const unsolicited = harness([{ status: 304 }]);
  await rejectsCode(createSourceFetcher(unsolicited.deps)(opts()), "http");
});

test("chunked real bytes, Content-Length and unrequested compression cannot escape limits", async () => {
  const plans: Plan[] = [
    { chunks: [Buffer.alloc(600, 65), Buffer.alloc(600, 65)] },
    { headers: { "content-length": "2000" } },
    {
      headers: { "content-encoding": "gzip" },
      chunks: [Buffer.from([31, 139, 8, 0])],
    },
    { headers: { "content-encoding": "br" } },
  ];
  for (const plan of plans) {
    const h = harness([plan]);
    await rejectsCode(
      createSourceFetcher(h.deps)(opts()),
      plan.headers?.["content-encoding"] ? "encoding" : "byte-limit",
    );
    assert.ok(h.responses[0].destroyed);
    assert.ok(h.requests[0].destroyed);
  }
  const truncated = harness([{ headers: { "content-length": "100" } }]);
  await rejectsCode(createSourceFetcher(truncated.deps)(opts()), "network");
});

test("whole-transfer deadline covers hanging body, DNS, robots and late headers; late response is destroyed", async () => {
  const limits = { timeoutMs: 20, maxBytes: 1024, maxRedirects: 3 };
  const slow = harness([{ hangBody: true }]);
  await rejectsCode(
    createSourceFetcher(slow.deps)(opts({ limits })),
    "timeout",
  );
  assert.ok(slow.responses[0].destroyed);
  assert.ok(slow.requests[0].destroyed);
  const dns = harness([]);
  dns.deps.resolve = async () => new Promise(() => {});
  await rejectsCode(createSourceFetcher(dns.deps)(opts({ limits })), "timeout");
  assert.equal(dns.requests.length, 0);
  const robots = harness([]);
  await rejectsCode(
    createSourceFetcher(robots.deps)(
      opts({ limits, robots: async () => new Promise(() => {}) }),
    ),
    "timeout",
  );
  assert.equal(robots.requests.length, 0);
  const late = harness([{ lateResponse: true }]);
  await rejectsCode(
    createSourceFetcher(late.deps)(opts({ limits })),
    "timeout",
  );
  late.late[0]();
  assert.ok(late.responses[0].destroyed);
  assert.ok(late.requests[0].destroyed);
});

test("caller abort terminates owned transfer and pre-abort performs no DNS or request", async () => {
  const c = new AbortController();
  c.abort();
  const h = harness([]);
  await rejectsCode(
    createSourceFetcher(h.deps)(opts({ signal: c.signal })),
    "aborted",
  );
  assert.equal(h.dnsCalls(), 0);
  const running = harness([{ lateResponse: true }]);
  const controller = new AbortController();
  const pending = createSourceFetcher(running.deps)(
    opts({ signal: controller.signal }),
  );
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await rejectsCode(pending, "aborted");
  assert.ok(running.requests[0].destroyed);
  running.late[0]();
  assert.ok(running.responses[0].destroyed);
});

test("MIME is checked against signature and challenge/login HTML cannot masquerade as PDF", async () => {
  for (const plan of [
    {
      headers: { "content-type": "application/pdf" },
      chunks: [Buffer.from("<html><body>Missing document</body></html>")],
    },
    {
      headers: { "content-type": "text/html" },
      chunks: [Buffer.from('<html><input type="password"></html>')],
    },
    {
      headers: { "content-type": "application/octet-stream" },
      chunks: [Buffer.from([0, 1, 2, 3])],
    },
    { chunks: [] },
  ]) {
    const h = harness([plan]);
    await rejectsCode(createSourceFetcher(h.deps)(opts()), "format");
    assert.ok(h.responses[0].destroyed);
  }
  const zip = harness([
    {
      headers: { "content-type": "application/octet-stream" },
      chunks: [Buffer.from("504b030400000000", "hex")],
    },
  ]);
  const result = await createSourceFetcher(zip.deps)(
    opts({ expectedFormat: "docx" }),
  );
  assert.equal(result.kind, "fetched");
  if (result.kind === "fetched")
    assert.equal(result.signature, "zip-container");
  const ole = harness([
    {
      headers: { "content-type": "application/msword" },
      chunks: [Buffer.from("d0cf11e0a1b11ae100000000", "hex")],
    },
  ]);
  const legacy = await createSourceFetcher(ole.deps)(opts());
  if (legacy.kind === "fetched") assert.equal(legacy.signature, "legacy-ole");
});

test("HTTP failures preserve metadata and Retry-After, never fabricate empty success; redirects are bounded", async () => {
  const h = harness([
    { status: 503, headers: { "retry-after": "120", etag: '"still-there"' } },
  ]);
  await assert.rejects(
    createSourceFetcher(h.deps)(opts()),
    (e: unknown) =>
      e instanceof SourceFetchError &&
      e.code === "http" &&
      e.metadata?.statusCode === 503 &&
      e.metadata.retryAfter === "120",
  );
  const loop = harness([{ status: 302, headers: { location: url } }]);
  await rejectsCode(createSourceFetcher(loop.deps)(opts()), "redirect");
  assert.equal(loop.requests.length, 1);
  const limited = harness([{ status: 302, headers: { location: "/next" } }]);
  await rejectsCode(
    createSourceFetcher(limited.deps)(
      opts({ limits: { timeoutMs: 1000, maxBytes: 1024, maxRedirects: 0 } }),
    ),
    "redirect",
  );
  const failed = harness([{ error: true }]);
  await rejectsCode(createSourceFetcher(failed.deps)(opts()), "network");
  assert.ok(failed.requests[0].destroyed);
});

test("robots bootstrap is exact-path only, distinguishes absence and rejects server failure", async () => {
  const robotUrl = "https://www.suz.cvut.cz/robots.txt";
  for (const status of [404, 410]) {
    const h = harness([{ status }]);
    const result = await createRobotsFetcher(h.deps)(opts({ url: robotUrl }));
    assert.equal(result.kind, "absent");
  }
  const bad = harness([]);
  await rejectsCode(createRobotsFetcher(bad.deps)(opts()), "policy");
  assert.equal(bad.requests.length, 0);
  const failure = harness([{ status: 503 }]);
  await rejectsCode(
    createRobotsFetcher(failure.deps)(opts({ url: robotUrl })),
    "http",
  );
  const redirected = harness([
    { status: 302, headers: { location: "/public/document" } },
  ]);
  await rejectsCode(
    createRobotsFetcher(redirected.deps)(opts({ url: robotUrl })),
    "policy",
  );
  assert.equal(redirected.requests.length, 1);
  const valid = harness([
    {
      headers: { "content-type": "text/plain" },
      chunks: [Buffer.from("User-agent: *\nDisallow: /private\n")],
    },
  ]);
  const result = await createRobotsFetcher(valid.deps)(opts({ url: robotUrl }));
  assert.equal(result.kind, "fetched");
  const empty = harness([
    { headers: { "content-type": "text/plain" }, chunks: [] },
  ]);
  assert.equal(
    (await createRobotsFetcher(empty.deps)(opts({ url: robotUrl }))).kind,
    "fetched",
  );
  const html = harness([
    {
      headers: { "content-type": "text/html" },
      chunks: [Buffer.from("<html><body>Site</body></html>")],
    },
  ]);
  await rejectsCode(
    createRobotsFetcher(html.deps)(opts({ url: robotUrl })),
    "format",
  );
});

test("native DNS resolver owns both A/AAAA queries and cancels them on deadline", async (t) => {
  const cancellations: (() => void)[] = [];
  let a = 0,
    aaaa = 0,
    cancelled = 0;
  const pending = () =>
    new Promise<never>((_resolve, reject) => {
      cancellations.push(() =>
        reject(Object.assign(new Error("cancelled"), { code: "ECANCELLED" })),
      );
    });
  t.mock.method(Resolver.prototype, "resolve4", () => {
    a++;
    return pending();
  });
  t.mock.method(Resolver.prototype, "resolve6", () => {
    aaaa++;
    return pending();
  });
  t.mock.method(Resolver.prototype, "cancel", () => {
    cancelled++;
    cancellations.splice(0).forEach((cancel) => cancel());
  });
  const h = harness([]);
  delete h.deps.resolve;
  await rejectsCode(
    createSourceFetcher(h.deps)(
      opts({ limits: { timeoutMs: 20, maxBytes: 1024, maxRedirects: 1 } }),
    ),
    "timeout",
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(a, 1);
  assert.equal(aaaa, 1);
  assert.ok(cancelled >= 1);
  assert.equal(h.requests.length, 0);
});

test("native DNS does not use partial family success when the other family fails temporarily", async (t) => {
  t.mock.method(Resolver.prototype, "resolve4", async () => ["147.32.1.2"]);
  t.mock.method(Resolver.prototype, "resolve6", async () => {
    throw Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" });
  });
  t.mock.method(Resolver.prototype, "cancel", () => {});
  const h = harness([]);
  delete h.deps.resolve;
  await rejectsCode(createSourceFetcher(h.deps)(opts()), "dns");
  assert.equal(h.requests.length, 0);
});
