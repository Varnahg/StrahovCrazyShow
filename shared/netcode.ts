import type { Input, Vec3 } from "./types";
import type { VehicleState } from "./vehicle";
import type {
  AuthorityNetworkDiagnostics,
  InputQueueDiagnostics,
  ResyncReason,
} from "./network-diagnostics";
export type { Input } from "./types";

// V11 input seq identifies a scheduled simulation tick inside a server epoch.
// V10 command-count acknowledgements cannot predict this timeline safely.
export const PROTOCOL_VERSION = 11;
export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;
export const MAX_CATCHUP_STEPS = 8;
// More than 133ms of queued commands cannot drain while both peers run at 60Hz.
export const INPUT_BACKLOG_MAX_COMMANDS = 8;
export const INPUT_BACKLOG_RECOVERY_INTERVAL_MS = 1000;
export type ActorState = {
  position: Vec3;
  yaw: number;
  speed: number;
  vertical: number;
  grounded: boolean;
  vehicle: boolean;
  vehicleState?: VehicleState;
};
export type Authority = {
  /** UTC instant used by the represented simulation tick. */
  time: number;
  tick: number;
  ack: number;
  inputEpoch: number;
  inputTickBase: number;
  receivedSeq: number;
  state: ActorState;
  resync?: boolean;
  /** Own-session diagnostics are optional; the epoch/time frontier is required. */
  resyncReason?: ResyncReason;
  network?: AuthorityNetworkDiagnostics;
  /** Only the reply to an explicit respawn request, never a generic resync. */
  respawn?: true;
};
export type MotionPacket = {
  time: number;
  tick: number;
  rows: any[][];
  car?: VehicleState;
};

/** The same transform and quantization is applied before prediction and transport. */
export function canonicalInput(raw: any): Input | null {
  if (
    !raw ||
    !["x", "z", "yaw", "seq"].every(
      (k) => typeof raw[k] === "number" && Number.isFinite(raw[k]),
    )
  )
    return null;
  if (!Number.isSafeInteger(raw.seq) || raw.seq < 0) return null;
  const length = Math.hypot(raw.x, raw.z),
    magnitude = length > 1 + 1 / 32767 ? length : 1,
    quantize = (n: number) => Math.round(n * 32767) / 32767;
  return {
    x: quantize(raw.x / magnitude),
    z: quantize(raw.z / magnitude),
    yaw: quantize(raw.yaw % (Math.PI * 2)),
    seq: raw.seq,
    jump: raw.jump === true,
    run: raw.run === true,
    vehicle: typeof raw.vehicle === "boolean" ? raw.vehicle : undefined,
  };
}

export type FixedStepPlan = { steps: number; dropped: number };

function planFixedSteps(accumulator: number) {
  let steps = 0;
  while (accumulator + 1e-10 >= FIXED_DT && steps < MAX_CATCHUP_STEPS) {
    accumulator -= FIXED_DT;
    steps++;
  }
  const dropped =
    accumulator >= FIXED_DT ? accumulator - (accumulator % FIXED_DT) : 0;
  return {
    steps,
    dropped,
    remainder: dropped ? accumulator % FIXED_DT : accumulator,
  };
}

/** Wall time drives fixed simulation ticks, independent of callback frequency. */
export class FixedStepClock {
  accumulator = 0;
  tick = 0;
  droppedSeconds = 0;
  advance(
    elapsed: number,
    step: (dt: number, tick: number) => void,
    beforeSteps?: (plan: Readonly<FixedStepPlan>) => void,
  ) {
    if (!Number.isFinite(elapsed) || elapsed < 0)
      return { steps: 0, dropped: 0 };
    this.accumulator += elapsed;
    const plan = planFixedSteps(this.accumulator);
    beforeSteps?.({ steps: plan.steps, dropped: plan.dropped });
    for (let index = 0; index < plan.steps; index++) {
      this.accumulator -= FIXED_DT;
      step(FIXED_DT, ++this.tick);
    }
    this.accumulator = plan.remainder;
    this.droppedSeconds += plan.dropped;
    return { steps: plan.steps, dropped: plan.dropped };
  }
}

/** Legacy V10 command FIFO, retained for regression comparisons only.
 * The V11 server uses TimelineInputQueue and never executes late commands. */
export class InputQueue {
  pending: Input[] = [];
  ack = 0;
  lastReceived = 0;
  lastAt = 0;
  private lastBacklogRecoveryAt = -Infinity;
  private queuedAt = new Map<number, number>();
  private maxDepth = 0;
  private accepted = 0;
  private rejectedDuplicate = 0;
  private rejectedGap = 0;
  private rejectedCapacity = 0;
  private consumed = 0;
  private idleTicks = 0;
  private idleTicksSinceAck = 0;
  private lastAppliedTick: number | null = null;
  private resets = 0;
  private discarded = 0;
  last: Input = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  push(input: Input, now: number) {
    if (input.seq <= this.lastReceived) {
      this.rejectedDuplicate++;
      return false;
    }
    if (input.seq !== this.lastReceived + 1) {
      this.rejectedGap++;
      return false;
    }
    if (this.pending.length >= 64) {
      this.rejectedCapacity++;
      return false;
    }
    this.pending.push(input);
    this.queuedAt.set(input.seq, now);
    this.accepted++;
    this.maxDepth = Math.max(this.maxDepth, this.pending.length);
    this.lastReceived = input.seq;
    this.lastAt = now;
    return true;
  }
  consume(now: number, tick?: number) {
    const input = this.pending.shift();
    if (input) {
      this.queuedAt.delete(input.seq);
      this.consumed++;
      this.idleTicksSinceAck = 0;
      this.lastAppliedTick =
        typeof tick === "number" && Number.isSafeInteger(tick) && tick >= 0
          ? tick
          : null;
      this.ack = input.seq;
      this.last = input;
      return input;
    }
    this.idleTicks++;
    this.idleTicksSinceAck++;
    // A missing command must not add unacknowledged horizontal motion.
    return {
      ...this.last,
      x: 0,
      z: 0,
      jump: false,
      seq: this.ack,
    };
  }
  /** Never accelerate the actor to drain a queue. The caller must send a forced
   * authority after this reset so the client knows which commands were discarded. */
  recoverBacklog(now: number): boolean {
    if (
      !Number.isFinite(now) ||
      this.pending.length <= INPUT_BACKLOG_MAX_COMMANDS ||
      now - this.lastBacklogRecoveryAt < INPUT_BACKLOG_RECOVERY_INTERVAL_MS
    )
      return false;
    this.reset();
    this.lastBacklogRecoveryAt = now;
    return true;
  }
  reset() {
    this.resets++;
    this.discarded += this.pending.length;
    this.pending = [];
    this.queuedAt.clear();
    this.idleTicksSinceAck = 0;
    this.ack = this.lastReceived;
    this.last = { x: 0, z: 0, yaw: 0, jump: false, seq: this.ack };
  }
  diagnostics(now: number): InputQueueDiagnostics {
    const age = (at: number | undefined) =>
      at !== undefined && Number.isFinite(at) && Number.isFinite(now)
        ? Math.max(0, now - at)
        : null;
    return {
      depth: this.pending.length,
      maxDepth: this.maxDepth,
      ack: this.ack,
      receivedSeq: this.lastReceived,
      lastInputAgeMs: this.accepted ? age(this.lastAt) : null,
      oldestQueuedAgeMs: age(
        this.pending[0] ? this.queuedAt.get(this.pending[0].seq) : undefined,
      ),
      lastAppliedTick: this.lastAppliedTick,
      accepted: this.accepted,
      rejectedDuplicate: this.rejectedDuplicate,
      rejectedGap: this.rejectedGap,
      rejectedCapacity: this.rejectedCapacity,
      consumed: this.consumed,
      idleTicks: this.idleTicks,
      idleTicksSinceAck: this.idleTicksSinceAck,
      resets: this.resets,
      discarded: this.discarded,
    };
  }
}

export class PredictionHistory {
  inputs: Input[] = [];
  states = new Map<number, ActorState>();
  push(input: Input, state?: ActorState) {
    this.inputs.push(input);
    if (state) this.states.set(input.seq, state);
    if (this.inputs.length > 180) {
      const old = this.inputs.shift();
      if (old) this.states.delete(old.seq);
    }
  }
  acknowledge(ack: number, vehicle?: boolean) {
    this.inputs = this.inputs.filter((input) => {
      if (
        input.seq > ack &&
        (vehicle === undefined ||
          input.vehicle === undefined ||
          input.vehicle === vehicle)
      )
        return true;
      this.states.delete(input.seq);
      return false;
    });
    return this.inputs;
  }
  clear() {
    this.inputs = [];
    this.states.clear();
  }
}

type RemotePose = {
  time: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  speed: number;
  vehicle: boolean;
  zone: string;
  grounded?: boolean;
};
export function angleLerp(a: number, b: number, t: number) {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}
export class SnapshotBuffer {
  entities = new Map<string, RemotePose[]>();
  offset: number | undefined;
  push(packet: MotionPacket, receivedAt = Date.now()) {
    const difference = packet.time - receivedAt;
    this.offset =
      this.offset === undefined
        ? difference
        : this.offset * 0.98 + difference * 0.02;
    for (const [
      id,
      x,
      y,
      z,
      yaw,
      speed,
      _ack,
      vehicle,
      zone,
      grounded,
    ] of packet.rows) {
      const list = this.entities.get(id) || [];
      if (list.length && list[list.length - 1].time >= packet.time) continue;
      list.push({
        time: packet.time,
        x,
        y,
        z,
        yaw,
        speed,
        vehicle: !!vehicle,
        zone,
        grounded: typeof grounded === "boolean" ? grounded : undefined,
      });
      if (list.length > 30) list.shift();
      this.entities.set(id, list);
    }
  }
  sample(id: string, now = Date.now()): RemotePose | undefined {
    const list = this.entities.get(id);
    if (!list?.length) return;
    const renderTime = now + (this.offset || 0) - 100;
    let a = list[0],
      b = a;
    for (let i = 1; i < list.length; i++) {
      b = list[i];
      if (b.time >= renderTime) break;
      a = b;
    }
    const t =
      a.time === b.time
        ? 0
        : Math.max(0, Math.min(1, (renderTime - a.time) / (b.time - a.time)));
    return {
      ...a,
      // This is contact presentation, not another physics simulation. A known
      // airborne endpoint makes the interior of the interpolated segment air;
      // otherwise a rising/descending root would still claim floor contact.
      // Exact endpoints retain their own state, including unknown old records.
      grounded:
        t === 0
          ? a.grounded
          : t === 1
            ? b.grounded
            : a.grounded === undefined || b.grounded === undefined
              ? undefined
              : a.grounded && b.grounded,
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      yaw: angleLerp(a.yaw, b.yaw, t),
      speed: a.speed + (b.speed - a.speed) * t,
    };
  }
  remove(id: string) {
    this.entities.delete(id);
  }
}
