/** Ordered boundaries of Game.updateRenderEnvironment, sampled after each block. */
export const ENVIRONMENT_PROFILE_PHASES = Object.freeze([
  "skyWeather",
  "artLighting",
  "carLighting",
  "vehicleLighting",
  "flashlight",
  "vegetation",
  "transit",
  "precipitation",
  "surfaces",
  "cinematic",
] as const);

export type EnvironmentProfilePhase =
  (typeof ENVIRONMENT_PROFILE_PHASES)[number];

export const ENVIRONMENT_PROFILE_SCOPE = Object.freeze({
  clock: "performance.now monotonic milliseconds within this owner",
  phases:
    "consecutive CPU wall intervals from begin to each ordered mark; includes synchronous nested calls, listeners, GC and scheduling delays",
  total:
    "begin through the cinematic mark; excludes end, metadata collection and reporting, asynchronous completion, rendering and GPU execution",
  relationship:
    "phases partition this environment interval; inclusive in the enclosing environment/frame CPU timing, never add to that enclosing timing",
  sampling:
    "only complete valid intervals meeting the threshold and cadence; not a distribution, whole-frame time or FPS measurement",
});

type MetadataValue = string | number | boolean | null;
export type EnvironmentProfileMetadata = Readonly<
  Record<string, MetadataValue>
>;
type MetadataSource =
  EnvironmentProfileMetadata | (() => EnvironmentProfileMetadata | undefined);

export type EnvironmentProfileSnapshot = {
  readonly scope: typeof ENVIRONMENT_PROFILE_SCOPE;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly totalMs: number;
  readonly phasesMs: Readonly<Record<EnvironmentProfilePhase, number>>;
  readonly metadata?: EnvironmentProfileMetadata;
};

export type EnvironmentProfile = {
  readonly scope: typeof ENVIRONMENT_PROFILE_SCOPE;
  begin(): void;
  mark(phase: EnvironmentProfilePhase): void;
  /** Reuse a record or a stable lazy supplier; no new metadata object per frame.
   * Metadata is copied only when reporting (at most 16 keys, 160 chars/value).
   * Extra, inherited, accessor, nonfinite and nonscalar fields are omitted. */
  end(metadata?: MetadataSource): void;
};

export type EnvironmentProfileOptions = {
  now?: () => number;
  onSlowFrame: (snapshot: EnvironmentProfileSnapshot) => void;
  thresholdMs?: number;
  minIntervalMs?: number;
};

const defaultNow = () => performance.now();

function nonnegative(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
}

function snapshotMetadata(source: MetadataSource | undefined) {
  if (!source) return undefined;
  try {
    const input = typeof source === "function" ? source() : source;
    if (!input || typeof input !== "object") return undefined;
    const copy: Record<string, MetadataValue> = Object.create(null);
    let inspected = 0;
    for (const key in input) {
      if (inspected++ === 16) break;
      if (key.length > 64) continue;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      // Do not invoke getters or retain references to external mutable objects.
      if (!descriptor || !("value" in descriptor)) continue;
      const value: unknown = descriptor.value;
      if (typeof value === "string") copy[key] = value.slice(0, 160);
      else if (
        value === null ||
        typeof value === "boolean" ||
        (typeof value === "number" && Number.isFinite(value))
      )
        copy[key] = value;
    }
    return copy;
  } catch {
    // Diagnostic metadata must not interrupt the environment update.
    return undefined;
  }
}

/** Local opt-in only. Owns no timers, listeners, engine resources or global state.
 * One fixed buffer is reused; begin/mark and nonreporting end allocate nothing.
 * A malformed/incomplete frame is discarded, and the next begin starts fresh. */
export function createEnvironmentProfile(
  location: { hostname: string; search: string },
  options: EnvironmentProfileOptions,
): EnvironmentProfile | undefined {
  if (
    !["localhost", "127.0.0.1", "[::1]", "::1"].includes(
      location.hostname.toLowerCase(),
    )
  )
    return undefined;
  const values = new URLSearchParams(location.search).getAll(
    "profileEnvironment",
  );
  if (values.length !== 1 || values[0] !== "1") return undefined;
  const now = options.now ?? defaultNow;
  const onSlowFrame = options.onSlowFrame;
  const threshold = nonnegative(options.thresholdMs, 25);
  const minInterval = nonnegative(options.minIntervalMs, 1000);
  const durations = new Float64Array(ENVIRONMENT_PROFILE_PHASES.length);
  let nextPhase = -1;
  let startedAt = 0;
  let previousMark = 0;
  let lastClock = -Infinity;
  let lastReport = -Infinity;
  let reporting = false;

  function readClock() {
    let time: number;
    try {
      time = now();
    } catch {
      return NaN;
    }
    if (!Number.isFinite(time) || time < 0) return NaN;
    if (time < lastClock) {
      // Discard the discontinuity. A later begin can measure the new epoch;
      // wait a full cadence after the reset before permitting another report.
      lastClock = time;
      lastReport = time;
      return NaN;
    }
    lastClock = time;
    return time;
  }

  return {
    scope: ENVIRONMENT_PROFILE_SCOPE,
    begin() {
      if (reporting) return;
      nextPhase = -1;
      const time = readClock();
      if (!Number.isFinite(time)) return;
      startedAt = previousMark = time;
      nextPhase = 0;
    },
    mark(phase) {
      if (reporting || nextPhase < 0) return;
      if (phase !== ENVIRONMENT_PROFILE_PHASES[nextPhase]) {
        nextPhase = -1;
        return;
      }
      const time = readClock();
      if (!Number.isFinite(time)) {
        nextPhase = -1;
        return;
      }
      durations[nextPhase++] = time - previousMark;
      previousMark = time;
    },
    end(metadata) {
      if (reporting) return;
      const complete = nextPhase === ENVIRONMENT_PROFILE_PHASES.length;
      nextPhase = -1;
      const totalMs = previousMark - startedAt;
      if (
        !complete ||
        totalMs < threshold ||
        previousMark - lastReport < minInterval
      )
        return;
      lastReport = previousMark;
      reporting = true;
      try {
        const phasesMs = {} as Record<EnvironmentProfilePhase, number>;
        for (let index = 0; index < ENVIRONMENT_PROFILE_PHASES.length; index++)
          phasesMs[ENVIRONMENT_PROFILE_PHASES[index]] = durations[index];
        onSlowFrame({
          scope: ENVIRONMENT_PROFILE_SCOPE,
          startedAtMs: startedAt,
          endedAtMs: previousMark,
          totalMs,
          phasesMs,
          metadata: snapshotMetadata(metadata),
        });
      } catch {
        // Neither a throwing consumer nor reentrant diagnostics affect gameplay.
      } finally {
        reporting = false;
      }
    },
  };
}
