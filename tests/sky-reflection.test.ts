import test from "node:test";
import assert from "node:assert/strict";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  SphericalHarmonics,
  SphericalPolynomial,
} from "@babylonjs/core/Maths/sphericalPolynomial";
import {
  SkyReflectionSampler,
  skyReflectionData,
} from "../client/sky-reflection";

/** Original direct quadrature is the independent numerical reference. It keeps
 * per-pixel integration so this test can catch errors in the cached basis. */
function reference(topDisplay: Color3, horizonDisplay: Color3, size: number) {
  const top = topDisplay.toLinearSpace(),
    horizon = horizonDisplay.toLinearSpace();
  const directions = [
    (u: number, v: number) => new Vector3(1, v, -u),
    (u: number, v: number) => new Vector3(-1, v, u),
    (u: number, v: number) => new Vector3(u, 1, -v),
    (u: number, v: number) => new Vector3(u, -1, v),
    (u: number, v: number) => new Vector3(u, v, 1),
    (u: number, v: number) => new Vector3(-u, v, -1),
  ];
  const harmonics = new SphericalHarmonics(),
    color = Color3.Black();
  const faces = directions.map((direction) => {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = ((x + 0.5) * 2) / size - 1,
          v = 1 - ((y + 0.5) * 2) / size;
        const d = direction(u, v).normalize();
        Color3.LerpToRef(horizon, top, Math.max(0, d.y), color);
        if (d.y < 0) color.scaleInPlace(0.24);
        const i = (y * size + x) * 4;
        data[i] = Math.round(Math.max(0, Math.min(1, color.r)) * 255);
        data[i + 1] = Math.round(Math.max(0, Math.min(1, color.g)) * 255);
        data[i + 2] = Math.round(Math.max(0, Math.min(1, color.b)) * 255);
        data[i + 3] = 255;
        harmonics.addLight(
          d,
          color,
          4 / (size * size * (1 + u * u + v * v) ** 1.5),
        );
      }
    return data;
  });
  harmonics.convertIncidentRadianceToIrradiance();
  harmonics.convertIrradianceToLambertianRadiance();
  return { faces, polynomial: SphericalPolynomial.FromHarmonics(harmonics) };
}

const polynomialKeys = [
  "x",
  "y",
  "z",
  "xx",
  "yy",
  "zz",
  "xy",
  "yz",
  "zx",
] as const;
const harmonicKeys = [
  "l00",
  "l1_1",
  "l10",
  "l11",
  "l2_2",
  "l2_1",
  "l20",
  "l21",
  "l22",
] as const;
function close(actual: Vector3, expected: Vector3) {
  assert.ok(
    Vector3.Distance(actual, expected) < 1e-10,
    `${actual} != ${expected}`,
  );
}

test("cached sky basis preserves exact cube bytes and direct-quadrature lighting across palette changes", () => {
  const palettes = [
    [new Color3(0.5, 0.7, 0.9), new Color3(0.8, 0.85, 0.9)],
    [new Color3(0.015, 0.025, 0.07), new Color3(0.03, 0.04, 0.06)],
    [new Color3(0.2, 0.1, 0.3), new Color3(1, 0.35, 0.1)],
    [Color3.Black(), Color3.White()],
    [new Color3(1.2, 1, 0.7), Color3.Black()],
  ];
  for (const size of [1, 3, 8, 32]) {
    const sampler = new SkyReflectionSampler(size),
      initial = sampler.data;
    const buffers = initial.faces.slice(),
      polynomial = initial.polynomial;
    for (const [top, horizon] of [...palettes, palettes[0]]) {
      const actual = sampler.update(top, horizon),
        expected = reference(top, horizon, size);
      assert.equal(actual, initial);
      assert.equal(actual.polynomial, polynomial);
      actual.faces.forEach((face, i) => {
        assert.equal(
          face,
          buffers[i],
          "updates reuse the six owned upload buffers",
        );
        assert.deepEqual(face, expected.faces[i]);
      });
      for (const key of polynomialKeys)
        close(actual.polynomial[key], expected.polynomial[key]);
      // Access prescales Babylon's cached SH in place, as real PBR binding does.
      // The following palette update must replace it without stale/double scale.
      const actualHarmonics = actual.polynomial.preScaledHarmonics;
      const expectedHarmonics = expected.polynomial.preScaledHarmonics;
      for (const key of harmonicKeys)
        close(actualHarmonics[key], expectedHarmonics[key]);
    }
  }
});

test("independent samplers and snapshot calls never share mutable sky storage", () => {
  const top = new Color3(0.5, 0.6, 0.7),
    horizon = new Color3(0.7, 0.8, 0.9);
  const first = new SkyReflectionSampler(8),
    second = new SkyReflectionSampler(8);
  first.update(top, horizon);
  const snapshot = skyReflectionData(top, horizon, 8);
  second.update(Color3.Black(), Color3.Black());
  assert.deepEqual(first.data.faces, snapshot.faces);
  first.update(Color3.Black(), Color3.Black());
  assert.notDeepEqual(first.data.faces, snapshot.faces);
  assert.notEqual(first.data.polynomial, snapshot.polynomial);
  for (const size of [0, -1, 1.5, Infinity, NaN])
    assert.throws(() => new SkyReflectionSampler(size), RangeError);
});
