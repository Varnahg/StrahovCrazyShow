import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineStore } from "@babylonjs/core/Engines/engineStore";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import {
  disposeFailedWebGpuInitialization,
  initializeRenderEngine,
  requireNativeWebGpuShaders,
  selectRenderBackend,
  type RenderEngineRuntime,
} from "../client/render-engine";

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

test("backend selection is explicit, loopback-only and rejects ambiguous addresses", () => {
  assert.equal(
    selectRenderBackend({ hostname: "example.com", search: "" }),
    "webgl2",
  );
  for (const hostname of ["localhost", "127.0.0.1", "[::1]", "::1"])
    for (const backend of ["webgl2", "webgpu", "webgpu-fast"] as const)
      assert.equal(
        selectRenderBackend({ hostname, search: `?renderBackend=${backend}` }),
        backend,
      );
  for (const hostname of [
    "example.com",
    "localhost.example.com",
    "127.0.0.1.example.com",
    "192.168.1.1",
  ])
    assert.throws(
      () => selectRenderBackend({ hostname, search: "?renderBackend=webgpu" }),
      /loopback/,
    );
  for (const search of [
    "?renderBackend=bad",
    "?renderBackend=",
    "?renderBackend=webgl2&renderBackend=webgpu",
  ])
    assert.throws(() => selectRenderBackend({ hostname: "localhost", search }));
});

test("WebGL2 is the only accepted baseline; a WebGL1 fallback is disposed", async () => {
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

test("initialization failure disposes the owner and never attempts a WebGL fallback", async () => {
  const f = fixture();
  const failure = new Error("adapter/device refused");
  const result = initializeRenderEngine(canvas, "webgpu", f.runtime);
  const rejected = assert.rejects(result, (error) => error === failure);
  await f.started.promise;
  f.initialized.reject(failure);
  await rejected;
  assert.equal(f.gpu.disposals, 1);
  assert.equal(f.counts().webGLCreations, 0);
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
    (value) => value === error,
  );
  assert.equal(cleanups, 1);
  assert.equal(f.gpu.disposals, 0);
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
