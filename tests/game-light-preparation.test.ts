import { AuthoredLightPreparation } from "../client/authored-light-preparation";
import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import ts from "typescript";
import { readGameSource } from "./helpers/game-source";
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
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { createEnvironmentProfile } from "../client/environment-profile";
import { selectLightingPreview } from "../client/lighting-preview";

const { source, gameClass: declaration, selectMembers } = readGameSource(
  process.env.GAME_PREPARATION_SOURCE,
);
const members = selectMembers(["prepareLightingVariants", "isMeshReadyForCamera"]);
const compiled = ts.transpileModule(
  `class PreparationGame { ${members.map((node) => node.getText(source)).join("\n")} };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const make = new Script(`(function(environment) {
  const { AuthoredLightPreparation, PlayerFlashlight, Vector3, prepareLightVariants, arePreparationEffectsReady, selectLightingPreview, performance, window, document } = environment;
  ${compiled}
  return PreparationGame;
})`).runInThisContext();

function fixture(t: import("node:test").TestContext) {
  const realEngine = new NullEngine();
  const scene = new Scene(realEngine);
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
  let observeRender: (() => void) | undefined;
  const states: {
    instant: number;
    enabled: boolean;
    quality: string;
    self: unknown;
    pass: number;
  }[] = [];
  const Game = make({
    AuthoredLightPreparation,
    PlayerFlashlight,
    Vector3,
    prepareLightVariants,
    arePreparationEffectsReady,
    selectLightingPreview,
    performance: { now: () => now },
    document: { hidden: false, addEventListener() {}, removeEventListener() {} },
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
    compilationProfile: { setStage() {} },
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
    observeRender?.();
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
    scene,
    states,
    rig,
    streets,
    lightStates,
    engine,
    health,
    start: (pipelines?: { isReady(): boolean }, options?: { timeoutMs: number; restoreQuality?: () => void }) => {
      assert.equal(
        typeof game.prepareLightingVariants,
        "function",
        "actual Game must prepare its initial light variants before ready",
      );
      return game.prepareLightingVariants(render, pipelines, options);
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
    timeout(atMs = 30001) {
      now = atMs;
      timer?.();
    },
    observeRender(callback: () => void) { observeRender = callback; },
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

test("actual inner preparation restores requested quality before its complete restore draws", async (t) => {
  const f = fixture(t), latestInstant = 1792303200000;
  let stage = "", restoredDraws = 0, restored = false;
  f.game.compilationProfile.setStage = (value: string) => { stage = value; };
  f.observeRender(() => {
    if (stage !== "restore") return;
    restoredDraws++;
    assert.equal(restored, true);
    assert.equal(f.game.quality, "high");
    assert.equal(f.states.at(-1)?.quality, "high");
    assert.equal(f.states.at(-1)?.instant, latestInstant);
  });
  const pending = f.start(undefined, { timeoutMs: 30_000, restoreQuality() {
    restored = true;
    f.game.quality = "high";
    f.game.timeOverride = latestInstant;
  } });
  f.finish();
  assert.equal((await pending).status, "complete");
  assert.ok(restoredDraws >= 3, "restore still requires progress plus two complete acceptance draws");
});

test("actual inner preparation consumes the supplied remaining timeout", async (t) => {
  const f = fixture(t);
  f.effects(false);
  const pending = f.start(undefined, { timeoutMs: 250 });
  f.tick(); f.timeout(251);
  assert.equal(f.hasTimer, false, "the shorter remaining budget must expire without waiting for30s");
  assert.equal((await pending).status, "timeout");
  assert.equal(f.game.ready, false);
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
    let captured: { shader: boolean; unusedDefines: boolean; maxStages: number | undefined } | undefined;
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
            maxStages: options.shaderInventoryLimits?.maxStages,
          };
        }
      },
      sessionDiagnostics: { event() {} },
      window: { location: new URL(url) },
    });
    run.call({ engine: {}, renderHealth: { rendererId: 1 } });
    assert.deepEqual(captured, { shader: expected, unusedDefines: expected, maxStages: expected ? 21 : undefined }, url);
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
    .find((node) => node.name?.getText(source) === "start")!
    .getText(source);
  const prepare = start.search(/await\s+this\.renderHealth\.guard\(\s*this\.prepareLighting\(\s*preloadRender,\s*pipelinePreparation,\s*lightPreparationLoop,?\s*\)/);
  assert.ok(prepare > start.indexOf("this.updatePlayers([this.localPlayer])"));
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

/** Existing native Game fixture: actual light/torch objects, controlled clocks
 * and readiness boundaries. This does not claim a GPU draw or shader proof. */
function dayFixture(t: import("node:test").TestContext, webgpu = true) {
  const f = fixture(t);
  let stage = "";
  Object.assign(f.engine, {
    isWebGPU: webgpu,
    _compiledEffects: {
      requested: { isReady: () => f.engine.areAllEffectsReady(), getEngine: () => f.engine, isDisposed: false },
    },
  });
  f.game.compilationProfile.setStage = (value: string) => { stage = value; };
  new DirectionalLight("actual day sun", Vector3.Down(), f.scene);
  const environment = f.game.updateRenderEnvironment;
  f.game.updateRenderEnvironment = (...args: unknown[]) => {
    const result = environment(...args);
    return stage.startsWith("day-") ? { night: 0 } : result;
  };
  return Object.assign(f, {
    getStage: () => stage,
    advanceTo(value: string) {
      for (let ticks = 0; stage !== value && ticks < 200; ticks++) f.tick();
      assert.equal(stage, value);
    },
  });
}

test("native WebGPU day0/day1 keeps the full spawn presentation and actual OFF/ON light membership", async (t) => {
  const f = dayFixture(t), actor = JSON.stringify(f.game.actor);
  const camera = f.game.camera, position = camera.position.clone();
  const cameraShape = [camera.fov, camera.minZ, camera.maxZ];
  const receiver = f.scene.meshes.find(mesh => mesh.name === "actual beam caster")!;
  const pending = f.start();
  const expected: [string, boolean, number, string[]][] = [
    ["day-0-off", false, 0, ["DirectionalLight", "HemisphericLight"]],
    ["day-0-on", true, 0, ["SpotLight", "DirectionalLight", "HemisphericLight"]],
    ["day-1-off", false, 1, ["PointLight", "DirectionalLight", "HemisphericLight"]],
    ["day-1-on", true, 1, ["SpotLight", "PointLight", "DirectionalLight", "HemisphericLight"]],
  ];
  for (const [stage, on, count, types] of expected) {
    f.advanceTo(stage);
    assert.equal(f.states.at(-1)!.instant, selectLightingPreview("day").instant);
    assert.equal(f.states.at(-1)!.enabled, on);
    assert.equal(f.streets.filter(light => light.isEnabled()).length, count);
    assert.ok(f.streets.every(light => light.intensity === 0), "enabled POINT with zero radiance still prepares its define");
    assert.deepEqual(receiver.lightSources.map(light => light.getClassName()), types);
    assert.equal(f.game.flashlightOn, false);
    assert.equal(JSON.stringify(f.game.actor), actor);
    assert.deepEqual([camera.fov, camera.minZ, camera.maxZ], cameraShape);
    assert.ok(camera.position.equals(position), "day stages use the original fixture camera path, no synthetic view");
  }
  f.finish(); const result = await pending;
  assert.equal(result.status, "complete");
  assert.equal(result.stages.length, 13);
  assert.deepEqual(result.stages.slice(-5).map((s: { stage: string }) => s.stage), ["day-0-off", "day-0-on", "day-1-off", "day-1-on", "restore"]);
  assert.ok(result.stages.every((s: { renders: number }) => s.renders >= 3));
  assert.equal(f.game.ready, false);
  assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
  assert.equal(f.engine.currentRenderPassId, 901);
  assert.equal(f.hasTimer, false);
});

test("native day pending effects retain the stage, reacquire a replacement rig and restore latest requests", async (t) => {
  const f = dayFixture(t), actor = JSON.stringify(f.game.actor);
  const pending = f.start(); f.advanceTo("day-0-off"); f.effects(false);
  const replacement = { ...f.rig };
  f.game.quality = "low"; f.game.timeOverride = 1792303200000;
  f.game.weather = {}; f.game.profile = {}; f.game.avatars.set("local", replacement);
  f.tick(); f.tick();
  assert.equal(f.getStage(), "day-0-off");
  assert.equal(f.states.at(-1)!.self, replacement);
  assert.equal(f.game.ready, false);
  f.effects(true); f.advanceTo("day-1-on");
  assert.equal(f.streets.filter(light => light.isEnabled()).length, 1);
  f.game.flashlightOn = true;
  f.finish(); const result = await pending;
  assert.equal(result.status, "complete");
  const day = result.stages.find((s: { stage: string }) => s.stage === "day-0-off")!;
  assert.equal(day.restarts, 1);
  assert.equal(day.restartReasons.weather, 1);
  assert.equal(f.states.at(-1)!.instant, 1792303200000);
  assert.equal(f.states.at(-1)!.self, replacement);
  assert.equal(f.states.at(-1)!.quality, "low");
  assert.equal(f.game.flashlight.beam.light.isEnabled(), true);
  assert.equal(JSON.stringify(f.game.actor), actor);
});

test("native day timeout and terminal retirement retain the original cleanup and 30 second deadline", async (t) => {
  for (const stage of ["day-0-on", "day-1-on"]) for (const ending of ["timeout", "disposed", "failed"] as const) {
    const f = dayFixture(t), pending = f.start(); f.advanceTo(stage); f.effects(false);
    const states = f.states.length, draws = f.draws;
    if (ending === "timeout") f.timeout();
    else {
      if (ending === "disposed") f.game.disposed = true;
      else f.game.rendererFailed = true;
      f.game.cancelLightPreparation();
    }
    const result = await pending;
    assert.equal(result.status, ending === "timeout" ? "timeout" : "disposed");
    if (ending === "timeout") {
      assert.equal(result.activeElapsedMs, 30001);
      assert.equal(f.game.flashlight.beam.light.isEnabled(), false);
      assert.equal(f.states.at(-1)!.instant, f.game.timeOverride);
    } else assert.equal(f.states.length, states, "retired owner receives no restore");
    assert.equal(f.draws, draws);
    assert.equal(f.game.cancelLightPreparation, undefined);
    assert.equal(f.hasTimer, false);
    assert.equal(f.game.ready, false);
  }
});

test("native WebGL preparation remains nine stages without an independent day preview", async (t) => {
  const f = dayFixture(t, false), pending = f.start(); f.finish();
  const result = await pending;
  assert.equal(result.status, "complete");
  assert.equal(result.stages.length, 9);
  assert.ok(result.stages.every((s: { stage: string }) => !s.stage.startsWith("day-")));
});
