import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { quarterDir } from "./quarter.mjs";
import { silhouetteGroup } from "./quarter-acceptance.mjs";

export const autumnEvidence = "_bmad-output/implementation-artifacts/tree-quarter-autumn-20261113/";
export const branchEvidence = "_bmad-output/implementation-artifacts/tree-quarter-branches-20261113/release-branches.json";
export const autumnReview = /^review-autumn-(?:cutoff|cards|spread)\.json$/;
export const autumnFolder = /-autumn-(?:cards|spread)$/;
export const branchFolder = id => join(quarterDir, "rollout", id + "-branches-fit");
export const sparseTree = id => id === "own-broadleaf" || id === "catalog-ipr-crown-019";
export function autumnCutoff(id, mode) {
  if (mode === "autumn-spread") {
    if (id === "own-broadleaf") return .17;
    if (id === "catalog-ipr-crown-019") return .22;
    return .27;
  }
  return sparseTree(id) ? .20 : id === "catalog-4314257259" && mode === "autumn-cards" ? .28 : .26;
}

export function autumnPass(report) {
  assert.equal(report.webglVersion, 2);
  assert.equal(report.visibility, "visible");
  assert.equal(report.focus, true);
  assert.equal(report.measurements.length, 36);
  assert.equal(report.shadowChecks.length, 4);
  return [0,1].every(lod => [0,.5,1].every(leaves =>
    silhouetteGroup(report.measurements.filter(row => row.lod === lod && row.leaves === leaves)).pass));
}

export function autumnTargets() {
  const previous = JSON.parse(readFileSync(branchEvidence, "utf8"));
  const targets = previous.branchRun.reviewed.filter(id => !previous.accepted.includes(id));
  assert.equal(new Set(targets).size, 30);
  return { previous, targets };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [variant, ...extra] = process.argv.slice(2);
  assert.ok(["cards", "spread"].includes(variant) && !extra.length);
  const root = realpathSync(join(quarterDir, "rollout"));
  assert.match(root, /^D:[\\/]/i);
  const { targets } = autumnTargets();
  const reports = ["cutoff", ...(variant === "spread" ? ["cards"] : [])];
  for (const id of targets) {
    const read = (path, name) => JSON.parse(readFileSync(join(path, `review-autumn-${name}.json`), "utf8"));
    if (reports.some(name => autumnPass(read(name === "cutoff" ? branchFolder(id) : join(root, `${id}-autumn-${name}`), name)))) continue;
    const directory = join(root, `${id}-autumn-${variant}`);
    if (existsSync(join(directory, "candidate.json"))) continue;
    mkdirSync(directory, { recursive:true });
    execFileSync(process.execPath, ["--import", "tsx", "scripts/geometry-tree-mid/quarter-triangles.mjs", "--write", id, `autumn-${variant}`],
      { stdio:"inherit" });
  }
}
