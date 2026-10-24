import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import ts from "typescript";
import { readGameSource } from "./helpers/game-source";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Observable } from "@babylonjs/core/Misc/observable";
import { RenderHealth } from "../client/render-health";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";
import { StartupPreparationLoop, type StartupPreparationHost } from "../client/startup-preparation-loop";
import { startupViewKey, StartupViewGateBudget } from "../client/startup-preparation-view";
import { StartupPreparationViews } from "../client/startup-preparation-view";
import { AuthorityBuffer } from "../client/authority-buffer";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { LocalAvatarPresentation } from "../client/local-avatar-presentation";
import { AvatarPrimitivePool, createAvatarRig } from "../client/avatar-renderer";
import { AvatarLodController } from "../client/avatar-lod";
import { AvatarAnimator } from "../client/animation";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";
import { SnapshotBuffer } from "../shared/netcode";
import { writeVector3 } from "../client/transform-updates";
import { clampOrbitPitch } from "../client/camera-look";
import type { Authority } from "../shared/netcode";
import { SPAWN, zoneAt } from "../shared/world";
import { B6_LAYOUT as actualB6Layout } from "../shared/b6-interior";
import { waitForRenderStartup, type RenderStartupHost } from "../client/render-startup";

const { source, gameClass, selectMembers } = readGameSource(
  process.env.GAME_STARTUP_SOURCE,
);
const methods = selectMembers([
  "start",
  "handleRendererFailure",
  "isMeshReadyForCamera",
  "assertStartupActive",
  "disposeStartupAsset",
  "disposeStartupAssets",
  "trackStartupAsset",
  "applyAdaptiveQuality",
  "setQuality",
  "setTargetFps",
  "resize",
  "updatePlayers",
  "setProfile",
  "refreshStartupPreparationView",
  "preparationPosition",
  "startupPreparationStamp",
  "startupPreparationCoverage",
  "completeStartupPreparation",
  "applyPreparationView",
  "updateCameraFollow",
  "updateWorldPresentation",
  "updateAvatarPresentation",
  "syncMotion",
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
  const { exports, measurePresentationRate, initPhysics, Simulation, loadModule, B6_LAYOUT, SurfacePack, CinematicAtmosphere, VehicleLighting, WebGpuPipelinePreparation, StartupPreparationLoop, sessionDiagnostics, waitForRenderStartup, arePreparationEffectsReady, StartupViewGateBudget, Vector3, Mesh, writeVector3, clampOrbitPitch, document, performance, zoneAt, setTimeout, clearTimeout } = env;
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
  for (let i = 0; i < 24; i++) await Promise.resolve();
}

/** Runs the actual production start body. Replaces module/asset/GPU IO only;
 * actual RenderHealth supplies failure and cancellation ownership. */
function fixture(
  t: TestContext,
  options: {
    preparation?: "complete" | "timeout";
    holdPhysics?: boolean;
    holdAssets?: boolean;
    faultAfterGate?: boolean;
    native?: boolean;
    queryReadErrorMonitoring?: boolean;
    holdPreparationFence?: boolean;
    holdPreparationValidation?: boolean;
    exerciseGate?: boolean;
    actorPosition?: { x: number; y: number; z: number };
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
    gate = deferred<void>(),
    preparationFence = deferred<void>(),
    preparationValidation = deferred<{ message: string } | null>(),
    deviceLost = deferred<{ reason: string; message: string }>();
  if (!options.holdPreparationFence) preparationFence.resolve();
  if (!options.holdPreparationValidation) preparationValidation.resolve(null);
  let fences = 0, pushes = 0, pops = 0, taskSequence = 0, hostDisposals = 0;
  const preparationTasks = new Map<number, () => void>(), visibilityListeners = new Set<() => void>();
  // Scheduling/GPU IO is controlled, while the actual adapter owns every step,
  // stop, scope/fence and idle barrier. One finite IO-stub light tick is enough
  // here; the real light catalog has separate integration regressions.
  const host: StartupPreparationHost = {
    requestTask(callback) {
      assert.equal(preparationTasks.size, 0, "one queued preparation task");
      const handle = ++taskSequence;
      preparationTasks.set(handle, callback);
      queueMicrotask(() => {
        const selected = preparationTasks.get(handle);
        if (!selected) return;
        preparationTasks.delete(handle);
        selected();
      });
      return handle;
    },
    cancelTask(handle) { preparationTasks.delete(handle); },
    visible: () => true,
    observeVisibility(callback) {
      visibilityListeners.add(callback);
      return () => { visibilityListeners.delete(callback); };
    },
    dispose() { hostDisposals++; preparationTasks.clear(); },
  };
  const device = Object.assign(new EventTarget(), {
    lost: deviceLost.promise,
    pushErrorScope(filter: string) { assert.equal(filter, "validation"); pushes++; },
    popErrorScope() { pops++; return preparationValidation.promise; },
    queue: { onSubmittedWorkDone() { fences++; return preparationFence.promise; } },
  });
  Object.assign(engine, { _isWebGPU: options.native ?? false, _device: device });
  if (options.native && options.queryReadErrorMonitoring !== false)
    Object.assign(engine, { onQueryReadErrorObservable: new Observable() });
  const interior = deferred<any>(),
    vegetation = deferred<any>(),
    car = deferred<any>();
  let disposedAssets = 0,
    gateCalls = 0,
    simulations = 0,
    failures = 0;
  const events: { kind: string; data: unknown }[] = [];
  const gateTimeouts: (number | undefined)[] = [];
  const document = Object.assign(new EventTarget(), { hidden: false });
  let viewNow = 0;
  let nextViewTimer = 0;
  const viewTimers = new Map<number, () => void>();
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
  const interiorAsset = { ...disposable(), update(_input: unknown) {} },
    vegetationAsset = disposable();
  if (!options.holdPhysics) physics.resolve();
  if (!options.holdAssets) {
    interior.resolve(interiorAsset);
    vegetation.resolve(vegetationAsset);
    car.resolve(carAsset);
  }
  let game: any, health: RenderHealth;
  const StartupGame = make({
    arePreparationEffectsReady,
    StartupViewGateBudget,
    Vector3, Mesh, writeVector3, clampOrbitPitch, document, zoneAt, performance: { now: () => viewNow },
    setTimeout: (callback: () => void) => { const id = ++nextViewTimer; viewTimers.set(id, callback); return id; },
    clearTimeout: (id: number) => viewTimers.delete(id),
    exports: {},
    measurePresentationRate: async () => ({
      reliable: true,
      observedBrowserHz: 60,
    }),
    initPhysics: () => physics.promise,
    Simulation: class {
      constructor() {
        simulations++;
      }
      add() {
        return { position: { ...(options.actorPosition ?? { x: 0, y: 1, z: 0 }) }, vehicle: false, grounded: false,
          restore() { throw new Error("Startup presentation must not restore physics"); } };
      }
      cameraDistance(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
        return Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      }
    },
    loadModule: async (name: string) => {
      const modules: Record<string, unknown> = {
        "./assets": { loadCar: () => car.promise },
        "./vegetation": { loadVegetation: () => vegetation.promise },
        "./transit-renderer": { TransitRenderer: class {} },
        "./b6-reality": { loadB6Reality: () => interior.promise },
      };
      return modules[name];
    },
    B6_LAYOUT: { foundationOffset: 0 },
    SurfacePack: class {
      update() {}
    },
    CinematicAtmosphere: class {},
    VehicleLighting: class {},
    // GPU/cache IO is covered by the helper's pinned-engine tests. This fixture
    // executes actual Game ownership and both readiness integration points.
    StartupPreparationLoop: class extends StartupPreparationLoop {
      constructor(actualEngine: NullEngine, actualHealth: RenderHealth, actualOptions: { signal: AbortSignal }) {
        assert.equal(actualEngine, engine);
        assert.equal(actualHealth, health);
        assert.equal(actualOptions.signal, game.startupAbort.signal);
        super(actualEngine, actualHealth, { ...actualOptions, host });
      }
    },
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
      timeoutMs?: number;
      revalidate?: { rendererId: number; generation: number };
    }) => {
      gateCalls++;
      gateTimeouts.push(input.timeoutMs);
      gateReadiness = input.isReady;
      gateRender = input.render;
      assert.equal(input.health, health);
      assert.equal(input.signal, game.startupAbort.signal);
      await health.guard(gate.promise);
      if (options.exerciseGate) { input.isReady(); input.render(); assert.equal(input.isReady(), true); }
      if (input.revalidate) {
        assert.equal(loops.size, 0, "held native loop is paused while the manual revalidation gate submits");
        const state = health.snapshot(); assert.equal(state.valid, true);
        assert.equal(state.rendererId, input.revalidate.rendererId); assert.equal(state.generation, input.revalidate.generation);
      } else assert.ok(health.markReady());
      if (options.faultAfterGate)
        queueMicrotask(() =>
          engine.onContextLostObservable.notifyObservers(engine),
        );
    },
  });
  game = Object.assign(new StartupGame(), {
    engine,
    startupAbort: new AbortController(),
    startupAssets: new Set(),
    rendererFailed: false,
    disposed: false,
    ready: false,
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
    camera: {},
    sun: {},
    quality: "medium",
    startupAssetErrors: 0,
    updatePlayers() {},
    frame() {},
    blur() {},
    notice() {},
    onRendererFailure: () => failures++,
    compilationProfile: {
      snapshot: () => ({}),
      setStage: (stage: string) => shaderStages.push(stage),
    },
    prepareLighting: (render: () => void, pipelines: { isReady(): boolean }, loop: StartupPreparationLoop) => {
      assert.equal(pipelineScopes.length, 1);
      assert.equal(pipelines.isReady(), pipelineReady && pipelineFrameComplete);
      const status = options.preparation ?? "complete";
      return new Promise((resolve) => {
        const tick = () => {
          if (options.exerciseGate) game.applyPreparationView(1000, true);
          loop.render(render);
          loop.stop(tick);
          // The real light helper settles its result before the owned GPU
          // submission has completed; Game must wait for the actual adapter.
          resolve({ status, elapsedMs: 1, stages: [] });
          return status === "complete";
        };
        loop.run(tick);
      });
    },
  });
  initializeHealth({
    RenderHealth,
    sessionDiagnostics: { event: (kind: string, data: unknown) => events.push({ kind, data }) },
  }).call(game);
  health = game.renderHealth;
  return {
    game,
    interiorAsset,
    engine,
    health,
    physics,
    gate,
    preparationFence,
    preparationValidation,
    deviceLost,
    preparationState: () => ({ fences, pushes, pops, queued: preparationTasks.size, listeners: visibilityListeners.size, hostDisposals }),
    loops,
    events,
    gateTimeouts, document, advanceViewClock: (ms: number) => { viewNow += ms; },
    viewTimers, fireViewTimers: () => { for (const [id, callback] of [...viewTimers]) { viewTimers.delete(id); callback(); } },
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
    stats: () => ({ disposedAssets, gateCalls, simulations, failures }),
  };
}

test("actual native Game rejects absent query error monitoring before any preparation work", async (t) => {
  const f = fixture(t, { native: true, queryReadErrorMonitoring: false });
  const start = f.game.start(), rejected = assert.rejects(start, /query read error monitoring unavailable/);
  await rejected;
  await settle();
  assert.equal(f.health.snapshot().phase, "invalid");
  assert.equal(f.health.snapshot().counts.render, 1);
  assert.equal(f.game.ready, false);
  assert.equal(f.game.rendererFailed, true);
  assert.equal(f.game.startupAbort.signal.aborted, true);
  assert.equal(f.stats().failures, 1);
  assert.equal(f.stats().simulations, 0);
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.loops.size + f.pipelineScopes.length + f.game.startupAssets.size, 0);
  assert.deepEqual(f.preparationState(), {
    fences: 0, pushes: 0, pops: 0, queued: 0, listeners: 0, hostDisposals: 0,
  });
  // Failed start stops gameplay; the fixture retains normal engine ownership.
  f.engine.dispose();
  assert.equal(f.engine.isDisposed, true);
  assert.equal(f.health.snapshot().phase, "disposed");
});

test("actual Game start cannot become playable until the submitted-frame gate succeeds", async (t) => {
  const f = fixture(t),
    start = f.game.start();
  await settle();
  assert.equal(f.stats().gateCalls, 1);
  assert.equal(f.game.ready, false);
  assert.equal(f.game.canvas.dataset.bootStage, "submitted-frame");
  assert.equal(f.shaderStages.at(-1), "submitted-frame");
  assert.equal(f.loops.size, 0, "preload loop is stopped before the gate");
  f.gate.resolve();
  await start;
  assert.equal(f.game.ready, true);
  assert.equal(f.health.snapshot().valid, true);
  assert.equal(f.shaderStages.at(-1), "ready");
  assert.equal(f.loops.size, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1, "scope ends before interactive frames");
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

test("actual whole Game startup waits for both preparation validation and its last queue fence", async (t) => {
  const f = fixture(t, { native: true, holdPreparationFence: true, holdPreparationValidation: true });
  const start = f.game.start();
  await settle();
  assert.equal(f.events.filter(event => event.kind === "lighting-preparation").length, 1);
  assert.equal(f.game.canvas.dataset.bootStage, "light-preparation");
  assert.equal(f.stats().gateCalls, 0, "light result alone cannot enter the separate submitted gate");
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.pipelineScopes[0].disposed, 0);
  assert.deepEqual(f.preparationState(), {
    fences: 1, pushes: 1, pops: 1, queued: 0, listeners: 1, hostDisposals: 0,
  });
  f.preparationFence.resolve();
  await settle();
  assert.equal(f.stats().gateCalls, 0, "queue completion alone cannot accept an unchecked frame");
  assert.equal(f.health.snapshot().pendingOperations, 1);
  f.preparationValidation.resolve(null);
  await settle();
  assert.equal(f.stats().gateCalls, 1);
  assert.equal(f.game.ready, false, "the final submitted gate still owns final readiness");
  assert.equal(f.health.snapshot().pendingOperations, 0);
  f.gate.resolve();
  await start;
  assert.equal(f.game.ready, true);
  assert.equal(f.loops.size, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1);
  assert.deepEqual(f.preparationState(), {
    fences: 1, pushes: 1, pops: 1, queued: 0, listeners: 0, hostDisposals: 1,
  });
});

test("actual whole Game startup preserves a preparation queue rejection and never reaches the final gate", async (t) => {
  const f = fixture(t, { native: true, holdPreparationFence: true });
  const failure = new Error("preparation queue rejected");
  const start = f.game.start(), rejected = assert.rejects(start, reason => reason === failure);
  await settle();
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.preparationState().fences, 1);
  f.preparationFence.reject(failure);
  await rejected;
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.stats().failures, 1);
  assert.equal(f.health.snapshot().counts.pipeline, 1);
  assert.equal(f.pipelineScopes[0].disposed, 1);
  assert.equal(f.preparationState().hostDisposals, 1);
  assert.equal(f.preparationState().listeners, 0);
});

for (const retirement of ["abort", "device-loss"] as const)
  test(`actual whole Game ${retirement} rejects a pending preparation fence and late completion stays retired`, async (t) => {
    const f = fixture(t, { native: true, holdPreparationFence: true });
    const start = f.game.start(), rejected = assert.rejects(start);
    await settle();
    assert.equal(f.preparationState().fences, 1);
    assert.equal(f.stats().gateCalls, 0);
    if (retirement === "abort") f.game.startupAbort.abort();
    else f.deviceLost.resolve({ reason: "destroyed", message: "owned native device lost during preparation" });
    await rejected;
    assert.equal(f.game.ready, false);
    assert.equal(f.loops.size, 0);
    assert.equal(f.pipelineScopes[0].disposed, 1);
    assert.equal(f.preparationState().hostDisposals, 1);
    assert.equal(f.preparationState().queued, 0);
    assert.equal(f.preparationState().listeners, 0);
    f.preparationFence.resolve();
    f.gate.resolve();
    await settle();
    assert.equal(f.stats().gateCalls, 0);
    assert.equal(f.game.ready, false);
    assert.equal(f.loops.size, 0);
    assert.equal(f.pipelineScopes[0].disposed, 1);
    assert.equal(f.preparationState().hostDisposals, 1);
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
  const f = fixture(t, { holdAssets: true }),
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
  const f = fixture(t, { holdAssets: true }),
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
  assert.equal(f.stats().disposedAssets, 3);
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

function networkViewFixture(t: TestContext) {
  const f = fixture(t, { exerciseGate: true, actorPosition: SPAWN });
  t.after(() => f.game.startupPresentationLease?.dispose());
  const scene = new Scene(f.engine); t.after(() => scene.dispose());
  const camera = new FreeCamera("actual resumed view camera", new Vector3(SPAWN.x, SPAWN.y + 3, SPAWN.z + 8), scene);
  const room = {}, views = new StartupPreparationViews(), authorities = new AuthorityBuffer();
  const own: any = { id: "self", nickname: "fixture", avatar: { preset: 4 }, x: -3.696, y: 2.62, z: -73.087, yaw: 1.2, vehicle: false };
  let players = [own, { ...own, id: "known-peer", avatar: { preset: 2 } }];
  views.begin(room, "self", 1);
  const offer = (ack: number, position = { x: -3.696, y: 2.62, z: -73.087 }, epoch = 1, vehicle = false) => {
    const packet: Authority = { ack, tick: ack, receivedSeq: ack, inputEpoch: epoch, inputTickBase: 0, time: 1000 + ack * 17,
      state: { position, yaw: 1.2, vehicle, speed: 0, vertical: 0, grounded: true } };
    views.offer(room, packet, ack * 17, authorities.offer(packet, ack * 17)); return packet;
  };
  const authority = offer(0), world: unknown[] = [], feet: Vector3[] = []; let gameplayFrames = 0;
  Object.assign(f.interiorAsset, { interiorLightEnabled: false, update(input: { player: { x: number; y: number; z: number } }) {
    world.push({ ...input.player }); (this as any).interiorLightEnabled = zoneAt(input.player).startsWith("b6:");
  } });
  Object.assign(f.game, { network: true, localId: "self", localPlayer: { ...own, ...SPAWN }, profile: { avatar: own.avatar },
    scene, camera, yaw: Math.PI, pitch: 0.28, distance: 8, cameraArm: 8, firstPerson: false,
    localAvatarPresentation: new LocalAvatarPresentation(), avatars: new Map(),
    avatarPool: { pruneUnused() {} }, snapshots: { remove() {} }, labels: { remove() {} }, contactShadows: { remove() {} },
    makeAvatar(player: any) { return { root: new TransformNode(player.id, scene), lod: { level: "near" }, target: player, profile: JSON.stringify(player.avatar), eyeHeight: 1.63, bodyHeight: 1.8, measurements: { legSpacing: 0.105 } }; },
    updateAvatarPresentation(_id: string, avatar: any, at: Vector3) { feet.push(at.clone()); avatar.root.position.copyFrom(at); },
    updateRenderEnvironment() { return { night: 1 }; },
    startupPreparationSource: () => views.read(room, "self", 1, players),
    frame() { gameplayFrames++; },
  });
  delete f.game.updatePlayers; // execute the actual production roster method
  return { ...f, scene, camera, authority, authorities, views, room, offer, world, feet,
    players(value: typeof players) { players = value; }, gameplayFrames: () => gameplayFrames };
}

/** Actual Game render/readiness callbacks and original RenderStartup; terminal
 * native GPU/RAF IO only is controlled. No wall-time or performance evidence. */
async function asynchronousViewGate(t: TestContext) {
  const f = networkViewFixture(t), starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  const snapshots = new SnapshotBuffer();
  t.mock.method(snapshots, "sample", () => { throw new Error("Startup cannot sample the remote interpolation timeline"); });
  Object.assign(f.game, { snapshots, minimumMotionTick: -1, diagnosticNetwork: { motionPackets: 0 } });
  let now = 0, next = 0, submits = 0, draws = 0, status = "pending", failure: unknown;
  let fence: ReturnType<typeof deferred<void>> | undefined;
  let validation: Promise<{ message: string } | null> = Promise.resolve(null);
  const frames = new Map<number, () => void>(), timers = new Map<number, () => void>(), listeners = new Set<() => void>();
  const host: RenderStartupHost = {
    requestFrame(callback) { const id = ++next; frames.set(id, callback); return id; }, cancelFrame(id) { frames.delete(id); },
    visible: () => true, now: () => now,
    setTimer(callback) { const id = ++next; timers.set(id, callback); return id; }, clearTimer(id) { timers.delete(id); },
    observeVisibility(callback) { listeners.add(callback); return () => { listeners.delete(callback); }; },
  };
  Object.assign(f.engine, { _isWebGPU: true, _device: {
    pushErrorScope() {}, popErrorScope: () => validation,
    queue: { onSubmittedWorkDone() { submits++; fence = deferred<void>(); return fence.promise; } },
  } });
  t.mock.method(f.engine, "beginFrame", () => {}); t.mock.method(f.engine, "endFrame", () => {});
  // The held callback is not pumped by this fixture. As in the actual handoff,
  // manual validation has sole submission ownership.
  f.engine.stopRenderLoop(); f.game.startupPreparationRendered = "";
  const completion = waitForRenderStartup({ engine: f.engine, health: f.health,
    signal: f.game.startupAbort.signal, revalidate: f.health.snapshot(), timeoutMs: 30000,
    render() { draws++; f.renderGate(); }, isReady: f.gateReadiness }, host);
  void completion.then(() => { status = "ready"; }, error => { status = "rejected"; failure = error; });
  await settle();
  return { ...f, frames, timers, listeners, completion,
    status: () => ({ status, failure, now, submits, draws }),
    validation(value: Promise<{ message: string } | null>) { validation = value; },
    async frame(beforeFence?: () => void, rejection?: unknown) {
      assert.equal(frames.size, 1, "original gate owns one request at a time");
      const [id, callback] = frames.entries().next().value!; frames.delete(id); fence = undefined;
      callback(); await settle();
      // The original asynchronous gate creates this through the terminal IO
      // callback; TypeScript cannot infer mutation across the awaited closure.
      const submitted = fence as ReturnType<typeof deferred<void>> | undefined;
      assert.ok(submitted, "original submitted-work fence exists");
      now += 50; f.advanceViewClock(50); beforeFence?.();
      if (rejection === undefined) submitted.resolve(); else submitted.reject(rejection);
      await settle();
    },
  };
}

for (const moving of [false, true]) test(`actual Game/RenderStartup finite remote frame passes50ms fences with ${moving ? "continuous20Hz target movement" : "same-pose packet identities"}`, async (t) => {
  const f = await asynchronousViewGate(t), remote = f.game.avatars.get("known-peer");
  const pose = { ...remote.target }, authorityQueue = JSON.stringify(f.authorities); let packets = 0;
  for (let step = 0; step < 601 && f.status().status === "pending"; step++) {
    await f.frame(() => {
      packets++;
      f.game.syncMotion({ tick: packets, time: 2000 + packets * 50,
        rows: [["known-peer", pose.x + (moving ? packets * 0.005 : 0), pose.y, pose.z, pose.yaw, 0, 0, 0, "outside", true]] });
    });
  }
  const state = f.status();
  t.diagnostic(JSON.stringify({ status: state.status, failure: state.failure instanceof Error ? state.failure.name : null,
    simulatedVisibleMs: state.now, draws: state.draws, submits: state.submits, acceptedPackets: packets,
    scope: "controlled CPU scheduling, not GPU/performance data" }));
  assert.equal(f.status().status, "ready", String(f.status().failure));
  assert.equal(f.status().submits, 2); assert.equal(f.status().now, 100, "controlled scheduling only, not measured startup latency");
  assert.equal(remote.target.x, pose.x + (moving ? packets * 0.005 : 0), "accepted stream continues while the original fence waits");
  assert.equal(f.game.diagnosticNetwork.motionPackets, packets); assert.equal(JSON.stringify(f.authorities), authorityQueue);
  assert.equal(remote.root.position.x, pose.x + (moving ? (packets - 1) * 0.005 : 0), "the gate validates its submitted finite presentation");
  assert.deepEqual(f.game.actor.position, SPAWN); assert.equal(f.gameplayFrames(), 0);
  assert.equal(f.frames.size + f.timers.size + f.listeners.size, 0);
  f.renderGate(); assert.equal(remote.root.position.x, remote.target.x, "next real render consumes the newer accepted target");
});

for (const kind of ["scene-visibility", "membership", "profile"] as const) test(`remote submitted-frame gate retries real ${kind} change during a fence`, async (t) => {
  const f = await asynchronousViewGate(t), remote = f.game.avatars.get("known-peer");
  await f.frame(); // beforeReady initially false, establish an actual submitted frame
  await f.frame(() => {
    if (kind === "scene-visibility") remote.root.setEnabled(false);
    else f.players([{ ...f.game.localPlayer, id: "self", avatar: { preset: 4 } },
      { ...remote.target, id: kind === "membership" ? "replacement-peer" : "known-peer", avatar: { preset: 1 } }]);
  });
  assert.equal(f.status().status, "pending", "a genuinely changed Scene/roster is not the validated submitted view");
  await f.frame();
  if (f.status().status === "pending") await f.frame();
  assert.equal(f.status().status, "ready", String(f.status().failure));
  assert.equal(f.frames.size + f.timers.size + f.listeners.size, 0);
});

test("actual AvatarLodController scene registration change inside a fence requires another validated rendered snapshot", async (t) => {
  const f = await asynchronousViewGate(t), pool = new AvatarPrimitivePool(f.scene), remote = f.game.avatars.get("known-peer");
  t.after(() => pool.dispose());
  const config = applyAvatarPreset(2, DEFAULT_AVATAR), rig = createAvatarRig(f.scene, config, pool, "actual in-flight peer LOD");
  remote.root.dispose(); Object.assign(remote, rig, { lod: new AvatarLodController(f.scene, pool, rig, config), animation: new AvatarAnimator(rig) });
  // Terminal rendering IO is already covered by native gate tests. Keep actual
  // Scene registration, root and original LOD/presenter behavior in this fixture.
  t.mock.method(f.scene, "render", () => {});
  const localPresentation = f.game.updateAvatarPresentation;
  f.game.contactShadows.set = () => {};
  f.game.updateAvatarPresentation = (id: string, ...args: unknown[]) => id === "known-peer"
    ? Object.getPrototypeOf(f.game).updateAvatarPresentation.call(f.game, id, ...args)
    : localPresentation(id, ...args);
  await f.frame();
  await f.frame(() => {
    assert.equal(remote.lod.update({ distance: 300, quality: "medium", position: remote.root.position, yaw: 0, visible: true }).level, "far");
    assert.equal(remote.lod.counts.registered, 1, "actual registered geometry changes during the original fence");
  });
  assert.equal(f.status().status, "pending", "readiness does not waive real submitted Scene/LOD drift");
  await f.frame(); if (f.status().status === "pending") await f.frame();
  assert.equal(f.status().status, "ready", String(f.status().failure)); assert.equal(remote.lod.level, "near");
  assert.ok(remote.lod.counts.registered > 1); assert.deepEqual(f.game.actor.position, SPAWN);
});

for (const kind of ["queue-error", "validation-error", "abort"] as const) test(`remote frame latch preserves original ${kind} during an asynchronous fence`, async (t) => {
  const f = await asynchronousViewGate(t), error = new Error("original submission queue failure");
  const validation = deferred<{ message: string } | null>(); if (kind === "validation-error") f.validation(validation.promise);
  const result = assert.rejects(f.completion, failure => kind === "queue-error" ? failure === error
    : kind === "validation-error" ? (failure as Error).message === "original validation failure" : (failure as Error).name === "AbortError");
  await f.frame(() => {
    if (kind === "abort") f.game.startupAbort.abort();
    else if (kind === "validation-error") validation.resolve({ message: "original validation failure" });
  }, kind === "queue-error" ? error : undefined);
  await result; assert.equal(f.status().status, "rejected");
  assert.equal(f.frames.size + f.timers.size + f.listeners.size, 0);
});

test("actual whole Game prepares accepted B6 camera/roster while Actor and authority queue remain untouched through delayed UI handoff", async (t) => {
  const f = networkViewFixture(t), beforeQueue = JSON.stringify(f.authorities);
  const start = f.game.start(); await settle(); f.gate.resolve(); await start;
  assert.deepEqual(f.game.actor.position, SPAWN); assert.equal(JSON.stringify(f.authorities), beforeQueue);
  assert.ok(f.camera.position.z < -60); assert.ok(f.world.some((value: any) => value.z < -70));
  assert.ok(f.feet.some(value => Math.abs(value.y - (2.62 - 0.8)) < 1e-6));
  assert.deepEqual([...f.game.avatars.keys()].sort(), ["known-peer", "self"]);
  assert.equal(f.game.canvas.dataset.preparationView, "authority-foot");
  assert.equal(f.game.canvas.dataset.preparationRemoteBoundary, "submitted-frame");
  const loop = [...f.loops][0]; assert.ok(loop);
  f.advanceViewClock(2000); loop(); // observer-delayed continuation cannot advance SPAWN gameplay
  assert.equal(f.gameplayFrames(), 0); assert.deepEqual(f.game.actor.position, SPAWN);
  assert.equal(JSON.stringify(f.authorities), beforeQueue); assert.equal(f.pipelineScopes[0].disposed, 0);
  // The fixture now models the ORIGINAL UI drain's terminal physics IO; the
  // production startup view code never performs this assignment/reconcile.
  f.game.actor.position = { ...f.authority.state.position };
  await f.game.completeStartupPreparation();
  assert.deepEqual(f.gateTimeouts, [30000, 28000]); assert.equal(f.pipelineScopes[0].disposed, 1);
  assert.equal(f.game.startupPresentationLease, undefined); assert.equal(f.game.startupPreparationSource, undefined);
  [...f.loops][0](); assert.equal(f.gameplayFrames(), 1); assert.equal(f.game.canvas.dataset.preparationViewReleased, "true");
});

test("late exact pose/epoch/known roster gets original gate coverage within remaining budget, without queue drain", async (t) => {
  const f = networkViewFixture(t), starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  const late = f.offer(1, { x: -5, y: 2.6201, z: -74 }, 2);
  f.players([{ ...f.game.localPlayer, id: "self", avatar: { preset: 4 } }, { ...f.game.localPlayer, id: "replacement-peer", avatar: { preset: 1 } }]);
  const before = JSON.stringify(f.authorities);
  f.game.actor.position = { ...late.state.position }; f.advanceViewClock(7000);
  await f.game.completeStartupPreparation();
  assert.equal(f.gateTimeouts[1], 23000); assert.equal(JSON.stringify(f.authorities), before);
  assert.deepEqual([...f.game.avatars.keys()].sort(), ["replacement-peer", "self"]);
  assert.ok(f.world.some((value: any) => value.x === -5 && value.z === -74));
  assert.equal(f.game.canvas.dataset.preparationViewEpoch, "2");
});

test("late accepted yaw and contact require another exact submitted view without changing the spatial stage key", async (t) => {
  const f = networkViewFixture(t), starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  const key = startupViewKey(f.game.startupPreparationSnapshot);
  for (const [index, state] of [
    { ...f.authority.state, yaw: 2.4 },
    { ...f.authority.state, yaw: 2.4, grounded: false },
  ].entries()) {
    const next = { ...f.authority, ack: index + 1, tick: index + 1, receivedSeq: index + 1, time: 1017 + index * 17, state };
    assert.equal(f.views.offer(f.room, next, 17 + index * 17, f.authorities.offer(next, 17 + index * 17)), true);
    const queued = JSON.stringify(f.authorities);
    assert.equal(f.gateReadiness(), false, "accepted exact presentation change has not been submitted yet");
    assert.equal(startupViewKey(f.game.startupPreparationSnapshot), key, "orientation/contact are not packet-driven spatial stage revisions");
    f.renderGate(); assert.equal(f.gateReadiness(), true);
    assert.equal(JSON.stringify(f.authorities), queued); assert.deepEqual(f.game.actor.position, SPAWN);
  }
});

test("known remote motion prepares actual root/LOD/vehicle visibility without sampling or consuming network state", async (t) => {
  const f = networkViewFixture(t), pool = new AvatarPrimitivePool(f.scene), snapshots = new SnapshotBuffer();
  t.after(() => pool.dispose());
  t.mock.method(snapshots, "sample", () => { throw new Error("Startup must not sample the network presentation timeline"); });
  Object.assign(f.game, { snapshots, minimumMotionTick: -1, diagnosticNetwork: { motionPackets: 0 }, contactShadows: { remove() {}, set() {} },
    makeAvatar(player: any) {
      const config = applyAvatarPreset(player.avatar.preset, DEFAULT_AVATAR), rig = createAvatarRig(f.scene, config, pool, player.id);
      const animation = new AvatarAnimator(rig);
      t.mock.method(animation, "update", () => { throw new Error("Startup dt0 must not advance avatar animation"); });
      return { ...rig, lod: new AvatarLodController(f.scene, pool, rig, config), animation, target: player, profile: JSON.stringify(player.avatar) };
    },
  });
  delete f.game.updateAvatarPresentation; // actual presenter + actual LOD/rig, terminal NullEngine only
  const starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  const remote = f.game.avatars.get("known-peer"), stageKey = startupViewKey(f.game.startupPreparationSnapshot);
  const initialCoverage = f.game.startupPreparationCoverage();
  for (const [index, pose] of [
    { x: 300, y: 2.62, z: 300, yaw: 2.4, vehicle: false, lod: "far" },
    { x: -3.696, y: 2.62, z: -73.087, yaw: 1.2, vehicle: false, lod: "near" },
    { x: -3.696, y: 2.62, z: -73.087, yaw: 1.2, vehicle: true, lod: "near" },
  ].entries()) {
    f.game.syncMotion({ tick: index + 1, time: 2000 + index * 50,
      rows: [["known-peer", pose.x, pose.y, pose.z, pose.yaw, 0, 0, pose.vehicle ? 1 : 0, "outside", true]] });
    const queue = JSON.stringify(f.authorities), history = JSON.stringify([...snapshots.entities]), offset = snapshots.offset;
    assert.equal(f.gateReadiness(), true, "new accepted remote target belongs to the next submitted frame, not the in-flight snapshot");
    f.renderGate(); assert.equal(f.gateReadiness(), true);
    assert.equal(remote.root.position.x, pose.x); assert.equal(remote.root.position.z, pose.z);
    assert.ok(Math.abs(remote.root.position.y - (pose.y - 0.8)) < 1e-6);
    assert.equal(remote.lod.level, pose.lod); assert.equal(remote.root.isEnabled(), !pose.vehicle);
    assert.equal(startupViewKey(f.game.startupPreparationSnapshot), stageKey, "remote motion does not restart a stage per packet");
    assert.equal(JSON.stringify(f.authorities), queue); assert.equal(JSON.stringify([...snapshots.entities]), history); assert.equal(snapshots.offset, offset);
    assert.deepEqual(f.game.actor.position, SPAWN); assert.equal(f.gameplayFrames(), 0);
    if (!index) assert.notEqual(f.game.startupPreparationCoverage(), initialCoverage, "actual near/far output is independent stage coverage");
  }
});

test("shared original gate budget pauses hidden and expires instead of giving handshake fresh30s", async (t) => {
  const f = networkViewFixture(t), starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  f.advanceViewClock(2000); f.document.hidden = true; f.document.dispatchEvent(new Event("visibilitychange"));
  f.advanceViewClock(60000); f.document.hidden = false; f.document.dispatchEvent(new Event("visibilitychange"));
  f.advanceViewClock(28001);
  await assert.rejects(f.game.completeStartupPreparation(), /budget exhausted/);
  assert.equal(f.game.ready, false); assert.equal(f.loops.size, 0); assert.equal(f.pipelineScopes[0].disposed, 1);
});

test("retired startup view owner cannot release fresh ownership; unsupported vehicle keeps original preparation path", async (t) => {
  const retired = networkViewFixture(t), starting = retired.game.start(); await settle(); retired.gate.resolve(); await starting;
  retired.views.begin({}, "other", 2);
  await assert.rejects(retired.game.completeStartupPreparation(), error => (error as Error).name === "AbortError");
  assert.equal(retired.pipelineScopes[0].disposed, 1);
  const vehicle = networkViewFixture(t); vehicle.offer(1, { x: -3, y: 2.62, z: -70 }, 1, true);
  const vehicleStart = vehicle.game.start(); await settle(); vehicle.gate.resolve(); await vehicleStart;
  assert.equal(vehicle.game.canvas.dataset.preparationView, "vehicle-unchanged");
  assert.deepEqual(vehicle.game.actor.position, SPAWN); await vehicle.game.completeStartupPreparation();
  assert.equal(vehicle.gateTimeouts.length, 1); assert.equal(vehicle.pipelineScopes[0].disposed, 1);
});

test("a synchronous observer stall cannot bypass the shared deadline through the unchanged vehicle branch", async (t) => {
  const f = networkViewFixture(t); f.offer(1, { x: -3, y: 2.62, z: -70 }, 1, true);
  const starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  f.advanceViewClock(30001); // watchdog task has not received an event-loop turn
  await assert.rejects(f.game.completeStartupPreparation(), /budget exhausted/);
  assert.equal(f.game.ready, false); assert.equal(f.loops.size, 0); assert.equal(f.pipelineScopes[0].disposed, 1);
  assert.equal(f.gateTimeouts.length, 1, "unchanged vehicle coverage adds no new submission gate");
});

test("submillimetre doorway/zone and interior-light changes remain independent real presentation coverage", async (t) => {
  const f = networkViewFixture(t), starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  const bounds = actualB6Layout.bounds, y = actualB6Layout.foundationOffset + 0.82, z = (bounds.minZ + bounds.maxZ) / 2;
  f.offer(1, { x: bounds.minX - 0.0001, y, z }); [...f.loops][0]();
  const outsideKey = startupViewKey(f.game.startupPreparationSnapshot), outsideCoverage = f.game.startupPreparationCoverage();
  f.offer(2, { x: bounds.minX + 0.0001, y, z }); [...f.loops][0]();
  assert.equal(startupViewKey(f.game.startupPreparationSnapshot), outsideKey, "1mm key alone does not prove geometric equivalence");
  assert.notEqual(f.game.startupPreparationCoverage(), outsideCoverage, "exact world/zone/interior-light output still changes revision");
  assert.deepEqual(f.game.actor.position, SPAWN);
  f.game.actor.position = { ...f.game.startupPreparationSnapshot.authority.position }; await f.game.completeStartupPreparation();
});

test("startup view held loop is retired on renderer failure, and repeated start cannot replace an active presentation owner", async (t) => {
  const f = networkViewFixture(t), starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  const lease = f.game.startupPresentationLease;
  await assert.rejects(f.game.start(), /handoff is still active/); assert.equal(f.game.startupPresentationLease, lease);
  const failure = new Error("same renderer fault during observer handoff");
  assert.doesNotThrow(() => f.health.report("render", failure));
  assert.equal(f.game.startupPresentationLease, undefined); assert.equal(f.pipelineScopes[0].disposed, 1); assert.equal(f.loops.size, 0);
  assert.equal(f.game.ready, false); assert.equal(f.game.startupPreparationSource, undefined);
});

test("an observer that never hands back cannot retain the visible startup view beyond the original remaining budget", async (t) => {
  const f = networkViewFixture(t), starting = f.game.start(); await settle(); f.gate.resolve(); await starting;
  assert.equal(f.viewTimers.size, 1); f.advanceViewClock(2000);
  f.document.hidden = true; f.document.dispatchEvent(new Event("visibilitychange")); assert.equal(f.viewTimers.size, 0);
  f.advanceViewClock(60000); f.document.hidden = false; f.document.dispatchEvent(new Event("visibilitychange")); assert.equal(f.viewTimers.size, 1);
  f.advanceViewClock(28001); f.fireViewTimers();
  assert.equal(f.game.ready, false); assert.equal(f.game.startupPresentationLease, undefined);
  assert.equal(f.pipelineScopes[0].disposed, 1); assert.equal(f.viewTimers.size, 0); assert.equal(f.loops.size, 0);
  await assert.rejects(f.game.completeStartupPreparation(), /budget exhausted/);
});
