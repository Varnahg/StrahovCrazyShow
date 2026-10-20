import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  atomicWriteJson,
  digest,
  object,
  problem,
  readJson,
} from "./store.mjs";

const supervisorFile = fileURLToPath(
  new URL("./supervisor.mjs", import.meta.url),
);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Both supported endpoints disappear with their owning process. Never unlink a
// pathname socket, steal a PID lock, or treat an elapsed lease as ownership.
export function ipcEndpoint(kind, identity) {
  const name = `strahov-autodev-${kind}-${digest(identity).slice(0, 40)}`;
  if (process.platform === "win32") return `\\\\.\\pipe\\${name}`;
  if (process.platform === "linux") return `\0${name}`;
  throw problem(
    "UNSUPPORTED_PLATFORM",
    "Autodev process ownership currently requires Windows named pipes or Linux abstract Unix sockets",
  );
}

export async function listenIpc(endpoint, respond) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(2_000, () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    let input = "";
    socket.on("data", (chunk) => {
      input += chunk;
      if (input.length > 8_192) return socket.destroy();
      if (!input.includes("\n")) return;
      try {
        const request = JSON.parse(input.slice(0, input.indexOf("\n")));
        const response = respond(request);
        socket.end(`${JSON.stringify(response)}\n`);
      } catch {
        socket.destroy();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(endpoint, () => {
      server.removeListener("error", reject);
      resolve();
    });
  }).catch((error) => {
    server.close();
    if (["EADDRINUSE", "EACCES"].includes(error.code))
      throw problem("BUSY", "Another process owns this autodev IPC endpoint");
    throw error;
  });
  return {
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

export function queryIpc(endpoint, request, timeoutMs = 1_000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(endpoint);
    let input = "";
    let settled = false;
    const finish = (error, response) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      error ? reject(error) : resolve(response);
    };
    socket.setEncoding("utf8");
    socket.setTimeout(timeoutMs, () =>
      finish(problem("IPC_TIMEOUT", "Process identity probe timed out")),
    );
    socket.on("error", (error) => finish(error));
    socket.on("connect", () => socket.write(`${JSON.stringify(request)}\n`));
    socket.on("data", (chunk) => {
      input += chunk;
      if (input.length > 8_192)
        return finish(problem("INVALID_IPC", "Oversized IPC response"));
      if (!input.includes("\n")) return;
      try {
        finish(null, JSON.parse(input.slice(0, input.indexOf("\n"))));
      } catch {
        finish(problem("INVALID_IPC", "Invalid IPC response"));
      }
    });
    socket.on("end", () => {
      if (!settled) finish(problem("INVALID_IPC", "Incomplete IPC response"));
    });
  });
}

export async function controllerIdentity(runDir) {
  try {
    const response = await queryIpc(ipcEndpoint("controller", runDir), {
      operation: "status",
    });
    if (
      !object(response) ||
      response.kind !== "controller" ||
      response.runDir !== runDir
    )
      throw problem("INVALID_IPC", "Controller identity mismatch");
    return response;
  } catch (error) {
    if (["ENOENT", "ECONNREFUSED"].includes(error.code)) return null;
    throw error;
  }
}

function commandDescription(value, name) {
  if (
    !object(value) ||
    typeof value.command !== "string" ||
    !value.command.trim() ||
    value.command.includes("\0") ||
    !Array.isArray(value.args) ||
    value.args.some((arg) => typeof arg !== "string" || arg.includes("\0")) ||
    typeof value.cwd !== "string" ||
    !path.isAbsolute(value.cwd)
  ) {
    throw problem(
      "INVALID_COMMAND",
      `${name} requires command, string args and absolute cwd; no shell is used`,
    );
  }
  return {
    command: value.command,
    args: value.args,
    cwd: path.resolve(value.cwd),
  };
}

function description(options) {
  if (
    typeof options.key !== "string" ||
    !options.key ||
    options.key.length > 200 ||
    /[\x00-\x1f]/.test(options.key)
  )
    throw problem(
      "INVALID_COMMAND",
      "A stable, nonempty attempt key is required",
    );
  const result = { key: options.key, ...commandDescription(options, "Worker") };
  if (options.heartbeat !== undefined) {
    const heartbeats = Array.isArray(options.heartbeat)
      ? options.heartbeat
      : [options.heartbeat];
    result.heartbeat = heartbeats.map((heartbeat) => {
      const intervalMs = heartbeat.intervalMs ?? 60_000;
      if (
        !Number.isSafeInteger(intervalMs) ||
        intervalMs < 25 ||
        intervalMs > 15 * 60_000
      )
        throw problem(
          "INVALID_COMMAND",
          "Heartbeat interval must be 25..900000 ms",
        );
      return { ...commandDescription(heartbeat, "Heartbeat"), intervalMs };
    });
  }
  return result;
}

export function validateReceipt(receipt, request) {
  if (
    !object(receipt) ||
    receipt.schemaVersion !== 1 ||
    receipt.attemptId !== request.attemptId ||
    receipt.requestDigest !== request.requestDigest ||
    !(receipt.exitCode === null || Number.isInteger(receipt.exitCode)) ||
    typeof receipt.finishedAt !== "string" ||
    receipt.stdoutPath !== request.stdoutPath ||
    receipt.stderrPath !== request.stderrPath
  ) {
    throw problem(
      "UNKNOWN_ATTEMPT",
      `Invalid receipt for ${request.key}; no worker will be started`,
    );
  }
  return receipt;
}

// Called only under the engine's singleton. The detached supervisor writes its
// own receipt, never state.json, so there remains exactly one checkpoint writer.
export async function supervise(ctx, options) {
  const safe = description(options);
  const requestDigest = digest(safe);
  const id = digest(`${ctx.runId}\0${options.key}`).slice(0, 24);
  const attemptDir = path.join(ctx.runDir, "attempts", id);
  const requestPath = path.join(attemptDir, "request.json");
  const receiptPath = path.join(attemptDir, "receipt.json");
  const previous = ctx.state.attempts[options.key];
  let request = await readJson(requestPath, { optional: true });
  if (request !== undefined && !object(request))
    throw problem(
      "UNKNOWN_ATTEMPT",
      `Invalid request for ${options.key}; preserved without spawning`,
    );
  if (
    (previous &&
      (previous.id !== id || previous.requestDigest !== requestDigest)) ||
    (request !== undefined &&
      (request.requestDigest !== requestDigest ||
        request.runId !== ctx.runId ||
        request.attemptId !== id))
  ) {
    throw problem(
      "ATTEMPT_CONFLICT",
      `Attempt key ${options.key} already belongs to another command`,
    );
  }
  if (previous && request === undefined)
    throw problem(
      "UNKNOWN_ATTEMPT",
      `Missing request for started attempt ${options.key}; refusing to respawn`,
    );
  if (!previous) {
    const receipt = await readJson(receiptPath, { optional: true });
    const started = await readJson(path.join(attemptDir, "started.json"), {
      optional: true,
    });
    if (receipt !== undefined || started !== undefined)
      throw problem(
        "UNKNOWN_ATTEMPT",
        `Attempt records exist without a dispatch checkpoint for ${options.key}; refusing to spawn`,
      );
  }
  if (request === undefined) {
    await mkdir(attemptDir, { recursive: true });
    request = {
      schemaVersion: 1,
      runId: ctx.runId,
      attemptId: id,
      requestDigest,
      token: randomUUID(),
      ...safe,
      stdoutPath: path.join(attemptDir, "stdout.log"),
      stderrPath: path.join(attemptDir, "stderr.log"),
    };
    await atomicWriteJson(requestPath, request);
  }
  const endpoint = ipcEndpoint("attempt", `${ctx.runDir}\0${id}`);
  let launched = false;
  if (!previous) {
    // Persist dispatch uncertainty before spawning. A crash in this narrow gap
    // may need operator diagnosis, but can never produce a duplicate worker.
    ctx.state.attempts[options.key] = {
      id,
      key: options.key,
      requestDigest,
      status: "started",
      startedAt: new Date().toISOString(),
    };
    await ctx.persist();
    await ctx.fault(`before-supervisor-spawn:${options.key}`);
    let child;
    try {
      child = spawn(process.execPath, [supervisorFile, requestPath], {
        cwd: options.cwd,
        detached: true,
        windowsHide: true,
        stdio: "ignore",
        env: { ...process.env, ...options.env },
      });
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      child.unref();
      launched = true;
    } catch (error) {
      // A spawn error proves this supervisor never existed. Preserve that
      // terminal failure as a receipt rather than automatically retrying it.
      await atomicWriteJson(receiptPath, {
        schemaVersion: 1,
        attemptId: id,
        requestDigest,
        exitCode: null,
        signal: null,
        error: `Supervisor spawn failed: ${error.code ?? "unknown"}`,
        stdoutPath: request.stdoutPath,
        stderrPath: request.stderrPath,
        finishedAt: new Date().toISOString(),
      });
    }
    if (launched)
      await ctx.emit({
        type: "supervisor-dispatched",
        key: options.key,
        attemptId: id,
        supervisorPid: child.pid,
      });
  }
  let connected = false;
  const startupDeadline = launched
    ? Date.now() + 15_000
    : Math.min(
        Date.now() + 15_000,
        Date.parse(ctx.state.attempts[options.key].startedAt) + 15_000,
      );
  for (;;) {
    const receipt = await readJson(receiptPath, { optional: true });
    if (receipt !== undefined) {
      const result = validateReceipt(receipt, request);
      if (ctx.state.attempts[options.key].status !== "complete") {
        Object.assign(ctx.state.attempts[options.key], {
          status: "complete",
          finishedAt: result.finishedAt,
          exitCode: result.exitCode,
        });
        await ctx.persist();
        await ctx.emit({
          type: "worker-finished",
          key: options.key,
          attemptId: id,
          exitCode: result.exitCode,
        });
      }
      return { ...result, attemptId: id };
    }
    try {
      const identity = await queryIpc(endpoint, {
        operation: "status",
        token: request.token,
      });
      if (
        identity?.attemptId !== id ||
        identity?.token !== request.token ||
        identity?.requestDigest !== requestDigest
      )
        throw problem(
          "UNKNOWN_ATTEMPT",
          `Supervisor identity mismatch for ${options.key}`,
        );
      if (!connected) {
        connected = true;
        await ctx.emit({
          type: "worker-connected",
          key: options.key,
          attemptId: id,
          supervisorPid: identity.pid,
        });
        await ctx.fault(`after-supervisor-start:${options.key}`);
      }
    } catch (error) {
      if (error.code === "UNKNOWN_ATTEMPT") throw error;
      if ((await readJson(receiptPath, { optional: true })) !== undefined)
        continue;
      if (connected || Date.now() >= startupDeadline) {
        throw problem(
          "UNKNOWN_ATTEMPT",
          `Attempt ${options.key} was dispatched but has neither a receipt nor a verified live supervisor (${error.code ?? "IPC failure"}); refusing to respawn`,
        );
      }
    }
    await pause(connected ? 250 : 100);
  }
}
