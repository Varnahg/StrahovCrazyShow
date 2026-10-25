import { test } from "node:test";
import assert from "node:assert/strict";
import { cadLocalToWorld } from "../shared/cad-building-geometry";
import {
  CadDoorStateStore,
  cadDoorCollisionPartIds,
  cadDoorModelPoint,
  cadDoorModelTransform,
  cadDoorPose,
  parseCadDoorRequest,
  placeCadDoorDefinition,
  validateCadDoorSnapshot,
  type CadDoorDefinition,
  type CadDoorRequestContext,
} from "../shared/cad-doors";

const raw: CadDoorDefinition = {
  id: "b06:N01:A",
  buildingId: "b06",
  floor: "N01",
  sourceDoorId: "A",
  renderPartIds: ["leaf", "handle"],
  collisionPartIds: [],
  hingeModel: { x: 3, y: 2, z: 4 },
  closedPose: { position: { x: 3.5, y: 2, z: 4 }, rotationY: 0 },
  collider: { halfExtents: { x: 0.5, y: 1, z: 0.019 } },
  handleModel: { x: 3.9, y: 2, z: 4.04 },
  openAngle: Math.PI / 2,
  defaultOpen: false,
};
const placement = { translation: { x: 12, y: 3, z: -8 }, yaw: 0.72 },
  door = placeCadDoorDefinition(raw, placement);
const identity = { worldEpoch: "room-epoch", definitionHash: "a".repeat(64) };
const request = (requestId = 1, open = true, expectedRevision = 0) => ({
  ...identity,
  requestId,
  doorId: door.id,
  expectedRevision,
  open,
});
function context(
  overrides: Partial<CadDoorRequestContext> = {},
): CadDoorRequestContext {
  return {
    actor: {
      id: "alice",
      position: door.closedHandle,
      eye: door.closedHandle,
      vehicle: false,
    },
    tick: 10,
    nowMs: 100,
    canSee: () => true,
    canChange: () => true,
    apply: () => {},
    ...overrides,
  };
}

test("shared affine transform puts leaf and handle in the exact physics pose under nonzero building placement", () => {
  for (const open of [false, true]) {
    const pose = cadDoorPose(door, open);
    for (const [point, target] of [
      [raw.closedPose.position, pose.position],
      [raw.handleModel, pose.handle],
      [raw.hingeModel, door.hinge],
    ] as const) {
      const actual = cadLocalToWorld(
        cadDoorModelPoint(raw, point, open),
        placement,
      );
      assert.ok(
        Math.hypot(
          actual.x - target.x,
          actual.y - target.y,
          actual.z - target.z,
        ) < 1e-12,
      );
    }
    const affine = cadDoorModelTransform(raw, open);
    assert.equal(affine.rotationY, open ? Math.PI / 2 : 0);
    const q = pose.rotation;
    assert.ok(Math.abs(q.y * q.y + q.w * q.w - 1) < 1e-12);
  }
  assert.deepEqual(cadDoorCollisionPartIds([door]), new Set());
  const explicit = placeCadDoorDefinition(
    { ...raw, collisionPartIds: ["moving-exact-id"] },
    placement,
  );
  assert.deepEqual(
    [...cadDoorCollisionPartIds([explicit])],
    ["moving-exact-id"],
  );
  assert.throws(() => cadDoorCollisionPartIds([door, door]), /Duplicate/);
});

test("native validation rejects non-finite/invalid definitions and copies all mutable geometry inputs", () => {
  assert.throws(
    () => placeCadDoorDefinition({ ...raw, openAngle: NaN }, placement),
    /Invalid/,
  );
  assert.throws(
    () =>
      placeCadDoorDefinition({ ...raw, buildingId: "b01" as "b06" }, placement),
    /Invalid/,
  );
  assert.throws(
    () =>
      placeCadDoorDefinition(
        { ...raw, collider: { halfExtents: { x: 0, y: 1, z: 1 } } },
        placement,
      ),
    /Invalid/,
  );
  assert.throws(
    () => placeCadDoorDefinition({ ...raw, renderPartIds: [] }, placement),
    /Invalid/,
  );
  const mutable = structuredClone(raw),
    copy = placeCadDoorDefinition(mutable, placement);
  (mutable.hingeModel as { x: number }).x = 999;
  assert.equal(copy.definition.hingeModel.x, 3);
  assert.ok(Object.isFrozen(copy.definition.closedPose.position));
  assert.equal(
    parseCadDoorRequest({ ...request(), position: { x: 0, y: 0, z: 0 } }),
    null,
  );
  assert.equal(parseCadDoorRequest({ ...request(), requestId: NaN }), null);
});

test("authoritative state starts closed, toggles transactionally, and duplicate packets cannot toggle twice", () => {
  const store = new CadDoorStateStore([door], identity);
  let calls = 0;
  assert.equal(store.get(door.id)?.open, false);
  assert.equal(store.snapshot().revision, 0);
  const first = store.request(
    request(),
    context({
      apply: (id, open) => {
        assert.equal(id, door.id);
        assert.equal(open, true);
        assert.equal(store.revision, 0);
        calls++;
      },
    }),
  );
  assert.equal(first.status, "changed");
  assert.equal(first.delta?.revision, 1);
  assert.equal(first.delta?.door.changedAtTick, 10);
  assert.equal(store.request(request(), context()).status, "duplicate");
  assert.equal(calls, 1);
  assert.equal(store.revision, 1);
  assert.equal(
    store.request(request(1, false, 1), context()).reason,
    "stale-request",
  );
  assert.equal(store.request(request(0), context()).reason, "stale-request");
  assert.equal(
    store.request(request(2, false, 0), context()).reason,
    "stale-revision",
  );
  assert.equal(
    store.request(request(3, false, 1), context({ tick: 11 })).status,
    "changed",
  );
  assert.equal(store.get(door.id)?.open, false);
  const snapshot = store.snapshot(11);
  validateCadDoorSnapshot(snapshot, store.definitions, identity);
  (snapshot.states[0] as { open: boolean }).open = true;
  assert.equal(store.get(door.id)?.open, false);
});

test("range, LOS, occupancy, world, vehicles and malformed requests cannot modify any door state", () => {
  const cases: [
    string,
    (c: CadDoorRequestContext) => CadDoorRequestContext,
    unknown,
  ][] = [
    ["wrong-world", (c) => c, { ...request(), worldEpoch: "another-host" }],
    ["unknown-door", (c) => c, { ...request(), doorId: "unknown" }],
    [
      "vehicle",
      (c) => ({ ...c, actor: { ...c.actor, vehicle: true } }),
      request(),
    ],
    [
      "out-of-range",
      (c) => ({
        ...c,
        actor: { ...c.actor, position: { x: 999, y: 999, z: 999 } },
      }),
      request(),
    ],
    ["occluded", (c) => ({ ...c, canSee: () => false }), request()],
    ["occupied", (c) => ({ ...c, canChange: () => false }), request()],
    ["invalid", (c) => c, { ...request(), open: 1 }],
  ];
  for (const [reason, change, packet] of cases) {
    const store = new CadDoorStateStore([door], identity);
    const result = store.request(
      packet,
      change(
        context({
          apply: () => assert.fail("Rejected request applied physics"),
        }),
      ),
    );
    assert.equal(result.reason, reason);
    assert.equal(store.revision, 0);
    assert.equal(store.get(door.id)?.open, false);
  }
  const store = new CadDoorStateStore([door], identity);
  assert.throws(
    () =>
      store.request(
        request(),
        context({
          apply: () => {
            throw new Error("native failure");
          },
        }),
      ),
    /native failure/,
  );
  assert.equal(store.revision, 0);
  assert.equal(store.get(door.id)?.open, false);
});

test("rate limit is per connected actor, bounded by time, and host/room lifetimes never share state", () => {
  const one = new CadDoorStateStore([door], identity),
    two = new CadDoorStateStore([door], identity);
  for (let i = 1; i <= 4; i++)
    assert.equal(one.request(request(i, false), context()).status, "unchanged");
  assert.equal(one.request(request(5), context()).reason, "rate-limit");
  assert.equal(
    one.request(request(5), context({ nowMs: 1100 })).status,
    "changed",
  );
  assert.equal(two.get(door.id)?.open, false);
  assert.equal(one.sessionCount, 1);
  one.forgetActor("alice");
  assert.equal(one.sessionCount, 0);
  assert.equal(one.get(door.id)?.open, true);
  assert.equal(
    one.request(request(1, false, 1), context({ tick: 11, nowMs: 1200 }))
      .status,
    "changed",
  );
  one.dispose();
  one.dispose();
  assert.equal(one.sessionCount, 0);
  assert.equal(one.request(request(), context()).reason, "disposed");
  assert.throws(() => one.snapshot(), /lifecycle/);
  assert.equal(two.snapshot().states.length, 1);
});

test("snapshot validation rejects omitted, duplicated, foreign, contradictory and non-finite states", () => {
  const store = new CadDoorStateStore([door], identity),
    snapshot = store.snapshot();
  for (const invalid of [
    { ...snapshot, states: [] },
    { ...snapshot, definitionHash: "b".repeat(64) },
    { ...snapshot, tick: NaN },
    { ...snapshot, states: [{ ...snapshot.states[0], id: "foreign" }] },
    { ...snapshot, states: [{ ...snapshot.states[0], open: true }] },
    { ...snapshot, revision: 1 },
    { ...snapshot, states: [{ ...snapshot.states[0], changedAtTick: 1 }] },
  ])
    assert.throws(() =>
      validateCadDoorSnapshot(invalid, store.definitions, identity),
    );
});
