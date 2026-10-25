import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createAtmosphereSky } from "../client/atmosphere-sky";
import {
  applyArtLighting,
  applyCloudTransmission,
  sampleArtLighting,
} from "../client/art-lighting";

test("per-body mask modulates solar and lunar direct light independently without replacing cached colours", () => {
  const day = sampleArtLighting(0.7, 0.8, 0, -0.3, 1);
  const colour = day.key,
    solarColour = day.solarKey;
  applyCloudTransmission(day, 1, 0);
  assert.ok(
    day.sunlight > 0.8,
    "sun through a gap is not globally darkened twice",
  );
  applyCloudTransmission(day, 0, 1);
  assert.equal(day.sunlight, 0);
  assert.equal(day.keySource, "none");
  assert.equal(day.key, colour);
  assert.equal(day.solarKey, solarColour);
  const night = sampleArtLighting(-0.6, 0.8, 0, 0.7, 1);
  applyCloudTransmission(night, 0, 1);
  assert.equal(night.keySource, "moon");
  const clearMoon = night.moonlight;
  applyCloudTransmission(night, 1, 0.25);
  assert.equal(night.sunlight, 0);
  assert.equal(night.moonlight, clearMoon * 0.25);
});

test("live lighting consumes the current cloud frame and retains smooth drift, frozen-preview animation and disposal", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const atmosphere = createAtmosphereSky(scene, "low");
  const transmission = atmosphere.lightTransmission;
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
    instant: Date.UTC(2026, 9, 25, 10),
    dt: 1 / 60,
    sun: { x: 0, y: 1, z: 0, altitude: Math.PI / 2, daylight: 1 },
    moon: { x: 0, y: -1, z: 0, altitude: -Math.PI / 2, fraction: 1 },
    player: { x: 0, y: 0, z: 0 },
    atmosphere,
    weather: {
      cloud: 1,
      rain: 0,
      wind: 10,
      windDirection: 270,
      cloudLayers: { low: 1, mid: 0, high: 0 },
    },
  };
  try {
    const covered = applyArtLighting(context, input);
    assert.equal(covered.sunCloudTransmission, 0);
    assert.equal(context.sun.intensity, 0);
    assert.equal(context.sun.isEnabled(), false);
    const before = atmosphere.material.serialize();
    const textures = scene.textures.slice();
    input.weather.cloudLayers.low = 0;
    let previous = covered.sunCloudTransmission;
    for (let frame = 0; frame < 1800; frame++) {
      const result = applyArtLighting(context, input);
      assert.equal(
        result.sunCloudTransmission,
        atmosphere.lightTransmission.sun,
      );
      assert.equal(
        context.sun.intensity,
        result.clearSunlight * atmosphere.lightTransmission.sun,
      );
      assert.ok(
        Math.abs(previous - result.sunCloudTransmission) < 0.25,
        "coverage change is gradual",
      );
      previous = result.sunCloudTransmission;
    }
    assert.ok(context.sun.intensity > 0.9);
    assert.equal(context.sun.isEnabled(), true);
    assert.equal(atmosphere.lightTransmission, transmission);
    assert.deepEqual(scene.textures, textures);
    const after = atmosphere.material.serialize();
    assert.notDeepEqual(
      after.vectors2.atmosphereTwinkle,
      before.vectors2.atmosphereTwinkle,
    );
    assert.deepEqual(
      after.matrices3x3.worldToCatalog,
      before.matrices3x3.worldToCatalog,
    );
    for (const phase of after.vectors2.atmosphereTwinkle)
      assert.ok(phase >= 0 && phase < 2 * Math.PI);
    // Exactly one drift update per frame, even while instant is frozen.
    const delta =
      after.vectors2.atmosphereLowOffset[0] -
      before.vectors2.atmosphereLowOffset[0];
    assert.ok(Math.abs(delta + (1800 * input.dt * 10) / 4000) < 1e-10);
  } finally {
    atmosphere.dispose();
    scene.dispose();
    engine.dispose();
  }
});
