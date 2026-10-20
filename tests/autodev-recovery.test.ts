import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fixture, isAlive, until } from "./fixtures/autodev/harness.ts";

test("hard-killed controller reconnects to its live worker; status and complete resume are read-only", async (t) => {
  const f = await fixture(t);
  const first = f.controller("run");
  const original = await f.ready(first);
  const running = await f.status(0);
  assert.equal(running.controllerAlive, true);
  assert.equal(running.controller.pid, first.child.pid);
  await first.kill();
  assert.notEqual(first.outcome!.code, 0);
  const absent = await f.status(0);
  assert.equal(absent.controllerAlive, false);
  assert.equal(absent.resumable, true);
  assert.equal((await f.supervisor()).pid, original.supervisorPid);

  const second = f.controller("resume");
  const recovered = await f.ready(second);
  assert.deepEqual(recovered, original);
  assert.notEqual(second.child.pid, first.child.pid);
  assert.deepEqual(await f.starts(), [
    { nonce: f.nonce, pid: original.workerPid },
  ]);
  await f.release();
  const result = await second.finish();
  assert.equal(result.status, "complete", result.lastError?.message);
  assert.equal(result.data.worker.attemptId, original.attemptId);
  assert.equal(
    await readFile(result.data.worker.stdoutPath, "utf8"),
    `started ${f.nonce}\nfinished ${f.nonce}\n`,
  );
  const terminal = await f.status(0);
  assert.equal(terminal.controllerAlive, false);
  assert.equal(terminal.resumable, false);
  const checkpoint = await readFile(f.statePath, "utf8");
  const receipt = await readFile(f.receiptPath, "utf8");
  assert.equal((await f.controller("resume").finish()).status, "complete");
  assert.equal(await readFile(f.statePath, "utf8"), checkpoint);
  assert.equal(await readFile(f.receiptPath, "utf8"), receipt);
  assert.equal((await f.starts()).length, 1);
});

test("worker finishes while controller is absent; resume consumes the original receipt", async (t) => {
  const f = await fixture(t);
  const first = f.controller("run");
  const original = await f.ready(first);
  await first.kill();
  const checkpoint = await readFile(f.statePath, "utf8");
  await f.release();
  const receipt = await f.receipt();
  assert.equal(receipt.exitCode, 0);
  assert.equal(await readFile(f.statePath, "utf8"), checkpoint);
  const originalReceipt = await readFile(f.receiptPath, "utf8");
  const second = f.controller("resume");
  const result = await second.finish();
  assert.equal(result.status, "complete", result.lastError?.message);
  assert.equal(result.data.worker.attemptId, original.attemptId);
  assert.ok(
    !second.events.some((event) => event.type === "supervisor-dispatched"),
  );
  assert.equal(await readFile(f.receiptPath, "utf8"), originalReceipt);
  assert.equal((await f.starts()).length, 1);
  assert.equal((await readdir(path.join(f.runDir, "attempts"))).length, 1);
});

test(
  "lost supervisor after a real controller crash stays unknown without replay",
  { timeout: 35_000 },
  async (t) => {
    const f = await fixture(t);
    const first = f.controller("run");
    const original = await f.ready(first);
    await first.kill();
    await f.killSupervisor();
    // libuv's Windows Job Object terminates non-detached children when their
    // supervisor dies. Where the worker survives, resume must leave it alone.
    const workerSurvived = isAlive(original.workerPid);
    t.diagnostic(
      `worker survived supervisor loss: ${workerSurvived}; platform=${process.platform}`,
    );
    const result = await f.controller("resume").finish(20_000);
    assert.equal(result.status, "unknown");
    assert.equal(result.lastError.code, "UNKNOWN_ATTEMPT");
    assert.equal(result.attempts["gated-worker"].id, original.attemptId);
    assert.equal(result.attempts["gated-worker"].status, "started");
    if (process.platform !== "win32" && workerSurvived)
      assert.equal(isAlive(original.workerPid), true);
    t.diagnostic(`worker alive after recovery: ${isAlive(original.workerPid)}`);
    assert.equal((await f.starts()).length, 1);
    await assert.rejects(readFile(f.receiptPath), { code: "ENOENT" });
    const status = await f.status(2);
    assert.equal(status.status, "unknown");
    assert.equal(status.controllerAlive, false);
    assert.equal(status.resumable, false);
    const again = await f.controller("resume").finish();
    assert.equal(again.status, "unknown");
    assert.equal((await f.starts()).length, 1);
  },
);

test("two separate resume processes compete for one singleton and retain one worker", async (t) => {
  const f = await fixture(t);
  const first = f.controller("run");
  const original = await f.ready(first);
  await first.kill();
  const contenders = [f.controller("resume"), f.controller("resume")];
  // The winner is held by the worker gate, so only the BUSY loser can exit.
  const loser = await until("one resume refused by singleton", async () =>
    contenders.find((child) => child.outcome),
  );
  assert.equal(JSON.parse(loser.stdout).error.code, "BUSY");
  const winner = contenders.find((child) => child !== loser)!;
  assert.deepEqual(await f.ready(winner), original);
  assert.equal((await f.status(0)).controller.pid, winner.child.pid);
  await f.release();
  assert.equal((await winner.finish()).status, "complete");
  assert.equal((await f.starts()).length, 1);
});

for (const corruption of ["invalid JSON", "wrong identity"] as const) {
  test(`receipt with ${corruption} fails closed and is preserved across resume`, async (t) => {
    const f = await fixture(t);
    const first = f.controller("run");
    await f.ready(first);
    await first.kill();
    await f.release();
    const receipt = await f.receipt();
    const broken =
      corruption === "invalid JSON"
        ? "{broken receipt\n"
        : JSON.stringify({ ...receipt, requestDigest: "wrong" });
    await writeFile(f.receiptPath, broken);
    for (let index = 0; index < 2; index++) {
      const result = await f.controller("resume").finish();
      assert.equal(result.status, "unknown");
      assert.equal(
        result.lastError.code,
        corruption === "invalid JSON" ? "CORRUPT_STATE" : "UNKNOWN_ATTEMPT",
      );
      assert.equal(await readFile(f.receiptPath, "utf8"), broken);
      assert.equal((await f.starts()).length, 1);
    }
    assert.equal((await f.status(2)).resumable, false);
  });
}

test("worker failure during controller absence remains stopped with its original exit and logs", async (t) => {
  const f = await fixture(t, 7);
  const first = f.controller("run");
  const original = await f.ready(first);
  await first.kill();
  await f.release();
  assert.equal((await f.receipt()).exitCode, 7);
  const receipt = await readFile(f.receiptPath, "utf8");
  for (let index = 0; index < 2; index++) {
    const result = await f.controller("resume").finish();
    assert.equal(result.status, "stopped");
    assert.match(result.lastError.message, /exited 7/);
    assert.equal(result.attempts["gated-worker"].id, original.attemptId);
    assert.equal(result.attempts["gated-worker"].exitCode, 7);
    assert.equal(await readFile(f.receiptPath, "utf8"), receipt);
    assert.equal((await f.starts()).length, 1);
  }
  assert.equal(await readFile(f.request.stderrPath, "utf8"), "exit 7\n");
  const status = await f.status(1);
  assert.equal(status.status, "stopped");
  assert.equal(status.controllerAlive, false);
});
