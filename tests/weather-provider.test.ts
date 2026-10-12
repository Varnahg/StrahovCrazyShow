import test from "node:test";
import assert from "node:assert/strict";
import {
  createWeatherProvider,
  parseModelWeather,
  selectWeather,
} from "../server/weather";
import { parseStation } from "../shared/weather";

const now = Date.parse("2026-10-12T12:00:00Z");
const stationHtml = (
  stamp = "2026-10-12 14:00:00",
  humidity = "82",
  rain = "1.2",
) =>
  `<tr><td>Teplota:</td><td>4.0 &#176;C</td></tr><tr><td>Charakter v&#283;tru:</td><td>NE<br>2.1 m/s</td></tr><tr><td>Intenzita de&#353;t&#283;:</td><td>${rain} mm/h</td></tr><tr><td>Relativn&#237; vlhkost:</td><td>${humidity} %</td></tr>${stamp} fc-icon-partlycloudy`;
const modelData = () => ({
  current_units: {
    time: "unixtime",
    interval: "seconds",
    temperature_2m: "°C",
    wind_speed_10m: "m/s",
    precipitation: "mm",
    rain: "mm",
    showers: "mm",
    snowfall: "cm",
    visibility: "m",
    wind_speed_300hPa: "m/s",
    wind_direction_300hPa: "°",
  } as Record<string, unknown>,
  current: {
    time: now / 1000,
    interval: 900,
    temperature_2m: 4,
    wind_speed_10m: 3,
    wind_direction_10m: 270,
    wind_gusts_10m: 9,
    precipitation: 0.5,
    rain: 0,
    showers: 0,
    snowfall: 0.35,
    weather_code: 73,
    cloud_cover: 85,
    cloud_cover_low: 25,
    cloud_cover_mid: 60,
    cloud_cover_high: 45,
    wind_speed_850hPa: 12,
    wind_direction_850hPa: 225,
    wind_speed_500hPa: 22,
    wind_direction_500hPa: 240,
    wind_speed_300hPa: 42,
    wind_direction_300hPa: 265,
    relative_humidity_2m: 94,
    visibility: 1500,
  } as Record<string, unknown>,
});

test("current model supplies phase independently of ground temperature and keeps interval units", () => {
  const data = modelData(),
    snow = parseModelWeather(data, now);
  assert.equal(snow.precipitationType, "snow");
  assert.equal(snow.temperature, 4);
  assert.equal(snow.rain, 2);
  assert.equal(snow.snowfall, 1.4);
  assert.equal(snow.liquidPrecipitation, 0);
  data.current.rain = 0.2;
  const mixed = parseModelWeather(data, now);
  assert.equal(mixed.precipitationType, "mixed");
  assert.equal(mixed.liquidPrecipitation, 0.8);
  data.current.temperature_2m = -2;
  data.current.snowfall = 0;
  data.current.weather_code = 66;
  assert.equal(parseModelWeather(data, now).precipitationType, "freezing-rain");
  data.current.weather_code = 63;
  assert.equal(parseModelWeather(data, now).precipitationType, "rain");
  data.current.weather_code = 96;
  assert.equal(parseModelWeather(data, now).precipitationType, "hail");
});

test("missing or incompatible optional units are unknown, not manufactured zero snow", () => {
  const data = modelData();
  delete data.current.weather_code;
  delete data.current.rain;
  delete data.current.showers;
  data.current.snowfall = null;
  data.current_units.visibility = "feet";
  data.current.relative_humidity_2m = 105;
  const result = parseModelWeather(data, now);
  assert.equal(result.snowfall, undefined);
  assert.equal(result.liquidPrecipitation, undefined);
  assert.equal(result.precipitationType, "unknown");
  assert.equal(result.visibility, undefined);
  assert.equal(result.humidity, undefined);
  assert.equal(result.fieldSources?.snowfall, undefined);
  data.current_units.temperature_2m = "°F";
  assert.throws(() => parseModelWeather(data, now), /jednotky/);
});

test("high cloud wind uses 300 hPa and incomplete vectors fall back as a coherent surface pair", () => {
  const data = modelData(),
    model = parseModelWeather(data, now);
  assert.deepEqual(model.cloudWinds?.high, { speed: 42, direction: 265 });
  assert.deepEqual(model.cloudWinds?.mid, { speed: 22, direction: 240 });
  assert.match(model.cloudWindSource!, /850\/500\/300/);
  data.current.wind_direction_300hPa = null;
  const missing = parseModelWeather(data, now);
  assert.deepEqual(missing.cloudWinds?.high, { speed: 3, direction: 270 });
  assert.match(missing.cloudWindSource!, /orientační/);
  data.current.wind_direction_300hPa = 265;
  data.current_units.wind_speed_300hPa = "km/h";
  assert.deepEqual(parseModelWeather(data, now).cloudWinds?.high, {
    speed: 3,
    direction: 270,
  });
});

test("fresh station keeps measurements and receives separately attributed snow, visibility and gust", () => {
  const station = parseStation(stationHtml(), now),
    model = parseModelWeather(modelData(), now);
  const selected = selectWeather(station, model, station, now);
  assert.equal(selected.status, "live");
  assert.equal(selected.sourceKind, "station");
  assert.equal(selected.rain, 1.2);
  assert.equal(selected.wind, 2.1);
  assert.equal(selected.humidity, 82);
  assert.equal(selected.snowfall, 1.4);
  assert.equal(selected.precipitationType, "snow");
  assert.equal(selected.visibility, 1500);
  assert.equal(selected.windGust, 9);
  assert.equal(selected.fieldSources?.humidity?.kind, "station");
  for (const field of [
    "visibility",
    "windGust",
    "snowfall",
    "precipitationType",
  ] as const) {
    assert.equal(selected.fieldSources?.[field]?.kind, "model");
    assert.equal(selected.fieldSources?.[field]?.observedAt, now);
    assert.equal(selected.fieldSources?.[field]?.stale, false);
  }
  const invalidHumidity = parseStation(stationHtml(undefined, "101"), now);
  assert.equal(invalidHumidity.humidity, undefined);
  const supplemented = selectWeather(invalidHumidity, model, station, now);
  assert.equal(supplemented.humidity, 94);
  assert.equal(supplemented.fieldSources?.humidity?.kind, "model");
});

test("dry model cannot suppress observed station rain and old model supplements are never relabelled live", () => {
  const station = parseStation(stationHtml(), now),
    data = modelData();
  Object.assign(data.current, {
    rain: 0,
    showers: 0,
    snowfall: 0,
    precipitation: 0,
    weather_code: 3,
  });
  const dry = selectWeather(
    station,
    parseModelWeather(data, now),
    station,
    now,
  );
  assert.equal(dry.rain, 1.2);
  assert.equal(dry.precipitationType, "unknown");
  assert.match(dry.fieldSources?.precipitationType?.source ?? "", /neznámé/);
  const staleModel = parseModelWeather(data, now + 61 * 60000);
  const fresh = selectWeather(station, staleModel, dry, now);
  assert.equal(fresh.snowfall, undefined);
  assert.equal(fresh.visibility, undefined);
  assert.equal(fresh.cloudStale, true);
});

test("stale and future station pages never have live status", () => {
  assert.equal(
    parseStation(stationHtml(), now + 31 * 60000).status,
    "fallback",
  );
  assert.equal(parseStation(stationHtml(), now - 6 * 60000).status, "fallback");
  const old = parseStation(stationHtml("2026-10-12 10:00:00"), now);
  const newer = parseModelWeather(modelData(), now);
  const retained = selectWeather(old, null, newer, now + 60000);
  assert.equal(retained.observedAt, now);
  assert.equal(retained.sourceKind, "model");
  assert.equal(retained.stale, true);
  assert.equal(retained.fieldSources?.snowfall?.stale, true);
});

test("cache hits age station and model fields separately without extra requests or mutating past snapshots", async () => {
  let instant = now,
    calls = 0;
  const data = modelData();
  data.current.time = (now - 58 * 60000) / 1000;
  const provider = createWeatherProvider({
    now: () => instant,
    fetch: (async (url) => {
      calls++;
      return String(url).includes("weather.sh")
        ? new Response(stationHtml("2026-10-12 13:31:00"))
        : new Response(JSON.stringify(data));
    }) as typeof fetch,
  });
  const first = await provider();
  assert.equal(first.stale, false);
  assert.equal(first.cloudStale, false);
  assert.equal(first.fieldSources?.humidity?.stale, false);
  instant += 90 * 1000;
  const agedStation = await provider();
  assert.equal(agedStation.status, "fallback");
  assert.equal(agedStation.stale, true);
  assert.equal(agedStation.cloudStale, false);
  assert.equal(agedStation.fieldSources?.humidity?.stale, true);
  assert.equal(agedStation.fieldSources?.snowfall?.stale, false);
  instant += 60000;
  const agedModel = await provider();
  assert.equal(agedModel.cloudStale, true);
  assert.equal(agedModel.fieldSources?.snowfall?.stale, true);
  assert.equal(first.fieldSources?.snowfall?.stale, false);
  assert.equal(first.fieldSources?.humidity?.stale, false);
  assert.equal(first.stale, false);
  assert.equal(calls, 2);
});

test("provider requests documented current fields, coalesces requests and recovers after unavailable cache", async () => {
  let instant = now,
    online = false,
    calls = 0;
  const provider = createWeatherProvider({
    now: () => instant,
    fetch: (async (url) => {
      calls++;
      if (String(url).includes("weather.sh") || !online)
        throw new Error("offline");
      const request = new URL(String(url));
      assert.equal(request.searchParams.get("wind_speed_unit"), "ms");
      assert.equal(request.searchParams.get("temperature_unit"), "celsius");
      const fields = request.searchParams.get("current")!.split(",");
      for (const name of [
        "weather_code",
        "rain",
        "showers",
        "snowfall",
        "visibility",
        "wind_speed_300hPa",
        "wind_speed_500hPa",
        "wind_speed_850hPa",
      ])
        assert.ok(fields.includes(name), name);
      const data = modelData();
      data.current.time = instant / 1000;
      return new Response(JSON.stringify(data));
    }) as typeof fetch,
  });
  const [a, b] = await Promise.all([provider(), provider()]);
  assert.equal(a, b);
  assert.equal(a.status, "unavailable");
  assert.equal(calls, 2);
  instant += 6 * 60000;
  online = true;
  const recovered = await provider();
  assert.equal(recovered.stale, false);
  assert.equal(recovered.fieldSources?.visibility?.stale, false);
  instant += 6 * 60000;
  online = false;
  const failed = await provider();
  assert.equal(failed.stale, true);
  assert.equal(failed.fieldSources?.visibility?.stale, true);
  assert.equal(recovered.fieldSources?.visibility?.stale, false);
  assert.equal(calls, 6);
});
