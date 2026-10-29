import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import test from "node:test";
import type { KnowledgeChunk } from "../server/crazy-typka-retrieval";
import {
  createEmbeddingProfile,
  documentEmbeddingInput,
  documentEmbeddingInputV3,
  validateEmbeddingProfile,
  embeddingInputHash,
  createOpenAIEmbedder,
  EmbeddingError,
  type EmbeddingErrorCode,
} from "../server/rag-embeddings";

const profile = createEmbeddingProfile({ dimensions: 3 });

test("explicit heading input profile preserves every legacy identity and requires a matching v3 representation", () => {
  const legacy = createEmbeddingProfile();
  assert.equal(
    legacy.id,
    createEmbeddingProfile({ inputVersion: "title-locator-text-v1" }).id,
  );
  const next = createEmbeddingProfile({
    inputVersion: "title-heading-text-v2",
  });
  assert.notEqual(next.id, legacy.id);
  assert.equal(
    next.id,
    createHash("sha256")
      .update(
        JSON.stringify([
          "openai",
          "text-embedding-3-large",
          3072,
          "title-heading-text-v2",
        ]),
      )
      .digest("hex"),
  );
  assert.deepEqual(
    validateEmbeddingProfile(JSON.parse(JSON.stringify(next))),
    next,
  );
  assert.throws(
    () => createEmbeddingProfile({ inputVersion: "unknown" } as never),
    { message: "invalid-profile" },
  );
  assert.throws(() => validateEmbeddingProfile({ ...next, id: legacy.id }), {
    message: "invalid-profile",
  });
  const document = {
    schemaVersion: 3 as const,
    id: "suz-document",
    sourceVersionId: "a".repeat(64),
    title: "Ubytování",
  };
  const chunk = {
    schemaVersion: 3 as const,
    sourceId: document.id,
    sourceVersionId: document.sourceVersionId,
    text: "  Výjimka neplatí. 🐎\n",
    headingPath: ["Pravidla", "Výjimky"],
  };
  assert.equal(
    documentEmbeddingInputV3(document, chunk, next),
    JSON.stringify([document.title, chunk.headingPath, chunk.text]),
  );
  assert.throws(() => documentEmbeddingInputV3(document, chunk, legacy), {
    message: "invalid-input",
  });
  assert.throws(
    () =>
      documentEmbeddingInputV3(
        document,
        { ...chunk, sourceVersionId: "b".repeat(64) },
        next,
      ),
    { message: "invalid-input" },
  );
  assert.throws(
    () =>
      documentEmbeddingInputV3(document, { ...chunk, text: "bad\0text" }, next),
    { message: "invalid-input" },
  );
  assert.throws(
    () =>
      documentEmbeddingInputV3(
        document,
        { ...chunk, text: "😀".repeat(2050) },
        next,
      ),
    { message: "request-too-large" },
  );
});
const signal = () => new AbortController().signal;
const complete = (
  vectors = [[1, 0, 0]],
  usage = { prompt_tokens: 4, total_tokens: 4 },
) => ({
  object: "list",
  model: profile.model,
  usage,
  data: vectors.map((embedding, index) => ({
    object: "embedding",
    index,
    embedding,
  })),
});
const rejectCode = (work: Promise<unknown>, code: EmbeddingErrorCode) =>
  assert.rejects(
    work,
    (error) =>
      error instanceof EmbeddingError &&
      error.code === code &&
      error.message === code,
  );
function fixture(
  response: unknown = complete(),
  overrides: Partial<Parameters<typeof createOpenAIEmbedder>[0]> = {},
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const embedder = createOpenAIEmbedder({
    apiKey: "fake-private-key",
    profile,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return response instanceof Response ? response : Response.json(response);
    },
    ...overrides,
  });
  return { embedder, calls };
}

test("heading profile uses the same fixed OpenAI wire API with its exact new input", async () => {
  const next = createEmbeddingProfile({
    dimensions: 3,
    inputVersion: "title-heading-text-v2",
  });
  const f = fixture(complete(), { profile: next });
  const input = JSON.stringify(["Dokument", ["Oddíl"], "Přesný text"]);
  const result = await f.embedder.embed([input], { signal: signal() });
  assert.deepEqual(result.vectors, [[1, 0, 0]]);
  assert.equal(f.embedder.profile.id, next.id);
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), {
    model: next.model,
    dimensions: 3,
    encoding_format: "float",
    input: [input],
  });
});

test("profile identity includes provider/model/dimensions/format and is immutable", () => {
  const standard = createEmbeddingProfile();
  assert.equal(standard.model, "text-embedding-3-large");
  assert.equal(standard.dimensions, 3072);
  assert.equal(
    standard.id,
    createHash("sha256")
      .update(
        JSON.stringify([
          "openai",
          "text-embedding-3-large",
          3072,
          "title-locator-text-v1",
        ]),
      )
      .digest("hex"),
  );
  assert.ok(Object.isFrozen(standard));
  assert.deepEqual(
    standard,
    createEmbeddingProfile({ dimensions: 3072, model: standard.model }),
  );
  assert.notEqual(standard.id, profile.id);
  assert.notEqual(
    standard.id,
    createEmbeddingProfile({
      model: "text-embedding-3-small",
      dimensions: 1536,
    }).id,
  );
  assert.equal(
    createEmbeddingProfile({ model: "text-embedding-3-large" }).dimensions,
    3072,
  );
  for (const options of [
    null,
    { model: "constructor" },
    { model: "https://private.invalid" },
    { model: null },
    { dimensions: 0 },
    { dimensions: 1.5 },
    { dimensions: 3073 },
    { dimensions: null },
    { dimensions: NaN },
    { dimensions: Infinity },
    { model: [standard.model] },
  ])
    assert.throws(() => createEmbeddingProfile(options as never), {
      message: "invalid-profile",
    });
});

test("document input and hash preserve exact text and ignore review metadata", () => {
  const chunk = {
    document: { title: "ČVUT\nSÚZ", checkedAt: "2026-10-28" },
    sourceLocator: "s. 3",
    text: "  Příliš žluťoučký 🐎\n",
  } as KnowledgeChunk;
  const input = documentEmbeddingInput(chunk);
  assert.equal(
    input,
    JSON.stringify([chunk.document.title, chunk.sourceLocator, chunk.text]),
  );
  assert.equal(
    embeddingInputHash(input),
    createHash("sha256").update(input, "utf8").digest("hex"),
  );
  const renewed = {
    ...chunk,
    document: {
      ...chunk.document,
      checkedAt: "2026-11-01",
      reviewAfter: "2026-12-01",
    },
  };
  assert.equal(documentEmbeddingInput(renewed), input);
  assert.notEqual(
    documentEmbeddingInput({ ...chunk, sourceLocator: "s. 4" }),
    input,
  );
  assert.notEqual(embeddingInputHash("á"), embeddingInputHash("a\u0301"));
  assert.notEqual(embeddingInputHash(" text"), embeddingInputHash("text"));
  for (const value of [null, "", "  ", "bad\ud800", "\udfff"])
    assert.throws(() => embeddingInputHash(value as never), {
      message: "invalid-input",
    });
  assert.throws(() => documentEmbeddingInput(null as never), {
    message: "invalid-input",
  });
});

test("one fixed float request orders vectors by index and returns only validated usage", async () => {
  const response = complete(
    [
      [1, 0, 0],
      [0, 1, 0],
    ],
    { prompt_tokens: 7, total_tokens: 7 },
  );
  response.data.reverse();
  const f = fixture(response);
  const controller = new AbortController();
  const attempts: number[] = [];
  const result = await f.embedder.embed(["Český text", "中文😀"], {
    signal: controller.signal,
    user: "anonymous-123",
    onAttempt: (bytes) => attempts.push(bytes),
  });
  assert.deepEqual(result, {
    vectors: [
      [1, 0, 0],
      [0, 1, 0],
    ],
    usage: { promptTokens: 7, totalTokens: 7 },
  });
  assert.deepEqual(attempts, [Buffer.byteLength("Český text中文😀")]);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, "https://api.openai.com/v1/embeddings");
  assert.equal(f.calls[0].init.redirect, "error");
  assert.equal(f.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)), {
    model: profile.model,
    dimensions: 3,
    encoding_format: "float",
    input: ["Český text", "中文😀"],
    user: "anonymous-123",
  });
  assert.equal(
    (f.calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer fake-private-key",
  );
  assert.equal(
    f.calls[0].init.signal?.aborted,
    true,
    "completed transport is retired",
  );
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  assert.doesNotMatch(JSON.stringify(result), /fake-private-key|Český/);
});

test("caller mutation after admission cannot change the serialized request or response count", async () => {
  const f = fixture();
  const inputs = ["Original"];
  const options = {
    signal: signal(),
    onAttempt() {
      inputs.push("Late");
      options.signal = signal();
    },
  };
  const originalSignal = options.signal;
  const result = await f.embedder.embed(inputs, options);
  assert.equal(result.vectors.length, 1);
  assert.deepEqual(JSON.parse(String(f.calls[0].init.body)).input, [
    "Original",
  ]);
  assert.equal(getEventListeners(originalSignal, "abort").length, 0);
});

test("factory validates and snapshots profile/configuration without leaking secrets", () => {
  for (const bad of [
    null,
    { ...profile, id: "bad" },
    { ...profile, model: "text-embedding-3-small" },
    { ...profile, provider: "other" },
    { ...profile, inputVersion: "old" },
  ])
    assert.throws(() => fixture(complete(), { profile: bad as never }), {
      message: "invalid-profile",
    });
  for (const bad of [
    { apiKey: "" },
    { apiKey: "secret\nunsafe" },
    { timeoutMs: 0 },
    { timeoutMs: 60001 },
    { maxInputs: 33 },
    { maxInputBytes: 8192 },
    { maxBatchBytes: 65537 },
    { responseBytes: Infinity },
    { timeoutMs: null },
    { fetch: null },
  ])
    assert.throws(() => fixture(complete(), bad as never), {
      message: "invalid-configuration",
    });
  assert.throws(() => createOpenAIEmbedder(null as never), {
    message: "invalid-configuration",
  });
  const mutable = { ...profile };
  const f = fixture(complete(), { profile: mutable });
  mutable.dimensions = 1;
  assert.equal(f.embedder.profile.dimensions, 3);
  assert.ok(Object.isFrozen(f.embedder.profile));
});

test("local limits and malformed inputs reject before budget reservation or fetch", async () => {
  const f = fixture();
  let attempts = 0;
  const options = { signal: signal(), onAttempt: () => attempts++ };
  for (const inputs of [
    null,
    [],
    [null],
    [""],
    ["  "],
    ["bad\ud800"],
    new Array(2),
    new Array(33).fill("x"),
  ])
    await rejectCode(
      f.embedder.embed(inputs as never, options),
      "invalid-input",
    );
  await rejectCode(
    f.embedder.embed(["x".repeat(8192)], options),
    "request-too-large",
  );
  await rejectCode(
    f.embedder.embed(new Array(9).fill("x".repeat(8191)), options),
    "request-too-large",
  );
  await rejectCode(
    f.embedder.embed(new Array(8).fill("x" + "\u0000".repeat(8190)), options),
    "request-too-large",
  );
  await rejectCode(
    f.embedder.embed(["text"], { ...options, user: "u".repeat(129) }),
    "invalid-input",
  );
  await rejectCode(f.embedder.embed(["text"], null as never), "invalid-input");
  assert.equal(attempts, 0);
  assert.equal(f.calls.length, 0);
});

test("UTF-8 boundary accepts long Czech/Unicode queries without counting characters as bytes", async () => {
  const f = fixture();
  await f.embedder.embed(["汉".repeat(1500)], { signal: signal() });
  await f.embedder.embed(["😀".repeat(2047) + "abc"], { signal: signal() });
  await rejectCode(
    f.embedder.embed(["😀".repeat(2048)], { signal: signal() }),
    "request-too-large",
  );
  assert.equal(f.calls.length, 2);
});

test("budget exception is preserved exactly and abort-before-fetch performs no request", async () => {
  const f = fixture();
  const budgetError = new Error("caller budget sentinel");
  await assert.rejects(
    f.embedder.embed(["valid"], {
      signal: signal(),
      onAttempt() {
        throw budgetError;
      },
    }),
    (error) => error === budgetError,
  );
  const cancelled = new AbortController();
  cancelled.abort(new Error("private abort reason"));
  let attempts = 0;
  await rejectCode(
    f.embedder.embed(["valid"], {
      signal: cancelled.signal,
      onAttempt: () => attempts++,
    }),
    "cancelled",
  );
  assert.equal(attempts, 0);
  const duringAttempt = new AbortController();
  await rejectCode(
    f.embedder.embed(["valid"], {
      signal: duringAttempt.signal,
      onAttempt: () => duringAttempt.abort(),
    }),
    "cancelled",
  );
  assert.equal(f.calls.length, 0);
});

const malformed: [string, (value: any) => unknown][] = [
  ["null response", () => null],
  ["array response", () => []],
  ["wrong object", (value) => ({ ...value, object: "embedding" })],
  ["wrong model", (value) => ({ ...value, model: "text-embedding-3-small" })],
  ["missing vector", (value) => ({ ...value, data: [] })],
  [
    "extra vector",
    (value) => ({ ...value, data: [...value.data, ...value.data] }),
  ],
  ["null item", (value) => ({ ...value, data: [null] })],
  [
    "wrong item type",
    (value) => ({ ...value, data: [{ ...value.data[0], object: "other" }] }),
  ],
  [
    "negative index",
    (value) => ({ ...value, data: [{ ...value.data[0], index: -1 }] }),
  ],
  [
    "out-of-range index",
    (value) => ({ ...value, data: [{ ...value.data[0], index: 1 }] }),
  ],
  [
    "fractional index",
    (value) => ({ ...value, data: [{ ...value.data[0], index: 0.5 }] }),
  ],
  [
    "string index",
    (value) => ({ ...value, data: [{ ...value.data[0], index: "0" }] }),
  ],
  ["wrong dimension", () => complete([[1, 0]])],
  ["null dimension", () => complete([[1, 0, null as never]])],
  ["string dimension", () => complete([[1, 0, "0" as never]])],
  ["zero vector", () => complete([[0, 0, 0]])],
  ["non-unit norm", () => complete([[1, 1, 1]])],
  ["overflow norm", () => complete([[1e308, 0, 0]])],
  ["underflow norm", () => complete([[1e-300, 0, 0]])],
  ["missing usage", (value) => ({ ...value, usage: undefined })],
  ["null usage", (value) => ({ ...value, usage: null })],
  [
    "negative usage",
    () => complete(undefined, { prompt_tokens: -1, total_tokens: 4 }),
  ],
  [
    "fractional usage",
    () => complete(undefined, { prompt_tokens: 1.5, total_tokens: 4 }),
  ],
  [
    "decreasing total usage",
    () => complete(undefined, { prompt_tokens: 4, total_tokens: 3 }),
  ],
  [
    "unsafe usage",
    () =>
      complete(undefined, {
        prompt_tokens: 4,
        total_tokens: Number.MAX_SAFE_INTEGER + 1,
      }),
  ],
];
for (const [name, mutate] of malformed)
  test(`rejects ${name} without retry`, async () => {
    const f = fixture(mutate(complete()));
    await rejectCode(
      f.embedder.embed(["text"], { signal: signal() }),
      "invalid-response",
    );
    assert.equal(f.calls.length, 1);
  });

test("duplicate indices cannot replace another result", async () => {
  const value = complete([
    [1, 0, 0],
    [0, 1, 0],
  ]);
  value.data[1].index = 0;
  const f = fixture(value);
  await rejectCode(
    f.embedder.embed(["one", "two"], { signal: signal() }),
    "invalid-response",
  );
});

test("accepts normal float precision and rejects overflow literals in valid JSON", async () => {
  const f = fixture(complete([[0.26726124, 0.53452248, 0.80178373]]));
  assert.equal(
    (await f.embedder.embed(["text"], { signal: signal() })).vectors.length,
    1,
  );
  const raw = JSON.stringify(complete()).replace("[1,0,0]", "[1e400,0,0]");
  const invalid = fixture(
    new Response(raw, { headers: { "Content-Type": "application/json" } }),
  );
  await rejectCode(
    invalid.embedder.embed(["text"], { signal: signal() }),
    "invalid-response",
  );
});

test("bounded body rejects declared/chunked oversize, invalid JSON/UTF-8/type, and cancels bodies", async () => {
  for (const response of [
    new Response("{}", {
      headers: { "Content-Type": "application/json", "Content-Length": "1001" },
    }),
    new Response("{}", {
      headers: { "Content-Type": "application/json", "Content-Length": "-2" },
    }),
    new Response("x".repeat(1001), {
      headers: { "Content-Type": "application/json" },
    }),
    new Response("{", { headers: { "Content-Type": "application/json" } }),
    new Response(new Uint8Array([0xff]), {
      headers: { "Content-Type": "application/json" },
    }),
    new Response("{}", { headers: { "Content-Type": "text/html" } }),
    new Response(null, { headers: { "Content-Type": "application/json" } }),
  ]) {
    const f = fixture(response, { responseBytes: 1000 });
    await rejectCode(
      f.embedder.embed(["text"], { signal: signal() }),
      "invalid-response",
    );
  }
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    cancel() {
      cancelled = true;
    },
  });
  const f = fixture(new Response(body, { status: 429 }));
  await rejectCode(
    f.embedder.embed(["private text"], { signal: signal() }),
    "rate-limited",
  );
  assert.ok(cancelled);
});

test("transport errors and upstream bodies cannot leak credentials or retry", async () => {
  let calls = 0;
  const f = fixture(undefined, {
    fetch: async () => {
      calls++;
      throw new Error("fake-private-key private input upstream");
    },
  });
  await rejectCode(
    f.embedder.embed(["private input"], { signal: signal() }),
    "provider-unavailable",
  );
  assert.equal(calls, 1);
  for (const status of [401, 500, 503]) {
    const failure = fixture(new Response("private upstream body", { status }));
    await rejectCode(
      failure.embedder.embed(["text"], { signal: signal() }),
      "provider-unavailable",
    );
    assert.equal(failure.calls.length, 1);
  }
});

test("deadline covers stalled fetch and stalled body without depending on transport cancellation", async () => {
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    const f = fixture(undefined, {
      timeoutMs: 10,
      fetch: () => new Promise<Response>(() => {}),
    });
    await rejectCode(
      f.embedder.embed(["text"], { signal: signal() }),
      "request-timeout",
    );
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("{"));
      },
      cancel() {
        cancelled = true;
      },
    });
    const stalled = fixture(
      new Response(body, { headers: { "Content-Type": "application/json" } }),
      { timeoutMs: 10 },
    );
    const controller = new AbortController();
    await rejectCode(
      stalled.embedder.embed(["text"], { signal: controller.signal }),
      "request-timeout",
    );
    assert.ok(cancelled);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  } finally {
    clearTimeout(keepAlive);
  }
});

test("caller abort cleans listeners and a late ignored fetch response is cancelled", async () => {
  let finish!: (response: Response) => void;
  const f = fixture(undefined, {
    fetch: () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  });
  const controller = new AbortController();
  const work = f.embedder.embed(["text"], { signal: controller.signal });
  controller.abort(new Error("private caller abort"));
  await rejectCode(work, "cancelled");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  let cancelled = false;
  finish(
    new Response(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(cancelled);
});

test("production dimensions and split response bytes grow the bounded buffer correctly", async () => {
  for (const model of ["text-embedding-3-small", "text-embedding-3-large"]) {
    const selected = createEmbeddingProfile({ model });
    const vectors = Array.from({ length: 2 }, () =>
      new Array(selected.dimensions).fill(1 / Math.sqrt(selected.dimensions)),
    );
    const value = { ...complete(vectors), model };
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    assert.ok(bytes.byteLength > 4096);
    let offset = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (offset === bytes.length) {
          controller.close();
          return;
        }
        const next = Math.min(bytes.length, offset + 997);
        controller.enqueue(bytes.subarray(offset, next));
        offset = next;
      },
    });
    const f = fixture(
      new Response(body, {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      }),
      { profile: selected },
    );
    const result = await f.embedder.embed(["První", "Druhý"], {
      signal: signal(),
    });
    assert.deepEqual(result.vectors, vectors);
    assert.equal(f.calls.length, 1);
  }
});
