import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { RenderHealth, type RenderFault } from "../client/render-health";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
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
