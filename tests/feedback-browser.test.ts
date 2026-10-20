import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// GitHub's Ubuntu runner already includes Chrome. Keep this native DOM/storage
// regression in ordinary pnpm test/verify without downloading a browser or
// changing workflows. Local production/GPU acceptance is a separate check.
const enabled =
  (process.platform === "linux" && process.env.GITHUB_ACTIONS === "true") ||
  process.env.FEEDBACK_RUN_BROWSER_TEST === "1";

test(
  "real feedback form preserves native IndexedDB image bytes across offline/reload and shows matching receipt",
  {
    skip: enabled
      ? false
      : "Native browser regression runs in Linux CI; opt in with FEEDBACK_RUN_BROWSER_TEST=1 locally",
    timeout: 180_000,
  },
  async (t) => {
    const cwd = fileURLToPath(new URL("../", import.meta.url));
    const env = { ...process.env };
    for (const key of Object.keys(env))
      if (/^LINEAR_/i.test(key)) delete env[key];
    if (process.env.GITHUB_ACTIONS === "true")
      env.FEEDBACK_BROWSER_CHANNEL = "chrome";
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "scripts/feedback-browser.ts"],
      {
        cwd,
        env,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "",
      finished = false;
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-1_000_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    const stop = () => {
      if (finished || !child.pid) return;
      if (process.platform === "win32") child.kill();
      else {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
    };
    t.signal.addEventListener("abort", stop, { once: true });
    try {
      const code = await new Promise<number | null>((resolve, reject) => {
        child.once("error", reject);
        child.once("exit", resolve);
      });
      finished = true;
      assert.equal(code, 0, output);
      assert.match(output, /Feedback Chromium regression passed/);
      const result = JSON.parse(
        await readFile(
          new URL(
            "../.cache/player-feedback-validation/browser-fixture-evidence/result.json",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.equal(result.passed, true);
      assert.equal(result.received.length, 2);
      assert.ok(
        result.received.every(
          (entry: { imageBytes: number }) => entry.imageBytes > 0,
        ),
      );
    } finally {
      stop();
      t.signal.removeEventListener("abort", stop);
    }
  },
);
