import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, mkdir, open, readFile, readdir, rename, unlink, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, join, parse, resolve } from "node:path";
import { copyPlaytestIdentity, copyPlaytestRefs, copyPlaytestSourceIdentity, copyPlaytestFrameSample, type PlaytestArtifactReceipt, type PlaytestCaptureMetadata } from "../shared/playtest-diary";

const PREFIX = "/api/playtest/artifacts";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[0-9a-f]{64}$/;
const HEADER_BYTES = 12 * 1024;
export const PLAYTEST_ARTIFACT_POLICY = Object.freeze({
  retentionDays: 7,
  maxDiskBytes: 2 * 1024 ** 3,
  maxRunBytes: 512 * 1024 ** 2,
  maxArtifactBytes: 32 * 1024 ** 2,
  maxQueued: 8,
  receiveTimeoutMs: 15000,
});
type Policy = typeof PLAYTEST_ARTIFACT_POLICY;
type Stored = { metadata: PlaytestCaptureMetadata; receipt: PlaytestArtifactReceipt };
type FileEntry = { path: string; name: string; bytes: number; modified: number; runId: string };
const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);
const text = (value: unknown, max = 160) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f]/.test(value);
const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const loopback = (address?: string) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(address ?? "");

function localOrigin(req: IncomingMessage) {
  if (!loopback(req.socket.localAddress) || !loopback(req.socket.remoteAddress)) return null;
  if (req.headers["sec-fetch-site"] === "cross-site") return null;
  try {
    const host = new URL(`http://${req.headers.host ?? ""}`);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host.hostname) || host.username || host.password || host.pathname !== "/") return null;
    const value = req.headers.origin ?? (req.method === "GET" ? new URL(req.headers.referer ?? "").origin : "");
    const origin = new URL(value);
    return origin.origin === value && origin.origin === host.origin ? origin.origin : null;
  } catch { return null; }
}

/** No user strings become paths. Check every existing ancestor before creating
 * a directory, so a junction/symlink cannot redirect either writes or pruning. */
async function plainDirectory(path: string) {
  const absolute = resolve(path), root = parse(absolute).root;
  let current = root;
  for (const component of absolute.slice(root.length).split(/[\\/]/).filter(Boolean)) {
    current = join(current, component);
    let info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
      return null;
    });
    if (!info) {
      await mkdir(current).catch((error: NodeJS.ErrnoException) => { if (error.code !== "EEXIST") throw error; });
      info = await lstat(current);
    }
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Artifact directory is not a plain directory");
  }
}
async function plainFile(path: string) {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return null;
  });
  if (info && (!info.isFile() || info.isSymbolicLink())) throw new Error("Artifact is not a plain file");
  return info;
}

/** Only known technical fields are accepted; arbitrary nested payloads are not
 * admitted even though the outer HTTP metadata has a byte bound. */
export function validatePlaytestCaptureMetadata(value: unknown): PlaytestCaptureMetadata | null {
  if (!record(value) || value.diaryVersion !== 1) return null;
  const topKeys = new Set(["diaryVersion", "sessionId", "runId", "gameInstanceId", "refs", "artifactId", "requestId", "reason", "phase", "requestedAtMs", "captureStartedAtMs", "capturedAtMs", "capturedAtUTC", "frame", "source", "mimeType", "width", "height", "sourceWidth", "sourceHeight", "copyMs", "burstId", "burstIndex"]);
  if (Object.keys(value).some((key) => !topKeys.has(key))) return null;
  if (!copyPlaytestIdentity(value) || !copyPlaytestRefs(value.refs) || !copyPlaytestSourceIdentity(value.source) || !copyPlaytestFrameSample(value.frame)) return null;
  for (const key of ["runId", "artifactId", "requestId"]) if (!text(value[key]) || !UUID.test(value[key] as string)) return null;
  if (!text(value.reason, 80) || !/^[a-z][a-z0-9.-]*$/.test(value.reason as string)) return null;
  if (value.phase !== undefined && !["off-before", "on", "off-after"].includes(value.phase as string)) return null;
  if (!record(value.refs) || Object.entries(value.refs).some(([key, item]) =>
    !["connectionId", "scenarioId", "scenarioVersion", "stepId", "actionId", "incidentId"].includes(key) || !(item === null || text(item, 160)))) return null;
  if (value.burstId !== undefined && (!text(value.burstId) || !UUID.test(value.burstId as string))) return null;
  if (value.burstIndex !== undefined && (!Number.isInteger(value.burstIndex) || (value.burstIndex as number) < 0 || (value.burstIndex as number) >= 16)) return null;
  for (const key of ["requestedAtMs", "captureStartedAtMs", "capturedAtMs", "copyMs"]) if (!finite(value[key]) || (value[key] as number) < 0) return null;
  if ((value.requestedAtMs as number) > (value.captureStartedAtMs as number) || (value.captureStartedAtMs as number) > (value.capturedAtMs as number)) return null;
  if (!text(value.capturedAtUTC, 40) || !Number.isFinite(Date.parse(value.capturedAtUTC as string))) return null;
  if (!["image/webp", "image/png"].includes(value.mimeType as string)) return null;
  for (const key of ["width", "height", "sourceWidth", "sourceHeight"]) if (!Number.isInteger(value[key]) || (value[key] as number) < 1 || (value[key] as number) > 32768) return null;
  if ((value.width as number) > (value.sourceWidth as number) || (value.height as number) > (value.sourceHeight as number)) return null;
  if (value.mimeType === "image/webp" && Math.max(value.width as number, value.height as number) > 1280) return null;
  if (value.mimeType === "image/png" && (value.width !== value.sourceWidth || value.height !== value.sourceHeight)) return null;
  if (!record(value.source) || Object.entries(value.source).some(([key, item]) =>
    !["sourceSnapshotId", "sourceId", "gitHead", "assetSnapshotId", "assetSnapshotScope", "sourceSnapshotScope"].includes(key) || !(item === null || text(item, 512)))) return null;
  if (!record(value.frame)) return null;
  const frame = value.frame;
  const frameKeys = new Set(["frameId", "frameStartedAtMs", "renderCompletedAtMs", "frameMs", "utcMs", "position", "actorYaw", "speed", "vehicle", "renderPosition", "camera", "rendering", "lighting", "flashlight", "zone"]);
  if (Object.keys(frame).some((key) => !frameKeys.has(key))) return null;
  for (const key of ["frameId", "frameStartedAtMs", "renderCompletedAtMs", "frameMs", "utcMs", "actorYaw", "speed"]) if (!finite(frame[key])) return null;
  if (!Number.isSafeInteger(frame.frameId) || (frame.frameId as number) < 0 || (frame.frameStartedAtMs as number) > (frame.renderCompletedAtMs as number) || (frame.renderCompletedAtMs as number) > (value.captureStartedAtMs as number)) return null;
  const vector = (item: unknown) => record(item) && Object.keys(item).length === 3 && ["x", "y", "z"].every((key) => finite(item[key]));
  if (!vector(frame.position) || !vector(frame.renderPosition) || typeof frame.vehicle !== "boolean" || typeof frame.flashlight !== "boolean" || !text(frame.zone, 160)) return null;
  if (!record(frame.camera) || Object.keys(frame.camera).some((key) => !["position", "yaw", "pitch", "firstPerson", "fov", "viewMatrix", "projectionMatrix"].includes(key))) return null;
  const camera = frame.camera;
  if (!vector(camera.position) || !["yaw", "pitch", "fov"].every((key) => finite(camera[key])) || typeof camera.firstPerson !== "boolean") return null;
  for (const key of ["viewMatrix", "projectionMatrix"]) if (!Array.isArray(camera[key]) || camera[key].length !== 16 || !camera[key].every(finite)) return null;
  if (!record(frame.rendering) || Object.keys(frame.rendering).some((key) => !["qualityMode", "quality", "hardwareScaling", "cssWidth", "cssHeight", "renderWidth", "renderHeight", "dpr"].includes(key))) return null;
  const rendering = frame.rendering;
  if (!["low", "medium", "high", "auto"].includes(rendering.qualityMode as string) || !["low", "medium", "high"].includes(rendering.quality as string)) return null;
  if (!["hardwareScaling", "cssWidth", "cssHeight", "renderWidth", "renderHeight", "dpr"].every((key) => finite(rendering[key]) && (rendering[key] as number) > 0)) return null;
  if (rendering.renderWidth !== value.sourceWidth || rendering.renderHeight !== value.sourceHeight) return null;
  if (!record(frame.lighting) || Object.keys(frame.lighting).some((key) => !["mode", "instantUtcMs"].includes(key)) || !text(frame.lighting.mode, 80) || !finite(frame.lighting.instantUtcMs)) return null;
  return value as unknown as PlaytestCaptureMetadata;
}

function dimensions(bytes: Buffer, mime: string): { width: number; height: number } | null {
  if (mime === "image/png") {
    if (bytes.length < 24 || !bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString("ascii", 12, 16) !== "IHDR") return null;
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  }
  if (bytes.length < 30 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") return null;
  const kind = bytes.toString("ascii", 12, 16);
  if (kind === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  if (kind === "VP8 " && bytes[23] === 0x9d && bytes[24] === 1 && bytes[25] === 0x2a) return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L" && bytes[20] === 0x2f) return { width: 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]), height: 1 + (((bytes[24] & 15) << 10) | (bytes[23] << 2) | (bytes[22] >> 6)) };
  return null;
}

async function inventory(directory: string): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];
  for (const run of await readdir(directory, { withFileTypes: true })) {
    if (!UUID.test(run.name) || !run.isDirectory() || run.isSymbolicLink()) continue;
    const runPath = join(directory, run.name);
    for (const item of await readdir(runPath, { withFileTypes: true })) {
      if (!item.isFile() || item.isSymbolicLink() || !/^[0-9a-f-]{36}\.(?:png|webp|json)$/i.test(item.name) || !UUID.test(item.name.slice(0, 36))) continue;
      const path = join(runPath, item.name), info = await plainFile(path);
      if (info) entries.push({ path, name: item.name, bytes: info.size, modified: info.mtimeMs, runId: run.name });
    }
  }
  return entries;
}

export function createPlaytestArtifactsHandler(options: { listenHost: string; directory?: string; now?: () => number; policy?: Partial<Policy> }) {
  const directory = resolve(options.directory ?? join(process.cwd(), ".cache/playtest-artifacts"));
  const now = options.now ?? Date.now;
  const policy = { ...PLAYTEST_ARTIFACT_POLICY, ...options.policy };
  const enabled = loopback(options.listenHost);
  let queue = Promise.resolve(), queued = 0;
  const serial = <T>(job: () => Promise<T>) => {
    const result = queue.then(job);
    queue = result.then(() => {}, () => {});
    return result;
  };
  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (!req.url?.startsWith(PREFIX)) return false;
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Vary", "Origin");
    const reply = (status: number, body: object) => {
      if (!res.writableEnded && !res.destroyed) res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      return true;
    };
    if (!enabled) return reply(404, { error: "Not found" });
    if (!localOrigin(req)) return reply(403, { error: "Same-origin local playtest artifacts only" });
    if (req.url === `${PREFIX}/status` && req.method === "GET") return reply(200, { enabled: true, diaryVersion: 1, policy, maxMetadataHeaderBytes: HEADER_BYTES });
    const match = new RegExp(`^${PREFIX}/([^/]+)/([^/]+)$`).exec(req.url);
    if (!match || !UUID.test(match[1]) || !UUID.test(match[2])) return reply(404, { error: "Not found" });
    const [, runId, artifactId] = match;
    const runPath = join(directory, runId), manifestPath = join(runPath, `${artifactId}.json`);
    if (req.method === "GET") {
      try {
        return await serial(async () => {
          await plainDirectory(directory);
          const runInfo = await lstat(runPath).catch(() => null);
          if (!runInfo?.isDirectory() || runInfo.isSymbolicLink() || !await plainFile(manifestPath)) return reply(404, { error: "Not found" });
          const stored = JSON.parse(await readFile(manifestPath, "utf8")) as Stored;
          if (!validatePlaytestCaptureMetadata(stored.metadata) || stored.metadata.runId !== runId || stored.metadata.artifactId !== artifactId) return reply(404, { error: "Not found" });
          const extension = stored.metadata.mimeType === "image/png" ? "png" : "webp";
          const key = `${runId}/${artifactId}.${extension}`;
          if (stored.receipt.storageKey !== key || !SHA.test(stored.receipt.sha256)) return reply(404, { error: "Not found" });
          const file = join(runPath, `${artifactId}.${extension}`), info = await plainFile(file);
          if (!info || info.size !== stored.receipt.bytes || info.size > policy.maxArtifactBytes) return reply(404, { error: "Not found" });
          const data = await readFile(file);
          if (createHash("sha256").update(data).digest("hex") !== stored.receipt.sha256) return reply(409, { error: "Artifact integrity mismatch" });
          res.writeHead(200, { "Content-Type": stored.metadata.mimeType, "Content-Length": data.length }).end(data);
          return true;
        });
      } catch { return reply(404, { error: "Not found" }); }
    }
    if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
    const rawHeader = req.headers["x-playtest-metadata"], expectedHash = req.headers["x-playtest-sha256"];
    let metadata: PlaytestCaptureMetadata | null = null;
    try {
      if (typeof rawHeader !== "string" || Buffer.byteLength(rawHeader) > HEADER_BYTES || !/^[A-Za-z0-9+/]*={0,2}$/.test(rawHeader)) throw new Error();
      const raw = Buffer.from(rawHeader, "base64");
      if (raw.toString("base64") !== rawHeader || raw.length > HEADER_BYTES) throw new Error();
      metadata = validatePlaytestCaptureMetadata(JSON.parse(raw.toString("utf8")));
    } catch { /* Reject below without touching storage. */ }
    if (!metadata || metadata.runId !== runId || metadata.artifactId !== artifactId || typeof expectedHash !== "string" || !SHA.test(expectedHash)) { req.resume(); return reply(400, { error: "Invalid artifact metadata" }); }
    if (req.headers["content-type"] !== metadata.mimeType) { req.resume(); return reply(415, { error: "Image MIME mismatch" }); }
    if (Number(req.headers["content-length"] ?? 0) > policy.maxArtifactBytes) { req.resume(); return reply(413, { error: "Artifact too large" }); }
    if (queued >= policy.maxQueued) { req.resume(); res.setHeader("Retry-After", "1"); return reply(429, { error: "Artifact queue busy" }); }
    queued++;
    try {
      return await serial(async () => {
        await plainDirectory(runPath);
        const temp = join(runPath, `${artifactId}.upload-${randomUUID()}.tmp`);
        const handle = await open(temp, "wx");
        const hash = createHash("sha256");
        let size = 0, prefix = Buffer.alloc(0), failed = false;
        const timeout = setTimeout(() => req.destroy(new Error("Artifact receive timeout")), policy.receiveTimeoutMs);
        try {
          for await (const piece of req) {
            const chunk = Buffer.from(piece);
            size += chunk.length;
            if (size > policy.maxArtifactBytes) { req.resume(); failed = true; return reply(413, { error: "Artifact too large" }); }
            if (prefix.length < 32) prefix = Buffer.concat([prefix, chunk.subarray(0, 32 - prefix.length)]);
            hash.update(chunk);
            await handle.writeFile(chunk);
          }
          const digest = hash.digest("hex"), actual = dimensions(prefix, metadata!.mimeType);
          if (!size || digest !== expectedHash || actual?.width !== metadata!.width || actual?.height !== metadata!.height) { failed = true; return reply(400, { error: "Artifact hash or image header mismatch" }); }
          await handle.sync();
          await handle.close();
          if (await plainFile(manifestPath)) {
            const stored = JSON.parse(await readFile(manifestPath, "utf8")) as Stored;
            if (stored.receipt?.sha256 !== digest || stored.receipt.bytes !== size || JSON.stringify(stored.metadata) !== JSON.stringify(metadata)) return reply(409, { error: "Artifact ID already has different content" });
            return reply(200, { saved: true, duplicate: true, ...stored.receipt });
          }
          const extension = metadata!.mimeType === "image/png" ? "png" : "webp";
          const receipt: PlaytestArtifactReceipt = { artifactId, storageKey: `${runId}/${artifactId}.${extension}`, sha256: digest, bytes: size, savedAtUTC: new Date(now()).toISOString() };
          const manifest = JSON.stringify({ metadata, receipt });
          const files = await inventory(directory);
          // Prune whole older runs, keeping image/receipt pairs together. Never
          // silently evict the run being written to make its own quota fit.
          let total = files.reduce((sum, file) => sum + file.bytes, 0);
          const own = files.filter((file) => file.runId === runId).reduce((sum, file) => sum + file.bytes, 0);
          const incoming = size + Buffer.byteLength(manifest);
          if (own + incoming > policy.maxRunBytes) return reply(507, { error: "Run artifact budget reached" });
          const oldRuns = new Map<string, { modified: number; files: FileEntry[] }>();
          for (const file of files) {
            if (file.runId === runId) continue;
            let run = oldRuns.get(file.runId);
            if (!run) oldRuns.set(file.runId, run = { modified: 0, files: [] });
            run.modified = Math.max(run.modified, file.modified); run.files.push(file);
          }
          for (const run of [...oldRuns.values()].sort((a, b) => a.modified - b.modified)) {
            if (now() - run.modified <= policy.retentionDays * 86400000 && total + incoming <= policy.maxDiskBytes) continue;
            for (const file of run.files) { await plainFile(file.path); await unlink(file.path); total -= file.bytes; }
          }
          if (total + incoming > policy.maxDiskBytes) return reply(507, { error: "Artifact disk budget reached" });
          const destination = join(runPath, `${artifactId}.${extension}`);
          if (await plainFile(destination)) {
            const prior = createHash("sha256");
            for await (const bytes of createReadStream(destination)) prior.update(bytes);
            if (prior.digest("hex") !== digest) return reply(409, { error: "Unfinished artifact has different content" });
          } else await rename(temp, destination);
          const manifestTemp = join(dirname(manifestPath), `${artifactId}.manifest-${randomUUID()}.tmp`);
          try { await writeFile(manifestTemp, manifest, { flag: "wx", flush: true }); await rename(manifestTemp, manifestPath); }
          finally { await unlink(manifestTemp).catch(() => {}); }
          return reply(201, { saved: true, duplicate: false, ...receipt });
        } catch { failed = true; return reply(400, { error: "Artifact upload interrupted" }); }
        finally { clearTimeout(timeout); await handle.close().catch(() => {}); await unlink(temp).catch(() => {}); if (failed) req.resume(); }
      });
    } catch { return reply(500, { error: "Local artifact write failed" }); }
    finally { queued--; }
  };
}
