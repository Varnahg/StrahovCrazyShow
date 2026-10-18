import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),order=['records','lines','indexed','indexed','records','lines','lines','indexed','records'],runs=[];
for(let i=0;i<order.length;i++){
  const variant=order[i],run=String(i+1).padStart(2,'0'),report=`warm-${run}-${variant}.json`,receipt=`warm-${run}-${variant}-source.json`,startedAt=new Date().toISOString();
  const args=['--import','../node_modules/tsx/dist/loader.mjs','--import','../variant-loader.mjs','--test','--test-concurrency=1','--test-timeout=30000','warm.test.ts'];
  const child=spawnSync(process.execPath,args,{cwd:resolve(root,'baseline'),encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024,env:{...process.env,TSX_DISABLE_CACHE:'1',SERIALIZER_VARIANT:variant,SERIALIZER_RECEIPT:receipt,WARM_REPORT:'../'+report}});
  const log=`warm-${run}-${variant}.log`;fs.writeFileSync(resolve(root,log),child.stdout+child.stderr,{flag:'wx'});
  runs.push({run,variant,startedAt,finishedAt:new Date().toISOString(),status:child.status,error:child.error?.message??null,args,report,receipt,log});
  fs.writeFileSync(resolve(root,'warm-runs.json'),JSON.stringify({order,runs},null,2)+'\n');console.log(JSON.stringify(runs.at(-1)));
  if(child.status!==0){process.exitCode=1;break;}
}
