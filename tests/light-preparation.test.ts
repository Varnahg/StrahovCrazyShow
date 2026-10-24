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
  let loop: (() => boolean) | undefined,
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
      return loop?.();
    },
    finish() {
      for (let i = 0; loop && i < 90; i++) {
        now++;
        loop();
      }
      assert.equal(loop, undefined);
    },
    callback: () => loop,
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

test("optional native day coverage has exactly thirteen stages and two completed readiness draws per stage", async () => {
  const f = fixture({ includeDayPointVariants: true, batchSize: 5 });
  const pending = f.start(); f.finish(); const result = await pending;
  assert.equal(result.status, "complete");
  assert.equal(result.stages.length, 13);
  assert.deepEqual(result.stages.slice(-5).map(s => s.stage), ["day-0-off", "day-0-on", "day-1-off", "day-1-on", "restore"]);
  assert.ok(result.stages.every(s => s.renders === 3 && s.checks === 10));
  assert.equal(f.state().runs, 1); assert.equal(f.state().stops, 1);
  assert.equal(f.state().restores, 1);
  assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
});

test("native day stages consume the original shared deadline instead of receiving a fresh budget", async () => {
  let stage = "";
  const f = fixture({ includeDayPointVariants: true, batchSize: 5, timeoutMs: 30_000,
    apply(value) { stage = value; }, effectsReady: () => !stage.startsWith("day-") });
  const pending = f.start();
  for (let ticks = 0; !stage.startsWith("day-") && ticks < 60; ticks++) f.tick();
  assert.equal(stage, "day-0-off");
  f.jump(30_000); f.tick();
  const result = await pending;
  assert.equal(result.status, "timeout");
  assert.ok(result.activeElapsedMs >= 30_000);
  assert.equal(result.stages.at(-1)!.stage, "day-0-off");
  assert.equal(f.state().restores, 1);
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

// Read the synchronous verdict before observing the already-resolved Promise.
function finishWithVerdicts(f: ReturnType<typeof fixture>) {
  const verdicts: boolean[] = [];
  for (let index = 0; f.state().loop && index < 90; index++) {
    const verdict = f.tick();
    assert.ok(typeof verdict === "boolean");
    verdicts.push(verdict);
  }
  assert.equal(f.state().loop, false);
  return verdicts;
}

test("healthy progress, CPU-only batches and final completion approve only their current tick", async () => {
  const f = fixture();
  const pending = f.start();
  const selected = f.callback()!;
  assert.equal(f.tick(), true);
  assert.equal(f.tick(), true);
  assert.equal(f.state().renders, 1, "a CPU-only check batch does not add a draw");
  const verdicts = finishWithVerdicts(f);
  assert.ok(verdicts.length > 0);
  assert.ok(verdicts.every((verdict) => verdict === true));
  assert.equal((await pending).status, "complete");
  const before = f.state();
  assert.equal(selected(), false, "a callback selected before stop cannot submit later");
  assert.deepEqual(f.state(), before);
});

for (const [point, failureStep] of [
  ["apply", "apply"], ["meshes", "meshes"], ["beforeChecks", "check"],
  ["check", "check"], ["effectsReady", "effects"], ["render", "render"],
] as const) {
  test(`synchronous ${point} failure vetoes the current tick before Promise observers`, async () => {
    const f = fixture({ batchSize: 5 });
    f.options[point] = () => { throw new Error(`failed ${point}`); };
    const pending = f.start();
    const selected = f.callback()!;
    let verdict = f.tick();
    if (f.state().loop) verdict = f.tick();
    assert.equal(verdict, false);
    assert.equal(selected(), false);
    const result = await pending;
    assert.equal(result.status, "failed");
    assert.equal(result.failureStep, failureStep);
    assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
  });
}

test("an exception after the actual draw vetoes submission and still restores state", async () => {
  const f = fixture();
  const render = f.options.render;
  f.options.render = () => { render(); throw new Error("after draw"); };
  const pending = f.start();
  assert.equal(f.tick(), false);
  assert.equal(f.state().renders, 1);
  assert.equal(f.state().restores, 1);
  const result = await pending;
  assert.equal(result.status, "failed");
  assert.equal(result.failureStep, "render");
});

test("a post-draw effects or revision error cannot retain the earlier healthy verdict", async () => {
  for (const point of ["effectsReady", "revision"] as const) {
    const f = fixture({ batchSize: 5 });
    const failOnCall = <T>(read: () => T, failureAt: number) => {
      let calls = 0;
      return () => {
        if (++calls === failureAt) throw new Error(`post-draw ${point}`);
        return read();
      };
    };
    // Initial revision is sampled after apply and before the progress draw.
    // The third sample is after the next actual acceptance draw.
    if (point === "revision") f.options.revision = failOnCall(f.options.revision, 3);
    else f.options.effectsReady = failOnCall(f.options.effectsReady, 2);
    const pending = f.start();
    assert.equal(f.tick(), true);
    assert.equal(f.tick(), false);
    assert.equal(f.state().renders, 2);
    const result = await pending;
    assert.equal(result.status, "failed");
    assert.equal(result.failureStep, point === "revision" ? "render" : "effects");
  }
});

for (const point of ["stop", "clearTimer", "detachDispose", "detachVisibility", "restore"] as const) {
  test(`final ${point} failure vetoes the tick after all cleanup was attempted`, async () => {
    const f = fixture({ batchSize: 5 });
    const fail = () => { throw new Error(`cleanup ${point}`); };
    if (point === "stop") {
      const stop = f.options.stop;
      f.options.stop = (callback) => { stop(callback); fail(); };
    } else if (point === "clearTimer") {
      const clear = f.options.clearTimer;
      f.options.clearTimer = (timer) => { clear(timer); fail(); };
    } else if (point === "detachDispose") {
      const observe = f.options.onDispose;
      f.options.onDispose = (callback) => {
        const detach = observe(callback);
        return () => { detach(); fail(); };
      };
    } else if (point === "detachVisibility") {
      f.options.onVisibilityChange = () => fail;
    } else {
      const restore = f.options.restore;
      f.options.restore = () => { restore(); fail(); };
    }
    const pending = f.start();
    const verdicts = finishWithVerdicts(f);
    assert.equal(verdicts.at(-1), false);
    assert.ok(verdicts.slice(0, -1).every((verdict) => verdict));
    const result = await pending;
    assert.equal(result.status, "failed");
    assert.equal(result.failureStep, point === "restore" ? "restore" : "cleanup");
    assert.equal(f.state().restores, 1);
    assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
  });
}

for (const point of ["stop", "restore"] as const) {
  test(`the final deadline includes synchronous ${point} before granting submission`, async () => {
    const f = fixture({ batchSize: 5 });
    if (point === "stop") {
      const stop = f.options.stop;
      f.options.stop = (callback) => { stop(callback); f.jump(150); };
    } else {
      const restore = f.options.restore;
      f.options.restore = () => { restore(); f.jump(150); };
    }
    const pending = f.start();
    const verdicts = finishWithVerdicts(f);
    assert.equal(verdicts.at(-1), false);
    const result = await pending;
    assert.equal(result.status, "timeout");
    assert.ok(result.activeElapsedMs >= 150);
    assert.equal(result.failureStep, null);
  });
}

test("timeout or disposal during the current tick vetoes it and all stale callbacks", async () => {
  for (const point of ["deadline", "apply", "render"] as const) {
    const f = fixture();
    if (point === "apply") f.options.apply = () => f.dispose();
    if (point === "render") {
      const render = f.options.render;
      f.options.render = () => { render(); f.dispose(); };
    }
    const pending = f.start();
    const selected = f.callback()!;
    if (point === "deadline") f.jump(100);
    assert.equal(f.tick(), false);
    assert.equal(selected(), false);
    assert.equal((await pending).status, point === "deadline" ? "timeout" : "disposed");
  }
});

test("disposal during final cleanup vetoes submission without changing the legacy Promise outcome", async () => {
  const f = fixture({ batchSize: 5 });
  const stop = f.options.stop;
  f.options.stop = (callback) => { stop(callback); f.dispose(); };
  const pending = f.start();
  const verdicts = finishWithVerdicts(f);
  assert.equal(verdicts.at(-1), false);
  assert.equal((await pending).status, "complete");
  assert.equal(f.state().restores, 0, "disposed scene never receives restore mutations");
});

for (const point of ["effects", "revision", "collect"] as const) {
  test(`a late ${point} overrun settles timeout and restores before returning the veto`, async () => {
    const f = fixture({ batchSize: 5 });
    let calls = 0;
    if (point === "effects") {
      const effects = f.options.effectsReady;
      f.options.effectsReady = () => {
        if (++calls === 2) f.jump(150);
        return effects();
      };
    } else if (point === "revision") {
      const revision = f.options.revision;
      f.options.revision = () => {
        if (++calls === 3) f.jump(150);
        return revision();
      };
    } else {
      const meshes = f.options.meshes;
      f.options.meshes = () => { f.jump(150); return meshes(); };
    }
    const pending = f.start();
    if (point !== "collect") assert.equal(f.tick(), true);
    assert.equal(f.tick(), false);
    assert.equal(f.state().restores, 1, "restore already ran synchronously");
    assert.equal(f.state().loop || f.state().timer || f.state().abort, false);
    const result = await pending;
    assert.equal(result.status, "timeout");
    assert.equal(result.failureStep, null);
    assert.ok(result.activeElapsedMs >= 150);
    assert.equal(result.stages[0].renders, point === "collect" ? 1 : 2);
  });
}
