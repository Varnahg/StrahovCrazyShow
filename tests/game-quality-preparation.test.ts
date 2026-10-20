import test from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import ts from "typescript";
import { readGameSource } from "./helpers/game-source";
import { AdaptiveQualityController } from "../client/adaptive-quality";
import { prepareRenderQualities } from "../client/render-quality-preparation";
import {
  MANUAL_HARDWARE_SCALING,
  isRenderQualityMode,
  isRenderTargetFps,
  type RenderQualityMode,
} from "../shared/render-quality";
import type { LightPreparationResult } from "../client/light-preparation";

const { source, gameClass: declaration, selectMembers } = readGameSource(
  process.env.GAME_QUALITY_SOURCE,
);
const names = [
  "prepareLighting",
  "applyAdaptiveQuality",
  "applyRenderQuality",
  "setQuality",
  "setTargetFps",
];
const methods = selectMembers(names);
const compiled = ts.transpileModule(
  `class QualityGame { ${methods.map((node) => node.getText(source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const make = new Script(`(function(environment) {
  const { prepareRenderQualities, MANUAL_HARDWARE_SCALING, isRenderQualityMode, isRenderTargetFps, performance, prepareLightVariants, PlayerFlashlight, selectLightingPreview } = environment;
  ${compiled}; return QualityGame;
})`).runInThisContext();
const complete = (): LightPreparationResult => ({
  status: "complete",
  elapsedMs: 1,
  activeElapsedMs: 1,
  pausedMs: 0,
  failureStep: null,
  stages: [],
});

function fixture(mode: RenderQualityMode = "auto") {
  let now = 0,
    scaling = 1,
    lightPasses = 0;
  const passes: {
    quality: string;
    timeoutMs: number | undefined;
    finalRestore: boolean;
  }[] = [];
  const applied: string[] = [];
  const adaptive = new AdaptiveQualityController({ mode });
  const Game = make({
    prepareRenderQualities,
    MANUAL_HARDWARE_SCALING,
    isRenderQualityMode,
    isRenderTargetFps,
    performance: { now: () => now },
    // Baseline oracle reaches this single-quality primitive instead of the
    // new wrapper, so missing matrix coverage fails behavior assertions.
    prepareLightVariants: async () => {
      lightPasses++;
      return complete();
    },
    PlayerFlashlight: class {},
    selectLightingPreview: () => ({ instant: 1 }),
  });
  let onPass: (() => void) | undefined;
  let nextResult: LightPreparationResult | undefined;
  const render = () => {},
    pipelines = { isReady: () => true };
  const game = Object.assign(new Game(), {
    adaptive,
    appliedQualityRevision: -1,
    preparingRenderQuality: false,
    disposed: false,
    rendererFailed: false,
    ready: false,
    scene: { isDisposed: false },
    actor: { position: { x: 0, y: 0, z: 0 } },
    localId: "local",
    avatars: new Map(),
    updateRenderEnvironment() {},
    quality: adaptive.state.quality,
    engine: {
      isWebGPU: true,
      getHardwareScalingLevel: () => scaling,
      setHardwareScalingLevel: (value: number) => {
        scaling = value;
      },
    },
    setCarQuality: (quality: string) => applied.push(quality),
    prepareLightingVariants: async (
      actualRender: unknown,
      actualPipelines: unknown,
      options?: { timeoutMs: number; restoreQuality?: () => void },
    ) => {
      lightPasses++;
      assert.equal(actualRender, render);
      assert.equal(actualPipelines, pipelines);
      assert.equal(
        game.ready,
        false,
        "quality preparation cannot release gameplay",
      );
      passes.push({
        quality: game.quality,
        timeoutMs: options?.timeoutMs,
        finalRestore: !!options?.restoreQuality,
      });
      onPass?.();
      now += 1;
      options?.restoreQuality?.();
      return nextResult ?? complete();
    },
  });
  game.applyAdaptiveQuality(adaptive.state);
  applied.length = 0;
  return {
    game,
    adaptive,
    passes,
    applied,
    render,
    pipelines,
    start: () => game.prepareLighting(render, pipelines),
    onPass: (callback: () => void) => {
      onPass = callback;
    },
    result: (result: LightPreparationResult) => {
      nextResult = result;
    },
    get scaling() {
      return scaling;
    },
    get lightPasses() {
      return lightPasses;
    },
  };
}

test("quality initialization works before the constructor creates its scene", () => {
  const constructor = declaration.members
    .find(ts.isConstructorDeclaration)!
    .getText(source);
  assert.ok(
    constructor.indexOf("this.applyAdaptiveQuality(") <
      constructor.indexOf("this.scene = new Scene("),
  );
  const f = fixture("high");
  f.game.scene = undefined;
  f.game.appliedQualityRevision = -1;
  assert.doesNotThrow(() => f.game.applyAdaptiveQuality(f.adaptive.state));
  assert.equal(f.game.quality, "high");
  assert.equal(f.scaling, MANUAL_HARDWARE_SCALING.high);
});

test("actual Game prepares three render qualities without changing requested auto state", async () => {
  const f = fixture(),
    requested = f.adaptive.state;
  const result = await f.start();
  assert.equal(result.status, "complete");
  assert.deepEqual(
    f.passes.map((p) => p.quality),
    ["low", "high", "medium"],
  );
  assert.deepEqual(
    f.passes.map((p) => p.finalRestore),
    [false, false, true],
  );
  assert.ok(f.passes.every((p) => p.timeoutMs! > 0 && p.timeoutMs! <= 30_000));
  assert.equal(
    f.adaptive.state,
    requested,
    "warmup must not publish controller mode/revision changes",
  );
  assert.equal(f.game.quality, requested.quality);
  assert.equal(f.scaling, requested.hardwareScaling);
  assert.equal(f.game.preparingRenderQuality, false);
  assert.equal(f.game.appliedQualityRevision, requested.revision);
  assert.equal(f.game.ready, false);
});

test("actual Game puts each manual requested quality last and restores its scaling", async () => {
  for (const mode of ["low", "medium", "high"] as const) {
    const f = fixture(mode),
      requested = f.adaptive.state;
    assert.equal((await f.start()).status, "complete");
    assert.equal(f.passes.length, 3);
    assert.equal(new Set(f.passes.map((p) => p.quality)).size, 3);
    assert.equal(f.passes.at(-1)!.quality, mode);
    assert.equal(f.adaptive.state, requested);
    assert.equal(f.game.quality, mode);
    assert.equal(f.scaling, MANUAL_HARDWARE_SCALING[mode]);
  }
});

test("late quality and FPS requests survive temporary rendering and are restored inside final readiness", async () => {
  const f = fixture();
  let changed = false;
  f.onPass(() => {
    if (changed) return;
    changed = true;
    f.game.setQuality("high");
    f.game.setTargetFps(120);
    assert.equal(f.adaptive.state.mode, "high");
    assert.equal(f.adaptive.state.targetFps, 120);
    assert.equal(
      f.game.quality,
      "low",
      "requested state must not interrupt the temporary pass",
    );
  });
  assert.equal((await f.start()).status, "complete");
  assert.equal(f.game.quality, "high");
  assert.equal(f.scaling, MANUAL_HARDWARE_SCALING.high);
  assert.equal(f.game.appliedQualityRevision, f.adaptive.state.revision);
  assert.equal(f.adaptive.state.mode, "high");
  assert.equal(f.adaptive.state.targetFps, 120);
  assert.equal(f.applied.at(-1), "high");
  assert.equal(f.passes.length, 3);
});

test("returned failure stops further quality passes and restores requested rendering", async () => {
  const f = fixture(),
    requested = f.adaptive.state;
  f.result({ ...complete(), status: "failed", failureStep: "render" });
  assert.equal((await f.start()).status, "failed");
  assert.equal(f.passes.length, 1);
  assert.equal(f.game.quality, requested.quality);
  assert.equal(f.scaling, requested.hardwareScaling);
  assert.equal(f.adaptive.state, requested);
  assert.equal(f.game.preparingRenderQuality, false);
});

test("throw preserves the original failure and restores render-only override", async () => {
  const f = fixture(),
    failure = new Error("actual preparation failure");
  f.onPass(() => {
    throw failure;
  });
  await assert.rejects(f.start(), (error) => error === failure);
  assert.equal(f.passes.length, 1);
  assert.equal(f.game.quality, f.adaptive.state.quality);
  assert.equal(f.game.preparingRenderQuality, false);
});

test("retired Game does not mutate render resources during quality cleanup", async () => {
  const f = fixture();
  f.onPass(() => {
    f.game.disposed = true;
  });
  const result = await f.start();
  assert.equal(result.status, "disposed");
  assert.equal(f.passes.length, 1);
  assert.deepEqual(f.applied, ["medium", "low"]);
  assert.equal(f.game.ready, false);
});

test("WebGL keeps one original light preparation without quality overrides", async () => {
  const f = fixture();
  f.game.engine.isWebGPU = false;
  const requested = f.adaptive.state;
  assert.equal((await f.start()).status, "complete");
  assert.equal(f.lightPasses, 1);
  assert.ok(
    f.passes.every(
      (pass) =>
        pass.quality === "medium" &&
        pass.timeoutMs === undefined &&
        !pass.finalRestore,
    ),
  );
  assert.deepEqual(f.applied, []);
  assert.equal(f.adaptive.state, requested);
});
