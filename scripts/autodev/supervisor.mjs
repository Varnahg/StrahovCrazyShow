import { execFile, spawn } from "node:child_process";
import { open } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { atomicWriteJson, object, problem, readJson } from "./store.mjs";
import { ipcEndpoint, listenIpc, validateReceipt } from "./process.mjs";

const execFileAsync = promisify(execFile);

export async function superviseRequest(requestPath) {
  const request = await readJson(requestPath);
  if (!object(request))
    throw problem(
      "UNKNOWN_ATTEMPT",
      "Invalid request; no worker may be spawned",
    );
  const attemptDir = path.dirname(requestPath);
  const runDir = path.dirname(path.dirname(attemptDir));
  const receiptPath = path.join(attemptDir, "receipt.json");
  const startedPath = path.join(attemptDir, "started.json");
  const endpoint = ipcEndpoint("attempt", `${runDir}\0${request.attemptId}`);
  let phase = "starting";
  const listener = await listenIpc(endpoint, (query) => {
    if (query?.operation !== "status" || query.token !== request.token)
      return { error: "identity required" };
    return {
      attemptId: request.attemptId,
      requestDigest: request.requestDigest,
      token: request.token,
      pid: process.pid,
      phase,
    };
  });
  let stdout;
  let stderr;
  const timers = [];
  const inFlight = new Set();
  let heartbeatError = null;
  try {
    const receipt = await readJson(receiptPath, { optional: true });
    if (receipt !== undefined) {
      validateReceipt(receipt, request);
      return;
    }
    if ((await readJson(startedPath, { optional: true })) !== undefined)
      throw problem(
        "UNKNOWN_ATTEMPT",
        "This attempt already started; no second worker may be spawned",
      );
    stdout = await open(request.stdoutPath, "wx", 0o600);
    stderr = await open(request.stderrPath, "wx", 0o600);
    // This receipt boundary precedes the worker spawn, including all uncertain
    // spawn windows. Losing this supervisor requires diagnosis, never a retry.
    await atomicWriteJson(startedPath, {
      schemaVersion: 1,
      attemptId: request.attemptId,
      requestDigest: request.requestDigest,
      supervisorPid: process.pid,
      startedAt: new Date().toISOString(),
    });
    const heartbeats = request.heartbeat ?? [];
    const beats = [];
    for (const heartbeat of heartbeats) {
      let busy = false;
      const beat = () => {
        if (busy || phase === "finished") return Promise.resolve();
        busy = true;
        const pending = execFileAsync(heartbeat.command, heartbeat.args, {
          cwd: heartbeat.cwd,
          windowsHide: true,
          timeout: 30_000,
          maxBuffer: 64 * 1024,
        })
          .catch((error) => {
            heartbeatError ??= `Reservation heartbeat failed (${error.code ?? "unknown"})`;
          })
          .finally(() => {
            busy = false;
            inFlight.delete(pending);
          });
        inFlight.add(pending);
        return pending;
      };
      beats.push({ beat, intervalMs: heartbeat.intervalMs });
    }
    phase = "checking-reservations";
    await Promise.all(beats.map(({ beat }) => beat()));
    phase = "running";
    if (!heartbeatError)
      for (const { beat, intervalMs } of beats)
        timers.push(setInterval(beat, intervalMs));
    const result = heartbeatError
      ? {
          exitCode: 1,
          signal: null,
          error: "Initial reservation heartbeat failed; worker was not started",
        }
      : await new Promise((resolve) => {
          let spawnError;
          const worker = spawn(request.command, request.args, {
            cwd: request.cwd,
            windowsHide: true,
            shell: false,
            stdio: ["ignore", stdout.fd, stderr.fd],
          });
          worker.once("error", (error) => {
            spawnError = `Worker spawn failed (${error.code ?? "unknown"})`;
          });
          worker.once("close", (exitCode, signal) =>
            resolve({
              exitCode,
              signal,
              ...(spawnError ? { error: spawnError } : {}),
            }),
          );
        });
    phase = "finished";
    for (const timer of timers) clearInterval(timer);
    await Promise.all(inFlight);
    await stdout.sync();
    await stderr.sync();
    await stdout.close();
    stdout = undefined;
    await stderr.close();
    stderr = undefined;
    await atomicWriteJson(receiptPath, {
      schemaVersion: 1,
      attemptId: request.attemptId,
      requestDigest: request.requestDigest,
      ...result,
      workerExitCode: result.exitCode,
      exitCode: result.exitCode === 0 && heartbeatError ? 1 : result.exitCode,
      ...(heartbeatError ? { heartbeatError } : {}),
      stdoutPath: request.stdoutPath,
      stderrPath: request.stderrPath,
      finishedAt: new Date().toISOString(),
    });
  } finally {
    for (const timer of timers) clearInterval(timer);
    await Promise.all(inFlight);
    await stdout?.close();
    await stderr?.close();
    await listener.close();
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  superviseRequest(path.resolve(process.argv[2])).catch(() => {
    // No fabricated failure receipt: a supervisor failure may leave a child
    // alive. The engine will expose unknown and keep the original evidence.
    process.exitCode = 1;
  });
}
