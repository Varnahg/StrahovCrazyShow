import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  createCampusWalkRouter,
  findCampusWalkRoute,
  type CampusWalkRoute,
} from "../shared/campus-routes";
import { BOUNDS, PLACES, TERRAIN_COVERAGE } from "../shared/world";
import { TERRAIN, groundHeight, groundNormal } from "../shared/terrain";
import {
  STREET_FEATURES,
  isStreetSurface,
  type StreetFeature,
  type StreetPoint,
} from "../shared/streets";
import stops from "../shared/data/stadium-stops.json";
import {
  Simulation,
  initPhysics,
  CHARACTER_HALF_HEIGHT,
  CHARACTER_RADIUS,
} from "../shared/simulation";

// This component fixture constructs Simulation() without the IPR collision.
// Keep its historical connected sidewalk start explicit; the production parking
// spawn is inside private parking and is audited against the actual scan separately.
const LEGACY_PROCEDURAL_START = { x: 22, y: groundHeight(22, -14) + 1, z: -14 };
const targets = ["stadium191a", "stadium191b"].map((id) => {
  const place = PLACES.find((p) => p.id === id);
  assert(place, `missing shared waypoint ${id}`);
  return {
    ...place,
    route: findCampusWalkRoute(
      [LEGACY_PROCEDURAL_START.x, LEGACY_PROCEDURAL_START.z],
      [place.x, place.z],
    ),
  };
});

test("legacy procedural baseline follows connected OSM pedestrian ways to both PID 191 platforms", () => {
  assert.equal(stops.platforms.length, 2);
  assert(stops.platforms.every((p) => p.servedBy191));
  assert.match(stops.gtfsSha256, /^[a-f0-9]{64}$/);
  for (const target of targets) {
    const route = target.route;
    assert(route, `disconnected source topology for ${target.id}`);
    assert(
      route.length > 480 && route.length < 700,
      `${target.id}: ${route.length} m`,
    );
    assert(route.startConnector < 4);
    assert(route.endConnector < 0.5);
    for (const point of route.points) {
      assert(point[0] > BOUNDS.minX + 1 && point[0] < BOUNDS.maxX - 1);
      assert(point[1] > BOUNDS.minZ + 1 && point[1] < BOUNDS.maxZ - 1);
      assert(point[0] >= TERRAIN.grid.minX && point[0] <= TERRAIN.grid.maxX);
      assert(point[1] >= TERRAIN.grid.minZ && point[1] <= TERRAIN.grid.maxZ);
    }
    let mappedSamples = 0;
    for (const segment of route.segments) {
      if (segment.source !== "osm-way") continue;
      const feature = STREET_FEATURES.find((f) => f.id === segment.featureId);
      assert(feature);
      assert.notEqual(
        feature.kind,
        "road",
        "walk route should not use carriageway centre lines",
      );
      for (let i = 0; i <= Math.ceil(segment.length / 0.5); i++) {
        const t = Math.min(1, (i * 0.5) / segment.length),
          x = segment.from[0] + (segment.to[0] - segment.from[0]) * t,
          z = segment.from[1] + (segment.to[1] - segment.from[1]) * t;
        assert(
          isStreetSurface(x, z),
          `missing rendered walking surface at ${x},${z}`,
        );
        mappedSamples++;
      }
    }
    assert(mappedSamples > 950);
    console.log("Mapped platform route", {
      target: target.id,
      metres: route.length,
      startConnector: route.startConnector,
      endConnector: route.endConnector,
      wayIds: [
        ...new Set(route.segments.map((s) => s.featureId).filter(Boolean)),
      ],
      mappedSamples,
    });
  }
  // Terrain and the collision/render bounds must cover the new southern stops.
  assert(TERRAIN_COVERAGE.minX <= -282 && TERRAIN_COVERAGE.maxZ >= 274);
});

function fixture(
  id: string,
  nodeIds: string[],
  points: StreetPoint[],
  extra: Partial<StreetFeature> = {},
): StreetFeature {
  return {
    id,
    nodeIds,
    points,
    kind: "footway",
    width: 1.8,
    widthProvenance: "test",
    isArea: false,
    source: "test",
    surface: "asphalt",
    surfaceProvenance: "test",
    material: "asphalt",
    renderArea: 0,
    length: 0,
    tags: { highway: "footway" },
    ...extra,
  };
}

test("campus graph never invents connections or pedestrian access across nearby roads", () => {
  const disconnected = createCampusWalkRouter([
    fixture(
      "north",
      ["a", "b"],
      [
        [0, 0],
        [10, 0],
      ],
    ),
    fixture(
      "south",
      ["c", "d"],
      [
        [10, 0.1],
        [20, 0.1],
      ],
    ),
  ]);
  assert.equal(disconnected.findRoute([0, 0], [20, 0.1]), undefined);
  assert.equal(disconnected.findRoute([100, 0], [0, 0]), undefined);
  const restricted = createCampusWalkRouter([
    fixture(
      "first",
      ["a", "b"],
      [
        [0, 0],
        [10, 0],
      ],
    ),
    fixture(
      "private",
      ["b", "c"],
      [
        [10, 0],
        [20, 0],
      ],
      { tags: { highway: "footway", access: "private" } },
    ),
    fixture(
      "last",
      ["c", "d"],
      [
        [20, 0],
        [30, 0],
      ],
    ),
    fixture(
      "carriageway",
      ["b", "c"],
      [
        [10, 0],
        [20, 0],
      ],
      { kind: "road", tags: { highway: "secondary" } },
    ),
  ]);
  assert.equal(restricted.findRoute([0, 0], [30, 0]), undefined);
  const joined = createCampusWalkRouter([
    fixture(
      "first",
      ["a", "b"],
      [
        [0, 0],
        [10, 0],
      ],
    ),
    fixture(
      "second",
      ["b", "c"],
      [
        [10, 0],
        [20, 0],
      ],
      { tags: { highway: "footway", access: "no", foot: "designated" } },
    ),
  ]);
  const route = joined.findRoute([1, 1], [19, -1]);
  assert(route);
  assert.equal(route.length, 20);
  assert.equal(
    route.segments.filter((s) => s.source === "endpoint-connector").length,
    2,
  );
  assert.deepEqual(joined.findRoute([1, 0], [9, 0])?.points, [
    [1, 0],
    [9, 0],
  ]);
  const clipped = createCampusWalkRouter(
    [
      fixture(
        "outside-world",
        ["a", "b", "c"],
        [
          [0, 0],
          [10, 10],
          [20, 0],
        ],
      ),
    ],
    { minX: -1, maxX: 21, minZ: -1, maxZ: 5 },
  );
  assert.equal(clipped.findRoute([0, 0], [20, 0]), undefined);
});

function routeDigest(route: CampusWalkRoute) {
  return createHash("sha256").update(JSON.stringify(route)).digest("hex");
}

for (const target of targets)
  test(`legacy procedural baseline Rapier walk from historical sidewalk start to ${target.id} never teleports or falls through DMR terrain`, async () => {
    await initPhysics();
    const route = target.route;
    assert(route);
    const sim = new Simulation(),
      actor = sim.add(
        "legacy-procedural-platform-walk",
        LEGACY_PROCEDURAL_START,
      );
    assert.equal(
      sim.photogrammetry,
      undefined,
      "this is deliberately the DMR component fixture, not production IPR gameplay",
    );
    const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };
    let ticks = 0,
      travelled = 0,
      maxStep = 0,
      maxGroundGap = 0,
      minGroundGap = Infinity,
      groundedSamples = 0,
      steepSamples = 0;
    actor.setPosition = () =>
      assert.fail("Route traversal used a teleport or fall-recovery guard");
    const step = (x: number, z: number) => {
      const before = actor.position;
      actor.step({ ...idle, x, z });
      // Fixed valid time keeps scheduled traffic deterministic and avoids an
      // unrelated changing bus turning movement during a route regression.
      sim.tick(0);
      ticks++;
      const p = actor.position,
        moved = Math.hypot(p.x - before.x, p.z - before.z),
        gap = p.y - groundHeight(p.x, p.z),
        normal = groundNormal(p.x, p.z);
      maxStep = Math.max(maxStep, moved);
      travelled += moved;
      minGroundGap = Math.min(minGroundGap, gap);
      maxGroundGap = Math.max(maxGroundGap, gap);
      assert(Number.isFinite(p.y));
      assert(moved < 0.15, `discontinuous movement ${moved}`);
      assert(
        gap > CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS - 0.05,
        `unsupported or penetrating capsule at ${JSON.stringify(p)}, gap=${gap}`,
      );
      assert(
        gap <
          CHARACTER_HALF_HEIGHT +
            CHARACTER_RADIUS / Math.max(0.15, normal.y) +
            0.3,
        `unexpected hover or unmapped obstruction at ${JSON.stringify(p)}, gap=${gap}`,
      );
      assert(
        p.x > BOUNDS.minX &&
          p.x < BOUNDS.maxX &&
          p.z > BOUNDS.minZ &&
          p.z < BOUNDS.maxZ,
      );
      if (actor.grounded) groundedSamples++;
      if (normal.y < 0.99) steepSamples++;
      if (ticks % 90 === 0) {
        const ray = new RAPIER.Ray(
            { x: p.x, y: p.y + 0.1, z: p.z },
            { x: 0, y: -1, z: 0 },
          ),
          support = sim.world.castRayAndGetNormal(
            ray,
            1.3,
            true,
            undefined,
            undefined,
            actor.collider,
            actor.body,
            (c) => !sim.walkingColliders.has(c.handle),
          );
        assert(support, `missing actual Rapier support ${JSON.stringify(p)}`);
        assert(
          sim.groundColliders.has(support.collider.handle),
          "walking support should be terrain, not a hidden roof",
        );
        assert(support.normal.y > 0.5);
      }
    };
    try {
      for (let i = 0; i < 45; i++) step(0, 0);
      for (const point of route.points.slice(1)) {
        let budget =
          Math.ceil(
            Math.hypot(
              point[0] - actor.position.x,
              point[1] - actor.position.z,
            ) /
              (4.6 / 60),
          ) + 180;
        while (budget-- > 0) {
          const p = actor.position,
            dx = point[0] - p.x,
            dz = point[1] - p.z,
            d = Math.hypot(dx, dz);
          if (d < 0.12) break;
          // Slow the final step to avoid oscillating around a source waypoint.
          const scale = Math.min(1, d / (4.6 / 60));
          step((dx / d) * scale, (dz / d) * scale);
        }
        assert(
          budget > 0,
          `blocked toward ${point}: ${JSON.stringify(actor.position)}`,
        );
      }
      for (let i = 0; i < 60; i++) step(0, 0);
      const p = actor.position;
      assert(Math.hypot(p.x - target.x, p.z - target.z) < 0.2);
      assert(
        travelled > route.length * 0.97 && travelled < route.length * 1.03,
      );
      assert(groundedSamples / ticks > 0.95);
      console.log("Legacy procedural continuous physics", {
        mode: "legacy-procedural-dmr",
        start: LEGACY_PROCEDURAL_START,
        productionPhotogrammetry: false,
        target: target.id,
        ticks,
        seconds: ticks / 60,
        routeMetres: route.length,
        travelled,
        maxStep,
        minGroundGap,
        maxGroundGap,
        groundedSamples,
        steepSamples,
        finalPosition: p,
        routeSha256: routeDigest(route),
        streetsSha256: createHash("sha256")
          .update(
            readFileSync(
              new URL("../shared/data/streets.json", import.meta.url),
            ),
          )
          .digest("hex"),
        terrainSha256: createHash("sha256")
          .update(
            readFileSync(
              new URL("../shared/data/terrain-grid.json", import.meta.url),
            ),
          )
          .digest("hex"),
      });
    } finally {
      sim.dispose();
    }
  });
