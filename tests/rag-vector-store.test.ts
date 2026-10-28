import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import original from "../server/data/silicon-hill-knowledge.json";
import { createEmbeddingProfile } from "../server/rag-embeddings";
import { prepareRagCorpus } from "../server/rag-ingest";
import { createVectorKnowledgeStoreWithPool, openRagImportSessionWithPool, vectorParameter, type RagSqlClient, type RagSqlPool, type SqlResult } from "../server/rag-vector-store";

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
