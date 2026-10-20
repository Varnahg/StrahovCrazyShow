#!/usr/bin/env node
// Local fixture coverage. Real GitHub/Linear acceptance is a separate pilot.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tests = ["store", "engine", "adapters", "recovery"].map(
  (name) => `tests/autodev-${name}.test.ts`,
);
const child = spawn(
  process.execPath,
  ["--test", "--test-concurrency=1", ...tests],
  {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
  },
);
child.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once("close", (code) => {
  process.exitCode = code ?? 1;
});
