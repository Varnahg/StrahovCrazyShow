export type PresentationRateMeasurement = Readonly<{
  /** Observed idle browser cadence, never a certified monitor maximum. */
  observedBrowserHz: number | null;
  reliable: boolean;
  samples: number;
  p10FrameMs: number | null;
  medianFrameMs: number | null;
  p95FrameMs: number | null;
  reason: "ok" | "insufficient-samples" | "unstable-cadence" | "hidden" | "timeout" | "unsupported";
}>;

export function analysePresentationIntervals(intervals: readonly number[]): PresentationRateMeasurement {
  const values = intervals.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  const percentile = (p: number) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : null;
  const p10FrameMs = percentile(0.1), medianFrameMs = percentile(0.5), p95FrameMs = percentile(0.95);
  const enough = values.length >= 30;
  const stable = enough && medianFrameMs! >= 2 && medianFrameMs! <= 40 &&
    p10FrameMs! >= medianFrameMs! * 0.82 && p95FrameMs! <= medianFrameMs! * 1.18 &&
    values.length >= intervals.length * 0.95;
  return Object.freeze({
    observedBrowserHz: stable ? Math.round(10000 / medianFrameMs!) / 10 : null,
    reliable: stable,
    samples: values.length,
    p10FrameMs,
    medianFrameMs,
    p95FrameMs,
    reason: !enough ? "insufficient-samples" : stable ? "ok" : "unstable-cadence",
  });
}

/**
 * Run before starting the game's render loop, with the avatar preview stopped.
 * No GPU-name guess and no refresh inference from the loaded world's FPS.
 * The result can be used as a provisional adaptation ceiling for this session.
 */
export async function measurePresentationRate(): Promise<PresentationRateMeasurement> {
  const empty = analysePresentationIntervals([]);
  if (typeof window === "undefined" || typeof requestAnimationFrame !== "function") {
    return { ...empty, reason: "unsupported" };
  }
  if (document.hidden) return { ...empty, reason: "hidden" };
  return new Promise((resolve) => {
    const samples: number[] = [];
    let first: number | undefined, previous: number | undefined, frame = 0, done = false;
    const finish = (forced?: "hidden" | "timeout") => {
      if (done) return;
      done = true;
      cancelAnimationFrame(frame);
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", visibilityChanged);
      const result = analysePresentationIntervals(samples);
      resolve(forced ? { ...result, reliable: false, observedBrowserHz: null, reason: forced } : result);
    };
    const visibilityChanged = () => { if (document.hidden) finish("hidden"); };
    const timeout = setTimeout(() => finish("timeout"), 2200);
    document.addEventListener("visibilitychange", visibilityChanged);
    const tick = (timestamp: number) => {
      if (done) return;
      if (document.hidden) return finish("hidden");
      first ??= timestamp;
      const elapsed = timestamp - first;
      if (elapsed >= 150 && previous !== undefined) samples.push(timestamp - previous);
      previous = timestamp;
      if (elapsed >= 1550) finish();
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  });
}
