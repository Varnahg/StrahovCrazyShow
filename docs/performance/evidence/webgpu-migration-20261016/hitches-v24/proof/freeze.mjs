import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..');
const read=p=>fs.readFileSync(p),sha=b=>createHash('sha256').update(b).digest('hex');
const json=p=>JSON.parse(read(resolve(root,p))),input=json('input-v2.json');
const write=(p,value)=>{const target=resolve(root,p);fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,value,{flag:'wx'});};
const serialize=value=>JSON.stringify(value,null,2)+'\n';
const checks=[];
function exact(path,expected,label=path){const actual=sha(read(path));assert.equal(actual,expected,label);checks.push({path,sha256:actual,label});}
exact(input.physical,input.originalSha,'original physical dependency remains byte-identical');
exact(resolve(root,'../define-serializer-qa-20261018/manifest.json'),input.pureManifestSha);
exact(resolve(root,'../material-switch-cost-proof-20261018/manifest-v2.json'),input.warmManifestSha);
exact(resolve(root,'../../webgpu-hitch-validation-20261017/mixed-define-fixture-corpus.json'),input.mixedInventorySha);
const adaptations=json('fixture-adaptations.json');
for(const [path,expected]of Object.entries(input.sourceFiles)){
 exact(resolve(root,'../define-serializer-qa-20261018/baseline',path),expected,'frozen input: '+path);
 const adaptation=adaptations.find(x=>x.path===path),copied=resolve(root,'fixture',path);
 exact(copied,adaptation?.loadedSha??expected,'copied source: '+path);
 if(adaptation){const text=read(copied).toString();assert.ok(text.startsWith(adaptation.adaptation+'\n'));assert.equal(sha(text.slice(adaptation.adaptation.length+1)),expected,'only side-effect import added: '+path);}
}
for(const [mode,expected]of Object.entries(input.modules))exact(resolve(root,input.moduleDirectory,mode+'.mjs'),expected);
for(const receipt of ['capture-v2-runs.json','regression-v2-runs.json','timed-runs.json'])for(const run of json(receipt).runs){
 assert.equal(run.status,0,run.label);exact(resolve(root,run.log),run.logSha,run.label+' raw log');
 for(const [path,expected]of Object.entries(run.sources))exact(resolve(root,path),expected,run.label+' measured source '+path);
}
// V1 source recovery is allowed only when it exactly matches the contemporaneous receipt.
const old=json('capture-runs.json').runs[0].sources;
const recovered={
 'loader.mjs':read(resolve(root,'loader.mjs')).toString().replace('input-v2.json','input-manifest.json').replace("resolve(root,input.moduleDirectory,mode+'.mjs')","resolve(root,'modules',mode+'.mjs')"),
 'scope-hooks.mjs':read(resolve(root,'scope-hooks.mjs')).toString().replace("import {beginOwner as __beginOwner,endOwner as __endOwner,ownerActive as __ownerActive} from './owner-control.mjs';","import {__beginOwner,__endOwner,__ownerActive} from '@babylonjs/core/Materials/materialDefines';"),
 'micro.mjs':read(resolve(root,'micro.mjs')).toString().replace("import{beginOwner,endOwner}from'./owner-control.mjs';\n",'').replace("'./modules-v2/'","'./modules/'").replaceAll('beginOwner()','Module.__beginOwner()').replaceAll('endOwner(owner)','Module.__endOwner(owner)')
};
const recoveredFiles=[];
for(const [path,text]of Object.entries(recovered)){
 assert.equal(sha(text),old[path],'V1 reconstructed source must match original receipt: '+path);
 const recoveryPath=resolve(root,'review-v1/'+path);if(fs.existsSync(recoveryPath))assert.equal(sha(read(recoveryPath)),sha(text));else write('review-v1/'+path,text);recoveredFiles.push({path:'review-v1/'+path,sha256:sha(text),verification:'Exact original capture/regression receipt SHA, no V1 rerun'});
}
for(const receipt of ['capture-runs.json','regression-runs.json'])for(const run of json(receipt).runs){
 exact(resolve(root,run.log),run.logSha,'preserved V1 log');
 for(const [path,expected]of Object.entries(run.sources))exact(resolve(root,recovered[path]?'review-v1/'+path:path),expected,'preserved V1 source '+path);
}
const evidenceFiles=['Materials/materialDefines.js','Materials/materialHelper.functions.js','Materials/PBR/pbrBaseMaterial.pure.js','Materials/standardMaterial.pure.js','Engines/webgpuEngine.pure.js'];
const primarySources=evidenceFiles.map(path=>{const full=resolve(input.dependencies,'@babylonjs/core',path);return{path:full,bytes:fs.statSync(full).size,sha256:sha(read(full))};});
write('validation-integrity.json',serialize({createdAt:new Date().toISOString(),scope:'Read/hash only; no tests, compilation, dependency write, GPU, or full dependency tree sweep',checks,primarySources,recoveredFiles,dependencyIdentity:input.physical,allChecksExact:true}));
const files=[];
function walk(directory){for(const ent of fs.readdirSync(directory,{withFileTypes:true})){if(ent.isSymbolicLink())continue;const p=resolve(directory,ent.name);if(ent.isDirectory())walk(p);else if(ent.isFile()&&ent.name!=='manifest.json'){const bytes=read(p);files.push({path:relative(root,p).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}}
walk(root);files.sort((a,b)=>a.path.localeCompare(b.path));
const handoff=resolve(wt,'docs/agents/handoffs/webgpu-define-memo-proof-20261018.md'),h=read(handoff);
const manifest={schemaVersion:1,task:'webgpu-define-memo-proof-20261018',owner:'webgpu-define-memo-proof-01a14497',createdAt:new Date().toISOString(),worktree:wt,branch:'codex/webgpu-migration',baseCommit:'17bc0c2',scope:'Isolated CPU proof only; no shipping cache, native/runtime/dependency mutation, or GPU proof',sourceManifest:input,validation:{functional:'10/10',nativeRegression:{reference:'18/18',memo:'18/18'},warmFreshProcesses:'6 x 5/5',microFreshProcesses:'6 x exit 0',crossVariantSnapshots:'54/54 exact',scopedTypeScript:{files:3172,errors:0,log:'types-01.log',completionAt:fs.statSync(resolve(root,'types-01.log')).mtime.toISOString(),startAt:null},negativeEvidence:['regression-reference-class.log: V1 fixture namespace 5 PASS/1 FAIL, assertion retained and V2 fixed','analysis-01.log: initial analysis script syntax error; raw results unchanged','cap-plus-churn: 0 hits and approximately 7.74 percent slower full serializer','unique misses/unknown helper overhead; details in report.md'],processes:'All own child processes finished; parent notified CPU window released before this metadata freeze'},junctions:[{path:'node_modules',target:fs.realpathSync(resolve(root,'node_modules'))},{path:'fixture/node_modules',target:fs.realpathSync(resolve(root,'fixture/node_modules'))}],handoff:{path:relative(wt,handoff).replaceAll('\\','/'),bytes:h.length,sha256:sha(h)},files};
write('manifest.json',serialize(manifest));
console.log(serialize({files:files.length,manifestSha256:sha(read(resolve(root,'manifest.json'))),handoffSha256:sha(h),checks:checks.length}));
