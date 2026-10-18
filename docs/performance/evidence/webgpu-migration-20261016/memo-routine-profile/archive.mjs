import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=import.meta.dirname,out=join(root,'../../docs/performance/evidence/webgpu-migration-20261016/memo-routine-profile'),hash=b=>createHash('sha256').update(b).digest('hex'),files={};
function put(p,b){const zip=b.length>50000&&!p.endsWith('.jpg');const path=p+(zip?'.gz':''),payload=zip?gzipSync(b,{level:9}):b;mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),payload);assert.deepEqual(zip?gunzipSync(payload):payload,b);files[path]={sha256:hash(payload),originalSha256:hash(b),originalBytes:b.length,encoding:zip?'gzip':'identity'};}
function copy(p,target=p){put(target,readFileSync(join(root,p)));}
for(const p of ['assemble.mjs','validate.mjs','analyze.mjs','prepare-analysis.mjs','assembly.json','targeted.log','types.log','build.log','validation.json','dist-manifest.json','preview.mjs','start.ps1','stop.ps1','protected.mjs','protected-before.json','protected-after.json','weather.json','archive.mjs'])copy(p);
for(const p of readdirSync(join(root,'run-01'))){if(p==='runtime.json'||p==='all-sessions')continue;copy('run-01/'+p);}
for(const p of readdirSync(join(root,'run-01/all-sessions')))copy('run-01/all-sessions/'+p);
for(const p of ['client/game.ts','client/qa-routine-profile.ts','tests/game-light-switch-profile.test.ts','tests/qa-routine-profile.test.ts','source-manifest.json','qa-provenance/memo-routine/patches.json'])copy('candidate-v1/'+p,'source/'+p);
const {processes,...runtime}=JSON.parse(readFileSync(join(root,'run-01/runtime.json')));put('run-01/runtime-provenance.json',Buffer.from(JSON.stringify({...runtime,scope:'Operational process identities omitted.'},null,2)+'\n'));
const summary=JSON.parse(readFileSync(join(root,'run-01/summary.json')));writeFileSync(join(out,'artifact-manifest.json'),JSON.stringify({source:summary.source,base:'0ac5b4db9e77fe178f08ab3dd40cfb20f4af7724d61270eb9d5ffd9df2056e06',session:summary.session,records:summary.records,files},null,2)+'\n');console.log(JSON.stringify({files:Object.keys(files).length,source:summary.source}));
