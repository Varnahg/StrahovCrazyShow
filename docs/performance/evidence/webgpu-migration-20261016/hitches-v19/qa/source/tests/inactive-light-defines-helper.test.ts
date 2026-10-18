import test from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setImmediate } from 'node:timers/promises';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { Light } from '@babylonjs/core/Lights/light';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { PBRMaterialDefines } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PrepareDefinesForLights, GetSupportedSimultaneousLights } from '@babylonjs/core/Materials/materialHelper.functions';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF';
import '../client/render-shaders';

const flags=['LIGHT_FALLOFF_PHYSICAL','LIGHT_FALLOFF_GLTF','LIGHT_FALLOFF_STANDARD'];
const modes=[['physical',Light.FALLOFF_PHYSICAL,flags[0]],['gltf',Light.FALLOFF_GLTF,flags[1]],['standard',Light.FALLOFF_STANDARD,flags[2]]] as const;
function fixture(){const engine=new NullEngine(),scene=new Scene(engine);scene.shadowsEnabled=false;const camera=new FreeCamera('c',new Vector3(0,1,-5),scene);camera.setTarget(Vector3.Zero());scene.activeCamera=camera;const mesh=MeshBuilder.CreateBox('m',{},scene);const lights=Array.from({length:4},(_,i)=>new PointLight('p'+i,new Vector3(i,3,1),scene));return{engine,scene,mesh,lights,dispose(){scene.dispose();engine.dispose();}}}
for(const[name,falloff,selected]of modes)test('actual helper inactive/cap/disabled/reactivation '+name,()=>{
 const f=fixture();try{for(const l of f.lights)l.falloffType=falloff;const d:any=new PBRMaterialDefines();d.USEPHYSICALLIGHTFALLOFF=true;d.USEGLTFLIGHTFALLOFF=false;
 const prepare=(cap:number,disabled=false)=>{d.markAsLightDirty();PrepareDefinesForLights(f.scene,f.mesh,d,true,cap,disabled);assert.equal(d.USEPHYSICALLIGHTFALLOFF,true);assert.equal(d.USEGLTFLIGHTFALLOFF,false);};
 const inactive=(from:number)=>{for(let i=from;i<4;i++)for(const flag of flags)assert.equal(d[flag+i],false);};
 prepare(4);for(let i=0;i<4;i++)assert.equal(d[selected+i],true);
 prepare(2);assert.equal(d.LIGHTCOUNT,2);inactive(2);assert.equal(d[selected+'0'],true);assert.equal(d[selected+'1'],true);
 prepare(4);for(let i=0;i<4;i++)assert.equal(d[selected+i],true);
 prepare(4,true);assert.equal(d.LIGHTCOUNT,0);inactive(0);
 prepare(4);f.scene.lightsEnabled=false;prepare(4);inactive(0);f.scene.lightsEnabled=true;prepare(4);
 f.lights[2].setEnabled(false);f.lights[3].setEnabled(false);prepare(4);inactive(2);
 f.lights[2].setEnabled(true);prepare(4);assert.equal(d[selected+'2'],true);inactive(3);
 // Unsupported/cap-excluded indices are deliberately outside this patch's loop.
 d.LIGHT_FALLOFF_STANDARD99=true;prepare(4);assert.equal(d.LIGHT_FALLOFF_STANDARD99,true);
 d.markAsProcessed();d._areLightsDirty=false;d[selected+'3']=true;const before=d.toString();PrepareDefinesForLights(f.scene,f.mesh,d,true,4,true);assert.equal(d.toString(),before,'dirty=false stays a complete no-op');
 }finally{f.dispose();}
});
for(const MaterialClass of [PBRMaterial,StandardMaterial])test('frozen fastpath stays unchanged and unfreeze cleans '+MaterialClass.name,async()=>{
 const f=fixture();try{
  for(const l of f.lights)l.falloffType=Light.FALLOFF_GLTF;
  const material=new MaterialClass('frozen',f.scene);f.mesh.material=material;material.maxSimultaneousLights=4;
  const sub=f.mesh.subMeshes![0];
  for(let attempt=0;attempt<8;attempt+=1){f.scene.render();await setImmediate();}
  const before=sub.effect!;assert.ok(before.isReady());material.freeze();
  f.lights[2].setEnabled(false);f.lights[3].setEnabled(false);
  // Test the actual frozen readiness fastpath. Drawing an intentionally stale
  // frozen shader after removing light bindings already hangs unpatched
  // NullEngine; that separate behavior is not claimed as acceptance here.
  assert.equal(material.isReadyForSubMesh(f.mesh,sub,false),true);
  assert.equal(sub.effect,before,'do not bypass the native frozen fastpath');material.unfreeze();f.scene.render();
  for(let i=2;i<4;i++)for(const flag of flags)assert.equal((sub.materialDefines as any)[flag+i],false);
 }finally{f.dispose();}
});
test('actual capability clamp clears previous slots and reactivation restores them',()=>{
 const f=fixture();const caps=f.engine.getCaps(),old=caps.maxUniformBuffersPerShaderStage;
 try{for(const l of f.lights)l.falloffType=Light.FALLOFF_PHYSICAL;const d:any=new PBRMaterialDefines();
 caps.maxUniformBuffersPerShaderStage=8;assert.equal(GetSupportedSimultaneousLights(f.scene,4),4);PrepareDefinesForLights(f.scene,f.mesh,d,true,4);assert.equal(d.LIGHT_FALLOFF_PHYSICAL3,true);
 caps.maxUniformBuffersPerShaderStage=6;assert.equal(GetSupportedSimultaneousLights(f.scene,4),2);d.markAsLightDirty();PrepareDefinesForLights(f.scene,f.mesh,d,true,4);assert.equal(d.LIGHTCOUNT,2);assert.equal(d.MAXLIGHTCOUNT,2);for(let i=2;i<4;i++)for(const flag of flags)assert.equal(d[flag+i],false);
 caps.maxUniformBuffersPerShaderStage=8;d.markAsLightDirty();PrepareDefinesForLights(f.scene,f.mesh,d,true,4);assert.equal(d.LIGHTCOUNT,4);assert.equal(d.LIGHT_FALLOFF_PHYSICAL3,true);
 }finally{caps.maxUniformBuffersPerShaderStage=old;f.dispose();}
});
function smallGlb(){const bytes=Buffer.alloc(44);[0,0,0,1,0,0,0,1,0].forEach((v,i)=>bytes.writeFloatLE(v,i*4));[0,1,2].forEach((v,i)=>bytes.writeUInt16LE(v,36+i*2));const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1,material:0}]}],materials:[{name:'qa-pbr'}],buffers:[{byteLength:bytes.length}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36,target:34962},{buffer:0,byteOffset:36,byteLength:6,target:34963}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};const text=Buffer.from(JSON.stringify(document)),padded=Buffer.alloc(Math.ceil(text.length/4)*4,32);text.copy(padded);const out=Buffer.alloc(12+8+padded.length+8+bytes.length);out.writeUInt32LE(0x46546c67,0);out.writeUInt32LE(2,4);out.writeUInt32LE(out.length,8);out.writeUInt32LE(padded.length,12);out.writeUInt32LE(0x4e4f534a,16);padded.copy(out,20);const at=20+padded.length;out.writeUInt32LE(bytes.length,at);out.writeUInt32LE(0x004e4942,at+4);bytes.copy(out,at+8);return new Uint8Array(out);}
test('real tiny GLB loader resolves one physical QA core class identity',async()=>{
 const require=createRequire(import.meta.url),loaderRequire=createRequire(require.resolve('@babylonjs/loaders/package.json'));
 const core=realpathSync(require.resolve('@babylonjs/core/package.json'));assert.equal(realpathSync(loaderRequire.resolve('@babylonjs/core/package.json')),core);
 const f=fixture();let container;try{container=await LoadAssetContainerAsync(smallGlb(),f.scene,{pluginExtension:'.glb'});assert.ok(container.materials.some(m=>m instanceof PBRMaterial));assert.ok(container.meshes.some(m=>m instanceof Mesh&&m.getTotalVertices()===3));assert.ok(container.meshes.every(m=>m.getScene()===f.scene));}finally{container?.dispose();f.dispose();}
});
