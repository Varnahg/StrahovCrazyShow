/** Preserve source identity and summarize isolated network/server evidence. */
import { readFile, writeFile, mkdir, copyFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
const snapshot = resolve(process.argv[2] || '.cache/performance-snapshot/preintegration-20261010-a');
const destination = resolve(process.argv[3] || 'docs/performance/evidence/preintegration-20261010-a');
await mkdir(destination, { recursive: true });
const manifest = JSON.parse(await readFile(join(snapshot, 'source-manifest.json'), 'utf8'));
const telemetry = (await readFile(join(snapshot, 'server-telemetry.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const quant = (a, p) => a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] : null;
const round = n => n === null ? null : Math.round(n * 1000) / 1000;
const stages = [];
for (const file of (await readdir(snapshot)).filter(file => /^network-.*\.json$/.test(file) && !file.endsWith('.profiles.json')).sort()) {
  const report = JSON.parse(await readFile(join(snapshot, file), 'utf8'));
  // Entire one-second sampling window must fall within the measurement interval.
  const rows = telemetry.filter(row => row.time - row.elapsedMs >= report.startedAt && row.time <= report.endedAt);
  const { rawMonitor, positions, ...summary } = report;
  summary.telemetry = {
    samples: rows.length,
    cpuSingleCorePercent: round(rows.reduce((sum, row) => sum + row.cpuMs, 0) / rows.reduce((sum, row) => sum + row.elapsedMs, 0) * 100),
    cpuSingleCorePercentP95: round(quant(rows.map(row => row.singleCoreCpuPercent), .95)),
    rssMiBMax: round(Math.max(...rows.map(row => row.rssBytes)) / 1024 ** 2),
    eventLoopSampleP95MedianMs: round(quant(rows.map(row => row.eventLoopDelayP95Ms), .5)),
    eventLoopDelayMaxMs: round(Math.max(...rows.map(row => row.eventLoopDelayMaxMs))),
  };
  stages.push(summary);
  await copyFile(join(snapshot, file), join(destination, file));
}
for (const file of (await readdir(snapshot)).filter(file => /^network-.*\.profiles\.json$/.test(file))) {
  await copyFile(join(snapshot, file), join(destination, file));
}
await copyFile(join(snapshot, 'source-manifest.json'), join(destination, 'source-manifest.json'));
await copyFile(join(snapshot, 'server-telemetry.jsonl'), join(destination, 'server-telemetry.jsonl'));
await writeFile(join(destination, 'summary.json'), JSON.stringify({ snapshotId: manifest.snapshotId, capturedAt: new Date().toISOString(), stages }, null, 2) + '\n');
console.log(JSON.stringify(stages));
