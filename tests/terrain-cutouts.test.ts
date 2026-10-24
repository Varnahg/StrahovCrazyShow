import test from "node:test";
import assert from "node:assert/strict";
import {
  compileTerrainCutouts, subtractTerrainTriangle,
  type TerrainCutoutPoint, type TerrainCutoutPolygon, type TerrainCutoutVertex,
} from "../shared/terrain-cutouts";

const rectangle = (x0: number, z0: number, x1: number, z1: number): TerrainCutoutPoint[] =>
  [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
const polygon = (...loops: TerrainCutoutPoint[][]): TerrainCutoutPolygon => ({ loops });
const triangle = (points: TerrainCutoutPoint[], height = (x: number, z: number) => 0): TerrainCutoutVertex[] =>
  points.map(([x, z]) => [x, height(x, z), z]);
const large = () => triangle([[-10, -10], [30, -10], [-10, 30]]);
function signedArea2(t: TerrainCutoutVertex[]) {
  return (t[1][0] - t[0][0]) * (t[2][2] - t[0][2]) - (t[1][2] - t[0][2]) * (t[2][0] - t[0][0]);
}
const area = (mesh: TerrainCutoutVertex[][]) => mesh.reduce((sum, t) => sum + Math.abs(signedArea2(t)) / 2, 0);
function close(actual: number, expected: number, tolerance = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}, tolerance ${tolerance}`);
}
function assertMesh(mesh: TerrainCutoutVertex[][], winding = 1, height = (x: number, z: number) => 0) {
  for (const t of mesh) {
    assert.equal(t.length, 3);
    assert.equal(Math.sign(signedArea2(t)), winding, "Orientation or positive area was lost");
    for (const [x, y, z] of t) {
      assert.ok([x, y, z].every(Number.isFinite));
      close(y, height(x, z), 1e-8);
    }
  }
}
function covers(mesh: TerrainCutoutVertex[][], [x, z]: TerrainCutoutPoint) {
  return mesh.some(t => {
    const cross = t.map((a, i) => { const b = t[(i + 1) % 3]; return (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]); });
    return cross.every(v => v >= -1e-10) || cross.every(v => v <= 1e-10);
  });
}

test("empty and distant cutouts preserve the original triangle reference and inputs", () => {
  const source = triangle([[0, 0], [4, 0], [0, 4]]), copy = structuredClone(source);
  const input = [polygon(rectangle(1e6, 1e6, 1e6 + 5, 1e6 + 5))], original = structuredClone(input);
  const compiled = compileTerrainCutouts(input);
  assert.deepEqual(compiled.bounds, { minX: 1e6, maxX: 1e6 + 5, minZ: 1e6, maxZ: 1e6 + 5 });
  assert.equal(subtractTerrainTriangle(source, compiled)[0], source);
  assert.equal(subtractTerrainTriangle(source, compileTerrainCutouts([]))[0], source);
  assert.deepEqual(source, copy); assert.deepEqual(input, original);
});

test("a fully covered triangle disappears, while an edge cut keeps the analytic remainder", () => {
  const source = triangle([[0, 0], [4, 0], [0, 4]]);
  assert.deepEqual(subtractTerrainTriangle(source, compileTerrainCutouts([polygon(rectangle(-1, -1, 5, 5))])), []);
  const mesh = subtractTerrainTriangle(source, compileTerrainCutouts([polygon(rectangle(2, -1, 5, 5))]));
  close(area(mesh), 6); assertMesh(mesh);
  assert.ok(mesh.flat().every(p => p[0] <= 2 + 1e-9));
  assert.ok(covers(mesh, [1, 1])); assert.ok(!covers(mesh, [2.5, .2]));
});

test("a concave L removes five square metres and preserves its reentrant corner", () => {
  const cut = polygon([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]]);
  const mesh = subtractTerrainTriangle(large(), compileTerrainCutouts([cut]));
  close(area(mesh), 800 - 5); assertMesh(mesh);
  assert.ok(covers(mesh, [2, 2]));
  assert.ok(!covers(mesh, [.5, 2])); assert.ok(!covers(mesh, [2, .5]));
});

test("a hole in a cutout remains terrain, independently of ring winding", () => {
  for (const reverse of [false, true]) {
    const outer = rectangle(0, 0, 4, 4), hole = rectangle(1, 1, 3, 3);
    if (reverse) outer.reverse(); else hole.reverse();
    const mesh = subtractTerrainTriangle(large(), compileTerrainCutouts([polygon(outer, hole)]));
    close(area(mesh), 800 - 12); assertMesh(mesh);
    for (const point of [[1.5, 1.5], [2.5, 2.5], [-1, 2]] as TerrainCutoutPoint[]) assert.ok(covers(mesh, point));
    for (const point of [[.5, 2], [2, .5], [3.5, 2]] as TerrainCutoutPoint[]) assert.ok(!covers(mesh, point));
  }
});

test("overlapping and duplicate cutouts remove their union, not repeated area", () => {
  const a = polygon(rectangle(0, 0, 3, 2)), b = polygon(rectangle(2, 1, 4, 3));
  const mesh = subtractTerrainTriangle(large(), compileTerrainCutouts([a, b, a]));
  close(area(mesh), 800 - (6 + 4 - 1)); assertMesh(mesh);
  assert.ok(!covers(mesh, [2.5, 1.5])); assert.ok(covers(mesh, [1, 2.5]));
  const donut = polygon(rectangle(0, 0, 4, 4), rectangle(1, 1, 3, 3));
  const filledHole = subtractTerrainTriangle(large(), compileTerrainCutouts([donut, polygon(rectangle(1, 1, 2, 3))]));
  close(area(filledHole), 800 - 14); assertMesh(filledHole);
  assert.ok(!covers(filledHole, [1.5, 2])); assert.ok(covers(filledHole, [2.5, 2]));
});

test("both input windings retain their sign on the original sloped height plane", () => {
  const height = (x: number, z: number) => 2 * x - 3 * z + 4;
  const compiled = compileTerrainCutouts([polygon(rectangle(0, 0, 4, 4), rectangle(1, 1, 3, 3))]);
  for (const sign of [1, -1]) {
    const source = triangle([[-10, -10], [30, -10], [-10, 30]], height);
    if (sign < 0) source.reverse();
    const mesh = subtractTerrainTriangle(source, compiled);
    close(area(mesh), 788); assertMesh(mesh, sign, height);
  }
});

test("edge and vertex contact with overlapping bboxes does not retriangulate terrain", () => {
  const source = triangle([[0, 0], [1, 0], [0, 1]]);
  for (const cut of [polygon([[.5, .5], [.7, .5], [.5, .7]]), polygon([[0, 1], [1, 0], [1, 1]])]) {
    const output = subtractTerrainTriangle(source, compileTerrainCutouts([cut]));
    assert.equal(output.length, 1); assert.equal(output[0], source);
  }
});

test("short cutter edges use a metre tolerance and cannot erase a nearby centimetre", () => {
  const source = triangle([[0, 0], [1, 0], [0, 1]]);
  const outside = polygon([[.5, .50001], [.5000001, .50001], [.5, .5000101]]);
  assert.equal(subtractTerrainTriangle(source, compileTerrainCutouts([outside]))[0], source);
  const thin = polygon(rectangle(.2, .1, .2000001, .3));
  const mesh = subtractTerrainTriangle(source, compileTerrainCutouts([thin]));
  close(area(mesh), .5 - 2e-8, 1e-10); assertMesh(mesh);
  assert.ok(covers(mesh, [.20001, .2]));
});

test("small and large footprints keep analytic area without fixed area epsilon", () => {
  for (const scale of [1e-5, 1, 1000]) {
    const source = triangle([[0, 0], [4 * scale, 0], [0, 4 * scale]]);
    const cut = polygon(rectangle(2 * scale, -scale, 5 * scale, 5 * scale));
    const mesh = subtractTerrainTriangle(source, compileTerrainCutouts([cut]));
    close(area(mesh), 6 * scale * scale, 1e-9 * scale * scale); assertMesh(mesh);
  }
});

test("a micrometre-wide terrain remainder is retained as finite oriented triangles", () => {
  const width = 1e-6, source = triangle([[0, 0], [4, 0], [0, 4]]);
  const mesh = subtractTerrainTriangle(source, compileTerrainCutouts([polygon(rectangle(width, -1, 5, 5))]));
  assert.ok(mesh.length); assertMesh(mesh);
  close(area(mesh), 4 * width - width * width / 2, 1e-12);
});

test("adjacent terrain planes meet at the same clipped XYZ boundary", () => {
  const first: TerrainCutoutVertex[] = [[0, 0, 0], [4, 2, 0], [0, 4, 4]];
  const second: TerrainCutoutVertex[] = [[4, 2, 0], [4, 10, 4], [0, 4, 4]];
  const compiled = compileTerrainCutouts([polygon(rectangle(1, 1, 3, 3))]);
  const left = subtractTerrainTriangle(first, compiled), right = subtractTerrainTriangle(second, compiled);
  close(area([...left, ...right]), 12);
  assertMesh(left, 1, (x, z) => .5 * x + z);
  assertMesh(right, 1, (x, z) => 1.5 * x + 2 * z - 4);
  for (const [x, y, z] of [[1, 3.5, 3], [3, 2.5, 1]]) for (const mesh of [left, right]) {
    assert.ok(mesh.flat().some(p => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 1e-9));
  }
});

test("large world offsets and repeated closing vertices do not change clipping", () => {
  const origin = 1e8, source = triangle([[origin, origin], [origin + 4, origin], [origin, origin + 4]]);
  const ring = rectangle(origin + 2, origin - 1, origin + 5, origin + 5);
  ring.push(ring[0], ring[0]);
  const mesh = subtractTerrainTriangle(source, compileTerrainCutouts([polygon(ring)]));
  close(area(mesh), 6, 1e-6); assertMesh(mesh);
});

test("compiled cutouts own their coordinates and do not follow later input mutation", () => {
  const ring: [number, number][] = [[2, -1], [5, -1], [5, 5], [2, 5]];
  const compiled = compileTerrainCutouts([polygon(ring)]);
  ring[0][0] = 1000; ring.length = 0;
  close(area(subtractTerrainTriangle(triangle([[0, 0], [4, 0], [0, 4]]), compiled)), 6);
});

test("nonfinite coordinates and invalid rings fail explicitly; zero-area terrain emits no triangles", () => {
  assert.throws(() => compileTerrainCutouts([polygon([[0, 0], [1, 0], [NaN, 1]])]), /finite/);
  assert.throws(() => compileTerrainCutouts([polygon([[0, 0], [1, 0], [0, Infinity]])]), /finite/);
  assert.throws(() => compileTerrainCutouts([{ loops: [] }]), /outer ring/);
  assert.throws(() => compileTerrainCutouts([polygon([[0, 0], [1, 0]])]), /non-degenerate/);
  assert.throws(() => compileTerrainCutouts([polygon([[0, 0], [1, 0], [2, 0]])]), /non-degenerate/);
  const compiled = compileTerrainCutouts([]);
  assert.throws(() => subtractTerrainTriangle([[0, 0, 0], [1, NaN, 0], [0, 0, 1]], compiled), /finite/);
  assert.throws(() => subtractTerrainTriangle([[0, 0, 0], [1, 0, 0]], compiled), /three/);
  assert.deepEqual(subtractTerrainTriangle([[0, 0, 0], [1, 0, 1], [2, 0, 2]], compiled), []);
});
