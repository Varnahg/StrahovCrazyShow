import test from "node:test";
import assert from "node:assert/strict";
import { Observable } from "@babylonjs/core/Misc/observable";
import { WebGpuCompilationProfile } from "../client/webgpu-compilation-profile";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function fixture() {
  let time = 0;
  const tick = (ms: number) => {
    time += ms;
  };
  class Device {
    readonly module = {
      getCompilationInfo: () => {
        tick(1);
        return Promise.resolve({ messages: [] as unknown[] });
      },
    };
    pipeline = {};
    pending = deferred<object>();
    failSync: unknown;
    queue = {
      submit: (buffers: unknown) => {
        tick(7);
        return buffers;
      },
    };
    createShaderModule(descriptor: unknown) {
      assert.equal(this instanceof Device, true);
      tick(3);
      return this.module;
    }
    createRenderPipeline(descriptor: unknown) {
      assert.equal(this instanceof Device, true);
      tick(31);
      if (this.failSync) throw this.failSync;
      return this.pipeline;
    }
    createRenderPipelineAsync(descriptor: unknown) {
      assert.equal(this instanceof Device, true);
      tick(2);
      return this.pending.promise;
    }
  }
  class Cache {
    static NumCacheHitWithoutHash = 100;
    static NumCacheHitWithHash = 200;
    static NumCacheMiss = 300;
    static NumPipelineCreationLastFrame = 4;
  }
  const device = new Device();
  const engine = {
    isWebGPU: true,
    _device: device as Device | undefined,
    _tintWASM: undefined as
      { convertSpirV2WGSL(value: unknown): unknown } | undefined,
    _cacheRenderPipeline: new Cache(),
    countersLastFrame: {
      numEnableEffects: 8,
      numEnableDrawWrapper: 9,
      numBundleCreationNonCompatMode: 3,
      numBundleReuseNonCompatMode: 12,
    },
    onDisposeObservable: new Observable<void>(),
    onContextRestoredObservable: new Observable<void>(),
    _initializeLimits() {
      return this._device?.createShaderModule({ label: "engine init" });
    },
    _compileRawShaderToSpirV(value: unknown, stage: unknown) {
      tick(11);
      return value;
    },
    prepareGlslangAndTintAsync() {
      return Promise.resolve().then(() => {
        this._tintWASM = {
          convertSpirV2WGSL: (value: unknown) => {
            tick(13);
            return value;
          },
        };
      });
    },
    _createPipelineStageDescriptor(value: unknown) {
      return this._tintWASM!.convertSpirV2WGSL(value);
    },
    _preparePipelineContextAsync(context: unknown) {
      tick(5);
      return Promise.resolve(context);
    },
  };
  return { engine, device, Device, tick, now: () => time };
}

test("profile preserves returns and receivers, separates CPU phases and marks shared cache scope", async () => {
  const f = fixture();
  const slow: unknown[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onSlowCall: (event) => slow.push(event),
  });
  try {
    const source = {},
      descriptor = { label: "real pipeline" };
    assert.equal(f.engine._compileRawShaderToSpirV(source, "vertex"), source);
    assert.equal(
      f.device.createShaderModule({ label: "fragment" }),
      f.device.module,
    );
    assert.equal(f.device.createRenderPipeline(descriptor), f.device.pipeline);
    const buffers = [{}];
    assert.equal(f.device.queue.submit(buffers), buffers);
    await settle();
    const result = profile.snapshot();
    assert.equal(result.metrics.glslToSpirv.cpuTotalMs, 11);
    assert.equal(result.metrics.shaderModule.cpuTotalMs, 3);
    assert.equal(result.metrics.shaderValidation.cpuTotalMs, 1);
    assert.equal(result.metrics.syncPipeline.cpuTotalMs, 31);
    assert.equal(result.metrics.submit.cpuTotalMs, 7);
    assert.equal(result.metrics.shaderValidation.failures, 0);
    assert.deepEqual(slow, [
      {
        phase: "syncPipeline",
        label: "real pipeline",
        cpuMs: 31,
        generation: 1,
      },
    ]);
    assert.equal(
      result.bundleCountersLastFrame?.numBundleReuseNonCompatMode,
      12,
    );
    assert.match(result.sharedCacheCounters.scope, /all engines/);
    assert.equal(result.sharedCacheCounters.values?.NumCacheMiss, 300);
    result.metrics.syncPipeline.calls = 999;
    assert.equal(profile.snapshot().metrics.syncPipeline.calls, 1);
  } finally {
    profile.dispose();
  }
});

test("async pipeline keeps original Promise identity, records completion latency and reports rejection once", async () => {
  const f = fixture(),
    errors: unknown[] = [],
    tracked: string[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => errors.push(error),
    track: (promise, channel, label) => {
      tracked.push(`${channel}:${label}`);
      return promise.catch((error) => {
        errors.push(error);
        throw error;
      });
    },
  });
  try {
    const promise = f.device.createRenderPipelineAsync({ label: "async" });
    assert.equal(promise, f.device.pending.promise);
    assert.equal(profile.snapshot().metrics.asyncPipeline.pending, 1);
    f.tick(43);
    const failure = new Error("pipeline rejected");
    const rejected = assert.rejects(promise, (error) => error === failure);
    f.device.pending.reject(failure);
    await rejected;
    await settle();
    assert.deepEqual(errors, [failure]);
    assert.deepEqual(tracked, ["pipeline:async"]);
    const stats = profile.snapshot().metrics.asyncPipeline;
    assert.equal(stats.cpuTotalMs, 2);
    assert.equal(stats.asyncTotalMs, 45);
    assert.equal(stats.failures, 1);
    assert.equal(stats.pending, 0);
  } finally {
    profile.dispose();
  }
});

test("fulfilled shader compilation information with error messages invalidates the shader channel", async () => {
  const f = fixture(),
    errors: { channel: string; error: unknown; label: string }[] = [];
  f.device.module.getCompilationInfo = () =>
    Promise.resolve({
      messages: [
        { type: "error", message: "bad binding", lineNum: 4, linePos: 7 },
      ],
    });
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (channel, error, label) => errors.push({ channel, error, label }),
  });
  try {
    assert.equal(
      f.device.createShaderModule({ label: "native sky" }),
      f.device.module,
    );
    await settle();
    assert.equal(errors.length, 1);
    assert.equal(errors[0].channel, "shader");
    assert.equal(errors[0].label, "native sky");
    assert.match(String(errors[0].error), /4:7 bad binding/);
    const result = profile.snapshot();
    assert.equal(result.metrics.shaderModule.failures, 0);
    assert.equal(result.metrics.shaderValidation.failures, 1);
    assert.equal(result.metrics.shaderValidation.pending, 0);
  } finally {
    profile.dispose();
  }
});

test("fulfilled compilation errors use the health tracking branch without a duplicate callback", async () => {
  const f = fixture(),
    failures: string[] = [];
  f.device.module.getCompilationInfo = () =>
    Promise.resolve({ messages: [{ type: "error", message: "invalid WGSL" }] });
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: () =>
      assert.fail("tracked async failures must not also call onError"),
    track: (promise, channel, label) =>
      promise.catch((error) => {
        failures.push(`${channel}:${label}:${String(error)}`);
        throw error;
      }),
  });
  f.device.createShaderModule({ label: "new native variant" });
  await settle();
  assert.equal(failures.length, 1);
  assert.match(failures[0], /shader:new native variant:.*invalid WGSL/);
  assert.equal(profile.snapshot().metrics.shaderValidation.failures, 1);
  assert.equal(profile.snapshot().observerErrors, 0);
  profile.dispose();
});

test("late compilation information cannot invalidate a disposed owner", async () => {
  const f = fixture(),
    errors: unknown[] = [];
  const information = deferred<{ messages: unknown[] }>();
  f.device.module.getCompilationInfo = () => information.promise;
  const original = f.device.createShaderModule;
  const profile = new WebGpuCompilationProfile(f.engine, {
    onError: (_channel, error) => errors.push(error),
  });
  f.device.createShaderModule({ label: "disposing" });
  assert.equal(profile.snapshot().metrics.shaderValidation.pending, 1);
  profile.dispose();
  information.resolve({
    messages: [{ type: "error", message: "late stale result" }],
  });
  await settle();
  assert.equal(f.device.createShaderModule, original);
  assert.deepEqual(errors, []);
  assert.equal(profile.snapshot().metrics.shaderValidation.pending, 0);
  assert.equal(profile.snapshot().metrics.shaderValidation.failures, 0);
});

test("compilation-info API failure is reported without replacing the original shader module or including observer cost", () => {
  const f = fixture();
  const failure = new Error("compilation info unavailable");
  f.device.module.getCompilationInfo = () => {
    f.tick(2);
    throw failure;
  };
  const errors: unknown[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => {
      errors.push(error);
      f.tick(1000);
    },
  });
  assert.equal(f.device.createShaderModule({}), f.device.module);
  assert.deepEqual(errors, [failure]);
  assert.equal(profile.snapshot().metrics.shaderModule.cpuTotalMs, 3);
  assert.equal(profile.snapshot().metrics.shaderValidation.cpuTotalMs, 2);
  profile.dispose();
});

test("warnings do not become failures and native async preparation retains original rejection identity", async () => {
  const f = fixture(),
    errors: unknown[] = [];
  f.device.module.getCompilationInfo = () =>
    Promise.resolve({ messages: [{ type: "warning", message: "unused" }] });
  const pending = deferred<unknown>();
  f.engine._preparePipelineContextAsync = () => pending.promise;
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => errors.push(error),
  });
  try {
    f.device.createShaderModule({});
    const result = f.engine._preparePipelineContextAsync({
      _name: "pbr variant",
    });
    assert.equal(result, pending.promise);
    const failure = new Error("shader translation failed");
    const rejected = assert.rejects(result, (error) => error === failure);
    pending.reject(failure);
    await rejected;
    await settle();
    assert.deepEqual(errors, [failure]);
    assert.equal(profile.snapshot().metrics.shaderValidation.failures, 0);
    assert.equal(profile.snapshot().metrics.shaderPreparation.failures, 1);
  } finally {
    profile.dispose();
  }
});

test("restore detaches the old device and late old operations cannot taint the new generation", async () => {
  const f = fixture(),
    errors: unknown[] = [];
  const oldMethod = f.device.createRenderPipeline;
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    onError: (_channel, error) => errors.push(error),
  });
  const oldPromise = f.device.createRenderPipelineAsync({ label: "old" });
  const next = new f.Device();
  f.engine._device = next;
  f.engine.onContextRestoredObservable.notifyObservers();
  assert.equal(f.device.createRenderPipeline, oldMethod);
  assert.equal(profile.snapshot().generation, 2);
  const failure = new Error("old device failure");
  const rejected = assert.rejects(oldPromise, (error) => error === failure);
  f.device.pending.reject(failure);
  await rejected;
  await settle();
  assert.deepEqual(errors, []);
  assert.equal(profile.snapshot().metrics.asyncPipeline.calls, 0);
  next.createRenderPipeline({});
  assert.equal(profile.snapshot().metrics.syncPipeline.calls, 1);
  profile.dispose();
});

test("pre-init attachment observes init resources and lazy Tint's very first conversion", async () => {
  const f = fixture();
  f.engine._device = undefined;
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    track: (operation) => operation.then((value) => value),
  });
  try {
    assert.equal(profile.attachedAfterDeviceCreation, false);
    assert.equal(
      profile.snapshot().hooks["device.createShaderModule"],
      "not-created",
    );
    f.engine._device = f.device;
    f.engine._initializeLimits();
    await f.engine.prepareGlslangAndTintAsync();
    const source = {};
    assert.equal(f.engine._createPipelineStageDescriptor(source), source);
    await settle();
    const result = profile.snapshot();
    assert.equal(result.metrics.shaderModule.calls, 1);
    assert.equal(result.metrics.compilerLoad.calls, 1);
    assert.equal(result.metrics.spirvToWgsl.calls, 1);
    assert.equal(result.metrics.spirvToWgsl.cpuTotalMs, 13);
  } finally {
    profile.dispose();
  }
});

test("cleanup restores inherited/own methods, preserves a later owner and disables retained wrappers", () => {
  const f = fixture();
  const original = f.device.createRenderPipeline;
  assert.equal(Object.hasOwn(f.device, "createRenderPipeline"), false);
  const profile = new WebGpuCompilationProfile(f.engine, { now: f.now });
  const retained = f.device.createRenderPipeline;
  const laterOwner = () => ({ owner: "later" });
  f.device.createRenderPipeline = laterOwner;
  f.engine.onDisposeObservable.notifyObservers();
  assert.equal(f.device.createRenderPipeline, laterOwner);
  assert.equal(profile.snapshot().active, false);
  assert.equal(retained.call(f.device, {}), f.device.pipeline);
  assert.equal(profile.snapshot().metrics.syncPipeline.calls, 0);
  profile.dispose();
  const other = fixture();
  const next = new WebGpuCompilationProfile(other.engine);
  next.dispose();
  assert.equal(Object.hasOwn(other.device, "createRenderPipeline"), false);
  assert.equal(typeof original, "function");
});

test("instrumentation callbacks cannot replace sync throws or returned values and slow labels are bounded", () => {
  const f = fixture();
  const failure = new Error("driver failure");
  f.device.failSync = failure;
  const labels: string[] = [];
  const profile = new WebGpuCompilationProfile(f.engine, {
    now: f.now,
    slowCallMs: 20,
    onError: () => {
      f.tick(1000);
      throw new Error("observer failed");
    },
    onSlowCall: ({ label }) => {
      labels.push(label);
      throw new Error("event failed");
    },
  });
  assert.throws(
    () => f.device.createRenderPipeline({ label: "x".repeat(10000) }),
    (error) => error === failure,
  );
  const result = profile.snapshot();
  assert.equal(
    result.metrics.syncPipeline.cpuTotalMs,
    31,
    "observer work is excluded from API duration",
  );
  assert.equal(result.metrics.syncPipeline.failures, 1);
  assert.equal(result.observerErrors, 2);
  assert.equal(labels[0].length, 160);
  profile.dispose();
});

test("absent or immutable hooks stay explicitly unavailable and WebGL remains untouched", () => {
  const f = fixture();
  const original = f.device.createRenderPipeline;
  Object.defineProperty(f.device, "createRenderPipeline", {
    value: original,
    writable: false,
    configurable: false,
  });
  const profile = new WebGpuCompilationProfile(f.engine);
  assert.equal(
    profile.snapshot().hooks["device.createRenderPipeline"],
    "unavailable",
  );
  assert.equal(f.device.createRenderPipeline, original);
  assert.throws(() => new WebGpuCompilationProfile(f.engine), /already/);
  profile.dispose();
  const gl = fixture();
  gl.engine.isWebGPU = false;
  const method = gl.device.createShaderModule;
  const skipped = new WebGpuCompilationProfile(gl.engine);
  assert.equal(gl.device.createShaderModule, method);
  assert.equal(skipped.snapshot().backend, "other");
  assert.equal(
    skipped.snapshot().hooks["device.createShaderModule"],
    "unavailable",
  );
  skipped.dispose();
});
