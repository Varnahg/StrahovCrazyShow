import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,realpathSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=import.meta.dirname,repo=resolve(root,'../..'),out=join(root,'define-order-native-v1'),qa=join(root,'define-order-v6'),leaf=join(repo,'.cache/webgpu-migration-checks/define-order-native-20261018');
const hash=b=>createHash('sha256').update(b).digest('hex'),git=(...args)=>execFileSync('git',args,{cwd:repo,maxBuffer:24*1024*1024}).toString();
const recordBytes=readFileSync(join(leaf,'manifest.json'));assert.equal(hash(recordBytes),'a3b0d5fe839c5ecdc6fc116427191040008ebc3ebaf1bddf9abbe954503ca5d8');const record=JSON.parse(recordBytes);
assert.equal(record.task,'webgpu-define-order-native-20261018');assert.equal(record.changes.length,7);assert.equal(record.validation.failed,0);assert.equal(record.validation.skipped,0);assert.equal(record.validation.typescript.errors,0);
for(const row of record.changes)assert.equal(hash(readFileSync(join(repo,row.path))),row.sha256,'Native transfer drift '+row.path);
for(const [name,row]of Object.entries(record.artifacts)){const b=readFileSync(join(leaf,name));assert.equal(hash(b),row.sha256,'Evidence drift '+name);assert.equal(b.length,row.bytes);}
assert.equal(hash(readFileSync(record.handoff.path)),record.handoff.sha256);for(const [path,sha]of Object.entries(record.protectedFiles))if(sha!==null)assert.equal(hash(readFileSync(join(repo,path))),sha,'Protected native drift '+path);
assert.equal(hash(readFileSync(join(qa,'qa-provenance/leaf-manifest.json'))),record.dependencies.qaManifestSha256);assert.equal(hash(readFileSync(join(qa,'qa-provenance/dependency-manifest.json'))),record.dependencies.qaDependencyManifestSha256);
const trackedDirty=git('diff','--name-only').trim().split('\n').filter(Boolean).sort();assert.deepEqual(trackedDirty,['patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml'].sort());assert.equal(git('diff','--cached','--name-only').trim(),'');
const added=record.changes.filter(r=>r.originalSha256===null).map(r=>r.path);for(const p of git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean))if(/^(client|server|shared|tests|scripts)\//.test(p))assert.ok(added.includes(p),'Unrelated native WIP '+p);
const sourceHead=git('rev-parse','HEAD').trim(),paths=[...new Set([...git('ls-files','-z').split('\0').filter(p=>p&&!['assets','public','docs'].some(top=>p.startsWith(top+'/'))),...added])];
assert.ok(!existsSync(out),'Preserve snapshot');mkdirSync(out);const files={};function write(path,b){assert.ok(!path.split('/').includes('..'));mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),b,{flag:'wx'});files[path]=hash(b);}
for(const path of paths)write(path,readFileSync(join(repo,path)));for(const row of record.changes)assert.equal(files[row.path],row.sha256);
for(const top of ['assets','public','docs'])symlinkSync(realpathSync(join(repo,top)),join(out,top),'junction');
for(const name of ['dependency-input.json','dependency-output.json','leaf-manifest.json','patch-record.json','dependency-manifest.json','test-assets.json','validation-integrity.json'])write('qa-provenance/'+name,readFileSync(join(qa,'qa-provenance',name)));
write('qa-provenance/native-transfer.json',recordBytes);
const modules=join(out,'node_modules'),from=join(qa,'node_modules');mkdirSync(modules);function link(name){const target=join(modules,name);mkdirSync(dirname(target),{recursive:true});symlinkSync(realpathSync(join(from,name)),target,'junction');}
for(const e of readdirSync(from,{withFileTypes:true})){if(e.name.startsWith('.'))continue;if(e.name.startsWith('@'))for(const c of readdirSync(join(from,e.name)))link(e.name+'/'+c);else link(e.name);}
mkdirSync(join(modules,'.bin'));for(const name of ['tsc','vite','tsx'])writeFileSync(join(modules,'.bin',name+'.cmd'),readFileSync(join(from,'.bin',name+'.cmd')));
assert.equal(hash(readFileSync(join(modules,'@babylonjs/core/Materials/materialDefines.js'))),record.dependencies.materialDefinesSha256);
const composition={kind:'native-define-order-only',sourceHead,leafSha256:hash(recordBytes),changes:record.changes,dependencyRuntimeChanges:['core/Materials/materialDefines.js'],scope:'Native working tree with exactly the literal serializer patch/lock and regression fixtures, including bounded gzip baseline. Does not include QA B6/day/camera/inventory coverage stages. No default renderer change. Native full validation and WebGPU/WebGL smoke pending.'};write('source-composition.json',Buffer.from(JSON.stringify(composition,null,2)+'\n'));
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceHead,createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');assert.equal(git('rev-parse','HEAD').trim(),sourceHead);console.log(JSON.stringify({out,snapshotId,sourceHead,files:Object.keys(files).length,changes:record.changes.map(r=>r.path)}));
