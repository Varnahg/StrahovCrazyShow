import type { Input } from "../shared/types";

export const INPUT_PACKET_SIZE = 8;
export const INPUT_SEND_INTERVAL_MS = 1000 / 30;
const MAX_PACKETS_PER_SECOND = 60;
const MAX_QUEUED_INPUTS = 64;
const MAX_IN_FLIGHT_TIMESTAMPS = 180;

type FlushSource = "frame" | "timer" | "pressure";
type BufferOptions = {
  now: () => number;
  canSend: () => boolean;
  send: (inputs: Input[]) => void;
  onOverflow?: (snapshot: ReturnType<FrameInputBuffer["snapshot"]>) => void;
  onSendError?: (error: unknown) => void;
};

/** A room-owned queue: rendering may flush it without waiting for a timer task.
 * This does not change V10 sequence/physics semantics or create any timers. */
export class FrameInputBuffer {
  private queue: { input: Input; at: number }[] = [];
  private inFlight = new Map<number, number>();
  private packetTimes: number[] = [];
  private disposed = false;
  private lastQueuedSeq = -1;
  private lastSentAt: number | null = null;
  private lastTimerAt: number | null = null;
  private lastFrameAt: number | null = null;
  private lastFlushSource: FlushSource | null = null;
  private lastResetReason: string | null = null;
  private lastSentSeq: number | null = null;
  private lastAck: number | null = null;
  private priorityPending = false;
  private produced = 0;
  private sentInputs = 0;
  private sentPackets = 0;
  private duplicateInputs = 0;
  private maxQueued = 0;
  private maxTimerIntervalMs = 0;
  private lastTimerIntervalMs: number | null = null;
  private maxSendIntervalMs = 0;
  private lastSendIntervalMs: number | null = null;
  private resets = 0;
  private discardedInputs = 0;
  private expiredQueuedInputs = 0;
  private overflows = 0;
  private sendErrors = 0;
  private evictedUnacked = 0;

  constructor(private readonly options: BufferOptions) {}

  enqueue(input: Input): boolean {
    if (this.disposed || !this.options.canSend()) return false;
    if (!Number.isSafeInteger(input.seq) || input.seq < 0) return false;
    if (input.seq <= Math.max(this.lastQueuedSeq, this.lastAck ?? -1)) {
      this.duplicateInputs++;
      return false;
    }
    const now = this.options.now();
    if (!Number.isFinite(now)) return false;
    this.lastQueuedSeq = input.seq;
    this.produced++;
    this.queue.push({ input: { ...input }, at: now });
    this.maxQueued = Math.max(this.maxQueued, this.queue.length);
    if (this.queue.length >= INPUT_PACKET_SIZE) this.flush("pressure");
    if (this.queue.length > MAX_QUEUED_INPUTS) {
      this.overflows++;
      const incident = this.snapshot();
      this.reset("overflow");
      this.options.onOverflow?.(incident);
    }
    return true;
  }

  flush(source: FlushSource = "frame"): number {
    if (this.disposed) return 0;
    const now = this.options.now();
    if (!Number.isFinite(now)) return 0;
    if (source === "timer") {
      if (this.lastTimerAt !== null) {
        this.lastTimerIntervalMs = Math.max(0, now - this.lastTimerAt);
        this.maxTimerIntervalMs = Math.max(
          this.maxTimerIntervalMs,
          this.lastTimerIntervalMs,
        );
      }
      this.lastTimerAt = now;
    } else if (source === "frame") this.lastFrameAt = now;
    if (!this.options.canSend() || !this.queue.length) return 0;
    const pressure = this.queue.length >= INPUT_PACKET_SIZE;
    // A slow frame can legitimately produce more than one packet. Pressure
    // bypasses the cadence, but never the shared rolling message budget below.
    if (
      !pressure &&
      !this.priorityPending &&
      this.lastSentAt !== null &&
      now - this.lastSentAt + 1e-7 < INPUT_SEND_INTERVAL_MS
    )
      return 0;
    while (this.packetTimes.length && now - this.packetTimes[0] >= 1000)
      this.packetTimes.shift();
    if (this.packetTimes.length >= MAX_PACKETS_PER_SECOND) return 0;
    const entries = this.queue.slice(0, INPUT_PACKET_SIZE);
    try {
      this.options.send(entries.map(({ input }) => input));
    } catch (error) {
      this.sendErrors++;
      this.options.onSendError?.(error);
      return 0;
    }
    this.queue.splice(0, entries.length);
    this.priorityPending = false;
    for (const { input, at } of entries) this.inFlight.set(input.seq, at);
    while (this.inFlight.size > MAX_IN_FLIGHT_TIMESTAMPS) {
      this.inFlight.delete(this.inFlight.keys().next().value!);
      this.evictedUnacked++;
    }
    this.sentInputs += entries.length;
    this.sentPackets++;
    this.lastSentSeq = entries.at(-1)!.input.seq;
    if (this.lastSentAt !== null) {
      this.lastSendIntervalMs = Math.max(0, now - this.lastSentAt);
      this.maxSendIntervalMs = Math.max(
        this.maxSendIntervalMs,
        this.lastSendIntervalMs,
      );
    }
    this.lastSentAt = now;
    this.lastFlushSource = source;
    this.packetTimes.push(now);
    return entries.length;
  }

  acknowledge(ack: number): void {
    if (!Number.isSafeInteger(ack) || ack < 0 || this.disposed) return;
    this.lastAck = this.lastAck === null ? ack : Math.max(this.lastAck, ack);
    const before = this.queue.length;
    this.queue = this.queue.filter(({ input }) => input.seq > ack);
    const expired = before - this.queue.length;
    this.expiredQueuedInputs += expired;
    this.discardedInputs += expired;
    for (const seq of this.inFlight.keys())
      if (seq <= ack) this.inFlight.delete(seq);
  }

  reset(
    reason = "prediction-reset",
    options: { priority?: boolean } = {},
  ): void {
    this.discardedInputs += this.queue.length;
    this.queue.length = 0;
    this.inFlight.clear();
    this.lastQueuedSeq = -1;
    this.lastAck = null;
    this.lastResetReason = reason;
    this.priorityPending = options.priority === true;
    this.resets++;
    // Keep the transport rate budget across recovery to prevent a reset storm
    // from bypassing the server's message cap.
  }

  dispose(): void {
    if (this.disposed) return;
    this.reset("dispose");
    this.disposed = true;
    this.packetTimes.length = 0;
  }

  snapshot() {
    const now = this.options.now();
    const age = (at: number | null | undefined) =>
      at !== null && at !== undefined && Number.isFinite(now)
        ? Math.max(0, now - at)
        : null;
    const oldestSentAt = this.inFlight.values().next().value;
    const oldestQueuedAt = this.queue[0]?.at;
    const oldestUnackedAt =
      oldestSentAt === undefined
        ? oldestQueuedAt
        : oldestQueuedAt === undefined
          ? oldestSentAt
          : Math.min(oldestSentAt, oldestQueuedAt);
    return {
      queued: this.queue.length,
      inFlight: this.inFlight.size,
      maxQueued: this.maxQueued,
      queuedFirstSeq: this.queue[0]?.input.seq ?? null,
      queuedLastSeq: this.queue.at(-1)?.input.seq ?? null,
      oldestQueuedAgeMs: age(oldestQueuedAt),
      oldestUnackedAgeMs: age(oldestUnackedAt),
      lastSendAgeMs: age(this.lastSentAt),
      lastTimerAgeMs: age(this.lastTimerAt),
      lastFrameAgeMs: age(this.lastFrameAt),
      lastTimerIntervalMs: this.lastTimerIntervalMs,
      maxTimerIntervalMs: this.maxTimerIntervalMs,
      lastSendIntervalMs: this.lastSendIntervalMs,
      maxSendIntervalMs: this.maxSendIntervalMs,
      lastFlushSource: this.lastFlushSource,
      lastResetReason: this.lastResetReason,
      lastSentSeq: this.lastSentSeq,
      lastAck: this.lastAck,
      priorityPending: this.priorityPending,
      produced: this.produced,
      sentInputs: this.sentInputs,
      sentPackets: this.sentPackets,
      duplicateInputs: this.duplicateInputs,
      resets: this.resets,
      discardedInputs: this.discardedInputs,
      expiredQueuedInputs: this.expiredQueuedInputs,
      overflows: this.overflows,
      sendErrors: this.sendErrors,
      evictedUnacked: this.evictedUnacked,
      disposed: this.disposed,
    };
  }
}
