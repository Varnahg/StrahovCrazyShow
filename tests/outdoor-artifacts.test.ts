import test from "node:test";
import assert from "node:assert/strict";
import raw from "../shared/data/outdoor-artifacts.json";
import {
  OUTDOOR_ARTIFACTS,
  OUTDOOR_ARTIFACT_BOUNDS,
  buildOutdoorArtifactPlan,
  appendOutdoorArtifactBox,
  type OutdoorArtifactPart,
  type OutdoorArtifactCollider,
} from "../shared/outdoor-artifacts";
import { B6_LAYOUT } from "../shared/b6-interior";
import { groundHeight } from "../shared/terrain";
import { STREET_FEATURES } from "../shared/streets";
const plan = buildOutdoorArtifactPlan();

test("outdoor inventory keeps exact primary OSM identity, map coordinates and evidence distinction", () => {
  assert.match(
    raw.source.url,
    /^https:\/\/api\.openstreetmap\.org\/api\/0\.6\/map/,
  );
  assert.match(raw.source.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Number.isFinite(Date.parse(raw.source.fetchedAt)));
  assert.equal(
    new Set(OUTDOOR_ARTIFACTS.map((a) => a.id)).size,
    OUTDOOR_ARTIFACTS.length,
  );
  for (const artifact of OUTDOOR_ARTIFACTS) {
    assert.equal(
      artifact.source,
      `https://www.openstreetmap.org/${artifact.id}`,
    );
    assert.equal(
      artifact.positionEvidence,
      "osm-map-coordinate-not-site-survey",
    );
    assert.match(artifact.dimensionsEvidence, /game-estimate/);
    assert.ok(
      artifact.points.some(
        ([x, z]) =>
          x >= OUTDOOR_ARTIFACT_BOUNDS.minX &&
          x <= OUTDOOR_ARTIFACT_BOUNDS.maxX &&
          z >= OUTDOOR_ARTIFACT_BOUNDS.minZ &&
          z <= OUTDOOR_ARTIFACT_BOUNDS.maxZ,
      ),
    );
    const source = raw.artifacts.find((a) => a.id === artifact.id)!;
    if (source.lat !== undefined && source.lon !== undefined) {
      assert.ok(
        Math.abs(
          artifact.x -
            (source.lon - raw.origin.lon) *
              111320 *
              Math.cos((raw.origin.lat * Math.PI) / 180),
        ) <= 0.0051,
      );
      assert.ok(
        Math.abs(artifact.z + (source.lat - raw.origin.lat) * 111320) <= 0.0051,
      );
    }
  }
  assert.equal(plan.stats.byKind.bench, 143);
  assert.equal(plan.stats.byKind.dumpster, 1);
  assert.equal(plan.stats.byKind.recycling, 4);
  assert.equal(plan.stats.byKind["information-board"], 4);
  assert.equal(plan.stats.byKind["bicycle-rack"], 1);
  assert.equal(plan.stats.byKind["picnic-table"], 2);
});

test("the two mapped picnic tables retain exact source anchors with one tabletop, two seats and matching colliders", () => {
  const tables = OUTDOOR_ARTIFACTS.filter(
    (artifact) => artifact.kind === "picnic-table",
  );
  assert.deepEqual(
    tables.map((table) => table.id),
    ["node/6735036413", "node/6735036414"],
  );
  assert.deepEqual(
    tables.map((table) => [table.x, table.z]),
    [
      [9.74, 41.86],
      [56.45, 41.61],
    ],
  );
  for (const table of tables) {
    assert.equal(table.tags.check_date, "2026-01-27");
    assert.equal(table.tags.covered, "no");
    const colliders = plan.colliders.filter(
      (box) => box.artifactId === table.id,
    );
    const surfaces = colliders.filter((box) => box.w === 1.9);
    assert.equal(surfaces.length, 3);
    const top = surfaces.find((box) => box.d === 0.76)!;
    assert.equal(top.x, table.x);
    assert.equal(top.z, table.z);
    assert.ok(Math.abs(top.y - groundHeight(table.x, table.z) - 0.785) < 1e-8);
    assert.equal(surfaces.filter((box) => box.d === 0.3).length, 2);
    const wood = plan.parts.find(
      (part) =>
        part.artifactId === table.id && part.material === "outdoor-wood",
    )!;
    assert.equal(
      wood.indices.length / 3,
      36,
      "one visible solid box for each of the three collider surfaces",
    );
    for (const surface of surfaces) {
      const c = Math.cos(surface.yaw),
        s = Math.sin(surface.yaw);
      for (const dx of [-surface.w / 2, surface.w / 2])
        for (const dy of [-surface.h / 2, surface.h / 2])
          for (const dz of [-surface.d / 2, surface.d / 2]) {
            const x = surface.x + dx * c + dz * s,
              y = surface.y + dy,
              z = surface.z - dx * s + dz * c;
            assert.ok(
              wood.positions.some(
                (_, i) =>
                  i % 3 === 0 &&
                  Math.hypot(
                    wood.positions[i] - x,
                    wood.positions[i + 1] - y,
                    wood.positions[i + 2] - z,
                  ) < 1e-8,
              ),
            );
          }
    }
  }
});

test("unidentified artworks, memorials, water fixtures and flags remain explicit research candidates with no fabricated geometry", () => {
  assert.equal(raw.deferredCandidates.length, 16);
  const ids = new Set(plan.artifacts.map((artifact) => artifact.id));
  for (const candidate of raw.deferredCandidates) {
    assert.equal(
      candidate.source,
      `https://www.openstreetmap.org/${candidate.id}`,
    );
    assert.ok(Number.isFinite(candidate.x) && Number.isFinite(candidate.z));
    assert.ok(Object.keys(candidate.tags).length > 0);
    assert.equal(ids.has(candidate.id), false);
    assert.equal(
      plan.parts.some((part) => part.artifactId === candidate.id),
      false,
    );
    if (candidate.id === "node/13482792171")
      assert.equal(candidate.reason, "owned-by-outdoor-landmarks");
    else
      assert.equal(
        candidate.reason,
        "awaiting-source-photo-shape-identification",
      );
  }
});

test("geometry is cached, premerged, finite and all inventory items are represented", () => {
  assert.equal(plan, buildOutdoorArtifactPlan());
  assert.equal(plan.artifacts.length, OUTDOOR_ARTIFACTS.length);
  assert.equal(
    new Set(plan.parts.map((p) => `${p.artifactId}:${p.material}:${p.lod}`))
      .size,
    plan.parts.length,
  );
  assert.ok(plan.stats.triangleCount < 150000);
  assert.ok(plan.stats.colliderCount < 2000);
  for (const part of plan.parts) {
    assert.ok(part.positions.every(Number.isFinite));
    assert.equal(part.normals.length, part.positions.length);
    assert.equal(part.uvs.length, (part.positions.length / 3) * 2);
    assert.ok(
      part.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < part.positions.length / 3,
      ),
    );
    for (let i = 0; i < part.normals.length; i += 3)
      assert.ok(
        Math.abs(Math.hypot(...part.normals.slice(i, i + 3)) - 1) < 1e-8,
      );
  }
  for (const collider of plan.colliders) {
    assert.ok(
      [
        collider.x,
        collider.y,
        collider.z,
        collider.w,
        collider.h,
        collider.d,
        collider.yaw,
      ].every(Number.isFinite),
    );
    assert.ok(collider.w > 0 && collider.h > 0 && collider.d > 0);
  }
});

test("box renderer and physics use identical rotation, centre and dimensions at arbitrary yaw", () => {
  for (const yaw of [0, 0.35, -1.4, Math.PI / 2, Math.PI]) {
    const parts: OutdoorArtifactPart[] = [],
      colliders: OutdoorArtifactCollider[] = [];
    const box = {
      artifactId: "test",
      x: 31,
      y: 4.2,
      z: -17,
      w: 2.3,
      h: 0.9,
      d: 0.51,
      yaw,
    };
    appendOutdoorArtifactBox(parts, colliders, box, "outdoor-wood");
    assert.equal(colliders[0], box);
    const mesh = parts[0],
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i] - box.x,
        z = mesh.positions[i + 2] - box.z;
      assert.ok(Math.abs(Math.abs(x * c - z * s) - box.w / 2) < 1e-8);
      assert.ok(
        Math.abs(Math.abs(mesh.positions[i + 1] - box.y) - box.h / 2) < 1e-8,
      );
      assert.ok(Math.abs(Math.abs(x * s + z * c) - box.d / 2) < 1e-8);
    }
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const [a, b, c] = mesh.indices
        .slice(i, i + 3)
        .map((index) => mesh.positions.slice(index * 3, index * 3 + 3));
      const u = b.map((v, k) => v - a[k]),
        v = c.map((n, k) => n - a[k]);
      const cross = [
          u[1] * v[2] - u[2] * v[1],
          u[2] * v[0] - u[0] * v[2],
          u[0] * v[1] - u[1] * v[0],
        ],
        normal = mesh.normals.slice(
          mesh.indices[i] * 3,
          mesh.indices[i] * 3 + 3,
        );
      assert.ok(cross.reduce((sum, n, k) => sum + n * normal[k], 0) > 0);
    }
  }
});

test("mapped backrest=no benches have no invented backrest and containers are not multiplied by fractions", () => {
  for (const artifact of OUTDOOR_ARTIFACTS.filter(
    (a) => a.kind === "bench" && a.tags.backrest === "no",
  )) {
    const colliders = plan.colliders.filter(
      (c) => c.artifactId === artifact.id,
    );
    const seat = colliders.find((c) => c.d === 0.48)!;
    assert.ok(
      colliders.every((c) => c.y + c.h / 2 <= seat.y + seat.h / 2 + 1e-8),
    );
  }
  for (const artifact of OUTDOOR_ARTIFACTS.filter(
    (a) => a.kind === "recycling",
  )) {
    assert.equal(
      plan.colliders.filter((c) => c.artifactId === artifact.id && c.h > 0.5)
        .length,
      1,
    );
  }
});

test("mapped gate openings and the B6 entrance remain free for walking", () => {
  const entry = B6_LAYOUT.entry;
  for (const collider of plan.colliders)
    assert.ok(
      Math.hypot(collider.x - entry.x, collider.z - entry.z) >
        Math.hypot(collider.w, collider.d) / 2 + 2,
      `B6 entry is obstructed by ${collider.artifactId}`,
    );
  for (const gate of OUTDOOR_ARTIFACTS.filter((a) =>
    plan.audit.some(
      (entry) =>
        entry.artifactId === a.id &&
        entry.reason === "open-gate-game-state-not-live-status",
    ),
  )) {
    const boxes = plan.colliders.filter((box) => box.artifactId === gate.id);
    assert.equal(
      boxes.length,
      2,
      "public or unknown gate is rendered with actual opening posts",
    );
    for (const box of boxes)
      assert.ok(Math.hypot(box.x - gate.x, box.z - gate.z) >= 0.44);
  }
});

test("new fence collision leaves mapped road and pedestrian corridors clear", () => {
  const paths = STREET_FEATURES.filter((f) => !f.isArea).flatMap((f) =>
    f.points.slice(1).map((b, i) => ({ a: f.points[i], b, width: f.width })),
  );
  const fenceIds = new Set(
    OUTDOOR_ARTIFACTS.filter((a) => a.kind === "fence").map((a) => a.id),
  );
  for (const box of plan.colliders.filter((box) =>
    fenceIds.has(box.artifactId),
  ))
    for (const t of [-0.5, 0, 0.5]) {
      const x = box.x + t * box.w * Math.cos(box.yaw),
        z = box.z - t * box.w * Math.sin(box.yaw);
      for (const path of paths) {
        const dx = path.b[0] - path.a[0],
          dz = path.b[1] - path.a[1],
          l2 = dx * dx + dz * dz;
        if (!l2) continue;
        const u = Math.max(
          0,
          Math.min(1, ((x - path.a[0]) * dx + (z - path.a[1]) * dz) / l2),
        );
        const distance = Math.hypot(
          x - path.a[0] - u * dx,
          z - path.a[1] - u * dz,
        );
        assert.ok(
          distance >= path.width / 2 + 0.4,
          `${box.artifactId} narrows a mapped path to ${distance}`,
        );
      }
    }
  assert.ok(
    plan.audit.some(
      (entry) => entry.reason === "mapped-access-clearance-game-adaptation",
    ),
  );
});
