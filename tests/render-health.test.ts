import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Observable } from "@babylonjs/core/Misc/observable";
import { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.pure";
import type { Effect } from "@babylonjs/core/Materials/effect";
import {
  RenderHealth,
  type RenderFault,
  type RenderOperationKind,
} from "../client/render-health";
import { WebGpuFrameLifecycleProfile } from "../client/webgpu-frame-lifecycle-profile";

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

test("unpatched WebGPU query error producer invalidates health; WebGL is unaffected", () => {
  const engine = new NullEngine();
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
  Object.assign(engine, { _device: Object.assign(new EventTarget(), { lost: new Promise(() => {}) }) });
  const health = new RenderHealth(engine, "game");
  assert.equal(health.snapshot().phase, "invalid");
  assert.equal(health.snapshot().counts.render, 1);
  assert.equal(health.markReady(), false);
  assert.match(health.snapshot().firstErrors[0].message, /query read error monitoring unavailable/);
  engine.dispose();
});

type FrameMethod = (this: unknown, ...args: unknown[]) => unknown;
type FrameInternals = {
  _processFrame: FrameMethod;
  endFrame: FrameMethod;
  _activeRenderLoops: (() => void)[];
  _queueNewFrameForRenderLoop(): void;
};
function frameFixture(failing?: "begin" | "callback" | "end" | "submit") {
  const engine = new NullEngine();
  const internal = engine as unknown as FrameInternals;
  const failure = new TypeError(`original ${failing} failure`);
  const calls: string[] = [];
  const step = (phase: typeof failing) => {
    calls.push(phase!);
    if (phase === failing) throw failure;
  };
  engine.beginFrame = () => step("begin");
  engine.endFrame = () => { step("end"); step("submit"); };
  internal._activeRenderLoops = [() => step("callback")];
  internal._queueNewFrameForRenderLoop = () => { calls.push("queue"); };
  const run = () => (AbstractEngine.prototype as unknown as {
    _renderLoop(timestamp: number): void;
  })._renderLoop.call(engine, 100);
  return { engine, internal, calls, failure, run };
}
function profiledHealth(f: ReturnType<typeof frameFixture>, healthFirst: boolean,
  onFault?: () => void) {
  // Profiling reads only structural fields; no GPU is created by this fixture.
  Object.defineProperty(f.engine, "isWebGPU", { value: true, configurable: true });
  Object.assign(f.engine, { onQueryReadErrorObservable: new Observable() });
  const lost = deferred<{ message: string; reason: string }>();
  Object.assign(f.engine, { _device: Object.assign(new EventTarget(), { lost: lost.promise }) });
  let health = healthFirst ? new RenderHealth(f.engine, "game", onFault) : undefined;
  const profiler = new WebGpuFrameLifecycleProfile(f.engine, { rawFrame: { request: () => 1, cancel() {} } });
  health ??= new RenderHealth(f.engine, "game", onFault);
  return { health, profiler };
}

test("a previously selected RAF and manual endFrame issue no GPU work after terminal health", () => {
  for (const terminal of ["invalid", "restart-required"] as const) {
    const f = frameFixture();
    const health = new RenderHealth(f.engine, "game", () => f.engine.stopRenderLoop());
    try {
      health.markReady();
      if (terminal === "invalid") health.report("validation", "terminal validation");
      else f.engine.onContextRestoredObservable.notifyObservers(f.engine);
      assert.equal(f.internal._activeRenderLoops.length, 0);
      assert.equal(health.snapshot().phase, terminal);
      f.run(); // pinned _processFrame otherwise still calls begin/end with no callbacks
      f.engine.endFrame(); // a manual finalizer must not submit the abandoned encoder
      assert.deepEqual(f.calls, []);
      assert.equal(health.snapshot().errorCount, 1);
    } finally { f.engine.dispose(); }
  }
});

test("a synchronous terminal report during the callback prevents the following endFrame submit", () => {
  for (const terminal of ["invalid", "restart-required"] as const) {
    const f = frameFixture();
    const health = new RenderHealth(f.engine, "game", () => f.engine.stopRenderLoop());
    f.internal._activeRenderLoops = [() => {
      f.calls.push("reported");
      if (terminal === "invalid") health.report("validation", "inline fault without throw");
      else f.engine.onContextRestoredObservable.notifyObservers(f.engine);
    }];
    try {
      health.markReady();
      assert.equal(f.run(), undefined);
      assert.deepEqual(f.calls, ["begin", "reported"]);
      assert.equal(health.snapshot().errorCount, 1, "no invented exception or second fault");
      assert.equal(health.snapshot().phase, terminal);
    } finally { f.engine.dispose(); }
  }
});

for (const stage of ["begin", "callback", "end", "submit"] as const) {
  test(`actual pinned frame ${stage} throw invalidates health without repairing or scheduling the frame`, async () => {
    const f = frameFixture(stage), faults: RenderFault[] = [];
    const health = new RenderHealth(f.engine, "game", (fault) => faults.push(fault));
    const pending = deferred<void>();
    const guarded = health.guard(pending.promise).then(() => undefined, (error: unknown) => error);
    try {
      assert.ok(health.markReady());
      assert.throws(f.run, (error) => error === f.failure);
      assert.equal(health.snapshot().counts.render, 1);
      assert.equal(health.snapshot().valid, false);
      assert.equal(faults.length, 1);
      assert.equal(f.calls.filter((call) => call === "end").length, stage === "begin" || stage === "callback" ? 0 : 1);
      assert.equal(f.calls.includes("queue"), false);
      assert.equal(await guarded, f.failure);
    } finally { f.engine.dispose(); }
  });
}

test("nested reports are deduplicated and a throwing reporter cannot replace the original frame exception", () => {
  for (const nested of [false, true]) {
    const f = frameFixture(), failure = new Error("original frame source");
    const health = new RenderHealth(f.engine, "game", () => { throw new Error("reporter failure"); });
    f.internal._activeRenderLoops = [() => {
      if (nested) {
        try { health.report("render", failure); } catch { /* profiler already preserves source throw */ }
      }
      throw failure;
    }];
    try {
      assert.throws(f.run, (error) => error === failure);
      assert.equal(health.snapshot().errorCount, 1);
      assert.equal(health.snapshot().counts.render, 1);
    } finally { f.engine.dispose(); }
  }
});

test("successful and borrowed frame calls preserve receiver arguments return and do not allocate health snapshots", () => {
  const engine = new NullEngine(), internal = engine as unknown as FrameInternals;
  const calls: { receiver: unknown; args: unknown[] }[] = [];
  const returned = { original: true };
  internal._processFrame = function (...args) { calls.push({ receiver: this, args }); return returned; };
  const health = new RenderHealth(engine, "game");
  const snapshot = health.snapshot.bind(health);
  let snapshots = 0;
  health.snapshot = () => { snapshots++; return snapshot(); };
  const argument = {}, other = {};
  try {
    assert.equal(internal._processFrame.call(engine, 17, argument), returned);
    assert.equal(internal._processFrame.call(other, argument), returned);
    assert.deepEqual(calls, [{ receiver: engine, args: [17, argument] }, { receiver: other, args: [argument] }]);
    assert.equal(snapshots, 0);
  } finally { engine.dispose(); }
});

test("frame returns never inspect then or attach promise settlement handlers", async () => {
  const engine = new NullEngine(), internal = engine as unknown as FrameInternals;
  let reads = 0;
  const thenable = { get then() { reads++; throw new Error("then read"); } };
  const rejected = deferred<unknown>();
  const originalThen = rejected.promise.then;
  Object.defineProperty(rejected.promise, "then", { configurable: true, get() { reads++; return originalThen; } });
  let returned: unknown = thenable;
  internal._processFrame = () => returned;
  const health = new RenderHealth(engine, "game");
  try {
    assert.equal(internal._processFrame(), thenable);
    returned = rejected.promise;
    assert.equal(internal._processFrame(), rejected.promise);
    assert.equal(reads, 0);
    Reflect.deleteProperty(rejected.promise, "then");
    const failure = new Error("caller-owned async rejection");
    const checked = assert.rejects(rejected.promise, (error) => error === failure);
    rejected.reject(failure);
    await checked;
    assert.equal(health.snapshot().errorCount, 0);
  } finally { engine.dispose(); }
});

test("healthy endFrame preserves receiver arguments returns throws and thenables; disposed wrappers stay transparent", () => {
  const engine = new NullEngine(), internal = engine as unknown as FrameInternals;
  const failure = new Error("end source"), argument = {}, other = {};
  const calls: { receiver: unknown; args: unknown[] }[] = [];
  let reads = 0, fail = false;
  const returned = { get then() { reads++; throw new Error("must not inspect"); } };
  internal.endFrame = function (...args) {
    calls.push({ receiver: this, args });
    if (fail) throw failure;
    return returned;
  };
  const original = Object.getOwnPropertyDescriptor(engine, "endFrame");
  const health = new RenderHealth(engine, "game"), retained = internal.endFrame;
  try {
    assert.equal(internal.endFrame.call(engine, argument), returned);
    assert.equal(internal.endFrame.call(other, 17), returned);
    assert.deepEqual(calls, [{ receiver: engine, args: [argument] }, { receiver: other, args: [17] }]);
    assert.equal(reads, 0);
    fail = true;
    assert.throws(() => internal.endFrame(), (error) => error === failure);
    assert.equal(health.snapshot().errorCount, 0, "manual draw owner still catches its healthy-path failure");
    health.report("validation", "terminal");
    assert.equal(internal.endFrame(), undefined);
    health.dispose();
    assert.deepEqual(Object.getOwnPropertyDescriptor(engine, "endFrame"), original);
    assert.throws(() => retained.call(engine), (error) => error === failure);
  } finally { engine.dispose(); }
});

test("restoration emits a terminal device fault in its new generation even without preceding loss", () => {
  const engine = new NullEngine();
  const delivered: { fault: RenderFault; phase: string; generation: number }[] = [];
  const health = new RenderHealth(engine, "game", (fault, state) => delivered.push({ fault, phase: state.phase, generation: state.generation }));
  try {
    health.markReady();
    engine.onContextRestoredObservable.notifyObservers(engine);
    assert.deepEqual(delivered.map(({ fault, phase, generation }) => [fault.channel, fault.generation, phase, generation]), [["device", 2, "restart-required", 2]]);
    assert.equal(health.markReady(), false);
    engine.onContextLostObservable.notifyObservers(engine);
    assert.equal(delivered.length, 1, "same-generation loss after restore is already terminal");
  } finally { engine.dispose(); }
});

test("disposed or generation-retired frames do not report into a new renderer", () => {
  for (const retirement of ["dispose", "restore"] as const) {
    const f = frameFixture(), failure = new Error("retired frame");
    const health = new RenderHealth(f.engine, "game");
    f.internal._activeRenderLoops = [() => {
      if (retirement === "dispose") health.dispose();
      else f.engine.onContextRestoredObservable.notifyObservers(f.engine);
      throw failure;
    }];
    try {
      assert.throws(f.run, (error) => error === failure);
      assert.equal(health.snapshot().counts.render, 0);
      assert.equal(health.snapshot().counts.device, retirement === "restore" ? 1 : 0);
    } finally { f.engine.dispose(); }
  }
});

test("frame ownership is per engine and restores inherited/own descriptors without replacing later owners", () => {
  const f = frameFixture("callback"), other = frameFixture();
  const original = f.internal._processFrame;
  const ownOriginal = Object.getOwnPropertyDescriptor(f.engine, "_processFrame");
  const health = new RenderHealth(f.engine, "game"), preview = new RenderHealth(other.engine, "preview");
  const retained = f.internal._processFrame;
  try {
    assert.throws(f.run, (error) => error === f.failure);
    assert.equal(preview.snapshot().errorCount, 0);
    health.dispose();
    assert.equal(f.internal._processFrame, original);
    assert.deepEqual(Object.getOwnPropertyDescriptor(f.engine, "_processFrame"), ownOriginal);
    assert.throws(() => retained.call(f.engine, 100), (error) => error === f.failure);
    assert.equal(health.snapshot().counts.render, 1);
    const replacement = new RenderHealth(f.engine, "game");
    const laterOwner = () => "later";
    f.internal._processFrame = laterOwner;
    replacement.dispose();
    assert.equal(f.internal._processFrame, laterOwner);
  } finally { f.engine.dispose(); other.engine.dispose(); }
});

test("missing immutable or accessor frame hooks fail closed without evaluating getters", () => {
  for (const method of ["_processFrame", "endFrame"] as const)
  for (const mode of ["missing", "immutable", "accessor"] as const) {
    const engine = new NullEngine(); let reads = 0;
    Object.defineProperty(engine, method, mode === "accessor" ? {
      configurable: true, get() { reads++; return () => {}; },
    } : { configurable: false, writable: false, value: mode === "missing" ? undefined : () => {} });
    const faults: RenderFault[] = [];
    const health = new RenderHealth(engine, "game", (fault) => faults.push(fault));
    try {
      assert.equal(reads, 0);
      assert.equal(health.snapshot().counts.render, 1);
      assert.equal(health.markReady(), false);
      assert.match(faults[0].message, /frame.*monitor/i);
    } finally { engine.dispose(); }
  }
});

test("own frame descriptors and the sole owner survive attach/dispose without duplicate callbacks", () => {
  const engine = new NullEngine();
  const original = { value: () => 19, configurable: true, enumerable: true, writable: false };
  Object.defineProperty(engine, "_processFrame", original);
  const health = new RenderHealth(engine, "game");
  try {
    assert.throws(() => new RenderHealth(engine, "preview"), /owner/);
    assert.equal((engine as unknown as FrameInternals)._processFrame(), 19);
    health.dispose();
    assert.deepEqual(Object.getOwnPropertyDescriptor(engine, "_processFrame"), original);
    const next = new RenderHealth(engine, "preview");
    next.dispose();
  } finally { engine.dispose(); }
});

test("always-on health catch composes with the actual optional frame profiler in either attachment order", () => {
  for (const healthFirst of [true, false]) {
    const f = frameFixture("callback");
    const { health, profiler } = profiledHealth(f, healthFirst);
    try {
      assert.throws(f.run, (error) => error === f.failure);
      assert.equal(health.snapshot().counts.render, 1);
      assert.equal(profiler.snapshot().phases.processFrame!.thrown, 1);
      const before = [...f.calls];
      f.engine.endFrame();
      assert.deepEqual(f.calls, before, "terminal manual submit is vetoed through either wrapper order");
      health.dispose(); profiler.dispose();
    } finally { profiler?.dispose(); health?.dispose(); f.engine.dispose(); }
  }
});

test("inline terminal reports veto endFrame through the actual profiler in either order and preserve later owners", () => {
  for (const healthFirst of [true, false]) {
    const f = frameFixture();
    const { health, profiler } = profiledHealth(f, healthFirst, () => f.engine.stopRenderLoop());
    f.internal._activeRenderLoops = [() => {
      f.calls.push("reported");
      health.report("validation", "inline terminal");
    }];
    try {
      f.run();
      assert.deepEqual(f.calls, ["begin", "reported"]);
      assert.equal(health.snapshot().errorCount, 1);
      const laterOwner = () => {};
      f.engine.endFrame = laterOwner;
      health.dispose(); profiler.dispose();
      assert.equal(f.engine.endFrame, laterOwner);
    } finally { profiler.dispose(); health.dispose(); f.engine.dispose(); }
  }
});

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
    assert.equal(health.snapshot().counts.device, 2, "loss and restored generation each notify their terminal state");
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
  Object.assign(engine, { onQueryReadErrorObservable: new Observable() });
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
