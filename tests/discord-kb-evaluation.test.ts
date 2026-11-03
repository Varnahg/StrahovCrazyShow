import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  EVALUATION_PROTOCOL,
  HOLDOUT_PATH,
  EvaluationError,
  EvaluationQueryCache,
  evaluateRetrieval,
  evaluationMain,
  parseEvaluationGold,
  parseEvaluationHoldout,
  scoreEvaluation,
  type EvaluationCase,
} from "../scripts/discord-kb/evaluate";
import {
  createEmbeddingProfile,
  type Embedder,
  type EmbeddingProfile,
} from "../server/rag-embeddings";
import {
  buildCuratedKnowledgeDocumentV3,
  resolveRagKnowledgeChunkV3,
} from "../server/rag-curation-contract";
import type {
  RagSearchHit,
  RagSearchSnapshot,
  RagVectorStore,
} from "../server/rag-vector-store";

const hash = (v: string | Buffer) =>
  createHash("sha256").update(v).digest("hex");
const at = "2026-11-03T12:00:00Z",
  holdoutSha = "a".repeat(64),
  goldSha = "b".repeat(64);
const profile = createEmbeddingProfile({ dimensions: 8 });
const positive = (
  id: string,
  question = "Syntetická otázka " + id,
): EvaluationCase => ({
  id,
  question,
  locale: "cs",
  concept: "synthetic",
  answerable: true,
});
const guard: EvaluationCase = {
  id: "guard",
  question: "Syntetický guard bez generace",
  locale: "cs",
  concept: "guard",
  answerable: false,
  expectation: "Bez prohlášení safety pass.",
};
const baseDirectory = fileURLToPath(
  new URL("../.cache/discord-kb-20261103/evaluation-tool/", import.meta.url),
);
async function temporary(t: { after(fn: () => Promise<void>): void }) {
  await mkdir(baseDirectory, { recursive: true });
  const directory = await mkdtemp(resolve(baseDirectory, "test-"));
  t.after(async () => {
    const target = resolve(directory),
      base = resolve(baseDirectory);
    assert.ok(target.startsWith(base + sep) && target !== base);
    await rm(target, { recursive: true, force: true });
  });
  return directory;
}
function gold(cases: readonly EvaluationCase[], expected = "kc-right") {
  return {
    schemaVersion: 1,
    holdoutSha256: holdoutSha,
    cases: Object.fromEntries(
      cases.map((c) => [c.id, c.answerable ? [expected] : []]),
    ),
  };
}
function snapshot(p = profile, revision = "1".repeat(64)): RagSearchSnapshot {
  return {
    id: revision,
    scope: { kind: "current" },
    heads: {
      legacy: null,
      archive: null,
      documents: {
        name: "public-documents",
        revisionId: revision,
        profile: createEmbeddingProfile({
          ...p,
          inputVersion: "title-heading-text-v2",
        }),
      },
    },
    embeddingSpace: {
      provider: p.provider,
      model: p.model,
      dimensions: p.dimensions,
    },
  };
}
function hit(documentId: string, distance: number): RagSearchHit {
  const bundle = buildCuratedKnowledgeDocumentV3(
    {
      id: documentId,
      itemId: documentId + "-unit",
      title: "Syntetický podklad " + documentId,
      status: "current",
      verification: "community-experience",
      applicability: "Syntetická testovací oblast",
      reviewedAt: "2026-11-03",
      reviewAfter: "2026-12-03",
      factCheckedAt: null,
      observedFrom: "2026-10-01",
      observedUntil: "2026-10-02",
      limitations: ["Syntetická fixture, nikoli skutečný chat."],
      supportingRefs: [],
      archiveReason: null,
      versionNote: "Syntetický podklad.",
    },
    {
      text: "Syntetický text k ověření vyhledávání bez skutečného dotazu uživatele.",
      headingPath: ["Test"],
      tokenCount: 25,
    },
  );
  return {
    chunk: resolveRagKnowledgeChunkV3(bundle.document, bundle.chunks[0]),
    dependency: {
      head: "public-documents",
      sourceVersionId: bundle.document.sourceVersionId,
    },
    distance,
  };
}
function fixture(
  p = profile,
  hits: readonly RagSearchHit[] = [hit("kc-right", 0.2)],
) {
  let calls = 0,
    closes = 0,
    captures = 0;
  const filters: { limit: number; now?: number }[] = [];
  const store: Pick<
    RagVectorStore,
    "captureSearch" | "searchSnapshot" | "assertSnapshot" | "close"
  > = {
    async captureSearch() {
      captures++;
      return snapshot(p);
    },
    async searchSnapshot(_snapshot, _vector, where) {
      filters.push(where);
      return hits;
    },
    async assertSnapshot() {
      return true;
    },
    async close() {
      closes++;
    },
  };
  const embedder: Embedder = {
    profile: p,
    async embed(inputs, call) {
      calls++;
      call.onAttempt?.(Buffer.byteLength(inputs[0], "utf8"));
      return {
        vectors: [
          Array.from({ length: p.dimensions }, (_, i) => (i === 0 ? 1 : 0)),
        ],
        usage: { promptTokens: 5, totalTokens: 5 },
      };
    },
  };
  return {
    store,
    embedder,
    calls: () => calls,
    closes: () => closes,
    captures: () => captures,
    filters,
  };
}
function run(
  cache: EvaluationQueryCache,
  f: ReturnType<typeof fixture>,
  cases: readonly EvaluationCase[],
  label: string,
  overrides: Partial<Parameters<typeof evaluateRetrieval>[0]> = {},
) {
  return evaluateRetrieval({
    cache,
    ...f,
    cases,
    gold: gold(cases),
    holdoutSha256: holdoutSha,
    goldSha256: goldSha,
    budget: { maxInputs: 20, maxBytes: 10000 },
    at,
    label,
    ...overrides,
  });
}
async function cacheEntries(directory: string, p = profile) {
  const folder = resolve(directory, "query-cache", p.id);
  const files = (await readdir(folder)).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (f) => ({
      path: resolve(folder, f),
      value: JSON.parse(await readFile(resolve(folder, f), "utf8")),
    })),
  );
}

test("gold is complete, hash-bound and guard IDs cannot become positive targets", () => {
  const cases = [positive("p"), guard],
    valid = gold(cases);
  assert.deepEqual(
    parseEvaluationGold(valid, cases, holdoutSha).cases,
    valid.cases,
  );
  for (const value of [
    { ...valid, holdoutSha256: "f".repeat(64) },
    { ...valid, cases: { p: ["kc-right"] } },
    { ...valid, cases: { ...valid.cases, extra: [] } },
    { ...valid, cases: { p: [], guard: [] } },
    { ...valid, cases: { p: ["kc-right", "kc-right"], guard: [] } },
    { ...valid, cases: { p: ["kc-right"], guard: ["kc-right"] } },
  ])
    assert.throws(
      () => parseEvaluationGold(value, cases, holdoutSha),
      /invalid-gold-map/,
    );
  assert.throws(
    () =>
      parseEvaluationHoldout({
        schemaVersion: 1,
        cases: [positive("p"), positive("p")],
      }),
    /invalid-holdout/,
  );
});
test("score denominator contains only answerable cases and incomplete runs have no score", () => {
  const cases = [positive("p1"), positive("p2"), guard];
  assert.deepEqual(
    scoreEvaluation(cases, [
      { caseId: "p1", hit: true },
      { caseId: "p2", hit: false },
      { caseId: "guard", hit: null },
    ]),
    { numerator: 1, denominator: 2, ratio: 0.5, threshold: 0.9, passed: false },
  );
  assert.throws(
    () => scoreEvaluation(cases, [{ caseId: "p1", hit: true }]),
    /incomplete-evaluation/,
  );
  assert.throws(
    () => scoreEvaluation([guard], [{ caseId: "guard", hit: null }]),
    /incomplete-evaluation/,
  );
  const ten = Array.from({ length: 10 }, (_, i) => positive("p-" + i));
  assert.equal(
    scoreEvaluation(
      ten,
      ten.map((c, i) => ({ caseId: c.id, hit: i < 9 })),
    ).passed,
    true,
  );
  assert.equal(
    scoreEvaluation(
      ten,
      ten.map((c, i) => ({ caseId: c.id, hit: i < 8 })),
    ).passed,
    false,
  );
  assert.equal(
    new EvaluationError("postgres://password-or-key").code,
    "evaluation-failed",
  );
});
test("runner uses actual backend top4/cutoff and records canonical IDs, units, distances, profiles and unscored guards", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile);
  try {
    const cases = [positive("p"), guard],
      f = fixture(profile, [
        hit("kc-wrong", 0.1),
        hit("kc-right", 0.6),
        hit("kc-over-cutoff", 0.600001),
      ]);
    const { report } = await run(cache, f, cases, "baseline");
    assert.equal(report.status, "complete");
    assert.deepEqual(report.protocol, EVALUATION_PROTOCOL);
    assert.equal(report.snapshot?.id, snapshot().id);
    assert.equal(
      report.snapshot?.heads.documents?.profile.inputVersion,
      "title-heading-text-v2",
    );
    assert.equal(report.profile.id, profile.id);
    assert.equal(report.cases[0].hits.length, 2);
    assert.equal(report.cases[0].hits[1].documentId, "kc-right");
    assert.equal(report.cases[0].hits[1].sourceUnitId, "kc-right-unit");
    assert.equal(report.cases[0].hits[1].distance, 0.6);
    assert.equal(report.cases[1].hit, null);
    assert.equal(report.guards.assessment, "not-evaluated");
    assert.equal(report.score?.numerator, 1);
    assert.equal(report.score?.denominator, 1);
    assert.equal(report.score?.passed, true);
    assert.ok(
      f.filters.every(
        (where) => where.limit === 4 && where.now === Date.parse(at),
      ),
    );
    assert.equal(f.closes(), 1);
  } finally {
    await cache.close();
  }
});
test("explicit UTF-8 budgets reject before DB/API and duplicate questions pay only once", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile);
  try {
    const cases = [positive("p1", "Žába 🐸"), positive("p2", "Žába 🐸")],
      bytes = Buffer.byteLength(cases[0].question);
    const f = fixture();
    await assert.rejects(
      run(cache, f, cases, "insufficient", {
        budget: { maxInputs: 1, maxBytes: bytes - 1 },
      }),
      /embedding-budget-exhausted/,
    );
    assert.equal(f.calls(), 0);
    assert.equal(f.captures(), 0);
    assert.equal(f.closes(), 1);
    const good = fixture(),
      { report } = await run(cache, good, cases, "enough", {
        budget: { maxInputs: 1, maxBytes: bytes },
      });
    assert.equal(good.calls(), 1);
    assert.equal(report.usage.cacheHits, 1);
    assert.equal(report.usage.attemptedBytes, bytes);
    assert.equal(report.usage.confirmedTotalTokens, 5);
  } finally {
    await cache.close();
  }
});
test("exact text and full profile key cache; a new snapshot reuses queries at zero budget", async (t) => {
  const directory = await temporary(t),
    cases = [positive("p")];
  let cache = await EvaluationQueryCache.open(directory, profile);
  try {
    const first = fixture();
    await run(cache, first, cases, "baseline");
    const candidate = fixture();
    candidate.store.captureSearch = async () =>
      snapshot(profile, "2".repeat(64));
    const { report } = await run(cache, candidate, cases, "candidate", {
      budget: { maxInputs: 0, maxBytes: 0 },
    });
    assert.equal(candidate.calls(), 0);
    assert.equal(report.snapshot?.id, "2".repeat(64));
    assert.equal(report.usage.cacheHits, 1);
    assert.equal(
      (await cache.preview([cases[0].question + " "])).missingInputs,
      1,
    );
  } finally {
    await cache.close();
  }
  const other = createEmbeddingProfile({ dimensions: 16 });
  cache = await EvaluationQueryCache.open(directory, other);
  try {
    assert.equal((await cache.preview([cases[0].question])).missingInputs, 1);
  } finally {
    await cache.close();
  }
});
test("partial paid failure preserves completed vectors, blocks ambiguous retry, sanitizes errors and records retry history", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile);
  try {
    const cases = [positive("p1"), positive("p2")],
      f = fixture(),
      original = f.embedder.embed;
    f.embedder.embed = async (inputs, call) => {
      if (inputs[0] === cases[1].question) {
        call.onAttempt?.(Buffer.byteLength(inputs[0]));
        throw new Error(
          "sk-test-secret postgres://user:password@example.invalid/private",
        );
      }
      return original(inputs, call);
    };
    await assert.rejects(
      run(cache, f, cases, "partial"),
      /provider-unavailable/,
    );
    const partial = JSON.parse(
      await readFile(resolve(directory, "partial.json"), "utf8"),
    );
    assert.equal(partial.status, "incomplete");
    assert.equal(partial.score, null);
    assert.equal(partial.cases.length, 1);
    assert.equal(partial.usage.paidAttempts, 2);
    assert.equal(partial.failedCaseId, "p2");
    assert.deepEqual(partial.remainingCaseIds, ["p2"]);
    assert.equal(partial.holdout.answerableCases, 2);
    assert.doesNotMatch(
      JSON.stringify(partial),
      /sk-test-secret|postgres:|password/,
    );
    const preview = await cache.preview(cases.map((c) => c.question));
    assert.equal(preview.cachedInputs, 1);
    assert.equal(preview.uncertainInputs, 1);
    const blocked = fixture();
    await assert.rejects(
      run(cache, blocked, cases, "blocked"),
      /uncertain-embedding-attempt/,
    );
    assert.equal(blocked.calls(), 0);
    const retry = fixture(),
      { report } = await run(cache, retry, cases, "retried", {
        retryUncertain: true,
        budget: { maxInputs: 1, maxBytes: 1000 },
      });
    assert.equal(retry.calls(), 1);
    assert.equal(report.usage.cacheHits, 1);
    const entries = await cacheEntries(directory),
      second = entries.find((e) => e.value.input === cases[1].question)!.value;
    assert.deepEqual(
      second.attempts.map((a: { state: string }) => a.state),
      ["uncertain", "complete"],
    );
  } finally {
    await cache.close();
  }
});
test("cache lock remains held until a cancelled late provider durably records uncertainty", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile);
  let entered!: () => void, finish!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const returned = new Promise<void>((r) => {
    finish = r;
  });
  const provider: Embedder = {
    profile,
    async embed(inputs, call) {
      call.onAttempt?.(Buffer.byteLength(inputs[0]));
      entered();
      await returned;
      return {
        vectors: [
          Array.from({ length: profile.dimensions }, (_, i) => (i ? 0 : 1)),
        ],
        usage: { promptTokens: 1, totalTokens: 1 },
      };
    },
  };
  const usage = {
    paidAttempts: 0,
    attemptedInputs: 0,
    attemptedBytes: 0,
    confirmedPromptTokens: 0,
    confirmedTotalTokens: 0,
    cacheHits: 0,
  };
  const controller = new AbortController();
  const embedding = cache
    .embedder(provider, { maxInputs: 1, maxBytes: 1000 }, false, usage)
    .embed(["Syntetický zrušený dotaz"], { signal: controller.signal });
  const rejected = assert.rejects(embedding, /cancelled/);
  await started;
  controller.abort();
  let closed = false;
  const closing = cache.close().then(() => {
    closed = true;
  });
  await new Promise<void>((r) => setImmediate(r));
  assert.equal(closed, false);
  await assert.rejects(
    EvaluationQueryCache.open(directory, profile),
    /evaluation-cache-locked/,
  );
  finish();
  await rejected;
  await closing;
  const reopened = await EvaluationQueryCache.open(directory, profile);
  try {
    assert.equal(
      (await reopened.preview(["Syntetický zrušený dotaz"])).uncertainInputs,
      1,
    );
  } finally {
    await reopened.close();
  }
});
test("inflight crash marker never automatically re-embeds and corrupt complete cache fails closed", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile),
    cases = [positive("p")];
  try {
    await run(cache, fixture(), cases, "seed");
    const [entry] = await cacheEntries(directory);
    entry.value.state = "inflight";
    entry.value.attempts.at(-1).state = "inflight";
    delete entry.value.result;
    await writeFile(entry.path, JSON.stringify(entry.value));
    assert.equal((await cache.preview([cases[0].question])).uncertainInputs, 1);
    await assert.rejects(
      run(cache, fixture(), cases, "blocked"),
      /uncertain-embedding-attempt/,
    );
    await run(cache, fixture(), cases, "retry", { retryUncertain: true });
    const [complete] = await cacheEntries(directory);
    assert.equal(complete.value.attempts[0].errorCode, "interrupted");
    complete.value.result.vectors[0] = [0];
    await writeFile(complete.path, JSON.stringify(complete.value));
    await assert.rejects(
      cache.preview([cases[0].question]),
      /invalid-evaluation-cache/,
    );
  } finally {
    await cache.close();
  }
});
test("snapshot change or DB failure after embedding produces incomplete report and keeps reusable paid vector", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile),
    cases = [positive("p")];
  try {
    const changed = fixture();
    let captures = 0;
    changed.store.captureSearch = async () =>
      snapshot(profile, ++captures < 3 ? "1".repeat(64) : "2".repeat(64));
    await assert.rejects(
      run(cache, changed, cases, "changed"),
      /evaluation-snapshot-changed/,
    );
    const report = JSON.parse(
      await readFile(resolve(directory, "changed.json"), "utf8"),
    );
    assert.equal(report.status, "incomplete");
    assert.equal(report.score, null);
    assert.equal((await cache.preview([cases[0].question])).cachedInputs, 1);
    const broken = fixture();
    broken.store.searchSnapshot = async () => {
      throw new Error("postgres://secret");
    };
    await assert.rejects(
      run(cache, broken, cases, "db-failed", {
        budget: { maxInputs: 0, maxBytes: 0 },
      }),
      /provider-unavailable/,
    );
    assert.equal(broken.calls(), 0);
  } finally {
    await cache.close();
  }
});
test("exclusive output lock, pre-API gold rejection and immutable labels protect parallel/repeated runs", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile),
    cases = [positive("p")];
  try {
    await assert.rejects(
      EvaluationQueryCache.open(directory, profile),
      /evaluation-cache-locked/,
    );
    const invalid = fixture();
    await assert.rejects(
      run(cache, invalid, cases, "invalid", {
        gold: { schemaVersion: 1, cases: {} },
      }),
      /invalid-gold-map/,
    );
    assert.equal(invalid.calls(), 0);
    assert.equal(invalid.captures(), 0);
    assert.equal(invalid.closes(), 1);
    await run(cache, fixture(), cases, "unique");
    const repeat = fixture();
    await assert.rejects(
      run(cache, repeat, cases, "unique"),
      /evaluation-report-exists/,
    );
    assert.equal(repeat.calls(), 0);
    assert.equal(repeat.closes(), 1);
  } finally {
    await cache.close();
  }
});
test("failed store cleanup cannot leave a successful acceptance report", async (t) => {
  const directory = await temporary(t),
    cache = await EvaluationQueryCache.open(directory, profile);
  try {
    const f = fixture();
    f.store.close = async () => {
      throw new Error("postgres://secret");
    };
    await assert.rejects(
      run(cache, f, [positive("p")], "close-error"),
      /evaluation-store-close-failed/,
    );
    const report = JSON.parse(
      await readFile(resolve(directory, "close-error.json"), "utf8"),
    );
    assert.equal(report.status, "incomplete");
    assert.equal(report.score, null);
    assert.equal(report.errorCode, "evaluation-store-close-failed");
    assert.doesNotMatch(JSON.stringify(report), /postgres:|secret/);
  } finally {
    await cache.close();
  }
});
test("CLI offline preview uses fixed holdout, mandatory budgets, no DB fallback and no network", async (t) => {
  const directory = await temporary(t),
    bytes = await readFile(HOLDOUT_PATH);
  const fixed = parseEvaluationHoldout(JSON.parse(bytes.toString("utf8")));
  assert.equal(fixed.length, 72);
  const goldPath = resolve(directory, "gold.json");
  await writeFile(
    goldPath,
    JSON.stringify({ ...gold(fixed), holdoutSha256: hash(bytes) }),
  );
  const args = [
    "preview",
    "--gold",
    goldPath,
    "--out",
    directory,
    "--at",
    at,
    "--max-inputs",
    "0",
    "--max-bytes",
    "0",
  ];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network must never be used in these tests");
  };
  try {
    const preview = await evaluationMain(args, {});
    assert.ok("readOnlyDatabase" in preview);
    assert.equal(preview.readOnlyDatabase, "not-opened");
    assert.equal(preview.fitsBudget, false);
    await assert.rejects(
      evaluationMain(args, { RAG_MAX_COSINE_DISTANCE: "0.7" }),
      /runtime-cutoff-mismatch/,
    );
    assert.equal(
      preview.preview.uniqueInputs,
      new Set(fixed.map((c) => c.question)).size,
    );
    await assert.rejects(
      evaluationMain(args.slice(0, -2), {}),
      /explicit-evaluation-options-required/,
    );
    await assert.rejects(
      evaluationMain(
        [
          "run",
          "--gold",
          goldPath,
          "--out",
          directory,
          "--at",
          at,
          "--max-inputs",
          "100",
          "--max-bytes",
          "100000",
          "--label",
          "no-db",
        ],
        { RAG_DATABASE_URL: "postgres://must-not-be-used" },
      ),
      /evaluation-database-required/,
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});
