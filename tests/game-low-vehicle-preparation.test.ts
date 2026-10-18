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
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PlayerFlashlight } from "../client/flashlight";
import { VehicleLighting } from "../client/vehicle-lighting";
import { StableLightState } from "../client/stable-light-state";
import { GltfLightBudget } from "../client/gltf-light-budget";
import { prepareLightVariants } from "../client/light-preparation";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { applyArtLighting } from "../client/art-lighting";
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
      "prepareLightingVariants",
      "isMeshReadyForCamera",
      "updateRenderEnvironment",
    ].includes(n.name.getText(source)),
);
assert.equal(methods.length, 3);
const code = ts.transpileModule(
  `class TestGame {${methods.map((n) => n.getText(source)).join("\n")}}`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const make = new Script(
  `(env)=>{const {PlayerFlashlight,Vector3,MeshBuilder,prepareLightVariants,arePreparationEffectsReady,selectLightingPreview,applyArtLighting,performance,window,document}=env;${code};return TestGame;}`,
).runInThisContext();
const anchor = Date.parse("2026-10-18T12:45:00Z");
const select = (mode: Parameters<typeof selectLightingPreview>[0]) =>
  selectLightingPreview(mode, anchor);
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
) {
  const engine = new NullEngine(),
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
    visualWrites = 0;
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
  const requested = { quality, revision: 17 };
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
    PlayerFlashlight,
    Vector3,
    MeshBuilder,
    prepareLightVariants,
    arePreparationEffectsReady: () => arePreparationEffectsReady(engine),
    selectLightingPreview: select,
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
    timeOverride: select("night").instant,
    flashlightOn: false,
    disposed: false,
    rendererFailed: false,
    adaptive: { state: requested },
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
    scene.render();
    draws++;
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
        points: streets.filter((l) => l.isEnabled()).length,
        quality: game.quality,
        instant: game.timeOverride,
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
    invariant,
    initial,
    draw,
    tick,
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

test("low WebGPU actual Game prepares two car variants before original13 and subsequent driving reuses Effects", async (t) => {
  const f = fixture(t),
    result = await f.finish(f.start());
  assert.equal(result.status, "complete");
  assert.deepEqual(
    result.stages.map((s: any) => s.stage),
    ["vehicle-0", "vehicle-1", ...originalStages],
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

test("medium WebGPU and low WebGL retain original13/9 without leasing vehicle roots", async (t) => {
  for (const [quality, gpu, count] of [
    ["medium", true, 13],
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

for (const ending of [
  "cancel",
  "disposed",
  "fault",
  "timeout",
  "throw",
] as const)
  test(`vehicle lease releases correctly on ${ending}`, async (t) => {
    const f = fixture(t),
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

for (const disposedRoot of ["car", "parked"] as const)
  test(`single live-scene root disposal fails closed: ${disposedRoot}`, async (t) => {
    const f = fixture(t), pending = f.start();
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

test("replacement roots restart the vehicle stage and never receive the old lease flags", async (t) => {
  const f = fixture(t),
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
    19,
    "19 named opt-in inventory labels fit maxStages21 including overflow",
  );
});
