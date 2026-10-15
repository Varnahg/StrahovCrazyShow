import test from "node:test";
import assert from "node:assert/strict";
import {
  prepareLightVariants,
  type LightPreparationOptions,
  type LightPreparationStage,
} from "../client/light-preparation";

function fixture(overrides: Partial<LightPreparationOptions> = {}) {
  let now = 0,
    disposed = false,
    settings = 0;
  let loop: (() => void) | undefined,
    timer: (() => void) | undefined,
    abort: (() => void) | undefined;
  let runs = 0,
    stops = 0,
    restores = 0,
    restoredSettings = -1,
    renders = 0,
    checks = 0;
  const applied: LightPreparationStage[] = [];
  const mesh = {
    isDisposed: () => false,
    isEnabled: () => true,
    isVisible: true,
    isReady: () => true,
  };
  const options: LightPreparationOptions = {
    apply(stage) {
      applied.push(stage);
    },
    restore() {
      restores++;
      restoredSettings = settings;
    },
    meshes: () => Array.from({ length: 5 }, () => mesh),
    beforeChecks() {},
    check(m) {
      checks++;
      return m.isReady(true);
    },
    effectsReady: () => true,
    render() {
      renders++;
    },
    run(callback) {
      runs++;
      assert.equal(loop, undefined);
      loop = callback;
    },
    stop(callback) {
      stops++;
      if (loop === callback) loop = undefined;
    },
    onDispose(callback) {
      abort = callback;
      return () => {
        abort = undefined;
      };
    },
    isDisposed: () => disposed,
    revision: () => [settings],
    now: () => now,
    setTimer(callback) {
      timer = callback;
      return 1;
    },
    clearTimer() {
      timer = undefined;
    },
    batchSize: 2,
    timeoutMs: 100,
    ...overrides,
  };
  return {
    options,
    start: () => prepareLightVariants(options),
    tick() {
      now++;
      loop?.();
    },
    finish() {
      for (let i = 0; loop && i < 90; i++) {
        now++;
        loop();
      }
      assert.equal(loop, undefined);
    },
    timeout() {
      now = 100;
      timer?.();
    },
    dispose() {
      disposed = true;
      abort?.();
    },
    settings(value: number) {
      settings = value;
    },
    jump(value: number) {
      now += value;
    },
    state: () => ({
      runs,
      stops,
      restores,
      restoredSettings,
      renders,
      checks,
      loop: !!loop,
      timer: !!timer,
      abort: !!abort,
      applied,
    }),
  };
}

test("bounded batches and exactly one owned loop prepare the finite light counts with actual ready draws", async () => {
  const f = fixture();
  const pending = f.start();
  f.tick(); // apply + progress draw
  assert.equal(f.state().renders, 1);
  assert.equal(f.state().checks, 0);
  f.tick();
  assert.equal(f.state().checks, 2);
  f.finish();
  const result = await pending;
  assert.equal(result.status, "complete");
  assert.deepEqual(
    result.stages.map((stage) => stage.stage),
    [
      "current-off",
      "current-on",
      "night-0-off",
      "night-0-on",
      "night-1-off",
      "night-1-on",
      "night-2-off",
      "night-2-on",
      "restore",
    ],
  );
  assert.ok(
    result.stages.every((stage) => stage.renders === 3 && stage.checks === 10),
  );
  assert.deepEqual(f.state(), {
    runs: 1,
    stops: 1,
    restores: 1,
    restoredSettings: 0,
    renders: 27,
    checks: 90,
    loop: false,
    timer: false,
    abort: false,
    applied: result.stages.map((stage) => stage.stage),
  });
});

test("old hot-swapped ready meshes do not complete while the new engine effect is pending", async () => {
  const f = fixture({ effectsReady: () => false });
  const pending = f.start();
  for (let i = 0; i < 8; i++) f.tick();
  assert.deepEqual(f.state().applied, ["current-off"]);
  f.settings(7);
  f.timeout();
  const result = await pending;
  assert.equal(result.status, "timeout");
  assert.equal(f.state().restoredSettings, 7);
  assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
});

test("progress render can unlock draw-dependent readiness without counting as ready completion", async () => {
  let draws = 0;
  const f = fixture({
    apply() {
      draws = 0;
    },
    render() {
      draws++;
    },
    check: () => draws >= 2,
  });
  const pending = f.start();
  f.finish();
  const result = await pending;
  assert.equal(result.status, "complete");
  assert.ok(result.stages.every((stage) => stage.renders === 4));
});

test("settings changes restart only the current stage and preserve cumulative render counts", async () => {
  const f = fixture();
  const pending = f.start();
  f.tick();
  f.settings(1);
  f.tick();
  f.finish();
  const result = await pending;
  assert.equal(result.status, "complete");
  assert.equal(result.stages[0].restarts, 1);
  assert.equal(result.stages[0].renders, 4);
  assert.equal(f.state().restoredSettings, 1);
});

test("disposal settles waiting work even after the engine has stopped requesting frames", async () => {
  const f = fixture({ check: () => false });
  const pending = f.start();
  f.tick();
  f.dispose();
  assert.equal((await pending).status, "disposed");
  assert.equal(
    f.state().restores,
    0,
    "never mutate already disposed scene state",
  );
  assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
});

test("independent timeout settles a background startup before its first RAF", async () => {
  const f = fixture();
  const pending = f.start();
  f.timeout();
  assert.equal((await pending).status, "timeout");
  assert.equal(f.state().renders, 0);
  assert.equal(f.state().restores, 1);
});

test("readiness failure restores requested state and cleans all owned callbacks", async () => {
  const f = fixture({
    check() {
      throw new Error("fixture compilation failure");
    },
  });
  const pending = f.start();
  f.tick();
  f.tick();
  const result = await pending;
  assert.equal(result.status, "failed");
  assert.equal(result.failureStep, "check");
  assert.equal(f.state().restores, 1);
  assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
});

test("pending effects can become ready; a new effect from the first ready draw restarts ready confirmation", async () => {
  let ready = false,
    draws = 0;
  const f = fixture({
    meshes: () => [],
    effectsReady: () => ready,
    render: () => {
      draws++;
    },
  });
  const pending = f.start();
  f.tick();
  f.tick();
  assert.equal(draws, 2);
  assert.equal(f.state().applied.length, 1);
  ready = true;
  f.finish();
  assert.equal((await pending).status, "complete");

  let freshReady = true,
    freshDraws = 0;
  const g = fixture({
    meshes: () => [],
    effectsReady: () => freshReady,
    render() {
      if (++freshDraws === 2) freshReady = false;
    },
  });
  const next = g.start();
  g.tick();
  g.tick();
  assert.equal(g.state().applied.length, 1);
  freshReady = true;
  g.finish();
  const result = await next;
  assert.equal(result.status, "complete");
  assert.equal(
    result.stages[0].renders,
    4,
    "new draw-discovered effect requires two subsequent ready draws",
  );
});

test("deadline is checked after an uninterruptible draw and disposed queue entries are skipped", async () => {
  const f = fixture();
  f.options.render = () => f.jump(150);
  const pending = f.start();
  f.tick();
  assert.equal((await pending).status, "timeout");
  assert.equal(f.state().restores, 1);
  const skipped = fixture({
    meshes: () => [
      {
        isDisposed: () => true,
        isEnabled: () => true,
        isVisible: true,
        isReady: () => {
          throw new Error("disposed mesh inspected");
        },
      },
    ],
  });
  const complete = skipped.start();
  skipped.finish();
  assert.equal((await complete).status, "complete");
  assert.equal(skipped.state().checks, 0);
});
