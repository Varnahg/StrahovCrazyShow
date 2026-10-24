import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
} = replay;

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
