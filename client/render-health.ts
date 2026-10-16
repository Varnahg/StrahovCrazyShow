import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine";
import { watchWebGpuValidation } from "./webgpu-validation";

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
  counts: Record<RenderFaultChannel, number>;
  firstErrors: RenderFault[];
};

let nextRendererId = 1;
const MAX_ERRORS = 5;
const MAX_MESSAGE = 2000;

/** One owner per engine, installed before scene creation. This observes engine
 * errors and explicitly owned async operations, never unrelated page promises.
 * A device loss requires a fresh renderer: rebuilding Babylon resources alone
 * does not repeat this game's validated light/pipeline preparation. */
export class RenderHealth {
  readonly rendererId = nextRendererId++;
  private generation = 1;
  private phase: RenderHealthPhase = "preparing";
  private pendingOperations = 0;
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
    const effect = engine.onEffectErrorObservable.add(({ errors }) =>
      this.report("effect", errors),
    );
    const lost = engine.onContextLostObservable.add(() =>
      this.deviceLost("Grafické zařízení se odpojilo. Spusť 3D scénu znovu."),
    );
    const restored = engine.onContextRestoredObservable.add(() => {
      if (this.phase === "disposed") return;
      this.generation++;
      this.pendingOperations = 0;
      this.phase = "restart-required";
      this.rejectGuards(
        new Error("Grafické zařízení se změnilo. Spusť 3D scénu znovu."),
      );
    });
    const disposed = engine.onDisposeObservable.add(() => this.dispose());
    this.cleanups.push(
      () => effect.remove(true),
      () => lost.remove(true),
      () => restored.remove(true),
      () => disposed.remove(true),
      watchWebGpuValidation(
        engine,
        (message) => this.report("validation", message),
        (message) => this.deviceLost(message),
      ),
    );
    // An observable can replay disposal synchronously while attaching.
    if (this.phase === "disposed") this.detach();
  }

  report(channel: RenderFaultChannel, error: unknown) {
    this.recordFault(channel, error);
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

  private deviceLost(message: string) {
    if (
      this.phase === "disposed" ||
      this.deviceLostGeneration === this.generation
    )
      return;
    this.deviceLostGeneration = this.generation;
    this.phase = "restart-required";
    this.pendingOperations = 0;
    this.recordFault("device", new Error(message));
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
   * uncapturederror. A completion from an old device cannot taint a new one. */
  track<T>(
    operation: Promise<T>,
    channel: "pipeline" | "shader",
    label: string,
  ): Promise<T> {
    const generation = this.generation;
    const active = () =>
      this.phase !== "disposed" &&
      this.phase !== "restart-required" &&
      this.generation === generation;
    if (active()) this.pendingOperations++;
    return operation.then(
      (value) => {
        if (active()) this.pendingOperations--;
        return value;
      },
      (error: unknown) => {
        if (active()) {
          this.pendingOperations--;
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
      this.pendingOperations = 0;
      const error = new Error("Renderer disposed");
      error.name = "AbortError";
      this.rejectGuards(error);
    }
    this.detach();
  }
}
