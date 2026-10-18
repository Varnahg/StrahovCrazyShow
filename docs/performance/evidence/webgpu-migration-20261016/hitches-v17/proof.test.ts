import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Frustum } from '@babylonjs/core/Maths/math.frustum';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import { B6RealityController } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/b6-reality';
import { GltfLightBudget } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/gltf-light-budget';
import { StableLightState } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/stable-light-state';
import { PlayerFlashlight } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/flashlight';
import { applyArtLighting } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/art-lighting';
import { applyCampusSkyIntensity, campusShadowResponse, campusBloomResponse, solarShadowsEnabled } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/cinematic';
import { sunState, moonState, windVector } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/weather';
import { B6_LAYOUT } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/b6-interior';

const base = new URL('../../webgpu-hitch-validation-20261017/inactive-light-v4/', import.meta.url);
const sha = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const inputs: Record<string, string> = {};
const read = (file: string) => { const bytes=readFileSync(new URL(file,base)); inputs[file]=sha(bytes); return bytes; };
const manifest = JSON.parse(read('source-manifest.json').toString());
assert.equal(manifest.snapshotId,'bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0');
function source(file: string) {
  const bytes=read(file); assert.equal(sha(bytes),manifest.files[file],`frozen source ${file}`);
  return ts.createSourceFile(file,bytes.toString(),ts.ScriptTarget.Latest,true);
}
function selectedClass(file: string, name: string, names: string[], env: Record<string,unknown>, functions: string[] = []) {
  const ast=source(file), cls=ast.statements.find((n):n is ts.ClassDeclaration=>ts.isClassDeclaration(n)&&n.name?.text===name)!;
  const members=cls.members.filter(n=>n.name&&names.includes(n.name.getText(ast)));
  assert.equal(members.length,names.length);
  const declarations=ast.statements.filter(n=>ts.isFunctionDeclaration(n)?functions.includes(n.name?.text??''):ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>functions.includes(d.name.getText(ast))));
  assert.equal(declarations.length,functions.length);
  const code=ts.transpileModule(`${declarations.map(n=>n.getText(ast).replace(/^export /,'')).join('\n')}\nclass Selected {${members.map(n=>n.getText(ast)).join('\n')}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022,useDefineForClassFields:false}}).outputText;
  return new Script(`(function(${Object.keys(env).join(',')}){${code};return Selected;})`).runInThisContext()(...Object.values(env));
}
const Game = selectedClass('client/game.ts','Game',['updateWorldPresentation','updateRenderEnvironment','isMeshReadyForCamera'],{applyArtLighting,zoneAt(){throw Error('Unexpected precipitation branch')}});
const Sky = selectedClass('client/sky-weather.ts','SkyWeatherController',['observer','direction','right','up','back','light','worldUp','lastInstant','initialized','state','placeDisc','update'],{Vector3,Quaternion,sunState,moonState,windVector},['clamp','mix','moonDiscLightVector']);
const Cinematic = selectedClass('client/cinematic.ts','CinematicAtmosphere',['update'],{Vector3,Constants,applyCampusSkyIntensity,campusShadowResponse,campusBloomResponse,solarShadowsEnabled},['clamp','SHADOW_SPAN','writeSnappedShadowFocus']);
for(const file of ['client/b6-reality.ts','shared/b6-interior.ts','shared/b6-entry.ts','shared/b6-stair-materials.ts','shared/b6-facade-plan.ts','shared/render-quality.ts','client/flashlight.ts','client/vehicle-lighting.ts','client/static-submesh-shadows.ts','client/gltf-light-budget.ts','client/stable-light-state.ts','client/art-lighting.ts','client/b6-exterior-concrete.ts','shared/weather.ts']) source(file);
for(const file of ['@babylonjs/core/package.json','@babylonjs/core/Materials/materialHelper.functions.js','@babylonjs/core/Materials/materialDefines.js','@babylonjs/core/Materials/effect.pure.js','@babylonjs/core/Materials/PBR/pbrBaseMaterial.pure.js','@babylonjs/core/Meshes/mesh.pure.js','@babylonjs/core/Engines/nullEngine.pure.js','@babylonjs/core/Engines/thinEngine.pure.js','@babylonjs/core/Engines/webgpuEngine.pure.js','@babylonjs/loaders/package.json']) {
  const url=new URL(`node_modules/${file}`,import.meta.url); inputs[`dependency/${file}`]=sha(readFileSync(url));
  assert.equal(realpathSync(url),realpathSync(new URL(`node_modules/${file}`,base)),`single pinned module identity: ${file}`);
}
assert.equal(inputs['dependency/@babylonjs/core/Materials/materialHelper.functions.js'],'a6d21d15070f52d3a94ec7fd40eb22356a76a723165ce05afa67dbeded0e88ac');
assert.equal(sha(read('../async-inactive-light-v4-normal-b6-1-session.jsonl')),'8391e9ab2983c6f909d6e0553bf1d38e3a45285cb34d1bb349cce286b5cfd4da');
const benchmarks = Object.fromEntries(['first-f','outward','exit'].map(name=>[name,JSON.parse(read(`../inactive-light-v4-normal-b6-1-${name}-benchmark.json`).toString())]));
const inward=benchmarks['first-f'].sceneView, outward=benchmarks.outward.sceneView, outside=benchmarks.exit.sceneView;
const weather=benchmarks.exit.weatherAtEnd, instant=outside.lightingInstant;
assert.equal(instant,1792317600000); assert.equal(weather.cloud,.96); assert.equal(weather.rain,0);
for(const benchmark of Object.values(benchmarks) as any[]) {
  assert.equal(benchmark.quality,'medium'); assert.equal(benchmark.sceneView.lightingInstant,instant);
}
const rows: any[]=[];
const report:any={snapshot:manifest.snapshotId,startedAt:new Date().toISOString(),inputs,rows,limitations:[
  'Actual original B6 controller/merged factory, material, light budget/order, camera-pass mesh readiness and Babylon CPU draw frontend. NullEngine GLSL frontend is not WebGPU WGSL/pipeline creation, rasterization, performance or full-world coverage.',
  'No loadProps, buildings/trees/traffic/world/avatars; the B6 controller alone owns all original structural geometry. One real target merged mesh is asserted, no proxy geometry.',
  'Sky sun/moon/weather state methods and Game environment method are unchanged. Raster-only sun/moon material sinks and TransformNodes replace sky discs; authored reflection cube IO is a no-op and no IBL texture is installed. Cinematic update is unchanged, quality preset medium prevents pipeline creation; unexpected glass or celestial caster selection throws.',
  'PlayerFlashlight/VehicleLighting uses its actual camera-origin path with valid empty root/elbow handles. No actual Alex rig, skinning or hand-animation pose. Raw third-person transient elbow/beam pose is not reconstructible; this does not establish exact shadow draw coverage.',
  'Original NullEngine texture semantics retained: URL textures are synthesized 16x16; room plaque RawTextures stay not-uploaded. Target material has no textures. No readiness/draw/light setter is replaced.',
  'Shared final light/material/geometry state comparisons isolate history. The raw record has no full per-submesh defines, so no claim that the fixture Effect ID maps to raw417/477 or every exit program.'
]};
function diff(a:string,b:string) {
  const first=a.split('\n'),second=b.split('\n');
  return {exact:a===b,removed:first.filter(s=>s&&!second.includes(s)),added:second.filter(s=>s&&!first.includes(s)),orderChanges:first.flatMap((s,i)=>s===second[i]?[]:[{line:i+1,before:s,after:second[i]??null}])};
}

async function withFixture(name:string, body:(f:any)=>Promise<void>) {
  const engine:any=new NullEngine({renderWidth:1512,renderHeight:642,textureSize:16,deterministicLockstep:false,lockstepMaxSteps:1});
  const scene=new Scene(engine); scene.useRightHandedSystem=true; scene.fogMode=Scene.FOGMODE_EXP;
  const camera=new FreeCamera('actual main camera',Vector3.Zero(),scene); camera.fov=.85;camera.minZ=.08;camera.maxZ=1100;scene.activeCamera=camera;
  const ambient=new HemisphericLight('sky',Vector3.Up(),scene),sun=new DirectionalLight('sun',Vector3.Down(),scene);
  const loaderObserversBefore=SceneLoader.OnPluginActivatedObservable.observers.length;
  const budget:any=new GltfLightBudget(scene),stable:any=new StableLightState(scene);
  let b6:any,torch:any,shadow:any;
  const observers:[any,any][]=[]; const effects=new Set<any>();const branch:any={name,rows:[],events:[]};rows.push(branch);
  let label='construction',draws=0;
  try {
    b6=new B6RealityController(scene); torch=new PlayerFlashlight(scene);
    const witness:any=scene.getMeshByName('b6 floor 0 b6 stair:entry-dark-metal');
    assert.ok(witness);assert.equal(witness.material.name,'b6 stair:entry-dark-metal');assert.equal(witness.receiveShadows,false);assert.equal(witness.isAnInstance,false);assert.equal(witness.subMeshes.length,1);assert.equal(witness.material.getActiveTextures().length,0);
    const material:any=witness.material,sub:any=witness.subMeshes[0];
    const geometry=()=>({name:witness.name,metadata:witness.metadata,receiveShadows:witness.receiveShadows,isInstance:witness.isAnInstance,thinInstances:witness.hasThinInstances,vertices:witness.getTotalVertices(),indices:sha(JSON.stringify(Array.from(witness.getIndices()))),buffers:Object.fromEntries(witness.getVerticesDataKinds().map((kind:string)=>[kind,sha(JSON.stringify(Array.from(witness.getVerticesData(kind))))])),submesh:{id:sub._id,materialIndex:sub.materialIndex,verticesStart:sub.verticesStart,verticesCount:sub.verticesCount,indexStart:sub.indexStart,indexCount:sub.indexCount}});
    branch.geometry=geometry();branch.material={name:material.name,class:material.getClassName(),cap:material.maxSimultaneousLights,alpha:material.alpha,transparency:material.transparencyMode};
    branch.b6={structuralMeshes:b6.stats.structuralMeshes,loadedAssets:b6.stats.loadedAssets,foundation:B6_LAYOUT.foundationOffset,entry:B6_LAYOUT.entry};
    const observe=(observable:any,callback:any)=>observers.push([observable,observable.add(callback)]);
    observe(witness.onAfterRenderObservable,()=>{if(engine.currentRenderPassId===camera.renderPassId)draws++});
    observe(material.onEffectCreatedObservable,({effect,subMesh}:any)=>{effects.add(effect);branch.events.push({label,pass:engine.currentRenderPassId,effect:effect.uniqueId,sha:sha(effect.defines),submesh:subMesh?._id,mesh:subMesh?.getMesh()?.name});});
    const skyMat=new StandardMaterial('sky raster IO',scene);skyMat.disableLighting=true;
    const atmosphere={material:skyMat,update(){},dispose(){skyMat.dispose()}};
    const sink:any={setFloat(){return this},setVector3(){return this},setColor3(){return this}};
    const sky=Object.assign(new Sky(),{scene,atmosphere,sunMaterial:sink,moonMaterial:sink,sunDisc:new TransformNode('sun IO',scene),moonDisc:new TransformNode('moon IO',scene)});
    sky.sunDisc.rotationQuaternion=Quaternion.Identity();sky.moonDisc.rotationQuaternion=Quaternion.Identity();
    shadow=new ShadowGenerator(1024,sun);
    const cinematic=Object.assign(new Cinematic(),{scene,sun,shadow,quality:'medium',disposed:false,stats:{skyUpdates:0},shadowFocus:{focus:Vector3.Zero(),direction:Vector3.Zero(),texel:0},timer:0,environmentTimer:0,lastSky:new Color3(),lastHorizon:new Color3(),configureGlass(){throw Error('Unexpected glass branch')},selectCasters(){throw Error('Unexpected celestial shadow branch')},reflectionData(){return{faces:[],polynomial:null}},environment:{update(){},sphericalPolynomial:null}});
    const rig:any={root:new TransformNode('empty rig root IO',scene),rightElbow:new TransformNode('empty elbow IO',scene)};rig.rightElbow.parent=rig.root;
    const car=new TransformNode('inactive car IO',scene);car.setEnabled(false);
    const game=Object.assign(new Game(),{engine,scene,camera,ambient,sun,lights:[],lamps:new StandardMaterial('lamps IO',scene),clouds:[],quality:'medium',weather,skyWeather:sky,cinematic,actor:{vehicle:false},avatars:new Map(),localId:'local',car,b6Reality:b6,flashlight:torch});
    const state=(view:any,away=false)=>{
      const world=Matrix.FromArray(view.camera.viewMatrix).invert();
      camera.position.set(view.camera.position.x,view.camera.position.y,view.camera.position.z);
      const target=Vector3.TransformCoordinates(new Vector3(0,0,away?1:-1),world);camera.setTarget(target);camera.getViewMatrix(true);camera.getProjectionMatrix(true);
      game.updateWorldPresentation(view.position);
      game.updateRenderEnvironment(view.position,rig,true,0,0,instant,true);
      budget.prepareFrame();stable.update();
      assert.equal(cinematic.stats.shadowSource,'none');assert.equal(sun.shadowEnabled,false);assert.equal(material.maxSimultaneousLights,4);
      assert.deepEqual(geometry(),branch.geometry);
      return witness.isInFrustum(Frustum.GetPlanes(camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true))));
    };
    const light=(l:any)=>({name:l.name,type:l.getTypeID(),falloff:l.falloffType,enabled:l.isEnabled(),intensity:l.intensity,priority:l.renderPriority,range:l.range,shadow:l.shadowEnabled,filter:l.getShadowGenerator()?.filter??null,lightmap:l.lightmapMode,specular:l.specular.asArray()});
    const sample=(stage:string,extra:any={})=>{
      const wrapper=sub._getDrawWrapper(camera.renderPassId),effect=wrapper?.effect;
      const defineValues=wrapper?.defines?Object.fromEntries(Object.entries(wrapper.defines).filter(([key])=>!key.startsWith('_')).sort(([a],[b])=>a.localeCompare(b))):null;
      if(effect)effects.add(effect);
      const row={stage,...extra,draws,cameraPass:camera.renderPassId,camera:{position:camera.position.asArray(),target:camera.getTarget().asArray()},enabled:witness.isEnabled(),attached:scene.meshes.includes(witness),active:scene.getActiveMeshes().data.slice(0,scene.getActiveMeshes().length).includes(witness),b6:b6.interiorLightEnabled,lightSources:witness.lightSources.map(light),sceneLights:scene.lights.map(light),cap:material.maxSimultaneousLights,receiveShadows:witness.receiveShadows,defineValues,defineKeys:wrapper?.defines?._keys?.slice()??null,effect:effect?{id:effect.uniqueId,ready:effect.isReady(),disposed:effect.isDisposed,defines:effect.defines,sha:sha(effect.defines),keySha:sha(effect._key)}:null,budget:{...budget.stats},ordering:{...stable.stats}};
      branch.rows.push(row);return row;
    };
    const draw=async(stage:string,view:any,away=false)=>{
      label=stage;const inFrustum=state(view,away);let attempts=0;
      for(;attempts<12;attempts++){
        draws=0;budget.prepareFrame();stable.update();scene.render();await setImmediate();
        const effect=sub._getDrawWrapper(camera.renderPassId)?.effect;
        if(away||draws&&effect?.isReady())break;
      }
      const row=sample(stage,{inFrustum,attempts:attempts+1});
      if(away){assert.equal(inFrustum,false);assert.equal(draws,0)}else{assert.ok(inFrustum);assert.ok(draws>0,stage+' actual camera pass');assert.equal(row.effect?.ready,true);assert.equal(row.effect?.disposed,false)}
      return row;
    };
    const precheck=async(stage:string,view:any)=>{
      label=stage;assert.equal(state(view,true),false);draws=0;
      const passBefore=engine.currentRenderPassId;let ready=false,attempts=0;
      for(;attempts<12;attempts++){ready=game.isMeshReadyForCamera(witness);assert.equal(engine.currentRenderPassId,passBefore);await setImmediate();if(ready)break;}
      assert.ok(ready);assert.equal(draws,0);
      return sample(stage,{precheckReady:ready,attempts:attempts+1,inFrustum:false,restoredPass:passBefore});
    };
    await body({branch,state,draw,precheck,sample,game,witness,sub,material,engine,camera});
  } catch(error) {
    branch.failure=error instanceof Error?error.stack:String(error);throw error;
  } finally {
    for(const [observable,observer]of observers)observable.remove(observer);observers.length=0;
    stable.dispose();budget.dispose();torch?.dispose();b6?.dispose();shadow?.dispose();scene.dispose();
    // ThinEngine cache hits increment Effect._refCount. Several original B6
    // materials share an Effect, and scene disposal does not force cached
    // history variants. This isolated engine owns all of them: release the
    // remaining cache entries explicitly after every mesh/material is gone.
    const cachedEffects=new Set<any>([...Object.values(engine._compiledEffects),...effects]);
    for(const effect of cachedEffects){assert.equal(effect.getEngine(),engine);effect.dispose(true)}
    cachedEffects.clear();engine.dispose();
    // Observable.remove marks entries immediately, then physically detaches at
    // the native deferred boundary. Let those original callbacks settle.
    await setImmediate();
    branch.cleanup={sceneDisposed:scene.isDisposed,engineDisposed:engine.isDisposed,ownObservers:observers.length,budgetMaterials:budget.materials.size,budgetLoads:budget.activeLoads.size,stableLightObservers:stable.lightObservers.size,loaderObserversBefore,loaderObserversAfter:SceneLoader.OnPluginActivatedObservable.observers.length,effects:[...effects].map(e=>({id:e.uniqueId,disposed:e.isDisposed}))};
    assert.equal(scene.isDisposed,true);assert.equal(engine.isDisposed,true);assert.equal(budget.materials.size,0);assert.equal(budget.activeLoads.size,0);assert.equal(stable.lightObservers.size,0);assert.ok([...effects].every(e=>e.isDisposed));effects.clear();
    assert.equal(SceneLoader.OnPluginActivatedObservable.observers.length,loaderObserversBefore);
  }
}

let reference:any,insideReference:any;
test('fresh outside ON: actual merged box, S/D/H and original geometry',async()=>withFixture('fresh-outside',async f=>{
  reference=await f.draw('fresh-outside-on',outside);
  assert.deepEqual(reference.lightSources.map((l:any)=>l.type),[2,1,3]);assert.equal(reference.b6,false);
  assert.match(reference.effect.defines,/#define SPOTLIGHT0/);assert.match(reference.effect.defines,/#define DIRLIGHT1/);assert.match(reference.effect.defines,/#define HEMILIGHT2/);assert.doesNotMatch(reference.effect.defines,/#define POINTLIGHT\d/);
}));
test('inside/outward/exit history: final full defines equal fresh outside; repeated Effects reused',async()=>withFixture('history',async f=>{
  const a=await f.draw('inside-inward-on',inward),b=await f.draw('inside-outward-on',outward),c=await f.draw('outside-on-1',outside),d=await f.draw('inside-on-2',outward),e=await f.draw('outside-on-2',outside);
  insideReference=b;
  assert.deepEqual(a.lightSources.map((l:any)=>l.type),[2,0,1,3]);assert.deepEqual(b.lightSources,a.lightSources);assert.equal(a.effect.defines,b.effect.defines);assert.equal(a.effect.id,b.effect.id);
  assert.deepEqual(c.lightSources,reference.lightSources);assert.equal(c.effect.defines,reference.effect.defines);assert.equal(e.effect.defines,c.effect.defines);assert.equal(e.effect.id,c.effect.id);assert.equal(d.effect.id,a.effect.id);assert.notEqual(c.effect.id,a.effect.id);
  for(const key of Object.keys(reference.defineValues))assert.equal(c.defineValues[key],reference.defineValues[key],`shared outside value ${key}`);
  const retainedInactiveKeys=Object.keys(c.defineValues).filter(key=>!Object.hasOwn(reference.defineValues,key));
  assert.ok(retainedInactiveKeys.length>0);
  for(const key of retainedInactiveKeys)assert.equal(c.defineValues[key],false,`inactive history key ${key}`);
  f.branch.outsideInactiveKeyHistory={retainedInactiveKeys,allFalse:true,emittedFullStringIdentical:true};
  f.branch.insideToOutside=diff(a.effect.defines,c.effect.defines);f.branch.freshVsHistory=diff(reference.effect.defines,c.effect.defines);
}));
test('hidden camera-pass readiness creates current shader without a draw; later draw reuses it',async()=>withFixture('hidden-precheck',async f=>{
  // The same raw outside camera, turned exactly away; all original bounds stay untouched.
  f.state(outside,true);assert.equal(f.sub._getDrawWrapper(f.camera.renderPassId)?.effect??null,null);
  const prepared=await f.precheck('outside-hidden-precheck',outside);assert.equal(prepared.effect?.ready,true);assert.equal(prepared.effect.defines,reference.effect.defines);
  const actual=await f.draw('outside-visible-after-precheck',outside);assert.equal(actual.effect.id,prepared.effect.id);assert.equal(actual.effect.defines,prepared.effect.defines);
  const inside=await f.draw('inside-outward-after-precheck',outward),exit=await f.draw('outside-after-inside',outside);
  assert.notEqual(inside.effect.id,prepared.effect.id);assert.equal(exit.effect.id,prepared.effect.id);assert.equal(exit.effect.defines,reference.effect.defines);
  assert.deepEqual(inside.lightSources,insideReference.lightSources);
  assert.deepEqual(inside.defineValues,insideReference.defineValues,'all actual public define keys/values, including false and numeric values');
  // This comparison uses only existing branches: MaterialDefines._keys keeps
  // property insertion order when LIGHT3 is introduced after LIGHTCOUNT.
  const before=insideReference.effect.defines.split('\n'),later=inside.effect.defines.split('\n');
  assert.deepEqual([...before].sort(),[...later].sort(),'identical active names/values');
  assert.notEqual(inside.effect.defines,insideReference.effect.defines,'history changes line order for newly introduced slot3');
  const order=diff(insideReference.effect.defines,inside.effect.defines);
  assert.deepEqual(order.removed,[]);assert.deepEqual(order.added,[]);
  assert.deepEqual(order.orderChanges.map(r=>r.before),['#define LIGHT3','#define HEMILIGHT3','#define LIGHTCOUNT 4','#define MAXLIGHTCOUNT 4']);
  f.branch.insideOrderingHistory=order;
  f.branch.precheckCoverage='Shader Effect only. No first draw, WebGPU pipeline descriptor or submitted work at precheck.';
}));
test('exception path releases original controller, lights, observers and Effects',async()=>{
  await assert.rejects(withFixture('injected-failure',async f=>{await f.draw('before-injected-failure',outside);throw new Error('owned sentinel failure')}),/owned sentinel failure/);
});
after(()=>{report.finishedAt=new Date().toISOString();writeFileSync(new URL('report.json',import.meta.url),JSON.stringify(report,null,2)+'\n')});
