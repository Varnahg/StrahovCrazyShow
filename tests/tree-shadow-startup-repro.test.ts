import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { VehicleLighting } from "../client/vehicle-lighting";
import { TreeWindPlugin } from "../client/tree-wind";
import { TreeSeasonMaterialPlugin } from "../client/tree-season-material";
import { createWebGpuShadowDepthWrapper } from "../client/webgpu-shadow-readiness";
import "../client/render-shaders";

/** Real PBR/Effect/shadow renderer state machines, with CPU-only driver IO.
 * Select the WebGPU wrapper while preserving NullEngine's GLSL processing. */
class ProcessingEngine extends NullEngine {
  programs = 0;
  constructor() {
    super(); this._webGLVersion = 2; this._shaderPlatformName = "WEBGL2";
    this.getCaps().standardDerivatives = true;
    this._features.supportShadowSamplers = true;
  }
  override createShaderProgram(...args: Parameters<NullEngine["createShaderProgram"]>) {
    this.programs++; return super.createShaderProgram(...args);
  }
}

async function fixture(options: { filter?: number; secondFilter?: number; standalone?: boolean } = {}) {
  const engine = new ProcessingEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("fixed tree view", new Vector3(0, 2, -5), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const mesh = MeshBuilder.CreateBox("tree foliage", { size: 2 }, scene);
  mesh.position.y = 1; mesh.receiveShadows = true;
  const material = new PBRMaterial("photographic foliage", scene); mesh.material = material;
  const source = RawTexture.CreateRGBATexture(new Uint8Array([24, 180, 60, 255]), 1, 1, scene);
  source.hasAlpha = true; source.getInternalTexture()!.isReady = true;
  material.albedoTexture = source;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
  material.alphaCutOff = .5; material.backFaceCulling = false; material.twoSidedLighting = true;
  material.subSurface.isTranslucencyEnabled = true; material.subSurface.translucencyIntensity = .12;
  material.subSurface.useAlbedoToTintTranslucency = true;
  const colors = new Float32Array(mesh.getTotalVertices() * 4).fill(1);
  for (let i = 3; i < colors.length; i += 4) colors[i] = 32768 / 65535;
  mesh.setVerticesData(VertexBuffer.ColorKind, colors); mesh.hasVertexAlpha = false;
  new TreeWindPlugin(material, { time: 0, x: 1, z: 0 });
  new TreeSeasonMaterialPlugin(material, { tintDirectTranslucency: true });
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  const wrapper = createWebGpuShadowDepthWrapper(material, scene, { standalone: options.standalone });
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = false;
  material.shadowDepthWrapper = wrapper;
  const beam = new VehicleLighting(scene, "player");
  beam.updateFromPose(camera.position, new Vector3(0, -.15, 1), true, "low");
  const shadow = beam.light.getShadowGenerator()! as ShadowGenerator;
  assert.equal(shadow.filter, ShadowGenerator.FILTER_PCF, "CPU fixture must not silently fall back to Poisson");
  if (options.filter !== undefined) shadow.filter = options.filter;
  const secondBeam = options.secondFilter === undefined ? undefined : new VehicleLighting(scene, "player");
  secondBeam?.updateFromPose(camera.position, new Vector3(0, -.15, 1), true, "low");
  const secondShadow = secondBeam?.light.getShadowGenerator() as ShadowGenerator | undefined;
  if (secondShadow) secondShadow.filter = options.secondFilter!;
  const map = shadow.getShadowMap()!, pass = map.renderPassId;
  assert.ok(map.renderList!.includes(mesh));
  const observed: { colorWrite: boolean; pass: number; baseDepth: boolean; depth: Effect | null }[] = [];
  const observe = () => observed.push({ colorWrite: engine.getColorWrite(), pass: engine.currentRenderPassId,
    baseDepth: /^#define DEPTHPREPASS$/m.test(mesh.subMeshes[0]._getDrawWrapper(pass)?.defines?.toString() ?? ""),
    depth: wrapper.getEffect(mesh.subMeshes[0], shadow, pass)?.effect ?? null });
  map.onBeforeRenderObservable.add(() => { assert.equal(engine.getColorWrite(), shadow.filter !== ShadowGenerator.FILTER_PCF); assert.equal(engine.currentRenderPassId, pass); });
  map.onAfterUnbindObservable.add(() => assert.equal(engine.getColorWrite(), true));
  const check = () => {
    engine.currentRenderPassId = camera.renderPassId; scene.incrementRenderId();
    const ready = mesh.isReady(true); observe(); return ready;
  };
  const render = async () => { scene.render(); observe(); await turn(); };
  for (let i = 0; i < 12; i++) await render();
  return { engine, scene, camera, mesh, material, wrapper, beam, shadow, map, pass, observed, check, render, secondShadow,
    dispose() { wrapper.dispose(); secondBeam?.dispose(); beam.dispose(); scene.dispose(); engine.dispose(); } };
}

test("PCF tree startup checks and actual shadow renders retain one stable prepared depth effect", async () => {
  const f = await fixture();
  try {
    const initialPrograms = f.engine.programs;
    const initialDepth = f.wrapper.getEffect(f.mesh.subMeshes[0], f.shadow, f.pass)!.effect!;
    assert.ok(initialDepth?.isReady());
    for (let i = 0; i < 8; i++) {
      f.check(); await turn(); await f.render();
    }
    assert.equal(f.engine.programs, initialPrograms, JSON.stringify(f.observed.map(row => ({
      colorWrite: row.colorWrite, pass: row.pass, baseDepth: row.baseDepth, depth: row.depth?.uniqueId, disposed: row.depth?.isDisposed,
    }))));
    assert.equal(f.wrapper.getEffect(f.mesh.subMeshes[0], f.shadow, f.pass)!.effect, initialDepth);
    assert.equal(f.engine.getColorWrite(), true);
  } finally { f.dispose(); }
});

test("PCSS and simultaneous PCF/PCSS owners keep stable depth effects without leaking color-write state", async () => {
  for (const options of [{ filter: ShadowGenerator.FILTER_PCSS }, { secondFilter: ShadowGenerator.FILTER_PCSS }]) {
    const f = await fixture(options);
    try {
      const shadows = [f.shadow, ...(f.secondShadow ? [f.secondShadow] : [])];
      const depth = () => shadows.map(shadow => f.wrapper.getEffect(f.mesh.subMeshes[0], shadow, shadow.getShadowMap()!.renderPassId)!.effect);
      const initial = depth(), programs = f.engine.programs;
      for (let i = 0; i < 8; i++) { f.check(); await turn(); await f.render(); }
      assert.equal(f.engine.programs, programs);
      assert.deepEqual(depth(), initial);
      assert.equal(f.engine.getColorWrite(), true);
    } finally { f.dispose(); }
  }
});

test("filter changes PCF to PCSS and back converge before repeated startup checks", async () => {
  const f = await fixture();
  try {
    for (const filter of [ShadowGenerator.FILTER_PCSS, ShadowGenerator.FILTER_PCF]) {
      f.shadow.filter = filter;
      for (let i = 0; i < 6; i++) { f.check(); await turn(); await f.render(); }
      const programs = f.engine.programs;
      for (let i = 0; i < 6; i++) { f.check(); await turn(); await f.render(); }
      assert.equal(f.engine.programs, programs);
      assert.equal(f.shadow.filter, filter);
      assert.equal(f.engine.getColorWrite(), true);
    }
  } finally { f.dispose(); }
});

for (const standalone of [false, true])
  for (const initialColorWrite of [false, true])
    test(`PCF readiness restores caller colorWrite=${initialColorWrite} and calls base once (standalone=${standalone})`, async () => {
      const f = await fixture({ standalone });
      try {
        const prepare = f.material.isReadyForSubMesh;
        let calls = 0;
        f.material.isReadyForSubMesh = function (...args) {
          calls++; assert.equal(f.engine.getColorWrite(), false);
          assert.equal(f.engine.currentRenderPassId, f.pass);
          return prepare.apply(this, args);
        };
        f.engine.currentRenderPassId = f.pass; f.scene.incrementRenderId(); f.engine.setColorWrite(initialColorWrite);
        assert.equal(f.shadow.isReady(f.mesh.subMeshes[0], false, false), true);
        assert.equal(calls, 1);
        assert.equal(f.engine.getColorWrite(), initialColorWrite);
        assert.equal(f.engine.currentRenderPassId, f.pass);
      } finally { f.dispose(); }
    });

for (const outcome of ["false", "throw", "wrapper-dispose", "scene-dispose", "engine-dispose"] as const)
  for (const initialColorWrite of [false, true])
    test(`PCF ${outcome} preserves caller colorWrite=${initialColorWrite}`, async () => {
      const f = await fixture(), failure = new Error("controlled base readiness failure");
      try {
        f.material.isReadyForSubMesh = () => {
          assert.equal(f.engine.getColorWrite(), false);
          if (outcome === "throw") throw failure;
          if (outcome === "wrapper-dispose") f.wrapper.dispose();
          if (outcome === "scene-dispose") f.scene.dispose();
          if (outcome === "engine-dispose") f.engine.dispose();
          return outcome !== "false";
        };
        f.engine.currentRenderPassId = f.pass; f.engine.setColorWrite(initialColorWrite);
        const ready = () => f.shadow.isReady(f.mesh.subMeshes[0], false, false);
        if (outcome === "throw") assert.throws(ready, error => error === failure);
        else assert.equal(ready(), false);
        assert.equal(f.engine.getColorWrite(), initialColorWrite);
      } finally { f.dispose(); }
    });

test("PCF reentrant wrong-pass and draw-override guards perform no writes and preserve the outer lease", async () => {
  const f = await fixture();
  try {
    const sub = f.mesh.subMeshes[0], prepare = f.material.isReadyForSubMesh;
    const setColorWrite = f.engine.setColorWrite.bind(f.engine), writes: boolean[] = [];
    f.engine.setColorWrite = value => { writes.push(value); setColorWrite(value); };
    f.material.isReadyForSubMesh = function (...args) {
      assert.equal(f.engine.getColorWrite(), false);
      const before = writes.length;
      f.engine.currentRenderPassId = f.camera.renderPassId;
      assert.equal(f.wrapper.isReadyForSubMesh(sub, [], f.shadow, false, f.pass), false);
      f.engine.currentRenderPassId = f.pass;
      const override = sub._getDrawWrapper(f.pass)!;
      sub._setMainDrawWrapperOverride(override);
      try { assert.equal(f.wrapper.isReadyForSubMesh(sub, [], f.shadow, false, f.pass), false); }
      finally { sub._setMainDrawWrapperOverride(null); }
      assert.equal(writes.length, before);
      assert.equal(f.engine.getColorWrite(), false);
      return prepare.apply(this, args);
    };
    f.engine.currentRenderPassId = f.pass; f.scene.incrementRenderId();
    assert.equal(f.shadow.isReady(sub, false, false), true);
    assert.deepEqual(writes, [false, true]);
    assert.equal(f.engine.getColorWrite(), true);
  } finally { f.dispose(); }
});
