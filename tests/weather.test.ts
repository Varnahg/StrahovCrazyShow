import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  horizontalDirection,
  moonState,
  parseStation,
  pragueStationInstant,
  sunState,
  windVector,
} from "../shared/weather";
import {
  createWeatherProvider,
  parseModelWeather,
  selectWeather,
} from "../server/weather";
import { moonDiscLightVector } from "../client/sky-weather";
import { sampleArtLighting } from "../client/art-lighting";
import { applyArtLighting } from "../client/art-lighting";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const now = Date.parse("2026-10-10T16:00:00Z");
const fixture = (stamp = "2026-10-10 18:00:00") =>
  `<tr><td>Teplota:</td><td>12.0&nbsp;°C</td></tr><tr><td>Charakter v&#283;tru:</td><td>ESE<br>2.1 m/s</td></tr><tr><td>Intenzita de&#353;t&#283;:</td><td>1.2 mm/h</td></tr>${stamp} fc-icon-partlycloudy`;
const modelData = () => ({
  current_units: { wind_speed_10m: "m/s", precipitation: "mm" },
  current: {
    time: now / 1000,
    interval: 900,
    temperature_2m: 13,
    wind_speed_10m: 3,
    wind_direction_10m: 270,
    precipitation: 0.5,
    cloud_cover: 85,
    cloud_cover_low: 20,
    cloud_cover_mid: 80,
    cloud_cover_high: 45,
    wind_speed_850hPa: 12,
    wind_direction_850hPa: 225,
    wind_speed_500hPa: 18,
    wind_direction_500hPa: 250,
    wind_speed_300hPa: 25,
    wind_direction_300hPa: 265,
    snowfall: 0.1,
  },
});

test("station leaf-cell parser preserves every published readout without treating indoor or daily wind as current", () => {
  const row = (label: string, value: string, malformed = false) =>
    `${malformed ? "" : "<tr>"}<td><strong>${label}</strong></td><td>${value}</td></tr>`;
  const html = `<table><tr><td><table>${row("Teplota:", "4.2 °C")}${row("Charakter větru:", "E<br>2.2 m/s (8.0 km/h)")}${row("Intenzita deště:", "0.00 mm/h")}${row("Rosný bod:", "1.9 °C")}${row("Relativní vlhkost:", "85 %")}${row("Tlak vzduchu:", "1018.1 hPa, tendence -")}${row("Intenzita slunečního záření:", "0 W/m<sup>2</sup>")}${row("Dnešní srážky:", "1.8 mm", true)}${row("Vítr (maximum):", "11.2 m/s v 12:01")}${row("Základna oblačnosti:", "287 m (nad stanicí)")}<h3>Serverovna</h3>${row("Teplota:", "21.7 °C")}</table></td></tr></table>2026-10-10 18:00:00<img src="fc-icon-partlycloudy.gif">`;
  const station = parseStation(html, now);
  assert.equal(station.temperature, 4.2);
  assert.equal(station.wind, 2.2);
  assert.equal(station.windGust, undefined);
  assert.equal(station.dewPoint, 1.9);
  assert.equal(station.pressure, 1018.1);
  assert.equal(station.solarRadiation, 0);
  assert.equal(station.rainToday, 1.8);
  assert.equal(station.stationForecastIcon, "partlycloudy");
  assert.equal(
    station.stationReadings?.find((row) => row.kind === "indoor")?.value,
    "21.7 °C",
  );
  assert.equal(
    station.stationReadings?.find((row) => row.label === "Základna oblačnosti:")
      ?.kind,
    "derived",
  );
  assert.equal(station.fieldSources?.rainToday?.kind, "station");
  assert.equal(station.visibility, undefined);
  assert.equal(station.precipitationType, undefined);
  assert.equal(station.snowfall, undefined);
});

test("station section identity, not temperature row order, separates the server room", () => {
  const indoor = '<center><strong>Serverovna</strong></center><tr><td>Teplota:</td><td>21.8 °C</td></tr><tr><td>Relativní vlhkost:</td><td>40 %</td></tr>';
  const outdoor = '<center><strong>Aktuální podmínky</strong></center>' + fixture() + '<tr><td>Relativní vlhkost:</td><td>85 %</td></tr>';
  for (const html of [outdoor + indoor, indoor + outdoor]) {
    const weather = parseStation(html, now);
    assert.equal(weather.temperature, 12);
    assert.equal(weather.humidity, 85);
    assert.deepEqual(weather.stationReadings?.filter(r => r.kind === "indoor").map(r => r.value), ["21.8 °C", "40 %"]);
  }
  assert.throws(() => parseStation(outdoor.replace("Teplota:", "Neplatný údaj:") + indoor, now));
  assert.throws(() => parseStation(outdoor.replace("12.0&nbsp;°C", "---") + indoor, now));
  assert.throws(() => parseStation(outdoor + '<tr><td>Teplota:</td><td>22 °C</td></tr>', now), "Ambiguous outdoor readings cannot choose a temperature by order");
});

test("captured station HTML never promotes Serverovna after an outdoor sensor row disappears", (t) => {
  const path = new URL("../.cache/weather-sky-revision-20261024/station.html", import.meta.url);
  if (!existsSync(path)) { t.skip("Local primary station capture unavailable; section fixture remains mandatory"); return; }
  const html = readFileSync(path, "utf8"), capturedAt = Date.parse("2026-10-24T22:09:37Z");
  const station = parseStation(html, capturedAt);
  assert.equal(station.temperature, 4.2);
  assert.equal(station.stationReadings?.length, 30);
  assert.equal(station.stationReadings?.find(r => r.kind === "indoor")?.value, "21.8 °C");
  const missingOutdoor = html.replace("<strong>Teplota:</strong>", "<strong>Teplota senzoru chybí:</strong>");
  assert.notEqual(missingOutdoor, html);
  assert.throws(() => parseStation(missingOutdoor, capturedAt));
});

test("model WMO fog/thunder codes and sources survive station merge and stale retention", () => {
  const station = parseStation(fixture(), now);
  for (const weatherCode of [
    0, 3, 45, 48, 51, 56, 66, 77, 82, 86, 95, 96, 97, 99,
  ]) {
    const data = modelData();
    Object.assign(data.current, { weather_code: weatherCode });
    const model = parseModelWeather(data, now);
    assert.equal(model.weatherCode, weatherCode);
    assert.equal(model.fieldSources?.weatherCode?.kind, "model");
    const merged = selectWeather(station, model, station, now);
    assert.equal(merged.weatherCode, weatherCode);
    assert.equal(merged.fieldSources?.weatherCode?.kind, "model");
    const retained = selectWeather(null, null, merged, now + 2 * 3600000);
    assert.equal(retained.weatherCode, weatherCode);
    assert.equal(retained.fieldSources?.weatherCode?.stale, true);
  }
});

test("station lunar phase is a time-stamped published calculation, separate from the renderer instant", () => {
  const station = parseStation(
    fixture() + "<br>Fáze m&#283;síce: Dor&#367;stá - 98% úpl&#328;ku<br>",
    now,
  );
  assert.equal(station.stationAstronomy?.kind, "calculation");
  assert.equal(station.stationAstronomy?.publishedAt, now);
  assert.equal(station.stationAstronomy?.illuminatedPercent, 98);
  assert.equal(station.stationAstronomy?.waxing, true);
  assert.match(station.stationAstronomy?.moonPhaseLabel ?? "", /Dorůstá/);
  assert.equal(station.fieldSources?.precipitationType, undefined);
  assert.equal(parseStation(fixture(), now).stationAstronomy, undefined);
});

test("astronomy and meteorological bearings agree with north/east/south/west of the campus", () => {
  const cardinal = [
    [0, 0, -1],
    [90, 1, 0],
    [180, 0, 1],
    [270, -1, 0],
  ];
  for (const [bearing, x, z] of cardinal) {
    const direction = horizontalDirection(bearing),
      wind = windVector(7, bearing);
    assert.ok(Math.abs(direction.x - x) < 1e-10);
    assert.ok(Math.abs(direction.z - z) < 1e-10);
    assert.ok(Math.abs(wind.x + x * 7) < 1e-10);
    assert.ok(Math.abs(wind.z + z * 7) < 1e-10);
  }
  assert.deepEqual(windVector(Infinity, NaN), { x: -0, z: 0 });
});

test("Prague sun rises east, sets west, and its winter arc is much lower", () => {
  const summer = sunState(Date.parse("2026-06-21T11:00:00Z")),
    winter = sunState(Date.parse("2026-12-21T11:00:00Z"));
  assert.ok(summer.altitude > winter.altitude + 0.7);
  assert.ok(summer.altitude > 1 && winter.altitude < 0.35);
  assert.ok(sunState(Date.parse("2026-06-21T05:00:00Z")).x > 0);
  assert.ok(sunState(Date.parse("2026-06-21T17:00:00Z")).x < 0);
  for (const body of [summer, winter, moonState(now)])
    assert.ok(Math.abs(Math.hypot(body.x, body.y, body.z) - 1) < 1e-12);
});

test("October 2026 lunar illumination follows independent USNO primary-phase instants", () => {
  // https://aa.usno.navy.mil/calculated/moon/phases?date=2026-10-01&format=p&nump=6
  const fresh = moonState(Date.parse("2026-10-10T15:50:00Z")),
    quarter = moonState(Date.parse("2026-10-18T16:12:00Z")),
    full = moonState(Date.parse("2026-10-26T04:12:00Z")),
    last = moonState(Date.parse("2026-11-01T20:28:00Z"));
  assert.ok(fresh.fraction < 0.003);
  assert.ok(full.fraction > 0.997);
  assert.ok(Math.abs(quarter.fraction - 0.5) < 0.01);
  assert.ok(Math.abs(last.fraction - 0.5) < 0.01);
  assert.ok(Math.abs(quarter.phase - 0.25) < 0.002);
  assert.ok(Math.abs(last.phase - 0.75) < 0.002);
  assert.ok(quarter.waxing);
  assert.ok(!last.waxing);
  for (const moon of [fresh, quarter, full, last])
    assert.ok(moon.angularDiameter > 0.008 && moon.angularDiameter < 0.011);
});

test("projected moon terminator preserves illuminated area instead of changing a disc's opacity", () => {
  for (const fraction of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const light = moonDiscLightVector(fraction, 0.83);
    let total = 0,
      lit = 0;
    for (let ix = 0; ix < 300; ix++)
      for (let iy = 0; iy < 300; iy++) {
        const x = (ix + 0.5) / 150 - 1,
          y = (iy + 0.5) / 150 - 1,
          r2 = x * x + y * y;
        if (r2 > 1) continue;
        total++;
        if (x * light.x + y * light.y + Math.sqrt(1 - r2) * light.z > 0) lit++;
      }
    assert.ok(
      Math.abs(lit / total - fraction) < 0.002,
      `${fraction}: ${lit / total}`,
    );
  }
  assert.equal(sampleArtLighting(-0.6, 0, 0, 0.5, 0).moonlight, 0);
  assert.ok(
    sampleArtLighting(-0.6, 0, 0, 0.5, 0.25).moonlight <
      sampleArtLighting(-0.6, 0, 0, 0.5, 1).moonlight,
  );
});

test("lunar bright limb faces the sun in the observer's local sky", () => {
  for (const stamp of [
    "2026-10-18T18:00:00Z",
    "2026-10-25T18:00:00Z",
    "2026-11-02T02:00:00Z",
  ]) {
    const s = sunState(Date.parse(stamp)),
      m = moonState(Date.parse(stamp)),
      norm = Math.hypot(m.x, m.z),
      right = { x: -m.z / norm, z: m.x / norm },
      up = {
        x: -right.z * m.y,
        y: right.z * m.x - right.x * m.z,
        z: right.x * m.y,
      },
      px = s.x * right.x + s.z * right.z,
      py = s.x * up.x + s.y * up.y + s.z * up.z,
      angle = moonDiscLightVector(0.5, m.brightLimbAngle);
    const alignment = (angle.x * px + angle.y * py) / Math.hypot(px, py);
    assert.ok(alignment > 0.999, `${stamp}: ${alignment}`);
  }
});

test("station local clock handles summer, winter, repeated DST hour and rejects nonexistent time", () => {
  assert.equal(pragueStationInstant("2026-10-10 18:00:00", now), now);
  assert.equal(
    pragueStationInstant(
      "2026-12-10 18:00:00",
      Date.parse("2026-12-10T17:00:00Z"),
    ),
    Date.parse("2026-12-10T17:00:00Z"),
  );
  for (const instant of ["2026-10-25T00:30:00Z", "2026-10-25T01:30:00Z"])
    assert.equal(
      pragueStationInstant("2026-10-25 02:30:00", Date.parse(instant)),
      Date.parse(instant),
    );
  assert.equal(pragueStationInstant("2026-03-29 02:30:00", now), null);
  assert.throws(() =>
    parseStation(fixture().replace("1.2 mm/h", "missing"), now),
  );
});

test("weather fallback converts current interval sums and distinguishes wind aloft", () => {
  const model = parseModelWeather(modelData(), now);
  assert.equal(model.rain, 2);
  assert.equal(model.snowfall, 0.4);
  assert.equal(model.status, "fallback");
  assert.equal(model.wind, 3);
  assert.equal(model.cloudWinds?.low.speed, 12);
  assert.equal(model.cloudWinds?.high.direction, 265);
  assert.equal(model.cloudLayers?.mid, 0.8);
  const station = parseStation(fixture(), now),
    selected = selectWeather(station, model, station, now);
  assert.equal(selected.wind, 2.1);
  assert.equal(selected.rain, 1.2);
  assert.equal(selected.temperature, 12);
  assert.equal(selected.cloud, 0.85);
  assert.equal(selected.status, "live");
  assert.equal(selected.cloudObservedAt, now);
  const malformed = modelData();
  malformed.current.interval = 0;
  assert.throws(() => parseModelWeather(malformed, now));
  const wrongUnits = modelData();
  wrongUnits.current_units.wind_speed_10m = "km/h";
  assert.throws(() => parseModelWeather(wrongUnits, now));
});

test("fresh station cannot silently inherit old cloud cover; both failures mark cache stale", async () => {
  const station = parseStation(fixture(), now),
    oldModel = parseModelWeather(modelData(), now + 2 * 3600000);
  const selected = selectWeather(station, oldModel, station, now);
  assert.match(selected.cloudSource, /předpovědi/);
  assert.equal(selected.cloudStale, true);
  let calls = 0,
    instant = now,
    failing = false;
  const provider = createWeatherProvider({
    now: () => instant,
    fetch: (async (url: any) => {
      calls++;
      if (failing) throw new Error("offline");
      if (String(url).includes("weather.sh"))
        throw new Error("station offline");
      return new Response(JSON.stringify(modelData()), { status: 200 });
    }) as typeof fetch,
  });
  const [a, b] = await Promise.all([provider(), provider()]);
  assert.equal(calls, 2);
  assert.equal(a, b);
  assert.equal(a.status, "fallback");
  assert.equal(a.stale, false);
  await provider();
  assert.equal(calls, 2);
  instant += 6 * 60000;
  failing = true;
  const stale = await provider();
  assert.equal(stale.stale, true);
  assert.equal(stale.cloudStale, true);
  assert.equal(stale.observedAt, now);
  assert.equal(calls, 4);
});

test("night windows scale the masked emission texture while walls remain nonemissive", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const facade = new StandardMaterial("masked-window-facade", scene);
  facade.metadata = { nightWindows: true };
  facade.emissiveTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([255, 180, 90, 255]),
    1,
    1,
    scene,
    false,
  );
  facade.emissiveColor.setAll(1); // Reproduce the previous whole-facade emission bug.
  const context = {
    scene,
    sun: new DirectionalLight("sun", Vector3.Down(), scene),
    ambient: new HemisphericLight("ambient", Vector3.Up(), scene),
    lamps: new StandardMaterial("lamps", scene),
    lights: [],
    clouds: [],
    quality: "low",
  };
  const input = {
    sun: { ...sunState(now), altitude: 0.8 },
    weather: { cloud: 0, rain: 0, wind: 0 },
    player: { x: 0, y: 0, z: 0 },
    dt: 1 / 60,
    instant: now,
  };
  applyArtLighting(context, input);
  assert.equal(facade.emissiveTexture.level, 0);
  assert.deepEqual(facade.emissiveColor.asArray(), [0, 0, 0]);
  input.sun.altitude = -0.6;
  input.instant = Date.parse("2026-10-10T20:00:00Z");
  applyArtLighting(context, input);
  assert.ok(
    facade.emissiveTexture.level > 0.3 && facade.emissiveTexture.level < 0.7,
  );
  assert.deepEqual(facade.emissiveColor.asArray(), [0, 0, 0]);
  scene.dispose();
  engine.dispose();
});
