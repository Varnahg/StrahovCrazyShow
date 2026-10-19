import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const [input, output] = process.argv.slice(2);
assert(input && output, 'Usage: node analyze-manual-phases.mjs INPUT_JSONL OUTPUT_JSON');
const bytes = readFileSync(input);
const sha256 = createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256, '8c2fea5401289b1465b35aae9154f1365ab8ef8413ca2933c5a39e2d90229a88');
const records = bytes.toString('utf8').trim().split(/\r?\n/).flatMap(line => JSON.parse(line).records ?? []).sort((a,b)=>a.seq-b.seq);
records.forEach((record, i) => assert.equal(record.seq, i));
const states = records.filter(r => r.kind === 'browser-state');
const blocks = [];
for (const r of records.filter(r => r.kind === 'frame-window')) {
  const d = r.data, c = d.context;
  const signature = JSON.stringify([c.rendering.mode,c.rendering.quality,c.rendering.hardwareScaling,c.viewport.width,c.viewport.height]);
  let block = blocks.at(-1);
  if (block?.signature !== signature) blocks.push(block = { signature, mode:c.rendering.mode, from:d.fromMs, to:d.toMs, records:[] });
  block.to = d.toMs;
  block.records.push(r);
}
const result = { inputSha256:sha256, selection:'Longest manual quality block; visible/focused complete windows, exclude 2s around browser-state and first2s of quality block. Same selection as original manual-analysis derive.mjs.', quality:{} };
for (const quality of ['medium','high']) {
  const block = blocks.filter(b=>b.mode===quality).sort((a,b)=>(b.to-b.from)-(a.to-a.from))[0];
  const chosen = block.records.filter(({data:d}) => {
    const prior = states.filter(s=>s.atMs<=d.fromMs).at(-1);
    return d.visibility==='visible' && !d.afterVisibilityChange && d.fromMs>=block.from+2000 && prior?.data.visibility==='visible' && prior?.data.focused===true && !states.some(s=>s.atMs>d.fromMs-2000 && s.atMs<=d.toMs+2000);
  });
  const count = chosen.reduce((n,r)=>n+r.data.frameMs.length,0);
  assert.equal(count, quality==='medium'?8761:7578);
  const phases = Object.fromEntries(['simulation','world','avatarsAndCamera','environment','render','labels'].map(phase=>[phase,{
    meanMs:chosen.reduce((n,r)=>n+(r.data.phaseTotals[phase]??0),0)/count,
    maxMs:Math.max(...chosen.map(r=>r.data.phaseMax[phase]??0)),
    windowsWithPhaseMaxOver5ms:chosen.filter(r=>r.data.phaseMax[phase]>5).length,
    windowsWithPhaseMaxOver20ms:chosen.filter(r=>r.data.phaseMax[phase]>20).length,
  }]));
  const positions = chosen.map(r=>r.data.context.position);
  const span = axis=>Math.max(...positions.map(p=>p[axis]))-Math.min(...positions.map(p=>p[axis]));
  result.quality[quality] = { frames:count, windows:chosen.length, phases, positionSpanMetres:{x:span('x'),z:span('z')}, vehicleWindows:chosen.filter(r=>r.data.context.vehicle).length };
}
result.limits = ['Environment includes multiple controllers, not just grass. No exclusive grass timings or cache misses in this test.', 'Per-phase maxima are maxima over selected windows; they need not belong to the longest frame.', 'CPU wall scope excludes later HUD/recorder work; this is not per-thread CPU running time or a GPU measurement.'];
writeFileSync(output, JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
