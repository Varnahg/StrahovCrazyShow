import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const STAGES = Object.freeze([
  "prepare",
  "plan",
  "implement",
  "review",
  "verify",
  "commit",
  "publish",
  "ci",
  "accept",
  "merge",
  "finalize",
]);

export function problem(code, message) {
  return Object.assign(new Error(message), { code });
}

export function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (object(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined)
    throw problem("INVALID_JSON", "State must contain JSON values only");
  return encoded;
}

export function digest(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : canonicalJson(value))
    .digest("hex");
}

export async function readJson(file, { optional = false } = {}) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    // undefined cannot be represented by valid JSON, unlike null/false/0/"".
    if (optional && error.code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw problem(
      "CORRUPT_STATE",
      `Invalid JSON in ${file}; preserved without resetting`,
    );
  }
}

// The temporary file lives beside the destination, so rename never crosses volumes.
// A failed write leaves the previous checkpoint intact. Orphan .tmp files are inert.
export async function atomicWriteJson(file, value) {
  const contents = `${canonicalJson(value)}\n`;
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporary, file);
    if (process.platform !== "win32") {
      const directory = await open(path.dirname(file), "r");
      try {
        await directory.sync();
      } finally {
        await directory.close();
      }
    }
  } catch (error) {
    await handle?.close().catch(() => {});
    await unlink(temporary).catch(() => {});
    throw error;
  }
}

export function validateRunId(runId) {
  if (
    typeof runId !== "string" ||
    !/^[a-z][a-z0-9-]{0,79}-[a-f0-9]{12}$/.test(runId)
  ) {
    throw problem(
      "INVALID_RUN_ID",
      "Expected a run ID returned by run, without paths or wildcards",
    );
  }
  return runId;
}

export async function repositoryContext(repo = process.cwd()) {
  const cwd = await realpath(path.resolve(repo));
  const git = async (...args) =>
    (
      await execFileAsync("git", ["-C", cwd, ...args], {
        windowsHide: true,
        encoding: "utf8",
        timeout: 30_000,
      })
    ).stdout.trim();
  const root = await realpath(await git("rev-parse", "--show-toplevel"));
  const commonDir = await realpath(
    path.resolve(cwd, await git("rev-parse", "--git-common-dir")),
  );
  const identity =
    process.platform === "win32" ? commonDir.toLowerCase() : commonDir;
  return {
    repo: root,
    commonDir,
    identity,
    runsDir: path.join(commonDir, "autodev", "runs"),
  };
}

export function makeRunId(repositoryIdentity, issue) {
  const canonicalIssue = issue.toUpperCase();
  return `${canonicalIssue.toLowerCase()}-${digest(`${repositoryIdentity}\0${canonicalIssue}`).slice(0, 12)}`;
}

function relativeFile(value, name) {
  if (
    typeof value !== "string" ||
    !value ||
    /[\\:*?\x00-\x1f]/.test(value) ||
    value.startsWith("/") ||
    value
      .split("/")
      .some(
        (part) =>
          !part ||
          part === "." ||
          part === ".." ||
          part.toLowerCase() === ".git",
      )
  ) {
    throw problem(
      "INVALID_ASSIGNMENT",
      `${name} must be a canonical repository-relative path`,
    );
  }
}

export function validateAssignment(value) {
  const fail = (message) => {
    throw problem("INVALID_ASSIGNMENT", message);
  };
  if (!object(value) || value.schemaVersion !== 1)
    fail("Assignment requires schemaVersion 1");
  const keys = new Set([
    "schemaVersion",
    "issue",
    "task",
    "workerTask",
    "validationTask",
    "repository",
    "baseBranch",
    "intentFile",
    "artifactDir",
    "handoffFile",
    "checks",
    "prTitle",
    "linearStates",
    "acceptance",
    "merge",
  ]);
  for (const key of Object.keys(value))
    if (!keys.has(key)) fail(`Unknown assignment field: ${key}`);
  if (
    typeof value.issue !== "string" ||
    !/^[A-Z][A-Z0-9]{0,39}-[1-9][0-9]{0,12}$/.test(value.issue)
  )
    fail("issue must be an explicit Linear identifier, e.g. KEY-47");
  for (const key of [
    "task",
    "workerTask",
    ...(value.validationTask === undefined ? [] : ["validationTask"]),
  ]) {
    if (
      typeof value[key] !== "string" ||
      !/^[a-z0-9][a-z0-9_-]{0,95}$/.test(value[key])
    )
      fail(`${key} must be an explicit project task ID`);
  }
  if (
    value.task === value.workerTask ||
    value.validationTask === value.task ||
    value.validationTask === value.workerTask
  )
    fail("Controller, worker and validation tasks must be distinct");
  if (
    typeof value.repository !== "string" ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)
  )
    fail("repository must be owner/name");
  if (
    typeof value.baseBranch !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9_./-]*$/.test(value.baseBranch) ||
    /\.\.|\/\/|\/$|\.$/.test(value.baseBranch)
  )
    fail("Invalid baseBranch");
  for (const key of ["intentFile", "artifactDir", "handoffFile"])
    relativeFile(value[key], key);
  if (
    typeof value.prTitle !== "string" ||
    !value.prTitle.trim() ||
    /[\x00-\x1f]/.test(value.prTitle)
  )
    fail("prTitle must be nonempty plain text");
  if (typeof value.merge !== "boolean")
    fail("merge must be explicitly true or false");
  if (
    !object(value.linearStates) ||
    ["active", "done"].some(
      (key) =>
        typeof value.linearStates[key] !== "string" ||
        !value.linearStates[key].trim(),
    )
  )
    fail("linearStates requires active and done names");
  if (
    !object(value.acceptance) ||
    value.acceptance.kind !== "cli" ||
    typeof value.acceptance.description !== "string" ||
    !value.acceptance.description.trim()
  )
    fail("V1 supports an explicit CLI acceptance description only");
  if (!Array.isArray(value.checks) || value.checks.length === 0)
    fail("At least one explicit check is required");
  const ids = new Set();
  for (const check of value.checks) {
    if (
      !object(check) ||
      typeof check.id !== "string" ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(check.id) ||
      ids.has(check.id)
    )
      fail("Check IDs must be unique lowercase identifiers");
    if (
      typeof check.command !== "string" ||
      !check.command.trim() ||
      check.command.includes("\0") ||
      !Array.isArray(check.args) ||
      check.args.some((arg) => typeof arg !== "string" || arg.includes("\0"))
    )
      fail(
        `Check ${check.id} requires command and string args (without a shell)`,
      );
    if (
      Object.keys(check).some((key) => !["id", "command", "args"].includes(key))
    )
      fail(`Unknown field in check ${check.id}`);
    ids.add(check.id);
  }
  canonicalJson(value);
  return value;
}

export async function loadAssignment(file, repo) {
  const assignmentPath = await realpath(path.resolve(repo, file));
  const assignment = validateAssignment(await readJson(assignmentPath));
  return { assignment, assignmentPath, assignmentDigest: digest(assignment) };
}

export function validateState(state, context, runId) {
  if (
    !object(state) ||
    state.schemaVersion !== 1 ||
    state.runId !== runId ||
    state.repositoryIdentity !== context.identity ||
    !["running", "stopped", "unknown", "complete"].includes(state.status) ||
    !STAGES.includes(state.stage) ||
    !object(state.data) ||
    !object(state.attempts) ||
    !Array.isArray(state.completedStages) ||
    state.completedStages.some((stage, index) => STAGES[index] !== stage) ||
    state.completedStages.length > STAGES.length ||
    typeof state.repo !== "string" ||
    typeof state.assignmentPath !== "string"
  ) {
    throw problem(
      "CORRUPT_STATE",
      "Run checkpoint has an invalid identity or stage sequence; preserved without resetting",
    );
  }
  validateAssignment(state.assignment);
  if (
    digest(state.assignment) !== state.assignmentDigest ||
    makeRunId(context.identity, state.assignment.issue) !== runId ||
    (state.status === "complete") !==
      (state.completedStages.length === STAGES.length) ||
    (state.status !== "complete" &&
      state.stage !== STAGES[state.completedStages.length])
  ) {
    throw problem(
      "CORRUPT_STATE",
      "Run assignment or stage checkpoint does not match its recorded identity",
    );
  }
  for (const [key, attempt] of Object.entries(state.attempts)) {
    if (
      !object(attempt) ||
      attempt.key !== key ||
      typeof attempt.id !== "string" ||
      !/^[a-f0-9]{24}$/.test(attempt.id) ||
      !["started", "complete"].includes(attempt.status) ||
      typeof attempt.requestDigest !== "string" ||
      typeof attempt.startedAt !== "string" ||
      !Number.isFinite(Date.parse(attempt.startedAt)) ||
      new Date(attempt.startedAt).toISOString() !== attempt.startedAt
    ) {
      throw problem(
        "CORRUPT_STATE",
        "Invalid process attempt checkpoint; preserved without resetting",
      );
    }
  }
  return state;
}
