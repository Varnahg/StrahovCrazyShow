import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareLightVariants,
  type LightPreparationResult,
} from "../client/light-preparation";
import {
  prepareRenderQualities,
  type RenderQualityPreparationOptions,
  type RenderQualityPreparationPass,
} from "../client/render-quality-preparation";
import type { RenderQuality } from "../shared/render-quality";

function result(
  status: LightPreparationResult["status"] = "complete",
  pausedMs = 0,
): LightPreparationResult {
  return {
    status,
    elapsedMs: 100 + pausedMs,
    activeElapsedMs: 100,
    pausedMs,
    failureStep: status === "failed" ? "effects" : null,
    stages: [
      {
        stage: "current-off",
        elapsedMs: 100 + pausedMs,
        activeElapsedMs: 100,
        pausedMs,
        tickCount: 3,
        rafGap: { count: 3, totalMs: 100 + pausedMs, maxMs: 50 + pausedMs },
        cpu: {
          apply: { calls: 1, totalMs: 4, maxMs: 4 },
          checkBatch: { calls: 2, totalMs: 2, maxMs: 1 },
          render: { calls: 3, totalMs: 3, maxMs: 1 },
        },
        restartReasons: {},
        checks: 2,
        renders: 3,
        restarts: 0,
      },
    ],
  };
}

function fixture(overrides: Partial<RenderQualityPreparationOptions> = {}) {
  let now = 0,
    disposed = false;
  const applied: RenderQuality[] = [],
    passes: RenderQualityPreparationPass[] = [],
    restored: number[] = [];
  const options: RenderQualityPreparationOptions = {
    initialQuality: "medium",
    applyQuality(quality) {
      applied.push(quality);
      now += 5;
    },
    async prepare(pass) {
      passes.push(pass);
      now += 100;
      return result();
    },
    restore() {
      restored.push(now);
      now += 7;
    },
    isDisposed: () => disposed,
    now: () => now,
    ...overrides,
  };
  return {
    options,
    applied,
    passes,
    restored,
    advance(ms: number) {
      now += ms;
    },
    dispose() {
      disposed = true;
    },
    get now() {
      return now;
    },
    run: () => prepareRenderQualities(options),
  };
}

for (const initial of ["low", "medium", "high"] as const)
  test(`three qualities run once with initial ${initial} last and one final-pass flag`, async () => {
    const f = fixture({ initialQuality: initial }),
      outcome = await f.run();
    const expected = (["low", "medium", "high"] as const)
      .filter((q) => q !== initial)
      .concat(initial);
    assert.deepEqual(f.applied, expected);
    assert.deepEqual(
      f.passes.map((p) => p.quality),
      expected,
    );
    assert.deepEqual(
      f.passes.map((p) => p.finalPass),
      [false, false, true],
    );
    assert.deepEqual(
      f.passes.map((p) => p.timeoutMs),
      [29995, 29995, 29995],
    );
    assert.equal(outcome.status, "complete");
    assert.equal(outcome.elapsedMs, 322);
    assert.equal(outcome.activeElapsedMs, 322);
    assert.equal(outcome.pausedMs, 0);
    assert.equal(outcome.failureStep, null);
    assert.equal(f.restored.length, 1);
    assert.deepEqual(
      outcome.qualities.map((p) => p.elapsedMs),
      [105, 105, 112],
    );
    assert.deepEqual(
      outcome.stages.map((s) => s.passQuality),
      expected,
    );
  });

test("the fixed traversal cannot append passes through an invalid untyped quality", async () => {
  const f = fixture({ initialQuality: "unexpected" as RenderQuality });
  const outcome = await f.run();
  assert.deepEqual(f.applied, ["low", "medium", "high"]);
  assert.equal(outcome.qualities.length, 3);
});

test("stage fields are preserved and attributed without mutating the original result", async () => {
  const original = result(),
    before = structuredClone(original);
  const f = fixture({
      async prepare() {
        return original;
      },
    }),
    outcome = await f.run();
  assert.deepEqual(original, before);
  for (const stage of outcome.stages) {
    const { passQuality: _quality, ...rest } = stage;
    assert.deepEqual(rest, original.stages[0]);
    assert.notEqual(stage, original.stages[0]);
  }
  assert.deepEqual(
    outcome.qualities.map((p) => p.stageCount),
    [1, 1, 1],
  );
});

test("only reported hidden pause is deducted; apply and final restore remain active", async () => {
  const f = fixture({
    async prepare(pass) {
      f.passes.push(pass);
      f.advance(60100);
      return result("complete", 60000);
    },
  });
  const outcome = await f.run();
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.elapsedMs, 180322);
  assert.equal(outcome.pausedMs, 180000);
  assert.equal(outcome.activeElapsedMs, 322);
  assert.deepEqual(
    outcome.qualities.map((p) => p.activeElapsedMs),
    [105, 105, 112],
  );
  assert.deepEqual(
    f.passes.map((p) => p.timeoutMs),
    [29995, 29995, 29995],
  );
});

test("reported pauses cannot subtract apply time or more time than the observed preparation", async () => {
  const f = fixture({
    async prepare() {
      f.advance(100);
      return result("complete", 100000);
    },
  });
  const outcome = await f.run();
  assert.equal(outcome.pausedMs, 300);
  assert.equal(outcome.activeElapsedMs, 22);
  for (const invalid of [NaN, Infinity, -10]) {
    const q = fixture({
      async prepare() {
        q.advance(100);
        return result("complete", invalid);
      },
    });
    const r = await q.run();
    assert.equal(r.pausedMs, 0);
    assert.equal(r.activeElapsedMs, 322);
  }
});

test("synchronous apply overrun stops before invoking preparation and still restores", async () => {
  const f = fixture({
    applyQuality(quality) {
      f.applied.push(quality);
      f.advance(30000);
    },
  });
  const outcome = await f.run();
  assert.equal(outcome.status, "timeout");
  assert.equal(outcome.activeElapsedMs, 30007);
  assert.deepEqual(f.applied, ["low"]);
  assert.equal(f.passes.length, 0);
  assert.equal(outcome.qualities[0].status, "timeout");
  assert.equal(f.restored.length, 1);
});

test("a complete callback cannot hide a synchronous per-pass overrun", async () => {
  const f = fixture({
    async prepare(pass) {
      f.passes.push(pass);
      f.advance(30000);
      return result();
    },
  });
  const outcome = await f.run();
  assert.equal(outcome.status, "timeout");
  assert.equal(f.applied.length, 1);
  assert.equal(outcome.activeElapsedMs, 30012);
  assert.equal(outcome.stages.length, 1);
});

test("the total budget includes time between passes and reduces the next timeout", async () => {
  let between = false;
  const f = fixture({
    isDisposed() {
      if (between) {
        between = false;
        f.advance(50000);
      }
      return false;
    },
    async prepare(pass) {
      f.passes.push(pass);
      f.advance(10000);
      if (f.passes.length === 1) between = true;
      return result();
    },
  });
  // isDisposed after the first completed pass is still charged to the global
  // clock; it must not reset the next pass to a fresh unrestricted30 seconds.
  const outcome = await f.run();
  assert.equal(outcome.status, "complete");
  assert.equal(outcome.activeElapsedMs, 80022);
  assert.ok(f.passes[2].timeoutMs < 30000);
  assert.equal(f.passes[2].timeoutMs, 19985);
});

test("restoration cost can turn apparent completion into timeout", async () => {
  const f = fixture({
    async prepare(pass) {
      f.passes.push(pass);
      f.advance(29990);
      return result();
    },
    restore() {
      f.restored.push(f.now);
      f.advance(20);
    },
  });
  const outcome = await f.run();
  assert.equal(outcome.status, "timeout");
  assert.equal(outcome.activeElapsedMs, 90005);
  assert.equal(outcome.qualities.at(-1)!.status, "timeout");
  assert.equal(outcome.qualities.at(-1)!.activeElapsedMs, 30015);
});

for (const status of ["failed", "timeout", "disposed"] as const)
  test(`returned ${status} stops the matrix and retains the original failure during restoration`, async () => {
    const f = fixture({
      async prepare() {
        f.advance(100);
        return result(status);
      },
      restore() {
        throw new Error("secondary cleanup");
      },
    });
    const outcome = await f.run();
    assert.equal(outcome.status, status);
    assert.equal(outcome.failureStep, status === "failed" ? "effects" : null);
    assert.equal(outcome.qualities.length, 1);
  });

test("apply/prepare throws and rejections preserve original identity including falsy values", async () => {
  for (const original of [undefined, null, false, 0, new Error("original")])
    for (const at of ["apply", "prepare"] as const) {
      let restores = 0;
      const f = fixture({
        ...(at === "apply"
          ? {
              applyQuality() {
                throw original;
              },
            }
          : {
              prepare() {
                return Promise.reject(original);
              },
            }),
        restore() {
          restores++;
          throw new Error("secondary restore");
        },
      });
      let rejected = false;
      try {
        await f.run();
      } catch (error) {
        rejected = true;
        assert.equal(error, original);
      }
      assert.equal(rejected, true);
      assert.equal(restores, 1);
    }
});

test("an otherwise successful restoration failure rejects without fabricating a ready result", async () => {
  const error = new Error("restore failure"),
    f = fixture({
      restore() {
        throw error;
      },
    });
  await assert.rejects(f.run(), (value) => value === error);
  assert.equal(f.applied.length, 3);
});

test("retirement before, during apply, during prepare or final restore never advances or restores a dead owner", async () => {
  for (const at of ["before", "apply", "prepare", "restore"] as const) {
    const f = fixture({
      applyQuality(q) {
        f.applied.push(q);
        if (at === "apply") f.dispose();
      },
      async prepare(pass) {
        f.passes.push(pass);
        if (at === "prepare") f.dispose();
        return result();
      },
      restore() {
        f.restored.push(f.now);
        if (at === "restore") f.dispose();
      },
    });
    if (at === "before") f.dispose();
    const outcome = await f.run();
    assert.equal(outcome.status, "disposed", at);
    assert.equal(
      f.applied.length,
      at === "before" ? 0 : at === "restore" ? 3 : 1,
      at,
    );
    assert.equal(f.restored.length, at === "restore" ? 1 : 0, at);
  }
});

test("late requested state is read at final restoration without changing the fixed order or mode", async () => {
  const requested = {
    mode: "auto",
    quality: "medium" as RenderQuality,
    revision: 4,
  };
  let effective: RenderQuality = "medium",
    restoreChanges = 0;
  const restore = () => {
    if (effective !== requested.quality) {
      effective = requested.quality;
      restoreChanges++;
    }
  };
  const f = fixture({
    initialQuality: requested.quality,
    applyQuality(q) {
      f.applied.push(q);
      effective = q;
    },
    async prepare(pass) {
      f.passes.push(pass);
      if (pass.quality === "low") {
        requested.quality = "high";
        requested.revision++;
      }
      if (pass.finalPass) restore();
      return result();
    },
    restore,
  });
  const outcome = await f.run();
  assert.equal(outcome.status, "complete");
  assert.deepEqual(f.applied, ["low", "high", "medium"]);
  assert.equal(effective, "high");
  assert.deepEqual(requested, { mode: "auto", quality: "high", revision: 5 });
  assert.equal(
    restoreChanges,
    1,
    "idempotent final cleanup does not reconfigure a validated restore",
  );
});

test("actual light helper completes all39 attributed stages with its original draws and cleanup", async () => {
  let now = 0,
    tick: (() => void) | undefined,
    timer: unknown,
    detachCount = 0,
    renders = 0;
  const applied: RenderQuality[] = [],
    finalized: boolean[] = [];
  const outcome = await prepareRenderQualities({
    initialQuality: "medium",
    applyQuality(q) {
      applied.push(q);
    },
    restore() {},
    isDisposed: () => false,
    now: () => now,
    async prepare(pass) {
      finalized.push(pass.finalPass);
      const pending = prepareLightVariants({
        includeDayPointVariants: true,
        timeoutMs: pass.timeoutMs,
        apply() {},
        restore() {},
        meshes: () => [
          {
            isDisposed: () => false,
            isEnabled: () => true,
            isVisible: true,
            isReady: () => true,
          },
        ],
        beforeChecks() {},
        check: (mesh) => mesh.isReady(true),
        effectsReady: () => true,
        render() {
          renders++;
        },
        run(cb) {
          tick = cb;
        },
        stop(cb) {
          assert.equal(cb, tick);
          tick = undefined;
        },
        onDispose() {
          return () => {
            detachCount++;
          };
        },
        isDisposed: () => false,
        revision: () => [],
        now: () => now,
        setTimer() {
          timer = {};
          return timer;
        },
        clearTimer(handle) {
          assert.equal(handle, timer);
          timer = undefined;
        },
      });
      for (let count = 0; tick && count < 1000; count++) {
        now++;
        tick();
      }
      assert.equal(tick, undefined);
      assert.equal(timer, undefined);
      return pending;
    },
  });
  assert.equal(outcome.status, "complete");
  assert.deepEqual(applied, ["low", "high", "medium"]);
  assert.deepEqual(finalized, [false, false, true]);
  assert.equal(outcome.stages.length, 39);
  assert.equal(renders, 117);
  assert.equal(detachCount, 3);
  assert.ok(outcome.stages.every((s) => s.renders === 3 && s.checks === 2));
});

test("a late requested quality appends a final attempt without changing historical final flags", async () => {
  const f = fixture({ requestedQuality: () => "high" });
  const outcome = await f.run();
  assert.equal(outcome.status, "complete");
  assert.deepEqual(f.passes.map(p => p.quality), ["low", "high", "medium", "high"]);
  assert.deepEqual(f.passes.map(p => p.finalPass), [false, false, true, true]);
  assert.deepEqual(outcome.qualities.map(p => p.finalPass), [false, false, true, true]);
  assert.equal(f.restored.length, 1);
  assert.equal(outcome.elapsedMs, 427);
});

test("repeated late requests spend the original90second deadline instead of resetting it", async () => {
  let requested: RenderQuality = "medium";
  const f = fixture({
    requestedQuality: () => requested,
    async prepare(pass) {
      f.passes.push(pass); f.advance(20_000);
      if (pass.finalPass) requested = pass.quality === "medium" ? "high" : "medium";
      return result();
    },
  });
  const outcome = await f.run();
  assert.equal(outcome.status, "timeout");
  assert.deepEqual(f.passes.map(p => p.quality), ["low", "high", "medium", "high", "medium"]);
  assert.equal(f.passes[3].timeoutMs, 29_980, "remaining total already includes all earlier apply costs");
  assert.equal(f.passes[4].timeoutMs, 9_975);
  assert.equal(outcome.activeElapsedMs, 100_032, "synchronous overrun is charged, never subtracted");
  assert.equal(f.restored.length, 1);
});

test("tail apply retirement stops without restoring or starting another preparation", async () => {
  const f = fixture({ requestedQuality: () => "high", applyQuality(quality) {
    f.applied.push(quality); f.advance(5);
    if (f.applied.length === 4) f.dispose();
  }});
  const outcome = await f.run();
  assert.equal(outcome.status, "disposed"); assert.equal(f.applied.length, 4);
  assert.equal(f.passes.length, 3); assert.equal(f.restored.length, 0);
});

test("a tail preparation error survives a later restore error with its original identity", async () => {
  const original = new Error("tail preparation"), cleanup = new Error("cleanup");
  const f = fixture({ requestedQuality: () => "high", async prepare(pass) {
    f.passes.push(pass); f.advance(100);
    if (f.passes.length === 4) throw original;
    return result();
  }, restore() { throw cleanup; }});
  await assert.rejects(f.run(), error => error === original);
  assert.equal(f.passes.length, 4);
});

test("invalid untyped latest request never appends an unknown quality", async () => {
  const f = fixture({ requestedQuality: () => "invalid" as RenderQuality });
  const outcome = await f.run();
  assert.equal(outcome.status, "complete"); assert.equal(f.passes.length, 3);
});
