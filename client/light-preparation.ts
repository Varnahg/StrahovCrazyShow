/** Startup-only preparation of actual scene variants. No physics or input. */
export type LightPreparationStage =
  | "current-off"
  | "current-on"
  | `night-${0 | 1 | 2}-${"off" | "on"}`
  | "restore";
export type LightPreparationResult = {
  status: "complete" | "timeout" | "disposed" | "failed";
  elapsedMs: number;
  failureStep:
    | "apply"
    | "meshes"
    | "check"
    | "effects"
    | "render"
    | "restore"
    | "cleanup"
    | "lifecycle"
    | null;
  stages: {
    stage: LightPreparationStage;
    elapsedMs: number;
    checks: number;
    renders: number;
    restarts: number;
  }[];
};
type ReadyMesh = {
  isDisposed(): boolean;
  isEnabled(): boolean;
  isVisible: boolean;
  isReady(completeCheck: boolean): boolean;
};
export type LightPreparationOptions = {
  apply(stage: LightPreparationStage): void;
  /** Always reads current requested settings, never an old snapshot. */
  restore(): void;
  meshes(): readonly ReadyMesh[];
  beforeChecks(): void;
  /** Uses the actual camera pass and restores the previous pass in finally. */
  check(mesh: ReadyMesh): boolean;
  effectsReady(): boolean;
  render(): void;
  run(callback: () => void): void;
  stop(callback: () => void): void;
  onDispose(callback: () => void): () => void;
  isDisposed(): boolean;
  /** Settings/asset identity changes restart only the current bounded stage. */
  revision(): readonly unknown[];
  now(): number;
  setTimer(callback: () => void, milliseconds: number): unknown;
  clearTimer(timer: unknown): void;
  timeoutMs?: number;
  batchSize?: number;
  batchMs?: number;
};

const stages: readonly LightPreparationStage[] = [
  "current-off",
  "current-on",
  "night-0-off",
  "night-0-on",
  "night-1-off",
  "night-1-on",
  "night-2-off",
  "night-2-on",
  "restore",
];

/** A single engine loop with an independent deadline also when RAF is paused.
 * Mesh readiness alone can report the old hot-swapped effect, so the engine's
 * newly created effects must be ready before and after acceptance draws.
 * Separate progress draws start work that depends on rendering first.
 * One synchronous driver call cannot be preempted; batching limits JS work
 * between those calls, and the deadline is checked again immediately after it.
 */
export function prepareLightVariants(
  options: LightPreparationOptions,
): Promise<LightPreparationResult> {
  const started = options.now();
  const timeout = Math.max(1, options.timeoutMs ?? 30_000);
  const deadline = started + timeout;
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 128));
  const batchMs = Math.max(0.1, options.batchMs ?? 4);
  return new Promise((resolve) => {
    const results: LightPreparationResult["stages"] = [];
    let done = false,
      index = -1,
      stageStarted = started;
    let checks = 0,
      renders = 0,
      restarts = 0,
      readyRenders = 0;
    let needsApply = true;
    let queue: readonly ReadyMesh[] = [],
      retry: ReadyMesh[] = [],
      cursor = 0;
    let revision: readonly unknown[] = [];
    let operation: NonNullable<LightPreparationResult["failureStep"]> =
      "lifecycle";
    let failureStep: LightPreparationResult["failureStep"] = null;
    let timer: unknown,
      detach = () => {};
    const saveStage = () => {
      if (index >= 0 && index < stages.length)
        results.push({
          stage: stages[index],
          elapsedMs: options.now() - stageStarted,
          checks,
          renders,
          restarts,
        });
    };
    const finish = (status: LightPreparationResult["status"]) => {
      if (done) return;
      done = true;
      for (const cleanup of [
        () => options.stop(tick),
        () => options.clearTimer(timer),
        () => detach(),
      ]) {
        try {
          cleanup();
        } catch {
          status = "failed";
          failureStep = "cleanup";
        }
      }
      saveStage();
      if (!options.isDisposed()) {
        try {
          options.restore();
        } catch {
          status = "failed";
          failureStep = "restore";
        }
      }
      resolve({
        status,
        elapsedMs: options.now() - started,
        failureStep,
        stages: results,
      });
      queue = [];
      retry = [];
      revision = [];
    };
    const collect = () => {
      operation = "meshes";
      queue = [...options.meshes()];
      retry = [];
      cursor = 0;
    };
    const draw = () => {
      operation = "render";
      options.render();
      renders++;
      if (options.isDisposed()) {
        finish("disposed");
        return false;
      }
      if (options.now() >= deadline) {
        finish("timeout");
        return false;
      }
      return true;
    };
    const apply = () => {
      operation = "apply";
      options.apply(stages[index]);
      revision = [...options.revision()];
      readyRenders = 0;
      // A real progress draw starts lazy shader/postprocess/shadow work that
      // cannot become ready without rendering. It is not proof of readiness.
      if (!draw()) return;
      collect();
    };
    function tick() {
      if (done) return;
      if (options.isDisposed()) return finish("disposed");
      if (options.now() >= deadline) return finish("timeout");
      try {
        if (index < 0) {
          index = 0;
          stageStarted = options.now();
        }
        if (needsApply) {
          needsApply = false;
          apply();
          return;
        }
        const nextRevision = options.revision();
        if (
          nextRevision.length !== revision.length ||
          nextRevision.some((value, at) => value !== revision[at])
        ) {
          restarts++;
          apply();
          return;
        }
        const batchStarted = options.now();
        options.beforeChecks();
        let batch = 0;
        while (
          cursor < queue.length &&
          batch < batchSize &&
          options.now() - batchStarted < batchMs
        ) {
          const mesh = queue[cursor++];
          batch++;
          if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible)
            continue;
          checks++;
          operation = "check";
          if (!options.check(mesh)) retry.push(mesh);
          if (options.isDisposed()) return finish("disposed");
          if (options.now() >= deadline) return finish("timeout");
        }
        if (cursor < queue.length) return;
        if (retry.length) {
          queue = retry;
          retry = [];
          cursor = 0;
          readyRenders = 0;
          draw();
          return;
        }
        operation = "effects";
        if (!options.effectsReady()) {
          readyRenders = 0;
          draw();
          return;
        }
        if (!draw()) return;
        const afterDraw = options.revision();
        if (
          afterDraw.length !== revision.length ||
          afterDraw.some((value, at) => value !== revision[at])
        ) {
          restarts++;
          needsApply = true;
          return;
        }
        // The first real draw can discover a new material/instance/shadow effect.
        // Recheck its actual active meshes before declaring this stage complete.
        operation = "effects";
        readyRenders = options.effectsReady() ? readyRenders + 1 : 0;
        if (readyRenders < 2) {
          collect();
          return;
        }
        saveStage();
        index++;
        if (index === stages.length) return finish("complete");
        stageStarted = options.now();
        checks = renders = restarts = 0;
        needsApply = true;
      } catch {
        failureStep = operation;
        finish(options.isDisposed() ? "disposed" : "failed");
      }
    }
    if (options.isDisposed()) return finish("disposed");
    try {
      detach = options.onDispose(() => finish("disposed"));
      if (done) {
        detach();
        return;
      }
      timer = options.setTimer(
        () => finish(options.isDisposed() ? "disposed" : "timeout"),
        timeout,
      );
      if (!done) options.run(tick);
    } catch {
      failureStep = "lifecycle";
      finish(options.isDisposed() ? "disposed" : "failed");
    }
  });
}
