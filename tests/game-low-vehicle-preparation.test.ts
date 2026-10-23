import { AuthoredLightPreparation } from "../client/authored-light-preparation";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { setImmediate as turn } from "node:timers/promises";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Light } from "@babylonjs/core/Lights/light";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PlayerFlashlight } from "../client/flashlight";
import { VehicleLighting } from "../client/vehicle-lighting";
import { StableLightState } from "../client/stable-light-state";
import { GltfLightBudget } from "../client/gltf-light-budget";
import { prepareLightVariants } from "../client/light-preparation";
import { prepareRenderQualities } from "../client/render-quality-preparation";
import { AdaptiveQualityController } from "../client/adaptive-quality";
import { MANUAL_HARDWARE_SCALING, isRenderQualityMode } from "../shared/render-quality";
import { PhotographicGrass } from "../client/photographic-grass";
import { acquireGrassResources } from "../client/photo-grass-resources";
import { VegetationController } from "../client/vegetation";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { WebGpuCompilationProfile } from "../client/webgpu-compilation-profile";
import { applyArtLighting, sampleArtLighting } from "../client/art-lighting";
import { selectLightingPreview } from "../client/lighting-preview";
import { sunState, moonState } from "../shared/weather";
import "../client/render-shaders";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

const source = ts.createSourceFile(
  "game.ts",
  readFileSync(
    process.env.GAME_VEHICLE_SOURCE ??
      new URL("../client/game.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find(
  (n): n is ts.ClassDeclaration =>
    ts.isClassDeclaration(n) && n.name?.text === "Game",
)!;
const methods = declaration.members.filter(
  (n) =>
    n.name &&
    [
      "setQuality",
      "applyAdaptiveQuality",
      "prepareLighting",
      "prepareLightingVariants",
      "isMeshReadyForCamera",
      "updateRenderEnvironment",
      "applyPreparationView",
      "preparationPosition",
      "refreshStartupPreparationView",
      "startupPreparationCoverage",
    ].includes(n.name.getText(source)),
);
assert.equal(methods.length, 10);
const code = ts.transpileModule(
  `class TestGame {${methods.map((n) => n.getText(source)).join("\n")}}`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const make = new Script(
  `(env)=>{const {AuthoredLightPreparation,PlayerFlashlight,Vector3,MeshBuilder,prepareLightVariants,prepareRenderQualities,MANUAL_HARDWARE_SCALING,isRenderQualityMode,arePreparationEffectsReady,selectLightingPreview,applyArtLighting,performance,window,document}=env;${code};return TestGame;}`,
).runInThisContext();
const anchor = Date.parse("2026-10-18T12:45:00Z");
const select = (mode: Parameters<typeof selectLightingPreview>[0]) =>
  selectLightingPreview(mode, anchor);
const vehicleStages = ["vehicle-0", "vehicle-1", "vehicle-2", "vehicle-keyed-0", "vehicle-keyed-1", "vehicle-keyed-2"];
const originalStages = [
  "current-off",
  "current-on",
  "night-0-off",
  "night-0-on",
  "night-1-off",
  "night-1-on",
  "night-2-off",
  "night-2-on",
  "day-0-off",
  "day-0-on",
  "day-1-off",
  "day-1-on",
  "restore",
];

function fixture(
  t: import("node:test").TestContext,
  quality = "low",
  webgpu = true,
  withGrass = false,
  previewAnchor = anchor,
) {
  const selectAt = (mode: Parameters<typeof selectLightingPreview>[0]) => selectLightingPreview(mode, previewAnchor);
  const engine = new NullEngine();
  if (withGrass) engine.getCaps().instancedArrays = true;
  const
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera(
    "real camera/pass",
    new Vector3(0, 3, -8),
    scene,
  );
  camera.setTarget(new Vector3(0, 1, 4));
  scene.activeCamera = camera;
  const drawn = new Set<number>();
  const subjects = ["Standard", "PBR"].map((kind, i) => {
    const material =
      kind === "PBR"
        ? new PBRMaterial(kind, scene)
        : new StandardMaterial(kind, scene);
    material.maxSimultaneousLights = 4;
    const mesh = MeshBuilder.CreateBox(kind, {}, scene);
    mesh.position.set(i * 2 - 1, 1, 4);
    mesh.material = material;
    mesh.receiveShadows = true;
    mesh.metadata = { depthCaster: "opaque" };
    const instance = mesh.createInstance(kind + " instance");
    instance.position = mesh.position.add(new Vector3(0, 0, 2));
    instance.receiveShadows = true;
    mesh.onAfterRenderObservable.add(() => {
      if (engine.currentRenderPassId === camera.renderPassId)
        drawn.add(mesh.uniqueId);
    });
    return { mesh, instance, material };
  });
  const sun = new DirectionalLight("sun", Vector3.Down(), scene),
    ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
  const streets = [0, 1].map((i) => {
    const p = new PointLight(
      `mapped POINT ${i}`,
      new Vector3(i + 2, 3, 1),
      scene,
    );
    p.range = 22;
    p.falloffType = Light.FALLOFF_STANDARD;
    return p;
  });
  const root = new TransformNode("actual torch root", scene),
    elbow = new TransformNode("actual elbow", scene);
  elbow.parent = root;
  elbow.position.y = 1.3;
  elbow.rotation.x = -Math.PI / 2;
  const rig = {
    root,
    rightElbow: elbow,
    eyeHeight: 1.63,
    bodyHeight: 1.8,
    measurements: { legSpacing: 0.105 },
  };
  const car = new TransformNode("driving", scene),
    parked = new TransformNode("parked", scene);
  car.position.set(0, 0, 1);
  car.setEnabled(false);
  const beam = new VehicleLighting(scene),
    torch = new PlayerFlashlight(scene),
    stable = new StableLightState(scene),
    budget = new GltfLightBudget(scene);
  const skyMaterial = new StandardMaterial("sky IO", scene);
  skyMaterial.disableLighting = true;
  skyMaterial.disableDepthWrite = true;
  skyMaterial.backFaceCulling = false;
  let loop: (() => void) | undefined,
    stage = "",
    now = 0,
    draws = 0,
    programs = 0,
    visualWrites = 0,
    environmentInstant = NaN;
  let afterDraw: (() => void) | undefined;
  const originalProgram = engine.createShaderProgram;
  engine.createShaderProgram = function (...args) {
    programs++;
    return Reflect.apply(originalProgram, this, args);
  };
  for (const node of [car, parked]) {
    const set = node.setEnabled;
    node.setEnabled = function (enabled) {
      visualWrites++;
      return set.call(this, enabled);
    };
  }
  const stages = new Map<
    string,
    {
      effects: unknown[];
      car: boolean;
      parked: boolean;
      beam: boolean;
      shadow: boolean;
      shadowMapSize?: number;
      nonStreet: number;
      points: number;
      quality: string;
      instant: number;
      profile: unknown;
      draws: number;
    }
  >();
  const actor = Object.freeze({
    position: Object.freeze({ x: 0, y: 0.8, z: 0 }),
    vehicle: false,
  });
  const requested = { quality, revision: 17, hardwareScaling: 1 };
  const qualityPasses: { quality: string; final: boolean }[] = [];
  const gameEngine = {
    isWebGPU: webgpu,
    get currentRenderPassId() {
      return engine.currentRenderPassId;
    },
    set currentRenderPassId(v) {
      engine.currentRenderPassId = v;
    },
    runRenderLoop(cb: () => void) {
      assert.equal(loop, undefined);
      loop = cb;
    },
    stopRenderLoop(cb: () => void) {
      if (loop === cb) loop = undefined;
    },
  };
  // The only engine adapter is Game's backend/scheduler routing. All material,
  // light, shadow, cache, readiness and actual draws use the real NullEngine.
  const Game = make({
    AuthoredLightPreparation,
    PlayerFlashlight,
    Vector3,
    MeshBuilder,
    prepareLightVariants,
    prepareRenderQualities,
    MANUAL_HARDWARE_SCALING,
    isRenderQualityMode,
    arePreparationEffectsReady: () => arePreparationEffectsReady(engine),
    selectLightingPreview: selectAt,
    applyArtLighting,
    performance: { now: () => now },
    window: { setTimeout, clearTimeout },
    document: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
    },
  });
  const game: any = Object.assign(new Game(), {
    engine: gameEngine,
    scene,
    camera,
    sun,
    ambient,
    lights: streets,
    lamps: new StandardMaterial("lamp fixtures", scene),
    clouds: [],
    car,
    parkedCar: parked,
    vehicleLighting: beam,
    flashlight: torch,
    stableLights: stable,
    gltfLightBudget: budget,
    quality,
    actor,
    localId: "local",
    avatars: new Map([["local", rig]]),
    profile: Object.freeze({ preset: 0 }),
    weather: Object.freeze({ cloud: 0.99, rain: 0, wind: 0 }),
    timeOverride: selectAt("night").instant,
    flashlightOn: false,
    disposed: false,
    rendererFailed: false,
    adaptive: { state: requested },
    applyRenderQuality(next: string, scale: number) {
      // Tests the actual quality scheduler + light pipeline activation, not
      // GPU target formats or the unrelated postprocess quality implementation.
      game.quality = next;
      game.hardwareScaling = scale;
    },
    keys: new Set(),
    inputSeq: 15,
    yaw: 0.2,
    pitch: 0.28,
    renderHealth: {
      snapshot: () => ({
        errorCount: 0,
        pendingPreparationOperations: 0,
        phase: "preparing",
      }),
    },
    compilationProfile: {
      setStage(value: string) {
        stage = value;
      },
    },
    skyWeather: {
      atmosphere: { material: skyMaterial, update() {}, dispose() {} },
      update({ instant }: { instant: number }) {
        environmentInstant = instant;
        return {
          sun: sunState(instant),
          moon: moonState(instant),
          wind: { x: 0, z: 0 },
        };
      },
    },
    updateWorldPresentation(pos: unknown) {
      assert.equal(pos, actor.position);
    },
    updateCameraFollow(_p: unknown, _h: number, dt: number) {
      assert.equal(dt, 1);
      assert.ok(
        !stage.startsWith("vehicle-"),
        "vehicle stage cannot alter camera follow state",
      );
    },
    localAvatarPresentation: {
      update() {
        assert.ok(!stage.startsWith("vehicle-"));
        return { visible: true, cameraLight: false, resetAnimation: false };
      },
    },
    updateAvatarPresentation(
      _id: string,
      _rig: unknown,
      _feet: unknown,
      dt: number,
    ) {
      assert.equal(dt, 0);
      assert.ok(!stage.startsWith("vehicle-"));
    },
  });
  const originalPrepare = game.prepareLightingVariants;
  game.prepareLightingVariants = function (...args: any[]) {
    qualityPasses.push({ quality: this.quality, final: typeof args[2]?.restoreQuality === "function" });
    return Reflect.apply(originalPrepare, this, args);
  };
  const grassPack = withGrass ? JSON.parse(readFileSync(new URL("../public/models/vegetation/grass/geometry.json", import.meta.url), "utf8")) : undefined;
  const grassRecipe = withGrass ? JSON.parse(readFileSync(new URL("../public/models/vegetation/grass/material.json", import.meta.url), "utf8")) : undefined;
  const acquireGrass = () => acquireGrassResources(scene, grassPack, grassRecipe, 1024, (channel,gamma) => {
    // Actual NullEngine Texture IO, no image decode or material readiness mock.
    const texture = new Texture("/textures/vegetation/grass/"+grassPack.textures.files[channel].file,scene,false,false);texture.gammaSpace=gamma;return {texture,ready:Promise.resolve()};
  });
  const grass = withGrass ? new PhotographicGrass(scene,grassPack,grassRecipe,acquireGrass()) : undefined;
  if (grass) {
    // Real forwarding methods/owner. Unrelated live world selection stays out
    // of this bounded Game wiring fixture, as do avatar/world presentation.
    const vegetation = Object.assign(Object.create(VegetationController.prototype), {scene,disposed:false,photographicGrass:grass,update(){}});
    game.vegetation=vegetation;
  }
  const grassFrames: {stage:string;quality:string;enabled:boolean;drawn:boolean;ready:boolean;count:number}[]=[];
  let observedGrass: import("@babylonjs/core/Meshes/mesh").Mesh | undefined, grassDrawn=false;
  const grassMesh = () => scene.meshes.find(mesh=>mesh.metadata?.photoGrassPreparation) as import("@babylonjs/core/Meshes/mesh").Mesh | undefined;
  const invariant = () =>
    JSON.stringify({
      actor,
      camera: camera.position.asArray(),
      rotation: camera.rotation.asArray(),
      root: root.position.asArray(),
      elbow: elbow.rotation.asArray(),
      car: car.position.asArray(),
      parked: parked.position.asArray(),
      yaw: game.yaw,
      pitch: game.pitch,
      input: game.inputSeq,
      keys: [...game.keys],
      requested,
    });
  const initial = invariant();
  const draw = () => {
    assert.ok(
      !game.disposed && !game.rendererFailed && !scene.isDisposed,
      "retired scene must not render",
    );
    budget.prepareFrame();
    stable.update();
    drawn.clear();
    const preparation=grassMesh();
    if(preparation&&preparation!==observedGrass){observedGrass=preparation;preparation.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId===camera.renderPassId)grassDrawn=true;});}
    grassDrawn=false;
    scene.render();
    draws++;
    if(withGrass)grassFrames.push({stage,quality:game.quality,enabled:preparation?.isEnabled()??false,drawn:grassDrawn,ready:preparation?.subMeshes[0]._getDrawWrapper(camera.renderPassId)?.effect?.isReady()??false,count:preparation?.thinInstanceCount??0});
    if (
      subjects.every(
        (s) =>
          drawn.has(s.mesh.uniqueId) &&
          s.mesh.subMeshes[0]
            ._getDrawWrapper(camera.renderPassId)
            ?.effect?.isReady(),
      )
    ) {
      const old = stages.get(stage);
      stages.set(stage, {
        effects: subjects.map(
          (s) =>
            s.mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)!.effect,
        ),
        car: game.car.isEnabled(false),
        parked: game.parkedCar.isEnabled(false),
        beam: beam.light.isEnabled(),
        shadow: beam.light.shadowEnabled,
        shadowMapSize: (beam.light.getShadowGenerator() as ShadowGenerator | null)?.mapSize,
        nonStreet: scene.lights.filter(light => light.isEnabled() && !streets.includes(light as PointLight)).length,
        points: streets.filter((l) => l.isEnabled()).length,
        quality: game.quality,
        instant: environmentInstant,
        profile: game.profile,
        draws: (old?.draws ?? 0) + 1,
      });
    }
    afterDraw?.();
  };
  t.after(() => {
    game.cancelLightPreparation?.();
    torch.dispose();
    beam.dispose();
    budget.dispose();
    stable.dispose();
    grass?.dispose();
    scene.dispose();
    engine.dispose();
    assert.equal(loop, undefined);
  });
  const tick = async () => {
    now++;
    loop?.();
    await turn();
  };
  return {
    game,
    engine,
    scene,
    car,
    parked,
    beam,
    torch,
    subjects,
    streets,
    stages,
    requested,
    qualityPasses,
    invariant,
    initial,
    draw,
    tick,
    grass,
    grassMesh,
    grassFrames,
    replaceGrassResources() { assert.ok(grass); const next=acquireGrass();(grass as any).installResources(next);return next; },
    startAllQualities: () => game.prepareLighting(draw),
    start: (options?: { timeoutMs: number; restoreQuality?: () => void }) =>
      game.prepareLightingVariants(draw, undefined, options),
    stage: () => stage,
    counts: () => ({ draws, programs, visualWrites }),
    hook: (cb?: () => void) => {
      afterDraw = cb;
    },
    advanceClock: (ms: number) => {
      now += ms;
    },
    async until(wanted: string) {
      for (let n = 0; stage !== wanted && n < 400; n++) await tick();
      assert.equal(stage, wanted);
    },
    async finish(pending: Promise<any>) {
      let done = false;
      pending.finally(() => {
        done = true;
      });
      for (let n = 0; !done && n < 1000; n++) await tick();
      assert.ok(done);
      return pending;
    },
    async drive(points: number) {
      game.car.setEnabled(true);
      game.parkedCar.setEnabled(false);
      game.updateRenderEnvironment(
        actor.position,
        rig,
        false,
        0,
        0,
        game.timeOverride,
        false,
      );
      streets.forEach((l, i) => {
        l.setEnabled(i < points);
        l.intensity = i < points ? 0.7 : 0;
      });
      for (let i = 0; i < 4; i++) {
        draw();
        await turn();
      }
      return subjects.map(
        (s) => s.mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)!.effect,
      );
    },
  };
}

test("low WebGPU actual Game prepares three bounded car requests before original13 and subsequent driving reuses Effects", async (t) => {
  const f = fixture(t),
    result = await f.finish(f.start());
  assert.equal(result.status, "complete");
  assert.deepEqual(
    result.stages.map((s: any) => s.stage),
    [...vehicleStages, ...originalStages],
  );
  assert.equal(f.invariant(), f.initial);
  for (const n of [0, 1]) {
    const s = f.stages.get(`vehicle-${n}`)!;
    assert.equal(s.car, true);
    assert.equal(s.parked, false);
    assert.equal(s.beam, true);
    assert.equal(s.shadow, false);
    assert.equal(s.points, n);
    assert.ok(s.draws >= 2, "two actual ready acceptance draws");
    assert.ok(result.stages.find((stage: any) => stage.stage === `vehicle-${n}`).renders >= 3, "progress plus two accepted draws");
  }
  for (const name of originalStages) {
    const s = f.stages.get(name)!;
    assert.equal(s.car, false);
    assert.equal(s.parked, true);
    assert.equal(s.beam, false);
  }
  const before = f.counts().programs;
  for (const n of [0, 1])
    assert.deepEqual(await f.drive(n), f.stages.get(`vehicle-${n}`)!.effects);
  assert.equal(f.counts().programs, before);
});

test("WebGL retains original9 without leasing vehicle roots", async (t) => {
  for (const [quality, gpu, count] of [
    ["low", false, 9],
  ] as const) {
    const f = fixture(t, quality, gpu),
      result = await f.finish(f.start());
    assert.equal(result.status, "complete");
    assert.equal(result.stages.length, count);
    assert.ok(result.stages.every((s: any) => !s.stage.startsWith("vehicle-")));
    assert.equal(f.counts().visualWrites, 0);
    assert.equal(f.invariant(), f.initial);
  }
});

for (const quality of ["low", "medium", "high"])
for (const ending of [
  "cancel",
  "disposed",
  "fault",
  "timeout",
  "throw",
] as const)
  test(`${quality} vehicle lease releases correctly on ${ending}`, async (t) => {
    const f = fixture(t, quality),
      pending = f.start({ timeoutMs: 1000 });
    await f.until("vehicle-0");
    assert.equal(f.car.isEnabled(), true);
    assert.equal(f.parked.isEnabled(), false);
    const before = f.counts();
    if (ending === "cancel") f.game.cancelLightPreparation();
    if (ending === "disposed") {
      f.game.disposed = true;
      f.game.cancelLightPreparation();
    }
    if (ending === "fault") {
      f.game.rendererFailed = true;
      f.game.cancelLightPreparation();
    }
    if (ending === "timeout") f.advanceClock(1001);
    if (ending === "throw")
      f.hook(() => {
        f.hook();
        throw Error("render failure after real vehicle draw");
      });
    const result = await f.finish(pending);
    assert.equal(
      result.status,
      ending === "timeout"
        ? "timeout"
        : ending === "throw"
          ? "failed"
          : "disposed",
    );
    if (ending === "disposed" || ending === "fault") {
      assert.equal(f.counts().draws, before.draws);
      assert.equal(f.counts().visualWrites, before.visualWrites);
    } else {
      assert.equal(f.car.isEnabled(false), false);
      assert.equal(f.parked.isEnabled(false), true);
      assert.equal(f.beam.light.isEnabled(), false);
    }
    assert.equal(f.game.cancelLightPreparation, undefined);
    assert.equal(f.invariant(), f.initial);
  });

for (const quality of ["low", "medium", "high"])
for (const disposedRoot of ["car", "parked"] as const)
  test(`${quality} single live-scene root disposal fails closed: ${disposedRoot}`, async (t) => {
    const f = fixture(t, quality), pending = f.start();
    await f.until("vehicle-0");
    const dead = f[disposedRoot];
    dead.dispose();
    assert.equal(f.scene.isDisposed, false);
    assert.equal(f.game.disposed, false);
    assert.equal(f.game.car, f.car);
    assert.equal(f.game.parkedCar, f.parked);
    let disposedWrites = 0, disposedWorldReads = 0;
    const setEnabled = dead.setEnabled, world = dead.computeWorldMatrix;
    dead.setEnabled = function (enabled) { disposedWrites++; return setEnabled.call(this, enabled); };
    dead.computeWorldMatrix = function (...args) { disposedWorldReads++; return Reflect.apply(world, this, args); };
    const before = f.counts();
    const result = await f.finish(pending);
    assert.equal(result.status, "failed");
    assert.equal(result.stages.length, 1);
    assert.ok(result.stages[0].restartReasons[disposedRoot === "car" ? "carDisposed" : "parkedCarDisposed"] >= 1);
    assert.equal(disposedWrites, 0, "never setEnabled on the disposed leased node");
    assert.equal(disposedWorldReads, 0, "never compute a disposed root for beam pose");
    assert.equal(f.counts().draws, before.draws, "failed ownership cannot render another acceptance frame");
    assert.equal(f.beam.light.isEnabled(), false);
    assert.equal(f.game.cancelLightPreparation, undefined);
    if (disposedRoot === "car") assert.equal(f.parked.isEnabled(false), true);
    else assert.equal(f.car.isEnabled(false), false);
    assert.equal(f.invariant(), f.initial);
  });

for (const quality of ["low", "medium", "high"])
test(`${quality} replacement roots restart the vehicle stage and never receive the old lease flags`, async (t) => {
  const f = fixture(t, quality),
    pending = f.start();
  await f.until("vehicle-0");
  const replacementCar = new TransformNode("replacement driving", f.scene),
    replacementParked = new TransformNode("replacement parked", f.scene);
  replacementCar.setEnabled(true);
  replacementParked.setEnabled(false);
  f.game.car = replacementCar;
  f.game.parkedCar = replacementParked;
  const result = await f.finish(pending);
  assert.equal(result.status, "complete");
  assert.equal(f.car.isEnabled(false), false);
  assert.equal(f.parked.isEnabled(false), true);
  assert.equal(replacementCar.isEnabled(false), true);
  assert.equal(replacementParked.isEnabled(false), false);
  const first = result.stages[0];
  assert.ok(first.restartReasons.car >= 1);
  assert.ok(first.restartReasons.parkedCar >= 1);
});

test("cancel after replacement restores only captured roots and keeps replacement flags", async (t) => {
  const f = fixture(t),
    pending = f.start();
  await f.until("vehicle-0");
  const replacementCar = new TransformNode("new driving", f.scene),
    replacementParked = new TransformNode("new parked", f.scene);
  replacementCar.setEnabled(false);
  replacementParked.setEnabled(false);
  f.game.car = replacementCar;
  f.game.parkedCar = replacementParked;
  f.game.cancelLightPreparation();
  assert.equal((await pending).status, "disposed");
  assert.equal(f.car.isEnabled(false), false);
  assert.equal(f.parked.isEnabled(false), true);
  assert.equal(replacementCar.isEnabled(false), false);
  assert.equal(replacementParked.isEnabled(false), false);
});

test("final restore applies latest quality/time/profile before accepted readiness draws", async (t) => {
  const f = fixture(t);
  let restoreCalls = 0;
  const pending = f.start({
    timeoutMs: 1000,
    restoreQuality: () => {
      restoreCalls++;
      f.game.quality = f.requested.quality;
    },
  });
  await f.until("vehicle-0");
  f.requested.quality = "high";
  f.game.timeOverride = select("day").instant;
  const profile = Object.freeze({ preset: 3 });
  f.game.profile = profile;
  const result = await f.finish(pending);
  assert.equal(result.status, "complete");
  const restored = f.stages.get("restore")!;
  assert.equal(restored.quality, "high");
  assert.equal(restored.instant, f.game.timeOverride);
  assert.equal(restored.profile, profile);
  assert.ok(restored.draws >= 3);
  assert.equal(f.car.isEnabled(false), false);
  assert.equal(f.parked.isEnabled(false), true);
  assert.ok(restoreCalls >= 1);
  assert.equal(f.requested.quality, "high");
  assert.equal(
    new Set([
      ...result.stages.map((s: any) => s.stage),
      "construction",
      "assets",
      "submitted-frame",
      "ready",
    ]).size,
    23,
    "23 requested labels exceed maxStages21; the actual inventory must explicitly aggregate overflow",
  );
});

test("WebGPU preparation includes the actual FAR helper in all76 stages and all4 quality passes", async t => {
  const f=fixture(t,"medium",true,true), requested={...f.requested};
  const result=await f.finish(f.startAllQualities());
  assert.equal(result.status,"complete");assert.equal(result.stages.length,76);
  assert.deepEqual(result.qualities.map((q:any)=>[q.quality,q.stageCount]),[["low",19],["medium",19],["high",19],["medium",19]]);
  for(const entry of result.stages){
    const frames=f.grassFrames.filter(frame=>frame.stage===entry.stage&&frame.quality===entry.passQuality&&frame.enabled&&frame.drawn&&frame.ready&&frame.count===1);
    assert.ok(frames.length>=2,`${entry.passQuality}/${entry.stage} has two actual ready FAR draws`);
    assert.ok(entry.renders>=3);
  }
  assert.deepEqual(f.requested,requested);assert.equal(f.game.quality,"medium");assert.equal(f.game.preparingRenderQuality,false);assert.equal(f.invariant(),f.initial);
  const mesh=f.grassMesh()!;assert.ok(mesh);assert.equal(mesh.isEnabled(),false);assert.equal(mesh.isDisposed(),false);assert.equal(f.grass!.stats.instances,0);
  f.draw();assert.equal(f.grassFrames.at(-1)!.enabled,false);assert.equal(f.grassFrames.at(-1)!.drawn,false,"helper is disabled before normal gameplay submission");
});

test("WebGL preparation never constructs or activates the FAR helper",async t=>{
  const f=fixture(t,"low",false,true),result=await f.finish(f.startAllQualities());assert.equal(result.status,"complete");assert.equal(result.stages.length,9);assert.equal(f.grassMesh(),undefined);assert.ok(f.grassFrames.every(frame=>!frame.enabled&&!frame.drawn));
});

test("same-count grass resource replacement restarts actual Game preparation and stale stop cannot disable the new activation",async t=>{
  const f=fixture(t,"medium",true,true),pending=f.start();await f.until("current-off");const old=f.grassMesh()!,count=f.scene.meshes.length,materials=f.scene.materials.length;
  f.replaceGrassResources();const stale=f.grass!.beginShaderPreparation()!;const next=f.grassMesh()!;
  assert.equal(old.isDisposed(),true);assert.notEqual(next,old);assert.equal(f.scene.meshes.length,count);assert.equal(f.scene.materials.length,materials);
  await f.tick();stale();assert.equal(next.isEnabled(),true);
  const result=await f.finish(pending);assert.equal(result.status,"complete");assert.ok(result.stages.find((stage:any)=>stage.stage==="current-off")!.restartReasons.grassResources>=1);assert.equal(next.isEnabled(),false);
});

for(const ending of ["cancel","disposed","fault","timeout","throw"] as const)test(`actual FAR activation is disabled on ${ending}`,async t=>{
  const f=fixture(t,"medium",true,true),pending=f.start({timeoutMs:1000});await f.until("current-off");const mesh=f.grassMesh()!;assert.equal(mesh.isEnabled(),true);
  if(ending==="cancel")f.game.cancelLightPreparation();
  if(ending==="disposed"){f.game.disposed=true;f.game.cancelLightPreparation();}
  if(ending==="fault"){f.game.rendererFailed=true;f.game.cancelLightPreparation();}
  if(ending==="timeout")f.advanceClock(1001);
  if(ending==="throw")f.hook(()=>{f.hook();throw Error("grass scope draw failure");});
  const result=await f.finish(pending);assert.equal(result.status,ending==="timeout"?"timeout":ending==="throw"?"failed":"disposed");assert.equal(mesh.isEnabled(),false);assert.equal(mesh.isDisposed(),false);assert.equal(f.game.cancelLightPreparation,undefined);
});

test("actual Game failed FAR initialization cannot leak a clone or report complete",async t=>{
  const f=fixture(t,"medium",true,true),resource=(f.grass as any).resources,clone=resource.clone.bind(resource),before=f.scene.meshes.length;
  resource.clone=(level:string,name:string)=>{const mesh=clone(level,name);mesh.makeGeometryUnique=()=>{throw Error("unique geometry failure");};return mesh;};
  const result=await f.finish(f.start());assert.equal(result.status,"failed");assert.equal(f.grassMesh(),undefined);assert.equal(f.scene.meshes.length,before);
  resource.clone=clone;
});

for (const quality of ["medium", "high"] as const)
  test(`${quality} WebGPU prepares zero/one/two actual POINTs with the real car shadow`, async (t) => {
    // Actual Strahov astronomy on this moonless night leaves ambient + car,
    // hence two available POINT slots. This must not be a clamped one-POINT test.
    const f = fixture(t, quality, true, false, Date.parse("2026-10-10T12:00:00Z"));
    const result = await f.finish(f.start());
    assert.equal(result.status, "complete");
    assert.deepEqual(result.stages.map((s: any) => s.stage), [...vehicleStages, ...originalStages]);
    for (const count of [0, 1, 2]) {
      const state = f.stages.get(`vehicle-${count}`)!;
      assert.ok(state, "actual vehicle stage drew both Standard and PBR receivers");
      assert.equal(state.quality, quality);
      assert.equal(state.car, true); assert.equal(state.parked, false);
      assert.equal(state.beam, true); assert.equal(state.shadow, true);
      assert.equal(state.shadowMapSize, quality === "medium" ? 256 : 512);
      assert.equal(state.nonStreet, 2, "actual below-horizon celestial key leaves ambient and car");
      assert.equal(state.points, count);
      assert.equal(state.nonStreet + state.points, 2 + count);
      assert.ok(state.draws >= 2);
      assert.ok(result.stages.find((s: any) => s.stage === `vehicle-${count}`).renders >= 3);
      for (const effect of state.effects as { defines: string }[]) {
        assert.match(effect.defines, /^#define SPOTLIGHT\d+$/m);
        assert.match(effect.defines, /^#define SHADOW\d+$/m);
        assert.equal((effect.defines.match(/^#define POINTLIGHT\d+$/gm) ?? []).length, count);
      }
    }
    const generator = f.beam.light.getShadowGenerator()!, map = generator.getShadowMap()!, before = f.counts().programs;
    for (const count of [0, 1, 2]) assert.deepEqual(await f.drive(count), f.stages.get(`vehicle-${count}`)!.effects);
    assert.equal(f.beam.light.getShadowGenerator(), generator);
    assert.equal(generator.getShadowMap(), map, "entering the prepared quality must retain the actual RTT/pass");
    assert.equal(f.counts().programs, before);
    assert.equal(f.invariant(), f.initial);
  });

test("Low vehicle2 is explicitly the same clamped one-POINT state without shadows", async (t) => {
  const f = fixture(t), result = await f.finish(f.start());
  assert.equal(result.status, "complete");
  const one = f.stages.get("vehicle-1")!, two = f.stages.get("vehicle-2")!;
  assert.ok(one && two, "both clamped Low vehicle states must actually draw");
  assert.equal(one.points, 1); assert.equal(two.points, 1);
  assert.equal(one.shadow, false); assert.equal(two.shadow, false);
  assert.deepEqual(two.effects, one.effects, "redundant Low request adds no different main material variant");
});

for (const requested of ["medium", "high"] as const)
  test(`all qualities finish with requested ${requested} car shadow map retained before entry`, async (t) => {
    const f = fixture(t, requested), result = await f.finish(f.startAllQualities());
    assert.equal(result.status, "complete"); assert.equal(result.stages.length, requested === "high" ? 57 : 76);
    assert.deepEqual(result.qualities.map((q: any) => [q.quality, q.stageCount]), requested === "medium" ? [["low",19],["medium",19],["high",19],["medium",19]] : [["low",19],["medium",19],["high",19]]);
    assert.equal(f.game.quality, requested); assert.equal(f.game.preparingRenderQuality, false);
    const shadow = f.beam.light.getShadowGenerator() as ShadowGenerator;
    assert.equal(shadow.mapSize, requested === "medium" ? 256 : 512);
    const map = shadow.getShadowMap()!, pass = map.renderPassId;
    assert.equal(f.beam.light.isEnabled(), false);
    await f.drive(1);
    assert.equal(shadow.getShadowMap(), map); assert.equal(map.renderPassId, pass);
  });

test("late requested quality during final pass prepares its actual map before gameplay entry", async (t) => {
  const f = fixture(t, "medium"); let changed = false;
  f.game.adaptive = new AdaptiveQualityController({ mode: "medium" });
  f.hook(() => {
    if (!changed && f.game.quality === "medium" && f.stage() === "current-off" && f.qualityPasses.at(-1)?.final) {
      changed = true;
      assert.equal(f.game.preparingRenderQuality, true);
      f.game.setQuality("high");
      assert.equal(f.game.adaptive.state.quality, "high");
      assert.equal(f.game.quality, "medium", "request is deferred during temporary quality pass");
    }
  });
  const result = await f.finish(f.startAllQualities());
  assert.equal(result.status, "complete"); assert.equal(changed, true);
  assert.deepEqual(f.qualityPasses.slice(0, 4), [
    {quality:"low",final:false},{quality:"medium",final:false},{quality:"high",final:false},{quality:"medium",final:true},
  ], "late request occurred in the second Medium, after progressive High");
  assert.equal((f.beam.light.getShadowGenerator() as ShadowGenerator).mapSize, 512, "latest requested High must be prepared rather than retain Medium256");
  assert.equal(result.stages.length, 95);
  assert.deepEqual(result.qualities.map((q: any) => q.quality), ["low", "medium", "high", "medium", "high"]);
  assert.deepEqual(result.qualities.map((q: any) => q.finalPass), [false, false, false, true, true]);
  assert.equal(f.game.quality, "high");
  const shadow = f.beam.light.getShadowGenerator() as ShadowGenerator;
  assert.equal(shadow.mapSize, 512, "inactive requested restore must not leave the earlier256 map for first entry to resize");
  const map = shadow.getShadowMap()!; await f.drive(1);
  assert.equal(shadow.getShadowMap(), map);
});

for (const quality of ["medium", "high"]) for (const extra of [1, 2])
test(`${quality} vehicle POINT requests respect actual extra-source budget${extra}`, async t => {
  const f = fixture(t, quality, true, false, Date.parse("2026-10-10T12:00:00Z"));
  for (let i=0;i<extra;i++) new PointLight("enabled interior source "+i, Vector3.Up(), f.scene);
  const result=await f.finish(f.start()); assert.equal(result.status,"complete");
  for (const n of [0,1,2]) { const state=f.stages.get("vehicle-"+n)!; assert.ok(state, "requested vehicle budget stage must actually draw"); assert.equal(state.nonStreet,2+extra); assert.equal(state.points,Math.min(n,2-extra)); assert.ok(state.points+state.nonStreet<=4); assert.equal(state.shadow,true); }
});

for (const initial of ["medium", "high"]) test(`${initial} vehicle preparation reapplies current stage on quality and profile revision`,async t=>{
 const f=fixture(t,initial),pending=f.start();await f.until("vehicle-0");
 f.game.quality=initial==="medium"?"high":"medium";f.game.profile={preset:5};f.game.weather={cloud:.2,rain:0,wind:0};
 await f.tick();const result=await f.finish(pending);assert.equal(result.status,"complete");
 const first=result.stages[0];assert.ok(first.restartReasons.quality>=1);assert.ok(first.restartReasons.profile>=1);assert.ok(first.restartReasons.weather>=1);
 assert.equal((f.beam.light.getShadowGenerator() as ShadowGenerator).mapSize,f.game.quality==="medium"?256:512);
 assert.equal(f.car.isEnabled(false),false);assert.equal(f.parked.isEnabled(false),true);
});


for (const quality of ["medium", "high"] as const)
  test("current23Oct " + quality + " prepares both physical car profiles independently of today's keyed preview", async t => {
    const current = Date.parse("2026-10-23T12:00:00Z"), keyed = Date.parse("2026-10-23T22:00:00Z"), keyless = Date.parse("2026-10-10T22:00:00Z");
    assert.equal(selectLightingPreview("night", current).instant, keyed);
    const source = (instant: number) => { const sun=sunState(instant),moon=moonState(instant);return sampleArtLighting(sun.altitude,.99,0,moon.altitude,moon.fraction,moon.distance).keySource; };
    assert.equal(source(keyed), "moon"); assert.equal(source(keyless), "none");
    const f=fixture(t,quality,true,false,current), requestedTime=f.game.timeOverride;
    const result=await f.finish(f.start()); assert.equal(result.status,"complete");
    for(const [prefix,instant,nonStreet] of [["vehicle-",keyless,2],["vehicle-keyed-",keyed,3]] as const) {
      for(const n of [0,1,2]) {
        const label=prefix+n,state=f.stages.get(label);assert.ok(state,"both physical profile stages must actually draw: "+label);
        assert.equal(state.instant,instant,"sky/environment receives the real selected UTC");assert.equal(state.nonStreet,nonStreet);
        assert.equal(state.points,Math.min(n,4-nonStreet));assert.equal(state.beam,true);assert.equal(state.shadow,true);assert.equal(state.shadowMapSize,quality==="medium"?256:512);
        assert.ok(state.draws>=2);assert.ok(result.stages.find((s:any)=>s.stage===label).renders>=3);
        for(const effect of state.effects as {defines:string}[]) {assert.match(effect.defines,/^#define SPOTLIGHT\d+$/m);assert.match(effect.defines,/^#define SHADOW\d+$/m);assert.equal((effect.defines.match(/^#define POINTLIGHT\d+$/gm)??[]).length,Math.min(n,4-nonStreet));}
      }
    }
    assert.equal(f.game.timeOverride,requestedTime);assert.equal(f.stages.get("restore")!.instant,requestedTime);assert.equal(f.invariant(),f.initial);
    const generator=f.beam.light.getShadowGenerator()!,map=generator.getShadowMap()!,before=f.counts().programs;
    for(const [prefix,instant,capacity] of [["vehicle-",keyless,2],["vehicle-keyed-",keyed,1]] as const) {
      f.game.timeOverride=instant;
      for(const n of [0,1,2]) assert.deepEqual(await f.drive(Math.min(n,capacity)),f.stages.get(prefix+n)!.effects);
    }
    assert.equal(f.counts().programs,before,"both physically reachable prepared layouts reuse Effects");assert.equal(generator.getShadowMap(),map);f.game.timeOverride=requestedTime;
  });


for(const ending of ["cancel","timeout","throw"] as const)
  test("keyed car profile restores concrete roots and actual requested time on "+ending, async t => {
    const f=fixture(t,"medium",true,false,Date.parse("2026-10-23T12:00:00Z")),requested=f.game.timeOverride;
    const pending=f.start({timeoutMs:1000});await f.until("vehicle-keyed-0");
    if(ending==="cancel") f.game.cancelLightPreparation();
    if(ending==="timeout") f.advanceClock(1001);
    if(ending==="throw") f.hook(()=>{f.hook();throw Error("keyed original draw failure");});
    const result=await f.finish(pending);assert.equal(result.status,ending==="cancel"?"disposed":ending==="timeout"?"timeout":"failed");
    assert.equal(f.car.isEnabled(false),false);assert.equal(f.parked.isEnabled(false),true);assert.equal(f.game.timeOverride,requested);assert.equal(f.game.cancelLightPreparation,undefined);
  });

test("keyed car profile revision reapplies real sky and restores latest current requests",async t=>{
  const f=fixture(t,"medium",true,false,Date.parse("2026-10-23T12:00:00Z")),pending=f.start();await f.until("vehicle-keyed-0");
  const current=Date.parse("2026-10-23T10:00:00Z");f.game.timeOverride=current;f.game.flashlightOn=true;f.game.quality="high";f.game.weather={cloud:.4,rain:0,wind:0};
  await f.tick();const result=await f.finish(pending);assert.equal(result.status,"complete");const stage=result.stages.find((s:any)=>s.stage==="vehicle-keyed-0");
  assert.ok(stage.restartReasons.timeOverride>=1);assert.ok(stage.restartReasons.quality>=1);assert.ok(stage.restartReasons.weather>=1);
  assert.equal(f.stages.get("vehicle-keyed-0")!.instant,Date.parse("2026-10-23T22:00:00Z"));assert.equal(f.stages.get("vehicle-keyed-0")!.nonStreet,3);
  assert.equal(f.stages.get("restore")!.instant,current);assert.equal(f.game.timeOverride,current);assert.equal(f.game.flashlightOn,true);assert.equal((f.beam.light.getShadowGenerator() as ShadowGenerator).mapSize,512);
});

test("actual bounded shader inventory truthfully aggregates the23 requested preparation/lifecycle labels",()=>{
  const observable={add:()=>({remove(){}})},engine={isWebGPU:true,onDisposeObservable:observable,onContextRestoredObservable:observable};
  const profile=new WebGpuCompilationProfile(engine,{captureShaderInventory:true,shaderInventoryLimits:{maxStages:21}});
  try {
    const labels=["construction","assets",...vehicleStages,...originalStages,"submitted-frame","ready"];
    assert.equal(new Set(labels).size,23);for(const label of labels)profile.setStage(label);
    const inventory=profile.snapshot().shaderInventory!;assert.equal(inventory.limits.maxStages,21);assert.equal(inventory.stages.length,21);
    assert.equal(inventory.stages[0].name,"unassigned");assert.equal(inventory.stages.at(-1)!.name,"overflow");assert.equal(inventory.stageOverflow,4);
    assert.equal(inventory.stages.filter(s=>!["unassigned","overflow"].includes(s.name)).length,19,"bounded evidence does not pretend every physical stage is individually retained");
  } finally {profile.dispose();}
});


test("fixed car nights restore real clock without publishing either preparation UTC",async t=>{
  const f=fixture(t,"medium",true,false,Date.parse("2026-10-23T12:00:00Z"));f.game.timeOverride=null;
  const before=Date.now(),result=await f.finish(f.start()),after=Date.now();assert.equal(result.status,"complete");
  assert.equal(f.game.timeOverride,null);const restored=f.stages.get("restore")!.instant;
  assert.ok(restored>=before&&restored<=after);assert.notEqual(restored,Date.parse("2026-10-10T22:00:00Z"));assert.notEqual(restored,Date.parse("2026-10-23T22:00:00Z"));
  assert.equal(f.car.isEnabled(false),false);assert.equal(f.parked.isEnabled(false),true);
});
