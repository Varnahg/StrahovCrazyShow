import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { watchWebGpuQueryReadErrors, watchWebGpuValidation } from "./webgpu-validation";

export type RenderFaultChannel =
  | "effect"
  | "shader"
  | "pipeline"
  | "validation"
  | "texture"
  | "device"
  | "render";
export type RenderHealthPhase =
  "preparing" | "ready" | "invalid" | "restart-required" | "disposed";
/** Only shader diagnostic messages may overlap preparation stages. Neither kind
 * can remain pending when the renderer is finally accepted as ready. */
export type RenderOperationKind = "preparation" | "shader-validation";
export type RenderFault = {
  channel: RenderFaultChannel;
  message: string;
  generation: number;
};
export type RenderHealthSnapshot = {
  rendererId: number;
  purpose: "game" | "preview";
  generation: number;
  phase: RenderHealthPhase;
  valid: boolean;
  errorCount: number;
  pendingOperations: number;
  pendingPreparationOperations: number;
  pendingShaderValidationOperations: number;
  counts: Record<RenderFaultChannel, number>;
  firstErrors: RenderFault[];
};

let nextRendererId = 1;
const MAX_ERRORS = 5;
const MAX_MESSAGE = 2000;
const owners = new WeakMap<AbstractEngine, RenderHealth>();

/** One owner per engine, installed before scene creation. This observes engine
 * errors and explicitly owned async operations, never unrelated page promises.
 * A device loss requires a fresh renderer: rebuilding Babylon resources alone
 * does not repeat this game's validated light/pipeline preparation. */
export class RenderHealth {
  readonly rendererId = nextRendererId++;
  private generation = 1;
  private phase: RenderHealthPhase = "preparing";
  private readonly pendingByKind: Record<RenderOperationKind, number> = {
    preparation: 0,
    "shader-validation": 0,
  };
  private errorCount = 0;
  private counts: Record<RenderFaultChannel, number> = {
    effect: 0,
    shader: 0,
    pipeline: 0,
    validation: 0,
    texture: 0,
    device: 0,
    render: 0,
  };
  private firstErrors: RenderFault[] = [];
  private cleanups: (() => void)[] = [];
  private guards = new Set<(reason: unknown) => void>();
  private terminalReason: unknown;
  private deviceLostGeneration: number | undefined;

  constructor(
    engine: AbstractEngine,
    readonly purpose: "game" | "preview",
    private readonly onFault?: (
      fault: RenderFault,
      health: RenderHealthSnapshot,
    ) => void,
  ) {
    if (owners.has(engine))
      throw new Error("This engine already has a render health owner.");
    owners.set(engine, this);
    this.cleanups.push(() => {
      if (owners.get(engine) === this) owners.delete(engine);
    });
    const effect = engine.onEffectErrorObservable.add(({ errors }) =>
      this.report("effect", errors),
    );
    const lost = engine.onContextLostObservable.add(() =>
      this.deviceLost("Grafické zařízení se odpojilo. Spusť 3D scénu znovu."),
    );
    const restored = engine.onContextRestoredObservable.add(() =>
      this.deviceLost("Grafické zařízení se změnilo. Spusť 3D scénu znovu.", true),
    );
    const disposed = engine.onDisposeObservable.add(() => this.dispose());
    this.cleanups.push(
      () => effect.remove(true),
      () => lost.remove(true),
      () => restored.remove(true),
      () => disposed.remove(true),
      watchWebGpuQueryReadErrors(
        engine,
        (error, source) => this.recordFault("render", error, `GPU query ${source}`),
        (error) => this.report("render", error),
      ),
      watchWebGpuValidation(
        engine,
        (message) => this.report("validation", message),
        (message) => this.deviceLost(message),
      ),
    );
    // An observable can replay disposal synchronously while attaching.
    if (this.phase === "disposed") this.detach();
    else this.observeFrame(engine);
  }

  /** Pinned AbstractEngine calls begin/render/end inside this synchronous
   * boundary. A throw aborts its normal queueing; never repair/flush the frame.
   * Manual preview draw failures are caught by their owning scheduler; the
   * endFrame veto also prevents its finalizer from submitting after a fault. */
  private observeFrame(engine: AbstractEngine) {
    this.observeFrameMethod(engine, "_processFrame");
    this.observeFrameMethod(engine, "endFrame");
  }

  private observeFrameMethod(engine: AbstractEngine, method: "_processFrame" | "endFrame") {
    if (this.phase === "disposed") return;
    try {
      const own = Object.getOwnPropertyDescriptor(engine, method);
      let descriptor = own;
      let prototype = Object.getPrototypeOf(engine);
      while (!descriptor && prototype) {
        descriptor = Object.getOwnPropertyDescriptor(prototype, method);
        prototype = Object.getPrototypeOf(prototype);
      }
      // Do not invoke an accessor merely to discover an observable method.
      const original: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
      if (typeof original !== "function") throw new Error("Missing frame method");
      const owner = this;
      const wrapper = function (this: unknown) {
        if (this !== engine || owner.phase === "disposed")
          return Reflect.apply(original, this, arguments);
        // stopRenderLoop cannot recall a callback already selected by the
        // host. A fault reported synchronously inside a callback must also
        // veto Babylon's following endFrame, even if that callback returns.
        if (owner.phase === "invalid" || owner.phase === "restart-required") return;
        if (method === "endFrame") return Reflect.apply(original, this, arguments);
        const generation = owner.generation, beforeErrors = owner.errorCount;
        try {
          // Do not inspect returns, including Promise/thenable values. No
          // snapshot, token object or argument-array copy in this hot path.
          return Reflect.apply(original, this, arguments);
        } catch (error) {
          try {
            owner.frameFailed(generation, beforeErrors, error);
          } finally {
            // A failing reporter must never replace the original exception.
            throw error;
          }
        }
      };
      Object.defineProperty(engine, method, own
        ? { ...own, value: wrapper }
        : { value: wrapper, configurable: true, writable: true, enumerable: false });
      this.cleanups.push(() => {
        if (Object.getOwnPropertyDescriptor(engine, method)?.value !== wrapper) return;
        if (own) Object.defineProperty(engine, method, own);
        else Reflect.deleteProperty(engine, method);
      });
    } catch {
      this.report("render", new Error(`Engine frame failure monitoring is unavailable (${method}).`));
    }
  }

  private frameFailed(generation: number, beforeErrors: number, error: unknown) {
    // A nested pipeline/submit hook may already have reported it. Re-read
    // mutable lifecycle state after the original call, which can dispose or
    // restore the renderer synchronously while unwinding the same frame.
    if (this.phase !== "disposed" && this.generation === generation &&
        this.errorCount === beforeErrors)
      this.recordFault("render", error);
  }

  report(channel: RenderFaultChannel, error: unknown) {
    this.recordFault(channel, error);
  }

  private get pendingOperations() {
    return (
      this.pendingByKind.preparation + this.pendingByKind["shader-validation"]
    );
  }

  private resetPendingOperations() {
    this.pendingByKind.preparation = 0;
    this.pendingByKind["shader-validation"] = 0;
  }

  private recordFault(
    channel: RenderFaultChannel,
    error: unknown,
    label?: string,
  ) {
    if (this.phase === "disposed") return;
    const detail = error instanceof Error ? error.message : String(error);
    const message = (label ? `${label}: ${detail}` : detail).slice(
      0,
      MAX_MESSAGE,
    );
    const fault = { channel, message, generation: this.generation };
    this.errorCount++;
    this.counts[channel]++;
    if (this.phase !== "restart-required") this.phase = "invalid";
    if (this.firstErrors.length < MAX_ERRORS) this.firstErrors.push(fault);
    // Preserve the operation's original rejection, even when its report reaches
    // a guard before the tracked promise's rejection microtask does.
    if (this.errorCount === 1) this.terminalReason = error;
    this.rejectGuards(this.terminalReason);
    this.onFault?.({ ...fault }, this.snapshot());
  }

  private deviceLost(message: string, restored = false) {
    if (this.phase === "disposed") return;
    if (restored) this.generation++;
    if (this.deviceLostGeneration === this.generation) return;
    this.deviceLostGeneration = this.generation;
    this.phase = "restart-required";
    this.resetPendingOperations();
    const error = new Error(message);
    // Restoration starts a new epoch and must notify its owner even if no
    // preceding loss event was delivered. Preserve its own guard reason.
    if (restored) this.terminalReason = error;
    this.recordFault("device", error);
  }

  private rejectGuards(reason: unknown) {
    this.terminalReason = reason;
    for (const reject of this.guards) reject(reason);
    this.guards.clear();
  }

  /** Stops awaiting promptly when this renderer becomes unusable. This does
   * not cancel the operation: its caller still owns abort and late cleanup. */
  guard<T>(operation: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const generation = this.generation;
      const fail = (reason: unknown) => {
        this.guards.delete(fail);
        reject(reason);
      };
      const usable = () =>
        this.generation === generation &&
        (this.phase === "preparing" || this.phase === "ready");
      this.guards.add(fail);
      // Always consume the owned operation, including after a prior fault.
      operation.then((value) => {
        this.guards.delete(fail);
        if (usable()) resolve(value);
        else reject(this.terminalReason);
      }, fail);
      if (!usable()) fail(this.terminalReason);
    });
  }

  /** The caller still awaits/catches this result. Rejection identity is kept;
   * async pipeline failures need this path because they need not emit a device
   * uncapturederror. A completion from an old device cannot taint a new one.
   * Operation kind is explicit: a shared error channel or label cannot classify
   * diagnostic-only work. Default preparation preserves existing callers. */
  track<T>(
    operation: Promise<T>,
    channel: "pipeline" | "shader",
    label: string,
    kind: RenderOperationKind = "preparation",
  ): Promise<T> {
    const generation = this.generation;
    const active = () =>
      this.phase !== "disposed" &&
      this.phase !== "restart-required" &&
      this.generation === generation;
    if (active()) this.pendingByKind[kind]++;
    return operation.then(
      (value) => {
        if (active()) this.pendingByKind[kind]--;
        return value;
      },
      (error: unknown) => {
        if (active()) {
          this.pendingByKind[kind]--;
          try {
            this.recordFault(channel, error, label);
          } finally {
            // A diagnostic callback must not replace the operation's error.
            throw error;
          }
        }
        throw error;
      },
    );
  }

  /** Call only after the real preparation and a submitted successful frame. */
  markReady() {
    if (this.phase !== "preparing" || this.errorCount || this.pendingOperations)
      return false;
    this.phase = "ready";
    return true;
  }

  snapshot(): RenderHealthSnapshot {
    return {
      rendererId: this.rendererId,
      purpose: this.purpose,
      generation: this.generation,
      phase: this.phase,
      valid:
        this.phase === "ready" &&
        this.errorCount === 0 &&
        this.pendingOperations === 0,
      errorCount: this.errorCount,
      pendingOperations: this.pendingOperations,
      pendingPreparationOperations: this.pendingByKind.preparation,
      pendingShaderValidationOperations: this.pendingByKind["shader-validation"],
      counts: { ...this.counts },
      firstErrors: this.firstErrors.map((fault) => ({ ...fault })),
    };
  }

  private detach() {
    for (const cleanup of this.cleanups.splice(0)) cleanup();
  }

  dispose() {
    if (this.phase !== "disposed") {
      this.phase = "disposed";
      this.resetPendingOperations();
      const error = new Error("Renderer disposed");
      error.name = "AbortError";
      this.rejectGuards(error);
    }
    this.detach();
  }
}
