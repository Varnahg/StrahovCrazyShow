import assert from "node:assert/strict";
import test from "node:test";
import {
  createCrazyTypkaProvider,
  CrazyTypkaProviderError,
} from "../server/crazy-typka-provider";
import { retrieveKnowledge } from "../server/crazy-typka-retrieval";

const safe = {
  results: [
    { flagged: false, categories: { harassment: false, sexual: false } },
  ],
};
const evidence = retrieveKnowledge(
  "kancelář",
  4,
  Date.parse("2026-10-27T12:00:00Z"),
);
function complete(text = "Kancelář je na bloku 1.", sourceIds = ["sh-office"]) {
  return {
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
  };
}
function fixture(
  sequence: unknown[],
  options: { timeoutMs?: number; responseBytes?: number } = {},
) {
  const calls: { url: string; body: any; options: RequestInit }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body)),
      options: init!,
    });
    const next = sequence.shift();
    if (next instanceof Error) throw next;
    return next instanceof Response ? next : Response.json(next);
  };
  const provider = createCrazyTypkaProvider({
    apiKey: "test-secret",
    model: "explicit-test-model",
    fetch: fetcher,
    ...options,
  });
  const controller = new AbortController();
  let starts = 0;
  const answer = () =>
    provider.answer({
      message: "Kde je kancelář?",
      locale: "cs",
      history: [],
      evidence,
      safetyIdentifier: "hash-only",
      signal: controller.signal,
      onGenerationStart: () => {
        starts++;
      },
    });
  return { answer, calls, controller, starts: () => starts };
}
test("server-only Responses request uses bounded structured output, verified IDs and input/output moderation", async () => {
  const f = fixture([safe, complete(), safe]);
  assert.deepEqual(await f.answer(), {
    text: "Kancelář je na bloku 1.",
    sourceIds: ["sh-office"],
  });
  assert.deepEqual(
    f.calls.map((call) => call.url),
    [
      "https://api.openai.com/v1/moderations",
      "https://api.openai.com/v1/responses",
      "https://api.openai.com/v1/moderations",
    ],
  );
  const body = f.calls[1].body;
  assert.equal(body.store, false);
  assert.equal(body.model, "explicit-test-model");
  assert.equal(body.max_output_tokens, 600);
  assert.equal(body.safety_identifier, "hash-only");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.tools, undefined);
  assert.match(body.instructions, /fictional AI/);
  assert.match(body.instructions, /untrusted data/);
  assert.equal(f.starts(), 1);
  assert.equal(f.calls[1].options.redirect, "error");
});
test("moderation blocks both flagged content and malformed classifiers before generation", async () => {
  for (const payload of [
    { results: [{ flagged: true, categories: { harassment: true } }] },
    { results: [{ flagged: false }] },
    { results: [{ flagged: false, categories: { sexual: true } }] },
  ]) {
    const f = fixture([payload]);
    await assert.rejects(f.answer(), CrazyTypkaProviderError);
    assert.equal(f.starts(), 0);
    assert.equal(f.calls.length, 1);
  }
});
test("rejects incomplete, refusal, tool output, fabricated citations and output moderation failures", async () => {
  const cases = [
    { ...complete(), status: "incomplete" },
    {
      status: "completed",
      output: [
        {
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "refusal", refusal: "No" }],
        },
      ],
    },
    { status: "completed", output: [{ type: "function_call" }] },
    complete("Ahoj", ["invented"]),
    complete("Ahoj", ["sh-office", "sh-office"]),
    complete("https://evil.invalid", []),
    complete("x".repeat(4001), []),
  ];
  for (const value of cases) {
    const f = fixture([safe, value]);
    await assert.rejects(
      f.answer(),
      (error: any) => error.code === "invalid-response",
    );
    assert.equal(f.calls.length, 2);
  }
  const f = fixture([
    safe,
    complete(),
    { results: [{ flagged: true, categories: { harassment: true } }] },
  ]);
  await assert.rejects(f.answer(), (error: any) => error.code === "blocked");
});
test("provider failures are not retried and secrets or raw errors do not escape", async () => {
  const f = fixture([safe, new Error("test-secret raw upstream private text")]);
  await assert.rejects(
    f.answer(),
    (error: any) =>
      error.code === "provider-unavailable" &&
      !error.message.includes("test-secret"),
  );
  assert.equal(f.calls.length, 2);
  assert.equal(f.starts(), 1);
  const oversized = fixture(
    [
      new Response("x".repeat(100), {
        headers: { "Content-Type": "application/json" },
      }),
    ],
    { responseBytes: 30 },
  );
  await assert.rejects(
    oversized.answer(),
    (error: any) => error.code === "invalid-response",
  );
});
test("deadline covers a stalled provider body, and caller cancellation ends a pending fetch", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
    },
    cancel() {
      cancelled = true;
    },
  });
  const f = fixture(
    [new Response(stream, { headers: { "Content-Type": "application/json" } })],
    { timeoutMs: 10 },
  );
  // Keep the test alive while the production timeout is intentionally unref'ed.
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      f.answer(),
      (error: any) => error.code === "request-timeout",
    );
  } finally {
    clearTimeout(keepAlive);
  }
  assert.ok(cancelled);
  const controller = new AbortController();
  const provider = createCrazyTypkaProvider({
    apiKey: "secret",
    model: "test",
    fetch: (() => new Promise(() => {})) as typeof fetch,
  });
  const work = provider.answer({
    message: "Ahoj",
    locale: "cs",
    history: [],
    evidence: [],
    safetyIdentifier: "anonymous",
    signal: controller.signal,
    onGenerationStart() {},
  });
  controller.abort();
  await assert.rejects(work, (error: any) => error.code === "cancelled");
});
