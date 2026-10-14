import type { TimelineQueueDiagnostics } from "./input-timeline";
/** Own-session telemetry only. Never include tokens, profiles or peer lists. */
export type ResyncReason =
  | "client-request"
  | "input-gap"
  | "input-backlog"
  | "server-clock-drop"
  | "join"
  | "respawn";

export type InputQueueDiagnostics = {
  depth: number;
  maxDepth: number;
  ack: number;
  receivedSeq: number;
  lastInputAgeMs: number | null;
  oldestQueuedAgeMs: number | null;
  lastAppliedTick: number | null;
  accepted: number;
  rejectedDuplicate: number;
  rejectedGap: number;
  rejectedCapacity: number;
  consumed: number;
  idleTicks: number;
  idleTicksSinceAck: number;
  resets: number;
  discarded: number;
};

export type ClockTimingSample = {
  elapsedMs: number;
  cpuMs: number;
  steps: number;
  droppedMs: number;
  accumulatorMs: number;
};

/** Lifetime counters and current/max timings use constant storage. */
export class NetworkClockTiming {
  private callbacks = 0;
  private elapsedTotalMs = 0;
  private cpuTotalMs = 0;
  private elapsedMaxMs = 0;
  private cpuMaxMs = 0;
  private droppedTotalMs = 0;
  private current: ClockTimingSample = {
    elapsedMs: 0,
    cpuMs: 0,
    steps: 0,
    droppedMs: 0,
    accumulatorMs: 0,
  };

  record(sample: ClockTimingSample): boolean {
    if (
      [
        sample.elapsedMs,
        sample.cpuMs,
        sample.steps,
        sample.droppedMs,
        sample.accumulatorMs,
      ].some((value) => !Number.isFinite(value) || value < 0) ||
      !Number.isSafeInteger(sample.steps)
    )
      return false;
    this.current = { ...sample };
    this.callbacks++;
    this.elapsedTotalMs += sample.elapsedMs;
    this.cpuTotalMs += sample.cpuMs;
    this.elapsedMaxMs = Math.max(this.elapsedMaxMs, sample.elapsedMs);
    this.cpuMaxMs = Math.max(this.cpuMaxMs, sample.cpuMs);
    this.droppedTotalMs += sample.droppedMs;
    return true;
  }

  snapshot() {
    return {
      ...this.current,
      callbacks: this.callbacks,
      elapsedMeanMs: this.callbacks ? this.elapsedTotalMs / this.callbacks : 0,
      cpuMeanMs: this.callbacks ? this.cpuTotalMs / this.callbacks : 0,
      elapsedMaxMs: this.elapsedMaxMs,
      cpuMaxMs: this.cpuMaxMs,
      droppedTotalMs: this.droppedTotalMs,
    };
  }
}

export type AuthorityNetworkDiagnostics = {
  queue: InputQueueDiagnostics | TimelineQueueDiagnostics;
  clock: ReturnType<NetworkClockTiming["snapshot"]>;
};

export type NetworkProbeReply = {
  nonce: number;
  serverTimeMs: number;
  serverTick: number;
};

export function networkProbeNonce(value: unknown): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const nonce = (value as { nonce?: unknown }).nonce;
  return typeof nonce === "number" && Number.isSafeInteger(nonce) && nonce >= 0
    ? nonce
    : null;
}

/** Caller must authenticate and rate-limit before returning this own-room echo. */
export function networkProbeReply(
  nonce: number,
  serverTick: number,
  serverTimeMs: number,
): NetworkProbeReply | null {
  if (
    networkProbeNonce({ nonce }) === null ||
    !Number.isSafeInteger(serverTick) ||
    serverTick < 0 ||
    !Number.isFinite(serverTimeMs) ||
    serverTimeMs < 0
  )
    return null;
  return { nonce, serverTimeMs, serverTick };
}
