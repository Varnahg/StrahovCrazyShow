import {
  DIAGNOSTICS_SCHEMA_VERSION,
  DIAGNOSTICS_FLUSH_INTERVAL_MS,
  DIAGNOSTICS_DRAIN_THRESHOLD_BYTES,
  DIAGNOSTICS_CLIENT_BATCH_BYTES,
  MAX_DIAGNOSTICS_BATCH_BYTES,
  MAX_DIAGNOSTICS_RECORD_BYTES,
  MAX_DIAGNOSTICS_RECORDS,
  diagnosticsByteLength,
  isDiagnosticsKind,
  sanitizeDiagnosticsData,
  sanitizeDiagnosticsText,
  type DiagnosticsBatch,
  type DiagnosticsData,
  type DiagnosticsRecord,
} from "../shared/session-diagnostics";
import type { RenderIncidentSnapshot } from "./render-incident-profile";

const ENDPOINT = "/api/diagnostics/session";
const MAX_QUEUE_BYTES = 1024 * 1024;
const MAX_QUEUE_RECORDS = 512;
// A normal batch must also be eligible for an exact-byte keepalive retry.
const KEEPALIVE_BUDGET_BYTES = DIAGNOSTICS_CLIENT_BATCH_BYTES;
// Leave headroom under the collector's shared 120 POST/minute limit for tails.
const NORMAL_POSTS_PER_MINUTE = 110;
const MAX_WINDOW_FRAMES = 512;
// Keep lifecycle evidence aligned with the offline report's clock boundaries.
const FRAME_CONTEXT_BOUNDARIES = new Set([
  "session-end",
  "game-start",
  "game-dispose",
  "game-disposed",
  "game-end",
  "mode-change",
  "network-connecting",
  "network-connected",
  "network-disconnected",
  "network-left",
]);

export type DiagnosticsState =
  "idle" | "starting" | "recording" | "retrying" | "disabled" | "stopped";
export interface DiagnosticsStatus {
  state: DiagnosticsState;
  sessionId: string | null;
  sourceId: string | null;
  lastSavedAt: string | null;
  pending: number;
  dropped: number;
  droppedByReason: Record<"queueCapacity" | "recordSize" | "eventRate", number>;
  pendingBytes: number;
  error: string | null;
}
export interface DiagnosticFrame {
  /** rAF callback start; frameMs ends here, before current CPU work. */
  frameStartedAtMs?: number;
  frameMs: number;
  cpuMs: number;
  /** Newly available asynchronous GPU query; not necessarily this CPU frame. */
  gpuMs: number | null;
  phases: Record<string, number>;
  renderWork?: RenderIncidentSnapshot;
}

/** Injectable clock/transport keeps retry and lifecycle tests deterministic. */
export interface DiagnosticsEnvironment {
  hostname: string;
  now: () => number;
  wallNow: () => number;
  makeSessionId: () => string;
  fetch: typeof fetch;
  setInterval: (callback: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  window?: Window;
  document?: Document;
  observer?: typeof PerformanceObserver;
}

interface QueuedRecord {
  record: DiagnosticsRecord;
  bytes: number;
}
interface Drain {
  keepalive: boolean;
  all: boolean;
  remainingBytes: number;
  cancelled: boolean;
  controller: AbortController;
  promise: Promise<void>;
}
interface FrameWindow {
  fromMs: number;
  toMs: number;
  visibility: string;
  frameMs: number[];
  cpuMs: number[];
  gpuMs: (number | null)[];
  phaseTotals: Record<string, number>;
  phaseMax: Record<string, number>;
  enginePhaseTotals: Record<string, number>;
  enginePhaseMax: Record<string, number>;
  renderCounters: Record<string, number>;
  recorderCpuMs: number;
  recorderMaxMs: number;
  context: DiagnosticsData;
  contextAtMs: number;
  afterVisibilityChange: boolean;
}

function browserEnvironment(): DiagnosticsEnvironment {
  return {
    hostname: typeof location === "undefined" ? "" : location.hostname,
    now: () => performance.now(),
    wallNow: () => Date.now(),
    makeSessionId: () => crypto.randomUUID(),
    fetch: (...args) => fetch(...args),
    setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
    clearInterval: (handle) =>
      globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
    window: typeof window === "undefined" ? undefined : window,
    document: typeof document === "undefined" ? undefined : document,
    observer:
      typeof PerformanceObserver === "undefined"
        ? undefined
        : PerformanceObserver,
  };
}

function localHostname(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(hostname)
  );
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function safeDuration(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0
    ? round(value)
    : null;
}

function technicalError(error: unknown): DiagnosticsData {
  if (error instanceof Error)
    return sanitizeDiagnosticsData({
      name: error.name,
      message: error.message,
      stack: error.stack?.slice(0, 2048),
    });
  return {
    name: "NonErrorRejection",
    message:
      typeof error === "string"
        ? sanitizeDiagnosticsText(error)
        : "Non-Error value omitted",
  };
}

/** Continuous local recording. No key binding, export action, or gameplay dependency. */
export class SessionDiagnostics {
  private readonly environment: DiagnosticsEnvironment;
  private currentState: DiagnosticsState = "idle";
  private id: string | null = null;
  private sourceId: string | null = null;
  private lastSavedAt: string | null = null;
  private lastError: string | null = null;
  private sequence = 0;
  private batchId = 0;
  private queue: QueuedRecord[] = [];
  private queueBytes = 0;
  private dropped = 0;
  private droppedByReason = { queueCapacity: 0, recordSize: 0, eventRate: 0 };
  private reportedDrops = 0;
  private inFlight: DiagnosticsBatch | null = null;
  private inFlightBody = "";
  private inFlightBytes = 0;
  private drain: Drain | null = null;
  private postAttempts: number[] = [];
  private capable = false;
  private retryAt = 0;
  private failures = 0;
  private lastFlushAt = 0;
  private timer: unknown;
  private cleanup: (() => void)[] = [];
  private windowFrames: FrameWindow | null = null;
  private sampledContext: DiagnosticsData = {};
  private contextAt = -Infinity;
  private previousFrame: DiagnosticFrame | null = null;
  private afterVisibilityChange = false;
  private eventWindowAt = 0;
  private eventsInWindow = 0;
  private resourcesInWindow = 0;
  private resourceSummary: {
    count: number;
    detailed: number;
    transferBytes: number;
    durationMs: number;
    maxDurationMs: number;
  } | null = null;
  private hitchWindowAt = 0;
  private hitchesInWindow = 0;

  constructor(environment: DiagnosticsEnvironment = browserEnvironment()) {
    this.environment = environment;
  }

  get isRecording(): boolean {
    return (
      this.currentState === "starting" ||
      this.currentState === "recording" ||
      this.currentState === "retrying"
    );
  }

  start(): void {
    if (this.currentState !== "idle") return;
    if (!localHostname(this.environment.hostname)) {
      this.currentState = "disabled";
      return;
    }
    this.currentState = "starting";
    this.id = this.environment.makeSessionId();
    const now = this.environment.now();
    this.lastFlushAt = now;
    this.event("session-start", {
      startedAtUTC: new Date(this.environment.wallNow()).toISOString(),
      timeOrigin: this.environment.wallNow() - now,
      automatic: true,
      frameTiming: "frameMs=preceding interval; cpuMs/phases=current render",
      gpuTiming:
        "gpuMs=newly available asynchronous query; may describe an earlier frame",
      tailPolicy:
        "1s or 48KiB triggered sequential drain; bounded memory; best-effort 60KiB lifecycle tail; abrupt crashes/offline may lose unsaved records",
      userAgent: this.environment.window?.navigator.userAgent,
      language: this.environment.window?.navigator.language,
      hardwareConcurrency:
        this.environment.window?.navigator.hardwareConcurrency,
    });
    this.installBrowserObservers();
    this.timer = this.environment.setInterval(() => this.tick(), 1000);
    void this.flush();
  }

  status(): DiagnosticsStatus {
    return {
      state: this.currentState,
      sessionId: this.id,
      sourceId: this.sourceId,
      lastSavedAt: this.lastSavedAt,
      pending:
        this.queue.length +
        (this.inFlight?.records.length ?? 0) +
        (this.windowFrames ? 1 : 0),
      dropped: this.dropped,
      droppedByReason: { ...this.droppedByReason },
      pendingBytes: this.queueBytes + this.inFlightBytes,
      error: this.lastError,
    };
  }

  event(kind: string, data: unknown = {}): void {
    if (!this.isRecording || !isDiagnosticsKind(kind)) return;
    const contextBoundary = FRAME_CONTEXT_BOUNDARIES.has(kind);
    // Privacy and attribution cannot depend on the event's remaining budget.
    if (contextBoundary) this.resetFrameContext();
    const now = this.environment.now();
    if (now - this.eventWindowAt >= 1000) {
      this.eventWindowAt = now;
      this.eventsInWindow = 0;
      this.resourcesInWindow = 0;
    }
    const limitReached =
      kind === "session-end" || kind === "pagehide"
        ? false
        : kind === "resource-timing"
          ? ++this.resourcesInWindow > 256
          : ++this.eventsInWindow > 100;
    if (limitReached) {
      // The report treats missing sequences as barriers. Without this reserved
      // sequence it could join rooms before the later recording-gap is emitted.
      if (contextBoundary) this.sequence++;
      this.drop("eventRate");
      return;
    }
    this.enqueue(kind, data, now);
  }

  /** End the old frame group; callers also emit the relevant lifecycle event. */
  resetFrameContext(): void {
    this.finishWindow();
    this.sampledContext = {};
    this.contextAt = -Infinity;
    this.previousFrame = null;
  }

  recordFrame(frame: DiagnosticFrame, contextFactory: () => unknown): void {
    if (
      !this.isRecording ||
      !Number.isFinite(frame.frameMs) ||
      frame.frameMs <= 0
    )
      return;
    const now = this.environment.now();
    const intervalEndMs = frame.frameStartedAtMs ?? now;
    const previousContext = this.sampledContext;
    const previousContextAt = this.contextAt;
    // Expensive scene snapshots remain bounded even during a sustained stall.
    if (now - this.contextAt >= (frame.frameMs >= 50 ? 250 : 1000)) {
      try {
        this.sampledContext = sanitizeDiagnosticsData(contextFactory());
        this.contextAt = now;
      } catch (error) {
        this.sampledContext = {};
        this.event("context-error", technicalError(error));
        this.contextAt = now;
      }
    }
    if (
      this.windowFrames &&
      (intervalEndMs - this.windowFrames.fromMs >= 1000 ||
        this.windowFrames.frameMs.length >= MAX_WINDOW_FRAMES)
    )
      this.finishWindow();
    const windowFrames = (this.windowFrames ??= {
      fromMs: Math.max(0, intervalEndMs - frame.frameMs),
      toMs: intervalEndMs,
      visibility: this.afterVisibilityChange ? "transition" : this.visibility(),
      frameMs: [],
      cpuMs: [],
      gpuMs: [],
      phaseTotals: {},
      phaseMax: {},
      enginePhaseTotals: {},
      enginePhaseMax: {},
      renderCounters: {},
      recorderCpuMs: 0,
      recorderMaxMs: 0,
      context: this.sampledContext,
      contextAtMs: this.contextAt,
      afterVisibilityChange: this.afterVisibilityChange,
    });
    this.afterVisibilityChange = false;
    windowFrames.toMs = intervalEndMs;
    windowFrames.frameMs.push(round(frame.frameMs));
    windowFrames.cpuMs.push(safeDuration(frame.cpuMs) ?? 0);
    windowFrames.gpuMs.push(safeDuration(frame.gpuMs));
    const phases: Record<string, number> = {};
    for (const [name, value] of Object.entries(frame.phases).slice(0, 32)) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(name)) continue;
      const duration = safeDuration(value);
      if (duration === null) continue;
      phases[name] = duration;
      windowFrames.phaseTotals[name] =
        (windowFrames.phaseTotals[name] ?? 0) + duration;
      windowFrames.phaseMax[name] = Math.max(
        windowFrames.phaseMax[name] ?? 0,
        duration,
      );
    }
    if (now - this.hitchWindowAt >= 1000) {
      this.hitchWindowAt = now;
      this.hitchesInWindow = 0;
    }
    if (frame.renderWork) {
      for (const [name, duration] of Object.entries(frame.renderWork.cpuMs)) {
        if (!Number.isFinite(duration) || duration < 0) continue;
        windowFrames.enginePhaseTotals[name] =
          (windowFrames.enginePhaseTotals[name] ?? 0) + duration;
        windowFrames.enginePhaseMax[name] = Math.max(
          windowFrames.enginePhaseMax[name] ?? 0,
          duration,
        );
      }
      for (const [name, count] of Object.entries(frame.renderWork.counters)) {
        if (!Number.isFinite(count) || count < 0) continue;
        windowFrames.renderCounters[name] =
          (windowFrames.renderCounters[name] ?? 0) + count;
      }
    }
    if (frame.frameMs >= 50 && this.hitchesInWindow++ < 4) {
      this.event("frame-hitch", {
        frameMs: round(frame.frameMs),
        intervalStartMs: Math.max(0, intervalEndMs - frame.frameMs),
        intervalEndMs,
        recordedAtMs: now,
        currentCpuStartMs: frame.frameStartedAtMs ?? null,
        previousFrame: this.previousFrame,
        previousContext,
        previousContextAgeMs: Number.isFinite(previousContextAt)
          ? now - previousContextAt
          : null,
        currentCpuMs: safeDuration(frame.cpuMs),
        currentGpuMs: safeDuration(frame.gpuMs),
        currentPhases: phases,
        currentRenderWork: frame.renderWork,
        context: this.sampledContext,
        visibility: this.visibility(),
        afterVisibilityChange: windowFrames.afterVisibilityChange,
      });
    }
    this.previousFrame = {
      frameStartedAtMs: frame.frameStartedAtMs,
      frameMs: round(frame.frameMs),
      cpuMs: safeDuration(frame.cpuMs) ?? 0,
      gpuMs: safeDuration(frame.gpuMs),
      phases,
      renderWork: frame.renderWork,
    };
    const recorderMs = Math.max(0, this.environment.now() - now);
    windowFrames.recorderCpuMs += recorderMs;
    windowFrames.recorderMaxMs = Math.max(
      windowFrames.recorderMaxMs,
      recorderMs,
    );
    // Preserve resume gaps without counting hidden time as foreground slowness.
    if (windowFrames.afterVisibilityChange) this.finishWindow();
  }

  private visibility(): string {
    return this.environment.document?.visibilityState ?? "unknown";
  }

  private enqueue(
    kind: string,
    data: unknown,
    now = this.environment.now(),
  ): void {
    const record: DiagnosticsRecord = {
      seq: this.sequence++,
      atMs: Math.max(0, round(now)),
      kind,
      data: sanitizeDiagnosticsData(data),
    };
    const bytes = diagnosticsByteLength(record);
    if (bytes > MAX_DIAGNOSTICS_RECORD_BYTES) {
      this.drop("recordSize");
      return;
    }
    while (
      this.queue.length &&
      (this.queue.length >= MAX_QUEUE_RECORDS ||
        this.queueBytes + bytes > MAX_QUEUE_BYTES)
    ) {
      this.queueBytes -= this.queue.shift()!.bytes;
      this.drop("queueCapacity");
    }
    this.queue.push({ record, bytes });
    this.queueBytes += bytes;
    if (this.queueBytes >= DIAGNOSTICS_DRAIN_THRESHOLD_BYTES)
      void this.beginDrain(false, false);
  }

  private drop(reason: keyof typeof this.droppedByReason): void {
    this.dropped++;
    this.droppedByReason[reason]++;
  }

  private finishWindow(): void {
    const frames = this.windowFrames;
    if (!frames?.frameMs.length) return;
    this.windowFrames = null;
    const sorted = [...frames.frameMs].sort((a, b) => a - b);
    const sum = frames.frameMs.reduce((total, value) => total + value, 0);
    const gpu = frames.gpuMs.filter((value): value is number => value !== null);
    this.enqueue("frame-window", {
      ...frames,
      summary: {
        frames: sorted.length,
        fps: round((sorted.length * 1000) / sum),
        p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1],
        p99Ms: sorted[Math.ceil(sorted.length * 0.99) - 1],
        maxMs: sorted[sorted.length - 1],
        meanMs: round(sum / sorted.length),
        cpuMeanMs: round(
          frames.cpuMs.reduce((total, value) => total + value, 0) /
            sorted.length,
        ),
        gpuMeanMs: gpu.length
          ? round(gpu.reduce((total, value) => total + value, 0) / gpu.length)
          : null,
        gpuSamples: gpu.length,
        hitches50: frames.frameMs.filter((value) => value >= 50).length,
      },
    });
  }

  private tick(): void {
    if (!this.isRecording) return;
    const now = this.environment.now();
    this.finishResources();
    if (this.windowFrames && now - this.windowFrames.fromMs >= 1000)
      this.finishWindow();
    if (
      now >= this.retryAt &&
      (!this.capable ||
        this.inFlight ||
        now - this.lastFlushAt >= DIAGNOSTICS_FLUSH_INTERVAL_MS)
    )
      void this.beginDrain(false, false);
  }

  private finishResources(): void {
    if (!this.resourceSummary) return;
    this.enqueue("resource-window", this.resourceSummary);
    this.resourceSummary = null;
  }

  private prepareBatch(maxBytes: number): void {
    if (this.inFlight || !this.id || !this.queue.length) return;
    if (this.reportedDrops < this.dropped) {
      // Include losses incurred by making room for the gap marker itself.
      while (
        this.queue.length &&
        (this.queue.length >= MAX_QUEUE_RECORDS ||
          this.queueBytes > MAX_QUEUE_BYTES - 1024)
      ) {
        this.queueBytes -= this.queue.shift()!.bytes;
        this.drop("queueCapacity");
      }
      this.enqueue("recording-gap", {
        droppedTotal: this.dropped,
        sinceLastReport: this.dropped - this.reportedDrops,
        reason: "see cumulative droppedByReason",
        droppedByReason: { ...this.droppedByReason },
      });
      this.reportedDrops = this.dropped;
    }
    const records: DiagnosticsRecord[] = [];
    let bytes = 256;
    while (this.queue.length && records.length < MAX_DIAGNOSTICS_RECORDS) {
      const entry = this.queue[0];
      if (bytes + entry.bytes + 1 > maxBytes) break;
      this.queue.shift();
      this.queueBytes -= entry.bytes;
      bytes += entry.bytes + 1;
      records.push(entry.record);
    }
    if (!records.length) return;
    this.inFlight = {
      schemaVersion: DIAGNOSTICS_SCHEMA_VERSION,
      sessionId: this.id,
      batchId: this.batchId++,
      records,
    };
    this.inFlightBody = JSON.stringify(this.inFlight);
    this.inFlightBytes = new TextEncoder().encode(this.inFlightBody).byteLength;
  }

  /** Also callable by tests; normal application use flushes automatically. */
  flush(keepalive = false): Promise<void> {
    return this.beginDrain(keepalive, true);
  }

  private beginDrain(keepalive: boolean, all: boolean): Promise<void> {
    if (!this.isRecording) return this.drain?.promise ?? Promise.resolve();
    if (this.drain) {
      if (!keepalive || this.drain.keepalive) {
        this.drain.all ||= all;
        return this.drain.promise;
      }
      if (!this.capable) {
        // Capability discovery cannot be completed synchronously on exit;
        // if it does finish, its pending tail must still use keepalive.
        this.drain.keepalive = true;
        this.drain.remainingBytes = KEEPALIVE_BUDGET_BYTES;
        this.drain.all = true;
        return this.drain.promise;
      }
      // The old request may already have reached disk. Retain its immutable
      // batch ID/body and replace only its transport, never its contents.
      this.drain.cancelled = true;
      this.drain.controller.abort();
    } else if (!keepalive && this.environment.now() < this.retryAt) {
      return Promise.resolve();
    }
    const drain: Drain = {
      keepalive,
      all,
      remainingBytes: keepalive ? KEEPALIVE_BUDGET_BYTES : Infinity,
      cancelled: false,
      controller: new AbortController(),
      promise: Promise.resolve(),
    };
    this.drain = drain;
    drain.promise = this.drainBatches(drain);
    return drain.promise;
  }

  private async drainBatches(drain: Drain): Promise<void> {
    const signal = () =>
      AbortSignal.any([drain.controller.signal, AbortSignal.timeout(8000)]);
    try {
      if (!this.capable) {
        const response = await this.environment.fetch(`${ENDPOINT}/status`, {
          cache: "no-store",
          credentials: "same-origin",
          signal: signal(),
        });
        if (!response.ok)
          throw new Error(`Diagnostic capability HTTP ${response.status}`);
        const capability = (await response.json()) as {
          enabled?: boolean;
          schemaVersion?: number;
          sourceId?: string;
          source?: unknown;
          policy?: unknown;
        };
        if (
          !capability.enabled ||
          capability.schemaVersion !== DIAGNOSTICS_SCHEMA_VERSION
        )
          throw new Error("Diagnostic capability unavailable");
        if (drain.cancelled) return;
        this.capable = true;
        this.sourceId = capability.sourceId ?? null;
        this.enqueue("source-identity", {
          sourceId: this.sourceId,
          source: capability.source,
          policy: capability.policy,
        });
      }
      let sent = false;
      while (!drain.cancelled) {
        // Avoid spending the collector's request budget on a tiny remainder
        // after every large batch. The regular timer bounds its age to 1s.
        if (
          sent &&
          !drain.all &&
          !this.inFlight &&
          this.queueBytes < DIAGNOSTICS_DRAIN_THRESHOLD_BYTES
        )
          break;
        this.prepareBatch(
          Math.min(
            MAX_DIAGNOSTICS_BATCH_BYTES,
            KEEPALIVE_BUDGET_BYTES,
            drain.remainingBytes,
          ),
        );
        if (!this.inFlight) break;
        const bodyBytes = this.inFlightBytes;
        if (bodyBytes > drain.remainingBytes) break;
        const now = this.environment.now();
        this.postAttempts = this.postAttempts.filter((at) => now - at < 60000);
        if (
          this.postAttempts.length >=
          (drain.keepalive ? 120 : NORMAL_POSTS_PER_MINUTE)
        ) {
          this.retryAt = this.postAttempts[0] + 60000;
          this.lastError =
            "Diagnostic transport rate budget; records remain queued";
          if (this.isRecording) this.currentState = "retrying";
          break;
        }
        this.postAttempts.push(now);
        drain.remainingBytes -= bodyBytes;
        const response = await this.environment.fetch(ENDPOINT, {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: this.inFlightBody,
          keepalive: drain.keepalive,
          signal: signal(),
        });
        if (drain.cancelled) return;
        if (!response.ok)
          throw new Error(`Diagnostic save HTTP ${response.status}`);
        const receipt = (await response.json()) as {
          saved?: boolean;
          sessionId?: string;
          batchId?: number;
          savedAt?: string;
        };
        if (drain.cancelled) return;
        if (
          receipt.saved !== true ||
          receipt.sessionId !== this.id ||
          receipt.batchId !== this.inFlight.batchId ||
          typeof receipt.savedAt !== "string"
        )
          throw new Error("Invalid diagnostic save receipt");
        this.inFlight = null;
        this.inFlightBody = "";
        this.inFlightBytes = 0;
        this.lastSavedAt = receipt.savedAt;
        sent = true;
        this.lastFlushAt = this.environment.now();
        this.failures = 0;
        this.retryAt = 0;
        this.lastError = null;
        if (this.isRecording) this.currentState = "recording";
      }
      if (drain.keepalive && (this.inFlight || this.queue.length)) {
        this.lastError =
          "Lifecycle keepalive budget exhausted; unsaved tail remains queued";
        if (this.isRecording) this.currentState = "retrying";
      }
    } catch (error) {
      if (drain.cancelled) return;
      this.lastError = sanitizeDiagnosticsText(
        error instanceof Error ? error.message : "Diagnostic save failed",
        256,
      );
      this.retryAt =
        this.environment.now() +
        Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5));
      if (this.isRecording) this.currentState = "retrying";
    } finally {
      if (this.drain === drain) this.drain = null;
    }
  }

  private installBrowserObservers(): void {
    const {
      window: target,
      document: documentTarget,
      observer: Observer,
    } = this.environment;
    this.installConsoleDiagnostics(target);
    const listen = (
      node: EventTarget | undefined,
      type: string,
      handler: (event: Event) => void,
      capture = false,
    ) => {
      node?.addEventListener(type, handler, capture);
      this.cleanup.push(() =>
        node?.removeEventListener(type, handler, capture),
      );
    };
    const browserState = (reason: string) => {
      this.finishWindow();
      this.afterVisibilityChange = reason !== "start";
      this.previousFrame = null;
      this.event("browser-state", {
        reason,
        visibility: this.visibility(),
        focused: documentTarget?.hasFocus(),
      });
      if (this.visibility() === "hidden") void this.flush(true);
    };
    listen(documentTarget, "visibilitychange", () =>
      browserState("visibility"),
    );
    listen(target, "focus", () => browserState("focus"));
    listen(target, "blur", () => browserState("blur"));
    listen(target, "pageshow", () => browserState("pageshow"));
    listen(target, "pagehide", (event) => {
      this.finishWindow();
      this.finishResources();
      this.event("pagehide", {
        persisted: (event as PageTransitionEvent).persisted,
      });
      if (!(event as PageTransitionEvent).persisted)
        this.event("session-end", { reason: "pagehide", bestEffortTail: true });
      void this.flush(true);
    });
    listen(
      target,
      "error",
      (event) => {
        if ("message" in event && "filename" in event) {
          const error = event as ErrorEvent;
          this.event("js-error", {
            ...technicalError(error.error),
            message: error.message,
            source: error.filename,
            line: error.lineno,
            column: error.colno,
          });
        } else {
          const resource = event.target as HTMLElement | null;
          this.event("resource-error", {
            tag: resource?.tagName,
            source:
              resource?.getAttribute?.("src") ??
              resource?.getAttribute?.("href"),
          });
        }
      },
      true,
    );
    listen(target, "unhandledrejection", (event) =>
      this.event(
        "unhandled-rejection",
        technicalError((event as PromiseRejectionEvent).reason),
      ),
    );
    const supported = Observer?.supportedEntryTypes ?? [];
    this.event("browser-capabilities", {
      longAnimationFrame: supported.includes("long-animation-frame"),
      longtask: supported.includes("longtask"),
      resource: supported.includes("resource"),
    });
    if (Observer) {
      for (const type of ["long-animation-frame", "longtask", "resource"]) {
        if (!supported.includes(type)) continue;
        const observer = new Observer((list) => {
          for (const entry of list.getEntries()) {
            if (type === "resource") {
              const resource = entry as PerformanceResourceTiming;
              if (resource.name.includes(ENDPOINT)) continue;
              const summary = (this.resourceSummary ??= {
                count: 0,
                detailed: 0,
                transferBytes: 0,
                durationMs: 0,
                maxDurationMs: 0,
              });
              summary.count++;
              summary.transferBytes += resource.transferSize || 0;
              summary.durationMs += round(resource.duration);
              summary.maxDurationMs = Math.max(
                summary.maxDurationMs,
                round(resource.duration),
              );
              // Successes are counted completely; slow requests and failures
              // retain URL/timing detail without crowding out gameplay events.
              if (resource.duration < 250 && !(resource.responseStatus >= 400))
                continue;
              summary.detailed++;
              this.event("resource-timing", {
                source: resource.name,
                initiatorType: resource.initiatorType,
                startTime: resource.startTime,
                duration: resource.duration,
                responseStatus: resource.responseStatus,
                transferSize: resource.transferSize,
                encodedBodySize: resource.encodedBodySize,
                decodedBodySize: resource.decodedBodySize,
              });
              continue;
            }
            const detail = entry as PerformanceEntry & {
              blockingDuration?: number;
              renderStart?: number;
              styleAndLayoutStart?: number;
              scripts?: {
                sourceURL?: string;
                sourceFunctionName?: string;
                sourceCharPosition?: number;
                duration?: number;
                forcedStyleAndLayoutDuration?: number;
              }[];
            };
            this.event(type, {
              startTime: detail.startTime,
              duration: detail.duration,
              blockingDuration: detail.blockingDuration,
              renderStart: detail.renderStart,
              styleAndLayoutStart: detail.styleAndLayoutStart,
              scripts: detail.scripts?.slice(0, 8).map((script) => ({
                source: script.sourceURL,
                function: script.sourceFunctionName,
                position: script.sourceCharPosition,
                duration: script.duration,
                forcedStyleAndLayoutDuration:
                  script.forcedStyleAndLayoutDuration,
              })),
            });
          }
        });
        try {
          observer.observe({ type, buffered: true });
          this.cleanup.push(() => observer.disconnect());
        } catch {
          observer.disconnect();
        }
      }
    }
    browserState("start");
  }

  private installConsoleDiagnostics(target: Window | undefined): void {
    const browserConsole = (
      target as (Window & { console: Console }) | undefined
    )?.console;
    if (!browserConsole) return;
    // Only known technical prefixes; unrelated/user strings and arbitrary objects
    // are deliberately excluded. Error objects are copied by explicit fields.
    const technicalPrefix =
      /^(?:BJS\b|Babylon\b|WebGL\b|B6 interior models|Vegetation\b|Car model\b|Transit models\b|Používám geometrickou zálohu auta\.)/;
    for (const level of ["warn", "error"] as const) {
      const original = browserConsole[level];
      const recorder = this;
      const replacement = function (...args: unknown[]) {
        original.apply(browserConsole, args);
        const errors = args
          .filter((arg): arg is Error => arg instanceof Error)
          .slice(0, 3);
        const first =
          typeof args[0] === "string" && technicalPrefix.test(args[0])
            ? args[0]
            : null;
        if (first || errors.length)
          recorder.event(`console-${level}`, {
            message: first,
            errors: errors.map(technicalError),
            omittedArguments: args.length - errors.length - (first ? 1 : 0),
          });
      };
      browserConsole[level] = replacement;
      this.cleanup.push(() => {
        if (browserConsole[level] === replacement)
          browserConsole[level] = original;
      });
    }
  }

  dispose(): void {
    if (!this.isRecording) return;
    this.finishWindow();
    this.finishResources();
    this.event("session-end", {
      reason: "dispose",
      pendingBeforeFlush: this.status().pending,
    });
    void this.flush(true);
    this.currentState = "stopped";
    this.environment.clearInterval(this.timer);
    for (const cleanup of this.cleanup.splice(0)) cleanup();
  }
}

export const sessionDiagnostics = new SessionDiagnostics();
const hot = (
  import.meta as ImportMeta & {
    hot?: { dispose(callback: () => void): void };
  }
).hot;
hot?.dispose(() => sessionDiagnostics.dispose());
