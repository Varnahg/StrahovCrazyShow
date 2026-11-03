import test from "node:test";
import assert from "node:assert/strict";
import { Observable } from "@babylonjs/core/Misc/observable";
import { _ShaderImportLoader } from "@babylonjs/core/Misc/shaderImportLoader";
import { _ProcessShaderCode } from "@babylonjs/core/Materials/effect.functions";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import { WebGpuStartupCpuProfile } from "../client/webgpu-startup-cpu-profile";

function fixture(options: { maxPending?: number; now?: () => number } = {}) {
  let time = 0;
  const value = { opaqueEffect: true };
  const processor: any = {
    _webgpuProcessingContext: undefined,
    initializeShaders(context: object) { this._webgpuProcessingContext = context; time += 1; return "initialized"; },
    finalizeShaders(vertex: unknown, fragment: unknown, _context: object) { time += 2; return { vertex, fragment }; },
  };
  const engine: any = { isWebGPU: true, _device: {}, _shaderProcessorWGSL: processor,
    onDisposeObservable: new Observable(), onContextLostObservable: new Observable(), onContextRestoredObservable: new Observable(),
    _getShaderProcessor() { return this._shaderProcessorWGSL; },
    createEffect(callback?: () => void) { callback?.(); time += 3; return value; },
  };
  const original = { create: engine.createEffect, initialize: processor.initializeShaders, finalize: processor.finalizeShaders };
  const profile = new WebGpuStartupCpuProfile(engine, { now: () => time, ...options });
  return { engine, processor, profile, value, original, advance: (n: number) => { time += n; } };
}

test("createEffect preserves receiver/return identity and never touches then; nested CPU scopes remain separate", () => {
  const f = fixture();
  Object.defineProperty(f.value, "then", { get() { throw new Error("Effect result must not be inspected"); } });
  try {
    const context = {};
    const result = f.engine.createEffect(() => {
      assert.equal(f.processor.initializeShaders(context), "initialized");
      f.advance(4);
      const vertex = {}, fragment = {};
      assert.deepEqual(f.processor.finalizeShaders(vertex, fragment, context), { vertex, fragment });
    });
    assert.equal(result, f.value);
    const s = f.profile.snapshot();
    assert.equal(s.createEffect.cpuTotalMs, 10); assert.equal(s.createEffect.returned, 1);
    assert.equal(s.wgslProcessing.syncCpu.totalMs, 7); assert.equal(s.wgslProcessing.syncCpu.samples, 1);
    assert.equal(s.wgslProcessing.pending, 0);
    assert.equal(s.processorMethods.initializeShaders.cpuTotalMs, 1);
    assert.equal(s.processorMethods.finalizeShaders.cpuTotalMs, 2);
    assert.equal(s.hooks.preProcessor, "unavailable"); assert.equal("preProcessor" in f.processor, false);
    const foreign = { _shaderProcessorWGSL: f.processor };
    assert.equal(f.engine.createEffect.call(foreign), f.value);
    assert.equal(f.profile.snapshot().createEffect.calls, 1, "borrowed receiver must not count as owner work");
  } finally { f.profile.dispose(); }
});

test("microtask-crossing processing is latency and excluded from CPU without observing native returns", async () => {
  const f = fixture();
  try {
    const context = {}; f.processor.initializeShaders(context);
    await Promise.resolve(); f.advance(50);
    f.processor.finalizeShaders("v", "f", context);
    const s = f.profile.snapshot();
    assert.equal(s.wgslProcessing.syncCpu.samples, 0);
    assert.deepEqual(s.wgslProcessing.crossedMicrotaskLatency, { samples: 1, totalMs: 53, maxMs: 53 });
    assert.equal(s.counts.matched, 1);
  } finally { f.profile.dispose(); }
});

test("one microtask marker bounds completed synchronous spans and late marker is inert after disposal", () => {
  const original = globalThis.queueMicrotask, callbacks: VoidFunction[] = [];
  globalThis.queueMicrotask = callback => { callbacks.push(callback); };
  const f = fixture();
  try {
    for (let i = 0; i < 20; i++) { const context = {}; f.processor.initializeShaders(context); f.processor.finalizeShaders("v", "f", context); }
    assert.equal(callbacks.length, 1); assert.equal(f.profile.snapshot().counts.pendingPeak, 1);
    f.profile.dispose(); const snapshot = f.profile.snapshot(); callbacks[0]();
    assert.deepEqual(f.profile.snapshot(), snapshot);
  } finally { f.profile.dispose(); globalThis.queueMicrotask = original; }
});

test("reentrancy, duplicate context, missing context and capacity stay explicit rather than invented CPU", () => {
  const f = fixture({ maxPending: 1 });
  try {
    const a = {}, b = {};
    f.processor.initializeShaders(a); f.processor.initializeShaders(b);
    f.processor.finalizeShaders("v", "f", b); f.processor.finalizeShaders("v", "f", a);
    f.processor.initializeShaders(a); f.processor.initializeShaders(a); f.processor.finalizeShaders("v", "f", a);
    f.processor.initializeShaders(null); f.processor.finalizeShaders("v", "f");
    f.engine.createEffect(() => f.engine.createEffect());
    const s = f.profile.snapshot();
    assert.equal(s.wgslProcessing.syncCpu.samples, 0); assert.equal(s.wgslProcessing.ambiguousLatency.samples, 2);
    assert.equal(s.counts.capacityOmitted, 1); assert.equal(s.counts.replacedContext, 1);
    assert.equal(s.counts.unmatchedFinalize, 2); assert.equal(s.counts.invalidContext, 1);
    assert.equal(s.counts.pendingPeak, 1); assert.equal(s.counts.reentrantCreateEffect, 1);
  } finally { f.profile.dispose(); }
});

test("original initialization/finalization exceptions and observer clock failures keep exact identity", () => {
  const failure = new Error("native failed");
  const context = {}, processor: any = { _webgpuProcessingContext: context,
    initializeShaders() { throw failure; }, finalizeShaders() { throw failure; } };
  const engine: any = { isWebGPU: true, _device: {}, _shaderProcessorWGSL: processor,
    createEffect() { processor.initializeShaders(context); }, _getShaderProcessor() { return processor; } };
  const profile = new WebGpuStartupCpuProfile(engine, { now: () => { throw new Error("clock observer"); } });
  try {
    assert.throws(() => engine.createEffect(), error => error === failure);
    assert.throws(() => processor.finalizeShaders("v", "f", context), error => error === failure);
    const s = profile.snapshot();
    assert.equal(s.createEffect.thrown, 1); assert.equal(s.counts.initializeThrown, 1); assert.equal(s.counts.finalizeThrown, 1);
    assert.equal(s.processorMethods.initializeShaders.thrown, 1); assert.equal(s.processorMethods.finalizeShaders.thrown, 1);
    assert.ok(s.counts.observerErrors > 0); assert.ok(s.counts.invalidClocks > 0);
    assert.equal(s.createEffect.timingSamples, 0); assert.equal(s.wgslProcessing.pending, 0);
  } finally { profile.dispose(); }
});

test("device generation retires pending contexts; dispose preserves measured generation/counters", async () => {
  const f = fixture();
  const context = {};
  f.processor.initializeShaders(context); f.engine._device = {}; f.engine._getShaderProcessor();
  f.processor.finalizeShaders("v", "f", context);
  assert.equal(f.profile.snapshot().generation, 2); assert.equal(f.profile.snapshot().counts.retired, 1);
  assert.equal(f.profile.snapshot().wgslProcessing.syncCpu.samples, 0);
  f.engine.onContextLostObservable.notifyObservers(); assert.equal(f.profile.snapshot().suspended, true);
  const before = f.profile.snapshot().createEffect.calls; f.engine.createEffect();
  assert.equal(f.profile.snapshot().createEffect.calls, before);
  f.engine.onContextRestoredObservable.notifyObservers(); f.engine.createEffect();
  const measured = f.profile.snapshot(); f.engine.onDisposeObservable.notifyObservers();
  const disposed = f.profile.snapshot();
  assert.equal(disposed.generation, measured.generation); assert.deepEqual(disposed.createEffect, measured.createEffect);
  assert.equal(disposed.disposed, true); assert.equal(f.engine.createEffect, f.original.create);
  assert.equal(f.processor.initializeShaders, f.original.initialize); assert.equal(f.processor.finalizeShaders, f.original.finalize);
  // Public Observable.remove marks removal synchronously and splices later so
  // other lifecycle observers are not skipped during the same notification.
  await new Promise(done => setTimeout(done, 0));
  assert.equal(f.engine.onContextLostObservable.observers.length, 0); f.profile.dispose();
});

test("an in-flight synchronous createEffect finishes its measurement after native disposal without changing generation", () => {
  const f = fixture();
  assert.equal(f.engine.createEffect(() => { f.advance(4); f.engine.onDisposeObservable.notifyObservers(); }), f.value);
  const s = f.profile.snapshot();
  assert.equal(s.disposed, true); assert.equal(s.generation, 1);
  assert.equal(s.createEffect.calls, 1); assert.equal(s.createEffect.returned, 1); assert.equal(s.createEffect.cpuTotalMs, 7);
  f.engine.createEffect(); assert.deepEqual(f.profile.snapshot().createEffect, s.createEffect);
});

test("processor replacement rebinds only the owned instance, later foreign wrappers survive disposal", () => {
  const f = fixture();
  const old = f.processor;
  const next: any = { initializeShaders(context: unknown) { this._webgpuProcessingContext = context; },
    finalizeShaders(v: unknown, f: unknown) { return { v, f }; } };
  f.engine._shaderProcessorWGSL = next; assert.equal(f.engine._getShaderProcessor(), next);
  assert.equal(old.initializeShaders, f.original.initialize);
  const context = {}; next.initializeShaders(context); next.finalizeShaders("v", "f", context);
  assert.equal(f.profile.snapshot().wgslProcessing.syncCpu.samples, 1);
  const wrapped = f.engine.createEffect, later = function(this: any, ...args: any[]) { return wrapped.apply(this, args); };
  f.engine.createEffect = later; assert.equal(f.engine.createEffect(), f.value);
  assert.equal(f.profile.snapshot().hooks.createEffect, "lost"); assert.equal(f.profile.snapshot().disposed, true);
  f.profile.dispose(); assert.equal(f.engine.createEffect, later);
});

test("WebGL and duplicate owners stay inert without changing the active owner", () => {
  const gl = { isWebGPU: false }, inert = new WebGpuStartupCpuProfile(gl);
  assert.equal(inert.snapshot().inert, true); inert.dispose();
  const f = fixture(), method = f.engine.createEffect, duplicate = new WebGpuStartupCpuProfile(f.engine);
  assert.equal(duplicate.snapshot().hooks.createEffect, "ownership-conflict"); duplicate.dispose();
  assert.equal(f.engine.createEffect, method); f.profile.dispose();
});

test("finite endpoints whose subtraction overflows cannot leak Infinity into diagnostic metrics", () => {
  let call = 0;
  const f = fixture({ now: () => call++ ? Number.MAX_VALUE : -Number.MAX_VALUE });
  try {
    assert.equal(f.engine.createEffect(), f.value);
    const s = f.profile.snapshot();
    assert.equal(s.createEffect.timingSamples, 0); assert.equal(s.createEffect.cpuMaxMs, 0);
    assert.equal(s.counts.invalidClocks, 1);
  } finally { f.profile.dispose(); }
});

test("constructor failure after the first hook restores partial ownership even before lifecycle attachment", () => {
  const original = () => ({ native: true }); let refuse = true;
  const target = { isWebGPU: true, _device: {}, createEffect: original, _getShaderProcessor() { return undefined; },
    onDisposeObservable: new Observable() };
  const engine = new Proxy(target, { defineProperty(object, key, descriptor) {
    if (refuse && key === "_getShaderProcessor") throw new Error("unsupported hook");
    return Reflect.defineProperty(object, key, descriptor);
  } });
  const failed = new WebGpuStartupCpuProfile(engine);
  assert.equal(failed.snapshot().disposed, true); assert.equal(failed.snapshot().active, false);
  assert.equal(failed.snapshot().counts.observerErrors, 1);
  assert.equal(engine.createEffect, original); assert.equal(target.onDisposeObservable.observers.length, 0);
  refuse = false;
  const next = new WebGpuStartupCpuProfile(engine);
  assert.equal(next.snapshot().hooks.createEffect, "installed", "partial constructor must release its WeakMap owner");
  next.dispose(); assert.equal(engine.createEffect, original);
});

test("real pinned import loader and WGSL callback chain excludes cold import wait and preserves exact output", async () => {
  let time = 0, load!: () => void;
  const loader = new _ShaderImportLoader(() => [], () => [new Promise<void>(yes => { load = yes; })]);
  const processor = new WebGPUShaderProcessorWGSL(); processor.pureMode = true;
  const engine: any = { isWebGPU: true, _device: {}, _shaderProcessorWGSL: processor, _features: { needShaderCodeInlining: false },
    _getShaderProcessor() { return processor; }, getCaps: () => ({ drawBuffersExtension: true }), inlineShaderCode: (s: string) => s,
  };
  const outputs: unknown[] = [], returned = {};
  const vertex = "@vertex fn main(input: VertexInputs) -> FragmentInputs { vertexOutputs.position = vec4f(1.0); }";
  const fragment = "@fragment fn main(input: FragmentInputs) -> FragmentOutputs { fragmentOutputs.color = vec4f(1.0); }";
  function process() {
    const context = new WebGPUShaderProcessingContext(1, true);
    const options = { processor: engine._getShaderProcessor(), processingContext: context, defines: [], indexParameters: {},
      isFragment: false, shouldUseHighPrecisionShader: true, supportsUniformBuffers: true, shadersRepository: "", includesShadersStore: {},
      version: "100", platformName: "WEBGPU", isNDCHalfZRange: true, useReverseDepthBuffer: false };
    _ProcessShaderCode(options as any, { vertexSource: vertex, fragmentSource: fragment }, (_kind, code) => { time += 2; return code; },
      (v, f) => { outputs.push({ v, f }); }, 1, engine);
  }
  const starts: Promise<void>[] = [];
  engine.createEffect = () => {
    const init = loader.getLoadCallback(1);
    if (init) starts.push((async () => { await init(); process(); })()); else process();
    return returned;
  };
  const profile = new WebGpuStartupCpuProfile(engine, { now: () => time });
  try {
    assert.equal(engine.createEffect(), returned); assert.equal(outputs.length, 0);
    time += 100; load(); await Promise.all(starts);
    assert.equal(profile.snapshot().wgslProcessing.syncCpu.totalMs, 4, "cold loading precedes Initialize and is excluded");
    assert.equal(loader.getLoadCallback(1), undefined, "actual warmed loader removes the await callback");
    assert.equal(engine.createEffect(), returned); assert.equal(outputs.length, 2);
    assert.deepEqual(outputs[1], outputs[0]);
    assert.equal(profile.snapshot().createEffect.cpuTotalMs, 4);
    assert.equal(profile.snapshot().wgslProcessing.syncCpu.totalMs, 8);
    assert.equal(profile.snapshot().wgslProcessing.crossedMicrotaskLatency.samples, 0);
    const children = profile.snapshot().processorMethods;
    assert.equal(children.initializeShaders.calls, 2); assert.equal(children.finalizeShaders.calls, 2);
    assert.equal(children.preProcessShaderCode.calls, 4); assert.equal(children.postProcessor.calls, 4);
    assert.equal(children.preProcessor.calls, 0); assert.equal(profile.snapshot().hooks.preProcessor, "unavailable");
    assert.equal("preProcessor" in processor, false, "missing native branch must never be fabricated");
    assert.ok(Object.values(children).every(value => value.outsideTrackedSpan === 0));
    profile.dispose(); process(); assert.deepEqual(outputs[2], outputs[0]);
  } finally { profile.dispose(); }
});

test("child method timings preserve all arguments/results and explicitly expose overlapping native calls", () => {
  let time = 0; const context = {}, input = {}, result = {};
  Object.defineProperty(result, "then", { get() { throw new Error("return must remain opaque"); } });
  const p: any = {
    initializeShaders(c: object) { assert.equal(c, context); this._webgpuProcessingContext = c; time += 1; return input; },
    preProcessShaderCode(value: unknown, fragment: boolean) { assert.equal(this, p); assert.equal(value, input); assert.equal(fragment, false); time += 2; return value; },
    preProcessor(...args: any[]) { assert.equal(this, p); assert.equal(args[0], input); assert.equal(args[4], context); time += 3; return args[0]; },
    postProcessor(...args: any[]) { assert.equal(this, p); assert.equal(args[0], input); assert.equal(args[3], context); time += 5; return args[0]; },
    finalizeShaders(v: unknown, f: unknown, c: object) {
      assert.equal(v, input); assert.equal(f, input); assert.equal(c, context);
      this.postProcessor(input, [], true, context); time += 7; return result;
    },
  };
  const native = Object.fromEntries(Object.entries(p));
  const engine: any = { isWebGPU: true, _device: {}, _shaderProcessorWGSL: p, createEffect() { return result; } };
  const profile = new WebGpuStartupCpuProfile(engine, { now: () => time });
  try {
    assert.equal(p.initializeShaders(context), input);
    assert.equal(p.preProcessShaderCode(input, false), input);
    assert.equal(p.preProcessor(input, [], {}, false, context), input);
    assert.equal(p.postProcessor(input, [], false, context), input);
    assert.equal(p.finalizeShaders(input, input, context), result);
    const snapshot = profile.snapshot(), c = snapshot.processorMethods;
    assert.equal(snapshot.wgslProcessing.syncCpu.totalMs, 23);
    assert.equal(c.initializeShaders.cpuTotalMs, 1); assert.equal(c.preProcessShaderCode.cpuTotalMs, 2);
    assert.equal(c.preProcessor.cpuTotalMs, 3); assert.equal(c.postProcessor.cpuTotalMs, 10); assert.equal(c.finalizeShaders.cpuTotalMs, 12);
    assert.equal(c.postProcessor.nestedCalls, 1, "the nested5ms is included in both method scopes, never silently exclusive");
    assert.equal(c.postProcessor.cpuMaxMs, 5); assert.equal(c.postProcessor.calls, 2);
    assert.ok(Object.values(c).every(value => value.outsideTrackedSpan === 0 && value.thrown === 0));
    c.postProcessor.calls = 999; assert.equal(profile.snapshot().processorMethods.postProcessor.calls, 2, "snapshot is detached");
  } finally { profile.dispose(); for (const [name, value] of Object.entries(native)) assert.equal(p[name], value); }
});

test("optional child methods preserve thrown identity, unmatched scope and generation interruption", () => {
  let time = 0, mode = "outside"; const error = new Error("native post failure"), context = {};
  const p: any = { initializeShaders(c: object) { this._webgpuProcessingContext = c; }, finalizeShaders() { return {}; },
    postProcessor(value: unknown) {
      time += 5;
      if (mode === "throw") throw error;
      if (mode === "generation") { engine._device = {}; engine._getShaderProcessor(); }
      return value;
    } };
  const engine: any = { isWebGPU: true, _device: {}, _shaderProcessorWGSL: p,
    createEffect() { return {}; }, _getShaderProcessor() { return p; } };
  const profile = new WebGpuStartupCpuProfile(engine, { now: () => time });
  try {
    const value = {}; assert.equal(p.postProcessor(value, [], false, context), value);
    p.initializeShaders(context); mode = "throw";
    assert.throws(() => p.postProcessor(value, [], false, context), candidate => candidate === error);
    mode = "generation"; assert.equal(p.postProcessor(value, [], false, context), value);
    const c = profile.snapshot().processorMethods.postProcessor;
    assert.equal(c.calls, 3); assert.equal(c.returned, 2); assert.equal(c.thrown, 1);
    assert.equal(c.outsideTrackedSpan, 1); assert.equal(c.interruptedCalls, 1);
    assert.equal(c.timingSamples, 2); assert.equal(c.cpuTotalMs, 10);
    const owned = p.postProcessor, later = function(this: any, ...args: any[]) { return owned.apply(this, args); };
    p.postProcessor = later; engine.createEffect();
    assert.equal(profile.snapshot().hooks.postProcessor, "lost");
    profile.dispose(); assert.equal(p.postProcessor, later);
  } finally { profile.dispose(); }
});

test("child call already in flight can finish after disposal; later native calls do not update metrics", () => {
  let time = 0;
  const p: any = { initializeShaders(c: object) { this._webgpuProcessingContext = c; }, finalizeShaders() { return {}; },
    preProcessShaderCode(value: unknown) { engine.onDisposeObservable.notifyObservers(); time += 9; return value; } };
  const engine: any = { isWebGPU: true, _device: {}, _shaderProcessorWGSL: p, createEffect() { return {}; }, onDisposeObservable: new Observable() };
  const profile = new WebGpuStartupCpuProfile(engine, { now: () => time });
  const value = {}; p.initializeShaders({}); assert.equal(p.preProcessShaderCode(value, false), value);
  const snapshot = profile.snapshot();
  assert.equal(snapshot.disposed, true); assert.equal(snapshot.generation, 1);
  assert.equal(snapshot.processorMethods.preProcessShaderCode.cpuTotalMs, 9);
  p.preProcessShaderCode(value, false); assert.deepEqual(profile.snapshot().processorMethods, snapshot.processorMethods);
  profile.dispose();
});
