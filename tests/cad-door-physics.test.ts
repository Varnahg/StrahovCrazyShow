import { test } from "node:test";
import assert from "node:assert/strict";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  Actor,
  initPhysics,
  CHARACTER_RADIUS,
  CHARACTER_HALF_HEIGHT,
  type Simulation,
} from "../shared/simulation";
import {
  placeCadDoorDefinition,
  cadDoorPose,
  CadDoorStateStore,
} from "../shared/cad-doors";
import { CadDoorTimeline } from "../shared/cad-door-timeline";
import { CAD_DOOR_DEFINITIONS } from "../shared/cad-buildings";
import { groundHeight } from "../shared/terrain";
import { VehicleEntity } from "../shared/vehicle";
import {
  CadDoorPhysics,
  CAD_DOOR_QUERY_GROUPS,
  cadDoorSweepIntersectsCapsule,
  type CadDoorCapsuleProbe,
  type CadDoorObstacleProbe,
} from "../shared/cad-door-physics";

await initPhysics();
const definition = placeCadDoorDefinition(
  {
    id: "b06:N01:test",
    buildingId: "b06",
    floor: "N01",
    sourceDoorId: "test",
    renderPartIds: ["leaf", "handle"],
    collisionPartIds: [],
    hingeModel: { x: 0, y: 1, z: 0 },
    closedPose: { position: { x: 0.5, y: 1, z: 0 }, rotationY: 0 },
    collider: { halfExtents: { x: 0.5, y: 1, z: 0.019 } },
    openAngle: Math.PI / 2,
    handleModel: { x: 0.9, y: 1, z: 0.04 },
    defaultOpen: false,
  },
  { translation: { x: 0, y: 40, z: 0 }, yaw: 0 },
);
const id = definition.id;
function fixture() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
    walkingColliders = new Set<number>(),
    groundColliders = new Set<number>();
  const floor = world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 0.1, 5).setTranslation(0, 39.9, 0),
  );
  groundColliders.add(floor.handle);
  const physics = new CadDoorPhysics(world, [definition], {
    ignoredColliders: walkingColliders,
  });
  let ticks = 0;
  const nativeStep = world.step.bind(world);
  world.step = () => {
    ticks++;
    nativeStep();
  };
  return {
    world,
    physics,
    walkingColliders,
    groundColliders,
    get ticks() {
      return ticks;
    },
    dispose() {
      physics.dispose();
      world.free();
    },
  };
}
function rayAt(
  world: RAPIER.World,
  open: boolean,
  groups: number | null = CAD_DOOR_QUERY_GROUPS,
  flags?: number,
) {
  const origin = open ? { x: 1, y: 41, z: -0.5 } : { x: 0.5, y: 41, z: 1 },
    direction = open ? { x: -1, y: 0, z: 0 } : { x: 0, y: 0, z: -1 };
  return world.castRay(
    new RAPIER.Ray(origin, direction),
    1.5,
    true,
    flags,
    groups ?? undefined,
  );
}
const idle = { x: 0, z: 0, yaw: 0, jump: false, seq: 0 };

test("both fixed poses switch and rewind in immediate Rapier rays, without advancing any physics body", () => {
  const f = fixture();
  try {
    const body = f.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(3, 44, 3),
    );
    f.world.createCollider(RAPIER.ColliderDesc.ball(0.2), body);
    f.world.step();
    const before = { ...body.translation() },
      ticks = f.ticks,
      count = f.world.colliders.len();
    const [closed, opened] = f.physics.collidersFor(id);
    assert.equal(rayAt(f.world, false)?.collider.handle, closed.handle);
    assert.equal(rayAt(f.world, true), null);
    for (const open of [true, false, true, false]) {
      assert.equal(f.physics.apply(id, open), true);
      assert.equal(
        rayAt(f.world, open)?.collider.handle,
        open ? opened.handle : closed.handle,
      );
      assert.equal(rayAt(f.world, !open), null);
      assert.equal(
        rayAt(f.world, open, null, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS)
          ?.collider.handle,
        open ? opened.handle : closed.handle,
      );
      assert.equal(
        rayAt(f.world, !open, null, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS),
        null,
      );
      assert.ok(closed.isEnabled() && opened.isEnabled());
      assert.equal(f.world.colliders.len(), count);
      assert.equal(f.ticks, ticks);
      assert.deepEqual({ ...body.translation() }, before);
    }
    f.physics.apply(id, true);
    for (let i = 0; i < 3; i++) f.world.step();
    const afterTicks = f.ticks;
    f.physics.applyStates([{ id, open: false }]);
    assert.equal(rayAt(f.world, false)?.collider.handle, closed.handle);
    assert.equal(rayAt(f.world, true), null);
    assert.equal(f.ticks, afterTicks);
    // Queries without groups or flags see the inactive sensor. Integration must filter.
    assert.equal(
      f.world.castRay(
        new RAPIER.Ray({ x: 1, y: 41, z: -0.5 }, { x: -1, y: 0, z: 0 }),
        1.5,
        true,
      )?.collider.handle,
      opened.handle,
    );
  } finally {
    f.dispose();
  }
});

test("actual B6 P01 exterior leaf cannot rotate through the real car chassis, including parked Fixed bodies", () => {
  const native = CAD_DOOR_DEFINITIONS.find(
    (d) => d.definition.sourceDoorId === "p01-door-2552",
  );
  assert.ok(native, "Published native B6 exterior annotation is required");
  assert.ok(Math.abs(native.closedPosition.x - 15.377326617) < 0.001);
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 }),
    physics = new CadDoorPhysics(world, [native], {
      ignoredColliders: new Set(),
    });
  const car = new VehicleEntity(
    world,
    { x: 17, y: groundHeight(17, -40.5), z: -40.5 },
    { parked: true },
  );
  try {
    world.step();
    const [closed, opened] = physics.collidersFor(native.id);
    assert.equal(closed.contactCollider(car.collider, 0), null);
    assert.ok(opened.contactCollider(car.collider, 0)!.distance < -0.18);
    const person: CadDoorCapsuleProbe = {
      id: "inside-user",
      current: { x: 14.5, y: 0.02, z: -39.4 },
      next: { x: 14.5, y: 0.02, z: -39.4 },
      radius: 0.25,
      halfHeight: 0.55,
      skin: 0.02,
    };
    const probe: CadDoorObstacleProbe = {
      id: "shared-car",
      collider: car.collider,
      next: {
        position: car.collider.translation(),
        rotation: car.collider.rotation(),
      },
    };
    assert.equal(car.body.isFixed(), true);
    assert.equal(
      physics.guardChange(native.id, true, [person]).allowed,
      true,
      "Original capsule-only guard misses this actual car",
    );
    const before = car.capture(),
      colliders = world.colliders.len(),
      bodies = world.bodies.len();
    const originalStep = world.step, originalCreateCollider = world.createCollider, originalCreateBody = world.createRigidBody;
    world.step = () => assert.fail("Interaction guard may not advance physics");
    world.createCollider = () => assert.fail("Interaction guard may not allocate colliders");
    world.createRigidBody = () => assert.fail("Interaction guard may not allocate bodies");
    for (let i = 0; i < 4; i++)
      assert.deepEqual(
        physics.guardChange(native.id, true, [person], [probe]),
        { allowed: false, blockedBy: ["shared-car"], reason: "occupied" },
      );
    assert.deepEqual(car.capture(), before);
    assert.equal(world.colliders.len(), colliders);
    assert.equal(world.bodies.len(), bodies);
    car.unpark("driver");
    assert.equal(car.body.isDynamic(), true);
    assert.equal(
      physics.guardChange(native.id, true, [person], [probe]).allowed,
      false,
    );
    world.step = originalStep;
    world.createCollider = originalCreateCollider;
    world.createRigidBody = originalCreateBody;
  } finally {
    car.dispose();
    physics.dispose();
    world.free();
  }
});

function obstacleFixture(
  f: ReturnType<typeof fixture>,
  halfExtents = { x: 0.1, y: 0.2, z: 0.1 },
  position = { x: 0.7, y: 41, z: -2 },
  rotation = { x: 0, y: 0, z: 0, w: 1 },
) {
  const body = f.world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(position.x, position.y, position.z)
      .setRotation(rotation),
  );
  const collider = f.world.createCollider(
    RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z),
    body,
  );
  f.world.step();
  return {
    body,
    collider,
    probe: {
      id: "traffic",
      collider,
      next: { position: { ...position }, rotation: { ...rotation } },
    },
  } satisfies {
    body: RAPIER.RigidBody;
    collider: RAPIER.Collider;
    probe: CadDoorObstacleProbe;
  };
}

test("known traffic current-to-next translation and vertical motion are checked between clear endpoints", () => {
  const f = fixture();
  try {
    const o = obstacleFixture(f);
    const next = {
      position: { x: 0.7, y: 41, z: 1 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
    };
    for (const collider of f.physics.collidersFor(id)) {
      assert.equal(collider.contactCollider(o.collider, 0), null);
      assert.equal(
        collider.shape.contactShape(
          collider.translation(),
          collider.rotation(),
          o.collider.shape,
          next.position,
          next.rotation,
          0,
        ),
        null,
      );
    }
    const tick = f.ticks,
      pose = { ...o.collider.translation() };
    assert.equal(
      f.physics.guardChange(id, true, [], [{ ...o.probe, next }]).allowed,
      false,
    );
    assert.deepEqual({ ...o.collider.translation() }, pose);
    assert.equal(f.ticks, tick);
    f.physics.apply(id, true);
    assert.equal(
      f.physics.guardChange(id, false, [], [{ ...o.probe, next }]).allowed,
      false,
    );
    const vertical = obstacleFixture(
      f,
      { x: 0.1, y: 0.2, z: 0.1 },
      { x: 0.6, y: 44, z: 0 },
    );
    assert.equal(
      f.physics.guardChange(
        id,
        false,
        [],
        [
          {
            ...vertical.probe,
            next: {
              position: { x: 0.6, y: 38, z: 0 },
              rotation: next.rotation,
            },
          },
        ],
      ).allowed,
      false,
    );
  } finally {
    f.dispose();
  }
});

test("obstacle rotation sweep detects middle-only contact and treats q/-q as the same static orientation", () => {
  const f = fixture();
  try {
    const q = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 };
    const o = obstacleFixture(
      f,
      { x: 1.4, y: 0.2, z: 0.05 },
      { x: 1.3, y: 41, z: -0.5 },
      q,
    );
    assert.equal(f.physics.guardChange(id, true, [], [o.probe]).allowed, true);
    assert.equal(
      f.physics.guardChange(
        id,
        true,
        [],
        [
          {
            ...o.probe,
            next: {
              ...o.probe.next,
              rotation: { x: 0, y: -q.y, z: 0, w: -q.w },
            },
          },
        ],
      ).allowed,
      true,
    );
    const turns = {
      ...o.probe,
      next: { ...o.probe.next, rotation: { x: 0, y: -q.y, z: 0, w: q.w } },
    };
    for (const collider of f.physics.collidersFor(id))
      assert.equal(
        collider.shape.contactShape(
          collider.translation(),
          collider.rotation(),
          o.collider.shape,
          turns.next.position,
          turns.next.rotation,
          0,
        ),
        null,
      );
    assert.equal(f.physics.guardChange(id, true, [], [turns]).allowed, false);
  } finally {
    f.dispose();
  }
});

test("an offset collider follows its body's rotation arc instead of a clear endpoint chord", () => {
  const f = fixture();
  try {
    const body = f.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(2, 41, -0.5)
        .setRotation({ x: 0, y: -Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }),
    );
    const collider = f.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.05, 0.05, 0.05).setTranslation(-1.5, 0, 0),
      body,
    );
    f.world.step();
    const next = {
      position: { x: 2, y: 41, z: 1 },
      rotation: { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 },
    };
    for (const leaf of f.physics.collidersFor(id)) {
      assert.equal(leaf.contactCollider(collider, 0), null);
      assert.equal(
        leaf.shape.contactShape(
          leaf.translation(),
          leaf.rotation(),
          collider.shape,
          next.position,
          next.rotation,
          0,
        ),
        null,
      );
    }
    assert.ok(
      collider.translation().x > 1.99,
      "endpoint chord stays far from the leaf",
    );
    assert.equal(
      f.physics.guardChange(
        id,
        true,
        [],
        [{ id: "offset-body", collider, next }],
      ).allowed,
      false,
    );
  } finally {
    f.dispose();
  }
});

test("obstacle guard rejects invalid poses/unsupported geometry and ignores only truly inactive physical colliders", () => {
  const f = fixture();
  try {
    const o = obstacleFixture(
      f,
      { x: 0.1, y: 0.2, z: 0.1 },
      { x: 0.5, y: 41, z: 0 },
    );
    for (const invalid of [
      {
        ...o.probe,
        next: { ...o.probe.next, position: { x: NaN, y: 41, z: 0 } },
      },
      {
        ...o.probe,
        next: { ...o.probe.next, position: { x: 1e300, y: 41, z: 0 } },
      },
      {
        ...o.probe,
        next: { ...o.probe.next, rotation: { x: 0, y: 0, z: 0, w: 0 } },
      },
      {
        ...o.probe,
        next: { ...o.probe.next, rotation: { x: 0, y: 0, z: Infinity, w: 1 } },
      },
      { ...o.probe, skin: -0.01 },
      { ...o.probe, skin: 1e300 },
    ])
      assert.equal(
        f.physics.guardChange(id, true, [], [invalid]).reason,
        "invalid-obstacle",
      );
    assert.equal(f.physics.guardChange(id, true, [], [o.probe]).allowed, false);
    o.collider.setSensor(true);
    assert.equal(f.physics.guardChange(id, true, [], [o.probe]).allowed, true);
    o.collider.setSensor(false);
    o.body.setEnabled(false);
    assert.equal(f.physics.guardChange(id, true, [], [o.probe]).allowed, true);
    o.body.setEnabled(true);
    o.collider.setShape(new RAPIER.Ball(0.1));
    assert.equal(
      f.physics.guardChange(id, true, [], [o.probe]).reason,
      "invalid-obstacle",
    );
    f.world.removeRigidBody(o.body);
    assert.equal(
      f.physics.guardChange(id, true, [], [o.probe]).reason,
      "invalid-obstacle",
    );
    const far = obstacleFixture(
      f,
      { x: 1, y: 0.6, z: 1.8 },
      { x: 100, y: 41, z: 0 },
    );
    assert.equal(
      f.physics.guardChange(id, true, [], [far.probe]).allowed,
      true,
    );
    const above = obstacleFixture(
      f,
      { x: 1, y: 0.6, z: 1.8 },
      { x: 0.5, y: 50, z: 0 },
    );
    assert.equal(
      f.physics.guardChange(id, true, [], [above.probe]).allowed,
      true,
    );
  } finally {
    f.dispose();
  }
});

test("production Actor remains blocked closed and walks through after opening, with immediate controller restoration", () => {
  const f = fixture();
  try {
    const actor = new Actor(f as unknown as Simulation, "door-walker", {
      x: 0.5,
      y: 40 + CHARACTER_HALF_HEIGHT + CHARACTER_RADIUS + 0.03,
      z: 0.8,
    });
    actor.setPosition = () =>
      assert.fail("door walking may not teleport/recover");
    f.world.step();
    for (let i = 0; i < 30; i++) {
      actor.step({ ...idle, z: -1 });
      f.world.step();
    }
    assert.ok(
      actor.position.z > 0.26 && actor.position.z < 0.31,
      JSON.stringify(actor.position),
    );
    const query = () => {
      actor.controller.computeColliderMovement(
        actor.collider,
        { x: 0, y: 0, z: -0.12 },
        undefined,
        undefined,
        (c) =>
          c.handle !== actor.collider.handle &&
          !f.walkingColliders.has(c.handle),
      );
      return actor.controller.computedMovement().z;
    };
    const tick = f.ticks,
      p = { ...actor.position };
    assert.ok(query() > -0.005);
    f.physics.apply(id, true);
    assert.ok(query() < -0.119);
    assert.equal(f.ticks, tick);
    assert.deepEqual({ ...actor.position }, p);
    f.physics.apply(id, false);
    assert.ok(query() > -0.005);
    assert.equal(f.ticks, tick);
    f.physics.apply(id, true);
    for (let i = 0; i < 20; i++) {
      actor.step({ ...idle, z: -1 });
      f.world.step();
    }
    assert.ok(actor.position.z < -0.8);
    assert.ok(Math.abs(actor.position.y - 40.8201) < 0.004);
    f.physics.apply(id, false);
    for (let i = 0; i < 30; i++) {
      actor.step({ ...idle, z: 1 });
      f.world.step();
    }
    assert.ok(
      actor.position.z < -0.26 && actor.position.z > -0.31,
      JSON.stringify(actor.position),
    );
    f.physics.dispose();
    assert.ok(f.walkingColliders.has(actor.collider.handle));
    assert.equal(f.walkingColliders.size, 1);
    f.world.removeCharacterController(actor.controller);
  } finally {
    f.dispose();
  }
});

test("guard covers the angular sweep and all players' current-to-next capsules, including ignored player handles", () => {
  const f = fixture();
  try {
    const probe = (
      x: number,
      z: number,
      next = { x, y: 40.8, z },
    ): CadDoorCapsuleProbe => ({
      id: "other-player",
      current: { x, y: 40.8, z },
      next,
      radius: 0.25,
      halfHeight: 0.55,
      skin: 0.02,
    });
    assert.equal(
      f.physics.guardChange(id, true, [probe(0.65, -0.65)]).allowed,
      false,
    ); // clear of both end poses, in arc
    assert.equal(
      f.physics.guardChange(id, true, [
        probe(0.6, -1.5, { x: 0.6, y: 40.8, z: 0.5 }),
      ]).allowed,
      false,
    ); // endpoints alone miss
    assert.equal(f.physics.guardChange(id, true, [probe(2, -2)]).allowed, true);
    const above = {
      ...probe(0.5, 0),
      current: { x: 0.5, y: 44, z: 0 },
      next: { x: 0.5, y: 44, z: 0 },
    };
    assert.equal(
      cadDoorSweepIntersectsCapsule(definition, false, true, above),
      false,
    );
    f.walkingColliders.add(123456);
    assert.deepEqual(
      f.physics.guardChange(id, true, [probe(0.5, 0)]).blockedBy,
      ["other-player"],
    );
    assert.equal(
      f.physics.guardChange(id, true, [{ ...probe(3, 3), radius: NaN }]).reason,
      "invalid-capsule",
    );
    f.physics.apply(id, true);
    assert.equal(
      f.physics.guardChange(id, false, [probe(0.65, -0.65)]).allowed,
      false,
    );
  } finally {
    f.dispose();
  }
});

test("LOS ignores the target leaf but an intervening wall or another active door occludes the handle", () => {
  const f = fixture();
  try {
    f.world.step();
    const eye = { x: 0.9, y: 41, z: 1 };
    assert.equal(f.physics.lineOfSight(eye, id), true);
    f.world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.2, 1, 0.05).setTranslation(0.9, 41, 0.5),
    );
    f.world.step();
    assert.equal(f.physics.lineOfSight(eye, id), false);
    assert.equal(f.physics.lineOfSight({ x: NaN, y: 0, z: 0 }, id), false);
    const pose = cadDoorPose(definition, true);
    assert.ok(Math.abs(pose.position.z + 0.5) < 1e-10);
  } finally {
    f.dispose();
  }
});

test("complete restoration validates before mutation and disposal owns only door resources", () => {
  const f = fixture();
  try {
    f.walkingColliders.add(987654);
    f.world.step();
    const count = f.world.colliders.len();
    assert.throws(() => f.physics.applyStates([]), /Incomplete/);
    assert.throws(
      () => f.physics.applyStates([{ id: "unknown", open: true }]),
      /Unknown/,
    );
    assert.equal(f.physics.isOpen(id), false);
    f.physics.dispose();
    f.physics.dispose();
    assert.equal(f.world.colliders.len(), count - 2);
    assert.deepEqual([...f.walkingColliders], [987654]);
    assert.throws(() => f.physics.apply(id, true), /disposed/);
  } finally {
    f.dispose();
  }
});

test("authoritative requests protect a second player's next pose and late-join history restores actual Rapier collision", () => {
  const f = fixture();
  try {
    const identity = {
      worldEpoch: "test-room",
      definitionHash: "a".repeat(64),
    };
    const store = new CadDoorStateStore([definition], identity),
      timeline = new CadDoorTimeline([definition], identity);
    const alice = new Actor(f as unknown as Simulation, "alice", {
      x: 0.8,
      y: 40.82,
      z: 0.8,
    });
    const bob = new Actor(f as unknown as Simulation, "bob", {
      x: 2,
      y: 40.82,
      z: -0.5,
    });
    f.world.step();
    timeline.acceptSnapshot(store.snapshot());
    const request = (
      requestId: number,
      open: boolean,
      expectedRevision: number,
    ) => ({ ...identity, requestId, doorId: id, open, expectedRevision });
    const context = {
      actor: {
        id: "alice",
        position: alice.position,
        eye: { ...alice.position, y: 41.5 },
        vehicle: false,
      },
      tick: 1,
      nowMs: 0,
      canSee: () =>
        f.physics.lineOfSight(
          { ...alice.position, y: 41.5 },
          id,
          undefined,
          alice.collider,
        ),
      canChange: () =>
        f.physics.guardChange(
          id,
          true,
          [alice, bob].map((a) => ({
            id: a.id,
            current: a.position,
            next: a.body.nextTranslation(),
            radius: CHARACTER_RADIUS,
            halfHeight: CHARACTER_HALF_HEIGHT,
          })),
        ).allowed,
      apply: (id: string, open: boolean) => f.physics.apply(id, open),
    };
    bob.body.setNextKinematicTranslation({ x: 0.6, y: 40.82, z: -0.6 });
    const blocked = store.request(request(1, true, 0), context);
    assert.equal(blocked.reason, "occupied");
    assert.equal(store.revision, 0);
    bob.body.setNextKinematicTranslation(bob.position);
    const accepted = store.request(request(2, true, 0), {
      ...context,
      nowMs: 10,
    });
    assert.equal(accepted.status, "changed");
    assert.equal(timeline.acceptDelta(accepted.delta!).status, "accepted");
    assert.equal(f.physics.isOpen(id), true);
    // Caller restores authoritative history without rerunning current occupancy.
    const ticks = f.ticks;
    f.physics.applyStates(timeline.snapshotAt(0, 0)!.states);
    assert.equal(f.physics.isOpen(id), false);
    assert.equal(
      rayAt(f.world, false)?.collider.handle,
      f.physics.activeCollider(id).handle,
    );
    f.physics.applyStates(timeline.snapshotAt(1, 1)!.states);
    assert.equal(f.physics.isOpen(id), true);
    assert.equal(
      rayAt(f.world, true)?.collider.handle,
      f.physics.activeCollider(id).handle,
    );
    assert.equal(f.ticks, ticks);
    const late = new CadDoorTimeline([definition], identity);
    assert.equal(late.acceptSnapshot(store.snapshot(5)).status, "accepted");
    assert.equal(late.snapshotAt(4), null);
    assert.equal(late.snapshotAt(5, 1)?.states[0].open, true);
    f.world.removeCharacterController(alice.controller);
    f.world.removeCharacterController(bob.controller);
    store.dispose();
    timeline.dispose();
    late.dispose();
  } finally {
    f.dispose();
  }
});
