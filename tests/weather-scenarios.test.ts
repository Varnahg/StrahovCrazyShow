import test from "node:test";
import assert from "node:assert/strict";
import {
  WEATHER_SCENARIOS,
  createWeatherScenario,
  isWeatherScenarioId,
} from "../shared/weather-scenarios";
import {
  ageWeatherSnapshot,
  weatherConditionFromCode,
  WMO_CONDITIONS,
} from "../shared/weather";
import {
  precipitationAppearance,
  updateRainSegments,
} from "../client/weather-particles";

test("all supported model condition families have a labelled render-only preview", () => {
  const families = new Set(
    WEATHER_SCENARIOS.map(({ id }) =>
      weatherConditionFromCode(createWeatherScenario(id, 0).weatherCode),
    ),
  );
  for (const family of Object.values(WMO_CONDITIONS))
    assert.ok(families.has(family), family);
  assert.equal(
    new Set(WEATHER_SCENARIOS.map(({ id }) => id)).size,
    WEATHER_SCENARIOS.length,
  );
  assert.equal(isWeatherScenarioId("real"), false);
  assert.equal(isWeatherScenarioId("snow"), true);
  for (const { id } of WEATHER_SCENARIOS) {
    const weather = createWeatherScenario(id, 1000);
    assert.match(weather.source, /^DEMO/);
    assert.equal(weather.preview?.id, id);
    assert.equal(weather.observedAt, null);
    assert.equal(weather.sourceKind, undefined);
    assert.deepEqual(weather.fieldSources, {});
    assert.equal(weather.status, "unavailable");
    assert.equal(weather.stale, true);
    const aged = ageWeatherSnapshot(weather, 1e12);
    assert.equal(aged.sourceKind, undefined);
    assert.equal(aged.preview?.id, id);
    assert.ok(Number.isFinite(weather.cloud));
    assert.ok(Number.isFinite(weather.wind));
  }
});

test("preview nested values never mutate future selections or the actual snapshot", () => {
  const a = createWeatherScenario("wind", 1000);
  a.cloudWinds!.low.speed = 99;
  assert.equal(createWeatherScenario("wind", 2000).cloudWinds!.low.speed, 22);
  const b = createWeatherScenario("partly-cloudy", 1000);
  b.cloudLayers!.low = 0;
  assert.equal(
    createWeatherScenario("partly-cloudy", 1000).cloudLayers!.low,
    0.38,
  );
});

test("drizzle, rain, snow, mixed phase and hail keep distinct bounded trajectories", () => {
  const sample = (id: "drizzle" | "rain" | "snow" | "hail") => {
    const lines = Array.from({ length: 20 }, () => [
      { x: 0, y: 5, z: 0 },
      { x: 0, y: 5, z: 0 },
    ]);
    updateRainSegments(lines, 0.1, createWeatherScenario(id, 0));
    return { fall: 5 - lines[0][0].y, length: lines[0][0].y - lines[0][1].y };
  };
  const drizzle = sample("drizzle"),
    rain = sample("rain"),
    snow = sample("snow"),
    hail = sample("hail");
  assert.ok(drizzle.fall < rain.fall && snow.fall < drizzle.fall);
  assert.ok(hail.fall > snow.fall * 4 && hail.length < rain.length / 4);
  assert.ok(drizzle.length < rain.length / 2);
  assert.equal(
    precipitationAppearance(createWeatherScenario("mixed", 0)).snowFraction,
    0.5,
  );
  assert.equal(
    precipitationAppearance(createWeatherScenario("freezing-rain", 0))
      .snowFraction,
    0,
  );
  for (const { id } of WEATHER_SCENARIOS) {
    const weather = createWeatherScenario(id, 0);
    const lines = Array.from({ length: 10 }, () => [
      { x: 17.9, y: -0.99, z: 17.9 },
      { x: 0, y: 0, z: 0 },
    ]);
    updateRainSegments(lines, 1, weather, { x: 15, z: 15 }, 1e7);
    for (const [a, b] of lines) {
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 2);
      assert.ok(Number.isFinite(a.y) && a.y >= -1);
    }
  }
  assert.ok(
    precipitationAppearance(createWeatherScenario("rain-light", 0)).density <
      precipitationAppearance(createWeatherScenario("rain-heavy", 0)).density,
  );
});
