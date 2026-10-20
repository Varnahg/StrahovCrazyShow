#!/usr/bin/env node
import { parseArgs } from "node:util";
import { run, resume, status } from "./autodev/engine.mjs";

const usage = [
  "node scripts/autodev.mjs run --assignment <path> [--repo <path>]",
  "node scripts/autodev.mjs status --run <id> [--repo <path>]",
  "node scripts/autodev.mjs resume --run <id> [--repo <path>]",
];

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      assignment: { type: "string" },
      repo: { type: "string" },
      run: { type: "string" },
      help: { type: "boolean" },
    },
    allowPositionals: true,
    strict: true,
  });
  if (values.help) {
    console.log(JSON.stringify({ usage }));
    return;
  }
  const [command] = positionals;
  if (
    positionals.length !== 1 ||
    !["run", "status", "resume"].includes(command) ||
    (command === "run"
      ? !values.assignment || values.run
      : !values.run || values.assignment)
  ) {
    throw Object.assign(
      new Error("Use run with --assignment, or status/resume with --run"),
      { code: "USAGE" },
    );
  }
  const options = {
    repo: values.repo,
    assignment: values.assignment,
    runId: values.run,
    onEvent: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  };
  const result = await { run, status, resume }[command](options);
  console.log(JSON.stringify(result));
  if (result.status === "stopped") process.exitCode = 1;
  if (result.status === "unknown") process.exitCode = 2;
}

main().catch((error) => {
  console.log(
    JSON.stringify({
      error: { code: error.code ?? "AUTODEV_FAILED", message: error.message },
      ...(error.code === "USAGE" ? { usage } : {}),
    }),
  );
  process.exitCode = error.code === "BUSY" ? 3 : 1;
});
