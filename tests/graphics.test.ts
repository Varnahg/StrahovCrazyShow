import test from "node:test";
import assert from "node:assert/strict";
import { sampleArtLighting } from "../client/art-lighting";
import { facadeEdges } from "../client/world-renderer";
import { BUILDINGS, buildingArchitecture } from "../shared/world";

test("daylight never lights the scene from below the horizon", () => {
  for (const altitude of [-1, -0.18, -0.02, 0]) {
    const state = sampleArtLighting(altitude, 0.3, 0, -1);
    assert.equal(state.sunlight, 0);
    assert.equal(state.moonlight, 0);
    assert.ok(state.ambientIntensity >= 0 && state.ambientIntensity < 0.3);
  }
  assert.ok(sampleArtLighting(-1, 0.3, 0, -1).ambientIntensity < 0.02);
  assert.ok(sampleArtLighting(0.7, 0.2, 0).sunlight > 0.8);
});

test("night moonlight is bounded and overcast has lower direct contrast", () => {
  assert.ok(sampleArtLighting(-0.6, 0, 0, 0.6, 1).moonlight <= 0.012);
  assert.equal(sampleArtLighting(-0.6, 0, 0, -0.1).moonlight, 0);
  const clear = sampleArtLighting(0.7, 0, 0);
  const overcast = sampleArtLighting(0.7, 1, 0);
  assert.ok(overcast.sunlight < clear.sunlight);
  assert.ok(overcast.ambientIntensity > clear.ambientIntensity);
});

test("weather fog remains bounded and sunrise has no discontinuous lighting step", () => {
  for (const cloud of [-1, 0, 0.5, 1, 5])
    for (const rain of [-1, 0, 0.5, 1, 5]) {
      const state = sampleArtLighting(0.3, cloud, rain);
      assert.ok(
        state.fogDensity >= 0.0012 && state.fogDensity <= 0.0035 + 1e-9,
      );
    }
  for (const altitude of [
    -Math.PI / 10,
    -0.18,
    -0.035,
    -0.015,
    0,
    0.06,
    0.07,
    0.15,
    0.34,
  ]) {
    const a = sampleArtLighting(altitude - 1e-5, 0.4, 0);
    const b = sampleArtLighting(altitude + 1e-5, 0.4, 0);
    assert.ok(Math.abs(a.sunlight - b.sunlight) < 0.001);
    assert.ok(Math.abs(a.ambientIntensity - b.ambientIntensity) < 0.001);
    assert.ok(Math.abs(a.horizon.r - b.horizon.r) < 0.001);
  }
});

test("clockwise and counterclockwise footprints keep outward facade normals", () => {
  const rectangle: [number, number][] = [
    [0, 0],
    [16, 0],
    [16, 70],
    [0, 70],
    [0, 0],
  ];
  for (const points of [rectangle, [...rectangle].reverse()]) {
    const edges = facadeEdges(points);
    assert.equal(edges.filter((edge) => edge.long).length, 2);
    for (const edge of edges) {
      const x = (edge.a[0] + edge.b[0]) / 2,
        z = (edge.a[1] + edge.b[1]) / 2;
      assert.ok((x - 8) * edge.nx + (z - 35) * edge.nz > 0);
      assert.ok(Math.abs(Math.hypot(edge.nx, edge.nz) - 1) < 1e-8);
    }
  }
});

test("catalogued dormitories retain long facades while B1 and Potraviny remain other types", () => {
  for (const b of BUILDINGS) {
    const architecture = buildingArchitecture(b);
    if (architecture?.kind === "dormitory")
      assert.ok(
        facadeEdges(b.points).some((edge) => edge.long && edge.length > 12),
        b.name,
      );
  }
  assert.equal(buildingArchitecture("53929063")?.kind, "administration");
  assert.equal(buildingArchitecture("7645350")?.kind, "commercial");
});
