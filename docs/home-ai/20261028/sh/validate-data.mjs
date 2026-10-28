import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../../../../", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const contract = read("docs/home-ai/20261028/source-contract.json");
const current = read("server/data/rag/silicon-hill.json");
const archive = read("server/data/rag/silicon-hill-archive.json");
const base = read("server/data/silicon-hill-knowledge.json");
const cases = read("docs/home-ai/20261028/sh/retrieval-cases.json");
const sourceIds = new Set(base.sources.map((source) => source.id));
const chunkIds = new Set(base.chunks.map((chunk) => chunk.id));
const https = (value) => {
  const url = new URL(value);
  assert.equal(url.protocol, "https:");
  assert.ok(
    !url.username && !url.password && !url.port && !url.search && !url.hash,
  );
  assert.ok(
    ["wiki.sh.cvut.cz", "sherna.siliconhill.cz"].includes(url.hostname),
  );
};
const day = (value) => {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  const valueMs = Date.parse(`${value}T00:00:00Z`);
  assert.equal(new Date(valueMs).toISOString().slice(0, 10), value);
  return valueMs;
};
for (const [dataset, status] of [
  [current, "current"],
  [archive, "archived"],
]) {
  assert.deepEqual(Object.keys(dataset).sort(), [
    "chunks",
    "sources",
    "version",
  ]);
  assert.equal(dataset.version, 2);
  for (const source of dataset.sources) {
    const expectedKeys = Object.keys(contract.sourceFields)
      .filter((field) => field !== "archiveReason" || status === "archived")
      .sort();
    assert.deepEqual(Object.keys(source).sort(), expectedKeys, source.id);
    assert.match(source.id, /^sh-[a-z0-9-]+$/);
    assert.ok(!sourceIds.has(source.id), `duplicate source ${source.id}`);
    sourceIds.add(source.id);
    assert.equal(source.authority, "silicon-hill");
    assert.equal(source.status, status);
    assert.ok(source.title && source.title.length <= 200);
    https(source.url);
    https(source.discoveryUrl);
    const checked = day(source.checkedAt),
      review = day(source.reviewAfter);
    assert.ok(review > checked);
    assert.ok(review - checked <= (status === "current" ? 7 : 31) * 86400000);
    assert.equal(source.documentDate, null); // No publication day was inferred from a URL/revision.
    for (const field of ["effectiveFrom", "effectiveUntil"]) {
      if (source[field] === null) continue;
      assert.match(
        source[field],
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/,
      );
      assert.ok(Number.isFinite(Date.parse(source[field])));
    }
    if (status === "current") {
      assert.equal(source.effectiveFrom, null);
      assert.equal(source.effectiveUntil, null);
    }
    assert.ok(source.versionNote && source.versionNote.length <= 1000);
    if (new URL(source.url).hostname === "wiki.sh.cvut.cz") {
      assert.equal(source.license, "CC BY-SA 4.0");
      assert.equal(
        source.licenseUrl,
        "https://creativecommons.org/licenses/by-sa/4.0/",
      );
      assert.ok(source.author && source.sourceUpdatedAt);
    } else {
      assert.equal(source.license, null);
      assert.equal(source.licenseUrl, null);
      assert.equal(source.sourceUpdatedAt, null);
    }
    if (status === "archived") assert.ok(source.archiveReason);
  }
  for (const chunk of dataset.chunks) {
    assert.deepEqual(
      Object.keys(chunk).sort(),
      Object.keys(contract.chunkFields).sort(),
    );
    assert.match(chunk.id, /^sh-[a-z0-9-]+$/);
    assert.ok(!chunkIds.has(chunk.id), `duplicate chunk ${chunk.id}`);
    chunkIds.add(chunk.id);
    assert.ok(dataset.sources.some((source) => source.id === chunk.sourceId));
    assert.ok(chunk.text.trim() && chunk.text.length <= 800);
    assert.ok(chunk.sourceLocator.trim());
    assert.ok(contract.topics.includes(chunk.topic));
    assert.ok(
      Array.isArray(chunk.keywords) &&
        chunk.keywords.length > 0 &&
        chunk.keywords.every((word) => typeof word === "string" && word.trim()),
    );
    assert.equal(
      new Set(chunk.keywords.map((word) => word.toLowerCase())).size,
      chunk.keywords.length,
    );
    assert.equal(
      chunk.contentSha256,
      createHash("sha256").update(chunk.text).digest("hex"),
    );
    assert.ok(
      !/\b\d+[ ,.]*\d*\s*(?:Kč|CZK|EUR)\b/.test(chunk.text),
      "No unverified price in this wave",
    );
  }
}
assert.equal(current.sources.length, 8);
assert.equal(current.chunks.length, 13);
assert.equal(archive.sources.length, 2);
assert.equal(archive.chunks.length, 0);
for (const source of current.sources) {
  const words = current.chunks
    .filter((chunk) => chunk.sourceId === source.id)
    .flatMap((chunk) => chunk.text.split(/\s+/));
  assert.ok(
    words.length <= 180,
    `short factual paraphrases only: ${source.id}`,
  );
}
assert.equal(cases.length, 13);
for (const item of cases) {
  assert.ok(item.query.trim());
  assert.ok(item.expectedChunkIds.length > 0);
  for (const id of item.expectedChunkIds)
    assert.ok(current.chunks.some((chunk) => chunk.id === id));
  for (const id of item.forbiddenSourceIds ?? [])
    assert.ok(archive.sources.some((source) => source.id === id));
}
assert.equal(new Set(cases.map((item) => item.query)).size, cases.length);
console.log(
  JSON.stringify({
    result: "PASS",
    sources: 8,
    currentChunks: 13,
    archivedSources: 2,
    archivedChunks: 0,
    retrievalCases: 13,
    checks: [
      "contract-fields",
      "global-ids-against-base",
      "public-https-urls",
      "real-calendar-dates",
      "review-period",
      "explicit-effective-offsets",
      "licence-provenance",
      "bounded-paraphrases",
      "sha256",
      "no-prices",
      "eval-references",
    ],
  }),
);
