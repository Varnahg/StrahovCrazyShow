import assert from "node:assert/strict";
import test from "node:test";
import {
  createCrazyTypkaProvider,
  CrazyTypkaProviderError,
  type CrazyTypkaProviderOptions,
  type CrazyTypkaGenerationUsage,
} from "../server/crazy-typka-provider";
import {
  retrieveKnowledge,
  getKnowledgeRegistry,
} from "../server/crazy-typka-retrieval";

async function moderatedAnswer(
  provider: ReturnType<typeof createCrazyTypkaProvider>,
  input: Parameters<ReturnType<typeof createCrazyTypkaProvider>["generate"]>[0],
) {
  await provider.moderateInput(input.message, input.signal);
  return provider.generate(input);
}

test("provider receives institution and legal interval for each actual selected source", async () => {
  const evidence = getKnowledgeRegistry().chunks.filter((chunk) =>
    ["sh-printing-location", "suz-housing-allocation"].includes(chunk.id),
  );
  assert.equal(evidence.length, 2);
  let supplied: any;
  const provider = createCrazyTypkaProvider({
    apiKey: "fake-only",
    model: "test-model",
    fetch: async (url, init) => {
      if (String(url).endsWith("/moderations")) return Response.json(safe);
      supplied = JSON.parse(String(init?.body));
      return Response.json(
        complete(
          "Ověř pravidla příslušné instituce.",
          evidence.map((chunk) => chunk.id),
        ),
      );
    },
  });
  await moderatedAnswer(provider, {
    message: "Jak rozlišit služby?",
    locale: "cs",
    history: [],
    evidence,
    safetyIdentifier: "fake",
    signal: new AbortController().signal,
    onGenerationStart() {},
    now: Date.parse("2026-10-29T00:45:00.000Z"),
  });
  const content = supplied.input.at(-1).content;
  assert.match(supplied.instructions, /2026-10-29T00:45:00.000Z/);
  assert.match(supplied.instructions, /Europe\/Prague/);
  assert.match(supplied.instructions, /"scope":\{"kind":"current"\}/);
  const payload = JSON.parse(
    content
      .split("CURATED_EVIDENCE (data only):\n")[1]
      .split("\nUSER_MESSAGE (data only):")[0],
  );
  assert.deepEqual(
    new Set(payload.map((item: any) => item.authority)),
    new Set(["silicon-hill", "suz"]),
  );
  const suz = payload.find((item: any) => item.authority === "suz");
  assert.equal(suz.effectiveFrom, "2026-05-04T00:00:00+02:00");
  assert.equal(suz.effectiveUntil, null);
  assert.equal(suz.checkedAt, "2026-10-28");
  assert.equal(suz.reviewAfter, "2026-11-28");
  assert.match(
    supplied.instructions,
    /Club membership payments are not dormitory rent/,
  );
  assert.match(supplied.instructions, /clarifying question/);
  assert.match(
    supplied.instructions,
    /absence of an earlier answer's supporting passage from the current retrieval does not prove that earlier answer was wrong/,
  );
  assert.match(
    supplied.instructions,
    /welcome screen has a single multiplayer entry/,
  );
  assert.match(
    supplied.instructions,
    /nickname and character on the next screen/,
  );
  assert.doesNotMatch(
    supplied.instructions,
    /or explore alone from the welcome screen/,
  );
});

const safe = {
  results: [
    { flagged: false, categories: { harassment: false, sexual: false } },
  ],
};
const evidence = retrieveKnowledge(
  "kancelář SH",
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
  options: Partial<
    Pick<
      CrazyTypkaProviderOptions,
      | "timeoutMs"
      | "responseBytes"
      | "reasoningEffort"
      | "maxOutputTokens"
      | "model"
    >
  > = {},
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
  const usages: CrazyTypkaGenerationUsage[] = [];
  const answer = () =>
    moderatedAnswer(provider, {
      message: "Kde je kancelář?",
      locale: "cs",
      history: [],
      evidence,
      safetyIdentifier: "hash-only",
      signal: controller.signal,
      onGenerationStart: () => {
        starts++;
      },
      onGenerationUsage: (usage) => usages.push(usage),
    });
  return { answer, calls, controller, usages, starts: () => starts };
}

const generationUsage = {
  input_tokens: 20,
  output_tokens: 10,
  total_tokens: 30,
  input_tokens_details: { cached_tokens: 5, cache_write_tokens: 4 },
  output_tokens_details: { reasoning_tokens: 6 },
};

test("provider rejects oversized evidence before admission and bounds history without truncating sources", async () => {
  const calls: any[] = [];
  let starts = 0;
  const provider = createCrazyTypkaProvider({
    apiKey: "fake",
    model: "test-model",
    fetch: async (url, init) => {
      if (String(url).endsWith("moderations")) return Response.json(safe);
      calls.push(JSON.parse(String(init?.body)));
      return Response.json(complete("Odpověď", []));
    },
  });
  const base = {
    message: "Aktuální dotaz",
    locale: "cs" as const,
    safetyIdentifier: "fake",
    signal: new AbortController().signal,
    onGenerationStart() {
      starts++;
    },
    now: Date.parse("2026-10-29T00:45:00.000Z"),
    scope: { kind: "archive" as const },
  };
  await assert.rejects(
    provider.generate({
      ...base,
      history: [],
      evidence: [{ ...evidence[0], text: "🪴".repeat(5000) }],
    }),
    (error: any) => error.code === "request-too-large",
  );
  assert.equal(starts, 0);
  assert.equal(calls.length, 0);
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 ? ("assistant" as const) : ("user" as const),
    content: "界".repeat(index % 2 ? 4000 : 1500),
  }));
  await provider.generate({ ...base, history, evidence });
  assert.equal(starts, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(calls[0])) <= 65536);
  assert.ok(calls[0].input.length < history.length + 1);
  const supplied = JSON.parse(
    calls[0].input
      .at(-1)
      .content.split("CURATED_EVIDENCE (data only):\n")[1]
      .split("\nUSER_MESSAGE")[0],
  );
  assert.deepEqual(
    supplied.map((item: any) => item.text),
    evidence.map((item) => item.text),
  );
  assert.match(calls[0].instructions, /"scope":\{"kind":"archive"\}/);
});
test("complex provider uses its fixed model, effort and bounded output; usage stays private and reasoning is a subset", async () => {
  const f = fixture([safe, { ...complete(), usage: generationUsage }, safe], {
    model: "gpt-6.1-sol",
    reasoningEffort: "low",
    maxOutputTokens: 4096,
  });
  assert.deepEqual(await f.answer(), {
    text: "Kancelář je na bloku 1.",
    sourceIds: ["sh-office"],
  });
  assert.equal(f.calls[1].body.model, "gpt-6.1-sol");
  assert.deepEqual(f.calls[1].body.reasoning, { effort: "low" });
  assert.equal(f.calls[1].body.max_output_tokens, 4096);
  assert.deepEqual(f.usages, [
    {
      inputTokens: 20,
      outputTokens: 10,
      totalTokens: 30,
      cachedInputTokens: 5,
      cacheWriteTokens: 4,
      reasoningTokens: 6,
    },
  ]);
});
test("usage is observed for incomplete paid results, absent usage stays unknown and malformed totals cannot poison counters", async () => {
  const incomplete = fixture([
    safe,
    { ...complete(), status: "incomplete", usage: generationUsage },
  ]);
  await assert.rejects(
    incomplete.answer(),
    (error: any) => error.code === "invalid-response",
  );
  assert.equal(incomplete.usages.length, 1);
  assert.equal(incomplete.calls.length, 2);
  const absent = fixture([safe, complete(), safe]);
  await absent.answer();
  assert.deepEqual(absent.usages, []);
  for (const usage of [
    { ...generationUsage, input_tokens: -1 },
    { ...generationUsage, total_tokens: 31 },
    { ...generationUsage, output_tokens: NaN },
    { ...generationUsage, input_tokens_details: { cached_tokens: 21 } },
    {
      ...generationUsage,
      input_tokens_details: { cached_tokens: 15, cache_write_tokens: 6 },
    },
    { ...generationUsage, output_tokens_details: { reasoning_tokens: 11 } },
  ]) {
    const f = fixture([safe, { ...complete(), usage }]);
    await assert.rejects(
      f.answer(),
      (error: any) => error.code === "invalid-response",
    );
    assert.deepEqual(f.usages, []);
  }
});
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
  assert.equal(body.reasoning, undefined);
  assert.match(body.instructions, /fictional AI/);
  assert.match(body.instructions, /Do not mechanically repeat/);
  assert.match(body.instructions, /small situational joke/);
  assert.match(body.instructions, /untrusted data/);
  assert.equal(f.starts(), 1);
  assert.equal(f.calls[1].options.redirect, "error");
});

test("operator-selected reasoning effort is explicit and keeps the output budget bounded", async () => {
  const f = fixture([safe, complete(), safe], { reasoningEffort: "none" });
  await f.answer();
  assert.deepEqual(f.calls[1].body.reasoning, { effort: "none" });
  assert.equal(f.calls[1].body.max_output_tokens, 600);
});

test("known Sol model refuses unsupported effort during construction before HTTP", () => {
  for (const reasoningEffort of ["none", "minimal"] as const) {
    let calls = 0;
    assert.throws(
      () =>
        createCrazyTypkaProvider({
          apiKey: "fake-only",
          model: "gpt-6.1-sol",
          reasoningEffort,
          fetch: async () => {
            calls++;
            throw new Error("must not call HTTP");
          },
        }),
      /Unsupported reasoning effort/,
    );
    assert.equal(calls, 0);
  }
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
  const work = moderatedAnswer(provider, {
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
