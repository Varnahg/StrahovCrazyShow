import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Script } from 'node:vm';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Light } from '@babylonjs/core/Lights/light';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { AvatarPrimitivePool, createAvatarRig } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/avatar-renderer';
import { AvatarLodController } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/avatar-lod';
import { AvatarAnimator } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/animation';
import { applyAvatarPreset } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/avatar-presets';
import { DEFAULT_AVATAR } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/types';
import { PlayerFlashlight } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/flashlight';
import { StableLightState } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/stable-light-state';
import { LocalAvatarPresentation } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/local-avatar-presentation';
import { clampOrbitPitch } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/camera-look';
import { writeVector3 } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/transform-updates';
import { applyArtLighting } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/art-lighting';
import { selectLightingPreview } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/lighting-preview';
import { sunState, moonState, windVector } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/weather';
import { B6_LAYOUT, B6_ENTRY_PACK, B6_STAIR_CORES } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/b6-interior';
import { LAMP_PLACEMENTS } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/streets';
import { renderBudget } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/render-quality';
import { SPAWN } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/shared/world';
import { arePreparationEffectsReady } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/strict-material-preparation';
import { applyCampusSkyIntensity, campusShadowResponse, campusBloomResponse, solarShadowsEnabled } from '../../webgpu-hitch-validation-20261017/b6-preparation-v1/client/cinematic';

const sourceRoot = new URL('../../webgpu-hitch-validation-20261017/b6-preparation-v1/', import.meta.url);
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const sources: Record<string, string> = {};
function ast(file: string) {
  const text = readFileSync(new URL(file, sourceRoot), 'utf8'); sources[file] = sha(text);
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
}
function makeClass(file: string, name: string, names: string[], environment: Record<string, unknown>, constructor = '', preNames: string[] = []) {
  const source = ast(file), cls = source.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === name)!;
  const members = cls.members.filter(n => n.name && names.includes(n.name.getText(source)));
  assert.equal(members.length, names.length);
  const before = source.statements.filter(n => ts.isFunctionDeclaration(n) ? preNames.includes(n.name?.text ?? '') : ts.isVariableStatement(n) && n.declarationList.declarations.some(d => preNames.includes(d.name.getText(source)))).map(n => n.getText(source).replace(/^export /, '')).join('\n');
  const code = ts.transpileModule(`${before}\nclass Selected { ${constructor}\n${members.map(n => n.getText(source)).join('\n')} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, useDefineForClassFields: false } }).outputText;
  return new Script(`(function(${Object.keys(environment).join(',')}){${code};return Selected;})`).runInThisContext()(...Object.values(environment));
}
function evaluate(code: string, environment: Record<string, unknown>) {
  const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Script(`(function(${Object.keys(environment).join(',')}){${compiled}})`).runInThisContext()(...Object.values(environment));
}
const gameAst = ast('client/game.ts'), gameClass = gameAst.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === 'Game')!;
const prepare = gameClass.members.find(n => n.name?.getText(gameAst) === 'prepareLighting') as ts.MethodDeclaration;
const applyDecl = prepare.body!.statements.find(n => ts.isVariableStatement(n) && n.declarationList.declarations.some(d => d.name.getText(gameAst) === 'apply'))!;
// The exact existing local apply closure becomes a test callable; its body is unchanged.
const makeApply = evaluate(`return function(){ ${applyDecl.getText(gameAst)}; return apply; };`, { Vector3 });
const b6Ast = ast('client/b6-reality.ts'), b6Class = b6Ast.statements.find((n): n is ts.ClassDeclaration => ts.isClassDeclaration(n) && n.name?.text === 'B6RealityController')!;
const b6Constructor = b6Class.members.find(ts.isConstructorDeclaration)!;
const lightStart = b6Constructor.body!.statements.findIndex(n => n.getText(b6Ast).startsWith('this.light = new PointLight'));
const lightSetup = b6Constructor.body!.statements.slice(lightStart).map(n => n.getText(b6Ast)).join('\n');
const streets = ast('client/streets-renderer.ts');
let lightBlock: ts.Block | undefined;
function findLight(node: ts.Node) {
  if (ts.isBlock(node) && node.statements.some(s => s.getText(streets).startsWith('const light = new PointLight'))) lightBlock = node;
  ts.forEachChild(node, findLight);
}
findLight(streets); assert.ok(lightBlock);
const lampStart = lightBlock.statements.findIndex(n => n.getText(streets).startsWith('const light = new PointLight'));
const createMappedLight = evaluate(`return function(lamp,context){const dx=Math.sin(lamp.yaw),dz=Math.cos(lamp.yaw);${lightBlock.statements.slice(lampStart).map(n => n.getText(streets)).join('\n')}};`, { PointLight, Vector3, Color3, Light });
const benchmark = JSON.parse(readFileSync(new URL('../../webgpu-hitch-validation-20261017/b6-candidate-inside-first-f-benchmark.json', import.meta.url), 'utf8'));
const weather = Object.freeze(benchmark.weatherAtEnd), day = benchmark.sceneView.lightingInstant;
const now = Date.parse('2026-10-17T22:04:36Z'); class FrozenDate extends Date { static now() { return now; } }
const engine: any = new NullEngine({ renderWidth: 1512, renderHeight: 642, textureSize: 16, deterministicLockstep: false, lockstepMaxSteps: 1 });
Object.assign(engine.getCaps(), { instancedArrays: true, standardDerivatives: true, textureFloat: true, textureFloatLinearFiltering: true, textureFloatRender: true });
const scene = new Scene(engine); scene.useRightHandedSystem = true;
const report: any = { startedAt: new Date().toISOString(), sources, sourceSnapshotId: 'a94ea6ced62b1aa5a3e7c5f94aa4884cce83f30bb5063cda2e4e126507f4eb78', rows: [], limitations: [] };
// Explicit, coordinator-approved CPU upload-completion adapter. NullEngine's
// raw uploader retains bytes/metadata but never signals upload completion.
// Keep that exact native allocation and metadata; replace only the missing IO
// completion signal. No material, shader or Effect readiness method is changed.
const rawUpload = engine.createRawTexture;
const rawTextures: any[] = [];
report.rawUploadIO = [];
engine.createRawTexture = function(...args: any[]) {
  const texture = rawUpload.apply(this,args);
  const metadata = () => ({ width:texture.width,height:texture.height,baseWidth:texture.baseWidth,baseHeight:texture.baseHeight,format:texture.format,type:texture.type,samplingMode:texture.samplingMode,generateMipMaps:texture.generateMipMaps,invertY:texture.invertY,useSRGBBuffer:texture._useSRGBBuffer,bytes:texture._bufferView?.byteLength??null });
  const before = metadata(); texture.isReady = true;
  assert.deepEqual(metadata(),before);
  rawTextures.push(texture);
  report.rawUploadIO.push({id:texture.uniqueId,...before,dataSha:sha(Buffer.from(args[0].buffer,args[0].byteOffset,args[0].byteLength)),boundary:'NullEngine raw-upload completion; GPU upload not performed'});
  return texture;
};
let pool: AvatarPrimitivePool | undefined, stable: StableLightState | undefined, game: any, b6: any;
const observers: [any, any][] = [];
try {
  const camera = new FreeCamera('actual main camera', new Vector3(SPAWN.x, SPAWN.y + 2, SPAWN.z - 5), scene);
  camera.fov = .85; camera.minZ = .08; camera.maxZ = 1100; scene.activeCamera = camera;
  const ambient = new HemisphericLight('sky', Vector3.Up(), scene), sun = new DirectionalLight('sun', Vector3.Down(), scene);
  const lights: PointLight[] = [];
  const nearestLamps = [...LAMP_PLACEMENTS].sort((a, b) => (a.x-SPAWN.x)**2+(a.z-SPAWN.z)**2-((b.x-SPAWN.x)**2+(b.z-SPAWN.z)**2)).slice(0,3);
  for (const lamp of nearestLamps) createMappedLight(lamp, { scene, lights });
  report.mappedLamps = nearestLamps;
  const B6 = makeClass('client/b6-reality.ts','B6RealityController',['stats','managed','sources','materials','imported','light','interiorLightEnabled','disposed','buildingRoot','lightWorldPosition','inverseBuildingWorld','lastPlayer','lastQuality','lastFloor','update','dispose'], { Vector3, Matrix, Mesh, PointLight, Light, Color3, B6_LAYOUT, B6_ENTRY_PACK, B6_STAIR_CORES, renderBudget }, `constructor(scene,options={}){this.scene=scene;this.options=options;${lightSetup}}`, ['B6_ENTRY_VISIBILITY_BOUNDS','B6_CONSTRUCTION_BOUNDS','distanceToBounds']);
  b6 = new B6(scene);
  const skyMat = new StandardMaterial('sky raster IO',scene); skyMat.disableLighting=true;
  const sink: any = { setFloat(){return this},setVector3(){return this},setColor3(){return this} };
  const Sky = makeClass('client/sky-weather.ts','SkyWeatherController',['observer','direction','right','up','back','light','worldUp','lastInstant','initialized','state','placeDisc','update'],{Vector3,Quaternion,sunState,moonState,windVector,Date:FrozenDate},'',['clamp','mix','moonDiscLightVector']);
  const sky = Object.assign(new Sky(),{scene,atmosphere:{material:skyMat,update(){}},sunMaterial:sink,moonMaterial:sink,sunDisc:new TransformNode('sun IO',scene),moonDisc:new TransformNode('moon IO',scene)});
  sky.sunDisc.rotationQuaternion=Quaternion.Identity();sky.moonDisc.rotationQuaternion=Quaternion.Identity();
  const shadow = new ShadowGenerator(32,sun);
  const Cinematic = makeClass('client/cinematic.ts','CinematicAtmosphere',['update'],{Vector3,Constants,applyCampusSkyIntensity,campusShadowResponse,campusBloomResponse,solarShadowsEnabled},'',['clamp','SHADOW_SPAN','writeSnappedShadowFocus']);
  const cinematic=Object.assign(new Cinematic(),{scene,sun,shadow,quality:'medium',disposed:false,stats:{skyUpdates:0},shadowFocus:{focus:Vector3.Zero(),direction:Vector3.Zero(),texel:0},timer:0,environmentTimer:0,lastSky:new Color3(),lastHorizon:new Color3(),configureGlass(){throw Error('Unexpected glass branch')},selectCasters(){throw Error('Unexpected celestial shadow branch')},reflectionData(){return{faces:[],polynomial:null}},environment:{update(){},sphericalPolynomial:null}});
  pool = new AvatarPrimitivePool(scene); const config=applyAvatarPreset(0,DEFAULT_AVATAR);
  const rig:any=createAvatarRig(scene,config,pool,'avatar Alex');
  rig.lod=new AvatarLodController(scene,pool,rig,config);rig.animation=new AvatarAnimator(rig);rig.target={id:'local',yaw:benchmark.sceneView.yaw,vehicle:false,grounded:true};
  const parts = rig.root.getChildMeshes();
  // This is the unchanged receive-shadows assignment from Cinematic.selectCasters.
  for(const mesh of scene.meshes) mesh.receiveShadows=mesh.metadata?.receiveShadows!==false;
  const actor=Object.freeze({position:Object.freeze({...SPAWN}),vehicle:false,grounded:true});
  const Game=makeClass('client/game.ts','Game',['updateWorldPresentation','updateRenderEnvironment','updateCameraFollow','updateAvatarPresentation'],{Vector3,applyArtLighting,clampOrbitPitch,writeVector3,zoneAt(){throw Error('Unexpected rain branch')}});
  game=Object.assign(new Game(),{scene,engine,camera,actor,quality:'medium',timeOverride:null,flashlightOn:false,ready:false,disposed:false,rendererFailed:false,yaw:benchmark.sceneView.yaw,pitch:.28,distance:5,cameraArm:5,firstPerson:false,footFirstPerson:false,vehicleCameraSnap:true,localId:'local',avatars:new Map([['local',rig]]),weather,ambient,sun,lights,lamps:new StandardMaterial('lamp material',scene),car:new TransformNode('inactive car',scene),clouds:[],skyWeather:sky,cinematic,b6Reality:b6,flashlight:new PlayerFlashlight(scene),localAvatarPresentation:new LocalAvatarPresentation(),contactShadows:{set(){}},sim:{cameraDistance:(a:Vector3,b:Vector3)=>Vector3.Distance(a,b),tick(){throw Error('Physics mutation')},setPosition(){throw Error('Actor mutation')}}});game.car.setEnabled(false);
  const apply=makeApply.call(game);stable=new StableLightState(scene);
  const sourcesOfParts = new Set<any>(parts.map((m:any)=>m.sourceMesh??m));let drawn = new Set<any>();
  for(const source of sourcesOfParts){ const obs=source.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId!==camera.renderPassId)return;const s=source._instanceDataStorage;const p=s.useMonoDataStorageRenderPass?s.dataStorageRenderPass:s.renderPasses[engine.currentRenderPassId];const batch=p?.batchCache;if(!batch)return;for(const sub of source.subMeshes){if(batch.renderSelf[sub._id])drawn.add(source);for(const inst of batch.visibleInstances[sub._id]??[])drawn.add(inst)}});observers.push([source.onAfterRenderObservable,obs]); }
  const beforeActor=JSON.stringify(actor),beforeWeather=JSON.stringify(weather);
  function sample(label:string){const active=scene.getActiveMeshes();return {label,camera:{position:camera.position.asArray(),target:camera.getTarget().asArray(),pass:camera.renderPassId},rig:{position:rig.root.position.asArray(),enabled:rig.root.isEnabled(),level:rig.lod.level,counts:rig.lod.counts},b6:b6.interiorLightEnabled,lights:scene.lights.filter(l=>l.isEnabled()).map((l:any)=>({name:l.name,class:l.getClassName(),falloff:l.falloffType,intensity:l.intensity,priority:l.renderPriority,shadow:l.shadowEnabled,filter:l.getShadowGenerator()?.filter,casters:l.getShadowGenerator()?.getShadowMap()?.renderList?.length})),parts:parts.map((m:any)=>{const source=m.sourceMesh??m;const effect=source.subMeshes?.[0]?._getDrawWrapper(camera.renderPassId)?.effect;return{name:m.name,material:m.material?.name,source:source.name,attached:scene.meshes.includes(m),enabled:m.isEnabled(),visible:m.isVisible,active:active.data.slice(0,active.length).includes(m),drawn:drawn.has(m),isInstance:m.isAnInstance,skeleton:!!source.skeleton,boneInfluencers:source.numBoneInfluencers,receiveShadows:source.receiveShadows,cap:m.material?.maxSimultaneousLights,lightNames:m.lightSources.map((l:any)=>l.name),alphaMode:m.material?.transparencyMode,textures:m.material?.getActiveTextures().map((t:any)=>({name:t.name,url:t.url,ready:t.isReady(),blocking:t.isBlocking,alpha:t.hasAlpha,type:t.textureType,format:t.textureFormat})),effect:effect?{id:effect.uniqueId,ready:effect.isReady(),disposed:effect.isDisposed,defines:effect.defines,sha:sha(effect.defines)}:null}})};}
  async function render(label:string){for(let i=0;i<12;i++){stable!.update();drawn=new Set();scene.render();await setImmediate();const required=parts.filter((m:any)=>scene.meshes.includes(m)&&m.isEnabled()&&m.isVisible);if(arePreparationEffectsReady(engine)&&required.length&&required.every((m:any)=>drawn.has(m))){stable!.update();drawn=new Set();scene.render();const row=sample(label);report.rows.push(row);assert.ok(row.parts.filter((p:any)=>p.drawn).every((p:any)=>p.effect?.ready&&p.textures.every((t:any)=>t.ready)));return row;}}const row=sample(label);report.rows.push(row);throw Error('Draw/readiness did not settle: '+label);}
  function reference(on:boolean){const pos=benchmark.sceneView.position;game.updateWorldPresentation(pos);game.updateAvatarPresentation('local',rig,new Vector3(pos.x,pos.y-.8,pos.z),0,true);const cam=benchmark.sceneView.camera;const world=Matrix.FromArray(cam.viewMatrix).invert();camera.position.copyFromFloats(cam.position.x,cam.position.y,cam.position.z);camera.setTarget(Vector3.TransformCoordinates(new Vector3(0,0,-1),world));game.updateRenderEnvironment(pos,rig,false,0,0,day,on);}
  function variantA(on:boolean){apply(day,on,1);game.updateWorldPresentation(benchmark.sceneView.position);game.updateRenderEnvironment(benchmark.sceneView.position,rig,false,0,0,day,on);}
  const baseline=()=>apply(now,false);
  baseline();await render('baseline-spawn-night-off');
  for(const on of [false,true]){reference(on);await render('reference-B6-day-'+on);baseline();await render('restore-after-reference-'+on);variantA(on);await render('A-B6-lights-spawn-camera-'+on);baseline();await render('restore-after-A-'+on);apply(day,on,1);await render('B-day-spawn-point1-'+on);reference(on);await render('reference-reentry-'+on);}
  report.comparisons=[];
  for(const on of [false,true]){
    const referenceRow=report.rows.find((r:any)=>r.label==='reference-B6-day-'+on);
    const visible=referenceRow.parts.filter((p:any)=>p.drawn);
    assert.equal(visible.length,12,'all actual near body/head/eyes/hair/garment pieces draw');
    assert.equal(new Set(visible.map((p:any)=>p.effect.id)).size,7);
    for(const name of ['anatomy skin','clothed torso','trouser waist']){
      const part=visible.find((p:any)=>p.name==='avatar Alex '+name);assert.ok(part);
      assert.ok(part.skeleton);assert.ok(part.effect.defines.includes('#define BONETEXTURE\n'));
      assert.ok(part.effect.defines.includes('#define NUM_BONE_INFLUENCERS 4\n'));
    }
    const strands=visible.find((p:any)=>p.name==='avatar Alex short02 near hair');
    for(const define of ['INSTANCES','ALPHATEST','ALPHAFROMALBEDO','BUMP']) assert.ok(strands.effect.defines.includes('#define '+define+'\n'));
    for(const prefix of ['A-B6-lights-spawn-camera-','B-day-spawn-point1-','reference-reentry-']){
      const row=report.rows.find((r:any)=>r.label===prefix+on), comparisons=[];
      for(let i=0;i<referenceRow.parts.length;i++){
        const before=referenceRow.parts[i],after=row.parts[i];assert.equal(before.name,after.name);
        if(!before.drawn)continue;assert.equal(after.drawn,true);assert.equal(after.cap,4);
        assert.equal(after.effect.defines,before.effect.defines,'full defines '+before.name+' '+row.label);
        assert.equal(after.effect.id,before.effect.id,'same native Effect '+before.name+' '+row.label);
        comparisons.push({name:before.name,source:before.source,effectId:after.effect.id,definesSha:after.effect.sha});
      }
      report.comparisons.push({reference:referenceRow.label,variant:row.label,sameFullDefines:true,sameEffect:true,drawn:comparisons});
    }
  }
  apply(day,true,1);const beforeZero=await render('B-intensity-zero');const activePoint=lights.find(l=>l.isEnabled());assert.ok(activePoint);assert.equal(activePoint.intensity,0);activePoint.intensity=.7;const afterIntensity=await render('B-intensity-positive');report.intensityOnly={same:beforeZero.parts.filter((p:any)=>p.drawn).every((p:any)=>{const q=afterIntensity.parts.find((q:any)=>q.name===p.name);return p.effect.id===q.effect.id&&p.effect.defines===q.effect.defines;})};assert.equal(report.intensityOnly.same,true);
  rig.lod.update({distance:2,quality:'medium',position:rig.root.position,yaw:rig.target.yaw,visible:false,forceNear:true});stable.update();drawn=new Set();scene.render();report.rows.push(sample('hidden-near'));
  assert.ok(parts.every((p:any)=>!scene.meshes.includes(p)));assert.equal(drawn.size,0);
  baseline();const final=await render('final-restore');assert.equal(JSON.stringify(actor),beforeActor);assert.equal(JSON.stringify(weather),beforeWeather);assert.equal(game.ready,false);assert.equal(game.timeOverride,null);assert.equal(game.flashlightOn,false);
  const cameraError=Vector3.Distance(Vector3.FromArray(final.camera.position),Vector3.FromArray(report.rows[0].camera.position));
  assert.ok(cameraError<.01,'original camera smoothing returns within one centimetre');assert.equal(final.camera.pass,report.rows[0].camera.pass);assert.deepEqual(final.rig,report.rows[0].rig);
  report.ownership={actorUnchanged:true,weatherUnchanged:true,cameraRestoreErrorMetres:cameraError,rigRestored:true,requestedFlashlight:false,requestedTime:null,ready:false};report.passed=true;
}catch(error){report.error=String(error);throw error;}finally{
  for(const[o,h]of observers)o.remove(h);stable?.dispose();game?.flashlight?.dispose();b6?.dispose();game?.avatars?.get('local')?.root.dispose();pool?.dispose();scene.dispose();engine.createRawTexture=rawUpload;engine.dispose();
  report.endedAt=new Date().toISOString();report.cleanup={sceneDisposed:scene.isDisposed,rawTextureReferences:rawTextures.map(t=>({id:t.uniqueId,references:t._references}))};
  report.limitations=['NullEngine GLSL frontend only, not WGSL/GPU pipeline or image/performance proof','Actual Alex near rig and original materials/geometry; no full world, B6 structural geometry, other avatars or LOD acceptance','Raw uploads use explicitly approved completion IO adapter preserving native dimensions/format/type/sampling/bytes; external URL textures use native NullEngine dummy upload','CPU caps enable instancing/derivatives/float bone texture; requested PCF falls back to POISSON in NullEngine','Sky raster uniforms, IBL texture update and camera collision are explicit IO stubs; no real occluder test','Cloud0.96 disables celestial shadow passes; active sun shadow selection not verified','Reference moves only the fixture rig for comparison; A/B leave actual actor state unchanged; no runtime candidate implemented'];
  writeFileSync(new URL('report.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed??false,rows:report.rows.length,error:report.error,startedAt:report.startedAt,endedAt:report.endedAt,rawUploadCount:report.rawUploadIO.length,cleanup:report.cleanup}));
}
