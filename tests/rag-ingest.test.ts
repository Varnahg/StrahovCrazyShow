import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import original from "../server/data/silicon-hill-knowledge.json";
import { createEmbeddingProfile, type Embedder } from "../server/rag-embeddings";
import { prepareRagCorpus, importPreparedCorpus } from "../server/rag-ingest";
import type { PreparedCorpus, RagImportSession } from "../server/rag-vector-store";
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
