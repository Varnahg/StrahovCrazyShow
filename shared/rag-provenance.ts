/** JSON provenance shared by the browser and administrative document boundary. */
export type PublisherId = "silicon-hill" | "suz" | "su" | "cvut";
export type ExtractionMethod = "native" | "layout" | "ocr" | "mixed" | "openai";
export const RAG_DOCUMENT_FORMATS = Object.freeze([
  "pdf",
  "docx",
  "html",
  "xlsx",
  "ods",
  "pptx",
  "odp",
  "odt",
  "md",
  "txt",
  "csv",
  "tsv",
] as const);
export type RagDocumentFormat = (typeof RAG_DOCUMENT_FORMATS)[number];
export type SourceSpan = Readonly<{
  blockId: string;
  locator: string;
  page?: number;
  bbox?: Readonly<{
    left: number;
    top: number;
    right: number;
    bottom: number;
    origin: "top-left" | "bottom-left";
    unit: "pt" | "px";
  }>;
}>;
export type CitationLocator = Readonly<{ text: string; page?: number }>;

export const RAG_PUBLISHERS: readonly PublisherId[] = Object.freeze([
  "silicon-hill",
  "suz",
  "su",
  "cvut",
]);
export const RAG_EXTRACTION_METHODS: readonly ExtractionMethod[] =
  Object.freeze(["native", "layout", "ocr", "mixed", "openai"]);
export const RAG_TOKENIZER = Object.freeze({
  id: "cl100k_base",
  package: "tiktoken",
  vocabularySha256:
    "223921b76ee99bde995b7ff738513eef100fb51d18c93597a113bcffe865b2a7",
});

export function isRagRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
export function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every(
      (key) => required.includes(key) || optional.includes(key),
    )
  );
}
export function isRagText(
  value: unknown,
  max: number,
  allowEmpty = false,
): value is string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (!allowEmpty && !value.trim()) ||
    value.includes("\0")
  )
    return false;
  // Do not normalize text: exact Unicode bytes are part of the embedding identity.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
export function isRagHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
export function isRagIdentifier(value: unknown): value is string {
  return isRagText(value, 300) && /^[a-z0-9][a-z0-9._-]*$/.test(value);
}
export function isRagDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = Date.parse(value + "T00:00:00.000Z");
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString().slice(0, 10) === value
  );
}
export function isRagInstant(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  return (
    !!match &&
    isRagDay(match[1]) &&
    +match[2] < 24 &&
    +match[3] < 60 &&
    +match[4] < 60 &&
    (match[5] === "Z" || (+match[6] < 24 && +match[7] < 60)) &&
    Number.isFinite(Date.parse(value))
  );
}
export function isRagEffectiveRange(from: unknown, until: unknown): boolean {
  return (
    (from === null || isRagInstant(from)) &&
    (until === null || isRagInstant(until)) &&
    (from === null || until === null || Date.parse(from) < Date.parse(until))
  );
}
export function isSourceSpan(
  value: unknown,
  context: {
    format: string;
    pageCount: number | null;
    maxLocatorChars?: number;
  },
): value is SourceSpan {
  if (
    !isRagRecord(value) ||
    !hasOnlyKeys(value, ["blockId", "locator"], ["page", "bbox"]) ||
    !isRagIdentifier(value.blockId) ||
    !isRagText(value.locator, context.maxLocatorChars ?? 1000)
  )
    return false;
  if (
    Object.hasOwn(value, "page") &&
    (context.format !== "pdf" ||
      !Number.isSafeInteger(value.page) ||
      (value.page as number) < 1 ||
      context.pageCount === null ||
      (value.page as number) > context.pageCount)
  )
    return false;
  if (Object.hasOwn(value, "bbox")) {
    const box = value.bbox;
    if (
      !Object.hasOwn(value, "page") ||
      !isRagRecord(box) ||
      !hasOnlyKeys(box, ["left", "top", "right", "bottom", "origin", "unit"]) ||
      ![box.left, box.top, box.right, box.bottom].every(
        (n) =>
          typeof n === "number" &&
          Number.isFinite(n) &&
          Math.abs(n) <= 10_000_000,
      ) ||
      !["top-left", "bottom-left"].includes(box.origin as string) ||
      !["pt", "px"].includes(box.unit as string) ||
      (box.right as number) < (box.left as number) ||
      (box.origin === "top-left"
        ? (box.bottom as number) < (box.top as number)
        : (box.top as number) < (box.bottom as number))
    )
      return false;
  }
  return true;
}
export function isCitationLocator(value: unknown): value is CitationLocator {
  return (
    isRagRecord(value) &&
    hasOnlyKeys(value, ["text"], ["page"]) &&
    isRagText(value.text, 1000) &&
    (!Object.hasOwn(value, "page") ||
      (Number.isSafeInteger(value.page) &&
        (value.page as number) >= 1 &&
        (value.page as number) <= 2000))
  );
}

/** Canonical JSON for RAG manifests; arrays and exact text retain their order. */
export function canonicalRagJson(value: unknown): string {
  const active = new Set<object>();
  let nodes = 0;
  function visit(item: unknown, depth: number): unknown {
    if (++nodes > 1_000_000 || depth > 32) throw new Error("invalid-rag-json");
    if (item === null || typeof item === "string" || typeof item === "boolean")
      return item;
    if (typeof item === "number" && Number.isFinite(item)) return item;
    if ((Array.isArray(item) || isRagRecord(item)) && !active.has(item)) {
      active.add(item);
      const output = Array.isArray(item)
        ? item.map((child) => visit(child, depth + 1))
        : Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, visit(item[key], depth + 1)]),
          );
      active.delete(item);
      return output;
    }
    throw new Error("invalid-rag-json");
  }
  return JSON.stringify(visit(value, 0));
}
