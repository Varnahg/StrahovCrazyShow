import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import terrain from "../shared/data/terrain-grid.json";
import north from "../shared/data/north-court-terrain-patch.json";
import b01 from "../shared/data/cad-buildings/b01-entry-grade.json";
import b06 from "../shared/data/cad-buildings/b06-entry-grade.json";
import alignment from "../shared/data/cad-buildings/photo-alignment.json";
import { hasCadBuilding } from "../shared/cad-buildings";
import { TERRAIN_PATCH, createTerrainPatchLookup, terrainPatchCellTriangles, terrainPatchHeight, terrainPatchIntersects, type TerrainPatchDataset } from "../shared/terrain-patches";

const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const near = (a: number | undefined, b: number, tolerance = 1e-8) => assert.ok(a !== undefined && Math.abs(a - b) < tolerance, `${a} != ${b}`);
function originalDmr(x: number, z: number) {
  const g = terrain.grid, gx = (x - g.minX) / g.step, gz = (z - g.minZ) / g.step;
  const column = Math.min(g.columns - 2, Math.floor(gx)), row = Math.min(g.rows - 2, Math.floor(gz)), u = gx - column, v = gz - row;
  const value = (c: number, r: number) => Math.fround(terrain.heights[r * g.columns + c] - terrain.reference.absoluteHeight);
  const nw = value(column, row), ne = value(column + 1, row), sw = value(column, row + 1), se = value(column + 1, row + 1);
  return u + v <= 1 ? nw + u * (ne - nw) + v * (sw - nw) : se + (1 - u) * (sw - se) + (1 - v) * (ne - se);
}
function* triangles(data: TerrainPatchDataset, cell: TerrainPatchDataset["cells"][number]) {
  for (let i = cell.firstIndex; i < cell.firstIndex + cell.indexCount; i += 3) yield data.indices.slice(i, i + 3).map(index => data.positions.slice(index * 3, index * 3 + 3));
}
function planeSample(data: TerrainPatchDataset, cell: TerrainPatchDataset["cells"][number], x: number, z: number) {
  for (const t of triangles(data, cell)) {
    const signs = t.map((a, i) => { const b = t[(i + 1) % 3]; return (b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0]); });
    if (signs.some(v => v < -1e-8)) continue;
    const [a, b, c] = t, u = b.map((v, i) => v - a[i]), v = c.map((w, i) => w - a[i]);
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    return a[1] - (n[0] * (x - a[0]) + n[2] * (z - a[2])) / n[1];
  }
  return undefined;
}

test("derived grades identify exact source data and separate observation from interpretation", () => {
  for (const data of [b01, b06]) {
    assert.equal(data.rawTerrainSha256, sha("shared/data/terrain-grid.json"));
    assert.equal(data.generatorSha256, sha("scripts/cad-buildings/export_grade.py"));
    assert.equal(data.measured, false); assert.equal(data.rawDMRUnchanged, true);
    assert.ok(data.positions.every(Number.isFinite));
  }
  assert.equal(b01.sourceModelSha256, sha("shared/data/cad-buildings/b01.json"));
  assert.equal(b01.sourceManifestSha256, sha("shared/data/photogrammetry.json"));
  assert.deepEqual(b01.placement, alignment.buildings.b01.placement);
  assert.deepEqual(b06.placement, alignment.buildings.b06.placement);
  assert.equal(b06.planeEvidence.sampleCount, 16);
  near(b06.planeEvidence.sampleRmsMetres, .007908568557087325, 1e-10);
  near(b06.regions.sourceSupportedMask.reduce((sum, p) => sum + p.areaM2, 0), .979);
  near(b06.regions.planeRegion.reduce((sum, p) => sum + p.areaM2, 0), 2.716);
  assert.deepEqual(b06.bounds, { minX: -8, maxX: 0, minZ: -84, maxZ: -80 });
  const occluded = b01.entries.find(e => e.doorId.endsWith("312B"))!;
  assert.match(occluded.classification, /occlusion/); assert.deepEqual(occluded.regions.sourceSupportedMask, []);
  assert.ok(occluded.maximumCoreDistanceToSourceMetres <= 1.051 + 1e-8);
  assert.ok(occluded.regions.requestedCoreOutsideApprovedLimit.reduce((sum, p) => sum + p.areaM2, 0) > 0);
});

test("every entry cell retains full area, winding and original NE--SW diagonals", () => {
  for (const data of [b01, b06]) for (const cell of data.cells) {
    const x = data.sourceGrid.minX + cell.column * data.sourceGrid.step, z = data.sourceGrid.minZ + cell.row * data.sourceGrid.step;
    let area = 0;
    for (const [a, b, c] of triangles(data, cell)) {
      const cross = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
      assert.ok(cross > 0); area += cross / 2;
      const diagonal = [a, b, c].map(p => (p[0] - x) / 4 + (p[2] - z) / 4 - 1);
      assert.ok(Math.min(...diagonal) >= -1e-8 || Math.max(...diagonal) <= 1e-8);
      for (const p of [a, b, c]) assert.ok(p[0] >= x - 1e-8 && p[0] <= x + 4 + 1e-8 && p[2] >= z - 1e-8 && p[2] <= z + 4 + 1e-8);
    }
    near(area, 16, 1e-7);
  }
});

test("outer island edges match original DMR and adjacent cells share one height", () => {
  for (const data of [b01, b06]) {
    const lookup = createTerrainPatchLookup([{ data }]), byKey = new Map(data.cells.map(cell => [`${cell.column}:${cell.row}`, cell]));
    for (const cell of data.cells) {
      const x = data.sourceGrid.minX + cell.column * 4, z = data.sourceGrid.minZ + cell.row * 4;
      for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) for (let i = 0; i <= 30; i++) {
        const px = dc ? x + (dc > 0 ? 4 : 0) : x + 4 * i / 30, pz = dr ? z + (dr > 0 ? 4 : 0) : z + 4 * i / 30;
        const own = planeSample(data, cell, px, pz), neighbour = byKey.get(`${cell.column + dc}:${cell.row + dr}`);
        near(lookup.height(px, pz), own!, 1e-7);
        if (neighbour) near(own, planeSample(data, neighbour, px, pz)!, 1e-7);
        else near(own, originalDmr(px, pz), 1e-8);
      }
    }
  }
});

test("sampled B6 plane and complete first-front slope are preserved", () => {
  const lookup = createTerrainPatchLookup([{ data: b06 }]), p = b06.targetPlane;
  for (const sample of b06.planeEvidence.samples) {
    const [x, , z] = sample.worldXYZ; near(lookup.height(x, z), p.a * x + p.b * z + p.c);
  }
  const [a, b] = b06.frontConstraint.endpointsWorldXZ;
  for (let i = 0; i <= 30; i++) {
    const t = i / 30, x = a[0] * (1 - t) + b[0] * t, z = a[1] * (1 - t) + b[1] * t;
    near(lookup.height(x, z), p.a * x + p.b * z + p.c);
  }
  assert.ok(b06.frontConstraint.planeHeights[0] - b06.frontConstraint.planeHeights[2] > .20, "Do not flatten the grade just to force a walking PASS");
});

test("B1 outside points lie on their identified source planes, not forced threshold heights", () => {
  const lookup = createTerrainPatchLookup([{ data: b01 }]);
  for (const entry of b01.entries) {
    near(lookup.height(...entry.observedOutsideWorldXZ as [number, number]), entry.sourcePlaneAtOutside, 1e-7);
    assert.ok(entry.nativeInsideFloorY - entry.sourcePlaneAtOutside > .05);
    for (const source of entry.sourceTriangles) for (const [x, y, z] of source.verticesWorldXYZ) near(y, source.plane.a * x + source.plane.b * z + source.plane.c, 1e-8);
  }
});

test("native registration gates each new patch while the north court remains unchanged", () => {
  let enabled = false;
  const lookup = createTerrainPatchLookup([{ data: north }, { data: b01, enabled: () => enabled }, { data: b06, enabled: () => enabled }]);
  const northOnly = createTerrainPatchLookup([{ data: north }]), northCell = north.cells[0];
  const oldTriangles = lookup.cellTriangles(northCell.column, northCell.row);
  for (const data of [b01, b06]) assert.equal(lookup.cellTriangles(data.cells[0].column, data.cells[0].row), undefined);
  enabled = true;
  for (const data of [b01, b06]) assert.equal(lookup.cellTriangles(data.cells[0].column, data.cells[0].row)?.length, data.cells[0].indexCount / 3);
  assert.equal(lookup.cellTriangles(northCell.column, northCell.row), oldTriangles);
  assert.equal(TERRAIN_PATCH, north);
  for (const cell of north.cells.filter((_, i) => i % 7 === 0)) {
    const tri = triangles(north, cell).next().value!;
    const [x, y, z] = [0, 1, 2].map(axis => tri.reduce((sum, p) => sum + p[axis], 0) / 3);
    near(lookup.height(x, z), y); assert.equal(lookup.height(x, z), northOnly.height(x, z));
  }
  enabled = false; assert.equal(lookup.cellTriangles(b06.cells[0].column, b06.cells[0].row), undefined);
  for (const [data, osm] of [[b01, "53929063"], [b06, "53929071"]] as const) {
    const b = data.bounds, cell = data.cells[0];
    assert.equal(terrainPatchIntersects(b.minX, b.maxX, b.minZ, b.maxZ), hasCadBuilding(osm));
    assert.equal(terrainPatchCellTriangles(cell.column, cell.row) !== undefined, hasCadBuilding(osm));
    const tri = triangles(data, cell).next().value!, x = tri.reduce((sum, p) => sum + p[0], 0) / 3, z = tri.reduce((sum, p) => sum + p[2], 0) / 3;
    assert.equal(terrainPatchHeight(x, z) !== undefined, hasCadBuilding(osm));
  }
});

test("invalid data and competing cell ownership fail instead of overriding another patch", () => {
  assert.throws(() => createTerrainPatchLookup([{ data: b06 }, { data: b06 }]), /Overlapping/);
  const invalid = structuredClone(b06); invalid.positions[0] = NaN;
  assert.throws(() => createTerrainPatchLookup([{ data: invalid }]), /buffers/);
  const badIndex = structuredClone(b06); badIndex.indices[0] = -1;
  assert.throws(() => createTerrainPatchLookup([{ data: badIndex }]), /index/);
  const badCell = structuredClone(b06); badCell.cells[0].firstIndex = NaN;
  assert.throws(() => createTerrainPatchLookup([{ data: badCell }]), /cell/);
});
