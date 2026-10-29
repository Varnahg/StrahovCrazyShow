import {
  copyPlaytestFrameSample, copyPlaytestIdentity, copyPlaytestRefs, copyPlaytestSourceIdentity,
  type PlaytestArtifactReceipt, type PlaytestCaptureMetadata, type PlaytestCapturePhase,
  type PlaytestFrameSample, type PlaytestIdentity, type PlaytestRefs, type PlaytestSourceIdentity,
} from "../shared/playtest-diary";

const ENDPOINT = "/api/playtest/artifacts";
const MAX_QUEUE = 8, MAX_BYTES = 32 * 1024 ** 2, MAX_HEADER_BYTES = 12 * 1024;
const AUTOMATIC_INTERVAL = 2000, BURST_INTERVAL = 125, BURST_FRAMES = 16;
export type CaptureMode = "recording" | "paused" | "performance";
export type CaptureRequest = {
  reason: string;
  fullResolution?: boolean;
  phase?: PlaytestCapturePhase;
  refs?: PlaytestRefs;
};
export type CaptureOutcome =
  | { status: "copied"; metadata: PlaytestCaptureMetadata }
  | { status: "saved"; metadata: PlaytestCaptureMetadata; receipt: PlaytestArtifactReceipt }
  | { status: "dropped"; requestId: string; reason: string };
export type CaptureRequestHandle = { requestId: string; copied: Promise<CaptureOutcome>; saved: Promise<CaptureOutcome> };
type Request = CaptureRequest & { requestId: string; requestedAtMs: number; refs: PlaytestRefs; copied: (value: CaptureOutcome) => void; saved: (value: CaptureOutcome) => void; burstId?: string; burstIndex?: number; done: boolean; timer?: ReturnType<typeof setTimeout> };
type Upload = { request: Request; metadata: PlaytestCaptureMetadata; blob: Blob; sha256: string; header: string; encodeElapsedMs: number; hashElapsedMs: number; attempts: number; firstAttemptAt: number | null };
export type CaptureStatistics = {
  requested: number; copied: number; saved: number; dropped: number; droppedReasons: Record<string, number>;
  copyMs: number; encodeElapsedMs: number; hashElapsedMs: number; uploadElapsedMs: number;
  queued: number; queuedBytes: number; encoding: boolean; uploading: boolean; mode: CaptureMode;
};
export type CaptureEngine = {
  onEndFrameObservable: { add(callback: () => void): unknown; remove(observer: never): unknown };
  getRenderingCanvas(): HTMLCanvasElement | null;
};
export type CaptureEnvironment = {
  now(): number; wallNow(): number; uuid(): string;
  createCanvas(): HTMLCanvasElement;
  fetch: typeof fetch;
  hash(blob: Blob): Promise<string>;
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimeout(timer: ReturnType<typeof setTimeout>): void;
  visible(): boolean;
};
const browserEnvironment = (): CaptureEnvironment => ({
  now: () => performance.now(), wallNow: () => Date.now(), uuid: () => crypto.randomUUID(),
  createCanvas: () => document.createElement("canvas"), fetch: (...args) => fetch(...args),
  hash: async (blob) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  setTimeout: (callback, ms) => setTimeout(callback, ms), clearTimeout: (timer) => clearTimeout(timer),
  visible: () => document.visibilityState !== "hidden",
});
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; };
const defaultRefs = (): PlaytestRefs => ({ connectionId: null, scenarioId: null, scenarioVersion: null, stepId: null });
const distance = (a: PlaytestFrameSample, b: PlaytestFrameSample) => Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y, a.position.z - b.position.z);
const turn = (a: PlaytestFrameSample, b: PlaytestFrameSample) => {
  const dot = Math.sin(a.camera.pitch) * Math.sin(b.camera.pitch) + Math.cos(a.camera.pitch) * Math.cos(b.camera.pitch) * Math.cos(a.camera.yaw - b.camera.yaw);
  return Math.acos(Math.max(-1, Math.min(1, dot)));
};

/** A single owner of canvas copy, encoder and bounded immutable upload queue.
 * The integration passes the exact already-rendered frame; no rendering or GL
 * configuration/state API is available through this class's engine adapter. */
export class PlaytestCapture {
  private readonly environment: CaptureEnvironment;
  private readonly identity: PlaytestIdentity;
  private readonly source: PlaytestSourceIdentity;
  private readonly observer: unknown;
  private mode: CaptureMode;
  private frame: Readonly<PlaytestFrameSample> | null = null;
  private lastFrameId = -1;
  private pending: Request | null = null;
  private encoding = false;
  private encodingRequest: Request | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private queue: Upload[] = [];
  private queueBytes = 0;
  private uploading: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private burst: { id: string; request: CaptureRequest; start: number; next: number } | null = null;
  private previousPose: Readonly<PlaytestFrameSample> | null = null;
  private anchor: Readonly<PlaytestFrameSample> | null = null;
  private travelled = 0;
  private lastAutomaticAt = -Infinity;
  private disposed = false;
  private idleWaiters: Array<() => void> = [];
  private readonly counters = { requested: 0, copied: 0, saved: 0, dropped: 0, droppedReasons: {} as Record<string, number>, copyMs: 0, encodeElapsedMs: 0, hashElapsedMs: 0, uploadElapsedMs: 0 };
  constructor(private readonly options: {
    engine: CaptureEngine;
    identity: PlaytestIdentity;
    source: PlaytestSourceIdentity;
    refs?: () => PlaytestRefs;
    event?: (kind: string, data: unknown) => void;
    environment?: CaptureEnvironment;
    automatic?: boolean;
    mode?: CaptureMode;
  }) {
    this.environment = options.environment ?? browserEnvironment();
    const identity = copyPlaytestIdentity(options.identity), source = copyPlaytestSourceIdentity(options.source);
    if (!identity || !source) throw new Error("Invalid playtest capture identity");
    this.identity = identity; this.source = source; this.mode = options.mode ?? "recording";
    this.observer = options.engine.onEndFrameObservable.add(() => this.endFrame());
  }
  private event(kind: string, data: object) {
    try { this.options.event?.(kind, { ...this.identity, ...data }); } catch { /* Recording must not stop gameplay. */ }
  }
  snapshot(): Readonly<CaptureStatistics> {
    return { ...this.counters, droppedReasons: { ...this.counters.droppedReasons }, queued: this.queue.length, queuedBytes: this.queueBytes, encoding: this.encoding, uploading: !!this.uploading, mode: this.mode };
  }
  submitFrame(frame: Readonly<PlaytestFrameSample>) {
    if (!this.disposed && frame.frameId > this.lastFrameId) this.frame = frame;
  }
  request(input: CaptureRequest): CaptureRequestHandle {
    const copied = deferred<CaptureOutcome>(), saved = deferred<CaptureOutcome>();
    const requestId = this.environment.uuid();
    const request: Request = { ...input, requestId, requestedAtMs: this.environment.now(), refs: copyPlaytestRefs(input.refs ?? this.options.refs?.() ?? defaultRefs()) ?? defaultRefs(), copied: copied.resolve, saved: saved.resolve, done: false };
    this.counters.requested++;
    const handle = { requestId, copied: copied.promise, saved: saved.promise };
    if (this.disposed) this.drop(request, "disposed");
    else if (this.mode !== "recording") this.drop(request, this.mode);
    else if (!/^[a-z][a-z0-9.-]{0,79}$/.test(request.reason)) this.drop(request, "invalid-reason");
    else if (this.pending) this.drop(request, "pending-request");
    else {
      this.pending = request;
      request.timer = this.environment.setTimeout(() => {
        if (this.pending === request) { this.pending = null; this.drop(request, "frame-timeout"); }
      }, 5000);
      this.event("capture-requested", { requestId, reason: request.reason, requestedAtMs: request.requestedAtMs, refs: request.refs, phase: request.phase ?? null });
    }
    return handle;
  }
  startBurst(input: CaptureRequest): string | null {
    if (this.disposed || this.mode !== "recording") return null;
    if (this.burst) this.event("capture-burst-ended", { burstId: this.burst.id, reason: "replaced", scheduled: this.burst.next });
    this.burst = { id: this.environment.uuid(), request: { ...input, fullResolution: false }, start: this.environment.now(), next: 0 };
    this.event("capture-burst-started", { burstId: this.burst.id, targetFrames: BURST_FRAMES, intervalMs: BURST_INTERVAL });
    return this.burst.id;
  }
  private drop(request: Request, reason: string) {
    if (request.done) return;
    request.done = true;
    if (request.timer !== undefined) this.environment.clearTimeout(request.timer);
    this.counters.dropped++;
    this.counters.droppedReasons[reason] = (this.counters.droppedReasons[reason] ?? 0) + 1;
    const result: CaptureOutcome = { status: "dropped", requestId: request.requestId, reason };
    request.copied(result); request.saved(result);
    this.event("capture-dropped", { requestId: request.requestId, reason, requestedAtMs: request.requestedAtMs, refs: request.refs, phase: request.phase ?? null, burstId: request.burstId ?? null, burstIndex: request.burstIndex ?? null });
  }
  private automatic(frame: Readonly<PlaytestFrameSample>, now: number) {
    if (this.previousPose) this.travelled += distance(frame, this.previousPose);
    this.previousPose = frame;
    if (this.options.automatic === false || this.pending || this.burst || now - this.lastAutomaticAt < AUTOMATIC_INTERVAL) return;
    const reason = !this.anchor ? "start" : frame.zone !== this.anchor.zone ? "zone" : this.travelled >= 20 ? "travel" : turn(frame, this.anchor) >= Math.PI / 3 ? "turn" : null;
    if (!reason) return;
    this.lastAutomaticAt = now; this.anchor = frame; this.travelled = 0;
    this.request({ reason });
  }
  private endFrame() {
    if (this.disposed) return;
    const frame = this.frame; this.frame = null;
    if (!frame || frame.frameId <= this.lastFrameId) return;
    this.lastFrameId = frame.frameId;
    if (this.mode !== "recording" || !this.environment.visible()) {
      if (this.pending) { this.drop(this.pending, this.mode !== "recording" ? this.mode : "hidden"); this.pending = null; }
      return;
    }
    const now = this.environment.now();
    this.automatic(frame, now);
    if (this.burst) {
      const burst = this.burst, slot = Math.min(BURST_FRAMES, Math.floor((now - burst.start) / BURST_INTERVAL));
      if (slot >= burst.next) {
        if (slot > burst.next) this.event("capture-burst-gap", { burstId: burst.id, firstIndex: burst.next, count: slot - burst.next, reason: "render-cadence" });
        if (slot < BURST_FRAMES) {
          const handle = this.request(burst.request);
          if (this.pending?.requestId === handle.requestId) { this.pending.burstId = burst.id; this.pending.burstIndex = slot; }
        }
        burst.next = slot + 1;
        if (burst.next >= BURST_FRAMES) { this.event("capture-burst-ended", { burstId: burst.id, scheduled: Math.min(burst.next, BURST_FRAMES), reason: "complete" }); this.burst = null; }
      }
    }
    const request = this.pending; this.pending = null;
    if (!request) return;
    if (request.timer !== undefined) this.environment.clearTimeout(request.timer);
    if (this.encoding) { this.drop(request, "encoder-busy"); return; }
    if (this.queue.length >= MAX_QUEUE || this.queueBytes >= MAX_BYTES) { this.drop(request, "queue-budget"); return; }
    const sample = copyPlaytestFrameSample(frame);
    const source = this.options.engine.getRenderingCanvas();
    if (!sample || !source || !source.width || !source.height || source.width !== sample.rendering.renderWidth || source.height !== sample.rendering.renderHeight || now < sample.renderCompletedAtMs) { this.drop(request, "invalid-frame"); return; }
    const scale = request.fullResolution ? 1 : Math.min(1, 1280 / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale)), height = Math.max(1, Math.round(source.height * scale));
    if (width * height > 32 * 1024 ** 2) { this.drop(request, "canvas-pixel-budget"); return; }
    const mimeType = request.fullResolution ? "image/png" : "image/webp";
    const started = this.environment.now();
    try {
      const canvas = this.canvas ??= this.environment.createCanvas();
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) { this.drop(request, "canvas-context"); return; }
      context.clearRect(0, 0, width, height);
      context.drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height);
      const capturedAtMs = this.environment.now(), copyMs = Math.max(0, capturedAtMs - started);
      const metadata: PlaytestCaptureMetadata = { ...this.identity, refs: request.refs, artifactId: this.environment.uuid(), requestId: request.requestId, reason: request.reason, ...(request.phase ? { phase: request.phase } : {}), requestedAtMs: request.requestedAtMs, captureStartedAtMs: started, capturedAtMs, capturedAtUTC: new Date(this.environment.wallNow()).toISOString(), frame: sample, source: this.source, mimeType, width, height, sourceWidth: source.width, sourceHeight: source.height, copyMs, ...(request.burstId ? { burstId: request.burstId, burstIndex: request.burstIndex } : {}) };
      this.counters.copied++; this.counters.copyMs += copyMs;
      request.copied({ status: "copied", metadata });
      this.event("capture-copied", { metadata });
      this.encoding = true; this.encodingRequest = request;
      const encodeStart = this.environment.now();
      canvas.toBlob((blob) => { void this.encoded(request, metadata, blob, encodeStart); }, mimeType, request.fullResolution ? undefined : 0.9);
    } catch { this.encoding = false; this.encodingRequest = null; this.drop(request, "canvas-copy-or-encode"); this.notifyIdle(); }
  }
  private async encoded(request: Request, metadata: PlaytestCaptureMetadata, blob: Blob | null, started: number) {
    const encodeElapsedMs = Math.max(0, this.environment.now() - started);
    this.counters.encodeElapsedMs += encodeElapsedMs;
    try {
      if (this.disposed || request.done) { this.drop(request, "disposed"); return; }
      if (!blob) { this.drop(request, "encode-null"); return; }
      if (blob.type !== metadata.mimeType) { this.drop(request, "unsupported-mime"); return; }
      if (!blob.size || blob.size > MAX_BYTES) { this.drop(request, "artifact-byte-budget"); return; }
      const json = new TextEncoder().encode(JSON.stringify(metadata));
      let binary = ""; for (const byte of json) binary += String.fromCharCode(byte);
      const header = btoa(binary);
      if (new TextEncoder().encode(header).length > MAX_HEADER_BYTES) { this.drop(request, "metadata-byte-budget"); return; }
      const hashStart = this.environment.now(), sha256 = await this.environment.hash(blob);
      const hashElapsedMs = Math.max(0, this.environment.now() - hashStart);
      this.counters.hashElapsedMs += hashElapsedMs;
      if (this.disposed || request.done) { this.drop(request, "disposed"); return; }
      if (!/^[0-9a-f]{64}$/.test(sha256)) { this.drop(request, "hash-failed"); return; }
      if (this.queue.length >= MAX_QUEUE || this.queueBytes + blob.size > MAX_BYTES) { this.drop(request, "queue-budget"); return; }
      this.queue.push({ request, metadata, blob, sha256, header, encodeElapsedMs, hashElapsedMs, attempts: 0, firstAttemptAt: null });
      this.queueBytes += blob.size;
    } catch { this.drop(request, "encode-or-hash-failed"); }
    finally { this.encoding = false; this.encodingRequest = null; if (this.disposed && this.canvas) { this.canvas.width = this.canvas.height = 0; this.canvas = null; } this.notifyIdle(); void this.drain(); }
  }
  private remove(item: Upload) {
    const index = this.queue.indexOf(item);
    if (index >= 0) { this.queue.splice(index, 1); this.queueBytes -= item.blob.size; }
  }
  private transportSuspended() { return this.disposed || this.mode === "performance"; }
  private async drain() {
    if (this.transportSuspended() || this.uploading || this.retryTimer || !this.queue.length) return;
    const item = this.queue[0], controller = new AbortController();
    if (item.attempts >= 3 || item.firstAttemptAt !== null && this.environment.now() - item.firstAttemptAt >= 30000) {
      this.drop(item.request, "upload-retry-budget"); this.remove(item); void this.drain(); return;
    }
    this.uploading = controller;
    const start = this.environment.now();
    item.firstAttemptAt ??= start; item.attempts++;
    const timeout = this.environment.setTimeout(() => controller.abort(), 8000);
    let retryDelay = 1000 * 2 ** (item.attempts - 1), retry = false;
    try {
      const response = await this.environment.fetch(`${ENDPOINT}/${this.identity.runId}/${item.metadata.artifactId}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": item.metadata.mimeType, "X-Playtest-Metadata": item.header, "X-Playtest-Sha256": item.sha256 }, body: item.blob, signal: controller.signal });
      if (this.transportSuspended()) return;
      if (!response.ok) {
        retry = response.status === 429 || response.status >= 500 && response.status !== 507;
        const after = response.headers.get("Retry-After");
        if (after) { const seconds = Number(after); const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(after) - this.environment.wallNow(); if (Number.isFinite(delay)) retryDelay = Math.max(retryDelay, delay); }
        if (!retry) { this.drop(item.request, `upload-http-${response.status}`); this.remove(item); }
        return;
      }
      const receipt = await response.json() as PlaytestArtifactReceipt & { saved?: boolean };
      const extension = item.metadata.mimeType === "image/png" ? "png" : "webp";
      if (receipt.saved !== true || receipt.artifactId !== item.metadata.artifactId || receipt.sha256 !== item.sha256 || receipt.bytes !== item.blob.size || receipt.storageKey !== `${this.identity.runId}/${item.metadata.artifactId}.${extension}` || !Number.isFinite(Date.parse(receipt.savedAtUTC))) throw new Error("Invalid artifact receipt");
      if (this.transportSuspended()) return;
      const uploadElapsedMs = Math.max(0, this.environment.now() - start);
      item.request.done = true; this.counters.saved++; this.counters.uploadElapsedMs += uploadElapsedMs;
      item.request.saved({ status: "saved", metadata: item.metadata, receipt });
      this.event("capture-saved", { metadata: item.metadata, receipt, encodeElapsedMs: item.encodeElapsedMs, hashElapsedMs: item.hashElapsedMs, uploadElapsedMs });
      this.remove(item);
    } catch { retry = !this.transportSuspended(); }
    finally {
      this.environment.clearTimeout(timeout); this.uploading = null;
      if (retry && !this.transportSuspended()) {
        const elapsed = this.environment.now() - item.firstAttemptAt!;
        if (item.attempts >= 3 || elapsed + retryDelay > 30000) { this.drop(item.request, "upload-retry-budget"); this.remove(item); }
        else this.retryTimer = this.environment.setTimeout(() => { this.retryTimer = null; void this.drain(); }, Math.max(0, retryDelay));
      }
      this.notifyIdle();
      if (!this.retryTimer && !this.transportSuspended()) void this.drain();
    }
  }
  setMode(mode: CaptureMode) {
    if (this.disposed || mode === this.mode) return;
    this.mode = mode;
    if (mode !== "recording") {
      if (this.pending) { this.drop(this.pending, mode); this.pending = null; }
      if (this.burst) this.event("capture-burst-ended", { burstId: this.burst.id, reason: mode, scheduled: this.burst.next });
      this.burst = null; this.previousPose = this.anchor = null; this.travelled = 0;
    }
    if (mode === "performance") {
      this.uploading?.abort();
      if (this.retryTimer) { this.environment.clearTimeout(this.retryTimer); this.retryTimer = null; }
    } else void this.drain();
    this.event("capture-mode", { mode }); this.notifyIdle();
  }
  private notifyIdle() { if (!this.encoding && !this.uploading) for (const resolve of this.idleWaiters.splice(0)) resolve(); }
  idle(): Promise<void> { if (!this.encoding && !this.uploading) return Promise.resolve(); return new Promise((done) => this.idleWaiters.push(done)); }
  async flush(options: { timeoutMs?: number } = {}): Promise<{ saved: number; remaining: number; timedOut: boolean }> {
    const start = this.environment.now(), timeoutMs = Math.max(0, options.timeoutMs ?? 5000);
    void this.drain();
    while (!this.disposed && this.mode !== "performance" && (this.encoding || this.queue.length || this.uploading) && this.environment.now() - start < timeoutMs) await new Promise<void>((done) => this.environment.setTimeout(done, 25));
    return { saved: this.counters.saved, remaining: this.queue.length + Number(this.encoding), timedOut: this.environment.now() - start >= timeoutMs && (!!this.queue.length || this.encoding) };
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.options.engine.onEndFrameObservable.remove(this.observer as never);
    this.uploading?.abort();
    if (this.retryTimer) this.environment.clearTimeout(this.retryTimer);
    this.retryTimer = null; this.burst = null; this.frame = null;
    if (this.pending) this.drop(this.pending, "disposed"); this.pending = null;
    if (this.encodingRequest) this.drop(this.encodingRequest, "disposed");
    for (const item of this.queue) this.drop(item.request, "disposed");
    this.queue = []; this.queueBytes = 0;
    if (!this.encoding && this.canvas) { this.canvas.width = this.canvas.height = 0; this.canvas = null; }
    this.notifyIdle();
  }
}
