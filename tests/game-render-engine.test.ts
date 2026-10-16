import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";

// Execute the actual UI effect. Replace imports/GPU IO, not startup ownership.
const source = ts.createSourceFile(
  "ui.tsx",
  readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
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
  `(function(env) { const exports={}; const {mode,canvas,sessionDiagnostics,modeRef,loadModule,profileRef,game,lightingPreviewRef,idRef,setStats,userBenchmark,setBenchmark,benchmarkBuildIdentity,saveLocalBenchmark,setWorldSelection,notice,weatherRef,quality,targetFps,syncNetworkStage,drainAuthorities,setReady,setError,t,getRendererInfo,testImportMeta}=env; ${compiled}; return runEffect(); })`,
).runInThisContext();
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(options: { constructionError?: boolean; startError?: boolean; loseAfterStart?: boolean } = {}) {
  let resolveEngine!: (engine: any) => void;
  let rejectEngine!: (reason: Error) => void;
  const promise = new Promise((resolve, reject) => {
    resolveEngine = resolve;
    rejectEngine = reject;
  });
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
  const canvas = { current: {} };
  const initialCanvas = canvas.current;
  class Game {
    onRendererFailure?: (message: string) => void;
    ready = false;
    renderHealth = { snapshot: () => ({ valid: this.ready, firstErrors: [] }) };
    constructor(_canvas: unknown, _profile: unknown, prepared: unknown) {
      assert.equal(_canvas, initialCanvas);
      assert.equal(prepared, engine);
      if (options.constructionError) throw new Error("construction failed");
      gameCount++;
    }
    setLocalId() {}
    setQuality() {}
    setTargetFps() {}
    async start() {
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
  const cleanup = make({
    mode: "guest",
    canvas,
    profileRef: { current: {} },
    game: state,
    modeRef: { current: "menu" },
    lightingPreviewRef: { current: { instant: null } },
    idRef: { current: "fixture" },
    sessionDiagnostics: { event: (name: string) => events.push(name) },
    loadModule: async (name: string) =>
      name === "./game" ? { Game } : { createGameEngine: () => promise },
    setStats: noop,
    userBenchmark: { current: false },
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
  }) as () => void;
  return {
    engine,
    canvas,
    resolveEngine,
    rejectEngine,
    cleanup,
    errors,
    events,
    state,
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
  const f = fixture();
  await tick();
  f.resolveEngine(f.engine);
  await tick();
  assert.deepEqual(f.stats(), { gameCount: 1, gameDisposals: 0, ready: true });
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

test("replaced canvas never receives an engine prepared for the old canvas", async () => {
  const f = fixture();
  await tick();
  f.canvas.current = {};
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
  f.cleanup();
  const count = f.errors.length;
  callback("retired renderer");
  assert.equal(f.errors.length, count);
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
