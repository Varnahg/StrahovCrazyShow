import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';import ts from 'typescript';
import {helperIdentity,transformUI} from '../helper/v20/common.mjs';
const area='.cache/webgpu-completion-20261021/entry-effect-cost',dir=area+'/helper/v20',e=area+'/pending-capture-v20',pub='docs/performance/evidence/webgpu-completion-20261021/entry-effect-cost/pending-capture-v20';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex'),hash=p=>sha(fs.readFileSync(p));
const before=JSON.parse(fs.readFileSync(e+'/before.json','utf8'));
for(const [f,h]of Object.entries(before.v19))if(hash(area+'/helper/v19/'+f)!==h)throw Error('Immutable V19 changed '+f);
const identity=await helperIdentity(path.resolve(dir));if(Object.keys(identity.files).length!==42)throw Error('Expected42inputs');
const syntax=[];for(const f of Object.keys(identity.files).filter(f=>f.endsWith('.mjs'))){const r=spawnSync(process.execPath,['--check',dir+'/'+f],{encoding:'utf8'});syntax.push({file:f,exitCode:r.status,stderr:r.stderr});if(r.status!==0)throw Error('Syntax '+f);}
const ui=ts.createSourceFile('qa-ui.tsx',transformUI(fs.readFileSync('client/ui.tsx','utf8')),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);if(ui.parseDiagnostics.length)throw Error('UI parse');
const protectedFiles=['client/game.ts','client/ui.tsx','client/render-health.ts','client/webgpu-compilation-profile.ts','package.json','pnpm-lock.yaml','node_modules/@babylonjs/core/Materials/effect.pure.js','node_modules/@babylonjs/core/Engines/webgpuEngine.pure.js'];
const snapshot='.cache/performance-snapshot/webgpu-completion-20261024-candidate-15';const protectedHashes={};for(const f of protectedFiles){protectedHashes[f]=hash(f);if(hash(snapshot+'/'+f)!==protectedHashes[f])throw Error('Protected differs from frozen source15 '+f);}
const changed=[],added=[],same=[];let diff='';
for(const f of Object.keys(identity.files).sort()){
 const old=area+'/helper/v19/'+f,next=dir+'/'+f;
 if(fs.existsSync(old)){if(hash(old)===hash(next)){same.push(f);continue;}changed.push(f);const r=spawnSync('git',['diff','--no-index','--',old,next],{encoding:'utf8',maxBuffer:8*1024*1024});if(r.status!==1||r.stderr)throw Error('Diff '+f+' '+r.stderr);diff+=r.stdout;}
 else{added.push(f);const text=fs.readFileSync(next,'utf8');const lines=text.replace(/\n$/,'').split('\n');diff+='diff --git a/'+next+' b/'+next+'\nnew file mode 100644\n--- /dev/null\n+++ b/'+next+'\n@@ -0,0 +1,'+lines.length+' @@\n'+lines.map(l=>'+'+l).join('\n')+'\n';}
}
fs.writeFileSync(e+'/changes.diff',diff);
fs.writeFileSync(e+'/syntax.json',JSON.stringify({syntax,uiParseDiagnostics:0,protectedHashes,source15Exact:true},null,2));
const history=fs.readdirSync(e).filter(f=>f.endsWith('.tap')).sort().map(file=>{const text=fs.readFileSync(e+'/'+file,'utf8');const get=k=>Number(text.match(new RegExp('^# '+k+' (\\d+)$','m'))?.[1]);return{file,sha256:hash(e+'/'+file),tests:get('tests'),pass:get('pass'),fail:get('fail'),cancelled:get('cancelled'),exitCode:get('fail')||get('cancelled')?1:0};});
const final=history.find(r=>r.file==='final-targeted.tap'),red=history.find(r=>r.file==='final-red-v19.tap');if(final.pass!==79||final.fail!==0||red.pass!==0||red.fail!==2)throw Error('Final proof counts');
const verification={schemaVersion:1,at:new Date().toISOString(),task:'webgpu-completion-entry-effect-cost-20261024',owner:'webgpu-completion-01a15a3e-entry-effect-v20',node:process.version,helper:identity,diff:{file:'changes.diff',sha256:hash(e+'/changes.diff'),bytes:Buffer.byteLength(diff)},changed,added,same,legacyByteExact:['routine-cost.mjs','routine-cost-core.mjs','entry-render-cost.mjs','entry-routine-cost.mjs'].every(f=>same.includes(f)),immutableV19:before.v19,protectedHashes,history,uniqueFinalTargetedPass:86,finalCommands:[
 'node --expose-gc --import tsx --test --test-reporter=tap '+dir+'/pending-capture.test.mjs '+dir+'/entry-effect-cost.test.mjs',
 'EFFECT_BASELINE=v19 node --expose-gc --import tsx --test --test-reporter=tap --test-name-pattern="new pending" '+dir+'/pending-capture.test.mjs',
 'node --import tsx --test --test-reporter=tap --test-name-pattern="actual overlay failure|explicit routine UI action|routine diagnostic defaultoff|clock overlay refuses Guest" '+dir+'/helper.test.mjs',
 'node --import tsx --test --test-reporter=tap --test-name-pattern="old8/three|actual new QA action|actual pinned original8 stays healthy" '+dir+'/entry-routine-cost.test.mjs'],
 gc:'6 PASS before first native draw: native/none/owner/waiter/engine/all. Initial full-draw native control retained Scene too; no whole native lifetime/VRAM claim. Constructor transaction retainer fixed by isolated method wrapper factory.',
 limitation:'Only targeted light CPU. No full corpus/build/server/GPU. Eight-frame diagnostic completion may coexist with pending; no renderer/FPS/async acceptance. Original V19 raw failing predicate was not captured.'};
fs.writeFileSync(e+'/verification.json',JSON.stringify(verification,null,2));
const source=pub+'/source';if(fs.existsSync(source))throw Error('Public source already sealed');fs.mkdirSync(source,{recursive:true});for(const f of Object.keys(identity.files))fs.copyFileSync(dir+'/'+f,source+'/'+f);
for(const f of fs.readdirSync(e).filter(f=>fs.statSync(e+'/'+f).isFile()&&!f.startsWith('manifest')))fs.copyFileSync(e+'/'+f,pub+'/'+f);
const files={};function walk(p,prefix=''){for(const f of fs.readdirSync(p).sort()){const full=p+'/'+f,key=prefix+f;if(fs.statSync(full).isDirectory())walk(full,key+'/');else files[key]={sha256:hash(full),bytes:fs.statSync(full).size};}}walk(pub);
const manifest={schemaVersion:1,at:new Date().toISOString(),helperSha256:identity.sha256,files,sha256:sha(JSON.stringify(files))};fs.writeFileSync(e+'/manifest.json',JSON.stringify(manifest,null,2));fs.writeFileSync(pub+'/manifest.json',JSON.stringify(manifest,null,2));
console.log(JSON.stringify({helper:identity.sha256,files:Object.keys(identity.files).length,changed,added,syntax:syntax.length,uiParseDiagnostics:0,diffSha256:verification.diff.sha256,diffBytes:verification.diff.bytes,payloadFiles:Object.keys(files).length,payloadSha256:manifest.sha256},null,2));
