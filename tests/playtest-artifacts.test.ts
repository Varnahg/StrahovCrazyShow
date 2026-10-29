import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, mkdir, symlink, writeFile, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createPlaytestArtifactsHandler, validatePlaytestCaptureMetadata } from "../server/playtest-artifacts";
import type { PlaytestCaptureMetadata } from "../shared/playtest-diary";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRr8AAAAASUVORK5CYII=", "base64");
function metadata(runId: string = randomUUID()): PlaytestCaptureMetadata {
  return { diaryVersion: 1, sessionId: randomUUID(), runId, gameInstanceId: randomUUID(),
    refs: { connectionId: null, scenarioId: "flashlight", scenarioVersion: "1", stepId: "spawn", actionId: "action-1" }, artifactId: randomUUID(), requestId: randomUUID(), reason: "flashlight", phase: "off-before",
    requestedAtMs: 80, captureStartedAtMs: 100, capturedAtMs: 101, capturedAtUTC: "2026-10-16T00:00:00.000Z", mimeType: "image/png", width: 1, height: 1, sourceWidth: 1, sourceHeight: 1, copyMs: 1,
    source: { sourceSnapshotId: null, sourceSnapshotScope: "fixture", sourceId: null, gitHead: null, assetSnapshotId: null, assetSnapshotScope: "fixture" },
    frame: { frameId: 1, frameStartedAtMs: 90, renderCompletedAtMs: 99, frameMs: 16, utcMs: 1792100000000,
      position: { x: 0, y: 0, z: 0 }, renderPosition: { x: 0, y: 0, z: 0 }, actorYaw: 0, speed: 0, vehicle: false, flashlight: false, zone: "spawn",
      camera: { position: { x: 0, y: 2, z: 4 }, yaw: 0, pitch: 0, firstPerson: false, fov: 1, viewMatrix: Array(16).fill(1), projectionMatrix: Array(16).fill(2) },
      rendering: { quality: "medium", qualityMode: "medium", hardwareScaling: 1, cssWidth: 1, cssHeight: 1, renderWidth: 1, renderHeight: 1, dpr: 1 }, lighting: { mode: "night", instantUtcMs: 1792100000000 } } };
}
type FixtureOptions = Parameters<typeof createPlaytestArtifactsHandler>[0];
async function fixture(t: TestContext, options: Partial<FixtureOptions> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "strahov-playtest-artifacts-"));
  let now = Date.now();
  const handler = createPlaytestArtifactsHandler({ listenHost: "127.0.0.1", directory, now: () => now, ...options });
  t.after(async () => { assert.ok(relative(tmpdir(), directory).startsWith("strahov-playtest-artifacts-")); await rm(directory, { recursive: true, force: true }); });
  return { directory, handler, setNow(value: number) { now = value; } };
}
async function call(handler: ReturnType<typeof createPlaytestArtifactsHandler>, options: {
  meta?: PlaytestCaptureMetadata; bytes?: Buffer; chunks?: Buffer[]; url?: string; method?: string; headers?: Record<string, string>; remote?: string; local?: string; stream?: Readable;
} = {}) {
  const meta = options.meta ?? metadata(), bytes = options.bytes ?? png;
  const req = (options.stream ?? Readable.from(options.chunks ?? [bytes])) as unknown as IncomingMessage;
  Object.assign(req, { method: options.method ?? "POST", url: options.url ?? `/api/playtest/artifacts/${meta.runId}/${meta.artifactId}`,
    headers: { host: "127.0.0.1:2567", origin: "http://127.0.0.1:2567", "sec-fetch-site": "same-origin", "content-type": meta.mimeType,
      "x-playtest-metadata": Buffer.from(JSON.stringify(meta)).toString("base64"), "x-playtest-sha256": createHash("sha256").update(bytes).digest("hex"), ...options.headers },
    socket: { localAddress: options.local ?? "127.0.0.1", remoteAddress: options.remote ?? "127.0.0.1" } });
  let status = 0, body = Buffer.alloc(0), ended = false;
  const headers = new Map<string, unknown>();
  const res = { destroyed: false, get writableEnded() { return ended; },
    setHeader(key: string, value: unknown) { headers.set(key.toLowerCase(), value); return this; },
    writeHead(code: number, values?: Record<string, unknown>) { status = code; if (values) for (const [key, value] of Object.entries(values)) headers.set(key.toLowerCase(), value); return this; },
    end(value?: string | Buffer) { body = Buffer.from(value ?? ""); ended = true; return this; } } as unknown as ServerResponse;
  const handled = await handler(req, res);
  return { handled, status, body, headers, json: () => JSON.parse(body.toString()) as any };
}

test("binary receipt/dedupe survives handler restart and GET serves verified exact bytes without listing", async (t) => {
  const f = await fixture(t), meta = metadata();
  const first = await call(f.handler, { meta }); assert.equal(first.status, 201);
  const receipt = first.json(); assert.equal(receipt.saved, true); assert.equal(receipt.sha256, createHash("sha256").update(png).digest("hex")); assert.equal(receipt.bytes, png.length);
  assert.equal(receipt.storageKey, `${meta.runId}/${meta.artifactId}.png`);
  const restarted = createPlaytestArtifactsHandler({ listenHost: "127.0.0.1", directory: f.directory });
  const retry = await call(restarted, { meta }); assert.equal(retry.status, 200); assert.equal(retry.json().duplicate, true); assert.equal(retry.json().savedAtUTC, receipt.savedAtUTC);
  const image = await call(restarted, { meta, method: "GET" }); assert.equal(image.status, 200); assert.deepEqual(image.body, png); assert.equal(image.headers.get("content-type"), "image/png"); assert.equal(image.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await call(restarted, { url: "/api/playtest/artifacts", method: "GET" })).status, 404);
  const sidecar = JSON.parse(await readFile(join(f.directory, meta.runId, `${meta.artifactId}.json`), "utf8")); assert.deepEqual(sidecar.metadata, meta);
});

test("conflicting IDs/hash, bad image dimensions and extra nested payloads are rejected", async (t) => {
  const f = await fixture(t), meta = metadata(); await call(f.handler, { meta });
  assert.equal((await call(f.handler, { meta, bytes: Buffer.concat([png, Buffer.from("changed")]) })).status, 409);
  assert.equal((await call(f.handler, { meta: metadata(), headers: { "x-playtest-sha256": "a".repeat(64) } })).status, 400);
  const wrongSize = metadata(); wrongSize.width = wrongSize.sourceWidth = wrongSize.frame.rendering.renderWidth = 2;
  assert.equal((await call(f.handler, { meta: wrongSize })).status, 400);
  const extra = metadata() as any; extra.frame.camera.secret = "do not store"; assert.equal((await call(f.handler, { meta: extra })).status, 400);
  const impossible = metadata(); impossible.frame.renderCompletedAtMs = 102; assert.equal(validatePlaytestCaptureMetadata(impossible), null);
  const wrongPhase = metadata() as any; wrongPhase.phase = "before"; assert.equal(validatePlaytestCaptureMetadata(wrongPhase), null);
});

test("loopback, exact origin, MIME, bounded metadata and safe UUID paths are enforced", async (t) => {
  const f = await fixture(t), meta = metadata();
  const invalid: Array<Parameters<typeof call>[1]> = [{ remote: "192.0.2.1" }, { local: "0.0.0.0" }, { headers: { origin: "http://evil.example" } }, { headers: { host: "evil.example", origin: "http://evil.example" } }, { headers: { "sec-fetch-site": "cross-site" } }];
  for (const options of invalid) assert.equal((await call(f.handler, { meta, ...options })).status, 403);
  assert.equal((await call(f.handler, { meta, headers: { "content-type": "text/html" } })).status, 415);
  assert.equal((await call(f.handler, { meta, headers: { "x-playtest-metadata": "A".repeat(13000) } })).status, 400);
  for (const path of ["../outside", "%2e%2e/outside", `${meta.runId}/../../outside`, `${meta.runId}/${meta.artifactId}?path=outside`]) assert.equal((await call(f.handler, { meta, url: `/api/playtest/artifacts/${path}` })).status, 404);
  assert.equal((await readdir(f.directory)).length, 0);
  const disabled = createPlaytestArtifactsHandler({ listenHost: "0.0.0.0", directory: f.directory }); assert.equal((await call(disabled, { meta })).status, 404);
});

test("oversize content length/chunked body and interrupted streams do not leave temporary files", async (t) => {
  const f = await fixture(t, { policy: { maxArtifactBytes: 100 } }), meta = metadata();
  assert.equal((await call(f.handler, { meta, headers: { "content-length": "101" } })).status, 413);
  assert.equal((await call(f.handler, { meta, chunks: [png, Buffer.alloc(50)] })).status, 413);
  const broken = new Readable({ read() { this.push(png.subarray(0, 20)); this.destroy(new Error("fixture disconnect")); } });
  assert.equal((await call(f.handler, { meta, stream: broken })).status, 400);
  assert.deepEqual(await readdir(join(f.directory, meta.runId)), []);
});

test("per-run quota never evicts current evidence; total retention removes whole older owned runs", async (t) => {
  const first = metadata(), second = metadata();
  const size = Buffer.byteLength(JSON.stringify({ metadata: first, receipt: { artifactId: first.artifactId, storageKey: `${first.runId}/${first.artifactId}.png`, sha256: "a".repeat(64), bytes: png.length, savedAtUTC: new Date().toISOString() } })) + png.length;
  const f = await fixture(t, { policy: { maxRunBytes: size + 100, maxDiskBytes: size + 100 } });
  assert.equal((await call(f.handler, { meta: first })).status, 201);
  const sameRun = metadata(first.runId); assert.equal((await call(f.handler, { meta: sameRun })).status, 507);
  assert.deepEqual(await readFile(join(f.directory, first.runId, `${first.artifactId}.png`)), png);
  await writeFile(join(f.directory, "unrelated.txt"), "retain");
  assert.equal((await call(f.handler, { meta: second })).status, 201);
  assert.deepEqual(await readdir(join(f.directory, first.runId)), []);
  assert.equal(await readFile(join(f.directory, "unrelated.txt"), "utf8"), "retain");
});

test("age retention removes expired runs even below disk limit", async (t) => {
  const f = await fixture(t), first = metadata(); await call(f.handler, { meta: first });
  for (const name of await readdir(join(f.directory, first.runId))) await utimes(join(f.directory, first.runId, name), new Date(0), new Date(0));
  await call(f.handler, { meta: metadata() }); assert.deepEqual(await readdir(join(f.directory, first.runId)), []);
});

test("junction/symlink runs cannot redirect upload, read or retention", async (t) => {
  const f = await fixture(t), outside = await mkdtemp(join(tmpdir(), "strahov-playtest-artifacts-outside-")), meta = metadata();
  t.after(async () => { assert.ok(relative(tmpdir(), outside).startsWith("strahov-playtest-artifacts-outside-")); await rm(outside, { recursive: true, force: true }); });
  await writeFile(join(outside, "sentinel"), "safe");
  await symlink(outside, join(f.directory, meta.runId), process.platform === "win32" ? "junction" : "dir");
  assert.equal((await call(f.handler, { meta })).status, 500);
  assert.equal((await call(f.handler, { meta, method: "GET" })).status, 404);
  await call(f.handler, { meta: metadata() }); assert.deepEqual(await readdir(outside), ["sentinel"]);
});

test("concurrent duplicate requests serialize to one immutable pair and tampered bytes cannot be served", async (t) => {
  const f = await fixture(t), meta = metadata();
  const responses = await Promise.all([call(f.handler, { meta }), call(f.handler, { meta })]); assert.deepEqual(responses.map((value) => value.status), [201, 200]);
  assert.equal((await readdir(join(f.directory, meta.runId))).length, 2);
  await writeFile(join(f.directory, meta.runId, `${meta.artifactId}.png`), Buffer.alloc(png.length));
  assert.equal((await call(f.handler, { meta, method: "GET" })).status, 409);
});
