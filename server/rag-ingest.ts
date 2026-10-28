import { createKnowledgeRegistry, validateKnowledgeDatasets, type KnowledgeChunk, type RawKnowledgeChunk } from "./crazy-typka-retrieval";
import { documentEmbeddingInput, embeddingInputHash, type Embedder, type EmbeddingProfile } from "./rag-embeddings";
import { canonicalHash, canonicalJson, sourceVersionId, openRagImportSession, validateProfile, vectorParameter, type PreparedCorpus, type PreparedSource, type RagDatabaseOptions, type RagImportSession, type StoredSource } from "./rag-vector-store";

export class RagImportError extends Error {
  constructor(readonly code: "invalid-import-data" | "embedding-budget" | "uncertain-embedding-attempt" | "invalid-embedding-result" | "embedding-failed" | "aborted") { super(code); }
}
const sourceFields = new Set(["id", "title", "url", "discoveryUrl", "authority", "status", "checkedAt", "reviewAfter", "effectiveFrom", "effectiveUntil", "author", "license", "licenseUrl", "sourceUpdatedAt", "documentDate", "authorityLevel", "versionNote"]);
const chunkFields = new Set(["id", "sourceId", "text", "sourceLocator", "topic", "keywords", "contentSha256"]);
function object(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function inputDataset(value: unknown, archived: boolean) {
  if (!object(value) || value.version !== 2 || !Array.isArray(value.sources) || !Array.isArray(value.chunks)
    || Object.keys(value).some((key) => !["version", "sources", "chunks"].includes(key))
    || (archived && value.chunks.length)) throw new Error();
  const sources = value.sources.map((item) => {
    if (!object(item) || item.status !== (archived ? "archived" : "current")
      || Object.keys(item).some((key) => !sourceFields.has(key) && !(archived && key === "archiveReason"))
      || (archived && (typeof item.archiveReason !== "string" || !item.archiveReason.trim() || item.archiveReason.length > 2000))) throw new Error();
    return { ...item };
  });
  for (const item of value.chunks) if (!object(item) || Object.keys(item).some((key) => !chunkFields.has(key))) throw new Error();
  return { version: 2 as const, sources, chunks: value.chunks };
}
/** Immutable approved full snapshot. Only current chunks become embedding inputs. */
export function prepareRagCorpus(currentDatasets: readonly unknown[], archiveDatasets: readonly unknown[], profile: EmbeddingProfile): PreparedCorpus {
  try {
    validateProfile(profile);
    if (!currentDatasets.length || currentDatasets.length > 16 || archiveDatasets.length > 16) throw new Error();
    const current = currentDatasets.map((data) => inputDataset(data, false));
    const archives = archiveDatasets.map((data) => inputDataset(data, true));
    // Reuse all current v2 provenance/date/hash checks; archives never enter the runtime registry.
    const all = validateKnowledgeDatasets([...current, ...archives.map((data) => ({ ...data, sources: data.sources.map(({ archiveReason: _reason, ...metadata }) => ({ ...metadata, status: "current" })) }))]);
    const original = new Map([...current, ...archives].flatMap((data) => data.sources.map((source) => [source.id, source] as const)));
    const sources: PreparedSource[] = all.sources.map((source) => {
      const metadata = original.get(source.id)! as StoredSource;
      const ownChunks = all.chunks.filter((chunk) => chunk.sourceId === source.id).sort((a, b) => a.id.localeCompare(b.id, "en"));
      const contentHash = canonicalHash(ownChunks);
      return { id: sourceVersionId(metadata, contentHash), metadata, contentHash };
    }).sort((a, b) => a.metadata.id.localeCompare(b.metadata.id, "en"));
    // Registry is used only as a validated object constructor during administrative import.
    const registry = createKnowledgeRegistry(current);
    const typed = new Map(registry.chunks.map((chunk) => [chunk.id, chunk]));
    const chunks = all.chunks.map((raw) => {
      const input = documentEmbeddingInput(typed.get(raw.id)!);
      return { raw, input, inputHash: embeddingInputHash(input) };
    }).sort((a, b) => a.raw.id.localeCompare(b.raw.id, "en"));
    const inputs = [...new Map(chunks.map((chunk) => [chunk.inputHash, { input: chunk.input, inputHash: chunk.inputHash }])).values()];
    const manifestHash = canonicalHash({ sources: sources.map((source) => [source.metadata.id, source.id]), chunks: chunks.map((chunk) => [chunk.raw, chunk.inputHash]) });
    return { revisionId: canonicalHash(["revision-v1", profile.id, manifestHash]), manifestHash, profile, sources, chunks, inputs };
  } catch { throw new RagImportError("invalid-import-data"); }
}
export type RagImportResult = {
  revisionId: string; profileId: string; published: boolean; sources: number; chunks: number;
  archivedSources: number; reusedInputs: number; embeddedInputs: number; embeddingCalls: number;
  embeddingInputBytes: number; promptTokens: number; totalTokens: number;
};
export type RagImportOptions = RagDatabaseOptions & {
  currentDatasets: readonly unknown[]; archiveDatasets: readonly unknown[]; embedder: Embedder;
  maxEmbeddingInputs: number; maxEmbeddingBytes: number; retryUncertain?: boolean;
  signal?: AbortSignal;
};
type AlgorithmOptions = Pick<RagImportOptions, "embedder" | "maxEmbeddingInputs" | "maxEmbeddingBytes" | "retryUncertain" | "signal">;
export async function importRagCorpus(options: RagImportOptions): Promise<RagImportResult> {
  const plan = prepareRagCorpus(options.currentDatasets, options.archiveDatasets, options.embedder.profile);
  const session = await openRagImportSession(options, options.signal);
  try { return await importPreparedCorpus(plan, session, options); }
  finally { await session.close(); }
}
/** The injected session allows deterministic algorithm/failure tests without a DB or API. */
export async function importPreparedCorpus(plan: PreparedCorpus, session: RagImportSession, options: AlgorithmOptions): Promise<RagImportResult> {
  if (![options.maxEmbeddingInputs, options.maxEmbeddingBytes].every((limit) => Number.isSafeInteger(limit) && limit >= 0)
    || options.maxEmbeddingInputs > 10000 || options.maxEmbeddingBytes > 64 * 1024 * 1024) throw new RagImportError("embedding-budget");
  validateProfile(options.embedder.profile);
  if (canonicalJson(options.embedder.profile) !== canonicalJson(plan.profile)) throw new RagImportError("invalid-import-data");
  const signal = options.signal ?? new AbortController().signal;
  const checkAbort = () => { if (signal.aborted) throw new RagImportError("aborted"); };
  checkAbort();
  const result: RagImportResult = { revisionId: plan.revisionId, profileId: plan.profile.id, published: false, sources: plan.sources.length, chunks: plan.chunks.length,
    archivedSources: plan.sources.filter((source) => source.metadata.status === "archived").length,
    reusedInputs: 0, embeddedInputs: 0, embeddingCalls: 0, embeddingInputBytes: 0, promptTokens: 0, totalTokens: 0 };
  const state = await session.prepare(plan);
  if (state === "ready") { await session.publish(plan); result.published = true; result.reusedInputs = plan.inputs.length; return result; }
  const cached = await session.cached(plan.profile, plan.inputs);
  const missing = plan.inputs.filter((input) => !cached.has(input.inputHash)); result.reusedInputs = cached.size;
  const uncertain = new Set(await session.uncertain(plan.profile));
  if (!options.retryUncertain && missing.some((input) => uncertain.has(input.inputHash))) throw new RagImportError("uncertain-embedding-attempt");
  const bytes = missing.reduce((total, item) => total + Buffer.byteLength(item.input, "utf8"), 0);
  if (missing.length > options.maxEmbeddingInputs || bytes > options.maxEmbeddingBytes) throw new RagImportError("embedding-budget");
  const batches: typeof missing[] = [];
  for (const input of missing) {
    if (Buffer.byteLength(input.input, "utf8") > 8191) throw new RagImportError("embedding-budget");
    let batch = batches.at(-1);
    if (!batch || batch.length >= 32 || batch.reduce((sum, item) => sum + Buffer.byteLength(item.input, "utf8"), 0) + Buffer.byteLength(input.input, "utf8") > 65536) { batch = []; batches.push(batch); }
    batch.push(input);
  }
  for (const batch of batches) {
    checkAbort();
    const attemptId = await session.startAttempt(plan, batch.map((input) => input.inputHash));
    let attempted = false;
    try {
      const answer = await options.embedder.embed(batch.map((input) => input.input), { signal, onAttempt(inputBytes) {
        if (attempted || inputBytes !== batch.reduce((total, item) => total + Buffer.byteLength(item.input, "utf8"), 0)) throw new RagImportError("invalid-embedding-result");
        checkAbort(); attempted = true; result.embeddingCalls++; result.embeddingInputBytes += inputBytes;
      } });
      if (!attempted || answer.vectors.length !== batch.length || !Number.isSafeInteger(answer.usage.promptTokens) || answer.usage.promptTokens < 0
        || !Number.isSafeInteger(answer.usage.totalTokens) || answer.usage.totalTokens < answer.usage.promptTokens) throw new RagImportError("invalid-embedding-result");
      const entries = batch.map((input, index) => { vectorParameter(answer.vectors[index], plan.profile.dimensions); return { ...input, vector: answer.vectors[index] }; });
      checkAbort(); await session.completeAttempt(attemptId, plan.profile, entries, answer.usage);
      result.embeddedInputs += entries.length; result.promptTokens += answer.usage.promptTokens; result.totalTokens += answer.usage.totalTokens;
    } catch (error) {
      try { await session.failAttempt(attemptId, attempted); } catch { /* persisted inflight becomes uncertain on restart */ }
      if (error instanceof RagImportError) throw error;
      if (signal.aborted) throw new RagImportError("aborted");
      throw new RagImportError("embedding-failed");
    }
  }
  checkAbort(); await session.publish(plan); result.published = true; return result;
}
