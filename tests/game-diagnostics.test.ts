import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { resolve, relative, join } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import ts from "typescript";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import {
  SessionDiagnostics,
  type DiagnosticsEnvironment,
} from "../client/session-diagnostics";
import { NetworkTimeline } from "../client/network-timeline";
import { writeQuaternion, writeVector3 } from "../client/transform-updates";
import {
  snapshotTransportDiagnostics,
  snapshotTimelineDiagnostics,
  snapshotAcceptedAuthorityDiagnostics,
} from "../client/game-diagnostics";
import {
  validateDiagnosticsBatch,
  type DiagnosticsBatch,
} from "../shared/session-diagnostics";
import { createSessionDiagnosticsHandler } from "../server/session-diagnostics";
// @ts-expect-error Plain Node CLI has no declaration file.
import { summarizeDiagnosticFiles } from "../scripts/diagnostics-report.mjs";

// Execute the complete production frame method; replace only scene/IO dependencies.
// No copied producer implementation or actual browser/GPU is involved.
const source = ts.createSourceFile(
  "game.ts",
  readFileSync(new URL("../client/game.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === "Game",
)!;
const members = declaration.members.filter(
  (node) =>
    node.name &&
    [
      "frame",
      "diagnosticContext",
      "diagnosticNetworkContext",
      "resetDiagnosticContext",
      "dispose",
    ].includes(node.name.getText(source)),
);
assert.ok(members.some((node) => node.name?.getText(source) === "frame"));
const compiled = ts.transpileModule(
  `class FrameGame { ${members.map((node) => node.getText(source)).join("\n")} };`,
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
    transformers: {
      before: [
        (context) => (input) => {
          const visit: ts.Visitor = (node) =>
            ts.isMetaProperty(node) &&
            node.keywordToken === ts.SyntaxKind.ImportKeyword
              ? ts.factory.createIdentifier("testImportMeta")
              : ts.visitEachChild(node, visit, context);
          return ts.visitNode(input, visit) as ts.SourceFile;
        },
      ],
    },
  },
).outputText;
// Same-realm object literals exercise the real sanitizer's plain-object policy.
const script = new Script(`(function(environment) {
  const { exports, Vector3, Quaternion, writeQuaternion, writeVector3, performance, document, window,
    testImportMeta, sessionDiagnostics, vehicleCameraCanFollow, zoneAt, applyArtLighting, snapshotTransportDiagnostics, snapshotTimelineDiagnostics } = environment;
  ${compiled}
  return FrameGame;
})`);

function fixture(hostname = "localhost") {
  let clock = 100,
    renders = 0,
    contexts = 0;
  let tick: (() => void) | undefined;
  const posts: DiagnosticsBatch[] = [];
  const environment: DiagnosticsEnvironment = {
    hostname,
    now: () => clock,
    wallNow: () => 1_800_000_000_000 + clock,
    makeSessionId: () => "17971b5b-1df5-4d23-942f-dd560d8b4952",
    setInterval: (callback) => {
      tick = callback;
      return 1;
    },
    clearInterval() {},
    fetch: (async (url, init) => {
      if (String(url).endsWith("/status"))
        return new Response(
          JSON.stringify({
            enabled: true,
            schemaVersion: 1,
            sourceId: "fixture",
          }),
        );
      const batch = JSON.parse(String(init?.body)) as DiagnosticsBatch;
      posts.push(batch);
      return new Response(
        JSON.stringify({
          saved: true,
          sessionId: batch.sessionId,
          batchId: batch.batchId,
          savedAt: new Date().toISOString(),
        }),
      );
    }) as typeof fetch,
  };
  const recorder = new SessionDiagnostics(environment);
  const FrameGame = script.runInThisContext()({
    exports: {},
    Vector3,
    Quaternion,
    writeQuaternion,
    writeVector3,
    snapshotTransportDiagnostics,
    snapshotTimelineDiagnostics,
    performance: { now: () => clock++ },
    document: { hidden: false, removeEventListener() {} },
    window: { devicePixelRatio: 1, removeEventListener() {} },
    testImportMeta: { env: { DEV: false } },
    sessionDiagnostics: recorder,
    vehicleCameraCanFollow: () => false,
    zoneAt: () => "outside",
    applyArtLighting: () => ({ night: 0, keySource: "sun" }),
  });
  const counter = { count: 1, current: 2_000_000 };
  const car = () => ({
    position: Vector3.Zero(),
    rotation: Vector3.Zero(),
    rotationQuaternion: Quaternion.Identity(),
    setEnabled() {},
    isEnabled: () => false,
  });
  const game = Object.assign(new FrameGame(), {
    ready: true,
    disposed: false,
    network: false,
    localId: "private-local-id",
    localPlayer: {},
    actor: { position: { x: 0, y: 1, z: 2 }, speed: 0, yaw: 0, vehicle: false },
    engine: {
      getDeltaTime: () => 16,
      getRenderWidth: () => 800,
      getRenderHeight: () => 600,
      stopRenderLoop() {},
      dispose() {},
    },
    engineInstrumentation: {
      captureGPUFrameTime: true,
      gpuFrameTimeCounter: counter,
      dispose() {},
    },
    adaptive: {
      state: {
        mode: "manual",
        quality: "medium",
        targetFps: 60,
        hardwareScaling: 1,
      },
      update: () => ({}),
    },
    quality: "medium",
    applyAdaptiveQuality() {},
    stableLights: { update() {}, dispose() {} },
    advanceSimulation() {},
    visualOffset: Vector3.Zero(),
    interpolateLocalPosition: () => new Vector3(0, 1, 2),
    avatars: new Map(),
    car: car(),
    parkedCar: car(),
    carSnapshots: [],
    sim: {
      dispose() {},
      car: {
        capture: () => ({
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        }),
      },
    },
    contactShadows: { set() {}, dispose() {} },
    updateCameraFollow() {},
    camera: { position: Vector3.Zero(), minZ: 0.1 },
    localAvatarPresentation: {
      update: () => ({ visible: true, resetAnimation: false }),
    },
    huntMeshes: [],
    skyWeather: {
      update: () => ({ sun: { daylight: 1 }, moon: {}, wind: { x: 0, z: 0 } }),
      dispose() {},
    },
    scene: {
      render: () => {
        renders++;
        clock += 4;
      },
      dispose() {},
    },
    labels: { render() {}, dispose() {} },
    frames: [],
    canvas: {
      dataset: { networkStage: "offline" },
      clientWidth: 800,
      clientHeight: 600,
      removeEventListener() {},
    },
    enabledMeshCandidates: { dispose() {} },
    instrumentation: { dispose() {} },
    avatarPool: { dispose() {} },
    lastStats: Infinity,
    lastGpuCounterCount: 0,
    lastGpuCounterAt: -Infinity,
    networkTimeline: new NetworkTimeline(),
    prediction: { inputs: [] },
    lastAuthorityNetwork: null,
    lastAuthorityAtMs: null,
    lastAuthorityTick: -1,
    diagnosticNetwork: {
      motionPackets: 0,
      authorityPackets: 0,
      corrections: 0,
      resyncs: 0,
      lastCorrectionMetres: null,
      lastMotionAtMs: 0,
    },
  });
  if (game.diagnosticContext) {
    const realContext = game.diagnosticContext;
    game.diagnosticContext = () => {
      contexts++;
      return realContext();
    };
  }
  return {
    game,
    recorder,
    posts,
    counter,
    environment,
    tick: () => tick?.(),
    time: (now: number) => {
      clock = now;
    },
    renders: () => renders,
    contexts: () => contexts,
    records: () => posts.flatMap((batch) => batch.records),
  };
}

test("actual production Game.frame automatically records intervals, six phases and only fresh GPU samples", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.dispose());
  f.recorder.start();
  await f.recorder.flush();
  f.game.frame();
  f.game.frame();
  f.counter.count++;
  f.counter.current = 3_000_000;
  f.game.frame();
  f.time(1200);
  f.tick();
  await f.recorder.flush();
  assert.equal(f.renders(), 3);
  const windows = f
    .records()
    .filter((record) => record.kind === "frame-window");
  assert.equal(
    windows.length,
    1,
    "real Game must feed the automatic recorder without a benchmark",
  );
  assert.deepEqual(windows[0].data.frameMs, [16, 16, 16]);
  assert.deepEqual(windows[0].data.gpuMs, [2, null, 3]);
  assert.deepEqual(
    Object.keys(windows[0].data.phaseTotals as object).sort(),
    [
      "simulation",
      "world",
      "avatarsAndCamera",
      "environment",
      "render",
      "labels",
    ].sort(),
  );
  assert.equal(
    Object.values(windows[0].data.phaseTotals as Record<string, number>).reduce(
      (a, b) => a + b,
      0,
    ),
    (windows[0].data.cpuMs as number[]).reduce((a, b) => a + b, 0),
  );
  assert.equal(
    f.contexts(),
    1,
    "context computation remains sampled rather than per-frame",
  );
});

test("actual frame context isolates guest and dispose invalidates once without further rendering", async (t) => {
  const f = fixture();
  t.after(() => f.recorder.dispose());
  f.recorder.start();
  await f.recorder.flush();
  let transports = 0;
  f.game.onNetworkDiagnostics = () => {
    transports++;
    return { sender: { queued: 99 } };
  };
  f.game.frame();
  assert.equal(
    transports,
    0,
    "guest must not invoke multiplayer transport at all",
  );
  f.game.network = true;
  f.game.resetDiagnosticContext();
  f.game.frame();
  assert.equal(transports, 1);
  f.game.dispose();
  f.game.dispose();
  f.game.frame();
  await f.recorder.flush();
  assert.equal(f.renders(), 2);
  assert.equal(
    f.records().filter((record) => record.kind === "game-dispose").length,
    1,
  );
  assert.equal(f.game.diagnosticNetworkContext(), null);
  assert.equal(f.game.lastAuthorityNetwork, null);
});

test("real Game frames survive recorder, validator, local collector and report with bounded own telemetry", async (t) => {
  const base = resolve(".cache/game-frame-feature");
  await mkdir(base, { recursive: true });
  const directory = await mkdtemp(join(base, "collector-"));
  t.after(async () => {
    assert.ok(
      relative(base, directory).startsWith("collector-") &&
        !relative(base, directory).includes(".."),
    );
    await rm(directory, { recursive: true, force: true });
  });
  const f = fixture();
  t.after(() => f.recorder.dispose());
  const handler = createSessionDiagnosticsHandler({
    directory,
    listenHost: "127.0.0.1",
    now: () => f.environment.now(),
    source: async () => ({
      kind: "working-tree",
      gitHead: "f".repeat(40),
      contentSha256: "b".repeat(64),
      dirty: true,
      buildSnapshotId: null,
      capturedAtUTC: "2026-10-14T20:00:00Z",
      scope: "deterministic in-process test",
      files: 1,
    }),
  });
  const batches: DiagnosticsBatch[] = [];
  f.environment.fetch = (async (url, init) => {
    const body = init?.body ? String(init.body) : "";
    if (body) {
      const batch = validateDiagnosticsBatch(JSON.parse(body));
      assert.ok(
        batch,
        "real recorder batch must meet the server wire contract",
      );
      batches.push(batch);
    }
    const request = Readable.from(
      body ? [Buffer.from(body)] : [],
    ) as IncomingMessage;
    Object.assign(request, {
      method: init?.method ?? "GET",
      url: String(url),
      headers: {
        host: "127.0.0.1:2567",
        origin: "http://127.0.0.1:2567",
        referer: "http://127.0.0.1:2567/",
        "content-type": "application/json",
      },
      socket: { localAddress: "127.0.0.1", remoteAddress: "127.0.0.1" },
    });
    let status = 0,
      content = "";
    const response = {
      setHeader() {},
      writeHead(code: number) {
        status = code;
        return this;
      },
      end(value: string) {
        content = value;
      },
    } as unknown as ServerResponse;
    assert.equal(await handler(request, response), true);
    assert.ok(
      status >= 200 && status < 300,
      `collector returned ${status}: ${content}`,
    );
    return new Response(content, { status });
  }) as typeof fetch;
  f.game.network = true;
  f.game.canvas.dataset.networkStage = "connected";
  f.game.onNetworkDiagnostics = () => ({
    sender: { queued: 3, token: "transport-private" },
    profile: "private-profile",
  });
  f.recorder.start();
  await f.recorder.flush();
  for (const [index, callbacks, droppedTotalMs] of [
    [0, 100, 4000],
    [1, 160, 4283.33],
    [2, 220, 4283.33],
  ]) {
    f.time(100 + index * 1100);
    f.game.lastAuthorityNetwork = snapshotAcceptedAuthorityDiagnostics({
      network: {
        clock: {
          callbacks,
          droppedTotalMs,
          elapsedMs: 16,
          cpuMs: 2,
          elapsedMaxMs: 1109,
          cpuMaxMs: 1108,
          token: "server-private",
        },
        queue: {
          resolution: "scheduled-tick",
          ack: index,
          depth: 2,
          rejected: { late: 1 },
          players: ["private-peer"],
        },
      },
    });
    f.game.frame();
  }
  f.time(3400);
  f.tick();
  await f.recorder.flush();
  const records = batches.flatMap((batch) => batch.records);
  const windows = records.filter((record) => record.kind === "frame-window");
  assert.equal(windows.length, 3);
  assert.equal(
    (windows[0].data.context as any).network.server.queue.rejected.late,
    1,
    "nested scalar survives both sanitizer passes",
  );
  assert.equal(
    (windows[0].data.context as any).network.transport.sender.queued,
    3,
  );
  const path = join(directory, f.environment.makeSessionId() + ".jsonl");
  const stored = await readFile(path, "utf8");
  for (const value of [
    "transport-private",
    "private-profile",
    "server-private",
    "private-peer",
    "private-local-id",
  ])
    assert.equal(stored.includes(value), false);
  const report = await summarizeDiagnosticFiles([path]);
  assert.equal(report.performance.frames, 3);
  assert.equal(report.serverClock.observed.callbacks, 120);
  assert.ok(Math.abs(report.serverClock.observed.droppedMs - 283.33) < 1e-6);
  assert.equal(f.recorder.status().dropped, 0);
});

test("disabled recorder performs no context work and not-ready/disposed Game produces no frames", async () => {
  const f = fixture("example.com");
  f.recorder.start();
  f.game.frame();
  assert.equal(f.renders(), 1);
  assert.equal(f.contexts(), 0);
  f.game.ready = false;
  f.game.frame();
  f.game.ready = true;
  f.game.disposed = true;
  f.game.frame();
  assert.equal(f.renders(), 1);
  assert.equal(f.posts.length, 0);
});
