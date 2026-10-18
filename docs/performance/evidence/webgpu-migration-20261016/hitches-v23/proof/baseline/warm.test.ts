import test, { after } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { WebGPUDrawContext } from "@babylonjs/core/Engines/WebGPU/webgpuDrawContext";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { NativeProcessingEngine } from "./native-engine";
import { OwnedHooks, Trace } from "./trace";
import { StableLightState } from "./client/stable-light-state";
import { GltfLightBudget } from "./client/gltf-light-budget";
import { CampusSurfaceArtPlugin, campusSurfaceArt } from "./client/cinematic-art";

const hash = (s: string | Uint8Array) => createHash("sha256").update(s).digest("hex");
const input = JSON.parse(readFileSync(new URL("input-manifest.json", import.meta.url), "utf8"));
const report: any = { startedAt: new Date().toISOString(), input, cases: [], limits: [
  "Node CPU proof, not browser/GPU timing or extrapolation to 794 production Effect changes",
  "Actual WGSL processor and WebGPUEngine.createEffect; pipeline creation, binding backend and draw submission remain NullEngine",
  "Actual WebGPUDrawContext reset on empty GPU binding/owner-slot state; real bind-group/driver/slot pressure is not measured",
  "Main perspective pass only, shadows disabled; no complete world/GLB/LOD/avatar/texture workload",
  "Timers are inclusive, observer overhead remains, options are direct same-call intervals; no synthetic self-time subtraction",
  "Standard has no separate callable define preparation; ready-to-mark interval includes texture/readiness/plugin work",
  "Native WGSL material UniformBuffer intentionally forwards to Effect leftovers. Actual delegated update arguments/layout are compared; GPU leftovers storage is unavailable in the Null pipeline context",
] };
const copy = (x: any) => JSON.parse(JSON.stringify(x));

class ProofEngine extends NativeProcessingEngine {
  declare contexts: Set<WebGPUDrawContext>;
  override createEffect(...args: Parameters<WebGPUEngine["createEffect"]>) {
    return Reflect.apply(WebGPUEngine.prototype.createEffect, this, args);
  }
  override createDrawContext() {
    const trap = () => { throw Error("GPU buffer work is outside this CPU proof"); };
    const context = new WebGPUDrawContext({ createRawBuffer: trap, releaseBuffer: trap, setRawData: trap } as any, undefined as any);
    (this.contexts ??= new Set()).add(context); return context;
  }
}

type Kind = "pbr" | "standard" | "surface";
async function fixture(kind: Kind, fail = false) {
  const engine = new ProofEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true; scene.shadowsEnabled = false;
  const camera = new FreeCamera("same perspective", new Vector3(0, 9, -30), scene); camera.setTarget(new Vector3(0, 0, 3)); scene.activeCamera = camera;
  const point = new PointLight("point", new Vector3(2, 3, 1), scene); point.falloffType = Light.FALLOFF_STANDARD;
  new DirectionalLight("day", Vector3.Down(), scene); new HemisphericLight("sky", Vector3.Up(), scene);
  const torch = new SpotLight("torch", new Vector3(0, 2, -3), Vector3.Forward(), .72, 64, scene); torch.falloffType = Light.FALLOFF_STANDARD; torch.renderPriority = 10; torch.setEnabled(false);
  const material: any = kind === "standard" ? new StandardMaterial("shared Standard", scene) : new PBRMaterial("shared PBR", scene);
  if (kind !== "standard") { material.metallic = 0; material.roughness = .6; }
  const plugin = kind === "surface" ? new CampusSurfaceArtPlugin(material, campusSurfaceArt("asphalt")!) : undefined;
  const meshes = Array.from({ length: 12 }, (_, i) => { const m = MeshBuilder.CreateBox("actual mesh " + i, {}, scene); m.position.set((i % 4 - 1.5) * 2, 0, Math.floor(i / 4) * 2); m.material = material; m.receiveShadows = false; m.releaseSubMeshes(); for (let offset = 0; offset < 36; offset += 12) new SubMesh(0, 0, m.getTotalVertices(), offset, 12, m); return m; });
  const submeshes = meshes.flatMap(m => m.subMeshes!), budget = new GltfLightBudget(scene), stable = new StableLightState(scene), hooks = new OwnedHooks(), trace = new Trace();
  const observers: any[] = [], row: any = { kind, fail, submeshes: submeshes.length, frames: [], controls: [], invariants: {}, cleanup: null }; report.cases.push(row);
  const uniformUpdates: Record<string, unknown> = {};
  // Material._createUniformBuffer forces non-UBO for WGSL. Observe its native
  // forwarding calls, without changing their receiver/arguments/return value.
  // This is not a surrogate GPU leftovers buffer or a readiness replacement.
  assert.equal(material._uniformBuffer.useUbo, false);
  const uniformValue = (value: any): any => value?.asArray ? Array.from(value.asArray()) : ArrayBuffer.isView(value) ? Array.from(value as any) : value;
  for (const name of Object.keys(material._uniformBuffer).filter(name => name.startsWith("update") && typeof material._uniformBuffer[name] === "function")) {
    hooks.wrap(material._uniformBuffer, name, original => function(this: any, ...args: any[]) {
      const result = Reflect.apply(original, this, args);
      uniformUpdates[String(args[0])] = { method: name, values: args.slice(1).map(uniformValue) };
      return result;
    });
  }
  let draws = 0, eventFailure = false;
  const sentinel = new Error("owned effect observer failure");
  for (const mesh of meshes) observers.push([mesh.onAfterRenderObservable, mesh.onAfterRenderObservable.add(() => { if (engine.currentRenderPassId === camera.renderPassId) draws++; })]);
  const snapshot = () => submeshes.map(sub => { const effect: any = sub.effect; assert.ok(effect?.isReady()); return { defines: effect.defines, key: effect.key, effect: effect.uniqueId, values: copy(Object.fromEntries(Object.entries(sub.materialDefines!).filter(([k]) => !k.startsWith("_")))), shader: { vertex: effect.vertexSourceCode, fragment: effect.fragmentSourceCode }, layout: copy(effect._processingContext), uniformUpdates: copy(uniformUpdates), lightSources: sub.getMesh().lightSources.map(l => [l.getTypeID(), l.falloffType]), cap: material.maxSimultaneousLights }; });
  const render = async () => {
    draws = 0;
    const started = performance.now(); budget.prepareFrame(); const budgetEnd = performance.now();
    stable.update(); const orderingEnd = performance.now(); scene.render(); const renderEnd = performance.now();
    await setImmediate();
    return { budgetMs: budgetEnd - started, orderingMs: orderingEnd - budgetEnd, sceneRenderMs: renderEnd - orderingEnd, syncMs: renderEnd - started };
  };
  const settle = async (on: boolean) => { torch.setEnabled(on); for (let i = 0; i < 12; i++) { await render(); if (draws === submeshes.length && submeshes.every(s => (s.materialDefines as any)?.LIGHTCOUNT === (on ? 4 : 3) && s.effect?.isReady()) && Object.values((engine as any)._compiledEffects).every((e: any) => e.isReady())) return snapshot(); } throw Error("Actual warm draw did not settle"); };
  try {
    await settle(false); await settle(true); const off = await settle(false), on = await settle(true); await settle(false);
    assert.equal(new Set(off.map(s => s.effect)).size, 1); assert.equal(new Set(on.map(s => s.effect)).size, 1); assert.notEqual(off[0].effect, on[0].effect);
    assert.equal(engine.sources.length, 2); row.warmedPrograms = engine.sources.length;
    assert.ok(Object.keys(off[0].uniformUpdates).length > 0, "actual forwarded material uniforms captured");
    if (plugin) {
      const buffer = new UniformBuffer(engine);
      try {
        for (const uniform of plugin.getUniforms(ShaderLanguage.WGSL).ubo!) buffer.addUniform(uniform.name, uniform.size!);
        buffer.create(); plugin.bindForSubMesh(buffer);
        row.pluginUniformData = Array.from(buffer.getData());
        assert.ok(row.pluginUniformData.length > 0);
        assert.ok(Object.keys(uniformUpdates).some(name => name.startsWith("campusArt")));
      } finally { buffer.dispose(); }
    }
    // Identical uninstrumented transition invariants before timing observers.
    for (const enabled of [false, true, true, false, false]) { const prior = torch.isEnabled(), start = performance.now(); torch.setEnabled(enabled); const toggleMs = performance.now() - start, cpu = await render(); const elapsedMs = performance.now() - start; assert.equal(draws, submeshes.length); assert.deepEqual(snapshot(), enabled ? on : off); row.controls.push({ enabled, switched: prior !== enabled, elapsedMs, toggleMs, cpu, draws, programs: engine.sources.length }); }
    const effectsBefore = Object.values((engine as any)._compiledEffects) as any[];
    row.referencesBefore = effectsBefore.map(effect => ({ id: effect.uniqueId, refs: effect._refCount }));
    const previous = new Map(submeshes.map(s => [s, s.effect!.uniqueId]));
    observers.push([material.onEffectCreatedObservable, material.onEffectCreatedObservable.add(({ effect, subMesh }: any) => { if (eventFailure) throw sentinel; if (trace.enabled) { trace.count("effectCreatedEvents"); if (previous.get(subMesh) !== effect.uniqueId) trace.count("effectChanges"); previous.set(subMesh, effect.uniqueId); } })]);
    hooks.wrap(material, "isReadyForSubMesh", original => trace.ready(kind, original));
    if (kind !== "standard") { hooks.wrap(material, "_prepareEffect", original => trace.method("pbrPrepareEffectInclusive", original)); hooks.wrap(material, "_prepareDefines", original => trace.method("pbrPrepareDefinesInclusive", original)); }
    for (const name of ["_callbackPluginEventPrepareDefinesBeforeAttributes", "_callbackPluginEventPrepareDefines", "_callbackPluginEventIsReadyForSubMesh", "_callbackPluginEventBindForSubMesh", "_callbackPluginEventHardBindForSubMesh"]) hooks.wrap(material, name, original => trace.method("plugin:" + name, original));
    hooks.wrap(material, "_callbackPluginEventGeneric", original => { const measured = trace.method("pluginPrepareEffectInclusive", original); return function(this: any, ...args: any[]) { return Reflect.apply(args[0] === 128 ? measured : original, this, args); }; });
    hooks.wrap(engine, "createEffect", original => trace.effect(original));
    hooks.wrap(scene, "resetCachedMaterial", original => trace.method("sceneResetCachedMaterial", original));
    for (const sub of submeshes) { const defines: any = sub.materialDefines; hooks.wrap(defines, "markAsProcessed", original => trace.mark(original)); hooks.wrap(defines, "toString", original => trace.serialize(original)); hooks.wrap(sub, "setEffect", original => trace.method("subMeshSetEffectInclusive", original)); hooks.wrap((sub as any)._getDrawWrapper(camera.renderPassId), "setEffect", original => trace.method("drawWrapperSetEffectInclusive", original)); }
    for (const context of engine.contexts) hooks.wrap(context, "reset", original => { const measured = trace.method("webGpuDrawContextResetInclusive", original); return function(this: any, ...args: any[]) { trace.count("uniformSlotOwnersBeforeReset", this._uniformBuffersWithOwnedSlot?.length ?? 0); return Reflect.apply(measured, this, args); }; });
    trace.enabled = true;
    if (fail) { eventFailure = true; torch.setEnabled(true); assert.throws(() => { budget.prepareFrame(); stable.update(); scene.render(); }, error => error === sentinel); assert.equal(trace.snapshot().openScopes, 0); row.failurePreserved = true; return row; }
    for (let cycle = 0; cycle < 8; cycle++) for (const enabled of [false, true, true, false]) {
      trace.reset(); const programsBefore: number = engine.sources.length, started = performance.now(); const prior = torch.isEnabled(); torch.setEnabled(enabled); const toggleMs = performance.now() - started, cpu = await render(); const ended = performance.now();
      const metrics = trace.snapshot(); trace.enabled = false; const state = snapshot(); assert.deepEqual(state, enabled ? on : off); trace.enabled = true;
      assert.equal(draws, submeshes.length); assert.equal(engine.sources.length, programsBefore); assert.equal(metrics.openScopes, 0);
      const switches = prior !== enabled ? submeshes.length : 0;
      assert.equal(metrics.counts.cacheMisses ?? 0, 0); assert.equal(metrics.counts.cacheHits ?? 0, switches); assert.equal(metrics.counts.effectCreatedEvents ?? 0, switches); assert.equal(metrics.counts.effectChanges ?? 0, switches);
      assert.equal(metrics.samples.serializerInclusive?.calls ?? 0, switches); assert.equal(metrics.samples.subMeshSetEffectInclusive?.calls ?? 0, switches); assert.equal(metrics.samples.webGpuDrawContextResetInclusive?.calls ?? 0, switches);
      row.frames.push({ cycle, enabled, switched: prior !== enabled, wallMs: ended - started, toggleMs, cpu, draws, newPrograms: engine.sources.length - programsBefore, metrics });
    }
    row.referencesAfterWarmSwitches = effectsBefore.map(effect => ({ id: effect.uniqueId, refs: effect._refCount }));
    for (let i = 0; i < effectsBefore.length; i++) assert.equal(row.referencesAfterWarmSwitches[i].refs - row.referencesBefore[i].refs, 8 * submeshes.length);
    trace.reset(); const beforeValuePrograms = engine.sources.length, originalAlphaCutOff = material.alphaCutOff; if (kind === "standard") material.disableLighting = true; else material.alphaCutOff = .25;
    for (let i = 0; i < 12; i++) { await render(); if (submeshes.every(s => s.effect?.isReady() && (kind === "standard" ? (s.materialDefines as any).LIGHTCOUNT === 0 : (s.materialDefines as any).ALPHATESTVALUE === "0.25")) && Object.values((engine as any)._compiledEffects).every((e: any) => e.isReady())) break; }
    trace.enabled = false; const changed = snapshot(); assert.equal(engine.sources.length, beforeValuePrograms + 1); assert.ok(changed.every(s => s.effect !== off[0].effect && s.effect !== on[0].effect)); row.genuineValue = { newPrograms: 1, metrics: trace.snapshot() };
    if (kind === "standard") material.disableLighting = false; else material.alphaCutOff = originalAlphaCutOff; await render(); await render(); assert.deepEqual(snapshot(), off); assert.equal(engine.sources.length, beforeValuePrograms + 1);
    row.invariants = { offEffect: off[0].effect, onEffect: on[0].effect, offDefinesSha: hash(off[0].defines), onDefinesSha: hash(on[0].defines), sourceSha: { off: hash(JSON.stringify(off[0].shader)), on: hash(JSON.stringify(on[0].shader)) }, layoutSha: { off: hash(JSON.stringify(off[0].layout)), on: hash(JSON.stringify(on[0].layout)) }, uniformUpdateNames: Object.keys(off[0].uniformUpdates), fullSnapshotsStable: true, actualCacheMethod: "WebGPUEngine.prototype.createEffect", plugin: plugin?.name ?? null };
    row.variantSnapshots = { off: off[0], on: on[0], changed: changed[0] };
    return row;
  } catch (error) {
    row.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { thrown: String(error) };
    throw error;
  } finally {
    trace.enabled = false; hooks.dispose(); for (const [o,h] of observers) o.remove(h); observers.length = 0; stable.dispose(); budget.dispose(); scene.dispose();
    const effects: any[] = Object.values((engine as any)._compiledEffects); for (const effect of effects) effect.dispose(true);
    // NullEngine has no native GPU context owner. The CPU adapter owns every
    // actual WebGPUDrawContext it created and releases any remaining ones.
    for (const context of engine.contexts) if ((context as any).buffers !== undefined) context.dispose();
    engine.dispose(); await setImmediate();
    row.cleanup = { hooks: hooks.size, observers: observers.length, scene: scene.isDisposed, engine: engine.isDisposed, allEffectsDisposed: effects.every(e => e.isDisposed), contextsDisposed: [...engine.contexts].every(c => (c as any).buffers === undefined), openScopes: trace.snapshot().openScopes };
    assert.deepEqual(row.cleanup, { hooks: 0, observers: 0, scene: true, engine: true, allEffectsDisposed: true, contextsDisposed: true, openScopes: 0 }); engine.contexts.clear();
  }
}

for (const kind of ["pbr", "standard", "surface"] as const) test("warm actual " + kind + " switch costs and invariants", async () => { await fixture(kind); });
test("actual observer failure preserves its identity and releases every local hook/resource", async () => { await fixture("pbr", true); });
test("hook receiver/arguments/throws/returns and later owner stay unchanged", () => {
  const hooks = new OwnedHooks(), sentinel = new Error("original");
  const target: { method: (value: number) => unknown } = { method(this: any, value: number) { assert.equal(this, target); assert.equal(value, 3); throw sentinel; } };
  const before = Object.getOwnPropertyDescriptor(target, "method");
  hooks.wrap(target, "method", fn => function(this: any, ...args: any[]) { return Reflect.apply(fn, this, args); });
  assert.throws(() => target.method(3), error => error === sentinel); hooks.dispose();
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, "method"), before);
  const result = { get then(): never { throw Error("must not inspect then"); } };
  target.method = () => result;
  hooks.wrap(target, "method", fn => function(this: any, ...args: any[]) { return Reflect.apply(fn, this, args); });
  assert.equal(target.method(3), result);
  const later = () => 4; target.method = later; hooks.dispose(); assert.equal(target.method, later);
});
after(() => { const request=createRequire(import.meta.url),loader=createRequire(request.resolve("@babylonjs/loaders/package.json"));report.identity={core:realpathSync(request.resolve("@babylonjs/core/package.json")),loaderCore:realpathSync(loader.resolve("@babylonjs/core/package.json"))};assert.equal(report.identity.core,report.identity.loaderCore);report.finishedAt=new Date().toISOString();writeFileSync(new URL(process.env.WARM_REPORT ?? "report.json",import.meta.url),JSON.stringify(report,null,2)+"\n"); });
