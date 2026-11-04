import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { assessFrameSample, gameplayAcceptancePolicy } from "../shared/gameplay-acceptance";
const { GameplayAcceptanceCollector, evaluateGameplayLog } = await import(new URL("../scripts/gameplay-acceptance.mjs", import.meta.url).href);

const hash = "a".repeat(64), id = "11111111-1111-4111-8111-111111111111";
test("přesná percentile boundary odpovídá publikovanému Game benchmarku", () => {
  const sample = [...Array(570).fill(16), ...Array(30).fill(36)];
  const result = assessFrameSample(sample);
  assert.equal(result.metrics!.p95Ms, 36);
  assert.equal(result.metrics!.p99Ms, 36);
  assert.ok(result.metrics!.averageFps > 54);
  assert.equal(result.status, "failed");
  assert.deepEqual(result.reasons.map(reason => reason.code), ["p95-frame"]);
});
type RecordRow = { seq: number; atMs: number; kind: string; data: any };
function records({ seconds = 70, moving = true, dispose = true }: { seconds?: number; moving?: boolean; dispose?: boolean } = {}) {
  const out: RecordRow[] = [];
  const add = (atMs: number, kind: string, data: object = {}) => out.push({ seq: out.length, atMs, kind, data });
  add(0, "session-start"); add(1, "browser-state", { visibility: "visible", focused: true }); add(1000, "game-ready");
  for (let index = 0; index < seconds; index++) {
    const fromMs = 1000 + index * 1000, toMs = fromMs + 1000;
    add(toMs + 1, "frame-window", { fromMs, toMs, frameMs: Array(60).fill(1000 / 60), summary: { frames: 60 },
      visibility: "visible", afterVisibilityChange: false, contextAtMs: toMs,
      context: { mode: "multiplayer", connection: "connected", position: { x: moving ? index * 4 : 0, y: 0, z: 0 },
        speed: moving ? 4 : 0, rendering: { quality: index < 20 ? "medium" : index < 40 ? "high" : "low" },
        network: { corrections: index, resyncs: 0, authorityAgeMs: 10, timeline: { inputEpoch: 1 } } } });
  }
  if (dispose) add((seconds + 1) * 1000 + 2, "game-dispose");
  return out;
}
function batch(input: RecordRow[]) {
  return { type: "batch", schemaVersion: 1, sessionId: id, batchId: 0, source: { buildSnapshotId: hash }, records: input };
}
function assess(input: RecordRow[], policy: object = {}) {
  const collector = new GameplayAcceptanceCollector({ sourceHash: hash, policy });
  collector.addBatch(batch(input)); return collector.assessment({ completeSession: true });
}

test("krátký frame sample má vlastní scope a explicitní tolerance", () => {
  const good = assessFrameSample(Array(600).fill(1000 / 60));
  assert.equal(good.status, "passed"); assert.equal(good.scope, "frame-sample");
  const bad = assessFrameSample([...Array(599).fill(1000 / 60), 1000]);
  assert.equal(bad.status, "failed"); assert.ok(bad.reasons.some(reason => reason.code === "max-frame"));
  assert.equal(bad.metrics?.maxMs, 1000);
  const slow = assessFrameSample(Array(200).fill(50));
  assert.equal(slow.status, "failed"); assert.ok(slow.reasons.some(reason => reason.code === "average-fps"));
  assert.ok(slow.reasons.some(reason => reason.code === "hitch-fraction"));
});

test("chybějící, neplatné, řídké a příliš krátké intervaly nejsou zelené", () => {
  for (const input of [undefined, [], [NaN], [Infinity], [0], [-1], ["16"], [16, null], Array(1000)])
    assert.equal(assessFrameSample(input).status, "inconclusive");
  assert.equal(assessFrameSample(Array(10).fill(16)).status, "inconclusive");
  assert.throws(() => gameplayAcceptancePolicy({ targetFps: 0 }));
  assert.throws(() => gameplayAcceptancePolicy({ minMovementSeconds: 0 }));
  assert.throws(() => gameplayAcceptancePolicy({ maxHitchFraction: 2 }));
  assert.throws(() => gameplayAcceptancePolicy({ unknown: 1 } as any));
});

test("přejímka vyžaduje skutečnou viditelnou délku, trasu a síťové údaje", () => {
  const good = assess(records());
  assert.equal(good.status, "passed", JSON.stringify(good.reasons));
  assert.equal(good.observationScope, "complete-game-session");
  assert.ok(good.coverage.movementSeconds >= 20); assert.ok(good.coverage.travelMetres >= 20);
  assert.deepEqual(good.coverage.qualities, ["medium", "high", "low"]);
  const idle = assess(records({ moving: false }));
  assert.equal(idle.status, "inconclusive"); assert.ok(idle.reasons.some((r: any) => r.code === "missing-movement"));
  const short = assess(records({ seconds: 10 }));
  assert.equal(short.status, "inconclusive"); assert.equal(short.coverageComplete, false);
  const noNet = records(); delete noNet[3].data.context.network;
  assert.equal(assess(noNet).status, "inconclusive");
});

test("celá relace potřebuje ukončení, plánované měřicí okno ho nenahrazuje", () => {
  const input = records({ dispose: false });
  assert.equal(assess(input).status, "inconclusive");
  const collector = new GameplayAcceptanceCollector({ sourceHash: hash }); collector.addBatch(batch(input));
  assert.equal(collector.assessment().status, "passed");
  assert.equal(collector.assessment().observationScope, "planned-measurement-window");
});

test("skryté a přechodové snímky nevytvoří důkaz pohybu; změna kvality zásek neskryje", () => {
  const hidden = records(); for (const row of hidden.filter(r => r.kind === "frame-window")) row.data.visibility = "hidden";
  assert.equal(assess(hidden).status, "inconclusive"); assert.equal(assess(hidden).coverage.visibleSeconds, 0);
  const transition = records(); for (const row of transition.filter(r => r.kind === "frame-window")) row.data.afterVisibilityChange = true;
  assert.equal(assess(transition).status, "inconclusive");
  const high = records(); high[25].data.frameMs[0] = 1371;
  const result = assess(high);
  assert.equal(result.status, "failed"); assert.equal(result.coverageComplete, false);
  assert.ok(result.coverageIssues.some((r: any) => r.code === "window-duration"));
  assert.ok(result.reasons.some((r: any) => r.code === "max-frame"));
});

test("mezery, změna identity a pokles kumulativních čítačů neprojdou", () => {
  const gap = records(); gap.splice(20, 1); assert.equal(assess(gap).status, "inconclusive");
  const reset = records(); reset[20].data.context.network.corrections = 0; reset[20].data.context.network.timeline.inputEpoch = 2;
  const result = assess(reset); assert.equal(result.status, "inconclusive");
  assert.ok(result.reasons.some((r: any) => r.code === "network-counter-reset"));
  const collector = new GameplayAcceptanceCollector({ sourceHash: hash });
  collector.addBatch({ ...batch(records()), source: { buildSnapshotId: "b".repeat(64) } });
  assert.equal(collector.assessment().status, "inconclusive");
  const doubled = records(); doubled[20] = { ...doubled[20], kind: "game-ready", data: {} };
  assert.equal(assess(doubled).status, "inconclusive");
});

test("resync event a snapshot se nesčítají; korekce není cesta", () => {
  const input = records();
  const firstWindow = input[3];
  input.splice(4, 0, { seq: 4, atMs: firstWindow.atMs + 1, kind: "network-correction", data: { resync: true, correctionAvailable: true, correctionMetres: 1.5 } });
  input.forEach((row, index) => { row.seq = index; if (row.kind === "frame-window" && index > 4) row.data.context.network.resyncs = 1; });
  const result = assess(input);
  assert.equal(result.network.resyncEvents, 1); assert.equal(result.network.resyncCounterDelta, 1); assert.equal(result.network.resyncs, 1);
  assert.equal(result.status, "failed"); assert.ok(result.reasons.some((r: any) => r.code === "position-correction"));
  const teleports = records({ moving: false });
  for (const row of teleports.filter(row => row.kind === "frame-window")) row.data.context.position.x = row.seq * 20;
  assert.equal(assess(teleports).coverage.travelMetres, 0);
});

test("úplné seq nepovolí chybějící první, poslední ani navazující přechodová okna", () => {
  const renumber = (rows: RecordRow[]) => rows.map((row, seq) => ({ ...row, seq }));
  const leading = records(); leading.splice(3, 5);
  const leadResult = assess(renumber(leading));
  assert.equal(leadResult.status, "inconclusive"); assert.ok(leadResult.coverage.visibleSeconds >= 60);
  assert.ok(leadResult.coverageIssues.some((r: any) => r.code === "leading-window-gap"));
  const trailing = records(); trailing.splice(trailing.length - 6, 5);
  const tailResult = assess(renumber(trailing));
  assert.equal(tailResult.status, "inconclusive"); assert.ok(tailResult.coverageIssues.some((r: any) => r.code === "trailing-window-gap"));
  const transition = records(); transition[3].data.visibility = "transition"; transition[3].data.afterVisibilityChange = true;
  transition.splice(4, 5);
  assert.ok(assess(renumber(transition)).coverageIssues.some((r: any) => r.code === "window-gap"));
  const normalStart = records(); normalStart[3].data.visibility = "transition"; normalStart[3].data.afterVisibilityChange = true;
  assert.equal(assess(normalStart).status, "passed", "první doložený transition se smí výslovně vyloučit");
  const normalEnd = records(); normalEnd.at(-1)!.atMs += 200;
  assert.equal(assess(normalEnd).status, "passed", "ukončení uvnitř jednoho přípustného intervalu není chybějící pětisekundový konec");
});

test("doložené skrytí vysvětluje mezeru, ukončení respektuje CPU a network-left hranici", () => {
  const hidden = records(); hidden.splice(23, 5);
  hidden.push({ seq: 0, atMs: 21000, kind: "browser-state", data: { visibility: "hidden" } });
  hidden.push({ seq: 0, atMs: 26000, kind: "browser-state", data: { visibility: "visible" } });
  hidden.sort((a, b) => a.atMs - b.atMs); hidden.forEach((row, seq) => { row.seq = seq; });
  assert.equal(assess(hidden).status, "passed", JSON.stringify(assess(hidden).reasons));
  const tail = records(); const last = tail.at(-2)!; last.data.cpuMs = Array(60).fill(50);
  last.data.recorderMaxMs = 0.2; last.atMs = last.data.toMs + 51;
  tail.at(-1)!.atMs = last.atMs + 150;
  tail.splice(tail.length - 1, 0, { seq: 0, atMs: last.atMs + 0.2, kind: "network-left", data: {} });
  tail.forEach((row, seq) => { row.seq = seq; });
  assert.equal(assess(tail).status, "passed", JSON.stringify(assess(tail).reasons));
  const longTail = records(); longTail.at(-2)!.data.cpuMs = Array(60).fill(5000); longTail.at(-2)!.atMs += 5000; longTail.at(-1)!.atMs += 5000;
  assert.notEqual(assess(longTail).status, "passed", "dlouhý poslední callback nesmí zakrýt pětisekundovou chybějící frametime část");
});

test("zastaralá autorita nebo čekání bez resync odpovědi nesmí projít při zdravém FPS", () => {
  const stale = records();
  for (const row of stale.filter(row => row.kind === "frame-window" && row.atMs > 22000)) {
    row.data.context.speed = 0; row.data.context.position.x = 80; row.data.context.network.authorityAgeMs = 2000;
  }
  const result = assess(stale);
  assert.equal(result.status, "failed"); assert.equal(result.frameSample.status, "passed"); assert.equal(result.network.resyncs, 0);
  assert.ok(result.reasons.some((r: any) => r.code === "stale-authority"));
  const waiting = records();
  for (let i = 0; i < 3; i++) waiting.push({ seq: 0, atMs: 23000 + i * 1000, kind: "network-timeline-wait", data: { reason: "prediction-budget", recoveryRequested: true } });
  waiting.sort((a, b) => a.atMs - b.atMs); waiting.forEach((row, seq) => { row.seq = seq; });
  const waits = assess(waiting); assert.equal(waits.status, "failed"); assert.equal(waits.network.timelineWaits, 3); assert.equal(waits.network.resyncs, 0);
  assert.ok(waits.reasons.some((r: any) => r.code === "timeline-wait-rate"));
  const missing = records(); delete missing[20].data.context.network.authorityAgeMs;
  assert.equal(assess(missing).status, "inconclusive");
  const disconnected = records(); disconnected[20].data.context.connection = "disconnected";
  assert.equal(assess(disconnected).status, "failed");
});

test("archiv uživatelova hraní selže na skutečných zásecích a synchronizaci", async () => {
  const path = "docs/performance/evidence/gameplay-frame-cost-20261103/user-playtest-20261104/recording.jsonl.gz";
  const result = await evaluateGameplayLog(path, { sourceHash: "2cdef569736faa5d3af601db33363b4f2430d2f80937e8cf15c1e67ec912c144" });
  assert.equal(result.status, "failed", JSON.stringify(result.reasons));
  assert.equal(result.records, 7534); assert.equal(result.frameSample.metrics.maxMs, 6661.6);
  assert.equal(result.network.resyncs, 159); assert.ok(result.network.maxCorrectionMetres > 2.67);
  assert.equal(result.coverage.windows, 373); assert.equal(result.coverageComplete, false);
  assert.ok(result.coverage.movementSeconds >= 20); assert.ok(result.coverage.travelMetres >= 20);
  for (const code of ["average-fps", "p95-frame", "max-frame", "resync-rate", "position-correction", "window-duration"])
    assert.ok(result.reasons.some((r: any) => r.code === code), code);
});

test("přímý Node CLI čte TypeScript helper, neúplný JSONL nedostane PASS a výstup se nepřepíše", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gameplay-gate-"));
  try {
    const input = join(dir, "sample.jsonl"), output = join(dir, "result.json");
    await writeFile(input, JSON.stringify(batch(records())) + "\n");
    const run = spawnSync(process.execPath, ["scripts/gameplay-acceptance.mjs", input, "--source", hash, "--output", output], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(await readFile(output, "utf8")).status, "passed");
    const rerun = spawnSync(process.execPath, ["scripts/gameplay-acceptance.mjs", input, "--source", hash, "--output", output], { encoding: "utf8" });
    assert.notEqual(rerun.status, 0); assert.match(rerun.stderr, /EEXIST/);
    await writeFile(input, JSON.stringify(batch(records())));
    const partial = await evaluateGameplayLog(input, { sourceHash: hash });
    assert.equal(partial.status, "inconclusive"); assert.ok(partial.reasons.some((r: any) => r.code === "unterminated-jsonl"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
