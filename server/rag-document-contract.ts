import { createHash } from "node:crypto";
import {
  CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
  isExtractedCrazyTypkaSource,
  type ExtractedCrazyTypkaSource,
} from "../shared/crazy-typka";
import {
  canonicalizeCitationUrl,
  isCitationUrlAllowed,
  type CitationPolicy,
} from "../shared/rag-citation-policy";
import {
  canonicalRagJson,
  hasOnlyKeys,
  isRagDay,
  isRagEffectiveRange,
  isRagHash,
  isRagIdentifier as id,
  isRagRecord,
  isRagText,
  isSourceSpan,
  RAG_DOCUMENT_FORMATS,
  RAG_EXTRACTION_METHODS,
  RAG_PUBLISHERS,
  RAG_TOKENIZER,
  type ExtractionMethod,
  type PublisherId,
  type SourceSpan,
} from "../shared/rag-provenance";
import type {
  DocumentMetadataV3,
  ExtractionBlock,
  ExtractionChunk,
  ExtractionLink,
  KnowledgeBlockV3,
  KnowledgeChunkV3,
  KnowledgeDatasetV3,
  KnowledgeDocumentBundleV3,
  KnowledgeDocumentV3,
  ParserProfile,
  PublishableExtraction,
  ResolvedKnowledgeChunkV3,
  WorkerEnvelope,
} from "./rag-knowledge-types";

type DocumentErrorCode =
  | "invalid-worker-output"
  | "profile-mismatch"
  | "not-publishable"
  | "invalid-document-data"
  | "invalid-limits"
  | "citation-limit";
export class RagDocumentError extends Error {
  constructor(readonly code: DocumentErrorCode) {
    super(code);
  }
}
export type DocumentValidationLimits = Readonly<{
  maxDocuments: number;
  maxBlocks: number;
  maxChunks: number;
  maxLinks: number;
  maxPages: number;
  maxOutputBytes: number;
  maxBlockChars: number;
  maxChunkTokens: number;
  maxEmbeddingInputBytes: number;
}>;
export const DOCUMENT_VALIDATION_LIMITS: DocumentValidationLimits =
  Object.freeze({
    maxDocuments: 1024,
    maxBlocks: 100_000,
    maxChunks: 100_000,
    maxLinks: 10_000,
    maxPages: 2000,
    maxOutputBytes: 64 * 1024 * 1024,
    maxBlockChars: 1_000_000,
    maxChunkTokens: 650,
    maxEmbeddingInputBytes: 8191,
  });
const limitCeilings = { ...DOCUMENT_VALIDATION_LIMITS, maxChunkTokens: 8191 };
const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const hashJson = (value: unknown) => sha256(canonicalRagJson(value));
const code = (value: unknown): value is string =>
  typeof value === "string" && /^[a-z0-9-]{1,100}$/.test(value);
function demand(
  condition: unknown,
  error: DocumentErrorCode = "invalid-document-data",
): asserts condition {
  if (!condition) throw new RagDocumentError(error);
}
function guarded<T>(error: DocumentErrorCode, work: () => T): T {
  try {
    return work();
  } catch (cause) {
    if (cause instanceof RagDocumentError) throw cause;
    throw new RagDocumentError(error);
  }
}
function limits(
  value: Partial<DocumentValidationLimits> = {},
): DocumentValidationLimits {
  demand(
    isRagRecord(value) &&
      Object.keys(value).every((key) => Object.hasOwn(limitCeilings, key)),
    "invalid-limits",
  );
  const result = { ...DOCUMENT_VALIDATION_LIMITS, ...value };
  for (const key of Object.keys(result) as (keyof DocumentValidationLimits)[]) {
    demand(
      Number.isSafeInteger(result[key]) &&
        result[key] > 0 &&
        result[key] <= limitCeilings[key],
      "invalid-limits",
    );
  }
  return Object.freeze(result);
}
function frozenCopy<T>(value: T): T {
  const result = structuredClone(value);
  function freeze(item: unknown) {
    if (item && typeof item === "object" && !Object.isFrozen(item)) {
      for (const child of Object.values(item)) freeze(child);
      Object.freeze(item);
    }
  }
  freeze(result);
  return result;
}
function count(
  value: unknown,
  maximum: number,
  nullable: true,
): value is number | null;
function count(
  value: unknown,
  maximum: number,
  nullable?: false,
): value is number;
function count(
  value: unknown,
  maximum: number,
  nullable = false,
): value is number | null {
  return (
    (nullable && value === null) ||
    (typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= maximum)
  );
}
function headings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= 64 &&
    value.every((heading) => isRagText(heading, 4000))
  );
}
function codepointLength(text: string): number {
  let length = 0;
  for (const _ of text) length++;
  return length;
}
/** Count compact JSON before cloning or hashing a whole untrusted envelope. */
function boundedJson(value: unknown, maximum: number) {
  let remaining = maximum,
    nodes = 0;
  const active = new Set<object>();
  function add(bytes: number) {
    remaining -= bytes;
    demand(remaining >= 0);
  }
  function string(text: string) {
    demand(text.length + 2 <= remaining);
    add(Buffer.byteLength(JSON.stringify(text), "utf8"));
  }
  function visit(item: unknown, depth: number) {
    demand(++nodes <= 1_000_000 && depth <= 32);
    if (typeof item === "string") {
      string(item);
      return;
    }
    if (
      item === null ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item))
    ) {
      add(JSON.stringify(item).length);
      return;
    }
    demand((Array.isArray(item) || isRagRecord(item)) && !active.has(item));
    active.add(item);
    add(2);
    if (Array.isArray(item)) {
      for (let i = 0; i < item.length; i++) {
        if (i) add(1);
        visit(item[i], depth + 1);
      }
    } else {
      let first = true;
      for (const key of Object.keys(item)) {
        if (!first) add(1);
        first = false;
        string(key);
        add(1);
        visit(item[key], depth + 1);
      }
    }
    active.delete(item);
  }
  visit(value, 0);
}

function parseProfile(value: unknown): ParserProfile {
  demand(
    isRagRecord(value) &&
      hasOnlyKeys(value, [
        "id",
        "packages",
        "pipeline",
        "configurationHash",
        "modelManifestHash",
        "tokenizer",
      ]) &&
      isRagText(value.id, 200) &&
      isRagText(value.pipeline, 200) &&
      isRagHash(value.configurationHash) &&
      (value.modelManifestHash === null ||
        isRagHash(value.modelManifestHash)) &&
      isRagRecord(value.packages) &&
      Object.keys(value.packages).length <= 500,
  );
  for (const [name, version] of Object.entries(value.packages))
    demand(/^[a-z0-9._-]{1,100}$/.test(name) && isRagText(version, 100));
  const tokenizer = value.tokenizer;
  demand(
    isRagRecord(tokenizer) &&
      hasOnlyKeys(tokenizer, [
        "id",
        "package",
        "version",
        "vocabularySha256",
      ]) &&
      tokenizer.id === RAG_TOKENIZER.id &&
      tokenizer.package === RAG_TOKENIZER.package &&
      isRagText(tokenizer.version, 100) &&
      tokenizer.vocabularySha256 === RAG_TOKENIZER.vocabularySha256,
  );
  return frozenCopy(value) as ParserProfile;
}
export function parserProfileSha256(profile: unknown): string {
  return guarded("invalid-worker-output", () =>
    hashJson(["parser-profile-v1", parseProfile(profile)]),
  );
}
type SpanContext = { format: string; pageCount: number | null };
function parseBlock(
  value: unknown,
  context: SpanContext,
  budget: DocumentValidationLimits,
  extra: readonly string[] = [],
): ExtractionBlock {
  demand(
    isRagRecord(value) &&
      hasOnlyKeys(
        value,
        ["id", "kind", "text", "headingPath", "spans"],
        ["tableChunking", ...extra],
      ) &&
      id(value.id) &&
      isRagText(value.kind, 100) &&
      isRagText(value.text, budget.maxBlockChars, true) &&
      headings(value.headingPath) &&
      Array.isArray(value.spans) &&
      value.spans.length > 0 &&
      value.spans.length <= budget.maxPages &&
      value.spans.every(
        (span) => isSourceSpan(span, context) && span.blockId === value.id,
      ),
  );
  demand(
    new Set(value.spans.map((span) => canonicalRagJson(span))).size ===
      value.spans.length,
  );
  let tableChunking: ExtractionBlock["tableChunking"];
  if (Object.hasOwn(value, "tableChunking")) {
    const table = value.tableChunking;
    const lineCount = value.text.split("\n").length;
    demand(
      value.kind === "table" &&
        isRagRecord(table) &&
        hasOnlyKeys(table, ["contextLineCount", "headerLineIndexes"]) &&
        count(table.contextLineCount, lineCount) &&
        Array.isArray(table.headerLineIndexes) &&
        table.headerLineIndexes.length <= lineCount,
    );
    const contextLineCount = table.contextLineCount;
    demand(
      table.headerLineIndexes.every(
        (index, at, all) =>
          typeof index === "number" &&
          Number.isSafeInteger(index) &&
          index >= contextLineCount &&
          index < lineCount &&
          (at === 0 || index > all[at - 1]),
      ),
    );
    tableChunking = frozenCopy({
      contextLineCount: table.contextLineCount,
      headerLineIndexes: table.headerLineIndexes,
    });
  }
  return frozenCopy({
    id: value.id,
    kind: value.kind,
    text: value.text,
    headingPath: value.headingPath,
    spans: value.spans,
    ...(tableChunking ? { tableChunking } : {}),
  });
}
function parseChunk(
  value: unknown,
  context: SpanContext,
  title: string,
  budget: DocumentValidationLimits,
  extra: readonly string[] = [],
): ExtractionChunk {
  demand(
    isRagRecord(value) &&
      hasOnlyKeys(
        value,
        ["id", "text", "headingPath", "tokenCount", "blockIds", "spans"],
        extra,
      ) &&
      id(value.id) &&
      isRagText(value.text, budget.maxEmbeddingInputBytes) &&
      headings(value.headingPath) &&
      typeof value.tokenCount === "number" &&
      Number.isSafeInteger(value.tokenCount) &&
      value.tokenCount > 0 &&
      value.tokenCount <= budget.maxChunkTokens &&
      Array.isArray(value.blockIds) &&
      value.blockIds.length > 0 &&
      value.blockIds.length <= budget.maxBlocks &&
      value.blockIds.every(id) &&
      new Set(value.blockIds).size === value.blockIds.length &&
      Array.isArray(value.spans) &&
      value.spans.length > 0 &&
      value.spans.length <= budget.maxBlocks &&
      value.spans.every((span) => isSourceSpan(span, context)),
  );
  demand(
    Buffer.byteLength(
      JSON.stringify([title, value.headingPath, value.text]),
      "utf8",
    ) <= budget.maxEmbeddingInputBytes &&
      new Set(value.spans.map((span) => canonicalRagJson(span))).size ===
        value.spans.length,
  );
  return frozenCopy({
    id: value.id,
    text: value.text,
    headingPath: value.headingPath,
    tokenCount: value.tokenCount,
    blockIds: value.blockIds,
    spans: value.spans,
  });
}
function references(
  blocks: readonly ExtractionBlock[],
  chunks: readonly ExtractionChunk[],
) {
  const byId = new Map(blocks.map((block) => [block.id, block]));
  demand(
    byId.size === blocks.length &&
      new Set(chunks.map((chunk) => chunk.id)).size === chunks.length,
  );
  const spans = new Map(
    blocks.map((block) => [
      block.id,
      new Set(block.spans.map((span) => canonicalRagJson(span))),
    ]),
  );
  for (const chunk of chunks) {
    demand(
      chunk.blockIds.every((blockId) => byId.has(blockId)) &&
        chunk.spans.every(
          (span) =>
            chunk.blockIds.includes(span.blockId) &&
            spans.get(span.blockId)!.has(canonicalRagJson(span)),
        ) &&
        chunk.blockIds.every((blockId) =>
          chunk.spans.some((span) => span.blockId === blockId),
        ),
    );
  }
}

function hasTextCoverage(
  blocks: readonly ExtractionBlock[],
  chunks: readonly ExtractionChunk[],
): boolean {
  const textBlocks = new Set(
    blocks.filter((block) => block.text.trim()).map((block) => block.id),
  );
  if (!textBlocks.size) return false;
  const referenced = new Set<string>();
  for (const chunk of chunks) {
    if (!chunk.blockIds.some((blockId) => textBlocks.has(blockId)))
      return false;
    for (const blockId of chunk.blockIds) referenced.add(blockId);
  }
  return [...textBlocks].every((blockId) => referenced.has(blockId));
}

/** Current producer profile: one source block per chunk, with explicit table headers. */
function hasChunkTextLineage(
  blocks: readonly ExtractionBlock[],
  chunks: readonly ExtractionChunk[],
): boolean {
  const byBlock = new Map(
    blocks.map((block) => [block.id, [] as ExtractionChunk[]]),
  );
  for (const chunk of chunks) {
    if (chunk.blockIds.length !== 1 || !byBlock.has(chunk.blockIds[0]))
      return false;
    byBlock.get(chunk.blockIds[0])!.push(chunk);
  }
  for (const block of blocks) {
    const own = byBlock.get(block.id)!;
    if (
      own.some(
        (chunk) =>
          chunk.headingPath.length !== block.headingPath.length ||
          chunk.headingPath.some(
            (heading, index) => heading !== block.headingPath[index],
          ),
      )
    )
      return false;
    if (block.kind === "table" && !block.tableChunking) return false;
    if (!block.text.trim()) {
      if (own.length) return false;
      continue;
    }
    if (!own.length) return false;
    if (block.kind !== "table") {
      if (own.map((chunk) => chunk.text).join("") !== block.text) return false;
      continue;
    }
    const table = block.tableChunking!,
      lines = block.text.split("\n");
    const headers = new Set(table.headerLineIndexes);
    const prefix = [
      ...lines.slice(0, table.contextLineCount),
      ...table.headerLineIndexes.map((index) => lines[index]),
    ];
    const body = lines.filter(
      (_, index) => index >= table.contextLineCount && !headers.has(index),
    );
    let bodyIndex = 0;
    for (const chunk of own) {
      const output = chunk.text.split("\n");
      if (
        output.length < prefix.length ||
        prefix.some((line, index) => output[index] !== line) ||
        (own.length > 1 && output.length === prefix.length)
      )
        return false;
      for (let index = prefix.length; index < output.length; index++) {
        if (bodyIndex >= body.length || body[bodyIndex++] !== output[index])
          return false;
      }
    }
    if (bodyIndex !== body.length) return false;
  }
  return true;
}

export type ExpectedWorkerIdentity = Readonly<{
  sourceId: string;
  inputSha256: string;
  parserProfileSha256: string;
}>;
/** Structural acceptance only. Review-required HTML may expose discovery data without becoming publishable. */
export function validateWorkerEnvelope(
  value: unknown,
  expected: ExpectedWorkerIdentity,
  options: Partial<DocumentValidationLimits> = {},
): WorkerEnvelope {
  return guarded("invalid-worker-output", () => {
    const budget = limits(options);
    boundedJson(value, budget.maxOutputBytes);
    demand(
      id(expected.sourceId) &&
        isRagHash(expected.inputSha256) &&
        isRagHash(expected.parserProfileSha256),
      "invalid-worker-output",
    );
    demand(
      isRagRecord(value) &&
        hasOnlyKeys(
          value,
          [
            "schemaVersion",
            "sourceId",
            "inputSha256",
            "status",
            "format",
            "parserProfile",
            "document",
            "blocks",
            "chunks",
            "quality",
            "links",
          ],
          ["errorCode"],
        ) &&
        value.schemaVersion === 1 &&
        value.sourceId === expected.sourceId &&
        value.inputSha256 === expected.inputSha256 &&
        ["ok", "review-required", "unsupported", "failed"].includes(
          value.status as string,
        ) &&
        isRagText(value.format, 40) &&
        (!Object.hasOwn(value, "errorCode") || code(value.errorCode)),
      "invalid-worker-output",
    );
    const profile = parseProfile(value.parserProfile);
    demand(
      hashJson(["parser-profile-v1", profile]) === expected.parserProfileSha256,
      "profile-mismatch",
    );
    const doc = value.document,
      quality = value.quality;
    demand(
      isRagRecord(doc) &&
        hasOnlyKeys(doc, ["title", "pageCount", "complete"]) &&
        isRagText(doc.title, 4000) &&
        count(doc.pageCount, budget.maxPages, true) &&
        (doc.pageCount === null || doc.pageCount > 0) &&
        typeof doc.complete === "boolean" &&
        (value.format === "pdf" || doc.pageCount === null),
      "invalid-worker-output",
    );
    demand(
      Array.isArray(value.blocks) &&
        value.blocks.length <= budget.maxBlocks &&
        Array.isArray(value.chunks) &&
        value.chunks.length <= budget.maxChunks &&
        Array.isArray(value.links) &&
        value.links.length <= budget.maxLinks,
      "invalid-worker-output",
    );
    const title = doc.title;
    const context = { format: value.format, pageCount: doc.pageCount };
    const blocks = value.blocks.map((block) =>
      parseBlock(block, context, budget),
    );
    const chunks = value.chunks.map((chunk) =>
      parseChunk(chunk, context, title, budget),
    );
    references(blocks, chunks);
    demand(
      isRagRecord(quality) &&
        hasOnlyKeys(quality, [
          "processedPages",
          "expectedPages",
          "inputTextCharacters",
          "outputTextCharacters",
          "tableCount",
          "ocrPages",
          "issues",
        ]) &&
        count(quality.processedPages, budget.maxPages, true) &&
        count(quality.expectedPages, budget.maxPages, true) &&
        count(quality.inputTextCharacters, 100_000_000, true) &&
        count(quality.outputTextCharacters, budget.maxOutputBytes) &&
        count(quality.tableCount, budget.maxBlocks) &&
        Array.isArray(quality.ocrPages) &&
        quality.ocrPages.length <= budget.maxPages &&
        quality.ocrPages.every(
          (page) =>
            typeof page === "number" &&
            Number.isSafeInteger(page) &&
            page > 0 &&
            context.pageCount !== null &&
            page <= context.pageCount,
        ) &&
        new Set(quality.ocrPages).size === quality.ocrPages.length &&
        Array.isArray(quality.issues) &&
        quality.issues.length <= 1000 &&
        quality.issues.every(code) &&
        new Set(quality.issues).size === quality.issues.length,
      "invalid-worker-output",
    );
    demand(
      quality.outputTextCharacters ===
        blocks.reduce((sum, block) => sum + codepointLength(block.text), 0) &&
        (quality.expectedPages !== null || quality.processedPages === null) &&
        (quality.processedPages === null ||
          quality.expectedPages === null ||
          quality.processedPages <= quality.expectedPages),
      "invalid-worker-output",
    );
    if (value.status === "ok")
      demand(
        doc.complete &&
          !Object.hasOwn(value, "errorCode") &&
          quality.issues.length === 0,
        "invalid-worker-output",
      );
    else demand(!doc.complete, "invalid-worker-output");
    if (value.status === "failed" || value.status === "unsupported")
      demand(
        !blocks.length && !chunks.length && !value.links.length,
        "invalid-worker-output",
      );
    const links: ExtractionLink[] = value.links.map((link) => {
      demand(
        isRagRecord(link) &&
          hasOnlyKeys(
            link,
            ["href", "text", "headingPath", "relation"],
            ["mimeHint"],
          ) &&
          isRagText(link.href, 8192) &&
          isRagText(link.text, 4000, true) &&
          headings(link.headingPath) &&
          ["document", "page", "feed", "canonical", "other"].includes(
            link.relation as string,
          ) &&
          (!Object.hasOwn(link, "mimeHint") || isRagText(link.mimeHint, 200)),
        "invalid-worker-output",
      );
      const url = new URL(link.href);
      demand(
        ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password,
        "invalid-worker-output",
      );
      return frozenCopy(link) as ExtractionLink;
    });
    return Object.freeze({
      schemaVersion: 1,
      sourceId: expected.sourceId,
      inputSha256: expected.inputSha256,
      status: value.status as WorkerEnvelope["status"],
      format: context.format,
      ...(Object.hasOwn(value, "errorCode")
        ? { errorCode: value.errorCode as string }
        : {}),
      parserProfile: profile,
      document: Object.freeze({
        title,
        pageCount: context.pageCount,
        complete: doc.complete,
      }),
      blocks: Object.freeze(blocks),
      chunks: Object.freeze(chunks),
      links: Object.freeze(links),
      quality: Object.freeze({
        processedPages: quality.processedPages,
        expectedPages: quality.expectedPages,
        inputTextCharacters: quality.inputTextCharacters,
        outputTextCharacters: quality.outputTextCharacters,
        tableCount: quality.tableCount,
        ocrPages: Object.freeze([...quality.ocrPages]),
        issues: Object.freeze([...quality.issues]),
      }),
    });
  });
}
/** Links remain untrusted candidates; the caller must apply acquisition/discovery policy and robots. */
export function discoveryLinks(
  envelope: WorkerEnvelope,
): readonly ExtractionLink[] {
  return (envelope.status === "ok" || envelope.status === "review-required") &&
    ["html", "feed"].includes(envelope.format)
    ? envelope.links
    : Object.freeze([]);
}
export function requirePublishableExtraction(
  envelope: WorkerEnvelope,
): PublishableExtraction {
  demand(
    envelope.status === "ok" &&
      envelope.document.complete &&
      envelope.quality.issues.length === 0 &&
      RAG_DOCUMENT_FORMATS.includes(
        envelope.format as (typeof RAG_DOCUMENT_FORMATS)[number],
      ) &&
      envelope.blocks.length > 0 &&
      envelope.chunks.length > 0 &&
      hasTextCoverage(envelope.blocks, envelope.chunks) &&
      hasChunkTextLineage(envelope.blocks, envelope.chunks) &&
      envelope.quality.tableCount ===
        envelope.blocks.filter((block) => block.kind === "table").length &&
      (envelope.quality.expectedPages === null ||
        envelope.quality.processedPages === envelope.quality.expectedPages) &&
      (envelope.format !== "pdf" ||
        (envelope.document.pageCount !== null &&
          envelope.quality.expectedPages === envelope.document.pageCount)),
    "not-publishable",
  );
  return envelope as PublishableExtraction;
}

function normalizedHash(
  format: string,
  title: string,
  pageCount: number | null,
  blocks: readonly ExtractionBlock[],
  chunks: readonly ExtractionChunk[],
) {
  return hashJson([
    "normalized-document-v3",
    format,
    title,
    pageCount,
    blocks.map((block) => [
      block.id,
      block.kind,
      block.text,
      block.headingPath,
      block.spans,
      block.tableChunking ?? null,
    ]),
    chunks.map((chunk) => [
      chunk.id,
      chunk.text,
      chunk.headingPath,
      chunk.tokenCount,
      chunk.blockIds,
      chunk.spans,
    ]),
  ]);
}
export function normalizedDocumentSha256(
  extraction: PublishableExtraction,
): string {
  return guarded("invalid-document-data", () => {
    requirePublishableExtraction(extraction);
    return normalizedHash(
      extraction.format,
      extraction.document.title,
      extraction.document.pageCount,
      extraction.blocks,
      extraction.chunks,
    );
  });
}
const metadataFields = [
  "id",
  "title",
  "url",
  "discoveryUrl",
  "authority",
  "status",
  "archiveReason",
  "checkedAt",
  "reviewAfter",
  "effectiveFrom",
  "effectiveUntil",
  "author",
  "license",
  "licenseUrl",
  "sourceUpdatedAt",
  "documentDate",
  "authorityLevel",
  "versionNote",
] as const;
function metadata(
  value: unknown,
  policy: CitationPolicy,
  extra: readonly string[] = [],
): DocumentMetadataV3 {
  demand(
    isRagRecord(value) &&
      hasOnlyKeys(value, metadataFields, extra) &&
      id(value.id) &&
      isRagText(value.title, 200) &&
      isRagText(value.url, 1000) &&
      isRagText(value.discoveryUrl, 1000) &&
      RAG_PUBLISHERS.includes(value.authority as PublisherId) &&
      ["current", "archived"].includes(value.status as string) &&
      (value.status === "current"
        ? value.archiveReason === null
        : isRagText(value.archiveReason, 2000)) &&
      isRagDay(value.checkedAt) &&
      isRagDay(value.reviewAfter) &&
      value.reviewAfter > value.checkedAt &&
      isRagEffectiveRange(value.effectiveFrom, value.effectiveUntil) &&
      (value.author === null || isRagText(value.author, 150)) &&
      (value.license === null || isRagText(value.license, 100)) &&
      (value.licenseUrl === null ||
        value.licenseUrl ===
          "https://creativecommons.org/licenses/by-sa/4.0/") &&
      (value.sourceUpdatedAt === null ||
        isRagText(value.sourceUpdatedAt, 150)) &&
      (value.documentDate === null || isRagDay(value.documentDate)) &&
      isRagText(value.authorityLevel, 100) &&
      isRagText(value.versionNote, 1000),
  );
  demand(
    isCitationUrlAllowed(policy, value.authority as PublisherId, value.url) &&
      isCitationUrlAllowed(
        policy,
        value.authority as PublisherId,
        value.discoveryUrl,
      ) &&
      canonicalizeCitationUrl(value.url) === value.url &&
      canonicalizeCitationUrl(value.discoveryUrl) === value.discoveryUrl &&
      (value.license === "CC BY-SA 4.0") ===
        (value.licenseUrl ===
          "https://creativecommons.org/licenses/by-sa/4.0/"),
  );
  return frozenCopy(
    Object.fromEntries(metadataFields.map((key) => [key, value[key]])),
  ) as DocumentMetadataV3;
}
export function documentVersionId(
  document: Omit<KnowledgeDocumentV3, "sourceVersionId"> | KnowledgeDocumentV3,
): string {
  return guarded("invalid-document-data", () =>
    hashJson([
      "source-v3",
      Object.fromEntries(
        Object.entries(document).filter(([key]) => key !== "sourceVersionId"),
      ),
    ]),
  );
}
function parseDocument(
  value: unknown,
  policy: CitationPolicy,
  budget: DocumentValidationLimits,
): KnowledgeDocumentV3 {
  const meta = metadata(value, policy, [
    "schemaVersion",
    "sourceVersionId",
    "extraction",
  ]);
  demand(
    isRagRecord(value) &&
      value.schemaVersion === 3 &&
      isRagHash(value.sourceVersionId),
  );
  const extraction = value.extraction;
  demand(
    isRagRecord(extraction) &&
      hasOnlyKeys(extraction, [
        "inputSha256",
        "normalizedSha256",
        "parserProfileId",
        "parserProfileSha256",
        "format",
        "method",
        "complete",
        "pageCount",
      ]) &&
      isRagHash(extraction.inputSha256) &&
      isRagHash(extraction.normalizedSha256) &&
      isRagText(extraction.parserProfileId, 200) &&
      isRagHash(extraction.parserProfileSha256) &&
      RAG_DOCUMENT_FORMATS.includes(
        extraction.format as (typeof RAG_DOCUMENT_FORMATS)[number],
      ) &&
      RAG_EXTRACTION_METHODS.includes(extraction.method as ExtractionMethod) &&
      extraction.complete === true &&
      (extraction.format === "pdf"
        ? count(extraction.pageCount, budget.maxPages) &&
          (extraction.pageCount as number) > 0
        : extraction.pageCount === null),
  );
  const doc = {
    ...meta,
    schemaVersion: 3,
    sourceVersionId: value.sourceVersionId,
    extraction,
  } as KnowledgeDocumentV3;
  demand(documentVersionId(doc) === doc.sourceVersionId);
  return frozenCopy(doc);
}

/** Metadata/source-version boundary for SQL rows; block/chunk validation is separate. */
export function validateKnowledgeDocumentV3(
  value: unknown,
  policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
  options: Partial<DocumentValidationLimits> = {},
): KnowledgeDocumentV3 {
  return guarded("invalid-document-data", () => {
    const budget = limits(options);
    boundedJson(value, budget.maxOutputBytes);
    return parseDocument(value, policy, budget);
  });
}

export function buildKnowledgeDocumentV3(
  meta: DocumentMetadataV3,
  extraction: PublishableExtraction,
  method: ExtractionMethod,
  policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
  options: Partial<DocumentValidationLimits> = {},
): KnowledgeDocumentBundleV3 {
  return guarded("invalid-document-data", () => {
    const checkedMeta = metadata(meta, policy);
    const checked = requirePublishableExtraction(
      validateWorkerEnvelope(
        extraction,
        {
          sourceId: checkedMeta.id,
          inputSha256: extraction.inputSha256,
          parserProfileSha256: parserProfileSha256(extraction.parserProfile),
        },
        options,
      ),
    );
    demand(
      checkedMeta.title === checked.document.title &&
        RAG_EXTRACTION_METHODS.includes(method),
    );
    const unversioned = {
      ...checkedMeta,
      schemaVersion: 3 as const,
      extraction: {
        inputSha256: checked.inputSha256,
        normalizedSha256: normalizedDocumentSha256(checked),
        parserProfileId: checked.parserProfile.id,
        parserProfileSha256: parserProfileSha256(checked.parserProfile),
        format: checked.format,
        method,
        complete: true as const,
        pageCount: checked.document.pageCount,
      },
    };
    const document = frozenCopy({
      ...unversioned,
      sourceVersionId: documentVersionId(unversioned),
    });
    const blocks = checked.blocks.map((block) =>
      Object.freeze({
        ...block,
        sourceId: document.id,
        sourceVersionId: document.sourceVersionId,
      }),
    );
    const chunks = checked.chunks.map((chunk) =>
      Object.freeze({
        ...chunk,
        schemaVersion: 3 as const,
        sourceId: document.id,
        sourceVersionId: document.sourceVersionId,
        contentSha256: sha256(chunk.text),
      }),
    );
    const dataset = validateKnowledgeDatasetV3(
      { version: 3, documents: [document], blocks, chunks },
      policy,
      options,
    );
    return Object.freeze({
      document: dataset.documents[0],
      blocks: dataset.blocks,
      chunks: dataset.chunks,
    });
  });
}
export function validateKnowledgeDatasetV3(
  value: unknown,
  policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
  options: Partial<DocumentValidationLimits> = {},
): KnowledgeDatasetV3 {
  return guarded("invalid-document-data", () => {
    const budget = limits(options);
    boundedJson(value, budget.maxOutputBytes);
    demand(
      isRagRecord(value) &&
        hasOnlyKeys(value, ["version", "documents", "blocks", "chunks"]) &&
        value.version === 3 &&
        Array.isArray(value.documents) &&
        value.documents.length <= budget.maxDocuments &&
        Array.isArray(value.blocks) &&
        value.blocks.length <= budget.maxBlocks &&
        Array.isArray(value.chunks) &&
        value.chunks.length <= budget.maxChunks,
    );
    const documents = value.documents.map((doc) =>
      parseDocument(doc, policy, budget),
    );
    const byVersion = new Map(
      documents.map((doc) => [doc.sourceVersionId, doc]),
    );
    const current = documents
      .filter((doc) => doc.status === "current")
      .map((doc) => doc.id);
    demand(
      byVersion.size === documents.length &&
        new Set(current).size === current.length,
    );
    const blockGroups = new Map(
      documents.map((doc) => [doc.sourceVersionId, [] as KnowledgeBlockV3[]]),
    );
    const chunkGroups = new Map(
      documents.map((doc) => [doc.sourceVersionId, [] as KnowledgeChunkV3[]]),
    );
    const blocks = value.blocks.map((raw) => {
      demand(
        isRagRecord(raw) &&
          isRagHash(raw.sourceVersionId) &&
          byVersion.has(raw.sourceVersionId),
      );
      const doc = byVersion.get(raw.sourceVersionId)!;
      demand(raw.sourceId === doc.id);
      const block = Object.freeze({
        ...parseBlock(raw, doc.extraction, budget, [
          "sourceId",
          "sourceVersionId",
        ]),
        sourceId: doc.id,
        sourceVersionId: doc.sourceVersionId,
      });
      blockGroups.get(doc.sourceVersionId)!.push(block);
      return block;
    });
    const chunks = value.chunks.map((raw) => {
      demand(
        isRagRecord(raw) &&
          raw.schemaVersion === 3 &&
          isRagHash(raw.sourceVersionId) &&
          byVersion.has(raw.sourceVersionId),
      );
      const doc = byVersion.get(raw.sourceVersionId)!;
      demand(
        raw.sourceId === doc.id &&
          isRagHash(raw.contentSha256) &&
          typeof raw.text === "string" &&
          sha256(raw.text) === raw.contentSha256,
      );
      const chunk = Object.freeze({
        ...parseChunk(raw, doc.extraction, doc.title, budget, [
          "schemaVersion",
          "sourceId",
          "sourceVersionId",
          "contentSha256",
        ]),
        schemaVersion: 3 as const,
        sourceId: doc.id,
        sourceVersionId: doc.sourceVersionId,
        contentSha256: raw.contentSha256,
      });
      chunkGroups.get(doc.sourceVersionId)!.push(chunk);
      return chunk;
    });
    for (const doc of documents) {
      const ownBlocks = blockGroups.get(doc.sourceVersionId)!,
        ownChunks = chunkGroups.get(doc.sourceVersionId)!;
      demand(ownBlocks.length > 0 && ownChunks.length > 0);
      references(ownBlocks, ownChunks);
      demand(hasTextCoverage(ownBlocks, ownChunks));
      demand(hasChunkTextLineage(ownBlocks, ownChunks));
      demand(
        doc.extraction.normalizedSha256 ===
          normalizedHash(
            doc.extraction.format,
            doc.title,
            doc.extraction.pageCount,
            ownBlocks,
            ownChunks,
          ),
      );
    }
    return Object.freeze({
      version: 3,
      documents: Object.freeze(documents),
      blocks: Object.freeze(blocks),
      chunks: Object.freeze(chunks),
    });
  });
}
/** Use spans selected from the validated version's chunks; this does not select retrieval evidence. */
function citationForDocument(
  doc: KnowledgeDocumentV3,
  spans: readonly SourceSpan[],
  policy: CitationPolicy,
): ExtractedCrazyTypkaSource {
  demand(
    Array.isArray(spans) &&
      spans.length > 0 &&
      spans.length <= DOCUMENT_VALIDATION_LIMITS.maxBlocks &&
      spans.every((span) => isSourceSpan(span, doc.extraction)),
  );
  const locators = [
    ...new Map(
      spans.map((span) => [
        canonicalRagJson([span.locator, span.page ?? null]),
        {
          text: span.locator,
          ...(span.page === undefined ? {} : { page: span.page }),
        },
      ]),
    ).values(),
  ];
  demand(
    locators.length <= 8 &&
      locators.reduce(
        (sum, locator) => sum + Buffer.byteLength(locator.text, "utf8"),
        0,
      ) <= 4096,
    "citation-limit",
  );
  const citation = {
    id: doc.sourceVersionId,
    title: doc.title,
    url: doc.url,
    checkedAt: doc.checkedAt,
    author: doc.author,
    license: doc.license,
    licenseUrl: doc.licenseUrl,
    adaptation: "document-extraction" as const,
    publisher: doc.authority,
    sourceId: doc.id,
    sourceVersionId: doc.sourceVersionId,
    status: doc.status,
    effectiveFrom: doc.effectiveFrom,
    effectiveUntil: doc.effectiveUntil,
    extractionMethod: doc.extraction.method,
    documentFormat: doc.extraction.format,
    pageCount: doc.extraction.pageCount,
    locators,
  };
  demand(isExtractedCrazyTypkaSource(citation, policy));
  return frozenCopy(citation);
}
export function buildDocumentCitation(
  document: KnowledgeDocumentV3,
  spans: readonly SourceSpan[],
  policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
): ExtractedCrazyTypkaSource {
  return guarded("invalid-document-data", () =>
    citationForDocument(
      parseDocument(document, policy, DOCUMENT_VALIDATION_LIMITS),
      spans,
      policy,
    ),
  );
}
/** Projection of a validated version/chunk pair; complete dataset validation remains a prerequisite. */
export function resolveKnowledgeChunkV3(
  document: KnowledgeDocumentV3,
  chunk: KnowledgeChunkV3,
  policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
): ResolvedKnowledgeChunkV3 {
  return guarded("invalid-document-data", () => {
    const doc = parseDocument(document, policy, DOCUMENT_VALIDATION_LIMITS);
    demand(
      chunk.schemaVersion === 3 &&
        chunk.sourceId === doc.id &&
        chunk.sourceVersionId === doc.sourceVersionId &&
        isRagHash(chunk.contentSha256) &&
        sha256(chunk.text) === chunk.contentSha256,
    );
    const parsed = parseChunk(
      chunk,
      doc.extraction,
      doc.title,
      { ...DOCUMENT_VALIDATION_LIMITS, maxChunkTokens: 8191 },
      ["schemaVersion", "sourceId", "sourceVersionId", "contentSha256"],
    );
    const source = citationForDocument(doc, parsed.spans, policy);
    return frozenCopy({
      schemaVersion: 3,
      id: "v3-" + sha256(JSON.stringify([doc.sourceVersionId, parsed.id])),
      localChunkId: parsed.id,
      text: parsed.text,
      sourceLocator: source.locators.map((locator) => locator.text).join("; "),
      source,
      document: doc,
      versionNote: doc.versionNote,
      contentSha256: chunk.contentSha256,
      headingPath: parsed.headingPath,
      spans: parsed.spans,
      topic: null,
    });
  });
}
