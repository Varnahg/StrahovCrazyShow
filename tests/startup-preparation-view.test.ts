import test from "node:test";
import assert from "node:assert/strict";
import { AuthorityBuffer } from "../client/authority-buffer";
import { StartupPreparationViews, StartupViewGateBudget, startupViewKey } from "../client/startup-preparation-view";
import type { Authority } from "../shared/netcode";

const packet = (ack = 0, epoch = 1): Authority => ({ inputEpoch: epoch, inputTickBase: 0, tick: ack, ack, receivedSeq: ack, time: 1000 + ack * 17,
  state: { position: { x: -3.696, y: 2.62, z: -73.087 }, yaw: 1.2, vehicle: false, grounded: true, vertical: 0, speed: 0 } });
test("accepted authority projection copies actor-center pose without taking or changing actual queue/frontier", () => {
  const room = {}, buffer = new AuthorityBuffer(), views = new StartupPreparationViews(); views.begin(room, "self", 1);
  const first = packet(), offered = buffer.offer(first, 100); const before = JSON.stringify(buffer);
  assert.equal(views.offer(room, first, 100, offered), true); assert.equal(JSON.stringify(buffer), before);
  const view = views.read(room, "self", 1, [])!; assert.deepEqual(view.authority!.position, first.state.position);
  first.state.position.x = 999; assert.equal(view.authority!.position.x, -3.696);
  const next = packet(1), latest = buffer.offer(next, 117); assert.equal(views.offer(room, next, 117, latest), true);
  const queued = JSON.stringify(buffer); views.read(room, "self", 1, []); assert.equal(JSON.stringify(buffer), queued);
  assert.equal(buffer.takeLatest()!.packet, next, "the original UI drain still owns the untouched ordinary packet");
});
test("invalid pose/mode/yaw and rejected stale authority cannot become a presentation anchor", () => {
  const room = {}, buffer = new AuthorityBuffer(), views = new StartupPreparationViews(); views.begin(room, "self", 1);
  const original = packet(1); views.offer(room, original, 1, buffer.offer(original, 1));
  for (const state of [{ ...original.state, position: { x: NaN, y: 1, z: 2 } }, { ...original.state, position: { x: 1e100, y: 1, z: 2 } },
    { ...original.state, yaw: Infinity }, { ...original.state, vehicle: "false" }]) {
    const invalid = { ...packet(2), state } as Authority;
    assert.equal(views.offer(room, invalid, 2, { kind: "queued", replaced: false }), false);
  }
  const stale = packet(0); assert.equal(views.offer(room, stale, 3, buffer.offer(stale, 3)), false);
  assert.equal(views.read(room, "self", 1, [])!.authority!.tick, 1);
});
test("owner/self/attempt retirement and a late old finish cannot release a fresh room projection", () => {
  const old = {}, fresh = {}, views = new StartupPreparationViews(), buffer = new AuthorityBuffer();
  views.begin(old, "old", 1); views.begin(fresh, "new", 2);
  const authority = packet(); assert.equal(views.offer(old, authority, 1, buffer.offer(authority, 1)), false);
  assert.equal(views.read(old, "old", 1, []), null); assert.equal(views.read(fresh, "new", 1, []), null);
  views.finish(old); assert.ok(views.read(fresh, "new", 2, [])); views.finish(fresh); assert.equal(views.read(fresh, "new", 2, []), null);
});
test("20Hz packet/tick identity and submillimetre jitter do not change the spatial stage key; epoch/roster/mode do", () => {
  const room = {}, views = new StartupPreparationViews(), buffer = new AuthorityBuffer(); views.begin(room, "self", 1);
  const roster: any[] = [{ id: "self", avatar: { preset: 4 } }]; let key = "";
  for (let i = 0; i < 20; i++) {
    const value = packet(i); value.state.position.y += i % 2 ? 0.0001 : 0;
    views.offer(room, value, 100 + i * 50, buffer.offer(value, 100 + i * 50)); const snapshot = views.read(room, "self", 1, roster)!;
    if (!i) key = startupViewKey(snapshot); else assert.equal(startupViewKey(snapshot), key);
    assert.equal(snapshot.authority!.position.y, value.state.position.y, "exact latest view is not quantized");
  }
  assert.notEqual(startupViewKey(views.read(room, "self", 1, [...roster, { id: "peer", avatar: {} } as any])!), key);
  roster[0].avatar = { preset: 1 };
  assert.notEqual(startupViewKey(views.read(room, "self", 1, roster)!), key, "same-array profile replacement is still a roster revision");
  const mode = packet(21); mode.state.vehicle = true; views.offer(room, mode, 1200, buffer.offer(mode, 1200));
  assert.notEqual(startupViewKey(views.read(room, "self", 1, roster)!), key);
  const epoch = packet(22, 2); views.offer(room, epoch, 1300, buffer.offer(epoch, 1300));
  assert.notEqual(startupViewKey(views.read(room, "self", 1, roster)!), key);
});
test("one visible30s final-gate budget spans first gate, delayed observer, hidden pause and handshake without reset", () => {
  let now = 0; const budget = new StartupViewGateBudget(() => now, true);
  now = 2000; assert.equal(budget.remaining(), 28000);
  now = 7000; assert.equal(budget.remaining(), 23000, "observer window spends original budget");
  budget.visibility(false); now = 67000; assert.equal(budget.remaining(), 23000); budget.visibility(true);
  now = 70000; assert.equal(budget.remaining(), 20000); now = 100000; assert.equal(budget.remaining(), 0);
  //89s quality preparation is outside the separate submitted-frame clock.
  now = 89000; const originalGate = new StartupViewGateBudget(() => now, true); now = 91000; assert.equal(originalGate.remaining(), 28000);
});
