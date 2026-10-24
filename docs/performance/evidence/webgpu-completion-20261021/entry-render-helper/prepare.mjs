import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve,join} from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../../../../..');
const original=join(root,'.cache/webgpu-completion-20261021/preparation-summary/helper/v10');
const target=join(root,'.cache/webgpu-completion-20261021/entry-render/helper/v11');
const {helperIdentity,sha256}=await import(pathToFileURL(join(original,'common.mjs')));
const before=await helperIdentity(original);
if(before.sha256!=='49662229acfc4211503c277d4d22c029024877e5717aa5b367f93792af693009'||Object.keys(before.files).length!==30)throw Error('Exact v10 drift');
await mkdir(dirname(target),{recursive:true});await mkdir(target);
for(const[file,want]of Object.entries(before.files)){const bytes=await readFile(join(original,file));if(sha256(bytes)!==want)throw Error(file);await writeFile(join(target,file),bytes,{flag:'wx'});}
const protectedPaths=['client/game.ts','client/ui.tsx','client/gltf-light-budget.ts','client/stable-light-state.ts','client/render-health.ts','shared/simulation.ts','package.json','pnpm-lock.yaml','patches/@babylonjs__core@9.30.0.patch',
 '.cache/performance-snapshot/webgpu-completion-20261023-candidate-12/client/game.ts','.cache/performance-snapshot/webgpu-completion-20261023-candidate-12/node_modules/@babylonjs/core/Materials/shadowDepthWrapper.js',
 '.cache/performance-snapshot/webgpu-completion-20261023-candidate-12/node_modules/@babylonjs/core/scene.pure.js','.cache/performance-snapshot/webgpu-completion-20261023-candidate-12/node_modules/@babylonjs/core/Engines/abstractEngine.pure.js'];
const protectedHashes=Object.fromEntries(await Promise.all(protectedPaths.map(async f=>[f,sha256(await readFile(join(root,f)))])));
const copied=await helperIdentity(target),after=await helperIdentity(original);
if(JSON.stringify(before)!==JSON.stringify(copied)||JSON.stringify(before)!==JSON.stringify(after)||resolve(target,'../../../../..')!==root)throw Error('Copy identity/depth drift');
await writeFile(join(dir,'before.json'),JSON.stringify({original,target,before,copied,after,protectedHashes,depth5:true},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({original:before.sha256,files:30,protected:protectedPaths.length,depth5:true}));
