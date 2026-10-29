import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode.js';
import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { RoutineCallProfile, ROUTINE_IDS, ROUTINE_LIMITS, validateRoutineProfile } from './routine-cost-core.mjs';

export const STARTUP_TARGETS = Object.freeze(['first-medium-vehicle-0','first-low-day-1-on','first-high-day-1-on']);
export const STARTUP_LIMITS = Object.freeze({ passes:16, stages:304, frames:8, bytes:256*1024 });
export const STARTUP_SCOPE='Original startup stage/variants boundaries and selected synchronous options.render only. Eight routine inclusive/selfSelected spans include observer/JIT/GC/scheduling; not GPU, FPS or shader ownership.';
const names=['vehicle-0','vehicle-1','vehicle-2','vehicle-keyed-0','vehicle-keyed-1','vehicle-keyed-2','current-off','current-on','night-0-off','night-0-on','night-1-off','night-1-on','night-2-off','night-2-on','day-0-off','day-0-on','day-1-off','day-1-on','restore'];
const qualities=['low','medium','high'],statuses=['complete','timeout','failed','disposed'];
const owners=new WeakMap(),optionsOwners=new WeakMap();
const bindings=[[Scene.prototype,'_activeMesh'],[TransformNode.prototype,'computeWorldMatrix'],[Mesh.prototype,'getLOD'],[PBRBaseMaterial.prototype,'isReadyForSubMesh'],[StandardMaterial.prototype,'isReadyForSubMesh'],[PBRBaseMaterial.prototype,'bindForSubMesh'],[StandardMaterial.prototype,'bindForSubMesh']].map(([target,key])=>({target,key,expected:target[key]}));
const data=(x,k)=>{try{const d=x&&Object.getOwnPropertyDescriptor(x,k);return d&&Object.hasOwn(d,'value')?d.value:undefined;}catch{return undefined;}};
const time=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const count=x=>Number.isSafeInteger(x)&&x>=0;
const fail=s=>{s.errors++;};
function live(s){
  if(!s?.active)return false;
  try{if(s.signal?.aborted||s.startupAbort?.signal.aborted||s.isCurrent?.()===false||s.game.disposed||s.scene.isDisposed||
      s.game.scene!==s.scene||s.game.engine!==s.engine||s.game.renderHealth!==s.health||data(s.health,'generation')!==s.generation||
      data(s.health,'rendererId')!==s.rendererId||data(s.health,'errorCount')!==0||s.game.startupAbort!==s.startupAbort){retire(s,'owner-retired');return false;}return true;}
  catch{fail(s);retire(s,'observer-error');return false;}
}
function detachCore(s){
  if(s.core){const result=s.core.dispose();s.errors+=result.errors;s.restoreConflicts+=result.restoreConflicts;s.core=null;}
  for(const detach of [...s.detaches.splice(0),...s.renderers.values()]){try{detach();}catch{fail(s);}}
  s.renderers.clear();s.phases.length=0;s.rendering=false;
}
function retire(s,reason){
  if(!s.active)return;
  s.active=false;s.reason=reason;detachCore(s);
  if(owners.get(s.game)===s)owners.delete(s.game);
  try{s.signal?.removeEventListener('abort',s.abort);s.startupAbort?.signal.removeEventListener('abort',s.abort);}catch{fail(s);}
  for(const c of s.contexts)c.state=null;s.contexts.length=0;
  s.game=s.scene=s.engine=s.health=s.signal=s.startupAbort=s.isCurrent=s.abort=s.profileNow=null;
}
function snapshot(s){
  const capture={...s.capture,frames:structuredClone(s.capture.frames)};
  capture.complete=capture.reached&&capture.ended&&capture.status==='complete'&&capture.frames.length>0&&!capture.capped&&!s.errors&&!s.restoreConflicts&&capture.frames.every(f=>f.progressed&&!f.threw&&!f.errors&&!f.depthSkipped&&!f.callsSkipped);
  return{schemaVersion:1,target:s.target,limits:STARTUP_LIMITS,scope:STARTUP_SCOPE,
    rendererId:s.rendererId,generation:s.generation,active:s.active,reason:s.reason,complete:!s.active&&s.reason==='startup-resolved'&&capture.complete&&!s.overflow,
    errors:s.errors,restoreConflicts:s.restoreConflicts,overflow:s.overflow,passCount:s.passCount,stageCount:s.stageCount,
    passes:structuredClone(s.passes),stages:structuredClone(s.stages),capture,remainingRoutineHooks:s.core?.hooks.length??0};
}
export function createStartupStageRoutines(game,{target=null,signal,isCurrent,profileNow}={}){
  if(target===null)return undefined;
  if(!STARTUP_TARGETS.includes(target))throw Error('Unknown startup routine target');
  const scene=data(game,'scene'),engine=data(game,'engine'),health=data(game,'renderHealth');
  if(!(scene instanceof Scene)||scene._engine!==engine||owners.has(game)||!count(data(health,'generation'))||data(health,'generation')<1||!count(data(health,'rendererId'))||data(health,'rendererId')<1)throw Error('Startup routine owner identity');
  const s={game,scene,engine,health,target,signal,isCurrent,profileNow,startupAbort:data(game,'startupAbort'),rendererId:data(health,'rendererId'),generation:data(health,'generation'),
    active:true,reason:null,errors:0,restoreConflicts:0,overflow:false,passCount:0,stageCount:0,passes:[],stages:[],contexts:[],core:null,detaches:[],renderers:new Map(),rendererRegistrations:0,captureStopped:false,phases:[],rendering:false,phaseEvents:0,
    capture:{reached:false,passIndex:null,stageIndex:null,ended:false,status:null,capped:false,frames:[]}};
  s.abort=()=>retire(s,'aborted');owners.set(game,s);
  signal?.addEventListener('abort',s.abort,{once:true});s.startupAbort?.signal.addEventListener('abort',s.abort,{once:true});
  const owner={snapshot:()=>snapshot(s),dispose:(reason='owner-stopped')=>retire(s,reason)};game=null;
  live(s);return owner;
}
// Registration never substitutes options and never reads it. The source call
// site is exact, and late/unowned calls simply retain their original behavior.
export function registerStartupOptions(game,options){
  const s=owners.get(game);if(!s||!live(s))return options;
  try{
    if(s.contexts.some(c=>c.pass&&c.pass.endedAtMs===null)){fail(s);return options;}
    const index=s.passCount++;if(index>=STARTUP_LIMITS.passes){s.overflow=true;return options;}
    const quality=data(game,'quality');if(!qualities.includes(quality)){fail(s);return options;}
    const occurrence=s.passes.filter(p=>p.quality===quality).length;
    const pass={index,quality,startedAtMs:null,endedAtMs:null,status:null};s.passes.push(pass);
    const c={state:s,pass,occurrence,stage:null};s.contexts.push(c);optionsOwners.set(options,c);
  }catch{fail(s);}return options;
}
function context(options){const c=optionsOwners.get(options);return c&&live(c.state)?c:null;}
export function startupPassStarted(options,at){const c=context(options);if(!c)return;const s=c.state;try{const previous=s.passes[c.pass.index-1];if(!time(at)||c.pass.startedAtMs!==null||(previous&&previous.endedAtMs!==null&&at<previous.endedAtMs)){fail(s);retire(s,'observer-error');}else c.pass.startedAtMs=at;}catch{fail(s);retire(s,'observer-error');}}
export function startupStageStarted(options,index,name,at){
  const c=context(options);if(!c)return;const s=c.state;
  try{
    s.stageCount++;if(s.stages.length>=STARTUP_LIMITS.stages){s.overflow=true;return;}
    if(!count(index)||index>18||!names.includes(name)||!time(at)||c.pass.startedAtMs===null||at<c.pass.startedAtMs||c.stage?.endedAtMs===null){fail(s);return;}
    c.stage={passIndex:c.pass.index,index,name,startedAtMs:at,endedAtMs:null,terminal:false,status:null};s.stages.push(c.stage);
    const selected=c.occurrence===0&&((s.target==='first-medium-vehicle-0'&&c.pass.quality==='medium'&&name==='vehicle-0')||
      (s.target==='first-low-day-1-on'&&c.pass.quality==='low'&&name==='day-1-on')||(s.target==='first-high-day-1-on'&&c.pass.quality==='high'&&name==='day-1-on'));
    if(selected){if(s.capture.reached){fail(s);return;}s.capture.reached=true;s.capture.passIndex=c.pass.index;s.capture.stageIndex=index;}
  }catch{fail(s);}
}
export function startupStageSaved(options,index,at,terminal){
  const c=context(options);if(!c)return;const s=c.state,row=c.stage;
  try{
    if(!row||row.index!==index||row.endedAtMs!==null||!time(at)||at<row.startedAtMs||typeof terminal!=='boolean'){fail(s);return;}
    row.endedAtMs=at;row.terminal=terminal;row.status=terminal?null:'complete';
    if(row.passIndex===s.capture.passIndex&&row.index===s.capture.stageIndex){s.capture.ended=true;s.capture.status=row.status;detachCore(s);}
  }catch{fail(s);}
}
export function startupPassFinished(options,at,status){
  const c=context(options);if(!c)return;const s=c.state;
  try{
    if(!time(at)||c.pass.startedAtMs===null||at<c.pass.startedAtMs||c.pass.endedAtMs!==null||!statuses.includes(status)){fail(s);return;}
    c.pass.endedAtMs=at;c.pass.status=status;if(c.stage?.terminal)c.stage.status=status;
    if(c.stage?.passIndex===s.capture.passIndex&&c.stage?.index===s.capture.stageIndex&&s.capture.ended)s.capture.status=c.stage.status;
  }catch{fail(s);}
}
function installCore(s){
  const scene=s.scene;
  const phase=()=>s.phases.at(-1)?.phase??'other';
  const enter=(phase,token)=>{if(!s.rendering)return;if(++s.phaseEvents>ROUTINE_LIMITS.phaseEvents||s.phases.length>=32){fail(s);return;}s.phases.push({phase,token});};
  const leave=token=>{if(!s.rendering)return;if(s.phases.at(-1)?.token!==token){fail(s);return;}s.phases.pop();};
  const safe=fn=>(...args)=>{try{return fn(...args);}catch{fail(s);}};
  const observe=(o,fn)=>{const observer=o.add(safe(fn));s.detaches.push(()=>o.remove(observer));};
  const track=r=>{if(s.renderers.has(r))return;if(s.rendererRegistrations>=ROUTINE_LIMITS.renderers){fail(s);return;}s.rendererRegistrations++;
    const a=r.onInitRenderingObservable.add(safe(()=>enter('rtt',r))),b=r.onFinishRenderingObservable.add(safe(()=>leave(r)));
    const stop=()=>{r.onInitRenderingObservable.remove(a);r.onFinishRenderingObservable.remove(b);};s.renderers.set(r,stop);};
  s.core=new RoutineCallProfile([{id:ROUTINE_IDS[0],target:scene,key:'getActiveMeshCandidates',accepts:r=>r===scene},
    ...bindings.map((b,i)=>({...b,id:ROUTINE_IDS[i+1],accepts:r=>i===0?r===scene:r?._scene===scene}))],{now:s.profileNow,phase});
  for(const[a,b,name]of[[scene.onBeforeActiveMeshesEvaluationObservable,scene.onAfterActiveMeshesEvaluationObservable,'active'],[scene.onBeforeDrawPhaseObservable,scene.onAfterDrawPhaseObservable,'main']]){observe(a,()=>enter(name,a));observe(b,()=>leave(a));}
  for(const r of scene.objectRenderers)track(r);
  observe(scene.onNewObjectRendererAddedObservable,r=>{if(scene.objectRenderers.includes(r))track(r);});
  observe(scene.onObjectRendererRemovedObservable,r=>{s.renderers.get(r)?.();s.renderers.delete(r);});
}
export function startupRenderBegin(options,at){
  const c=context(options);if(!c)return null;const s=c.state,row=c.stage;
  if(!row||row.passIndex!==s.capture.passIndex||row.index!==s.capture.stageIndex||s.capture.ended||s.captureStopped)return null;
  try{
    if(!time(at)||at<row.startedAtMs||s.rendering){fail(s);return null;}
    if(s.capture.frames.length>=STARTUP_LIMITS.frames){s.capture.capped=true;s.captureStopped=true;detachCore(s);return null;}
    if(!s.core)installCore(s);
    for(const h of s.core.hooks)if(Object.getOwnPropertyDescriptor(h.target,h.key)?.value!==h.wrapper){fail(s);s.captureStopped=true;detachCore(s);return null;}
    s.rendering=true;s.phases.length=0;s.phaseEvents=0;const frameId=s.scene._frameId;s.core.beginFrame(frameId);
    return{state:s,startedAtMs:at,frameId,passIndex:row.passIndex,stageIndex:row.index};
  }catch{fail(s);s.captureStopped=true;detachCore(s);return null;}
}
export function startupRenderEnd(token,at,returned){
  const s=token?.state;if(!s?.active)return;
  try{
    if(!live(s))return;const frame=s.core?.endFrame();if(!frame){fail(s);return;}
    const nativeFrameIdAfter=s.scene._frameId;
    s.capture.frames.push({...frame,startedAtMs:token.startedAtMs,endedAtMs:time(at)?at:null,passIndex:token.passIndex,stageIndex:token.stageIndex,
      nativeFrameIdAfter,progressed:nativeFrameIdAfter===token.frameId+1,threw:!returned});
    if(!time(at)||at<token.startedAtMs||typeof returned!=='boolean'||s.phases.length)fail(s);
    s.rendering=false;s.phases.length=0;
    if(!returned||nativeFrameIdAfter!==token.frameId+1){s.captureStopped=true;detachCore(s);}
  }catch{fail(s);detachCore(s);}finally{token.state=null;}
}
function closed(v,keys){if(!v||typeof v!=='object'||Array.isArray(v)||Reflect.ownKeys(v).length!==keys.length)throw Error('Startup profile closed fields');
  const o={};for(const k of keys){const d=Object.getOwnPropertyDescriptor(v,k);if(!d||!Object.hasOwn(d,'value'))throw Error('Startup profile data');o[k]=d.value;}return o;}
function arr(v,max){if(!Array.isArray(v)||v.length>max||Reflect.ownKeys(v).length!==v.length+1)throw Error('Startup profile array');return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));if(!d||!Object.hasOwn(d,'value'))throw Error('Startup profile sparse/getter');return d.value;});}
export function validateStartupStageRoutines(value,target){
  const p=closed(value,['schemaVersion','target','limits','scope','rendererId','generation','active','reason','complete','errors','restoreConflicts','overflow','passCount','stageCount','passes','stages','capture','remainingRoutineHooks']);
  if(p.schemaVersion!==1||p.target!==target||!STARTUP_TARGETS.includes(target)||p.active!==false||!['startup-resolved','startup-rejected','owner-stopped','aborted','owner-retired','observer-error'].includes(p.reason)||typeof p.complete!=='boolean'||typeof p.overflow!=='boolean'||
      ['rendererId','generation'].some(k=>!count(p[k])||p[k]<1)||['errors','restoreConflicts','passCount','stageCount','remainingRoutineHooks'].some(k=>!count(p[k]))||p.remainingRoutineHooks!==0||p.scope!==STARTUP_SCOPE)throw Error('Startup profile scalar');
  const limits=closed(p.limits,Object.keys(STARTUP_LIMITS));for(const k of Object.keys(STARTUP_LIMITS))if(limits[k]!==STARTUP_LIMITS[k])throw Error('Startup profile limits');
  p.passes=arr(p.passes,16).map((v,index)=>{const r=closed(v,['index','quality','startedAtMs','endedAtMs','status']);if(r.index!==index||!qualities.includes(r.quality)||!(r.status===null||statuses.includes(r.status))||!(r.startedAtMs===null||time(r.startedAtMs))||!(r.endedAtMs===null||time(r.endedAtMs))||(r.endedAtMs!==null&&(r.startedAtMs===null||r.endedAtMs<r.startedAtMs)))throw Error('Startup pass');return r;});
  p.stages=arr(p.stages,304).map(v=>{const r=closed(v,['passIndex','index','name','startedAtMs','endedAtMs','terminal','status']);const pass=p.passes[r.passIndex];if(!pass||!count(r.index)||r.index>18||!names.includes(r.name)||!time(r.startedAtMs)||pass.startedAtMs===null||r.startedAtMs<pass.startedAtMs||typeof r.terminal!=='boolean'||!(r.status===null||statuses.includes(r.status))||!(r.endedAtMs===null||time(r.endedAtMs))||(r.endedAtMs!==null&&r.endedAtMs<r.startedAtMs))throw Error('Startup stage');return r;});
  for(let i=1;i<p.passes.length;i++){const a=p.passes[i-1],b=p.passes[i];if(b.startedAtMs!==null&&(a.endedAtMs===null||b.startedAtMs<a.endedAtMs))throw Error('Startup pass sequence');}
  if(p.passCount<p.passes.length||p.stageCount<p.stages.length||(!p.overflow&&!p.errors&&(p.passCount!==p.passes.length||p.stageCount!==p.stages.length)))throw Error('Startup profile counts');
  const c=closed(p.capture,['reached','passIndex','stageIndex','ended','status','capped','frames','complete']);for(const k of['reached','ended','capped','complete'])if(typeof c[k]!=='boolean')throw Error('Startup capture bool');
  if(!(c.status===null||statuses.includes(c.status))||!(c.passIndex===null||count(c.passIndex))||!(c.stageIndex===null||count(c.stageIndex)))throw Error('Startup capture identity');
  c.frames=arr(c.frames,8).map(v=>{const f=closed(v,['frameId','rows','errors','depthSkipped','callsSkipped','startedAtMs','endedAtMs','passIndex','stageIndex','nativeFrameIdAfter','progressed','threw']);
    if(!time(f.startedAtMs)||!(f.endedAtMs===null||time(f.endedAtMs))||(f.endedAtMs!==null&&f.endedAtMs<f.startedAtMs)||f.passIndex!==c.passIndex||f.stageIndex!==c.stageIndex)throw Error('Startup frame bounds');
    f.rows=arr(f.rows,32).map(r=>closed(r,['id','phase','calls','inclusiveMs','selfSelectedMs','falseReturns','throws']));
    validateRoutineProfile({schemaVersion:1,targets:[...ROUTINE_IDS],frames:[f],active:false,complete:false,errors:0,phaseErrors:0,restoreConflicts:0});return f;});
  const row=p.stages.find(r=>r.passIndex===c.passIndex&&r.index===c.stageIndex);
  if(c.reached?(!row||!p.passes[c.passIndex]||c.ended!==(row.endedAtMs!==null)||c.status!==row.status):(c.passIndex!==null||c.stageIndex!==null||c.frames.length||c.ended||c.status!==null))throw Error('Startup target relation');
  if(c.reached){const q=target==='first-medium-vehicle-0'?'medium':target==='first-low-day-1-on'?'low':'high',name=target==='first-medium-vehicle-0'?'vehicle-0':'day-1-on';
    if(p.passes[c.passIndex].quality!==q||row.name!==name||p.passes.slice(0,c.passIndex).some(p=>p.quality===q))throw Error('Startup target recipe');}
  for(const pass of p.passes){const rows=p.stages.filter(r=>r.passIndex===pass.index);let previous;
    const sequences=[names,names.filter(n=>!n.startsWith('day-')),names.filter(n=>!n.startsWith('vehicle-')),names.filter(n=>!n.startsWith('day-')&&!n.startsWith('vehicle-'))];
    if(!sequences.some(sequence=>rows.every((r,index)=>r.name===sequence[index])))throw Error('Startup stage recipe order');
    for(const r of rows){if((previous&&(r.index!==previous.index+1||previous.endedAtMs===null||r.startedAtMs<previous.endedAtMs))||(!previous&&r.index!==0)||(pass.endedAtMs!==null&&(r.endedAtMs===null||r.endedAtMs>pass.endedAtMs)))throw Error('Startup stage order');previous=r;}}
  if(c.frames.some(f=>f.startedAtMs<row.startedAtMs||(row.endedAtMs!==null&&f.endedAtMs>row.endedAtMs)))throw Error('Startup frame outside stage');
  for(let i=1;i<c.frames.length;i++){const a=c.frames[i-1],b=c.frames[i];if(b.startedAtMs<a.startedAtMs||(a.endedAtMs!==null&&b.startedAtMs<a.endedAtMs)||b.frameId<a.nativeFrameIdAfter)throw Error('Startup frame sequence');}
  const ok=c.reached&&c.ended&&c.status==='complete'&&c.frames.length>0&&!c.capped&&!p.errors&&!p.restoreConflicts&&c.frames.every(f=>f.endedAtMs!==null&&f.progressed&&f.nativeFrameIdAfter===f.frameId+1&&!f.threw&&!f.errors&&!f.depthSkipped&&!f.callsSkipped);
  if(c.complete!==ok||p.complete!==(!p.active&&p.reason==='startup-resolved'&&ok&&!p.overflow))throw Error('Startup false complete');
  p.capture=c;p.limits=limits;if(JSON.stringify(p).length>STARTUP_LIMITS.bytes)throw Error('Startup profile byte cap');return value;
}
