import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),source=resolve(wt,'.cache/webgpu-hitch-validation-20261017/b6-preparation-v1');
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest=JSON.parse(readFileSync(resolve(source,'source-manifest.json'))),report=JSON.parse(readFileSync(resolve(root,'report.json'))),summary=JSON.parse(readFileSync(resolve(root,'summary.json')));
assert.equal(manifest.snapshotId,report.sourceSnapshotId);assert.equal(report.passed,true);assert.equal(summary.passed,true);
const sources={};
function record(path,recurse){const key=relative(source,path).replaceAll('\\','/');if(sources[key])return;const sha=hash(path);assert.equal(sha,manifest.files[key],key);sources[key]=sha;if(!recurse||path.endsWith('.json'))return;const text=readFileSync(path,'utf8');for(const match of text.matchAll(/(?:from\s*|import\s*\(?\s*)["'](\.[^"']+)["']/g)){const stem=resolve(dirname(path),match[1]);const child=[stem,stem+'.ts',stem+'.tsx',stem+'.json',resolve(stem,'index.ts')].find(p=>existsSync(p));if(child)record(child,true);}}
const probe=readFileSync(resolve(root,'probe.ts'),'utf8');
for(const match of probe.matchAll(/from ['"]\.\.\/\.\.\/webgpu-hitch-validation-20261017\/b6-preparation-v1\/([^'"]+)['"]/g))record(resolve(source,match[1]+'.ts'),true);
for(const[key,sha]of Object.entries(report.sources)){record(resolve(source,key),false);assert.equal(sources[key],sha);}
const core=resolve(wt,'.cache/webgpu-migration/dependencies-v5/node_modules/@babylonjs/core');
const dependencies=Object.fromEntries(['package.json','Engines/nullEngine.pure.js','Materials/materialHelper.functions.js','Materials/PBR/pbrBaseMaterial.pure.js','Bones/skeleton.js','Meshes/mesh.js','Lights/light.js'].map(p=>[p,hash(resolve(core,p))]));
assert.equal(JSON.parse(readFileSync(resolve(core,'package.json'))).version,'9.30.0');
const handoff=resolve(wt,'docs/agents/handoffs/webgpu-avatar-day-variant-proof-20261018.md');
const artifacts=Object.fromEntries(readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile()&&!['manifest.json','freeze.log'].includes(e.name)).map(e=>[e.name,hash(resolve(root,e.name))]));
const result={frozenAt:new Date().toISOString(),task:'webgpu-avatar-day-variant-proof-20261018',owner:'webgpu-avatar-proof-01a14497',sourceSnapshotId:manifest.snapshotId,sourceManifestSha:hash(resolve(source,'source-manifest.json')),scope:'bounded CPU frontend proof only; direct readonly imports; no production changes',sources,dependencies,artifacts,handoff:{path:handoff,sha256:hash(handoff)},benchmark:{path:'.cache/webgpu-hitch-validation-20261017/b6-candidate-inside-first-f-benchmark.json',sha256:hash(resolve(wt,'.cache/webgpu-hitch-validation-20261017/b6-candidate-inside-first-f-benchmark.json'))},validation:{passed:true,rows:17,comparisons:6,command:'TSX_DISABLE_CACHE=1 node --import tsx probe.ts; node summarize.mjs',gpu:false,fullSuite:false,typecheck:false},limitations:report.limitations};
writeFileSync(resolve(root,'manifest.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({manifestSha:hash(resolve(root,'manifest.json')),sources:Object.keys(sources).length,probeSha:artifacts['probe.ts'],reportSha:artifacts['report.json'],summarySha:artifacts['summary.json'],handoffSha:result.handoff.sha256},null,2));
