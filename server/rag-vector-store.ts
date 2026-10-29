import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { documentEmbeddingInput, documentEmbeddingInputV3, embeddingInputHash, validateEmbeddingProfile, type EmbeddingProfile } from "./rag-embeddings";
import { validateKnowledgeDatasets, type KnowledgeAuthority, type KnowledgeChunk, type KnowledgeDocument, type KnowledgeTopic, type RawKnowledgeChunk } from "./crazy-typka-retrieval";
import { DOCUMENT_VALIDATION_LIMITS, resolveKnowledgeChunkV3, validateKnowledgeDatasetV3, validateKnowledgeDocumentV3 } from "./rag-document-contract";
import type { EvidenceKnowledgeChunk, KnowledgeDatasetV3, KnowledgeDocumentV3, KnowledgeChunkV3 } from "./rag-knowledge-types";
import { RAG_PUBLISHERS, isRagInstant, type PublisherId } from "../shared/rag-provenance";

export type RagSnapshot = { revisionId: string; profile: EmbeddingProfile };
export type VectorHit = { chunk: KnowledgeChunk; sourceVersionId: string; distance: number };
export type VectorKnowledgeStore = {
  captureActive(signal?: AbortSignal): Promise<RagSnapshot | null>;
  search(snapshot: RagSnapshot, queryVector: readonly number[], filters: { authority?: KnowledgeAuthority; topics?: readonly KnowledgeTopic[]; limit: number; now?: number }, signal?: AbortSignal): Promise<readonly VectorHit[]>;
  assertCurrent(snapshot: RagSnapshot, sourceVersionIds: readonly string[], now?: number, signal?: AbortSignal): Promise<boolean>;
  close(): Promise<void>;
};
export type KnowledgeScope = Readonly<{ kind: "current" } | { kind: "archive"; asOf?: string }>;
export type RagHeadName = "public" | "public-documents" | "public-archive";
export type RagHeadRef = Readonly<{ name: RagHeadName; revisionId: string; profile: EmbeddingProfile }>;
export type RagSearchSnapshot = Readonly<{
  id: string; scope: KnowledgeScope;
  heads: Readonly<{ legacy: RagHeadRef | null; documents: RagHeadRef | null; archive: RagHeadRef | null }>;
  embeddingSpace: Readonly<{ provider: "openai"; model: string; dimensions: number }>;
}>;
export type RagSourceDependency = Readonly<{ head: RagHeadName; sourceVersionId: string }>;
export type RagSearchHit = Readonly<{ chunk: EvidenceKnowledgeChunk; dependency: RagSourceDependency; distance: number }>;
export type RagVectorStore = VectorKnowledgeStore & {
  captureSearch(scope: KnowledgeScope, signal?: AbortSignal): Promise<RagSearchSnapshot | null>;
  searchSnapshot(snapshot: RagSearchSnapshot, vector: readonly number[], filters: { authority?: PublisherId; limit: number; now?: number }, signal?: AbortSignal): Promise<readonly RagSearchHit[]>;
  assertSnapshot(snapshot: RagSearchSnapshot, dependencies: readonly RagSourceDependency[], now?: number, signal?: AbortSignal): Promise<boolean>;
};
export type RagDatabaseOptions = { connectionString: string; connectionTimeoutMs?: number; statementTimeoutMs?: number; maxConnections?: number };
export class RagStoreError extends Error {
  constructor(readonly code: "database-unavailable" | "unsafe-database-logging" | "invalid-database-data" | "invalid-vector" | "aborted" | "closed" | "import-busy" | "revision-conflict" | "invalid-schema" | "profile-conflict") { super(code); }
}
export type SqlResult = { rows: Record<string, unknown>[]; rowCount?: number | null };
export type RagSqlClient = {
  query(text: string, values?: unknown[]): Promise<SqlResult>;
  release(destroy?: boolean): void;
  on?(event: "error", callback: () => void): unknown;
  off?(event: "error", callback: () => void): unknown;
};
export type RagSqlPool = { connect(): Promise<RagSqlClient>; end(): Promise<void>; on?(event: "error", callback: () => void): unknown };
const hashPattern = /^[a-f0-9]{64}$/;
const topics = new Set<KnowledgeTopic>(["membership", "network", "office", "projects", "sport", "documents", "housing", "housing-payments", "housing-arrival", "housing-termination", "housing-maintenance", "dining", "photography", "printing", "game-room"]);
export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b, "en")).map(([key, child]) => [key, normalize(child)]));
    return item;
  };
  return JSON.stringify(normalize(value));
}
export const canonicalHash = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");
export type StoredSource = Omit<KnowledgeDocument, "status"> & { status: "current" | "archived"; archiveReason?: string };
export const sourceVersionId = (metadata: StoredSource, contentHash: string) => canonicalHash(["source-v1", metadata, contentHash]);
export type PreparedSource = { id: string; metadata: StoredSource; contentHash: string };
export type PreparedChunk = { raw: RawKnowledgeChunk; input: string; inputHash: string };
export type PreparedCorpus = { revisionId: string; manifestHash: string; profile: EmbeddingProfile; sources: PreparedSource[]; chunks: PreparedChunk[]; inputs: { input: string; inputHash: string }[] };
export type LegacySuppression = Readonly<{ legacySourceId: string; legacySourceVersionId: string; documentSourceVersionId: string }>;
export type LegacyRestore = Readonly<{ legacySourceId: string; legacySourceVersionId: string }>;
export type RagDocumentImportContext = Readonly<{
  collection: "current" | "archive"; snapshot: RagSearchSnapshot | null; dataset: KnowledgeDatasetV3;
  suppressions: readonly LegacySuppression[];
  legacySources: readonly Readonly<{ sourceVersionId: string; document: KnowledgeDocument }>[];
}>;
export type PreparedDocumentCorpus = Readonly<{
  kind: "documents"; collection: "current" | "archive"; baseSnapshot: RagSearchSnapshot | null;
  revisionId: string; manifestHash: string; profile: EmbeddingProfile; dataset: KnowledgeDatasetV3;
  suppressions: readonly LegacySuppression[]; restores: readonly LegacyRestore[];
  upsertSourceVersionIds: readonly string[]; retireSourceVersionIds: readonly string[]; promotionLegacySourceVersionIds: readonly string[];
  chunks: readonly Readonly<{ raw: KnowledgeChunkV3; input: string; inputHash: string }>[];
  inputs: readonly Readonly<{ input: string; inputHash: string }>[];
}>;
export type RagDocumentImportSession = Pick<RagImportSession, "cached" | "uncertain" | "startAttempt" | "completeAttempt" | "failAttempt" | "close"> & {
  context(collection: "current" | "archive"): Promise<RagDocumentImportContext>;
  prepare(plan: PreparedDocumentCorpus): Promise<"building" | "ready">;
  publish(plan: PreparedDocumentCorpus): Promise<void>;
};

export function canonicalDocumentDataset(value: unknown): KnowledgeDatasetV3 {
  const data = validateKnowledgeDatasetV3(value);
  const documents = [...data.documents].sort((a, b) => a.sourceVersionId.localeCompare(b.sourceVersionId, "en"));
  const blocks = new Map(documents.map((doc) => [doc.sourceVersionId, [] as (typeof data.blocks[number])[]]));
  const chunks = new Map(documents.map((doc) => [doc.sourceVersionId, [] as KnowledgeChunkV3[]]));
  for (const block of data.blocks) blocks.get(block.sourceVersionId)!.push(block);
  for (const chunk of data.chunks) chunks.get(chunk.sourceVersionId)!.push(chunk);
  return freeze({ version: 3, documents, blocks: documents.flatMap((doc) => blocks.get(doc.sourceVersionId)!), chunks: documents.flatMap((doc) => chunks.get(doc.sourceVersionId)!) });
}
function hashIds(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length > 4096 || values.some((value) => typeof value !== "string" || !hashPattern.test(value)) || new Set(values).size !== values.length) throw new RagStoreError("invalid-database-data");
  return [...values].sort();
}
export function prepareDocumentSnapshot(input: {
  collection: "current" | "archive"; baseSnapshot: RagSearchSnapshot | null; dataset: unknown; profile: EmbeddingProfile;
  suppressions: readonly LegacySuppression[]; restores: readonly LegacyRestore[];
  upsertSourceVersionIds: readonly string[]; retireSourceVersionIds: readonly string[]; promotionLegacySourceVersionIds: readonly string[];
}): PreparedDocumentCorpus {
  validateProfile(input.profile);
  if (!["current", "archive"].includes(input.collection) || input.profile.inputVersion !== "title-heading-text-v2") throw new RagStoreError("invalid-database-data");
  const profile = Object.freeze({ ...input.profile }), baseSnapshot = input.baseSnapshot === null ? null : checkedSearchSnapshot(input.baseSnapshot);
  if (baseSnapshot && (baseSnapshot.scope.kind !== input.collection || (baseSnapshot.scope.kind === "archive" && baseSnapshot.scope.asOf !== undefined))) throw new RagStoreError("invalid-database-data");
  if (input.collection === "current" && baseSnapshot?.heads.legacy && !sameSpace(baseSnapshot.heads.legacy.profile, profile)) throw new RagStoreError("profile-conflict");
  const dataset = canonicalDocumentDataset(input.dataset);
  if (dataset.documents.some((doc) => doc.status !== (input.collection === "current" ? "current" : "archived"))) throw new RagStoreError("invalid-database-data");
  const sourceName = (value: string) => typeof value === "string" && value.length <= 100 && /^[a-z0-9][a-z0-9-]*$/.test(value);
  if (!Array.isArray(input.suppressions) || !Array.isArray(input.restores) || input.suppressions.length > 4096 || input.restores.length > 4096
    || input.suppressions.some((entry) => !entry || !sourceName(entry.legacySourceId) || !hashPattern.test(entry.legacySourceVersionId) || !hashPattern.test(entry.documentSourceVersionId) || Object.keys(entry).sort().join(",") !== "documentSourceVersionId,legacySourceId,legacySourceVersionId")
    || input.restores.some((entry) => !entry || !sourceName(entry.legacySourceId) || !hashPattern.test(entry.legacySourceVersionId) || Object.keys(entry).sort().join(",") !== "legacySourceId,legacySourceVersionId")
    || new Set(input.suppressions.map((entry) => entry.legacySourceId)).size !== input.suppressions.length
    || new Set(input.restores.map((entry) => entry.legacySourceId)).size !== input.restores.length
    || input.restores.some((entry) => input.suppressions.some((suppression) => suppression.legacySourceId === entry.legacySourceId))
    || (input.collection === "archive" && (input.suppressions.length || input.restores.length))) throw new RagStoreError("invalid-database-data");
  const suppressions = input.suppressions.map((entry) => ({ ...entry })).sort((a, b) => a.legacySourceId.localeCompare(b.legacySourceId, "en"));
  const restores = input.restores.map((entry) => ({ ...entry })).sort((a, b) => a.legacySourceId.localeCompare(b.legacySourceId, "en"));
  const upsertSourceVersionIds = hashIds(input.upsertSourceVersionIds), retireSourceVersionIds = hashIds(input.retireSourceVersionIds), promotionLegacySourceVersionIds = hashIds(input.promotionLegacySourceVersionIds);
  const documents = new Map(dataset.documents.map((doc) => [doc.sourceVersionId, doc]));
  if (upsertSourceVersionIds.some((id) => !documents.has(id)) || retireSourceVersionIds.some((id) => documents.has(id))
    || promotionLegacySourceVersionIds.some((id) => !suppressions.some((entry) => entry.legacySourceVersionId === id))
    || (input.collection === "archive" && promotionLegacySourceVersionIds.length)) throw new RagStoreError("invalid-database-data");
  const chunks = dataset.chunks.map((raw) => {
    const text = documentEmbeddingInputV3(documents.get(raw.sourceVersionId)!, raw, profile);
    return { raw, input: text, inputHash: embeddingInputHash(text) };
  });
  const inputs = [...new Map(chunks.map((chunk) => [chunk.inputHash, { input: chunk.input, inputHash: chunk.inputHash }])).values()].sort((a, b) => a.inputHash.localeCompare(b.inputHash, "en"));
  if (inputs.reduce((sum, input) => sum + Buffer.byteLength(input.input, "utf8"), 0) > 64 * 1024 * 1024) throw new RagStoreError("invalid-database-data");
  const manifestHash = canonicalHash(["document-manifest-v1", input.collection, dataset, suppressions, restores, chunks.map((chunk) => [chunk.raw.sourceVersionId, chunk.raw.id, chunk.inputHash])]);
  return freeze({ kind: "documents", collection: input.collection, baseSnapshot, dataset, profile, suppressions, restores, upsertSourceVersionIds, retireSourceVersionIds, promotionLegacySourceVersionIds,
    manifestHash, revisionId: canonicalHash(["document-revision-v1", profile.id, manifestHash]), chunks, inputs });
}
function checkedDocumentPlan(plan: PreparedDocumentCorpus): PreparedDocumentCorpus {
  try {
    const expected = prepareDocumentSnapshot(plan);
    if (plan.kind !== "documents" || canonicalJson(expected) !== canonicalJson(plan)) throw new Error();
    return expected;
  } catch (error) { if (error instanceof RagStoreError) throw error; throw new RagStoreError("invalid-database-data"); }
}

export function validateProfile(profile: EmbeddingProfile): void {
  try {
    validateEmbeddingProfile(profile);
  } catch { throw new RagStoreError("invalid-database-data"); }
}
export function vectorParameter(vector: readonly number[], dimensions: number): string {
  if (!Array.isArray(vector) || vector.length !== dimensions || !vector.length || !vector.every((value) => typeof value === "number" && Number.isFinite(value) && Number.isFinite(Math.fround(value)))) throw new RagStoreError("invalid-vector");
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 0.001) throw new RagStoreError("invalid-vector");
  return JSON.stringify(vector);
}
function snapshotValid(snapshot: RagSnapshot) {
  if (!hashPattern.test(snapshot.revisionId)) throw new RagStoreError("invalid-database-data");
  validateProfile(snapshot.profile);
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new RagStoreError("aborted"));
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(new RagStoreError("aborted")); };
    const cleanup = () => signal.removeEventListener("abort", abort);
    signal.addEventListener("abort", abort, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, () => { cleanup(); reject(new RagStoreError("database-unavailable")); });
  });
}
export function createRagPool(options: RagDatabaseOptions): RagSqlPool {
  try {
    const url = new URL(options.connectionString);
    if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname || url.pathname.length < 2) throw new Error();
    const connectionTimeoutMillis = options.connectionTimeoutMs ?? 5000, statementTimeout = options.statementTimeoutMs ?? 5000, max = options.maxConnections ?? 4;
    if (![connectionTimeoutMillis, statementTimeout, max].every((n) => Number.isSafeInteger(n) && n > 0) || connectionTimeoutMillis > 60000 || statementTimeout > 60000 || max > 16) throw new Error();
    return new Pool({ connectionString: options.connectionString, connectionTimeoutMillis, statement_timeout: statementTimeout, query_timeout: statementTimeout + 500, idle_in_transaction_session_timeout: statementTimeout + 1000, idleTimeoutMillis: 10000, max, application_name: "strahov-rag", allowExitOnIdle: true }) as unknown as RagSqlPool;
  } catch { throw new RagStoreError("database-unavailable"); }
}
type Lease = { query(text: string, values?: unknown[]): Promise<SqlResult>; release(destroy?: boolean): void; readonly signal: AbortSignal };
function managePool(pool: RagSqlPool) {
  const shutdown = new AbortController(), leases = new Set<Lease>();
  let closing: Promise<void> | undefined;
  pool.on?.("error", () => {}); // Idle connection failures are surfaced by requests, never raw logs.
  async function acquire(external?: AbortSignal): Promise<Lease> {
    if (shutdown.signal.aborted) throw new RagStoreError("closed");
    const signal = external ? AbortSignal.any([external, shutdown.signal]) : shutdown.signal;
    if (signal.aborted) throw new RagStoreError("aborted");
    const connection = pool.connect();
    let client: RagSqlClient;
    try { client = await abortable(connection, signal); }
    catch (error) { void connection.then((late) => late.release(true), () => {}); throw error; }
    let released = false, connectionFailed = false;
    const onAbort = () => lease.release(true);
    // pg-pool removes its idle error listener while a client is checked out.
    // Own the event during both SQL and the importer's external API wait.
    const onClientError = () => { connectionFailed = true; lease.release(true); };
    const lease: Lease = {
      signal,
      async query(sql, values) {
        if (connectionFailed) throw new RagStoreError("database-unavailable");
        if (released || signal.aborted) throw new RagStoreError("aborted");
        try { return await abortable(client.query(sql, values), signal); }
        catch (error) { lease.release(true); throw error instanceof RagStoreError ? error : new RagStoreError("database-unavailable"); }
      },
      release(destroy = false) {
        if (released) return;
        released = true; signal.removeEventListener("abort", onAbort); client.off?.("error", onClientError);
        leases.delete(lease); client.release(destroy);
      },
    };
    leases.add(lease); client.on?.("error", onClientError); signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) { lease.release(true); throw new RagStoreError("aborted"); }
    try {
      const { rows } = await lease.query("SELECT current_setting('log_parameter_max_length') AS normal, current_setting('log_parameter_max_length_on_error') AS errors");
      if (rows[0]?.normal !== "0" || rows[0]?.errors !== "0") throw new RagStoreError("unsafe-database-logging");
      return lease;
    } catch (error) { lease.release(true); throw error; }
  }
  return {
    acquire,
    async run<T>(signal: AbortSignal | undefined, action: (lease: Lease) => Promise<T>): Promise<T> {
      const lease = await acquire(signal);
      try { return await action(lease); }
      finally { lease.release(); }
    },
    close(): Promise<void> {
      if (!closing) {
        shutdown.abort(); for (const lease of leases) lease.release(true);
        closing = pool.end().catch(() => { throw new RagStoreError("database-unavailable"); });
      }
      return closing;
    },
  };
}
async function transaction<T>(lease: Lease, action: () => Promise<T>, readOnly = false, documentWrite = false): Promise<T> {
  await lease.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : documentWrite ? "BEGIN ISOLATION LEVEL READ COMMITTED" : "BEGIN");
  try { const result = await action(); await lease.query("COMMIT"); return result; }
  catch (error) { try { await lease.query("ROLLBACK"); } catch { lease.release(true); } throw error; }
}
async function active(lease: Lease): Promise<RagSnapshot | null> {
  const { rows } = await lease.query(`SELECT v.version, h.revision_id, p.id, p.provider, p.model, p.dimensions, p.input_version
    FROM rag_schema_version v LEFT JOIN rag_heads h ON h.name='public'
    LEFT JOIN rag_revisions r ON r.id=h.revision_id AND r.state='ready'
    LEFT JOIN rag_profiles p ON p.id=r.profile_id WHERE v.singleton=true`);
  if (rows.length !== 1 || ![1, 2].includes(Number(rows[0].version))) throw new RagStoreError("invalid-schema");
  const row = rows[0]; if (row.revision_id === null) return null;
  const profile = { id: row.id, provider: row.provider, model: row.model, dimensions: row.dimensions, inputVersion: row.input_version } as EmbeddingProfile;
  const snapshot = { revisionId: row.revision_id as string, profile }; snapshotValid(snapshot);
  if (profile.inputVersion !== "title-locator-text-v1") throw new RagStoreError("invalid-database-data");
  return snapshot;
}
function sourceUsable(source: KnowledgeDocument, now: number) {
  return Number.isFinite(now) && now >= Math.max(Date.parse(source.checkedAt + "T00:00:00Z"), source.effectiveFrom ? Date.parse(source.effectiveFrom) : -Infinity)
    && now < Math.min(Date.parse(source.reviewAfter + "T00:00:00Z"), source.effectiveUntil ? Date.parse(source.effectiveUntil) : Infinity);
}
const sourceColumns = `s.id AS source_version_id,s.content_hash,s.metadata,s.authority,s.status,
  extract(epoch from s.checked_at)*1000 AS checked_ms,extract(epoch from s.review_after)*1000 AS review_ms,
  extract(epoch from s.effective_from)*1000 AS from_ms,extract(epoch from s.effective_until)*1000 AS until_ms`;
function checkedDocument(row: Record<string, unknown>, now?: number): KnowledgeDocument {
  try {
    const { sources } = validateKnowledgeDatasets([{ version: 2, sources: [row.metadata], chunks: [] }]);
    const source = sources[0];
    if (typeof row.content_hash !== "string" || !hashPattern.test(row.content_hash)
      || sourceVersionId(source, row.content_hash) !== row.source_version_id
      || source.authority !== row.authority || source.status !== row.status
      || Number(row.checked_ms) !== Date.parse(source.checkedAt + "T00:00:00Z")
      || Number(row.review_ms) !== Date.parse(source.reviewAfter + "T00:00:00Z")
      || (source.effectiveFrom === null ? row.from_ms !== null : Number(row.from_ms) !== Date.parse(source.effectiveFrom))
      || (source.effectiveUntil === null ? row.until_ms !== null : Number(row.until_ms) !== Date.parse(source.effectiveUntil))
      || (now !== undefined && !sourceUsable(source, now))) throw new Error();
    return source;
  } catch { throw new RagStoreError("invalid-database-data"); }
}
export function createVectorKnowledgeStore(options: RagDatabaseOptions): RagVectorStore {
  return createVectorKnowledgeStoreWithPool(createRagPool(options));
}
/** Explicit injectable SQL transport for CPU boundary tests; never a file fallback. */
export function createVectorKnowledgeStoreWithPool(pool: RagSqlPool): RagVectorStore {
  const manager = managePool(pool);
  return {
    ...searchMethods(manager),
    captureActive: (signal) => manager.run(signal, active),
    async search(snapshot, vector, filters, signal) {
      snapshotValid(snapshot); const parameter = vectorParameter(vector, snapshot.profile.dimensions), now = filters.now ?? Date.now();
      if (!Number.isFinite(now) || !Number.isSafeInteger(filters.limit) || filters.limit < 1 || filters.limit > 64
        || (filters.authority !== undefined && !["silicon-hill", "suz"].includes(filters.authority))
        || (filters.topics && (filters.topics.length > topics.size || !filters.topics.every((topic) => topics.has(topic))))) throw new RagStoreError("invalid-database-data");
      return manager.run(signal, (lease) => transaction(lease, async () => {
        const selected = await active(lease);
        if (!selected || selected.revisionId !== snapshot.revisionId || selected.profile.id !== snapshot.profile.id) throw new RagStoreError("revision-conflict");
        const { rows } = await lease.query(`SELECT c.chunk_id,c.payload,e.input_hash,e.input_text,${sourceColumns},e.embedding <=> $1::vector AS distance
          FROM rag_revision_chunks c JOIN rag_revision_sources rs ON rs.revision_id=c.revision_id AND rs.source_id=c.source_id
          JOIN rag_source_versions s ON s.id=rs.source_version_id
          JOIN rag_embedding_cache e ON e.profile_id=c.profile_id AND e.input_hash=c.input_hash
          WHERE c.revision_id=$2 AND c.profile_id=$3 AND s.status='current' AND s.visibility='public'
            AND s.checked_at <= $4::timestamptz AND $4::timestamptz < s.review_after
            AND (s.effective_from IS NULL OR s.effective_from <= $4::timestamptz)
            AND (s.effective_until IS NULL OR $4::timestamptz < s.effective_until)
            AND ($5::text IS NULL OR s.authority=$5) AND ($6::text[] IS NULL OR c.payload->>'topic'=ANY($6))
          ORDER BY e.embedding <=> $1::vector,c.chunk_id LIMIT $7`, [parameter, snapshot.revisionId, snapshot.profile.id, new Date(now).toISOString(), filters.authority ?? null, filters.topics ? [...filters.topics] : null, filters.limit]);
        return rows.map((row): VectorHit => {
          const document = checkedDocument(row, now);
          try {
            const validated = validateKnowledgeDatasets([{ version: 2, sources: [document], chunks: [row.payload] }]);
            const raw = validated.chunks[0];
            const chunk: KnowledgeChunk = { id: raw.id, text: raw.text, sourceLocator: raw.sourceLocator, contentSha256: raw.contentSha256, topic: raw.topic, document, versionNote: document.versionNote,
              source: { id: document.id, title: document.title, url: document.url, checkedAt: document.checkedAt, author: document.author, license: document.license, licenseUrl: document.licenseUrl, adaptation: "curated-paraphrase" } };
            const input = documentEmbeddingInput(chunk), distance = Number(row.distance);
            if (row.chunk_id !== raw.id || row.input_text !== input || row.input_hash !== embeddingInputHash(input) || !Number.isFinite(distance) || distance < -0.000001 || distance > 2.000001) throw new Error();
            return { chunk, sourceVersionId: row.source_version_id as string, distance: Math.max(0, Math.min(2, distance)) };
          } catch { throw new RagStoreError("invalid-database-data"); }
        });
      }, true));
    },
    async assertCurrent(snapshot, ids, now = Date.now(), signal) {
      snapshotValid(snapshot);
      if (!Number.isFinite(now) || ids.length > 64 || !ids.every((id) => hashPattern.test(id))) throw new RagStoreError("invalid-database-data");
      const unique = [...new Set(ids)];
      return manager.run(signal, (lease) => transaction(lease, async () => {
        const selected = await active(lease);
        if (!selected || selected.revisionId !== snapshot.revisionId || selected.profile.id !== snapshot.profile.id) return false;
        if (!unique.length) return true;
        const { rows } = await lease.query(`SELECT ${sourceColumns} FROM rag_revision_sources rs JOIN rag_source_versions s ON s.id=rs.source_version_id
          WHERE rs.revision_id=$1 AND s.id=ANY($2::text[]) AND s.status='current' AND s.visibility='public'`, [snapshot.revisionId, unique]);
        if (rows.length !== unique.length) return false;
        for (const row of rows) {
          // Valid metadata expiring is a normal false, malformed metadata is a hard error.
          const document = checkedDocument(row);
          if (!sourceUsable(document, now)) return false;
        }
        return true;
      }, true));
    },
    close: () => manager.close(),
  };
}

export type RagMigrationRoles = Readonly<{ readerRole?: string; ingesterRole?: string }>;
export async function migrateRagSchema(options: RagDatabaseOptions & RagMigrationRoles, signal?: AbortSignal): Promise<void> {
  await migrateRagSchemaWithPool(createRagPool(options), options, signal);
}

export type CachedEmbedding = { input: string; inputHash: string; vector: number[] };
export type RagImportSession = {
  prepare(plan: PreparedCorpus): Promise<"building" | "ready">;
  cached(profile: EmbeddingProfile, inputs: readonly { input: string; inputHash: string }[]): Promise<Set<string>>;
  uncertain(profile: EmbeddingProfile): Promise<readonly string[]>;
  startAttempt(plan: Pick<PreparedCorpus, "revisionId" | "profile">, hashes: readonly string[]): Promise<string>;
  completeAttempt(id: string, profile: EmbeddingProfile, entries: readonly CachedEmbedding[], usage: { promptTokens: number; totalTokens: number }): Promise<void>;
  failAttempt(id: string, uncertain: boolean): Promise<void>;
  publish(plan: PreparedCorpus): Promise<void>;
  close(): Promise<void>;
};

const migrationTables = ["rag_schema_version", "rag_profiles", "rag_embedding_cache", "rag_source_versions", "rag_revisions", "rag_revision_sources", "rag_revision_chunks", "rag_heads", "rag_embedding_attempts"];
const documentTables = ["rag_document_versions", "rag_document_blocks", "rag_document_chunks", "rag_revision_documents", "rag_revision_document_chunks", "rag_revision_legacy_replacements", "rag_revision_legacy_restores"];
function migrationRoles(value: RagMigrationRoles) {
  const roles = [value.readerRole, value.ingesterRole].filter((role): role is string => role !== undefined);
  if (roles.some((role) => !/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(role)) || new Set(roles).size !== roles.length) throw new RagStoreError("invalid-database-data");
  return roles;
}
/** Injectable migration transport. This function executes DDL only when explicitly called. */
export async function migrateRagSchemaWithPool(pool: RagSqlPool, roles: RagMigrationRoles = {}, signal?: AbortSignal): Promise<void> {
  const manager = managePool(pool);
  let lease: Lease | undefined, locked = false;
  try {
    const requestedRoles = migrationRoles(roles);
    const files = await Promise.all(["./rag-schema.sql", "./rag-migrations/002-documents.sql"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
    const checksums = files.map((sql) => createHash("sha256").update(sql, "utf8").digest("hex"));
    lease = await manager.acquire(signal);
    const lock = await lease.query("SELECT pg_try_advisory_lock(18472, 1) AS acquired");
    if (lock.rows[0]?.acquired !== true) throw new RagStoreError("import-busy");
    locked = true;
    if (requestedRoles.length) {
      const found = await lease.query("SELECT rolname FROM pg_roles WHERE rolname=ANY($1::text[])", [requestedRoles]);
      if (found.rows.length !== requestedRoles.length || found.rows.some((row) => !requestedRoles.includes(String(row.rolname)))) throw new RagStoreError("invalid-database-data");
    }
    const currentLease = lease;
    await transaction(currentLease, async () => {
      const state = await currentLease.query(`SELECT to_regclass(format('%I.rag_schema_version',current_schema()))::text AS version_table,
        to_regclass(format('%I.rag_schema_migrations',current_schema()))::text AS migrations_table,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=current_schema() AND c.relname=ANY($1::text[]) AND c.relkind='r')::integer AS known_tables`, [migrationTables]);
      const row = state.rows[0];
      if (state.rows.length !== 1) throw new RagStoreError("invalid-schema");
      if (row.version_table === null) {
        if (Number(row.known_tables) !== 0 || row.migrations_table !== null) throw new RagStoreError("invalid-schema");
        await currentLease.query(files[0]);
      } else if (Number(row.known_tables) !== migrationTables.length) throw new RagStoreError("invalid-schema");
      const version = await schemaVersion(currentLease);
      if (row.migrations_table === null) {
        if (version !== 1) throw new RagStoreError("invalid-schema");
        await active(currentLease); // Validate the accepted legacy head before adopting its schema.
        await currentLease.query(`CREATE TABLE rag_schema_migrations(version integer PRIMARY KEY CHECK(version>0),checksum text NOT NULL CHECK(checksum ~ '^[0-9a-f]{64}$'),applied_at timestamptz NOT NULL DEFAULT now());
          REVOKE ALL ON TABLE rag_schema_migrations FROM PUBLIC;`);
        await currentLease.query("INSERT INTO rag_schema_migrations(version,checksum) VALUES(1,$1)", [checksums[0]]);
      }
    });
    for (;;) {
      const version = await schemaVersion(currentLease);
      const recorded = await currentLease.query("SELECT version,checksum FROM rag_schema_migrations ORDER BY version");
      if (recorded.rows.length !== version || recorded.rows.some((row, index) => row.version !== index + 1 || row.checksum !== checksums[index])) throw new RagStoreError("invalid-schema");
      if (version === files.length) break;
      await transaction(currentLease, async () => {
        await currentLease.query(files[version]);
        const changed = await currentLease.query("UPDATE rag_schema_version SET version=$1 WHERE singleton=true AND version=$2", [version + 1, version]);
        if (changed.rowCount !== 1) throw new RagStoreError("invalid-schema");
        await currentLease.query("INSERT INTO rag_schema_migrations(version,checksum) VALUES($1,$2)", [version + 1, checksums[version]]);
      });
    }
    if (requestedRoles.length) await transaction(currentLease, async () => {
      // Identifiers are explicitly supplied by an administrator, validated above, and quoted.
      const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
      if (roles.readerRole) await currentLease.query(`GRANT SELECT ON ${[...migrationTables.filter((name) => name !== "rag_embedding_attempts"), ...documentTables].join(",")} TO ${quote(roles.readerRole)}`);
      if (roles.ingesterRole) {
        await currentLease.query(`GRANT SELECT ON rag_schema_version TO ${quote(roles.ingesterRole)}`);
        await currentLease.query(`GRANT SELECT,INSERT ON ${[...migrationTables.filter((name) => name !== "rag_schema_version"), ...documentTables].join(",")} TO ${quote(roles.ingesterRole)}`);
        await currentLease.query(`GRANT UPDATE ON rag_revisions,rag_heads,rag_embedding_attempts TO ${quote(roles.ingesterRole)}`);
        await currentLease.query(`GRANT UPDATE(sealed) ON rag_document_versions TO ${quote(roles.ingesterRole)}`);
      }
    });
  } finally {
    if (lease && locked) { try { await lease.query("SELECT pg_advisory_unlock(18472, 1)"); } catch { lease.release(true); } }
    lease?.release(); await manager.close();
  }
}
export async function openRagImportSession(options: RagDatabaseOptions, signal?: AbortSignal): Promise<RagImportSession> {
  return openRagImportSessionWithPool(createRagPool(options), signal);
}
export async function openRagImportSessionWithPool(pool: RagSqlPool, signal?: AbortSignal): Promise<RagImportSession> {
  const manager = managePool(pool); let lease: Lease;
  try {
    lease = await manager.acquire(signal);
    const { rows } = await lease.query("SELECT pg_try_advisory_lock(18472, 1) AS acquired");
    if (rows[0]?.acquired !== true) throw new RagStoreError("import-busy");
    await active(lease);
  } catch (error) { await manager.close(); throw error; }
  let closed = false;
  return {
    async prepare(plan) {
      validateProfile(plan.profile);
      return transaction(lease, async () => {
        await assertLegacySpace(lease, plan.profile);
        const p = plan.profile;
        await lease.query("INSERT INTO rag_profiles(id,provider,model,dimensions,input_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [p.id, p.provider, p.model, p.dimensions, p.inputVersion]);
        await lease.query("INSERT INTO rag_revisions(id,profile_id,manifest_hash,state,expected_sources,expected_chunks) VALUES($1,$2,$3,'building',$4,$5) ON CONFLICT DO NOTHING", [plan.revisionId, p.id, plan.manifestHash, plan.sources.length, plan.chunks.length]);
        const { rows } = await lease.query("SELECT profile_id,manifest_hash,state,expected_sources,expected_chunks FROM rag_revisions WHERE id=$1 FOR UPDATE", [plan.revisionId]);
        const row = rows[0];
        if (!row || row.profile_id !== p.id || row.manifest_hash !== plan.manifestHash || row.expected_sources !== plan.sources.length || row.expected_chunks !== plan.chunks.length) throw new RagStoreError("invalid-database-data");
        if (row.state === "ready") return "ready";
        if (row.state !== "building" && row.state !== "failed") throw new RagStoreError("invalid-database-data");
        if (row.state === "failed") await lease.query("UPDATE rag_revisions SET state='building',error_code=NULL WHERE id=$1", [plan.revisionId]);
        for (const item of plan.sources) {
          const s = item.metadata;
          await lease.query(`INSERT INTO rag_source_versions(id,source_id,content_hash,authority,status,checked_at,review_after,effective_from,effective_until,metadata)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) ON CONFLICT DO NOTHING`, [item.id, s.id, item.contentHash, s.authority, s.status, s.checkedAt + "T00:00:00Z", s.reviewAfter + "T00:00:00Z", s.effectiveFrom, s.effectiveUntil, JSON.stringify(s)]);
          await lease.query("INSERT INTO rag_revision_sources(revision_id,source_id,source_version_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [plan.revisionId, s.id, item.id]);
        }
        return "building";
      });
    },
    ...embeddingSession(lease),
    async publish(plan) {
      await transaction(lease, async () => {
        await assertLegacySpace(lease, plan.profile);
        const { rows } = await lease.query("SELECT state FROM rag_revisions WHERE id=$1 FOR UPDATE", [plan.revisionId]);
        if (rows[0]?.state !== "ready") {
          if (rows[0]?.state !== "building") throw new RagStoreError("invalid-database-data");
          for (const item of plan.chunks) await lease.query("INSERT INTO rag_revision_chunks(revision_id,chunk_id,source_id,profile_id,input_hash,payload) VALUES($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT DO NOTHING", [plan.revisionId, item.raw.id, item.raw.sourceId, plan.profile.id, item.inputHash, JSON.stringify(item.raw)]);
          await lease.query("UPDATE rag_revisions SET state='ready',finished_at=now(),error_code=NULL WHERE id=$1", [plan.revisionId]);
        }
        await lease.query("INSERT INTO rag_heads(name,revision_id) VALUES('public',$1) ON CONFLICT(name) DO UPDATE SET revision_id=EXCLUDED.revision_id,updated_at=now()", [plan.revisionId]);
      });
    },
    async close() {
      if (closed) return; closed = true;
      try { await lease.query("SELECT pg_advisory_unlock(18472, 1)"); } catch { lease.release(true); }
      finally { lease.release(); await manager.close(); }
    },
  };
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function scopeValue(value: KnowledgeScope): KnowledgeScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RagStoreError("invalid-database-data");
  if (value.kind === "current" && Object.keys(value).every((key) => key === "kind")) return Object.freeze({ kind: "current" });
  if (value.kind === "archive" && Object.keys(value).every((key) => ["kind", "asOf"].includes(key))
    && (value.asOf === undefined || (isRagInstant(value.asOf) && new Date(value.asOf).toISOString() === value.asOf)))
    return Object.freeze({ kind: "archive", ...(value.asOf === undefined ? {} : { asOf: value.asOf }) });
  throw new RagStoreError("invalid-database-data");
}
function sameSpace(a: EmbeddingProfile, b: EmbeddingProfile) {
  return a.provider === b.provider && a.model === b.model && a.dimensions === b.dimensions;
}
async function schemaVersion(lease: Lease): Promise<number> {
  const { rows } = await lease.query("SELECT version FROM rag_schema_version WHERE singleton=true");
  if (rows.length !== 1 || ![1, 2].includes(Number(rows[0].version))) throw new RagStoreError("invalid-schema");
  return Number(rows[0].version);
}
function profileRow(row: Record<string, unknown>, prefix = ""): EmbeddingProfile {
  const model = row[prefix + "model"], dimensions = row[prefix + "dimensions"], inputVersion = row[prefix + "input_version"];
  if (typeof model !== "string" || typeof dimensions !== "number" || (inputVersion !== "title-locator-text-v1" && inputVersion !== "title-heading-text-v2")
    || row[prefix + "provider"] !== "openai" || typeof row[prefix + "profile_id"] !== "string") throw new RagStoreError("invalid-database-data");
  const profile: EmbeddingProfile = { id: String(row[prefix + "profile_id"]), provider: "openai", model, dimensions, inputVersion };
  validateProfile(profile); return Object.freeze(profile);
}
function makeSearchSnapshot(scope: KnowledgeScope, heads: RagSearchSnapshot["heads"]): RagSearchSnapshot | null {
  const refs = Object.values(heads).filter((head): head is RagHeadRef => head !== null);
  if (!refs.length) return null;
  if (refs.some((head) => !sameSpace(head.profile, refs[0].profile))) throw new RagStoreError("profile-conflict");
  const p = refs[0].profile, embeddingSpace = { provider: p.provider, model: p.model, dimensions: p.dimensions };
  return freeze({ id: canonicalHash(["search-view-v1", scope, heads]), scope, heads, embeddingSpace });
}
function checkedSearchSnapshot(value: RagSearchSnapshot): RagSearchSnapshot {
  if (!value || typeof value !== "object" || !value.heads || Object.keys(value).some((key) => !["id", "scope", "heads", "embeddingSpace"].includes(key))
    || Object.keys(value.heads).sort().join(",") !== "archive,documents,legacy") throw new RagStoreError("invalid-database-data");
  const scope = scopeValue(value.scope);
  const heads: { legacy: RagHeadRef | null; documents: RagHeadRef | null; archive: RagHeadRef | null } = { legacy: null, documents: null, archive: null };
  for (const [key, name] of [["legacy", "public"], ["documents", "public-documents"], ["archive", "public-archive"]] as const) {
    const head = value.heads[key];
    if (head === null) continue;
    if (!head || head.name !== name || typeof head.revisionId !== "string" || !hashPattern.test(head.revisionId)
      || Object.keys(head).some((field) => !["name", "revisionId", "profile"].includes(field))) throw new RagStoreError("invalid-database-data");
    validateProfile(head.profile);
    if (head.profile.inputVersion !== (name === "public" ? "title-locator-text-v1" : "title-heading-text-v2")) throw new RagStoreError("invalid-database-data");
    heads[key] = { name, revisionId: head.revisionId, profile: { ...head.profile } };
  }
  if (scope.kind === "current" ? heads.archive !== null : heads.legacy !== null || heads.documents !== null) throw new RagStoreError("invalid-database-data");
  const expected = makeSearchSnapshot(scope, heads);
  if (!expected || value.id !== expected.id || canonicalJson(value.embeddingSpace) !== canonicalJson(expected.embeddingSpace)) throw new RagStoreError("invalid-database-data");
  return expected;
}
async function captureSearchInLease(lease: Lease, input: KnowledgeScope): Promise<RagSearchSnapshot | null> {
  const scope = scopeValue(input), version = await schemaVersion(lease);
  const names = scope.kind === "current" ? ["public", ...(version >= 2 ? ["public-documents"] : [])] : version >= 2 ? ["public-archive"] : [];
  if (!names.length) return null;
  const { rows } = await lease.query(`SELECT h.name,h.revision_id,p.id AS profile_id,p.provider,p.model,p.dimensions,p.input_version,
    ${version >= 2 ? "r.data_schema_version,r.collection" : "2 AS data_schema_version,'current' AS collection"}
    FROM rag_heads h JOIN rag_revisions r ON r.id=h.revision_id AND r.state='ready' JOIN rag_profiles p ON p.id=r.profile_id WHERE h.name=ANY($1::text[])`, [names]);
  const heads: { legacy: RagHeadRef | null; documents: RagHeadRef | null; archive: RagHeadRef | null } = { legacy: null, documents: null, archive: null };
  for (const row of rows) {
    const name = row.name;
    if (typeof name !== "string" || !names.includes(name) || typeof row.revision_id !== "string" || !hashPattern.test(row.revision_id)) throw new RagStoreError("invalid-database-data");
    const key = name === "public" ? "legacy" : name === "public-documents" ? "documents" : "archive";
    const profile = profileRow(row);
    if (heads[key] || row.data_schema_version !== (key === "legacy" ? 2 : 3) || row.collection !== (key === "archive" ? "archive" : "current")
      || profile.inputVersion !== (key === "legacy" ? "title-locator-text-v1" : "title-heading-text-v2")) throw new RagStoreError("invalid-database-data");
    heads[key] = { name: key === "legacy" ? "public" : key === "documents" ? "public-documents" : "public-archive", revisionId: row.revision_id, profile };
  }
  return makeSearchSnapshot(scope, heads);
}
function documentUsable(document: KnowledgeDocumentV3, scope: KnowledgeScope, now: number): boolean {
  if (!Number.isFinite(now) || now < Date.parse(document.checkedAt + "T00:00:00Z") || now >= Date.parse(document.reviewAfter + "T00:00:00Z")) return false;
  if (scope.kind === "current") return document.status === "current" && (document.effectiveFrom === null || now >= Date.parse(document.effectiveFrom))
    && (document.effectiveUntil === null || now < Date.parse(document.effectiveUntil));
  return document.status === "archived" && (scope.asOf === undefined || (document.effectiveFrom !== null && document.effectiveUntil !== null
    && Date.parse(document.effectiveFrom) <= Date.parse(scope.asOf) && Date.parse(scope.asOf) < Date.parse(document.effectiveUntil)));
}
function checkedV3Document(row: Record<string, unknown>, scope?: KnowledgeScope, now?: number): KnowledgeDocumentV3 {
  try {
    const doc = validateKnowledgeDocumentV3(row.metadata);
    if (row.source_version_id !== doc.sourceVersionId || row.source_id !== doc.id || row.authority !== doc.authority || row.status !== doc.status
      || Number(row.checked_ms) !== Date.parse(doc.checkedAt + "T00:00:00Z") || Number(row.review_ms) !== Date.parse(doc.reviewAfter + "T00:00:00Z")
      || (doc.effectiveFrom === null ? row.from_ms !== null : Number(row.from_ms) !== Date.parse(doc.effectiveFrom))
      || (doc.effectiveUntil === null ? row.until_ms !== null : Number(row.until_ms) !== Date.parse(doc.effectiveUntil))
      || typeof row.sealed !== "boolean" || (scope !== undefined && now !== undefined && (!row.sealed || !documentUsable(doc, scope, now)))) throw new Error();
    return doc;
  } catch { throw new RagStoreError("invalid-database-data"); }
}
const documentColumns = `v.id AS source_version_id,v.source_id,v.metadata,v.authority,v.status,
  extract(epoch from v.checked_at)*1000 AS checked_ms,extract(epoch from v.review_after)*1000 AS review_ms,
  extract(epoch from v.effective_from)*1000 AS from_ms,extract(epoch from v.effective_until)*1000 AS until_ms,v.sealed`;
const emptyDocumentDataset = (): KnowledgeDatasetV3 => freeze({ version: 3, documents: [], blocks: [], chunks: [] });
async function readDocumentDataset(lease: Lease, ids: readonly string[]): Promise<KnowledgeDatasetV3> {
  if (!ids.length) return emptyDocumentDataset();
  if (ids.length > DOCUMENT_VALIDATION_LIMITS.maxDocuments || !ids.every((id) => hashPattern.test(id)) || new Set(ids).size !== ids.length) throw new RagStoreError("invalid-database-data");
  const budget = await lease.query(`SELECT
    (SELECT count(*) FROM rag_document_versions WHERE id=ANY($1::text[])) AS documents,
    (SELECT count(*) FROM rag_document_blocks WHERE source_version_id=ANY($1::text[])) AS blocks,
    (SELECT count(*) FROM rag_document_chunks WHERE source_version_id=ANY($1::text[])) AS chunks,
    COALESCE((SELECT sum(octet_length(metadata::text)) FROM rag_document_versions WHERE id=ANY($1::text[])),0)+
    COALESCE((SELECT sum(octet_length(payload::text)) FROM rag_document_blocks WHERE source_version_id=ANY($1::text[])),0)+
    COALESCE((SELECT sum(octet_length(payload::text)) FROM rag_document_chunks WHERE source_version_id=ANY($1::text[])),0) AS payload_bytes`, [[...ids]]);
  const b = budget.rows[0];
  if (budget.rows.length !== 1 || Number(b.documents) !== ids.length || !["blocks", "chunks", "payload_bytes"].every((key) => Number.isSafeInteger(Number(b[key])) && Number(b[key]) >= 0)
    || Number(b.blocks) > DOCUMENT_VALIDATION_LIMITS.maxBlocks || Number(b.chunks) > DOCUMENT_VALIDATION_LIMITS.maxChunks || Number(b.payload_bytes) > DOCUMENT_VALIDATION_LIMITS.maxOutputBytes) throw new RagStoreError("invalid-database-data");
  const documents = await lease.query(`SELECT ${documentColumns} FROM rag_document_versions v WHERE v.id=ANY($1::text[]) ORDER BY v.id`, [[...ids]]);
  const blocks = await lease.query("SELECT source_version_id,ordinal,payload FROM rag_document_blocks WHERE source_version_id=ANY($1::text[]) ORDER BY source_version_id,ordinal", [[...ids]]);
  const chunks = await lease.query("SELECT source_version_id,ordinal,payload FROM rag_document_chunks WHERE source_version_id=ANY($1::text[]) ORDER BY source_version_id,ordinal", [[...ids]]);
  try {
    for (const rows of [blocks.rows, chunks.rows]) {
      const next = new Map<string, number>();
      for (const row of rows) {
        if (typeof row.source_version_id !== "string" || !ids.includes(row.source_version_id) || row.ordinal !== (next.get(row.source_version_id) ?? 0)) throw new Error();
        next.set(row.source_version_id, Number(row.ordinal) + 1);
      }
    }
    return validateKnowledgeDatasetV3({ version: 3, documents: documents.rows.map((row) => checkedV3Document(row)), blocks: blocks.rows.map((row) => row.payload), chunks: chunks.rows.map((row) => row.payload) });
  } catch { throw new RagStoreError("invalid-database-data"); }
}
function searchMethods(manager: ReturnType<typeof managePool>): Pick<RagVectorStore, "captureSearch" | "searchSnapshot" | "assertSnapshot"> {
  return {
    captureSearch(input, signal) {
      const scope = scopeValue(input);
      return manager.run(signal, (lease) => transaction(lease, () => captureSearchInLease(lease, scope), true));
    },
    searchSnapshot(input, vector, filters, signal) {
      const snapshot = checkedSearchSnapshot(input), parameter = vectorParameter(vector, snapshot.embeddingSpace.dimensions);
      const now = filters.now ?? Date.now(), authority = filters.authority, limit = filters.limit;
      if (!Number.isFinite(now) || !Number.isSafeInteger(limit) || limit < 1 || limit > 64 || Object.keys(filters).some((key) => !["authority", "limit", "now"].includes(key))
        || (authority !== undefined && !RAG_PUBLISHERS.includes(authority))) throw new RagStoreError("invalid-database-data");
      return manager.run(signal, (lease) => transaction(lease, async () => {
        if ((await captureSearchInLease(lease, snapshot.scope))?.id !== snapshot.id) throw new RagStoreError("revision-conflict");
        const values: unknown[] = [parameter, new Date(now).toISOString(), authority ?? null];
        const bind = (value: unknown, type = "text") => { values.push(value); return `$${values.length}::${type}`; };
        const queries: string[] = [], legacy = snapshot.heads.legacy, document = snapshot.heads.documents ?? snapshot.heads.archive;
        if (legacy) {
          const revision = bind(legacy.revisionId), profile = bind(legacy.profile.id);
          const suppression = snapshot.heads.documents ? `AND NOT EXISTS (SELECT 1 FROM rag_revision_legacy_replacements replacement WHERE replacement.revision_id=${bind(snapshot.heads.documents.revisionId)} AND replacement.legacy_source_id=s.source_id)` : "";
          queries.push(`SELECT 'legacy' AS representation,'public' AS head,c.chunk_id,c.payload,e.input_hash,e.input_text,s.source_id,${sourceColumns},true AS sealed,e.embedding <=> $1::vector AS distance
            FROM rag_revision_chunks c JOIN rag_revision_sources rs ON rs.revision_id=c.revision_id AND rs.source_id=c.source_id JOIN rag_source_versions s ON s.id=rs.source_version_id
            JOIN rag_embedding_cache e ON e.profile_id=c.profile_id AND e.input_hash=c.input_hash
            WHERE c.revision_id=${revision} AND c.profile_id=${profile} AND s.status='current' AND s.visibility='public'
              AND s.checked_at <= $2::timestamptz AND $2::timestamptz < s.review_after
              AND (s.effective_from IS NULL OR s.effective_from <= $2::timestamptz) AND (s.effective_until IS NULL OR $2::timestamptz < s.effective_until)
              AND ($3::text IS NULL OR s.authority=$3) ${suppression}`);
        }
        if (document) {
          const revision = bind(document.revisionId), profile = bind(document.profile.id), archive = snapshot.scope.kind === "archive";
          let legal = "AND (v.effective_from IS NULL OR v.effective_from <= $2::timestamptz) AND (v.effective_until IS NULL OR $2::timestamptz < v.effective_until)";
          if (archive) {
            const asOf = snapshot.scope.kind === "archive" ? snapshot.scope.asOf : undefined;
            legal = asOf === undefined ? "" : `AND v.effective_from IS NOT NULL AND v.effective_until IS NOT NULL AND v.effective_from<=${bind(asOf, "timestamptz")} AND ${bind(asOf, "timestamptz")}<v.effective_until`;
          }
          queries.push(`SELECT 'document' AS representation,'${archive ? "public-archive" : "public-documents"}' AS head,c.chunk_id,c.payload,e.input_hash,e.input_text,v.source_id,
            v.id AS source_version_id,v.metadata->'extraction'->>'normalizedSha256' AS content_hash,v.metadata,v.authority,v.status,
            extract(epoch from v.checked_at)*1000 AS checked_ms,extract(epoch from v.review_after)*1000 AS review_ms,
            extract(epoch from v.effective_from)*1000 AS from_ms,extract(epoch from v.effective_until)*1000 AS until_ms,v.sealed,e.embedding <=> $1::vector AS distance
            FROM rag_revision_document_chunks rc JOIN rag_document_chunks c ON c.source_version_id=rc.source_version_id AND c.chunk_id=rc.chunk_id
            JOIN rag_document_versions v ON v.id=rc.source_version_id JOIN rag_embedding_cache e ON e.profile_id=rc.profile_id AND e.input_hash=rc.input_hash
            WHERE rc.revision_id=${revision} AND rc.profile_id=${profile} AND v.status='${archive ? "archived" : "current"}' AND v.visibility='public' AND v.sealed
              AND v.checked_at<=$2::timestamptz AND $2::timestamptz<v.review_after AND ($3::text IS NULL OR v.authority=$3) ${legal}`);
        }
        const { rows } = await lease.query(`SELECT * FROM (${queries.join(" UNION ALL ")}) candidates ORDER BY distance,head,source_version_id,chunk_id LIMIT ${bind(limit, "integer")}`, values);
        const v3Ids = [...new Set(rows.filter((row) => row.representation === "document").map((row) => String(row.source_version_id)))];
        const dataset = await readDocumentDataset(lease, v3Ids), docs = new Map(dataset.documents.map((doc) => [doc.sourceVersionId, doc]));
        return freeze(rows.map((row): RagSearchHit => {
          try {
            let chunk: EvidenceKnowledgeChunk, expectedInput: string;
            if (row.representation === "legacy" && row.head === "public" && legacy) {
              const doc = checkedDocument(row, now), validated = validateKnowledgeDatasets([{ version: 2, sources: [doc], chunks: [row.payload] }]);
              const raw = validated.chunks[0];
              chunk = { id: raw.id, text: raw.text, sourceLocator: raw.sourceLocator, contentSha256: raw.contentSha256, topic: raw.topic, document: doc, versionNote: doc.versionNote,
                source: { id: doc.id, title: doc.title, url: doc.url, checkedAt: doc.checkedAt, author: doc.author, license: doc.license, licenseUrl: doc.licenseUrl, adaptation: "curated-paraphrase" } };
              expectedInput = documentEmbeddingInput(chunk);
            } else if (row.representation === "document" && document && row.head === document.name) {
              const doc = docs.get(String(row.source_version_id));
              const raw = dataset.chunks.find((item) => item.sourceVersionId === row.source_version_id && item.id === row.chunk_id);
              if (!doc || !raw || !documentUsable(doc, snapshot.scope, now) || canonicalJson(raw) !== canonicalJson(row.payload)
                || canonicalJson(doc) !== canonicalJson(checkedV3Document(row, snapshot.scope, now))) throw new Error();
              chunk = resolveKnowledgeChunkV3(doc, raw); expectedInput = documentEmbeddingInputV3(doc, raw, document.profile);
            } else throw new Error();
            const distance = Number(row.distance);
            if (row.input_text !== expectedInput || row.input_hash !== embeddingInputHash(expectedInput) || !Number.isFinite(distance) || distance < -0.000001 || distance > 2.000001) throw new Error();
            return { chunk, dependency: { head: row.head as RagHeadName, sourceVersionId: String(row.source_version_id) }, distance: Math.max(0, Math.min(2, distance)) };
          } catch { throw new RagStoreError("invalid-database-data"); }
        }));
      }, true));
    },
    assertSnapshot(input, inputDependencies, now = Date.now(), signal) {
      const snapshot = checkedSearchSnapshot(input);
      if (!Number.isFinite(now) || inputDependencies.length > 64) throw new RagStoreError("invalid-database-data");
      const dependencies = inputDependencies.map((item) => {
        if (!item || !["public", "public-documents", "public-archive"].includes(item.head) || !hashPattern.test(item.sourceVersionId)) throw new RagStoreError("invalid-database-data");
        return { head: item.head, sourceVersionId: item.sourceVersionId };
      });
      return manager.run(signal, (lease) => transaction(lease, async () => {
        if ((await captureSearchInLease(lease, snapshot.scope))?.id !== snapshot.id) return false;
        for (const dependency of new Map(dependencies.map((item) => [item.head + ":" + item.sourceVersionId, item])).values()) {
          const head = Object.values(snapshot.heads).find((item) => item?.name === dependency.head);
          if (!head) return false;
          if (dependency.head === "public") {
            const suppression = snapshot.heads.documents ? "AND NOT EXISTS (SELECT 1 FROM rag_revision_legacy_replacements p WHERE p.revision_id=$3 AND p.legacy_source_id=s.source_id)" : "";
            const values = [head.revisionId, dependency.sourceVersionId, ...(snapshot.heads.documents ? [snapshot.heads.documents.revisionId] : [])];
            const { rows } = await lease.query(`SELECT ${sourceColumns} FROM rag_revision_sources rs JOIN rag_source_versions s ON s.id=rs.source_version_id
              WHERE rs.revision_id=$1 AND s.id=$2 AND s.status='current' AND s.visibility='public' ${suppression}`, values);
            if (rows.length !== 1 || !sourceUsable(checkedDocument(rows[0]), now)) return false;
          } else {
            const { rows } = await lease.query(`SELECT ${documentColumns} FROM rag_revision_documents d JOIN rag_document_versions v ON v.id=d.source_version_id
              WHERE d.revision_id=$1 AND v.id=$2 AND v.visibility='public'`, [head.revisionId, dependency.sourceVersionId]);
            if (rows.length !== 1) return false;
            if (rows[0].sealed !== true) throw new RagStoreError("invalid-database-data");
            if (!documentUsable(checkedV3Document(rows[0]), snapshot.scope, now)) return false;
          }
        }
        return true;
      }, true));
    },
  };
}

function embeddingSession(lease: Lease): Pick<RagImportSession, "cached" | "uncertain" | "startAttempt" | "completeAttempt" | "failAttempt"> {
  return {
    async cached(profile, inputs) {
      validateProfile(profile); if (!inputs.length) return new Set();
      const expectedInputs = new Map(inputs.map((input) => [input.inputHash, input.input]));
      if (expectedInputs.size !== inputs.length || inputs.some((input) => embeddingInputHash(input.input) !== input.inputHash)) throw new RagStoreError("invalid-database-data");
      const found = new Set<string>();
      // Reuse needs identity and vector validity, not thousands of vector coordinates.
      for (let offset = 0; offset < inputs.length; offset += 512) {
        const batch = inputs.slice(offset, offset + 512), allowed = new Set(batch.map((input) => input.inputHash));
        const { rows } = await lease.query("SELECT input_hash,input_text,dimensions,vector_dims(embedding) AS vector_dimensions,vector_norm(embedding) AS vector_norm FROM rag_embedding_cache WHERE profile_id=$1 AND input_hash=ANY($2::text[])", [profile.id, batch.map((input) => input.inputHash)]);
        for (const row of rows) {
          const key = String(row.input_hash), norm = Number(row.vector_norm);
          if (!allowed.has(key) || found.has(key) || row.input_text !== expectedInputs.get(key) || row.dimensions !== profile.dimensions
            || row.vector_dimensions !== profile.dimensions || !Number.isFinite(norm) || Math.abs(norm - 1) > 0.001) throw new RagStoreError("invalid-database-data");
          found.add(key);
        }
      }
      return found;
    },
    async uncertain(profile) {
      await lease.query("UPDATE rag_embedding_attempts SET state='uncertain',finished_at=now(),error_code='interrupted' WHERE profile_id=$1 AND state='inflight'", [profile.id]);
      const { rows } = await lease.query("SELECT input_hashes FROM rag_embedding_attempts WHERE profile_id=$1 AND state='uncertain'", [profile.id]);
      return [...new Set(rows.flatMap((row) => {
        if (!Array.isArray(row.input_hashes) || !row.input_hashes.every((hash) => typeof hash === "string" && hashPattern.test(hash))) throw new RagStoreError("invalid-database-data");
        return row.input_hashes as string[];
      }))];
    },
    async startAttempt(plan, hashes) {
      const id = randomUUID();
      await lease.query("INSERT INTO rag_embedding_attempts(id,revision_id,profile_id,input_hashes,state) VALUES($1,$2,$3,$4,'inflight')", [id, plan.revisionId, plan.profile.id, [...hashes]]);
      return id;
    },
    async completeAttempt(id, profile, entries, usage) {
      for (const entry of entries) vectorParameter(entry.vector, profile.dimensions);
      await transaction(lease, async () => {
        for (const entry of entries) {
          await lease.query("INSERT INTO rag_embedding_cache(profile_id,dimensions,input_hash,input_text,embedding) VALUES($1,$2,$3,$4,$5::vector) ON CONFLICT DO NOTHING", [profile.id, profile.dimensions, entry.inputHash, entry.input, vectorParameter(entry.vector, profile.dimensions)]);
        }
        const result = await lease.query("UPDATE rag_embedding_attempts SET state='complete',finished_at=now(),prompt_tokens=$2,total_tokens=$3,error_code=NULL WHERE id=$1 AND state='inflight'", [id, usage.promptTokens, usage.totalTokens]);
        if (result.rowCount !== 1) throw new RagStoreError("invalid-database-data");
      });
    },
    async failAttempt(id, uncertain) {
      await lease.query("UPDATE rag_embedding_attempts SET state=$2,finished_at=now(),error_code=$3 WHERE id=$1 AND state='inflight'", [id, uncertain ? "uncertain" : "failed", uncertain ? "outcome-unknown" : "not-attempted"]);
    },
  };
}

async function currentDocumentContext(lease: Lease, collection: "current" | "archive"): Promise<RagDocumentImportContext> {
  if (!["current", "archive"].includes(collection) || await schemaVersion(lease) !== 2) throw new RagStoreError("invalid-schema");
  const snapshot = await captureSearchInLease(lease, { kind: collection });
  const head = collection === "current" ? snapshot?.heads.documents : snapshot?.heads.archive;
  let dataset = emptyDocumentDataset();
  const suppressions: LegacySuppression[] = [], legacySources: { sourceVersionId: string; document: KnowledgeDocument }[] = [];
  if (head) {
    const members = await lease.query("SELECT source_version_id FROM rag_revision_documents WHERE revision_id=$1 ORDER BY source_version_id LIMIT 1025", [head.revisionId]);
    dataset = await readDocumentDataset(lease, members.rows.map((row) => String(row.source_version_id)));
    if (collection === "current") {
      const maps = await lease.query(`SELECT p.legacy_source_id,p.legacy_source_version_id,p.document_source_version_id,
        s.source_id AS origin_id,s.status AS origin_status,v.id AS target_id,v.status AS target_status
        FROM rag_revision_legacy_replacements p LEFT JOIN rag_source_versions s ON s.id=p.legacy_source_version_id
        LEFT JOIN rag_document_versions v ON v.id=p.document_source_version_id WHERE p.revision_id=$1 ORDER BY p.legacy_source_id LIMIT 4097`, [head.revisionId]);
      if (maps.rows.length > 4096) throw new RagStoreError("invalid-database-data");
      for (const row of maps.rows) {
        if (typeof row.legacy_source_id !== "string" || row.origin_id !== row.legacy_source_id || row.origin_status !== "current" || row.target_status !== "current"
          || typeof row.legacy_source_version_id !== "string" || !hashPattern.test(row.legacy_source_version_id)
          || typeof row.document_source_version_id !== "string" || !hashPattern.test(row.document_source_version_id) || row.target_id !== row.document_source_version_id) throw new RagStoreError("invalid-database-data");
        suppressions.push({ legacySourceId: row.legacy_source_id, legacySourceVersionId: row.legacy_source_version_id, documentSourceVersionId: row.document_source_version_id });
      }
    }
  }
  if (collection === "current" && snapshot?.heads.legacy) {
    const legacy = await lease.query(`SELECT ${sourceColumns} FROM rag_revision_sources rs JOIN rag_source_versions s ON s.id=rs.source_version_id
      WHERE rs.revision_id=$1 AND s.status='current' AND s.visibility='public' ORDER BY s.id LIMIT 4097`, [snapshot.heads.legacy.revisionId]);
    if (legacy.rows.length > 4096) throw new RagStoreError("invalid-database-data");
    for (const row of legacy.rows) legacySources.push({ sourceVersionId: String(row.source_version_id), document: checkedDocument(row) });
  }
  return freeze({ collection, snapshot, dataset, suppressions, legacySources });
}
function targetHead(snapshot: RagSearchSnapshot | null, collection: "current" | "archive") {
  return collection === "current" ? snapshot?.heads.documents ?? null : snapshot?.heads.archive ?? null;
}
function publicationAlreadyApplied(plan: PreparedDocumentCorpus, current: RagSearchSnapshot | null) {
  return targetHead(current, plan.collection)?.revisionId === plan.revisionId
    && (plan.collection === "archive" || canonicalJson(current?.heads.legacy ?? null) === canonicalJson(plan.baseSnapshot?.heads.legacy ?? null));
}
function assertDocumentTransition(plan: PreparedDocumentCorpus, context: RagDocumentImportContext, now: number): void {
  if (context.collection !== plan.collection || (context.snapshot?.id ?? null) !== (plan.baseSnapshot?.id ?? null)) throw new RagStoreError("revision-conflict");
  const old = new Map(context.dataset.documents.map((doc) => [doc.sourceVersionId, doc]));
  const next = new Map(plan.dataset.documents.map((doc) => [doc.sourceVersionId, doc]));
  const upserts = new Set(plan.upsertSourceVersionIds), retired = new Set(plan.retireSourceVersionIds);
  if ([...retired].some((id) => !old.has(id) || next.has(id)) || [...next.keys()].some((id) => !old.has(id) && !upserts.has(id))) throw new RagStoreError("invalid-database-data");
  for (const [id, document] of old) if (!next.has(id) && !retired.has(id)
    && !(plan.collection === "current" && plan.dataset.documents.some((candidate) => candidate.id === document.id && upserts.has(candidate.sourceVersionId)))) throw new RagStoreError("invalid-database-data");
  if (plan.collection === "current" && plan.dataset.documents.some((doc) => context.dataset.documents.some((oldDoc) => oldDoc.id === doc.id && oldDoc.authority !== doc.authority))) throw new RagStoreError("invalid-database-data");
  const before = new Map(context.suppressions.map((entry) => [entry.legacySourceId, entry]));
  const after = new Map(plan.suppressions.map((entry) => [entry.legacySourceId, entry]));
  const restored = new Map(plan.restores.map((entry) => [entry.legacySourceId, entry]));
  for (const restore of plan.restores) {
    if (!before.has(restore.legacySourceId) || after.has(restore.legacySourceId)
      || !context.legacySources.some((entry) => entry.document.id === restore.legacySourceId && entry.sourceVersionId === restore.legacySourceVersionId)) throw new RagStoreError("revision-conflict");
  }
  for (const sourceId of before.keys()) if (!after.has(sourceId) && !restored.has(sourceId)) throw new RagStoreError("invalid-database-data");
  const introduced = new Set<string>();
  for (const suppression of plan.suppressions) {
    if (canonicalJson(before.get(suppression.legacySourceId) ?? null) === canonicalJson(suppression)) continue;
    const origin = context.legacySources.find((entry) => entry.sourceVersionId === suppression.legacySourceVersionId && entry.document.id === suppression.legacySourceId);
    const target = next.get(suppression.documentSourceVersionId);
    if (!origin || !target || target.authority !== origin.document.authority || !documentUsable(target, { kind: "current" }, now)
      || !plan.dataset.chunks.some((chunk) => chunk.sourceVersionId === target.sourceVersionId)
      || !plan.promotionLegacySourceVersionIds.includes(suppression.legacySourceVersionId)) throw new RagStoreError("invalid-database-data");
    introduced.add(suppression.legacySourceVersionId);
  }
  if (plan.promotionLegacySourceVersionIds.some((id) => !introduced.has(id))) throw new RagStoreError("invalid-database-data");
}
async function assertLegacySpace(lease: Lease, profile: EmbeddingProfile) {
  if (profile.inputVersion !== "title-locator-text-v1") throw new RagStoreError("invalid-database-data");
  if (await schemaVersion(lease) === 2) {
    const view = await captureSearchInLease(lease, { kind: "current" });
    if (view?.heads.documents && !sameSpace(view.heads.documents.profile, profile)) throw new RagStoreError("profile-conflict");
  }
}
export async function openRagDocumentImportSession(options: RagDatabaseOptions, signal?: AbortSignal): Promise<RagDocumentImportSession> {
  return openRagDocumentImportSessionWithPool(createRagPool(options), signal);
}
export async function openRagDocumentImportSessionWithPool(pool: RagSqlPool, signal?: AbortSignal, now: () => number = Date.now): Promise<RagDocumentImportSession> {
  const manager = managePool(pool); let lease: Lease;
  try {
    lease = await manager.acquire(signal);
    const { rows } = await lease.query("SELECT pg_try_advisory_lock(18472, 1) AS acquired");
    if (rows[0]?.acquired !== true) throw new RagStoreError("import-busy");
    if (await schemaVersion(lease) !== 2) throw new RagStoreError("invalid-schema");
  } catch (error) { await manager.close(); throw error; }
  let closed = false;
  const contexts = new Map<"current" | "archive", RagDocumentImportContext>();
  async function context(collection: "current" | "archive") {
    const value = await transaction(lease, () => currentDocumentContext(lease, collection), true);
    contexts.set(collection, value); return value;
  }
  async function preflight(plan: PreparedDocumentCorpus) {
    const current = await captureSearchInLease(lease, { kind: plan.collection });
    if (publicationAlreadyApplied(plan, current)) return true;
    if ((current?.id ?? null) !== (plan.baseSnapshot?.id ?? null)) throw new RagStoreError("revision-conflict");
    let base = contexts.get(plan.collection);
    if (!base || (base.snapshot?.id ?? null) !== (current?.id ?? null)) { base = await currentDocumentContext(lease, plan.collection); contexts.set(plan.collection, base); }
    assertDocumentTransition(plan, base, now()); return false;
  }
  return {
    context,
    ...embeddingSession(lease),
    async prepare(input) {
      const plan = checkedDocumentPlan(input);
      return transaction(lease, async () => {
        if (await preflight(plan)) return "ready";
        const p = plan.profile;
        await lease.query("INSERT INTO rag_profiles(id,provider,model,dimensions,input_version) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [p.id, p.provider, p.model, p.dimensions, p.inputVersion]);
        await lease.query(`INSERT INTO rag_revisions(id,profile_id,manifest_hash,state,expected_sources,expected_chunks,data_schema_version,collection,expected_blocks,expected_suppressions,expected_restores)
          VALUES($1,$2,$3,'building',$4,$5,3,$6,$7,$8,$9) ON CONFLICT DO NOTHING`, [plan.revisionId, p.id, plan.manifestHash, plan.dataset.documents.length, plan.chunks.length, plan.collection, plan.dataset.blocks.length, plan.suppressions.length, plan.restores.length]);
        const saved = await lease.query("SELECT profile_id,manifest_hash,state,expected_sources,expected_chunks,data_schema_version,collection,expected_blocks,expected_suppressions,expected_restores FROM rag_revisions WHERE id=$1 FOR UPDATE", [plan.revisionId]);
        const r = saved.rows[0];
        if (saved.rows.length !== 1 || r.profile_id !== p.id || r.manifest_hash !== plan.manifestHash || r.data_schema_version !== 3 || r.collection !== plan.collection
          || r.expected_sources !== plan.dataset.documents.length || r.expected_chunks !== plan.chunks.length || r.expected_blocks !== plan.dataset.blocks.length
          || r.expected_suppressions !== plan.suppressions.length || r.expected_restores !== plan.restores.length) throw new RagStoreError("invalid-database-data");
        if (r.state === "ready") return "ready";
        if (!["building", "failed"].includes(String(r.state))) throw new RagStoreError("invalid-database-data");
        if (r.state === "failed") await lease.query("UPDATE rag_revisions SET state='building',error_code=NULL WHERE id=$1", [plan.revisionId]);
        for (const doc of plan.dataset.documents) {
          const blocks = plan.dataset.blocks.filter((item) => item.sourceVersionId === doc.sourceVersionId), chunks = plan.dataset.chunks.filter((item) => item.sourceVersionId === doc.sourceVersionId);
          await lease.query(`INSERT INTO rag_document_versions(id,source_id,authority,status,checked_at,review_after,effective_from,effective_until,block_count,chunk_count,metadata)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) ON CONFLICT DO NOTHING`, [doc.sourceVersionId, doc.id, doc.authority, doc.status, doc.checkedAt + "T00:00:00Z", doc.reviewAfter + "T00:00:00Z", doc.effectiveFrom, doc.effectiveUntil, blocks.length, chunks.length, JSON.stringify(doc)]);
          const existing = await lease.query("SELECT metadata,block_count,chunk_count,sealed FROM rag_document_versions WHERE id=$1", [doc.sourceVersionId]);
          if (existing.rows.length !== 1 || canonicalJson(existing.rows[0].metadata) !== canonicalJson(doc) || existing.rows[0].block_count !== blocks.length || existing.rows[0].chunk_count !== chunks.length || typeof existing.rows[0].sealed !== "boolean") throw new RagStoreError("invalid-database-data");
          if (!existing.rows[0].sealed) {
            for (const [ordinal, block] of blocks.entries()) await lease.query("INSERT INTO rag_document_blocks(source_version_id,block_id,ordinal,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING", [doc.sourceVersionId, block.id, ordinal, JSON.stringify(block)]);
            for (const [ordinal, chunk] of chunks.entries()) await lease.query("INSERT INTO rag_document_chunks(source_version_id,chunk_id,ordinal,payload) VALUES($1,$2,$3,$4::jsonb) ON CONFLICT DO NOTHING", [doc.sourceVersionId, chunk.id, ordinal, JSON.stringify(chunk)]);
          }
          await lease.query("INSERT INTO rag_revision_documents(revision_id,source_version_id,source_id,scope) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [plan.revisionId, doc.sourceVersionId, doc.id, plan.collection]);
        }
        if (canonicalJson(await readDocumentDataset(lease, plan.dataset.documents.map((doc) => doc.sourceVersionId))) !== canonicalJson(plan.dataset)) throw new RagStoreError("invalid-database-data");
        for (const entry of plan.suppressions) await lease.query("INSERT INTO rag_revision_legacy_replacements(revision_id,legacy_source_id,legacy_source_version_id,document_source_version_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING", [plan.revisionId, entry.legacySourceId, entry.legacySourceVersionId, entry.documentSourceVersionId]);
        for (const entry of plan.restores) await lease.query("INSERT INTO rag_revision_legacy_restores(revision_id,legacy_source_id,legacy_source_version_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING", [plan.revisionId, entry.legacySourceId, entry.legacySourceVersionId]);
        return "building";
      }, false, true);
    },
    async publish(input) {
      const plan = checkedDocumentPlan(input);
      await transaction(lease, async () => {
        if (await preflight(plan)) return;
        const state = await lease.query("SELECT state,manifest_hash FROM rag_revisions WHERE id=$1 FOR UPDATE", [plan.revisionId]);
        if (state.rows.length !== 1 || state.rows[0].manifest_hash !== plan.manifestHash) throw new RagStoreError("invalid-database-data");
        if (state.rows[0].state !== "ready") {
          if (state.rows[0].state !== "building") throw new RagStoreError("invalid-database-data");
          for (const item of plan.chunks) await lease.query("INSERT INTO rag_revision_document_chunks(revision_id,source_version_id,chunk_id,profile_id,input_hash) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [plan.revisionId, item.raw.sourceVersionId, item.raw.id, plan.profile.id, item.inputHash]);
          await lease.query("UPDATE rag_revisions SET state='ready',finished_at=now(),error_code=NULL WHERE id=$1", [plan.revisionId]);
        }
        await lease.query("INSERT INTO rag_heads(name,revision_id) VALUES($1,$2) ON CONFLICT(name) DO UPDATE SET revision_id=EXCLUDED.revision_id,updated_at=now()", [plan.collection === "current" ? "public-documents" : "public-archive", plan.revisionId]);
      }, false, true);
      contexts.delete(plan.collection);
    },
    async close() {
      if (closed) return; closed = true;
      try { await lease.query("SELECT pg_advisory_unlock(18472, 1)"); } catch { lease.release(true); }
      finally { lease.release(); await manager.close(); }
    },
  };
}
