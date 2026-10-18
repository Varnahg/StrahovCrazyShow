import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { SmartArray } from "@babylonjs/core/Misc/smartArray";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PlayerFlashlight } from "../client/flashlight";
import { StableLightState } from "../client/stable-light-state";
import { prepareLightVariants } from "../client/light-preparation";
import { AvatarPreparationFarPlane } from "../client/avatar-preparation-far-plane";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { createEnvironmentProfile } from "../client/environment-profile";
import { selectLightingPreview } from "../client/lighting-preview";
import { B6_LAYOUT } from "../shared/b6-interior";
import { clampOrbitPitch, DEFAULT_ORBIT_PITCH } from "../client/camera-look";
import { DEFAULT_ORBIT_DISTANCE, orbitCameraTarget, orbitCameraDesired } from "../client/camera-orbit";
import { LocalAvatarPresentation } from "../client/local-avatar-presentation";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";

const source = ts.createSourceFile(
  "game.ts",
  readFileSync(
    process.env.GAME_PREPARATION_SOURCE ??
      new URL("../client/game.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === "Game",
)!;
const members = declaration.members.filter(
  (node) =>
    node.name &&
    ["prepareLighting", "isMeshReadyForCamera", "updateCameraFollow", "footFirstPerson", "updateWorldPresentation", "updateRenderEnvironment"].includes(
      node.name.getText(source),
    ),
);
const compiled = ts.transpileModule(
  `class PreparationGame { ${members.map((node) => node.getText(source)).join("\n")} };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const make = new Script(`(function(environment) {
  const { PlayerFlashlight, Vector3, prepareLightVariants, AvatarPreparationFarPlane, arePreparationEffectsReady, selectLightingPreview, B6_LAYOUT, clampOrbitPitch, DEFAULT_ORBIT_PITCH, DEFAULT_ORBIT_DISTANCE, orbitCameraTarget, orbitCameraDesired, applyArtLighting, performance, window, document } = environment;
  ${compiled}
  return PreparationGame;
})`).runInThisContext();

function fixture(t: import("node:test").TestContext) {
  const realEngine = new NullEngine();
  const scene = new Scene(realEngine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera(
    "actual startup camera",
    new Vector3(0, 2, -4),
    scene,
  );
  scene.activeCamera = camera;
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const streets = [0, 1, 2].map(
    (index) =>
      new PointLight(
        "mapped lamp " + index,
        new Vector3(index + 1, 3, 0),
        scene,
      ),
  );
  const lightStates: { streets: number; beam: boolean; enabled: number }[] = [];
  const caster = MeshBuilder.CreateBox("actual beam caster", {}, scene);
  caster.position.set(0, 1, 4);
  caster.material = new StandardMaterial("actual receiver", scene);
  caster.metadata = { depthCaster: "opaque" };
  const stableLights = new StableLightState(scene);
  let now = 0,
    loop: (() => void) | undefined,
    timer: (() => void) | undefined;
  let effectsReady = true,
    draws = 0,
    readyCalls = 0;
  let stage = "";
  const states: {
    instant: number;
    enabled: boolean;
    quality: string;
    self: unknown;
    pass: number;
  }[] = [];
  const Game = make({
    PlayerFlashlight,
    Vector3,
    prepareLightVariants,
    AvatarPreparationFarPlane,
    arePreparationEffectsReady,
    selectLightingPreview,
    B6_LAYOUT,
    clampOrbitPitch,
    DEFAULT_ORBIT_PITCH, DEFAULT_ORBIT_DISTANCE, orbitCameraTarget, orbitCameraDesired,
    performance: { now: () => now },
    document: {
      hidden: false,
      addEventListener() {},
      removeEventListener() {},
    },
    window: {
      setTimeout(callback: () => void) {
        timer = callback;
        return 1;
      },
      clearTimeout() {
        timer = undefined;
      },
    },
  });
  const engine = {
    isWebGPU: false,
    isDisposed: false,
    currentRenderPassId: 901,
    areAllEffectsReady: () => effectsReady,
    runRenderLoop(callback: () => void) {
      assert.equal(loop, undefined);
      loop = callback;
    },
    stopRenderLoop(callback: () => void) {
      if (loop === callback) loop = undefined;
    },
  };
  const rig = {
    root: new TransformNode("actual fixture avatar", scene),
    eyeHeight: 1.63,
    bodyHeight: 1.8,
    measurements: { legSpacing: 0.105 },
  };
  const health = {
    errorCount: 0,
    pendingOperations: 0,
    pendingPreparationOperations: 0,
    pendingShaderValidationOperations: 0,
    phase: "preparing",
  };
  const game = Object.assign(new Game(), {
    scene,
    camera,
    engine,
    renderHealth: { snapshot: () => health },
    compilationProfile: { setStage(value: string) { stage = value; } },
    stableLights,
    lights: streets,
    ready: false,
    disposed: false,
    quality: "medium",
    timeOverride: 1792144800000,
    flashlightOn: false,
    profile: {},
    weather: {},
    localId: "local",
    avatars: new Map([["local", rig]]),
    actor: { position: { x: 0, y: 1, z: 0 }, vehicle: false },
    localAvatarPresentation: {
      update: () => ({
        visible: true,
        resetAnimation: false,
        cameraLight: false,
      }),
    },
    updateWorldPresentation() {
      assert.equal(game.ready, false);
    },
    updateCameraFollow(_position: unknown, _height: number, dt: number) {
      assert.equal(dt, 1);
    },
    updateAvatarPresentation() {
      assert.equal(game.ready, false);
    },
    updateRenderEnvironment(
      _pos: unknown,
      self: unknown,
      _cameraLight: boolean,
      dt: number,
      _time: number,
      instant: number,
      enabled: boolean,
    ) {
      assert.equal(dt, 0);
      assert.equal(game.ready, false);
      states.push({
        instant,
        enabled,
        quality: game.quality,
        self,
        pass: engine.currentRenderPassId,
      });
      // The actual owned torch/ShadowGenerator exercise ON/OFF restoration.
      game.flashlight.beam.updateFromPose(
        new Vector3(0, 1, 0),
        Vector3.Forward(),
        enabled,
        game.quality,
      );
      streets.forEach((light, index) => {
        light.setEnabled(index === 0);
        light.intensity = index === 0 ? 0.7 : 0;
      });
      return { night: 1 };
    },
    advanceSimulation() {
      assert.fail("startup advanced physics");
    },
    onBeforeInputFrame() {
      assert.fail("startup drained authorities");
    },
    onInput() {
      assert.fail("startup sent an input");
    },
    applyAdaptiveQuality() {
      assert.fail("startup sampled adaptive quality");
    },
    frame() {
      assert.fail("startup invoked interactive frame");
    },
  });
  // Public active list with controlled readiness checks verifies camera-pass
  // wiring. GPU readiness and timing belong to the production A/B acceptance.
  const activeMeshes = new SmartArray<AbstractMesh>(1);
  activeMeshes.push(caster);
  scene.getActiveMeshes = () => activeMeshes;
  caster.isReady = () => {
    readyCalls++;
    assert.equal(engine.currentRenderPassId, camera.renderPassId);
    return true;
  };
  const render = () => {
    assert.equal(game.ready, false);
    assert.equal(engine.currentRenderPassId, 901);
    draws++;
    stableLights.update();
    lightStates.push({
      streets: streets.filter((light) => light.isEnabled()).length,
      beam: game.flashlight.beam.light.isEnabled(),
      enabled: scene.lights.filter((light) => light.isEnabled()).length,
    });
  };
  t.after(() => {
    game.flashlight?.dispose();
    stableLights.dispose();
    scene.dispose();
    realEngine.dispose();
  });
  return {
    game,
    camera,
    get stage() { return stage; },
    realCameraFollow: Game.prototype.updateCameraFollow.bind(game),
    realWorldPresentation: Game.prototype.updateWorldPresentation.bind(game),
    scene,
    states,
    rig,
    streets,
    lightStates,
    engine,
    health,
    start: (pipelines?: { isReady(): boolean }) => {
      assert.equal(
        typeof game.prepareLighting,
        "function",
        "actual Game must prepare its initial light variants before ready",
      );
      return game.prepareLighting(render, pipelines);
    },
    tick() {
      now += 16;
      loop?.();
    },
    finish() {
      for (let i = 0; loop && i < 200; i++) {
        now += 16;
        loop();
      }
      assert.equal(loop, undefined);
    },
    timeout() {
      now = 30001;
      timer?.();
    },
    effects(value: boolean) {
      effectsReady = value;
    },
    get draws() {
      return draws;
    },
    get checks() {
      return readyCalls;
    },
    get hasTimer() {
      return !!timer;
    },
  };
}

test("actual Game light stages wait for pipeline and complete-frame readiness", async (t) => {
  const f = fixture(t);
  let ready = false;
  const preparation = f.start({ isReady: () => ready });
  for (let i = 0; i < 12; i++) f.tick();
  assert.equal(f.states.length, 1, "pending native pipeline must keep the current light stage");
  assert.equal(f.game.ready, false);
  ready = true;
  f.finish();
  const result = await preparation;
  assert.equal(result.status, "complete");
  assert.equal(result.stages.length, 9);
  assert.ok(result.stages.every((stage: { renders: number }) => stage.renders >= 3));
});

test("actual Game shader inventory follows the real loopback diagnostic opt-in", () => {
  const constructor = declaration.members.find(ts.isConstructorDeclaration)!;
  const assignments = constructor.body!.statements.filter((statement) => {
    if (!ts.isExpressionStatement(statement) || !ts.isBinaryExpression(statement.expression))
      return false;
    return ["this.environmentProfile", "this.compilationProfile"].includes(
      statement.expression.left.getText(source),
    );
  });
  assert.equal(assignments.length, 2);
  const body = ts.transpileModule(
    `function initialize() { ${assignments.map((node) => node.getText(source)).join("\n")} }`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const initialize = new Script(`(function(environment) {
    const { createEnvironmentProfile, WebGpuCompilationProfile, sessionDiagnostics, window } = environment;
    ${body}
    return initialize;
  })`).runInThisContext();
  for (const [url, expected] of [
    ["http://127.0.0.1:4193/", false],
    ["https://example.com/?profileEnvironment=1", false],
    ["http://127.0.0.1:4193/?profileEnvironment=1", true],
  ] as const) {
    let captured: { shader: boolean; unusedDefines: boolean; limits?: { maxStages: number } } | undefined;
    const run = initialize({
      createEnvironmentProfile,
      WebGpuCompilationProfile: class {
        constructor(_engine: unknown, options: {
          captureShaderInventory: boolean;
          captureUnusedDefineInventory: boolean;
          shaderInventoryLimits?: { maxStages: number };
        }) {
          captured = {
            shader: options.captureShaderInventory,
            unusedDefines: options.captureUnusedDefineInventory,
            limits: options.shaderInventoryLimits,
          };
        }
      },
      sessionDiagnostics: { event() {} },
      window: { location: new URL(url) },
    });
    run.call({ engine: {}, renderHealth: { rendererId: 1 } });
    assert.deepEqual(captured, { shader: expected, unusedDefines: expected, limits: expected ? { maxStages: 21 } : undefined }, url);
  }
});

test("actual Game prepares current/night OFF/ON with one real torch and restores current requested state", async (t) => {
  const f = fixture(t);
  const requested = {
    quality: f.game.quality,
    instant: f.game.timeOverride,
    torch: f.game.flashlightOn,
  };
  const result = f.start();
  f.finish();
  assert.equal((await result).status, "complete");
  assert.deepEqual(
    f.states.map((state) => state.enabled),
    [false, true, false, true, false, true, false, true, false, false],
  );
  assert.equal(f.states[0].instant, requested.instant);
  assert.equal(f.states[2].instant, selectLightingPreview("night").instant);
  assert.equal(f.states.at(-1)!.instant, requested.instant);
  assert.deepEqual(
    {
      quality: f.game.quality,
      instant: f.game.timeOverride,
      torch: f.game.flashlightOn,
    },
    requested,
  );
  assert.equal(f.game.ready, false);
  assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
  assert.equal(f.game.flashlight.beam.light.intensity, 0);
  assert.ok(
    !f.scene.meshes[0].lightSources.includes(f.game.flashlight.beam.light),
  );
  assert.ok(
    f.game.flashlight.beam.light.getShadowGenerator(),
    "real configured shadow resource survives for gameplay reuse",
  );
  assert.equal(f.engine.currentRenderPassId, 901);
  assert.equal(f.draws, 27);
  assert.deepEqual(
    new Set(f.lightStates.map((state) => `${state.streets}:${state.beam}`)),
    new Set(["0:false", "0:true", "1:false", "1:true", "2:false", "2:true"]),
  );
  assert.ok(f.lightStates.every((state) => state.enabled <= 4));
  assert.deepEqual(
    f.streets.map((light) => [light.isEnabled(), light.intensity]),
    [
      [true, 0.7],
      [false, 0],
      [false, 0],
    ],
  );
  assert.ok(f.checks > 0);
  assert.equal(f.game.cancelLightPreparation, undefined);
  assert.equal(f.hasTimer, false);
});

test("night preparation respects low quality and the actual celestial key slot", async (t) => {
  const low = fixture(t);
  low.game.quality = "low";
  const lowResult = low.start();
  low.finish();
  assert.equal((await lowResult).status, "complete");
  assert.ok(low.lightStates.every((state) => state.streets <= 1));
  const moon = fixture(t);
  new DirectionalLight("moon", Vector3.Down(), moon.scene);
  const moonResult = moon.start();
  moon.finish();
  assert.equal((await moonResult).status, "complete");
  assert.ok(moon.lightStates.every((state) => state.enabled <= 4));
  assert.ok(
    moon.lightStates
      .filter((state) => state.beam)
      .every((state) => state.streets <= 1),
  );
});

test("actual Game overlaps shader diagnostics while retaining preparation barriers", async (t) => {
  const f = fixture(t);
  Object.assign(f.health, {
    pendingOperations: 3,
    pendingPreparationOperations: 1,
    pendingShaderValidationOperations: 2,
  });
  const pending = f.start();
  for (let index = 0; index < 12; index++) f.tick();
  assert.equal(f.states.length, 1, "real preparation still blocks the first variant");
  f.health.pendingPreparationOperations = 0;
  f.health.pendingOperations = 2;
  f.finish();
  assert.equal((await pending).status, "complete");
  assert.equal(f.health.pendingOperations, 2, "diagnostics remain owned by the final startup gate");
  assert.equal(f.game.ready, false, "preparing variants never announces playable state");
  assert.equal(f.hasTimer, false);
});

test("actual Game does not accept native hot-swap readiness while a new effect is pending", async (t) => {
  const f = fixture(t);
  let newEffectReady = false;
  Object.assign(f.engine, {
    isWebGPU: true,
    _compiledEffects: {
      previous: { isReady: () => true, getEngine: () => f.engine, isDisposed: false },
      next: { isReady: () => newEffectReady, getEngine: () => f.engine, isDisposed: false },
    },
  });
  const pending = f.start();
  for (let index = 0; index < 12; index++) f.tick();
  assert.equal(f.states.length, 1, "native stub and ready old effect cannot advance the stage");
  newEffectReady = true;
  f.finish();
  assert.equal((await pending).status, "complete");
  assert.equal(f.game.ready, false);
});

test("late validation failure still stops actual Game variant preparation", async (t) => {
  const f = fixture(t);
  Object.assign(f.health, { pendingOperations: 1, pendingShaderValidationOperations: 1 });
  const pending = f.start();
  f.tick();
  Object.assign(f.health, { errorCount: 1, phase: "invalid" });
  f.finish();
  assert.equal((await pending).status, "failed");
  assert.equal(f.game.ready, false);
  assert.equal(f.hasTimer, false);
  assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
});

test("settings/avatar changes during wait are preserved and current local rig is reacquired", async (t) => {
  const f = fixture(t);
  const pending = f.start();
  f.tick();
  const replacement = { ...f.rig };
  f.game.quality = "high";
  f.game.timeOverride = 1792188000000;
  f.game.avatars.set("local", replacement);
  f.game.profile = {};
  f.finish();
  assert.equal((await pending).status, "complete");
  assert.equal(f.states.at(-1)!.instant, 1792188000000);
  assert.equal(f.states.at(-1)!.self, replacement);
  assert.equal(f.states.at(-1)!.quality, "high");
  assert.equal(f.game.quality, "high");
  assert.equal(f.game.timeOverride, 1792188000000);
  assert.equal(f.game.flashlightOn, false);
});

test("actual Game cancellation settles pending new effects without restoring disposed objects", async (t) => {
  const f = fixture(t);
  f.effects(false);
  const pending = f.start();
  f.tick();
  const states = f.states.length;
  f.game.disposed = true;
  f.game.cancelLightPreparation();
  assert.equal((await pending).status, "disposed");
  assert.equal(f.states.length, states);
  assert.equal(f.game.ready, false);
  assert.equal(f.hasTimer, false);
  assert.equal(f.game.cancelLightPreparation, undefined);
});

test("retired renderer cancels lighting without restoring environment or issuing another draw", async (t) => {
  for (const explicitCancel of [true, false]) {
    const f = fixture(t);
    f.effects(false);
    const pending = f.start();
    f.tick();
    const states = f.states.length, draws = f.draws;
    f.game.rendererFailed = true;
    assert.equal(f.game.disposed, false, "failure precedes final scene disposal");
    if (explicitCancel) f.game.cancelLightPreparation();
    else f.tick();
    assert.equal((await pending).status, "disposed");
    assert.equal(f.states.length, states, "no restore/upload after a terminal fault");
    assert.equal(f.draws, draws);
    assert.equal(f.game.cancelLightPreparation, undefined);
    assert.equal(f.hasTimer, false);
  }
});

test("actual Game timeout reports incomplete work and restores OFF while allowing startup caller to decide", async (t) => {
  const f = fixture(t);
  f.effects(false);
  const pending = f.start();
  f.tick();
  f.timeout();
  assert.equal((await pending).status, "timeout");
  assert.equal(f.game.ready, false);
  assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
  assert.equal(f.engine.currentRenderPassId, 901);
});

test("production startup awaits preparation before ready and records its outcome; dispose aborts first", () => {
  const start = declaration.members
    .find((node) => node.name?.getText(source) === "startContent")!
    .getText(source);
  const prepare = start.search(
    /await\s+this\.renderHealth\.guard\(\s*this\.prepareLighting\(preloadRender, pipelinePreparation\)/,
  );
  const avatars = start.indexOf(
    "this.updatePlayers(this.pendingPlayers ?? [this.localPlayer])",
  );
  assert.ok(avatars >= 0 && prepare > avatars);
  assert.ok(
    prepare > start.indexOf("this.engine.stopRenderLoop(preloadRender)"),
  );
  assert.ok(prepare < start.indexOf("this.ready = true"));
  assert.ok(
    start.includes(
      'sessionDiagnostics.event("lighting-preparation", preparation)',
    ),
  );
  const dispose = declaration.members
    .find((node) => node.name?.getText(source) === "dispose")!
    .getText(source);
  assert.ok(
    dispose.indexOf("this.cancelLightPreparation?.()") <
      dispose.indexOf("this.scene.dispose()"),
  );
});

test("actual readiness error restores camera pass and leaves the requested OFF state intact", async (t) => {
  const f = fixture(t);
  f.scene.getActiveMeshes().data[0].isReady = () => {
    throw new Error("controlled shader preparation failure");
  };
  const pending = f.start();
  f.tick();
  f.tick();
  const result = await pending;
  assert.equal(result.status, "failed");
  assert.equal(result.failureStep, "check");
  assert.equal(f.engine.currentRenderPassId, 901);
  assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
  assert.equal(f.game.cancelLightPreparation, undefined);
  assert.equal(f.hasTimer, false);
});

function b6Fixture(t: import("node:test").TestContext) {
  const f = fixture(t);
  f.engine.isWebGPU = true; f.scene.useRightHandedSystem = true;
  Object.assign(f.engine, { _compiledEffects: { requested: {
    isDisposed: false, getEngine: () => f.engine, isReady: () => f.engine.areAllEffectsReady(),
  } } });
  Object.assign(f.game, { firstPerson: false, yaw: Math.PI, pitch: 0.28, distance: 8,
    cameraArm: 8, vehicleCameraSnap: false,
    sim: { cameraDistance: (from: Vector3, to: Vector3, actor: unknown) => {
      assert.ok(actor === f.game.actor); return Vector3.Distance(from, to);
    } },
  });
  Object.freeze(f.game.actor.position); Object.freeze(f.game.actor);
  const presentation = new LocalAvatarPresentation();
  f.game.localAvatarPresentation = presentation;
  Object.assign(f.rig, { root: new TransformNode("unchanged actor presentation", f.scene),
    rightElbow: new TransformNode("unchanged hand", f.scene) });
  const rootPosition = (f.rig as any).root.position.clone();
  const world: { stage: string; pos: number[] }[] = [];
  const environment: { stage: string; pos: number[]; force: boolean; self: unknown; instant: number; on: boolean }[] = [];
  let savedPosition: Vector3 | undefined, savedMatrix: number[] | undefined;
  let savedView: typeof presentation.state | undefined, savedArm = 0;
  let savedRequests: unknown;
  const requests = () => [f.game.pitch, f.game.yaw, f.game.distance, f.game.cameraArm, f.game.vehicleCameraSnap, f.game.firstPerson];
  const setStage = f.game.compilationProfile.setStage;
  f.game.compilationProfile.setStage = (stage: string) => {
    if (stage === "b6-day-off" && !savedPosition) {
      savedMatrix = Array.from(f.camera.getViewMatrix(true).m);
      savedPosition = f.camera.position.clone();
      savedView = { ...presentation.state }; savedArm = f.game.cameraArm;
      savedRequests = requests();
    }
    setStage(stage);
  };
  f.game.b6Reality = { stats: { loadedAssets: 2 }, update({ player }: { player: Vector3 }) {
    if (f.stage.startsWith("b6-day")) savedRequests = requests();
    world.push({ stage: f.stage, pos: [player.x, player.y, player.z] });
  } };
  f.game.updateWorldPresentation = f.realWorldPresentation;
  f.game.updateCameraFollow = (position: Vector3, height: number, dt: number) => {
    assert.ok(!f.stage.startsWith("b6-day"), "synthetic position never enters follow-camera history");
    if (savedPosition && f.stage === "restore") {
      assert.ok(Vector3.Distance(f.camera.position, savedPosition) < 1e-8, "restore starts from pre-B6 camera");
      const restored = Array.from(f.camera.getViewMatrix(true).m);
      assert.ok(restored.every((value, index) => Math.abs(value - savedMatrix![index]) < 1e-5));
      savedPosition = undefined; savedMatrix = undefined;
    }
    f.realCameraFollow(position, height, dt);
  };
  f.game.updateAvatarPresentation = () => {
    assert.ok(!f.stage.startsWith("b6-day"), "synthetic position never enters avatar LOD/animation/contact history");
  };
  const originalEnvironment = f.game.updateRenderEnvironment;
  f.game.updateRenderEnvironment = (pos: Vector3, self: any, cameraLight: boolean, dt: number,
    time: number, instant: number, on: boolean, phaseEnds: unknown, force: boolean) => {
    environment.push({ stage: f.stage, pos: [pos.x, pos.y, pos.z], force, self, instant, on });
    if (f.stage.startsWith("b6-day")) {
      assert.equal(cameraLight, true); assert.equal(dt, 0); assert.equal(phaseEnds, undefined);
      assert.deepEqual(presentation.state, savedView);
      assert.equal(f.game.cameraArm, savedArm);
      assert.deepEqual(requests(), savedRequests, "virtual B6 must not write orbit requests or snap history");
      assert.ok((f.rig as any).root.position.equals(rootPosition));
      // Actual camera-origin PlayerFlashlight update, with a live minimum rig.
      f.game.flashlight.update(self, f.camera, on, cameraLight, f.game.quality);
      return { night: 0 };
    }
    return originalEnvironment.call(f.game, pos, self, cameraLight, dt, time, instant, on);
  };
  return Object.assign(f, { world, environment,
    advanceTo(stage: string) { for (let i = 0; f.stage !== stage && i < 200; i++) f.tick(); assert.equal(f.stage, stage); },
  });
}

test("B6 pair uses source-derived landing and real camera torch, then restores latest requests without teleporting", async (t) => {
  const f = b6Fixture(t), initialActor = JSON.stringify(f.game.actor);
  const pending = f.start(); f.advanceTo("b6-day-on");
  const b6 = f.environment.filter((entry) => entry.stage.startsWith("b6-day"));
  assert.deepEqual(b6.map((entry) => entry.on), [false, true]);
  assert.ok(b6.every((entry) => entry.force && entry.instant === selectLightingPreview("day").instant));
  assert.deepEqual(b6[0].pos, [B6_LAYOUT.entry.x, B6_LAYOUT.foundationOffset + 0.8, B6_LAYOUT.entry.landingMaxZ]);
  const target = orbitCameraTarget(new Vector3(...b6[0].pos as [number, number, number]), false);
  const desired = orbitCameraDesired(target, 0, DEFAULT_ORBIT_PITCH, DEFAULT_ORBIT_DISTANCE);
  assert.ok(Vector3.Distance(f.camera.position, desired) < 1e-8);
  assert.ok(Vector3.Distance(f.game.flashlight.beam.light.direction, target.subtract(desired).normalize()) < 1e-5);
  assert.equal(f.game.firstPerson, false);
  f.game.quality = "high"; f.game.timeOverride = 1792303200000; f.game.flashlightOn = true;
  f.game.yaw = 0.75; f.game.pitch = 0.6; f.game.firstPerson = true;
  f.finish(); const result = await pending;
  assert.equal(result.status, "complete"); assert.equal(result.stages.length, 15);
  assert.equal(JSON.stringify(f.game.actor), initialActor);
  assert.equal(f.game.firstPerson, true); assert.equal(f.game.yaw, 0.75); assert.equal(f.game.pitch, 0.6);
  assert.equal(f.game.flashlightOn, true); assert.equal(f.game.quality, "high");
  assert.equal(f.environment.at(-1)!.instant, 1792303200000);
  assert.ok(f.environment.some((entry) => entry.stage === "restore" && entry.force));
  assert.equal(f.camera.position.x, f.game.actor.position.x);
  assert.equal(f.camera.position.z, f.game.actor.position.z);
  assert.ok(Math.abs(f.camera.position.y - (f.game.actor.position.y - 0.8 + f.rig.eyeHeight)) < 1e-8);
  assert.equal(f.engine.currentRenderPassId, 901); assert.equal(f.game.ready, false);
});

test("B6 controller identity and loaded-asset revision restart only the pending coverage stage", async (t) => {
  const f = b6Fixture(t); const pending = f.start(); f.advanceTo("b6-day-off");
  f.effects(false); f.game.b6Reality.stats.loadedAssets++;
  f.tick();
  f.game.b6Reality = { ...f.game.b6Reality, stats: { ...f.game.b6Reality.stats } };
  f.tick(); f.effects(true); f.finish();
  const result = await pending;
  const stage = result.stages.find((entry: { stage: string }) => entry.stage === "b6-day-off")!;
  assert.equal(stage.restarts, 2);
  assert.equal(stage.restartReasons.b6Assets, 1); assert.equal(stage.restartReasons.b6Controller, 1);
  assert.equal(result.status, "complete");
});

test("WebGPU day POINT pair uses existing spawn apply, covers OFF and ON, and re-reads pending requests", async (t) => {
  const f = b6Fixture(t), actor = JSON.stringify(f.game.actor);
  const original = f.game.updateRenderEnvironment;
  f.game.updateRenderEnvironment = (...args: any[]) => {
    const result = original(...args);
    return f.stage.startsWith("day-1-") ? { night: 0 } : result;
  };
  const pending = f.start(); f.advanceTo("day-1-off");
  assert.equal(f.environment.at(-1)!.on, false);
  assert.equal(f.environment.at(-1)!.instant, selectLightingPreview("day").instant);
  assert.deepEqual(f.environment.at(-1)!.pos, [0, 1, 0]);
  assert.deepEqual(f.streets.map(l => [l.isEnabled(), l.intensity]), [[true, 0], [false, 0], [false, 0]]);
  f.effects(false); f.game.quality = "low"; f.game.timeOverride = 1792303200000;
  const replacement = { ...f.rig }; f.game.avatars.set("local", replacement); f.game.profile = {};
  f.tick(); assert.equal(f.stage, "day-1-off");
  f.effects(true); f.advanceTo("day-1-on");
  assert.equal(f.environment.at(-1)!.on, true); assert.equal(f.environment.at(-1)!.self, replacement);
  assert.equal(f.game.flashlight.beam.light.isEnabled(), true);
  assert.deepEqual(f.streets.map(l => [l.isEnabled(), l.intensity]), [[true, 0], [false, 0], [false, 0]]);
  f.finish(); const result = await pending;
  assert.equal(result.status, "complete");
  assert.equal(result.stages.find((s: { stage: string }) => s.stage === "day-1-off")!.restarts, 1);
  assert.equal(f.environment.at(-1)!.instant, 1792303200000);
  assert.equal(JSON.stringify(f.game.actor), actor);
  assert.equal(f.game.quality, "low"); assert.equal(f.game.flashlightOn, false);
});

test("virtual B6 uses read-only collision at source target and leaves follow history unchanged", async (t) => {
  const f = b6Fixture(t), calls: number[][] = [];
  f.game.sim.cameraDistance = (from: Vector3, to: Vector3, actor: unknown) => {
    assert.equal(actor, f.game.actor);
    if (!f.stage.startsWith("b6-day")) return Vector3.Distance(from, to);
    calls.push([...from.asArray(), ...to.asArray()]); return 2.5;
  };
  const pending = f.start(); f.advanceTo("b6-day-on");
  const body = new Vector3(B6_LAYOUT.entry.x, B6_LAYOUT.foundationOffset + .8, B6_LAYOUT.entry.landingMaxZ);
  const target = orbitCameraTarget(body, false), desired = orbitCameraDesired(target, 0, DEFAULT_ORBIT_PITCH, DEFAULT_ORBIT_DISTANCE);
  assert.deepEqual(calls, [0, 1].map(() => [...target.asArray(), ...desired.asArray()]));
  assert.ok(Vector3.Distance(f.camera.position, target.add(desired.subtract(target).normalize().scale(2.5))) < 1e-8);
  f.finish(); assert.equal((await pending).status, "complete");
});

test("day pair retains the same timeout and does not touch retired targets", async (t) => {
  for (const stage of ["day-0-on", "day-1-on"]) for (const ending of ["timeout", "disposed"] as const) {
    const f = b6Fixture(t), pending = f.start(); f.advanceTo(stage); f.effects(false);
    if (ending === "timeout") f.timeout();
    else {
      f.game.disposed = true;
      f.game.updateRenderEnvironment = () => assert.fail("retired day preparation restored");
      f.game.cancelLightPreparation();
    }
    const result = await pending; assert.equal(result.status, ending);
    assert.equal(f.hasTimer, false); assert.equal(f.game.ready, false);
    if (ending === "timeout") {
      assert.ok(result.activeElapsedMs >= 30000);
      assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
    }
  }
});

test("day zero POINT stages use actual OFF/ON membership without changing requested state or later point-one coverage", async (t) => {
  const f = b6Fixture(t), beforeActor = JSON.stringify(f.game.actor);
  new DirectionalLight("day sun", Vector3.Down(), f.scene);
  const receiver = f.scene.meshes.find(m => m.name === "actual beam caster")!;
  const original = f.game.updateRenderEnvironment;
  f.game.updateRenderEnvironment = (...args: any[]) => {
    const result = original(...args);
    return f.stage.startsWith("day-") ? { night: 0 } : result;
  };
  const pending = f.start(); f.advanceTo("day-0-off");
  assert.equal(f.environment.at(-1)!.instant, selectLightingPreview("day").instant);
  assert.deepEqual(f.environment.at(-1)!.pos, [0, 1, 0]);
  assert.equal(f.environment.at(-1)!.on, false);
  assert.ok(f.streets.every(light => !light.isEnabled() && light.intensity === 0));
  assert.deepEqual(receiver.lightSources.map(light => light.getClassName()), ["DirectionalLight", "HemisphericLight"]);
  f.effects(false); f.game.weather = {}; f.game.quality = "low"; f.game.timeOverride = 1792303200000;
  const replacement = { ...f.rig }; f.game.avatars.set("local", replacement); f.game.profile = {};
  f.tick(); assert.equal(f.stage, "day-0-off", "pending shaders keep the requested day0 variant active");
  assert.equal(f.environment.at(-1)!.self, replacement);
  f.effects(true); f.advanceTo("day-0-on");
  assert.equal(f.environment.at(-1)!.on, true);
  assert.ok(f.streets.every(light => !light.isEnabled() && light.intensity === 0));
  assert.deepEqual(receiver.lightSources.map(light => light.getClassName()), ["SpotLight", "DirectionalLight", "HemisphericLight"]);
  assert.equal(f.game.flashlightOn, false, "preparation does not change the requested torch");
  f.advanceTo("day-1-off");
  assert.deepEqual(f.streets.map(light => [light.isEnabled(), light.intensity]), [[true, 0], [false, 0], [false, 0]]);
  f.finish(); const result = await pending;
  assert.equal(result.status, "complete"); assert.equal(result.stages.length, 15);
  const day0 = result.stages.find((stage: { stage: string }) => stage.stage === "day-0-off")!;
  assert.equal(day0.restarts, 1); assert.equal(day0.restartReasons.weather, 1);
  assert.equal(f.environment.at(-1)!.instant, 1792303200000);
  assert.equal(f.game.flashlightOn, false); assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
  assert.equal(JSON.stringify(f.game.actor), beforeActor); assert.equal(f.game.ready, false);
});

test("B6 timeout restores presentation under the original 30 second deadline", async (t) => {
  const f = b6Fixture(t); const pending = f.start(); f.advanceTo("b6-day-on");
  f.effects(false); f.timeout();
  const result = await pending;
  assert.equal(result.status, "timeout"); assert.ok(result.activeElapsedMs >= 30000);
  assert.equal(f.environment.at(-1)!.stage, "restore"); assert.equal(f.environment.at(-1)!.force, true);
  assert.equal(f.game.flashlight.beam.light.isEnabled(), false); assert.equal(f.hasTimer, false);
});

test("disposed or failed B6 preparation never restores camera/environment into retired objects", async (t) => {
  for (const reason of ["disposed", "rendererFailed"] as const) {
    const f = b6Fixture(t); const pending = f.start(); f.advanceTo("b6-day-on");
    f.game[reason] = true;
    f.camera.setTarget = () => { assert.fail("retired camera touched"); };
    f.game.updateWorldPresentation = () => { assert.fail("retired world updated"); };
    f.game.updateRenderEnvironment = () => { assert.fail("retired environment updated"); };
    f.game.cancelLightPreparation();
    assert.equal((await pending).status, "disposed"); assert.equal(f.hasTimer, false);
  }
});

test("actual environment method forwards optional spatial refresh without shifting existing phase profiling", () => {
  const Game = make({ applyArtLighting: () => ({ night: 0 }), performance: { now: () => 17 } });
  const seen: { forceSpatialSelection?: boolean; dt: number }[] = [];
  const game = Object.assign(new Game(), {
    skyWeather: { update: () => ({ sun: { daylight: 1 }, moon: {}, wind: { x: 0, z: 0 } }) },
    car: { isEnabled: () => false }, actor: { vehicle: false }, weather: { cloud: 0, rain: 0 },
    avatars: new Map(), localId: "local", cinematic: { update: (value: typeof seen[number]) => seen.push(value) },
  });
  const phaseEnds = { sky: 0, lighting: 0, vegetation: 0, transit: 0, particles: 0, surfaces: 0 };
  game.updateRenderEnvironment({ x: 0, y: 0, z: 0 }, undefined, true, 0, 0, 123, false, phaseEnds, true);
  assert.equal(seen[0].forceSpatialSelection, true); assert.equal(seen[0].dt, 0);
  assert.ok(Object.values(phaseEnds).every((value) => value === 17));
  game.updateRenderEnvironment({ x: 0, y: 0, z: 0 }, undefined, false, 0, 0, 456, false);
  assert.equal(seen[1].forceSpatialSelection, undefined);
});

function avatarFarFixture(t: import("node:test").TestContext) {
  const f = b6Fixture(t);
  f.camera.maxZ = 1100;
  const body = MeshBuilder.CreateBox("actual attached avatar bounds", { height: 2 }, f.scene);
  body.parent = (f.rig as any).root;
  body.position.y = 1;
  const fullAtApply: { stage: string; maxZ: number }[] = [];
  const setStage = f.game.compilationProfile.setStage;
  f.game.compilationProfile.setStage = (stage: string) => {
    fullAtApply.push({ stage, maxZ: f.camera.maxZ });
    setStage(stage);
  };
  return Object.assign(f, { body, fullAtApply });
}

test("Day1 far scope restores before every stage/restart and leaves all fifteen original gates", async (t) => {
  const f = avatarFarFixture(t), pending = f.start();
  f.advanceTo("day-0-on"); assert.equal(f.camera.maxZ, 1100);
  f.advanceTo("day-1-off"); assert.ok(f.camera.maxZ < 1100); const firstFar = f.camera.maxZ;
  f.effects(false); f.body.position.z = -20; f.game.weather = {};
  f.tick(); assert.equal(f.stage, "day-1-off"); assert.ok(f.camera.maxZ > firstFar);
  f.effects(true); f.advanceTo("day-1-on"); assert.ok(f.camera.maxZ < 1100);
  f.advanceTo("b6-day-off"); assert.equal(f.camera.maxZ, 1100);
  f.finish(); const result = await pending;
  assert.equal(result.status, "complete"); assert.equal(result.stages.length, 15);
  assert.ok(result.stages.every((stage: { renders: number }) => stage.renders >= 3));
  assert.ok(f.fullAtApply.every(entry => entry.maxZ === 1100));
  assert.equal(f.camera.maxZ, 1100); assert.equal(f.hasTimer, false);
});

test("Day1 far scope restores synchronously on cancellation and after timeout or actual apply failure", async (t) => {
  for (const ending of ["cancel", "timeout", "failure", "rendererFailed"] as const) {
    const f = avatarFarFixture(t), pending = f.start(); f.advanceTo("day-1-on");
    assert.ok(f.camera.maxZ < 1100);
    if (ending === "timeout") f.timeout();
    else if (ending === "failure") {
      f.game.weather = {}; f.game.updateRenderEnvironment = () => { throw new Error("actual apply failure"); }; f.tick();
    } else {
      f.game[ending === "cancel" ? "disposed" : "rendererFailed"] = true;
      f.game.updateWorldPresentation = () => assert.fail("retired world touched");
      f.game.cancelLightPreparation();
      assert.equal(f.camera.maxZ, 1100, "restore must precede cancellation settlement/disposal");
    }
    const result = await pending;
    assert.equal(result.status, ending === "timeout" ? "timeout" : ending === "failure" ? "failed" : "disposed");
    assert.equal(f.camera.maxZ, 1100); assert.equal(f.hasTimer, false);
    assert.equal(f.game.cancelLightPreparation, undefined);
  }
});

test("Day1 draws re-read all live rigs even when mesh counts and stage revision are unchanged", async (t) => {
  const f = avatarFarFixture(t), remote = new TransformNode("remote current rig", f.scene);
  const part = MeshBuilder.CreateBox("remote current part", {}, f.scene); part.parent = remote;
  f.game.avatars.set("remote", { root: remote });
  const pending = f.start(); f.advanceTo("day-1-off"); f.effects(false);
  const initialFar = f.camera.maxZ, count = f.scene.meshes.length;
  remote.position.z = -35; f.tick();
  assert.equal(f.scene.meshes.length, count); assert.ok(f.camera.maxZ > initialFar + 30);
  f.effects(true); f.finish(); const result = await pending;
  assert.equal(result.status, "complete");
  assert.equal(result.stages.find((stage: { stage: string }) => stage.stage === "day-1-off")!.restarts, 0);
  assert.equal(f.camera.maxZ, 1100);
});

test("unexpected Day1 bounds errors fail real preparation instead of silently taking the full-view fallback", async (t) => {
  const f = avatarFarFixture(t), pending = f.start(); f.advanceTo("day-1-off"); f.effects(false);
  f.body.getBoundingInfo = () => { throw new Error("unexpected live bounds failure"); };
  f.tick(); const result = await pending;
  assert.equal(result.status, "failed"); assert.equal(result.failureStep, "render");
  assert.equal(f.camera.maxZ, 1100); assert.equal(f.hasTimer, false);
});
