import assert from "node:assert/strict";
import test from "node:test";
import { readPlaybackSummary, type PlaybackSummary } from "../shared/production-playback";

const sample: PlaybackSummary = {
  v: 1, windowMs: 15_000, frames: 875, hitch100: 2, hitch500: 1, maxFrameMs: 530,
  rttSamples: 12, maxRttMs: 601, overlapSamples: 1, incompleteCoverageSamples: 2, timeouts: 1, lastServerTick: 45139,
  buildId: "sha256-" + "a".repeat(64),
};

test("projects a coherent, bounded playback summary to plain metadata", () => {
  const parsed = readPlaybackSummary(sample);
  assert.deepEqual(parsed, sample);
  assert.notEqual(parsed, sample);
  assert.deepEqual(readPlaybackSummary({
    ...sample, rttSamples: 0, maxRttMs: 0, overlapSamples: 0, incompleteCoverageSamples: 0,
    lastServerTick: null, buildId: null,
  })?.lastServerTick, null);
});

test("rejects attempts to add content or omit or poison a measurement", () => {
  const { buildId: _, ...missing } = sample;
  for (const data of [
    { ...sample, extra: "private message" },
    { ...sample, ["__proto__"]: "private message" },
    { ...sample, buildId: "sha256-" + "a".repeat(64) + "\n" },
    { ...sample, maxRttMs: Infinity },
    { ...sample, windowMs: 120_000 },
    { ...sample, hitch100: 0 },
    { ...sample, maxFrameMs: 499 },
    { ...sample, overlapSamples: 13 },
    { ...sample, incompleteCoverageSamples: 13 },
    { ...sample, lastServerTick: -1 },
    missing,
    [sample],
  ]) assert.equal(readPlaybackSummary(data), null);
});
