import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { Observable } from "@babylonjs/core/Misc/observable";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUPipelineContext } from "@babylonjs/core/Engines/WebGPU/webgpuPipelineContext";
import { createAndPreparePipelineContext } from "@babylonjs/core/Materials/effect.functions";
import { Effect } from "@babylonjs/core/Materials/effect";
import { WebGpuCompilationProfile } from "../client/webgpu-compilation-profile";
import { WebGpuShaderPreparation, type WebGpuShaderPreparationOptions } from "../client/webgpu-shader-preparation";

function fixture(options: WebGpuShaderPreparationOptions = {}, override?: (engine: any) => void) {
  const frames = new Map<number, FrameRequestCallback>(); let serial = 0, time = 0;
  const calls: any[][] = [], ready: any[] = [], errors: unknown[] = [];
  const engine = Object.create(WebGPUEngine.prototype) as any;
  Object.defineProperty(engine, "isWebGPU", { value: true, configurable: true });
  Object.assign(engine, { _device: {}, _compiledEffects: {}, _isDisposed: false, _glslangAndTintAreFullyLoaded: true,
    onDisposeObservable: new Observable(), onContextLostObservable: new Observable(), onContextRestoredObservable: new Observable(),
    onReleaseEffectsObservable: new Observable(),
    _compilePipelineStageDescriptor(...args: any[]) { calls.push(args); return { vertexStage: { module: {} }, fragmentStage: { module: {} } }; },
    _compileRawPipelineStageDescriptor(...args: any[]) { calls.push(args); return { vertexStage: { module: {} }, fragmentStage: { module: {} } }; },
  });
  override?.(engine);
  const original = engine._preparePipelineContextAsync;
  const queue = new WebGpuShaderPreparation(engine, { requestFrame: cb => { frames.set(++serial, cb); return serial; },
    cancelFrame: id => { frames.delete(id); }, now: () => time, onError: e => errors.push(e), ...options });
  const context = () => new WebGPUPipelineContext({ shaderLanguage: 1 } as any, engine);
  const submit = (ctx = context(), callback: (...args: any[]) => void = () => ready.push(ctx)) => {
    const args = [ctx, "vertex", "fragment", false, "rawV", "rawF", () => {}, "defines", ["varying"], "key", callback];
    return { ctx, args, promise: engine._preparePipelineContextAsync(...args) as Promise<void> };
  };
  const tick = () => { const entry = frames.entries().next().value; assert.ok(entry); frames.delete(entry[0]); entry[1](time); };
  return { engine, queue, frames, calls, ready, errors, context, submit, tick, original,
    advance: (ms: number) => { time += ms; } };
}

test("real Babylon callback path is deferred while WebGPU context remains unready and isAsync false", async () => {
  const f = fixture();
  try {
    let compiled = 0;
    const ctx = createAndPreparePipelineContext({ name: "actual", vertex: "v", fragment: "f", defines: "D",
      shaderProcessingContext: { shaderLanguage: 1 }, onRenderingStateCompiled: () => compiled++ } as any,
      () => f.context(), f.engine._preparePipelineContextAsync.bind(f.engine),
      f.engine._executeWhenRenderingStateIsCompiled.bind(f.engine));
    assert.equal(ctx.isAsync, false); assert.equal(ctx.isReady, false); assert.equal(compiled, 0);
    assert.equal(f.queue.isReady(), false); assert.equal(f.calls.length, 0);
    f.tick(); await setImmediate();
    assert.equal(compiled, 1); assert.equal(ctx.isReady, true); assert.equal(f.queue.isReady(), true);
    assert.equal(f.queue.snapshot().completed, 1);
  } finally { f.queue.dispose(); }
});

test("receiver, arguments and callback receiver survive FIFO dispatch across independent contexts", async () => {
  const seen: any[][] = [], callbackReceiver = {};
  const f = fixture({}, engine => { engine._preparePipelineContextAsync = function(this: any, ...args: any[]) {
    assert.equal(this, engine); seen.push(args); args[10].call(callbackReceiver, "native"); return Promise.resolve();
  }; });
  try {
    const jobs = Array.from({ length: 5 }, () => f.submit(f.context(), function(this: any, value) {
      assert.equal(this, callbackReceiver); assert.equal(value, "native");
    }));
    f.tick(); assert.equal(seen.length, 4); await setImmediate(); f.tick(); await Promise.all(jobs.map(j => j.promise));
    for (let i = 0; i < 5; i++) assert.deepEqual(seen[i].slice(0, 10), jobs[i].args.slice(0, 10));
    assert.equal(f.queue.isReady(), true);
  } finally { f.queue.dispose(); }
});

test("budget stops next native call, preserving an honest indivisible overrun", async () => {
  let advance!: (ms: number) => void;
  const f = fixture({}, engine => { engine._preparePipelineContextAsync = (...args: any[]) => {
    advance(12); args[10](); return Promise.resolve();
  }; }); advance = f.advance;
  try {
    const one = f.submit(), two = f.submit(); f.tick();
    assert.equal(f.queue.snapshot().started, 1); assert.equal(f.queue.snapshot().queued, 1);
    assert.equal(f.queue.snapshot().workCpuMaxMs, 12);
    await one.promise; f.tick(); await two.promise;
  } finally { f.queue.dispose(); }
});

test("staged same-frame rebuild and unloaded GLSL retain native pass-through", async () => {
  const f = fixture();
  try {
    const ctx = f.context(); ctx.stages = {} as any;
    const staged = f.submit(ctx); assert.equal(f.ready.length, 1); assert.equal(f.frames.size, 0); await staged.promise;
    f.engine._glslangAndTintAreFullyLoaded = false;
    let load!: () => void; f.engine.prepareGlslangAndTintAsync = () => new Promise<void>(yes => { load = yes; });
    const glsl = f.context(); glsl.shaderProcessingContext.shaderLanguage = 0;
    const pending = f.submit(glsl); assert.equal(f.frames.size, 0); load(); await pending.promise;
    assert.equal(f.queue.snapshot().passthrough, 2);
  } finally { f.queue.dispose(); }
});

test("abort before dispatch rejects owned promises, restores hooks and does not call ready", async () => {
  const controller = new AbortController(), f = fixture({ signal: controller.signal });
  const before = f.engine._deletePipelineContext;
  const job = f.submit(); controller.abort();
  await assert.rejects(job.promise, { name: "AbortError" });
  assert.equal(f.frames.size, 0); assert.equal(f.calls.length, 0); assert.equal(f.ready.length, 0);
  assert.equal(f.engine._preparePipelineContextAsync, f.original);
  assert.notEqual(f.engine._deletePipelineContext, before); assert.equal(f.queue.isReady(), false);
  f.queue.dispose();
});

test("native Effect disposal, releaseEffects and direct context disposal retire queued work without a fault", async () => {
  const f = fixture();
  try {
    const one = f.submit(), two = f.submit(), three = f.submit();
    const effect = Object.create(Effect.prototype) as any;
    Object.assign(effect, { _refCount: 1, _isDisposed: false, _pipelineContext: one.ctx, _engine: f.engine, _key: "one" });
    f.engine._compiledEffects.one = effect; effect.dispose();
    two.ctx.dispose();
    f.engine._compiledEffects.three = { getPipelineContext: () => three.ctx }; f.engine.releaseEffects();
    await Promise.all([one, two, three].map(j => assert.rejects(j.promise, { name: "AbortError" })));
    assert.equal(f.frames.size, 0); assert.equal(f.queue.isReady(), true); assert.deepEqual(f.errors, []);
  } finally { f.queue.dispose(); }
});

test("retired running native work suppresses late callback and stays pending until settlement", async () => {
  let resume!: () => void;
  const f = fixture({}, engine => { engine._preparePipelineContextAsync = async (...args: any[]) => {
    await new Promise<void>(yes => { resume = yes; }); args[10]();
  }; });
  try {
    const job = f.submit(); f.tick(); f.engine._deletePipelineContext(job.ctx);
    await assert.rejects(job.promise, { name: "AbortError" });
    assert.equal(f.queue.isReady(), false); resume(); await setImmediate();
    assert.equal(f.ready.length, 0); assert.equal(f.queue.isReady(), true); assert.deepEqual(f.errors, []);
  } finally { f.queue.dispose(); }
});

test("ignored native rejection is owned and fault reporting is terminal once", async () => {
  const error = new Error("native compiler rejected");
  const f = fixture({}, engine => { engine._preparePipelineContextAsync = async () => { throw error; }; });
  f.submit(); // Exactly the ignored-return contract of Babylon effect.functions.
  f.tick(); await setImmediate();
  assert.throws(() => f.queue.isReady(), candidate => candidate === error);
  assert.deepEqual(f.errors, [error]); assert.equal(f.queue.snapshot().cancelled, 1);
  f.queue.dispose();
});

test("device replacement/loss and changed hook ownership fail closed without overwriting a later owner", async () => {
  for (const mode of ["device", "lost", "owner"] as const) {
    const f = fixture(), job = f.submit(); let later: any;
    if (mode === "device") f.engine._device = {};
    if (mode === "lost") f.engine.onContextLostObservable.notifyObservers(f.engine);
    if (mode === "owner") { later = () => Promise.resolve(); f.engine._preparePipelineContextAsync = later; }
    if (mode !== "lost") f.tick();
    await assert.rejects(job.promise); assert.throws(() => f.queue.isReady());
    assert.equal(f.ready.length, 0); assert.equal(f.errors.length, 1);
    if (later) assert.equal(f.engine._preparePipelineContextAsync, later);
    f.queue.dispose();
  }
});

test("queue overflow and duplicate owner are explicit; successful release permits a new owner", async () => {
  const f = fixture({ maxQueued: 1 });
  assert.throws(() => new WebGpuShaderPreparation(f.engine), /already has an owner/);
  const job = f.submit(); assert.throws(() => f.submit(), /overflow/); await assert.rejects(job.promise);
  assert.equal(f.errors.length, 1); f.queue.dispose();
  const next = new WebGpuShaderPreparation(f.engine); assert.equal(next.isReady(), true); next.dispose();
});

test("callback reentrancy is FIFO and engine disposal cancels stale native completion", async () => {
  const f = fixture({ maxPerFrame: 1 }); let second: ReturnType<typeof f.submit> | undefined;
  const first = f.submit(f.context(), () => { second = f.submit(); }); f.tick(); await first.promise;
  assert.equal(f.queue.snapshot().queued, 1); assert.equal(f.frames.size, 1);
  f.engine._isDisposed = true; f.engine.onDisposeObservable.notifyObservers(f.engine);
  await assert.rejects(second!.promise, { name: "AbortError" }); assert.equal(f.frames.size, 0);
  f.queue.dispose();
});

test("WebGL is inert and pre-aborted construction installs no hooks", () => {
  const engine = { isWebGPU: false }, webgl = new WebGpuShaderPreparation(engine);
  assert.equal(webgl.isReady(), true); assert.equal(webgl.snapshot().inert, true); webgl.dispose();
  const controller = new AbortController(); controller.abort();
  const aborted = new WebGpuShaderPreparation({ isWebGPU: true }, { signal: controller.signal });
  assert.equal(aborted.isReady(), false); aborted.dispose();
});

test("disabled WebGPU adapter leaves real Babylon fresh-context callback synchronous without any hooks", () => {
  const f = fixture({ enabled: false,
    requestFrame: () => { throw new Error("disabled adapter requested RAF"); },
    cancelFrame: () => { throw new Error("disabled adapter cancelled RAF"); },
  });
  try {
    const order: string[] = ["before"];
    const ctx = createAndPreparePipelineContext({ name: "native-control", vertex: "v", fragment: "f", defines: "D",
      shaderProcessingContext: { shaderLanguage: 1 }, onRenderingStateCompiled: () => order.push("compiled") } as any,
      () => f.context(), f.engine._preparePipelineContextAsync.bind(f.engine),
      f.engine._executeWhenRenderingStateIsCompiled.bind(f.engine));
    order.push("returned");
    assert.deepEqual(order, ["before", "compiled", "returned"]);
    assert.equal(ctx.isAsync, false); assert.equal(ctx.isReady, true);
    assert.equal(f.calls.length, 1); assert.equal(f.engine._preparePipelineContextAsync, f.original);
    assert.equal(Object.hasOwn(f.engine, "_preparePipelineContextAsync"), false);
    assert.equal(Object.hasOwn(f.engine, "_deletePipelineContext"), false);
    assert.equal(Object.hasOwn(ctx, "dispose"), false);
    assert.equal(f.engine.onDisposeObservable.observers.length, 0);
    assert.equal(f.engine.onContextLostObservable.observers.length, 0);
    assert.equal(f.engine.onContextRestoredObservable.observers.length, 0);
    assert.equal(f.frames.size, 0); assert.equal(f.queue.isReady(), true);
    assert.deepEqual(f.queue.snapshot(), { active: false, inert: true, disposed: false, faulted: false,
      queued: 0, pending: 0, started: 0, completed: 0, cancelled: 0, passthrough: 0,
      frameCount: 0, workCpuCount: 0, workCpuMs: 0, workCpuMaxMs: 0 });
  } finally { f.queue.dispose(); }
  assert.equal(f.queue.isReady(), false); assert.equal(f.engine._preparePipelineContextAsync, f.original);
});

test("disabled control retains inert abort/dispose semantics and does not claim engine ownership", () => {
  const controller = new AbortController(); let listeners = 0;
  const add = controller.signal.addEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args: Parameters<AbortSignal["addEventListener"]>) => {
    listeners++; return Reflect.apply(add, controller.signal, args);
  };
  const f = fixture({ enabled: false, signal: controller.signal });
  assert.equal(listeners, 0, "inert mode must not subscribe even to abort");
  controller.abort();
  assert.equal(f.queue.isReady(), true, "as with existing inert WebGL, caller owns later abort cleanup");
  const active = new WebGpuShaderPreparation(f.engine, { enabled: true });
  const owned = f.engine._preparePipelineContextAsync;
  f.queue.dispose(); f.queue.dispose();
  assert.equal(f.engine._preparePipelineContextAsync, owned, "inert disposal cannot release a different owner");
  assert.equal(f.queue.isReady(), false); active.dispose();
  assert.equal(f.engine._preparePipelineContextAsync, f.original);
  const alreadyAborted = new WebGpuShaderPreparation({ isWebGPU: true }, { enabled: false, signal: controller.signal });
  assert.equal(alreadyAborted.snapshot().inert, true); assert.equal(alreadyAborted.snapshot().disposed, true);
  assert.equal(alreadyAborted.isReady(), false); alreadyAborted.dispose();
});

test("inner compilation profiling starts at dispatch and is restored after queue cleanup", async () => {
  let profile!: WebGpuCompilationProfile;
  const f = fixture({}, engine => { profile = new WebGpuCompilationProfile(engine); });
  try {
    const job = f.submit();
    assert.equal(profile.snapshot().metrics.shaderPreparation.calls, 0);
    f.tick(); await job.promise;
    assert.equal(profile.snapshot().metrics.shaderPreparation.calls, 1);
    assert.equal(profile.snapshot().metrics.shaderPreparation.completed, 1);
    f.queue.dispose(); assert.equal(f.engine._preparePipelineContextAsync, f.original);
    const later = f.context(); await f.engine._preparePipelineContextAsync(later, "v", "f", false, "", "", null, "", null, "", () => {});
    assert.equal(profile.snapshot().metrics.shaderPreparation.calls, 2);
  } finally { f.queue.dispose(); profile.dispose(); }
});

test("abort during native async work suppresses a late onReady without reporting expected cancellation", async () => {
  let resume!: () => void;
  const controller = new AbortController();
  const f = fixture({ signal: controller.signal }, engine => { engine._preparePipelineContextAsync = async (...args: any[]) => {
    await new Promise<void>(yes => { resume = yes; }); args[10]();
  }; });
  const job = f.submit(); f.tick(); controller.abort();
  await assert.rejects(job.promise, { name: "AbortError" });
  assert.equal(f.queue.snapshot().pending, 1); resume(); await setImmediate();
  assert.equal(f.queue.snapshot().pending, 0); assert.equal(f.ready.length, 0); assert.deepEqual(f.errors, []);
  assert.equal(f.engine._preparePipelineContextAsync, f.original); f.queue.dispose();
});
