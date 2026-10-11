/** Read/copy evidence only; no game, browser benchmark or live scene mutation. */
import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const folder = import.meta.dirname;
const root = resolve(folder, '../../../..');
const snapshot = join(root, '.cache/performance-snapshot/github-demo-20261011-l2');
const read = async path => JSON.parse(await readFile(path, 'utf8'));
const sha = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const [source, target] of [
  ['pilot-baseline-network.json', 'baseline-network.json'],
  ['pilot-baseline-network.json.profiles.json', 'baseline-network.profiles.json'],
  ['scripts/performance-network.ts', 'baseline-network-harness.ts.txt'],
  ['client/avatar-presets.ts', 'baseline-avatar-presets.ts.txt'],
]) await copyFile(join(snapshot, source), join(folder, target));
await copyFile(join(root, 'scripts/performance-diverse.mjs'), join(folder, 'baseline-profile-wrapper.mjs.txt'));
await copyFile(join(root, 'scripts/performance-preview.mjs'), join(folder, 'baseline-preview.mjs.txt'));
const network = await read(join(folder, 'baseline-network.json'));
const profiles = await read(join(folder, 'baseline-network.profiles.json'));
const manifest = await read(join(snapshot, 'source-manifest.json'));
const fixture = await read(join(folder, 'weather-fixture.json'));
const snapshotId = manifest.snapshotId;
const expectedFixtureSha = 'aa2030018833952bd83c858ba208ff22c03de20aa7c32432101b88efaad24574';
assert.equal(await sha(join(folder, 'weather-fixture.json')), expectedFixtureSha);
assert.equal(await sha(join(folder, 'baseline-network-harness.ts.txt')), network.harnessSha256);
assert.equal(await sha(join(folder, 'baseline-profile-wrapper.mjs.txt')), profiles.extraHarnessSha256);
assert.equal(await sha(join(folder, 'baseline-avatar-presets.ts.txt')), profiles.presetSourceSha256);
assert.equal(network.sourceSnapshotId, snapshotId);
assert.equal(profiles.sourceSnapshotId, snapshotId);
assert.equal(network.count, 29);
assert.equal(network.expectedPopulation, 30);
assert.equal(network.authenticatedRooms, 29);
assert.equal(network.worldIds.length, 1);
assert.equal(network.minRowsPerMotion, 30);
assert.equal(network.maxRowsPerMotion, 30);
assert.equal(network.movingClients, 29);
assert.equal(network.errors.length, 0);
assert.equal(profiles.issuedProfiles.length, 29);
assert.equal(new Set(profiles.issuedProfiles.map(p => p.id)).size, 29);
assert.deepEqual(profiles.issuedProfiles.map(p => p.id).sort(), network.positions.map(p => p.id).sort());
const presetCounts = Array(6).fill(0);
profiles.issuedProfiles.forEach((profile, index) => {
  assert.equal(profile.avatar.preset, index % 6);
  presetCounts[profile.avatar.preset]++;
});
assert.ok(presetCounts.every(n => n > 0));
for (const evidence of [network, profiles])
  for (const imported of evidence.harnessProvenance.verifiedGameImports) {
    assert.equal(imported.actualSha256, imported.snapshotSha256);
    assert.equal(imported.actualSha256, manifest.files[imported.snapshotPath]);
    assert.equal(imported.matchesSnapshot, true);
  }

const weatherResponse = await fetch('http://127.0.0.1:4175/api/weather');
assert.equal(weatherResponse.status, 200);
const servedWeather = await weatherResponse.json();
const expectedServed = { ...fixture, status: 'fallback',
  source: 'Řízené testovací počasí · uložený záznam',
  cloudSource: 'Řízený meteorologický model · benchmark',
  cloudWindSource: 'Řízené modelové proudění · benchmark',
};
assert.deepEqual(servedWeather, expectedServed);
const weatherCapture = { capturedAt: new Date().toISOString(), url: 'http://127.0.0.1:4175/api/weather',
  status: weatherResponse.status, fixtureSha256: expectedFixtureSha,
  helperSha256: await sha(join(folder, 'baseline-preview.mjs.txt')), matchesExpectedServedFixture: true,
  timing: 'Post-baseline read-only observation; historical installation is supported by coordinator startup output and visible UI source, not an embedded per-frame baseline capture.',
  response: servedWeather };
await writeFile(join(folder, 'baseline-weather-observation.json'), JSON.stringify(weatherCapture, null, 2) + '\n');

const inputs = [1, 30].flatMap(n => ['a','b','c'].map(suffix => `baseline-${n}-day-${suffix}.json`));
const reference = await read(join(folder, inputs[0]));
const comparedFields = {
  sourceSnapshotId: s => s.sourceSnapshotId,
  cameraAndLighting: s => s.sceneView,
  cssViewport: s => s.viewport,
  internalResolution: s => s.renderResolution,
  quality: s => s.quality,
  gpu: s => s.renderer,
  qualityMode: s => s.rendering.mode,
  hardwareScaling: s => s.rendering.hardwareScaling,
  renderBudgets: s => s.rendering.budgets,
  ambientPopulation: s => s.ambient,
};
const samples = [];
for (const file of inputs) {
  const data = await read(join(folder, file));
  const expectedPopulation = Number(file.split('-')[1]);
  const endMs = Date.parse(data.date);
  const estimatedStartMs = endMs - data.durationSeconds * 1000;
  const interval = { estimatedStartUtc: new Date(estimatedStartMs).toISOString(), endUtc: data.date,
    startEstimateRoundingAllowanceMs: 5,
    fullyInsideMeasuredNetworkCohort: expectedPopulation === 30
      ? estimatedStartMs - 5 >= network.startedAt && endMs <= network.endedAt : null };
  const checks = Object.fromEntries(Object.entries(comparedFields).map(([key, pick]) => [key, equal(pick(data), pick(reference))]));
  checks.snapshotMatchesNetworkAndManifest = data.sourceSnapshotId === snapshotId;
  checks.minimumPopulationMatches = data.avatars === expectedPopulation;
  checks.durationAtLeastTenSeconds = data.durationSeconds >= 10;
  checks.zeroRenderAndAssetErrors = data.renderErrorCount === 0 && data.assetLoadErrorCount === 0;
  checks.manualLowQuality = data.quality === 'low' && data.rendering.mode === 'low';
  checks.networkIntervalContainment = expectedPopulation !== 30 || interval.fullyInsideMeasuredNetworkCohort;
  const invalidReasons = Object.entries(checks).filter(([, pass]) => !pass).map(([key]) => key);
  samples.push({ file, sha256: await sha(join(folder, file)), status: invalidReasons.length ? 'invalid' : 'valid', invalidReasons,
    expectedPopulation, minimumPopulationAcrossFrames: data.avatars, interval, checks,
    frames: data.frames, durationSeconds: data.durationSeconds,
    averageFps: data.averageFps, p95FrameMs: data.p95FrameMs, p99FrameMs: data.p99FrameMs,
    renderErrorCount: data.renderErrorCount, assetLoadErrorCount: data.assetLoadErrorCount,
    drawCallsLastFrame: data.drawCalls, trianglesAllPassesLastFrame: data.triangles,
    frameBreakdownMeanMs: data.frameBreakdownMs, lastFrameWorkMs: data.frameWork,
    finalAvatarLod: data.avatarLod, finalTreeLod: data.renderCost.vegetation.treeDetailCounts,
    finalLoadedTreeMeshes: data.renderCost.vegetation.loadedTreeMeshes });
}
const excludedFiles = [
  ['baseline-discovery.json', 'Uncontrolled discovery interval; never part of the formal baseline.'],
  ['excluded-baseline-concurrent-cpu.json', 'Concurrent targeted tests/CPU microstudy; deliberately excluded.'],
  ['excluded-baseline-30-concurrent-typecheck.json', 'Concurrent avatar core tests/typecheck; deliberately excluded.'],
  ['excluded-baseline-night-after-cohort.json', 'Night interval extends beyond measured cohort and minimum population fell to one; excluded from 30-avatar evidence.'],
];
const excluded = [];
for (const [file, reason] of excludedFiles) {
  const raw = await read(join(folder, file));
  const data = raw.benchmark ?? raw;
  excluded.push({ file, sha256: await sha(join(folder, file)), status: 'invalid', includedInAggregates: false,
    reason, originalExclusionReason: raw.excludedReason ?? null, date: data.date, minimumPopulationAcrossFrames: data.avatars });
}
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
const groups = [1,30].map(population => {
  const valid = samples.filter(s => s.status === 'valid' && s.expectedPopulation === population);
  return { population, validIntervals: valid.length, files: valid.map(s => s.file),
    medianIntervalAverageFps: median(valid.map(s => s.averageFps)),
    medianIntervalP95FrameMs: median(valid.map(s => s.p95FrameMs)),
    medianIntervalP99FrameMs: median(valid.map(s => s.p99FrameMs)),
    scope: 'Median of interval summaries, not a pooled frame percentile or a cross-population average.' };
});
const evidenceFiles = ['baseline-network.json','baseline-network.profiles.json','baseline-network-harness.ts.txt',
  'baseline-profile-wrapper.mjs.txt','baseline-avatar-presets.ts.txt','baseline-preview.mjs.txt','weather-fixture.json',
  'baseline-weather-observation.json','validate-baseline.mjs'];
const summary = {
  auditedAt: new Date().toISOString(), status: samples.every(s=>s.status==='valid') ? 'valid-with-documented-limitations' : 'has-invalid-formal-samples',
  sourceSnapshotId: snapshotId, validSampleCount: samples.filter(s=>s.status==='valid').length,
  excludedSampleCount: excluded.length,
  intervalSemantics: 'Frozen L2 client/game.ts emits date at benchmark completion, rounds durationSeconds to 0.01 s, and stores avatars as the minimum seen every frame. Start UTC is reconstructed with an additional 5 ms rounding allowance.',
  referenceConditions: { sceneView: reference.sceneView, viewport: reference.viewport, internalResolution: reference.renderResolution,
    quality: reference.quality, renderer: reference.renderer, renderBudgets: reference.rendering.budgets, ambient: reference.ambient },
  samples, groups, excluded,
  network: { file: 'baseline-network.json', profilesFile: 'baseline-network.profiles.json',
    measuredStartUtc: new Date(network.startedAt).toISOString(), measuredEndUtc: new Date(network.endedAt).toISOString(),
    durationMs: network.durationMs, warmupSeconds: network.warmupSeconds,
    botCount: network.count, expectedTotalPopulation: network.expectedPopulation, worldCount: network.worldIds.length,
    minRowsPerMotion: network.minRowsPerMotion, maxRowsPerMotion: network.maxRowsPerMotion,
    movingClients: network.movingClients, serverTickHz: network.tickHzServerClock, motionHz: network.motionHz,
    errors: network.errors, resyncsDuringWholeMeasurement: network.resyncsDuringMeasurement,
    stopReason: network.stopReason,
    profiles: { count: profiles.issuedProfiles.length, presetCounts, allSixPresetsPresent: presetCounts.every(n=>n>0),
      issuedIdsExactlyMatchNetworkPositions: true, importedSourceHashesMatchFrozenManifest: true,
      scope: 'Successful normal session-issuance payload capture with IDs linked to the network cohort. No independent post-join profile echo was captured.' } },
  weather: { fixtureFile: 'weather-fixture.json', fixtureSha256: expectedFixtureSha,
    postRunObservationFile: 'baseline-weather-observation.json', coordinatorObservedStartupFixtureSha256: expectedFixtureSha,
    limitation: 'Historical installation is confirmed by coordinator startup output and UI. Post-run HTTP response matches fixture. Baseline JSON lacks weatherAtStart/weatherAtEnd, so exact shader use throughout each interval is not independently embedded.' },
  limitations: [
    'Valid formal samples were coordinated without concurrent CPU studies, tests or additional GPU scenes. This is operator evidence; there is no complete OS process-load trace.',
    'The network cohort contains 87 authority resync flags and no application errors. Raw evidence lacks timestamps for each resync; none can be assigned to or subtracted from the three valid GPU intervals. Network stability is not declared passed.',
    'Moving avatars occupy different exact positions and LODs at interval end; comparable means identical source, camera, quality, resolution, fixture and population contract, not pixel-identical crowd poses.',
    'CPU frameBreakdownMs values are interval means; frameWork is the final sample; rendering.statistics is a separate short adaptive window. These scopes are not combined.',
    'Only Intel UHD 630 at low quality is measured here. No NVIDIA, higher quality, night baseline or 60 FPS success is inferred.',
  ],
  fileSha256: Object.fromEntries(await Promise.all(evidenceFiles.map(async file => [file, await sha(join(folder,file))]))),
};
await writeFile(join(folder, 'baseline-summary.json'), JSON.stringify(summary,null,2)+'\n');
assert.equal(summary.validSampleCount, 6);
console.log(JSON.stringify({status:summary.status,validSampleCount:summary.validSampleCount,excludedSampleCount:summary.excludedSampleCount,groups,presetCounts,resyncs:network.resyncsDuringMeasurement},null,2));
