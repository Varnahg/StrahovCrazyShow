import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const root=path.dirname(fileURLToPath(import.meta.url)),wt=path.resolve(root,'../../..');
const read=n=>fs.readFileSync(path.resolve(root,n)),json=n=>JSON.parse(read(n)),hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
const input=json('input-manifest.json'),target=['client/game.ts','client/light-preparation.ts','client/webgpu-compilation-profile.ts','tests/game-light-preparation.test.ts','tests/light-preparation.test.ts','tests/webgpu-compilation-profile.test.ts'];
const changes=[],candidateFiles={},diffs=[];
assert.equal(fileHash(path.join(input.base,'source-manifest.json')),input.sourceManifestSha256);
for(const [file,entry]of Object.entries(input.sources)){
  const original=path.join(input.base,file),output=path.join(input.candidate,file);
  assert.equal(fileHash(original),entry.sha256,'immutable input '+file);
  const sha=fileHash(output);candidateFiles[file]=sha;
  if(sha!==entry.sha256){assert.ok(target.includes(file),'unexpected output '+file);changes.push({path:file,originalSha256:entry.sha256,sha256:sha,bytes:fs.statSync(output).size});
    const preimage=path.join(root,'preimages',file);fs.mkdirSync(path.dirname(preimage),{recursive:true});fs.writeFileSync(preimage,fs.readFileSync(original),{flag:'wx'});
    let text;try{text=execFileSync('git',['-c','core.autocrlf=false','diff','--no-index','--no-ext-diff','--',original,output],{encoding:'utf8'});}catch(e){if(e.status!==1)throw e;text=e.stdout;}
    const name=file.replaceAll('/','_')+'.diff';fs.writeFileSync(path.join(root,name),text,{flag:'wx'});diffs.push(text);
  }
}
assert.deepEqual(changes.map(x=>x.path).sort(),target.slice().sort());
fs.writeFileSync(path.join(root,'owned.diff'),diffs.join('\n'),{flag:'wx'});
const red=json('red-01-run.json'),green=json('green-01-run.json'),related=json('related-01-run.json'),types=json('types-01-run.json');
assert.deepEqual(red.tests,{total:74,passed:65,failed:9,skipped:0});assert.equal(red.exitCode,1);
assert.deepEqual(green.tests,{total:74,passed:74,failed:0,skipped:0});assert.equal(green.exitCode,0);
assert.deepEqual(related.tests,{total:80,passed:80,failed:0,skipped:0});assert.equal(related.exitCode,0);assert.equal(types.exitCode,0);
assert.doesNotMatch(read('red-01.log').toString(),/SyntaxError|ERR_MODULE_NOT_FOUND|ENOENT/);
for(const file of input.target){assert.equal(red.sources[file],green.sources[file]);assert.equal(green.sources[file],candidateFiles[file]);}
for(const run of[green,related,types])for(const[file,sha]of Object.entries(run.sources))assert.equal(fileHash(path.join(input.candidate,file)),sha,file);
for(const file of target.slice(0,3))assert.equal(red.sources[file],input.sources[file].sha256);
const sourceRecord={baseSnapshotId:input.baseSnapshotId,base:input.base,candidate:input.candidate,files:Object.fromEntries(Object.entries(input.sources).map(([file,entry])=>[file,{originalSha256:entry.sha256,sha256:candidateFiles[file],bytes:fs.statSync(path.join(input.candidate,file)).size}]))};
fs.writeFileSync(path.join(root,'source-manifest.json'),JSON.stringify(sourceRecord,null,2)+'\n',{flag:'wx'});
const qa=path.resolve(root,'../define-order-qa-20261018');assert.equal(fileHash(path.join(qa,'manifest.json')),input.qaManifestSha256);assert.equal(fileHash(path.join(qa,'dependency-manifest.json')),input.dependencyManifestSha256);
const require=createRequire(path.join(input.candidate,'package.json')),loader=createRequire(require.resolve('@babylonjs/loaders/package.json'));
const core=fs.realpathSync(require.resolve('@babylonjs/core/package.json')),loaderCore=fs.realpathSync(loader.resolve('@babylonjs/core/package.json'));assert.equal(core,loaderCore);
const dependencySamples={};const dependencyManifest=JSON.parse(fs.readFileSync(path.join(qa,'dependency-manifest.json')));
for(const file of['core/Materials/materialDefines.js','core/Materials/materialHelper.functions.js','core/Engines/WebGPU/webgpuShaderProcessorsWGSL.js','core/package.json','loaders/package.json','loaders/glTF/2.0/glTFLoader.js']){const sha=fileHash(path.join(input.dependencies,'@babylonjs',file));assert.equal(sha,dependencyManifest.output[file]);dependencySamples[file]=sha;}
const evidenceReferences={};for(const name of['native-day13-preflight-comparison.json','native-smoke-timeline-audit.json','define-native-webgpu-smoke-1-summary.json','async-define-order-v6-normal-b6-1-summary.json']){const p=path.join(wt,'.cache/webgpu-hitch-validation-20261017',name);evidenceReferences[name]={path:p,sha256:fileHash(p)};}
const handoff=path.join(wt,'docs/agents/handoffs/webgpu-native-day-coverage-qa-20261018.md');
const artifacts={};for(const name of fs.readdirSync(root).sort()){const p=path.join(root,name);if(!fs.statSync(p).isFile()||['manifest.json','overlay-record.json','freeze-receipt.json'].includes(name))continue;const b=fs.readFileSync(p);artifacts[name]={sha256:hash(b),bytes:b.length};}
const manifest={schemaVersion:1,task:'webgpu-native-day-coverage-qa-20261018',frozenAt:new Date().toISOString(),baseSnapshotId:input.baseSnapshotId,base:input.base,candidate:input.candidate,scope:'Exactly six copied native day-coverage/configuration/test files; no C5/B6/camera/default/dependency changes',changes,candidateFiles,inputFiles:input.sources,dependencies:{root:input.dependencies,qaManifestSha256:input.qaManifestSha256,manifestSha256:input.dependencyManifestSha256,identity:{core,loaderCore},samples:dependencySamples,readonly:true,fullSweep:false},evidenceReferences,artifacts,handoff:{path:handoff,sha256:fileHash(handoff)},validation:{red:red.tests,green:green.tests,related:related.tests,typescript:{files:3361,errors:0},sameRedGreenTestBytes:true,fullSuite:false,build:false,gpu:false},limitations:['Native 13-stage startup/GPU acceptance pending; QA stage costs are not a native prediction','No B6 pair or synthetic view, no C5 preload/persistent editor/postprocess retention','Existing controlled IO test fixtures verify wiring/ownership, not GPU execution or image','Remaining startup/F/B6/steady FPS/full migration acceptance open']};
const bytes=Buffer.from(JSON.stringify(manifest,null,2)+'\n');fs.writeFileSync(path.join(root,'manifest.json'),bytes,{flag:'wx'});fs.writeFileSync(path.join(root,'overlay-record.json'),bytes,{flag:'wx'});
console.log(JSON.stringify({manifestSha256:hash(bytes),changes:changes.length,inputs:Object.keys(candidateFiles).length,handoffSha256:manifest.handoff.sha256,validation:manifest.validation}));
