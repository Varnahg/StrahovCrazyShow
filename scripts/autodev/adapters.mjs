import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  open,
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
  ensureExternalAcceptance,
  loadExternalAuthority,
} from "./external-acceptance.mjs";
import {
  inScope,
  parseDirty,
  safePath,
  ignoredSnapshot,
  auditScope,
  workingSnapshot,
  assertStageScope,
  sourceIdentity,
  slash,
  overlap,
  git,
  nul,
  samePath,
} from "./source.mjs";
export {
  inScope,
  parseDirty,
  safePath,
  ignoredSnapshot,
  auditScope,
  workingSnapshot,
  assertStageScope,
  sourceIdentity,
};
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
  authorizationBinding,
  validatePresentation,
  completeSpecification,
  hasRequiredPresentation,
  assertPriorReadiness,
  OUTPUT_SCHEMA_VERSION,
  readWorkerAttemptInput,
  readReviewAuthority,
  isLegacyBlindAuthorityInput,
  isExactLegacyBlindAuthorityRefusal,
} from "./codex.mjs";

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
  await reconcileSpecAmendment(ctx);
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

async function reconcileSpecAmendment(ctx) {
  const amendment = ctx.data.specAmendmentV1;
  if (!amendment || amendment.completed) return;
  const from = specIdentity(amendment.fromText),
    to = specIdentity(amendment.toText);
  if (
    digest(from) !== digest(amendment.from) ||
    digest(to) !== digest(amendment.to) ||
    from.frozenSha256 !== to.frozenSha256 ||
    from.frozenSha256 !== ctx.data.spec.frozenSha256 ||
    ctx.data.spec.sha256 !== from.sha256 ||
    ctx.data.sourceDigest !== amendment.sourceDigest ||
    !hasRequiredPresentation(amendment.toText)
  )
    throw problem(
      "BMAD_SPEC",
      "Invalid durable specification amendment identity",
    );
  const source = await sourceIdentity(
    ctx.data.worktree,
    ctx.data.baseSha,
    ctx.data.workerTask.writePaths,
  );
  if (source.digest !== amendment.sourceDigest)
    throw problem(
      "SOURCE_CHANGED",
      "Source changed during specification amendment",
    );
  const current = await readFile(ctx.data.specFile, "utf8");
  if (current !== amendment.fromText && current !== amendment.toText)
    throw problem(
      "BMAD_SPEC",
      "Specification differs from both amendment endpoints",
    );
  const temporary = await inspectAmendmentTemp(ctx, amendment);
  if (current === amendment.toText && temporary.exists)
    throw problem(
      "BMAD_SPEC_TEMP",
      "A temp alongside the completed endpoint is ambiguous; preserved",
    );
  assertStageScope(amendment.before, await workingSnapshot(ctx.data.worktree), [
    slash(path.relative(ctx.data.worktree, ctx.data.specFile)),
    ...(temporary.exists ? [temporary.relative] : []),
  ]);
  if (current === amendment.fromText && temporary.exists)
    await finishAmendmentTemp(ctx, amendment);
  if (current === amendment.toText || temporary.exists)
    await ctx.save({
      spec: { ...ctx.data.spec, ...to, pendingStatus: null },
      specAmendmentV1: { ...amendment, completed: true },
    });
}

async function inspectAmendmentTemp(ctx, amendment) {
  const temp = amendment.temporary;
  if (
    !object(temp) ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(temp.nonce ?? "") ||
    temp.path !== `${ctx.data.specFile}.amendment-${temp.nonce}.tmp` ||
    temp.owner !== ctx.data.owner ||
    temp.wasAbsent !== true ||
    temp.targetSha256 !== amendment.to.sha256
  )
    throw problem(
      "BMAD_SPEC_TEMP",
      "Missing exact durable amendment temp identity",
    );
  const relative = slash(path.relative(ctx.data.worktree, temp.path));
  if (
    !inScope(relative, ctx.data.controllerTask.writePaths) ||
    Object.hasOwn(amendment.before, relative)
  )
    throw problem(
      "BMAD_SPEC_TEMP",
      "Amendment temp was not absent inside the controller claim",
    );
  await safePath(ctx.data.worktree, relative);
  const target = Buffer.from(amendment.toText, "utf8");
  let stat;
  try {
    stat = await lstat(temp.path);
  } catch (error) {
    if (error.code === "ENOENT")
      return { ...temp, relative, target, exists: false };
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1)
    throw problem(
      "BMAD_SPEC_TEMP",
      "Amendment temp is not an unshared regular file; preserved",
    );
  const bytes = await readFile(temp.path);
  if (
    bytes.length > target.length ||
    !bytes.equals(target.subarray(0, bytes.length))
  )
    throw problem(
      "BMAD_SPEC_TEMP",
      "Amendment temp is not an exact target byte-prefix; preserved",
    );
  return { ...temp, relative, target, exists: true, stat, bytes };
}

async function finishAmendmentTemp(ctx, amendment) {
  // The durable nonce/path, observed absence and held controller claim bind
  // this one file. Complete only its exact UTF-8 byte-prefix, never truncate
  // unknown contents or sweep other temporary paths.
  const temp = await inspectAmendmentTemp(ctx, amendment);
  const handle = await open(temp.path, temp.exists ? "r+" : "wx+");
  const sameFile = (a, b) =>
    a.dev === b.dev && a.ino === b.ino && b.isFile() && b.nlink === 1;
  let identity;
  try {
    identity = await handle.stat();
    if (temp.exists && !sameFile(temp.stat, identity))
      throw problem(
        "BMAD_SPEC_TEMP",
        "Amendment temp identity changed before opening",
      );
    if (!temp.exists) await ctx.fault("after-spec-amendment-temp-create");
    const prefix = await handle.readFile();
    if (
      prefix.length > temp.target.length ||
      !prefix.equals(temp.target.subarray(0, prefix.length)) ||
      !sameFile(identity, await lstat(temp.path))
    )
      throw problem(
        "BMAD_SPEC_TEMP",
        "Amendment temp changed while opening; preserved",
      );
    await handle.writeFile(temp.target.subarray(prefix.length));
    await handle.sync();
  } finally {
    await handle.close();
  }
  const complete = await inspectAmendmentTemp(ctx, amendment);
  if (
    !complete.exists ||
    !sameFile(identity, complete.stat) ||
    !complete.bytes.equals(temp.target)
  )
    throw problem(
      "BMAD_SPEC_TEMP",
      "Amendment temp changed before rename; preserved",
    );
  await ctx.fault("after-spec-amendment-temp-write");
  await rename(temp.path, ctx.data.specFile);
  await ctx.fault("after-spec-amendment-write");
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

// Mirrors the pinned Python renderer: Path.resolve() native string, basename
// slug (80 characters), then the first twelve SHA256 digits. The enclosing
// prefix covers both immutable snapshots and .staging-* siblings.
export function bmadRenderPrefix(worktree) {
  const resolved = path.resolve(worktree);
  const slug =
    path
      .basename(resolved)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .replace(/-$/g, "") || "project";
  return `_bmad/render/bmad-build/${slug}-${digest(resolved).slice(0, 12)}/`;
}

export function assertBmadRenderScope(worktree, writePaths) {
  const prefix = bmadRenderPrefix(worktree);
  if (
    !writePaths.some((scope) => scope.endsWith("/") && inScope(prefix, [scope]))
  )
    throw problem(
      "TASK_SCOPE",
      `Controller task must reserve renderer snapshots and staging in ${prefix}`,
    );
  return prefix;
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
        planInputNamesMismatch(
          ctx.data.plan.provenance.inlineInputs,
          snapshot,
        ) ||
        ctx.data.plan.provenance.authorizationSha256 !==
          digest(authorizationBinding(ctx))
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
    if (ctx.data.specCompletionInputV1 || ctx.data.specAmendmentV1)
      return completeLegacyPlanning(ctx, snapshot);
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
    if (
      ctx.data.planReadinessV2.result.ready === false &&
      !ctx.data.plan.result.presentation &&
      ctx.data.spec?.created &&
      !hasRequiredPresentation(await recordedSpecificationText(ctx))
    )
      return completeLegacyPlanning(ctx, snapshot);
    assertPlanningReady(ctx.data.planReadinessV2.result);
    return ctx.data.planReadinessV2;
  }
  function planInputNamesMismatch(hashes, snapshot) {
    return Object.entries(planningInputHashes(snapshot)).some(
      ([name, sha256]) => hashes?.[name] !== sha256,
    );
  }
  function completionIdentity(ctx) {
    const completion = ctx.data.specCompletionV2 ?? ctx.data.specCompletionV1;
    if (!completion)
      throw problem("SPEC_RECONCILIATION", "Selected completion is missing");
    return {
      key: ctx.data.specCompletionV2
        ? "spec-completion:v2"
        : "spec-completion:v1",
      attemptId: completion.attemptId,
      resultSha256: digest(completion.result),
      outputSchema: completion.provenance?.outputSchema ?? null,
    };
  }
  function completionHistory(ctx) {
    return {
      selected: completionIdentity(ctx),
      originalFailure: ctx.data.specCompletionRepairV2 ?? null,
    };
  }
  async function planningCompletion(ctx, snapshot, input, authorization) {
    const baseChecks = async (completion) => {
      assertStageScope(
        ctx.data.specCompletionBeforeV1,
        await workingSnapshot(ctx.data.worktree),
        [],
      );
      await assertSource(ctx);
      validateWorkerResult("plan-readiness-v3", completion.result);
      if (
        planInputNamesMismatch(completion.provenance?.inlineInputs, snapshot) ||
        completion.provenance?.authorizationSha256 !== digest(authorization)
      )
        throw problem(
          "SPEC_MIGRATION",
          "Completion lacks verified instructions/authorization",
        );
    };
    const readyChecks = (completion) => {
      // Truthful blocked/null results stop here before any presentation repair.
      assertPlanningReady(completion.result);
      assertPriorReadiness(
        input.priorReadiness,
        completion.result.priorReadiness,
        authorization,
      );
      validatePresentation(completion.result.presentation, ctx);
    };
    if (!ctx.data.specCompletionRepairV2) {
      try {
        let completion = ctx.data.specCompletionV1;
        if (!completion) {
          completion = await worker(ctx, {
            kind: "spec-completion",
            heartbeat: beats(ctx),
          });
          await baseChecks(completion);
          await ctx.save({ specCompletionV1: completion });
        }
        readyChecks(completion);
        return completion;
      } catch (error) {
        if (error.code !== "SPEC_PRESENTATION") throw error;
        // This sole compatibility repair is for the old unbound output
        // contract, not a retry of a current schema-constrained worker.
        if (
          ctx.data.specAmendmentV1 ||
          ctx.data.planReadinessInputV3 ||
          ctx.state.attempts["plan-readiness:v3"] ||
          !ctx.state.attempts["spec-completion:v1"]
        )
          throw error;
        const original = await resumeWorkerAttempt(ctx, "spec-completion:v1");
        if (
          original.receipt.exitCode !== 0 ||
          !original.inputPath ||
          !original.inputSha256 ||
          original.provenance.deliveryProtocol !== DELIVERY_PROTOCOL ||
          original.provenance.specFormatVersion !== 1 ||
          original.provenance.outputSchema
        )
          throw error;
        let result;
        try {
          result = JSON.parse(original.raw);
        } catch {
          throw error;
        }
        const record = {
          result,
          provenance: original.provenance,
          attemptId: original.receipt.attemptId,
        };
        await baseChecks(record);
        assertPlanningReady(result);
        assertPriorReadiness(
          input.priorReadiness,
          result.priorReadiness,
          authorization,
        );
        try {
          validatePresentation(result.presentation, ctx);
          throw problem(
            "SPEC_MIGRATION",
            "Original completion has no demonstrated presentation violation",
          );
        } catch (failure) {
          if (failure.code !== "SPEC_PRESENTATION") throw failure;
        }
        const failure = {
          key: "spec-completion:v1",
          requestDigest: original.requestDigest,
          receipt: original.receipt,
          inputPath: original.inputPath,
          inputSha256: original.inputSha256,
          outputPath: original.outputPath,
          raw: original.raw,
          rawSha256: digest(original.raw),
          result,
          resultSha256: digest(result),
          validationCode: "SPEC_PRESENTATION",
        };
        await ctx.save({
          specCompletionRepairV2: failure,
          specCompletionInputV2: {
            ...input,
            completionHistory: { originalFailure: failure },
            outputContract: ctx.data.specCompletionContract,
          },
        });
        await ctx.fault("after-spec-completion-v2-intent");
      }
    }
    const prior = ctx.data.specCompletionRepairV2;
    const original = await resumeWorkerAttempt(ctx, "spec-completion:v1");
    if (
      original.requestDigest !== prior.requestDigest ||
      original.inputSha256 !== prior.inputSha256 ||
      digest(original.receipt) !== digest(prior.receipt) ||
      digest(original.raw) !== prior.rawSha256 ||
      digest(
        ctx.data.specCompletionInputV2.completionHistory.originalFailure,
      ) !== digest(prior) ||
      digest(ctx.data.specCompletionInputV2.outputContract) !==
        digest(ctx.data.specCompletionContract)
    )
      throw problem(
        "SPEC_MIGRATION",
        "Original failed completion or repair contract changed",
      );
    let completion = ctx.data.specCompletionV2;
    if (!completion) {
      completion = await worker(ctx, {
        kind: "spec-completion-v2",
        heartbeat: beats(ctx),
      });
      await baseChecks(completion);
      if (
        completion.provenance?.outputSchema?.contractVersion !==
        OUTPUT_SCHEMA_VERSION
      )
        throw problem(
          "WORKER_SCHEMA",
          "Contract repair lacks its bound output schema",
        );
      await ctx.save({ specCompletionV2: completion });
      await ctx.fault("after-spec-completion-v2-result");
    }
    readyChecks(completion);
    return completion;
  }
  async function completeLegacyPlanning(ctx, snapshot) {
    if (ctx.data.specAmendmentV1?.completed && ctx.data.planReadinessV3) {
      await assertSource(ctx);
      const amendment = ctx.data.specAmendmentV1;
      if (
        ctx.data.spec.bodySha256 !== amendment.to.bodySha256 ||
        ctx.data.spec.frozenSha256 !== amendment.from.frozenSha256 ||
        ctx.data.sourceDigest !== amendment.sourceDigest ||
        digest(ctx.data.planReadinessV3.binding) !==
          digest(readinessBinding(ctx, snapshot)) ||
        digest(amendment.authorization) !== digest(authorizationBinding(ctx))
      )
        throw problem(
          "SPEC_MIGRATION",
          "Completed specification proof changed",
        );
      validateWorkerResult(
        "plan-readiness-v3",
        ctx.data.planReadinessV3.result,
      );
      if (
        !object(ctx.data.planReadinessV3.priorReadiness) ||
        digest(ctx.data.planReadinessV3.priorReadiness.result) !==
          digest(ctx.data.planReadinessV2.result) ||
        digest(ctx.data.planReadinessV3.priorReadiness) !==
          digest(ctx.data.specCompletionInputV1.priorReadiness) ||
        ctx.data.planReadinessV3.provenance?.specSha256 !==
          amendment.to.sha256 ||
        ctx.data.planReadinessV3.provenance?.authorizationSha256 !==
          digest(authorizationBinding(ctx))
      )
        throw problem(
          "SPEC_RECONCILIATION",
          "Cached proof lost its original negative readiness",
        );
      if (
        digest(ctx.data.planReadinessV3.completionIdentity) !==
          digest(completionIdentity(ctx)) ||
        digest(ctx.data.specAmendmentV1.completionIdentity) !==
          digest(completionIdentity(ctx))
      )
        throw problem(
          "SPEC_RECONCILIATION",
          "Cached proof does not identify the actual selected completion",
        );
      assertPriorReadiness(
        ctx.data.specCompletionInputV1.priorReadiness,
        ctx.data.planReadinessV3.result.priorReadiness,
        authorizationBinding(ctx),
      );
      assertPlanningReady(ctx.data.planReadinessV3.result);
      return ctx.data.planReadinessV3;
    }
    // One explicitly bounded precommit migration, never a retry-until-green.
    if (
      ctx.state.stage !== "review" ||
      ctx.data.commitSha ||
      ctx.data.stagingIntent ||
      ctx.data.commitIntent ||
      ctx.data.prNumber ||
      ctx.data.prIntent ||
      ctx.data.reviewsV2 ||
      ctx.data.reviewBeforeV2 ||
      ctx.data.deliveryV2 ||
      ctx.data.verifiedSourceDigest ||
      ctx.data.plan.provenance?.deliveryProtocol === DELIVERY_PROTOCOL ||
      ctx.data.plan.result.presentation ||
      Object.keys(ctx.state.attempts).some(
        (key) => key.startsWith("review:v2:") || key.startsWith("check:"),
      )
    )
      throw problem(
        "SPEC_MIGRATION",
        "Specification completion is restricted to legacy precommit/pre-v2-review candidates",
      );
    const originals = await settleLegacyReviews(ctx, true);
    assertNoLegacyFindings(ctx, originals);
    for (const [key, expected] of [
      ["plan", ctx.data.plan],
      ["implement", ctx.data.implementation],
      ["plan-readiness:v2", ctx.data.planReadinessV2],
    ]) {
      if (!expected || !ctx.state.attempts[key])
        throw problem("SPEC_MIGRATION", `Missing original ${key} evidence`);
      const terminal = await resumeWorkerAttempt(ctx, key);
      let result;
      try {
        result = JSON.parse(terminal.raw);
      } catch {
        throw problem("SPEC_MIGRATION", `Invalid original ${key} output`);
      }
      if (
        terminal.receipt.exitCode !== 0 ||
        digest(result) !== digest(expected.result) ||
        (expected.attemptId &&
          expected.attemptId !== terminal.receipt.attemptId)
      )
        throw problem(
          "SPEC_MIGRATION",
          `Original ${key} terminal identity differs`,
        );
    }
    if (ctx.data.planReadinessV2.result.ready !== false)
      throw problem(
        "SPEC_MIGRATION",
        "Completion requires the preserved unsuccessful original readiness",
      );
    const candidateIdentity = await assertSource(ctx);
    const authorization = authorizationBinding(ctx);
    const contract = {
      version: OUTPUT_SCHEMA_VERSION,
      sourceDigest: ctx.data.sourceDigest,
      workerPaths: candidateIdentity.identity.files
        .map((entry) => entry.file)
        .sort(),
    };
    if (!ctx.data.specCompletionContract)
      await ctx.save({ specCompletionContract: contract });
    else if (digest(ctx.data.specCompletionContract) !== digest(contract))
      throw problem(
        "WORKER_SCHEMA",
        "Concrete completion worker files changed",
      );
    if (!ctx.data.specCompletionInputV1) {
      const specText = await recordedSpecificationText(ctx),
        candidate = await assertSource(ctx);
      if (hasRequiredPresentation(specText))
        throw problem("SPEC_MIGRATION", "No missing presentation to complete");
      await ctx.save({
        specCompletionInputV1: {
          protocol: DELIVERY_PROTOCOL,
          binding: readinessBinding(ctx, snapshot),
          plan: ctx.data.plan.result,
          intent: ctx.data.intent,
          specText,
          candidateDiff: candidate.diff,
          sourceDigest: candidate.digest,
          authorization,
          priorReadiness: {
            result: ctx.data.planReadinessV2.result,
            sha256: digest(ctx.data.planReadinessV2.result),
            attemptId: ctx.data.planReadinessV2.attemptId,
            authorizationSha256: digest(authorization),
          },
        },
        specCompletionBeforeV1: await workingSnapshot(ctx.data.worktree),
      });
      await ctx.fault("after-spec-completion-input");
    }
    const input = ctx.data.specCompletionInputV1;
    if (
      digest(input.authorization) !== digest(authorization) ||
      input.sourceDigest !== ctx.data.sourceDigest ||
      input.binding.planSha256 !== digest(ctx.data.plan.result) ||
      input.binding.intentSha256 !== digest(ctx.data.intent) ||
      input.binding.snapshotSha256 !== snapshot.identity.manifestSha256 ||
      input.binding.frozenSha256 !== ctx.data.spec.frozenSha256 ||
      digest(input.priorReadiness?.result) !==
        digest(ctx.data.planReadinessV2.result)
    )
      throw problem("SPEC_MIGRATION", "Frozen completion input changed");
    const completion = await planningCompletion(
      ctx,
      snapshot,
      input,
      authorization,
    );
    const target = completeSpecification(
      ctx,
      input.specText,
      completion.result.presentation,
    );
    if (!ctx.data.specAmendmentV1) {
      if ((await recordedSpecificationText(ctx)) !== input.specText)
        throw problem(
          "BMAD_SPEC",
          "Original specification changed before amendment",
        );
      const nonce = randomUUID(),
        temporaryPath = `${ctx.data.specFile}.amendment-${nonce}.tmp`;
      try {
        await lstat(temporaryPath);
        throw problem(
          "BMAD_SPEC_TEMP",
          "Planned amendment temp already exists; preserved",
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      const before = await workingSnapshot(ctx.data.worktree);
      if (
        Object.hasOwn(
          before,
          slash(path.relative(ctx.data.worktree, temporaryPath)),
        )
      )
        throw problem(
          "BMAD_SPEC_TEMP",
          "Planned amendment temp was not absent",
        );
      await ctx.save({
        specAmendmentV1: {
          fromText: input.specText,
          toText: target,
          from: specIdentity(input.specText),
          to: specIdentity(target),
          sourceDigest: ctx.data.sourceDigest,
          completed: false,
          before,
          temporary: {
            nonce,
            path: temporaryPath,
            owner: ctx.data.owner,
            wasAbsent: true,
            targetSha256: digest(target),
          },
          authorization,
          completionIdentity: completionIdentity(ctx),
          size: {
            characters: target.length,
            words: target.trim().split(/\s+/).length,
            tokenCount: null,
          },
        },
      });
      await ctx.fault("after-spec-amendment-intent");
    }
    if (ctx.data.specAmendmentV1.toText !== target)
      throw problem(
        "BMAD_SPEC",
        "Durable amendment differs from the preserved completion result",
      );
    await reconcileSpecAmendment(ctx);
    if (!ctx.data.specAmendmentV1.completed) {
      await atomicText(
        path.join(ctx.runDir, "spec-before-completion-v1.md"),
        input.specText,
      );
      await finishAmendmentTemp(ctx, ctx.data.specAmendmentV1);
      await reconcileSpecAmendment(ctx);
      await ctx.fault("after-spec-amendment-checkpoint");
    }
    if (!ctx.data.planReadinessInputV3) {
      await ctx.save({
        planReadinessInputV3: {
          ...input,
          binding: readinessBinding(ctx, snapshot),
          specText: target,
          completionAssessment: completion.result.priorReadiness,
          completionHistory: completionHistory(ctx),
        },
        planReadinessBeforeV3: await workingSnapshot(ctx.data.worktree),
      });
    }
    if (
      digest(ctx.data.planReadinessInputV3.binding) !==
        digest(readinessBinding(ctx, snapshot)) ||
      digest(ctx.data.planReadinessInputV3.priorReadiness) !==
        digest(input.priorReadiness) ||
      digest(ctx.data.planReadinessInputV3.completionAssessment) !==
        digest(completion.result.priorReadiness) ||
      digest(ctx.data.planReadinessInputV3.completionHistory) !==
        digest(completionHistory(ctx))
    )
      throw problem("SPEC_MIGRATION", "Amended readiness binding changed");
    if (!ctx.data.planReadinessV3) {
      const result = await worker(ctx, {
        kind: "plan-readiness-v3",
        heartbeat: beats(ctx),
      });
      assertStageScope(
        ctx.data.planReadinessBeforeV3,
        await workingSnapshot(ctx.data.worktree),
        [],
      );
      await assertSource(ctx);
      validateWorkerResult("plan-readiness-v3", result.result);
      if (
        planInputNamesMismatch(result.provenance?.inlineInputs, snapshot) ||
        result.provenance?.authorizationSha256 !== digest(authorization) ||
        result.provenance?.specSha256 !== digest(target)
      )
        throw problem(
          "SPEC_MIGRATION",
          "Final readiness lacks amended specification provenance",
        );
      await ctx.save({
        planReadinessV3: {
          ...result,
          binding: ctx.data.planReadinessInputV3.binding,
          sourceDigest: ctx.data.sourceDigest,
          priorReadiness: input.priorReadiness,
          completionAssessment: completion.result.priorReadiness,
          completionIdentity: completionIdentity(ctx),
          completionHistory: completionHistory(ctx),
        },
      });
    }
    await atomicWriteJson(
      path.join(ctx.runDir, "spec-completion-v1-evidence.json"),
      {
        input,
        completion,
        completionHistory: completionHistory(ctx),
        amendment: ctx.data.specAmendmentV1,
        readiness: ctx.data.planReadinessV3,
      },
    );
    assertPriorReadiness(
      input.priorReadiness,
      ctx.data.planReadinessV3.result.priorReadiness,
      authorization,
    );
    assertPlanningReady(ctx.data.planReadinessV3.result);
    return ctx.data.planReadinessV3;
  }
  function assertNoLegacyFindings(ctx, originals) {
    if (
      [...originals, ...(ctx.data.reviews ?? [])].some(
        (review) => review.result?.findings?.length,
      )
    )
      throw problem(
        "REVIEW_FINDINGS",
        "Original review has unresolved findings; input delivery cannot clear them",
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
  async function reconcileBlindAuthority(ctx, binding, snapshot) {
    if (
      ctx.state.stage !== "review" ||
      ctx.data.commitSha ||
      ctx.data.stagingIntent ||
      ctx.data.commitIntent ||
      ctx.data.prNumber ||
      ctx.data.verifiedSourceDigest ||
      !ctx.data.reviewBeforeV2 ||
      !ctx.data.reviewV2Binding
    )
      throw problem(
        "REVIEW_OUTPUT",
        "Blind authority repair is restricted to the original precommit review checkpoint",
      );
    const lenses = ["blind", "edge", "verification"],
      prefix = ctx.data.sourceDigest.slice(0, 32);
    // Do not dispatch anything while an original is live, missing, uncertain,
    // or corrupt. State.status alone is not proof of a terminal worker.
    for (const lens of lenses) {
      const key = `review:v2:${lens}:${prefix}`,
        attempt = ctx.state.attempts[key];
      if (
        !attempt ||
        !/^[a-f0-9]{24}$/.test(attempt.id) ||
        (await readJson(
          path.join(ctx.runDir, "attempts", attempt.id, "receipt.json"),
          { optional: true },
        )) === undefined
      )
        throw problem(
          "UNKNOWN_ATTEMPT",
          `No terminal original review receipt for ${lens}`,
        );
    }
    const settled = await Promise.allSettled(
      lenses.map(async (lens) => {
        const key = `review:v2:${lens}:${prefix}`,
          input = await readWorkerAttemptInput(ctx, key),
          original = await resumeWorkerAttempt(ctx, key);
        if (original.receipt.exitCode !== 0)
          throw problem(
            "WORKER_FAILED",
            `Original ${lens} reviewer failed; no replacement is authorized`,
          );
        if (
          input.provenance.deliveryProtocol !== DELIVERY_PROTOCOL ||
          input.provenance.promptSha256 !== digest(input.prompt) ||
          input.provenance.diffSha256 !== binding.diffSha256 ||
          digest(input.provenance.snapshot) !== digest(ctx.data.bmadSnapshot) ||
          input.provenance.specSha256 !==
            (lens === "edge" ? ctx.data.spec.sha256 : null)
        )
          throw problem(
            "REVIEW_INPUT",
            `Original ${lens} review binding changed`,
          );
        const bytes = await readFile(original.outputPath),
          stdout = await readFile(original.receipt.stdoutPath);
        if (
          typeof original.raw !== "string" ||
          !Buffer.from(original.raw, "utf8").equals(bytes)
        )
          throw problem(
            "REVIEW_OUTPUT",
            "Original review output is not exact UTF-8",
          );
        let result = null,
          failure = null;
        try {
          result = parseReviewResult(lens, original.raw);
        } catch (error) {
          if (error.code !== "REVIEW_OUTPUT") throw error;
          failure = { code: error.code, message: error.message };
        }
        return {
          lens,
          key,
          input,
          bytes,
          stdout,
          result,
          failure,
          record: {
            lens,
            key,
            requestDigest: original.requestDigest,
            inputPath: original.inputPath,
            inputSha256: original.inputSha256,
            provenance: original.provenance,
            outputPath: original.outputPath,
            receipt: original.receipt,
            raw: original.raw,
            rawSha256: digest(original.raw),
            stdoutSha256: createHash("sha256").update(stdout).digest("hex"),
            result,
            failure,
          },
        };
      }),
    );
    const rejected = settled.find((entry) => entry.status === "rejected");
    if (rejected) throw rejected.reason;
    const entries = settled.map((entry) => entry.value);
    if (entries.some((entry) => entry.result?.findings.length))
      throw problem(
        "REVIEW_FINDINGS",
        "An original review has findings; authority delivery cannot clear them",
      );
    for (const entry of entries.filter((entry) => entry.lens !== "blind"))
      if (entry.failure)
        throw problem(
          "REVIEW_OUTPUT",
          `Original ${entry.lens} review is incomplete; no replacement is authorized`,
        );
    const toReview = (entry) => ({
      lens: entry.lens,
      result: entry.result,
      provenance: entry.record.provenance,
      outputPath: entry.record.outputPath,
      attemptId: entry.record.receipt.attemptId,
      exitCode: entry.record.receipt.exitCode,
      stdoutPath: entry.record.receipt.stdoutPath,
      stderrPath: entry.record.receipt.stderrPath,
    });
    const blind = entries[0];
    assertStageScope(
      ctx.data.reviewBeforeV2,
      await workingSnapshot(ctx.data.worktree),
      [],
    );
    await assertSource(ctx);
    if (!blind.failure && !ctx.data.blindAuthorityRepairV1)
      return entries.map(toReview);
    if (
      !isLegacyBlindAuthorityInput(ctx, snapshot, blind.input) ||
      !isExactLegacyBlindAuthorityRefusal(blind.bytes, blind.stdout)
    )
      throw problem(
        "REVIEW_OUTPUT",
        "Original blind output is not the exact coordinator-reviewed authority refusal",
      );
    const originals = entries.map((entry) => entry.record),
      authority = (await readReviewAuthority(ctx)).binding,
      intent = {
        version: 1,
        key: `review:authority-v1:blind:${prefix}`,
        binding,
        authority,
        originals,
      };
    if (!ctx.data.blindAuthorityRepairV1) {
      await ctx.save({ blindAuthorityRepairV1: intent });
      await ctx.fault("after-blind-authority-intent");
    } else if (digest(ctx.data.blindAuthorityRepairV1) !== digest(intent))
      throw problem(
        "REVIEW_INPUT",
        "Original reviews or authority input changed after repair intent",
      );
    if (!ctx.data.blindAuthorityReviewV1) {
      const replacement = {
        lens: "blind",
        ...(await worker(ctx, {
          kind: "review",
          lens: "blind",
          identity: ctx.data.sourceDigest,
          heartbeat: beats(ctx),
          authorityRepair: true,
        })),
      };
      assertStageScope(
        ctx.data.reviewBeforeV2,
        await workingSnapshot(ctx.data.worktree),
        [],
      );
      await assertSource(ctx);
      if (
        digest(replacement.provenance?.projectAuthority) !==
          digest(authority) ||
        replacement.provenance?.diffSha256 !== binding.diffSha256 ||
        digest(replacement.provenance?.snapshot) !==
          digest(ctx.data.bmadSnapshot)
      )
        throw problem(
          "REVIEW_INPUT",
          "Replacement blind did not receive the exact authority/candidate inputs",
        );
      parseReviewResult("blind", replacement.result.raw);
      await ctx.save({ blindAuthorityReviewV1: replacement });
      await ctx.fault("after-blind-authority-result");
    }
    if (
      parseReviewResult("blind", ctx.data.blindAuthorityReviewV1.result.raw)
        .findings.length
    )
      throw problem(
        "REVIEW_FINDINGS",
        "Replacement blind has findings; no further authority attempt is allowed",
      );
    return [ctx.data.blindAuthorityReviewV1, ...entries.slice(1).map(toReview)];
  }
  function assertAuthoritySelection(ctx, binding) {
    const intent = ctx.data.blindAuthorityRepairV1;
    if (!intent) return;
    if (
      digest(intent.binding) !== digest(binding) ||
      !ctx.data.blindAuthorityReviewV1
    )
      throw problem("REVIEW_INPUT", "Cached authority repair binding changed");
    for (const review of ctx.data.reviewsV2) {
      if (review.lens === "blind") {
        if (
          digest(review) !== digest(ctx.data.blindAuthorityReviewV1) ||
          digest(review.provenance.projectAuthority) !==
            digest(intent.authority)
        )
          throw problem(
            "REVIEW_INPUT",
            "Cached proof replaced the authority blind result",
          );
      } else {
        const original = intent.originals.find(
          (entry) => entry.lens === review.lens,
        );
        if (
          !original ||
          review.attemptId !== original.receipt.attemptId ||
          digest(review.provenance) !== digest(original.provenance) ||
          digest(review.result) !== digest(original.result)
        )
          throw problem(
            "REVIEW_INPUT",
            "Cached proof replaced an original valid review",
          );
      }
    }
  }
  async function ensureReviewsV2(ctx, auditLegacyBefore = false) {
    const originals = await settleLegacyReviews(ctx, auditLegacyBefore);
    assertNoLegacyFindings(ctx, originals);
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
      let results;
      const blindKey = `review:v2:blind:${ctx.data.sourceDigest.slice(0, 32)}`,
        snapshot = await loadBmadSnapshot(
          ctx.data.renderedWorkflow,
          ctx.data.bmadSnapshot,
        );
      if (
        ctx.data.blindAuthorityRepairV1 ||
        (ctx.state.attempts[blindKey] &&
          isLegacyBlindAuthorityInput(
            ctx,
            snapshot,
            await readWorkerAttemptInput(ctx, blindKey),
          ))
      )
        results = await reconcileBlindAuthority(ctx, binding, snapshot);
      if (!ctx.data.reviewBeforeV2)
        await ctx.save({
          reviewBeforeV2: await workingSnapshot(ctx.data.worktree),
          reviewV2Binding: binding,
        });
      const settled = results
        ? null
        : await Promise.allSettled(
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
      const failed = settled?.find((entry) => entry.status === "rejected");
      if (failed) throw failed.reason;
      results ??= settled.map((entry) => entry.value);
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
    assertAuthoritySelection(ctx, binding);
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
      ...(ctx.data.blindAuthorityRepairV1
        ? {
            authorityRepair: {
              intent: ctx.data.blindAuthorityRepairV1,
              replacement: ctx.data.blindAuthorityReviewV1,
            },
          }
        : {}),
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
      ])
        if (!inScope(file, controllerTask.writePaths))
          throw problem(
            "TASK_SCOPE",
            `Controller task does not reserve ${file}`,
          );
      assertBmadRenderScope(
        path.join(path.dirname(ctx.repo), `autodev-${ctx.runId}`),
        controllerTask.writePaths,
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
      const externalAuthority = await loadExternalAuthority(ctx, {
        baseSha,
        controllerTask,
        workerTask,
        validationTask,
      });
      await ctx.save({
        baseSha,
        controllerTask,
        workerTask,
        validationTask,
        ...(externalAuthority ? { externalAuthority } : {}),
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
    assertBmadRenderScope(
      await realpath(ctx.data.worktree),
      ctx.data.controllerTask.writePaths,
    );
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
    if (ctx.data.plan.result.presentation === null)
      assertPlanningReady(ctx.data.plan.result);
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
    const practicalAcceptance =
      ctx.assignment.acceptance.kind === "external"
        ? "Toto předání vzniká před externí praktickou přejímkou. Lokální kontroly nepotvrzují hru/GPU; následné přijetí doloží připnutý receipt nezávislého koordinátora a GitHub záznam."
        : "Hra/GPU se tímto CLI ověřením nepovažuje za otestovanou.";
    return `# Předání ${ctx.assignment.task}\n\nRun: ${ctx.runId}\nOwner: ${ctx.data.owner}; worker: ${ctx.data.workerOwner}\nBase: ${ctx.data.baseSha}\nSource/test SHA256: ${ctx.data.sourceDigest}\n\n${ctx.data.implementation.result.summary}\n\n## Ověření\n\n${ctx.data.checks.map((check) => `- ${check.id}: exit ${check.exitCode}; ${[check.command, ...check.args].join(" ")}`).join("\n")}\n\nTři nezávislé review: ${reviews.map((review) => `${review.lens} (${review.attemptId}): ${review.result.findings.length} nálezů`).join(", ")}.\n\nPřejímka: ${ctx.assignment.acceptance.description}\n\nDůkazy: ${ctx.assignment.artifactDir}/. Surové provozní logy zůstávají v git-common-dir. Integrace a main CI se dokládají ve stejném Linear run komentáři a PR. ${practicalAcceptance} Katalog přijímá koordinátor.\n`;
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
      await ensureExternalAcceptance(ctx);
      await ensureReviewsV2(ctx);
      await assertSource(ctx);
      if (
        reviewResults(ctx).length !== 3 ||
        reviewResults(ctx).some((review) => review.result.findings.length) ||
        ctx.data.checks.some((check) => check.exitCode !== 0)
      )
        throw problem("NOT_VERIFIED", "Cannot accept unverified candidate");
      await ensureExternalAcceptance(ctx, { requirePinned: true });
      const acceptance = await gh.accept(ctx, prBody(ctx, true));
      await ctx.save({
        acceptance,
        acceptanceDeliverySha256: ctx.data.deliveryV2.proofSha256,
      });
      await progress(ctx, "Přijato pro přesný head/base a skutečné CI");
    },
    merge: async (ctx) => {
      await ensureExternalAcceptance(ctx, { requirePinned: true });
      if (!ctx.assignment.merge) return { awaitingMerge: true };
      const pr = await gh.pr(ctx.data.prNumber);
      gh.assertPr(pr, ctx, { allowMerged: Boolean(pr.merged) });
      if (pr.merged) {
        if (ctx.assignment.acceptance.kind === "external")
          return { mergeSha: await gh.merge(ctx) };
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
      await ensureExternalAcceptance(ctx, { requirePinned: true });
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
        const issue = await lin.getIssue(ctx.assignment.issue);
        await ensureExternalAcceptance(ctx, { requirePinned: true });
        await lin.setState(
          issue,
          ctx.assignment.linearStates.done,
          ctx.assignment.acceptance.kind === "external"
            ? {
                beforeMutation: () =>
                  ensureExternalAcceptance(ctx, { requirePinned: true }),
              }
            : undefined,
        );
        await ensureExternalAcceptance(ctx, { requirePinned: true });
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
      await ensureExternalAcceptance(ctx, { requirePinned: true });
      await ctx.save({ finalizationReady: true });
      await release(ctx, ctx.data.workerTask, ctx.data.workerOwner);
      await ctx.fault("after-worker-release");
      await ensureExternalAcceptance(ctx, { requirePinned: true });
      await release(ctx, ctx.data.controllerTask, ctx.data.owner);
      await ensureExternalAcceptance(ctx, { requirePinned: true });
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
