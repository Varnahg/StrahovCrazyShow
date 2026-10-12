import test from "node:test";
import assert from "node:assert/strict";
import { MAP_ARTIFACTS, mapArtifactMarker } from "../client/map-artifacts";
import { OUTDOOR_ARTIFACTS } from "../shared/outdoor-artifacts";
import { OUTDOOR_LANDMARKS } from "../shared/outdoor-landmarks";
import coverage from "../shared/data/campus-coverage.json";

test("southern fence marker lies on a real source segment inside the walkable map", () => {
  const source = OUTDOOR_ARTIFACTS.find((a) => a.id === "way/429820547")!;
  const marker = MAP_ARTIFACTS.find((a) => a.id === source.id)!;
  const bounds = coverage.walkBounds;
  assert.ok(
    source.z > bounds.maxZ,
    "regression: source centroid is outside the clickable map",
  );
  assert.ok(marker.x >= bounds.minX && marker.x <= bounds.maxX);
  assert.ok(marker.z >= bounds.minZ && marker.z <= bounds.maxZ);
  assert.ok(
    source.points.slice(1).some((b, i) => {
      const a = source.points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1];
      const lengthSquared = dx * dx + dz * dz;
      if (!lengthSquared) return false;
      const t =
        ((marker.x - a[0]) * dx + (marker.z - a[1]) * dz) / lengthSquared;
      return (
        t >= 0 &&
        t <= 1 &&
        Math.hypot(marker.x - a[0] - t * dx, marker.z - a[1] - t * dz) < 1e-8
      );
    }),
  );
  assert.equal(marker.points, source.points);
  assert.equal(marker.source, source.source);
  assert.equal(
    source.z,
    383.32,
    "map placement must not move the rendered fence or its collision source",
  );
});

test("fence anchor uses the longest clipped segment without changing its source record", () => {
  const source = {
    ...OUTDOOR_ARTIFACTS.find((a) => a.kind === "fence")!,
    x: -700,
    z: 0,
    points: [
      [-900, 0],
      [-499, 0],
      [-499, 20],
      [-480, 20],
    ],
  };
  const before = JSON.stringify(source);
  const marker = mapArtifactMarker(source);
  assert.deepEqual([marker.x, marker.z], [-499, 10]);
  assert.notEqual(marker, source);
  assert.equal(JSON.stringify(source), before);
});

test("point furniture and landmark map anchors retain their exact source position", () => {
  for (const source of [...OUTDOOR_ARTIFACTS, ...OUTDOOR_LANDMARKS]) {
    if (source.kind === "fence") continue;
    const marker = MAP_ARTIFACTS.find((a) => a.id === source.id)!;
    assert.equal(marker, source, source.id);
    assert.deepEqual([marker.x, marker.z], [source.x, source.z]);
  }
  const tower = MAP_ARTIFACTS.find((a) => a.kind === "tower")!;
  assert.ok(
    tower.z < coverage.walkBounds.minZ,
    "skyline tower must not be moved into the campus",
  );
});
