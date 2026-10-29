import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, unlink, writeFile } from "node:fs/promises";
// @ts-expect-error JavaScript CLI module has no separate declaration file.
import { summarizeDiagnosticFiles } from "../scripts/diagnostics-report.mjs";
import {
  SessionDiagnostics,
  type DiagnosticsEnvironment,
} from "../client/session-diagnostics";
import {
  MAX_DIAGNOSTICS_BATCH_BYTES,
  diagnosticsByteLength,
  sanitizeDiagnosticsData,
  sanitizeDiagnosticsText,
  validateDiagnosticsBatch,
  type DiagnosticsBatch,
} from "../shared/session-diagnostics";

const SESSION_ID = "0b8c490b-1740-4aba-8a1c-f36d0b28108a";

function fixture(hostname = "localhost") {
  let now = 100;
  let failures = 0;
  let callback: (() => void) | undefined;
  let cleared = false;
  const posts: DiagnosticsBatch[] = [];
  const bodies: string[] = [];
  const environment: DiagnosticsEnvironment = {
    hostname,
    now: () => now,
    wallNow: () => 1_700_000_000_000 + now,
    makeSessionId: () => SESSION_ID,
    setInterval: (next) => {
      callback = next;
      return 1;
    },
    clearInterval: () => {
      cleared = true;
    },
    fetch: (async (url, init) => {
      if (String(url).endsWith("/status"))
        return new Response(
          JSON.stringify({
            enabled: true,
            schemaVersion: 1,
            sourceId: "abc",
            source: { gitHead: "def", dirty: true },
          }),
        );
      const body = String(init?.body);
      bodies.push(body);
      const batch = JSON.parse(body) as DiagnosticsBatch;
      posts.push(batch);
      if (failures-- > 0) throw new Error("Network disconnected");
      return new Response(
        JSON.stringify({
          saved: true,
          sessionId: batch.sessionId,
          batchId: batch.batchId,
          savedAt: new Date(environment.wallNow()).toISOString(),
        }),
      );
    }) as typeof fetch,
  };
  const recorder = new SessionDiagnostics(environment);
  return {
    recorder,
    environment,
    posts,
    bodies,
    time: (next: number) => {
      now = next;
    },
    tick: () => callback?.(),
    fail: (count: number) => {
      failures = count;
    },
    cleared: () => cleared,
    records: () => posts.flatMap((batch) => batch.records),
  };
}

async function settle() {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

const frameContextBoundaries = [
  "session-end",
  "game-start",
  "game-dispose",
  "game-disposed",
  "game-end",
  "mode-change",
  "network-connecting",
  "network-connected",
  "network-disconnected",
  "network-left",
];

test("lifecycle boundaries separate serialized multiplayer and guest frames inside the context cache interval", async () => {
  for (const boundary of frameContextBoundaries) {
    const f = fixture();
    f.recorder.start();
    await settle();
    f.recorder.recordFrame(
      { frameMs: 16, cpuMs: 7, gpuMs: null, phases: { render: 5 } },
      () => ({
        mode: "multiplayer",
        network: { server: { clock: { callbacks: 17 } } },
      }),
    );
    f.time(150);
    f.recorder.event(boundary);
    f.time(180);
    let snapshots = 0;
    f.recorder.recordFrame(
      { frameMs: 80, cpuMs: 4, gpuMs: null, phases: { render: 3 } },
      () => {
        snapshots++;
        return { mode: "guest", network: null };
      },
    );
    f.recorder.event("game-dispose");
    await f.recorder.flush();
    assert.equal(snapshots, 1, boundary);
    const records = f.records();
    const windows = records.filter((record) => record.kind === "frame-window");
    assert.equal(windows.length, 2, boundary);
    assert.deepEqual(
      windows.map((record) => record.data.frameMs),
      [[16], [80]],
      boundary,
    );
    assert.equal(
      (windows[0].data.context as any).mode,
      "multiplayer",
      boundary,
    );
    assert.deepEqual(
      windows[1].data.context,
      { mode: "guest", network: null },
      boundary,
    );
    const boundaryIndex = records.findIndex(
      (record) => record.kind === boundary,
    );
    assert.ok(records.indexOf(windows[0]) < boundaryIndex, boundary);
    const hitch = records.find((record) => record.kind === "frame-hitch")!;
    assert.equal(hitch.data.previousFrame, null, boundary);
    assert.deepEqual(hitch.data.previousContext, {}, boundary);
    assert.equal(hitch.data.previousContextAgeMs, null, boundary);
    assert.deepEqual(
      hitch.data.context,
      { mode: "guest", network: null },
      boundary,
    );
    for (const body of f.bodies)
      assert.ok(validateDiagnosticsBatch(JSON.parse(body)), boundary);
    f.recorder.dispose();
    await settle();
  }
});

test("a rate-limited lifecycle boundary still invalidates context and separates serialized evidence", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  f.time(2000);
  f.recorder.recordFrame(
    { frameMs: 16, cpuMs: 3, gpuMs: null, phases: {} },
    () => ({
      mode: "multiplayer",
      network: { server: { clock: { callbacks: 100 } } },
    }),
  );
  for (let index = 0; index < 100; index++)
    f.recorder.event("storm", { index });
  f.time(2050);
  f.recorder.event("network-disconnected");
  f.time(2080);
  f.recorder.recordFrame(
    { frameMs: 16, cpuMs: 3, gpuMs: null, phases: {} },
    () => ({ mode: "guest", network: null }),
  );
  f.recorder.resetFrameContext();
  await f.recorder.flush();
  const records = f.records();
  const windows = records.filter((record) => record.kind === "frame-window");
  assert.equal(windows.length, 2);
  assert.deepEqual(windows[1].data.context, { mode: "guest", network: null });
  assert.equal(
    records.some((record) => record.kind === "network-disconnected"),
    false,
  );
  assert.ok(
    windows[1].seq > windows[0].seq + 1,
    "omitted boundary leaves a sequence barrier before new frames",
  );
  assert.equal(f.recorder.status().droppedByReason.eventRate, 1);
  for (const body of f.bodies)
    assert.ok(validateDiagnosticsBatch(JSON.parse(body)));
  f.recorder.dispose();
  await settle();
});

test("the offline report cannot bridge room counters when their lifecycle marker hits the event cap", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  const frame = { frameMs: 16, cpuMs: 3, gpuMs: null, phases: {} };
  const context = (callbacks: number) => ({
    mode: "multiplayer",
    network: { server: { clock: { callbacks, droppedTotalMs: 0 } } },
  });
  f.time(2000);
  f.recorder.recordFrame(frame, () => context(100));
  for (let index = 0; index < 100; index++)
    f.recorder.event("storm", { index });
  f.time(2050);
  f.recorder.event("network-connected");
  f.time(2080);
  f.recorder.recordFrame(frame, () => context(900));
  f.recorder.resetFrameContext();
  await f.recorder.flush();
  const directory = new URL(
    "../.cache/recorder-context-feature/",
    import.meta.url,
  );
  const path = new URL(`room-counters-${process.pid}.jsonl`, directory);
  await mkdir(directory, { recursive: true });
  try {
    await writeFile(
      path,
      f.bodies
        .map((body) =>
          JSON.stringify({
            ...JSON.parse(body),
            type: "batch",
            digest: body,
            receivedAtUTC: "2026-10-14T21:00:00.000Z",
            source: { contentSha256: "a".repeat(64) },
          }),
        )
        .join("\n") + "\n",
    );
    const result = await summarizeDiagnosticFiles([path]);
    assert.equal(result.serverClock.samples, 2);
    assert.equal(result.serverClock.comparableIntervals, 0);
    assert.equal(result.serverClock.observed.callbacks, null);
    assert.equal(result.serverClock.diagnostics.sequenceGaps, 1);
    assert.equal(result.serverClock.segments.length, 2);
  } finally {
    await unlink(path);
    f.recorder.dispose();
    await settle();
  }
});

test("explicit repeated context reset preserves the historical window only once and clears preceding work", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  f.recorder.recordFrame(
    { frameMs: 16, cpuMs: 7, gpuMs: 2, phases: { render: 5 } },
    () => ({ mode: "multiplayer", network: { authorityTick: 123 } }),
  );
  f.time(140);
  f.recorder.resetFrameContext();
  f.recorder.resetFrameContext();
  f.time(180);
  f.recorder.recordFrame(
    { frameMs: 80, cpuMs: 2, gpuMs: null, phases: {} },
    () => ({ mode: "guest", network: null }),
  );
  f.recorder.resetFrameContext();
  f.recorder.resetFrameContext();
  await f.recorder.flush();
  const windows = f
    .records()
    .filter((record) => record.kind === "frame-window");
  assert.equal(windows.length, 2);
  assert.deepEqual(
    windows.map((record) => record.data.frameMs),
    [[16], [80]],
  );
  const hitch = f.records().find((record) => record.kind === "frame-hitch")!;
  assert.equal(hitch.data.previousFrame, null);
  assert.deepEqual(hitch.data.previousContext, {});
  assert.deepEqual(hitch.data.context, { mode: "guest", network: null });
  f.recorder.dispose();
  await settle();
});

test("a failing context factory cannot preserve stale data across reset or a later sample", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  const frame = { frameMs: 50, cpuMs: 3, gpuMs: null, phases: {} };
  f.recorder.recordFrame(frame, () => ({
    mode: "multiplayer",
    network: { authorityTick: 123 },
  }));
  f.time(150);
  f.recorder.event("mode-change", { mode: "guest" });
  f.time(180);
  const brokenContext = () => {
    throw new Error("Context unavailable");
  };
  f.recorder.recordFrame(frame, brokenContext);
  f.recorder.resetFrameContext();
  f.time(200);
  f.recorder.recordFrame(frame, () => ({ mode: "guest", network: null }));
  f.time(500);
  f.recorder.recordFrame(frame, brokenContext);
  await f.recorder.flush();
  const hitches = f.records().filter((record) => record.kind === "frame-hitch");
  assert.deepEqual(hitches[1].data.previousContext, {});
  assert.equal(hitches[1].data.previousFrame, null);
  assert.deepEqual(hitches[1].data.context, {});
  assert.deepEqual(hitches.at(-1)!.data.context, {});
  assert.equal(
    f.records().filter((record) => record.kind === "context-error").length,
    2,
  );
  f.recorder.dispose();
  await settle();
});

test("context resets preserve global rate budgets and disabled recorders emit nothing", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  f.time(2000);
  for (let index = 0; index < 12; index++) {
    f.recorder.resetFrameContext();
    f.recorder.recordFrame(
      { frameMs: 50, cpuMs: 3, gpuMs: null, phases: {} },
      () => ({ mode: "guest", network: null }),
    );
  }
  f.recorder.resetFrameContext();
  await f.recorder.flush();
  assert.equal(
    f.records().filter((record) => record.kind === "frame-hitch").length,
    4,
  );
  assert.equal(
    f.records().filter((record) => record.kind === "frame-window").length,
    12,
  );
  f.recorder.dispose();
  await settle();

  const disabled = fixture("example.com");
  disabled.recorder.resetFrameContext();
  disabled.recorder.start();
  disabled.recorder.event("mode-change");
  disabled.recorder.resetFrameContext();
  disabled.recorder.recordFrame(
    { frameMs: 50, cpuMs: 3, gpuMs: null, phases: {} },
    () => {
      throw new Error("Disabled recorder must not sample");
    },
  );
  await disabled.recorder.flush();
  assert.equal(disabled.posts.length, 0);
  assert.equal(disabled.recorder.status().pending, 0);
});

test("automatic local startup proves persisted receipt and source identity without a manual action", async () => {
  const f = fixture();
  f.recorder.start();
  f.recorder.start();
  assert.equal(f.recorder.isRecording, true);
  await settle();
  assert.equal(f.posts.length, 1);
  assert.equal(f.recorder.status().state, "recording");
  assert.equal(f.recorder.status().sourceId, "abc");
  assert.ok(f.recorder.status().lastSavedAt);
  assert.equal(
    f.records().filter((record) => record.kind === "session-start").length,
    1,
  );
  assert.equal(
    f.records().filter((record) => record.kind === "source-identity").length,
    1,
  );
  assert.match(
    String(f.records().find((record) => record.kind === "session-start")!.data.gpuTiming),
    /newly available asynchronous query; may describe an earlier frame/,
  );
  f.recorder.dispose();
  await settle();
  assert.equal(f.recorder.status().state, "stopped");
  assert.equal(f.cleared(), true);
});

test("render profile fields retain preceding work and aggregate nested phases without inventing GPU time", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  const profile = {
    cpuMs: {
      activeMeshes: 2,
      mainDraw: 4,
      renderTargets: 1,
      shaderCreation: 3,
    },
    counters: {
      shaderProgramStarts: 1,
      shaderPrograms: 1,
      shaderIntervalsDropped: 0,
      materialEffectEvents: 2,
      materialEffectChanges: 1,
      materialDetailsOmitted: 0,
      renderTargetIntervals: 1,
      renderTargetDetailsOmitted: 0,
    },
    details: {
      slowRenderTargets: [{ name: "shadow", renderPassId: 1, cpuMs: 1 }],
      materials: [],
    },
    cumulative: {
      shaderProgramStarts: 1,
      shaderPrograms: 1,
      shaderIntervalsDropped: 0,
      materialEffectEvents: 2,
      materialEffectChanges: 1,
      materialDetailsOmitted: 0,
      renderTargetIntervals: 1,
      renderTargetDetailsOmitted: 0,
      shaderCreationMs: 3,
      trackedMaterials: 4,
    },
  };
  f.time(100);
  f.recorder.recordFrame(
    {
      frameStartedAtMs: 90,
      frameMs: 16,
      cpuMs: 10,
      gpuMs: null,
      phases: { render: 8 },
      renderWork: profile,
    },
    () => ({}),
  );
  f.time(180);
  f.recorder.recordFrame(
    {
      frameStartedAtMs: 175,
      frameMs: 85,
      cpuMs: 5,
      gpuMs: null,
      phases: { render: 4 },
    },
    () => ({}),
  );
  f.time(2200);
  f.tick();
  await f.recorder.flush();
  const records = f.records();
  const hitch = records.find((record) => record.kind === "frame-hitch")!;
  const previous = hitch.data.previousFrame as any;
  assert.equal(previous.renderWork.cpuMs.shaderCreation, 3);
  assert.equal(previous.renderWork.details.slowRenderTargets[0].name, "shadow");
  const window = records.find((record) => record.kind === "frame-window")!;
  assert.deepEqual(window.data.enginePhaseTotals, profile.cpuMs);
  assert.equal((window.data.renderCounters as any).shaderPrograms, 1);
  assert.deepEqual(window.data.gpuMs, [null, null]);
  assert.equal(
    (window.data.phaseTotals as any).render,
    12,
    "inclusive shader phases are not added to parent render twice",
  );
  f.recorder.dispose();
});

test("public host never sends telemetry or starts a timer", async () => {
  const f = fixture("example.com");
  f.recorder.start();
  f.recorder.event("settings", { renderScale: 1 });
  await f.recorder.flush();
  assert.equal(f.recorder.status().state, "disabled");
  assert.equal(f.recorder.isRecording, false);
  assert.equal(f.posts.length, 0);
});

test("frame windows retain every interval at high refresh rates and immutable sampled settings", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  const context = {
    settings: { renderScale: 1 },
    position: { x: 10, y: 1, z: 20 },
  };
  let snapshots = 0;
  for (let index = 0; index < 240; index++) {
    f.time(100 + index * (1000 / 240));
    f.recorder.recordFrame(
      { frameMs: 1000 / 240, cpuMs: 2, gpuMs: null, phases: { render: 1 } },
      () => {
        snapshots++;
        return context;
      },
    );
  }
  context.settings.renderScale = 2;
  f.time(2100);
  f.tick();
  await f.recorder.flush();
  const windows = f
    .records()
    .filter((record) => record.kind === "frame-window");
  assert.equal(
    windows.flatMap((record) => record.data.frameMs as number[]).length,
    240,
  );
  assert.equal(
    windows.flatMap((record) => record.data.cpuMs as number[]).length,
    240,
  );
  assert.equal(
    windows.flatMap((record) => record.data.gpuMs as null[]).length,
    240,
  );
  assert.deepEqual(windows[0].data.context, {
    settings: { renderScale: 1 },
    position: { x: 10, y: 1, z: 20 },
  });
  assert.equal(snapshots, 1);
  assert.ok(validateDiagnosticsBatch(f.posts[1]));
  f.recorder.dispose();
});

test("a hitch attributes the preceding interval to previous work and bounds costly context sampling", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  let snapshots = 0;
  const context = () => ({ phase: ++snapshots });
  f.recorder.recordFrame(
    { frameMs: 16, cpuMs: 70, gpuMs: 30, phases: { vegetation: 60 } },
    context,
  );
  f.time(180);
  f.recorder.recordFrame(
    { frameMs: 80, cpuMs: 3, gpuMs: 4, phases: { vegetation: 1 } },
    context,
  );
  for (let index = 0; index < 15; index++) {
    f.time(230 + index * 50);
    f.recorder.recordFrame(
      { frameMs: 50, cpuMs: 2, gpuMs: null, phases: {} },
      context,
    );
  }
  await f.recorder.flush();
  const hitch = f.records().find((record) => record.kind === "frame-hitch")!;
  assert.equal(hitch.data.currentCpuMs, 3);
  assert.deepEqual(hitch.data.previousFrame, {
    frameMs: 16,
    cpuMs: 70,
    gpuMs: 30,
    phases: { vegetation: 60 },
  });
  assert.equal(snapshots, 4);
  assert.ok(
    f.records().filter((record) => record.kind === "frame-hitch").length <= 4,
  );
  f.recorder.dispose();
});

test("failed save retries exact batch bytes and IDs while new events remain queued", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  f.fail(1);
  f.recorder.event("settings", { quality: "high" });
  await f.recorder.flush();
  assert.equal(f.recorder.status().state, "retrying");
  assert.ok(f.recorder.status().pending > 0);
  f.recorder.event("settings", { quality: "low" });
  await f.recorder.flush();
  assert.equal(f.posts.length, 2, "manual calls also respect retry backoff");
  f.time(1100);
  await f.recorder.flush();
  assert.equal(f.bodies[1], f.bodies[2]);
  assert.equal(f.posts[3].batchId, f.posts[2].batchId + 1);
  assert.equal(f.recorder.status().pending, 0);
  f.recorder.dispose();
});

test("offline memory remains bounded and recording gaps are explicit after recovery", async () => {
  const f = fixture();
  f.fail(1);
  f.recorder.start();
  await settle();
  for (let index = 0; index < 1500; index++) {
    f.time(200 + index * 20);
    f.recorder.event("settings", { renderer: "a".repeat(1900), index });
  }
  assert.ok(f.recorder.status().pending <= 516);
  assert.ok(f.recorder.status().dropped > 900);
  for (let index = 0; index < 20 && f.recorder.status().pending; index++)
    await f.recorder.flush();
  assert.equal(f.recorder.status().pending, 0);
  assert.ok(f.records().some((record) => record.kind === "recording-gap"));
  for (const batch of f.posts) {
    assert.ok(diagnosticsByteLength(batch) <= MAX_DIAGNOSTICS_BATCH_BYTES);
    assert.ok(validateDiagnosticsBatch(batch));
  }
  f.recorder.dispose();
});

test("visibility changes close windows, classify resumed frames and remove listeners on dispose", async () => {
  const f = fixture();
  const documentTarget = new EventTarget() as EventTarget & {
    visibilityState: string;
    hasFocus: () => boolean;
  };
  documentTarget.visibilityState = "visible";
  documentTarget.hasFocus = () => true;
  f.environment.document = documentTarget as unknown as Document;
  f.recorder.start();
  await settle();
  f.recorder.recordFrame(
    { frameMs: 16, cpuMs: 3, gpuMs: null, phases: {} },
    () => ({ position: { x: 1 } }),
  );
  f.time(200);
  documentTarget.visibilityState = "hidden";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  await settle();
  const firstWindow = f
    .records()
    .find((record) => record.kind === "frame-window")!;
  assert.equal(firstWindow.data.visibility, "visible");
  f.time(10000);
  documentTarget.visibilityState = "visible";
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  f.recorder.recordFrame(
    { frameMs: 9800, cpuMs: 3, gpuMs: null, phases: {} },
    () => ({}),
  );
  await f.recorder.flush();
  const hitch = f.records().find((record) => record.kind === "frame-hitch")!;
  assert.equal(hitch.data.afterVisibilityChange, true);
  assert.equal(hitch.data.previousFrame, null);
  const resumed = f
    .records()
    .filter((record) => record.kind === "frame-window")
    .at(-1)!;
  assert.equal(resumed.data.visibility, "transition");
  assert.deepEqual(resumed.data.frameMs, [9800]);
  f.recorder.dispose();
  await settle();
  const pending = f.recorder.status().pending;
  documentTarget.dispatchEvent(new Event("visibilitychange"));
  assert.equal(f.recorder.status().pending, pending);
});

test("sanitization drops user content, getters, cycles, secrets and URL queries", () => {
  let reads = 0;
  const input: Record<string, unknown> = {
    position: { x: 10 },
    profile: { name: "Private" },
    chat: "private",
    token: "secret",
    payload: { x: 1 },
    email: "private@example.com",
    nickname: "private",
    playerNickname: "private",
    playerId: "private",
    userId: "private",
    accountId: "private",
    source:
      "https://user:password@localhost:5173/client/game.ts?token=abc#secret",
    message: "WebGL failed token=abc Bearer privatekey private@example.com",
    value: Infinity,
    get getter() {
      reads++;
      return "do not read";
    },
  };
  input.cycle = input;
  const output = sanitizeDiagnosticsData(input);
  assert.deepEqual(output.position, { x: 10 });
  assert.equal(output.profile, undefined);
  assert.equal(output.chat, undefined);
  assert.equal(output.payload, undefined);
  assert.equal(output.token, undefined);
  assert.equal(output.email, undefined);
  for (const key of [
    "nickname",
    "playerNickname",
    "playerId",
    "userId",
    "accountId",
  ])
    assert.equal(output[key], undefined);
  assert.equal(output.source, "https://localhost:5173/client/game.ts");
  assert.equal(
    output.message,
    "WebGL failed token=[redacted] Bearer [redacted] [email]",
  );
  assert.equal(output.value, null);
  assert.equal(reads, 0);
  assert.equal(output.cycle, undefined);
  assert.equal(
    sanitizeDiagnosticsText("/game.ts?auth=secret"),
    "/game.ts?[redacted]",
  );
});

test("wire validation rejects unsafe identifiers, out of order sequences and excessive size", () => {
  const good: DiagnosticsBatch = {
    schemaVersion: 1,
    sessionId: SESSION_ID,
    batchId: 0,
    records: [
      { seq: 0, atMs: 100, kind: "settings", data: { quality: "high" } },
    ],
  };
  assert.deepEqual(validateDiagnosticsBatch(good), good);
  assert.equal(
    validateDiagnosticsBatch({ ...good, sessionId: SESSION_ID.toUpperCase() })
      ?.sessionId,
    SESSION_ID,
  );
  assert.equal(
    validateDiagnosticsBatch({ ...good, sessionId: "../../escape" }),
    null,
  );
  assert.equal(
    validateDiagnosticsBatch({
      ...good,
      records: [...good.records, ...good.records],
    }),
    null,
  );
  assert.equal(
    validateDiagnosticsBatch({
      ...good,
      records: [{ ...good.records[0], data: { huge: "x".repeat(40000) } }],
    }),
    null,
  );
  assert.equal(validateDiagnosticsBatch({ ...good, batchId: -1 }), null);
});

test("hitch timestamps use rAF start even when current rendering finishes much later", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  f.time(900);
  f.recorder.recordFrame(
    {
      frameStartedAtMs: 300,
      frameMs: 100,
      cpuMs: 600,
      gpuMs: null,
      phases: {},
    },
    () => ({}),
  );
  await f.recorder.flush();
  const hitch = f.records().find((record) => record.kind === "frame-hitch")!;
  assert.equal(hitch.data.intervalStartMs, 200);
  assert.equal(hitch.data.intervalEndMs, 300);
  assert.equal(hitch.data.recordedAtMs, 900);
  f.recorder.dispose();
});

test("asset storms preserve gameplay and errors, summarize successes and clean up observers and console", async () => {
  const f = fixture();
  const target = new EventTarget() as EventTarget & {
    navigator: object;
    console: Console;
  };
  let originalCalls = 0;
  const originalError = () => {
    originalCalls++;
  };
  target.navigator = {};
  target.console = {
    warn: () => {},
    error: originalError,
  } as unknown as Console;
  f.environment.window = target as unknown as Window;
  let disconnects = 0;
  let resourceCallback: PerformanceObserverCallback | undefined;
  class Observer {
    static supportedEntryTypes = ["resource"];
    constructor(callback: PerformanceObserverCallback) {
      resourceCallback = callback;
    }
    observe() {}
    disconnect() {
      disconnects++;
    }
  }
  f.environment.observer = Observer as unknown as typeof PerformanceObserver;
  f.recorder.start();
  await settle();
  const entries = Array.from({ length: 400 }, (_, index) => ({
    name: `http://localhost/assets/asset-${index}.glb?token=secret`,
    initiatorType: "fetch",
    startTime: 10,
    duration: index < 300 ? 100 : 400,
    responseStatus: 200,
    transferSize: 1024,
    encodedBodySize: 1024,
    decodedBodySize: 1024,
  }));
  resourceCallback!(
    { getEntries: () => entries } as unknown as PerformanceObserverEntryList,
    {} as PerformanceObserver,
  );
  f.recorder.event("game-ready", { mode: "guest" });
  target.console.error(
    "Vegetation tree asset unavailable",
    new Error("WebGL texture failed token=secret"),
    { chat: "private" },
  );
  target.console.error("private chat text", { arbitrary: "private" });
  f.tick();
  await f.recorder.flush();
  assert.equal(f.recorder.status().dropped, 0);
  assert.equal(
    f.records().filter((record) => record.kind === "resource-timing").length,
    100,
  );
  assert.ok(f.records().some((record) => record.kind === "game-ready"));
  assert.ok(f.records().some((record) => record.kind === "console-error"));
  assert.equal(
    f.records().find((record) => record.kind === "resource-window")?.data.count,
    400,
  );
  assert.doesNotMatch(
    JSON.stringify(f.records()),
    /private chat text|token=secret|arbitrary/,
  );
  assert.equal(originalCalls, 2);
  f.recorder.dispose();
  await settle();
  assert.equal(disconnects, 1);
  assert.equal(target.console.error, originalError);
});

test("invalid save receipt never pretends the batch was persisted", async () => {
  const f = fixture();
  const transport = f.environment.fetch;
  f.environment.fetch = (async (url, init) =>
    String(url).endsWith("/status")
      ? transport(url, init)
      : new Response(
          JSON.stringify({
            saved: true,
            sessionId: "wrong",
            batchId: 0,
            savedAt: "now",
          }),
        )) as typeof fetch;
  f.recorder.start();
  await settle();
  assert.equal(f.recorder.status().state, "retrying");
  assert.equal(f.recorder.status().lastSavedAt, null);
  assert.ok(f.recorder.status().pending > 0);
  f.recorder.dispose();
});

test("healthy automatic transport drains sustained production-sized hitches and preserves every sequence and lifecycle event", async (t) => {
  const f = fixture();
  const target = new EventTarget() as EventTarget & { navigator: object };
  target.navigator = {};
  f.environment.window = target as unknown as Window;
  let concurrent = 0,
    maxConcurrent = 0;
  const requestTimes: number[] = [];
  const transport = f.environment.fetch;
  f.environment.fetch = (async (url, init) => {
    if (!init?.body) return transport(url, init);
    const now = f.environment.now();
    requestTimes.push(now);
    assert.ok(
      requestTimes.filter((at) => now - at < 60000).length <= 120,
      "collector's rolling POST rate limit is respected",
    );
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    const body = String(init.body);
    assert.ok(Buffer.byteLength(body) <= 60 * 1024);
    assert.ok(
      validateDiagnosticsBatch(JSON.parse(body)),
      "actual serialized HTTP body passes server wire limits",
    );
    // An asynchronous network task, rather than an immediately resolved fetch.
    await settle();
    const result = await transport(url, init);
    concurrent--;
    return result;
  }) as typeof fetch;
  f.recorder.start();
  await f.recorder.flush();
  const context = {
    render: {
      materialNames: Array.from(
        { length: 8 },
        (_, index) => `material-${index}-` + "building-detail-".repeat(69),
      ),
    },
  };
  let maxPendingBytes = 0;
  for (let index = 0; index < 3600; index++) {
    const now = 200 + index * 50;
    f.time(now);
    f.recorder.recordFrame(
      {
        frameStartedAtMs: now,
        frameMs: 50,
        cpuMs: 30,
        gpuMs: 15,
        phases: { render: 26, vegetation: 3 },
      },
      () => context,
    );
    if (index % 200 === 0)
      f.recorder.event("action", {
        action: "toggle-light",
        enabled: index % 400 === 0,
      });
    if (index % 20 === 0) f.tick();
    maxPendingBytes = Math.max(
      maxPendingBytes,
      f.recorder.status().pendingBytes,
    );
    await settle();
  }
  f.time(181200);
  f.recorder.event("action", { action: "exit-car" });
  target.dispatchEvent(new Event("pagehide"));
  await f.recorder.flush();
  const records = f.records();
  const hitchSizes = records
    .filter((r) => r.kind === "frame-hitch")
    .slice(1)
    .map(diagnosticsByteLength);
  const windowSizes = records
    .filter((r) => r.kind === "frame-window")
    .map(diagnosticsByteLength);
  t.diagnostic(
    JSON.stringify({
      status: f.recorder.status(),
      posts: f.posts.length,
      bytes: f.bodies.reduce((sum, body) => sum + Buffer.byteLength(body), 0),
      records: records.length,
      hitchCount: hitchSizes.length,
      maxPendingBytes,
    }),
  );
  assert.ok(
    Math.min(...hitchSizes) > 17000 && Math.max(...hitchSizes) < 20000,
    `matches measured wave2 hitch payloads up to19,176 B: ${Math.min(...hitchSizes)}–${Math.max(...hitchSizes)}`,
  );
  assert.ok(
    Math.min(...windowSizes) > 8500 && Math.max(...windowSizes) < 10000,
    `matches measured wave2 window payloads up to9,513 B: ${Math.min(...windowSizes)}–${Math.max(...windowSizes)}`,
  );
  assert.ok(
    f.bodies.reduce((sum, body) => sum + Buffer.byteLength(body), 0) >
      12 * 1024 * 1024,
  );
  assert.deepEqual(
    records.map((r) => r.seq),
    Array.from({ length: records.length }, (_, i) => i),
  );
  assert.equal(records.filter((r) => r.kind === "action").length, 19);
  assert.equal(
    records
      .filter((r) => r.kind === "frame-window")
      .reduce(
        (sum, record) => sum + (record.data.frameMs as number[]).length,
        0,
      ),
    3600,
    "every measured frame survives transport",
  );
  assert.equal(records.at(-1)?.kind, "session-end");
  assert.equal(f.recorder.status().dropped, 0);
  assert.equal(f.recorder.status().pending, 0);
  assert.equal(maxConcurrent, 1);
  assert.ok(maxPendingBytes < 1024 * 1024);
  f.recorder.dispose();
  await settle();
});

test("offline pressure is bounded, reason-specific and cannot bypass exponential retry with events", async () => {
  const f = fixture();
  f.fail(100);
  f.recorder.start();
  await settle();
  for (let index = 0; index < 3000; index++) {
    f.time(200 + index * 20);
    f.recorder.event("settings", { renderer: "a".repeat(1900), index });
    if (index % 50 === 0) {
      f.tick();
      await settle();
    }
  }
  const status = f.recorder.status();
  assert.ok(status.pendingBytes < 1024 * 1024 + 60 * 1024);
  assert.ok(status.droppedByReason.queueCapacity > 2000);
  assert.equal(status.droppedByReason.recordSize, 0);
  assert.equal(status.droppedByReason.eventRate, 0);
  assert.ok(
    f.posts.length <= 7,
    "failure backoff controls automatic size triggers too",
  );
  f.fail(0);
  f.time(100000);
  await f.recorder.flush();
  assert.equal(f.recorder.status().pending, 0);
  const gap = f
    .records()
    .filter((r) => r.kind === "recording-gap")
    .at(-1)!;
  assert.deepEqual(
    gap.data.droppedByReason,
    f.recorder.status().droppedByReason,
  );
  assert.equal(gap.data.droppedTotal, f.recorder.status().dropped);
  f.recorder.dispose();
  await settle();
});

test("record-size and event-rate omissions have distinct cumulative diagnostics", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  f.time(2000);
  f.recorder.event("oversized", { entries: Array(32).fill("a".repeat(2000)) });
  for (let i = 0; i < 120; i++) f.recorder.event("storm", {});
  await f.recorder.flush();
  assert.deepEqual(f.recorder.status().droppedByReason, {
    queueCapacity: 0,
    recordSize: 1,
    eventRate: 21,
  });
  const gap = f.records().find((r) => r.kind === "recording-gap")!;
  assert.deepEqual(
    gap.data.droppedByReason,
    f.recorder.status().droppedByReason,
  );
  f.recorder.dispose();
  await settle();
});

test("pagehide replaces a pending ordinary POST with the same keepalive batch and a bounded tail", async () => {
  const f = fixture();
  const target = new EventTarget() as EventTarget & { navigator: object };
  target.navigator = {};
  f.environment.window = target as unknown as Window;
  f.recorder.start();
  await settle();
  const transport = f.environment.fetch;
  let blockedBody = "",
    aborted = false;
  const tailBodies: string[] = [];
  f.environment.fetch = (async (url, init) => {
    if (init?.keepalive) {
      tailBodies.push(String(init.body));
      return transport(url, init);
    }
    blockedBody = String(init?.body);
    await new Promise((_, reject) =>
      init?.signal?.addEventListener(
        "abort",
        () => {
          aborted = true;
          reject(new Error("cancelled transport"));
        },
        { once: true },
      ),
    );
    throw new Error("unreachable");
  }) as typeof fetch;
  f.recorder.event("action", { action: "exit-car" });
  const ordinary = f.recorder.flush();
  target.dispatchEvent(new Event("pagehide"));
  await f.recorder.flush();
  await ordinary;
  assert.equal(aborted, true);
  assert.equal(tailBodies[0], blockedBody);
  assert.ok(
    tailBodies.reduce((sum, body) => sum + Buffer.byteLength(body), 0) <=
      60 * 1024,
  );
  assert.deepEqual(
    f.records().map((r) => r.seq),
    Array.from({ length: f.records().length }, (_, i) => i),
  );
  assert.equal(f.records().at(-1)?.kind, "session-end");
  assert.equal(f.recorder.status().pending, 0);
  assert.equal(f.recorder.status().error, null);
  f.recorder.dispose();
  await settle();
});

test("dispose during capability discovery finishes its tail without retaining timers or observers", async () => {
  const f = fixture();
  const transport = f.environment.fetch;
  let complete!: () => void;
  f.environment.fetch = (async (url, init) => {
    if (String(url).endsWith("/status"))
      await new Promise<void>((resolve) => {
        complete = resolve;
      });
    else assert.equal(init?.keepalive, true);
    return transport(url, init);
  }) as typeof fetch;
  f.recorder.start();
  f.recorder.dispose();
  assert.equal(f.cleared(), true);
  complete();
  await f.recorder.flush();
  assert.equal(f.recorder.status().state, "stopped");
  assert.equal(f.recorder.status().pending, 0);
  assert.equal(f.records().filter((r) => r.kind === "session-end").length, 1);
});

test("lifecycle budget retains an oversized offline tail for recovery and does not claim it was saved", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  f.fail(10);
  for (let i = 0; i < 20; i++) {
    f.time(200 + i * 100);
    f.recorder.event("large-detail", {
      nodes: Array(8).fill("mesh".repeat(500)),
    });
  }
  await settle();
  f.fail(0);
  const before = f.bodies.length;
  await f.recorder.flush(true);
  const sent = f.bodies
    .slice(before)
    .reduce((sum, body) => sum + Buffer.byteLength(body), 0);
  assert.ok(sent > 0 && sent <= 60 * 1024);
  assert.ok(f.recorder.status().pending > 0);
  assert.match(f.recorder.status().error!, /unsaved tail/);
  assert.equal(f.recorder.status().state, "retrying");
  f.time(10000);
  await f.recorder.flush();
  assert.equal(f.recorder.status().pending, 0);
  assert.equal(f.recorder.status().error, null);
  f.recorder.dispose();
  await settle();
});

test("a late receipt from a replaced ordinary request cannot overwrite the acknowledged lifecycle drain", async () => {
  const f = fixture();
  f.recorder.start();
  await settle();
  const transport = f.environment.fetch;
  let release!: () => void;
  f.environment.fetch = (async (url, init) => {
    if (!init?.keepalive)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    return transport(url, init);
  }) as typeof fetch;
  f.recorder.event("action", { action: "exit-car" });
  const ordinary = f.recorder.flush();
  f.recorder.dispose();
  await f.recorder.flush();
  const acknowledged = f.recorder.status();
  assert.equal(acknowledged.pending, 0);
  assert.equal(acknowledged.state, "stopped");
  release();
  await ordinary;
  assert.deepEqual(f.recorder.status(), acknowledged);
  assert.equal(f.cleared(), true);
});
