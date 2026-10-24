import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { Observable } from '@babylonjs/core/Misc/observable';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine';
import { WebGPUShaderProcessorWGSL } from '@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL';
import { WebGPUPipelineContext } from '@babylonjs/core/Engines/WebGPU/webgpuPipelineContext';
import { Effect } from '@babylonjs/core/Materials/effect';
import { DrawWrapper } from '@babylonjs/core/Materials/drawWrapper';
import { ShadowDepthWrapper } from '@babylonjs/core/Materials/shadowDepthWrapper';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { observeShaderLifetime } from './shader-lifetime.mjs';
import { ATTRIBUTION_LIMITS } from './shader-attribution.mjs';
import { observeShaderAttribution } from './shader-attribution.mjs';
import { WebGpuCompilationProfile } from '../../../../../client/webgpu-compilation-profile.ts';
const flush=()=>new Promise(setImmediate);
const vertex='@vertex\nfn main(input:VertexInputs)->FragmentInputs {\nvertexOutputs.position=vec4f(0.,0.,0.,1.);\n}';
const fragment='@fragment\nfn main(input:FragmentInputs)->FragmentOutputs {\nfragmentOutputs.color=vec4f(1.,0.,0.,1.);\n}';
const gameSource=readFileSync(new URL('../../../../../client/game.ts',import.meta.url),'utf8');
const gameAST=ts.createSourceFile('game.ts',gameSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
const actualCameraMethod=gameAST.statements.find(node=>ts.isClassDeclaration(node)&&node.name?.text==='Game')?.members.find(node=>node.name?.getText(gameAST)==='isMeshReadyForCamera');
assert.ok(actualCameraMethod,'actual Game camera readiness contract exists');
const cameraJS=ts.transpileModule('class ActualCameraScope {'+actualCameraMethod.getText(gameAST)+'}',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const runActualCameraMethod=new Function(cameraJS+';return ActualCameraScope.prototype.isMeshReadyForCamera;')();
/** Actual native Effect constructor/process/prepare/context/callback/dispose and
 * native WebGPU create/release, ShadowDepthWrapper and generator readiness.
 * Only device/terminal binding/buffer IO and mesh/scene resource inputs fake. */
function fixture(overrides={}){
  let serial=0,time=0,currentStage='construction',moduleCalls=0;
  const modules=new WeakMap(),finalModules=new Set(),engine=Object.create(WebGPUEngine.prototype);
  Object.assign(engine,{_isWebGPU:true,_isDisposed:false,_compiledEffects:{},_shaderPlatformName:'WEBGPU',currentRenderPassId:7,
    _shaderProcessorWGSL:new WebGPUShaderProcessorWGSL(),_features:{},_caps:{highPrecisionShaderSupported:true},
    onReleaseEffectsObservable:new Observable(),onDisposeObservable:new Observable(),onContextRestoredObservable:new Observable(),
    onBeforeShaderCompilationObservable:new Observable(),onAfterShaderCompilationObservable:new Observable(),onEffectErrorObservable:new Observable(),
    createDrawContext:()=>({reset(){},dispose(){}}),createMaterialContext:()=>({}),
    _device:{createShaderModule(){const module={};modules.set(module,++moduleCalls);if(currentStage==='submitted-frame')finalModules.add(moduleCalls);return module;}},
  });
  const scene={lights:[],meshes:[],getEngine:()=>engine};
  const game={engine,scene,camera:{renderPassId:7},disposed:false,isMeshReadyForCamera:runActualCameraMethod};
  const material={name:'car material',onEffectCreatedObservable:new Observable(),shadowDepthWrapper:null};
  const light={_scene:scene,_shadowGenerators:new Map(),getClassName:()=> 'SpotLight',getTypeID:()=>2,needCube:()=>false};
  const generator=Object.create(ShadowGenerator.prototype);
  Object.assign(generator,{_scene:scene,_light:light,_shadersLoaded:true,_textureType:0,_filter:0,_normalBias:0,_enableSoftTransparentShadow:false});
  light._shadowGenerators.set(null,generator);scene.lights=[light];
  const mesh={name:'vehicle body',onDisposeObservable:new Observable(),instances:[{}],_thinInstanceDataStorage:{instancesCount:0},
    _internalAbstractMeshDataInfo:{_material:material},_instanceDataStorage:{useMonoDataStorageRenderPass:false,renderPasses:{7:{batchCache:{visibleInstances:[null]}}}}};
  const sub={_id:0,_mesh:mesh,_renderingMesh:mesh,materialIndex:0,_drawWrappers:[],getMesh:()=>mesh,getMaterial:()=>material};
  mesh.subMeshes=[sub];scene.meshes=[mesh];
  const originalCreate=engine.createEffect,originalRelease=engine._releaseEffect;
  const create=(extra={})=>engine.createEffect({vertexSource:vertex,fragmentSource:fragment,vertexToken:'base'+serial,fragmentToken:'base'+serial++},
    {attributes:[],uniformsNames:[],uniformBuffersNames:[],samplers:[],defines:'',shaderLanguage:1,...extra},engine);
  const base=create();assert.ok(base instanceof Effect);assert.ok(base._pipelineContext instanceof WebGPUPipelineContext);assert.equal(base.isReady(),true);
  const baseWrapper=new DrawWrapper(engine);baseWrapper.setEffect(base);sub._drawWrappers[7]=baseWrapper;sub._getDrawWrapper=()=>baseWrapper;
  const shadow=new ShadowDepthWrapper(material,scene,{doNotInjectCode:true});material.shadowDepthWrapper=shadow;
  material.onEffectCreatedObservable.notifyObservers({effect:base,subMesh:sub});
  const helper=observeShaderLifetime(game,{enabled:true,limits:{...ATTRIBUTION_LIMITS,...overrides},now:()=>++time,name:value=>typeof value==='string'?value:null,
    stage:()=>currentStage,moduleID:module=>modules.get(module)??0,isFinalModule:id=>finalModules.has(id),finalModules:()=>[...finalModules],valid:()=>!game.disposed});
  const final=()=>{currentStage='submitted-frame';helper.refresh();};
  return{engine,scene,game,material,light,generator,mesh,sub,shadow,base,create,helper,final,modules,finalModules,
    counts:()=>({moduleCalls}),originalCreate,originalRelease,
    dispose(){helper.dispose();shadow.dispose();for(const effect of Object.values(engine._compiledEffects))effect.dispose(true);base.dispose(true);}};
}
test('default-off lifetime does not inspect Game or install any method',()=>{
  const game=new Proxy({},{getOwnPropertyDescriptor(){throw Error('default touched resource');}});
  assert.equal(observeShaderLifetime(game),undefined);
});
test('actual native sync shadow replacement is captured before a queued microtask and preserves exact variant/owner',async()=>{
  const f=fixture();try{
    const originalGenerator=ShadowGenerator.prototype.isReady,originalMake=ShadowDepthWrapper.prototype._makeEffect;
    f.final();assert.equal(f.generator.isReady(f.sub,false),true);
    const first=f.shadow._subMeshToDepthWrapper.get(f.sub,f.generator).mainDrawWrapper.effect;
    const next=f.shadow._makeEffect(f.sub,['#define DIFFERENT_DEPTH'],f.generator,7);
    assert.ok(first instanceof Effect);assert.ok(next instanceof Effect);assert.equal(first.isDisposed,true);
    assert.equal(Object.values(f.engine._compiledEffects).includes(first),false);
    let microtaskSawRetired=false;queueMicrotask(()=>{microtaskSawRetired=!Object.values(f.engine._compiledEffects).includes(first);});await flush();
    assert.equal(microtaskSawRetired,true);const before=f.counts();f.helper.dispose();const snapshot=f.helper.snapshot();
    assert.deepEqual(f.counts(),before);assert.equal(snapshot.coverage.unlinkedFinalModules,0);
    assert.ok(snapshot.links.some(row=>row[9]===1));assert.ok(snapshot.owners.some(owner=>owner.kind==='shadow-derived'));
    assert.ok(snapshot.owners.some(owner=>owner.useInstances===0));assert.equal(snapshot.stats.bridgeInstalled,0);
    assert.ok(snapshot.owners.some(owner=>owner.kind==='shadow-derived'&&owner.useInstances===-1),'direct _makeEffect outside original outer scope stays unknown');
    assert.equal(snapshot.stats.createWithoutModules,0);assert.equal(snapshot.stats.shadowRegistrations,1);
    assert.equal(f.generator.isReady,originalGenerator);assert.equal(f.shadow._makeEffect,originalMake);
    assert.equal(f.engine.createEffect,f.originalCreate);assert.equal(f.engine._releaseEffect,f.originalRelease);
    assert.doesNotMatch(JSON.stringify(snapshot),/vertexSource|fragmentSource|#define|@vertex|_pipelineContext/);
  }finally{f.dispose();}
});
test('target depth input epochs distinguish actual native depth-define replacement from original base identity',()=>{
  const f=fixture();try{
    f.mesh.name='tree__ipr-crown-047__lod0__leaves';f.light.metadata={simulatedVehicleLight:true,localFlashlight:false};
    f.final();assert.equal(f.generator.isReady(f.sub,false),true);
    f.shadow._makeEffect(f.sub,['#define SM_NORMALBIAS 1'],f.generator,7);
    const before=f.counts();f.helper.dispose();const result=f.helper.snapshot();assert.deepEqual(f.counts(),before);
    const rows=result.programInputs;assert.equal(rows.length,2);assert.equal(rows[0].originalEffectID,rows[1].originalEffectID);
    assert.notEqual(rows[0].incomingDepthDefines.id,rows[1].incomingDepthDefines.id);assert.equal(rows[0].releaseScope,'shadow-derived');
    assert.equal(rows[0].generatorOwner.simulatedVehicleLight,1);assert.equal(rows[0].generatorOwner.localFlashlight,0);
    assert.equal(result.depthInputProjection.overflow,0);assert.ok(result.depthInputProjection.entries>0);
    assert.doesNotMatch(JSON.stringify(result),/#define|vertexSource|fragmentSource/);
  }finally{f.dispose();}
});

test('target native listener invalidation is distinct from depth replacement without adding original resource calls',()=>{
  const f=fixture();try{
    f.mesh.name='tree__ipr-crown-047__lod0__leaves';f.final();assert.equal(f.generator.isReady(f.sub,false),true);
    f.shadow._options.standalone=true;let once=false;
    f.material.isReadyForSubMesh=()=>{if(!once){once=true;const next=f.create({defines:'#define LIGHT0\n#define POINTLIGHT0'});f.material.onEffectCreatedObservable.notifyObservers({effect:next,subMesh:f.sub});}return true;};
    assert.equal(f.generator.isReady(f.sub,false),true);
    const before=f.counts();f.helper.dispose();const result=f.helper.snapshot();assert.deepEqual(f.counts(),before);
    const rows=result.programInputs;assert.equal(rows.length,2);assert.notEqual(rows[0].originalEffectID,rows[1].originalEffectID);
    assert.equal(rows[0].releaseScope,'shadow-base');assert.notEqual(rows[0].originalDefines.id,rows[1].originalDefines.id);
    assert.equal(result.depthInputProjection.overflow,0);
  }finally{f.dispose();}
});

test('cached native shared Effect keeps distinct mesh owners with no duplicate bridge or original resource work',()=>{
  const f=fixture();try{
    f.final();f.generator.isReady(f.sub,true);
    const secondMesh={...f.mesh,name:'vehicle second',onDisposeObservable:new Observable()},second={...f.sub,_mesh:secondMesh,_renderingMesh:secondMesh,getMesh:()=>secondMesh};
    f.material.onEffectCreatedObservable.notifyObservers({effect:f.base,subMesh:second});
    const before=f.counts();f.generator.isReady(second,true);assert.deepEqual(f.counts(),before);
    f.helper.dispose();const snapshot=f.helper.snapshot();
    const depth=snapshot.owners.filter(row=>row.kind==='shadow-derived');assert.equal(depth.length,2);
    const links=snapshot.links.filter(row=>depth.some(owner=>owner.id===row[0]));assert.equal(new Set(links.map(row=>row[1])).size,1);
    assert.equal(snapshot.stats.bridgeInstalled,0);assert.ok(depth.every(owner=>owner.useInstances===1));
  }finally{f.dispose();}
});
test('actual standalone base creation can dispose before asynchronous native compilation; weak bridge preserves original callback once',async()=>{
  const f=fixture(),gate=Promise.withResolvers();let delayed;
  try{
    f.shadow._options.standalone=true;f.material.isReadyForSubMesh=()=>{delayed=f.create({extraInitializationsAsync:()=>gate.promise,defines:'#define INSTANCES\n#define THIN_INSTANCES'});return false;};
    f.final();assert.equal(f.generator.isReady(f.sub,false),false);assert.ok(delayed instanceof Effect);
    assert.equal(delayed._pipelineContext,null);assert.equal(Object.hasOwn(delayed,'_onRenderingStateCompiled'),true);
    let callbacks=0;delayed.onCompileObservable.add(()=>callbacks++);delayed.dispose();assert.equal(delayed.isDisposed,true);
    const before=f.helper.snapshot();assert.equal(before.stats.createWithoutModules,1);assert.equal(before.stats.releaseWithoutModules,1);
    assert.equal(before.coverage.unresolvedOwnerLinks,1);assert.equal(before.evidenceComplete,false,'no current modules cannot imply complete owner evidence');
    gate.resolve();await flush();assert.equal(callbacks,1);assert.ok(delayed._pipelineContext instanceof WebGPUPipelineContext);
    assert.equal(Object.hasOwn(delayed,'_onRenderingStateCompiled'),false,'bridge restores before original callback');
    f.helper.dispose();const result=f.helper.snapshot();assert.equal(result.stats.lateCompiledDisposed,1);assert.equal(result.stats.bridgeBound,1);
    assert.equal(result.coverage.unlinkedFinalModules,0);assert.equal(result.coverage.unresolvedOwnerLinks,0);assert.ok(result.links.some(row=>row[11]===1&&row[12]===1&&row[13]===1));
    assert.equal(result.owners.find(owner=>owner.kind==='shadow-base').useInstances,0,'original false arg distinct from true shader variant');
  }finally{gate.resolve();await flush();f.dispose();}
});
test('reentrant discarded next Effect is seen in original create-return scope before native guard disposal',()=>{
  const f=fixture();try{
    f.final();let once=false;
    f.engine.onBeforeShaderCompilationObservable.add(()=>{if(!once){once=true;f.material.onEffectCreatedObservable.notifyObservers({effect:f.create(),subMesh:f.sub});}});
    const result=f.generator.isReady(f.sub,false);assert.equal(result,false);
    f.helper.dispose();const snapshot=f.helper.snapshot();assert.ok(snapshot.stats.scopedCreateReturns>=1);assert.ok(snapshot.stats.releaseCalls>=1);
  }finally{f.dispose();}
});
test('camera scope preserves original false return, receiver, arguments, falsy throw and original create throw',()=>{
  const f=fixture();try{
    // Install a fresh helper around actual custom caller behavior before the call.
    f.helper.dispose();const failure=Symbol('original'),received=[];
    f.game.isMeshReadyForCamera=function(...args){received.push({receiver:this,args});if(args[0]===failure)throw 0;f.create();return false;};
    const helper=observeShaderLifetime(f.game,{enabled:true,limits:ATTRIBUTION_LIMITS,now:()=>0,valid:()=>true,stage:()=> 'submitted-frame',moduleID:m=>f.modules.get(m)??0,finalModules:()=>[]});
    assert.equal(f.game.isMeshReadyForCamera(f.mesh,'same'),false);assert.equal(received[0].receiver,f.game);assert.equal(received[0].args[1],'same');
    assert.throws(()=>f.game.isMeshReadyForCamera(failure),error=>error===0);
    helper.dispose();assert.equal(helper.snapshot().owners[0].kind,'camera');
  }finally{f.dispose();}
});
test('weak bridge foreign replacement and stopped owner cannot clobber a fresh hook or mutate sealed records',async()=>{
  const f=fixture(),gate=Promise.withResolvers();let delayed;
  try{
    f.shadow._options.standalone=true;f.material.isReadyForSubMesh=()=>{delayed=f.create({extraInitializationsAsync:()=>gate.promise});return false;};
    f.final();f.generator.isReady(f.sub,true);const captured=delayed._onRenderingStateCompiled;
    const foreign=function(...args){return Reflect.apply(captured,this,args);};delayed._onRenderingStateCompiled=foreign;
    f.helper.dispose();const sealed=f.helper.snapshot();assert.ok(sealed.issues.restoreConflicts>0);assert.equal(delayed._onRenderingStateCompiled,foreign);
    const fresh=observeShaderLifetime(f.game,{enabled:true,limits:ATTRIBUTION_LIMITS,valid:()=>true,finalModules:()=>[]});
    gate.resolve();await flush();assert.deepEqual(f.helper.snapshot(),sealed);assert.equal(delayed._onRenderingStateCompiled,foreign);
    fresh.dispose();
  }finally{gate.resolve();await flush();f.dispose();}
});
test('native registry duplicate/override discovery, hardened/unknown contracts and bounded owner/link JSON remain explicit',()=>{
  const f=fixture({meshes:1,links:1});try{
    f.light._shadowGenerators.set('other camera',f.generator);f.light._shadowGenerators.entries=()=>{throw Error('foreign iterator');};
    f.scene.lights.push(f.light);f.final();assert.equal(f.helper.snapshot().stats.generatorRegistrations,1);
    f.generator.isReady(f.sub,true);f.shadow._makeEffect(f.sub,['#define OTHER_DEPTH'],f.generator,7);
    f.helper.dispose();const snapshot=f.helper.snapshot();assert.equal(snapshot.owners.length,1);assert.equal(snapshot.links.length,1);assert.ok(snapshot.issues.overflow>0);
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<16384);assert.equal(snapshot.evidenceComplete,false);
    const unknown=observeShaderLifetime({engine:{},scene:{lights:[]}}, {enabled:true,limits:ATTRIBUTION_LIMITS});unknown.dispose();assert.equal(unknown.snapshot().evidenceComplete,false);
  }finally{f.dispose();}
});
test('strict original receiver/return/falsy-throw and callback exactly-once contract uses no Promise replacement',()=>{
  const returned={},seen=[],module={},effect={defines:'',_isDisposed:false};let throwCreate=false,compiled=0;
  effect._onRenderingStateCompiled=function(...args){compiled++;assert.equal(this,effect);if(args[1]==='throw')throw 0;return returned;};
  const originalCallback=effect._onRenderingStateCompiled;
  const engine={currentRenderPassId:0,createEffect(...args){seen.push({receiver:this,args});if(throwCreate)throw null;return effect;},_releaseEffect(...args){seen.push({receiver:this,args});return false;}};
  const game={engine,scene:{lights:[]},isMeshReadyForCamera(mesh){engine.createEffect(mesh,'same');return returned;}};
  let weakOriginal=false,weakFunctions=0;
  class TrackingWeakRef extends WeakRef{constructor(value){super(value);if(value===originalCallback)weakOriginal=true;if(typeof value==='function')weakFunctions++;}}
  const helper=observeShaderLifetime(game,{enabled:true,limits:ATTRIBUTION_LIMITS,WeakRef:TrackingWeakRef,valid:()=>true,stage:()=> 'submitted-frame',moduleID:value=>value===module?1:0,finalModules:()=>[1]});
  try{
    assert.equal(game.isMeshReadyForCamera({}),returned);assert.equal(seen[0].receiver,engine);assert.equal(seen[0].args[1],'same');
    assert.equal(weakOriginal,true,'own callback function descriptor is weak too');assert.ok(weakFunctions>=4,'hook bookkeeping retains wrappers via WeakRef');
    const context={stages:{vertexStage:{module},fragmentStage:{module}}};
    assert.equal(effect._onRenderingStateCompiled(context,'extra'),returned);assert.equal(compiled,1);assert.equal(effect._onRenderingStateCompiled,originalCallback);
    assert.throws(()=>effect._onRenderingStateCompiled(context,'throw'),error=>error===0);assert.equal(compiled,2);
    assert.equal(engine._releaseEffect(effect,'original'),false);assert.equal(seen.at(-1).receiver,engine);assert.equal(seen.at(-1).args[1],'original');
    throwCreate=true;assert.throws(()=>game.isMeshReadyForCamera({}),error=>error===null);
    const other={};assert.throws(()=>engine.createEffect.call(other,'x'),error=>error===null);assert.equal(seen.at(-1).receiver,other);
  }finally{helper.dispose();}
});
test('hardened actual generator stays untouched; unregistered late generator is unscoped and never falsely complete',()=>{
  const f=fixture();let helper;
  try{
    f.helper.dispose();Object.defineProperty(f.generator,'isReady',{value:ShadowGenerator.prototype.isReady,writable:false,configurable:false});
    helper=observeShaderLifetime(f.game,{enabled:true,limits:ATTRIBUTION_LIMITS,valid:()=>true,moduleID:value=>f.modules.get(value)??0,finalModules:()=>[...f.finalModules]});
    f.final();assert.equal(f.generator.isReady(f.sub,false),true);helper.dispose();const snapshot=helper.snapshot();
    assert.equal(f.generator.isReady,ShadowGenerator.prototype.isReady);assert.ok(snapshot.issues.unknown>0);assert.ok(snapshot.stats.unscopedCreateReturns>0);assert.equal(snapshot.evidenceComplete,false);
  }finally{helper?.dispose();f.dispose();}
  const g=fixture();try{
    g.final();const late=Object.assign(Object.create(ShadowGenerator.prototype),{_scene:g.scene,_light:g.light,_shadersLoaded:true,_textureType:0,_filter:0,_normalBias:0});
    g.light._shadowGenerators.set('late',late);late.isReady(g.sub,false);g.helper.dispose();
    assert.ok(g.helper.snapshot().stats.unscopedCreateReturns>0);assert.equal(g.helper.snapshot().evidenceComplete,false);
  }finally{g.dispose();}
});
test('owner validity retirement seals before late native compilation; foreign engine method is preserved through rejoin',async()=>{
  const f=fixture(),gate=Promise.withResolvers();let delayed;
  try{
    f.shadow._options.standalone=true;f.material.isReadyForSubMesh=()=>{delayed=f.create({extraInitializationsAsync:()=>gate.promise});return false;};
    f.final();f.generator.isReady(f.sub,true);f.game.disposed=true;
    const previous=f.engine.createEffect,foreign=function(...args){return Reflect.apply(previous,this,args);};f.engine.createEffect=foreign;
    // Existing wrapper notices foreign critical owner before any new bookkeeping.
    f.helper.refresh();const sealed=f.helper.snapshot();assert.equal(sealed.active,false);assert.equal(f.engine.createEffect,foreign);
    gate.resolve();await flush();assert.deepEqual(f.helper.snapshot(),sealed);assert.equal(Object.hasOwn(delayed,'_onRenderingStateCompiled'),false);
    f.game.disposed=false;const fresh=observeShaderLifetime(f.game,{enabled:true,limits:ATTRIBUTION_LIMITS,valid:()=>true});fresh.dispose();
    assert.equal(f.engine.createEffect,foreign);
  }finally{gate.resolve();await flush();f.dispose();}
});
test('actual pre-release scalar identifies stale cache deletion without altering native cache behavior',()=>{
  const f=fixture();try{
    f.final();f.generator.isReady(f.sub,false);const first=f.shadow._subMeshToDepthWrapper.get(f.sub,f.generator).mainDrawWrapper.effect;
    const other=f.create(),key=first._key,otherKey=other._key;
    f.engine._compiledEffects[key]=other;first.dispose();assert.equal(f.engine._compiledEffects[key],undefined,'native truthy-entry release behavior is unchanged');
    f.helper.dispose();const snapshot=f.helper.snapshot();assert.equal(snapshot.stats.cacheReleaseOther,1);
    assert.ok(snapshot.links.some(row=>row[14]===2&&row[15]===0));assert.equal(other._key,otherKey);
    assert.doesNotMatch(JSON.stringify(snapshot),new RegExp(otherKey.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  }finally{f.dispose();}
});
test('existing maximum512 owner/1024 link cap has a concrete scalar byte budget with native Effects',()=>{
  const f=fixture();try{
    f.final();for(let i=0;i<ATTRIBUTION_LIMITS.meshes;i++){
      const mesh={name:'vehicle '+i,instances:[],isReady(){f.create();f.create();return false;}};
      assert.equal(f.game.isMeshReadyForCamera(mesh),false);
    }
    f.helper.dispose();const snapshot=f.helper.snapshot();assert.equal(snapshot.owners.length,ATTRIBUTION_LIMITS.meshes);assert.equal(snapshot.links.length,ATTRIBUTION_LIMITS.links);
    assert.equal(snapshot.coverage.unlinkedFinalModules,0);assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<1024*1024);
  }finally{f.dispose();}
});
test('actual profile integration shares lifetime and terminal owner/link budgets without extra module queries',async()=>{
  const f=fixture();let profile,attribution;
  try{
    f.helper.dispose();const createModule=f.engine._device.createShaderModule;let queries=0;
    f.engine._device.createShaderModule=function(...args){const module=Reflect.apply(createModule,this,args);module.getCompilationInfo=()=>{queries++;return Promise.resolve({messages:[]});};return module;};
    f.engine._device.queue={submit(){}};profile=new WebGpuCompilationProfile(f.engine);f.game.compilationProfile=profile;
    attribution=observeShaderAttribution(f.game,{enabled:true,limits:{meshes:2,links:2}});f.final();profile.setStage('submitted-frame');
    f.generator.isReady(f.sub,false);
    const secondMesh={...f.mesh,name:'vehicle second',onDisposeObservable:new Observable()},second={...f.sub,_mesh:secondMesh,_renderingMesh:secondMesh,getMesh:()=>secondMesh};
    f.material.onEffectCreatedObservable.notifyObservers({effect:f.base,subMesh:second});f.generator.isReady(second,false);
    await flush();const before=queries;attribution.dispose();const snapshot=attribution.snapshot();
    assert.equal(queries,before);assert.equal(snapshot.jobTraceComplete,true);assert.equal(snapshot.lifetime.coverage.unlinkedFinalModules,0);
    assert.equal(snapshot.lifetime.links.length,2);assert.equal(snapshot.lifetime.owners.length,2);
    assert.ok(snapshot.mapping.links.length+snapshot.lifetime.links.length<=2);assert.ok(snapshot.mapping.meshes.length+snapshot.lifetime.owners.length<=2);
    assert.ok(snapshot.issues.mappingOverflow>0);assert.equal(snapshot.lifetime.issues.overflow,0);
  }finally{attribution?.dispose();profile?.dispose();f.dispose();}
});
test('actual Game camera method switches7→42 before create ownership and restores7 on return and original throw',()=>{
  const f=fixture();try{
    f.final();f.game.camera.renderPassId=42;let requested;
    const mesh={name:'vehicle camera test',instances:[],isReady(check){requested=check;assert.equal(f.engine.currentRenderPassId,42);f.create();return false;}};
    assert.equal(f.game.isMeshReadyForCamera(mesh),false);assert.equal(requested,true);assert.equal(f.engine.currentRenderPassId,7);
    const failure=Symbol('original readiness failure');
    assert.throws(()=>f.game.isMeshReadyForCamera({isReady(){assert.equal(f.engine.currentRenderPassId,42);throw failure;}}),error=>error===failure);
    assert.equal(f.engine.currentRenderPassId,7);f.helper.dispose();
    assert.equal(f.helper.snapshot().owners.find(owner=>owner.meshName==='vehicle camera test').passID,42);
    assert.equal(f.game.isMeshReadyForCamera,runActualCameraMethod);
  }finally{f.dispose();}
});
