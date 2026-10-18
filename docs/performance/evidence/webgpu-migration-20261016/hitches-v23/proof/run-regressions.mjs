import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),runs=[];
for(const variant of ['records','lines','indexed','types']){
  const args=variant==='types'?['types.mjs']:['--import','../node_modules/tsx/dist/loader.mjs','--import','../variant-loader.mjs','--test','--test-concurrency=1','--test-timeout=60000','tests/material-defines-serialization.test.ts','tests/material-defines-wgsl-order.test.ts'];
  const startedAt=new Date().toISOString(),child=spawnSync(process.execPath,args,{cwd:variant==='types'?root:resolve(root,'baseline'),encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024,env:{...process.env,TSX_DISABLE_CACHE:'1',SERIALIZER_VARIANT:variant,SERIALIZER_RECEIPT:`regression-${variant}-source.json`,DEFINE_ORDER_REPORT:resolve(root,`regression-${variant}-report.json`)}});
  const log=`regression-${variant}.log`;fs.writeFileSync(resolve(root,log),child.stdout+child.stderr,{flag:'wx'});runs.push({variant,startedAt,finishedAt:new Date().toISOString(),status:child.status,error:child.error?.message??null,args,log});fs.writeFileSync(resolve(root,'regression-runs.json'),JSON.stringify({runs},null,2)+'\n');console.log(JSON.stringify(runs.at(-1)));if(child.status!==0){process.exitCode=1;break;}
}
