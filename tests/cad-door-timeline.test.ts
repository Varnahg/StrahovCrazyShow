import { test } from "node:test";
import assert from "node:assert/strict";
import { CadDoorTimeline } from "../shared/cad-door-timeline";
import {
  placeCadDoorDefinition,
  type CadDoorDelta,
  type CadDoorSnapshot,
} from "../shared/cad-doors";
const identity = { worldEpoch: "epoch-a", definitionHash: "a".repeat(64) };
const doors = ["a", "b"].map((id, i) =>
  placeCadDoorDefinition(
    {
      id,
      buildingId: "b06",
      floor: "N01",
      sourceDoorId: id,
      renderPartIds: [id + "-leaf"],
      collisionPartIds: [],
      hingeModel: { x: i * 3, y: 1, z: 0 },
      closedPose: { position: { x: i * 3 + 0.5, y: 1, z: 0 }, rotationY: 0 },
      collider: { halfExtents: { x: 0.5, y: 1, z: 0.02 } },
      openAngle: Math.PI / 2,
      handleModel: { x: i * 3 + 0.9, y: 1, z: 0 },
      defaultOpen: false,
    },
    { translation: { x: 0, y: 0, z: 0 }, yaw: 0 },
  ),
);
const initial = (tick = 0): CadDoorSnapshot => ({
  ...identity,
  revision: 0,
  tick,
  states: doors.map((d) => ({
    id: d.id,
    open: false,
    revision: 0,
    changedAtTick: 0,
  })),
});
const delta = (
  revision: number,
  tick: number,
  id = "a",
  doorRevision = revision,
): CadDoorDelta => ({
  ...identity,
  revision,
  tick,
  door: {
    id,
    open: doorRevision % 2 === 1,
    revision: doorRevision,
    changedAtTick: tick,
  },
});

test("late join requires the complete snapshot and retains exact post-tick states for rewind", () => {
  const t = new CadDoorTimeline(doors, identity);
  assert.equal(t.initialized, false);
  assert.equal(t.snapshotAt(0), null);
  assert.equal(t.acceptSnapshot(initial(10)).status, "accepted");
  assert.equal(t.snapshotAt(9), null);
  assert.equal(t.snapshotAt(10, 0)?.states[0].open, false);
  assert.equal(t.acceptDelta(delta(1, 12)).status, "accepted");
  assert.equal(t.acceptDelta(delta(2, 15, "b", 1)).status, "accepted");
  assert.equal(t.snapshotAt(11, 0)?.states[0].open, false);
  assert.equal(t.snapshotAt(12, 1)?.states[0].open, true);
  assert.equal(t.snapshotAt(12, 2), null);
  assert.deepEqual(
    t.snapshotAt(15, 2)?.states.map((s) => s.open),
    [true, true],
  );
  assert.equal(t.snapshotAt(500, 2)?.revision, 2);
  assert.equal(t.snapshotAt(500, 3), null);
  assert.equal(t.acceptDelta(delta(2, 15, "b", 1)).status, "duplicate");
  const output = t.currentSnapshot()!;
  assert.throws(() => {
    (output.states[0] as { open: boolean }).open = false;
  }, TypeError);
  assert.equal(t.currentSnapshot()?.states[0].open, true);
});

test("a missing revision latches resync, never applies later events, and only a complete current snapshot recovers", () => {
  const t = new CadDoorTimeline(doors, identity);
  t.acceptSnapshot(initial());
  t.acceptDelta(delta(1, 1));
  assert.equal(t.acceptDelta(delta(3, 3)).reason, "revision-gap");
  assert.equal(t.needsResync, true);
  assert.equal(t.snapshotAt(0), null);
  assert.equal(t.snapshotAt(99), null);
  assert.equal(t.acceptDelta(delta(2, 2)).status, "resync");
  assert.equal(t.revision, 1);
  assert.equal(
    t.acceptSnapshot({
      ...initial(3),
      revision: 3,
      states: [
        { id: "a", open: true, revision: 3, changedAtTick: 3 },
        initial().states[1],
      ],
    }).status,
    "accepted",
  );
  assert.equal(t.needsResync, false);
  assert.equal(t.snapshotAt(2), null);
  assert.equal(t.snapshotAt(3, 3)?.states[0].open, true);
  assert.equal(t.acceptSnapshot(initial()).status, "stale");
  assert.equal(t.revision, 3);
});

test("foreign epochs cannot poison current history; malformed or contradictory own-world updates do require resync", () => {
  const t = new CadDoorTimeline(doors, identity);
  t.acceptSnapshot(initial());
  assert.equal(
    t.acceptDelta({ ...delta(1, 1), worldEpoch: "another" }).status,
    "rejected",
  );
  assert.equal(t.needsResync, false);
  assert.equal(
    t.acceptSnapshot({ ...initial(), states: [] }).reason,
    "invalid-snapshot",
  );
  assert.equal(t.needsResync, true);
  t.acceptSnapshot(initial());
  t.acceptDelta(delta(1, 1));
  assert.equal(
    t.acceptDelta({
      ...delta(1, 1),
      door: { ...delta(1, 1).door, open: false },
    }).reason,
    "conflicting-delta",
  );
  const missing = new CadDoorTimeline(doors, identity);
  assert.equal(missing.acceptDelta(delta(1, 1)).reason, "missing-snapshot");
  assert.equal(missing.snapshotAt(1), null);
});

test("history is bounded in both ticks and event count, including complete same-tick groups", () => {
  const t = new CadDoorTimeline(doors, identity, {
    historyTicks: 4,
    maxEvents: 3,
  });
  t.acceptSnapshot(initial());
  for (let n = 1; n <= 10; n++)
    assert.equal(t.acceptDelta(delta(n, n)).status, "accepted");
  assert.ok(t.eventCount <= 3);
  assert.equal(t.oldestTick, 7);
  assert.equal(t.snapshotAt(6), null);
  assert.equal(t.snapshotAt(7, 7)?.states[0].open, true);
  assert.equal(t.snapshotAt(10, 10)?.states[0].open, false);
  const many = new CadDoorTimeline(doors, identity, {
    historyTicks: 128,
    maxEvents: 2,
  });
  many.acceptSnapshot(initial());
  for (let n = 1; n <= 8; n++)
    assert.equal(many.acceptDelta(delta(n, 1)).status, "accepted");
  assert.ok(many.eventCount <= 2);
  assert.equal(many.snapshotAt(0), null);
  assert.equal(many.snapshotAt(1, 8)?.states[0].open, false);
  assert.equal(many.snapshotAt(1, 7), null); // never invent an intermediate post-tick state
});

test("newer complete snapshots discard unknown history, same-state snapshots only advance retention, and disposal clears state", () => {
  const t = new CadDoorTimeline(doors, identity, { historyTicks: 5 });
  t.acceptSnapshot(initial());
  t.acceptDelta(delta(1, 2));
  const latest = t.currentSnapshot()!;
  assert.equal(t.acceptSnapshot({ ...latest, tick: 10 }).status, "accepted");
  assert.equal(t.oldestTick, 5);
  assert.equal(t.snapshotAt(4), null);
  assert.equal(t.snapshotAt(5, 1)?.states[0].open, true);
  assert.equal(t.acceptDelta(delta(2, 9)).reason, "invalid-transition");
  assert.equal(t.acceptSnapshot({ ...latest, tick: 10 }).status, "accepted");
  assert.equal(t.snapshotAt(9), null);
  t.dispose();
  t.dispose();
  assert.equal(t.initialized, false);
  assert.equal(t.eventCount, 0);
  assert.equal(t.currentSnapshot(), null);
  assert.equal(t.acceptSnapshot(initial()).reason, "disposed");
});

test("bad per-door revision, unchanged transitions and invalid limits cannot silently enter history", () => {
  for (const bad of [
    { ...delta(1, 1), door: { ...delta(1, 1).door, revision: 3 } },
    { ...delta(1, 1), door: { ...delta(1, 1).door, open: false } },
    { ...delta(1, 1), tick: NaN },
  ]) {
    const t = new CadDoorTimeline(doors, identity);
    t.acceptSnapshot(initial());
    assert.equal(t.acceptDelta(bad).status, "resync");
  }
  assert.throws(() => new CadDoorTimeline(doors, identity, { maxEvents: 0 }));
});

test("unchanged ticks reuse immutable state arrays and rewind uses its own revision", () => {
  const t = new CadDoorTimeline(doors, identity);
  t.acceptSnapshot(initial());
  const closed = t.snapshotAt(0)!;
  assert.equal(t.snapshotAt(100)!.states, closed.states);
  assert.ok(Object.isFrozen(closed.states));
  assert.ok(Object.isFrozen(closed.states[0]));
  t.acceptDelta(delta(1, 5));
  assert.equal(t.revisionAt(4), 0);
  assert.equal(t.revisionAt(5), 1);
  assert.equal(t.revisionAt(5, 0), null);
  assert.equal(t.snapshotAt(4)!.states, closed.states);
  assert.notEqual(t.snapshotAt(5)!.states, closed.states);
  assert.equal(t.snapshotAt(5)!.states, t.snapshotAt(6)!.states);
});
