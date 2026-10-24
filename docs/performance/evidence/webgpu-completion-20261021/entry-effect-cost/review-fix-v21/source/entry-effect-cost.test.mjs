import { captureEntryEffectTrigger, validateEntryEffectTrigger } from './entry-effect-trigger.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { dirname,resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import { ThinEngine } from '@babylonjs/core/Engines/thinEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js';
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial.js';
import { PBRBaseMaterial } from '@babylonjs/core/Materials/PBR/pbrBaseMaterial.js';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight.js';
import { GltfLightBudget } from '../../../../../client/gltf-light-budget.ts';
import { StableLightState } from '../../../../../client/stable-light-state.ts';
import { observeOperation,observePreparationResult } from './startup-observer.mjs';
import { createAttemptQueue } from './attempt-queue.mjs';
import { observeStartupLatency } from './startup-latency.mjs';
import { observeBufferLifecycle } from './buffer-lifecycle.mjs';
import { createHash,webcrypto } from 'node:crypto';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import ts from 'typescript';
import { EffectCallProfile,EFFECT_IDS,EFFECT_SCOPE,EFFECT_LIMITS,validateEntryEffectProfile } from './entry-effect-cost-core.mjs';
import { captureEntryEffects } from './entry-effect-cost.mjs';
import { captureEntryRoutineCost,validateEntryTrigger } from './entry-routine-cost.mjs';
import { validateReceipt } from './receipt.mjs';
import { helperIdentity,parseBuildOptions,sourceFiles,transformUI } from './common.mjs';
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,'../../../../..');
const donorDirectory=join(root,'docs/performance/evidence/webgpu-completion-20261021/entry-effect-cost/donor-v17');
const turn=()=>new Promise(r=>setImmediate(r));
const row=(f,id,phase='main')=>f.rows.find(r=>r.id===id&&r.phase===phase);
const gameText=fs.readFileSync(join(root,'client/game.ts'),'utf8'),gameTree=ts.createSourceFile('game.ts',gameText,ts.ScriptTarget.Latest,true);
const gameClass=gameTree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Game'),actualFrame=gameClass?.members.find(n=>n.name?.getText(gameTree)==='frame');
assert.ok(actualFrame&&ts.isMethodDeclaration(actualFrame)&&actualFrame.body,'original Game.frame method');
const preludeNames=['this.gltfLightBudget.prepareFrame();','this.stableLights.update();','this.scene.render();'];
const preludeIndices=preludeNames.map(name=>actualFrame.body.statements.findIndex(n=>n.getText(gameTree)===name));
assert.ok(preludeIndices[0]>=0);assert.equal(preludeIndices[1],preludeIndices[0]+1);assert.equal(preludeIndices[2],preludeIndices[1]+1);
const actualPrelude=new Function(preludeIndices.map(i=>actualFrame.body.statements[i].getText(gameTree)).join('\n'));
function targets(){return EFFECT_IDS.map(id=>{const target={run(){}};return{id,target,key:'run',expected:target.run};});}
function nativeFixture(t,MaterialClass=PBRMaterial){
  const engine=new NullEngine(),scene=new Scene(engine);scene.texturesEnabled=false;
  const camera=new FreeCamera('actual CPU camera',new Vector3(0,0,-5),scene);camera.setTarget(Vector3.Zero());scene.activeCamera=camera;
  const light=new HemisphericLight('actual CPU lamp',Vector3.Up(),scene),mesh=CreateBox('actual CPU receiver',{},scene),material=new MaterialClass('actual CPU material',scene);mesh.material=material;
  const game={scene,engine,ready:true,disposed:false,renderHealth:{rendererId:7,generation:2,phase:'ready',errorCount:0,pendingByKind:{preparation:0,'shader-validation':0}}};
  t.after(()=>{scene.dispose();engine.dispose();});return{engine,scene,camera,light,mesh,material,game};
}
async function warm(f){for(let i=0;i<20;i++){f.scene.render();await turn();if(f.material.isReadyForSubMesh(f.mesh,f.mesh.subMeshes[0],false))return;}assert.fail('Actual native material ready');}
function entryFixture(t){
  const f=nativeFixture(t);class Game{}Object.setPrototypeOf(f.game,Game.prototype);
  const budget=new GltfLightBudget(f.scene),stable=new StableLightState(f.scene);t.after(()=>{budget.dispose();stable.dispose();});
  Object.assign(f.game,{gltfLightBudget:budget,stableLights:stable,actor:{vehicle:false},startupAbort:new AbortController()});
  Object.assign(f.game.renderHealth,{phase:'ready',errorCount:0,pendingByKind:{preparation:0,'shader-validation':0}});
  f.game.renderHealth.snapshot=()=>({rendererId:7,generation:2,phase:'ready',valid:true,errorCount:0,pendingOperations:0,firstErrors:[]});
  const expected={classes:{Game,Scene,GltfLightBudget,StableLightState},methods:{prepareFrame:GltfLightBudget.prototype.prepareFrame,render:Scene.prototype.render}};
  let time=100,timer=null,factories=0;
  const options={enabled:true,expected,now:()=>time,setTimer:cb=>(timer=cb),clearTimer(){timer=null;},startCapture(g,o){factories++;assert.equal(g.gltfLightBudget.prepareFrame,expected.methods.prepareFrame);return captureEntryEffects(g,o);}};
  const frame=()=>{f.engine.beginFrame();actualPrelude.call(f.game);f.engine.endFrame();};
  return{...f,expected,options,frame,advance:ms=>{time+=ms;},factories:()=>factories,timer:()=>timer};
}

test('default-off returns without even reading Game',()=>{
  const game=new Proxy({},{get(){assert.fail('disabled Game read');}});assert.equal(captureEntryEffects(game),undefined);
});
test('one ten-target hierarchy subtracts prepare/create children and counts clean null',()=>{
  let time=0;const ts=targets();
  ts[9].target.run=function(){time+=3;return {};};ts[9].expected=ts[9].target.run;
  ts[8].target.run=function(){time+=1;ts[9].target.run();time+=1;return null;};ts[8].expected=ts[8].target.run;
  ts[4].target.run=function(){time+=1;ts[8].target.run();time+=1;return true;};ts[4].expected=ts[4].target.run;
  const p=new EffectCallProfile(ts,{now:()=>time,phase:()=> 'main'});p.beginFrame(20);assert.equal(ts[4].target.run(),true);const f=p.endFrame();p.dispose();
  assert.deepEqual([row(f,EFFECT_IDS[4]).inclusiveMs,row(f,EFFECT_IDS[4]).selfSelectedMs],[7,2]);
  assert.deepEqual([row(f,EFFECT_IDS[8]).inclusiveMs,row(f,EFFECT_IDS[8]).selfSelectedMs,row(f,EFFECT_IDS[8]).nullReturns],[5,2,1]);
  assert.deepEqual([row(f,EFFECT_IDS[9]).inclusiveMs,row(f,EFFECT_IDS[9]).selfSelectedMs],[3,3]);
  assert.equal(f.errors,0);assert.equal(row(f,EFFECT_IDS[4]).selfSelectedMs+row(f,EFFECT_IDS[8]).selfSelectedMs+row(f,EFFECT_IDS[9]).selfSelectedMs,7);
});
test('Standard direct readiness-to-engine hierarchy counts createEffect and subtracts its selected time',()=>{
  let time=0;const ts=targets(),effect={};
  ts[9].target.run=function(){time+=3;return effect;};ts[9].expected=ts[9].target.run;
  ts[5].target.run=function(){time+=2;assert.equal(ts[9].target.run(),effect);time+=1;return true;};ts[5].expected=ts[5].target.run;
  const p=new EffectCallProfile(ts,{now:()=>time,phase:()=> 'main'});p.beginFrame(20);assert.equal(ts[5].target.run(),true);const f=p.endFrame();p.dispose();
  assert.deepEqual([row(f,EFFECT_IDS[5]).calls,row(f,EFFECT_IDS[5]).inclusiveMs,row(f,EFFECT_IDS[5]).selfSelectedMs],[1,6,3]);
  assert.deepEqual([row(f,EFFECT_IDS[9]).calls,row(f,EFFECT_IDS[9]).inclusiveMs,row(f,EFFECT_IDS[9]).selfSelectedMs],[1,3,3]);
  assert.equal(row(f,EFFECT_IDS[4]).calls,0);assert.equal(row(f,EFFECT_IDS[8]).calls,0);
  assert.equal(row(f,EFFECT_IDS[5]).selfSelectedMs+row(f,EFFECT_IDS[9]).selfSelectedMs,6);assert.equal(f.errors,0);
});
for(const value of [undefined,null,false,0,'',Promise.resolve(3)])test('original return identity '+String(value),()=>{
  const ts=targets(),args=[{},2],receiver=ts[8].target;ts[8].target.run=function(...a){assert.equal(this,receiver);assert.deepEqual(a,args);return value;};ts[8].expected=ts[8].target.run;
  const p=new EffectCallProfile(ts,{now:()=>0});p.beginFrame(1);assert.equal(receiver.run(...args),value);const f=p.endFrame();p.dispose();assert.equal(row(f,EFFECT_IDS[8],'other').nullReturns,Number(value===null));
});
for(const error of [undefined,null,false,0,'',new Error('original')])test('original falsy/error throw '+String(error),()=>{
  const ts=targets();ts[8].target.run=()=>{throw error;};ts[8].expected=ts[8].target.run;const p=new EffectCallProfile(ts,{now:()=>0});p.beginFrame(1);
  assert.throws(()=>ts[8].target.run(),x=>x===error);const f=p.endFrame();p.dispose();assert.equal(row(f,EFFECT_IDS[8],'other').throws,1);
});
test('foreign material barrier and standalone engine calls do not borrow an own parent association',()=>{
  const ts=targets();let calls=0;ts[9].target.run=()=>++calls;ts[9].expected=ts[9].target.run;
  ts[8].target.run=()=>ts[9].target.run();ts[8].expected=ts[8].target.run;ts[8].accepts=()=>false;
  ts[4].target.run=()=>ts[8].target.run();ts[4].expected=ts[4].target.run;
  const p=new EffectCallProfile(ts,{now:()=>0});p.beginFrame(0);ts[9].target.run();ts[4].target.run();const f=p.endFrame();p.dispose();
  assert.equal(calls,2);assert.equal(f.rows.filter(r=>r.id===EFFECT_IDS[9]).reduce((n,r)=>n+r.calls,0),0);
});
test('transaction rejects drift before writes and rolls back a late defineProperty failure exactly',()=>{
  const ts=targets(),originals=ts.map(t=>t.target.run);ts[9].expected=()=>{};assert.throws(()=>new EffectCallProfile(ts));ts.forEach((t,i)=>assert.equal(t.target.run,originals[i]));
  ts[9].expected=originals[9];const target=ts[9].target;ts[9].target=new Proxy(target,{defineProperty(){throw false;}});
  assert.throws(()=>new EffectCallProfile(ts),x=>x===false);ts.slice(0,9).forEach((t,i)=>assert.equal(t.target.run,originals[i]));
});
test('retained method references pass through after dispose and foreign replacement is never clobbered',()=>{
  let clocks=0;const ts=targets();ts[8].target.run=()=>9;ts[8].expected=ts[8].target.run;const p=new EffectCallProfile(ts,{now:()=>++clocks});const saved=ts[8].target.run;
  const foreign=()=>12;ts[9].target.run=foreign;p.dispose();const before=clocks;assert.equal(saved.call(ts[8].target),9);assert.equal(clocks,before);assert.equal(ts[9].target.run,foreign);assert.equal(p.restoreConflicts,1);
});
test('native PBR dirty/cache reuse and clean-null branches use actual inherited ThinEngine API',async t=>{
  const f=nativeFixture(t);await warm(f);const old=f.mesh.subMeshes[0].effect;
  const owner=captureEntryEffects(f.game,{enabled:true});t.after(()=>owner.dispose());
  f.light.setEnabled(false);f.light.setEnabled(true);
  for(let i=0;i<8;i++){f.scene.render();await turn();}
  const p=await owner.done;validateEntryEffectProfile(p);assert.equal(p.complete,true);assert.equal(p.engineOrigin,'thinengine-inherited');
  assert.equal(p.frames[0].frameId+8,p.frames.at(-1).nativeFrameIdAfter);assert.equal(f.mesh.subMeshes[0].effect,old,'actual native cache returns same Effect');
  assert.ok(p.frames.flatMap(f=>f.rows).some(r=>r.id===EFFECT_IDS[8]&&r.nullReturns>0),'clean native prepare returns null');
  assert.ok(p.frames.flatMap(f=>f.rows).some(r=>r.id===EFFECT_IDS[9]&&r.calls>0),'dirty native path reaches cached createEffect');
  assert.equal(Object.hasOwn(f.engine,'createEffect'),false);assert.equal(f.engine.createEffect,ThinEngine.prototype.createEffect);assert.equal(f.material._prepareEffect,PBRBaseMaterial.prototype._prepareEffect);
  assert.equal(p.remainingRoutineHooks,0);assert.equal(p.errors,0);
});
test('native StandardMaterial readiness captures its actual inherited ThinEngine createEffect call without a PBR ancestor',async t=>{
  const f=nativeFixture(t,StandardMaterial);await warm(f);const old=f.mesh.subMeshes[0].effect;
  assert.ok(f.material instanceof StandardMaterial);assert.equal(f.material.isReadyForSubMesh,StandardMaterial.prototype.isReadyForSubMesh);
  const owner=captureEntryEffects(f.game,{enabled:true});t.after(()=>owner.dispose());
  f.light.setEnabled(false);f.light.setEnabled(true);
  for(let i=0;i<8;i++){f.scene.render();await turn();}
  const p=await owner.done;validateEntryEffectProfile(p);assert.equal(p.complete,true);assert.equal(p.engineOrigin,'thinengine-inherited');
  const first=p.frames[0];assert.ok(row(first,EFFECT_IDS[5]).calls>0,'actual native Standard readiness ran');
  assert.ok(row(first,EFFECT_IDS[9]).calls>0,'actual native Standard readiness reached the original engine API');
  assert.equal(p.frames.flatMap(frame=>frame.rows).filter(r=>r.id===EFFECT_IDS[4]||r.id===EFFECT_IDS[8]).reduce((n,r)=>n+r.calls,0),0,'no PBR ancestor can provide the engine association');
  assert.equal(f.mesh.subMeshes[0].effect,old,'native cached Effect identity is preserved');
  assert.equal(p.frames[0].frameId+8,p.frames.at(-1).nativeFrameIdAfter);assert.equal(p.remainingRoutineHooks,0);assert.equal(p.errors,0);
  assert.equal(Object.hasOwn(f.engine,'createEffect'),false);assert.equal(f.engine.createEffect,ThinEngine.prototype.createEffect);
  assert.equal(f.material.isReadyForSubMesh,StandardMaterial.prototype.isReadyForSubMesh);
});
test('native WebGPUEngine cache-hit ABI returns exact record/refcount and positional callback',()=>{
  const record={_refCount:1,isReady:()=>true},host=Object.create(WebGPUEngine.prototype);host._compiledEffects={'v+f@#define TEST':record};host._getGlobalDefines=()=>'';
  let callback=0;const result=Reflect.apply(WebGPUEngine.prototype.createEffect,host,[{vertex:'v',fragment:'f'},{attributes:[],defines:'#define TEST'},host,undefined,undefined,undefined,e=>{assert.equal(e,record);callback++;}]);
  assert.equal(result,record);assert.equal(record._refCount,2);assert.equal(callback,1);
  // No browser/device: this test invokes the original native cache-hit method
  // against an explicit terminal cached record, not a real GPU Effect.
});
test('engine own/foreign origin refuses before prototype mutation; abort restores live hooks',async t=>{
  const f=nativeFixture(t),old=PBRBaseMaterial.prototype._prepareEffect;f.engine.createEffect=function(){};
  assert.throws(()=>captureEntryEffects(f.game,{enabled:true}),/origin/);assert.equal(PBRBaseMaterial.prototype._prepareEffect,old);delete f.engine.createEffect;
  const abort=new AbortController(),owner=captureEntryEffects(f.game,{enabled:true,signal:abort.signal});abort.abort();const p=await owner.done;
  assert.equal(p.complete,false);assert.equal(p.reason,'aborted');assert.equal(p.remainingRoutineHooks,0);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);
  assert.equal(PBRBaseMaterial.prototype._prepareEffect,old);assert.equal(Object.hasOwn(f.scene,'render'),false);
});
test('actual WebGPU own prototype origin can be installed/retired without device work',t=>{
  const f=nativeFixture(t),nativeEngine=f.engine,host=Object.create(WebGPUEngine.prototype);f.scene._engine=host;f.game.engine=host;
  try{const owner=captureEntryEffects(f.game,{enabled:true});assert.ok(Object.hasOwn(host,'createEffect'));assert.equal(owner.snapshot().engineOrigin,'webgpu-own');
    owner.dispose();assert.equal(Object.hasOwn(host,'createEffect'),false);assert.equal(owner.snapshot().remainingRoutineHooks,0);
  }finally{f.scene._engine=nativeEngine;f.game.engine=nativeEngine;}
});
test('receipt is distinct/strict while original schema and default-off identity remain unchanged',async t=>{
  const f=nativeFixture(t);await warm(f);const owner=captureEntryEffects(f.game,{enabled:true});for(let i=0;i<8;i++)f.scene.render();const profile=await owner.done;
  const identity={buildId:'build',sourceSnapshotId:'source',helperSha256:'helper',routineCost:true,lifecycleControls:false};
  const raw={schemaVersion:1,...identity,attemptId:'8e9e7e15-6011-438d-96a2-53be43f17792',kind:'entry-effect-cost',mode:'diagnostic',atMs:1,timeOrigin:1,observerErrors:[],completed:false,before:{},after:{},entryTrigger:null,entryEffectProfile:profile,failure:{message:'explicit refusal'},validationErrors:['refused']};
  validateReceipt(raw,identity);assert.throws(()=>validateReceipt({...raw,kind:'routine-cost'},identity),/kind/);assert.throws(()=>validateReceipt(raw,{...identity,routineCost:false}));
  for(const alter of [p=>p.targets.pop(),p=>p.frames[0].rows[0].nullReturns=-1,p=>p.frames[0].rows[0].extra='raw',p=>p.remainingRoutineHooks=1,p=>p.frames[0].nativeFrameIdAfter+=1,p=>{p.frames[1].frameId+=10;p.frames[1].nativeFrameIdAfter+=10;}]){
    const p=structuredClone(profile);alter(p);assert.throws(()=>validateEntryEffectProfile(p));}
  let reads=0;const p=structuredClone(profile);Object.defineProperty(p.frames[0].rows[0],'inclusiveMs',{get(){reads++;return 0;}});assert.throws(()=>validateEntryEffectProfile(p));assert.equal(reads,0);
  assert.equal(parseBuildOptions([]).routineCost,false);assert.equal((await helperIdentity(directory)).sha256.length,64);assert.equal(sourceFiles.length,42);
  for(const name of ['routine-cost.mjs','routine-cost-core.mjs','entry-render-cost.mjs','entry-routine-cost.mjs'])assert.deepEqual(fs.readFileSync(join(directory,name)),fs.readFileSync(join(donorDirectory,name)));
});

test('actual native entry waiter hands off once, captures first Scene and retained waiter does not retrigger',async t=>{
  const f=entryFixture(t);await warm(f);const owner=captureEntryEffectTrigger(f.game,f.options),saved=f.game.gltfLightBudget.prepareFrame;t.after(()=>owner.dispose());
  f.frame();assert.equal(f.factories(),0);const first=f.scene._frameId;f.game.actor.vehicle=true;f.frame();
  const trigger=owner.snapshot().entryTrigger;assert.equal(Reflect.apply(saved,f.game.gltfLightBudget,[]),undefined);assert.equal(f.factories(),1);
  assert.deepEqual(owner.snapshot().entryTrigger,trigger);for(let i=0;i<7;i++)f.frame();const result=await owner.done;
  validateEntryEffectTrigger(result.entryTrigger,result.routineProfile);validateEntryEffectProfile(result.routineProfile);
  assert.equal(result.entryTrigger.complete,true);assert.equal(result.entryTrigger.sceneFrameIdAtTrigger,first);assert.equal(result.routineProfile.frames[0].frameId,first);
  assert.equal(result.entryTrigger.sceneFrameIdAtTerminal,first+8);assert.equal(result.routineProfile.remainingRoutineHooks,0);assert.equal(f.timer(),null);
  assert.equal(Object.hasOwn(f.game.gltfLightBudget,'prepareFrame'),false);assert.equal(Object.hasOwn(f.scene,'render'),false);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);
  const identity={buildId:'b',sourceSnapshotId:'s',helperSha256:'h',routineCost:true,lifecycleControls:false};
  const raw={schemaVersion:1,...identity,attemptId:'8e9e7e15-6011-438d-96a2-53be43f17792',kind:'entry-effect-cost',mode:'diagnostic',atMs:1,timeOrigin:1,observerErrors:[],completed:true,before:{},after:{},entryTrigger:result.entryTrigger,entryEffectProfile:result.routineProfile,validationErrors:[]};
  validateReceipt(raw,identity);const drift=structuredClone(raw);drift.entryTrigger.rendererId++;drift.entryTrigger.pendingAtTerminal.rendererId++;assert.throws(()=>validateReceipt(drift,identity),/renderer correlation/);
});
test('unchanged single deadline includes a long original eighth native frame',async t=>{
  const f=entryFixture(t);await warm(f);const owner=captureEntryEffectTrigger(f.game,f.options);t.after(()=>owner.dispose());f.game.actor.vehicle=true;
  for(let i=0;i<7;i++)f.frame();f.scene.onBeforeRenderObservable.addOnce(()=>f.advance(30000));f.frame();const result=await owner.done;
  assert.equal(result.routineProfile.frames.length,8);assert.equal(result.routineProfile.complete,true);assert.equal(result.entryTrigger.complete,false);assert.equal(result.entryTrigger.reason,'deadline');
  validateEntryEffectTrigger(result.entryTrigger,result.routineProfile);assert.equal(f.timer(),null);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);
});
for(const [name,change]of Object.entries({generation:f=>f.game.renderHealth.generation++,engine:f=>f.game.engine={},actor:f=>f.game.actor={},device:f=>f.engine._device={}}))
  test('native capture retires replaced '+name,async t=>{
    const f=nativeFixture(t),owner=captureEntryEffects(f.game,{enabled:true});change(f);f.scene.render();const p=await owner.done;
    assert.equal(p.complete,false);assert.equal(p.reason,'retired');assert.equal(p.remainingRoutineHooks,0);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);
  });
test('depth/call caps and diagnostic clock failure never repair or repeat original calls',()=>{
  const ts=targets();let originals=0;ts[8].target.run=function(depth){originals++;if(depth)this.run(depth-1);return 7;};ts[8].expected=ts[8].target.run;
  const p=new EffectCallProfile(ts,{now:()=>0});p.beginFrame(0);assert.equal(ts[8].target.run(40),7);const f=p.endFrame();p.dispose();assert.equal(originals,41);assert.ok(f.depthSkipped>0);
  const qs=targets();let count=0;qs[4].target.run=()=>++count;qs[4].expected=qs[4].target.run;const q=new EffectCallProfile(qs,{now:()=>0});q.beginFrame(1);
  for(let i=0;i<100001;i++)qs[4].target.run();const capped=q.endFrame();q.dispose();assert.equal(count,100001);assert.equal(capped.callsSkipped,1);
  const xs=targets();let calls=0;xs[8].target.run=()=>++calls;xs[8].expected=xs[8].target.run;const x=new EffectCallProfile(xs,{now(){throw false;}});x.beginFrame(1);assert.equal(xs[8].target.run(),1);assert.equal(calls,1);assert.ok(x.endFrame().errors>0);x.dispose();
});
test('same-scene recursive render remains original work and is explicitly incomplete',async t=>{
  const f=nativeFixture(t);await warm(f);let entered=false;const owner=captureEntryEffects(f.game,{enabled:true});
  f.scene.onBeforeRenderObservable.add(()=>{if(!entered){entered=true;f.scene.render();}});f.scene.render();const p=await owner.done;
  assert.equal(entered,true);assert.equal(p.complete,false);assert.ok(p.phaseErrors>0);assert.equal(p.remainingRoutineHooks,0);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);
});
test('foreign same-engine Scene materials are passthrough, not attributed to the selected Scene',async t=>{
  const f=nativeFixture(t);await warm(f);const other=new Scene(f.engine);other.texturesEnabled=false;
  new FreeCamera('foreign CPU camera',new Vector3(0,0,-5),other);new HemisphericLight('foreign CPU light',Vector3.Up(),other);
  const mesh=CreateBox('foreign actual mesh',{},other),material=new PBRMaterial('foreign actual material',other);mesh.material=material;let notifications=0;material.onEffectCreatedObservable.add(()=>notifications++);
  const owner=captureEntryEffects(f.game,{enabled:true});
  try{f.scene.onBeforeRenderObservable.addOnce(()=>other.render());for(let i=0;i<8;i++){f.scene.render();await turn();}const p=await owner.done;
    assert.equal(p.complete,true);assert.ok(notifications>0,'foreign native method still runs');
    assert.equal(p.frames[0].rows.filter(r=>r.id===EFFECT_IDS[4]).reduce((n,r)=>n+r.calls,0),1,'only actual own PBR readiness counted');
  }finally{owner.dispose();other.dispose();}
});
test('native QA ten-routine button uses the actual waiter/factory/receipt and no old action',async t=>{
  const f=entryFixture(t);await warm(f);const elements=[],requests=[],intervals=new Set();class Element{constructor(){this.style={};elements.push(this);}append(){}setAttribute(){}remove(){}}
  Object.assign(f.game,{avatars:new Map(),adaptive:{state:{mode:'medium',quality:'medium'}},quality:'medium',camera:f.camera,gpu:{},trafficInstant:()=>0,compilationProfile:{snapshot:()=>({})},
    async prepareLighting(){return{status:'complete',elapsedMs:0,activeElapsedMs:0,pausedMs:0,failureStep:null,stages:[],qualities:[]};}});
  const identity={label:'CPU-only',buildId:'build',sourceSnapshotId:'source',helperSha256:'helper',routineCost:true,lifecycleControls:false,startupLatency:false,bufferLifecycle:false,shaderAttribution:false,loading:'original',clock:null};
  const document={createElement:()=>new Element(),body:new Element(),visibilityState:'visible',hasFocus:()=>true};
  const URLFixture=class extends URL{static createObjectURL(){return'blob:CPU';}static revokeObjectURL(){}};
  const hash=b=>createHash('sha256').update(b).digest('hex');
  const deps={...f.expected.classes,PBRBaseMaterial,
    captureEntryEffectTrigger:(g,o)=>captureEntryEffectTrigger(g,{...o,now:f.options.now,setTimer:f.options.setTimer,clearTimer:f.options.clearTimer}),captureEntryEffects,
    captureRoutineCost(){throw Error('old8 must not run');},captureEntryRenderCost(){throw Error('old3 must not run');},observeOperation,observePreparationResult,createAttemptQueue,observeStartupLatency,observeBufferLifecycle,
    installBrowserClock:async()=>undefined,createPlannedBenchmark(){throw Error('no clock');},createShaderAttributionWindow(){throw Error('no shader window');},projectShaderInventory(){return{};},createLifecycleControls(){throw Error('no lifecycle');},createVisibilityAnchor(){throw Error('no lifecycle');},
    document,window:{addEventListener(){},removeEventListener(){}},location:{hostname:'127.0.0.1',search:''},navigator:{userAgent:'CPU'},crypto:{randomUUID:()=>webcrypto.randomUUID(),subtle:{digest:async(_a,b)=>Buffer.from(hash(b),'hex')}},URL:URLFixture,URLSearchParams,Blob,TextEncoder,performance,innerWidth:2040,innerHeight:986,devicePixelRatio:1,
    setInterval:cb=>{intervals.add(cb);return cb;},clearInterval:cb=>intervals.delete(cb),setTimeout(){throw Error('extra QA deadline');},clearTimeout(){},fetch:async(_url,o)=>{const raw=JSON.parse(o.body);requests.push(raw);return{ok:true,json:async()=>({persisted:true,attemptId:raw.attemptId,sha256:hash(o.body),bytes:Buffer.byteLength(o.body)})};},__WEBGPU_COMPLETION_IDENTITY__:identity};
  const source=fs.readFileSync(join(directory,'qa-overlay.mjs'),'utf8').replace(/^import .*;\r?\n/gm,'').replace('export async function observeStartup','async function observeStartup');
  const observe=new Function(...Object.keys(deps),source+';return observeStartup;')(...Object.values(deps));
  assert.equal(await observe(f.game,{dataset:{}},async()=>{await f.game.prepareLighting();return 42;}),42);
  for(let i=0;i<20;i++)await Promise.resolve();const button=elements.find(x=>x.textContent==='Diagnostic · první vstup do auta /8 framů /10 effect rutin');assert.ok(button);assert.equal(button.disabled,false);
  const operation=button.onclick();f.frame();assert.equal(Object.hasOwn(f.engine,'createEffect'),false);f.game.actor.vehicle=true;
  for(let i=0;i<8;i++)f.frame();await operation;for(let i=0;i<20;i++)await Promise.resolve();
  const raw=requests.find(r=>r.kind==='entry-effect-cost');assert.ok(raw);validateReceipt(raw,identity);assert.equal(raw.completed,true);assert.equal(raw.before.vehicle,false);assert.equal(raw.after.vehicle,true);
  assert.equal(raw.entryTrigger.sceneFrameIdAtTrigger,raw.entryEffectProfile.frames[0].frameId);assert.equal(raw.entryEffectProfile.targets.length,10);
  assert.equal(Object.hasOwn(f.engine,'createEffect'),false);assert.equal(f.timer(),null);assert.equal(intervals.size,0);
});
test('copied fixture compatibility edits reverse exactly to immutable V17 bytes',()=>{
  const edits=[['entry-render-cost.test.mjs','helperIdentity(directory)).files).length,36)','helperIdentity(directory)).files).length,42)',1],
    ['entry-routine-cost.test.mjs','helperIdentity(directory)).files).length,36)','helperIdentity(directory)).files).length,42)',2],
    ['preparation-summary.test.mjs','Object.keys(identity.files).length, 36','Object.keys(identity.files).length, 42',1],
    ['pipeline-input-window.test.mjs','helperIdentity(dir)).files).length,36)','helperIdentity(dir)).files).length,42)',1],
    ['helper.test.mjs',"['entry-routine', 'entry-routine-cost.mjs']]","['entry-routine', 'entry-routine-cost.mjs'], ['entry-effects', 'entry-effect-cost.mjs'], ['entry-effect-trigger', 'entry-effect-trigger.mjs']]",1]];
  for(const[file,before,after,count]of edits){let text=fs.readFileSync(join(directory,file),'utf8');assert.equal(text.split(after).length-1,count);text=text.split(after).join(before);
    assert.equal(text,fs.readFileSync(join(donorDirectory,file),'utf8'));}
  const overlay=fs.readFileSync(join(directory,'qa-overlay.mjs'),'utf8'),donor=fs.readFileSync(join(donorDirectory,'qa-overlay.mjs'),'utf8');
  const a=donor.indexOf("  if (identity.routineCost) action('Diagnostic ·8"),b=donor.indexOf("  if (identity.clock?.config.benchmarkAtUTC");assert.ok(a>=0&&b>a);assert.ok(overlay.includes(donor.slice(a,b)),'all original three buttons remain byteexact');
  const harness=fs.readFileSync(join(directory,'harness.mjs'),'utf8');assert.ok(harness.includes("'@babylonjs/core/Engines/thinEngine.pure.js'"));
  assert.ok(harness.includes("if (id === 'virtual:webgpu-completion-entry-effects')"));assert.ok(harness.includes("if (id === '\\0virtual:webgpu-completion-entry-effect-core')"));
});
test('descriptor drift during capture retires without clobbering the foreign engine method',async t=>{
  const f=nativeFixture(t),owner=captureEntryEffects(f.game,{enabled:true}),foreign=function(){return Reflect.apply(ThinEngine.prototype.createEffect,this,arguments);};
  f.engine.createEffect=foreign;f.scene.render();const p=await owner.done;assert.equal(p.complete,false);assert.equal(p.reason,'foreign-routine');assert.ok(p.restoreConflicts>0);
  assert.equal(f.engine.createEffect,foreign);delete f.engine.createEffect;assert.equal(Object.hasOwn(f.scene,'render'),false);
});
test('disposed owner snapshots and retained instance wrappers do not query resources again',async t=>{
  const f=nativeFixture(t);await warm(f);const owner=captureEntryEffects(f.game,{enabled:true}),stale=f.engine.createEffect;owner.dispose();const p=await owner.done;
  assert.equal(p.remainingRoutineHooks,0);const descriptor=Object.getOwnPropertyDescriptor(f.game,'scene');Object.defineProperty(f.game,'scene',{configurable:true,get(){assert.fail('retired Game query');}});
  try{owner.dispose();assert.equal(owner.snapshot(),p);const host={_compiledEffects:{'v+f@':{_refCount:1}},_getGlobalDefines:()=>''};
    assert.equal(Reflect.apply(stale,host,[{vertex:'v',fragment:'f'},{attributes:[],defines:''},host]),host._compiledEffects['v+f@']);
  }finally{Object.defineProperty(f.game,'scene',descriptor);}
});
test('phase registration failure rolls back all ten native descriptors before publishing an owner',t=>{
  const f=nativeFixture(t),native=PBRBaseMaterial.prototype._prepareEffect,observable=f.scene.onBeforeDrawPhaseObservable,original=observable.add;
  observable.add=()=>null;
  try{assert.throws(()=>captureEntryEffects(f.game,{enabled:true}),/observer unavailable/);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);assert.equal(Object.hasOwn(f.scene,'render'),false);assert.equal(PBRBaseMaterial.prototype._prepareEffect,native);}
  finally{observable.add=original;}
});
test('partial RTT observer failure removes its first subscription and does not escape native notification',async t=>{
  const f=nativeFixture(t),before=new Observable(),after={add(){throw false;},remove(){}},renderer={onInitRenderingObservable:before,onFinishRenderingObservable:after};
  let removals=0;const remove=before.remove;before.remove=function(o){removals++;return Reflect.apply(remove,this,[o]);};
  const owner=captureEntryEffects(f.game,{enabled:true});let later=0;f.scene.onNewObjectRendererAddedObservable.add(()=>later++);
  f.scene.objectRenderers.push(renderer);
  try{assert.doesNotThrow(()=>f.scene.onNewObjectRendererAddedObservable.notifyObservers(renderer));const p=await owner.done;
    assert.equal(p.complete,false);assert.equal(p.reason,'observer-error');assert.equal(p.remainingRoutineHooks,0);assert.equal(removals,1);assert.equal(later,1);
  }finally{f.scene.objectRenderers.splice(f.scene.objectRenderers.indexOf(renderer),1);owner.dispose();}
});
for(const failure of [undefined,0])test('native Scene throw preserves exact '+String(failure)+' and restores all descriptors',async t=>{
  const f=nativeFixture(t),owner=captureEntryEffects(f.game,{enabled:true});f.scene.onBeforeRenderObservable.addOnce(()=>{throw failure;});
  assert.throws(()=>f.scene.render(),x=>x===failure);const p=await owner.done;assert.equal(p.complete,false);assert.equal(p.reason,'original-render-threw');assert.equal(p.remainingRoutineHooks,0);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);validateEntryEffectProfile(p);
});
test('invalid native frame IDs stay explicit partial without adding or repairing a render',async t=>{
  const f=nativeFixture(t),owner=captureEntryEffects(f.game,{enabled:true});f.scene.onAfterRenderObservable.addOnce(()=>{f.scene._frameId=NaN;});f.scene.render();const p=await owner.done;
  assert.equal(p.complete,false);assert.equal(p.reason,'no-native-frame-progress');assert.equal(p.frames[0].nativeFrameIdAfter,null);validateEntryEffectProfile(p);
});
test('maximal scalar profile remains bounded and validation never invokes inherited toJSON',async t=>{
  const f=nativeFixture(t);await warm(f);const owner=captureEntryEffects(f.game,{enabled:true});for(let i=0;i<8;i++)f.scene.render();const p=structuredClone(await owner.done);
  for(const frame of p.frames)for(const r of frame.rows){r.calls=100000;r.inclusiveMs=r.selfSelectedMs=Number.MAX_VALUE;r.falseReturns=r.nullReturns=r.throws=0;}
  validateEntryEffectProfile(p);assert.ok(Buffer.byteLength(JSON.stringify(p))<EFFECT_LIMITS.bytes);
  let reads=0;const poisoned=Object.create({get toJSON(){reads++;throw Error('inherited getter');}},Object.getOwnPropertyDescriptors(p));assert.throws(()=>validateEntryEffectProfile(poisoned),/prototype/);assert.equal(reads,0);
  const invalid=structuredClone(p);invalid.reason='arbitrary caller text';assert.throws(()=>validateEntryEffectProfile(invalid));
});
