import assert from "node:assert/strict";
import test from "node:test";
import { ProductionPlayback } from "../client/production-playback";
import type { ProbeMeasurement } from "../client/network-probe";
import { PLAYBACK_INTERVAL_MS, PLAYBACK_MAX_WINDOW_MS, readPlaybackSummary } from "../shared/production-playback";

const buildId = "sha256-" + "b".repeat(64);

function playTo(playback: ProductionPlayback, start: number, end: number): void {
  for (let t = start; t < end; t += 16) playback.frame(t, true);
  playback.frame(end, true);
}

function probe(
  measuredAt: number,
  rawRoundTripMs: number,
  blockedOverlapMs = 0,
  longTaskCoverage: ProbeMeasurement["longTaskCoverage"] = "available",
): ProbeMeasurement {
  const contaminated = blockedOverlapMs > 0 || longTaskCoverage === "overflow";
  return {
    nonce: 7, serverTick: 123, serverTimeMs: 1, measuredAt, rawRoundTripMs,
    contaminated, blockedOverlapMs, overlappingLongTasks: Number(blockedOverlapMs > 0),
    longTaskCoverage, acceptedForPrediction: !contaminated, predictionRoundTripMs: null,
  };
}

test("classifies actual complete frame intervals and existing probe measurements", () => {
  const playback = new ProductionPlayback(buildId, () => true);
  for (const at of [0, 99.5, 199.5, 699.5]) playback.frame(at, true);
  playback.recordRoundTrip(probe(2_000, 28.2));
  playback.recordRoundTrip(probe(3_000, 145.7, 80));
  playback.recordRoundTrip(probe(4_000, 28.2, 0, "unavailable"));
  playback.recordRoundTrip(probe(5_000, 28.2, 0, "overflow"));
  playback.recordTimeout(14_000, 10_000);
  playTo(playback, 715.5, PLAYBACK_INTERVAL_MS - 1);
  assert.equal(playback.take(PLAYBACK_INTERVAL_MS), undefined);
  playback.frame(PLAYBACK_INTERVAL_MS, true);
  const summary = playback.take(PLAYBACK_INTERVAL_MS + 20);
  assert.ok(summary);
  assert.deepEqual(readPlaybackSummary(summary), summary);
  assert.equal(summary.windowMs, PLAYBACK_INTERVAL_MS);
  assert.deepEqual([summary.hitch100, summary.hitch500, summary.maxFrameMs], [2, 1, 500]);
  assert.deepEqual(
    [summary.rttSamples, summary.maxRttMs, summary.overlapSamples, summary.incompleteCoverageSamples, summary.timeouts],
    [4, 146, 1, 2, 1],
  );
  assert.equal(summary.lastServerTick, 123);
  assert.equal(summary.buildId, buildId);

  playTo(playback, PLAYBACK_INTERVAL_MS + 16, 2 * PLAYBACK_INTERVAL_MS);
  assert.equal(playback.take(2 * PLAYBACK_INTERVAL_MS + 19), undefined, "report cadence follows sending time");
  const next = playback.take(2 * PLAYBACK_INTERVAL_MS + 20);
  assert.ok(next);
  assert.deepEqual([next.rttSamples, next.maxRttMs, next.overlapSamples, next.timeouts], [0, 0, 0, 0]);
  assert.equal(next.incompleteCoverageSamples, 0);
  assert.equal(next.lastServerTick, null);
});

test("drops hidden, disconnected, and expired intervals instead of counting them as hitches", () => {
  let connected = true;
  const playback = new ProductionPlayback("unidentified", () => connected);
  playTo(playback, 0, 1_000);
  playback.frame(2_000, false);
  playback.frame(9_000, false);
  playback.frame(11_000, true);
  playback.recordRoundTrip(probe(11_050, 2_000));
  playback.recordTimeout(13_000, 10_000);
  playTo(playback, 11_016, 26_000);
  const afterHidden = playback.take(26_000);
  assert.ok(afterHidden);
  assert.deepEqual([afterHidden.hitch100, afterHidden.maxFrameMs, afterHidden.rttSamples, afterHidden.timeouts], [0, 16, 0, 0]);
  assert.equal(afterHidden.buildId, null);

  connected = false;
  playback.frame(26_016, true);
  playback.frame(39_000, true);
  connected = true;
  playTo(playback, 42_000, 43_000);
  const resumed = 42_000 + PLAYBACK_MAX_WINDOW_MS + 1;
  assert.equal(playback.take(resumed), undefined);
  playTo(playback, resumed, resumed + PLAYBACK_INTERVAL_MS);
  const afterGap = playback.take(resumed + PLAYBACK_INTERVAL_MS);
  assert.ok(afterGap);
  assert.deepEqual([afterGap.hitch100, afterGap.maxFrameMs], [0, 16]);
});

test("an explicit visibility or generation reset excludes a probe from the previous window", () => {
  const playback = new ProductionPlayback(buildId, () => true);
  playTo(playback, 0, 5_000);
  playback.recordRoundTrip(probe(3_000, 12));
  playback.reset();
  playback.frame(5_100, true);
  playback.recordRoundTrip(probe(5_200, 250));
  playTo(playback, 5_116, 5_100 + PLAYBACK_INTERVAL_MS);
  const summary = playback.take(5_100 + PLAYBACK_INTERVAL_MS);
  assert.ok(summary);
  assert.equal(summary.rttSamples, 0);
  assert.equal(summary.hitch100, 0);
});
