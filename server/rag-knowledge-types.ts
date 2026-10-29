import type {
  ExtractedCrazyTypkaSource,
  LegacyCrazyTypkaSource,
} from "../shared/crazy-typka";
import type {
  ExtractionMethod,
  PublisherId,
  SourceSpan,
} from "../shared/rag-provenance";

export const KNOWLEDGE_TOPICS = Object.freeze([
  "membership",
  "network",
  "office",
  "projects",
  "sport",
  "documents",
  "housing",
  "housing-payments",
  "housing-arrival",
  "housing-termination",
  "housing-maintenance",
  "dining",
  "photography",
  "printing",
  "game-room",
] as const);
export type KnowledgeTopic = (typeof KNOWLEDGE_TOPICS)[number];
export type KnowledgeAuthority = "silicon-hill" | "suz";
export type KnowledgeDocument = {
  id: string;
  title: string;
  url: string;
  discoveryUrl: string;
  authority: KnowledgeAuthority;
  status: "current";
  checkedAt: string;
  reviewAfter: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  sourceUpdatedAt: string | null;
  documentDate: string | null;
  authorityLevel: string;
  versionNote: string;
};
export type KnowledgeChunk = {
  id: string;
  text: string;
  sourceLocator: string;
  source: LegacyCrazyTypkaSource;
  document: Readonly<KnowledgeDocument>;
  versionNote: string;
  contentSha256: string;
  topic: KnowledgeTopic;
};
export type RawKnowledgeChunk = {
  id: string;
  sourceId: string;
  text: string;
  sourceLocator: string;
  topic: KnowledgeTopic;
  keywords: string[];
  contentSha256: string;
};

export type ParserProfile = Readonly<{
  id: string;
  packages: Readonly<Record<string, string>>;
  pipeline: string;
  configurationHash: string;
  modelManifestHash: string | null;
  tokenizer: Readonly<{
    id: string;
    package: string;
    version: string;
    vocabularySha256: string;
  }>;
}>;
export type ExtractionBlock = Readonly<{
  id: string;
  kind: string;
  text: string;
  headingPath: readonly string[];
  spans: readonly SourceSpan[];
  tableChunking?: Readonly<{
    contextLineCount: number;
    headerLineIndexes: readonly number[];
  }>;
}>;
export type ExtractionChunk = Readonly<{
  id: string;
  text: string;
  headingPath: readonly string[];
  tokenCount: number;
  blockIds: readonly string[];
  spans: readonly SourceSpan[];
}>;
export type ExtractionLink = Readonly<{
  href: string;
  text: string;
  headingPath: readonly string[];
  relation: "document" | "page" | "feed" | "canonical" | "other";
  mimeHint?: string;
}>;
export type WorkerEnvelope = Readonly<{
  schemaVersion: 1;
  sourceId: string;
  inputSha256: string;
  status: "ok" | "review-required" | "unsupported" | "failed";
  errorCode?: string;
  format: string;
  parserProfile: ParserProfile;
  document: Readonly<{
    title: string;
    pageCount: number | null;
    complete: boolean;
  }>;
  blocks: readonly ExtractionBlock[];
  chunks: readonly ExtractionChunk[];
  quality: Readonly<{
    processedPages: number | null;
    expectedPages: number | null;
    inputTextCharacters: number | null;
    outputTextCharacters: number;
    tableCount: number;
    ocrPages: readonly number[];
    issues: readonly string[];
  }>;
  links: readonly ExtractionLink[];
}>;
export type PublishableExtraction = WorkerEnvelope &
  Readonly<{
    status: "ok";
    document: Readonly<{
      title: string;
      pageCount: number | null;
      complete: true;
    }>;
  }>;
export type DocumentMetadataV3 = Readonly<
  Omit<KnowledgeDocument, "authority" | "status"> & {
    authority: PublisherId;
    status: "current" | "archived";
    archiveReason: string | null;
  }
>;
export type KnowledgeDocumentV3 = DocumentMetadataV3 &
  Readonly<{
    schemaVersion: 3;
    sourceVersionId: string;
    extraction: Readonly<{
      inputSha256: string;
      normalizedSha256: string;
      parserProfileId: string;
      parserProfileSha256: string;
      format: string;
      method: ExtractionMethod;
      complete: true;
      pageCount: number | null;
    }>;
  }>;
export type KnowledgeBlockV3 = ExtractionBlock &
  Readonly<{ sourceId: string; sourceVersionId: string }>;
export type KnowledgeChunkV3 = ExtractionChunk &
  Readonly<{
    schemaVersion: 3;
    sourceId: string;
    sourceVersionId: string;
    contentSha256: string;
  }>;
export type KnowledgeDatasetV3 = Readonly<{
  version: 3;
  documents: readonly KnowledgeDocumentV3[];
  blocks: readonly KnowledgeBlockV3[];
  chunks: readonly KnowledgeChunkV3[];
}>;
export type KnowledgeDocumentBundleV3 = Readonly<{
  document: KnowledgeDocumentV3;
  blocks: readonly KnowledgeBlockV3[];
  chunks: readonly KnowledgeChunkV3[];
}>;
export type ResolvedKnowledgeChunkV3 = Readonly<{
  schemaVersion: 3;
  id: string;
  localChunkId: string;
  text: string;
  sourceLocator: string;
  source: ExtractedCrazyTypkaSource;
  document: KnowledgeDocumentV3;
  versionNote: string;
  contentSha256: string;
  headingPath: readonly string[];
  spans: readonly SourceSpan[];
  topic: null;
}>;
export type EvidenceKnowledgeChunk = KnowledgeChunk | ResolvedKnowledgeChunkV3;
