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
import { WebGPUDrawContext } from "@babylonjs/core/Engines/WebGPU/webgpuDrawContext";
import { WebGPUBundleList } from "@babylonjs/core/Engines/WebGPU/webgpuBundleList";
import { WebGPUMaterialContext } from "@babylonjs/core/Engines/WebGPU/webgpuMaterialContext";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
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
function fixture(t: TestContext, maxEntries = 64, retry?: () => void, diagnostics = false, compatibilityMode = true) {
  const requests: { descriptor: any; resolve(value?: any): void; reject(error: unknown): void; pipeline: any }[] = [];
  const sync: any[] = [], draws: any[] = [], clears: any[] = [];
  const encoders: { finished: boolean; commands: any[] }[] = [], stencilRefs: number[] = [];
  const device = {
    limits: { maxVertexAttributes: 16, maxVertexBufferArrayStride: 2048 },
    createBindGroupLayout: (d: any) => ({ entries: structuredClone(d.entries) }),
    createPipelineLayout: (d: any) => ({ groups: d.bindGroupLayouts }),
    createBindGroup: (d: any) => d,
    createRenderBundleEncoder() {
      const record = { finished: false, commands: [] as any[] }; encoders.push(record);
      return {
        pipeline: undefined as any,
        setPipeline(p: any) { assert.ok(p?.descriptor); this.pipeline = p; },
        setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
        draw(...args: any[]) { record.commands.push({ pipeline: this.pipeline, args }); },
        drawIndexed(...args: any[]) { record.commands.push({ pipeline: this.pipeline, args }); },
        finish() { record.finished = true; return { commands: record.commands }; },
      };
    },
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
    setStencilReference(value: number) { stencilRefs.push(value); },
    executeBundles(bundles: any[]) {
      for (const bundle of bundles) {
        assert.ok(bundle && Array.isArray(bundle.commands), "only completed bundles reach submission");
        draws.push(...bundle.commands);
      }
    },
    draw(...args: any[]) { draws.push({ pipeline: this.pipeline, args }); },
    drawIndexed(...args: any[]) { draws.push({ pipeline: this.pipeline, args }); },
  };
  const engine = Object.create(WebGPUEngine.prototype) as any;
  const drawContext = compatibilityMode ? { setVertexPulling() {} } : new WebGPUDrawContext({} as any, {} as any);
  const bundleList = new WebGPUBundleList(device as any);
  Object.assign(engine, { _device: device, _cacheRenderPipeline: cache, _compatibilityMode: compatibilityMode,
    _snapshotRendering: { enabled: false, play: false, record: false }, _currentEffect: active,
    _currentRenderTarget: null, _currentVertexBuffers: {}, _currentOverrideVertexBuffers: null,
    _currentIndexBuffer: null, _currentDrawContext: drawContext,
    _currentMaterialContext: { updateId: 0, isDirty: false, useVertexPulling: false, hasFloatOrDepthTextures: false, textures: {} },
    _caps: { textureFloatLinearFiltering: false }, _bundleList: bundleList,
    _cacheBindGroups: { getBindGroups: (_pipeline: any, context: any, material: any) => {
      context.resetIsDirty?.(material.updateId); material.isDirty = false; return [];
    } }, _getCurrentRenderPass: () => pass,
    applyStates() {}, bindUniformBufferBase() {}, _applyRenderPassChanges() {}, _reportDrawCall() {},
    _ubDontInvertY: { uniqueId: 1, underlyingResource: {}, capacity: 8 },
    _ubInvertY: { uniqueId: 2, underlyingResource: {}, capacity: 8 },
    _colorFormat: "bgra8unorm", _depthTextureFormat: "depth24plus-stencil8",
    _clearStencilValue: 0, _stencilStateComposer: { funcRef: 5 }, _stencilRef: 5,
    _counters: { numBundleCreationNonCompatMode: 0, numBundleReuseNonCompatMode: 0 },
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
  const helper = new WebGpuPipelinePreparation(engine, { signal: controller.signal, maxEntries, retryIncompleteFrame: retry, diagnostics });
  t.after(() => helper.dispose());
  const draw = () => engine._draw(0, 0, 0, 3, 1);
  const clearDraw = () => { const before = draws.length; clear.clear(pass, { r: 1, g: 0, b: 0, a: 1 }, true, true, 1); clears.push(draws.length - before); };
  const submitBundles = () => { bundleList.run(pass as any); bundleList.reset(); };
  const nativeClear = () => engine._clearFullQuad({ r: 1, g: 0, b: 0, a: 1 }, true, true);
  return { engine, device, cache, clearCache, clear, active, helper, requests, sync, draws, clears, draw, clearDraw,
    controller, encoders, stencilRefs, bundleList, submitBundles, nativeClear };
}

test("NCM native main draw defers a cold miss, then creates and reuses only a completed bundle", async (t) => {
  const f = fixture(t, 64, undefined, true, false);
  const frame = () => { f.draw(); f.submitBundles(); };
  assert.equal(f.helper.render(frame), false);
  assert.equal(f.requests.length, 1); assert.equal(f.sync.length, 0);
  assert.equal(f.encoders.length, 0, "native main miss precedes bundle encoder creation");
  assert.equal(f.draws.length, 0); assert.equal(f.helper.isReady(), false);
  f.requests[0].resolve(); await setImmediate();
  assert.equal(f.helper.render(frame), true); assert.equal(f.helper.isReady(), true);
  assert.equal(f.encoders.length, 1); assert.equal(f.draws.length, 1);
  const bundle = f.engine._currentDrawContext.fastBundle;
  assert.equal(f.helper.render(frame), true);
  assert.equal(f.engine._currentDrawContext.fastBundle, bundle);
  assert.equal(f.encoders.length, 1); assert.equal(f.draws.length, 2);
  assert.equal(f.engine._counters.numBundleReuseNonCompatMode, 1);
});

test("NCM native clear miss restores stencil and retries without publishing an unfinished bundle", async (t) => {
  const f = fixture(t, 64, undefined, true, false);
  const frame = () => { f.nativeClear(); f.draw(); f.submitBundles(); };
  assert.equal(f.helper.render(frame), false);
  assert.equal(f.requests.length, 2); assert.equal(f.sync.length, 0);
  assert.equal(f.encoders.length, 1); assert.equal(f.encoders[0].finished, false);
  assert.equal(Object.keys(f.clear._bundleCache).length, 0);
  assert.equal(f.engine._currentDrawContext.fastBundle, undefined);
  assert.equal(f.draws.length, 0); assert.deepEqual(f.stencilRefs, [0, 5]);
  f.requests.forEach((r) => r.resolve()); await setImmediate();
  assert.equal(f.helper.render(frame), true); assert.equal(f.helper.isReady(), true);
  assert.equal(f.draws.length, 2); assert.equal(Object.keys(f.clear._bundleCache).length, 1);
  const encoderCount = f.encoders.length;
  assert.equal(f.helper.render(frame), true);
  assert.equal(f.encoders.length, encoderCount, "both main and clear bundles are reused");
  assert.deepEqual(f.stencilRefs, [0, 5, 0, 5, 0, 5]);
});

test("NCM native shadow aliases share one prepared pipeline and keep distinct reusable bundles", async (t) => {
  const f = fixture(t, 64, undefined, true, false);
  const cpu = new NullEngine() as any, scene = new Scene(cpu);
  cpu.createDrawContext = () => new WebGPUDrawContext({} as any, {} as any);
  cpu.createMaterialContext = () => new WebGPUMaterialContext();
  const makeEffect = () => {
    const value = effect();
    Object.assign(value, { shaderLanguage: 1, defines: "", name: "shadow test GPU modules",
      vertexSourceCodeBeforeMigration: "@vertex fn main() {}", fragmentSourceCodeBeforeMigration: "@fragment fn main() {}",
      getEngine: () => cpu, isReady: () => true, getUniformNames: () => [], getAttributesNames: () => [],
      getUniformBuffersNames: () => [], getSamplers: () => [], getIndexParameters: () => undefined,
      dispose() { value.isDisposed = true; },
    });
    return value;
  };
  cpu.createEffect = makeEffect;
  const material = new PBRMaterial("prepared shadow", scene);
  const mesh = MeshBuilder.CreatePlane("prepared shadow plane", {}, scene);
  mesh.material = material;
  const sub = mesh.subMeshes[0], main = sub._getDrawWrapper(1, true)!;
  main.setEffect(makeEffect());
  const shadow = new ShadowDepthWrapper(material, scene, { doNotInjectCode: true });
  material.shadowDepthWrapper = shadow;
  t.after(() => { shadow.dispose(); scene.dispose(); cpu.dispose(); });
  cpu.currentRenderPassId = 1;
  material.onEffectCreatedObservable.notifyObservers({ effect: main.effect!, subMesh: sub });
  const generator = {} as any;
  assert.equal(shadow.isReadyForSubMesh(sub, [], generator, false, 2), true);
  const aliases = [shadow.getEffect(sub, generator, 2)!, shadow.getEffect(sub, generator, 3)!];
  assert.equal(aliases[0].effect, aliases[1].effect);
  assert.notEqual(aliases[0].drawContext, aliases[1].drawContext);
  f.engine._currentRenderTarget = {};
  f.engine._depthTextureFormat = "depth32float";
  f.cache.setColorFormat(undefined); f.cache.setDepthStencilFormat("depth32float");
  const frame = () => {
    for (const wrapper of aliases) {
      f.engine._currentDrawContext = wrapper.drawContext;
      f.engine._currentMaterialContext = wrapper.materialContext;
      f.engine._currentEffect = wrapper.effect;
      f.draw();
    }
    f.submitBundles();
  };
  assert.equal(f.helper.render(frame), false);
  assert.equal(f.requests.length, 1, "same live derived effect/token deduplicates pending work");
  assert.equal(f.draws.length, 0); assert.equal(f.encoders.length, 0);
  f.requests[0].resolve(); await setImmediate();
  assert.equal(f.helper.render(frame), true); assert.equal(f.helper.isReady(), true);
  assert.equal(f.draws.length, 2); assert.equal(f.encoders.length, 2);
  assert.notEqual((aliases[0].drawContext as WebGPUDrawContext).fastBundle,
    (aliases[1].drawContext as WebGPUDrawContext).fastBundle);
  assert.equal(f.helper.render(frame), true);
  assert.equal(f.draws.length, 4); assert.equal(f.encoders.length, 2);
  assert.equal(f.sync.length, 0);
});

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

for (const compatibilityMode of [true, false])
test(`${compatibilityMode ? "CM" : "NCM"} async rejection preserves the error and restores hooks without an unhandled rejection`, async (t) => {
  const f = fixture(t, 64, undefined, false, compatibilityMode), error = new Error("device pipeline rejected");
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

for (const compatibilityMode of [true, false])
for (const replacement of ["device", "main cache", "clear cache", "hook", "descriptor builder", "lookup", "mode"])
  test(`${compatibilityMode ? "CM" : "NCM"} replacement of ${replacement} fails closed without late cache writes or deleting later owners`, async (t) => {
    const f = fixture(t, 64, undefined, false, compatibilityMode); f.helper.render(f.draw); const token = f.cache._parameter.token;
    const later = () => {};
    if (replacement === "device") f.engine._device = {};
    if (replacement === "main cache") f.engine._cacheRenderPipeline = {};
    if (replacement === "clear cache") f.clear._cacheRenderPipeline = {};
    if (replacement === "hook") f.engine._draw = later;
    if (replacement === "descriptor builder") f.cache._buildRenderPipelineDescriptor = later;
    if (replacement === "lookup") f.cache.getRenderPipeline = later;
    if (replacement === "mode") f.engine.compatibilityMode = !compatibilityMode;
    assert.throws(() => f.helper.isReady(), /ownership or device/);
    f.requests[0].resolve(); await setImmediate(); assert.equal(token.pipeline, undefined);
    if (replacement === "hook") assert.ok(f.engine._draw === later);
    if (replacement === "descriptor builder") assert.ok(f.cache._buildRenderPipelineDescriptor === later);
    if (replacement === "lookup") assert.ok(f.cache.getRenderPipeline === later);
  });

for (const compatibilityMode of [true, false])
test(`${compatibilityMode ? "CM" : "NCM"} disposal and retained wrappers are safe, idempotent and release late Promise writes`, async (t) => {
  for (const kind of ["signal", "engine", "manual"] as const) {
    const f = fixture(t, 64, undefined, false, compatibilityMode); const retained = f.engine._draw;
    f.helper.render(() => { f.draw(); if (!compatibilityMode) f.nativeClear(); });
    const token = f.cache._parameter.token, clearToken = f.clearCache._parameter.token;
    if (kind === "signal") f.controller.abort();
    else if (kind === "engine") f.engine.onDisposeObservable.notifyObservers(f.engine);
    else f.helper.dispose();
    f.helper.dispose(); f.requests.forEach((r) => r.resolve()); await setImmediate();
    assert.equal(token.pipeline, undefined); assert.equal(f.helper.isReady(), false);
    if (!compatibilityMode) {
      assert.equal(clearToken.pipeline, undefined);
      assert.equal(Object.keys(f.clear._bundleCache).length, 0);
    }
    retained.call(f.engine, 0, 0, 0, 3, 1);
    assert.equal(f.sync.length, 1, "retained inactive wrapper delegates its original method");
  }
});

test("WebGL, unspecified mode and snapshot hosts are inert without touching device hooks", () => {
  for (const e of [{ isWebGPU: false }, { isWebGPU: true, snapshotRendering: false },
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

test("diagnostics are opt-in and snapshots distinguish pending from completed unconsumed work", async (t) => {
  const ordinary = fixture(t);
  assert.equal(ordinary.helper.snapshot(), null);
  const f = fixture(t, 64, undefined, true);
  assert.equal(f.helper.snapshot()!.readiness.lastResult, null);
  f.helper.render(f.draw);
  assert.deepEqual(f.helper.snapshot()!.entries, { total: 1, pending: 1, ready: 0 });
  f.helper.render(f.draw);
  assert.equal(f.helper.snapshot()!.skips["pending-entry"], 1);
  f.requests[0].resolve(); await setImmediate();
  const completed = f.helper.snapshot()!;
  assert.deepEqual(completed.entries, { total: 1, pending: 0, ready: 1 });
  assert.deepEqual(completed.work, { total: 1, pending: 0, retiredPending: 0 });
  assert.equal(completed.completionSerial, 1);
  assert.equal(completed.provenSerial, -1);
  assert.equal(f.helper.isReady(), false);
  f.helper.render(f.draw);
  assert.equal(f.helper.isReady(), true);
  const accepted = f.helper.snapshot()!;
  assert.deepEqual(accepted.entries, { total: 0, pending: 0, ready: 0 });
  assert.deepEqual(accepted.renders, { total: 3, complete: 1, incomplete: 2 });
  assert.deepEqual(accepted.readiness, { checks: 2, waits: 1, lastResult: true });
  assert.equal(accepted.completionSerial, accepted.provenSerial);
});

test("snapshot is a detached bounded plain record and does not probe, prune or advance readiness", async (t) => {
  const f = fixture(t, 64, undefined, true);
  f.active.name = { vertex: "v".repeat(1000) };
  f.helper.render(f.draw); f.helper.render(f.draw);
  const first = f.helper.snapshot()!;
  assert.equal(first.lastSkip!.effectName, "v".repeat(120));
  assert.equal(first.lastSkip!.effectId, f.active.uniqueId);
  f.active._pipelineContext = effect()._pipelineContext;
  Object.defineProperty(f.active, "name", { configurable: true, get: () => assert.fail("diagnostics invoked an effect getter") });
  for (const method of ["check", "prune", "isReady"])
    t.mock.method(f.helper as any, method, () => assert.fail("snapshot invoked " + method));
  const snapshot = f.helper.snapshot()!;
  assert.equal(snapshot.entries.pending, 1, "snapshot must leave stale entries untouched");
  assert.equal(snapshot.retirements.invalidIdentity, 0);
  assert.equal(snapshot.readiness.checks, 0);
  assert.equal(f.requests.length, 1);
  first.skips.capacity = 999; first.lastSkip!.identityChanges.push("foreign");
  assert.equal(snapshot.skips.capacity, 0);
  assert.deepEqual(snapshot.lastSkip!.identityChanges, []);
  const plain = (value: unknown): void => {
    if (value === null || typeof value === "boolean" || typeof value === "number") return;
    if (typeof value === "string") { assert.ok(value.length <= 120); return; }
    if (Array.isArray(value)) { assert.ok(value.length <= 13); value.forEach(plain); return; }
    assert.equal(Object.getPrototypeOf(value), Object.prototype);
    Object.values(value as object).forEach(plain);
  };
  plain(snapshot);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);
  f.helper.dispose();
  f.requests[0].resolve(); await setImmediate();
  assert.deepEqual(f.helper.snapshot()!.work, { total: 0, pending: 0, retiredPending: 0 });
});

test("diagnostics expose bounded capacity, unused ready retirement and retired pending work", async (t) => {
  const f = fixture(t, 1, () => {}, true);
  f.helper.render(f.draw); f.requests[0].resolve(); await setImmediate();
  f.engine._currentEffect = effect(); f.helper.render(f.draw);
  const orphan = f.helper.snapshot()!;
  assert.equal(orphan.skips.capacity, 1);
  assert.equal(orphan.retirements.unusedReady, 1);
  assert.equal(orphan.entries.total, 0);
  f.helper.render(f.draw);
  f.engine._currentEffect._pipelineContext = effect()._pipelineContext;
  assert.equal(f.helper.isReady(), false);
  const retired = f.helper.snapshot()!;
  assert.equal(retired.retirements.invalidIdentity, 1);
  assert.deepEqual(retired.entries, { total: 0, pending: 0, ready: 0 });
  assert.deepEqual(retired.work, { total: 1, pending: 1, retiredPending: 1 });
  f.requests[1].resolve(); await setImmediate();
  f.helper.render(f.draw); f.requests[2].resolve(); await setImmediate();
  f.helper.render(f.draw);
  assert.equal(f.helper.isReady(), true);
  f.helper.dispose();
  const disposed = f.helper.snapshot()!;
  assert.equal(disposed.active, false); assert.equal(disposed.disposed, true);
  assert.equal(disposed.entries.total, 0); assert.equal(disposed.work.total, 0);
});

for (const reason of ["descriptor-disabled", "descriptor-token"] as const)
  test(`diagnostics attribute ${reason} without dispatch or a second descriptor probe`, (t) => {
    const f = fixture(t, 64, undefined, true);
    let builds = 0;
    const createLayout = f.cache._createPipelineLayout;
    f.cache._createPipelineLayout = function (...args: unknown[]) {
      builds++;
      const result = createLayout.apply(this, args);
      if (reason === "descriptor-disabled") this.disabled = true;
      else this._parameter.token = {};
      return result;
    };
    assert.equal(f.helper.render(f.draw), false);
    const snapshot = f.helper.snapshot()!;
    assert.equal(builds, 1); assert.equal(f.requests.length, 0);
    assert.equal(snapshot.skips[reason], 1);
    assert.equal(snapshot.lastSkip!.reason, reason);
    assert.equal(snapshot.skips["descriptor-identity"], 0, "preserve the guard's first-match short circuit");
    assert.equal(snapshot.entries.total, 0);
  });

function nonFloatFixture(t: TestContext) {
  const f = fixture(t, 64, undefined, true), cpu = new NullEngine();
  t.after(() => cpu.dispose());
  (cpu as any)._getShaderProcessingContext = () => new WebGPUShaderProcessingContext(1, false);
  (cpu as any)._features._checkNonFloatVertexBuffersDontRecreatePipelineContext = true;
  const unsigned = new VertexBuffer(cpu, new Uint32Array(9), "position", false, false, 3,
    false, 0, 3, VertexBuffer.UNSIGNED_INT);
  const floating = new VertexBuffer(cpu, new Float32Array(9), "position", false, false, 3);
  t.after(() => { unsigned.dispose(); floating.dispose(); });
  f.active.getEngine = () => cpu;
  const context = f.active._pipelineContext;
  context.vertexBufferKindToType = { position: VertexBuffer.FLOAT };
  context.shaderProcessingContext.attributeNamesFromEffect = ["position"];
  context.shaderProcessingContext.attributeLocationsFromEffect = [0];
  let reprocesses = 0;
  // The real pinned checker owns type convergence. Shader/device IO is replaced
  // with the native keep-context outcome: the same context gets fresh stages.
  f.active._processShaderCodeAsync = (_processor: unknown, keepContext: boolean) => {
    assert.equal(keepContext, true); reprocesses++;
    context.stages = effect()._pipelineContext.stages;
    return Promise.resolve();
  };
  return { ...f, context, unsigned, floating, reprocesses: () => reprocesses };
}

test("pinned non-float keep-context reprocessing skips once then converges and proves the completed frame", async (t) => {
  const f = nonFloatFixture(t);
  f.cache.setBuffers({ position: f.unsigned }, null, null);
  assert.equal(f.helper.render(f.draw), false);
  assert.equal(f.requests.length, 0); assert.equal(f.reprocesses(), 1);
  const skipped = f.helper.snapshot()!;
  assert.equal(skipped.skips["descriptor-identity"], 1);
  assert.ok(skipped.lastSkip!.identityChanges.includes("stages"));
  assert.equal(skipped.lastSkip!.identityChanges.includes("context"), false);
  assert.equal(f.active._pipelineContext, f.context);
  assert.equal(f.helper.render(f.draw), false);
  assert.equal(f.requests.length, 1); assert.equal(f.reprocesses(), 1);
  f.requests[0].resolve(); await setImmediate();
  assert.equal(f.helper.render(f.draw), true);
  assert.equal(f.helper.isReady(), true);
  assert.equal(f.helper.snapshot()!.skips["descriptor-identity"], 1);
});

test("alternating incompatible vertex types can keep the guarded frame incomplete with no async work", (t) => {
  const f = nonFloatFixture(t);
  const alternating = () => {
    f.cache.setBuffers({ position: f.unsigned }, null, null); f.draw();
    f.cache.setBuffers({ position: f.floating }, null, null); f.draw();
  };
  for (let i = 0; i < 6; i++) assert.equal(f.helper.render(alternating), false);
  assert.equal(f.helper.isReady(), false);
  const snapshot = f.helper.snapshot()!;
  assert.equal(snapshot.skips["descriptor-identity"], 12);
  assert.equal(f.reprocesses(), 12); assert.equal(f.requests.length, 0);
  assert.deepEqual(snapshot.work, { total: 0, pending: 0, retiredPending: 0 });
  assert.deepEqual(snapshot.renders, { total: 6, complete: 0, incomplete: 6 });
  assert.equal(snapshot.lastRenderComplete, false);
});

test("diagnostic counters saturate and inert/disposed snapshots allocate no engine work", (t) => {
  const f = fixture(t, 64, undefined, true);
  f.helper.render(f.draw);
  const diagnostics = Reflect.get(f.helper, "diagnostics");
  diagnostics.skips["pending-entry"] = Number.MAX_SAFE_INTEGER;
  diagnostics.renders.total = Number.MAX_SAFE_INTEGER;
  f.helper.render(f.draw);
  assert.equal(f.helper.snapshot()!.skips["pending-entry"], Number.MAX_SAFE_INTEGER);
  assert.equal(f.helper.snapshot()!.renders.total, Number.MAX_SAFE_INTEGER);
  const inert = new WebGpuPipelinePreparation({ isWebGPU: false }, { diagnostics: true });
  assert.equal(inert.isReady(), true);
  assert.equal(inert.snapshot()!.inert, true);
  inert.dispose(); assert.equal(inert.isReady(), false);
  assert.equal(inert.snapshot()!.readiness.lastResult, false);
});
