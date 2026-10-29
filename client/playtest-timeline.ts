import {
  PLAYTEST_LIMITS as LIMIT,
  copyPlaytestFrameSample,
  copyPlaytestEnvironment,
  copyPlaytestIdentity,
  copyPlaytestInputSample,
  copyPlaytestSourceIdentity,
  isPlaytestCapturePhase,
  isPlaytestId,
  type PlaytestActionRequest,
  type PlaytestActionResult,
  type PlaytestActionState,
  type PlaytestEventKind,
  type PlaytestFrameSample,
  type PlaytestIdentity,
  type PlaytestIncidentTrigger,
  type PlaytestInputSample,
  type PlaytestRefs,
  type PlaytestRunInfo,
  type PlaytestStep,
} from "../shared/playtest-diary";
import { diagnosticsByteLength, sanitizeDiagnosticsData, sanitizeDiagnosticsText } from "../shared/session-diagnostics";

/** Adapter to the existing SessionDiagnostics. event means submitted, not saved. */
export interface PlaytestSink {
  isRecording(): boolean;
  sessionId(): string | null;
  event(kind: string, data: unknown): void;
}
export type PlaytestTimelineStats = {
  submittedRecords: number;
  invalidSamples: number;
  inactiveCalls: number;
  sessionChanges: number;
  sinkErrors: number;
  oversizedRecords: number;
  inputs: number;
  frames: number;
  poseSamples: number;
  incidents: number;
  coalescedTriggers: number;
  droppedTriggers: number;
  cancelledActions: number;
  ringFrames: number;
  pendingInputs: number;
  pendingPoses: number;
  pendingActions: number;
  incidentOpen: boolean;
  started: boolean;
  ended: boolean;
  detached: boolean;
};
type Action = { request: PlaytestActionRequest; refs: PlaytestRefs };
type Coverage = { count: number; firstAtMs: number | null; lastAtMs: number | null; capacityTruncated: boolean };
type Incident = {
  id: string;
  refs: PlaytestRefs;
  trigger: PlaytestIncidentTrigger;
  deadline: number;
  before: PlaytestFrameSample[];
  beforeCursor: number;
  after: PlaytestFrameSample[];
  beforeCoverage: Coverage;
  afterCoverage: Coverage;
  chunkIndex: number;
  triggers: PlaytestIncidentTrigger[];
  coalescedTriggers: number;
  droppedTriggers: number;
};
const emptyRefs = (): PlaytestRefs => ({ connectionId: null, scenarioId: null, scenarioVersion: null, stepId: null });
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const atTime = (value: unknown): value is number => finite(value) && value >= 0;
const frameId = (value: unknown): value is number | null => value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
const reasonText = (value: unknown): string | undefined => typeof value === "string" ? sanitizeDiagnosticsText(value, 256) : undefined;
const own = (value: unknown, key: string): unknown => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
};
const lightingModes = ["real", "day", "golden-hour", "blue-hour", "night", "full-moon"];
const qualities = ["low", "medium", "high"];

function copyActionState(value: unknown): PlaytestActionState | undefined {
  if (value === undefined) return undefined;
  const out: Record<string, boolean | number | string> = {};
  for (const key of ["vehicle", "flashlight", "firstPerson", "ready", "respawnPending"]) {
    const current = own(value, key);
    if (typeof current === "boolean") out[key] = current;
  }
  for (const [key, allowed] of [["quality", qualities], ["qualityMode", ["auto", ...qualities]], ["lightingMode", lightingModes]] as const) {
    const current = own(value, key);
    if (typeof current === "string" && allowed.includes(current)) out[key] = current;
  }
  const distance = own(value, "distance");
  if (finite(distance)) out.distance = distance;
  return out as PlaytestActionState;
}
function copyRequest(value: unknown): PlaytestActionRequest | null {
  try {
    const action = own(value, "action"), origin = own(value, "origin"), atMs = own(value, "atMs"), frame = own(value, "frameId"), phase = own(value, "phase");
    if (!isPlaytestId(action) || !["keyboard", "hud", "scenario", "system"].includes(origin as string) || !atTime(atMs) || !frameId(frame) || (phase !== undefined && !isPlaytestCapturePhase(phase))) return null;
    return { action, origin: origin as PlaytestActionRequest["origin"], atMs, frameId: frame,
      ...(phase === undefined ? {} : { phase }), before: copyActionState(own(value, "before")) };
  } catch { return null; }
}
function copyResult(value: unknown): PlaytestActionResult | null {
  try {
    const status = own(value, "status"), atMs = own(value, "atMs"), frame = own(value, "frameId");
    if (!["applied", "rejected", "cancelled"].includes(status as string) || !atTime(atMs) || !frameId(frame)) return null;
    return { status: status as PlaytestActionResult["status"], atMs, frameId: frame,
      reason: reasonText(own(value, "reason")), after: copyActionState(own(value, "after")) };
  } catch { return null; }
}
function copyTrigger(value: unknown): PlaytestIncidentTrigger | null {
  try {
    const kind = own(value, "kind"), atMs = own(value, "atMs"), frame = own(value, "frameId"), actionId = own(value, "actionId");
    if (!["frame-hitch", "correction", "manual", "error"].includes(kind as string) || !atTime(atMs) || !frameId(frame) || (actionId !== undefined && !isPlaytestId(actionId))) return null;
    const durationMs = own(value, "durationMs"), correctionMetres = own(value, "correctionMetres");
    if ((durationMs !== undefined && !atTime(durationMs)) || (correctionMetres !== undefined && !atTime(correctionMetres))) return null;
    return { kind: kind as PlaytestIncidentTrigger["kind"], atMs, frameId: frame,
      ...(actionId === undefined ? {} : { actionId }), reason: reasonText(own(value, "reason")),
      ...(durationMs === undefined ? {} : { durationMs }), ...(correctionMetres === undefined ? {} : { correctionMetres }) };
  } catch { return null; }
}
function copyStep(value: unknown): PlaytestStep | null {
  try {
    const scenarioId = own(value, "scenarioId"), scenarioVersion = own(value, "scenarioVersion"), stepId = own(value, "stepId"), stationId = own(value, "stationId"), traversal = own(value, "traversal");
    const trial = own(value, "trial"), lightingMode = own(trial, "lightingMode"), lightingInstant = own(trial, "lightingInstant"), view = own(trial, "view"), qualityMode = own(trial, "qualityMode"), quality = own(trial, "quality");
    if (![scenarioId, scenarioVersion, stepId, stationId].every(isPlaytestId) || !["normal-input", "teleport", "unknown"].includes(traversal as string) ||
      !lightingModes.includes(lightingMode as string) || !(lightingInstant === null || atTime(lightingInstant)) || !["first", "third", "vehicle"].includes(view as string) ||
      !["auto", ...qualities].includes(qualityMode as string) || !qualities.includes(quality as string)) return null;
    return { scenarioId, scenarioVersion, stepId, stationId, traversal,
      trial: { lightingMode, lightingInstant, view, qualityMode, quality } } as PlaytestStep;
  } catch { return null; }
}

/** Bounded observational diary. It never changes input, clocks, simulation or rendering. */
export class PlaytestTimeline {
  private readonly identity: PlaytestIdentity;
  private readonly run: PlaytestRunInfo;
  private refs = emptyRefs();
  private step: PlaytestStep | null = null;
  private started = false;
  private ended = false;
  private detached = false;
  private nextId = 0;
  private inputs: PlaytestInputSample[] = [];
  private poses: PlaytestFrameSample[] = [];
  private ring: (PlaytestFrameSample | undefined)[] = new Array(LIMIT.incidentBeforeFrames);
  private ringStart = 0;
  private ringCount = 0;
  private lastCapacityEvictedAt = -Infinity;
  private lastFrameId = -1;
  private lastFrameAt = -Infinity;
  private lastInputAt = -Infinity;
  private lastPoseAt = -Infinity;
  private incident: Incident | null = null;
  private lastIncidentEnd = -Infinity;
  private actions = new Map<string, Action>();
  private counts = {
    submittedRecords: 0, invalidSamples: 0, inactiveCalls: 0, sessionChanges: 0,
    sinkErrors: 0, oversizedRecords: 0, inputs: 0, frames: 0, poseSamples: 0,
    incidents: 0, coalescedTriggers: 0, droppedTriggers: 0, cancelledActions: 0,
  };
  private reportedGaps = "";

  constructor(private readonly options: {
    sink: PlaytestSink;
    identity: PlaytestIdentity;
    run: PlaytestRunInfo;
    now: () => number;
    makeId: () => string;
  }) {
    const identity = copyPlaytestIdentity(options.identity);
    const source = copyPlaytestSourceIdentity(options.run?.source);
    const environment = options.run?.environment === undefined ? undefined : copyPlaytestEnvironment(options.run.environment);
    if (!identity || !source || environment === null || !atTime(options.run?.clockOriginUtcMs) || !["off", "checkpoints", "incident"].includes(options.run?.captureMode))
      throw new TypeError("Invalid playtest identity or run information");
    this.identity = identity;
    this.run = { clockOriginUtcMs: options.run.clockOriginUtcMs, source, captureMode: options.run.captureMode, ...(environment === undefined ? {} : { environment }) };
  }

  private now() {
    try { const value = this.options.now(); return atTime(value) ? value : Math.max(0, this.lastFrameAt); }
    catch { return Math.max(0, this.lastFrameAt); }
  }
  private ready(requireStarted = true): boolean {
    if (this.ended || this.detached || (requireStarted && !this.started)) return false;
    try {
      const session = this.options.sink.sessionId();
      if (session !== null && session !== this.identity.sessionId) {
        this.counts.sessionChanges++;
        this.detached = true;
        this.clearBuffers();
        return false;
      }
      if (session === null || !this.options.sink.isRecording()) {
        this.counts.inactiveCalls++;
        return false;
      }
      return true;
    } catch { this.counts.sinkErrors++; return false; }
  }
  private id(kind: string) {
    let generated: string;
    try { generated = this.options.makeId(); } catch { generated = "local"; }
    // The counter prevents collision even with a repeated/injected ID generator.
    return `${kind}:${isPlaytestId(generated) ? generated.slice(0, 72) : "local"}:${++this.nextId}`;
  }
  private emit(kind: PlaytestEventKind, body: object, refs: PlaytestRefs = this.refs): boolean {
    if (!this.ready(false)) return false;
    try {
      const data = sanitizeDiagnosticsData({ ...this.identity, refs: { ...refs }, ...body });
      if (diagnosticsByteLength(data) > LIMIT.eventDataBytes) { this.counts.oversizedRecords++; return false; }
      this.options.sink.event(kind, data);
      this.counts.submittedRecords++;
      return true;
    } catch { this.counts.sinkErrors++; return false; }
  }
  startGame(): boolean {
    if (this.started || !this.ready(false)) return false;
    this.started = true;
    return this.emit("playtest-game-start", { run: this.run });
  }
  setConnection(connectionId: string | null): boolean {
    if (!this.ready() || (connectionId !== null && !isPlaytestId(connectionId))) return false;
    if (connectionId === this.refs.connectionId) return true;
    this.flush("connection-change");
    this.finishIncident("connection-change");
    this.cancelActions("connection-change");
    this.clearRing();
    this.refs.connectionId = connectionId;
    return true;
  }
  startStep(value: PlaytestStep): boolean {
    if (!this.ready()) return false;
    const step = copyStep(value);
    if (!step) { this.counts.invalidSamples++; return false; }
    if (this.step) this.endStep("skipped", "step-replaced");
    this.flush("step-start");
    this.step = step;
    Object.assign(this.refs, { scenarioId: step.scenarioId, scenarioVersion: step.scenarioVersion, stepId: step.stepId });
    return this.emit("playtest-step-start", { step });
  }
  endStep(status: "completed" | "failed" | "skipped", reason?: string): boolean {
    if (!this.ready() || !this.step || !["completed", "failed", "skipped"].includes(status)) return false;
    this.flush("step-end");
    this.finishIncident("step-end");
    this.cancelActions("step-end");
    const submitted = this.emit("playtest-step-end", { step: this.step, status, reason: reasonText(reason) ?? null });
    this.step = null;
    this.refs.scenarioId = this.refs.scenarioVersion = this.refs.stepId = null;
    this.clearRing();
    return submitted;
  }
  recordInput(value: PlaytestInputSample): boolean {
    if (!this.ready()) return false;
    const sample = copyPlaytestInputSample(value);
    if (!sample || sample.atMs < this.lastInputAt) { this.counts.invalidSamples++; return false; }
    const first = this.inputs[0];
    if (first && (first.inputEpoch !== sample.inputEpoch || sample.atMs - first.atMs >= LIMIT.windowMs)) this.flushInputs();
    this.inputs.push(sample);
    this.lastInputAt = sample.atMs;
    this.counts.inputs++;
    if (this.inputs.length >= LIMIT.inputWindowSamples) this.flushInputs();
    return true;
  }
  recordFrame(value: PlaytestFrameSample): boolean {
    if (!this.ready()) return false;
    const sample = copyPlaytestFrameSample(value);
    if (!sample || sample.frameId <= this.lastFrameId || sample.frameStartedAtMs < this.lastFrameAt) { this.counts.invalidSamples++; return false; }
    this.lastFrameId = sample.frameId;
    this.lastFrameAt = sample.frameStartedAtMs;
    this.counts.frames++;
    this.appendRing(sample);
    if (sample.frameStartedAtMs - this.lastPoseAt >= LIMIT.poseIntervalMs) {
      if (this.poses[0] && sample.frameStartedAtMs - this.poses[0].frameStartedAtMs >= LIMIT.windowMs) this.flushPoses();
      this.poses.push(sample);
      this.lastPoseAt = sample.frameStartedAtMs;
      this.counts.poseSamples++;
      if (this.poses.length >= LIMIT.poseWindowSamples) this.flushPoses();
    }
    const incident = this.incident;
    if (incident && sample.frameStartedAtMs > incident.trigger.atMs && sample.frameStartedAtMs <= incident.deadline) {
      if (incident.afterCoverage.count < LIMIT.incidentAfterFrames) {
        incident.after.push(sample);
        incident.afterCoverage.count++;
        incident.afterCoverage.firstAtMs ??= sample.frameStartedAtMs;
        incident.afterCoverage.lastAtMs = sample.frameStartedAtMs;
      } else incident.afterCoverage.capacityTruncated = true;
    }
    this.pumpIncident();
    if (incident && sample.frameStartedAtMs >= incident.deadline) this.finishIncident("window-complete");
    return true;
  }
  requestAction(value: PlaytestActionRequest): string | null {
    if (!this.ready()) return null;
    const request = copyRequest(value);
    if (!request) { this.counts.invalidSamples++; return null; }
    if (this.actions.size >= LIMIT.pendingActions) {
      const oldest = this.actions.keys().next().value!;
      this.finishAction(oldest, { status: "cancelled", reason: "action-capacity", atMs: Math.max(this.now(), this.actions.get(oldest)!.request.atMs), frameId: this.lastFrameId < 0 ? null : this.lastFrameId });
    }
    const actionId = this.id("action"), refs = { ...this.refs, actionId };
    this.actions.set(actionId, { request, refs });
    this.emit("playtest-action-request", { actionId, request }, refs);
    return actionId;
  }
  finishAction(actionId: string, value: PlaytestActionResult): boolean {
    if (!this.ready()) return false;
    const action = this.actions.get(actionId), result = copyResult(value);
    if (!action || !result || result.atMs < action.request.atMs) { this.counts.invalidSamples++; return false; }
    this.actions.delete(actionId);
    if (result.status === "cancelled") this.counts.cancelledActions++;
    return this.emit("playtest-action-result", { actionId, result }, action.refs);
  }
  triggerIncident(value: PlaytestIncidentTrigger): string | null {
    if (!this.ready()) return null;
    const trigger = copyTrigger(value);
    if (!trigger) { this.counts.invalidSamples++; return null; }
    if (this.incident && trigger.atMs > this.incident.deadline) this.finishIncident("window-complete");
    if (this.incident) {
      if (this.incident.triggers.length < LIMIT.incidentTriggers) {
        this.incident.triggers.push(trigger);
        this.incident.coalescedTriggers++;
        this.counts.coalescedTriggers++;
      } else { this.incident.droppedTriggers++; this.counts.droppedTriggers++; }
      return this.incident.id;
    }
    if (trigger.atMs < this.lastIncidentEnd + LIMIT.incidentCooldownMs) { this.counts.droppedTriggers++; return null; }
    const before = this.ringValues().filter((frame) => frame.frameStartedAtMs >= trigger.atMs - LIMIT.incidentBeforeMs && frame.frameStartedAtMs <= trigger.atMs);
    const id = this.id("incident"), refs = { ...this.refs, incidentId: id, ...(trigger.actionId ? { actionId: trigger.actionId } : {}) };
    this.incident = {
      id, refs, trigger, deadline: trigger.atMs + LIMIT.incidentAfterMs, before, beforeCursor: 0, after: [], chunkIndex: 0,
      beforeCoverage: { count: before.length, firstAtMs: before[0]?.frameStartedAtMs ?? null, lastAtMs: before.at(-1)?.frameStartedAtMs ?? null, capacityTruncated: this.lastCapacityEvictedAt >= trigger.atMs - LIMIT.incidentBeforeMs },
      afterCoverage: { count: 0, firstAtMs: null, lastAtMs: null, capacityTruncated: false },
      triggers: [trigger], coalescedTriggers: 0, droppedTriggers: 0,
    };
    this.counts.incidents++;
    this.emit("playtest-incident-start", { incidentId: id, trigger, beforeRequestedFromMs: Math.max(0, trigger.atMs - LIMIT.incidentBeforeMs), afterRequestedToMs: this.incident.deadline }, refs);
    this.pumpIncident();
    return id;
  }
  private appendRing(frame: PlaytestFrameSample) {
    while (this.ringCount && this.ring[this.ringStart]!.frameStartedAtMs < frame.frameStartedAtMs - LIMIT.incidentBeforeMs) this.evictRing();
    if (this.ringCount === this.ring.length) {
      this.lastCapacityEvictedAt = this.ring[this.ringStart]!.frameStartedAtMs;
      this.evictRing();
    }
    this.ring[(this.ringStart + this.ringCount) % this.ring.length] = frame;
    this.ringCount++;
  }
  private evictRing() {
    this.ring[this.ringStart] = undefined;
    this.ringStart = (this.ringStart + 1) % this.ring.length;
    this.ringCount--;
  }
  private ringValues() {
    return Array.from({ length: this.ringCount }, (_, index) => this.ring[(this.ringStart + index) % this.ring.length]!);
  }
  private clearRing() {
    this.ring.fill(undefined);
    this.ringStart = this.ringCount = 0;
    this.lastCapacityEvictedAt = -Infinity;
  }
  private pumpIncident(all = false) {
    const incident = this.incident;
    if (!incident) return;
    do {
      const before = incident.beforeCursor < incident.before.length;
      if (!before && (!incident.after.length || (!all && incident.after.length < LIMIT.incidentChunkFrames))) return;
      const available = before ? incident.before.slice(incident.beforeCursor, incident.beforeCursor + LIMIT.incidentChunkFrames) : incident.after.slice(0, LIMIT.incidentChunkFrames);
      const header = { incidentId: incident.id, phase: before ? "before" : "after", chunkIndex: incident.chunkIndex };
      const count = this.fittingSampleCount(available, header, incident.refs);
      const samples = available.slice(0, count);
      if (before) incident.beforeCursor += samples.length;
      else incident.after.splice(0, count);
      incident.chunkIndex++;
      this.emit("playtest-incident-frames", { ...header, samples }, incident.refs);
      if (!all) return;
    } while (incident.beforeCursor < incident.before.length || incident.after.length);
  }
  private finishIncident(reason: string) {
    const incident = this.incident;
    if (!incident) return;
    this.pumpIncident(true);
    this.emit("playtest-incident-end", { incidentId: incident.id, reason,
      before: incident.beforeCoverage, after: incident.afterCoverage,
      postIncomplete: reason !== "window-complete", triggers: incident.triggers,
      coalescedTriggers: incident.coalescedTriggers, droppedTriggers: incident.droppedTriggers }, incident.refs);
    this.lastIncidentEnd = reason === "window-complete" ? incident.deadline : this.now();
    this.incident = null;
  }
  private flushInputs() {
    if (!this.inputs.length) return;
    const samples = this.inputs;
    this.inputs = [];
    this.emitWindows("playtest-input-window", samples, (sample) => sample.atMs);
  }
  private flushPoses() {
    if (!this.poses.length) return;
    const samples = this.poses;
    this.poses = [];
    this.emitWindows("playtest-pose-window", samples, (sample) => sample.frameStartedAtMs);
  }
  /** Size the original projected tree before sanitization, which also has a node budget. */
  private fittingSampleCount<T>(samples: readonly T[], header: object, refs = this.refs): number {
    let count = samples.length;
    while (count > 1 && diagnosticsByteLength({ ...this.identity, refs, ...header, samples: samples.slice(0, count) }) > LIMIT.eventDataBytes)
      count = Math.max(1, Math.floor(count / 2));
    return count;
  }
  private emitWindows<T>(kind: "playtest-input-window" | "playtest-pose-window", samples: T[], time: (sample: T) => number) {
    let offset = 0;
    while (offset < samples.length) {
      const remaining = samples.slice(offset);
      const header = { windowId: this.id(kind), fromMs: time(remaining[0]), toMs: time(remaining.at(-1)!) };
      const count = this.fittingSampleCount(remaining, header);
      const part = remaining.slice(0, count);
      this.emit(kind, { ...header, toMs: time(part.at(-1)!), samples: part });
      offset += count;
    }
  }
  private cancelActions(reason: string) {
    for (const [actionId, action] of this.actions)
      this.finishAction(actionId, { status: "cancelled", reason, atMs: Math.max(this.now(), action.request.atMs), frameId: this.lastFrameId < 0 ? null : this.lastFrameId });
  }
  flush(reason: string): void {
    if (!this.ready()) return;
    this.flushInputs();
    this.flushPoses();
    const dropped = { invalidSamples: this.counts.invalidSamples, inactiveCalls: this.counts.inactiveCalls, sinkErrors: this.counts.sinkErrors, oversizedRecords: this.counts.oversizedRecords, droppedTriggers: this.counts.droppedTriggers };
    const signature = JSON.stringify(dropped);
    if (Object.values(dropped).some(Boolean) && signature !== this.reportedGaps) {
      if (this.emit("playtest-gap", { reason: reasonText(reason), cumulative: dropped })) this.reportedGaps = signature;
    }
  }
  endGame(reason: string): void {
    if (this.ended) return;
    if (this.ready()) {
      if (this.step) this.endStep("skipped", "game-ended");
      this.flush("game-end");
      this.finishIncident("game-end");
      this.cancelActions("game-end");
      this.emit("playtest-game-end", { reason: reasonText(reason) ?? "game-ended", stats: this.stats() });
    }
    this.ended = true;
    this.clearBuffers();
  }
  private clearBuffers() {
    this.inputs = [];
    this.poses = [];
    this.clearRing();
    this.actions.clear();
    this.incident = null;
    this.step = null;
    this.refs = emptyRefs();
  }
  stats(): PlaytestTimelineStats {
    return { ...this.counts, ringFrames: this.ringCount, pendingInputs: this.inputs.length,
      pendingPoses: this.poses.length, pendingActions: this.actions.size, incidentOpen: !!this.incident,
      started: this.started, ended: this.ended, detached: this.detached };
  }
}
