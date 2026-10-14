import {
  canonicalInput,
  SIM_HZ,
  FixedStepClock,
  type FixedStepPlan,
} from "./netcode";
import type { Input } from "./types";

export const INPUT_TIMELINE_HZ = SIM_HZ;
export const MAX_FUTURE_INPUT_TICKS = 16;
export const DEFAULT_INPUT_LEAD_TICKS = 6;
export type TimelineInput = Input & { inputEpoch: number };
export type TimelineMode = { vehicle: boolean; yaw: number };
export type TimelineFrontier = {
  inputEpoch: number;
  inputTickBase: number;
  tick: number;
  ack: number;
  receivedSeq: number;
};
export type TimelineAuthority = Omit<TimelineFrontier, "receivedSeq"> & {
  receivedSeq?: number;
  /** UTC instant used for simulation tick `tick`, not later packet-send time. */
  time: number;
};
export type TimelineStep = {
  input: TimelineInput;
  source: "input" | "missing" | "mode-mismatch";
};
export type TimelinePushResult =
  "accepted" | "invalid" | "epoch" | "late" | "ahead" | "duplicate";

/** UTC advances over dropped wall time before the remaining bounded physics
 * steps. Authority and motion then use exactly the last time passed to sim.tick. */
export class TimelineSimulationClock extends FixedStepClock {
  private utcTime: number;
  private skippedSeconds = 0;
  constructor(private readonly initialUTC: number) {
    super();
    if (!Number.isFinite(initialUTC) || initialUTC < 0)
      throw new RangeError("Invalid initial simulation UTC");
    this.utcTime = initialUTC;
  }
  get time() {
    return this.utcTime;
  }
  override advance(
    elapsed: number,
    step: (dt: number, tick: number, time: number) => void,
    beforeSteps?: (plan: Readonly<FixedStepPlan>) => void,
  ) {
    return super.advance(
      elapsed,
      (dt, tick) => {
        // Compute from an integer tick, rather than repeatedly adding 16.666ms
        // to a large UTC timestamp and accumulating floating-point clock drift.
        this.utcTime =
          this.initialUTC + (tick / SIM_HZ + this.skippedSeconds) * 1000;
        step(dt, tick, this.utcTime);
      },
      (plan) => {
        this.skippedSeconds += plan.dropped;
        beforeSteps?.(plan);
      },
    );
  }
}

export const validTimelineInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function canonicalTimelineInput(raw: unknown): TimelineInput | null {
  if (!raw || typeof raw !== "object") return null;
  const inputEpoch = (raw as { inputEpoch?: unknown }).inputEpoch;
  if (!validTimelineInteger(inputEpoch)) return null;
  const input = canonicalInput(raw);
  return input ? { ...input, inputEpoch } : null;
}

/** Missing/mode-filtered ticks still simulate time, but never repeat a jump. */
export function neutralTimelineInput(
  seq: number,
  inputEpoch: number,
  mode: TimelineMode,
): TimelineInput {
  return {
    seq,
    inputEpoch,
    x: 0,
    z: 0,
    yaw: Number.isFinite(mode.yaw) ? mode.yaw : 0,
    jump: false,
    run: false,
    vehicle: mode.vehicle,
  };
}

export function timelineStep(
  candidate: TimelineInput | undefined,
  seq: number,
  inputEpoch: number,
  mode: TimelineMode,
): TimelineStep {
  if (
    candidate &&
    candidate.inputEpoch === inputEpoch &&
    candidate.seq === seq &&
    (candidate.vehicle === undefined || candidate.vehicle === mode.vehicle)
  )
    return { input: { ...candidate }, source: "input" };
  return {
    input: neutralTimelineInput(seq, inputEpoch, mode),
    source: candidate ? "mode-mismatch" : "missing",
  };
}

export function validTimelineAuthority(value: TimelineAuthority): boolean {
  return (
    !!value &&
    [value.inputEpoch, value.inputTickBase, value.tick, value.ack].every(
      validTimelineInteger,
    ) &&
    value.tick >= value.inputTickBase &&
    value.ack === value.tick - value.inputTickBase &&
    (value.receivedSeq === undefined ||
      validTimelineInteger(value.receivedSeq)) &&
    Number.isFinite(value.time) &&
    value.time >= 0
  );
}

/** Future-only scheduled input. consume must be called once per world tick,
 * including ticks with no packet; it never advances the physics world itself. */
export class TimelineInputQueue {
  private pending = new Map<number, TimelineInput>();
  private currentTick: number;
  private receivedSeq = 0;
  private accepted = 0;
  private idleTicks = 0;
  private modeMismatchTicks = 0;
  private maxDepth = 0;
  private consumed = 0;
  private idleTicksSinceInput = 0;
  private lastAppliedTick: number | null = null;
  private resets = 0;
  private discarded = 0;
  private lastReceivedAt: number | undefined;
  private pendingAt = new Map<number, number>();
  private rejected: Record<Exclude<TimelinePushResult, "accepted">, number> = {
    invalid: 0,
    epoch: 0,
    late: 0,
    ahead: 0,
    duplicate: 0,
  };
  readonly maxFutureTicks: number;

  constructor(
    private inputEpoch: number,
    private inputTickBase: number,
    options: { maxFutureTicks?: number } = {},
  ) {
    this.maxFutureTicks = options.maxFutureTicks ?? MAX_FUTURE_INPUT_TICKS;
    if (
      !validTimelineInteger(inputEpoch) ||
      !validTimelineInteger(inputTickBase) ||
      !Number.isSafeInteger(this.maxFutureTicks) ||
      this.maxFutureTicks < 1 ||
      this.maxFutureTicks > MAX_FUTURE_INPUT_TICKS
    )
      throw new RangeError(
        "Invalid input timeline epoch, tick base or future bound",
      );
    this.currentTick = inputTickBase;
  }

  get ack() {
    return this.currentTick - this.inputTickBase;
  }

  push(raw: unknown, now?: number): TimelinePushResult {
    const input = canonicalTimelineInput(raw);
    let rejection: Exclude<TimelinePushResult, "accepted"> | undefined;
    if (!input) rejection = "invalid";
    else if (input.inputEpoch !== this.inputEpoch) rejection = "epoch";
    else if (input.seq <= this.ack) rejection = "late";
    else if (input.seq > this.ack + this.maxFutureTicks) rejection = "ahead";
    else if (this.pending.has(input.seq)) rejection = "duplicate";
    if (rejection) {
      this.rejected[rejection]++;
      return rejection;
    }
    this.pending.set(input!.seq, input!);
    if (typeof now === "number" && Number.isFinite(now)) {
      this.pendingAt.set(input!.seq, now);
      this.lastReceivedAt = now;
    }
    this.receivedSeq = Math.max(this.receivedSeq, input!.seq);
    this.accepted++;
    this.maxDepth = Math.max(this.maxDepth, this.pending.size);
    return "accepted";
  }

  consume(worldTick: number, mode: TimelineMode): TimelineStep {
    if (!validTimelineInteger(worldTick) || worldTick !== this.currentTick + 1)
      throw new RangeError(
        "Input timeline requires exactly the next world tick",
      );
    this.currentTick = worldTick;
    const step = timelineStep(
      this.pending.get(this.ack),
      this.ack,
      this.inputEpoch,
      mode,
    );
    this.pending.delete(this.ack);
    this.pendingAt.delete(this.ack);
    if (step.source === "missing") this.idleTicks++;
    if (step.source === "mode-mismatch") this.modeMismatchTicks++;
    if (step.source !== "missing") this.consumed++;
    if (step.source === "input") {
      this.lastAppliedTick = worldTick;
      this.idleTicksSinceInput = 0;
    } else this.idleTicksSinceInput++;
    return step;
  }

  reset(inputEpoch: number, worldTick: number): void {
    if (
      !validTimelineInteger(inputEpoch) ||
      inputEpoch <= this.inputEpoch ||
      !validTimelineInteger(worldTick) ||
      worldTick < this.currentTick
    )
      throw new RangeError(
        "Recovery requires a newer epoch at a current world tick",
      );
    this.inputEpoch = inputEpoch;
    this.inputTickBase = worldTick;
    this.currentTick = worldTick;
    this.discardPending();
    this.receivedSeq = 0;
    this.lastReceivedAt = undefined;
    this.idleTicksSinceInput = 0;
    this.resets++;
  }

  /** Used within the synchronous server clock-drop callback before simulation;
   * its caller must issue a new epoch before accepting another network task. */
  discardPending(): void {
    this.discarded += this.pending.size;
    this.pending.clear();
    this.pendingAt.clear();
  }

  frontier(): TimelineFrontier {
    return {
      inputEpoch: this.inputEpoch,
      inputTickBase: this.inputTickBase,
      tick: this.currentTick,
      ack: this.ack,
      receivedSeq: this.receivedSeq,
    };
  }

  diagnostics(now?: number) {
    const age = (at: number | undefined) =>
      at !== undefined && typeof now === "number" && Number.isFinite(now)
        ? Math.max(0, now - at)
        : null;
    let oldest: number | undefined;
    for (const at of this.pendingAt.values())
      oldest = oldest === undefined ? at : Math.min(oldest, at);
    return {
      ...this.frontier(),
      resolution: "scheduled-tick" as const,
      depth: this.pending.size,
      maxDepth: this.maxDepth,
      accepted: this.accepted,
      consumed: this.consumed,
      idleTicks: this.idleTicks,
      idleTicksSinceInput: this.idleTicksSinceInput,
      lastAppliedTick: this.lastAppliedTick,
      modeMismatchTicks: this.modeMismatchTicks,
      resets: this.resets,
      discarded: this.discarded,
      lastInputAgeMs: age(this.lastReceivedAt),
      oldestQueuedAgeMs: age(oldest),
      rejected: { ...this.rejected },
    };
  }
}

export type TimelineQueueDiagnostics = ReturnType<
  TimelineInputQueue["diagnostics"]
>;
