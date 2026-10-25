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
  assert.ok(sampleArtLighting(-0.6, 0, 0, 0.6, 1).moonlight <= 0.035);
  assert.equal(sampleArtLighting(-0.6, 0, 0, -0.1).moonlight, 0);
  const clear = sampleArtLighting(0.7, 0, 0);
  const overcast = sampleArtLighting(0.7, 1, 0);
  assert.ok(overcast.sunlight < clear.sunlight);
  assert.ok(overcast.ambientIntensity > clear.ambientIntensity);
});

test("dense fog attenuates celestial direct light without manufacturing light below the horizon", () => {
  const clear = sampleArtLighting(0.7, 0.2, 0, -1, 0, 384400, 40000);
  const fog = sampleArtLighting(0.7, 0.2, 0, -1, 0, 384400, 150);
  assert.ok(fog.sunlight < clear.sunlight * 0.03);
  assert.ok(fog.fogDensity > clear.fogDensity * 100);
  assert.equal(sampleArtLighting(-0.7, 0.2, 0, -1, 0, 384400, 150).sunlight, 0);
});

test("weather fog remains bounded and sunrise has no discontinuous lighting step", () => {
  for (const cloud of [-1, 0, 0.5, 1, 5])
    for (const rain of [-1, 0, 0.5, 1, 5]) {
      const state = sampleArtLighting(0.3, cloud, rain);
      assert.ok(
        state.fogDensity >= 0.0003 && state.fogDensity <= 0.00215 + 1e-9,
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

test("facade edges retain point identity, order, six public keys and signed zero", () => {
  const rectangle: [number, number][] = [
    [0, 0],
    [16, 0],
    [16, 70],
    [0, 70],
  ];
  const cases = [
    {
      points: rectangle,
      expected: [
        { length: 16, nx: 0, nz: -1, long: false },
        { length: 70, nx: 1, nz: -0, long: true },
        { length: 16, nx: 0, nz: 1, long: false },
        { length: 70, nx: -1, nz: -0, long: true },
      ],
    },
    {
      points: [...rectangle].reverse(),
      expected: [
        { length: 16, nx: -0, nz: 1, long: false },
        { length: 70, nx: 1, nz: 0, long: true },
        { length: 16, nx: -0, nz: -1, long: false },
        { length: 70, nx: -1, nz: 0, long: true },
      ],
    },
  ];
  for (const { points, expected } of cases) {
    for (const closed of [false, true]) {
      const polygon = closed ? [...points, points[0]] : [...points];
      const original = polygon.slice();
      for (const point of polygon) Object.freeze(point);
      Object.freeze(polygon);
      const edges = facadeEdges(polygon);
      assert.equal(edges.length, 4);
      for (const [index, edge] of edges.entries()) {
        assert.deepEqual(Object.keys(edge), [
          "a", "b", "length", "nx", "nz", "long",
        ]);
        const { a, b, ...values } = edge;
        assert.equal(a, points[index]);
        assert.equal(b, points[(index + 1) % points.length]);
        assert.deepEqual(values, expected[index]);
      }
      assert.deepEqual(polygon, original);
    }
  }
});

test("facade edges preserve empty, repeated and minimum-length polygon behavior", () => {
  const degenerate: [number, number][][] = [
    [],
    [[5, 6]],
    [[5, 6], [5, 6]],
    [[5, 6], [5, 6], [5, 6]],
  ];
  for (const points of degenerate) assert.deepEqual(facadeEdges(points), []);

  const repeated: [number, number][] = [
    [0, 0],
    [16, 0],
    [16, 0],
    [16, 70],
    [0, 70],
  ];
  const edges = facadeEdges(repeated);
  assert.equal(edges.length, 4);
  for (const [index, [from, to]] of [[0, 1], [2, 3], [3, 4], [4, 0]].entries()) {
    assert.equal(edges[index].a, repeated[from]);
    assert.equal(edges[index].b, repeated[to]);
  }
  for (const width of [0.08 - Number.EPSILON, 0.08]) {
    const points: [number, number][] = [
      [0, 0], [width, 0], [width, 1], [0, 1],
    ];
    const result = facadeEdges(points);
    assert.deepEqual(
      result.map((edge) => edge.length),
      width < 0.08 ? [1, 1] : [0.08, 1, 0.08, 1],
    );
    assert.equal(result[0].a, points[width < 0.08 ? 1 : 0]);
    assert.equal(result[0].b, points[width < 0.08 ? 2 : 1]);
  }
});

test("facade long classification retains its strict tangent threshold", () => {
  for (const [x, expected] of [[0.88, false], [0.88000001, true]] as const) {
    const z = Math.sqrt(1 - x * x);
    const points: [number, number][] = [
      [0, 0], [x, z], [100 + x, z], [100, 0],
    ];
    const edges = facadeEdges(points);
    assert.equal(edges[0].length, 1);
    assert.equal(edges[0].long, expected);
    assert.equal(edges[1].long, true);
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
