import test from "node:test";
import assert from "node:assert/strict";
import { Observable } from "@babylonjs/core/Misc/observable";
import {
  watchWebGpuValidation,
  watchWebGpuQueryReadErrors,
  type WebGpuValidationEngine,
} from "../client/webgpu-validation";

test("query error watcher leaves WebGL property and lifecycle untouched", () => {
  const engine = fixture(false);
  Object.defineProperty(engine, "onQueryReadErrorObservable", { get() { assert.fail("WebGL query property read"); } });
  const cleanup = watchWebGpuQueryReadErrors(engine, () => assert.fail(), () => assert.fail());
  cleanup(); cleanup();
  assert.equal(engine.onDisposeObservable.hasObservers(), false);
});

test("query error producer is required for WebGPU including registration and malformed observer", () => {
  for (const producer of [undefined, {}, { add() { throw 0; } }, { add() { return null; } }]) {
    const engine = Object.assign(fixture(), { onQueryReadErrorObservable: producer });
    const errors: Error[] = [];
    const cleanup = watchWebGpuQueryReadErrors(engine, () => assert.fail(), e => errors.push(e));
    assert.equal(errors.length, 1);
    assert.match(errors[0].message, /unavailable/);
    cleanup(); cleanup();
  }
});

test("query error watcher forwards exact falsy error and source, detaches and rejects drift once", () => {
  const observable = new Observable<{ error: unknown; source: "timestamp-pass" }>();
  const engine = Object.assign(fixture(), { onQueryReadErrorObservable: observable });
  const received: unknown[] = [], unavailable: Error[] = [];
  const cleanup = watchWebGpuQueryReadErrors(engine, (error, source) => received.push([error, source]), e => unavailable.push(e));
  observable.notifyObservers({ error: 0, source: "timestamp-pass" });
  assert.deepEqual(received, [[0, "timestamp-pass"]]);
  observable.notifyObservers({ error: false, source: "unknown" } as never);
  observable.notifyObservers({ error: false, source: "unknown" } as never);
  assert.equal(unavailable.length, 1);
  cleanup(); cleanup();
  observable.notifyObservers({ error: 1, source: "timestamp-pass" });
  assert.equal(received.length, 1);
  assert.equal(observable.hasObservers(), false);
  assert.equal(engine.onDisposeObservable.hasObservers(), false);
});

test("query watcher attempts lifecycle cleanup after producer removal throws", () => {
  const engine = Object.assign(fixture(), { onQueryReadErrorObservable: { add() { return { remove() { throw new Error("foreign cleanup"); } }; } } });
  const cleanup = watchWebGpuQueryReadErrors(engine, () => {}, () => assert.fail());
  cleanup(); cleanup();
  assert.equal(engine.onDisposeObservable.hasObservers(), false);
});

test("malformed producer cannot deliver after failed registration and event getters are not invoked", () => {
  let retained!: (event: unknown) => void;
  const engine = Object.assign(fixture(), { onQueryReadErrorObservable: { add(callback: typeof retained) { retained = callback; return null; } } });
  let unavailable = 0;
  watchWebGpuQueryReadErrors(engine, () => assert.fail(), () => unavailable++);
  retained({ error: 0, source: "timestamp-frame" });
  assert.equal(unavailable, 1);
  const observable = new Observable<{ error: unknown; source: "occlusion" }>();
  const valid = Object.assign(fixture(), { onQueryReadErrorObservable: observable });
  const cleanup = watchWebGpuQueryReadErrors(valid, () => assert.fail(), () => unavailable++);
  observable.notifyObservers({ get error() { return assert.fail("error getter invoked"); }, source: "occlusion" });
  assert.equal(unavailable, 2);
  cleanup();
});

test("query watcher handles replayed disposal and retained callback after cleanup", () => {
  const observable = new Observable<{ error: unknown; source: "occlusion" }>();
  const engine = Object.assign(fixture(), { onQueryReadErrorObservable: observable });
  engine.onDisposeObservable.notifyIfTriggered = true;
  engine.onDisposeObservable.notifyObservers();
  const cleanup = watchWebGpuQueryReadErrors(engine, () => assert.fail(), () => assert.fail());
  cleanup();
  assert.equal(observable.hasObservers(), false);
  assert.equal(engine.onDisposeObservable.hasObservers(), false);
});

function fixture(webGPU = true) {
  return {
    isWebGPU: webGPU,
    _device: new EventTarget() as EventTarget | undefined,
    onDisposeObservable: new Observable<void>(),
    onContextRestoredObservable: new Observable<void>(),
  } satisfies WebGpuValidationEngine;
}

function emit(device: EventTarget, error?: unknown) {
  const event = new Event("uncapturederror", { cancelable: true });
  Object.defineProperty(event, "error", { value: error });
  const unprevented = device.dispatchEvent(event);
  return { event, unprevented };
}

test("WebGL installs no listeners or lifecycle observers and never reads a device", () => {
  const engine = fixture(false);
  Object.defineProperty(engine, "_device", {
    get() {
      throw new Error("WebGL must not access GPUDevice");
    },
  });
  const cleanup = watchWebGpuValidation(engine, () => assert.fail());
  assert.equal(engine.onDisposeObservable.hasObservers(), false);
  assert.equal(engine.onContextRestoredObservable.hasObservers(), false);
  cleanup();
  cleanup();
});

test("every uncaptured error is forwarded with bounded text and normal event delivery preserved", () => {
  const engine = fixture();
  const messages: string[] = [];
  const cleanup = watchWebGpuValidation(engine, (message) =>
    messages.push(message),
  );
  let otherListenerCalls = 0;
  engine._device!.addEventListener(
    "uncapturederror",
    () => otherListenerCalls++,
  );
  try {
    const longMessage = "shader validation " + "x".repeat(5000);
    const first = emit(engine._device!, { message: longMessage });
    assert.equal(first.unprevented, true);
    assert.equal(first.event.defaultPrevented, false);
    assert.equal(messages[0], longMessage.slice(0, 2000));
    for (let i = 0; i < 100; i++) {
      emit(engine._device!, { message: "same repeated validation failure" });
    }
    emit(engine._device!, { message: 5 });
    emit(engine._device!);
    assert.equal(
      messages.length,
      103,
      "repeated errors must not be rate-limited",
    );
    assert.equal(otherListenerCalls, messages.length);
    assert.equal(messages[101], "Unknown WebGPU uncaptured error");
    assert.equal(messages[102], "Unknown WebGPU uncaptured error");
    assert.ok(messages.every((message) => message.length <= 2000));
  } finally {
    cleanup();
  }
});

test("context restoration replaces the device listener without duplicate callbacks or old-device errors", () => {
  const engine = fixture();
  const oldDevice = engine._device!;
  const messages: string[] = [];
  const cleanup = watchWebGpuValidation(engine, (message) =>
    messages.push(message),
  );
  try {
    emit(oldDevice, { message: "old active" });
    engine._device = new EventTarget();
    engine.onContextRestoredObservable.notifyObservers();
    emit(oldDevice, { message: "old detached" });
    emit(engine._device, { message: "new active" });
    engine.onContextRestoredObservable.notifyObservers();
    emit(engine._device, { message: "same device once" });
    assert.deepEqual(messages, [
      "old active",
      "new active",
      "same device once",
    ]);
  } finally {
    cleanup();
  }
});

test("engine disposal removes the listener and observers without skipping later disposal observers", () => {
  const engine = fixture();
  const device = engine._device!;
  const messages: string[] = [];
  const cleanup = watchWebGpuValidation(engine, (message) =>
    messages.push(message),
  );
  let laterDisposalCalls = 0;
  const other = engine.onDisposeObservable.add(() => laterDisposalCalls++);
  engine.onDisposeObservable.notifyObservers();
  assert.equal(laterDisposalCalls, 1);
  emit(device, { message: "disposed" });
  engine._device = new EventTarget();
  engine.onContextRestoredObservable.notifyObservers();
  emit(engine._device, { message: "must not reattach" });
  cleanup();
  cleanup();
  assert.equal(messages.length, 0);
  other.remove(true);
  assert.equal(engine.onDisposeObservable.hasObservers(), false);
  assert.equal(engine.onContextRestoredObservable.hasObservers(), false);
});

test("manual cleanup and a replayed disposal notification cannot leave a live listener", () => {
  const engine = fixture();
  const messages: string[] = [];
  const cleanup = watchWebGpuValidation(engine, (message) =>
    messages.push(message),
  );
  cleanup();
  engine.onContextRestoredObservable.notifyObservers();
  emit(engine._device!, { message: "after manual cleanup" });
  assert.equal(messages.length, 0);
  assert.equal(engine.onDisposeObservable.hasObservers(), false);
  assert.equal(engine.onContextRestoredObservable.hasObservers(), false);

  const disposed = fixture();
  disposed.onDisposeObservable.notifyIfTriggered = true;
  disposed.onDisposeObservable.notifyObservers();
  const disposeAgain = watchWebGpuValidation(disposed, (message) =>
    messages.push(message),
  );
  emit(disposed._device!, { message: "already disposed" });
  disposeAgain();
  assert.equal(messages.length, 0);
  assert.equal(disposed.onDisposeObservable.hasObservers(), false);
  assert.equal(disposed.onContextRestoredObservable.hasObservers(), false);
});

test("missing initialized device is visible and a restored device becomes monitored", () => {
  const engine = fixture();
  engine._device = undefined;
  const messages: string[] = [];
  const cleanup = watchWebGpuValidation(engine, (message) =>
    messages.push(message),
  );
  try {
    assert.deepEqual(messages, [
      "WebGPU validation monitoring unavailable: no initialized device",
    ]);
    engine._device = new EventTarget();
    engine.onContextRestoredObservable.notifyObservers();
    emit(engine._device, { message: "restored validation failure" });
    assert.equal(messages[1], "restored validation failure");
  } finally {
    cleanup();
  }
});

function pendingLoss() {
  let resolve!: (value: { reason: string; message: string }) => void;
  const promise = new Promise<{ reason: string; message: string }>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test("explicit loss monitoring follows only the current live device and detaches on cleanup", async () => {
  const engine = fixture(),
    first = pendingLoss(),
    second = pendingLoss();
  engine._device = Object.assign(new EventTarget(), { lost: first.promise });
  const losses: string[] = [];
  const cleanup = watchWebGpuValidation(
    engine,
    () => {},
    (message) => losses.push(message),
  );
  engine._device = Object.assign(new EventTarget(), { lost: second.promise });
  engine.onContextRestoredObservable.notifyObservers();
  first.resolve({ reason: "destroyed", message: "retired device" });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(losses.length, 0);
  second.resolve({ reason: "unknown", message: "current device removed" });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(losses.length, 1);
  assert.match(losses[0], /current device removed/);
  cleanup();
  const later = fixture(),
    pending = pendingLoss();
  later._device = Object.assign(new EventTarget(), { lost: pending.promise });
  const stop = watchWebGpuValidation(
    later,
    () => {},
    (message) => losses.push(message),
  );
  stop();
  pending.resolve({ reason: "destroyed", message: "disposed owner" });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(losses.length, 1);
});

test("requesting explicit device-loss monitoring exposes a missing lost Promise", () => {
  const engine = fixture(),
    losses: string[] = [];
  const cleanup = watchWebGpuValidation(
    engine,
    () => {},
    (message) => losses.push(message),
  );
  assert.equal(losses.length, 1);
  assert.match(losses[0], /lost.*unavailable/);
  cleanup();
});
