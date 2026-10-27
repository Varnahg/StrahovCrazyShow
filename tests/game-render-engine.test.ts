import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import type { WeatherScenarioId } from "../shared/weather-scenarios";
import { RenderFallbackSession, WebGpuInitializationError } from "../client/render-fallback";

// Execute the actual UI effect. Replace imports/GPU IO, not startup ownership.
const source = ts.createSourceFile(
  "ui.tsx",
  readFileSync(process.env.GAME_UI_SOURCE ?? new URL("../client/ui.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);

test("compatibility retry is an explicit same-origin user action and preserves the QA context", () => {
  let handler: ts.Expression | undefined;
  const find = (node: ts.Node) => {
    if (ts.isJsxElement(node) && node.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(source) === "data-renderer-fallback")) {
      const attribute = node.openingElement.attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText(source) === "onClick") as ts.JsxAttribute;
      assert.ok(attribute.initializer && ts.isJsxExpression(attribute.initializer)); handler = attribute.initializer.expression;
    }
    ts.forEachChild(node, find);
  };
  find(source); assert.ok(handler);
  const script = new Script(ts.transpileModule(`action = (${handler.getText(source)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);
  for (const hostname of ["127.0.0.1:4182", "strahov.example"]) {
    const calls: string[] = [], href = `https://${hostname}/?terrainReview=b5-tree-near&treePilot=own&renderBackend=webgpu&renderBackend=bad#view`;
    const env = { URL, action: undefined as unknown as () => void, window: { location: { href, assign: (url: string) => calls.push(url) } } };
    script.runInNewContext(env); assert.equal(calls.length, 0, "failure never silently changes renderer"); env.action();
    assert.equal(calls.length, 1); const next = new URL(calls[0]); assert.equal(next.origin, new URL(href).origin);
    assert.deepEqual(next.searchParams.getAll("renderBackend"), ["webgl2"]);
    assert.equal(next.searchParams.get("treePilot"), "own"); assert.equal(next.searchParams.get("terrainReview"), "b5-tree-near"); assert.equal(next.hash, "#view");
  }
});
let effect: ts.ArrowFunction | undefined;
function visit(node: ts.Node) {
  if (
    ts.isCallExpression(node) &&
    node.expression.getText(source) === "useEffect" &&
    ts.isArrowFunction(node.arguments[0]) &&
    node.arguments[0].getText(source).includes('"mode-change"')
  )
    effect = node.arguments[0];
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(effect);
const compiled = ts.transpileModule(
  `const runEffect = ${effect.getText(source)};`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    transformers: {
      before: [
        (context) => (input) => {
          const replace: ts.Visitor = (node) => {
            if (
              ts.isCallExpression(node) &&
              node.expression.kind === ts.SyntaxKind.ImportKeyword
            )
              return ts.factory.createCallExpression(
                ts.factory.createIdentifier("loadModule"),
                undefined,
                node.arguments,
              );
            if (ts.isMetaProperty(node))
              return ts.factory.createIdentifier("testImportMeta");
            return ts.visitEachChild(node, replace, context);
          };
          return ts.visitNode(input, replace) as ts.SourceFile;
        },
      ],
    },
  },
).outputText;
const make = new Script(
  `(function(env) { const exports={}; const {mode,canvas,sessionDiagnostics,modeRef,loadModule,profileRef,game,seasonPreviewRef,weatherPreviewRef,idRef,setStats,userBenchmark,setBenchmark,benchmarkBuildIdentity,saveLocalBenchmark,setWorldSelection,notice,weatherRef,quality,targetFps,syncNetworkStage,drainAuthorities,setReady,setError,t,getRendererInfo,testImportMeta,inputBuffer,requestWebGlFallback,window,setRendererGeneration,setRendererCompatibility,room,connectionAttempt,disconnectRoom,doorConnectionRef,playersRef,carState,activity,networkProbeRef,connectedRef,reward}=env; ${compiled}; return runEffect(); })`,
).runInThisContext();
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(options: { constructionError?: boolean; startError?: boolean; startFailure?: Error; loseAfterStart?: boolean; weatherPreview?: WeatherScenarioId; network?: boolean; search?: string } = {}) {
  let resolveEngine!: (engine: any) => void;
  let rejectEngine!: (reason: Error) => void;
  const resetPromise = () => new Promise((resolve, reject) => {
    resolveEngine = resolve;
    rejectEngine = reject;
  });
  let promise = resetPromise();
  const engine = {
    disposed: 0,
    isWebGPU: true,
    dispose() {
      this.disposed++;
    },
  };
  let gameCount = 0,
    gameDisposals = 0,
    ready = false;
  const errors: string[] = [];
  const events: string[] = [];
  const eventRecords: { name: string; data: any }[] = [];
  const inputResets: string[] = [];
  const canvas = { current: { dataset: {} as Record<string, string> } };
  const requestedCanvases: unknown[] = [], disconnects: unknown[][] = [];
  const location = { hostname: "example.com", search: options.search ?? "" }, fallbackSession = new RenderFallbackSession();
  let selected = fallbackSession.select(location), generation = 0, compatibility = false;
  const room = { current: { id: "same-room" } };
  class Game {
    weatherPreview: WeatherScenarioId | null = null;
    onRendererFailure?: (message: string) => void;
    ready = false;
    network = false;
    networkTimeline = { setRtt() {} };
    renderHealth = { snapshot: () => ({ valid: this.ready, firstErrors: [] }) };
    constructor(_canvas: unknown, _profile: unknown, prepared: unknown) {
      assert.equal(_canvas, requestedCanvases.at(-1));
      assert.equal(prepared, engine);
      if (options.constructionError) throw new Error("construction failed");
      gameCount++;
    }
    setLocalId() {}
    setQuality() {}
    setTargetFps() {}
    setWeatherPreview(id: WeatherScenarioId | null) { this.weatherPreview = id; }
    attachDoorTimeline() {}
    updatePlayers() {}
    setCar() {}
    setFound() {}
    async start() {
      if (options.startFailure) throw options.startFailure;
      if (options.startError) throw new Error("start failed");
      this.ready = true;
      if (options.loseAfterStart) queueMicrotask(() => {
        this.ready = false;
        this.onRendererFailure?.("Device lost after start settlement");
      });
    }
    dispose() {
      gameDisposals++;
      engine.dispose();
    }
  }
  const noop = () => {};
  const state = { current: null as Game | null };
  const environment = {
    mode: options.network ? "multi" : "guest",
    canvas,
    profileRef: { current: {} },
    game: state,
    modeRef: { current: "menu" },
    seasonPreviewRef: { current: { instant: null } },
    weatherPreviewRef: { current: options.weatherPreview ?? null },
    idRef: { current: "fixture" },
    sessionDiagnostics: { event: (name: string, data: unknown) => { events.push(name); eventRecords.push({ name, data }); } },
    loadModule: async (name: string) => name === "./game" ? { Game } : {
      createGameEngine: (target: unknown) => { requestedCanvases.push(target); selected = fallbackSession.select(location); return promise; },
      getRenderEngineSelection: () => selected,
    },
    requestWebGlFallback: (error: unknown, value: typeof location, signal: AbortSignal) => fallbackSession.request(error, value, signal),
    window: { location },
    setRendererGeneration: (update: (value: number) => number) => generation = update(generation),
    setRendererCompatibility: (value: boolean) => compatibility = value,
    room, connectionAttempt: { current: 17 }, disconnectRoom: (...args: unknown[]) => disconnects.push(args),
    doorConnectionRef: { current: null }, playersRef: { current: [] }, carState: { current: null },
    activity: { hunt: [] }, networkProbeRef: { current: null }, connectedRef: { current: true }, reward: noop,
    setStats: noop,
    userBenchmark: { current: false },
    inputBuffer: { current: { reset: (reason: string) => inputResets.push(reason) } },
    setBenchmark: noop,
    benchmarkBuildIdentity: null,
    saveLocalBenchmark: noop,
    setWorldSelection: noop,
    notice: noop,
    weatherRef: { current: null },
    quality: "medium",
    targetFps: 60,
    syncNetworkStage: noop,
    drainAuthorities: noop,
    setReady: (value: boolean) => {
      ready = value;
    },
    setError: (value: string) => errors.push(value),
    t: (value: string) => value,
    getRendererInfo: () => ({ renderer: "fixture" }),
    testImportMeta: { env: { DEV: false } },
  };
  const cleanup = make(environment) as () => void;
  return {
    engine,
    canvas,
    resolveEngine: (value: unknown) => resolveEngine(value),
    rejectEngine: (error: Error) => rejectEngine(error),
    cleanup,
    errors,
    events,
    eventRecords,
    inputResets,
    state,
    requestedCanvases, disconnects, room,
    generation: () => generation,
    compatibility: () => compatibility,
    restart: () => { promise = resetPromise(); return make(environment) as () => void; },
    stats: () => ({ gameCount, gameDisposals, ready }),
  };
}

test("cancelled UI startup disposes a late engine without constructing Game", async () => {
  const f = fixture();
  await tick();
  f.cleanup();
  f.resolveEngine(f.engine);
  await tick();
  assert.equal(f.engine.disposed, 1);
  assert.equal(f.stats().gameCount, 0);
  assert.deepEqual(f.errors, []);
});
test("UI transfers a ready engine to Game and cleanup releases it exactly once", async () => {
  const f = fixture({ weatherPreview: "fog" });
  await tick();
  f.resolveEngine(f.engine);
  await tick();
  assert.deepEqual(f.stats(), { gameCount: 1, gameDisposals: 0, ready: true });
  assert.equal(f.state.current?.weatherPreview, "fog");
  assert.ok(f.events.includes("renderer-ready"));
  assert.ok(f.events.includes("game-ready"));
  f.cleanup();
  assert.equal(f.engine.disposed, 1);
  assert.equal(f.state.current, null);
});
test("backend initialization failure is reported without constructing a fallback Game", async () => {
  const f = fixture();
  await tick();
  f.rejectEngine(new Error("unsupported backend"));
  await tick();
  assert.equal(f.stats().gameCount, 0);
  assert.equal(f.errors.length, 1);
  assert.ok(f.events.includes("startup-error"));
  f.cleanup();
});

test("automatic UI fallback remounts the canvas once and preserves the multiplayer connection", async () => {
  let keyedCanvas = false, generationDependency = false;
  const inspect = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "canvas")
      keyedCanvas ||= node.attributes.properties.some(p => ts.isJsxAttribute(p) && p.name.getText(source) === "key" && p.initializer?.getText(source) === "{rendererGeneration}");
    if (ts.isCallExpression(node) && node.arguments[0] === effect && ts.isArrayLiteralExpression(node.arguments[1]))
      generationDependency = node.arguments[1].elements.some(e => e.getText(source) === "rendererGeneration");
    ts.forEachChild(node, inspect);
  };
  inspect(source); assert.ok(keyedCanvas && generationDependency);
  const f = fixture({ network: true }), originalCanvas = f.canvas.current, originalRoom = f.room.current;
  await tick(); f.rejectEngine(new WebGpuInitializationError("webgpu", "initialization-failed", new Error("adapter refused"))); await tick();
  assert.equal(f.generation(), 1); assert.equal(f.compatibility(), true);
  assert.deepEqual(f.disconnects, []); assert.equal(f.room.current, originalRoom);
  assert.equal(f.stats().gameCount, 0); assert.equal(f.events.includes("startup-error"), false);
  f.cleanup(); f.canvas.current = { dataset: {} }; f.engine.isWebGPU = false;
  const cleanupRetry = f.restart(); await tick(); f.resolveEngine(f.engine); await tick();
  assert.notEqual(f.requestedCanvases[1], originalCanvas);
  assert.equal(f.state.current?.network, true); assert.equal(f.stats().ready, true);
  assert.equal(f.room.current, originalRoom); assert.deepEqual(f.disconnects, []);
  assert.equal(f.canvas.current.dataset.rendererBackend, "webgl2");
  assert.equal(f.canvas.current.dataset.rendererFallback, "initialization-failed");
  const readyRecord = f.eventRecords.find(record => record.name === "renderer-ready")!;
  assert.equal(readyRecord.data.backend, "webgl2"); assert.equal(readyRecord.data.selection.requested, "webgpu");
  cleanupRetry(); assert.equal(f.engine.disposed, 1);
});

test("a rejected WebGL2 retry terminates normally instead of creating a third canvas", async () => {
  const f = fixture({ network: true }); await tick();
  f.rejectEngine(new WebGpuInitializationError("webgpu", "unavailable")); await tick();
  f.cleanup(); f.canvas.current = { dataset: {} }; const cleanupRetry = f.restart(); await tick();
  f.rejectEngine(new Error("WebGL2 unavailable")); await tick();
  assert.equal(f.generation(), 1); assert.equal(f.requestedCanvases.length, 2);
  assert.equal(f.stats().gameCount, 0); assert.equal(f.events.filter(event => event === "renderer-fallback").length, 1);
  assert.equal(f.events.filter(event => event === "startup-error").length, 1);
  assert.equal(f.disconnects.length, 1); assert.equal(f.disconnects[0][0], "startup-failure");
  cleanupRetry();
});

test("strict query and a cancelled initialization do not request automatic fallback", async () => {
  const strict = fixture({ network: true, search: "?renderBackend=webgpu" }); await tick();
  strict.rejectEngine(new WebGpuInitializationError("webgpu", "unavailable")); await tick();
  assert.equal(strict.generation(), 0); assert.equal(strict.disconnects.length, 1); assert.equal(strict.errors.length, 1); strict.cleanup();
  const cancelled = fixture(); await tick(); cancelled.cleanup();
  cancelled.rejectEngine(new WebGpuInitializationError("webgpu", "unavailable")); await tick();
  assert.equal(cancelled.generation(), 0); assert.deepEqual(cancelled.errors, []);
});

test("even an initialization-shaped failure from an owned Game cannot trigger backend retry", async () => {
  const f = fixture({ startFailure: new WebGpuInitializationError("webgpu", "initialization-failed") });
  await tick(); f.resolveEngine(f.engine); await tick();
  assert.equal(f.generation(), 0); assert.equal(f.events.includes("renderer-fallback"), false);
  assert.equal(f.stats().gameDisposals, 1); assert.equal(f.engine.disposed, 1); f.cleanup();
});

test("replaced canvas never receives an engine prepared for the old canvas", async () => {
  const f = fixture();
  await tick();
  f.canvas.current = { dataset: {} };
  f.resolveEngine(f.engine);
  await tick();
  assert.equal(f.stats().gameCount, 0);
  assert.equal(f.engine.disposed, 1);
  assert.deepEqual(f.errors, []);
  f.cleanup();
  assert.equal(f.engine.disposed, 1);
});

test("construction failure releases the engine still owned by startup exactly once", async () => {
  const f = fixture({ constructionError: true });
  await tick();
  f.resolveEngine(f.engine);
  await tick();
  assert.equal(f.engine.disposed, 1);
  assert.equal(f.stats().gameDisposals, 0);
  assert.equal(f.errors.length, 1);
  assert.equal(f.stats().ready, false);
  f.cleanup();
  assert.equal(f.engine.disposed, 1);
});

test("start failure releases the engine through its Game owner exactly once", async () => {
  const f = fixture({ startError: true });
  await tick();
  f.resolveEngine(f.engine);
  await tick();
  assert.equal(f.engine.disposed, 1);
  assert.equal(f.stats().gameDisposals, 1);
  assert.equal(f.state.current, null);
  assert.equal(f.errors.length, 1);
  assert.equal(f.stats().ready, false);
  f.cleanup();
  assert.equal(f.engine.disposed, 1);
});

test("a live renderer failure clears UI ready and a retired callback cannot alter a replacement", async () => {
  const f = fixture();
  await tick(); f.resolveEngine(f.engine); await tick();
  const callback = f.state.current!.onRendererFailure!;
  callback("Device lost; restart required");
  assert.equal(f.stats().ready, false);
  assert.equal(f.errors.at(-1), "Device lost; restart required");
  assert.deepEqual(f.inputResets, ["renderer-failure"]);
  f.cleanup();
  const count = f.errors.length;
  callback("retired renderer");
  assert.equal(f.errors.length, count);
  assert.deepEqual(f.inputResets, ["renderer-failure"], "retired callback cannot reset a replacement queue");
});

test("loss between Game start settlement and UI continuation cannot announce game-ready", async () => {
  const f = fixture({ loseAfterStart: true });
  await tick(); f.resolveEngine(f.engine); await tick();
  assert.equal(f.stats().ready, false);
  assert.equal(f.events.includes("game-ready"), false);
  assert.equal(f.stats().gameDisposals, 1);
  f.cleanup();
  assert.equal(f.engine.disposed, 1);
});

test("actual UI transport gate rejects absent, preparing and failed Game owners", () => {
  let predicate: ts.Node | undefined;
  const findPredicate = (node: ts.Node) => {
    if (ts.isNewExpression(node) && node.expression.getText(source) === "FrameInputBuffer") {
      const options = node.arguments?.[0];
      if (options && ts.isObjectLiteralExpression(options)) {
        const property = options.properties.find((entry) =>
          ts.isPropertyAssignment(entry) && entry.name.getText(source) === "canSend",
        ) as ts.PropertyAssignment | undefined;
        predicate = property?.initializer;
      }
    }
    ts.forEachChild(node, findPredicate);
  };
  findPredicate(source);
  assert.ok(predicate);
  const code = ts.transpileModule(`const canSend = ${predicate.getText(source)};`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const create = new Script(`(function(env) {
    const { room, connectedRef, modeRef, game } = env;
    ${code}
    return canSend;
  })`).runInThisContext();
  const game = { current: null as { ready: boolean; respawnPending: boolean } | null };
  const connectedRef = { current: true }, modeRef = { current: "multi" };
  const gate = create({ room: { current: {} }, connectedRef, modeRef, game });
  assert.equal(gate(), false);
  game.current = { ready: false, respawnPending: false };
  assert.equal(gate(), false);
  game.current.ready = true;
  assert.equal(gate(), true);
  game.current.ready = false;
  assert.equal(gate(), false, "terminal renderer cannot send a queued packet");
  game.current = { ready: true, respawnPending: true };
  assert.equal(gate(), false);
  game.current.respawnPending = false;
  modeRef.current = "guest";
  assert.equal(gate(), false);
});
