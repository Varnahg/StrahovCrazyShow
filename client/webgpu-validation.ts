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
