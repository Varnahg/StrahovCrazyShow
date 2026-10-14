import type { DiagnosticsData } from "../shared/session-diagnostics";

// Never enumerate arbitrary packets: even optional diagnostics must not invoke
// getters, retain source objects or admit future profile/peer/credential fields.
function plain(value: unknown): value is object {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function ownData(value: unknown, key: string): unknown {
  if (!plain(value)) return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

function numbers(
  value: unknown,
  keys: readonly string[],
  integerKeys: readonly string[] = keys,
): DiagnosticsData | null {
  if (!plain(value)) return null;
  const result: DiagnosticsData = {};
  for (const key of keys) {
    const number = ownData(value, key);
    result[key] =
      typeof number === "number" &&
      Number.isFinite(number) &&
      number >= 0 &&
      (!integerKeys.includes(key) || Number.isSafeInteger(number))
        ? number
        : null;
  }
  return result;
}

const CLOCK = [
  "elapsedMs",
  "cpuMs",
  "steps",
  "droppedMs",
  "accumulatorMs",
  "callbacks",
  "elapsedMeanMs",
  "cpuMeanMs",
  "elapsedMaxMs",
  "cpuMaxMs",
  "droppedTotalMs",
] as const;
const QUEUE = [
  "inputEpoch",
  "inputTickBase",
  "tick",
  "ack",
  "receivedSeq",
  "depth",
  "maxDepth",
  "accepted",
  "consumed",
  "idleTicks",
  "idleTicksSinceInput",
  "lastAppliedTick",
  "modeMismatchTicks",
  "resets",
  "discarded",
  "lastInputAgeMs",
  "oldestQueuedAgeMs",
] as const;
const QUEUE_INTEGERS = QUEUE.filter((key) => !key.endsWith("AgeMs"));
const REJECTED = ["invalid", "epoch", "late", "ahead", "duplicate"] as const;

export type AcceptedAuthorityDiagnostics = {
  clock: DiagnosticsData | null;
  queue: DiagnosticsData | null;
};

/** Optional telemetry cannot make an otherwise accepted authority fail. */
export function snapshotAcceptedAuthorityDiagnostics(
  packet: unknown,
): AcceptedAuthorityDiagnostics | null {
  try {
    const network = ownData(packet, "network");
    if (!plain(network)) return null;
    let clock = numbers(ownData(network, "clock"), CLOCK, [
      "callbacks",
      "steps",
    ]);
    if (
      clock &&
      (!Number.isSafeInteger(clock.callbacks) || clock.droppedTotalMs === null)
    )
      clock = null;
    const sourceQueue = ownData(network, "queue");
    const queue =
      ownData(sourceQueue, "resolution") === "scheduled-tick"
        ? numbers(sourceQueue, QUEUE, QUEUE_INTEGERS)
        : null;
    if (queue) {
      queue.resolution = "scheduled-tick";
      queue.rejected = numbers(ownData(sourceQueue, "rejected"), REJECTED);
    }
    return clock || queue ? { clock, queue } : null;
  } catch {
    // Proxy traps and other exotic optional values are not gameplay failures.
    return null;
  }
}

const SENDER = [
  "queued",
  "inFlight",
  "maxQueued",
  "oldestQueuedAgeMs",
  "oldestUnackedAgeMs",
  "lastSendAgeMs",
  "lastTimerAgeMs",
  "lastFrameAgeMs",
  "lastTimerIntervalMs",
  "maxTimerIntervalMs",
  "lastSentSeq",
  "lastAck",
  "produced",
  "sentInputs",
  "sentPackets",
  "resets",
  "discardedInputs",
  "expiredQueuedInputs",
  "overflows",
  "sendErrors",
] as const;
const PROBE = [
  "pendingMs",
  "predictionRoundTripMs",
  "rawRoundTripMs",
  "measuredAt",
  "retainedLongTasks",
  "timeouts",
  "contaminatedSamples",
  "acceptedSamples",
] as const;
const AUTHORITIES = [
  "received",
  "superseded",
  "barriers",
  "ordinaryApplied",
  "rejected",
] as const;
const SENDER_INTEGERS = SENDER.filter((key) => !key.endsWith("Ms"));
const PROBE_INTEGERS = [
  "retainedLongTasks",
  "timeouts",
  "contaminatedSamples",
  "acceptedSamples",
] as const;

/** The UI owns transport controllers; emit only their bounded technical scalars. */
export function snapshotTransportDiagnostics(
  read?: () => unknown,
): DiagnosticsData | null {
  try {
    if (!read) return null;
    const value = read();
    return {
      sender: numbers(ownData(value, "sender"), SENDER, SENDER_INTEGERS),
      probe: numbers(ownData(value, "probe"), PROBE, PROBE_INTEGERS),
      authorities: numbers(ownData(value, "authorities"), AUTHORITIES),
    };
  } catch {
    return null;
  }
}

const TIMELINE = [
  "inputEpoch",
  "ack",
  "predictedSeq",
  "retainedInputs",
  "rttMs",
  "rawRttMs",
  "rttMeasuredAtMs",
  "supportedRttMeasuredAtMs",
  "pendingRttMs",
  "pendingRttMeasuredAtMs",
  "pendingRttExpiresAtMs",
  "leadTicks",
  "clockSeqAtAnchor",
  "clockAnchorAtMs",
] as const;
const TIMELINE_INTEGERS = [
  "inputEpoch",
  "ack",
  "predictedSeq",
  "retainedInputs",
  "leadTicks",
] as const;

export function snapshotTimelineDiagnostics(
  value: unknown,
): DiagnosticsData | null {
  try {
    const result = numbers(value, TIMELINE, TIMELINE_INTEGERS);
    if (!result) return null;
    for (const key of ["deliveryBudgetExceeded", "clockCalibrated"] as const) {
      const flag = ownData(value, key);
      result[key] = typeof flag === "boolean" ? flag : null;
    }
    return result;
  } catch {
    return null;
  }
}
