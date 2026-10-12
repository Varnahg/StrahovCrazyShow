import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const root = import.meta.dirname;
const read = async name => JSON.parse(await readFile(join(root, name), 'utf8'));
const pipeline = await read('b2-pipeline.json');
const network = await read('b2-network-29.json');
const profiles = await read('b2-network-29.json.profiles.json');
const samples = [];
for (const file of ['b2-b4-north-day-full.json', 'b2-thirty-day-medium-full.json']) {
  const d = await read(file);
  if (d.sourceSnapshotId !== pipeline.sourceSnapshotId || d.renderErrorCount || d.assetLoadErrorCount) throw Error('Unexpected sample: ' + file);
  samples.push({ file, date: d.date, sourceSnapshotId: d.sourceSnapshotId, avatars: d.avatars, fps: d.averageFps,
    p95FrameMs: d.p95FrameMs, p99FrameMs: d.p99FrameMs, durationSeconds: d.durationSeconds, frames: d.frames,
    gpu: d.gpu, viewport: d.viewport, renderResolution: d.renderResolution, quality: d.quality,
    sceneView: d.sceneView, frameWork: d.frameWork, frameBreakdownMs: d.frameBreakdownMs,
    triangles: d.triangles, drawCalls: d.drawCalls, renderErrorCount: d.renderErrorCount, assetLoadErrorCount: d.assetLoadErrorCount });
}
if (samples[1].avatars !== 30 || network.minRowsPerMotion !== 30 || network.maxRowsPerMotion !== 30 || network.errors.length || network.resyncsDuringMeasurement) throw Error('Invalid cohort');
const measurementEnd = Date.parse(samples[1].date);
if (measurementEnd - samples[1].durationSeconds * 1000 < network.startedAt || measurementEnd > network.endedAt) throw Error('Sample outside cohort interval');
const report = { sourceSnapshotId: pipeline.sourceSnapshotId, pipeline, samples,
  network: { durationMs: network.durationMs, minRowsPerMotion: network.minRowsPerMotion, maxRowsPerMotion: network.maxRowsPerMotion,
    worldIds: network.worldIds, distinctPresets: new Set(profiles.issuedProfiles.map(p => JSON.stringify(p.avatar))).size,
    errors: network.errors, resyncs: network.resyncsDuringMeasurement },
  limits: 'Intel UHD630, medium 1280x720, full production game and HUD; not GeForce or a 60 FPS result. Camera differs from B1, therefore no speedup/regression A/B claim.',
  visual: 'B4 PBR panels now respond to daylight; photographed north/west faces, window detail, market, B6 entry and stadium exterior. No image generation or screenshot retouching.',
  practical: [
    'Actual A/D walking in camera-relative directions and orbit/first-person camera used across the route. Browser denied pointer lock; documented drag fallback worked.',
    'Car entered, W+A turned left, W+D turned right, handbrake stopped, E exited safely. This is not exhaustive vehicle roof/collision certification.',
    'B6 external stairs climbed into reception and descended to (-4.6385,-89.5129). An initial retreat stopped at the entry edge; recentring passed without jumping or respawn.',
    'Brief HUD drop to 7-8 FPS while approaching B6 interior, recovering to 26 FPS; not a timed benchmark and not claimed resolved.',
    'Stadium east wall stopped the walker at x=-143.1999; continued forward input left x=-143.2059 with slight tangential sliding. Whole perimeter not walked.'
  ] };
await writeFile(join(root, 'b2-summary.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({sourceSnapshotId: report.sourceSnapshotId, samples: samples.map(s => ({file:s.file,avatars:s.avatars,fps:s.fps,p95:s.p95FrameMs,p99:s.p99FrameMs})),network:report.network}));
