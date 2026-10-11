/** Validate raw UI benchmark outputs without smoothing or dropping slow samples. */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const evidence = resolve(process.argv[2]);
const source = JSON.parse(await readFile(join(evidence, 'source-manifest.json'), 'utf8'));
const records = [];
const invalidTransitions = [];
const filenamePattern = /^browser-(\d+)-(?:(crowd|spread|distributed)-)?(low|high)-.*\.json$/;
for (const file of (await readdir(evidence)).filter(file => filenamePattern.test(file)).sort()) {
  const expected = file.match(filenamePattern);
  const raw = JSON.parse(await readFile(join(evidence, file), 'utf8'));
  const expectedPlayers = Number(expected[1]);
  const invalid = [];
  if (!(raw.durationSeconds >= 10) || !(raw.frames > 0)) invalid.push('Missing full 10-second frame sample.');
  if (raw.avatars !== expectedPlayers) invalid.push('Minimum avatar count differs from filename.');
  if (raw.quality !== expected[3]) invalid.push('Quality differs from filename.');
  if (raw.viewport?.width !== 1920 || raw.viewport?.height !== 1080) invalid.push('CSS viewport is not the target 1920x1080.');
  if (!String(raw.renderer?.renderer).includes('Intel(R) UHD Graphics 630')) invalid.push('Renderer is not the target Intel UHD Graphics 630.');
  if (raw.quality === 'low' && (raw.renderResolution?.width !== 1476 || raw.renderResolution?.height !== 830)) invalid.push('Low backbuffer is not 1476x830.');
  if (raw.quality === 'high' && (raw.renderResolution?.width !== 1920 || raw.renderResolution?.height !== 1080)) invalid.push('High backbuffer is not 1920x1080.');
  if (![raw.averageFps, raw.p95FrameMs, raw.p99FrameMs].every(Number.isFinite)) invalid.push('Non-finite/missing timing metrics.');
  if (Object.values(raw.avatarLod || {}).reduce((sum, value) => sum + Number(value), 0) !== raw.avatars) invalid.push('LOD count sum differs from minimum avatar count.');
  records.push({
    file, layout: expected[2] || (expectedPlayers === 1 ? 'solo' : file.includes('spread') ? 'spread' : 'crowd'), sourceSnapshotId: source.snapshotId, validTargetSample: invalid.length === 0, invalid,
    strictTargetPassed: invalid.length === 0 && raw.averageFps >= 30 && raw.p95FrameMs <= 33.3,
    ...raw,
  });
}
for (const file of (await readdir(evidence)).filter(file => /^browser-transition-.*\.json$/.test(file)).sort()) {
  invalidTransitions.push({file, classification: 'invalidPopulationTransition', reason: 'Population changed within the sample; excluded from fixed 30/100-player pass claims while retaining the complete raw result.', raw: JSON.parse(await readFile(join(evidence, file), 'utf8'))});
}
const report = {
  capturedAt: new Date().toISOString(), sourceSnapshotId: source.snapshotId,
  acceptance: 'Each valid target sample must have averageFps >= 30 AND raw engine-frame p95 <= 33.3 ms. No averaging across repetitions to hide a failing run.',
  contextNote: 'Full production application UI benchmarks. Visibility, day/night, weather, camera and route are described in the accompanying report/screenshots, not inferred from FPS. Scene ambient/grass counts apply only to the recorded view.',
  records, invalidTransitions,
};
await writeFile(join(evidence, 'browser-summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(records.map(({file, avatars, quality, averageFps, p95FrameMs, p99FrameMs, strictTargetPassed, invalid}) => ({file, avatars, quality, averageFps, p95FrameMs, p99FrameMs, strictTargetPassed, invalid}))));
