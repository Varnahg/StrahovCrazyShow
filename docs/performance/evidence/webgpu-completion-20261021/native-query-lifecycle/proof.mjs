/** Stable owned checkpoint proof, targeted CPU checks only. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,'../../../../..'),cache=join(root,'.cache/webgpu-completion-native-query-lifecycle-20261021');
const hash=x=>createHash('sha256').update(x).digest('hex'),baseline=JSON.parse(await readFile(join(cache,'baseline.json'),'utf8'));
const inputs=['patches/@babylonjs__core@9.30.0.patch','pnpm-lock.yaml','client/webgpu-validation.ts','client/render-health.ts','tests/webgpu-validation.test.ts','tests/render-health.test.ts','tests/render-startup.test.ts','tests/startup-preparation-loop.test.ts','tests/webgpu-query-lifecycle.test.ts',...(await readdir(join(root,'tests/fixtures/webgpu-query-lifecycle'))).map(f=>'tests/fixtures/webgpu-query-lifecycle/'+f)];
const digest=async(paths,base=root)=>Object.fromEntries(await Promise.all(paths.map(async file=>[file,hash(await readFile(join(base,file)))])));
const oldPatch=await readFile(join(cache,'baseline.patch')),patch=await readFile(join(root,inputs[0])),lock=await readFile(join(root,inputs[1])),oldLock=await readFile(join(cache,'baseline.lock'));
assert.ok(patch.subarray(0,oldPatch.length).equals(oldPatch));assert.ok(Buffer.from(lock.toString().replaceAll(hash(patch),hash(oldPatch))).equals(oldLock));
const pinPaths=[...new Set([...oldPatch.toString().matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map(x=>x[1]).concat(Object.keys(baseline.native),['Engines/WebGPU/webgpuBufferManager.js','Engines/WebGPU/webgpuPerfCounter.js','Engines/thinWebGPUEngine.js','Engines/abstractEngine.pure.js','Engines/engine.common.js','Misc/observable.js','Misc/observable.pure.js','Misc/perfCounter.js','Misc/logger.js','Engines/WebGPU/webgpuConstants.js','package.json']))];
const installed=dirname(fileURLToPath(import.meta.resolve('@babylonjs/core/package.json')));
const sourceBefore=await digest(inputs),freshBefore=await digest(pinPaths,baseline.core),installedBefore=await digest(pinPaths,installed),candidateBefore=await digest(Object.keys(baseline.native),join(cache,'candidate'));
for(const [file,expected]of Object.entries(baseline.native))assert.equal(freshBefore[file],expected);
assert.equal(freshBefore['Meshes/mesh.pure.js'],'7ceb79d2f4eaa72665e5084ffc6e752bbbb93dd84a7f97801c9cf2431afa459a');
const run=(label,file,args=[])=>{const r=spawnSync(process.execPath,[join(directory,file),...args],{cwd:root,encoding:'utf8',maxBuffer:12*1024*1024});assert.equal(r.status,0,label+'\n'+r.stdout+r.stderr);return {label,command:[process.execPath,join(directory,file),...args].join(' '),exit:r.status,output:(r.stdout+r.stderr).trim()};};
const red=run('unchanged original native and causal witness','verify.mjs',['--red']);
const green=run('isolated native candidate and actual client pipeline','verify.mjs');
const types=run('scoped TypeScript semantic check','typecheck.mjs');
const syntax=[];for(const file of ['prepare.mjs','verify.mjs','typecheck.mjs','proof.mjs','inline-red-repro.mjs']){const path=join(directory,file),r=spawnSync(process.execPath,['--check',path],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);syntax.push({file:path,exit:r.status});}
for(const file of Object.keys(baseline.native).filter(f=>f.endsWith('.js'))){const r=spawnSync(process.execPath,['--check',join(cache,'candidate',file)],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);syntax.push({file,exit:r.status});}
for(const file of inputs.filter(f=>f.endsWith('.mjs'))){const r=spawnSync(process.execPath,['--check',join(root,file)],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);syntax.push({file,exit:r.status});}
const diff=spawnSync('git',['diff','--check','--',...inputs],{cwd:root,encoding:'utf8'});assert.equal(diff.status,0,diff.stdout+diff.stderr);
const sourceAfter=await digest(inputs),freshAfter=await digest(pinPaths,baseline.core),installedAfter=await digest(pinPaths,installed),candidateAfter=await digest(Object.keys(baseline.native),join(cache,'candidate'));
assert.deepEqual(sourceAfter,sourceBefore);assert.deepEqual(freshAfter,freshBefore);assert.deepEqual(installedAfter,installedBefore);assert.deepEqual(candidateAfter,candidateBefore);
const logs={};for(const file of ['red.tap','green.tap','inline-red.log','types.log'])logs[file]=hash(await readFile(join(directory,file)));
const originalEvidence='.cache/webgpu-completion-20261021/validation/lifecycle-run-1/device-loss-console.json';
const proof={checkedAtUTC:new Date().toISOString(),scope:'CPU only. Native installed query/consumer/engine code and actual RenderHealth. Fake terminal GPU IO. Four JS candidate hooks and four native declaration overlays are explicit cache-only tooling. No install/full-suite/build/GPU/performance or all34 fault attribution.',red,green,types,syntax,sourceBefore,sourceAfter,freshBefore,freshAfter,installedBefore,installedAfter,candidateBefore,candidateAfter,logs,oldTenSectionsByteExact:true,inverseLockExact:true,patchProof:JSON.parse(await readFile(join(cache,'patch-proof.json'),'utf8')),originalEvidence:{path:originalEvidence,sha256:hash(await readFile(join(root,originalEvidence))),all34QueryAttribution:false},diffCheck:0};
await writeFile(join(directory,'verification.json'),JSON.stringify(proof,null,2)+'\n');await writeFile(join(directory,'patch-proof.json'),JSON.stringify(proof.patchProof,null,2)+'\n');
console.log(JSON.stringify({verificationSha256:hash(await readFile(join(directory,'verification.json'))),green:green.output,types:types.output,syntax:syntax.length,inputs:inputs.length,pinPaths:pinPaths.length,patch:hash(patch),lock:hash(lock)}));
