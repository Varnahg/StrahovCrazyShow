import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { Observable } from "@babylonjs/core/Misc/observable";
import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import type { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import {
  WebGpuFrameLifecycleProfile,
  type FrameLifecycleEngine,
} from "../client/webgpu-frame-lifecycle-profile";

class Host {
  next = 0;
  callbacks = new Map<number, (timestamp: number) => void>();
  cancelled: number[] = [];
  requestAnimationFrame(callback: (timestamp: number) => void) {
    const id = ++this.next;
    this.callbacks.set(id, callback);
    return id;
  }
  cancelAnimationFrame(id: number) {
    this.cancelled.push(id);
    this.callbacks.delete(id);
  }
  fire(timestamp: number) {
    const callbacks = [...this.callbacks.entries()];
    for (const [id] of callbacks) this.callbacks.delete(id);
    for (const [, callback] of callbacks) callback(timestamp);
  }
}

function fixture() {
  const clock = { time: 0, enabled: true };
  const tick = (ms: number) => {
    if (clock.enabled) clock.time += ms;
  };
  const host = new Host();
  const ended = {};
  const submitted = {};
  class Pass {
    end() {
      assert.ok(this instanceof Pass);
      tick(9);
      return ended;
    }
  }
  class Encoder {
    constructor(readonly label = "query") {}
    result = {};
    finish() {
      assert.ok(this instanceof Encoder);
      tick(this.label === "query" ? 17 : 11);
      return this.result;
    }
    beginRenderPass(descriptor: unknown) {
      assert.ok(this instanceof Encoder);
      tick(2);
      return new Pass();
    }
  }
  class Device {
    features = new Set(["timestamp-query"]);
    queue = {
      submit(buffers: unknown) {
        tick(1);
        return submitted;
      },
      writeBuffer(...args: unknown[]) {
        tick(5);
        return args;
      },
      writeTexture(...args: unknown[]) {
        tick(6);
        return args;
      },
      copyExternalImageToTexture(...args: unknown[]) {
        tick(7);
        return args;
      },
    };
    createCommandEncoder(descriptor?: { label?: string }) {
      assert.ok(this instanceof Device);
      tick(3);
      return new Encoder(descriptor?.label);
    }
  }
  class Engine {
    isWebGPU = true;
    frameId = 0;
    maxFPS: number | undefined;
    customAnimationFrameRequester: object | undefined;
    skipFrameRender = false;
    _contextWasLost = false;
    _windowIsBackground = false;
    renderEvenInBackground = true;
    enableGPUTimingMeasurements = true;
    _activeRenderLoops = [() => {}];
    _device = new Device();
    _context = {
      getCurrentTexture: () => {
        tick(7);
        return {};
      },
    };
    _uploadEncoder = new Encoder("upload");
    _renderEncoder = new Encoder("render");
    _currentRenderPass: Pass | null = null;
    _timestampQuery = {
      startFrame: () => {
        tick(1);
      },
      endFrame: () => {
        tick(2);
      },
      endPass: () => {
        // Query encoding happens synchronously before timestamp readback awaits.
        const query = this._device.createCommandEncoder();
        this._device.queue.submit([query.finish()]);
        tick(2);
      },
    };
    _textureHelper = {
      destroyDeferredTextures: () => {
        tick(4);
      },
    };
    _bufferManager = {
      destroyDeferredBuffers: () => {
        tick(6);
      },
    };
    onDisposeObservable = new Observable<void>();
    onContextRestoredObservable = new Observable<void>();
    host = host;
    capped = false;
    getHostWindow() {
      return this.host;
    }
    getCaps() {
      return { timerQuery: {} };
    }
    _initializeLimits() {}
    _isOverFrameTime(timestamp: number) {
      return this.capped;
    }
    _queueNewFrameForRenderLoop() {
      return this.host.requestAnimationFrame((timestamp) =>
        this._processFrame(timestamp),
      );
    }
    _processFrame(timestamp: number) {
      if (this._isOverFrameTime(timestamp)) return submitted;
      this.beginFrame();
      this._renderFrame();
      this.endFrame();
      return submitted;
    }
    beginFrame(): unknown {
      tick(2);
      return ended;
    }
    _renderFrame() {
      tick(3);
      this._currentRenderPass = this._renderEncoder.beginRenderPass({
        label: "main",
      });
      this._context.getCurrentTexture();
      this._device.queue.writeBuffer(new Uint8Array([1]));
    }
    _endCurrentRenderPass() {
      if (!this._currentRenderPass) return 0;
      this._currentRenderPass.end();
      this._timestampQuery.endPass();
      this._currentRenderPass = null;
      return 2;
    }
    flushFramebuffer() {
      this._endCurrentRenderPass();
      this._device.queue.submit([
        this._uploadEncoder.finish(),
        this._renderEncoder.finish(),
      ]);
      this._uploadEncoder = this._device.createCommandEncoder({
        label: "upload",
      });
      this._renderEncoder = this._device.createCommandEncoder({
        label: "render",
      });
      this._timestampQuery.startFrame();
    }
    endFrame() {
      this._endCurrentRenderPass();
      this._timestampQuery.endFrame();
      this.flushFramebuffer();
      this._textureHelper.destroyDeferredTextures();
      this._bufferManager.destroyDeferredBuffers();
      tick(3);
      this.frameId++;
    }
  }
  const engine = new Engine();
  return {
    engine,
    clock,
    host,
    tick,
    Engine,
    Device,
    Encoder,
    Pass,
    ended,
    submitted,
    now: () => clock.time,
  };
}
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("whole engine frame measures nested begin/end, query and both existing encoder finishes without replacing returns", () => {
  const f = fixture();
  const slow: {
    phase: string;
    label: string;
    cpuMs: number;
    frameId: number | null;
  }[] = [];
  const originalSubmit = f.engine._device.queue.submit;
  const profile = new WebGpuFrameLifecycleProfile(f.engine, {
    now: f.now,
    onSlowCall: (e) => slow.push(e),
  });
  try {
    assert.equal(f.engine._processFrame(0), f.submitted);
    const s = profile.snapshot();
    assert.equal(s.phases.beginFrame?.cpuTotalMs, 2);
    assert.equal(s.phases.renderFrame?.cpuTotalMs, 17);
    assert.equal(s.phases.endFrame?.cpuTotalMs, 77);
    assert.equal(s.phases.processFrame?.cpuTotalMs, 96);
    assert.equal(s.phases.encoderFinish?.calls, 3);
    assert.equal(
      s.phases.encoderFinish?.cpuTotalMs,
      39,
      "includes the independent timestamp query encoder",
    );
    assert.equal(s.phases.createEncoder?.calls, 3);
    assert.equal(s.phases.passEnd?.cpuTotalMs, 9);
    assert.equal(s.phases.currentTexture?.cpuTotalMs, 7);
    assert.equal(s.phases.flush?.cpuTotalMs, 30);
    assert.equal(s.phases.timestampPassEnd?.cpuTotalMs, 23);
    assert.equal(s.phases.destroyTextures?.cpuTotalMs, 4);
    assert.equal(s.phases.destroyBuffers?.cpuTotalMs, 6);
    assert.equal(s.phases.writeBuffer?.cpuTotalMs, 5);
    assert.equal(
      f.engine._device.queue.submit,
      originalSubmit,
      "existing compilation profile keeps submit ownership",
    );
    assert.ok(slow.some((e) => e.phase === "endFrame" && e.cpuMs === 77));
    assert.ok(
      slow.every((e) => e.frameId === 0),
      "nested slow events use the frame id at entry, before endFrame increments it",
    );
    assert.match(s.scope.cpu, /never sum/);
    assert.deepEqual(
      [
        s.runtime.enableGPUTimingMeasurements,
        s.runtime.timerQueryCapability,
        s.runtime.timestampQueryFeature,
      ],
      [true, true, true],
    );
    assert.equal(
      s.resources.tracked,
      2,
      "only the two next-frame encoders remain live",
    );
    s.phases.processFrame!.calls = 999;
    assert.equal(profile.snapshot().phases.processFrame?.calls, 1);
  } finally {
    profile.dispose();
  }
});

test("raw RAF and engine callback cadence remain separate and cap skips are observable", () => {
  const f = fixture();
  f.clock.enabled = false;
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  try {
    for (let i = 0; i <= 120; i++) {
      f.clock.time = i * (1000 / 60);
      f.host.fire(f.clock.time);
      if (i % 60 === 0) f.engine._processFrame(f.clock.time);
    }
    const s = profile.snapshot();
    assert.equal(s.rawRaf.callbacks, 121);
    assert.ok(Math.abs(s.rawRaf.intervals!.recentP50Ms - 1000 / 60) < 1e-9);
    assert.ok(
      Math.abs(s.engineCadence.processIntervals!.recentP50Ms - 1000) < 1e-9,
    );
    assert.ok(
      Math.abs(s.engineCadence.renderCallbackIntervals!.recentP50Ms - 1000) <
        1e-9,
    );
    f.engine.maxFPS = 1;
    f.engine.capped = true;
    f.clock.time += 16;
    f.engine._processFrame(f.clock.time);
    assert.equal(profile.snapshot().engineCadence.skippedByMaxFPS, 1);
    assert.equal(profile.snapshot().phases.renderFrame?.calls, 3);
    assert.equal(profile.snapshot().runtime.maxFPS, 1);
  } finally {
    profile.dispose();
  }
});

test("queue-to-process delay and raw delivery delay use distinct timestamps", () => {
  const f = fixture();
  f.clock.enabled = false;
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  try {
    f.clock.time = 10;
    const handle = f.engine._queueNewFrameForRenderLoop();
    assert.equal(typeof handle, "number");
    f.clock.time = 35;
    f.host.fire(30);
    const s = profile.snapshot();
    assert.equal(s.rawRaf.deliveryDelay?.maxMs, 5);
    assert.equal(s.engineCadence.queueToProcess?.maxMs, 25);
  } finally {
    profile.dispose();
  }
});

test("short-lived resources are restored promptly and the abandoned weak inventory is bounded", () => {
  const f = fixture();
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  try {
    for (let i = 0; i < 1000; i++) {
      const encoder = f.engine._device.createCommandEncoder({ label: "query" });
      const pass = encoder.beginRenderPass({});
      assert.equal(pass.end(), f.ended);
      assert.equal(Object.hasOwn(pass, "end"), false);
      assert.equal(encoder.finish(), encoder.result);
      assert.equal(Object.hasOwn(encoder, "finish"), false);
    }
    assert.equal(profile.snapshot().resources.tracked, 2);
    const retained = Array.from({ length: 520 }, () =>
      f.engine._device.createCommandEncoder(),
    );
    const s = profile.snapshot();
    assert.equal(s.resources.tracked, s.resources.limit);
    assert.ok(s.resources.missed > 0);
    assert.equal(s.hooks["encoder.finish"].availability, "partial");
    profile.dispose();
    assert.ok(retained.every((e) => !Object.hasOwn(e, "finish")));
    assert.equal(profile.snapshot().resources.tracked, 0);
  } finally {
    profile.dispose();
  }
});

test("unavailable/readonly GPU hooks are null instead of false zero measurements", () => {
  const f = fixture();
  const engine = {
    isWebGPU: true,
    onDisposeObservable: new Observable<void>(),
    _device: { createCommandEncoder: () => Object.freeze({ finish: () => 3 }) },
  };
  const profile = new WebGpuFrameLifecycleProfile(engine, { now: f.now });
  try {
    assert.equal(engine._device.createCommandEncoder().finish(), 3);
    const s = profile.snapshot();
    assert.equal(s.phases.encoderFinish, null);
    assert.equal(s.hooks["encoder.finish"].availability, "unwrappable");
    assert.equal(s.phases.currentTexture, null);
    assert.equal(s.rawRaf.availability, "unavailable");
    assert.equal(s.runtime.timerQueryCapability, null);
    assert.equal(s.runtime.timestampQueryFeature, null);
  } finally {
    profile.dispose();
  }
});

test("method descriptors and receiver/argument identity survive; later foreign ownership wins", () => {
  const f = fixture();
  const oldBegin = Object.getOwnPropertyDescriptor(
    f.Engine.prototype,
    "beginFrame",
  );
  const calls: unknown[] = [];
  const original = function (this: unknown, value: unknown) {
    calls.push(this, value);
    return value;
  };
  Object.defineProperty(f.engine, "beginFrame", {
    value: original,
    configurable: true,
    writable: false,
    enumerable: true,
  });
  const own = Object.getOwnPropertyDescriptor(f.engine, "beginFrame");
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  const value = {};
  assert.equal(Reflect.apply(f.engine.beginFrame, f.engine, [value]), value);
  assert.deepEqual(calls, [f.engine, value]);
  const foreign = () => {};
  f.engine.endFrame = foreign;
  assert.equal(
    profile.snapshot().hooks["engine.endFrame"].reason,
    "ownership-lost",
  );
  assert.equal(
    profile.snapshot().hooks["engine.endFrame"].availability,
    "partial",
  );
  assert.equal(profile.snapshot().hooks["engine.endFrame"].missedObjects, 1);
  profile.dispose();
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(f.engine, "beginFrame"),
    own,
  );
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(f.Engine.prototype, "beginFrame"),
    oldBegin,
  );
  assert.equal(f.engine.endFrame, foreign);
});

test("Promise and thenable returns are not inspected or given handlers; rejection stays caller-owned", async () => {
  const f = fixture();
  const pending = deferred<object>();
  let thenReads = 0;
  Object.defineProperty(pending.promise, "then", {
    configurable: true,
    get() {
      thenReads++;
      return Promise.prototype.then;
    },
  });
  let result: unknown = pending.promise;
  f.engine.beginFrame = function () {
    assert.equal(this, f.engine);
    f.tick(2);
    return result;
  };
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  try {
    assert.equal(f.engine.beginFrame(), pending.promise);
    assert.equal(
      thenReads,
      0,
      "even reading then is an observable side effect",
    );
    assert.equal(profile.snapshot().phases.beginFrame?.returned, 1);
    assert.equal(
      profile.snapshot().phases.beginFrame?.asyncCompletion,
      "unobserved",
    );
    f.tick(40);
    const failure = new Error("original async failure");
    const caller = pending.promise.catch((error) => {
      assert.equal(error, failure);
    });
    pending.reject(failure);
    await caller;
    await settle();
    const metric = profile.snapshot().phases.beginFrame!;
    assert.equal(metric.cpuTotalMs, 2);
    assert.equal(metric.returned, 1);
    assert.equal(
      metric.thrown,
      0,
      "async rejection is not a synchronous throw",
    );
    assert.equal(Object.hasOwn(metric, "pending"), false);
    let inspected = false;
    result = {
      get then() {
        inspected = true;
        throw new Error("must not inspect return");
      },
    };
    assert.equal(f.engine.beginFrame(), result);
    assert.equal(inspected, false);
    assert.equal(profile.snapshot().phases.beginFrame?.returned, 2);
  } finally {
    pending.resolve({});
    profile.dispose();
  }
});

test("a synchronous throw retains identity and has a separate thrown counter", () => {
  const f = fixture();
  const error = new Error("original synchronous failure");
  f.engine.beginFrame = () => {
    throw error;
  };
  const next = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  try {
    assert.throws(
      () => f.engine.beginFrame(),
      (e) => e === error,
    );
    assert.equal(next.snapshot().phases.beginFrame?.thrown, 1);
    assert.equal(next.snapshot().phases.beginFrame?.returned, 0);
  } finally {
    next.dispose();
  }
});

for (const lifecycle of ["active", "dispose", "generation"])
  test(`unhandled Promise rejection remains observable for ${lifecycle} owner`, () => {
    // Isolated child: Node's test runner must not itself handle or fail this
    // deliberately unhandled application Promise. No shell interpolation.
    const moduleUrl = new URL(
      "../client/webgpu-frame-lifecycle-profile.ts",
      import.meta.url,
    ).href;
    const script = `
      import { WebGpuFrameLifecycleProfile } from ${JSON.stringify(moduleUrl)};
      function observable() {
        const handlers = new Set();
        return { add(callback) { handlers.add(callback); return { remove() { handlers.delete(callback); } }; },
          fire() { for (const callback of handlers) callback(); } };
      }
      let reject;
      const promise = new Promise((_yes, no) => { reject = no; });
      const failure = new Error('original late failure');
      let observed = 0;
      process.on('unhandledRejection', (error, original) => {
        if (error === failure && original === promise) observed++;
      });
      const engine = { isWebGPU: true, _device: { queue: {} },
        onDisposeObservable: observable(), onContextRestoredObservable: observable(),
        beginFrame() { return promise; } };
      const profile = new WebGpuFrameLifecycleProfile(engine, { now: () => 0 });
      if (engine.beginFrame() !== promise) throw new Error('Promise identity changed');
      const lifecycle = ${JSON.stringify(lifecycle)};
      if (lifecycle === 'dispose') profile.dispose();
      if (lifecycle === 'generation') {
        engine._device = { queue: {} }; engine.onContextRestoredObservable.fire();
      }
      reject(failure);
      setImmediate(() => setImmediate(() => {
        console.log(JSON.stringify({ lifecycle, observed, phase: profile.snapshot().phases.beginFrame }));
        profile.dispose();
        process.exitCode = observed === 1 ? 0 : 3;
      }));
    `;
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        import.meta.resolve("tsx"),
        "--input-type=module",
        "--eval",
        script,
      ],
      {
        encoding: "utf8",
        timeout: 10000,
        maxBuffer: 64 * 1024,
      },
    );
    assert.equal(
      child.status,
      0,
      `${lifecycle}: ${child.stdout}\n${child.stderr}\n${child.error ?? ""}`,
    );
    const outcome = JSON.parse(child.stdout.trim());
    assert.equal(outcome.observed, 1);
    assert.equal(outcome.phase.asyncCompletion, "unobserved");
  });

test("throwing clocks/slow observers and reentrant reporting cannot change engine operations", () => {
  const f = fixture();
  let originalCalls = 0;
  f.engine.beginFrame = () => {
    originalCalls++;
    f.tick(30);
    return f.ended;
  };
  const profile = new WebGpuFrameLifecycleProfile(f.engine, {
    now: f.now,
    onSlowCall: () => {
      f.engine.beginFrame();
      throw new Error("diagnostic consumer");
    },
  });
  try {
    assert.equal(f.engine.beginFrame(), f.ended);
    assert.equal(originalCalls, 2);
    assert.equal(profile.snapshot().phases.beginFrame?.calls, 1);
    assert.equal(profile.snapshot().observerErrors, 1);
  } finally {
    profile.dispose();
  }
  const brokenClock = new WebGpuFrameLifecycleProfile(f.engine, {
    now: () => {
      throw new Error("clock");
    },
  });
  try {
    assert.equal(f.engine.beginFrame(), f.ended);
    assert.ok(brokenClock.snapshot().invalidClocks > 0);
  } finally {
    brokenClock.dispose();
  }
});

test("context generation restores old methods without observing old Promise completion", async () => {
  const f = fixture();
  const oldDevice = f.engine._device;
  const originalCreate = oldDevice.createCommandEncoder;
  const pending = deferred<object>();
  f.engine.beginFrame = () => pending.promise;
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  try {
    f.engine.beginFrame();
    const oldRaw = [...f.host.callbacks.values()][0];
    f.engine._device = new f.Device();
    f.engine._context = { getCurrentTexture: () => ({}) };
    f.engine._uploadEncoder = new f.Encoder("upload");
    f.engine._renderEncoder = new f.Encoder("render");
    f.engine.onContextRestoredObservable.notifyObservers();
    assert.equal(oldDevice.createCommandEncoder, originalCreate);
    assert.equal(profile.snapshot().generation, 2);
    oldRaw(100);
    pending.resolve({});
    await settle();
    assert.equal(profile.snapshot().phases.beginFrame?.calls, 0);
    assert.equal(profile.snapshot().phases.beginFrame?.returned, 0);
    assert.equal(profile.snapshot().rawRaf.callbacks, 0);
    f.engine._device.createCommandEncoder().finish();
    assert.equal(profile.snapshot().phases.encoderFinish?.calls, 1);
  } finally {
    profile.dispose();
  }
});

test("a new device generation cannot inherit installed coverage from missing old hooks", () => {
  const f = fixture();
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  try {
    f.engine._device.queue.writeBuffer(1);
    assert.equal(profile.snapshot().phases.writeBuffer?.calls, 1);
    const device = new f.Device();
    delete (device.queue as Partial<typeof device.queue>).writeBuffer;
    f.engine._device = device;
    f.engine.onContextRestoredObservable.notifyObservers();
    assert.equal(profile.snapshot().phases.writeBuffer, null);
    assert.equal(
      profile.snapshot().hooks["queue.writeBuffer"].availability,
      "unavailable",
    );
    f.engine.enableGPUTimingMeasurements = false;
    device.features.delete("timestamp-query");
    assert.equal(profile.snapshot().runtime.enableGPUTimingMeasurements, false);
    assert.equal(profile.snapshot().runtime.timestampQueryFeature, false);
  } finally {
    profile.dispose();
  }
});

test("dispose cancels only its raw RAF, ignores stale callbacks and permits a later owner", () => {
  const f = fixture();
  const foreign = f.host.requestAnimationFrame(() => {});
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  const stale = f.host.callbacks.get(f.host.next)!;
  assert.throws(() => new WebGpuFrameLifecycleProfile(f.engine), /already/);
  f.engine.onDisposeObservable.notifyObservers();
  stale(100);
  assert.equal(f.host.callbacks.has(foreign), true);
  assert.equal(profile.snapshot().rawRaf.callbacks, 0);
  assert.equal(profile.snapshot().active, false);
  profile.dispose();
  const next = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  next.dispose();
});

test("synchronous raw providers are bounded and their returned handle is cancelled", () => {
  const f = fixture();
  const cancelled: number[] = [];
  let requests = 0;
  const profile = new WebGpuFrameLifecycleProfile(f.engine, {
    now: f.now,
    rawFrame: {
      request(callback) {
        requests++;
        callback(0);
        return 42;
      },
      cancel(handle) {
        cancelled.push(handle);
      },
    },
  });
  try {
    assert.equal(requests, 1);
    assert.deepEqual(cancelled, [42]);
    assert.equal(
      profile.snapshot().rawRaf.availability,
      "synchronous-provider-unsupported",
    );
  } finally {
    profile.dispose();
  }
});

test("disposal during raw request registration cancels the late returned handle", () => {
  const f = fixture();
  const cancelled: number[] = [];
  const original = f.engine.beginFrame;
  const profile = new WebGpuFrameLifecycleProfile(f.engine, {
    now: f.now,
    rawFrame: {
      request() {
        f.engine.onDisposeObservable.notifyObservers();
        return 81;
      },
      cancel(handle) {
        cancelled.push(handle);
      },
    },
  });
  assert.equal(profile.snapshot().active, false);
  assert.deepEqual(cancelled, [81]);
  assert.equal(f.engine.beginFrame, original);
});

test("a device already observed by another engine is not hijacked", () => {
  const f = fixture();
  const first = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  const create = f.engine._device.createCommandEncoder;
  const secondEngine = new f.Engine();
  secondEngine._device = f.engine._device;
  const second = new WebGpuFrameLifecycleProfile(secondEngine, { now: f.now });
  try {
    assert.equal(second.snapshot().phases.createEncoder, null);
    assert.equal(
      second.snapshot().hooks["device.createCommandEncoder"].availability,
      "ownership-conflict",
    );
    second.dispose();
    assert.equal(f.engine._device.createCommandEncoder, create);
  } finally {
    second.dispose();
    first.dispose();
  }
});

test("host replacement moves the raw probe, while non-WebGPU construction owns nothing", () => {
  const f = fixture();
  f.clock.enabled = false;
  const profile = new WebGpuFrameLifecycleProfile(f.engine, { now: f.now });
  const old = f.host;
  const oldEpoch = profile.snapshot().rawRaf.epoch;
  const next = new Host();
  f.engine.host = next;
  f.engine._processFrame(0);
  assert.equal(old.callbacks.size, 0);
  assert.equal(next.callbacks.size, 1);
  assert.equal(profile.snapshot().runtime.rawProbeUsesCurrentHost, true);
  assert.ok(profile.snapshot().rawRaf.epoch > oldEpoch);
  profile.dispose();
  const noGpu = { ...f.engine, isWebGPU: false };
  const inactive = new WebGpuFrameLifecycleProfile(noGpu, { now: f.now });
  assert.equal(inactive.snapshot().active, false);
  assert.equal(next.callbacks.size, 0);
  inactive.dispose();
});

test("raw delivery delay stays unknown when the host timestamp origin is not verified", () => {
  const f = fixture();
  const profile = new WebGpuFrameLifecycleProfile(f.engine);
  try {
    f.host.fire(100);
    f.host.fire(116);
    assert.equal(profile.snapshot().rawRaf.intervals?.recentP50Ms, 16);
    assert.equal(profile.snapshot().rawRaf.deliveryDelay, null);
    assert.equal(profile.snapshot().rawRaf.deliveryClock, "origin-unverified");
  } finally {
    profile.dispose();
  }
});

test("synchronous disposal subscription replay detaches the returned observer", () => {
  let removed = 0;
  const engine: FrameLifecycleEngine = {
    isWebGPU: true,
    onDisposeObservable: {
      add(callback) {
        callback();
        return {
          remove() {
            removed++;
          },
        };
      },
    },
  };
  const profile = new WebGpuFrameLifecycleProfile(engine);
  assert.equal(profile.snapshot().active, false);
  assert.equal(removed, 1);
});

test("nullable or throwing lifecycle subscriptions remain explicit and safe to dispose", () => {
  const engine: FrameLifecycleEngine = {
    isWebGPU: true,
    onDisposeObservable: { add: () => null },
    onContextRestoredObservable: {
      add() {
        throw new Error("observer registration");
      },
    },
  };
  const profile = new WebGpuFrameLifecycleProfile(engine);
  assert.equal(
    profile.snapshot().hooks["lifecycle.dispose"].availability,
    "subscription-declined",
  );
  assert.equal(
    profile.snapshot().hooks["lifecycle.restore"].availability,
    "subscription-failed",
  );
  assert.doesNotThrow(() => profile.dispose());
});

// Compile-time integration contract only: no real device is created by this test.
const acceptsAbstractEngine = (engine: AbstractEngine) =>
  new WebGpuFrameLifecycleProfile(engine);
const acceptsWebGpuEngine = (engine: WebGPUEngine) =>
  new WebGpuFrameLifecycleProfile(engine);
void acceptsAbstractEngine;
void acceptsWebGpuEngine;
