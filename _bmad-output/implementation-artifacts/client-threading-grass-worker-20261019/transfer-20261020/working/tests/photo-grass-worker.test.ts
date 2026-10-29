import test from "node:test";
import assert from "node:assert/strict";
import { createPhotoGrassPlacement } from "../client/photo-grass-placement";
import {
  PhotoGrassTileExecutor,
  type PhotoGrassWorkerPort,
} from "../client/photo-grass-tile-executor";
import { createPhotoGrassWorkerRuntime } from "../client/photo-grass-worker";
import {
  GRASS_WORKER_PROTOCOL,
  GRASS_WORKER_STARTUP_MS,
  GRASS_WORKER_REQUEST_MS,
  grassWorkerEnabled,
  type GrassWorkerInput,
  type GrassWorkerOutput,
} from "../client/photo-grass-worker-protocol";

/** Deterministic scheduling, but REAL structured-clone transfer/detachment. */
class WorkerHarness implements PhotoGrassWorkerPort {
  onmessage: PhotoGrassWorkerPort["onmessage"] = null;
  onerror: PhotoGrassWorkerPort["onerror"] = null;
  onmessageerror: PhotoGrassWorkerPort["onmessageerror"] = null;
  inputs: GrassWorkerInput[] = [];
  outputs: GrassWorkerOutput[] = [];
  detached: number[] = [];
  terminated = 0;
  private callbacks = new Set<() => void>();
  private runtime: ReturnType<typeof createPhotoGrassWorkerRuntime>;
  constructor(now = () => 0) {
    this.runtime = createPhotoGrassWorkerRuntime(
      (message, transfer = []) => {
        this.outputs.push(structuredClone(message, { transfer }));
        for (const buffer of transfer) this.detached.push(buffer.byteLength);
      },
      (run) => {
        this.callbacks.add(run);
        return () => this.callbacks.delete(run);
      },
      now,
    );
  }
  postMessage(message: GrassWorkerInput) {
    this.inputs.push(message);
    this.runtime.receive(message);
  }
  terminate() {
    this.terminated++;
    this.runtime.dispose();
  }
  ready() {
    this.onmessage?.({
      data: { kind: "ready", protocol: GRASS_WORKER_PROTOCOL },
    });
  }
  slice() {
    const run = this.callbacks.values().next().value;
    if (!run) return false;
    this.callbacks.delete(run);
    run();
    return true;
  }
  finish() {
    for (let i = 0; i < 100 && this.slice(); i++);
  }
  deliver() {
    for (const data of this.outputs.splice(0)) this.onmessage?.({ data });
  }
}

test("worker experiment requires exactly one explicit loopback opt-in", () => {
  for (const hostname of ["localhost", "127.0.0.1", "[::1]", "::1"])
    assert.equal(
      grassWorkerEnabled({ hostname, search: "?grassWorker=1" }),
      true,
    );
  for (const search of [
    "",
    "?grassWorker=0",
    "?grassWorker=true",
    "?grassWorker=1&grassWorker=1",
  ])
    assert.equal(grassWorkerEnabled({ hostname: "localhost", search }), false);
  assert.equal(
    grassWorkerEnabled({
      hostname: "localhost.example.com",
      search: "?grassWorker=1",
    }),
    false,
  );
});

test("transferred tiles preserve exact matrices, repeat requests and main FIFO ownership", () => {
  const port = new WorkerHarness(),
    executor = new PhotoGrassTileExecutor(
      () => port,
      () => 0,
    ),
    native = createPhotoGrassPlacement(),
    cache = createPhotoGrassPlacement(1536);
  try {
    port.ready();
    assert.equal(executor.request(110, 34), true);
    assert.equal(executor.request(333, -110), true);
    assert.equal(
      executor.request(111, 35),
      false,
      "no third in-flight request",
    );
    port.finish();
    assert.equal(
      cache.cacheSize,
      0,
      "worker handler does not populate main cache",
    );
    port.deliver();
    assert.equal(
      executor.pendingCount,
      2,
      "completed payloads still occupy slots",
    );
    const first = executor.takeCompleted()!,
      edge = executor.takeCompleted()!;
    assert.deepEqual(first, native.tile(110, 34));
    assert.deepEqual(edge, native.tile(333, -110));
    cache.acceptTile(first);
    cache.acceptTile(edge);
    assert.deepEqual(port.detached, [0, 0]);
    assert.equal(executor.request(110, 34), true);
    port.finish();
    port.deliver();
    const repeated = executor.takeCompleted()!;
    assert.deepEqual(repeated, first, "worker has no detached cache hit");
    assert.equal(
      cache.acceptTile(repeated),
      first,
      "cache identity survives duplicate arrival",
    );
    for (let i = 0; i < 1535; i++) cache.tile(-2000 - i, -2000);
    assert.equal(cache.cacheSize, 1536);
    assert.equal(
      cache.cachedTile(110, 34),
      undefined,
      "a cache hit must not promote FIFO order",
    );
    assert.ok(cache.cachedTile(333, -110));
    assert.deepEqual(
      cache.tile(110, 34),
      first,
      "eviction preserves deterministic regeneration",
    );
    assert.equal(
      cache.releaseTile({ ...cache.tile(110, 34) }),
      false,
      "only the owned object may transfer",
    );
    assert.throws(
      () => cache.acceptTile({ ...first, count: first.count + 1 }),
      /Invalid/,
    );
  } finally {
    executor.dispose();
    native.dispose();
    cache.dispose();
  }
});

test("cancel between yielded slices publishes no tile and reset rejects old epoch/duplicates", () => {
  let clock = 0;
  const port = new WorkerHarness(() => (clock += 3)),
    executor = new PhotoGrassTileExecutor(
      () => port,
      () => 0,
    );
  try {
    port.ready();
    executor.request(110, 34);
    assert.equal(port.slice(), true);
    executor.cancel(110, 34);
    port.finish();
    port.deliver();
    assert.equal(executor.takeCompleted(), undefined);
    assert.equal(port.outputs.length, 0);
    executor.request(110, 34);
    port.finish();
    const old = port.outputs[0];
    assert.equal(old.kind, "tile");
    executor.reset();
    port.deliver();
    assert.equal(executor.takeCompleted(), undefined);
    executor.request(110, 34);
    port.finish();
    const current = port.outputs[0];
    port.deliver();
    port.onmessage?.({ data: current });
    assert.equal(executor.pendingCount, 1);
    assert.ok(executor.takeCompleted());
    port.onmessage?.({ data: current });
    assert.equal(executor.pendingCount, 0);
    const late = port.onmessage;
    executor.dispose();
    late?.({ data: current });
    assert.equal(executor.pendingCount, 0);
    assert.equal(port.terminated, 1);
    assert.equal(port.onmessage, null);
  } finally {
    executor.dispose();
  }
});

test("startup, request, transport and malformed-result failures terminate before fallback", () => {
  let clock = 0;
  const startup = new WorkerHarness(),
    starting = new PhotoGrassTileExecutor(
      () => startup,
      () => clock,
    );
  clock = GRASS_WORKER_STARTUP_MS;
  starting.checkTimeout();
  assert.equal(starting.failed, true);
  assert.equal(startup.terminated, 1);
  starting.dispose();
  const unavailable = new PhotoGrassTileExecutor(() => {
    throw Error("unavailable");
  });
  assert.equal(unavailable.failed, true);
  unavailable.dispose();
  for (const failure of [
    "timeout",
    "error",
    "messageerror",
    "send",
    "tile",
  ] as const) {
    const port = new WorkerHarness(),
      executor = new PhotoGrassTileExecutor(
        () => port,
        () => clock,
      );
    port.ready();
    if (failure === "send")
      port.postMessage = () => {
        throw Error("send");
      };
    executor.request(110, 34);
    if (failure === "timeout") {
      clock += GRASS_WORKER_REQUEST_MS;
      executor.checkTimeout();
    }
    if (failure === "error") port.onerror?.();
    if (failure === "messageerror") port.onmessageerror?.();
    if (failure === "tile") {
      const request = [...executor.requests][0];
      port.onmessage?.({ data: { ...request, tile: { count: 0 } } });
      executor.takeCompleted();
    }
    assert.equal(executor.failed, true, failure);
    assert.equal(port.terminated, 1, failure);
    assert.deepEqual(
      [...executor.requests].map((r) => [r.x, r.z]),
      [[110, 34]],
      "failed work remains available to native fallback",
    );
    executor.dispose();
    assert.equal(executor.pendingCount, 0);
  }
});
