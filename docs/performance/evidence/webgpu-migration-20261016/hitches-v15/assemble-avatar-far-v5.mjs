import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,symlinkSync,realpathSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,base=join(root,'inactive-light-v4'),out=join(root,'avatar-far-v5'),leaf=resolve(root,'../webgpu-migration-checks/avatar-day-far-prototype-20261018'),hash=b=>createHash('sha256').update(b).digest('hex');
const recordBytes=readFileSync(join(leaf,'manifest.json'));assert.equal(hash(recordBytes),'b60b063bbe12aa81f435204f61d2f08a5547e02357bc0c0044dda6c9c50a48a7');const record=JSON.parse(recordBytes),manifest=JSON.parse(readFileSync(join(base,'source-manifest.json')));
assert.equal(manifest.snapshotId,'bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0');assert.equal(hash(JSON.stringify(manifest.files)),manifest.snapshotId);assert.equal(record.baseSnapshotId,manifest.snapshotId);assert.equal(hash(readFileSync(join(leaf,'input-manifest.json'))),record.inputManifestSha256);
const paths=['client/avatar-preparation-far-plane.ts','client/game.ts','tests/avatar-preparation-far-plane.test.ts','tests/game-light-preparation.test.ts'];assert.deepEqual(record.changes.map(r=>r.path).sort(),[...paths].sort());
for(const [path,sha]of Object.entries(record.candidateFiles)){assert.equal(hash(readFileSync(join(leaf,'candidate',path))),sha,'Leaf source drift '+path);if(!paths.includes(path))assert.equal(manifest.files[path],sha,'Unexpected source overlay '+path);}
for(const row of record.changes){assert.equal(manifest.files[row.path]??null,row.originalSha256);assert.equal(record.candidateFiles[row.path],row.sha256);assert.equal(readFileSync(join(leaf,'candidate',row.path)).length,row.bytes);}
assert.ok(!existsSync(out),'Preserve candidate');mkdirSync(out);const files={...manifest.files};let copied=0;
function write(path,bytes){mkdirSync(dirname(join(out,path)),{recursive:true});writeFileSync(join(out,path),bytes,{flag:'wx'});files[path]=hash(bytes);}
for(const top of ['assets','public','docs'])symlinkSync(realpathSync(join(base,top)),join(out,top),'junction');
for(const [path,sha]of Object.entries(manifest.files)){
 if(['assets','public','docs'].some(top=>path.startsWith(top+'/'))||path==='source-composition.json')continue;
 const original=readFileSync(join(base,path));assert.equal(hash(original),sha,'Base drift '+path);
 const row=record.changes.find(r=>r.path===path),bytes=row?readFileSync(join(leaf,'candidate',path)):original;if(row)assert.equal(hash(bytes),row.sha256);write(path,bytes);copied++;
}
for(const row of record.changes.filter(r=>r.originalSha256===null)){const bytes=readFileSync(join(leaf,'candidate',row.path));assert.equal(hash(bytes),row.sha256);write(row.path,bytes);}
write('qa-provenance/avatar-far-overlay.json',recordBytes);
const ownModules=join(out,'node_modules'),baseModules=join(base,'node_modules');mkdirSync(ownModules);
function link(name){const target=join(ownModules,name);mkdirSync(dirname(target),{recursive:true});symlinkSync(realpathSync(join(baseModules,name)),target,'junction');}
for(const e of readdirSync(baseModules,{withFileTypes:true})){if(e.name.startsWith('.'))continue;if(e.name.startsWith('@'))for(const child of readdirSync(join(baseModules,e.name)))link(e.name+'/'+child);else link(e.name);}
mkdirSync(join(ownModules,'.bin'));for(const name of ['tsc','vite','tsx'])writeFileSync(join(ownModules,'.bin',name+'.cmd'),readFileSync(join(baseModules,'.bin',name+'.cmd')));
const composition={kind:'unaccepted-avatar-far-qa',parentSnapshot:manifest.snapshotId,leafManifestSha256:hash(recordBytes),changes:record.changes,scope:'Only Day1 OFF/ON loading views use live avatar-union far bounds. Full stage sequence, original B6 view/spatial refresh, strict readiness/deadline and dependencies unchanged. World Golden/B6 coverage and startup benefit require GPU comparison.'};
write('source-composition.json',Buffer.from(JSON.stringify(composition,null,2)+'\n'));const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceCommit:'7a58c0b8872ddc7ffe6eb28de1ead7d07dcd2787',createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
console.log(JSON.stringify({out,snapshotId,copied,overlays:record.changes.length}));
