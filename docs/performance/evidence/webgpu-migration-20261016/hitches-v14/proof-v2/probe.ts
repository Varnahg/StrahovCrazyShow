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
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Light } from '@babylonjs/core/Lights/light';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Constants } from '@babylonjs/core/Engines/constants';
import { AvatarPrimitivePool, createAvatarRig } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/avatar-renderer';
import { AvatarLodController } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/avatar-lod';
import { AvatarAnimator } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/animation';
import { applyAvatarPreset } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/avatar-presets';
import { DEFAULT_AVATAR } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/types';
import { PlayerFlashlight } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/flashlight';
import { StableLightState } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/stable-light-state';
import { LocalAvatarPresentation } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/local-avatar-presentation';
import { DEFAULT_ORBIT_DISTANCE, orbitCameraTarget, orbitCameraDesired } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/camera-orbit';
import { TreeWindPlugin } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/tree-wind';
import { configureTreeMaterial } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/tree-appearance';
import { createWebGpuShadowDepthWrapper } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/webgpu-shadow-readiness';
import { clampOrbitPitch } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/camera-look';
import { writeVector3 } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/transform-updates';
import { applyArtLighting } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/art-lighting';
import { selectLightingPreview } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/lighting-preview';
import { sunState, moonState, windVector } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/weather';
import { B6_LAYOUT, B6_ENTRY_PACK, B6_STAIR_CORES } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/b6-interior';
import { LAMP_PLACEMENTS } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/streets';
import { renderBudget } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/render-quality';
import { SPAWN } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/shared/world';
import { arePreparationEffectsReady } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/strict-material-preparation';
import { applyCampusSkyIntensity, campusShadowResponse, campusBloomResponse, solarShadowsEnabled } from '../../webgpu-hitch-validation-20261017/inactive-light-v4/client/cinematic';

const sourceRoot = new URL('../../webgpu-hitch-validation-20261017/inactive-light-v4/', import.meta.url);
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
async function scenario(spec: { index: number; name: string; extras?: boolean }) {
const engine: any = new NullEngine({ renderWidth: 1512, renderHeight: 642, textureSize: 16, deterministicLockstep: false, lockstepMaxSteps: 1 });
Object.assign(engine.getCaps(), { instancedArrays: true, standardDerivatives: true, textureFloat: true, textureFloatLinearFiltering: true, textureFloatRender: true });
const scene = new Scene(engine); scene.useRightHandedSystem = true;
const report: any = { startedAt: new Date().toISOString(), sources, sourceSnapshotId: 'bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0', spec, rows: [], limitations: [] };
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
  pool = new AvatarPrimitivePool(scene); const config=applyAvatarPreset(spec.index,DEFAULT_AVATAR); if(spec.extras){config.glasses=true;config.beard=true;} report.config=config;
  const rig:any=createAvatarRig(scene,config,pool,'avatar '+spec.name);
  rig.lod=new AvatarLodController(scene,pool,rig,config);rig.animation=new AvatarAnimator(rig);rig.target={id:'local',yaw:benchmark.sceneView.yaw,vehicle:false,grounded:true};
  let parts = rig.root.getChildMeshes();
  // This is the unchanged receive-shadows assignment from Cinematic.selectCasters.
  for(const mesh of scene.meshes) mesh.receiveShadows=mesh.metadata?.receiveShadows!==false;
  const actor=Object.freeze({position:Object.freeze({...SPAWN}),vehicle:false,grounded:true});
  const Game=makeClass('client/game.ts','Game',['updateWorldPresentation','updateRenderEnvironment','updateCameraFollow','updateAvatarPresentation'],{Vector3,applyArtLighting,clampOrbitPitch,orbitCameraTarget,orbitCameraDesired,writeVector3,zoneAt(){throw Error('Unexpected rain branch')}});
  game=Object.assign(new Game(),{scene,engine,camera,actor,quality:'medium',timeOverride:null,flashlightOn:false,ready:false,disposed:false,rendererFailed:false,yaw:Math.PI,pitch:.28,distance:DEFAULT_ORBIT_DISTANCE,cameraArm:DEFAULT_ORBIT_DISTANCE,firstPerson:false,footFirstPerson:false,vehicleCameraSnap:true,localId:'local',avatars:new Map([['local',rig]]),weather,ambient,sun,lights,lamps:new StandardMaterial('lamp material',scene),car:new TransformNode('inactive car',scene),clouds:[],skyWeather:sky,cinematic,b6Reality:b6,flashlight:new PlayerFlashlight(scene),localAvatarPresentation:new LocalAvatarPresentation(),contactShadows:{set(){}},sim:{cameraDistance:(a:Vector3,b:Vector3)=>Vector3.Distance(a,b),tick(){throw Error('Physics mutation')},setPosition(){throw Error('Actor mutation')}}});game.car.setEnabled(false);
  const apply=makeApply.call(game);stable=new StableLightState(scene);
  // Initialize the real torch prop before collecting owned avatar parts.
  apply(day,true,1); game.flashlight.update(rig,camera,true,false,'medium'); parts=rig.root.getChildMeshes();
  for(const mesh of scene.meshes) mesh.receiveShadows=mesh.metadata?.receiveShadows!==false;
  const sourcesOfParts = new Set<any>(parts.map((m:any)=>m.sourceMesh??m));let drawn = new Set<any>();
  for(const source of sourcesOfParts){ const obs=source.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId!==camera.renderPassId)return;const s=source._instanceDataStorage;const p=s.useMonoDataStorageRenderPass?s.dataStorageRenderPass:s.renderPasses[engine.currentRenderPassId];const batch=p?.batchCache;if(!batch)return;for(const sub of source.subMeshes){if(batch.renderSelf[sub._id])drawn.add(source);for(const inst of batch.visibleInstances[sub._id]??[])drawn.add(inst)}});observers.push([source.onAfterRenderObservable,obs]); }
  const beforeActor=JSON.stringify(actor),beforeWeather=JSON.stringify(weather);
  let currentStage='setup',worldMain=new Set<any>(),worldShadow=new Set<any>();
  const worldEvents:any[]=[];
  let worldWitnesses:any[]=[];
  let leafWrapper:any;
  let frameWorldEventsStart=0;
  function sample(label:string){const active=scene.getActiveMeshes();return {label,world:{main:[...worldMain].map(m=>m.name),shadow:[...worldShadow].map(m=>m.name),effectEvents:worldEvents.slice(frameWorldEventsStart)},camera:{position:camera.position.asArray(),target:camera.getTarget().asArray(),pass:camera.renderPassId},rig:{position:rig.root.position.asArray(),enabled:rig.root.isEnabled(),level:rig.lod.level,counts:rig.lod.counts},b6:b6.interiorLightEnabled,lights:scene.lights.filter(l=>l.isEnabled()).map((l:any)=>({name:l.name,class:l.getClassName(),falloff:l.falloffType,intensity:l.intensity,priority:l.renderPriority,shadow:l.shadowEnabled,filter:l.getShadowGenerator()?.filter,casters:l.getShadowGenerator()?.getShadowMap()?.renderList?.length})),parts:parts.map((m:any)=>{const source=m.sourceMesh??m;const effect=source.subMeshes?.[0]?._getDrawWrapper(camera.renderPassId)?.effect;return{name:m.name,material:m.material?.name,source:source.name,attached:scene.meshes.includes(m),enabled:m.isEnabled(),visible:m.isVisible,active:active.data.slice(0,active.length).includes(m),drawn:drawn.has(m),isInstance:m.isAnInstance,skeleton:!!source.skeleton,boneInfluencers:source.numBoneInfluencers,receiveShadows:source.receiveShadows,cap:m.material?.maxSimultaneousLights,lightNames:m.lightSources.map((l:any)=>l.name),alphaMode:m.material?.transparencyMode,textures:m.material?.getActiveTextures().map((t:any)=>({name:t.name,url:t.url,ready:t.isReady(),blocking:t.isBlocking,alpha:t.hasAlpha,type:t.textureType,format:t.textureFormat})),effect:effect?{id:effect.uniqueId,ready:effect.isReady(),disposed:effect.isDisposed,defines:effect.defines,sha:sha(effect.defines)}:null}})};}
  async function render(label:string){currentStage=label;frameWorldEventsStart=worldEvents.length;for(let i=0;i<12;i++){stable!.update();drawn=new Set();worldMain=new Set();worldShadow=new Set();scene.render();await setImmediate();const required=parts.filter((m:any)=>scene.meshes.includes(m)&&m.isEnabled()&&m.isVisible);if(arePreparationEffectsReady(engine)&&required.length&&required.every((m:any)=>drawn.has(m))){stable!.update();drawn=new Set();worldMain=new Set();worldShadow=new Set();scene.render();const row=sample(label);report.rows.push(row);assert.ok(row.parts.filter((p:any)=>p.drawn).every((p:any)=>p.effect?.ready&&p.textures.every((t:any)=>t.ready)));return row;}}const row=sample(label);report.rows.push(row);throw Error('Draw/readiness did not settle: '+label);}
  function reference(on:boolean){const pos=benchmark.sceneView.position;game.updateWorldPresentation(pos);game.updateAvatarPresentation('local',rig,new Vector3(pos.x,pos.y-.8,pos.z),0,true);const cam=benchmark.sceneView.camera;const world=Matrix.FromArray(cam.viewMatrix).invert();camera.position.copyFromFloats(cam.position.x,cam.position.y,cam.position.z);camera.setTarget(Vector3.TransformCoordinates(new Vector3(0,0,-1),world));game.updateRenderEnvironment(pos,rig,false,0,0,day,on);}
  const history = () => ({yaw:game.yaw,pitch:game.pitch,distance:game.distance,cameraArm:game.cameraArm,vehicleCameraSnap:game.vehicleCameraSnap,firstPerson:game.firstPerson,footFirstPerson:game.footFirstPerson,local:JSON.stringify(game.localAvatarPresentation.state),actor:JSON.stringify(actor),phase:rig.animation.phase,gait:rig.animation.gait,pose:rig.root.getDescendants(false).map((node:any)=>({id:node.uniqueId,position:node.position?.asArray(),rotation:node.rotation?.asArray(),quaternion:node.rotationQuaternion?.asArray(),scaling:node.scaling?.asArray()}))});
  const eligible = () => parts.filter((m:any)=>scene.meshes.includes(m)&&m.isEnabled()&&m.isVisible);
  const cameraState = () => {const view=Array.from(camera.getViewMatrix(true).m),projection=Array.from(camera.getProjectionMatrix(true).m),targetCamera=camera as any;return{position:camera.position.clone(),rotation:camera.rotation.clone(),quaternion:camera.rotationQuaternion?.clone()??null,quaternionOwner:camera.rotationQuaternion,up:camera.upVector.clone(),fov:camera.fov,fovMode:camera.fovMode,minZ:camera.minZ,maxZ:camera.maxZ,mode:camera.mode,pass:camera.renderPassId,view,projection,target:camera.getTarget().clone(),focalDistance:targetCamera._initialFocalDistance,referencePoint:targetCamera._referencePoint.clone(),cachedRotationZ:targetCamera._cachedRotationZ,cachedQuaternionRotationZ:targetCamera._cachedQuaternionRotationZ};};
  // Pinned TargetCamera.setTarget changes focal distance/reference point as
  // well as rotation/up/position. Restore owned values, not merely an equivalent
  // view matrix, and preserve the original quaternion object if present.
  function restoreCamera(saved:ReturnType<typeof cameraState>){const targetCamera=camera as any;camera.position.copyFrom(saved.position);camera.rotation.copyFrom(saved.rotation);camera.rotationQuaternion=saved.quaternionOwner;if(saved.quaternion&&camera.rotationQuaternion)camera.rotationQuaternion.copyFrom(saved.quaternion);camera.upVector.copyFrom(saved.up);targetCamera._initialFocalDistance=saved.focalDistance;targetCamera._referencePoint.copyFrom(saved.referencePoint);targetCamera._currentTarget.copyFrom(saved.target);targetCamera._cachedRotationZ=saved.cachedRotationZ;targetCamera._cachedQuaternionRotationZ=saved.cachedQuaternionRotationZ;camera.fov=saved.fov;camera.fovMode=saved.fovMode;camera.minZ=saved.minZ;camera.maxZ=saved.maxZ;camera.mode=saved.mode;camera.getViewMatrix(true);camera.getProjectionMatrix(true);}
  function assertCameraRestored(saved:ReturnType<typeof cameraState>){const current=cameraState();for(const key of ['fov','fovMode','minZ','maxZ','mode','pass','focalDistance','cachedRotationZ','cachedQuaternionRotationZ']as const)assert.equal(current[key],saved[key],key);for(const key of ['position','rotation','up','target','referencePoint']as const)assert.deepEqual(current[key].asArray(),saved[key].asArray(),key);assert.equal(current.quaternionOwner,saved.quaternionOwner);assert.deepEqual(current.quaternion?.asArray(),saved.quaternion?.asArray());for(const key of ['view','projection']as const)assert.deepEqual(current[key],saved[key],key);}
  function avatarEnvelope(){
    const minimum=new Vector3(Infinity,Infinity,Infinity),maximum=new Vector3(-Infinity,-Infinity,-Infinity);
    for(const mesh of eligible()){mesh.computeWorldMatrix(true);const box=mesh.getBoundingInfo().boundingBox;minimum.minimizeInPlace(box.minimumWorld);maximum.maximizeInPlace(box.maximumWorld);}
    const center=Vector3.Center(minimum,maximum),radius=Vector3.Distance(minimum,maximum)/2+camera.minZ;
    return{minimum,maximum,center,radius};
  }
  function fitAvatar(){
    assert.equal(camera.mode,0,'same perspective camera');assert.equal(camera.fovMode,0,'vertical FOV fixture');
    const {minimum,maximum,center,radius}=avatarEnvelope();
    const distance=Vector3.Distance(camera.position,center);assert.ok(distance>radius+camera.minZ,'camera must remain outside conservative avatar envelope');
    const aspect=engine.getAspectRatio(camera),pixelReserve=1+4/engine.getRenderHeight();
    const fov=2*Math.atan(Math.tan(Math.asin(radius/distance))*pixelReserve/Math.min(1,aspect));
    const originalFov=camera.fov,originalFar=camera.maxZ;camera.setTarget(center);camera.fov=fov;camera.maxZ=Math.min(originalFar,distance+radius+camera.minZ);camera.getViewMatrix(true);camera.getProjectionMatrix(true);
    return{minimum:minimum.asArray(),maximum:maximum.asArray(),center:center.asArray(),radius,distance,aspect,pixelReserve,fov,originalFov,far:camera.maxZ,originalFar,near:camera.minZ,position:camera.position.asArray()};
  }
  function fitFarOnly(saved:ReturnType<typeof cameraState>){
    // Read the original view once. No setTarget, pose, FOV or near-plane setter
    // is called on this path; only maxZ and its derived projection change.
    const view=Matrix.FromArray(saved.view),point=Vector3.Zero();let maximumDepth=-Infinity,corners=0;
    for(const mesh of eligible()){mesh.computeWorldMatrix(true);for(const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld){Vector3.TransformCoordinatesToRef(corner,view,point);const depth=scene.useRightHandedSystem?-point.z:point.z;assert.ok(Number.isFinite(depth));maximumDepth=Math.max(maximumDepth,depth);corners++;}}
    assert.ok(corners>0&&maximumDepth>saved.minZ);
    const far=Math.min(saved.maxZ,maximumDepth+saved.minZ);assert.ok(far>saved.minZ);camera.maxZ=far;camera.getProjectionMatrix(true);
    return{mode:'far-only',maximumDepth,corners,reserve:saved.minZ,far,originalFar:saved.maxZ,fov:saved.fov,originalFov:saved.fov,near:saved.minZ,position:saved.position.asArray(),originalTarget:saved.target.asArray(),derivation:'maximum conservative corner depth in unchanged original view + original minZ'};
  }
  function projectionCoverage(){
    const viewProjection=camera.getViewMatrix(true).multiply(camera.getProjectionMatrix(true));const near=engine.isNDCHalfZRange?0:-1;
    const project=(x:number,y:number,z:number,m:any)=>{const w=x*m[3]+y*m[7]+z*m[11]+m[15];return{x:(x*m[0]+y*m[4]+z*m[8]+m[12])/w,y:(x*m[1]+y*m[5]+z*m[9]+m[13])/w,z:(x*m[2]+y*m[6]+z*m[10]+m[14])/w,w};};
    const outside=(p:any)=>![p.x,p.y,p.z,p.w].every(Number.isFinite)||p.w<=0||Math.abs(p.x)>1+1e-5||Math.abs(p.y)>1+1e-5||p.z<near-1e-5||p.z>1+1e-5;
    return eligible().map((mesh:any)=>{
      const source=mesh.sourceMesh??mesh;mesh.computeWorldMatrix(true);source.skeleton?.prepare(true);
      const positions=source.getPositionData(true,true);assert.ok(positions,'actual positions including skeleton/morph');
      const matrix=mesh.getWorldMatrix().multiply(viewProjection).m;let clipped=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,minZ=Infinity,maxZ=-Infinity;
      for(let i=0;i<positions.length;i+=3){const p=project(positions[i],positions[i+1],positions[i+2],matrix);if(outside(p))clipped++;minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);minZ=Math.min(minZ,p.z);maxZ=Math.max(maxZ,p.z);}
      const corners=mesh.getBoundingInfo().boundingBox.vectorsWorld;const clippedBounds=corners.filter((p:any)=>outside(project(p.x,p.y,p.z,viewProjection.m))).length;
      return{name:mesh.name,vertices:positions.length/3,clippedVertices:clipped,clippedBounds,ndc:{minX,maxX,minY,maxY,minZ,maxZ},skinned:!!source.skeleton,morphed:!!source.morphTargetManager,instance:mesh.isAnInstance};
    });
  }
  async function withNarrow<T>(callback:(fit:any)=>Promise<T>,mode='both'){
    const saved=cameraState(),before=history();
    try{
      const fit=mode==='far-only'?fitFarOnly(saved):fitAvatar();
      if(mode==='fov-only')camera.maxZ=saved.maxZ;
      camera.getViewMatrix(true);camera.getProjectionMatrix(true);fit.mode=mode;fit.fov=camera.fov;fit.far=camera.maxZ;
      if(mode==='far-only'){assert.deepEqual(camera.position.asArray(),saved.position.asArray());assert.deepEqual(camera.rotation.asArray(),saved.rotation.asArray());assert.deepEqual(camera.getTarget().asArray(),saved.target.asArray());assert.equal((camera as any)._initialFocalDistance,saved.focalDistance);assert.deepEqual((camera as any)._referencePoint.asArray(),saved.referencePoint.asArray());assert.equal(camera.fov,saved.fov);assert.equal(camera.minZ,saved.minZ);}
      return await callback(fit);
    }finally{
      if(mode==='far-only'){camera.maxZ=saved.maxZ;camera.getProjectionMatrix(true);}else restoreCamera(saved);
      assertCameraRestored(saved);assert.deepEqual(history(),before,'camera-only view preserves follow/actor/LOD/animation history');
      (report.restoreChecks??=[]).push({mode,targetBefore:saved.target.asArray(),targetAfter:camera.getTarget().asArray(),focalDistanceBefore:saved.focalDistance,focalDistanceAfter:(camera as any)._initialFocalDistance,referencePointBefore:saved.referencePoint.asArray(),referencePointAfter:(camera as any)._referencePoint.asArray(),viewExact:true,projectionExact:true});
    }
  }

  // Bounded witnesses, explicitly not production-world coverage. One farther
  // opaque mesh intersects the original main view. A real wind/wrapper path is
  // positioned on the original torch ray and remains subject to native culling.
  const farMesh=MeshBuilder.CreateBox('representative far world receiver',{size:1},scene);farMesh.position.copyFrom(camera.position.add(avatarEnvelope().center.subtract(camera.position).scale(2)));farMesh.material=new StandardMaterial('representative world Standard',scene);farMesh.receiveShadows=true;farMesh.metadata={depthCaster:'opaque'};
  const leafMesh=MeshBuilder.CreatePlane('representative shadow-only wind leaf',{size:.6},scene);const beam=game.flashlight.beam.light;
  leafMesh.position.copyFrom(beam.position.add(beam.direction.normalizeToNew().scale(6)));leafMesh.receiveShadows=true;leafMesh.metadata={depthCaster:'alpha-test',windDeformed:true};
  const leaf=new PBRMaterial('representative real TreeWind wrapper',scene);leaf.albedoTexture=new Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB5kAAAAASUVORK5CYII=',scene);leaf.albedoTexture.hasAlpha=true;configureTreeMaterial(leaf);new TreeWindPlugin(leaf,{time:0,x:1,z:0});leafMesh.material=leaf;
  engine._isWebGPU=true;try{leafWrapper=createWebGpuShadowDepthWrapper(leaf,scene);}finally{engine._isWebGPU=false;}leaf.shadowDepthWrapper=leafWrapper;game.witnessWrapper=leafWrapper;
  worldWitnesses=[farMesh,leafMesh];
  for(const mesh of worldWitnesses){const o=mesh.onAfterRenderObservable.add(()=>{if(engine.currentRenderPassId===camera.renderPassId)worldMain.add(mesh);});observers.push([mesh.onAfterRenderObservable,o]);}
  const effectObserver=leaf.onEffectCreatedObservable.add(({effect}:any)=>worldEvents.push({stage:currentStage,pass:engine.currentRenderPassId,effectId:effect.uniqueId,definesSha:sha(effect.defines),kind:engine.currentRenderPassId===camera.renderPassId?'main-base':'shadow-base'}));observers.push([leaf.onEffectCreatedObservable,effectObserver]);
  const torchShadow=beam.getShadowGenerator();assert.ok(torchShadow);
  const shadowObserver=torchShadow.onAfterShadowMapRenderMeshObservable.add((mesh:any)=>{if(worldWitnesses.includes(mesh))worldShadow.add(mesh);});observers.push([torchShadow.onAfterShadowMapRenderMeshObservable,shadowObserver]);
  const baseline=()=>apply(now,false);
  baseline();await render('baseline-spawn-night-off');
  report.projections=[];report.comparisons=[];report.restores=[];
  for(const on of [false,true]){
    apply(day,on,1);
    const narrow=await withNarrow(async fit=>{const row=await render('narrow-first-'+on);const projection=projectionCoverage();assert.ok(projection.every(p=>p.clippedVertices===0),'no actual avatar vertices clipped');assert.ok(projection.every(p=>p.clippedBounds===0),'whole conservative near bounds fit');row.fit=fit;row.projection=projection;row.leafShadowEffect=leafWrapper.getEffect(leafMesh.subMeshes![0],torchShadow,torchShadow.getShadowMap().renderPassId)?.effect?.uniqueId??null;return row;});
    report.restores.push({after:'narrow-'+on,pass:camera.renderPassId,success:true});
    const whole=await render('whole-day1-'+on);whole.projection=projectionCoverage();
    const repeat=await withNarrow(async fit=>{const row=await render('narrow-reuse-'+on);row.fit=fit;row.projection=projectionCoverage();return row;});
    const fovOnly=await withNarrow(async fit=>{const row=await render('fov-only-'+on);row.fit=fit;row.projection=projectionCoverage();return row;},'fov-only');
    const farOnly=await withNarrow(async fit=>{const row=await render('far-only-'+on);row.fit=fit;row.projection=projectionCoverage();return row;},'far-only');
    assert.ok(!narrow.world.main.includes(farMesh.name));assert.ok(!farOnly.world.main.includes(farMesh.name));assert.ok(fovOnly.world.main.includes(farMesh.name),'FOV alone cannot exclude aligned far geometry');
    for(const row of [fovOnly,farOnly])assert.ok(row.projection.every((p:any)=>p.clippedVertices===0&&p.clippedBounds===0),'projection, not merely draw, covers every part');
    if(on){assert.ok(narrow.world.shadow.includes(leafMesh.name));assert.ok(!narrow.world.main.includes(leafMesh.name));assert.ok(narrow.world.effectEvents.some((e:any)=>e.kind==='shadow-base'));assert.ok(narrow.leafShadowEffect!==null);}
    reference(on);const b6row=await render('B6-reference-'+on);b6row.projection=projectionCoverage();
    for(const compared of [whole,repeat,fovOnly,farOnly,b6row]){
      let count=0;for(let i=0;i<narrow.parts.length;i++){const first=narrow.parts[i],second=compared.parts[i];assert.equal(first.name,second.name);if(!first.drawn)continue;assert.equal(second.drawn,true,first.name+' '+compared.label);assert.equal(second.effect.defines,first.effect.defines,'full defines '+first.name);assert.equal(second.effect.id,first.effect.id,'native Effect reuse '+first.name);assert.equal(second.cap,first.cap);count++;}
      report.comparisons.push({first:narrow.label,other:compared.label,drawn:count,sameFullDefines:true,sameEffect:true});
    }
    baseline();await render('restore-'+on);
  }
  apply(day,true,1);await render('exception-reference');
  for(const mode of ['both','fov-only','far-only']){const injected=new Error('owned camera callback failure '+mode);let caught:any;try{await withNarrow(async()=>{throw injected;},mode);}catch(error){caught=error;}assert.equal(caught,injected);report.restores.push({after:'injected-exception-'+mode,originalError:true,success:true});}
  baseline();const final=await render('final-restore');assert.equal(JSON.stringify(actor),beforeActor);assert.equal(JSON.stringify(weather),beforeWeather);assert.equal(game.ready,false);assert.equal(game.timeOverride,null);assert.equal(game.flashlightOn,false);
  report.ownership={actorUnchanged:true,weatherUnchanged:true,rigNear:rig.lod.level,followHistoryDuringNarrow:'deepEqual',cameraRestore:'exact pose/getTarget/focalDistance/referencePoint/projection/view/near/far/fov/pass; success and exception in all three modes',requestedFlashlight:false,requestedTime:null,ready:false};
  report.passed=true;
}catch(error){report.error=String(error);throw error;}finally{
  for(const[o,h]of observers)o.remove(h);stable?.dispose();game?.witnessWrapper?.dispose();game?.flashlight?.dispose();b6?.dispose();game?.avatars?.get('local')?.root.dispose();pool?.dispose();scene.dispose();engine.createRawTexture=rawUpload;engine.dispose();
  report.endedAt=new Date().toISOString();report.cleanup={sceneDisposed:scene.isDisposed,rawTextureReferences:rawTextures.map(t=>({id:t.uniqueId,references:t._references}))};
  report.limitations=['NullEngine GLSL/CPU, no WGSL/GPU pipeline or performance proof','Actual six preset near rigs plus selected extras; current pose projection only, not all animation poses or future morphs','Raw upload completion adapter preserves original bytes/metadata; URL textures are native NullEngine dummy uploads','Default Game distance8/pitch0.28 actual follow method with explicit no-obstacle collision IO; no full-world clip','Sky/IBL IO stubs; cloud0.96 leaves celestial shadows inactive','Two representative world witnesses establish mechanism only; actual terrain/large meshes can still intersect any narrow frustum','Reference B6 moves only the owned fixture rig for comparison; narrow view never moves it'];
  writeFileSync(new URL('case-'+spec.index+(spec.extras?'-extras':'')+'.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({preset:spec.name,passed:report.passed??false,rows:report.rows.length,error:report.error,startedAt:report.startedAt,endedAt:report.endedAt}));
}
return report;
}

const specs=[{index:0,name:'Alex'},{index:1,name:'Robin'},{index:2,name:'Eli'},{index:3,name:'Sam'},{index:4,name:'Mia'},{index:5,name:'Niki'},{index:0,name:'Alex extras',extras:true}];
const startedAt=new Date().toISOString();const cases=[];
for(const spec of process.argv.includes('--all')?specs:specs.slice(0,1))cases.push(await scenario(spec));
writeFileSync(new URL('report.json',import.meta.url),JSON.stringify({startedAt,endedAt:new Date().toISOString(),passed:cases.every(c=>c.passed),cases},null,2)+'\n');
