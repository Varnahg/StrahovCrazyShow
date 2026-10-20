import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

export function createIsolatedIntegrationEnvironment(environment, directory) {
  assert.ok(
    isAbsolute(directory),
    "Integration feedback directory must be absolute",
  );
  const isolated = Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) => !/^(?:LINEAR_|FEEDBACK_)/i.test(key),
    ),
  );
  return {
    ...isolated,
    HOST: "127.0.0.1",
    PORT: "2568",
    FEEDBACK_DIR: directory,
    STRAHOV_TEST_URL: "http://127.0.0.1:2568",
  };
}
export function assertOwnedFeedbackDirectory(directory) {
  const parent = resolve(tmpdir()),
    target = resolve(directory),
    inside = relative(parent, target);
  assert.ok(
    inside &&
      !inside.startsWith("..") &&
      !isAbsolute(inside) &&
      !inside.includes("/") &&
      !inside.includes("\\") &&
      inside.startsWith("strahov-integration-feedback-"),
    "Cleanup requires the exact owned temporary feedback directory",
  );
}

async function main() {
  const subsets = {
    "--respawn-only": ["scripts/integration-respawn.ts"],
    "--network-only": ["scripts/integration-network.ts"],
    "--input-backlog-only": ["scripts/integration-input-backlog.ts"],
  };
  const subset = process.argv[2];
  if (process.argv.length > 3 || (subset && !Object.hasOwn(subsets, subset)))
    throw new Error(
      "Usage: node scripts/test-integration.mjs [--respawn-only|--network-only|--input-backlog-only]",
    );
  const endpoint = "http://127.0.0.1:2568";
  const feedbackDirectory = await mkdtemp(
    join(tmpdir(), "strahov-integration-feedback-"),
  );
  const isolatedEnv = createIsolatedIntegrationEnvironment(
    process.env,
    feedbackDirectory,
  );
  const server = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      env: isolatedEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let output = "";
  let serverStopped = false;
  let serverFailure;
  const serverClosed = new Promise((resolve) => {
    server.once("exit", () => {
      serverStopped = true;
      resolve();
    });
    server.once("error", (error) => {
      serverFailure = error;
      serverStopped = true;
      resolve();
    });
  });
  server.stdout.on("data", (chunk) => (output += chunk));
  server.stderr.on("data", (chunk) => (output += chunk));
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (serverStopped)
        throw new Error(
          "Owned isolated server stopped before readiness: " +
            (serverFailure || output),
        );
      try {
        // Never run against another process that already owns port 2568.
        if (output.includes("Strahov multiplayer: " + endpoint)) {
          const r = await fetch(endpoint + "/api/health");
          if (!r.ok) throw new Error("Owned test server health failed");
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!ready)
      throw new Error("Isolated test server did not start:\n" + output);
    for (const script of subset
      ? subsets[subset]
      : [
          "scripts/integration-respawn.ts",
          "scripts/integration.ts",
          "scripts/integration-network.ts",
          "scripts/integration-input-backlog.ts",
          "scripts/integration-feedback.ts",
        ]) {
      const test = spawn(process.execPath, ["--import", "tsx", script], {
        env: isolatedEnv,
        stdio: "inherit",
        windowsHide: true,
      });
      process.exitCode = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => test.kill(), 90000);
        test.once("exit", (code) => {
          clearTimeout(timeout);
          resolve(code ?? 1);
        });
        test.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      if (process.exitCode !== 0) break;
    }
  } finally {
    if (!serverStopped) server.kill();
    await serverClosed;
    // The server owns open delivery writes until it has actually stopped.
    assertOwnedFeedbackDirectory(feedbackDirectory);
    await rm(feedbackDirectory, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
