import type { RenderQuality } from "../shared/render-quality";
import type { LightPreparationResult } from "./light-preparation";

export type RenderQualityPreparationPass = {
  quality: RenderQuality;
  timeoutMs: number;
  /** Final attempt: a newer requested quality may require another bounded pass. */
  finalPass: boolean;
};

export type RenderQualityPreparationOptions = {
  initialQuality: RenderQuality;
  /** Latest request, checked after a complete final attempt without resetting clocks. */
  requestedQuality?(): RenderQuality;
  /** Temporary render state only; do not change the adaptive requested mode. */
  applyQuality(quality: RenderQuality): void;
  prepare(pass: RenderQualityPreparationPass): Promise<LightPreparationResult>;
  /** Read the latest request. Idempotent when final-pass restore already ran. */
  restore(): void;
  isDisposed(): boolean;
  now(): number;
};

type QualityResult = Pick<LightPreparationResult, "status" | "failureStep"> & {
  quality: RenderQuality;
  finalPass: boolean;
  elapsedMs: number;
  activeElapsedMs: number;
  pausedMs: number;
  stageCount: number;
};

export type RenderQualityPreparationResult = Omit<
  LightPreparationResult,
  "stages"
> & {
  /** Pass attribution; a final restore can render a different latest request. */
  stages: (LightPreparationResult["stages"][number] & {
    passQuality: RenderQuality;
  })[];
  qualities: QualityResult[];
};

const QUALITIES: readonly RenderQuality[] = ["low", "medium", "high"];
const PASS_TIMEOUT_MS = 30_000;
const TOTAL_TIMEOUT_MS = 90_000;

/** Finite startup sequencing only. The existing light helper owns its loop,
 * visibility/watchdog and real readiness. This adds no timer or GPU resource. */
export async function prepareRenderQualities(
  options: RenderQualityPreparationOptions,
): Promise<RenderQualityPreparationResult> {
  const started = options.now();
  const order = QUALITIES.filter(
    (quality) => quality !== options.initialQuality,
  );
  // The initial traversal contains only known qualities. Valid late requests
  // may append another final attempt inside the same total deadline.
  order.push(
    ...QUALITIES.filter((quality) => quality === options.initialQuality),
  );
  const stages: RenderQualityPreparationResult["stages"] = [];
  const qualities: QualityResult[] = [];
  let status: LightPreparationResult["status"] = "complete";
  let failureStep: LightPreparationResult["failureStep"] = null;
  let pausedMs = 0;
  let lastPassStarted = started;
  let lastPassPausedBefore = 0;
  let hasError = false;
  let originalError: unknown;
  const activeElapsed = (at: number) => Math.max(0, at - started - pausedMs);
  const updatePassTiming = (at: number) => {
    const pass = qualities.at(-1);
    if (!pass) return;
    pass.elapsedMs = Math.max(0, at - lastPassStarted);
    pass.pausedMs = pausedMs - lastPassPausedBefore;
    pass.activeElapsedMs = Math.max(0, pass.elapsedMs - pass.pausedMs);
  };
  try {
    for (const [index, quality] of order.entries()) {
      if (options.isDisposed()) {
        status = "disposed";
        break;
      }
      const at = options.now();
      if (activeElapsed(at) >= TOTAL_TIMEOUT_MS) {
        status = "timeout";
        break;
      }
      lastPassStarted = at;
      lastPassPausedBefore = pausedMs;
      const finalPass = index === order.length - 1;
      const pass: QualityResult = {
        quality,
        finalPass,
        status: "complete",
        failureStep: null,
        elapsedMs: 0,
        activeElapsedMs: 0,
        pausedMs: 0,
        stageCount: 0,
      };
      qualities.push(pass);
      options.applyQuality(quality);
      if (options.isDisposed()) {
        status = pass.status = "disposed";
        break;
      }
      const prepareStarted = options.now();
      const timeoutMs = Math.min(
        PASS_TIMEOUT_MS - (prepareStarted - lastPassStarted),
        TOTAL_TIMEOUT_MS - activeElapsed(prepareStarted),
      );
      if (timeoutMs <= 0) {
        status = pass.status = "timeout";
        break;
      }
      const result = await options.prepare({ quality, timeoutMs, finalPass });
      const completedAt = options.now();
      // A report cannot subtract unobserved time, negative/NaN data, apply or
      // restoration cost outside the underlying preparation interval.
      if (Number.isFinite(result.pausedMs) && result.pausedMs > 0)
        pausedMs += Math.min(
          result.pausedMs,
          Math.max(0, completedAt - prepareStarted),
        );
      for (const stage of result.stages)
        stages.push({ ...stage, passQuality: quality });
      pass.stageCount = result.stages.length;
      status = pass.status = result.status;
      failureStep = pass.failureStep = result.failureStep;
      updatePassTiming(completedAt);
      if (status === "complete") {
        if (options.isDisposed()) status = pass.status = "disposed";
        else if (
          pass.activeElapsedMs >= PASS_TIMEOUT_MS ||
          activeElapsed(completedAt) >= TOTAL_TIMEOUT_MS
        )
          status = pass.status = "timeout";
      }
      if (status !== "complete") break;
      // Restoring an inactive vehicle can apply a newer quality while retaining
      // the previous map/pass. Prove that quality through the same finite work.
      // Keep historical finalPass flags: those callbacks already ran as final.
      if (finalPass && options.requestedQuality) {
        const requested = options.requestedQuality();
        if (QUALITIES.includes(requested) && requested !== quality)
          order.push(requested);
      }
    }
  } catch (error) {
    hasError = true;
    originalError = error;
  } finally {
    try {
      if (!options.isDisposed()) options.restore();
    } catch (error) {
      if (!hasError && status === "complete") {
        hasError = true;
        originalError = error;
      }
    }
  }
  if (hasError) throw originalError;
  const finished = options.now();
  updatePassTiming(finished);
  if (status === "complete") {
    if (options.isDisposed()) status = "disposed";
    else if (
      activeElapsed(finished) >= TOTAL_TIMEOUT_MS ||
      (qualities.at(-1)?.activeElapsedMs ?? 0) >= PASS_TIMEOUT_MS
    )
      status = "timeout";
    if (qualities.length) qualities[qualities.length - 1].status = status;
  }
  return {
    status,
    elapsedMs: Math.max(0, finished - started),
    activeElapsedMs: activeElapsed(finished),
    pausedMs,
    failureStep,
    stages,
    qualities,
  };
}
