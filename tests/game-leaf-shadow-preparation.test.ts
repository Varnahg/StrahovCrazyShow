import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Script } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { InternalTexture, InternalTextureSource } from "@babylonjs/core/Materials/Textures/internalTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Light } from "@babylonjs/core/Lights/light";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { AuthoredLightPreparation } from "../client/authored-light-preparation";
import { configureTreeMaterial } from "../client/tree-appearance";
import { TreeWindPlugin } from "../client/tree-wind";
import { createWebGpuShadowDepthWrapper } from "../client/webgpu-shadow-readiness";
import { VehicleLighting } from "../client/vehicle-lighting";
import { PlayerFlashlight } from "../client/flashlight";
import { StableLightState } from "../client/stable-light-state";
import { GltfLightBudget } from "../client/gltf-light-budget";
import { applyArtLighting } from "../client/art-lighting";
import { selectLightingPreview } from "../client/lighting-preview";
import { prepareLightVariants } from "../client/light-preparation";
import { prepareRenderQualities } from "../client/render-quality-preparation";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { MANUAL_HARDWARE_SCALING, type RenderQuality } from "../shared/render-quality";
import { sunState, moonState } from "../shared/weather";
import { readGameSource } from "./helpers/game-source";

const source = readGameSource();
const names = ["prepareLighting", "prepareLightingVariants", "isMeshReadyForCamera", "updateRenderEnvironment",
  "applyPreparationView", "preparationPosition", "refreshStartupPreparationView", "startupPreparationCoverage"];
const code = ts.transpileModule(`class Subject {${names.map(name => source.member(name).getText(source.source)).join("\n")}}`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const make = new Script(`(env)=>{const {AuthoredLightPreparation,PlayerFlashlight,Vector3,MeshBuilder,prepareLightVariants,
  prepareRenderQualities,MANUAL_HARDWARE_SCALING,arePreparationEffectsReady,selectLightingPreview,applyArtLighting,performance,window,document}=env;
  ${code};return Subject;}`).runInThisContext();

function fixture(t: TestContext, requested: "medium" | "high" = "medium") {
  const engine = new NullEngine({ renderWidth: 128, renderHeight: 128, textureSize: 1, deterministicLockstep: false, lockstepMaxSteps: 4 });
  Reflect.get(engine, "_features").supportShadowSamplers = true; // actual WebGPU capability, not NullEngine WebGL1 fallback
  engine.createDepthStencilTexture = function (this: NullEngine, size: any, options: any) {
    const texture = new InternalTexture(this, InternalTextureSource.DepthStencil);
    texture.width = texture.baseWidth = typeof size === "number" ? size : size.width;
    texture.height = texture.baseHeight = typeof size === "number" ? size : size.height;
    texture.isReady = true; texture.format = options?.depthTextureFormat ?? 14;
    return texture; // terminal allocation IO only; real ShadowGenerator retains filter/recipe/readiness
  } as typeof engine.createDepthStencilTexture;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const camera = new FreeCamera("unchanged accepted foot camera", new Vector3(0, 4.52, 8), scene);
  camera.setTarget(new Vector3(0, 1, 0)); scene.activeCamera = camera;
  const oldGet = engine.getColorWrite, oldSet = engine.setColorWrite, oldCreate = engine.createEffect;
  Reflect.set(engine, "_cacheRenderPipeline", { setWriteMask() {} });
  Reflect.set(engine, "_colorWriteLocal", true); // actual WebGPUEngine constructor default
  engine.getColorWrite = WebGPUEngine.prototype.getColorWrite;
  engine.setColorWrite = WebGPUEngine.prototype.setColorWrite;
  engine.createEffect = WebGPUEngine.prototype.createEffect as typeof engine.createEffect;
  const wind = { time: 0, x: 0, z: 1.8 }, wrappers: ReturnType<typeof createWebGpuShadowDepthWrapper>[] = [];
  const leafMaterial = (name: string) => {
    const material = new PBRMaterial(name, scene);
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([100, 160, 80, 128]), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
    texture.hasAlpha = true; texture.getInternalTexture()!.isReady = true; // terminal texture upload IO only
    material.albedoTexture = texture; assert.equal(configureTreeMaterial(material), true);
    new TreeWindPlugin(material, wind);
    Reflect.set(engine, "_isWebGPU", true);
    const wrapper = createWebGpuShadowDepthWrapper(material, scene);
    Reflect.set(engine, "_isWebGPU", false);
    material.shadowDepthWrapper = wrapper; wrappers.push(wrapper);
    return material;
  };
  const shared = leafMaterial("shared authored leaves");
  const leaf = (name: string, z: number, material = shared) => {
    const mesh = MeshBuilder.CreateBox(name, { size: 2 }, scene); mesh.position.set(0, 2, z);
    mesh.material = material; mesh.receiveShadows = true;
    mesh.metadata = { vegetation: "tree", windDeformed: true, depthCaster: "alpha-test", sourceTreeModel: name, detailLevel: 0 };
    mesh.computeWorldMatrix(true); return mesh;
  };
  // First same-material/layout/light member is visible to the foot camera but
  // BEHIND the actual forward car beam. It cannot warm a derived car shadow.
  const far = leaf("far first duplicate behind car beam", -45); far.position.x = 0; far.computeWorldMatrix(true);
  const actual = leaf("actual forward car-shadow caster", 20);
  const car = new TransformNode("actual driving root", scene), parked = new TransformNode("actual parked root", scene);
  car.position.set(0, 0, 4); parked.position.copyFrom(car.position); car.setEnabled(false);
  const beam = new VehicleLighting(scene), torch = new PlayerFlashlight(scene), stable = new StableLightState(scene), budget = new GltfLightBudget(scene);
  const sun = new DirectionalLight("celestial", Vector3.Down(), scene), ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
  const lights = [0, 1].map(index => { const light = new PointLight("mapped POINT " + index, new Vector3(index + 2, 3, 1), scene); light.range = 22; light.falloffType = Light.FALLOFF_STANDARD; return light; });
  const sky = new StandardMaterial("sky terminal IO", scene); sky.disableLighting = true;
  const root = new TransformNode("local avatar", scene), elbow = new TransformNode("torch elbow", scene);
  elbow.parent = root; elbow.position.y = 1.3; elbow.rotation.x = -Math.PI / 2; root.rotation.y = Math.PI;
  const rig = { root, rightElbow: elbow, eyeHeight: 1.63, bodyHeight: 1.8, measurements: { legSpacing: .105 } };
  const actor = Object.freeze({ position: Object.freeze({ x: 0, y: .8, z: 0 }), vehicle: false });
  let loop: (() => boolean) | undefined, stage = "", now = 0, programs = 0, hook: (() => void) | undefined, currentQuality: string = requested;
  const effectRows: any[] = [];
  const flags = (effect: any) => ({
    id: effect?.uniqueId,
    depth: effect?.defines?.includes("#define DEPTHPREPASS"),
    derived: typeof effect?.defines === "string" && /^#define SM_/m.test(effect.defines),
    hash: typeof effect?.defines === "string" ? createHash("sha256").update(effect.defines).digest("hex") : null,
  });
  const seenEffects = new WeakSet<object>();
  engine.createEffect = function (this: NullEngine, ...args) {
    const effect = Reflect.apply(WebGPUEngine.prototype.createEffect, this, args);
    if (!seenEffects.has(effect)) {
      seenEffects.add(effect); programs++;
      effectRows.push({ stage, quality: currentQuality, pass: engine.currentRenderPassId, ...flags(effect) });
    }
    return effect;
  } as typeof engine.createEffect;
  const routing = { isWebGPU: true, get currentRenderPassId() { return engine.currentRenderPassId; }, set currentRenderPassId(value) { engine.currentRenderPassId = value; },
    runRenderLoop(callback: () => boolean) { assert.equal(loop, undefined); loop = callback; }, stopRenderLoop(callback: () => boolean) { if (loop === callback) loop = undefined; } };
  const select = (mode: Parameters<typeof selectLightingPreview>[0]) => selectLightingPreview(mode, Date.parse("2026-10-23T12:00:00Z"));
  const Subject = make({ AuthoredLightPreparation, PlayerFlashlight, Vector3, MeshBuilder, prepareLightVariants, prepareRenderQualities,
    MANUAL_HARDWARE_SCALING, arePreparationEffectsReady: () => arePreparationEffectsReady(engine), selectLightingPreview: select, applyArtLighting,
    performance: { now: () => now }, window: { setTimeout: () => 1, clearTimeout() {} }, document: { hidden: false, addEventListener() {}, removeEventListener() {} } });
  const requestedState = Object.freeze({ quality: requested, revision: 1, hardwareScaling: 1 });
  const game: any = Object.assign(new Subject(), { engine: routing, scene, camera, car, parkedCar: parked, vehicleLighting: beam, flashlight: torch,
    stableLights: stable, gltfLightBudget: budget, sun, ambient, lights, lamps: new StandardMaterial("lamp", scene), clouds: [],
    actor, localId: "local", avatars: new Map([["local", rig]]), quality: requested as RenderQuality, adaptive: { state: requestedState },
    timeOverride: Date.parse("2026-10-23T16:27:00Z"), flashlightOn: false, profile: Object.freeze({ preset: 4 }), weather: Object.freeze({ cloud: .86, rain: 0, wind: 1.8 }),
    disposed: false, rendererFailed: false, yaw: Math.PI, pitch: .28, keys: new Set(), inputSeq: 17,
    applyRenderQuality(quality: RenderQuality) { this.quality = quality; currentQuality = quality; }, updateWorldPresentation() {}, updateCameraFollow() {},
    localAvatarPresentation: { update: () => ({ visible: true, cameraLight: false, resetAnimation: false }) }, updateAvatarPresentation() {},
    vegetation: { beginGrassPreparation() {}, update(input: any) { wind.time = input.time; wind.x = input.wind.x; wind.z = input.wind.z; } },
    skyWeather: { atmosphere: { material: sky, update() {}, dispose() {} }, update: ({ instant }: { instant: number }) => ({ sun: sunState(instant), moon: moonState(instant), wind: { x: 0, z: 1.8 } }) },
    compilationProfile: { setStage(value: string) { stage = value; } }, renderHealth: { snapshot: () => ({ errorCount: 0, phase: "preparing", pendingPreparationOperations: 0 }) },
  });
  const drawn = new Set<number>(), frames: { stage: string; quality: string; actualDrawn: boolean; actualForced: boolean; farForced: boolean }[] = [];
  for (const mesh of [actual, far]) mesh.onAfterRenderObservable.add(() => { if (engine.currentRenderPassId === camera.renderPassId) drawn.add(mesh.uniqueId); });
  const draw = () => {
    assert.ok(!game.disposed && !game.rendererFailed && !scene.isDisposed);
    if (beam.light.isEnabled() && game.quality !== "low") {
      const generator = beam.light.getShadowGenerator();
      assert.ok(generator instanceof ShadowGenerator);
      assert.equal(generator.filter, 6, "actual PCF path must not downgrade to NullEngine Poisson");
    }
    budget.prepareFrame(); stable.update(); drawn.clear(); engine.beginFrame(); scene.render(); engine.endFrame();
    frames.push({ stage, quality: game.quality, actualDrawn: drawn.has(actual.uniqueId), actualForced: actual.alwaysSelectAsActiveMesh, farForced: far.alwaysSelectAsActiveMesh });
    hook?.();
  };
  const tick = async () => { now++; loop?.(); await setImmediate(); };
  const finish = async (pending: Promise<any>) => {
    let done = false; void pending.then(() => { done = true; }, () => { done = true; });
    for (let n = 0; !done && n < 4000; n++) await tick(); assert.ok(done, "actual complete Game preparation must settle finitely"); return pending;
  };
  t.after(() => {
    game.cancelLightPreparation?.(); for (const wrapper of wrappers) wrapper.dispose();
    beam.dispose(); torch.dispose(); budget.dispose(); stable.dispose();
    engine.getColorWrite = oldGet; engine.setColorWrite = oldSet; engine.createEffect = oldCreate;
    scene.dispose(); engine.dispose(); assert.equal(loop, undefined);
  });
  return { engine, scene, camera, game, actor, car, parked, far, actual, shared, leaf, leafMaterial, beam, frames,
    tick, finish, draw, programs: () => programs, effectRows,
    snapshot() {
      const wrapper: any = shared.shadowDepthWrapper, sub = actual.subMeshes[0];
      const bases = wrapper._subMeshToEffectByPass?.get(sub);
      const generators = wrapper._subMeshToDepthWrapperByPass?.get(sub);
      return {
        bases: bases ? [...bases].map(([pass, effect]: any) => ({ pass, ...flags(effect) })) : [],
        entries: generators ? [...generators].flatMap(([generator, entries]: any) =>
          [...entries].map(([pass, entry]: any) => ({
            pass, car: Reflect.get(generator, "_light")?.metadata?.simulatedVehicleLight,
            base: entry.originalEffect?.uniqueId, effect: entry.mainDrawWrapper.effect?.uniqueId,
          }))) : [],
      };
    },
    stage: () => stage, hook: (callback?: () => void) => { hook = callback; },
    start: () => game.prepareLighting(draw), startSingle: () => game.prepareLightingVariants(draw),
    async showActual() {
      // Test-only visibility transition isolates the native epoch mechanism;
      // production preparation never changes Actor, camera or physical input.
      camera.position.set(0, 4.62, -4); camera.setTarget(new Vector3(0, 1.5, 4));
      game.timeOverride = Date.parse("2026-10-23T22:00:00Z");
      car.setEnabled(true); parked.setEnabled(false);
      game.updateRenderEnvironment(actor.position, rig, false, 0, now / 1000, game.timeOverride, false);
      for (let n = 0; n < 12; n++) { draw(); await setImmediate(); }
    },
  };
}

for (const quality of ["medium", "high"] as const)
  test(`actual Game ${quality} complete preparation retains leaf car shadow programs through restore and first visibility`, async t => {
    const f = fixture(t, quality), cameraBefore = f.camera.position.clone();
    const result = await f.finish(f.start()); assert.equal(result.status, "complete");
    assert.equal(result.stages.length, quality === "high" ? 57 : 76);
    assert.ok(f.camera.position.equals(cameraBefore)); assert.equal(f.game.actor, f.actor); assert.equal(f.actor.vehicle, false);
    assert.equal(f.actual.alwaysSelectAsActiveMesh, false); assert.equal(f.far.alwaysSelectAsActiveMesh, false);
    const vehicle = f.frames.filter(frame => frame.stage.startsWith("vehicle-") && frame.quality !== "low");
    const before = f.programs(), generator = f.beam.light.getShadowGenerator()!, map = generator.getShadowMap()!;
    const beforeBase = Reflect.get(f.shared.shadowDepthWrapper!, "_subMeshToEffect").get(f.actual.subMeshes[0]);
    const beforeMain = f.actual.subMeshes[0]._getDrawWrapper(f.camera.renderPassId)?.effect;
    const beforeSnapshot = f.snapshot();
    await f.showActual();
    const afterSnapshot = f.snapshot();
    t.diagnostic(JSON.stringify({ scope: "native Effect/cache identities, terminal GLSL IO; no GPU timing/pixels", before,
      after: f.programs(), additional: f.effectRows.slice(before), beforeSnapshot, afterSnapshot,
      preMain: beforeMain?.uniqueId, preBase: beforeBase ? [beforeBase[0].uniqueId, beforeBase[1]] : null,
      postMain: f.actual.subMeshes[0]._getDrawWrapper(f.camera.renderPassId)?.effect?.uniqueId }));
    assert.equal(f.programs(), before, "first main visibility/beam activation must not create additional native Effects");
    const preparedCar = beforeSnapshot.entries.filter(entry => entry.car === true);
    assert.equal(preparedCar.length, 1, "one live car pass owns its prepared derived entry through all later player stages");
    assert.deepEqual(afterSnapshot.entries.filter(entry => entry.car === true), preparedCar,
      "first visible main notification preserves canonical shadow base and owned derived Effect");
    assert.ok(vehicle.every(frame => !frame.actualDrawn && !frame.actualForced), "native pass ownership fixes the shadow-only path without extra representative forcing or main visibility");
    assert.ok(vehicle.every(frame => !frame.farForced), "out-of-car-frustum first material/layout duplicate is not a shadow representative");
    assert.equal(generator.getShadowMap(), map); assert.equal(f.game.quality, quality);
  });

test("async leaf arrival in the last vehicle stage is reacquired by the original Game revision/apply path", async t => {
  const f = fixture(t), pending = f.startSingle(); let delayed: ReturnType<typeof f.leaf> | undefined;
  f.hook(() => {
    if (!delayed && f.stage() === "vehicle-keyed-2") {
      delayed = f.leaf("late actual leaf", 22, f.leafMaterial("delayed independent leaves"));
    }
  });
  const result = await f.finish(pending); assert.equal(result.status, "complete"); assert.ok(delayed);
  const lastVehicle = result.stages.find((row: any) => row.stage === "vehicle-keyed-2");
  assert.ok(lastVehicle.restartReasons.meshes >= 1); assert.ok(lastVehicle.restartReasons.materials >= 1);
  assert.equal(delayed.alwaysSelectAsActiveMesh, false); const before = f.programs(); await f.showActual();
  assert.equal(f.programs(), before, "fully configured asynchronous leaf must also be prepared before first visibility");
});
