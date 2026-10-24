import assert from "node:assert/strict";
import test from "node:test";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  cadLocalToWorld, cadWorldToLocal, transformCadPositions,
  cadPolygonContainsXZ, cadSurfaceHeightAtXZ, cadSpaceAtLocalPosition,
  type CadBuildingSite, type CadPolygon, type CadSurface,
} from "../shared/cad-building-geometry";

const ring: CadPolygon = {
  id: "ring", bounds: { minX: 0, minZ: 0, maxX: 10, maxZ: 10 }, sourcePartIds: ["slab"],
  loops: [[[0, 0], [10, 0], [10, 10], [0, 10]], [[4, 4], [4, 6], [6, 6], [6, 4]]],
};
function surface(id: string, c: number, overrides: Partial<CadSurface> = {}): CadSurface {
  return { ...ring, id, partId: "slab", floor: "n01", role: "slab", plane: { a: 0, b: 0, c }, ...overrides };
}
function site(supportSurfaces: CadSurface[], coverSurfaces: CadSurface[]): CadBuildingSite {
  return {
    schemaVersion: 1, id: "fixture", sourceCollisionSha256: "c".repeat(64),
    sourceBlendSha256: "b".repeat(64), sourceGlbSha256: "a".repeat(64),
    coordinateSystem: "local metres", terrainCutouts: [ring], supportSurfaces, coverSurfaces, derivation: {},
  };
}
const near = (actual: number, expected: number, epsilon = 1e-5) => {
  assert(Math.abs(actual - expected) <= epsilon, `${actual} != ${expected}`);
};

test("CAD rigid transform matches real Babylon matrix and its inverse at nonzero yaw/Y", () => {
  for (const yaw of [0, Math.PI / 2, -.37, -3.119232]) {
    const placement = { translation: { x: -86.9071, y: 4.2, z: 77.6795 }, yaw };
    const matrix = Matrix.Compose(Vector3.One(), Quaternion.RotationAxis(Vector3.Up(), yaw),
      new Vector3(placement.translation.x, placement.translation.y, placement.translation.z));
    for (const point of [{ x: 1, y: -4.65, z: 0 }, { x: -20, y: 9.05, z: 35 }]) {
      const expected = Vector3.TransformCoordinates(new Vector3(point.x, point.y, point.z), matrix);
      const world = cadLocalToWorld(point, placement);
      near(world.x, expected.x); near(world.y, expected.y); near(world.z, expected.z);
      const local = cadWorldToLocal(world, placement);
      near(local.x, point.x, 1e-12); near(local.y, point.y, 1e-12); near(local.z, point.z, 1e-12);
    }
  }
  const rotated = cadLocalToWorld({ x: 1, y: 0, z: 0 }, { translation: { x: 0, y: 0, z: 0 }, yaw: Math.PI / 2 });
  near(rotated.x, 0); near(rotated.z, -1);
});

test("batch transform owns a new Float32 buffer without changing source or caching placement", () => {
  const source = new Float32Array([1, -3.2, 2, -4, 5, 6]);
  const before = source.slice();
  const placement = { translation: { x: 12, y: 4.2, z: -15 }, yaw: -.6 };
  const actual = transformCadPositions(source, placement);
  for (let i = 0; i < source.length; i += 3) {
    const expected = cadLocalToWorld({ x: source[i], y: source[i + 1], z: source[i + 2] }, placement);
    near(actual[i], expected.x); near(actual[i + 1], expected.y); near(actual[i + 2], expected.z);
  }
  assert.deepEqual(source, before);
  assert.notEqual(actual.buffer, source.buffer);
  assert.notDeepEqual(actual, transformCadPositions(source, { ...placement, yaw: .6 }));
  assert.throws(() => transformCadPositions([1, 2], placement));
  assert.throws(() => transformCadPositions([NaN, 2, 3], placement));
  assert.throws(() => transformCadPositions(source, { ...placement, yaw: Infinity }));
});

test("polygon query preserves holes, concavities and exact boundary ownership", () => {
  assert(cadPolygonContainsXZ(ring, 2, 5));
  assert(!cadPolygonContainsXZ(ring, 5, 5));
  assert(cadPolygonContainsXZ(ring, 4, 5));
  assert(cadPolygonContainsXZ(ring, 10, 5));
  assert(!cadPolygonContainsXZ(ring, 10.01, 5));
  assert(!cadPolygonContainsXZ(ring, NaN, 5));
  const concave: CadPolygon = { ...ring, loops: [[[0, 0], [10, 0], [10, 2], [2, 2], [2, 10], [0, 10]]] };
  assert(!cadPolygonContainsXZ(concave, 5, 5));
  assert(cadPolygonContainsXZ(concave, 1, 5));
  const reversed = { ...ring, loops: ring.loops.map(loop => [...loop].reverse()) };
  assert(!cadPolygonContainsXZ(reversed, 5, 5));
  assert(cadPolygonContainsXZ(reversed, 1, 5));
});

test("inclined soffit uses a real plane over the basement instead of a floor height band", () => {
  const basement = surface("basement", -4.65, { floor: "p01" });
  const soffit = surface("stair-lower", 0, { role: "stair", plane: { a: .5, b: -.25, c: -3 } });
  const fixture = site([basement], [soffit]);
  const inside = cadSpaceAtLocalPosition(fixture, { x: 2, y: -3.85, z: 1 });
  assert(inside);
  assert.equal(inside.floor, "p01");
  assert.equal(inside.supportHeight, -4.65);
  assert.equal(inside.coverHeight, -2.25);
  assert.equal(cadSurfaceHeightAtXZ(soffit, 2, 1), -2.25);
  assert.equal(cadSurfaceHeightAtXZ(soffit, 5, 5), undefined);
  assert.equal(cadSpaceAtLocalPosition(fixture, { x: 2, y: -2, z: 1 }), undefined);
});

test("capsule centre selects nearest support/cover, keeps jumps indoors, excludes roof and courtyard", () => {
  const fixture = site([surface("lower", 0), surface("upper", 3), surface("roof", 6)],
    [surface("ceiling1", 2.8), surface("ceiling2", 5.8)]);
  for (const y of [.8, 2]) {
    const space = cadSpaceAtLocalPosition(fixture, { x: 2, y, z: 2 });
    assert.equal(space?.support.id, "lower");
    assert.equal(space?.cover.id, "ceiling1");
  }
  const upper = cadSpaceAtLocalPosition(fixture, { x: 2, y: 3.8, z: 2 });
  assert.equal(upper?.support.id, "upper");
  assert.equal(upper?.cover.id, "ceiling2");
  assert.equal(cadSpaceAtLocalPosition(fixture, { x: 2, y: 6.8, z: 2 }), undefined);
  assert.equal(cadSpaceAtLocalPosition(fixture, { x: 5, y: .8, z: 5 }), undefined);
  assert.equal(cadSpaceAtLocalPosition(fixture, { x: 2, y: -.1, z: 2 }), undefined);
  assert.equal(cadSpaceAtLocalPosition(fixture, { x: 2, y: NaN, z: 2 }), undefined);
});

test("intermediate stair landing supports a covered centre without using the floor catalogue", () => {
  const fixture = site([surface("landing", 1.35, { role: "stair-landing", floor: "n02" })],
    [surface("upper-flight", 4, { role: "stair", plane: { a: -.25, b: .1, c: 4 } })]);
  const space = cadSpaceAtLocalPosition(fixture, { x: 2, y: 2.15, z: 2 });
  assert.equal(space?.supportHeight, 1.35);
  assert.equal(space?.coverHeight, 3.7);
  assert.equal(space?.floor, "n02");
});
