// Reproduce from the repository root: pnpm exec tsx docs/interaction/driving-physics.ts
import RAPIER from "@dimforge/rapier3d-compat";
import { VehicleEntity, rotateVehicleVector } from "../../shared/vehicle";
await RAPIER.init();
function setup() {
  const world = new RAPIER.World({ x: 0, y: -18, z: 0 });
  world.timestep = 1 / 60;
  world.integrationParameters.numSolverIterations = 8;
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(200, 0.5, 200).setTranslation(0, -0.5, 0),
  );
  world.step();
  const car = new VehicleEntity(world, { x: 0, y: 0.3, z: 0 });
  car.unpark("metrics");
  const tick = (throttle = 0, steer = 0, handbrake = false) => {
    car.step({ throttle, steer, handbrake });
    world.step();
  };
  for (let i = 0; i < 180; i++) tick();
  return {
    car,
    tick,
    dispose() {
      car.dispose();
      world.free();
    },
  };
}
const sim = setup();
for (let i = 0; i < 300; i++) sim.tick(1);
const cruise = {
  speedMetresPerSecond: sim.car.speed,
  position: { ...sim.car.position },
};
let stoppedAt: number | null = null,
  reversedAt: number | null = null,
  maxStep = 0,
  previous = { ...sim.car.position };
for (let i = 0; i < 240; i++) {
  sim.tick(-1);
  if (stoppedAt === null && Math.abs(sim.car.speed) < 0.25)
    stoppedAt = (i + 1) / 60;
  if (reversedAt === null && sim.car.speed < -0.25) reversedAt = (i + 1) / 60;
  maxStep = Math.max(
    maxStep,
    Math.hypot(
      sim.car.position.x - previous.x,
      sim.car.position.y - previous.y,
      sim.car.position.z - previous.z,
    ),
  );
  previous = { ...sim.car.position };
}
const reverseSpeed = sim.car.speed;
sim.dispose();
const turn = setup();
for (let i = 0; i < 480; i++) turn.tick(1);
let minUp = 1,
  maxLateralAcceleration = 0;
for (let i = 0; i < 300; i++) {
  turn.tick(1, 1);
  minUp = Math.min(
    minUp,
    rotateVehicleVector(turn.car.rotation, { x: 0, y: 1, z: 0 }).y,
  );
  maxLateralAcceleration = Math.max(
    maxLateralAcceleration,
    Math.abs(turn.car.speed * turn.car.body.angvel().y),
  );
}
const highSpeedSteer = turn.car.steering;
for (let i = 0; i < 30; i++) turn.tick();
const centredSteering = turn.car.steering;
turn.dispose();
console.log(
  JSON.stringify(
    {
      kind: "Rapier fixed-step physics evidence; not browser/GPU evidence",
      dt: 1 / 60,
      cruise,
      brakeToStopSeconds: stoppedAt,
      brakeToReverseSeconds: reversedAt,
      reverseSpeedMetresPerSecond: reverseSpeed,
      largestBrakingStepMetres: maxStep,
      fullSpeedTurn: {
        minimumUpVectorY: minUp,
        maximumLateralAccelerationMetresPerSecondSquared:
          maxLateralAcceleration,
        steeringRadians: highSpeedSteer,
      },
      steeringRadiansAfterHalfSecondRelease: centredSteering,
    },
    null,
    2,
  ),
);
