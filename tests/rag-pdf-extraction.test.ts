import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { getEventListeners } from "node:events";
import {
  createOpenAIPdfExtractor,
  PdfExtractionError,
  type OpenAIPdfExtractorOptions,
  type PdfAttemptReservation,
  type PdfCallOptions,
  type PdfCountReceipt,
  type PdfExtractionInput,
} from "../server/rag-pdf-extraction";

const hash = (value: string | Uint8Array) =>
  createHash("sha256").update(value).digest("hex");
const input = (pageCount = 1, suffix = "fixture"): PdfExtractionInput => {
  // Signature-only synthetic bytes: these tests do not claim to parse a real PDF.
  const bytes = Buffer.from(`%PDF-1.7\n${suffix}\n%%EOF`);
  return { bytes, sha256: hash(bytes), pageCount };
};
const freshSignal = () => new AbortController().signal;
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void,
    reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const usage = () => ({
  input_tokens: 100,
  output_tokens: 12,
  total_tokens: 112,
  input_tokens_details: { cached_tokens: 8, cache_write_tokens: 4 },
  output_tokens_details: { reasoning_tokens: 5 },
});
const document = () => ({
  pages: [
    {
      page: 1,
      blocks: [
        {
          kind: "paragraph",
          text: "Cena není 123 Kč. Ukázka uvádí 21.10.2026.",
        },
        {
          kind: "table",
          rows: 2,
          columns: 2,
          cells: [
            {
              row: 0,
              column: 0,
              rowSpan: 1,
              columnSpan: 2,
              text: "Společná hlavička",
            },
            { row: 1, column: 0, rowSpan: 1, columnSpan: 1, text: "Datum" },
            {
              row: 1,
              column: 1,
              rowSpan: 1,
              columnSpan: 1,
              text: "21.10.2026",
            },
          ],
          headerRows: [0],
          headerColumns: [],
          caption: "Ukázková tabulka",
          notes: ["Ukázková hodnota, nikoli termín."],
        },
      ],
      unresolved: [],
    },
  ],
});
const completed = (doc: unknown = document()): any => ({
  id: "resp_fixture",
  object: "response",
  status: "completed",
  model: "gpt-6.1-sol",
  error: null,
  incomplete_details: null,
  output: [
    { type: "reasoning", summary: [] },
    {
      type: "message",
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: JSON.stringify(doc) }],
    },
  ],
  usage: usage(),
});
const json = (body: unknown, requestId = "req_fixture") =>
  Response.json(body, { headers: { "x-request-id": requestId } });
type Captured = { url: string; raw: string; body: any; init: RequestInit };
function harness(
  overrides: Partial<OpenAIPdfExtractorOptions> = {},
  answer: () => unknown = completed,
) {
  const calls: Captured[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    assert.equal(typeof init?.body, "string");
    const raw = init!.body as string;
    calls.push({ url: String(url), raw, body: JSON.parse(raw), init: init! });
    return String(url).endsWith("/input_tokens")
      ? json(
          { object: "response.input_tokens", input_tokens: 100 },
          "req_count",
        )
      : json(answer(), "req_extract");
  };
  const options: OpenAIPdfExtractorOptions = {
    apiKey: "pdf-fixture-key",
    model: "gpt-6.1-sol",
    reasoningEffort: "low",
    maxInputTokens: 1000,
    maxOutputTokens: 512,
    fetch: fetcher,
    ...overrides,
  };
  return { calls, options, adapter: createOpenAIPdfExtractor(options) };
}
async function rejected(
  promise: Promise<unknown>,
  code: PdfExtractionError["code"],
): Promise<PdfExtractionError> {
  let caught: unknown;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  assert.ok(
    caught instanceof PdfExtractionError,
    `expected PdfExtractionError(${code})`,
  );
  assert.equal(caught.code, code);
  assert.equal(caught.message, code);
  return caught;
}

test("PDF count and extraction serialize the same input, preserve JSON receipts and actual accounting", async () => {
  const h = harness(),
    pdf = input(),
    reservations: PdfAttemptReservation[] = [];
  const signal = freshSignal();
  const receipt = await h.adapter.count(pdf, {
    signal,
    onAttempt: (item) => {
      reservations.push(item);
    },
  });
  const answer = await h.adapter.extract(
    pdf,
    JSON.parse(JSON.stringify(receipt)),
    {
      signal,
      onAttempt: (item) => {
        reservations.push(item);
      },
    },
  );
  assert.equal(h.calls.length, 2);
  const [count, generation] = h.calls;
  assert.equal(count.url, "https://api.openai.com/v1/responses/input_tokens");
  assert.equal(generation.url, "https://api.openai.com/v1/responses");
  assert.equal(count.init.redirect, "error");
  assert.equal(generation.init.redirect, "error");
  assert.equal(count.body.model, "gpt-6.1-sol");
  assert.deepEqual(count.body.reasoning, { effort: "low" });
  assert.equal(count.body.truncation, "disabled");
  assert.equal("store" in count.body, false);
  assert.equal("max_output_tokens" in count.body, false);
  assert.equal("tools" in count.body, false);
  assert.equal("previous_response_id" in count.body, false);
  const file = count.body.input[0].content[0];
  assert.equal(file.type, "input_file");
  assert.equal(file.filename, "document.pdf");
  assert.equal(file.detail, "high");
  assert.deepEqual(
    Buffer.from(file.file_data.split(",")[1], "base64"),
    pdf.bytes,
  );
  assert.equal("file_url" in file, false);
  assert.equal("file_id" in file, false);
  assert.equal(count.body.text.format.type, "json_schema");
  assert.equal(count.body.text.format.strict, true);
  assert.equal(count.body.text.format.schema.additionalProperties, false);
  assert.match(count.body.instructions, /Do not summarize, translate/);
  assert.match(count.body.instructions, /untrusted data/);
  const { store, max_output_tokens, ...sameInput } = generation.body;
  assert.equal(store, false);
  assert.equal(max_output_tokens, 512);
  assert.deepEqual(sameInput, count.body);
  assert.deepEqual(
    reservations.map((x) => [
      x.phase,
      x.inputTokens,
      x.maxOutputTokens,
      x.maxTotalTokens,
    ]),
    [
      ["count", null, 0, null],
      ["extract", 100, 512, 612],
    ],
  );
  assert.equal(reservations[0].requestHash, hash(count.raw));
  assert.equal(reservations[1].requestHash, hash(generation.raw));
  assert.equal(reservations[1].requestBytes, Buffer.byteLength(generation.raw));
  assert.equal(receipt.requestHash, hash(count.raw));
  assert.equal(receipt.requestId, "req_count");
  assert.equal(answer.kind, "candidate");
  assert.deepEqual(answer.pages, document().pages);
  assert.equal("approved" in answer, false);
  assert.equal("qualityPassed" in answer, false);
  assert.equal(answer.responseId, "resp_fixture");
  assert.equal(answer.observedModel, "gpt-6.1-sol");
  assert.deepEqual(answer.accounting.usage, {
    inputTokens: 100,
    outputTokens: 12,
    totalTokens: 112,
    cachedInputTokens: 8,
    cacheWriteTokens: 4,
    reasoningTokens: 5,
  });
  assert.equal(answer.accounting.attempted, true);
  assert.equal(answer.accounting.requestId, "req_extract");
  assert.equal(answer.extractionKey, receipt.extractionKey);
  assert.equal(answer.countRequestHash, receipt.requestHash);
  assert.equal(getEventListeners(signal, "abort").length, 0);
});

test("profiles separate semantic processing from operational caps and receipts survive a recreated adapter", async () => {
  const h = harness(),
    pdf = input(),
    receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  const other = harness({
    maxInputTokens: 500,
    maxOutputTokens: 256,
    countTimeoutMs: 1000,
    apiKey: "different-fixture-key",
  });
  assert.equal(h.adapter.profile.id, other.adapter.profile.id);
  await other.adapter.extract(pdf, JSON.parse(JSON.stringify(receipt)), {
    signal: freshSignal(),
  });
  assert.equal(other.calls.length, 1);
  assert.equal(other.calls[0].body.max_output_tokens, 256);
  assert.throws(() => {
    (h.adapter.profile as any).model = "changed";
  }, TypeError);
  for (const changed of [
    { model: "gpt-6.1-terra" },
    { detail: "low" as const },
    { reasoningEffort: "medium" as const },
  ]) {
    const alternate = harness(changed);
    assert.notEqual(alternate.adapter.profile.id, h.adapter.profile.id);
    await rejected(
      alternate.adapter.extract(pdf, receipt, { signal: freshSignal() }),
      "invalid-receipt",
    );
    assert.equal(alternate.calls.length, 0);
  }
});

test("local PDF validation rejects invalid identity, formats, pages and shared buffers before admission", async () => {
  const h = harness(),
    pdf = input();
  let attempts = 0;
  const shared = new Uint8Array(new SharedArrayBuffer(pdf.bytes.length));
  shared.set(pdf.bytes);
  const html = Buffer.from("<html>not a PDF</html>");
  const maskedHeader = Buffer.from(pdf.bytes);
  for (let i = 0; i < 8; i++) maskedHeader[i] |= 0x80;
  for (const invalid of [
    { ...pdf, sha256: "0".repeat(64) },
    { ...pdf, sha256: "x" },
    { ...pdf, bytes: html, sha256: hash(html) },
    { ...pdf, pageCount: 0 },
    { ...pdf, pageCount: 21 },
    { ...pdf, pageCount: 1.5 },
    { ...pdf, bytes: shared },
    { ...pdf, bytes: maskedHeader, sha256: hash(maskedHeader) },
  ])
    await rejected(
      h.adapter.count(invalid, {
        signal: freshSignal(),
        onAttempt: () => {
          attempts++;
        },
      }),
      "invalid-input",
    );
  await rejected(
    harness({ maxPdfBytes: 8 }).adapter.count(pdf, { signal: freshSignal() }),
    "request-too-large",
  );
  assert.equal(h.calls.length, 0);
  assert.equal(attempts, 0);
});

test("serialized request budget includes the generation suffix before spending the count request", async () => {
  const h = harness(),
    pdf = input();
  await h.adapter.count(pdf, { signal: freshSignal() });
  const bounded = harness({
    maxRequestBytes: Buffer.byteLength(h.calls[0].raw),
  });
  await rejected(
    bounded.adapter.count(pdf, { signal: freshSignal() }),
    "request-too-large",
  );
  assert.equal(bounded.calls.length, 0);
});

test("explicit token configuration and transport limits fail closed without any HTTP", () => {
  const h = harness();
  for (const invalid of [
    { maxInputTokens: undefined },
    { maxOutputTokens: undefined },
    { maxInputTokens: 0 },
    { maxOutputTokens: 32769 },
    { apiKey: "key\nvalue" },
    { model: "https://other.example/model" },
    { reasoningEffort: undefined },
    { reasoningEffort: "none" },
    { reasoningEffort: "minimal" },
    { detail: null },
    { fetch: null },
    { countTimeoutMs: 15001 },
    { maxPdfBytes: null },
    { maxPages: 21 },
  ])
    assert.throws(
      () => createOpenAIPdfExtractor({ ...h.options, ...invalid } as any),
      { code: "invalid-configuration" },
    );
  assert.equal(h.calls.length, 0);
});

test("an explicit null reasoning profile omits reasoning and preserves the observed snapshot alias", async () => {
  const value = completed();
  value.model = "gpt-4o-2024-08-06";
  const h = harness({ model: "gpt-4o", reasoningEffort: null }, () => value),
    pdf = input();
  const receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  const result = await h.adapter.extract(pdf, receipt, {
    signal: freshSignal(),
  });
  assert.equal("reasoning" in h.calls[0].body, false);
  assert.equal("reasoning" in h.calls[1].body, false);
  assert.equal(result.profile.model, "gpt-4o");
  assert.equal(result.observedModel, value.model);
});

test("count receipt rejects corruption and another document/page contract before generation", async () => {
  const h = harness(),
    pdf = input(),
    receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  for (const change of [
    { version: 2 },
    { rawSha256: "0".repeat(64) },
    { pageCount: 2 },
    { profileId: "0".repeat(64) },
    { requestHash: "0".repeat(64) },
    { inputTokens: 1 },
    { receiptHash: "0".repeat(64) },
    { extra: true },
    { requestId: "unbounded header data" },
    { inputTokens: "100" },
  ])
    await rejected(
      h.adapter.extract(pdf, { ...receipt, ...change } as PdfCountReceipt, {
        signal: freshSignal(),
      }),
      "invalid-receipt",
    );
  await rejected(
    h.adapter.extract(input(1, "different content"), receipt, {
      signal: freshSignal(),
    }),
    "invalid-receipt",
  );
  await rejected(
    h.adapter.extract({ ...pdf, pageCount: 2 }, receipt, {
      signal: freshSignal(),
    }),
    "invalid-receipt",
  );
  assert.equal(h.calls.length, 1);
});

test("a confirmed count above budget remains inspectable but never sends a generation", async () => {
  let calls = 0,
    admitted = 0;
  const h = harness({
    maxInputTokens: 99,
    fetch: async () => {
      calls++;
      return json({ object: "response.input_tokens", input_tokens: 100 });
    },
  });
  const pdf = input(),
    receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  assert.equal(receipt.inputTokens, 100);
  await rejected(
    h.adapter.extract(pdf, receipt, {
      signal: freshSignal(),
      onAttempt: () => {
        admitted++;
      },
    }),
    "input-token-budget",
  );
  assert.equal(calls, 1);
  assert.equal(admitted, 0);
});

test("asynchronous durable admission completes before HTTP and snapshots caller bytes", async () => {
  const h = harness(),
    pdf = input(),
    original = Buffer.from(pdf.bytes),
    gate = deferred<void>(),
    entered = deferred<void>();
  let callbackCount = 0,
    localSignal: AbortSignal | undefined;
  const pending = h.adapter.count(pdf, {
    signal: freshSignal(),
    async onAttempt(_, signal) {
      callbackCount++;
      localSignal = signal;
      entered.resolve();
      await gate.promise;
    },
  });
  await entered.promise;
  assert.equal(h.calls.length, 0);
  pdf.bytes.fill(0);
  gate.resolve();
  const receipt = await pending;
  assert.equal(callbackCount, 1);
  assert.equal(receipt.rawSha256, hash(original));
  assert.deepEqual(
    Buffer.from(
      h.calls[0].body.input[0].content[0].file_data.split(",")[1],
      "base64",
    ),
    original,
  );
  assert.equal(localSignal?.aborted, true);
});

test("synchronous and asynchronous admission errors are preserved without HTTP", async () => {
  for (const asyncFailure of [false, true]) {
    const h = harness(),
      reason = new Error("durable reservation rejected");
    const onAttempt = asyncFailure
      ? async () => {
          throw reason;
        }
      : () => {
          throw reason;
        };
    await assert.rejects(
      h.adapter.count(input(), { signal: freshSignal(), onAttempt }),
      (error) => error === reason,
    );
    assert.equal(h.calls.length, 0);
  }
});

test("abort and deadline cover ignored asynchronous admission, with no late HTTP or attempted count", async (t) => {
  for (const phase of ["count", "extract"] as const)
    for (const cancellation of ["abort", "timeout"] as const)
      await t.test(`${phase}/${cancellation}`, async () => {
        const h = harness({ countTimeoutMs: 30, extractionTimeoutMs: 30 }),
          pdf = input();
        const receipt =
          phase === "extract"
            ? await h.adapter.count(pdf, { signal: freshSignal() })
            : undefined;
        const before = h.calls.length,
          gate = deferred<void>(),
          entered = deferred<void>(),
          controller = new AbortController();
        let reservations = 0,
          localSignal: AbortSignal | undefined;
        const call = {
          signal: controller.signal,
          onAttempt: async (_: PdfAttemptReservation, signal: AbortSignal) => {
            reservations++;
            localSignal = signal;
            entered.resolve();
            await gate.promise;
          },
        };
        const pending =
          phase === "count"
            ? h.adapter.count(pdf, call)
            : h.adapter.extract(pdf, receipt!, call);
        await entered.promise;
        if (cancellation === "abort") controller.abort();
        const error = await rejected(
          pending,
          cancellation === "abort" ? "cancelled" : "request-timeout",
        );
        assert.equal(error.accounting?.attempted, false);
        assert.equal(error.accounting?.phase, phase);
        assert.equal(error.accounting?.usage, null);
        assert.equal(localSignal?.aborted, true);
        gate.resolve();
        await turn();
        assert.equal(h.calls.length, before);
        assert.equal(reservations, 1);
        assert.equal(getEventListeners(controller.signal, "abort").length, 0);
      });
});

test("late fetch responses are cancelled after abort or timeout, without retries", async (t) => {
  for (const cancellation of ["abort", "timeout"] as const)
    await t.test(cancellation, async () => {
      const late = deferred<Response>(),
        entered = deferred<void>();
      let calls = 0,
        cancelled = 0;
      const h = harness({
        countTimeoutMs: 25,
        fetch: async () => {
          calls++;
          entered.resolve();
          return late.promise;
        },
      });
      const controller = new AbortController(),
        pending = h.adapter.count(input(), { signal: controller.signal });
      await entered.promise;
      if (cancellation === "abort") controller.abort();
      const error = await rejected(
        pending,
        cancellation === "abort" ? "cancelled" : "request-timeout",
      );
      assert.equal(error.accounting?.attempted, true);
      assert.equal(error.accounting?.usage, null);
      late.resolve(
        new Response(
          new ReadableStream({
            cancel() {
              cancelled++;
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      );
      await turn();
      assert.equal(cancelled, 1);
      assert.equal(calls, 1);
      assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    });
});

test("deadline and caller cancellation include a stalled response body and release its reader", async (t) => {
  for (const cancellation of ["abort", "timeout"] as const)
    await t.test(cancellation, async () => {
      let cancelled = 0;
      const reading = deferred<void>();
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('{"object":'));
          },
          pull() {
            reading.resolve();
          },
          cancel() {
            cancelled++;
          },
        }),
        {
          headers: {
            "content-type": "application/json",
            "x-request-id": "req_stalled",
          },
        },
      );
      const h = harness({ countTimeoutMs: 25, fetch: async () => response }),
        controller = new AbortController();
      const pending = h.adapter.count(input(), { signal: controller.signal });
      await reading.promise;
      if (cancellation === "abort") controller.abort();
      const error = await rejected(
        pending,
        cancellation === "abort" ? "cancelled" : "request-timeout",
      );
      await turn();
      assert.equal(cancelled, 1);
      assert.equal(response.body!.locked, false);
      assert.equal(error.accounting?.attempted, true);
      assert.equal(error.accounting?.requestId, "req_stalled");
      assert.equal(error.accounting?.usage, null);
      assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    });
});

test("an immediately resolving endless stream cannot starve the deadline", async () => {
  let cancelled = 0;
  const h = harness({
    countTimeoutMs: 15,
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(controller) {
            controller.enqueue(new Uint8Array());
          },
          cancel() {
            cancelled++;
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  });
  await rejected(
    h.adapter.count(input(), { signal: freshSignal() }),
    "request-timeout",
  );
  assert.equal(cancelled, 1);
});

test("pre-aborted calls neither admit nor send HTTP", async () => {
  const h = harness(),
    controller = new AbortController();
  controller.abort();
  let attempts = 0;
  await rejected(
    h.adapter.count(input(), {
      signal: controller.signal,
      onAttempt: () => {
        attempts++;
      },
    }),
    "cancelled",
  );
  assert.equal(h.calls.length, 0);
  assert.equal(attempts, 0);
});

test("provider HTTP errors remain safe and close unread bodies with unknown usage", async (t) => {
  for (const status of [429, 400, 500])
    await t.test(String(status), async () => {
      let cancelled = 0,
        calls = 0;
      const h = harness({
        fetch: async () => {
          calls++;
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode("SENSITIVE_UPSTREAM_DETAILS"),
                );
              },
              cancel() {
                cancelled++;
              },
            }),
            {
              status,
              headers: {
                "content-type": "application/json",
                "x-request-id": "req_error",
              },
            },
          );
        },
      });
      const error = await rejected(
        h.adapter.count(input(), { signal: freshSignal() }),
        status === 429 ? "rate-limited" : "provider-unavailable",
      );
      await turn();
      assert.equal(cancelled, 1);
      assert.equal(calls, 1);
      assert.equal(error.accounting?.usage, null);
      assert.equal(error.accounting?.attempted, true);
      assert.doesNotMatch(
        JSON.stringify(error),
        /SENSITIVE_UPSTREAM_DETAILS|pdf-fixture-key/,
      );
      assert.equal(error.cause, undefined);
    });
});

test("content type, announced and streamed size, UTF-8 and JSON are checked", async (t) => {
  const examples: [string, () => Response][] = [
    [
      "type",
      () => new Response("{}", { headers: { "content-type": "text/html" } }),
    ],
    [
      "announced-size",
      () =>
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": "9999",
          },
        }),
    ],
    [
      "bad-length",
      () =>
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": "-1",
          },
        }),
    ],
    [
      "streamed-size",
      () =>
        new Response(" ".repeat(1025), {
          headers: { "content-type": "application/json" },
        }),
    ],
    [
      "utf8",
      () =>
        new Response(new Uint8Array([0xc0, 0x80]), {
          headers: { "content-type": "application/json" },
        }),
    ],
    [
      "json",
      () =>
        new Response("{ broken", {
          headers: { "content-type": "application/json" },
        }),
    ],
    [
      "no-body",
      () =>
        new Response(null, { headers: { "content-type": "application/json" } }),
    ],
  ];
  for (const [name, response] of examples)
    await t.test(name, async () => {
      let calls = 0;
      const h = harness({
        maxResponseBytes: 1024,
        fetch: async () => {
          calls++;
          return response();
        },
      });
      await rejected(
        h.adapter.count(input(), { signal: freshSignal() }),
        "invalid-response",
      );
      assert.equal(calls, 1);
    });
});

test("count validates response identity and integer token values; absent request ID remains unknown", async () => {
  for (const body of [
    null,
    {},
    { object: "response", input_tokens: 10 },
    { object: "response.input_tokens", input_tokens: "10" },
    { object: "response.input_tokens", input_tokens: -1 },
    { object: "response.input_tokens", input_tokens: 1.5 },
  ]) {
    const h = harness({ fetch: async () => json(body) });
    await rejected(
      h.adapter.count(input(), { signal: freshSignal() }),
      "invalid-response",
    );
  }
  const h = harness({
    fetch: async () =>
      Response.json({ object: "response.input_tokens", input_tokens: 100 }),
  });
  const receipt = await h.adapter.count(input(), { signal: freshSignal() });
  assert.equal(receipt.requestId, null);
});

test("strict candidate validation rejects missing, duplicate or out-of-order pages", async () => {
  let doc: any = document();
  const h = harness({}, () => completed(doc)),
    pdf = input(2);
  const receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  for (const pages of [
    [],
    [document().pages[0]],
    [document().pages[0], document().pages[0]],
    [{ ...document().pages[0], page: 2 }, document().pages[0]],
  ]) {
    doc = { pages };
    await rejected(
      h.adapter.extract(pdf, receipt, { signal: freshSignal() }),
      "invalid-response",
    );
  }
  doc = {
    pages: [document().pages[0], { page: 2, blocks: [], unresolved: [] }],
  };
  const result = await h.adapter.extract(pdf, receipt, {
    signal: freshSignal(),
  });
  assert.equal(result.pages.length, 2);
});

test("table validation checks merged coverage, holes, overlaps, spans and headers", async (t) => {
  const mutations: [string, (table: any) => void][] = [
    [
      "overlap",
      (table) => {
        table.cells[0].rowSpan = 2;
      },
    ],
    [
      "hole",
      (table) => {
        table.cells.pop();
      },
    ],
    [
      "out-of-bounds",
      (table) => {
        table.cells[0].columnSpan = 3;
      },
    ],
    [
      "negative-coordinate",
      (table) => {
        table.cells[0].row = -1;
      },
    ],
    [
      "fractional-span",
      (table) => {
        table.cells[0].rowSpan = 1.5;
      },
    ],
    [
      "zero-span",
      (table) => {
        table.cells[0].rowSpan = 0;
      },
    ],
    [
      "empty-dimension",
      (table) => {
        table.rows = 0;
      },
    ],
    [
      "unbounded-grid",
      (table) => {
        table.rows = 1000;
        table.columns = 100;
      },
    ],
    [
      "duplicate-header",
      (table) => {
        table.headerRows = [0, 0];
      },
    ],
    [
      "bad-header",
      (table) => {
        table.headerColumns = [2];
      },
    ],
    [
      "extra-cell-field",
      (table) => {
        table.cells[0].sourceUrl = "https://untrusted.example";
      },
    ],
  ];
  for (const [name, mutate] of mutations)
    await t.test(name, async () => {
      const doc = document();
      mutate(doc.pages[0].blocks[1]);
      const h = harness({}, () => completed(doc)),
        pdf = input(),
        receipt = await h.adapter.count(pdf, { signal: freshSignal() });
      const error = await rejected(
        h.adapter.extract(pdf, receipt, { signal: freshSignal() }),
        "invalid-response",
      );
      assert.equal(error.accounting?.usage?.reasoningTokens, 5);
      assert.equal(h.calls.length, 2);
    });
});

test("text and issue validation preserve uncertainty without inventing publication approval", async () => {
  const invalid: any[] = [
    { ...document(), sourceUrl: "https://invented.example" },
    {
      pages: [
        { page: 1, blocks: [{ kind: "html", text: "body" }], unresolved: [] },
      ],
    },
    {
      pages: [
        { page: 1, blocks: [{ kind: "paragraph", text: " " }], unresolved: [] },
      ],
    },
    {
      pages: [
        {
          page: 1,
          blocks: [{ kind: "paragraph", text: "\ud800" }],
          unresolved: [],
        },
      ],
    },
    {
      pages: [
        {
          page: 1,
          blocks: [{ kind: "paragraph", text: "a".repeat(100001) }],
          unresolved: [],
        },
      ],
    },
    {
      pages: [
        {
          page: 1,
          blocks: [],
          unresolved: [{ kind: "approved", description: "fine" }],
        },
      ],
    },
  ];
  let doc: unknown = null;
  const h = harness({}, () => completed(doc)),
    pdf = input(),
    receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  for (doc of invalid)
    await rejected(
      h.adapter.extract(pdf, receipt, { signal: freshSignal() }),
      "invalid-response",
    );
  doc = {
    pages: [
      {
        page: 1,
        blocks: [],
        unresolved: [
          {
            kind: "unreadable",
            description: "Nečitelný údaj v červeném rámečku.",
          },
        ],
      },
    ],
  };
  const result = await h.adapter.extract(pdf, receipt, {
    signal: freshSignal(),
  });
  assert.equal(result.kind, "candidate");
  assert.equal(result.pages[0].unresolved[0].kind, "unreadable");
});

test("incomplete and refused generations retain confirmed usage without a retry", async (t) => {
  for (const refusal of [false, true])
    await t.test(refusal ? "refused" : "incomplete", async () => {
      const value = completed();
      if (refusal)
        value.output[1].content = [{ type: "refusal", refusal: "No" }];
      else {
        value.status = "incomplete";
        value.incomplete_details = { reason: "max_output_tokens" };
      }
      const h = harness({}, () => value),
        pdf = input(),
        receipt = await h.adapter.count(pdf, { signal: freshSignal() });
      const error = await rejected(
        h.adapter.extract(pdf, receipt, { signal: freshSignal() }),
        refusal ? "refused" : "response-incomplete",
      );
      assert.equal(error.accounting?.usage?.reasoningTokens, 5);
      assert.equal(error.accounting?.usage?.totalTokens, 112);
      assert.equal(error.accounting?.requestId, "req_extract");
      assert.equal(h.calls.length, 2);
    });
});

test("missing usage is unknown, malformed usage is rejected, and reasoning is never added twice", async () => {
  let value = completed();
  delete value.usage;
  const h = harness({}, () => value),
    pdf = input(),
    receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  const unknown = await h.adapter.extract(pdf, receipt, {
    signal: freshSignal(),
  });
  assert.equal(unknown.accounting.usage, null);
  for (const mutate of [
    (u: any) => {
      u.total_tokens++;
    },
    (u: any) => {
      u.input_tokens = -1;
    },
    (u: any) => {
      u.output_tokens_details.reasoning_tokens = 13;
    },
    (u: any) => {
      u.input_tokens_details = { cached_tokens: 80, cache_write_tokens: 21 };
    },
    (u: any) => {
      u.output_tokens_details = "not an object";
    },
  ]) {
    value = completed();
    mutate(value.usage);
    const error = await rejected(
      h.adapter.extract(pdf, receipt, { signal: freshSignal() }),
      "invalid-response",
    );
    assert.equal(error.accounting?.usage, null);
  }
  value = completed();
  delete value.usage.input_tokens_details;
  delete value.usage.output_tokens_details;
  const partial = await h.adapter.extract(pdf, receipt, {
    signal: freshSignal(),
  });
  assert.deepEqual(partial.accounting.usage, {
    inputTokens: 100,
    outputTokens: 12,
    totalTokens: 112,
  });
});

test("multiple outputs, tools, partial message states and invalid envelopes never publish a candidate", async () => {
  let value = completed();
  const h = harness({}, () => value),
    pdf = input(),
    receipt = await h.adapter.count(pdf, { signal: freshSignal() });
  const mutations = [
    (v: any) => {
      v.output[1].content.push(v.output[1].content[0]);
    },
    (v: any) => {
      v.output.push({ type: "function_call", name: "fetch_url" });
    },
    (v: any) => {
      v.output[1].status = "in_progress";
    },
    (v: any) => {
      v.incomplete_details = { reason: "max_output_tokens" };
    },
    (v: any) => {
      v.error = { message: "upstream internal text" };
    },
    (v: any) => {
      v.output[1].content[0].text = "not json";
    },
    (v: any) => {
      v.model = "bad model";
    },
    (v: any) => {
      v.object = "not-response";
    },
  ];
  for (const mutate of mutations) {
    value = completed();
    mutate(value);
    const error = await rejected(
      h.adapter.extract(pdf, receipt, { signal: freshSignal() }),
      "invalid-response",
    );
    assert.equal(error.accounting?.usage?.totalTokens, 112);
    assert.doesNotMatch(error.message, /upstream internal/);
  }
});

test("call options are captured once before asynchronous processing", async () => {
  const original = new AbortController(),
    replacement = new AbortController(),
    h = harness();
  let signalReads = 0,
    callbackReads = 0,
    originalCalls = 0,
    replacementCalls = 0;
  const first = () => {
      originalCalls++;
    },
    second = () => {
      replacementCalls++;
    };
  const call: PdfCallOptions = {
    get signal() {
      return ++signalReads === 1 ? original.signal : replacement.signal;
    },
    get onAttempt() {
      return ++callbackReads === 1 ? first : second;
    },
  };
  await h.adapter.count(input(), call);
  assert.equal(signalReads, 1);
  assert.equal(callbackReads, 1);
  assert.equal(originalCalls, 1);
  assert.equal(replacementCalls, 0);
  assert.equal(getEventListeners(original.signal, "abort").length, 0);
  assert.equal(getEventListeners(replacement.signal, "abort").length, 0);
});

test("mutated call options cannot move cleanup, cancellation or admission to another signal", async (t) => {
  for (const outcome of [
    "success",
    "admission-error",
    "provider-error",
    "abort",
    "timeout",
  ] as const)
    await t.test(outcome, async () => {
      const original = new AbortController(),
        replacement = new AbortController(),
        gate = deferred<void>(),
        entered = deferred<void>();
      const reason = new Error("original admission failed");
      let httpCalls = 0,
        originalCallbacks = 0,
        replacementCallbacks = 0;
      const h = harness({
        countTimeoutMs: 40,
        fetch: async () => {
          httpCalls++;
          return outcome === "provider-error"
            ? new Response("{}", {
                status: 500,
                headers: { "content-type": "application/json" },
              })
            : json({ object: "response.input_tokens", input_tokens: 100 });
        },
      });
      const call: PdfCallOptions = {
        signal: original.signal,
        onAttempt: async () => {
          originalCallbacks++;
          entered.resolve();
          await gate.promise;
        },
      };
      const pending = h.adapter.count(input(), call);
      await entered.promise;
      call.signal = replacement.signal;
      call.onAttempt = () => {
        replacementCallbacks++;
      };
      if (outcome === "admission-error" || outcome === "provider-error")
        replacement.abort();
      if (outcome === "abort") original.abort();
      else if (outcome === "admission-error") gate.reject(reason);
      else if (outcome !== "timeout") gate.resolve();
      if (outcome === "success") assert.equal((await pending).inputTokens, 100);
      else if (outcome === "admission-error")
        await assert.rejects(pending, (error) => error === reason);
      else {
        const error = await rejected(
          pending,
          outcome === "provider-error"
            ? "provider-unavailable"
            : outcome === "abort"
              ? "cancelled"
              : "request-timeout",
        );
        assert.equal(error.accounting?.attempted, outcome === "provider-error");
      }
      gate.resolve();
      await turn();
      assert.equal(originalCallbacks, 1);
      assert.equal(replacementCallbacks, 0);
      assert.equal(
        httpCalls,
        outcome === "success" || outcome === "provider-error" ? 1 : 0,
      );
      assert.equal(getEventListeners(original.signal, "abort").length, 0);
      assert.equal(getEventListeners(replacement.signal, "abort").length, 0);
    });
});

test("confirmed generation input usage obeys both the cap and immutable count reservation", async (t) => {
  for (const scenario of [
    {
      name: "over configured cap",
      cap: 100,
      actual: 101,
      mutateTo: undefined,
      reject: true,
    },
    {
      name: "over reservation below cap",
      cap: 1000,
      actual: 101,
      mutateTo: undefined,
      reject: true,
    },
    {
      name: "mutable receipt cannot raise reservation during HTTP",
      cap: 1000,
      actual: 101,
      mutateTo: 1000,
      reject: true,
    },
    {
      name: "mutable receipt cannot lower original reservation during HTTP",
      cap: 1000,
      actual: 100,
      mutateTo: 1,
      reject: false,
    },
  ])
    await t.test(scenario.name, async () => {
      const response = deferred<Response>(),
        entered = deferred<void>();
      let httpCalls = 0;
      const h = harness({
        maxInputTokens: scenario.cap,
        fetch: async (url) => {
          httpCalls++;
          if (String(url).endsWith("/input_tokens"))
            return json({ object: "response.input_tokens", input_tokens: 100 });
          entered.resolve();
          return response.promise;
        },
      });
      const pdf = input();
      const receipt = JSON.parse(
        JSON.stringify(await h.adapter.count(pdf, { signal: freshSignal() })),
      ) as { -readonly [K in keyof PdfCountReceipt]: PdfCountReceipt[K] };
      let reserved: PdfAttemptReservation | undefined;
      const pending = h.adapter.extract(pdf, receipt, {
        signal: freshSignal(),
        onAttempt: (value) => {
          reserved = value;
        },
      });
      await entered.promise;
      if (scenario.mutateTo !== undefined)
        receipt.inputTokens = scenario.mutateTo;
      const value = completed();
      value.usage = {
        input_tokens: scenario.actual,
        output_tokens: 1,
        total_tokens: scenario.actual + 1,
      };
      response.resolve(json(value, "req_actual_input"));
      const accounting = scenario.reject
        ? (await rejected(pending, "input-token-budget")).accounting!
        : (await pending).accounting;
      assert.equal(accounting.attempted, true);
      assert.equal(accounting.requestId, "req_actual_input");
      assert.deepEqual(accounting.usage, {
        inputTokens: scenario.actual,
        outputTokens: 1,
        totalTokens: scenario.actual + 1,
      });
      assert.equal(reserved?.inputTokens, 100);
      assert.equal(reserved?.maxTotalTokens, 612);
      assert.equal(
        httpCalls,
        2,
        "already incurred generation is retained; no retry or refund is invented",
      );
    });
});
