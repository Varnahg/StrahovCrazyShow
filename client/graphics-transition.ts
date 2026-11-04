import type { GraphicsApplicationState } from "../shared/render-quality";

export type GraphicsClock = {
  now(): number;
  visible(): boolean;
  observeVisibility(callback: () => void): () => void;
  setTimer(callback: () => void, milliseconds: number): unknown;
  clearTimer(handle: unknown): void;
};

export const browserGraphicsClock: GraphicsClock = {
  now: () => performance.now(),
  visible: () => !document.hidden,
  observeVisibility(callback) {
    document.addEventListener("visibilitychange", callback);
    return () => document.removeEventListener("visibilitychange", callback);
  },
  setTimer: (callback, milliseconds) => setTimeout(callback, milliseconds),
  clearTimer: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

const cancelled = () => new DOMException("Změna grafiky byla zrušena.", "AbortError");
const expired = () => Object.assign(new Error("Příprava grafiky překročila časový limit."), { name: "GraphicsTimeoutError" });

/** A visible-time deadline; hiding the tab never spends preparation budget. */
class GraphicsBudget {
  readonly controller = new AbortController();
  private elapsed = 0;
  private since: number | undefined;
  private timer: unknown;
  private unobserve: () => void;
  private unparent = () => {};
  constructor(private clock: GraphicsClock, private limit: number, parent?: AbortSignal) {
    this.since = clock.visible() ? clock.now() : undefined;
    this.unobserve = clock.observeVisibility(() => {
      if (this.since !== undefined) this.elapsed += Math.max(0, clock.now() - this.since);
      this.since = clock.visible() ? clock.now() : undefined;
      this.arm();
    });
    if (parent) {
      const abort = () => this.controller.abort(parent.reason);
      parent.addEventListener("abort", abort, { once: true });
      this.unparent = () => parent.removeEventListener("abort", abort);
      if (parent.aborted) abort();
    }
    this.arm();
  }
  remaining = () => Math.max(0, this.limit - this.elapsed - (this.since === undefined ? 0 : Math.max(0, this.clock.now() - this.since)));
  private arm() {
    this.clock.clearTimer(this.timer);
    if (this.controller.signal.aborted || this.since === undefined) return;
    this.timer = this.clock.setTimer(() => this.controller.abort(expired()), this.remaining());
  }
  dispose() { this.clock.clearTimer(this.timer); this.unobserve(); this.unparent(); }
}

/** Observe late failure as well as cancellation; never publish a late result. */
export function graphicsOperation<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(signal.reason ?? cancelled()); };
    signal.addEventListener("abort", abort, { once: true });
    operation.then(value => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(signal.reason ?? cancelled()); else resolve(value);
    }, error => { signal.removeEventListener("abort", abort); reject(error); });
    if (signal.aborted) abort();
  });
}

export type GraphicsTransitionHost<T> = {
  prepare(value: T, signal: AbortSignal, remaining: () => number, restoring: boolean): Promise<void>;
  commit(value: T): void;
  publish(state: GraphicsApplicationState): void;
  retired(): boolean;
  canRestore(): boolean;
  /** Auto may prepare its three existing qualities; one manual target has 60s. */
  targetBudget(value: T): number;
  clock?: GraphicsClock;
};
type ActiveGraphicsTransition = { overall: GraphicsBudget; phase?: GraphicsBudget; restoring: boolean };

/** One settings transaction. It owns no scene and never rewinds game/network state. */
export class GraphicsTransition<T> {
  private active?: ActiveGraphicsTransition;
  private disposed = false;
  constructor(private readonly host: GraphicsTransitionHost<T>) {}
  cancel() { if (this.active && !this.active.restoring) this.active.phase?.controller.abort(cancelled()); }
  dispose() { this.disposed = true; this.active?.overall.controller.abort(cancelled()); }
  async apply(previous: T, next: T): Promise<boolean> {
    if (this.active || this.disposed || this.host.retired()) return false;
    const clock = this.host.clock ?? browserGraphicsClock;
    const overall = new GraphicsBudget(clock, 180_000);
    const active: ActiveGraphicsTransition = { overall, restoring: false };
    this.active = active;
    let error: string | null = null, restartRequired = false;
    const prepare = async (value: T, restoring: boolean) => {
      active.restoring = restoring;
      active.phase = new GraphicsBudget(clock, Math.min(restoring ? 60_000 : this.host.targetBudget(value), overall.remaining()), overall.controller.signal);
      const { signal } = active.phase.controller;
      try {
        this.host.publish({ applying: true, phase: restoring ? "restoring" : "preparing", error: null, restartRequired: false });
        signal.throwIfAborted();
        if (active.phase.remaining() <= 0) throw expired();
        await graphicsOperation(this.host.prepare(value, signal, active.phase.remaining, restoring), signal);
        signal.throwIfAborted();
        if (active.phase.remaining() <= 0) throw expired();
        if (this.disposed || this.host.retired()) throw cancelled();
        if (!this.host.canRestore()) throw new Error("Renderer vyžaduje nové spuštění.");
      } finally { active.phase.dispose(); active.phase = undefined; }
    };
    try {
      await prepare(next, false);
      this.host.commit(next);
      return true;
    } catch (failure) {
      if (!this.disposed && !this.host.retired()) {
        error = failure instanceof Error ? failure.message : String(failure);
        if (this.host.canRestore() && overall.remaining() > 0 && !overall.controller.signal.aborted) {
          try { await prepare(previous, true); }
          catch (restoreFailure) { error = "Původní grafiku se nepodařilo obnovit: " + String(restoreFailure); restartRequired = true; }
        } else restartRequired = true;
      }
      return false;
    } finally {
      overall.dispose();
      this.active = undefined;
      this.host.publish({ applying: false, phase: null, error, restartRequired });
    }
  }
}
