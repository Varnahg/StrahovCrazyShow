import citationPolicyData from "./data/rag-citation-policy.json";
import {
  canonicalizeCitationUrl,
  isCitationUrlAllowed,
  validateCitationPolicy,
  type CitationPolicy,
} from "./rag-citation-policy";
import {
  hasOnlyKeys,
  isCitationLocator,
  isRagDay,
  isRagEffectiveRange,
  isRagHash,
  isRagIdentifier,
  isRagInstant,
  isRagRecord,
  isRagText,
  RAG_DOCUMENT_FORMATS,
  RAG_EXTRACTION_METHODS,
  RAG_PUBLISHERS,
  type CitationLocator,
  type ExtractionMethod,
  type PublisherId,
  type RagDocumentFormat,
} from "./rag-provenance";

export const CRAZY_TYPKA_LIMITS = Object.freeze({
  messageChars: 1500,
  answerChars: 4000,
  sources: 4,
  historyTurns: 6,
});

export type CrazyTypkaKnowledgeScope = Readonly<
  { kind: "current" } | { kind: "archive"; asOf?: string }
>;
export const CURRENT_KNOWLEDGE_SCOPE: CrazyTypkaKnowledgeScope = Object.freeze({
  kind: "current",
});
export function isCrazyTypkaKnowledgeScope(
  value: unknown,
): value is CrazyTypkaKnowledgeScope {
  if (!isRagRecord(value)) return false;
  if (value.kind === "current") return hasOnlyKeys(value, ["kind"]);
  return (
    value.kind === "archive" &&
    hasOnlyKeys(value, ["kind"], ["asOf"]) &&
    (value.asOf === undefined ||
      (isRagInstant(value.asOf) &&
        new Date(value.asOf).toISOString() === value.asOf))
  );
}
export function crazyTypkaScopeKey(scope: CrazyTypkaKnowledgeScope): string {
  return scope.kind === "current" ? "current" : `archive:${scope.asOf ?? ""}`;
}

export const CRAZY_TYPKA_SPEAKER = Object.freeze({
  id: "crazy-typka",
  name: "Crazy Typka",
  kind: "ai",
} as const);

/** Exact researched publishers; a subdomain suffix is not an authorization. */
export const CRAZY_TYPKA_SOURCE_HOSTS = Object.freeze({
  "silicon-hill": Object.freeze([
    "www.siliconhill.cz",
    "wiki.sh.cvut.cz",
    "zapisy.sh.cvut.cz",
    "sherna.siliconhill.cz",
  ]),
  suz: Object.freeze(["www.suz.cvut.cz"]),
});
const sourceHosts = new Set(Object.values(CRAZY_TYPKA_SOURCE_HOSTS).flat());

/** The visible starters are also retrieval acceptance cases, in both UI locales. */
export const CRAZY_TYPKA_STARTERS = {
  cs: ["Jak se přidám do Silicon Hill?", "Co se dá na Strahově podniknout?"],
  en: ["How do I join Silicon Hill?", "What can I do at Strahov?"],
} as const;

export type LegacyCrazyTypkaSource = {
  id: string;
  title: string;
  url: string;
  checkedAt: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  adaptation: "curated-paraphrase";
};
export type ExtractedCrazyTypkaSource = Omit<
  LegacyCrazyTypkaSource,
  "adaptation"
> & {
  adaptation: "document-extraction";
  publisher: PublisherId;
  sourceId: string;
  sourceVersionId: string;
  status: "current" | "archived";
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  extractionMethod: ExtractionMethod;
  documentFormat: RagDocumentFormat;
  pageCount: number | null;
  locators: readonly CitationLocator[];
};
export type CrazyTypkaSource =
  LegacyCrazyTypkaSource | ExtractedCrazyTypkaSource;
export const CRAZY_TYPKA_DOCUMENT_CITATION_POLICY =
  validateCitationPolicy(citationPolicyData);
const citationEncoder = new TextEncoder();
export type CrazyTypkaResponse = {
  speaker: typeof CRAZY_TYPKA_SPEAKER;
  text: string;
  sources: CrazyTypkaSource[];
};
/** Acknowledgement belongs to transport, not to the displayed character message. */
export type CrazyTypkaChatResponse = CrazyTypkaResponse & {
  requestSeq: number;
};
export type CrazyTypkaErrorResponse = {
  error: CrazyTypkaErrorCode;
  /** Present only when this exact operation has a terminal, replayable outcome. */
  requestSeq?: number;
  retryAfterSeconds?: number;
};
export type CrazyTypkaSession = { token: string; expiresAt: number };
export type CrazyTypkaErrorCode =
  | "unavailable"
  | "origin-rejected"
  | "not-found"
  | "method-not-allowed"
  | "invalid-request"
  | "request-too-large"
  | "request-timeout"
  | "rate-limited"
  | "busy"
  | "session-expired"
  | "blocked"
  | "provider-unavailable"
  | "invalid-response"
  | "cancelled"
  | "budget-exhausted"
  | "request-conflict"
  | "request-out-of-order"
  | "response-expired";

export function isCrazyTypkaRequestSeq(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
export function isCrazyTypkaChatResponse(
  value: unknown,
): value is CrazyTypkaChatResponse {
  return (
    isCrazyTypkaResponse(value) &&
    isCrazyTypkaRequestSeq((value as Record<string, unknown>).requestSeq)
  );
}
const errorCodes: ReadonlySet<string> = new Set<CrazyTypkaErrorCode>([
  "unavailable",
  "origin-rejected",
  "not-found",
  "method-not-allowed",
  "invalid-request",
  "request-too-large",
  "request-timeout",
  "rate-limited",
  "busy",
  "session-expired",
  "blocked",
  "provider-unavailable",
  "invalid-response",
  "cancelled",
  "budget-exhausted",
  "request-conflict",
  "request-out-of-order",
  "response-expired",
]);
export function isCrazyTypkaErrorResponse(
  value: unknown,
): value is CrazyTypkaErrorResponse {
  return (
    record(value) &&
    typeof value.error === "string" &&
    errorCodes.has(value.error) &&
    (value.requestSeq === undefined ||
      isCrazyTypkaRequestSeq(value.requestSeq)) &&
    (value.retryAfterSeconds === undefined ||
      (typeof value.retryAfterSeconds === "number" &&
        Number.isSafeInteger(value.retryAfterSeconds) &&
        value.retryAfterSeconds > 0))
  );
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function short(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}
export function isCrazyTypkaStatus(
  value: unknown,
): value is { enabled: boolean } {
  return record(value) && typeof value.enabled === "boolean";
}
export function isCrazyTypkaSession(
  value: unknown,
): value is CrazyTypkaSession {
  return (
    record(value) &&
    typeof value.token === "string" &&
    /^[a-f0-9]{64}$/.test(value.token) &&
    typeof value.expiresAt === "number" &&
    Number.isSafeInteger(value.expiresAt) &&
    value.expiresAt > 0
  );
}
function isLegacyCrazyTypkaSource(
  value: unknown,
): value is LegacyCrazyTypkaSource {
  if (
    !record(value) ||
    !short(value.id, 100) ||
    !short(value.title, 200) ||
    !short(value.url, 1000) ||
    !short(value.checkedAt, 32) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value.checkedAt) ||
    value.adaptation !== "curated-paraphrase" ||
    !(value.author === null || short(value.author, 150)) ||
    !(value.license === null || short(value.license, 100)) ||
    !(value.licenseUrl === null || short(value.licenseUrl, 300))
  )
    return false;
  const checked = Date.parse(value.checkedAt + "T00:00:00.000Z");
  if (
    !Number.isFinite(checked) ||
    new Date(checked).toISOString().slice(0, 10) !== value.checkedAt
  )
    return false;
  try {
    const url = new URL(value.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !sourceHosts.has(url.hostname)
    )
      return false;
    if (
      value.licenseUrl !== null &&
      value.licenseUrl !== "https://creativecommons.org/licenses/by-sa/4.0/"
    )
      return false;
    return true;
  } catch {
    return false;
  }
}
export function isExtractedCrazyTypkaSource(
  value: unknown,
  policy: CitationPolicy = CRAZY_TYPKA_DOCUMENT_CITATION_POLICY,
): value is ExtractedCrazyTypkaSource {
  if (
    !isRagRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "title",
      "url",
      "checkedAt",
      "author",
      "license",
      "licenseUrl",
      "adaptation",
      "publisher",
      "sourceId",
      "sourceVersionId",
      "status",
      "effectiveFrom",
      "effectiveUntil",
      "extractionMethod",
      "documentFormat",
      "pageCount",
      "locators",
    ]) ||
    value.adaptation !== "document-extraction" ||
    !isRagHash(value.sourceVersionId) ||
    value.id !== value.sourceVersionId ||
    !isRagIdentifier(value.sourceId) ||
    !isRagText(value.title, 200) ||
    !isRagText(value.url, 1000) ||
    !isRagDay(value.checkedAt) ||
    !(value.author === null || isRagText(value.author, 150)) ||
    !(value.license === null || isRagText(value.license, 100)) ||
    !(
      value.licenseUrl === null ||
      value.licenseUrl === "https://creativecommons.org/licenses/by-sa/4.0/"
    ) ||
    !RAG_PUBLISHERS.includes(value.publisher as PublisherId) ||
    !["current", "archived"].includes(value.status as string) ||
    !isRagEffectiveRange(value.effectiveFrom, value.effectiveUntil) ||
    !RAG_EXTRACTION_METHODS.includes(
      value.extractionMethod as ExtractionMethod,
    ) ||
    !RAG_DOCUMENT_FORMATS.includes(value.documentFormat as RagDocumentFormat) ||
    !Array.isArray(value.locators) ||
    !value.locators.length ||
    value.locators.length > 8 ||
    !value.locators.every(isCitationLocator) ||
    value.locators.reduce(
      (sum, locator) => sum + citationEncoder.encode(locator.text).length,
      0,
    ) > 4096 ||
    new Set(
      value.locators.map((locator) =>
        JSON.stringify([locator.text, locator.page ?? null]),
      ),
    ).size !== value.locators.length
  )
    return false;
  if (value.documentFormat === "pdf") {
    if (
      !Number.isSafeInteger(value.pageCount) ||
      (value.pageCount as number) < 1 ||
      (value.pageCount as number) > 2000 ||
      value.locators.some(
        (locator) =>
          locator.page !== undefined &&
          locator.page > (value.pageCount as number),
      )
    )
      return false;
  } else if (
    value.pageCount !== null ||
    value.locators.some((locator) => locator.page !== undefined)
  )
    return false;
  return (
    isCitationUrlAllowed(policy, value.publisher as PublisherId, value.url) &&
    canonicalizeCitationUrl(value.url) === value.url
  );
}
export function isCrazyTypkaSource(value: unknown): value is CrazyTypkaSource {
  return isRagRecord(value) && value.adaptation === "document-extraction"
    ? isExtractedCrazyTypkaSource(value)
    : isLegacyCrazyTypkaSource(value);
}
export function isCrazyTypkaResponse(
  value: unknown,
): value is CrazyTypkaResponse {
  return (
    record(value) &&
    record(value.speaker) &&
    value.speaker.id === CRAZY_TYPKA_SPEAKER.id &&
    value.speaker.name === CRAZY_TYPKA_SPEAKER.name &&
    value.speaker.kind === "ai" &&
    short(value.text, CRAZY_TYPKA_LIMITS.answerChars) &&
    value.text.trim().length > 0 &&
    Array.isArray(value.sources) &&
    value.sources.length <= CRAZY_TYPKA_LIMITS.sources &&
    value.sources.every(isCrazyTypkaSource) &&
    new Set(value.sources.map((source) => source.id)).size ===
      value.sources.length
  );
}
