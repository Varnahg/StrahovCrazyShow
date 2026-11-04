import { createHash } from "node:crypto";
import { CRAZY_TYPKA_DOCUMENT_CITATION_POLICY } from "../shared/crazy-typka";
import { CURATED_SOURCE_FIELDS, isCuratedKnowledgeSource, isPublicCurationText, type CuratedKnowledgeSource } from "../shared/knowledge-curation";
import type { CitationPolicy } from "../shared/rag-citation-policy";
import { canonicalRagJson, hasOnlyKeys, isRagHash, isRagIdentifier, isRagRecord, isRagText } from "../shared/rag-provenance";
import { DOCUMENT_VALIDATION_LIMITS, RagDocumentError, resolveKnowledgeChunkV3, validateKnowledgeDatasetV3, validateKnowledgeDocumentV3 } from "./rag-document-contract";
import type { CuratedKnowledgeDocumentV3, CuratedKnowledgeMetadataV3, KnowledgeBlockV3, KnowledgeChunkV3, RagDocumentBundleV3, RagDocumentDatasetV3, RagDocumentV3, ResolvedCuratedKnowledgeChunkV3, ResolvedKnowledgeChunkV3 } from "./rag-knowledge-types";

const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const hashJson = (value: unknown) => hash(canonicalRagJson(value));
function demand(condition: unknown): asserts condition { if (!condition) throw new RagDocumentError("invalid-document-data"); }
function guarded<T>(action: () => T): T { try { return action(); } catch { throw new RagDocumentError("invalid-document-data"); } }
function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  function freeze(item: unknown) { if (item && typeof item === "object" && !Object.isFrozen(item)) { Object.values(item).forEach(freeze); Object.freeze(item); } }
  freeze(copy); return copy;
}
export function isCuratedKnowledgeDocument(document: RagDocumentV3): document is CuratedKnowledgeDocumentV3 {
  return "derivation" in document && document.derivation === "knowledge-curation";
}
/** Never reinterpret the curation-review date as factual verification. */
export function knowledgeReviewDay(document: RagDocumentV3): string {
  return isCuratedKnowledgeDocument(document) ? document.reviewedAt : document.checkedAt;
}
export function knowledgeNormalizedHash(document: RagDocumentV3): string {
  return isCuratedKnowledgeDocument(document) ? document.curation.normalizedSha256 : document.extraction.normalizedSha256;
}
export function curatedDocumentVersionId(document: Omit<CuratedKnowledgeDocumentV3, "sourceVersionId"> | CuratedKnowledgeDocumentV3): string {
  return hashJson(["knowledge-curation-source-v1", Object.fromEntries(Object.entries(document).filter(([key]) => key !== "sourceVersionId"))]);
}
function citation(document: CuratedKnowledgeDocumentV3): CuratedKnowledgeSource {
  const metadata = Object.fromEntries(CURATED_SOURCE_FIELDS.filter((key) => !["adaptation", "id", "sourceId", "sourceVersionId"].includes(key)).map((key) => [key, (document as unknown as Record<string, unknown>)[key]]));
  return { ...metadata, adaptation: "knowledge-curation", id: document.sourceVersionId, sourceId: document.id, sourceVersionId: document.sourceVersionId } as CuratedKnowledgeSource;
}
const documentFields = [...CURATED_SOURCE_FIELDS.filter((key) => !["adaptation", "sourceId"].includes(key)), "archiveReason", "versionNote", "schemaVersion", "derivation", "authority", "effectiveFrom", "effectiveUntil", "curation"];
export function validateCuratedKnowledgeDocumentV3(value: unknown, policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY): CuratedKnowledgeDocumentV3 {
  return guarded(() => {
    demand(isRagRecord(value) && hasOnlyKeys(value, documentFields) && value.schemaVersion === 3 && value.derivation === "knowledge-curation"
      && isRagIdentifier(value.id) && isRagHash(value.sourceVersionId) && value.authority === null && value.effectiveFrom === null && value.effectiveUntil === null
      && isPublicCurationText(value.versionNote, 1000) && (value.status === "current" ? value.archiveReason === null : isPublicCurationText(value.archiveReason, 2000))
      && isRagRecord(value.curation) && hasOnlyKeys(value.curation, ["profileId", "normalizedSha256"])
      && isRagIdentifier(value.curation.profileId) && isRagHash(value.curation.normalizedSha256));
    const document = value as unknown as CuratedKnowledgeDocumentV3;
    demand(isCuratedKnowledgeSource(citation(document), policy) && curatedDocumentVersionId(document) === document.sourceVersionId);
    demand(Buffer.byteLength(JSON.stringify(document), "utf8") <= 60000);
    return immutable(document);
  });
}
export function validateRagDocumentV3(value: unknown, policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY): RagDocumentV3 {
  return isRagRecord(value) && value.derivation === "knowledge-curation"
    ? validateCuratedKnowledgeDocumentV3(value, policy) : validateKnowledgeDocumentV3(value, policy);
}
export type CurationUnitContent = Readonly<{ text: string; headingPath: readonly string[]; tokenCount: number }>;
function content(value: unknown, title: string): CurationUnitContent {
  demand(isRagRecord(value) && hasOnlyKeys(value, ["text", "headingPath", "tokenCount"])
    && isPublicCurationText(value.text, 8191) && Array.isArray(value.headingPath) && value.headingPath.length <= 16
    && value.headingPath.every((heading) => isPublicCurationText(heading, 200))
    && Number.isSafeInteger(value.tokenCount) && (value.tokenCount as number) > 0 && (value.tokenCount as number) <= 650
    && Buffer.byteLength(JSON.stringify([title, value.headingPath, value.text]), "utf8") <= 8191);
  return value as unknown as CurationUnitContent;
}
function normalizedHash(title: string, unit: CurationUnitContent): string {
  return hashJson(["knowledge-curation-unit-v1", title, unit.headingPath, unit.text, unit.tokenCount]);
}
function parts(document: CuratedKnowledgeDocumentV3, unit: CurationUnitContent): { blocks: KnowledgeBlockV3[]; chunks: KnowledgeChunkV3[] } {
  const spans = [{ blockId: "unit", locator: "Kurátorovaná znalostní jednotka" }];
  const identity = { sourceId: document.id, sourceVersionId: document.sourceVersionId };
  return {
    blocks: [{ ...identity, id: "unit", kind: "paragraph", text: unit.text, headingPath: unit.headingPath, spans }],
    chunks: [{ ...identity, schemaVersion: 3, id: "unit", text: unit.text, headingPath: unit.headingPath, tokenCount: unit.tokenCount, blockIds: ["unit"], spans, contentSha256: hash(unit.text) }],
  };
}
/** The caller supplies the measured token count of [title, headingPath, text]. No raw audit input is accepted. */
export function buildCuratedKnowledgeDocumentV3(metadata: CuratedKnowledgeMetadataV3, unitInput: CurationUnitContent, profileId = "knowledge-curation-v1", policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY): RagDocumentBundleV3 & { document: CuratedKnowledgeDocumentV3 } {
  return guarded(() => {
    const unit = content(unitInput, metadata.title);
    const unversioned = { ...metadata, schemaVersion: 3 as const, derivation: "knowledge-curation" as const, authority: null, effectiveFrom: null, effectiveUntil: null,
      curation: { profileId, normalizedSha256: normalizedHash(metadata.title, unit) } };
    const document = validateCuratedKnowledgeDocumentV3({ ...unversioned, sourceVersionId: curatedDocumentVersionId(unversioned) }, policy);
    const built = { document, ...parts(document, unit) };
    return immutable(built);
  });
}
function validateCuratedBundle(document: CuratedKnowledgeDocumentV3, blocks: readonly unknown[], chunks: readonly unknown[]): { blocks: KnowledgeBlockV3[]; chunks: KnowledgeChunkV3[] } {
  demand(blocks.length === 1 && chunks.length === 1 && isRagRecord(chunks[0]));
  const raw = chunks[0], unit = content({ text: raw.text, headingPath: raw.headingPath, tokenCount: raw.tokenCount }, document.title);
  demand(document.curation.normalizedSha256 === normalizedHash(document.title, unit));
  const expected = parts(document, unit);
  demand(canonicalRagJson(blocks) === canonicalRagJson(expected.blocks) && canonicalRagJson(chunks) === canonicalRagJson(expected.chunks));
  return expected;
}
/** Explicit dispatch keeps the original extraction contract and hashes untouched. */
export function validateRagDocumentDatasetV3(value: unknown, policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY): RagDocumentDatasetV3 {
  return guarded(() => {
    demand(isRagRecord(value) && hasOnlyKeys(value, ["version", "documents", "blocks", "chunks"]) && value.version === 3
      && Array.isArray(value.documents) && value.documents.length <= DOCUMENT_VALIDATION_LIMITS.maxDocuments
      && Array.isArray(value.blocks) && value.blocks.length <= DOCUMENT_VALIDATION_LIMITS.maxBlocks
      && Array.isArray(value.chunks) && value.chunks.length <= DOCUMENT_VALIDATION_LIMITS.maxChunks
      && Buffer.byteLength(JSON.stringify(value), "utf8") <= DOCUMENT_VALIDATION_LIMITS.maxOutputBytes);
    const documents = value.documents.map((document) => validateRagDocumentV3(document, policy));
    const byVersion = new Map(documents.map((document) => [document.sourceVersionId, document]));
    demand(byVersion.size === documents.length);
    const currentIds = documents.filter((doc) => doc.status === "current").map((doc) => doc.id);
    demand(new Set(currentIds).size === currentIds.length);
    const blockMap = new Map(documents.map((doc) => [doc.sourceVersionId, [] as unknown[]]));
    const chunkMap = new Map(documents.map((doc) => [doc.sourceVersionId, [] as unknown[]]));
    for (const [rows, groups] of [[value.blocks, blockMap], [value.chunks, chunkMap]] as const) for (const row of rows) {
      demand(isRagRecord(row) && typeof row.sourceVersionId === "string" && groups.has(row.sourceVersionId));
      groups.get(row.sourceVersionId)!.push(row);
    }
    const extracted = documents.filter((doc) => !isCuratedKnowledgeDocument(doc));
    validateKnowledgeDatasetV3({ version: 3, documents: extracted, blocks: extracted.flatMap((doc) => blockMap.get(doc.sourceVersionId)!), chunks: extracted.flatMap((doc) => chunkMap.get(doc.sourceVersionId)!) }, policy);
    for (const doc of documents) if (isCuratedKnowledgeDocument(doc)) validateCuratedBundle(doc, blockMap.get(doc.sourceVersionId)!, chunkMap.get(doc.sourceVersionId)!);
    return immutable({ version: 3, documents, blocks: value.blocks as KnowledgeBlockV3[], chunks: value.chunks as KnowledgeChunkV3[] });
  });
}
export function resolveRagKnowledgeChunkV3(document: RagDocumentV3, chunk: KnowledgeChunkV3, policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY): ResolvedKnowledgeChunkV3 | ResolvedCuratedKnowledgeChunkV3 {
  if (!isCuratedKnowledgeDocument(document)) return resolveKnowledgeChunkV3(document, chunk, policy);
  return guarded(() => {
    const doc = validateCuratedKnowledgeDocumentV3(document, policy), unit = content({ text: chunk.text, headingPath: chunk.headingPath, tokenCount: chunk.tokenCount }, doc.title);
    validateCuratedBundle(doc, parts(doc, unit).blocks, [chunk]);
    return immutable({ schemaVersion: 3, id: "v3-" + hash(JSON.stringify([doc.sourceVersionId, chunk.id])), localChunkId: chunk.id, text: chunk.text,
      sourceLocator: "Kurátorovaná znalostní jednotka", source: citation(doc), document: doc, versionNote: doc.versionNote, contentSha256: chunk.contentSha256,
      headingPath: chunk.headingPath, spans: chunk.spans, topic: null });
  });
}
