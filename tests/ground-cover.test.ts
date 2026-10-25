import test from "node:test";
import assert from "node:assert/strict";
import {
  sampleGroundCover,
  groundCoverNoise,
  GROUND_COVER_AREAS,
  GROUND_COVER_REFERENCE,
  GROUND_DIRT_SEGMENTS,
} from "../shared/ground-cover";
import {
  LANDCOVER,
  RAW_LANDCOVER,
  placementClassifier,
} from "../shared/vegetation";
import { BUILDINGS, MAP } from "../shared/world";
import { isStreetSurface } from "../shared/streets";
import {
  isSourceDirtPolygon,
  sourceStreetSurfaceGroups,
} from "../client/streets-renderer";
import {
  STREET_SURFACES,
  STREET_FEATURES,
  streetPolygonContains,
} from "../shared/streets";

test("source lawn envelopes augment immutable OSM and keep explicit provenance", () => {
  assert.equal(RAW_LANDCOVER.areas.length, 130);
  assert.equal(LANDCOVER.areas.length, 132);
  assert.deepEqual(LANDCOVER.areas.slice(0, 130), RAW_LANDCOVER.areas);
  assert.equal(LANDCOVER.trees, RAW_LANDCOVER.trees);
  for (const area of GROUND_COVER_AREAS) {
    assert.match(area.osmId, /^reference:/);
    assert.equal(area.kind, "grass");
    assert.equal(area.provenance, "photo-and-ortho-interpreted-not-surveyed");
    assert.equal(area.boundaryUncertaintyMetres, 2);
  }
  assert.equal(GROUND_COVER_REFERENCE.sources[0].captureDate, "2024-06-08");
  assert.ok(
    GROUND_COVER_REFERENCE.sources.every(
      (source) => source.sha256.length === 64,
    ),
  );
});

test("new B6 lawns retain actual building, pavement, dirt and artificial turf exclusions", () => {
  const classify = placementClassifier(BUILDINGS, MAP.paths);
  assert.equal(classify.grass(-14, -64), true, "front photo lawn");
  assert.equal(classify.grass(36, -64), true, "rear photo lawn");
  assert.equal(classify.grass(6.7, -55), false, "B6 body remains excluded");
  assert.equal(isStreetSurface(29.24, -64), true);
  assert.equal(
    classify.grass(29.24, -64),
    false,
    "actual dirt path remains walkable and free of plants",
  );
  for (const area of RAW_LANDCOVER.areas.filter(
    (area) => area.surface === "artificial_turf",
  )) {
    const x =
        area.points.reduce((sum, p) => sum + p[0], 0) / area.points.length,
      z = area.points.reduce((sum, p) => sum + p[1], 0) / area.points.length;
    assert.equal(classify.grass(x, z), false, area.osmId);
  }
});

test("world variation is deterministic, finite, continuous and out storage is reused", () => {
  const out = { variation: 0, grassDensity: 0, wear: 0, flowerDensity: 0 };
  for (let x = -40; x < 70; x += 2.13)
    for (let z = -105; z < 0; z += 3.17) {
      const value = sampleGroundCover(x, z);
      assert.equal(sampleGroundCover(x, z, out), out);
      assert.deepEqual(out, value);
      for (const field of Object.values(value))
        assert.ok(Number.isFinite(field) && field >= 0 && field <= 1);
      assert.ok(
        Math.abs(groundCoverNoise(x, z) - groundCoverNoise(x + 1e-6, z)) < 1e-5,
      );
    }
  for (const bad of [NaN, Infinity, -Infinity])
    assert.deepEqual(sampleGroundCover(bad, 0, out), {
      variation: 0,
      grassDensity: 0,
      wear: 0,
      flowerDensity: 0,
    });
});

test("flower probability is sparse and source-scoped, wear follows existing axes", () => {
  assert.equal(sampleGroundCover(-14, -64).flowerDensity, 0);
  assert.equal(
    sampleGroundCover(-103, -65).flowerDensity,
    0,
    "no inferred flowers in unrelated OSM lawn",
  );
  assert.ok(
    sampleGroundCover(36, -64).flowerDensity > 0 &&
      sampleGroundCover(36, -64).flowerDensity <= 0.1,
  );
  assert.equal(sampleGroundCover(29.24, -64).flowerDensity, 0);
  for (const segment of GROUND_DIRT_SEGMENTS) {
    const x = (segment.a[0] + segment.b[0]) / 2,
      z = (segment.a[1] + segment.b[1]) / 2;
    assert.ok(sampleGroundCover(x, z).wear > 0.999999);
    assert.ok(sampleGroundCover(x, z).grassDensity <= 0.1);
    assert.match(segment.source, /openstreetmap\.org/);
  }
  assert.ok(
    sampleGroundCover(33, -64).grassDensity >
      sampleGroundCover(30.5, -64).grassDensity,
  );
});

test("only source-pure dirt polygons receive soil; mixed original ground stays unchanged", () => {
  const gravel = STREET_SURFACES.find(
    (surface) => surface.material === "gravel",
  )!;
  const dirt = gravel.polygons.filter(isSourceDirtPolygon);
  assert.equal(dirt.length, 6);
  for (const id of ["25920436", "1021415594"]) {
    const f = STREET_FEATURES.find((f) => f.id === id)!;
    const a = f.points[0],
      b = f.points[1];
    assert.ok(
      dirt.some((p) =>
        streetPolygonContains(p, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2),
      ),
      id,
    );
  }
  assert.equal(
    isSourceDirtPolygon(gravel.polygons[4]),
    false,
    "mixed ground/dirt union is not relabelled wholesale",
  );
  const before = STREET_SURFACES.flatMap((surface) => surface.polygons);
  const groups = sourceStreetSurfaceGroups(),
    after = groups.flatMap((surface) => surface.polygons);
  assert.equal(after.length, before.length);
  assert.equal(
    new Set(after).size,
    before.length,
    "no polygon duplicated by material split",
  );
  for (const polygon of before)
    assert.ok(
      after.includes(polygon),
      "exact original polygon object, including holes and elevation inputs",
    );
  assert.deepEqual(
    groups.find((surface) => surface.material === "soil")?.polygons,
    dirt,
  );
});
