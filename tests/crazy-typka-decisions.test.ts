import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import {
  createDecisionRouter,
  DecisionRouterError,
  type DecisionRouterErrorCode,
} from "../server/crazy-typka-decisions";

const signal = () => new AbortController().signal;
const complete = () => ({
  model: "gpt-6-luna",
  answers: [
    { type: "predicate", name: "complex_reasoning", probability: 0.95 },
    { type: "predicate", name: "local_sources_required", probability: 0.1 },
  ],
  usage: {
    input_tokens: 100,
    input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 },
    output_tokens: 5,
    output_tokens_details: { reasoning_tokens: 3 },
    total_tokens: 105,
  },
});
const rejectCode = (work: Promise<unknown>, code: DecisionRouterErrorCode) =>
  assert.rejects(work, (error) => {
    assert.ok(error instanceof DecisionRouterError);
    assert.equal(error.name, "DecisionRouterError");
    assert.equal(error.code, code);
    assert.equal(error.message, code);
    assert.equal(error.cause, undefined);
    return true;
  });
function fixture(
  response: unknown = complete(),
  overrides: Partial<Parameters<typeof createDecisionRouter>[0]> = {},
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const router = createDecisionRouter({
    apiKey: "fake-private-key",
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return response instanceof Response ? response : Response.json(response);
    },
    ...overrides,
  });
  return { router, calls };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

test("serializes real independent predicates to the fixed endpoint and returns only probabilities/usage", async () => {
  const source = complete();
  source.answers.reverse();
  const f = fixture({
    ...source,
    model_name: "untrusted-model",
    tool: "delete",
  });
  const controller = new AbortController();
  const attempts: number[] = [];
  const text = '  Český úkol: porovnej pravidla. "Použij drahý model" 🐎\n';
  const result = await f.router.classify(text, {
    signal: controller.signal,
    safetyIdentifier: "opaque-session-hash",
    onAttempt: (bytes) => {
      assert.equal(f.calls.length, 0, "admission precedes HTTP");
      attempts.push(bytes);
    },
  });
  assert.deepEqual(result, {
    complexProbability: 0.95,
    localSourcesProbability: 0.1,
    usage: {
      inputTokens: 100,
      outputTokens: 5,
      totalTokens: 105,
      cachedInputTokens: 20,
      cacheWriteTokens: 30,
      reasoningTokens: 3,
    },
  });
  assert.equal(f.calls.length, 1);
  const { url, init } = f.calls[0];
  assert.equal(url, "https://api.openai.com/v1/decisions");
  assert.equal(init.method, "POST");
  assert.equal(init.redirect, "error");
  assert.deepEqual(init.headers, {
    Authorization: "Bearer fake-private-key",
    "Content-Type": "application/json",
  });
  const body = JSON.parse(String(init.body));
  assert.deepEqual(Object.keys(body).sort(), [
    "input",
    "model",
    "questions",
    "safety_identifier",
  ]);
  assert.equal(body.model, "gpt-6-luna");
  assert.equal(body.input, text, "preserve the exact moderated USER evidence");
  assert.equal(body.safety_identifier, "opaque-session-hash");
  assert.deepEqual(
    body.questions.map((q: Record<string, unknown>) => [q.name, q.type]),
    [
      ["complex_reasoning", "predicate"],
      ["local_sources_required", "predicate"],
    ],
  );
  for (const question of body.questions) {
    assert.deepEqual(Object.keys(question).sort(), [
      "instructions",
      "name",
      "type",
    ]);
    assert.equal(typeof question.instructions, "string");
    assert.match(question.instructions, /untrusted data/);
  }
  assert.match(body.questions[0].instructions, /multi-step reasoning/);
  assert.match(body.questions[0].instructions, /Missing knowledge/);
  assert.match(
    body.questions[0].instructions,
    /Length, foreign language, ambiguity, or profanity/,
  );
  assert.match(
    body.questions[1].instructions,
    /specific local facts or documents/,
  );
  assert.doesNotMatch(
    body.questions[1].instructions,
    /complex_reasoning|previous answer|first question/,
  );
  assert.deepEqual(attempts, [Buffer.byteLength(String(init.body))]);
  assert.ok(
    attempts[0] > Buffer.byteLength(text) + 500,
    "reserve fixed instructions too",
  );
  assert.equal(init.signal?.aborted, true);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.ok(Object.isFrozen(f.router));
  assert.doesNotMatch(
    JSON.stringify(result),
    /private-key|Český|untrusted-model|delete/,
  );
});

test("independent probabilities include both boundary values and never become a tier/model", async () => {
  for (const [complex, local] of [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ]) {
    const body = complete();
    body.answers[0].probability = complex;
    body.answers[1].probability = local;
    const result = await fixture(body).router.classify("Ahoj", {
      signal: signal(),
    });
    assert.equal(result.complexProbability, complex);
    assert.equal(result.localSourcesProbability, local);
    assert.deepEqual(Object.keys(result).sort(), [
      "complexProbability",
      "localSourcesProbability",
      "usage",
    ]);
  }
});

test("invalid configuration fails locally with a finite safe code", () => {
  for (const overrides of [
    null,
    {},
    { apiKey: "" },
    { apiKey: " secret" },
    { apiKey: "secret\nHeader: value" },
    { apiKey: "🔑" },
    { apiKey: "x".repeat(4097) },
    { apiKey: "fake", fetch: null },
    ...[0, -1, 0.5, NaN, Infinity, null, "5", 4001].map((timeoutMs) => ({
      apiKey: "fake",
      timeoutMs,
    })),
    { apiKey: "fake", maxInputBytes: 8192 },
    { apiKey: "fake", responseBytes: 65537 },
  ]) {
    assert.throws(() => createDecisionRouter(overrides as never), {
      message: "invalid-input",
    });
  }
  const error = new DecisionRouterError("upstream secret" as never);
  assert.equal(error.code, "provider-unavailable");
  assert.equal(error.message, "provider-unavailable");
});

test("input validation and byte caps precede the callback and transport", async () => {
  const f = fixture();
  let attempts = 0;
  const onAttempt = () => {
    attempts++;
  };
  for (const text of [
    null,
    0,
    {},
    "",
    " \n ",
    "bad\ud800",
    "\udc00",
    "\ud800x",
  ]) {
    await rejectCode(
      f.router.classify(text as never, { signal: signal(), onAttempt }),
      "invalid-input",
    );
  }
  for (const call of [
    null,
    {},
    { signal: {} },
    { signal: signal(), onAttempt: 1 },
  ]) {
    await rejectCode(
      f.router.classify("hello", call as never),
      "invalid-input",
    );
  }
  for (const safetyIdentifier of [
    null,
    "",
    " ",
    "x".repeat(129),
    "á".repeat(65),
    "\udc00",
  ]) {
    await rejectCode(
      f.router.classify("hello", {
        signal: signal(),
        onAttempt,
        safetyIdentifier: safetyIdentifier as never,
      }),
      "invalid-input",
    );
  }
  await rejectCode(
    f.router.classify("a".repeat(8192), { signal: signal(), onAttempt }),
    "request-too-large",
  );
  await rejectCode(
    f.router.classify("🐎".repeat(2048), { signal: signal(), onAttempt }),
    "request-too-large",
  );
  // Escaping expands a valid <8191-byte USER text above the 32-KiB request cap.
  await rejectCode(
    f.router.classify("a" + "\u0000".repeat(6000), {
      signal: signal(),
      onAttempt,
    }),
    "request-too-large",
  );
  assert.equal(attempts, 0);
  assert.equal(f.calls.length, 0);
});

test("maximum exact UTF-8 input and a lowered limit are enforced without trimming", async () => {
  const f = fixture();
  await f.router.classify("á".repeat(4095) + "x", { signal: signal() });
  assert.equal(
    Buffer.byteLength(JSON.parse(String(f.calls[0].init.body)).input),
    8191,
  );
  assert.equal(
    Object.hasOwn(
      JSON.parse(String(f.calls[0].init.body)),
      "safety_identifier",
    ),
    false,
  );
  const small = fixture(complete(), { maxInputBytes: 4 });
  await small.router.classify("🐎", { signal: signal() });
  await rejectCode(
    small.router.classify(" 🐎", { signal: signal() }),
    "request-too-large",
  );
  assert.equal(small.calls.length, 1);
});

test("budget rejection preserves identity and cancellation around admission sends no HTTP", async () => {
  const f = fixture();
  const budgetRejection = new Error("caller-owned-cap");
  let attempts = 0;
  await assert.rejects(
    f.router.classify("hello", {
      signal: signal(),
      onAttempt() {
        attempts++;
        throw budgetRejection;
      },
    }),
    (error) => error === budgetRejection,
  );
  const before = new AbortController();
  before.abort(new Error("private cancellation reason"));
  await rejectCode(
    f.router.classify("hello", {
      signal: before.signal,
      onAttempt() {
        attempts++;
      },
    }),
    "cancelled",
  );
  const during = new AbortController();
  await rejectCode(
    f.router.classify("hello", {
      signal: during.signal,
      onAttempt() {
        attempts++;
        during.abort();
      },
    }),
    "cancelled",
  );
  assert.equal(attempts, 2);
  assert.equal(f.calls.length, 0);
  assert.equal(getEventListeners(during.signal, "abort").length, 0);
});

test("callback mutations cannot change the accepted request or transport configuration", async () => {
  const f = fixture();
  const options = {
    signal: signal(),
    safetyIdentifier: "original",
    onAttempt() {
      options.safetyIdentifier = "changed";
      options.signal = new AbortController().signal;
    },
  };
  await f.router.classify("exact USER input", options);
  assert.equal(
    JSON.parse(String(f.calls[0].init.body)).safety_identifier,
    "original",
  );
});

test("refusal, duplicate/missing/unknown answers, wrong model/types and invalid probabilities fail closed", async () => {
  const cases: unknown[] = [
    null,
    {},
    [],
    { ...complete(), model: "gpt-6.1-sol" },
  ];
  for (const answers of [
    [],
    [complete().answers[0]],
    [...complete().answers, complete().answers[0]],
    [complete().answers[0], complete().answers[0]],
    [{ ...complete().answers[0], type: "refusal" }, complete().answers[1]],
    [
      complete().answers[0],
      { type: "refusal", name: "local_sources_required" },
    ],
    [{ ...complete().answers[0], name: "constructor" }, complete().answers[1]],
    [{ ...complete().answers[0], name: null }, complete().answers[1]],
    [{ ...complete().answers[0], type: "choice" }, complete().answers[1]],
    [null, complete().answers[1]],
    ...[-0.1, 1.1, null, "0.9", false].map((probability) => [
      { ...complete().answers[0], probability },
      complete().answers[1],
    ]),
  ])
    cases.push({ ...complete(), answers });
  for (const body of cases) {
    const f = fixture(body);
    let attempts = 0;
    await rejectCode(
      f.router.classify("private USER input", {
        signal: signal(),
        onAttempt() {
          attempts++;
        },
      }),
      "invalid-response",
    );
    assert.equal(attempts, 1);
    assert.equal(f.calls.length, 1);
  }
  // JSON numeric overflow becomes Infinity after parse and must be rejected.
  const raw = JSON.stringify(complete()).replace(
    '"probability":0.95',
    '"probability":1e999',
  );
  await rejectCode(
    fixture(
      new Response(raw, { headers: { "content-type": "application/json" } }),
    ).router.classify("hello", { signal: signal() }),
    "invalid-response",
  );
});

test("usage requires safe nonnegative integers, complete detail fields and consistent subset totals", async () => {
  const base = complete().usage;
  const badUsage: unknown[] = [
    null,
    {},
    { ...base, input_tokens_details: null },
    { ...base, output_tokens_details: null },
  ];
  for (const key of ["input_tokens", "output_tokens", "total_tokens"]) {
    for (const value of [-1, 1.5, "3", null, Number.MAX_SAFE_INTEGER + 1]) {
      badUsage.push({ ...base, [key]: value });
    }
    const missing: Record<string, unknown> = { ...base };
    delete missing[key];
    badUsage.push(missing);
  }
  for (const field of ["cached_tokens", "cache_write_tokens"]) {
    for (const value of [
      -1,
      0.5,
      "0",
      null,
      101,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      badUsage.push({
        ...base,
        input_tokens_details: { ...base.input_tokens_details, [field]: value },
      });
    }
    badUsage.push({ ...base, input_tokens_details: { [field]: 0 } });
  }
  for (const value of [-1, 0.5, "0", null, 6, Number.MAX_SAFE_INTEGER + 1]) {
    badUsage.push({
      ...base,
      output_tokens_details: { reasoning_tokens: value },
    });
  }
  badUsage.push(
    { ...base, total_tokens: 106 },
    { ...base, output_tokens_details: {} },
    {
      ...base,
      input_tokens_details: { cached_tokens: 60, cache_write_tokens: 60 },
    },
  );
  for (const usage of badUsage) {
    await rejectCode(
      fixture({ ...complete(), usage }).router.classify("hello", {
        signal: signal(),
      }),
      "invalid-response",
    );
  }
  const zero = {
    input_tokens: 0,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 0,
  };
  assert.equal(
    (
      await fixture({ ...complete(), usage: zero }).router.classify("hello", {
        signal: signal(),
      })
    ).usage.totalTokens,
    0,
  );
});

test("HTTP and transport errors are safe, cancel bodies and never retry/refund admission", async () => {
  for (const status of [301, 400, 401, 403, 429, 500, 503]) {
    let cancelled = 0;
    let attempts = 0;
    const response = new Response(
      new ReadableStream({
        cancel() {
          cancelled++;
        },
      }),
      { status },
    );
    const f = fixture(response);
    await rejectCode(
      f.router.classify("private USER input", {
        signal: signal(),
        onAttempt() {
          attempts++;
        },
      }),
      status === 429 ? "rate-limited" : "provider-unavailable",
    );
    assert.equal(attempts, 1);
    assert.equal(f.calls.length, 1);
    assert.equal(cancelled, 1);
    assert.equal(response.body?.locked, false);
  }
  for (const fetcher of [
    () => {
      throw new Error("fake-private-key USER body");
    },
    async () => {
      throw new Error("fake-private-key USER body");
    },
    async () => {
      throw new DecisionRouterError("request-too-large");
    },
  ]) {
    await rejectCode(
      fixture(undefined, { fetch: fetcher as typeof fetch }).router.classify(
        "hello",
        { signal: signal() },
      ),
      "provider-unavailable",
    );
  }
});

test("invalid content metadata, oversized bytes, malformed JSON and malformed UTF-8 are rejected", async () => {
  const headers = { "content-type": "application/json" };
  const responses = [
    new Response(JSON.stringify(complete()), {
      headers: { "content-type": "text/plain" },
    }),
    new Response(JSON.stringify(complete()), {
      headers: { ...headers, "content-length": "65537" },
    }),
    new Response(JSON.stringify(complete()), {
      headers: { ...headers, "content-length": "nonsense" },
    }),
    new Response(JSON.stringify(complete()), {
      headers: { ...headers, "content-length": "-1" },
    }),
    new Response(null, { headers }),
    new Response("{private malformed JSON", { headers }),
    new Response(new Uint8Array([0xc3, 0x28]), { headers }),
    new Response(" ".repeat(65537), {
      headers: { ...headers, "content-length": "1" },
    }),
  ];
  for (const response of responses) {
    await rejectCode(
      fixture(response).router.classify("hello", { signal: signal() }),
      "invalid-response",
    );
    assert.equal(response.body?.locked ?? false, false);
  }
  await rejectCode(
    fixture(complete(), { responseBytes: 10 }).router.classify("hello", {
      signal: signal(),
    }),
    "invalid-response",
  );
});

test("split UTF-8 body is decoded exactly with bounded buffer growth and a released reader", async () => {
  const data = new TextEncoder().encode(
    JSON.stringify({ ...complete(), ignored: "ž".repeat(5000) }),
  );
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index === data.length) {
        controller.close();
        return;
      }
      const end = Math.min(index + 733, data.length);
      controller.enqueue(data.subarray(index, end));
      index = end;
    },
  });
  const response = new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  assert.equal(
    (await fixture(response).router.classify("hello", { signal: signal() }))
      .complexProbability,
    0.95,
  );
  assert.equal(body.locked, false);
});

test("deadline settles a signal-ignoring fetch and cancels its late response", async () => {
  let resolveFetch!: (response: Response) => void;
  let transportSignal: AbortSignal | null | undefined;
  let attempts = 0;
  const controller = new AbortController();
  const f = fixture(undefined, {
    timeoutMs: 20,
    fetch: (_url, init) => {
      transportSignal = init?.signal;
      return new Promise((resolve) => {
        resolveFetch = resolve;
      });
    },
  });
  // Production deadline is unref'd; keep only this test's fake transport alive.
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await rejectCode(
      f.router.classify("hello", {
        signal: controller.signal,
        onAttempt() {
          attempts++;
        },
      }),
      "request-timeout",
    );
    assert.equal(transportSignal?.aborted, true);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    let cancelled = 0;
    const body = new ReadableStream({
      cancel() {
        cancelled++;
      },
    });
    resolveFetch(new Response(body));
    await flush();
    assert.equal(cancelled, 1);
    assert.equal(body.locked, false);
    assert.equal(attempts, 1);
  } finally {
    clearInterval(keepAlive);
  }
});

test("deadline covers a stalled response body and releases its reader without awaiting cleanup", async () => {
  let cancelled = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("{"));
    },
    cancel() {
      cancelled++;
      return new Promise<void>(() => {});
    },
  });
  const controller = new AbortController();
  const response = new Response(body, {
    headers: { "content-type": "application/json" },
  });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await rejectCode(
      fixture(response, { timeoutMs: 20 }).router.classify("hello", {
        signal: controller.signal,
      }),
      "request-timeout",
    );
    assert.equal(cancelled, 1);
    assert.equal(body.locked, false);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  } finally {
    clearInterval(keepAlive);
  }
});

test("caller abort during fetch wins, cleans listeners and consumes a late transport rejection", async () => {
  const controller = new AbortController();
  let rejectFetch!: (error: Error) => void;
  let transportSignal: AbortSignal | null | undefined;
  const f = fixture(undefined, {
    fetch: (_url, init) => {
      transportSignal = init?.signal;
      return new Promise((_resolve, reject) => {
        rejectFetch = reject;
      });
    },
  });
  const work = f.router.classify("hello", { signal: controller.signal });
  controller.abort(new Error("private abort reason"));
  await rejectCode(work, "cancelled");
  assert.equal(transportSignal?.aborted, true);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  rejectFetch(new Error("late private upstream error"));
  await flush();
});

test("abort while reading the body is cancellation, even if body cleanup rejects", async () => {
  const controller = new AbortController();
  let cancelled = 0;
  let reading!: () => void;
  const started = new Promise<void>((resolve) => {
    reading = resolve;
  });
  const body = new ReadableStream<Uint8Array>({
    pull() {
      reading();
      return new Promise<void>(() => {});
    },
    cancel() {
      cancelled++;
      throw new Error("private cleanup failure");
    },
  });
  const response = new Response(body, {
    headers: { "content-type": "application/json" },
  });
  const work = fixture(response).router.classify("hello", {
    signal: controller.signal,
  });
  await started;
  await flush();
  controller.abort();
  await rejectCode(work, "cancelled");
  assert.equal(cancelled, 1);
  assert.equal(body.locked, false);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  await flush();
});

test("response arriving in the abort turn is discarded and cannot return a classification", async () => {
  const controller = new AbortController();
  let cancelled = 0;
  const body = new ReadableStream({
    cancel() {
      cancelled++;
    },
  });
  const f = fixture(undefined, {
    fetch: async () => {
      controller.abort();
      return new Response(body);
    },
  });
  await rejectCode(
    f.router.classify("hello", { signal: controller.signal }),
    "cancelled",
  );
  await flush();
  assert.equal(cancelled, 1);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("immediately available empty chunks cannot starve the request deadline", async () => {
  let pulls = 0;
  let cancelled = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(0));
    },
    cancel() {
      cancelled++;
    },
  });
  const response = new Response(body, {
    headers: { "content-type": "application/json" },
  });
  const controller = new AbortController();
  await rejectCode(
    fixture(response, { timeoutMs: 20 }).router.classify("hello", {
      signal: controller.signal,
    }),
    "request-timeout",
  );
  assert.ok(pulls > 0);
  assert.equal(cancelled, 1);
  assert.equal(body.locked, false);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});
