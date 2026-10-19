import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=import.meta.dirname,cwd=join(root,'snapshot'),hash=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(join(cwd,'source-manifest.json')));assert.equal(hash(JSON.stringify(manifest.files)),manifest.snapshotId);
function verify(){for(const[p,sha]of Object.entries(manifest.files))assert.equal(hash(readFileSync(join(cwd,p))),sha,p);}
const phases=[['targeted',['--import','tsx','--test','tests/game-low-vehicle-preparation.test.ts','tests/game-light-preparation.test.ts','tests/game-quality-preparation.test.ts','tests/light-preparation.test.ts','tests/render-quality-preparation.test.ts','tests/authored-light-preparation.test.ts','tests/vehicle-lighting.test.ts','tests/game-authored-light-preparation.test.ts']],['types',['node_modules/typescript/bin/tsc','--noEmit']],['build',['node_modules/vite/bin/vite.js','build','--configLoader','native']]];
const results=[];verify();
for(const[phase,args]of phases){
 const log=join(root,'qa-'+phase+'.log');assert.ok(!existsSync(log),'preserve '+log);const start=new Date().toISOString();
 const r=spawnSync(process.execPath,args,{cwd,env:{...process.env,VITE_SOURCE_SNAPSHOT_ID:manifest.snapshotId,TSX_DISABLE_CACHE:'1'},encoding:'utf8',maxBuffer:64*1024*1024});writeFileSync(log,(r.stdout??'')+(r.stderr??''));
 const result={phase,exitCode:r.status,startedAt:start,endedAt:new Date().toISOString(),log,sha256:hash(readFileSync(log))};results.push(result);verify();writeFileSync(join(root,'qa-validation.json'),JSON.stringify({source:manifest.snapshotId,results},null,2)+'\n');console.log(JSON.stringify(result));if(r.status!==0){console.log((r.stdout??'').slice(-3000)+(r.stderr??'').slice(-1500));process.exit(r.status||1);}
}
function entries(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?entries(join(dir,e.name),prefix+e.name+'/'):/\.(js|map|html|css|wasm)$/.test(e.name)?[[prefix+e.name,hash(readFileSync(join(dir,e.name)))]]:[]);}
writeFileSync(join(root,'qa-dist-manifest.json'),JSON.stringify(Object.fromEntries(entries(join(cwd,'dist'))),null,2)+'\n');
