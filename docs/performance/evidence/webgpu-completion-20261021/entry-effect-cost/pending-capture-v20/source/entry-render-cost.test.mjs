import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {resolve,dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';
import {captureEntryRenderCost,validateEntryRenderProfile,ENTRY_LIMITS} from './entry-render-cost.mjs';
import {validateReceipt} from './receipt.mjs';import {helperIdentity,sha256,transformUI} from './common.mjs';
import ts from 'typescript';
import {gunzipSync} from 'node:zlib';
import {createAttemptQueue} from './attempt-queue.mjs';import {observeOperation,observePreparationResult} from './startup-observer.mjs';
import {installBrowserClock} from './browser-clock.mjs';import {observeStartupLatency} from './startup-latency.mjs';
import {observeBufferLifecycle} from './buffer-lifecycle.mjs';import {webcrypto} from 'node:crypto';
const directory=dirname(fileURLToPath(import.meta.url)),root=resolve(directory,'../../../../..');
function fixture() {
 const calls=[],timers=new Map(),disposeCallbacks=new Set(),signal=new AbortController();let now=100,current=true,serial=0;
 const work={nested:false,throwEnabled:false,throwIndex:-1,thrown:undefined,returns:[undefined,undefined,undefined],durations:[2,3,5],during:null};
 let game;
 class Game {}
 class GltfLightBudget {prepareFrame(...args){calls.push({index:0,receiver:this,args});now+=work.durations[0];if(work.during)work.during(0);if(work.throwEnabled&&work.throwIndex===0)throw work.thrown;return work.returns[0];}}
 class StableLightState {update(...args){calls.push({index:1,receiver:this,args});now+=work.durations[1];if(work.during)work.during(1);if(work.throwEnabled&&work.throwIndex===1)throw work.thrown;return work.returns[1];}}
 class Scene {constructor(){this._frameId=20;this.isDisposed=false;this.onDisposeObservable={add:cb=>{disposeCallbacks.add(cb);return{remove(){disposeCallbacks.delete(cb);}}}};}
  render(...args){calls.push({index:2,receiver:this,args});now+=work.durations[2];if(work.nested){game.gltfLightBudget.prepareFrame('nested');game.stableLights.update('nested');}if(work.during)work.during(2);if(work.throwEnabled&&work.throwIndex===2)throw work.thrown;this._frameId++;return work.returns[2];}}
 const scene=new Scene(),engine={_frameId:10,_device:{}};scene._engine=engine;
 game=Object.assign(new Game(),{scene,engine,actor:{vehicle:false},renderHealth:{rendererId:2,generation:1,phase:'ready',errorCount:0,pendingByKind:{preparation:0,'shader-validation':0}},startupAbort:new AbortController(),gltfLightBudget:new GltfLightBudget(),stableLights:new StableLightState(),ready:true,disposed:false});
 const expected={classes:{Game,Scene,GltfLightBudget,StableLightState},methods:{prepareFrame:GltfLightBudget.prototype.prepareFrame,update:StableLightState.prototype.update,render:Scene.prototype.render}};
 const options={enabled:true,expected,signal:signal.signal,isCurrent:()=>current,now:()=>now,setTimer:(cb,delay)=>{const id=++serial;timers.set(id,{cb,at:now+delay});return id;},clearTimer:id=>timers.delete(id)};
 const install=()=>captureEntryRenderCost(game,options);
 const frame=()=>{const results=[game.gltfLightBudget.prepareFrame('prepare'),game.stableLights.update('stable'),game.scene.render('render')];engine._frameId++;return results;};
 return{game,scene,engine,expected,options,install,frame,calls,work,timers,disposeCallbacks,signal,retire:()=>{current=false;},setNow:value=>{now=value;},advance:ms=>{now+=ms;},disposeScene(){scene.isDisposed=true;for(const cb of [...disposeCallbacks])cb();}};
}
const capture=async f=>{const owner=f.install();f.game.actor.vehicle=true;for(let i=0;i<8;i++)f.frame();return{owner,profile:await owner.done};};
test('defaultoff has no reads/hooks/timers',()=>{const bad=new Proxy({},{get(){throw Error('unexpected read');}});assert.equal(captureEntryRenderCost(bad),undefined);assert.equal(captureEntryRenderCost(bad,{enabled:false}),undefined);});
test('MP delay does not spend8frames: native false→true at outer prepare starts timestamps before original work',async()=>{
 const f=fixture(),owner=f.install();for(let i=0;i<20;i++)f.frame();assert.equal(owner.snapshot().frames.length,0);assert.equal(owner.snapshot().triggeredAtMs,null);
 f.game.actor.vehicle=true;for(let i=0;i<8;i++)f.frame();const p=await owner.done;validateEntryRenderProfile(p);
 assert.equal(p.complete,true);assert.equal(p.frames[0].startedAtMs,300);assert.equal(p.triggeredAtMs,300);assert.equal(p.frames[0].engineFrameId,30);
 assert.deepEqual(p.frames[0].scopes.map(x=>x.wallMs),[2,3,5]);assert.equal(p.frames[0].chainWallMs,10);
 assert.equal(p.frames[0].engineFrameIdAfterRender,30);assert.equal(p.frames[0].sceneFrameIdAfter,41);assert.equal(f.timers.size,0);assert.equal(f.disposeCallbacks.size,0);
 assert.equal(p.remainingHooks,0);assert.equal(f.calls.length,28*3);assert.equal(Object.hasOwn(f.scene,'render'),false);
});
test('all original receiver/args/returns including Promise identity and falsy returns are untouched',async()=>{
 for(const value of [undefined,null,false,0,'',{},Promise.resolve(7)]){const f=fixture();f.work.returns=[value,value,value];const owner=f.install();f.game.actor.vehicle=true;
 const arg={};assert.equal(f.game.gltfLightBudget.prepareFrame(arg,4),value);assert.equal(f.game.stableLights.update(arg,5),value);assert.equal(f.scene.render(arg,6),value);
 assert.deepEqual(f.calls.map(c=>c.args),[[arg,4],[arg,5],[arg,6]]);assert.deepEqual(f.calls.map(c=>c.receiver),[f.game.gltfLightBudget,f.game.stableLights,f.scene]);owner.dispose();validateEntryRenderProfile(await owner.done);}
});
for(const thrown of [undefined,null,false,0,'',new Error('primary')])for(const index of [0,1,2])test('same original throw index'+index+' value '+String(thrown),async()=>{
 const f=fixture(),owner=f.install();f.game.actor.vehicle=true;f.work.throwEnabled=true;f.work.throwIndex=index;f.work.thrown=thrown;let caught=false;
 try{f.frame();}catch(e){caught=true;assert.equal(e,thrown);}assert.equal(caught,true);const p=await owner.done;assert.equal(p.reason,'original-threw');assert.equal(p.frames[0].scopes[index].threw,true);validateEntryRenderProfile(p);assert.equal(f.timers.size,0);
});
test('nested scopes overlap Scene and never inflate outer prelude; no extra original calls',async()=>{
 const f=fixture();f.work.nested=true;const{profile:p}=await capture(f);validateEntryRenderProfile(p);const frame=p.frames[0];assert.deepEqual(frame.scopes.map(r=>r.wallMs),[2,3,10]);assert.equal(frame.chainWallMs,15);assert.deepEqual(frame.nested,[{calls:1,wallMs:2,throws:0},{calls:1,wallMs:3,throws:0}]);assert.equal(f.calls.length,40);
});
for(const change of ['out-of-order','missing-prepare','recursion','scene-no-progress','engine-progress','vehicle-exit'])test('phase errors remain partial without repairing original calls: '+change,async()=>{
 const f=fixture(),owner=f.install();f.game.actor.vehicle=true;
 if(change==='out-of-order'){f.game.gltfLightBudget.prepareFrame();f.scene.render();}
 if(change==='missing-prepare')f.scene.render();
 if(change==='recursion'){let once=false;f.work.during=i=>{if(i===0&&!once){once=true;f.game.gltfLightBudget.prepareFrame();}};f.frame();}
 if(change==='scene-no-progress'){f.work.during=i=>{if(i===2)f.scene._frameId--;};f.frame();}
 if(change==='engine-progress'){f.work.during=i=>{if(i===2)f.engine._frameId++;};f.frame();}
 if(change==='vehicle-exit'){f.work.during=i=>{if(i===1)f.game.actor.vehicle=false;};f.frame();}
 const p=await owner.done;assert.equal(p.complete,false);assert.equal(p.reason,'phase-error');assert.ok(p.phaseErrors>0);validateEntryRenderProfile(p);
});
test('single original deadline includes standby and capture, also synchronous stall before timer callback',async()=>{
 const f=fixture(),owner=f.install();f.advance(29990);f.game.actor.vehicle=true;f.frame();const p=await owner.done;assert.equal(p.reason,'deadline');assert.equal(p.complete,false);assert.equal(p.frames.length,1);assert.equal(p.frames[0].scopes[2].wallMs,5);validateEntryRenderProfile(p);assert.equal(f.timers.size,0);
 const g=fixture(),waiting=g.install();for(const timer of [...g.timers.values()])timer.cb();assert.equal((await waiting.done).reason,'deadline');assert.equal(g.disposeCallbacks.size,0);
});
for(const clock of [()=>NaN,()=>Infinity,()=>{throw false;}])test('invalid initial clock produces truthful unavailable timestamp and clean rollback',async()=>{const f=fixture();f.options.now=clock;const owner=f.install(),p=await owner.done;assert.equal(p.reason,'clock-error');assert.equal(p.armedAtMs,null);validateEntryRenderProfile(p);assert.equal(Object.hasOwn(f.scene,'render'),false);});
test('backwards clock never replaces original result and marks incomplete evidence',async()=>{const f=fixture(),owner=f.install();f.setNow(99);assert.equal(f.game.gltfLightBudget.prepareFrame(),undefined);assert.equal((await owner.done).reason,'clock-error');});
const changes={actor:f=>{f.game.actor={vehicle:false};},scene:f=>{f.game.scene={};},engine:f=>{f.game.engine={};},device:f=>{f.engine._device={};},health:f=>{f.game.renderHealth={};},generation:f=>{f.game.renderHealth.generation++;},renderer:f=>{f.game.renderHealth.rendererId++;},budget:f=>{f.game.gltfLightBudget={};},stable:f=>{f.game.stableLights={};},controller:f=>{f.game.startupAbort=new AbortController();},current:f=>f.retire(),healthError:f=>{f.game.renderHealth.errorCount++;},unready:f=>{f.game.ready=false;},benchmark:f=>{f.game.benchmark={};}};
for(const[name,change]of Object.entries(changes))test('exact owner retirement: '+name,async()=>{const f=fixture(),owner=f.install(),receiver=f.game.gltfLightBudget,original=receiver.prepareFrame;change(f);Reflect.apply(original,receiver,[]);
 const p=await owner.done;assert.equal(p.reason,'retired');assert.equal(p.complete,false);validateEntryRenderProfile(p);});
for(const kind of ['helper-abort','startup-abort','scene-dispose','stop'])test('abort/disposal is idempotent with no late owner effects: '+kind,async()=>{
 const f=fixture(),owner=f.install(),stale=f.game.gltfLightBudget.prepareFrame;
 if(kind==='helper-abort')f.signal.abort();if(kind==='startup-abort')f.game.startupAbort.abort();if(kind==='scene-dispose')f.disposeScene();if(kind==='stop')owner.dispose();
 owner.dispose();const p=await owner.done;assert.equal(p.complete,false);assert.equal(f.timers.size,0);assert.equal(f.disposeCallbacks.size,0);stale.call(f.game.gltfLightBudget);assert.equal(owner.snapshot(),p);
});
test('foreign replacement/flags are preserved; own descriptors restore and prior wrapper cannot affect fresh Game',async()=>{
 const f=fixture(),owner=f.install(),foreign=()=>17;f.scene.render=foreign;f.game.gltfLightBudget.prepareFrame();const p=await owner.done;assert.equal(p.reason,'foreign-method');assert.equal(f.scene.render,foreign);assert.ok(p.restoreConflicts>0);
 const g=fixture();Object.defineProperty(g.game.gltfLightBudget,'prepareFrame',{value:g.expected.methods.prepareFrame,writable:true,enumerable:true,configurable:true});const before=Object.getOwnPropertyDescriptor(g.game.gltfLightBudget,'prepareFrame'),other=g.install();other.dispose();assert.deepEqual(Object.getOwnPropertyDescriptor(g.game.gltfLightBudget,'prepareFrame'),before);assert.throws(g.install,/fresh/);
 const fresh=fixture();assert.equal((await capture(fresh)).profile.complete,true);
});
test('preflight validates all descriptors before mutation, default class drift and duplicate arm refused',()=>{
 const f=fixture();Object.defineProperty(f.scene,'render',{value:f.expected.methods.render,writable:false,configurable:false});assert.throws(f.install,/descriptor/);assert.equal(Object.hasOwn(f.game.gltfLightBudget,'prepareFrame'),false);
 const g=fixture();g.expected.classes.Scene=class Other{};assert.throws(g.install,/singleton/);
 const h=fixture(),owner=h.install();assert.throws(h.install,/fresh/);owner.dispose();
});
test('partial descriptor install failure rolls back previous writes; original calls still work',async()=>{
 const f=fixture(),target=f.game.stableLights;f.game.stableLights=new Proxy(target,{defineProperty(){throw false;}});
 const owner=f.install(),p=await owner.done;assert.equal(p.reason,'installation-failed');assert.equal(p.restoreConflicts,0);assert.equal(Object.hasOwn(f.game.gltfLightBudget,'prepareFrame'),false);assert.equal(f.game.gltfLightBudget.prepareFrame(),undefined);validateEntryRenderProfile(p);
});
test('partial observer registration failure removes already installed abort listeners and all descriptors',async()=>{
 const f=fixture();let adds=0,removes=0;const add=f.signal.signal.addEventListener.bind(f.signal.signal),remove=f.signal.signal.removeEventListener.bind(f.signal.signal);
 f.signal.signal.addEventListener=(...args)=>{adds++;return add(...args);};f.signal.signal.removeEventListener=(...args)=>{removes++;return remove(...args);};
 f.scene.onDisposeObservable.add=()=>{throw false;};const owner=f.install(),p=await owner.done;assert.equal(p.reason,'installation-failed');assert.equal(adds,1);assert.equal(removes,1);assert.equal(f.timers.size,0);assert.equal(Object.hasOwn(f.scene,'render'),false);validateEntryRenderProfile(p);
});
test('ready-valid pending/controller failures refuse arm and do not mutate a descriptor',()=>{
 for(const change of [f=>{f.game.renderHealth.pendingByKind.preparation=1;},f=>{f.game.renderHealth.pendingByKind['shader-validation']=1;},f=>{f.game.actor.vehicle=true;},f=>{f.game.rendererFailed=true;}]){const f=fixture();change(f);assert.throws(f.install,/fresh/);assert.equal(Object.hasOwn(f.scene,'render'),false);assert.equal(f.timers.size,0);}
});
test('synchronous scene replay during registration retires late observer before timer installation',async()=>{
 const f=fixture();let removed=0,timers=0;f.scene.onDisposeObservable.add=cb=>{cb();return{remove(){removed++;}};};f.options.setTimer=()=>{timers++;return 1;};const owner=f.install(),p=await owner.done;assert.equal(p.reason,'scene-disposed');assert.equal(removed,1);assert.equal(timers,0);assert.equal(Object.hasOwn(f.scene,'render'),false);validateEntryRenderProfile(p);
});
test('synchronous abort during listener registration removes that exact late listener and installs no timer',async()=>{
 const f=fixture();let removed=0;const add=f.signal.signal.addEventListener.bind(f.signal.signal),remove=f.signal.signal.removeEventListener.bind(f.signal.signal);f.signal.signal.addEventListener=(...args)=>{add(...args);f.signal.abort();};f.signal.signal.removeEventListener=(...args)=>{removed++;remove(...args);};const owner=f.install(),p=await owner.done;assert.equal(p.reason,'aborted');assert.equal(removed,1);assert.equal(f.timers.size,0);assert.equal(Object.hasOwn(f.scene,'render'),false);validateEntryRenderProfile(p);
});
test('synchronous timer callback cannot publish a late live timer or owner',async()=>{const f=fixture();let cleared=0;f.options.setTimer=cb=>{cb();return 123;};f.options.clearTimer=id=>{assert.equal(id,123);cleared++;};const owner=f.install(),p=await owner.done;assert.equal(p.reason,'deadline');assert.equal(cleared,1);assert.equal(f.disposeCallbacks.size,0);validateEntryRenderProfile(p);});
test('hardened foreign descriptor flags survive owned cleanup and stale wrapper remains passthrough',async()=>{
 const f=fixture(),owner=f.install(),stale=f.scene.render;Object.defineProperty(f.scene,'render',{value:stale,writable:false,enumerable:false,configurable:false});f.game.gltfLightBudget.prepareFrame();const p=await owner.done;assert.equal(p.reason,'foreign-method');assert.equal(p.restoreConflicts,1);assert.equal(Object.getOwnPropertyDescriptor(f.scene,'render').writable,false);assert.equal(stale.call(f.scene),undefined);
});
for(const index of [0,1,2])test('synchronous teardown plus original falsy throw preserves primary at scope'+index,async()=>{
 const f=fixture(),owner=f.install();f.game.actor.vehicle=true;f.work.during=i=>{if(i===index)f.signal.abort();};f.work.throwEnabled=true;f.work.throwIndex=index;f.work.thrown=false;assert.throws(f.frame,e=>e===false);const p=await owner.done;assert.equal(p.reason,'aborted');assert.equal(p.complete,false);assert.equal(f.timers.size,0);validateEntryRenderProfile(p);
});
test('bounds stop accounting without dropping original nested calls',async()=>{const f=fixture(),owner=f.install();f.game.actor.vehicle=true;f.work.during=i=>{if(i===2)for(let n=0;n<33;n++)f.game.gltfLightBudget.prepareFrame();};f.frame();const p=await owner.done;assert.equal(p.overflow,true);assert.equal(p.reason,'overflow');assert.equal(p.frames[0].nested[0].calls,32);assert.equal(f.calls.filter(c=>c.index===0).length,34);validateEntryRenderProfile(p);});
test('actual pinned Scene and actual Gltf/Stable methods retain frame ID semantics and direct inner refresh scope',async()=>{
 const {NullEngine}=await import('@babylonjs/core/Engines/nullEngine.js'),{Scene}=await import('@babylonjs/core/scene.js'),{FreeCamera}=await import('@babylonjs/core/Cameras/freeCamera.js'),{Vector3}=await import('@babylonjs/core/Maths/math.vector.js');
 const{GltfLightBudget}=await import('../../../../../client/gltf-light-budget.ts'),{StableLightState}=await import('../../../../../client/stable-light-state.ts');
 const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('actual camera',Vector3.Zero(),scene);const budget=new GltfLightBudget(scene),stable=new StableLightState(scene);class Game{}
 const game=Object.assign(new Game(),{engine,scene,actor:{vehicle:false},gltfLightBudget:budget,stableLights:stable,ready:true,disposed:false,renderHealth:{rendererId:4,generation:1,phase:'ready',errorCount:0,pendingByKind:{preparation:0,'shader-validation':0}},startupAbort:new AbortController()});
 const expected={classes:{Game,Scene,GltfLightBudget,StableLightState},methods:{prepareFrame:GltfLightBudget.prototype.prepareFrame,update:StableLightState.prototype.update,render:Scene.prototype.render}},owner=captureEntryRenderCost(game,{enabled:true,expected});
 try{game.actor.vehicle=true;for(let i=0;i<8;i++){engine.beginFrame();budget.prepareFrame();stable.update();scene.render();engine.endFrame();}const p=await owner.done;assert.equal(p.complete,true);assert.equal(p.frames.every(f=>f.nested[0].calls===0),true);assert.equal(budget.stats.skippedFrames,16);validateEntryRenderProfile(p);}finally{owner.dispose();budget.dispose();stable.dispose();scene.dispose();engine.dispose();}
});
test('new receipt kind rejects malformed/profile/identity/completion drift and retains valid failure',async()=>{
 const f=fixture(),{profile}=await capture(f),identity={buildId:'build',sourceSnapshotId:'source',helperSha256:'helper',routineCost:true,lifecycleControls:false},raw={schemaVersion:1,...identity,attemptId:'8e9e7e15-6011-438d-96a2-53be43f17792',kind:'vehicle-entry-cost',mode:'diagnostic',atMs:1,timeOrigin:1,observerErrors:[],before:{},after:{},completed:true,validationErrors:[],entryProfile:profile};assert.equal(validateReceipt(raw,identity),raw);
 for(const patch of [{mode:'plain'},{routineCost:false},{entryProfile:null},{entryProfile:{...profile,frames:profile.frames.slice(1)}},{entryProfile:{...profile,remainingHooks:1}}])assert.throws(()=>validateReceipt({...raw,...patch},identity));
 const failed=fixture(),owner=failed.install();owner.dispose();const invalid={...raw,completed:false,entryProfile:await owner.done,validationErrors:['stopped']};assert.equal(validateReceipt(invalid,identity),invalid);
 for(const change of [p=>{p.shaderText='unexpected';},p=>{p.frames[0].engineFrameIdAfterRender++;},p=>{p.frames[0].scopes[1].startedAtMs=0;},p=>{p.frames[0].nested[0].resource={};},p=>{p.triggeredAtMs++;},p=>{p.frames[0].vehicleBeforeScene=false;}]){const changed=structuredClone(profile);change(changed);assert.throws(()=>validateEntryRenderProfile(changed));}
});
test('actual Game prelude AST calls are unchanged and use only the three original methods',async()=>{
 const source=await readFile(join(root,'client/game.ts'),'utf8'),ast=ts.createSourceFile('game.ts',source,ts.ScriptTarget.Latest,true);
 const game=ast.statements.find(n=>ts.isClassDeclaration(n)&&n.name?.text==='Game'),frame=game.members.find(n=>n.name?.getText(ast)==='frame');
 const names=['this.gltfLightBudget.prepareFrame()','this.stableLights.update()','this.scene.render()'];
 const calls=frame.body.statements.map(n=>n.getText(ast));const index=calls.indexOf(names[0]+';');assert.ok(index>=0);assert.deepEqual(calls.slice(index,index+3),names.map(x=>x+';'));
 const sourceClass=ts.transpileModule('class OriginalPrelude{run(){'+calls.slice(index,index+3).join('\n')+'}}',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const actual=new Function(sourceClass+';return OriginalPrelude.prototype.run;')(),f=fixture(),owner=f.install();f.game.actor.vehicle=true;
 for(let i=0;i<8;i++){actual.call(f.game);f.engine._frameId++;}assert.equal((await owner.done).complete,true);assert.equal(f.calls.length,24);
});
test('harness emits exact snapshot singleton class imports and a parseable virtual module without a new flag',async()=>{
 const source=await readFile(join(directory,'harness.mjs'),'utf8'),ast=ts.createSourceFile('harness.mjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);let expression;
 function visit(n){if(ts.isVariableDeclaration(n)&&n.name.getText(ast)==='entryClasses')expression=n.initializer.getText(ast);ts.forEachChild(n,visit);}visit(ast);
 const virtual=new Function('join','snapshot','return '+expression)((...args)=>args.join('\\'),'C:\\immutable\\source12');
 assert.ok(virtual.includes('C:/immutable/source12/client/game.ts'));assert.ok(virtual.includes('C:/immutable/source12/client/gltf-light-budget.ts'));assert.ok(virtual.includes('C:/immutable/source12/client/stable-light-state.ts'));
 assert.equal(ts.createSourceFile('virtual.mjs',virtual,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS).parseDiagnostics.length,0);
});
test('actual QA entry button owns standby, original accepted transition, receipt and teardown; old8button never invoked',async()=>{
 const f=fixture(),elements=[],intervals=new Set(),requests=[],flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 class Element{constructor(tag){this.tag=tag;this.style={};elements.push(this);}append(){}setAttribute(){}remove(){}}
 const document={createElement:tag=>new Element(tag),body:new Element('body'),visibilityState:'visible',hasFocus:()=>true};
 f.scene.onDisposeObservable.addOnce=f.scene.onDisposeObservable.add;
 Object.assign(f.scene,{meshes:[],materials:[],geometries:[],getActiveMeshes:()=>({length:0}),getWaitingItemsCount:()=>0});
 Object.assign(f.engine,{isWebGPU:false,getRenderWidth:()=>2040,getRenderHeight:()=>986,getHardwareScalingLevel:()=>1});
 Object.assign(f.game,{avatars:new Map(),adaptive:{state:{mode:'medium',quality:'medium'}},quality:'medium',camera:{globalPosition:{x:0,y:1,z:0},fov:1,getViewMatrix:()=>({m:[]}),getProjectionMatrix:()=>({m:[]})},gpu:{},trafficInstant:()=>0,compilationProfile:{snapshot:()=>({})}});
 f.game.renderHealth.snapshot=()=>({rendererId:2,generation:1,phase:'ready',valid:true,errorCount:0,pendingOperations:0});
 const identity={label:'cpu',buildId:'build',sourceSnapshotId:'source',helperSha256:'helper',routineCost:true,lifecycleControls:false,startupLatency:false,bufferLifecycle:false,shaderAttribution:false,loading:'original',clock:null};
 const URLFixture=class extends URL{static createObjectURL(){return'blob:fixture';}static revokeObjectURL(){}};
 const deps={Game:f.expected.classes.Game,Scene:f.expected.classes.Scene,GltfLightBudget:f.expected.classes.GltfLightBudget,StableLightState:f.expected.classes.StableLightState,
  observeOperation,observePreparationResult,createAttemptQueue,installBrowserClock,observeStartupLatency,observeBufferLifecycle,
  captureEntryRenderCost:(g,options)=>captureEntryRenderCost(g,{...options,now:f.options.now,setTimer:f.options.setTimer,clearTimer:f.options.clearTimer}),
  captureRoutineCost(){throw Error('old8button must remain uninvoked');},createPlannedBenchmark(){throw Error('no planner');},createShaderAttributionWindow(){throw Error('no shader');},projectShaderInventory(){return{};},createLifecycleControls(){throw Error('no lifecycle');},createVisibilityAnchor(){throw Error('no lifecycle');},
  document,window:{addEventListener(){},removeEventListener(){}},location:{hostname:'127.0.0.1',search:''},navigator:{userAgent:'CPU fixture'},crypto:{randomUUID:()=>webcrypto.randomUUID(),subtle:{digest:async(_a,bytes)=>Buffer.from(sha256(bytes),'hex')}},URL:URLFixture,URLSearchParams,Blob,TextEncoder,performance,innerWidth:2040,innerHeight:986,devicePixelRatio:1,
  setInterval:cb=>{intervals.add(cb);return cb;},clearInterval:cb=>intervals.delete(cb),setTimeout(){throw Error('old8deadline unused');},clearTimeout(){},
  fetch:async(_path,options)=>{const raw=JSON.parse(options.body);requests.push(raw);return{ok:true,json:async()=>({persisted:true,attemptId:raw.attemptId,sha256:sha256(options.body),bytes:Buffer.byteLength(options.body)})};},__WEBGPU_COMPLETION_IDENTITY__:identity};
 const source=(await readFile(join(directory,'qa-overlay.mjs'),'utf8')).replace(/^import .*;\r?\n/gm,'').replace('export async function observeStartup','async function observeStartup');
 const observe=new Function(...Object.keys(deps),source+';return observeStartup;')(...Object.values(deps));
 assert.equal(await observe(f.game,{dataset:{}},async()=>42),42);await flush();
 const button=elements.find(e=>e.textContent==='Diagnostic · první vstup do auta /8 framů /3 render fáze');assert.ok(button);assert.equal(button.disabled,false);
 const pending=button.onclick();for(let i=0;i<16;i++)f.frame();assert.equal(requests.filter(r=>r.kind==='vehicle-entry-cost').length,0);
 f.game.actor.vehicle=true;for(let i=0;i<8;i++)f.frame();await pending;await flush();
 const raw=requests.find(r=>r.kind==='vehicle-entry-cost');assert.ok(raw);assert.equal(raw.completed,true);assert.equal(raw.before.vehicle,false);assert.equal(raw.after.vehicle,true);validateReceipt(raw,identity);
 assert.equal(raw.entryProfile.frames.length,8);assert.equal(f.timers.size,0);assert.equal(intervals.size,0);
 for(const cb of [...f.disposeCallbacks])cb();assert.equal(Object.hasOwn(f.scene,'render'),false);
});
test('v10 routine modules/original button are byte-exact and UI transform remains exact once',async()=>{
 const old=join(root,'.cache/webgpu-completion-20261021/preparation-summary/helper/v10');for(const file of ['routine-cost.mjs','routine-cost-core.mjs','routine-cost.test.mjs']){let bytes=await readFile(join(directory,file));if(file==='routine-cost.test.mjs'){const from="../../../../../docs/performance/evidence/webgpu-migration-20261016/f3-routine-profile/overlay/client/qa-routine-profile.ts.gz",to="../../webgpu-migration-20261016/f3-routine-profile/overlay/client/qa-routine-profile.ts.gz";const text=bytes.toString();assert.equal(text.split(from).length,2);bytes=Buffer.from(text.replace(from,to));}assert.deepEqual(bytes,await readFile(join(old,file)));}
 const oldOverlay=await readFile(join(old,'qa-overlay.mjs'),'utf8'),overlay=await readFile(join(directory,'qa-overlay.mjs'),'utf8');const block=s=>s.slice(s.indexOf("  if (identity.routineCost) action('Diagnostic ·8"),s.indexOf("  if (identity.clock?.config.benchmarkAtUTC"));assert.ok(overlay.includes(block(oldOverlay)));
 const ui=await readFile(join(root,'client/ui.tsx')),before=sha256(ui),transformed=transformUI(ui.toString());assert.equal(ts.createSourceFile('qa.tsx',transformed,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX).parseDiagnostics.length,0);assert.equal(sha256(await readFile(join(root,'client/ui.tsx'))),before);assert.equal(Object.keys((await helperIdentity(directory)).files).length,42);
});
test('donor/pin selected8 method descriptors and all four original Mesh observer ordering assertions',async()=>{
 const donor=gunzipSync(await readFile(join(root,'docs/performance/evidence/webgpu-migration-20261016/f3-routine-profile/overlay/client/qa-routine-profile.ts.gz')));assert.equal(sha256(donor),'ee3c3280de69ee61dcbf433dcf2a259d07a4efa80a711f822056da331168289f');
 const pin=JSON.parse(await readFile(join(root,'.cache/performance-snapshot/webgpu-completion-20261023-candidate-12/node_modules/@babylonjs/core/package.json'),'utf8'));assert.equal(pin.version,'9.30.0');
 const{Mesh}=await import('@babylonjs/core/Meshes/mesh.js'),{Scene}=await import('@babylonjs/core/scene.js'),{NullEngine}=await import('@babylonjs/core/Engines/nullEngine.js'),{TransformNode}=await import('@babylonjs/core/Meshes/transformNode.js'),{PBRBaseMaterial}=await import('@babylonjs/core/Materials/PBR/pbrBaseMaterial.js'),{StandardMaterial}=await import('@babylonjs/core/Materials/standardMaterial.js');
 const engine=new NullEngine(),scene=new Scene(engine);try{
  for(const[target,key]of [[scene,'getActiveMeshCandidates'],[Scene.prototype,'_activeMesh'],[TransformNode.prototype,'computeWorldMatrix'],[Mesh.prototype,'getLOD'],[PBRBaseMaterial.prototype,'isReadyForSubMesh'],[StandardMaterial.prototype,'isReadyForSubMesh'],[PBRBaseMaterial.prototype,'bindForSubMesh'],[StandardMaterial.prototype,'bindForSubMesh']]){const descriptor=Object.getOwnPropertyDescriptor(target,key);assert.equal(typeof descriptor?.value,'function');assert.equal(descriptor.configurable||descriptor.writable,true);}
  const body=Mesh.prototype.render.toString(),markers=['_getInstancesRenderList','_onBeforeRenderObservable.notifyObservers','material.isReadyForSubMesh','_onBeforeBindObservable.notifyObservers','effectiveMaterial.bindForSubMesh'];const positions=markers.map(s=>body.indexOf(s));for(const p of positions)assert.ok(p>=0);for(let i=1;i<positions.length;i++)assert.ok(positions[i-1]<positions[i]);
 }finally{scene.dispose();engine.dispose();}
});

for(const index of [0,1])test('five same-index2ms/3ms selfnested bodies under Scene are partial, never false complete: '+index,async()=>{
 const f=fixture(),owner=f.install();f.game.actor.vehicle=true;f.work.nested=true;let level=0;const replies=[],value={original:true};f.work.returns=[value,value,value];
 f.work.during=i=>{if(i!==index||!['nested','recursive'].includes(f.calls.at(-1).args[0]))return;level++;try{if(level<5)replies.push((index===0?f.game.gltfLightBudget.prepareFrame:f.game.stableLights.update).call(index===0?f.game.gltfLightBudget:f.game.stableLights,'recursive'));}finally{level--;}};
 const returned=f.frame(),p=await owner.done;assert.deepEqual(returned,[value,value,value]);assert.equal(replies.length,4);assert.equal(replies.every(r=>r===value),true);
 assert.equal(p.reason,'phase-error');assert.equal(p.complete,false);assert.equal(p.phaseErrors,1);assert.equal(p.remainingHooks,0);assert.equal(f.timers.size,0);assert.equal(f.disposeCallbacks.size,0);assert.deepEqual([0,1,2].map(i=>f.calls.filter(c=>c.index===i).length),index===0?[6,2,1]:[2,6,1]);validateEntryRenderProfile(p);
 const identity={buildId:'build',sourceSnapshotId:'source',helperSha256:'helper',routineCost:true,lifecycleControls:false},raw={schemaVersion:1,...identity,attemptId:'8e9e7e15-6011-438d-96a2-53be43f17792',kind:'vehicle-entry-cost',mode:'diagnostic',atMs:1,timeOrigin:1,observerErrors:[],before:{vehicle:false},after:{vehicle:true},completed:false,validationErrors:['phase-error'],entryProfile:p};assert.equal(validateReceipt(raw,identity),raw);
});
for(const index of [0,1])for(const thrown of [undefined,null,false,0,'',new Error('selfnested primary')])test('same-index recursive original throw remains exact after diagnostic retirement: '+index+'/'+String(thrown),async()=>{
 const f=fixture(),owner=f.install();f.game.actor.vehicle=true;f.work.nested=true;let level=0;
 f.work.during=i=>{if(i!==index||!['nested','recursive'].includes(f.calls.at(-1).args[0]))return;level++;try{if(level<5)(index===0?f.game.gltfLightBudget.prepareFrame:f.game.stableLights.update).call(index===0?f.game.gltfLightBudget:f.game.stableLights,'recursive');if(level===5)throw thrown;}finally{level--;}};
 let caught=false;try{f.frame();}catch(e){caught=true;assert.equal(e,thrown);}assert.equal(caught,true);const p=await owner.done;assert.equal(p.reason,'phase-error');assert.equal(p.complete,false);assert.equal(p.remainingHooks,0);assert.equal(f.timers.size,0);assert.equal(f.disposeCallbacks.size,0);assert.equal(Object.hasOwn(f.scene,'render'),false);validateEntryRenderProfile(p);
});
