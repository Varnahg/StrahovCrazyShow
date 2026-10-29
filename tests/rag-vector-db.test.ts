import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Pool } from "pg";
import original from "../server/data/silicon-hill-knowledge.json";
import { createEmbeddingProfile, type Embedder } from "../server/rag-embeddings";
import { importRagCorpus, prepareRagCorpus, prepareDocumentChanges, importPreparedDocumentCorpus } from "../server/rag-ingest";
import { createVectorKnowledgeStore, createVectorKnowledgeStoreWithPool, migrateRagSchema, openRagImportSession, openRagImportSessionWithPool, openRagDocumentImportSession, openRagDocumentImportSessionWithPool, type RagSqlPool } from "../server/rag-vector-store";
import { buildKnowledgeDocumentV3, parserProfileSha256, requirePublishableExtraction, validateWorkerEnvelope } from "../server/rag-document-contract";
import { RAG_TOKENIZER } from "../shared/rag-provenance";
import type { DocumentMetadataV3 } from "../server/rag-knowledge-types";
import type { KnowledgeDocument, RawKnowledgeChunk } from "../server/rag-knowledge-types";

const testUrl = process.env.RAG_TEST_DATABASE_URL;
const now = Date.parse("2026-10-30T12:00:00Z"), profile = createEmbeddingProfile({ dimensions: 3 });
function fixture(count = 2): { version: 2; sources: KnowledgeDocument[]; chunks: RawKnowledgeChunk[] } {
  const source: KnowledgeDocument = { ...original.sources[0], id: "sh-db-fixture", title: "Synthetic DB fixture", authority: "silicon-hill", status: "current", checkedAt: "2026-10-28", reviewAfter: "2026-11-28", effectiveFrom: null, effectiveUntil: null };
  return { version: 2, sources: [source], chunks: Array.from({ length: count }, (_, index) => { const text = index === 0 ? "Test bližší." : `Test vzdálenější ${index}.`; return { id: `sh-db-chunk-${index}`, sourceId: source.id, text, sourceLocator: "Test", topic: "membership", keywords: ["test"], contentSha256: createHash("sha256").update(text).digest("hex") }; }) };
}
function fakeEmbedder(action?: (calls: number) => Promise<void>): Embedder & { calls: () => number } {
  let count = 0;
  return { profile, calls: () => count, async embed(inputs, options) {
    options.onAttempt?.(inputs.reduce((sum, input) => sum + Buffer.byteLength(input), 0)); count++; await action?.(count);
    return { vectors: inputs.map((input) => input.includes("bližší") ? [1, 0, 0] : [0, 1, 0]), usage: { promptTokens: inputs.length, totalTokens: inputs.length } };
  } };
}
function completeDocument(text = "Úplný syntetický databázový dokument.", changes: Partial<DocumentMetadataV3> = {}, page = 1) {
  const metadata: DocumentMetadataV3 = { ...original.sources[0], id: "suz-v3-db-document", title: "Syntetická úplná předloha", authority: "suz", status: "current", archiveReason: null,
    url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty", discoveryUrl: "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty",
    checkedAt: "2026-10-28", reviewAfter: "2026-11-28", effectiveFrom: null, effectiveUntil: null, author: null, license: null, licenseUrl: null, ...changes };
  const parserProfile = { id: "docling-2.144.0-strahov-v1", packages: { "docling-slim": "2.144.0", tiktoken: "0.12.0" }, pipeline: "docling-native-pdf", configurationHash: "b".repeat(64), modelManifestHash: null, tokenizer: { ...RAG_TOKENIZER, version: "0.12.0" } };
  const span = { blockId: "b-same", locator: `PDF strana ${page}`, page };
  const envelope = { schemaVersion: 1, sourceId: metadata.id, inputSha256: createHash("sha256").update(text + page).digest("hex"), status: "ok", format: "pdf", parserProfile,
    document: { title: metadata.title, pageCount: page, complete: true }, blocks: [{ id: "b-same", kind: "text", text, headingPath: [], spans: [span] }],
    chunks: [{ id: "c-same", text, headingPath: [], tokenCount: 15, blockIds: ["b-same"], spans: [span] }],
    quality: { processedPages: page, expectedPages: page, inputTextCharacters: null, outputTextCharacters: [...text].length, tableCount: 0, ocrPages: [], issues: [] }, links: [] };
  return buildKnowledgeDocumentV3(metadata, requirePublishableExtraction(validateWorkerEnvelope(envelope, { sourceId: metadata.id, inputSha256: envelope.inputSha256, parserProfileSha256: parserProfileSha256(parserProfile) })), "native");
}
const documentProfile = createEmbeddingProfile({ dimensions: 3, inputVersion: "title-heading-text-v2" });
function documentEmbedder(): Embedder & { calls: () => number } { return { ...fakeEmbedder(), profile: documentProfile }; }

test("opt-in PostgreSQL/pgvector publication, exact cosine, persistence, concurrency and abort", { skip: !testUrl, timeout: 120000 }, async (t) => {
  const url = new URL(testUrl!);
  const database = decodeURIComponent(url.pathname.slice(1));
  assert.ok(["postgres:", "postgresql:"].includes(url.protocol) && /^[a-z0-9_]+_test$/.test(database), "RAG_TEST_DATABASE_URL must name an explicit *_test database");
  const schema = "rag_test_" + randomUUID().replaceAll("-", "");
  assert.match(schema, /^rag_test_[a-f0-9]{32}$/);
  const admin = new Pool({ connectionString: testUrl, connectionTimeoutMillis: 3000, statement_timeout: 5000 });
  let created = false;
  const roleSuffix = randomUUID().replaceAll("-", ""), readerRole = "rag_reader_" + roleSuffix, ingesterRole = "rag_ingester_" + roleSuffix, observerRole = "rag_observer_" + roleSuffix;
  const createdRoles: { name: string; oid: number }[] = [];
  const scoped = new URL(url); scoped.searchParams.set("options", `-c search_path=${schema},public`);
  const connectionString = scoped.href;
  const store = createVectorKnowledgeStore({ connectionString, connectionTimeoutMs: 3000, statementTimeoutMs: 3000, maxConnections: 2 });
  const run = (current: unknown, embedder: Embedder, extra: { retryUncertain?: boolean; maxEmbeddingInputs?: number; maxEmbeddingBytes?: number; archiveDatasets?: unknown[] } = {}) => importRagCorpus({ connectionString, currentDatasets: [current], archiveDatasets: [], embedder, maxEmbeddingInputs: 100, maxEmbeddingBytes: 100000, ...extra });
  try {
    const logging = await admin.query("SELECT current_setting('log_parameter_max_length') AS normal, current_setting('log_parameter_max_length_on_error') AS errors");
    assert.deepEqual(logging.rows[0], { normal: "0", errors: "0" }, "DB bind parameter logging must be disabled");
    await admin.query("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public");
    await admin.query(`CREATE SCHEMA "${schema}"`); created = true;
    await t.test("populated v1 upgrade preserves head, paid cache and existing ACL while granting only explicit roles", async () => {
      const setup = new Pool({ connectionString });
      try {
        await setup.query(await readFile(new URL("../server/rag-schema.sql", import.meta.url), "utf8"));
        assert.equal(await store.captureActive(), null);
        for (const role of [readerRole, ingesterRole, observerRole]) {
          assert.match(role, /^rag_(reader|ingester|observer)_[a-f0-9]{32}$/);
          await admin.query(`CREATE ROLE "${role}" NOLOGIN`);
          const identity = await admin.query("SELECT oid::integer AS oid FROM pg_roles WHERE rolname=$1", [role]);
          createdRoles.push({ name: role, oid: identity.rows[0].oid });
          await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`);
        }
        await setup.query(`GRANT SELECT ON rag_heads TO "${observerRole}"`);
        const seed = fixture(2); seed.sources[0].title = "Pre-migration retained fixture";
        await run(seed, fakeEmbedder());
        const before = await store.captureActive(), cached = await setup.query("SELECT profile_id,input_hash,input_text,embedding::text FROM rag_embedding_cache ORDER BY profile_id,input_hash");
        await migrateRagSchema({ connectionString, readerRole, ingesterRole });
        assert.deepEqual(await store.captureActive(), before);
        assert.deepEqual((await setup.query("SELECT profile_id,input_hash,input_text,embedding::text FROM rag_embedding_cache ORDER BY profile_id,input_hash")).rows, cached.rows);
        assert.deepEqual((await setup.query("SELECT version FROM rag_schema_migrations ORDER BY version")).rows.map((row) => row.version), [1, 2]);
        const rights = await admin.query(`SELECT has_table_privilege($1,$4,'SELECT') AS observer_kept,
          has_table_privilege($2,$5,'SELECT') AS reader_select,has_table_privilege($2,$5,'INSERT') AS reader_insert,
          has_table_privilege($3,$5,'INSERT') AS ingester_insert,has_table_privilege($3,$5,'DELETE') AS ingester_delete,
          has_column_privilege($3,$5,'sealed','UPDATE') AS ingester_seal,has_column_privilege($3,$5,'metadata','UPDATE') AS ingester_metadata`,
          [observerRole, readerRole, ingesterRole, `${schema}.rag_heads`, `${schema}.rag_document_versions`]);
        assert.deepEqual(rights.rows[0], { observer_kept: true, reader_select: true, reader_insert: false, ingester_insert: true, ingester_delete: false, ingester_seal: true, ingester_metadata: false });
        const publicGrants = await admin.query(`SELECT count(*)::integer AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) permission WHERE n.nspname=$1 AND c.relkind='r' AND permission.grantee=0`, [schema]);
        assert.equal(publicGrants.rows[0].n, 0);
      } finally { await setup.end(); }
    });
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
    await t.test("SQL authority and topic filters exclude nearer mixed-corpus vectors before LIMIT", async () => {
      const sh = { ...fixture(0).sources[0], id: "sh-filter-source", title: "Synthetic SH filter fixture" };
      const suz = { ...sh, id: "suz-filter-source", title: "Synthetic SUZ filter fixture", authority: "suz", url: "https://www.suz.cvut.cz/cz/ubytovani", discoveryUrl: "https://www.suz.cvut.cz/cz/ubytovani", author: null, license: null, licenseUrl: null };
      const cases = [
        { id: "sh-filter-office", sourceId: sh.id, topic: "office", vector: [1, 0, 0] },
        { id: "suz-filter-office", sourceId: suz.id, topic: "office", vector: [0.98, Math.sqrt(1 - 0.98 ** 2), 0] },
        { id: "sh-filter-network", sourceId: sh.id, topic: "network", vector: [0.8, 0.6, 0] },
        { id: "suz-filter-network-first", sourceId: suz.id, topic: "network", vector: [0.6, 0.8, 0] },
        { id: "suz-filter-network-second", sourceId: suz.id, topic: "network", vector: [0.4, Math.sqrt(0.84), 0] },
      ];
      const mixed = { version: 2, sources: [sh, suz], chunks: cases.map(({ id, sourceId, topic }) => ({ id, sourceId, topic, text: id, sourceLocator: "Synthetic filter test", keywords: ["filter"], contentSha256: createHash("sha256").update(id).digest("hex") })) };
      const vectors = new Map(cases.map(({ id, vector }) => [id, vector]));
      const embedder: Embedder = { profile, async embed(inputs, request) {
        request.onAttempt?.(inputs.reduce((sum, input) => sum + Buffer.byteLength(input), 0));
        return { vectors: inputs.map((input) => {
          const vector = vectors.get(JSON.parse(input)[2]); assert.ok(vector); return vector;
        }), usage: { promptTokens: inputs.length, totalTokens: inputs.length } };
      } };
      await run(mixed, embedder);
      const active = await store.captureActive(); assert.ok(active);
      const ids = async (filters: Parameters<typeof store.search>[2]) => (await store.search(active, [1, 0, 0], { now, ...filters })).map((hit) => hit.chunk.id);
      assert.deepEqual(await ids({ limit: 1 }), ["sh-filter-office"]);
      assert.deepEqual(await ids({ authority: "suz", limit: 1 }), ["suz-filter-office"]);
      assert.deepEqual(await ids({ topics: ["network"], limit: 1 }), ["sh-filter-network"]);
      assert.deepEqual(await ids({ authority: "suz", topics: ["network"], limit: 1 }), ["suz-filter-network-first"]);
      assert.deepEqual(await ids({ authority: "suz", topics: ["network"], limit: 2 }), ["suz-filter-network-first", "suz-filter-network-second"]);
      assert.deepEqual(await ids({ authority: "silicon-hill", topics: ["office", "network"], limit: 4 }), ["sh-filter-office", "sh-filter-network"]);
      assert.deepEqual(await ids({ authority: "suz", topics: ["printing"], limit: 4 }), []);
      assert.deepEqual(await ids({ topics: [], limit: 4 }), []);
    });

    function rolePool(role: string, onBackend?: (pid: number) => void, beforeCommit?: () => Promise<void>): RagSqlPool {
      assert.ok(createdRoles.some((entry) => entry.name === role));
      const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000, statement_timeout: 10000 });
      return { async connect() {
        const client = await pool.connect(), observe = () => {};
        client.on("error", observe);
        try { await client.query(`SET ROLE "${role}"`); onBackend?.((await client.query("SELECT pg_backend_pid() AS pid")).rows[0].pid); }
        catch (error) { client.off("error", observe); client.release(true); throw error; }
        return { async query(sql, values) {
          if (sql === "COMMIT") await beforeCommit?.();
          const result = await client.query(sql, values); return { rows: result.rows, rowCount: result.rowCount ?? undefined };
        }, release() { client.off("error", observe); client.release(true); }, on: (event, callback) => client.on(event, callback), off: (event, callback) => client.off(event, callback) };
      }, end: () => pool.end(), on: (_event, callback) => pool.on("error", callback) };
    }
    const legacySource = fixture(1);
    legacySource.sources[0] = { ...legacySource.sources[0], id: "suz-v3-legacy", authority: "suz", url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty", discoveryUrl: "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty", author: null, license: null, licenseUrl: null };
    legacySource.chunks[0] = { ...legacySource.chunks[0], id: "suz-v3-legacy-chunk", sourceId: "suz-v3-legacy", topic: "housing" };
    let originalLegacyVersion = "", currentBundle = completeDocument();
    const documentImport = async (upserts: ReturnType<typeof completeDocument>[], extra: Partial<Parameters<typeof prepareDocumentChanges>[1]> = {}, embedder = documentEmbedder()) => {
      const session = await openRagDocumentImportSessionWithPool(rolePool(ingesterRole), undefined, () => now);
      try {
        const context = await session.context("current");
        const plan = prepareDocumentChanges(context, { collection: "current", expectedSnapshotId: context.snapshot?.id ?? null, upserts, ...extra }, documentProfile, now);
        return { plan, result: await importPreparedDocumentCorpus(plan, session, { embedder, maxEmbeddingInputs: 100, maxEmbeddingBytes: 100000 }) };
      } finally { await session.close(); }
    };
    await t.test("limited ingester publishes complete v3 and read-only reader can query both heads without row locks", async () => {
      await run(legacySource, fakeEmbedder());
      const legacy = await store.captureActive(); assert.ok(legacy);
      const v1Rows = await admin.query(`SELECT count(*)::integer AS n FROM "${schema}".rag_embedding_cache WHERE profile_id=$1`, [profile.id]);
      const published = await documentImport([currentBundle]);
      assert.equal(published.result.embeddedInputs, 1); assert.deepEqual(await store.captureActive(), legacy);
      const reader = createVectorKnowledgeStoreWithPool(rolePool(readerRole));
      try {
        const snapshot = await reader.captureSearch({ kind: "current" }); assert.ok(snapshot);
        const hits = await reader.searchSnapshot(snapshot, [1, 0, 0], { limit: 4, now });
        assert.equal(hits.length, 2); assert.ok(hits.some((hit) => hit.dependency.head === "public")); assert.ok(hits.some((hit) => hit.dependency.head === "public-documents"));
        assert.equal(await reader.assertSnapshot(snapshot, hits.map((hit) => hit.dependency), now), true);
        originalLegacyVersion = hits.find((hit) => hit.dependency.head === "public")!.dependency.sourceVersionId;
      } finally { await reader.close(); }
      assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM "${schema}".rag_embedding_cache WHERE profile_id=$1`, [profile.id])).rows[0].n, v1Rows.rows[0].n);
      const unchanged = await documentImport([currentBundle]); assert.equal(unchanged.result.embeddingCalls, 0);
      currentBundle = completeDocument(undefined, { checkedAt: "2026-10-29" }, 2);
      const metadata = await documentImport([currentBundle]); assert.equal(metadata.result.embeddingCalls, 0);
      const sealed = await admin.query(`SELECT sealed FROM "${schema}".rag_document_versions WHERE id=$1`, [currentBundle.document.sourceVersionId]);
      assert.equal(sealed.rows[0].sealed, true);
      await assert.rejects(admin.query(`UPDATE "${schema}".rag_document_versions SET metadata=metadata WHERE id=$1`, [currentBundle.document.sourceVersionId]), (error: any) => error.code === "55000");
      await assert.rejects(admin.query(`UPDATE "${schema}".rag_document_versions SET sealed=false WHERE id=$1`, [currentBundle.document.sourceVersionId]), (error: any) => error.code === "55000");
    });
    await t.test("persistent legacy lineage suppression cannot be bypassed by expiry, retirement, metadata or stale rollback", async () => {
      await documentImport([], { legacyReplacements: [{ legacySourceVersionId: originalLegacyVersion, documentSourceVersionId: currentBundle.document.sourceVersionId }] });
      let view = await store.captureSearch({ kind: "current" }); assert.ok(view);
      assert.ok((await store.searchSnapshot(view, [1, 0, 0], { limit: 4, now })).every((hit) => hit.dependency.head !== "public"));
      await documentImport([], { retireSourceVersionIds: [currentBundle.document.sourceVersionId] });
      view = await store.captureSearch({ kind: "current" }); assert.ok(view);
      assert.equal((await store.searchSnapshot(view, [1, 0, 0], { limit: 4, now })).length, 0);
      legacySource.sources[0].checkedAt = "2026-10-29";
      await run(legacySource, fakeEmbedder(), { maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 });
      view = await store.captureSearch({ kind: "current" }); assert.ok(view);
      assert.equal((await store.searchSnapshot(view, [1, 0, 0], { limit: 4, now })).length, 0);
      await assert.rejects(documentImport([], { restoreLegacySourceVersionIds: [originalLegacyVersion] }), (error: any) => error.code === "revision-conflict");
      const live = await store.captureActive(); assert.ok(live);
      const restoredVersion = (await store.search(live, [1, 0, 0], { limit: 1, now }))[0].sourceVersionId;
      assert.notEqual(restoredVersion, originalLegacyVersion);
      const restored = await documentImport([], { restoreLegacySourceVersionIds: [restoredVersion] }); assert.equal(restored.result.embeddingCalls, 0);
      view = await store.captureSearch({ kind: "current" }); assert.ok(view);
      assert.equal((await store.searchSnapshot(view, [1, 0, 0], { limit: 4, now })).length, 1);
    });
    await t.test("archive source versions share local chunk IDs but remain separate, and asOf requires a known legal interval", async () => {
      const session = await openRagDocumentImportSessionWithPool(rolePool(ingesterRole), undefined, () => now);
      try {
        const base = await session.context("archive");
        const first = completeDocument("Archivní první verze.", { status: "archived", archiveReason: "Nahrazeno", effectiveFrom: "2024-09-01T00:00:00+02:00", effectiveUntil: "2025-09-01T00:00:00+02:00" });
        const second = completeDocument("Archivní druhá verze.", { status: "archived", archiveReason: "Nahrazeno", effectiveFrom: "2025-09-01T00:00:00+02:00", effectiveUntil: "2026-09-01T00:00:00+02:00" });
        const unknown = completeDocument("Archivní nedatovaná verze.", { status: "archived", archiveReason: "Neznámá účinnost" });
        const plan = prepareDocumentChanges(base, { collection: "archive", expectedSnapshotId: base.snapshot?.id ?? null, upserts: [first, second, unknown] }, documentProfile, now);
        await importPreparedDocumentCorpus(plan, session, { embedder: documentEmbedder(), maxEmbeddingInputs: 100, maxEmbeddingBytes: 100000 });
        const archive = await store.captureSearch({ kind: "archive" }); assert.ok(archive);
        const all = await store.searchSnapshot(archive, [1, 0, 0], { limit: 8, now });
        assert.equal(all.length, 3); assert.equal(new Set(all.map((hit) => hit.chunk.id)).size, 3);
        const dated = await store.captureSearch({ kind: "archive", asOf: "2025-10-01T00:00:00.000Z" }); assert.ok(dated);
        const matches = await store.searchSnapshot(dated, [1, 0, 0], { limit: 8, now });
        assert.equal(matches.length, 1); assert.equal(matches[0].dependency.sourceVersionId, second.document.sourceVersionId);
        assert.equal(await store.assertSnapshot(dated, matches.map((hit) => hit.dependency), Date.parse("2027-01-01T00:00:00Z")), false);
        const current = await store.captureSearch({ kind: "current" }); assert.ok(current);
        assert.ok((await store.searchSnapshot(current, [1, 0, 0], { limit: 8, now })).every((hit) => hit.dependency.head !== "public-archive"));
      } finally { await session.close(); }
    });
    async function waitBlocked(blockedPid: number, blockerPid: number, completed: () => boolean) {
      assert.ok(Number.isSafeInteger(blockedPid) && blockedPid > 0 && Number.isSafeInteger(blockerPid) && blockerPid > 0);
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        if (completed()) throw new Error("Owned operation completed before the expected SQL lock barrier");
        const result = await admin.query("SELECT pg_blocking_pids($1) AS blockers", [blockedPid]);
        if (result.rows[0].blockers.includes(blockerPid)) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Owned SQL blocking relation was not observed");
    }
    const extraBlock = (bundle: ReturnType<typeof completeDocument>) => ({ ...bundle.blocks[0], id: "b-race-extra", spans: bundle.blocks[0].spans.map((span) => ({ ...span, blockId: "b-race-extra" })) });
    const insertExtra = (client: { query: (sql: string, values: unknown[]) => Promise<unknown> }, bundle: ReturnType<typeof completeDocument>) => client.query(
      `INSERT INTO "${schema}".rag_document_blocks(source_version_id,block_id,ordinal,payload) VALUES($1,'b-race-extra',1,$2::jsonb)`, [bundle.document.sourceVersionId, JSON.stringify(extraBlock(bundle))]);
    let failedRaceVersion = "", failedRaceRevision = "";
    await t.test("RC part commit before sealing blocks publication and cannot slip into a ready document", async () => {
      const bundle = completeDocument("Concurrent part before publication."), previous = await store.captureSearch({ kind: "current" });
      let publicationPid = 0;
      const session = await openRagDocumentImportSessionWithPool(rolePool(ingesterRole, (pid) => publicationPid = pid), undefined, () => now);
      const writer = await admin.connect(); let writerTransaction = false;
      try {
        const context = await session.context("current");
        const plan = prepareDocumentChanges(context, { collection: "current", expectedSnapshotId: context.snapshot!.id, upserts: [bundle] }, documentProfile, now);
        await session.prepare(plan);
        const attempt = await session.startAttempt(plan, plan.inputs.map((input) => input.inputHash));
        await session.completeAttempt(attempt, plan.profile, plan.inputs.map((input) => ({ ...input, vector: [1, 0, 0] })), { promptTokens: plan.inputs.length, totalTokens: plan.inputs.length });
        await writer.query("BEGIN ISOLATION LEVEL READ COMMITTED"); writerTransaction = true;
        await writer.query(`SET LOCAL search_path TO "${schema}",public`); await writer.query(`SET LOCAL ROLE "${ingesterRole}"`);
        const writerPid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        await insertExtra(writer, bundle);
        let completed = false;
        const outcome = session.publish(plan).then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error })).finally(() => completed = true);
        try { await waitBlocked(publicationPid, writerPid, () => completed); }
        finally { await writer.query("COMMIT"); writerTransaction = false; }
        const result = await outcome;
        assert.equal(result.ok, false);
        if (!result.ok) assert.equal((result.error as { code?: string }).code, "database-unavailable");
        assert.equal((await store.captureSearch({ kind: "current" }))!.id, previous!.id);
        const stored = await admin.query(`SELECT v.sealed,r.state FROM "${schema}".rag_document_versions v JOIN "${schema}".rag_revision_documents d ON d.source_version_id=v.id JOIN "${schema}".rag_revisions r ON r.id=d.revision_id WHERE r.id=$1`, [plan.revisionId]);
        assert.deepEqual(stored.rows, [{ sealed: false, state: "building" }]);
        failedRaceVersion = bundle.document.sourceVersionId; failedRaceRevision = plan.revisionId;
      } finally { if (writerTransaction) await writer.query("ROLLBACK"); writer.release(); await session.close(); }
    });
    await t.test("RC sealing before a concurrent part rejects the late insert after the real commit barrier", async () => {
      const bundle = completeDocument("Concurrent part after publication.");
      let publicationPid = 0, holdCommit = false, held = false, releaseCommit!: () => void, reachedCommit!: () => void;
      const heldCommit = new Promise<void>((resolve) => releaseCommit = resolve), commitReached = new Promise<void>((resolve) => reachedCommit = resolve);
      const session = await openRagDocumentImportSessionWithPool(rolePool(ingesterRole, (pid) => publicationPid = pid, async () => {
        if (holdCommit && !held) { held = true; reachedCommit(); await heldCommit; }
      }), undefined, () => now);
      const writer = await admin.connect(); let writerTransaction = false;
      try {
        const context = await session.context("current");
        const plan = prepareDocumentChanges(context, { collection: "current", expectedSnapshotId: context.snapshot!.id, upserts: [bundle] }, documentProfile, now);
        await session.prepare(plan);
        const attempt = await session.startAttempt(plan, plan.inputs.map((input) => input.inputHash));
        await session.completeAttempt(attempt, plan.profile, plan.inputs.map((input) => ({ ...input, vector: [1, 0, 0] })), { promptTokens: plan.inputs.length, totalTokens: plan.inputs.length });
        holdCommit = true;
        const publication = session.publish(plan);
        await Promise.race([commitReached, publication.then(() => { throw new Error("Publication skipped the controlled commit barrier"); })]);
        await writer.query("BEGIN ISOLATION LEVEL READ COMMITTED"); writerTransaction = true;
        await writer.query(`SET LOCAL search_path TO "${schema}",public`); await writer.query(`SET LOCAL ROLE "${ingesterRole}"`);
        const writerPid = (await writer.query("SELECT pg_backend_pid() AS pid")).rows[0].pid;
        let completed = false;
        const outcome = insertExtra(writer, bundle).then(() => ({ ok: true as const }), (error: unknown) => ({ ok: false as const, error })).finally(() => completed = true);
        try { await waitBlocked(writerPid, publicationPid, () => completed); } finally { releaseCommit(); }
        await publication;
        const result = await outcome; assert.equal(result.ok, false);
        if (!result.ok) assert.equal((result.error as { code?: string }).code, "55000");
        await writer.query("ROLLBACK"); writerTransaction = false;
        const sealed = await admin.query(`SELECT sealed FROM "${schema}".rag_document_versions WHERE id=$1`, [bundle.document.sourceVersionId]);
        assert.equal(sealed.rows[0].sealed, true);
        const active = await store.captureSearch({ kind: "current" }); assert.equal(active!.heads.documents!.revisionId, plan.revisionId);
        assert.equal((await admin.query(`SELECT count(*)::integer AS n FROM "${schema}".rag_document_blocks WHERE source_version_id=$1`, [bundle.document.sourceVersionId])).rows[0].n, 1);
      } finally { releaseCommit(); if (writerTransaction) await writer.query("ROLLBACK"); writer.release(); await session.close(); }
    });
    await t.test("unsupported RR document writes are rejected while read-only RR remains usable", async () => {
      assert.ok(failedRaceVersion && failedRaceRevision);
      const writer = await admin.connect();
      try {
        for (const action of [
          () => writer.query(`UPDATE "${schema}".rag_document_versions SET sealed=true WHERE id=$1`, [failedRaceVersion]),
          () => writer.query(`UPDATE "${schema}".rag_revisions SET state='ready' WHERE id=$1`, [failedRaceRevision]),
          () => writer.query(`INSERT INTO "${schema}".rag_document_blocks(source_version_id,block_id,ordinal,payload) VALUES($1,'b-rr',2,$2::jsonb)`, [failedRaceVersion, JSON.stringify({ id: "b-rr", sourceVersionId: failedRaceVersion, sourceId: "suz-v3-db-document" })]),
        ]) {
          await writer.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
          try { await writer.query(`SET LOCAL search_path TO "${schema}",public`); await writer.query(`SET LOCAL ROLE "${ingesterRole}"`); await assert.rejects(action(), (error: any) => error.code === "25000"); }
          finally { await writer.query("ROLLBACK"); }
        }
      } finally { writer.release(); }
      const reader = createVectorKnowledgeStoreWithPool(rolePool(readerRole));
      try {
        const snapshot = await reader.captureSearch({ kind: "current" }); assert.ok(snapshot);
        const hits = await reader.searchSnapshot(snapshot, [1, 0, 0], { limit: 4, now });
        assert.ok(hits.some((hit) => hit.dependency.head === "public-documents"));
        assert.equal(await reader.assertSnapshot(snapshot, hits.map((hit) => hit.dependency), now), true);
      } finally { await reader.close(); }
    });
  } finally {
    await store.close();
    if (created) {
      const owned = await admin.query("SELECT n.nspname FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=$1 AND r.rolname=current_user", [schema]);
      assert.equal(owned.rows[0]?.nspname, schema, "Refusing to remove an unowned test schema");
      // Fresh generated name + successful CREATE + ownership guard; never DROP a database/public schema.
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    }
    for (const role of createdRoles.reverse()) {
      const identity = await admin.query("SELECT oid::integer AS oid FROM pg_roles WHERE rolname=$1", [role.name]);
      assert.equal(identity.rows[0]?.oid, role.oid, "Refusing to remove a replaced or unowned role");
      await admin.query(`DROP ROLE "${role.name}"`);
    }
    await admin.end();
  }
});
