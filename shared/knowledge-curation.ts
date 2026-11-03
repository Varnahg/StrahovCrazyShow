import {
  canonicalizeCitationUrl,
  isCitationUrlAllowed,
  type CitationPolicy,
} from "./rag-citation-policy";
import {
  hasOnlyKeys,
  isRagDay,
  isRagHash,
  isRagIdentifier,
  isRagRecord,
  isRagText,
  RAG_PUBLISHERS,
  type PublisherId,
} from "./rag-provenance";
import curationSources from "./data/rag-curation-sources.json";

export type CurationPublisherId =
  PublisherId | "pid" | "datart" | "uk-vfn" | "klub-007" | "recharging-bar";
const supportingPublishers: readonly string[] = [
  ...RAG_PUBLISHERS,
  "pid",
  "datart",
  "uk-vfn",
  "klub-007",
  "recharging-bar",
];
const explicitSupportingSources = (() => {
  if (
    curationSources.schemaVersion !== 1 ||
    !Array.isArray(curationSources.sources)
  )
    throw new Error("invalid-curation-source-policy");
  const entries = new Map<string, CurationPublisherId>();
  for (const source of curationSources.sources) {
    if (
      !hasOnlyKeys(source, [
        "publisher",
        "publisherName",
        "url",
        "reviewedAt",
        "scope",
      ]) ||
      !supportingPublishers.includes(source.publisher) ||
      !isRagText(source.publisherName, 200) ||
      !isRagDay(source.reviewedAt) ||
      !isRagText(source.scope, 1000) ||
      canonicalizeCitationUrl(source.url) !== source.url ||
      entries.has(source.url)
    )
      throw new Error("invalid-curation-source-policy");
    entries.set(source.url, source.publisher as CurationPublisherId);
  }
  return entries;
})();

/** Exact reviewed public pages only; no crawler/extraction grant or whole-host trust. */
export function curationPublisherForUrl(
  url: string,
  policy: CitationPolicy,
): CurationPublisherId | undefined {
  try {
    if (canonicalizeCitationUrl(url) !== url) return undefined;
    const explicit = explicitSupportingSources.get(url);
    if (explicit) return explicit;
    return RAG_PUBLISHERS.find((publisher) =>
      isCitationUrlAllowed(policy, publisher, url),
    );
  } catch {
    return undefined;
  }
}

export type KnowledgeVerification =
  "verified-official" | "community-experience";
export type KnowledgeSupportingRef = Readonly<{
  publisher: CurationPublisherId;
  title: string;
  url: string;
  locator: string;
  factCheckedAt: string;
  reviewAfter: string;
}>;
export type CuratedKnowledgeSource = Readonly<{
  adaptation: "knowledge-curation";
  id: string;
  sourceId: string;
  sourceVersionId: string;
  itemId: string;
  title: string;
  status: "current" | "archived";
  verification: KnowledgeVerification;
  applicability: string;
  reviewedAt: string;
  reviewAfter: string;
  factCheckedAt: string | null;
  observedFrom: string | null;
  observedUntil: string | null;
  limitations: readonly string[];
  supportingRefs: readonly KnowledgeSupportingRef[];
}>;

/** A structural backstop; semantic anonymisation remains the curator's responsibility. */
export function isPublicCurationText(
  value: unknown,
  maximum: number,
): value is string {
  return (
    isRagText(value, maximum) &&
    !/(?:discord(?:app)?\.com\/(?:channels|api)|cdn\.discordapp\.com|<[@#][!&]?\d+>|\b\d{17,20}\b|(?:^|\s)[a-z]:[\\/]|\\\\[^\\])/i.test(
      value,
    )
  );
}
export function isKnowledgeSupportingRef(
  value: unknown,
  policy: CitationPolicy,
): value is KnowledgeSupportingRef {
  if (
    !isRagRecord(value) ||
    !hasOnlyKeys(value, [
      "publisher",
      "title",
      "url",
      "locator",
      "factCheckedAt",
      "reviewAfter",
    ]) ||
    !supportingPublishers.includes(value.publisher as string) ||
    !isPublicCurationText(value.title, 200) ||
    !isPublicCurationText(value.locator, 500) ||
    !isRagText(value.url, 1000) ||
    !isRagDay(value.factCheckedAt) ||
    !isRagDay(value.reviewAfter) ||
    value.factCheckedAt >= value.reviewAfter
  )
    return false;
  try {
    return curationPublisherForUrl(value.url, policy) === value.publisher;
  } catch {
    return false;
  }
}
export const CURATED_SOURCE_FIELDS = [
  "adaptation",
  "id",
  "sourceId",
  "sourceVersionId",
  "itemId",
  "title",
  "status",
  "verification",
  "applicability",
  "reviewedAt",
  "reviewAfter",
  "factCheckedAt",
  "observedFrom",
  "observedUntil",
  "limitations",
  "supportingRefs",
] as const;
export function isCuratedKnowledgeSource(
  value: unknown,
  policy: CitationPolicy,
): value is CuratedKnowledgeSource {
  if (
    !isRagRecord(value) ||
    !hasOnlyKeys(value, CURATED_SOURCE_FIELDS) ||
    value.adaptation !== "knowledge-curation" ||
    !isRagHash(value.sourceVersionId) ||
    value.id !== value.sourceVersionId ||
    !isRagIdentifier(value.sourceId) ||
    !isRagIdentifier(value.itemId) ||
    !isPublicCurationText(value.sourceId, 300) ||
    !isPublicCurationText(value.itemId, 300) ||
    !isPublicCurationText(value.title, 200) ||
    !isPublicCurationText(value.applicability, 1000) ||
    !["current", "archived"].includes(value.status as string) ||
    !isRagDay(value.reviewedAt) ||
    !isRagDay(value.reviewAfter) ||
    value.reviewedAt >= value.reviewAfter ||
    !(
      value.factCheckedAt === null ||
      (isRagDay(value.factCheckedAt) && value.factCheckedAt <= value.reviewedAt)
    ) ||
    !(
      value.observedFrom === null ||
      (isRagDay(value.observedFrom) && value.observedFrom <= value.reviewedAt)
    ) ||
    !(
      value.observedUntil === null ||
      (isRagDay(value.observedUntil) && value.observedUntil <= value.reviewedAt)
    ) ||
    (value.observedFrom === null) !== (value.observedUntil === null) ||
    (typeof value.observedFrom === "string" &&
      typeof value.observedUntil === "string" &&
      value.observedFrom > value.observedUntil) ||
    !Array.isArray(value.limitations) ||
    value.limitations.length > 8 ||
    !value.limitations.every((v) => isPublicCurationText(v, 500)) ||
    !Array.isArray(value.supportingRefs) ||
    value.supportingRefs.length > 8 ||
    !value.supportingRefs.every((v) => isKnowledgeSupportingRef(v, policy))
  )
    return false;
  if (value.verification === "community-experience")
    return (
      value.factCheckedAt === null &&
      value.supportingRefs.length === 0 &&
      value.observedFrom !== null &&
      value.limitations.length > 0
    );
  if (
    value.verification !== "verified-official" ||
    value.factCheckedAt === null ||
    value.supportingRefs.length === 0
  )
    return false;
  const factCheckedAt = value.factCheckedAt,
    reviewAfter = value.reviewAfter;
  return (
    value.supportingRefs.every(
      (ref) =>
        ref.factCheckedAt <= factCheckedAt && ref.reviewAfter >= reviewAfter,
    ) &&
    new Set(
      value.supportingRefs.map((ref) =>
        JSON.stringify([ref.publisher, ref.url, ref.locator]),
      ),
    ).size === value.supportingRefs.length
  );
}
/** reviewedAt confirms publication review only; factCheckedAt has a separate meaning. */
export function isCuratedKnowledgeCurrent(
  value: Pick<
    CuratedKnowledgeSource,
    "reviewedAt" | "reviewAfter" | "supportingRefs"
  >,
  now: number,
): boolean {
  const inWindow = (from: string, until: string) =>
    now >= Date.parse(from + "T00:00:00Z") &&
    now < Date.parse(until + "T00:00:00Z");
  return (
    Number.isFinite(now) &&
    inWindow(value.reviewedAt, value.reviewAfter) &&
    value.supportingRefs.every((ref) =>
      inWindow(ref.factCheckedAt, ref.reviewAfter),
    )
  );
}
