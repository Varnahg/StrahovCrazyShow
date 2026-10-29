import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  appendFile,
  mkdir,
  open,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import {
  DIAGNOSTICS_SCHEMA_VERSION,
  DIAGNOSTICS_FLUSH_INTERVAL_MS,
  DIAGNOSTICS_DRAIN_THRESHOLD_BYTES,
  DIAGNOSTICS_CLIENT_BATCH_BYTES,
  MAX_DIAGNOSTICS_BATCH_BYTES,
  MAX_DIAGNOSTICS_RECORDS,
  validateDiagnosticsBatch,
  type DiagnosticsBatch,
} from "../shared/session-diagnostics";

const run = promisify(execFile);
const LOG_NAME = /^([a-f0-9-]{36})(?:\.part-\d{4,})?\.jsonl$/;
const SOURCE_SCOPE =
  "client/server/shared/scripts/tests source and project configuration; excludes binary assets, dependencies and local logs; non-atomic working-tree observation";
const sourceCache = new Map<
  string,
  { signature: string; contentSha256: string }
>();
export const SESSION_DIAGNOSTICS_POLICY = {
  maxBatchBytes: MAX_DIAGNOSTICS_BATCH_BYTES,
  maxBatchRecords: MAX_DIAGNOSTICS_RECORDS,
  flushIntervalMs: DIAGNOSTICS_FLUSH_INTERVAL_MS,
  flushThresholdBytes: DIAGNOSTICS_DRAIN_THRESHOLD_BYTES,
  clientBatchBytes: DIAGNOSTICS_CLIENT_BATCH_BYTES,
  retentionDays: 7,
  maxDiskBytes: 128 * 1024 * 1024,
  maxFileBytes: 16 * 1024 * 1024,
  maxFiles: 256,
  omissions:
    "No chat, profile, credentials or multiplayer presence API. Bounded client buffers and disk retention can discard old records; sequence gaps are reported.",
} as const;

export type DiagnosticsSource = {
  kind: "working-tree";
  gitHead: string | null;
  contentSha256: string;
  dirty: boolean | null;
  buildSnapshotId: string | null;
  capturedAtUTC: string;
  scope: string;
  files: number;
};

/** This identifies observed source files, never claims that a development tab
 * stayed immutable across HMR, or that binary model assets were hashed. */
export async function readDiagnosticsSource(
  cwd = process.cwd(),
  env = process.env,
): Promise<DiagnosticsSource> {
  const names: string[] = [];
  async function walk(folder: string) {
    const entries = await readdir(join(cwd, folder), {
      withFileTypes: true,
    }).catch(() => []);
    for (const entry of entries) {
      const name = `${folder}/${entry.name}`;
      if (entry.isDirectory()) await walk(name);
      else if (
        entry.isFile() &&
        /\.(?:[cm]?[jt]sx?|json|css|html)$/.test(entry.name)
      )
        names.push(name);
    }
  }
  for (const folder of ["client", "server", "shared", "scripts", "tests"])
    await walk(folder);
  for (const name of [
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.json",
    "vite.config.ts",
    "index.html",
  ])
    if (
      await stat(join(cwd, name)).then(
        (s) => s.isFile(),
        () => false,
      )
    )
      names.push(name);
  names.sort();
  const signature = createHash("sha256");
  for (const name of names) {
    const info = await stat(join(cwd, name));
    signature.update(`${name}\0${info.size}\0${info.mtimeMs}\0`);
  }
  const stamp = signature.digest("hex");
  let cached = sourceCache.get(cwd);
  if (!cached || cached.signature !== stamp) {
    const digest = createHash("sha256");
    for (const name of names) {
      digest.update(name + "\0");
      for await (const bytes of createReadStream(join(cwd, name)))
        digest.update(bytes);
      digest.update("\0");
    }
    cached = { signature: stamp, contentSha256: digest.digest("hex") };
    sourceCache.set(cwd, cached);
    if (sourceCache.size > 4)
      sourceCache.delete(sourceCache.keys().next().value!);
  }
  const [head, dirty] = await Promise.all([
    run("git", ["rev-parse", "HEAD"], { cwd, windowsHide: true }).then(
      (r) => r.stdout.trim(),
      () => null,
    ),
    run("git", ["status", "--porcelain", "--untracked-files=normal"], {
      cwd,
      windowsHide: true,
    }).then(
      (r) => !!r.stdout.trim(),
      () => null,
    ),
  ]);
  return {
    kind: "working-tree",
    gitHead: head && /^[a-f0-9]{40,64}$/.test(head) ? head : null,
    contentSha256: cached.contentSha256,
    dirty,
    buildSnapshotId: /^[a-f0-9]{64}$/.test(env.STRAHOV_SOURCE_SNAPSHOT_ID ?? "")
      ? env.STRAHOV_SOURCE_SNAPSHOT_ID!
      : null,
    capturedAtUTC: new Date().toISOString(),
    scope: SOURCE_SCOPE,
    files: names.length,
  };
}

const loopback = (value?: string) =>
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(value ?? "");
function localRequestOrigin(req: IncomingMessage) {
  if (!loopback(req.socket.localAddress) || !loopback(req.socket.remoteAddress))
    return null;
  if (req.headers["sec-fetch-site"] === "cross-site") return null;
  try {
    const host = new URL(`http://${req.headers.host ?? ""}`);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(host.hostname) ||
      host.username ||
      host.password ||
      host.pathname !== "/"
    )
      return null;
    const candidate =
      req.headers.origin ??
      (req.method === "GET" ? new URL(req.headers.referer ?? "").origin : "");
    const origin = new URL(candidate);
    if (origin.origin !== candidate || origin.origin !== host.origin)
      return null;
    return origin.origin;
  } catch {
    return null;
  }
}

type StoredBatch = {
  type: "batch";
  schemaVersion: number;
  sessionId: string;
  batchId: number;
  digest: string;
  receivedAtUTC: string;
  source: DiagnosticsSource;
  records: DiagnosticsBatch["records"];
};
type LogFile = { name: string; size: number; modified: number };

async function logFiles(directory: string): Promise<LogFile[]> {
  const files: LogFile[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true }).catch(
    () => [],
  )) {
    if (!entry.isFile() || !LOG_NAME.test(entry.name)) continue;
    const info = await stat(join(directory, entry.name));
    files.push({ name: entry.name, size: info.size, modified: info.mtimeMs });
  }
  return files.sort(
    (a, b) => a.modified - b.modified || a.name.localeCompare(b.name),
  );
}

/** Writes are serialized across sessions, so retries, rotation and retention
 * cannot race each other. Only this module's UUID JSONL files are removed. */
export function createSessionDiagnosticsHandler(options: {
  listenHost: string;
  directory?: string;
  cwd?: string;
  now?: () => number;
  source?: () => Promise<DiagnosticsSource>;
  policy?: {
    maxDiskBytes?: number;
    maxFileBytes?: number;
    maxFiles?: number;
    retentionDays?: number;
  };
}) {
  const cwd = options.cwd ?? process.cwd(),
    directory = resolve(
      options.directory ?? join(cwd, ".cache/game-diagnostics"),
    );
  const now = options.now ?? Date.now;
  const policy = { ...SESSION_DIAGNOSTICS_POLICY, ...options.policy };
  const enabled = loopback(options.listenHost);
  let queue = Promise.resolve(),
    queued = 0;
  let source: Promise<DiagnosticsSource> | undefined,
    sourceAt = -Infinity;
  const getSource = () => {
    if (!source || now() - sourceAt > 30000) {
      sourceAt = now();
      source = (options.source ?? (() => readDiagnosticsSource(cwd)))().catch(
        (error) => {
          source = undefined;
          throw error;
        },
      );
    }
    return source;
  };
  const attempts: number[] = [];
  const recent = new Map<
    string,
    { batchId: number; digest: string; lastSeq: number; savedAt: string }
  >();
  let removedFiles = 0;

  async function persist(batch: DiagnosticsBatch) {
    const digest = createHash("sha256")
      .update(JSON.stringify(batch))
      .digest("hex");
    const ack = (duplicate: boolean, savedAt: string, lastSeq: number) => ({
      ok: true,
      saved: true,
      duplicate,
      sessionId: batch.sessionId,
      batchId: batch.batchId,
      lastSeq,
      savedAt,
    });
    const last = recent.get(batch.sessionId);
    if (last?.batchId === batch.batchId) {
      if (last.digest !== digest)
        return { status: 409, body: { error: "Conflicting batch retry" } };
      return { status: 200, body: ack(true, last.savedAt, last.lastSeq) };
    }
    await mkdir(directory, { recursive: true });
    const files = await logFiles(directory);
    const own = files.filter((file) => file.name.startsWith(batch.sessionId));
    let highestBatch = last?.batchId ?? -1,
      highestSeq = last?.lastSeq ?? -1;
    // On restart or an old retry, recover exactly the persisted acknowledgements.
    if (!last || batch.batchId < last.batchId) {
      for (const file of own) {
        const lines = createInterface({
          input: createReadStream(join(directory, file.name)),
          crlfDelay: Infinity,
        });
        for await (const line of lines) {
          let row: StoredBatch;
          try {
            row = JSON.parse(line);
          } catch {
            continue;
          }
          if (row.type !== "batch" || !Array.isArray(row.records)) continue;
          highestBatch = Math.max(highestBatch, row.batchId);
          highestSeq = Math.max(
            highestSeq,
            ...row.records.map((record) => record.seq),
          );
          if (row.batchId === batch.batchId) {
            if (row.digest !== digest)
              return {
                status: 409,
                body: { error: "Conflicting batch retry" },
              };
            return {
              status: 200,
              body: ack(
                true,
                row.receivedAtUTC,
                Math.max(...row.records.map((record) => record.seq)),
              ),
            };
          }
        }
      }
    }
    if (batch.batchId <= highestBatch || batch.records[0].seq <= highestSeq)
      return {
        status: 409,
        body: { error: "Out-of-order batch or record sequence" },
      };
    const savedAt = new Date(now()).toISOString();
    const row: StoredBatch = {
      type: "batch",
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      sessionId: batch.sessionId,
      batchId: batch.batchId,
      digest,
      receivedAtUTC: savedAt,
      source: await getSource(),
      records: batch.records,
    };
    const newest = own.sort((a, b) => a.name.localeCompare(b.name)).at(-1);
    let part = newest
      ? Number(/\.part-(\d+)\.jsonl$/.exec(newest.name)?.[1] ?? 0)
      : 0;
    const encoded = JSON.stringify(row) + "\n";
    if (
      newest &&
      newest.size + Buffer.byteLength(encoded) > policy.maxFileBytes
    )
      part++;
    const name = `${batch.sessionId}${part ? `.part-${String(part).padStart(4, "0")}` : ""}.jsonl`;
    const target = join(directory, name);
    const isNew = !files.some((file) => file.name === name);
    let prefix = isNew
      ? JSON.stringify({
          type: "session-log",
          schemaVersion: 1,
          sessionId: batch.sessionId,
          receivedAtUTC: savedAt,
          source: row.source,
          policy,
          part,
          retentionRemovedFiles: removedFiles,
        }) + "\n"
      : "";
    if (!isNew) {
      // A killed append can leave a tail. Keep it as evidence but separate the
      // next valid JSON line so the reporter can recover subsequent batches.
      const handle = await open(target, "r");
      try {
        const size = (await handle.stat()).size;
        if (size) {
          const byte = Buffer.alloc(1);
          await handle.read(byte, 0, 1, size - 1);
          if (byte[0] !== 10) prefix = "\n";
        }
      } finally {
        await handle.close();
      }
    }
    const incoming = Buffer.byteLength(prefix) + Buffer.byteLength(encoded);
    let total = files.reduce((sum, file) => sum + file.size, 0);
    let count = files.length + Number(isNew);
    for (const file of files) {
      if (file.name === name) continue;
      if (
        now() - file.modified <= policy.retentionDays * 86400000 &&
        total + incoming <= policy.maxDiskBytes &&
        count <= policy.maxFiles
      )
        continue;
      await unlink(join(directory, file.name));
      total -= file.size;
      count--;
      removedFiles++;
    }
    if (total + incoming > policy.maxDiskBytes)
      return { status: 507, body: { error: "Diagnostic disk budget reached" } };
    await appendFile(target, prefix + encoded, {
      encoding: "utf8",
      flush: true,
    });
    recent.delete(batch.sessionId);
    recent.set(batch.sessionId, {
      batchId: batch.batchId,
      digest,
      lastSeq: batch.records.at(-1)!.seq,
      savedAt,
    });
    if (recent.size > 64) recent.delete(recent.keys().next().value!);
    return {
      status: 201,
      body: ack(false, savedAt, batch.records.at(-1)!.seq),
    };
  }

  return async (
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<boolean> => {
    if (!req.url?.startsWith("/api/diagnostics/session")) return false;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Origin");
    const reply = (status: number, body: object) => {
      res.writeHead(status).end(JSON.stringify(body));
      return true;
    };
    if (!enabled) return reply(404, { error: "Not found" });
    const origin = localRequestOrigin(req);
    if (!origin)
      return reply(403, { error: "Same-origin local diagnostics only" });
    res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.url === "/api/diagnostics/session/status" && req.method === "GET") {
      try {
        const current = await getSource();
        return reply(200, {
          enabled: true,
          schemaVersion: 1,
          sourceId: current.contentSha256,
          source: current,
          policy,
        });
      } catch {
        return reply(503, { error: "Source identity unavailable" });
      }
    }
    if (req.url !== "/api/diagnostics/session" || req.method !== "POST")
      return reply(404, { error: "Not found" });
    if (
      !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
        req.headers["content-type"] ?? "",
      )
    )
      return reply(415, { error: "JSON required" });
    while (attempts.length && now() - attempts[0] >= 60000) attempts.shift();
    if (attempts.length >= 120 || queued >= 16)
      return reply(429, { error: "Diagnostic queue is busy" });
    attempts.push(now());
    if (
      Number(req.headers["content-length"] ?? 0) > MAX_DIAGNOSTICS_BATCH_BYTES
    ) {
      req.resume();
      return reply(413, { error: "Batch too large" });
    }
    let batch: DiagnosticsBatch | null;
    try {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > MAX_DIAGNOSTICS_BATCH_BYTES) {
          req.resume();
          return reply(413, { error: "Batch too large" });
        }
        chunks.push(Buffer.from(chunk));
      }
      batch = validateDiagnosticsBatch(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
    } catch {
      return reply(400, { error: "Invalid diagnostic batch" });
    }
    if (!batch) return reply(400, { error: "Invalid diagnostic batch" });
    queued++;
    const result = queue.then(() => persist(batch!));
    queue = result.then(
      () => {},
      () => {},
    );
    try {
      const saved = await result;
      return reply(saved.status, saved.body);
    } catch {
      return reply(500, { error: "Local diagnostic write failed" });
    } finally {
      queued--;
    }
  };
}
