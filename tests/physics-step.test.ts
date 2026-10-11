import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  Simulation,
  initPhysics,
  type Actor,
} from "../shared/simulation";
import { stepRigidWorld } from "../shared/physics-step";
import { groundHeight } from "../shared/terrain";
import { B6_LAYOUT, B6_STAIR_MESHES } from "../shared/b6-interior";
import { b6StairRoute } from "../shared/b6-stairs";
import { FIXED_DT } from "../shared/netcode";
import type { Input } from "../shared/types";

await initPhysics();
const idle: Input = { x: 0, z: 0, yaw: 0, seq: 0, jump: false };

/** Add exactly World.step's wrapper-discovery phase after the same public
 * pipeline. This keeps the complete production Simulation.tick, traffic and
 * current source geometry in both worlds, without duplicating that game code.
 */
function useStandardWrapperDiscovery(world: RAPIER.World) {
  let discoveries = 0;
  const step = world.physicsPipeline.step.bind(world.physicsPipeline);
  world.physicsPipeline.step = (...args) => {
    step(...args);
    world.mapNewSoftBodies();
    discoveries++;
  };
  return () => discoveries;
}
function statesEqual(a: Simulation, b: Simulation, tick: number) {
  assert.deepEqual([...a.actors.keys()], [...b.actors.keys()]);
  for (const [id, actor] of a.actors)
    assert.deepEqual(b.actors.get(id)!.capture(), actor.capture(), `${id}, ${tick}`);
  assert.deepEqual(b.car.capture(), a.car.capture(), `car, ${tick}`);
  assert.equal(b.world.timestep, Math.fround(FIXED_DT));
  assert.equal(b.world.timestep, a.world.timestep);
  assert.equal(b.world.colliders.len(), a.world.colliders.len());
}
function snapshotEqual(a: RAPIER.World, b: RAPIER.World) {
  assert.deepEqual(b.takeSnapshot(), a.takeSnapshot());
}
function walkToward(actor: Actor, point: [number, number], tick: number) {
  const p = actor.position,
    dx = point[0] - p.x,
    dz = point[1] - p.z,
    d = Math.hypot(dx, dz);
  return {
    ...idle,
    x: d < 0.1 ? 0 : dx / d,
    z: d < 0.1 ? 0 : dz / d,
    seq: tick,
  };
}

test("rigid-only stepping preserves the complete current campus, stair and traffic world byte for byte", () => {
  const legacy = new Simulation(),
    optimized = new Simulation(),
    discoveries = useStandardWrapperDiscovery(legacy.world),
    route = b6StairRoute("north-reception");
  assert.ok(B6_STAIR_MESHES.some((mesh) => mesh.collides));
  try {
    for (const sim of [legacy, optimized]) {
      sim.add("parking");
      sim.add("stairs", {
        x: route[0][0],
        y: B6_LAYOUT.foundationOffset + 0.84,
        z: route[0][1],
      });
      sim.add("walker", { x: 114, y: groundHeight(114, 12) + 1, z: 12 });
    }
    let waypoint = 1;
    for (let tick = 0; tick < 420; tick++) {
      if (tick === 120)
        for (const sim of [legacy, optimized]) {
          sim.remove("walker");
          sim.add("replacement", {
            x: 114,
            y: groundHeight(114, 12) + 1,
            z: 12,
          });
        }
      const stairs = legacy.actors.get("stairs")!;
      if (
        Math.hypot(
          stairs.position.x - route[waypoint][0],
          stairs.position.z - route[waypoint][1],
        ) < 0.1 && waypoint < route.length - 1
      ) waypoint++;
      for (const sim of [legacy, optimized]) {
        for (const [id, actor] of sim.actors)
          actor.step(
            id === "stairs"
              ? walkToward(actor, route[waypoint], tick)
              : {
                  ...idle,
                  x: id === "parking" ? 0 : tick < 260 ? 0.25 : -0.25,
                  z: id === "parking" && tick >= 60 && tick < 240 ? 1 : 0,
                  jump: id === "parking" && tick === 300,
                  seq: tick,
                },
          );
        sim.tick(Date.parse("2026-10-11T06:15:00Z") + tick * 1000 / 60);
      }
      statesEqual(legacy, optimized, tick);
      if (tick % 140 === 139) snapshotEqual(legacy.world, optimized.world);
    }
    assert.equal(discoveries(), 420);
    // The parked player car is a genuine obstacle on the chosen parking route.
    assert.ok(optimized.actors.get("parking")!.position.z < 14.3);
  } finally {
    legacy.dispose();
    optimized.dispose();
  }
});

test("steering, braking, reversing and car exit preserve all native dynamics with the traversal removed", () => {
  const legacy = new Simulation(), optimized = new Simulation();
  useStandardWrapperDiscovery(legacy.world);
  try {
    for (const sim of [legacy, optimized]) sim.add("driver").setVehicle(true);
    for (let tick = 0; tick < 420; tick++) {
      for (const sim of [legacy, optimized]) {
        sim.actors.get("driver")!.step({
          ...idle,
          x: tick < 180 ? 0.35 : tick < 300 ? -0.25 : 0,
          z: tick < 180 ? 0.55 : tick < 300 ? -0.4 : 0,
          jump: tick >= 300,
          seq: tick,
        });
        sim.tick(0);
      }
      statesEqual(legacy, optimized, tick);
      if (tick % 140 === 139) snapshotEqual(legacy.world, optimized.world);
    }
    for (const sim of [legacy, optimized]) {
      const driver = sim.actors.get("driver")!, exit = sim.exitPosition(driver);
      assert.ok(exit, "the braked car must have a collision-free physical exit");
      driver.setVehicle(false);
      driver.setPosition(exit);
    }
    statesEqual(legacy, optimized, 421);
    snapshotEqual(legacy.world, optimized.world);
  } finally {
    legacy.dispose();
    optimized.dispose();
  }
});

test("a real Rapier soft body uses standard wrapper mapping and safely returns to rigid-only stepping after removal", () => {
  const legacy = new RAPIER.World({ x: 0, y: -18, z: 0 }),
    optimized = new RAPIER.World({ x: 0, y: -18, z: 0 });
  const bodies = [legacy, optimized].map((world) =>
    world.createSoftBody(
      RAPIER.SoftBodyDesc.rope(
        { x: 0, y: 5, z: 0 },
        { x: 1, y: 5, z: 0 },
        4,
      ).setPinnedParticles([0]),
    ),
  );
  let standardSteps = 0;
  const standard = optimized.step.bind(optimized);
  optimized.step = () => {
    standardSteps++;
    standard();
  };
  try {
    for (let tick = 0; tick < 30; tick++) {
      legacy.step();
      stepRigidWorld(optimized);
      snapshotEqual(legacy, optimized);
    }
    assert.equal(standardSteps, 30);
    legacy.removeSoftBody(bodies[0]);
    optimized.removeSoftBody(bodies[1]);
    assert.equal(optimized.softBodies.len(), 0);
    for (let tick = 0; tick < 30; tick++) {
      legacy.step();
      stepRigidWorld(optimized);
      snapshotEqual(legacy, optimized);
    }
    assert.equal(standardSteps, 30);
    assert.equal(optimized.bodies.len(), legacy.bodies.len());
    assert.equal(optimized.colliders.len(), legacy.colliders.len());
  } finally {
    legacy.free();
    optimized.free();
  }
});
