import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PlaytestCapture, type CaptureEnvironment, type CaptureEngine } from "../client/playtest-capture";
import type { PlaytestFrameSample, PlaytestSourceIdentity } from "../shared/playtest-diary";

const source: PlaytestSourceIdentity = { sourceSnapshotId: null, sourceSnapshotScope: "fixture", sourceId: null, gitHead: null, assetSnapshotId: null, assetSnapshotScope: "fixture" };
function frame(id: number, at = 100): PlaytestFrameSample {
  return { frameId: id, frameStartedAtMs: at - 10, renderCompletedAtMs: at - 1, frameMs: 16, utcMs: 1792100000000 + at,
    position: { x: 0, y: 0, z: 0 }, actorYaw: 0, speed: 0, vehicle: false, renderPosition: { x: 0, y: 0, z: 0 },
    camera: { position: { x: 0, y: 2, z: 4 }, yaw: 0, pitch: 0, firstPerson: false, fov: 1, viewMatrix: Array(16).fill(1), projectionMatrix: Array(16).fill(2) },
    rendering: { qualityMode: "medium", quality: "medium", hardwareScaling: 1, cssWidth: 2040, cssHeight: 986, renderWidth: 2040, renderHeight: 986, dpr: 1 },
    lighting: { mode: "night", instantUtcMs: 1792100000000 }, flashlight: false, zone: "spawn" };
}
async function settle() { for (let i = 0; i < 12; i++) await new Promise<void>((done) => setImmediate(done)); }
function fixture(automatic = false) {
  let now = 100, visible = true, callback: (() => void) | null = null, sequence = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const copies: unknown[][] = [], encodings: { callback: BlobCallback; mime: string; quality?: number }[] = [];
  const events: { kind: string; data: any }[] = [], requests: { url: string; options: RequestInit }[] = [];
  const canvas = { width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage(...args: unknown[]) { copies.push(args); now += 2; } }),
    toBlob(done: BlobCallback, mime: string, quality?: number) { encodings.push({ callback: done, mime, quality }); } } as unknown as HTMLCanvasElement;
  const original = { width: 2040, height: 986 } as HTMLCanvasElement;
  let fetcher: CaptureEnvironment["fetch"] = async (_url, options) => {
    const metadata = JSON.parse(Buffer.from((options!.headers as Record<string, string>)["X-Playtest-Metadata"], "base64").toString());
    const digest = (options!.headers as Record<string, string>)["X-Playtest-Sha256"];
    return new Response(JSON.stringify({ saved: true, artifactId: metadata.artifactId, storageKey: `${metadata.runId}/${metadata.artifactId}.${metadata.mimeType === "image/png" ? "png" : "webp"}`, sha256: digest, bytes: (options!.body as Blob).size, savedAtUTC: new Date().toISOString() }), { status: 201 });
  };
  const environment: CaptureEnvironment = { now: () => now, wallNow: () => 1792100000000 + now, uuid: randomUUID,
    createCanvas: () => canvas, visible: () => visible,
    hash: async (blob) => createHash("sha256").update(Buffer.from(await blob.arrayBuffer())).digest("hex"),
    fetch: async (url, options) => { requests.push({ url: String(url), options: options! }); return fetcher(url, options); },
    setTimeout: (fn, ms) => { const id = ++sequence; timers.set(id, { at: now + ms, callback: fn }); return id as unknown as ReturnType<typeof setTimeout>; },
    clearTimeout: (id) => { timers.delete(id as unknown as number); },
  };
  const engine: CaptureEngine = { getRenderingCanvas: () => original,
    onEndFrameObservable: { add: (fn) => { callback = fn; return fn; }, remove: () => { callback = null; } } };
  const capture = new PlaytestCapture({ engine, identity: { diaryVersion: 1, sessionId: randomUUID(), runId: randomUUID(), gameInstanceId: randomUUID() }, source, environment, automatic, event: (kind, data) => events.push({ kind, data }) });
  return { capture, copies, encodings, events, requests, canvas, original, timers,
    setFetch(fn: CaptureEnvironment["fetch"]) { fetcher = fn; }, setVisible(value: boolean) { visible = value; },
    tick(sample: PlaytestFrameSample, at = sample.renderCompletedAtMs + 1) { now = at; capture.submitFrame(sample); callback?.(); },
    fire() { callback?.(); },
    async advance(ms: number) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } await settle(); },
    async encode(bytes = 64, mime?: string) { const item = encodings.shift(); assert.ok(item); item.callback(new Blob([new Uint8Array(bytes)], { type: mime ?? item.mime })); await settle(); },
  };
}

test("copies only the rendered end-frame canvas, snapshots metadata before async encode, validates receipt", async () => {
  const f = fixture(), sample = frame(1), handle = f.capture.request({ reason: "flashlight", phase: "off-before" });
  f.capture.submitFrame(sample); assert.equal(f.copies.length, 0);
  f.fire(); assert.equal(f.copies.length, 1); assert.equal(f.copies[0][0], f.original);
  assert.equal(f.canvas.width, 1280); assert.equal(f.canvas.height, 619);
  assert.equal(f.encodings[0].mime, "image/webp"); assert.equal(f.encodings[0].quality, 0.9);
  const copied = await handle.copied; assert.equal(copied.status, "copied");
  if (copied.status !== "copied") return;
  sample.camera.viewMatrix[0] = 999; sample.flashlight = true;
  assert.equal(copied.metadata.frame.camera.viewMatrix[0], 1); assert.equal(copied.metadata.frame.flashlight, false);
  assert.equal(copied.metadata.capturedAtMs, 102); assert.equal(copied.metadata.copyMs, 2);
  f.fire(); assert.equal(f.copies.length, 1);
  await f.encode(); assert.equal((await handle.saved).status, "saved");
  assert.equal(f.capture.snapshot().saved, 1); assert.equal(f.capture.snapshot().queuedBytes, 0);
  assert.equal(f.original.width, 2040); assert.equal(f.original.height, 986);
  f.capture.dispose(); assert.equal(f.canvas.width, 0);
});

test("PNG is exact source size and overlapping encodes are dropped instead of queued", async () => {
  const f = fixture(), first = f.capture.request({ reason: "manual", fullResolution: true });
  f.tick(frame(1)); assert.equal(f.canvas.width, 2040); assert.equal(f.canvas.height, 986); assert.equal(f.encodings[0].mime, "image/png");
  const second = f.capture.request({ reason: "manual" }); f.tick(frame(2, 200));
  assert.deepEqual((await second.saved).status, "dropped"); assert.equal(f.encodings.length, 1);
  assert.equal(f.capture.snapshot().droppedReasons["encoder-busy"], 1);
  await f.encode(); assert.equal((await first.saved).status, "saved"); f.capture.dispose();
});

test("unsupported MIME/null encoding, stale dimensions and hidden frames have explicit failures", async () => {
  const f = fixture(); const first = f.capture.request({ reason: "manual" }); f.tick(frame(1));
  await f.encode(20, "image/png"); assert.equal((await first.saved).status, "dropped");
  assert.equal(f.capture.snapshot().droppedReasons["unsupported-mime"], 1);
  const second = f.capture.request({ reason: "manual" }); f.tick(frame(2, 200)); f.encodings.shift()!.callback(null); await settle(); assert.equal((await second.saved).status, "dropped");
  const third = f.capture.request({ reason: "manual" }); const bad = frame(3, 300); bad.rendering.renderWidth = 10; f.tick(bad); assert.equal((await third.saved).status, "dropped");
  const hidden = f.capture.request({ reason: "manual" }); f.setVisible(false); f.tick(frame(4, 400)); assert.equal((await hidden.saved).status, "dropped");
  assert.equal(f.requests.length, 0); f.capture.dispose();
});

test("performance mode waits for noncancellable encoding and suppresses upload until resumed", async () => {
  const f = fixture(), handle = f.capture.request({ reason: "manual" }); f.tick(frame(1));
  f.capture.setMode("performance"); let idle = false; void f.capture.idle().then(() => { idle = true; });
  await settle(); assert.equal(idle, false); await f.encode(); assert.equal(idle, true); assert.equal(f.requests.length, 0); assert.equal(f.capture.snapshot().queued, 1);
  f.capture.setMode("recording"); await settle(); assert.equal((await handle.saved).status, "saved"); f.capture.dispose();
});

test("dispose settles pending work and ignores a late encode callback", async () => {
  const f = fixture(), handle = f.capture.request({ reason: "manual" }); f.tick(frame(1)); f.capture.dispose();
  assert.equal((await handle.saved).status, "dropped"); await f.encode(); assert.equal(f.requests.length, 0); assert.equal(f.canvas.width, 0); f.fire(); assert.equal(f.copies.length, 1);
});

test("transport retries exactly three immutable uploads and respects Retry-After", async () => {
  const f = fixture(); f.setFetch(async () => new Response("", { status: 429, headers: { "Retry-After": "2" } }));
  const handle = f.capture.request({ reason: "manual" }); f.tick(frame(1)); await f.encode();
  assert.equal(f.requests.length, 1); await f.advance(1000); assert.equal(f.requests.length, 1); await f.advance(1000); assert.equal(f.requests.length, 2);
  await f.advance(2000); assert.equal(f.requests.length, 3); assert.equal((await handle.saved).status, "dropped");
  assert.ok(f.requests.every((request) => request.options.body === f.requests[0].options.body));
  assert.ok(f.requests.every((request) => JSON.stringify(request.options.headers) === JSON.stringify(f.requests[0].options.headers)));
  f.capture.dispose();
});

test("bad receipt never acknowledges save; permanent HTTP failures do not retry", async () => {
  const f = fixture(); f.setFetch(async () => new Response(JSON.stringify({ saved: true, artifactId: randomUUID() }), { status: 201 }));
  const first = f.capture.request({ reason: "manual" }); f.tick(frame(1)); await f.encode(); await f.advance(1000); await f.advance(2000);
  assert.equal((await first.saved).status, "dropped"); assert.equal(f.capture.snapshot().saved, 0);
  f.setFetch(async () => new Response("", { status: 507 })); const second = f.capture.request({ reason: "manual" }); f.tick(frame(2, 4000)); await f.encode();
  assert.equal((await second.saved).status, "dropped"); assert.equal(f.requests.length, 4); f.capture.dispose();
});

test("blob queue remains bounded while performance upload is suspended", async () => {
  const f = fixture(); f.capture.setMode("performance");
  for (let i = 0; i < 9; i++) {
    f.capture.setMode("recording"); const handle = f.capture.request({ reason: "manual" }); f.tick(frame(i + 1, 100 + i * 200)); f.capture.setMode("performance");
    if (f.encodings.length) await f.encode(); else assert.equal((await handle.saved).status, "dropped");
  }
  assert.ok(f.capture.snapshot().queued <= 8); assert.ok(f.capture.snapshot().queuedBytes <= 32 * 1024 ** 2); f.capture.dispose();
});

test("automatic travel/turn/zone respects two seconds and wraparound", async () => {
  const f = fixture(true); f.tick(frame(1)); assert.equal(f.copies.length, 1); await f.encode();
  const early = frame(2, 1000); early.position.x = 21; f.tick(early); assert.equal(f.copies.length, 1);
  const travel = frame(3, 2200); travel.position.x = 21; f.tick(travel); assert.equal(f.copies.length, 2); await f.encode();
  const wrapped = frame(4, 4400); wrapped.position.x = 21; wrapped.camera.yaw = Math.PI * 2 - 0.1; f.tick(wrapped); assert.equal(f.copies.length, 2);
  const turned = frame(5, 4500); turned.position.x = 21; turned.camera.yaw = Math.PI / 2; f.tick(turned); assert.equal(f.copies.length, 3); await f.encode();
  const zone = frame(6, 6600); zone.position.x = 21; zone.camera.yaw = Math.PI / 2; zone.zone = "b6"; f.tick(zone); assert.equal(f.copies.length, 4); await f.encode(); f.capture.dispose();
});

test("burst targets sixteen forward slots and records missed frames without backfill", async () => {
  const f = fixture(); const burstId = f.capture.startBurst({ reason: "incident" }); assert.ok(burstId);
  f.tick(frame(1, 100)); await f.encode();
  f.tick(frame(2, 600)); await f.encode();
  assert.equal(f.copies.length, 2); assert.equal(f.events.find((event) => event.kind === "capture-burst-gap")?.data.count, 3);
  f.tick(frame(3, 2200)); assert.equal(f.copies.length, 2); assert.ok(f.events.some((event) => event.kind === "capture-burst-ended")); f.capture.dispose();
});
