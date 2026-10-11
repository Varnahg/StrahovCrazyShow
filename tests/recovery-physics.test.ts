import test from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { Simulation, initPhysics } from "../shared/simulation";
import { SPAWN, CAR_SPAWN } from "../shared/world";
import { VehicleEntity, validVehicleState } from "../shared/vehicle";
import { FIXED_DT } from "../shared/netcode";
await initPhysics();
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };

test("respawn discards invalid chassis/parking and stale kinematic state without sampling either", () => {
  const sim = new Simulation();
  try {
    const actor = sim.add("driver");
    actor.setVehicle(true);
    sim.car.body.setTranslation({ x: NaN, y: Infinity, z: 1e100 }, false);
    sim.car.body.setLinvel({ x: NaN, y: Infinity, z: 0 }, false);
    sim.car.parking.position.x = NaN;
    actor.body.setNextKinematicTranslation({ x: 1e20, y: 1e20, z: 1e20 });
    actor.vertical = Infinity;
    actor.yaw = NaN;
    assert.equal(sim.respawnActor("driver"), true);
    assert.equal(actor.vehicle, false);
    assert.equal(actor.body.isEnabled(), true);
    assert.equal(actor.vertical, 0);
    assert.equal(actor.yaw, 0);
    assert.equal(sim.walkingColliders.size, 1);
    assert.ok(validVehicleState(sim.car.capture()));
    assert.equal(sim.car.driverId, null);
    assert.equal(sim.car.parked, true);
    assert.ok(Math.abs(sim.car.position.x - CAR_SPAWN.x) < 1e-4);
    assert.ok(Math.abs(sim.car.position.z - CAR_SPAWN.z) < 1e-4);
    for (let i = 0; i < 8; i++) {
      actor.step(idle);
      sim.tick(0);
    }
    assert.ok(
      [actor.position.x, actor.position.y, actor.position.z].every(
        Number.isFinite,
      ),
    );
    assert.ok(
      Math.hypot(actor.position.x - SPAWN.x, actor.position.z - SPAWN.z) < 0.01,
    );
    assert.ok(validVehicleState(sim.car.capture()));
    assert.equal(sim.respawnActor("missing"), false);
    const bodies = sim.world.bodies.len(),
      colliders = sim.world.colliders.len();
    for (let i = 0; i < 8; i++) {
      actor.setVehicle(true);
      assert.equal(sim.respawnActor(actor.id), true);
      assert.equal(sim.world.bodies.len(), bodies);
      assert.equal(sim.world.colliders.len(), colliders);
      assert.equal(sim.world.characterControllers.size, 1);
      assert.equal(sim.world.vehicleControllers.size, 1);
      assert.equal(sim.walkingColliders.size, 1);
    }
  } finally {
    sim.dispose();
  }
});

test("hard foot authority ignores a corrupt local driving pose and never resets another driver", () => {
  const sim = new Simulation();
  try {
    const actor = sim.add("local"),
      other = sim.add("other");
    other.setVehicle(true);
    const car = sim.car.capture();
    actor.vehicle = true; // stale local mode must not confer ownership
    actor.body.setTranslation({ x: NaN, y: NaN, z: NaN }, false);
    actor.restore(
      {
        position: SPAWN,
        yaw: 0.3,
        speed: 0,
        vertical: 0,
        grounded: false,
        vehicle: false,
      },
      true,
    );
    assert.equal(actor.vehicle, false);
    assert.ok(Math.abs(actor.position.x - SPAWN.x) < 1e-4);
    assert.deepEqual(sim.car.capture(), car);
    assert.equal(sim.car.driverId, "other");
    assert.equal(sim.walkingColliders.size, 2);
  } finally {
    sim.dispose();
  }
});

test("restore rejects invalid parking/quaternions and Float32 overflow before mutation", () => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const car = new VehicleEntity(world, { x: 0, y: 1, z: 0 }, { parked: true });
  try {
    const before = car.capture();
    for (const change of [
      { parking: { ...before.parking, position: { x: NaN, y: 0, z: 0 } } },
      { rotation: { x: 0, y: 0, z: 0, w: 0 } },
      { linvel: { x: 1e100, y: 0, z: 0 } },
    ]) {
      const invalid = { ...before, ...change };
      assert.equal(validVehicleState(invalid), false);
      assert.throws(
        () => car.restore(invalid),
        /Invalid vehicle physical state/,
      );
      assert.deepEqual(car.capture(), before);
    }
  } finally {
    car.dispose();
    world.free();
  }
});

test("existing CCD blocks upward overspeed through a thin solid roof; recovery clears all dynamics", () => {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = FIXED_DT;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(10, 0.05, 10).setTranslation(0, 5, 0),
  );
  const car = new VehicleEntity(world, { x: 0, y: 0, z: 0 });
  try {
    car.unpark("driver");
    car.body.setLinvel({ x: 0, y: 300, z: 0 }, true);
    for (let i = 0; i < 8; i++) {
      car.step({ throttle: 0, steer: 0 });
      world.step();
    }
    assert.ok(
      car.position.y + 1.56 < 5.1,
      `chassis crossed thin roof at ${car.position.y}`,
    );
    car.recover({ x: 15, y: 1, z: 15 });
    assert.ok(validVehicleState(car.capture()));
    assert.equal(car.parked, true);
    assert.deepEqual({ ...car.body.linvel() }, { x: 0, y: 0, z: 0 });
    assert.deepEqual({ ...car.body.angvel() }, { x: 0, y: 0, z: 0 });
  } finally {
    car.dispose();
    world.free();
  }
});
