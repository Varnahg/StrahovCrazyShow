import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { RenderHealth } from "../client/render-health";
import { arePreparationEffectsReady } from "../client/strict-material-preparation";

const source = ts.createSourceFile(
  "game.ts",
  readFileSync(
    process.env.GAME_STARTUP_SOURCE ??
      new URL("../client/game.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const gameClass = source.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === "Game",
)!;
const methods = gameClass.members.filter(
  (node) =>
    node.name &&
    [
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
    ].includes(node.name.getText(source)),
);
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
  const { exports, measurePresentationRate, initPhysics, Simulation, loadModule, B6_LAYOUT, SurfacePack, CinematicAtmosphere, VehicleLighting, sessionDiagnostics, waitForRenderStartup, arePreparationEffectsReady } = env;
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
    car = deferred<any>();
  let disposedAssets = 0,
    gateCalls = 0,
    simulations = 0,
    failures = 0;
  const events: { kind: string; data: unknown }[] = [];
  const shaderStages: string[] = [];
  let gateReadiness: (() => boolean) | undefined;
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
  if (!options.holdPhysics) physics.resolve();
  if (!options.holdAssets) {
    interior.resolve(interiorAsset);
    vegetation.resolve(vegetationAsset);
    car.resolve(carAsset);
  }
  let game: any, health: RenderHealth;
  const StartupGame = make({
    arePreparationEffectsReady,
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
        return { position: { x: 0, y: 1, z: 0 } };
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
    sessionDiagnostics: {
      event: (kind: string, data: unknown) => events.push({ kind, data }),
    },
    waitForRenderStartup: async (input: {
      health: RenderHealth;
      signal: AbortSignal;
      isReady(): boolean;
    }) => {
      gateCalls++;
      gateReadiness = input.isReady;
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
    scene: { render() {}, getActiveMeshes: () => ({ length: 0, data: [] }) },
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
    prepareLighting: async () => ({
      status: options.preparation ?? "complete",
      elapsedMs: 1,
      stages: [],
    }),
  });
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
    shaderStages,
    gateReadiness: () => gateReadiness!(),
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
});

test("actual Game rejects an incomplete light preparation instead of announcing ready", async (t) => {
  const f = fixture(t, { preparation: "timeout" });
  await assert.rejects(f.game.start(), /Přípravu 3D scény/);
  assert.equal(f.stats().gateCalls, 0);
  assert.equal(f.game.ready, false);
  assert.equal(f.health.snapshot().valid, false);
  assert.equal(f.loops.size, 0);
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
