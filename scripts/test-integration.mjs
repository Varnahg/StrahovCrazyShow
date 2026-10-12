import { spawn } from "node:child_process";
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
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: "2568" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
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
  if (!ready) throw new Error("Isolated test server did not start:\n" + output);
  for (const script of subset
    ? subsets[subset]
    : [
        "scripts/integration-respawn.ts",
        "scripts/integration.ts",
        "scripts/integration-network.ts",
        "scripts/integration-input-backlog.ts",
      ]) {
    const test = spawn(process.execPath, ["--import", "tsx", script], {
      env: { ...process.env, STRAHOV_TEST_URL: endpoint },
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
}
