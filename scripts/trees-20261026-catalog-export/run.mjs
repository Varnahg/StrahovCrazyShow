/** Explicit sequential process runner. Requires a separately allocated heavy
 * window; never acquires GPU, launches browsers, or runs test/build workflows. */
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {ROOT,loadRun,selectedRows,parseArgs,writeJson,verifiedCompletion} from './io.mjs';
import {recordProgress} from './progress.mjs';
const BLENDER='C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
function blender(run,runPath,id,script,preview=false,compact=false,pauseAfter){
 const log=path.join(ROOT,run.cache,'batch-'+id.slice(0,80).replaceAll(',','_')+'.log');fs.mkdirSync(path.dirname(log),{recursive:true});const file=fs.openSync(log,'a');
 try{const result=spawnSync(BLENDER,['--background','--threads','2','--python-exit-code','1','--python',path.join(ROOT,'scripts/trees-20261026-catalog-export',script),'--',`--run=${runPath}`,`--id=${id}`,...(preview?['--preview=yes']:[]),...(compact?['--compact=yes']:[]),...(pauseAfter?['--pause-after='+pauseAfter]:[])],{cwd:ROOT,windowsHide:true,env:{...process.env,OMP_NUM_THREADS:'2',OPENBLAS_NUM_THREADS:'2',MKL_NUM_THREADS:'2',NUMEXPR_NUM_THREADS:'2',PYTHONDONTWRITEBYTECODE:'1'},stdio:['ignore',file,file]});if(result.error)throw result.error;if(result.status===75)return'paused';if(result.status!==0)throw Error(`${script} failed for ${id}; see ${log}`);return'completed';}finally{fs.closeSync(file);}
}
export function runSources(runPath,ids,preview=false,compact=false,pauseAfter){
 const run=loadRun(runPath),rows=ids==='all'?selectedRows(run,'all'):ids.split(',').map(id=>selectedRows(run,id)[0]);
 if(new Set(rows.map(r=>r.sourceTreeId)).size!==rows.length)throw Error('Duplicate requested source');
 recordProgress(run);
 if(pauseAfter&&!rows.some(row=>row.sourceTreeId===pauseAfter))throw Error('Pause boundary is outside requested sources');
 const pending=rows.filter(row=>!verifiedCompletion(run,row.sourceTreeId)&&!run.recipe.acceptedSources?.[row.sourceTreeId]);
 let status=fs.existsSync(path.join(ROOT,run.cache,'pause.request'))?'paused':pending.length?blender(run,runPath,pending.map(row=>row.sourceTreeId).join(','),'batch_native.py',preview,compact,pauseAfter):'completed';
 const complete=rows.filter(row=>verifiedCompletion(run,row.sourceTreeId)||run.recipe.acceptedSources?.[row.sourceTreeId]).map(row=>row.sourceTreeId);
 if(complete.length<rows.length&&fs.existsSync(path.join(ROOT,run.cache,'pause.request')))status='paused';
 if(status==='completed'&&complete.length!==rows.length)throw Error('Producer returned without completing all requested sources');
 const report={runId:run.id,requestedSourceTreeIds:rows.map(r=>r.sourceTreeId),completedSourceTreeIds:complete,status};
 writeJson(run.cache+'/last-batch-'+rows.map(r=>r.sourceTreeId).join('_').slice(0,80)+'-'+status+'-'+complete.length+'.json',report);console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const a=parseArgs('--produce');if(!a.run||!a.ids)throw Error('Require --run and --ids; explicit reserved heavy window required');runSources(a.run,a.ids,a.preview==='yes',a.compact==='yes',a['pause-after']);}
