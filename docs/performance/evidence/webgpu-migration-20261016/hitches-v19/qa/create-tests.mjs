import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from '../inactive-light-defines-qa-20261018/dependencies/node_modules/typescript/lib/typescript.js';
const root=dirname(fileURLToPath(import.meta.url)),candidate=resolve(root,'candidate'),fixture=resolve(candidate,'tests/fixtures/material-defines-order');mkdirSync(fixture,{recursive:true});
const input=JSON.parse(readFileSync(resolve(root,'input-manifest.json'))),source=readFileSync(resolve(root,'accepted-proof/proof.test.ts'),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');assert.equal(hash(source),'5a353f84599ccc0cc8d4a70eb2fdfdb3e14c24021619cd7274dde0bf50142cb9');
const sourceAst=ts.createSourceFile('engine.ts',readFileSync(resolve(candidate,'tests/wgsl-surface-materials.test.ts'),'utf8'),ts.ScriptTarget.Latest,true);
const engineClass=sourceAst.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='NativeProcessingEngine').getText(sourceAst);
const raw=readFileSync(resolve(input.packageRoots.core.from,'Materials/materialDefines.js'),'utf8'),rawAst=ts.createSourceFile('materialDefines.js',raw,ts.ScriptTarget.Latest,true);
const rawClass=rawAst.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='MaterialDefines'),rawBody=rawClass.members.find(n=>n.name?.getText(rawAst)==='toString').body.getText(rawAst);
let imports=source.slice(0,source.indexOf('const sha='));
imports=imports.split('\n').filter(line=>!/^import (test|\{readFileSync|\{createHash|\{Script|ts |\{canonicalResult|\{MaterialDefines)/.test(line)).join('\n');
imports=imports.replaceAll('../../webgpu-hitch-validation-20261017/inactive-light-v4/client/','../../../client/');
let harness=source.slice(source.indexOf('const copy='),source.indexOf("test('guard accepts"));
harness=harness.replace("const kinds=","export const kinds=").replace('async function scenario(kind:Kind,canonical:boolean,orderSensitive=false){','export async function scenario(kind:Kind,orderSensitive=false){\n  const canonical=true;');
harness=harness.replace('report.scenarios.push(result);','');
harness=harness.replace('list.push(result);','assert.ok(typeof result === "string");list.push(result);');
harness=harness.replace('assert.equal(canonicalResult(a.original),canonicalResult(b.original));','assert.deepEqual(a.original.split("\\n").sort(),b.original.split("\\n").sort());');
harness=harness.replace('    const canonicalFunction=a.defines===canonicalResult(a.original);assert.equal(canonicalFunction,canonical);','');
const repeat='const before=Object.keys(engine._compiledEffects).length;await render(\'B repeat four\',1);assert.equal(Object.keys(engine._compiledEffects).length,before);';
assert.ok(harness.includes(repeat));
harness=harness.replace(repeat,repeat+`\n    const shared=drawSubmesh(1)._getDrawWrapper(camera.renderPassId).effect,refs=shared._refCount;
    const extra=engine.createEffect(shared.name,{attributes:shared.getAttributesNames(),uniformsNames:[],samplers:[],defines:shared.defines,shaderLanguage:ShaderLanguage.WGSL},engine);
    assert.equal(extra,shared);assert.equal(shared._refCount,refs+1);extra.dispose();assert.equal(shared._refCount,refs);assert.equal(shared.isDisposed,false);assert.equal(engine._compiledEffects[shared.key],shared);result.extraReferenceReleased=true;`);
assert.ok(!harness.includes('canonicalResult(')&&!harness.includes('withCanonicalResult'));
writeFileSync(resolve(fixture,'scenario.ts'),imports+'\n'+engineClass+'\n// Exact original serializer body used only as a read-only comparison oracle.\n// It is never installed on the patched class or used to render.\nconst originalDescriptor={value:function(this:any)'+rawBody+'};\n'+harness);
const prior=JSON.parse(readFileSync(resolve(root,'accepted-proof/report.json'))),baselines={};
for(const entry of prior.scenarios.filter(s=>!s.orderSensitive)){baselines[entry.kind]??={};baselines[entry.kind][entry.canonical?'canonical':'baseline']={programs:entry.programs,pluginUniforms:entry.pluginUniforms,states:entry.states.map(s=>({label:s.label,defines:s.defines,values:s.values,metadata:s.metadata,body:s.body,prefixes:s.prefixes}))};}
baselines.customOrderBaseline=prior.scenarios.find(s=>s.orderSensitive&&!s.canonical).states[1].body;
writeFileSync(resolve(fixture,'baseline.json'),JSON.stringify(baselines,null,2)+'\n');
writeFileSync(resolve(fixture,'provenance.json'),JSON.stringify({acceptedManifestSha:input.acceptedProofManifestSha,acceptedTestSha:hash(source),rawMaterialDefinesSha:hash(raw),rawSerializerBodySha:hash(rawBody),nativeProcessingEngineSha:hash(engineClass),changes:['actual patched class only; no canonical wrapper','read-only original serializer oracle','10 accepted baseline datasets','extra owned native Effect reference release check'],mirrored:{status:'unresolved original baseline RED; not a passing coverage assertion',source:'accepted-proof/proof-mirror-red.test.ts',log:'accepted-proof/run-mirror-red.log'}},null,2)+'\n');
const glbSource=readFileSync(resolve(candidate,'tests/inactive-light-defines-helper.test.ts'),'utf8'),glb=glbSource.slice(glbSource.indexOf('function smallGlb()'),glbSource.indexOf("test('real tiny GLB"));assert.ok(glb.startsWith('function smallGlb()'));
writeFileSync(resolve(candidate,'tests/material-defines-wgsl-order.test.ts'),`import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {MaterialDefines} from '@babylonjs/core/Materials/materialDefines';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import {kinds,scenario} from './fixtures/material-defines-order/scenario';
import baselines from './fixtures/material-defines-order/baseline.json';
const descriptor=Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString');
const results:any[]=[];
for(const kind of kinds)test('patched distribution actual native WGSL/order reuse '+kind,async()=>{
  const candidate=await scenario(kind);results.push(candidate);const baseline=(baselines as any)[kind].baseline,expected=(baselines as any)[kind].canonical;
  assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString'),descriptor,'no process-local serializer wrapper');
  // The accepted JSON baseline omits undefined-valued properties. Same-engine
  // exact public values (including undefined) are asserted inside scenario.
  for(const index of [1,2]){assert.deepEqual(candidate.states[index].metadata,baseline.states[index].metadata);assert.deepEqual(candidate.states[index].body,baseline.states[index].body);assert.deepEqual(JSON.parse(JSON.stringify(candidate.states[index].values)),baseline.states[index].values);assert.equal(candidate.states[index].defines,expected.states[index].defines);for(const stage of [0,1])assert.deepEqual(candidate.states[index].prefixes[stage].split('\\n').sort(),baseline.states[index].prefixes[stage].split('\\n').sort());}
  assert.deepEqual(candidate.pluginUniforms,baseline.pluginUniforms);assert.equal(candidate.programs,baseline.programs-1);assert.equal(candidate.extraReferenceReleased,true);
});
test('known unsupported order-sensitive custom processor remains an explicit limitation',async()=>{
  const candidate=await scenario('pbr',true);results.push(candidate);
  assert.match(baselines.customOrderBaseline.vertex,/const syntheticOrderWitness = 2;/);assert.match(candidate.states[1].body.vertex,/const syntheticOrderWitness = 1;/);assert.notDeepEqual(candidate.states[1].body,baselines.customOrderBaseline);
});
${glb}
test('actual tiny GLB and rendering tests share one physical core/loaders identity',async()=>{
  const require=createRequire(import.meta.url),loader=createRequire(require.resolve('@babylonjs/loaders/package.json'));
  assert.equal(realpathSync(require.resolve('@babylonjs/core/package.json')),realpathSync(loader.resolve('@babylonjs/core/package.json')));
  const engine=new NullEngine(),scene=new Scene(engine);let container;
  try{container=await LoadAssetContainerAsync(smallGlb(),scene,{pluginExtension:'.glb'});assert.ok(container.materials.some(m=>m instanceof PBRMaterial));assert.ok(container.meshes.some(m=>m instanceof Mesh&&m.getTotalVertices()===3));assert.ok(container.meshes.every(m=>m.getScene()===scene));}finally{container?.dispose();scene.dispose();engine.dispose();}
});
after(()=>{assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString'),descriptor);if(process.env.DEFINE_ORDER_REPORT)writeFileSync(process.env.DEFINE_ORDER_REPORT,JSON.stringify({results,finishedAt:new Date().toISOString(),scope:'actual patched class; native WGSL processing / NullEngine draw, no GPU proof'},null,2)+'\\n');});
`);
console.log(JSON.stringify({fixture,tests:2}));
