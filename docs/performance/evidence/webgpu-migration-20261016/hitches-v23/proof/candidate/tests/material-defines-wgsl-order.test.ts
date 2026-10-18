import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,realpathSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {MaterialDefines} from '@babylonjs/core/Materials/materialDefines';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {Mesh} from '@babylonjs/core/Meshes/mesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {LoadAssetContainerAsync} from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import {kinds,scenario} from './fixtures/material-defines-order/scenario';
// Preserve the accepted baseline bytes; decompression is test-only and bounded.
const baselineBytes=gunzipSync(readFileSync(new URL('./fixtures/material-defines-order/baseline.json.gz',import.meta.url)),{maxOutputLength:9709634});
assert.equal(baselineBytes.length,9709634);
assert.equal(createHash('sha256').update(baselineBytes).digest('hex'),'355ec327227af96c64c83c354636894d0ba3e5128913d95c9716900294a4896f');
const baselines=JSON.parse(baselineBytes.toString('utf8'));
const descriptor=Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString');
const results:any[]=[];
for(const kind of kinds)test('patched distribution actual native WGSL/order reuse '+kind,async()=>{
  const candidate=await scenario(kind);results.push(candidate);const baseline=(baselines as any)[kind].baseline,expected=(baselines as any)[kind].canonical;
  assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString'),descriptor,'no process-local serializer wrapper');
  // The accepted JSON baseline omits undefined-valued properties. Same-engine
  // exact public values (including undefined) are asserted inside scenario.
  for(const index of [1,2]){assert.deepEqual(candidate.states[index].metadata,baseline.states[index].metadata);assert.deepEqual(candidate.states[index].body,baseline.states[index].body);assert.deepEqual(JSON.parse(JSON.stringify(candidate.states[index].values)),baseline.states[index].values);assert.equal(candidate.states[index].defines,expected.states[index].defines);for(const stage of [0,1])assert.deepEqual(candidate.states[index].prefixes[stage].split('\n').sort(),baseline.states[index].prefixes[stage].split('\n').sort());}
  assert.deepEqual(candidate.pluginUniforms,baseline.pluginUniforms);assert.equal(candidate.programs,baseline.programs-1);assert.equal(candidate.extraReferenceReleased,true);
});
test('known unsupported order-sensitive custom processor remains an explicit limitation',async()=>{
  const candidate=await scenario('pbr',true);results.push(candidate);
  assert.match(baselines.customOrderBaseline.vertex,/const syntheticOrderWitness = 2;/);assert.match(candidate.states[1].body.vertex,/const syntheticOrderWitness = 1;/);assert.notDeepEqual(candidate.states[1].body,baselines.customOrderBaseline);
});
function smallGlb(){const bytes=Buffer.alloc(44);[0,0,0,1,0,0,0,1,0].forEach((v,i)=>bytes.writeFloatLE(v,i*4));[0,1,2].forEach((v,i)=>bytes.writeUInt16LE(v,36+i*2));const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{name:'qa-pbr'}],buffers:[{byteLength:bytes.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};const text=Buffer.from(JSON.stringify(document)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);const out=Buffer.alloc(12+8+padded.length+8+bytes.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);const at=20+padded.length;out.writeUInt32LE(bytes.length,at);out.writeUInt32LE(0x004e4942,at+4);bytes.copy(out,at+8);return new Uint8Array(out);}

test('actual tiny GLB and rendering tests share one physical core/loaders identity',async()=>{
  const require=createRequire(import.meta.url),loader=createRequire(require.resolve('@babylonjs/loaders/package.json'));
  assert.equal(realpathSync(require.resolve('@babylonjs/core/package.json')),realpathSync(loader.resolve('@babylonjs/core/package.json')));
  const engine=new NullEngine(),scene=new Scene(engine);let container;
  try{container=await LoadAssetContainerAsync(smallGlb(),scene,{pluginExtension:'.glb'});assert.ok(container.materials.some(m=>m instanceof PBRMaterial));assert.ok(container.meshes.some(m=>m instanceof Mesh&&m.getTotalVertices()===3));assert.ok(container.meshes.every(m=>m.getScene()===scene));}finally{container?.dispose();scene.dispose();engine.dispose();}
});
after(()=>{assert.deepEqual(Object.getOwnPropertyDescriptor(MaterialDefines.prototype,'toString'),descriptor);if(process.env.DEFINE_ORDER_REPORT)writeFileSync(process.env.DEFINE_ORDER_REPORT,JSON.stringify({results,finishedAt:new Date().toISOString(),scope:'actual patched class; native WGSL processing / NullEngine draw, no GPU proof'},null,2)+'\n');});
