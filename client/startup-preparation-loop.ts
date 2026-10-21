import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { OnDemandRender } from "./on-demand-render";
import type { RenderHealth } from "./render-health";

export type StartupPreparationHost = {
  requestTask(callback: () => void): number;
  cancelTask(handle: number): void;
  visible(): boolean;
  observeVisibility(callback: () => void): () => void;
  dispose(): void;
};

export type StartupPreparationLoopOptions = {
  signal?: AbortSignal;
  host?: StartupPreparationHost;
};

type SubmissionDevice = {
  pushErrorScope(filter: "validation"): void;
  popErrorScope(): Promise<{ message: string } | null>;
  queue: { onSubmittedWorkDone(): Promise<void> };
};
type Step = {
  begun: boolean;
  scoped: boolean;
  failed: boolean;
  error?: unknown;
};

/** This task source is independent of presentation, not a promise that the
 * browser will run work while frozen. It owns one callback and both ports. */
function browserHost(): StartupPreparationHost {
  const channel = new MessageChannel();
  let sequence = 0, disposed = false;
  let queued: { handle: number; callback: () => void } | undefined;
  channel.port1.onmessage = ({ data }) => {
    const item = queued;
    if (disposed || !item || item.handle !== data) return;
    const callback = item.callback;
    queued = undefined;
    callback();
  };
  return {
    requestTask(callback) {
      if (disposed || queued) throw new Error("Startup task host is unavailable or already queued.");
      const handle = ++sequence;
      queued = { handle, callback };
      try { channel.port2.postMessage(handle); }
      catch (error) { queued = undefined; throw error; }
      return handle;
    },
    cancelTask(handle) { if (queued?.handle === handle) queued = undefined; },
    visible: () => !document.hidden,
    observeVisibility(callback) {
      document.addEventListener("visibilitychange", callback);
      return () => document.removeEventListener("visibilitychange", callback);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      queued = undefined;
      channel.port1.onmessage = null;
      channel.port1.close();
      channel.port2.close();
    },
  };
}

function cancelled() {
  const error = new Error("Startup preparation loop is retired.");
  error.name = "AbortError";
  return error;
}

/** Finite light preparation only. Game stops its preload loop before creating
 * this owner and keeps it through every quality pass and the final gate.
 * No scene, pipeline cache, deadline or engine lifetime is owned here. */
export class StartupPreparationLoop {
  private readonly host: StartupPreparationHost;
  private readonly scheduler: OnDemandRender;
  private readonly generation: number;
  private readonly device?: SubmissionDevice;
  private callback?: () => boolean;
  private current?: Step;
  private disposed = false;
  private cleanups: (() => void)[] = [];
  private finishLifetime!: () => void;
  private lifetime: Promise<void>;
  private pending: Promise<boolean> = Promise.resolve(false);

  constructor(
    private readonly engine: AbstractEngine,
    private readonly health: RenderHealth,
    private readonly options: StartupPreparationLoopOptions = {},
  ) {
    this.host = options.host ?? browserHost();
    this.generation = health.snapshot().generation;
    this.device = engine.isWebGPU
      ? (engine as unknown as { _device?: SubmissionDevice })._device
      : undefined;
    this.scheduler = new OnDemandRender({
      requestFrame: callback => this.host.requestTask(callback),
      cancelFrame: handle => this.host.cancelTask(handle),
      visible: () => !!this.callback && this.usable() && this.host.visible(),
      frame: () => {
        this.pending = this.step();
        return this.pending;
      },
      onError: error => {
        try {
          if (this.usable()) this.health.report("render", error);
        } finally { this.dispose(); }
      },
    });
    this.lifetime = new Promise<void>(resolve => { this.finishLifetime = resolve; });
    // Native device loss need not emit Babylon's context-loss observable.
    // A health guard retires this owner promptly, including while a fence waits.
    void health.guard(this.lifetime).catch(() => this.dispose());
    try {
      this.attach(this.host.observeVisibility(() => this.scheduler.visibilityChanged()));
      const observer = engine.onDisposeObservable.add(() => this.dispose());
      this.attach(() => observer.remove(true));
      if (options.signal) {
        const abort = () => this.dispose();
        options.signal.addEventListener("abort", abort, { once: true });
        this.attach(() => options.signal!.removeEventListener("abort", abort));
      }
      if (!this.usable()) this.dispose();
      if (engine.isWebGPU && (!this.device?.pushErrorScope || !this.device.popErrorScope ||
          !this.device.queue?.onSubmittedWorkDone))
        throw new Error("Startup preparation submission validation is unavailable.");
    } catch (error) { this.dispose(); throw error; }
  }

  private attach(cleanup: () => void) {
    if (this.disposed) cleanup();
    else this.cleanups.push(cleanup);
  }

  private usable() {
    const state = this.health.snapshot();
    return !this.disposed && !this.options.signal?.aborted && !this.engine.isDisposed &&
      state.generation === this.generation && state.errorCount === 0 &&
      (state.phase === "preparing" || state.phase === "ready");
  }

  run(callback: () => boolean) {
    if (!this.usable()) throw cancelled();
    if (this.callback && this.callback !== callback)
      throw new Error("A different startup preparation callback is already owned.");
    this.callback = callback;
    this.scheduler.request();
  }

  stop(callback: () => boolean) {
    if (this.callback !== callback) return;
    this.callback = undefined;
    // Cancels queued tasks, not the healthy frame already executing. A later
    // run still waits for this same scheduler's in-flight submission.
    this.scheduler.visibilityChanged();
  }

  /** The final light tick resolves its parent's result before its frame fence.
   * The separate submitted-frame gate must await this barrier first. */
  async waitForIdle(): Promise<void> {
    if (!this.usable()) throw cancelled();
    if (this.current || this.callback)
      throw new Error("Stop startup preparation before awaiting its idle barrier.");
    await this.health.guard(Promise.race([
      this.pending,
      this.lifetime.then(() => { throw cancelled(); }),
    ]));
    if (!this.usable()) throw cancelled();
  }

  render(work: () => void) {
    const step = this.current;
    if (!step || step.begun || step.failed)
      throw new Error("A startup draw must belong to one synchronous preparation tick.");
    if (!this.usable() || !this.host.visible()) throw cancelled();
    try {
      if (this.device) {
        this.device.pushErrorScope("validation");
        step.scoped = true;
      }
      this.engine.beginFrame();
      step.begun = true;
      if (!this.usable()) throw cancelled();
      work();
    } catch (error) {
      step.failed = true;
      step.error = error;
      throw error;
    }
  }

  private async step(): Promise<boolean> {
    const callback = this.callback;
    if (!callback || !this.usable() || !this.host.visible()) return false;
    const step: Step = { begun: false, scoped: false, failed: false };
    this.current = step;
    let accepted = false, submitted = false, failure: unknown, failed = false;
    let validation: Promise<{ message: string } | null> = Promise.resolve(null);
    const capture = (error: unknown) => { if (!failed) { failed = true; failure = error; } };
    try {
      accepted = callback();
      if (typeof accepted !== "boolean") throw new Error("Startup tick did not return a synchronous submit verdict.");
      // The light state machine catches draw/begin exceptions and returns a
      // false status. Preserve this owner's actual throw before status-only
      // retirement; a falsy thrown value still has failed=true.
      if (step.failed) throw step.error;
      if (!accepted) this.dispose();
      else {
        if (step.begun && this.usable()) {
          this.engine.endFrame();
          submitted = true;
        }
      }
    } catch (error) { capture(step.failed ? step.error : error); }
    finally {
      this.current = undefined;
      if (step.scoped) {
        try { validation = this.device!.popErrorScope(); }
        catch (error) { capture(error); }
      }
    }
    // Close and consume every opened scope, even after a swallowed false verdict
    // or a synchronous exception. No engine frame crosses this await boundary.
    const checked = step.scoped ? this.health.track(validation.then(error => {
      if (error) throw new Error(error.message);
    }), "pipeline", "startup preparation validation") : Promise.resolve();
    void checked.catch(() => {});
    if (failed) throw failure;
    if (!accepted || !this.usable()) return false;
    let fence: Promise<void> = Promise.resolve();
    if (submitted && this.device) {
      let operation: Promise<void>;
      try { operation = this.device.queue.onSubmittedWorkDone(); }
      catch (error) { operation = Promise.reject(error); }
      fence = this.health.track(operation, "pipeline", "startup preparation queue submission");
    }
    await this.health.guard(Promise.all([checked, fence]));
    return !!this.callback && this.usable();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.callback = undefined;
    const errors: unknown[] = [];
    for (const cleanup of [() => this.scheduler.dispose(), () => this.finishLifetime(),
      ...this.cleanups.splice(0), () => this.host.dispose()]) {
      try { cleanup(); } catch (error) { errors.push(error); }
    }
    const state = this.health.snapshot();
    if (errors.length && state.generation === this.generation && state.errorCount === 0 &&
        (state.phase === "preparing" || state.phase === "ready")) {
      // Disposal is also called from observers and promise rejection handlers;
      // a diagnostic callback must not prevent the remaining owner cleanup.
      try { this.health.report("render", new AggregateError(errors, "Startup task cleanup failed.")); }
      catch { /* RenderHealth already retained the fault before notifying. */ }
    }
  }
}
