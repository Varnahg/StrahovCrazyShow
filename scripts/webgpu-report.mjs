/** Recompute the renderer experiment from original downloaded frame samples.
 * Usage: node scripts/webgpu-report.mjs RUN_DIRECTORY ADJUDICATION_JSON OUTPUT_JSON
 * This offline report is deliberately separate from the measured game snapshot. */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

const [directory, adjudicationFile, outputFile] = process.argv.slice(2);
if (!directory || !adjudicationFile || !outputFile) throw new Error('Expected run directory, adjudication JSON and output JSON.');
const adjudication = JSON.parse(await readFile(resolve(adjudicationFile), 'utf8'));
const names = (await readdir(resolve(directory))).filter(name => /^[abc][1-3]-(webgl2|webgpu|webgpu-fast)-(off|first-on|warm|move|three)\.json$/.test(name)).sort();
const runs = [];
const median = values => { const a = values.slice().sort((x,y)=>x-y); const mid=Math.floor(a.length/2); return a.length%2 ? a[mid] : (a[mid-1]+a[mid])/2; };
const distribution = values => ({median: median(values), min: Math.min(...values), max: Math.max(...values)});
for (const name of names) {
  const bytes = await readFile(join(resolve(directory), name));
  const data = JSON.parse(bytes);
  const label = name.slice(0,-5);
  const [,repeat,backend,scenario] = label.match(/^([abc][1-3])-(webgl2|webgpu|webgpu-fast)-(off|first-on|warm|move|three)$/);
  const frames = data.frameIntervalsMs;
  if (!Array.isArray(frames) || !frames.length || frames.some(v=>!Number.isFinite(v)||v<=0)) throw new Error(`Invalid intervals: ${name}`);
  if (data.sourceSnapshotId !== adjudication.snapshotId) throw new Error(`Wrong snapshot: ${name}`);
  if (data.quality !== 'medium' || data.viewport.width !== 2040 || data.viewport.height !== 986 || data.renderResolution.width !== 2040 || data.renderResolution.height !== 986) throw new Error(`Unmatched quality/resolution: ${name}`);
  if (data.sceneView.lightingInstant !== 1792188000000) throw new Error(`Unmatched lighting: ${name}`);
  const ordered = frames.slice().sort((a,b)=>a-b);
  const percentile = p => ordered[Math.ceil(ordered.length*p)-1];
  const reject = adjudication.rejected[label];
  const valid = !reject && data.renderErrorCount === 0 && data.assetLoadErrorCount === 0;
  runs.push({label,repeat,backend,scenario,date:data.date,valid,rejection:reject??null,sha256:createHash('sha256').update(bytes).digest('hex'),rawFile:name,frames:frames.length,
    fps:frames.length*1000/frames.reduce((a,b)=>a+b,0),p95:percentile(.95),p99:percentile(.99),maximum:ordered.at(-1),
    hitches:Object.fromEntries([50,100,250,1000].map(t=>[t,frames.filter(v=>v>=t).length])),avatars:data.avatars,
    errors:{render:data.renderErrorCount,asset:data.assetLoadErrorCount},renderer:data.renderer,gpu:data.gpu,rendering:data.rendering,
    position:data.sceneView.position,yaw:data.sceneView.yaw,pitch:data.sceneView.pitch,camera:data.sceneView.camera,ambient:data.ambient,
    draws:data.drawCalls,triangles:data.triangles,frameBreakdownMs:data.frameBreakdownMs,engineCpuBreakdownMs:data.engineCpuBreakdownMs});
}
if (runs.length !== 34) throw new Error(`Expected all 34 retained runs, got ${runs.length}.`);
const groups = [];
for (const backend of ['webgl2','webgpu','webgpu-fast']) for (const scenario of ['off','first-on','warm','move','three']) {
  const selected=runs.filter(r=>r.backend===backend&&r.scenario===scenario&&r.valid);
  if (!selected.length) continue;
  groups.push({backend,scenario,n:selected.length,pilot:backend==='webgpu-fast',...Object.fromEntries(['fps','p95','p99','maximum'].map(key=>[key,distribution(selected.map(r=>r[key]))]))});
}
const report = {snapshotId:adjudication.snapshotId,method:'FPS=count/sum(raw intervals)*1000; nearest-rank per-run percentiles; median and full min/max across repetitions, no pooling of percentiles.',
  order:['a1','b1','b2','a2','a3','b3','c1'],limits:adjudication.limits,groups,rejected:runs.filter(r=>!r.valid).map(r=>({label:r.label,reason:r.rejection})),runs};
await writeFile(resolve(outputFile), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({runs:runs.length,accepted:runs.filter(r=>r.valid).length,rejected:report.rejected.length,groups:groups.length}));
