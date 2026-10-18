import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from '../define-order-qa-20261018/dependencies/node_modules/typescript/lib/typescript.js';
const root=dirname(fileURLToPath(import.meta.url)),wt=resolve(root,'../../..'),base=resolve(wt,'.cache/webgpu-hitch-validation-20261017/define-order-v6'),dependencies=resolve(root,'../define-order-qa-20261018/dependencies/node_modules');
const hash=b=>createHash('sha256').update(b).digest('hex'),fileHash=p=>hash(fs.readFileSync(p)),manifest=JSON.parse(fs.readFileSync(resolve(base,'source-manifest.json')));
assert.equal(manifest.snapshotId,'fc6efd2bcf91bd2b1720b35f090d74656352486ea7f09a2199dc69d14c61d525');
assert.equal(fileHash(resolve(dependencies,'@babylonjs/core/Materials/materialDefines.js')),'43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4');
const sources={};for(const p of ['tests/wgsl-surface-materials.test.ts','client/stable-light-state.ts','client/gltf-light-budget.ts','client/cinematic-art.ts','client/mesh-draw-profile.ts']){sources[p]=fileHash(resolve(base,p));assert.equal(sources[p],manifest.files[p]);}
const engineSource=fs.readFileSync(resolve(base,'tests/wgsl-surface-materials.test.ts'),'utf8'),ast=ts.createSourceFile('engine.ts',engineSource,ts.ScriptTarget.Latest,true),node=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='NativeProcessingEngine');assert.ok(node);
const code=`import {NullEngine} from '@babylonjs/core/Engines/nullEngine';\nimport {ShaderLanguage} from '@babylonjs/core/Materials/shaderLanguage';\nimport {WebGPUShaderProcessorWGSL} from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL';\nimport {WebGPUShaderProcessingContext} from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext';\nexport `+node.getText(ast)+'\n';
fs.writeFileSync(resolve(root,'native-engine.ts'),code,{flag:'wx'});fs.writeFileSync(resolve(root,'package.json'),'{"type":"module"}\n',{flag:'wx'});fs.symlinkSync(dependencies,resolve(root,'node_modules'),'junction');
fs.writeFileSync(resolve(root,'input-manifest.json'),JSON.stringify({createdAt:new Date().toISOString(),base,baseSnapshotId:manifest.snapshotId,sources,nativeEngineClassSha256:hash(node.getText(ast)),nativeEngineFileSha256:hash(code),dependencies,serializerSha256:fileHash(resolve(dependencies,'@babylonjs/core/Materials/materialDefines.js')),scope:'readonly V6 sources and physical QA dependency identity; no runtime patch'},null,2)+'\n');console.log(JSON.stringify({baseSnapshotId:manifest.snapshotId,sources:Object.keys(sources).length,dependencies}));
