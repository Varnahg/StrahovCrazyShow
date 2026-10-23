import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MaterialDefines } from "@babylonjs/core/Materials/materialDefines";
import { BindLights } from "@babylonjs/core/Materials/materialHelper.functions";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { Effect, IEffectCreationOptions } from "@babylonjs/core/Materials/effect";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { WebGPUCacheBindGroups } from "@babylonjs/core/Engines/WebGPU/webgpuCacheBindGroups";
import { WebGPUShaderProcessor } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessor";
import { Logger } from "@babylonjs/core/Misc/logger";
import { createWebGpuShadowDepthWrapper } from "../client/webgpu-shadow-readiness";

/** Actual light layouts and wrapper state machine; only GPU effect creation and
 * the terminal GPUDevice are substituted. This is not graphical acceptance. */
function fixture(guarded = false, options: { standalone?: boolean } = {}) {
  const engine = new NullEngine();
  Object.defineProperty(engine, "supportsUniformBuffers", { value: true });
  const scene = new Scene(engine);
  scene.shadowsEnabled = false;
  const material = new PBRMaterial("wrapped tree", scene);
  const mesh = MeshBuilder.CreateBox("shadow-only caster", {}, scene);
  mesh.material = material;
  const subMesh = mesh.subMeshes![0];
  const hemi = new HemisphericLight("ambient", Vector3.Up(), scene);
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  const point = new PointLight("lamp", Vector3.Zero(), scene);
  const defineState = Object.assign(new MaterialDefines(), {
    LIGHT0: true, HEMILIGHT0: true, LIGHT1: true, POINTLIGHT1: true,
  });
  defineState.rebuild();
  subMesh.setEffect(null, defineState);
  const original = {
    shaderLanguage: ShaderLanguage.WGSL,
    isReady: () => true,
    vertexSourceCodeBeforeMigration: "@vertex fn main() {}",
    fragmentSourceCodeBeforeMigration: "@fragment fn main() {}",
    defines: "#define LIGHT0\n#define HEMILIGHT0\n#define LIGHT1\n#define POINTLIGHT1",
    getUniformNames: () => [], getAttributesNames: () => ["position"],
    getUniformBuffersNames: () => ["Light0", "Light1"],
    getSamplers: () => [], getIndexParameters: () => ({ maxSimultaneousLights: 2 }),
  } as unknown as Effect;
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = guarded;
  const wrapper = guarded
    ? createWebGpuShadowDepthWrapper(material, scene, { doNotInjectCode: true, ...options })
    : new ShadowDepthWrapper(material, scene, { doNotInjectCode: true, ...options });
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = false;
  material.isReadyForSubMesh = () => true;
  const captures: IEffectCreationOptions[] = [];
  const oldCreate = engine.createEffect;
  engine.createEffect = ((_sources: unknown, options: IEffectCreationOptions) => {
    captures.push(options);
    return { defines: options.defines, isReady: () => true, dispose() {} } as unknown as Effect;
  }) as typeof engine.createEffect;
  material.onEffectCreatedObservable.notifyObservers({ effect: original, subMesh });
  if (guarded) engine.currentRenderPassId = 9;
  const generator = {} as ShadowGenerator;
  const ready = (instances = false) => wrapper.isReadyForSubMesh(subMesh, ["#define SM_FLOAT 1"], generator, instances, 9);
  const bindCurrentLights = () => {
    const bound = new Map<string, number>();
    const effect = {
      bindUniformBuffer(buffer: { capacity: number }, name: string) { bound.set(name, buffer.capacity); },
    } as unknown as Effect;
    BindLights(scene, mesh, effect, defineState, material.maxSimultaneousLights);
    return bound;
  };
  return {
    engine, scene, material, mesh, subMesh, wrapper, captures, original, generator,
    hemi, sun, point, defineState, ready, bindCurrentLights,
    dispose() {
      wrapper.dispose(); engine.createEffect = oldCreate;
      scene.dispose(); engine.dispose();
    },
  };
}

test("pinned baseline: a ready shadow effect retains HEMI96 while current Light0 binds sun80", () => {
  const f = fixture();
  try {
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi, f.point);
    assert.equal(f.ready(), true);
    assert.equal(f.bindCurrentLights().get("Light0"), 96);
    assert.match(f.captures[0].defines!, /#define HEMILIGHT0/);
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.sun, f.point);
    f.mesh._markSubMeshesAsLightDirty();
    assert.equal(f.defineState._areLightsDirty, true);
    assert.equal(f.ready(), true, "upstream wrapper incorrectly accepts the unchanged old effect");
    assert.equal(f.captures.length, 1, "no main material readiness happened before this shadow pass");
    assert.equal(f.bindCurrentLights().get("Light0"), 80);
    assert.match(f.captures[0].defines!, /#define HEMILIGHT0/);
  } finally { f.dispose(); }
});

test("guard rejects stale type and missing LightN even when a material says it is ready", () => {
  const f = fixture(true);
  try {
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi, f.point);
    assert.equal(f.ready(), true);
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.sun, f.point);
    assert.equal(f.ready(), false);
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.point, f.hemi);
    assert.equal(f.ready(), false, "same96-byte layouts do not make HEMI/POINT semantically interchangeable");
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi);
    assert.equal(f.ready(), false);
    f.mesh.lightSources.push(f.point);
    assert.equal(f.ready(), true);
  } finally { f.dispose(); }
});

test("guard covers the production four-to-three slot transition without fabricating a missing buffer", () => {
  const f = fixture(true);
  try {
    const secondPoint = new PointLight("second lamp", Vector3.One(), f.scene);
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi, f.point, secondPoint, f.sun);
    f.material.onEffectCreatedObservable.notifyObservers({ subMesh: f.subMesh, effect: {
      ...f.original, defines: "#define LIGHT0\n#define HEMILIGHT0\n#define LIGHT1\n#define POINTLIGHT1\n#define LIGHT2\n#define POINTLIGHT2\n#define LIGHT3\n#define DIRLIGHT3",
      getUniformBuffersNames: () => ["Light0", "Light1", "Light2", "Light3"],
    } as Effect });
    assert.equal(f.ready(), true);
    assert.equal(f.bindCurrentLights().size, 4);
    f.mesh.lightSources.splice(1, 1);
    assert.equal(f.bindCurrentLights().has("Light3"), false);
    assert.equal(f.ready(), false);
  } finally { f.dispose(); }
});

test("guard refreshes base readiness before selecting depth effect and preserves pass/override", () => {
  const f = fixture(true);
  try {
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.sun, f.point);
    let calls = 0;
    f.material.isReadyForSubMesh = function (mesh, sub, instances) {
      calls++;
      assert.equal(this, f.material); assert.equal(mesh, f.mesh); assert.equal(sub, f.subMesh);
      assert.equal(instances, false); assert.equal(f.engine.currentRenderPassId, 9);
      assert.equal(sub._drawWrapperOverride, null);
      f.material.onEffectCreatedObservable.notifyObservers({ subMesh: sub,
        effect: { ...f.original, defines: "#define LIGHT0\n#define DIRLIGHT0\n#define LIGHT1\n#define POINTLIGHT1" } as Effect });
      return true;
    };
    assert.equal(f.ready(), true);
    assert.equal(calls, 1); assert.equal(f.engine.currentRenderPassId, 9);
    assert.equal(f.subMesh._drawWrapperOverride, null);
    assert.match(f.captures.at(-1)!.defines!, /#define DIRLIGHT0/);
    const override = f.wrapper.getEffect(f.subMesh, f.generator, 9)!;
    f.subMesh._setMainDrawWrapperOverride(override);
    assert.equal(f.ready(), false, "reentrant binding cannot overwrite depth ownership");
    assert.equal(calls, 1); assert.equal(f.subMesh._drawWrapperOverride, override);
    f.subMesh._setMainDrawWrapperOverride(null);
    f.engine.currentRenderPassId = 10;
    assert.equal(f.ready(), false); assert.equal(calls, 1);
  } finally { f.dispose(); }
});

test("guard follows material/device light caps and disabled-light binding policy", () => {
  const f = fixture(true);
  try {
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi, f.point, f.sun);
    f.material.maxSimultaneousLights = 2;
    assert.equal(f.ready(), true, "third unused light is outside the shader cap");
    f.material.maxSimultaneousLights = 4;
    f.engine.getCaps().maxUniformBuffersPerShaderStage = 6;
    assert.equal(f.ready(), true, "device-supported shader slots are also capped at two");
    f.scene.lightsEnabled = false;
    assert.equal(f.ready(), false, "old light declarations cannot be left unbound");
    f.scene.lightsEnabled = true; f.material.disableLighting = true;
    assert.equal(f.ready(), false);
    f.material.disableLighting = false;
    assert.equal(f.ready(), true);
  } finally { f.dispose(); }
});

test("guard fails closed on unknown light class/define layout and after disposal", () => {
  const f = fixture(true);
  try {
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi, f.point);
    assert.equal(f.ready(), true);
    const effect = f.wrapper.getEffect(f.subMesh, f.generator, 9)!.effect!;
    const oldDefines = effect.defines;
    for (const bad of ["#define LIGHT0\n#define AREALIGHT0", "#define LIGHT0\n#define HEMILIGHT0\n#define DIRLIGHT0",
      "#define LIGHT1\n#define HEMILIGHT1", "#define LIGHT0 0\n#define HEMILIGHT0"]) {
      effect.defines = bad;
      assert.equal(f.ready(), false, bad);
    }
    effect.defines = oldDefines;
    const oldClass = f.hemi.getClassName;
    f.hemi.getClassName = () => "CustomHemi";
    assert.equal(f.ready(), false);
    f.hemi.getClassName = oldClass;
    f.wrapper.dispose(); f.wrapper.dispose();
    assert.equal(f.ready(), false);
  } finally { f.dispose(); }
});

test("standalone and instancing are forwarded once; readiness failures keep their identity", () => {
  const f = fixture(true, { standalone: true });
  try {
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi, f.point);
    let calls = 0;
    f.material.isReadyForSubMesh = function (_mesh, _sub, instances) {
      calls++; assert.equal(this, f.material); assert.equal(instances, true); return true;
    };
    assert.equal(f.wrapper.standalone, true);
    assert.equal(f.ready(true), true);
    assert.equal(calls, 1, "standalone base readiness must not run twice");
    const failure = new Error("material failed");
    f.material.isReadyForSubMesh = () => { throw failure; };
    assert.throws(() => f.ready(), (error) => error === failure);
    f.material.isReadyForSubMesh = () => { f.wrapper.dispose(); return true; };
    assert.equal(f.ready(), false, "late readiness cannot reactivate disposed wrapper");
  } finally { f.dispose(); }
});

test("factory preserves native WebGL and custom ShaderMaterial wrapper contracts", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const lit = new PBRMaterial("WebGL", scene);
  const custom = new ShaderMaterial("custom", scene, {}, {});
  const gl = createWebGpuShadowDepthWrapper(lit, scene, { standalone: true });
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  const gpuCustom = createWebGpuShadowDepthWrapper(custom, scene);
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = false;
  try {
    assert.equal(gl.constructor, ShadowDepthWrapper);
    assert.equal(gl.standalone, true);
    assert.equal(gpuCustom.constructor, ShadowDepthWrapper);
  } finally { gl.dispose(); gpuCustom.dispose(); scene.dispose(); engine.dispose(); }
});

async function actualMaterialFixture(kind: "standard" | "pbr") {
  const engine = new NullEngine(), scene = new Scene(engine);
  new FreeCamera("camera", new Vector3(0, 2, -4), scene);
  const mesh = MeshBuilder.CreateBox("actual shadow caster", {}, scene);
  const hemi = new HemisphericLight("ambient", Vector3.Up(), scene);
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  sun.setEnabled(false);
  const material = kind === "pbr" ? new PBRMaterial(kind, scene) : new StandardMaterial(kind, scene);
  mesh.material = material;
  // Select the WebGPU guard, while NullEngine executes the real material/Effect
  // machinery with its original GLSL recipe and no driver/compiler/device.
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  const wrapper = createWebGpuShadowDepthWrapper(material, scene, { doNotInjectCode: true });
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = false;
  await material.forceCompilationAsync(mesh);
  const sub = mesh.subMeshes![0], generators = [{}, {}] as ShadowGenerator[];
  const prepare = (pass: 9 | 10) => {
    engine.currentRenderPassId = pass; scene.incrementRenderId();
    return wrapper.isReadyForSubMesh(sub, ["#define SM_FLOAT 1"], generators[pass === 9 ? 0 : 1], false, pass);
  };
  const settleReady = async (pass: 9 | 10) => {
    for (let i = 0; i < 30; i++) { if (prepare(pass)) return; await setImmediate(); }
    assert.fail("actual material/depth effect did not settle");
  };
  const depth = (pass: 9 | 10) => wrapper.getEffect(sub, generators[pass === 9 ? 0 : 1], pass)!.effect!;
  return { engine, scene, material, mesh, sub, hemi, sun, wrapper, prepare, settleReady, depth,
    dispose() { wrapper.dispose(); scene.dispose(); engine.dispose(); } };
}

for (const kind of ["standard", "pbr"] as const) {
  test(`actual ${kind} refreshes shadow-only light changes across two stable generator passes`, async () => {
    const f = await actualMaterialFixture(kind);
    try {
      await f.settleReady(9); await f.settleReady(10);
      assert.match(f.depth(9).defines, /#define HEMILIGHT0/);
      f.hemi.setEnabled(false); f.sun.setEnabled(true);
      await f.settleReady(9); await f.settleReady(10);
      assert.match(f.depth(9).defines, /#define DIRLIGHT0/);
      assert.match(f.depth(10).defines, /#define DIRLIGHT0/);
      const identities = [f.depth(9), f.depth(10)];
      for (let i = 0; i < 4; i++) {
        assert.equal(f.prepare(9), true); assert.equal(f.prepare(10), true);
        assert.deepEqual([f.depth(9), f.depth(10)], identities);
      }
      f.material.freeze(); f.sun.setEnabled(false); f.hemi.setEnabled(true);
      await f.settleReady(9); await f.settleReady(10);
      assert.match(f.depth(9).defines, /#define HEMILIGHT0/);
      assert.equal(f.material.isFrozen, true, "guard did not change owner policy");
    } finally { f.dispose(); }
  });

  test(`actual ${kind} hot-swapped old effect cannot hide pending shadow replacement`, async () => {
    const f = await actualMaterialFixture(kind);
    let resolve!: () => void;
    const pending = new Promise<void>((yes) => { resolve = yes; });
    const originalCreate = f.engine.createEffect;
    try {
      await f.settleReady(9);
      const oldBase = f.sub.effect;
      f.engine.createEffect = function (this: NullEngine, baseName, attributesNamesOrOptions, ...rest) {
        const options = attributesNamesOrOptions as IEffectCreationOptions;
        return Reflect.apply(originalCreate, this, [baseName, { ...options,
          extraInitializationsAsync: async () => { await pending; await options.extraInitializationsAsync?.(); } }, ...rest]);
      } as typeof f.engine.createEffect;
      f.hemi.setEnabled(false); f.sun.setEnabled(true);
      assert.equal(f.material.allowShaderHotSwapping, true);
      assert.equal(f.prepare(9), false);
      assert.equal(f.sub.effect, oldBase, "pinned material still exposes its old ready effect");
      assert.equal(f.material.allowShaderHotSwapping, true);
      resolve(); await f.settleReady(9);
      assert.match(f.depth(9).defines, /#define DIRLIGHT0/);
    } finally { resolve(); f.engine.createEffect = originalCreate; f.dispose(); }
  });
}

test("pinned baseline: fewer current lights leave a required old shadow LightN unbound", () => {
  const f = fixture();
  try {
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.hemi, f.point);
    assert.equal(f.ready(), true);
    f.mesh.lightSources.splice(0, f.mesh.lightSources.length, f.sun);
    f.mesh._markSubMeshesAsLightDirty();
    assert.equal(f.ready(), true);
    const bound = f.bindCurrentLights();
    assert.equal(bound.get("Light0"), 80);
    assert.equal(bound.has("Light1"), false);
    assert.ok(f.captures[0].uniformBuffersNames!.includes("Light1"));
  } finally { f.dispose(); }
});

test("pinned cache forwards its original undefined buffer entry when required LightN is absent", () => {
  const context = {
    bufferNames: ["Light1"], samplerNames: [], textureNames: [],
    bindGroupLayoutEntries: [[{ binding: 0, visibility: 3, buffer: { type: "uniform" } }]],
    bindGroupLayoutEntryInfo: [[{ name: "Light1" }]],
    bindGroupEntries: [] as { binding: number; resource: { buffer: unknown; size: number } }[][],
  };
  const processor = Object.create(WebGPUShaderProcessor.prototype) as {
    _webgpuProcessingContext: typeof context; _preCreateBindGroupEntries(): void;
  };
  processor._webgpuProcessingContext = context;
  processor._preCreateBindGroupEntries();
  let calls = 0;
  const device = {
    createBindGroup({ entries }: { entries: typeof context.bindGroupEntries[number] }) {
      calls++;
      assert.equal(entries[0].resource.buffer, undefined);
      throw new TypeError("Required buffer member is undefined (terminal GPUDevice fixture)");
    },
  };
  const cache = new WebGPUCacheBindGroups(device as never, {} as never, {} as never);
  cache.disabled = true;
  const oldError = Logger.Error;
  const errors: string[] = [];
  Logger.Error = (message) => { errors.push(String(message)); };
  try {
    assert.throws(() => cache.getBindGroups({ shaderProcessingContext: context,
      bindGroupLayouts: [[{}]] } as never,
      { buffers: {}, resetIsDirty() {} } as never,
      { textureState: 0, updateId: 0, isDirty: true } as never), /Required buffer member/);
    assert.equal(calls, 1);
    assert.ok(errors.some((message) => message.includes('buffer "Light1"')));
  } finally { Logger.Error = oldError; }
});
