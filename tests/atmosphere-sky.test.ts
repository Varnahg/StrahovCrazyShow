import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import {
  atmosphereNoisePixels,
  atmosphereCloudDensity,
  atmosphereStarPixels,
  atmosphereVisibility,
  createAtmosphereSky,
} from "../client/atmosphere-sky";
import {
  equatorialDirection,
  localSiderealAngle,
  worldToJ2000Matrix,
} from "../shared/astronomy";
import catalog from "../client/data/bright-stars.json";

const j2000 = Date.UTC(2000, 0, 1, 12);
const rad = Math.PI / 180;
function near(a: number, b: number, tolerance = 1e-7) {
  assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);
}

test("USNO sidereal epoch and map axes put rising stars east and the pole north", () => {
  near(localSiderealAngle(j2000, 0) / rad, 280.46061837);
  const siderealHours = localSiderealAngle(j2000) / (15 * rad);
  const rising = equatorialDirection(siderealHours + 6, 0, j2000);
  near(rising.x, 1);
  near(rising.y, 0);
  near(rising.z, 0);
  const pole = equatorialDirection(0, 90, j2000);
  near(pole.x, 0);
  near(pole.y, Math.sin(50.08065 * rad));
  near(pole.z, -Math.cos(50.08065 * rad));
  const next = localSiderealAngle(j2000 + 86164090.5);
  near(next, localSiderealAngle(j2000), 1e-7);
  assert.ok(localSiderealAngle(j2000 + 86400000) > next + 0.017);
});

test("J2000 sky matrix preserves catalog directions and matches independent ERFA precession fixture", () => {
  const matrix = new Float32Array(9);
  const transform = (direction: { x: number; y: number; z: number }) =>
    [0, 1, 2].map(
      (i) =>
        matrix[i] * direction.x +
        matrix[i + 3] * direction.y +
        matrix[i + 6] * direction.z,
    );
  worldToJ2000Matrix(j2000, matrix);
  const [x, y, z] = transform(equatorialDirection(6, 30, j2000));
  near(x, 0);
  near(y, Math.cos(30 * rad));
  near(z, 0.5);
  // ERFA eraPmat76 reference date MJD 50123.9999, source linked in provenance.
  const instant = (2400000.5 + 50123.9999 - 2440587.5) * 86400000;
  const precessed = [
    0.9999995504328351, -0.0008696632209485112, -0.0003779153474950335,
  ];
  const ra = Math.atan2(precessed[1], precessed[0]) / (15 * rad);
  const dec = Math.asin(precessed[2]) / rad;
  worldToJ2000Matrix(instant, matrix);
  const recovered = transform(equatorialDirection(ra, dec, instant));
  near(recovered[0], 1);
  near(recovered[1], 0);
  near(recovered[2], 0);
  // The inverse matrix remains orthonormal at a modern UTC instant.
  worldToJ2000Matrix(Date.parse("2026-10-12T22:00:00Z"), matrix);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      near(
        matrix[i * 3] * matrix[j * 3] +
          matrix[i * 3 + 1] * matrix[j * 3 + 1] +
          matrix[i * 3 + 2] * matrix[j * 3 + 2],
        i === j ? 1 : 0,
      );
});

test("catalog contains real bright stars and baked Gaussian points are nonempty at their coordinates", () => {
  assert.equal(catalog.stars.length, 925);
  assert.equal(catalog.epoch, "J2000.0");
  assert.equal(catalog.license, "CC BY-SA 4.0");
  assert.ok(
    catalog.stars.every((row) => Number(row[0]) !== 0 && Number(row[4]) <= 4.5),
  );
  const pixels = atmosphereStarPixels(1024, 512);
  for (const name of ["Sirius", "Polaris", "Vega", "Betelgeuse"]) {
    const row = catalog.stars.find((row) => row[1] === name);
    assert.ok(row, `${name} present`);
    const x = Math.floor(((Number(row[2]) / 24 + 0.5) % 1) * 1024);
    const y = Math.floor((Number(row[3]) / 180 + 0.5) * 512);
    const index = (y * 1024 + x) * 4;
    assert.ok(
      pixels[index] + pixels[index + 1] + pixels[index + 2] > 35,
      `${name} baked at RA/declination`,
    );
  }
});

test("night visibility respects astronomical twilight and full-moon sky brightening", () => {
  const dark = atmosphereVisibility(-0.4, -1, 0, 0);
  const full = atmosphereVisibility(-0.4, 0.7, 1, 0);
  const below = atmosphereVisibility(-0.4, -0.1, 1, 0);
  const day = atmosphereVisibility(0.6, 0.7, 1, 0);
  assert.equal(dark.stars, 1);
  assert.ok(full.stars < dark.stars * 0.5);
  assert.equal(below.moon, 0);
  assert.equal(day.stars, 0);
  assert.equal(day.moon, 0);
  assert.ok(atmosphereVisibility(-0.13, -1, 0, 0).stars < 0.3);
  assert.ok(atmosphereVisibility(-0.4, -1, 0, 8).stars < 0.21);
  assert.ok(
    atmosphereVisibility(-0.4, 0.7, 1, 0, 360000).moon >
      atmosphereVisibility(-0.4, 0.7, 1, 0, 405000).moon,
  );
});

test("cloud noise has deterministic, periodic variation without image seams", () => {
  const size = 256,
    noise = atmosphereNoisePixels(size);
  assert.deepEqual(noise, atmosphereNoisePixels(size));
  let seam = 0,
    interior = 0,
    rangeMin = 255,
    rangeMax = 0;
  for (let y = 0; y < size; y++) {
    seam += Math.abs(noise[y * size * 4] - noise[(y * size + size - 1) * 4]);
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (x + 1 < size) interior += Math.abs(noise[i] - noise[i + 4]);
      rangeMin = Math.min(rangeMin, noise[i]);
      rangeMax = Math.max(rangeMax, noise[i]);
      assert.equal(noise[i + 3], 255);
    }
  }
  assert.ok(seam / size < (interior / (size * (size - 1))) * 1.6);
  assert.ok(rangeMax - rangeMin > 110);
});

test("calibrated cloud atlas matches requested fractions with filtered samples", () => {
  const size = 256,
    noise = atmosphereNoisePixels(size);
  for (let channel = 0; channel < 3; channel++) {
    for (const coverage of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      let texels = 0,
        filtered = 0;
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4 + channel;
          const j = (y * size + ((x + 1) % size)) * 4 + channel;
          const k = (((y + 1) % size) * size + x) * 4 + channel;
          const l = (((y + 1) % size) * size + ((x + 1) % size)) * 4 + channel;
          texels += atmosphereCloudDensity(noise[i] / 255, coverage);
          filtered += atmosphereCloudDensity(
            (noise[i] + noise[j] + noise[k] + noise[l]) / 1020,
            coverage,
          );
        }
      near(texels / (size * size), coverage, 0.003);
      near(filtered / (size * size), coverage, 0.003);
    }
  }
  for (let rank = 0; rank <= 1; rank += 0.02) {
    assert.equal(atmosphereCloudDensity(rank, 0), 0);
    assert.equal(atmosphereCloudDensity(rank, 1), 1);
    let previous = 0;
    for (let coverage = 0; coverage <= 1; coverage += 0.02) {
      const current = atmosphereCloudDensity(rank, coverage);
      assert.ok(current >= previous);
      previous = current;
    }
  }
});

test("crisp star profiles preserve flux across subpixel placement and magnitude ordering", () => {
  const energy = (ra: number, magnitude: number) => {
    const pixels = atmosphereStarPixels(1024, 512, [
      [1, "fixture", ra, 0, magnitude, 0.6],
    ]);
    let total = 0,
      peak = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += pixels[i] / 255;
      peak = Math.max(peak, pixels[i] / 255);
    }
    return { total, peak };
  };
  const faint = energy(6, 4.5),
    shifted = energy(6 + (24 / 1024) * 0.5, 4.5),
    brighter = energy(6, 2);
  assert.ok(
    Math.abs(faint.total - shifted.total) / faint.total < 0.04,
    "stars do not vanish between texels",
  );
  assert.ok(
    brighter.total > faint.total * 4,
    "magnitude ranking survives bounded display conversion",
  );
  const red = 1 - 0.25 * (1 - (0.6 + 0.1) / 1.6);
  near(faint.total, 0.075 * 2 * Math.PI * 0.6 ** 2 * 1.6 * red, 0.009);
  assert.ok(faint.peak > 0.05, "faint stars retain a defined core");
});

test("atmosphere reuses two textures across updates and disposal is idempotent", () => {
  // NullEngine tests resource ownership and uniforms only; it is not GPU evidence.
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const atmosphere = createAtmosphereSky(scene, "low");
  const disc = new ShaderMaterial("test:disc", scene, "not-compiled", {});
  const unbind = atmosphere.bindClouds(disc);
  const textures = [...scene.textures];
  for (let i = 0; i < 100; i++)
    atmosphere.update({
      instant: j2000 + i * 16,
      dt: 0.016,
      sun: { x: 0, y: 1, z: 0, altitude: 1 },
      cloud: 0.6,
      rain: 0,
      cloudLayers: { low: 0.2, mid: 0.4, high: 0.7 },
      cloudWind: { x: 4, z: -2 },
      player: { x: i, z: 0 },
    });
  assert.equal(textures.length, 2);
  assert.deepEqual(scene.textures, textures);
  assert.deepEqual(atmosphere.material.getActiveTextures(), [
    textures[1],
    textures[0],
  ]);
  assert.ok(disc.getActiveTextures().includes(textures[0]));
  unbind();
  disc.dispose();
  atmosphere.dispose();
  atmosphere.dispose();
  assert.equal(scene.textures.length, 0);
  scene.dispose();
  engine.dispose();
});

test("cloud layers ease changes and model FROM wind advects during a frozen astronomy preview", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const atmosphere = createAtmosphereSky(scene, "low");
  const input = {
    instant: j2000,
    dt: 0.1,
    sun: { x: 0, y: 1, z: 0, altitude: 1 },
    cloud: 0,
    rain: 0,
    cloudLayers: { low: 0, mid: 0, high: 0 },
    weather: {
      cloud: 0,
      rain: 0,
      wind: 1,
      windDirection: 90,
      cloudWinds: {
        low: { speed: 10, direction: 270 },
        mid: { speed: 10, direction: 180 },
        high: { speed: 10, direction: 0 },
      },
    },
  };
  atmosphere.update(input);
  const initial = atmosphere.material.serialize();
  input.cloudLayers = { low: 1, mid: 0.6, high: 0.3 };
  atmosphere.update(input);
  const next = atmosphere.material.serialize();
  const coverage = next.vectors3.atmosphereCoverage;
  assert.ok(coverage[0] > 0 && coverage[0] < 0.03, "layer update is smoothed");
  near(coverage[1] / coverage[0], 0.6);
  near(coverage[2] / coverage[0], 0.3);
  assert.ok(
    next.vectors2.atmosphereLowOffset[0] <
      initial.vectors2.atmosphereLowOffset[0],
    "wind FROM west moves low clouds east",
  );
  assert.ok(
    next.vectors2.atmosphereMidOffset[1] >
      initial.vectors2.atmosphereMidOffset[1],
    "wind FROM south moves mid clouds north",
  );
  assert.ok(
    next.vectors2.atmosphereHighOffset[1] <
      initial.vectors2.atmosphereHighOffset[1],
    "wind FROM north moves high clouds south",
  );
  near(
    next.vectors2.atmosphereLowOffset[0] -
      initial.vectors2.atmosphereLowOffset[0],
    -1 / 4000,
  );
  atmosphere.update({ ...input, dt: 0, player: { x: 1, z: 0 } });
  near(
    atmosphere.material.serialize().vectors2.atmosphereLowOffset[0],
    initial.vectors2.atmosphereLowOffset[0],
  );
  atmosphere.dispose();
  scene.dispose();
  engine.dispose();
});
