import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm, utimes } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
// The report is intentionally directly runnable by plain Node, without tsx.
// @ts-expect-error JavaScript CLI module has no separate declaration file.
import * as diagnosticsCli from "../scripts/diagnostics-report.mjs";
const { diagnosticsReport, summarizeDiagnosticFiles, formatDiagnosticsReport } =
  diagnosticsCli;

const id = "b7b0de47-69f4-435c-9180-3831376e6ab4";
const row = (batchId: number, records: unknown[], hash = "a".repeat(64)) =>
  JSON.stringify({
    type: "batch",
    schemaVersion: 1,
    sessionId: id,
    batchId,
    digest: String(batchId),
    receivedAtUTC: `2026-10-13T12:00:0${batchId}.000Z`,
    source: { contentSha256: hash, gitHead: "b".repeat(40), dirty: true },
    records,
  });
const record = (
  seq: number,
  kind: string,
  data: object,
  atMs = seq * 1000,
) => ({ seq, kind, data, atMs });
async function fixture(t: TestContext) {
  const directory = await mkdtemp(
    join(tmpdir(), "strahov-report-diagnostics-"),
  );
  t.after(async () => {
    assert.ok(
      relative(tmpdir(), directory).startsWith("strahov-report-diagnostics-"),
    );
    await rm(directory, { recursive: true, force: true });
  });
  return directory;
}

test("report computes global percentiles from raw intervals, separating hidden frames", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  const original =
    [
      row(0, [
        record(0, "session-start", {}),
        record(1, "frame-window", {
          frameMs: Array(99).fill(10),
          visibility: "visible",
          summary: { p99Ms: 9876 },
        }),
        record(2, "frame-window", { frameMs: [100], visibility: "visible" }),
      ]),
      row(1, [
        record(3, "frame-window", { frameMs: [3000], visibility: "hidden" }),
        record(4, "frame-window", {
          frameMs: [9800],
          visibility: "transition",
          afterVisibilityChange: true,
        }),
        record(5, "session-end", {}),
      ]),
    ].join("\n") + "\n";
  await writeFile(path, original);
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.performance.frames, 100);
  assert.equal(result.performance.p95FrameMs, 10);
  assert.equal(result.performance.p99FrameMs, 10);
  assert.equal(result.performance.maxFrameMs, 100);
  assert.equal(result.allVisibilityPerformance.frames, 102);
  assert.equal(result.allVisibilityPerformance.maxFrameMs, 9800);
  assert.equal(result.performance.averageFps, 100000 / 1090);
  assert.equal(result.warnings.length, 0);
  assert.equal(
    await readFile(path, "utf8"),
    original,
    "report never repairs or rewrites original evidence",
  );
});

test("report exposes incomplete tails, missing sequences, source changes, settings and errors", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  await writeFile(
    path,
    [
      row(0, [
        record(2, "game-settings", { quality: "high" }),
        record(3, "frame-hitch", {
          frameMs: 200,
          context: { position: { x: 1, z: 2 } },
        }),
      ]),
      '{"truncated":',
      row(
        1,
        [
          record(5, "js-error", { message: "fixture failure" }),
          record(6, "recording-gap", { dropped: 1 }),
        ],
        "c".repeat(64),
      ),
    ].join("\n"),
  );
  const result = await summarizeDiagnosticFiles([path]);
  assert.deepEqual(result.missingSequences, [
    { from: 0, to: 1 },
    { from: 4, to: 4 },
  ]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.changes.length, 1);
  assert.equal(result.worstHitches[0].data.context.position.x, 1);
  assert.ok(
    result.warnings.some((message: string) => message.includes("truncated")),
  );
  assert.ok(
    result.warnings.some((message: string) =>
      message.includes("Source changed"),
    ),
  );
  assert.ok(
    result.warnings.some((message: string) => message.includes("session-end")),
  );
  const human = formatDiagnosticsReport({ sessions: [result], warnings: [] });
  assert.match(human, /fixture failure/);
  assert.match(human, /game-settings/);
  assert.match(human, /WARNING/);
});

test("directory selects gameplay behind a newer idle menu and combines rotation; explicit/all do not substitute", async (t) => {
  const directory = await fixture(t),
    oldId = "a7b0de47-69f4-435c-9180-3831376e6ab4";
  const old = join(directory, oldId + ".jsonl");
  await writeFile(
    old,
    row(0, [
      record(0, "session-start", {}),
      record(1, "game-ready", {}),
    ]).replaceAll(id, oldId),
  );
  await utimes(old, new Date(0), new Date(0));
  await writeFile(
    join(directory, id + ".jsonl"),
    row(0, [record(0, "session-start", {})]) + "\n",
  );
  await writeFile(
    join(directory, id + ".part-0001.jsonl"),
    row(1, [
      record(1, "frame-window", { frameMs: [16, 17] }),
      record(2, "session-end", {}),
    ]) + "\n",
  );
  const menuId = "c7b0de47-69f4-435c-9180-3831376e6ab4",
    menu = join(directory, menuId + ".jsonl");
  await writeFile(
    menu,
    row(0, [
      record(0, "session-start", {}),
      record(1, "frame-window", { frameMs: [] }),
    ]).replaceAll(id, menuId),
  );
  await utimes(menu, new Date("2040-01-01"), new Date("2040-01-01"));
  const latest = await diagnosticsReport(directory);
  assert.equal(latest.sessions.length, 1);
  assert.equal(latest.sessions[0].sessionId, id);
  assert.equal(latest.sessions[0].files.length, 2);
  assert.equal(latest.sessions[0].records, 3);
  assert.equal(latest.sessions[0].gameplay.rawFrameIntervals, 2);
  assert.match(latest.selection, /skipped 1 newer/);
  assert.match(
    formatDiagnosticsReport(latest),
    /Selection: latest retained gameplay/,
  );
  const explicit = await diagnosticsReport(menu, { all: true });
  assert.equal(explicit.sessions[0].sessionId, menuId);
  assert.equal(explicit.sessions[0].gameplay.detected, false);
  assert.match(explicit.selection, /explicit file/);
  const all = await diagnosticsReport(directory, { all: true });
  assert.equal(all.sessions.length, 3);
  assert.equal(all.sessions[0].sessionId, menuId);
  assert.equal(
    (await diagnosticsReport(join(directory, "absent"))).sessions.length,
    0,
  );
});

test("game-ready establishes gameplay without frames; menu-only fallback explains the missing evidence", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  await writeFile(path, row(0, [record(0, "session-start", {})]));
  const fallback = await diagnosticsReport(directory);
  assert.equal(fallback.sessions.length, 1);
  assert.match(fallback.selection, /fallback: no retained session/);
  await writeFile(path, row(0, [record(0, "game-ready", {})]));
  assert.equal(
    (await diagnosticsReport(directory)).sessions[0].gameplay.detected,
    true,
  );
});

test("duplicate deliveries do not inflate FPS samples", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  const duplicate = row(0, [record(0, "frame-window", { frameMs: [10, 20] })]);
  await writeFile(path, duplicate + "\n" + duplicate + "\n");
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.performance.frames, 2);
  assert.equal(result.batches, 1);
  assert.equal(result.records, 1);
});

test("HTTP failures are errors and nonpersisted pagehide is a clean close", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      record(0, "session-start", {}),
      record(1, "resource-timing", {
        responseStatus: 404,
        source: "/missing.glb",
      }),
      record(2, "ui-state", { panel: "settings" }),
      record(3, "avatar-change", { preset: "fixture" }),
      record(4, "pagehide", { persisted: false }),
    ]),
  );
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.changes.length, 2);
  assert.ok(
    !result.warnings.some((warning: string) => warning.includes("session-end")),
  );
});

test("threshold counts use raw frame intervals, inclusive boundaries and visibility scope without observer double counting", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      record(0, "frame-window", {
        frameIntervalsMs: [49.9, 50, 99.9, 100, 249.9, 250, 999.9, 1000],
        visibility: "visible",
      }),
      record(1, "frame-window", { frameMs: [9000], visibility: "hidden" }),
      record(2, "frame-window", {
        frameMs: [8000],
        afterVisibilityChange: true,
      }),
      record(3, "frame-window", {
        frameMs: [7000],
        context: { visible: false },
      }),
      record(4, "frame-hitch", {
        frameMs: 1000,
        previousFrame: {
          cpuMs: 950,
          phases: { render: 930 },
          enginePhases: { activeMeshes: 120 },
        },
        previousContext: { position: { x: 12, z: 24 } },
        previousContextAgeMs: 250,
      }),
      record(5, "longtask", { startTime: 3000, duration: 1000 }),
      record(6, "long-animation-frame", { startTime: 3000, duration: 1000 }),
      record(7, "frame-hitch", { frameMs: 9000, visibility: "hidden" }),
      record(8, "session-end", {}),
    ]),
  );
  const result = await summarizeDiagnosticFiles([path]);
  assert.deepEqual(result.performance.thresholds, {
    atLeast50Ms: 7,
    atLeast100Ms: 5,
    atLeast250Ms: 3,
    atLeast1000Ms: 1,
  });
  assert.deepEqual(result.excludedVisibilityPerformance.thresholds, {
    atLeast50Ms: 3,
    atLeast100Ms: 3,
    atLeast250Ms: 3,
    atLeast1000Ms: 3,
  });
  assert.equal(result.allVisibilityPerformance.frames, 11);
  assert.equal(
    result.incidents.find(
      (item: { code: string }) => item.code === "foreground-frame-stalls",
    ).count,
    7,
  );
  assert.deepEqual(result.observerCounts, {
    longtask: 1,
    longAnimationFrame: 1,
    sampledFrameHitches: 2,
  });
  assert.equal(result.worstForegroundFrameHitches.length, 1);
  const human = formatDiagnosticsReport({ sessions: [result], warnings: [] });
  assert.match(human, /previous-frame CPU 950.00 ms/);
  assert.match(human, /"render":930/);
  assert.match(human, /"activeMeshes":120/);
  assert.match(human, /"x":12,"z":24/);
  assert.match(human, /not added to raw stall counts/);
  assert.match(human, /OBSERVER observed start \+3.00s; delivered \+5.00s/);
});

test("legacy overflow and resync records remain visible incidents despite zero runtime errors", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      record(0, "network-connected", {}),
      record(1, "game-ready", {}),
      record(2, "frame-window", {
        frameMs: [16],
        contextAtMs: 1500,
        context: { mode: "multiplayer", connection: "connecting" },
      }),
      record(3, "network-input-overflow", { queued: 65 }),
      record(4, "network-input-overflow", { queued: 65 }),
      record(5, "network-correction", { resync: true, correctionMetres: 0 }),
      record(6, "network-correction", {
        resync: false,
        correctionMetres: 0.35,
      }),
      record(7, "network-correction", {
        resync: false,
        correctionMetres: 2.12,
      }),
      record(8, "action", { action: "interact" }),
      record(9, "session-end", {}),
    ]),
  );
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.errors.length, 0);
  assert.equal(result.severity, "high");
  assert.equal(result.network.inputOverflowEvents, 2);
  assert.equal(result.network.droppedInputsAtLeast, 130);
  assert.equal(result.network.resyncEvents, 1);
  assert.equal(result.network.resyncsWithoutReason, 1);
  assert.equal(result.network.hardCorrectionEvents, 2);
  assert.equal(result.network.hardCorrectionMetres.max, 2.12);
  assert.equal(result.network.inconsistentConnectionWindows, 1);
  assert.ok(
    result.warnings.some((message: string) =>
      message.includes("legacy resync"),
    ),
  );
  const human = formatDiagnosticsReport({ sessions: [result], warnings: [] });
  assert.match(human, /Severity: high; 0 runtime errors/);
  assert.match(human, /INCIDENT \[high\] network-input-overflow: 2/);
  assert.match(human, /resync-reason-missing/);
  assert.match(human, /LIFECYCLE .*network-input-overflow/);
  assert.match(human, /ACTION .*interact/);
});

test("new correction reasons and intentional mode/respawn flags are preserved; unknown distances are not zero", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      record(0, "network-correction", {
        resync: true,
        correctionMetres: 1.2,
        resyncReason: "frame-gap",
        authorityAck: 22,
      }),
      record(1, "network-correction", {
        resync: true,
        correctionMetres: null,
        resyncReason: "respawn",
        respawn: true,
      }),
      record(2, "network-correction", {
        resync: false,
        correctionMetres: 2.9,
        modeChanged: true,
      }),
      record(3, "network-correction", {
        resync: false,
        correctionMetres: 0.4,
        respawn: true,
      }),
      record(4, "session-end", {}),
    ]),
  );
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.network.resyncsWithoutReason, 0);
  assert.equal(result.network.resyncsWithZeroDistance, 0);
  assert.equal(result.network.correctionsWithoutDistance, 1);
  assert.deepEqual(
    { ...result.network.resyncReasons },
    { "frame-gap": 1, respawn: 1 },
  );
  assert.equal(result.network.hardCorrectionsDuringModeChange, 1);
  assert.equal(result.network.hardCorrectionsDuringRespawn, 1);
  assert.equal(result.network.hardCorrectionMetres.samples, 2);
  assert.ok(
    !result.incidents.some(
      (item: { code: string }) => item.code === "resync-reason-missing",
    ),
  );
});

test("connection inconsistency checks event order and sampled-context age, excluding guest and disconnected states", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  const context = { mode: "multiplayer", connection: "connecting" };
  await writeFile(
    path,
    row(0, [
      record(5, "frame-window", { frameMs: [16], context }),
      record(0, "network-connected", {}, 1000),
      record(
        1,
        "frame-window",
        { frameMs: [16], contextAtMs: 999, context },
        1001,
      ),
      record(2, "frame-window", {
        frameMs: [16],
        context: { ...context, mode: "guest" },
      }),
      record(3, "frame-window", { frameMs: [16], context }),
      record(4, "network-disconnected", {}),
      record(6, "network-connecting", {}),
      record(7, "frame-window", { frameMs: [16], context }),
      record(8, "session-end", {}),
    ]),
  );
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.network.inconsistentConnectionWindows, 1);
  assert.equal(result.performance.frames, 5);
  assert.deepEqual(result.missingSequences, []);
});

test("large repeated detail streams are bounded while incident and raw sample counts remain exact", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  const records = Array.from({ length: 300 }, (_, seq) =>
    record(seq, "network-input-overflow", { queued: 65 }),
  );
  records.push(record(300, "frame-window", { frameMs: Array(2000).fill(100) }));
  records.push(record(301, "session-end", {}));
  await writeFile(path, row(0, records));
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.records, 302);
  assert.equal(result.network.inputOverflowEvents, 300);
  assert.equal(result.network.droppedInputsAtLeast, 19500);
  assert.equal(result.lifecycle.length, 200);
  assert.equal(result.lifecycle.at(-1).seq, 301);
  assert.equal(result.performance.frames, 2000);
  assert.equal(result.performance.thresholds.atLeast100Ms, 2000);
  assert.equal(result.performance.p99FrameMs, 100);
  assert.ok(
    result.warnings.some((message: string) =>
      message.includes("showing latest 200 of 301"),
    ),
  );
});

test("corrupt entries and duplicate sequences are reported without duplicating raw frame counts", async (t) => {
  const directory = await fixture(t),
    path = join(directory, id + ".jsonl");
  await writeFile(
    path,
    [
      "null",
      row(0, [record(0, "frame-window", { frameMs: [100] })]),
      row(1, [
        record(0, "frame-window", { frameMs: [5000] }),
        record(1, "session-end", {}),
      ]),
      '{"truncated":',
    ].join("\n"),
  );
  const result = await summarizeDiagnosticFiles([path]);
  assert.equal(result.performance.frames, 1);
  assert.equal(result.performance.maxFrameMs, 100);
  assert.equal(result.records, 2);
  assert.equal(
    result.incidents.find(
      (item: { code: string }) => item.code === "recording-incomplete",
    ).count,
    3,
  );
  assert.ok(
    result.warnings.some((message: string) =>
      message.includes("invalid log entry"),
    ),
  );
  assert.ok(
    result.warnings.some((message: string) =>
      message.includes("Duplicate record sequence"),
    ),
  );
});
