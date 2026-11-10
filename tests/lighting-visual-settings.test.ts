import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { InternalTexture, InternalTextureSource } from "@babylonjs/core/Materials/Textures/internalTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { RenderTargetTexture } from "@babylonjs/core/Materials/Textures/renderTargetTexture";
import { CinematicAtmosphere } from "../client/cinematic";
import { VehicleLighting } from "../client/vehicle-lighting";
import { PlayerFlashlight } from "../client/flashlight";
import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";

// Cube allocation is a CPU stand-in. NullEngine hardcodes scaling=1, so expose
// the real AbstractEngine setter's stored scale for resize callback coverage.
// Target collection, pipeline ownership and light gates are pinned Babylon.
class SceneEngine extends NullEngine {
  override getHardwareScalingLevel() {
    return (this as unknown as { _hardwareScalingLevel?: number })._hardwareScalingLevel ?? 1;
  }
  override createRawCubeTexture(...args: Parameters<NullEngine["createRawCubeTexture"]>) {
    const texture = new InternalTexture(this, InternalTextureSource.CubeRaw);
    texture.isCube = texture.isReady = true;
    texture.width = texture.height = texture.baseWidth = texture.baseHeight = args[1];
    return texture;
  }
}

function fixture(t: TestContext, initial = { shadows: false, postProcesses: false }, autoClear = true, webgpu = false) {
  const engine = new SceneEngine(), scene = new Scene(engine);
  if (webgpu) Object.defineProperty(engine, "isWebGPU", { value: true });
  scene.autoClear = autoClear;
  const camera = new FreeCamera("feature observer", new Vector3(0, 2, -8), scene);
  scene.activeCamera = camera;
  const sun = new DirectionalLight("feature sun", Vector3.Down(), scene);
  const atmosphere = new CinematicAtmosphere(scene, camera, sun, initial);
  const car = new VehicleLighting(scene, "vehicle", initial.shadows);
  const torch = new PlayerFlashlight(scene, initial.shadows);
  const caster = MeshBuilder.CreateBox("feature caster", { size: 2 }, scene);
  caster.position.set(0, 1, 5);
  caster.material = new StandardMaterial("feature opaque", scene);
  caster.metadata = { depthCaster: "opaque" };
  const position = new Vector3(0, 1, 0), direction = new Vector3(0, 0, 1);
  const update = (quality = "high") => {
    atmosphere.update({ dt: 0, player: { x: 0, y: 0, z: 0 }, quality,
      daylight: 1, keySource: "sun", cloud: 0, rain: 0 });
    car.updateFromPose(position, direction, true, quality);
    torch.beam.updateFromPose(position, direction, true, quality);
  };
  const shadowTargets = () => {
    // Scene.render registers these pending components before collecting targets.
    (scene as any)._registerTransientComponents();
    const targets: RenderTargetTexture[] = [];
    for (const step of (scene as any)._gatherRenderTargetsStage) step.action(targets);
    return targets;
  };
  t.after(() => { torch.dispose(); car.dispose(); atmosphere.dispose(); scene.dispose(); engine.dispose(); });
  return { engine, scene, camera, sun, atmosphere, car, torch, update, shadowTargets };
}

test("cold disabled features allocate no solar/car/player shadow or postprocess while lights stay usable", (t) => {
  const f = fixture(t);
  for (const [quality, materialGrading] of [["low", true], ["medium", false], ["high", false], ["low", false]] as const) {
    f.update(quality);
    assert.equal(f.sun.getShadowGenerator(), null);
    assert.equal(f.car.light.getShadowGenerator(), null);
    assert.equal(f.torch.beam.light.getShadowGenerator(), null);
    assert.deepEqual(f.shadowTargets(), []);
    assert.equal(f.camera._postProcesses.filter(Boolean).length, 0);
    assert.equal(f.engine.postProcesses.length, 0);
    assert.equal(f.scene.postProcessesEnabled, false);
    assert.equal(f.scene.autoClear, true);
    assert.equal(f.scene.imageProcessingConfiguration.applyByPostProcess, false);
    assert.equal(f.scene.imageProcessingConfiguration.isEnabled, materialGrading,
      "material grading follows the existing base-quality history independently of disabled effects");
    assert.equal(f.car.light.isEnabled(), true);
    assert.equal(f.torch.beam.light.isEnabled(), true);
    assert.equal(f.car.light.intensity, 1.6);
    assert.equal(f.torch.beam.light.intensity, 1.6);
    assert.equal(f.atmosphere.stats.shadowMapSize, 0);
    assert.equal(f.atmosphere.stats.selectionMeshVisits, 0);
  }
});

test("cold WebGPU Ultra preserves its previous warmed colour path without allocating a pipeline", (t) => {
  const f = fixture(t, { shadows: false, postProcesses: false }, true, true);
  f.update("low");
  assert.equal(f.scene.imageProcessingConfiguration.isEnabled, false);
  assert.equal(f.scene.imageProcessingConfiguration.applyByPostProcess, false);
  assert.equal(f.engine.postProcesses.length, 0);
});

test("master OFF collects no shadow pass, retains only one owner and does not resize or select disabled maps", (t) => {
  const f = fixture(t, { shadows: true, postProcesses: false });
  f.update();
  const generators = [f.sun, f.car.light, f.torch.beam.light]
    .map(light => light.getShadowGenerator() as ShadowGenerator);
  const maps = generators.map(generator => generator.getShadowMap());
  assert.equal(new Set(f.shadowTargets()).size, 3);
  const visits = f.atmosphere.stats.selectionMeshVisits;
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
  f.car.setShadowsEnabled(false); f.torch.setShadowsEnabled(false);
  for (const quality of ["low", "medium", "high"]) {
    f.update(quality);
    assert.deepEqual(f.shadowTargets(), []);
    assert.deepEqual(generators.map(generator => generator.getShadowMap()), maps);
    assert.deepEqual(generators.map(generator => generator.mapSize), [2048, 512, 512]);
    assert.equal(f.atmosphere.stats.selectionMeshVisits, visits);
    assert.equal(f.atmosphere.stats.shadowSource, "none");
    assert.equal(f.atmosphere.stats.shadowCasters, 0);
    assert.equal(f.atmosphere.stats.shadowCandidates, 0);
    assert.equal(f.car.light.isEnabled(), true);
    assert.equal(f.torch.beam.light.isEnabled(), true);
  }
  f.atmosphere.setVisualFeatures({ shadows: true, postProcesses: false });
  f.car.setShadowsEnabled(true); f.torch.setShadowsEnabled(true); f.update();
  assert.equal(new Set(f.shadowTargets()).size, 3);
  assert.deepEqual([f.sun, f.car.light, f.torch.beam.light].map(light => light.getShadowGenerator()), generators);
  assert.deepEqual(generators.map(generator => generator.getShadowMap()), maps);
  assert.ok(f.atmosphere.stats.selectionMeshVisits > visits, "reenabling refreshes current casters immediately");
  f.atmosphere.dispose(); f.car.dispose(); f.torch.dispose();
  assert.deepEqual(f.shadowTargets(), []);
});

test("explicit post override works on Low and retains one inactive chain with correct colour clearing", async (t) => {
  const f = fixture(t);
  f.update("low");
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true }); f.update("low");
  const posts = f.camera._postProcesses.filter(post => post !== null);
  assert.equal(posts.length, 5);
  const count = f.engine.postProcesses.length;
  const activeClear = f.scene.autoClear;
  for (let i = 0; i < 4; i++) {
    f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false }); f.update("high");
    assert.equal(f.scene.postProcessesEnabled, false);
    assert.equal(f.scene.autoClear, true);
    assert.equal(f.scene.postProcessManager._prepareFrame(), false);
    let activations = 0;
    const observers = posts.map(post => post.onActivateObservable.add(() => activations++));
    f.scene.postProcessManager._finalizeFrame();
    assert.equal(activations, 0, "Babylon does not execute the retained chain while OFF");
    posts.forEach((post, index) => post.onActivateObservable.remove(observers[index]));
    assert.equal((await f.atmosphere.captureDiagnostics()).status, "no-pipeline");
    assert.equal(f.atmosphere.stats.bloomWeight, 0);
    assert.equal(f.engine.postProcesses.length, count);
    f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true }); f.update("low");
    assert.equal(f.scene.postProcessesEnabled, true);
    assert.equal(f.scene.autoClear, activeClear);
    assert.deepEqual(f.camera._postProcesses.filter(Boolean), posts);
  }
  f.atmosphere.dispose();
  assert.equal(f.camera._postProcesses.filter(Boolean).length, 0);
  assert.equal(f.scene.postProcessesEnabled, true);
  assert.equal(f.scene.autoClear, true);
});

test("OFF resize defers only the owned bloom callback and ON catches current scale without another pipeline", async (t) => {
  const f = fixture(t);
  let foreignResizes = 0;
  f.engine.onResizeObservable.add(() => foreignResizes++);
  f.update("low");
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  const pipeline = (f.atmosphere as any).pipeline;
  const resizeObserver = pipeline._resizeObserver;
  const observers = [...f.engine.onResizeObservable.observers];
  const posts = [...f.camera._postProcesses];
  const kernel = pipeline.bloom.kernel;
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
  f.engine.setHardwareScalingLevel(2); f.engine.onResizeObservable.notifyObservers(f.engine);
  f.engine.setHardwareScalingLevel(1.3); f.engine.onResizeObservable.notifyObservers(f.engine);
  assert.equal(foreignResizes, 2);
  assert.equal(pipeline.bloom.kernel, kernel, "disabled blur is not updated/recompiled by resize");
  assert.equal(pipeline.automaticBuild, false);
  assert.deepEqual(f.engine.onResizeObservable.observers, observers);
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  assert.equal((f.atmosphere as any).pipeline, pipeline);
  assert.equal(pipeline._resizeObserver, resizeObserver);
  assert.ok(Math.abs(pipeline.bloom.kernel - 32 / 1.3) < 1e-8);
  assert.deepEqual(f.camera._postProcesses, posts);
  assert.equal(pipeline.automaticBuild, true);
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
  f.atmosphere.dispose();
  f.engine.onResizeObservable.notifyObservers(f.engine);
  assert.equal(foreignResizes, 3, "foreign observer survives owner disposal");
  // Babylon marks removed observers immediately, then splices them next turn.
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(f.engine.onResizeObservable.observers.includes(resizeObserver), false);
});

test("failed first postprocess preparation releases its partial owner and can restore OFF before a new ON", (t) => {
  const f = fixture(t); f.update("low");
  const originalPostCount = f.engine.postProcesses.length;
  const failure = new Error("owned preparation failed");
  t.mock.method(DefaultRenderingPipeline.prototype, "prepare", () => { throw failure; });
  assert.throws(() => f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true }),
    error => error === failure);
  assert.equal((f.atmosphere as any).pipeline, undefined);
  assert.equal(f.scene.postProcessesEnabled, false);
  assert.equal(f.scene.autoClear, true);
  assert.equal(f.engine.postProcesses.length, originalPostCount);
  assert.equal(f.camera._postProcesses.filter(Boolean).length, 0);
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
  t.mock.restoreAll();
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  assert.equal(f.scene.postProcessesEnabled, true);
  assert.equal(f.camera._postProcesses.filter(Boolean).length, 5);
});

test("disposing an active or retained pipeline restores an originally disabled scene clear", (t) => {
  for (const active of [true, false]) {
    const f = fixture(t, { shadows: false, postProcesses: false }, false);
    f.update("low");
    f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
    if (!active) f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
    assert.equal(f.scene.autoClear, false);
    f.atmosphere.dispose();
    assert.equal(f.scene.autoClear, false, "Babylon's unconditional true must not replace the pre-owned state");
  }
});

test("disposing a retained OFF pipeline preserves a later foreign false clear override", (t) => {
  const f = fixture(t);
  f.update("low");
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
  assert.equal(f.scene.autoClear, true);
  f.scene.autoClear = false; // Another scene owner changed the value after our last write.
  f.atmosphere.dispose();
  assert.equal(f.scene.autoClear, false);
});

test("WebGL Low post ON/OFF preserves material grading, exposure updates and the five-pass chain", async (t) => {
  const f = fixture(t); f.update("low");
  const config = f.scene.imageProcessingConfiguration;
  assert.equal(config.isEnabled, true);
  config.exposure = 1.7;
  config.contrast = 1.2;
  let foreignNotifications = 0;
  const foreignObserver = config.onUpdateParameters.add(() => foreignNotifications++);
  const foreignCallback = foreignObserver.callback;
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  assert.equal(config.isEnabled, true, "post toggle must not disable the material colour path");
  assert.equal(config.applyByPostProcess, false);
  assert.equal(config.exposure, 1.7);
  assert.equal(config.contrast, 1.2);
  const pipeline = (f.atmosphere as any).pipeline;
  const ownedObserver = pipeline._imageProcessingConfigurationObserver;
  const posts = f.camera._postProcesses.filter(post => post !== null);
  assert.equal(posts.length, 5);
  assert.ok(posts.every(post => post.getEffectName() !== "imageProcessing"));
  assert.equal(pipeline.imageProcessingEnabled, false);
  assert.equal(pipeline.bloom._downscale._exposure, 1.7);
  const beforeExposure = foreignNotifications;
  config.exposure = 1.9;
  assert.equal(foreignNotifications, beforeExposure + 1);
  assert.equal(pipeline.bloom._downscale._exposure, 1.9);
  assert.deepEqual(f.camera._postProcesses.filter(Boolean), posts);
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
  config.exposure = 2.1;
  assert.equal(config.isEnabled, true);
  assert.equal(pipeline.bloom._downscale._exposure, 1.9, "OFF defers its own exposure work");
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  assert.equal(config.isEnabled, true);
  assert.equal(pipeline.bloom._downscale._exposure, 2.1);
  assert.equal(pipeline.imageProcessingEnabled, false);
  assert.deepEqual(f.camera._postProcesses.filter(Boolean), posts);
  assert.equal(foreignObserver.callback, foreignCallback);
  const originalOwnedCallback = (f.atmosphere as any).pipelineImageProcessing.original;
  const disposePipeline = pipeline.dispose.bind(pipeline);
  t.mock.method(pipeline, "dispose", () => {
    assert.equal(ownedObserver.callback, originalOwnedCallback,
      "restore only the owned callback before Babylon removes its observer");
    disposePipeline();
  });
  f.atmosphere.dispose();
  assert.equal(config.isEnabled, true);
  assert.equal(f.camera._postProcesses.filter(Boolean).length, 0);
  assert.equal(foreignObserver.callback, foreignCallback);
  const beforeDisposeUpdate = foreignNotifications;
  config.exposure = 2.3;
  assert.equal(foreignNotifications, beforeDisposeUpdate + 1);
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(config.onUpdateParameters.observers.includes(ownedObserver), false);
});

test("WebGL higher-quality selection preserves its legacy grading policy independently of a post toggle", (t) => {
  const f = fixture(t); f.update("low");
  const config = f.scene.imageProcessingConfiguration;
  assert.equal(config.isEnabled, true);
  f.update("medium");
  assert.equal(config.isEnabled, false, "the existing Medium/High base colour policy is independent of FXAA/bloom");
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  assert.equal(config.isEnabled, false);
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: false });
  f.update("low");
  assert.equal(config.isEnabled, false, "preserve the previous Medium→Low colour history");
  config.isEnabled = true; // An explicit later material-grading change remains its owner's choice.
  f.atmosphere.setVisualFeatures({ shadows: false, postProcesses: true });
  assert.equal(config.isEnabled, true);
  assert.equal((f.atmosphere as any).pipeline.imageProcessingEnabled, false);
});
