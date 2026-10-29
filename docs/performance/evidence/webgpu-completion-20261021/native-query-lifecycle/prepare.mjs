/** Owned patch-only preparation. Never modifies installed or frozen dependencies. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
export const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../..');
export const cache=join(root,'.cache/webgpu-completion-native-query-lifecycle-20261021');
export const core=join(root,'.cache/performance-snapshot/webgpu-completion-20261021-candidate-6/node_modules/@babylonjs/core');
export const files=['Engines/WebGPU/webgpuQuerySet.js','Engines/WebGPU/webgpuQuerySet.d.ts','Engines/WebGPU/webgpuTimestampQuery.js','Engines/WebGPU/webgpuTimestampQuery.d.ts','Engines/WebGPU/webgpuOcclusionQuery.js','Engines/WebGPU/webgpuOcclusionQuery.d.ts','Engines/webgpuEngine.pure.js','Engines/webgpuEngine.pure.d.ts'];
export const hash=x=>createHash('sha256').update(x).digest('hex');
const patchPath=join(root,'patches/@babylonjs__core@9.30.0.patch'),lockPath=join(root,'pnpm-lock.yaml');
await mkdir(cache,{recursive:true});
if(process.argv.includes('--snapshot')){
  const patch=await readFile(patchPath),lock=await readFile(lockPath),native={};
  assert.equal(hash(patch),'597beca732c25cbb128271fad6681fd0176726962ede3218db41057359ea9b72');
  assert.equal(hash(await readFile(join(core,'Meshes/mesh.pure.js'))),'7ceb79d2f4eaa72665e5084ffc6e752bbbb93dd84a7f97801c9cf2431afa459a');
  await writeFile(join(cache,'baseline.patch'),patch);await writeFile(join(cache,'baseline.lock'),lock);
  for(const file of files){const bytes=await readFile(join(core,file));native[file]=hash(bytes);for(const dir of ['before','candidate']){await mkdir(dirname(join(cache,dir,file)),{recursive:true});await writeFile(join(cache,dir,file),bytes);}}
  await writeFile(join(cache,'baseline.json'),JSON.stringify({patch:hash(patch),lock:hash(lock),native,core},null,2)+'\n');
  console.log('snapshotted eight native files and exact patch/lock');
}else{
  const oldPatch=await readFile(join(cache,'baseline.patch')),oldLock=await readFile(join(cache,'baseline.lock'));let sections='';
  for(const file of files){const diff=spawnSync('git',['diff','--no-index','--no-ext-diff','--text','--unified=3',join(cache,'before',file),join(cache,'candidate',file)],{cwd:root,encoding:'utf8'});assert.ok(diff.status===0||diff.status===1,diff.stderr);if(diff.status===1)sections+=diff.stdout.replace(/^diff --git .*$/m,`diff --git a/${file} b/${file}`).replace(/^--- .*$/m,`--- a/${file}`).replace(/^\+\+\+ .*$/m,`+++ b/${file}`);}
  const next=Buffer.concat([oldPatch,Buffer.from(oldPatch.at(-1)===10?'':'\n'),Buffer.from(sections)]),oldHash=hash(oldPatch),newHash=hash(next),lock=oldLock.toString();
  assert.equal(lock.split(oldHash).length-1,6);const nextLock=Buffer.from(lock.replaceAll(oldHash,newHash));assert.ok(Buffer.from(nextLock.toString().replaceAll(newHash,oldHash)).equals(oldLock));
  await writeFile(patchPath,next);await writeFile(lockPath,nextLock);
  const overlay=join(cache,'patch-check');await mkdir(overlay,{recursive:true});assert.equal(spawnSync('git',['init','--quiet'],{cwd:overlay}).status,0);
  const paths=[...new Set([...oldPatch.toString().matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map(x=>x[1]).concat(files))],before={};
  for(const file of paths){const bytes=await readFile(join(core,file));before[file]=hash(bytes);await mkdir(dirname(join(overlay,file)),{recursive:true});await writeFile(join(overlay,file),bytes);}
  for(const args of [['apply','--check','--reverse',join(cache,'baseline.patch')],['apply','--reverse',join(cache,'baseline.patch')],['apply','--check',patchPath],['apply',patchPath]]){const r=spawnSync('git',['-c','core.autocrlf=false',...args],{cwd:overlay,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}
  const after={};for(const file of paths){after[file]=hash(await readFile(join(overlay,file)));assert.equal(after[file],files.includes(file)?hash(await readFile(join(cache,'candidate',file))):before[file],file);}
  assert.ok(next.subarray(0,oldPatch.length).equals(oldPatch));
  await writeFile(join(cache,'patch-proof.json'),JSON.stringify({oldPatch:oldHash,newPatch:newHash,oldLock:hash(oldLock),newLock:hash(nextLock),oldTenSectionsByteExact:true,inverseLockExact:true,lockReferences:6,fullReverseApplyExact:true,before,after},null,2)+'\n');
  console.log(JSON.stringify({patch:newHash,lock:hash(nextLock),nativeFiles:files.length}));
}
