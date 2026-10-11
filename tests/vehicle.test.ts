import { test } from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import { FIXED_DT, FixedStepClock } from "../shared/netcode";
import {
  VehicleEntity,
  VEHICLE_TUNING,
  arcadeDriveCommand,
  vehicleExitAllowed,
  rotateVehicleVector,
  type VehicleInput,
} from "../shared/vehicle";

await RAPIER.init();
const idle: VehicleInput = { throttle: 0, steer: 0 };
function setup(heightfield = false, floorSize = 400) {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.timestep = FIXED_DT;
  world.integrationParameters.numSolverIterations = 8;
  if (heightfield) {
    world.createCollider(
      RAPIER.ColliderDesc.heightfield(1, 1, new Float32Array(4), {
        x: floorSize,
        y: 1,
        z: floorSize,
      }),
    );
  } else {
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        floorSize / 2,
        0.5,
        floorSize / 2,
      ).setTranslation(0, -0.5, 0),
    );
  }
  world.step();
  const car = new VehicleEntity(world, { x: 0, y: 0.3, z: 0 });
  car.unpark("driver");
  return {
    world,
    car,
    tick(input: VehicleInput = idle, steps = 1) {
      for (let i = 0; i < steps; i++) {
        car.step(input);
        world.step();
      }
    },
    dispose() {
      car.dispose();
      world.free();
    },
  };
}
function upright(car: VehicleEntity) {
  return rotateVehicleVector(car.rotation, { x: 0, y: 1, z: 0 }).y;
}
function finite(car: VehicleEntity) {
  const s = car.capture();
  assert.ok(
    [
      s.position.x,
      s.position.y,
      s.position.z,
      s.rotation.x,
      s.rotation.y,
      s.rotation.z,
      s.rotation.w,
      s.linvel.x,
      s.linvel.y,
      s.linvel.z,
    ].every(Number.isFinite),
  );
}
function colliderCorners(car: VehicleEntity) {
  const result = [],
    centre = car.collider.translation(),
    rotation = car.collider.rotation(),
    half = (car.collider.shape as RAPIER.Cuboid).halfExtents;
  for (const x of [-half.x, half.x])
    for (const y of [-half.y, half.y])
      for (const z of [-half.z, half.z]) {
        const corner = rotateVehicleVector(rotation, { x, y, z });
        result.push({
          x: centre.x + corner.x,
          y: centre.y + corner.y,
          z: centre.z + corner.z,
        });
      }
  return result;
}

test("physics proxy encloses the actual GLB body, roof, bumpers and mirrors", () => {
  const buffer = readFileSync(
      new URL("../public/models/strahov-compact.glb", import.meta.url),
    ),
    glb = JSON.parse(
      buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString(),
    ),
    sim = setup(),
    half = (sim.car.collider.shape as RAPIER.Cuboid).halfExtents;
  let checked = 0;
  for (const node of glb.nodes) {
    if (node.mesh === undefined || node.name.startsWith("Wheel")) continue;
    const translation = node.translation ?? [0, 0, 0],
      q = node.rotation ?? [0, 0, 0, 1];
    for (const primitive of glb.meshes[node.mesh].primitives) {
      const accessor = glb.accessors[primitive.attributes.POSITION];
      for (const x of [accessor.min[0], accessor.max[0]])
        for (const y of [accessor.min[1], accessor.max[1]])
          for (const z of [accessor.min[2], accessor.max[2]]) {
            const p = rotateVehicleVector(
              { x: q[0], y: q[1], z: q[2], w: q[3] },
              { x, y, z },
            );
            assert.ok(
              Math.abs(p.x + translation[0]) <= half.x + 1e-6,
              `${node.name} x outside collider`,
            );
            assert.ok(
              p.y + translation[1] >= 0.945 - half.y - 1e-6 &&
                p.y + translation[1] <= 0.945 + half.y + 1e-6,
              `${node.name} y outside collider`,
            );
            assert.ok(
              Math.abs(p.z + translation[2]) <= half.z + 1e-6,
              `${node.name} z outside collider`,
            );
          }
      checked++;
    }
  }
  assert.ok(checked >= 18);
  sim.dispose();
});

for (const heightfield of [false, true]) {
  test(`raycast car settles without jitter on ${heightfield ? "heightfield" : "cuboid floor"}`, () => {
    const sim = setup(heightfield);
    sim.tick(idle, 300);
    const start = { ...sim.car.position };
    let min = Infinity,
      max = -Infinity;
    for (let i = 0; i < 300; i++) {
      sim.tick();
      finite(sim.car);
      min = Math.min(min, sim.car.position.y);
      max = Math.max(max, sim.car.position.y);
    }
    assert.ok(
      Math.hypot(sim.car.position.x - start.x, sim.car.position.z - start.z) <
        0.005,
    );
    assert.ok(max - min < 0.005, `suspension oscillation ${max - min}m`);
    assert.ok(sim.car.position.y > -0.2 && sim.car.position.y < 0.4);
    assert.ok(upright(sim.car) > 0.999);
    // Suspension impulse precedes the substepped gravity integration: the end-tick
    // vertical velocity has a small offset even while translation is constant.
    assert.ok(
      Math.abs(sim.car.body.linvel().y) < 0.12,
      `idle vertical velocity ${sim.car.body.linvel().y}`,
    );
    assert.equal(sim.car.wheelPoses().filter((w) => w.grounded).length, 4);
    sim.dispose();
  });
}

test("accelerator, service brake, gated reverse and governor work through chassis forces", () => {
  const sim = setup();
  sim.tick(idle, 180);
  sim.tick({ throttle: 1, steer: 0 }, 300);
  assert.ok(
    sim.car.position.z > 20,
    `forward displacement ${sim.car.position.z}`,
  );
  assert.ok(
    sim.car.speed > 8 && sim.car.speed <= VEHICLE_TUNING.maxForwardSpeed + 0.5,
    `forward speed ${sim.car.speed}`,
  );
  sim.tick({ throttle: 0, brake: 1, steer: 0 }, 90);
  assert.ok(Math.abs(sim.car.speed) < 0.1, `service brake ${sim.car.speed}`);
  const stop = sim.car.position.z;
  sim.tick({ throttle: -1, steer: 0 }, 180);
  assert.ok(
    sim.car.speed < -2 &&
      sim.car.speed >= -VEHICLE_TUNING.maxReverseSpeed - 0.5,
    `reverse speed ${sim.car.speed}`,
  );
  assert.ok(sim.car.position.z < stop - 3);
  sim.tick({ throttle: 1, steer: 0 }, 30);
  assert.ok(
    sim.car.speed > -1,
    `opposite throttle brakes before forward acceleration: ${sim.car.speed}`,
  );
  sim.dispose();
});

test("steering turns toward requested side without translating or rotating a stationary body", () => {
  const sim = setup();
  sim.tick(idle, 180);
  sim.tick({ throttle: 0, steer: 1 }, 120);
  assert.ok(Math.abs(sim.car.yaw) < 0.01);
  sim.tick({ throttle: 0.5, steer: 0.65 }, 150);
  assert.ok(
    sim.car.position.x > 1,
    `right turn displacement ${sim.car.position.x}`,
  );
  assert.ok(sim.car.yaw > 0.25, `right turn yaw ${sim.car.yaw}`);
  assert.ok(upright(sim.car) > 0.85, `upright ${upright(sim.car)}`);
  sim.dispose();
});

test("persistent parking, driver ownership, wheel poses and state restore preserve identity", () => {
  const sim = setup();
  sim.tick(idle, 120);
  sim.tick({ throttle: 0.6, steer: 0.3 }, 90);
  const saved = sim.car.capture();
  sim.tick({ throttle: -1, steer: -1 }, 90);
  sim.car.restore(saved);
  assert.deepEqual(sim.car.capture(), saved);
  assert.ok(
    sim.car
      .wheelPoses()
      .every((w) =>
        [w.position.x, w.position.y, w.position.z].every(Number.isFinite),
      ),
  );
  sim.car.park();
  const parked = sim.car.capture();
  sim.tick({ throttle: 1, steer: 1 }, 120);
  assert.deepEqual(sim.car.capture(), parked);
  assert.equal(sim.car.unpark("other-driver"), true);
  assert.equal(sim.car.unpark("intruder"), false);
  assert.equal(sim.car.id, saved.id);
  assert.equal(sim.car.body.handle, sim.car.collider.parent()!.handle);
  assert.deepEqual(sim.car.parking, parked.parking);
  sim.dispose();
});

test("fixed-physics trajectory is identical at 30, 60 and 120 render Hz", () => {
  function run(renderHz: number) {
    const sim = setup(true),
      clock = new FixedStepClock();
    for (let frame = 0; frame < renderHz * 12; frame++)
      clock.advance(1 / renderHz, (_dt, tick) => {
        sim.tick({
          throttle: tick < 180 ? 0 : tick < 600 ? 0.65 : 0,
          steer: tick < 250 ? 0 : Math.sin(tick / 90) * 0.65,
          brake: tick >= 600 ? 1 : 0,
        });
      });
    const state = sim.car.capture();
    sim.dispose();
    return state;
  }
  const baseline = run(60);
  assert.deepEqual(run(30), baseline);
  assert.deepEqual(run(120), baseline);
});

test("CCD chassis stops at a thin wall at top speed without a translational tunnel", () => {
  const sim = setup();
  sim.world.createCollider(
    RAPIER.ColliderDesc.cuboid(100, 3, 0.1).setTranslation(0, 3, 45),
  );
  sim.tick(idle, 180);
  let deepest = 0;
  for (let i = 0; i < 600; i++) {
    sim.tick({ throttle: 1, steer: 0 });
    finite(sim.car);
    for (const corner of colliderCorners(sim.car))
      deepest = Math.max(deepest, corner.z - 44.9);
  }
  assert.ok(deepest < 0.035, `thin wall penetration ${deepest}m`);
  assert.ok(sim.car.position.z > 40 && sim.car.position.z < 44);
  assert.ok(Math.abs(sim.car.speed) < 0.4);
  assert.ok(upright(sim.car) > 0.8);
  sim.dispose();
});

test("turning alongside a wall resolves rotational contacts instead of rotating through it", () => {
  const sim = setup();
  sim.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.1, 3, 100).setTranslation(1.2, 3, 0),
  );
  sim.tick(idle, 180);
  let deepest = 0;
  for (let i = 0; i < 600; i++) {
    sim.tick({ throttle: 0.8, steer: 1 });
    finite(sim.car);
    for (const corner of colliderCorners(sim.car))
      deepest = Math.max(deepest, corner.x - 1.1);
  }
  assert.ok(deepest < 0.035, `rotational wall penetration ${deepest}m`);
  assert.ok(upright(sim.car) > 0.8);
  sim.dispose();
});

test("car traverses a 12cm curb and an inclined ramp without tunnelling or overturning", () => {
  for (const kind of ["curb", "ramp"] as const) {
    const sim = setup();
    if (kind === "curb")
      sim.world.createCollider(
        RAPIER.ColliderDesc.cuboid(3, 0.06, 2).setTranslation(0, 0.06, 8),
      );
    else {
      const slope = Math.atan(1 / 8);
      sim.world.createCollider(
        RAPIER.ColliderDesc.cuboid(3, 0.08, 4)
          .setTranslation(0, 0.54, 10)
          .setRotation({
            x: -Math.sin(slope / 2),
            y: 0,
            z: 0,
            w: Math.cos(slope / 2),
          }),
      );
    }
    sim.tick(idle, 180);
    let maxHeight = -Infinity,
      minUp = 1;
    for (let i = 0; i < 480; i++) {
      sim.tick({ throttle: 0.35, steer: 0 });
      finite(sim.car);
      maxHeight = Math.max(maxHeight, sim.car.position.y);
      minUp = Math.min(minUp, upright(sim.car));
      assert.ok(
        sim.car.position.y > -0.3,
        `${kind} fell below floor: ${sim.car.position.y}`,
      );
    }
    assert.ok(
      sim.car.position.z > 18,
      `${kind} blocked travel at ${sim.car.position.z}m`,
    );
    assert.ok(
      maxHeight > (kind === "curb" ? 0.05 : 0.6),
      `${kind} no suspension lift ${maxHeight}m`,
    );
    assert.ok(minUp > 0.65, `${kind} overturn ${minUp}`);
    sim.dispose();
  }
});

test("sustained slalom and alternating turns remain upright with front-wheel steering", () => {
  for (const kind of ["slalom", "eight"] as const) {
    const sim = setup(true);
    sim.tick(idle, 180);
    let left = Infinity,
      right = -Infinity,
      minUp = 1,
      positive = 0,
      negative = 0;
    for (let i = 0; i < 900; i++) {
      const steer =
        kind === "slalom"
          ? Math.sin(i / 65) * 0.8
          : i % 360 < 180
            ? 0.85
            : -0.85;
      sim.tick({ throttle: 0.4, steer });
      finite(sim.car);
      const velocity = sim.car.body.angvel().y;
      if (velocity > 0.1) positive++;
      if (velocity < -0.1) negative++;
      left = Math.min(left, sim.car.position.x);
      right = Math.max(right, sim.car.position.x);
      minUp = Math.min(minUp, upright(sim.car));
    }
    assert.ok(right - left > 5, `${kind} lateral response ${right - left}m`);
    assert.ok(
      positive > 100 && negative > 100,
      `${kind} steering directions ${positive}/${negative}`,
    );
    assert.ok(minUp > 0.8, `${kind} roll stability ${minUp}`);
    sim.dispose();
  }
});

test("car completes both loops of a figure-eight and returns close to the crossing", () => {
  const sim = setup(true, 800);
  sim.tick(idle, 180);
  // Begin both loops at settled cruise speed. A speed-sensitive real steering
  // radius cannot return to the same crossing while the first loop accelerates.
  sim.tick({ throttle: 0.4, steer: 0 }, 1200);
  const crossing = { ...sim.car.position };
  let lastYaw = sim.car.yaw,
    minUp = 1;
  for (const sign of [1, -1]) {
    let phase = 0,
      ticks = 0;
    while (sign * phase < Math.PI * 2 && ticks++ < 1200) {
      sim.tick({ throttle: 0.4, steer: sign * 0.85 });
      const yaw = sim.car.yaw;
      phase += Math.atan2(Math.sin(yaw - lastYaw), Math.cos(yaw - lastYaw));
      lastYaw = yaw;
      minUp = Math.min(minUp, upright(sim.car));
    }
    assert.ok(
      sign * phase >= Math.PI * 2,
      `loop ${sign} incomplete ${phase}rad`,
    );
    assert.ok(ticks < 1200);
  }
  assert.ok(
    Math.hypot(
      sim.car.position.x - crossing.x,
      sim.car.position.z - crossing.z,
    ) < 5,
  );
  assert.ok(minUp > 0.9);
  sim.dispose();
});
test("weak opposite pedal always brakes a moving car before reverse, even for analog input", () => {
  for (const speed of [1, 5, 12])
    for (const throttle of [-0.03, -0.2, -1]) {
      const command = arcadeDriveCommand(speed, { throttle, steer: 0 });
      assert.equal(command.mode, "brake");
      assert.equal(command.engine, 0);
      assert.equal(command.brake, Math.abs(throttle));
    }
  assert.equal(
    arcadeDriveCommand(0, { throttle: -1, steer: 0 }).mode,
    "reverse",
  );
  assert.equal(arcadeDriveCommand(-3, { throttle: 1, steer: 0 }).mode, "brake");
});
test("safe exit requires a nearly stopped finite chassis speed in both directions", () => {
  assert.equal(vehicleExitAllowed(0), true);
  assert.equal(vehicleExitAllowed(0.9), true);
  assert.equal(vehicleExitAllowed(-0.9), true);
  assert.equal(vehicleExitAllowed(1.01), false);
  assert.equal(vehicleExitAllowed(-1.01), false);
  assert.equal(vehicleExitAllowed(NaN), false);
  assert.equal(vehicleExitAllowed(Infinity), false);
});
test("holding S from cruise stops before reversing and W reverses that process without a pose jump", () => {
  const sim = setup();
  sim.tick(idle, 180);
  sim.tick({ throttle: 1, steer: 0 }, 300);
  const start = { ...sim.car.position };
  let previous = { ...start },
    nearZero = false,
    reverseAt = -1,
    maxStep = 0;
  for (let tick = 0; tick < 240; tick++) {
    sim.tick({ throttle: -1, steer: 0 });
    const p = sim.car.position;
    maxStep = Math.max(
      maxStep,
      Math.hypot(p.x - previous.x, p.y - previous.y, p.z - previous.z),
    );
    previous = { ...p };
    if (Math.abs(sim.car.speed) < 0.25) nearZero = true;
    if (sim.car.speed < -0.25 && reverseAt < 0) {
      reverseAt = tick;
      assert.ok(nearZero, "reverse must pass through near-zero speed");
    }
  }
  assert.ok(
    reverseAt > 30 && reverseAt < 180,
    `braking-to-reverse took ${reverseAt / 60}s`,
  );
  assert.ok(sim.car.speed < -2);
  assert.ok(maxStep < 0.27, `pose jump ${maxStep}m`);
  sim.tick({ throttle: 1, steer: 0 }, 180);
  assert.ok(sim.car.speed > 2);
  sim.dispose();
});
test("speed-sensitive steering reduces lateral acceleration and self-centres promptly", () => {
  const sim = setup();
  sim.tick(idle, 180);
  sim.tick({ throttle: 1, steer: 0 }, 480);
  let minUp = 1,
    maxLateralAcceleration = 0;
  for (let i = 0; i < 300; i++) {
    sim.tick({ throttle: 1, steer: 1 });
    minUp = Math.min(minUp, upright(sim.car));
    maxLateralAcceleration = Math.max(
      maxLateralAcceleration,
      Math.abs(sim.car.speed * sim.car.body.angvel().y),
    );
  }
  assert.ok(minUp > 0.9, `full-speed turning up vector ${minUp}`);
  assert.ok(
    maxLateralAcceleration < 10,
    `lateral acceleration ${maxLateralAcceleration}m/s²`,
  );
  const highSpeedSteer = Math.abs(sim.car.steering);
  assert.ok(highSpeedSteer < 0.12);
  sim.tick({ throttle: 0, steer: 0 }, 30);
  assert.ok(
    Math.abs(sim.car.steering) < 0.001,
    `released wheel angle ${sim.car.steering}`,
  );
  assert.ok(
    arcadeDriveCommand(0, { throttle: 1, steer: 1 }).desiredSteer > 0.5,
    "parking keeps a tight wheel angle",
  );
  sim.dispose();
});

test("handbrake applies rear-wheel braking and slows more strongly than coasting", () => {
  const sim = setup();
  sim.tick(idle, 180);
  sim.tick({ throttle: 1, steer: 0 }, 240);
  const saved = sim.car.capture();
  sim.tick(idle, 90);
  const coast = sim.car.speed;
  sim.car.restore(saved);
  sim.tick({ throttle: 0, steer: 0, handbrake: true }, 90);
  assert.ok(Math.abs(sim.car.speed) < coast - 2);
  assert.ok(
    sim.car.controller.wheelBrake(2)! > sim.car.controller.wheelBrake(0)!,
  );
  assert.ok(
    sim.car.controller.wheelFrictionSlip(2)! <
      sim.car.controller.wheelFrictionSlip(0)!,
  );
  sim.dispose();
});

test("restore/replay isolated car dynamics remains within a centimetre after a two-second replay", () => {
  const sim = setup(true);
  sim.tick(idle, 180);
  sim.tick({ throttle: 0.7, steer: 0.3 }, 120);
  const saved = sim.car.capture();
  const inputs = Array.from({ length: 120 }, (_, i) => ({
    throttle: 0.6,
    steer: Math.sin(i / 30) * 0.5,
  }));
  for (const input of inputs) sim.tick(input);
  const baseline = sim.car.capture();
  sim.car.restore(saved);
  for (const input of inputs) sim.tick(input);
  const replay = sim.car.capture(),
    error = Math.hypot(
      replay.position.x - baseline.position.x,
      replay.position.y - baseline.position.y,
      replay.position.z - baseline.position.z,
    );
  assert.ok(error < 0.01, `restore/replay position error ${error}m`);
  assert.ok(Math.abs(replay.steering - baseline.steering) < 1e-6);
  sim.dispose();
});
