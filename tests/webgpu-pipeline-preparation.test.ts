import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { Observable } from "@babylonjs/core/Misc/observable";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUCacheRenderPipelineTree } from "@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipelineTree";
import { WebGPUClearQuad } from "@babylonjs/core/Engines/WebGPU/webgpuClearQuad";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import { WebGPUCacheRenderPipeline } from "@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipeline";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { WebGpuPipelinePreparation } from "../client/webgpu-pipeline-preparation";
import { WebGpuCompilationProfile } from "../client/webgpu-compilation-profile";

let effectId = 800000, resourceId = 1;
function effect() {
  return { uniqueId: effectId++, isDisposed: false, _pipelineContext: {
    stages: { vertexStage: { module: { id: resourceId++ }, entryPoint: "main" },
      fragmentStage: { module: { id: resourceId++ }, entryPoint: "main" } },
    shaderProcessingContext: { attributeNamesFromEffect: [], attributeLocationsFromEffect: [],
      bindGroupLayoutEntries: [[], [], []], availableTextures: {}, availableSamplers: {}, textureNames: [] },
    bindGroupLayouts: [], uniformBuffer: null,
  } } as any;
}
function fixture(t: TestContext, maxEntries = 64, retry?: () => void) {
  const requests: { descriptor: any; resolve(value?: any): void; reject(error: unknown): void; pipeline: any }[] = [];
  const sync: any[] = [], draws: any[] = [], clears: any[] = [];
  const device = {
    limits: { maxVertexAttributes: 16, maxVertexBufferArrayStride: 2048 },
    createBindGroupLayout: (d: any) => ({ entries: structuredClone(d.entries) }),
    createPipelineLayout: (d: any) => ({ groups: d.bindGroupLayouts }),
    createBindGroup: (d: any) => d,
    createRenderPipeline(d: any) { const p = { descriptor: d, id: resourceId++ }; sync.push(p); return p; },
    createRenderPipelineAsync(d: any) {
      let resolve!: (value: any) => void, reject!: (error: unknown) => void;
      const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; });
      const pipeline = { descriptor: d, id: resourceId++ };
      requests.push({ descriptor: d, resolve: (value = pipeline) => resolve(value), reject, pipeline });
      return promise;
    },
  };
  const cache = new WebGPUCacheRenderPipelineTree(device as any, null as any) as any;
  const clearCache = new WebGPUCacheRenderPipelineTree(device as any, null as any) as any;
  const active = effect(), clearEffect = effect();
  clearEffect._pipelineContext.uniformBuffer = {
    update() {}, getBuffer: () => ({ uniqueId: 7, capacity: 64, underlyingResource: {} }),
  };
  clearEffect.setDirectColor4 = clearEffect.setFloat = () => {};
  const pass = {
    setPipeline(p: any) { assert.ok(p && typeof p.then !== "function" && p.descriptor); this.pipeline = p; },
    pipeline: undefined as any, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
    setStencilReference() {},
    draw(...args: any[]) { draws.push({ pipeline: this.pipeline, args }); },
    drawIndexed(...args: any[]) { draws.push({ pipeline: this.pipeline, args }); },
  };
  const engine = Object.create(WebGPUEngine.prototype) as any;
  Object.assign(engine, { _device: device, _cacheRenderPipeline: cache, _compatibilityMode: true,
    _snapshotRendering: { enabled: false, play: false, record: false }, _currentEffect: active,
    _currentRenderTarget: null, _currentVertexBuffers: {}, _currentOverrideVertexBuffers: null,
    _currentIndexBuffer: null, _currentDrawContext: { setVertexPulling() {} },
    _currentMaterialContext: { useVertexPulling: false, hasFloatOrDepthTextures: false, textures: {} },
    _caps: { textureFloatLinearFiltering: false }, _bundleList: {},
    _cacheBindGroups: { getBindGroups: () => [] }, _getCurrentRenderPass: () => pass,
    applyStates() {}, bindUniformBufferBase() {}, _applyRenderPassChanges() {}, _reportDrawCall() {},
    _ubDontInvertY: { uniqueId: 1, underlyingResource: {}, capacity: 8 },
    _ubInvertY: { uniqueId: 2, underlyingResource: {}, capacity: 8 },
    onDisposeObservable: new Observable(), onBeginFrameObservable: new Observable(), onEndFrameObservable: new Observable(),
    onContextRestoredObservable: new Observable(),
  });
  Object.defineProperty(engine, "isWebGPU", { value: true, configurable: true });
  Object.defineProperty(engine, "currentSampleCount", { value: 1, writable: true });
  const clear = Object.create(WebGPUClearQuad.prototype) as any;
  Object.assign(clear, { _device: device, _engine: engine, _cacheRenderPipeline: clearCache,
    _effect: clearEffect, _bindGroups: {}, _bundleCache: {}, _keyTemp: [] });
  engine._clearQuad = clear;
  const controller = new AbortController();
  const helper = new WebGpuPipelinePreparation(engine, { signal: controller.signal, maxEntries, retryIncompleteFrame: retry });
  t.after(() => helper.dispose());
  const draw = () => engine._draw(0, 0, 0, 3, 1);
  const clearDraw = () => { const before = draws.length; clear.clear(pass, { r: 1, g: 0, b: 0, a: 1 }, true, true, 1); clears.push(draws.length - before); };
  return { engine, device, cache, clearCache, clear, active, helper, requests, sync, draws, clears, draw, clearDraw, controller };
}

test("actual pinned miss defers draw, consumes completion only at the next native miss, then hits", async (t) => {
  const f = fixture(t);
  const misses = WebGPUCacheRenderPipeline.NumCacheMiss;
  assert.equal(f.helper.isReady(), false);
  assert.equal(f.helper.render(f.draw), false);
  const token = f.cache._parameter.token;
  assert.equal(f.requests.length, 1); assert.equal(f.sync.length, 0); assert.equal(f.draws.length, 0);
  assert.equal(f.helper.render(f.draw), false);
  assert.equal(f.requests.length, 1, "pending token deduplicates actual native misses");
  f.requests[0].resolve(); await setImmediate();
  assert.equal(WebGPUCacheRenderPipeline.NumCacheMiss, misses, "completion does not forge native cache counters");
  assert.equal(token.pipeline, undefined, "Promise completion never installs native cache state");
  assert.equal(f.helper.isReady(), false, "fulfilled but unconsumed is not ready");
  assert.equal(f.helper.render(f.draw), true);
  assert.ok(token.pipeline === f.requests[0].pipeline);
  assert.equal(WebGPUCacheRenderPipeline.NumCacheMiss, misses + 1, "native getRenderPipeline owns the one insertion");
  assert.ok(f.draws[0].pipeline === f.requests[0].pipeline);
  assert.equal(f.helper.isReady(), true);
  f.helper.render(f.draw); assert.equal(f.requests.length, 1); assert.equal(f.draws.length, 2);
});

test("actual clearQuad has its own cache and catches only its own pending miss before binding/drawing", async (t) => {
  const f = fixture(t);
  assert.equal(f.helper.render(() => { f.clearDraw(); f.draw(); }), false);
  assert.equal(f.requests.length, 2); assert.deepEqual(f.clears, [0]);
  const clearToken = f.clearCache._parameter.token, mainToken = f.cache._parameter.token;
  assert.notEqual(clearToken, mainToken);
  f.requests.forEach((r) => r.resolve()); await setImmediate();
  assert.equal(f.helper.render(() => { f.clearDraw(); f.draw(); }), true);
  assert.deepEqual(f.clears, [0, 1]); assert.equal(f.draws.length, 2);
  assert.equal(f.helper.isReady(), true);
});

test("actual cache descriptors retain MSAA, texture state, MRT, stencil and native/instance override layout", async (t) => {
  const f = fixture(t), cpu = new NullEngine(); t.after(() => cpu.dispose());
  f.active.getEngine = () => cpu;
  const vertex = new VertexBuffer(cpu, new Float32Array(24), "position", false, false, 6, false, 0, 3);
  const instance = new VertexBuffer(cpu, new Float32Array(32), "position", false, false, 8, true, 4, 3);
  t.after(() => { vertex.dispose(); instance.dispose(); });
  const c = f.active._pipelineContext;
  c.shaderProcessingContext.attributeNamesFromEffect = ["position"];
  c.shaderProcessingContext.attributeLocationsFromEffect = [0];
  f.cache.setBuffers({ position: vertex }, null, null);
  f.engine._currentVertexBuffers = { position: vertex };
  f.helper.render(f.draw);
  const first = f.requests[0].descriptor;
  assert.equal(first.vertex.buffers[0].stepMode, "vertex");
  assert.equal(first.vertex.buffers[0].arrayStride, 24);
  f.cache.setBuffers({ position: vertex }, null, { position: instance });
  f.engine._currentOverrideVertexBuffers = { position: instance };
  f.engine.currentSampleCount = 4;
  f.cache.setDepthStencilFormat("depth24plus-stencil8"); f.cache.setStencilEnabled(true);
  f.cache.setStencilReadMask(0x77); f.cache.setStencilWriteMask(0x66);
  f.cache.setMRT([{ format: 5, type: 2 }, { format: 5, type: 0 }], 2);
  f.cache.setMRTAttachments([1, 2]);
  c.shaderProcessingContext.textureNames = ["depth"];
  f.engine._currentMaterialContext.hasFloatOrDepthTextures = true;
  f.engine._currentMaterialContext.textures.depth = { texture: { format: 14, type: 0 } };
  f.helper.render(f.draw);
  const second = f.requests[1].descriptor;
  assert.equal(second.vertex.buffers[0].stepMode, "instance");
  assert.equal(second.vertex.buffers[0].arrayStride, 32);
  assert.equal(second.vertex.buffers[0].attributes[0].offset, 16);
  assert.equal(second.multisample.count, 4); assert.equal(second.fragment.targets.length, 2);
  assert.equal(second.depthStencil.stencilReadMask, 0x77);
  assert.equal(second.depthStencil.stencilWriteMask, 0x66);
  assert.match(second.label, /textureState1/);
  // Compare against the actual synchronous descriptor construction in the same
  // state, not a copied pipeline descriptor builder.
  const expected = (WebGPUCacheRenderPipelineTree.prototype as any)._createRenderPipeline.call(f.cache, f.active, "triangle-list", 4);
  assert.deepEqual(second, (expected as any).descriptor);
  f.requests.forEach((r) => r.resolve()); await setImmediate();
  assert.equal(f.helper.render(f.draw), true);
  assert.ok(f.draws.at(-1).pipeline === f.requests[1].pipeline);
});

test("bounded work skips excess misses and allows later discovery without a deferred descriptor queue", async (t) => {
  const f = fixture(t, 2);
  const effects = [f.active, effect(), effect()];
  const drawAll = () => { for (const value of effects) { f.engine._currentEffect = value; f.draw(); } };
  f.helper.render(drawAll); assert.equal(f.requests.length, 2);
  f.helper.render(drawAll); assert.equal(f.requests.length, 2);
  f.requests.forEach((r) => r.resolve()); await setImmediate();
  assert.equal(f.helper.render(drawAll), false); assert.equal(f.requests.length, 3);
  f.requests[2].resolve(); await setImmediate();
  assert.equal(f.helper.render(drawAll), true); assert.equal(f.helper.isReady(), true);
});

test("once-only renderer is reset for a real retry and a live inactive ready orphan cannot deadlock", async (t) => {
  const renderer = Object.create(ObjectRenderer.prototype) as any;
  Object.assign(renderer, { _engine: { snapshotRendering: false }, _refreshRate: 0, _currentRefreshId: -1 });
  let retries = 0, active = true;
  const f = fixture(t, 64, () => { retries++; renderer.resetRefreshCounter(); });
  const render = () => { if (active && renderer.shouldRender()) f.draw(); };
  f.helper.render(render); assert.equal(retries, 1);
  f.requests[0].resolve(); await setImmediate();
  assert.equal(f.helper.isReady(), false);
  assert.equal(f.helper.render(render), true); assert.equal(f.draws.length, 1);
  assert.equal(f.helper.isReady(), true);
  // Another valid Effect disappears from the active scene while pending.
  f.engine._currentEffect = effect(); renderer.resetRefreshCounter();
  f.helper.render(render); active = false;
  f.requests[1].resolve(); await setImmediate();
  const orphanToken = f.cache._parameter.token;
  assert.equal(f.helper.isReady(), false);
  f.helper.render(render);
  assert.equal(f.helper.isReady(), true, "complete forced retry proves current inactivity");
  assert.equal(orphanToken.pipeline, undefined, "orphan is retired without cache installation");
  active = true; renderer.resetRefreshCounter();
  f.helper.render(render); assert.equal(f.requests.length, 3, "future coverage is not fabricated");
});

test("without owned target retry, a ready unconsumed result conservatively blocks readiness", async (t) => {
  const f = fixture(t); f.helper.render(f.draw); f.requests[0].resolve(); await setImmediate();
  f.helper.render(() => {}); assert.equal(f.helper.isReady(), false);
  f.helper.render(f.draw); assert.equal(f.helper.isReady(), true);
});

test("inactive ready results cannot fill the bound and starve new visible pipelines", async (t) => {
  const f = fixture(t, 1, () => {});
  f.helper.render(f.draw); const oldToken = f.cache._parameter.token;
  f.requests[0].resolve(); await setImmediate();
  f.engine._currentEffect = effect();
  assert.equal(f.helper.render(f.draw), false, "new pipeline initially meets the full bound");
  assert.equal(f.helper.isReady(), false);
  assert.equal(oldToken.pipeline, undefined);
  f.helper.render(f.draw); assert.equal(f.requests.length, 2, "unrequested ready orphan frees the bound");
  f.requests[1].resolve(); await setImmediate();
  f.helper.render(f.draw); assert.equal(f.helper.isReady(), true);
});

test("changed Effect context/stage/disposal retires stale work and requires another complete frame", async (t) => {
  const f = fixture(t); f.helper.render(f.draw);
  const token = f.cache._parameter.token;
  f.active._pipelineContext = effect()._pipelineContext;
  f.requests[0].resolve(); await setImmediate();
  assert.equal(f.helper.isReady(), false); assert.equal(token.pipeline, undefined);
  f.helper.render(f.draw); assert.equal(f.requests.length, 2);
  f.requests[1].resolve(); await setImmediate();
  f.active._pipelineContext.stages.vertexStage.module = { changed: true };
  assert.equal(f.helper.isReady(), false);
  f.helper.render(f.draw); assert.equal(f.requests.length, 3);
  f.active.isDisposed = true; assert.equal(f.helper.isReady(), false);
  f.requests[2].resolve(); await setImmediate();
  f.helper.render(() => {}); assert.equal(f.helper.isReady(), true);
});

test("async rejection is observed once, preserves the error, restores hooks and never becomes an unhandled rejection", async (t) => {
  const f = fixture(t), error = new Error("device pipeline rejected");
  f.helper.render(f.draw); f.requests[0].reject(error); await setImmediate();
  assert.throws(() => f.helper.isReady(), (e) => e === error);
  assert.throws(() => f.helper.render(f.draw), (e) => e === error);
  assert.equal(Object.hasOwn(f.engine, "_draw"), false);
  assert.equal(Object.hasOwn(f.cache, "_createRenderPipeline"), false);
});

test("foreign synchronous draw/clear errors propagate and outside render uses the native synchronous path", (t) => {
  const f = fixture(t), error = new Error("foreign bind fault");
  f.draw(); assert.equal(f.sync.length, 1); assert.equal(f.requests.length, 0);
  f.engine._cacheBindGroups.getBindGroups = () => { throw error; };
  assert.throws(() => f.helper.render(f.draw), (e) => e === error);
  assert.equal(f.helper.isReady(), false);
  // Seed a real clear pipeline outside the adapter, then fail inside its native
  // body. There is no pending signal or cache miss that could explain the throw.
  f.clearDraw();
  f.clear._effect.setFloat = () => { throw error; };
  assert.throws(() => f.helper.render(f.clearDraw), (e) => e === error);
});

test("disabled cache never uses a stale native token", (t) => {
  const f = fixture(t); f.cache._parameter.token = { stale: true }; f.cache.disabled = true;
  assert.equal(f.helper.render(f.draw), true);
  assert.equal(f.requests.length, 0); assert.equal(f.sync.length, 1); assert.equal(f.helper.isReady(), true);
});

for (const replacement of ["device", "main cache", "clear cache", "hook", "descriptor builder", "lookup", "mode"])
  test(`replacement of ${replacement} fails closed without late cache writes or deleting later owners`, async (t) => {
    const f = fixture(t); f.helper.render(f.draw); const token = f.cache._parameter.token;
    const later = () => {};
    if (replacement === "device") f.engine._device = {};
    if (replacement === "main cache") f.engine._cacheRenderPipeline = {};
    if (replacement === "clear cache") f.clear._cacheRenderPipeline = {};
    if (replacement === "hook") f.engine._draw = later;
    if (replacement === "descriptor builder") f.cache._buildRenderPipelineDescriptor = later;
    if (replacement === "lookup") f.cache.getRenderPipeline = later;
    if (replacement === "mode") f.engine.compatibilityMode = false;
    assert.throws(() => f.helper.isReady(), /ownership or device/);
    f.requests[0].resolve(); await setImmediate(); assert.equal(token.pipeline, undefined);
    if (replacement === "hook") assert.ok(f.engine._draw === later);
    if (replacement === "descriptor builder") assert.ok(f.cache._buildRenderPipelineDescriptor === later);
    if (replacement === "lookup") assert.ok(f.cache.getRenderPipeline === later);
  });

test("signal/engine disposal and retained wrappers are safe, idempotent and release late Promise writes", async (t) => {
  for (const kind of ["signal", "engine", "manual"] as const) {
    const f = fixture(t); const retained = f.engine._draw;
    f.helper.render(f.draw); const token = f.cache._parameter.token;
    if (kind === "signal") f.controller.abort();
    else if (kind === "engine") f.engine.onDisposeObservable.notifyObservers(f.engine);
    else f.helper.dispose();
    f.helper.dispose(); f.requests[0].resolve(); await setImmediate();
    assert.equal(token.pipeline, undefined); assert.equal(f.helper.isReady(), false);
    retained.call(f.engine, 0, 0, 0, 3, 1);
    assert.equal(f.sync.length, 1, "retained inactive wrapper delegates its original method");
  }
});

test("WebGL, noncompatibility and snapshot hosts are inert without touching device hooks", () => {
  for (const e of [{ isWebGPU: false }, { isWebGPU: true, compatibilityMode: false },
    { isWebGPU: true, compatibilityMode: true, snapshotRendering: true }]) {
    const helper = new WebGpuPipelinePreparation(e); let calls = 0;
    assert.equal(helper.render(() => calls++), true); assert.equal(helper.isReady(), true);
    assert.equal(calls, 1); helper.dispose();
  }
});

test("abort inside render stops acceptance and late rejection is consumed without touching a newer owner", async (t) => {
  const f = fixture(t);
  assert.equal(f.helper.render(() => { f.draw(); f.controller.abort(); }), false);
  const newer = new WebGpuPipelinePreparation(f.engine); t.after(() => newer.dispose());
  const ownedDraw = f.engine._draw;
  f.requests[0].reject(new Error("retired request")); await setImmediate();
  assert.ok(f.engine._draw === ownedDraw);
  assert.equal(newer.render(f.draw), false); assert.equal(f.requests.length, 2);
  f.requests[1].resolve(); await setImmediate();
  assert.equal(newer.render(f.draw), true); assert.equal(newer.isReady(), true);
});

test("synchronous device failure keeps its identity and rolls back adapter ownership", (t) => {
  const f = fixture(t), error = new Error("sync async-API fault");
  f.device.createRenderPipelineAsync = () => { throw error; };
  assert.throws(() => f.helper.render(f.draw), (e) => e === error);
  assert.throws(() => f.helper.isReady(), (e) => e === error);
  assert.equal(Object.hasOwn(f.cache, "_createRenderPipeline"), false);
});

test("a full frame before Promise completion cannot authorize readiness after completion", async (t) => {
  const f = fixture(t, 64, () => {});
  f.helper.render(f.draw);
  assert.equal(f.helper.render(() => {}), true);
  assert.equal(f.helper.isReady(), false);
  f.requests[0].resolve(); await setImmediate();
  assert.equal(f.helper.isReady(), false, "completion invalidates the older complete frame");
  f.helper.render(() => {}); assert.equal(f.helper.isReady(), true);
});

test("pending entries retired by a disabled cache still bound outstanding work until settlement", async (t) => {
  const f = fixture(t, 1);
  f.helper.render(f.draw); f.cache.disabled = true;
  f.helper.render(f.draw); assert.equal(f.sync.length, 1); assert.equal(f.helper.isReady(), false);
  f.cache.disabled = false; f.engine._currentEffect = effect();
  f.helper.render(f.draw); assert.equal(f.requests.length, 1, "retired unresolved job still consumes the limit");
  f.requests[0].resolve(); await setImmediate();
  f.helper.render(f.draw); assert.equal(f.requests.length, 2);
  f.requests[1].resolve(); await setImmediate();
  f.helper.render(f.draw); assert.equal(f.helper.isReady(), true);
});

test("native descriptor construction that reprocesses an Effect cannot enqueue an old-stage pipeline", (t) => {
  const f = fixture(t), cpu = new NullEngine(); t.after(() => cpu.dispose());
  (cpu as any)._getShaderProcessingContext = () => new WebGPUShaderProcessingContext(1, false);
  const vertex = new VertexBuffer(cpu, new Uint32Array(9), "position", false, false, 3,
    false, 0, 3, VertexBuffer.UNSIGNED_INT);
  t.after(() => vertex.dispose());
  f.active.getEngine = () => cpu;
  f.active._pipelineContext.vertexBufferKindToType = { position: VertexBuffer.FLOAT };
  f.active._pipelineContext.shaderProcessingContext.attributeNamesFromEffect = ["position"];
  f.active._pipelineContext.shaderProcessingContext.attributeLocationsFromEffect = [0];
  f.active._processShaderCodeAsync = () => { f.active._pipelineContext = effect()._pipelineContext; return Promise.resolve(); };
  f.cache.setBuffers({ position: vertex }, null, null);
  assert.equal(f.helper.render(f.draw), false);
  assert.equal(f.requests.length, 0, "actual pinned non-float path changed context before async dispatch");
});

test("cleanup continues after a foreign hardened descriptor and records a meaningful fault", async (t) => {
  const f = fixture(t); f.helper.render(f.draw);
  const token = f.cache._parameter.token, wrapper = f.clearCache._createRenderPipeline;
  Object.defineProperty(f.clearCache, "_createRenderPipeline", { value: wrapper, configurable: false, writable: false });
  f.helper.dispose(); f.helper.dispose();
  assert.throws(() => f.helper.isReady(), (error) => error instanceof AggregateError && /cleanup/.test(error.message));
  assert.ok(f.clearCache._createRenderPipeline === wrapper, "later descriptor is not forced open");
  assert.equal(Object.hasOwn(f.engine, "_draw"), false);
  assert.equal(Object.hasOwn(f.clear, "clear"), false);
  assert.equal(Object.hasOwn(f.cache, "_createRenderPipeline"), false);
  assert.equal(Reflect.get(f.helper, "engine"), undefined);
  assert.equal(Reflect.get(f.helper, "entries").size, 0);
  assert.equal(Reflect.get(f.helper, "work").size, 0);
  assert.equal(f.engine.onDisposeObservable.hasObservers(), false);
  f.requests[0].resolve(); await setImmediate(); assert.equal(token.pipeline, undefined);
});

test("a structurally missing shader module fails immediately rather than waiting through startup timeout", (t) => {
  const f = fixture(t); f.active._pipelineContext.stages.vertexStage.module = null;
  assert.throws(() => f.helper.render(f.draw), /no live shader stages/);
  assert.equal(f.requests.length, 0);
  assert.throws(() => f.helper.isReady(), /no live shader stages/);
});

test("existing compilation profile observes the original async request exactly once", async (t) => {
  const f = fixture(t); let tracks = 0, errors = 0;
  const profile = new WebGpuCompilationProfile(f.engine, {
    track: (promise) => {
      tracks++;
      // RenderHealth owns this observed rejection branch in the application.
      return promise.catch((error) => { errors++; throw error; });
    },
    onError: () => errors++,
  });
  t.after(() => profile.dispose());
  f.helper.render(f.draw);
  assert.equal(tracks, 1);
  const failure = new Error("pipeline rejection already observed by profile");
  f.requests[0].reject(failure); await setImmediate();
  assert.equal(tracks, 1); assert.equal(errors, 1);
  assert.throws(() => f.helper.isReady(), (error) => error === failure);
});

test("dispose releases the scene retry callback while the original pipeline Promise is still pending", async (t) => {
  for (const kind of ["manual", "signal", "engine"] as const) {
    const sceneOwner = { objectRenderers: [{ retries: 0 }] };
    const retry = () => sceneOwner.objectRenderers.forEach((renderer) => renderer.retries++);
    const f = fixture(t, 64, retry);
    f.helper.render(f.draw);
    const token = f.cache._parameter.token;
    assert.equal(sceneOwner.objectRenderers[0].retries, 1);
    assert.ok(Reflect.get(f.helper, "retry") === retry);
    if (kind === "signal") f.controller.abort();
    else if (kind === "engine") f.engine.onDisposeObservable.notifyObservers(f.engine);
    else f.helper.dispose();
    try {
      // Deterministic ownership assertion: do not rely on GC timing/WeakRef.
      // Promise callbacks still retain the helper until the device settles.
      assert.equal(Reflect.get(f.helper, "retry"), undefined, kind + " must release the captured scene owner");
    } finally {
      if (kind === "signal") f.requests[0].reject(new Error("late retired pipeline"));
      else f.requests[0].resolve();
      await setImmediate();
    }
    assert.equal(sceneOwner.objectRenderers[0].retries, 1);
    assert.equal(token.pipeline, undefined);
    assert.equal(f.helper.isReady(), false);
    f.helper.dispose();
  }
});
