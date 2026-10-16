import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Effect } from "@babylonjs/core/Materials/effect";
import {
  RenderHealth,
  type RenderFault,
  type RenderOperationKind,
} from "../client/render-health";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function pendingCounts(health: RenderHealth) {
  const state = health.snapshot();
  return [
    state.pendingOperations,
    state.pendingPreparationOperations,
    state.pendingShaderValidationOperations,
  ];
}

test("mixed operation kinds retain a total ready barrier and default shader work is preparation", async () => {
  const engine = new NullEngine(),
    health = new RenderHealth(engine, "game");
  const preparation = deferred<object>(),
    validation = deferred<void>(),
    secondValidation = deferred<void>();
  try {
    const original = { prepared: true };
    // A label or the shared shader channel must never classify the operation.
    const preparing = health.track(
      preparation.promise, "shader", "shader-validation",
    );
    const validating = health.track(
      validation.promise, "shader", "same shader", "shader-validation",
    );
    const validatingSecond = health.track(
      secondValidation.promise, "shader", "second shader", "shader-validation",
    );
    assert.deepEqual(pendingCounts(health), [3, 1, 2]);
    assert.equal(health.markReady(), false);
    preparation.resolve(original);
    assert.equal(await preparing, original);
    assert.deepEqual(pendingCounts(health), [2, 0, 2]);
    assert.equal(
      health.markReady(), false, "diagnostics still block final acceptance",
    );
    const snapshot = health.snapshot();
    snapshot.pendingShaderValidationOperations = 100;
    assert.deepEqual(pendingCounts(health), [2, 0, 2]);
    validation.resolve();
    await validating;
    assert.deepEqual(pendingCounts(health), [1, 0, 1]);
    assert.equal(health.markReady(), false);
    secondValidation.resolve();
    await validatingSecond;
    assert.deepEqual(pendingCounts(health), [0, 0, 0]);
    assert.equal(health.markReady(), true);
  } finally {
    engine.dispose();
  }
});

const operationKinds: readonly RenderOperationKind[] = [
  "preparation", "shader-validation",
];
for (const kind of operationKinds) {
  test(`${kind} rejection keeps its identity and only settles its own pending kind`, async () => {
    const engine = new NullEngine(),
      health = new RenderHealth(engine, "game");
    const failing = deferred<void>(),
      other = deferred<void>();
    try {
      const otherKind = kind === "preparation" ? "shader-validation" : "preparation";
      const tracked = health.track(failing.promise, "shader", "failing", kind);
      const remaining = health.track(
        other.promise, "shader", "remaining", otherKind,
      );
      const failure = new Error("owned failure");
      const rejected = assert.rejects(tracked, (error) => error === failure);
      failing.reject(failure);
      await rejected;
      assert.deepEqual(
        pendingCounts(health), kind === "preparation" ? [1, 0, 1] : [1, 1, 0],
      );
      assert.equal(health.snapshot().counts.shader, 1);
      assert.equal(health.markReady(), false);
      other.resolve();
      await remaining;
      assert.deepEqual(pendingCounts(health), [0, 0, 0]);
      assert.equal(health.markReady(), false, "settlement never clears a fault");
    } finally {
      engine.dispose();
    }
  });
}

for (const lifecycle of ["dispose", "loss", "restore"] as const) {
  test(`${lifecycle} clears both kinds and late settlements cannot alter the retired counters`, async () => {
    const engine = new NullEngine(),
      health = new RenderHealth(engine, "game");
    const preparation = deferred<number>(),
      validation = deferred<void>();
    try {
      const preparing = health.track(
        preparation.promise, "pipeline", "old pipeline",
      );
      const validating = health.track(
        validation.promise, "shader", "old diagnostics", "shader-validation",
      );
      assert.deepEqual(pendingCounts(health), [2, 1, 1]);
      if (lifecycle === "dispose") health.dispose();
      else if (lifecycle === "loss")
        engine.onContextLostObservable.notifyObservers(engine);
      else engine.onContextRestoredObservable.notifyObservers(engine);
      assert.deepEqual(pendingCounts(health), [0, 0, 0]);
      const retired = health.snapshot();
      assert.equal(retired.generation, lifecycle === "restore" ? 2 : 1);
      const failure = new Error("late diagnostics");
      const rejected = assert.rejects(validating, (error) => error === failure);
      preparation.resolve(42);
      validation.reject(failure);
      assert.equal(await preparing, 42);
      await rejected;
      // Tracking after retirement also must not create permanently pending work.
      await health.track(
        Promise.resolve(), "shader", "retired call", "shader-validation",
      );
      assert.deepEqual(health.snapshot(), retired);
      assert.equal(health.markReady(), false);
    } finally {
      engine.dispose();
    }
  });
}

test("two real engine owners attribute effect errors and resource failures independently", () => {
  const gameEngine = new NullEngine(),
    previewEngine = new NullEngine();
  const game = new RenderHealth(gameEngine, "game"),
    preview = new RenderHealth(previewEngine, "preview");
  try {
    assert.equal(game.snapshot().valid, false);
    assert.ok(game.markReady());
    assert.ok(preview.markReady());
    previewEngine.onEffectErrorObservable.notifyObservers({
      effect: {} as Effect,
      errors: "preview hair compile",
    });
    preview.report("texture", "preview image failed");
    assert.equal(game.snapshot().valid, true);
    assert.equal(preview.snapshot().valid, false);
    assert.equal(preview.snapshot().counts.effect, 1);
    assert.equal(preview.snapshot().counts.texture, 1);
    assert.notEqual(game.rendererId, preview.rendererId);
  } finally {
    gameEngine.dispose();
    previewEngine.dispose();
  }
});

test("owned asynchronous pipeline rejection is counted without a device event and keeps its rejection", async () => {
  const engine = new NullEngine();
  const health = new RenderHealth(engine, "game");
  try {
    const pending = deferred<number>();
    const tracked = health.track(
      pending.promise,
      "pipeline",
      "night flashlight",
    );
    assert.equal(health.markReady(), false);
    const failure = new Error("invalid target format");
    pending.reject(failure);
    await assert.rejects(tracked, (error) => error === failure);
    const state = health.snapshot();
    assert.equal(state.pendingOperations, 0);
    assert.equal(state.counts.pipeline, 1);
    assert.equal(state.errorCount, 1);
    assert.equal(health.markReady(), false);
    assert.match(
      state.firstErrors[0].message,
      /night flashlight: invalid target format/,
    );
  } finally {
    engine.dispose();
  }
});

test("loss and restoration invalidate the renderer and old asynchronous work cannot enter the new generation", async () => {
  const engine = new NullEngine();
  const health = new RenderHealth(engine, "game");
  try {
    assert.ok(health.markReady());
    const pending = deferred<void>();
    const tracked = health.track(pending.promise, "shader", "retired module");
    engine.onContextLostObservable.notifyObservers(engine);
    assert.equal(health.snapshot().phase, "restart-required");
    engine.onContextRestoredObservable.notifyObservers(engine);
    assert.equal(health.snapshot().generation, 2);
    pending.reject(new Error("retired error"));
    await assert.rejects(tracked, /retired error/);
    assert.equal(health.snapshot().pendingOperations, 0);
    assert.equal(health.snapshot().counts.shader, 0);
    assert.equal(health.snapshot().counts.device, 1);
    assert.equal(
      health.markReady(),
      false,
      "resource restoration does not repeat preparation",
    );
  } finally {
    engine.dispose();
  }
});

test("all errors are counted while retained messages and snapshots stay bounded and isolated", () => {
  const engine = new NullEngine();
  const faults: RenderFault[] = [];
  const health = new RenderHealth(engine, "game", (fault) =>
    faults.push(fault),
  );
  try {
    for (let i = 0; i < 100; i++) health.report("validation", "x".repeat(5000));
    const state = health.snapshot();
    assert.equal(faults.length, 100);
    assert.equal(state.errorCount, 100);
    assert.equal(state.firstErrors.length, 5);
    assert.equal(state.firstErrors[0].message.length, 2000);
    state.counts.validation = 0;
    state.firstErrors[0].message = "mutated";
    assert.equal(health.snapshot().counts.validation, 100);
    assert.notEqual(health.snapshot().firstErrors[0].message, "mutated");
  } finally {
    engine.dispose();
  }
});

test("disposal detaches only its observers and late owned work preserves result semantics", async () => {
  const engine = new NullEngine();
  const health = new RenderHealth(engine, "preview");
  const pending = deferred<number>();
  const tracked = health.track(pending.promise, "shader", "module");
  let otherDispose = 0;
  engine.onDisposeObservable.add(() => otherDispose++);
  engine.dispose();
  pending.resolve(42);
  assert.equal(await tracked, 42);
  assert.equal(otherDispose, 1);
  assert.equal(health.snapshot().phase, "disposed");
  assert.equal(health.snapshot().pendingOperations, 0);
  health.report("render", "after disposal");
  health.dispose();
  assert.equal(health.snapshot().errorCount, 0);
});

test("guard rejects an owned fault promptly and preserves that error identity", async () => {
  const engine = new NullEngine(),
    health = new RenderHealth(engine, "game");
  try {
    const pending = deferred<object>();
    const guarded = health.guard(pending.promise);
    const failure = new Error("owned startup failed");
    const rejected = assert.rejects(guarded, (error) => error === failure);
    health.report("shader", failure);
    await rejected;
    const before = health.snapshot();
    pending.resolve({ late: true });
    await Promise.resolve();
    assert.deepEqual(health.snapshot(), before);
    assert.equal(
      health.snapshot().pendingOperations,
      0,
      "guard does not pretend to be a tracked GPU operation",
    );
  } finally {
    engine.dispose();
  }
});

test("guard preserves normal success/rejection and releases every settled waiter", async () => {
  const engine = new NullEngine(),
    health = new RenderHealth(engine, "preview");
  try {
    const value = { original: true },
      failure = new Error("operation rejected");
    assert.equal(await health.guard(Promise.resolve(value)), value);
    await assert.rejects(
      health.guard(Promise.reject(failure)),
      (error) => error === failure,
    );
    const internal = health as unknown as { guards: Set<unknown> };
    assert.equal(internal.guards.size, 0);
    assert.equal(health.snapshot().errorCount, 0);
    const pending = deferred<void>(),
      rejected = assert.rejects(health.guard(pending.promise), {
        name: "AbortError",
      });
    health.dispose();
    await rejected;
    assert.equal(internal.guards.size, 0);
    pending.reject(new Error("late handled rejection"));
    await Promise.resolve();
  } finally {
    engine.dispose();
  }
});

test("guard around track keeps the original rejection despite the health notification", async () => {
  const engine = new NullEngine(),
    health = new RenderHealth(engine, "game");
  try {
    const pending = deferred<void>(),
      failure = new Error("pipeline source failure");
    const guarded = health.guard(
      health.track(pending.promise, "pipeline", "startup"),
    );
    const rejected = assert.rejects(guarded, (error) => error === failure);
    pending.reject(failure);
    await rejected;
    assert.match(
      health.snapshot().firstErrors[0].message,
      /startup: pipeline source failure/,
    );
  } finally {
    engine.dispose();
  }
});

test("native device loss works without Babylon auto-restore and is not double-counted", async () => {
  const engine = new NullEngine(),
    lost = deferred<{ message: string; reason: string }>();
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  (
    engine as unknown as { _device: EventTarget & { lost: Promise<unknown> } }
  )._device = Object.assign(new EventTarget(), { lost: lost.promise });
  const health = new RenderHealth(engine, "game");
  try {
    assert.ok(health.markReady());
    lost.resolve({ reason: "unknown", message: "GPU removed" });
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(health.snapshot().phase, "restart-required");
    assert.equal(health.snapshot().counts.device, 1);
    engine.onContextLostObservable.notifyObservers(engine);
    assert.equal(health.snapshot().counts.device, 1);
    assert.equal(health.markReady(), false);
  } finally {
    engine.dispose();
  }
});
