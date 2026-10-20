import { appendFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";

const root = process.argv[2];
const config = JSON.parse(
  await readFile(path.join(root, "fixture.json"), "utf8"),
);
const identity = { pid: process.pid, nonce: config.nonce };
await appendFile(
  path.join(root, "starts.jsonl"),
  `${JSON.stringify(identity)}\n`,
);
await writeFile(path.join(root, "worker-ready.json"), JSON.stringify(identity));
process.stdout.write(`started ${config.nonce}\n`);
// A bounded lifetime also protects against an abruptly killed test runner.
const deadline = Date.now() + 60_000;
for (;;) {
  try {
    await readFile(path.join(root, "release-worker"));
    break;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (Date.now() >= deadline) throw new Error("Fixture gate deadline expired");
  await setTimeout(25);
}
process.stdout.write(`finished ${config.nonce}\n`);
process.stderr.write(`exit ${config.exitCode}\n`);
await writeFile(
  path.join(root, "worker-finished.json"),
  JSON.stringify(identity),
);
process.exitCode = config.exitCode;
