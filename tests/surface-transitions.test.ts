import test from "node:test";
import assert from "node:assert/strict";
import {
  streetTransitionSegments,
  streetTransitionVertexData,
} from "../client/streets-renderer";
import {
  STREET_SURFACES,
  STREET_SURFACE_Y,
  streetSurfaceAt,
  type StreetMaterial,
  type StreetPolygon,
} from "../shared/streets";
import { groundHeight } from "../shared/terrain";
import map from "../shared/data/map.json";
import { streetPolygonContains } from "../shared/streets";

function rectangle(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): StreetPolygon {
  return {
    outer: [
      [x1, z1],
      [x2, z1],
      [x2, z2],
      [x1, z2],
    ],
    holes: [],
    area: (x2 - x1) * (z2 - z1),
  };
}
const group = (material: StreetMaterial, polygon: StreetPolygon) => ({
  material,
  polygons: [polygon],
});

test("flush joints follow one shared material edge, regardless of ring orientation", () => {
  for (const reverse of [false, true]) {
    const left = rectangle(0, 0, 4, 4),
      right = rectangle(4, 0, 8, 4);
    if (reverse) {
      left.outer.reverse();
      right.outer.reverse();
    }
    const segments = streetTransitionSegments([
      group("asphalt", left),
      group("paving", right),
    ]);
    assert.equal(segments.length, 1);
    assert.equal(segments[0].a[0], 4);
    assert.equal(segments[0].b[0], 4);
    assert.equal(Math.abs(segments[0].b[1] - segments[0].a[1]), 4);
    assert.deepEqual(segments[0].materials, ["asphalt", "paving"]);
  }
});

test("same-material continuations, gaps and empty footprint holes do not gain invented edges", () => {
  assert.deepEqual(
    streetTransitionSegments([
      group("asphalt", rectangle(0, 0, 4, 4)),
      group("asphalt", rectangle(4, 0, 8, 4)),
    ]),
    [],
  );
  assert.deepEqual(
    streetTransitionSegments([
      group("asphalt", rectangle(0, 0, 4, 4)),
      group("paving", rectangle(4.2, 0, 8, 4)),
    ]),
    [],
  );
  const hole = rectangle(0, 0, 8, 8);
  hole.holes = [rectangle(2, 2, 6, 6).outer];
  assert.deepEqual(streetTransitionSegments([group("asphalt", hole)]), []);
});

test("a T-junction receives a flush join only across the actual footway mouth", () => {
  const segments = streetTransitionSegments([
    group("asphalt", rectangle(0, 0, 12, 4)),
    group("paving", rectangle(4, 4, 6, 9)),
  ]);
  assert.equal(segments.length, 1);
  const [a, b] =
    segments[0].a[0] < segments[0].b[0]
      ? [segments[0].a, segments[0].b]
      : [segments[0].b, segments[0].a];
  assert.deepEqual(a, [4, 4]);
  assert.deepEqual(b, [6, 4]);
});

test("expanded source network produces deterministic joins only between existing distinct surfaces", () => {
  const segments = streetTransitionSegments(STREET_SURFACES);
  assert.ok(segments.length > 20 && segments.length < 10000);
  assert.deepEqual(streetTransitionSegments(STREET_SURFACES), segments);
  for (const segment of segments) {
    const [a, b] = [segment.a, segment.b],
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const x = (a[0] + b[0]) / 2,
      z = (a[1] + b[1]) / 2,
      nx = -(b[1] - a[1]) / length,
      nz = (b[0] - a[0]) / length;
    const left = streetSurfaceAt(x + nx * 0.065, z + nz * 0.065),
      right = streetSurfaceAt(x - nx * 0.065, z - nz * 0.065);
    assert.ok(left && right && left !== right, `${a} / ${b}`);
    assert.deepEqual(new Set([left, right]), new Set(segment.materials));
  }
});

test("joint render triangles follow shared DMR terrain and never add a raised kerb or wall crossing", () => {
  const data = streetTransitionVertexData(streetTransitionSegments());
  const positions = data.positions as number[],
    indices = data.indices as number[];
  assert.ok(indices.length > 0);
  for (let i = 0; i < positions.length; i += 3)
    assert.ok(
      Math.abs(
        positions[i + 1] -
          groundHeight(positions[i], positions[i + 2]) -
          STREET_SURFACE_Y -
          0.001,
      ) < 0.002,
    );
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.slice(i, i + 3).map((index) => index * 3);
    const x = (positions[a] + positions[b] + positions[c]) / 3,
      z = (positions[a + 2] + positions[b + 2] + positions[c + 2]) / 3;
    const crossY =
      (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) -
      (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
    assert.ok(crossY <= 1e-7);
    assert.ok(
      !map.buildings.some((building) =>
        streetPolygonContains(
          { outer: building.points as [number, number][], holes: [], area: 0 },
          x,
          z,
        ),
      ),
    );
  }
});
