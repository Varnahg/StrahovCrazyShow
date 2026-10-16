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
    const lost = engine.onContextLostObservable.add(() => {
      if (this.phase === "disposed") return;
      this.phase = "restart-required";
      this.report(
        "device",
        "Grafické zařízení se odpojilo. Spusť 3D scénu znovu.",
      );
    });
    const restored = engine.onContextRestoredObservable.add(() => {
      if (this.phase === "disposed") return;
      this.generation++;
      this.pendingOperations = 0;
      this.phase = "restart-required";
    });
    const disposed = engine.onDisposeObservable.add(() => this.dispose());
    this.cleanups.push(
      () => effect.remove(true),
      () => lost.remove(true),
      () => restored.remove(true),
      () => disposed.remove(true),
      watchWebGpuValidation(engine, (message) =>
        this.report("validation", message),
      ),
    );
    // An observable can replay disposal synchronously while attaching.
    if (this.phase === "disposed") this.detach();
  }

  report(channel: RenderFaultChannel, error: unknown) {
    if (this.phase === "disposed") return;
    const message = (
      error instanceof Error ? error.message : String(error)
    ).slice(0, MAX_MESSAGE);
    const fault = { channel, message, generation: this.generation };
    this.errorCount++;
    this.counts[channel]++;
    if (this.phase !== "restart-required") this.phase = "invalid";
    if (this.firstErrors.length < MAX_ERRORS) this.firstErrors.push(fault);
    this.onFault?.({ ...fault }, this.snapshot());
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
      this.phase !== "disposed" && this.generation === generation;
    if (active()) this.pendingOperations++;
    return operation.then(
      (value) => {
        if (active()) this.pendingOperations--;
        return value;
      },
      (error: unknown) => {
        if (active()) {
          this.pendingOperations--;
          const message =
            error instanceof Error ? error.message : String(error);
          this.report(channel, `${label}: ${message}`);
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
    }
    this.detach();
  }
}
