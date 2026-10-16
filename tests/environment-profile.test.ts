import assert from "node:assert/strict";
import test from "node:test";
import {
  createEnvironmentProfile,
  ENVIRONMENT_PROFILE_PHASES,
  ENVIRONMENT_PROFILE_SCOPE,
  type EnvironmentProfile,
  type EnvironmentProfileMetadata,
  type EnvironmentProfileOptions,
  type EnvironmentProfilePhase,
  type EnvironmentProfileSnapshot,
} from "../client/environment-profile";

const local = { hostname: "localhost", search: "?profileEnvironment=1" };
const equalDurations = (duration: number) => Array<number>(10).fill(duration);

function fixture(options: Partial<EnvironmentProfileOptions> = {}) {
  const clock = { time: 0, fail: false, reads: 0 };
  const reports: EnvironmentProfileSnapshot[] = [];
  const profile = createEnvironmentProfile(local, {
    now: () => {
      clock.reads++;
      if (clock.fail) throw new Error("test clock failed");
      return clock.time;
    },
    onSlowFrame: (snapshot) => reports.push(snapshot),
    ...options,
  })!;
  function frame(
    start: number,
    durations = equalDurations(3),
    metadata?: Parameters<EnvironmentProfile["end"]>[0],
  ) {
    clock.time = start;
    profile.begin();
    for (let i = 0; i < ENVIRONMENT_PROFILE_PHASES.length; i++) {
      clock.time += durations[i];
      profile.mark(ENVIRONMENT_PROFILE_PHASES[i]);
    }
    profile.end(metadata);
  }
  return { clock, reports, profile, frame };
}

test("environment profile requires an unambiguous local opt-in without sampling a clock", () => {
  let clockReads = 0;
  const options = { now: () => ++clockReads, onSlowFrame: () => {} };
  for (const hostname of [
    "localhost",
    "LOCALHOST",
    "127.0.0.1",
    "[::1]",
    "::1",
  ])
    assert.ok(createEnvironmentProfile({ ...local, hostname }, options));
  for (const hostname of [
    "example.com",
    "localhost.example.com",
    "192.168.1.2",
    "127.0.0.1.example.com",
    "",
  ])
    assert.equal(
      createEnvironmentProfile({ ...local, hostname }, options),
      undefined,
    );
  for (const search of [
    "",
    "?profileEnvironment=0",
    "?profileEnvironment=true",
    "?profileEnvironment=01",
    "?profileEnvironment=",
    "?profileEnvironment=1&profileEnvironment=1",
    "?profileEnvironment=1&profileEnvironment=0",
    "?profileEnvironment=1&%70rofileEnvironment=1",
  ])
    assert.equal(
      createEnvironmentProfile({ ...local, search }, options),
      undefined,
    );
  assert.ok(
    createEnvironmentProfile(
      { ...local, search: "?x=1&profileEnvironment=1&x=2" },
      options,
    ),
  );
  assert.equal(clockReads, 0);
  const disabledOptions = {
    get now(): () => number {
      throw new Error("disabled profiler touched options");
    },
    onSlowFrame: () => {},
  };
  assert.equal(
    createEnvironmentProfile({ ...local, search: "" }, disabledOptions),
    undefined,
  );
});

test("environment phases partition the synchronous interval, excluding reporting and its metadata", () => {
  const { clock, profile, reports } = fixture();
  clock.time = 100;
  profile.begin();
  for (let i = 0; i < ENVIRONMENT_PROFILE_PHASES.length; i++) {
    clock.time += i + 1;
    profile.mark(ENVIRONMENT_PROFILE_PHASES[i]);
  }
  clock.time = 9000; // Work after the final boundary is outside this scope.
  profile.end(() => {
    clock.time += 5000;
    return { exposure: 0.73, daylight: 0.2, quality: "high" };
  });
  assert.equal(reports.length, 1);
  assert.deepEqual(reports[0].phasesMs, {
    skyWeather: 1,
    artLighting: 2,
    carLighting: 3,
    vehicleLighting: 4,
    flashlight: 5,
    vegetation: 6,
    transit: 7,
    precipitation: 8,
    surfaces: 9,
    cinematic: 10,
  });
  assert.equal(reports[0].startedAtMs, 100);
  assert.equal(reports[0].endedAtMs, 155);
  assert.equal(reports[0].totalMs, 55);
  assert.equal(
    Object.values(reports[0].phasesMs).reduce((a, b) => a + b, 0),
    55,
  );
  assert.equal(
    clock.reads,
    11,
    "begin plus ten marks; end does not sample a different scope",
  );
  assert.equal(profile.scope, ENVIRONMENT_PROFILE_SCOPE);
  assert.equal(reports[0].scope, ENVIRONMENT_PROFILE_SCOPE);
  assert.match(profile.scope.phases, /synchronous nested calls/);
  assert.match(profile.scope.total, /excludes.*GPU execution/);
  assert.match(profile.scope.relationship, /never add/);
  assert.match(profile.scope.sampling, /not a distribution/);
});

test("threshold and report cadence use inclusive boundaries without evaluating fast-frame metadata", () => {
  const { frame, reports } = fixture();
  let metadataCalls = 0;
  const metadata = () => ({ serial: ++metadataCalls });
  frame(0, [24.999, ...Array<number>(9).fill(0)], metadata);
  assert.equal(reports.length, 0);
  frame(100, equalDurations(2.5), metadata); // Ends at 125, meets default 25 ms.
  frame(200, equalDurations(3), metadata); // Slow but throttled.
  frame(1099, equalDurations(2.5), metadata); // Ends one ms before cadence.
  assert.equal(reports.length, 1);
  assert.equal(metadataCalls, 1);
  frame(1124, [1, ...Array<number>(9).fill(0)], metadata); // Fast frame doesn't move cadence.
  frame(1125, equalDurations(2.5), metadata);
  assert.equal(reports.length, 2);
  assert.equal(metadataCalls, 2);
  assert.equal(reports[1].endedAtMs - reports[0].endedAtMs, 1025);
  const exact = fixture();
  exact.frame(0, equalDurations(2.5));
  exact.frame(1000, equalDurations(2.5));
  assert.equal(
    exact.reports.length,
    2,
    "exactly 1000 ms between completions is allowed",
  );
});

test("a new begin discards interrupted work and completed frames cannot be emitted twice", () => {
  const { clock, profile, reports, frame } = fixture({
    thresholdMs: 0,
    minIntervalMs: 0,
  });
  profile.mark("skyWeather");
  profile.end();
  profile.begin();
  clock.time = 800;
  profile.mark("skyWeather");
  clock.time = 900;
  profile.mark("artLighting");
  frame(1000, equalDurations(1));
  profile.end();
  profile.mark("cinematic");
  profile.end();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].totalMs, 10);
  assert.ok(Object.values(reports[0].phasesMs).every((time) => time === 1));
  clock.time = 1100;
  profile.begin();
  clock.time += 100;
  profile.mark("skyWeather");
  profile.end();
  assert.equal(reports.length, 1, "end of an incomplete frame is discarded");
  frame(1300, equalDurations(2));
  assert.equal(reports[1].totalMs, 20);
});

test("duplicate, skipped, unknown and extra marks invalidate rather than misattribute phases", () => {
  const { clock, profile, reports, frame } = fixture({
    thresholdMs: 0,
    minIntervalMs: 0,
  });
  const malformed: readonly (readonly EnvironmentProfilePhase[])[] = [
    ["artLighting"],
    ["skyWeather", "skyWeather"],
    ["skyWeather", "carLighting"],
    ["unknown" as EnvironmentProfilePhase],
    [...ENVIRONMENT_PROFILE_PHASES, "cinematic"],
  ];
  for (let index = 0; index < malformed.length; index++) {
    clock.time = index * 100;
    profile.begin();
    for (const phase of malformed[index]) {
      clock.time++;
      profile.mark(phase);
    }
    // Later correctly named marks must not rescue an already invalid frame.
    for (const phase of ENVIRONMENT_PROFILE_PHASES) profile.mark(phase);
    profile.end();
  }
  assert.equal(reports.length, 0);
  frame(1000);
  assert.equal(reports.length, 1);
});

test("nonfinite, negative and throwing clocks discard only the affected frame and recover", () => {
  for (const bad of [NaN, Infinity, -Infinity, -1, "throw"] as const) {
    for (const atBegin of [true, false]) {
      const { clock, profile, reports, frame } = fixture({ minIntervalMs: 0 });
      if (!atBegin) {
        clock.time = 10;
        profile.begin();
      }
      clock.fail = bad === "throw";
      clock.time = typeof bad === "number" ? bad : 20;
      if (atBegin) profile.begin();
      else profile.mark("skyWeather");
      clock.fail = false;
      clock.time = 100;
      for (const phase of ENVIRONMENT_PROFILE_PHASES) profile.mark(phase);
      profile.end();
      assert.equal(reports.length, 0, String(bad));
      frame(200);
      assert.equal(reports.length, 1, String(bad));
      assert.equal(reports[0].totalMs, 30);
    }
  }
});

test("a backwards clock invalidates the interval and restarts a full cadence in its new epoch", () => {
  const { clock, profile, reports, frame } = fixture();
  frame(2000);
  clock.time = 3000;
  profile.begin();
  clock.time = 100;
  profile.mark("skyWeather");
  profile.end();
  frame(110);
  assert.equal(
    reports.length,
    1,
    "regression and immediate retries do not flood reports",
  );
  frame(1070); // Ends at 1100, exactly one interval after reset at 100.
  assert.equal(reports.length, 2);
  assert.equal(reports[1].totalMs, 30);
  clock.time = 50;
  profile.begin(); // A regression between frames is invalid too.
  profile.end();
  frame(60);
  assert.equal(reports.length, 2);
  frame(1020);
  assert.equal(reports.length, 3);
});

test("coarsened equal clock samples are valid and owners have independent cadence and buffers", () => {
  const first = fixture({ thresholdMs: 0 });
  const second = fixture({ thresholdMs: 0 });
  first.frame(0, equalDurations(0));
  second.frame(0, equalDurations(3));
  assert.equal(first.reports[0].totalMs, 0);
  assert.equal(second.reports[0].totalMs, 30);
  first.frame(100, equalDurations(7));
  second.frame(1100, equalDurations(4));
  assert.equal(first.reports.length, 1);
  assert.equal(second.reports.length, 2);
  assert.equal(first.reports[0].phasesMs.skyWeather, 0);
  assert.equal(second.reports[0].phasesMs.skyWeather, 3);
  assert.equal(second.reports[1].phasesMs.skyWeather, 4);
});

test("reported snapshots never alias frame buffers or caller metadata, and metadata stays bounded", () => {
  const { frame, reports } = fixture({ minIntervalMs: 0 });
  const metadata = {
    quality: "high",
    exposure: 0.6,
    paused: false,
    optional: null,
  };
  frame(0, equalDurations(3), metadata);
  metadata.exposure = 2;
  metadata.quality = "low";
  Reflect.set(reports[0].phasesMs, "cinematic", 999);
  Reflect.set(reports[0].metadata!, "exposure", -999);
  frame(100, equalDurations(4), metadata);
  assert.equal(reports[1].phasesMs.cinematic, 4);
  assert.equal(reports[1].metadata?.exposure, 2);
  assert.equal(reports[0].metadata?.quality, "high");
  assert.notEqual(reports[0].phasesMs, reports[1].phasesMs);
  assert.equal(
    Reflect.set(ENVIRONMENT_PROFILE_SCOPE, "total", "GPU time"),
    false,
  );
  assert.equal(Reflect.set(ENVIRONMENT_PROFILE_PHASES, "0", "other"), false);
  const oversized = Object.fromEntries(
    Array.from({ length: 50 }, (_, i) => [`key${i}`, "x".repeat(2000)]),
  );
  frame(200, equalDurations(3), oversized);
  assert.equal(Object.keys(reports[2].metadata!).length, 16);
  assert.ok(
    Object.values(reports[2].metadata!).every(
      (value) => typeof value === "string" && value.length === 160,
    ),
  );
});

test("metadata ignores getters, prototypes, long keys and unsupported values, and safely survives failure", () => {
  const { frame, reports } = fixture({ minIntervalMs: 0 });
  let getterCalls = 0;
  const metadata = Object.create({ inherited: "omit" }) as Record<
    string,
    unknown
  >;
  Object.assign(metadata, {
    finite: 2,
    infinite: Infinity,
    nested: { mutable: true },
    missing: undefined,
  });
  metadata["k".repeat(65)] = "omit";
  Object.defineProperty(metadata, "getter", {
    enumerable: true,
    get() {
      getterCalls++;
      throw new Error("do not read");
    },
  });
  Object.defineProperty(metadata, "__proto__", {
    enumerable: true,
    value: "literal safe key",
  });
  frame(0, equalDurations(3), metadata as EnvironmentProfileMetadata);
  assert.deepEqual(
    { ...reports[0].metadata },
    Object.fromEntries([
      ["finite", 2],
      ["__proto__", "literal safe key"],
    ]),
  );
  assert.equal(getterCalls, 0);
  frame(100, equalDurations(3), () => {
    throw new Error("metadata failed");
  });
  frame(
    200,
    equalDurations(3),
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error("enumeration failed");
        },
      },
    ),
  );
  assert.equal(reports.length, 3);
  assert.equal(reports[1].metadata, undefined);
  assert.equal(reports[2].metadata, undefined);
});

test("callback exceptions and reentrant diagnostics cannot interrupt gameplay or bypass cadence", () => {
  let calls = 0;
  const { profile, frame } = fixture({
    onSlowFrame: () => {
      calls++;
      profile.begin();
      for (const phase of ENVIRONMENT_PROFILE_PHASES) profile.mark(phase);
      profile.end();
      throw new Error("consumer failed");
    },
  });
  assert.doesNotThrow(() => frame(0));
  assert.equal(calls, 1);
  assert.doesNotThrow(() => frame(100));
  assert.equal(calls, 1);
  assert.doesNotThrow(() => frame(1000));
  assert.equal(calls, 2);
});

test("metadata reentry is isolated even with zero threshold and cadence", () => {
  const { profile, reports, frame } = fixture({
    thresholdMs: 0,
    minIntervalMs: 0,
  });
  frame(0, equalDurations(3), () => {
    profile.begin();
    for (const phase of ENVIRONMENT_PROFILE_PHASES) profile.mark(phase);
    profile.end();
    return { source: "original" };
  });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].totalMs, 30);
  frame(100, equalDurations(1));
  assert.equal(reports.length, 2);
  assert.equal(reports[1].totalMs, 10);
});

test("invalid numeric options use safe defaults, and the real default clock returns finite intervals", () => {
  for (const invalid of [NaN, Infinity, -1]) {
    const { frame, reports } = fixture({
      thresholdMs: invalid,
      minIntervalMs: invalid,
    });
    frame(0, equalDurations(2));
    frame(100);
    frame(200);
    frame(1100);
    assert.equal(reports.length, 2);
  }
  let report: EnvironmentProfileSnapshot | undefined;
  const profile = createEnvironmentProfile(local, {
    thresholdMs: 0,
    onSlowFrame: (value) => {
      report = value;
    },
  })!;
  profile.begin();
  for (const phase of ENVIRONMENT_PROFILE_PHASES) profile.mark(phase);
  profile.end();
  assert.ok(report);
  assert.ok(Number.isFinite(report.totalMs) && report.totalMs >= 0);
  assert.ok(
    Object.values(report.phasesMs).every(
      (time) => Number.isFinite(time) && time >= 0,
    ),
  );
});
