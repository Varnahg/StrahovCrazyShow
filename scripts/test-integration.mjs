import { spawn } from "node:child_process";
const endpoint = "http://127.0.0.1:2568";
const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: "2568" },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let output = "";
server.stdout.on("data", (chunk) => (output += chunk));
server.stderr.on("data", (chunk) => (output += chunk));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(endpoint + "/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!ready) throw new Error("Isolated test server did not start:\n" + output);
  const test = spawn(
    process.execPath,
    ["--import", "tsx", "scripts/integration.ts"],
    {
      env: { ...process.env, STRAHOV_TEST_URL: endpoint },
      stdio: "inherit",
      windowsHide: true,
    },
  );
  process.exitCode = await new Promise((resolve, reject) => {
    test.once("exit", (code) => resolve(code ?? 1));
    test.once("error", reject);
  });
} finally {
  server.kill();
}
