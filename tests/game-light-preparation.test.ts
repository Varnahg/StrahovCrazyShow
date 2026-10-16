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
import { selectLightingPreview } from "../client/lighting-preview";

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
    node.name && ["prepareLighting", "isMeshReadyForCamera"].includes(node.name.getText(source)),
);
const compiled = ts.transpileModule(
  `class PreparationGame { ${members.map((node) => node.getText(source)).join("\n")} };`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const make = new Script(`(function(environment) {
  const { PlayerFlashlight, Vector3, prepareLightVariants, selectLightingPreview, performance, window, document } = environment;
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
  const game = Object.assign(new Game(), {
    scene,
    camera,
    engine,
    renderHealth: { snapshot: () => ({ errorCount: 0, pendingOperations: 0, phase: "preparing" }) },
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
    scene,
    states,
    rig,
    streets,
    lightStates,
    engine,
    start: () => {
      assert.equal(
        typeof game.prepareLighting,
        "function",
        "actual Game must prepare its initial light variants before ready",
      );
      return game.prepareLighting(render);
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
  const prepare = start.search(/await\s+this\.renderHealth\.guard\(\s*this\.prepareLighting\(preloadRender\)/);
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
