import { createHash } from "node:crypto";
import { Resolver } from "node:dns/promises";
import {
  Agent,
  request as httpsRequest,
  type RequestOptions,
} from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity } from "node:tls";
import { MIMEType } from "node:util";
import { canonicalizeSourceUrl, type PublisherId } from "./rag-source-catalog";

export type SourceSignature =
  "pdf" | "zip-container" | "legacy-ole" | "html" | "xml" | "rtf" | "text";
export type RobotsDecision = {
  allowed: boolean;
  reason: string;
  crawlDelaySeconds?: number | null;
};
export type FetchLimits = {
  timeoutMs: number;
  maxBytes: number;
  maxRedirects: number;
};
export type FetchValidators = {
  url: string;
  etag?: string;
  lastModified?: string;
};
export type SourceFetchOptions = {
  url: string;
  publisher: PublisherId;
  policy: (url: string, publisher: PublisherId) => boolean;
  robots: (
    url: string,
    context: { signal: AbortSignal; userAgent: string },
  ) => Promise<RobotsDecision>;
  limits: FetchLimits;
  signal?: AbortSignal;
  validators?: FetchValidators;
  expectedFormat?: string | null;
  userAgent: string;
};
export type RedirectStep = {
  url: string;
  statusCode: number;
  location: string;
};
export type FetchMetadata = {
  finalUrl: string;
  redirects: RedirectStep[];
  statusCode: number;
  mime: string | null;
  charset: string | null;
  etag: string | null;
  lastModified: string | null;
  checkedAt: string;
  retryAfter: string | null;
};
export type SourceFetchResult = FetchMetadata &
  (
    | {
        kind: "fetched";
        bytes: Buffer;
        sha256: string;
        signature: SourceSignature;
      }
    | { kind: "not-modified" }
  );
export type SourceFetchErrorCode =
  | "invalid-options"
  | "policy"
  | "robots-denied"
  | "robots-unavailable"
  | "dns"
  | "ssrf"
  | "network"
  | "timeout"
  | "aborted"
  | "redirect"
  | "http"
  | "byte-limit"
  | "encoding"
  | "format";
export class SourceFetchError extends Error {
  constructor(
    public readonly code: SourceFetchErrorCode,
    message: string,
    public readonly metadata?: FetchMetadata,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SourceFetchError";
  }
}
export type ResolvedAddress = { address: string; family: number };
export type FetchResponse = AsyncIterable<Uint8Array> & {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  destroy(error?: Error): unknown;
};
export type FetchRequest = {
  once(event: "error", listener: (error: Error) => void): unknown;
  end(): unknown;
  destroy(error?: Error): unknown;
};
// Node passes TCP connection options through HTTPS; @types/node's RequestOptions omits this one.
export type SourceRequestOptions = RequestOptions & { autoSelectFamily: false };
export type SourceFetcherDependencies = {
  resolve?: (
    hostname: string,
    context: { signal: AbortSignal },
  ) => Promise<ResolvedAddress[]>;
  request?: (
    options: SourceRequestOptions,
    response: (response: FetchResponse) => void,
  ) => FetchRequest;
  now?: () => Date;
};

function ipv6Number(address: string): bigint | null {
  if (isIP(address) !== 6 || address.includes("%") || address.includes("."))
    return null;
  const halves = address.toLowerCase().split("::");
  const left = halves[0] ? halves[0].split(":") : [],
    right = halves[1] ? halves[1].split(":") : [];
  const groups =
    halves.length === 2
      ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right]
      : left;
  return groups.reduce((n, g) => (n << 16n) | BigInt(`0x${g}`), 0n);
}

/** Conservative public-unicast policy, based on the IANA special-purpose registries. */
export function isPublicSourceAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  const n = ipv6Number(address);
  if (n === null || n >> 125n !== 1n) return false; // Only 2000::/3; no mapped, NAT64, local, multicast or reserved ranges.
  const prefix = (base: string, bits: number) =>
    n >> BigInt(128 - bits) === ipv6Number(base)! >> BigInt(128 - bits);
  return (
    !prefix("2001::", 23) &&
    !prefix("2001:db8::", 32) &&
    !prefix("2002::", 16) &&
    !prefix("3fff::", 20)
  );
}

function header(response: FetchResponse, key: string): string | null {
  const value = response.headers[key];
  return typeof value === "string" ? value : null; // Ambiguous singleton headers never become validators/locations.
}

function contentType(response: FetchResponse): {
  mime: string | null;
  charset: string | null;
} {
  const value = header(response, "content-type");
  if (!value) return { mime: null, charset: null };
  try {
    const parsed = new MIMEType(value);
    const charset = parsed.params.get("charset")?.trim().toLowerCase() ?? null;
    if (charset !== null && !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(charset))
      throw new Error("Invalid charset token");
    return { mime: parsed.essence, charset };
  } catch (cause) {
    throw new SourceFetchError(
      "format",
      "Invalid Content-Type or charset",
      undefined,
      { cause },
    );
  }
}

function afterHtmlPreamble(text: string): string {
  let offset = 0;
  for (;;) {
    while (offset < text.length && /\s/u.test(text[offset])) offset++;
    if (!text.startsWith("<!--", offset)) return text.slice(offset);
    const end = text.indexOf("-->", offset + 4);
    if (end === -1) return text.slice(offset); // An unclosed comment does not prove HTML.
    offset = end + 3;
  }
}

function textForSignature(
  bytes: Buffer,
  charset: string | null,
  mime: string | null,
): string {
  // Decode only for transport checks. The original bytes/hash go unchanged to the worker.
  let encoding = charset;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  else if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])))
    encoding = "utf-8";
  else if (
    !encoding &&
    (mime === "text/html" || mime === "application/xhtml+xml")
  ) {
    // Match an actual meta tag, not arbitrary prose; ASCII is shared by supported legacy HTML encodings.
    const prefix = bytes
      .subarray(0, 8192)
      .toString("latin1")
      .replace(/<!--[\s\S]*?-->/g, "");
    const declaration = /<meta\b[^>]*\bcharset\s*=\s*["']?([a-z0-9._-]+)/i.exec(
      prefix,
    );
    encoding = declaration?.[1] ?? null;
  }
  let text: string;
  try {
    text = new TextDecoder(encoding ?? "utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new SourceFetchError(
      "format",
      "Unknown charset or invalid text encoding",
      undefined,
      { cause },
    );
  }
  if (/[\u0000-\u0008\u000b\u000e-\u001f]/.test(text))
    throw new SourceFetchError("format", "Unrecognized binary source");
  return text;
}
function aborted(signal: AbortSignal): SourceFetchError {
  return signal.reason instanceof SourceFetchError
    ? signal.reason
    : new SourceFetchError("aborted", "Source fetch aborted");
}
function bounded<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(aborted(signal));
    };
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
function identify(
  bytes: Buffer,
  mime: string | null,
  charset: string | null,
  expected?: string | null,
): SourceSignature {
  if (!bytes.length)
    throw new SourceFetchError(
      "format",
      "Empty response is not an extracted document",
    );
  let signature: SourceSignature;
  if (bytes.subarray(0, 5).equals(Buffer.from("%PDF-"))) signature = "pdf";
  else if (
    ["504b0304", "504b0506", "504b0708"].includes(
      bytes.subarray(0, 4).toString("hex"),
    )
  )
    signature = "zip-container";
  else if (bytes.subarray(0, 8).toString("hex") === "d0cf11e0a1b11ae1")
    signature = "legacy-ole";
  else {
    const text = textForSignature(bytes, charset, mime);
    const head = afterHtmlPreamble(text);
    signature = /^(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(head)
      ? "html"
      : /^(?:<\?xml\b|<rss\b|<feed\b)/i.test(head)
        ? "xml"
        : /^\{\\rtf\d/i.test(head)
          ? "rtf"
          : "text";
    if (
      signature === "html" &&
      /<input\b[^>]*\btype\s*=\s*["']?password\b|cf-chl-|challenge-platform|<title[^>]*>\s*(?:Just a moment|Access denied|Sign in|Log in)/i.test(
        text,
      )
    )
      throw new SourceFetchError(
        "format",
        "Authentication or challenge HTML is not a public document",
      );
  }
  const required = expected?.toLowerCase();
  if ((required === "pdf" || mime === "application/pdf") && signature !== "pdf")
    throw new SourceFetchError(
      "format",
      "PDF expectation does not match bytes",
    );
  if (
    required &&
    ["docx", "xlsx", "pptx", "odt", "ods", "odp"].includes(required) &&
    signature !== "zip-container"
  )
    throw new SourceFetchError(
      "format",
      "Office expectation does not match container signature",
    );
  if (
    mime?.startsWith("image/") ||
    mime?.startsWith("audio/") ||
    mime?.startsWith("video/")
  )
    throw new SourceFetchError("format", "Unsupported media response");
  if (
    (mime === "text/html" || mime === "application/xhtml+xml") &&
    !["html", "xml"].includes(signature)
  )
    throw new SourceFetchError(
      "format",
      "HTML MIME does not match document signature",
    );
  return signature;
}

async function resolvePublicCandidates(
  hostname: string,
  { signal }: { signal: AbortSignal },
): Promise<ResolvedAddress[]> {
  // Per-operation resolver gives abort/timeout ownership without mutating global DNS configuration.
  const resolver = new Resolver();
  const cancel = () => resolver.cancel();
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) throw aborted(signal);
    const query = async (family: 4 | 6): Promise<ResolvedAddress[]> => {
      try {
        return (
          await (family === 4
            ? resolver.resolve4(hostname)
            : resolver.resolve6(hostname))
        ).map((address) => ({ address, family }));
      } catch (cause) {
        if (
          ["ENODATA", "ENOTFOUND"].includes(
            (cause as NodeJS.ErrnoException).code ?? "",
          )
        )
          return [];
        throw cause;
      }
    };
    return (await Promise.all([query(4), query(6)])).flat();
  } finally {
    signal.removeEventListener("abort", cancel);
    resolver.cancel();
  }
}

type InternalOptions = Omit<SourceFetchOptions, "robots"> & {
  robots?: SourceFetchOptions["robots"];
  robotsMode?: boolean;
};
function createTransfer(deps: SourceFetcherDependencies) {
  const resolve = deps.resolve ?? resolvePublicCandidates;
  const request =
    deps.request ?? ((options, callback) => httpsRequest(options, callback));
  const now = deps.now ?? (() => new Date());
  return async (
    options: InternalOptions,
  ): Promise<SourceFetchResult | (FetchMetadata & { kind: "absent" })> => {
    const { limits } = options;
    if (
      !limits ||
      !Number.isSafeInteger(limits.timeoutMs) ||
      limits.timeoutMs < 1 ||
      limits.timeoutMs > 300_000 ||
      !Number.isSafeInteger(limits.maxBytes) ||
      limits.maxBytes < 1 ||
      limits.maxBytes > 100 * 1024 * 1024 ||
      !Number.isInteger(limits.maxRedirects) ||
      limits.maxRedirects < 0 ||
      limits.maxRedirects > 10 ||
      !options.userAgent ||
      /[^\x20-\x7e]/.test(options.userAgent) ||
      options.userAgent.length > 256
    )
      throw new SourceFetchError(
        "invalid-options",
        "Explicit bounded limits and a safe User-Agent are required",
      );
    const controller = new AbortController(),
      signal = controller.signal;
    let activeRequest: FetchRequest | undefined,
      activeResponse: FetchResponse | undefined,
      activeAgent: Agent | undefined;
    const cleanupHop = () => {
      activeResponse?.destroy();
      activeRequest?.destroy();
      activeAgent?.destroy();
      activeResponse = undefined;
      activeRequest = undefined;
      activeAgent = undefined;
    };
    const externalAbort = () =>
      controller.abort(
        new SourceFetchError("aborted", "Caller aborted source fetch"),
      );
    const timeout = setTimeout(
      () =>
        controller.abort(
          new SourceFetchError(
            "timeout",
            "Source fetch exceeded whole-transfer deadline",
          ),
        ),
      limits.timeoutMs,
    );
    const cleanupOnAbort = () => cleanupHop();
    signal.addEventListener("abort", cleanupOnAbort, { once: true });
    options.signal?.addEventListener("abort", externalAbort, { once: true });
    if (options.signal?.aborted) externalAbort();
    const redirects: RedirectStep[] = [],
      visited = new Set<string>();
    let url: string;
    try {
      try {
        url = canonicalizeSourceUrl(options.url);
      } catch (cause) {
        throw new SourceFetchError("policy", "Unsafe initial URL", undefined, {
          cause,
        });
      }
      for (;;) {
        if (signal.aborted) throw aborted(signal);
        if (visited.has(url))
          throw new SourceFetchError("redirect", "Redirect loop");
        visited.add(url);
        if (options.policy(url, options.publisher) !== true)
          throw new SourceFetchError(
            "policy",
            "URL outside approved publisher/path policy",
          );
        if (!options.robotsMode) {
          let decision: RobotsDecision;
          try {
            if (!options.robots)
              throw new Error("Robots callback is mandatory");
            decision = await bounded(
              options.robots(url, { signal, userAgent: options.userAgent }),
              signal,
            );
          } catch (cause) {
            if (signal.aborted) throw aborted(signal);
            throw new SourceFetchError(
              "robots-unavailable",
              "Robots decision unavailable; no fallback",
              undefined,
              { cause },
            );
          }
          if (
            !decision ||
            typeof decision.reason !== "string" ||
            !decision.reason ||
            decision.allowed !== true
          )
            throw new SourceFetchError(
              "robots-denied",
              `Robots denied URL: ${decision?.reason ?? "missing decision"}`,
            );
        }
        const target = new URL(url);
        let addresses: ResolvedAddress[];
        try {
          addresses = await bounded(
            resolve(target.hostname, { signal }),
            signal,
          );
        } catch (cause) {
          if (signal.aborted) throw aborted(signal);
          throw new SourceFetchError(
            "dns",
            "DNS resolution failed",
            undefined,
            { cause },
          );
        }
        if (
          !addresses.length ||
          addresses.some(
            (r) =>
              isIP(r.address) !== r.family || !isPublicSourceAddress(r.address),
          )
        )
          throw new SourceFetchError(
            "ssrf",
            "DNS returned a non-public or invalid address",
          );
        const pinned = addresses[0];
        const headers: Record<string, string> = {
          Host: target.hostname,
          "User-Agent": options.userAgent,
          Accept: options.robotsMode
            ? "text/plain"
            : "application/pdf, application/xml, text/html, text/plain, application/octet-stream;q=0.8",
          "Accept-Encoding": "identity",
          Connection: "close",
        };
        let conditional = false;
        if (options.validators?.url === url) {
          for (const [field, name] of [
            ["etag", "If-None-Match"],
            ["lastModified", "If-Modified-Since"],
          ] as const) {
            const value = options.validators[field];
            if (value !== undefined) {
              if (!value || /[\r\n\u0000]/.test(value) || value.length > 8192)
                throw new SourceFetchError(
                  "invalid-options",
                  "Invalid HTTP validator",
                );
              headers[name] = value;
              conditional = true;
            }
          }
        }
        activeAgent = new Agent({
          keepAlive: false,
          maxCachedSessions: 0,
          proxyEnv: {},
        });
        const responsePromise = new Promise<FetchResponse>(
          (resolveResponse, reject) => {
            activeRequest = request(
              {
                protocol: "https:",
                hostname: target.hostname,
                port: 443,
                path: `${target.pathname}${target.search}`,
                method: "GET",
                headers,
                agent: activeAgent,
                servername: target.hostname,
                rejectUnauthorized: true,
                checkServerIdentity: (_host, certificate) =>
                  checkServerIdentity(target.hostname, certificate),
                family: pinned.family,
                autoSelectFamily: false,
                maxHeaderSize: 16 * 1024,
                lookup: (_hostname, lookupOptions, callback) => {
                  // Never resolve DNS a second time; preserve hostname for Host, TLS and SNI.
                  if (typeof lookupOptions === "object" && lookupOptions.all)
                    callback(null, [
                      { address: pinned.address, family: pinned.family },
                    ]);
                  else callback(null, pinned.address, pinned.family);
                },
              },
              (response) => {
                if (signal.aborted) {
                  response.destroy();
                  reject(aborted(signal));
                  return;
                }
                activeResponse = response;
                resolveResponse(response);
              },
            );
            activeRequest.once("error", reject);
            activeRequest.end();
          },
        );
        let response: FetchResponse;
        try {
          response = await bounded(responsePromise, signal);
        } catch (cause) {
          if (signal.aborted) throw aborted(signal);
          throw new SourceFetchError(
            "network",
            "HTTPS transfer failed",
            undefined,
            { cause },
          );
        }
        const statusCode = response.statusCode ?? 0;
        const { mime, charset } = contentType(response);
        const meta: FetchMetadata = {
          finalUrl: url,
          redirects: [...redirects],
          statusCode,
          mime,
          charset,
          etag: header(response, "etag"),
          lastModified: header(response, "last-modified"),
          checkedAt: now().toISOString(),
          retryAfter: header(response, "retry-after"),
        };
        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          const location = header(response, "location");
          if (!location || redirects.length >= limits.maxRedirects)
            throw new SourceFetchError(
              "redirect",
              "Missing redirect location or redirect limit exceeded",
              meta,
            );
          let next: string;
          try {
            next = canonicalizeSourceUrl(location, url);
          } catch (cause) {
            throw new SourceFetchError("policy", "Unsafe redirect URL", meta, {
              cause,
            });
          }
          redirects.push({ url, statusCode, location: next });
          cleanupHop();
          url = next;
          continue;
        }
        if (statusCode === 304) {
          if (!conditional)
            throw new SourceFetchError(
              "http",
              "Unsolicited 304 without matching validators",
              meta,
            );
          return {
            ...meta,
            kind: "not-modified",
            etag: meta.etag ?? options.validators?.etag ?? null,
            lastModified:
              meta.lastModified ?? options.validators?.lastModified ?? null,
          };
        }
        if (options.robotsMode && [404, 410].includes(statusCode))
          return { ...meta, kind: "absent" };
        if (statusCode !== 200)
          throw new SourceFetchError(
            "http",
            `Source returned HTTP ${statusCode}`,
            meta,
          );
        const encoding = header(response, "content-encoding")
          ?.trim()
          .toLowerCase();
        if (encoding && encoding !== "identity")
          throw new SourceFetchError(
            "encoding",
            "Compressed entity rejected despite Accept-Encoding: identity",
            meta,
          );
        const length = header(response, "content-length");
        if (
          length &&
          (!/^\d+$/.test(length) || Number(length) > limits.maxBytes)
        )
          throw new SourceFetchError(
            "byte-limit",
            "Invalid or excessive Content-Length",
            meta,
          );
        const chunks: Buffer[] = [];
        let size = 0;
        try {
          const iterator = response[Symbol.asyncIterator]();
          for (;;) {
            const chunk = await bounded(iterator.next(), signal);
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limits.maxBytes)
              throw new SourceFetchError(
                "byte-limit",
                "Actual entity byte limit exceeded",
                meta,
              );
            chunks.push(Buffer.from(chunk.value));
          }
        } catch (cause) {
          if (signal.aborted) throw aborted(signal);
          if (cause instanceof SourceFetchError) throw cause;
          throw new SourceFetchError(
            "network",
            "Response stream failed",
            meta,
            { cause },
          );
        }
        if (length && Number(length) !== size)
          throw new SourceFetchError(
            "network",
            "Truncated or mismatched Content-Length",
            meta,
          );
        const bytes = Buffer.concat(chunks, size);
        let signature: SourceSignature;
        try {
          signature =
            options.robotsMode && bytes.length === 0
              ? "text"
              : identify(bytes, mime, charset, options.expectedFormat);
          if (options.robotsMode && signature !== "text")
            throw new SourceFetchError(
              "format",
              "robots.txt must be plain text",
            );
        } catch (cause) {
          if (cause instanceof SourceFetchError)
            throw new SourceFetchError(cause.code, cause.message, meta, {
              cause,
            });
          throw cause;
        }
        return {
          ...meta,
          checkedAt: now().toISOString(),
          kind: "fetched",
          bytes,
          sha256: createHash("sha256").update(bytes).digest("hex"),
          signature,
        };
      }
    } finally {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", externalAbort);
      signal.removeEventListener("abort", cleanupOnAbort);
      cleanupHop();
    }
  };
}

export function createSourceFetcher(
  deps: SourceFetcherDependencies = {},
): (options: SourceFetchOptions) => Promise<SourceFetchResult> {
  const transfer = createTransfer(deps);
  return (options) => transfer(options) as Promise<SourceFetchResult>;
}

export type RobotsFetchOptions = Omit<
  SourceFetchOptions,
  "robots" | "expectedFormat"
>;
export type RobotsFetchResult =
  SourceFetchResult | (FetchMetadata & { kind: "absent" });
/** Sole robots bypass: exact /robots.txt, no query, no cross-origin or path redirects. */
export function createRobotsFetcher(
  deps: SourceFetcherDependencies = {},
): (options: RobotsFetchOptions) => Promise<RobotsFetchResult> {
  const transfer = createTransfer(deps);
  return async (options) => {
    const url = new URL(canonicalizeSourceUrl(options.url));
    if (url.pathname !== "/robots.txt" || url.search)
      throw new SourceFetchError(
        "policy",
        "Robots fetch is restricted to /robots.txt",
      );
    return transfer({
      ...options,
      robotsMode: true,
      expectedFormat: "text",
      policy: (value, publisher) =>
        value === url.href && options.policy(value, publisher) === true,
    });
  };
}
