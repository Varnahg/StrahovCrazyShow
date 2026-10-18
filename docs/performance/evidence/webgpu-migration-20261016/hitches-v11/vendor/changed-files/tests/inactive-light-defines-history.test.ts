import test from "node:test";
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {setImmediate} from 'node:timers/promises';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine';
import {Scene} from '@babylonjs/core/scene';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera';
import {Vector3} from '@babylonjs/core/Maths/math.vector';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder';
import '@babylonjs/core/Meshes/instancedMesh';
import {PBRMaterial} from '@babylonjs/core/Materials/PBR/pbrMaterial';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial';
import {Texture} from '@babylonjs/core/Materials/Textures/texture';
import {Light} from '@babylonjs/core/Lights/light';
import {PointLight} from '@babylonjs/core/Lights/pointLight';
import {DirectionalLight} from '@babylonjs/core/Lights/directionalLight';
import {HemisphericLight} from '@babylonjs/core/Lights/hemisphericLight';
import {SpotLight} from '@babylonjs/core/Lights/spotLight';
import {ShadowGenerator} from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import {GetSupportedSimultaneousLights} from '@babylonjs/core/Materials/materialHelper.functions';
import {StableLightState} from '../client/stable-light-state';
import {arePreparationEffectsReady} from '../client/strict-material-preparation';
import '../client/render-shaders';

const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
const sequence=[
  ['night2ON',false,2,true],['day0OFF-first',true,0,false],['day0ON',true,0,true],
  ['day1OFF',true,1,false],['day1ON',true,1,true],['B6OFF',true,1,false],['B6ON',true,1,true],
  ['restore-night1OFF',false,1,false],['runtimeDayOFF',true,0,false],['runtimeDayON',true,0,true],
] as const;
const falloffs=['LIGHT_FALLOFF_PHYSICAL','LIGHT_FALLOFF_GLTF','LIGHT_FALLOFF_STANDARD'];
const limitations=['Representative PBR/Standard geometry, not exact production car or attribution of all31programs', 'NullEngine GLSL frontend and native dummy URL textures; no GPU/actual image/driver pipeline proof', 'CPU instancing capability enabled; actual requested PCF falls back to supported POISSON', 'Fixed camera/material/pass/geometry/alpha/texture metadata, no IBL texture; global production IBL/plugin state remains outside this fixture'];
async function run(falloff:number, globalMode: "physical" | "gltf" | "standard"){
  const engine:any=new NullEngine({renderWidth:800,renderHeight:450,textureSize:16,deterministicLockstep:false,lockstepMaxSteps:1});engine.getCaps().instancedArrays=true;
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera('one main pass',new Vector3(0,3,-9),scene);camera.setTarget(new Vector3(0,1,0));scene.activeCamera=camera;
  const hemi=new HemisphericLight('hemi',Vector3.Up(),scene),sun=new DirectionalLight('sun',new Vector3(0,-1,1),scene);
  const points=[0,1].map(i=>{const p=new PointLight('mapped-point'+i,new Vector3(i*3,3,0),scene);p.falloffType=falloff;return p});
  const b6=new PointLight('B6 point fill',new Vector3(1,2,1),scene);b6.falloffType=falloff;b6.setEnabled(false);
  const torch=new SpotLight('torch',new Vector3(0,3,-4),new Vector3(0,-.2,1),Math.PI/3,2,scene);torch.falloffType=Light.FALLOFF_STANDARD;torch.renderPriority=10;
  const shadow=new ShadowGenerator(32,torch);shadow.usePercentageCloserFiltering=true;shadow.filteringQuality=ShadowGenerator.QUALITY_LOW;
  const stable=new StableLightState(scene),rows:any[]=[],cleaned:any[]=[],subjects:any[]=[],observers:any[]=[];let drawn=new Set<any>();
  const textures:Texture[]=[];
  const originalMethods: [any,any][]=[];
  let stage='construction';
  try{
    for(const[kind,instanced]of [['PBR',false],['Standard',false],['PBR',true],['Standard',true]] as const){
      const name=kind+(instanced?'-alpha-instance':'-opaque');
      const material:any=kind==='PBR'?new PBRMaterial(name,scene):new StandardMaterial(name,scene);material.maxSimultaneousLights=4; if(kind==="PBR"){material.usePhysicalLightFalloff=globalMode==="physical";material.useGLTFLightFalloff=globalMode==="gltf";}
      const source:any=MeshBuilder.CreateBox(name+' source',{size:1},scene);source.material=material;source.position.set(subjects.length*2-3,1,1);source.receiveShadows=true;
      let mesh=source;
      if(instanced){const texture=new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB5kAAAAASUVORK5CYII=',scene);texture.hasAlpha=true;textures.push(texture);assert.equal(texture.isReady(),true);if(kind==='PBR'){material.albedoTexture=texture;material.useAlphaFromAlbedoTexture=true;material.transparencyMode=PBRMaterial.PBRMATERIAL_ALPHATEST;}else{material.diffuseTexture=texture;material.useAlphaFromDiffuseTexture=true;material.transparencyMode=StandardMaterial.MATERIAL_ALPHATEST;}source.isVisible=false;mesh=source.createInstance(name+' actual instance');mesh.position.copyFrom(source.position);}
      subjects.push({name,mesh,source,material,instanced,subMesh:source.subMeshes[0]});
      const observer=source.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId!==camera.renderPassId)return;const s=source._instanceDataStorage,p=s.useMonoDataStorageRenderPass?s.dataStorageRenderPass:s.renderPasses[engine.currentRenderPassId];const batch=p?.batchCache;if(!batch)return;for(const sub of source.subMeshes){if(batch.renderSelf[sub._id])drawn.add(source);for(const i of batch.visibleInstances[sub._id]??[])drawn.add(i)}});observers.push([source,observer]);
      
    }
    shadow.getShadowMap()!.renderList=subjects.map(s=>s.mesh);
    for(const[label,day,pointCount,on]of sequence){
      stage=label;sun.setEnabled(day);torch.setEnabled(on);b6.setEnabled(label.startsWith('B6'));
      for(let i=0;i<points.length;i++)points[i].setEnabled(!label.startsWith('B6')&&i<pointCount);
      for(let attempt=0;attempt<12;attempt++){stable.update();drawn=new Set();scene.render();await setImmediate();if(arePreparationEffectsReady(engine)&&subjects.every(s=>drawn.has(s.mesh)))break;if(attempt===11)throw Error('Frame did not become ready: '+label);}
      for(const s of subjects){
        assert.ok(drawn.has(s.mesh));const sub=s.source.subMeshes[0],effect=sub._getDrawWrapper(camera.renderPassId)?.effect;assert.equal(sub,s.subMesh,'same submesh object throughout sequence');assert.ok(effect?.isReady());
        const flags=Object.fromEntries(Object.keys(sub._getDrawWrapper(camera.renderPassId).defines).filter(k=>/^(LIGHT|POINTLIGHT|DIRLIGHT|HEMILIGHT|SPOTLIGHT|SHADOW)/.test(k)).map(k=>[k,sub._getDrawWrapper(camera.renderPassId).defines[k]]));
        rows.push({stage:label,subject:s.name,materialId:s.material.uniqueId,meshId:s.mesh.uniqueId,subMeshId:sub._id,subMeshIdentityPreserved:true,pass:camera.renderPassId,drawn:true,instances:s.instanced,receiveShadows:s.source.receiveShadows,cap:s.material.maxSimultaneousLights,alpha:s.material.transparencyMode,texture:s.material.getActiveTextures().map((t:any)=>({id:t.uniqueId,alpha:t.hasAlpha,width:t.getSize().width,height:t.getSize().height,type:t.textureType,format:t.textureFormat,sampling:t.samplingMode})),ordered:s.source.lightSources.map((l:any)=>({id:l.uniqueId,name:l.name,type:l.getClassName(),falloff:l.falloffType,priority:l.renderPriority,shadow:!!(l.shadowEnabled&&l.getShadowGenerator()?.getShadowMap()?.renderList?.length),filter:l.getShadowGenerator()?.filter})),effect:{id:effect.uniqueId,disposed:effect.isDisposed,defines:effect.defines,sha:sha(effect.defines)},flags});
      }
    }
    return {rows,cleaned,pass:camera.renderPassId,requestedShadowFilter:'PCF',actualShadowFilter:shadow.filter};
  }finally{for(const[m,original]of originalMethods)m.isReadyForSubMesh=original;for(const[s,o]of observers)s.onAfterRenderObservable.remove(o);stable.dispose();shadow.dispose();for(const t of textures)t.dispose();scene.dispose();engine.dispose();assert.equal(scene.isDisposed,true);}
}

for(const [mode,falloff]of [["standard",Light.FALLOFF_STANDARD],["physical",Light.FALLOFF_PHYSICAL],["gltf",Light.FALLOFF_GLTF]] as const)
for(const globalMode of ["physical","gltf","standard"] as const)
test("native helper history reuse for "+mode+" light / "+globalMode+" PBR mode",async()=>{
 const result=await run(falloff,globalMode);
 for(const subject of [...new Set(result.rows.map(r=>r.subject))]){
  const first=result.rows.find(r=>r.subject===subject&&r.stage==="day0OFF-first")!,last=result.rows.find(r=>r.subject===subject&&r.stage==="runtimeDayOFF")!;
  assert.equal(first.effect.defines,last.effect.defines);assert.equal(first.effect.id,last.effect.id);
  assert.deepEqual(first.ordered,last.ordered);assert.deepEqual(first.texture,last.texture);
  for(const key of ["materialId","meshId","subMeshId","pass","instances","receiveShadows","cap","alpha"] as const)assert.equal(first[key],last[key]);
  for(const row of result.rows.filter(r=>r.subject===subject)){
   assert.equal(row.effect.defines.includes("#define INSTANCES\n"),row.instances);
   assert.equal(row.effect.defines.includes("#define ALPHATEST\n"),row.instances);
   if(subject.startsWith("PBR")){
    assert.equal(row.flags.USEPHYSICALLIGHTFALLOFF,undefined); // Global flags are checked from the complete Effect string.
    assert.equal(row.effect.defines.includes("#define USEPHYSICALLIGHTFALLOFF\n"),globalMode==="physical");
    assert.equal(row.effect.defines.includes("#define USEGLTFLIGHTFALLOFF\n"),globalMode==="gltf");
   }
   for(let i=row.ordered.length;i<row.cap;i++)for(const prefix of falloffs)assert.equal(!!row.flags[prefix+i],false);
  }
 }
});
