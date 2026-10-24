/** CPU integration of pinned Babylon NCM algorithms. Only terminal GPU IO and
 * compiled Effect resource inputs are fixtures; no device, browser or FPS. */
import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { Observable } from "@babylonjs/core/Misc/observable";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { AlphaState } from "@babylonjs/core/States/alphaCullingState";
import { StencilState } from "@babylonjs/core/States/stencilState";
import { WebGPUStencilStateComposer } from "@babylonjs/core/Engines/WebGPU/webgpuStencilStateComposer";
import { WebGPUCacheRenderPipelineTree } from "@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipelineTree";
import { WebGPUCacheRenderPipeline } from "@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipeline";
import { WebGPUClearQuad } from "@babylonjs/core/Engines/WebGPU/webgpuClearQuad";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import { WebGPUDrawContext } from "@babylonjs/core/Engines/WebGPU/webgpuDrawContext";
import { WebGPUMaterialContext } from "@babylonjs/core/Engines/WebGPU/webgpuMaterialContext";
import { WebGPUCacheBindGroups } from "@babylonjs/core/Engines/WebGPU/webgpuCacheBindGroups";
import { WebGPUBufferManager } from "@babylonjs/core/Engines/WebGPU/webgpuBufferManager";
import { WebGPUBundleList } from "@babylonjs/core/Engines/WebGPU/webgpuBundleList";
import { WebGPUSnapshotRendering } from "@babylonjs/core/Engines/WebGPU/webgpuSnapshotRendering";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { WebGpuPipelinePreparation } from "../client/webgpu-pipeline-preparation";

let id = 2000000;
function fixture(t: TestContext, maxEntries = 64) {
  const requests: { descriptor: any; pipeline: any; resolve(value?: any): void; reject(error: unknown): void }[] = [];
  const sync: any[] = [], encoders: any[] = [], executed: any[] = [], writes: any[] = [], bindings: any[] = [];
  function encoder(descriptor: any) {
    const value: any = { descriptor, commands: [], finished: false,
      setPipeline(pipeline: any) {
        assert.ok(pipeline?.descriptor && typeof pipeline.then !== "function", "encoder receives an actual completed pipeline");
        value.commands.push(["pipeline", pipeline]);
      },
      setBindGroup(...args: any[]) { bindings.push(args); value.commands.push(["bind", ...args]); },
      setVertexBuffer(...args: any[]) { value.commands.push(["vertex", ...args]); },
      setIndexBuffer(...args: any[]) { value.commands.push(["index", ...args]); },
      draw(...args: any[]) { value.commands.push(["draw", ...args]); },
      drawIndexed(...args: any[]) { value.commands.push(["drawIndexed", ...args]); },
      drawIndirect(...args: any[]) { value.commands.push(["drawIndirect", ...args]); },
      drawIndexedIndirect(...args: any[]) { value.commands.push(["drawIndexedIndirect", ...args]); },
      finish() { assert.equal(value.finished, false); value.finished = true; return { id: id++, descriptor, commands: value.commands }; },
    };
    encoders.push(value); return value;
  }
  const device: any = {
    limits: { maxVertexAttributes: 16, maxVertexBufferArrayStride: 2048 },
    queue: { writeBuffer(buffer: any, offset: number, source: ArrayBuffer, start: number, length: number) {
      writes.push({ buffer, offset, data: new Uint8Array(source, start, length).slice() });
    } },
    createBuffer: (descriptor: any) => ({ id: id++, ...descriptor, destroy() {} }),
    createBindGroupLayout: (descriptor: any) => ({ id: id++, descriptor }),
    createPipelineLayout: (descriptor: any) => ({ id: id++, descriptor }),
    // GPU resources are opaque identities, not structured-cloneable values.
    createBindGroup: (descriptor: any) => ({ id: id++, descriptor: { ...descriptor,
      entries: descriptor.entries.map((entry: any) => ({ ...entry,
        resource: entry.resource?.buffer ? { ...entry.resource } : entry.resource })) } }),
    createRenderBundleEncoder: encoder,
    createRenderPipeline(descriptor: any) { const pipeline = { id: id++, descriptor }; sync.push(pipeline); return pipeline; },
    createRenderPipelineAsync(descriptor: any) {
      let resolve!: (value: any) => void, reject!: (error: unknown) => void;
      const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no; }), pipeline = { id: id++, descriptor };
      requests.push({ descriptor, pipeline, resolve: (value = pipeline) => resolve(value), reject });
      return promise;
    },
  };
  const engine: any = Object.create(WebGPUEngine.prototype);
  const cache: any = new WebGPUCacheRenderPipelineTree(device, null as any);
  const clearCache: any = new WebGPUCacheRenderPipelineTree(device, null as any);
  const bufferManager = new WebGPUBufferManager(engine, device);
  const bundleList = new WebGPUBundleList(device);
  const drawContext = new WebGPUDrawContext(bufferManager, undefined as any), materialContext = new WebGPUMaterialContext();
  const composer = new WebGPUStencilStateComposer(cache); composer.stencilGlobal = new StencilState();
  Object.assign(engine, { _device: device, _cacheRenderPipeline: cache, _compatibilityMode: false,
    _snapshotRendering: new WebGPUSnapshotRendering(engine, 0, bundleList),
    _currentRenderTarget: null, _currentRenderPass: null, _currentVertexBuffers: {}, _currentOverrideVertexBuffers: null,
    _currentIndexBuffer: null, _currentDrawContext: drawContext, _currentMaterialContext: materialContext,
    _alphaState: new AlphaState(false), _stencilStateComposer: composer, _features: {}, _bufferManager: bufferManager,
    _caps: { textureFloatLinearFiltering: false }, _bundleList: bundleList,
    _counters: { numBundleReuseNonCompatMode: 0, numBundleCreationNonCompatMode: 0 },
    _colorFormat: "bgra8unorm", _depthTextureFormat: "depth24plus-stencil8", _clearStencilValue: 0, _clearDepthValue: 1,
    _timestampQuery: { endPass() {} }, _timestampIndex: 0,
    _viewportCached: { x: 0, y: 0, z: 100, w: 100 }, _viewportsCurrent: { x: 0, y: 0, w: 100, h: 100 },
    _scissorCached: { x: 0, y: 0, z: 0, w: 0 }, _scissorsCurrent: { x: 0, y: 0, w: 0, h: 0 },
    onDisposeObservable: new Observable(),
  });
  Object.defineProperty(engine, "isWebGPU", { value: true, configurable: true });
  Object.defineProperty(engine, "currentSampleCount", { value: 1, writable: true });
  const uniform = () => bufferManager.createBuffer(64, 0);
  engine._ubDontInvertY = uniform(); engine._ubInvertY = uniform();
  const makeEffect = (clear = false) => {
    const processing: any = new WebGPUShaderProcessingContext(1, false);
    Object.assign(processing, { attributeNamesFromEffect: [], attributeLocationsFromEffect: [],
      bufferNames: ["Internals", "fixtureUniform"], bindGroupLayoutEntries: [[], [], []], bindGroupEntries: [[], [], []],
      bindGroupLayoutEntryInfo: [[], [], []] });
    if (!clear) {
      processing.bindGroupLayoutEntries[0] = [{ binding: 0, visibility: 1, buffer: { type: "uniform" } }];
      processing.bindGroupEntries[0] = [{ binding: 0, resource: { buffer: undefined, offset: 0, size: 64 } }];
      processing.bindGroupLayoutEntryInfo[0] = [{ name: "fixtureUniform" }];
    }
    const effect: any = { uniqueId: id++, isDisposed: false, getEngine: () => engine,
      _pipelineContext: { stages: { vertexStage: { module: { id: id++ }, entryPoint: "main" },
        fragmentStage: { module: { id: id++ }, entryPoint: "main" } },
        shaderProcessingContext: processing, bindGroupLayouts: [], uniformBuffer: null } };
    if (clear) {
      const buffer = uniform();
      effect._pipelineContext.uniformBuffer = { update() {}, getBuffer: () => buffer };
      effect.setDirectColor4 = effect.setFloat = () => {};
    }
    return effect;
  };
  engine._currentEffect = makeEffect(); drawContext.setBuffer("fixtureUniform", uniform());
  engine._cacheBindGroups = new WebGPUCacheBindGroups(device, null as any, engine);
  const clear: any = Object.create(WebGPUClearQuad.prototype);
  Object.assign(clear, { _device: device, _engine: engine, _cacheRenderPipeline: clearCache,
    _effect: makeEffect(true), _bindGroups: {}, _bundleCache: {}, _keyTemp: [], _depthTextureFormat: engine._depthTextureFormat });
  engine._clearQuad = clear;
  const controller = new AbortController(); let retries = 0;
  const renderer: any = Object.create(ObjectRenderer.prototype);
  Object.assign(renderer, { _engine: { snapshotRendering: false }, _refreshRate: 0, _currentRefreshId: -1 });
  const helper = new WebGpuPipelinePreparation(engine, { signal: controller.signal, maxEntries,
    retryIncompleteFrame: () => { retries++; renderer.resetRefreshCounter(); } });
  t.after(() => { helper.dispose(); drawContext.dispose(); bufferManager.destroyDeferredBuffers(); });
  const draw = (instances = 1, type = 0) => engine._draw(type, 0, 0, 3, instances);
  const clearDraw = () => engine._clearFullQuad({ r: 0.25, g: 0.5, b: 0.75, a: 1 }, true, true);
  const pass = () => ({ executeBundles(bundles: any[]) {
    for (const bundle of bundles) { assert.ok(bundle && typeof bundle.then !== "function"); executed.push(bundle); }
  }, setStencilReference() {}, setViewport() {}, setScissorRect() {}, setBlendConstant() {}, end() {} });
  const frame = (callback: () => void = draw) => {
    engine._currentRenderPass = pass();
    return helper.render(() => { callback(); engine._endCurrentRenderPass(); });
  };
  return { engine, device, cache, clearCache, clear, drawContext, materialContext, makeEffect, uniform, helper, controller,
    frame, draw, clearDraw, requests, sync, encoders, executed, writes, bindings, renderer, retries: () => retries };
}

test("NCM actual draw miss → Promise completion → native insertion → persistent fastBundle replay across real pass reset", async (t) => {
  const f = fixture(t), misses = WebGPUCacheRenderPipeline.NumCacheMiss;
  assert.equal(f.frame(), false); const token = f.cache._parameter.token;
  assert.equal(f.requests.length, 1); assert.equal(f.sync.length, 0); assert.equal(f.encoders.length, 0);
  assert.equal(f.drawContext.fastBundle, undefined); assert.equal(f.executed.length, 0);
  assert.equal(f.frame(), false); assert.equal(f.requests.length, 1);
  f.requests[0].resolve(); await setImmediate();
  assert.equal(token.pipeline, undefined); assert.equal(WebGPUCacheRenderPipeline.NumCacheMiss, misses);
  assert.equal(f.frame(), true); assert.equal(token.pipeline, f.requests[0].pipeline);
  assert.equal(WebGPUCacheRenderPipeline.NumCacheMiss, misses + 1);
  const bundle = f.drawContext.fastBundle; assert.ok(bundle); assert.equal(f.executed.at(-1), bundle);
  assert.equal(f.engine._bundleList.isEmpty, true); assert.equal(f.helper.isReady(), true);
  assert.equal(f.frame(), true); assert.equal(f.encoders.length, 1); assert.equal(f.executed.at(-1), bundle);
  assert.equal(f.engine._counters.numBundleReuseNonCompatMode, 1); assert.equal(f.requests.length, 1);
});
test("NCM actual null-pass ClearQuad keeps pending encoders/cache unpublished and native bundle replay/RTT inversion intact", async (t) => {
  const f = fixture(t);
  assert.equal(f.frame(f.clearDraw), false); const token = f.clearCache._parameter.token;
  assert.equal(f.requests.length, 1); assert.equal(f.sync.length, 0); assert.equal(f.executed.length, 0);
  assert.equal(f.encoders.length, 1); assert.equal(f.encoders[0].finished, false);
  assert.deepEqual(Object.keys(f.clear._bundleCache), []); assert.deepEqual(Object.keys(f.clear._bindGroups), []);
  f.requests[0].resolve(); await setImmediate(); assert.equal(token.pipeline, undefined);
  assert.equal(f.frame(f.clearDraw), true); assert.equal(token.pipeline, f.requests[0].pipeline);
  assert.equal(Object.keys(f.clear._bundleCache).length, 1); assert.equal(f.executed.length, 1);
  const bundle = f.executed[0]; assert.equal(f.frame(f.clearDraw), true); assert.equal(f.executed.at(-1), bundle);
  f.engine._currentRenderTarget = {};
  assert.equal(f.frame(f.clearDraw), true); assert.equal(f.requests.length, 1, "RTT inversion uses another bundle/bind group, same valid pipeline");
  assert.equal(Object.keys(f.clear._bundleCache).length, 2); assert.equal(Object.keys(f.clear._bindGroups).length, 2);
});
test("NCM actual dirty buffer/material rebinding invalidates fastBundle without recompiling an identical native descriptor", async (t) => {
  const f = fixture(t); f.frame(); f.requests[0].resolve(); await setImmediate(); f.frame();
  const first = f.drawContext.fastBundle;
  const uniform = f.uniform(); f.drawContext.setBuffer("fixtureUniform", uniform);
  assert.equal(f.frame(), true); const rebound = f.drawContext.fastBundle;
  assert.notEqual(rebound, first); assert.equal(f.requests.length, 1);
  assert.equal((f.drawContext.bindGroups![0] as any).descriptor.entries[0].resource.buffer, uniform.underlyingResource);
  f.materialContext.setTexture("unusedTexture", { uniqueId: id++, type: 0, format: 5 } as any);
  assert.equal(f.frame(), true); assert.notEqual(f.drawContext.fastBundle, rebound); assert.equal(f.requests.length, 1);
  assert.equal(f.engine._counters.numBundleCreationNonCompatMode, 3);
  assert.equal(f.bindings.length, 9, "three native bind groups per recreated bundle");
});
for (const variant of ["regular", "thin"] as const) test(`NCM ${variant} instances retain actual vertex stepMode, override binding and indirect count updates`, async (t) => {
  const f = fixture(t), effect = f.engine._currentEffect, processing = effect._pipelineContext.shaderProcessingContext;
  const position = new VertexBuffer(f.engine, new Float32Array(9), "position", false, false, 3);
  const instances = new VertexBuffer(f.engine, new Float32Array(32), "world0", false, false, 4, true, 0, 4);
  t.after(() => { position.dispose(); instances.dispose(); });
  processing.attributeNamesFromEffect = ["position", "world0"]; processing.attributeLocationsFromEffect = [0, 1];
  f.engine._currentVertexBuffers = variant === "thin" ? { position, world0: instances } : { position };
  f.engine._currentOverrideVertexBuffers = variant === "regular" ? { world0: instances } : null;
  f.cache.setBuffers(f.engine._currentVertexBuffers, null, f.engine._currentOverrideVertexBuffers);
  f.drawContext.useInstancing = true;
  assert.equal(f.frame(() => f.draw(3)), false); const descriptor = f.requests[0].descriptor;
  assert.deepEqual(descriptor.vertex.buffers.map((b: any) => b.stepMode), ["vertex", "instance"]);
  f.requests[0].resolve(); await setImmediate(); assert.equal(f.frame(() => f.draw(3)), true);
  const bundle = f.drawContext.fastBundle; assert.ok(bundle.commands.some((item: any[]) => item[0] === "drawIndexedIndirect"));
  assert.equal(bundle.commands.filter((item: any[]) => item[0] === "vertex").length, 2);
  assert.equal(f.frame(() => f.draw(5)), true); assert.equal(f.drawContext.fastBundle, bundle);
  const written = f.writes.at(-1)!; assert.deepEqual(Array.from(new Uint32Array(written.data.buffer)), [3, 5, 0, 0, 0]);
  assert.equal(f.requests.length, 1);
});
test("NCM sample/color/MRT changes on a dirty draw and null-clear stay in separate native token/descriptor/bundle variants", async (t) => {
  const f = fixture(t); f.frame(); f.requests[0].resolve(); await setImmediate(); f.frame();
  f.engine.currentSampleCount = 4; f.engine._colorFormat = "rgba16float"; f.cache.setColorFormat("rgba16float");
  f.cache.setMRT([{ format: 5, type: 2 }, { format: 5, type: 0 }], 2); f.cache.setMRTAttachments([1, 2]);
  f.drawContext.setBuffer("fixtureUniform", f.uniform());
  assert.equal(f.frame(), false); const descriptor = f.requests[1].descriptor;
  assert.equal(descriptor.multisample.count, 4); assert.equal(descriptor.fragment.targets.length, 2);
  assert.equal(f.drawContext.fastBundle, undefined); f.requests[1].resolve(); await setImmediate(); assert.equal(f.frame(), true);
  // TS cannot infer mutation of a prior asserted-undefined GPU handle through
  // the frame callback. The terminal IO fixture adds descriptor for inspection.
  const bundle = (f.drawContext as any).fastBundle;
  assert.ok(bundle); assert.equal(bundle.descriptor.sampleCount, 4);
  assert.equal(f.frame(f.clearDraw), false); const clear = f.requests[2].descriptor;
  assert.equal(clear.multisample.count, 4); assert.equal(clear.fragment.targets.length, 2);
  f.requests[2].resolve(); await setImmediate(); assert.equal(f.frame(f.clearDraw), true);
  assert.deepEqual(f.executed.at(-1).descriptor.colorFormats, f.cache.colorFormats);
});
test("NCM incomplete once-only RTT uses actual refresh-counter retry, never accepts an unconsumed completion", async (t) => {
  const f = fixture(t);
  const render = () => { if (f.renderer.shouldRender()) f.clearDraw(); f.draw(); };
  assert.equal(f.frame(render), false); assert.equal(f.requests.length, 2); assert.equal(f.retries(), 1);
  f.requests.forEach(request => request.resolve()); await setImmediate();
  assert.equal(f.helper.isReady(), false); assert.equal(f.frame(render), true);
  assert.equal(f.executed.length, 2); assert.equal(f.helper.isReady(), true); assert.ok(f.retries() >= 2);
});
test("NCM bounds pending and completed entries at64 while preserving native misses and no global cache reset", async (t) => {
  const f = fixture(t), effects = Array.from({ length: 65 }, () => f.makeEffect());
  const uniform = f.uniform();
  const render = () => { for (const effect of effects) {
    f.engine._currentEffect = effect; f.drawContext.reset(); f.drawContext.setBuffer("fixtureUniform", uniform); f.draw();
  } };
  assert.equal(f.frame(render), false); assert.equal(f.requests.length, 64);
  f.requests.forEach(request => request.resolve()); await setImmediate();
  assert.equal(Reflect.get(f.helper, "work").size, 64); assert.equal(f.helper.isReady(), false);
  assert.equal(f.frame(render), false); assert.equal(f.requests.length, 65);
  f.requests[64].resolve(); await setImmediate(); assert.equal(f.frame(render), true); assert.equal(f.helper.isReady(), true);
  assert.equal(f.sync.length, 0);
});
test("NCM rejection, abort/dispose and mode/device/context replacement never publish a late result or Promise", async (t) => {
  for (const reason of ["reject", "abort", "dispose", "mode", "device", "context"] as const) {
    const f = fixture(t); f.frame(); const token = f.cache._parameter.token, original = new Error("original pipeline failure");
    if (reason === "reject") { f.requests[0].reject(original); await setImmediate(); assert.throws(() => f.helper.isReady(), error => error === original); }
    else {
      if (reason === "abort") f.controller.abort();
      if (reason === "dispose") f.helper.dispose();
      if (reason === "mode") f.engine.compatibilityMode = true;
      if (reason === "device") f.engine._device = {};
      if (reason === "context") f.engine._currentEffect._pipelineContext = f.makeEffect()._pipelineContext;
      f.requests[0].resolve(); await setImmediate();
      if (reason === "mode" || reason === "device") assert.throws(() => f.helper.isReady(), /ownership/);
      else assert.equal(f.helper.isReady(), false);
    }
    assert.equal(token.pipeline, undefined); assert.equal(f.executed.length, 0);
  }
});
test("NCM pending null-clear rejection/abort never publishes or finishes a partial bundle", async (t) => {
  for (const reason of ["reject", "abort"] as const) {
    const f = fixture(t), failure = new Error("original clear pipeline failure");
    assert.equal(f.frame(f.clearDraw), false); const token = f.clearCache._parameter.token;
    if (reason === "abort") f.controller.abort();
    f.requests[0].reject(failure); await setImmediate();
    if (reason === "reject") assert.throws(() => f.helper.isReady(), error => error === failure);
    else assert.equal(f.helper.isReady(), false);
    assert.equal(token.pipeline, undefined); assert.equal(f.executed.length, 0);
    assert.equal(f.encoders.every(value => !value.finished), true);
    assert.deepEqual(Object.keys(f.clear._bundleCache), []);
  }
});
