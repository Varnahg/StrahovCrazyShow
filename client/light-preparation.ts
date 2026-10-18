/** Startup-only preparation of actual scene variants. No physics or input. */
export type LightPreparationStage =
  | "current-off"
  | "current-on"
  | `night-${0 | 1 | 2}-${"off" | "on"}`
  | `day-${0 | 1}-${"off" | "on"}`
  | "restore";
type PreparationTiming = { calls: number; totalMs: number; maxMs: number };
const timing = (): PreparationTiming => ({ calls: 0, totalMs: 0, maxMs: 0 });
const stageCpu = () => ({
  apply: timing(),
  checkBatch: timing(),
  render: timing(),
});
export type LightPreparationResult = {
  status: "complete" | "timeout" | "disposed" | "failed";
  elapsedMs: number;
  activeElapsedMs: number;
  pausedMs: number;
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
    activeElapsedMs: number;
    pausedMs: number;
    tickCount: number;
    /** Wall gaps preceding stage callbacks, including any explicit hidden pause. */
    rafGap: { count: number; totalMs: number; maxMs: number };
    /** Inclusive call wall durations; these are not hardware GPU timings. */
    cpu: ReturnType<typeof stageCpu>;
    restartReasons: Record<string, number>;
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
  revisionKeys?: readonly string[];
  /** Without visibility integration, preparation retains its visible deadline. */
  isVisible?(): boolean;
  onVisibilityChange?(callback: () => void): () => void;
  now(): number;
  setTimer(callback: () => void, milliseconds: number): unknown;
  clearTimer(timer: unknown): void;
  timeoutMs?: number;
  batchSize?: number;
  batchMs?: number;
  /** Existing spawn presentation with zero/one mapped POINT, OFF and ON. */
  includeDayPointVariants?: boolean;
};

const baselineStages: readonly LightPreparationStage[] = [
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

/** A single engine loop with a visible-time deadline even when RAF is stalled.
 * Mesh readiness alone can report the old hot-swapped effect, so the engine's
 * newly created effects must be ready before and after acceptance draws.
 * Separate progress draws start work that depends on rendering first.
 * One synchronous driver call cannot be preempted; batching limits JS work
 * between those calls, and the deadline is checked again immediately after it.
 */
export function prepareLightVariants(
  options: LightPreparationOptions,
): Promise<LightPreparationResult> {
  const stages: readonly LightPreparationStage[] = options.includeDayPointVariants
    ? [...baselineStages.slice(0, -1), "day-0-off", "day-0-on", "day-1-off", "day-1-on", "restore"]
    : baselineStages;
  const started = options.now();
  const timeout = Math.max(1, options.timeoutMs ?? 30_000);
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
    let visible = true,
      visibilityAt = started,
      activeBefore = 0,
      pausedBefore = 0,
      stageActiveStarted = 0,
      stagePausedStarted = 0,
      lastTickAt = started,
      tickCount = 0;
    let rafGap = { count: 0, totalMs: 0, maxMs: 0 };
    let cpu = stageCpu();
    let restartReasons: Record<string, number> = Object.create(null);
    let needsApply = true;
    let queue: readonly ReadyMesh[] = [],
      retry: ReadyMesh[] = [],
      cursor = 0;
    let revision: readonly unknown[] = [];
    let operation: NonNullable<LightPreparationResult["failureStep"]> =
      "lifecycle";
    let failureStep: LightPreparationResult["failureStep"] = null;
    let timer: unknown,
      timerArmed = false,
      timerEpoch = 0,
      detach = () => {},
      detachVisibility = () => {};
    const activeElapsed = (at = options.now()) =>
      activeBefore + (visible ? Math.max(0, at - visibilityAt) : 0);
    const clock = (at = options.now()) => {
      const delta = Math.max(0, at - visibilityAt);
      return {
        activeElapsedMs: activeBefore + (visible ? delta : 0),
        pausedMs: pausedBefore + (visible ? 0 : delta),
      };
    };
    const measure = <T>(sample: PreparationTiming, callback: () => T): T => {
      sample.calls++;
      const before = options.now();
      try {
        return callback();
      } finally {
        const elapsed = Math.max(0, options.now() - before);
        sample.totalMs += elapsed;
        sample.maxMs = Math.max(sample.maxMs, elapsed);
      }
    };
    const clearWatchdog = () => {
      timerEpoch++;
      if (timerArmed) options.clearTimer(timer);
      timerArmed = false;
      timer = undefined;
    };
    const saveStage = () => {
      if (index >= 0 && index < stages.length) {
        const at = options.now();
        const elapsed = clock(at);
        results.push({
          stage: stages[index],
          elapsedMs: at - stageStarted,
          activeElapsedMs: elapsed.activeElapsedMs - stageActiveStarted,
          pausedMs: elapsed.pausedMs - stagePausedStarted,
          tickCount,
          rafGap,
          cpu,
          restartReasons: { ...restartReasons },
          checks,
          renders,
          restarts,
        });
      }
    };
    const finish = (status: LightPreparationResult["status"]) => {
      if (done) return;
      done = true;
      for (const cleanup of [
        () => options.stop(tick),
        clearWatchdog,
        () => detach(),
        () => detachVisibility(),
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
      const at = options.now();
      const elapsed = clock(at);
      resolve({
        status:
          status === "complete" && elapsed.activeElapsedMs >= timeout
            ? "timeout"
            : status,
        elapsedMs: at - started,
        ...elapsed,
        failureStep,
        stages: results,
      });
      queue = [];
      retry = [];
      revision = [];
    };
    const armWatchdog = () => {
      clearWatchdog();
      if (done || !visible) return;
      const epoch = timerEpoch;
      timerArmed = true;
      const handle = options.setTimer(
        () => {
          if (done || epoch !== timerEpoch) return;
          try {
            if (options.isDisposed()) return finish("disposed");
            if (activeElapsed() >= timeout) return finish("timeout");
            syncVisibility();
            if (!done && visible) armWatchdog();
          } catch {
            failureStep = "lifecycle";
            finish("failed");
          }
        },
        Math.max(0, timeout - activeElapsed()),
      );
      // A lifecycle source can synchronously finish while attaching a timer.
      if (done || !timerArmed || epoch !== timerEpoch)
        options.clearTimer(handle);
      else timer = handle;
    };
    const syncVisibility = () => {
      if (done) return;
      const next = options.isVisible?.() ?? true;
      if (next === visible) return;
      const at = options.now();
      const elapsed = clock(at);
      // Do not erase a visible synchronous overrun merely because the page
      // became hidden before JavaScript could deliver its visibility event.
      if (elapsed.activeElapsedMs >= timeout) return finish("timeout");
      activeBefore = elapsed.activeElapsedMs;
      pausedBefore = elapsed.pausedMs;
      visibilityAt = at;
      visible = next;
      if (visible) armWatchdog();
      else clearWatchdog();
    };
    const canWork = () => {
      if (done) return false;
      if (options.isDisposed()) {
        finish("disposed");
        return false;
      }
      if (activeElapsed() >= timeout) {
        finish("timeout");
        return false;
      }
      syncVisibility();
      return !done && visible;
    };
    const visibilityChanged = () => {
      if (done) return;
      try {
        if (options.isDisposed()) return finish("disposed");
        syncVisibility();
      } catch {
        failureStep = "lifecycle";
        finish("failed");
      }
    };
    const noteRestart = (next: readonly unknown[]) => {
      if (
        next.length === revision.length &&
        next.every((value, at) => value === revision[at])
      )
        return false;
      const reasons = new Set<string>();
      if (next.length !== revision.length) reasons.add("revision-length");
      for (let at = 0; at < Math.max(next.length, revision.length); at++)
        if (next[at] !== revision[at])
          reasons.add(options.revisionKeys?.[at] ?? `revision-${at}`);
      if (!reasons.size) return false;
      restarts++;
      for (const reason of reasons)
        restartReasons[reason] = (restartReasons[reason] ?? 0) + 1;
      return true;
    };
    const startStage = () => {
      stageStarted = options.now();
      const elapsed = clock(stageStarted);
      stageActiveStarted = elapsed.activeElapsedMs;
      stagePausedStarted = elapsed.pausedMs;
      checks = renders = restarts = readyRenders = tickCount = 0;
      rafGap = { count: 0, totalMs: 0, maxMs: 0 };
      cpu = stageCpu();
      restartReasons = Object.create(null);
    };
    const collect = () => {
      operation = "meshes";
      queue = [...options.meshes()];
      retry = [];
      cursor = 0;
    };
    const draw = () => {
      if (!canWork()) return false;
      operation = "render";
      measure(cpu.render, () => options.render());
      renders++;
      return canWork();
    };
    const apply = () => {
      operation = "apply";
      measure(cpu.apply, () => options.apply(stages[index]));
      if (!canWork()) {
        if (!done) needsApply = true;
        return;
      }
      revision = [...options.revision()];
      readyRenders = 0;
      // A real progress draw starts lazy shader/postprocess/shadow work that
      // cannot become ready without rendering. It is not proof of readiness.
      if (!draw()) {
        if (!done) needsApply = true;
        return;
      }
      collect();
    };
    function tick() {
      if (done) return;
      const at = options.now();
      const gap = Math.max(0, at - lastTickAt);
      lastTickAt = at;
      try {
        const working = canWork();
        if (done) return;
        if (index < 0) {
          if (!working) return;
          index = 0;
          startStage();
        }
        tickCount++;
        rafGap.count++;
        rafGap.totalMs += gap;
        rafGap.maxMs = Math.max(rafGap.maxMs, gap);
        if (!working) return;
        if (needsApply) {
          needsApply = false;
          apply();
          return;
        }
        const nextRevision = options.revision();
        if (noteRestart(nextRevision)) {
          apply();
          return;
        }
        operation = "check";
        measure(cpu.checkBatch, () => {
          const batchStarted = options.now();
          options.beforeChecks();
          let batch = 0;
          while (
            cursor < queue.length &&
            batch < batchSize &&
            options.now() - batchStarted < batchMs
          ) {
            // End the measured batch before timeout/restore cleanup. An actual
            // visibility event still updates the clock through its observer.
            if (
              done ||
              options.isDisposed() ||
              activeElapsed() >= timeout ||
              !(options.isVisible?.() ?? true)
            )
              break;
            const mesh = queue[cursor++];
            batch++;
            if (mesh.isDisposed() || !mesh.isEnabled() || !mesh.isVisible)
              continue;
            checks++;
            if (!options.check(mesh)) retry.push(mesh);
          }
        });
        if (!canWork()) return;
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
        if (noteRestart(afterDraw)) {
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
        startStage();
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
      detachVisibility =
        options.onVisibilityChange?.(visibilityChanged) ?? (() => {});
      if (done) {
        detachVisibility();
        return;
      }
      syncVisibility();
      if (!done) armWatchdog();
      if (!done) options.run(tick);
    } catch {
      failureStep = "lifecycle";
      finish(options.isDisposed() ? "disposed" : "failed");
    }
  });
}
