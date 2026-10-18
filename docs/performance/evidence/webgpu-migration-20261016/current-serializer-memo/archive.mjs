import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {join,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
const root=import.meta.dirname,repo=join(root,'../..'),proof=join(root,'../webgpu-memo-current-proof-20261019'),out=join(repo,'docs/performance/evidence/webgpu-migration-20261016/current-serializer-memo');
const hash=b=>createHash('sha256').update(b).digest('hex'),files={};
function save(path,b){const gzip=b.length>50000&&!path.endsWith('.jpg');const p=path+(gzip?'.gz':'');const encoded=gzip?gzipSync(b,{level:9}):b;mkdirSync(dirname(join(out,p)),{recursive:true});writeFileSync(join(out,p),encoded);assert.deepEqual(gzip?gunzipSync(encoded):encoded,b);files[p]={sha256:hash(encoded),originalSha256:hash(b),originalBytes:b.length,encoding:gzip?'gzip':'identity'};}
function copy(from,to){save(to,readFileSync(from));}
function walk(dir,prefix){for(const d of readdirSync(dir,{withFileTypes:true})){const p=join(dir,d.name),target=prefix+'/'+d.name;if(d.isDirectory())walk(p,target);else if(d.isFile())copy(p,target);}}
for(const d of readdirSync(root,{withFileTypes:true}))if(d.isFile()&&!['archive.mjs','commit-evidence.mjs','integration-receipt.json'].includes(d.name))copy(join(root,d.name),'pilot/'+d.name);
for(const source of ['reference','memo'])copy(join(root,source,'source-manifest.json'),'pilot/'+source+'-source-manifest.json');
for(const run of ['a1','m1','a2','m2','a3','m3']){const dir=join(root,'runs',run);for(const d of readdirSync(dir)){if(d==='runtime.json')continue;copy(join(dir,d),'runs/'+run+'/'+d);}const runtime=JSON.parse(readFileSync(join(dir,'runtime.json')));const {processes,...identity}=runtime;save('runs/'+run+'/identity.json',Buffer.from(JSON.stringify({...identity,scope:'Operational process IDs omitted. Original source/session and actual start times are retained by raw telemetry.'},null,2)+'\n'));}
for(const d of readdirSync(proof,{withFileTypes:true}))if(d.isFile())copy(join(proof,d.name),'proof/'+d.name);
walk(join(proof,'candidate'),'proof/candidate');walk(join(proof,'preimages'),'proof/preimages');
// Preserve the local test closure, not a duplicate of the 10860 dependency files.
for(const d of readdirSync(join(proof,'fixture'),{withFileTypes:true})){if(d.name==='node_modules')continue;const p=join(proof,'fixture',d.name);if(d.isDirectory())walk(p,'proof/fixture/'+d.name);else if(d.isFile())copy(p,'proof/fixture/'+d.name);}
copy(new URL(import.meta.url),'archive.mjs');
mkdirSync(out,{recursive:true});writeFileSync(join(out,'artifact-manifest.json'),JSON.stringify({createdAtUTC:new Date().toISOString(),scope:'Six uninstrumented current A/M first drives and current correctness proof. Memo not accepted into native runtime. Raw logs retained unchanged; gzip is lossless. No dependency installation or full migration acceptance claimed.',files},null,2)+'\n');
console.log(JSON.stringify({files:Object.keys(files).length,bytes:Object.values(files).reduce((n,x)=>n+x.originalBytes,0),out}));
