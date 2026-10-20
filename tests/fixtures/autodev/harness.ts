import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import type { TestContext } from "node:test";

const { ipcEndpoint, queryIpc } = await import(
  new URL("../../../scripts/autodev/process.mjs", import.meta.url).href
);
const controllerFile = fileURLToPath(
  new URL("./controller.mjs", import.meta.url),
);
const cliFile = fileURLToPath(
  new URL("../../../scripts/autodev.mjs", import.meta.url),
);
const prefix = "strahov-autodev-recovery-";

export function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error: any) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

export async function until<T>(
  description: string,
  inspect: () => Promise<T | null | undefined | false>,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  do {
    const result = await inspect();
    if (result) return result;
    await pause(25);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`);
}

async function optionalJson(file: string) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error: any) {
    // Fixture markers are plain files. Production checkpoints are read strictly.
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

type Outcome = { code: number | null; signal: NodeJS.Signals | null };
type Event = Record<string, any>;

class Process {
  child: ChildProcess;
  stdout = "";
  stderr = "";
  events: Event[] = [];
  outcome: Outcome | undefined;
  closed: Promise<Outcome>;

  constructor(command: string, args: string[], cwd: string) {
    this.child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
      this.stdout += chunk;
    });
    let pending = "";
    this.child.stderr!.setEncoding("utf8").on("data", (chunk: string) => {
      this.stderr += chunk;
      pending += chunk;
      while (pending.includes("\n")) {
        const index = pending.indexOf("\n");
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        try {
          this.events.push(JSON.parse(line));
        } catch {
          // Keep non-JSON diagnostics in stderr for a useful failure message.
        }
      }
    });
    this.closed = new Promise((resolve, reject) => {
      this.child.once("error", reject);
      this.child.once("close", (code, signal) => {
        this.outcome = { code, signal };
        resolve(this.outcome);
      });
    });
    this.closed.catch(() => {});
  }

  async event(type: string) {
    return until(`process ${this.child.pid}: ${type}`, async () => {
      const found = this.events.find((event) => event.type === type);
      if (found) return found;
      if (this.outcome)
        throw new Error(
          `Process exited before ${type}: ${this.stdout}\n${this.stderr}`,
        );
      return null;
    });
  }

  async finish(timeoutMs = 10_000) {
    await until(
      `process ${this.child.pid} exit`,
      async () => this.outcome,
      timeoutMs,
    );
    await this.closed;
    return JSON.parse(this.stdout.trim());
  }

  async kill() {
    if (!this.outcome) this.child.kill("SIGKILL");
    await until(
      `killed process ${this.child.pid} exit`,
      async () => this.outcome,
    );
    await this.closed;
  }
}

export async function fixture(t: TestContext, exitCode = 0) {
  const temporaryBase = await realpath(tmpdir());
  const root = await mkdtemp(path.join(temporaryBase, prefix));
  const canonicalRoot = await realpath(root);
  const processes: Process[] = [];
  let runId: string;
  let runDir: string;
  let request: any;
  let supervisorPid: number | undefined;
  let workerPid: number | undefined;
  const nonce = randomUUID();

  const start = (command: string, args: string[]) => {
    const child = new Process(command, args, root);
    processes.push(child);
    return child;
  };
  const release = () =>
    writeFile(path.join(root, "release-worker"), "release\n");
  const supervisor = async () => {
    if (!request) return null;
    try {
      return await queryIpc(
        ipcEndpoint("attempt", `${runDir}\0${request.attemptId}`),
        { operation: "status", token: request.token },
      );
    } catch (error: any) {
      if (["ENOENT", "ECONNREFUSED"].includes(error.code)) return null;
      throw error;
    }
  };

  t.after(async () => {
    // Only captured child handles are killed. Supervisors/workers finish through
    // this fixture's private gate; no process is selected by port or stale PID.
    await release();
    await Promise.all(
      processes.filter((child) => !child.outcome).map((child) => child.kill()),
    );
    if (workerPid)
      await until("owned worker exited", async () => !isAlive(workerPid!));
    if (supervisorPid)
      await until(
        "owned supervisor exited",
        async () => !isAlive(supervisorPid!),
      );
    t.diagnostic(
      `fixture=${root}; controllers/CLI=${processes.map((child) => child.child.pid).join(",")}; supervisor=${supervisorPid}; worker=${workerPid}; all exited; no ports`,
    );
    assert.equal(await realpath(root), canonicalRoot);
    assert.equal(path.dirname(canonicalRoot), temporaryBase);
    assert.ok(path.basename(canonicalRoot).startsWith(prefix));
    await rm(canonicalRoot, { recursive: true, force: true });
  });

  const init = start("git", ["init", "--quiet", "--initial-branch=main", root]);
  await init.closed;
  assert.equal(init.outcome!.code, 0, init.stderr);
  await writeFile(
    path.join(root, "fixture.json"),
    JSON.stringify({ nonce, exitCode }),
  );
  await writeFile(
    path.join(root, "assignment.json"),
    JSON.stringify({
      schemaVersion: 1,
      issue: "QA-1",
      task: "fixture-controller",
      workerTask: "fixture-worker",
      repository: "fixture/local-process-test",
      baseBranch: "main",
      intentFile: "intent.md",
      artifactDir: "artifacts",
      handoffFile: "handoff.md",
      prTitle: "Local process fixture only",
      checks: [{ id: "fixture", command: "node", args: ["--version"] }],
      linearStates: { active: "In Progress", done: "Done" },
      acceptance: { kind: "cli", description: "Local lifecycle test only" },
      merge: false,
    }),
  );

  return {
    root,
    nonce,
    get runId() {
      return runId;
    },
    get runDir() {
      return runDir;
    },
    get request() {
      return request;
    },
    get receiptPath() {
      return path.join(runDir, "attempts", request.attemptId, "receipt.json");
    },
    get statePath() {
      return path.join(runDir, "state.json");
    },
    release,
    supervisor,
    controller(command: "run" | "resume") {
      return start(process.execPath, [
        controllerFile,
        root,
        command,
        ...(runId ? [runId] : []),
      ]);
    },
    async ready(controller: Process) {
      const connected = await controller.event("worker-connected");
      runId = connected.runId;
      runDir = path.join(root, ".git", "autodev", "runs", runId);
      request = JSON.parse(
        await readFile(
          path.join(runDir, "attempts", connected.attemptId, "request.json"),
          "utf8",
        ),
      );
      const identity = await supervisor();
      assert.equal(identity.attemptId, connected.attemptId);
      assert.equal(identity.token, request.token);
      assert.equal(identity.pid, connected.supervisorPid);
      supervisorPid = identity.pid;
      const worker = await until("worker ready", () =>
        optionalJson(path.join(root, "worker-ready.json")),
      );
      assert.equal(worker.nonce, nonce);
      workerPid = worker.pid;
      return {
        supervisorPid: identity.pid as number,
        workerPid: worker.pid as number,
        attemptId: connected.attemptId,
      };
    },
    async status(expectedCode: number) {
      const before = await readFile(this.statePath, "utf8");
      const timestamp = (await stat(this.statePath)).mtimeMs;
      const child = start(process.execPath, [
        cliFile,
        "status",
        "--repo",
        root,
        "--run",
        runId,
      ]);
      const result = await child.finish();
      assert.equal(child.outcome!.code, expectedCode, child.stderr);
      assert.equal(await readFile(this.statePath, "utf8"), before);
      assert.equal((await stat(this.statePath)).mtimeMs, timestamp);
      return result;
    },
    async starts() {
      return (await readFile(path.join(root, "starts.jsonl"), "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
    },
    async receipt() {
      return until("terminal receipt", () => optionalJson(this.receiptPath));
    },
    async killSupervisor() {
      const identity = await supervisor();
      assert.equal(identity?.pid, supervisorPid);
      assert.equal(identity?.token, request.token);
      assert.equal(identity?.requestDigest, request.requestDigest);
      process.kill(identity.pid, "SIGKILL");
      // A pipe probe during termination can receive a truncated response. Wait
      // for this verified process to exit rather than interpreting that race.
      await until(
        "killed supervisor exited",
        async () => !isAlive(identity.pid),
      );
    },
  };
}
