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
