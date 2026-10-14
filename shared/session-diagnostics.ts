/** Local diagnostic wire format. Keep browser and disk limits identical. */
export const DIAGNOSTICS_SCHEMA_VERSION = 1;
export const MAX_DIAGNOSTICS_BATCH_BYTES = 128 * 1024;
export const MAX_DIAGNOSTICS_RECORDS = 128;
export const MAX_DIAGNOSTICS_RECORD_BYTES = 32 * 1024;
export const DIAGNOSTICS_FLUSH_INTERVAL_MS = 1000;
export const DIAGNOSTICS_DRAIN_THRESHOLD_BYTES = 48 * 1024;
export const DIAGNOSTICS_CLIENT_BATCH_BYTES = 60 * 1024;
const encoder = new TextEncoder();

export type DiagnosticsValue =
  null | boolean | number | string | DiagnosticsValue[] | DiagnosticsData;
export interface DiagnosticsData {
  [key: string]: DiagnosticsValue;
}
export interface DiagnosticsRecord {
  seq: number;
  /** Monotonic browser time, correlated with session-start timeOrigin/UTC. */
  atMs: number;
  kind: string;
  data: DiagnosticsData;
}
export interface DiagnosticsBatch {
  schemaVersion: typeof DIAGNOSTICS_SCHEMA_VERSION;
  sessionId: string;
  batchId: number;
  records: DiagnosticsRecord[];
}

const sensitiveKey =
  /password|passwd|secret|token|authorization|cookie|chat|payload|profile|email|username|displayname|nickname|playerid|userid|accountid|keystroke|clipboard|messagebody/i;
const safeKey = /^[a-zA-Z][a-zA-Z0-9_.-]{0,63}$/;
const safeKind = /^[a-z][a-z0-9_.-]{0,63}$/;
const sessionIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Technical strings only: queries, fragments and common credentials are redacted. */
export function sanitizeDiagnosticsText(
  value: string,
  maxLength = 2048,
): string {
  const sanitized = value
    .slice(0, maxLength)
    .replace(/(?:https?|wss?):\/\/[^\s<>"']+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      } catch {
        return "[invalid-url]";
      }
    })
    .replace(/([/?][^\s<>"'?]*)\?[^\s<>"']+/g, "$1?[redacted]")
    .replace(/\b(Bearer|Basic)\s+\S+/gi, "$1 [redacted]")
    .replace(
      /\b(password|passwd|token|secret|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    );
  return sanitized.includes("@")
    ? sanitized.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    : sanitized;
}

/**
 * Copies plain technical telemetry into a bounded JSON tree. Call sites must
 * project game state explicitly; never pass user content or arbitrary objects.
 */
export function sanitizeDiagnosticsData(value: unknown): DiagnosticsData {
  let remaining = 6000;
  const seen = new WeakSet<object>();
  function copy(item: unknown, depth: number): DiagnosticsValue | undefined {
    if (--remaining < 0 || depth > 8) return undefined;
    if (item === null || typeof item === "boolean") return item;
    if (typeof item === "number") return Number.isFinite(item) ? item : null;
    if (typeof item === "string") return sanitizeDiagnosticsText(item);
    if (typeof item !== "object" || seen.has(item)) return undefined;
    seen.add(item);
    if (Array.isArray(item)) {
      const output: DiagnosticsValue[] = [];
      for (const entry of item.slice(0, 1024)) {
        output.push(copy(entry, depth + 1) ?? null);
      }
      seen.delete(item);
      return output;
    }
    const prototype: unknown = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== null) {
      seen.delete(item);
      return undefined;
    }
    const output: DiagnosticsData = {};
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(item),
    ).slice(0, 96)) {
      if (
        !safeKey.test(key) ||
        sensitiveKey.test(key) ||
        !("value" in descriptor)
      )
        continue;
      const entry = copy(descriptor.value, depth + 1);
      if (entry !== undefined) output[key] = entry;
    }
    seen.delete(item);
    return output;
  }
  const result = copy(value, 0);
  return result && typeof result === "object" && !Array.isArray(result)
    ? result
    : {};
}

export function diagnosticsByteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

export function isDiagnosticsKind(kind: string): boolean {
  return safeKind.test(kind);
}

/** Reject malformed envelopes; defensively sanitize data received by the API. */
export function validateDiagnosticsBatch(
  value: unknown,
): DiagnosticsBatch | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const batch = value as Partial<DiagnosticsBatch>;
  if (
    batch.schemaVersion !== DIAGNOSTICS_SCHEMA_VERSION ||
    typeof batch.sessionId !== "string" ||
    !sessionIdPattern.test(batch.sessionId) ||
    !Number.isSafeInteger(batch.batchId) ||
    batch.batchId! < 0 ||
    !Array.isArray(batch.records) ||
    batch.records.length === 0 ||
    batch.records.length > MAX_DIAGNOSTICS_RECORDS
  )
    return null;
  const records: DiagnosticsRecord[] = [];
  let previousSeq = -1;
  try {
    if (diagnosticsByteLength(value) > MAX_DIAGNOSTICS_BATCH_BYTES) return null;
    for (const candidate of batch.records) {
      if (
        !candidate ||
        !Number.isSafeInteger(candidate.seq) ||
        candidate.seq <= previousSeq ||
        !Number.isFinite(candidate.atMs) ||
        candidate.atMs < 0 ||
        typeof candidate.kind !== "string" ||
        !isDiagnosticsKind(candidate.kind) ||
        !candidate.data ||
        typeof candidate.data !== "object" ||
        Array.isArray(candidate.data) ||
        diagnosticsByteLength(candidate) > MAX_DIAGNOSTICS_RECORD_BYTES
      )
        return null;
      previousSeq = candidate.seq;
      records.push({
        seq: candidate.seq,
        atMs: candidate.atMs,
        kind: candidate.kind,
        data: sanitizeDiagnosticsData(candidate.data),
      });
    }
  } catch {
    return null;
  }
  return {
    schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
    sessionId: batch.sessionId.toLowerCase(),
    batchId: batch.batchId!,
    records,
  };
}
