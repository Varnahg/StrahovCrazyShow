import RAPIER from "@dimforge/rapier3d-compat";
import { stepRigidWorld } from "./physics-step";
import {
  B6_BOXES,
  BUILDINGS,
  BOUNDS,
  SPAWN,
  CAR_SPAWN,
  GROUND_RECTS,
  TREES,
  TERRAIN_COVERAGE,
} from "./world";
import {
  groundHeight,
  buildingBaseHeight,
  createTerrainTiles,
  terrainCollisionData,
  PARKING_SLOTS,
} from "./terrain";
import { groundRotation } from "./terrain-entities";
import type { Vec3, Input } from "./types";
import { FIXED_DT, type ActorState } from "./netcode";
import { B6_PROP_COLLISIONS } from "./b6-props";
import { B6_LAYOUT, B6_STAIR_MESHES } from "./b6-interior";
import { buildLandmarkPlan } from "./landmark-reality";
import {
  VehicleEntity,
  finiteVehiclePosition,
  vehicleExitAllowed,
  rotateVehicleVector,
  type VehicleState,
} from "./vehicle";
import { sampleTransit, transitObstacles } from "./transit";
import { STREET_COLLISIONS } from "./streets";
import { buildCampusExteriorPlan } from "./campus-exterior";
import { buildOutdoorWorldPlan } from "./outdoor-world";
import { treeTrunkCollision } from "./vegetation";
import type { PhotogrammetryCollision } from "./photogrammetry-gameplay";
import { photogrammetryEntranceRepair } from "./photogrammetry-repairs";
import { getPhotogrammetryGroundPatchGeometry } from "./photogrammetry-ground";
import { buildingRoofGeometry } from "./building-roofs";
export const CHARACTER_RADIUS = 0.42,
  CHARACTER_HALF_HEIGHT = 0.38;
let initialized: Promise<void> | undefined;
export const initPhysics = () => (initialized ??= RAPIER.init());
export class Simulation {
  world: RAPIER.World;
  actors = new Map<string, Actor>();
  car: VehicleEntity;
  carStepped = false;
  trafficBodies = new Map<string, RAPIER.RigidBody>();
  trafficAt = -Infinity;
  trafficCache: ReturnType<typeof transitObstacles> = [];
  trafficVelocities = new Map<string, { x: number; z: number }>();
  get parkedCar() {
    return this.car.parked ? this.car.collider : null;
  }
  walkingColliders = new Set<number>();
  groundColliders = new Set<number>();
  readonly buildingRoofColliders = new Map<string, RAPIER.Collider>();
  constructor(public readonly photogrammetry?: PhotogrammetryCollision) {
    this.world = new RAPIER.World({ x: 0, y: -18, z: 0 });
    this.world.timestep = FIXED_DT;
    if (photogrammetry) {
      const ground = this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          photogrammetry.positions,
          photogrammetry.indices,
          RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
        ),
      );
      this.groundColliders.add(ground.handle);
      const patches = getPhotogrammetryGroundPatchGeometry();
      if (patches.indices.length) {
        const patch = this.world.createCollider(
          RAPIER.ColliderDesc.trimesh(
            new Float32Array(patches.positions),
            new Uint32Array(patches.indices),
            RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
          ),
        );
        this.groundColliders.add(patch.handle);
      }
      const approach = photogrammetryEntranceRepair();
      this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          approach.positions,
          approach.indices,
          RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
        ),
      );
    } else {
      const terrain = terrainCollisionData(
        createTerrainTiles(GROUND_RECTS, TERRAIN_COVERAGE),
      );
      const ground = this.world.createCollider(
        RAPIER.ColliderDesc.trimesh(
          terrain.vertices,
          terrain.indices,
          RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
        ),
      );
      this.groundColliders.add(ground.handle);
      for (const plan of [
        buildLandmarkPlan({
          buildings: BUILDINGS,
          baseElevation: (b) => buildingBaseHeight(b.points),
        }),
        buildCampusExteriorPlan(),
      ]) {
        const solid = plan.collision;
        if (solid.indices.length)
          this.world.createCollider(
            RAPIER.ColliderDesc.trimesh(
              new Float32Array(solid.positions),
              new Uint32Array(solid.indices),
              RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
            ),
          );
        if (plan.twoSidedRoofCollision.indices.length)
          this.createTwoSidedSurfaceCollider(plan.twoSidedRoofCollision);
        if (
          "twoSidedExteriorCollision" in plan &&
          plan.twoSidedExteriorCollision.indices.length
        )
          this.createTwoSidedSurfaceCollider(plan.twoSidedExteriorCollision);
      }
      for (const b of BUILDINGS) {
        if (b.name.endsWith("blok 6")) continue;
        const baseY = buildingBaseHeight(b.points);
        for (let i = 1; i < b.points.length; i++) {
          const [x, z] = b.points[i - 1],
            [nx, nz] = b.points[i];
          const length = Math.hypot(nx - x, nz - z);
          if (length < 0.2) continue;
          const bottom =
              Math.min(baseY, groundHeight(x, z), groundHeight(nx, nz)) - 0.15,
            height = b.height + baseY - bottom;
          this.solid(
            (x + nx) / 2,
            bottom + height / 2,
            (z + nz) / 2,
            0.5,
            height,
            length,
            Math.atan2(nx - x, nz - z),
          );
        }
        const roof = buildingRoofGeometry(b, baseY);
        if (roof?.indices.length)
          this.buildingRoofColliders.set(
            b.id,
            this.createTwoSidedSurfaceCollider(roof),
          );
      }
    }
    for (const b of B6_BOXES)
      this.solid(
        b.x,
        b.y + B6_LAYOUT.foundationOffset,
        b.z,
        b.w,
        b.h,
        b.d,
        b.yaw,
      );
    for (const stair of B6_STAIR_MESHES)
      if (stair.collides && stair.indices.length)
        this.world.createCollider(
          RAPIER.ColliderDesc.trimesh(
            Float32Array.from(stair.positions),
            Uint32Array.from(stair.indices),
            RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES,
          ).setTranslation(0, B6_LAYOUT.foundationOffset, 0),
        );
    if (!photogrammetry) {
      for (const p of TREES) {
        const trunk = treeTrunkCollision(p);
        this.world.createCollider(
          RAPIER.ColliderDesc.cylinder(
            trunk.height / 2,
            trunk.radius,
          ).setTranslation(
            trunk.x,
            groundHeight(trunk.x, trunk.z) + trunk.height / 2,
            trunk.z,
          ),
        );
      }
      for (const b of STREET_COLLISIONS)
        this.solid(b.x, b.y, b.z, b.w, b.h, b.d, b.yaw);
      for (const b of buildOutdoorWorldPlan().colliders)
        this.solid(b.x, b.y, b.z, b.w, b.h, b.d, b.yaw);
    }
    for (const b of B6_PROP_COLLISIONS)
      this.solid(
        b.x,
        b.y + B6_LAYOUT.foundationOffset,
        b.z,
        b.w,
        b.h,
        b.d,
        b.yaw,
      );
    stepRigidWorld(this.world);
    const carSpawn = this.carSpawnPose();
    this.car = new VehicleEntity(this.world, carSpawn.position, {
      parked: true,
    });
    this.car.body.setRotation(carSpawn.rotation, true);
    this.car.park();
    for (const slot of photogrammetry ? [] : PARKING_SLOTS) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed()
          .setTranslation(slot.x, groundHeight(slot.x, slot.z) - 0.0112, slot.z)
          .setRotation(groundRotation(slot.x, slot.z, slot.yaw)),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(1.02, 0.615, 1.78).setTranslation(
          0,
          0.945,
          0,
        ),
        body,
      );
    }
    const rail = (x: number, z: number, nx: number, nz: number) => {
      const lo = Math.min(groundHeight(x, z), groundHeight(nx, nz)),
        hi = Math.max(groundHeight(x, z), groundHeight(nx, nz));
      this.solid(
        (x + nx) / 2,
        (lo + hi) / 2 + 2.5,
        (z + nz) / 2,
        1,
        hi - lo + 6,
        Math.hypot(nx - x, nz - z) + 0.05,
        Math.atan2(nx - x, nz - z),
      );
    };
    for (let z = BOUNDS.minZ - 1; z < BOUNDS.maxZ + 1; z += 10)
      for (const x of [BOUNDS.minX - 1, BOUNDS.maxX + 1])
        rail(x, z, x, Math.min(BOUNDS.maxZ + 1, z + 10));
    for (let x = BOUNDS.minX - 1; x < BOUNDS.maxX + 1; x += 10)
      for (const z of [BOUNDS.minZ - 1, BOUNDS.maxZ + 1])
        rail(x, z, Math.min(BOUNDS.maxX + 1, x + 10), z);
    stepRigidWorld(this.world);
  }
  private createTwoSidedSurfaceCollider(data: {
    positions: number[];
    indices: number[];
  }) {
    // Roofs and visible closure panels are surfaces, not closed solids:
    // retain contacts from both sides without inventing duplicate faces.
    return this.world.createCollider(
      RAPIER.ColliderDesc.trimesh(
        new Float32Array(data.positions),
        new Uint32Array(data.indices),
        RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES_TWO_SIDED,
      ),
    );
  }
  solid(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    yaw = 0,
  ) {
    return this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
        .setTranslation(x, y, z)
        .setRotation({
          x: 0,
          y: Math.sin(yaw / 2),
          z: 0,
          w: Math.cos(yaw / 2),
        }),
    );
  }
  surfaceHeight(x: number, z: number) {
    const nominal = groundHeight(x, z);
    if (!this.photogrammetry) return nominal;
    // Start close to the known ground, never at a canopy/roof height. This is
    // only a spawn/exit helper; movement uses the actual source trimesh.
    const ray = new RAPIER.Ray(
      { x, y: nominal + 0.6, z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      3,
      true,
      undefined,
      undefined,
      undefined,
      undefined,
      (c) => this.groundColliders.has(c.handle),
    );
    return hit && hit.normal.y > 0.35
      ? ray.origin.y - hit.timeOfImpact
      : nominal;
  }
  setParkedCar(p: Vec3 | null, yaw = 0) {
    if (p) {
      this.car.park();
      this.car.reset({ x: p.x, y: p.y - 0.8, z: p.z }, yaw);
    }
  }
  restorePublicCar(state: VehicleState) {
    // A remote vehicle is a replicated obstacle, never a second local driver.
    this.car.restore({ ...state, parked: true, driverId: null });
  }
  exitPosition(actor: Actor): Vec3 | null {
    if (actor.vehicle && !vehicleExitAllowed(this.car.speed)) return null;
    const p = actor.position;
    for (const angle of [
      actor.yaw + Math.PI / 2,
      actor.yaw - Math.PI / 2,
      actor.yaw + Math.PI,
      actor.yaw,
    ]) {
      const candidate = {
        x: p.x + Math.sin(angle) * 2.7,
        y: 0,
        z: p.z + Math.cos(angle) * 2.7,
      };
      candidate.y =
        this.surfaceHeight(candidate.x, candidate.z) +
        CHARACTER_HALF_HEIGHT +
        CHARACTER_RADIUS +
        0.12;
      if (
        candidate.x < BOUNDS.minX + 1 ||
        candidate.x > BOUNDS.maxX - 1 ||
        candidate.z < BOUNDS.minZ + 1 ||
        candidate.z > BOUNDS.maxZ - 1
      )
        continue;
      if (
        !this.world.intersectionWithShape(
          candidate,
          { x: 0, y: 0, z: 0, w: 1 },
          new RAPIER.Capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
          undefined,
          undefined,
          actor.collider,
          actor.body,
        )
      )
        return candidate;
    }
    return null;
  }
  cameraDistance(from: Vec3, to: Vec3, actor: Actor) {
    const dx = to.x - from.x,
      dy = to.y - from.y,
      dz = to.z - from.z,
      length = Math.hypot(dx, dy, dz);
    if (length < 0.01) return length;
    const velocity = {
      x: dx / length,
      y: dy / length,
      z: dz / length,
    };
    const hit = this.world.castShape(
      from,
      { x: 0, y: 0, z: 0, w: 1 },
      velocity,
      new RAPIER.Ball(0.22),
      0.01,
      length,
      true,
      undefined,
      undefined,
      actor.collider,
      actor.vehicle ? this.car.body : actor.body,
      (c) => !this.walkingColliders.has(c.handle),
    );
    return hit ? Math.max(0.2, hit.time_of_impact - 0.03) : length;
  }
  hasLineOfSight(from: Vec3, to: Vec3, actor: Actor) {
    const dx = to.x - from.x,
      dy = to.y - from.y,
      dz = to.z - from.z,
      length = Math.hypot(dx, dy, dz);
    if (length < 0.1) return true;
    const hit = this.world.castRay(
      new RAPIER.Ray(from, { x: dx / length, y: dy / length, z: dz / length }),
      length,
      true,
      undefined,
      undefined,
      actor.collider,
      actor.vehicle ? this.car.body : actor.body,
      (c) => !this.walkingColliders.has(c.handle),
    );
    return !hit || hit.timeOfImpact >= length - 0.3;
  }
  floorHeight(x: number, z: number, footY: number, actor: Actor) {
    const ray = new RAPIER.Ray(
      { x, y: footY + 0.45, z },
      { x: 0, y: -1, z: 0 },
    );
    const hit = this.world.castRayAndGetNormal(
      ray,
      1.2,
      true,
      undefined,
      undefined,
      actor.collider,
      actor.body,
      (c) => !this.walkingColliders.has(c.handle),
    );
    return hit && hit.normal.y > 0.45
      ? ray.origin.y - hit.timeOfImpact
      : undefined;
  }
  add(id: string, p: Vec3 = SPAWN) {
    if (p === SPAWN && this.photogrammetry)
      p = { ...SPAWN, y: this.surfaceHeight(SPAWN.x, SPAWN.z) + 1 };
    const actor = new Actor(this, id, p);
    this.actors.set(id, actor);
    return actor;
  }
  /** Explicit user recovery is independent of the broken pose and exit-speed
   * rule. Never teleport another driver's shared car. */
  respawnActor(id: string): boolean {
    const actor = this.actors.get(id);
    if (!actor) return false;
    this.recoverOwnedCar(actor);
    actor.resetOnFoot({
      ...SPAWN,
      y: this.photogrammetry
        ? this.surfaceHeight(SPAWN.x, SPAWN.z) + 1
        : SPAWN.y,
    });
    return true;
  }
  private carSpawnPose() {
    return {
      position: {
        x: CAR_SPAWN.x,
        y: this.surfaceHeight(CAR_SPAWN.x, CAR_SPAWN.z) - 0.0112,
        z: CAR_SPAWN.z,
      },
      rotation: groundRotation(
        CAR_SPAWN.x,
        CAR_SPAWN.z,
        CAR_SPAWN.yaw,
        3.56,
        2.04,
        (x, z) => this.surfaceHeight(x, z),
      ),
    };
  }
  recoverOwnedCar(actor: Actor) {
    if (
      (actor.vehicle || this.car.driverId === actor.id) &&
      (this.car.driverId === null || this.car.driverId === actor.id)
    ) {
      const pose = this.carSpawnPose();
      this.car.recover(pose.position, pose.rotation);
      this.carStepped = false;
    }
  }
  remove(id: string) {
    const a = this.actors.get(id);
    if (a) {
      if (a.vehicle) this.car.park();
      this.walkingColliders.delete(a.collider.handle);
      this.world.removeRigidBody(a.body);
      this.world.removeCharacterController(a.controller);
      this.actors.delete(id);
    }
  }
  tick(now = Date.now()) {
    if (now - this.trafficAt >= 33 || now < this.trafficAt) {
      const frame = sampleTransit(now);
      this.trafficCache = transitObstacles(frame);
      this.trafficAt = now;
      this.trafficVelocities = new Map(
        [...frame.buses, ...frame.traffic].map((v) => [
          v.id,
          { x: Math.sin(v.yaw) * v.speed, z: Math.cos(v.yaw) * v.speed },
        ]),
      );
    }
    const obstacles = this.trafficCache,
      ids = new Set(obstacles.map((o) => o.id));
    for (const [id, body] of this.trafficBodies)
      if (!ids.has(id)) {
        this.world.removeRigidBody(body);
        this.trafficBodies.delete(id);
      }
    for (const obstacle of obstacles) {
      const q = this.photogrammetry
        ? groundRotation(
            obstacle.position.x,
            obstacle.position.z,
            obstacle.yaw,
            obstacle.dimensions.z,
            obstacle.dimensions.x,
            (x, z) => this.surfaceHeight(x, z),
          )
        : obstacle.rotation;
      let body = this.trafficBodies.get(obstacle.id);
      if (!body) {
        body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(
              obstacle.position.x,
              obstacle.position.y +
                this.surfaceHeight(obstacle.position.x, obstacle.position.z) -
                groundHeight(obstacle.position.x, obstacle.position.z),
              obstacle.position.z,
            )
            .setRotation(q),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(
            obstacle.dimensions.x / 2,
            obstacle.dimensions.y / 2,
            obstacle.dimensions.z / 2,
          ),
          body,
        );
        this.trafficBodies.set(obstacle.id, body);
      }
      const velocity = this.trafficVelocities.get(obstacle.id)!,
        ahead = Math.max(0, now - this.trafficAt) / 1000;
      body.setNextKinematicTranslation({
        x: obstacle.position.x + velocity.x * ahead,
        y:
          obstacle.position.y +
          this.surfaceHeight(
            obstacle.position.x + velocity.x * ahead,
            obstacle.position.z + velocity.z * ahead,
          ) -
          groundHeight(obstacle.position.x, obstacle.position.z),
        z: obstacle.position.z + velocity.z * ahead,
      });
      body.setNextKinematicRotation(q);
    }
    if (!this.carStepped && !this.car.parked)
      this.car.step({ throttle: 0, steer: 0 });
    stepRigidWorld(this.world);
    this.carStepped = false;
  }
  dispose() {
    this.world.free();
  }
}
export class Actor {
  body!: RAPIER.RigidBody;
  collider!: RAPIER.Collider;
  controller!: RAPIER.KinematicCharacterController;
  private footYaw = 0;
  private footSpeed = 0;
  get yaw() {
    if (!this.vehicle) return this.footYaw;
    const f = rotateVehicleVector(this.sim.car.rotation, { x: 0, y: 0, z: 1 });
    return Math.atan2(f.x, f.z);
  }
  set yaw(value: number) {
    this.footYaw = value;
  }
  get speed() {
    return this.vehicle ? this.sim.car.speed : this.footSpeed;
  }
  set speed(value: number) {
    this.footSpeed = value;
  }
  vertical = 0;
  vehicle = false;
  grounded = false;
  constructor(
    public sim: Simulation,
    public id: string,
    p: Vec3,
  ) {
    this.createPhysics(p);
  }
  private createPhysics(p: Vec3) {
    const sim = this.sim;
    this.body = sim.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        p.x,
        p.y,
        p.z,
      ),
    );
    this.collider = sim.world.createCollider(
      RAPIER.ColliderDesc.capsule(CHARACTER_HALF_HEIGHT, CHARACTER_RADIUS),
      this.body,
    );
    sim.walkingColliders.add(this.collider.handle);
    this.controller = sim.world.createCharacterController(0.02);
    this.controller.enableAutostep(0.22, 0.2, false);
    this.controller.enableSnapToGround(0.25);
    this.controller.setSlideEnabled(true);
  }
  /** Replace native kinematic/controller state without reading old translation,
   * rotation, velocity, next target or the vehicle's potentially invalid pose. */
  resetOnFoot(position: Vec3, yaw = 0) {
    if (!finiteVehiclePosition(position) || !Number.isFinite(yaw))
      throw new TypeError("Invalid actor recovery pose");
    this.sim.walkingColliders.delete(this.collider.handle);
    this.sim.world.removeCharacterController(this.controller);
    this.sim.world.removeRigidBody(this.body);
    this.vehicle = false;
    this.footYaw = yaw;
    this.footSpeed = 0;
    this.vertical = 0;
    this.grounded = false;
    this.createPhysics(position);
    this.body.setNextKinematicTranslation(position);
    this.sim.world.propagateModifiedBodyPositionsToColliders();
  }
  get position() {
    if (this.vehicle) {
      const p = this.sim.car.position;
      return { x: p.x, y: p.y + 0.8, z: p.z };
    }
    return this.body.translation();
  }
  setPosition(p: Vec3) {
    if (this.vehicle) {
      this.sim.car.reset({ x: p.x, y: p.y - 0.8, z: p.z }, this.yaw);
      return;
    }
    this.body.setTranslation(p, true);
    this.body.setNextKinematicTranslation(p);
    this.sim.world.propagateModifiedBodyPositionsToColliders();
    this.vertical = 0;
    this.grounded = false;
  }
  setVehicle(enabled: boolean) {
    if (enabled === this.vehicle) return;
    const p = { ...this.position },
      yaw = this.yaw;
    if (enabled && !this.sim.car.unpark(this.id))
      throw new Error("Auto právě používá jiný hráč.");
    if (!enabled) this.sim.car.park();
    this.vehicle = enabled;
    this.body.setEnabled(!enabled);
    if (!enabled) {
      this.footYaw = yaw;
      this.footSpeed = 0;
      this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      this.setPosition(p);
    }
  }
  capture(): ActorState {
    return {
      position: { ...this.position },
      yaw: this.yaw,
      speed: this.speed,
      vertical: this.vertical,
      grounded: this.grounded,
      vehicle: this.vehicle,
      vehicleState: this.vehicle ? this.sim.car.capture() : undefined,
    };
  }
  restore(state: ActorState, hard = false) {
    if (hard && !state.vehicle) {
      this.sim.recoverOwnedCar(this);
      this.resetOnFoot(state.position, state.yaw);
      this.footSpeed = Number.isFinite(state.speed) ? state.speed : 0;
      this.vertical = Number.isFinite(state.vertical) ? state.vertical : 0;
      this.grounded = state.grounded;
      return;
    }
    if (state.vehicle && state.vehicleState) {
      this.sim.car.restore({ ...state.vehicleState, driverId: this.id });
      this.vehicle = true;
      this.body.setEnabled(false);
      this.vertical = state.vertical;
      this.grounded = state.grounded;
      return;
    }
    if (this.vehicle !== state.vehicle) this.setVehicle(state.vehicle);
    this.setPosition(state.position);
    this.yaw = state.yaw;
    this.speed = state.speed;
    this.vertical = state.vertical;
    this.grounded = state.grounded;
    this.body.setRotation(
      state.vehicle
        ? { x: 0, y: Math.sin(this.yaw / 2), z: 0, w: Math.cos(this.yaw / 2) }
        : { x: 0, y: 0, z: 0, w: 1 },
      true,
    );
    this.sim.world.propagateModifiedBodyPositionsToColliders();
  }
  step(input: Input, dt = FIXED_DT) {
    let dx = 0,
      dz = 0;
    if (this.vehicle) {
      this.sim.car.step(
        { throttle: input.z, steer: input.x, handbrake: input.jump },
        dt,
      );
      this.sim.carStepped = true;
      this.grounded = this.sim.car.capture().wheelContact.some(Boolean);
      this.vertical = this.sim.car.body.linvel().y;
      return;
    } else {
      const n = Math.max(1, Math.hypot(input.x, input.z)),
        speed = input.run ? 7 : 4.6;
      dx = (input.x / n) * speed * dt;
      dz = (input.z / n) * speed * dt;
      this.speed = Math.hypot(dx, dz) / dt;
      if (this.speed > 0.1) this.yaw = Math.atan2(dx, dz);
    }
    if (this.grounded) {
      this.vertical = -0.3;
      if (input.jump && !this.vehicle) this.vertical = 6;
    }
    this.vertical = Math.max(-20, this.vertical - 18 * dt);
    this.controller.computeColliderMovement(
      this.collider,
      { x: dx, y: this.vertical * dt, z: dz },
      undefined,
      undefined,
      (c) =>
        c.handle !== this.collider.handle &&
        !this.sim.walkingColliders.has(c.handle),
    );
    const delta = this.controller.computedMovement(),
      p = this.position;
    if (!this.vehicle) this.speed = Math.hypot(delta.x, delta.z) / dt;
    this.grounded = this.controller.computedGrounded();
    // Rapier's convex sweep can produce millimetre-scale rises on a perfectly
    // flat heightfield at large X. Resolve the flat contact against its actual
    // ray surface; preserve jumps, stairs, ramps and any prop above the ground.
    if (!this.vehicle && this.vertical <= 0 && !input.jump) {
      const ray = new RAPIER.Ray(
        { x: p.x + delta.x, y: p.y + 0.1, z: p.z + delta.z },
        { x: 0, y: -1, z: 0 },
      );
      const support = this.sim.world.castRayAndGetNormal(
        ray,
        1.1,
        true,
        undefined,
        undefined,
        this.collider,
        this.body,
        (c) => !this.sim.walkingColliders.has(c.handle),
      );
      if (
        support &&
        this.sim.groundColliders.has(support.collider.handle) &&
        support.normal.y > 0.999
      ) {
        const expected =
          ray.origin.y -
          support.timeOfImpact +
          CHARACTER_HALF_HEIGHT +
          CHARACTER_RADIUS +
          0.0201;
        if (Math.abs(p.y + delta.y - expected) < 0.015) {
          delta.y = expected - p.y;
          this.grounded = true;
        }
      }
    }
    if (this.grounded && this.vertical < 0) this.vertical = 0;
    this.body.setNextKinematicTranslation({
      x: p.x + delta.x,
      y: p.y + delta.y,
      z: p.z + delta.z,
    });
    if (p.y < groundHeight(p.x, p.z) - 8) this.setPosition(SPAWN);
  }
}
