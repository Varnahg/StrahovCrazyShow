import type { Input, Vec3 } from "./types";
import type { VehicleState } from "./vehicle";
export type { Input } from "./types";

export const PROTOCOL_VERSION = 6;
export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;
export const MAX_CATCHUP_STEPS = 8;
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
  time: number;
  tick: number;
  ack: number;
  state: ActorState;
  resync?: boolean;
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

/** Wall time drives fixed simulation ticks, independent of callback frequency. */
export class FixedStepClock {
  accumulator = 0;
  tick = 0;
  droppedSeconds = 0;
  advance(elapsed: number, step: (dt: number, tick: number) => void) {
    if (!Number.isFinite(elapsed) || elapsed < 0)
      return { steps: 0, dropped: 0 };
    this.accumulator += elapsed;
    let steps = 0;
    while (this.accumulator + 1e-10 >= FIXED_DT && steps < MAX_CATCHUP_STEPS) {
      this.accumulator -= FIXED_DT;
      step(FIXED_DT, ++this.tick);
      steps++;
    }
    let dropped = 0;
    if (this.accumulator >= FIXED_DT) {
      dropped = this.accumulator - (this.accumulator % FIXED_DT);
      this.accumulator %= FIXED_DT;
      this.droppedSeconds += dropped;
    }
    return { steps, dropped };
  }
}

/** Reliable ordered transport still needs a bounded, deduplicated per-tick queue. */
export class InputQueue {
  pending: Input[] = [];
  ack = 0;
  lastReceived = 0;
  lastAt = 0;
  last: Input = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
  push(input: Input, now: number) {
    if (
      input.seq <= this.lastReceived ||
      input.seq !== this.lastReceived + 1 ||
      this.pending.length >= 64
    )
      return false;
    this.pending.push(input);
    this.lastReceived = input.seq;
    this.lastAt = now;
    return true;
  }
  consume(now: number) {
    const input = this.pending.shift();
    if (input) {
      this.ack = input.seq;
      this.last = input;
      return input;
    }
    // A missing command must not add unacknowledged horizontal motion.
    return {
      ...this.last,
      x: 0,
      z: 0,
      jump: false,
      seq: this.ack,
    };
  }
  reset() {
    this.pending = [];
    this.ack = this.lastReceived;
    this.last = { x: 0, z: 0, yaw: 0, jump: false, seq: this.ack };
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
  acknowledge(ack: number) {
    this.inputs = this.inputs.filter((i) => i.seq > ack);
    for (const seq of this.states.keys())
      if (seq <= ack) this.states.delete(seq);
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
    for (const [id, x, y, z, yaw, speed, _ack, vehicle, zone] of packet.rows) {
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
