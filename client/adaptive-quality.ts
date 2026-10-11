import {
  MANUAL_HARDWARE_SCALING,
  RENDER_BUDGETS,
  type RenderBudget,
  type RenderQuality,
  type RenderQualityMode,
  type RenderTargetFps,
} from "../shared/render-quality";

export type AdaptiveQualityReason =
  | "warmup"
  | "manual"
  | "steady"
  | "sustained-slow"
  | "cpu-bound"
  | "recovered"
  | "minimum-quality"
  | "hidden"
  | "suspended";

export type AdaptiveFrameStatistics = Readonly<{
  durationMs: number;
  samples: number;
  averageFps: number;
  medianFrameMs: number;
  p95FrameMs: number;
  p99FrameMs: number;
  slowFrameFraction: number;
  /** Optional measured CPU/GPU work, not the RAF interval. */
  averageCpuFrameMs: number | null;
  averageGpuFrameMs: number | null;
}>;

export type AdaptiveQualitySnapshot = Readonly<{
  mode: RenderQualityMode;
  quality: RenderQuality;
  targetFps: RenderTargetFps;
  /** A separately known presentation ceiling may lower the adaptation goal. */
  effectiveTargetFps: number;
  presentationHz: number | null;
  hardwareScaling: number;
  renderScale: number;
  budgets: RenderBudget;
  reason: AdaptiveQualityReason;
  revision: number;
  statistics: AdaptiveFrameStatistics | null;
}>;

export type AdaptiveQualityOptions = {
  mode?: RenderQualityMode;
  targetFps?: RenderTargetFps;
  initialQuality?: RenderQuality;
  /** Optional independent refresh measurement. Do not infer it from slow gameplay. */
  presentationHz?: number | null;
  /** Maximum reduction: default 2 means at least 50% of CSS width and height. */
  maxHardwareScaling?: number;
};

export type AdaptiveFrameInput = {
  /** Monotonic performance.now(), sampled once each rendered frame. */
  nowMs: number;
  /** Raw elapsed frame interval; do not use physics' clamped dt. */
  frameMs: number;
  visible: boolean;
  /** Freeze adaptation during a fixed-condition benchmark or context restore. */
  suspended?: boolean;
  cpuFrameMs?: number;
  gpuFrameMs?: number;
};

const QUALITIES: readonly RenderQuality[] = ["low", "medium", "high"];
const SCALING_STEPS = [1, 1.1, 1.2, 1.3, 1.45, 1.65, 2] as const;
const WINDOW_MS = 2000;
const STARTUP_WARMUP_MS = 8000;
const RESUME_WARMUP_MS = 3000;
const MINIMUM_CHANGE_INTERVAL_MS = 4000;
const RECOVERY_MS = 12000;
const SAMPLE_CAPACITY = 2048;
const finitePositive = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

/**
 * Measured, reversible render control. No engine, timers, browser globals or
 * GPU-name heuristics: integration applies a new state only on revision change.
 * FPS goals affect quality selection, never requestAnimationFrame scheduling.
 */
export class AdaptiveQualityController {
  private mode: RenderQualityMode;
  private targetFps: RenderTargetFps;
  private quality: RenderQuality;
  private scaling = 1;
  private presentationHz: number | null;
  private readonly scales: readonly number[];
  private reason: AdaptiveQualityReason;
  private revision = 0;
  private statistics: AdaptiveFrameStatistics | null = null;
  private snapshot: AdaptiveQualitySnapshot;
  private readonly samples = new Float64Array(SAMPLE_CAPACITY);
  private sampleCount = 0;
  private intervalCount = 0;
  private intervalSum = 0;
  private cpuSum = 0;
  private cpuCount = 0;
  private gpuSum = 0;
  private gpuCount = 0;
  private windowStart = 0;
  private warmUntil = 0;
  private lastNow: number | undefined;
  private lastChange = -Infinity;
  private slowDuration = 0;
  private goodDuration = 0;
  private inactive = false;
  private recoveryBlockedUntil = 0;
  private failedProbes = 0;
  private upgradeProbe?: { at: number; quality: RenderQuality; scaling: number };

  constructor(options: AdaptiveQualityOptions = {}) {
    this.mode = options.mode ?? "auto";
    this.targetFps = options.targetFps ?? 60;
    this.quality = this.mode === "auto" ? options.initialQuality ?? "medium" : this.mode;
    this.scaling = this.mode === "auto" ? 1 : MANUAL_HARDWARE_SCALING[this.quality];
    this.presentationHz = finitePositive(options.presentationHz ?? undefined)
      ? options.presentationHz!
      : null;
    const maximum = Math.max(1, Math.min(2, finitePositive(options.maxHardwareScaling) ? options.maxHardwareScaling : 2));
    this.scales = [...SCALING_STEPS.filter((scale) => scale < maximum), maximum];
    this.reason = this.mode === "auto" ? "warmup" : "manual";
    this.snapshot = this.makeSnapshot();
  }

  get state(): AdaptiveQualitySnapshot {
    return this.snapshot;
  }

  private makeSnapshot(): AdaptiveQualitySnapshot {
    return Object.freeze({
      mode: this.mode,
      quality: this.quality,
      targetFps: this.targetFps,
      effectiveTargetFps: Math.min(this.targetFps, this.presentationHz ?? Infinity),
      presentationHz: this.presentationHz,
      hardwareScaling: this.scaling,
      renderScale: 1 / this.scaling,
      budgets: RENDER_BUDGETS[this.quality],
      reason: this.reason,
      revision: this.revision,
      statistics: this.statistics,
    });
  }

  private publish(reason: AdaptiveQualityReason, changed = false) {
    this.reason = reason;
    if (changed) this.revision++;
    this.snapshot = this.makeSnapshot();
    return this.snapshot;
  }

  private clearWindow(nowMs: number) {
    this.sampleCount = 0;
    this.intervalCount = 0;
    this.intervalSum = this.cpuSum = this.cpuCount = this.gpuSum = this.gpuCount = 0;
    this.windowStart = nowMs;
  }

  private restart(nowMs: number, warmupMs = RESUME_WARMUP_MS) {
    this.clearWindow(nowMs);
    this.slowDuration = this.goodDuration = 0;
    this.upgradeProbe = undefined;
    this.warmUntil = nowMs + warmupMs;
  }

  setMode(mode: RenderQualityMode): AdaptiveQualitySnapshot {
    if (mode === this.mode) return this.snapshot;
    this.mode = mode;
    if (mode !== "auto") {
      this.quality = mode;
      this.scaling = MANUAL_HARDWARE_SCALING[mode];
    } else {
      this.scaling = Math.max(1, Math.min(this.scales[this.scales.length - 1], this.scaling));
    }
    this.restart(this.lastNow ?? 0);
    return this.publish(mode === "auto" ? "warmup" : "manual", true);
  }

  setTargetFps(targetFps: RenderTargetFps): AdaptiveQualitySnapshot {
    if (targetFps === this.targetFps) return this.snapshot;
    this.targetFps = targetFps;
    this.restart(this.lastNow ?? 0);
    return this.publish(this.mode === "auto" ? "warmup" : "manual", true);
  }

  setPresentationHz(presentationHz: number | null): AdaptiveQualitySnapshot {
    const value = finitePositive(presentationHz ?? undefined) ? presentationHz : null;
    if (value === this.presentationHz) return this.snapshot;
    this.presentationHz = value;
    this.restart(this.lastNow ?? 0);
    return this.publish(this.mode === "auto" ? "warmup" : "manual", true);
  }

  private lower(cpuBound: boolean): boolean {
    const qualityIndex = QUALITIES.indexOf(this.quality);
    // Lower distant scene work first when CPU measurements identify its limit.
    // Without timers, try small pixel steps before discarding world detail.
    if (qualityIndex > 0 && (cpuBound || this.scaling >= Math.min(1.3, this.scales[this.scales.length - 1]) - 1e-8)) {
      this.quality = QUALITIES[qualityIndex - 1];
      return true;
    }
    if (cpuBound) return false;
    const scale = this.scales.find((value) => value > this.scaling + 1e-8);
    if (scale === undefined) return false;
    this.scaling = scale;
    return true;
  }

  private raise(): boolean {
    const scale = [...this.scales].reverse().find((value) => value < this.scaling - 1e-8);
    if (scale !== undefined) {
      this.scaling = scale;
      return true;
    }
    const qualityIndex = QUALITIES.indexOf(this.quality);
    if (qualityIndex === QUALITIES.length - 1) return false;
    this.quality = QUALITIES[qualityIndex + 1];
    return true;
  }

  update(input: AdaptiveFrameInput): AdaptiveQualitySnapshot {
    const { nowMs, frameMs } = input;
    if (!Number.isFinite(nowMs) || !finitePositive(frameMs)) return this.snapshot;
    if (this.lastNow !== undefined && nowMs <= this.lastNow) return this.snapshot;
    const firstFrame = this.lastNow === undefined;
    const gap = firstFrame ? 0 : nowMs - this.lastNow!;
    this.lastNow = nowMs;

    if (!input.visible || input.suspended) {
      this.inactive = true;
      this.restart(nowMs);
      const reason = input.visible ? "suspended" : "hidden";
      return this.reason === reason ? this.snapshot : this.publish(reason);
    }
    if (firstFrame || this.inactive || gap > 500 || frameMs > 500) {
      this.inactive = false;
      this.restart(nowMs, firstFrame ? STARTUP_WARMUP_MS : RESUME_WARMUP_MS);
      return this.publish(this.mode === "auto" ? "warmup" : "manual");
    }
    if (nowMs < this.warmUntil) return this.snapshot;

    if (!this.sampleCount) this.windowStart = nowMs - frameMs;
    // Bounded storage; normal 360 Hz is only 720 samples per 2-second window.
    this.samples[this.intervalCount % SAMPLE_CAPACITY] = frameMs;
    this.intervalCount++;
    this.sampleCount = Math.min(this.intervalCount, SAMPLE_CAPACITY);
    this.intervalSum += frameMs;
    if (finitePositive(input.cpuFrameMs)) {
      this.cpuSum += input.cpuFrameMs;
      this.cpuCount++;
    }
    if (finitePositive(input.gpuFrameMs)) {
      this.gpuSum += input.gpuFrameMs;
      this.gpuCount++;
    }
    const durationMs = nowMs - this.windowStart;
    if (durationMs < WINDOW_MS || this.sampleCount < 8) return this.snapshot;

    const sorted = this.samples.slice(0, this.sampleCount).sort();
    const percentile = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
    const frameBudget = 1000 / this.snapshot.effectiveTargetFps;
    let slowFrames = 0;
    for (const value of sorted) if (value > frameBudget * 1.25) slowFrames++;
    this.statistics = Object.freeze({
      durationMs,
      samples: this.intervalCount,
      averageFps: (1000 * this.intervalCount) / this.intervalSum,
      medianFrameMs: percentile(0.5),
      p95FrameMs: percentile(0.95),
      p99FrameMs: percentile(0.99),
      slowFrameFraction: slowFrames / this.sampleCount,
      averageCpuFrameMs: this.cpuCount >= this.intervalCount / 2 ? this.cpuSum / this.cpuCount : null,
      averageGpuFrameMs: this.gpuCount >= this.intervalCount / 2 ? this.gpuSum / this.gpuCount : null,
    });
    this.clearWindow(nowMs);
    if (this.mode !== "auto") return this.publish("manual");

    const stats = this.statistics;
    const slow = stats.averageFps < this.snapshot.effectiveTargetFps * 0.89 ||
      (stats.p95FrameMs > frameBudget * 1.3 && stats.slowFrameFraction > 0.1);
    const severe = stats.averageFps < this.snapshot.effectiveTargetFps * 0.65;
    const healthy = stats.averageFps >= this.snapshot.effectiveTargetFps * 0.96 &&
      stats.p95FrameMs < frameBudget * 1.12 && stats.slowFrameFraction < 0.03;
    this.slowDuration = slow ? this.slowDuration + durationMs : 0;
    this.goodDuration = healthy ? this.goodDuration + durationMs : 0;
    const changeReady = nowMs - this.lastChange >= MINIMUM_CHANGE_INTERVAL_MS;
    if (changeReady && slow && (severe || this.slowDuration >= WINDOW_MS * 2)) {
      const cpu = stats.averageCpuFrameMs, gpu = stats.averageGpuFrameMs;
      const cpuBound = cpu !== null && gpu !== null && cpu > frameBudget * 0.8 && cpu > gpu * 1.15;
      let changed: boolean;
      if (this.upgradeProbe && nowMs - this.upgradeProbe.at < 20000) {
        // A VSync-flat 60 FPS window proves presentation cadence, not unused
        // GPU budget. Undo a failed probe and back off rather than oscillating.
        this.quality = this.upgradeProbe.quality;
        this.scaling = this.upgradeProbe.scaling;
        this.upgradeProbe = undefined;
        this.failedProbes++;
        this.recoveryBlockedUntil = nowMs + Math.min(180000, 30000 * 2 ** this.failedProbes);
        changed = true;
      } else {
        this.upgradeProbe = undefined;
        changed = this.lower(cpuBound);
      }
      if (changed) this.lastChange = nowMs;
      this.slowDuration = this.goodDuration = 0;
      return this.publish(changed ? cpuBound ? "cpu-bound" : "sustained-slow" : "minimum-quality", changed);
    }
    if (changeReady && healthy && this.goodDuration >= RECOVERY_MS && nowMs >= this.recoveryBlockedUntil) {
      const previous = { at: nowMs, quality: this.quality, scaling: this.scaling };
      const changed = this.raise();
      if (changed) {
        this.lastChange = nowMs;
        this.upgradeProbe = previous;
      }
      this.slowDuration = this.goodDuration = 0;
      return this.publish(changed ? "recovered" : "steady", changed);
    }
    return this.publish(slow ? this.reason === "minimum-quality" ? "minimum-quality" : "sustained-slow" : "steady");
  }
}
