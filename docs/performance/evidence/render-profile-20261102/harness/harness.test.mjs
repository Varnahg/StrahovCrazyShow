import test from "node:test";
import assert from "node:assert/strict";
import { parseArguments, runDirectory, stopController, assertInputIdentity, isAllowedPerformanceCheckout } from "./common.mjs";
import { joinWithDeadline } from "./join.mjs";

test("CLI only accepts declared build and bounded run identities", () => {
  assert.deepEqual(parseArguments(["--build", "baseline"]), { command: "--build", name: "baseline" });
  assert.equal(parseArguments(["--peers", "run3"]).name, "run3");
  assert.equal(parseArguments(["--serve", "run1-attempt2"]).name, "run1-attempt2");
  for (const args of [[], ["--serve", "../run1"], ["--serve", "run4"], ["--build", "candidate"], ["--peers", "run1", "extra"]])
    assert.throws(() => parseArguments(args));
  assert.throws(() => runDirectory("../../escape"));
});
test("STOP polling notices a new marker without OS signals and keeps its first reason", async () => {
  let stopped = false;
  const control = stopController(["own/STOP"], { exists: async () => stopped, pollMs: 1, lifetimeMs: 1000 });
  stopped = true;
  assert.equal(await control.stopped, "STOP:own/STOP");
  assert.equal(control.signal.aborted, true); control.stop("another");
  assert.equal(control.reason, "STOP:own/STOP"); control.dispose();
});
test("STOP filesystem failure fails closed and lifetime is bounded", async () => {
  const denied = stopController(["own/STOP"], { exists: async () => { throw new Error("denied"); }, lifetimeMs: 1000 });
  assert.match(await denied.stopped, /stop-check-error/); denied.dispose();
  const expiry = stopController([], { pollMs: 1, lifetimeMs: 5 });
  assert.equal(await expiry.stopped, "90-minute-limit"); expiry.dispose();
});
test("every measured identity and protected old harness must remain unchanged", () => {
  const input = { sourceHash: "a", publicHash: "b", dependencyHash: "c", harnessHash: "d", oldHarness: { sha256: "e" } };
  assert.doesNotThrow(() => assertInputIdentity(input, structuredClone(input)));
  for (const key of ["sourceHash", "publicHash", "dependencyHash", "harnessHash"])
    assert.throws(() => assertInputIdentity(input, { ...input, [key]: "different" }));
  assert.throws(() => assertInputIdentity(input, { ...input, oldHarness: { sha256: "changed" } }));
});
test("disposing STOP polling during an awaited filesystem read prevents rearming", async () => {
  let finishRead, calls = 0;
  const control = stopController(["own/STOP"], { exists: () => { calls++; return new Promise(done => { finishRead = done; }); }, pollMs: 1, lifetimeMs: 1000 });
  control.dispose(); finishRead(false);
  await new Promise(done => setTimeout(done, 15));
  assert.equal(calls, 1); assert.equal(control.signal.aborted, false);
});
test("STOP aborts SDK matchmaking HTTP without opening or leaking a room", async () => {
  const stop = new AbortController(), owned = new Set(); let httpSignal;
  class Client {
    constructor(_endpoint, options) { this.options = options; }
    joinById() { return this.options.fetchFn("http://fixture/matchmake/joinById/test"); }
  }
  const promise = joinWithDeadline(Client, "http://fixture", "test", {}, stop.signal, owned, {
    fetchFn: (_url, init) => new Promise((_, reject) => {
      httpSignal = init.signal; httpSignal.addEventListener("abort", () => reject(httpSignal.reason), { once: true });
    }),
  });
  stop.abort(new Error("STOP")); await assert.rejects(promise, /STOP/);
  assert.equal(httpSignal.aborted, true); assert.equal(owned.size, 0);
});
test("handshake is owned before connect, bounded, and late join success is closed", async () => {
  const stop = new AbortController(), owned = new Set(); let finishJoin, closes = 0, room;
  class Client {
    createRoom() { return { reconnection: { enabled: true }, connection: { close() { closes++; } } }; }
    joinById() {
      room = this.createRoom();
      assert.equal(owned.has(room), true, "room ownership must precede connection/handshake");
      return new Promise(done => { finishJoin = done; });
    }
  }
  await assert.rejects(joinWithDeadline(Client, "http://fixture", "test", {}, stop.signal, owned, { timeoutMs: 5 }), /deadline/);
  assert.ok(closes > 0); assert.equal(room.reconnection.enabled, false);
  const before = closes; finishJoin(room); await Promise.resolve(); await Promise.resolve();
  assert.ok(closes > before, "late joined connection receives cleanup too");
});

test("graphics checkout exception requires the exact authorized branch and D path", () => {
  const root = "D:/CodexWorkspaces/StrahovCrazyShow-graphics-20261104", branch = "codex/graphics-smoothness-20261104";
  assert.equal(isAllowedPerformanceCheckout(root, branch), true);
  assert.equal(isAllowedPerformanceCheckout(root.toLowerCase()+"/", branch), true);
  assert.equal(isAllowedPerformanceCheckout(root.replaceAll("/", "\\"), branch), true);
  assert.equal(isAllowedPerformanceCheckout(root, "main"), true);
  for (const [path, name] of [[root, "feature/other"], [root, branch+"-other"], [root+"-other", branch], [root.replace("D:", "C:"), branch]])
    assert.equal(isAllowedPerformanceCheckout(path, name), false);
});
