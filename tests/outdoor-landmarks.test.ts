import test from "node:test";
import assert from "node:assert/strict";
import coverage from "../shared/data/campus-coverage.json";
import {
  buildOutdoorLandmarkPlan,
  LANDMARK_REFERENCE,
  OUTDOOR_LANDMARKS,
  TRACTOR_SOLIDS,
} from "../shared/outdoor-landmarks";
import { TERRAIN_REFERENCE_BPV } from "../shared/terrain";

const plan = buildOutdoorLandmarkPlan({ groundHeight: () => 7 });
const xyz = (values: number[]) =>
  Array.from({ length: values.length / 3 }, (_, i) =>
    values.slice(i * 3, i * 3 + 3),
  );

test("tractor and tower keep independently identified geographic positions and provenance", () => {
  const [tractor, tower] = OUTDOOR_LANDMARKS;
  assert.equal(tractor.osmId, "13482792171");
  assert.match(tractor.source, /umenipromesto\.eu/);
  assert.ok(
    Math.abs(tractor.x + 113.1) < 0.1 && Math.abs(tractor.z + 113.66) < 0.1,
  );
  assert.ok(
    tower.z < coverage.walkBounds.minZ - 40,
    "tower must remain beyond the real north boundary",
  );
  assert.ok(
    Math.abs(tower.x - 235.3) < 0.5 && Math.abs(tower.z + 322.05) < 0.1,
  );
  assert.equal(tower.tags.backdrop, "yes");
  assert.match(tractor.dimensionsEvidence, /photo interpretation/);
  assert.match(tractor.positionEvidence, /differs/);
  assert.match(tower.dimensionsEvidence, /58\.70.*21\.65.*20\/51.*324/);
});

test("historical tower uses the official altitude, structure height and open octagonal frame", () => {
  const tower = OUTDOOR_LANDMARKS[1];
  const points = plan.parts
    .filter((p) => p.artifactId === tower.id)
    .flatMap((p) => xyz(p.positions));
  const base = LANDMARK_REFERENCE.tower.baseAltitude - TERRAIN_REFERENCE_BPV;
  assert.ok(Math.abs(Math.min(...points.map((p) => p[1])) - base) < 0.01);
  assert.ok(
    Math.abs(Math.max(...points.map((p) => p[1])) - base - 58.7) < 0.025,
  );
  const feet = plan.parts.filter(
    (p) => p.artifactId === tower.id && p.material === "outdoor-concrete",
  );
  assert.equal(
    feet.reduce((n, p) => n + p.indices.length / 3, 0),
    8 * 12,
  );
  const middle = points.filter((p) => p[1] > base + 30 && p[1] < base + 40);
  assert.ok(
    middle.length > 1000,
    "truss and central stair silhouette remain modeled",
  );
  assert.ok(
    middle.every((p) => Math.hypot(p[0] - tower.x, p[2] - tower.z) < 3.0),
  );
  assert.ok(
    !plan.colliders.some((c) => c.artifactId === tower.id),
    "backdrop must not invent distant playable terrain",
  );
});

test("nose-up tractor has paired rear tyres, raised front wheel and metallic padlock", () => {
  const [tractor] = OUTDOOR_LANDMARKS;
  const parts = plan.parts.filter((p) => p.artifactId === tractor.id);
  const inverse = (p: number[]) => {
    const dx = p[0] - tractor.x,
      dz = p[2] - tractor.z;
    return [
      dx * Math.cos(tractor.yaw) - dz * Math.sin(tractor.yaw),
      p[1] - 7,
      dx * Math.sin(tractor.yaw) + dz * Math.cos(tractor.yaw),
    ];
  };
  const pink = parts
    .filter((p) => p.material === "outdoor-pink")
    .flatMap((p) => xyz(p.positions).map(inverse));
  for (const side of [-1, 1])
    assert.ok(pink.some((p) => side * p[0] > 1 && p[1] < 1.3));
  assert.ok(
    pink.some((p) => p[0] > 0.75 && p[1] > 3.7),
    "raised pink front tyre",
  );
  const lock = parts
    .filter((p) => p.material === "outdoor-galvanized")
    .flatMap((p) => xyz(p.positions).map(inverse));
  assert.ok(lock.some((p) => p[1] > 3.65) && lock.some((p) => p[1] < 2.25));
  assert.ok(
    lock.every((p) => p[0] < -0.65),
    "padlock is one front wheel, not a second unrelated object",
  );
});

test("tractor collider solids retain exact rendered world transforms and dimensions", () => {
  const artifact = OUTDOOR_LANDMARKS[0];
  assert.equal(plan.colliders.length, TRACTOR_SOLIDS.length);
  for (const [i, solid] of TRACTOR_SOLIDS.entries()) {
    const c = plan.colliders[i];
    assert.deepEqual(
      [c.w, c.h, c.d, c.yaw],
      [solid.w, solid.h, solid.d, artifact.yaw],
    );
    assert.ok(Math.abs(c.y - 7 - solid.y) < 1e-10);
    const corners = xyz(
      plan.parts.find(
        (p) => p.artifactId === artifact.id && p.material === solid.material,
      )!.positions,
    );
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const lx = solid.x + (sx * solid.w) / 2,
            lz = solid.z + (sz * solid.d) / 2;
          const x = artifact.x + lx * Math.cos(c.yaw) + lz * Math.sin(c.yaw);
          const y = 7 + solid.y + (sy * solid.h) / 2;
          const z = artifact.z - lx * Math.sin(c.yaw) + lz * Math.cos(c.yaw);
          assert.ok(
            corners.some(
              (p) => Math.hypot(p[0] - x, p[1] - y, p[2] - z) < 1e-8,
            ),
          );
        }
  }
});

test("tractor settles to its lower mapped tyre contact instead of floating on the downhill side", () => {
  const a = OUTDOOR_LANDMARKS[0];
  const height = (x: number, z: number) =>
    7 + (x - a.x) * 0.08 + (z - a.z) * 0.03;
  const slope = buildOutdoorLandmarkPlan({ groundHeight: height });
  const contactHeights = [-0.81, 0.81].map((x) =>
    height(
      a.x + x * Math.cos(a.yaw) + 0.2 * Math.sin(a.yaw),
      a.z - x * Math.sin(a.yaw) + 0.2 * Math.cos(a.yaw),
    ),
  );
  const base = Math.min(...contactHeights);
  slope.colliders.forEach((c, i) =>
    assert.ok(Math.abs(c.y - TRACTOR_SOLIDS[i].y - base) < 1e-9),
  );
  assert.ok(base < height(a.x, a.z));
});

test("landmark mesh geometry is finite, outward-wound, deterministic and bounded", () => {
  assert.deepEqual(buildOutdoorLandmarkPlan({ groundHeight: () => 7 }), plan);
  assert.ok(plan.parts.length <= 12 && plan.stats.triangleCount < 18000);
  assert.equal(
    plan.stats.triangleCount,
    plan.parts.reduce((n, p) => n + p.indices.length / 3, 0),
  );
  for (const part of plan.parts) {
    assert.ok(part.positions.every(Number.isFinite));
    assert.equal(part.normals.length, part.positions.length);
    assert.equal(part.uvs.length, (part.positions.length / 3) * 2);
    for (let i = 0; i < part.indices.length; i += 3) {
      const [ia, ib, ic] = part.indices.slice(i, i + 3).map((v) => v * 3);
      const a = part.positions.slice(ia, ia + 3),
        b = part.positions.slice(ib, ib + 3),
        c = part.positions.slice(ic, ic + 3);
      const u = b.map((v, j) => v - a[j]),
        v = c.map((w, j) => w - a[j]);
      const n = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ];
      assert.ok(Math.hypot(...n) > 1e-9);
      assert.ok(n.reduce((sum, x, j) => sum + x * part.normals[ia + j], 0) > 0);
    }
  }
});
