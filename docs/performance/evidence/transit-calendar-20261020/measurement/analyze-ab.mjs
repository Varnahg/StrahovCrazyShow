import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {statistics} from './package-evidence.mjs';
const directory=dirname(fileURLToPath(import.meta.url));
if(process.argv.length>3 || (process.argv[2]!==undefined && process.argv[2]!=='--stdout'))throw Error('Usage: analyze-ab.mjs [--stdout]');
const read=async name=>{const bytes=await readFile(join(directory,name+'.json'));return{sha256:createHash('sha256').update(bytes).digest('hex'),value:JSON.parse(bytes)}};
const a=await read('baseline'),b=await read('candidate'),comparison=await read('comparison');
const summarize=records=>{
 const profile=records.filter(r=>r.begin.mode==='profile').flatMap(r=>r.receipt.raw.intervals);
 const plain=records.filter(r=>r.begin.mode==='plain').flatMap(r=>r.receipt.raw.intervals);
 const updates=profile.flatMap(i=>i.profile.updateMs),prunes=profile.flatMap(i=>i.profile.pruneMs),frames=plain.flatMap(i=>i.rawFrameMs);
 const frameStats=statistics(frames);
 return{profileIntervals:profile.length,plainIntervals:plain.length,updates:updates.length,prunes:prunes.length,
  updateMs:statistics(updates),pruneMsPerUpdate:statistics(prunes).sum/updates.length,
  plain:{frames:frameStats.count,fps:1000/frameStats.mean,frameMs:frameStats},
  perStart:[...new Set(records.map(r=>r.begin.slot))].sort().map(slot=>{
   const subset=records.filter(r=>r.begin.slot===slot);
   const u=subset.filter(r=>r.begin.mode==='profile').flatMap(r=>r.receipt.raw.intervals).flatMap(i=>i.profile.updateMs);
   const p=subset.filter(r=>r.begin.mode==='profile').flatMap(r=>r.receipt.raw.intervals).flatMap(i=>i.profile.pruneMs);
   const f=subset.filter(r=>r.begin.mode==='plain').flatMap(r=>r.receipt.raw.intervals).flatMap(i=>i.rawFrameMs);
   return{slot,updateMeanMs:statistics(u).mean,pruneMsPerUpdate:statistics(p).sum/u.length,fps:1000/statistics(f).mean,p95Ms:statistics(f).p95,p99Ms:statistics(f).p99};
  })};
};
const baseline=summarize(a.value.acceptedRecords),candidate=summarize(b.value.acceptedRecords);
const pairs=baseline.perStart.map((x,index)=>({baseline:x,candidate:candidate.perStart[index],
 updateDifferenceMs:candidate.perStart[index].updateMeanMs-x.updateMeanMs,
 fpsDifference:candidate.perStart[index].fps-x.fps}));
const report={schemaVersion:1,method:'All raw intervals retained. CPU wall times are inclusive, update contains nested prune; do not add them. Pooled frame quantiles use sorted[min(n-1,floor(n*p))]. Three independent starts per variant; intervals within a start are not independent trials.',
 evidence:{baseline:a.sha256,candidate:b.sha256,comparison:comparison.sha256},
 checks:comparison.value.checks,baseline,candidate,pairs,
 observed:{updateMeanChangePercent:100*(candidate.updateMs.mean/baseline.updateMs.mean-1),
  removedProfiledPruneMsPerUpdate:baseline.pruneMsPerUpdate-candidate.pruneMsPerUpdate,
  plainFpsChangePercent:100*(candidate.plain.fps/baseline.plain.fps-1)},
 interpretation:'No automatic acceptance or FPS gain claim. Coordinator must interpret variability, nested timer overhead, functional parity and the frozen task acceptance.'};
if(process.argv[2]!=='--stdout')await writeFile(join(directory,'analysis.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
