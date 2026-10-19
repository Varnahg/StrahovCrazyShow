import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=import.meta.dirname,cwd=join(root,'candidate-v1'),attempt=process.argv[2]??'1',hash=b=>createHash('sha256').update(b).digest('hex');assert.match(attempt,/^\d+$/);
const manifest=JSON.parse(readFileSync(join(cwd,'source-manifest.json')));assert.equal(hash(JSON.stringify(manifest.files)),manifest.snapshotId);
function verify(){for(const[p,sha]of Object.entries(manifest.files))assert.equal(hash(readFileSync(join(cwd,p))),sha,p);}
const tests=['qa-receiver-lease','qa-receiver-lease-inputs','stable-light-state','vehicle-lighting','flashlight','gltf-light-budget','game-webgpu-startup','game-light-preparation','game-quality-preparation','game-light-lifecycle'].map(n=>'tests/'+n+'.test.ts');
for(const p of tests)assert.ok(existsSync(join(cwd,p)),p);
const phases=[['targeted',['--import','tsx','--test',...tests]],['types',['node_modules/typescript/bin/tsc','--noEmit']],['build',['node_modules/vite/bin/vite.js','build','--configLoader','native']]];
const results=[];verify();
for(const[phase,args]of phases){const log=join(root,phase+'-'+attempt+'.log');assert.ok(!existsSync(log),'Preserve '+log);const startedAt=new Date().toISOString();const r=spawnSync(process.execPath,args,{cwd,env:{...process.env,VITE_SOURCE_SNAPSHOT_ID:manifest.snapshotId,TSX_DISABLE_CACHE:'1'},encoding:'utf8',maxBuffer:64*1024*1024});writeFileSync(log,(r.stdout??'')+(r.stderr??''));const result={phase,exitCode:r.status,startedAt,endedAt:new Date().toISOString(),log,sha256:hash(readFileSync(log))};results.push(result);verify();writeFileSync(join(root,'validation-'+attempt+'.json'),JSON.stringify({source:manifest.snapshotId,results},null,2)+'\n');console.log(JSON.stringify(result));if(r.status!==0){console.log((r.stdout??'').slice(-4500)+(r.stderr??'').slice(-2000));process.exit(r.status||1);}}
function entries(dir,prefix=''){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?entries(join(dir,e.name),prefix+e.name+'/'):/\.(js|html|css|wasm)$/.test(e.name)?[[prefix+e.name,hash(readFileSync(join(dir,e.name)))]]:[]);}
writeFileSync(join(root,'dist-manifest-'+attempt+'.json'),JSON.stringify(Object.fromEntries(entries(join(cwd,'dist'))),null,2)+'\n');
