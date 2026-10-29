import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import original from "../server/data/silicon-hill-knowledge.json";
import { createEmbeddingProfile, documentEmbeddingInputV3, embeddingInputHash } from "../server/rag-embeddings";
import { prepareRagCorpus } from "../server/rag-ingest";
import { createVectorKnowledgeStoreWithPool, openRagImportSessionWithPool, openRagDocumentImportSessionWithPool, migrateRagSchemaWithPool, vectorParameter, type RagSqlClient, type RagSqlPool, type SqlResult } from "../server/rag-vector-store";
import { buildKnowledgeDocumentV3, parserProfileSha256, requirePublishableExtraction, validateWorkerEnvelope } from "../server/rag-document-contract";
import { RAG_TOKENIZER } from "../shared/rag-provenance";
import type { DocumentMetadataV3, KnowledgeDocumentBundleV3 } from "../server/rag-knowledge-types";

const now = Date.parse("2026-10-28T12:00:00Z"), profile = createEmbeddingProfile({ dimensions: 3 });
function fixtureData() {
  const source = { ...original.sources[0], id: "sh-vector-test", title: "Synthetic test source", checkedAt: "2026-10-28", reviewAfter: "2026-11-28", effectiveFrom: null, effectiveUntil: null };
  const text = "Veřejný testovací text.";
  return { version: 2, sources: [source], chunks: [{ id: "sh-vector-test-chunk", sourceId: source.id, text, sourceLocator: "Test", topic: "membership", keywords: ["test"], contentSha256: createHash("sha256").update(text).digest("hex") }] };
}
const plan = prepareRagCorpus([fixtureData()], [], profile);
const header = { version: 1, revision_id: plan.revisionId, id: profile.id, provider: profile.provider, model: profile.model, dimensions: profile.dimensions, input_version: profile.inputVersion };
function hitRow() {
  const source = plan.sources[0], chunk = plan.chunks[0];
  return { chunk_id: chunk.raw.id, payload: chunk.raw, input_hash: chunk.inputHash, input_text: chunk.input, source_version_id: source.id, content_hash: source.contentHash,
    metadata: source.metadata, authority: source.metadata.authority, status: source.metadata.status,
    checked_ms: String(Date.parse(source.metadata.checkedAt + "T00:00:00Z")), review_ms: String(Date.parse(source.metadata.reviewAfter + "T00:00:00Z")), from_ms: null, until_ms: null, distance: 0.25 };
}
function fakePool(handler: (sql: string, values?: unknown[]) => Promise<SqlResult> | SqlResult = () => ({ rows: [] })) {
  const calls: { sql: string; values?: unknown[] }[] = [], releases: boolean[] = [];
  let ends = 0;
  const client: RagSqlClient = { async query(sql, values) { calls.push({ sql, values });
    if (sql.includes("current_setting")) return { rows: [{ normal: "0", errors: "0" }] };
    if (sql.includes("FROM rag_schema_version")) return { rows: [header] };
    return handler(sql, values);
  }, release(destroy = false) { releases.push(destroy); } };
  const pool: RagSqlPool = { async connect() { return client; }, async end() { ends++; }, on() {} };
  return { pool, client, calls, releases, ends: () => ends };
}
test("store uses parameterized SQL cosine with public/current/profile/time filters and validates provenance", async () => {
  const f = fakePool((sql) => ({ rows: sql.includes("e.embedding <=>") ? [hitRow()] : [] }));
  const store = createVectorKnowledgeStoreWithPool(f.pool), snapshot = await store.captureActive();
  assert.deepEqual(snapshot, { revisionId: plan.revisionId, profile });
  const hits = await store.search(snapshot!, [1, 0, 0], { authority: "silicon-hill", topics: ["membership"], limit: 4, now });
  assert.equal(hits[0].chunk.id, plan.chunks[0].raw.id); assert.equal(hits[0].sourceVersionId, plan.sources[0].id); assert.equal(hits[0].distance, 0.25);
  const sql = f.calls.find((call) => call.sql.includes("e.embedding <=>"))!;
  assert.match(sql.sql, /ORDER BY e\.embedding <=> \$1::vector/);
  assert.match(sql.sql, /s.status='current' AND s.visibility='public'/);
  assert.match(sql.sql, /s.effective_from/); assert.match(sql.sql, /s.effective_until/); assert.match(sql.sql, /s.review_after/);
  assert.equal(sql.values![0], "[1,0,0]"); assert.equal(sql.values![2], profile.id); assert.equal(sql.values![3], new Date(now).toISOString());
  assert.ok(!sql.sql.includes("[1,0,0]")); assert.ok(!sql.sql.includes("testovací"));
  assert.ok(f.calls.some((call) => call.sql === "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"));
  assert.ok(f.calls.some((call) => call.sql === "COMMIT"));
  await store.close(); assert.equal(f.ends(), 1);
});
test("empty head is not a schema error, schema failures never turn into empty evidence", async () => {
  const f = fakePool();
  const query = f.client.query;
  f.client.query = async (sql, values) => sql.includes("FROM rag_schema_version") ? { rows: [{ version: 1, revision_id: null }] } : query(sql, values);
  const store = createVectorKnowledgeStoreWithPool(f.pool); assert.equal(await store.captureActive(), null); await store.close();
  const bad = fakePool(); bad.client.query = async () => { throw new Error("postgres://private-password@host/db"); };
  const unavailable = createVectorKnowledgeStoreWithPool(bad.pool);
  await assert.rejects(unavailable.captureActive(), (error: any) => error.code === "database-unavailable" && !error.message.includes("password"));
  assert.deepEqual(bad.releases, [true]); await unavailable.close();
});
test("unsafe bind logging is rejected before any vector or document parameters are sent", async () => {
  const f = fakePool(); f.client.query = async () => ({ rows: [{ normal: "-1", errors: "0" }] });
  const store = createVectorKnowledgeStoreWithPool(f.pool);
  await assert.rejects(store.search({ revisionId: plan.revisionId, profile }, [1, 0, 0], { limit: 4, now }), (error: any) => error.code === "unsafe-database-logging");
  assert.deepEqual(f.releases, [true]); await store.close();
});
test("corrupt database payload/hash/URL/profile clock metadata is a hard error", async () => {
  for (const mutate of [
    (row: any) => { row.payload = { ...row.payload, text: "Modified without hash" }; },
    (row: any) => { row.metadata = { ...row.metadata, url: "https://evil.invalid" }; },
    (row: any) => { row.input_hash = "a".repeat(64); },
    (row: any) => { row.checked_ms = "0"; },
    (row: any) => { row.chunk_id = "sh-other"; },
    (row: any) => { row.source_version_id = "f".repeat(64); },
  ]) {
    const row = hitRow(); mutate(row);
    const f = fakePool((sql) => ({ rows: sql.includes("e.embedding <=>") ? [row] : [] }));
    const store = createVectorKnowledgeStoreWithPool(f.pool);
    await assert.rejects(store.search({ revisionId: plan.revisionId, profile }, [1, 0, 0], { limit: 4, now }), (error: any) => error.code === "invalid-database-data");
    assert.ok(f.calls.some((call) => call.sql === "ROLLBACK")); await store.close();
  }
});
test("assertCurrent rejects expired, missing or changed publication dependencies without a new retrieval", async () => {
  const f = fakePool((sql) => ({ rows: sql.includes("FROM rag_revision_sources") ? [hitRow()] : [] }));
  const store = createVectorKnowledgeStoreWithPool(f.pool), snapshot = { revisionId: plan.revisionId, profile };
  assert.equal(await store.assertCurrent(snapshot, [plan.sources[0].id], now), true);
  assert.equal(await store.assertCurrent(snapshot, [plan.sources[0].id], Date.parse("2026-11-28T00:00:00Z")), false);
  assert.equal(await store.assertCurrent({ ...snapshot, revisionId: "0".repeat(64) }, [], now), false);
  assert.equal(await store.assertCurrent(snapshot, [], now), true);
  assert.ok(!f.calls.some((call) => call.sql.includes("<=>"))); await store.close();
});
test("vector validation rejects wrong dimension, nonfinite, zero and nonunit inputs locally", () => {
  for (const vector of [[1, 0], [NaN, 0, 0], [Infinity, 0, 0], [0, 0, 0], [5, 0, 0]]) assert.throws(() => vectorParameter(vector, 3));
  assert.equal(vectorParameter([1, 0, 0], 3), "[1,0,0]");
});
test("abort during acquisition destroys a late connection; abort/close during SQL never returns unfinished work to pool", async () => {
  let connected!: (value: RagSqlClient) => void; const releases: boolean[] = [];
  const pool: RagSqlPool = { connect: () => new Promise((resolve) => { connected = resolve; }), async end() {} };
  const store = createVectorKnowledgeStoreWithPool(pool), controller = new AbortController();
  const work = store.captureActive(controller.signal); controller.abort();
  await assert.rejects(work, (error: any) => error.code === "aborted");
  connected({ async query() { return { rows: [] }; }, release(destroy) { releases.push(!!destroy); } });
  await new Promise((resolve) => setImmediate(resolve)); assert.deepEqual(releases, [true]); await store.close();
  let entered!: () => void; const pending = new Promise<void>((resolve) => { entered = resolve; });
  const f = fakePool(); const normal = f.client.query;
  f.client.query = async (sql, values) => { if (sql.includes("FROM rag_schema_version")) { entered(); return new Promise(() => {}); } return normal(sql, values); };
  const waiting = createVectorKnowledgeStoreWithPool(f.pool), action = waiting.captureActive(); await pending;
  await waiting.close(); await assert.rejects(action, (error: any) => error.code === "aborted");
  assert.deepEqual(f.releases, [true]); await waiting.close(); assert.equal(f.ends(), 1);
});
test("import session serializes before work and releases its exact advisory lock", async () => {
  const f = fakePool((sql) => ({ rows: sql.includes("pg_try_advisory_lock") ? [{ acquired: true }] : [] }));
  const session = await openRagImportSessionWithPool(f.pool); await session.close(); await session.close();
  assert.equal(f.calls.filter((call) => call.sql.includes("pg_try_advisory_lock")).length, 1);
  assert.equal(f.calls.filter((call) => call.sql.includes("pg_advisory_unlock")).length, 1); assert.equal(f.ends(), 1);
  const blocked = fakePool((sql) => ({ rows: sql.includes("pg_try_advisory_lock") ? [{ acquired: false }] : [] }));
  await assert.rejects(openRagImportSessionWithPool(blocked.pool), (error: any) => error.code === "import-busy");
  assert.deepEqual(blocked.releases, [true]); assert.equal(blocked.ends(), 1);
});

test("a checked-out client connection error is handled during the external import wait and listeners are cleaned", async () => {
  const emitter = new EventEmitter();
  const f = fakePool((sql) => ({ rows: sql.includes("pg_try_advisory_lock") ? [{ acquired: true }] : [] }));
  f.client.on = (event, callback) => emitter.on(event, callback);
  f.client.off = (event, callback) => emitter.off(event, callback);
  const session = await openRagImportSessionWithPool(f.pool);
  assert.equal(emitter.listenerCount("error"), 1);
  assert.doesNotThrow(() => emitter.emit("error", new Error("private DB connection detail")));
  await assert.rejects(session.uncertain(profile), (error: any) => error.code === "database-unavailable" && !error.message.includes("private"));
  assert.deepEqual(f.releases, [true]); assert.equal(emitter.listenerCount("error"), 0);
  await session.close(); assert.equal(f.ends(), 1);
  const normal = new EventEmitter(), healthy = fakePool();
  healthy.client.on = (event, callback) => normal.on(event, callback);
  healthy.client.off = (event, callback) => normal.off(event, callback);
  const store = createVectorKnowledgeStoreWithPool(healthy.pool);
  await store.captureActive(); assert.equal(normal.listenerCount("error"), 0);
  await store.close();
});

function documentFixture(status: "current" | "archived" = "current", dated = true): KnowledgeDocumentBundleV3 {
  const metadata: DocumentMetadataV3 = { ...original.sources[0], id: "suz-sql-document", title: "Syntetický SQL dokument", authority: "suz", status, archiveReason: status === "archived" ? "Historická příloha" : null,
    url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty", discoveryUrl: "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty",
    checkedAt: "2026-10-28", reviewAfter: "2026-11-28", effectiveFrom: status === "archived" && dated ? "2025-09-01T00:00:00+02:00" : null,
    effectiveUntil: status === "archived" && dated ? "2026-09-01T00:00:00+02:00" : null, author: null, license: null, licenseUrl: null };
  const text = "Úplný obsah syntetického dokumentu.", span = { blockId: "b-stable", locator: "PDF strana 1", page: 1 };
  const parserProfile = { id: "docling-2.144.0-strahov-v1", packages: { "docling-slim": "2.144.0", tiktoken: "0.12.0" }, pipeline: "docling-native-pdf", configurationHash: "b".repeat(64), modelManifestHash: null, tokenizer: { ...RAG_TOKENIZER, version: "0.12.0" } };
  const envelope = { schemaVersion: 1, sourceId: metadata.id, inputSha256: "a".repeat(64), status: "ok", format: "pdf", parserProfile,
    document: { title: metadata.title, pageCount: 1, complete: true }, blocks: [{ id: "b-stable", kind: "text", text, headingPath: [], spans: [span] }],
    chunks: [{ id: "c-stable", text, headingPath: [], tokenCount: 15, blockIds: ["b-stable"], spans: [span] }],
    quality: { processedPages: 1, expectedPages: 1, inputTextCharacters: null, outputTextCharacters: [...text].length, tableCount: 0, ocrPages: [], issues: [] }, links: [] };
  return buildKnowledgeDocumentV3(metadata, requirePublishableExtraction(validateWorkerEnvelope(envelope, { sourceId: metadata.id, inputSha256: envelope.inputSha256, parserProfileSha256: parserProfileSha256(parserProfile) })), "native");
}
function viewFixture(status: "current" | "archived" = "current", dated = true) {
  const bundle = documentFixture(status, dated), docProfile = createEmbeddingProfile({ dimensions: 3, inputVersion: "title-heading-text-v2" });
  const headName = status === "current" ? "public-documents" : "public-archive";
  const state = { revision: "d".repeat(64), legacyRevision: plan.revisionId, includeDocument: true, includeLegacy: true, docProfile, suppressed: false, corruptOrdinal: false };
  const calls: { sql: string; values?: unknown[] }[] = [];
  function docRow() {
    const d = bundle.document;
    return { source_version_id: d.sourceVersionId, source_id: d.id, metadata: d, authority: d.authority, status: d.status, sealed: true,
      checked_ms: String(Date.parse(d.checkedAt + "T00:00:00Z")), review_ms: String(Date.parse(d.reviewAfter + "T00:00:00Z")),
      from_ms: d.effectiveFrom === null ? null : String(Date.parse(d.effectiveFrom)), until_ms: d.effectiveUntil === null ? null : String(Date.parse(d.effectiveUntil)) };
  }
  const pool: RagSqlPool = { async connect() { return { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes("current_setting")) return { rows: [{ normal: "0", errors: "0" }] };
    if (sql.includes("FROM rag_schema_version")) return { rows: [{ version: 2 }] };
    if (sql.includes("FROM rag_heads h")) return { rows: [
      ...(state.includeLegacy ? [{ name: "public", revision_id: state.legacyRevision, profile_id: profile.id, provider: "openai", model: profile.model, dimensions: profile.dimensions, input_version: profile.inputVersion, data_schema_version: 2, collection: "current" }] : []),
      ...(state.includeDocument ? [{ name: headName, revision_id: state.revision, profile_id: state.docProfile.id, provider: "openai", model: state.docProfile.model, dimensions: state.docProfile.dimensions, input_version: state.docProfile.inputVersion, data_schema_version: 3, collection: status === "current" ? "current" : "archive" }] : []),
    ].filter((row) => Array.isArray(values?.[0]) && values[0].includes(row.name)) };
    if (sql.startsWith("SELECT * FROM (")) {
      const text = documentEmbeddingInputV3(bundle.document, bundle.chunks[0], state.docProfile);
      return { rows: [
        ...(!sql.includes("'legacy' AS representation") || state.suppressed ? [] : [{ ...hitRow(), source_id: plan.sources[0].metadata.id, representation: "legacy", head: "public" }]),
        ...(sql.includes("'document' AS representation") ? [{ ...docRow(), representation: "document", head: headName, chunk_id: bundle.chunks[0].id, payload: bundle.chunks[0], input_text: text, input_hash: embeddingInputHash(text), distance: 0.15 }] : []),
      ].sort((a, b) => Number(a.distance) - Number(b.distance)) };
    }
    if (sql.includes(" AS payload_bytes")) return { rows: [{ documents: 1, blocks: 1, chunks: 1, payload_bytes: 5000 }] };
    if (sql.includes("FROM rag_document_versions v WHERE v.id=ANY")) return { rows: [docRow()] };
    if (sql.includes("FROM rag_document_blocks WHERE")) return { rows: [{ source_version_id: bundle.document.sourceVersionId, ordinal: state.corruptOrdinal ? 1 : 0, payload: bundle.blocks[0] }] };
    if (sql.includes("FROM rag_document_chunks WHERE")) return { rows: [{ source_version_id: bundle.document.sourceVersionId, ordinal: 0, payload: bundle.chunks[0] }] };
    if (sql.includes("FROM rag_revision_documents d JOIN")) return { rows: [docRow()] };
    if (sql.includes("FROM rag_revision_sources rs JOIN")) return { rows: state.suppressed ? [] : [hitRow()] };
    return { rows: [] };
  }, release() {} }; }, async end() {}, on() {} };
  return { pool, state, calls, bundle };
}

test("composed current view shares one vector space and orders both filtered lanes before one LIMIT", async () => {
  const f = viewFixture(), store = createVectorKnowledgeStoreWithPool(f.pool);
  try {
    const snapshot = await store.captureSearch({ kind: "current" }); assert.ok(snapshot);
    const hits = await store.searchSnapshot(snapshot, [1, 0, 0], { limit: 4, now });
    assert.equal(hits.length, 2); assert.equal(hits.find((hit) => hit.dependency.head === "public")!.chunk.id, plan.chunks[0].raw.id);
    assert.match(hits.find((hit) => hit.dependency.head === "public-documents")!.chunk.id, /^v3-[0-9a-f]{64}$/);
    const sql = f.calls.find((call) => call.sql.startsWith("SELECT * FROM ("))!;
    assert.match(sql.sql, /UNION ALL/); assert.match(sql.sql, /ORDER BY distance,head,source_version_id,chunk_id LIMIT/);
    assert.match(sql.sql, /replacement\.legacy_source_id=s\.source_id/);
    assert.doesNotMatch(sql.sql, /replacement\.legacy_source_version_id=s\.id/);
    assert.equal(sql.values![0], "[1,0,0]"); assert.ok(sql.values!.includes(new Date(now).toISOString()));
    assert.equal(await store.assertSnapshot(snapshot, hits.map((hit) => hit.dependency), now), true);
    f.state.legacyRevision = "f".repeat(64);
    assert.equal(await store.assertSnapshot(snapshot, hits.map((hit) => hit.dependency), now), false, "head-set change invalidates replay");
    const newer = await store.captureSearch({ kind: "current" }); assert.ok(newer);
    f.state.suppressed = true;
    assert.equal((await store.searchSnapshot(newer, [1, 0, 0], { limit: 4, now })).length, 1, "same lineage remains suppressed for a new legacy head");
  } finally { await store.close(); }
});

test("archive view is isolated and evaluates legal asOf separately from present freshness", async () => {
  const f = viewFixture("archived"), store = createVectorKnowledgeStoreWithPool(f.pool);
  try {
    const snapshot = await store.captureSearch({ kind: "archive", asOf: "2025-10-01T00:00:00.000Z" }); assert.ok(snapshot);
    assert.equal(snapshot.heads.legacy, null); assert.equal(snapshot.heads.documents, null);
    const hits = await store.searchSnapshot(snapshot, [1, 0, 0], { limit: 4, now }); assert.equal(hits.length, 1);
    const sql = f.calls.find((call) => call.sql.startsWith("SELECT * FROM ("))!;
    assert.doesNotMatch(sql.sql, /UNION ALL|FROM rag_revision_chunks/);
    assert.match(sql.sql, /effective_from IS NOT NULL AND v\.effective_until IS NOT NULL/);
    assert.ok(sql.values!.includes("2025-10-01T00:00:00.000Z")); assert.ok(sql.values!.includes(new Date(now).toISOString()));
    assert.equal(await store.assertSnapshot(snapshot, hits.map((hit) => hit.dependency), Date.parse("2027-01-01T00:00:00Z")), false);
    f.state.includeLegacy = false;
    assert.equal(await store.captureSearch({ kind: "current" }), null, "archive alone is never current evidence");
  } finally { await store.close(); }
  const undated = viewFixture("archived", false), second = createVectorKnowledgeStoreWithPool(undated.pool);
  try {
    const unscoped = await second.captureSearch({ kind: "archive" }); assert.ok(unscoped);
    assert.equal((await second.searchSnapshot(unscoped, [1, 0, 0], { limit: 1, now })).length, 1);
    const dated = await second.captureSearch({ kind: "archive", asOf: "2025-10-01T00:00:00.000Z" }); assert.ok(dated);
    await assert.rejects(second.searchSnapshot(dated, [1, 0, 0], { limit: 1, now }), (error: any) => error.code === "invalid-database-data", "defense in depth rejects an undated row even if SQL transport returns it");
  } finally { await second.close(); }
});

test("incompatible query spaces and invalid producer ordering fail before usable evidence", async () => {
  const f = viewFixture(), store = createVectorKnowledgeStoreWithPool(f.pool);
  try {
    f.state.docProfile = createEmbeddingProfile({ dimensions: 2, inputVersion: "title-heading-text-v2" });
    await assert.rejects(store.captureSearch({ kind: "current" }), (error: any) => error.code === "profile-conflict");
    assert.ok(!f.calls.some((call) => call.sql.includes("e.embedding <=>")));
    f.state.docProfile = createEmbeddingProfile({ dimensions: 3, inputVersion: "title-heading-text-v2" });
    const snapshot = await store.captureSearch({ kind: "current" }); assert.ok(snapshot);
    f.state.corruptOrdinal = true;
    await assert.rejects(store.searchSnapshot(snapshot, [1, 0, 0], { limit: 4, now }), (error: any) => error.code === "invalid-database-data");
    assert.throws(() => store.searchSnapshot(snapshot, [1, 0, 0], { limit: 4, now, topics: ["housing"] } as any), (error: any) => error.code === "invalid-database-data");
  } finally { await store.close(); }
});

function migrationFixture(initialVersion = 1) {
  let state = { version: initialVersion, ledger: false, entries: [] as { version: number; checksum: string }[], newObjects: false };
  let before: typeof state | undefined, failMigration = false, bootstrapCalls = 0, migrationCalls = 0, connects = 0, ends = 0;
  const calls: { sql: string; values?: unknown[] }[] = [];
  const pool: RagSqlPool = { async connect() { connects++; return { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.startsWith("SELECT current_setting(")) return { rows: [{ normal: "0", errors: "0" }] };
    if (sql.startsWith("BEGIN")) { before = structuredClone(state); return { rows: [] }; }
    if (sql === "COMMIT") { before = undefined; return { rows: [] }; }
    if (sql === "ROLLBACK") { if (before) state = before; before = undefined; return { rows: [] }; }
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
    if (sql.includes("AS version_table")) return { rows: [{ version_table: state.version ? "rag_schema_version" : null, migrations_table: state.ledger ? "rag_schema_migrations" : null, known_tables: state.version ? 9 : 0 }] };
    if (sql.includes("CREATE EXTENSION IF NOT EXISTS vector")) { bootstrapCalls++; state.version = 1; return { rows: [] }; }
    if (sql.startsWith("SELECT version FROM rag_schema_version")) return { rows: [{ version: state.version }] };
    if (sql.includes("FROM rag_schema_version v")) return { rows: [{ ...header, version: state.version }] };
    if (sql.startsWith("CREATE TABLE rag_schema_migrations")) { state.ledger = true; return { rows: [] }; }
    if (sql.startsWith("INSERT INTO rag_schema_migrations")) {
      const v = sql.includes("VALUES(1,$1)") ? 1 : Number(values![0]), checksum = String(values![sql.includes("VALUES(1,$1)") ? 0 : 1]);
      state.entries.push({ version: v, checksum }); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT version,checksum")) return { rows: state.entries.map((entry) => ({ ...entry })) };
    if (sql.includes("ALTER TABLE rag_revisions ADD COLUMN data_schema_version")) {
      migrationCalls++; state.newObjects = true;
      if (failMigration) throw new Error("synthetic private SQL failure");
      return { rows: [] };
    }
    if (sql.startsWith("UPDATE rag_schema_version")) {
      if (state.version !== values![1]) return { rows: [], rowCount: 0 };
      state.version = Number(values![0]); return { rows: [], rowCount: 1 };
    }
    if (sql.startsWith("SELECT rolname")) return { rows: (values![0] as string[]).map((rolname) => ({ rolname })) };
    return { rows: [] };
  }, release(destroy = false) { if (destroy && before) { state = before; before = undefined; } } }; }, async end() { ends++; }, on() {} };
  return { pool, calls, state: () => state, bootstrapCalls: () => bootstrapCalls, migrationCalls: () => migrationCalls, connects: () => connects, ends: () => ends,
    fail(value: boolean) { failMigration = value; }, corruptChecksum() { state.entries[1].checksum = "f".repeat(64); }, removeLedger() { state.ledger = false; state.entries = []; } };
}

test("versioned migration adopts v1 once and never replays bootstrap after v3 schema publication", async () => {
  const f = migrationFixture();
  await migrateRagSchemaWithPool(f.pool);
  assert.equal(f.bootstrapCalls(), 0); assert.equal(f.migrationCalls(), 1); assert.equal(f.state().version, 2);
  assert.deepEqual(f.state().entries.map((entry) => entry.version), [1, 2]);
  await migrateRagSchemaWithPool(f.pool);
  assert.equal(f.bootstrapCalls(), 0); assert.equal(f.migrationCalls(), 1);
  assert.ok(!f.calls.some((call) => /^GRANT /m.test(call.sql)), "no guessed role or PUBLIC grants");
  f.corruptChecksum();
  await assert.rejects(migrateRagSchemaWithPool(f.pool), (error: any) => error.code === "invalid-schema");
  assert.equal(f.migrationCalls(), 1);
});

test("migration rollback preserves v1 and explicit grants name only configured roles", async () => {
  const f = migrationFixture(); f.fail(true);
  await assert.rejects(migrateRagSchemaWithPool(f.pool), (error: any) => error.code === "database-unavailable" && !error.message.includes("private"));
  assert.equal(f.state().version, 1); assert.equal(f.state().newObjects, false); assert.equal(f.state().entries.length, 1);
  f.fail(false);
  await migrateRagSchemaWithPool(f.pool, { readerRole: "fixture_reader", ingesterRole: "fixture_ingester" });
  const grants = f.calls.filter((call) => call.sql.startsWith("GRANT ")).map((call) => call.sql);
  assert.ok(grants.length >= 3); assert.ok(grants.every((sql) => /TO "fixture_(reader|ingester)"$/.test(sql)));
  assert.ok(grants.every((sql) => !/GRANT .* TO PUBLIC/.test(sql)));
  const invalid = migrationFixture();
  await assert.rejects(migrateRagSchemaWithPool(invalid.pool, { readerRole: 'bad"; DROP SCHEMA public' }), (error: any) => error.code === "invalid-database-data");
  assert.equal(invalid.connects(), 0); assert.equal(invalid.ends(), 1);
});

test("empty schemas bootstrap once while missing migration evidence and unknown versions fail closed", async () => {
  const empty = migrationFixture(0);
  await migrateRagSchemaWithPool(empty.pool); await migrateRagSchemaWithPool(empty.pool);
  assert.equal(empty.bootstrapCalls(), 1); assert.equal(empty.migrationCalls(), 1);
  empty.removeLedger();
  await assert.rejects(migrateRagSchemaWithPool(empty.pool), (error: any) => error.code === "invalid-schema");
  assert.equal(empty.bootstrapCalls(), 1);
  const future = migrationFixture(3);
  await assert.rejects(migrateRagSchemaWithPool(future.pool), (error: any) => error.code === "invalid-schema");
  assert.equal(future.bootstrapCalls(), 0); assert.equal(future.migrationCalls(), 0);
});

test("cache reuse is bounded and validates server-side vector metadata without transferring all coordinates", async () => {
  const inputs = Array.from({ length: 513 }, (_, index) => {
    const input = JSON.stringify(["Synthetic", "Section", String(index)]);
    return { input, inputHash: embeddingInputHash(input) };
  });
  const byHash = new Map(inputs.map((input) => [input.inputHash, input.input]));
  let corrupt = false;
  const f = fakePool((sql, values) => {
    if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
    if (sql.includes("vector_dims(embedding)")) return { rows: (values![1] as string[]).map((key) => ({ input_hash: key, input_text: byHash.get(key), dimensions: 3, vector_dimensions: 3, vector_norm: corrupt ? 2 : 1 })) };
    return { rows: [] };
  });
  const session = await openRagImportSessionWithPool(f.pool);
  try {
    assert.equal((await session.cached(profile, inputs)).size, 513);
    const lookups = f.calls.filter((call) => call.sql.includes("vector_dims(embedding)"));
    assert.deepEqual(lookups.map((call) => (call.values![1] as string[]).length), [512, 1]);
    assert.ok(lookups.every((call) => !call.sql.includes("embedding::text")));
    corrupt = true;
    await assert.rejects(session.cached(profile, inputs.slice(0, 1)), (error: any) => error.code === "invalid-database-data");
  } finally { await session.close(); }
});
