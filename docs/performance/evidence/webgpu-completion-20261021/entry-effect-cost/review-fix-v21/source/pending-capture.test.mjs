import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {EngineStore} from '@babylonjs/core/Engines/engineStore.js';
import {Scene} from '@babylonjs/core/scene.js';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {CreateBox} from '@babylonjs/core/Meshes/Builders/boxBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import {GltfLightBudget} from '../../../../../client/gltf-light-budget.ts';
import {StableLightState} from '../../../../../client/stable-light-state.ts';
import {RenderHealth} from '../../../../../client/render-health.ts';
import ts from 'typescript';
import {captureEntryEffectTrigger,validateEntryEffectTrigger} from './entry-effect-trigger.mjs';
import {captureEntryEffects} from './entry-effect-cost.mjs';
import {validateEntryEffectProfile} from './entry-effect-cost-core.mjs';
import {validateReceipt} from './receipt.mjs';
import {validateGuardFailure,validateGuardSample} from './entry-effect-guard.mjs';
const baseline=process.env.EFFECT_BASELINE==='v19';
const oldTrigger=baseline?await import('../v19/entry-routine-cost.mjs'):null;
const oldAdapter=baseline?await import('../v19/entry-effect-cost.mjs'):null;
const trigger=oldTrigger?.captureEntryRoutineCost??captureEntryEffectTrigger,adapter=oldAdapter?.captureEntryEffects??captureEntryEffects;
const limitsValidator=process.env.EFFECT_LIMITS_BASELINE==='v20'?(await import('../v20/entry-effect-trigger.mjs')).validateEntryEffectTrigger:validateEntryEffectTrigger;
const turn=()=>new Promise(resolve=>setImmediate(resolve));
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
class Game{}
const gameText=fs.readFileSync(new URL('../../../../../client/game.ts',import.meta.url),'utf8');
const tree=ts.createSourceFile('game.ts',gameText,ts.ScriptTarget.Latest,true),klass=tree.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Game'),method=klass.members.find(n=>n.name?.getText(tree)==='frame');
const names=['this.gltfLightBudget.prepareFrame();','this.stableLights.update();','this.scene.render();'],indices=names.map(n=>method.body.statements.findIndex(s=>s.getText(tree)===n));
assert.ok(indices[0]>=0);assert.deepEqual(indices,[indices[0],indices[0]+1,indices[0]+2]);
const prelude=new Function(indices.map(i=>method.body.statements[i].getText(tree)).join('\n'));
function fixture(){
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('CPU liveness',new Vector3(0,0,-5),scene);scene.texturesEnabled=false;
 const mesh=CreateBox('CPU native receiver',{},scene);mesh.material=new StandardMaterial('CPU native material',scene);
 const health=new RenderHealth(engine,'game');assert.equal(health.markReady(),true);
 const game=Object.assign(new Game(),{engine,scene,renderHealth:health,ready:true,disposed:false,rendererFailed:false,actor:{vehicle:false},startupAbort:new AbortController(),gltfLightBudget:new GltfLightBudget(scene),stableLights:new StableLightState(scene)});
 let time=100,timer=null;const abort=new AbortController();
 const options={enabled:true,expected:{classes:{Game,Scene,GltfLightBudget,StableLightState},methods:{prepareFrame:GltfLightBudget.prototype.prepareFrame,render:Scene.prototype.render}},now:()=>time,setTimer:cb=>(timer=cb),clearTimer(){timer=null;},signal:abort.signal,startCapture:adapter};
 return{game,scene,engine,health,abort,options,frame(){engine.beginFrame();prelude.call(game);engine.endFrame();},advance(ms){time+=ms;},timer:()=>timer,dispose(){game.gltfLightBudget.dispose();game.stableLights.dispose();health.dispose();scene.dispose();engine.dispose();}};
}
function clean(f,result){assert.equal(result.entryTrigger.remainingWaiterHooks,0);if(result.routineProfile)assert.equal(result.routineProfile.remainingRoutineHooks,0);assert.equal(Object.hasOwn(f.scene,'render'),false);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);assert.equal(Object.hasOwn(f.game.gltfLightBudget,'prepareFrame'),false);assert.equal(f.timer(),null);}
function validate(result){validateEntryEffectTrigger(result.entryTrigger,result.routineProfile);if(result.routineProfile)validateEntryEffectProfile(result.routineProfile);}
for(const kind of ['shader-validation','preparation'])test('new pending '+kind+' after one native accepted frame retains all eight consecutive original frames',async()=>{
 const f=fixture(),jobs=[deferred(),deferred()];let owner;
 try{owner=trigger(f.game,f.options);const start=f.scene._frameId;f.game.actor.vehicle=true;
   f.scene.onAfterRenderObservable.addOnce(()=>{for(const job of jobs)void f.health.track(job.promise,'shader','controlled original pending',kind).catch(()=>{});});
   f.frame();assert.equal(owner.snapshot().routineProfile,null);f.frame();
   assert.equal(owner.snapshot().entryTrigger.active,true,'post-admission pending work must not retire the same renderer');
   for(const job of jobs)job.resolve();await flush();for(let i=0;i<6;i++)f.frame();const result=await owner.done;validate(result);
   assert.equal(result.entryTrigger.complete,true);assert.equal(result.routineProfile.complete,true);assert.equal(result.routineProfile.frames.length,8);
   assert.deepEqual(result.routineProfile.frames.map(x=>[x.frameId,x.nativeFrameIdAfter]),Array.from({length:8},(_,i)=>[start+i,start+i+1]));
   const key=kind==='preparation'?'pendingPreparation':'pendingShaderValidation';assert.equal(result.routineProfile.frames[0].healthAfter[key],2);assert.equal(result.routineProfile.frames[1].healthBefore[key],2);assert.equal(result.routineProfile.pendingAtTerminal[key],0);
   assert.equal(result.entryTrigger.firstFailure,null);assert.equal(result.routineProfile.firstFailure,null);clean(f,result);
 }finally{for(const job of jobs)job.resolve();owner?.dispose();f.dispose();}
});
test('eight-frame diagnostic completion preserves pending at terminal without claiming health acceptance',async()=>{
 const f=fixture(),job=deferred();let owner;
 try{owner=trigger(f.game,f.options);f.game.actor.vehicle=true;f.scene.onAfterRenderObservable.addOnce(()=>{void f.health.track(job.promise,'pipeline','pending original job','preparation').catch(()=>{});});for(let i=0;i<8;i++)f.frame();const r=await owner.done;validate(r);
   assert.equal(r.entryTrigger.complete,true);assert.equal(r.routineProfile.pendingAtTerminal.pendingPreparation,1);assert.equal(r.entryTrigger.pendingAtTerminal.pendingPreparation,1);assert.equal(f.health.snapshot().valid,false);assert.match(r.entryTrigger.scope,/not renderer health/);clean(f,r);
 }finally{job.resolve();await flush();owner?.dispose();f.dispose();}
});
for(const kind of ['preparation','shader-validation'])test('admission rejects original pending '+kind+' with exact bounded witness',async()=>{
 const f=fixture(),job=deferred();try{void f.health.track(job.promise,'shader','admission',kind).catch(()=>{});const owner=trigger(f.game,f.options),r=await owner.done;validate(r);assert.equal(r.entryTrigger.complete,false);assert.equal(r.entryTrigger.firstFailure.code,'pending-admission');assert.equal(r.entryTrigger.firstFailure.boundary,'arm');assert.equal(r.routineProfile,null);clean(f,r);}finally{job.resolve();await flush();f.dispose();}
});
const changes={
 'identity-actor':f=>{f.game.actor={vehicle:true};},'identity-scene':f=>{f.game.scene={};},'identity-engine':f=>{f.game.engine={};},'identity-device':f=>{f.engine._device={};},'identity-health':f=>{f.game.renderHealth={};},'identity-budget':f=>{f.game.gltfLightBudget={};},'identity-stable':f=>{f.game.stableLights={};},'identity-startup':f=>{f.game.startupAbort=new AbortController();},'identity-generation':f=>{f.health.generation++;},'health-phase':f=>{f.health.phase='preparing';},'health-error':f=>{f.health.report('shader','controlled fault');},'game-not-ready':f=>{f.game.ready=false;},'quality-preparation':f=>{f.game.preparingRenderQuality=true;},benchmark:f=>{f.game.benchmark={};},'presentation-lease':f=>{f.game.startupPresentationLease={};},'invalid-data':f=>{f.health.pendingByKind.preparation=-1;}
};
for(const [code,change]of Object.entries(changes))test('pending continuation still rejects '+code,async()=>{
 const f=fixture(),budget=f.game.gltfLightBudget,stable=f.game.stableLights;let owner;
 try{owner=trigger(f.game,f.options);f.game.actor.vehicle=true;f.frame();change(f);f.scene.render();const r=await owner.done;validate(r);assert.equal(r.entryTrigger.complete,false);assert.equal(r.entryTrigger.firstFailure.code,code);assert.equal(r.entryTrigger.firstFailure.source,'trigger');assert.equal(r.entryTrigger.firstFailure.boundary,'before-render');
   assert.equal(r.routineProfile.frames.length,1);assert.equal(r.routineProfile.remainingRoutineHooks,0);assert.equal(Object.hasOwn(f.scene,'render'),false);assert.equal(Object.hasOwn(f.engine,'createEffect'),false);
 }finally{owner?.dispose();f.game.gltfLightBudget=budget;f.game.stableLights=stable;f.dispose();}
});
test('actual tracked rejection becomes health-error and keeps original rejected value',async()=>{
 const f=fixture(),job=deferred();let owner;try{owner=trigger(f.game,f.options);f.game.actor.vehicle=true;f.frame();const rejection=false;const tracked=f.health.track(job.promise,'shader','controlled rejection','shader-validation');job.reject(rejection);await assert.rejects(tracked,e=>e===rejection);await flush();f.frame();const r=await owner.done;validate(r);assert.equal(r.entryTrigger.firstFailure.code,'health-error');clean(f,r);}finally{owner?.dispose();f.dispose();}
});
for(const [name,stop]of Object.entries({abort:f=>f.abort.abort(),deadline:f=>f.advance(30000),foreign:f=>{f.game.gltfLightBudget.prepareFrame=function(){};}}))test('accepted continuation preserves '+name+' retirement',async()=>{
 const f=fixture();let owner;try{owner=trigger(f.game,f.options);f.game.actor.vehicle=true;f.frame();stop(f);f.frame();const r=await owner.done;validate(r);assert.equal(r.entryTrigger.complete,false);assert.equal(r.entryTrigger.firstFailure.code,name==='abort'?'aborted':name==='foreign'?'foreign-prepare':'deadline');assert.equal(r.routineProfile.remainingRoutineHooks,0);}finally{owner?.dispose();f.dispose();}
});
test('getter pending data is refused without invoking the getter',async()=>{
 const f=fixture();let reads=0,owner;try{owner=trigger(f.game,f.options);f.game.actor.vehicle=true;f.frame();Object.defineProperty(f.health.pendingByKind,'preparation',{configurable:true,get(){reads++;throw Error('getter must not run');}});f.frame();const r=await owner.done;validate(r);assert.equal(reads,0);assert.equal(r.entryTrigger.firstFailure.code,'invalid-data');}finally{Object.defineProperty(f.health.pendingByKind,'preparation',{configurable:true,writable:true,value:0});owner?.dispose();f.dispose();}
});
test('independent ten-target adapter permits pending and records its own failing guard',async()=>{
 const f=fixture(),job=deferred();let owner;try{owner=captureEntryEffects(f.game,{enabled:true});f.scene.render();void f.health.track(job.promise,'shader','adapter pending','preparation').catch(()=>{});f.scene.render();assert.equal(owner.snapshot().frames.length,2);assert.equal(owner.snapshot().frames[1].healthBefore.pendingPreparation,1);
   f.health.phase='preparing';f.scene.render();const p=await owner.done;validateEntryEffectProfile(p);assert.equal(p.firstFailure.source,'adapter');assert.equal(p.firstFailure.code,'health-phase');assert.equal(p.firstFailure.boundary,'before-render');assert.equal(p.frames.length,2);assert.equal(p.remainingRoutineHooks,0);
 }finally{job.resolve();await flush();owner?.dispose();f.dispose();}
});
test('trigger and installed boundaries remain idle even before accepted capture publication',async()=>{
 for(const boundary of ['trigger','installed']){const f=fixture(),job=deferred();let owner;try{if(boundary==='installed')f.options.startCapture=(game,options)=>{const result=adapter(game,options);void f.health.track(job.promise,'shader','installation changed','shader-validation').catch(()=>{});return result;};
   owner=trigger(f.game,f.options);if(boundary==='trigger')void f.health.track(job.promise,'shader','trigger changed','preparation').catch(()=>{});f.game.actor.vehicle=true;f.frame();const r=await owner.done;validate(r);assert.equal(r.entryTrigger.firstFailure.code,'pending-admission');assert.equal(r.entryTrigger.firstFailure.boundary,boundary);assert.equal(r.entryTrigger.complete,false);clean(f,r);
 }finally{job.resolve();await flush();owner?.dispose();f.dispose();}}
});
test('new trigger and profile receipt reject schema, pending, witness and frame tampering',async()=>{
 const f=fixture();let owner;try{owner=trigger(f.game,f.options);f.game.actor.vehicle=true;for(let i=0;i<8;i++)f.frame();const r=await owner.done;validate(r);
   const identity={buildId:'b',sourceSnapshotId:'s',helperSha256:'h',lifecycleControls:false,routineCost:true};const raw={schemaVersion:1,...identity,attemptId:'8e9e7e15-6011-438d-96a2-53be43f17792',kind:'entry-effect-cost',mode:'diagnostic',atMs:1,timeOrigin:0,observerErrors:[],completed:true,before:{},after:{},entryTrigger:r.entryTrigger,entryEffectProfile:r.routineProfile,validationErrors:[]};assert.equal(validateReceipt(raw,identity),raw);
   for(const change of [x=>x.entryTrigger.schemaVersion=1,x=>x.entryTrigger.firstFailure={},x=>x.entryTrigger.pendingAtTerminal.extra='raw',x=>x.entryEffectProfile.frames[0].healthBefore.pendingPreparation=-1,x=>x.entryEffectProfile.frames[0].healthAfter.pendingShaderValidation=Infinity,x=>x.entryEffectProfile.frames[1].frameId++,x=>x.entryEffectProfile.pendingAtTerminal.rendererId++,x=>x.entryEffectProfile.schemaVersion=1,x=>x.entryEffectProfile.firstFailure={...x.entryEffectProfile.pendingAtTerminal,source:'adapter',boundary:'before-render',code:'raw caller',atMs:0,frameId:0}]){const x=structuredClone(raw);change(x);assert.throws(()=>validateReceipt(x,identity));}
   let reads=0;const p=structuredClone(raw);Object.defineProperty(p.entryEffectProfile.frames[0].healthBefore,'pendingPreparation',{get(){reads++;throw Error('getter');},enumerable:true});assert.throws(()=>validateReceipt(p,identity));assert.equal(reads,0);
   assert.ok(Buffer.byteLength(JSON.stringify(raw.entryEffectProfile))<256*1024);clean(f,r);
 }finally{owner?.dispose();f.dispose();}
});
for(const shape of ['field-getter','own-toJSON-function','own-toJSON-getter','inherited-toJSON-getter','nested-value-toJSON'])test('limits own-data rejects '+shape+' without executing accessors or toJSON',async()=>{
 const f=fixture();let owner;try{owner=captureEntryEffectTrigger(f.game,f.options);owner.dispose();const r=await owner.done,p=structuredClone(r.entryTrigger),correct={...p.limits};let reads=0;
   if(shape==='field-getter')Object.defineProperty(p.limits,'deadlineMs',{enumerable:true,get(){reads++;return correct.deadlineMs;}});
   if(shape==='own-toJSON-function')p.limits.toJSON=()=>{reads++;return correct;};
   if(shape==='own-toJSON-getter')Object.defineProperty(p.limits,'toJSON',{get(){reads++;return()=>{reads++;return correct;};}});
   if(shape==='inherited-toJSON-getter')Object.setPrototypeOf(p.limits,{get toJSON(){reads++;return()=>{reads++;return correct;};}});
   if(shape==='nested-value-toJSON')p.limits.deadlineMs={toJSON(){reads++;return correct.deadlineMs;}};
   let rejected=false;try{limitsValidator(p,r.routineProfile);}catch{rejected=true;}
   assert.equal(reads,0,'nested limit validation must not execute an accessor/toJSON');assert.equal(rejected,true,'non-scalar or accessor-backed limits must be rejected');
 }finally{owner?.dispose();f.dispose();}
});
test('limits own-data preserves the public return and valid scalar limits',async()=>{
 const f=fixture();let owner;try{owner=captureEntryEffectTrigger(f.game,f.options);owner.dispose();const r=await owner.done;
   for(const prototype of [Object.prototype,null]){const p=structuredClone(r.entryTrigger),limits=Object.assign(Object.create(prototype),p.limits);p.limits=limits;assert.equal(validateEntryEffectTrigger(p,r.routineProfile),p);assert.equal(p.limits,limits);assert.deepEqual(Reflect.ownKeys(limits),['deadlineMs','frames','standbyCalls']);}
 }finally{owner?.dispose();f.dispose();}
});
test('both disabled new APIs avoid Game reads and legacy controller/runtime bytes remain exact',()=>{
 const hostile=new Proxy({},{get(){assert.fail('default-off read');},getOwnPropertyDescriptor(){assert.fail('default-off descriptor');}});assert.equal(captureEntryEffectTrigger(hostile),undefined);assert.equal(captureEntryEffects(hostile),undefined);
 for(const file of ['routine-cost.mjs','routine-cost-core.mjs','entry-render-cost.mjs','entry-routine-cost.mjs'])assert.deepEqual(fs.readFileSync(new URL(file,import.meta.url)),fs.readFileSync(new URL('../v19/'+file,import.meta.url)));
 const before=fs.readFileSync(new URL('../v19/qa-overlay.mjs',import.meta.url),'utf8'),after=fs.readFileSync(new URL('./qa-overlay.mjs',import.meta.url),'utf8');const start=before.indexOf("  if (identity.routineCost) action('Diagnostic ·8"),end=before.indexOf("  if (identity.routineCost) action('Diagnostic · první vstup do auta /8 framů /10");assert.ok(start>=0&&end>start);assert.ok(after.includes(before.slice(start,end)));
});
for(const hold of ['native','none','owner','waiter','engine','all'])test('GC '+hold+' retained stopped control releases Game and Scene before first draw',async()=>{
 assert.equal(typeof global.gc,'function','run this targeted test with --expose-gc');
 // Full-draw native control also retained Scene in the original failed probes.
 // This isolates installed helper closures before any native shader processing.
 let f=fixture(),game=f.game,scene=f.scene;const gameRef=new WeakRef(game),sceneRef=new WeakRef(scene);let owner=hold==='native'?null:trigger(game,f.options),waiter=game.gltfLightBudget.prepareFrame;game.actor.vehicle=true;game.gltfLightBudget.prepareFrame();let engineWrapper=f.engine.createEffect;if(owner){owner.dispose();validate(await owner.done);}f.dispose();assert.equal(EngineStore.LastCreatedScene,null);assert.equal(EngineStore.Instances.length,0);f=game=scene=null;
 if(hold!=='all'&&hold!=='owner')owner=null;if(hold!=='all'&&hold!=='waiter')waiter=null;if(hold!=='all'&&hold!=='engine')engineWrapper=null;
 for(let i=0;i<40;i++){await turn();global.gc();await turn();if(!gameRef.deref()&&!sceneRef.deref())break;}
 assert.equal(gameRef.deref(),undefined,'retained owner must release Game');assert.equal(sceneRef.deref(),undefined,'retained wrappers must release Scene');if(waiter)assert.equal(typeof waiter,'function');if(engineWrapper)assert.equal(typeof engineWrapper,'function');if(owner)assert.equal(owner.snapshot().entryTrigger.active,false);
});
