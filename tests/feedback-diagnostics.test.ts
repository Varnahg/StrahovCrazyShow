import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test, { type TestContext } from "node:test";
import {
  inspectFeedbackDelivery,
  runFeedbackDiagnostics,
} from "../server/feedback-diagnostics";

const configured = {
  LINEAR_API_KEY: "fake-only-secret",
  LINEAR_TEAM_ID: "team-private",
  LINEAR_PROJECT_ID: "project-private",
};
const id = (n: number) =>
  `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), "feedback-diagnostic-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.ok(basename(root).startsWith("feedback-diagnostic-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const queue = join(root, "queue");
  await mkdir(queue);
  return {
    root,
    queue,
    async delivery(n: number, value: unknown) {
      const directory = join(queue, id(n));
      await mkdir(directory);
      await writeFile(join(directory, "delivery.json"), JSON.stringify(value));
      return directory;
    },
  };
}

test("private queue inspection aggregates only safe delivery data and leaves all files untouched", async (t) => {
  const f = await fixture(t);
  const first = await f.delivery(1, {
    stage: "pending-config",
    error: "linear-not-configured",
    issueId: "private-issue",
  });
  await f.delivery(2, {
    stage: "blocked",
    error: "linear-auth",
    issueUrl: "https://private.invalid/issue",
  });
  await f.delivery(3, {
    stage: "delivered",
    assetUrl: "https://private.invalid/image",
  });
  await f.delivery(4, {
    stage: "verifying",
    error: "lin_api_accidental-secret",
  });
  await writeFile(
    join(first, "report.json"),
    "private-player-description-and-contact",
  );
  await writeFile(join(first, "image.bin"), "private-screenshot-bytes");
  await mkdir(join(f.queue, ".staging-preserve"));
  await writeFile(
    join(f.queue, ".staging-preserve", "delivery.json"),
    "incomplete staging",
  );
  const before = await readdir(f.queue);
  const result = await inspectFeedbackDelivery(f.queue, configured);
  assert.equal(result.readOnly, true);
  assert.equal(result.apiVerified, false);
  assert.equal(result.queue.reports, 4);
  assert.equal(result.queue.stages["pending-config"], 1);
  assert.equal(result.queue.stages.blocked, 1);
  assert.deepEqual(result.queue.errors, {
    "linear-not-configured": 1,
    "linear-auth": 1,
    none: 1,
    other: 1,
  });
  const output = JSON.stringify(result);
  for (const secret of [
    configured.LINEAR_API_KEY,
    "private-",
    "team-private",
    "project-private",
    "lin_api_",
    id(1),
  ])
    assert.ok(!output.includes(secret));
  assert.deepEqual(await readdir(f.queue), before);
  assert.equal(
    await readFile(join(first, "report.json"), "utf8"),
    "private-player-description-and-contact",
  );
  assert.equal(
    await readFile(join(first, "image.bin"), "utf8"),
    "private-screenshot-bytes",
  );
  assert.equal(
    await readFile(join(f.queue, ".staging-preserve", "delivery.json"), "utf8"),
    "incomplete staging",
  );
});

test("queue inspection does not follow report links and bounds malformed delivery records", async (t) => {
  const f = await fixture(t),
    outside = join(f.root, "outside");
  await mkdir(outside);
  await writeFile(
    join(outside, "delivery.json"),
    JSON.stringify({ stage: "delivered" }),
  );
  await symlink(
    outside,
    join(f.queue, id(1)),
    process.platform === "win32" ? "junction" : "dir",
  );
  const large = await f.delivery(2, { stage: "delivered" });
  await writeFile(join(large, "delivery.json"), "x".repeat(16385));
  await f.delivery(3, { stage: "private-secret-invalid-stage" });
  const result = await inspectFeedbackDelivery(f.queue, configured);
  assert.equal(result.queue.reports, 0);
  assert.equal(result.queue.ignoredLinks, 1);
  assert.equal(result.queue.invalidRecords, 2);
  assert.ok(!JSON.stringify(result).includes("private-secret"));
  assert.equal(
    await readFile(join(outside, "delivery.json"), "utf8"),
    JSON.stringify({ stage: "delivered" }),
  );
});

test("diagnostic CLI is read-only for absent folders, configuration problems and unsupported commands", async (t) => {
  const f = await fixture(t),
    absent = join(f.root, "absent");
  let output = "";
  assert.equal(
    await runFeedbackDiagnostics(
      ["--directory", absent],
      {},
      (text) => (output += text),
    ),
    1,
  );
  assert.equal(JSON.parse(output).queue.directory, "missing");
  await assert.rejects(access(absent));
  output = "";
  assert.equal(
    await runFeedbackDiagnostics(
      ["--requeue", "private-token"],
      {},
      (text) => (output += text),
    ),
    2,
  );
  assert.ok(!output.includes("private-token"));
  output = "";
  assert.equal(
    await runFeedbackDiagnostics(
      [],
      { ...configured, FEEDBACK_DIR: f.queue },
      (text) => (output += text),
    ),
    0,
  );
  assert.equal(JSON.parse(output).apiVerified, false);
});

test("the shipped server-side CLI exits without a game, network request or queue mutation", async (t) => {
  const f = await fixture(t);
  const result = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      "server/feedback-diagnostics.ts",
      "--directory",
      f.queue,
    ],
    {
      cwd: resolve(import.meta.dirname, ".."),
      windowsHide: true,
      timeout: 15000,
      env: {
        ...process.env,
        ...configured,
        LINEAR_ACCESS_TOKEN: "",
        LINEAR_STATUS_ID: "",
        FEEDBACK_ALLOWED_ORIGINS: "",
      },
    },
  );
  const status = JSON.parse(result.stdout);
  assert.equal(status.configuration.configured, true);
  assert.equal(status.queue.reports, 0);
  assert.equal(status.apiVerified, false);
  assert.ok(!result.stdout.includes(configured.LINEAR_API_KEY));
  assert.equal(result.stderr, "");
  assert.deepEqual(await readdir(f.queue), []);
});
