import RAPIER from "@dimforge/rapier3d-compat";
import { FIXED_DT } from "./netcode";
import type { Vec3 } from "./types";

export type VehicleRotation = { x: number; y: number; z: number; w: number };
export type VehicleInput = {
  /** Signed accelerator: +1 forward, -1 reverse (brakes first if moving forward). */
  throttle: number;
  /** +1 turns toward local +X, -1 toward local -X. */
  steer: number;
  brake?: number;
  handbrake?: boolean;
};
export type VehiclePose = { position: Vec3; rotation: VehicleRotation };
export type VehicleState = VehiclePose & {
  id: string;
  driverId: string | null;
  parked: boolean;
  parking: VehiclePose;
  linvel: Vec3;
  angvel: Vec3;
  steering: number;
  wheelSpin: number[];
  wheelSuspension: number[];
  wheelContact: boolean[];
  force: Vec3;
  torque: Vec3;
  sleeping: boolean;
};
export type WheelPose = VehiclePose & {
  index: number;
  steering: number;
  spin: number;
  suspensionLength: number;
  grounded: boolean;
};

export const VEHICLE_TUNING = Object.freeze({
  mass: 850,
  maxForwardSpeed: 15, // 54 km/h; campus arcade car, not a racing simulation.
  maxReverseSpeed: 5,
  engineForce: 4_600,
  brakeForce: 9_000,
  wheelRadius: 0.34,
  suspensionRest: 0.4,
  suspensionTravel: 0.22,
  suspensionStiffness: 30,
  suspensionCompression: 4.4,
  suspensionRelaxation: 5,
  maxSteering: 0.52,
  minSteering: 0.055,
  maxLateralAcceleration: 7.5,
  directionChangeSpeed: 0.2,
});
export const VEHICLE_WHEELS = Object.freeze([
  { x: -0.85, y: 0.68, z: 1.05 },
  { x: 0.85, y: 0.68, z: 1.05 },
  { x: -0.85, y: 0.68, z: -1.05 },
  { x: 0.85, y: 0.68, z: -1.05 },
]);
export const VEHICLE_EXIT_MAX_SPEED = 1;
export const vehicleExitAllowed = (speed: number) =>
  Number.isFinite(speed) && Math.abs(speed) <= VEHICLE_EXIT_MAX_SPEED;
const IDENTITY: VehicleRotation = { x: 0, y: 0, z: 0, w: 1 };
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };
const finitePhysicsNumber = (value: number) =>
  Number.isFinite(value) && Number.isFinite(Math.fround(value));
export const finiteVehiclePosition = (value: Vec3) =>
  !!value && [value.x, value.y, value.z].every(finitePhysicsNumber);
const validRotation = (value: VehicleRotation) =>
  !!value &&
  [value.x, value.y, value.z, value.w].every(finitePhysicsNumber) &&
  Math.abs(Math.hypot(value.x, value.y, value.z, value.w) - 1) < 0.001;
const validPose = (pose: VehiclePose) =>
  !!pose &&
  finiteVehiclePosition(pose.position) &&
  validRotation(pose.rotation);
export function validVehicleState(state: VehicleState): boolean {
  return (
    !!state &&
    validPose(state) &&
    validPose(state.parking) &&
    finiteVehiclePosition(state.linvel) &&
    finiteVehiclePosition(state.angvel) &&
    finiteVehiclePosition(state.force) &&
    finiteVehiclePosition(state.torque) &&
    finitePhysicsNumber(state.steering) &&
    Array.isArray(state.wheelSpin) &&
    state.wheelSpin.length === 4 &&
    state.wheelSpin.every(finitePhysicsNumber) &&
    Array.isArray(state.wheelSuspension) &&
    state.wheelSuspension.length === 4 &&
    state.wheelSuspension.every(finitePhysicsNumber) &&
    Array.isArray(state.wheelContact) &&
    state.wheelContact.length === 4 &&
    state.wheelContact.every((b) => typeof b === "boolean") &&
    typeof state.parked === "boolean" &&
    typeof state.sleeping === "boolean" &&
    (state.driverId === null || typeof state.driverId === "string")
  );
}
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : 0));
const approach = (n: number, target: number, delta: number) =>
  n + clamp(target - n, -delta, delta);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
const plus = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
/** Stateless pedal mapping: opposite pedal brakes until nearly stopped, then drives.
 * Testing speed sign separately avoids weak analog reverse engaging at high speed.
 * No body transform, velocity overwrite or unsynchronised gear timer is involved. */
export function arcadeDriveCommand(speed: number, input: VehicleInput) {
  const throttle = clamp(input.throttle, -1, 1),
    requestedBrake = clamp(input.brake ?? 0, 0, 1);
  const opposing =
    Math.abs(throttle) > 0.01 &&
    throttle * Math.sign(speed) < 0 &&
    Math.abs(speed) > VEHICLE_TUNING.directionChangeSpeed;
  const brake = Math.max(requestedBrake, opposing ? Math.abs(throttle) : 0);
  const speedLimit =
    throttle < 0
      ? VEHICLE_TUNING.maxReverseSpeed
      : VEHICLE_TUNING.maxForwardSpeed;
  const governor = clamp((speedLimit - Math.abs(speed)) / 2, 0, 1);
  const engine =
    opposing || brake > 0.01
      ? 0
      : throttle * VEHICLE_TUNING.engineForce * governor;
  const wheelbase = Math.abs(VEHICLE_WHEELS[0].z - VEHICLE_WHEELS[2].z);
  const maxSteer = clamp(
    Math.atan(
      (VEHICLE_TUNING.maxLateralAcceleration * wheelbase) / (speed * speed + 1),
    ),
    VEHICLE_TUNING.minSteering,
    VEHICLE_TUNING.maxSteering,
  );
  return {
    engine,
    brake,
    speedLimit,
    desiredSteer: clamp(input.steer, -1, 1) * maxSteer,
    mode:
      brake > 0.01
        ? "brake"
        : Math.abs(throttle) < 0.01
          ? "coast"
          : throttle > 0
            ? "forward"
            : "reverse",
  } as const;
}
export function rotateVehicleVector(q: VehicleRotation, v: Vec3): Vec3 {
  const tx = 2 * (q.y * v.z - q.z * v.y),
    ty = 2 * (q.z * v.x - q.x * v.z),
    tz = 2 * (q.x * v.y - q.y * v.x);
  return {
    x: v.x + q.w * tx + q.y * tz - q.z * ty,
    y: v.y + q.w * ty + q.z * tx - q.x * tz,
    z: v.z + q.w * tz + q.x * ty - q.y * tx,
  };
}
function multiply(a: VehicleRotation, b: VehicleRotation): VehicleRotation {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
function copyPose(pose: VehiclePose): VehiclePose {
  return { position: { ...pose.position }, rotation: { ...pose.rotation } };
}

/**
 * One persistent chassis with four raycast wheels; world.step is owned by Simulation.
 * position/rotation use the GLB origin (bottom centre), forward +Z, up +Y.
 * Call step exactly once BEFORE each 60Hz world.step, then sample poses afterwards.
 * Driving never writes the body transform; collisions resolve translation AND rotation.
 */
export class VehicleEntity {
  readonly id: string;
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  controller!: RAPIER.DynamicRayCastVehicleController;
  driverId: string | null = null;
  parked = false;
  parking: VehiclePose;
  steering = 0;
  private disposed = false;
  private wheelSpin = [0, 0, 0, 0];
  private suspension = [0.25, 0.25, 0.25, 0.25];
  private wheelContact = [false, false, false, false];
  private readonly home: VehiclePose;

  constructor(
    readonly world: RAPIER.World,
    position: Vec3,
    options: { id?: string; yaw?: number; parked?: boolean } = {},
  ) {
    this.id = options.id ?? "campus-car";
    const yaw = options.yaw ?? 0,
      rotation = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
    if (!validPose({ position, rotation }))
      throw new TypeError("Invalid vehicle initial pose");
    this.home = copyPose({ position, rotation });
    this.parking = copyPose(this.home);
    this.createPhysics(position, rotation);
    if (options.parked) this.park();
  }

  private createPhysics(position: Vec3, rotation: VehicleRotation) {
    const world = this.world;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(position.x, position.y, position.z)
        .setRotation(rotation)
        .setAdditionalMassProperties(
          VEHICLE_TUNING.mass,
          { x: 0, y: 0.42, z: 0 },
          { x: 1_350, y: 1_100, z: 900 },
          IDENTITY,
        )
        .setGravityScale(9.81 / Math.max(0.01, Math.abs(world.gravity.y)))
        .setLinearDamping(0.12)
        .setAngularDamping(1.5)
        // Raycast suspension writes impulses outside world.step. Auto-sleep can
        // otherwise leave a sleeping chassis with a non-zero suspension velocity.
        .setCanSleep(false)
        .setCcdEnabled(true)
        .setSoftCcdPrediction(0.3)
        .setAdditionalSolverIterations(4),
    );
    this.collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(1.02, 0.615, 1.78)
        .setTranslation(0, 0.945, 0)
        .setDensity(0)
        .setFriction(0.35)
        .setRestitution(0),
      this.body,
    );
    this.controller = world.createVehicleController(this.body);
    this.controller.indexUpAxis = 1;
    // The Rapier 0.21 setter really is named setIndexForwardAxis (not a typo here).
    this.controller.setIndexForwardAxis = 2;
    for (const connection of VEHICLE_WHEELS) {
      this.controller.addWheel(
        connection,
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        VEHICLE_TUNING.suspensionRest,
        VEHICLE_TUNING.wheelRadius,
      );
      const i = this.controller.numWheels() - 1;
      this.controller.setWheelMaxSuspensionTravel(
        i,
        VEHICLE_TUNING.suspensionTravel,
      );
      this.controller.setWheelSuspensionStiffness(
        i,
        VEHICLE_TUNING.suspensionStiffness,
      );
      this.controller.setWheelSuspensionCompression(
        i,
        VEHICLE_TUNING.suspensionCompression,
      );
      this.controller.setWheelSuspensionRelaxation(
        i,
        VEHICLE_TUNING.suspensionRelaxation,
      );
      this.controller.setWheelMaxSuspensionForce(i, 9_000);
      this.controller.setWheelFrictionSlip(i, 2.3);
      this.controller.setWheelSideFrictionStiffness(i, 0.8);
    }
  }

  get position(): Vec3 {
    return this.body.translation();
  }
  get rotation(): VehicleRotation {
    return this.body.rotation();
  }
  get yaw(): number {
    const forward = rotateVehicleVector(this.rotation, { x: 0, y: 0, z: 1 });
    return Math.atan2(forward.x, forward.z);
  }
  get speed(): number {
    return dot(
      this.body.linvel(),
      rotateVehicleVector(this.rotation, { x: 0, y: 0, z: 1 }),
    );
  }

  /** GLB is authored around bottom centre: no unexplained render Y offset. */
  getVisualPose(): VehiclePose {
    return copyPose({ position: this.position, rotation: this.rotation });
  }

  step(input: VehicleInput, dt = FIXED_DT) {
    if (this.disposed) return;
    if (Math.abs(dt - FIXED_DT) > 1e-8)
      throw new RangeError(
        "VehicleEntity requires the shared fixed 1/60s physics step",
      );
    if (this.parked) return;
    const speed = this.speed,
      throttle = clamp(input.throttle, -1, 1),
      requestedBrake = clamp(input.brake ?? 0, 0, 1);
    const { brake, speedLimit, engine, desiredSteer } = arcadeDriveCommand(
      speed,
      input,
    );
    this.steering = approach(
      this.steering,
      desiredSteer,
      (Math.abs(desiredSteer) < Math.abs(this.steering) ? 2.7 : 1.8) * dt,
    );
    const neutralBrake =
      Math.abs(throttle) < 0.01 ? (Math.abs(speed) < 0.35 ? 1 : 0.04) : 0;
    for (let i = 0; i < 4; i++) {
      this.controller.setWheelSteering(i, i < 2 ? this.steering : 0);
      this.controller.setWheelEngineForce(i, engine / 4);
      // Rapier wheelBrake is an IMPULSE, hence force * fixed dt, not raw force.
      this.controller.setWheelBrake(
        i,
        ((VEHICLE_TUNING.brakeForce * dt) / 4) *
          Math.max(brake, neutralBrake, input.handbrake && i >= 2 ? 1 : 0),
      );
      this.controller.setWheelFrictionSlip(
        i,
        input.handbrake && i >= 2 ? 0.9 : 2.3,
      );
    }
    if (
      Math.abs(throttle) > 0.01 ||
      Math.abs(input.steer) > 0.01 ||
      requestedBrake > 0.01
    )
      this.body.wakeUp();
    this.controller.updateVehicle(
      dt,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
      undefined,
      (collider) => collider.parent()?.handle !== this.body.handle,
    );
    for (let i = 0; i < 4; i++) {
      this.suspension[i] =
        this.controller.wheelSuspensionLength(i) ?? this.suspension[i];
      this.wheelContact[i] = this.controller.wheelIsInContact(i);
      this.wheelSpin[i] =
        (this.wheelSpin[i] + (speed * dt) / VEHICLE_TUNING.wheelRadius) %
        (Math.PI * 2);
    }
    // A bounded aerodynamic governor cannot teleport through scenery or change heading.
    if (Math.abs(speed) > speedLimit && throttle * speed > 0) {
      const forward = rotateVehicleVector(this.rotation, { x: 0, y: 0, z: 1 }),
        drag =
          -Math.sign(speed) *
          Math.min(3_000, (Math.abs(speed) - speedLimit) * 1_000) *
          dt;
      this.body.applyImpulse(
        { x: forward.x * drag, y: forward.y * drag, z: forward.z * drag },
        true,
      );
    }
  }

  unpark(driverId: string): boolean {
    if (
      this.disposed ||
      !driverId ||
      (this.driverId !== null && this.driverId !== driverId)
    )
      return false;
    this.driverId = driverId;
    this.parked = false;
    this.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    return true;
  }

  /** Freeze in the CURRENT physical pose, retaining the collider and entity identity. */
  park() {
    this.parking = copyPose({
      position: this.position,
      rotation: this.rotation,
    });
    this.driverId = null;
    this.parked = true;
    this.steering = 0;
    this.body.setLinvel(ZERO, false);
    this.body.setAngvel(ZERO, false);
    this.body.resetForces(false);
    this.body.resetTorques(false);
    this.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
  }

  /** Explicit recovery/admin operation; caller must first validate a safe empty pose. */
  reset(position?: Vec3, yaw?: number) {
    const parking = validPose(this.parking) ? this.parking : this.home;
    const target = position ?? parking.position;
    this.restore({
      id: this.id,
      driverId: this.driverId,
      parked: this.parked,
      parking: copyPose(parking),
      position: { ...target },
      rotation:
        yaw === undefined
          ? { ...parking.rotation }
          : { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      linvel: { ...ZERO },
      angvel: { ...ZERO },
      steering: 0,
      force: { ...ZERO },
      torque: { ...ZERO },
      wheelSpin: [0, 0, 0, 0],
      wheelSuspension: [0.25, 0.25, 0.25, 0.25],
      wheelContact: [false, false, false, false],
      sleeping: false,
    });
    if (this.parked)
      this.parking = copyPose({
        position: this.position,
        rotation: this.rotation,
      });
  }

  /** Emergency recovery never samples a potentially corrupt body/controller.
   * Keep the vehicle entity identity, recreate its native dynamics and clear
   * contact/suspension caches. The caller supplies an independently safe pose. */
  recover(position = this.home.position, rotation = this.home.rotation) {
    if (this.disposed) throw new Error("Cannot recover a disposed vehicle");
    const pose = { position, rotation };
    if (!validPose(pose)) throw new TypeError("Invalid vehicle recovery pose");
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
    this.createPhysics(position, rotation);
    this.driverId = null;
    this.parked = false;
    this.steering = 0;
    this.wheelSpin.fill(0);
    this.suspension.fill(0.25);
    this.wheelContact.fill(false);
    this.park();
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  capture(): VehicleState {
    return {
      id: this.id,
      driverId: this.driverId,
      parked: this.parked,
      parking: copyPose(this.parking),
      position: { ...this.position },
      rotation: { ...this.rotation },
      linvel: { ...this.body.linvel() },
      angvel: { ...this.body.angvel() },
      steering: this.steering,
      wheelSpin: [...this.wheelSpin],
      wheelSuspension: [...this.suspension],
      wheelContact: [...this.wheelContact],
      force: { ...this.body.userForce() },
      torque: { ...this.body.userTorque() },
      sleeping: this.body.isSleeping(),
    };
  }

  /**
   * Restore all game-owned dynamics. Rapier contact warm-start caches belong to the
   * world: use world.takeSnapshot/restoreSnapshot for exact whole-world rollback.
   * Wheel contacts/springs are recomputed on the next updateVehicle, never serialized
   * as collider handles; internal Rapier wheel spin is visual-only, so we own it here.
   */
  restore(state: VehicleState) {
    if (state.id !== this.id)
      throw new Error("Cannot restore another vehicle identity");
    if (!validVehicleState(state))
      throw new TypeError("Invalid vehicle physical state");
    this.driverId = state.driverId;
    this.parked = state.parked;
    this.parking = copyPose(state.parking);
    this.steering = state.steering;
    this.wheelSpin = [...state.wheelSpin];
    this.suspension = [...state.wheelSuspension];
    this.wheelContact = [...state.wheelContact];
    this.body.setBodyType(
      state.parked ? RAPIER.RigidBodyType.Fixed : RAPIER.RigidBodyType.Dynamic,
      false,
    );
    this.body.setTranslation(state.position, false);
    this.body.setRotation(state.rotation, false);
    this.body.setLinvel(state.linvel, false);
    this.body.setAngvel(state.angvel, false);
    this.body.resetForces(false);
    this.body.resetTorques(false);
    this.body.addForce(state.force, false);
    this.body.addTorque(state.torque, false);
    for (let i = 0; i < 4; i++)
      this.controller.setWheelSteering(i, i < 2 ? state.steering : 0);
    if (state.sleeping) this.body.sleep();
    else this.body.wakeUp();
    this.world.propagateModifiedBodyPositionsToColliders();
  }

  wheelPoses(): WheelPose[] {
    const position = this.position,
      rotation = this.rotation;
    return VEHICLE_WHEELS.map((connection, i) => {
      const steering = i < 2 ? this.steering : 0,
        spin = this.wheelSpin[i],
        local = {
          x: connection.x,
          y: connection.y - this.suspension[i],
          z: connection.z,
        },
        turn = {
          x: 0,
          y: Math.sin(steering / 2),
          z: 0,
          w: Math.cos(steering / 2),
        },
        roll = { x: Math.sin(spin / 2), y: 0, z: 0, w: Math.cos(spin / 2) };
      return {
        index: i,
        position: plus(position, rotateVehicleVector(rotation, local)),
        rotation: multiply(multiply(rotation, turn), roll),
        steering,
        spin,
        suspensionLength: this.suspension[i],
        grounded: this.wheelContact[i],
      };
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.world.removeVehicleController(this.controller);
    this.world.removeRigidBody(this.body);
  }
}
