import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, utimes } from "node:fs/promises";
import { join, relative } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
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

test("identity changes preserve established connection evidence without creating or restoring it", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  const cases = [
    { kinds: ["network-connected", "network-left"], expected: 3 },
    { kinds: ["network-connected", "network-left", "network-left"], expected: 3 },
    { kinds: ["network-left"], expected: 0 },
    { kinds: ["network-left", "network-left"], expected: 0 },
    { kinds: ["network-connected", "network-disconnected", "network-left"], expected: 0 },
    { kinds: ["network-connected", "network-connecting", "network-left"], expected: 0 },
    {
      kinds: ["network-connected", "network-disconnected", "network-left", "network-connected", "network-left"],
      expected: 3,
    },
  ];
  for (const { kinds, expected } of cases) {
    await t.test(kinds.join(" → "), async () => {
      const events = kinds.map((kind, seq) =>
        record(seq, kind, { reason: "identity-change" }),
      );
      const windows = ["connecting", "offline", "disconnected", "connected"].map(
        (connection, index) => record(events.length + index, "frame-window", {
          frameMs: [16],
          context: { mode: "multiplayer", connection },
        }),
      );
      await writeFile(path, row(0, [
        ...events,
        ...windows,
        record(events.length + windows.length, "frame-window", {
          frameMs: [100],
          context: { mode: "guest", connection: "offline" },
        }),
        record(events.length + windows.length + 1, "session-end", {}),
      ]));
      const result = await summarizeDiagnosticFiles([path]);
      assert.equal(result.network.inconsistentConnectionWindows, expected);
      assert.equal(result.performance.frames, 5, "guest raw frames still count");
      assert.equal(result.performance.p99FrameMs, 100);
      assert.equal(
        result.incidents.find((item: { code: string }) =>
          item.code === "connection-state-inconsistent")?.count ?? 0,
        expected,
      );
      assert.deepEqual(
        result.lifecycle.filter((item: { kind: string }) => item.kind === "network-left"),
        events.filter((item) => item.kind === "network-left"),
        "identity-change lifecycle records retain their exact kind, reason and time",
      );
    });
  }
});

test("all other leave reasons end connection evidence and identity changes cannot revive it", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  const reasons = [
    {}, { reason: "left" }, { reason: "" }, { reason: null },
    { reason: 0 }, { reason: true }, { reason: {} }, { reason: [] },
    { reason: ["identity-change"] }, { reason: { value: "identity-change" } },
    { reason: "Identity-change" }, { reason: "IDENTITY-CHANGE" },
    { reason: " identity-change" }, { reason: "identity-change " },
  ];
  for (const data of reasons) {
    await t.test(JSON.stringify(data), async () => {
      const window = (seq: number) => record(seq, "frame-window", {
        frameMs: [16], context: { mode: "multiplayer", connection: "offline" },
      });
      await writeFile(path, row(0, [
        record(0, "network-connected", {}),
        record(1, "network-left", data),
        window(2),
        record(3, "network-left", { reason: "identity-change" }),
        window(4),
        record(5, "network-connected", {}),
        record(6, "network-left", { reason: "identity-change" }),
        window(7),
        record(8, "session-end", {}),
      ]));
      const result = await summarizeDiagnosticFiles([path]);
      assert.equal(result.network.inconsistentConnectionWindows, 1);
      assert.deepEqual(result.lifecycle.find((item: { seq: number }) => item.seq === 1).data, data);
    });
  }
});

test("identity changes retain the original connected timestamp for context age and fallback", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  for (const [contextAtMs, expected] of [
    [999, 0], [1000, 1], [1500, 1], [2000, 1], [2500, 1],
    [undefined, 1], [null, 1], ["999", 1], [{ atMs: 999 }, 1],
  ] as const) {
    await t.test(String(JSON.stringify(contextAtMs)), async () => {
      await writeFile(path, row(0, [
        record(0, "network-connected", {}, 1000),
        record(1, "network-left", { reason: "identity-change" }, 2000),
        record(2, "frame-window", {
          frameMs: [16], contextAtMs,
          context: { mode: "multiplayer", connection: "connecting" },
        }, 3000),
        record(3, "session-end", {}, 4000),
      ]));
      const result = await summarizeDiagnosticFiles([path]);
      assert.equal(result.network.inconsistentConnectionWindows, expected);
    });
  }
});

test("identity classification sorts shuffled files by sequence, deduplicates and preserves time warnings", async (t) => {
  const directory = await fixture(t),
    a = join(directory, "a.jsonl"),
    b = join(directory, "b.jsonl");
  const window = (seq: number, contextAtMs: number) => record(seq, "frame-window", {
    frameMs: [16], contextAtMs,
    context: { mode: "multiplayer", connection: "offline" },
  });
  const first = row(0, [
    window(4, 1000),
    record(1, "network-left", { reason: "identity-change" }),
    record(0, "network-connected", {}, 1000),
  ]);
  await writeFile(a, first + "\n" + first);
  await writeFile(b, row(1, [
    window(7, 6500),
    record(6, "network-left", { reason: "identity-change" }),
    record(5, "network-disconnected", {}, 3500),
    record(3, "network-left", { reason: "identity-change" }),
    window(2, 1500),
    record(8, "session-end", {}),
  ]));
  const originals = await Promise.all([readFile(a), readFile(b)]);
  const forward = await summarizeDiagnosticFiles([a, b]);
  const reverse = await summarizeDiagnosticFiles([b, a]);
  assert.equal(forward.network.inconsistentConnectionWindows, 2);
  assert.deepEqual(reverse.network, forward.network);
  assert.deepEqual(reverse.lifecycle, forward.lifecycle);
  assert.deepEqual(reverse.performance, forward.performance);
  assert.equal(forward.performance.frames, 3);
  assert.equal(forward.records, 9);
  assert.deepEqual(forward.missingSequences, []);
  for (const result of [forward, reverse])
    assert.ok(result.warnings.includes("Monotonic time went backwards at sequence 5"));
  assert.deepEqual(await Promise.all([readFile(a), readFile(b)]), originals);
});

test("plain Node JSON/text CLI preserves identity semantics, raw statistics, clock boundaries and malformed input bytes", async (t) => {
  const directory = await fixture(t),
    path = join(directory, "identity evidence.jsonl");
  const evidence = new URL("../docs/performance/evidence/diagnostic-identity-20261020/input.jsonl", import.meta.url);
  const original = await readFile(evidence);
  const input = Buffer.concat([original, Buffer.from('\nnull\n{"truncated":')]);
  await writeFile(path, input);
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  const invoke = (args: string[]) => {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../scripts/diagnostics-report.mjs", import.meta.url)),
      path, ...args,
    ], {
      cwd: directory, env, encoding: "utf8", windowsHide: true,
      timeout: 30000, maxBuffer: 4 * 1024 * 1024,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    return result.stdout;
  };
  const json = JSON.parse(invoke(["--json"]));
  assert.deepEqual(await readFile(path), input);
  const text = invoke([]);
  assert.deepEqual(await readFile(path), input);
  assert.deepEqual(await readFile(evidence), original);
  assert.equal(json.sessions.length, 1);
  const session = json.sessions[0];
  assert.equal(session.network.inconsistentConnectionWindows, 2);
  assert.equal(session.incidents.find((item: { code: string }) =>
    item.code === "connection-state-inconsistent").count, 2);
  assert.equal(session.performance.frames, 9);
  assert.equal(session.performance.averageFps, 9000 / 264);
  assert.equal(session.performance.p50FrameMs, 16);
  assert.equal(session.performance.p95FrameMs, 100);
  assert.equal(session.performance.p99FrameMs, 100);
  assert.equal(session.performance.maxFrameMs, 100);
  assert.deepEqual(session.serverClock.observed, { callbacks: 20, droppedMs: 12 });
  assert.equal(session.serverClock.comparableIntervals, 2);
  assert.equal(session.incidents.find((item: { code: string }) =>
    item.code === "recording-incomplete").count, 2);
  assert.ok(session.lifecycle.some((item: { kind: string; data: { reason?: unknown } }) =>
    item.kind === "network-left" && item.data.reason === "identity-change"));
  assert.match(text, /INCIDENT \[medium\] connection-state-inconsistent: 2\./);
  assert.match(text, /Foreground 9 frames: 34\.09 FPS; p95 100\.00 ms; p99 100\.00 ms; worst 100\.00 ms/);
  assert.match(text, /observed increments 20 callbacks \/ 12\.00 ms dropped across 2 comparable intervals/);
  assert.match(text, /LIFECYCLE .*network-left \{"reason":"identity-change"\}/);
  assert.match(text, /WARNING: .*truncated/);
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

const clockRecord = (
  seq: number,
  callbacks: number,
  droppedTotalMs: number,
  contextAtMs = seq * 1000,
  overrides: Record<string, unknown> = {},
) =>
  record(seq, "frame-window", {
    frameMs: [16],
    contextAtMs,
    context: {
      network: {
        server: {
          clock: {
            callbacks,
            droppedTotalMs,
            elapsedMs: 20,
            cpuMs: 2,
            elapsedMaxMs: 1109,
            cpuMaxMs: 1108,
            ...overrides,
          },
        },
      },
    },
  });

test("identity-change remains a server-clock boundary and rejects pre-change sampled context", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(path, row(0, [
    record(0, "network-connected", {}),
    clockRecord(1, 100, 10),
    clockRecord(2, 110, 15),
    record(3, "network-left", { reason: "identity-change" }),
    clockRecord(4, 999, 1000, 2500),
    clockRecord(5, 500, 100),
    clockRecord(6, 510, 107),
    record(7, "session-end", {}),
  ]));
  const { serverClock: clock } = await summarizeDiagnosticFiles([path]);
  assert.deepEqual(clock.observed, { callbacks: 20, droppedMs: 12 });
  assert.equal(clock.comparableIntervals, 2);
  assert.equal(clock.samples, 4);
  assert.equal(clock.diagnostics.staleContexts, 1);
  assert.equal(clock.diagnostics.lifecycleBoundaries, 3);
  assert.deepEqual(clock.segments.map((segment: { fromSeq: number; toSeq: number }) =>
    [segment.fromSeq, segment.toSeq]), [[1, 2], [5, 6]]);
  assert.deepEqual(clock.segments[1].baseline, { callbacks: 500, droppedTotalMs: 100 });
});

test("server clock separates observed increments, sampled callbacks and historical lifetime peaks", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  const first = clockRecord(0, 86629, 3966.6666666666665);
  await writeFile(
    path,
    row(0, [
      first,
      { ...first, seq: 1, atMs: 1000 },
      clockRecord(2, 108024, 4250.000000000001, 1999, {
        cpuMs: 15.3898,
        elapsedMs: 32.0614,
      }),
      record(3, "frame-hitch", {
        ...first.data,
        contextAtMs: 3000,
        frameMs: 9999,
      }),
      record(4, "session-end", {}),
    ]),
  );
  const result = await summarizeDiagnosticFiles([path]);
  const clock = result.serverClock;
  assert.equal(clock.status, "observed-intervals");
  assert.equal(clock.samples, 2);
  assert.equal(clock.comparableIntervals, 1);
  assert.equal(clock.observed.callbacks, 21395);
  assert.ok(Math.abs(clock.observed.droppedMs - 283.3333333333344) < 1e-8);
  assert.deepEqual(clock.sampledCurrentMaxMs, {
    elapsed: 32.0614,
    cpu: 15.3898,
  });
  assert.deepEqual(clock.reportedLifetimeMaxMs, { elapsed: 1109, cpu: 1108 });
  assert.equal(clock.diagnostics.duplicateContexts, 1);
  assert.equal(clock.segments[0].baseline.droppedTotalMs, 3966.6666666666665);
  assert.equal(clock.segments[0].last.droppedTotalMs, 4250.000000000001);
  const human = formatDiagnosticsReport({ sessions: [result], warnings: [] });
  assert.match(human, /observed increments.*21395.*283\.33 ms/);
  assert.match(human, /sampled callback maxima.*32\.06.*15\.39/);
  assert.match(human, /reported lifetime maxima.*1109\.00.*1108\.00/);
  assert.match(human, /not a full-session total/);
});

test("server clock without a comparable pair is unavailable, including repeated cached authority", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  for (const records of [
    [record(0, "session-start", {})],
    [clockRecord(0, 40, 80)],
    [clockRecord(0, 40, 80), clockRecord(1, 40, 80)],
  ]) {
    await writeFile(
      path,
      row(0, [...records, record(records.length, "session-end", {})]),
    );
    const result = await summarizeDiagnosticFiles([path]);
    assert.equal(result.serverClock.status, "unavailable");
    assert.deepEqual(result.serverClock.observed, {
      callbacks: null,
      droppedMs: null,
    });
    assert.equal(
      result.warnings.length,
      0,
      "absence of optional server data does not flood warnings",
    );
    assert.match(
      formatDiagnosticsReport({ sessions: [result], warnings: [] }),
      /Server clock: unavailable/,
    );
  }
});

test("server clock sorts shuffled parts and deduplicates batch/context delivery", async (t) => {
  const directory = await fixture(t),
    a = join(directory, "a.jsonl"),
    b = join(directory, "b.jsonl");
  const first = row(0, [clockRecord(0, 100, 10), clockRecord(1, 110, 20)]);
  await writeFile(a, first + "\n" + first);
  await writeFile(
    b,
    row(1, [
      clockRecord(3, 120, 30),
      clockRecord(2, 110, 20, 1000),
      record(4, "session-end", {}),
    ]),
  );
  const forward = (await summarizeDiagnosticFiles([a, b])).serverClock;
  const reverse = (await summarizeDiagnosticFiles([b, a])).serverClock;
  assert.deepEqual(forward, reverse);
  assert.deepEqual(forward.observed, { callbacks: 20, droppedMs: 20 });
  assert.equal(forward.diagnostics.duplicateContexts, 1);
});

test("server clock excludes every conflicting context copy and never bridges the conflict", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 100, 10),
      clockRecord(1, 110, 20, 1000),
      clockRecord(2, 120, 30, 1000),
      clockRecord(3, 130, 40),
      clockRecord(4, 140, 45),
    ]),
  );
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 10, droppedMs: 5 });
  assert.equal(clock.diagnostics.conflictingContexts, 1);
  assert.equal(clock.samples, 3);
});

test("server clock conflicting duplicate sequences are order independent even against non-clock records", async (t) => {
  const directory = await fixture(t),
    a = join(directory, "a.jsonl"),
    b = join(directory, "b.jsonl");
  await writeFile(
    a,
    row(0, [
      clockRecord(0, 100, 10),
      clockRecord(1, 110, 20),
      clockRecord(2, 120, 30),
      clockRecord(3, 130, 35),
    ]),
  );
  await writeFile(b, row(1, [record(1, "game-start", {})]));
  const forward = (await summarizeDiagnosticFiles([a, b])).serverClock;
  assert.deepEqual(
    forward,
    (await summarizeDiagnosticFiles([b, a])).serverClock,
  );
  assert.deepEqual(forward.observed, { callbacks: 10, droppedMs: 5 });
  assert.equal(forward.diagnostics.ambiguousSequences, 1);
});

test("server clock refuses ambiguous batch contents regardless of which copy appears first", async (t) => {
  const directory = await fixture(t),
    a = join(directory, "a.jsonl"),
    b = join(directory, "b.jsonl");
  await writeFile(
    a,
    row(0, [clockRecord(0, 100, 10), clockRecord(1, 110, 20)]),
  );
  await writeFile(
    b,
    row(0, [clockRecord(0, 200, 30), clockRecord(1, 220, 40)]).replace(
      '"digest":"0"',
      '"digest":"conflict"',
    ),
  );
  const forward = (await summarizeDiagnosticFiles([a, b])).serverClock;
  assert.deepEqual(
    forward,
    (await summarizeDiagnosticFiles([b, a])).serverClock,
  );
  assert.equal(forward.status, "unavailable");
  assert.deepEqual(forward.observed, { callbacks: null, droppedMs: null });
  assert.deepEqual(forward.sampledCurrentMaxMs, { elapsed: null, cpu: null });
});

test("server clock resets and impossible same-callback changes do not add a new lifetime baseline", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 100, 100),
      clockRecord(1, 110, 110),
      clockRecord(2, 10, 3),
      clockRecord(3, 20, 8),
      clockRecord(4, 30, 2),
      clockRecord(5, 40, 4),
      clockRecord(6, 40, 99),
      clockRecord(7, 50, 100),
      clockRecord(8, 60, 103),
    ]),
  );
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 40, droppedMs: 20 });
  assert.equal(clock.diagnostics.counterResets, 2);
  assert.equal(clock.diagnostics.clockConflicts, 1);
});

test("server clock respects connection/game boundaries, gaps and stale sampled context", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 100, 10),
      clockRecord(1, 110, 12),
      record(2, "network-connected", {}),
      clockRecord(3, 130, 50, 1900),
      clockRecord(4, 140, 60),
      clockRecord(5, 150, 63),
      record(6, "recording-gap", { dropped: 1 }),
      clockRecord(7, 170, 80),
      clockRecord(8, 180, 84),
      clockRecord(10, 200, 100),
      clockRecord(11, 210, 105),
      record(12, "game-start", {}),
      clockRecord(13, 230, 200),
      clockRecord(14, 240, 206),
      clockRecord(15, 250, 250, 13500),
      clockRecord(16, 260, 300),
      clockRecord(17, 270, 307),
    ]),
  );
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 60, droppedMs: 27 });
  assert.equal(clock.diagnostics.sequenceGaps, 1);
  assert.equal(clock.diagnostics.recordingGaps, 1);
  assert.equal(clock.diagnostics.lifecycleBoundaries, 2);
  assert.equal(clock.diagnostics.staleContexts, 2);
});

test("server clock rejects malformed scalars/context timestamps and tolerates recorder rounding", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  const records = [
    clockRecord(0, 100, 10, 0.1),
    clockRecord(1, 110, 12, 1000.9),
    clockRecord(2, 120, 20, 2001.1),
    clockRecord(3, 130, 30, 3000, { callbacks: "130" }),
    clockRecord(4, 140, -1),
    clockRecord(5, 150, 50, 5000, { cpuMs: null }),
    clockRecord(6, 160, 60, 6000, { callbacks: Number.MAX_SAFE_INTEGER + 1 }),
    clockRecord(7, 170, 70, 7000, { elapsedMaxMs: Infinity }),
    clockRecord(8, 180, 80),
    clockRecord(9, 190, 83),
  ];
  await writeFile(path, row(0, records));
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 30, droppedMs: 15 });
  assert.equal(clock.diagnostics.invalidSamples, 4);
  assert.equal(clock.diagnostics.unavailableTimingValues, 2);
});

test("server clock optional timing fields can be unavailable without losing valid counter increments", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  const noTimings = {
    cpuMs: undefined,
    elapsedMs: undefined,
    cpuMaxMs: undefined,
    elapsedMaxMs: undefined,
  };
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 100, 10, 0, noTimings),
      clockRecord(1, 120, 15, 1000, noTimings),
    ]),
  );
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 20, droppedMs: 5 });
  assert.deepEqual(clock.sampledCurrentMaxMs, { elapsed: null, cpu: null });
  assert.deepEqual(clock.reportedLifetimeMaxMs, { elapsed: null, cpu: null });
  assert.equal(clock.diagnostics.unavailableTimingValues, 8);
});

test("server clock missing fields break continuity and old context copies cannot cross reconnect", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 100, 10),
      clockRecord(1, 110, 20),
      record(2, "frame-window", {
        frameMs: [16],
        contextAtMs: 2000,
        context: {},
      }),
      clockRecord(3, 130, 300),
      clockRecord(4, 140, 305),
      record(5, "network-disconnected", {}),
      record(6, "network-connected", {}),
      clockRecord(7, 140, 305, 4000),
      clockRecord(8, 180, 800),
      clockRecord(9, 190, 803),
    ]),
  );
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 30, droppedMs: 18 });
  assert.equal(clock.diagnostics.missingSamples, 1);
  assert.equal(clock.diagnostics.staleContexts, 1);
});

test("server clock reports aggregate overflow as unavailable and bounds segment detail", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 0, 0),
      clockRecord(1, Number.MAX_SAFE_INTEGER, Number.MAX_VALUE),
      record(2, "game-start", {}),
      clockRecord(3, 0, 0),
      clockRecord(4, 1, Number.MAX_VALUE),
    ]),
  );
  const overflow = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.equal(overflow.status, "unavailable");
  assert.deepEqual(overflow.observed, { callbacks: null, droppedMs: null });
  assert.equal(overflow.diagnostics.numericOverflows, 1);
  const records = Array.from({ length: 205 }, (_, i) => [
    record(i * 3, "game-start", {}),
    clockRecord(i * 3 + 1, 100, 100),
    clockRecord(i * 3 + 2, 110, 105),
  ]).flat();
  await writeFile(path, row(0, records));
  const bounded = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(bounded.observed, { callbacks: 2050, droppedMs: 1025 });
  assert.equal(bounded.segments.length, 200);
  assert.equal(bounded.omittedSegments, 5);
});

test("server clock excludes previously unseen contexts sampled before missing/invalid deliveries", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  for (const unknown of [
    record(2, "frame-window", { frameMs: [16], context: {} }),
    clockRecord(2, -1, 0),
  ]) {
    await writeFile(
      path,
      row(0, [
        clockRecord(0, 100, 10),
        clockRecord(1, 110, 15),
        unknown,
        clockRecord(3, 130, 100, 1500),
        clockRecord(4, 140, 110),
        clockRecord(5, 150, 113),
      ]),
    );
    const clock = (await summarizeDiagnosticFiles([path])).serverClock;
    assert.deepEqual(clock.observed, { callbacks: 20, droppedMs: 8 });
    assert.equal(clock.diagnostics.staleContexts, 1);
  }
});

test("server clock cannot bridge a sequence gap using a newly delivered pre-gap context", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 100, 10),
      clockRecord(1, 110, 15),
      clockRecord(3, 130, 100, 1500),
      clockRecord(4, 140, 110),
      clockRecord(5, 150, 113),
    ]),
  );
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 20, droppedMs: 8 });
  assert.equal(clock.diagnostics.sequenceGaps, 1);
  assert.equal(clock.diagnostics.staleContexts, 1);
});

test("server clock ambiguous sequence barrier uses all delivery times independently of file order", async (t) => {
  const directory = await fixture(t),
    a = join(directory, "a.jsonl"),
    b = join(directory, "b.jsonl");
  await writeFile(
    a,
    row(0, [
      clockRecord(0, 100, 10),
      clockRecord(1, 110, 15),
      clockRecord(2, 120, 20),
      clockRecord(3, 130, 100, 3000),
      clockRecord(4, 140, 110),
      clockRecord(5, 150, 113),
    ]),
  );
  await writeFile(b, row(1, [record(2, "game-start", {}, 3500)]));
  const forward = (await summarizeDiagnosticFiles([a, b])).serverClock;
  assert.deepEqual(
    forward,
    (await summarizeDiagnosticFiles([b, a])).serverClock,
  );
  assert.deepEqual(forward.observed, { callbacks: 20, droppedMs: 8 });
  assert.equal(forward.diagnostics.staleContexts, 1);
});

test("server clock conflict groups block older unseen contexts without sliding the boundary on stale delivery", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(
    path,
    row(0, [
      clockRecord(0, 100, 10),
      clockRecord(1, 110, 20, 1000),
      clockRecord(2, 120, 30, 1000),
      clockRecord(3, 130, 100, 500),
      clockRecord(4, 140, 110, 2500),
      clockRecord(5, 150, 113, 3500),
    ]),
  );
  const clock = (await summarizeDiagnosticFiles([path])).serverClock;
  assert.deepEqual(clock.observed, { callbacks: 10, droppedMs: 3 });
  assert.equal(clock.diagnostics.conflictingContexts, 1);
  assert.equal(clock.diagnostics.staleContexts, 1);
});

test("formatter accepts a stored legacy report without serverClock and does not mutate it", async (t) => {
  const path = join(await fixture(t), id + ".jsonl");
  await writeFile(path, row(0, [record(0, "session-end", {})]));
  const legacy = await summarizeDiagnosticFiles([path]);
  delete legacy.serverClock;
  const before = JSON.stringify(legacy);
  assert.match(
    formatDiagnosticsReport({ sessions: [legacy], warnings: [] }),
    /Server clock: unavailable; observed increments unavailable callbacks/,
  );
  assert.equal(JSON.stringify(legacy), before);
});
