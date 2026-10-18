import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,lstatSync,statSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),candidate=resolve(root,'candidate'),input=JSON.parse(readFileSync(resolve(root,'input-manifest.json'))),patch=JSON.parse(readFileSync(resolve(root,'patch-record.json')));
const normalize=p=>p.replaceAll('\\','/'),hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const sources={};function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isSymbolicLink()?[]:e.isDirectory()?walk(resolve(dir,e.name)):e.isFile()?[resolve(dir,e.name)]:[])}
for(const path of walk(candidate)){const name=normalize(relative(candidate,path)),sha256=hash(path),inputSha256=input.copied[name]??null;sources[name]={inputSha256,sha256,bytes:statSync(path).size,changed:inputSha256!==sha256};}
const changedFiles=Object.entries(sources).filter(([,row])=>row.changed).map(([path,row])=>({path,...row}));
assert.deepEqual(changedFiles.map(r=>r.path).sort(),['patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml','tests/inactive-light-defines-helper.test.ts','tests/inactive-light-defines-history.test.ts'].sort());
const files={},dependencyChanges=[];for(const[key,inputSha256]of Object.entries(input.inputs)){
 const slash=key.indexOf('/'),pkg=key.slice(0,slash),path=key.slice(slash+1),before=resolve(input.packageRoots[pkg].from,path),after=resolve(input.packageRoots[pkg].to,path);
 assert.equal(hash(before),inputSha256,'V5 changed '+key);assert.equal(lstatSync(after).isSymbolicLink(),false);assert.equal(statSync(after).nlink,1);assert.ok(realpathSync(after).startsWith(root));
 const sha256=hash(after);files[key]={inputSha256,sha256};if(sha256!==inputSha256)dependencyChanges.push({path:key,inputSha256,sha256});
}
assert.deepEqual(dependencyChanges.map(r=>r.path),['core/Materials/materialHelper.functions.js']);assert.equal(dependencyChanges[0].sha256,patch.helperAfterSha);
assert.equal(hash(resolve(candidate,'patches/@babylonjs__core@9.30.0.patch')),patch.newPatchSha);
const request=createRequire(resolve(candidate,'package.json')),loader=createRequire(request.resolve('@babylonjs/loaders/package.json'));
const identity={core:normalize(realpathSync(request.resolve('@babylonjs/core/package.json'))),loaders:normalize(realpathSync(request.resolve('@babylonjs/loaders/package.json'))),loaderCore:normalize(realpathSync(loader.resolve('@babylonjs/core/package.json')))};assert.equal(identity.core,identity.loaderCore);assert.ok(identity.core.startsWith(normalize(root)));assert.ok(identity.loaders.startsWith(normalize(root)));
const applicability=JSON.parse(readFileSync(resolve(root,'patch-applicability.json')));assert.equal(applicability.passed,true);
const handoff=resolve(wt,'docs/agents/handoffs/webgpu-inactive-light-defines-qa-20261018.md');
const artifacts=Object.fromEntries(readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile()&&!['manifest.json','freeze-output.json'].includes(e.name)).map(e=>[e.name,hash(resolve(root,e.name))]));
const result={schemaVersion:1,frozenAt:new Date().toISOString(),task:'webgpu-inactive-light-defines-qa-20261018',baseSnapshotId:input.sourceSnapshotId,candidate:normalize(candidate),sources,changedFiles,dependencies:{root:normalize(resolve(root,'dependencies/node_modules')),roots:input.packageRoots,files,changedFiles:dependencyChanges,originalV5Verified:true,physicalCopies:true,readonlyLinks:input.links},identity,patch,validation:{cleanRed:{tests:16,pass:1,fail:15,log:'targeted-red-final.log'},green:{tests:16,pass:16,fail:0,log:'targeted-green.log'},related:{tests:77,pass:77,fail:0,log:'related-regressions.log'},scopedTypes:{files:3134,errors:0,log:'scoped-types.log'},patchApplicability:{passed:true,files:6,artifact:'patch-applicability.json'},gpu:false,fullSuite:false,build:false},artifacts,handoff:{path:normalize(handoff),sha256:hash(handoff)},limitations:['Representative materials; attribution of all31production Day programs remains unproved','NullEngine GLSL/CPU only; actual WGSL/GPU/image/startup acceptance belongs to root pilot','Frozen readiness/unfreeze tested; pre-existing stale frozen draw hang documented separately','No fallback-string or explicit Node light-path canonicalization promise']};
writeFileSync(resolve(root,'manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({manifestSha:hash(resolve(root,'manifest.json')),sources:Object.keys(sources).length,changedFiles,dependencyFiles:Object.keys(files).length,dependencyChanges,identity,handoffSha:result.handoff.sha256},null,2));
