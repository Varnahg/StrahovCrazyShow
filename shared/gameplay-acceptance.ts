export type AcceptanceStatus = "passed" | "failed" | "inconclusive";
export type AcceptanceReason = {
  code: string;
  message: string;
  actual?: number;
  limit?: number;
};
export type FrameAcceptancePolicy = {
  targetFps: number;
  minFpsRatio: number;
  p95BudgetMultiplier: number;
  p99BudgetMultiplier: number;
  maxFrameMs: number;
  hitchThresholdMs: number;
  maxHitchFraction: number;
  minSampleSeconds: number;
};
export type GameplayAcceptancePolicy = FrameAcceptancePolicy & {
  minVisibleSeconds: number;
  minMovementSeconds: number;
  minTravelMetres: number;
  maxResyncsPerMinute: number;
  maxCorrectionMetres: number;
  maxAuthorityAgeMs: number;
  maxTimelineWaitsPerMinute: number;
};

/** Projektové inženýrské tolerance, nikoli obecná definice plynulé hry.
 * Cíl pochází ze zadání; nikdy jej neodvozujeme z pomalého měřeného FPS. */
export const DEFAULT_FRAME_ACCEPTANCE: Readonly<FrameAcceptancePolicy> = Object.freeze({
  targetFps: 60,
  minFpsRatio: 0.9,
  p95BudgetMultiplier: 2,
  p99BudgetMultiplier: 3,
  maxFrameMs: 250,
  hitchThresholdMs: 50,
  maxHitchFraction: 0.01,
  minSampleSeconds: 5,
});
export const DEFAULT_GAMEPLAY_ACCEPTANCE: Readonly<GameplayAcceptancePolicy> = Object.freeze({
  ...DEFAULT_FRAME_ACCEPTANCE,
  minVisibleSeconds: 60,
  minMovementSeconds: 20,
  minTravelMetres: 20,
  maxResyncsPerMinute: 1,
  maxCorrectionMetres: 1,
  maxAuthorityAgeMs: 250,
  maxTimelineWaitsPerMinute: 1,
});

function policy<T extends FrameAcceptancePolicy>(defaults: Readonly<T>, overrides: Partial<T>): T {
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides))
    throw new Error("Invalid acceptance policy");
  for (const key of Object.keys(overrides))
    if (!Object.hasOwn(defaults, key)) throw new Error("Unknown acceptance policy field: " + key);
  const result = { ...defaults, ...overrides } as T;
  for (const [key, value] of Object.entries(result))
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 ||
        (value === 0 && key !== "maxHitchFraction" && key !== "maxResyncsPerMinute" && key !== "maxCorrectionMetres" && key !== "maxTimelineWaitsPerMinute"))
      throw new Error("Invalid acceptance policy field: " + key);
  if (result.targetFps > 1000 || result.minFpsRatio > 1 || result.maxHitchFraction > 1 ||
      result.p95BudgetMultiplier > result.p99BudgetMultiplier)
    throw new Error("Invalid acceptance policy bounds");
  return result;
}
export const frameAcceptancePolicy = (value: Partial<FrameAcceptancePolicy> = {}) =>
  policy(DEFAULT_FRAME_ACCEPTANCE, value);
export const gameplayAcceptancePolicy = (value: Partial<GameplayAcceptancePolicy> = {}) =>
  policy(DEFAULT_GAMEPLAY_ACCEPTANCE, value);

export type FrameAcceptanceMetrics = {
  frames: number;
  durationMs: number;
  averageFps: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  hitches: number;
  hitchFraction: number;
};
export type FrameAssessment = {
  scope: "frame-sample";
  status: AcceptanceStatus;
  metrics: FrameAcceptanceMetrics | null;
  reasons: AcceptanceReason[];
  policy: FrameAcceptancePolicy;
};
export const MAX_ACCEPTANCE_FRAMES = 524288;

/** Čisté hodnocení úplných intervalů. Passed platí pouze pro tento vzorek,
 * neprokazuje pohyb, správnou synchronizaci ani jinou scénu. */
export function assessFrameSample(
  frameIntervalsMs: unknown,
  overrides: Partial<FrameAcceptancePolicy> = {},
): FrameAssessment {
  const limits = frameAcceptancePolicy(overrides);
  const result: FrameAssessment = { scope: "frame-sample", status: "inconclusive", metrics: null, reasons: [], policy: limits };
  let valid = Array.isArray(frameIntervalsMs) && frameIntervalsMs.length > 0 && frameIntervalsMs.length <= MAX_ACCEPTANCE_FRAMES;
  if (valid) for (let index = 0; index < (frameIntervalsMs as unknown[]).length; index++) {
    const value = (frameIntervalsMs as unknown[])[index];
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_200_000) { valid = false; break; }
  }
  if (!valid) {
    result.reasons.push({ code: "invalid-frame-data", message: "Chybí úplné platné intervaly snímků." });
    return result;
  }
  const sorted = [...frameIntervalsMs as number[]].sort((a, b) => a - b);
  const durationMs = sorted.reduce((sum, value) => sum + value, 0);
  const hitches = sorted.filter(value => value >= limits.hitchThresholdMs).length;
  const metrics = result.metrics = {
    frames: sorted.length, durationMs, averageFps: sorted.length * 1000 / durationMs,
    p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
    p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1],
    maxMs: sorted[sorted.length - 1], hitches, hitchFraction: hitches / sorted.length,
  };
  if (durationMs < limits.minSampleSeconds * 1000) {
    result.reasons.push({ code: "short-frame-sample", message: "Snímkový vzorek je příliš krátký.", actual: durationMs / 1000, limit: limits.minSampleSeconds });
    return result;
  }
  const minimumFps = limits.targetFps * limits.minFpsRatio;
  const budget = 1000 / limits.targetFps;
  const checks: [string, string, number, number, boolean][] = [
    ["average-fps", "Průměrné FPS nedosahuje stanoveného cíle.", metrics.averageFps, minimumFps, metrics.averageFps + 1e-9 < minimumFps],
    ["p95-frame", "p95 snímkového intervalu překračuje mez.", metrics.p95Ms, budget * limits.p95BudgetMultiplier, metrics.p95Ms > budget * limits.p95BudgetMultiplier + 1e-9],
    ["p99-frame", "p99 snímkového intervalu překračuje mez.", metrics.p99Ms, budget * limits.p99BudgetMultiplier, metrics.p99Ms > budget * limits.p99BudgetMultiplier + 1e-9],
    ["max-frame", "Nejdelší prodleva překračuje mez.", metrics.maxMs, limits.maxFrameMs, metrics.maxMs > limits.maxFrameMs],
    ["hitch-fraction", "Četnost dlouhých snímků překračuje mez.", metrics.hitchFraction, limits.maxHitchFraction, metrics.hitchFraction > limits.maxHitchFraction],
  ];
  for (const [code, message, actual, limit, failed] of checks)
    if (failed) result.reasons.push({ code, message, actual, limit });
  result.status = result.reasons.length ? "failed" : "passed";
  return result;
}
