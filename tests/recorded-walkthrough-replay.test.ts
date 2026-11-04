import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve, relative, isAbsolute } from "node:path";
import { zoneAt } from "../shared/world";
// @ts-expect-error Test-only JavaScript module.
import { createReplayEnvironment, createReplayBuildPlugin, parseReplayArguments, readReplaySourceManifest, saveVerifiedReplayReport } from "./replay/runner-config.mjs";
// @ts-expect-error Test-only JavaScript module.
import * as replay from "./replay/replay.mjs";
const {
  createReplayCursor,
  validateScenario,
  createRecordedWeatherPlayer,
  assertRenderedReplayState,
  cleanupReplayGame,
  settleReplayFrame,
  freezeReplayFixtures,
  requestedReplayBackend,
  assertReplayBackend,
  replayZoneCoverage,
} = replay;

test("replay server cannot inherit external providers, endpoints or production static content", () => {
  const original = {
    PATH: "tools", NODE_OPTIONS: "--enable-source-maps", HOST: "0.0.0.0", PORT: "80",
    STATIC_DIR: "/production", static_dir: "/other", VITE_MULTIPLAYER_URL: "https://external.invalid",
    OPENAI_API_KEY: "fixture", openai_base_url: "https://external.invalid",
    CRAZY_TYPKA_ENABLED: "true", RAG_DATABASE_URL: "postgresql://external.invalid",
    LINEAR_API_KEY: "fixture", FEEDBACK_DIR: "/production-reports", FEEDBACK_ENABLED: "true",
  };
  const before = { ...original }, directory = resolve(".cache/main-replay-consolidation-20261029/feedback");
  const isolated = createReplayEnvironment(original, directory);
  assert.deepEqual(original, before);
  assert.deepEqual(isolated, { PATH: "tools", NODE_OPTIONS: "--enable-source-maps", HOST: "127.0.0.1", PORT: "2568",
    FEEDBACK_DIR: directory, STRAHOV_TEST_URL: "http://127.0.0.1:2568" });
});

test("report save rechecks actual checkout sources and public assets, rejecting drift without a receipt", async (t) => {
  const base = resolve(import.meta.dirname, "../.cache/main-replay-consolidation-20261029");
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "report-fixture-"));
  t.after(async () => {
    const inside = relative(base, root);
    assert.ok(inside && !inside.startsWith("..") && !isAbsolute(inside));
    await rm(root, { recursive: true, force: true });
  });
  const git = (...args: string[]) => execFileSync("git", ["-c", "core.hooksPath=NUL", "-c", "commit.gpgsign=false",
    "-c", "core.autocrlf=false", "-c", "user.name=Replay fixture", "-c", "user.email=replay@example.invalid", ...args],
    { cwd: root, encoding: "utf8", windowsHide: true });
  await mkdir(resolve(root, "public"));
  await mkdir(resolve(root, "client"));
  const asset = resolve(root, "public/fixture.txt"), source = resolve(root, "client/fixture.ts");
  await writeFile(asset, "original public bytes\n");
  await writeFile(source, "export const fixture = 1;\n");
  const recordingPath = "docs/performance/evidence/gameplay-frame-cost-20261103/user-playtest-20261104/recording.jsonl.gz";
  await mkdir(resolve(root, recordingPath, ".."), { recursive: true });
  const recording = resolve(root, recordingPath);
  await writeFile(recording, "original external test evidence\n");
  await writeFile(resolve(root, ".gitignore"), "public/ignored.txt\n");
  git("init", "--initial-branch=main");
  git("add", "--", "public/fixture.txt", "client/fixture.ts", ".gitignore", recordingPath);
  git("commit", "-m", "Fixture source");
  const expected = await readReplaySourceManifest(root), report = { sourceHash: expected.sourceHash, status: "complete" };
  const accepted = resolve(root, "accepted.json");
  await saveVerifiedReplayReport(root, expected, report, accepted);
  assert.equal(JSON.parse(readFileSync(accepted, "utf8")).sourceRevalidated, true);
  const rejected = resolve(root, "must-not-exist.json");
  await writeFile(source, "export const fixture = 2;\n");
  await assert.rejects(saveVerifiedReplayReport(root, expected, report, rejected), /changed/);
  assert.equal(existsSync(rejected), false);
  await writeFile(source, "export const fixture = 1;\n");
  await writeFile(recording, "changed external test evidence\n");
  await assert.rejects(saveVerifiedReplayReport(root, expected, report, rejected), /changed/);
  assert.equal(existsSync(rejected), false);
  await writeFile(recording, "original external test evidence\n");
  await writeFile(asset, "changed public bytes\n");
  await assert.rejects(saveVerifiedReplayReport(root, expected, report, rejected), /Public assets differ/);
  assert.equal(existsSync(rejected), false);
  git("add", "--", "public/fixture.txt");
  git("commit", "-m", "Changed public tree");
  await assert.rejects(saveVerifiedReplayReport(root, expected, report, rejected), /changed/);
  assert.equal(existsSync(rejected), false);
  const newer = await readReplaySourceManifest(root);
  await writeFile(resolve(root, "public/ignored.txt"), "unversioned served asset\n");
  await assert.rejects(saveVerifiedReplayReport(root, newer, { ...report, sourceHash: newer.sourceHash }, rejected), /Public assets differ/);
  assert.equal(existsSync(rejected), false);
});

test("test build changes only the actual welcome guest callback and bootstrap, rejecting source drift", () => {
  const root = resolve(import.meta.dirname, ".."),
    welcomePath = resolve(root, "client/welcome-screen.tsx"),
    source = readFileSync(welcomePath, "utf8"),
    html = readFileSync(resolve(root, "index.html"), "utf8"),
    plugin = createReplayBuildPlugin(root, "a".repeat(64));
  const changed = plugin.transform(source, welcomePath + "?test");
  assert.equal(changed.code.replace('enter("guest")', 'enter("multi")'), source);
  assert.equal(plugin.transform(source, resolve(root, "client/ui.tsx")), null);
  assert.throws(() => plugin.transform(source.replace('enter("multi")', 'enter("changed")'), welcomePath), /refused/);
  assert.throws(() => plugin.transform(source + '\nenter("multi")', welcomePath), /refused/);
  const transformed = plugin.transformIndexHtml.handler(html);
  assert.ok(transformed.includes('src="/tests/replay/browser-entry.ts"'));
  assert.ok(transformed.includes('name="replay-source" content="' + "a".repeat(64) + '"'));
  assert.throws(() => plugin.transformIndexHtml.handler(html.replace("/client/main.tsx", "/changed.tsx")), /refused/);
  assert.throws(() => plugin.transformIndexHtml.handler(html + '<script src="/client/main.tsx"></script>'), /refused/);
});

test("replay CLI accepts isolated modes and standalone help, refusing ambiguous flags", () => {
  assert.deepEqual(parseReplayArguments([]), { help: false, buildOnly: false, skipBuild: false });
  assert.equal(parseReplayArguments(["--help"]).help, true);
  assert.equal(parseReplayArguments(["-h"]).help, true);
  assert.equal(parseReplayArguments(["--build-only"]).buildOnly, true);
  assert.equal(parseReplayArguments(["--skip-build"]).skipBuild, true);
  for (const args of [["--help", "--build-only"], ["--skip-build", "--build-only"], ["--skip-build", "--skip-build"], ["--unknown"]])
    assert.throws(() => parseReplayArguments(args), /Usage/);
});

test("replay rejects an implicit or downgraded backend and distinguishes CM from NCM", () => {
  for (const search of ["", "?renderBackend=", "?renderBackend=bad", "?renderBackend=webgpu&renderBackend=webgpu"])
    assert.throws(() => requestedReplayBackend(search), /explicit/);
  for (const backend of ["webgl2", "webgpu", "webgpu-fast"]) {
    assert.equal(requestedReplayBackend("?scenario=test&renderBackend=" + backend), backend);
    assertReplayBackend({ isWebGPU: backend !== "webgl2", compatibilityMode: backend !== "webgpu-fast" }, backend);
  }
  assert.throws(() => assertReplayBackend({ isWebGPU: false }, "webgpu"), /differ/);
  assert.throws(() => assertReplayBackend({ isWebGPU: true, compatibilityMode: true }, "webgpu-fast"), /differ/);
});

test("historical B6 floor labels remain intact while coverage follows current CAD geometry", () => {
  const fixture = JSON.parse(readFileSync(new URL("./replay/fixtures/b6-20261017.json", import.meta.url), "utf8"));
  const before = JSON.stringify(fixture), coverage = replayZoneCoverage(fixture, zoneAt);
  assert.deepEqual(coverage.recordedZones, ["outside", "b6:0", "b6:1", "b6:2", "b6:3", "b6:4"]);
  assert.deepEqual(coverage.expectedZones, ["outside", "b06:n01", "b06:n02", "b06:n03", "b06:n04", "b06:n05"]);
  assert.equal(coverage.changedZoneSamples, 83);
  assert.equal(JSON.stringify(fixture), before);
});

const state = (x = 0, yaw = 0, vehicle = false) => ({
  position: { x, y: 1, z: 0 },
  camera: {
    x,
    y: 2,
    z: 3,
    yaw,
    pitch: 0,
    distance: 8,
    fov: 0.85,
    firstPerson: false,
  },
  vehicle,
  flashlight: false,
  rendering: { quality: "low", hardwareScaling: 2 },
  lightingInstant: 1000,
});
const scenario = (timeline: any[]) => ({
  schemaVersion: 1,
  id: "fixture",
  durationMs: timeline.at(-1).atMs,
  timeline,
});
const sample = (atMs: number, value = state(), seq = atMs) => ({
  atMs,
  seq,
  type: "sample",
  state: value,
});

test("replay never skips a recorded sample or action after a long render stall", () => {
  const fixture = scenario([
    sample(0),
    {
      atMs: 10,
      seq: 1,
      type: "event",
      kind: "action",
      data: { action: "flashlight", enabled: true },
    },
    sample(20, state(2)),
  ]);
  const cursor = createReplayCursor(fixture);
  const steps = [
    cursor.advance(1000),
    cursor.advance(1000),
    cursor.advance(1000),
  ];
  assert.deepEqual(
    steps.map((s: any) => s.milestone.seq),
    [0, 1, 20],
  );
  assert.equal(steps[1].state.flashlight, true);
  assert.equal(steps[2].done, true);
  assert.equal(steps[2].consumedSamples, 2);
});

test("sample interpolation uses shortest camera arc and leaves source untouched", () => {
  const fixture = scenario([
    sample(0, state(0, Math.PI - 0.1)),
    sample(1000, state(10, -Math.PI + 0.1)),
  ]);
  const before = JSON.stringify(fixture),
    cursor = createReplayCursor(fixture);
  cursor.advance(0);
  const mid = cursor.advance(500);
  assert.equal(mid.state.position.x, 5);
  assert.ok(Math.abs(mid.state.camera.yaw - Math.PI) < 1e-9);
  assert.equal(JSON.stringify(fixture), before);
});

test("vehicle transitions and long missing intervals are held instead of invented", () => {
  for (const [end, vehicle] of [
    [1000, true],
    [4000, false],
  ] as const) {
    const cursor = createReplayCursor(
      scenario([sample(0), sample(end, state(10, 0, vehicle))]),
    );
    cursor.advance(0);
    assert.equal(cursor.advance(500).state.position.x, 0);
  }
});

test("explicit lighting, quality and camera changes survive until the next sample", () => {
  const cursor = createReplayCursor(
    scenario([
      sample(0),
      {
        atMs: 10,
        seq: 1,
        type: "event",
        kind: "lighting-change",
        data: { mode: "night" },
      },
      {
        atMs: 20,
        seq: 2,
        type: "event",
        kind: "quality-change",
        data: { rendering: { quality: "high" } },
      },
      {
        atMs: 30,
        seq: 3,
        type: "event",
        kind: "camera-change",
        data: { firstPerson: true },
      },
      sample(100, { ...state(), lightingInstant: 2000 }),
    ]),
  );
  cursor.advance(0);
  cursor.advance(10);
  cursor.advance(20);
  const changed = cursor.advance(30).state;
  assert.equal(changed.lightingInstant, 2000);
  assert.equal(changed.rendering.quality, "high");
  assert.equal(changed.camera.firstPerson, true);
  assert.equal(cursor.advance(40).state.camera.firstPerson, true);
});

test("invalid, backward and incomplete replay clocks fail closed", () => {
  assert.throws(() =>
    validateScenario({ ...scenario([sample(0), sample(100)]), id: undefined }),
  );
  assert.throws(() =>
    validateScenario(scenario([sample(0, state(), -1), sample(100)])),
  );
  assert.throws(() => validateScenario(scenario([sample(1), sample(0)])));
  const cursor = createReplayCursor(scenario([sample(0), sample(100)]));
  cursor.advance(10);
  for (const value of [NaN, Infinity, -1, 5])
    assert.throws(() => cursor.advance(value));
  assert.throws(() =>
    validateScenario(
      scenario([
        sample(0),
        sample(100, { ...state(), position: { x: NaN, y: 1, z: 0 } }),
      ]),
    ),
  );
});

for (const id of ["b6-20261017", "outdoor-car-20261018"]) {
  test(`all recorded milestones are reachable without skipping: ${id}`, () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(`./replay/fixtures/${id}.json`, import.meta.url),
        "utf8",
      ),
    );
    const cursor = createReplayCursor(fixture);
    let last: any;
    for (const item of fixture.timeline) {
      last = cursor.advance(fixture.durationMs);
      assert.equal(last.milestone.seq, item.seq);
      assert.ok(last.state || item.type === "event");
    }
    assert.equal(last.done, true);
    assert.equal(
      last.consumedSamples,
      fixture.timeline.filter((x: any) => x.type === "sample").length,
    );
  });
}

test("recorded weather survives UI refresh and changed observations with the same timestamp", () => {
  const apply = createRecordedWeatherPlayer();
  let calls = 0;
  const game: any = {
    weather: undefined,
    setWeather(value: unknown) {
      this.weather = value;
      calls++;
    },
  };
  const source = { fetchedAt: 7, wind: 2 };
  const owned = apply(game, source);
  apply(game, source);
  assert.equal(calls, 1);
  game.weather = { fetchedAt: 8, wind: 99 };
  assert.equal(apply(game, source), owned);
  assert.equal(game.weather.wind, 2);
  assert.equal(calls, 2);
  apply(game, { ...source, wind: 3 });
  assert.equal(game.weather.wind, 3);
  assert.equal(source.wind, 2);
});

test("the render-state oracle rejects missing lighting transfer and other consumer drift", () => {
  const expected = state(),
    weather = { wind: 2 };
  const actual = {
    lightingInstant: expected.lightingInstant,
    quality: "low",
    hardwareScaling: 2,
    flashlight: false,
    weather,
  };
  assertRenderedReplayState(actual, expected, weather);
  for (const changed of [
    { ...actual, lightingInstant: Date.now() },
    { ...actual, quality: "high" },
    { ...actual, hardwareScaling: 1 },
    { ...actual, flashlight: true },
    { ...actual, weather: { wind: 99 } },
  ])
    assert.throws(() => assertRenderedReplayState(changed, expected, weather));
});

test("terminal cleanup stops and disposes the owned game, continuing after stop failure", () => {
  const calls: string[] = [];
  const game: any = {
    disposed: false,
    engine: {
      stopRenderLoop() {
        calls.push("stop");
      },
    },
    dispose() {
      calls.push("dispose");
      this.disposed = true;
    },
    renderHealth: { snapshot: () => ({ phase: "disposed" }) },
  };
  assert.deepEqual(cleanupReplayGame(game), {
    gameDisposed: true,
    healthPhase: "disposed",
  });
  assert.deepEqual(calls, ["stop", "dispose"]);
  calls.length = 0;
  game.engine.stopRenderLoop = () => {
    calls.push("stop");
    throw new Error("stop fault");
  };
  assert.throws(() => cleanupReplayGame(game), /cleanup/);
  assert.deepEqual(calls, ["stop", "dispose"]);
});

test("served fixtures retain the build bytes and reject a stale manifest", () => {
  const bytes = Buffer.from('{"recorded":true}');
  const sha = (value: Uint8Array) =>
    createHash("sha256").update(value).digest("hex");
  const manifest = {
    files: { "tests/replay/fixtures/probe.json": sha(bytes) },
  };
  const read = freezeReplayFixtures([["probe", bytes]], manifest, sha);
  bytes.fill(0);
  assert.equal(Buffer.from(read("probe")).toString(), '{"recorded":true}');
  read("probe").fill(0);
  assert.equal(Buffer.from(read("probe")).toString(), '{"recorded":true}');
  assert.throws(
    () => freezeReplayFixtures([["probe", bytes]], manifest, sha),
    /changed after build/,
  );
});

test("terminal reporting rejects a late endFrame fault and awaits bounded WebGPU submission", async () => {
  let valid = true;
  const game: any = {
    engine: { isWebGPU: false, stopRenderLoop() {} },
    renderErrorCount: 0,
    assetLoadErrorCount: 0,
    renderHealth: {
      snapshot: () => ({ valid, errorCount: valid ? 0 : 1 }),
      guard: (p: Promise<void>) => p,
    },
  };
  const late = settleReplayFrame(game);
  valid = false;
  await assert.rejects(late, /endFrame/);
  valid = true;
  assert.equal((await settleReplayFrame(game)).health.valid, true);
  let resolveWork!: () => void;
  const submitted = new Promise<void>((resolve) => {
    resolveWork = resolve;
  });
  game.engine.isWebGPU = true;
  game.engine._device = { queue: { onSubmittedWorkDone: () => submitted } };
  const gpu = settleReplayFrame(game);
  await Promise.resolve();
  valid = false;
  resolveWork();
  await assert.rejects(gpu, /endFrame/);
  valid = true;
  game.engine._device.queue.onSubmittedWorkDone = () => new Promise(() => {});
  await assert.rejects(settleReplayFrame(game, 10), /timeout/);
});
