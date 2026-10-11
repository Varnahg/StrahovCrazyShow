import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  applyArtLighting,
  sampleArtLighting,
  type ArtLightingInput,
  type ArtLightingContext,
} from "../client/art-lighting";

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  for (let i = 0; i < 64; i++) new Mesh("registered object " + i, scene);
  const lights = Array.from({ length: 6 }, (_, i) => {
    const light = new PointLight(
      "mapped lamp " + i,
      new Vector3(i * 10, 4, 0),
      scene,
    );
    light.setEnabled(false);
    return light;
  });
  const context: ArtLightingContext = {
    scene,
    lights,
    sun: new DirectionalLight("sun", Vector3.Down(), scene),
    ambient: new HemisphericLight("ambient", Vector3.Up(), scene),
    lamps: new StandardMaterial("emissive fixtures", scene),
    clouds: [],
    quality: "low",
  };
  const input: ArtLightingInput = {
    dt: 0.1,
    instant: Date.parse("2026-10-11T10:00:00Z"),
    sun: { x: 0.2, y: 0.7, z: 0.6, altitude: 0.5, daylight: 1 },
    weather: { cloud: 0.4, rain: 0, wind: 0 },
    player: { x: 0, y: 0, z: 0 },
  };
  applyArtLighting(context, input);
  let scans = 0;
  for (const mesh of scene.meshes) {
    const resync = mesh._resyncLightSource;
    mesh._resyncLightSource = function (light) {
      scans++;
      return resync.call(this, light);
    };
  }
  const run = (next = input, frames = 10) => {
    for (let i = 0; i < frames; i++) applyArtLighting(context, next);
  };
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return {
    context,
    input,
    lights,
    run,
    scans: () => scans,
    enabled: () => lights.flatMap((light, i) => (light.isEnabled() ? [i] : [])),
  };
}

test("Babylon Light override still scans identical toggles but steady ArtLighting no longer does", (t) => {
  const { context, lights, run, scans } = fixture(t);
  const visitsBefore = scans();
  lights[0].setEnabled(false);
  assert.equal(
    scans(),
    visitsBefore + context.scene.meshes.length,
    "actual pinned Light override must demonstrate a visit of every registered mesh",
  );
  const before = scans();
  run();
  assert.equal(
    scans(),
    before,
    "day/low must not resync every registered mesh for already disabled lamps",
  );
  assert.ok(
    lights.every((light) => !light.isEnabled() && light.intensity === 0),
  );
  assert.equal(
    context.scene.lights.length,
    8,
    "no lamp or light was removed to save work",
  );
});

test("lamp guard retains exact two-nearest night states, movement, quality and new-mesh lighting", (t) => {
  const { context, input, lights, run, scans, enabled } = fixture(t);
  context.quality = "high";
  const night = {
    ...input,
    sun: { ...input.sun, altitude: -0.25, daylight: 0 },
  };
  run(night);
  assert.deepEqual(enabled(), [0, 1]);
  const expectedIntensity = sampleArtLighting(-0.25, 0.4, 0).night * 0.7;
  for (const i of enabled())
    assert.equal(lights[i].intensity, expectedIntensity);
  const steady = scans();
  run(night);
  assert.equal(
    scans(),
    steady,
    "enabled stable lamps also skip full-scene resync",
  );
  const late = new Mesh("late asynchronously added geometry", context.scene);
  assert.ok(
    late.lightSources.includes(lights[0]) &&
      late.lightSources.includes(lights[1]),
    "Scene.addMesh must still attach already enabled lights without forced global toggles",
  );
  const moved = { ...night, player: { x: 49, y: 0, z: 0 } };
  run(moved);
  assert.deepEqual(enabled(), [4, 5]);
  context.quality = "low";
  run(moved);
  assert.deepEqual(
    enabled(),
    [5],
    "low retains its closest real practical lamp",
  );
  const steadyLow = scans();
  run(moved);
  assert.equal(scans(), steadyLow, "steady low night also skips resync");
  context.quality = "medium";
  run(moved);
  assert.deepEqual(enabled(), [4, 5]);
  run(input);
  assert.deepEqual(
    enabled(),
    [],
    "sunrise disables both previously active lamps",
  );
  assert.ok(lights.every((light) => light.intensity === 0));
});

test("lamp guard compares requested own state beneath an inactive parent and preserves parent reactivation", (t) => {
  const { context, input, lights, run, scans } = fixture(t);
  const parent = new TransformNode(
    "temporarily inactive lamp parent",
    context.scene,
  );
  parent.setEnabled(false);
  lights[0].parent = parent;
  context.quality = "high";
  const night = {
    ...input,
    sun: { ...input.sun, altitude: -0.25, daylight: 0 },
  };
  run(night);
  assert.equal(lights[0].isEnabled(false), true);
  assert.equal(lights[0].isEnabled(), false);
  const before = scans();
  run(night);
  assert.equal(
    scans(),
    before,
    "effective false must not cause a repeated request of own=true",
  );
  parent.setEnabled(true);
  assert.equal(lights[0].isEnabled(), true);
  const late = new Mesh("geometry after parent reactivation", context.scene);
  assert.ok(late.lightSources.includes(lights[0]));
});
