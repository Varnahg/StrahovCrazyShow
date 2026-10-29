import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
// @ts-expect-error Standalone JavaScript CLI intentionally has no declaration file.
import { buildPlaytestReport, renderPlaytestHtml, createPlaytestArchive, readPlaytestRecords, resolveArtifactPath } from "../scripts/playtest-report.mjs";
// @ts-expect-error Standalone JavaScript CLI intentionally has no declaration file.
import { prepareReview, recordReviewReceipt, reconcileReview, readReviewLedger } from "../scripts/playtest-review.mjs";
import { createPlaytestMatrix } from "../shared/playtest-scenarios";

const sessionId = "b7b0de47-69f4-435c-9180-3831376e6ab4";
const identity = { diaryVersion: 1, sessionId, runId: "run1", gameInstanceId: "game1" };
const trial = createPlaytestMatrix()[0];
const refs = { connectionId: "connection1", scenarioId: trial.scenarioId, scenarioVersion: trial.scenarioVersion, stepId: trial.id };
const step = { ...refs, stationId: trial.stationId, trial: { lightingMode: trial.lightingMode, lightingInstant: 1000000, view: trial.view, qualityMode: trial.qualityMode, quality: "medium" }, traversal: "normal-input" };
const matrix = Array.from({ length: 16 }, (_, index) => index % 5 === 0 ? 1 : 0);
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function frame(frameId: number, at: number, flashlight = false, x = 110) {
  return { frameId, frameStartedAtMs: Math.max(0, at - 4), renderCompletedAtMs: at, frameMs: 16.67, utcMs: 1000000 + at,
    position: { x, y: 1, z: 12 }, renderPosition: { x, y: 1, z: 12 }, actorYaw: 0, speed: 0, vehicle: false,
    camera: { position: { x: 110, y: 2, z: 20 }, yaw: 0, pitch: .28, firstPerson: false, fov: 1, viewMatrix: matrix, projectionMatrix: matrix },
    rendering: { qualityMode: "medium", quality: "medium", hardwareScaling: 1, cssWidth: 1920, cssHeight: 1080, renderWidth: 1920, renderHeight: 1080, dpr: 1 },
    lighting: { mode: "day", instantUtcMs: 1000000 }, flashlight, zone: "campus" };
}
function fixtureRecords() {
  let seq = 0;
  const record = (kind: string, atMs: number, data: object = {}, extraRefs = {}) => ({ sessionId, seq: seq++, kind, atMs, data: { ...identity, refs: { ...refs, ...extraRefs }, ...data } });
  const media = [
    ["off-before", 220, false, undefined], ["on", 400, true, "on1"], ["off-after", 600, false, "off1"],
  ].map(([phase, at, flashlight, actionId], index) => {
    const artifactId = "image" + index;
    return { metadata: { ...identity, refs: { ...refs, ...(actionId ? { actionId } : {}) }, artifactId, requestId: "request" + index,
      phase, reason: "checkpoint", requestedAtMs: Number(at) - 10, captureStartedAtMs: at, capturedAtMs: Number(at) + 1,
      capturedAtUTC: new Date(1000000 + Number(at)).toISOString(), frame: frame(index + 20, Number(at), Boolean(flashlight)),
      source: { sourceSnapshotId: "a".repeat(64), sourceSnapshotScope: "code/config/tests", sourceId: null, gitHead: null, assetSnapshotId: null, assetSnapshotScope: "unavailable" },
      mimeType: "image/png", width: 2, height: 2, sourceWidth: 1920, sourceHeight: 1080, copyMs: 1 },
      receipt: { artifactId, storageKey: `run1/${artifactId}.png`, sha256: hash("image"), bytes: 5, savedAtUTC: new Date(2000000).toISOString() }, integrity: "verified", href: `media/run1/${artifactId}.png` };
  });
  const records = [
    record("playtest-game-start", 0, { run: { source: media[0].metadata.source } }),
    record("playtest-step-start", 1, { step }),
    record("playtest-pose-window", 201, { samples: [frame(1, 10, false, 109.6), frame(2, 110, false, 109.8), frame(3, 200)] }),
    record("playtest-input-window", 201, { samples: [{ atMs: 50, frameId: 1, execution: "prediction", source: "input", inputEpoch: 1, inputSeq: 1, simulationTick: 1, simulationUtcMs: 1000050, x: 1, z: 0, yaw: 0, jump: false, run: false, vehicle: false }] }),
    record("playtest-action-request", 300, { request: { action: "flashlight", origin: "keyboard", atMs: 300, frameId: 30, before: { flashlight: false } } }, { actionId: "on1" }),
    record("playtest-action-result", 320, { result: { status: "applied", atMs: 320, frameId: 32, after: { flashlight: true } } }, { actionId: "on1" }),
    record("playtest-action-request", 500, { request: { action: "flashlight", origin: "keyboard", atMs: 500, frameId: 50, before: { flashlight: true } } }, { actionId: "off1" }),
    record("playtest-action-result", 520, { result: { status: "applied", atMs: 520, frameId: 52, after: { flashlight: false } } }, { actionId: "off1" }),
    record("playtest-step-end", 650, { step, status: "completed", reason: null }),
    ...media.map((item) => record("playtest-capture-saved", 700, item)),
    record("playtest-game-end", 800, { reason: "exit" }),
  ];
  return { records, media };
}
async function temporary(t: TestContext) {
  const path = await mkdtemp(join(tmpdir(), "strahov-playtest-report-"));
  t.after(async () => { assert.ok(relative(tmpdir(), path).startsWith("strahov-playtest-report-")); await rm(path, { recursive: true, force: true }); });
  return path;
}
const stored = (records: unknown[]) => JSON.stringify({ type: "batch", schemaVersion: 1, sessionId, batchId: 0, digest: "fixture", receivedAtUTC: "2026-10-16T00:00:00Z", source: { contentSha256: "a".repeat(64) }, records }) + "\n";

test("completeness requires actual trace, acknowledged actions and correctly ordered verified captures", () => {
  const { records, media } = fixtureRecords();
  const report = buildPlaytestReport(records, { media });
  assert.equal(report.coverage.complete, 1);
  assert.equal(report.coverage.expected, 20);
  assert.equal(report.games[0].steps[0].evidence.normalInputSamples, 1);
  for (const kind of ["playtest-pose-window", "playtest-input-window", "playtest-action-result"]) {
    const partial = buildPlaytestReport(records.filter((row) => row.kind !== kind), { media });
    assert.equal(partial.coverage.complete, 0, kind);
  }
  const unverified = media.map((item) => ({ ...item, integrity: "unverified" }));
  assert.equal(buildPlaytestReport(records, { media: unverified }).coverage.complete, 0);
  const wrongBefore = structuredClone(media); wrongBefore[0].metadata.capturedAtMs = 350;
  assert.equal(buildPlaytestReport(records, { media: wrongBefore }).coverage.complete, 0);
});

test("a second game, camera change, teleport declaration or trace gap cannot borrow a passing comparison", () => {
  const { records, media } = fixtureRecords();
  const secondGame = records.map((row) => ({ ...row, data: { ...row.data, gameInstanceId: "game2" } }));
  assert.equal(buildPlaytestReport(secondGame, { media }).coverage.complete, 0);
  const changed = structuredClone(media); changed[1].metadata.frame.camera.position.x += 3;
  assert.equal(buildPlaytestReport(records, { media: changed }).coverage.complete, 0);
  const teleport = structuredClone(records);
  (teleport.find((row) => row.kind === "playtest-step-start")!.data as any).step.traversal = "teleport";
  assert.equal(buildPlaytestReport(teleport, { media }).coverage.complete, 0);
  assert.equal(buildPlaytestReport(records, { media, warnings: ["Sequence gap fixture"] }).coverage.complete, 0);
});

test("old recordings remain readable and HTML escapes event content and refuses injected media URLs", () => {
  const old = buildPlaytestReport([{ seq: 0, atMs: 0, kind: "frame-window", data: { frameMs: [16] } }]);
  assert.equal(old.diary, "unavailable"); assert.equal(old.coverage.complete, 0);
  const { records, media } = fixtureRecords();
  (records[0].data as any).danger = "</pre><script>alert(1)</script>";
  media[0].href = 'javascript:alert(1)';
  const html = renderPlaytestHtml(buildPlaytestReport(records, { media }));
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes("&lt;script&gt;")); assert.ok(html.includes("OFF → ON → OFF"));
});

test("archive preserves exact raw bytes/media SHA, is portable, and refuses overwrite", async (t) => {
  const directory = await temporary(t), logs = join(directory, sessionId + ".jsonl"), artifacts = join(directory, "artifacts");
  const { records, media } = fixtureRecords(), raw = stored(records);
  await writeFile(logs, raw); await mkdir(join(artifacts, "run1"), { recursive: true });
  for (const item of media) {
    await writeFile(join(artifacts, item.receipt.storageKey), "image");
    await writeFile(join(artifacts, item.receipt.storageKey.replace(".png", ".json")), JSON.stringify({ metadata: item.metadata, receipt: item.receipt }));
  }
  const out = join(directory, "archive"), archived = await createPlaytestArchive(logs, out, { artifactRoot: artifacts });
  assert.equal(await readFile(join(out, "raw", basenameForTest(logs)), "utf8"), raw);
  assert.equal(archived.report.coverage.complete, 1);
  assert.equal(archived.manifest.sourceLogsStable, true);
  for (const entry of archived.manifest.files) assert.equal(hash(await readFile(join(out, entry.path))), entry.sha256);
  await assert.rejects(createPlaytestArchive(logs, out, { artifactRoot: artifacts }), /EEXIST/);
  assert.equal(await readFile(logs, "utf8"), raw);
});
function basenameForTest(path: string) { return path.split(/[\\/]/).at(-1)!; }

test("tampered media and unsafe relative keys never certify a step", async (t) => {
  const directory = await temporary(t), logs = join(directory, sessionId + ".jsonl"), artifacts = join(directory, "artifacts");
  const { records, media } = fixtureRecords();
  await writeFile(logs, stored(records)); await mkdir(join(artifacts, "run1"), { recursive: true });
  for (const item of media) await writeFile(join(artifacts, item.receipt.storageKey), "tampered");
  const result = await createPlaytestArchive(logs, join(directory, "archive"), { artifactRoot: artifacts });
  assert.equal(result.report.coverage.complete, 0);
  assert.ok(result.report.warnings.some((warning: string) => warning.includes("SHA-256")));
  for (const key of ["../secret.png", "run1/../../secret.png", "C:/secret.png", "run1/image.png:stream", "run1/%2e%2e.png"])
    await assert.rejects(resolveArtifactPath(artifacts, key), /Invalid/);
});

test("parser exposes contradictory duplicates and preserves malformed source rows", async (t) => {
  const directory = await temporary(t), file = join(directory, sessionId + ".jsonl");
  const { records } = fixtureRecords();
  await writeFile(file, stored([records[0]]) + stored([{ ...records[0], atMs: 99 }]) + "{broken\n");
  const loaded = await readPlaytestRecords([file]);
  assert.ok(loaded.warnings.some((warning: string) => warning.includes("Conflicting")));
  assert.ok(loaded.warnings.some((warning: string) => warning.includes("malformed")));
  assert.ok(loaded.records[0].ambiguous);
});

const review = () => ({ projectKey: "strahov", archiveId: "a".repeat(64), findings: [{ key: "torch-wall-leak", title: "Flashlight crosses B6 wall", observed: "The adjacent closed room becomes lit in the captured ON frame.", severity: "medium", evidence: [{ reference: "media/run1/image1.png", sha256: "b".repeat(64) }], hypothesis: "Occluder coverage, not yet proven." }] });
test("review preparation and confirmed receipts are idempotent; uncertain creates require reconciliation", async (t) => {
  const directory = await temporary(t), ledger = join(directory, "review.jsonl"), first = await prepareReview(ledger, review());
  const before = await readFile(ledger, "utf8"), again = await prepareReview(ledger, review());
  assert.equal(again.operations[0].operationId, first.operations[0].operationId);
  assert.equal(await readFile(ledger, "utf8"), before);
  const changed = review(); changed.findings[0].observed += " Repeated.";
  assert.equal((await prepareReview(ledger, changed)).operations[0].status, "reconcile-required");
  const operationId = first.operations[0].operationId, receipt = { operationId, issueId: "KEY-100", issueUrl: "https://linear.app/team/issue/KEY-100/torch-wall-leak" };
  await recordReviewReceipt(ledger, receipt);
  const saved = await readFile(ledger, "utf8"); await recordReviewReceipt(ledger, receipt);
  assert.equal(await readFile(ledger, "utf8"), saved);
  assert.equal((await prepareReview(ledger, review())).operations[0].status, "already-recorded");
  assert.equal((await prepareReview(ledger, changed)).operations[0].action, "update");
  await assert.rejects(recordReviewReceipt(ledger, { ...receipt, issueId: "KEY-101" }), /Conflicting/);
  assert.ok((await readdir(directory)).every((name) => !name.endsWith(".lock")));
});

test("reconciliation records actual unique external identity, never treats absence as permission to duplicate", async (t) => {
  const directory = await temporary(t), ledger = join(directory, "review.jsonl"), prepared = await prepareReview(ledger, review());
  const operation = prepared.operations[0], observedAtUTC = "2026-10-16T01:00:00Z";
  const absent = await reconcileReview(ledger, { observedAtUTC, issues: [] });
  assert.equal(absent.results[0].status, "unresolved");
  await reconcileReview(ledger, { observedAtUTC, issues: [{ fingerprint: operation.fingerprint, operationId: operation.operationId, issueId: "KEY-100", issueUrl: "https://linear.app/team/issue/KEY-100/test", state: "Todo" }] });
  assert.equal((await prepareReview(ledger, review())).operations[0].status, "already-recorded");
  assert.equal((await readReviewLedger(ledger)).at(-1).event, "reconciled");
  const bytes = await readFile(ledger, "utf8"); await writeFile(ledger, bytes.replace("Todo", "Done"));
  await assert.rejects(readReviewLedger(ledger), /hash chain/);
});
