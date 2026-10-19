import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname, kind='combined';
const manifest=JSON.parse(readFileSync(join(root,'validation-manifest.json'))), snapshot=manifest.snapshots[kind];
const hash=b=>createHash('sha256').update(b).digest('hex');
for(const stage of ['test','build','integration']) assert.equal(JSON.parse(readFileSync(join(root,`logs/${kind}-${stage}.result.json`))).exitCode,0,stage);
const source=JSON.parse(readFileSync(join(snapshot.path,'source-manifest.json')));
for(const[p,sha]of Object.entries(source.files))assert.equal(hash(readFileSync(join(snapshot.path,p))),sha,p);
const deliveredCode={};const walk=(folder,prefix='')=>{for(const entry of readdirSync(folder,{withFileTypes:true})){const p=prefix?prefix+'/'+entry.name:entry.name;if(entry.isDirectory())walk(join(folder,entry.name),p);else if(/\.(js|css|html)$/.test(p))deliveredCode[p]=hash(readFileSync(join(folder,entry.name)));}};
walk(join(snapshot.path,'dist'));
const template='C:/Users/rezac/.codex/worktrees/29fa/StrahovCrazyShow/.cache/webgpu-medium-vehicle-user-build-20261019';
for(const name of ['start.ps1','stop.ps1','preview.mjs','verify.mjs']) {
 const code=readFileSync(join(template,name),'utf8').replaceAll('webgpu-medium-vehicle-user-build-20261019','client-threading-validation-20261019').replaceAll('webgpu-01a15102-medium-vehicle-user','threading-01a15535-validation').replaceAll('4203','4205').replaceAll('2598','2600').replaceAll("$PSScriptRoot 'snapshot'","$PSScriptRoot 'combined'").replaceAll('služby F3 user4205','služby character-material QA4205');
 writeFileSync(join(root,name),code);
}
writeFileSync(join(root,'build-identity.json'),JSON.stringify({source:snapshot.source,snapshot:snapshot.path,base:manifest.combinedBase,deliveredCode,url:'http://127.0.0.1:4205/?renderBackend=webgpu',apiPort:2600,scope:'Own plain production candidate, character-material initial setter batch only over frozen65d028; no detailed profiler, not FPS acceptance.'},null,2)+'\n');
console.log(JSON.stringify({source:snapshot.source,sourceFiles:Object.keys(source.files).length,codeFiles:Object.keys(deliveredCode).length}));
