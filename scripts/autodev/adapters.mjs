import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import {
  lstat,
  readFile,
  mkdir,
  writeFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import {
  atomicWriteJson,
  canonicalJson,
  digest,
  problem,
  readJson,
  repositoryContext,
  object,
} from "./store.mjs";
import { execute, GitHubClient } from "./github.mjs";
import { LinearClient } from "./linear.mjs";
import {
  runWorker,
  loadBmadSnapshot,
  renderSpecification,
  specIdentity,
  validateWorkerResult,
  assertPlanningReady,
  planningInputHashes,
  resumeWorkerAttempt,
  parseReviewResult,
  DELIVERY_PROTOCOL,
} from "./codex.mjs";

const execFileAsync = promisify(execFile);
async function atomicText(file, text) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, {
      encoding: "utf8",
      flag: "wx",
      flush: true,
    });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

function assertSpecCompletion(ctx) {
  if (
    typeof ctx.data.sourceDigest !== "string" ||
    ctx.data.verifiedSourceDigest !== ctx.data.sourceDigest ||
    ctx.data.checks?.length !== ctx.assignment.checks.length ||
    ctx.data.checks.some(
      (check, index) =>
        check.id !== ctx.assignment.checks[index].id || check.exitCode !== 0,
    )
  )
    throw problem(
      "BMAD_SPEC",
      "Done requires persisted successful checks for this source identity",
    );
}

export async function reconcileSpecification(ctx) {
  const recorded = ctx.data.spec;
  if (!recorded?.pendingStatus) return;
  const pending = recorded.pendingStatus;
  if (
    !object(pending) ||
    pending.fromSha256 !== (recorded.created ? recorded.sha256 : null) ||
    !/^[a-f0-9]{64}$/.test(pending.toSha256 ?? "") ||
    !["draft", "ready-for-dev", "in-progress", "in-review", "done"].includes(
      pending.status,
    )
  )
    throw problem("BMAD_SPEC", "Invalid pending specification status intent");
  let text;
  try {
    text = await readFile(ctx.data.specFile, "utf8");
  } catch (error) {
    if (
      error.code === "ENOENT" &&
      !recorded.created &&
      pending.fromSha256 === null
    )
      return;
    throw error;
  }
  const identity = specIdentity(text);
  if (
    identity.frozenSha256 !== recorded.frozenSha256 ||
    identity.bodySha256 !== recorded.bodySha256
  )
    throw problem(
      "BMAD_SPEC",
      "Pending status cannot adopt a changed specification body",
    );
  if (identity.sha256 === pending.toSha256) {
    if (
      /^status: '(draft|ready-for-dev|in-progress|in-review|done)'$/m.exec(
        text,
      )?.[1] !== pending.status
    )
      throw problem(
        "BMAD_SPEC",
        "Pending specification status disagrees with its exact target",
      );
    if (pending.status === "done") assertSpecCompletion(ctx);
    await ctx.save({
      spec: {
        ...recorded,
        ...identity,
        status: pending.status,
        created: true,
        pendingStatus: null,
      },
    });
  } else if (identity.sha256 !== pending.fromSha256)
    throw problem(
      "BMAD_SPEC",
      "Specification differs from both recorded status-transition endpoints",
    );
}

async function recordedSpecificationText(ctx, { allowInitial = false } = {}) {
  await reconcileSpecification(ctx);
  const recorded = ctx.data.spec;
  let text;
  try {
    text = await readFile(ctx.data.specFile, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    if (!allowInitial || recorded?.created !== false)
      throw problem("BMAD_SPEC", "Previously created specification is missing");
    text = recorded.initialText;
  }
  const identity = specIdentity(text);
  if (
    identity.sha256 !== recorded?.sha256 ||
    identity.bodySha256 !== recorded?.bodySha256 ||
    identity.frozenSha256 !== recorded?.frozenSha256
  )
    throw problem(
      "BMAD_SPEC",
      "Specification changed outside its controller checkpoint",
    );
  return text;
}

export async function writeSpecification(ctx, snapshot, requestedStatus) {
  await reconcileSpecification(ctx);
  if (requestedStatus === "done") assertSpecCompletion(ctx);
  const relative = `${ctx.assignment.artifactDir}/spec.md`;
  if (!inScope(relative, ctx.data.controllerTask.writePaths))
    throw problem(
      "SCOPE_VIOLATION",
      "Specification path is not controller-owned",
    );
  const file = await safePath(ctx.data.worktree, relative);
  let existing;
  try {
    existing = await readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (!ctx.data.spec) {
    if (existing !== undefined)
      throw problem(
        "BMAD_SPEC",
        "Unrecorded specification exists; refusing to overwrite it",
      );
    const initialText = renderSpecification(
      ctx,
      snapshot,
      ctx.data.plan.result,
    );
    await ctx.save({
      specFile: file,
      spec: { ...specIdentity(initialText), initialText, created: false },
    });
  }
  const recorded = ctx.data.spec;
  if (ctx.data.specFile !== file)
    throw problem(
      "BMAD_SPEC",
      "Recorded specification path differs from the assignment",
    );
  if (existing === undefined) {
    if (recorded.created)
      throw problem("BMAD_SPEC", "Previously created specification is missing");
    existing = recorded.initialText;
  }
  const identity = specIdentity(existing);
  if (
    identity.frozenSha256 !== recorded.frozenSha256 ||
    identity.bodySha256 !== recorded.bodySha256
  )
    throw problem(
      "BMAD_SPEC",
      "Specification or frozen intent changed; no overwrite/replan is allowed",
    );
  if (recorded.created && identity.sha256 !== recorded.sha256)
    throw problem(
      "BMAD_SPEC",
      "Specification status changed without a matching durable intent",
    );
  const statuses = [
    "draft",
    "ready-for-dev",
    "in-progress",
    "in-review",
    "done",
  ];
  const current = /^status: ['"]?([^'"\r\n]+)['"]?[ \t]*$/m.exec(existing)?.[1];
  if (!statuses.includes(requestedStatus) || !statuses.includes(current))
    throw problem("BMAD_SPEC", "Unsupported specification status");
  const status =
    statuses.indexOf(current) > statuses.indexOf(requestedStatus)
      ? current
      : requestedStatus;
  const text = existing.replace(/^status:.*$/m, `status: '${status}'`);
  const target = specIdentity(text);
  const pendingStatus = {
    fromSha256: recorded.created ? identity.sha256 : null,
    toSha256: target.sha256,
    status,
  };
  if (
    recorded.pendingStatus &&
    canonicalJson(recorded.pendingStatus) !== canonicalJson(pendingStatus)
  )
    throw problem(
      "BMAD_SPEC",
      "A different specification status transition is already pending",
    );
  if (!recorded.created || text !== existing) {
    await ctx.save({ spec: { ...recorded, pendingStatus } });
    await atomicText(file, text);
    await ctx.fault(`after-spec-write:${status}`);
  }
  await ctx.save({
    spec: {
      ...recorded,
      ...target,
      status,
      created: true,
      pendingStatus: null,
    },
  });
  return ctx.data.spec;
}

const slash = (value) => value.replaceAll("\\", "/");
const normal = (value) => slash(value).replace(/\/$/, "").toLowerCase();
export function inScope(file, scopes) {
  return scopes.some(
    (scope) =>
      normal(file) === normal(scope) ||
      (scope.endsWith("/") && normal(file).startsWith(`${normal(scope)}/`)),
  );
}
const overlap = (a, b) =>
  normal(a) === normal(b) ||
  normal(a).startsWith(`${normal(b)}/`) ||
  normal(b).startsWith(`${normal(a)}/`);
const git = async (cwd, ...args) =>
  (await execute("git", ["-C", cwd, ...args], { cwd })).stdout;
const nul = (text) => text.split("\0").filter(Boolean);
const samePath = (a, b) => normal(path.resolve(a)) === normal(path.resolve(b));

export function parseDirty(text) {
  const records = text.split("\0"),
    paths = [];
  for (let i = 0; i < records.length; i++) {
    if (!records[i]) continue;
    if (records[i].length < 4)
      throw problem("GIT_STATUS", "Invalid porcelain status record");
    paths.push(records[i].slice(3));
    if (/[RC]/.test(records[i].slice(0, 2))) {
      if (!records[i + 1])
        throw problem("GIT_STATUS", "Incomplete rename record");
      paths.push(records[++i]);
    }
  }
  return [...new Set(paths)].sort();
}

export async function safePath(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.startsWith("/") ||
    /[\\:\x00-\x1f]/.test(relative) ||
    relative
      .split("/")
      .some(
        (part) =>
          part === ".." || part === "." || part.toLowerCase() === ".git",
      )
  )
    throw problem("UNSAFE_PATH", `Unsafe checkout path: ${relative}`);
  const parts = relative.replace(/\/$/, "").split("/");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (stat.isSymbolicLink())
      throw problem(
        "UNSAFE_PATH",
        `Symlink/junction is not an authorized output: ${relative}`,
      );
    if (!stat.isFile() && !stat.isDirectory())
      throw problem("UNSAFE_PATH", `Nonregular checkout output: ${relative}`);
  }
  return path.join(root, ...parts);
}

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}

export async function ignoredSnapshot(root) {
  const files = nul(
    await git(
      root,
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "-z",
    ),
  );
  const result = {};
  for (const file of files.sort()) {
    const absolute = await safePath(root, file),
      stat = await lstat(absolute);
    if (!stat.isFile())
      throw problem(
        "UNSAFE_PATH",
        `Ignored output is not a regular file: ${file}`,
      );
    result[file] = {
      sha256: await hashFile(absolute),
      mode: stat.mode & 0o777,
    };
  }
  return result;
}

export async function auditScope(root, scopes, baselineIgnored = {}) {
  const changed = parseDirty(
    await git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all"),
  );
  const ignored = await ignoredSnapshot(root);
  const ignoredChanges = [
    ...new Set([...Object.keys(ignored), ...Object.keys(baselineIgnored)]),
  ].filter(
    (file) =>
      canonicalJson(ignored[file] ?? null) !==
      canonicalJson(baselineIgnored[file] ?? null),
  );
  const all = [...new Set([...changed, ...ignoredChanges])];
  for (const file of all) {
    if (!inScope(file, scopes))
      throw problem(
        "SCOPE_VIOLATION",
        `Changed path outside reserved task scopes: ${file}`,
      );
    await safePath(root, file);
  }
  for (const scope of scopes) await safePath(root, scope);
  return { changed, ignoredChanges, ignored };
}

export async function workingSnapshot(root) {
  const ignored = await ignoredSnapshot(root);
  const files = parseDirty(
    await git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all"),
  );
  const result = { ...ignored };
  for (const file of files) {
    const absolute = await safePath(root, file);
    try {
      const stat = await lstat(absolute);
      result[file] = {
        sha256: await hashFile(absolute),
        mode: stat.mode & 0o777,
      };
    } catch (error) {
      if (error.code === "ENOENT") result[file] = null;
      else throw error;
    }
  }
  return result;
}

export function assertStageScope(before, after, allowed) {
  for (const file of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (
      canonicalJson(before[file] ?? null) !==
        canonicalJson(after[file] ?? null) &&
      !inScope(file, allowed)
    )
      throw problem(
        "STAGE_SCOPE",
        `This stage changed another owner's path: ${file}`,
      );
    if (
      Object.hasOwn(before, file) !== Object.hasOwn(after, file) &&
      !inScope(file, allowed)
    )
      throw problem(
        "STAGE_SCOPE",
        `This stage changed another owner's path: ${file}`,
      );
  }
}

export async function sourceIdentity(root, baseSha, scopes) {
  const tracked = await git(
    root,
    "--literal-pathspecs",
    "diff",
    "--binary",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    baseSha,
    "--",
    ...scopes,
  );
  const untracked = nul(
    await git(root, "ls-files", "--others", "--exclude-standard", "-z"),
  ).filter((file) => inScope(file, scopes));
  const changed = nul(
    await git(
      root,
      "--literal-pathspecs",
      "diff",
      "--name-only",
      "-z",
      "--no-renames",
      baseSha,
      "--",
      ...scopes,
    ),
  );
  const files = [...new Set([...changed, ...untracked])].sort(),
    entries = [];
  const indexModes = new Map(
    nul(
      await git(
        root,
        "--literal-pathspecs",
        "ls-files",
        "--stage",
        "-z",
        "--",
        ...scopes,
      ),
    ).map((record) => {
      const separator = record.indexOf("\t");
      return [record.slice(separator + 1), record.slice(0, 6)];
    }),
  );
  let display = tracked;
  for (const file of files) {
    const absolute = await safePath(root, file);
    let stat;
    try {
      stat = await lstat(absolute);
    } catch (error) {
      if (error.code === "ENOENT") {
        entries.push({ file, deleted: true });
        continue;
      }
      throw error;
    }
    const bytes = await readFile(absolute);
    entries.push({
      file,
      mode: stat.mode & 0o111 ? "100755" : "100644",
      indexMode:
        indexModes.get(file) ?? (stat.mode & 0o111 ? "100755" : "100644"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (untracked.includes(file)) {
      // Use Git's native unified/binary diff without staging a temporary index.
      try {
        display += (
          await execFileAsync(
            "git",
            [
              "diff",
              "--no-index",
              "--binary",
              "--no-ext-diff",
              "--no-textconv",
              "--",
              "/dev/null",
              file,
            ],
            {
              cwd: root,
              windowsHide: true,
              encoding: "utf8",
              timeout: 30_000,
              maxBuffer: 32 * 1024 * 1024,
            },
          )
        ).stdout;
      } catch (error) {
        if (
          error.code === 1 &&
          typeof error.stdout === "string" &&
          error.stdout.startsWith("diff --git ")
        )
          display += error.stdout;
        else throw error;
      }
    }
  }
  const identity = { baseSha, files: entries };
  return { digest: digest(identity), baseSha, diff: display, identity };
}

function assertTask(task, id) {
  if (
    !task ||
    task.schemaVersion !== 1 ||
    task.id !== id ||
    task.status !== "ready" ||
    !Array.isArray(task.writePaths) ||
    !Array.isArray(task.resources)
  )
    throw problem("TASK_NOT_READY", `Invalid or unready task ${id}`);
}
function assertClaim(claim, task, owner, worktree, baseSha) {
  if (
    !claim ||
    claim.owner !== owner ||
    !samePath(claim.worktree, worktree) ||
    claim.baseHead !== baseSha ||
    canonicalJson(claim.writePaths) !== canonicalJson(task.writePaths) ||
    canonicalJson(claim.resources) !== canonicalJson(task.resources)
  )
    throw problem(
      "CLAIM_CONFLICT",
      `Reservation does not match frozen task ${task.id}`,
    );
}
function beats(ctx, includeValidation = false) {
  const data = ctx.data;
  const tasks = [
    [data.controllerTask, data.owner],
    [data.workerTask, data.workerOwner],
    ...(includeValidation && data.validationTask
      ? [[data.validationTask, `${data.owner}:validation`]]
      : []),
  ];
  return tasks.map(([task, owner]) => ({
    command: process.execPath,
    args: [
      path.join(data.worktree, "scripts/agent-tasks.mjs"),
      "heartbeat",
      "--task",
      task.id,
      "--owner",
      owner,
    ],
    cwd: data.worktree,
    intervalMs: 60_000,
  }));
}

export function createAdapter({ github, linear, worker = runWorker } = {}) {
  let gh = github,
    lin = linear;
  const clients = (ctx) => {
    gh ??= new GitHubClient({
      repository: ctx.assignment.repository,
      cwd: ctx.repo,
    });
    lin ??= new LinearClient({ cwd: ctx.repo });
  };
  async function registry(ctx) {
    const { commonDir } = await repositoryContext(ctx.repo);
    const value = await readJson(
      path.join(commonDir, "agent-coordination/claims.json"),
      { optional: true },
    );
    if (value === undefined) return { schemaVersion: 1, claims: [] };
    if (
      !object(value) ||
      value.schemaVersion !== 1 ||
      !Array.isArray(value.claims)
    )
      throw problem(
        "CORRUPT_STATE",
        "Present reservation registry has an invalid schema; it is not an empty registry",
      );
    const ids = new Set();
    for (const claim of value.claims) {
      if (
        !object(claim) ||
        typeof claim.task !== "string" ||
        !claim.task ||
        ids.has(claim.task) ||
        typeof claim.owner !== "string" ||
        !claim.owner ||
        typeof claim.worktree !== "string" ||
        !path.isAbsolute(claim.worktree) ||
        typeof claim.baseHead !== "string" ||
        !/^[a-f0-9]{40,64}$/.test(claim.baseHead) ||
        !Array.isArray(claim.writePaths) ||
        !Array.isArray(claim.resources) ||
        [...claim.writePaths, ...claim.resources].some(
          (entry) => typeof entry !== "string" || !entry,
        )
      )
        throw problem(
          "CORRUPT_STATE",
          "Present reservation registry contains an invalid or duplicate claim",
        );
      ids.add(claim.task);
    }
    return value;
  }
  async function claim(ctx, task, owner) {
    const existing = (await registry(ctx)).claims.find(
      (entry) => entry.task === task.id,
    );
    if (existing)
      assertClaim(existing, task, owner, ctx.data.worktree, ctx.data.baseSha);
    else
      await execute(
        process.execPath,
        [
          path.join(ctx.data.worktree, "scripts/agent-tasks.mjs"),
          "claim",
          "--task",
          task.id,
          "--owner",
          owner,
        ],
        { cwd: ctx.data.worktree },
      );
    assertClaim(
      (await registry(ctx)).claims.find((entry) => entry.task === task.id),
      task,
      owner,
      ctx.data.worktree,
      ctx.data.baseSha,
    );
  }
  async function heartbeat(ctx, validation = false) {
    const claims = await registry(ctx);
    for (const [task, owner] of [
      [ctx.data.controllerTask, ctx.data.owner],
      [ctx.data.workerTask, ctx.data.workerOwner],
      ...(validation && ctx.data.validationTask
        ? [[ctx.data.validationTask, `${ctx.data.owner}:validation`]]
        : []),
    ])
      assertClaim(
        claims.claims.find((entry) => entry.task === task.id),
        task,
        owner,
        ctx.data.worktree,
        ctx.data.baseSha,
      );
    for (const beat of beats(ctx, validation))
      await execute(beat.command, beat.args, { cwd: beat.cwd });
  }
  async function release(ctx, task, owner) {
    const existing = (await registry(ctx)).claims.find(
      (entry) => entry.task === task.id,
    );
    if (!existing) return;
    assertClaim(existing, task, owner, ctx.data.worktree, ctx.data.baseSha);
    await execute(
      process.execPath,
      [
        path.join(ctx.data.worktree, "scripts/agent-tasks.mjs"),
        "release",
        "--task",
        task.id,
        "--owner",
        owner,
      ],
      { cwd: ctx.data.worktree },
    );
  }
  const scopes = (ctx) => [
    ...ctx.data.controllerTask.writePaths,
    ...ctx.data.workerTask.writePaths,
  ];
  async function audit(ctx) {
    if (
      (await git(ctx.data.worktree, "rev-parse", "HEAD")).trim() !==
      (ctx.data.commitSha ?? ctx.data.baseSha)
    )
      throw problem("HEAD_CHANGED", "Worker or external process changed HEAD");
    if (ctx.data.commitSha) {
      if (
        (
          await git(
            ctx.data.worktree,
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
          )
        ).trim() ||
        (
          await git(ctx.data.worktree, "show", "-s", "--format=%T", "HEAD")
        ).trim() !== ctx.data.commitIntent.tree
      )
        throw problem(
          "COMMIT_CONFLICT",
          "Committed candidate no longer matches the verified tree",
        );
    }
    return auditScope(ctx.data.worktree, scopes(ctx), ctx.data.ignoredBaseline);
  }
  async function assertSource(ctx) {
    await reconcileSpecification(ctx);
    await audit(ctx);
    if (ctx.data.spec) await recordedSpecificationText(ctx);
    const current = await sourceIdentity(
      ctx.data.worktree,
      ctx.data.baseSha,
      ctx.data.workerTask.writePaths,
    );
    if (current.digest !== ctx.data.sourceDigest)
      throw problem(
        "SOURCE_CHANGED",
        "Source/test identity changed after implementation or review",
      );
    return current;
  }
  async function evidence(ctx, filename, value) {
    const relative = `${ctx.assignment.artifactDir}/${filename}`;
    if (!inScope(relative, ctx.data.controllerTask.writePaths))
      throw problem("SCOPE_VIOLATION", "Evidence path is not reserved");
    const absolute = await safePath(ctx.data.worktree, relative);
    await atomicWriteJson(absolute, value);
  }
  const reviewResults = (ctx) => ctx.data.reviewsV2 ?? ctx.data.reviews;
  function readinessBinding(ctx, snapshot) {
    return {
      planSha256: digest(ctx.data.plan.result),
      intentSha256: digest(ctx.data.intent),
      specBodySha256: ctx.data.spec?.bodySha256 ?? null,
      frozenSha256: ctx.data.spec?.frozenSha256 ?? null,
      snapshotSha256: snapshot.identity.manifestSha256,
    };
  }
  async function ensurePlanningReady(ctx) {
    const snapshot = await loadBmadSnapshot(
      ctx.data.renderedWorkflow,
      ctx.data.bmadSnapshot,
    );
    validateWorkerResult("plan", ctx.data.plan?.result, { legacy: true });
    if (ctx.data.plan.result.intentGaps.length)
      throw problem(
        "INTENT_GAPS",
        "Original user-owned planning questions remain unresolved",
      );
    const native =
      ctx.data.plan.provenance?.deliveryProtocol === DELIVERY_PROTOCOL;
    if (native) {
      if (
        !object(ctx.data.plan.provenance.inlineInputs) ||
        canonicalJson(ctx.data.plan.provenance.inlineInputs) !==
          canonicalJson(planningInputHashes(snapshot))
      )
        throw problem(
          "PLAN_NOT_READY",
          "Protocol 2 plan lacks exact inline snapshot input hashes",
        );
      validateWorkerResult("plan", ctx.data.plan.result);
      assertPlanningReady(ctx.data.plan.result);
      return {
        protocol: DELIVERY_PROTOCOL,
        kind: "native-plan",
        binding: readinessBinding(ctx, snapshot),
        result: {
          ready: true,
          intentGaps: [],
          runtimeBlockers: [],
          evidence: [
            "Required snapshot instructions were delivered inline by protocol 2.",
          ],
        },
        provenance: ctx.data.plan.provenance,
      };
    }
    if (!ctx.state.attempts.plan)
      throw problem(
        "PLAN_NOT_READY",
        "Legacy plan has no immutable original attempt to reconcile",
      );
    const originalPlan = await resumeWorkerAttempt(ctx, "plan");
    let originalValue;
    try {
      originalValue = JSON.parse(originalPlan.raw);
    } catch {
      throw problem(
        "WORKER_OUTPUT",
        "Original planning result is missing or invalid",
      );
    }
    validateWorkerResult("plan", originalValue, { legacy: true });
    if (
      originalPlan.receipt.exitCode !== 0 ||
      digest(originalValue) !== digest(ctx.data.plan.result)
    )
      throw problem(
        "PLAN_NOT_READY",
        "Original plan differs from its terminal receipt output",
      );
    if (!ctx.data.planReadinessInputV2) {
      if (ctx.data.sourceDigest) await assertSource(ctx);
      else await audit(ctx);
      const candidate = await sourceIdentity(
        ctx.data.worktree,
        ctx.data.baseSha,
        ctx.data.workerTask.writePaths,
      );
      const specText = ctx.data.specFile
        ? await recordedSpecificationText(ctx, { allowInitial: true })
        : null;
      await ctx.save({
        planReadinessInputV2: {
          protocol: DELIVERY_PROTOCOL,
          binding: readinessBinding(ctx, snapshot),
          plan: ctx.data.plan.result,
          intent: ctx.data.intent,
          specText,
          candidateDiff: candidate.diff,
          sourceDigest: ctx.data.sourceDigest ?? null,
        },
        planReadinessBeforeV2: await workingSnapshot(ctx.data.worktree),
      });
    }
    const input = ctx.data.planReadinessInputV2;
    const binding = readinessBinding(ctx, snapshot);
    // A pre-implementation validation may precede creation of the spec. All
    // already-frozen inputs and any existing source candidate remain exact.
    if (
      input.binding.planSha256 !== binding.planSha256 ||
      input.binding.intentSha256 !== binding.intentSha256 ||
      input.binding.snapshotSha256 !== binding.snapshotSha256 ||
      (input.binding.specBodySha256 !== null &&
        input.binding.specBodySha256 !== binding.specBodySha256) ||
      (input.sourceDigest !== null &&
        input.sourceDigest !== ctx.data.sourceDigest)
    )
      throw problem(
        "PLAN_NOT_READY",
        "Legacy readiness input changed; no second upgrade attempt is permitted",
      );
    if (!ctx.data.planReadinessV2) {
      const result = await worker(ctx, {
        kind: "plan-readiness",
        heartbeat: beats(ctx),
      });
      assertStageScope(
        ctx.data.planReadinessBeforeV2,
        await workingSnapshot(ctx.data.worktree),
        [],
      );
      if (ctx.data.sourceDigest) await assertSource(ctx);
      else await audit(ctx);
      validateWorkerResult("plan-readiness", result.result);
      if (
        result.provenance?.deliveryProtocol !== DELIVERY_PROTOCOL ||
        planInputNamesMismatch(result.provenance.inlineInputs, snapshot)
      )
        throw problem(
          "PLAN_NOT_READY",
          "Readiness validator did not receive the required verified inline instructions",
        );
      await ctx.save({
        planReadinessV2: {
          ...result,
          protocol: DELIVERY_PROTOCOL,
          binding: input.binding,
          sourceDigest: input.sourceDigest,
        },
      });
    }
    validateWorkerResult("plan-readiness", ctx.data.planReadinessV2.result);
    await atomicWriteJson(
      path.join(ctx.runDir, "delivery-v2-readiness.json"),
      ctx.data.planReadinessV2,
    );
    assertPlanningReady(ctx.data.planReadinessV2.result);
    return ctx.data.planReadinessV2;
  }
  function planInputNamesMismatch(hashes, snapshot) {
    return Object.entries(planningInputHashes(snapshot)).some(
      ([name, sha256]) => hashes?.[name] !== sha256,
    );
  }
  async function legacyReviewScope(ctx, originals) {
    const after = await workingSnapshot(ctx.data.worktree);
    const relative = `${ctx.assignment.artifactDir}/review.json`;
    const allowed = [];
    if (ctx.data.reviews && Object.hasOwn(after, relative)) {
      // This is the one artifact the old controller wrote after its reviewer
      // snapshot. Prove the exact saved payload and terminal worker identities;
      // no other controller path is exempt from the read-only stage audit.
      const reviews = ctx.data.reviews;
      if (
        !Array.isArray(reviews) ||
        reviews.length !== 3 ||
        new Set(reviews.map((review) => review.lens)).size !== 3 ||
        reviews.some((review) => {
          const original = originals.find((entry) =>
            entry.key.startsWith(`review:${review.lens}:`),
          );
          return (
            !original?.result ||
            original.receipt.attemptId !== review.attemptId ||
            digest(original.result) !== digest(review.result)
          );
        })
      )
        throw problem(
          "REVIEW_OUTPUT",
          "Saved legacy reviews lack matching terminal evidence",
        );
      const expected = {
        baseSha: ctx.data.baseSha,
        sourceDigest: ctx.data.sourceDigest,
        diffSha256: ctx.data.sourceDiffSha256,
        spec: {
          path: ctx.data.specFile,
          sha256: ctx.data.spec.sha256,
          frozenSha256: ctx.data.spec.frozenSha256,
        },
        snapshot: ctx.data.bmadSnapshot,
        reviews,
      };
      if (after[relative]?.sha256 !== digest(`${canonicalJson(expected)}\n`))
        throw problem(
          "STAGE_SCOPE",
          "Legacy review artifact differs from its saved evidence",
        );
      allowed.push(relative);
    }
    assertStageScope(ctx.data.reviewBefore, after, allowed);
  }
  async function settleLegacyReviews(ctx, auditBefore) {
    const keys = Object.keys(ctx.state.attempts)
      .filter((key) => /^review:(blind|edge|verification):/.test(key))
      .sort();
    if (!keys.length) return [];
    // Consume every original immutable request first. State.status alone is
    // not a receipt; unknown/corrupt/live originals cannot authorize upgrades.
    const settled = await Promise.allSettled(
      keys.map(async (key) => ({
        key,
        ...(await resumeWorkerAttempt(ctx, key)),
      })),
    );
    const failed = settled.find((entry) => entry.status === "rejected");
    if (failed) throw failed.reason;
    const originals = settled.map((entry) => {
      const value = entry.value;
      let result = null,
        failure = null;
      try {
        if (value.receipt.exitCode !== 0)
          throw problem(
            "WORKER_FAILED",
            "Original reviewer exited unsuccessfully",
          );
        result = parseReviewResult(value.key.split(":")[1], value.raw);
      } catch (error) {
        failure = {
          code: error.code ?? "REVIEW_OUTPUT",
          message: error.message,
        };
      }
      return {
        key: value.key,
        requestDigest: value.requestDigest,
        receipt: value.receipt,
        raw: value.raw,
        result,
        failure,
      };
    });
    if (
      auditBefore &&
      ctx.data.reviewBefore &&
      !ctx.data.legacyReviewSettlementV2
    )
      await legacyReviewScope(ctx, originals);
    if (!ctx.data.legacyReviewSettlementV2)
      await ctx.save({ legacyReviewSettlementV2: originals });
    else if (digest(ctx.data.legacyReviewSettlementV2) !== digest(originals))
      throw problem(
        "REVIEW_OUTPUT",
        "Original review evidence changed after upgrade settlement",
      );
    await atomicWriteJson(
      path.join(ctx.runDir, "legacy-reviews-v1.json"),
      originals,
    );
    return originals;
  }
  async function ensureReviewsV2(ctx, auditLegacyBefore = false) {
    const originals = await settleLegacyReviews(ctx, auditLegacyBefore);
    if (
      [...originals, ...(ctx.data.reviews ?? [])].some(
        (review) => review.result?.findings?.length,
      )
    )
      throw problem(
        "REVIEW_FINDINGS",
        "Original review has unresolved findings; input delivery cannot clear them",
      );
    const readiness = await ensurePlanningReady(ctx);
    await assertSource(ctx);
    const binding = {
      sourceDigest: ctx.data.sourceDigest,
      diffSha256: ctx.data.sourceDiffSha256,
      specBodySha256: ctx.data.spec.bodySha256,
      frozenSha256: ctx.data.spec.frozenSha256,
      planSha256: digest(ctx.data.plan.result),
      snapshotSha256: ctx.data.bmadSnapshot.manifestSha256,
    };
    if (
      ctx.data.reviewV2Binding &&
      digest(ctx.data.reviewV2Binding) !== digest(binding)
    )
      throw problem("REVIEW_OUTPUT", "Validated review input changed");
    if (!ctx.data.reviewsV2) {
      if (!ctx.data.reviewBeforeV2)
        await ctx.save({
          reviewBeforeV2: await workingSnapshot(ctx.data.worktree),
          reviewV2Binding: binding,
        });
      const settled = await Promise.allSettled(
        ["blind", "edge", "verification"].map(async (lens) => ({
          lens,
          ...(await worker(ctx, {
            kind: "review",
            lens,
            identity: ctx.data.sourceDigest,
            heartbeat: beats(ctx),
          })),
        })),
      );
      const failed = settled.find((entry) => entry.status === "rejected");
      if (failed) throw failed.reason;
      const results = settled.map((entry) => entry.value);
      assertStageScope(
        ctx.data.reviewBeforeV2,
        await workingSnapshot(ctx.data.worktree),
        [],
      );
      await assertSource(ctx);
      for (const result of results) {
        if (
          result.provenance?.deliveryProtocol !== DELIVERY_PROTOCOL ||
          result.provenance.diffSha256 !== ctx.data.sourceDiffSha256
        )
          throw problem(
            "REVIEW_OUTPUT",
            "Reviewer did not consume the current protocol 2 candidate",
          );
        parseReviewResult(result.lens, result.result.raw);
      }
      await ctx.save({ reviewsV2: results });
    }
    if (
      ctx.data.reviewsV2.length !== 3 ||
      new Set(ctx.data.reviewsV2.map((review) => review.lens)).size !== 3
    )
      throw problem(
        "REVIEW_OUTPUT",
        "Protocol 2 requires three independent lenses",
      );
    for (const review of ctx.data.reviewsV2) {
      if (
        review.provenance?.deliveryProtocol !== DELIVERY_PROTOCOL ||
        review.provenance.diffSha256 !== ctx.data.sourceDiffSha256 ||
        review.result.rawSha256 !== digest(review.result.raw)
      )
        throw problem(
          "REVIEW_OUTPUT",
          "Cached review proof identity is invalid",
        );
      if (parseReviewResult(review.lens, review.result.raw).findings.length)
        throw problem(
          "REVIEW_FINDINGS",
          "Protocol 2 review has findings; no repair loop is started",
        );
    }
    const proof = {
      protocol: DELIVERY_PROTOCOL,
      binding,
      readiness,
      reviews: ctx.data.reviewsV2,
      legacyReviews: ctx.data.legacyReviewSettlementV2 ?? [],
    };
    const proofSha256 = digest(proof);
    await atomicWriteJson(path.join(ctx.runDir, "delivery-v2.json"), proof);
    await ctx.save({
      deliveryV2: {
        proofSha256,
        binding,
        readiness,
        reviews: ctx.data.reviewsV2,
      },
    });
    return proof;
  }
  async function progress(ctx, stage) {
    await lin.comment(
      ctx,
      `Run **${ctx.runId}** — ${stage}\n\nTask: ${ctx.assignment.task}; worker: ${ctx.assignment.workerTask}.\nBase: \`${ctx.data.baseSha}\`.${ctx.data.commitSha ? `\nCommit: \`${ctx.data.commitSha}\`.` : ""}${ctx.data.prUrl ? `\nPR: ${ctx.data.prUrl}` : ""}${ctx.data.mergeSha ? `\nMerge: \`${ctx.data.mergeSha}\`.` : ""}\n\n${ctx.assignment.acceptance.description}`,
    );
  }
  async function prepare(ctx) {
    const remote = (await git(ctx.repo, "remote", "get-url", "origin")).trim();
    const match =
      /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(
        remote,
      );
    if (
      !match ||
      match[1].toLowerCase() !== ctx.assignment.repository.toLowerCase()
    )
      throw problem(
        "REPOSITORY_MISMATCH",
        "Assignment repository does not match origin",
      );
    const repo = await gh.repo();
    if (
      repo.full_name?.toLowerCase() !== ctx.assignment.repository.toLowerCase()
    )
      throw problem(
        "REPOSITORY_MISMATCH",
        "GitHub repository identity changed",
      );
    const issue = await lin.getIssue(ctx.assignment.issue);
    if (issue.identifier !== ctx.assignment.issue || !issue.id)
      throw problem(
        "LINEAR_IDENTITY",
        "Assignment issue identity could not be verified",
      );
    if (!ctx.data.baseSha) {
      const baseSha = (await gh.branch(ctx.assignment.baseBranch)).commit.sha;
      await git(ctx.repo, "fetch", "origin", ctx.assignment.baseBranch);
      if (
        (
          await git(
            ctx.repo,
            "rev-parse",
            `origin/${ctx.assignment.baseBranch}`,
          )
        ).trim() !== baseSha
      )
        throw problem(
          "BASE_CHANGED",
          "Base advanced while freezing assignment",
        );
      const readBase = async (file) =>
        await git(ctx.repo, "show", `${baseSha}:${file}`);
      const controllerTask = JSON.parse(
        await readBase(`docs/agents/tasks/${ctx.assignment.task}.json`),
      );
      const workerTask = JSON.parse(
        await readBase(`docs/agents/tasks/${ctx.assignment.workerTask}.json`),
      );
      const validationTask = ctx.assignment.validationTask
        ? JSON.parse(
            await readBase(
              `docs/agents/tasks/${ctx.assignment.validationTask}.json`,
            ),
          )
        : null;
      assertTask(controllerTask, ctx.assignment.task);
      assertTask(workerTask, ctx.assignment.workerTask);
      if (validationTask) {
        assertTask(validationTask, ctx.assignment.validationTask);
        if (validationTask.writePaths.length)
          throw problem(
            "VALIDATION_SCOPE",
            "Validation task must be resource-only",
          );
      }
      if (
        controllerTask.resources.includes("heavy-validation") ||
        workerTask.resources.includes("heavy-validation")
      )
        throw problem(
          "VALIDATION_SCOPE",
          "Heavy resources must be claimed only for verification",
        );
      if (
        controllerTask.writePaths.some((a) =>
          workerTask.writePaths.some((b) => overlap(a, b)),
        )
      )
        throw problem(
          "TASK_OVERLAP",
          "Controller and worker write paths overlap",
        );
      for (const file of [
        ctx.assignment.handoffFile,
        `${ctx.assignment.artifactDir}/plan.json`,
        "_bmad/render/bmad-build/",
      ])
        if (!inScope(file, controllerTask.writePaths))
          throw problem(
            "TASK_SCOPE",
            `Controller task does not reserve ${file}`,
          );
      for (const task of [controllerTask, workerTask, validationTask].filter(
        Boolean,
      ))
        for (const dependency of task.dependsOn)
          if (
            JSON.parse(await readBase(`docs/agents/tasks/${dependency}.json`))
              .status !== "done"
          )
            throw problem(
              "TASK_DEPENDENCY",
              `Unfinished dependency ${dependency}`,
            );
      const intent = await readBase(ctx.assignment.intentFile);
      const manifestRelative = slash(
        path.relative(ctx.repo, ctx.state.assignmentPath),
      );
      await safePath(ctx.repo, manifestRelative);
      if (
        digest(JSON.parse(await readBase(manifestRelative))) !==
        ctx.state.assignmentDigest
      )
        throw problem(
          "ASSIGNMENT_CHANGED",
          "Assignment must be committed unchanged in base",
        );
      const owner = `autodev:${ctx.runId}`;
      await ctx.save({
        baseSha,
        controllerTask,
        workerTask,
        validationTask,
        intent,
        intentDigest: digest(intent),
        issueId: issue.id,
        owner,
        workerOwner: `${owner}:worker`,
        branch: `codex/autodev-${ctx.runId}`,
        worktree: path.join(path.dirname(ctx.repo), `autodev-${ctx.runId}`),
      });
    }
    const entries = (await git(ctx.repo, "worktree", "list", "--porcelain"))
      .split(/\r?\n\r?\n/)
      .map((record) =>
        Object.fromEntries(
          record
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
              const index = line.indexOf(" ");
              return [line.slice(0, index), line.slice(index + 1)];
            }),
        ),
      );
    const existing = entries.find(
      (entry) => entry.worktree && samePath(entry.worktree, ctx.data.worktree),
    );
    if (!existing) {
      let exists = true;
      try {
        await lstat(ctx.data.worktree);
      } catch (error) {
        if (error.code === "ENOENT") exists = false;
        else throw error;
      }
      if (
        exists ||
        entries.some(
          (entry) => entry.branch === `refs/heads/${ctx.data.branch}`,
        )
      )
        throw problem(
          "WORKTREE_CONFLICT",
          "Planned worktree path or branch is already occupied",
        );
      await ctx.save({ worktreeIntent: true });
      await git(
        ctx.repo,
        "worktree",
        "add",
        "-b",
        ctx.data.branch,
        ctx.data.worktree,
        ctx.data.baseSha,
      );
    } else if (
      !ctx.data.worktreeIntent ||
      existing.branch !== `refs/heads/${ctx.data.branch}` ||
      existing.HEAD !== ctx.data.baseSha
    )
      throw problem(
        "WORKTREE_CONFLICT",
        "Existing worktree does not match this run's creation intent",
      );
    const workContext = await repositoryContext(ctx.data.worktree),
      context = await repositoryContext(ctx.repo);
    if (
      workContext.identity !== context.identity ||
      !samePath(await realpath(ctx.data.worktree), ctx.data.worktree)
    )
      throw problem(
        "WORKTREE_CONFLICT",
        "Worktree common directory or real path differs",
      );
    if (ctx.data.ignoredBaseline === undefined)
      await ctx.save({
        ignoredBaseline: await ignoredSnapshot(ctx.data.worktree),
      });
    await claim(ctx, ctx.data.controllerTask, ctx.data.owner);
    await claim(ctx, ctx.data.workerTask, ctx.data.workerOwner);
    await heartbeat(ctx);
    await audit(ctx);
    await lin.setState(issue, ctx.assignment.linearStates.active);
    await progress(ctx, "Připraveno; rezervace a původní zadání ověřeny");
  }
  async function plan(ctx) {
    const receipt = await ctx.supervise({
      key: "bmad-render",
      command: "uv",
      args: [
        "run",
        "--no-cache",
        path.join(ctx.data.worktree, "_bmad/scripts/render_skill.py"),
        "--project-root",
        ctx.data.worktree,
        "--skill",
        path.join(ctx.data.worktree, ".agents/skills/bmad-build"),
      ],
      cwd: ctx.data.worktree,
      heartbeat: beats(ctx),
    });
    if (receipt.exitCode !== 0)
      throw problem(
        "BMAD_RENDER_FAILED",
        `BMAD renderer failed: ${receipt.stderrPath}`,
      );
    const output = (await readFile(receipt.stdoutPath, "utf8")).trim();
    if (!output.startsWith("read and follow "))
      throw problem("BMAD_RENDER_FAILED", "Unexpected renderer output");
    const renderedWorkflow = output.slice("read and follow ".length);
    const relative = slash(path.relative(ctx.data.worktree, renderedWorkflow));
    if (!inScope(relative, ctx.data.controllerTask.writePaths))
      throw problem("SCOPE_VIOLATION", "Renderer path escaped its reservation");
    await safePath(ctx.data.worktree, relative);
    const snapshot = await loadBmadSnapshot(
      renderedWorkflow,
      ctx.data.bmadSnapshot,
    );
    await ctx.save({ renderedWorkflow, bmadSnapshot: snapshot.identity });
    if (!ctx.data.plan) {
      if (!ctx.data.planBefore)
        await ctx.save({
          planBefore: await workingSnapshot(ctx.data.worktree),
        });
      const result = await worker(ctx, { kind: "plan", heartbeat: beats(ctx) });
      assertStageScope(
        ctx.data.planBefore,
        await workingSnapshot(ctx.data.worktree),
        [],
      );
      await ctx.save({ plan: result });
    }
    validateWorkerResult("plan", ctx.data.plan.result, {
      legacy: ctx.data.plan.provenance?.deliveryProtocol !== DELIVERY_PROTOCOL,
    });
    await audit(ctx);
    await evidence(ctx, "plan.json", {
      ...ctx.data.plan.result,
      provenance: ctx.data.plan.provenance ?? null,
    });
    const legacy =
      ctx.data.plan.provenance?.deliveryProtocol !== DELIVERY_PROTOCOL;
    if (legacy) await ensurePlanningReady(ctx);
    await writeSpecification(
      ctx,
      snapshot,
      ctx.data.plan.result.intentGaps.length ||
        ctx.data.plan.result.runtimeBlockers?.length ||
        ctx.data.plan.result.ready === false
        ? "draft"
        : "ready-for-dev",
    );
    await ensurePlanningReady(ctx);
    await progress(ctx, "Výzkum a volba řešení dokončeny");
  }
  async function implementationEvidence(ctx) {
    await evidence(ctx, "implementation.json", {
      ...ctx.data.implementation.result,
      provenance: ctx.data.implementation.provenance ?? null,
      sourceDigest: ctx.data.sourceDigest,
      baseSha: ctx.data.baseSha,
    });
    await progress(
      ctx,
      "Implementace a cílený refaktoring dokončeny; čeká nezávislé review",
    );
  }
  async function implement(ctx) {
    validateWorkerResult("plan", ctx.data.plan?.result, {
      legacy: ctx.data.plan.provenance?.deliveryProtocol !== DELIVERY_PROTOCOL,
    });
    if (ctx.data.plan.result.intentGaps.length)
      throw problem(
        "INTENT_GAPS",
        "Implementation cannot resolve user-owned intent gaps",
      );
    const resumeDispatchedImplementation = Boolean(
      ctx.state.attempts.implement && !ctx.data.implementation,
    );
    if (!resumeDispatchedImplementation) await ensurePlanningReady(ctx);
    await writeSpecification(
      ctx,
      await loadBmadSnapshot(ctx.data.renderedWorkflow, ctx.data.bmadSnapshot),
      "in-progress",
    );
    if (ctx.data.sourceDigest && ctx.data.implementation) {
      await assertSource(ctx);
      await implementationEvidence(ctx);
      return;
    }
    if (!ctx.data.implementationBefore)
      await ctx.save({
        implementationBefore: await workingSnapshot(ctx.data.worktree),
      });
    const result = await worker(ctx, {
      kind: "implement",
      heartbeat: beats(ctx),
    });
    assertStageScope(
      ctx.data.implementationBefore,
      await workingSnapshot(ctx.data.worktree),
      ctx.data.workerTask.writePaths,
    );
    await audit(ctx);
    const identity = await sourceIdentity(
      ctx.data.worktree,
      ctx.data.baseSha,
      ctx.data.workerTask.writePaths,
    );
    if (!identity.diff.trim())
      throw problem(
        "NO_IMPLEMENTATION",
        "Worker produced no source/test changes",
      );
    await atomicWriteJson(
      path.join(ctx.runDir, "source-identity.json"),
      identity.identity,
    );
    await atomicText(path.join(ctx.runDir, "source-diff.txt"), identity.diff);
    await ctx.save({
      sourceDigest: identity.digest,
      sourceDiffSha256: digest(identity.diff),
      implementation: result,
    });
    await ensurePlanningReady(ctx);
    await implementationEvidence(ctx);
  }
  async function review(ctx) {
    await assertSource(ctx);
    await writeSpecification(
      ctx,
      await loadBmadSnapshot(ctx.data.renderedWorkflow, ctx.data.bmadSnapshot),
      "in-review",
    );
    const proof = await ensureReviewsV2(ctx, true);
    if (!ctx.data.commitSha && !ctx.data.stagingIntent) {
      await evidence(ctx, "review-v2.json", proof);
      await ctx.save({ deliveryV2Published: true });
    }
    await progress(ctx, "Tři nezávislá review bez podložených nálezů");
  }
  async function verify(ctx) {
    await assertSource(ctx);
    if (ctx.data.validationTask)
      await claim(ctx, ctx.data.validationTask, `${ctx.data.owner}:validation`);
    const checks = [];
    let awaitingReceipt = false;
    try {
      for (const check of ctx.assignment.checks) {
        awaitingReceipt = true;
        const receipt = await ctx.supervise({
          key: `check:${check.id}:${ctx.data.sourceDigest.slice(0, 24)}`,
          command: check.command === "node" ? process.execPath : check.command,
          args: check.args,
          cwd: ctx.data.worktree,
          heartbeat: beats(ctx, true),
        });
        // Only the engine's resolved, validated terminal receipt establishes
        // that this supervised process is finished. Any thrown IO error may
        // occur while it remains live, regardless of the error code.
        awaitingReceipt = false;
        checks.push({
          id: check.id,
          command: check.command,
          args: check.args,
          ...receipt,
        });
        if (receipt.exitCode !== 0)
          throw problem(
            "CHECK_FAILED",
            `Check ${check.id} failed with exit ${receipt.exitCode}; ${receipt.stdoutPath}`,
          );
        await assertSource(ctx);
      }
      await ctx.save({ checks, verifiedSourceDigest: ctx.data.sourceDigest });
      if (ctx.data.spec)
        await writeSpecification(
          ctx,
          await loadBmadSnapshot(
            ctx.data.renderedWorkflow,
            ctx.data.bmadSnapshot,
          ),
          "done",
        );
      await evidence(ctx, "checks.json", {
        baseSha: ctx.data.baseSha,
        sourceDigest: ctx.data.sourceDigest,
        spec: ctx.data.spec
          ? {
              path: ctx.data.specFile,
              sha256: ctx.data.spec.sha256,
              frozenSha256: ctx.data.spec.frozenSha256,
            }
          : null,
        checks,
      });
      await ctx.save({ checks });
    } finally {
      // A resumed run can still own a later check even when this invocation
      // just consumed an earlier terminal receipt. Audit every dispatched
      // check in this run before releasing their shared validation resource.
      const checksTerminal = Object.entries(ctx.state.attempts).every(
        ([key, attempt]) =>
          !key.startsWith("check:") || attempt?.status === "complete",
      );
      if (ctx.data.validationTask && !awaitingReceipt && checksTerminal)
        await release(
          ctx,
          ctx.data.validationTask,
          `${ctx.data.owner}:validation`,
        );
    }
    await progress(
      ctx,
      "Všechny předepsané lokální kontroly prošly; zdrojová identita nezměněna",
    );
  }
  function handoff(ctx) {
    const reviews = reviewResults(ctx);
    return `# Předání ${ctx.assignment.task}\n\nRun: ${ctx.runId}\nOwner: ${ctx.data.owner}; worker: ${ctx.data.workerOwner}\nBase: ${ctx.data.baseSha}\nSource/test SHA256: ${ctx.data.sourceDigest}\n\n${ctx.data.implementation.result.summary}\n\n## Ověření\n\n${ctx.data.checks.map((check) => `- ${check.id}: exit ${check.exitCode}; ${[check.command, ...check.args].join(" ")}`).join("\n")}\n\nTři nezávislé review: ${reviews.map((review) => `${review.lens} (${review.attemptId}): ${review.result.findings.length} nálezů`).join(", ")}.\n\nPřejímka: ${ctx.assignment.acceptance.description}\n\nDůkazy: ${ctx.assignment.artifactDir}/. Surové provozní logy zůstávají v git-common-dir. Integrace a main CI se dokládají ve stejném Linear run komentáři a PR. Hra/GPU se tímto CLI ověřením nepovažuje za otestovanou. Katalog přijímá koordinátor.\n`;
  }
  async function commit(ctx) {
    // A completed commit may precede its checkpoint. Verify parent/tree/marker
    // before applying the normal pre-commit HEAD invariant.
    const head = (await git(ctx.data.worktree, "rev-parse", "HEAD")).trim();
    const marker = `Autodev-Run: ${ctx.runId}`;
    if (head !== ctx.data.baseSha) {
      if (!ctx.data.commitIntent)
        throw problem(
          "COMMIT_CONFLICT",
          "HEAD changed without this run's commit intent",
        );
      const [tree, parents, message] = await Promise.all([
        git(ctx.data.worktree, "show", "-s", "--format=%T", head),
        git(ctx.data.worktree, "show", "-s", "--format=%P", head),
        git(ctx.data.worktree, "show", "-s", "--format=%B", head),
      ]);
      if (
        tree.trim() !== ctx.data.commitIntent.tree ||
        parents.trim() !== ctx.data.baseSha ||
        !message.split(/\r?\n/).includes(marker)
      )
        throw problem(
          "COMMIT_CONFLICT",
          "Existing commit does not match expected parent/tree/marker",
        );
      await ctx.save({ commitSha: head });
      if (
        (
          await git(
            ctx.data.worktree,
            "status",
            "--porcelain=v1",
            "--untracked-files=all",
          )
        ).trim()
      )
        throw problem(
          "COMMIT_CONFLICT",
          "Checkout differs from committed candidate",
        );
      return;
    }
    await assertSource(ctx);
    if (
      !ctx.data.checks?.length ||
      reviewResults(ctx)?.length !== 3 ||
      reviewResults(ctx).some((review) => review.result.findings.length)
    )
      throw problem(
        "NOT_VERIFIED",
        "Commit requires successful checks and clean independent review",
      );
    const staged = nul(
      await git(
        ctx.data.worktree,
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--no-renames",
      ),
    );
    if (staged.length && !ctx.data.stagingIntent)
      throw problem(
        "FOREIGN_INDEX",
        "Pre-existing staged contents are not owned by this controller",
      );
    if (!ctx.data.stagingIntent) {
      const output = await safePath(
        ctx.data.worktree,
        ctx.assignment.handoffFile,
      );
      await mkdir(path.dirname(output), { recursive: true });
      await writeFile(output, handoff(ctx));
      const { changed } = await audit(ctx);
      await ctx.save({ stagingIntent: { files: changed } });
    }
    for (const file of staged)
      if (!ctx.data.stagingIntent.files.includes(file))
        throw problem("FOREIGN_INDEX", `Unexpected staged file ${file}`);
    for (const file of ctx.data.stagingIntent.files)
      await git(ctx.data.worktree, "--literal-pathspecs", "add", "--", file);
    const indexFiles = nul(
      await git(
        ctx.data.worktree,
        "diff",
        "--cached",
        "--name-only",
        "-z",
        "--no-renames",
      ),
    );
    if (
      canonicalJson(indexFiles.sort()) !==
      canonicalJson([...ctx.data.stagingIntent.files].sort())
    )
      throw problem(
        "FOREIGN_INDEX",
        "Index does not equal the audited explicit file list",
      );
    await assertSource(ctx);
    const tree = (await git(ctx.data.worktree, "write-tree")).trim();
    if (ctx.data.commitIntent && ctx.data.commitIntent.tree !== tree)
      throw problem(
        "COMMIT_CONFLICT",
        "Staged candidate changed after commit intent",
      );
    await ctx.save({
      commitIntent: { tree, parent: ctx.data.baseSha, marker },
    });
    await git(
      ctx.data.worktree,
      "commit",
      "-m",
      ctx.assignment.prTitle,
      "-m",
      marker,
    );
    await ctx.fault("after-commit");
    await commit(ctx);
  }
  function prBody(ctx, accepted = false) {
    const base = `https://github.com/${ctx.assignment.repository}/blob/${ctx.data.commitSha}`;
    const delivery = ctx.data.deliveryV2
      ? `\n\nProtocol 2 input-delivery evidence: ${ctx.data.deliveryV2.proofSha256}. Original legacy results are retained as historical evidence, not counted as completed reviews.\n\nReadiness: ${JSON.stringify(ctx.data.deliveryV2.readiness.result)}\n\nReview results: ${JSON.stringify(ctx.data.deliveryV2.reviews.map((review) => ({ lens: review.lens, attemptId: review.attemptId, rawSha256: review.result.rawSha256, raw: review.result.raw })))}\n`
      : "";
    return `${ctx.assignment.prTitle}\n\n${ctx.data.implementation.result.summary}\n\nIssue: ${ctx.assignment.issue}\nRun: ${ctx.runId}\nHead: ${ctx.data.commitSha}\nBase: ${ctx.data.baseSha}\nSource/test SHA256: ${ctx.data.sourceDigest}\n\n[Handoff](${base}/${ctx.assignment.handoffFile}) · [${ctx.data.deliveryV2Published ? "Review" : "Original review artifact"}](${base}/${ctx.assignment.artifactDir}/${ctx.data.deliveryV2Published ? "review-v2.json" : "review.json"}) · [Checks](${base}/${ctx.assignment.artifactDir}/checks.json)\n\n${ctx.assignment.acceptance.description}\n${accepted ? `\nProject acceptance: accepted for this exact head/base.\n${ctx.data.ciChecks.map((check) => `- ${check.name}: ${check.url} (check ${check.checkId}, app ${check.appId})`).join("\n")}` : ""}${delivery}`;
  }
  const stages = {
    prepare,
    plan,
    implement,
    review,
    verify,
    commit,
    publish: async (ctx) => {
      await assertSource(ctx);
      await git(
        ctx.data.worktree,
        "push",
        "origin",
        `HEAD:refs/heads/${ctx.data.branch}`,
      );
      await gh.publish(ctx, prBody(ctx));
      await progress(ctx, "PR publikován; čeká GitHub CI");
    },
    ci: async (ctx) => {
      const pr = await gh.pr(ctx.data.prNumber);
      gh.assertPr(pr, ctx);
      const ciChecks = await gh.waitChecks(
        ctx.data.commitSha,
        {
          event: "pull_request",
          prNumber: pr.number,
          baseSha: ctx.data.baseSha,
          branch: ctx.data.branch,
        },
        () => heartbeat(ctx),
      );
      gh.assertPr(await gh.pr(pr.number), ctx);
      return { ciChecks };
    },
    accept: async (ctx) => {
      await ensureReviewsV2(ctx);
      await assertSource(ctx);
      if (
        reviewResults(ctx).length !== 3 ||
        reviewResults(ctx).some((review) => review.result.findings.length) ||
        ctx.data.checks.some((check) => check.exitCode !== 0)
      )
        throw problem("NOT_VERIFIED", "Cannot accept unverified candidate");
      const acceptance = await gh.accept(ctx, prBody(ctx, true));
      await ctx.save({
        acceptance,
        acceptanceDeliverySha256: ctx.data.deliveryV2.proofSha256,
      });
      await progress(ctx, "Přijato pro přesný head/base a skutečné CI");
    },
    merge: async (ctx) => {
      if (!ctx.assignment.merge) return { awaitingMerge: true };
      const pr = await gh.pr(ctx.data.prNumber);
      gh.assertPr(pr, ctx, { allowMerged: Boolean(pr.merged) });
      if (pr.merged) {
        if (!/^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? ""))
          throw problem(
            "MERGE_IDENTITY",
            "Merged PR has no valid merge commit identity",
          );
        return { mergeSha: pr.merge_commit_sha };
      }
      await ensureReviewsV2(ctx);
      if (ctx.data.acceptanceDeliverySha256 !== ctx.data.deliveryV2.proofSha256)
        await stages.accept(ctx);
      return { mergeSha: await gh.merge(ctx) };
    },
    finalize: async (ctx) => {
      if (!ctx.data.finalizationReady && ctx.assignment.merge) {
        const pr = await gh.pr(ctx.data.prNumber);
        gh.assertPr(pr, ctx, { allowMerged: true });
        if (!pr.merged || pr.merge_commit_sha !== ctx.data.mergeSha)
          throw problem(
            "MERGE_IDENTITY",
            "PR is not confirmed merged at the recorded commit",
          );
        await git(
          ctx.data.worktree,
          "fetch",
          "origin",
          ctx.assignment.baseBranch,
        );
        await git(
          ctx.data.worktree,
          "merge-base",
          "--is-ancestor",
          ctx.data.mergeSha,
          `origin/${ctx.assignment.baseBranch}`,
        );
        const mainChecks = await gh.waitChecks(
          ctx.data.mergeSha,
          { event: "push", branch: ctx.assignment.baseBranch },
          () => heartbeat(ctx),
        );
        await ctx.save({ mainChecks });
        await lin.setState(
          await lin.getIssue(ctx.assignment.issue),
          ctx.assignment.linearStates.done,
        );
        await progress(ctx, "Sloučeno; main CI přesného merge commitu úspěšné");
      } else if (!ctx.data.finalizationReady)
        await progress(
          ctx,
          "PR připraven; merge=false, Linear zůstává otevřený",
        );
      if (
        Object.values(ctx.state.attempts).some(
          (attempt) => attempt.status !== "complete",
        )
      )
        throw problem(
          "WORKER_ACTIVE",
          "Cannot release claims with unfinished supervised work",
        );
      await ctx.save({ finalizationReady: true });
      await release(ctx, ctx.data.workerTask, ctx.data.workerOwner);
      await ctx.fault("after-worker-release");
      await release(ctx, ctx.data.controllerTask, ctx.data.owner);
      return { finalized: true };
    },
  };
  return {
    async runStage(stage, ctx) {
      clients(ctx);
      if (!stages[stage])
        throw problem("UNKNOWN_STAGE", `Unknown stage ${stage}`);
      if (stage !== "prepare" && stage !== "finalize") await heartbeat(ctx);
      return stages[stage](ctx);
    },
    async close() {
      await lin?.close?.();
    },
  };
}
