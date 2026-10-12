import test from "node:test";
import assert from "node:assert/strict";
import {
  atmosphereFogDensity,
  celestialTransmission,
  lunarRelativeIrradiance,
} from "../client/atmosphere-light";
import {
  precipitationAppearance,
  updateRainSegments,
} from "../client/weather-particles";
import { sampleArtLighting } from "../client/art-lighting";

test("lunar phase photometry has an opposition surge and inverse-square distance falloff", () => {
  assert.equal(lunarRelativeIrradiance(0), 0);
  assert.equal(lunarRelativeIrradiance(1), 1);
  const quarter = lunarRelativeIrradiance(0.5);
  assert.ok(
    quarter > 0.08 && quarter < 0.11,
    "a quarter is about one tenth of full brightness",
  );
  const near = lunarRelativeIrradiance(1, 356500),
    far = lunarRelativeIrradiance(1, 406700);
  assert.ok(Math.abs(near / far - (406700 / 356500) ** 2) < 1e-12);
  for (const f of [NaN, -1, 0, 0.01, 0.1, 0.5, 0.9, 1, 2])
    assert.ok(Number.isFinite(lunarRelativeIrradiance(f)));
});

test("atmospheric extinction smoothly removes keys at horizon and chooses the dominant real body", () => {
  assert.equal(celestialTransmission(-0.1), 0);
  assert.equal(celestialTransmission(0), 0);
  assert.ok(celestialTransmission(0.02) < celestialTransmission(0.7) * 0.05);
  assert.ok(celestialTransmission(Math.PI / 2) > 0.99);
  const full = sampleArtLighting(-0.5, 0, 0, 0.8, 1);
  assert.equal(full.keySource, "moon");
  assert.equal(sampleArtLighting(-0.5, 0, 0, -0.1, 1).keySource, "none");
  assert.equal(sampleArtLighting(0.6, 0, 0, 0.8, 1).keySource, "sun");
  assert.ok(
    sampleArtLighting(-0.5, 1, 5, 0.8, 1).moonlight < full.moonlight * 0.03,
  );
});

test("model visibility controls EXP fog in metres with bounded artistic fallback", () => {
  const density = atmosphereFogDensity(0.5, 0, 1000);
  assert.ok(Math.abs(Math.exp(-1000 * density) - 0.05) < 1e-12);
  assert.ok(atmosphereFogDensity(0.5, 0, 40000) < density / 30);
  assert.ok(atmosphereFogDensity(1, 8) > atmosphereFogDensity(0, 0));
  assert.ok(Number.isFinite(atmosphereFogDensity(1, 8, 0)));
});

test("snow/mixed precipitation is sourced from phase and intensity, never a temperature threshold", () => {
  assert.equal(
    precipitationAppearance({ rain: 2, precipitationType: "snow" })
      .snowFraction,
    1,
  );
  assert.equal(
    precipitationAppearance({ rain: 2, precipitationType: "freezing-rain" })
      .snowFraction,
    0,
  );
  assert.equal(
    precipitationAppearance({ rain: 2, precipitationType: "mixed" })
      .snowFraction,
    0.5,
  );
  assert.equal(precipitationAppearance({ rain: 0 }).density, 0);
  assert.ok(
    precipitationAppearance({ rain: 0.2 }).density <
      precipitationAppearance({ rain: 10 }).density,
  );
  const lines = Array.from({ length: 160 }, (_, i) => [
    { x: i % 12, y: 4, z: 0 },
    { x: 0, y: 0, z: 0 },
  ]);
  updateRainSegments(lines, 0.05, { rain: 0 });
  assert.ok(lines.every(([a, b]) => a.x === b.x && a.y === b.y && a.z === b.z));
  const light = structuredClone(lines),
    heavy = structuredClone(lines);
  updateRainSegments(light, 0.05, { rain: 0.2 }, { x: 7, z: 0 });
  updateRainSegments(heavy, 0.05, { rain: 10 }, { x: 7, z: 0 });
  const visible = (value: typeof lines) =>
    value.filter(([a, b]) => a.y !== b.y).length;
  assert.ok(visible(light) > 0 && visible(light) < visible(heavy));
  assert.ok(heavy.every(([a, b]) => a.x <= b.x && a.y >= b.y));
});
