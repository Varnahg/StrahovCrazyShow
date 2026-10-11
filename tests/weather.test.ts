import test from "node:test";
import assert from "node:assert/strict";
import {
  horizontalDirection,
  moonState,
  parseStation,
  pragueStationInstant,
  sunState,
  windVector,
  type Weather,
} from "../shared/weather";
import {
  createWeatherProvider,
  parseModelWeather,
  selectWeather,
} from "../server/weather";
import { cloudPixels, moonDiscLightVector } from "../client/sky-weather";
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
    wind_speed_700hPa: 18,
    wind_direction_700hPa: 250,
    wind_speed_500hPa: 25,
    wind_direction_500hPa: 265,
    snowfall: 0.1,
  },
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

test("cloud mipmap source has transparent borders and detailed nonuniform opacity", () => {
  const pixels = cloudPixels(128, 64),
    alphas = [];
  for (let i = 3; i < pixels.length; i += 4) alphas.push(pixels[i]);
  assert.equal(pixels[3], 0);
  assert.equal(pixels[pixels.length - 1], 0);
  assert.ok(new Set(alphas).size > 100);
  assert.ok(Math.max(...alphas) > 200);
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
