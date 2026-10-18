import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,realpathSync,symlinkSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,repo=resolve(root,'../..'),base=join(root,'define-order-native-v1'),leaf=join(repo,'.cache/webgpu-migration-checks/native-day-coverage-qa-20261018'),out=join(root,'native-day13-v1');
const hash=b=>createHash('sha256').update(b).digest('hex'),[expectedLeaf]=process.argv.slice(2);assert.match(expectedLeaf??'',/^[a-f0-9]{64}$/);
const mb=readFileSync(join(leaf,'manifest.json'));assert.equal(hash(mb),expectedLeaf);const m=JSON.parse(mb),baseline=JSON.parse(readFileSync(join(base,'source-manifest.json')));
assert.equal(baseline.snapshotId,'2a3dba44ea28dbeffa5324fe22c35011b1e333c4233bb99ed487ee7e057d3584');assert.equal(hash(JSON.stringify(baseline.files)),baseline.snapshotId);
const paths=['client/game.ts','client/light-preparation.ts','client/webgpu-compilation-profile.ts','tests/game-light-preparation.test.ts','tests/light-preparation.test.ts','tests/webgpu-compilation-profile.test.ts'];
assert.equal(m.task,'webgpu-native-day-coverage-qa-20261018');assert.deepEqual(m.changes.map(r=>r.path).sort(),[...paths].sort());
for(const r of m.changes){assert.equal(hash(readFileSync(join(leaf,'candidate',r.path))),r.sha256,'Candidate drift '+r.path);assert.equal(r.originalSha256,baseline.files[r.path],'Preimage drift '+r.path);}
for(const [p,r]of Object.entries(m.artifacts??{}))assert.equal(hash(readFileSync(join(leaf,p))),r.sha256,'Leaf evidence drift '+p);
assert.ok(!existsSync(out),'Preserve frozen snapshot');mkdirSync(out);const files={};
function write(p,b){assert.ok(!p.split('/').includes('..'));mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),b);files[p]=hash(b);}
for(const [p,sha]of Object.entries(baseline.files)){const b=readFileSync(join(base,p));assert.equal(hash(b),sha,'Frozen native drift '+p);write(p,b);}
for(const r of m.changes)write(r.path,readFileSync(join(leaf,'candidate',r.path)));
for(const top of ['assets','public','docs'])symlinkSync(realpathSync(join(base,top)),join(out,top),'junction');
const modules=join(out,'node_modules'),from=join(base,'node_modules');mkdirSync(modules);
function link(name){const target=join(modules,name);mkdirSync(dirname(target),{recursive:true});symlinkSync(realpathSync(join(from,name)),target,'junction');}
for(const e of readdirSync(from,{withFileTypes:true})){if(e.name.startsWith('.'))continue;if(e.name.startsWith('@'))for(const c of readdirSync(join(from,e.name)))link(e.name+'/'+c);else link(e.name);}
mkdirSync(join(modules,'.bin'));for(const name of ['tsc','vite','tsx'])writeFileSync(join(modules,'.bin',name+'.cmd'),readFileSync(join(from,'.bin',name+'.cmd')));
write('qa-provenance/day13-leaf-manifest.json',mb);
const composition={kind:'native-day13-only',baseSnapshotId:baseline.snapshotId,sourceHead:baseline.sourceHead,leafSha256:expectedLeaf,changes:m.changes,scope:'Isolated native day0/day1 OFF/ON coverage and bounded existing opt-in stage configuration. Six source/test changes only; no C5/B6/camera/preload/foreign changes. Original30s timeout/full readiness preserved. GPU acceptance pending.'};
write('source-composition.json',Buffer.from(JSON.stringify(composition,null,2)+'\n'));
const snapshotId=hash(JSON.stringify(files));writeFileSync(join(out,'source-manifest.json'),JSON.stringify({snapshotId,sourceHead:baseline.sourceHead,createdAt:new Date().toISOString(),scope:composition.scope,files},null,2)+'\n');
console.log(JSON.stringify({out,snapshotId,files:Object.keys(files).length,baseSnapshotId:baseline.snapshotId,leafSha256:expectedLeaf}));
