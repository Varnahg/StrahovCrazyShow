import {
  canonicalTimelineInput,
  DEFAULT_INPUT_LEAD_TICKS,
  INPUT_TIMELINE_HZ,
  MAX_FUTURE_INPUT_TICKS,
  timelineStep,
  validTimelineAuthority,
  type TimelineAuthority,
  type TimelineInput,
  type TimelineMode,
  type TimelineStep,
  neutralTimelineInput,
} from "../shared/input-timeline";
import type { Input } from "../shared/types";

const STEP_MS = 1000 / INPUT_TIMELINE_HZ;
export const MAX_TIMELINE_REPLAY_TICKS = 32;
export const MAX_TIMELINE_FRAME_TICKS = 16;
export const MAX_AUTHORITY_AGE_MS = 250;
const MAX_LEAD_TICKS = MAX_FUTURE_INPUT_TICKS - 4;
// Cover a 15FPS producer plus one-way transport; future bound still leaves four
// extra server ticks. Lead alone cannot repair an indefinitely stalled renderer.
const DELIVERY_MARGIN_TICKS = 5;
export type PredictedTimelineStep = TimelineStep & { time: number };
export type AuthorityAcceptance =
  | { accepted: false; reason: "invalid" | "stale" }
  | {
      accepted: true;
      epochChanged: boolean;
      rebase: boolean;
      replay: PredictedTimelineStep[];
    };
export type TimelineAdvance =
  | {
      status: "waiting";
      reason:
        | "no-authority"
        | "stale-authority"
        | "prediction-budget"
        | "latency-budget";
    }
  | { status: "advanced"; steps: number; targetSeq: number; remaining: number };

/** Bounded command-time planner. The integration owns actor restore/capture and
 * applies each returned replay step exactly once after restoring authority.state. */
export class NetworkTimeline {
  private anchor: TimelineAuthority | null = null;
  private receivedAt = 0;
  private predictedSeq = 0;
  private inputs = new Map<number, TimelineInput>();
  private rttMs = 0;
  private mode: TimelineMode = { vehicle: false, yaw: 0 };
  // State packets can arrive late. Their receipt must not rewind the separate
  // estimate of the continuously advancing server clock inside this epoch.
  private clockSeq = 0;
  private clockAt = 0;
  private hasTimingSample = false;
  private clockNeedsCalibration = true;

  setRtt(rttMs: number): boolean {
    if (!Number.isFinite(rttMs) || rttMs < 0) return false;
    this.rttMs = rttMs;
    if (!this.hasTimingSample) this.clockNeedsCalibration = true;
    this.hasTimingSample = true;
    return true;
  }

  get leadTicks() {
    return Math.min(
      MAX_LEAD_TICKS,
      Math.max(
        DEFAULT_INPUT_LEAD_TICKS,
        Math.ceil(this.rttMs / 2 / STEP_MS) + DELIVERY_MARGIN_TICKS,
      ),
    );
  }

  get deliveryBudgetExceeded() {
    return (
      Math.ceil(this.rttMs / 2 / STEP_MS) + DELIVERY_MARGIN_TICKS >
      MAX_LEAD_TICKS
    );
  }

  acceptAuthority(
    authority: TimelineAuthority,
    receivedAt: number,
    mode: TimelineMode,
  ): AuthorityAcceptance {
    if (
      !validTimelineAuthority(authority) ||
      !Number.isFinite(receivedAt) ||
      receivedAt < 0
    )
      return { accepted: false, reason: "invalid" };
    const previous = this.anchor;
    if (
      previous &&
      (authority.inputEpoch < previous.inputEpoch ||
        authority.tick < previous.tick ||
        (authority.inputEpoch === previous.inputEpoch &&
          (authority.inputTickBase !== previous.inputTickBase ||
            authority.ack <= previous.ack)))
    )
      return { accepted: false, reason: "stale" };
    const epochChanged =
      !previous || authority.inputEpoch !== previous.inputEpoch;
    const rebase =
      epochChanged ||
      authority.ack > this.predictedSeq ||
      this.predictedSeq - authority.ack > MAX_TIMELINE_REPLAY_TICKS;
    // A sample that already exceeds our delivery budget cannot establish a
    // clock offset. Keep calibration pending until an eligible sample arrives.
    const canCalibrate = this.hasTimingSample && !this.deliveryBudgetExceeded;
    if (epochChanged) {
      this.clockSeq =
        authority.ack + (canCalibrate ? this.rttMs / 2 / STEP_MS : 0);
      this.clockAt = receivedAt;
      this.clockNeedsCalibration = !canCalibrate;
    } else {
      const at = Math.max(this.clockAt, receivedAt);
      const calibrationMs =
        this.clockNeedsCalibration && canCalibrate ? this.rttMs / 2 : 0;
      this.clockSeq = Math.max(
        this.estimateServerSeq(at),
        authority.ack + (at - receivedAt + calibrationMs) / STEP_MS,
      );
      this.clockAt = at;
      if (canCalibrate) this.clockNeedsCalibration = false;
    }
    this.anchor = { ...authority };
    this.mode = { ...mode };
    this.receivedAt = receivedAt;
    if (rebase) {
      this.inputs.clear();
      this.predictedSeq = authority.ack;
    } else
      for (const seq of this.inputs.keys())
        if (seq <= authority.ack) this.inputs.delete(seq);
    const replay: PredictedTimelineStep[] = [];
    for (let seq = authority.ack + 1; seq <= this.predictedSeq; seq++) {
      const step = timelineStep(
        this.inputs.get(seq),
        seq,
        authority.inputEpoch,
        mode,
      );
      // A filter applies to this authority's mode only. Keep the original wire
      // input: another mode change before its deadline may make it valid again.
      replay.push({ ...step, time: this.stepTime(seq) });
    }
    return { accepted: true, epochChanged, rebase, replay };
  }

  advance(
    now: number,
    inputForStep: (seq: number) => Input,
    applyStep: (step: PredictedTimelineStep) => void,
  ): TimelineAdvance {
    if (!this.anchor) return { status: "waiting", reason: "no-authority" };
    if (this.deliveryBudgetExceeded)
      return { status: "waiting", reason: "latency-budget" };
    const ageMs = now - this.receivedAt;
    if (!Number.isFinite(now) || ageMs < 0 || ageMs > MAX_AUTHORITY_AGE_MS)
      return { status: "waiting", reason: "stale-authority" };
    const estimatedServerSeq = this.estimateServerSeq(now);
    const targetSeq = Math.floor(estimatedServerSeq + 1e-8) + this.leadTicks;
    if (targetSeq - this.anchor.ack > MAX_TIMELINE_REPLAY_TICKS)
      return { status: "waiting", reason: "prediction-budget" };
    let steps = 0;
    // Catch-up time already resolved (or about to be resolved before a packet
    // can arrive) uses neutral controls. Do not consume a fresh jump edge there.
    const firstDeliverableSeq =
      Math.floor(estimatedServerSeq + this.rttMs / 2 / STEP_MS + 1e-8) +
      1 +
      (this.rttMs > 0 ? 1 : 0);
    while (this.predictedSeq < targetSeq && steps < MAX_TIMELINE_FRAME_TICKS) {
      const seq = this.predictedSeq + 1;
      const deliverable = seq >= firstDeliverableSeq;
      const input = deliverable
        ? canonicalTimelineInput({
            ...inputForStep(seq),
            seq,
            inputEpoch: this.anchor.inputEpoch,
          })
        : neutralTimelineInput(seq, this.anchor.inputEpoch, this.mode);
      if (!input) throw new TypeError("Invalid predicted timeline input");
      applyStep({
        input,
        source: deliverable ? "input" : "missing",
        time: this.stepTime(seq),
      });
      this.inputs.set(seq, input);
      this.predictedSeq = seq;
      steps++;
    }
    return {
      status: "advanced",
      steps,
      targetSeq,
      remaining: Math.max(0, targetSeq - this.predictedSeq),
    };
  }

  /** A known unsent/dropped command keeps its tick but becomes a neutral filler
   * on the next authority replay. No sequence is compressed or reused. */
  forgetInput(seq: number): void {
    this.inputs.delete(seq);
  }

  private stepTime(seq: number) {
    return this.anchor!.time + (seq - this.anchor!.ack) * STEP_MS;
  }

  private estimateServerSeq(now: number) {
    return this.clockSeq + Math.max(0, now - this.clockAt) / STEP_MS;
  }

  snapshot() {
    return {
      inputEpoch: this.anchor?.inputEpoch ?? null,
      ack: this.anchor?.ack ?? null,
      predictedSeq: this.predictedSeq,
      retainedInputs: this.inputs.size,
      rttMs: this.rttMs,
      leadTicks: this.leadTicks,
      deliveryBudgetExceeded: this.deliveryBudgetExceeded,
      clockSeqAtAnchor: this.clockSeq,
      clockAnchorAtMs: this.clockAt,
      clockCalibrated: this.hasTimingSample && !this.clockNeedsCalibration,
    };
  }
}
