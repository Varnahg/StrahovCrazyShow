import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
  symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
const {
  auditScope,
  ignoredSnapshot,
  sourceIdentity,
  workingSnapshot,
  assertStageScope,
  safePath,
  parseDirty,
  createAdapter,
  writeSpecification,
} = await import(
  new URL("../scripts/autodev/adapters.mjs", import.meta.url).href
);
const { GitHubClient, checkoutEvidence, execute } = await import(
  new URL("../scripts/autodev/github.mjs", import.meta.url).href
);
const { LinearClient, decodeToolResult, normalizeIssue } = await import(
  new URL("../scripts/autodev/linear.mjs", import.meta.url).href
);
const {
  workerArguments,
  validateWorkerResult,
  loadBmadSnapshot,
  renderSpecification,
  specIdentity,
  buildWorkerPrompt,
  parseReviewResult,
  runWorker,
} = await import(new URL("../scripts/autodev/codex.mjs", import.meta.url).href);

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const git = async (root: string, ...args: string[]) =>
  (await execute("git", ["-C", root, ...args], { cwd: root })).stdout.trim();
function definition(
  id: string,
  writePaths: string[],
  resources: string[] = [],
) {
  return {
    schemaVersion: 1,
    id,
    title: id,
    status: "ready",
    dependsOn: [],
    writePaths,
    resources,
    acceptance: ["fixture"],
    verification: ["fixture"],
    notes: [],
  };
}
async function fixture(t: any) {
  const folder = await mkdtemp(path.join(tmpdir(), "autodev-adapters-")),
    root = path.join(folder, "repo");
  t.after(async () => {
    assert.ok(folder.startsWith(path.join(tmpdir(), "autodev-adapters-")));
    await rm(folder, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "src"), { recursive: true });
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "docs/agents/tasks"), { recursive: true });
  await copyFile(
    path.join(sourceRoot, "scripts/agent-tasks.mjs"),
    path.join(root, "scripts/agent-tasks.mjs"),
  );
  const controllerTask = definition("controller", ["artifacts/", "handoff.md"]),
    workerTask = definition("worker", ["src/a.txt", "src/new.txt"]),
    validationTask = definition("validation", [], ["heavy-validation"]);
  for (const task of [controllerTask, workerTask, validationTask])
    await writeFile(
      path.join(root, `docs/agents/tasks/${task.id}.json`),
      JSON.stringify(task),
    );
  await writeFile(path.join(root, "src/a.txt"), "before\n");
  await writeFile(path.join(root, ".gitignore"), "ignored/\n");
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await git(
    root,
    "add",
    "--",
    "src/a.txt",
    ".gitignore",
    "scripts/agent-tasks.mjs",
    "docs/agents/tasks/controller.json",
    "docs/agents/tasks/worker.json",
    "docs/agents/tasks/validation.json",
  );
  await git(root, "commit", "-m", "base");
  const baseSha = await git(root, "rev-parse", "HEAD");
  const claim = (task: string, owner: string) =>
    execute(
      process.execPath,
      ["scripts/agent-tasks.mjs", "claim", "--task", task, "--owner", owner],
      { cwd: root },
    );
  await claim("controller", "autodev:test");
  await claim("worker", "autodev:test:worker");
  const runDir = path.join(root, ".git/autodev/test");
  await mkdir(runDir, { recursive: true });
  const data: any = {
    worktree: root,
    baseSha,
    controllerTask,
    workerTask,
    owner: "autodev:test",
    workerOwner: "autodev:test:worker",
    ignoredBaseline: {},
    branch: "main",
    checks: [{ id: "test", command: "node", args: [], exitCode: 0 }],
    implementation: { result: { summary: "fixture" } },
    reviews: ["blind", "edge", "verification"].map((lens) => ({
      lens,
      attemptId: lens,
      result: { findings: [] },
    })),
  };
  const state: any = {
    attempts: {},
    data,
    createdAt: "2026-10-20T01:00:00.000Z",
  };
  const ctx: any = {
    repo: root,
    runId: "test",
    runDir,
    state,
    assignment: {
      repository: "unit/repo",
      issue: "KEY-1",
      task: "controller",
      workerTask: "worker",
      baseBranch: "main",
      handoffFile: "handoff.md",
      artifactDir: "artifacts",
      prTitle: "fixture change",
      checks: [{ id: "test", command: "node", args: [] }],
      acceptance: { kind: "cli", description: "fixture CLI" },
      linearStates: { active: "Active", done: "Done" },
      merge: false,
    },
    get data() {
      return state.data;
    },
    async save(patch: any) {
      state.data = { ...state.data, ...patch };
    },
    async fault() {},
    async emit() {},
    async supervise() {
      return { exitCode: 0, attemptId: "fixture" };
    },
  };
  return {
    root,
    folder,
    ctx,
    validationTask,
    registry: async () =>
      JSON.parse(
        await readFile(
          path.join(root, ".git/agent-coordination/claims.json"),
          "utf8",
        ),
      ),
  };
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const validPlan = () => ({
  research: "Read the CLI and its callers; preserve existing behavior.",
  alternatives: ["early help", "shared parser"],
  decision: "Early help matches the assignment.",
  steps: ["`src/new.txt` — implement and verify the assigned change"],
  sources: ["src/a.txt:1"],
  risks: [],
  intentGaps: [],
  codeMap: [
    {
      path: "src/a.txt",
      role: "Existing entry point; preserve current caller behavior",
    },
  ],
});
async function bmadFixture(f: any, createSpec = true) {
  const root = path.join(f.root, "artifacts/render");
  await mkdir(path.join(root, "review-prompts"), { recursive: true });
  await mkdir(path.join(root, "references"));
  const files: Record<string, string> = {
    "workflow.md": "# BMAD fixture workflow\n",
    "step-02-plan.md":
      "# Step 2: Plan\nInvestigate code, compare options, identify intent gaps and code map.\n",
    "spec-template.md": await readFile(
      path.join(sourceRoot, ".agents/skills/bmad-build/spec-template.md"),
      "utf8",
    ),
    "step-03-implement.md":
      "# Step 3\nExecute the implementation handoff below: apply runtime paths.\n\nRead {spec_file}. Implement only the assigned task and return evidence.\n\nDo not add goal restatements\n",
    "step-04-review.md": `# Step 4\n#### Blind Hunter (\`blind-hunter\`)\nRead {diff_file}; report evidenced findings, clean [].\n#### Edge Case Hunter (\`edge-case-hunter\`)\nLaunch a context-free subagent with this prompt:\n\nRead \`${path.join(root, "review-prompts/edge-case-hunter.md")}\` completely.\nclaims_file (leave unread until your instructions call for it): {claims_file}\nReview content: {diff_file}\n#### Verification Gap Reviewer (\`verification-gap\`)\nLaunch a context-free subagent with this prompt:\n\nRead \`${path.join(root, "review-prompts/verification-gap.md")}\` completely.\nReview content: {diff_file}\nIf a layer's instruction requires subagents and none are available, stop.\n### Classify\n`,
    "review-prompts/edge-case-hunter.md":
      "# Edge Case Hunter\nTrace first, claims last. Return native JSON array without severity.\n",
    "review-prompts/verification-gap.md":
      "# Verification Gap\nRead tests and callers. Return native Markdown evidence or No verification gaps found.\n",
    "references/claims-check.md":
      "# Claims Check\nRead claims only after tracing.\n",
    "references/deletion-check.md":
      "# Deletion Check\nTrace removed behavior.\n",
  };
  for (const [name, text] of Object.entries(files))
    await writeFile(path.join(root, name), text);
  await writeFile(
    path.join(root, "manifest.json"),
    JSON.stringify({
      generation_hash: "fixture",
      outputs: Object.fromEntries(
        Object.entries(files).map(([name, text]) => [name, sha(text)]),
      ),
    }),
  );
  f.ctx.data.renderedWorkflow = path.join(root, "workflow.md");
  const snapshot = await loadBmadSnapshot(f.ctx.data.renderedWorkflow);
  f.ctx.data.bmadSnapshot = snapshot.identity;
  f.ctx.data.plan = { result: validPlan() };
  f.ctx.data.intent =
    "Preserve this exact user-owned requirement, including punctuation!";
  f.ctx.assignment.intentFile = "intent.md";
  if (createSpec) await writeSpecification(f.ctx, snapshot, "ready-for-dev");
  return snapshot;
}

test("source identity is invariant across add/commit, covers new tests and deletions", async (t) => {
  const { root, ctx } = await fixture(t);
  await writeFile(path.join(root, "src/a.txt"), "after\n");
  await writeFile(path.join(root, "src/new.txt"), "new test\n");
  const before = await sourceIdentity(
    root,
    ctx.data.baseSha,
    ctx.data.workerTask.writePaths,
  );
  assert.match(before.diff, /diff --git a\/src\/new.txt b\/src\/new.txt/);
  assert.match(before.diff, /@@ -0,0 \+1 @@/);
  await git(root, "add", "--", "src/a.txt", "src/new.txt");
  assert.equal(
    (
      await sourceIdentity(
        root,
        ctx.data.baseSha,
        ctx.data.workerTask.writePaths,
      )
    ).digest,
    before.digest,
  );
  await git(root, "commit", "-m", "fixture source");
  assert.equal(
    (
      await sourceIdentity(
        root,
        ctx.data.baseSha,
        ctx.data.workerTask.writePaths,
      )
    ).digest,
    before.digest,
  );
  await git(root, "update-index", "--chmod=+x", "src/new.txt");
  assert.notEqual(
    (
      await sourceIdentity(
        root,
        ctx.data.baseSha,
        ctx.data.workerTask.writePaths,
      )
    ).digest,
    before.digest,
  );
  await rm(path.join(root, "src/new.txt"));
  assert.notEqual(
    (
      await sourceIdentity(
        root,
        ctx.data.baseSha,
        ctx.data.workerTask.writePaths,
      )
    ).digest,
    before.digest,
  );
});

test("ignored audit detects edits at an existing ignored path and additions outside scope", async (t) => {
  const { root } = await fixture(t);
  await mkdir(path.join(root, "ignored"));
  await writeFile(path.join(root, "ignored/cache"), "old");
  const baseline = await ignoredSnapshot(root);
  await writeFile(path.join(root, "ignored/cache"), "new");
  await assert.rejects(auditScope(root, ["src/"], baseline), {
    code: "SCOPE_VIOLATION",
  });
  assert.deepEqual(
    (await auditScope(root, ["ignored/"], baseline)).ignoredChanges,
    ["ignored/cache"],
  );
});

test("stage audit rejects changes to controller evidence by a source worker", async (t) => {
  const { root } = await fixture(t);
  await mkdir(path.join(root, "artifacts"));
  await writeFile(path.join(root, "artifacts/plan.json"), "before");
  const before = await workingSnapshot(root);
  await writeFile(path.join(root, "artifacts/plan.json"), "after");
  assert.throws(
    () =>
      assertStageScope(
        before,
        { ...before, "artifacts/plan.json": { sha256: "different", mode: 0 } },
        ["src/"],
      ),
    { code: "STAGE_SCOPE" },
  );
  assert.throws(() => assertStageScope({}, { "src/a": null }, []), {
    code: "STAGE_SCOPE",
  });
});

test("scope guards reject junction escape and preserve both renamed paths", async (t) => {
  const { root, folder } = await fixture(t);
  const outside = path.join(folder, "outside");
  await mkdir(outside);
  await symlink(
    outside,
    path.join(root, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(safePath(root, "escape/new"), { code: "UNSAFE_PATH" });
  assert.deepEqual(parseDirty("R  src/new.txt\0foreign/old.txt\0"), [
    "foreign/old.txt",
    "src/new.txt",
  ]);
});

test("Codex worker disables apps, MCP, agents and shell network without overriding model", () => {
  const args = workerArguments({
    kind: "implement",
    schema: "schema",
    output: "result",
    prompt: "task",
  });
  assert.ok(args.includes("workspace-write"));
  assert.ok(args.includes("sandbox_workspace_write.network_access=false"));
  assert.ok(args.includes("mcp_servers={}"));
  assert.ok(!args.includes("--model"));
  assert.ok(args.includes('web_search="disabled"'));
  assert.throws(
    () =>
      validateWorkerResult("review", {
        summary: "bad",
        findings: [{ file: "x" }],
      }),
    { code: "WORKER_OUTPUT" },
  );
});

test("Linear decodes both observed issue identities and rejects tool errors", () => {
  assert.equal(
    normalizeIssue({ id: "KEY-46", uuid: "uuid", teamId: "team" }).identifier,
    "KEY-46",
  );
  assert.equal(normalizeIssue({ id: "uuid", identifier: "KEY-46" }).id, "uuid");
  assert.deepEqual(
    decodeToolResult({ content: [{ type: "text", text: '{"ok":true}' }] }),
    { ok: true },
  );
  assert.throws(() => decodeToolResult({ isError: true, content: [] }), {
    code: "LINEAR_TOOL_FAILED",
  });
});

test(
  "missing Codex executable rejects startup and bounded close does not hang",
  { timeout: 5000 },
  async () => {
    const client = new LinearClient({
      cwd: process.cwd(),
      spawnProcess: (_command: any, args: any, options: any) =>
        spawn("autodev-executable-does-not-exist-6e3d", args, options),
      timeoutMs: 1000,
    });
    await assert.rejects(client.start());
    await client.close();
  },
);

test("Linear lost create response reconciles the original comment without duplicate creation", async () => {
  const client = new LinearClient();
  const saved: any[] = [];
  let created: any;
  const ctx: any = {
    runId: "fixture",
    assignment: { issue: "KEY-1" },
    data: {},
    async save(patch: any) {
      Object.assign(this.data, patch);
    },
  };
  client.call = async (name: any, args: any) => {
    if (name === "linear.list_comments")
      return { comments: created ? [created] : [], hasNextPage: false };
    saved.push(args);
    created = { id: "comment", body: args.body };
    throw Object.assign(new Error("lost response"), { code: "UNKNOWN_EFFECT" });
  };
  await assert.rejects(client.comment(ctx, "progress"), {
    code: "UNKNOWN_EFFECT",
  });
  assert.equal(await client.comment(ctx, "progress"), "comment");
  assert.equal(saved.length, 1);
  client.call = async () => ({ comments: [], hasNextPage: true });
  await assert.rejects(client.comments("KEY-1"), { code: "LINEAR_PROTOCOL" });
});

const head = "1".repeat(40),
  base = "2".repeat(40),
  merge = "3".repeat(40);
function log(name: string, checkout = merge, declaredBase = base) {
  const step =
    name === "verify"
      ? "Checkout source and LFS assets"
      : "Run actions/checkout@abc";
  return `${name}\t${step}\t2026-01-01T00:00:00Z [command]git fetch origin +${checkout}:refs/remotes/pull/9/merge\n${name}\t${step}\t2026-01-01T00:00:01Z ${checkout}\n${name}\tRecord verification identity\t2026-01-01T00:00:02Z PR head: ${head}\n${name}\tRecord verification identity\t2026-01-01T00:00:03Z PR base: ${declaredBase}\n`;
}
test("CI checkout evidence binds test merge SHA and explicit base from the correct step", () => {
  assert.deepEqual(checkoutEvidence(log("verify"), 9), {
    testMergeSha: merge,
    headSha: head,
    baseSha: base,
  });
  assert.throws(() => checkoutEvidence(log("verify"), 10), {
    code: "CI_IDENTITY",
  });
});

test("GitHub checks accept observed empty PR arrays only with exact run and checkout evidence", async () => {
  const client = new GitHubClient({
    repository: "unit/repo",
    exec: async () => ({ stdout: log("verify"), stderr: "", exitCode: 0 }),
  });
  client.pages = async () =>
    ["verify", "source-secret-hygiene"].map((name, index) => ({
      id: index + 1,
      name,
      app: { id: 15368 },
      head_sha: head,
      status: "completed",
      conclusion: "success",
      details_url: `https://github.com/unit/repo/actions/runs/${index + 1}/job/1`,
    }));
  client.api = async (_method: any, endpoint: any) => ({
    id: endpoint.endsWith("/1") ? 1 : 2,
    event: "pull_request",
    head_sha: head,
    head_branch: "branch",
    repository: { full_name: "unit/repo" },
    path: endpoint.endsWith("/1")
      ? ".github/workflows/ci.yml"
      : ".github/workflows/source-secrets.yml",
    pull_requests: [],
    run_attempt: 1,
    html_url: "https://github.com/unit/repo/actions/runs/1",
  });
  assert.equal(
    (
      await client.checks(head, {
        event: "pull_request",
        prNumber: 9,
        baseSha: base,
        branch: "branch",
      })
    )?.length,
    2,
  );
  client.exec = async () => ({
    stdout: log("verify", merge, "4".repeat(40)),
    stderr: "",
    exitCode: 0,
  });
  await assert.rejects(
    client.checks(head, {
      event: "pull_request",
      prNumber: 9,
      baseSha: base,
      branch: "branch",
    }),
    { code: "CI_IDENTITY" },
  );
});

test("PR crash after remote create recovers the single PR and merged replay does not remerge", async () => {
  const client = new GitHubClient({ repository: "unit/repo" });
  let pr: any = null,
    creates = 0;
  const ctx: any = {
    runId: "fixture",
    assignment: { baseBranch: "main", prTitle: "title" },
    data: { branch: "branch", commitSha: head, baseSha: base },
    async save(patch: any) {
      Object.assign(this.data, patch);
    },
    async emit() {},
    async fault() {
      throw new Error("crash");
    },
  };
  client.findPr = async () => pr;
  client.pr = async () => pr;
  client.api = async () => {
    creates++;
    pr = {
      number: 9,
      html_url: "url",
      state: "open",
      head: { sha: head, ref: "branch", repo: { full_name: "unit/repo" } },
      base: { sha: base, ref: "main", repo: { full_name: "unit/repo" } },
    };
    return pr;
  };
  await assert.rejects(client.publish(ctx, "body"), /crash/);
  ctx.fault = async () => {};
  await client.publish(ctx, "body");
  assert.equal(creates, 1);
  assert.equal(ctx.data.prNumber, 9);
  pr.merged = true;
  pr.merge_commit_sha = merge;
  assert.equal(await client.merge(ctx), merge);
  assert.equal(creates, 1);
});

test("commit resumes after crash by exact parent/tree/marker without a second commit", async (t) => {
  const { root, ctx } = await fixture(t);
  await writeFile(path.join(root, "src/new.txt"), "new test\n");
  ctx.data.sourceDigest = (
    await sourceIdentity(root, ctx.data.baseSha, ctx.data.workerTask.writePaths)
  ).digest;
  const adapter = createAdapter();
  ctx.fault = async (point: string) => {
    if (point === "after-commit") throw new Error("crash");
  };
  await assert.rejects(adapter.runStage("commit", ctx), /crash/);
  const committed = await git(root, "rev-parse", "HEAD");
  ctx.fault = async () => {};
  await adapter.runStage("commit", ctx);
  assert.equal(ctx.data.commitSha, committed);
  assert.equal(await git(root, "rev-list", "--count", "HEAD"), "2");
});

test("commit refuses pre-existing staged contents", async (t) => {
  const { root, ctx } = await fixture(t);
  await writeFile(path.join(root, "src/new.txt"), "new\n");
  await git(root, "add", "--", "src/new.txt");
  ctx.data.sourceDigest = (
    await sourceIdentity(root, ctx.data.baseSha, ctx.data.workerTask.writePaths)
  ).digest;
  await assert.rejects(createAdapter().runStage("commit", ctx), {
    code: "FOREIGN_INDEX",
  });
});

test("verification detects a check that changes reviewed source", async (t) => {
  const { root, ctx } = await fixture(t);
  await writeFile(path.join(root, "src/a.txt"), "candidate\n");
  ctx.data.sourceDigest = (
    await sourceIdentity(root, ctx.data.baseSha, ctx.data.workerTask.writePaths)
  ).digest;
  ctx.supervise = async () => {
    await writeFile(path.join(root, "src/a.txt"), "mutated by test\n");
    return { exitCode: 0 };
  };
  await assert.rejects(createAdapter().runStage("verify", ctx), {
    code: "SOURCE_CHANGED",
  });
});

test("unknown supervised verification retains the validation resource claim", async (t) => {
  const { root, ctx, validationTask, registry } = await fixture(t);
  await writeFile(path.join(root, "src/a.txt"), "candidate\n");
  ctx.data.sourceDigest = (
    await sourceIdentity(root, ctx.data.baseSha, ctx.data.workerTask.writePaths)
  ).digest;
  ctx.data.validationTask = validationTask;
  ctx.supervise = async () => {
    throw Object.assign(new Error("worker may be alive"), {
      code: "UNKNOWN_ATTEMPT",
    });
  };
  await assert.rejects(createAdapter().runStage("verify", ctx), {
    code: "UNKNOWN_ATTEMPT",
  });
  assert.equal(
    (await registry()).claims.find((entry: any) => entry.task === "validation")
      .owner,
    "autodev:test:validation",
  );
});

test("finalize replays remaining release after crash without repeating external progress", async (t) => {
  const { ctx, registry } = await fixture(t);
  let updates = 0;
  const adapter = createAdapter({
    linear: {
      async comment() {
        updates++;
      },
      async close() {},
    } as any,
  });
  ctx.fault = async () => {
    throw new Error("release crash");
  };
  await assert.rejects(adapter.runStage("finalize", ctx), /release crash/);
  assert.ok(ctx.data.finalizationReady);
  assert.equal((await registry()).claims.length, 1);
  ctx.fault = async () => {};
  await adapter.runStage("finalize", ctx);
  assert.equal((await registry()).claims.length, 0);
  assert.equal(updates, 1);
});

test("implementation and review replay after progress failure preserve their own evidence without another worker", async (t) => {
  const f = await fixture(t);
  const { root, ctx } = f;
  await bmadFixture(f);
  delete ctx.data.implementation;
  delete ctx.data.reviews;
  let failProgress = true;
  const calls: string[] = [];
  const adapter = createAdapter({
    linear: {
      async comment() {
        if (failProgress) {
          failProgress = false;
          throw new Error("progress unavailable");
        }
      },
      async close() {},
    } as any,
    worker: async (_ctx: any, options: any) => {
      calls.push(options.kind);
      if (options.kind === "implement") {
        await writeFile(path.join(root, "src/new.txt"), "reviewed change\n");
        return {
          result: {
            summary: "done",
            changedFiles: ["src/new.txt"],
            checks: [],
            risks: [],
          },
          attemptId: "implement",
        };
      }
      return {
        result: { summary: "clean", findings: [] },
        attemptId: options.lens,
      };
    },
  });
  await assert.rejects(
    adapter.runStage("implement", ctx),
    /progress unavailable/,
  );
  await adapter.runStage("implement", ctx);
  assert.equal(calls.filter((kind) => kind === "implement").length, 1);
  failProgress = true;
  await assert.rejects(adapter.runStage("review", ctx), /progress unavailable/);
  await adapter.runStage("review", ctx);
  assert.equal(calls.filter((kind) => kind === "review").length, 3);
});

test("BMAD snapshot validates every used instruction and rejects missing or altered snapshots", async (t) => {
  const f = await fixture(t);
  const snapshot = await bmadFixture(f);
  assert.equal(Object.keys(snapshot.files).length, 9);
  await rm(snapshot.files["review-prompts/edge-case-hunter.md"].path);
  await assert.rejects(
    loadBmadSnapshot(f.ctx.data.renderedWorkflow, f.ctx.data.bmadSnapshot),
    { code: "BMAD_SNAPSHOT" },
  );
  await writeFile(
    snapshot.files["review-prompts/edge-case-hunter.md"].path,
    "replacement instructions",
  );
  await assert.rejects(
    loadBmadSnapshot(f.ctx.data.renderedWorkflow, f.ctx.data.bmadSnapshot),
    { code: "BMAD_SNAPSHOT" },
  );
});

test("specification uses the snapshot template and preserves frozen/body identity through all statuses and replay", async (t) => {
  const f = await fixture(t);
  const snapshot = await bmadFixture(f);
  const { ctx } = f;
  const first = await readFile(ctx.data.specFile, "utf8"),
    identity = specIdentity(first);
  assert.equal(first, renderSpecification(ctx, snapshot, ctx.data.plan.result));
  assert.match(first, /baseline_commit:/);
  assert.match(first, /## Code Map/);
  assert.match(first, /## Tasks & Acceptance/);
  assert.ok(first.includes(ctx.data.intent));
  assert.ok(first.includes(ctx.assignment.acceptance.description));
  await assert.rejects(writeSpecification(ctx, snapshot, "done"), {
    code: "BMAD_SPEC",
  });
  await writeFile(
    ctx.data.specFile,
    first.replace("status: 'ready-for-dev'", "status: 'in-progress'"),
  );
  await assert.rejects(writeSpecification(ctx, snapshot, "in-progress"), {
    code: "BMAD_SPEC",
  });
  await writeFile(ctx.data.specFile, first);
  ctx.data.sourceDigest = "a".repeat(64);
  ctx.data.verifiedSourceDigest = ctx.data.sourceDigest;
  for (const status of ["in-progress", "in-review", "done", "ready-for-dev"]) {
    await writeSpecification(ctx, snapshot, status);
    const current = specIdentity(await readFile(ctx.data.specFile, "utf8"));
    assert.equal(current.frozenSha256, identity.frozenSha256);
    assert.equal(current.bodySha256, identity.bodySha256);
  }
  const done = await readFile(ctx.data.specFile, "utf8");
  assert.match(done, /status: 'done'/);
  await writeFile(
    ctx.data.specFile,
    done.replace(ctx.data.intent, "Changed user requirement"),
  );
  await assert.rejects(writeSpecification(ctx, snapshot, "done"), {
    code: "BMAD_SPEC",
  });
  await rm(ctx.data.specFile);
  await assert.rejects(writeSpecification(ctx, snapshot, "done"), {
    code: "BMAD_SPEC",
  });
});

test("intent gaps persist as a draft and block implementation without another model attempt", async (t) => {
  const f = await fixture(t);
  await bmadFixture(f, false);
  delete f.ctx.data.plan;
  const stdoutPath = path.join(f.ctx.runDir, "renderer.log");
  await writeFile(
    stdoutPath,
    `read and follow ${f.ctx.data.renderedWorkflow}\n`,
  );
  f.ctx.supervise = async () => ({ exitCode: 0, stdoutPath });
  let calls = 0;
  const adapter = createAdapter({
    worker: async () => {
      calls++;
      return {
        result: {
          ...validPlan(),
          intentGaps: ["Which user-visible output is required?"],
        },
      };
    },
  });
  await assert.rejects(adapter.runStage("plan", f.ctx), {
    code: "INTENT_GAPS",
  });
  assert.match(await readFile(f.ctx.data.specFile, "utf8"), /status: 'draft'/);
  await assert.rejects(adapter.runStage("plan", f.ctx), {
    code: "INTENT_GAPS",
  });
  await assert.rejects(adapter.runStage("implement", f.ctx), {
    code: "INTENT_GAPS",
  });
  assert.equal(calls, 1);
  assert.throws(
    () =>
      validateWorkerResult("plan", { ...validPlan(), intentGaps: undefined }),
    { code: "WORKER_OUTPUT" },
  );
});

test("plan spec replay after progress failure preserves exact bytes and original planner result", async (t) => {
  const f = await fixture(t);
  await bmadFixture(f, false);
  delete f.ctx.data.plan;
  const stdoutPath = path.join(f.ctx.runDir, "renderer.log");
  await writeFile(
    stdoutPath,
    `read and follow ${f.ctx.data.renderedWorkflow}\n`,
  );
  f.ctx.supervise = async () => ({ exitCode: 0, stdoutPath });
  let calls = 0,
    fail = true;
  const adapter = createAdapter({
    worker: async () => {
      calls++;
      return { result: validPlan() };
    },
    linear: {
      async comment() {
        if (fail) {
          fail = false;
          throw new Error("progress failed");
        }
      },
      async close() {},
    } as any,
  });
  await assert.rejects(adapter.runStage("plan", f.ctx), /progress failed/);
  const before = await readFile(f.ctx.data.specFile, "utf8");
  await adapter.runStage("plan", f.ctx);
  assert.equal(await readFile(f.ctx.data.specFile, "utf8"), before);
  assert.equal(calls, 1);
});

test("snapshot prompts preserve blind/verification separation and delay edge claims", async (t) => {
  const f = await fixture(t);
  const snapshot = await bmadFixture(f);
  const diff =
    "diff --git a/src/a.txt b/src/a.txt\n--- a/src/a.txt\n+++ b/src/a.txt\n@@ -1 +1 @@\n-before\n+after\n";
  await writeFile(path.join(f.ctx.runDir, "source-diff.txt"), diff);
  f.ctx.data.sourceDiffSha256 = sha(diff);
  const plan = await buildWorkerPrompt(f.ctx, { kind: "plan" });
  assert.ok(plan.prompt.includes(snapshot.files["step-02-plan.md"].path));
  assert.ok(plan.prompt.includes(snapshot.files["spec-template.md"].path));
  const implement = await buildWorkerPrompt(f.ctx, { kind: "implement" });
  assert.ok(
    implement.prompt.includes(
      `Read ${f.ctx.data.specFile}. Implement only the assigned task`,
    ),
  );
  for (const lens of ["blind", "edge", "verification"]) {
    const result = await buildWorkerPrompt(f.ctx, {
      kind: "review",
      lens,
      identity: "sourcehash",
    });
    assert.equal(result.provenance.diffSha256, sha(diff));
    assert.equal(result.provenance.promptSha256, sha(result.prompt));
    assert.ok(!result.prompt.includes(f.ctx.assignment.intentFile));
    assert.ok(!result.prompt.includes("plan.json"));
    assert.ok(!result.prompt.includes("workflow.md"));
    if (lens === "edge") {
      assert.ok(
        result.prompt.includes(
          `claims_file (leave unread until your instructions call for it): ${f.ctx.data.specFile}`,
        ),
      );
    } else {
      assert.ok(!result.prompt.includes(f.ctx.data.specFile));
      assert.ok(!result.prompt.includes("claims_file"));
      assert.equal(result.provenance.specSha256, null);
    }
  }
  assert.ok(
    !workerArguments({
      kind: "review",
      output: "out",
      prompt: "review",
    }).includes("--output-schema"),
  );
  f.ctx.supervise = async () => ({ exitCode: 0 });
  await assert.rejects(
    runWorker(f.ctx, { kind: "review", lens: "blind", identity: "sourcehash" }),
    { code: "REVIEW_OUTPUT" },
  );
  await writeFile(path.join(f.ctx.runDir, "source-diff.txt"), "");
  await assert.rejects(
    buildWorkerPrompt(f.ctx, {
      kind: "review",
      lens: "blind",
      identity: "sourcehash",
    }),
    { code: "REVIEW_INPUT" },
  );
});

test("review parsers retain native lens outputs and never treat invalid/incomplete results as clean", () => {
  for (const lens of ["blind", "edge"])
    assert.equal(parseReviewResult(lens, "[]").findings.length, 0);
  assert.equal(
    parseReviewResult("verification", "No verification gaps found.").findings
      .length,
    0,
  );
  const edge = {
    location: "src/a.ts:3",
    trigger_condition: "Failure between steps",
    guard_snippet: "reconcile();",
    potential_consequence: "Duplicate side effect",
    kind: "claim",
    confidence: "high",
  };
  assert.deepEqual(parseReviewResult("edge", JSON.stringify([edge])).findings, [
    edge,
  ]);
  for (const raw of [
    "",
    "{}",
    "[{}]",
    JSON.stringify([{ ...edge, priority: 1 }]),
    JSON.stringify([
      {
        ...edge,
        location: "N/A",
        potential_consequence: "Review skipped — no analysis performed",
      },
    ]),
  ])
    assert.throws(() => parseReviewResult("edge", raw), {
      code: "REVIEW_OUTPUT",
    });
  const gap =
    "### Missing assertion\n- **Changed surface:** src/a.ts:1\n- **Impacted consumer or site:** src/caller.ts:4\n- **Existing test evidence:** tests/a.ts:3 reads the old branch\n- **Missing verification:** Assert failure return value\n- **Demonstration:** Invert the branch; current assertions still pass\n- **Consequence:** Caller reports success after failure\n- **Disposition:** patch — add caller regression\n";
  assert.equal(parseReviewResult("verification", gap).findings.length, 1);
  assert.equal(
    parseReviewResult(
      "blind",
      "src/a.ts:4 — trigger: missing response; evidence: caller retries; impact: duplicate",
    ).findings.length,
    1,
  );
  for (const raw of [
    "",
    "[]",
    "No verification gaps found. But I could not read the diff.",
    "### Missing assertion\n- **Changed surface:** src/a.ts:1",
  ])
    assert.throws(() => parseReviewResult("verification", raw), {
      code: "REVIEW_OUTPUT",
    });
  assert.throws(() => parseReviewResult("blind", "Input could not be read"), {
    code: "REVIEW_OUTPUT",
  });
});

test("verify stage marks only the local BMAD spec done while preserving reviewed source and frozen intent", async (t) => {
  const f = await fixture(t);
  const snapshot = await bmadFixture(f);
  await writeFile(path.join(f.root, "src/new.txt"), "verified behavior\n");
  f.ctx.data.sourceDigest = (
    await sourceIdentity(
      f.root,
      f.ctx.data.baseSha,
      f.ctx.data.workerTask.writePaths,
    )
  ).digest;
  await writeSpecification(f.ctx, snapshot, "in-review");
  const frozen = f.ctx.data.spec.frozenSha256,
    body = f.ctx.data.spec.bodySha256,
    before = f.ctx.data.spec.sha256;
  let progress = 0;
  const adapter = createAdapter({
    linear: {
      async comment() {
        progress++;
      },
      async close() {},
    } as any,
  });
  await adapter.runStage("verify", f.ctx);
  assert.equal(f.ctx.data.spec.status, "done");
  assert.equal(f.ctx.data.spec.frozenSha256, frozen);
  assert.equal(f.ctx.data.spec.bodySha256, body);
  assert.notEqual(f.ctx.data.spec.sha256, before);
  const checks = JSON.parse(
    await readFile(path.join(f.root, "artifacts/checks.json"), "utf8"),
  );
  assert.equal(checks.spec.sha256, f.ctx.data.spec.sha256);
  assert.equal(checks.sourceDigest, f.ctx.data.sourceDigest);
  assert.equal(progress, 1);
});

test("command pipes decode UTF-8 characters split across real process writes", async () => {
  const text = "Příliš žluťoučký kůň 🐎\n";
  const script = `const bytes = Buffer.from(${JSON.stringify(text)}); let i=0; const timer=setInterval(()=>{const part=bytes.subarray(i,i+1);process.stdout.write(part);process.stderr.write(part);if(++i===bytes.length)clearInterval(timer);},15);`;
  const result = await execute(process.execPath, ["-e", script]);
  assert.equal(result.stdout, text);
  assert.equal(result.stderr, text);
});

test("raw receipt IO failures retain the validation claim, while a returned failed receipt permits release", async (t) => {
  const f = await fixture(t);
  await writeFile(path.join(f.root, "src/a.txt"), "candidate\n");
  f.ctx.data.sourceDigest = (
    await sourceIdentity(
      f.root,
      f.ctx.data.baseSha,
      f.ctx.data.workerTask.writePaths,
    )
  ).digest;
  f.ctx.data.validationTask = f.validationTask;
  const adapter = createAdapter();
  for (const code of ["EACCES", "EIO"]) {
    f.ctx.supervise = async () => {
      throw Object.assign(
        new Error("receipt read unavailable while worker may be alive"),
        { code },
      );
    };
    await assert.rejects(adapter.runStage("verify", f.ctx), { code });
    assert.equal(
      (await f.registry()).claims.find(
        (claim: any) => claim.task === "validation",
      )?.owner,
      "autodev:test:validation",
    );
  }
  f.ctx.supervise = async () => ({
    exitCode: 7,
    attemptId: "terminated-worker",
  });
  await assert.rejects(adapter.runStage("verify", f.ctx), {
    code: "CHECK_FAILED",
  });
  assert.ok(
    !(await f.registry()).claims.some(
      (claim: any) => claim.task === "validation",
    ),
  );
});

test("multi-check resume retains the shared lease when later B is live and source audit fails after cached A", async (t) => {
  const f = await fixture(t),
    sourceFile = path.join(f.root, "src/a.txt");
  const candidate = "candidate verified by A\n";
  await writeFile(sourceFile, candidate);
  f.ctx.data.sourceDigest = (
    await sourceIdentity(
      f.root,
      f.ctx.data.baseSha,
      f.ctx.data.workerTask.writePaths,
    )
  ).digest;
  f.ctx.data.validationTask = f.validationTask;
  f.ctx.assignment.checks = [
    { id: "a", command: "node", args: [] },
    { id: "b", command: "node", args: [] },
  ];
  const keyA = `check:a:${f.ctx.data.sourceDigest.slice(0, 24)}`,
    keyB = `check:b:${f.ctx.data.sourceDigest.slice(0, 24)}`;
  const reads: string[] = [];
  f.ctx.supervise = async ({ key }: any) => {
    reads.push(key);
    f.ctx.state.attempts[key] = {
      key,
      status: key === keyA ? "complete" : "started",
    };
    if (key === keyB)
      throw Object.assign(
        new Error("B receipt IO failed while B remains live"),
        { code: "EIO" },
      );
    return { exitCode: 0, attemptId: "a" };
  };
  const adapter = createAdapter();
  await assert.rejects(adapter.runStage("verify", f.ctx), { code: "EIO" });
  const lease = (await f.registry()).claims.find(
    (claim: any) => claim.task === "validation",
  );
  assert.ok(lease);
  assert.equal(f.ctx.state.attempts[keyB].status, "started");
  f.ctx.supervise = async ({ key }: any) => {
    reads.push(key);
    assert.equal(key, keyA, "Resume must fail before reaching live B");
    await writeFile(
      sourceFile,
      "unexpected source change after consuming cached A\n",
    );
    return { exitCode: 0, attemptId: "a" };
  };
  await assert.rejects(adapter.runStage("verify", f.ctx), {
    code: "SOURCE_CHANGED",
  });
  assert.deepEqual(reads, [keyA, keyB, keyA]);
  const retained = (await f.registry()).claims.find(
    (claim: any) => claim.task === "validation",
  );
  assert.equal(retained?.owner, "autodev:test:validation");
  assert.equal(retained?.claimedAt, lease.claimedAt);
  // Once all earlier attempts are terminal, a known failed receipt may release.
  await writeFile(sourceFile, candidate);
  f.ctx.state.attempts[keyB].status = "complete";
  f.ctx.supervise = async () => ({ exitCode: 7, attemptId: "a" });
  await assert.rejects(adapter.runStage("verify", f.ctx), {
    code: "CHECK_FAILED",
  });
  assert.ok(
    !(await f.registry()).claims.some(
      (claim: any) => claim.task === "validation",
    ),
  );
});

test("present invalid registries are preserved, and only a missing registry is absent", async (t) => {
  const f = await fixture(t),
    file = path.join(f.root, ".git/agent-coordination/claims.json");
  f.ctx.data.finalizationReady = true;
  const adapter = createAdapter();
  for (const value of [
    null,
    false,
    0,
    "",
    [],
    {},
    { claims: [] },
    { schemaVersion: 1, claims: [null] },
  ]) {
    const contents = JSON.stringify(value);
    await writeFile(file, contents);
    await assert.rejects(adapter.runStage("finalize", f.ctx), {
      code: "CORRUPT_STATE",
    });
    assert.equal(await readFile(file, "utf8"), contents);
  }
  await rm(file);
  assert.equal((await adapter.runStage("finalize", f.ctx)).finalized, true);
});

function freshPr(overrides: any = {}) {
  return {
    number: 9,
    html_url: "https://github.com/unit/repo/pull/9",
    body: "<!-- autodev:fixture -->",
    state: "open",
    draft: false,
    merged: false,
    head: { sha: head, ref: "branch", repo: { full_name: "unit/repo" } },
    base: { sha: base, ref: "main", repo: { full_name: "unit/repo" } },
    ...overrides,
  };
}
function githubContext() {
  return {
    runId: "fixture",
    assignment: { baseBranch: "main" },
    data: {
      prNumber: 9,
      branch: "branch",
      baseSha: base,
      commitSha: head,
      acceptance: { headSha: head, baseSha: base },
    },
    async save(patch: any) {
      Object.assign(this.data, patch);
    },
  } as any;
}

test("failed and pending CI cannot publish project acceptance; success publishes only the exact SHA", async () => {
  const client = new GitHubClient({
    repository: "unit/repo",
    pollMs: 1,
    timeoutMs: 0,
    exec: async () => ({ stdout: log("verify"), stderr: "", exitCode: 0 }),
  });
  const ctx = githubContext(),
    mutations: any[] = [];
  let status = "completed",
    conclusion: string | null = "success",
    missing = false;
  client.pr = async () => freshPr();
  client.branch = async () => ({ commit: { sha: base } });
  client.pages = async (suffix: string) =>
    suffix.includes("check-runs")
      ? missing
        ? []
        : ["verify", "source-secret-hygiene"].map((name, index) => ({
            id: index + 1,
            name,
            app: { id: 15368 },
            head_sha: head,
            status,
            conclusion,
            details_url: `https://github.com/unit/repo/actions/runs/${index + 1}/job/1`,
          }))
      : [];
  client.api = async (method: string, endpoint: string, body: any) => {
    if (method !== "GET") {
      mutations.push({ method, endpoint, body });
      return {};
    }
    return {
      id: endpoint.endsWith("/1") ? 1 : 2,
      event: "pull_request",
      head_sha: head,
      head_branch: "branch",
      repository: { full_name: "unit/repo" },
      path: endpoint.endsWith("/1")
        ? ".github/workflows/ci.yml"
        : ".github/workflows/source-secrets.yml",
      pull_requests: [],
      run_attempt: 1,
      html_url: "https://github.com/unit/repo/actions/runs/1",
    };
  };
  for (const failed of [
    "failure",
    "timed_out",
    "cancelled",
    "skipped",
    "neutral",
  ]) {
    conclusion = failed;
    await assert.rejects(client.accept(ctx, "evidence"), { code: "CI_FAILED" });
    assert.equal(mutations.length, 0);
  }
  status = "in_progress";
  conclusion = null;
  await assert.rejects(client.accept(ctx, "evidence"), { code: "CI_PENDING" });
  assert.equal(mutations.length, 0);
  let ticks = 0;
  await assert.rejects(
    client.waitChecks(
      head,
      { event: "pull_request", prNumber: 9, baseSha: base, branch: "branch" },
      async () => {
        ticks++;
      },
    ),
    { code: "CI_PENDING" },
  );
  assert.equal(ticks, 1);
  missing = true;
  await assert.rejects(client.accept(ctx, "evidence"), { code: "CI_PENDING" });
  assert.equal(mutations.length, 0);
  missing = false;
  status = "completed";
  conclusion = "success";
  const acceptance = await client.accept(ctx, "evidence");
  assert.deepEqual(acceptance, {
    headSha: head,
    baseSha: base,
    evidenceUrl: freshPr().html_url,
  });
  const published = mutations.find((mutation) => mutation.method === "POST");
  assert.equal(published.endpoint, `repos/unit/repo/statuses/${head}`);
  assert.equal(published.body.context, "project-acceptance");
  assert.equal(published.body.state, "success");
});

test("fresh merge requires current open PR, acceptance and base, and sends an exact head precondition", async () => {
  const client = new GitHubClient({ repository: "unit/repo" }),
    ctx = githubContext(),
    requests: any[] = [];
  let pr = freshPr(),
    currentBase = base;
  client.pr = async () => pr;
  client.branch = async () => ({ commit: { sha: currentBase } });
  client.api = async (method: string, endpoint: string, body: any) => {
    requests.push({ method, endpoint, body });
    return { merged: true, sha: merge };
  };
  assert.equal(await client.merge(ctx), merge);
  assert.deepEqual(requests, [
    {
      method: "PUT",
      endpoint: "repos/unit/repo/pulls/9/merge",
      body: { sha: head, merge_method: "merge" },
    },
  ]);
  assert.deepEqual(ctx.data.mergeIntent, { headSha: head, baseSha: base });
  requests.length = 0;
  ctx.data.acceptance.headSha = "4".repeat(40);
  await assert.rejects(client.merge(ctx), { code: "ACCEPTANCE_CHANGED" });
  ctx.data.acceptance.headSha = head;
  ctx.data.acceptance.baseSha = "4".repeat(40);
  await assert.rejects(client.merge(ctx), { code: "ACCEPTANCE_CHANGED" });
  ctx.data.acceptance.baseSha = base;
  currentBase = "4".repeat(40);
  await assert.rejects(client.merge(ctx), { code: "BASE_CHANGED" });
  currentBase = base;
  pr = freshPr({ draft: true });
  await assert.rejects(client.merge(ctx), { code: "PR_NOT_READY" });
  pr = freshPr({ state: "closed" });
  await assert.rejects(client.merge(ctx), { code: "PR_NOT_READY" });
  assert.equal(requests.length, 0);
});

test("merge=true finalize gates Linear Done and claim release on successful main CI for the merge SHA", async (t) => {
  const f = await fixture(t),
    calls: string[] = [],
    github = new GitHubClient({ repository: "unit/repo" });
  const branch = "codex/finalize-fixture";
  await git(f.root, "switch", "-c", branch);
  await writeFile(path.join(f.root, "src/new.txt"), "PR head source\n");
  await git(f.root, "add", "--", "src/new.txt");
  await git(f.root, "commit", "-m", "fixture PR head");
  const headSha = await git(f.root, "rev-parse", "HEAD");
  await git(f.root, "switch", "main");
  await git(f.root, "merge", "--no-ff", "--no-edit", branch);
  const mergeSha = await git(f.root, "rev-parse", "HEAD");
  assert.equal(new Set([f.ctx.data.baseSha, headSha, mergeSha]).size, 3);
  assert.equal(
    await git(f.root, "show", "-s", "--format=%P", mergeSha),
    `${f.ctx.data.baseSha} ${headSha}`,
  );
  await git(f.root, "switch", branch);
  await git(f.root, "remote", "add", "origin", f.root);
  f.ctx.assignment.merge = true;
  f.ctx.data.branch = branch;
  f.ctx.data.commitSha = headSha;
  f.ctx.data.mergeSha = mergeSha;
  f.ctx.data.prNumber = 9;
  github.pr = async () =>
    freshPr({
      merged: true,
      merge_commit_sha: f.ctx.data.mergeSha,
      head: {
        sha: f.ctx.data.commitSha,
        ref: branch,
        repo: { full_name: "unit/repo" },
      },
      base: {
        sha: f.ctx.data.baseSha,
        ref: "main",
        repo: { full_name: "unit/repo" },
      },
    });
  github.waitChecks = async (sha: string, options: any) => {
    assert.equal(sha, f.ctx.data.mergeSha);
    assert.deepEqual(options, { event: "push", branch: "main" });
    throw Object.assign(new Error("main check failed"), { code: "CI_FAILED" });
  };
  const adapter = createAdapter({
    github,
    linear: {
      async getIssue() {
        return { id: "KEY-1" };
      },
      async setState(_issue: any, state: string) {
        calls.push(state);
      },
      async comment() {
        calls.push("progress");
      },
      async close() {},
    } as any,
  });
  await assert.rejects(adapter.runStage("finalize", f.ctx), {
    code: "CI_FAILED",
  });
  assert.deepEqual(calls, []);
  assert.equal((await f.registry()).claims.length, 2);
  let ready!: () => void, finish!: (value: any) => void;
  const reached = new Promise<void>((resolve) => {
    ready = resolve;
  });
  github.waitChecks = async (sha: string, options: any) => {
    assert.equal(sha, f.ctx.data.mergeSha);
    assert.equal(options.event, "push");
    ready();
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const pending = adapter.runStage("finalize", f.ctx);
  await reached;
  assert.deepEqual(calls, []);
  assert.equal((await f.registry()).claims.length, 2);
  assert.equal(f.ctx.data.finalizationReady, undefined);
  const mainChecks = [
    { name: "verify", headSha: f.ctx.data.mergeSha, conclusion: "success" },
  ];
  finish(mainChecks);
  await pending;
  assert.deepEqual(calls, ["Done", "progress"]);
  assert.deepEqual(f.ctx.data.mainChecks, mainChecks);
  assert.equal((await f.registry()).claims.length, 0);
});

for (const targetStatus of ["in-review", "done"]) {
  test(`spec ${targetStatus} file-write crash resumes from its on-disk intent before source validation`, async (t) => {
    const f = await fixture(t),
      snapshot = await bmadFixture(f);
    await writeFile(
      path.join(f.root, "src/new.txt"),
      "reviewed and checked source\n",
    );
    const source = await sourceIdentity(
      f.root,
      f.ctx.data.baseSha,
      f.ctx.data.workerTask.writePaths,
    );
    Object.assign(f.ctx.data, {
      sourceDigest: source.digest,
      sourceDiffSha256: sha(source.diff),
    });
    await writeFile(path.join(f.ctx.runDir, "source-diff.txt"), source.diff);
    await writeSpecification(
      f.ctx,
      snapshot,
      targetStatus === "done" ? "in-review" : "in-progress",
    );
    if (targetStatus === "done")
      f.ctx.data.verifiedSourceDigest = source.digest;
    else delete f.ctx.data.reviews;
    const oldHash = f.ctx.data.spec.sha256,
      frozen = f.ctx.data.spec.frozenSha256;
    const checkpoint = path.join(f.ctx.runDir, "spec-crash-state.json");
    const descriptor = {
      repo: f.ctx.repo,
      runId: f.ctx.runId,
      runDir: f.ctx.runDir,
      assignment: f.ctx.assignment,
      state: f.ctx.state,
    };
    await writeFile(checkpoint, JSON.stringify(descriptor));
    const program = `
      import { readFile } from 'node:fs/promises';
      import { writeSpecification } from ${JSON.stringify(new URL("../scripts/autodev/adapters.mjs", import.meta.url).href)};
      import { loadBmadSnapshot } from ${JSON.stringify(new URL("../scripts/autodev/codex.mjs", import.meta.url).href)};
      import { atomicWriteJson } from ${JSON.stringify(new URL("../scripts/autodev/store.mjs", import.meta.url).href)};
      const file=process.argv.at(-1), saved=JSON.parse(await readFile(file,'utf8'));
      const ctx={...saved,get data(){return saved.state.data;},async save(patch){saved.state.data={...saved.state.data,...patch};await atomicWriteJson(file,saved);},async fault(point){if(point===${JSON.stringify(`after-spec-write:${targetStatus}`)})process.kill(process.pid,'SIGKILL');}};
      await writeSpecification(ctx,await loadBmadSnapshot(ctx.data.renderedWorkflow,ctx.data.bmadSnapshot),${JSON.stringify(targetStatus)});
    `;
    await assert.rejects(
      execute(
        process.execPath,
        ["--input-type=module", "-e", program, checkpoint],
        { cwd: f.root },
      ),
      { code: "COMMAND_FAILED" },
    );
    const saved = JSON.parse(await readFile(checkpoint, "utf8")),
      disk = await readFile(f.ctx.data.specFile, "utf8");
    assert.equal(saved.state.data.spec.sha256, oldHash);
    assert.notEqual(sha(disk), oldHash);
    assert.equal(saved.state.data.spec.pendingStatus.toSha256, sha(disk));
    f.ctx.state.data = saved.state.data;
    const adapter = createAdapter({
      worker: async (_ctx: any, options: any) => ({
        result: parseReviewResult(
          options.lens,
          options.lens === "verification"
            ? "No verification gaps found."
            : "[]",
        ),
        attemptId: options.lens,
      }),
      linear: { async comment() {}, async close() {} } as any,
    });
    const stage = targetStatus === "done" ? "verify" : "review";
    await writeFile(
      f.ctx.data.specFile,
      disk.replace(f.ctx.data.intent, "unknown changed requirement"),
    );
    await assert.rejects(adapter.runStage(stage, f.ctx), { code: "BMAD_SPEC" });
    assert.equal(f.ctx.data.spec.sha256, oldHash);
    assert.ok(f.ctx.data.spec.pendingStatus);
    await writeFile(f.ctx.data.specFile, disk);
    await adapter.runStage(stage, f.ctx);
    assert.equal(f.ctx.data.spec.status, targetStatus);
    assert.equal(
      f.ctx.data.spec.sha256,
      sha(await readFile(f.ctx.data.specFile, "utf8")),
    );
    assert.equal(f.ctx.data.spec.frozenSha256, frozen);
    assert.equal(f.ctx.data.spec.pendingStatus, null);
  });
}
