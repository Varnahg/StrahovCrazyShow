// Local process-lifecycle fixture only. It never calls GitHub, Linear or Codex.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run, resume } from "../../../scripts/autodev/engine.mjs";

const [repo, command, runId] = process.argv.slice(2);
const worker = fileURLToPath(new URL("./worker.mjs", import.meta.url));
const adapter = {
  async runStage(stage, ctx) {
    if (stage !== "implement") return;
    const result = await ctx.supervise({
      key: "gated-worker",
      command: process.execPath,
      args: [worker, repo],
      cwd: repo,
    });
    if (result.exitCode !== 0)
      throw new Error(`Fixture worker exited ${result.exitCode}`);
    return { worker: result };
  },
};

try {
  const result = await { run, resume }[command]({
    repo,
    runId,
    assignment: path.join(repo, "assignment.json"),
    adapter,
    onEvent: (event) => process.stderr.write(`${JSON.stringify(event)}\n`),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ error: { code: error.code, message: error.message } })}\n`,
  );
  process.exitCode = 1;
}
