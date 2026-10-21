import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import ts from "typescript";
import { readGameSource } from "./helpers/game-source";
import { prepareRenderQualities } from "../client/render-quality-preparation";
import { MANUAL_HARDWARE_SCALING } from "../shared/render-quality";

const parsed = readGameSource();
const start = parsed.member("start") as ts.MethodDeclaration;
// Execute the actual production ownership block after asset loading. Asset
// loaders/physics are outside this test; final gate behavior has separate tests.
const statements = start.body!.statements;
const boundary = statements.findIndex(statement =>
  statement.getText(parsed.source) === "this.engine.stopRenderLoop(preloadRender);",
);
assert.ok(boundary >= 0, "Actual post-loader ownership boundary must exist");
const source = ts.transpileModule(
  `async function runPreparedAssets() {
    let pipelinePreparation;
    const preloadRender = () => this.draw();
    ${statements.slice(boundary).map(statement => statement.getText(parsed.source)).join("\n")}
  }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const create = new Script(`(function(env) {
  const { StartupPreparationLoop, WebGpuPipelinePreparation, sessionDiagnostics,
    waitForRenderStartup, arePreparationEffectsReady } = env;
  ${source}; return runPreparedAssets;
})`).runInThisContext();

function fixture(options: { constructionError?: Error; idleError?: Error; gateError?: Error; pendingIdle?: Promise<void>; status?: string } = {}) {
  const events: string[] = [], loops: object[] = [];
  let loopDisposals = 0, pipelineDisposals = 0, gameplayLoops = 0;
  const abort = new AbortController();
  let enteredIdle!: () => void;
  const idleEntered = new Promise<void>(resolve => { enteredIdle = resolve; });
  const health = { guard: <T>(value: T) => Promise.resolve(value), report: () => events.push("fault") };
  const engine = {
    stopRenderLoop() { events.push("preload-stop"); },
    runRenderLoop() { events.push("gameplay"); gameplayLoops++; },
  };
  const run = create({
    StartupPreparationLoop: class {
      constructor(actualEngine: unknown, actualHealth: unknown, actualOptions: any) {
        assert.equal(actualEngine, engine); assert.equal(actualHealth, health);
        assert.equal(actualOptions.signal, abort.signal);
        events.push("loop-create");
        if (options.constructionError) throw options.constructionError;
        loops.push(this);
      }
      async waitForIdle() {
        events.push("loop-idle"); enteredIdle();
        if (options.idleError) throw options.idleError;
        await options.pendingIdle;
      }
      dispose() { loopDisposals++; events.push("loop-dispose"); }
    },
    WebGpuPipelinePreparation: class {
      constructor() { events.push("pipelines-create"); }
      isReady() { return true; }
      dispose() { pipelineDisposals++; events.push("pipelines-dispose"); }
    },
    sessionDiagnostics: { event(name: string) { events.push(name); } },
    arePreparationEffectsReady: () => true,
    async waitForRenderStartup(value: any) {
      events.push("submitted-gate");
      assert.equal(value.engine, engine); assert.equal(value.health, health);
      assert.equal(value.signal, abort.signal); assert.equal(value.isReady(), true);
      assert.equal(loopDisposals, 0); assert.equal(pipelineDisposals, 0);
      if (options.gateError) throw options.gateError;
    },
  });
  const game = {
    engine, renderHealth: health, startupAbort: abort, scene: { objectRenderers: [], getActiveMeshes: () => ({ length: 0 }) },
    canvas: { dataset: {} as Record<string, string> }, ready: false, draw() {}, frame() {}, assertStartupActive() {},
    compilationProfile: { setStage() {}, snapshot: () => ({}) },
    async prepareLighting(_render: unknown, pipelines: any, loop: unknown) {
      events.push("prepare"); assert.equal(loop, loops[0]); assert.equal(pipelines.isReady(), true);
      return { status: options.status ?? "complete", stages: [] };
    },
  };
  return { game, events, idleEntered, run: () => run.call(game), counts: () => ({ loopDisposals, pipelineDisposals, gameplayLoops }) };
}

test("actual post-loader Game block owns one preparation adapter through the final gate, then starts gameplay", async () => {
  const f = fixture(); await f.run();
  assert.deepEqual(f.events, ["preload-stop", "pipelines-create", "loop-create", "prepare", "lighting-preparation",
    "webgpu-preparation-profile", "loop-idle", "submitted-gate", "loop-dispose", "pipelines-dispose", "gameplay"]);
  assert.deepEqual(f.counts(), { loopDisposals: 1, pipelineDisposals: 1, gameplayLoops: 1 });
  assert.equal(f.game.ready, true); assert.equal(f.game.canvas.dataset.bootStage, "ready");
});

test("a false preparation result is recorded before fault; adapter and pipelines retire without gameplay", async () => {
  const f = fixture({ status: "timeout" }); await assert.rejects(f.run(), /timeout/);
  assert.ok(f.events.indexOf("lighting-preparation") < f.events.indexOf("fault"));
  assert.equal(f.events.includes("submitted-gate"), false);
  assert.deepEqual(f.counts(), { loopDisposals: 1, pipelineDisposals: 1, gameplayLoops: 0 });
  assert.equal(f.game.ready, false);
});

test("construction, final preparation fence or submitted-gate rejection cleans allocated owners and preserves the error", async () => {
  for (const stage of ["construction", "idle", "gate"] as const) {
    const error = new Error(stage);
    const f = fixture(stage === "construction" ? { constructionError: error } : stage === "idle" ? { idleError: error } : { gateError: error });
    await assert.rejects(f.run(), value => value === error);
    assert.deepEqual(f.counts(), { loopDisposals: stage === "construction" ? 0 : 1, pipelineDisposals: 1, gameplayLoops: 0 });
    assert.equal(f.game.ready, false);
  }
});

test("the actual final gate waits for the last preparation submission after its light result resolves", async () => {
  let resolveFence!: () => void;
  const pendingIdle = new Promise<void>(resolve => { resolveFence = resolve; });
  const f = fixture({ pendingIdle });
  const completion = f.run(); await f.idleEntered;
  assert.equal(f.events.includes("lighting-preparation"), true);
  assert.equal(f.events.includes("submitted-gate"), false);
  assert.deepEqual(f.counts(), { loopDisposals: 0, pipelineDisposals: 0, gameplayLoops: 0 });
  resolveFence(); await completion;
  assert.equal(f.game.ready, true);
  assert.deepEqual(f.counts(), { loopDisposals: 1, pipelineDisposals: 1, gameplayLoops: 1 });
});

const qualitySource = ts.transpileModule(`class QualityGame {
  ${parsed.member("prepareLighting").getText(parsed.source)}
}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const QualityGame = new Script(`(function(prepareRenderQualities, MANUAL_HARDWARE_SCALING) {
  ${qualitySource}; return QualityGame;
})`).runInThisContext()(prepareRenderQualities, MANUAL_HARDWARE_SCALING);

test("the actual quality sequencer forwards the same loop to every pass and to the WebGL reference", async () => {
  for (const webgpu of [true, false]) {
    const loop = {}, calls: any[][] = [], render = () => {}, pipelines = {};
    const game = Object.assign(new QualityGame(), {
      engine: { isWebGPU: webgpu }, disposed: false, rendererFailed: false,
      scene: { isDisposed: false }, adaptive: { state: { quality: "medium", hardwareScaling: 1, revision: 1 } },
      actor: { position: {} }, avatars: new Map(), localId: "local", updateRenderEnvironment() {}, applyRenderQuality() {},
      async prepareLightingVariants(...args: any[]) {
        calls.push(args);
        return { status: "complete", failureStep: null, elapsedMs: 0, activeElapsedMs: 0, pausedMs: 0, stages: [] };
      },
    });
    const result = await game.prepareLighting(render, pipelines, loop);
    assert.equal(result.status, "complete"); assert.equal(calls.length, webgpu ? 3 : 1);
    for (const args of calls) {
      assert.equal(args[0], render); assert.equal(args[1], pipelines); assert.equal(args[3], loop);
    }
    if (webgpu) {
      assert.equal(calls[0][2].restoreQuality, undefined);
      assert.equal(typeof calls[2][2].restoreQuality, "function");
    }
  }
});
