import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
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
const { supervise: nativeSupervise } = await import(
  new URL("../scripts/autodev/process.mjs", import.meta.url).href
);
const { atomicWriteJson } = await import(
  new URL("../scripts/autodev/store.mjs", import.meta.url).href
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
  planningInputHashes,
  assertPlanningReady,
  prepareWorkerInput,
  executeWorkerInput,
  resumeWorkerAttempt,
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
    try {
      await reportNativeFailures(
        path.join(root, ".git/autodev/test"),
        (message: string) => t.diagnostic(message),
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
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
  ready: true,
  runtimeBlockers: [] as string[],
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
  f.ctx.planProvenance = {
    deliveryProtocol: 2,
    inlineInputs: planningInputHashes(snapshot),
    snapshot: snapshot.identity,
  };
  f.ctx.data.plan = { result: validPlan(), provenance: f.ctx.planProvenance };
  f.ctx.data.intent =
    "Preserve this exact user-owned requirement, including punctuation!";
  f.ctx.assignment.intentFile = "intent.md";
  if (createSpec) await writeSpecification(f.ctx, snapshot, "ready-for-dev");
  return snapshot;
}
function cleanReview(ctx: any, lens: string) {
  return {
    result: parseReviewResult(
      lens,
      lens === "verification" ? "No verification gaps found." : "[]",
    ),
    provenance: { deliveryProtocol: 2, diffSha256: ctx.data.sourceDiffSha256 },
    attemptId: lens,
  };
}

async function waitFor(read: () => Promise<any>, label: string) {
  const until = Date.now() + 15_000;
  while (Date.now() < until) {
    const value = await read();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out: ${label}`);
}
async function reportNativeFailures(
  runDir: string,
  report: (message: string) => void,
) {
  const attempts = path.join(runDir, "attempts");
  let entries;
  try {
    entries = await readdir(attempts, { withFileTypes: true });
  } catch (error: any) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  const read = async (file: string) => {
    try {
      return await readFile(file, "utf8");
    } catch (error: any) {
      return `[unavailable: ${error.code}]`;
    }
  };
  for (const entry of entries.filter((entry) => entry.isDirectory())) {
    const dir = path.join(attempts, entry.name),
      raw = await read(path.join(dir, "receipt.json"));
    let receipt;
    try {
      receipt = JSON.parse(raw);
    } catch {
      /* Preserve invalid/missing receipt diagnostics too. */
    }
    if (receipt?.exitCode === 0 && !receipt.signal && !receipt.heartbeatError)
      continue;
    report(
      `Native attempt failure before fixture cleanup: ${dir}\nreceipt.json:\n${raw}\nrequest.json:\n${await read(path.join(dir, "request.json"))}\nstderr.log:\n${await read(path.join(dir, "stderr.log"))}\nstdout.log:\n${await read(path.join(dir, "stdout.log"))}`,
    );
  }
}
function nativeSupervisor(ctx: any) {
  return (options: any) =>
    nativeSupervise(
      {
        runId: ctx.runId,
        runDir: ctx.runDir,
        state: ctx.state,
        persist: async () => {},
        emit: (event: any) => ctx.emit(event),
        fault: (point: string) => ctx.fault(point),
      },
      options,
    );
}
async function originalAttempt(
  ctx: any,
  key: string,
  raw: string,
  gate?: string,
  writes: Record<string, string> = {},
) {
  const output = path.join(ctx.runDir, `original-${sha(key).slice(0, 16)}.txt`);
  const write = Object.entries({ ...writes, [output]: raw })
    .map(
      ([file, text]) =>
        `fs.writeFileSync(${JSON.stringify(file)},${JSON.stringify(text)},'utf8');`,
    )
    .join("");
  const script = `const fs=require('node:fs');${gate ? `const limit=Date.now()+60000;const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(gate)})){clearInterval(timer);${write}}else if(Date.now()>limit){clearInterval(timer);process.exitCode=9;}},20);` : write}`;
  return ctx.supervise({
    key,
    command: process.execPath,
    args: ["-e", script, "--", "-o", output],
    cwd: ctx.data.worktree,
  });
}
async function legacyFixture(
  t: any,
  liveLens?: string,
  rawByLens: Record<string, string> = {},
) {
  const f = await fixture(t),
    snapshot = await bmadFixture(f, false),
    ctx = f.ctx;
  ctx.data.plan.result.risks = [
    "Original renderer inputs were inaccessible (EACCES); this is retained historical evidence.",
  ];
  await writeSpecification(ctx, snapshot, "ready-for-dev");
  delete ctx.data.plan.result.ready;
  delete ctx.data.plan.result.runtimeBlockers;
  ctx.data.plan.provenance = {
    deliveryProtocol: 1,
    snapshot: snapshot.identity,
  };
  ctx.supervise = nativeSupervisor(ctx);
  await originalAttempt(ctx, "plan", JSON.stringify(ctx.data.plan.result));
  const implementation = {
    summary: "One completed implementation",
    changedFiles: ["src/new.txt"],
    checks: [],
    risks: [],
  };
  const implementationReceipt = await originalAttempt(
    ctx,
    "implement",
    JSON.stringify(implementation),
  );
  ctx.data.implementation = {
    result: implementation,
    attemptId: implementationReceipt.attemptId,
  };
  await writeFile(
    path.join(f.root, "src/new.txt"),
    "candidate from the original implementation\n",
  );
  const source = await sourceIdentity(
    f.root,
    ctx.data.baseSha,
    ctx.data.workerTask.writePaths,
  );
  Object.assign(ctx.data, {
    sourceDigest: source.digest,
    sourceDiffSha256: sha(source.diff),
  });
  await writeFile(path.join(ctx.runDir, "source-diff.txt"), source.diff);
  await writeSpecification(ctx, snapshot, "in-review");
  ctx.data.reviewBefore = await workingSnapshot(f.root);
  delete ctx.data.reviews;
  const originals: string[] = [];
  let live: Promise<any> | undefined, gate: string | undefined;
  for (const lens of ["blind", "edge", "verification"]) {
    const key = `review:${lens}:${source.digest.slice(0, 32)}`;
    originals.push(key);
    const raw =
      rawByLens[lens] ??
      (lens === "blind"
        ? "[]"
        : "Review stopped: the required instruction file was unreadable. No review was performed or files changed.");
    if (lens === liveLens) {
      gate = path.join(ctx.runDir, "finish-original-review");
      live = originalAttempt(ctx, key, raw, gate);
      live.catch(() => {});
      await waitFor(
        async () => ctx.state.attempts[key],
        "original dispatch checkpoint",
      );
    } else await originalAttempt(ctx, key, raw);
  }
  const { worker, ledgerRows } = await protocol2WorkerFixture(ctx);
  const immutableBytes = async () => {
    const entries: Record<string, string> = {};
    for (const key of ["plan", "implement", ...originals]) {
      const dir = path.join(ctx.runDir, "attempts", ctx.state.attempts[key].id);
      for (const name of ["request.json", "receipt.json"]) {
        try {
          entries[`${key}/${name}`] = await readFile(
            path.join(dir, name),
            "utf8",
          );
        } catch (error: any) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    }
    return entries;
  };
  return {
    ...f,
    snapshot,
    worker,
    originals,
    live,
    gate,
    ledgerRows,
    immutableBytes,
  };
}
async function protocol2WorkerFixture(ctx: any) {
  const program = path.join(ctx.runDir, "fake-codex.mjs"),
    ledger = path.join(ctx.runDir, "v2-workers.jsonl");
  await writeFile(
    program,
    `import fs from 'node:fs';import crypto from 'node:crypto';let prompt='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>prompt+=s);process.stdin.on('end',()=>{const args=process.argv.slice(2);const out=args[args.indexOf('-o')+1];const schema=args.includes('--output-schema')?args[args.indexOf('--output-schema')+1]:'';fs.appendFileSync(${JSON.stringify(ledger)},JSON.stringify({out,bytes:Buffer.byteLength(prompt),sha256:crypto.createHash('sha256').update(prompt).digest('hex')})+'\\n');const result=schema.endsWith('plan-readiness.json')?JSON.stringify({ready:true,intentGaps:[],runtimeBlockers:[],evidence:['Complete verified inline step2/template and unchanged original candidate inspected.']}):out.includes('verification')?'No verification gaps found.':'[]';fs.writeFileSync(out,result,'utf8');});`,
  );
  const worker = (context: any, options: any) =>
    runWorker(context, options, {
      command: process.execPath,
      prefixArgs: [program],
    });
  const ledgerRows = async () => {
    try {
      return (await readFile(ledger, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch (error: any) {
      if (error.code === "ENOENT") return [];
      throw error;
    }
  };
  return { worker, ledgerRows };
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
      return cleanReview(_ctx, options.lens);
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
        provenance: f.ctx.planProvenance,
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
      return { result: validPlan(), provenance: f.ctx.planProvenance };
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
    assert.ok(
      !result.prompt.includes(diff),
      "Native review launch keeps the diff file-only",
    );
    assert.ok(
      result.prompt.includes(path.join(f.ctx.runDir, "source-diff.txt")),
    );
    assert.ok(!result.prompt.includes(f.ctx.data.intent));
    if (lens !== "blind") {
      const name =
        lens === "edge"
          ? "review-prompts/edge-case-hunter.md"
          : "review-prompts/verification-gap.md";
      assert.ok(result.prompt.includes(snapshot.files[name].text));
      assert.equal(
        result.provenance.inlineInputs[name],
        snapshot.files[name].sha256,
      );
    }
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

test("protocol 2 stdin transport delivers more than 64 KiB UTF-8 and rejects input tampering before spawn", async (t) => {
  const f = await fixture(t),
    text = "Příliš žluťoučký kůň 🐎 — přesné podklady\n".repeat(2500),
    marker = path.join(f.ctx.runDir, "transport-starts");
  assert.ok(Buffer.byteLength(text, "utf8") > 65536);
  const script = `const fs=require('node:fs');fs.appendFileSync(${JSON.stringify(marker)},'start\\n');let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>{process.stdout.write(s);process.stderr.write('český stderr 🐎');});`;
  const prepared = await prepareWorkerInput(
    f.ctx,
    "transport-v2",
    ["-e", script],
    text,
    { promptSha256: sha(text) },
    process.execPath,
  );
  assert.ok(prepared.args.join(" ").length < 4096);
  const result = await execute(prepared.command, prepared.args, {
    cwd: f.root,
  });
  assert.equal(result.stdout, text);
  assert.equal(result.stderr, "český stderr 🐎");
  const original = await readFile(prepared.file, "utf8");
  await writeFile(prepared.file, original.replace("Příliš", "Changed"));
  await assert.rejects(
    execute(prepared.command, prepared.args, { cwd: f.root }),
    /Immutable worker input changed/,
  );
  assert.equal(await readFile(marker, "utf8"), "start\n");
  await assert.rejects(
    prepareWorkerInput(f.ctx, "bad-provenance", [], text, {
      promptSha256: "0".repeat(64),
    }),
    { code: "WORKER_INPUT" },
  );
  const missing = await prepareWorkerInput(
    f.ctx,
    "missing-command",
    [],
    "input",
    { promptSha256: sha("input") },
    "autodev-missing-worker-7b9e",
  );
  await assert.rejects(
    execute(missing.command, missing.args, { cwd: f.root }),
    /WORKER_START/,
  );
  const failed = await prepareWorkerInput(
    f.ctx,
    "early-exit",
    ["-e", "process.exit(7)"],
    text,
    { promptSha256: sha(text) },
    process.execPath,
  );
  await assert.rejects(
    execute(failed.command, failed.args, { cwd: f.root }),
    (error: any) => error.exitCode === 7,
  );
});

test("plan and legacy-readiness payloads contain exact verified inline snapshot bodies through real stdin", async (t) => {
  const f = await fixture(t),
    snapshot = await bmadFixture(f);
  const built = await buildWorkerPrompt(f.ctx, { kind: "plan" });
  for (const name of ["step-02-plan.md", "spec-template.md"]) {
    assert.ok(built.prompt.includes(snapshot.files[name].text));
    assert.equal(
      built.provenance.inlineInputs[name],
      snapshot.files[name].sha256,
    );
  }
  const echo =
    "let s='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>s+=x);process.stdin.on('end',()=>process.stdout.write(s));";
  const prepared = await prepareWorkerInput(
    f.ctx,
    "plan-delivery-proof",
    ["-e", echo],
    built.prompt,
    built.provenance,
    process.execPath,
  );
  assert.equal(
    (await execute(prepared.command, prepared.args, { cwd: f.root })).stdout,
    built.prompt,
  );
  const specText = await readFile(f.ctx.data.specFile, "utf8");
  f.ctx.data.planReadinessInputV2 = {
    protocol: 2,
    plan: f.ctx.data.plan.result,
    intent: f.ctx.data.intent,
    specText,
    candidateDiff: "candidate",
    sourceDigest: "a".repeat(64),
  };
  const upgrade = await buildWorkerPrompt(f.ctx, { kind: "plan-readiness" });
  assert.ok(upgrade.prompt.includes(specText));
  assert.ok(upgrade.prompt.includes(JSON.stringify(f.ctx.data.plan.result)));
  assert.ok(upgrade.prompt.includes(snapshot.files["step-02-plan.md"].text));
});

test("structured readiness failures block implement, review and acceptance despite empty user intent gaps", async (t) => {
  const f = await fixture(t);
  await bmadFixture(f);
  await writeFile(path.join(f.root, "src/new.txt"), "candidate\n");
  const source = await sourceIdentity(
    f.root,
    f.ctx.data.baseSha,
    f.ctx.data.workerTask.writePaths,
  );
  Object.assign(f.ctx.data, {
    sourceDigest: source.digest,
    sourceDiffSha256: sha(source.diff),
  });
  let dispatches = 0,
    accepts = 0;
  const adapter = createAdapter({
    worker: async () => {
      dispatches++;
      throw new Error("must not dispatch");
    },
    github: {
      async accept() {
        accepts++;
      },
    } as any,
  });
  const invalid = [
    { ready: undefined, runtimeBlockers: [] },
    { ready: "true", runtimeBlockers: [] },
    { ready: false, runtimeBlockers: [] },
    { ready: true, runtimeBlockers: undefined },
    { ready: true, runtimeBlockers: ["Required input is unreadable"] },
  ];
  for (const fields of invalid) {
    f.ctx.data.plan.result = { ...validPlan(), ...fields };
    for (const stage of ["implement", "review", "accept"])
      await assert.rejects(adapter.runStage(stage, f.ctx), (error: any) =>
        ["WORKER_OUTPUT", "PLAN_NOT_READY", "RUNTIME_BLOCKERS"].includes(
          error.code,
        ),
      );
  }
  assert.equal(dispatches, 0);
  assert.equal(accepts, 0);
  assert.doesNotThrow(() =>
    assertPlanningReady({
      ...validPlan(),
      risks: ["A prior EACCES was resolved; prose is not a control field."],
    }),
  );
});

test("legacy terminal reviews upgrade once with real immutable receipts and preserve implementation, spec and original failure evidence", async (t) => {
  const f = await legacyFixture(t),
    original = await f.immutableBytes(),
    source = f.ctx.data.sourceDigest,
    spec = await readFile(f.ctx.data.specFile, "utf8"),
    implementation = JSON.stringify(f.ctx.data.implementation),
    plan = JSON.stringify(f.ctx.data.plan);
  const adapter = createAdapter({
    worker: f.worker,
    linear: { async comment() {}, async close() {} } as any,
  });
  await adapter.runStage("review", f.ctx);
  assert.deepEqual(await f.immutableBytes(), original);
  assert.equal(f.ctx.data.sourceDigest, source);
  assert.equal(JSON.stringify(f.ctx.data.implementation), implementation);
  assert.equal(JSON.stringify(f.ctx.data.plan), plan);
  assert.equal(await readFile(f.ctx.data.specFile, "utf8"), spec);
  assert.equal(
    f.ctx.data.legacyReviewSettlementV2.filter(
      (entry: any) => entry.failure?.code === "REVIEW_OUTPUT",
    ).length,
    2,
  );
  const first = await f.ledgerRows();
  assert.equal(first.length, 4);
  assert.equal(
    first.filter((row: any) => row.out.includes("plan-readiness")).length,
    1,
  );
  for (const [key, attempt] of Object.entries(f.ctx.state.attempts) as [
    string,
    any,
  ][]) {
    if (key !== "plan-readiness:v2" && !key.startsWith("review:v2:")) continue;
    const request = JSON.parse(
      await readFile(
        path.join(f.ctx.runDir, "attempts", attempt.id, "request.json"),
        "utf8",
      ),
    );
    const input = JSON.parse(await readFile(request.args[2], "utf8"));
    const output = input.args[input.args.indexOf("-o") + 1],
      received = first.find((row: any) => row.out === output);
    assert.equal(received.sha256, input.provenance.promptSha256);
    assert.equal(received.bytes, Buffer.byteLength(input.prompt, "utf8"));
    if (key === "plan-readiness:v2") {
      for (const name of ["step-02-plan.md", "spec-template.md"])
        assert.ok(input.prompt.includes(f.snapshot.files[name].text));
    } else {
      assert.ok(
        !input.prompt.includes(
          await readFile(path.join(f.ctx.runDir, "source-diff.txt"), "utf8"),
        ),
      );
      assert.ok(!input.prompt.includes(spec));
    }
  }
  await adapter.runStage("review", f.ctx);
  assert.equal((await f.ledgerRows()).length, 4);
  assert.equal(f.ctx.data.reviewsV2.length, 3);
  assert.ok(
    f.ctx.data.reviewsV2.every(
      (entry: any) =>
        entry.provenance.deliveryProtocol === 2 && entry.result.completed,
    ),
  );
  const edge = f.originals.find((key) => key.includes(":edge:"))!;
  const result = await resumeWorkerAttempt(f.ctx, edge);
  assert.throws(() => parseReviewResult("edge", result.raw), {
    code: "REVIEW_OUTPUT",
  });
});

test("legacy original live review must finish before any protocol 2 model is dispatched", async (t) => {
  const f = await legacyFixture(t, "verification");
  const adapter = createAdapter({
    worker: f.worker,
    linear: { async comment() {}, async close() {} } as any,
  });
  let connected = false;
  f.ctx.emit = async (event: any) => {
    if (event.type === "worker-connected" && event.key === f.originals[2])
      connected = true;
  };
  const upgrading = adapter.runStage("review", f.ctx);
  upgrading.catch(() => {});
  try {
    await waitFor(async () => connected, "resumed original reviewer identity");
    assert.equal((await f.ledgerRows()).length, 0);
    assert.ok(
      !Object.keys(f.ctx.state.attempts).some(
        (key) => key.startsWith("review:v2:") || key === "plan-readiness:v2",
      ),
    );
    await writeFile(f.gate!, "finish");
    await f.live;
    await upgrading;
    assert.equal((await f.ledgerRows()).length, 4);
  } finally {
    await writeFile(f.gate!, "finish");
    await f.live?.catch(() => {});
    await upgrading.catch(() => {});
  }
});

test("legacy actionable findings survive delivery upgrade and resume before any clean replacement dispatch", async (t) => {
  const f = await legacyFixture(t, undefined, {
    blind:
      "src/new.txt:1 — The candidate omits the assigned validation and accepts invalid input.",
  });
  const original = await f.immutableBytes();
  let accepts = 0;
  const adapter = createAdapter({
    worker: f.worker,
    github: {
      async accept() {
        accepts++;
      },
    } as any,
  });
  for (const stage of ["review", "review", "accept"])
    await assert.rejects(adapter.runStage(stage, f.ctx), {
      code: "REVIEW_FINDINGS",
    });
  assert.equal(
    f.ctx.data.legacyReviewSettlementV2[0].result.findings.length,
    1,
  );
  assert.ok(
    f.ctx.data.legacyReviewSettlementV2.some((entry: any) => entry.failure),
  );
  assert.equal((await f.ledgerRows()).length, 0);
  assert.equal(accepts, 0);
  assert.equal(f.ctx.data.deliveryV2, undefined);
  assert.deepEqual(await f.immutableBytes(), original);
});

test("legacy review checkpoint replay permits only the exact controller artifact backed by saved terminal results", async (t) => {
  const f = await legacyFixture(t, undefined, {
    edge: "[]",
    verification: "No verification gaps found.",
  });
  f.ctx.data.reviews = await Promise.all(
    f.originals.map(async (key) => {
      const original = await resumeWorkerAttempt(f.ctx, key),
        lens = key.split(":")[1];
      return {
        lens,
        attemptId: original.receipt.attemptId,
        result: parseReviewResult(lens, original.raw),
      };
    }),
  );
  const artifact = path.join(f.root, "artifacts/review.json");
  await atomicWriteJson(artifact, {
    baseSha: f.ctx.data.baseSha,
    sourceDigest: f.ctx.data.sourceDigest,
    diffSha256: f.ctx.data.sourceDiffSha256,
    spec: {
      path: f.ctx.data.specFile,
      sha256: f.ctx.data.spec.sha256,
      frozenSha256: f.ctx.data.spec.frozenSha256,
    },
    snapshot: f.ctx.data.bmadSnapshot,
    reviews: f.ctx.data.reviews,
  });
  const exact = await readFile(artifact, "utf8");
  const adapter = createAdapter({
    worker: f.worker,
    linear: { async comment() {} } as any,
  });
  await writeFile(artifact, exact + " ");
  await assert.rejects(adapter.runStage("review", f.ctx), {
    code: "STAGE_SCOPE",
  });
  await writeFile(artifact, exact);
  const unexpected = path.join(f.root, "artifacts/unexpected.txt");
  await writeFile(unexpected, "not a controller checkpoint\n");
  await assert.rejects(adapter.runStage("review", f.ctx), {
    code: "STAGE_SCOPE",
  });
  await rm(unexpected);
  assert.equal((await f.ledgerRows()).length, 0);
  await adapter.runStage("review", f.ctx);
  await adapter.runStage("review", f.ctx);
  assert.equal((await f.ledgerRows()).length, 4);
  assert.equal(await readFile(artifact, "utf8"), exact);
  // A checkpointed finding is also blocking, even if another cached/native
  // result later looks clean. Delivery does not constitute repair or triage.
  f.ctx.data.reviews[0].result.findings.push({
    kind: "blind",
    raw: "src/new.txt:1 — retained finding",
  });
  await assert.rejects(adapter.runStage("accept", f.ctx), {
    code: "REVIEW_FINDINGS",
  });
  assert.equal((await f.ledgerRows()).length, 4);
});

test("legacy readiness resumes the pre-file spec checkpoint from exact initialText and rejects missing created or changed frozen specs", async (t) => {
  const f = await fixture(t),
    snapshot = await bmadFixture(f, false),
    ctx = f.ctx;
  delete ctx.data.implementation;
  const save = ctx.save;
  ctx.save = async (patch: any) => {
    await save(patch);
    if (patch.spec?.created === false)
      throw new Error("crash before first spec file write");
  };
  await assert.rejects(
    writeSpecification(ctx, snapshot, "ready-for-dev"),
    /crash before first spec file write/,
  );
  ctx.save = save;
  const initial = ctx.data.spec.initialText,
    frozen = ctx.data.spec.frozenSha256;
  await assert.rejects(readFile(ctx.data.specFile), { code: "ENOENT" });
  delete ctx.data.plan.result.ready;
  delete ctx.data.plan.result.runtimeBlockers;
  ctx.data.plan.provenance = {
    deliveryProtocol: 1,
    snapshot: snapshot.identity,
  };
  ctx.supervise = nativeSupervisor(ctx);
  await originalAttempt(ctx, "plan", JSON.stringify(ctx.data.plan.result));
  const fake = await protocol2WorkerFixture(ctx);
  let implementations = 0;
  const adapter = createAdapter({
    worker: async (context: any, options: any) => {
      if (options.kind !== "implement") return fake.worker(context, options);
      implementations++;
      await originalAttempt(
        context,
        "implement",
        JSON.stringify({
          summary: "Recovered specification implementation",
          changedFiles: ["src/new.txt"],
          checks: [],
          risks: [],
        }),
        undefined,
        {
          [path.join(f.root, "src/new.txt")]:
            "implemented once after readiness\n",
        },
      );
      return runWorker(context, options);
    },
    linear: { async comment() {} } as any,
  });
  ctx.data.spec.created = true;
  await assert.rejects(adapter.runStage("implement", ctx), {
    code: "BMAD_SPEC",
  });
  ctx.data.spec.created = false;
  ctx.data.spec.initialText = initial.replace(
    "Preserve this exact",
    "Change this exact",
  );
  await assert.rejects(adapter.runStage("implement", ctx), {
    code: "BMAD_SPEC",
  });
  assert.equal((await fake.ledgerRows()).length, 0);
  ctx.data.spec.initialText = initial;
  await adapter.runStage("implement", ctx);
  const implementationId = ctx.data.implementation.attemptId;
  await adapter.runStage("implement", ctx);
  assert.equal(implementations, 1);
  assert.equal((await fake.ledgerRows()).length, 1);
  assert.equal(ctx.data.implementation.attemptId, implementationId);
  assert.equal(ctx.data.planReadinessInputV2.specText, initial);
  assert.equal(ctx.data.spec.frozenSha256, frozen);
  assert.equal(ctx.data.spec.created, true);
  assert.equal(
    await readFile(path.join(f.root, "src/new.txt"), "utf8"),
    "implemented once after readiness\n",
  );
});

test("live legacy implementation settles its native receipt and final candidate before readiness can dispatch", async (t) => {
  const f = await fixture(t),
    snapshot = await bmadFixture(f),
    ctx = f.ctx;
  await writeSpecification(ctx, snapshot, "in-progress");
  delete ctx.data.implementation;
  delete ctx.data.plan.result.ready;
  delete ctx.data.plan.result.runtimeBlockers;
  ctx.data.plan.provenance = {
    deliveryProtocol: 1,
    snapshot: snapshot.identity,
  };
  ctx.supervise = nativeSupervisor(ctx);
  await originalAttempt(ctx, "plan", JSON.stringify(ctx.data.plan.result));
  ctx.data.implementationBefore = await workingSnapshot(f.root);
  const gate = path.join(ctx.runDir, "finish-original-implementation"),
    candidate =
      "candidate written only at original implementation completion\n";
  const live = originalAttempt(
    ctx,
    "implement",
    JSON.stringify({
      summary: "Original live implementation",
      changedFiles: ["src/new.txt"],
      checks: [],
      risks: [],
    }),
    gate,
    { [path.join(f.root, "src/new.txt")]: candidate },
  );
  live.catch(() => {});
  await waitFor(
    async () => ctx.state.attempts.implement,
    "original implementation dispatch",
  );
  const fake = await protocol2WorkerFixture(ctx);
  let connected = false;
  ctx.emit = async (event: any) => {
    if (event.type === "worker-connected" && event.key === "implement")
      connected = true;
  };
  const adapter = createAdapter({
    worker: fake.worker,
    linear: { async comment() {} } as any,
  });
  const resumed = adapter.runStage("implement", ctx);
  resumed.catch(() => {});
  try {
    await waitFor(
      async () => connected || (await fake.ledgerRows()).length,
      "original implementation reconnect before readiness",
    );
    assert.equal(connected, true);
    assert.equal((await fake.ledgerRows()).length, 0);
    assert.equal(ctx.state.attempts["plan-readiness:v2"], undefined);
    await assert.rejects(readFile(path.join(f.root, "src/new.txt")), {
      code: "ENOENT",
    });
    const requestPath = path.join(
        ctx.runDir,
        "attempts",
        ctx.state.attempts.implement.id,
        "request.json",
      ),
      request = await readFile(requestPath, "utf8");
    await writeFile(gate, "finish");
    const receipt = await live;
    await resumed;
    assert.equal(ctx.data.implementation.attemptId, receipt.attemptId);
    assert.equal(await readFile(requestPath, "utf8"), request);
    const adopted = await resumeWorkerAttempt(ctx, "implement");
    assert.deepEqual(adopted.receipt, receipt);
    assert.equal((await fake.ledgerRows()).length, 1);
    assert.equal(
      ctx.data.planReadinessInputV2.sourceDigest,
      ctx.data.sourceDigest,
    );
    assert.ok(
      ctx.data.planReadinessInputV2.candidateDiff.includes(candidate.trim()),
    );
    assert.equal(
      await readFile(path.join(f.root, "src/new.txt"), "utf8"),
      candidate,
    );
  } finally {
    await writeFile(gate, "finish");
    await live.catch(() => {});
    await resumed.catch(() => {});
  }
});

test("corrupt or mismatched legacy receipts prevent all replacement attempts and preserve bytes", async (t) => {
  const f = await legacyFixture(t),
    key = f.originals[1],
    file = path.join(
      f.ctx.runDir,
      "attempts",
      f.ctx.state.attempts[key].id,
      "receipt.json",
    ),
    original = await readFile(file, "utf8");
  const adapter = createAdapter({ worker: f.worker });
  for (const changed of [
    "{corrupt",
    JSON.stringify({ ...JSON.parse(original), requestDigest: "0".repeat(64) }),
  ]) {
    await writeFile(file, changed);
    await assert.rejects(adapter.runStage("review", f.ctx), (error: any) =>
      ["CORRUPT_STATE", "UNKNOWN_ATTEMPT"].includes(error.code),
    );
    assert.equal(await readFile(file, "utf8"), changed);
    assert.equal((await f.ledgerRows()).length, 0);
    assert.ok(
      !Object.keys(f.ctx.state.attempts).some(
        (attempt) =>
          attempt.startsWith("review:v2:") || attempt === "plan-readiness:v2",
      ),
    );
  }
  await writeFile(file, original);
  const originalSupervise = f.ctx.supervise;
  f.ctx.supervise = async (options: any) => {
    if (options.key === key)
      throw Object.assign(new Error("Receipt permission failure"), {
        code: "EACCES",
      });
    return originalSupervise(options);
  };
  const preserved = await f.immutableBytes();
  await assert.rejects(adapter.runStage("review", f.ctx), { code: "EACCES" });
  assert.deepEqual(await f.immutableBytes(), preserved);
  assert.equal((await f.ledgerRows()).length, 0);
  f.ctx.supervise = originalSupervise;
  await rm(file);
  try {
    await assert.rejects(adapter.runStage("review", f.ctx), {
      code: "UNKNOWN_ATTEMPT",
    });
    assert.equal((await f.ledgerRows()).length, 0);
  } finally {
    await writeFile(file, original);
  }
});

test("legacy readiness blockers remain blocked across resume without repeating or mixing review versions", async (t) => {
  const f = await legacyFixture(t);
  let calls = 0;
  const adapter = createAdapter({
    worker: async (ctx: any, options: any) => {
      calls++;
      assert.equal(options.kind, "plan-readiness");
      const built = await buildWorkerPrompt(ctx, options);
      return {
        result: {
          ready: false,
          intentGaps: [],
          runtimeBlockers: ["A required prerequisite remains unavailable"],
          evidence: ["Read-only validation found a blocker"],
        },
        provenance: built.provenance,
        attemptId: "bounded-readiness",
      };
    },
  });
  for (const stage of ["review", "review", "accept"])
    await assert.rejects(adapter.runStage(stage, f.ctx), {
      code: "RUNTIME_BLOCKERS",
    });
  assert.equal(calls, 1);
  assert.equal(f.ctx.data.reviewsV2, undefined);
  assert.equal(f.ctx.data.deliveryV2, undefined);
});

test("native worker failure diagnostics preserve exact stderr and receipt before fixture cleanup", async (t) => {
  const f = await fixture(t);
  f.ctx.supervise = nativeSupervisor(f.ctx);
  const receipt = await f.ctx.supervise({
    key: "diagnostic-failure",
    command: process.execPath,
    args: [
      "-e",
      "process.stderr.write('diagnostic české selhání\\n');process.stdout.write('worker started\\n');process.exitCode=7;",
    ],
    cwd: f.root,
  });
  assert.equal(receipt.exitCode, 7);
  const messages: string[] = [];
  await reportNativeFailures(f.ctx.runDir, (message) => messages.push(message));
  assert.equal(messages.length, 1);
  assert.ok(messages[0].includes('"exitCode":7'));
  assert.ok(messages[0].includes(receipt.attemptId));
  assert.ok(messages[0].includes('"key":"diagnostic-failure"'));
  assert.ok(messages[0].includes("stderr.log:\ndiagnostic české selhání\n"));
  assert.ok(messages[0].includes("stdout.log:\nworker started\n"));
});

test("legacy acceptance upgrade after commit changes only run evidence and preserves the committed tree", async (t) => {
  const f = await legacyFixture(t);
  await git(f.root, "add", "--", "src/new.txt", "artifacts");
  await git(f.root, "commit", "-m", "legacy candidate");
  f.ctx.data.commitSha = await git(f.root, "rev-parse", "HEAD");
  f.ctx.data.commitIntent = {
    tree: await git(f.root, "show", "-s", "--format=%T", "HEAD"),
  };
  f.ctx.data.ciChecks = [
    { name: "verify", url: "fixture", checkId: 1, appId: 15368 },
  ];
  const before = await git(f.root, "status", "--porcelain=v1"),
    tree = f.ctx.data.commitIntent.tree;
  let accepts = 0;
  const adapter = createAdapter({
    worker: f.worker,
    github: {
      async accept(_ctx: any, body: string) {
        accepts++;
        assert.match(body, /Protocol 2 input-delivery evidence/);
        return { headSha: f.ctx.data.commitSha, baseSha: f.ctx.data.baseSha };
      },
    } as any,
    linear: { async comment() {}, async close() {} } as any,
  });
  await adapter.runStage("accept", f.ctx);
  assert.equal(accepts, 1);
  assert.equal(await git(f.root, "status", "--porcelain=v1"), before);
  assert.equal(await git(f.root, "show", "-s", "--format=%T", "HEAD"), tree);
  assert.equal(f.ctx.data.deliveryV2Published, undefined);
  assert.equal(
    f.ctx.data.acceptanceDeliverySha256,
    f.ctx.data.deliveryV2.proofSha256,
  );
});

test("production runWorker preserves typed runtime blockers and rejects zero-exit unperformed reviews without redispatch", async (t) => {
  const f = await fixture(t);
  await bmadFixture(f);
  await writeFile(path.join(f.root, "src/new.txt"), "candidate\n");
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
  f.ctx.supervise = nativeSupervisor(f.ctx);
  const executable = path.join(f.ctx.runDir, "blocked-model.mjs"),
    ledger = path.join(f.ctx.runDir, "blocked-starts");
  const blockedPlan = {
    ...validPlan(),
    ready: false,
    runtimeBlockers: ["Required source cannot be read"],
  };
  const unperformed =
    "Review stopped: the required instruction file was unreadable. No review was performed or files changed.";
  await writeFile(
    executable,
    `import fs from 'node:fs';process.stdin.resume();process.stdin.on('end',()=>{const args=process.argv.slice(2),out=args[args.indexOf('-o')+1];fs.appendFileSync(${JSON.stringify(ledger)},'start\\n');fs.writeFileSync(out,args.includes('--output-schema')?${JSON.stringify(JSON.stringify(blockedPlan))}:${JSON.stringify(unperformed)},'utf8');});`,
  );
  const launch = { command: process.execPath, prefixArgs: [executable] };
  const plan = await runWorker(f.ctx, { kind: "plan" }, launch);
  assert.equal(plan.provenance.deliveryProtocol, 2);
  assert.throws(() => assertPlanningReady(plan.result), {
    code: "RUNTIME_BLOCKERS",
  });
  await runWorker(f.ctx, { kind: "plan" }, launch);
  for (const lens of ["edge", "verification"]) {
    for (let replay = 0; replay < 2; replay++)
      await assert.rejects(
        runWorker(
          f.ctx,
          { kind: "review", lens, identity: source.digest },
          launch,
        ),
        { code: "REVIEW_OUTPUT" },
      );
    assert.equal(
      f.ctx.state.attempts[`review:v2:${lens}:${source.digest.slice(0, 32)}`]
        .status,
      "complete",
    );
  }
  assert.equal((await readFile(ledger, "utf8")).trim().split("\n").length, 3);
});

for (const boundary of ["before-intent", "after-intent", "after-dispatch"]) {
  test(`bounded delivery upgrade resumes ${boundary} with one immutable v2 attempt per role`, async (t) => {
    const f = await legacyFixture(t),
      originalBytes = await f.immutableBytes(),
      originalSave = f.ctx.save,
      originalEmit = f.ctx.emit;
    let faulted = false;
    if (boundary !== "after-dispatch")
      f.ctx.save = async (patch: any) => {
        if (patch.planReadinessInputV2 && !faulted) {
          faulted = true;
          if (boundary === "after-intent") await originalSave(patch);
          throw new Error("upgrade boundary interruption");
        }
        await originalSave(patch);
      };
    else
      f.ctx.emit = async (event: any) => {
        if (
          event.type === "supervisor-dispatched" &&
          event.key === "plan-readiness:v2" &&
          !faulted
        ) {
          faulted = true;
          throw new Error("upgrade boundary interruption");
        }
        return originalEmit(event);
      };
    const adapter = createAdapter({
      worker: f.worker,
      linear: { async comment() {}, async close() {} } as any,
    });
    let interrupted: any;
    try {
      await adapter.runStage("review", f.ctx);
    } catch (error) {
      interrupted = error;
    }
    f.ctx.save = originalSave;
    f.ctx.emit = originalEmit;
    let recordedRequest: string | undefined, recordedId: string | undefined;
    if (boundary === "after-dispatch") {
      recordedId = f.ctx.state.attempts["plan-readiness:v2"].id;
      const attemptDir = path.join(f.ctx.runDir, "attempts", recordedId!);
      recordedRequest = await readFile(
        path.join(attemptDir, "request.json"),
        "utf8",
      );
      await waitFor(async () => {
        try {
          return JSON.parse(
            await readFile(path.join(attemptDir, "receipt.json"), "utf8"),
          );
        } catch {
          return null;
        }
      }, "independent readiness receipt after controller interruption");
    } else assert.equal((await f.ledgerRows()).length, 0);
    assert.match(interrupted?.message ?? "", /upgrade boundary interruption/);
    await adapter.runStage("review", f.ctx);
    await adapter.runStage("review", f.ctx);
    assert.deepEqual(await f.immutableBytes(), originalBytes);
    const rows = await f.ledgerRows();
    assert.equal(rows.length, 4);
    assert.equal(
      rows.filter((row: any) => row.out.includes("plan-readiness")).length,
      1,
    );
    const v2Keys = Object.keys(f.ctx.state.attempts).filter(
      (key) => key.startsWith("review:v2:") || key === "plan-readiness:v2",
    );
    assert.equal(v2Keys.length, 4);
    assert.ok(
      v2Keys.every((key) => f.ctx.state.attempts[key].status === "complete"),
    );
    if (recordedId) {
      assert.equal(f.ctx.state.attempts["plan-readiness:v2"].id, recordedId);
      assert.equal(
        await readFile(
          path.join(f.ctx.runDir, "attempts", recordedId, "request.json"),
          "utf8",
        ),
        recordedRequest,
      );
    }
  });
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

test("adapter merge adopts an exact legacy merged PR before acceptance while fresh and stale candidates retain current guards", async (t) => {
  const f = await fixture(t),
    ctx = f.ctx,
    snapshot = await bmadFixture(f),
    branch = "codex/legacy-merge-fixture",
    github = new GitHubClient({ repository: "unit/repo" });
  // The fixture checks byte-frozen snapshot hashes across real checkouts.
  await git(f.root, "config", "core.autocrlf", "false");
  await git(f.root, "switch", "-c", branch);
  await writeFile(path.join(f.root, "src/new.txt"), "legacy merge candidate\n");
  const source = await sourceIdentity(
    f.root,
    ctx.data.baseSha,
    ctx.data.workerTask.writePaths,
  );
  Object.assign(ctx.data, {
    sourceDigest: source.digest,
    sourceDiffSha256: sha(source.diff),
    branch,
  });
  await writeFile(path.join(ctx.runDir, "source-diff.txt"), source.diff);
  await writeSpecification(ctx, snapshot, "in-review");
  await git(f.root, "add", "--", "src/new.txt", "artifacts");
  await git(f.root, "commit", "-m", "legacy reviewed candidate");
  ctx.data.commitSha = await git(f.root, "rev-parse", "HEAD");
  ctx.data.commitIntent = {
    tree: await git(f.root, "show", "-s", "--format=%T", "HEAD"),
  };
  await git(f.root, "switch", "main");
  await git(f.root, "merge", "--no-ff", "--no-edit", branch);
  const mergedSha = await git(f.root, "rev-parse", "HEAD");
  assert.equal(
    new Set([ctx.data.baseSha, ctx.data.commitSha, mergedSha]).size,
    3,
  );
  await git(f.root, "switch", branch);
  ctx.assignment.merge = true;
  ctx.data.prNumber = 9;
  ctx.data.acceptance = {
    headSha: ctx.data.commitSha,
    baseSha: ctx.data.baseSha,
  };
  ctx.data.ciChecks = [
    { name: "verify", url: "fixture", checkId: 1, appId: 15368 },
  ];
  let pr = freshPr({
      merged: true,
      merge_commit_sha: mergedSha,
      state: "closed",
      head: {
        sha: ctx.data.commitSha,
        ref: branch,
        repo: { full_name: "unit/repo" },
      },
      base: { sha: mergedSha, ref: "main", repo: { full_name: "unit/repo" } },
      body: "<!-- autodev:test -->\nLegacy acceptance evidence",
    }),
    currentBase = mergedSha,
    workers = 0,
    baseReads = 0;
  const requests: any[] = [];
  github.pr = async () => pr;
  github.branch = async () => {
    baseReads++;
    return { commit: { sha: currentBase } };
  };
  github.checks = async () => ctx.data.ciChecks;
  github.pages = async () => [];
  github.api = async (method: string, endpoint: string, body: any) => {
    requests.push({ method, endpoint, body });
    if (method === "PATCH") pr.body = body.body;
    return method === "PUT" ? { merged: true, sha: mergedSha } : {};
  };
  const adapter = createAdapter({
    github,
    worker: async (context: any, options: any) => {
      workers++;
      return cleanReview(context, options.lens);
    },
    linear: { async comment() {} } as any,
  });
  assert.deepEqual(await adapter.runStage("merge", ctx), {
    mergeSha: mergedSha,
  });
  assert.equal(workers, 0);
  assert.equal(baseReads, 0);
  assert.equal(requests.length, 0);
  assert.equal(ctx.data.acceptanceDeliverySha256, undefined);
  const currentHead = pr.head.sha;
  pr.head.sha = "4".repeat(40);
  await assert.rejects(adapter.runStage("merge", ctx), { code: "PR_IDENTITY" });
  pr.merged = false;
  await assert.rejects(adapter.runStage("merge", ctx), { code: "PR_IDENTITY" });
  pr.head.sha = currentHead;
  pr.state = "open";
  pr.base.sha = ctx.data.baseSha;
  await assert.rejects(adapter.runStage("merge", ctx), {
    code: "BASE_CHANGED",
  });
  assert.equal(requests.length, 0);
  currentBase = ctx.data.baseSha;
  ctx.data.acceptance.headSha = "5".repeat(40);
  await adapter.runStage("merge", ctx);
  assert.equal(
    workers,
    3,
    "All fresh review receipts are reused during refreshed acceptance",
  );
  assert.equal(ctx.data.acceptance.headSha, currentHead);
  assert.equal(
    ctx.data.acceptanceDeliverySha256,
    ctx.data.deliveryV2.proofSha256,
  );
  assert.deepEqual(
    requests.map((request) => request.method),
    ["PATCH", "POST", "PUT"],
  );
  assert.deepEqual(requests[2].body, {
    sha: currentHead,
    merge_method: "merge",
  });
  requests.length = 0;
  ctx.data.acceptance.headSha = "6".repeat(40);
  await assert.rejects(adapter.runStage("merge", ctx), {
    code: "ACCEPTANCE_CHANGED",
  });
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
      worker: async (_ctx: any, options: any) =>
        cleanReview(_ctx, options.lens),
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
