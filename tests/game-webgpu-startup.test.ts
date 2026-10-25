import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { setImmediate as nextTurn } from "node:timers/promises";
import ts from "typescript";
import { readGameSource } from "./helpers/game-source";
import { doorLifecycleFixture } from "./helpers/weather-door-render-fixture";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { RenderHealth } from "../client/render-health";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { resolveTerrainReview, terrainReviewPose, terrainReviewIdentity } from "../client/terrain-review";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const { source, gameClass, selectMembers } = readGameSource(
  process.env.GAME_STARTUP_SOURCE,
);
const methods = selectMembers([
  "start",
  "createStartupActor",
  "prepareTerrainReviewCamera",
  "handleRendererFailure",
  "isMeshReadyForCamera",
  "assertStartupActive",
  "disposeStartupAsset",
  "disposeStartupAssets",
  "trackStartupAsset",
  "loadCadBuildingsForStartup",
  "applyAdaptiveQuality",
  "setQuality",
  "setTargetFps",
  "resize",
  "updatePlayers",
  "setProfile",
  "effectiveWeather",
  "applyDoorSnapshot",
]);
const compiled = ts.transpileModule(
  `class StartupGame { ${methods.map((node) => node.getText(source)).join("\n")} };`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    transformers: {
      before: [
        (context) => (input) => {
          const visit: ts.Visitor = (node) =>
            ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? ts.factory.createCallExpression(
                  ts.factory.createIdentifier("loadModule"),
                  undefined,
                  node.arguments,
                )
              : ts.visitEachChild(node, visit, context);
          return ts.visitNode(input, visit) as ts.SourceFile;
        },
      ],
    },
  },
).outputText;
const make = new Script(`(function(env) {
  const { exports, measurePresentationRate, initPhysics, Simulation, loadModule, B6_LAYOUT, CAD_BUILDINGS, hasCadBuilding, SurfacePack, CinematicAtmosphere, VehicleLighting, WebGpuPipelinePreparation, sessionDiagnostics, waitForRenderStartup, arePreparationEffectsReady, resolveTerrainReview, terrainReviewPose, terrainReviewIdentity, CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, window } = env;
  ${compiled}
  return StartupGame;
})`).runInThisContext();

const gameConstructor = gameClass.members.find(ts.isConstructorDeclaration)!;
const healthAssignment = gameConstructor.body!.statements.find((statement) =>
  ts.isExpressionStatement(statement) && ts.isBinaryExpression(statement.expression) &&
  statement.expression.left.getText(source) === "this.renderHealth",
)!;
assert.ok(healthAssignment);
const initializeHealth = new Script(`(function(env) {
  const { RenderHealth, sessionDiagnostics } = env;
  ${ts.transpileModule(`function initialize() { ${healthAssignment.getText(source)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText}
  return initialize;
})`).runInThisContext();

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function settle() {
  // Drain the actual chained health/asset gates without guessing their number
  // of microtasks. Held fixture promises remain held across this event-loop turn.
  await nextTurn();
}

/** Runs the actual production start body. Replaces module/asset/GPU IO only;
 * actual RenderHealth supplies failure and cancellation ownership. */
function fixture(
  t: TestContext,
  options: {
    preparation?: "complete" | "timeout";
    holdPhysics?: boolean;
    holdAssets?: boolean;
    holdCad?: boolean;
    nativeB6?: boolean;
    faultAfterGate?: boolean;
    location?: { hostname: string; search: string };
    network?: boolean;
    eyeHeight?: number;
  } = {},
) {
  const engine = new NullEngine();
  t.after(() => engine.dispose());
  const loops = new Set<() => void>();
  t.mock.method(engine, "runRenderLoop", (callback: () => void) => {
    loops.add(callback);
  });
  t.mock.method(engine, "stopRenderLoop", (callback?: () => void) => {
    if (callback) loops.delete(callback);
    else loops.clear();
  });
  const physics = deferred<void>(),
    gate = deferred<void>();
  const interior = deferred<any>(),
    vegetation = deferred<any>(),
    car = deferred<any>(),
    cad = deferred<any>();
  let disposedAssets = 0,
    gateCalls = 0,
    simulations = 0,
    failures = 0,
    interiorLoads = 0,
    cadLoads = 0;
  const cadBuildings = [
    { id: "b01", osmId: "53929063" },
    ...(options.nativeB6 === false ? [] : [{ id: "b06", osmId: "53929071" }]),
  ];
  const events: { kind: string; data: unknown }[] = [];
  const actorStarts: { id: string; position?: { x: number; y: number; z: number } }[] = [];
  const shaderStages: string[] = [];
  let gateReadiness: (() => boolean) | undefined;
  let gateRender: (() => void) | undefined;
  let pipelineReady = true, pipelineFrameComplete = true, targetRetries = 0;
  const pipelineScopes: { disposed: number; renders: number }[] = [];
  const disposable = () => ({ dispose: () => disposedAssets++ });
  const carAsset = {
    ...disposable(),
    car: { dispose() {}, setEnabled() {} },
    parked: { dispose() {} },
    updateWheels() {},
    setQuality() {},
    updateLighting() {},
  };
  const interiorAsset = disposable(),
    vegetationAsset = disposable();
  const cadAsset = {
    ...disposable(), stats: { buildings: cadBuildings.length, meshes: 2, materials: 2 },
    setDoorStates(states: unknown) {
      assert.equal(game.ready, true, "startup applies doors only after the render gate");
      assert.deepEqual(states, game.guestDoors.snapshot().states);
    },
  };
  if (!options.holdPhysics) physics.resolve();
  if (!options.holdAssets) {
    interior.resolve(interiorAsset);
    vegetation.resolve(vegetationAsset);
    car.resolve(carAsset);
  }
  if (!options.holdCad) cad.resolve(cadAsset);
  let game: any, health: RenderHealth;
  const StartupGame = make({
    arePreparationEffectsReady,
    exports: {},
    measurePresentationRate: async () => ({
      reliable: true,
      observedBrowserHz: 60,
    }),
    initPhysics: () => physics.promise,
    resolveTerrainReview, terrainReviewPose, terrainReviewIdentity,
    CHARACTER_RADIUS: .25, CHARACTER_HALF_HEIGHT: .55,
    window: { location: options.location ?? { hostname: "localhost", search: "" } },
    Simulation: class {
      doorPhysics = { applyStates(states: unknown) {
        assert.deepEqual(states, game.guestDoors.snapshot().states);
      } };
      constructor() {
        simulations++;
      }
      surfaceHeight() { return 4; }
      add(id: string, position?: { x: number; y: number; z: number }) {
        actorStarts.push({ id, ...(position ? { position: { ...position } } : {}) });
        return { position: position ?? { x: 0, y: 1, z: 0 }, yaw: 0, controller: { offset: () => .02 } };
      }
    },
    loadModule: async (name: string) => {
      const modules: Record<string, unknown> = {
        "./assets": { loadCar: () => car.promise },
        "./vegetation": { loadVegetation: () => vegetation.promise },
        "./transit-renderer": { TransitRenderer: class {} },
        "./b6-reality": { loadB6Reality: () => { interiorLoads++; return interior.promise; } },
        "./cad-buildings": {
          loadCadBuildings: (scene: unknown, assets: unknown, input: { signal: AbortSignal }) => {
            assert.equal(scene, game.scene);
            assert.equal(assets, cadBuildings);
            assert.equal(input.signal, game.startupAbort.signal);
            cadLoads++;
            return cad.promise;
          },
        },
      };
      assert.ok(name in modules, `Fixture must model the requested startup import: ${name}`);
      return modules[name];
    },
    B6_LAYOUT: { foundationOffset: 0 },
    CAD_BUILDINGS: cadBuildings,
    hasCadBuilding: (osmId: string) => cadBuildings.some(building => building.osmId === osmId),
    SurfacePack: class {
      update() {}
    },
    CinematicAtmosphere: class {},
    VehicleLighting: class {},
    // GPU/cache IO is covered by the helper's pinned-engine tests. This fixture
    // executes actual Game ownership and both readiness integration points.
    WebGpuPipelinePreparation: class {
      readonly state = { disposed: 0, renders: 0 };
      constructor(_engine: unknown, private options: {
        signal: AbortSignal; retryIncompleteFrame(): void;
      }) {
        assert.equal(_engine, engine);
        assert.equal(options.signal, game.startupAbort.signal);
        pipelineScopes.push(this.state);
      }
      render(callback: () => void) {
        assert.equal(this.state.disposed, 0);
        this.state.renders++;
        callback();
        if (!pipelineFrameComplete) this.options.retryIncompleteFrame();
        return pipelineFrameComplete;
      }
      isReady() { return pipelineReady && pipelineFrameComplete; }
      dispose() { this.state.disposed++; }
    },
    sessionDiagnostics: {
      event: (kind: string, data: unknown) => events.push({ kind, data }),
    },
    waitForRenderStartup: async (input: {
      health: RenderHealth;
      signal: AbortSignal;
      isReady(): boolean;
      render(): void;
    }) => {
      gateCalls++;
      gateReadiness = input.isReady;
      gateRender = input.render;
      assert.equal(input.health, health);
      assert.equal(input.signal, game.startupAbort.signal);
      await health.guard(gate.promise);
      assert.ok(health.markReady());
      if (options.faultAfterGate)
        queueMicrotask(() =>
          engine.onContextLostObservable.notifyObservers(engine),
        );
    },
  });
  game = Object.assign(new StartupGame(), {
    ...doorLifecycleFixture(),
    engine,
    startupAbort: new AbortController(),
    startupAssets: new Set(),
    rendererFailed: false,
    disposed: false,
    ready: false,
    network: options.network ?? false,
    localId: "guest", localPlayer: { x: 110, y: 0, z: 12 },
    avatars: new Map([["guest", { eyeHeight: options.eyeHeight ?? 1.63 }]]),
    previousPosition: new Vector3(110, 0, 12), visualOffset: new Vector3(), keys: new Set(),
    canvas: { dataset: {} },
    adaptive: { setPresentationHz: () => ({}) },
    applyAdaptiveQuality() {},
    gltfLightBudget: { prepareFrame() {} },
    stableLights: { update() {} },
    scene: {
      render() {}, getActiveMeshes: () => ({ length: 0, data: [] }),
      objectRenderers: [{ resetRefreshCounter() { targetRetries++; } }],
    },
    car: { dispose() {} },
    parkedCar: { dispose() {} },
    camera: { fov: .85 },
    sun: {},
    quality: "medium",
    startupAssetErrors: 0,
    updatePlayers() {},
    frame() {},
    blur() {},
    notice() {},
    installSkyDiagnostics() { assert.equal(game.ready, true); },
    onRendererFailure: () => failures++,
    compilationProfile: {
      snapshot: () => ({}),
      setStage: (stage: string) => shaderStages.push(stage),
    },
    prepareLighting: async (render: () => void, pipelines: { isReady(): boolean }) => {
      assert.equal(pipelineScopes.length, 1);
      assert.equal(pipelines.isReady(), pipelineReady && pipelineFrameComplete);
      render();
      return { status: options.preparation ?? "complete", elapsedMs: 1, stages: [] };
    },
  });
  t.after(() => game.guestDoors.dispose());
  initializeHealth({
    RenderHealth,
    sessionDiagnostics: { event: (kind: string, data: unknown) => events.push({ kind, data }) },
  }).call(game);
  health = game.renderHealth;
  return {
    game,
    engine,
    health,
    physics,
    gate,
    loops,
    events,
    actorStarts,
    shaderStages,
    gateReadiness: () => gateReadiness!(),
    renderGate: () => gateRender!(),
    pipelineScopes,
    pipelineState(ready: boolean, complete = true) {
      pipelineReady = ready; pipelineFrameComplete = complete;
    },
    targetRetries: () => targetRetries,
    completeAssets: () => {
      interior.resolve(interiorAsset);
      vegetation.resolve(vegetationAsset);
      car.resolve(carAsset);
    },
    completeInterior: () => interior.resolve(interiorAsset),
    completeVegetation: () => vegetation.resolve(vegetationAsset),
    completeCad: () => cad.resolve(cadAsset),
    rejectCad: (error: Error) => cad.reject(error),
    stats: () => ({ disposedAssets, gateCalls, simulations, failures, interiorLoads, cadLoads }),
  };
}

test("actual Game creates a fixed guest Actor before asset preparation and preserves the ordinary render gate", async (t) => {
  const f = fixture(t, { location: { hostname: "127.0.0.1", search: "?terrainReview=b6-rear-path" }, eyeHeight: 1.8 });
  const start = f.game.start(); await settle();
  assert.deepEqual(f.actorStarts, [{ id: "local", position: { x: 36, y: 5, z: -64 } }]);
  assert.deepEqual(f.game.previousPosition.asArray(), [36, 5, -64]);
  assert.deepEqual(f.game.localPlayer, { x: 36, y: 5, z: -64, yaw: -Math.PI / 2, speed: 0, vehicle: false });
  assert.equal(f.game.firstPerson, true); assert.equal(f.game.camera.fov, .85);
  assert.ok(Math.abs(f.game.pitch - 1.77 / 6.76) < 1e-10, "selected avatar eye height drives the actual first-person slope");
  assert.equal(f.game.canvas.dataset.terrainReview, "b6-rear-path");
  assert.equal(f.game.ready, false); assert.equal(f.loops.size, 0);
  f.gate.resolve(); await start;
  assert.equal(f.game.ready, true); assert.equal(f.actorStarts.length, 1);
  assert.equal(f.events.filter(e => e.kind === "terrain-review-start").length, 1);
});

test("actual Game keeps ordinary spawn for multiplayer, remote origin and a later fresh Game without the QA parameter", async (t) => {
  for (const options of [
    { network: true, location: { hostname: "localhost", search: "?terrainReview=b6-rear-path" } },
    { location: { hostname: "strahov.example", search: "?terrainReview=b6-rear-path" } },
    { location: { hostname: "localhost", search: "" } },
  ]) {
    const f = fixture(t, options); f.game.canvas.dataset.terrainReview = "old-canvas-view";
    const start = f.game.start(); await settle(); f.gate.resolve(); await start;
    assert.deepEqual(f.actorStarts, [{ id: "local" }]);
    assert.equal(f.game.terrainReview, null); assert.equal(f.game.canvas.dataset.terrainReview, undefined);
    assert.deepEqual(f.game.previousPosition.asArray(), [110, 0, 12]);
    assert.equal(f.events.some(e => e.kind === "terrain-review-start"), false);
  }
});

test("actual Game start cannot become playable until the submitted-frame gate succeeds", async (t) => {
  const f = fixture(t),
    start = f.game.start();
  await settle();
  assert.equal(f.stats().interiorLoads, 0, "native B6 bypasses its legacy optional asset");
  assert.equal(f.stats().cadLoads, 1);
  assert.equal(f.game.canvas.dataset.cadStage, "ready");
  assert.equal(f.stats().gateCalls, 1);
  assert.equal(f.game.ready, false);
  assert.equal(f.game.canvas.dataset.bootStage, "submitted-frame");
  assert.equal(f.shaderStages.at(-1), "submitted-frame");
  assert.equal(f.loops.size, 0, "preload loop is stopped before the gate");
  f.gate.resolve();
  await start;
  assert.equal(f.game.ready, true);
  assert.deepEqual(f.game.doorSnapshot, f.game.guestDoors.snapshot());
  assert.equal(f.game.doorStates.size, f.game.doorSnapshot.states.length);
  assert.equal(f.health.snapshot().valid, true);
  assert.equal(f.shaderStages.at(-1), "ready");
  assert.equal(f.loops.size, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1, "scope ends before interactive frames");
});

test("actual Game waits for critical CAD IO before lighting and the submitted-frame gate", async (t) => {
  const f = fixture(t, { holdCad: true }), start = f.game.start();
  await settle();
  assert.equal(f.stats().cadLoads, 1);
  assert.equal(f.game.canvas.dataset.bootStage, "cad-buildings");
  assert.equal(f.game.canvas.dataset.cadStage, undefined);
  assert.equal(f.game.cadBuildings, undefined);
  assert.equal(f.pipelineScopes.length, 0);
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 1, "asset readiness still has its preload render loop");
  f.completeCad(); await settle();
  assert.equal(f.game.canvas.dataset.cadStage, "ready");
  assert.equal(f.game.startupAssets.size, 0, "controller ownership transfers to Game");
  assert.equal(f.stats().gateCalls, 1);
  assert.equal(f.game.ready, false, "CAD completion alone cannot bypass the final gate");
  f.gate.resolve(); await start;
  assert.equal(f.game.ready, true);
});

test("actual Game propagates critical CAD failure past optional fallbacks without entering the final gate", async (t) => {
  const f = fixture(t, { holdCad: true }), start = f.game.start();
  const rejected = assert.rejects(start, /CAD fixture download failed/);
  await settle();
  assert.equal(f.stats().cadLoads, 1);
  f.rejectCad(new Error("CAD fixture download failed"));
  await rejected;
  assert.equal(f.game.startupAssetErrors, 0, "CAD is not an optional car/vegetation failure");
  assert.equal(f.game.canvas.dataset.cadStage, undefined);
  assert.equal(f.game.cadBuildings, undefined);
  assert.equal(f.pipelineScopes.length, 0);
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.game.ready, false);
});

test("actual Game rejects an incomplete light preparation instead of announcing ready", async (t) => {
  const f = fixture(t, { preparation: "timeout" });
  await assert.rejects(f.game.start(), /Přípravu 3D scény/);
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.game.ready, false);
  assert.equal(f.health.snapshot().valid, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.pipelineScopes[0].disposed, 1, "failed preparation restores owned hooks");
});

test("actual Game retains async scope through final gate, rejects incomplete draws and retries object targets", async (t) => {
  const f = fixture(t), start = f.game.start();
  await settle();
  assert.equal(f.pipelineScopes[0].disposed, 0);
  f.pipelineState(false);
  assert.equal(f.gateReadiness(), false, "pending pipeline is not a ready scene");
  f.pipelineState(true, false);
  f.renderGate();
  assert.equal(f.targetRetries(), 1, "including shared or once-only ObjectRenderers");
  assert.equal(f.gateReadiness(), false, "settled Promise does not accept an incomplete draw");
  f.pipelineState(true, true);
  f.renderGate();
  assert.equal(f.gateReadiness(), true);
  assert.equal(f.pipelineScopes[0].renders, 3);
  f.gate.resolve();
  await start;
  assert.equal(f.pipelineScopes[0].disposed, 1);
});

test("actual Game final-gate fault releases async scope and never starts gameplay", async (t) => {
  const f = fixture(t), start = f.game.start();
  await settle();
  f.health.report("pipeline", new Error("async native pipeline rejected"));
  await assert.rejects(start);
  assert.equal(f.pipelineScopes[0].disposed, 1);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  f.gate.resolve();
  await settle();
  assert.equal(f.pipelineScopes[0].disposed, 1);
});

test("actual Game final gate checks pending native effects after the variants were restored", async (t) => {
  const f = fixture(t);
  let effectReady = false;
  Object.assign(f.engine, {
    _isWebGPU: true,
    _compiledEffects: {
      late: { isReady: () => effectReady, getEngine: () => f.engine, isDisposed: false },
    },
  });
  t.mock.method(f.engine, "areAllEffectsReady", () => true);
  try {
    const start = f.game.start();
    await settle();
    assert.equal(f.stats().gateCalls, 1);
    assert.equal(f.gateReadiness(), false, "the WebGPU always-true stub is not final readiness");
    assert.equal(f.game.ready, false);
    effectReady = true;
    assert.equal(f.gateReadiness(), true);
    f.gate.resolve();
    await start;
    assert.equal(f.game.ready, true);
  } finally {
    Object.assign(f.engine, { _compiledEffects: {}, _isWebGPU: false });
  }
});

test("device loss during physics loading promptly rejects and cannot restart the Game loop", async (t) => {
  const f = fixture(t, { holdPhysics: true }),
    start = f.game.start();
  await settle();
  f.engine.onContextLostObservable.notifyObservers(f.engine);
  await assert.rejects(start);
  f.physics.resolve();
  await settle();
  assert.equal(f.stats().simulations, 0);
  assert.equal(f.stats().failures, 1);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
});

test("late asset controllers from a failed Game are disposed without changing a replacement canvas", async (t) => {
  const f = fixture(t, { holdAssets: true, nativeB6: false }),
    start = f.game.start();
  await settle();
  assert.equal(f.loops.size, 1);
  f.engine.onContextLostObservable.notifyObservers(f.engine);
  await assert.rejects(start);
  f.game.canvas.dataset.b6Stage = "replacement";
  f.game.canvas.dataset.carStage = "replacement";
  f.completeAssets();
  await settle();
  assert.equal(f.stats().disposedAssets, 3);
  assert.equal(f.game.canvas.dataset.b6Stage, "replacement");
  assert.equal(f.game.canvas.dataset.carStage, "replacement");
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
});

test("one stuck loader cannot retain other abandoned controllers", async (t) => {
  const f = fixture(t, { holdAssets: true, nativeB6: false }),
    start = f.game.start();
  await settle();
  f.completeInterior();
  await settle();
  assert.equal(f.game.startupAssets.size, 1);
  f.engine.onContextLostObservable.notifyObservers(f.engine);
  await assert.rejects(start);
  assert.equal(f.stats().disposedAssets, 1);
  f.completeVegetation();
  await settle();
  assert.equal(
    f.stats().disposedAssets,
    2,
    "does not wait for the still-pending car loader",
  );
  assert.equal(f.game.startupAssets.size, 0);
});

test("loss after submitted-gate settlement cannot resume a new gameplay loop", async (t) => {
  const f = fixture(t, { faultAfterGate: true }),
    start = f.game.start();
  await settle();
  f.gate.resolve();
  await assert.rejects(start);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
});

test("actual Game health callback retires a ready renderer on validation and render faults", async (t) => {
  for (const channel of ["validation", "render"] as const) {
    const f = fixture(t), start = f.game.start();
    await settle(); f.gate.resolve(); await start;
    assert.equal(f.game.ready, true);
    f.health.report(channel, new Error("render cannot continue"));
    assert.equal(f.game.ready, false, channel);
    assert.equal(f.game.rendererFailed, true);
    assert.equal(f.loops.size, 0);
    assert.equal(f.stats().failures, 1);
    f.health.report(channel, new Error("duplicate later error"));
    assert.equal(f.stats().failures, 1, "terminal UI transition is latched");
  }
});

test("render fault rejects pending Game startup and releases late assets", async (t) => {
  const f = fixture(t, { holdAssets: true }), start = f.game.start();
  await settle();
  f.health.report("render", new TypeError("missing Light1 buffer"));
  await assert.rejects(start);
  assert.equal(f.loops.size, 0);
  assert.equal(f.stats().failures, 1);
  f.completeAssets(); await settle();
  assert.equal(f.stats().disposedAssets, 2, "native B6 leaves only the car and vegetation optional");
  assert.equal(f.stats().cadLoads, 0, "failed optional startup never reaches CAD IO");
  assert.equal(f.game.ready, false);
});

test("failure teardown attempts every owned stage and delivers UI despite cleanup errors", async (t) => {
  const f = fixture(t), start = f.game.start();
  await settle(); f.gate.resolve(); await start;
  let blurCalls = 0;
  f.game.cancelLightPreparation = () => { throw new Error("preparation cleanup"); };
  f.game.benchmark = { profile: { dispose() { throw new Error("benchmark cleanup"); } } };
  f.game.blur = () => blurCalls++;
  f.game.notice = () => { throw new Error("notice sink"); };
  assert.doesNotThrow(() => f.health.report("render", new Error("original failure")));
  assert.equal(f.game.rendererFailed, true);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.game.benchmark, undefined);
  assert.equal(blurCalls, 1);
  assert.equal(f.stats().failures, 1);
  assert.equal(f.events.filter((event) => event.kind === "renderer-failure-cleanup-error").length, 3);
});

test("retired Game cannot resize, change GPU quality, or create remote/profile avatars", (t) => {
  const f = fixture(t);
  f.game.rendererFailed = true;
  delete f.game.applyAdaptiveQuality;
  delete f.game.updatePlayers;
  f.game.profile = { marker: "unchanged" };
  const rejectMutation = () => { throw new Error("retired GPU mutation"); };
  t.mock.method(f.engine, "resize", rejectMutation);
  f.game.adaptive = { setMode: rejectMutation, setTargetFps: rejectMutation };
  f.game.setCarQuality = rejectMutation;
  f.game.makeAvatar = rejectMutation;
  assert.doesNotThrow(() => {
    f.game.resize();
    f.game.setQuality("high");
    f.game.setTargetFps(144);
    f.game.applyAdaptiveQuality({ revision: 100, quality: "high", hardwareScaling: 1 });
    f.game.updatePlayers([{ id: "late-peer" }]);
    f.game.setProfile({ marker: "replacement" });
  });
  assert.deepEqual(f.game.profile, { marker: "unchanged" });
});
