import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
const root=import.meta.dirname,evidence=resolve(root,'../../docs/performance/evidence/client-threading-cpu-profile-20261019');
const hash=b=>createHash('sha256').update(b).digest('hex'),files={};
mkdirSync(evidence,{recursive:true});
function archive(from,to,gzip=true){const raw=readFileSync(from),bytes=gzip?gzipSync(raw,{level:6}):raw,target=join(evidence,to);mkdirSync(resolve(target,'..'),{recursive:true});writeFileSync(target,bytes);assert.equal(hash(gzip?gunzipSync(readFileSync(target)):readFileSync(target)),hash(raw));files[to]={sha256:hash(bytes),bytes:bytes.length,decodedSha256:hash(raw),decodedBytes:raw.length};}
const sessions=['3ec5d045-b15a-4666-a20f-d1c76c69539a','62205a6e-463f-445b-9f7c-c24edf9eb794'];
const used=new Set();
for(let n=1;n<=6;n++){
 const run='run-'+String(n).padStart(2,'0'),session=sessions[n<=3?0:1];
 writeFileSync(join(root,run,'session.jsonl'),readFileSync(join(root,'snapshot/.cache/game-diagnostics',session+'.jsonl')));
 const res=spawnSync(process.execPath,[join(root,'analyze.mjs'),run],{encoding:'utf8'});assert.equal(res.status,0,res.stderr);writeFileSync(join(root,run,'analysis-output.json'),res.stdout);
 const summary=JSON.parse(readFileSync(join(root,run,'cpu-summary.json')));for(const name of Object.keys(summary.bundleChecks))used.add(name);
 for(const name of readdirSync(join(root,run)).filter(n=>/\.json$|\.png$/.test(n)&&n!=='analysis-output.json'))archive(join(root,run,name),run+'/'+name+(name.endsWith('.png')?'':'.gz'),!name.endsWith('.png'));
 files[run+'/session-reference']={sessionId:session,archive:'sessions/'+session+'.jsonl.gz'};
}
for(const id of sessions)archive(join(root,'snapshot/.cache/game-diagnostics',id+'.jsonl'),'sessions/'+id+'.jsonl.gz');
for(const file of used)for(const suffix of ['','.map'])archive(join(root,'snapshot/dist',file+suffix),'served/'+file+suffix+'.gz');
for(const name of ['analyze.mjs','archive.mjs','prepare-base.mjs','integrate-helper.mjs','prepare-services.mjs','preview.mjs','check-inputs.mjs','verify.mjs','stop.ps1'])archive(join(root,name),'reproduction/'+name,false);
for(const name of ['build-identity.json','dist-manifest.json','integration.json','base-identity.json','inputs-verified.json','served-verified.json'])archive(join(root,name),'identity/'+name,false);
archive(join(root,'snapshot/source-manifest.json'),'identity/source-manifest.json',false);
for(const name of readdirSync(join(root,'logs')).filter(n=>/\.(log|json)$/.test(n)))archive(join(root,'logs',name),'validation/'+name+'.gz');
const helper=resolve(root,'../client-threading-cpu-helper-20261019');
for(const name of ['manifest.json','validation.json','assembly.json','targeted.log','scoped-types.log','provenance/game-edits.json','provenance/game.diff','client/qa-cpu-profile.ts','tests/qa-cpu-profile.test.ts','tests/game-cpu-profile.test.ts'])archive(join(helper,name),'helper/'+name+'.gz');
writeFileSync(join(evidence,'manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),source:JSON.parse(readFileSync(join(root,'build-identity.json'))).source,files},null,2)+'\n');
console.log(JSON.stringify({files:Object.keys(files).length,bytes:Object.values(files).reduce((n,f)=>n+(f.bytes??0),0),evidence}));
