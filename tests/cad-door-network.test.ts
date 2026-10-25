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
import { placeCadDoorDefinition, type CadDoorDelta } from "../shared/cad-doors";
import { CadDoorPhysics } from "../shared/cad-door-physics";
import { CadDoorTimeline } from "../shared/cad-door-timeline";
import {
  ServerDoorInteractions,
  MAX_PENDING_DOOR_REQUESTS_PER_ACTOR,
  type ServerDoorResult,
} from "../server/door-interactions";
await initPhysics();
const door = placeCadDoorDefinition(
  {
    id: "b06:N01:A",
    buildingId: "b06",
    floor: "N01",
    sourceDoorId: "A",
    renderPartIds: ["leaf"],
    collisionPartIds: [],
    hingeModel: { x: 0, y: 1, z: 0 },
    closedPose: { position: { x: 0.5, y: 1, z: 0 }, rotationY: 0 },
    collider: { halfExtents: { x: 0.5, y: 1, z: 0.019 } },
    handleModel: { x: 0.9, y: 1, z: 0.04 },
    openAngle: Math.PI / 2,
    defaultOpen: false,
  },
  { translation: { x: 0, y: 40, z: 0 }, yaw: 0 },
);
const identity = { worldEpoch: "test-room", definitionHash: "b".repeat(64) };
type Connection = { id: string; generation: number };
function fixture() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 }),
    walkingColliders = new Set<number>(),
    groundColliders = new Set<number>(),
    actors = new Map<string, Actor>();
  const floor = world.createCollider(
    RAPIER.ColliderDesc.cuboid(5, 0.1, 5).setTranslation(0, 39.9, 0),
  );
  groundColliders.add(floor.handle);
  const doorPhysics = new CadDoorPhysics(world, [door], {
    ignoredColliders: walkingColliders,
  });
  const runtime = {
    world,
    walkingColliders,
    groundColliders,
    actors,
    doorPhysics,
    doorObstacles: () => [],
    doorCapsules: () =>
      [...actors.values()]
        .filter((a) => !a.vehicle)
        .map((a) => ({
          id: a.id,
          current: a.position,
          next: a.body.nextTranslation(),
          radius: CHARACTER_RADIUS,
          halfHeight: CHARACTER_HALF_HEIGHT,
          skin: 0.02,
        })),
  };
  const connections = new Map<string, Connection>(),
    replies: { connection: Connection; result: ServerDoorResult }[] = [],
    deltas: CadDoorDelta[] = [],
    events: string[] = [];
  const manager = new ServerDoorInteractions<Connection>(
    runtime,
    [door],
    identity,
    {
      isCurrentConnection: (c, id) => connections.get(id) === c,
      sendResult: (connection, result) => {
        events.push("result");
        replies.push({ connection, result });
      },
      broadcastDelta: (d) => {
        events.push("delta");
        deltas.push(d);
      },
    },
  );
  const add = (id: string, p = { x: 0.8, y: 40.82, z: 0.8 }) => {
    const actor = new Actor(runtime as unknown as Simulation, id, p),
      connection = { id, generation: 1 };
    actors.set(id, actor);
    connections.set(id, connection);
    return { actor, connection };
  };
  const alice = add("alice"),
    bob = add("bob", { x: 2, y: 40.82, z: -0.5 });
  world.step();
  return {
    ...runtime,
    manager,
    alice,
    bob,
    connections,
    replies,
    deltas,
    events,
    add,
    dispose() {
      manager.dispose();
      doorPhysics.dispose();
      for (const a of actors.values())
        world.removeCharacterController(a.controller);
      world.free();
    },
  };
}
const request = (requestId = 1, open = true, expectedRevision = 0) => ({
  ...identity,
  requestId,
  doorId: door.id,
  open,
  expectedRevision,
});

test("authenticated requests are queued, then one global delta precedes replies and the authority frontier", () => {
  const f = fixture();
  try {
    const observerA = new CadDoorTimeline([door], identity),
      observerB = new CadDoorTimeline([door], identity);
    observerA.acceptSnapshot(f.manager.snapshot(0));
    observerB.acceptSnapshot(f.manager.snapshot(0));
    assert.equal(
      f.manager.receive(f.alice.connection, "alice", request()),
      true,
    );
    assert.equal(f.manager.revision, 0);
    assert.equal(f.doorPhysics.isOpen(door.id), false);
    assert.equal(f.deltas.length, 0);
    f.manager.flush(1, 100);
    f.events.push("physics");
    f.world.step();
    f.events.push("authority");
    assert.deepEqual(f.events, ["delta", "result", "physics", "authority"]);
    assert.equal(f.deltas.length, 1);
    assert.equal(f.deltas[0].tick, 1);
    assert.equal(f.manager.revision, 1);
    for (const client of [observerA, observerB])
      assert.equal(client.acceptDelta(f.deltas[0]).status, "accepted");
    assert.deepEqual(observerA.snapshotAt(1, 1), observerB.snapshotAt(1, 1));
    const late = new CadDoorTimeline([door], identity);
    late.acceptSnapshot(f.manager.snapshot(2));
    assert.equal(late.currentSnapshot()?.states[0].open, true);
    assert.equal(late.snapshotAt(1), null);
    f.manager.receive(f.alice.connection, "alice", request());
    f.manager.flush(2, 110);
    assert.equal(f.deltas.length, 1);
    assert.equal(f.replies.at(-1)?.result.status, "duplicate");
  } finally {
    f.dispose();
  }
});

test("request packet position spoofing, foreign world, out-of-range and inactive connection never open a door", () => {
  const f = fixture();
  try {
    assert.equal(
      f.manager.receive({ id: "alice", generation: 0 }, "alice", request()),
      false,
    );
    assert.equal(f.manager.pendingCount, 0);
    assert.equal(f.replies.length, 0);
    f.manager.receive(f.alice.connection, "alice", {
      ...request(),
      position: door.closedHandle,
    });
    f.manager.flush(1, 0);
    assert.equal(f.replies.at(-1)?.result.reason, "invalid");
    f.manager.receive(f.alice.connection, "alice", {
      ...request(2),
      worldEpoch: "host-world",
    });
    f.manager.flush(2, 10);
    assert.equal(f.replies.at(-1)?.result.reason, "wrong-world");
    f.bob.actor.body.setTranslation({ x: 4, y: 40.82, z: 4 }, true);
    f.manager.receive(f.bob.connection, "bob", request());
    f.manager.flush(3, 20);
    assert.equal(f.replies.at(-1)?.result.reason, "out-of-range");
    assert.equal(f.manager.revision, 0);
  } finally {
    f.dispose();
  }
});

test("explicit next capsule blocks opening and closing, and no packet is applied between physics ticks", () => {
  const f = fixture();
  try {
    f.bob.actor.body.setNextKinematicTranslation({ x: 0.6, y: 40.82, z: -0.6 });
    f.manager.receive(f.alice.connection, "alice", request());
    f.manager.flush(1, 0);
    assert.equal(f.replies.at(-1)?.result.reason, "occupied");
    assert.equal(f.doorPhysics.isOpen(door.id), false);
    f.bob.actor.body.setNextKinematicTranslation(f.bob.actor.position);
    f.manager.receive(f.alice.connection, "alice", request(2));
    f.manager.flush(2, 10);
    assert.equal(f.doorPhysics.isOpen(door.id), true);
    f.bob.actor.body.setNextKinematicTranslation({ x: 0.6, y: 40.82, z: -0.6 });
    f.manager.receive(f.alice.connection, "alice", request(3, false, 1));
    assert.equal(f.doorPhysics.isOpen(door.id), true);
    f.manager.flush(3, 20);
    assert.equal(f.replies.at(-1)?.result.reason, "occupied");
    assert.equal(f.manager.revision, 1);
    f.bob.actor.body.setNextKinematicTranslation(f.bob.actor.position);
    f.manager.receive(f.alice.connection, "alice", request(4, false, 1));
    f.manager.flush(4, 30);
    assert.equal(f.doorPhysics.isOpen(door.id), false);
    assert.equal(f.manager.revision, 2);
  } finally {
    f.dispose();
  }
});

test("two clients racing the same leaf share one revision, and guard uses server LOS", () => {
  const f = fixture();
  try {
    f.bob.actor.body.setTranslation({ x: 1.1, y: 40.82, z: 0.8 }, true);
    f.bob.actor.body.setNextKinematicTranslation(f.bob.actor.position);
    f.world.step();
    f.manager.receive(f.alice.connection, "alice", request());
    f.manager.receive(f.bob.connection, "bob", request());
    f.manager.flush(1, 0);
    assert.equal(f.deltas.length, 1);
    assert.equal(f.replies.at(-1)?.result.reason, "stale-revision");
    f.world.createCollider(
      RAPIER.ColliderDesc.cuboid(3, 1, 0.06).setTranslation(0.5, 41, 0.4),
    );
    f.world.step();
    f.manager.receive(f.alice.connection, "alice", request(2, false, 1));
    f.manager.flush(2, 10);
    assert.equal(f.replies.at(-1)?.result.reason, "occluded");
    assert.equal(f.manager.revision, 1);
  } finally {
    f.dispose();
  }
});

test("queue and request rate are bounded, reconnect revokes stale pending work and dispose preserves Simulation ownership", () => {
  const f = fixture();
  try {
    for (let n = 1; n <= MAX_PENDING_DOOR_REQUESTS_PER_ACTOR; n++)
      assert.equal(
        f.manager.receive(f.alice.connection, "alice", request(n, false)),
        true,
      );
    assert.equal(
      f.manager.receive(f.alice.connection, "alice", request(5)),
      false,
    );
    assert.equal(f.replies.at(-1)?.result.reason, "rate-limit");
    assert.equal(f.manager.pendingCount, 4);
    f.manager.flush(1, 0);
    assert.equal(f.manager.pendingCount, 0);
    f.manager.receive(f.alice.connection, "alice", request(5));
    f.manager.flush(2, 100);
    assert.equal(f.replies.at(-1)?.result.reason, "rate-limit");
    assert.equal(f.manager.revision, 0);
    f.manager.receive(f.alice.connection, "alice", request(6));
    f.manager.forgetActor("alice");
    assert.equal(f.manager.pendingCount, 0);
    const replacement = { id: "alice", generation: 2 };
    f.connections.set("alice", replacement);
    assert.equal(
      f.manager.receive(f.alice.connection, "alice", request()),
      false,
    );
    f.manager.receive(replacement, "alice", request());
    f.manager.flush(3, 1100);
    assert.equal(f.manager.revision, 1);
    f.manager.receive(replacement, "alice", request(2, false, 1));
    f.connections.delete("alice");
    const results = f.replies.length;
    f.manager.flush(4, 1200);
    assert.equal(f.manager.revision, 1);
    assert.equal(f.replies.length, results);
    f.manager.dispose();
    f.manager.dispose();
    assert.equal(f.doorPhysics.isOpen(door.id), true);
    assert.equal(f.manager.receive(f.bob.connection, "bob", request()), false);
    assert.throws(() => f.manager.snapshot(5), /lifecycle/);
  } finally {
    f.dispose();
  }
});
