import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  rm,
  link,
  symlink,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { writeFileSync } from "node:fs";
const { GitHubClient, execute } = await import(
  new URL("../scripts/autodev/github.mjs", import.meta.url).href
);
const { createAdapter } = await import(
  new URL("../scripts/autodev/adapters.mjs", import.meta.url).href
);
const { ensureExternalAcceptance, loadExternalAuthority, readAcceptanceFile } =
  await import(
    new URL("../scripts/autodev/external-acceptance.mjs", import.meta.url).href
  );
const { digest } = await import(
  new URL("../scripts/autodev/store.mjs", import.meta.url).href
);
const { sourceIdentity } = await import(
  new URL("../scripts/autodev/source.mjs", import.meta.url).href
);
const sha = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
const git = async (root: string, ...args: string[]) =>
  (await execute("git", ["-C", root, ...args], { cwd: root })).stdout.trim();

async function fixture(t: TestContext) {
  const root = await mkdtemp(path.join(tmpdir(), "autodev-external-"));
  t.after(async () => {
    assert.ok(root.startsWith(path.join(tmpdir(), "autodev-external-")));
    await rm(root, { recursive: true, force: true });
  });
  await mkdir(path.join(root, "docs/agents/tasks"), { recursive: true });
  await mkdir(path.join(root, "scripts"));
  await mkdir(path.join(root, "evidence"));
  await copyFile(
    new URL("../scripts/agent-tasks.mjs", import.meta.url),
    path.join(root, "scripts/agent-tasks.mjs"),
  );
  const task = (id: string, writePaths: string[]) => ({
    schemaVersion: 1,
    id,
    title: id,
    status: "ready",
    writePaths,
    resources: [],
    dependsOn: [],
    acceptance: ["fixture"],
    verification: ["fixture"],
    notes: [],
  });
  const controllerTask = task("controller", ["artifacts/", "handoff.md"]),
    workerTask = task("worker", ["source.txt"]),
    authorityTask = task("authority", ["evidence/"]);
  for (const item of [controllerTask, workerTask, authorityTask])
    await writeFile(
      path.join(root, `docs/agents/tasks/${item.id}.json`),
      JSON.stringify(item),
    );
  await writeFile(path.join(root, "source.txt"), "base\n");
  await writeFile(path.join(root, ".gitignore"), "evidence/\n");
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "Fixture");
  await git(root, "config", "user.email", "fixture@example.invalid");
  await git(root, "config", "core.autocrlf", "false");
  await git(
    root,
    "add",
    "--",
    "source.txt",
    ".gitignore",
    "scripts/agent-tasks.mjs",
    "docs/agents/tasks",
  );
  await git(root, "commit", "-m", "base");
  const baseSha = await git(root, "rev-parse", "HEAD");
  for (const [id, owner] of [
    ["controller", "autodev:test"],
    ["worker", "autodev:test:worker"],
    ["authority", "coordinator"],
  ])
    await execute(
      process.execPath,
      ["scripts/agent-tasks.mjs", "claim", "--task", id, "--owner", owner],
      { cwd: root },
    );
  await writeFile(path.join(root, "source.txt"), "candidate\n");
  const sourceDigest = (
    await sourceIdentity(root, baseSha, workerTask.writePaths)
  ).digest;
  await git(root, "add", "--", "source.txt");
  await git(root, "commit", "-m", "candidate");
  const assignment = {
    schemaVersion: 1,
    issue: "KEY-54",
    task: "controller",
    workerTask: "worker",
    repository: "unit/repo",
    baseBranch: "main",
    intentFile: "intent.md",
    artifactDir: "artifacts",
    handoffFile: "handoff.md",
    prTitle: "fixture",
    checks: [{ id: "test", command: "node", args: [] }],
    linearStates: { active: "Active", done: "Done" },
    merge: true,
    acceptance: {
      kind: "external",
      description: "Comparable A/B",
      authority: { task: "authority", owner: "coordinator" },
      receiptFile: "evidence/acceptance.json",
      evidenceFiles: [{ id: "ab", path: "evidence/ab.bin" }],
    },
  };
  const data: any = {
    worktree: root,
    baseSha,
    commitSha: await git(root, "rev-parse", "HEAD"),
    sourceDigest,
    controllerTask,
    workerTask,
    validationTask: null,
    branch: "main",
    prNumber: 9,
    owner: "autodev:test",
    workerOwner: "autodev:test:worker",
  };
  const ctx: any = {
    repo: root,
    runId: "fixture",
    assignment,
    data,
    state: { assignmentDigest: digest(assignment), data },
    async save(patch: any) {
      Object.assign(data, patch);
    },
  };
  data.externalAuthority = await loadExternalAuthority(ctx);
  const evidence = Buffer.from([0, 255, 13, 10, 128, 0]);
  await writeFile(path.join(root, "evidence/ab.bin"), evidence);
  const receipt = () => ({
    schemaVersion: 1,
    kind: "external-acceptance",
    decision: "pass",
    runId: ctx.runId,
    assignmentDigest: ctx.state.assignmentDigest,
    baseSha,
    commitSha: data.commitSha,
    sourceDigest: data.sourceDigest,
    authority: {
      ...assignment.acceptance.authority,
      taskSha256: data.externalAuthority.taskSha256,
    },
    issuedAt: "2026-10-20T20:00:00.000Z",
    summary: "Comparable production A/B accepted",
    evidence: [{ id: "ab", path: "evidence/ab.bin", sha256: sha(evidence) }],
  });
  const receiptFile = path.join(root, assignment.acceptance.receiptFile);
  const issue = async (value = receipt()) =>
    writeFile(receiptFile, JSON.stringify(value));
  const registryFile = path.join(root, ".git/agent-coordination/claims.json");
  return { root, ctx, data, receipt, issue, receiptFile, registryFile };
}

test("external proof waits without mutation, pins exact bytes once, and preserves original binary evidence", async (t) => {
  const f = await fixture(t);
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_PENDING",
  });
  assert.equal(f.data.externalAcceptance, undefined);
  await f.issue();
  const original = await readFile(f.receiptFile);
  const proof = await ensureExternalAcceptance(f.ctx);
  assert.equal(proof.receiptSha256, sha(original));
  assert.deepEqual(
    await ensureExternalAcceptance(f.ctx, { requirePinned: true }),
    proof,
  );
  assert.equal((await readFile(f.receiptFile)).equals(original), true);
  await writeFile(f.receiptFile, Buffer.concat([original, Buffer.from("\n")]));
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_CHANGED",
  });
});

test("external receipt rejects fail, unknown fields and mismatched candidate identities without pinning", async (t) => {
  const f = await fixture(t);
  const variants: any[] = [
    { decision: "fail" },
    { extra: true },
    { schemaVersion: 2 },
    { runId: "other" },
    { assignmentDigest: "0".repeat(64) },
    { baseSha: "0".repeat(40) },
    { commitSha: "0".repeat(40) },
    { sourceDigest: "0".repeat(64) },
    { summary: " " },
    { issuedAt: "yesterday" },
    { authority: { ...f.receipt().authority, owner: "worker" } },
    { authority: { ...f.receipt().authority, taskSha256: "0".repeat(64) } },
    { evidence: [] },
    { evidence: [{ ...f.receipt().evidence[0], path: "../outside" }] },
    { evidence: [{ ...f.receipt().evidence[0], id: "other" }] },
    { evidence: [{ ...f.receipt().evidence[0], ignored: true }] },
  ];
  for (const patch of variants) {
    await f.issue({ ...f.receipt(), ...patch });
    const original = await readFile(f.receiptFile, "utf8");
    await assert.rejects(
      ensureExternalAcceptance(f.ctx),
      /External|external|Malformed/,
    );
    assert.equal(f.data.externalAcceptance, undefined);
    assert.equal(await readFile(f.receiptFile, "utf8"), original);
  }
  await writeFile(f.receiptFile, "{broken");
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_INVALID",
  });
});

test("external authority requires live exact owner, worktree and frozen scope but not equal baseHead", async (t) => {
  const f = await fixture(t);
  await f.issue();
  const original = JSON.parse(await readFile(f.registryFile, "utf8"));
  for (const patch of [
    { owner: "other" },
    { worktree: path.dirname(f.root) },
    { writePaths: ["evidence/acceptance.json"] },
    { resources: ["gpu"] },
  ]) {
    const changed = structuredClone(original);
    Object.assign(
      changed.claims.find((claim: any) => claim.task === "authority"),
      patch,
    );
    await writeFile(f.registryFile, JSON.stringify(changed));
    await assert.rejects(ensureExternalAcceptance(f.ctx), {
      code: "EXTERNAL_ACCEPTANCE_AUTHORITY",
    });
  }
  const missing = structuredClone(original);
  missing.claims = missing.claims.filter(
    (claim: any) => claim.task !== "authority",
  );
  await writeFile(f.registryFile, JSON.stringify(missing));
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_AUTHORITY",
  });
  const changed = structuredClone(original);
  changed.claims.find((claim: any) => claim.task === "authority").baseHead =
    "b".repeat(40);
  await writeFile(f.registryFile, JSON.stringify(changed));
  assert.ok(await ensureExternalAcceptance(f.ctx));
});

test("external authority must be pinned from base and receipt cannot be a worker output", async (t) => {
  const f = await fixture(t);
  await f.issue();
  f.data.externalAuthority.taskSha256 = "0".repeat(64);
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_AUTHORITY",
  });
  f.data.workerTask.writePaths.push("evidence/");
  await assert.rejects(loadExternalAuthority(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_AUTHORITY",
  });
});

test("external authority uses original base bytes despite distinct HEAD and working task definitions", async (t) => {
  const f = await fixture(t),
    file = path.join(f.root, "docs/agents/tasks/authority.json");
  const baseBytes = await readFile(file),
    baseTask = JSON.parse(baseBytes.toString("utf8"));
  const headTask = {
    ...baseTask,
    title: "HEAD authority definition",
    notes: ["HEAD differs"],
  };
  await writeFile(file, `${JSON.stringify(headTask, null, 2)}\n`);
  await git(f.root, "add", "--", "docs/agents/tasks/authority.json");
  await git(f.root, "commit", "-m", "HEAD authority differs from frozen base");
  const headBytes = (
    await execute(
      "git",
      ["-C", f.root, "show", "HEAD:docs/agents/tasks/authority.json"],
      { cwd: f.root },
    )
  ).stdout;
  const workingTask = {
    ...baseTask,
    title: "Uncommitted authority definition",
    notes: ["working copy differs"],
  };
  await writeFile(file, JSON.stringify(workingTask));
  const loaded = await loadExternalAuthority(f.ctx);
  assert.deepEqual(loaded.task, baseTask);
  assert.equal(loaded.taskSha256, sha(baseBytes));
  assert.notEqual(loaded.taskSha256, sha(headBytes));
  assert.notEqual(loaded.taskSha256, sha(await readFile(file)));
  assert.deepEqual(JSON.parse(headBytes), headTask);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), workingTask);
});

test("external evidence is rechecked after asynchronous source verification before pinning", async (t) => {
  const f = await fixture(t);
  await f.issue();
  const receiptBytes = await readFile(f.receiptFile),
    evidenceFile = path.join(f.root, "evidence/ab.bin");
  const spawn = childProcess.spawn;
  let changed = false;
  t.mock.method(childProcess, "spawn", (...args: any[]) => {
    if (
      args[0] === "git" &&
      args[1].includes("--binary") &&
      args[1].includes(f.root)
    ) {
      changed = true;
      writeFileSync(evidenceFile, "changed during sourceIdentity");
    }
    return Reflect.apply(spawn, childProcess, args);
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(ensureExternalAcceptance(f.ctx), {
      code: "EXTERNAL_ACCEPTANCE_CHANGED",
    });
    assert.equal(
      changed,
      true,
      "mutation occurred after the first evidence read, during the real Git diff",
    );
    assert.equal(f.data.externalAcceptance, undefined);
    assert.equal(
      await readFile(evidenceFile, "utf8"),
      "changed during sourceIdentity",
    );
    assert.equal((await readFile(f.receiptFile)).equals(receiptBytes), true);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

test("receipt and evidence reject links, hardlinks and every unsafe path without deleting anything", async (t) => {
  const f = await fixture(t);
  for (const relative of [
    "../escape",
    "/absolute",
    "C:/absolute",
    "evidence\\ab.bin",
    "evidence//ab.bin",
    "evidence/./ab.bin",
    ".git/config",
    "evidence/a*",
    "evidence/NUL",
    "evidence/a.",
  ])
    await assert.rejects(readAcceptanceFile(f.root, relative), {
      code: "EXTERNAL_ACCEPTANCE_PATH",
    });
  await f.issue();
  const original = await readFile(f.receiptFile);
  await link(f.receiptFile, path.join(f.root, "evidence/copy.json"));
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_PATH",
  });
  assert.equal((await readFile(f.receiptFile)).equals(original), true);
  await unlink(path.join(f.root, "evidence/copy.json"));
  const linked = path.join(f.root, "linked");
  await symlink(
    path.join(f.root, "evidence"),
    linked,
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(readAcceptanceFile(f.root, "linked/ab.bin"), {
    code: "EXTERNAL_ACCEPTANCE_PATH",
  });
  await link(
    path.join(f.root, "evidence/ab.bin"),
    path.join(f.root, "evidence/copy.bin"),
  );
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_PATH",
  });
});

test("pinned proof cannot be replaced or survive changed/missing evidence or changed source", async (t) => {
  const f = await fixture(t);
  await f.issue();
  await ensureExternalAcceptance(f.ctx);
  const file = path.join(f.root, "evidence/ab.bin"),
    original = await readFile(file);
  await writeFile(file, "changed");
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_CHANGED",
  });
  await unlink(file);
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_CHANGED",
  });
  await writeFile(file, original);
  await writeFile(path.join(f.root, "source.txt"), "unreviewed\n");
  await assert.rejects(ensureExternalAcceptance(f.ctx), {
    code: "SOURCE_CHANGED",
  });
});

function github(f: any) {
  const client = new GitHubClient({ repository: "unit/repo" });
  const pr: any = {
    number: 9,
    state: "open",
    draft: false,
    merged: false,
    html_url: "https://github.com/unit/repo/pull/9",
    body: `<!-- autodev:${f.ctx.runId} -->`,
    head: {
      sha: f.data.commitSha,
      ref: "main",
      repo: { full_name: "unit/repo" },
    },
    base: {
      sha: f.data.baseSha,
      ref: "main",
      repo: { full_name: "unit/repo" },
    },
  };
  const mutations: any[] = [],
    statuses: any[] = [];
  client.pr = async () => pr;
  client.branch = async () => ({ commit: { sha: f.data.baseSha } });
  client.checks = async () => [
    { name: "verify" },
    { name: "source-secret-hygiene" },
  ];
  client.pages = async () => statuses;
  client.api = async (method: string, endpoint: string, body: any) => {
    if (method === "GET")
      return {
        sha: pr.merge_commit_sha,
        parents: [{ sha: f.data.baseSha }, { sha: f.data.commitSha }],
      };
    assert.ok(f.data.externalAcceptance, "proof pinned before first mutation");
    mutations.push({ method, endpoint, body });
    if (method === "PATCH") pr.body = body.body;
    if (method === "POST") statuses.unshift(body);
    if (method === "PUT") {
      pr.merged = true;
      pr.merge_commit_sha = "f".repeat(40);
      return { merged: true, sha: pr.merge_commit_sha };
    }
    return {};
  };
  return { client, pr, mutations };
}

test("direct GitHub accept waits for proof, publishes it once, and prevents merge after evidence tamper", async (t) => {
  const f = await fixture(t),
    remote = github(f);
  await assert.rejects(remote.client.accept(f.ctx, "review"), {
    code: "EXTERNAL_ACCEPTANCE_PENDING",
  });
  assert.equal(remote.mutations.length, 0);
  await f.issue();
  f.data.acceptance = await remote.client.accept(f.ctx, "review");
  assert.ok(remote.pr.body.includes(f.data.externalAcceptance.receiptSha256));
  assert.deepEqual(
    f.data.acceptance.externalAcceptance,
    f.data.externalAcceptance,
  );
  await remote.client.accept(f.ctx, "review");
  assert.equal(remote.mutations.length, 2);
  await writeFile(path.join(f.root, "evidence/ab.bin"), "changed");
  await assert.rejects(remote.client.merge(f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_CHANGED",
  });
  assert.equal(remote.mutations.length, 2);
});

test("GitHub rechecks external proof at each mutation boundary, including after PR body update", async (t) => {
  const f = await fixture(t),
    remote = github(f);
  await f.issue();
  const api = remote.client.api.bind(remote.client);
  remote.client.api = async (method: string, endpoint: string, body: any) => {
    const result = await api(method, endpoint, body);
    if (method === "PATCH") await writeFile(f.receiptFile, "changed");
    return result;
  };
  await assert.rejects(remote.client.accept(f.ctx, "review"), {
    code: "EXTERNAL_ACCEPTANCE_CHANGED",
  });
  assert.deepEqual(
    remote.mutations.map((item) => item.method),
    ["PATCH"],
  );
});

test("external merge recovery requires original proof-bound intent and exact remote merge parents", async (t) => {
  const f = await fixture(t),
    remote = github(f);
  await f.issue();
  f.data.acceptance = await remote.client.accept(f.ctx, "review");
  const api = remote.client.api.bind(remote.client);
  remote.client.api = async (method: string, endpoint: string, body: any) => {
    const result = await api(method, endpoint, body);
    if (method === "PUT") throw new Error("crash after remote merge");
    return result;
  };
  await assert.rejects(remote.client.merge(f.ctx), /crash/);
  assert.deepEqual(
    f.data.mergeIntent.externalAcceptance,
    f.data.externalAcceptance,
  );
  assert.equal(await remote.client.merge(f.ctx), "f".repeat(40));
  assert.equal(
    remote.mutations.filter((item) => item.method === "PUT").length,
    1,
  );
  const intent = f.data.mergeIntent;
  delete f.data.mergeIntent;
  await assert.rejects(remote.client.merge(f.ctx), { code: "MERGE_IDENTITY" });
  f.data.mergeIntent = intent;
  remote.client.api = async () => ({
    sha: "f".repeat(40),
    parents: [{ sha: "0".repeat(40) }, { sha: f.data.commitSha }],
  });
  await assert.rejects(remote.client.merge(f.ctx), { code: "MERGE_IDENTITY" });
});

test("adapter external boundaries wait before injected GitHub accept and merge=false still requires proof", async (t) => {
  const f = await fixture(t);
  let effects = 0;
  const adapter = createAdapter({
    github: {
      async accept() {
        effects++;
      },
      async merge() {
        effects++;
      },
    },
    linear: {},
  });
  await assert.rejects(adapter.runStage("accept", f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_PENDING",
  });
  f.ctx.assignment.merge = false;
  f.ctx.state.assignmentDigest = digest(f.ctx.assignment);
  await assert.rejects(adapter.runStage("merge", f.ctx), {
    code: "EXTERNAL_ACCEPTANCE_CHANGED",
  });
  assert.equal(effects, 0);
  await f.issue();
  await ensureExternalAcceptance(f.ctx);
  assert.deepEqual(await adapter.runStage("merge", f.ctx), {
    awaitingMerge: true,
  });
  assert.equal(effects, 0);
});

test("fresh external merge verifies remote parents and adapter reconciliation cannot bypass its intent", async (t) => {
  const f = await fixture(t),
    remote = github(f);
  await f.issue();
  f.data.acceptance = await remote.client.accept(f.ctx, "review");
  const api = remote.client.api.bind(remote.client);
  remote.client.api = async (method: string, endpoint: string, body: any) =>
    method === "GET"
      ? {
          sha: "f".repeat(40),
          parents: [{ sha: "e".repeat(40) }, { sha: f.data.commitSha }],
        }
      : api(method, endpoint, body);
  await assert.rejects(remote.client.merge(f.ctx), { code: "MERGE_IDENTITY" });
  assert.equal(
    remote.mutations.filter((item) => item.method === "PUT").length,
    1,
  );
  remote.client.api = api;
  const adapter = createAdapter({ github: remote.client, linear: {} });
  assert.deepEqual(await adapter.runStage("merge", f.ctx), {
    mergeSha: "f".repeat(40),
  });
  delete f.data.mergeIntent;
  await assert.rejects(adapter.runStage("merge", f.ctx), {
    code: "MERGE_IDENTITY",
  });
  assert.equal(
    remote.mutations.filter((item) => item.method === "PUT").length,
    1,
  );
});
