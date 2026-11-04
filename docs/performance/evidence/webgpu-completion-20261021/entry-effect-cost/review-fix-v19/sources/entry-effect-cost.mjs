import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.pure.js';
import { ThinEngine } from '@babylonjs/core/Engines/thinEngine.pure.js';
import { EffectCallProfile, EFFECT_IDS, EFFECT_LIMITS, EFFECT_SCOPE, EFFECT_REASONS } from './entry-effect-cost-core.mjs';

const sceneOwners=new WeakMap(),nativeRender=Scene.prototype.render;
const methods=[[Scene.prototype,'_activeMesh'],[TransformNode.prototype,'computeWorldMatrix'],[Mesh.prototype,'getLOD'],
  [PBRBaseMaterial.prototype,'isReadyForSubMesh'],[StandardMaterial.prototype,'isReadyForSubMesh'],
  [PBRBaseMaterial.prototype,'bindForSubMesh'],[StandardMaterial.prototype,'bindForSubMesh'],[PBRBaseMaterial.prototype,'_prepareEffect']]
  .map(([target,key])=>({target,key,expected:Object.getOwnPropertyDescriptor(target,key)?.value}));
const origins=[{prototype:WebGPUEngine.prototype,method:WebGPUEngine.prototype.createEffect,name:'webgpu-own'},
  {prototype:ThinEngine.prototype,method:ThinEngine.prototype.createEffect,name:'thinengine-inherited'}];
const same=(a,b)=>!!a===!!b&&(!a||['value','get','set','writable','configurable','enumerable'].every(k=>a[k]===b[k]));
const sceneOf=receiver=>{try{const d=receiver&&Object.getOwnPropertyDescriptor(receiver,'_scene');return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}};
function origin(engine){let p=engine;while(p){const d=Object.getOwnPropertyDescriptor(p,'createEffect');if(d){const match=origins.find(o=>o.prototype===p&&o.method===d.value);
    if(!match||!Object.hasOwn(d,'value'))throw Error('Effect engine origin/foreign wrapper');return match;}p=Object.getPrototypeOf(p);}throw Error('Effect engine method missing');}

/** Driven exclusively by the original Game Scene.render. No render/readiness call is added. */
export function captureEntryEffects(game,{enabled=false,now,signal,isRetired=()=>false}={}){
  if(!enabled)return;
  const scene=game.scene,engine=game.engine;
  if(!(scene instanceof Scene)||scene._engine!==engine||sceneOwners.has(scene)||scene.isDisposed||game.disposed||!game.ready||isRetired()||signal?.aborted)throw Error('Effect capture requires ready unowned Game');
  const engineOrigin=origin(engine),ownEngine=Object.getOwnPropertyDescriptor(engine,'createEffect'),oldRender=Object.getOwnPropertyDescriptor(scene,'render');
  // The original is inherited from a pinned native class, never a guessed own wrapper.
  if(ownEngine||scene.render!==nativeRender||(oldRender&&(!Object.hasOwn(oldRender,'value')||(!oldRender.configurable&&!oldRender.writable)))||!Object.isExtensible(engine))throw Error('Effect instance descriptor/ownership');
  const rendererId=game.renderHealth?.rendererId,generation=game.renderHealth?.generation;
  if(!Number.isSafeInteger(rendererId)||rendererId<1||!Number.isSafeInteger(generation)||generation<1||game.renderHealth.phase!=='ready'||game.renderHealth.errorCount!==0||
      game.renderHealth.pendingByKind?.preparation!==0||game.renderHealth.pendingByKind?.['shader-validation']!==0)throw Error('Effect renderer identity/readiness');
  const state={game,scene,engine,health:game.renderHealth,device:engine._device,startup:game.startupAbort,actor:game.actor,retired:isRetired,signal};game=null;isRetired=null;signal=null;
  const frames=[],phases=[],detaches=[],renderers=new Map();let core,closed=false,rendering=false,phaseEvents=0,phaseErrors=0,restoreConflicts=0,reason=null,sealed;
  let resolveDone;const done=new Promise(resolve=>{resolveDone=resolve;});
  const owner={done,dispose:why=>stop(why??'disposed'),snapshot:()=>sealed??snapshot()};sceneOwners.set(scene,owner);
  const phase=()=>phases.at(-1)?.phase??'other';
  function snapshot(){return{schemaVersion:1,scope:EFFECT_SCOPE,limits:EFFECT_LIMITS,targets:[...EFFECT_IDS],engineOrigin:engineOrigin.name,rendererId,generation,frames:structuredClone(frames),
    complete:closed&&reason==='complete'&&frames.length===8&&!core?.errors&&!phaseErrors&&!restoreConflicts&&!core?.restoreConflicts&&frames.every(f=>f.progressed&&!f.threw&&!f.errors&&!f.depthSkipped&&!f.callsSkipped),
    reason,errors:core?.errors??0,phaseErrors,restoreConflicts:restoreConflicts+(core?.restoreConflicts??0),installedRoutineHooks:core?10:0,remainingRoutineHooks:core?.hooks.length??0,active:!closed};}
  function enter(name,token){if(!rendering||closed)return;if(++phaseEvents>EFFECT_LIMITS.phaseEvents||phases.length>=32){phaseErrors++;return;}phases.push({phase:name,token});}
  function leave(token){if(!rendering||closed)return;if(phases.at(-1)?.token!==token){phaseErrors++;return;}phases.pop();}
  function observe(observable,callback){const o=observable.add(callback);if(!o)throw Error('Effect phase observer unavailable');detaches.push(()=>observable.remove(o));}
  function track(renderer){if(closed||renderers.has(renderer))return;if(renderers.size>=EFFECT_LIMITS.renderers){phaseErrors++;return;}
    let a,b;try{a=renderer.onInitRenderingObservable.add(()=>enter('rtt',renderer));if(!a)throw Error('Effect RTT before observer unavailable');
      b=renderer.onFinishRenderingObservable.add(()=>leave(renderer));if(!b)throw Error('Effect RTT after observer unavailable');
      renderers.set(renderer,()=>{try{renderer.onInitRenderingObservable.remove(a);}finally{renderer.onFinishRenderingObservable.remove(b);}});
    }catch(error){try{if(a)renderer.onInitRenderingObservable.remove(a);}catch{phaseErrors++;}throw error;}}
  function stop(why){if(closed)return;closed=true;reason=EFFECT_REASONS.includes(why)?why:'external-dispose';core?.dispose();
    for(const detach of [...detaches.splice(0),...renderers.values()])try{detach();}catch{phaseErrors++;}renderers.clear();phases.length=0;
    const liveScene=state.scene;
    try{state.signal?.removeEventListener('abort',aborted);}catch{phaseErrors++;}
    try{const d=Object.getOwnPropertyDescriptor(liveScene,'render');if(same(d,{...(oldRender??{configurable:true,writable:true,enumerable:false}),value:render})){
      if(oldRender)Object.defineProperty(liveScene,'render',oldRender);else delete liveScene.render;
    }else if(!same(d,oldRender))restoreConflicts++;}catch{restoreConflicts++;}
    if(sceneOwners.get(liveScene)===owner)sceneOwners.delete(liveScene);
    state.game=state.scene=state.engine=state.health=state.device=state.startup=state.actor=state.retired=state.signal=null;
    sealed=snapshot();resolveDone(sealed);
  }
  const aborted=()=>stop('aborted');
  function render(){if(closed||this!==state.scene)return Reflect.apply(nativeRender,this,arguments);
    let retired;try{retired=state.retired()||state.game.disposed||state.scene.isDisposed||state.engine.isDisposed===true||state.game.scene!==state.scene||state.game.engine!==state.engine||
      state.game.renderHealth!==state.health||state.health.rendererId!==rendererId||state.health.generation!==generation||state.engine._device!==state.device||
      state.health.phase!=='ready'||state.health.errorCount!==0||state.health.pendingByKind?.preparation!==0||state.health.pendingByKind?.['shader-validation']!==0||
      state.game.startupAbort!==state.startup||state.startup?.signal.aborted||state.game.actor!==state.actor||state.game.ready!==true||state.game.rendererFailed||state.game.benchmark||state.game.startupPresentationLease||state.game.preparingRenderQuality;}
    catch{phaseErrors++;stop('observer-error');return Reflect.apply(nativeRender,this,arguments);}
    if(retired){stop('retired');return Reflect.apply(nativeRender,this,arguments);}
    if(rendering){phaseErrors++;return Reflect.apply(nativeRender,this,arguments);}
    if(!core.ownsHooks()){phaseErrors++;stop('foreign-routine');return Reflect.apply(nativeRender,this,arguments);}
    try{for(const r of state.scene.objectRenderers)track(r);}catch{phaseErrors++;stop('observer-error');return Reflect.apply(nativeRender,this,arguments);}
    const before=state.scene._frameId;if(!Number.isSafeInteger(before)||before<0){phaseErrors++;stop('no-native-frame-progress');return Reflect.apply(nativeRender,this,arguments);}
    rendering=true;phaseEvents=0;phases.length=0;core.beginFrame(before);let threw=true;
    try{const result=Reflect.apply(nativeRender,this,arguments);threw=false;return result;}
    finally{if(!closed){const f=core.endFrame(),after=state.scene._frameId;f.nativeFrameIdAfter=Number.isSafeInteger(after)&&after>=0?after:null;f.progressed=f.nativeFrameIdAfter===before+1;f.threw=threw;
      if(phases.length)phaseErrors++;frames.push(f);rendering=false;phases.length=0;
      if(threw)stop('original-render-threw');else if(!f.progressed)stop('no-native-frame-progress');else if(frames.length===8)stop('complete');}}
  }
  try{
    core=new EffectCallProfile([{id:EFFECT_IDS[0],target:scene,key:'getActiveMeshCandidates',expected:scene.getActiveMeshCandidates,accepts:r=>r===state.scene},
      ...methods.slice(0,7).map((m,i)=>({...m,id:EFFECT_IDS[i+1],accepts:r=>i===0?r===state.scene:sceneOf(r)===state.scene})),
      {...methods[7],id:EFFECT_IDS[8],accepts:(r,args)=>sceneOf(r)===state.scene&&sceneOf(args[0])===state.scene},
      {id:EFFECT_IDS[9],target:engine,key:'createEffect',expected:engineOrigin.method,allowInherited:true,accepts:r=>r===state.engine}],{now,phase});
    for(const[a,b,name]of [[scene.onBeforeActiveMeshesEvaluationObservable,scene.onAfterActiveMeshesEvaluationObservable,'active'],[scene.onBeforeDrawPhaseObservable,scene.onAfterDrawPhaseObservable,'main']]){observe(a,()=>enter(name,a));observe(b,()=>leave(a));}
    observe(scene.onNewObjectRendererAddedObservable,r=>{if(closed)return;try{if(state.scene.objectRenderers.includes(r))track(r);}catch{phaseErrors++;stop('observer-error');}});
    observe(scene.onObjectRendererRemovedObservable,r=>{if(closed)return;try{renderers.get(r)?.();renderers.delete(r);}catch{phaseErrors++;stop('observer-error');}});
    observe(scene.onDisposeObservable,()=>stop('scene-disposed'));state.signal?.addEventListener('abort',aborted,{once:true});
    Object.defineProperty(scene,'render',{...(oldRender??{configurable:true,writable:true,enumerable:false}),value:render});
  }catch(error){stop('installation-failed');throw error;}
  return owner;
}
