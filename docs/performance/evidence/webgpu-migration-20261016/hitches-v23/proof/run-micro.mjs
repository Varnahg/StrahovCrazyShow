import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),records=[];
const order=['records','lines','indexed','indexed','records','lines','lines','indexed','records'];
for(let i=0;i<order.length;i++){
  const variant=order[i],run=String(i+1).padStart(2,'0'),startedAt=new Date().toISOString();
  const child=spawnSync(process.execPath,['micro.mjs',variant,run],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  fs.writeFileSync(new URL(`micro-${run}-${variant}.log`,import.meta.url),child.stdout+child.stderr,{flag:'wx'});
  records.push({variant,run,startedAt,finishedAt:new Date().toISOString(),status:child.status,error:child.error?.message??null,sourceSha256:createHash('sha256').update(fs.readFileSync(new URL('micro.mjs',import.meta.url))).digest('hex')});
  fs.writeFileSync(new URL('micro-runs.json',import.meta.url),JSON.stringify({order,records},null,2)+'\n');console.log(JSON.stringify(records.at(-1)));
  if(child.status!==0){process.exitCode=1;break;}
}
