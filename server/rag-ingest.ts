import { createKnowledgeRegistry, validateKnowledgeDatasets, type KnowledgeChunk, type RawKnowledgeChunk } from "./crazy-typka-retrieval";
import { documentEmbeddingInput, embeddingInputHash, type Embedder, type EmbeddingProfile } from "./rag-embeddings";
import { canonicalHash, canonicalJson, sourceVersionId, openRagImportSession, openRagDocumentImportSession, prepareDocumentSnapshot, validateProfile, vectorParameter, RagStoreError, type PreparedCorpus, type PreparedSource, type PreparedDocumentCorpus, type RagDatabaseOptions, type RagImportSession, type RagDocumentImportSession, type RagDocumentImportContext, type LegacySuppression, type LegacyRestore, type StoredSource } from "./rag-vector-store";
import { validateKnowledgeDatasetV3 } from "./rag-document-contract";
import type { KnowledgeDocumentBundleV3 } from "./rag-knowledge-types";

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
    if (profile.inputVersion !== "title-locator-text-v1") throw new Error();
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
  const result: RagImportResult = { revisionId: plan.revisionId, profileId: plan.profile.id, published: false, sources: plan.sources.length, chunks: plan.chunks.length,
    archivedSources: plan.sources.filter((source) => source.metadata.status === "archived").length,
    reusedInputs: 0, embeddedInputs: 0, embeddingCalls: 0, embeddingInputBytes: 0, promptTokens: 0, totalTokens: 0 };
  return importWithSession(plan, session, options, result);
}
type EmbeddingPlan = Pick<PreparedDocumentCorpus, "revisionId" | "profile" | "inputs">;
type ImportRunnerSession<P extends EmbeddingPlan> = Pick<RagImportSession, "cached" | "uncertain" | "startAttempt" | "completeAttempt" | "failAttempt"> & {
  prepare(plan: P): Promise<"building" | "ready">; publish(plan: P): Promise<void>;
};
async function importWithSession<P extends EmbeddingPlan, R extends RagImportResult>(plan: P, session: ImportRunnerSession<P>, options: AlgorithmOptions, result: R): Promise<R> {
  options = Object.freeze({ embedder: options.embedder, maxEmbeddingInputs: options.maxEmbeddingInputs, maxEmbeddingBytes: options.maxEmbeddingBytes,
    retryUncertain: options.retryUncertain, signal: options.signal });
  if (options.retryUncertain !== undefined && typeof options.retryUncertain !== "boolean") throw new RagImportError("invalid-import-data");
  if (![options.maxEmbeddingInputs, options.maxEmbeddingBytes].every((limit) => Number.isSafeInteger(limit) && limit >= 0)
    || options.maxEmbeddingInputs > 10000 || options.maxEmbeddingBytes > 64 * 1024 * 1024) throw new RagImportError("embedding-budget");
  validateProfile(options.embedder.profile);
  if (canonicalJson(options.embedder.profile) !== canonicalJson(plan.profile)) throw new RagImportError("invalid-import-data");
  const signal = options.signal ?? new AbortController().signal;
  const checkAbort = () => { if (signal.aborted) throw new RagImportError("aborted"); };
  checkAbort();
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

export type RagDocumentChangeSet = Readonly<{
  collection: "current" | "archive";
  expectedSnapshotId: string | null;
  upserts: readonly KnowledgeDocumentBundleV3[];
  retireSourceVersionIds?: readonly string[];
  legacyReplacements?: readonly Readonly<{ legacySourceVersionId: string; documentSourceVersionId: string }>[];
  restoreLegacySourceVersionIds?: readonly string[];
}>;
export type RagDocumentImportResult = RagImportResult & {
  collection: "current" | "archive"; blocks: number; logicalSources: number;
  suppressedLegacySources: number; restoredLegacySources: number;
};
export type RagDocumentImportOptions = RagDatabaseOptions & AlgorithmOptions & { changes: RagDocumentChangeSet };
function documentChangeIds(value: unknown): readonly string[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 4096 || value.some((id) => typeof id !== "string" || !/^[0-9a-f]{64}$/.test(id)) || new Set(value).size !== value.length) throw new Error();
  return Object.freeze(value.map((id) => String(id)));
}
export function parseDocumentChangeSet(value: unknown): RagDocumentChangeSet {
  try {
    if (!object(value) || Object.keys(value).some((key) => !["collection", "expectedSnapshotId", "upserts", "retireSourceVersionIds", "legacyReplacements", "restoreLegacySourceVersionIds"].includes(key))
      || (value.collection !== "current" && value.collection !== "archive")
      || !(value.expectedSnapshotId === null || (typeof value.expectedSnapshotId === "string" && /^[0-9a-f]{64}$/.test(value.expectedSnapshotId)))
      || !Array.isArray(value.upserts) || value.upserts.length > 1024) throw new Error();
    const upserts: KnowledgeDocumentBundleV3[] = value.upserts.map((bundle) => {
      if (!object(bundle) || Object.keys(bundle).sort().join(",") !== "blocks,chunks,document") throw new Error();
      const data = validateKnowledgeDatasetV3({ version: 3, documents: [bundle.document], blocks: bundle.blocks, chunks: bundle.chunks });
      return Object.freeze({ document: data.documents[0], blocks: data.blocks, chunks: data.chunks });
    });
    const replacements: { legacySourceVersionId: string; documentSourceVersionId: string }[] = [];
    if (value.legacyReplacements !== undefined) {
      if (!Array.isArray(value.legacyReplacements) || value.legacyReplacements.length > 4096) throw new Error();
      for (const entry of value.legacyReplacements) {
        if (!object(entry) || Object.keys(entry).sort().join(",") !== "documentSourceVersionId,legacySourceVersionId"
          || typeof entry.legacySourceVersionId !== "string" || !/^[0-9a-f]{64}$/.test(entry.legacySourceVersionId)
          || typeof entry.documentSourceVersionId !== "string" || !/^[0-9a-f]{64}$/.test(entry.documentSourceVersionId)) throw new Error();
        replacements.push(Object.freeze({ legacySourceVersionId: entry.legacySourceVersionId, documentSourceVersionId: entry.documentSourceVersionId }));
      }
    }
    if (new Set(replacements.map((entry) => entry.legacySourceVersionId)).size !== replacements.length) throw new Error();
    return Object.freeze({ collection: value.collection, expectedSnapshotId: value.expectedSnapshotId, upserts: Object.freeze(upserts),
      retireSourceVersionIds: documentChangeIds(value.retireSourceVersionIds), legacyReplacements: Object.freeze(replacements), restoreLegacySourceVersionIds: documentChangeIds(value.restoreLegacySourceVersionIds) });
  } catch { throw new RagImportError("invalid-import-data"); }
}
/** A change set never treats missing/failed documents as deletions. */
export function prepareDocumentChanges(context: RagDocumentImportContext, input: RagDocumentChangeSet, profile: EmbeddingProfile, now = Date.now()): PreparedDocumentCorpus {
  try {
    const changes = parseDocumentChangeSet(input);
    if (context.collection !== changes.collection || !Number.isFinite(now)) throw new Error();
    if (changes.expectedSnapshotId !== (context.snapshot?.id ?? null)) throw new RagStoreError("revision-conflict");
    const old = validateKnowledgeDatasetV3(context.dataset), upserts = validateKnowledgeDatasetV3({ version: 3,
      documents: changes.upserts.map((bundle) => bundle.document), blocks: changes.upserts.flatMap((bundle) => bundle.blocks), chunks: changes.upserts.flatMap((bundle) => bundle.chunks) });
    const retired = changes.retireSourceVersionIds ?? [], restored = changes.restoreLegacySourceVersionIds ?? [];
    const replacements = changes.legacyReplacements ?? [];
    if (changes.collection === "archive" && (replacements.length || restored.length)) throw new Error();
    const keep = new Set(old.documents.map((doc) => doc.sourceVersionId));
    for (const id of retired) {
      if (!keep.delete(id) || upserts.documents.some((doc) => doc.sourceVersionId === id)) throw new Error();
    }
    if (changes.collection === "current") for (const next of upserts.documents) for (const previous of old.documents) {
      if (next.id === previous.id) { if (next.authority !== previous.authority) throw new Error(); keep.delete(previous.sourceVersionId); }
    }
    else for (const next of upserts.documents) keep.delete(next.sourceVersionId);
    const dataset = { version: 3, documents: [...old.documents.filter((doc) => keep.has(doc.sourceVersionId)), ...upserts.documents],
      blocks: [...old.blocks.filter((block) => keep.has(block.sourceVersionId)), ...upserts.blocks],
      chunks: [...old.chunks.filter((chunk) => keep.has(chunk.sourceVersionId)), ...upserts.chunks] };
    const suppression = new Map(context.suppressions.map((entry) => [entry.legacySourceId, entry])), restores: LegacyRestore[] = [];
    for (const id of restored) {
      const live = context.legacySources.find((entry) => entry.sourceVersionId === id);
      if (!live || !suppression.has(live.document.id)) throw new RagStoreError("revision-conflict");
      suppression.delete(live.document.id); restores.push({ legacySourceId: live.document.id, legacySourceVersionId: id });
    }
    const introduced: string[] = [];
    for (const replacement of replacements) {
      const live = context.legacySources.find((entry) => entry.sourceVersionId === replacement.legacySourceVersionId);
      const target = dataset.documents.find((doc) => doc.sourceVersionId === replacement.documentSourceVersionId);
      if (!live || !target || target.status !== "current" || target.authority !== live.document.authority || restores.some((entry) => entry.legacySourceId === live.document.id)
        || !dataset.chunks.some((chunk) => chunk.sourceVersionId === target.sourceVersionId)
        || now < Date.parse(target.checkedAt + "T00:00:00Z") || now >= Date.parse(target.reviewAfter + "T00:00:00Z")
        || (target.effectiveFrom !== null && now < Date.parse(target.effectiveFrom)) || (target.effectiveUntil !== null && now >= Date.parse(target.effectiveUntil))) throw new Error();
      const value: LegacySuppression = { legacySourceId: live.document.id, legacySourceVersionId: live.sourceVersionId, documentSourceVersionId: target.sourceVersionId };
      if (canonicalJson(suppression.get(value.legacySourceId) ?? null) !== canonicalJson(value)) introduced.push(value.legacySourceVersionId);
      suppression.set(value.legacySourceId, value);
    }
    return prepareDocumentSnapshot({ collection: changes.collection, baseSnapshot: context.snapshot, dataset, profile, suppressions: [...suppression.values()], restores,
      upsertSourceVersionIds: upserts.documents.map((doc) => doc.sourceVersionId), retireSourceVersionIds: retired, promotionLegacySourceVersionIds: introduced });
  } catch (error) {
    if (error instanceof RagStoreError && ["revision-conflict", "profile-conflict"].includes(error.code)) throw error;
    throw new RagImportError("invalid-import-data");
  }
}
export async function importDocumentChanges(options: RagDocumentImportOptions): Promise<RagDocumentImportResult> {
  const changes = parseDocumentChangeSet(options.changes);
  const session = await openRagDocumentImportSession(options, options.signal);
  try {
    const context = await session.context(changes.collection);
    return await importPreparedDocumentCorpus(prepareDocumentChanges(context, changes, options.embedder.profile), session, options);
  } finally { await session.close(); }
}
export async function importPreparedDocumentCorpus(input: PreparedDocumentCorpus, session: RagDocumentImportSession, options: AlgorithmOptions): Promise<RagDocumentImportResult> {
  const plan = prepareDocumentSnapshot(input);
  if (canonicalJson(plan) !== canonicalJson(input)) throw new RagImportError("invalid-import-data");
  const result: RagDocumentImportResult = { revisionId: plan.revisionId, profileId: plan.profile.id, published: false, sources: plan.dataset.documents.length,
    chunks: plan.chunks.length, archivedSources: plan.collection === "archive" ? plan.dataset.documents.length : 0, reusedInputs: 0, embeddedInputs: 0,
    embeddingCalls: 0, embeddingInputBytes: 0, promptTokens: 0, totalTokens: 0, collection: plan.collection, blocks: plan.dataset.blocks.length,
    logicalSources: new Set(plan.dataset.documents.map((doc) => doc.id)).size, suppressedLegacySources: plan.suppressions.length, restoredLegacySources: plan.restores.length };
  return importWithSession(plan, session, options, result);
}
