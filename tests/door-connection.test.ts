import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DoorConnection,
  DOOR_REJECTION_MESSAGES,
} from "../client/door-connection";
import { currentRoomCallbacks } from "../client/room-callbacks";
import {
  placeCadDoorDefinition,
  type CadDoorSnapshot,
  type CadDoorDelta,
} from "../shared/cad-doors";
import type { CadDoorTimeline } from "../shared/cad-door-timeline";
import { messages } from "../client/i18n-messages";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";

const definition = placeCadDoorDefinition(
  {
    id: "test",
    buildingId: "b06",
    floor: "N01",
    sourceDoorId: "source",
    renderPartIds: ["leaf"],
    collisionPartIds: [],
    hingeModel: { x: 0, y: 1, z: 0 },
    closedPose: { position: { x: 0.5, y: 1, z: 0 }, rotationY: 0 },
    collider: { halfExtents: { x: 0.5, y: 1, z: 0.02 } },
    openAngle: Math.PI / 2,
    handleModel: { x: 0.9, y: 1, z: 0 },
    defaultOpen: false,
  },
  { translation: { x: 0, y: 0, z: 0 }, yaw: 0 },
);
const identity = { worldEpoch: "room-a", definitionHash: "a".repeat(64) };
const snapshot = (revision = 0, tick = revision): CadDoorSnapshot => ({
  ...identity,
  revision,
  tick,
  states: [
    {
      id: definition.id,
      open: revision % 2 === 1,
      revision,
      changedAtTick: revision,
    },
  ],
});
const delta = (revision: number): CadDoorDelta => ({
  ...identity,
  revision,
  tick: revision,
  door: snapshot(revision).states[0],
});
function fixture() {
  let current = true,
    time = 0,
    recoveries = 0;
  const attachments: (CadDoorTimeline | null)[] = [],
    notices: string[] = [];
  const connection = new DoorConnection({
    definitions: [definition],
    definitionHash: identity.definitionHash,
    isCurrent: () => current,
    onTimeline: (t) => attachments.push(t),
    requestResync: () => {
      recoveries++;
    },
    onNotice: (m) => notices.push(m),
    now: () => time,
  });
  return {
    connection,
    attachments,
    notices,
    get recoveries() {
      return recoveries;
    },
    setTime(t: number) {
      time = t;
    },
    retire() {
      current = false;
    },
  };
}

test("snapshot and ordered changes survive a long Game startup in bounded connection-owned history", () => {
  const f = fixture();
  assert.equal(f.connection.timeline?.initialized, undefined);
  assert.equal(f.connection.receiveSnapshot(snapshot()), true);
  const identityOfTimeline = f.connection.timeline!;
  for (let revision = 1; revision <= 301; revision++)
    assert.equal(f.connection.receiveDelta(delta(revision)), true);
  assert.equal(f.connection.timeline, identityOfTimeline);
  assert.ok(identityOfTimeline.eventCount <= 128);
  assert.equal(identityOfTimeline.snapshotAt(100), null);
  assert.equal(identityOfTimeline.snapshotAt(301, 301)?.states[0].open, true);
  // Late Game construction attaches the current object, not its initial closed snapshot.
  const readyGame = { timeline: f.connection.timeline };
  assert.equal(readyGame.timeline?.currentSnapshot()?.revision, 301);
  assert.equal(f.recoveries, 0);
  assert.ok(f.attachments.every((t) => t === identityOfTimeline));
  f.connection.dispose();
  assert.equal(readyGame.timeline?.currentSnapshot(), null);
});

test("a revision gap pauses authority and requests one bounded recovery, then complete state resumes", () => {
  const f = fixture();
  f.connection.receiveSnapshot(snapshot());
  assert.equal(f.connection.receiveDelta(delta(2)), false);
  assert.equal(f.recoveries, 1);
  assert.equal(f.connection.timeline?.currentSnapshot(), null);
  for (let i = 0; i < 100; i++) {
    f.connection.receiveDelta(delta(3));
    f.connection.requestResync();
  }
  assert.equal(f.recoveries, 1);
  f.setTime(1000);
  f.connection.requestResync();
  assert.equal(f.recoveries, 2);
  assert.equal(f.connection.receiveSnapshot(snapshot(3)), true);
  assert.equal(f.connection.timeline?.snapshotAt(3, 3)?.states[0].open, true);
  assert.equal(f.connection.receiveDelta(delta(4)), true);
  assert.equal(f.connection.timeline?.currentSnapshot()?.states[0].open, false);
  const pre = new DoorConnection({
    definitions: [definition],
    definitionHash: identity.definitionHash,
    isCurrent: () => true,
    requestResync: () => {},
    onTimeline: () => {},
    onNotice: () => {},
  });
  assert.equal(pre.receiveDelta(delta(1)), false);
  assert.equal(pre.timeline, null);
  pre.dispose();
});

test("mismatched model/epoch fails closed once; a new connection is required to establish another world", () => {
  const f = fixture();
  f.connection.receiveSnapshot(snapshot());
  const old = f.connection.timeline!;
  assert.equal(
    f.connection.receiveSnapshot({
      ...snapshot(),
      definitionHash: "b".repeat(64),
    }),
    false,
  );
  assert.equal(f.connection.failed, true);
  assert.equal(f.connection.timeline, null);
  assert.equal(old.currentSnapshot(), null);
  for (let i = 0; i < 20; i++) f.connection.receiveSnapshot(snapshot());
  assert.equal(f.notices.length, 1);
  assert.equal(f.recoveries, 1);
  f.setTime(10000);
  assert.equal(f.connection.requestResync(), false);
  assert.equal(f.recoveries, 1);
  const g = fixture();
  g.connection.receiveSnapshot(snapshot());
  assert.equal(
    g.connection.receiveDelta({ ...delta(1), worldEpoch: "room-b" }),
    false,
  );
  assert.equal(g.connection.failed, true);
  const next = fixture();
  assert.equal(
    next.connection.receiveSnapshot({ ...snapshot(), worldEpoch: "room-b" }),
    true,
  );
  assert.equal(next.connection.timeline?.identity.worldEpoch, "room-b");
});

test("incomplete baselines never invent closed state and result acknowledgements never replace deltas", () => {
  const f = fixture();
  assert.equal(f.connection.receiveSnapshot({}), false);
  assert.equal(f.connection.failed, false);
  assert.equal(
    f.connection.receiveSnapshot({ ...snapshot(), states: [] }),
    false,
  );
  assert.equal(f.connection.timeline?.currentSnapshot(), null);
  assert.equal(f.recoveries, 1);
  assert.equal(f.connection.receiveSnapshot(snapshot()), true);
  f.connection.receiveResult({
    ...identity,
    status: "changed",
    requestId: 1,
    state: { id: definition.id, open: true, revision: 1, changedAtTick: 1 },
  });
  assert.equal(f.connection.timeline?.revision, 0);
  assert.equal(f.connection.timeline?.currentSnapshot()?.states[0].open, false);
  f.connection.receiveResult({
    ...identity,
    status: "rejected",
    requestId: 2,
    reason: "occupied",
  });
  assert.equal(f.notices.at(-1), DOOR_REJECTION_MESSAGES.occupied);
  f.setTime(1000);
  f.connection.receiveResult({
    ...identity,
    status: "rejected",
    requestId: 3,
    reason: "stale-revision",
  });
  assert.equal(f.recoveries, 2);
  assert.equal(f.connection.timeline?.revision, 0);
  const count = f.notices.length;
  f.connection.receiveResult({
    ...identity,
    worldEpoch: "elsewhere",
    status: "rejected",
    requestId: 4,
    reason: "occupied",
  });
  assert.equal(f.notices.length, count);
  for (const key of Object.values(DOOR_REJECTION_MESSAGES))
    assert.ok(messages[key]);
});

test("retained SDK listeners and callbacks from disposed connections cannot mutate a replacement or guest", () => {
  const listeners = new Map<string, (data: unknown) => void>();
  let room = "old";
  const callbacks = currentRoomCallbacks(
    {
      onMessage: (name, callback) =>
        listeners.set(name, callback as (data: unknown) => void),
      onLeave: () => {},
      onError: () => {},
    },
    () => room === "old",
  );
  const f = fixture();
  callbacks.onMessage("doorSnapshot", (data) =>
    f.connection.receiveSnapshot(data),
  );
  listeners.get("doorSnapshot")!(snapshot(1));
  const first = f.connection.timeline!;
  f.retire();
  f.connection.dispose();
  room = "new";
  const next = fixture();
  next.connection.receiveSnapshot({ ...snapshot(), worldEpoch: "new" });
  listeners.get("doorSnapshot")!(snapshot(3));
  f.connection.receiveDelta(delta(4));
  f.connection.dispose();
  assert.equal(first.currentSnapshot(), null);
  assert.equal(next.connection.timeline?.revision, 0);
  assert.equal(f.attachments.at(-1), null);
  const count = f.attachments.length;
  room = "guest";
  listeners.get("doorSnapshot")!(snapshot(7));
  assert.equal(f.attachments.length, count);
  assert.equal(f.connection.requestResync(), false);
});

test("actual UI timeline callbacks attach only to the owning multiplayer Game, including startup before readiness", () => {
  const source = ts.createSourceFile(
    "ui.tsx",
    readFileSync(new URL("../client/ui.tsx", import.meta.url), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let callback: ts.ArrowFunction | undefined,
    startup: ts.IfStatement | undefined;
  const visit = (node: ts.Node) => {
    if (
      ts.isNewExpression(node) &&
      node.expression.getText(source) === "DoorConnection"
    ) {
      const options = node.arguments![0] as ts.ObjectLiteralExpression;
      callback = (
        options.properties.find(
          (p) =>
            ts.isPropertyAssignment(p) &&
            p.name.getText(source) === "onTimeline",
        ) as ts.PropertyAssignment
      ).initializer as ts.ArrowFunction;
    }
    if (
      ts.isIfStatement(node) &&
      node.expression.getText(source) === "g.network" &&
      node.getText(source).includes("g.attachDoorTimeline")
    )
      startup = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback);
  assert.ok(startup);
  const compile = (s: string) =>
    ts.transpileModule(s, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
  const owner = {},
    replacement = {},
    timeline = {},
    attachments: unknown[] = [];
  const doorConnectionRef = { current: owner as unknown },
    g = {
      network: false,
      ready: false,
      attachDoorTimeline: (t: unknown) => attachments.push(t),
    },
    game = { current: g };
  const attach = new Script(
    compile(`const attach=${callback.getText(source)};attach;`),
  ).runInNewContext({ doorConnectionRef, doors: owner, game });
  attach(timeline);
  assert.deepEqual(attachments, []); // pre-existing guest Game during an async multiplayer join
  g.network = true;
  attach(timeline);
  assert.deepEqual(attachments, [timeline]);
  doorConnectionRef.current = replacement;
  attach(null);
  assert.deepEqual(attachments, [timeline]); // old connection cannot detach new owner
  doorConnectionRef.current = owner;
  attach(null);
  assert.deepEqual(attachments, [timeline, null]);
  const startupRef = { current: { timeline } };
  const start = new Script(compile(startup.getText(source)));
  g.network = false;
  start.runInNewContext({ g, doorConnectionRef: startupRef });
  assert.equal(attachments.length, 2);
  g.network = true;
  start.runInNewContext({ g, doorConnectionRef: startupRef });
  assert.equal(attachments.at(-1), timeline);
});
