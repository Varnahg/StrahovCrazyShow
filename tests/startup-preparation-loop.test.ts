import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Observable } from "@babylonjs/core/Misc/observable";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine.pure";
import { RenderHealth } from "../client/render-health";
import { StartupPreparationLoop, type StartupPreparationHost } from "../client/startup-preparation-loop";
import { prepareLightVariants } from "../client/light-preparation";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
async function flush() { for (let index = 0; index < 50; index++) await Promise.resolve(); }

/** The installed native endFrame and flushFramebuffer run unchanged. Only the
 * terminal GPU encoders/device are replaced; this is not a GPU/FPS test. */
function actualEndFrame(submit: () => void) {
  const noop = () => {}, encoder = () => ({ finish: () => ({}) });
  const state = {
    _endCurrentRenderPass: noop, _debugPopBeforeEndOfEncoder: noop, _debugPushAfterStartOfEncoder: noop,
    _snapshotRendering: { endFrame: noop }, _timestampQuery: { endFrame: noop, startFrame: noop },
    _uploadEncoder: encoder(), _renderEncoder: encoder(), _commandBuffers: [],
    _device: { queue: { submit }, createCommandEncoder: encoder },
    _uploadEncoderDescriptor: {}, _renderEncoderDescriptor: {},
    _debugMarkersEncoderGroups: [], _debugMarkersPassGroups: [],
    _textureHelper: { destroyDeferredTextures: noop, setCommandEncoder: noop },
    _bufferManager: { destroyDeferredBuffers: noop }, _bundleList: { reset: noop },
    countersLastFrame: {}, _counters: {}, _frameId: 0, frameId: 0,
    _cacheRenderPipeline: { endFrame: noop }, _cacheBindGroups: { endFrame: noop },
    onEndFrameObservable: { notifyObservers: noop },
    flushFramebuffer(fromEnd?: boolean) {
      return WebGPUEngine.prototype.flushFramebuffer.call(this as unknown as WebGPUEngine, fromEnd);
    },
  };
  return () => WebGPUEngine.prototype.endFrame.call(state as unknown as WebGPUEngine);
}

function fixture(native = true) {
  const engine = new NullEngine(), lost = deferred<{ reason: string; message: string }>();
  let begins = 0, ends = 0, submits = 0, pushes = 0, pops = 0, fences = 0, hostDisposals = 0;
  let visible = true, nextId = 0;
  let queue: Promise<void> = Promise.resolve();
  let validation: Promise<{ message: string } | null> = Promise.resolve(null);
  const device = Object.assign(new EventTarget(), {
    lost: lost.promise,
    pushErrorScope(filter: string) { assert.equal(filter, "validation"); pushes++; },
    popErrorScope() { pops++; return validation; },
    queue: { onSubmittedWorkDone() { fences++; return queue; } },
  });
  if (native) {
    Object.assign(engine, { onQueryReadErrorObservable: new Observable() });
    (engine as unknown as { _isWebGPU: boolean })._isWebGPU = true;
    (engine as unknown as { _device: unknown })._device = device;
  }
  engine.beginFrame = () => { begins++; };
  const end = actualEndFrame(() => submits++);
  engine.endFrame = () => { ends++; if (native) end(); };
  const faults: unknown[] = [];
  const health = new RenderHealth(engine, "game", fault => faults.push(fault));
  const tasks = new Map<number, () => void>(), listeners = new Set<() => void>();
  const host: StartupPreparationHost = {
    requestTask(callback) {
      assert.equal(tasks.size, 0, "at most one queued startup task");
      const id = ++nextId; tasks.set(id, callback); return id;
    },
    cancelTask(id) { tasks.delete(id); },
    visible: () => visible,
    observeVisibility(callback) { listeners.add(callback); return () => { listeners.delete(callback); }; },
    dispose() { hostDisposals++; tasks.clear(); },
  };
  const abort = new AbortController();
  const loop = new StartupPreparationLoop(engine, health, { host, signal: abort.signal });
  return {
    engine, health, device, loop, host, abort, lost, tasks, listeners, faults,
    counts: () => ({ begins, ends, submits, pushes, pops, fences, hostDisposals }),
    setQueue(value: Promise<void>) { queue = value; },
    setValidation(value: Promise<{ message: string } | null>) { validation = value; },
    visibility(value: boolean) { visible = value; for (const listener of listeners) listener(); },
    takeTask() {
      assert.equal(tasks.size, 1);
      const [id, callback] = tasks.entries().next().value!; tasks.delete(id); return callback;
    },
    async task() { this.takeTask()(); await flush(); },
    dispose() { loop.dispose(); engine.dispose(); },
  };
}

test("bounded CPU-only ticks use task turns without any engine frame or presentation dependency", async () => {
  const f = fixture();
  try {
    let ticks = 0;
    const callback = () => { if (++ticks === 6) f.loop.stop(callback); return true; };
    f.loop.run(callback);
    for (let i = 0; i < 6; i++) await f.task();
    await f.loop.waitForIdle();
    assert.equal(ticks, 6); assert.equal(f.tasks.size, 0);
    assert.deepEqual(f.counts(), { begins: 0, ends: 0, submits: 0, pushes: 0, pops: 0, fences: 0, hostDisposals: 0 });
  } finally { f.dispose(); }
});

test("lazy native draw submits through actual pinned endFrame and stop inside callback permits its healthy completion", async () => {
  const f = fixture();
  try {
    let draws = 0;
    const callback = () => { f.loop.render(() => draws++); f.loop.stop(callback); return true; };
    f.loop.run(callback); await f.task(); await f.loop.waitForIdle();
    assert.equal(draws, 1);
    assert.deepEqual(f.counts(), { begins: 1, ends: 1, submits: 1, pushes: 1, pops: 1, fences: 1, hostDisposals: 0 });
    assert.equal(f.health.snapshot().pendingOperations, 0);
  } finally { f.dispose(); }
});

test("the actual finite light catalog preserves all stages, bounded checks and ready draws without presentation callbacks", async () => {
  const f = fixture();
  try {
    let checks = 0, timerCleared = false, ticks = 0;
    const mesh = { isDisposed: () => false, isEnabled: () => true, isVisible: true, isReady: () => true };
    const result = prepareLightVariants({
      apply() {}, restore() {}, meshes: () => Array.from({ length: 5 }, () => mesh), beforeChecks() {},
      check() { checks++; return true; }, effectsReady: () => true,
      render: () => f.loop.render(() => {}), run: callback => f.loop.run(callback), stop: callback => f.loop.stop(callback),
      onDispose: () => () => {}, isDisposed: () => false, revision: () => [], now: () => ticks,
      setTimer: () => 1, clearTimer() { timerCleared = true; },
      batchSize: 2, includeDayPointVariants: true, includeVehicleVariants: true,
    });
    while (f.tasks.size && ticks < 200) { ticks++; await f.task(); }
    assert.ok(ticks < 200, "the finite task catalog must not spin");
    const complete = await result; await f.loop.waitForIdle();
    assert.equal(complete.status, "complete"); assert.equal(complete.stages.length, 19);
    assert.ok(complete.stages.every(stage => stage.renders === 3 && stage.checks === 10));
    assert.equal(checks, 190); assert.equal(f.counts().begins, 57); assert.equal(f.counts().ends, 57);
    assert.equal(f.counts().submits, 57); assert.equal(f.counts().fences, 57); assert.equal(timerCleared, true);
    assert.equal(f.tasks.size, 0); assert.equal(f.health.snapshot().pendingOperations, 0);
  } finally { f.dispose(); }
});

test("the next quality pass and final idle barrier cannot bypass the last tick's pending fence", async () => {
  const f = fixture(), pending = deferred<void>();
  try {
    f.setQueue(pending.promise);
    let firstDone = false, secondTicks = 0, idle = false;
    const first = () => { f.loop.render(() => {}); f.loop.stop(first); firstDone = true; return true; };
    const second = () => { secondTicks++; f.loop.stop(second); return true; };
    f.loop.run(first); await f.task(); assert.equal(firstDone, true);
    const barrier = f.loop.waitForIdle().then(() => { idle = true; });
    f.loop.run(second); await flush();
    assert.equal(f.tasks.size, 0); assert.equal(secondTicks, 0); assert.equal(idle, false);
    pending.resolve(); await barrier; await flush();
    assert.equal(idle, true); assert.equal(f.tasks.size, 1);
    await f.task(); assert.equal(secondTicks, 1);
  } finally { pending.resolve(); f.dispose(); }
});

for (const phase of ["failed", "timeout", "restore", "cleanup", "disposed"])
  test(`actual light ${phase} result vetoes the recorded frame after its synchronous cleanup`, async () => {
    const f = fixture();
    try {
      let now = 0, disposed = false;
      const result = prepareLightVariants({
        apply() {}, restore() { if (phase === "restore") throw new Error("restore failure"); },
        meshes: () => [], beforeChecks() {}, check: () => true, effectsReady: () => true,
        render: () => f.loop.render(() => {
          if (phase === "failed") throw new Error("draw failure swallowed by light helper");
          if (phase === "disposed") disposed = true;
          else now = 20;
        }),
        run: callback => f.loop.run(callback),
        stop(callback) { f.loop.stop(callback); if (phase === "cleanup") throw new Error("stop cleanup failure"); },
        onDispose: () => () => {}, isDisposed: () => disposed,
        revision: () => [], now: () => now, setTimer: () => 1, clearTimer() {}, timeoutMs: 10,
      });
      await f.task();
      const settled = await result;
      assert.equal(settled.status, phase === "timeout" ? "timeout" : phase === "disposed" ? "disposed" : "failed");
      if (phase === "restore" || phase === "cleanup") assert.equal(settled.failureStep, phase);
      assert.equal(f.counts().begins, 1); assert.equal(f.counts().ends, 0); assert.equal(f.counts().submits, 0);
      assert.equal(f.counts().pushes, 1); assert.equal(f.counts().pops, 1); assert.equal(f.counts().fences, 0);
      assert.equal(f.tasks.size, 0); assert.equal(f.listeners.size, 0);
      assert.throws(() => f.loop.run(() => true), { name: "AbortError" });
      assert.equal(f.health.snapshot().errorCount, phase === "failed" ? 1 : 0,
        "real draw throws reach health; pure status results remain owned by the outer light helper");
    } finally { f.dispose(); }
  });

for (const thrown of [0, undefined, false])
  test(`actual swallowed falsy draw throw (${String(thrown)}) keeps its health guard rejection identity`, async () => {
    const f = fixture();
    try {
      const caught = f.health.guard(new Promise<void>(() => {})).then(
        () => assert.fail("the actual throw must invalidate its health owner"),
        reason => { assert.equal(reason, thrown); },
      );
      const result = prepareLightVariants({
        apply() {}, restore() {}, meshes: () => [], beforeChecks() {}, check: () => true, effectsReady: () => true,
        render: () => f.loop.render(() => { throw thrown; }),
        run: callback => f.loop.run(callback), stop: callback => f.loop.stop(callback),
        onDispose: () => () => {}, isDisposed: () => false, revision: () => [], now: () => 0,
        setTimer: () => 1, clearTimer() {},
      });
      await f.task(); await caught;
      assert.equal((await result).status, "failed");
      assert.equal(f.health.snapshot().firstErrors[0].message, String(thrown));
      assert.equal(f.counts().ends, 0); assert.equal(f.counts().submits, 0);
      assert.equal(f.counts().pushes, f.counts().pops); assert.equal(f.tasks.size, 0);
    } finally { f.dispose(); }
  });

for (const stage of ["source", "begin", "draw", "end"])
  test(`a direct ${stage} throw reaches RenderHealth and no later frame is scheduled`, async () => {
    const f = fixture(), failure = new Error(stage + " source failure");
    try {
      if (stage === "begin") f.engine.beginFrame = () => { throw failure; };
      if (stage === "end") f.engine.endFrame = () => { throw failure; };
      const callback = () => {
        if (stage === "source") throw failure;
        f.loop.render(() => { if (stage === "draw") throw failure; });
        return true;
      };
      f.loop.run(callback); await f.task();
      assert.equal(f.counts().submits, 0); assert.equal(f.tasks.size, 0);
      assert.equal(f.health.snapshot().phase, "invalid");
      assert.equal(f.health.snapshot().firstErrors[0].message, failure.message);
      assert.equal(f.health.snapshot().pendingOperations, 0);
      assert.equal(f.counts().pushes, f.counts().pops);
    } finally { f.dispose(); }
  });

test("a draw error swallowed by an incorrectly true callback still cannot submit", async () => {
  const f = fixture();
  try {
    const callback = () => { try { f.loop.render(() => { throw new Error("swallowed draw"); }); } catch {} return true; };
    f.loop.run(callback); await f.task();
    assert.equal(f.counts().ends, 0); assert.equal(f.counts().submits, 0);
    assert.equal(f.health.snapshot().firstErrors[0].message, "swallowed draw");
  } finally { f.dispose(); }
});

for (const primary of [0, undefined, false])
  test(`first draw throw (${String(primary)}) wins over a later callback cleanup throw`, async () => {
    const f = fixture();
    try {
      const observed = f.health.guard(new Promise<void>(() => {})).then(
        () => assert.fail("source failure must invalidate the owner"),
        reason => { assert.equal(reason, primary); },
      );
      const callback = () => {
        try { f.loop.render(() => { throw primary; }); }
        catch { /* The caller continues into its own cleanup. */ }
        throw new Error("secondary callback cleanup failure");
      };
      f.loop.run(callback); await f.task(); await observed;
      assert.equal(f.health.snapshot().firstErrors[0].message, String(primary));
      assert.equal(f.health.snapshot().errorCount, 1);
      assert.equal(f.counts().begins, 1); assert.equal(f.counts().ends, 0); assert.equal(f.counts().submits, 0);
      assert.equal(f.counts().pushes, f.counts().pops); assert.equal(f.tasks.size, 0);
    } finally { f.dispose(); }
  });

test("synchronous health fault inside render vetoes endFrame and retires the scheduler", async () => {
  const f = fixture();
  try {
    const callback = () => { f.loop.render(() => f.health.report("render", new Error("inline fault"))); return true; };
    f.loop.run(callback); await f.task();
    assert.equal(f.counts().ends, 0); assert.equal(f.counts().submits, 0); assert.equal(f.tasks.size, 0);
    assert.equal(f.health.snapshot().errorCount, 1);
  } finally { f.dispose(); }
});

test("validation and asynchronous queue rejection invalidate the owner without an uncaptured device event", async () => {
  for (const channel of ["validation", "queue"] as const) {
    const f = fixture(), failure = new Error(channel + " failure");
    try {
      if (channel === "validation") f.setValidation(Promise.resolve({ message: failure.message }));
      else { const failed = deferred<void>(); f.setQueue(failed.promise); failed.reject(failure); }
      const callback = () => { f.loop.render(() => {}); return true; };
      f.loop.run(callback); await f.task();
      assert.equal(f.health.snapshot().phase, "invalid"); assert.equal(f.tasks.size, 0);
      assert.equal(f.health.snapshot().counts.pipeline, 1); assert.equal(f.health.snapshot().pendingOperations, 0);
    } finally { f.dispose(); }
  }
});

test("hidden owners cancel queued callbacks, retain requested work and resume one task without an extra frame", async () => {
  const f = fixture();
  try {
    let ticks = 0;
    const callback = () => { ticks++; f.loop.stop(callback); return true; };
    f.loop.run(callback);
    const late = f.takeTask();
    f.visibility(false); late(); await flush();
    assert.equal(ticks, 0); assert.equal(f.tasks.size, 0);
    f.visibility(true); assert.equal(f.tasks.size, 1); await f.task();
    assert.equal(ticks, 1); assert.equal(f.counts().begins, 0);
  } finally { f.dispose(); }
});

test("hiding during a valid draw completes that owned frame, pauses subsequent work and retains its fence", async () => {
  const f = fixture(), pending = deferred<void>();
  try {
    f.setQueue(pending.promise);
    let ticks = 0;
    const callback = () => { ticks++; f.loop.render(() => f.visibility(false)); return true; };
    f.loop.run(callback); await f.task();
    assert.equal(f.counts().ends, 1); assert.equal(f.tasks.size, 0);
    f.visibility(true); await flush(); assert.equal(f.tasks.size, 0);
    pending.resolve(); await flush(); assert.equal(f.tasks.size, 1);
    f.loop.stop(callback); assert.equal(f.tasks.size, 0); assert.equal(ticks, 1);
  } finally { pending.resolve(); f.dispose(); }
});

for (const retirement of ["abort", "dispose", "device-loss", "generation"] as const)
  test(`${retirement} promptly rejects waitForIdle while a fence is pending; late work cannot revive the owner`, async () => {
    const f = fixture(), pending = deferred<void>();
    try {
      f.setQueue(pending.promise);
      const callback = () => { f.loop.render(() => {}); f.loop.stop(callback); return true; };
      f.loop.run(callback); await f.task();
      const barrier = f.loop.waitForIdle(), rejected = assert.rejects(barrier);
      if (retirement === "abort") f.abort.abort();
      else if (retirement === "dispose") f.loop.dispose();
      else if (retirement === "device-loss") f.lost.resolve({ reason: "destroyed", message: "actual device.lost fixture" });
      else f.engine.onContextRestoredObservable.notifyObservers(f.engine);
      await rejected; await flush();
      const ends = f.counts().ends;
      pending.resolve(); await flush();
      assert.equal(f.tasks.size, 0); assert.equal(f.listeners.size, 0); assert.equal(f.counts().ends, ends);
      assert.throws(() => f.loop.run(callback), { name: "AbortError" });
    } finally { pending.resolve(); f.dispose(); }
  });

test("abort inside a draw closes its scope without endFrame; later dequeued tasks remain inert", async () => {
  const f = fixture();
  try {
    const callback = () => { f.loop.render(() => f.abort.abort()); return true; };
    f.loop.run(callback); await f.task();
    assert.equal(f.counts().ends, 0); assert.equal(f.counts().pushes, f.counts().pops);
    assert.equal(f.tasks.size, 0); assert.equal(f.counts().hostDisposals, 1);
  } finally { f.dispose(); }
});

test("WebGL reference retains full manual begin/end without fake WebGPU scope or timing", async () => {
  const f = fixture(false);
  try {
    const callback = () => { f.loop.render(() => {}); f.loop.stop(callback); return true; };
    f.loop.run(callback); await f.task(); await f.loop.waitForIdle();
    assert.deepEqual(f.counts(), { begins: 1, ends: 1, submits: 0, pushes: 0, pops: 0, fences: 0, hostDisposals: 0 });
  } finally { f.dispose(); }
});

test("idle barrier rejects an active or reentrant caller instead of observing a previous pass", async () => {
  const f = fixture();
  try {
    let inline: Promise<void> | undefined;
    const callback = () => {
      f.loop.stop(callback);
      inline = assert.rejects(f.loop.waitForIdle(), /Stop startup preparation/);
      return true;
    };
    f.loop.run(callback);
    await assert.rejects(f.loop.waitForIdle(), /Stop startup preparation/);
    await f.task(); await inline; await f.loop.waitForIdle();
  } finally { f.dispose(); }
});

test("a cancellation cleanup throw still closes the host, releases listeners and records the fault once", () => {
  const f = fixture();
  try {
    f.loop.run(() => true);
    f.host.cancelTask = () => { throw new Error("cancel cleanup failure"); };
    assert.doesNotThrow(() => f.loop.dispose());
    assert.equal(f.counts().hostDisposals, 1); assert.equal(f.listeners.size, 0); assert.equal(f.tasks.size, 0);
    assert.equal(f.health.snapshot().counts.render, 1);
    f.loop.dispose(); assert.equal(f.counts().hostDisposals, 1);
  } finally { f.dispose(); }
});

test("the actual MessageChannel host runs finite work and its final disposal closes its browser listener", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const documentFixture = Object.assign(new EventTarget(), { hidden: false });
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentFixture });
  const engine = new NullEngine(), health = new RenderHealth(engine, "game");
  let loop: StartupPreparationLoop | undefined, watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    loop = new StartupPreparationLoop(engine, health);
    await new Promise<void>((resolve, reject) => {
      watchdog = setTimeout(() => reject(new Error("MessageChannel finite task did not run")), 1000);
      const callback = () => { loop!.stop(callback); resolve(); return true; };
      loop!.run(callback);
    });
    await loop.waitForIdle(); loop.dispose(); loop.dispose();
    assert.throws(() => loop!.run(() => true), { name: "AbortError" });
  } finally {
    clearTimeout(watchdog); loop?.dispose(); engine.dispose();
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
