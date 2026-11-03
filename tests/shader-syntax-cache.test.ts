import test from "node:test";
import assert from "node:assert/strict";
import { Observable } from "@babylonjs/core/Misc/observable";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { CreateShaderSyntaxCache } from "@babylonjs/core/Engines/Processors/shaderProcessor";
import { ShaderSyntaxCache, type ShaderSyntaxCacheControlOptions, type ShaderSyntaxCacheFactory,
  type ShaderSyntaxCacheLease, type ShaderSyntaxCacheOptions } from "../client/shader-syntax-cache";
import { sanitizeDiagnosticsData, validateDiagnosticsBatch } from "../shared/session-diagnostics";
import { WebGpuStartupCpuProfile } from "../client/webgpu-startup-cpu-profile";

const counters = () => ({ requests: 0, hits: 0, misses: 0, evictions: 0, oversized: 0, parseErrors: 0,
  entries: 0, sourceUnits: 0, nodeStringUnits: 0, textUnits: 0, nodes: 0, operators: 0,
  peakEntries: 0, peakTextUnits: 0, peakNodes: 0, peakOperators: 0 });
function nativeLease(options: ShaderSyntaxCacheOptions = {}) {
  const stats = { enabled: options.enabled ?? false, disposed: false, generation: 1, ...counters(),
    maxEntries: options.maxEntries ?? 16, maxTextUnits: options.maxTextUnits ?? 2097152,
    maxNodes: options.maxNodes ?? 32768, maxOperators: options.maxOperators ?? 8192 };
  let disposals = 0;
  const clear = () => { stats.entries = stats.sourceUnits = stats.nodeStringUnits = stats.textUnits = stats.nodes = stats.operators = 0; };
  const lease: ShaderSyntaxCacheLease = {
    setEnabled(enabled) { assert.equal(this, lease); if (stats.disposed) throw new Error("disposed");
      if (enabled !== stats.enabled) { stats.enabled = enabled; stats.generation++; if (!enabled) clear(); } },
    reset() { assert.equal(this, lease); if (stats.disposed) throw new Error("disposed"); Object.assign(stats, counters()); stats.generation++; },
    snapshot() { assert.equal(this, lease); return { ...stats }; },
    dispose() { assert.equal(this, lease); if (stats.disposed) return; disposals++; stats.disposed = true; stats.enabled = false; stats.generation++; clear(); },
  };
  return { lease, stats, disposals: () => disposals };
}
function host() {
  return { isWebGPU: true, _device: {}, _shaderProcessorWGSL: new WebGPUShaderProcessorWGSL(), _shaderProcessor: {},
    _getShaderProcessor: WebGPUEngine.prototype._getShaderProcessor,
    createEffect() { return {}; },
    onDisposeObservable: new Observable(), onContextLostObservable: new Observable(), onBeginFrameObservable: new Observable() };
}
function fixture(options: Partial<ShaderSyntaxCacheControlOptions> = {}) {
  const engine = host(); let native: ReturnType<typeof nativeLease> | undefined;
  const calls: { processor: object; options: ShaderSyntaxCacheOptions | undefined }[] = [];
  const createCache: ShaderSyntaxCacheFactory = (processor, supplied) => {
    calls.push({ processor, options: supplied }); native = nativeLease(supplied); return native.lease;
  };
  const original = Object.getOwnPropertyDescriptor(engine, "_getShaderProcessor");
  const cache = new ShaderSyntaxCache(engine, { createCache, ...options });
  return { engine, cache, calls, original, native: () => { assert.ok(native); return native; } };
}
const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

test("installed native second-use factory interoperates with the Game controller and releases its actual owner", () => {
  const engine = host();
  const cache = new ShaderSyntaxCache(engine, { createCache: CreateShaderSyntaxCache, enabled: true });
  try {
    const first = cache.snapshot();
    assert.equal(first.supported, true); assert.equal(first.active, true); assert.equal(first.statsCurrent, true);
    assert.equal(first.stats?.probationEntries, 0, "installed API must expose the final admission policy");
    assert.equal(first.stats?.promotions, 0);
    assert.throws(() => CreateShaderSyntaxCache(engine._shaderProcessorWGSL));
    cache.setEnabled(false); assert.equal(cache.snapshot().active, false);
    cache.setEnabled(true); cache.reset(); assert.equal(cache.snapshot().active, true);
  } finally { cache.dispose(); }
  assert.equal(cache.snapshot().active, false); assert.equal(cache.snapshot().cleanupIncomplete, false);
  const replacement = CreateShaderSyntaxCache(engine._shaderProcessorWGSL);
  replacement.dispose();
});

test("pinned WGSL getter selects only its owned processor; default off, explicit limits and complete native controls", () => {
  const f = fixture({ maxEntries: 7, maxTextUnits: 900, maxNodes: 70, maxOperators: 30 });
  try {
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].processor, f.engine._shaderProcessorWGSL);
    assert.deepEqual(f.calls[0].options, { enabled: false, maxEntries: 7, maxTextUnits: 900, maxNodes: 70, maxOperators: 30 });
    assert.equal(f.cache.snapshot().active, false); assert.equal(f.cache.snapshot().supported, true);
    assert.equal(f.engine._getShaderProcessor(0), f.engine._shaderProcessor);
    assert.equal(f.engine._getShaderProcessor(1), f.engine._shaderProcessorWGSL);
    f.cache.setEnabled(true); Object.assign(f.native().stats, { entries: 2, textUnits: 180, hits: 4 });
    assert.equal(f.cache.snapshot().active, true);
    f.cache.setEnabled(false); assert.equal(f.cache.snapshot().stats?.entries, 0); assert.equal(f.cache.snapshot().stats?.hits, 4);
    f.cache.reset(); assert.equal(f.cache.snapshot().stats?.hits, 0);
    f.cache.setEnabled(true); assert.equal(f.cache.snapshot().requestedEnabled, true);
  } finally { f.cache.dispose(); }
  assert.equal(f.native().disposals(), 1); assert.equal(f.cache.snapshot().stats?.disposed, true);
});

test("WebGL and unsupported engines are inert without factory, hooks, lifecycle observers or browser globals", () => {
  let calls = 0;
  const createCache: ShaderSyntaxCacheFactory = () => { calls++; throw new Error("not expected"); };
  const engine = { isWebGPU: false, get _getShaderProcessor() { throw new Error("WebGL path must not inspect this"); } };
  const webgl = new ShaderSyntaxCache(engine, { createCache, enabled: true });
  assert.equal(webgl.snapshot().inert, true); webgl.setEnabled(false); webgl.reset(); webgl.dispose(); webgl.dispose();
  const mismatch = host(); mismatch._getShaderProcessor = (() => ({})) as any;
  const original = mismatch._getShaderProcessor;
  const unsupported = new ShaderSyntaxCache(mismatch, { createCache, enabled: true });
  assert.equal(unsupported.snapshot().supported, false); assert.equal(unsupported.snapshot().active, null);
  assert.equal(mismatch._getShaderProcessor, original); assert.equal(mismatch.onDisposeObservable.hasObservers(), false);
  assert.equal(calls, 0); unsupported.dispose();
});

test("one controller owns each engine and processor; duplicate disposal cannot release the original lease", () => {
  const f = fixture({ enabled: true }); let calls = 0;
  const createCache: ShaderSyntaxCacheFactory = () => { calls++; return nativeLease().lease; };
  const duplicate = new ShaderSyntaxCache(f.engine, { createCache });
  const shared = host(); shared._shaderProcessorWGSL = f.engine._shaderProcessorWGSL;
  const sameProcessor = new ShaderSyntaxCache(shared, { createCache });
  assert.equal(duplicate.snapshot().reason, "ownership-conflict"); assert.equal(sameProcessor.snapshot().reason, "ownership-conflict");
  assert.equal(duplicate.snapshot().active, null, "an unowned controller cannot claim the other active cache is off");
  duplicate.dispose(); sameProcessor.dispose(); assert.equal(calls, 0); assert.equal(f.cache.snapshot().active, true);
  f.cache.dispose();
  const next = new ShaderSyntaxCache(f.engine, { createCache }); assert.equal(calls, 1); next.dispose();
});

test("dispose and device/processor retirement release retention and references once, without later reactivation", async () => {
  for (const reason of ["disposed", "engine-disposed", "device-lost", "device-replaced", "processor-replaced"] as const) {
    const f = fixture({ enabled: true }); Object.assign(f.native().stats, { entries: 3, textUnits: 400, hits: 9 });
    if (reason === "disposed") f.cache.dispose();
    else if (reason === "engine-disposed") f.engine.onDisposeObservable.notifyObservers(f.engine);
    else if (reason === "device-lost") f.engine.onContextLostObservable.notifyObservers(f.engine);
    else {
      if (reason === "device-replaced") f.engine._device = {};
      else f.engine._shaderProcessorWGSL = new WebGPUShaderProcessorWGSL();
      f.engine.onBeginFrameObservable.notifyObservers(f.engine);
    }
    const snapshot = f.cache.snapshot();
    assert.equal(snapshot.reason, reason); assert.equal(snapshot.disposed, true); assert.equal(snapshot.active, false);
    assert.equal(snapshot.stats?.entries, 0); assert.equal(snapshot.stats?.textUnits, 0); assert.equal(snapshot.stats?.hits, 9);
    assert.equal(f.native().disposals(), 1); assert.deepEqual(Object.getOwnPropertyDescriptor(f.engine, "_getShaderProcessor"), f.original);
    f.cache.setEnabled(true); f.cache.reset(); f.cache.dispose(); assert.deepEqual(f.cache.snapshot(), snapshot);
    await nextTask(); assert.equal(f.engine.onDisposeObservable.hasObservers(), false); assert.equal(f.engine.onContextLostObservable.hasObservers(), false);
    assert.equal(f.engine.onBeginFrameObservable.hasObservers(), false);
  }
});

test("early engine disposal and a reentrant factory retirement cannot leave an acquired lease active", () => {
  const disposed = Object.assign(host(), { _isDisposed: true }); let calls = 0;
  const factory: ShaderSyntaxCacheFactory = () => { calls++; return nativeLease().lease; };
  const early = new ShaderSyntaxCache(disposed, { createCache: factory });
  assert.equal(calls, 0); assert.equal(early.snapshot().reason, "engine-disposed");
  const alreadyLost = new ShaderSyntaxCache(Object.assign(host(), { _contextWasLost: true }), { createCache: factory });
  assert.equal(calls, 0); assert.equal(alreadyLost.snapshot().reason, "device-lost");
  const engine = host(), native = nativeLease({ enabled: true });
  const cache = new ShaderSyntaxCache(engine, { enabled: true, createCache() {
    engine.onDisposeObservable.notifyObservers(engine); return native.lease;
  } });
  assert.equal(native.disposals(), 1); assert.equal(cache.snapshot().active, false); assert.equal(cache.snapshot().reason, "engine-disposed");
});

test("an already-triggered disposal observable cannot strand a newly added observer or start the factory", async () => {
  const engine = host(); engine.onDisposeObservable = new Observable(undefined, true);
  engine.onDisposeObservable.notifyObservers(engine);
  let calls = 0;
  const cache = new ShaderSyntaxCache(engine, { createCache() { calls++; return nativeLease().lease; } });
  assert.equal(calls, 0); assert.equal(cache.snapshot().reason, "engine-disposed");
  await nextTask(); assert.equal(engine.onDisposeObservable.hasObservers(), false);
  assert.equal(engine.onContextLostObservable.hasObservers(), false);
});

test("native methods retain receiver, arguments, return and throw; later owner is never overwritten", () => {
  const engine = host(), calls: any[] = [], expected = new Error("native error");
  let fail = false;
  const original = function(this: any, ...args: any[]) { calls.push([this, args]); if (fail) throw expected; return this._shaderProcessorWGSL; };
  engine._getShaderProcessor = original;
  const cache = new ShaderSyntaxCache(engine, { createCache: () => nativeLease({ enabled: true }).lease });
  assert.equal(engine._getShaderProcessor, original, "controller never takes ownership of engine methods");
  const foreign = { _shaderProcessorWGSL: {} }, extra = {};
  assert.equal((original as any).call(foreign, 1, extra), foreign._shaderProcessorWGSL);
  assert.deepEqual(calls.at(-1), [foreign, [1, extra]]);
  fail = true; assert.throws(() => original.call(engine, 1), error => error === expected); fail = false;
  const later = () => engine._shaderProcessorWGSL; engine._getShaderProcessor = later;
  assert.equal(cache.snapshot().active, true); assert.equal(engine._getShaderProcessor, later);
  cache.dispose(); assert.equal(engine._getShaderProcessor, later);
});

test("factory failure and partial observer installation roll back; failure never claims enabled", async () => {
  const engine = host(), original = engine._getShaderProcessor;
  const cache = new ShaderSyntaxCache(engine, { enabled: true, createCache() { throw new Error("private shader text must not escape"); } });
  const snapshot = cache.snapshot(); assert.equal(snapshot.reason, "factory-error"); assert.equal(snapshot.supported, false);
  assert.equal(snapshot.active, null); assert.equal(snapshot.activityKnown, false); assert.equal(snapshot.errors.factory, 1);
  assert.equal(engine._getShaderProcessor, original); assert.equal(JSON.stringify(snapshot).includes("private shader"), false);
  await nextTask(); assert.equal(engine.onDisposeObservable.hasObservers(), false);
  const broken = host(); broken.onContextLostObservable.add = () => { throw new Error("attach failed"); };
  let factoryCalls = 0;
  const partial = new ShaderSyntaxCache(broken, { createCache() { factoryCalls++; return nativeLease().lease; } });
  assert.equal(partial.snapshot().reason, "observer-error"); assert.equal(factoryCalls, 0);
  await nextTask(); assert.equal(broken.onDisposeObservable.hasObservers(), false);
  const hardened = host(); Object.defineProperty(hardened, "_getShaderProcessor", { writable: false, configurable: false });
  const blocked = new ShaderSyntaxCache(hardened, { createCache() { factoryCalls++; return nativeLease().lease; } });
  assert.equal(blocked.snapshot().reason, "running"); assert.equal(factoryCalls, 1); blocked.dispose();
});

test("cache and the actual CPU profiler coexist in both orders without stealing method ownership", () => {
  for (const profilerFirst of [false, true]) {
    const engine = host(), originalGetter = engine._getShaderProcessor;
    let cache: ShaderSyntaxCache | undefined, cpu: WebGpuStartupCpuProfile | undefined;
    const installCache = () => { cache = new ShaderSyntaxCache(engine, { enabled: true, createCache: () => nativeLease({ enabled: true }).lease }); };
    try {
      if (profilerFirst) { cpu = new WebGpuStartupCpuProfile(engine); installCache(); }
      else { installCache(); cpu = new WebGpuStartupCpuProfile(engine); }
      engine.onBeginFrameObservable.notifyObservers(engine); engine._getShaderProcessor(1); engine.createEffect();
      assert.equal(cache!.snapshot().active, true); assert.equal(cpu.snapshot().active, true);
      assert.equal(cpu.snapshot().createEffect.calls, 1); assert.equal(cpu.snapshot().counts.ownershipChanges, 0);
      cache!.dispose(); assert.equal(cpu.snapshot().active, true);
      engine.createEffect(); assert.equal(cpu.snapshot().createEffect.calls, 2);
      cpu.dispose(); assert.equal(engine._getShaderProcessor, originalGetter);
    } finally { cache?.dispose(); cpu?.dispose(); }
  }
});

test("cleanup failures remain visible and do not prevent other cleanup or mask a still-active malformed lease", async () => {
  const engine = host(), native = nativeLease({ enabled: true }), original = engine._getShaderProcessor;
  native.lease.dispose = () => { throw new Error("dispose failed"); };
  native.lease.setEnabled = () => { throw new Error("disable failed"); };
  native.lease.reset = () => { throw new Error("reset failed"); };
  engine.onContextLostObservable.remove = () => { throw new Error("detach failed"); };
  const cache = new ShaderSyntaxCache(engine, { enabled: true, createCache: () => native.lease });
  assert.doesNotThrow(() => cache.dispose());
  const snapshot = cache.snapshot(); assert.equal(snapshot.cleanupIncomplete, true); assert.equal(snapshot.errors.cleanup, 4);
  assert.equal(snapshot.active, true, "disposed controller must not pretend a failed native release is inactive");
  assert.equal(snapshot.stats?.disposed, false); assert.equal(engine._getShaderProcessor, original);
  await nextTask(); assert.equal(engine.onDisposeObservable.hasObservers(), false);
  engine.onContextLostObservable.notifyObservers(engine); assert.deepEqual(cache.snapshot(), snapshot);
});

test("operation/snapshot errors do not escape and retain truthful primitive diagnostics", () => {
  const f = fixture({ enabled: true });
  f.native().lease.setEnabled = () => { throw new Error("native setter failed"); };
  assert.doesNotThrow(() => f.cache.setEnabled(false)); assert.equal(f.cache.snapshot().reason, "cache-error");
  assert.equal(f.cache.snapshot().errors.operation, 1); assert.equal(f.cache.snapshot().active, false);
  const g = fixture({ enabled: true }); g.native().lease.snapshot = () => { throw new Error("snapshot failed"); };
  const uncertain = g.cache.snapshot(); assert.equal(uncertain.active, null); assert.equal(uncertain.statsCurrent, false);
  assert.equal(uncertain.stats?.enabled, true); assert.equal(uncertain.activityKnown, false);
  g.cache.dispose(); assert.equal(g.native().disposals(), 1); assert.equal(g.cache.snapshot().active, null);
});

test("only whitelisted primitive native stats survive actual client sanitization and server validation", () => {
  const f = fixture({ enabled: true }); let getterReads = 0;
  Object.assign(f.native().stats, { entries: 3, textUnits: 55, hits: 11, unsupported: 0,
    probationEntries: 1, residentEntries: 1, bypassEntries: 1, deferred: 5, promotions: 2, promotionSkips: 1, bypasses: 3 });
  f.native().lease.snapshot = () => Object.defineProperties({ ...f.native().stats, source: "private source", ast: { code: "hidden" }, device: f.engine._device },
    { extra: { enumerable: true, get() { getterReads++; throw new Error("must not read"); } } });
  try {
    const snapshot = f.cache.snapshot(), data = sanitizeDiagnosticsData({ syntaxCache: snapshot });
    const batch = validateDiagnosticsBatch({ schemaVersion: 1, sessionId: "15288d65-9bf8-4d28-b29b-e053265aa984", batchId: 0,
      records: [{ seq: 0, atMs: 1, kind: "syntax-cache", data }] });
    assert.ok(batch); assert.deepEqual(batch.records[0].data.syntaxCache, snapshot);
    assert.equal(snapshot.stats?.hits, 11); assert.equal(snapshot.stats?.textUnits, 55); assert.equal(getterReads, 0);
    assert.equal(snapshot.stats?.probationEntries, 1); assert.equal(snapshot.stats?.promotions, 2);
    assert.equal(snapshot.stats?.bypasses, 3);
    for (const value of Object.values(snapshot.stats!)) assert.ok(typeof value === "boolean" || typeof value === "number");
    assert.equal(JSON.stringify(snapshot).includes("private source"), false); assert.equal("ast" in snapshot.stats!, false);
    assert.deepEqual(sanitizeDiagnosticsData({ profile: snapshot }), {}, "existing privacy rule stays intact");
    snapshot.stats!.hits = 999; assert.equal(f.cache.snapshot().stats?.hits, 11, "returned snapshot is detached");
  } finally { f.cache.dispose(); }
});
