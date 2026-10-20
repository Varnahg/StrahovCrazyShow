import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { problem, readJson, object, digest } from "./store.mjs";

const directory = path.dirname(fileURLToPath(import.meta.url));
const snapshotFiles = [
  "workflow.md",
  "step-02-plan.md",
  "spec-template.md",
  "step-03-implement.md",
  "step-04-review.md",
  "review-prompts/edge-case-hunter.md",
  "review-prompts/verification-gap.md",
  "references/claims-check.md",
  "references/deletion-check.md",
];

export async function loadBmadSnapshot(workflow, expected) {
  if (typeof workflow !== "string" || !path.isAbsolute(workflow))
    throw problem("BMAD_SNAPSHOT", "Missing rendered workflow path");
  const root = path.dirname(workflow);
  let manifestText;
  try {
    manifestText = await readFile(path.join(root, "manifest.json"), "utf8");
  } catch {
    throw problem(
      "BMAD_SNAPSHOT",
      "Rendered BMAD manifest is missing or unreadable",
    );
  }
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw problem("BMAD_SNAPSHOT", "Invalid rendered BMAD manifest");
  }
  const identity = {
    directory: root,
    manifestSha256: digest(manifestText),
    generation: manifest.generation_hash,
  };
  if (
    typeof identity.generation !== "string" ||
    (expected && digest(expected) !== digest(identity))
  )
    throw problem(
      "BMAD_SNAPSHOT",
      "Rendered BMAD snapshot changed after planning",
    );
  const files = {};
  for (const name of snapshotFiles) {
    const file = path.join(root, name);
    let text;
    try {
      text = await readFile(file, "utf8");
    } catch {
      throw problem(
        "BMAD_SNAPSHOT",
        `Missing rendered BMAD instruction: ${name}`,
      );
    }
    if (!text.trim() || digest(text) !== manifest.outputs?.[name])
      throw problem(
        "BMAD_SNAPSHOT",
        `Rendered BMAD instruction failed its manifest hash: ${name}`,
      );
    files[name] = { path: file, text, sha256: digest(text) };
  }
  return { identity, files };
}

function replaceSection(text, heading, body) {
  const marker = `## ${heading}`,
    start = text.indexOf(marker);
  if (start < 0 || text.indexOf(marker, start + marker.length) >= 0)
    throw problem("BMAD_TEMPLATE", `Expected one template section ${heading}`);
  const rest = text.slice(start + marker.length),
    next = rest.search(/^## /m);
  const end = next < 0 ? text.length : start + marker.length + next;
  return (
    text.slice(0, start) +
    (body === null ? "" : `## ${heading}\n\n${body}\n\n`) +
    text.slice(end)
  );
}
export function specIdentity(text) {
  const frozen = text.match(
    /<frozen-after-approval\b[^>]*>[\s\S]*?<\/frozen-after-approval>/g,
  );
  const statuses = text.match(
    /^status: ['"]?(draft|ready-for-dev|in-progress|in-review|done)['"]?[ \t]*$/gm,
  );
  if (frozen?.length !== 1 || statuses?.length !== 1)
    throw problem(
      "BMAD_SPEC",
      "Specification has no unique frozen block/status",
    );
  return {
    sha256: digest(text),
    frozenSha256: digest(frozen[0]),
    bodySha256: digest(
      text.replace(statuses[0], "status: <controller-status>"),
    ),
  };
}
export function renderSpecification(ctx, snapshot, plan) {
  validateWorkerResult("plan", plan);
  let text = snapshot.files["spec-template.md"].text.replace(
    /<!--[\s\S]*?-->/g,
    "",
  );
  const ac = [
    ...new Set([
      ...ctx.data.controllerTask.acceptance,
      ...ctx.data.workerTask.acceptance,
      ctx.assignment.acceptance.description,
    ]),
  ];
  const bullets = (items) => items.map((item) => `- ${item}`).join("\n");
  const frozen = `<frozen-after-approval reason="Explicitly assigned intent and task acceptance; controller preserves verbatim source">\n\n## Intent\n\n${ctx.data.intent.trimEnd()}\n\n## Boundaries & Constraints\n\nController task: \`${ctx.assignment.task}\`; writePaths: ${ctx.data.controllerTask.writePaths.map((file) => `\`${file}\``).join(", ")}.\n\nWorker task: \`${ctx.assignment.workerTask}\`; writePaths: ${ctx.data.workerTask.writePaths.map((file) => `\`${file}\``).join(", ")}.\n\nAGENTS.md, task definitions, live claims and docs/agents/bmad-policy.md remain authoritative.\n\n**Frozen acceptance:**\n${bullets(ac)}\n\n</frozen-after-approval>`;
  if (!/<frozen-after-approval\b[\s\S]*?<\/frozen-after-approval>/.test(text))
    throw problem("BMAD_TEMPLATE", "Spec template has no frozen intent block");
  text = text.replace(
    /<frozen-after-approval\b[^>]*>[\s\S]*?<\/frozen-after-approval>/,
    () => frozen,
  );
  const date = ctx.state.createdAt?.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? ""))
    throw problem(
      "BMAD_SPEC",
      "Run creation date is required for a reproducible specification",
    );
  text = text.replace(
    /^---[\s\S]*?\n---/,
    `---\ntitle: ${JSON.stringify(ctx.assignment.prTitle)}\ntype: "feature"\ncreated: "${date}"\nstatus: '${plan.intentGaps.length ? "draft" : "ready-for-dev"}'\nroute: "dispatch"\nbaseline_commit: "${ctx.data.baseSha}"\nreview_loop_iteration: 0\ncontext: ["{project-root}/AGENTS.md", "{project-root}/docs/agents/bmad-policy.md"]\n---`,
  );
  text = replaceSection(
    text,
    "Open Questions",
    plan.intentGaps.length ? bullets(plan.intentGaps) : null,
  );
  text = replaceSection(
    text,
    "Code Map",
    `${plan.research}\n\n${bullets(plan.codeMap.map((entry) => `\`${entry.path}\` — ${entry.role}`))}`,
  );
  text = replaceSection(
    text,
    "Tasks & Acceptance",
    `**Execution:**\n${plan.steps.map((step) => `- [ ] ${step}`).join("\n")}\n\n**Acceptance Criteria:**\n${bullets(ac)}`,
  );
  for (const heading of [
    "Implementation Notes",
    "Spec Change Log",
    "Review Triage Log",
  ])
    text = replaceSection(text, heading, "");
  text = replaceSection(
    text,
    "Design Notes",
    `${plan.decision}\n\n**Zvažované varianty:**\n${bullets(plan.alternatives)}\n\n**Primární podklady:**\n${bullets(plan.sources)}${plan.risks.length ? `\n\n**Rizika a omezení:**\n${bullets(plan.risks)}` : ""}`,
  );
  text = replaceSection(
    text,
    "Verification",
    `**Commands:**\n${bullets(ctx.assignment.checks.map((check) => `\`${[check.command, ...check.args].join(" ")}\` — expected: exit 0; actual results recorded by controller`))}\n\n${ctx.assignment.acceptance.description}`,
  );
  specIdentity(text);
  return `${text.trimEnd()}\n`;
}
export function workerArguments({ kind, schema, output, prompt }) {
  return [
    "exec",
    "--disable",
    "apps",
    "--disable",
    "multi_agent",
    "-c",
    "mcp_servers={}",
    "-c",
    `web_search=${kind === "plan" ? '"live"' : '"disabled"'}`,
    "-c",
    'approval_policy="never"',
    "-c",
    "sandbox_workspace_write.network_access=false",
    "--sandbox",
    kind === "implement" ? "workspace-write" : "read-only",
    "--ephemeral",
    "--json",
    ...(kind === "review" ? [] : ["--output-schema", schema]),
    "-o",
    output,
    prompt,
  ];
}

export function validateWorkerResult(kind, value) {
  const strings = (items) =>
    Array.isArray(items) && items.every((item) => typeof item === "string");
  if (!object(value))
    throw problem("WORKER_OUTPUT", "Worker returned no structured result");
  if (kind === "plan") {
    if (
      typeof value.research !== "string" ||
      typeof value.decision !== "string" ||
      ![
        value.alternatives,
        value.steps,
        value.sources,
        value.risks,
        value.intentGaps,
      ].every(strings) ||
      !value.alternatives.length ||
      !value.sources.length ||
      !value.steps.length ||
      !Array.isArray(value.codeMap) ||
      !value.codeMap.length ||
      value.codeMap.some(
        (entry) =>
          !object(entry) ||
          typeof entry.path !== "string" ||
          !entry.path.trim() ||
          typeof entry.role !== "string" ||
          !entry.role.trim(),
      )
    )
      throw problem(
        "WORKER_OUTPUT",
        "Plan lacks research, code map, explicit intent gaps, alternatives, decision or sources",
      );
  } else if (kind === "implement") {
    if (
      typeof value.summary !== "string" ||
      ![value.changedFiles, value.checks, value.risks].every(strings)
    )
      throw problem("WORKER_OUTPUT", "Implementation output is incomplete");
  } else
    throw problem(
      "WORKER_OUTPUT",
      "Reviews must use their native per-lens output contract",
    );
  return value;
}

function reviewBlock(step, lens) {
  const names = {
    blind: "Blind Hunter (`blind-hunter`)",
    edge: "Edge Case Hunter (`edge-case-hunter`)",
    verification: "Verification Gap Reviewer (`verification-gap`)",
  };
  if (!Object.hasOwn(names, lens))
    throw problem("BMAD_REVIEW", `Unknown review lens ${lens}`);
  const marker = `#### ${names[lens]}`,
    start = step.indexOf(marker);
  if (start < 0 || step.indexOf(marker, start + marker.length) >= 0)
    throw problem(
      "BMAD_REVIEW",
      `Missing unique step-4 launch block for ${lens}`,
    );
  const tail = step.slice(start + marker.length),
    end = tail.search(/^#### |^If a layer's instruction|^### Classify/m);
  return (end < 0 ? tail : tail.slice(0, end))
    .trim()
    .replace(/^Launch a context-free subagent with this prompt:\s*/, "");
}

export async function buildWorkerPrompt(ctx, { kind, lens, identity }) {
  const snapshot = await loadBmadSnapshot(
    ctx.data.renderedWorkflow,
    ctx.data.bmadSnapshot,
  );
  const paths = snapshot.files,
    worktree = ctx.data.worktree;
  let prompt,
    specSha256 = null,
    diffSha256 = null;
  if (kind === "review") {
    const diffFile = path.join(ctx.runDir, "source-diff.txt");
    let diff;
    try {
      diff = await readFile(diffFile, "utf8");
    } catch {
      throw problem("REVIEW_INPUT", "Review diff is missing or unreadable");
    }
    if (!diff.trim() || !/^diff --git /m.test(diff))
      throw problem(
        "REVIEW_INPUT",
        "Review requires a nonempty unified Git diff",
      );
    diffSha256 = digest(diff);
    if (diffSha256 !== ctx.data.sourceDiffSha256)
      throw problem("REVIEW_INPUT", "Review diff identity changed");
    let block = reviewBlock(paths["step-04-review.md"].text, lens).replaceAll(
      "{diff_file}",
      diffFile,
    );
    if (lens === "edge") {
      const spec = specIdentity(await readFile(ctx.data.specFile, "utf8"));
      if (spec.sha256 !== ctx.data.spec.sha256)
        throw problem("BMAD_SPEC", "Edge claims specification changed");
      specSha256 = spec.sha256;
      block = block.replaceAll("{claims_file}", ctx.data.specFile);
    } else if (block.includes("{claims_file}"))
      throw problem(
        "BMAD_REVIEW",
        "A non-claims review layer unexpectedly requests claims",
      );
    prompt = `You are the independent reviewer already launched by the controller. Execute only the reviewer task in this original snapshot launch instruction; do not launch another process or agent. Read-only; do not edit files, stage, commit, or invoke a workflow.\nWorktree: ${worktree}\nProject instructions: ${path.join(worktree, "AGENTS.md")} and ${path.join(worktree, "docs/agents/bmad-policy.md")}\nReview scope paths: ${JSON.stringify(ctx.data.workerTask.writePaths)}\nFrozen source identity: ${identity}\n\n${block}`;
  } else {
    const common = await readFile(
      path.join(directory, "prompts/common.md"),
      "utf8",
    );
    const registry = path.resolve(
      ctx.runDir,
      "../../..",
      "agent-coordination/claims.json",
    );
    const context = `Run: ${ctx.runId}\nWorktree: ${worktree}\nIntent: ${ctx.assignment.intentFile}\nController task: ${ctx.assignment.task}, owner: ${ctx.data.owner}\nWorker task: ${ctx.assignment.workerTask}, owner: ${ctx.data.workerOwner}\nWorker writePaths: ${JSON.stringify(ctx.data.workerTask.writePaths)}\nClaim registry (read directly; status CLI takes a writing mutex): ${registry}`;
    if (kind === "plan") {
      prompt = `${common}\n${context}\nRead ${paths["step-02-plan.md"].path} and ${paths["spec-template.md"].path} completely. Perform their code investigation, alternatives and readiness analysis for this explicit assignment. Return the schema including intentGaps and an annotated codeMap. Never invent an answer to a user-visible intent gap. You execute only the planning analysis: the controller owns the spec write, lifecycle/status, authorization checkpoint and dispatch route. Do not run a subsequent step, another workflow, or subagents. Primary sources are the existing code/tests and the explicit intent links; use read-only web research when required. Return only data, in Czech; do not edit any file.`;
    } else {
      const spec = specIdentity(await readFile(ctx.data.specFile, "utf8"));
      if (spec.sha256 !== ctx.data.spec.sha256)
        throw problem("BMAD_SPEC", "Implementation specification changed");
      specSha256 = spec.sha256;
      const step = paths["step-03-implement.md"].text;
      const start = step.indexOf("Execute the implementation handoff below:"),
        end = step.indexOf("\nDo not add goal restatements", start);
      if (start < 0 || end < 0)
        throw problem(
          "BMAD_IMPLEMENT",
          "Rendered step 3 lacks its project implementation handoff",
        );
      const handoff = step
        .slice(step.indexOf("\n", start), end)
        .trim()
        .replaceAll("{spec_file}", ctx.data.specFile);
      prompt = `${common}\n${context}\nspec_file: ${ctx.data.specFile}\n\n${handoff}\n\nController binding: you are the already-dispatched implementation worker, not the coordinator. Your stable executor already acquired the supplied claim; verify it without re-claiming or releasing it. The controller owns specification/status, artifacts, handoff publication, staging and remote actions. Apply the implementation/refactoring/verification instructions only inside workerTask.writePaths. Return your handoff as the supplied structured output. Do not edit spec or evidence, install dependencies, run heavy checks, or enter another BMAD step.`;
    }
  }
  return {
    prompt,
    provenance: {
      promptSha256: digest(prompt),
      snapshot: snapshot.identity,
      specSha256,
      diffSha256,
    },
  };
}

export function parseReviewResult(lens, raw) {
  if (typeof raw !== "string" || !raw.trim())
    throw problem(
      "REVIEW_OUTPUT",
      "Missing or empty review output is not a clean review",
    );
  const text = raw.trim(),
    findings = [];
  if (lens === "edge") {
    let values;
    try {
      values = JSON.parse(text);
    } catch {
      throw problem(
        "REVIEW_OUTPUT",
        "Edge reviewer did not return its native JSON array",
      );
    }
    if (!Array.isArray(values))
      throw problem("REVIEW_OUTPUT", "Edge reviewer must return a JSON array");
    for (const value of values) {
      const required = [
          "location",
          "trigger_condition",
          "guard_snippet",
          "potential_consequence",
        ],
        allowed = [...required, "kind", "confidence"];
      if (
        !object(value) ||
        required.some(
          (field) => typeof value[field] !== "string" || !value[field].trim(),
        ) ||
        Object.keys(value).some((field) => !allowed.includes(field)) ||
        value.location === "N/A" ||
        /review skipped|no analysis performed/i.test(
          value.potential_consequence,
        ) ||
        (value.kind !== undefined &&
          !["deletion", "claim"].includes(value.kind)) ||
        (value.confidence !== undefined &&
          !["high", "medium", "low"].includes(value.confidence))
      )
        throw problem(
          "REVIEW_OUTPUT",
          "Edge result is incomplete, skipped or violates its native fields",
        );
      findings.push(value);
    }
  } else if (lens === "verification") {
    if (text !== "No verification gaps found.") {
      const gaps = text
        .split(/(?=^### )/m)
        .filter((part) => part.startsWith("### "));
      for (const block of gaps) {
        const fields = [
          "Changed surface",
          "Impacted consumer or site",
          "Existing test evidence",
          "Missing verification",
          "Demonstration",
          "Consequence",
          "Disposition",
        ];
        if (
          fields.some(
            (field) => !new RegExp(`\\*\\*${field}:\\*\\*\\s*\\S`).test(block),
          )
        )
          throw problem(
            "REVIEW_OUTPUT",
            "Verification finding lacks its required evidence fields",
          );
        findings.push({ kind: "verification-gap", raw: block.trim() });
      }
      const other = /(?:^|\n)## Other findings\s*\n([\s\S]+)/.exec(text);
      if (other && /^\s*-\s+\S/m.test(other[1]))
        findings.push({ kind: "other", raw: other[1].trim() });
      if (!findings.length)
        throw problem(
          "REVIEW_OUTPUT",
          "Verification output is neither its exact clean sentinel nor evidenced findings",
        );
    }
  } else if (lens === "blind") {
    if (text !== "[]") {
      if (!/(?:[\w./\\-]+\.[\w]+:\d+|\bline\s+\d+)/i.test(text))
        throw problem(
          "REVIEW_OUTPUT",
          "Blind output lacks a finding location or reports an incomplete review",
        );
      findings.push({ kind: "blind", raw: text });
    }
  } else throw problem("BMAD_REVIEW", `Unknown review lens ${lens}`);
  return {
    completed: true,
    summary: findings.length
      ? "Review returned findings; integration is stopped"
      : "Review completed without findings",
    findings,
    raw,
    rawSha256: digest(raw),
  };
}

export async function runWorker(ctx, { kind, lens, identity, heartbeat }) {
  const key =
    kind === "review" ? `review:${lens}:${identity.slice(0, 32)}` : kind;
  const output = path.join(
    ctx.runDir,
    `${key.replaceAll(":", "-")}.${kind === "review" ? "txt" : "json"}`,
  );
  const { prompt, provenance } = await buildWorkerPrompt(ctx, {
    kind,
    lens,
    identity,
  });
  const receipt = await ctx.supervise({
    key,
    command: "codex",
    args: workerArguments({
      kind,
      schema: path.join(directory, `schemas/${kind}.json`),
      output,
      prompt,
    }),
    cwd: ctx.data.worktree,
    heartbeat,
  });
  if (receipt.exitCode !== 0)
    throw problem(
      "WORKER_FAILED",
      `${key} failed with exit ${receipt.exitCode}; logs: ${receipt.stderrPath}`,
    );
  let result;
  if (kind === "review") {
    let raw;
    try {
      raw = await readFile(output, "utf8");
    } catch {
      throw problem("REVIEW_OUTPUT", "Reviewer output file is missing");
    }
    result = parseReviewResult(lens, raw);
  } else result = validateWorkerResult(kind, await readJson(output));
  return {
    result,
    provenance,
    outputPath: output,
    attemptId: receipt.attemptId,
    exitCode: receipt.exitCode,
    stdoutPath: receipt.stdoutPath,
    stderrPath: receipt.stderrPath,
  };
}
