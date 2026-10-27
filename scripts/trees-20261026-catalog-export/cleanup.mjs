/** Deletes only known regenerable intermediate FILES of new verified sources.
 * Never recurses or touches authoritative assets, receipts, previews or evidence. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,CACHE,local,loadRun,verifiedCompletion,pinned,read,writeJson,parseArgs} from './io.mjs';
export const PRESERVED_RUNS=Object.freeze(['ef984da606539b85','22923c68873fec4f','8b60d5845e72d3b0','9181e80f6beaf299','7a24e4627ac58dcc']);
const NAMES=new Set(['prepared.json','components.json','far-groups.json','far-fit.json','base.blend','lod0-base.glb','lod1-base.glb','lod2-base.glb']);
export function cleanupPlan(run,id,complete){
 if(!/^[a-f0-9]{16}$/.test(run.id)||run.cache!==`${CACHE}/runs/${run.id}`)throw Error('Cleanup run scope mismatch');
 if(PRESERVED_RUNS.includes(run.id))throw Error('Current evidence/counterfactual run is protected');
 if(complete?.b5Package||complete?.fullSourceFar)throw Error('Accepted pilot native package evidence is protected');
 if(!run.catalog.placements.some(p=>p.sourceTreeId===id)||complete?.runId!==run.id||complete.sourceTreeId!==id||complete.reopened!==true||!Array.isArray(complete.intermediates))throw Error('Source is not a verified compactable completion');
 const prefix=`${run.cache}/${id}/`,seen=new Set();return complete.intermediates.map(pin=>{
  const name=pin.path.slice(prefix.length);if(!pin.path.startsWith(prefix)||!NAMES.has(name)||seen.has(name)||!Number.isSafeInteger(pin.bytes)||pin.bytes<1||!/^[a-f0-9]{64}$/.test(pin.sha256))throw Error('Invalid transient cleanup member');seen.add(name);
  if(path.resolve(ROOT,pin.path)!==path.resolve(ROOT,prefix,name))throw Error('Cleanup escaped source directory');return {...pin};
 });
}
export function compactSource(run,id){
 const complete=verifiedCompletion(run,id);if(!complete)throw Error('Missing authoritative source completion');
 const plan=cleanupPlan(run,id,complete),done=`${run.cache}/${id}/compacted.json`;
 if(fs.existsSync(local(done))){if(plan.some(p=>fs.existsSync(local(p.path))))throw Error('Previously compacted transient was recreated; preserve for review');return read(done);}
 // Validate the complete delete set before the first unlink. Real paths must
 // equal their checked absolute paths; symlink/junction escapes are rejected.
 const existing=[],missing=[];
 for(const pin of plan){const p=local(pin.path);if(!fs.existsSync(p)){missing.push(pin);continue;}const stat=fs.lstatSync(p);if(!stat.isFile()||stat.isSymbolicLink()||fs.realpathSync(p).toLowerCase()!==p.toLowerCase())throw Error('Unsafe transient path');pinned(pin);existing.push(pin);}
 writeJson(`${run.cache}/${id}/compact-plan.json`,{runId:run.id,sourceTreeId:id,authoritative:[complete.native,complete.materialLibrary,...(complete.dependencies??[]),...complete.lods].filter(Boolean),intermediates:plan});
 for(const pin of existing)fs.unlinkSync(local(pin.path));
 const sum=items=>items.reduce((n,p)=>n+p.bytes,0);
 const report={runId:run.id,sourceTreeId:id,plannedFiles:plan.length,plannedBytes:sum(plan),alreadyMissingFiles:missing.length,alreadyMissingBytes:sum(missing),removedNowFiles:existing.length,removedNowBytes:sum(existing),confirmedAbsentFiles:plan.length,confirmedAbsentBytes:sum(plan),authoritativeAssetsPreserved:true};writeJson(done,report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=parseArgs('--compact');if(!a.run||!a.id||a.id==='all')throw Error('Require explicit single source ID');console.log(JSON.stringify(compactSource(loadRun(a.run),a.id)));}
