import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { createWebGpuShadowDepthWrapper } from "../client/webgpu-shadow-readiness";

/** Actual PBR readiness/Effect/depth wrapper machinery, no device or rendered
 * pixels. Only NullEngine terminal IO and native generator initialization data. */
async function fixture(options: { standalone?: boolean } = {}) {
  const engine = new NullEngine(), scene = new Scene(engine);
  new FreeCamera("same camera", new Vector3(0, 2, -4), scene);
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const mesh = MeshBuilder.CreateBox("same leaf caster", {}, scene), material = new PBRMaterial("shared leaves", scene);
  mesh.material = material; material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  material.alphaCutOff = 0.5;
  // Choose the production WebGPU wrapper while keeping actual NullEngine GLSL
  // preparation/Effects. This is neither native WGSL nor graphical acceptance.
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  const wrapper = createWebGpuShadowDepthWrapper(material, scene, { doNotInjectCode: true, ...options });
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = false;
  const generator = Object.create(ShadowGenerator.prototype) as ShadowGenerator;
  Reflect.set(generator, "_filter", ShadowGenerator.FILTER_PCF);
  const sub = mesh.subMeshes![0], setters: boolean[] = [], nativeSet = engine.setColorWrite;
  engine.setColorWrite = function (value: boolean) { setters.push(value); return nativeSet.call(this, value); };
  const externalColor = (value: boolean) => nativeSet.call(engine, value);
  engine.currentRenderPassId = 9;
  await material.forceCompilationAsync(mesh);
  const prepare = () => { scene.incrementRenderId(); return wrapper.isReadyForSubMesh(sub, ["#define SM_FLOAT 1"], generator, false, 9); };
  const settle = async () => {
    for (let attempt = 0; attempt < 40; attempt++) { if (prepare()) return; await setImmediate(); }
    assert.fail("actual PBR/depth readiness did not settle");
  };
  const base = () => sub._getDrawWrapper(9)!.effect!;
  const depth = () => wrapper.getEffect(sub, generator, 9)!.effect!;
  return { engine, scene, mesh, material, sub, generator, wrapper, setters, externalColor, prepare, settle, base, depth,
    dispose() { wrapper.dispose(); engine.setColorWrite = nativeSet; scene.dispose(); engine.dispose(); } };
}

test("actual PCF readiness keeps the same PBR DEPTHPREPASS/base/depth identities across external true/false after warming", async context => {
  const f = await fixture();
  try {
    const rows = [];
    for (const color of [true, false, true, false, true]) {
      f.externalColor(color); await f.settle();
      rows.push({ color, depthPrepass: /#define DEPTHPREPASS\b/.test(f.base().defines), base: f.base(), depth: f.depth() });
      assert.equal(f.engine.getColorWrite(), color, "exact outer bool restored");
      assert.equal(f.engine.currentRenderPassId, 9);
    }
    context.diagnostic(JSON.stringify({ scope: "CPU actual Effect identities, not GPU/FPS", rows: rows.map(row => ({
      color: row.color, depthPrepass: row.depthPrepass, baseID: row.base.uniqueId, depthID: row.depth.uniqueId,
      depthDisposed: row.depth.isDisposed })) }));
    assert.equal(new Set(rows.map(row => row.base)).size, 1, "PCF base variant is independent of outer main color state");
    assert.equal(new Set(rows.map(row => row.depth)).size, 1, "derived depth is not disposed/recreated by readiness context");
    assert.equal(rows.every(row => row.depthPrepass && !row.depth.isDisposed), true);
  } finally { f.dispose(); }
});

test("PCF scope encloses actual base, native super/standalone and final depth selection; already false makes zero setter calls", async () => {
  for (const standalone of [false, true]) {
    const f = await fixture({ standalone });
    const nativeSuper = ShadowDepthWrapper.prototype.isReadyForSubMesh, nativeBase = f.material.isReadyForSubMesh, nativeGet = f.wrapper.getEffect;
    try {
      await f.settle();
      const seen: { role: string; color: boolean; pass: number }[] = [];
      const note = (role: string) => seen.push({ role, color: f.engine.getColorWrite(), pass: f.engine.currentRenderPassId });
      f.material.isReadyForSubMesh = function (...args) { note("base"); return Reflect.apply(nativeBase, this, args); };
      ShadowDepthWrapper.prototype.isReadyForSubMesh = function (...args) { note("super"); return Reflect.apply(nativeSuper, this, args); };
      f.wrapper.getEffect = function (...args) { note("depth"); return Reflect.apply(nativeGet, this, args); };
      for (const outer of [true, false]) {
        f.externalColor(outer); f.setters.length = 0; seen.length = 0;
        assert.equal(f.prepare(), true);
        assert.deepEqual(f.setters, outer ? [false, true] : []);
        assert.equal(f.engine.getColorWrite(), outer);
        assert.equal(seen.filter(value => value.role === "base").length, 1, "standalone base refresh is not duplicated");
        assert.equal(seen.filter(value => value.role === "super").length, 1);
        assert.equal(seen.filter(value => value.role === "depth").length, 1);
        assert.equal(seen.every(value => value.color === false && value.pass === 9), true);
      }
    } finally {
      ShadowDepthWrapper.prototype.isReadyForSubMesh = nativeSuper;
      f.material.isReadyForSubMesh = nativeBase; f.wrapper.getEffect = nativeGet; f.dispose();
    }
  }
});
test("nested PCF readiness shares the false context without inner color setters", async () => {
  const f = await fixture();
  try {
    await f.settle(); const native = f.material.isReadyForSubMesh; let nesting = false, calls = 0;
    f.material.isReadyForSubMesh = function (...args) {
      calls++; assert.equal(f.engine.getColorWrite(), false);
      if (!nesting) {
        nesting = true;
        try { assert.equal(f.wrapper.isReadyForSubMesh(f.sub, ["#define SM_FLOAT 1"], f.generator, false, 9), true); }
        finally { nesting = false; }
      }
      return Reflect.apply(native, this, args);
    };
    f.externalColor(true); f.setters.length = 0;
    assert.equal(f.prepare(), true); assert.equal(calls, 2);
    assert.deepEqual(f.setters, [false, true]); assert.equal(f.engine.getColorWrite(), true);
  } finally { f.dispose(); }
});
test("native non-PCF filters preserve both incoming color states without any wrapper setter", async () => {
  const f = await fixture();
  try {
    for (const filter of [ShadowGenerator.FILTER_NONE, ShadowGenerator.FILTER_POISSONSAMPLING,
      ShadowGenerator.FILTER_PCSS, ShadowGenerator.FILTER_EXPONENTIALSHADOWMAP,
      ShadowGenerator.FILTER_BLUREXPONENTIALSHADOWMAP, ShadowGenerator.FILTER_CLOSEEXPONENTIALSHADOWMAP,
      ShadowGenerator.FILTER_BLURCLOSEEXPONENTIALSHADOWMAP]) {
      assert.equal(Number.isInteger(filter), true, "fixture must use a real pinned native filter enum");
      Reflect.set(f.generator, "_filter", filter); assert.equal(f.generator.usePercentageCloserFiltering, false);
      for (const color of [true, false]) {
        f.externalColor(color); f.setters.length = 0; await f.settle();
        assert.equal(f.engine.getColorWrite(), color); assert.deepEqual(f.setters, []);
        assert.equal(/#define DEPTHPREPASS\b/.test(f.base().defines), !color);
      }
    }
  } finally { f.dispose(); }
});
test("original false/throw and synchronous wrapper/mesh/scene/engine retirement always restore outer PCF color state", async () => {
  for (const outcome of ["false", "throw", "wrapper-dispose", "mesh-dispose", "scene-dispose", "engine-dispose"] as const) {
    const f = await fixture();
    try {
      await f.settle(); const primary = new Error("original material readiness failure");
      f.material.isReadyForSubMesh = () => {
        assert.equal(f.engine.getColorWrite(), false);
        if (outcome === "throw") throw primary;
        if (outcome === "wrapper-dispose") f.wrapper.dispose();
        if (outcome === "mesh-dispose") f.mesh.dispose();
        if (outcome === "scene-dispose") f.scene.dispose();
        if (outcome === "engine-dispose") f.engine.dispose();
        return outcome !== "false";
      };
      f.externalColor(true); f.setters.length = 0;
      if (outcome === "throw") assert.throws(f.prepare, error => error === primary);
      else assert.equal(f.prepare(), false);
      assert.equal(f.engine.getColorWrite(), true); assert.deepEqual(f.setters, [false, true]);
      assert.equal(f.engine.currentRenderPassId, 9);
      f.externalColor(false); f.setters.length = 0;
      if (outcome === "throw") assert.throws(f.prepare, error => error === primary);
      else assert.equal(f.prepare(), false);
      assert.equal(f.engine.getColorWrite(), false); assert.deepEqual(f.setters, []);
    } finally { f.dispose(); }
  }
});
test("retired/wrong-pass/bound-override/foreign-material guards return before color state is touched", async () => {
  for (const kind of ["released", "pass", "override", "material"] as const) {
    const f = await fixture();
    try {
      await f.settle();
      if (kind === "released") f.wrapper.dispose();
      if (kind === "pass") f.engine.currentRenderPassId = 10;
      if (kind === "override") f.sub._setMainDrawWrapperOverride(f.wrapper.getEffect(f.sub, f.generator, 9)!);
      if (kind === "material") f.mesh.material = new PBRMaterial("foreign", f.scene);
      f.externalColor(true); f.setters.length = 0;
      assert.equal(f.prepare(), false); assert.equal(f.engine.getColorWrite(), true); assert.deepEqual(f.setters, []);
    } finally { f.sub._setMainDrawWrapperOverride(null); f.dispose(); }
  }
});
test("PCF alpha-cutoff and light changes still invalidate stale effects, then converge to stable depth identities", async () => {
  const f = await fixture();
  try {
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 128]), 1, 1, f.scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    texture.hasAlpha = true; f.material.albedoTexture = texture;
    assert.equal(f.prepare(), false, "an unready alpha texture still blocks the original material readiness");
    // NullEngine creates raw metadata but never completes a GPU upload. Only
    // that terminal IO completion is supplied; native texture checks stay live.
    texture.getInternalTexture()!.isReady = true;
    await f.settle(); const original = f.depth(); assert.match(f.base().defines, /#define ALPHATEST\b/);
    f.material.alphaCutOff = 0.25; await f.settle();
    assert.notEqual(f.depth(), original); assert.match(f.depth().defines, /#define ALPHATESTVALUE 0.25/);
    const hemi = f.scene.lights[0]; hemi.setEnabled(false);
    new DirectionalLight("sun replacement", Vector3.Down(), f.scene); await f.settle();
    assert.match(f.depth().defines, /#define DIRLIGHT0/); assert.doesNotMatch(f.depth().defines, /#define HEMILIGHT0/);
    const current = f.depth();
    for (const color of [true, false, true]) { f.externalColor(color); assert.equal(f.prepare(), true); assert.equal(f.depth(), current); }
    assert.equal(f.material.allowShaderHotSwapping, true); assert.equal(f.material.alphaCutOff, 0.25);
    assert.equal(f.material.albedoTexture, texture);
  } finally { f.dispose(); }
});
