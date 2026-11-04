import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRagEvidenceBackend,
  prepareEvidenceQuery,
  RagEvidenceError,
} from "../../server/rag-evidence-backend";
import {
  createEmbeddingProfile,
  createOpenAIEmbedder,
  validateEmbeddingProfile,
  EmbeddingError,
  type Embedder,
  type EmbeddingProfile,
  type EmbeddingResult,
} from "../../server/rag-embeddings";
import {
  canonicalHash,
  canonicalJson,
  createVectorKnowledgeStore,
  type RagSearchHit,
  type RagSearchSnapshot,
  type RagVectorStore,
} from "../../server/rag-vector-store";
import { CRAZY_TYPKA_LIMITS } from "../../shared/crazy-typka";

export const EVALUATION_PROTOCOL = Object.freeze({
  topK: 4,
  maxDistance: 0.6,
  acceptanceThreshold: 0.9,
  scoreRule: "at-least-one-gold-document-in-runtime-selected-top4",
  generation: "not-run",
  guardAssessment: "not-evaluated",
});
export const HOLDOUT_PATH = fileURLToPath(
  new URL(
    "../../server/data/rag/community/evaluation-questions.json",
    import.meta.url,
  ),
);
type Store = Pick<
  RagVectorStore,
  "captureSearch" | "searchSnapshot" | "assertSnapshot" | "close"
>;
export type EvaluationCase = Readonly<{
  id: string;
  question: string;
  locale: string;
  concept: string;
  answerable: boolean;
  expectation?: string;
}>;
type Gold = Readonly<{
  schemaVersion: 1;
  holdoutSha256: string;
  cases: Readonly<Record<string, readonly string[]>>;
}>;
const SAFE_ERRORS = new Set([
  "evaluation-failed",
  "explicit-budget-required",
  "invalid-evaluation-arguments",
  "invalid-holdout",
  "invalid-gold-map",
  "invalid-evaluation-file",
  "evaluation-write-failed",
  "evaluation-cache-locked",
  "evaluation-cache-closed",
  "invalid-evaluation-cache",
  "evaluation-profile-mismatch",
  "invalid-evaluation-query",
  "uncertain-embedding-attempt",
  "embedding-budget-exhausted",
  "invalid-embedding-attempt",
  "invalid-embedding-result",
  "incomplete-evaluation",
  "runtime-top-k-changed",
  "evaluation-report-exists",
  "evaluation-snapshot-changed",
  "evaluation-evidence-expired",
  "evaluation-trace-missing",
  "explicit-evaluation-options-required",
  "fixed-holdout-count-changed",
  "evaluation-database-required",
  "embedding-key-required",
  "runtime-cutoff-mismatch",
  "evaluation-store-close-failed",
  "invalid-profile",
  "invalid-configuration",
  "invalid-input",
  "request-too-large",
  "request-timeout",
  "cancelled",
  "rate-limited",
  "provider-unavailable",
  "invalid-response",
  "invalid-request",
  "unavailable",
  "response-expired",
  "budget-exhausted",
]);
export class EvaluationError extends Error {
  readonly code: string;
  constructor(code: string) {
    const safe = SAFE_ERRORS.has(code) ? code : "evaluation-failed";
    super(safe);
    this.name = "EvaluationError";
    this.code = safe;
  }
}
function fail(code: string): never {
  throw new EvaluationError(code);
}
const hash = (text: string | Buffer) =>
  createHash("sha256").update(text).digest("hex");
const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const identifier = (v: unknown): v is string =>
  typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,299}$/.test(v);
const text = (v: unknown): v is string =>
  typeof v === "string" && !!v.trim() && Buffer.byteLength(v, "utf8") <= 8191;
function integer(v: number) {
  if (!Number.isSafeInteger(v) || v < 0) fail("explicit-budget-required");
  return v;
}
function evaluationInstant(value: string) {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    ) ||
    !Number.isFinite(Date.parse(value))
  )
    fail("invalid-evaluation-arguments");
  return new Date(value).toISOString();
}
function safeError(error: unknown): string {
  if (
    (error instanceof EvaluationError ||
      error instanceof EmbeddingError ||
      error instanceof RagEvidenceError) &&
    SAFE_ERRORS.has(error.code)
  )
    return error.code;
  return "evaluation-failed";
}
export function parseEvaluationHoldout(
  value: unknown,
): readonly EvaluationCase[] {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.cases) ||
    !value.cases.length ||
    value.cases.length > 1024
  )
    fail("invalid-holdout");
  const ids = new Set<string>();
  return Object.freeze(
    value.cases.map((v: unknown) => {
      if (
        !record(v) ||
        !identifier(v.id) ||
        ids.has(v.id) ||
        !text(v.question) ||
        typeof v.answerable !== "boolean" ||
        !text(v.concept) ||
        !["cs", "sk", "en"].includes(String(v.locale)) ||
        (!v.answerable && !text(v.expectation))
      )
        return fail("invalid-holdout");
      ids.add(v.id);
      prepareEvidenceQuery(v.question);
      return Object.freeze({
        id: v.id,
        question: v.question,
        concept: v.concept,
        locale: String(v.locale),
        answerable: v.answerable,
        ...(v.expectation === undefined
          ? {}
          : { expectation: String(v.expectation) }),
      });
    }),
  );
}
export function parseEvaluationGold(
  value: unknown,
  cases: readonly EvaluationCase[],
  holdoutSha256: string,
): Gold {
  if (
    !record(value) ||
    Object.keys(value).sort().join(",") !==
      "cases,holdoutSha256,schemaVersion" ||
    value.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(holdoutSha256) ||
    value.holdoutSha256 !== holdoutSha256 ||
    !record(value.cases) ||
    Object.keys(value.cases).length !== cases.length
  )
    fail("invalid-gold-map");
  const map = value.cases as Record<string, unknown>,
    result: Record<string, readonly string[]> = {};
  for (const item of cases) {
    const ids = map[item.id];
    if (
      !Object.hasOwn(map, item.id) ||
      !Array.isArray(ids) ||
      ids.some((id) => !identifier(id)) ||
      new Set(ids).size !== ids.length ||
      (item.answerable ? !ids.length : ids.length !== 0)
    )
      fail("invalid-gold-map");
    result[item.id] = Object.freeze([...ids] as string[]);
  }
  return Object.freeze({
    schemaVersion: 1,
    holdoutSha256,
    cases: Object.freeze(result),
  });
}
async function jsonFile(
  path: string,
  maximum = 2 * 1024 * 1024,
): Promise<unknown> {
  const info = await lstat(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > maximum)
    fail("invalid-evaluation-file");
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}
async function atomicJson(path: string, value: unknown) {
  const temporary = path + "." + randomUUID() + ".tmp";
  try {
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(JSON.stringify(value, null, 2) + "\n");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
  } catch {
    fail("evaluation-write-failed");
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
function validResult(
  result: EmbeddingResult,
  profile: EmbeddingProfile,
): boolean {
  if (
    !result ||
    !Array.isArray(result.vectors) ||
    result.vectors.length !== 1 ||
    !Array.isArray(result.vectors[0]) ||
    result.vectors[0].length !== profile.dimensions ||
    !result.vectors[0].every((n) => Number.isFinite(n)) ||
    !Number.isSafeInteger(result.usage?.promptTokens) ||
    result.usage.promptTokens < 0 ||
    !Number.isSafeInteger(result.usage?.totalTokens) ||
    result.usage.totalTokens < result.usage.promptTokens
  )
    return false;
  const norm = Math.sqrt(result.vectors[0].reduce((sum, n) => sum + n * n, 0));
  return Number.isFinite(norm) && Math.abs(norm - 1) <= 0.001;
}
type Attempt = {
  id: string;
  startedAt: string;
  finishedAt?: string;
  state: "inflight" | "uncertain" | "complete";
  errorCode?: string;
};
type CacheEntry = {
  schemaVersion: 1;
  profile: EmbeddingProfile;
  input: string;
  inputSha256: string;
  state: Attempt["state"];
  attempts: Attempt[];
  result?: EmbeddingResult;
};
export type CachePreview = Readonly<{
  uniqueInputs: number;
  cachedInputs: number;
  missingInputs: number;
  missingBytes: number;
  uncertainInputs: number;
  missing: readonly Readonly<{
    inputSha256: string;
    input: string;
    bytes: number;
    uncertain: boolean;
  }>[];
}>;
export type EvaluationBudget = { maxInputs: number; maxBytes: number };
export type EvaluationUsage = {
  paidAttempts: number;
  attemptedInputs: number;
  attemptedBytes: number;
  confirmedPromptTokens: number;
  confirmedTotalTokens: number;
  cacheHits: number;
};
export class EvaluationQueryCache {
  readonly profile: EmbeddingProfile;
  private constructor(
    readonly directory: string,
    profile: EmbeddingProfile,
    private readonly lock: Awaited<ReturnType<typeof open>>,
    private readonly lockPath: string,
  ) {
    this.profile = validateEmbeddingProfile(profile);
  }
  private closed = false;
  private closing: Promise<void> | undefined;
  private readonly pending = new Set<Promise<unknown>>();
  private tracked<T>(action: () => Promise<T>): Promise<T> {
    const work = action();
    this.pending.add(work);
    void work.finally(() => this.pending.delete(work)).catch(() => {});
    return work;
  }
  static async open(directory: string, profile: EmbeddingProfile) {
    const valid = validateEmbeddingProfile(profile),
      absolute = resolve(directory);
    await mkdir(absolute, { recursive: true });
    const lockPath = join(absolute, "query-cache.lock");
    let lock: Awaited<ReturnType<typeof open>>;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch {
      return fail("evaluation-cache-locked");
    }
    try {
      await lock.writeFile(
        JSON.stringify({
          pid: process.pid,
          openedAt: new Date().toISOString(),
        }) + "\n",
      );
      await mkdir(join(absolute, "query-cache", valid.id), { recursive: true });
      return new EvaluationQueryCache(absolute, valid, lock, lockPath);
    } catch {
      await lock.close();
      await unlink(lockPath).catch(() => {});
      return fail("evaluation-write-failed");
    }
  }
  private path(input: string) {
    return join(
      this.directory,
      "query-cache",
      this.profile.id,
      hash(input) + ".json",
    );
  }
  private async entry(input: string): Promise<CacheEntry | null> {
    if (this.closed) fail("evaluation-cache-closed");
    let value: unknown;
    try {
      value = await jsonFile(this.path(input));
    } catch (error) {
      if (record(error) && error.code === "ENOENT") return null;
      return fail("invalid-evaluation-cache");
    }
    if (
      !record(value) ||
      value.schemaVersion !== 1 ||
      value.input !== input ||
      value.inputSha256 !== hash(input) ||
      canonicalJson(value.profile) !== canonicalJson(this.profile) ||
      !["complete", "inflight", "uncertain"].includes(String(value.state)) ||
      !Array.isArray(value.attempts) ||
      !value.attempts.length ||
      value.attempts.some(
        (a: unknown) =>
          !record(a) ||
          !text(a.id) ||
          !["complete", "inflight", "uncertain"].includes(String(a.state)) ||
          !text(a.startedAt),
      ) ||
      (value.attempts.at(-1) as Attempt)?.state !== value.state ||
      (value.state === "complete" &&
        !validResult(value.result as EmbeddingResult, this.profile))
    )
      fail("invalid-evaluation-cache");
    return value as CacheEntry;
  }
  async preview(inputs: readonly string[]): Promise<CachePreview> {
    const missing: {
      inputSha256: string;
      input: string;
      bytes: number;
      uncertain: boolean;
    }[] = [];
    let cachedInputs = 0,
      uncertainInputs = 0;
    for (const input of new Set(inputs)) {
      if (!text(input)) fail("invalid-holdout");
      const found = await this.entry(input);
      if (found?.state === "complete") {
        cachedInputs++;
        continue;
      }
      const uncertain = found !== null;
      if (uncertain) uncertainInputs++;
      missing.push({
        inputSha256: hash(input),
        input,
        bytes: Buffer.byteLength(input, "utf8"),
        uncertain,
      });
    }
    return Object.freeze({
      uniqueInputs: cachedInputs + missing.length,
      cachedInputs,
      missingInputs: missing.length,
      missingBytes: missing.reduce((sum, m) => sum + m.bytes, 0),
      uncertainInputs,
      missing,
    });
  }
  embedder(
    provider: Embedder,
    budget: EvaluationBudget,
    retryUncertain: boolean,
    usage: EvaluationUsage,
  ): Embedder {
    if (canonicalJson(provider.profile) !== canonicalJson(this.profile))
      fail("evaluation-profile-mismatch");
    integer(budget.maxInputs);
    integer(budget.maxBytes);
    return {
      profile: this.profile,
      embed: (inputs, options) =>
        this.tracked(async () => {
          if (inputs.length !== 1 || !text(inputs[0]))
            return fail("invalid-evaluation-query");
          if (options.signal.aborted) return fail("cancelled");
          const input = inputs[0],
            bytes = Buffer.byteLength(input, "utf8"),
            found = await this.entry(input);
          if (found?.state === "complete") {
            usage.cacheHits++;
            return {
              vectors: found.result!.vectors.map((v) => [...v]),
              usage: { promptTokens: 0, totalTokens: 0 },
            };
          }
          if (found && !retryUncertain)
            return fail("uncertain-embedding-attempt");
          if (
            usage.attemptedInputs + 1 > budget.maxInputs ||
            usage.attemptedBytes + bytes > budget.maxBytes
          )
            return fail("embedding-budget-exhausted");
          const at = new Date().toISOString();
          const attempts: Attempt[] = (found?.attempts ?? []).map((a) =>
            a.state === "inflight"
              ? {
                  ...a,
                  state: "uncertain",
                  finishedAt: at,
                  errorCode: "interrupted",
                }
              : { ...a },
          );
          const attempt: Attempt = {
            id: randomUUID(),
            state: "inflight",
            startedAt: at,
          };
          attempts.push(attempt);
          const entry: CacheEntry = {
            schemaVersion: 1,
            profile: this.profile,
            input,
            inputSha256: hash(input),
            state: "inflight",
            attempts,
          };
          // Durable checkpoint precedes any possible network work, including a process interruption.
          await atomicJson(this.path(input), entry);
          let attempted = false;
          try {
            const result = await provider.embed([input], {
              ...options,
              onAttempt: (reportedBytes) => {
                if (attempted || reportedBytes !== bytes)
                  fail("invalid-embedding-attempt");
                attempted = true;
                usage.paidAttempts++;
                usage.attemptedInputs++;
                usage.attemptedBytes += bytes;
                options.onAttempt?.(bytes);
              },
            });
            if (!attempted || !validResult(result, this.profile))
              fail("invalid-embedding-result");
            if (options.signal.aborted) fail("cancelled");
            attempt.state = "complete";
            attempt.finishedAt = new Date().toISOString();
            entry.state = "complete";
            entry.result = result;
            await atomicJson(this.path(input), entry);
            usage.confirmedPromptTokens += result.usage.promptTokens;
            usage.confirmedTotalTokens += result.usage.totalTokens;
            return result;
          } catch (error) {
            attempt.state = "uncertain";
            attempt.finishedAt = new Date().toISOString();
            attempt.errorCode = safeError(error);
            entry.state = "uncertain";
            delete entry.result;
            await atomicJson(this.path(input), entry);
            throw new EvaluationError(attempt.errorCode);
          }
        }),
    };
  }
  async close() {
    if (!this.closing) {
      this.closed = true;
      this.closing = (async () => {
        // A cancelled backend may return before the embedder finishes its durable uncertain checkpoint.
        await Promise.allSettled([...this.pending]);
        await this.lock.close();
        await unlink(this.lockPath).catch(() => {});
      })();
    }
    return this.closing;
  }
}
export function scoreEvaluation(
  cases: readonly EvaluationCase[],
  results: readonly { caseId: string; hit: boolean | null }[],
) {
  const answerable = cases.filter((c) => c.answerable);
  const byId = new Map(results.map((r) => [r.caseId, r]));
  if (
    !answerable.length ||
    byId.size !== results.length ||
    results.length !== cases.length ||
    cases.some((c) => !byId.has(c.id)) ||
    cases.some((c) =>
      c.answerable
        ? typeof byId.get(c.id)!.hit !== "boolean"
        : byId.get(c.id)!.hit !== null,
    )
  )
    fail("incomplete-evaluation");
  const numerator = answerable.filter(
    (c) => byId.get(c.id)!.hit === true,
  ).length;
  return {
    numerator,
    denominator: answerable.length,
    ratio: numerator / answerable.length,
    threshold: EVALUATION_PROTOCOL.acceptanceThreshold,
    passed:
      numerator / answerable.length >= EVALUATION_PROTOCOL.acceptanceThreshold,
  };
}
type CaseResult = {
  caseId: string;
  question: string;
  locale: string;
  concept: string;
  answerable: boolean;
  expectation: string | null;
  expectedDocumentIds: readonly string[];
  inputSha256: string;
  hit: boolean | null;
  matchedDocumentIds: string[];
  hits: {
    rank: number;
    documentId: string;
    chunkId: string;
    sourceUnitId: string;
    sourceVersionId: string;
    head: string;
    distance: number;
    verification: string | null;
  }[];
};
async function runEvaluation(options: {
  cases: readonly EvaluationCase[];
  gold: unknown;
  holdoutSha256: string;
  goldSha256: string;
  cache: EvaluationQueryCache;
  embedder: Embedder;
  store: Store;
  budget: EvaluationBudget;
  retryUncertain?: boolean;
  at: string;
  label: string;
  signal?: AbortSignal;
}) {
  const { cache, budget, store } = options;
  const cases = parseEvaluationHoldout({
    schemaVersion: 1,
    cases: options.cases,
  });
  const gold = parseEvaluationGold(options.gold, cases, options.holdoutSha256);
  integer(budget.maxInputs);
  integer(budget.maxBytes);
  if (
    !identifier(options.label) ||
    options.label.length > 80 ||
    !/^[a-f0-9]{64}$/.test(options.goldSha256)
  )
    fail("invalid-evaluation-arguments");
  const at = evaluationInstant(options.at);
  if (CRAZY_TYPKA_LIMITS.sources !== 4) fail("runtime-top-k-changed");
  const queries = cases.map((c) => prepareEvidenceQuery(c.question));
  const preview = await cache.preview(queries.map((q) => q.text));
  if (preview.uncertainInputs && !options.retryUncertain)
    fail("uncertain-embedding-attempt");
  if (
    preview.missingInputs > budget.maxInputs ||
    preview.missingBytes > budget.maxBytes
  )
    fail("embedding-budget-exhausted");
  const reportPath = join(cache.directory, options.label + ".json");
  let reserved: Awaited<ReturnType<typeof open>>;
  try {
    reserved = await open(reportPath, "wx", 0o600);
  } catch {
    return fail("evaluation-report-exists");
  }
  await reserved.close();
  const signal = options.signal ?? new AbortController().signal;
  const usage: EvaluationUsage = {
    paidAttempts: 0,
    attemptedInputs: 0,
    attemptedBytes: 0,
    confirmedPromptTokens: 0,
    confirmedTotalTokens: 0,
    cacheHits: 0,
  };
  const report = {
    schemaVersion: 1,
    status: "incomplete" as "complete" | "incomplete",
    protocol: EVALUATION_PROTOCOL,
    at,
    holdoutSha256: options.holdoutSha256,
    goldSha256: options.goldSha256,
    holdout: {
      caseCount: cases.length,
      answerableCases: cases.filter((c) => c.answerable).length,
      guardCases: cases.filter((c) => !c.answerable).length,
    },
    profile: cache.profile,
    snapshot: null as RagSearchSnapshot | null,
    initialCache: preview,
    budget: { ...budget },
    usage,
    cases: [] as CaseResult[],
    score: null as ReturnType<typeof scoreEvaluation> | null,
    guards: {
      total: cases.filter((c) => !c.answerable).length,
      completed: 0,
      assessment: "not-evaluated",
      explanation:
        "Retrieval traces only. No answers generated; no safety pass is asserted.",
    },
    errorCode: null as string | null,
    failedCaseId: null as string | null,
    remainingCaseIds: cases.map((c) => c.id),
    costAccounting:
      "Attempts may have incurred charges even without confirmed usage; cache preserves uncertain attempts.",
  };
  let backend: ReturnType<typeof createRagEvidenceBackend> | undefined;
  let activeCaseId: string | null = null;
  try {
    await atomicJson(reportPath, report);
    const initial = await store.captureSearch({ kind: "current" }, signal);
    if (
      !initial ||
      initial.embeddingSpace.provider !== cache.profile.provider ||
      initial.embeddingSpace.model !== cache.profile.model ||
      initial.embeddingSpace.dimensions !== cache.profile.dimensions
    )
      fail("evaluation-profile-mismatch");
    report.snapshot = initial;
    let rawHits: readonly RagSearchHit[] = [];
    const traced: Store = {
      async captureSearch(scope, abort) {
        const actual = await store.captureSearch(scope, abort);
        if (!actual || canonicalJson(actual) !== canonicalJson(initial))
          fail("evaluation-snapshot-changed");
        return actual;
      },
      async searchSnapshot(snapshot, vector, filters, abort) {
        if (filters.limit !== EVALUATION_PROTOCOL.topK)
          fail("runtime-top-k-changed");
        rawHits = await store.searchSnapshot(snapshot, vector, filters, abort);
        return rawHits;
      },
      assertSnapshot: (...args) => store.assertSnapshot(...args),
      close: async () => {}, // The outer runner owns the underlying store, including preflight failures.
    };
    backend = createRagEvidenceBackend({
      store: traced,
      embedder: cache.embedder(
        options.embedder,
        budget,
        !!options.retryUncertain,
        usage,
      ),
      maxDistance: EVALUATION_PROTOCOL.maxDistance,
    });
    for (let index = 0; index < cases.length; index++) {
      const item = cases[index];
      activeCaseId = item.id;
      rawHits = [];
      const evidence = await backend.search(queries[index], {
        signal,
        now: Date.parse(options.at),
        user: "fixed-holdout-retrieval-evaluation",
        onEmbeddingAttempt() {},
      });
      if (!(await backend.validate(evidence, Date.parse(options.at), signal)))
        fail("evaluation-evidence-expired");
      const hits = evidence.chunks.map((chunk, rank) => {
        const hit = rawHits.find((h) => h.chunk.id === chunk.id);
        if (!hit) return fail("evaluation-trace-missing");
        return {
          rank: rank + 1,
          documentId: chunk.document.id,
          chunkId: chunk.id,
          sourceUnitId:
            "derivation" in chunk.document
              ? chunk.document.itemId
              : "localChunkId" in chunk
                ? chunk.localChunkId
                : chunk.id,
          sourceVersionId: hit.dependency.sourceVersionId,
          head: hit.dependency.head,
          distance: hit.distance,
          verification:
            "verification" in chunk.document
              ? chunk.document.verification
              : null,
        };
      });
      const expectedDocumentIds = gold.cases[item.id];
      const matchedDocumentIds = [
        ...new Set(
          hits
            .map((h) => h.documentId)
            .filter((id) => expectedDocumentIds.includes(id)),
        ),
      ];
      report.cases.push({
        caseId: item.id,
        question: item.question,
        locale: item.locale,
        concept: item.concept,
        answerable: item.answerable,
        expectation: item.expectation ?? null,
        expectedDocumentIds,
        inputSha256: hash(queries[index].text),
        hit: item.answerable ? matchedDocumentIds.length > 0 : null,
        matchedDocumentIds,
        hits,
      });
      if (!item.answerable) report.guards.completed++;
      report.remainingCaseIds.shift();
      activeCaseId = null;
      await atomicJson(reportPath, report);
    }
    // A mutable public head cannot silently produce a mixed baseline/candidate report.
    const final = await store.captureSearch({ kind: "current" }, signal);
    if (!final || canonicalJson(final) !== canonicalJson(initial))
      fail("evaluation-snapshot-changed");
    report.score = scoreEvaluation(cases, report.cases);
    report.status = "complete";
    await atomicJson(reportPath, report);
    return { reportPath, report };
  } catch (error) {
    report.status = "incomplete";
    report.score = null;
    report.errorCode = safeError(error);
    report.failedCaseId = activeCaseId;
    await atomicJson(reportPath, report);
    throw new EvaluationError(report.errorCode);
  } finally {
    if (backend) await backend.close();
  }
}
export async function evaluateRetrieval(
  options: Parameters<typeof runEvaluation>[0],
) {
  let result: Awaited<ReturnType<typeof runEvaluation>> | undefined;
  try {
    result = await runEvaluation(options);
  } finally {
    try {
      await options.store.close();
    } catch {
      if (result) {
        result.report.status = "incomplete";
        result.report.score = null;
        result.report.errorCode = "evaluation-store-close-failed";
        await atomicJson(result.reportPath, result.report);
      }
      fail("evaluation-store-close-failed");
    }
  }
  return result!;
}
function cliArgs(args: string[]) {
  const [command, ...rest] = args;
  if (!["preview", "run"].includes(command))
    fail("invalid-evaluation-arguments");
  const values: Record<string, string> = {};
  const allowed = new Set([
    "--gold",
    "--out",
    "--max-inputs",
    "--max-bytes",
    "--at",
    "--label",
  ]);
  let retryUncertain = false;
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (key === "--retry-uncertain") {
      if (retryUncertain) fail("invalid-evaluation-arguments");
      retryUncertain = true;
      continue;
    }
    if (
      !allowed.has(key) ||
      values[key] !== undefined ||
      !rest[i + 1] ||
      rest[i + 1].startsWith("--")
    )
      fail("invalid-evaluation-arguments");
    values[key] = rest[++i];
  }
  if (
    !values["--gold"] ||
    !values["--out"] ||
    !values["--at"] ||
    !/^\d+$/.test(values["--max-inputs"] ?? "") ||
    !/^\d+$/.test(values["--max-bytes"] ?? "") ||
    (command === "run" && !values["--label"])
  )
    fail("explicit-evaluation-options-required");
  return { command, values, retryUncertain };
}
export async function evaluationMain(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
) {
  const { command, values, retryUncertain } = cliArgs(args);
  const at = evaluationInstant(values["--at"]);
  if (
    env.RAG_MAX_COSINE_DISTANCE !== undefined &&
    (!env.RAG_MAX_COSINE_DISTANCE.trim() ||
      Number(env.RAG_MAX_COSINE_DISTANCE) !== EVALUATION_PROTOCOL.maxDistance)
  )
    fail("runtime-cutoff-mismatch");
  const holdoutBytes = await readFile(HOLDOUT_PATH),
    holdoutSha256 = hash(holdoutBytes);
  const cases = parseEvaluationHoldout(
    JSON.parse(holdoutBytes.toString("utf8")) as unknown,
  );
  if (cases.length !== 72) fail("fixed-holdout-count-changed");
  const goldPath = resolve(values["--gold"]),
    goldInfo = await lstat(goldPath);
  if (
    !goldInfo.isFile() ||
    goldInfo.isSymbolicLink() ||
    goldInfo.size > 2 * 1024 * 1024
  )
    fail("invalid-evaluation-file");
  const goldBytes = await readFile(goldPath);
  const gold = parseEvaluationGold(
    JSON.parse(goldBytes.toString("utf8")) as unknown,
    cases,
    holdoutSha256,
  );
  const budget = {
    maxInputs: integer(Number(values["--max-inputs"])),
    maxBytes: integer(Number(values["--max-bytes"])),
  };
  const rawDimensions = env.OPENAI_EMBEDDING_DIMENSIONS;
  if (rawDimensions !== undefined && !/^[1-9]\d{0,4}$/.test(rawDimensions))
    fail("evaluation-profile-mismatch");
  const profile = createEmbeddingProfile({
    model: env.OPENAI_EMBEDDING_MODEL?.trim() || undefined,
    dimensions: rawDimensions === undefined ? undefined : Number(rawDimensions),
  });
  const cache = await EvaluationQueryCache.open(
    resolve(values["--out"]),
    profile,
  );
  try {
    const preview = await cache.preview(
      cases.map((c) => prepareEvidenceQuery(c.question).text),
    );
    if (command === "preview")
      return {
        schemaVersion: 1,
        command,
        readOnlyDatabase: "not-opened",
        generation: "not-run",
        protocol: EVALUATION_PROTOCOL,
        at,
        holdoutSha256,
        goldSha256: hash(goldBytes),
        profile,
        budget,
        preview,
        fitsBudget:
          preview.missingInputs <= budget.maxInputs &&
          preview.missingBytes <= budget.maxBytes,
        requiresExplicitRetry: preview.uncertainInputs > 0,
      };
    if (preview.uncertainInputs && !retryUncertain)
      fail("uncertain-embedding-attempt");
    if (
      preview.missingInputs > budget.maxInputs ||
      preview.missingBytes > budget.maxBytes
    )
      fail("embedding-budget-exhausted");
    const connectionString = env.RAG_EVAL_DATABASE_URL?.trim();
    if (!connectionString) fail("evaluation-database-required");
    if (preview.missingInputs && !env.OPENAI_API_KEY?.trim())
      fail("embedding-key-required");
    // The store's capture/search/assert methods execute REPEATABLE READ READ ONLY transactions.
    // No import session, migration, runtime query cache or writable DB method is exposed here.
    const store = createVectorKnowledgeStore({
      connectionString,
      maxConnections: 1,
      connectionTimeoutMs: 3000,
      statementTimeoutMs: 5000,
    });
    let actual: Embedder | undefined;
    const embedder: Embedder = {
      profile,
      embed: (inputs, call) => {
        actual ??= createOpenAIEmbedder({
          apiKey: env.OPENAI_API_KEY!.trim(),
          profile,
          maxInputs: 1,
          maxInputBytes: 8191,
          maxBatchBytes: 8191,
        });
        return actual.embed(inputs, call);
      },
    };
    const controller = new AbortController(),
      cancel = () => controller.abort();
    process.once("SIGINT", cancel);
    process.once("SIGTERM", cancel);
    try {
      return await evaluateRetrieval({
        cases,
        gold,
        holdoutSha256,
        goldSha256: hash(goldBytes),
        cache,
        embedder,
        store,
        budget,
        retryUncertain,
        at,
        label: values["--label"],
        signal: controller.signal,
      });
    } finally {
      process.off("SIGINT", cancel);
      process.off("SIGTERM", cancel);
    }
  } finally {
    await cache.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  void evaluationMain().then(
    (result) => {
      process.stdout.write(JSON.stringify(result) + "\n");
      if ("report" in result && result.report.score?.passed === false)
        process.exitCode = 2;
    },
    (error: unknown) => {
      // Keys, DB URLs, SQL, upstream responses and stacks never enter CLI output.
      process.stderr.write(JSON.stringify({ error: safeError(error) }) + "\n");
      process.exitCode = 1;
    },
  );
}
