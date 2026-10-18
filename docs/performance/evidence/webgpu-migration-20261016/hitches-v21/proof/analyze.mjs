import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const stat = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = sorted.length >> 1;
  return { n: sorted.length, min: sorted[0], median: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2, max: sorted.at(-1) };
};
const reports = ['05', '06', '07'].map(run => ({ run, data: read(`report-run-${run}.json`) }));
const summarize = frames => {
  const metricNames = [...new Set(frames.flatMap(frame => Object.keys(frame.metrics.samples)))].sort();
  return { frames: frames.length, wallMs: stat(frames.map(f => f.wallMs)), syncRenderMs: stat(frames.map(f => f.cpu.syncMs)), lightToggleMs: stat(frames.map(f => f.toggleMs)), budgetMs: stat(frames.map(f => f.cpu.budgetMs)), orderingMs: stat(frames.map(f => f.cpu.orderingMs)), sceneRenderMs: stat(frames.map(f => f.cpu.sceneRenderMs)), samples: Object.fromEntries(metricNames.map(name => [name, { callsPerFrame: [...new Set(frames.map(f => f.metrics.samples[name]?.calls ?? 0))], totalMs: stat(frames.map(f => f.metrics.samples[name]?.totalMs ?? 0)) }])), countsPerFrame: Object.fromEntries([...new Set(frames.flatMap(f => Object.keys(f.metrics.counts)))].sort().map(name => [name, [...new Set(frames.map(f => f.metrics.counts[name] ?? 0))]])) };
};
const summary = {
  note: 'Each entry is a total for 36 actual submeshes in one frame. Inclusive scopes overlap; no self-time subtraction. Node/NullEngine, no GPU/browser extrapolation.',
  runs: reports.map(({ run, data }) => ({ run, startedAt: data.startedAt, finishedAt: data.finishedAt })),
  cases: ['pbr', 'standard', 'surface'].map(kind => {
    const cases = reports.map(({ data }) => data.cases.find(c => c.kind === kind && !c.fail));
    for (const item of cases) { assert.equal(item.frames.length, 32); assert.ok(item.invariants.fullSnapshotsStable); assert.ok(item.frames.every(f => f.newPrograms === 0 && f.draws === 36)); assert.ok(item.cleanup.allEffectsDisposed && item.cleanup.contextsDisposed); }
    const frames = cases.flatMap(c => c.frames);
    return { kind, totalFrames: frames.length, switched: summarize(frames.filter(f => f.switched)), unchanged: summarize(frames.filter(f => !f.switched)), uninstrumentedControls: { note: 'Before timing hooks; uniform argument observer is still present. Only 2 transitions and 3 unchanged frames per process; not a stable throughput benchmark.', switchedSyncMs: stat(cases.flatMap(c => c.controls.filter(f => f.switched).map(f => f.cpu.syncMs))), unchangedSyncMs: stat(cases.flatMap(c => c.controls.filter(f => !f.switched).map(f => f.cpu.syncMs))) }, perRun: cases.map((item, i) => ({ run: reports[i].run, switched: summarize(item.frames.filter(f => f.switched)), unchanged: summarize(item.frames.filter(f => !f.switched)) })), invariantResults: cases.map((item, i) => ({ run: reports[i].run, ...item.invariants, genuineValue: { newPrograms: item.genuineValue.newPrograms }, referencesBefore: item.referencesBefore, referencesAfterWarmSwitches: item.referencesAfterWarmSwitches, cleanup: item.cleanup })) };
  }),
  limits: reports[0].data.limits,
  reports: Object.fromEntries(reports.map(({ run }) => { const bytes = fs.readFileSync(new URL(`report-run-${run}.json`, import.meta.url)); return [`report-run-${run}.json`, { sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length }]; })),
};
fs.writeFileSync(new URL('summary.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary.cases.map(c => ({ kind: c.kind, switchedFrames: c.switched.frames, unchangedFrames: c.unchanged.frames, syncRenderMedianMs: c.switched.syncRenderMs.median, unchangedSyncMedianMs: c.unchanged.syncRenderMs.median, ready: c.switched.samples.materialReadyInclusive.totalMs.median, defines: (c.switched.samples.pbrPrepareDefinesInclusive ?? c.switched.samples.standardReadinessThroughDefines).totalMs.median, options: c.switched.samples.optionsBeforeSerializer.totalMs.median, serializer: c.switched.samples.serializerInclusive.totalMs.median, cache: c.switched.samples.nativeCreateEffectInclusive.totalMs.median, reset: c.switched.samples.webGpuDrawContextResetInclusive.totalMs.median, setEffect: c.switched.samples.subMeshSetEffectInclusive.totalMs.median, controls: c.uninstrumentedControls })), null, 2));
