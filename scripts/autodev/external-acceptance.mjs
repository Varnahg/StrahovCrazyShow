import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  canonicalJson,
  digest,
  object,
  problem,
  readJson,
  repositoryContext,
  validateAssignment,
} from "./store.mjs";
import { git, inScope, samePath, sourceIdentity } from "./source.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const execFileAsync = promisify(execFile);
const fail = (message, code = "EXTERNAL_ACCEPTANCE_INVALID") => {
  throw problem(code, message);
};
const exactKeys = (value, keys) =>
  object(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");
const sameNode = (before, after) =>
  before.dev === after.dev &&
  before.ino === after.ino &&
  before.isDirectory() === after.isDirectory() &&
  before.isFile() === after.isFile() &&
  !after.isSymbolicLink();
const sameFile = (before, after) =>
  sameNode(before, after) &&
  after.isFile() &&
  after.nlink === 1 &&
  before.size === after.size &&
  before.mtimeMs === after.mtimeMs &&
  before.ctimeMs === after.ctimeMs;

// Read original bytes through one handle; verify every directory and the file
// before and after reading. This does not follow symlinks/junctions or hardlinks.
export async function readAcceptanceFile(root, relative) {
  if (typeof relative !== "string")
    fail("Acceptance file path is required", "EXTERNAL_ACCEPTANCE_PATH");
  const absoluteRoot = path.resolve(root);
  if (!samePath(await realpath(absoluteRoot), absoluteRoot))
    fail("Acceptance root resolves elsewhere", "EXTERNAL_ACCEPTANCE_PATH");
  const parts = relative.split("/");
  if (
    !relative ||
    /[\\:*?\[\]{}\x00-\x1f]/.test(relative) ||
    relative.startsWith("/") ||
    parts.some(
      (part) =>
        !part ||
        part === "." ||
        part === ".." ||
        part.toLowerCase() === ".git" ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
    )
  )
    fail(
      "Acceptance path is not a canonical relative file",
      "EXTERNAL_ACCEPTANCE_PATH",
    );
  const chain = [];
  let current = absoluteRoot;
  for (let index = -1; index < parts.length; index++) {
    if (index >= 0) current = path.join(current, parts[index]);
    const stat = await lstat(current);
    const leaf = index === parts.length - 1;
    if (
      stat.isSymbolicLink() ||
      (leaf ? !stat.isFile() || stat.nlink !== 1 : !stat.isDirectory())
    )
      fail(
        "Acceptance path contains a link or nonregular file",
        "EXTERNAL_ACCEPTANCE_PATH",
      );
    chain.push({ file: current, stat });
  }
  const leaf = chain.at(-1);
  const handle = await open(
    leaf.file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = await handle.stat();
    if (!sameFile(leaf.stat, before))
      fail("Acceptance file changed before opening");
    const bytes = await handle.readFile();
    if (!sameFile(before, await handle.stat()))
      fail("Acceptance file changed while reading");
    for (const entry of chain) {
      const after = await lstat(entry.file);
      if (
        !(entry === leaf
          ? sameFile(entry.stat, after)
          : sameNode(entry.stat, after))
      )
        fail("Acceptance path changed while reading");
    }
    return { bytes, sha256: sha256(bytes) };
  } finally {
    await handle.close();
  }
}

export async function loadExternalAuthority(ctx, data = ctx.data) {
  if (ctx.assignment.acceptance?.kind !== "external") return null;
  validateAssignment(ctx.assignment);
  const { authority, receiptFile } = ctx.assignment.acceptance;
  const { stdout: bytes } = await execFileAsync(
    "git",
    [
      "-C",
      ctx.repo,
      "show",
      `${data.baseSha}:docs/agents/tasks/${authority.task}.json`,
    ],
    {
      encoding: "buffer",
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  let task;
  try {
    task = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail("External authority task is not valid UTF-8 JSON");
  }
  if (
    !object(task) ||
    task.schemaVersion !== 1 ||
    task.id !== authority.task ||
    task.status !== "ready" ||
    !Array.isArray(task.writePaths) ||
    !Array.isArray(task.resources) ||
    [...task.writePaths, ...task.resources].some(
      (entry) => typeof entry !== "string" || !entry,
    ) ||
    !inScope(receiptFile, task.writePaths)
  )
    fail(
      "External authority task does not reserve this receipt",
      "EXTERNAL_ACCEPTANCE_AUTHORITY",
    );
  if (
    [data.controllerTask, data.workerTask, data.validationTask]
      .filter(Boolean)
      .some((writer) => inScope(receiptFile, writer.writePaths))
  )
    fail(
      "External receipt is writable by this run",
      "EXTERNAL_ACCEPTANCE_AUTHORITY",
    );
  return { task, taskSha256: sha256(bytes) };
}

async function assertAuthority(ctx, frozen) {
  const { commonDir } = await repositoryContext(ctx.repo);
  const registry = await readJson(
    path.join(commonDir, "agent-coordination/claims.json"),
    { optional: true },
  );
  if (
    !object(registry) ||
    registry.schemaVersion !== 1 ||
    !Array.isArray(registry.claims)
  )
    fail(
      "No valid external authority claim registry",
      "EXTERNAL_ACCEPTANCE_AUTHORITY",
    );
  const { authority, receiptFile } = ctx.assignment.acceptance;
  const matches = registry.claims.filter(
    (claim) => claim?.task === authority.task,
  );
  const claim = matches[0];
  if (
    matches.length !== 1 ||
    !object(claim) ||
    claim.owner !== authority.owner ||
    typeof claim.worktree !== "string" ||
    !path.isAbsolute(claim.worktree) ||
    !samePath(claim.worktree, ctx.repo) ||
    !/^[a-f0-9]{40,64}$/.test(claim.baseHead ?? "") ||
    canonicalJson(claim.writePaths ?? null) !==
      canonicalJson(frozen.task.writePaths) ||
    canonicalJson(claim.resources ?? null) !==
      canonicalJson(frozen.task.resources) ||
    !inScope(receiptFile, claim.writePaths)
  )
    fail(
      "External authority must hold its exact frozen scope in the coordinator checkout",
      "EXTERNAL_ACCEPTANCE_AUTHORITY",
    );
  // The coordinator may have claimed before the run's base commit. The claim's
  // baseHead is therefore not the candidate baseSha, and is not rewritten here.
}

function validateReceipt(ctx, frozen, receipt) {
  const keys = [
    "schemaVersion",
    "kind",
    "decision",
    "runId",
    "assignmentDigest",
    "baseSha",
    "commitSha",
    "sourceDigest",
    "authority",
    "issuedAt",
    "summary",
    "evidence",
  ];
  if (
    !exactKeys(receipt, keys) ||
    receipt.schemaVersion !== 1 ||
    receipt.kind !== "external-acceptance" ||
    !["pass", "fail"].includes(receipt.decision) ||
    typeof receipt.summary !== "string" ||
    !receipt.summary.trim() ||
    typeof receipt.issuedAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.issuedAt)) ||
    new Date(receipt.issuedAt).toISOString() !== receipt.issuedAt
  )
    fail("Malformed external acceptance receipt");
  for (const [key, expected] of Object.entries({
    runId: ctx.runId,
    assignmentDigest: ctx.state.assignmentDigest,
    baseSha: ctx.data.baseSha,
    commitSha: ctx.data.commitSha,
    sourceDigest: ctx.data.sourceDigest,
  }))
    if (receipt[key] !== expected)
      fail(`External receipt ${key} differs from this candidate`);
  const authority = {
    ...ctx.assignment.acceptance.authority,
    taskSha256: frozen.taskSha256,
  };
  if (
    !exactKeys(receipt.authority, ["task", "owner", "taskSha256"]) ||
    canonicalJson(receipt.authority) !== canonicalJson(authority)
  )
    fail(
      "External receipt authority differs from the frozen task",
      "EXTERNAL_ACCEPTANCE_AUTHORITY",
    );
  const expected = ctx.assignment.acceptance.evidenceFiles;
  if (
    !Array.isArray(receipt.evidence) ||
    receipt.evidence.length !== expected.length ||
    receipt.evidence.some(
      (entry, index) =>
        !exactKeys(entry, ["id", "path", "sha256"]) ||
        entry.id !== expected[index].id ||
        entry.path !== expected[index].path ||
        !/^[a-f0-9]{64}$/.test(entry.sha256 ?? ""),
    )
  )
    fail("External receipt evidence differs from the immutable manifest list");
  if (receipt.decision !== "pass")
    fail(
      "External coordinator rejected this candidate",
      "EXTERNAL_ACCEPTANCE_REJECTED",
    );
}

export async function ensureExternalAcceptance(
  ctx,
  { requirePinned = false } = {},
) {
  if (ctx.assignment.acceptance?.kind !== "external") return null;
  validateAssignment(ctx.assignment);
  if (
    digest(ctx.assignment) !== ctx.state.assignmentDigest ||
    !/^[a-f0-9]{40}$/.test(ctx.data.baseSha ?? "") ||
    !/^[a-f0-9]{40}$/.test(ctx.data.commitSha ?? "") ||
    !/^[a-f0-9]{64}$/.test(ctx.data.sourceDigest ?? "")
  )
    fail("Candidate/assignment identity is incomplete");
  const frozen = await loadExternalAuthority(ctx);
  if (
    canonicalJson(ctx.data.externalAuthority ?? null) !== canonicalJson(frozen)
  )
    fail(
      "External authority was not frozen from the run base",
      "EXTERNAL_ACCEPTANCE_AUTHORITY",
    );
  await assertAuthority(ctx, frozen);
  const pinned = ctx.data.externalAcceptance;
  if (!pinned && (requirePinned || ctx.data.acceptance || ctx.data.mergeIntent))
    fail(
      "External acceptance has not been pinned",
      "EXTERNAL_ACCEPTANCE_CHANGED",
    );
  const read = async (relative, receipt = false) => {
    try {
      return await readAcceptanceFile(ctx.repo, relative);
    } catch (error) {
      if (error.code === "ENOENT")
        fail(
          `External ${receipt ? "receipt" : "evidence"} is missing: ${relative}`,
          pinned
            ? "EXTERNAL_ACCEPTANCE_CHANGED"
            : receipt
              ? "EXTERNAL_ACCEPTANCE_PENDING"
              : "EXTERNAL_ACCEPTANCE_INVALID",
        );
      throw error;
    }
  };
  const original = await read(ctx.assignment.acceptance.receiptFile, true);
  if (pinned && original.sha256 !== pinned.receiptSha256)
    fail(
      "External receipt bytes changed after pinning",
      "EXTERNAL_ACCEPTANCE_CHANGED",
    );
  let receipt;
  try {
    receipt = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(original.bytes),
    );
  } catch {
    fail("External receipt is not JSON; preserved");
  }
  validateReceipt(ctx, frozen, receipt);
  const verifyEvidence = async () => {
    for (const entry of receipt.evidence) {
      if ((await read(entry.path)).sha256 !== entry.sha256)
        fail(
          `External evidence bytes changed: ${entry.id}`,
          "EXTERNAL_ACCEPTANCE_CHANGED",
        );
    }
  };
  await verifyEvidence();
  // Receipt is a cooperative acceptance of the committed, reviewed source. A
  // direct GitHub client call must not silently accept a modified worktree.
  if (
    (await git(ctx.data.worktree, "rev-parse", "HEAD")).trim() !==
      ctx.data.commitSha ||
    (
      await sourceIdentity(
        ctx.data.worktree,
        ctx.data.baseSha,
        ctx.data.workerTask.writePaths,
      )
    ).digest !== ctx.data.sourceDigest
  )
    fail("External acceptance candidate source changed", "SOURCE_CHANGED");
  await assertAuthority(ctx, frozen);
  if (
    (await read(ctx.assignment.acceptance.receiptFile, true)).sha256 !==
    original.sha256
  )
    fail(
      "External receipt changed during validation",
      "EXTERNAL_ACCEPTANCE_CHANGED",
    );
  // Source identity and authority checks await external work. Evidence read
  // before those waits is not evidence of the bytes at the mutation boundary.
  await verifyEvidence();
  const proof = {
    receiptFile: ctx.assignment.acceptance.receiptFile,
    receiptSha256: original.sha256,
    ...receipt,
  };
  if (pinned && canonicalJson(pinned) !== canonicalJson(proof))
    fail(
      "Pinned external acceptance differs from this proof",
      "EXTERNAL_ACCEPTANCE_CHANGED",
    );
  if (!pinned) await ctx.save({ externalAcceptance: proof });
  return proof;
}

export function externalProofDigest(proof) {
  return proof ? digest(proof) : null;
}

export function externalAcceptanceBody(proof) {
  if (!proof) return "";
  return `\n\nExternal acceptance: ${proof.summary}\nReceipt SHA256: ${proof.receiptSha256}\nAuthority: ${proof.authority.task} (${proof.authority.owner}; task ${proof.authority.taskSha256})\nIssued: ${proof.issuedAt}\n${proof.evidence.map((entry) => `- ${entry.id}: ${entry.path} — ${entry.sha256}`).join("\n")}\n`;
}
