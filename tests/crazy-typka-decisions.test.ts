import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import test from "node:test";
import {
  createDecisionRouter,
  DecisionRouterError,
  type DecisionRouterErrorCode,
} from "../server/crazy-typka-decisions";

const signal = () => new AbortController().signal;
type WireAnswer = {
  type: string;
  name: string;
  probability?: number;
  choice?: string;
  confidence?: number;
  probabilities?: { value: string; probability: number }[];
};
function choice(
  name: string,
  selected: string,
  values: readonly string[],
): WireAnswer {
  return {
    type: "choice",
    name,
    choice: selected,
    confidence: 0.95,
    probabilities: values.map((value) => ({
      value,
      probability: value === selected ? 1 : 0,
    })),
  };
}
const complete = () => ({
  model: "gpt-6-luna",
  answers: [
    { type: "predicate", name: "complex_reasoning", probability: 0.95 },
    { type: "predicate", name: "local_sources_required", probability: 0.1 },
    choice("request_scope", "allowed", [
      "allowed",
      "mixed",
      "off_topic",
      "objectifying_people",
      "clarify",
    ]),
    choice("answer_mode", "specific", ["overview", "specific"]),
    { type: "predicate", name: "local_task_allowed", probability: 0.99 },
  ] as WireAnswer[],
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

test("serializes five independent questions with one fixed developer policy and exact moderated USER text", async () => {
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
    admissionProbability: 0.99,
    complexProbability: 0.95,
    localSourcesProbability: 0.1,
    scope: { kind: "allowed", confidence: 0.95 },
    answerMode: { kind: "specific", confidence: 0.95 },
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
  assert.equal(body.input.length, 2);
  assert.equal(body.input[0].role, "developer");
  assert.equal(body.input[1].role, "user");
  assert.equal(
    body.input[1].content,
    text,
    "preserve the exact moderated USER evidence",
  );
  assert.doesNotMatch(body.input[0].content, /Český úkol|drahý model|🐎/);
  assert.equal(body.safety_identifier, "opaque-session-hash");
  assert.deepEqual(
    body.questions.map((q: Record<string, unknown>) => [q.name, q.type]),
    [
      ["complex_reasoning", "predicate"],
      ["local_sources_required", "predicate"],
      ["request_scope", "choice"],
      ["answer_mode", "choice"],
      ["local_task_allowed", "predicate"],
    ],
  );
  for (const question of body.questions) {
    assert.deepEqual(
      Object.keys(question).sort(),
      question.type === "choice"
        ? ["choices", "instructions", "name", "type"]
        : ["instructions", "name", "type"],
    );
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
  assert.match(body.input[0].content, /General homework/);
  assert.match(body.input[0].content, /Missing sources/);
  assert.match(body.input[0].content, /local safety/);
  assert.match(body.questions[2].instructions, /entire current USER request/);
  assert.match(body.questions[4].instructions, /ONLY candidate.text/);
  assert.match(body.questions[4].instructions, /ignore original/);
  assert.match(body.questions[3].instructions, /independently of complexity/);
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
      "admissionProbability",
      "answerMode",
      "complexProbability",
      "localSourcesProbability",
      "scope",
      "usage",
    ]);
  }
});

test("fixed scope/mode choices preserve valid confidence boundaries without admitting locally", async () => {
  for (const kind of [
    "allowed",
    "mixed",
    "off_topic",
    "objectifying_people",
    "clarify",
  ])
    for (const confidence of [0, 0.8, 1]) {
      const body = complete();
      body.answers[2] = {
        ...choice("request_scope", kind, [
          "allowed",
          "mixed",
          "off_topic",
          "objectifying_people",
          "clarify",
        ]),
        confidence,
      };
      body.answers[3] = choice("answer_mode", "overview", [
        "overview",
        "specific",
      ]);
      const result = await fixture(body).router.classify("USER data", {
        signal: signal(),
      });
      assert.deepEqual(result.scope, { kind, confidence });
      assert.deepEqual(result.answerMode, {
        kind: "overview",
        confidence: 0.95,
      });
    }
});

test("binary admission probability is mandatory and independent of multiclass confidence", async () => {
  for (const probability of [0, 0.79, 0.8, 0.95, 1]) {
    const body = complete();
    body.answers[2].confidence = 0.4;
    body.answers[4].probability = probability;
    const result = await fixture(body).router.classify("selected USER task", {
      signal: signal(),
    });
    assert.equal(result.admissionProbability, probability);
    assert.equal(result.scope.confidence, 0.4);
  }
  for (const kind of ["allowed", "off_topic"]) {
    for (const invalid of [
      { type: "predicate", name: "local_task_allowed", probability: -0.1 },
      { type: "predicate", name: "local_task_allowed", probability: 1.1 },
      { type: "predicate", name: "local_task_allowed", probability: NaN },
    ]) {
      const body = complete();
      body.answers[2] = choice("request_scope", kind, [
        "allowed",
        "mixed",
        "off_topic",
        "objectifying_people",
        "clarify",
      ]);
      body.answers[4] = invalid;
      await rejectCode(
        fixture(body).router.classify("data", { signal: signal() }),
        "invalid-response",
      );
    }
  }
});

test("invalid choice labels, confidence, refusal and incomplete probability distributions fail closed", async () => {
  const invalid: Partial<WireAnswer>[] = [
    { choice: "expensive-model" },
    { confidence: -0.1 },
    { confidence: 1.1 },
    { confidence: NaN },
    { confidence: "0.99" as never },
    { type: "refusal" },
    { type: "predicate" },
    { probabilities: [] },
    { probabilities: undefined },
    { probabilities: [{ value: "allowed", probability: 1 }] },
    {
      probabilities: Array.from({ length: 5 }, () => ({
        value: "allowed",
        probability: 0.2,
      })),
    },
    {
      probabilities: [
        "allowed",
        "mixed",
        "off_topic",
        "objectifying_people",
        "unknown",
      ].map((value) => ({ value, probability: 0.2 })),
    },
    {
      probabilities: [
        "allowed",
        "mixed",
        "off_topic",
        "objectifying_people",
        "clarify",
      ].map((value) => ({ value, probability: 0.1 })),
    },
    {
      probabilities: [
        "allowed",
        "mixed",
        "off_topic",
        "objectifying_people",
        "clarify",
      ].map((value) => ({ value, probability: value === "allowed" ? 2 : 0 })),
    },
  ];
  for (const patch of invalid) {
    const body = complete();
    body.answers[2] = { ...body.answers[2], ...patch };
    await rejectCode(
      fixture(body).router.classify("private USER data", { signal: signal() }),
      "invalid-response",
    );
  }
  for (const name of ["answer_mode"]) {
    const body = complete();
    const index = body.answers.findIndex((answer) => answer.name === name);
    body.answers[index] = { type: "refusal", name };
    await rejectCode(
      fixture(body).router.classify("data", { signal: signal() }),
      "invalid-response",
    );
  }
});

function segmentResponse(count: number) {
  return {
    ...complete(),
    answers: Array.from({ length: count }, (_, index) =>
      complete().answers.map((answer) => ({
        ...answer,
        name: `s${index}_${answer.name}`,
      })),
    ).flat(),
  };
}

for (const item of [
  {
    id: "objectifying diagnostic",
    scope: "objectifying_people",
    refuseScope: false,
    refuseAdmission: true,
    expected: "objectifying_people",
  },
  {
    id: "off-topic domain refusal",
    scope: "off_topic",
    refuseScope: false,
    refuseAdmission: true,
    expected: "off_topic",
  },
  {
    id: "clarify domain refusal",
    scope: "clarify",
    refuseScope: false,
    refuseAdmission: true,
    expected: "clarify",
  },
  {
    id: "mixed domain refusal",
    scope: "mixed",
    refuseScope: false,
    refuseAdmission: true,
    expected: "mixed",
  },
  {
    id: "allowed domain refusal",
    scope: "allowed",
    refuseScope: false,
    refuseAdmission: true,
    expected: "clarify",
  },
  {
    id: "scope refusal with .99 predicate",
    scope: "allowed",
    refuseScope: true,
    refuseAdmission: false,
    expected: "clarify",
  },
  {
    id: "both gates refused",
    scope: "allowed",
    refuseScope: true,
    refuseAdmission: true,
    expected: "clarify",
  },
] as const)
  test(`known gate refusal is only denial: ${item.id}`, async () => {
    const body = complete();
    body.answers[2] = item.refuseScope
      ? { type: "refusal", name: "request_scope" }
      : choice("request_scope", item.scope, [
          "allowed",
          "mixed",
          "off_topic",
          "objectifying_people",
          "clarify",
        ]);
    if (item.refuseAdmission)
      body.answers[4] = { type: "refusal", name: "local_task_allowed" };
    if (item.id === "objectifying diagnostic") {
      // Relevant exact HTTP200 shape from diagnose-o16.json, including usage.
      body.answers[0].probability = 0.07;
      body.answers[1] = { type: "refusal", name: "local_sources_required" };
      body.answers[2].confidence = 0.91;
      body.answers[2].probabilities = [
        { value: "allowed", probability: 0.01 },
        { value: "mixed", probability: 0 },
        { value: "off_topic", probability: 0.02 },
        { value: "objectifying_people", probability: 0.93 },
        { value: "clarify", probability: 0.04 },
      ];
      body.answers[3] = { type: "refusal", name: "answer_mode" };
      body.usage = {
        input_tokens: 762,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens: 0,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 762,
      };
    }
    const result = await fixture(body).router.classify(
      "synthetic denied task",
      { signal: signal() },
    );
    assert.equal(result.admissionProbability, 0);
    assert.equal(result.scope.kind, item.expected);
    assert.notEqual(
      result.scope.kind,
      "allowed",
      "a refusal never grants permission",
    );
    assert.equal(
      result.scope.confidence,
      item.id === "objectifying diagnostic"
        ? 0.91
        : item.refuseScope || item.scope === "allowed"
          ? 1
          : 0.95,
    );
    assert.equal(result.complexProbability, 0);
    assert.equal(result.localSourcesProbability, 1);
    assert.deepEqual(result.answerMode, { kind: "specific", confidence: 0 });
    assert.equal(
      result.usage.totalTokens,
      item.id === "objectifying diagnostic" ? 762 : 105,
    );
  });

test("the recorded denied scope plus answer_mode refusal returns local admission and confirmed usage", async () => {
  // Exact relevant shape from decisions-shape-diagnostic.json, without a
  // runtime dependency on the diagnostic artifact or any new API request.
  const body = complete();
  body.answers[0].probability = 0;
  body.answers[1].probability = 0.02;
  body.answers[2] = {
    type: "choice",
    name: "request_scope",
    choice: "off_topic",
    confidence: 0.85,
    probabilities: [
      { value: "allowed", probability: 0.04 },
      { value: "mixed", probability: 0.01 },
      { value: "off_topic", probability: 0.88 },
      { value: "objectifying_people", probability: 0.02 },
      { value: "clarify", probability: 0.05 },
    ],
  };
  body.answers[3] = { type: "refusal", name: "answer_mode" };
  body.answers[4].probability = 0.01;
  body.usage = {
    input_tokens: 865,
    input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
    output_tokens: 0,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: 865,
  };
  const f = fixture(body);
  const result = await f.router.classify("synthetic off-topic task", {
    signal: signal(),
  });
  assert.deepEqual(result, {
    admissionProbability: 0.01,
    scope: { kind: "off_topic", confidence: 0.85 },
    complexProbability: 0,
    localSourcesProbability: 1,
    answerMode: { kind: "specific", confidence: 0 },
    usage: {
      inputTokens: 865,
      outputTokens: 0,
      totalTokens: 865,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
    },
  });
  assert.equal(f.calls.length, 1);
});

test("named routing refusals are harmless only when valid scope cannot directly authorize generation", async () => {
  for (const kind of [
    "off_topic",
    "mixed",
    "objectifying_people",
    "clarify",
    "allowed",
  ])
    for (const index of [0, 1, 3]) {
      const body = complete();
      body.answers[2] = {
        ...choice("request_scope", kind, [
          "allowed",
          "mixed",
          "off_topic",
          "objectifying_people",
          "clarify",
        ]),
        confidence: kind === "allowed" ? 0.799999 : 0.99,
      };
      body.answers[index] = { name: body.answers[index].name, type: "refusal" };
      body.answers[4].probability = kind === "allowed" ? 0.799999 : 0.99;
      body.answers.reverse();
      const result = await fixture(body).router.classify("data", {
        signal: signal(),
      });
      assert.equal(result.scope.kind, kind);
      assert.equal(result.complexProbability, 0);
      assert.equal(result.localSourcesProbability, 1);
      assert.deepEqual(result.answerMode, { kind: "specific", confidence: 0 });
      assert.equal(result.usage.totalTokens, 105);
    }
  for (const confidence of [0.4, 0.8, 1])
    for (const index of [0, 1, 3]) {
      const body = complete();
      body.answers[2].confidence = confidence;
      body.answers[4].probability = 0.95;
      body.answers[index] = { name: body.answers[index].name, type: "refusal" };
      await rejectCode(
        fixture(body).router.classify("allowed task", { signal: signal() }),
        "invalid-response",
      );
    }
});

test("a denied scope cannot hide malformed, missing or duplicate answers", async () => {
  const denied = () => {
    const body = complete();
    body.answers[2] = choice("request_scope", "off_topic", [
      "allowed",
      "mixed",
      "off_topic",
      "objectifying_people",
      "clarify",
    ]);
    body.answers[3] = { name: "answer_mode", type: "refusal" };
    return body;
  };
  const invalid: ReturnType<typeof complete>[] = [];
  let body = denied();
  body.answers[0].probability = -0.1;
  invalid.push(body);
  body = denied();
  body.answers[3] = { ...body.answers[3], confidence: 1 };
  invalid.push(body);
  body = denied();
  body.answers[2] = { name: "request_scope", type: "refusal", confidence: 1 };
  invalid.push(body);
  body = denied();
  body.answers[2].probabilities = [];
  invalid.push(body);
  body = denied();
  body.answers[1] = body.answers[3];
  invalid.push(body);
  body = denied();
  body.answers.pop();
  invalid.push(body);
  body = denied();
  body.usage.total_tokens = 999;
  invalid.push(body);
  body = denied();
  body.answers[4] = {
    type: "refusal",
    name: "local_task_allowed",
    probability: 0,
  };
  invalid.push(body);
  body = denied();
  body.answers[4] = { type: "refusal", name: "local_task_allowed" };
  body.answers[0].probability = -0.1;
  invalid.push(body);
  for (const source of invalid)
    await rejectCode(
      fixture(source).router.classify("denied task", { signal: signal() }),
      "invalid-response",
    );
});

test("mixed segment routing refusals normalize rejected groups but never permit allowed fragments", async () => {
  const body = segmentResponse(2);
  body.answers[7] = {
    ...choice("s1_request_scope", "off_topic", [
      "allowed",
      "mixed",
      "off_topic",
      "objectifying_people",
      "clarify",
    ]),
    confidence: 0.85,
  };
  body.answers[8] = { name: "s1_answer_mode", type: "refusal" };
  const input = {
    text: "exact moderated mixed candidates",
    segmentIds: ["s0", "s1"],
  };
  const result = await fixture(body).router.classifySegments(input, {
    signal: signal(),
  });
  assert.equal(result.segments[0].decision.scope.kind, "allowed");
  assert.equal(result.segments[0].decision.complexProbability, 0.95);
  assert.deepEqual(result.segments[1].decision, {
    admissionProbability: 0.99,
    scope: { kind: "off_topic", confidence: 0.85 },
    complexProbability: 0,
    localSourcesProbability: 1,
    answerMode: { kind: "specific", confidence: 0 },
  });
  assert.equal(result.usage.totalTokens, 105);
  body.answers[3] = { name: "s0_answer_mode", type: "refusal" };
  await rejectCode(
    fixture(body).router.classifySegments(input, { signal: signal() }),
    "invalid-response",
  );
});

test("a mixed request evaluates up to six fixed selectors in one HTTP with exact moderated input", async () => {
  const body = segmentResponse(6);
  body.answers[0].probability = 0.1;
  body.answers[5].probability = 1;
  body.answers.reverse();
  const f = fixture(body);
  const text = JSON.stringify({
    original: { currentUserMessage: "Kde je menza? Vyřeš integrál." },
    candidates: [{ id: "s0", text: "Kde je menza?" }],
  });
  const attempts: number[] = [];
  const result = await f.router.classifySegments(
    { text, segmentIds: ["s0", "s1", "s2", "s3", "s4", "s5"] },
    {
      signal: signal(),
      onAttempt: (bytes) => attempts.push(bytes),
    },
  );
  assert.equal(f.calls.length, 1);
  const request = JSON.parse(String(f.calls[0].init.body));
  assert.equal(request.input[1].content, text);
  assert.equal(request.questions.length, 30);
  assert.equal(request.questions[0].name, "s0_complex_reasoning");
  assert.equal(request.questions.at(-1).name, "s5_local_task_allowed");
  assert.match(request.questions[0].instructions, /exact id s0/);
  assert.match(
    request.questions[2].instructions,
    /genuine, independently answerable/,
  );
  assert.match(request.questions[2].instructions, /mixed, not allowed/);
  assert.match(request.questions[4].instructions, /Ignore original entirely/);
  assert.match(request.questions[4].instructions, /ONLY candidate.text/);
  assert.deepEqual(
    result.segments.map(({ id }) => id),
    ["s0", "s1", "s2", "s3", "s4", "s5"],
  );
  assert.equal(result.segments[0].decision.complexProbability, 0.1);
  assert.equal(result.segments[1].decision.complexProbability, 1);
  assert.deepEqual(result.usage, {
    inputTokens: 100,
    outputTokens: 5,
    totalTokens: 105,
    cachedInputTokens: 20,
    cacheWriteTokens: 30,
    reasoningTokens: 3,
  });
  assert.deepEqual(attempts, [Buffer.byteLength(String(f.calls[0].init.body))]);
  assert.ok(attempts[0] < 32 * 1024);
  const maximum = fixture(segmentResponse(6));
  await maximum.router.classifySegments(
    {
      text: "x".repeat(8191),
      segmentIds: ["s0", "s1", "s2", "s3", "s4", "s5"],
    },
    { signal: signal() },
  );
  assert.equal(
    maximum.calls.length,
    1,
    "six questions sets fit the existing request cap at the maximum unescaped input size",
  );
});

test("segment selector count and identity are validated before transport or admission", async () => {
  const f = fixture(segmentResponse(2));
  let attempts = 0;
  for (const input of [
    null,
    {},
    { text: "data", segmentIds: [] },
    { text: "data", segmentIds: ["s0"] },
    { text: "data", segmentIds: ["s0", "s0"] },
    { text: "data", segmentIds: ["s1", "s0"] },
    { text: "data", segmentIds: ["s0", "untrusted instruction"] },
    { text: "data", segmentIds: Array.from({ length: 7 }, (_, i) => `s${i}`) },
    { text: "", segmentIds: ["s0", "s1"] },
  ])
    await rejectCode(
      f.router.classifySegments(input as never, {
        signal: signal(),
        onAttempt() {
          attempts++;
        },
      }),
      "invalid-input",
    );
  assert.equal(attempts, 0);
  assert.equal(f.calls.length, 0);
});

test("segment classifications reject missing, duplicate and foreign selectors as one invalid response", async () => {
  const source = segmentResponse(2);
  for (const answers of [
    source.answers.slice(1),
    [...source.answers, source.answers[0]],
    source.answers.map((answer, index) =>
      index === 0 ? { ...answer, name: "s5_complex_reasoning" } : answer,
    ),
    source.answers.map((answer, index) =>
      index === 0 ? source.answers[1] : answer,
    ),
  ])
    await rejectCode(
      fixture({ ...source, answers }).router.classifySegments(
        { text: "exact moderated context", segmentIds: ["s0", "s1"] },
        { signal: signal() },
      ),
      "invalid-response",
    );
});

test("segment admission snapshots selectors and bounds the complete dynamic request", async () => {
  const f = fixture(segmentResponse(2));
  const input = { text: "original moderated text", segmentIds: ["s0", "s1"] };
  const result = await f.router.classifySegments(input, {
    signal: signal(),
    onAttempt() {
      input.text = "changed";
      input.segmentIds[0] = "bad";
    },
  });
  assert.equal(
    JSON.parse(String(f.calls[0].init.body)).input[1].content,
    "original moderated text",
  );
  assert.deepEqual(
    result.segments.map(({ id }) => id),
    ["s0", "s1"],
  );
  await rejectCode(
    f.router.classifySegments(
      { text: "x".repeat(8192), segmentIds: ["s0", "s1"] },
      { signal: signal() },
    ),
    "request-too-large",
  );
  await rejectCode(
    f.router.classifySegments(
      { text: "a" + "\u0000".repeat(6000), segmentIds: ["s0", "s1"] },
      { signal: signal() },
    ),
    "request-too-large",
  );
  assert.equal(f.calls.length, 1);
});

test("segment timeout has one paid attempt, no retry and no leaked parent listener", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const f = fixture(undefined, {
    timeoutMs: 20,
    fetch: () => new Promise(() => {}),
  });
  const keepAlive = setInterval(() => {}, 1000);
  try {
    await rejectCode(
      f.router.classifySegments(
        { text: "exact moderated input", segmentIds: ["s0", "s1"] },
        {
          signal: controller.signal,
          onAttempt() {
            attempts++;
          },
        },
      ),
      "request-timeout",
    );
    assert.equal(attempts, 1);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  } finally {
    clearInterval(keepAlive);
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
    Buffer.byteLength(
      JSON.parse(String(f.calls[0].init.body)).input[1].content,
    ),
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
