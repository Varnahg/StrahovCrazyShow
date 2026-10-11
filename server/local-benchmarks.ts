import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rename, rm } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { projectLocalBenchmark } from "../shared/local-benchmark";

const MAX_BYTES = 256 * 1024;
const loopback = (address?: string) =>
  address === "127.0.0.1" || address === "::ffff:127.0.0.1";
export function createLocalBenchmarkHandler(options: {
  env?: NodeJS.ProcessEnv;
  listenHost: string;
  now?: () => number;
}) {
  const env = options.env ?? process.env,
    now = options.now ?? Date.now;
  const directory = env.STRAHOV_LOCAL_BENCHMARK_DIR;
  const sourceSnapshotId = env.STRAHOV_SOURCE_SNAPSHOT_ID;
  let origin: string | undefined;
  try {
    const url = new URL(env.STRAHOV_LOCAL_BENCHMARK_ORIGIN ?? "");
    if (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      url.port === "4179" &&
      url.origin === env.STRAHOV_LOCAL_BENCHMARK_ORIGIN
    )
      origin = url.origin;
  } catch {}
  const enabled =
    options.listenHost === "127.0.0.1" &&
    !!directory &&
    isAbsolute(directory) &&
    !!sourceSnapshotId &&
    /^[a-f0-9]{64}$/.test(sourceSnapshotId) &&
    !!origin;
  const attempts: number[] = [];
  return async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> => {
    if (!req.url?.startsWith("/api/diagnostics/")) return false;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    const reply = (status: number, body: object) => {
      res.writeHead(status).end(JSON.stringify(body));
      return true;
    };
    if (!enabled) return reply(404, { error: "Not found" });
    if (
      !loopback(req.socket.localAddress) ||
      !loopback(req.socket.remoteAddress)
    )
      return reply(403, { error: "Local diagnostics only" });
    // Same-origin GET fetch omits Origin; its browser Referer still identifies
    // the configured page. POST and preflight always require exact Origin.
    let requestOrigin = req.headers.origin;
    if (!requestOrigin && req.method === "GET") {
      try {
        requestOrigin = new URL(req.headers.referer ?? "").origin;
      } catch {}
    }
    if (requestOrigin !== origin)
      return reply(403, { error: "Origin rejected" });
    res.setHeader("Access-Control-Allow-Origin", origin!);
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return reply(204, {});
    if (req.url === "/api/diagnostics/status" && req.method === "GET")
      return reply(200, {
        enabled: true,
        sourceSnapshotId,
        mode: "local-user-triggered-benchmark",
      });
    if (req.url !== "/api/diagnostics/benchmark" || req.method !== "POST")
      return reply(404, { error: "Not found" });
    const instant = now();
    while (attempts.length && instant - attempts[0] >= 60000) attempts.shift();
    if (attempts.length >= 3)
      return reply(429, { error: "Try again in one minute" });
    attempts.push(instant);
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        req.headers["content-type"] ?? "",
      )
    )
      return reply(415, { error: "JSON required" });
    if (Number(req.headers["content-length"] ?? 0) > MAX_BYTES) {
      req.resume();
      return reply(413, { error: "Body too large" });
    }
    let temp: string | undefined;
    try {
      const bytes = await new Promise<Buffer>((done, reject) => {
        const chunks: Buffer[] = [];
        let size = 0,
          failed = false;
        req.on("data", (chunk) => {
          size += Buffer.byteLength(chunk);
          if (size > MAX_BYTES) {
            failed = true;
            reject(new Error("size"));
            return;
          }
          if (!failed) chunks.push(Buffer.from(chunk));
        });
        req.on("end", () => {
          if (!failed) done(Buffer.concat(chunks));
        });
        req.on("error", reject);
        req.on("aborted", () => reject(new Error("aborted")));
      });
      const raw = JSON.parse(bytes.toString("utf8"));
      if (raw?.sourceSnapshotId !== sourceSnapshotId)
        return reply(409, { error: "Source snapshot mismatch" });
      if (
        [
          "filename",
          "path",
          "directory",
          "modelReview",
          "playerId",
          "nickname",
          "chat",
        ].some((key) => Object.hasOwn(raw, key))
      )
        return reply(400, { error: "Unsupported personal or file data" });
      const benchmark = projectLocalBenchmark(raw);
      const receivedAtUTC = new Date(instant).toISOString();
      const record = {
        mode: "local-user-triggered-benchmark",
        receivedAtUTC,
        sourceSnapshotId,
        benchmark,
      };
      const folder = resolve(directory!),
        name = randomUUID();
      await mkdir(folder, { recursive: true });
      temp = join(folder, `${name}.tmp`);
      await writeFile(temp, JSON.stringify(record, null, 2) + "\n", {
        flag: "wx",
      });
      await rename(temp, join(folder, `${name}.json`));
      temp = undefined;
      return reply(201, { saved: true, receivedAtUTC, sourceSnapshotId });
    } catch (error) {
      if (temp) await rm(temp, { force: true }).catch(() => {});
      if (typeof (error as NodeJS.ErrnoException)?.code === "string")
        return reply(500, { error: "Local write failed" });
      return reply(
        error instanceof Error && error.message === "size" ? 413 : 400,
        { error: "Invalid benchmark" },
      );
    }
  };
}
