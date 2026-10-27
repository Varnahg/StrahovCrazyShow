import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUDrawContext } from "@babylonjs/core/Engines/WebGPU/webgpuDrawContext";
import { WebGPUMaterialContext } from "@babylonjs/core/Engines/WebGPU/webgpuMaterialContext";
import { WebGPUCacheRenderPipelineTree } from "@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipelineTree";
import { WebGPUCacheBindGroups } from "@babylonjs/core/Engines/WebGPU/webgpuCacheBindGroups";
import { WebGPUBundleList } from "@babylonjs/core/Engines/WebGPU/webgpuBundleList";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { DrawWrapper } from "@babylonjs/core/Materials/drawWrapper";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.pure";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { invalidateTreeDrawRange } from "../client/tree-draw-cache";

let nextEffect = 8_000_000;
type Command = { count: number; instances: number; start: number };
type Buffer = { bytes: Uint8Array; released?: boolean };
type Bundle = { commands: (() => Command)[] };

/** Actual pinned Mesh→WebGPU draw/cache/bundle/context classes. Only device,
 * command encoder and GPU memory IO are replaced; no metadata-only draw proof. */
function fixture(t: TestContext, kind: "tree" | "litter" = "tree") {
  const engine = new NullEngine() as any, scene = new Scene(engine);
  const executed: Command[] = [];
  let pipelineCreations = 0, effectCreations = 0, bufferWrites = 0, bundleCreations = 0;
  const manager = {
    createRawBuffer(size: number) { return { bytes: new Uint8Array(size) }; },
    releaseBuffer(buffer: Buffer) { buffer.released = true; },
    setRawData(buffer: Buffer, offset: number, data: ArrayBufferView, from: number, length: number) {
      bufferWrites++;
      buffer.bytes.set(new Uint8Array(data.buffer, data.byteOffset + from, length), offset);
    },
  };
  const encoder = () => {
    const commands: Bundle["commands"] = [];
    return {
      setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
      drawIndexed(count: number, instances: number, start: number) { commands.push(() => ({ count, instances, start })); },
      drawIndexedIndirect(buffer: Buffer) { commands.push(() => {
        const data = new Uint32Array(buffer.bytes.buffer);
        return { count: data[0], instances: data[1], start: data[2] };
      }); },
      finish(): Bundle { return { commands }; },
    };
  };
  const device = {
    limits: { maxVertexAttributes: 16, maxVertexBufferArrayStride: 2048 },
    createBindGroupLayout: (value: unknown) => value,
    createPipelineLayout: (value: unknown) => value,
    createBindGroup: (value: unknown) => value,
    createRenderPipeline(value: unknown) { pipelineCreations++; return value; },
    createRenderBundleEncoder() { bundleCreations++; return encoder(); },
  };
  const pass = {
    setPipeline() {}, setBindGroup() {}, setVertexBuffer() {}, setIndexBuffer() {},
    drawIndexed(count: number, instances: number, start: number) { executed.push({ count, instances, start }); },
    executeBundles(bundles: Bundle[]) { for (const bundle of bundles) for (const command of bundle.commands) executed.push(command()); },
  };
  const cache = new WebGPUCacheRenderPipelineTree(device as any, null as any);
  const bundles = new WebGPUBundleList(device as any);
  Object.assign(engine, {
    _isWebGPU: true, _compatibilityMode: false, _device: device, _bufferManager: manager,
    _cacheRenderPipeline: cache, _bundleList: bundles,
    _counters: { numBundleCreationNonCompatMode: 0, numBundleReuseNonCompatMode: 0 },
    _snapshotRendering: { enabled: false, play: false, record: false },
    _currentRenderTarget: null, _currentVertexBuffers: {}, _currentOverrideVertexBuffers: null,
    _currentIndexBuffer: { underlyingResource: {}, is32Bits: false },
    _getCurrentRenderPass: () => pass,
    createDrawContext: () => new WebGPUDrawContext(manager as any, null as any),
    createMaterialContext: () => new WebGPUMaterialContext(),
    applyStates() {}, bindUniformBufferBase() {}, _applyRenderPassChanges() {}, _reportDrawCall() {},
    _draw: (WebGPUEngine.prototype as any)._draw, drawElementsType: WebGPUEngine.prototype.drawElementsType,
  });
  engine._cacheBindGroups = new WebGPUCacheBindGroups(device as any, {} as any, engine);
  Object.defineProperty(engine, "currentSampleCount", { configurable: true, value: 1 });
  const makeEffect = () => {
    const effect: any = {
      uniqueId: nextEffect++, isDisposed: false, _refCount: 1, defines: "", shaderLanguage: 1,
      name: "fake GPU module owner", vertexSourceCodeBeforeMigration: "@vertex fn main() {}", fragmentSourceCodeBeforeMigration: "@fragment fn main() {}",
      getEngine: () => engine, isReady: () => true,
      getUniformNames: () => [], getAttributesNames: () => [], getUniformBuffersNames: () => [], getSamplers: () => [], getIndexParameters: () => undefined,
      dispose() { effect._refCount--; if (effect._refCount <= 0) effect.isDisposed = true; },
      _pipelineContext: {
        stages: { vertexStage: { module: {}, entryPoint: "main" }, fragmentStage: { module: {}, entryPoint: "main" } },
        shaderProcessingContext: { attributeNamesFromEffect: [], attributeLocationsFromEffect: [],
          bindGroupLayoutEntries: [], bindGroupEntries: [], bindGroupLayoutEntryInfo: [],
          bufferNames: [], samplerNames: [], textureNames: [], availableTextures: {}, availableSamplers: {} },
        bindGroupLayouts: [], uniformBuffer: null,
      },
    };
    return effect;
  };
  engine.createEffect = () => { effectCreations++; return makeEffect(); };
  const material = new PBRMaterial("shared " + kind, scene);
  const texture = RawTexture.CreateRGBATexture(new Uint8Array([40, 120, 30, 255]), 1, 1, scene);
  material.albedoTexture = texture;
  const mesh = MeshBuilder.CreatePlane(kind, { sideOrientation: kind === "litter" ? Mesh.DOUBLESIDE : Mesh.FRONTSIDE }, scene);
  mesh.material = material;
  const sub = mesh.subMeshes[0], fullCount = sub.indexCount;
  sub.indexCount = fullCount / 2;
  const main = sub._getDrawWrapper(1, true)!;
  main.setEffect(makeEffect() as any); main.materialContext = new WebGPUMaterialContext();
  let shadow: ShadowDepthWrapper | undefined;
  const addShadow = () => {
    shadow ??= new ShadowDepthWrapper(material, scene, { doNotInjectCode: true });
    material.shadowDepthWrapper = shadow;
    engine.currentRenderPassId = 1;
    material.onEffectCreatedObservable.notifyObservers({ effect: main.effect!, subMesh: sub });
    const generator = {} as any;
    assert.equal(shadow.isReadyForSubMesh(sub, [], generator, false, 2), true);
    const a = shadow.getEffect(sub, generator, 2)!;
    const b = shadow.getEffect(sub, generator, 3)!;
    for (const wrapper of [a, b]) wrapper.materialContext = new WebGPUMaterialContext();
    return { generator, a, b, owner: shadow };
  };
  const draw = (wrapper = main, instances = 1) => {
    executed.length = 0; bundles.reset();
    engine._currentDrawContext = wrapper.drawContext;
    engine._currentMaterialContext = wrapper.materialContext;
    engine._currentEffect = wrapper.effect;
    mesh._draw(sub, 0, instances);
    bundles.run(pass as any);
    assert.equal(executed.length, 1);
    return { ...executed[0] };
  };
  t.after(() => { shadow?.dispose(); scene.dispose(); engine._isWebGPU = false; engine.dispose(); });
  return { engine, scene, mesh, sub, material, texture, main, fullCount, draw, addShadow, manager,
    counts: () => ({ pipelineCreations, effectCreations, bufferWrites, bundleCreations }) };
}

function changeRange(f: ReturnType<typeof fixture>, start: number, count: number) {
  invalidateTreeDrawRange(f.mesh, f.sub, start, count);
  f.sub.indexStart = start; f.sub.indexCount = count;
}

for (const kind of ["tree", "litter"] as const)
  test(`NCM ${kind} grows an initially partial prefix in actual executed indexed commands`, t => {
    const f = fixture(t, kind);
    assert.equal(f.draw().count, f.fullCount / 2);
    assert.equal(f.draw().count, f.fullCount / 2);
    changeRange(f, 0, f.fullCount);
    assert.equal(f.draw().count, f.fullCount);
  });

test("NCM shadow aliases grow the same partial prefix in their actual bundles", t => {
  const f = fixture(t), shadow = f.addShadow();
  for (const wrapper of [shadow.a, shadow.b]) assert.equal(f.draw(wrapper).count, f.fullCount / 2);
  changeRange(f, 0, f.fullCount);
  for (const wrapper of [shadow.a, shadow.b]) assert.equal(f.draw(wrapper).count, f.fullCount);
});

test("native indirect draw refreshes its index count even when instance count is unchanged", t => {
  const f = fixture(t);
  (f.main.drawContext as WebGPUDrawContext).enableIndirectDraw = true;
  assert.equal(f.draw().count, f.fullCount / 2);
  const buffer = (f.main.drawContext as WebGPUDrawContext).indirectDrawBuffer;
  const before = f.counts();
  changeRange(f, 0, f.fullCount);
  assert.equal(f.counts().bufferWrites, before.bufferWrites, "helper never submits GPU writes");
  assert.equal((f.main.drawContext as WebGPUDrawContext).indirectDrawBuffer, buffer);
  assert.equal(f.draw().count, f.fullCount, "rebuilding only the bundle must not leave stale indirect data");
});

function withProperty(owner: object, key: string, property: PropertyDescriptor, run: () => void) {
  const previous = Object.getOwnPropertyDescriptor(owner, key);
  Object.defineProperty(owner, key, { configurable: true, ...property });
  try { run(); }
  finally { if (previous) Object.defineProperty(owner, key, previous); else Reflect.deleteProperty(owner, key); }
}

test("range invalidation retains effects, pipeline/bind groups, material texture and owned UBO slots", t => {
  const f = fixture(t), shadow = f.addShadow(), wrappers = [f.main, shadow.a, shadow.b];
  for (const wrapper of wrappers) f.draw(wrapper);
  const refs = wrappers.map(wrapper => ({ effect: wrapper.effect, refCount: (wrapper.effect as any)._refCount,
    context: wrapper.drawContext as WebGPUDrawContext, bindings: (wrapper.drawContext as WebGPUDrawContext).bindGroups,
    buffers: (wrapper.drawContext as WebGPUDrawContext).buffers, materialContext: wrapper.materialContext }));
  let releases = 0;
  const slots = [{ _releaseOwnerSlot() { releases++; } }];
  (refs[0].context as any)._uniformBuffersWithOwnedSlot = slots;
  const ubo = f.material._uniformBuffer, before = f.counts();
  changeRange(f, 0, f.fullCount);
  assert.deepEqual(f.counts(), before, "invalidation itself creates no GPU resource or program");
  assert.equal(releases, 0); assert.equal((refs[0].context as any)._uniformBuffersWithOwnedSlot, slots);
  assert.equal(f.material._uniformBuffer, ubo); assert.equal(f.material.albedoTexture, f.texture);
  for (const [index, wrapper] of wrappers.entries()) {
    const ref = refs[index];
    assert.equal(wrapper.effect, ref.effect); assert.equal((wrapper.effect as any)._refCount, ref.refCount);
    assert.equal(wrapper.drawContext, ref.context); assert.equal(wrapper.materialContext, ref.materialContext);
    assert.equal(ref.context.buffers, ref.buffers); assert.equal(ref.context.bindGroups, ref.bindings);
    assert.equal(f.draw(wrapper).count, f.fullCount);
  }
  assert.equal(f.counts().pipelineCreations, before.pipelineCreations);
  assert.equal(f.counts().effectCreations, before.effectCreations);
  assert.equal(f.counts().bufferWrites, before.bufferWrites);
});

test("only the target submesh contexts change even with shared geometry and material", t => {
  const f = fixture(t), other = f.mesh.clone("other owner", null, true)!;
  assert.equal(other.geometry, f.mesh.geometry); assert.equal(other.material, f.material);
  const wrapper = other.subMeshes[0]._getDrawWrapper(1, true)!;
  wrapper.setEffect(f.main.effect); (f.main.effect as any)._refCount++;
  const sentinel = {} as NonNullable<WebGPUDrawContext["fastBundle"]>;
  (wrapper.drawContext as WebGPUDrawContext).fastBundle = sentinel;
  f.draw(); changeRange(f, 0, f.fullCount);
  assert.equal((wrapper.drawContext as WebGPUDrawContext).fastBundle, sentinel);
  assert.equal(other.subMeshes[0].indexCount, f.fullCount / 2);
  assert.equal(wrapper.effect, f.main.effect);
});

test("unchanged ranges allocate no wrappers; sparse pass aliases are observed without getEffect", t => {
  const f = fixture(t), shadow = f.addShadow();
  const sparse = f.sub._getDrawWrapper(1_000_000, true)!; sparse.setEffect(f.main.effect);
  const mainKeys = Object.keys((f.sub as any)._drawWrappers);
  const table = (shadow.owner as any)._subMeshToDepthWrapper.mm.get(f.sub);
  const aliases = Object.keys(table.get(shadow.generator).drawWrapper);
  const wrapperCount = table.size;
  withProperty(shadow.owner, "getEffect", { value: () => assert.fail("observation created a shadow alias") }, () => {
    withProperty(f.sub, "_getDrawWrapper", { value: () => assert.fail("observation created a submesh wrapper") }, () => {
      for (let i = 0; i < 100; i++) changeRange(f, 0, i % 2 ? f.fullCount : f.fullCount / 2);
      const cached = {} as NonNullable<WebGPUDrawContext["fastBundle"]>;
      (f.main.drawContext as WebGPUDrawContext).fastBundle = cached;
      changeRange(f, 0, f.sub.indexCount);
      assert.equal((f.main.drawContext as WebGPUDrawContext).fastBundle, cached);
    });
  });
  assert.deepEqual(Object.keys((f.sub as any)._drawWrappers), mainKeys);
  assert.equal(table.size, wrapperCount);
  assert.deepEqual(Object.keys(table.get(shadow.generator).drawWrapper), aliases);
});

test("partial, empty/hidden, full and shifted ranges use the exact next command for direct and indirect contexts", t => {
  for (const indirect of [false, true]) {
    const f = fixture(t);
    (f.main.drawContext as WebGPUDrawContext).enableIndirectDraw = indirect;
    assert.equal(f.draw().count, 3);
    changeRange(f, 0, 0);
    assert.deepEqual(f.draw(), { count: 0, instances: 1, start: 0 });
    f.mesh.setEnabled(false);
    changeRange(f, 0, 6);
    assert.equal(f.mesh.isEnabled(), false, "caller alone owns hidden/visible state");
    f.mesh.setEnabled(true);
    assert.deepEqual(f.draw(), { count: 6, instances: 1, start: 0 });
    changeRange(f, 3, 3);
    assert.deepEqual(f.draw(), { count: 3, instances: 1, start: 3 });
    const before = f.counts();
    changeRange(f, 3, 3); f.draw();
    assert.deepEqual(f.counts(), before, "unchanged prefix keeps the warm bundle and indirect data");
  }
});

test("WebGL and compatibility mode never inspect private tables or invalidate commands", t => {
  for (const native of [false, true]) {
    const f = fixture(t); f.draw();
    const bundle = (f.main.drawContext as WebGPUDrawContext).fastBundle;
    f.engine._isWebGPU = native; f.engine._compatibilityMode = true;
    withProperty(f.sub, "_drawWrappers", { get: () => assert.fail("CM/WebGL private inspection") }, () => {
      changeRange(f, 0, f.fullCount);
    });
    assert.equal((f.main.drawContext as WebGPUDrawContext).fastBundle, bundle);
    assert.equal(f.draw().count, f.fullCount, "native CM directly submits the new range");
  }
});

test("malformed later shadow alias fails atomic preflight before changing any earlier context", t => {
  const f = fixture(t), shadow = f.addShadow();
  const mainContext = f.main.drawContext as WebGPUDrawContext, alias = shadow.b.drawContext as WebGPUDrawContext;
  mainContext.enableIndirectDraw = true;
  for (const wrapper of [f.main, shadow.a, shadow.b]) f.draw(wrapper);
  const bundle = mainContext.fastBundle, count = (mainContext as any)._currentInstanceCount;
  withProperty(alias, "fastBundle", { value: alias.fastBundle, writable: false }, () => {
    assert.throws(() => changeRange(f, 0, f.fullCount), /Unsupported pinned/);
    assert.equal(mainContext.fastBundle, bundle);
    assert.equal((mainContext as any)._currentInstanceCount, count);
    assert.equal(f.sub.indexCount, f.fullCount / 2);
  });
});

test("foreign context, accessor table, indirect shape and unknown override are rejected without partial invalidation", t => {
  const f = fixture(t), shadow = f.addShadow();
  f.draw(); f.draw(shadow.a); f.draw(shadow.b);
  const context = f.main.drawContext as WebGPUDrawContext, before = context.fastBundle;
  const reject = () => {
    assert.throws(() => changeRange(f, 0, f.fullCount), /Unsupported pinned/);
    assert.equal(context.fastBundle, before); assert.equal(f.sub.indexCount, f.fullCount / 2);
  };
  withProperty(shadow.b.drawContext!, "_bufferManager", { value: {} }, reject);
  withProperty(f.engine, "_bufferManager", { value: undefined }, reject);
  withProperty(shadow.owner, "_subMeshToDepthWrapper", { get: () => assert.fail("unsafe accessor invoked") }, reject);
  const foreign = new DrawWrapper(f.engine);
  try { f.sub._setMainDrawWrapperOverride(foreign); reject(); }
  finally { f.sub._setMainDrawWrapperOverride(null); foreign.dispose(true); }
  context.enableIndirectDraw = true;
  withProperty(context, "_indirectDrawData", { value: new Uint32Array(4) }, reject);
});

test("invalid range, retired submesh, changed pin and snapshot mode fail before mutation", t => {
  const f = fixture(t); f.draw();
  const context = f.main.drawContext as WebGPUDrawContext, bundle = context.fastBundle;
  for (const [start, count] of [[-1, 3], [0, -1], [0, 7], [1.5, 3], [0, Number.NaN]])
    assert.throws(() => invalidateTreeDrawRange(f.mesh, f.sub, start, count), /Unsupported pinned/);
  const clone = f.mesh.clone("foreign submesh owner", null, true)!;
  assert.throws(() => invalidateTreeDrawRange(f.mesh, clone.subMeshes[0], 0, 6), /Unsupported pinned/);
  withProperty(AbstractEngine, "Version", { get: () => "future-version" }, () => {
    assert.throws(() => changeRange(f, 0, 6), /Unsupported pinned/);
  });
  withProperty(f.engine, "snapshotRendering", { value: true }, () => {
    assert.throws(() => changeRange(f, 0, 6), /Unsupported pinned/);
  });
  assert.equal(context.fastBundle, bundle); assert.equal(f.sub.indexCount, 3);
});

test("no prior draw, no shadow owner and late disposed mesh do not create or revive context owners", t => {
  const f = fixture(t, "litter");
  const fresh = MeshBuilder.CreatePlane("not drawn", {}, f.scene); fresh.material = f.material;
  const sub = fresh.subMeshes[0], before = f.counts();
  const table = (sub as any)._drawWrappers, owners = [...table];
  assert.ok(owners.every(wrapper => !wrapper?.effect));
  invalidateTreeDrawRange(fresh, sub, 0, 3);
  assert.equal((sub as any)._drawWrappers, table); assert.deepEqual([...table], owners);
  sub.resetDrawCache(undefined, true);
  invalidateTreeDrawRange(fresh, sub, 0, 3);
  assert.deepEqual((sub as any)._drawWrappers, []);
  fresh.dispose();
  assert.doesNotThrow(() => invalidateTreeDrawRange(fresh, sub, 0, 3));
  assert.deepEqual(f.counts(), before);
});

test("a disposed shadow owner and a known active alias do not revive or broaden ownership", t => {
  const f = fixture(t), shadow = f.addShadow();
  f.draw(); f.draw(shadow.a); f.draw(shadow.b);
  f.sub._setMainDrawWrapperOverride(shadow.a);
  try { changeRange(f, 0, f.fullCount); }
  finally { f.sub._setMainDrawWrapperOverride(null); }
  assert.equal(f.draw(shadow.a).count, f.fullCount);
  shadow.owner.dispose();
  const a = shadow.a.drawContext as WebGPUDrawContext, b = shadow.b.drawContext as WebGPUDrawContext;
  assert.equal(a.buffers, undefined); assert.equal(b.buffers, undefined);
  changeRange(f, 0, f.fullCount / 2);
  assert.equal(f.draw().count, f.fullCount / 2);
  assert.equal(a.buffers, undefined); assert.equal(b.buffers, undefined);
  assert.equal(a.fastBundle, undefined); assert.equal(b.fastBundle, undefined);
});

test("public resetDrawCache releases ordinary Effects but leaves custom shadow aliases outside its coverage", t => {
  const f = fixture(t), shadow = f.addShadow();
  f.draw(); f.draw(shadow.a);
  const mainEffect = f.main.effect!, depthEffect = shadow.a.effect!, bundle = (shadow.a.drawContext as WebGPUDrawContext).fastBundle;
  f.sub.resetDrawCache(undefined, true);
  assert.equal(mainEffect.isDisposed, true);
  assert.equal(depthEffect.isDisposed, false);
  assert.equal((shadow.a.drawContext as WebGPUDrawContext).fastBundle, bundle);
});

test("actual allocated nonzero/multi-digit passes and existing high sparse main/shadow aliases invalidate", t => {
  const f = fixture(t), shadow = f.addShadow();
  const allocated = Array.from({ length: 16 }, (_, index) => f.engine.createRenderPassId("tree parity " + index) as number);
  t.after(() => { for (const pass of allocated) f.engine.releaseRenderPassId(pass); });
  assert.ok(allocated.every(pass => Number.isSafeInteger(pass) && pass > 0));
  assert.ok(allocated.at(-1)! >= 10);
  const passes = [allocated[1], allocated[12], 1_000_001];
  const wrappers: DrawWrapper[] = [];
  const table = (f.sub as any)._drawWrappers;
  const shadowTable = (shadow.owner as any)._subMeshToDepthWrapper.mm.get(f.sub).get(shadow.generator).drawWrapper;
  for (const pass of passes) {
    const main = f.sub._getDrawWrapper(pass, true)!;
    if (!main.effect) { main.setEffect(f.main.effect); (f.main.effect as any)._refCount++; }
    main.materialContext = new WebGPUMaterialContext();
    const alias = shadow.owner.getEffect(f.sub, shadow.generator, pass)!;
    alias.materialContext = new WebGPUMaterialContext();
    assert.equal(Object.hasOwn(table, String(pass)), true);
    assert.equal(Object.hasOwn(shadowTable, String(pass)), true);
    wrappers.push(main, alias);
  }
  for (const wrapper of wrappers) assert.equal(f.draw(wrapper).count, 3);
  const keys = [Object.keys(table), Object.keys(shadowTable)];
  changeRange(f, 0, 6);
  assert.deepEqual([Object.keys(table), Object.keys(shadowTable)], keys);
  for (const wrapper of wrappers) assert.equal(f.draw(wrapper).count, 6);
});

test("noncanonical main/shadow keys remain rejected atomically with only bounded escaped key detail", t => {
  const f = fixture(t), shadow = f.addShadow();
  (f.main.drawContext as WebGPUDrawContext).enableIndirectDraw = true;
  for (const wrapper of [f.main, shadow.a, shadow.b]) f.draw(wrapper);
  const context = f.main.drawContext as WebGPUDrawContext;
  const bundle = context.fastBundle, sentinel = (context as any)._currentInstanceCount;
  const tables = {
    main: (f.sub as any)._drawWrappers,
    shadow: (shadow.owner as any)._subMeshToDepthWrapper.mm.get(f.sub).get(shadow.generator).drawWrapper,
  };
  for (const label of ["main", "shadow"] as const)
    for (const key of ["undefined", "-1", "01", "1.5", "named", "1\\d", '\n"\\'.repeat(100)]) {
      withProperty(tables[label], key, { value: f.main, enumerable: true, writable: true }, () => {
        assert.throws(() => changeRange(f, 0, 6), error => {
          assert.ok(error instanceof Error);
          const prefix = `Unsupported pinned tree draw-cache ${label} pass key `;
          assert.ok(error.message.startsWith(prefix));
          const escaped = error.message.slice(prefix.length);
          assert.ok(escaped.length <= 80);
          assert.equal(typeof JSON.parse(escaped), "string");
          assert.ok(key.startsWith(JSON.parse(escaped)));
          assert.doesNotMatch(escaped, /\n/, "control characters stay JSON-escaped");
          return true;
        });
        assert.equal(context.fastBundle, bundle);
        assert.equal((context as any)._currentInstanceCount, sentinel);
        assert.equal(f.sub.indexCount, 3);
      });
    }
});

test("actual ObjectRenderer first allocation leaves an empty undefined-pass tombstone without blocking range changes", t => {
  const f = fixture(t); f.draw();
  const table = (f.sub as any)._drawWrappers;
  assert.equal(Object.hasOwn(table, "undefined"), false);
  const reserved = f.engine.createRenderPassId("already allocated fixture pass");
  t.after(() => f.engine.releaseRenderPassId(reserved));
  const renderer = new ObjectRenderer("first scoped target", f.scene);
  t.after(() => { if (f.scene.objectRenderers.includes(renderer)) renderer.dispose(); });
  const marker = Object.getOwnPropertyDescriptor(table, "undefined");
  assert.deepEqual(marker, { value: undefined, writable: true, enumerable: true, configurable: true });
  assert.ok(Number.isSafeInteger(renderer.renderPassId) && renderer.renderPassId > 0);
  const pass = renderer.renderPassId;
  assert.notEqual(pass, 1);
  const target = f.sub._getDrawWrapper(pass, true)!;
  target.setEffect(f.main.effect); (f.main.effect as any)._refCount++;
  target.materialContext = new WebGPUMaterialContext();
  assert.equal(f.draw(target).count, 3);
  renderer.dispose();
  assert.equal(Object.hasOwn(table, String(pass)), true);
  assert.equal(table[pass], undefined, "native release leaves its ordinary numeric tombstone too");
  assert.doesNotThrow(() => changeRange(f, 0, 6));
  assert.equal(f.draw().count, 6);
  assert.deepEqual(Object.getOwnPropertyDescriptor(table, "undefined"), marker, "native tombstone is not deleted or rewritten");
  assert.equal(table[pass], undefined);
});

test("undefined-pass exception does not admit live aliases, accessors or altered tombstone descriptors", t => {
  const f = fixture(t), shadow = f.addShadow();
  f.draw(); f.draw(shadow.a); f.draw(shadow.b);
  const context = f.main.drawContext as WebGPUDrawContext, bundle = context.fastBundle;
  const reject = () => {
    assert.throws(() => changeRange(f, 0, 6), /Unsupported pinned/);
    assert.equal(context.fastBundle, bundle); assert.equal(f.sub.indexCount, 3);
  };
  const main = (f.sub as any)._drawWrappers;
  for (const property of [
    { value: null }, { value: f.main }, { get: () => assert.fail("tombstone getter invoked") },
    { value: undefined, writable: false }, { value: undefined, configurable: false },
  ]) {
    const table = main.slice();
    Object.defineProperty(table, "undefined", { enumerable: true, configurable: true,
      ...("value" in property ? { writable: true } : {}), ...property });
    withProperty(f.sub, "_drawWrappers", { value: table }, reject);
  }
  const entry = (shadow.owner as any)._subMeshToDepthWrapper.mm.get(f.sub).get(shadow.generator);
  const table = entry.drawWrapper.slice();
  Object.defineProperty(table, "undefined", { value: undefined, writable: true, enumerable: true, configurable: true });
  withProperty(entry, "drawWrapper", { value: table }, reject);
});
