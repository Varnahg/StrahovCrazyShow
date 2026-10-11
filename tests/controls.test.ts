import { test } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  movementFromKeys,
  vehicleChaseYaw,
  vehicleCameraCanFollow,
  nextVehicleCameraDistance,
} from "../shared/controls";
import { VehicleEntity } from "../shared/vehicle";
import { initPhysics } from "../shared/simulation";
test("A projects left and D projects right in the actual right-handed camera at every yaw", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new UniversalCamera("test", Vector3.Zero(), scene),
    viewport = new Viewport(0, 0, 800, 600);
  for (let yaw = 0; yaw < Math.PI * 2; yaw += Math.PI / 16) {
    camera.position.set(-Math.sin(yaw) * 8, 3, -Math.cos(yaw) * 8);
    camera.setTarget(Vector3.Zero());
    const projection = camera
      .getViewMatrix(true)
      .multiply(camera.getProjectionMatrix(true));
    const project = (x: number, z: number) =>
      Vector3.Project(
        new Vector3(x, 0, z),
        Matrix.Identity(),
        projection,
        viewport,
      );
    const center = project(0, 0);
    for (const side of [-1, 1]) {
      const movement = movementFromKeys(0, side, yaw),
        p = project(movement.x, movement.z);
      assert.ok((p.x - center.x) * side > 10, `yaw=${yaw}, side=${side}`);
    }
    const f = movementFromKeys(1, 0, yaw);
    assert.ok(f.x * Math.sin(yaw) + f.z * Math.cos(yaw) > 0.999);
  }
  scene.dispose();
  engine.dispose();
});
test("vehicle D physically steers toward camera-right and A toward camera-left", async () => {
  await initPhysics();
  for (const right of [-1, 1]) {
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 60;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(100, 0.25, 100).setTranslation(0, -0.25, 0),
    );
    const car = new VehicleEntity(world, { x: 0, y: 0, z: 0 });
    car.unpark("test");
    for (let i = 0; i < 180; i++) {
      const input = movementFromKeys(1, i > 60 ? right : 0, 0, true);
      car.step({ throttle: input.z, steer: input.x });
      world.step();
    }
    assert.ok(
      car.position.x * right < -0.5,
      `D must turn to local -X; side=${right},x=${car.position.x}`,
    );
    world.free();
  }
});
test("vehicle chase follows the short heading arc consistently at different rendering rates", () => {
  assert.ok(
    vehicleChaseYaw(3.1, -3.1, 1 / 60) > 3.1,
    "camera must not orbit the long way across pi",
  );
  const results = [];
  for (const hz of [30, 60, 144]) {
    let yaw = 0;
    for (let i = 0; i < hz; i++)
      yaw = vehicleChaseYaw(yaw, Math.PI / 2, 1 / hz);
    results.push(yaw);
    assert.ok(Math.abs(yaw - Math.PI / 2) < 0.08);
  }
  assert.ok(Math.max(...results) - Math.min(...results) < 1e-10);
});
test("vehicle camera respects manual look, held drag, standstill and open UI before following", () => {
  const ready = {
    driving: true,
    speed: 6,
    nowMs: 10000,
    lastLookMs: 0,
    orbiting: false,
    uiModal: false,
  };
  assert.equal(vehicleCameraCanFollow(ready), true);
  assert.equal(
    vehicleCameraCanFollow({ ...ready, lastLookMs: 8000 }),
    false,
    "recent manual look wins",
  );
  assert.equal(
    vehicleCameraCanFollow({ ...ready, orbiting: true }),
    false,
    "held drag still wins after any delay",
  );
  assert.equal(
    vehicleCameraCanFollow({ ...ready, speed: 0 }),
    false,
    "idle car keeps the chosen side view",
  );
  assert.equal(
    vehicleCameraCanFollow({ ...ready, uiModal: true }),
    false,
    "map and journal do not move the camera",
  );
  assert.equal(vehicleCameraCanFollow({ ...ready, driving: false }), false);
  assert.equal(
    vehicleCameraCanFollow({ ...ready, speed: -3 }),
    true,
    "reversing can follow after the hold",
  );
  assert.deepEqual(
    [
      nextVehicleCameraDistance(5.5),
      nextVehicleCameraDistance(8),
      nextVehicleCameraDistance(11),
    ],
    [8, 11, 5.5],
  );
});
test("A and D steer the actual forward and reversing chassis to the requested screen side at cardinal headings", async () => {
  await initPhysics();
  for (const yaw of [0, Math.PI / 2, Math.PI, Math.PI * 1.5])
    for (const throttle of [1, -1])
      for (const side of [-1, 1]) {
        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        world.timestep = 1 / 60;
        world.createCollider(
          RAPIER.ColliderDesc.cuboid(100, 0.25, 100).setTranslation(
            0,
            -0.25,
            0,
          ),
        );
        world.step();
        const car = new VehicleEntity(world, { x: 0, y: 0.3, z: 0 }, { yaw });
        car.unpark("controls-test");
        for (let tick = 0; tick < 180; tick++) {
          car.step({ throttle: 0, steer: 0 });
          world.step();
        }
        for (let tick = 0; tick < 150; tick++) {
          const input = movementFromKeys(
            throttle * 0.5,
            tick >= 60 ? side : 0,
            yaw,
            true,
          );
          car.step({ throttle: input.z, steer: input.x });
          world.step();
        }
        const screenRight = { x: -Math.cos(yaw), z: Math.sin(yaw) };
        const displacement =
          car.position.x * screenRight.x + car.position.z * screenRight.z;
        assert.ok(
          displacement * side > 0.15,
          `yaw=${yaw},throttle=${throttle},side=${side},screen displacement=${displacement}`,
        );
        const engine = new NullEngine(),
          scene = new Scene(engine);
        scene.useRightHandedSystem = true;
        const camera = new UniversalCamera(
          "vehicle-projection",
          new Vector3(-Math.sin(yaw) * 15, 5, -Math.cos(yaw) * 15),
          scene,
        );
        camera.setTarget(Vector3.Zero());
        const matrix = camera
            .getViewMatrix(true)
            .multiply(camera.getProjectionMatrix(true)),
          viewport = new Viewport(0, 0, 800, 600);
        const origin = Vector3.Project(
            Vector3.Zero(),
            Matrix.Identity(),
            matrix,
            viewport,
          ),
          moved = Vector3.Project(
            new Vector3(car.position.x, 0, car.position.z),
            Matrix.Identity(),
            matrix,
            viewport,
          );
        assert.ok(
          (moved.x - origin.x) * side > 1,
          "physical motion must project to the requested side",
        );
        scene.dispose();
        engine.dispose();
        car.dispose();
        world.free();
      }
});
