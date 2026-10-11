import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import earcut from "earcut";
import { MAP, BUILDINGS, BUILDING_CATALOG, STADIUM, buildingArchitecture, measuredFootprint } from "../../shared/world.ts";
const read = async (path: string) => JSON.parse(await readFile(path, "utf8"));
const rawText = await readFile("shared/data/map.json", "utf8");
const raw = JSON.parse(rawText);
const catalog = await read("shared/data/building-catalog.json");
const photos = await read("docs/world-architecture/photo-index.json");
const survey = await read("docs/world-architecture/panorama-survey.json");
assert.equal(catalog.inputHashes.mapSha256, createHash("sha256").update(rawText).digest("hex"));
assert.equal(BUILDING_CATALOG.entries.length, raw.buildings.length);
assert.equal(new Set(BUILDING_CATALOG.entries.map((e) => e.osmId)).size, raw.buildings.length);
assert.equal(MAP.paths.length, raw.paths.filter((p: { kind?: string }) => p.kind?.trim()).length);
assert.ok(MAP.paths.every((p) => p.kind));
assert.ok(!MAP.paths.some((p) => STADIUM.parts.some((part) => part.osmId === p.id)));
const blockMap = new Map(BUILDING_CATALOG.entries.filter((e) => e.block).map((e) => [e.block, e]));
assert.deepEqual([...blockMap.keys()].sort((a, b) => a! - b!), Array.from({ length: 12 }, (_, i) => i + 1));
assert.equal(blockMap.get(1)?.kind, "administration");
assert.equal(blockMap.get(8)?.facade, "dormitory-cell");
assert.equal(blockMap.get(12)?.renderHeight, 9);
assert.equal(buildingArchitecture("7645350")?.kind, "commercial");
assert.equal(buildingArchitecture("8111356")?.kind, "canteen");
for (const b of raw.buildings) {
  const e = buildingArchitecture(b)!;
  const t = b.tags || {};
  if (t.height || t["building:levels"]) assert.equal(e.renderHeight, b.height, `Preserve source height/levels ${b.id}`);
  if (e.heightProvenance === "typology-inferred-approximate") {
    assert.ok(!t.height && !t["building:levels"]);
    assert.ok(e.renderHeight < 5);
  }
  const f = measuredFootprint(b)!;
  assert.ok(f.width > 0 && f.depth > 0 && Number.isFinite(f.yaw));
  for (const [x, z] of b.points) {
    const dx = x - f.center.x, dz = z - f.center.z;
    const u = Math.cos(f.yaw) * dx - Math.sin(f.yaw) * dz;
    const v = Math.sin(f.yaw) * dx + Math.cos(f.yaw) * dz;
    assert.ok(Math.abs(u) < f.width / 2 + 0.02, `Envelope x includes ${b.id}`);
    assert.ok(Math.abs(v) < f.depth / 2 + 0.02, `Envelope z includes ${b.id}`);
  }
}
for (const b of BUILDINGS) {
  const source = raw.buildings.find((s: { id: string }) => s.id === b.id);
  assert.deepEqual(b.points, source.points, "No footprint rewriting");
  assert.equal(b.height, buildingArchitecture(b)?.renderHeight);
}
const area = (points: number[][]) => Math.abs(points.slice(1).reduce((n, p, i) => n + points[i][0] * p[1] - p[0] * points[i][1], 0)) / 2;
for (const ring of [...STADIUM.outerRings, ...STADIUM.innerRings, ...STADIUM.parts.map((p) => p.points)]) {
  assert.deepEqual(ring[0], ring.at(-1));
  assert.ok(ring.length >= 4);
  assert.ok(ring.flat().every(Number.isFinite));
}
const outer = STADIUM.outerRings[0].slice(0, -1), inner = STADIUM.innerRings[0].slice(0, -1);
const coords = [...outer, ...inner].flat();
const triangles = earcut(coords, [outer.length], 2);
let triangleArea = 0;
for (let i = 0; i < triangles.length; i += 3) {
  const a = triangles[i] * 2, b = triangles[i + 1] * 2, c = triangles[i + 2] * 2;
  triangleArea += Math.abs((coords[b] - coords[a]) * (coords[c + 1] - coords[a + 1]) - (coords[b + 1] - coords[a + 1]) * (coords[c] - coords[a])) / 2;
}
assert.ok(Math.abs(triangleArea - (area(STADIUM.outerRings[0]) - area(STADIUM.innerRings[0]))) < 0.01, "Stadium roof mesh can preserve actual open inner field");
assert.equal(STADIUM.decorativeOnly, true);
assert.ok(STADIUM.outerRings.flat().every(([x]) => x < -130), "Stadium stays beyond existing west play boundary");
assert.equal(photos.galleryPhotoCount, photos.galleries.reduce((n: number, g: { photos: unknown[] }) => n + g.photos.length, 0));
for (const item of photos.archived) {
  const bytes = await readFile(item.localPath);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), item.sha256);
  assert.ok(item.license && item.author && item.url);
}
const sources = new Set(catalog.sources.map((s: { id: string }) => s.id));
const refs = new Set(catalog.photoReferences.map((p: { id: string }) => p.id));
for (const e of catalog.entries) {
  assert.ok(e.sourceIds.every((id: string) => sources.has(id)));
  assert.ok(e.photoIds.every((id: string) => refs.has(id)));
}
assert.equal(survey.stations.length, 5);
assert.ok(survey.stations.every((s: { panoramaId: string; navigationLinks: unknown[]; archiveAllowed: boolean }) => s.panoramaId && s.navigationLinks.length === 0 && !s.archiveAllowed));
console.log(JSON.stringify({ status: "passed", cataloguedBuildings: catalog.entries.length, visibleBuildings: BUILDINGS.length, genuinePaths: MAP.paths.length, removedFalsePaths: raw.paths.length - MAP.paths.length, stadiumTriangles: triangles.length / 3, stadiumInnerArea: +area(STADIUM.innerRings[0]).toFixed(2), galleryPhotoLinks: photos.galleryPhotoCount, reviewedGalleryPhotos: photos.galleries.flatMap((g: { photos: { visuallyReviewed: boolean }[] }) => g.photos).filter((p: { visuallyReviewed: boolean }) => p.visuallyReviewed).length, archivedCommons: photos.archived.length, panoramaStations: survey.stations.length }, null, 2));
