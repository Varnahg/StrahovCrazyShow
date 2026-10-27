import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import {
  createGameEngine,
  disposeFailedWebGpuInitialization,
  initializeRenderEngine,
  initializeSelectedRenderEngine,
  getRenderEngineSelection,
  requireNativeWebGpuShaders,
  selectRenderBackend,
  type RenderEngineRuntime,
} from "../client/render-engine";
import { RenderFallbackSession, WebGpuInitializationError } from "../client/render-fallback";

const canvas = {
  width: 1280,
  height: 720,
  removeEventListener() {},
} as unknown as HTMLCanvasElement;

test("native shader policy prevents the real engine from attempting a compiler download", async () => {
  const engine = new WebGPUEngine(canvas);
  try {
    requireNativeWebGpuShaders(engine);
    await assert.rejects(engine.prepareGlslangAndTintAsync(), /nativní WGSL/);
    assert.equal((engine as unknown as { _workingGlslangAndTintPromise: unknown })._workingGlslangAndTintPromise, null);
  } finally {
    disposeFailedWebGpuInitialization(engine, canvas);
  }
});

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

class FakeEngine {
  compatibilityMode = true;
  snapshotRendering = true;
  disposals = 0;
  disposed = deferred();
  constructor(
    public isWebGPU: boolean,
    public webGLVersion = 2,
  ) {}
  dispose() {
    this.disposals++;
    this.disposed.resolve();
  }
}

function fixture() {
  const gl = new FakeEngine(false);
  const gpu = new FakeEngine(true);
  const initialized = deferred();
  const started = deferred();
  let webGLCreations = 0,
    webGPUCreations = 0;
  const runtime: RenderEngineRuntime<FakeEngine> = {
    createWebGL() {
      webGLCreations++;
      return gl;
    },
    async createWebGPU() {
      webGPUCreations++;
      return {
        engine: gpu,
        async initialize() {
          started.resolve();
          await initialized.promise;
        },
      };
    },
  };
  return {
    gl,
    gpu,
    runtime,
    initialized,
    started,
    counts: () => ({ webGLCreations, webGPUCreations }),
  };
}

const localHosts = ["localhost", "LOCALHOST", "127.0.0.1", "[::1]", "::1"];
const remoteHosts = ["example.com", "localhost.example.com", "127.0.0.1.example.com", "192.168.1.1"];

test("WebGPU is the shared production default, independent of hostname and unrelated query parameters", () => {
  for (const hostname of [...localHosts, ...remoteHosts])
    for (const search of ["", "?terrainReview=b5-tree-near&treePilot=own"])
      assert.equal(selectRenderBackend({ hostname, search }), "webgpu");
});

test("explicit WebGPU and WebGL2 are available on production and loopback hosts", () => {
  for (const hostname of [...localHosts, ...remoteHosts])
    for (const backend of ["webgl2", "webgpu"] as const)
      assert.equal(
        selectRenderBackend({ hostname, search: `?renderBackend=${backend}` }),
        backend,
      );
});

test("fast WebGPU remains an explicit loopback experiment", () => {
  for (const hostname of localHosts)
    assert.equal(selectRenderBackend({ hostname, search: "?renderBackend=webgpu-fast" }), "webgpu-fast");
  for (const hostname of remoteHosts)
    assert.throws(
      () => selectRenderBackend({ hostname, search: "?renderBackend=webgpu-fast" }),
      /loopback/,
    );
});

test("backend selection rejects invalid and ambiguous addresses before construction", () => {
  for (const search of [
    "?renderBackend=bad",
    "?renderBackend=",
    "?renderBackend=webgl2&renderBackend=webgpu",
    "?renderBackend=webgpu&renderBackend=webgpu",
  ])
    for (const hostname of ["localhost", "example.com"])
      assert.throws(() => selectRenderBackend({ hostname, search }));
});

test("explicit compatibility requires WebGL2; a WebGL1 fallback is disposed", async () => {
  const f = fixture();
  assert.equal(await initializeRenderEngine(canvas, "webgl2", f.runtime), f.gl);
  assert.deepEqual(f.counts(), { webGLCreations: 1, webGPUCreations: 0 });
  assert.equal(f.gl.disposals, 0);
  f.gl.webGLVersion = 1;
  await assert.rejects(
    initializeRenderEngine(canvas, "webgl2", f.runtime),
    /WebGL2/,
  );
  assert.equal(f.gl.disposals, 1);
});

test("WebGPU returns only after init, preserves the selected CM/NCM and never uses snapshots", async () => {
  for (const backend of ["webgpu", "webgpu-fast"] as const) {
    const f = fixture();
    let resolved = false;
    const result = initializeRenderEngine(canvas, backend, f.runtime).then(
      (engine) => {
        resolved = true;
        return engine;
      },
    );
    await f.started.promise;
    assert.equal(resolved, false);
    f.initialized.resolve();
    assert.equal(await result, f.gpu);
    assert.equal(f.gpu.compatibilityMode, backend === "webgpu");
    assert.equal(f.gpu.snapshotRendering, false);
    assert.equal(f.gpu.disposals, 0);
    assert.deepEqual(f.counts(), { webGLCreations: 0, webGPUCreations: 1 });
  }
});

test("WebGPU initialization failure disposes the owner before exposing a retryable error", async () => {
  const f = fixture();
  const failure = new Error("adapter/device refused");
  const result = initializeRenderEngine(canvas, selectRenderBackend({ hostname: "example.com", search: "" }), f.runtime);
  const rejected = assert.rejects(result, (error) => error instanceof WebGpuInitializationError && error.cause === failure && f.gpu.disposals === 1);
  await f.started.promise;
  f.initialized.reject(failure);
  await rejected;
  assert.equal(f.gpu.disposals, 1);
  assert.equal(f.counts().webGLCreations, 0);
});

test("production factory exposes missing WebGPU for a fresh-canvas retry without constructing another engine", async (t) => {
  assert.equal((navigator as Navigator & { gpu?: unknown }).gpu, undefined,
    "this CPU regression must never open a real GPU");
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location: { hostname: "example.com", search: "" } },
  });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  });
  const before = EngineStore.Instances.length;
  await assert.rejects(createGameEngine(canvas), (error) => error instanceof WebGpuInitializationError && error.reason === "unavailable");
  assert.equal(EngineStore.Instances.length, before);
});

test("cancellation before construction creates no engine", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    initializeRenderEngine(canvas, "webgpu", f.runtime, controller.signal),
    { name: "AbortError" },
  );
  assert.deepEqual(f.counts(), { webGLCreations: 0, webGPUCreations: 0 });
});

test("cancellation during init rejects promptly and cleans up after the last async allocation", async () => {
  const f = fixture();
  const controller = new AbortController();
  const result = initializeRenderEngine(
    canvas,
    "webgpu",
    f.runtime,
    controller.signal,
  );
  await f.started.promise;
  controller.abort();
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(
    f.gpu.disposals,
    0,
    "disposing before init settles would allow later allocations to leak",
  );
  f.initialized.resolve();
  await f.gpu.disposed.promise;
  assert.equal(f.gpu.disposals, 1);
});

test("abort after successful transfer leaves engine lifetime with the caller", async () => {
  const f = fixture();
  const controller = new AbortController();
  const result = initializeRenderEngine(
    canvas,
    "webgpu",
    f.runtime,
    controller.signal,
  );
  f.initialized.resolve();
  await result;
  controller.abort();
  await Promise.resolve();
  assert.equal(f.gpu.disposals, 0);
});

test("initialization uses the prepared partial cleanup when full engine dispose is unsafe", async () => {
  const f = fixture();
  let cleanups = 0;
  const error = new Error("no adapter");
  f.runtime.createWebGPU = async () => ({
    engine: f.gpu,
    initialize: async () => {
      throw error;
    },
    dispose: () => {
      cleanups++;
    },
  });
  await assert.rejects(
    initializeRenderEngine(canvas, "webgpu", f.runtime),
    (value) => value instanceof WebGpuInitializationError && value.cause === error,
  );
  assert.equal(cleanups, 1);
  assert.equal(f.gpu.disposals, 0);
});

test("automatic retry requires a fresh canvas and preserves the actual selected backend", async () => {
  const session = new RenderFallbackSession(), location = { hostname: "example.com", search: "" };
  const f = fixture(), used: HTMLCanvasElement[] = [];
  let locked = false;
  f.runtime.createWebGPU = async (target) => {
    used.push(target);
    return { engine: f.gpu, initialize: async () => { locked = true; throw new Error("configure rejected"); } };
  };
  f.runtime.createWebGL = target => {
    assert.ok(target !== canvas || !locked, "a WebGPU canvas cannot become a WebGL canvas");
    used.push(target); return f.gl;
  };
  let failure: unknown;
  try { await initializeSelectedRenderEngine(canvas, session.select(location), f.runtime); }
  catch (error) { failure = error; }
  assert.equal(f.gpu.disposals, 1);
  assert.ok(session.request(failure, location));
  const nextCanvas = { ...canvas } as HTMLCanvasElement;
  const engine = await initializeSelectedRenderEngine(nextCanvas, session.select(location), f.runtime);
  assert.equal(engine, f.gl);
  assert.deepEqual(used, [canvas, nextCanvas]);
  assert.deepEqual(getRenderEngineSelection(engine), { requested: "webgpu", backend: "webgl2", automatic: true, fallbackReason: "initialization-failed" });
  assert.equal(session.request(failure, location), null);
});

test("concurrent page fallback does not relabel an already selected successful WebGPU engine", async () => {
  const session = new RenderFallbackSession(), location = { hostname: "example.com", search: "" }, f = fixture();
  const result = initializeSelectedRenderEngine(canvas, session.select(location), f.runtime);
  await f.started.promise;
  session.request(new WebGpuInitializationError("webgpu", "unavailable"), location);
  f.initialized.resolve();
  const engine = await result;
  assert.equal(getRenderEngineSelection(engine)?.backend, "webgpu");
  assert.equal(getRenderEngineSelection(engine)?.fallbackReason, null);
  assert.equal(session.select(location).backend, "webgl2");
});

test("import failure, invalid engine identity and cleanup failure are not retryable initialization errors", async () => {
  const f = fixture(), imported = new Error("dynamic import failed");
  f.runtime.createWebGPU = async () => { throw imported; };
  await assert.rejects(initializeRenderEngine(canvas, "webgpu", f.runtime), error => error === imported);
  const wrong = fixture(); wrong.gpu.isWebGPU = false; wrong.initialized.resolve();
  await assert.rejects(initializeRenderEngine(canvas, "webgpu", wrong.runtime), error => !(error instanceof WebGpuInitializationError));
  assert.equal(wrong.gpu.disposals, 1);
  const broken = fixture(), initError = new Error("initialization failed"), cleanupError = new Error("cleanup failed");
  broken.gpu.dispose = () => { broken.gpu.disposals++; throw cleanupError; };
  const failed = initializeRenderEngine(canvas, "webgpu", broken.runtime);
  await broken.started.promise; broken.initialized.reject(initError);
  await assert.rejects(failed, error => error instanceof AggregateError && error.errors[0] === initError && error.errors[1] === cleanupError);
  assert.equal(broken.gpu.disposals, 1);
});

test("selection transfer respects cancellation and does not publish metadata for a retired engine", async () => {
  const f = fixture(), abort = new AbortController();
  f.runtime.createWebGL = () => { queueMicrotask(() => abort.abort()); return f.gl; };
  const selection = new RenderFallbackSession().select({ hostname: "example.com", search: "?renderBackend=webgl2" });
  await assert.rejects(initializeSelectedRenderEngine(canvas, selection, f.runtime, abort.signal), { name: "AbortError" });
  assert.equal(f.gl.disposals, 1);
  assert.equal(getRenderEngineSelection(f.gl), undefined);
});

test("pinned partial cleanup releases a real WebGPU constructor without a GPU device", () => {
  assert.equal(
    (navigator as Navigator & { gpu?: unknown }).gpu,
    undefined,
    "this CPU regression must never open a real GPU",
  );
  const before = EngineStore.Instances.length;
  const engine = new WebGPUEngine(canvas, { antialias: true });
  assert.equal(EngineStore.Instances.length, before + 1);
  // Public dispose would unconditionally dereference missing _timestampQuery.
  disposeFailedWebGpuInitialization(engine, canvas);
  assert.equal(EngineStore.Instances.length, before);
  assert.equal(engine.isDisposed, true);
});
