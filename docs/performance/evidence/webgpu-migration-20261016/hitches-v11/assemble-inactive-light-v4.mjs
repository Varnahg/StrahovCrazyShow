import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,symlinkSync,realpathSync,existsSync,lstatSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=join(root,'day-zero-v3'),out=join(root,'inactive-light-v4'),leaf=resolve(root,'../webgpu-migration-checks/inactive-light-defines-qa-20261018');
const [recordName,recordSha]=process.argv.slice(2),hash=b=>createHash('sha256').update(b).digest('hex');
assert.match(recordName??'',/^[a-z0-9-]+\.json$/);assert.match(recordSha??'',/^[a-f0-9]{64}$/);
const recordBytes=readFileSync(join(leaf,recordName));assert.equal(hash(recordBytes),recordSha);
const record=JSON.parse(recordBytes),normalize=p=>resolve(p).replaceAll('\\','/');
assert.equal(record.schemaVersion,1);assert.equal(record.task,'webgpu-inactive-light-defines-qa-20261018');assert.equal(normalize(record.candidate),normalize(join(leaf,'candidate')));
function artifact(name){const bytes=readFileSync(join(leaf,name));assert.equal(hash(bytes),record.artifacts[name],'Leaf artifact changed after freeze '+name);return bytes;}
const inputBytes=artifact('input-manifest.json'),patchBytes=artifact('patch-record.json');
const inputs=JSON.parse(inputBytes),patch=JSON.parse(patchBytes),manifest=JSON.parse(readFileSync(join(base,'source-manifest.json')));
assert.equal(manifest.snapshotId,'0e15522126720f08e892de60685df25f5d20c313c562c952151de7d94d9f964a');assert.equal(hash(JSON.stringify(manifest.files)),manifest.snapshotId);
assert.equal(record.baseSnapshotId,manifest.snapshotId);assert.deepEqual(record.patch,patch);
assert.deepEqual(record.dependencies.changedFiles.map(r=>r.path),['core/Materials/materialHelper.functions.js']);
assert.deepEqual(Object.keys(record.dependencies.files).sort(),Object.keys(inputs.inputs).sort());
assert.equal(record.validation.green.fail,0);assert.equal(record.validation.related.fail,0);assert.equal(record.validation.scopedTypes.errors,0);assert.equal(record.validation.patchApplicability.passed,true);
for(const v of [record.validation.green,record.validation.related,record.validation.scopedTypes])artifact(v.log);artifact(record.validation.patchApplicability.artifact);
for(const [path,row]of Object.entries(record.sources)){const bytes=readFileSync(join(leaf,'candidate',path));assert.equal(hash(bytes),row.sha256,'Leaf source changed after freeze '+path);assert.equal(bytes.length,row.bytes);assert.equal(row.inputSha256,inputs.copied[path]??null);}
const modules=join(leaf,'dependencies/node_modules'),helperKey='core/Materials/materialHelper.functions.js',dependencies={};
assert.equal(normalize(record.dependencies.root),normalize(modules));
assert.equal(normalize(record.identity.core),normalize(realpathSync(join(modules,'@babylonjs/core/package.json'))));assert.equal(record.identity.core,record.identity.loaderCore);
for(const [key,expected]of Object.entries(inputs.inputs)){
 const at=key.indexOf('/'),name=key.slice(0,at),path=key.slice(at+1),original=join(inputs.packageRoots[name].from,path),copied=join(modules,'@babylonjs',name,path);
 assert.equal(hash(readFileSync(original)),expected,'Shared dependency drift '+key);
 const actual=hash(readFileSync(copied)),wanted=key===helperKey?patch.helperAfterSha:expected;assert.equal(actual,wanted,'Unexpected QA dependency '+key);assert.deepEqual(record.dependencies.files[key],{inputSha256:expected,sha256:actual},'Leaf dependency changed after freeze '+key);
 assert.notEqual(realpathSync(original),realpathSync(copied));assert.equal(statSync(copied).nlink,1);dependencies[key]=actual;
}
const changed=['patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml'],added=['tests/inactive-light-defines-helper.test.ts','tests/inactive-light-defines-history.test.ts'];
assert.deepEqual(record.changedFiles.map(r=>r.path).sort(),[...changed,...added].sort());
for(const [path,expected]of Object.entries(inputs.copied)){assert.equal(manifest.files[path],expected);if(!changed.includes(path))assert.equal(hash(readFileSync(join(leaf,'candidate',path))),expected,'Unexpected source overlay '+path);}
assert.equal(hash(readFileSync(join(leaf,'candidate',changed[0]))),patch.newPatchSha);assert.equal(hash(readFileSync(join(leaf,'candidate',changed[1]))),patch.lockAfterSha);
assert.ok(!existsSync(out),'Preserve prior snapshot');mkdirSync(out);
const files={...manifest.files};let copied=0;
for(const top of ['assets','public','docs'])symlinkSync(realpathSync(join(base,top)),join(out,top),'junction');
function write(path,bytes){const sha=hash(bytes);if(record.sources[path])assert.equal(sha,record.sources[path].sha256,'Copied source diverged from freeze '+path);mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),bytes,{flag:'wx'});files[path]=sha;}
for(const [path,expected]of Object.entries(manifest.files)){
 if(['assets','public','docs'].some(top=>path.startsWith(top+'/'))||path==='source-composition.json')continue;
 const original=readFileSync(join(base,path));assert.equal(hash(original),expected,'Frozen base drift '+path);
 write(path,changed.includes(path)?readFileSync(join(leaf,'candidate',path)):original);copied++;
}
for(const path of added){assert.ok(!manifest.files[path]);write(path,readFileSync(join(leaf,'candidate',path)));}
// Tool outputs have a physical root owned by this snapshot. All package targets
// are frozen read-only; core/loaders resolve to the same physical QA copies.
const ownModules=join(out,'node_modules');mkdirSync(ownModules);
function link(name){const target=join(ownModules,name);mkdirSync(dirname(target),{recursive:true});symlinkSync(realpathSync(join(modules,name)),target,'junction');}
for(const entry of readdirSync(modules,{withFileTypes:true})){
 if(entry.name.startsWith('.'))continue;
 if(entry.name.startsWith('@'))for(const child of readdirSync(join(modules,entry.name)))link(entry.name+'/'+child);
 else link(entry.name);
}
mkdirSync(join(ownModules,'.bin'));const shimHashes={};
for(const [name,path]of [['tsc','typescript\\bin\\tsc'],['vite','vite\\bin\\vite.js'],['tsx','tsx\\dist\\cli.mjs']]){
 const text='@echo off\r\nnode "%~dp0..\\'+path+'" %*\r\n';writeFileSync(join(ownModules,'.bin',name+'.cmd'),text);shimHashes[name]=hash(text);
}
assert.equal(lstatSync(ownModules).isSymbolicLink(),false);
write('qa-provenance/dependency-input.json',inputBytes);
write('qa-provenance/leaf-manifest.json',recordBytes);write('qa-provenance/patch-record.json',patchBytes);
write('qa-provenance/dependency-output.json',Buffer.from(JSON.stringify({files:dependencies,sha256:hash(JSON.stringify(dependencies)),shimHashes},null,2)+'\n'));
const composition={kind:'unaccepted-inactive-light-vendor-qa',parentSnapshot:manifest.snapshotId,leafRecord:recordName,leafSha256:recordSha,changed,added,dependencyRuntimeChanges:[helperKey],scope:'Same V3 application with three inactive falloff resets in physically isolated pinned Babylon core/loaders. Prior vendor patch retained. No active/global lighting change, cache, callback or readiness/deadline relaxation. Full suite/integration and GPU acceptance pending.'};
write('source-composition.json',Buffer.from(JSON.stringify(composition,null,2)+'\n'));
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceCommit:'15f910258ddec0c2cb100fb4e41d54d2023e5877',createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
console.log(JSON.stringify({out,snapshotId,copied,changed,added,dependencyFiles:Object.keys(dependencies).length,dependencyRuntimeChanges:composition.dependencyRuntimeChanges}));
