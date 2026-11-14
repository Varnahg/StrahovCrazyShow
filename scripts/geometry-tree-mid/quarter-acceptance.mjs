import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function silhouettePass({ area, missing, added }) {
  assert.ok([area, missing, added].every(Number.isSafeInteger));
  assert.ok(area > 0 && missing >= 0 && missing <= area && added >= 0);
  // Compare integer pixel counts against 15% and 5%, with inclusive boundaries.
  return (20 * missing <= 3 * area && 20 * added <= 3 * area)
    || 20 * Math.abs(missing - added) <= area;
}

export function silhouetteGroup(checks) {
  assert.equal(checks.length, 6, "Expected six camera angles per season");
  const individual = checks.map(silhouettePass);
  const peak = Math.max(...checks.map(({ area, missing, added }) => Math.max(missing, added) / area));
  const meanDifference = checks.reduce((sum, { area, missing, added }) =>
    sum + Math.abs(missing - added) / area, 0) / checks.length;
  const passesGroupTolerance = peak <= 0.20 && meanDifference <= 0.15 + Number.EPSILON;
  return { individual, peak, meanDifference, passesGroupTolerance,
    pass: individual.every(Boolean) || passesGroupTolerance };
}

function evaluate(row, holdout) {
  assert.deepEqual(row.descriptor, holdout.descriptor);
  assert.equal(row.budget, Math.floor(row.before / 4));
  assert.ok(Number.isSafeInteger(row.after) && row.after > 0);
  const failures = [];
  const groups = [];
  let balancedExceptions = 0;
  for (const [set, checks] of [["original", row.checks], ["independent", holdout.checks]]) {
    const expected = new Set(Array.from({ length: 6 }, (_, view) =>
      [0, 32767, 65534].map(rank => `${view}:${rank}`)).flat());
    for (const check of checks) {
      const { view, rank } = check;
      assert.ok(expected.delete(`${view}:${rank}`), "Duplicate or unexpected view and season");
    }
    assert.equal(expected.size, 0, "Incomplete silhouette evidence");
    for (const rank of [0, 32767, 65534]) {
      const season = checks.filter(check => check.rank === rank);
      const result = silhouetteGroup(season);
      const { individual, peak, meanDifference, pass } = result;
      groups.push({ set, rank, peak, meanDifference, pass, usedGroupTolerance: pass && !individual.every(Boolean) });
      for (const [index, { view, area, missing, added }] of season.entries()) {
        if (!pass && !individual[index]) {
          failures.push({ set, view, rank, missingRatio: missing / area, addedRatio: added / area,
            difference: Math.abs(missing - added) / area });
        }
        if (individual[index] && 20 * Math.max(missing, added) > 3 * area) balancedExceptions++;
      }
    }
  }
  return { lod: row.lod, before: row.before, after: row.after, budget: row.budget,
    sha256: row.descriptor.sha256, checks: row.checks.length + holdout.checks.length,
    balancedExceptions, groups, failures, pass: row.after <= row.budget && groups.every(group => group.pass) };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [originalPath, independentPath, ...extra] = process.argv.slice(2);
  assert.ok(originalPath && independentPath && extra.length === 0,
    "Provide the original and independent silhouette reports");
  const original = JSON.parse(readFileSync(originalPath, "utf8"));
  const independent = JSON.parse(readFileSync(independentPath, "utf8"));
  assert.equal(original.id, independent.id);
  assert.equal(original.variant, independent.variant);
  assert.deepEqual(original.rows.map(row => row.lod), [0, 1]);
  assert.deepEqual(independent.rows.map(row => row.lod), [0, 1]);
  const rows = original.rows.map((row, lod) => evaluate(row, independent.rows[lod]));
  console.log(JSON.stringify({ id: original.id, variant: original.variant,
    silhouetteLimit: 0.15, balancedDifferenceLimit: 0.05, groupPeakLimit: 0.20, groupMeanDifferenceLimit: 0.15, rows,
    passesOfflineAcceptance: rows.every(row => row.pass) }, null, 2));
}
