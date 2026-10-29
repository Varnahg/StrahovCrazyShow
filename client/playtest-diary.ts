import { PlaytestTimeline, type PlaytestSink } from "./playtest-timeline";
import {
  PlaytestCapture,
  type CaptureEngine,
  type CaptureRequestHandle,
  type CaptureStatistics,
} from "./playtest-capture";
import {
  PLAYTEST_DIARY_VERSION,
  type PlaytestActionState,
  type PlaytestCapturePhase,
  type PlaytestFrameSample,
  type PlaytestIdentity,
  type PlaytestInputSample,
  type PlaytestLightingMode,
  type PlaytestRefs,
  type PlaytestSourceIdentity,
  type PlaytestStep,
} from "../shared/playtest-diary";
import {
  PLAYTEST_SCENARIO_VERSION,
  PLAYTEST_STATIONS,
  playtestStationReached,
} from "../shared/playtest-scenarios";

type CapturePort = Pick<PlaytestCapture,
  "submitFrame" | "request" | "startBurst" | "setMode" | "flush" | "idle" | "snapshot" | "dispose">;
export type DiaryRecorder = PlaytestSink & {
  sourceId(): string | null;
};
type Environment = {
  now(): number;
  wallNow(): number;
  uuid(): string;
  url: string;
  userAgent: string;
};
export type PlaytestDiaryOptions = {
  engine: CaptureEngine;
  recorder: DiaryRecorder;
  source: PlaytestSourceIdentity;
  gpu: { renderer: string; vendor: string; webglVersion: number | null };
  environment: Environment;
  captureFactory?: (options: ConstructorParameters<typeof PlaytestCapture>[0]) => CapturePort;
};
export type PlaytestDiaryStatus = {
  runId: string;
  frameId: number;
  paused: boolean;
  benchmark: boolean;
  ended: boolean;
  stationId: string | null;
  reached: boolean;
  capture: Readonly<CaptureStatistics>;
  pendingActions: number;
};

/** Owns one Game's diary. Recorder delivery and image delivery remain distinct;
 * neither an issued ID nor a copied canvas claims that disk persistence finished. */
export class PlaytestDiary {
  readonly identity: PlaytestIdentity;
  readonly timeline: PlaytestTimeline;
  private readonly capture: CapturePort;
  private refs: PlaytestRefs = {
    connectionId: null, scenarioId: null, scenarioVersion: null, stepId: null,
  };
  private lastFrame: PlaytestFrameSample | null = null;
  private step: PlaytestStep | null = null;
  private paused = false;
  private benchmark = false;
  private ended = false;
  private closePromise: Promise<void> | null = null;
  private counter = 0;
  private lastBurstAt = -Infinity;
  private pending = new Map<string, { atMs: number; action: string; state: PlaytestActionState }>();
  private readonly now: () => number;
  readonly clockOriginUtcMs: number;
  lightingMode: PlaytestLightingMode = "real";

  constructor(private readonly options: PlaytestDiaryOptions) {
    const sessionId = options.recorder.sessionId();
    if (!sessionId || !options.recorder.isRecording()) throw Error("Diary requires an active local recorder");
    const environment = options.environment;
    this.now = environment.now;
    this.clockOriginUtcMs = environment.wallNow() - environment.now();
    this.identity = {
      diaryVersion: PLAYTEST_DIARY_VERSION,
      sessionId, runId: environment.uuid(), gameInstanceId: environment.uuid(),
    };
    this.timeline = new PlaytestTimeline({
      sink: options.recorder, identity: this.identity, now: environment.now,
      makeId: environment.uuid,
      run: {
        clockOriginUtcMs: this.clockOriginUtcMs,
        source: options.source,
        captureMode: "incident",
        environment: { url: environment.url, userAgent: environment.userAgent, gpu: options.gpu },
      },
    });
    this.capture = (options.captureFactory ?? ((value) => new PlaytestCapture(value)))({
      engine: options.engine, identity: this.identity, source: options.source,
      refs: () => ({ ...this.refs }),
      event: (kind, data) => options.recorder.event(kind, data),
    });
    this.timeline.startGame();
  }

  get frameId() { return this.counter; }
  beginFrame(): number { return this.ended ? this.counter : ++this.counter; }

  setConnection(connected: boolean) {
    if (this.ended) return;
    this.cancelPending("connection-boundary");
    this.refs.connectionId = connected ? this.options.environment.uuid() : null;
    this.timeline.setConnection(this.refs.connectionId);
  }

  recordInput(input: PlaytestInputSample) {
    if (!this.ended) this.timeline.recordInput(input);
  }

  recordFrame(frame: PlaytestFrameSample) {
    if (this.ended) return;
    const previous = this.lastFrame;
    this.lastFrame = frame;
    this.timeline.recordFrame(frame);
    this.capture.submitFrame(frame);
    if (previous && (
      previous.rendering.quality !== frame.rendering.quality ||
      previous.rendering.hardwareScaling !== frame.rendering.hardwareScaling ||
      previous.lighting.mode !== frame.lighting.mode ||
      (frame.lighting.mode !== "real" && previous.lighting.instantUtcMs !== frame.lighting.instantUtcMs)
    )) this.capture.request({ reason: "visual-state-change" });
    if (frame.frameMs > 100 && !this.benchmark)
      this.incident("frame-hitch", { durationMs: frame.frameMs });
    for (const [id, pending] of this.pending) {
      // A timed-out authority response is unavailable evidence, not rejection.
      if (this.now() - pending.atMs >= 10_000)
        this.finishAction(id, "cancelled", "authoritative-result-unobserved", pending.state);
    }
  }

  requestAction(action: string, origin: "keyboard" | "hud" | "scenario" | "system", state: PlaytestActionState) {
    if (this.ended) return null;
    const id = this.timeline.requestAction({
      action, origin, atMs: this.now(), frameId: this.counter || null, before: state,
    });
    if (id) this.pending.set(id, { atMs: this.now(), action, state: { ...state } });
    return id;
  }

  finishAction(id: string | null | undefined, status: "applied" | "rejected" | "cancelled", reason: string,
    state: PlaytestActionState) {
    if (!id || this.ended) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    this.timeline.finishAction(id, {
      status, reason, atMs: this.now(), frameId: this.counter || null, after: state,
    });
    if (status !== "applied") return;
    const refs = { ...this.refs, actionId: id };
    this.capture.request({ reason: "action:" + pending.action, refs });
    if (pending.action === "flashlight") this.burst("action:flashlight", refs);
  }

  confirmAction(action: string, state: PlaytestActionState, reason = "authoritative-state") {
    for (const [id, pending] of this.pending) {
      if (pending.action !== action) continue;
      this.finishAction(id, "applied", reason, state);
      break;
    }
  }

  private cancelPending(reason: string) {
    for (const [id, pending] of this.pending)
      this.finishAction(id, "cancelled", reason, pending.state);
  }

  incident(kind: "frame-hitch" | "correction" | "manual" | "error",
    detail: { reason?: string; durationMs?: number; correctionMetres?: number } = {}) {
    if (this.ended) return null;
    const id = this.timeline.triggerIncident({
      kind, atMs: this.now(), frameId: this.counter || null, ...detail,
    });
    if (id) this.burst(kind, { ...this.refs, incidentId: id });
    return id;
  }

  private burst(reason: string, refs: PlaytestRefs) {
    if (this.paused || this.benchmark || this.now() - this.lastBurstAt < 2000) return;
    this.lastBurstAt = this.now();
    this.capture.startBurst({ reason, refs });
  }

  setPaused(paused: boolean) {
    if (this.ended || this.paused === paused) return;
    this.paused = paused;
    this.capture.setMode(this.benchmark ? "performance" : paused ? "paused" : "recording");
    this.options.recorder.event("playtest-capture-state", { ...this.identity, paused });
  }

  async beginBenchmark() {
    if (this.ended) return;
    this.benchmark = true;
    this.capture.setMode("performance");
    // Encoding cannot be interrupted. The timing interval starts after it ends.
    await this.capture.idle();
  }

  endBenchmark() {
    if (this.ended || !this.benchmark) return;
    this.benchmark = false;
    this.capture.setMode(this.paused ? "paused" : "recording");
  }

  startStep(stationId: string): boolean {
    const frame = this.lastFrame;
    if (this.ended || !frame || !PLAYTEST_STATIONS.some((station) => station.id === stationId)) return false;
    if (this.step) this.endStep("skipped", "next-step-started");
    this.step = {
      scenarioId: "campus-lighting", scenarioVersion: PLAYTEST_SCENARIO_VERSION,
      stepId: this.options.environment.uuid(), stationId,
      trial: {
        lightingMode: frame.lighting.mode, lightingInstant: frame.lighting.instantUtcMs,
        view: frame.vehicle ? "vehicle" : frame.camera.firstPerson ? "first" : "third",
        qualityMode: frame.rendering.qualityMode, quality: frame.rendering.quality,
      },
      traversal: "normal-input",
    };
    this.refs = { ...this.refs, scenarioId: this.step.scenarioId,
      scenarioVersion: this.step.scenarioVersion, stepId: this.step.stepId };
    return this.timeline.startStep(this.step);
  }

  endStep(status: "completed" | "failed" | "skipped", reason = "operator") {
    if (!this.step) return false;
    const frame = this.lastFrame;
    if (status === "completed" && (!frame || !playtestStationReached(this.step.stationId, frame.position))) {
      status = "failed";
      reason = "station-not-reached";
    }
    this.timeline.endStep(status, reason);
    this.step = null;
    this.refs = { ...this.refs, scenarioId: null, scenarioVersion: null, stepId: null };
    return status === "completed";
  }

  checkpoint(phase: PlaytestCapturePhase): CaptureRequestHandle | null {
    const frame = this.lastFrame;
    if (this.ended || !this.step || !frame || this.paused || this.benchmark) return null;
    if (!playtestStationReached(this.step.stationId, frame.position) || Math.abs(frame.speed) > 0.2 ||
      frame.flashlight !== (phase === "on")) return null;
    return this.capture.request({ reason: "checkpoint", fullResolution: true, phase, refs: { ...this.refs } });
  }

  status(): PlaytestDiaryStatus {
    return { runId: this.identity.runId, frameId: this.counter, paused: this.paused,
      benchmark: this.benchmark, ended: this.ended, stationId: this.step?.stationId ?? null,
      reached: !!this.step && !!this.lastFrame && playtestStationReached(this.step.stationId, this.lastFrame.position),
      capture: this.capture.snapshot(), pendingActions: this.pending.size };
  }

  /** Called before Game disposes the canvas. Encoded copies can finish afterward;
   * the bounded media tail is independent of the Game's rendering resources. */
  close(reason: string): Promise<void> {
    if (this.closePromise) return this.closePromise;
    this.cancelPending(reason);
    if (this.step) this.endStep("failed", "game-ended-before-step");
    this.timeline.endGame(reason);
    this.ended = true;
    this.capture.setMode("paused");
    this.lastFrame = null;
    this.closePromise = this.capture.flush({ timeoutMs: 3000 }).then((result) => {
      this.options.recorder.event("playtest-media-end", { ...this.identity, ...result });
    }).catch(() => {
      this.options.recorder.event("playtest-media-end", { ...this.identity, failed: true });
    }).finally(() => this.capture.dispose());
    return this.closePromise;
  }
}
