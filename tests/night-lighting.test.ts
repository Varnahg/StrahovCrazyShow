import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { sunState, moonState } from "../shared/weather";
import { applyArtLighting, sampleArtLighting } from "../client/art-lighting";
import { SkyWeatherController } from "../client/sky-weather";
import {
  campusEnvironmentIntensity,
  applyCampusSkyIntensity,
  solarShadowsEnabled,
} from "../client/cinematic";

const reportedNight = Date.parse("2026-10-11T00:00:00Z");
const radians = (degrees: number) => (degrees * Math.PI) / 180;

test("02:00 Prague on 11 October is an astronomical, almost new-moon night", () => {
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(reportedNight);
  assert.equal(local, "02:00");
  const sun = sunState(reportedNight),
    moon = moonState(reportedNight);
  assert.ok(Math.abs(sun.altitude - radians(-43.916220488)) < 1e-8);
  assert.ok(Math.abs(moon.altitude - radians(-50.243260702)) < 1e-8);
  assert.equal(sun.daylight, 0);
  assert.ok(moon.fraction < 0.003);
  for (const cloud of [0, 1]) {
    const sample = sampleArtLighting(
      sun.altitude,
      cloud,
      0,
      moon.altitude,
      moon.fraction,
    );
    assert.equal(sample.sunlight, 0);
    assert.equal(sample.moonlight, 0);
    assert.equal(sample.twilight, 0);
    assert.equal(sample.day, 0);
    assert.ok(sample.ambientIntensity <= 0.018);
    assert.ok(sample.cloudEmission <= 0.004);
    assert.ok(
      sample.horizon.r < 0.07 &&
        sample.horizon.g < 0.1 &&
        sample.horizon.b < 0.13,
    );
  }
});

test("night lunar lighting requires a known lit phase above the horizon and clouds attenuate it", () => {
  const at = (altitude: number, fraction?: number, cloud = 0) =>
    sampleArtLighting(-0.8, cloud, 0, altitude, fraction).moonlight;
  assert.equal(at(-0.01, 1), 0);
  assert.equal(at(0, 1), 0);
  assert.equal(at(0.7, 0), 0);
  assert.equal(
    at(0.7),
    0,
    "missing phase cannot silently stand for a full moon",
  );
  const quarter = at(0.7, 0.5),
    full = at(0.7, 1);
  assert.ok(full > 0 && full <= 0.035);
  assert.ok(quarter < full * 0.25);
  assert.ok(at(0.7, 1, 1) < full * 0.2);
  assert.ok(at(0.02, 1) < full * 0.05);
  assert.equal(sampleArtLighting(0.7, 0, 0, 0.7, 1).moonlight, 0);
});

test("twilight is continuous to -18 degrees and daytime overcast still has useful diffuse fill", () => {
  let previous = 0;
  for (let i = -900; i <= 700; i++) {
    const altitude = i / 1000,
      sample = sampleArtLighting(altitude, 0.4, 0);
    assert.ok(
      sample.ambientIntensity >= previous - 1e-12,
      "ambient rises monotonically with sun altitude",
    );
    previous = sample.ambientIntensity;
  }
  assert.equal(sampleArtLighting(radians(-18.01), 0, 0).twilight, 0);
  assert.ok(sampleArtLighting(radians(-17), 0, 0).twilight > 0);
  const day = sampleArtLighting(0.7, 0, 0),
    night = sampleArtLighting(-0.8, 0, 0);
  assert.ok(night.ambientIntensity < day.ambientIntensity / 30);
  assert.ok(night.cloudEmission < day.cloudEmission / 100);
  assert.ok(
    sampleArtLighting(0.7, 1, 0).ambientIntensity > day.ambientIntensity,
  );
});

test("actual Babylon scene gets dark sky, zero celestial key, retained local lamps and masked room lights", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  const camera = new FreeCamera("observer", new Vector3(110, 2, 12), scene);
  scene.activeCamera = camera;
  const sun = new DirectionalLight("celestial key", Vector3.Down(), scene);
  const ambient = new HemisphericLight("sky fill", Vector3.Up(), scene);
  const fixture = new StandardMaterial("fixtures", scene);
  const clouds = new StandardMaterial("art:clouds", scene);
  clouds.disableLighting = true;
  const windows = new StandardMaterial("room mask", scene);
  windows.metadata = { nightWindows: true };
  windows.emissiveTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([255, 180, 90, 255]),
    1,
    1,
    scene,
  );
  const lamps = [0, 10, 20].map((offset) => {
    const lamp = new PointLight(
      "mapped practical lamp",
      new Vector3(110 + offset, 4, 12),
      scene,
    );
    lamp.range = 18;
    lamp.setEnabled(false);
    return lamp;
  });
  const sky = new SkyWeatherController(scene);
  const celestial = sky.update({
    instant: reportedNight,
    player: camera.position,
    dt: 1 / 60,
    quality: "low",
  });
  const context = {
    scene,
    sun,
    ambient,
    lamps: fixture,
    lights: lamps,
    clouds: [],
    quality: "medium",
  };
  applyArtLighting(context, {
    ...celestial,
    player: camera.position,
    instant: reportedNight,
    dt: 1 / 60,
    weather: { cloud: 0.4, rain: 0, wind: 0 },
  });
  applyCampusSkyIntensity(scene, celestial.sun.daylight);
  assert.equal(sun.intensity, 0);
  assert.equal(
    solarShadowsEnabled(celestial.sun.daylight, sun.direction.y, sun.intensity),
    false,
  );
  assert.ok(ambient.intensity <= 0.018);
  assert.equal(scene.environmentIntensity, campusEnvironmentIntensity(0));
  assert.ok(
    scene.imageProcessingConfiguration.exposure < 1.2,
    "exposure cannot conceal the scene-light bug",
  );
  assert.equal(scene.getMeshByName("astronomical sun")!.isEnabled(), false);
  assert.equal(scene.getMeshByName("astronomical moon")!.isEnabled(), false);
  assert.ok(clouds.emissiveColor.b < 0.005);
  assert.equal(clouds.useEmissiveAsIllumination, true);
  assert.deepEqual(windows.emissiveColor.asArray(), [0, 0, 0]);
  assert.ok(windows.emissiveTexture.level > 0.3);
  assert.equal(lamps.filter((lamp) => lamp.isEnabled()).length, 2);
  assert.ok(lamps[0].intensity > 0 && lamps[2].intensity === 0);
  sky.dispose();
  scene.dispose();
  engine.dispose();
});
