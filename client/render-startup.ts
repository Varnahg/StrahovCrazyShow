import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { OnDemandRender } from "./on-demand-render";
import type { RenderHealth, RenderHealthSnapshot } from "./render-health";

export type RenderStartupHost = {
  requestFrame(callback: () => void): number;
  cancelFrame(handle: number): void;
  visible(): boolean;
  now(): number;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(handle: number): void;
  observeVisibility(callback: () => void): () => void;
};
export type RenderStartupOptions = {
  engine: AbstractEngine;
  health: RenderHealth;
  render(): void;
  /** Must inspect the actual scene/active meshes; a submitted empty pass is not ready. */
  isReady(): boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Explicit final-view revalidation of the same already-ready renderer.
   * All submission/readiness gates remain; only the initial state transition
   * is not performed twice. The caller owns the remaining original budget. */
  revalidate?: Pick<RenderHealthSnapshot, "rendererId" | "generation">;
};
type SubmissionDevice = {
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<{ message: string } | null>;
  queue: { onSubmittedWorkDone(): Promise<void> };
};

const browserHost: RenderStartupHost = {
  requestFrame: (callback) => requestAnimationFrame(callback),
  cancelFrame: (handle) => cancelAnimationFrame(handle),
  visible: () => !document.hidden,
  now: () => performance.now(),
  setTimer: (callback, delay) => window.setTimeout(callback, delay),
  clearTimer: (handle) => window.clearTimeout(handle),
  observeVisibility(callback) {
    document.addEventListener("visibilitychange", callback);
    return () => document.removeEventListener("visibilitychange", callback);
  },
};

function aborted() {
  const error = new Error("Renderer startup cancelled");
  error.name = "AbortError";
  return error;
}

/** The caller stops its preparation loop before entering this gate, and starts
 * its gameplay loop only after success. This owns no engine/scene resources.
 * Queue completion proves submission, not shader readiness: both scene readiness
 * and the owner's tracked module/pipeline validation must also be complete. */
export function waitForRenderStartup(
  options: RenderStartupOptions,
  host: RenderStartupHost = browserHost,
): Promise<void> {
  const { engine, health, signal } = options;
  const timeoutMs = options.timeoutMs ?? 30_000;
  let finished = false;
  let timer: number | undefined;
  let visibleElapsed = 0;
  let visibleSince: number | undefined = host.visible()
    ? host.now()
    : undefined;
  let unobserveVisibility = () => {};
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const completion = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  const remaining = () =>
    timeoutMs -
    visibleElapsed -
    (visibleSince === undefined ? 0 : Math.max(0, host.now() - visibleSince));
  const ensureActive = () => {
    if (finished || signal?.aborted) throw aborted();
    // A fault may arrive in the microtask between guard settlement and this
    // continuation. The outer guard retains its original rejection identity.
    const state = health.snapshot(), phase = state.phase;
    if (options.revalidate && (state.rendererId !== options.revalidate.rendererId || state.generation !== options.revalidate.generation || phase !== "ready"))
      throw new Error("Startup view renderer generation is no longer ready");
    if (phase === "disposed") throw aborted();
    if (phase !== "preparing" && phase !== "ready")
      throw new Error("Renderer is no longer usable");
    if (remaining() <= 0) {
      const error = new Error(
        "Renderer startup exceeded its visible-time deadline",
      );
      error.name = "RenderStartupTimeoutError";
      throw error;
    }
  };
  const clearTimer = () => {
    if (timer !== undefined) host.clearTimer(timer);
    timer = undefined;
  };
  const fail = (error: unknown) => {
    if (finished) return;
    finished = true;
    const state = health.snapshot();
    // Cancellation is an ownership change, not a broken shader or submission.
    try {
      if (
        !(error instanceof Error && error.name === "AbortError") &&
        state.errorCount === 0 &&
        (state.phase === "preparing" || state.phase === "ready")
      )
        health.report("render", error);
    } catch {
      // Diagnostic observers cannot replace the frame's original failure.
    } finally {
      reject(error);
    }
  };
  const armTimer = () => {
    clearTimer();
    if (finished || !host.visible()) return;
    timer = host.setTimer(
      () => {
        timer = undefined;
        try {
          ensureActive();
          armTimer();
        } catch (error) {
          fail(error);
        }
      },
      Math.max(0, remaining()),
    );
  };
  const onAbort = () => fail(aborted());
  const frame = async () => {
    ensureActive();
    await health.guard(Promise.resolve());
    ensureActive();
    if (!host.visible()) return true;
    const beforeReady = options.isReady();
    await health.guard(Promise.resolve());
    ensureActive();
    if (!host.visible()) return true;
    const device = engine.isWebGPU
      ? (engine as unknown as { _device?: SubmissionDevice })._device
      : undefined;
    if (
      engine.isWebGPU &&
      (!device?.pushErrorScope ||
        !device.popErrorScope ||
        !device.queue?.onSubmittedWorkDone)
    )
      throw new Error("WebGPU startup submission validation unavailable");

    let begun = false,
      scoped = false,
      hasError = false,
      frameError: unknown;
    let validation: Promise<{ message: string } | null> = Promise.resolve(null);
    const capture = (error: unknown) => {
      if (!hasError) {
        hasError = true;
        frameError = error;
      }
    };
    try {
      if (device) {
        device.pushErrorScope("validation");
        scoped = true;
      }
      engine.beginFrame();
      begun = true;
      ensureActive();
      options.render();
    } catch (error) {
      capture(error);
    } finally {
      const phase = health.snapshot().phase;
      if (begun && !hasError && !finished && !signal?.aborted &&
          (phase === "preparing" || phase === "ready")) {
        try {
          engine.endFrame();
        } catch (error) {
          capture(error);
        }
      }
      if (scoped) {
        try {
          validation = device!.popErrorScope();
        } catch (error) {
          capture(error);
        }
      }
    }
    // Consume every scope result even if a synchronous render already failed.
    const checked = validation.then((error) => {
      if (error) {
        const failure = new Error(error.message);
        if (!finished && health.snapshot().phase !== "disposed")
          health.report("validation", failure);
        throw failure;
      }
    });
    void checked.catch(() => {});
    if (hasError) {
      // The scope is now closed and consumed. Settle the first synchronous
      // failure before an already fulfilled validation result gets a microtask.
      fail(frameError);
      throw frameError;
    }
    ensureActive();
    await health.guard(Promise.resolve());
    ensureActive();
    // The outer guard rejects the whole gate on a renderer fault. Keeping a
    // second long-lived guard here would retain a waiter after caller abort.
    await Promise.all([checked, device?.queue.onSubmittedWorkDone()]);
    // A synchronous render stall can exceed the deadline before the timer task
    // gets a turn. Promise completion must never win that race and report ready.
    ensureActive();
    if (!host.visible()) return true;
    const afterReady = options.isReady();
    ensureActive();
    const state = health.snapshot();
    if (!beforeReady || !afterReady || state.pendingOperations !== 0)
      return true;
    if (options.revalidate ? !state.valid : !health.markReady())
      throw new Error("Renderer cannot enter ready state");
    finished = true;
    resolve();
    return false;
  };
  const scheduler = new OnDemandRender({
    requestFrame: (callback) => host.requestFrame(callback),
    cancelFrame: (handle) => host.cancelFrame(handle),
    visible: () => host.visible(),
    frame,
    onError: fail,
  });
  const guarded = health.guard(completion);
  try {
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
      throw new RangeError(
        "Renderer startup timeout must be positive and finite",
      );
    signal?.addEventListener("abort", onAbort, { once: true });
    unobserveVisibility = host.observeVisibility(() => {
      const now = host.now();
      if (visibleSince !== undefined)
        visibleElapsed += Math.max(0, now - visibleSince);
      visibleSince = host.visible() ? now : undefined;
      armTimer();
      scheduler.visibilityChanged();
    });
    ensureActive();
    armTimer();
    scheduler.request();
  } catch (error) {
    fail(error);
  }
  // Fault/disposal can reject while a queue or compilation promise is pending.
  // Settle our owned completion as well, releasing the health guard's handlers.
  return guarded
    .catch((error: unknown) => {
      fail(error);
      throw error;
    })
    .finally(() => {
      finished = true;
      scheduler.dispose();
      clearTimer();
      unobserveVisibility();
      signal?.removeEventListener("abort", onAbort);
    });
}
