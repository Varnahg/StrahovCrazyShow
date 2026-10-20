import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const engine = await import(
  new URL("../scripts/autodev/engine.mjs", import.meta.url).href
);
const store = await import(
  new URL("../scripts/autodev/store.mjs", import.meta.url).href
);
const supervisor = await import(
  new URL("../scripts/autodev/supervisor.mjs", import.meta.url).href
);
type Context = {
  runId: string;
  runDir: string;
  data: Record<string, unknown>;
  state: any;
  save: (patch: object) => Promise<void>;
  supervise: (options: object) => Promise<any>;
};

async function fixture(t: TestContext) {
  const repo = await mkdtemp(path.join(tmpdir(), "strahov-autodev-engine-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await execute("git", ["init", "--initial-branch=main", repo], {
    windowsHide: true,
  });
  const assignment = path.join(repo, "assignment.json");
  await writeFile(
    assignment,
    JSON.stringify({
      schemaVersion: 1,
      issue: "KEY-47",
      task: "controller-fixture",
      workerTask: "worker-fixture",
      repository: "fixture/project",
      baseBranch: "main",
      intentFile: "intent.md",
      artifactDir: "artifacts/pilot",
      handoffFile: "handoff.md",
      prTitle: "Fixture pilot",
      checks: [{ id: "cli", command: "node", args: ["--version"] }],
      linearStates: { active: "In Progress", done: "Done" },
      acceptance: { kind: "cli", description: "CLI regression" },
      merge: true,
    }),
  );
  return { repo, assignment };
}

test("run checkpoints each stage once, complete resume has no effects, and a changed assignment is refused", async (t) => {
  const input = await fixture(t);
  const stages: string[] = [];
  let closes = 0;
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      stages.push(stage);
      if (stage === "prepare") await ctx.save({ reconciled: "remote-effect" });
      return { [stage]: true };
    },
    close: async () => {
      closes++;
    },
  };
  const result = await engine.run({ ...input, adapter });
  assert.equal(result.status, "complete");
  assert.deepEqual(stages, store.STAGES);
  assert.equal(result.data.reconciled, "remote-effect");
  const first = await readFile(path.join(result.runDir, "state.json"), "utf8");
  await engine.resume({ repo: input.repo, runId: result.runId, adapter });
  await engine.run({ ...input, adapter });
  assert.deepEqual(stages, store.STAGES);
  assert.equal(closes, 1);
  assert.equal(
    await readFile(path.join(result.runDir, "state.json"), "utf8"),
    first,
  );
  const assignment = JSON.parse(await readFile(input.assignment, "utf8"));
  await writeFile(
    input.assignment,
    JSON.stringify({ ...assignment, merge: false }),
  );
  await assert.rejects(engine.run({ ...input, adapter }), {
    code: "ASSIGNMENT_CHANGED",
  });
});

test("known stage failure retains remote-effect checkpoint and resumes only the unfinished stage", async (t) => {
  const input = await fixture(t);
  const calls: string[] = [];
  let fail = true;
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      calls.push(stage);
      if (stage === "publish") {
        if (!ctx.data.pr) await ctx.save({ pr: 42 });
        if (fail) {
          fail = false;
          throw new Error("Transport outcome requires reconciliation");
        }
        assert.equal(ctx.data.pr, 42);
      }
    },
  };
  const stopped = await engine.run({ ...input, adapter });
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.stage, "publish");
  const completed = await engine.resume({
    repo: input.repo,
    runId: stopped.runId,
    adapter,
  });
  assert.equal(completed.status, "complete");
  assert.equal(calls.filter((stage) => stage === "prepare").length, 1);
  assert.equal(calls.filter((stage) => stage === "publish").length, 2);
});

test("singleton rejects a second writer and status only reads while the first writer is paused", async (t) => {
  const input = await fixture(t);
  let entered!: () => void;
  const waiting = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let context!: Context;
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      if (stage === "prepare") {
        context = ctx;
        entered();
        await gate;
      }
    },
  };
  const first = engine.run({ ...input, adapter });
  await waiting;
  try {
    const stateFile = path.join(context.runDir, "state.json");
    const before = await stat(stateFile);
    const current = await engine.status({
      repo: input.repo,
      runId: context.runId,
    });
    assert.equal(current.controllerAlive, true);
    assert.equal(current.resumable, false);
    assert.equal((await stat(stateFile)).mtimeMs, before.mtimeMs);
    await assert.rejects(
      engine.resume({ repo: input.repo, runId: context.runId, adapter }),
      { code: "BUSY" },
    );
  } finally {
    release();
  }
  const result = await first;
  const current = await engine.status({
    repo: input.repo,
    runId: result.runId,
  });
  assert.equal(current.controllerAlive, false);
});

test("three concurrent supervisors preserve every receipt and never persist supplied environment secrets", async (t) => {
  const input = await fixture(t);
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      if (stage !== "review") return;
      const results = await Promise.all(
        [0, 1, 2].map((index) =>
          ctx.supervise({
            key: `review-${index}`,
            command: process.execPath,
            args: [
              "-e",
              `setTimeout(() => { process.stdout.write('review ${index}'); }, ${60 + index * 50})`,
            ],
            cwd: input.repo,
            env: { AUTODEV_FIXTURE_SECRET: "secret-must-not-be-persisted" },
          }),
        ),
      );
      for (const [index, result] of results.entries()) {
        assert.equal(result.exitCode, 0);
        assert.equal(
          await readFile(result.stdoutPath, "utf8"),
          `review ${index}`,
        );
      }
      return { reviews: results.map((result) => result.attemptId) };
    },
  };
  const result = await engine.run({ ...input, adapter });
  assert.equal(result.status, "complete", result.lastError?.message);
  assert.equal(Object.keys(result.attempts).length, 3);
  for (const attempt of Object.values(result.attempts) as any[]) {
    assert.equal(attempt.status, "complete");
    const request = await readFile(
      path.join(result.runDir, "attempts", attempt.id, "request.json"),
      "utf8",
    );
    assert.ok(!request.includes("secret-must-not-be-persisted"));
    assert.ok(!request.includes("AUTODEV_FIXTURE_SECRET"));
  }
  const persisted = JSON.parse(
    await readFile(path.join(result.runDir, "state.json"), "utf8"),
  );
  assert.equal(Object.keys(persisted.attempts).length, 3);
});

test("failed workers are returned from their original receipt on resume without duplicate effects", async (t) => {
  const input = await fixture(t);
  const counter = path.join(input.repo, "counter.txt");
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      if (stage !== "implement") return;
      const result = await ctx.supervise({
        key: "implementation",
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').appendFileSync(process.argv[1], 'once\\n'); process.exitCode=7",
          counter,
        ],
        cwd: input.repo,
      });
      if (result.exitCode !== 0)
        throw new Error(`Worker failed with ${result.exitCode}`);
    },
  };
  const first = await engine.run({ ...input, adapter });
  assert.equal(first.status, "stopped");
  assert.match(first.lastError.message, /failed with 7/);
  const again = await engine.resume({
    repo: input.repo,
    runId: first.runId,
    adapter,
  });
  assert.equal(again.status, "stopped");
  assert.equal(await readFile(counter, "utf8"), "once\n");
  assert.equal((await readdir(path.join(first.runDir, "attempts"))).length, 1);
});

test("corrupt checkpoint is preserved without constructing an adapter or creating another run", async (t) => {
  const input = await fixture(t);
  const result = await engine.run({
    ...input,
    adapter: { runStage: async () => {} },
  });
  const stateFile = path.join(result.runDir, "state.json");
  await writeFile(stateFile, "{corrupt");
  let called = false;
  await assert.rejects(
    engine.resume({
      repo: input.repo,
      runId: result.runId,
      adapter: {
        runStage: async () => {
          called = true;
        },
      },
    }),
    { code: "CORRUPT_STATE" },
  );
  assert.equal(called, false);
  assert.equal(await readFile(stateFile, "utf8"), "{corrupt");
});

test("every existing falsy JSON checkpoint is corrupt and all entrypoints preserve its bytes", async (t) => {
  const input = await fixture(t);
  const initial = await engine.run({
    ...input,
    adapter: { runStage: async () => {} },
  });
  const stateFile = path.join(initial.runDir, "state.json");
  const originalFiles = await readdir(initial.runDir);
  let adapterAccesses = 0;
  const adapter = {
    get runStage() {
      adapterAccesses++;
      throw new Error("Corrupt state must be rejected before adapter setup");
    },
  };
  for (const value of [null, false, 0, ""]) {
    const bytes = ` \n${JSON.stringify(value)}\t\n`;
    await writeFile(stateFile, bytes);
    for (const invoke of [
      () => engine.run({ ...input, adapter }),
      () => engine.resume({ repo: input.repo, runId: initial.runId, adapter }),
      () => engine.status({ repo: input.repo, runId: initial.runId }),
    ]) {
      await assert.rejects(invoke(), { code: "CORRUPT_STATE" });
      assert.equal(await readFile(stateFile, "utf8"), bytes);
      assert.deepEqual(await readdir(initial.runDir), originalFiles);
    }
  }
  assert.equal(adapterAccesses, 0);
});

test("falsy request, receipt and started records are preserved by engine and supervisor without any spawn", async (t) => {
  const input = await fixture(t);
  const output = path.join(input.repo, "must-not-run.txt");
  const initial = await engine.run({
    ...input,
    adapter: {
      runStage: async (stage: string) => {
        if (stage === "implement")
          throw new Error("Leave fixture ready for record validation");
      },
    },
  });
  let spawns = 0;
  for (const recordName of ["request", "receipt", "started"]) {
    for (const [index, value] of [null, false, 0, ""].entries()) {
      const command = {
        key: `corrupt-${recordName}-${index}`,
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').appendFileSync(process.argv[1], 'unexpected')",
          output,
        ],
        cwd: input.repo,
      };
      const attemptId = store
        .digest(`${initial.runId}\0${command.key}`)
        .slice(0, 24);
      const attemptDir = path.join(initial.runDir, "attempts", attemptId);
      await mkdir(attemptDir, { recursive: true });
      const requestPath = path.join(attemptDir, "request.json");
      await writeFile(
        requestPath,
        JSON.stringify({
          schemaVersion: 1,
          runId: initial.runId,
          attemptId,
          requestDigest: store.digest(command),
          token: "corrupt-record-fixture",
          ...command,
          stdoutPath: path.join(attemptDir, "stdout.log"),
          stderrPath: path.join(attemptDir, "stderr.log"),
        }),
      );
      const recordPath = path.join(attemptDir, `${recordName}.json`);
      const bytes = ` \n${JSON.stringify(value)}\t\n`;
      await writeFile(recordPath, bytes);
      const result = await engine.resume({
        repo: input.repo,
        runId: initial.runId,
        adapter: {
          runStage: async (_stage: string, ctx: Context) => {
            await ctx.supervise(command);
          },
        },
        onEvent: (event: { type: string }) => {
          if (event.type === "supervisor-dispatched") spawns++;
        },
      });
      assert.equal(result.status, "unknown");
      assert.equal(result.lastError.code, "UNKNOWN_ATTEMPT");
      assert.deepEqual(result.attempts, {});
      await assert.rejects(supervisor.superviseRequest(requestPath), {
        code: "UNKNOWN_ATTEMPT",
      });
      assert.equal(await readFile(recordPath, "utf8"), bytes);
      await assert.rejects(access(output), { code: "ENOENT" });
      await assert.rejects(access(path.join(attemptDir, "stdout.log")), {
        code: "ENOENT",
      });
    }
  }
  assert.equal(spawns, 0);
});

test("malformed attempt timestamps fail before supervision within a bounded resume and never repeat the worker", async (t) => {
  const input = await fixture(t);
  const output = path.join(input.repo, "worker.txt");
  const request = {
    key: "timestamp-worker",
    command: process.execPath,
    args: [
      "-e",
      "require('node:fs').appendFileSync(process.argv[1], 'once')",
      output,
    ],
    cwd: input.repo,
  };
  const initial = await engine.run({
    ...input,
    adapter: {
      runStage: async (stage: string, ctx: Context) => {
        if (stage !== "implement") return;
        await ctx.supervise(request);
        throw new Error("Leave the attempt pending for timestamp validation");
      },
    },
  });
  assert.equal(initial.status, "stopped");
  const stateFile = path.join(initial.runDir, "state.json");
  const initialState = JSON.parse(await readFile(stateFile, "utf8"));
  await unlink(
    path.join(
      initial.runDir,
      "attempts",
      initial.attempts[request.key].id,
      "receipt.json",
    ),
  );
  // A subprocess timeout bounds the historical NaN-deadline infinite poll.
  // It owns no worker: the original completed attempt is already recorded.
  const program = `
    const { resume } = await import(${JSON.stringify(new URL("../scripts/autodev/engine.mjs", import.meta.url).href)});
    let stageCalls = 0;
    try {
      await resume({ repo: ${JSON.stringify(input.repo)}, runId: ${JSON.stringify(initial.runId)},
        adapter: { runStage: async (stage, ctx) => {
          stageCalls++;
          if (stage === 'implement') await ctx.supervise(${JSON.stringify(request)});
        } }
      });
      console.log(JSON.stringify({ code: 'UNEXPECTED_RETURN', stageCalls }));
    } catch (error) { console.log(JSON.stringify({ code: error.code, stageCalls })); }
  `;
  for (const startedAt of [
    undefined,
    null,
    false,
    0,
    "",
    "not-a-date",
    "2026-02-30T00:00:00.000Z",
  ]) {
    const state = structuredClone(initialState);
    if (startedAt === undefined) delete state.attempts[request.key].startedAt;
    else state.attempts[request.key].startedAt = startedAt;
    const bytes = JSON.stringify(state);
    await writeFile(stateFile, bytes);
    const result = await execute(
      process.execPath,
      ["--input-type=module", "-e", program],
      {
        cwd: input.repo,
        windowsHide: true,
        timeout: 3_000,
      },
    );
    assert.deepEqual(JSON.parse(result.stdout), {
      code: "CORRUPT_STATE",
      stageCalls: 0,
    });
    assert.equal(await readFile(stateFile, "utf8"), bytes);
    assert.equal(await readFile(output, "utf8"), "once");
    assert.equal(
      (await readdir(path.join(initial.runDir, "attempts"))).length,
      1,
    );
  }
});

test("initial heartbeats finish before any worker and a failed reservation never starts it", async (t) => {
  const input = await fixture(t);
  const output = path.join(input.repo, "worker.txt");
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      if (stage !== "implement") return;
      const result = await ctx.supervise({
        key: "guarded-worker",
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').writeFileSync(process.argv[1], 'must not run')",
          output,
        ],
        cwd: input.repo,
        heartbeat: [
          {
            command: process.execPath,
            args: ["-e", "setTimeout(() => {}, 100)"],
            cwd: input.repo,
            intervalMs: 100,
          },
          {
            command: process.execPath,
            args: ["-e", "process.exitCode=5"],
            cwd: input.repo,
            intervalMs: 100,
          },
        ],
      });
      assert.equal(result.exitCode, 1);
      assert.match(result.error, /worker was not started/);
      assert.match(result.heartbeatError, /heartbeat failed/);
      throw new Error("Lost reservation");
    },
  };
  const result = await engine.run({ ...input, adapter });
  assert.equal(result.status, "stopped");
  await assert.rejects(access(output), { code: "ENOENT" });
  const again = await engine.resume({
    repo: input.repo,
    runId: result.runId,
    adapter,
  });
  assert.equal(again.status, "stopped");
  await assert.rejects(access(output), { code: "ENOENT" });
});

test("concurrent calls for one attempt share one worker; changed arguments are rejected", async (t) => {
  const input = await fixture(t);
  const output = path.join(input.repo, "worker.txt");
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      if (stage !== "implement") return;
      const request = {
        key: "same-worker",
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').appendFileSync(process.argv[1], 'once')",
          output,
        ],
        cwd: input.repo,
      };
      const first = ctx.supervise(request);
      const second = ctx.supervise(request);
      await assert.rejects(ctx.supervise({ ...request, args: ["--version"] }), {
        code: "ATTEMPT_CONFLICT",
      });
      const [one, two] = await Promise.all([first, second]);
      assert.equal(one.attemptId, two.attemptId);
    },
  };
  const result = await engine.run({ ...input, adapter });
  assert.equal(result.status, "complete");
  assert.equal(await readFile(output, "utf8"), "once");
});

test("lost supervisor receipt fails closed as unknown and cannot replay a completed worker", async (t) => {
  const input = await fixture(t);
  const output = path.join(input.repo, "worker.txt");
  const adapter = {
    runStage: async (stage: string, ctx: Context) => {
      if (stage !== "implement") return;
      await ctx.supervise({
        key: "lost-worker",
        command: process.execPath,
        args: [
          "-e",
          "require('node:fs').appendFileSync(process.argv[1], 'once')",
          output,
        ],
        cwd: input.repo,
      });
      throw new Error("Keep stage pending for reconciliation");
    },
  };
  const first = await engine.run({ ...input, adapter });
  const checkpoint = path.join(first.runDir, "state.json");
  const state = JSON.parse(await readFile(checkpoint, "utf8"));
  state.attempts["lost-worker"].startedAt = "2000-01-01T00:00:00.000Z";
  await writeFile(checkpoint, JSON.stringify(state));
  await unlink(
    path.join(
      first.runDir,
      "attempts",
      state.attempts["lost-worker"].id,
      "receipt.json",
    ),
  );
  const again = await engine.resume({
    repo: input.repo,
    runId: first.runId,
    adapter,
  });
  assert.equal(again.status, "unknown");
  assert.equal(again.lastError.code, "UNKNOWN_ATTEMPT");
  assert.equal(await readFile(output, "utf8"), "once");
});

test("adapter setup failure and uncertain remote effect retain accurate stopped and unknown states", async (t) => {
  const input = await fixture(t);
  const stopped = await engine.run({ ...input, adapter: {} });
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.lastError.code, "INVALID_ADAPTER");
  const unknown = await engine.resume({
    repo: input.repo,
    runId: stopped.runId,
    adapter: {
      runStage: async () => {
        throw Object.assign(new Error("Remote mutation outcome is unknown"), {
          code: "UNKNOWN_EFFECT",
        });
      },
    },
  });
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.lastError.code, "UNKNOWN_EFFECT");
  const current = await engine.status({
    repo: input.repo,
    runId: stopped.runId,
  });
  assert.equal(current.controllerAlive, false);
  assert.equal(current.resumable, false);
});
