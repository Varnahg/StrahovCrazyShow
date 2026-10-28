import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { createEmbeddingProfile, documentEmbeddingInput, embeddingInputHash, type EmbeddingProfile } from "./rag-embeddings";
import { validateKnowledgeDatasets, type KnowledgeAuthority, type KnowledgeChunk, type KnowledgeDocument, type KnowledgeTopic, type RawKnowledgeChunk } from "./crazy-typka-retrieval";

export type RagSnapshot = { revisionId: string; profile: EmbeddingProfile };
export type VectorHit = { chunk: KnowledgeChunk; sourceVersionId: string; distance: number };
export type VectorKnowledgeStore = {
  captureActive(signal?: AbortSignal): Promise<RagSnapshot | null>;
  search(snapshot: RagSnapshot, queryVector: readonly number[], filters: { authority?: KnowledgeAuthority; topics?: readonly KnowledgeTopic[]; limit: number; now?: number }, signal?: AbortSignal): Promise<readonly VectorHit[]>;
  assertCurrent(snapshot: RagSnapshot, sourceVersionIds: readonly string[], now?: number, signal?: AbortSignal): Promise<boolean>;
  close(): Promise<void>;
};
export type RagDatabaseOptions = { connectionString: string; connectionTimeoutMs?: number; statementTimeoutMs?: number; maxConnections?: number };
export class RagStoreError extends Error {
  constructor(readonly code: "database-unavailable" | "unsafe-database-logging" | "invalid-database-data" | "invalid-vector" | "aborted" | "closed" | "import-busy" | "revision-conflict" | "invalid-schema") { super(code); }
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

export function validateProfile(profile: EmbeddingProfile): void {
  try {
    const expected = createEmbeddingProfile({ model: profile.model, dimensions: profile.dimensions });
    if (profile.provider !== "openai" || profile.inputVersion !== expected.inputVersion || profile.id !== expected.id) throw new Error();
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
async function transaction<T>(lease: Lease, action: () => Promise<T>, readOnly = false): Promise<T> {
  await lease.query(readOnly ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
  try { const result = await action(); await lease.query("COMMIT"); return result; }
  catch (error) { try { await lease.query("ROLLBACK"); } catch { lease.release(true); } throw error; }
}
async function active(lease: Lease): Promise<RagSnapshot | null> {
  const { rows } = await lease.query(`SELECT v.version, h.revision_id, p.id, p.provider, p.model, p.dimensions, p.input_version
    FROM rag_schema_version v LEFT JOIN rag_heads h ON h.name='public'
    LEFT JOIN rag_revisions r ON r.id=h.revision_id AND r.state='ready'
    LEFT JOIN rag_profiles p ON p.id=r.profile_id WHERE v.singleton=true`);
  if (rows.length !== 1 || rows[0].version !== 1) throw new RagStoreError("invalid-schema");
  const row = rows[0]; if (row.revision_id === null) return null;
  const profile = { id: row.id, provider: row.provider, model: row.model, dimensions: row.dimensions, inputVersion: row.input_version } as EmbeddingProfile;
  const snapshot = { revisionId: row.revision_id as string, profile }; snapshotValid(snapshot); return snapshot;
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
export function createVectorKnowledgeStore(options: RagDatabaseOptions): VectorKnowledgeStore {
  return createVectorKnowledgeStoreWithPool(createRagPool(options));
}
/** Explicit injectable SQL transport for CPU boundary tests; never a file fallback. */
export function createVectorKnowledgeStoreWithPool(pool: RagSqlPool): VectorKnowledgeStore {
  const manager = managePool(pool);
  return {
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

export async function migrateRagSchema(options: RagDatabaseOptions, signal?: AbortSignal): Promise<void> {
  const manager = managePool(createRagPool(options));
  try {
    const sql = await readFile(new URL("./rag-schema.sql", import.meta.url), "utf8");
    await manager.run(signal, (lease) => transaction(lease, async () => {
      await lease.query("SELECT pg_advisory_xact_lock(18472, 1)");
      await lease.query(sql); await active(lease);
    }));
  } finally { await manager.close(); }
}

export type CachedEmbedding = { input: string; inputHash: string; vector: number[] };
export type RagImportSession = {
  prepare(plan: PreparedCorpus): Promise<"building" | "ready">;
  cached(profile: EmbeddingProfile, inputs: readonly { input: string; inputHash: string }[]): Promise<Set<string>>;
  uncertain(profile: EmbeddingProfile): Promise<readonly string[]>;
  startAttempt(plan: PreparedCorpus, hashes: readonly string[]): Promise<string>;
  completeAttempt(id: string, profile: EmbeddingProfile, entries: readonly CachedEmbedding[], usage: { promptTokens: number; totalTokens: number }): Promise<void>;
  failAttempt(id: string, uncertain: boolean): Promise<void>;
  publish(plan: PreparedCorpus): Promise<void>;
  close(): Promise<void>;
};
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
    async cached(profile, inputs) {
      validateProfile(profile); if (!inputs.length) return new Set();
      const { rows } = await lease.query("SELECT input_hash,input_text,dimensions,embedding::text AS embedding FROM rag_embedding_cache WHERE profile_id=$1 AND input_hash=ANY($2::text[])", [profile.id, inputs.map((input) => input.inputHash)]);
      const found = new Set<string>();
      for (const row of rows) {
        const expected = inputs.find((input) => input.inputHash === row.input_hash);
        if (!expected || row.input_text !== expected.input || row.dimensions !== profile.dimensions || typeof row.embedding !== "string") throw new RagStoreError("invalid-database-data");
        try { vectorParameter(JSON.parse(row.embedding), profile.dimensions); } catch { throw new RagStoreError("invalid-database-data"); }
        found.add(expected.inputHash);
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
    async publish(plan) {
      await transaction(lease, async () => {
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
