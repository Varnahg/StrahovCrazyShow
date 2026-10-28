import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import original from "../server/data/silicon-hill-knowledge.json";
import { createEmbeddingProfile, type Embedder } from "../server/rag-embeddings";
import { importRagCorpus, prepareRagCorpus } from "../server/rag-ingest";
import { createVectorKnowledgeStore, migrateRagSchema, openRagImportSession, openRagImportSessionWithPool, type RagSqlPool } from "../server/rag-vector-store";

const testUrl = process.env.RAG_TEST_DATABASE_URL;
const now = Date.parse("2026-10-30T12:00:00Z"), profile = createEmbeddingProfile({ dimensions: 3 });
function fixture(count = 2) {
  const source = { ...original.sources[0], id: "sh-db-fixture", title: "Synthetic DB fixture", checkedAt: "2026-10-28", reviewAfter: "2026-11-28", effectiveFrom: null, effectiveUntil: null };
  return { version: 2, sources: [source], chunks: Array.from({ length: count }, (_, index) => { const text = index === 0 ? "Test bližší." : `Test vzdálenější ${index}.`; return { id: `sh-db-chunk-${index}`, sourceId: source.id, text, sourceLocator: "Test", topic: "membership", keywords: ["test"], contentSha256: createHash("sha256").update(text).digest("hex") }; }) };
}
function fakeEmbedder(action?: (calls: number) => Promise<void>): Embedder & { calls: () => number } {
  let count = 0;
  return { profile, calls: () => count, async embed(inputs, options) {
    options.onAttempt?.(inputs.reduce((sum, input) => sum + Buffer.byteLength(input), 0)); count++; await action?.(count);
    return { vectors: inputs.map((input) => input.includes("bližší") ? [1, 0, 0] : [0, 1, 0]), usage: { promptTokens: inputs.length, totalTokens: inputs.length } };
  } };
}

test("opt-in PostgreSQL/pgvector publication, exact cosine, persistence, concurrency and abort", { skip: !testUrl, timeout: 120000 }, async (t) => {
  const url = new URL(testUrl!);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol) && /^[a-z0-9_]+_test$/.test(database), "RAG_TEST_DATABASE_URL must name an explicit *_test database");
  const schema = "rag_test_" + randomUUID().replaceAll("-", "");
  assert.match(schema, /^rag_test_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString: testUrl, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  let created = false;
  const scoped = new URL(url); scoped.searchParams.set("options", `-c search_path=${schema},public`);
  const connectionString = scoped.href;
  const store = createVectorKnowledgeStore({ connectionString, connectionTimeoutMs: 3000, statementTimeoutMs: 3000, maxConnections: 2 });
  const run = (current: ReturnType<typeof fixture>, embedder: Embedder, extra: { retryUncertain?: boolean; maxEmbeddingInputs?: number; maxEmbeddingBytes?: number; archiveDatasets?: unknown[] } = {}) => importRagCorpus({ connectionString, currentDatasets: [current], archiveDatasets: [], embedder, maxEmbeddingInputs: 100, maxEmbeddingBytes: 100000, ...extra });
  try {
    const logging = await admin.query("SELECT current_setting('log_parameter_max_length') AS normal, current_setting('log_parameter_max_length_on_error') AS errors");
    assert.deepEqual(logging.rows[0], { normal: "0", errors: "0" }, "DB bind parameter logging must be disabled");
    await admin.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public");
    await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
    await migrateRagSchema({ connectionString });
    assert.equal(await store.captureActive(), null);
    const first = fixture(), archives = [{ version: 2, sources: [{ ...first.sources[0], id: "sh-archive-db-fixture", status: "archived", archiveReason: "Synthetic archive" }], chunks: [] }];
    let snapshot: Awaited<ReturnType<typeof store.captureActive>>;
    await t.test("migrate is idempotent, exact SQL cosine ranks vectors, archive remains metadata only", async () => {
      await migrateRagSchema({ connectionString });
      const embedder = fakeEmbedder(), result = await run(first, embedder, { archiveDatasets: archives });
      assert.equal(result.embeddedInputs, 2); assert.equal(embedder.calls(), 1); assert.equal(result.archivedSources, 1);
      snapshot = await store.captureActive(); assert.ok(snapshot);
      const hits = await store.search(snapshot!, [1, 0, 0], { limit: 4, now });
      assert.equal(hits.length, 2); assert.equal(hits[0].chunk.id, first.chunks[0].id); assert.ok(hits[0].distance < 0.000001); assert.ok(Math.abs(hits[1].distance - 1) < 0.000001);
      assert.equal(await store.assertCurrent(snapshot!, hits.map((hit) => hit.sourceVersionId), now), true);
      assert.equal(await store.assertCurrent(snapshot!, hits.map((hit) => hit.sourceVersionId), Date.parse("2026-11-28T00:00:00Z")), false);
      const indexes = await admin.query("SELECT indexdef FROM pg_indexes WHERE schemaname=$1", [schema]);
      assert.ok(indexes.rows.every((row) => !/USING (hnsw|ivfflat)/i.test(row.indexdef)));
    });
    await t.test("unchanged and metadata-only imports use persistent cache, one changed input embeds once and deletion costs zero", async () => {
      const embedder = fakeEmbedder();
      assert.equal((await run(first, embedder, { maxEmbeddingInputs: 0, maxEmbeddingBytes: 0, archiveDatasets: archives })).embeddingCalls, 0);
      const updated = structuredClone(first); updated.sources[0].checkedAt = "2026-10-29";
      const meta = await run(updated, embedder, { maxEmbeddingInputs: 0, maxEmbeddingBytes: 0, archiveDatasets: archives });
      assert.equal(meta.embeddingCalls, 0); assert.equal(embedder.calls(), 0); assert.notEqual(meta.revisionId, snapshot!.revisionId);
      assert.equal(await store.assertCurrent(snapshot!, [], now), false);
      updated.chunks[0].text += " Změna."; updated.chunks[0].contentSha256 = createHash("sha256").update(updated.chunks[0].text).digest("hex");
      assert.equal((await run(updated, embedder)).embeddedInputs, 1); assert.equal(embedder.calls(), 1);
      updated.chunks.pop(); assert.equal((await run(updated, embedder, { maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 })).embeddingCalls, 0);
      const active = await store.captureActive(); assert.equal((await store.search(active!, [1, 0, 0], { limit: 4, now })).length, 1);
    });
    await t.test("SQL filters future, expired and archived sources before evidence", async () => {
      const base = fixture(1), future = structuredClone(base.sources[0]), expired = structuredClone(base.sources[0]);
      future.id = "sh-future-db-fixture"; (future as any).effectiveFrom = "2026-11-01T00:00:00+01:00";
      expired.id = "sh-expired-db-fixture"; (expired as any).effectiveUntil = "2026-10-27T00:00:00+01:00";
      base.sources.push(future, expired);
      base.chunks.push({ ...base.chunks[0], id: "sh-future-db-chunk", sourceId: future.id }, { ...base.chunks[0], id: "sh-expired-db-chunk", sourceId: expired.id });
      await run(base, fakeEmbedder(), { archiveDatasets: archives });
      const active = await store.captureActive(), hits = await store.search(active!, [1, 0, 0], { limit: 4, now });
      assert.equal(hits.length, 1); assert.equal(hits[0].chunk.document.id, "sh-db-fixture");
    });
    await t.test("interrupted new revision leaves old head, completed batches survive reconnect, uncertain retry is explicit", async () => {
      const previous = await store.captureActive(), bigger = fixture(35);
      const failing = fakeEmbedder(async (calls) => { if (calls === 2) throw new Error("unknown provider outcome"); });
      await assert.rejects(run(bigger, failing), (error: any) => error.code === "embedding-failed");
      assert.equal((await store.captureActive())!.revisionId, previous!.revisionId);
      const retry = fakeEmbedder();
      await assert.rejects(run(bigger, retry), (error: any) => error.code === "uncertain-embedding-attempt"); assert.equal(retry.calls(), 0);
      bigger.sources[0].checkedAt = "2026-10-29";
      await assert.rejects(run(bigger, retry), (error: any) => error.code === "uncertain-embedding-attempt"); assert.equal(retry.calls(), 0);
      const completed = await run(bigger, retry, { retryUncertain: true }); assert.equal(completed.embeddedInputs, 1); assert.equal(completed.reusedInputs, 34);
      assert.equal(retry.calls(), 1);
      const freshStore = createVectorKnowledgeStore({ connectionString });
      try { assert.equal((await freshStore.captureActive())!.revisionId, completed.revisionId); } finally { await freshStore.close(); }
    });
    await t.test("second importer cannot duplicate a paid batch while advisory lock is held", async () => {
      const current = fixture(1); current.sources[0].title = "Concurrent unique fixture";
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>((resolve) => { entered = resolve; }), gate = new Promise<void>((resolve) => { release = resolve; });
      const firstEmbedder = fakeEmbedder(async () => { entered(); await gate; }), second = fakeEmbedder();
      const running = run(current, firstEmbedder); await started;
      try { await assert.rejects(run(current, second), (error: any) => error.code === "import-busy"); assert.equal(second.calls(), 0); }
      finally { release(); }
      await running; assert.equal(firstEmbedder.calls(), 1);
    });
    await t.test("profile/cache/source/published revision protections reject in-place mutation", async () => {
      for (const [table, assignment] of [["rag_profiles", "model=model"], ["rag_embedding_cache", "input_text=input_text"], ["rag_source_versions", "metadata=metadata"], ["rag_revisions", "state=state"]]) {
        const where = table === "rag_revisions" ? " WHERE state='ready'" : "";
        await assert.rejects(admin.query(`UPDATE "${schema}".${table} SET ${assignment}${where}`), (error: any) => error.code === "55000");
      }
    });
    await t.test("incomplete publication and wrong vector dimensions keep the previous active head", async () => {
      const before = await store.captureActive(), current = fixture(1); current.sources[0].title = "Incomplete revision fixture";
      const plan = prepareRagCorpus([current], [], profile), session = await openRagImportSession({ connectionString });
      try {
        await session.prepare(plan);
        // The DB's expected-count guard must reject even a faulty caller omitting a chunk.
        await assert.rejects(session.publish({ ...plan, chunks: [] }), (error: any) => error.code === "database-unavailable");
      } finally { await session.close(); }
      assert.equal((await store.captureActive())!.revisionId, before!.revisionId);
      const revision = await admin.query(`SELECT state FROM "${schema}".rag_revisions WHERE id=$1`, [plan.revisionId]);
      assert.equal(revision.rows[0].state, "building");
      for (const vector of ["[1,0]", "[0,0,0]"]) {
        await assert.rejects(admin.query(`INSERT INTO "${schema}".rag_embedding_cache(profile_id,dimensions,input_hash,input_text,embedding) VALUES($1,3,$2,'synthetic',$3::vector)`, [profile.id, "a".repeat(64), vector]), (error: any) => error.code === "23514");
      }
      const malformed: Embedder = { profile, async embed(inputs, request) {
        request.onAttempt?.(inputs.reduce((sum, input) => sum + Buffer.byteLength(input), 0));
        return { vectors: inputs.map(() => [1, 0]), usage: { promptTokens: inputs.length, totalTokens: inputs.length } };
      } };
      await assert.rejects(run(current, malformed), (error: any) => error.code === "embedding-failed");
      assert.equal((await store.captureActive())!.revisionId, before!.revisionId);
    });
    await t.test("a different embedding profile has its own cache and rejects the previous snapshot", async () => {
      const before = await store.captureActive(), otherProfile = createEmbeddingProfile({ dimensions: 2 });
      let calls = 0;
      const embedder: Embedder = { profile: otherProfile, async embed(inputs, request) {
        request.onAttempt?.(inputs.reduce((sum, input) => sum + Buffer.byteLength(input), 0)); calls++;
        return { vectors: inputs.map(() => [1, 0]), usage: { promptTokens: inputs.length, totalTokens: inputs.length } };
      } };
      const result = await run(fixture(2), embedder);
      assert.equal(result.embeddedInputs, 2); assert.equal(calls, 1);
      const active = await store.captureActive(); assert.equal(active!.profile.id, otherProfile.id);
      const hits = await store.search(active!, [1, 0], { limit: 4, now }); assert.equal(hits.length, 2);
      await assert.rejects(store.search(before!, [1, 0, 0], { limit: 4, now }), (error: any) => error.code === "revision-conflict");
      assert.equal((await run(fixture(2), fakeEmbedder(), { maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 })).embeddingCalls, 0);
    });
    await t.test("abort destroys a blocked owned SQL connection and pool is usable afterwards", async () => {
      const lock = await admin.connect(), controller = new AbortController();
      try {
        await lock.query("BEGIN"); await lock.query(`LOCK TABLE "${schema}".rag_heads IN ACCESS EXCLUSIVE MODE`);
        const waiting = store.captureActive(controller.signal);
        const timer = setTimeout(() => controller.abort(), 30);
        try { await assert.rejects(waiting, (error: any) => error.code === "aborted"); } finally { clearTimeout(timer); }
        await lock.query("ROLLBACK");
      } finally { lock.release(); }
      assert.ok(await store.captureActive());
    });
    await t.test("a terminated owned import connection cannot crash the process or retain its advisory lock", async () => {
      const rawPool = new Pool({ connectionString, connectionTimeoutMillis: 3000, statement_timeout: 3000 });
      let ownedBackend = 0;
      const trackedPool: RagSqlPool = {
        async connect() {
          const client = await rawPool.connect();
          ownedBackend = (await client.query("SELECT pg_backend_pid() AS id")).rows[0].id;
          return client;
        },
        end: () => rawPool.end(),
        on: (_event, callback) => rawPool.on("error", callback),
      };
      const session = await openRagImportSessionWithPool(trackedPool);
      try {
        assert.ok(Number.isSafeInteger(ownedBackend) && ownedBackend > 0);
        // PID came from this exact checked-out client, never from port/process guessing.
        await admin.query("SELECT pg_terminate_backend($1)", [ownedBackend]);
        await assert.rejects(session.uncertain(profile), (error: any) => error.code === "database-unavailable");
      } finally { await session.close(); }
      const next = await openRagImportSession({ connectionString }); await next.close();
      assert.ok(await store.captureActive());
    });
  } finally {
    await store.close();
    if (created) {
      const owned = await admin.query("SELECT n.nspname FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=$1 AND r.rolname=current_user", [schema]);
      assert.equal(owned.rows[0]?.nspname, schema, "Refusing to remove an unowned test schema");
      // Fresh generated name + successful CREATE + ownership guard; never DROP a database/public schema.
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    await admin.end();
  }
});
