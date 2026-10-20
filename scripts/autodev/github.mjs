import { spawn } from "node:child_process";
import { problem } from "./store.mjs";
import {
  ensureExternalAcceptance,
  externalAcceptanceBody,
  externalProofDigest,
} from "./external-acceptance.mjs";

export function execute(
  command,
  args,
  { cwd, input, timeoutMs = 60_000, env, mutating = false } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        GH_PROMPT_DISABLED: "1",
        GIT_TERMINAL_PROMPT: "0",
        ...env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "",
      stderr = "",
      failure;
    // Each pipe owns a streaming decoder; a multibyte character may straddle
    // any pair of OS chunks, including Git paths and GitHub JSON strings.
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const timer = setTimeout(() => {
      failure = problem(
        mutating ? "UNKNOWN_EFFECT" : "COMMAND_TIMEOUT",
        `${command} timed out`,
      );
      child.kill();
    }, timeoutMs);
    const collect = (key, text) => {
      if (key === "out") stdout += text;
      else stderr += text;
      if (stdout.length + stderr.length > 32 * 1024 * 1024) {
        failure = problem(
          mutating ? "UNKNOWN_EFFECT" : "COMMAND_OUTPUT",
          `${command} exceeded its output limit`,
        );
        child.kill();
      }
    };
    child.stdout.on("data", (bytes) => collect("out", bytes));
    child.stderr.on("data", (bytes) => collect("err", bytes));
    child.stdin.on("error", () => {});
    child.once("error", (error) => {
      failure = problem(
        "COMMAND_START",
        `Could not start ${command}: ${error.code}`,
      );
    });
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      if (failure) return reject(failure);
      if (code !== 0)
        return reject(
          Object.assign(
            problem(
              mutating ? "UNKNOWN_EFFECT" : "COMMAND_FAILED",
              `${command} failed (exit ${code}, signal ${signal ?? "none"}): ${stderr.slice(0, 2000)}`,
            ),
            { exitCode: code },
          ),
        );
      resolve({ stdout, stderr, exitCode: code });
    });
    child.stdin.end(input);
  });
}

export function checkoutEvidence(log, prNumber) {
  const lines = log.split(/\r?\n/);
  const checkout = lines.filter((line) =>
    /\t(?:Checkout source and LFS assets|Run actions\/checkout@[^\t]+)\t/.test(
      line,
    ),
  );
  const hashes = checkout
    .map(
      (line) =>
        new RegExp(
          `\\+([a-f0-9]{40}):refs/remotes/pull/${prNumber}/merge(?:\\s|$)`,
        ).exec(line)?.[1],
    )
    .filter(Boolean);
  const checkedOut = checkout
    .filter((line) => /\b[0-9TZ:.-]+Z?\s+[a-f0-9]{40}\s*$/.test(line))
    .map((line) => /([a-f0-9]{40})\s*$/.exec(line)[1]);
  const unique = [...new Set(hashes)];
  if (unique.length !== 1 || !checkedOut.includes(unique[0]))
    throw problem(
      "CI_IDENTITY",
      "CI checkout log does not prove the PR test merge commit",
    );
  const identity = lines.filter((line) =>
    /\tRecord verification identity\t/.test(line),
  );
  const field = (label) => [
    ...new Set(
      identity
        .map(
          (line) => new RegExp(`${label}: ([a-f0-9]{40})\\s*$`).exec(line)?.[1],
        )
        .filter(Boolean),
    ),
  ];
  const heads = field("PR head"),
    bases = field("PR base");
  return {
    testMergeSha: unique[0],
    headSha: heads.length === 1 ? heads[0] : null,
    baseSha: bases.length === 1 ? bases[0] : null,
  };
}

export class GitHubClient {
  constructor({
    repository,
    cwd,
    exec = execute,
    pollMs = 20_000,
    timeoutMs = 50 * 60_000,
  } = {}) {
    this.repository = repository;
    this.cwd = cwd;
    this.exec = exec;
    this.pollMs = pollMs;
    this.timeoutMs = timeoutMs;
  }
  async api(method, endpoint, body) {
    const args = [
      "api",
      "--method",
      method,
      "-H",
      "Accept: application/vnd.github+json",
      endpoint,
    ];
    if (body !== undefined) args.push("--input", "-");
    const result = await this.exec("gh", args, {
      cwd: this.cwd,
      input: body === undefined ? undefined : JSON.stringify(body),
      mutating: method !== "GET",
    });
    try {
      return result.stdout.trim() ? JSON.parse(result.stdout) : null;
    } catch {
      throw problem(
        method === "GET" ? "GITHUB_PROTOCOL" : "UNKNOWN_EFFECT",
        "GitHub response was not JSON",
      );
    }
  }
  endpoint(suffix = "") {
    return `repos/${this.repository}${suffix}`;
  }
  async pages(suffix, field) {
    const entries = [];
    for (let page = 1; page <= 100; page++) {
      const response = await this.api(
        "GET",
        this.endpoint(
          `${suffix}${suffix.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
        ),
      );
      const rows = field ? response[field] : response;
      if (!Array.isArray(rows))
        throw problem("GITHUB_PROTOCOL", "Expected a paginated GitHub list");
      entries.push(...rows);
      if (rows.length < 100) return entries;
    }
    throw problem("GITHUB_PAGINATION", "Refusing incomplete GitHub lookup");
  }
  repo() {
    return this.api("GET", this.endpoint());
  }
  branch(name) {
    return this.api(
      "GET",
      this.endpoint(`/branches/${encodeURIComponent(name)}`),
    );
  }
  pr(number) {
    return this.api("GET", this.endpoint(`/pulls/${number}`));
  }
  async findPr(branch, base, marker) {
    const owner = this.repository.split("/")[0];
    const rows = await this.pages(
      `/pulls?state=all&head=${encodeURIComponent(`${owner}:${branch}`)}&base=${encodeURIComponent(base)}`,
    );
    const matches = rows.filter(
      (pr) =>
        pr.head?.ref === branch &&
        pr.base?.ref === base &&
        pr.head?.repo?.full_name?.toLowerCase() ===
          this.repository.toLowerCase() &&
        pr.base?.repo?.full_name?.toLowerCase() ===
          this.repository.toLowerCase(),
    );
    if (
      matches.length > 1 ||
      (matches.length === 1 && !matches[0].body?.includes(marker))
    )
      throw problem(
        "PR_CONFLICT",
        "Existing branch PR does not uniquely belong to this run",
      );
    return matches[0] ? this.pr(matches[0].number) : null;
  }
  async publish(ctx, body) {
    const marker = `<!-- autodev:${ctx.runId} -->`;
    let pr = await this.findPr(
      ctx.data.branch,
      ctx.assignment.baseBranch,
      marker,
    );
    if (!pr && ctx.data.prIntent)
      throw problem(
        "UNKNOWN_EFFECT",
        "PR creation was dispatched but its effect is not established",
      );
    if (!pr) {
      await ctx.save({
        prIntent: {
          branch: ctx.data.branch,
          base: ctx.assignment.baseBranch,
          headSha: ctx.data.commitSha,
        },
      });
      pr = await this.api("POST", this.endpoint("/pulls"), {
        title: ctx.assignment.prTitle,
        head: ctx.data.branch,
        base: ctx.assignment.baseBranch,
        body: `${marker}\n${body}`,
      });
      await ctx.fault("after-pr-create");
      pr = await this.pr(pr.number);
    }
    this.assertPr(pr, ctx);
    if (pr.state === "closed" && !pr.merged)
      throw problem("PR_CLOSED", "Run PR was closed without merging");
    await ctx.save({ prNumber: pr.number, prUrl: pr.html_url });
    await ctx.emit({ type: "pull-request", url: pr.html_url });
    return pr;
  }
  assertPr(pr, ctx, { allowMerged = false } = {}) {
    if (
      pr.head?.sha !== ctx.data.commitSha ||
      pr.head?.ref !== ctx.data.branch ||
      pr.base?.ref !== ctx.assignment.baseBranch ||
      pr.head?.repo?.full_name?.toLowerCase() !==
        this.repository.toLowerCase() ||
      pr.base?.repo?.full_name?.toLowerCase() !== this.repository.toLowerCase()
    )
      throw problem("PR_IDENTITY", "PR head, base ref or repository changed");
    if (!allowMerged && pr.base.sha !== ctx.data.baseSha)
      throw problem(
        "BASE_CHANGED",
        "PR base changed; fresh review and verification are required",
      );
  }
  async checks(sha, { event, prNumber, baseSha, branch } = {}) {
    const rows = await this.pages(
      `/commits/${sha}/check-runs?filter=all&app_id=15368`,
      "check_runs",
    );
    const accepted = [];
    const workflows = {
      verify: ".github/workflows/ci.yml",
      "source-secret-hygiene": ".github/workflows/source-secrets.yml",
    };
    for (const [name, workflow] of Object.entries(workflows)) {
      let selected;
      for (const check of rows
        .filter(
          (row) =>
            row.name === name && row.app?.id === 15368 && row.head_sha === sha,
        )
        .sort((a, b) => b.id - a.id)) {
        const match = /\/actions\/runs\/(\d+)/.exec(check.details_url ?? "");
        if (!match) continue;
        const run = await this.api(
          "GET",
          this.endpoint(`/actions/runs/${match[1]}`),
        );
        if (
          run.event !== event ||
          run.head_sha !== sha ||
          run.path?.split("@")[0] !== workflow ||
          (branch && run.head_branch !== branch) ||
          run.repository?.full_name?.toLowerCase() !==
            this.repository.toLowerCase()
        )
          continue;
        selected = {
          checkId: check.id,
          name,
          appId: check.app.id,
          conclusion: check.conclusion,
          status: check.status,
          runId: run.id,
          runAttempt: run.run_attempt,
          event,
          headSha: sha,
          baseSha: baseSha ?? null,
          url: run.html_url,
        };
        break;
      }
      if (!selected || selected.status !== "completed") return null;
      if (selected.conclusion !== "success")
        throw problem(
          "CI_FAILED",
          `${name} is ${selected.conclusion} for ${sha}`,
        );
      if (prNumber) {
        const log = await this.exec(
          "gh",
          [
            "run",
            "view",
            String(selected.runId),
            "--repo",
            this.repository,
            "--attempt",
            String(selected.runAttempt),
            "--log",
          ],
          { cwd: this.cwd },
        );
        const identity = checkoutEvidence(log.stdout, prNumber);
        if (
          name === "verify" &&
          (identity.headSha !== sha || identity.baseSha !== baseSha)
        )
          throw problem(
            "CI_IDENTITY",
            "Verify log head/base differs from the accepted candidate",
          );
        selected.testMergeSha = identity.testMergeSha;
      }
      accepted.push(selected);
    }
    if (prNumber && accepted[0].testMergeSha !== accepted[1].testMergeSha)
      throw problem(
        "CI_IDENTITY",
        "Required checks tested different PR merge commits",
      );
    return accepted;
  }
  async waitChecks(sha, options, tick = async () => {}) {
    const deadline = Date.now() + this.timeoutMs;
    for (;;) {
      await tick();
      const result = await this.checks(sha, options);
      if (result) return result;
      if (Date.now() >= deadline)
        throw problem(
          "CI_PENDING",
          `Required checks are not complete for ${sha}`,
        );
      await new Promise((resolve) => setTimeout(resolve, this.pollMs));
    }
  }
  async accept(ctx, body) {
    const externalAcceptance = await ensureExternalAcceptance(ctx);
    const pr = await this.pr(ctx.data.prNumber);
    this.assertPr(pr, ctx);
    const base = await this.branch(ctx.assignment.baseBranch);
    if (base.commit.sha !== ctx.data.baseSha)
      throw problem("BASE_CHANGED", "Base advanced before acceptance");
    if (
      !(await this.checks(ctx.data.commitSha, {
        event: "pull_request",
        prNumber: pr.number,
        baseSha: ctx.data.baseSha,
        branch: ctx.data.branch,
      }))
    )
      throw problem(
        "CI_PENDING",
        "Acceptance requires current successful checks",
      );
    const marker = `<!-- autodev:${ctx.runId} -->`;
    if (!pr.body?.includes(marker))
      throw problem("PR_IDENTITY", "Run marker is missing from PR evidence");
    const expectedBody = `${marker}\n${body}${externalAcceptanceBody(externalAcceptance)}`;
    if (pr.body !== expectedBody) {
      await ensureExternalAcceptance(ctx, { requirePinned: true });
      await this.api("PATCH", this.endpoint(`/pulls/${pr.number}`), {
        body: expectedBody,
      });
    }
    this.assertPr(await this.pr(pr.number), ctx);
    const statuses = await this.pages(
      `/commits/${ctx.data.commitSha}/statuses`,
    );
    const latest = statuses.find(
      (status) => status.context === "project-acceptance",
    );
    await ensureExternalAcceptance(ctx, { requirePinned: true });
    if (latest?.state !== "success" || latest.target_url !== pr.html_url)
      await this.api("POST", this.endpoint(`/statuses/${ctx.data.commitSha}`), {
        state: "success",
        context: "project-acceptance",
        description: externalAcceptance
          ? "External practical evidence and required CI accepted"
          : "Reviewed CLI evidence and required CI accepted",
        target_url: pr.html_url,
      });
    return {
      headSha: ctx.data.commitSha,
      baseSha: ctx.data.baseSha,
      evidenceUrl: pr.html_url,
      ...(externalAcceptance ? { externalAcceptance } : {}),
    };
  }
  async assertExternalMerge(ctx, pr, proof) {
    const intent = ctx.data.mergeIntent;
    if (
      !pr.merged ||
      intent?.headSha !== ctx.data.commitSha ||
      intent?.baseSha !== ctx.data.baseSha ||
      externalProofDigest(intent?.externalAcceptance) !==
        externalProofDigest(proof) ||
      !/^[a-f0-9]{40}$/.test(pr.merge_commit_sha ?? "")
    )
      throw problem(
        "MERGE_IDENTITY",
        "Merged external candidate has no matching durable merge intent",
      );
    const commit = await this.api(
      "GET",
      this.endpoint(`/git/commits/${pr.merge_commit_sha}`),
    );
    if (
      commit.sha !== pr.merge_commit_sha ||
      commit.parents?.length !== 2 ||
      commit.parents[0].sha !== intent.baseSha ||
      commit.parents[1].sha !== intent.headSha
    )
      throw problem(
        "MERGE_IDENTITY",
        "Remote merge parents differ from this run's merge intent",
      );
    await ensureExternalAcceptance(ctx, { requirePinned: true });
  }
  async merge(ctx) {
    const externalAcceptance = await ensureExternalAcceptance(ctx, {
      requirePinned: true,
    });
    const pr = await this.pr(ctx.data.prNumber);
    this.assertPr(pr, ctx, { allowMerged: Boolean(pr.merged) });
    if (
      externalAcceptance &&
      externalProofDigest(ctx.data.acceptance?.externalAcceptance) !==
        externalProofDigest(externalAcceptance)
    )
      throw problem(
        "EXTERNAL_ACCEPTANCE_CHANGED",
        "Merge acceptance does not match the pinned external proof",
      );
    if (pr.merged) {
      if (externalAcceptance)
        await this.assertExternalMerge(ctx, pr, externalAcceptance);
      return pr.merge_commit_sha;
    }
    if (pr.state !== "open" || pr.draft)
      throw problem("PR_NOT_READY", "PR is not open and ready");
    if (
      ctx.data.acceptance?.headSha !== pr.head.sha ||
      ctx.data.acceptance?.baseSha !== pr.base.sha
    )
      throw problem(
        "ACCEPTANCE_CHANGED",
        "Acceptance does not match current PR",
      );
    if (
      (await this.branch(ctx.assignment.baseBranch)).commit.sha !== pr.base.sha
    )
      throw problem("BASE_CHANGED", "Base advanced before merge");
    const mergeIntent = {
      headSha: pr.head.sha,
      baseSha: pr.base.sha,
      ...(externalAcceptance ? { externalAcceptance } : {}),
    };
    if (
      externalAcceptance &&
      ctx.data.mergeIntent &&
      (ctx.data.mergeIntent.headSha !== mergeIntent.headSha ||
        ctx.data.mergeIntent.baseSha !== mergeIntent.baseSha ||
        externalProofDigest(ctx.data.mergeIntent.externalAcceptance) !==
          externalProofDigest(externalAcceptance))
    )
      throw problem(
        "MERGE_IDENTITY",
        "Existing merge intent has a different external proof",
      );
    await ctx.save({ mergeIntent });
    await ensureExternalAcceptance(ctx, { requirePinned: true });
    const result = await this.api(
      "PUT",
      this.endpoint(`/pulls/${pr.number}/merge`),
      { sha: pr.head.sha, merge_method: "merge" },
    );
    if (!result?.merged || !result.sha)
      throw problem("UNKNOWN_EFFECT", "Merge outcome was not confirmed");
    if (externalAcceptance) {
      const merged = await this.pr(pr.number);
      this.assertPr(merged, ctx, { allowMerged: true });
      if (merged.merge_commit_sha !== result.sha)
        throw problem(
          "MERGE_IDENTITY",
          "Merge response differs from the recorded remote PR",
        );
      await this.assertExternalMerge(ctx, merged, externalAcceptance);
    }
    return result.sha;
  }
}
