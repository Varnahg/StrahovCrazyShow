export const PLAYBACK_INTERVAL_MS = 15_000;
export const PLAYBACK_MAX_WINDOW_MS = 60_000;
export const PLAYBACK_MAX_FRAMES = 60_000;
export const PLAYBACK_MAX_PROBES = 60;
export const PLAYBACK_BUILD_PATTERN = /^sha256-[a-f0-9]{64}$/;

export type PlaybackSummary = {
  v: 1;
  windowMs: number;
  frames: number;
  hitch100: number;
  hitch500: number;
  maxFrameMs: number;
  rttSamples: number;
  maxRttMs: number;
  overlapSamples: number;
  incompleteCoverageSamples: number;
  timeouts: number;
  lastServerTick: number | null;
  buildId: string | null;
};

const fields: Record<keyof PlaybackSummary, true> = {
  v: true, windowMs: true, frames: true, hitch100: true, hitch500: true,
  maxFrameMs: true, rttSamples: true, maxRttMs: true, overlapSamples: true,
  incompleteCoverageSamples: true,
  timeouts: true, lastServerTick: true, buildId: true,
};
const fieldCount = Object.keys(fields).length;

function isCount(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= min && value <= max;
}

/** Strict projection of the optional client summary; never forward the probe itself. */
export function readPlaybackSummary(value: unknown): PlaybackSummary | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  let count = 0;
  for (const key in value) {
    if (!Object.hasOwn(value, key) || !Object.hasOwn(fields, key)) return null;
    count++;
  }
  if (count !== fieldCount) return null;
  const {
    v, windowMs, frames, hitch100, hitch500, maxFrameMs, rttSamples, maxRttMs,
    overlapSamples, incompleteCoverageSamples, timeouts, lastServerTick, buildId,
  } = value as Partial<Record<keyof PlaybackSummary, unknown>>;
  if (
    v !== 1 ||
    !isCount(windowMs, PLAYBACK_INTERVAL_MS, PLAYBACK_MAX_WINDOW_MS) ||
    !isCount(frames, 1, PLAYBACK_MAX_FRAMES) ||
    !isCount(hitch100, 0, frames) || !isCount(hitch500, 0, hitch100) ||
    !isCount(maxFrameMs, 0, windowMs) ||
    Boolean(hitch100) !== (maxFrameMs >= 100) ||
    Boolean(hitch500) !== (maxFrameMs >= 500) ||
    !isCount(rttSamples, 0, PLAYBACK_MAX_PROBES) ||
    !isCount(maxRttMs, 0, PLAYBACK_MAX_WINDOW_MS) ||
    (!rttSamples && maxRttMs !== 0) ||
    !isCount(overlapSamples, 0, rttSamples) ||
    !isCount(incompleteCoverageSamples, 0, rttSamples) ||
    !isCount(timeouts, 0, PLAYBACK_MAX_PROBES) ||
    (lastServerTick !== null && !isCount(lastServerTick, 0, Number.MAX_SAFE_INTEGER)) ||
    (buildId !== null && (typeof buildId !== "string" || !PLAYBACK_BUILD_PATTERN.test(buildId)))
  ) return null;
  return {
    v, windowMs, frames, hitch100, hitch500, maxFrameMs, rttSamples, maxRttMs,
    overlapSamples, incompleteCoverageSamples, timeouts, lastServerTick, buildId,
  };
}
