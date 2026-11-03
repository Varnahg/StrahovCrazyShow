import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { setImmediate as nextTurn } from "node:timers/promises";
import ts from "typescript";
import { readGameSource } from "./helpers/game-source";
import { doorLifecycleFixture } from "./helpers/weather-door-render-fixture";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Observable } from "@babylonjs/core/Misc/observable";
import { ObjectRenderer } from "@babylonjs/core/Rendering/objectRenderer";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { PostProcessManager } from "@babylonjs/core/PostProcesses/postProcessManager";
import { StartupMaterialReadiness as ActualMaterialReadiness } from "../client/startup-material-readiness";
import { WebGpuStartupCpuProfile as ActualCpuProfile } from "../client/webgpu-startup-cpu-profile";
import { sanitizeDiagnosticsData, validateDiagnosticsBatch } from "../shared/session-diagnostics";
import { RenderHealth } from "../client/render-health";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { resolveTerrainReview, resolveTreePilot, terrainReviewPose, terrainReviewIdentity } from "../client/terrain-review";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import treeCatalog from "../shared/data/assets/tree-catalog.json";

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
  const { exports, measurePresentationRate, initPhysics, Simulation, loadModule, B6_LAYOUT, CAD_BUILDINGS, hasCadBuilding, SurfacePack, CinematicAtmosphere, VehicleLighting, WebGpuPipelinePreparation, WebGpuShaderPreparation, StartupMaterialReadiness, sessionDiagnostics, waitForRenderStartup, arePreparationEffectsReady, resolveTerrainReview, resolveTreePilot, terrainReviewPose, terrainReviewIdentity, treeCatalog, CHARACTER_RADIUS, CHARACTER_HALF_HEIGHT, Vector3, window } = env;
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
    shaderConstructorFailure?: boolean;
    shaderCleanupFailure?: boolean;
    materialCleanupFailure?: boolean;
    actualMaterialGuard?: boolean;
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
  const preloadCameraPositions: number[][] = [];
  const vegetationOptions: unknown[] = [];
  const shaderStages: string[] = [];
  let gateReadiness: (() => boolean) | undefined;
  let gateRender: (() => void) | undefined;
  let pipelineReady = true, pipelineFrameComplete = true, targetRetries = 0;
  const pipelineScopes: { disposed: number; renders: number }[] = [];
  let shaderReady = true, shaderError: ((error: unknown) => void) | undefined;
  let preparationReadiness: (() => boolean) | undefined;
  const shaderScopes: { disposed: number; enabled: boolean }[] = [];
  const materialScopes: { disposed: number; prepared: number }[] = [];
  let shaderCompleted = 0, pipelineDiagnostics = false;
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
    resolveTerrainReview, resolveTreePilot, terrainReviewPose, terrainReviewIdentity, treeCatalog,
    CHARACTER_RADIUS: .25, CHARACTER_HALF_HEIGHT: .55, Vector3,
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
        "./vegetation": { loadVegetation: (scene: unknown, options: unknown) => {
          assert.equal(scene, game.scene); vegetationOptions.push(options); return vegetation.promise;
        } },
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
        signal: AbortSignal; retryIncompleteFrame(): void; diagnostics: boolean;
      }) {
        assert.equal(_engine, engine);
        assert.equal(options.signal, game.startupAbort.signal);
        pipelineDiagnostics = options.diagnostics;
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
      snapshot() { return this.options.diagnostics ? { ...this.state } : null; }
      dispose() { this.state.disposed++; }
    },
    WebGpuShaderPreparation: class {
      readonly state = { disposed: 0, enabled: true };
      constructor(owner: unknown, scheduling: { signal: AbortSignal; enabled?: boolean; onError(error: unknown): void }) {
        assert.equal(owner, engine);
        assert.equal(scheduling.signal, game.startupAbort.signal);
        this.state.enabled = scheduling.enabled !== false;
        if (this.state.enabled && options.shaderConstructorFailure) throw new Error("shader queue installation failed");
        shaderError = scheduling.onError;
        shaderScopes.push(this.state);
      }
      isReady() { return !this.state.enabled || shaderReady; }
      snapshot() { return { ...this.state, queued: this.isReady() ? 0 : 1, completed: this.state.enabled ? shaderCompleted : 0 }; }
      dispose() {
        this.state.disposed++;
        if (this.state.enabled && options.shaderCleanupFailure) shaderError!(new Error("shader scheduling cleanup failed"));
      }
    },
    StartupMaterialReadiness: options.actualMaterialGuard ? class extends ActualMaterialReadiness {
      constructor(scene: Scene, input: { signal: AbortSignal }) {
        const native = engine as unknown as { _isWebGPU: boolean }, previous = native._isWebGPU;
        native._isWebGPU = true;
        try { super(scene, input); } finally { native._isWebGPU = previous; }
      }
    } : class {
      readonly state = { disposed: 0, prepared: 0 };
      constructor(scene: unknown, input: { signal: AbortSignal }) {
        assert.equal(scene, game.scene);
        assert.equal(input.signal, game.startupAbort.signal);
        materialScopes.push(this.state);
      }
      prepareFrame() {
        assert.equal(this.state.disposed, 0);
        this.state.prepared++;
      }
      assertHealthy() {}
      dispose() {
        this.state.disposed++;
        if (options.materialCleanupFailure) throw new Error("material readiness cleanup failed");
      }
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
      render() { preloadCameraPositions.push(game.camera.position.asArray()); }, getActiveMeshes: () => ({ length: 0, data: [] }),
      objectRenderers: [{ resetRefreshCounter() { targetRetries++; } }],
    },
    car: { dispose() {} },
    parkedCar: { dispose() {} },
    camera: { fov: .85, position: new Vector3(110, 3, 12) },
    updateCameraFollow(position: Vector3, eyeHeight: number) {
      game.camera.position.set(position.x, position.y - .8 + eyeHeight, position.z);
    },
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
      get shaderPreparationCompletions() { return shaderCompleted; },
      snapshot: () => ({}),
      setStage: (stage: string) => shaderStages.push(stage),
    },
    prepareLighting: async (render: () => void, pipelines: { isReady(): boolean }) => {
      assert.equal(pipelineScopes.length, 1);
      preparationReadiness = pipelines.isReady;
      assert.equal(pipelines.isReady(), shaderReady && pipelineReady && pipelineFrameComplete);
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
    preloadCameraPositions,
    shaderStages,
    gateReadiness: () => gateReadiness!(),
    renderGate: () => gateRender!(),
    pipelineScopes,
    shaderScopes,
    materialScopes,
    pipelineDiagnostics: () => pipelineDiagnostics,
    completeShaderWork() { shaderCompleted++; },
    shaderState(ready: boolean) { shaderReady = ready; },
    shaderFailure(error: unknown) { shaderError!(error); },
    preparationReadiness: () => preparationReadiness!(),
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
    vegetationOptions,
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

test("local startup publishes pipeline evidence before disposing its owner", async t=>{
  const f=fixture(t,{location:{hostname:"127.0.0.1",search:"?terrainReview=b5-tree-near"}});
  f.game.lightingReadiness={stage:"current-on",lastGate:"pipeline"};
  const start=f.game.start();await settle();
  const event=f.events.find(e=>e.kind==="lighting-preparation")?.data as any;
  assert.equal(event.readiness.lastGate,"pipeline");
  assert.deepEqual(event.pipeline,{disposed:0,renders:1});
  f.gate.resolve();await start;
  assert.equal(f.pipelineScopes[0].disposed,1);
  assert.equal(event.pipeline.disposed,0,"collector evidence contains a value snapshot, not the live owner");
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

test("static QA assets and hidden prewarm render from the authored Actor camera rather than the constructor spawn", async (t) => {
  const f=fixture(t,{holdAssets:true,location:{hostname:"127.0.0.1",search:"?terrainReview=b5-tree-far"}});
  const start=f.game.start();
  try {
    await settle();
    assert.equal(f.loops.size,1);
    for(const render of f.loops)render();
    assert.deepEqual(f.preloadCameraPositions[0],[f.game.actor.position.x,f.game.actor.position.y-.8+1.63,f.game.actor.position.z]);
    assert.equal(f.preloadCameraPositions[0][0],-170.5);
    assert.equal(f.actorStarts.length,1,"camera initialization must not re-add or teleport the Actor");
  } finally { f.completeAssets(); await settle(); f.gate.resolve(); await start; }
});

test("actual Game passes a fixed pilot only to a valid local static guest startup", async (t) => {
  for (const variant of ["own", "mtree"]) for (const scope of ["static", "ordinary", "remote", "multi"]) {
    const location = { hostname: scope === "remote" ? "strahov.example" : "127.0.0.1",
      search: (scope === "ordinary" ? "?" : "?terrainReview=b6-rear-path&") + "treePilot=" + variant };
    const f = fixture(t, { location, network: scope === "multi" });
    const start = f.game.start(); await settle(); f.gate.resolve(); await start;
    const expected = scope === "static" ? { manifestUrl: variant === "own" ? "/models/vegetation/seasonal-r6-far/runtime-contract.json" : "/models/vegetation/seasonal-streamed/runtime-contract.json",
      selections: { "ipr-crown-014": variant + "-broadleaf", "ipr-b6-north-conifer": variant + "-conifer" } } : undefined;
    assert.deepEqual(f.vegetationOptions, [expected ? { treePilot: expected } : { treeCatalog }]);
    assert.equal(f.game.ready, true);
  }
});

test("ordinary guest, multiplayer and catalogue-only QA start with the same complete tree catalogue", async (t) => {
  for (const options of [{}, { network: true }, { location: {
    hostname: "127.0.0.1", search: "?terrainReview=small-tree-close&treePilot=own",
  } }]) {
    const f = fixture(t, options);
    const start = f.game.start(); await settle(); f.gate.resolve(); await start;
    assert.deepEqual(f.vegetationOptions, [{ treeCatalog }]);
    assert.equal(f.game.ready, true);
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
  assert.equal(f.shaderScopes[0].disposed, 1, "failed preparation cancels shader admission");
});

test("actual Game keeps queued shaders behind both preparation and submitted-frame gates", async (t) => {
  const f = fixture(t, { location: { hostname: "localhost", search: "?startupShaderScheduling=queued" } }), start = f.game.start();
  await settle();
  assert.equal(f.shaderScopes[0].disposed, 0);
  f.shaderState(false);
  assert.equal(f.preparationReadiness(), false);
  assert.equal(f.gateReadiness(), false, "unstarted shader work cannot be accepted as ready");
  f.shaderState(true);
  assert.equal(f.preparationReadiness(), true);
  assert.equal(f.gateReadiness(), true);
  f.gate.resolve(); await start;
  assert.equal(f.game.ready, true);
  assert.equal(f.shaderScopes[0].disposed, 1, "queue is removed before normal gameplay");
  const recorded = f.events.find(event => event.kind === "lighting-preparation")?.data as any;
  assert.deepEqual(recorded.shaderScheduling, { disposed: 0, enabled: true, queued: 0, completed: 0 });
  assert.equal(f.materialScopes[0].disposed, 1);
});

test("startup CPU profile snapshots bracket preparation and retain cleanup on timeout", async (t) => {
  for (const preparation of ["complete", "timeout"] as const) {
    const f = fixture(t, { preparation });
    let disposed = 0, snapshots = 0;
    f.game.startupCpuProfile = { dispose() { disposed++; }, snapshot() { return { sample: ++snapshots }; } };
    const start = f.game.start();
    if (preparation === "timeout") await assert.rejects(start, /Přípravu 3D scény/);
    else { await settle(); assert.equal(disposed, 0); f.gate.resolve(); await start; }
    const events = f.events.filter(e => e.kind === "startup-cpu-profile").map(e => e.data as any);
    assert.deepEqual(events.map(e => e.stage), ["preparation-start", "startup-end"]);
    assert.deepEqual(events.map(e => e.timing.sample), [1, 2]);
    assert.equal(disposed, 1);
    assert.equal(f.shaderScopes[0].disposed, 1);
    assert.equal(f.pipelineScopes[0].disposed, 1);
  }
});

test("startup CPU timing survives the real client privacy filter and server batch validation", async (t) => {
  const f = fixture(t); let now = 0;
  const context = {};
  const processor = {
    _webgpuProcessingContext: context,
    initializeShaders(value: object) { this._webgpuProcessingContext = value; now += 2; },
    preProcessShaderCode(code: string) { now += 3; return code; },
    postProcessor(code: string, _defines: string[], _fragment: boolean, _context: object) { now += 5; return code; },
    finalizeShaders(vertex: string, fragment: string, _context: object) { now += 7; return { vertexCode: vertex, fragmentCode: fragment }; },
  };
  const observedEngine = { isWebGPU: true, _device: {}, _shaderProcessorWGSL: processor, createEffect() {
    processor.initializeShaders(context); processor.preProcessShaderCode("vertex");
    processor.postProcessor("vertex", [], false, context); processor.finalizeShaders("vertex", "fragment", context);
    return {};
  } };
  const profiler = new ActualCpuProfile(observedEngine, { now: () => now });
  t.after(() => profiler.dispose());
  observedEngine.createEffect();
  f.game.startupCpuProfile = profiler;
  const start = f.game.start(); await settle(); f.gate.resolve(); await start;
  const events = f.events.filter(event => event.kind === "startup-cpu-profile");
  const retained = validateDiagnosticsBatch({ schemaVersion: 1,
    sessionId: "11111111-1111-4111-8111-111111111111", batchId: 0,
    records: events.map((event, seq) => ({ seq, atMs: seq, kind: event.kind, data: sanitizeDiagnosticsData(event.data) })),
  });
  assert.ok(retained); assert.equal(retained.records.length, 2);
  for (const record of retained.records) {
    const timing = record.data.timing as any;
    assert.ok(timing, "technical counters must survive both privacy filters");
    assert.equal(timing.createEffect.calls, 1);
    assert.equal(timing.createEffect.cpuTotalMs, 17);
    assert.equal(timing.counts.observerErrors, 0);
    assert.equal(timing.wgslProcessing.syncCpu.samples, 1);
    assert.equal(timing.processorMethods.initializeShaders.cpuTotalMs, 2);
    assert.equal(timing.processorMethods.preProcessShaderCode.cpuTotalMs, 3);
    assert.equal(timing.processorMethods.postProcessor.cpuTotalMs, 5);
    assert.equal(timing.processorMethods.finalizeShaders.cpuTotalMs, 7);
    assert.equal(timing.hooks.preProcessor, "unavailable");
  }
  assert.deepEqual(sanitizeDiagnosticsData({ profile: { nickname: "private" } }), {}, "the original privacy rule remains intact");
});

test("startup CPU profiler is constructed only for explicit loopback diagnostics", () => {
  const constructor = gameClass.members.find(ts.isConstructorDeclaration)!;
  const statement = constructor.body!.statements.find(node => ts.isIfStatement(node) &&
    node.thenStatement.getText(source).includes("this.startupCpuProfile = new WebGpuStartupCpuProfile"));
  assert.ok(statement);
  const initialize = new Script(`(function(window, WebGpuStartupCpuProfile) { ${statement.getText(source)} })`).runInThisContext();
  for (const [hostname, search, expected] of [
    ["127.0.0.1", "?profileStartupCpu=1", 1],
    ["localhost", "?profileStartupCpu=1", 1],
    ["[::1]", "?profileStartupCpu=1", 1],
    ["strahov.example", "?profileStartupCpu=1", 0],
    ["localhost", "?profileStartupCpu=0", 0],
    ["localhost", "", 0],
  ] as const) {
    const engine = {}, game = { engine }; let constructions = 0;
    initialize.call(game, { location: { hostname, search } }, class { constructor(owner: object) {
      assert.equal(owner, engine); constructions++;
    } });
    assert.equal(constructions, expected);
  }
});

test("native preparation is the default and queued QA is loopback-only with all safety gates", async (t) => {
  for (const [hostname, search, enabled] of [
    ["localhost", "?startupShaderScheduling=queued", true],
    ["127.0.0.1", "?startupShaderScheduling=queued", true],
    ["[::1]", "?startupShaderScheduling=queued", true],
    ["strahov.example", "?startupShaderScheduling=queued", false],
    ["localhost", "?startupShaderScheduling=native", false],
    ["127.0.0.1", "?startupShaderScheduling=native", false],
    ["[::1]", "?startupShaderScheduling=native", false],
    ["strahov.example", "?startupShaderScheduling=native", false],
    ["localhost", "", false],
    ["localhost", "?startupShaderScheduling=invalid", false],
  ] as const) {
    const f = fixture(t, { location: { hostname, search }, network: true });
    const start = f.game.start(); await settle();
    assert.equal(f.shaderScopes[0].enabled, enabled);
    assert.equal(f.materialScopes[0].disposed, 0);
    f.shaderState(false);
    assert.equal(f.preparationReadiness(), !enabled);
    f.pipelineState(false);
    assert.equal(f.preparationReadiness(), false, "native shaders cannot bypass pending pipelines");
    assert.equal(f.gateReadiness(), false);
    f.pipelineState(true); f.shaderState(true);
    const before = f.materialScopes[0].prepared;
    f.renderGate();
    assert.equal(f.materialScopes[0].prepared, before + 1, "native control keeps the material safety guard");
    assert.equal(f.game.ready, false, "the submitted-frame gate still owns readiness");
    f.gate.resolve(); await start;
    assert.equal(f.materialScopes[0].disposed, 1);
    assert.equal(f.pipelineScopes[0].disposed, 1);
    assert.equal(f.shaderScopes[0].disposed, 1);
  }
});

test("native and queued startup retry a once-only RTT whose postprocess skipped before any pipeline draw", async (t) => {
  for (const search of ["?startupShaderScheduling=queued", ""]) {
    const f = fixture(t, { location: { hostname: "127.0.0.1", search } });
    let postReady = false, draws = 0;
    const effect = { isReady: () => postReady, getEngine: () => f.engine, isDisposed: false,
      _bindTexture() {}, setVector2() {}, dispose() {} };
    Object.assign(f.engine, { _isWebGPU: true, _compiledEffects: { pendingPost: effect } });
    const gpu = {
      snapshotRendering: false, enableEffect() {}, setState() {}, setDepthBuffer() {}, setDepthWrite() {},
      setAlphaMode() {}, restoreDefaultFramebuffer() {}, bindBuffers() {},
      drawElementsType() { draws++; },
    };
    const renderer = Object.assign(Object.create(ObjectRenderer.prototype), {
      _engine: gpu, _refreshRate: 0, _currentRefreshId: -1,
    });
    // Actual Babylon apply/finalize/refresh control; only GPU commands are stubs.
    const pp = Object.assign(Object.create(PostProcess.prototype), {
      _engine: gpu, _effectWrapper: { isReady: () => postReady, drawWrapper: { effect }, bind() {} },
      _forcedOutputTexture: { texture: {} }, _scaleRatio: {}, alphaMode: 0,
      onApplyObservable: new Observable(), onBeforeRenderObservable: new Observable(), onAfterRenderObservable: new Observable(),
    });
    const manager = Object.assign(Object.create(PostProcessManager.prototype), {
      _scene: { activeCamera: {}, postProcessesEnabled: true, getEngine: () => gpu },
      onBeforeRenderObservable: new Observable(), _prepareBuffers() {}, _vertexBuffers: {}, _indexBuffer: {},
    });
    f.game.scene.objectRenderers = [renderer];
    f.game.scene.render = () => {
      if (renderer.shouldRender()) manager._finalizeFrame(false, undefined, 0, [pp]);
    };
    try {
      const start = f.game.start(); await settle();
      assert.equal(renderer.currentRefreshId, 1, "the once-only target consumed its initial refresh");
      assert.equal(draws, 0, "unready postprocess skipped before the pipeline adapter could see a draw");
      assert.equal(f.gateReadiness(), false);
      f.renderGate(); assert.equal(draws, 0);
      postReady = true; f.completeShaderWork();
      f.renderGate(); assert.equal(draws, 1, search || "native");
      f.renderGate(); assert.equal(draws, 1, "unchanged completion signal does not keep resetting the target");
      assert.equal(f.gateReadiness(), true);
      f.gate.resolve(); await start;
    } finally { Object.assign(f.engine, { _compiledEffects: {}, _isWebGPU: false }); }
  }
});

test("actual Game retries targets after shader completion even when no pipeline draw was issued", async (t) => {
  const f = fixture(t), start = f.game.start(); await settle();
  const prepared = f.materialScopes[0].prepared;
  f.completeShaderWork(); f.renderGate();
  assert.equal(f.targetRetries(), 1);
  assert.equal(f.materialScopes[0].prepared, prepared + 1);
  f.renderGate(); assert.equal(f.targetRetries(), 1, "same shader completion is consumed only once");
  f.gate.resolve(); await start;
  assert.equal(f.materialScopes[0].disposed, 1);
});

test("actual Game retains material cleanup failure and still releases pipeline ownership", async (t) => {
  const f = fixture(t, { materialCleanupFailure: true }), start = f.game.start(); await settle();
  f.gate.resolve(); await assert.rejects(start, /material readiness cleanup failed/);
  assert.equal(f.materialScopes[0].disposed, 1);
  assert.equal(f.shaderScopes[0].disposed, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
});

test("actual Game checks retained failure from the real material guard before publishing ready", async (t) => {
  const f = fixture(t, { actualMaterialGuard: true });
  const scene = new Scene(f.engine); f.game.scene = scene;
  t.after(() => scene.dispose());
  t.mock.method(scene, "render", () => {});
  const start = f.game.start(); await settle();
  Object.defineProperty(scene, "addMaterial", { value: scene.addMaterial, configurable: false, writable: false });
  f.gate.resolve();
  await assert.rejects(start, /Cannot restore startup material method/);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.shaderScopes[0].disposed, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1);
});

test("actual Game enables bounded preparation diagnostics for local multiplayer only", async (t) => {
  for (const [hostname, expected] of [["127.0.0.1", true], ["localhost", true], ["[::1]", true], ["game.example", false]] as const) {
    const f = fixture(t, { network: true, location: { hostname, search: "" } });
    const start = f.game.start(); await settle();
    assert.equal(f.pipelineDiagnostics(), expected);
    f.gate.resolve(); await start;
  }
});

test("actual Game propagates shader scheduling failure and cleans both startup owners", async (t) => {
  const f = fixture(t, { location: { hostname: "localhost", search: "?startupShaderScheduling=queued" } }), start = f.game.start();
  await settle();
  f.shaderFailure(new Error("shader scheduling failed"));
  await assert.rejects(start, /shader scheduling failed/);
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.shaderScopes[0].disposed, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1);
  f.gate.resolve(); await settle();
  assert.equal(f.shaderScopes[0].disposed, 1);
});

test("actual Game cleans pipeline scope when installing the shader queue fails", async (t) => {
  const f = fixture(t, { shaderConstructorFailure: true, location: { hostname: "localhost", search: "?startupShaderScheduling=queued" } });
  await assert.rejects(f.game.start(), /shader queue installation failed/);
  assert.equal(f.game.ready, false);
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.pipelineScopes[0].disposed, 1);
  assert.equal(f.shaderScopes.length, 0);
});

test("actual Game cannot publish ready after shader hook cleanup retires its renderer", async (t) => {
  const f = fixture(t, { shaderCleanupFailure: true, location: { hostname: "localhost", search: "?startupShaderScheduling=queued" } }), start = f.game.start();
  await settle(); f.gate.resolve();
  await assert.rejects(start);
  assert.equal(f.health.snapshot().valid, false);
  assert.equal(f.game.ready, false);
  assert.notEqual(f.game.canvas.dataset.bootStage, "ready");
  assert.equal(f.loops.size, 0);
  assert.equal(f.shaderScopes[0].disposed, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1);
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
