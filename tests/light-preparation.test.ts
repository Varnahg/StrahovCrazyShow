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

function visibilityFixture(
  initiallyVisible = true,
  overrides: Partial<LightPreparationOptions> = {},
) {
  const f = fixture(overrides);
  let visible = initiallyVisible;
  let changed: (() => void) | undefined;
  let nextId = 0;
  const timers = new Map<
    number,
    { callback: () => void; at: number; delay: number; active: boolean }
  >();
  Object.assign(f.options, {
    isVisible: () => visible,
    onVisibilityChange: (callback: () => void) => {
      changed = callback;
      return () => {
        changed = undefined;
      };
    },
    setTimer: (callback: () => void, delay: number) => {
      const id = ++nextId;
      timers.set(id, {
        callback,
        at: f.options.now() + delay,
        delay,
        active: true,
      });
      return id;
    },
    clearTimer: (id: number) => {
      const timer = timers.get(id);
      if (timer) timer.active = false;
    },
  });
  return {
    ...f,
    visible(value: boolean, notify = true) {
      visible = value;
      if (notify) changed?.();
    },
    elapse(ms: number) {
      f.jump(ms);
      for (const timer of [...timers.values()])
        if (timer.active && timer.at <= f.options.now()) {
          timer.active = false;
          timer.callback();
        }
    },
    stale(id: number) {
      timers.get(id)?.callback();
    },
    timers: () => [...timers.entries()].filter(([, timer]) => timer.active),
    observing: () => !!changed,
  };
}

test("hidden time pauses the active deadline and resumes with the original remaining budget", async () => {
  const f = visibilityFixture();
  const pending = f.start();
  let settled = false;
  void pending.then(() => {
    settled = true;
  });
  f.tick();
  f.tick();
  const before = f.state();
  f.visible(false);
  f.elapse(1000);
  f.stale(1);
  f.tick();
  await Promise.resolve();
  assert.equal(
    settled,
    false,
    "a hidden page must not consume its 100ms active budget",
  );
  assert.equal(f.state().checks, before.checks);
  assert.equal(f.state().renders, before.renders);
  f.visible(true);
  assert.equal(f.timers().at(-1)?.[1].delay, 98);
  f.finish();
  const result = await pending;
  assert.equal(result.status, "complete");
  assert.equal(result.pausedMs, 1001);
  assert.equal(result.elapsedMs, result.activeElapsedMs + result.pausedMs);
  assert.ok(result.activeElapsedMs < 100);
  assert.equal(f.timers().length, 0);
  assert.equal(f.observing(), false);
});

test("visible watchdog still expires without RAF and hidden-before-first-frame can resume", async () => {
  const active = visibilityFixture();
  const stalled = active.start();
  active.elapse(100);
  const timedOut = await stalled;
  assert.equal(timedOut.status, "timeout");
  assert.equal(timedOut.activeElapsedMs, 100);
  assert.equal(timedOut.pausedMs, 0);
  const hidden = visibilityFixture(false);
  const pending = hidden.start();
  hidden.elapse(5000);
  hidden.tick();
  assert.equal(hidden.state().renders, 0);
  hidden.visible(true);
  assert.equal(hidden.timers().at(-1)?.[1].delay, 100);
  hidden.finish();
  const completed = await pending;
  assert.equal(completed.status, "complete");
  assert.equal(completed.pausedMs, 5001);
});

test("resume never resets already consumed active time and disposal while hidden settles immediately", async () => {
  const f = visibilityFixture();
  const pending = f.start();
  f.elapse(70);
  f.visible(false);
  f.elapse(900);
  f.visible(true);
  assert.equal(f.timers().at(-1)?.[1].delay, 30);
  f.elapse(30);
  const result = await pending;
  assert.equal(result.status, "timeout");
  assert.equal(result.activeElapsedMs, 100);
  assert.equal(result.pausedMs, 900);
  const cancelled = visibilityFixture(false);
  const cancellation = cancelled.start();
  cancelled.elapse(700);
  cancelled.dispose();
  const disposed = await cancellation;
  assert.equal(disposed.status, "disposed");
  assert.equal(disposed.activeElapsedMs, 0);
  assert.equal(disposed.pausedMs, 700);
  assert.equal(cancelled.observing(), false);
  assert.equal(cancelled.timers().length, 0);
  assert.equal(cancelled.state().restores, 0);
});

test("visible uninterruptible work consumes the budget before any later hidden state", async () => {
  const f = visibilityFixture();
  f.options.apply = () => {
    f.jump(150);
    f.visible(false, false);
  };
  const pending = f.start();
  f.tick();
  const result = await pending;
  assert.equal(result.status, "timeout");
  assert.equal(result.activeElapsedMs, 151);
  assert.equal(result.pausedMs, 0);
  assert.equal(result.stages[0].cpu.apply.totalMs, 150);
  assert.equal(
    result.stages[0].renders,
    0,
    "do not draw after apply has exhausted the active deadline",
  );
});

test("visible render and check overruns remain charged and retain their measured call cost", async () => {
  const render = visibilityFixture();
  render.options.render = () => render.jump(150);
  const rendering = render.start();
  render.tick();
  const rendered = await rendering;
  assert.equal(rendered.status, "timeout");
  assert.equal(rendered.activeElapsedMs, 151);
  assert.equal(rendered.stages[0].cpu.render.totalMs, 150);
  const check = visibilityFixture();
  check.options.check = () => {
    check.jump(150);
    check.visible(false, false);
    return true;
  };
  const checking = check.start();
  check.tick();
  check.tick();
  const checked = await checking;
  assert.equal(checked.status, "timeout");
  assert.equal(checked.activeElapsedMs, 152);
  assert.equal(checked.pausedMs, 0);
  assert.equal(checked.stages[0].checks, 1);
  assert.equal(checked.stages[0].cpu.checkBatch.totalMs, 150);
});

test("a hidden resumed owner detaches a synchronously replayed disposal during visibility subscription", async () => {
  const f = fixture();
  let detached = 0;
  Object.assign(f.options, {
    isVisible: () => false,
    onVisibilityChange: () => {
      f.dispose();
      return () => {
        detached++;
      };
    },
  });
  const result = await f.start();
  assert.equal(result.status, "disposed");
  assert.equal(detached, 1);
  assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
});

test("stage diagnostics retain real callback gaps, named restart causes and inclusive call costs", async () => {
  let revision: unknown[] = [0, 0];
  const f = fixture({ timeoutMs: 1000, revision: () => revision });
  Object.assign(f.options, { revisionKeys: ["quality", "meshes"] });
  const apply = f.options.apply,
    render = f.options.render,
    check = f.options.check;
  f.options.apply = (stage) => {
    apply(stage);
    f.jump(2);
  };
  f.options.render = () => {
    render();
    f.jump(3);
  };
  f.options.beforeChecks = () => f.jump(1);
  f.options.check = (mesh) => {
    f.jump(1);
    return check(mesh);
  };
  const pending = f.start();
  f.tick();
  revision = [1, 2];
  f.jump(5);
  f.tick();
  f.finish();
  const result = await pending;
  assert.equal(result.status, "complete");
  const first = result.stages[0];
  assert.deepEqual(first.restartReasons, { quality: 1, meshes: 1 });
  assert.equal(first.restarts, 1);
  assert.equal(first.cpu.apply.calls, 2);
  assert.equal(first.cpu.apply.totalMs, 4);
  assert.equal(first.cpu.apply.maxMs, 2);
  assert.equal(first.cpu.render.totalMs, first.renders * 3);
  assert.equal(
    first.cpu.checkBatch.totalMs,
    first.cpu.checkBatch.calls + first.checks,
  );
  assert.ok(first.tickCount >= first.renders);
  assert.ok(first.rafGap.maxMs >= 6);
  assert.equal(result.pausedMs, 0);
  assert.equal(result.activeElapsedMs, result.elapsedMs);
});
