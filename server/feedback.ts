import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { FEEDBACK_LIMITS, validateFeedbackReport } from "../shared/feedback";
import {
  createFeedbackStore,
  FeedbackStoreError,
  type FeedbackImage,
} from "./feedback-store";
import { createFeedbackLinearWorker } from "./feedback-linear";

class IntakeError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}
function imageSize(
  bytes: Buffer,
  mimeType: string,
): { width: number; height: number } | undefined {
  if (
    mimeType === "image/png" &&
    bytes.length >= 45 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR" &&
    bytes.readUInt32BE(8) === 13
  ) {
    let offset = 8,
      end = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset),
        type = bytes.toString("ascii", offset + 4, offset + 8);
      if (length > bytes.length - offset - 12) return;
      offset += 12 + length;
      if (type === "IEND") {
        end = length === 0 && offset === bytes.length;
        break;
      }
    }
    if (end)
      return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (
    mimeType === "image/jpeg" &&
    bytes.length >= 12 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  ) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) return;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217) return;
      if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) return;
      if (
        [
          192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207,
        ].includes(marker) &&
        length >= 8
      )
        return {
          width: bytes.readUInt16BE(offset + 5),
          height: bytes.readUInt16BE(offset + 3),
        };
      offset += length;
    }
  }
  if (
    mimeType === "image/webp" &&
    bytes.length >= 30 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP" &&
    bytes.readUInt32LE(4) + 8 === bytes.length
  ) {
    const type = bytes.toString("ascii", 12, 16),
      length = bytes.readUInt32LE(16);
    if (length > bytes.length - 20) return;
    if (type === "VP8X" && length >= 10)
      return {
        width: bytes.readUIntLE(24, 3) + 1,
        height: bytes.readUIntLE(27, 3) + 1,
      };
    if (
      type === "VP8 " &&
      length >= 10 &&
      bytes.subarray(23, 26).equals(Buffer.from([157, 1, 42]))
    )
      return {
        width: bytes.readUInt16LE(26) & 16383,
        height: bytes.readUInt16LE(28) & 16383,
      };
    if (type === "VP8L" && length >= 5 && bytes[20] === 47) {
      const dimensions = bytes.readUInt32LE(21);
      return {
        width: (dimensions & 16383) + 1,
        height: ((dimensions >>> 14) & 16383) + 1,
      };
    }
  }
}
export interface FeedbackServiceOptions {
  directory?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  now?: () => number;
  random?: () => number;
  workerIntervalMs?: number;
  requestTimeoutMs?: number;
  onDeliveryError?: (code: string, reportId: string) => void;
  limits?: {
    maxReports?: number;
    maxBytes?: number;
    maxFiles?: number;
    maxActiveRequests?: number;
    ratePerMinute?: number;
    globalRatePerMinute?: number;
  };
}
export async function createFeedbackService(
  options: FeedbackServiceOptions = {},
) {
  const env = options.env ?? process.env,
    now = options.now ?? Date.now;
  const origins = new Set<string>();
  for (const value of (env.FEEDBACK_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)) {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.origin !== value ||
      url.username ||
      url.password
    )
      throw new Error("Invalid FEEDBACK_ALLOWED_ORIGINS");
    origins.add(value);
  }
  const store = await createFeedbackStore({
    directory: resolve(
      options.directory ?? env.FEEDBACK_DIR ?? ".cache/feedback",
    ),
    now,
    maxReports: options.limits?.maxReports,
    maxBytes: options.limits?.maxBytes,
    maxFiles: options.limits?.maxFiles,
  });
  const worker = createFeedbackLinearWorker({ ...options, store, env, now });
  const active = new Set<Promise<boolean>>(),
    cancellations = new Set<() => void>();
  const rate = new Map<string, { started: number; count: number }>();
  let globalWindow = { started: now(), count: 0 },
    closed = false;
  const timer = setInterval(() => {
    void worker
      .flush()
      .catch(() => options.onDeliveryError?.("delivery-storage", ""));
  }, options.workerIntervalMs ?? 5000);
  timer.unref();
  void worker
    .flush()
    .catch(() => options.onDeliveryError?.("delivery-storage", ""));
  function checkRate(req: IncomingMessage) {
    const instant = now();
    if (instant - globalWindow.started >= 60000)
      globalWindow = { started: instant, count: 0 };
    for (const [key, value] of rate)
      if (instant - value.started >= 60000) rate.delete(key);
    const address = req.socket.remoteAddress ?? "unknown";
    let client = rate.get(address);
    if (!client) {
      if (rate.size >= 1024) throw new IntakeError(429, "rate-limit");
      client = { started: instant, count: 0 };
      rate.set(address, client);
    }
    if (
      client.count >= (options.limits?.ratePerMinute ?? 10) ||
      globalWindow.count >= (options.limits?.globalRatePerMinute ?? 120)
    )
      throw new IntakeError(429, "rate-limit");
    client.count++;
    globalWindow.count++;
  }
  function permittedOrigin(req: IncomingMessage) {
    const origin = req.headers.origin;
    if (typeof origin !== "string" || origin === "null") return undefined;
    try {
      const url = new URL(origin);
      if (url.origin !== origin || !["http:", "https:"].includes(url.protocol))
        return undefined;
      // Forwarded headers are untrusted. A reverse proxy must use the explicit
      // allowlist for its public HTTPS origin and must preserve host appropriately.
      const host = req.headers.host;
      const scheme = (req.socket as typeof req.socket & { encrypted?: boolean })
        .encrypted
        ? "https"
        : "http";
      const direct =
        host && !/[\s/@\\]/.test(host)
          ? new URL(`${scheme}://${host}`).origin
          : undefined;
      return origins.has(origin) || origin === direct ? origin : undefined;
    } catch {
      return undefined;
    }
  }
  function readBody(req: IncomingMessage): Promise<Buffer> {
    return new Promise((resolveBody, reject) => {
      const chunks: Buffer[] = [];
      let size = 0,
        finished = false;
      const timeout = setTimeout(
        () => finish(new IntakeError(408, "request-timeout")),
        options.requestTimeoutMs ?? 15000,
      );
      timeout.unref();
      const cancel = () => finish(new IntakeError(503, "service-closing"));
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        cancellations.delete(cancel);
        req.off("data", data);
        req.off("end", end);
        req.off("error", failure);
        req.off("aborted", aborted);
        if (error) {
          req.resume();
          reject(error);
        } else resolveBody(Buffer.concat(chunks, size));
      };
      const data = (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > FEEDBACK_LIMITS.requestBytes)
          return finish(new IntakeError(413, "request-too-large"));
        chunks.push(bytes);
      };
      const end = () => finish(),
        failure = () => finish(new IntakeError(400, "invalid-request")),
        aborted = () => finish(new IntakeError(400, "request-aborted"));
      cancellations.add(cancel);
      req.on("data", data);
      req.on("end", end);
      req.on("error", failure);
      req.on("aborted", aborted);
    });
  }
  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> {
    if (!req.url?.split("?")[0].startsWith("/api/feedback")) return false;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const reply = (status: number, value?: unknown) => {
      if (!res.destroyed)
        res
          .writeHead(status)
          .end(value === undefined ? undefined : JSON.stringify(value));
      return true;
    };
    try {
      if (req.url !== "/api/feedback")
        return reply(404, { error: "not-found" });
      if (!["POST", "OPTIONS"].includes(req.method ?? ""))
        return reply(405, { error: "method-not-allowed" });
      const origin = permittedOrigin(req);
      if (!origin) return reply(403, { error: "origin-rejected" });
      res.setHeader("Access-Control-Allow-Origin", origin);
      if (req.method === "OPTIONS") {
        if (
          req.headers["access-control-request-method"] &&
          req.headers["access-control-request-method"] !== "POST"
        )
          return reply(403, { error: "origin-rejected" });
        const headers = req.headers["access-control-request-headers"];
        if (
          typeof headers === "string" &&
          headers
            .split(",")
            .some((header) => header.trim().toLowerCase() !== "content-type")
        )
          return reply(403, { error: "origin-rejected" });
        res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        return reply(204);
      }
      if (closed) throw new IntakeError(503, "service-closing");
      if (active.size >= (options.limits?.maxActiveRequests ?? 4))
        throw new IntakeError(503, "service-busy");
      checkRate(req);
      const contentType = req.headers["content-type"] ?? "";
      if (
        !/^multipart\/form-data\s*;/i.test(contentType) ||
        contentType.length > 200
      )
        throw new IntakeError(415, "multipart-required");
      const length = req.headers["content-length"];
      if (
        length &&
        (!/^\d+$/.test(length) || Number(length) > FEEDBACK_LIMITS.requestBytes)
      )
        throw new IntakeError(413, "request-too-large");
      const bytes = await readBody(req);
      let form: FormData;
      try {
        form = await new Response(new Uint8Array(bytes), {
          headers: { "Content-Type": contentType },
        }).formData();
      } catch {
        throw new IntakeError(400, "invalid-multipart");
      }
      const entries = [...form.entries()];
      if (
        entries.some(([key]) => !["metadata", "screenshot"].includes(key)) ||
        form.getAll("metadata").length !== 1 ||
        form.getAll("screenshot").length > 1
      )
        throw new IntakeError(400, "invalid-fields");
      const metadata = form.get("metadata"),
        file = form.get("screenshot");
      if (typeof metadata !== "string" || Buffer.byteLength(metadata) > 65536)
        throw new IntakeError(400, "invalid-metadata");
      let raw: unknown;
      try {
        raw = JSON.parse(metadata);
      } catch {
        throw new IntakeError(400, "invalid-metadata");
      }
      const validation = validateFeedbackReport(raw);
      if (!validation.ok) throw new IntakeError(400, validation.error);
      const report = validation.report;
      let image: FeedbackImage | undefined;
      if (report.capture.state === "ready") {
        if (
          !(file instanceof Blob) ||
          file.size <= 0 ||
          file.size > FEEDBACK_LIMITS.imageBytes
        )
          throw new IntakeError(
            file instanceof Blob && file.size > FEEDBACK_LIMITS.imageBytes
              ? 413
              : 400,
            "invalid-image",
          );
        if (file.type !== report.capture.mimeType)
          throw new IntakeError(400, "image-metadata-mismatch");
        const imageBytes = Buffer.from(await file.arrayBuffer()),
          dimensions = imageSize(imageBytes, file.type);
        if (
          !dimensions ||
          dimensions.width <= 0 ||
          dimensions.height <= 0 ||
          dimensions.width * dimensions.height > FEEDBACK_LIMITS.imagePixels ||
          dimensions.width !== report.capture.width ||
          dimensions.height !== report.capture.height
        )
          throw new IntakeError(400, "image-metadata-mismatch");
        image = { bytes: imageBytes, mimeType: file.type, ...dimensions };
      } else if (file !== null) throw new IntakeError(400, "unexpected-image");
      const receipt = await store.accept(report, image);
      void worker
        .flush()
        .catch(() => options.onDeliveryError?.("delivery-storage", report.id));
      return reply(202, receipt);
    } catch (error) {
      req.resume();
      if (error instanceof IntakeError) {
        if (error.status === 429) res.setHeader("Retry-After", "60");
        return reply(error.status, { error: error.code });
      }
      if (error instanceof FeedbackStoreError && error.code === "conflict")
        return reply(409, { error: "report-conflict" });
      return reply(503, {
        error:
          error instanceof FeedbackStoreError && error.code === "capacity"
            ? "feedback-capacity"
            : "feedback-unavailable",
      });
    }
  }
  return {
    handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const result = handle(req, res);
      active.add(result);
      void result.finally(() => active.delete(result)).catch(() => {});
      return result;
    },
    flush: () => worker.flush(),
    async close() {
      closed = true;
      clearInterval(timer);
      for (const cancel of cancellations) cancel();
      await worker.close();
      await Promise.allSettled([...active]);
      await store.close();
    },
  };
}
