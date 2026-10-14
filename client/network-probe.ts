import type { NetworkProbeReply } from "../shared/network-diagnostics";

export const PROBE_COOLDOWN_MS = 1050;
export const PROBE_TIMEOUT_MS = 10000;
const MAX_LONG_TASKS = 256;
export type ProbeLongTask = { startTime: number; duration: number };
export type ProbeLongTaskSource = {
  takeRecords(): readonly ProbeLongTask[];
  disconnect(): void;
};
type ProbeOptions = {
  now: () => number;
  send: (request: { nonce: number }) => void;
  /** Omit for the browser observer; inject a source for deterministic tests. */
  longTasks?: (
    record: (tasks: readonly ProbeLongTask[]) => void,
  ) => ProbeLongTaskSource | null;
};
export type ProbePoll =
  | { kind: "sent"; nonce: number }
  | { kind: "timeout"; nonce: number; pendingMs: number }
  | { kind: "send-error"; message: string }
  | null;
export type ProbeMeasurement = NetworkProbeReply & {
  rawRoundTripMs: number;
  measuredAt: number;
  contaminated: boolean;
  blockedOverlapMs: number;
  overlappingLongTasks: number;
  longTaskCoverage: "available" | "unavailable" | "overflow";
  acceptedForPrediction: boolean;
  predictionRoundTripMs: number | null;
};

function browserLongTasks(
  record: (tasks: readonly ProbeLongTask[]) => void,
): ProbeLongTaskSource | null {
  if (
    typeof PerformanceObserver === "undefined" ||
    !PerformanceObserver.supportedEntryTypes?.includes("longtask")
  )
    return null;
  try {
    const observer = new PerformanceObserver((list) =>
      record(list.getEntries()),
    );
    observer.observe({ type: "longtask", buffered: true });
    return {
      takeRecords: () => observer.takeRecords(),
      disconnect: () => observer.disconnect(),
    };
  } catch {
    return null;
  }
}

/** Room-owned, no autonomous timers. poll may be driven by a short UI timer;
 * causality-safe cooldown starts at reply, never at the old interval phase. */
export class NetworkProbe {
  private source: ProbeLongTaskSource | null = null;
  private tasks: ProbeLongTask[] = [];
  private overflowAt: number | null = null;
  private active = false;
  private disposed = false;
  private nonce = 0;
  private pending: { nonce: number; sentAt: number } | null = null;
  private nextAt = 0;
  private predictionRtt: number | null = null;
  private last: ProbeMeasurement | null = null;
  private timeouts = 0;
  private contaminatedSamples = 0;
  private acceptedSamples = 0;
  private generation = 0;

  constructor(private readonly options: ProbeOptions) {}

  private record = (tasks: readonly ProbeLongTask[]) => {
    const now = this.options.now();
    if (!this.active || this.disposed || !Number.isFinite(now)) return;
    this.tasks = this.tasks.filter(
      (task) => task.startTime + task.duration >= now - PROBE_TIMEOUT_MS,
    );
    for (const task of tasks) {
      if (
        !Number.isFinite(task.startTime) ||
        !Number.isFinite(task.duration) ||
        task.startTime < 0 ||
        task.duration < 50
      )
        continue;
      if (task.startTime + task.duration < now - PROBE_TIMEOUT_MS) continue;
      if (
        this.tasks.some(
          (item) =>
            item.startTime === task.startTime &&
            item.duration === task.duration,
        )
      )
        continue;
      if (this.tasks.length === MAX_LONG_TASKS) {
        this.tasks.shift();
        this.overflowAt = now;
      }
      this.tasks.push({ startTime: task.startTime, duration: task.duration });
    }
  };

  poll({ enabled, ready }: { enabled: boolean; ready: boolean }): ProbePoll {
    if (this.disposed) return null;
    if (!enabled) {
      if (this.active) this.reset();
      return null;
    }
    if (!this.active) {
      this.active = true;
      const generation = ++this.generation;
      try {
        this.source = (this.options.longTasks ?? browserLongTasks)((tasks) => {
          if (generation === this.generation) this.record(tasks);
        });
      } catch {
        this.source = null;
      }
    }
    const now = this.options.now();
    if (!Number.isFinite(now) || now < 0) return null;
    if (this.pending) {
      const pendingMs = now - this.pending.sentAt;
      if (pendingMs < PROBE_TIMEOUT_MS) return null;
      const nonce = this.pending.nonce;
      this.pending = null;
      this.timeouts++;
      this.nextAt = now + PROBE_COOLDOWN_MS;
      return { kind: "timeout", nonce, pendingMs };
    }
    if (!ready || now < this.nextAt) return null;
    this.pending = { nonce: ++this.nonce, sentAt: now };
    const nonce = this.pending.nonce;
    try {
      this.options.send({ nonce: this.pending.nonce });
    } catch (error) {
      this.pending = null;
      this.nextAt = now + PROBE_COOLDOWN_MS;
      return { kind: "send-error", message: String(error) };
    }
    return { kind: "sent", nonce };
  }

  receive(reply: NetworkProbeReply): ProbeMeasurement | null {
    if (
      this.disposed ||
      !this.active ||
      !this.pending ||
      !Number.isSafeInteger(reply?.nonce) ||
      reply.nonce !== this.pending.nonce ||
      !Number.isSafeInteger(reply.serverTick) ||
      reply.serverTick < 0 ||
      !Number.isFinite(reply.serverTimeMs) ||
      reply.serverTimeMs < 0
    )
      return null;
    const now = this.options.now(),
      sentAt = this.pending.sentAt;
    if (!Number.isFinite(now) || now < sentAt) return null;
    // Entries may have been queued while a long frame held the observer's own
    // delivery callback. Drain them before trusting this scheduling-sensitive RTT.
    if (this.source) this.record(this.source.takeRecords());
    const intervals = this.tasks
      .map((task) => [
        Math.max(sentAt, task.startTime),
        Math.min(now, task.startTime + task.duration),
      ])
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let blockedOverlapMs = 0,
      end = -Infinity;
    for (const [a, b] of intervals) {
      blockedOverlapMs += Math.max(0, b - Math.max(a, end));
      end = Math.max(end, b);
    }
    const overflow = this.overflowAt !== null && this.overflowAt >= sentAt;
    const contaminated = blockedOverlapMs > 0 || overflow;
    const rawRoundTripMs = now - sentAt;
    if (contaminated) this.contaminatedSamples++;
    else {
      this.predictionRtt = rawRoundTripMs;
      this.acceptedSamples++;
    }
    const measurement: ProbeMeasurement = {
      nonce: reply.nonce,
      serverTick: reply.serverTick,
      serverTimeMs: reply.serverTimeMs,
      rawRoundTripMs,
      measuredAt: now,
      contaminated,
      blockedOverlapMs,
      overlappingLongTasks: intervals.length,
      longTaskCoverage: overflow
        ? "overflow"
        : this.source
          ? "available"
          : "unavailable",
      acceptedForPrediction: !contaminated,
      predictionRoundTripMs: this.predictionRtt,
    };
    this.last = measurement;
    this.pending = null;
    this.nextAt = now + PROBE_COOLDOWN_MS;
    return measurement;
  }

  reset(): void {
    this.generation++;
    this.source?.disconnect();
    this.source = null;
    this.tasks = [];
    this.overflowAt = null;
    this.pending = null;
    this.active = false;
    this.nextAt = 0;
    this.predictionRtt = null;
    this.last = null;
  }
  dispose(): void {
    this.reset();
    this.disposed = true;
  }
  snapshot() {
    const now = this.options.now();
    return {
      pendingNonce: this.pending?.nonce ?? null,
      pendingMs:
        this.pending && Number.isFinite(now)
          ? Math.max(0, now - this.pending.sentAt)
          : null,
      predictionRoundTripMs: this.predictionRtt,
      rawRoundTripMs: this.last?.rawRoundTripMs ?? null,
      measuredAt: this.last?.measuredAt ?? null,
      nextProbeAt: this.nextAt,
      retainedLongTasks: this.tasks.length,
      timeouts: this.timeouts,
      contaminatedSamples: this.contaminatedSamples,
      acceptedSamples: this.acceptedSamples,
      active: this.active,
      disposed: this.disposed,
    };
  }
}
