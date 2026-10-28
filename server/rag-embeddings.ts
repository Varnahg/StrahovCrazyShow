import { createHash } from "node:crypto";
import type { KnowledgeChunk } from "./crazy-typka-retrieval";

export type EmbeddingProfile = Readonly<{
  id: string;
  provider: "openai";
  model: string;
  dimensions: number;
  inputVersion: "title-locator-text-v1";
}>;
export type EmbeddingResult = {
  vectors: number[][];
  usage: { promptTokens: number; totalTokens: number };
};
export type Embedder = {
  readonly profile: EmbeddingProfile;
  embed(
    inputs: readonly string[],
    options: {
      signal: AbortSignal;
      user?: string;
      onAttempt?: (inputBytes: number) => void;
    },
  ): Promise<EmbeddingResult>;
};
const errorCodes = [
  "invalid-profile",
  "invalid-configuration",
  "invalid-input",
  "request-too-large",
  "request-timeout",
  "cancelled",
  "rate-limited",
  "provider-unavailable",
  "invalid-response",
] as const;
export type EmbeddingErrorCode = (typeof errorCodes)[number];
export class EmbeddingError extends Error {
  readonly code: EmbeddingErrorCode;
  constructor(code: EmbeddingErrorCode) {
    const safe = errorCodes.includes(code) ? code : "provider-unavailable";
    super(safe);
    this.name = "EmbeddingError";
    this.code = safe;
  }
}
const INPUT_VERSION = "title-locator-text-v1";
const MODEL_DIMENSIONS: Readonly<Record<string, number>> = Object.freeze({
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
});
const hash = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export function createEmbeddingProfile(
  options: { model?: string; dimensions?: number } = {},
): EmbeddingProfile {
  if (!object(options)) throw new EmbeddingError("invalid-profile");
  const model =
    options.model === undefined ? "text-embedding-3-large" : options.model;
  if (typeof model !== "string") throw new EmbeddingError("invalid-profile");
  const maximum = Object.hasOwn(MODEL_DIMENSIONS, model)
    ? MODEL_DIMENSIONS[model]
    : 0;
  const dimensions =
    options.dimensions === undefined ? maximum : options.dimensions;
  if (
    !maximum ||
    !Number.isSafeInteger(dimensions) ||
    dimensions < 1 ||
    dimensions > maximum
  )
    throw new EmbeddingError("invalid-profile");
  return Object.freeze({
    id: hash(JSON.stringify(["openai", model, dimensions, INPUT_VERSION])),
    provider: "openai",
    model,
    dimensions,
    inputVersion: INPUT_VERSION,
  });
}

function wellFormed(value: string): boolean {
  // Preserve exact input; reject lone surrogates rather than hash replacement bytes.
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
    } else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function inputString(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && wellFormed(value)
  );
}
export function documentEmbeddingInput(chunk: KnowledgeChunk): string {
  if (
    !chunk ||
    !chunk.document ||
    ![chunk.document.title, chunk.sourceLocator, chunk.text].every(inputString)
  )
    throw new EmbeddingError("invalid-input");
  return JSON.stringify([
    chunk.document.title,
    chunk.sourceLocator,
    chunk.text,
  ]);
}
export function embeddingInputHash(input: string): string {
  if (!inputString(input)) throw new EmbeddingError("invalid-input");
  return hash(input);
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function positiveLimit(
  value: number | undefined,
  fallback: number,
  maximum = fallback,
) {
  const limit = value === undefined ? fallback : value;
  if (
    typeof limit !== "number" ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > maximum
  )
    throw new EmbeddingError("invalid-configuration");
  return limit;
}
function validProfile(value: EmbeddingProfile): EmbeddingProfile {
  if (
    !object(value) ||
    typeof value.model !== "string" ||
    typeof value.dimensions !== "number"
  )
    throw new EmbeddingError("invalid-profile");
  const profile = createEmbeddingProfile(value);
  if (
    value.id !== profile.id ||
    value.provider !== profile.provider ||
    value.inputVersion !== INPUT_VERSION
  )
    throw new EmbeddingError("invalid-profile");
  return profile;
}

/** Also settles when an injected/failed transport ignores AbortSignal. */
function abortable<T>(
  start: () => Promise<T>,
  signal: AbortSignal,
  discard?: (value: T) => void,
): Promise<T> {
  if (signal.aborted) return Promise.reject(new EmbeddingError("cancelled"));
  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => signal.removeEventListener("abort", abort);
    const abort = () => {
      finished = true;
      cleanup();
      reject(new EmbeddingError("cancelled"));
    };
    signal.addEventListener("abort", abort, { once: true });
    try {
      Promise.resolve(start()).then(
        (value) => {
          cleanup();
          if (finished) {
            discard?.(value);
            return;
          }
          finished = true;
          resolve(value);
        },
        () => {
          cleanup();
          reject(new EmbeddingError("provider-unavailable"));
        },
      );
    } catch {
      cleanup();
      reject(new EmbeddingError("provider-unavailable"));
    }
  });
}

function validateResponse(
  value: unknown,
  profile: EmbeddingProfile,
  count: number,
): EmbeddingResult {
  const invalid = () => {
    throw new EmbeddingError("invalid-response");
  };
  if (
    !object(value) ||
    value.object !== "list" ||
    value.model !== profile.model ||
    !Array.isArray(value.data) ||
    value.data.length !== count ||
    !object(value.usage)
  )
    return invalid();
  const { prompt_tokens: promptTokens, total_tokens: totalTokens } =
    value.usage;
  if (
    typeof promptTokens !== "number" ||
    typeof totalTokens !== "number" ||
    !Number.isSafeInteger(promptTokens) ||
    !Number.isSafeInteger(totalTokens) ||
    promptTokens < 0 ||
    totalTokens < promptTokens
  )
    return invalid();
  const vectors: number[][] = new Array(count);
  for (const item of value.data) {
    if (
      !object(item) ||
      item.object !== "embedding" ||
      typeof item.index !== "number" ||
      !Number.isSafeInteger(item.index) ||
      item.index < 0 ||
      item.index >= count ||
      vectors[item.index] ||
      !Array.isArray(item.embedding) ||
      item.embedding.length !== profile.dimensions
    )
      return invalid();
    let squaredNorm = 0;
    for (const component of item.embedding) {
      if (typeof component !== "number" || !Number.isFinite(component))
        return invalid();
      squaredNorm += component * component;
    }
    if (
      !Number.isFinite(squaredNorm) ||
      squaredNorm <= 0 ||
      Math.abs(Math.sqrt(squaredNorm) - 1) > 1e-3
    )
      return invalid();
    vectors[item.index] = item.embedding;
  }
  return { vectors, usage: { promptTokens, totalTokens } };
}

export function createOpenAIEmbedder(options: {
  apiKey: string;
  profile: EmbeddingProfile;
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxInputs?: number;
  maxInputBytes?: number;
  maxBatchBytes?: number;
  responseBytes?: number;
}): Embedder {
  if (!object(options)) throw new EmbeddingError("invalid-configuration");
  const profile = validProfile(options.profile);
  const apiKey = options.apiKey;
  if (typeof apiKey !== "string" || !apiKey.trim() || /[\r\n]/.test(apiKey))
    throw new EmbeddingError("invalid-configuration");
  const fetcher =
    options.fetch === undefined ? globalThis.fetch : options.fetch;
  if (typeof fetcher !== "function")
    throw new EmbeddingError("invalid-configuration");
  const timeoutMs = positiveLimit(options.timeoutMs, 20000, 60000);
  const maxInputs = positiveLimit(options.maxInputs, 32);
  const maxInputBytes = positiveLimit(options.maxInputBytes, 8191);
  const maxBatchBytes = positiveLimit(options.maxBatchBytes, 65536);
  const responseBytes = positiveLimit(options.responseBytes, 4 * 1024 * 1024);
  return Object.freeze({
    profile,
    async embed(
      inputs: readonly string[],
      call: Parameters<Embedder["embed"]>[1],
    ): Promise<EmbeddingResult> {
      if (
        !object(call) ||
        !(call.signal instanceof AbortSignal) ||
        (call.onAttempt !== undefined && typeof call.onAttempt !== "function")
      )
        throw new EmbeddingError("invalid-input");
      const { signal, user, onAttempt } = call;
      if (!Array.isArray(inputs) || !inputs.length || inputs.length > maxInputs)
        throw new EmbeddingError("invalid-input");
      let inputBytes = 0;
      for (const input of inputs) {
        if (!inputString(input)) throw new EmbeddingError("invalid-input");
        const size = Buffer.byteLength(input, "utf8");
        if (size > maxInputBytes) throw new EmbeddingError("request-too-large");
        inputBytes += size;
      }
      if (inputBytes > maxBatchBytes)
        throw new EmbeddingError("request-too-large");
      const count = inputs.length;
      if (
        user !== undefined &&
        (!inputString(user) || Buffer.byteLength(user, "utf8") > 128)
      )
        throw new EmbeddingError("invalid-input");
      const body = JSON.stringify({
        model: profile.model,
        dimensions: profile.dimensions,
        encoding_format: "float",
        input: inputs,
        ...(user !== undefined ? { user } : {}),
      });
      if (Buffer.byteLength(body, "utf8") > 128 * 1024)
        throw new EmbeddingError("request-too-large");
      if (signal.aborted) throw new EmbeddingError("cancelled");
      // A caller's budget rejection stays intact and happens before any transport work.
      onAttempt?.(inputBytes);
      if (signal.aborted) throw new EmbeddingError("cancelled");

      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      const deadline = performance.now() + timeoutMs;
      const expire = () => {
        timedOut = true;
        controller.abort();
      };
      const timer = setTimeout(expire, timeoutMs);
      timer.unref();
      const check = () => {
        // Keep the bound even if an immediately-resolving stream starves timers.
        if (performance.now() >= deadline) expire();
        if (controller.signal.aborted) throw new EmbeddingError("cancelled");
      };
      let response: Response | undefined;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      try {
        check();
        response = await abortable(
          () =>
            fetcher("https://api.openai.com/v1/embeddings", {
              method: "POST",
              redirect: "error",
              signal: controller.signal,
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body,
            }),
          controller.signal,
          (late) => {
            void late.body?.cancel().catch(() => {});
          },
        );
        check();
        if (!response.ok)
          throw new EmbeddingError(
            response.status === 429 ? "rate-limited" : "provider-unavailable",
          );
        const length = response.headers.get("content-length");
        if (
          !/^application\/json(?:\s*;|$)/i.test(
            response.headers.get("content-type") ?? "",
          ) ||
          (length !== null &&
            (!/^\d+$/.test(length) || Number(length) > responseBytes)) ||
          !response.body
        )
          throw new EmbeddingError("invalid-response");
        reader = response.body.getReader();
        let buffer = new Uint8Array(Math.min(4096, responseBytes));
        let used = 0;
        for (;;) {
          check();
          const part = await abortable(() => reader!.read(), controller.signal);
          check();
          if (part.done) break;
          const size = part.value.byteLength;
          if (used + size > responseBytes)
            throw new EmbeddingError("invalid-response");
          if (used + size > buffer.length) {
            const expanded = new Uint8Array(
              Math.min(responseBytes, Math.max(used + size, buffer.length * 2)),
            );
            expanded.set(buffer.subarray(0, used));
            buffer = expanded;
          }
          buffer.set(part.value, used);
          used += size;
        }
        let decoded: unknown;
        try {
          decoded = JSON.parse(
            new TextDecoder("utf-8", { fatal: true }).decode(
              buffer.subarray(0, used),
            ),
          );
        } catch {
          throw new EmbeddingError("invalid-response");
        }
        const result = validateResponse(decoded, profile, count);
        check();
        return result;
      } catch (error) {
        if (signal.aborted) throw new EmbeddingError("cancelled");
        if (timedOut) throw new EmbeddingError("request-timeout");
        if (error instanceof EmbeddingError) throw error;
        throw new EmbeddingError("provider-unavailable");
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        controller.abort();
        if (reader) {
          void reader.cancel().catch(() => {});
          reader.releaseLock();
        } else if (response?.body) void response.body.cancel().catch(() => {});
      }
    },
  });
}
