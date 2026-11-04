import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Matrix } from "@babylonjs/core/Maths/math.vector";
import { parseArguments, compileBatch, createFixture, mutate, snapshot, measureOperation,
  countConversions, proveParity, summarize, runCase, SCENARIOS, measureControlBlock,
  runControlPair, campaignCoverage } from "../scripts/benchmark-grass-snapshots";

const source = readFileSync(resolve("client/photo-grass-batch.ts"), "utf8");
const A = compileBatch(source, "test-A").Batch, B = compileBatch(source, "test-B").Batch;

test("benchmark parser requires explicit immutable baseline/output and bounded nonduplicate numeric arguments", () => {
  assert.deepEqual(parseArguments(["--help"]), { help: true });
  const valid = ["--baseline", "a".repeat(40), "--out", resolve(".cache/grass-matrix-20261102/harness/example")];
  assert.equal((parseArguments(valid) as { pairs: number }).pairs, 5);
  assert.equal((parseArguments([...valid, "--pairs", "3"]) as { pairs: number }).pairs, 3);
  assert.equal((parseArguments([...valid, "--controls-only"]) as { controlsOnly: boolean }).controlsOnly, true);
  for (const args of [[], ["--help", "x"], ["--baseline", "main", "--out", resolve("out")],
    ["--baseline", "a".repeat(40), "--out", "relative"], [...valid, "--pairs", "0"],
    [...valid, "--pairs", "26"], [...valid, "--warmup", "NaN"], [...valid, "--pairs", "2", "--pairs", "3"],
    [...valid, "--controls-only", "--controls-only"], [...valid, "--controls-only", "--iterations", "3"]])
    assert.throws(() => parseArguments(args));
});

test("same VM loader gives independent mutable root pools and preserves all scenario data", () => {
  const a = createFixture(A, 8), b = createFixture(B, 8);
  try {
    assert.notEqual(a.batch, b.batch); assert.notEqual(a.roots[0], b.roots[0]);
    const before = snapshot(b);
    mutate(a, "sparse-1", 0); a.batch.flush();
    assert.deepEqual(snapshot(b), before, "A must not mutate B's root slots or buffers");
  } finally { a.dispose(); b.dispose(); }
  const proof = proveParity(A, B, 8);
  assert.equal(proof.length, SCENARIOS.length);
  assert.ok(proof.every(value => value.parity));
});

test("total operation timing includes mutation before the nested flush bracket", () => {
  const f = createFixture(A, 8), events: string[] = [];
  const remove = f.batch.remove.bind(f.batch), flush = f.batch.flush.bind(f.batch);
  f.batch.remove = value => { events.push("remove"); remove(value); };
  f.batch.flush = () => { events.push("flush"); flush(); };
  let tick = 0;
  try {
    const timing = measureOperation(f, "tail-remove", 0, () => { events.push("clock"); return [10, 17, 21][tick++]; });
    assert.deepEqual(events, ["clock", "remove", "clock", "flush", "clock"]);
    assert.deepEqual(timing, { totalMs: 11, flushMs: 4 });
  } finally { f.dispose(); }
});

test("snapshot uses instance count at full buffer capacity and after a real rebound", () => {
  const f = createFixture(A, 64);
  try {
    assert.equal(snapshot(f).fades.length, 64 * 4);
    mutate(f, "rebound", 0); f.batch.flush();
    assert.equal(snapshot(f).fades.length, 65 * 4);
    assert.equal(snapshot(f).matrices.length, 65);
  } finally { f.dispose(); }
});

test("conversion counters separate native FromArray and restore methods even after an exception", () => {
  const from = Matrix.FromArray, to = Matrix.FromArrayToRef;
  const array = new Float32Array(Matrix.Identity().m), target = Matrix.Identity();
  assert.deepEqual(countConversions(() => { Matrix.FromArray(array); Matrix.FromArrayToRef(array, 0, target); }),
    { nativeFromArray: 1, directToRef: 1, total: 2 });
  assert.equal(Matrix.FromArray, from); assert.equal(Matrix.FromArrayToRef, to);
  assert.throws(() => countConversions(() => { throw new Error("fixture"); }), /fixture/);
  assert.equal(Matrix.FromArray, from); assert.equal(Matrix.FromArrayToRef, to);
});

test("statistics retain the slow outlier and tiny smoke includes whole costs for every case", () => {
  const stats = summarize([1, 2, 3, 1000]);
  assert.equal(stats.count, 4); assert.equal(stats.sum, 1006); assert.equal(stats.max, 1000); assert.equal(stats.p95, 1000);
  for (const scenario of SCENARIOS) {
    const result = runCase(A, 4, scenario, 2, 1);
    assert.equal(result.totalMs.length, 2); assert.equal(result.flushMs.length, 2);
    assert.ok(result.totalMs.every((value, i) => value >= result.flushMs[i]));
  }
});

test("loader refuses new unrecorded runtime imports rather than silently using different dependencies", () => {
  assert.throws(() => compileBatch('import "node:fs"; export class PhotoGrassBatch {}', "bad"), /Unrecorded runtime import/);
});

test("control block has exactly two clocks around all mutate+flush operations and no placebo no-op changes", () => {
  const f = createFixture(A, 4), events: string[] = [], flush = f.batch.flush.bind(f.batch);
  f.batch.flush = () => { events.push("flush"); flush(); };
  try {
    const before = snapshot(f);
    let calls = 0;
    const block = measureControlBlock(f, "no-op", 3, 0, () => { events.push("clock"); return calls++ ? 19 : 10; });
    assert.deepEqual(events, ["clock", "flush", "flush", "flush", "clock"]);
    assert.deepEqual(block, { operations: 3, elapsedMs: 9, perOperationMs: 3 });
    assert.deepEqual(snapshot(f), before);
    events.length = 0; calls = 0;
    measureControlBlock(f, "fade-only", 3, 4, () => { events.push("clock"); return calls++ ? 19 : 10; });
    assert.deepEqual(events, ["clock", "flush", "flush", "flush", "clock"]);
    assert.ok(f.batch.roots.every(value => value.fade.startedAt === 6 * 0.25));
  } finally { f.dispose(); }
});

test("controls-only coverage cannot be mistaken for the seven-scenario campaign and block results omit nested flush", () => {
  const coverage = campaignCoverage(true, 5);
  assert.equal(coverage.cases, 6); assert.equal(coverage.meetsFivePairCoverage, false);
  assert.equal(coverage.meetsFiveControlPairCoverage, true); assert.equal(coverage.completeSevenScenarioCoverage, false);
  assert.equal(campaignCoverage(false, 5).cases, 21);
  const results = runControlPair(A, B, 4, "fade-only", ["candidate", "baseline"], 3, 2, 4);
  assert.equal(results.length, 2);
  assert.equal(results[0].finalStateSha256, results[1].finalStateSha256);
  for (const result of results) {
    assert.equal(result.rawBlocks.length, 2); assert.equal(result.flushMs, null); assert.equal(result.summary.nestedFlush, null);
    assert.ok(result.rawBlocks.every(block => block.operations === 4 && block.perOperationMs === block.elapsedMs / 4));
  }
});
