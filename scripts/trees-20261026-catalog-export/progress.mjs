/** Small per-source ledger. Completed assets are validated once on admission;
 * repeated progress reads never rehash the entire growing catalogue. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ROOT,read,local,pinned,writeJson,loadRun,verifiedCompletion,parseArgs} from './io.mjs';
const compactPin=p=>({path:p.path,bytes:p.bytes,sha256:p.sha256});
const fromUrl=p=>({path:'public'+p.url,bytes:p.bytes,sha256:p.sha256});
export function uniqueBytes(pins){
 const files=new Map();for(const p of pins){if(!p||typeof p.path!=='string'||!Number.isSafeInteger(p.bytes)||p.bytes<1||!/^[a-f0-9]{64}$/.test(p.sha256))throw Error('Invalid budget descriptor');const old=files.get(p.path);if(old&&(old.bytes!==p.bytes||old.sha256!==p.sha256))throw Error('Conflicting shared budget descriptor');files.set(p.path,p);}
 return {bytes:[...files.values()].reduce((n,p)=>n+p.bytes,0),files:[...files.values()]};
}
function sumDirectory(directory){
 if(!fs.existsSync(directory))return 0;let bytes=0;
 for(const item of fs.readdirSync(directory,{withFileTypes:true})){const file=path.join(directory,item.name);if(item.isSymbolicLink())throw Error('Unexpected source scratch symlink');if(item.isDirectory())bytes+=sumDirectory(file);else if(item.isFile())bytes+=fs.statSync(file).size;}
 return bytes;
}
function sourceSummary(run,row){
 const id=row.sourceTreeId,target=`${run.cache}/progress/sources/${id}.json`;
 if(fs.existsSync(local(target))){const stored=read(target);if(stored.sourceTreeId!==id||stored.runId!==run.id)throw Error('Wrong progress source');return stored;}
 const accepted=run.recipe.acceptedSources?.[id];let complete;
 if(accepted){complete=JSON.parse(pinned(accepted));if(complete.sourceTreeId!==id||!complete.reopened)throw Error('Accepted progress identity mismatch');}
 else {complete=verifiedCompletion(run,id);if(!complete)return;}
 const persistent=[complete.native,...(complete.materialLibrary?[complete.materialLibrary]:[]),...(complete.dependencies??[]),...complete.lods].map(compactPin),far=[compactPin(complete.lods[2])];
 let cluster=complete.farClusterEvidence;
 if(row.family==='deciduous-broadleaf'&&!cluster){const directory=accepted?path.posix.dirname(accepted.path):`${run.cache}/${id}`;cluster=read(directory+'/far-fit.json');}
 if(cluster){pinned(cluster.file);far.push(compactPin(cluster.file));persistent.push(compactPin(cluster.file));}
 const timingPath=`${run.cache}/${id}/timing.json`,timing=fs.existsSync(local(timingPath))?read(timingPath):null;
 const result={runId:run.id,sourceTreeId:id,acceptedInput:!!accepted,persistent,far,
  intermediateBytes:(complete.intermediates??[]).reduce((n,p)=>n+p.bytes,0),timing,
  nativeBytes:complete.native.bytes,lodBytes:complete.lods.map(p=>p.bytes)};
 writeJson(target,result);return result;
}
export function recordProgress(run,sourceId){
 if(sourceId&&!run.catalog.placements.some(p=>p.sourceTreeId===sourceId))throw Error('Unknown progress source');
 const rows=[];for(const row of run.catalog.placements){const result=sourceSummary(run,row);if(result)rows.push(result);}
 const bank=read('public/models/vegetation/seasonal-r6-far/pilot-manifest.json').bank,bankData=read('public'+bank.url);
 const shared=[fromUrl(bank),...Object.values(bankData.textures).map(fromUrl)],far=uniqueBytes([...shared,...rows.flatMap(r=>r.far)]),persistent=uniqueBytes([...shared,...rows.flatMap(r=>r.persistent)]);
 const newlyProduced=persistent.files.filter(p=>p.path.startsWith(run.native+'/')||p.path.startsWith(run.public+'/')).reduce((n,p)=>n+p.bytes,0);
 const scratchBytes=sumDirectory(local(run.cache));let freeBytes=null;
 try{const stat=fs.statfsSync(ROOT);freeBytes=stat.bavail*stat.bsize;}catch{} // OS metadata may be unavailable; explicit progress remains truthful.
 const report={runId:run.id,completed:rows.length,total:run.catalog.placements.length,newSource:sourceId??null,
  farUniqueSourceBytes:far.bytes,farLimitBytes:96*1024*1024,logicalCatalogPersistentBytes:persistent.bytes,newRunPersistentBytes:newlyProduced,
  currentRunScratchBytes:scratchBytes,largestCompletedIntermediateBytes:Math.max(0,...rows.map(r=>r.intermediateBytes)),freeBytes,
  phaseSeconds:rows.find(r=>r.sourceTreeId===sourceId)?.timing?.seconds??null,sourceByteBudgetIsNotVram:true};
 const failure=far.bytes>report.farLimitBytes?'FAR source-byte budget exceeded':freeBytes!==null&&freeBytes<1024*1024*1024?'Less than one GiB remains for the next source scratch':null;
 fs.appendFileSync(local(run.cache+'/progress.jsonl'),JSON.stringify({...report,...(failure?{failure}:{})})+'\n');
 console.log('CATALOG_PROGRESS '+JSON.stringify(report));if(failure)throw Error(failure);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=parseArgs('--record');if(!a.run)throw Error('Require --run');recordProgress(loadRun(a.run),a.source);}
