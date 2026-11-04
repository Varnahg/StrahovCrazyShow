/** Generate only this allocated native delta; never install or alter dependencies. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../../../..'),cache=join(root,'.cache/webgpu-completion-native-instance-buffer-20261021');
const hash=value=>createHash('sha256').update(value).digest('hex');
const baseline=JSON.parse(await readFile(join(cache,'baseline.json'),'utf8'));
const patchPath=join(root,'patches/@babylonjs__core@9.30.0.patch'),lockPath=join(root,'pnpm-lock.yaml');
const oldPatch=await readFile(join(cache,'patches__@babylonjs__core@9.30.0.patch')),oldLock=await readFile(join(cache,'pnpm-lock.yaml')),before=await readFile(join(cache,'mesh-baseline.js'),'utf8');
assert.equal(hash(oldPatch),baseline['patches/@babylonjs__core@9.30.0.patch']);assert.equal(hash(oldLock),baseline['pnpm-lock.yaml']);
const eol=before.includes('\r\n')?'\r\n':'\n';
const anchor=['            if (engine._currentDrawContext) {','                engine._currentDrawContext.useInstancing = true;','            }','            this._bind(subMesh, effect, fillMode);'].join(eol);
assert.equal(before.split(anchor).length,2,'one regular-instance actual-draw insertion point');
const replacement=[
'            if (engine._currentDrawContext) {',
'                const drawContext = engine._currentDrawContext;',
'                drawContext.useInstancing = true;',
'                // Bundles bake vertex handles. Check every context before replay,',
'                // including later submeshes/passes/shadow overrides after replacement.',
'                // Vertex pulling has separate storage-binding refresh requirements.',
'                if (engine.isWebGPU && !engine.compatibilityMode && !engine._currentMaterialContext?.useVertexPulling) {',
'                    const currentBufferId = instancesBuffer?._buffer?.uniqueId;',
'                    const needsPrevious = this._scene.needsPreviousWorldMatrices;',
'                    const previousBufferId = needsPrevious ? instancesPreviousBuffer?._buffer?.uniqueId : null;',
'                    if (currentBufferId == null || (needsPrevious && previousBufferId == null) ||',
'                        drawContext._regularInstanceCurrentBufferId !== currentBufferId ||',
'                        drawContext._regularInstancePreviousBufferId !== previousBufferId) {',
'                        drawContext.fastBundle = undefined;',
'                        drawContext._regularInstanceCurrentBufferId = currentBufferId;',
'                        drawContext._regularInstancePreviousBufferId = previousBufferId;',
'                    }',
'                }',
'            }',
'            this._bind(subMesh, effect, fillMode);',
].join(eol);
const candidate=before.replace(anchor,replacement);await writeFile(join(cache,'mesh-candidate.js'),candidate);
const diff=spawnSync('git',['diff','--no-index','--no-ext-diff','--text','--unified=5',join(cache,'mesh-baseline.js'),join(cache,'mesh-candidate.js')],{cwd:root,encoding:'utf8'});assert.equal(diff.status,1,diff.stderr);
const section=diff.stdout.replace(/^diff --git .*$/m,'diff --git a/Meshes/mesh.pure.js b/Meshes/mesh.pure.js').replace(/^--- .*$/m,'--- a/Meshes/mesh.pure.js').replace(/^\+\+\+ .*$/m,'+++ b/Meshes/mesh.pure.js');
const nextPatch=Buffer.concat([oldPatch,Buffer.from(oldPatch.at(-1)===10?'':'\n'),Buffer.from(section)]),newHash=hash(nextPatch),oldHash=hash(oldPatch);
const lockText=oldLock.toString('utf8');assert.equal(lockText.split(oldHash).length-1,6);const nextLock=Buffer.from(lockText.replaceAll(oldHash,newHash));assert.ok(Buffer.from(nextLock.toString('utf8').replaceAll(newHash,oldHash)).equals(oldLock));
await writeFile(patchPath,nextPatch);await writeFile(lockPath,nextLock);await writeFile(join(cache,'mesh-section.patch'),section);
// A private Git directory confines complete reverse/apply checks to this cache.
const overlay=join(cache,'patch-check');await mkdir(overlay,{recursive:true});
const init=spawnSync('git',['init','--quiet'],{cwd:overlay,encoding:'utf8'});assert.equal(init.status,0,init.stderr);
const paths=[...oldPatch.toString('utf8').matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map(value=>value[1]);paths.push('Meshes/mesh.pure.js');
const beforeHashes={};for(const file of paths){const bytes=await readFile(join(baseline.installedCore,file));beforeHashes[file]=hash(bytes);await mkdir(dirname(join(overlay,file)),{recursive:true});await writeFile(join(overlay,file),bytes);}
for(const args of [['apply','--check','--reverse',join(cache,'patches__@babylonjs__core@9.30.0.patch')],['apply','--reverse',join(cache,'patches__@babylonjs__core@9.30.0.patch')],['apply','--check',patchPath],['apply',patchPath]]){const result=spawnSync('git',['-c','core.autocrlf=false',...args],{cwd:overlay,encoding:'utf8'});assert.equal(result.status,0,result.stderr);}
const afterHashes={};for(const file of paths){afterHashes[file]=hash(await readFile(join(overlay,file)));assert.equal(afterHashes[file],file==='Meshes/mesh.pure.js'?hash(candidate):beforeHashes[file],file+' exact apply');}
assert.ok(nextPatch.subarray(0,oldPatch.length).equals(oldPatch),'all nine existing sections byte-exact');
const proof={oldPatchSha256:oldHash,newPatchSha256:newHash,oldLockSha256:hash(oldLock),newLockSha256:hash(nextLock),lockReferences:6,inverseLockExact:true,oldSectionsByteExact:true,sourceBefore:beforeHashes,sourceAfter:afterHashes,fullReverseApplyExact:true,candidateMeshSha256:hash(candidate)};
await writeFile(join(cache,'patch-proof.json'),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
