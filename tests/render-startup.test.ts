import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Observable } from "@babylonjs/core/Misc/observable";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.pure";
import { RenderHealth } from "../client/render-health";
import { WebGpuCompilationProfile } from "../client/webgpu-compilation-profile";
import {
  waitForRenderStartup,
  type RenderStartupHost,
} from "../client/render-startup";

function pinnedEndFrame(onFlush: () => void, onSubmit: () => void) {
  const noop = () => {}, encoder = () => ({ finish: () => ({}) });
  const state = {
    _endCurrentRenderPass: noop, _debugPopBeforeEndOfEncoder: noop,
    _debugPushAfterStartOfEncoder: noop, _snapshotRendering: { endFrame: noop },
    _timestampQuery: { endFrame: noop, startFrame: noop },
    _uploadEncoder: encoder(), _renderEncoder: encoder(), _commandBuffers: [],
    _device: { queue: { submit: onSubmit }, createCommandEncoder: encoder },
    _uploadEncoderDescriptor: {}, _renderEncoderDescriptor: {},
    _debugMarkersEncoderGroups: [], _debugMarkersPassGroups: [],
    _textureHelper: { destroyDeferredTextures: noop, setCommandEncoder: noop },
    _bufferManager: { destroyDeferredBuffers: noop }, _bundleList: { reset: noop },
    countersLastFrame: {}, _counters: {}, _frameId: 0, frameId: 0,
    _cacheRenderPipeline: { endFrame: noop }, _cacheBindGroups: { endFrame: noop },
    onEndFrameObservable: { notifyObservers: noop },
    flushFramebuffer(fromEnd?: boolean) {
      onFlush();
      return WebGPUEngine.prototype.flushFramebuffer.call(this as unknown as WebGPUEngine, fromEnd);
    },
  };
  return () => WebGPUEngine.prototype.endFrame.call(state as unknown as WebGPUEngine);
}

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function flush() {
  for (let i = 0; i < 30; i++) await Promise.resolve();
}

function fixture(native = true, onFault?: () => void) {
  const engine = new NullEngine();
  const lost = deferred<{ reason: string; message: string }>();
  let submissions = 0,
    flushes = 0, gpuSubmits = 0,
    pushes = 0,
    pops = 0,
    begins = 0,
    ends = 0,
    renders = 0;
  let queue: Promise<void> = Promise.resolve();
  let validation: Promise<{ message: string } | null> = Promise.resolve(null);
  const device = Object.assign(new EventTarget(), {
    lost: lost.promise,
    pushErrorScope(filter: string) {
      assert.equal(filter, "validation");
      pushes++;
    },
    popErrorScope() {
      pops++;
      return validation;
    },
    queue: {
      onSubmittedWorkDone() {
        submissions++;
        return queue;
      },
    },
  });
  if (native) {
    Object.assign(engine, { onQueryReadErrorObservable: new Observable() });
    (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
    (engine as unknown as { _device: unknown })._device = device;
  }
  engine.beginFrame = () => {
    begins++;
  };
  const submitFrame = pinnedEndFrame(() => flushes++, () => gpuSubmits++);
  engine.endFrame = () => {
    ends++;
    submitFrame();
  };
  const health = new RenderHealth(engine, "game", onFault);
  let now = 0,
    visible = true,
    nextId = 1;
  const frames = new Map<number, () => void>();
  const timers = new Map<number, { at: number; run(): void }>();
  const listeners = new Set<() => void>();
  const host: RenderStartupHost = {
    requestFrame(callback) {
      const id = nextId++;
      frames.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      frames.delete(id);
    },
    visible: () => visible,
    now: () => now,
    setTimer(callback, delay) {
      const id = nextId++;
      timers.set(id, { at: now + delay, run: callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
    observeVisibility(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
  };
  return {
    engine,
    device,
    health,
    host,
    lost,
    frames,
    timers,
    listeners,
    render() {
      renders++;
    },
    counts: () => ({ submissions, pushes, pops, begins, ends, renders }),
    gpuCounts: () => ({ flushes, gpuSubmits }),
    setQueue(value: Promise<void>) {
      queue = value;
    },
    setValidation(value: Promise<{ message: string } | null>) {
      validation = value;
    },
    visibility(value: boolean) {
      visible = value;
      for (const listener of listeners) listener();
    },
    advance(ms: number, fireTimers = true) {
      now += ms;
      if (fireTimers)
        for (const [id, timer] of [...timers]) {
          if (timer.at <= now) {
            timers.delete(id);
            timer.run();
          }
        }
    },
    async frame() {
      assert.equal(frames.size, 1, "one scheduled frame at most");
      const [id, callback] = frames.entries().next().value!;
      frames.delete(id);
      callback();
      await flush();
    },
    idle() {
      assert.equal(frames.size, 0);
      assert.equal(timers.size, 0);
      assert.equal(listeners.size, 0);
    },
    dispose: () => engine.dispose(),
  };
}

function shaderDiagnostics(f: ReturnType<typeof fixture>) {
  const info = deferred<{ messages: { type: string; message: string }[] }>();
  const device = Object.assign(f.device, {
    createShaderModule: () => ({ getCompilationInfo: () => info.promise }),
  });
  const profile = new WebGpuCompilationProfile(f.engine, {
    track: (operation, channel, label, kind) =>
      f.health.track(operation, channel, label, kind),
    onError: (channel, error) => f.health.report(channel, error),
  });
  return { info, profile, create: () => device.createShaderModule() };
}

test("explicit ready-generation revalidation still submits and waits for scope/fence/pending readiness without another state transition", async (t) => {
  const f = fixture(); assert.equal(f.health.markReady(), true);
  const owner = f.health.snapshot(), fence = deferred<void>(), pending = deferred<void>();
  t.mock.method(f.health, "markReady", () => { throw new Error("must not transition ready twice"); });
  f.setQueue(fence.promise); f.health.track(pending.promise, "shader", "existing validation", "shader-validation");
  let checks = 0, complete = false;
  const gate = waitForRenderStartup({ ...f, revalidate: owner, timeoutMs: 7000, isReady: () => { checks++; return true; } }, f.host);
  void gate.then(() => { complete = true; });
  try {
    await f.frame(); assert.equal(complete, false); assert.equal(f.counts().renders, 1); assert.equal(f.counts().submissions, 1);
    fence.resolve(); await flush(); assert.equal(complete, false, "pending shader validation still blocks ready");
    pending.resolve(); await flush(); await f.frame(); await gate;
    assert.equal(complete, true); assert.ok(checks >= 4); assert.equal(f.counts().pushes, f.counts().pops);
    assert.equal(f.health.snapshot().valid, true); f.idle();
  } finally { f.dispose(); }
});

test("ready revalidation refuses foreign generation and a generation changed while the original fence is pending", async () => {
  for (const late of [false, true]) {
    const f = fixture(); assert.equal(f.health.markReady(), true); const owner = f.health.snapshot(), fence = deferred<void>();
    f.setQueue(fence.promise);
    const token = { rendererId: owner.rendererId, generation: owner.generation + (late ? 0 : 1) };
    const gate = waitForRenderStartup({ ...f, revalidate: token, isReady: () => true }, f.host);
    const rejection = assert.rejects(gate, /generation|ready/);
    try {
      if (late) await f.frame();
      else assert.equal(f.counts().renders, 0, "foreign generation refuses before GPU IO");
      if (late) { Object.defineProperty(f.health, "generation", { value: owner.generation + 1, writable: true, configurable: true }); fence.resolve(); await flush(); }
      await rejection; f.idle();
    } finally { fence.resolve(); f.dispose(); }
  }
});

test("ready revalidation preserves original validation error and the caller's remaining deadline", async () => {
  for (const failure of ["validation", "deadline"] as const) {
    const f = fixture(); assert.equal(f.health.markReady(), true); const owner = f.health.snapshot(), fence = deferred<void>();
    f.setQueue(fence.promise); if (failure === "validation") f.setValidation(Promise.resolve({ message: "same original scoped failure" }));
    const gate = waitForRenderStartup({ ...f, revalidate: owner, timeoutMs: 25, isReady: () => true }, f.host);
    const rejected = assert.rejects(gate, failure === "validation" ? /same original scoped failure/ : /timeout|deadline|čas/i);
    try {
      await f.frame(); if (failure === "deadline") f.advance(26); fence.resolve(); await flush(); await rejected; f.idle();
    } finally { fence.resolve(); f.dispose(); }
  }
});

test("final submission waits for diagnostic-only shader work created by that same frame", async () => {
  const f = fixture(),
    { info, profile, create } = shaderDiagnostics(f);
  try {
    const ready = waitForRenderStartup({
      ...f,
      isReady: () => true,
      render() {
        f.render();
        if (f.counts().renders === 1) create();
      },
    }, f.host);
    await f.frame();
    const state = f.health.snapshot();
    assert.equal(state.pendingPreparationOperations, 0);
    assert.equal(state.pendingShaderValidationOperations, 1);
    assert.equal(state.pendingOperations, 1);
    assert.equal(state.phase, "preparing");
    assert.equal(
      f.counts().submissions, 1,
      "queue completion does not replace shader diagnostics",
    );
    info.resolve({ messages: [{ type: "warning", message: "unused binding" }] });
    await flush();
    await f.frame();
    await ready;
    assert.equal(f.health.snapshot().valid, true);
    assert.equal(f.health.snapshot().pendingShaderValidationOperations, 0);
    f.idle();
  } finally {
    profile.dispose();
    f.dispose();
  }
});

test("late fulfilled compilation errors reject final acceptance after a successful submission", async () => {
  const f = fixture(),
    { info, profile, create } = shaderDiagnostics(f);
  try {
    create();
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, /invalid late variant/);
    await f.frame();
    assert.equal(f.counts().submissions, 1);
    info.resolve({ messages: [{ type: "error", message: "invalid late variant" }] });
    await rejected;
    assert.equal(f.health.snapshot().counts.shader, 1);
    assert.equal(f.health.snapshot().pendingOperations, 0);
    assert.equal(f.health.snapshot().valid, false);
    f.idle();
  } finally {
    profile.dispose();
    f.dispose();
  }
});

test("diagnostic-only pending work cannot extend the final visible deadline", async () => {
  const f = fixture(),
    { info, profile, create } = shaderDiagnostics(f);
  try {
    create();
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, { name: "RenderStartupTimeoutError" });
    await f.frame();
    f.advance(30_000);
    await rejected;
    assert.equal(f.health.snapshot().pendingPreparationOperations, 0);
    assert.equal(f.health.snapshot().pendingShaderValidationOperations, 1);
    info.resolve({ messages: [] });
    await flush();
    assert.equal(f.health.snapshot().valid, false);
    assert.equal(f.health.snapshot().pendingOperations, 0);
    f.idle();
  } finally {
    profile.dispose();
    f.dispose();
  }
});

test("startup needs an actual ready submitted frame, then removes all idle work", async () => {
  const f = fixture(),
    pending = deferred<void>();
  f.setQueue(pending.promise);
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    assert.equal(f.health.snapshot().phase, "preparing");
    await f.frame();
    assert.equal(f.health.snapshot().phase, "preparing");
    assert.deepEqual(f.counts(), {
      submissions: 1,
      pushes: 1,
      pops: 1,
      begins: 1,
      ends: 1,
      renders: 1,
    });
    assert.deepEqual(f.gpuCounts(), { flushes: 1, gpuSubmits: 1 });
    pending.resolve();
    await ready;
    assert.equal(f.health.snapshot().valid, true);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("readiness must hold before and after the frame and tracked compilation must finish", async () => {
  const f = fixture(),
    compilation = deferred<void>();
  let sceneReady = false;
  const tracked = f.health.track(
    compilation.promise,
    "shader",
    "active module",
  );
  try {
    const ready = waitForRenderStartup(
      {
        ...f,
        isReady: () => sceneReady,
        render() {
          f.render();
          sceneReady = true;
        },
      },
      f.host,
    );
    await f.frame();
    assert.equal(f.health.snapshot().phase, "preparing");
    await f.frame();
    assert.equal(f.health.snapshot().phase, "preparing");
    compilation.resolve();
    await tracked;
    await f.frame();
    await ready;
    assert.equal(f.counts().renders, 3);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("initially hidden time does not consume the startup budget or submit frames", async () => {
  const f = fixture();
  f.visibility(false);
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    f.advance(60_000);
    await flush();
    assert.equal(f.frames.size, 0);
    assert.equal(f.timers.size, 0);
    assert.equal(f.health.snapshot().phase, "preparing");
    f.visibility(true);
    await f.frame();
    await ready;
    f.idle();
  } finally {
    f.dispose();
  }
});

test("hiding during a pending submission pauses the timer and requires a visible ready frame", async () => {
  const f = fixture(),
    pending = deferred<void>();
  f.setQueue(pending.promise);
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    await f.frame();
    f.advance(20_000);
    f.visibility(false);
    f.advance(60_000);
    pending.resolve();
    await flush();
    assert.equal(f.health.snapshot().phase, "preparing");
    assert.equal(f.frames.size, 0);
    f.visibility(true);
    await f.frame();
    await ready;
    assert.equal(f.counts().renders, 2);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("a pending submission cannot hide the visible deadline and late success cannot mark ready", async () => {
  const f = fixture(),
    pending = deferred<void>();
  f.setQueue(pending.promise);
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, {
      name: "RenderStartupTimeoutError",
    });
    await f.frame();
    f.advance(30_000);
    await rejected;
    assert.equal(f.health.snapshot().valid, false);
    f.idle();
    const state = f.health.snapshot();
    pending.resolve();
    await flush();
    assert.deepEqual(f.health.snapshot(), state);
  } finally {
    f.dispose();
  }
});

test("a synchronous render stall loses to the deadline before the overdue timer task runs", async () => {
  const f = fixture();
  try {
    const ready = waitForRenderStartup(
      {
        ...f,
        isReady: () => true,
        render() {
          f.render();
          f.advance(31_000, false);
        },
      },
      f.host,
    );
    const rejected = assert.rejects(ready, {
      name: "RenderStartupTimeoutError",
    });
    await f.frame();
    await rejected;
    assert.equal(f.health.snapshot().valid, false);
    assert.equal(f.counts().ends, 1);
    assert.equal(f.counts().submissions, 0);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("native device loss promptly cancels a pending submission without Babylon restoration", async () => {
  const f = fixture(),
    pending = deferred<void>();
  f.setQueue(pending.promise);
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, /device lost.*GPU removed/);
    await f.frame();
    f.lost.resolve({ reason: "unknown", message: "GPU removed" });
    await rejected;
    assert.equal(f.health.snapshot().phase, "restart-required");
    assert.equal(f.health.snapshot().counts.device, 1);
    f.idle();
    const state = f.health.snapshot();
    pending.resolve();
    await flush();
    assert.deepEqual(f.health.snapshot(), state);
  } finally {
    f.dispose();
  }
});

test("renderer disposal promptly rejects a pending queue and late completion stays disposed", async () => {
  const f = fixture(),
    pending = deferred<void>();
  f.setQueue(pending.promise);
  const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
  const rejected = assert.rejects(ready, { name: "AbortError" });
  await f.frame();
  f.dispose();
  await rejected;
  pending.resolve();
  await flush();
  assert.equal(f.health.snapshot().phase, "disposed");
  assert.equal(f.health.snapshot().errorCount, 0);
  f.idle();
});

test("abort before startup schedules no frame and is not a render fault", async () => {
  const f = fixture(),
    controller = new AbortController();
  controller.abort();
  try {
    await assert.rejects(
      waitForRenderStartup(
        { ...f, signal: controller.signal, isReady: () => true },
        f.host,
      ),
      { name: "AbortError" },
    );
    assert.equal(f.counts().renders, 0);
    assert.equal(f.health.snapshot().errorCount, 0);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("abort during render closes only the scope and never flushes or submits", async () => {
  const f = fixture(),
    controller = new AbortController();
  try {
    const ready = waitForRenderStartup(
      {
        ...f,
        signal: controller.signal,
        isReady: () => true,
        render() {
          f.render();
          controller.abort();
        },
      },
      f.host,
    );
    const rejected = assert.rejects(ready, { name: "AbortError" });
    await f.frame();
    await rejected;
    assert.equal(f.counts().ends, 0);
    assert.deepEqual(f.gpuCounts(), { flushes: 0, gpuSubmits: 0 });
    assert.equal(f.counts().pops, 1);
    assert.equal(f.counts().submissions, 0);
    assert.equal(f.health.snapshot().errorCount, 0);
    assert.equal(f.health.snapshot().valid, false);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("abort during a never-settling submission releases every health waiter", async () => {
  const f = fixture(),
    controller = new AbortController(),
    pending = deferred<void>();
  f.setQueue(pending.promise);
  try {
    const ready = waitForRenderStartup(
      { ...f, signal: controller.signal, isReady: () => true },
      f.host,
    );
    const rejected = assert.rejects(ready, { name: "AbortError" });
    await f.frame();
    controller.abort();
    await rejected;
    assert.equal(
      (f.health as unknown as { guards: Set<unknown> }).guards.size,
      0,
    );
    assert.equal(f.health.snapshot().errorCount, 0);
    f.idle();
    pending.resolve();
    await flush();
    assert.equal(f.health.snapshot().valid, false);
  } finally {
    f.dispose();
  }
});

test("a readiness check that faults the owner cannot render the invalid scene", async () => {
  const f = fixture(),
    failure = new Error("material readiness failed");
  try {
    const ready = waitForRenderStartup(
      {
        ...f,
        isReady() {
          f.health.report("shader", failure);
          return true;
        },
      },
      f.host,
    );
    const rejected = assert.rejects(ready, (error) => error === failure);
    await f.frame();
    await rejected;
    assert.equal(f.counts().renders, 0);
    assert.equal(f.counts().begins, 0);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("a fault between a guard settlement and its continuation cannot render", async () => {
  const f = fixture(),
    failure = new Error("late compilation failure");
  try {
    const ready = waitForRenderStartup(
      {
        ...f,
        isReady() {
          queueMicrotask(() =>
            queueMicrotask(() => f.health.report("shader", failure)),
          );
          return true;
        },
      },
      f.host,
    );
    const rejected = assert.rejects(ready, (error) => error === failure);
    await f.frame();
    await rejected;
    assert.equal(f.counts().renders, 0);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("queue rejection keeps its original error and cannot produce ready", async () => {
  const f = fixture(),
    pending = deferred<void>(),
    failure = new Error("submission failed");
  f.setQueue(pending.promise);
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, (error) => error === failure);
    await f.frame();
    pending.reject(failure);
    await rejected;
    assert.equal(f.health.snapshot().counts.render, 1);
    assert.equal(f.health.snapshot().valid, false);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("GPU scope validation fails the owner once even when queue submission succeeds", async () => {
  const f = fixture();
  f.setValidation(Promise.resolve({ message: "invalid binding" }));
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, /invalid binding/);
    await f.frame();
    await rejected;
    assert.equal(f.health.snapshot().counts.validation, 1);
    assert.equal(f.health.snapshot().errorCount, 1);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("render exceptions skip pinned end/flush/submit and consume the closed scope's late rejection", async () => {
  const f = fixture(),
    pending = deferred<{ message: string } | null>(),
    failure = new Error("render failed");
  f.setValidation(pending.promise);
  try {
    const ready = waitForRenderStartup(
      {
        ...f,
        isReady: () => true,
        render() {
          throw failure;
        },
      },
      f.host,
    );
    const rejected = assert.rejects(ready, (error) => error === failure);
    await f.frame();
    await rejected;
    assert.equal(f.counts().ends, 0);
    assert.deepEqual(f.gpuCounts(), { flushes: 0, gpuSubmits: 0 });
    assert.equal(f.counts().pops, 1);
    assert.equal(f.counts().submissions, 0);
    pending.reject(new Error("late scope failure"));
    await flush();
    assert.equal(f.health.snapshot().errorCount, 1);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("manual startup retains falsy source throws before scope or reporter failures", async () => {
  for (const failure of [undefined, null, 0, false, new Error("original")]) {
    const f = fixture(true, () => { throw new Error("reporter failure"); });
    const pop = f.device.popErrorScope;
    f.device.popErrorScope = () => { pop(); throw new Error("scope cleanup failure"); };
    let settled = false, reason: unknown;
    const ready = waitForRenderStartup({ ...f, isReady: () => true,
      render() { throw failure; } }, f.host);
    void ready.catch((error) => { settled = true; reason = error; });
    try {
      await f.frame();
      assert.equal(settled, true);
      assert.equal(reason, failure);
      assert.equal(f.counts().pops, 1);
      assert.equal(f.counts().ends, 0);
      assert.deepEqual(f.gpuCounts(), { flushes: 0, gpuSubmits: 0 });
      f.idle();
    } finally { f.dispose(); }
  }
});

test("manual startup disposal inside render cannot flush the disposed owner", async () => {
  const f = fixture();
  const ready = waitForRenderStartup({ ...f, isReady: () => true,
    render() { f.engine.dispose(); } }, f.host);
  const rejected = assert.rejects(ready, { name: "AbortError" });
  await f.frame(); await rejected;
  assert.equal(f.counts().pops, 1);
  assert.equal(f.counts().ends, 0);
  assert.deepEqual(f.gpuCounts(), { flushes: 0, gpuSubmits: 0 });
  f.idle();
});

test("synchronous startup source error wins over an already fulfilled scope validation error", async () => {
  for (const failure of [new Error("first render failure"), undefined, null, 0, false]) {
    const f = fixture();
    f.setValidation(Promise.resolve({ message: "secondary validation failure" }));
    let settled = false, reason: unknown;
    const ready = waitForRenderStartup({ ...f, isReady: () => true,
      render() { throw failure; } }, f.host);
    void ready.catch((error) => { settled = true; reason = error; });
    try {
      await f.frame();
      assert.equal(settled, true);
      assert.equal(reason, failure);
      assert.equal(f.counts().pops, 1);
      assert.deepEqual(f.gpuCounts(), { flushes: 0, gpuSubmits: 0 });
      assert.equal(f.health.snapshot().counts.render, 1);
      assert.equal(f.health.snapshot().counts.validation, 0);
      f.idle();
    } finally { f.dispose(); }
  }
});

test("native startup does not silently fall back when submission validation is absent", async () => {
  const f = fixture();
  delete (f.device.queue as Partial<typeof f.device.queue>).onSubmittedWorkDone;
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, /submission validation unavailable/);
    await f.frame();
    await rejected;
    assert.equal(f.counts().renders, 0);
    assert.equal(f.health.snapshot().valid, false);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("WebGL still needs an actual frame and never reads a native device", async () => {
  const f = fixture(false);
  Object.defineProperty(f.engine, "_device", {
    get() {
      assert.fail("WebGL accessed a GPU device");
    },
  });
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    await f.frame();
    await ready;
    assert.equal(f.counts().ends, 1);
    assert.equal(f.counts().renders, 1);
    assert.equal(f.counts().submissions, 0);
    f.idle();
  } finally {
    f.dispose();
  }
});

test("owned resource failure promptly cancels even a never-settling queue", async () => {
  const f = fixture(),
    pending = deferred<void>(),
    failure = new Error("active texture failed");
  f.setQueue(pending.promise);
  try {
    const ready = waitForRenderStartup({ ...f, isReady: () => true }, f.host);
    const rejected = assert.rejects(ready, (error) => error === failure);
    await f.frame();
    f.health.report("texture", failure);
    await rejected;
    assert.equal(f.health.snapshot().counts.texture, 1);
    assert.equal(f.health.snapshot().counts.render, 0);
    f.idle();
  } finally {
    f.dispose();
  }
});
