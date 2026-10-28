import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import original from "../server/data/silicon-hill-knowledge.json";
import { createEmbeddingProfile, type Embedder } from "../server/rag-embeddings";
import { prepareRagCorpus, importPreparedCorpus } from "../server/rag-ingest";
import type { PreparedCorpus, RagImportSession } from "../server/rag-vector-store";
import { loadApprovedRagDatasets, RAG_ARCHIVE_FILES, RAG_CURRENT_FILES } from "../scripts/rag-import";
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
