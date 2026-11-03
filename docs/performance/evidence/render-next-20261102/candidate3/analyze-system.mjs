// Reproduce the provider-specific windows from the archived data. No game IO.
import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
const base = import.meta.dirname;
const summary = JSON.parse(await readFile(base + '/summary.json', 'utf8'));
const lines = async name => gunzipSync(await readFile(base + '/raw/' + name + '.gz')).toString('utf8').trim().split(/\r?\n/).map(JSON.parse);
const samples = (await lines('system-samples.jsonl')).filter(row => row.recordType === 'sample');
const allDriverRows = samples.flatMap(row => row.providers.nvidia?.rows ?? []);
if (new Set(allDriverRows.map(row => row.uuid)).size !== 1) throw new Error('This analysis requires the recorded single NVIDIA adapter');
const stats = values => {
  const finite = values.filter(Number.isFinite);
  return finite.length ? { count: finite.length, mean: finite.reduce((sum, n) => sum + n, 0) / finite.length, min: Math.min(...finite), max: Math.max(...finite) } : { count: 0, mean: null, min: null, max: null };
};
for (const run of summary.runs.filter(run => /^(native|queued)[12]$/.test(run.name))) {
  const records = (await lines(run.name + '.jsonl')).flatMap(row => row.records ?? []);
  const event = records.find(row => row.kind === 'lighting-preparation');
  const origin = records.find(row => row.kind === 'session-start').data.timeOrigin;
  const outerStart = origin + event.atMs - event.data.elapsedMs;
  const residual = event.data.elapsedMs - event.data.stages.reduce((sum, stage) => sum + stage.elapsedMs, 0);
  // Unallocated apply/restore/interstage time has no exact placement. Trim it
  // conservatively from the first-seven interval; timestamps remain inferred.
  const lo = outerStart + residual, hi = outerStart + run.firstSeven.elapsedMs;
  const cpuRows = samples.filter(row => {
    const p = row.providers.systemCpu;
    return Date.parse(p.startedUtc) - p.providerIntervalMs >= lo && Date.parse(p.endedUtc) <= hi;
  });
  const gpuRows = [...new Map(allDriverRows.filter(row => Date.parse(row.driverSampleUtc) >= lo && Date.parse(row.driverSampleUtc) <= hi)
    .map(row => [row.driverSampleUtc, row])).values()];
  run.systemWindow = {
    scope: 'Inferred interior of first seven completed stages; provider intervals, not frame-aligned samples. Arithmetic means, not time weighted.',
    lowerInclusiveEpochMs: lo, upperInclusiveEpochMs: hi, startUTC: new Date(lo).toISOString(), endUTC: new Date(hi).toISOString(),
    unallocatedTimingResidualMs: residual,
    derivation: 'outerStart=timeOrigin+lighting.atMs-lighting.elapsedMs; residual=lighting.elapsedMs-sum(all stage.elapsedMs); lo=outerStart+residual; hi=outerStart+sum(first seven stage.elapsedMs)',
    cpuSelection: 'provider.systemCpu.startedUtc-providerIntervalMs >= lo AND provider.systemCpu.endedUtc <= hi; finite rows[0].cpuPercent only. Whole collector utc/endedUtc/periodMs are not used.',
    gpuSelection: 'All NVIDIA rows with lo <= driverSampleUtc <= hi; last duplicate per driverSampleUtc, asserted one UUID; finite values only.',
    cpu: stats(cpuRows.map(row => row.providers.systemCpu.rows[0]?.cpuPercent)),
    collectorOneCorePercent: stats(cpuRows.map(row => row.logger.oneCorePercent)),
    collectorScope: 'Logger values on the selected CPU-provider records; logger owns a different sampling boundary.',
    collectorOverruns: cpuRows.filter(row => row.intervalOverrun).length,
    gpu: Object.fromEntries(['utilGpuPercent', 'graphicsMHz', 'memoryMHz', 'tempC', 'memoryUsedMiB', 'memoryTotalMiB'].map(key => [key, stats(gpuRows.map(row => row[key]))])),
    activeFlags: Object.fromEntries(['gpuIdleRaw', 'swPowerCapRaw', 'swThermalRaw', 'hwThermalRaw', 'hwPowerBrakeRaw'].map(key => [key, gpuRows.filter(row => row[key] === 'Active').length])),
  };
}
await writeFile(base + '/summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log(summary.runs.filter(run => run.systemWindow).map(run => ({ name: run.name, window: [run.systemWindow.startUTC, run.systemWindow.endUTC], cpu: run.systemWindow.cpu, gpu: run.systemWindow.gpu.utilGpuPercent })));
