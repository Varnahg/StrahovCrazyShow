import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,realpathSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=import.meta.dirname,repo=resolve(root,'../..'),out=join(root,'inactive-light-native-v1'),qa=join(root,'inactive-light-v4'),leaf=join(repo,'.cache/webgpu-migration-checks/inactive-light-defines-native-20261018');
const hash=b=>createHash('sha256').update(b).digest('hex'),git=(...args)=>execFileSync('git',args,{cwd:repo,maxBuffer:16*1024*1024}).toString();
const recordBytes=readFileSync(join(leaf,'manifest.json'));assert.equal(hash(recordBytes),'00ab7390cd1dceb631350d8c5afa0e3674462dcfbc0d1c88bbd2175d1c7d51b7');const record=JSON.parse(recordBytes);
assert.equal(hash(readFileSync(record.qaManifest.path)),record.qaManifest.sha256);
for(const [path,sha]of Object.entries(record.sources))assert.equal(hash(readFileSync(join(repo,path))),sha,'Native handoff drift '+path);
for(const [name,sha]of Object.entries(record.artifacts))assert.equal(hash(readFileSync(join(leaf,name))),sha,'Evidence drift '+name);
assert.equal(hash(readFileSync(record.handoff.path)),record.handoff.sha256);
const trackedDirty=git('diff','--name-only').trim().split('\n').filter(Boolean).sort();assert.deepEqual(trackedDirty,['patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml'].sort());assert.equal(git('diff','--cached','--name-only').trim(),'');
const added=record.changedFiles.filter(r=>r.inputSha256===null).map(r=>r.path);
for(const path of git('ls-files','--others','--exclude-standard','-z').split('\0').filter(Boolean))if(/^(client|server|shared|tests|scripts)\//.test(path))assert.ok(added.includes(path),'Unrelated runtime WIP '+path);
const sourceHead=git('rev-parse','HEAD').trim(),paths=[...new Set([...git('ls-files','-z').split('\0').filter(p=>p&&!['assets','public','docs'].some(top=>p.startsWith(top+'/'))),...added])];
assert.ok(!existsSync(out),'Preserve snapshot');mkdirSync(out);const files={};
function write(path,bytes){mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),bytes,{flag:'wx'});files[path]=hash(bytes);}
for(const path of paths){const bytes=readFileSync(join(repo,path));if(record.sources[path])assert.equal(hash(bytes),record.sources[path]);write(path,bytes);}
for(const top of ['assets','public','docs'])symlinkSync(realpathSync(join(repo,top)),join(out,top),'junction');
for(const name of ['dependency-input.json','dependency-output.json','leaf-manifest.json','patch-record.json'])write('qa-provenance/'+name,readFileSync(join(qa,'qa-provenance',name)));
write('qa-provenance/native-transfer.json',recordBytes);
const modules=join(out,'node_modules'),fromModules=join(qa,'node_modules');mkdirSync(modules);
function link(name){const target=join(modules,name);mkdirSync(dirname(target),{recursive:true});symlinkSync(realpathSync(join(fromModules,name)),target,'junction');}
for(const e of readdirSync(fromModules,{withFileTypes:true})){if(e.name.startsWith('.'))continue;if(e.name.startsWith('@'))for(const c of readdirSync(join(fromModules,e.name)))link(e.name+'/'+c);else link(e.name);}
mkdirSync(join(modules,'.bin'));for(const name of ['tsc','vite','tsx'])writeFileSync(join(modules,'.bin',name+'.cmd'),readFileSync(join(fromModules,'.bin',name+'.cmd')));
const composition={kind:'native-vendor-only',sourceHead,leafSha256:hash(recordBytes),changedFiles:record.changedFiles,dependencyRuntimeChanges:['core/Materials/materialHelper.functions.js'],scope:'Tracked native working tree plus exactly the vendor patch/lock and two regression tests. Does not include QA B6/day/camera/inventory coverage prototypes. Assets/public/docs are explicit readonly source links, not GPU acceptance evidence.'};
write('source-composition.json',Buffer.from(JSON.stringify(composition,null,2)+'\n'));
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceHead,createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
assert.equal(git('rev-parse','HEAD').trim(),sourceHead);console.log(JSON.stringify({out,snapshotId,sourceHead,files:Object.keys(files).length,changes:record.changedFiles.map(r=>r.path)}));
