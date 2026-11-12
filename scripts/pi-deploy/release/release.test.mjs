import assert from "node:assert/strict";
import test from "node:test";
import { candidateFor, verify, waitForChecks, wasPublished } from "./gate.mjs";
import { createManifest, dbDigest } from "./manifest.mjs";

const sha = "a".repeat(40);
const newer = "b".repeat(40);
const repo = "Varnahg/StrahovCrazyShow";
const workflows = ["ci.yml", "source-secrets.yml", "feedback-browser.yml"];
const success = {
  name: "CI", head_sha: sha, event: "push", head_branch: "main", head_repository: { full_name: repo },
  status: "completed", conclusion: "success", run_number: 4, run_attempt: 1,
};

test("selects only the trusted completed push or a manual main retry", () => {
  const env = { GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: "workflow_run" };
  assert.equal(candidateFor(env, { workflow_run: success }), sha);
  for (const override of [
    { event: "pull_request" }, { name: "Another workflow" }, { head_branch: "release-branch" }, { conclusion: "failure" },
    { head_repository: { full_name: "Someone/StrahovCrazyShow" } }, { head_sha: "a" },
  ]) assert.equal(candidateFor(env, { workflow_run: { ...success, ...override } }), null);
  assert.equal(candidateFor({ ...env, GITHUB_REPOSITORY: "Someone/StrahovCrazyShow" }, { workflow_run: success }), null);
  assert.equal(candidateFor({ ...env, GITHUB_EVENT_NAME: "pull_request" }, { workflow_run: success }), null);
  const manual = { ...env, GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_SHA: sha };
  assert.equal(candidateFor({ ...manual, GITHUB_REF: "refs/heads/main" }, {}), sha);
  assert.equal(candidateFor({ ...manual, GITHUB_REF: "refs/tags/main" }, {}), null);
});

test("requires three successful runs for exactly the latest main push", async () => {
  const queries = [];
  const fixture = (runs = {}, current = sha) => async (path) => {
    if (path === "git/ref/heads/main") return { object: { sha: current } };
    const [, workflow, query] = path.match(/^actions\/workflows\/(.+)\/runs\?(.+)$/);
    queries.push(workflow);
    assert.deepEqual(Object.fromEntries(new URLSearchParams(query)), {
      head_sha: sha, branch: "main", event: "push", per_page: "10",
    });
    return { workflow_runs: runs[workflow] ?? [success] };
  };
  assert.equal(await verify(sha, fixture()), null);
  assert.deepEqual(queries, workflows);
  for (const runs of [[], [{ ...success, head_sha: newer }], [{ ...success, event: "pull_request" }],
    [{ ...success, status: "in_progress", conclusion: null, run_attempt: 2 }, success],
    [success, { ...success, conclusion: "failure", run_number: 5 }]]) {
    assert.match(await verify(sha, fixture({ "feedback-browser.yml": runs })), /feedback-browser\.yml/);
  }
  assert.match(await verify(sha, fixture({}, newer)), /špičce main/);
});

test("waits for parallel checks once and stops immediately if main advances", async () => {
  let elapsed = 0;
  const delay = async () => { elapsed++; };
  const api = async (path) => path === "git/ref/heads/main" ? { object: { sha } }
    : { workflow_runs: path.includes("feedback-browser.yml") && elapsed < 1 ? [] : [success] };
  assert.equal(await waitForChecks(sha, api, { attempts: 2, delay }), null);
  assert.equal(elapsed, 1);
  const stale = await waitForChecks(sha, async () => ({ object: { sha: newer } }), { attempts: 2, delay });
  assert.match(stale, /špičce main/);
  assert.equal(elapsed, 1);
  const pending = await waitForChecks(sha, async (path) => path === "git/ref/heads/main"
    ? { object: { sha } } : { workflow_runs: [] }, { attempts: 2, delay });
  assert.match(pending, /ci\.yml/);
  assert.equal(elapsed, 2);
});

test("a late successful rerun of either parallel check makes the same SHA eligible", async () => {
  const env = { GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: "workflow_run" };
  for (const [name, workflow] of [["Source secret hygiene", "source-secrets.yml"], ["Feedback browser", "feedback-browser.yml"]]) {
    const failed = { ...success, name, conclusion: "failure" };
    const rerun = { ...success, name, run_attempt: 2 };
    const api = (run) => async (path) => path === "git/ref/heads/main" ? { object: { sha } }
      : { workflow_runs: path.includes(workflow) ? [failed, run] : [success] };
    assert.match(await verify(sha, api(failed)), /Chybí úspěšná kontrola/);
    assert.equal(candidateFor(env, { workflow_run: failed }), null);
    assert.equal(candidateFor(env, { workflow_run: rerun }), sha);
    assert.equal(await verify(sha, api(rerun)), null);
  }
});

test("deduplicates only another same-SHA run that actually published", async () => {
  const previous = { ...success, id: 12, event: "workflow_run" };
  const current = { ...previous, id: 13 };
  const publishStep = { name: "Measure candidate layers and promote one private manifest", status: "completed", conclusion: "success" };
  const publishJob = { name: "publish", head_sha: sha, status: "completed", conclusion: "success", steps: [publishStep] };
  const api = (jobs) => async (path) => {
    if (path.startsWith("actions/workflows/raspberry-release.yml/runs?")) {
      assert.deepEqual(Object.fromEntries(new URLSearchParams(path.split("?")[1])), {
        head_sha: sha, branch: "main", status: "success", per_page: "20",
      });
      return { workflow_runs: [current, { ...previous, id: 11, head_sha: newer },
        { ...previous, id: 10, event: "pull_request" }, previous] };
    }
    assert.equal(path, "actions/runs/12/jobs?filter=all&per_page=50");
    return { jobs };
  };
  for (const jobs of [[], [{ ...publishJob, conclusion: "skipped" }],
    [{ ...publishJob, head_sha: newer }], [{ ...publishJob, steps: [{ ...publishStep, conclusion: "skipped" }] }]]) {
    assert.equal(await wasPublished(sha, "13", api(jobs)), false);
  }
  assert.equal(await wasPublished(sha, "13", api([publishJob])), true);
});

const digest = (byte) => `sha256:${byte.repeat(64)}`;
const refs = { game: digest("a"), tools: digest("b"), db: dbDigest };
const gzip = "application/vnd.oci.image.layer.v1.tar+gzip";
const uncompressed = "application/vnd.oci.image.layer.v1.tar";
const shared = { digest: digest("c"), size: 40, mediaType: gzip };
const exclusive = { digest: digest("d"), size: 60, mediaType: uncompressed };

test("writes the exact host contract, retaining layer order and measuring shared blobs once", async () => {
  const measured = [];
  const manifest = await createManifest(sha, refs, async (ref) => ({
    schemaVersion: 2, layers: ref.includes("crazyshow-game") ? [shared, exclusive] : [shared],
  }), async (ref) => { measured.push(ref); return 120; });
  const common = { digest: shared.digest, compressed: 40, unpacked: 120 };
  assert.deepEqual(manifest, { version: 1, platform: "linux/arm64", commit: sha, images: {
    game: { ref: `ghcr.io/varnahg/strahovcrazyshow-game@${refs.game}`, layers: [common, {
      digest: exclusive.digest, compressed: 60, unpacked: 60,
    }] },
    tools: { ref: `ghcr.io/varnahg/strahovcrazyshow-rag-tools@${refs.tools}`, layers: [common] },
    db: { ref: `docker.io/pgvector/pgvector@${dbDigest}`, layers: [common] },
  } });
  assert.deepEqual(measured, [`ghcr.io/varnahg/strahovcrazyshow-game@${shared.digest}`]);
});

test("rejects indexes, malformed sizes and unpinned DB instead of publishing incomplete metadata", async () => {
  const measure = async () => 120;
  await assert.rejects(createManifest(sha, { ...refs, db: refs.game }, async () => null, measure), /PostgreSQL/);
  await assert.rejects(createManifest(sha, refs, async () => ({ schemaVersion: 2, manifests: [] }), measure), /jednoho ARM64/);
  for (const layer of [{ ...shared, size: 0 }, { ...shared, digest: "latest" }, { ...shared, mediaType: "unknown" }]) {
    await assert.rejects(createManifest(sha, refs, async () => ({ schemaVersion: 2, layers: [layer] }), measure), /deskriptor/);
  }
  await assert.rejects(createManifest(sha, refs, async () => ({ schemaVersion: 2, layers: [shared] }), async () => NaN), /rozbalená/);
});
