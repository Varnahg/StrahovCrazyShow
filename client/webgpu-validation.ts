type LifecycleObserver = { remove(defer?: boolean): void };
type LifecycleObservable = {
  add(callback: () => void): LifecycleObserver;
};

/** Babylon 9.30 exposes _device as a public @internal field. Keep this adapter
 * structural so observing errors does not import or initialize a GPU engine. */
export type WebGpuValidationEngine = {
  readonly isWebGPU: boolean;
  readonly _device?: Pick<
    EventTarget,
    "addEventListener" | "removeEventListener"
  > & {
    readonly lost?: PromiseLike<{
      readonly message: string;
      readonly reason: string;
    }>;
  };
  readonly onDisposeObservable: LifecycleObservable;
  readonly onContextRestoredObservable: LifecycleObservable;
};

const MAX_MESSAGE_LENGTH = 2000;

export type WebGpuQueryReadErrorSource = "timestamp-frame" | "timestamp-pass" | "occlusion";
type QueryReadErrorEvent = { error: unknown; source: WebGpuQueryReadErrorSource };
type QueryReadErrorObservable = {
  add(callback: (event: QueryReadErrorEvent) => void): LifecycleObserver | null;
};
type QueryReadErrorEngine = Pick<WebGpuValidationEngine, "isWebGPU" | "onDisposeObservable"> & {
  readonly onQueryReadErrorObservable?: unknown;
};

/** A missing native producer cannot count as a healthy zero-error WebGPU run.
 * Kept separate from GPU validation/device-loss so its original error is kept. */
export function watchWebGpuQueryReadErrors(
  engine: QueryReadErrorEngine,
  callback: (error: unknown, source: WebGpuQueryReadErrorSource) => void,
  unavailable: (error: Error) => void,
): () => void {
  if (!engine.isWebGPU) return () => {};
  let active = true, unavailableReported = false;
  let queryObserver: LifecycleObserver | null | undefined;
  let disposeObserver: LifecycleObserver | undefined;
  const fail = () => {
    if (!active || unavailableReported) return;
    unavailableReported = true;
    unavailable(new Error("WebGPU query read error monitoring unavailable."));
  };
  const cleanup = () => {
    if (!active) return;
    active = false;
    // Attempt both removals even if an incompatible producer throws on one.
    try { queryObserver?.remove(true); } catch {}
    try { disposeObserver?.remove(true); } catch {}
  };
  try {
    const observable = engine.onQueryReadErrorObservable as QueryReadErrorObservable | undefined;
    if (!observable || typeof observable.add !== "function") { fail(); cleanup(); return cleanup; }
    queryObserver = observable.add((event) => {
      if (!active) return;
      let error: unknown, source: unknown;
      try {
        const errorSlot = event && Object.getOwnPropertyDescriptor(event, "error");
        const sourceSlot = event && Object.getOwnPropertyDescriptor(event, "source");
        if (!errorSlot || !("value" in errorSlot) || !sourceSlot || !("value" in sourceSlot)) { fail(); return; }
        error = errorSlot.value;
        source = sourceSlot.value;
      } catch { fail(); return; }
      if (source !== "timestamp-frame" && source !== "timestamp-pass" && source !== "occlusion") { fail(); return; }
      callback(error, source);
    });
    if (!queryObserver || typeof queryObserver.remove !== "function") { fail(); cleanup(); return cleanup; }
    disposeObserver = engine.onDisposeObservable.add(cleanup);
    if (!active) {
      queryObserver.remove(true);
      disposeObserver.remove(true);
    }
  } catch { fail(); cleanup(); }
  return cleanup;
}

/** Attach after engine initialization and before scene/resource creation.
 * Every delivered error reaches the callback, including repeated errors; the
 * caller may bound diagnostic logs while still counting every error.
 * This only observes errors not handled by an explicit GPU error scope. */
export function watchWebGpuValidation(
  engine: WebGpuValidationEngine,
  callback: (message: string) => void,
  onDeviceLost?: (message: string) => void,
): () => void {
  if (!engine.isWebGPU) return () => {};

  let active = true;
  let device: WebGpuValidationEngine["_device"];
  let disposeObserver: LifecycleObserver | undefined;
  let restoreObserver: LifecycleObserver | undefined;
  const onError: EventListener = (event) => {
    if (!active) return;
    const error = (event as Event & { error?: { message?: unknown } }).error;
    const message =
      typeof error?.message === "string" && error.message.length > 0
        ? error.message
        : "Unknown WebGPU uncaptured error";
    callback(message.slice(0, MAX_MESSAGE_LENGTH));
  };
  const detachDevice = () => {
    device?.removeEventListener("uncapturederror", onError);
    device = undefined;
  };
  const bindDevice = () => {
    if (!active) return;
    const next = engine._device;
    if (next && next === device) return;
    detachDevice();
    device = next;
    if (device) {
      device.addEventListener("uncapturederror", onError);
      if (onDeviceLost) {
        const current = device;
        const deliverLoss = (message: string) => {
          if (active && device === current && engine._device === current)
            onDeviceLost(message.slice(0, MAX_MESSAGE_LENGTH));
        };
        if (current.lost && typeof current.lost.then === "function") {
          void Promise.resolve(current.lost).then(
            (info) =>
              deliverLoss(
                `WebGPU device lost (${info.reason}): ${info.message}`,
              ),
            (error: unknown) =>
              deliverLoss(
                `WebGPU device lost monitoring failed: ${String(error)}`,
              ),
          );
        } else {
          deliverLoss(
            "WebGPU device lost monitoring unavailable: no device.lost Promise",
          );
        }
      }
    } else {
      // A zero-error benchmark must not silently mean no monitor was attached.
      callback(
        "WebGPU validation monitoring unavailable: no initialized device",
      );
    }
  };
  const dispose = () => {
    if (!active) return;
    active = false;
    detachDevice();
    // Deferred removal also preserves later observers when called from the
    // engine's own disposal notification.
    disposeObserver?.remove(true);
    restoreObserver?.remove(true);
  };
  disposeObserver = engine.onDisposeObservable.add(dispose);
  restoreObserver = engine.onContextRestoredObservable.add(bindDevice);
  if (active) {
    bindDevice();
  } else {
    // Babylon observables can synchronously replay an earlier notification.
    disposeObserver.remove(true);
    restoreObserver.remove(true);
  }
  return dispose;
}
