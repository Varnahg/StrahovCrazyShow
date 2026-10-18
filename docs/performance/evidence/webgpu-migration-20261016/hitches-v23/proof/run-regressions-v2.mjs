import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),runs=[];
const jobs=['records','lines','indexed'].flatMap(variant=>['serialization','wgsl-order'].map(suffix=>({variant,name:`${variant}-${suffix}`,file:`tests/material-defines-${suffix}.test.ts`}))).concat([{variant:'types',name:'types'}]);
for(const job of jobs){
  const args=job.variant==='types'?['types.mjs']:['--import','../node_modules/tsx/dist/loader.mjs','--import','../variant-loader.mjs','--test','--test-concurrency=1','--test-timeout=60000',job.file];
  const startedAt=new Date().toISOString(),child=spawnSync(process.execPath,args,{cwd:job.variant==='types'?root:resolve(root,'baseline'),encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,env:{...process.env,TSX_DISABLE_CACHE:'1',SERIALIZER_VARIANT:job.variant,SERIALIZER_RECEIPT:`regression-v2-${job.name}-source.json`,DEFINE_ORDER_REPORT:resolve(root,`regression-v2-${job.name}-report.json`)}});
  const log=`regression-v2-${job.name}.log`;fs.writeFileSync(resolve(root,log),child.stdout+child.stderr,{flag:'wx'});runs.push({...job,startedAt,finishedAt:new Date().toISOString(),status:child.status,error:child.error?.message??null,args,log});fs.writeFileSync(resolve(root,'regression-v2-runs.json'),JSON.stringify({runs},null,2)+'\n');console.log(JSON.stringify(runs.at(-1)));if(child.status!==0){process.exitCode=1;break;}
}
