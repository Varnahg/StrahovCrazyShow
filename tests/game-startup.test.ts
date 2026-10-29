import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { setImmediate } from "node:timers/promises";
import ts from "typescript";
import { Observable } from "@babylonjs/core/Misc/observable";
import { RenderHealth } from "../client/render-health";
import { WebGpuPipelinePreparation } from "../client/webgpu-pipeline-preparation";

// Transpile the actual methods, not an equivalent startup implementation. The
// VM replaces only dependencies/rendering/IO and exposes deterministic gates.
const source = ts.createSourceFile(
  "game.ts",
  readFileSync(
    process.env.COMBINED_GAME_SOURCE ??
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
assert.ok(gameClass, "Game class must exist");
const methodNames = [
  "start",
  "startContent",
  "startupPhase",
  "createWorldPresentation",
  "updatePreloadVisuals",
  "updatePlayers",
  "setCar",
  "dispose",
  "assetLoadErrorCount",
  "ready",
  "disposed",
  "avatarSetupReady",
  "pendingPlayers",
  "startupAssetErrors",
  "renderErrorCount",
  "rainLines",
  "avatars",
  "assertStartupActive",
  "handleRendererFailure",
  "trackStartupAsset",
  "trackStartupResource",
  "disposeStartupAsset",
  "disposeStartupAssets",
  "disposeStartupWorld",
  "isMeshReadyForCamera",
  "startupAbort",
  "startupAssets",
  "rendererFailed",
];
const methods = methodNames.map((name) => {
  const member = gameClass.members.find(
    (node) =>
      node.name && ts.isIdentifier(node.name) && node.name.text === name,
  );
  assert.ok(
    member &&
      (ts.isMethodDeclaration(member) ||
        ts.isGetAccessorDeclaration(member) ||
        (ts.isPropertyDeclaration(member) && !!member.initializer)),
    `Game must define ${name}`,
  );
  return member.getText(source);
});
const script = new Script(
  ts.transpileModule(
    `class StartupGame { ${methods.join("\n")} }\nStartupGame;`,
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
      transformers: {
        before: [
          (context) => (input) => {
            const visit: ts.Visitor = (node) =>
              ts.isMetaProperty(node) &&
              node.keywordToken === ts.SyntaxKind.ImportKeyword
                ? ts.factory.createIdentifier("testImportMeta")
                : ts.visitEachChild(node, visit, context);
            return ts.visitNode(input, visit) as ts.SourceFile;
          },
        ],
      },
    },
  ).outputText,
);

function deferred<T>() {
  let complete!: (value: T) => void,
    fail!: (error: unknown) => void,
    settled = false;
  const promise = new Promise<T>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  return {
    promise,
    get settled() {
      return settled;
    },
    resolve(value: T) {
      settled = true;
      complete(value);
    },
    reject(error: unknown) {
      settled = true;
      fail(error);
    },
  };
}
type Player = {
  id: string;
  x: number;
  y: number;
  z: number;
  avatar: { preset: number };
};
type StartupGame = Record<string, any> & {
  start(): Promise<void>;
  dispose(): void;
  updatePlayers(players: Player[]): void;
  setCar(value: object): void;
};
type Resource = { dispose(): void; [key: string]: any };
type WorldControllers = {
  b6Root: object;
  b6Fallback: Resource;
  architecture: Resource;
  landmarks: Resource;
  campusExterior: Resource;
  outdoorArtifacts: Resource;
};
function fixture(
  t: TestContext,
  options: {
    failPhysics?: boolean;
    failVisual?: boolean;
    cleanupThrows?: string;
    ignoreWorldCancel?: boolean;
    lossDuringSimulation?: boolean;
    holdGate?: boolean;
    preparation?: "complete" | "timeout";
  } = {},
) {
  const effects: string[] = [];
  const diagnostics: { kind: string; data: any }[] = [];
  const disposed = new Map<string, number>(),
    created = new Map<string, number>();
  const calls: Record<string, any[][]> = {};
  const record = (name: string, ...args: any[]) => {
    effects.push(name);
    (calls[name] ??= []).push(args);
  };
  const cadence = deferred<{ reliable: boolean; observedBrowserHz: number }>();
  const world = deferred<WorldControllers>();
  const gate = deferred<void>();
  const loaders = {
    b6: deferred<Resource>(),
    vegetation: deferred<Resource>(),
    car: deferred<Resource>(),
  };
  const failure = new Error("fixture phase failure");
  const resource = (
    name: string,
    extra: Record<string, any> = {},
  ): Resource => {
    created.set(name, (created.get(name) ?? 0) + 1);
    record("create:" + name);
    return {
      ...extra,
      dispose: () => {
        disposed.set(name, (disposed.get(name) ?? 0) + 1);
        record("dispose:" + name);
        if (options.cleanupThrows === name) throw new Error("cleanup " + name);
      },
    };
  };
  class Vector {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
    ) {}
    set(x: number, y: number, z: number) {
      this.x = x;
      this.y = y;
      this.z = z;
      return this;
    }
    copyFromFloats(x: number, y: number, z: number) {
      return this.set(x, y, z);
    }
  }
  const node = (name: string) =>
    resource(name, {
      position: new Vector(),
      rotation: { y: 0 },
      setEnabled: (value: boolean) => record(name + ":enabled", value),
    });
  const actor = { position: { x: 10, y: 2, z: 20 }, vehicle: false };
  const local: Player = {
    id: "local",
    x: 10,
    y: 2,
    z: 20,
    avatar: { preset: 0 },
  };
  const loops = new Set<() => void>();
  const canvas = {
    dataset: {} as Record<string, string>,
    removeEventListener: (name: string) => record("canvas.remove", name),
  };
  const scene = resource("scene", { render: () => record("scene.render") });
  const engine = resource("engine", {
    isWebGPU: false,
    // This startup fixture replaces RAF/GPU I/O; RenderHealth still owns its hooks.
    _processFrame() {},
    endFrame() {},
    onEffectErrorObservable: new Observable(),
    onContextLostObservable: new Observable(),
    onContextRestoredObservable: new Observable(),
    onDisposeObservable: new Observable(),
    runRenderLoop: (callback: () => void) => {
      record("loop.start");
      loops.add(callback);
    },
    stopRenderLoop: (callback?: () => void) => {
      record("loop.stop");
      if (callback) loops.delete(callback);
      else loops.clear();
    },
  });
  const worldControllers = {
    b6Root: {},
    b6Fallback: resource("world-fallback"),
    architecture: resource("architecture"),
    landmarks: resource("landmarks"),
    campusExterior: resource("campus"),
    outdoorArtifacts: resource("outdoor"),
  };
  const loaded = {
    b6: resource("loaded-b6", {
      attachToBuilding: (root: unknown) => record("b6.attach", root),
      interiorLightEnabled: true,
    }),
    vegetation: resource("loaded-vegetation", { stats: {} }),
    car: resource("loaded-car", {
      car: node("loaded-car-root"),
      parked: node("loaded-parked-root"),
      setQuality: (quality: string) => record("car.quality", quality),
      updateLighting: (night: number) => record("car.lighting", night),
      updateWheels: () => {},
    }),
  };
  let carNumber = 0,
    now = 0;
  let game!: StartupGame;
  const health = new RenderHealth(engine as any, "game", (fault) => {
    if (fault.channel === "device") game.handleRendererFailure(fault.message);
  });
  const environment: Record<string, any> = {
    WebGpuPipelinePreparation,
    exports: {},
    AbortController,
    testImportMeta: {
      env: {
        MODE: "test",
        DEV: false,
        VITE_SOURCE_SNAPSHOT_ID: "fixture-source",
      },
    },
    sessionDiagnostics: {
      event: (kind: string, data: unknown) =>
        diagnostics.push({ kind, data: structuredClone(data) }),
    },
    performance: { now: () => ++now },
    RENDER_INCIDENT_SCOPE: {},
    MESH_DRAW_PROFILE_SCOPE: {},
    CAR_SPAWN: { x: 40, z: 50 },
    groundHeight: () => 3,
    B6_LAYOUT: { foundationOffset: 1.5 },
    Vector3: Vector,
    Color3: class {
      constructor(..._args: unknown[]) {}
    },
    MeshBuilder: {
      CreateLineSystem: (_name: string, settings: any) => {
        record("rain.lines", settings.lines.length);
        return node("rain");
      },
    },
    measurePresentationRate: () => {
      record("cadence.begin");
      return cadence.promise;
    },
    waitForRenderStartup: async (input: { health: RenderHealth }) => {
      record("submitted.gate");
      if (options.holdGate) await input.health.guard(gate.promise);
      assert.ok(input.health.markReady());
    },
    createWorldBuildJob: (_game: unknown, hooks: any) => {
      record("world.job");
      return {
        run: () => {
          record("world.run");
          hooks.onPhase({ phase: "fixture-world" });
          return world.promise;
        },
        cancel: () => {
          record("world.cancel");
          if (!world.settled && !options.ignoreWorldCancel)
            world.reject(
              Object.assign(new Error("World build was aborted"), {
                name: "AbortError",
              }),
            );
        },
      };
    },
    initPhysics: () => {
      record("physics.library");
      if (options.failPhysics) throw failure;
    },
    Simulation: class {
      constructor() {
        if (options.lossDuringSimulation)
          queueMicrotask(() =>
            engine.onContextLostObservable.notifyObservers(engine),
          );
        return resource("simulation", {
          add: (id: string) => {
            record("actor.add", id);
            return actor;
          },
          surfaceHeight: () => 3,
          restorePublicCar: (state: unknown) =>
            record("sim.car.restore", state),
          setParkedCar: (...args: unknown[]) => record("sim.car.park", ...args),
        });
      }
    },
    SurfacePack: class {
      constructor() {
        if (options.failVisual) throw failure;
        return resource("surface", {
          update: (...args: unknown[]) => record("surface.update", ...args),
        });
      }
    },
    CinematicAtmosphere: class {
      constructor() {
        return resource("cinematic", {
          update: (data: unknown) => record("cinematic.update", data),
        });
      }
    },
    VehicleLighting: class {
      constructor() {
        return resource("vehicle-lighting");
      }
    },
    SkyWeatherController: class {
      constructor() {
        return resource("sky", {
          atmosphere: { stable: true },
          update: (data: unknown) => {
            record("sky.update", data);
            return { sun: { daylight: 0.25 }, moon: { visible: true } };
          },
        });
      }
    },
    applyArtLighting: (_game: unknown, data: unknown) => {
      record("lighting.update", data);
      return { night: 0.75, keySource: "moon" };
    },
    window: {
      removeEventListener: (name: string) => record("window.remove", name),
    },
    document: {
      pointerLockElement: null,
      exitPointerLock: () => record("pointer.exit"),
      removeEventListener: (name: string) => record("document.remove", name),
    },
    console: {
      error: (...args: unknown[]) => record("console.error", ...args),
      warn: (...args: unknown[]) => record("console.warn", ...args),
    },
    require: (name: string) => {
      record("import:" + name);
      if (name === "./assets")
        return {
          loadCar: () => {
            record("load.car");
            return loaders.car.promise;
          },
        };
      if (name === "./vegetation")
        return {
          loadVegetation: () => {
            record("load.vegetation");
            return loaders.vegetation.promise;
          },
        };
      if (name === "./b6-reality")
        return {
          loadB6Reality: () => {
            record("load.b6");
            return loaders.b6.promise;
          },
        };
      if (name === "./transit-renderer")
        return {
          TransitRenderer: class {
            constructor() {
              return resource("transit");
            }
          },
        };
      throw new Error("Unexpected dynamic import " + name);
    },
  };
  const Game = script.runInNewContext(environment) as new () => StartupGame;
  game = new Game();
  Object.assign(game, {
    canvas,
    scene,
    engine,
    renderHealth: health,
    compilationProfile: { snapshot: () => ({}), setStage() {} },
    prepareLighting: async () => ({
      status: options.preparation ?? "complete",
      stages: [],
    }),
    blur: () => record("input.blur"),
    notice: (message: string) => record("notice", message),
    onRendererFailure: (message: string) => record("renderer.failure", message),
    network: true,
    gpu: {},
    quality: "medium",
    adaptive: {
      state: { quality: "medium" },
      setPresentationHz: (hz: number | null) => {
        record("quality.presentation", hz);
        return { quality: "medium" };
      },
    },
    applyAdaptiveQuality: (state: unknown) => record("quality.apply", state),
    localPlayer: local,
    localId: local.id,
    previousPosition: new Vector(),
    camera: {},
    sun: {},
    timeOverride: 1791928800000,
    weather: { rain: 1.2, cloud: 0.6 },
    snapshots: { remove: (id: string) => record("snapshot.remove", id) },
    makeCar: () => {
      record("makeCar");
      return node("fallback-car-" + ++carNumber);
    },
    makeAvatar: (player: Player) => {
      record("makeAvatar", player.id);
      return {
        root: node("avatar-" + player.id),
        profile: JSON.stringify(player.avatar),
        target: player,
        eyeHeight: 1.8,
      };
    },
    updateCameraFollow: (position: Vector, eye: number, dt: number) =>
      record("camera.follow", { ...position }, eye, dt),
    frame: () => record("game.frame"),
    resetDiagnosticContext: () => record("diagnostic.reset"),
    stableLights: resource("stable-lights", {
      update: () => record("lights.update"),
    }),
    enabledMeshCandidates: resource("mesh-candidates"),
    labels: resource("labels", {
      remove: (id: string) => record("label.remove", id),
    }),
    contactShadows: resource("contact-shadows", {
      remove: (id: string) => record("shadow.remove", id),
    }),
    instrumentation: resource("scene-instrumentation"),
    engineInstrumentation: resource("engine-instrumentation"),
    avatarPool: resource("avatar-pool", {
      pruneUnused: () => record("avatar.prune"),
    }),
  });
  t.after(() => {
    if (!game.disposed) game.dispose();
  });
  async function enterLoaders() {
    cadence.resolve({ reliable: true, observedBrowserHz: 120 });
    await setImmediate();
    assert.ok(effects.includes("world.run"));
    world.resolve(worldControllers);
    await setImmediate();
    assert.ok(
      effects.includes("load.car") &&
        effects.includes("load.b6") &&
        effects.includes("load.vegetation"),
    );
  }
  const resolveAssets = () => {
    loaders.b6.resolve(loaded.b6);
    loaders.vegetation.resolve(loaded.vegetation);
    loaders.car.resolve(loaded.car);
  };
  return {
    game,
    engine,
    health,
    gate,
    effects,
    calls,
    diagnostics,
    disposed,
    created,
    cadence,
    world,
    loaders,
    loaded,
    worldControllers,
    local,
    loops,
    failure,
    enterLoaders,
    resolveAssets,
    tickRender: () => {
      for (const callback of [...loops]) callback();
    },
  };
}

test("Game constructor defers world/cars/sky/physics and final presentation factories", () => {
  const constructor = gameClass.members.find(ts.isConstructorDeclaration)!;
  const forbidden = new Set([
    "buildWorld",
    "createWorldBuildJob",
    "createWorldPresentation",
    "makeCar",
    "updatePlayers",
    "Simulation",
    "SkyWeatherController",
    "SurfacePack",
    "CinematicAtmosphere",
    "VehicleLighting",
  ]);
  const called: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : "";
      if (forbidden.has(name)) called.push(name);
    }
    ts.forEachChild(node, visit);
  };
  visit(constructor);
  assert.deepEqual(called, []);
});

test("actual startup orders cadence/world/final visuals before any preload or loader and owns each controller once", async (t) => {
  const f = fixture(t);
  const started = f.game.start();
  assert.ok(f.effects.includes("cadence.begin"));
  assert.ok(
    !f.effects.includes("world.job") &&
      !f.effects.includes("makeCar") &&
      !f.effects.includes("create:sky"),
  );
  await f.enterLoaders();
  const before = (a: string, b: string) =>
    assert.ok(f.effects.indexOf(a) < f.effects.indexOf(b), `${a} before ${b}`);
  before("world.run", "makeCar");
  before("create:sky", "physics.library");
  for (const phase of [
    "create:surface",
    "create:cinematic",
    "create:vehicle-lighting",
    "makeAvatar",
    "camera.follow",
    "surface.update",
    "cinematic.update",
  ]) {
    before(phase, "loop.start");
    before(phase, "load.car");
    before(phase, "load.b6");
  }
  assert.equal(f.game.ready, false);
  assert.equal(f.calls["rain.lines"].length, 1);
  f.tickRender();
  f.tickRender();
  assert.equal(f.calls["scene.render"].length, 2);
  assert.equal(f.calls["game.frame"]?.length ?? 0, 0);
  assert.equal(f.calls["sky.update"][0][0].instant, f.game.timeOverride);
  assert.equal(f.calls["sky.update"][0][0].dt, 0);
  assert.deepEqual(f.calls["surface.update"][0], [0, "medium", 1.2]);
  assert.equal(f.calls["cinematic.update"][0][0].keySource, "moon");
  f.resolveAssets();
  await started;
  assert.equal(f.game.ready, true);
  assert.equal(f.game.canvas.dataset.bootStage, "ready");
  for (const name of [
    "surface",
    "cinematic",
    "vehicle-lighting",
    "sky",
    "transit",
    "simulation",
  ])
    assert.equal(f.created.get(name), 1, name);
  assert.equal(f.calls.makeCar.length, 2);
  assert.equal(f.calls.makeAvatar.length, 1);
  for (const loader of ["load.b6", "load.vegetation", "load.car"])
    assert.equal(f.calls[loader].length, 1, loader);
  assert.equal(f.disposed.get("fallback-car-1"), 1);
  assert.equal(f.disposed.get("fallback-car-2"), 1);
  assert.equal(f.disposed.get("world-fallback"), 1);
  assert.equal(f.game.b6Reality, f.loaded.b6);
  assert.equal(f.game.vegetation, f.loaded.vegetation);
  assert.equal(f.loops.size, 1);
  f.tickRender();
  assert.equal(f.calls["game.frame"].length, 1);
  for (const name of ["loaded-b6", "loaded-vegetation", "loaded-car"])
    assert.equal(f.disposed.get(name), undefined);
  const phases = f.diagnostics.filter(
    (event) => event.kind === "startup-phase",
  );
  assert.ok(phases.some((event) => event.data.phase === "final-visual-setup"));
  assert.ok(
    phases.every(
      (event) =>
        event.data.outcome === "complete" && event.data.durationMs >= 0,
    ),
  );
  f.game.dispose();
  f.game.dispose();
  for (const name of [
    "loaded-b6",
    "loaded-vegetation",
    "loaded-car",
    "surface",
    "cinematic",
    "scene",
    "engine",
    "simulation",
  ])
    assert.equal(f.disposed.get(name), 1, name);
});

test("presence during staged world is deferred and early setCar cannot touch absent presentation", async (t) => {
  const f = fixture(t),
    stale = { ...f.local, id: "stale" },
    latest = { ...f.local, id: "latest" };
  const started = f.game.start();
  f.game.updatePlayers([f.local, stale]);
  f.game.updatePlayers([f.local, latest]);
  assert.equal(f.game.avatars.size, 0);
  assert.equal(f.calls.makeAvatar?.length ?? 0, 0);
  assert.doesNotThrow(() =>
    f.game.setCar({ x: 5, y: 1, z: 4, yaw: 0.3, parked: true }),
  );
  await f.enterLoaders();
  assert.deepEqual([...f.game.avatars.keys()], ["local", "latest"]);
  assert.deepEqual(
    f.calls.makeAvatar.map((call) => call[0]),
    ["local", "latest"],
  );
  f.game.updatePlayers([f.local, latest]);
  assert.equal(f.calls.makeAvatar.length, 2);
  f.resolveAssets();
  await started;
});

test("cancellation during cadence never constructs a world or publishes ready", async (t) => {
  const f = fixture(t),
    started = f.game.start();
  f.game.dispose();
  f.cadence.resolve({ reliable: true, observedBrowserHz: 120 });
  await assert.rejects(started, { name: "AbortError" });
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.calls["world.job"], undefined);
  assert.equal(f.calls.makeCar, undefined);
  assert.equal(f.disposed.get("engine"), 1);
});

test("world cancellation rejection does not dispose the already closed Game twice", async (t) => {
  const f = fixture(t),
    started = f.game.start();
  const rejection = assert.rejects(started, { name: "AbortError" });
  f.cadence.resolve({ reliable: true, observedBrowserHz: 120 });
  await setImmediate();
  assert.ok(f.calls["world.run"]);
  f.game.dispose();
  await rejection;
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  assert.equal(f.calls["world.cancel"].length, 1);
  assert.equal(f.disposed.get("engine"), 1);
  assert.equal(f.disposed.get("avatar-pool"), 1);
  assert.equal(
    f.diagnostics.filter((event) => event.kind === "game-dispose").length,
    1,
  );
});

for (const phase of ["physics-library", "final-visual-setup"] as const)
  test(`fatal ${phase} failure disposes partial Game and preserves its original error`, async (t) => {
    const f = fixture(t, {
      failPhysics: phase === "physics-library",
      failVisual: phase === "final-visual-setup",
    });
    const started = f.game.start(),
      rejection = assert.rejects(started, (error) => error === f.failure);
    f.cadence.resolve({ reliable: false, observedBrowserHz: 120 });
    await setImmediate();
    f.world.resolve(f.worldControllers);
    await rejection;
    assert.equal(f.game.disposed, true);
    assert.equal(f.game.ready, false);
    assert.equal(f.loops.size, 0);
    assert.equal(f.disposed.get("engine"), 1);
    assert.equal(f.disposed.get("scene"), 1);
    assert.equal(f.calls["load.car"], undefined);
    const event = f.diagnostics.find(
      (event) => event.kind === "startup-phase" && event.data.phase === phase,
    )!;
    assert.equal(event.data.outcome, "failed");
    assert.ok(event.data.durationMs >= 0);
    assert.equal(f.calls["quality.presentation"][0][0], null);
  });

test("late fulfilled loaders are disposed after cancel, even if one cleanup throws; no normal render loop starts", async (t) => {
  const f = fixture(t, { cleanupThrows: "loaded-b6" }),
    started = f.game.start();
  const rejected = assert.rejects(started, { name: "AbortError" });
  await f.enterLoaders();
  f.tickRender();
  f.loaders.b6.resolve(f.loaded.b6);
  await setImmediate();
  f.game.dispose();
  assert.equal(f.loops.size, 0);
  f.loaders.vegetation.resolve(f.loaded.vegetation);
  f.loaders.car.resolve(f.loaded.car);
  await rejected;
  await setImmediate();
  assert.equal(f.game.ready, false);
  assert.notEqual(f.game.canvas.dataset.bootStage, "ready");
  assert.equal(f.game.b6Reality, undefined);
  assert.equal(f.game.vegetation, undefined);
  assert.equal(f.game.disposeCarAssets, undefined);
  for (const name of [
    "loaded-b6",
    "loaded-vegetation",
    "loaded-car",
    "transit",
    "engine",
  ])
    assert.equal(f.disposed.get(name), 1, name);
  assert.equal(f.calls["game.frame"], undefined);
  const cleanup = f.diagnostics.find(
    (event) => event.kind === "startup-cleanup-error",
  )!;
  assert.ok(
    cleanup.data.errors.some((message: string) =>
      message.includes("cleanup loaded-b6"),
    ),
  );
});

test("one rejected optional loader retains its fallback while fulfilled controllers are transferred and disposed once", async (t) => {
  const f = fixture(t),
    started = f.game.start();
  await f.enterLoaders();
  f.loaders.b6.reject(new Error("missing optional B6"));
  f.loaders.vegetation.resolve(f.loaded.vegetation);
  f.loaders.car.resolve(f.loaded.car);
  await started;
  assert.equal(f.game.ready, true);
  assert.equal(f.game.startupAssetErrors, 1);
  assert.equal(f.game.b6Reality, undefined);
  assert.equal(f.disposed.get("world-fallback"), undefined);
  assert.equal(f.game.vegetation, f.loaded.vegetation);
  assert.equal(
    f.diagnostics.find(
      (event) =>
        event.kind === "startup-phase" && event.data.phase === "b6-assets",
    )!.data.outcome,
    "failed",
  );
  f.game.dispose();
  assert.equal(f.disposed.get("loaded-car"), 1);
  assert.equal(f.disposed.get("loaded-vegetation"), 1);
});

test("a world result arriving after disposal releases every transferred controller despite one cleanup failure", async (t) => {
  const f = fixture(t, {
    ignoreWorldCancel: true,
    cleanupThrows: "architecture",
  });
  const started = f.game.start();
  const rejection = started.catch((error: unknown) => error);
  f.cadence.resolve({ reliable: true, observedBrowserHz: 60 });
  await setImmediate();
  f.game.dispose();
  f.world.resolve(f.worldControllers);
  await rejection;
  await setImmediate();
  for (const name of ["architecture", "landmarks", "campus", "outdoor"])
    assert.equal(f.disposed.get(name), 1, name);
  assert.equal(f.game.worldControllers, undefined);
  assert.equal(f.calls.makeCar, undefined);
  assert.ok(
    f.diagnostics.some(
      (event) =>
        event.kind === "startup-cleanup-error" &&
        event.data.errors.some((message: string) =>
          message.includes("architecture"),
        ),
    ),
  );
});

test("device fault while world is pending promptly rejects without waiting for a noncooperative job", async (t) => {
  const f = fixture(t, { ignoreWorldCancel: true });
  let rejected = false;
  const started = f.game.start().catch(() => {
    rejected = true;
  });
  f.cadence.resolve({ reliable: true, observedBrowserHz: 60 });
  await setImmediate();
  f.engine.onContextLostObservable.notifyObservers(f.engine);
  await setImmediate();
  assert.equal(rejected, true);
  assert.equal(f.game.disposed, true);
  f.world.resolve(f.worldControllers);
  await started;
  await setImmediate();
  assert.equal(f.disposed.get("architecture"), 1);
});

test("fault between world result settlement and adoption cannot install disposed controllers", async (t) => {
  const f = fixture(t),
    started = f.game.start(),
    rejected = assert.rejects(started);
  f.cadence.resolve({ reliable: true, observedBrowserHz: 60 });
  await setImmediate();
  // The tracker receives the result first; the nested microtask delivers loss
  // after its guard settles but before Game can adopt the returned controllers.
  void f.world.promise.then(() =>
    queueMicrotask(() =>
      f.engine.onContextLostObservable.notifyObservers(f.engine),
    ),
  );
  f.world.resolve(f.worldControllers);
  await rejected;
  assert.equal(f.game.worldControllers, undefined);
  for (const name of ["architecture", "landmarks", "campus", "outdoor"])
    assert.equal(f.disposed.get(name), 1, name);
  assert.equal(f.calls.makeCar, undefined);
  assert.equal(f.game.ready, false);
});

test("device fault between Simulation construction and adoption releases it without creating an actor", async (t) => {
  const f = fixture(t, { lossDuringSimulation: true });
  const started = f.game.start(),
    rejected = assert.rejects(started);
  f.cadence.resolve({ reliable: true, observedBrowserHz: 60 });
  await setImmediate();
  f.world.resolve(f.worldControllers);
  await rejected;
  assert.equal(f.disposed.get("simulation"), 1);
  assert.equal(f.calls["actor.add"], undefined);
  assert.equal(f.created.get("surface"), undefined);
  assert.equal(f.game.ready, false);
});

test("combined phased startup waits for the submitted gate after final lighting", async (t) => {
  const f = fixture(t, { holdGate: true }),
    started = f.game.start();
  await f.enterLoaders();
  f.resolveAssets();
  await setImmediate();
  assert.equal(f.game.canvas.dataset.bootStage, "submitted-frame");
  assert.equal(f.game.ready, false);
  assert.equal(f.loops.size, 0);
  f.gate.resolve();
  await started;
  assert.equal(f.game.ready, true);
  assert.equal(f.health.snapshot().valid, true);
});
