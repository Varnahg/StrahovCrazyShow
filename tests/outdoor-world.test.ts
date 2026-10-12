import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { buildOutdoorWorldPlan } from "../shared/outdoor-world";
import { initPhysics, Simulation } from "../shared/simulation";

test("every outdoor solid is integrated into actual authoritative Rapier physics with identical dimensions and rotation", async () => {
  await initPhysics();
  const plan = buildOutdoorWorldPlan();
  const sim = new Simulation();
  const actual: {
    collider: RAPIER.Collider;
    position: RAPIER.Vector;
    half: RAPIER.Vector;
  }[] = [];
  sim.world.forEachCollider((c) => {
    const half = c.halfExtents();
    if (half) actual.push({ collider: c, position: c.translation(), half });
  });
  const at = (x: number, y: number, z: number) =>
    actual.filter(
      ({ position: p }) =>
        Math.abs(p.x - x) < 1e-4 &&
        Math.abs(p.y - y) < 1e-4 &&
        Math.abs(p.z - z) < 1e-4,
    );
  try {
    assert.ok(plan.colliders.length > 50);
    assert.ok(plan.artifacts.some((a) => a.kind === "tractor"));
    assert.ok(plan.artifacts.some((a) => a.kind === "tower"));
    for (const b of plan.colliders) {
      const c = at(b.x, b.y, b.z).find(({ half }) => {
        return (
          half &&
          Math.abs(half.x - b.w / 2) < 1e-4 &&
          Math.abs(half.y - b.h / 2) < 1e-4 &&
          Math.abs(half.z - b.d / 2) < 1e-4
        );
      })?.collider;
      assert.ok(
        c,
        `Missing world collider ${b.artifactId} at ${b.x},${b.y},${b.z}`,
      );
      const q = c.rotation();
      assert.ok(
        Math.abs(
          Math.abs(q.y * Math.sin(b.yaw / 2) + q.w * Math.cos(b.yaw / 2)) - 1,
        ) < 1e-5,
      );
    }
    // Real query from outside a bin must meet its visible front face, not an
    // unrelated building/ground or an invisible enclosing placeholder.
    const bin = plan.artifacts.find((a) => a.kind === "waste-basket")!;
    const box = plan.colliders.find(
      (b) => b.artifactId === bin.id && b.h > 0.5,
    )!;
    const direction = { x: -Math.sin(box.yaw), y: 0, z: -Math.cos(box.yaw) };
    const ray = new RAPIER.Ray(
      { x: box.x - direction.x * 2, y: box.y, z: box.z - direction.z * 2 },
      direction,
    );
    const target = at(box.x, box.y, box.z)[0].collider;
    const hit = sim.world.castRay(
      ray,
      3,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => c.handle === target.handle,
    );
    assert.ok(hit);
    assert.ok(Math.abs(hit.timeOfImpact - (2 - box.d / 2)) < 0.001);
    const tower = plan.artifacts.find((a) => a.kind === "tower")!;
    assert.equal(
      plan.colliders.filter((b) => b.artifactId === tower.id).length,
      0,
      "skyline landmark does not introduce inaccessible collision geometry",
    );
  } finally {
    sim.world.free();
  }
});
