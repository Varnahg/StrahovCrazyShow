/** CPU scheduler/cache audit. No renderer, GPU or FPS claim. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Simulation, initPhysics } from "../../shared/simulation";
import { PLACES, SPAWN } from "../../shared/world";
import { MapNavigator } from "../../client/map-navigation";
import { createNavigationClearance } from "../../client/navigation-physics";
import type { MapPoint } from "../../client/minimap-math";

function atDistance(points: MapPoint[], distance: number): MapPoint {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      length = Math.hypot(b.x - a.x, b.z - a.z);
    if (distance <= length) {
      const t = length ? distance / length : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
    }
    distance -= length;
  }
  return points.at(-1)!;
}
const startedAt = new Date().toISOString();
await initPhysics();
const sim = new Simulation(),
  scenarios = [];
try {
  for (const id of ["sports", "rko", "b6", "stadium191a"]) {
    const clear = createNavigationClearance(sim),
      units = clear.steps!;
    let maximumPhysicsUnitMs = 0;
    clear.steps = function* (a, b) {
      const iterator = units(a, b);
      for (;;) {
        const at = performance.now(),
          result = iterator.next();
        maximumPhysicsUnitMs = Math.max(
          maximumPhysicsUnitMs,
          performance.now() - at,
        );
        if (result.done) return result.value;
        yield;
      }
    };
    const nav = new MapNavigator(clear);
    try {
      const target = PLACES.find((p) => p.id === id)!;
      let began = performance.now();
      const route = await nav.planAsync(SPAWN, target);
      assert.equal(route.status, "route");
      const first = {
        wallMs: performance.now() - began,
        ...nav.chunkProfile,
        searches: nav.searches,
        graphSearches: nav.graphSearches,
        clearanceChecks: nav.clearanceChecks,
        maximumPhysicsUnitMs,
      };
      let checks = nav.clearanceChecks,
        searches = nav.searches;
      began = performance.now();
      for (let call = 0; call < 600; call++)
        assert.equal(await nav.planAsync(SPAWN, target), route);
      const cached = {
        calls: 600,
        wallMs: performance.now() - began,
        clearanceChecks: nav.clearanceChecks - checks,
        searches: nav.searches - searches,
      };
      assert.equal(cached.clearanceChecks, 0);
      assert.equal(cached.searches, 0);
      checks = nav.clearanceChecks;
      searches = nav.searches;
      const initialPrunes = nav.prunes;
      began = performance.now();
      for (let sample = 1; sample <= 120; sample++) {
        const position = atDistance(
          route.points,
          ((route.distance - 3) * sample) / 120,
        );
        const a = nav.planAsync(position, target),
          b = nav.planAsync(position, target);
        const [small, large] = await Promise.all([a, b]);
        assert.equal(small, large);
        assert.equal(small.status, "route");
      }
      const progress = {
        samples: 120,
        mapCalls: 240,
        wallMs: performance.now() - began,
        clearanceChecks: nav.clearanceChecks - checks,
        searches: nav.searches - searches,
        prunes: nav.prunes - initialPrunes,
      };
      assert.equal(progress.searches, 0);
      const reference = new MapNavigator(createNavigationClearance(sim));
      began = performance.now();
      assert.deepEqual(reference.plan(SPAWN, target), route);
      const syncAfterWarmup = {
        wallMs: performance.now() - began,
        clearanceChecks: reference.clearanceChecks,
        graphSearches: reference.graphSearches,
      };
      assert.equal(syncAfterWarmup.clearanceChecks, first.clearanceChecks);
      reference.dispose();
      scenarios.push({
        id,
        distance: route.distance,
        first,
        cached,
        progress,
        syncAfterWarmup,
      });
    } finally {
      nav.dispose();
    }
  }
} finally {
  sim.dispose();
}
const inputs = [
  "client/map-navigation.ts",
  "client/navigation-physics.ts",
  "tests/map-navigation.test.ts",
  "shared/simulation.ts",
  "shared/campus-routes.ts",
  "shared/streets.ts",
  "shared/terrain.ts",
  "shared/terrain-patches.ts",
  "shared/landmark-reality.ts",
  "shared/stadium-exterior.ts",
  "shared/data/streets.json",
  "shared/data/terrain-grid.json",
  "shared/data/north-court-terrain-patch.json",
];
const result = {
  startedAt,
  finishedAt: new Date().toISOString(),
  scope:
    "CPU plan/cache comparison on actual Rapier static world; no renderer/GPU/FPS. Input hashes cover named navigation/physics sources, not a complete game snapshot. Chunk budget is cooperative; one native call, JIT or GC can exceed it.",
  inputs: Object.fromEntries(
    inputs.map((path) => [
      path,
      createHash("sha256").update(readFileSync(path)).digest("hex"),
    ]),
  ),
  scenarios,
};
const output =
  process.argv[2] ??
  "docs/verification-evidence/map-navigation-20261011/profile.json";
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify(result, null, 2));
