import { appendFile, readFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const repository = "varnahg/strahovcrazyshow";
const checks = new Map([
  ["ci.yml", "CI"], ["source-secrets.yml", "Source secret hygiene"],
  ["feedback-browser.yml", "Feedback browser"],
]);
const triggerNames = new Set(checks.values());
const shaPattern = /^[a-f0-9]{40}$/;
const superseded = "SHA už není na špičce main";
const isRepository = (name) => name?.toLowerCase() === repository;

export function candidateFor(env, event) {
  if (!isRepository(env.GITHUB_REPOSITORY)) return null;
  if (env.GITHUB_EVENT_NAME === "workflow_dispatch") {
    if (env.GITHUB_REF === "refs/heads/main" && shaPattern.test(env.GITHUB_SHA)) {
      return env.GITHUB_SHA;
    }
  }
  if (env.GITHUB_EVENT_NAME === "workflow_run") {
    const run = event.workflow_run;
    if (triggerNames.has(run?.name) && run.event === "push" && run.head_branch === "main" &&
        run.conclusion === "success" && isRepository(run.head_repository?.full_name) &&
        shaPattern.test(run.head_sha)) return run.head_sha;
  }
  return null;
}

export async function verify(commit, api) {
  if (!shaPattern.test(commit)) throw new Error("Neplatné SHA vydání");
  const main = await api("git/ref/heads/main");
  if (main.object?.sha !== commit) return superseded;

  const query = new URLSearchParams({ head_sha: commit, event: "push", branch: "main", per_page: "10" });
  const results = await Promise.all([...checks.keys()].map(async (workflow) => {
    const { workflow_runs: runs } = await api(`actions/workflows/${workflow}/runs?${query}`);
    if (!Array.isArray(runs)) throw new Error(`Neplatná odpověď Actions pro ${workflow}`);
    const latest = runs.filter((run) => run.head_sha === commit && run.event === "push" &&
      run.head_branch === "main" && isRepository(run.head_repository?.full_name))
      .sort((left, right) => right.run_number - left.run_number || right.run_attempt - left.run_attempt)[0];
    return latest?.status === "completed" && latest.conclusion === "success" ? null : workflow;
  }));
  const pending = results.filter(Boolean);
  return pending.length ? `Chybí úspěšná kontrola: ${pending.join(", ")}` : null;
}

export async function wasPublished(commit, currentRunId, api) {
  if (!shaPattern.test(commit) || !/^\d+$/.test(currentRunId)) throw new Error("Neplatná identita běhu vydání");
  const query = new URLSearchParams({ head_sha: commit, branch: "main", status: "success", per_page: "20" });
  const { workflow_runs: runs } = await api(`actions/workflows/raspberry-release.yml/runs?${query}`);
  if (!Array.isArray(runs)) throw new Error("Neplatná historie vydání");
  for (const run of runs.slice(0, 20)) {
    if (!Number.isSafeInteger(run.id) || String(run.id) === currentRunId ||
        run.head_sha !== commit || run.head_branch !== "main" ||
        !isRepository(run.head_repository?.full_name) || run.status !== "completed" ||
        run.conclusion !== "success" || !["workflow_run", "workflow_dispatch"].includes(run.event)) continue;
    const { jobs } = await api(`actions/runs/${run.id}/jobs?filter=all&per_page=50`);
    if (!Array.isArray(jobs)) throw new Error(`Neplatná historie jobů vydání ${run.id}`);
    if (jobs.some((job) => job.name === "publish" && job.head_sha === commit &&
        job.status === "completed" && job.conclusion === "success" &&
        job.steps?.some((step) => step.name === "Measure candidate layers and promote one private manifest" &&
          step.status === "completed" && step.conclusion === "success"))) return true;
  }
  return false;
}

export async function waitForChecks(commit, api, { attempts, delay }) {
  let reason;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    reason = await verify(commit, api);
    if (!reason || reason === superseded) return reason;
    if (attempt < attempts) await delay();
  }
  return reason;
}

async function main(env, mode) {
  if (!["select", "assert"].includes(mode)) throw new Error("Neplatný režim release brány");
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  const commit = candidateFor(env, event);
  if (!commit) {
    if (mode === "assert") throw new Error("Nepovolený zdroj vydání");
    console.log("Událost není ověřený push do main tohoto repozitáře.");
    return;
  }
  if (mode === "assert" && env.RELEASE_COMMIT !== commit) throw new Error("SHA sestavení nesouhlasí");
  if (!env.GH_TOKEN) throw new Error("Chybí oprávnění ke čtení běhů Actions");
  const api = async (path) => {
    const response = await fetch(`https://api.github.com/repos/${repository}/${path}`, {
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json" },
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`GitHub API ${response.status} pro ${path.split("?")[0]}`);
    return response.json();
  };
  // Each successful completion triggers this serialized gate, including reruns.
  // Brief polling covers API visibility lag. A later completion starts a new gate.
  const reason = mode === "select" ? await waitForChecks(commit, api, {
    attempts: 3, delay: () => setTimeout(15_000),
  }) : await verify(commit, api);
  if (reason) {
    if (mode === "assert") throw new Error(reason);
    console.log(reason);
  } else if (mode === "select") {
    if (env.GITHUB_EVENT_NAME === "workflow_run" && await wasPublished(commit, env.GITHUB_RUN_ID, api)) {
      console.log(`Produkční manifest pro ${commit} už zveřejnil předchozí běh.`);
      return;
    }
    await appendFile(env.GITHUB_OUTPUT, `commit=${commit}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main(process.env, process.argv[2]);
}
