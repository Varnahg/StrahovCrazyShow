const finite = (value) => typeof value === "number" && Number.isFinite(value);
const angle = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
const mix = (a, b, t) => a + (b - a) * t;
const vector = (value) =>
  value && ["x", "y", "z"].every((key) => finite(value[key]));
const kinds = new Set([
  "action",
  "quality-change",
  "lighting-change",
  "camera-change",
]);

/** One owned snapshot per observed state; UI polling can replace Game.weather. */
export function createRecordedWeatherPlayer() {
  let recorded, applied;
  return (game, weather) => {
    if (!weather) return undefined;
    if (recorded !== weather) {
      recorded = weather;
      applied = {
        ...weather,
        status: "fallback",
        stale: true,
        source: "Uložené testovací počasí",
      };
    }
    if (game.weather !== applied) game.setWeather(applied);
    return applied;
  };
}

/** Compare actual renderer-consumer inputs, independently of applying them. */
export function assertRenderedReplayState(actual, expected, expectedWeather) {
  if (
    actual.lightingInstant !== expected.lightingInstant ||
    actual.quality !== expected.rendering.quality ||
    !finite(actual.hardwareScaling) ||
    Math.abs(actual.hardwareScaling - expected.rendering.hardwareScaling) >
      0.0001 ||
    actual.flashlight !== expected.flashlight ||
    (expectedWeather !== undefined && actual.weather !== expectedWeather)
  )
    throw new Error(
      "Rendered lighting/quality/flashlight/weather differs from the recording",
    );
}

/** Invoke outside Babylon's current begin/render/end callback. */
export async function settleReplayFrame(game, timeoutMs = 5000) {
  await Promise.resolve(); // Babylon submits after its render callback returns.
  if (!game) return;
  game.engine.stopRenderLoop();
  const verify = () => {
    const health = game.renderHealth.snapshot();
    if (!health.valid || game.renderErrorCount || game.assetLoadErrorCount)
      throw new Error(
        "Final endFrame/submit is not healthy: " + JSON.stringify(health),
      );
    return {
      health,
      renderErrors: game.renderErrorCount,
      assetErrors: game.assetLoadErrorCount,
    };
  };
  verify();
  if (game.engine.isWebGPU) {
    const queue = game.engine._device?.queue;
    if (!queue?.onSubmittedWorkDone)
      throw new Error("WebGPU submission completion unavailable");
    let timer;
    try {
      await Promise.race([
        game.renderHealth.guard(
          Promise.resolve().then(() => queue.onSubmittedWorkDone()),
        ),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error("Final submission timeout")),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    await new Promise((done) => setTimeout(done, 0));
  }
  return verify();
}

export function cleanupReplayGame(game) {
  if (!game) return { gameDisposed: true, healthPhase: "not-created" };
  const errors = [];
  try {
    game.engine.stopRenderLoop();
  } catch (error) {
    errors.push(error);
  }
  try {
    game.dispose();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) throw new AggregateError(errors, "Replay cleanup failed");
  const result = {
    gameDisposed: game.disposed,
    healthPhase: game.renderHealth.snapshot().phase,
  };
  if (!result.gameDisposed || result.healthPhase !== "disposed")
    throw new Error("Replay resources were not released");
  return result;
}

/** Freeze the build's exact bytes instead of serving subsequently edited files. */
export function freezeReplayFixtures(entries, manifest, sha256) {
  const snapshots = new Map();
  for (const [id, bytes] of entries) {
    if (
      sha256(bytes) !== manifest.files["tests/replay/fixtures/" + id + ".json"]
    )
      throw new Error("Replay fixture changed after build: " + id);
    snapshots.set(id, Uint8Array.from(bytes));
  }
  return (id) => snapshots.get(id)?.slice();
}

export function validateScenario(scenario) {
  if (
    scenario?.schemaVersion !== 1 ||
    typeof scenario.id !== "string" ||
    !/^[a-z0-9-]+$/.test(scenario.id) ||
    !finite(scenario.durationMs) ||
    scenario.durationMs <= 0 ||
    !Array.isArray(scenario.timeline) ||
    !scenario.timeline.length ||
    scenario.timeline.length > 100000
  )
    throw new Error("Invalid replay scenario");
  let previous = -1,
    samples = 0;
  for (const item of scenario.timeline) {
    if (
      !finite(item.atMs) ||
      item.atMs < 0 ||
      item.atMs < previous ||
      item.atMs > scenario.durationMs ||
      !Number.isSafeInteger(item.seq) ||
      item.seq < 0
    )
      throw new Error("Invalid replay timeline");
    previous = item.atMs;
    if (item.type === "sample") {
      samples++;
      const state = item.state;
      if (
        !vector(state?.position) ||
        !vector(state?.camera) ||
        !["yaw", "pitch", "distance", "fov"].every((key) =>
          finite(state.camera[key]),
        ) ||
        typeof state.camera.firstPerson !== "boolean" ||
        state.camera.distance <= 0 ||
        state.camera.fov <= 0 ||
        state.camera.fov >= Math.PI ||
        !finite(state.lightingInstant) ||
        typeof state.vehicle !== "boolean" ||
        typeof state.flashlight !== "boolean" ||
        !["low", "medium", "high"].includes(state.rendering?.quality) ||
        !finite(state.rendering.hardwareScaling) ||
        state.rendering.hardwareScaling <= 0
      )
        throw new Error("Invalid replay sample");
    } else if (item.type !== "event" || !kinds.has(item.kind) || !item.data)
      throw new Error("Invalid replay event");
  }
  if (!samples || previous !== scenario.durationMs)
    throw new Error("Incomplete replay timeline");
  return scenario;
}

/** One recorded milestone per rendered frame: slow frames never skip samples.
 * Intermediate poses are a test reconstruction, not recovered physics inputs. */
export function createReplayCursor(input) {
  const scenario = validateScenario(input);
  const nextSamples = new Array(scenario.timeline.length + 1);
  for (let i = scenario.timeline.length - 1; i >= 0; i--)
    nextSamples[i] =
      scenario.timeline[i].type === "sample"
        ? scenario.timeline[i]
        : nextSamples[i + 1];
  let index = -1,
    sample,
    sampleAt = 0,
    requestedAt = -1,
    atMs = 0;
  let overrides = {},
    consumedSamples = 0,
    consumedEvents = 0;
  return {
    advance(requestedMs) {
      if (!finite(requestedMs) || requestedMs < 0 || requestedMs < requestedAt)
        throw new Error("Replay clock must be finite and monotonic");
      requestedAt = requestedMs;
      const next = scenario.timeline[index + 1];
      const milestone = next && requestedMs >= next.atMs ? next : null;
      atMs = Math.min(
        requestedMs,
        next?.atMs ?? scenario.durationMs,
        scenario.durationMs,
      );
      if (milestone) {
        index++;
        if (milestone.type === "sample") {
          sample = milestone.state;
          sampleAt = milestone.atMs;
          overrides = {};
          consumedSamples++;
        } else {
          consumedEvents++;
          const data = milestone.data;
          if (milestone.kind === "quality-change")
            overrides.rendering = data.rendering;
          if (milestone.kind === "camera-change") overrides.camera = data;
          if (milestone.kind === "action" && data.action === "flashlight")
            overrides.flashlight = data.enabled;
          if (milestone.kind === "lighting-change") {
            const following = nextSamples[index + 1];
            if (!finite(following?.state.lightingInstant))
              throw new Error(
                "Lighting event has no following observed instant",
              );
            overrides.lightingInstant = following.state.lightingInstant;
          }
        }
      }
      let state = sample
        ? {
            ...sample,
            position: { ...sample.position },
            camera: { ...sample.camera },
          }
        : null;
      if (state) {
        const following = nextSamples[index + 1];
        const gap = following ? following.atMs - sampleAt : Infinity;
        if (
          gap > 0 &&
          gap <= 3000 &&
          following.state.vehicle === state.vehicle &&
          following.state.camera.firstPerson === state.camera.firstPerson
        ) {
          const t = Math.max(0, Math.min(1, (atMs - sampleAt) / gap));
          for (const key of ["x", "y", "z"]) {
            state.position[key] = mix(
              sample.position[key],
              following.state.position[key],
              t,
            );
            state.camera[key] = mix(
              sample.camera[key],
              following.state.camera[key],
              t,
            );
          }
          state.camera.yaw = angle(
            sample.camera.yaw,
            following.state.camera.yaw,
            t,
          );
          state.camera.pitch = mix(
            sample.camera.pitch,
            following.state.camera.pitch,
            t,
          );
        }
        if (overrides.rendering)
          state.rendering = { ...state.rendering, ...overrides.rendering };
        if (overrides.camera) {
          for (const key of ["firstPerson", "distance"])
            if (overrides.camera[key] !== undefined)
              state.camera[key] = overrides.camera[key];
        }
        if (overrides.flashlight !== undefined)
          state.flashlight = overrides.flashlight;
        if (overrides.lightingInstant !== undefined)
          state.lightingInstant = overrides.lightingInstant;
      }
      return {
        state,
        atMs,
        milestone,
        consumedSamples,
        consumedEvents,
        done:
          index === scenario.timeline.length - 1 &&
          atMs === scenario.durationMs,
      };
    },
  };
}
