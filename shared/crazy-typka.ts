export const CRAZY_TYPKA_LIMITS = Object.freeze({
  messageChars: 1500,
  answerChars: 4000,
  sources: 4,
  historyTurns: 6,
});

export const CRAZY_TYPKA_SPEAKER = Object.freeze({
  id: "crazy-typka",
  name: "Crazy Typka",
  kind: "ai",
} as const);

/** The visible starters are also retrieval acceptance cases, in both UI locales. */
export const CRAZY_TYPKA_STARTERS = {
  cs: ["Jak se přidám do Silicon Hill?", "Co se dá na Strahově podniknout?"],
  en: ["How do I join Silicon Hill?", "What can I do at Strahov?"],
} as const;

export type CrazyTypkaSource = {
  id: string;
  title: string;
  url: string;
  checkedAt: string;
  author: string | null;
  license: string | null;
  licenseUrl: string | null;
  adaptation: "curated-paraphrase";
};
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
export function isCrazyTypkaSource(value: unknown): value is CrazyTypkaSource {
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
  try {
    const url = new URL(value.url);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      !["www.siliconhill.cz", "wiki.sh.cvut.cz", "zapisy.sh.cvut.cz"].includes(
        url.hostname,
      )
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
