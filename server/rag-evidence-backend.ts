import {
  CRAZY_TYPKA_LIMITS,
  CURRENT_KNOWLEDGE_SCOPE,
  crazyTypkaScopeKey,
  isCrazyTypkaKnowledgeScope,
  mergeCrazyTypkaSources,
  type CrazyTypkaKnowledgeScope,
  type CrazyTypkaErrorCode,
} from "../shared/crazy-typka";
import type { EvidenceKnowledgeChunk } from "./rag-knowledge-types";
import { isKnowledgeCurrent } from "./crazy-typka-retrieval";
import {
  CRAZY_TYPKA_EVIDENCE_BYTES,
  crazyTypkaEvidencePayload,
} from "./crazy-typka-provider";
import {
  createEmbeddingProfile,
  createOpenAIEmbedder,
  EmbeddingError,
  type Embedder,
  type EmbeddingProfile,
} from "./rag-embeddings";
import {
  createVectorKnowledgeStore,
  type RagSearchSnapshot,
  type RagSourceDependency,
  type RagVectorStore,
} from "./rag-vector-store";

export class RagEvidenceError extends Error {
  readonly code: CrazyTypkaErrorCode;
  constructor(code: CrazyTypkaErrorCode) {
    const safe = [
      "invalid-request",
      "unavailable",
      "provider-unavailable",
      "cancelled",
      "request-timeout",
      "invalid-response",
      "response-expired",
      "budget-exhausted",
      "rate-limited",
    ].includes(code)
      ? code
      : "provider-unavailable";
    super(safe);
    this.code = safe;
  }
}
export type PreparedEvidenceQuery = Readonly<{
  text: string;
  filterText: string;
}>;
export type EvidenceSnapshot = Readonly<{
  snapshot: RagSearchSnapshot | null;
  scope: CrazyTypkaKnowledgeScope;
  chunks: readonly EvidenceKnowledgeChunk[];
  dependencies: readonly RagSourceDependency[];
  embeddingUsage: Readonly<{ promptTokens: number; totalTokens: number }>;
}>;
export type AsyncEvidenceBackend = {
  readonly profile: EmbeddingProfile;
  ready(signal?: AbortSignal): Promise<boolean>;
  search(
    query: PreparedEvidenceQuery,
    options: {
      signal: AbortSignal;
      now: number;
      user: string;
      scope?: CrazyTypkaKnowledgeScope;
      onEmbeddingAttempt: (inputBytes: number) => void;
      onEmbeddingUsage?: (usage: {
        promptTokens: number;
        totalTokens: number;
      }) => void;
    },
  ): Promise<EvidenceSnapshot>;
  validate(
    evidence: EvidenceSnapshot,
    now: number,
    signal: AbortSignal,
  ): Promise<boolean>;
  close(): Promise<void>;
};

function normalized(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
function isFollowUp(value: string) {
  return (
    value.length <= 160 &&
    (/^(?:a )?(?:kolik(?: to)? stoji|kolik|kde (?:to|ho|ji) najdu|kde to je|jak se tam dostanu|jaka je oteviraci doba|jaka jsou pravidla|a co cena)[?!.]*$/.test(
      normalized(value),
    ) ||
      /^(?:and )?(?:how much (?:does (?:it|that) cost|is (?:it|that))|where (?:is (?:it|that)|can i find (?:it|that))|how (?:do|can) i get there|what (?:are the (?:opening hours|rules)|about the price))[?!.]*$/.test(
        normalized(value),
      ))
  );
}
function truncateUtf8(text: string, bytes: number) {
  let result = "",
    used = 0;
  for (const character of text) {
    const size = Buffer.byteLength(character, "utf8");
    if (used + size > bytes) break;
    result += character;
    used += size;
  }
  return result;
}
/** The returned exact text is moderated before any embedding call. Only a successful USER turn may be supplied. */
export function prepareEvidenceQuery(
  message: string,
  previousSuccessfulUser?: string,
): PreparedEvidenceQuery {
  if (!message.trim() || Buffer.byteLength(message, "utf8") > 8191)
    throw new RagEvidenceError("invalid-request");
  if (!previousSuccessfulUser || !isFollowUp(message))
    return Object.freeze({ text: message, filterText: message });
  const prefix = "Previous successful user question:\n",
    separator = "\nCurrent user question:\n";
  const remaining =
    8191 - Buffer.byteLength(prefix + separator + message, "utf8");
  if (remaining <= 0)
    return Object.freeze({ text: message, filterText: message });
  const previous = truncateUtf8(previousSuccessfulUser, remaining);
  return Object.freeze({
    text: prefix + previous + separator + message,
    filterText: previous,
  });
}

function sameSpace(
  actual: RagSearchSnapshot["embeddingSpace"],
  expected: EmbeddingProfile,
) {
  return (
    actual.provider === expected.provider &&
    actual.model === expected.model &&
    actual.dimensions === expected.dimensions
  );
}
/** Final synchronous clock guard, after the asynchronous snapshot validation. */
export function isEvidenceCurrent(
  evidence: EvidenceSnapshot,
  instant: number,
): boolean {
  return evidence.chunks.every(({ document }) => {
    if (!isKnowledgeCurrent(document.checkedAt, document.reviewAfter, instant))
      return false;
    if (evidence.scope.kind === "current")
      return (
        document.status === "current" &&
        (document.effectiveFrom === null ||
          instant >= Date.parse(document.effectiveFrom)) &&
        (document.effectiveUntil === null ||
          instant < Date.parse(document.effectiveUntil))
      );
    if (document.status !== "archived") return false;
    if (evidence.scope.asOf === undefined) return true;
    const at = Date.parse(evidence.scope.asOf);
    return (
      document.effectiveFrom !== null &&
      document.effectiveUntil !== null &&
      at >= Date.parse(document.effectiveFrom) &&
      at < Date.parse(document.effectiveUntil)
    );
  });
}
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new RagEvidenceError("cancelled"));
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup();
      reject(new RagEvidenceError("cancelled"));
    };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}

export function createRagEvidenceBackend(options: {
  store: Pick<
    RagVectorStore,
    "captureSearch" | "searchSnapshot" | "assertSnapshot" | "close"
  >;
  embedder: Embedder;
  maxDistance?: number;
  timeoutMs?: number;
  now?: () => number;
}): AsyncEvidenceBackend {
  const { store, embedder } = options;
  // Calibrated on the approved Czech corpus and separate CZ/EN paraphrases.
  // Keep a conservative cutoff; a nearest neighbour is not always evidence.
  const maxDistance =
    options.maxDistance === undefined ? 0.6 : options.maxDistance;
  if (
    maxDistance !== undefined &&
    (!Number.isFinite(maxDistance) || maxDistance < 0 || maxDistance > 2)
  )
    throw new RagEvidenceError("unavailable");
  const timeoutMs = options.timeoutMs ?? 30000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)
    throw new RagEvidenceError("unavailable");
  const now = options.now ?? Date.now;
  let closed = false;
  let closing: Promise<void> | undefined;
  const active = new Set<AbortController>(),
    pending = new Set<Promise<unknown>>();
  let readiness: { until: number; ready: boolean } | undefined,
    checking: Promise<boolean> | undefined;
  function operation<T>(
    action: (signal: AbortSignal) => Promise<T>,
    parent?: AbortSignal,
  ): Promise<T> {
    if (closed || parent?.aborted)
      return Promise.reject(new RagEvidenceError("cancelled"));
    const controller = new AbortController();
    active.add(controller);
    let timedOut = false;
    const abort = () => controller.abort();
    parent?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    timer.unref();
    const work = (async () => {
      try {
        return await waitFor(action(controller.signal), controller.signal);
      } catch (error) {
        readiness = undefined;
        if (timedOut) throw new RagEvidenceError("request-timeout");
        if (controller.signal.aborted) throw new RagEvidenceError("cancelled");
        if (error instanceof RagEvidenceError) throw error;
        if (
          error instanceof EmbeddingError &&
          [
            "request-timeout",
            "cancelled",
            "rate-limited",
            "invalid-response",
          ].includes(error.code)
        )
          throw new RagEvidenceError(error.code as CrazyTypkaErrorCode);
        throw new RagEvidenceError("provider-unavailable");
      } finally {
        clearTimeout(timer);
        parent?.removeEventListener("abort", abort);
        controller.abort();
        active.delete(controller);
      }
    })();
    pending.add(work);
    void work.finally(() => pending.delete(work)).catch(() => {});
    return work;
  }
  async function capture(scope: CrazyTypkaKnowledgeScope, signal: AbortSignal) {
    const snapshot = await store.captureSearch(scope, signal);
    if (closed || signal.aborted) throw new RagEvidenceError("cancelled");
    if (
      snapshot &&
      (!sameSpace(snapshot.embeddingSpace, embedder.profile) ||
        crazyTypkaScopeKey(snapshot.scope) !== crazyTypkaScopeKey(scope))
    )
      throw new RagEvidenceError("provider-unavailable");
    return snapshot;
  }
  return {
    profile: embedder.profile,
    async ready(signal) {
      if (closed) return false;
      if (readiness && now() < readiness.until) return readiness.ready;
      if (!checking) {
        checking = operation(async (ownSignal) => {
          return !!(await capture(CURRENT_KNOWLEDGE_SCOPE, ownSignal));
        })
          .catch(() => false)
          .then((value) => {
            readiness = { ready: value, until: now() + 2000 };
            return value;
          })
          .finally(() => {
            checking = undefined;
          });
      }
      return waitFor(checking, signal);
    },
    search(query, input) {
      const requested = input.scope ?? CURRENT_KNOWLEDGE_SCOPE;
      if (!isCrazyTypkaKnowledgeScope(requested))
        return Promise.reject(new RagEvidenceError("invalid-request"));
      const scope = Object.freeze({ ...requested });
      return operation(async (signal) => {
        const snapshot = await capture(scope, signal);
        if (!snapshot) {
          if (scope.kind === "current")
            throw new RagEvidenceError("provider-unavailable");
          return Object.freeze({
            snapshot: null,
            scope,
            chunks: Object.freeze([]),
            dependencies: Object.freeze([]),
            embeddingUsage: Object.freeze({ promptTokens: 0, totalTokens: 0 }),
          });
        }
        const embedded = await embedder.embed([query.text], {
          signal,
          user: input.user,
          onAttempt: input.onEmbeddingAttempt,
        });
        if (closed || signal.aborted) throw new RagEvidenceError("cancelled");
        input.onEmbeddingUsage?.(embedded.usage);
        const hits = await store.searchSnapshot(
          snapshot,
          embedded.vectors[0],
          { limit: CRAZY_TYPKA_LIMITS.sources, now: input.now },
          signal,
        );
        if (closed || signal.aborted) throw new RagEvidenceError("cancelled");
        const eligible = hits
          .filter((hit) => {
            if (
              !Number.isFinite(hit.distance) ||
              hit.distance < 0 ||
              hit.distance > 2
            )
              throw new RagEvidenceError("invalid-response");
            return maxDistance === undefined || hit.distance <= maxDistance;
          })
          .slice(0, CRAZY_TYPKA_LIMITS.sources);
        const selected: typeof eligible = [];
        for (const hit of eligible) {
          const candidate = [...selected, hit].map((item) => item.chunk);
          if (
            Buffer.byteLength(
              JSON.stringify(crazyTypkaEvidencePayload(candidate)),
              "utf8",
            ) <= CRAZY_TYPKA_EVIDENCE_BYTES &&
            mergeCrazyTypkaSources(candidate.map((chunk) => chunk.source)) !==
              null
          )
            selected.push(hit);
        }
        if (
          new Set(selected.map((hit) => hit.chunk.id)).size !== selected.length
        )
          throw new RagEvidenceError("invalid-response");
        const dependencies = [
          ...new Map(
            selected.map((hit) => [
              `${hit.dependency.head}:${hit.dependency.sourceVersionId}`,
              Object.freeze({ ...hit.dependency }),
            ]),
          ).values(),
        ];
        if (
          !(await store.assertSnapshot(
            snapshot,
            dependencies,
            input.now,
            signal,
          ))
        )
          throw new RagEvidenceError("response-expired");
        return Object.freeze({
          snapshot,
          scope,
          chunks: Object.freeze(selected.map((hit) => hit.chunk)),
          dependencies: Object.freeze(dependencies),
          embeddingUsage: Object.freeze(embedded.usage),
        });
      }, input.signal);
    },
    validate(evidence, instant, signal) {
      return operation(async (ownSignal) => {
        if (!isCrazyTypkaKnowledgeScope(evidence.scope)) return false;
        if (!evidence.snapshot)
          return (
            evidence.scope.kind === "archive" &&
            !evidence.chunks.length &&
            !evidence.dependencies.length &&
            (await capture(evidence.scope, ownSignal)) === null
          );
        return (
          sameSpace(evidence.snapshot.embeddingSpace, embedder.profile) &&
          crazyTypkaScopeKey(evidence.snapshot.scope) ===
            crazyTypkaScopeKey(evidence.scope) &&
          isEvidenceCurrent(evidence, instant) &&
          (await store.assertSnapshot(
            evidence.snapshot,
            evidence.dependencies,
            instant,
            ownSignal,
          ))
        );
      }, signal);
    },
    close() {
      if (!closing) {
        closed = true;
        readiness = undefined;
        for (const controller of active) controller.abort();
        closing = (async () => {
          await Promise.allSettled([...pending]);
          await store.close();
        })();
      }
      return closing;
    },
  };
}

export function createConfiguredEvidenceBackend(
  env: NodeJS.ProcessEnv,
  fetcher?: typeof fetch,
): AsyncEvidenceBackend {
  const connectionString = env.RAG_DATABASE_URL?.trim();
  if (!connectionString || !env.OPENAI_API_KEY?.trim())
    throw new RagEvidenceError("unavailable");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw new RagEvidenceError("unavailable");
  const rawDimensions = env.OPENAI_EMBEDDING_DIMENSIONS;
  if (rawDimensions !== undefined && !/^[1-9]\d{0,4}$/.test(rawDimensions))
    throw new RagEvidenceError("unavailable");
  const profile = createEmbeddingProfile({
    model: env.OPENAI_EMBEDDING_MODEL?.trim() || undefined,
    dimensions: rawDimensions === undefined ? undefined : Number(rawDimensions),
  });
  const rawDistance = env.RAG_MAX_COSINE_DISTANCE;
  const maxDistance =
    rawDistance === undefined ? undefined : Number(rawDistance);
  if (
    rawDistance !== undefined &&
    (!rawDistance.trim() ||
      !Number.isFinite(maxDistance) ||
      maxDistance! < 0 ||
      maxDistance! > 2)
  )
    throw new RagEvidenceError("unavailable");
  const embedder = createOpenAIEmbedder({
    apiKey: env.OPENAI_API_KEY!.trim(),
    profile,
    fetch: fetcher,
    maxInputs: 1,
    maxInputBytes: 8191,
    maxBatchBytes: 8191,
  });
  const store = createVectorKnowledgeStore({
    connectionString,
    maxConnections: 4,
    connectionTimeoutMs: 3000,
    statementTimeoutMs: 3000,
  });
  return createRagEvidenceBackend({ store, embedder, maxDistance });
}
