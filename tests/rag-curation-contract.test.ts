import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { CRAZY_TYPKA_DOCUMENT_CITATION_POLICY } from "../shared/crazy-typka";
import {
  isCuratedKnowledgeCurrent,
  isCuratedKnowledgeSource,
  isPublicCurationText,
  isKnowledgeSupportingRef,
  curationPublisherForUrl,
} from "../shared/knowledge-curation";
import {
  buildCuratedKnowledgeDocumentV3,
  curatedDocumentVersionId,
  resolveRagKnowledgeChunkV3,
  validateCuratedKnowledgeDocumentV3,
  validateRagDocumentDatasetV3,
} from "../server/rag-curation-contract";
import {
  createEmbeddingProfile,
  documentEmbeddingInputV3,
} from "../server/rag-embeddings";
import type { CuratedKnowledgeMetadataV3 } from "../server/rag-knowledge-types";
import { prepareDocumentChanges } from "../server/rag-ingest";
import {
  inspectDocumentImportWithPool,
  type RagSqlPool,
} from "../server/rag-vector-store";

const now = Date.parse("2026-11-03T12:00:00Z");
const profile = createEmbeddingProfile({
  dimensions: 3,
  inputVersion: "title-heading-text-v2",
});
const meta: CuratedKnowledgeMetadataV3 = {
  id: "kc-laundry-b6-experience",
  itemId: "faq-laundry",
  title: "Praktická zkušenost s prádelnou",
  status: "current",
  verification: "community-experience",
  applicability: "Prádelna na bloku 6",
  reviewedAt: "2026-11-03",
  reviewAfter: "2026-12-03",
  factCheckedAt: null,
  observedFrom: "2026-09-01",
  observedUntil: "2026-10-31",
  limitations: ["Zkušenost obyvatel, nezávisle neověřeno."],
  supportingRefs: [],
  archiveReason: null,
  versionNote: "Anonymizovaná kurace zkušeností; není oficiální předpis.",
};
// Synthetic fixture count; actual compilation measures the complete embedding input.
const unit = {
  text: "Obyvatelé popisovali, že pomáhá ověřit dostupnost pračky předem.",
  headingPath: ["Prádelna"],
  tokenCount: 35,
};
const bundle = () => buildCuratedKnowledgeDocumentV3(meta, unit);
const dataset = (value = bundle()) => ({
  version: 3,
  documents: [value.document],
  blocks: value.blocks,
  chunks: value.chunks,
});

test("reviewed external supporting pages retain the real publisher without widening extraction or host access", () => {
  const policy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY;
  const url = "https://pid.cz/informace-k-cestovani/mobilni-aplikace/";
  const ref = {
    publisher: "pid",
    title: "PID Lítačka",
    url,
    locator: "Vyhledání spojení",
    factCheckedAt: "2026-11-03",
    reviewAfter: "2026-11-10",
  };
  assert.ok(isKnowledgeSupportingRef(ref, policy));
  for (const changed of [
    { ...ref, publisher: "silicon-hill" },
    {
      ...ref,
      url: "https://pid.cz/informace-k-cestovani/mobilni-aplikace/private",
    },
    { ...ref, url: url + "?token=private" },
    {
      ...ref,
      url: "https://pid.cz.evil.invalid/informace-k-cestovani/mobilni-aplikace/",
    },
    {
      ...ref,
      url: "https://user:secret@pid.cz/informace-k-cestovani/mobilni-aplikace/",
    },
  ])
    assert.equal(isKnowledgeSupportingRef(changed, policy), false);
  assert.equal(
    curationPublisherForUrl("https://www.rechargingbar.cz/", policy),
    "recharging-bar",
  );
  assert.equal(
    isKnowledgeSupportingRef(
      {
        ...ref,
        publisher: "silicon-hill",
        url: "https://www.rechargingbar.cz/",
      },
      policy,
    ),
    false,
  );
  assert.equal(
    curationPublisherForUrl("https://download.cvut.cz/private-license", policy),
    undefined,
  );
});

test("curation is a separate immutable source with honest review and observation dates", () => {
  const b = bundle(),
    resolved = resolveRagKnowledgeChunkV3(b.document, b.chunks[0]);
  assert.equal(resolved.source.adaptation, "knowledge-curation");
  assert.equal(b.document.authority, null);
  assert.ok(!("extraction" in b.document));
  assert.ok(!("checkedAt" in resolved.source));
  assert.ok(!("url" in resolved.source));
  assert.ok(
    isCuratedKnowledgeSource(
      resolved.source,
      CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
    ),
  );
  assert.ok(isCuratedKnowledgeCurrent(b.document, now));
  assert.ok(
    !isCuratedKnowledgeCurrent(b.document, Date.parse("2026-12-03T00:00:00Z")),
  );
  assert.deepEqual(validateRagDocumentDatasetV3(dataset()), dataset());
  assert.ok(Object.isFrozen(resolved.source));
  assert.throws(() => {
    (resolved.source as any).reviewedAt = "2030-01-01";
  });
});

test("review/provenance changes reuse exact embeddings while text changes create a new input", () => {
  const initial = bundle();
  const reviewed = buildCuratedKnowledgeDocumentV3(
    { ...meta, reviewedAt: "2026-11-04", reviewAfter: "2026-12-04" },
    unit,
    "knowledge-curation-v2",
  );
  assert.notEqual(
    initial.document.sourceVersionId,
    reviewed.document.sourceVersionId,
  );
  assert.equal(
    initial.document.curation.normalizedSha256,
    reviewed.document.curation.normalizedSha256,
  );
  assert.equal(
    documentEmbeddingInputV3(initial.document, initial.chunks[0], profile),
    documentEmbeddingInputV3(reviewed.document, reviewed.chunks[0], profile),
  );
  const changed = buildCuratedKnowledgeDocumentV3(meta, {
    ...unit,
    text: unit.text + " Platí jen pro uvedený blok.",
  });
  assert.notEqual(
    documentEmbeddingInputV3(initial.document, initial.chunks[0], profile),
    documentEmbeddingInputV3(changed.document, changed.chunks[0], profile),
  );
});

test("official support cannot launder community, unapproved URLs or an expired support deadline", () => {
  const ref = {
    publisher: "suz" as const,
    title: "Smlouva o ubytování",
    url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty",
    locator: "Ubytovací smlouva",
    factCheckedAt: "2026-11-03",
    reviewAfter: "2026-11-20",
  };
  const official = {
    ...meta,
    id: "kc-housing-official",
    verification: "verified-official" as const,
    factCheckedAt: "2026-11-03",
    observedFrom: null,
    observedUntil: null,
    reviewAfter: "2026-11-20",
    supportingRefs: [ref],
  };
  assert.doesNotThrow(() => buildCuratedKnowledgeDocumentV3(official, unit));
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3({ ...official, supportingRefs: [] }, unit),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3({ ...meta, supportingRefs: [ref] }, unit),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3(
      { ...official, reviewAfter: "2026-11-21" },
      unit,
    ),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3(
      {
        ...official,
        supportingRefs: [
          { ...ref, url: "https://discord.com/channels/example" },
        ],
      },
      unit,
    ),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3(
      { ...official, supportingRefs: [{ ...ref, publisher: "silicon-hill" }] },
      unit,
    ),
  );
  const b = buildCuratedKnowledgeDocumentV3(official, unit);
  assert.ok(
    !isCuratedKnowledgeCurrent(b.document, Date.parse("2026-11-20T00:00:00Z")),
  );
});

test("raw identifiers, private audit fields, false extraction and malformed observations are rejected", () => {
  for (const text of [
    "https://discord.com/channels/123/456",
    "<@123456789012345678>",
    "123456789012345678",
    "C:\\Users\\secret\\archive.html",
  ]) {
    assert.equal(isPublicCurationText(text, 500), false);
    assert.throws(() =>
      buildCuratedKnowledgeDocumentV3(meta, { ...unit, text }),
    );
  }
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3({ ...meta, audit: "private" } as any, unit),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3({ ...meta, observedFrom: null }, unit),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3(
      { ...meta, observedUntil: "2027-01-01" },
      unit,
    ),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3(
      { ...meta, factCheckedAt: "2026-11-03" },
      unit,
    ),
  );
  const b = bundle();
  for (const change of [
    { authority: "suz" },
    { extraction: { complete: true } },
    { url: "https://www.suz.cvut.cz/" },
  ]) {
    const wrong = { ...b.document, ...change };
    (wrong as any).sourceVersionId = curatedDocumentVersionId(wrong as any);
    assert.throws(() => validateCuratedKnowledgeDocumentV3(wrong));
  }
});

test("the corpus requires complete exact homogeneous units and preserves extraction identities", async () => {
  const b = bundle();
  assert.throws(() =>
    validateRagDocumentDatasetV3({ ...dataset(b), blocks: [] }),
  );
  assert.throws(() =>
    validateRagDocumentDatasetV3({
      ...dataset(b),
      chunks: [{ ...b.chunks[0], text: "Invented" }],
    }),
  );
  assert.throws(() =>
    validateRagDocumentDatasetV3({
      ...dataset(b),
      chunks: [...b.chunks, b.chunks[0]],
    }),
  );
  assert.throws(() =>
    validateRagDocumentDatasetV3({
      ...dataset(b),
      blocks: [{ ...b.blocks[0], sourceId: "someone-else" }],
    }),
  );
  assert.throws(() =>
    buildCuratedKnowledgeDocumentV3(meta, { ...unit, tokenCount: 651 }),
  );
  const bootstrap = JSON.parse(
    await readFile(
      new URL("../server/data/rag/bootstrap-documents.json", import.meta.url),
      "utf8",
    ),
  );
  const original = bootstrap.bundles[0];
  const mixed = validateRagDocumentDatasetV3({
    version: 3,
    documents: [original.document, b.document],
    blocks: [...original.blocks, ...b.blocks],
    chunks: [...original.chunks, ...b.chunks],
  });
  assert.deepEqual(mixed.documents[0], original.document);
  assert.equal(
    mixed.documents[0].sourceVersionId,
    original.document.sourceVersionId,
  );
});

test("expired curation cannot be newly published or used as an official legacy replacement", () => {
  const context = {
    collection: "current" as const,
    snapshot: null,
    dataset: { version: 3 as const, documents: [], blocks: [], chunks: [] },
    suppressions: [],
    legacySources: [],
  };
  assert.throws(() =>
    prepareDocumentChanges(
      context,
      { collection: "current", expectedSnapshotId: null, upserts: [bundle()] },
      profile,
      Date.parse("2026-12-04T12:00:00Z"),
    ),
  );
  const b = bundle();
  assert.throws(() =>
    prepareDocumentChanges(
      context,
      {
        collection: "current",
        expectedSnapshotId: null,
        upserts: [b],
        legacyReplacements: [
          {
            legacySourceVersionId: "a".repeat(64),
            documentSourceVersionId: b.document.sourceVersionId,
          },
        ],
      },
      profile,
      now,
    ),
  );
});

test("missing-input preview is read-only, requires no API, and reports inflight uncertainty", async () => {
  const statements: string[] = [];
  const b = buildCuratedKnowledgeDocumentV3(
    {
      ...meta,
      reviewedAt: "2000-01-01",
      reviewAfter: "2100-01-01",
      observedFrom: "1999-01-01",
      observedUntil: "1999-12-31",
    },
    unit,
  );
  let planHash = "";
  const pool: RagSqlPool = {
    async connect() {
      return {
        async query(sql) {
          statements.push(sql);
          if (sql.includes("current_setting"))
            return { rows: [{ normal: "0", errors: "0" }] };
          if (sql.startsWith("SELECT version FROM rag_schema_version"))
            return { rows: [{ version: 3 }] };
          if (sql.includes("FROM rag_embedding_attempts"))
            return { rows: [{ input_hashes: [planHash] }] };
          return { rows: [] };
        },
        release() {},
      };
    },
    async end() {},
    on() {},
  };
  const preview = await inspectDocumentImportWithPool(
    pool,
    "current",
    (context) => {
      const plan = prepareDocumentChanges(
        context,
        { collection: "current", expectedSnapshotId: null, upserts: [b] },
        profile,
      );
      planHash = plan.inputs[0].inputHash;
      return plan;
    },
  );
  assert.equal(preview.missingInputs, 1);
  assert.equal(preview.reusedInputs, 0);
  assert.equal(preview.missingInputTokens, unit.tokenCount);
  assert.equal(preview.uncertainInputs, 1);
  assert.ok(preview.missingInputBytes > 0);
  assert.equal(preview.migrationRequired, false);
  assert.ok(
    statements.some((sql) => sql.includes("REPEATABLE READ READ ONLY")),
  );
  assert.ok(
    statements.every((sql) => /^(SELECT|BEGIN|COMMIT|ROLLBACK)/.test(sql)),
  );
});
