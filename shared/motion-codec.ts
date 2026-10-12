import type { MotionPacket } from "./netcode";
import { validVehicleState, type VehicleState } from "./vehicle";

// Quantization affects remote presentation only. Local authoritative/replay state
// stays on its separate, exact channel. Units: metres, radians, metres/second.
export const MOTION_POSITION_SCALE = 1000;
export const MOTION_YAW_SCALE = 10000;
export const MOTION_SPEED_SCALE = 1000;
const SCALES = [
  MOTION_POSITION_SCALE,
  MOTION_POSITION_SCALE,
  MOTION_POSITION_SCALE,
  MOTION_YAW_SCALE,
  MOTION_SPEED_SCALE,
] as const;
const FIELD_COUNT = 9;
const FIELD_MASK = (1 << FIELD_COUNT) - 1;
type Fields = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  string,
  boolean | undefined,
];
type Entry = { handle: number; id: string; fields: Fields };

/** Full row: [handle, identity, ...fields]. Delta: [handle, mask, ...changedFields]. */
export type MotionWire = {
  v: 1;
  s: number;
  t: number;
  n: number;
  p: number;
  k?: 1;
  r: unknown[][];
  d?: number[];
  c?: VehicleState;
};

const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value);
const nonnegative = (value: unknown): value is number =>
  integer(value) && value >= 0;
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const sameArray = (a: readonly unknown[], b: readonly unknown[]) =>
  a.length === b.length && a.every((value, i) => value === b[i]);
const sameVector = (a: { x: number; y: number; z: number }, b: typeof a) =>
  a.x === b.x && a.y === b.y && a.z === b.z;
const sameRotation = (a: VehicleState["rotation"], b: typeof a) =>
  sameVector(a, b) && a.w === b.w;

function sameCar(a: VehicleState | undefined, b: VehicleState) {
  return (
    !!a &&
    a.id === b.id &&
    a.driverId === b.driverId &&
    a.parked === b.parked &&
    a.sleeping === b.sleeping &&
    a.steering === b.steering &&
    sameVector(a.position, b.position) &&
    sameRotation(a.rotation, b.rotation) &&
    sameVector(a.parking.position, b.parking.position) &&
    sameRotation(a.parking.rotation, b.parking.rotation) &&
    sameVector(a.linvel, b.linvel) &&
    sameVector(a.angvel, b.angvel) &&
    sameVector(a.force, b.force) &&
    sameVector(a.torque, b.torque) &&
    sameArray(a.wheelSpin, b.wheelSpin) &&
    sameArray(a.wheelSuspension, b.wheelSuspension) &&
    sameArray(a.wheelContact, b.wheelContact)
  );
}

function isCar(value: unknown): value is VehicleState {
  return (
    object(value) &&
    typeof value.id === "string" &&
    validVehicleState(value as VehicleState)
  );
}

function validField(index: number, value: unknown) {
  if (index < 5) return integer(value);
  if (index === 5) return nonnegative(value); // Input acknowledgment is never quantized.
  if (index === 6) return value === 0 || value === 1;
  if (index === 7) return typeof value === "string";
  return typeof value === "boolean" || value === undefined;
}

function fieldsFromRow(row: unknown): { id: string; fields: Fields } {
  if (
    !Array.isArray(row) ||
    (row.length !== 9 && row.length !== 10) ||
    typeof row[0] !== "string"
  )
    throw new TypeError("Invalid motion row");
  const fields = [...row.slice(1, 9)] as Fields;
  fields.push(row[9]);
  for (let i = 0; i < SCALES.length; i++) {
    const value = fields[i];
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new TypeError("Invalid motion number");
    fields[i] = Math.round(value * SCALES[i]);
  }
  if (!fields.every((value, index) => validField(index, value)))
    throw new TypeError("Invalid motion fields");
  return { id: row[0], fields };
}

function fullRows(entries: Iterable<Entry>) {
  return [...entries].map(({ handle, id, fields }) => [
    handle,
    id,
    ...fields.slice(0, fields[8] === undefined ? 8 : 9),
  ]);
}

/** One encoder belongs to one authoritative world, never to an individual client. */
export class MotionEncoder {
  private sequence = 0;
  private nextHandle = 0;
  private lastKeyframe = 0;
  private forceKeyframe = true;
  private entries = new Map<string, Entry>();
  private car: VehicleState | undefined;
  private readonly keyframeInterval: number;

  constructor(options: { keyframeInterval?: number } = {}) {
    this.keyframeInterval = options.keyframeInterval ?? 40;
    if (!nonnegative(this.keyframeInterval) || this.keyframeInterval < 1)
      throw new TypeError("Invalid motion keyframe interval");
  }

  private prepare(packet: MotionPacket) {
    if (
      !Number.isFinite(packet.time) ||
      !nonnegative(packet.tick) ||
      !Array.isArray(packet.rows) ||
      (packet.car !== undefined && !isCar(packet.car))
    )
      throw new TypeError("Invalid motion packet");
    let nextHandle = this.nextHandle;
    const entries = new Map<string, Entry>();
    for (const row of packet.rows) {
      const { id, fields } = fieldsFromRow(row);
      if (entries.has(id)) throw new TypeError("Duplicate motion identity");
      entries.set(id, {
        id,
        handle: this.entries.get(id)?.handle ?? nextHandle++,
        fields,
      });
    }
    return { entries, nextHandle };
  }

  encode(packet: MotionPacket): MotionWire {
    const { entries, nextHandle } = this.prepare(packet);
    const sequence = this.sequence + 1;
    const removed = [...this.entries.values()]
      .filter((entry) => !entries.has(entry.id))
      .map((entry) => entry.handle);
    const rosterChanged =
      removed.length > 0 ||
      [...entries.keys()].some((id) => !this.entries.has(id));
    const full =
      this.forceKeyframe ||
      rosterChanged ||
      sequence - this.lastKeyframe >= this.keyframeInterval;
    const wire: MotionWire = {
      v: 1,
      s: sequence,
      t: packet.time,
      n: packet.tick,
      p: entries.size,
      r: [],
    };
    if (full) {
      wire.k = 1;
      wire.r = fullRows(entries.values());
    } else {
      for (const entry of entries.values()) {
        const previous = this.entries.get(entry.id)!;
        let mask = 0;
        const changed: unknown[] = [];
        for (let i = 0; i < FIELD_COUNT; i++)
          if (entry.fields[i] !== previous.fields[i]) {
            mask |= 1 << i;
            changed.push(entry.fields[i] ?? null); // Explicitly clear optional grounded.
          }
        if (mask) wire.r.push([entry.handle, mask, ...changed]);
      }
    }
    if (removed.length) wire.d = removed;
    const car = packet.car ?? this.car;
    const carChanged = car !== undefined && !sameCar(this.car, car);
    if (car && (full || carChanged)) wire.c = structuredClone(car);
    // Cache no caller-owned arrays/objects; mutating packet or wire cannot corrupt
    // the baseline used to calculate the next message.
    if (carChanged) this.car = structuredClone(car);
    this.entries = entries;
    this.nextHandle = nextHandle;
    this.sequence = sequence;
    this.forceKeyframe = false;
    if (full) this.lastKeyframe = sequence;
    return wire;
  }

  /**
   * A targeted fresh baseline carries the CURRENT global sequence, not another
   * broadcast sequence. Its transforms may be newer than our cached baseline:
   * force the next broadcast full so reverting values cannot disappear in a delta.
   */
  keyframe(packet: MotionPacket): MotionWire {
    const { entries } = this.prepare(packet);
    const wire: MotionWire = {
      v: 1,
      s: this.sequence,
      k: 1,
      t: packet.time,
      n: packet.tick,
      p: entries.size,
      r: fullRows(entries.values()),
    };
    const car = packet.car ?? this.car;
    if (car) wire.c = structuredClone(car);
    this.forceKeyframe = true;
    return wire;
  }
}

/** One decoder belongs to one socket/session and must reset when it is replaced. */
export class MotionDecoder {
  private sequence: number | undefined;
  private waitingForKeyframe = true;
  private entries = new Map<number, Entry>();
  private car: VehicleState | undefined;

  get needsKeyframe() {
    return this.waitingForKeyframe;
  }

  reset() {
    this.sequence = undefined;
    this.waitingForKeyframe = true;
    this.entries.clear();
    this.car = undefined;
  }

  decode(raw: unknown): MotionPacket | null {
    if (
      !object(raw) ||
      raw.v !== 1 ||
      !nonnegative(raw.s) ||
      typeof raw.t !== "number" ||
      !Number.isFinite(raw.t) ||
      !nonnegative(raw.n) ||
      !nonnegative(raw.p) ||
      !Array.isArray(raw.r) ||
      (raw.k !== undefined && raw.k !== 1)
    )
      return null;
    if (this.sequence !== undefined && raw.s <= this.sequence) return null;
    const full = raw.k === 1;
    if (
      !full &&
      (this.waitingForKeyframe ||
        this.sequence === undefined ||
        raw.s !== this.sequence + 1)
    ) {
      this.waitingForKeyframe = true;
      return null;
    }
    if (raw.c !== undefined && !isCar(raw.c)) return null;
    if (
      raw.d !== undefined &&
      (!Array.isArray(raw.d) ||
        !raw.d.every(nonnegative) ||
        new Set(raw.d).size !== raw.d.length)
    )
      return null;
    if (full && raw.r.length !== raw.p) return null;
    const entries = full ? new Map<number, Entry>() : new Map(this.entries);
    const identities = full ? new Set<string>() : undefined;
    const touched = new Set<number>();
    const removed = new Set((raw.d ?? []) as number[]);
    if (!full)
      for (const handle of removed) {
        if (!entries.delete(handle)) return null;
      }
    for (const row of raw.r) {
      if (
        !Array.isArray(row) ||
        !nonnegative(row[0]) ||
        touched.has(row[0]) ||
        removed.has(row[0])
      )
        return null;
      const handle = row[0];
      touched.add(handle);
      if (full) {
        if (
          (row.length !== 10 && row.length !== 11) ||
          typeof row[1] !== "string" ||
          identities!.has(row[1])
        )
          return null;
        const fields = [...row.slice(2, 10), row[10]] as Fields;
        if (!fields.every((value, index) => validField(index, value)))
          return null;
        identities!.add(row[1]);
        entries.set(handle, { handle, id: row[1], fields });
      } else {
        const previous = entries.get(handle);
        const mask = row[1];
        if (!previous || !integer(mask) || mask <= 0 || mask > FIELD_MASK)
          return null;
        const fields = [...previous.fields] as Fields;
        let cursor = 2;
        for (let i = 0; i < FIELD_COUNT; i++)
          if (mask & (1 << i)) {
            if (cursor >= row.length) return null;
            const value =
              i === 8 && row[cursor] === null ? undefined : row[cursor];
            if (!validField(i, value)) return null;
            (fields as unknown[])[i] = value;
            cursor++;
          }
        if (cursor !== row.length) return null;
        entries.set(handle, { ...previous, fields });
      }
    }
    if (entries.size !== raw.p) return null;
    const car =
      raw.c === undefined
        ? full
          ? undefined
          : this.car
        : structuredClone(raw.c as VehicleState);
    const packet: MotionPacket = {
      time: raw.t,
      tick: raw.n,
      rows: [...entries.values()].map(({ id, fields }) => {
        const row: unknown[] = [id, ...fields.slice(0, 8)];
        for (let i = 0; i < SCALES.length; i++)
          row[i + 1] = (row[i + 1] as number) / SCALES[i];
        if (fields[8] !== undefined) row.push(fields[8]);
        return row;
      }),
    };
    if (car) packet.car = structuredClone(car);
    // Commit only after the entire packet validated. A malformed final row must
    // never leave earlier rows applied against a sequence we did not accept.
    this.entries = entries;
    this.car = car;
    this.sequence = raw.s;
    this.waitingForKeyframe = false;
    return packet;
  }
}
