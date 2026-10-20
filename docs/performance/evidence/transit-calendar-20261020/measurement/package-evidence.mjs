/** Assemble the COMPLETE explicit campaign, including every failed attempt. */
import { readFile, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256, writeNewJSON, validateResult } from './common.mjs';
import { assertComparableScenes } from './conditions.mjs';
import { readCampaign, readInventory, assessInterleaving } from './campaign.mjs';

export function statistics(values) {
  if (!values.length) return {count: 0, sum: 0, mean: null, median: null, p95: null, p99: null};
  const sorted = [...values].sort((a, b) => a - b), sum = values.reduce((a, b) => a + b, 0);
  const at = p => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {count: values.length, sum, mean: sum / values.length, median: at(.5), p95: at(.95), p99: at(.99)};
}
function condition(snapshot) {
  return {scenario: snapshot.scenario, viewport: snapshot.viewport, backbuffer: snapshot.backbuffer,
    gpu: snapshot.gpu, quality: snapshot.quality, yaw: snapshot.yaw, pitch: snapshot.pitch,
    avatars: snapshot.avatars.map(a => ({nickname: a.nickname, avatar: a.avatar, lod: a.lod})),
    passengers: snapshot.passengers.map(p => ({id: p.id, position: p.position, lod: p.lod})),
    ambient: snapshot.ambient, pool: snapshot.pool, scene: snapshot.scene};
}
async function readJSON(file) {
  const bytes = await readFile(file);
  return {file: resolve(file), sha256: sha256(bytes), value: JSON.parse(bytes)};
}
export async function buildBundle(inventory, variant) {
  const records = inventory.records.filter(record => record.begin.variant === variant);
  const starts = inventory.starts.filter(start => start.variant === variant);
  const identityFiles = [...new Set(starts.map(start => start.buildIdentityFile))];
  const builds = [];
  for (const file of identityFiles) {
    const identity = await readJSON(file);
    const source = await readJSON(join(identity.value.snapshot, 'source-manifest.json'));
    builds.push({identity, source});
  }
  const groups = [], signatures = new Set(), semantics = new Set(), sourceIds = new Set();
  for (const record of records.filter(record => record.accepted)) {
    const raw = record.receipt.raw;
    const build = builds.find(build => build.identity.file === resolve(record.begin.buildIdentityFile));
    validateResult(raw, build.identity.value);
    sourceIds.add(raw.sourceSnapshotId);
    for (const interval of raw.intervals) {
      signatures.add(sha256(JSON.stringify(condition(interval.before))));
      signatures.add(sha256(JSON.stringify(condition(interval.after))));
      semantics.add(interval.semanticHash);
    }
    groups.push({file: record.file, rawSha256: record.receipt.rawSha256, mode: raw.mode,
      startId: record.begin.startId, slot: record.begin.slot, attemptId: record.begin.attemptId,
      begunAt: record.begin.begunAt, startedAt: raw.startedAt, finishedAt: raw.finishedAt,
      intervals: raw.intervals.map((interval, index) => {
        const frames = statistics(interval.rawFrameMs), profile = interval.profile;
        return {index: index + 1, frames, fps: 1000 / frames.mean,
          profile: profile ? {update: statistics(profile.updateMs), prune: statistics(profile.pruneMs),
            pruneMsPerUpdate: statistics(profile.pruneMs).sum / profile.updates,
            updates: profile.updates, prunes: profile.prunes, scope: profile.scope} : null,
          validHealth: interval.before.health.valid && interval.after.health.valid && interval.benchmark.renderHealth.valid,
          avatars: interval.benchmark.avatars, ambient: interval.before.ambient,
          errors: interval.benchmark.renderErrorCount + interval.benchmark.assetLoadErrorCount};
      })});
  }
  if (sourceIds.size > 1) throw new Error('Accepted variant mixes source snapshots');
  return {schemaVersion: 2, variant, campaignId: inventory.campaign.campaignId, inventorySha256: inventory.inventorySha256,
    method: inventory.campaign.method, sourceSnapshotId: [...sourceIds][0] ?? null,
    conditionHashes: [...signatures], semanticHashes: [...semantics], builds, starts, groups,
    acceptedRecords: records.filter(record => record.accepted),
    failedRecords: records.filter(record => !record.accepted)};
}
async function main() {
  if (process.argv.length !== 3) throw new Error('Usage: package-evidence.mjs EXACT_CAMPAIGN_JSON (no manual raw selection)');
  const directory = dirname(fileURLToPath(import.meta.url));
  const outputs = Object.fromEntries(['baseline', 'candidate', 'comparison'].map(name => [name, join(directory, name + '.json')]));
  for (const path of Object.values(outputs)) {
    try { await access(path); throw new Error('Preserve existing evidence: ' + path); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const campaign = await readCampaign(process.argv[2]);
  const inventory = await readInventory(campaign);
  const method = assessInterleaving(inventory.records);
  const baseline = await buildBundle(inventory, 'A'), candidate = await buildBundle(inventory, 'B');
  const a = baseline.builds.find(build => build.source.value.snapshotId === baseline.sourceSnapshotId)?.source.value.files ?? {};
  const b = candidate.builds.find(build => build.source.value.snapshotId === candidate.sourceSnapshotId)?.source.value.files ?? {};
  const sourceDifferences = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(file => a[file] !== b[file]);
  const sourceParity = sourceDifferences.includes('client/transit-renderer.ts') && sourceDifferences.every(file =>
    file === 'client/transit-renderer.ts' || /^tests\/transit.*\.test\.ts$/.test(file));
  const groups = [...baseline.groups.map(group => ({...group, variant: 'A'})), ...candidate.groups.map(group => ({...group, variant: 'B'}))]
    .sort((a, b) => a.begunAt.localeCompare(b.begunAt));
  const harnesses = new Set([...baseline.acceptedRecords, ...candidate.acceptedRecords].map(record => record.receipt.raw.harnessSha256));
  const conditions = new Set([...baseline.conditionHashes, ...candidate.conditionHashes]);
  const semantics = new Set([...baseline.semanticHashes, ...candidate.semanticHashes]);
  const conditionErrors = [], reference = baseline.acceptedRecords[0]?.receipt.raw.intervals[0].before;
  if (!reference) conditionErrors.push({error: 'No accepted baseline'});
  else for (const record of [...baseline.acceptedRecords, ...candidate.acceptedRecords])
    for (const interval of record.receipt.raw.intervals)
      for (const snapshot of [interval.before, interval.after]) {
        try { assertComparableScenes(reference, snapshot); }
        catch (error) { conditionErrors.push({file: record.file, error: String(error)}); }
      }
  const totals = bundle => {
    const intervals = bundle.groups.flatMap(group => group.intervals.map(interval => ({mode: group.mode, ...interval})));
    return {plain: intervals.filter(interval => interval.mode === 'plain').map(interval => ({fps: interval.fps, p95: interval.frames.p95, p99: interval.frames.p99})),
      profile: intervals.filter(interval => interval.mode === 'profile').map(interval => ({updateMeanMs: interval.profile.update.mean,
        updateP95Ms: interval.profile.update.p95, pruneMsPerUpdate: interval.profile.pruneMsPerUpdate,
        updates: interval.profile.updates, prunes: interval.profile.prunes}))};
  };
  const comparison = {schemaVersion: 2, createdAt: new Date().toISOString(), method,
    inventory: {campaign: inventory.campaign, directory: inventory.directory, files: inventory.files,
      inventorySha256: inventory.inventorySha256, starts: inventory.starts, startFailures: inventory.startFailures,
      missingReceipts: inventory.missingReceipts,
      incompleteStarts: inventory.incompleteStarts,
      failedAttempts: inventory.records.filter(record => !record.accepted).map(record => ({begin: record.begin, file: record.file, reasons: record.reasons}))},
    sequence: groups.map(group => ({variant: group.variant, slot: group.slot, mode: group.mode, startId: group.startId,
      attemptId: group.attemptId, begunAt: group.begunAt, finishedAt: group.finishedAt, file: group.file, rawSha256: group.rawSha256})),
    sourceDifferences, checks: {sourceParity, sameHarness: harnesses.size === 1,
      completeCampaignInventory: inventory.missingReceipts === 0 && inventory.incompleteStarts === 0,
      exactPerModeInterleaving: method.valid, identicalRecordedConditions: conditions.size === 1,
      identicalTransitSemantics: semantics.size === 1, comparableCameraAndPopulation: conditionErrors.length === 0,
      allHealth: groups.length > 0 && groups.every(group => group.intervals.every(interval => interval.validHealth && interval.errors === 0 && interval.avatars >= 3))},
    conditions: {baseline: baseline.conditionHashes, candidate: candidate.conditionHashes, errors: conditionErrors},
    baseline: totals(baseline), candidate: totals(candidate),
    conclusion: 'All campaign raw, including failed and partial attempts, retained; only validated groups enter statistics. Coordinator must reject any false comparability/method flag. CPU and plain FPS remain separate; no gain inferred from sweep counts.'};
  await writeNewJSON(outputs.baseline, baseline);
  await writeNewJSON(outputs.candidate, candidate);
  await writeNewJSON(outputs.comparison, comparison);
  console.log(JSON.stringify({outputs, checks: comparison.checks, failedAttempts: comparison.inventory.failedAttempts.length, sourceDifferences}, null, 2));
  if (Object.values(comparison.checks).some(passed => !passed)) process.exitCode = 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
