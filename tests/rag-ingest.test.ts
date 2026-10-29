import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import original from "../server/data/silicon-hill-knowledge.json";
import { createEmbeddingProfile, type Embedder } from "../server/rag-embeddings";
import { prepareRagCorpus, importPreparedCorpus, prepareDocumentChanges, importPreparedDocumentCorpus, parseDocumentChangeSet } from "../server/rag-ingest";
import { createVectorKnowledgeStoreWithPool, type PreparedCorpus, type PreparedDocumentCorpus, type RagImportSession, type RagDocumentImportSession, type RagDocumentImportContext, type RagSqlPool } from "../server/rag-vector-store";
import { loadApprovedRagDatasets, loadDocumentChangeFile, ragImportMain, RAG_ARCHIVE_FILES, RAG_CURRENT_FILES } from "../scripts/rag-import";
import { buildKnowledgeDocumentV3, parserProfileSha256, requirePublishableExtraction, validateWorkerEnvelope } from "../server/rag-document-contract";
import { RAG_TOKENIZER } from "../shared/rag-provenance";
import type { DocumentMetadataV3, KnowledgeDocumentBundleV3 } from "../server/rag-knowledge-types";
const profile = createEmbeddingProfile({ dimensions: 3 });
function data(count = 2) {
  const source = { ...original.sources[0], id: "sh-ingest-test", title: "Synthetic import fixture", checkedAt: "2026-10-28", reviewAfter: "2026-11-28", effectiveFrom: null, effectiveUntil: null };
  return { version: 2, sources: [source], chunks: Array.from({ length: count }, (_, i) => { const text = `Testovací úryvek ${i}.`; return { id: `sh-test-chunk-${i}`, sourceId: source.id, text, sourceLocator: "Test", topic: "membership", keywords: ["test"], contentSha256: createHash("sha256").update(text).digest("hex") }; }) };
}
function memorySession() {
  const cache = new Map<string, string>(), ready = new Set<string>(), attempts = new Map<string, { hashes: string[]; state: string }>();
  let head: string | undefined, serial = 0;
  const session: RagImportSession = {
    async prepare(plan) { return ready.has(plan.revisionId) ? "ready" : "building"; },
    async cached(_profile, inputs) { return new Set(inputs.filter((input) => cache.get(input.inputHash) === input.input).map((input) => input.inputHash)); },
    async uncertain() { for (const attempt of attempts.values()) if (attempt.state === "inflight") attempt.state = "uncertain"; return [...attempts.values()].filter((attempt) => attempt.state === "uncertain").flatMap((attempt) => attempt.hashes); },
    async startAttempt(_plan, hashes) { const id = String(++serial); attempts.set(id, { hashes: [...hashes], state: "inflight" }); return id; },
    async completeAttempt(id, _profile, entries) { for (const entry of entries) cache.set(entry.inputHash, entry.input); attempts.get(id)!.state = "complete"; },
    async failAttempt(id, unknown) { attempts.get(id)!.state = unknown ? "uncertain" : "failed"; },
    async publish(plan) { assert.ok(plan.inputs.every((input) => cache.has(input.inputHash))); ready.add(plan.revisionId); head = plan.revisionId; },
    async close() {},
  };
  return { session, cache, attempts, head: () => head };
}
function fakeEmbedder(onCall?: (count: number) => void): Embedder & { calls: string[][] } {
  const calls: string[][] = [];
  return { profile, calls, async embed(inputs, options) {
    options.onAttempt?.(inputs.reduce((sum, input) => sum + Buffer.byteLength(input), 0));
    calls.push([...inputs]); onCall?.(calls.length);
    return { vectors: inputs.map(() => [1, 0, 0]), usage: { promptTokens: inputs.length, totalTokens: inputs.length } };
  } };
}
const options = (embedder: Embedder) => ({ embedder, maxEmbeddingInputs: 100, maxEmbeddingBytes: 100000 });

const documentProfile = createEmbeddingProfile({ dimensions: 3, inputVersion: "title-heading-text-v2" });
const documentNow = Date.parse("2026-10-30T12:00:00Z");
function documentFixture(text = "Původní úplný text.", changes: Partial<DocumentMetadataV3> = {}, page = 1): KnowledgeDocumentBundleV3 {
  const metadata: DocumentMetadataV3 = { ...original.sources[0], id: "suz-automatic-test", title: "Syntetický úplný dokument", authority: "suz", status: "current", archiveReason: null,
    url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty", discoveryUrl: "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty",
    checkedAt: "2026-10-28", reviewAfter: "2026-11-28", effectiveFrom: null, effectiveUntil: null, author: null, license: null, licenseUrl: null, ...changes };
  const parserProfile = { id: "docling-2.144.0-strahov-v1", packages: { "docling-slim": "2.144.0", tiktoken: "0.12.0" }, pipeline: "docling-native-pdf", configurationHash: "b".repeat(64), modelManifestHash: null, tokenizer: { ...RAG_TOKENIZER, version: "0.12.0" } };
  const span = { blockId: "b-stable", locator: `PDF strana ${page}`, page };
  const input = { schemaVersion: 1, sourceId: metadata.id, inputSha256: createHash("sha256").update(text + page).digest("hex"), status: "ok", format: "pdf", parserProfile,
    document: { title: metadata.title, pageCount: page, complete: true }, blocks: [{ id: "b-stable", kind: "text", text, headingPath: ["Pravidla"], spans: [span] }],
    chunks: [{ id: "c-stable", text, headingPath: ["Pravidla"], tokenCount: 15, blockIds: ["b-stable"], spans: [span] }],
    quality: { processedPages: page, expectedPages: page, inputTextCharacters: null, outputTextCharacters: [...text].length, tableCount: 0, ocrPages: [], issues: [] }, links: [] };
  // Synthetic structure: tokenCount is not an independently measured tokenizer result.
  const extraction = requirePublishableExtraction(validateWorkerEnvelope(input, { sourceId: metadata.id, inputSha256: input.inputSha256, parserProfileSha256: parserProfileSha256(parserProfile) }));
  return buildKnowledgeDocumentV3(metadata, extraction, "native");
}
function documentMemory() {
  let legacyPlan: PreparedCorpus | undefined;
  const published = new Map<"current" | "archive", PreparedDocumentCorpus>();
  const cache = new Map<string, string>(), attempts = new Map<string, { profile: string; hashes: readonly string[]; state: string }>(), ready = new Set<string>();
  let sequence = 0;
  const sqlPool: RagSqlPool = { async connect() { return { async query(sql, values) {
    if (sql.includes("current_setting")) return { rows: [{ normal: "0", errors: "0" }] };
    if (sql.includes("FROM rag_schema_version")) return { rows: [{ version: 2 }] };
    if (sql.includes("FROM rag_heads h")) return { rows: [
      ...(legacyPlan ? [{ name: "public", revision_id: legacyPlan.revisionId, profile_id: legacyPlan.profile.id, provider: "openai", model: legacyPlan.profile.model, dimensions: legacyPlan.profile.dimensions, input_version: legacyPlan.profile.inputVersion, data_schema_version: 2, collection: "current" }] : []),
      ...[...published].map(([collection, plan]) => ({ name: collection === "current" ? "public-documents" : "public-archive", revision_id: plan.revisionId, profile_id: plan.profile.id, provider: "openai", model: plan.profile.model, dimensions: plan.profile.dimensions, input_version: plan.profile.inputVersion, data_schema_version: 3, collection })),
    ].filter((row) => Array.isArray(values?.[0]) && values[0].includes(row.name)) };
    return { rows: [] };
  }, release() {} }; }, async end() {}, on() {} };
  const view = createVectorKnowledgeStoreWithPool(sqlPool);
  const session: RagDocumentImportSession = {
    async context(collection) {
      const active = published.get(collection);
      return { collection, snapshot: await view.captureSearch({ kind: collection }), dataset: active?.dataset ?? { version: 3, documents: [], blocks: [], chunks: [] },
        suppressions: active?.suppressions ?? [], legacySources: legacyPlan?.sources.filter((item) => item.metadata.status === "current").map((item) => ({ sourceVersionId: item.id, document: { ...item.metadata, status: "current" as const } })) ?? [] };
    },
    async prepare(plan) { return ready.has(plan.revisionId) ? "ready" : "building"; },
    async cached(profile, inputs) { return new Set(inputs.filter((input) => cache.get(profile.id + ":" + input.inputHash) === input.input).map((input) => input.inputHash)); },
    async uncertain(profile) { for (const item of attempts.values()) if (item.profile === profile.id && item.state === "inflight") item.state = "uncertain"; return [...attempts.values()].filter((item) => item.profile === profile.id && item.state === "uncertain").flatMap((item) => [...item.hashes]); },
    async startAttempt(plan, hashes) { const id = String(++sequence); attempts.set(id, { profile: plan.profile.id, hashes, state: "inflight" }); return id; },
    async completeAttempt(id, profile, entries) { for (const entry of entries) cache.set(profile.id + ":" + entry.inputHash, entry.input); attempts.get(id)!.state = "complete"; },
    async failAttempt(id, uncertain) { attempts.get(id)!.state = uncertain ? "uncertain" : "failed"; },
    async publish(plan) { assert.ok(plan.inputs.every((input) => cache.has(plan.profile.id + ":" + input.inputHash))); ready.add(plan.revisionId); published.set(plan.collection, plan); },
    async close() { await view.close(); },
  };
  return { session, cache, published, attempts, setLegacy(plan: PreparedCorpus) { legacyPlan = plan; } };
}
function documentEmbedder(action?: (count: number) => void): Embedder & { calls: string[][] } { return { ...fakeEmbedder(action), profile: documentProfile }; }
async function documentPlan(memory: ReturnType<typeof documentMemory>, upserts: readonly KnowledgeDocumentBundleV3[], extra: Partial<Parameters<typeof prepareDocumentChanges>[1]> = {}) {
  const context = await memory.session.context("current");
  return prepareDocumentChanges(context, { collection: "current", expectedSnapshotId: context.snapshot?.id ?? null, upserts, ...extra }, documentProfile, documentNow);
}
test("unchanged and checked-date-only imports reuse persistent exact input cache with zero calls", async () => {
  const memory = memorySession(), embedder = fakeEmbedder(), input = data(), first = prepareRagCorpus([input], [], profile);
  const initial = await importPreparedCorpus(first, memory.session, options(embedder)); assert.equal(initial.embeddedInputs, 2); assert.equal(initial.embeddingCalls, 1);
  const identical = await importPreparedCorpus(first, memory.session, { ...options(embedder), maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 });
  assert.equal(identical.embeddingCalls, 0); assert.equal(embedder.calls.length, 1);
  input.sources[0].checkedAt = "2026-10-29";
  const metadata = prepareRagCorpus([input], [], profile); assert.notEqual(metadata.revisionId, first.revisionId);
  assert.deepEqual(metadata.inputs, first.inputs);
  const updated = await importPreparedCorpus(metadata, memory.session, { ...options(embedder), maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 });
  assert.equal(updated.embeddingCalls, 0); assert.equal(memory.head(), metadata.revisionId);
});
test("one changed input embeds once, removal does not reembed and title changes are intentional inputs", async () => {
  const memory = memorySession(), embedder = fakeEmbedder(), input = data();
  await importPreparedCorpus(prepareRagCorpus([input], [], profile), memory.session, options(embedder));
  input.chunks[0].text = "Změněný schválený text."; input.chunks[0].contentSha256 = createHash("sha256").update(input.chunks[0].text).digest("hex");
  const changed = await importPreparedCorpus(prepareRagCorpus([input], [], profile), memory.session, options(embedder));
  assert.equal(changed.embeddedInputs, 1); assert.equal(embedder.calls[1].length, 1);
  input.chunks.pop(); const removed = await importPreparedCorpus(prepareRagCorpus([input], [], profile), memory.session, options(embedder)); assert.equal(removed.embeddingCalls, 0);
  input.sources[0].title += " revised";
  const retitled = await importPreparedCorpus(prepareRagCorpus([input], [], profile), memory.session, options(embedder)); assert.equal(retitled.embeddedInputs, 1);
});
test("archive metadata is persisted in a plan without embedding inputs or active chunks", () => {
  const current = data(1), archive = { version: 2, sources: [{ ...current.sources[0], id: "sh-archive-fixture", status: "archived", archiveReason: "Replaced test fixture" }], chunks: [] };
  const plan = prepareRagCorpus([current], [archive], profile);
  assert.equal(plan.sources.length, 2); assert.equal(plan.inputs.length, 1); assert.equal(plan.chunks.length, 1);
  assert.equal(plan.sources.find((source) => source.metadata.id === "sh-archive-fixture")!.metadata.status, "archived");
  assert.throws(() => prepareRagCorpus([current], [{ ...archive, chunks: current.chunks }], profile));
  assert.throws(() => prepareRagCorpus([{ ...current, version: 1 }], [], profile));
  assert.throws(() => prepareRagCorpus([{ ...current, sources: [{ ...current.sources[0], secret: "no" }] }], [], profile));
});
test("partial failure retains active head and committed cache; uncertainty survives metadata revision changes", async () => {
  const memory = memorySession(), initial = data(1), first = prepareRagCorpus([initial], [], profile);
  await importPreparedCorpus(first, memory.session, options(fakeEmbedder()));
  const bigger = data(34), pending = prepareRagCorpus([bigger], [], profile);
  const failing = fakeEmbedder((count) => { if (count === 2) throw new Error("unknown provider outcome"); });
  await assert.rejects(importPreparedCorpus(pending, memory.session, options(failing)), (error: any) => error.code === "embedding-failed");
  assert.equal(memory.head(), first.revisionId); assert.equal(memory.cache.size, 33);
  bigger.sources[0].checkedAt = "2026-10-29";
  const resumed = prepareRagCorpus([bigger], [], profile), retry = fakeEmbedder();
  await assert.rejects(importPreparedCorpus(resumed, memory.session, options(retry)), (error: any) => error.code === "uncertain-embedding-attempt"); assert.equal(retry.calls.length, 0);
  const result = await importPreparedCorpus(resumed, memory.session, { ...options(retry), retryUncertain: true });
  assert.equal(result.embeddedInputs, 1); assert.equal(result.reusedInputs, 33); assert.equal(retry.calls.length, 1); assert.equal(memory.head(), resumed.revisionId);
});
test("a crash after the attempt record but before completion cannot automatically repay after restart", async () => {
  const memory = memorySession(), plan = prepareRagCorpus([data(1)], [], profile);
  await memory.session.prepare(plan); await memory.session.startAttempt(plan, plan.inputs.map((input) => input.inputHash));
  const embedder = fakeEmbedder();
  await assert.rejects(importPreparedCorpus(plan, memory.session, options(embedder)), (error: any) => error.code === "uncertain-embedding-attempt");
  assert.equal(embedder.calls.length, 0); assert.equal(memory.head(), undefined);
});
test("budgets, profile mismatch, malformed vectors and abort cannot publish partial revisions", async () => {
  const memory = memorySession(), plan = prepareRagCorpus([data(2)], [], profile), embedder = fakeEmbedder();
  await assert.rejects(importPreparedCorpus(plan, memory.session, { ...options(embedder), maxEmbeddingInputs: 1 }), (error: any) => error.code === "embedding-budget"); assert.equal(embedder.calls.length, 0);
  const other = { ...embedder, profile: createEmbeddingProfile({ dimensions: 2 }) };
  await assert.rejects(importPreparedCorpus(plan, memory.session, options(other)), (error: any) => error.code === "invalid-import-data");
  const bad: Embedder = { profile, async embed(inputs, request) { request.onAttempt?.(inputs.reduce((sum, text) => sum + Buffer.byteLength(text), 0)); return { vectors: [[0, 0, 0], [1, 0, 0]], usage: { promptTokens: 2, totalTokens: 2 } }; } };
  await assert.rejects(importPreparedCorpus(plan, memory.session, options(bad)), (error: any) => error.code === "embedding-failed"); assert.equal(memory.head(), undefined); assert.equal(memory.cache.size, 0);
  const abort = new AbortController(); abort.abort();
  await assert.rejects(importPreparedCorpus(plan, memory.session, { ...options(embedder), signal: abort.signal }), (error: any) => error.code === "aborted");
});
test("canonical planning is stable across object key order and profile changes do not share a generation", () => {
  const input = data(1), plan = prepareRagCorpus([input], [], profile);
  const reversed = JSON.parse(JSON.stringify(input), (_key, value) => value && typeof value === "object" && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value);
  assert.equal(prepareRagCorpus([reversed], [], profile).revisionId, plan.revisionId);
  const other = prepareRagCorpus([input], [], createEmbeddingProfile({ dimensions: 2 }));
  assert.notEqual(other.revisionId, plan.revisionId); assert.equal(other.inputs[0].inputHash, plan.inputs[0].inputHash);
});

test("the real approved file loader plans SH and SUZ current chunks plus metadata-only archives", async () => {
  const datasets = await loadApprovedRagDatasets();
  assert.equal(datasets.currentDatasets.length, 3); assert.equal(datasets.archiveDatasets.length, 2);
  const plan = prepareRagCorpus(datasets.currentDatasets, datasets.archiveDatasets, profile);
  const current = new Map(plan.sources.filter((source) => source.metadata.status === "current").map((source) => [source.metadata.id, source.metadata]));
  assert.equal(current.get("membership")?.authority, "silicon-hill");
  assert.equal(current.get("sh-wifi-guide")?.authority, "silicon-hill");
  assert.equal(current.get("suz-vup-2026-2027")?.authority, "suz");
  const chunks = new Map(plan.chunks.map((chunk) => [chunk.raw.id, chunk]));
  for (const id of ["sh-membership-join", "sh-wifi-registration", "suz-housing-payment-due", "suz-arrival-documents"])
    assert.ok(chunks.has(id), `Missing approved current chunk ${id}`);
  const archived = plan.sources.filter((source) => source.metadata.status === "archived");
  assert.ok(archived.some((source) => source.metadata.id === "sh-archive-fotoatelier"));
  assert.ok(archived.some((source) => source.metadata.id === "suz-archive-documents-2022-2023"));
  assert.ok(archived.every((source) => source.metadata.archiveReason && !plan.chunks.some((chunk) => chunk.raw.sourceId === source.metadata.id)));
  assert.ok(plan.chunks.every((chunk) => current.has(chunk.raw.sourceId)));
  assert.deepEqual(new Set(plan.inputs.map((input) => input.inputHash)), new Set(plan.chunks.map((chunk) => chunk.inputHash)));
});

test("a missing, malformed or invalid approved file cannot replace the published corpus with a partial import", async () => {
  const projectRoot = new URL("../", import.meta.url);
  const cacheRoot = fileURLToPath(new URL(".cache/rag-vector-20261028-store/", projectRoot));
  await mkdir(cacheRoot, { recursive: true });
  const temporary = await mkdtemp(join(cacheRoot, "loader-fixture-"));
  const root = pathToFileURL(temporary + sep);
  const files = [...RAG_CURRENT_FILES, ...RAG_ARCHIVE_FILES];
  const memory = memorySession(), embedder = fakeEmbedder();
  const importApproved = async () => {
    // Same loader -> validation/planning -> publication boundary as the administrative CLI.
    const datasets = await loadApprovedRagDatasets(root);
    const plan = prepareRagCorpus(datasets.currentDatasets, datasets.archiveDatasets, profile);
    return importPreparedCorpus(plan, memory.session, options(embedder));
  };
  try {
    for (const file of files) {
      const destination = fileURLToPath(new URL(file, root));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, await readFile(new URL(file, projectRoot)));
    }
    const published = await importApproved(), previousCalls = embedder.calls.length;
    const previousCache = [...memory.cache.entries()];
    for (const file of files) {
      const destination = fileURLToPath(new URL(file, root)), originalContents = await readFile(destination);
      const unchanged = () => {
        assert.equal(memory.head(), published.revisionId, `Failed ${file} replaced the head`);
        assert.equal(embedder.calls.length, previousCalls);
        assert.deepEqual([...memory.cache.entries()], previousCache);
      };
      try {
        await unlink(destination);
        await assert.rejects(importApproved(), (error: NodeJS.ErrnoException) => error.code === "ENOENT"); unchanged();
        await writeFile(destination, '{"version":');
        await assert.rejects(importApproved(), SyntaxError); unchanged();
        await writeFile(destination, JSON.stringify({ version: 1, sources: [], chunks: [] }));
        await assert.rejects(importApproved(), (error: any) => error.code === "invalid-import-data"); unchanged();
      } finally { await writeFile(destination, originalContents); }
    }
  } finally {
    // Only the unique directory just created under this task's cache may be removed.
    assert.ok(resolve(temporary).startsWith(resolve(cacheRoot) + sep));
    await rm(temporary, { recursive: true, force: true });
  }
});

test("legacy planning cannot mislabel locator inputs with the new heading profile", () => {
  assert.throws(() => prepareRagCorpus([data(1)], [], documentProfile), (error: any) => error.code === "invalid-import-data");
});

test("whole-document changes retain unrelated sources and reuse metadata/page-only inputs", async () => {
  const memory = documentMemory(), embedder = documentEmbedder(), first = documentFixture();
  try {
    const initial = await documentPlan(memory, [first]);
    await importPreparedDocumentCorpus(initial, memory.session, options(embedder));
    const other = documentFixture("Druhý úplný zdroj.", { id: "suz-second-document", url: "https://www.suz.cvut.cz/cz/media/file/ubytovaci-rad" });
    const second = await documentPlan(memory, [other]);
    assert.equal(second.dataset.documents.length, 2);
    const result = await importPreparedDocumentCorpus(second, memory.session, options(embedder));
    assert.equal(result.embeddedInputs, 1); assert.equal(result.reusedInputs, 1);
    const moved = documentFixture("Původní úplný text.", { checkedAt: "2026-10-29" }, 2);
    const metadata = await documentPlan(memory, [moved]);
    assert.equal(metadata.dataset.documents.length, 2);
    assert.notEqual(moved.document.sourceVersionId, first.document.sourceVersionId);
    assert.deepEqual(metadata.inputs, second.inputs);
    const reused = await importPreparedDocumentCorpus(metadata, memory.session, { ...options(embedder), maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 });
    assert.equal(reused.embeddingCalls, 0); assert.equal(embedder.calls.length, 2);
    const removed = await documentPlan(memory, [], { retireSourceVersionIds: [other.document.sourceVersionId] });
    await importPreparedDocumentCorpus(removed, memory.session, { ...options(embedder), maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 });
    assert.equal(removed.dataset.documents.length, 1); assert.equal(memory.cache.size, 2);
    await assert.rejects(documentPlan(memory, [], { retireSourceVersionIds: ["f".repeat(64)] }), (error: any) => error.code === "invalid-import-data");
    const changed = await documentPlan(memory, [documentFixture("Jediná věcná změna.")]);
    assert.equal((await importPreparedDocumentCorpus(changed, memory.session, options(embedder))).embeddedInputs, 1);
  } finally { await memory.session.close(); }
});

test("archive retains distinct source versions with the same local chunk identity", async () => {
  const memory = documentMemory(), embedder = documentEmbedder();
  try {
    const live = await documentPlan(memory, [documentFixture()]);
    await importPreparedDocumentCorpus(live, memory.session, options(embedder));
    const old = documentFixture("Historická varianta jedna.", { status: "archived", archiveReason: "Nahrazeno", effectiveFrom: "2024-09-01T00:00:00+02:00", effectiveUntil: "2025-09-01T00:00:00+02:00" });
    const newer = documentFixture("Historická varianta dvě.", { status: "archived", archiveReason: "Nahrazeno", effectiveFrom: "2025-09-01T00:00:00+02:00", effectiveUntil: "2026-09-01T00:00:00+02:00" });
    assert.equal(old.chunks[0].id, newer.chunks[0].id);
    const context = await memory.session.context("archive");
    const plan = prepareDocumentChanges(context, { collection: "archive", expectedSnapshotId: null, upserts: [old, newer] }, documentProfile, documentNow);
    const result = await importPreparedDocumentCorpus(plan, memory.session, options(embedder));
    assert.equal(result.sources, 2); assert.equal(result.logicalSources, 1); assert.equal(result.chunks, 2);
    assert.equal(memory.published.get("current")!.revisionId, live.revisionId);
  } finally { await memory.session.close(); }
});

test("suppression survives expiry, retirement and new legacy metadata; rollback binds the live version", async () => {
  const memory = documentMemory(), embedder = documentEmbedder(), target = documentFixture();
  const legacyData = data(1);
  legacyData.sources[0] = { ...legacyData.sources[0], id: "suz-legacy-test", authority: "suz", url: target.document.url, discoveryUrl: target.document.discoveryUrl };
  legacyData.chunks[0] = { ...legacyData.chunks[0], id: "suz-legacy-chunk", sourceId: "suz-legacy-test", topic: "housing" };
  const oldLegacy = prepareRagCorpus([legacyData], [], profile), originalVersion = oldLegacy.sources[0].id;
  memory.setLegacy(oldLegacy);
  try {
    const initial = await documentPlan(memory, [target], { legacyReplacements: [{ legacySourceVersionId: originalVersion, documentSourceVersionId: target.document.sourceVersionId }] });
    await importPreparedDocumentCorpus(initial, memory.session, options(embedder));
    assert.equal(initial.suppressions[0].legacySourceVersionId, originalVersion);
    const context = await memory.session.context("current");
    const expired = prepareDocumentChanges(context, { collection: "current", expectedSnapshotId: context.snapshot!.id, upserts: [] }, documentProfile, Date.parse("2026-12-01T12:00:00Z"));
    assert.deepEqual(expired.suppressions, initial.suppressions);
    const retired = await documentPlan(memory, [], { retireSourceVersionIds: [target.document.sourceVersionId] });
    await importPreparedDocumentCorpus(retired, memory.session, { ...options(embedder), maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 });
    assert.equal(retired.dataset.documents.length, 0); assert.deepEqual(retired.suppressions, initial.suppressions);
    legacyData.sources[0].checkedAt = "2026-10-29";
    const freshLegacy = prepareRagCorpus([legacyData], [], profile); memory.setLegacy(freshLegacy);
    assert.notEqual(freshLegacy.sources[0].id, originalVersion);
    const carried = await documentPlan(memory, []);
    assert.deepEqual(carried.suppressions, initial.suppressions, "source lineage remains hidden despite a fresh legacy version");
    await assert.rejects(documentPlan(memory, [], { restoreLegacySourceVersionIds: [originalVersion] }), (error: any) => error.code === "revision-conflict");
    const restore = await documentPlan(memory, [], { restoreLegacySourceVersionIds: [freshLegacy.sources[0].id] });
    assert.equal(restore.suppressions.length, 0); assert.equal(restore.restores[0].legacySourceVersionId, freshLegacy.sources[0].id);
    const result = await importPreparedDocumentCorpus(restore, memory.session, { ...options(embedder), maxEmbeddingInputs: 0, maxEmbeddingBytes: 0 });
    assert.equal(result.restoredLegacySources, 1); assert.equal(embedder.calls.length, 1);
    assert.equal(memory.cache.size, 1, "retirement and rollback do not delete paid vectors");
  } finally { await memory.session.close(); }
});

test("v3 interrupted batches preserve the head and uncertainty across metadata revisions", async () => {
  const memory = documentMemory();
  const bundles = Array.from({ length: 34 }, (_, index) => documentFixture(`Úplný zdroj ${index}.`, { id: `suz-auto-${index}` }));
  try {
    const first = await documentPlan(memory, [bundles[0]]);
    await importPreparedDocumentCorpus(first, memory.session, options(documentEmbedder()));
    const pending = await documentPlan(memory, bundles), failed = documentEmbedder((call) => { if (call === 2) throw new Error("synthetic uncertain outcome"); });
    await assert.rejects(importPreparedDocumentCorpus(pending, memory.session, options(failed)), (error: any) => error.code === "embedding-failed");
    assert.equal(memory.published.get("current")!.revisionId, first.revisionId); assert.equal(memory.cache.size, 33);
    const revised = bundles.map((_bundle, index) => documentFixture(`Úplný zdroj ${index}.`, { id: `suz-auto-${index}`, checkedAt: "2026-10-29" }));
    const retryPlan = await documentPlan(memory, revised), automatic = documentEmbedder();
    await assert.rejects(importPreparedDocumentCorpus(retryPlan, memory.session, options(automatic)), (error: any) => error.code === "uncertain-embedding-attempt");
    assert.equal(automatic.calls.length, 0);
    const resumed = await importPreparedDocumentCorpus(retryPlan, memory.session, { ...options(documentEmbedder()), retryUncertain: true });
    assert.equal(resumed.embeddedInputs, 1); assert.equal(resumed.reusedInputs, 33);
  } finally { await memory.session.close(); }
});

test("v3 rejects stale base, incomplete bundles, model-space conflicts and conflicting actions before embedding", async () => {
  const memory = documentMemory(), target = documentFixture();
  memory.setLegacy(prepareRagCorpus([data(1)], [], profile));
  try {
    const context = await memory.session.context("current");
    assert.throws(() => prepareDocumentChanges(context, { collection: "current", expectedSnapshotId: null, upserts: [target] }, documentProfile), (error: any) => error.code === "revision-conflict");
    assert.throws(() => prepareDocumentChanges(context, { collection: "current", expectedSnapshotId: context.snapshot!.id, upserts: [target] }, createEmbeddingProfile({ dimensions: 2, inputVersion: "title-heading-text-v2" })), (error: any) => error.code === "profile-conflict");
    assert.throws(() => parseDocumentChangeSet({ collection: "current", expectedSnapshotId: context.snapshot!.id, upserts: [{ ...target, blocks: [] }] }));
    const change = { collection: "current" as const, expectedSnapshotId: context.snapshot!.id, upserts: [target] };
    const validated = parseDocumentChangeSet(change);
    change.upserts.length = 0; assert.equal(validated.upserts.length, 1, "validated input does not borrow caller arrays");
  } finally { await memory.session.close(); }
});

test("document CLI input validates whole bundles and rejects unrelated options before opening a DB", async () => {
  const base = resolve(".cache/rag-auto-store-20261028/cli-fixtures"); await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "changes-"));
  try {
    const path = join(directory, "input.json"), bundle = documentFixture();
    await writeFile(path, JSON.stringify({ collection: "current", expectedSnapshotId: null, upserts: [bundle] }));
    const parsed = await loadDocumentChangeFile(path);
    assert.equal(parsed.upserts[0].document.sourceVersionId, bundle.document.sourceVersionId);
    assert.ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.upserts));
    await writeFile(path, JSON.stringify({ collection: "current", expectedSnapshotId: null, upserts: [{ ...bundle, chunks: [] }] }));
    await assert.rejects(loadDocumentChangeFile(path), (error: any) => error.code === "invalid-import-data");
    await assert.rejects(ragImportMain(["status", "--scope", "current", "--as-of", "2025-10-01T00:00:00.000Z"], { RAG_DATABASE_URL: "postgresql://fixture@127.0.0.1/not_contacted_test" }), /invalid-arguments/);
    await assert.rejects(ragImportMain(["migrate", "--input", path], { RAG_DATABASE_URL: "postgresql://fixture@127.0.0.1/not_contacted_test" }), /invalid-arguments/);
  } finally {
    assert.ok(resolve(directory).startsWith(base + sep), "Only the generated owned fixture directory may be removed");
    await rm(directory, { recursive: true, force: true });
  }
});
