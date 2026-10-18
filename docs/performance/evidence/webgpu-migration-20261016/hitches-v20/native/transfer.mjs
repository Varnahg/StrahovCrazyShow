import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),qa=resolve(root,'../define-order-qa-20261018'),source=resolve(qa,'candidate');
const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(fs.readFileSync(p));
assert.equal(fileHash(resolve(qa,'manifest.json')),'37b2d5e1c31f62d4f4d0cdebaaf3063cd1ad8f3e64156ddf58a2a99563fbb228');
const manifest=JSON.parse(fs.readFileSync(resolve(qa,'manifest.json'))),records={},payloads=new Map();
const files=['patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml','tests/material-defines-serialization.test.ts','tests/material-defines-wgsl-order.test.ts','tests/fixtures/material-defines-order/scenario.ts','tests/fixtures/material-defines-order/baseline.json.gz','tests/fixtures/material-defines-order/provenance.json'];
const expectedPreimages={'patches/@babylonjs__core@9.30.0.patch':'0811815a615a8e501c4542ee2fa38fcc5fdd1a4394fbc610cb0aa5a0ae62c578','pnpm-lock.yaml':'54bae00191e01af417fffb8f243917dd299987c614121c09840475ed2b1b9ca8'};
for(const p of files){const target=resolve(wt,p),before=fs.existsSync(target)?fileHash(target):null;assert.equal(before,expectedPreimages[p]??null,'native preimage '+p);records[p]={originalSha256:before};}
assert.equal(fs.existsSync(resolve(wt,'tests/fixtures/material-defines-order/baseline.json')),false,'no expanded native fixture');
for(const p of files.filter(p=>!p.endsWith('baseline.json.gz'))){const bytes=fs.readFileSync(resolve(source,p));assert.equal(hash(bytes),manifest.candidateFiles[p],p);payloads.set(p,bytes);records[p].qaSha256=hash(bytes);}
const raw=fs.readFileSync(resolve(source,'tests/fixtures/material-defines-order/baseline.json'));assert.equal(raw.length,9709634);assert.equal(hash(raw),'355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f');
const compressed=gzipSync(raw,{level:9});assert.equal(compressed.readUInt32LE(4),0,'gzip timestamp is deterministic');assert.equal(compressed[3]&8,0,'no filename header');assert.ok(gunzipSync(compressed,{maxOutputLength:raw.length}).equals(raw));payloads.set(files[5],compressed);
const baseline={path:files[5],encoding:'gzip',bytes:compressed.length,sha256:hash(compressed),uncompressedBytes:raw.length,uncompressedSha256:hash(raw),sourceQaPath:'candidate/tests/fixtures/material-defines-order/baseline.json'};
let test=payloads.get(files[3]).toString('utf8');
assert.ok(test.includes("import {writeFileSync,realpathSync} from 'node:fs';"));test=test.replace("import {writeFileSync,realpathSync} from 'node:fs';","import {writeFileSync,realpathSync,readFileSync} from 'node:fs';\nimport {gunzipSync} from 'node:zlib';\nimport {createHash} from 'node:crypto';");
const oldImport="import baselines from './fixtures/material-defines-order/baseline.json';";assert.equal(test.split(oldImport).length,2);
test=test.replace(oldImport,`// Preserve the accepted baseline bytes; decompression is test-only and bounded.
const baselineBytes=gunzipSync(readFileSync(new URL('./fixtures/material-defines-order/baseline.json.gz',import.meta.url)),{maxOutputLength:9709634});
assert.equal(baselineBytes.length,9709634);
assert.equal(createHash('sha256').update(baselineBytes).digest('hex'),'355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f');
const baselines=JSON.parse(baselineBytes.toString('utf8'));`);payloads.set(files[3],Buffer.from(test));
const provenance=JSON.parse(payloads.get(files[6]));provenance.qaManifestSha='37b2d5e1c31f62d4f4d0cdebaaf3063cd1ad8f3e64156ddf58a2a99563fbb228';provenance.baseline=baseline;provenance.changes.push('native fixture packaging only: exact decompressed bytes, bounded import.meta.url gzip loader');
const archive='docs/performance/evidence/webgpu-migration-20261016/hitches-v18/';provenance.mirrored.source=archive+'proof-mirror-red.test.ts';provenance.mirrored.log=archive+'run-mirror-red.log';provenance.mirrored.report=archive+'report-mirror-red.json.gz';
for(const key of ['source','log','report'])assert.ok(fs.existsSync(resolve(wt,provenance.mirrored[key])),'portable archive '+key);
payloads.set(files[6],Buffer.from(JSON.stringify(provenance,null,2)+'\n'));
const protectedPaths=['client/game.ts','client/light-preparation.ts','client/render-engine.ts','package.json','tests/inactive-light-defines-helper.test.ts','node_modules/@babylonjs/core/Materials/materialDefines.js'];
const protectedFiles=Object.fromEntries(protectedPaths.map(p=>[p,fs.existsSync(resolve(wt,p))?fileHash(resolve(wt,p)):null]));
const baseHead=execFileSync('git',['rev-parse','HEAD'],{cwd:wt,encoding:'utf8'}).trim();
// All preimages and payloads are validated before the first native write.
for(const p of files){const target=resolve(wt,p);assert.equal(fs.existsSync(target)?fileHash(target):null,records[p].originalSha256,'recheck '+p);if(records[p].originalSha256){const backup=resolve(root,'preimages',p);fs.mkdirSync(dirname(backup),{recursive:true});fs.writeFileSync(backup,fs.readFileSync(target),{flag:'wx'});}}
for(const[p,bytes]of payloads){const target=resolve(wt,p);fs.mkdirSync(dirname(target),{recursive:true});fs.writeFileSync(target,bytes,{flag:records[p].originalSha256?'w':'wx'});records[p].sha256=fileHash(target);records[p].bytes=bytes.length;assert.equal(records[p].sha256,hash(bytes));}
for(const[p,sha]of Object.entries(protectedFiles))assert.equal(fs.existsSync(resolve(wt,p))?fileHash(resolve(wt,p)):null,sha,'protected native '+p);
const record={task:'webgpu-define-order-native-20261018',baseHead,createdAt:new Date().toISOString(),qaManifestSha:provenance.qaManifestSha,files:records,baseline,protectedFiles};fs.writeFileSync(resolve(root,'transfer.json'),JSON.stringify(record,null,2)+'\n');console.log(JSON.stringify({baseHead,files:files.length,baseline,outputs:records},null,2));
