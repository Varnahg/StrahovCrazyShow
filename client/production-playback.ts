import {
  PLAYBACK_BUILD_PATTERN,
  PLAYBACK_INTERVAL_MS,
  PLAYBACK_MAX_FRAMES,
  PLAYBACK_MAX_PROBES,
  PLAYBACK_MAX_WINDOW_MS,
  type PlaybackSummary,
} from "../shared/production-playback";
import type { ProbeMeasurement } from "./network-probe";

/** One foreground playback window per Game. Existing probes own delivery. */
export class ProductionPlayback {
  private readonly buildId: string | null;
  private windowStartedAt: number | null = null;
  private lastFrameAt: number | null = null;
  private lastReportAt = -Infinity;
  private frames = 0;
  private hitch100 = 0;
  private hitch500 = 0;
  private maxFrameMs = 0;
  private rttSamples = 0;
  private maxRttMs = 0;
  private overlapSamples = 0;
  private incompleteCoverageSamples = 0;
  private timeouts = 0;
  private lastServerTick: number | null = null;

  constructor(buildId: string, private readonly isPlaying: () => boolean) {
    this.buildId = PLAYBACK_BUILD_PATTERN.test(buildId) ? buildId : null;
  }

  frame(now: number, visible: boolean): void {
    if (!visible || !this.isPlaying()) {
      if (this.windowStartedAt !== null) this.reset();
      return;
    }
    const start = this.windowStartedAt;
    const previous = this.lastFrameAt;
    if (
      start === null || previous === null || now < previous ||
      now - start > PLAYBACK_MAX_WINDOW_MS || this.frames === PLAYBACK_MAX_FRAMES
    ) {
      this.reset();
      this.windowStartedAt = this.lastFrameAt = now;
      return;
    }
    if (now === previous) return;
    this.lastFrameAt = now;
    const interval = Math.floor(now - previous);
    this.frames++;
    if (interval >= 100) this.hitch100++;
    if (interval >= 500) this.hitch500++;
    this.maxFrameMs = Math.max(this.maxFrameMs, interval);
  }

  recordRoundTrip(measurement: ProbeMeasurement): void {
    if (
      this.rttSamples === PLAYBACK_MAX_PROBES ||
      !this.coversProbe(measurement.measuredAt, measurement.rawRoundTripMs)
    ) return;
    this.rttSamples++;
    this.maxRttMs = Math.max(
      this.maxRttMs,
      Math.min(PLAYBACK_MAX_WINDOW_MS, Math.round(measurement.rawRoundTripMs)),
    );
    if (measurement.blockedOverlapMs > 0) this.overlapSamples++;
    if (measurement.longTaskCoverage !== "available") this.incompleteCoverageSamples++;
    this.lastServerTick = measurement.serverTick;
  }

  recordTimeout(now: number, pendingMs: number): void {
    if (this.timeouts < PLAYBACK_MAX_PROBES && this.coversProbe(now, pendingMs)) this.timeouts++;
  }

  private coversProbe(now: number, roundTripMs: number): boolean {
    const start = this.windowStartedAt;
    return start !== null && now - start <= PLAYBACK_MAX_WINDOW_MS && now - roundTripMs >= start;
  }

  take(now: number): PlaybackSummary | undefined {
    const start = this.windowStartedAt;
    const end = this.lastFrameAt;
    if (
      start === null || end === null || now - start > PLAYBACK_MAX_WINDOW_MS ||
      now - this.lastReportAt < PLAYBACK_INTERVAL_MS || end - start < PLAYBACK_INTERVAL_MS
    ) return;
    const summary: PlaybackSummary = {
      v: 1,
      windowMs: Math.floor(end - start),
      frames: this.frames,
      hitch100: this.hitch100,
      hitch500: this.hitch500,
      maxFrameMs: this.maxFrameMs,
      rttSamples: this.rttSamples,
      maxRttMs: this.maxRttMs,
      overlapSamples: this.overlapSamples,
      incompleteCoverageSamples: this.incompleteCoverageSamples,
      timeouts: this.timeouts,
      lastServerTick: this.lastServerTick,
      buildId: this.buildId,
    };
    this.lastReportAt = now;
    this.clearCounters();
    // The next measured interval begins at this completed frame boundary.
    this.windowStartedAt = end;
    return summary;
  }

  reset(): void {
    this.windowStartedAt = this.lastFrameAt = null;
    this.clearCounters();
  }

  private clearCounters(): void {
    this.frames = this.hitch100 = this.hitch500 = this.maxFrameMs = 0;
    this.rttSamples = this.maxRttMs = this.overlapSamples = this.incompleteCoverageSamples = this.timeouts = 0;
    this.lastServerTick = null;
  }
}
