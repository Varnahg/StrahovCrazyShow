import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import {
  applyArtLighting,
  type ArtLightingInput,
} from "../client/art-lighting";
import { VehicleLighting } from "../client/vehicle-lighting";
import { sunState, moonState } from "../shared/weather";

const dark = Date.parse("2026-10-11T00:00:00Z");
const fullMoon = Date.parse("2026-10-26T04:12:00Z");
const dusk = Date.parse("2026-10-11T16:10:00Z");
const day = Date.parse("2026-10-11T10:00:00Z");

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.activeCamera = new FreeCamera(
    "budget observer",
    new Vector3(0, 2, -8),
    scene,
  );
  const object = MeshBuilder.CreateBox("real four-slot receiver", {}, scene);
  const material = new PBRMaterial("fixed four-light PBR", scene);
  material.maxSimultaneousLights = 4;
  object.material = material;
  const sun = new DirectionalLight("celestial key", Vector3.Down(), scene);
  const ambient = new HemisphericLight("hemisphere", Vector3.Up(), scene);
  const lights = [0, 10, 20].map((x, i) => {
    const light = new PointLight("street " + i, new Vector3(x, 4, 0), scene);
    light.range = 22;
    light.setEnabled(false);
    return light;
  });
  const interior = new PointLight(
    "actual B6 fill",
    new Vector3(0, 2, 2),
    scene,
  );
  interior.range = 14;
  interior.setEnabled(false);
  const vehicle = new VehicleLighting(scene),
    root = new TransformNode("physical car", scene);
  const context = {
    scene,
    sun,
    ambient,
    lights,
    quality: "high",
    lamps: new StandardMaterial("lamp fixtures", scene),
    clouds: [],
  };
  const input: ArtLightingInput = {
    sun: sunState(dark),
    moon: moonState(dark),
    instant: dark,
    player: { x: 0, y: 0, z: 0 },
    dt: 0.01,
    weather: { cloud: 0, rain: 0, wind: 0 },
  };
  let scans = 0;
  const resync = object._resyncLightSource;
  object._resyncLightSource = function (light) {
    scans++;
    return resync.call(this, light);
  };
  const update = (stamp: number, driving: boolean, interiorOn = false) => {
    input.instant = stamp;
    input.sun = sunState(stamp);
    input.moon = moonState(stamp);
    input.headlightRequested = driving;
    if (interior.isEnabled(false) !== interiorOn)
      interior.setEnabled(interiorOn);
    interior.intensity = interiorOn ? 0.4 : 0;
    input.extraPracticalLightSlots = Number(
      interior.isEnabled() && interior.intensity > 0,
    );
    const sample = applyArtLighting(context, input);
    vehicle.update(root, sample.night, driving, "low");
    const actual = object.lightSources.filter(
      (light) => light.isEnabled() && light.intensity > 0,
    );
    assert.ok(
      actual.length <= material.maxSimultaneousLights,
      `actual light count ${actual.length} at ${new Date(stamp).toISOString()}`,
    );
    assert.equal(
      object.lightSources.length,
      actual.length,
      "zero-intensity sources must be disabled, not consume shader slots",
    );
    if (driving && sample.night > 0.1)
      assert.ok(actual.includes(vehicle.light));
    if (interiorOn) assert.ok(actual.includes(interior));
    assert.equal(material.maxSimultaneousLights, 4);
    return {
      sample,
      actual,
      streets: lights.flatMap((light, i) => (light.isEnabled() ? [i] : [])),
    };
  };
  t.after(() => {
    vehicle.dispose();
    scene.dispose();
    engine.dispose();
  });
  return {
    update,
    context,
    input,
    scans: () => scans,
    vehicle,
    sun,
    ambient,
    interior,
  };
}

test("exact moonless 02:00 reserves headlight and B6 slots without raising the four-light material cap", (t) => {
  const { update, sun } = fixture(t);
  let result = update(dark, false);
  assert.equal(sun.isEnabled(), false);
  assert.deepEqual(result.streets, [0, 1]);
  result = update(dark, true);
  assert.deepEqual(result.streets, [0, 1]);
  assert.equal(result.actual.length, 4);
  result = update(dark, true, true);
  assert.deepEqual(result.streets, [0]);
  assert.equal(result.actual.length, 4);
  assert.deepEqual(update(dark, false, true).streets, [0, 1]);
});

test("lit lunar key reserves one street slot immediately for driving and restores it immediately on exit", (t) => {
  const { update, scans } = fixture(t);
  let result = update(fullMoon, false);
  assert.ok(result.sample.moonlight > 0 && result.sample.sunlight === 0);
  assert.deepEqual(result.streets, [0, 1]);
  result = update(fullMoon, true);
  assert.deepEqual(result.streets, [0]);
  assert.equal(result.actual.length, 4);
  const before = scans();
  for (let frame = 0; frame < 30; frame++) update(fullMoon, true);
  assert.equal(
    scans(),
    before,
    "unchanged reservations must not resync registered meshes",
  );
  assert.deepEqual(update(fullMoon, false).streets, [0, 1]);
});

test("real dusk keeps solar key, hemisphere, B6 and car by reducing street capacity to zero", (t) => {
  const { update, context } = fixture(t);
  let result = update(dusk, false);
  assert.ok(result.sample.sunlight > 0 && result.sample.night > 0.1);
  assert.deepEqual(result.streets, [0, 1]);
  result = update(dusk, true);
  assert.deepEqual(result.streets, [0]);
  result = update(dusk, true, true);
  assert.deepEqual(result.streets, []);
  assert.equal(result.actual.length, 4);
  context.quality = "low";
  assert.deepEqual(update(dusk, true, true).streets, []);
  assert.deepEqual(update(dusk, false, true).streets, [0]);
});

test("daytime car request consumes no beam slot and low quality retains at most one mapped street lamp", (t) => {
  const { update, context, vehicle } = fixture(t);
  const result = update(day, true, true);
  assert.equal(result.sample.night, 0);
  assert.equal(vehicle.light.isEnabled(), false);
  assert.deepEqual(result.streets, []);
  assert.equal(result.actual.length, 3);
  context.quality = "low";
  assert.deepEqual(update(dark, true).streets, [0]);
  assert.deepEqual(update(fullMoon, true, true).streets, []);
});

test("nearest movement retains its half-second cadence while a capacity change immediately refreshes the nearest lamp", (t) => {
  const { update, input } = fixture(t);
  assert.deepEqual(update(fullMoon, false).streets, [0, 1]);
  input.player.x = 19;
  assert.deepEqual(update(fullMoon, false).streets, [0, 1]);
  assert.deepEqual(
    update(fullMoon, true).streets,
    [2],
    "drive reservation changes capacity before the 0.5 s timer",
  );
  input.player.x = 0;
  assert.deepEqual(update(fullMoon, true).streets, [2]);
  for (let frame = 0; frame < 50; frame++) update(fullMoon, true);
  assert.deepEqual(update(fullMoon, true).streets, [0]);
});
