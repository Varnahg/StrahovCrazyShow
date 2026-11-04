import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { TimelineInputQueue } from "../shared/input-timeline";
import { resyncRequestMatchesEpoch } from "../shared/netcode";
import { consumeRate } from "../server/session-lifecycle";

// Execute the actual registrations and reset/send methods without opening a
// server. The optional source path permits the same regression against history.
const source = ts.createSourceFile("server.ts", readFileSync(
  process.env.RESYNC_SERVER_SOURCE ?? new URL("../server/index.ts", import.meta.url), "utf8",
), ts.ScriptTarget.Latest, true);
const roomClass = source.statements.find((n): n is ts.ClassDeclaration =>
  ts.isClassDeclaration(n) && n.name?.text === "StrahovRoom")!;
const method = (name: string) => {
  const result = roomClass.members.find((n): n is ts.MethodDeclaration =>
    ts.isMethodDeclaration(n) && n.name.getText(source) === name);
  assert.ok(result?.body, `actual room must define ${name}`);
  return result;
};
const registrations = method("onCreate").body!.statements.filter(n => {
  if (ts.isVariableStatement(n)) return n.declarationList.declarations.some(d => d.name.getText(source) === "recoverInputEpoch");
  if (!ts.isExpressionStatement(n) || !ts.isCallExpression(n.expression)) return false;
  const call = n.expression;
  return call.expression.getText(source) === "this.onMessage" &&
    ["resync", "doorResync"].includes((call.arguments[0] as ts.StringLiteral).text);
});
const compiled = new Script(ts.transpileModule(`class RecoveryRoom {
  onCreate() { ${registrations.map(n => n.getText(source)).join("\n")} }
  ${["resetInputEpoch", "sendAuthority", "sendDoorSnapshot"].map(n => method(n).getText(source)).join("\n")}
}; RecoveryRoom;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText);

function fixture() {
  let now = 1000;
  const rates = new Map<string, number[]>(), rateCalls: string[] = [];
  const store = { players: new Map([["self", { ack: 4 }]]), rate(id: string, key: string, count: number, ms: number) {
    rateCalls.push(key);
    return consumeRate(rates, `${id}:${key}`, count, ms, now);
  } };
  const Room = compiled.runInNewContext({ store, resyncRequestMatchesEpoch });
  const room = new Room(), queue = new TimelineInputQueue(7, 100);
  const messages: { type: string; data: any }[] = [], client = {
    auth: { id: "self" }, send(type: string, data: unknown) { messages.push({ type, data }); },
  };
  const handlers = new Map<string, (c: typeof client, data: unknown) => void>();
  Object.assign(room, {
    connections: new Map([["self", client]]), inputQueues: new Map([["self", queue]]),
    nextInputEpoch: 7, simulationClock: { tick: 100, time: 1000 },
    onMessage: (name: string, handler: (c: typeof client, data: unknown) => void) => handlers.set(name, handler),
    sim: { actors: new Map([["self", { capture: () => ({ position: { x: 0, y: 1, z: 0 } }) }]]) },
    captureNetworkDiagnostics: () => ({}),
    doorInteractions: { revision: 0, identity: { worldEpoch: "room" }, snapshot: () => ({ revision: 0 }) },
  });
  room.onCreate();
  assert.equal(handlers.size, 2);
  return { room, queue, client, messages, store, rates, rateCalls,
    send: (channel: string, data: unknown, sender = client) => handlers.get(channel)!(sender, data),
    setNow: (value: number) => { now = value; },
  };
}
const command = (inputEpoch: number) => ({ inputEpoch, seq: 1, x: 1, z: 0, yaw: 0, jump: true, vehicle: false });

for (const [first, second] of [["resync", "resync"], ["doorResync", "doorResync"], ["resync", "doorResync"], ["doorResync", "resync"]])
  test(`actual handlers reset once and retain new inputs: ${first}/${second}`, (t) => {
    const f = fixture();
    f.send(first, { inputEpoch: 7 });
    assert.equal(f.queue.frontier().inputEpoch, 8);
    assert.equal(f.queue.push(command(8), 1000), "accepted");
    const before = f.queue.diagnostics(1000);
    f.setNow(2002); // Retry remains redundant even beyond the rate-limit window.
    f.send(second, { inputEpoch: 7 });
    t.diagnostic(`epoch=${f.queue.frontier().inputEpoch}; forcedAuthorities=${f.messages.filter(m => m.type === "authoritative").length}; queued=${f.queue.diagnostics(1000).depth}`);
    assert.equal(f.queue.frontier().inputEpoch, 8);
    assert.deepEqual(f.queue.diagnostics(1000), before);
    assert.deepEqual(f.messages.map(m => m.type), ["doorSnapshot", "authoritative"]);
    assert.equal(f.messages[1].data.resyncReason, "client-request");
    assert.equal(f.messages[1].data.resync, true);
    assert.equal(f.rateCalls.length, 1, "stale requests do not spend the valid epoch's rate budget");
  });

for (const channel of ["resync", "doorResync"]) {
  test(`actual ${channel} rejects old clients, malformed, old and future epochs before mutation`, () => {
    const f = fixture(), oldClient = { ...f.client };
    f.send(channel, { inputEpoch: 7 }, oldClient);
    for (const raw of [undefined, null, [], 7, {}, { inputEpoch: "7" }, { inputEpoch: -1 },
      { inputEpoch: NaN }, { inputEpoch: Infinity }, { inputEpoch: 7.1 },
      { inputEpoch: Number.MAX_SAFE_INTEGER + 1 }, { inputEpoch: 6 }, { inputEpoch: 8 }])
      f.send(channel, raw);
    assert.equal(f.queue.frontier().inputEpoch, 7);
    assert.equal(f.messages.length, 0);
    assert.equal(f.rateCalls.length, 0);
    f.room.inputQueues.clear();
    f.send(channel, { inputEpoch: 7 });
    assert.equal(f.messages.length, 0);
  });

  test(`actual ${channel} retry succeeds after a rate rejection without spending its epoch`, () => {
    const f = fixture(), key = channel === "resync" ? "resync" : "door-resync";
    f.rates.set(`self:${key}`, [1000, 1000]);
    f.send(channel, { inputEpoch: 7 });
    assert.equal(f.queue.frontier().inputEpoch, 7);
    assert.equal(f.messages.length, 0);
    f.setNow(2001);
    f.send(channel, { inputEpoch: 7 });
    assert.equal(f.queue.frontier().inputEpoch, 8);
    assert.equal(f.messages.length, 2);
  });

  test(`actual ${channel} cannot reset again after a server clock-drop epoch`, () => {
    const f = fixture();
    f.room.resetInputEpoch("self", f.queue);
    assert.equal(f.queue.push(command(8), 1000), "accepted");
    const before = f.queue.diagnostics(1000);
    f.send(channel, { inputEpoch: 7 });
    assert.deepEqual(f.queue.diagnostics(1000), before);
    assert.equal(f.messages.length, 0);
    assert.equal(f.rateCalls.length, 0);
  });
}

test("recovery token validation accepts zero and safe integers only for the current epoch", () => {
  assert.equal(resyncRequestMatchesEpoch({ inputEpoch: 0 }, 0), true);
  assert.equal(resyncRequestMatchesEpoch({ inputEpoch: Number.MAX_SAFE_INTEGER }, Number.MAX_SAFE_INTEGER), true);
  for (const epoch of [undefined, null, "0", -1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(resyncRequestMatchesEpoch({ inputEpoch: epoch }, Number(epoch)), false);
});
