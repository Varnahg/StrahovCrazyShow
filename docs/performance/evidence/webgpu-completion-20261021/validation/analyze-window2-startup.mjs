import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='docs/performance/evidence/webgpu-completion-20261021/validation/diagnostics-window2-20261024/';
const out='docs/performance/evidence/webgpu-completion-20261021/validation/diagnostics-window2-startup-analysis.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const sum=a=>a.reduce((x,y)=>x+y,0);
function union(intervals){const sorted=intervals.filter(([a,b])=>b>=a).sort((a,b)=>a[0]-b[0]);let total=0,start=null,end=null;for(const[a,b]of sorted){if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else {total+=end-start;start=a;end=b;}}return total+(start===null?0:end-start);}
const runs=[];
for(const run of ['startup-v20-low','startup-v20-high']){
 const bytes=await readFile(base+run+'/mp-startup.json'),r=JSON.parse(bytes);
 if(r.sourceSnapshotId!=='d38b63a6ac6c4c252b6137a9c5c54d2fd6298a9d65363b289186c3070466b43c'||r.startupLatency?.evidenceValid!==true||!r.preparationStages.valid)throw Error('Unexpected source or invalid evidence');
 const passes=[];
 for(const pass of r.startupStageRoutines.passes){const rows=r.preparationStages.rows.filter(s=>s.passIndex===pass.index);
  const latency=r.startupLatency.records.filter(v=>v[3]!==null&&v[2]<pass.endedAtMs&&v[3]>pass.startedAtMs);
  const clip=v=>[Math.max(v[2],pass.startedAtMs),Math.min(v[3],pass.endedAtMs)];
  const reasons={};for(const s of rows)for(const[k,v]of Object.entries(s.restartReasons??{}))reasons[k]=(reasons[k]??0)+v;
  passes.push({index:pass.index,quality:pass.quality,status:pass.status,variantsWindowMs:pass.endedAtMs-pass.startedAtMs,stageCount:rows.length,
   renders:sum(rows.map(s=>s.renders)),restarts:sum(rows.map(s=>s.restarts)),restartReasons:reasons,
   synchronousWallMs:Object.fromEntries(['apply','checkBatch','render'].map(k=>[k,sum(rows.map(s=>s.cpu[k].totalMs))])),
   originalCompletionLatency:{records:latency.length,unionAcrossChannelsMs:union(latency.map(clip)),
    channels:r.startupLatency.channels.map((c,i)=>({name:c.name,records:latency.filter(v=>v[1]===i).length,unionMs:union(latency.filter(v=>v[1]===i).map(clip))}))},
   stages:rows.map(s=>({name:s.stage,elapsedMs:s.elapsedMs,renders:s.renders,restarts:s.restarts,restartReasons:s.restartReasons,cpu:s.cpu})).sort((a,b)=>b.elapsedMs-a.elapsedMs)});
 }
 const capture=r.startupStageRoutines.capture;
 runs.push({run,inputSha256:sha(bytes),buildId:r.buildId,helperSha256:r.helperSha256,outcome:r.outcome,preparationSummary:r.preparationSummary,
  selected:{target:r.startupRoutines,reached:capture.reached,status:capture.status,complete:r.startupStageRoutines.complete,
   frames:capture.frames.map(f=>({frameId:f.frameId,nativeFrameIdAfter:f.nativeFrameIdAfter,progressed:f.progressed,
    readiness:f.rows.filter(v=>['PBRBaseMaterial.isReadyForSubMesh','StandardMaterial.isReadyForSubMesh'].includes(v.id)&&v.calls>0)}))},passes});
}
const verify=process.argv.includes('--verify');
const previous=verify?JSON.parse(await readFile(out,'utf8')):null;
const result={schemaVersion:1,createdAtUTC:previous?.createdAtUTC??new Date().toISOString(),runs,scope:[
 'Read-only arithmetic over actual preserved QA receipts; no new test, build, workload or GPU operation.',
 'Synchronous wall aggregates include instrumentation/JIT/GC/scheduling. Original completion intervals are wall latency, not GPU execution or shader ownership.',
 'Completion intervals are clipped to original variants-pass windows and merged across overlapping channels; do not sum popErrorScope with fence latency.',
 'Variants windows exclude surrounding quality-apply/restore work. Existing preparationSummary has the full budget including that work.',
 'Restart reason counters can overlap for the same restart and must not be summed as unique events.',
 'Low-target and High-target have different active instrumentation and are not matched performance A/B; unresolved/never-reached remain explicit.'
]};
if(verify){if(JSON.stringify(result)!==JSON.stringify(previous))throw Error('Derived result differs');}
else await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:out,sha256:sha(await readFile(out)),runs:runs.map(r=>({run:r.run,passes:r.passes.map(p=>({quality:p.quality,renders:p.renders,restarts:p.restarts,latencyUnionMs:p.originalCompletionLatency.unionAcrossChannelsMs}))}))}));
