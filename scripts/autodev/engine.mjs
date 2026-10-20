import { open } from "node:fs/promises";
import path from "node:path";
import {
  STAGES,
  atomicWriteJson,
  digest,
  loadAssignment,
  makeRunId,
  object,
  problem,
  readJson,
  repositoryContext,
  validateRunId,
  validateState,
} from "./store.mjs";
import {
  controllerIdentity,
  ipcEndpoint,
  listenIpc,
  supervise,
} from "./process.mjs";

async function fault(runDir, point) {
  if (process.env.AUTODEV_TEST_CRASH_AT !== point) return;
  const marker = path.join(runDir, `fault-${digest(point).slice(0, 24)}.json`);
  let handle;
  try {
    handle = await open(marker, "wx", 0o600);
  } catch (error) {
    if (error.code === "EEXIST") return;
    throw error;
  }
  try {
    await handle.writeFile(
      `${JSON.stringify({ point, pid: process.pid, at: new Date().toISOString() })}\n`,
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
  process.kill(process.pid, "SIGKILL");
  // SIGKILL is synchronous on supported systems; no stage may run past it.
  await new Promise(() => {});
}

function snapshot(state, runDir) {
  return { ...structuredClone(state), runDir };
}

async function drive(
  context,
  runId,
  assignmentInput,
  suppliedAdapter,
  onEvent,
) {
  validateRunId(runId);
  const runDir = path.join(context.runsDir, runId);
  const statePath = path.join(runDir, "state.json");
  const startedAt = new Date().toISOString();
  const lock = await listenIpc(ipcEndpoint("controller", runDir), (request) => {
    if (request?.operation !== "status")
      return { error: "read-only status only" };
    return { kind: "controller", runId, runDir, pid: process.pid, startedAt };
  });
  let adapter;
  let state;
  const supervisions = new Map();
  try {
    state = await readJson(statePath, { optional: true });
    if (state !== undefined) {
      validateState(state, context, runId);
      if (
        assignmentInput &&
        assignmentInput.assignmentDigest !== state.assignmentDigest
      )
        throw problem(
          "ASSIGNMENT_CHANGED",
          "This issue already has a run with a different assignment; refusing to replace it",
        );
      const current = await loadAssignment(state.assignmentPath, state.repo);
      if (current.assignmentDigest !== state.assignmentDigest)
        throw problem(
          "ASSIGNMENT_CHANGED",
          "The original assignment changed; restore or explicitly reconcile it before resuming",
        );
    } else {
      if (!assignmentInput)
        throw problem("RUN_NOT_FOUND", `No run checkpoint exists for ${runId}`);
      state = {
        schemaVersion: 1,
        runId,
        repositoryIdentity: context.identity,
        repo: context.repo,
        ...assignmentInput,
        status: "running",
        stage: STAGES[0],
        completedStages: [],
        data: {},
        attempts: {},
        lastError: null,
        createdAt: startedAt,
        updatedAt: startedAt,
      };
      await atomicWriteJson(statePath, state);
    }
    if (state.status === "complete") return snapshot(state, runDir);
    let checkpointQueue = Promise.resolve();
    const persist = () => {
      state.updatedAt = new Date().toISOString();
      const checkpoint = structuredClone(state);
      checkpointQueue = checkpointQueue.then(() =>
        atomicWriteJson(statePath, checkpoint),
      );
      return checkpointQueue;
    };
    const emit = async (event) => {
      if (onEvent)
        await onEvent({
          ...event,
          runId,
          stage: state.stage,
          at: new Date().toISOString(),
        });
    };
    const stop = async (cause) => {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      state.status = [
        "UNKNOWN_ATTEMPT",
        "UNKNOWN_EFFECT",
        "CORRUPT_STATE",
      ].includes(error.code)
        ? "unknown"
        : "stopped";
      state.lastError = {
        code: error.code ?? "STAGE_FAILED",
        message: error.message,
        stage: state.stage,
        at: new Date().toISOString(),
      };
      await persist();
      await emit({ type: "stage-stopped", error: state.lastError });
      return snapshot(state, runDir);
    };
    try {
      adapter =
        suppliedAdapter ??
        (await (await import("./adapters.mjs")).createAdapter());
      if (typeof adapter?.runStage !== "function")
        throw problem(
          "INVALID_ADAPTER",
          "Adapter must implement runStage(stage, ctx)",
        );
    } catch (error) {
      return await stop(error);
    }
    const ctx = {
      repo: state.repo,
      runId,
      runDir,
      assignment: state.assignment,
      state,
      get data() {
        return state.data;
      },
      save: async (patch) => {
        if (!object(patch))
          throw problem(
            "INVALID_PATCH",
            "Adapter checkpoint must be an object",
          );
        state.data = { ...state.data, ...patch };
        await persist();
      },
      emit,
      fault: (point) => fault(runDir, point),
      supervise: (options) => {
        const identity = digest({
          key: options.key,
          command: options.command,
          args: options.args,
          cwd: options.cwd,
          heartbeat: options.heartbeat ?? null,
        });
        const previous = supervisions.get(options.key);
        if (previous) {
          if (identity !== previous.identity)
            return Promise.reject(
              problem(
                "ATTEMPT_CONFLICT",
                `Concurrent attempt key ${options.key} has different commands`,
              ),
            );
          return previous.promise;
        }
        const promise = supervise(
          { runId, runDir, state, persist, emit, fault: ctx.fault },
          options,
        );
        // Attach a rejection handler immediately, including when an adapter
        // launches several supervised commands before awaiting all of them.
        promise.catch(() => {});
        supervisions.set(options.key, { identity, promise });
        return promise;
      },
    };
    for (
      let index = state.completedStages.length;
      index < STAGES.length;
      index++
    ) {
      state.stage = STAGES[index];
      state.status = "running";
      state.lastError = null;
      await persist();
      await emit({ type: "stage-started" });
      try {
        const patch = await adapter.runStage(state.stage, ctx);
        const workers = await Promise.allSettled(
          [...supervisions.values()].map(({ promise }) => promise),
        );
        const failed = workers.find((worker) => worker.status === "rejected");
        if (failed) throw failed.reason;
        if (patch !== undefined) {
          if (!object(patch))
            throw problem(
              "INVALID_PATCH",
              "Adapter stage result must be an object or undefined",
            );
          state.data = { ...state.data, ...patch };
        }
      } catch (error) {
        // Do not release the controller singleton while a sibling review is
        // still running and can write a checkpoint through this context.
        await Promise.allSettled(
          [...supervisions.values()].map(({ promise }) => promise),
        );
        return await stop(error);
      }
      state.completedStages.push(state.stage);
      const finishedStage = state.stage;
      state.stage = STAGES[index + 1] ?? state.stage;
      if (index === STAGES.length - 1) state.status = "complete";
      await persist();
      await emit({ type: "stage-finished", finishedStage });
      await fault(runDir, `after-stage:${finishedStage}`);
    }
    return snapshot(state, runDir);
  } finally {
    await Promise.allSettled(
      [...supervisions.values()].map(({ promise }) => promise),
    );
    try {
      await adapter?.close?.();
    } finally {
      await lock.close();
    }
  }
}

export async function run({
  repo = process.cwd(),
  assignment,
  adapter,
  onEvent,
} = {}) {
  if (typeof assignment !== "string" || !assignment)
    throw problem("INVALID_ASSIGNMENT", "run requires an assignment JSON path");
  const context = await repositoryContext(repo);
  const input = await loadAssignment(assignment, context.repo);
  return drive(
    context,
    makeRunId(context.identity, input.assignment.issue),
    input,
    adapter,
    onEvent,
  );
}

export async function resume({
  repo = process.cwd(),
  runId,
  adapter,
  onEvent,
} = {}) {
  validateRunId(runId);
  return drive(await repositoryContext(repo), runId, null, adapter, onEvent);
}

export async function status({ repo = process.cwd(), runId } = {}) {
  validateRunId(runId);
  const context = await repositoryContext(repo);
  const runDir = path.join(context.runsDir, runId);
  const state = await readJson(path.join(runDir, "state.json"), {
    optional: true,
  });
  if (state === undefined)
    throw problem("RUN_NOT_FOUND", `No run checkpoint exists for ${runId}`);
  validateState(state, context, runId);
  const controller = await controllerIdentity(runDir);
  return {
    ...snapshot(state, runDir),
    controller,
    controllerAlive: Boolean(controller),
    resumable: !controller && !["complete", "unknown"].includes(state.status),
  };
}
