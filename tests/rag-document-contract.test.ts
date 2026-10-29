import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildDocumentCitation,
  buildKnowledgeDocumentV3,
  discoveryLinks,
  documentVersionId,
  normalizedDocumentSha256,
  parserProfileSha256,
  RagDocumentError,
  requirePublishableExtraction,
  resolveKnowledgeChunkV3,
  validateKnowledgeDatasetV3,
  validateKnowledgeDocumentV3,
  validateWorkerEnvelope,
} from "../server/rag-document-contract";
import {
  createEmbeddingProfile,
  documentEmbeddingInputV3,
  embeddingInputHash,
} from "../server/rag-embeddings";
import { validateKnowledgeDatasets } from "../server/crazy-typka-retrieval";
import {
  CRAZY_TYPKA_SPEAKER,
  isCrazyTypkaResponse,
  isCrazyTypkaSource,
} from "../shared/crazy-typka";
import { canonicalRagJson, RAG_TOKENIZER } from "../shared/rag-provenance";
import type { DocumentMetadataV3 } from "../server/rag-knowledge-types";

const hash = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const metadata: DocumentMetadataV3 = {
  id: "suz-complete-document",
  title: "Ubytovací dokument",
  url: "https://www.suz.cvut.cz/cz/media/file/smlouva-o-ubytovani-pro-studenty",
  discoveryUrl:
    "https://www.suz.cvut.cz/cz/ubytovani-na-kolejich/ceniky-dokumenty",
  authority: "suz",
  status: "current",
  archiveReason: null,
  checkedAt: "2026-10-28",
  reviewAfter: "2026-11-28",
  effectiveFrom: "2026-09-01T00:00:00+02:00",
  effectiveUntil: null,
  author: null,
  license: null,
  licenseUrl: null,
  sourceUpdatedAt: null,
  documentDate: null,
  authorityLevel: "official-document",
  versionNote: "Úplná extrakce syntetické testovací předlohy",
};
function fixture(text = "Částka 125 Kč se nevrací. A😀", format = "pdf") {
  const span = {
    blockId: "b-stable",
    locator: format === "pdf" ? "PDF strana 1" : "DOCX tabulka 1, řádek 1",
    ...(format === "pdf"
      ? {
          page: 1,
          bbox: {
            left: 10,
            top: 100,
            right: 250,
            bottom: 80,
            origin: "bottom-left",
            unit: "pt",
          },
        }
      : {}),
  };
  return {
    schemaVersion: 1,
    sourceId: metadata.id,
    inputSha256: "a".repeat(64),
    status: "ok",
    format,
    parserProfile: {
      id: "docling-2.144.0-strahov-v1",
      packages: { "docling-slim": "2.144.0", tiktoken: "0.12.0" },
      pipeline:
        format === "pdf" ? "docling-native-pdf" : "docling-simple-" + format,
      configurationHash: "b".repeat(64),
      modelManifestHash: null,
      tokenizer: { ...RAG_TOKENIZER, version: "0.12.0" },
    },
    document: {
      title: metadata.title,
      pageCount: format === "pdf" ? 1 : null,
      complete: true,
    },
    blocks: [
      {
        id: "b-stable",
        kind: "text",
        text,
        headingPath: ["Platby"],
        spans: [span],
      },
    ],
    // This is a synthetic structural fixture, not a claim of independent tokenizer measurement.
    chunks: [
      {
        id: "c-stable",
        text,
        headingPath: ["Platby"],
        tokenCount: 15,
        blockIds: ["b-stable"],
        spans: [structuredClone(span)],
      },
    ],
    quality: {
      processedPages: format === "pdf" ? 1 : null,
      expectedPages: format === "pdf" ? 1 : null,
      inputTextCharacters: null,
      outputTextCharacters: [...text].length,
      tableCount: 0,
      ocrPages: [],
      issues: [] as string[],
    },
    links: [] as unknown[],
  };
}
const expected = (raw: ReturnType<typeof fixture>) => ({
  sourceId: raw.sourceId,
  inputSha256: raw.inputSha256,
  parserProfileSha256: parserProfileSha256(raw.parserProfile),
});
function ready(raw = fixture()) {
  return requirePublishableExtraction(
    validateWorkerEnvelope(raw, expected(raw)),
  );
}
function bundle(raw = fixture(), meta = metadata) {
  return buildKnowledgeDocumentV3(meta, ready(raw), "native");
}
function dataset(...bundles: ReturnType<typeof bundle>[]) {
  return {
    version: 3,
    documents: bundles.map((item) => item.document),
    blocks: bundles.flatMap((item) => [...item.blocks]),
    chunks: bundles.flatMap((item) => [...item.chunks]),
  };
}
function rekeySingleDocument(copy: any) {
  const doc = copy.documents[0];
  doc.extraction.normalizedSha256 = hash(
    canonicalRagJson([
      "normalized-document-v3",
      doc.extraction.format,
      doc.title,
      doc.extraction.pageCount,
      copy.blocks.map((b: any) => [
        b.id,
        b.kind,
        b.text,
        b.headingPath,
        b.spans,
        b.tableChunking ?? null,
      ]),
      copy.chunks.map((c: any) => [
        c.id,
        c.text,
        c.headingPath,
        c.tokenCount,
        c.blockIds,
        c.spans,
      ]),
    ]),
  );
  doc.sourceVersionId = documentVersionId(doc);
  for (const item of [...copy.blocks, ...copy.chunks])
    item.sourceVersionId = doc.sourceVersionId;
  return copy;
}
function invalid(work: () => unknown, expectedCode?: string) {
  assert.throws(
    work,
    (error) =>
      error instanceof RagDocumentError &&
      (!expectedCode || error.code === expectedCode),
  );
}

test("worker identity binds full parser descriptor and returns an isolated frozen value", () => {
  const raw = fixture(),
    identity = expected(raw),
    checked = validateWorkerEnvelope(raw, identity);
  assert.ok(
    Object.isFrozen(checked) &&
      Object.isFrozen(checked.parserProfile.packages) &&
      Object.isFrozen(checked.chunks[0].spans),
  );
  raw.blocks[0].text = "Changed after validation";
  assert.equal(checked.blocks[0].text, "Částka 125 Kč se nevrací. A😀");
  for (const mutate of [
    (p: any) => (p.packages.tiktoken = "0.12.1"),
    (p: any) => (p.pipeline = "different-pipeline"),
    (p: any) => (p.configurationHash = "c".repeat(64)),
    (p: any) => (p.modelManifestHash = "d".repeat(64)),
    (p: any) => (p.tokenizer.version = "0.12.1"),
  ]) {
    const altered = fixture();
    mutate(altered.parserProfile);
    assert.equal(altered.parserProfile.id, checked.parserProfile.id);
    assert.notEqual(
      parserProfileSha256(altered.parserProfile),
      identity.parserProfileSha256,
    );
    invalid(
      () => validateWorkerEnvelope(altered, identity),
      "profile-mismatch",
    );
  }
  invalid(() =>
    validateWorkerEnvelope(fixture(), {
      ...identity,
      inputSha256: "f".repeat(64),
    }),
  );
});
test("Python character accounting uses Unicode scalar count, not JavaScript UTF16 length", () => {
  const raw = fixture("A😀");
  raw.quality.outputTextCharacters = 2;
  assert.equal(
    validateWorkerEnvelope(raw, expected(raw)).quality.outputTextCharacters,
    2,
  );
  raw.quality.outputTextCharacters = 3;
  invalid(() => validateWorkerEnvelope(raw, expected(raw)));
});
test("review-required HTML can expose verified discovery without becoming publishable", () => {
  const raw = fixture("Dokumenty", "html");
  raw.status = "review-required";
  raw.document.complete = false;
  raw.quality.issues = ["unrepresented-image"];
  raw.chunks = [];
  raw.links = [
    {
      href: "https://www.suz.cvut.cz/cz/media/file/document-without-extension",
      text: "Dokument",
      headingPath: [],
      relation: "page",
    },
  ];
  const checked = validateWorkerEnvelope(raw, expected(raw));
  assert.equal(discoveryLinks(checked).length, 1);
  invalid(() => requirePublishableExtraction(checked), "not-publishable");
  invalid(
    () =>
      validateWorkerEnvelope(raw, {
        ...expected(raw),
        parserProfileSha256: "0".repeat(64),
      }),
    "profile-mismatch",
  );
});
test("empty successful feed is discovery-only; failed envelopes cannot expose partial content", () => {
  const raw = fixture();
  raw.format = "feed";
  raw.document.pageCount = null;
  raw.blocks = [];
  raw.chunks = [];
  raw.quality.processedPages = null;
  raw.quality.expectedPages = null;
  raw.quality.outputTextCharacters = 0;
  const checked = validateWorkerEnvelope(raw, expected(raw));
  assert.deepEqual(discoveryLinks(checked), []);
  invalid(() => requirePublishableExtraction(checked), "not-publishable");
  const failed = fixture();
  failed.status = "failed";
  failed.document.complete = false;
  invalid(() => validateWorkerEnvelope(failed, expected(failed)));
});
test("v3 carries complete text longer than legacy's 800 characters without paraphrasing", () => {
  const text = "Povinnost neplatí pro uvedenou výjimku. ".repeat(30);
  assert.ok(text.length > 800);
  const built = bundle(fixture(text));
  assert.equal(built.chunks[0].text, text);
  assert.equal(built.chunks[0].contentSha256, hash(text));
  assert.equal(
    built.document.extraction.normalizedSha256,
    normalizedDocumentSha256(ready(fixture(text))),
  );
  assert.equal(validateKnowledgeDatasetV3(dataset(built)).chunks[0].text, text);
});
test("legacy v2 still rejects new authorities, archives and oversized chunks", () => {
  const raw = JSON.parse(
    readFileSync(
      new URL("../server/data/rag/suz.json", import.meta.url),
      "utf8",
    ),
  );
  assert.ok(validateKnowledgeDatasets([raw]).chunks.length > 0);
  for (const change of [
    (copy: any) => (copy.sources[0].authority = "su"),
    (copy: any) => (copy.sources[0].status = "archived"),
    (copy: any) => {
      copy.chunks[0].text = "x".repeat(801);
      copy.chunks[0].contentSha256 = hash(copy.chunks[0].text);
    },
  ]) {
    const copy = structuredClone(raw);
    change(copy);
    assert.throws(() => validateKnowledgeDatasets([copy]));
  }
});
test("review and page/bbox-only changes create versions but preserve exact embedding input", () => {
  const first = bundle(),
    movedRaw = fixture();
  movedRaw.inputSha256 = "c".repeat(64);
  movedRaw.document.pageCount = 2;
  movedRaw.quality.expectedPages = 2;
  movedRaw.quality.processedPages = 2;
  for (const span of [
    movedRaw.blocks[0].spans[0],
    movedRaw.chunks[0].spans[0],
  ]) {
    span.page = 2;
    span.locator = "PDF strana 2";
    span.bbox!.top = 200;
    span.bbox!.bottom = 180;
  }
  const moved = bundle(movedRaw, {
    ...metadata,
    checkedAt: "2026-10-29",
    reviewAfter: "2026-11-29",
  });
  const profile = createEmbeddingProfile({
    inputVersion: "title-heading-text-v2",
  });
  assert.notEqual(
    first.document.sourceVersionId,
    moved.document.sourceVersionId,
  );
  assert.notEqual(
    first.document.extraction.normalizedSha256,
    moved.document.extraction.normalizedSha256,
  );
  const a = documentEmbeddingInputV3(first.document, first.chunks[0], profile),
    b = documentEmbeddingInputV3(moved.document, moved.chunks[0], profile);
  assert.equal(a, b);
  assert.equal(embeddingInputHash(a), embeddingInputHash(b));
  const changedRaw = fixture();
  changedRaw.chunks[0].headingPath = ["Jiný nadpis"];
  changedRaw.blocks[0].headingPath = ["Jiný nadpis"];
  const changed = bundle(changedRaw);
  assert.notEqual(
    documentEmbeddingInputV3(changed.document, changed.chunks[0], profile),
    a,
  );
});
test("two archived versions share stable local IDs but have separate citation and evidence identities", () => {
  const older = bundle(fixture(), {
    ...metadata,
    status: "archived",
    archiveReason: "Nahrazená verze",
    effectiveUntil: "2026-10-01T00:00:00+02:00",
  });
  const secondRaw = fixture();
  secondRaw.inputSha256 = "d".repeat(64);
  const newer = bundle(secondRaw, {
    ...metadata,
    status: "archived",
    archiveReason: "Novější archivní kopie",
    effectiveFrom: "2026-10-01T00:00:00+02:00",
    effectiveUntil: "2026-10-20T00:00:00+02:00",
  });
  const checked = validateKnowledgeDatasetV3(dataset(older, newer));
  assert.equal(checked.chunks[0].id, checked.chunks[1].id);
  const a = resolveKnowledgeChunkV3(older.document, older.chunks[0]),
    b = resolveKnowledgeChunkV3(newer.document, newer.chunks[0]);
  assert.notEqual(a.id, b.id);
  assert.equal(
    a.id,
    "v3-" +
      hash(
        JSON.stringify([older.document.sourceVersionId, older.chunks[0].id]),
      ),
  );
  assert.equal(a.localChunkId, b.localChunkId);
  assert.equal(a.topic, null);
  assert.notEqual(a.source.id, b.source.id);
  assert.ok(
    isCrazyTypkaResponse({
      speaker: CRAZY_TYPKA_SPEAKER,
      text: "Dvě archivní verze.",
      sources: [a.source, b.source],
    }),
  );
  invalid(() => resolveKnowledgeChunkV3(older.document, newer.chunks[0]));
  const duplicateCurrent = bundle(secondRaw);
  invalid(() =>
    validateKnowledgeDatasetV3(dataset(bundle(), duplicateCurrent)),
  );
});
test("dataset rejects foreign version/block/span references and tampered text hashes", () => {
  const original = dataset(bundle());
  for (const mutate of [
    (copy: any) => (copy.chunks[0].sourceVersionId = "f".repeat(64)),
    (copy: any) => (copy.chunks[0].sourceId = "other-source"),
    (copy: any) => (copy.chunks[0].blockIds = ["b-foreign"]),
    (copy: any) => (copy.chunks[0].spans[0].locator = "Unrelated citation"),
    (copy: any) => (copy.chunks[0].text = "Jiné znění."),
    (copy: any) => copy.blocks.push(copy.blocks[0]),
    (copy: any) => copy.chunks.push(copy.chunks[0]),
    (copy: any) => (copy.documents[0].title = "Tampered title"),
  ]) {
    const copy = structuredClone(original);
    mutate(copy);
    invalid(() => validateKnowledgeDatasetV3(copy));
  }
});
test("normalization identity is independently recomputed after metadata version hashing", () => {
  const copy = JSON.parse(JSON.stringify(dataset(bundle())));
  copy.documents[0].extraction.normalizedSha256 = "f".repeat(64);
  const changedId = documentVersionId(copy.documents[0]);
  copy.documents[0].sourceVersionId = changedId;
  for (const item of [...copy.blocks, ...copy.chunks])
    item.sourceVersionId = changedId;
  invalid(() => validateKnowledgeDatasetV3(copy));
});

test("SQL metadata boundary validates a frozen document version without pretending to validate its body", () => {
  const built = bundle();
  const checked = validateKnowledgeDocumentV3(
    JSON.parse(JSON.stringify(built.document)),
  );
  assert.deepEqual(checked, built.document);
  assert.ok(Object.isFrozen(checked) && Object.isFrozen(checked.extraction));
  invalid(() =>
    validateKnowledgeDocumentV3({
      ...built.document,
      title: "Změněný název bez nové verze",
    }),
  );
  const unsafe = { ...built.document, url: "https://www.suz.cvut.cz/Login" };
  unsafe.sourceVersionId = documentVersionId(unsafe);
  invalid(() => validateKnowledgeDocumentV3(unsafe));
  invalid(() =>
    validateKnowledgeDocumentV3(built.document, undefined, {
      maxOutputBytes: 1,
    }),
  );
});
test("public v3 citations retain truthful format/pages and reject fake DOCX pagination", () => {
  const pdf = bundle(),
    citation = buildDocumentCitation(pdf.document, pdf.chunks[0].spans);
  assert.equal(citation.adaptation, "document-extraction");
  assert.equal(citation.documentFormat, "pdf");
  assert.equal(citation.pageCount, 1);
  assert.equal(citation.id, pdf.document.sourceVersionId);
  assert.ok(isCrazyTypkaSource(citation));
  for (const wrong of [
    { ...citation, pageCount: 0 },
    { ...citation, locators: [{ text: "PDF strana 2", page: 2 }] },
    { ...citation, documentFormat: "docx", pageCount: null },
    { ...citation, publisher: "su" },
    { ...citation, id: "different" },
    { ...citation, url: "https://www.suz.cvut.cz/Login" },
    { ...citation, url: citation.url + "#page=999" },
  ])
    assert.equal(isCrazyTypkaSource(wrong), false);
  const docx = bundle(fixture("Buňka tabulky", "docx"));
  const docxCitation = buildDocumentCitation(
    docx.document,
    docx.chunks[0].spans,
  );
  assert.equal(docxCitation.pageCount, null);
  assert.equal(docxCitation.locators[0].page, undefined);
  assert.ok(isCrazyTypkaSource(docxCitation));
});
test("bounded citations fail explicitly instead of silently discarding selected locators", () => {
  const built = bundle();
  const spans = Array.from({ length: 9 }, (_, i) => ({
    blockId: "b-stable",
    locator: `PDF strana 1, část ${i}`,
    page: 1,
  }));
  invalid(() => buildDocumentCitation(built.document, spans), "citation-limit");
});

test("publication rejects chunks whose complete citation cannot be projected", () => {
  const raw = fixture();
  const spans = Array.from({ length: 9 }, (_, i) => ({
    ...raw.blocks[0].spans[0], locator: `PDF strana 1, část ${i}`,
  }));
  raw.blocks[0].spans = spans;
  raw.chunks[0].spans = spans;
  invalid(() => bundle(raw), "citation-limit");

  const direct = JSON.parse(JSON.stringify(dataset(bundle())));
  direct.blocks[0].spans = spans;
  direct.chunks[0].spans = spans;
  rekeySingleDocument(direct);
  invalid(() => validateKnowledgeDatasetV3(direct), "citation-limit");
});

test("a valid v3 logical identifier remains valid in its public citation", () => {
  const raw = fixture();
  raw.sourceId = "suz.document_v3";
  const built = bundle(raw, { ...metadata, id: raw.sourceId });
  const citation = buildDocumentCitation(built.document, built.chunks[0].spans);
  assert.equal(citation.sourceId, raw.sourceId);
  assert.equal(isCrazyTypkaSource(citation), true);
});
test("publication gates and limits do not accept incomplete pages, declared huge tokens or unsupported formats", () => {
  for (const mutate of [
    (raw: any) => {
      raw.document.complete = false;
    },
    (raw: any) => {
      raw.quality.issues.push("missing-part");
    },
    (raw: any) => {
      raw.chunks[0].tokenCount = 651;
    },
    (raw: any) => {
      raw.blocks[0].text += "\0";
    },
    (raw: any) => {
      raw.chunks[0].spans[0].page = 2;
    },
  ]) {
    const raw = fixture();
    mutate(raw);
    invalid(() => validateWorkerEnvelope(raw, expected(raw)));
  }
  const partial = fixture();
  partial.quality.processedPages = 0;
  invalid(
    () =>
      requirePublishableExtraction(
        validateWorkerEnvelope(partial, expected(partial)),
      ),
    "not-publishable",
  );
  invalid(() =>
    validateWorkerEnvelope(fixture(), expected(fixture()), {
      maxOutputBytes: 1,
    }),
  );
  invalid(
    () =>
      validateWorkerEnvelope(fixture(), expected(fixture()), {
        maxEmbeddingInputBytes: 8192,
      }),
    "invalid-limits",
  );
  const raw = fixture("😀".repeat(2100));
  raw.quality.outputTextCharacters = 2100;
  invalid(() => validateWorkerEnvelope(raw, expected(raw)));
});
test("configured structural token ceilings survive the runtime projection", () => {
  const raw = fixture();
  raw.chunks[0].tokenCount = 700;
  const checked = requirePublishableExtraction(
    validateWorkerEnvelope(raw, expected(raw), { maxChunkTokens: 800 }),
  );
  const built = buildKnowledgeDocumentV3(
    metadata,
    checked,
    "native",
    undefined,
    { maxChunkTokens: 800 },
  );
  assert.equal(
    resolveKnowledgeChunkV3(built.document, built.chunks[0]).text,
    raw.chunks[0].text,
  );
});
test("empty explicit snapshots remain structural data, while dangling chunks are rejected", () => {
  assert.deepEqual(
    validateKnowledgeDatasetV3({
      version: 3,
      documents: [],
      blocks: [],
      chunks: [],
    }),
    { version: 3, documents: [], blocks: [], chunks: [] },
  );
  const built = bundle();
  invalid(() =>
    validateKnowledgeDatasetV3({
      version: 3,
      documents: [],
      blocks: built.blocks,
      chunks: built.chunks,
    }),
  );
});

test("publication rejects an unindexed nonempty block while retaining its structural envelope", () => {
  const raw = fixture(),
    second = structuredClone(raw.blocks[0]);
  second.id = "b-second";
  second.text = "Druhý odstavec se nesmí ztratit před embeddingem.";
  second.spans[0].blockId = second.id;
  raw.blocks.push(second);
  raw.quality.outputTextCharacters += [...second.text].length;
  const checked = validateWorkerEnvelope(raw, expected(raw));
  assert.equal(checked.blocks.length, 2);
  invalid(() => requirePublishableExtraction(checked), "not-publishable");
});

test("direct v3 import rejects an unindexed block even with internally consistent hashes", () => {
  const copy = JSON.parse(JSON.stringify(dataset(bundle())));
  const second = structuredClone(copy.blocks[0]);
  second.id = "b-second";
  second.text = "Druhý odstavec se nesmí ztratit před embeddingem.";
  second.spans[0].blockId = second.id;
  copy.blocks.push(second);
  // External producer follows the documented hash preimage; checksums alone
  // cannot establish that every extracted block reaches the embedding index.
  invalid(() => validateKnowledgeDatasetV3(rekeySingleDocument(copy)));
});

function tableFixture() {
  const text =
    "Popisek tabulky\nPrvní hodnota\nHlavička A\nStejná hodnota\nHlavička B\nStejná hodnota";
  const raw = fixture(text, "docx");
  const block = {
    ...raw.blocks[0],
    kind: "table",
    tableChunking: { contextLineCount: 1, headerLineIndexes: [2, 4] },
  };
  const prefix = "Popisek tabulky\nHlavička A\nHlavička B";
  const chunks = [
    {
      ...raw.chunks[0],
      id: "c-first",
      text: prefix + "\nPrvní hodnota\nStejná hodnota",
    },
    { ...raw.chunks[0], id: "c-second", text: prefix + "\nStejná hodnota" },
  ];
  return {
    ...raw,
    blocks: [block],
    chunks,
    quality: { ...raw.quality, tableCount: 1 },
  };
}

test("text chunks must reconstruct their whole block in producer order", () => {
  const raw = fixture("Poplatek se nevrací. Výjimka platí jen písemně.");
  raw.chunks = [
    { ...raw.chunks[0], id: "c-first", text: "Poplatek se nevrací. " },
    { ...raw.chunks[0], id: "c-second", text: "Výjimka platí jen písemně." },
  ];
  assert.equal(ready(raw).chunks.length, 2);
  for (const mutate of [
    (copy: any) => (copy.chunks[0].text = "Poplatek se vrací. "),
    (copy: any) => copy.chunks.reverse(),
    (copy: any) => copy.chunks.pop(),
    (copy: any) => copy.chunks.push({ ...copy.chunks[0], id: "c-duplicate" }),
  ]) {
    const copy = structuredClone(raw);
    mutate(copy);
    invalid(() => ready(copy), "not-publishable");
  }
});

test("a published chunk cannot invent a heading path absent from its referenced block", () => {
  const raw = fixture();
  raw.chunks[0].headingPath = ["Jiná neexistující sekce"];
  const checked = validateWorkerEnvelope(raw, expected(raw));
  assert.deepEqual(checked.blocks[0].headingPath, ["Platby"]);
  invalid(() => requirePublishableExtraction(checked), "not-publishable");
});

test("direct import also rejects invented chunk text or heading context with matching checksums", () => {
  for (const mutate of [
    (copy: any) => {
      copy.chunks[0].text = "Částka 125 Kč se vrací.";
      copy.chunks[0].contentSha256 = hash(copy.chunks[0].text);
    },
    (copy: any) => {
      copy.chunks[0].headingPath = ["Vymyšlená sekce"];
    },
  ]) {
    const copy = JSON.parse(JSON.stringify(dataset(bundle())));
    mutate(copy);
    invalid(() => validateKnowledgeDatasetV3(rekeySingleDocument(copy)));
  }
});

test("explicit table lineage supports non-leading disjoint headers and preserves duplicate body rows", () => {
  const raw = tableFixture();
  const checked = ready(raw);
  const built = buildKnowledgeDocumentV3(metadata, checked, "native");
  assert.deepEqual(built.blocks[0].tableChunking, {
    contextLineCount: 1,
    headerLineIndexes: [2, 4],
  });
  assert.equal(validateKnowledgeDatasetV3(dataset(built)).chunks.length, 2);
  for (const mutate of [
    (copy: any) =>
      (copy.chunks[1].text = "Popisek tabulky\nHlavička A\nHlavička B"),
    (copy: any) => (copy.chunks[1].text += "\nStejná hodnota"),
    (copy: any) =>
      (copy.chunks[0].text = copy.chunks[0].text.replace(
        "První hodnota",
        "Vymyšlená hodnota",
      )),
    (copy: any) => copy.chunks.reverse(),
    (copy: any) =>
      (copy.chunks[0].text = copy.chunks[0].text.replace(
        "Hlavička A",
        "Jiná hlavička",
      )),
  ]) {
    const copy = structuredClone(raw);
    mutate(copy);
    invalid(() => ready(copy), "not-publishable");
  }
});

test("header-free delimited tables retain every row and its order", () => {
  const raw = tableFixture();
  raw.format = "csv";
  raw.parserProfile.pipeline = "strict-csv";
  raw.blocks[0].text = '"první"\t"10"\n"druhý"\t"20"';
  raw.blocks[0].tableChunking = { contextLineCount: 0, headerLineIndexes: [] };
  raw.chunks[0].text = '"první"\t"10"';
  raw.chunks[1].text = '"druhý"\t"20"';
  raw.quality.outputTextCharacters = [...raw.blocks[0].text].length;
  assert.equal(ready(raw).chunks.length, 2);
  raw.chunks.reverse();
  invalid(() => ready(raw), "not-publishable");
});

test("table lineage coordinates are strict and absence remains review-only", () => {
  for (const table of [
    { contextLineCount: -1, headerLineIndexes: [2] },
    { contextLineCount: 7, headerLineIndexes: [] },
    { contextLineCount: 1, headerLineIndexes: [0] },
    { contextLineCount: 1, headerLineIndexes: [2, 2] },
    { contextLineCount: 1, headerLineIndexes: [4, 2] },
    { contextLineCount: 1, headerLineIndexes: [9] },
    { contextLineCount: 1, headerLineIndexes: [2.5] },
  ]) {
    const raw = tableFixture();
    raw.blocks[0].tableChunking = table;
    invalid(() => validateWorkerEnvelope(raw, expected(raw)));
  }
  const raw = tableFixture();
  delete (raw.blocks[0] as { tableChunking?: unknown }).tableChunking;
  const checked = validateWorkerEnvelope(raw, expected(raw));
  invalid(() => requirePublishableExtraction(checked), "not-publishable");
});

test("multi-block chunks are structurally readable but not published by the current producer profile", () => {
  const raw = fixture("První odstavec", "html"),
    second = structuredClone(raw.blocks[0]);
  second.id = "b-second";
  second.text = "Druhý odstavec";
  second.spans[0].blockId = second.id;
  raw.blocks.push(second);
  raw.quality.outputTextCharacters += [...second.text].length;
  raw.chunks = [
    {
      ...raw.chunks[0],
      text: raw.blocks[0].text + "\n\n" + second.text,
      blockIds: [raw.blocks[0].id, second.id],
      spans: [raw.blocks[0].spans[0], second.spans[0]],
    },
  ];
  const checked = validateWorkerEnvelope(raw, expected(raw));
  assert.equal(checked.chunks[0].blockIds.length, 2);
  invalid(() => requirePublishableExtraction(checked), "not-publishable");
});
