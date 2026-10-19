import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname, snapshot=join(root,'snapshot'), hash=b=>createHash('sha256').update(b).digest('hex');
const m=JSON.parse(readFileSync(join(snapshot,'source-manifest.json')));
for(const name of ['full-types','build-hidden']){const r=JSON.parse(readFileSync(join(root,'logs',name+'.result.json')));assert.equal(r.exitCode,0);assert.equal(r.source,m.snapshotId);}
for(const[p,sha]of Object.entries(m.files))assert.equal(hash(readFileSync(join(snapshot,p))),sha,p);
const deliveredCode={}, maps={};
function walk(folder,prefix=''){for(const e of readdirSync(folder,{withFileTypes:true})){const p=prefix?prefix+'/'+e.name:e.name;if(e.isDirectory())walk(join(folder,e.name),p);else if(/\.(js|css|html|map)$/.test(p)){const s=hash(readFileSync(join(folder,e.name)));deliveredCode[p]=s;if(p.endsWith('.map'))maps[p]=s;}}}
walk(join(snapshot,'dist'));assert(Object.keys(maps).length>0,'Fresh matching source maps required');
const template=resolve(root,'../client-threading-validation-20261019');
for(const name of ['start.ps1','stop.ps1','verify.mjs']){
 let code=readFileSync(join(template,name),'utf8').replaceAll('client-threading-validation-20261019','client-threading-cpu-profile-20261019').replaceAll('threading-01a15535-validation','threading-01a15535-cpu-profile').replaceAll('4205','4206').replaceAll('2600','2601').replaceAll("$PSScriptRoot 'combined'","$PSScriptRoot 'snapshot'").replaceAll('4206/?renderBackend=webgpu','4206/?renderBackend=webgpu&profileEnvironment=1&profileCpu=1').replaceAll('služby character-material QA4206','služby CPU profile4206');
 if(name==='start.ps1') {const before='$health.ok -and $html.StatusCode -eq 200';assert.equal(code.split(before).length,2);code=code.replace(before,before+" -and $html.Headers['Document-Policy'] -eq 'js-profiling'");}
 writeFileSync(join(root,name),code);
}
writeFileSync(join(root,'build-identity.json'),JSON.stringify({source:m.snapshotId,snapshot,base:m.base,helper:m.helper,deliveredCode,url:'http://127.0.0.1:4206/?renderBackend=webgpu&profileEnvironment=1&profileCpu=1',apiPort:2601,scope:'Diagnostic-only actual production scene with current sources and owned bounded CPU sampler, source maps, existing environment profiler; no FPS comparison claim.'},null,2)+'\n');
writeFileSync(join(root,'dist-manifest.json'),JSON.stringify(deliveredCode,null,2)+'\n');
console.log(JSON.stringify({source:m.snapshotId,sourceFiles:Object.keys(m.files).length,delivered:Object.keys(deliveredCode).length,maps:Object.keys(maps).length}));
