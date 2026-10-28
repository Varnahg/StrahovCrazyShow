import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = read("docs/home-ai/20261028/source-contract.json");
const current = read("server/data/rag/suz.json");
const archive = read("server/data/rag/suz-archive.json");
const cases = read("docs/home-ai/20261028/suz/retrieval-cases.json");
const sourceIds = new Set();
const chunkIds = new Set();
const day = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const instant = (value) => value === null ||
  (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(value) && Number.isFinite(Date.parse(value)));
for (const [dataset, status] of [[current, "current"], [archive, "archived"]]) {
  assert.equal(dataset.version, 2);
  assert.deepEqual(Object.keys(dataset).sort(), ["chunks", "sources", "version"]);
  const local = new Map();
  for (const source of dataset.sources) {
    assert.match(source.id, /^suz-[a-z0-9-]+$/);
    assert.ok(!sourceIds.has(source.id), `duplicate source ${source.id}`);
    sourceIds.add(source.id);
    local.set(source.id, source);
    const expectedFields = Object.keys(contract.sourceFields).filter(field => field !== "archiveReason" || status === "archived");
    assert.deepEqual(Object.keys(source).sort(), expectedFields.sort(), source.id);
    assert.equal(source.authority, "suz");
    assert.equal(source.status, status);
    assert.ok(source.title.length > 0 && source.title.length <= 200);
    for (const field of ["url", "discoveryUrl"]) {
      const url = new URL(source[field]);
      assert.equal(url.protocol, "https:");
      assert.equal(url.hostname, "www.suz.cvut.cz");
      assert.equal(url.username + url.password + url.port + url.search + url.hash, "");
      assert.match(url.pathname, /^\/cz\//);
    }
    assert.ok(day(source.checkedAt) && day(source.reviewAfter), source.id);
    assert.ok(Date.parse(source.reviewAfter) > Date.parse(source.checkedAt));
    assert.ok(instant(source.effectiveFrom) && instant(source.effectiveUntil));
    if (source.effectiveFrom && source.effectiveUntil) assert.ok(Date.parse(source.effectiveUntil) > Date.parse(source.effectiveFrom));
    assert.ok(source.documentDate === null || day(source.documentDate));
    assert.equal(source.license, null);
    assert.equal(source.licenseUrl, null);
    assert.ok(typeof source.versionNote === "string" && source.versionNote.length <= 1000);
    assert.ok(["official-document", "official-service", "directory"].includes(source.authorityLevel));
    if (status === "archived") assert.ok(source.archiveReason.length > 0);
  }
  const wordCounts = new Map();
  for (const chunk of dataset.chunks) {
    assert.deepEqual(Object.keys(chunk).sort(), Object.keys(contract.chunkFields).sort());
    assert.match(chunk.id, /^suz-[a-z0-9-]+$/);
    assert.ok(!chunkIds.has(chunk.id), `duplicate chunk ${chunk.id}`);
    chunkIds.add(chunk.id);
    assert.ok(local.has(chunk.sourceId), `unknown source ${chunk.sourceId}`);
    assert.ok(chunk.text.length > 0 && chunk.text.length <= 800, chunk.id);
    assert.ok(contract.topics.includes(chunk.topic), chunk.id);
    assert.ok(chunk.sourceLocator.length > 0);
    assert.ok(Array.isArray(chunk.keywords) && chunk.keywords.length > 0);
    assert.ok(chunk.keywords.every(word => typeof word === "string" && word.trim()));
    assert.equal(chunk.contentSha256, createHash("sha256").update(chunk.text, "utf8").digest("hex"), chunk.id);
    assert.doesNotMatch(chunk.text, /(?:CZ\d{22}|\b\d{2}-\d{10}\/\d{4}\b|https?:\/\/)/);
    wordCounts.set(chunk.sourceId, (wordCounts.get(chunk.sourceId) ?? 0) + chunk.text.split(/\s+/).length);
  }
  for (const [id, count] of wordCounts) assert.ok(count <= 200, `${id}: ${count} words`);
}
assert.equal(archive.chunks.length, 0);
const archivedIds = new Set(archive.sources.map(source => source.id));
assert.equal(current.sources.find(source => source.id === "suz-scenario-2026-2027").effectiveFrom, "2026-05-04T00:00:00+02:00");
assert.equal(current.sources.find(source => source.id === "suz-dorm-tariff-2026-09").effectiveFrom, "2026-09-01T00:00:00+02:00");
assert.equal(current.sources.find(source => source.id === "suz-vup-2026-2027").effectiveFrom, null);
assert.equal(current.sources.find(source => source.id === "suz-procedures-2026-2027").effectiveFrom, null);
for (const item of cases) {
  assert.ok(typeof item.query === "string" && item.query.length > 0);
  assert.ok(item.expectedChunkIds.length > 0);
  assert.ok(item.expectedChunkIds.every(id => chunkIds.has(id)));
  assert.ok(item.forbiddenSourceIds.every(id => archivedIds.has(id)));
}
console.log(JSON.stringify({ validation: "data", sources: current.sources.length, chunks: current.chunks.length, archivedSources: archive.sources.length, cases: cases.length, result: "PASS" }));

if (process.argv.includes("--retrieval")) {
  const { retrieveConversationKnowledge } = await import(pathToFileURL(resolve(root, "server/crazy-typka-retrieval.ts")).href);
  const failures = [];
  for (const item of cases) {
    const results = retrieveConversationKnowledge(item.query, [], 4, Date.parse("2026-10-28T12:00:00Z"));
    const found = results.map(chunk => chunk.id);
    const missing = item.expectedChunkIds.filter(id => !found.includes(id));
    const forbidden = results.filter(chunk => item.forbiddenSourceIds.includes(chunk.source.id)).map(chunk => chunk.source.id);
    if (missing.length || forbidden.length) failures.push({ query: item.query, found, missing, forbidden });
  }
  console.log(JSON.stringify({ validation: "actual-retrieval", cases: cases.length, passed: cases.length - failures.length, failures }, null, 2));
  assert.equal(failures.length, 0, "actual retrieval cases failed");
}
