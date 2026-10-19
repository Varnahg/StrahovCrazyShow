import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname, helper=resolve(root,'../client-threading-cpu-helper-20261019'),target=join(root,'snapshot');
const base=JSON.parse(readFileSync(join(root,'base-source-manifest.json'))),m=JSON.parse(readFileSync(join(helper,'manifest.json')));
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(m.donor,base.snapshotId);assert.equal(m.snapshotId,'fee5a9497d1d3cf4cf59e3d888559971b3c667ace2e7e5bb8134e4dfb8951569');
assert.equal(hash(JSON.stringify(m.files)),m.snapshotId);
assert.deepEqual(m.integrationFiles,['client/game.ts','client/qa-cpu-profile.ts','tests/qa-cpu-profile.test.ts','tests/game-cpu-profile.test.ts']);
assert(!existsSync(join(target,'source-manifest.json')),'Preserve finalized profile source');
for(const[p,sha]of Object.entries(base.files))assert.equal(hash(readFileSync(join(target,p))),sha,p);
for(const[p,sha]of Object.entries(m.files))assert.equal(hash(readFileSync(join(helper,p))),sha,p);
const files={...base.files};
for(const p of m.integrationFiles){const b=readFileSync(join(helper,p));mkdirSync(dirname(join(target,p)),{recursive:true});writeFileSync(join(target,p),b);files[p]=hash(b);}
const sorted=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a<b?-1:a>b?1:0)),snapshotId=hash(JSON.stringify(sorted));
writeFileSync(join(target,'source-manifest.json'),JSON.stringify({snapshotId,base:base.snapshotId,helper:m.snapshotId,files:sorted},null,2)+'\n');
writeFileSync(join(root,'integration.json'),JSON.stringify({snapshotId,base:base.snapshotId,helper:m.snapshotId,integrationFiles:Object.fromEntries(m.integrationFiles.map(p=>[p,files[p]])),sourceFiles:Object.keys(files).length},null,2)+'\n');
console.log(JSON.stringify({snapshotId,sourceFiles:Object.keys(files).length}));
