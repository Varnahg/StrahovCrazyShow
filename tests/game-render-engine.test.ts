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

function fixture() {
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
  class Game {
    constructor(_canvas: unknown, _profile: unknown, prepared: unknown) {
      assert.equal(prepared, engine);
      gameCount++;
    }
    setLocalId() {}
    setQuality() {}
    setTargetFps() {}
    async start() {}
    dispose() {
      gameDisposals++;
      engine.dispose();
    }
  }
  const noop = () => {};
  const state = { current: null as Game | null };
  const cleanup = make({
    mode: "guest",
    canvas: { current: {} },
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
