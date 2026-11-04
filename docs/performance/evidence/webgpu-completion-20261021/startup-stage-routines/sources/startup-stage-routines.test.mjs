import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
import {Scene} from '@babylonjs/core/scene.js';
import {FreeCamera} from '@babylonjs/core/Cameras/freeCamera.js';
import {Vector3} from '@babylonjs/core/Maths/math.vector.js';
import {MeshBuilder} from '@babylonjs/core/Meshes/meshBuilder.js';
import {StandardMaterial} from '@babylonjs/core/Materials/standardMaterial.js';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as probe from './startup-stage-routines.mjs';
import {transformStartupSource,STARTUP_ROUTINE_TARGETS,parseBuildOptions,buildDigest,browserBuildIdentity,helperIdentity,sha256} from './common.mjs';
import {prepareLightVariants} from '../../../../../client/light-preparation.ts';
import {validateReceipt} from './receipt.mjs';
import {verifyBuildContract} from './harness.mjs';

const source=await readFile(new URL('../../../../../client/light-preparation.ts',import.meta.url),'utf8');
const gameSource=await readFile(new URL('../../../../../client/game.ts',import.meta.url),'utf8');
function transformed(){let js=ts.transpileModule(transformStartupSource(source,'light',STARTUP_ROUTINE_TARGETS[0]),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
  js=js.replace(/^import .* from "virtual:webgpu-completion-startup-routines";\r?\n/m,'').replace('export function prepareLightVariants','function prepareLightVariants');
  return new Function(...Object.keys(probe),js+'\nreturn prepareLightVariants;')(...Object.values(probe));}
const actual=transformed();
const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function fixture(target='first-medium-vehicle-0'){
  const engine=new NullEngine(),scene=new Scene(engine);new FreeCamera('CPU source fixture',new Vector3(0,0,-8),scene);
  const mesh=MeshBuilder.CreateBox('CPU fixture box',{},scene);mesh.material=new StandardMaterial('CPU fixture material',scene);
  const health={rendererId:1,generation:1,errorCount:0,phase:'preparing'},startupAbort=new AbortController();
  const game={engine,scene,renderHealth:health,startupAbort,quality:'medium',ready:false,disposed:false};
  let cpuClock=0;const owner=probe.createStartupStageRoutines(game,{target,profileNow:()=>cpuClock+=.01});
  return{game,engine,scene,mesh,owner,dispose(){owner?.dispose();scene.dispose();engine.dispose();}};
}
async function run(f,operation=actual,{throwRender,renderReturn,timeoutMs=30000,quality='medium'}={}){
  f.game.quality=quality;let now=1000,nowReads=0,tick,disposal,done=false,result,renders=0;
  const options={apply(){},restore(){},meshes:()=>[],beforeChecks(){},check:()=>true,effectsReady:()=>true,
    render(){renders++;if(throwRender)throw throwRender.value;f.scene.render();return renderReturn;},
    run(callback){tick=callback;},stop(callback){assert.equal(callback,tick);},onDispose(callback){disposal=callback;return()=>{disposal=undefined;};},isDisposed:()=>false,
    revision:()=>[],now:()=>{nowReads++;return now;},setTimer:()=>1,clearTimer(){},timeoutMs,includeVehicleVariants:true,includeDayPointVariants:true};
  assert.equal(probe.registerStartupOptions(f.game,options),options);
  const promise=operation(options);assert.ok(promise instanceof Promise);promise.then(value=>{result=value;done=true;});
  for(let i=0;i<1000&&!done;i++){now+=10;tick();await flush();}
  assert.ok(done,'finite original light state machine completed');assert.equal(disposal,undefined);
  return{result,options,renders,nowReads,promise};
}
test('defaultoff has no owner/source transform, proxy reads, hooks or new options identity',()=>{
  const hostile=new Proxy({},{get(){throw Error('defaultoff read');},getOwnPropertyDescriptor(){throw Error('defaultoff descriptor');}});
  assert.equal(probe.createStartupStageRoutines(hostile),undefined);assert.equal(transformStartupSource(source,'light'),source);assert.equal(transformStartupSource(gameSource,'game'),gameSource);
  const options={};assert.equal(probe.registerStartupOptions(hostile,options),options);
});
test('actual Game/light exact transforms parse, preserve original call points and reject reinjection/drift',()=>{
  for(const kind of['game','light']){const raw=kind==='game'?gameSource:source,out=transformStartupSource(raw,kind,STARTUP_ROUTINE_TARGETS[0]);
    assert.equal(ts.createSourceFile(kind+'.ts',out,ts.ScriptTarget.Latest,true).parseDiagnostics.length,0);assert.throws(()=>transformStartupSource(out,kind,STARTUP_ROUTINE_TARGETS[0]));}
  assert.throws(()=>transformStartupSource(source.replace('stageStarted = options.now();','stageStarted = Date.now();'),'light',STARTUP_ROUTINE_TARGETS[0]));
  assert.throws(()=>transformStartupSource(gameSource.replace('return prepareLightVariants({','return foreignVariants({'),'game',STARTUP_ROUTINE_TARGETS[0]));
  assert.equal((transformStartupSource(source,'light',STARTUP_ROUTINE_TARGETS[0]).match(/new Promise\(/g)||[]).length,(source.match(/new Promise\(/g)||[]).length);
});
test('canonical closed target lives in sealed transforms and explicit parser cannot be query/unknown/duplicate',()=>{
  assert.deepEqual(STARTUP_ROUTINE_TARGETS,probe.STARTUP_TARGETS);
  assert.equal(parseBuildOptions([]).startupRoutines,null);
  for(const target of STARTUP_ROUTINE_TARGETS)assert.equal(parseBuildOptions(['--startup-routines',target]).startupRoutines,target);
  for(const args of[['--startup-routines'],['--startup-routines','unknown'],['--startup-routines',STARTUP_ROUTINE_TARGETS[0],'--startup-routines',STARTUP_ROUTINE_TARGETS[0]]])assert.throws(()=>parseBuildOptions(args));
  const seed={sourceSnapshotId:'source',helperSha256:'helper',label:'label',loading:'original',transforms:{startupRoutines:{target:null}},clock:null,weather:null,startupLatency:false,shaderAttribution:false,routineCost:false,bufferLifecycle:false,lifecycleControls:false,dependencies:{}};
  const changed={...seed,transforms:{startupRoutines:{target:STARTUP_ROUTINE_TARGETS[0]}}};assert.notEqual(buildDigest(seed),buildDigest(changed));assert.equal(browserBuildIdentity(changed).startupRoutines,STARTUP_ROUTINE_TARGETS[0]);
  assert.throws(()=>buildDigest({...seed,transforms:{startupRoutines:{target:'arbitrary'}}}));assert.throws(()=>buildDigest({...seed,transforms:{startupRoutines:{}}}));
  const id={...changed,sourceSnapshotId:'s',startupRoutines:STARTUP_ROUTINE_TARGETS[0]};verifyBuildContract(id,{snapshotId:'s'});
  const missing={...id};delete missing.startupRoutines;assert.throws(()=>verifyBuildContract(missing,{snapshotId:'s'}));assert.throws(()=>verifyBuildContract({...id,startupRoutines:STARTUP_ROUTINE_TARGETS[1]},{snapshotId:'s'}));
});
test('actual original state machine + native GLSL Scene give exact boundaries and fewer-than8 valid routine frames',async()=>{
  const f=fixture();try{assert.equal(f.engine.isWebGPU,false,'Null GLSL is not hardware/WebGPU evidence');const {result}=await run(f);f.owner.dispose('startup-resolved');
    const raw=f.owner.snapshot();assert.equal(raw.complete,true);assert.equal(raw.capture.complete,true);assert.equal(raw.stages.length,19);assert.equal(raw.capture.frames.length,3);assert.equal(raw.remainingRoutineHooks,0);
    assert.equal(raw.passes[0].quality,'medium');for(const r of raw.stages)assert.equal(r.endedAtMs-r.startedAtMs,result.stages[r.index].elapsedMs);
    assert.ok(raw.capture.frames.every(r=>r.nativeFrameIdAfter===r.frameId+1&&r.rows.length===32));assert.ok(raw.capture.frames.some(f=>f.rows.some(r=>r.id==='Scene._activeMesh'&&r.calls>0)));
    probe.validateStartupStageRoutines(raw,STARTUP_ROUTINE_TARGETS[0]);assert.equal(Object.hasOwn(f.scene,'render'),false);
  }finally{f.dispose();}
});
test('both day targets use actual original stages and exact first quality occurrence',async()=>{
  for(const[target,quality]of[['first-low-day-1-on','low'],['first-high-day-1-on','high']]){const f=fixture(target);try{await run(f,actual,{quality});f.owner.dispose('startup-resolved');const p=f.owner.snapshot();assert.equal(p.complete,true);assert.equal(p.capture.stageIndex,17);assert.equal(p.stages[17].name,'day-1-on');assert.equal(p.capture.frames.length,3);probe.validateStartupStageRoutines(p,target);}finally{f.dispose();}}
});
test('instrumentation preserves original now/callback counts, Promise-return callbacks and falsy render errors',async()=>{
  for(const value of[false,0,'',undefined]){const a=fixture(null),b=fixture();try{const before=await run(a,prepareLightVariants,{throwRender:{value}}),after=await run(b,actual,{throwRender:{value}});assert.deepEqual(after.result,before.result);assert.equal(after.nowReads,before.nowReads);assert.equal(after.renders,before.renders);b.owner.dispose('startup-rejected');assert.equal(b.owner.snapshot().complete,false);}finally{a.dispose();b.dispose();}}
  const a=fixture(null),b=fixture();try{const never=new Promise(()=>{});Object.defineProperty(never,'then',{get(){throw Error('original callback Promise must not be inspected');}});const original=await run(a,prepareLightVariants,{renderReturn:never}),observed=await run(b,actual,{renderReturn:never});assert.equal(original.nowReads,observed.nowReads);assert.equal(original.renders,observed.renders);assert.deepEqual(original.result,observed.result);}finally{a.dispose();b.dispose();}
});
test('unreached/partial targets and repeated Medium keep truthful pass indices/status without new budgets',async()=>{
  const f=fixture('first-high-day-1-on');try{await run(f);f.game.quality='high';const {result}=await run(f,actual,{quality:'high',timeoutMs:100});assert.equal(result.status,'timeout');f.owner.dispose('startup-rejected');const p=f.owner.snapshot();assert.equal(p.complete,false);assert.equal(p.capture.reached,false);assert.equal(p.passes.length,2);probe.validateStartupStageRoutines(p,'first-high-day-1-on');}finally{f.dispose();}
  const b=fixture();try{await run(b);const frameIds=b.owner.snapshot().capture.frames.map(f=>f.frameId);await run(b);b.owner.dispose('startup-resolved');const p=b.owner.snapshot();assert.equal(p.passes.length,2);assert.deepEqual(p.capture.frames.map(f=>f.frameId),frameIds);assert.equal(p.capture.passIndex,0);probe.validateStartupStageRoutines(p,STARTUP_ROUTINE_TARGETS[0]);}finally{b.dispose();}
});
test('foreign scenes pass through selected prototype hooks and abort/rejoin retire late options',()=>{
  const f=fixture(),other=fixture(null);try{const options={};probe.registerStartupOptions(f.game,options);probe.startupPassStarted(options,1);probe.startupStageStarted(options,0,'vehicle-0',2);const token=probe.startupRenderBegin(options,3);other.scene.render();f.scene.render();probe.startupRenderEnd(token,4,true);
    f.game.startupAbort.abort();const old=f.owner.snapshot();assert.equal(old.active,false);assert.equal(old.remainingRoutineHooks,0);probe.startupStageSaved(options,0,8,false);assert.deepEqual(f.owner.snapshot(),old);
    const fresh=probe.createStartupStageRoutines(f.game,{target:STARTUP_ROUTINE_TARGETS[0]});assert.equal(fresh.snapshot().active,false,'aborted identity cannot restart');fresh.dispose();
  }finally{f.dispose();other.dispose();}
});
test('frame cap and foreign descriptor restoration are explicit without consuming original operations',()=>{
  const f=fixture();try{const options={};probe.registerStartupOptions(f.game,options);probe.startupPassStarted(options,1);probe.startupStageStarted(options,0,'vehicle-0',2);
    for(let i=0;i<9;i++){const t=probe.startupRenderBegin(options,3+i*2);f.scene.render();if(t)probe.startupRenderEnd(t,4+i*2,true);}
    probe.startupStageSaved(options,0,30,false);probe.startupPassFinished(options,31,'complete');f.owner.dispose('startup-resolved');const p=f.owner.snapshot();assert.equal(p.capture.frames.length,8);assert.equal(p.capture.capped,true);assert.equal(p.complete,false);probe.validateStartupStageRoutines(p,STARTUP_ROUTINE_TARGETS[0]);
  }finally{f.dispose();}
  const b=fixture();let foreign;try{const options={};probe.registerStartupOptions(b.game,options);probe.startupPassStarted(options,1);probe.startupStageStarted(options,0,'vehicle-0',2);const t=probe.startupRenderBegin(options,3);
    const own=Object.getOwnPropertyDescriptor(b.scene,'getActiveMeshCandidates');foreign=function(){return {data:[],length:0};};Object.defineProperty(b.scene,'getActiveMeshCandidates',{...own,value:foreign});b.scene.render();probe.startupRenderEnd(t,4,true);b.owner.dispose();assert.equal(b.scene.getActiveMeshCandidates,foreign);assert.ok(b.owner.snapshot().restoreConflicts>0);
  }finally{b.dispose();}
});
test('strict startup-only receipt/schema guards reject false complete, clocks, getter rows, identity and cap tamper',async()=>{
  const f=fixture();try{await run(f);f.owner.dispose('startup-resolved');const raw=f.owner.snapshot();const clone=()=>structuredClone(raw);
    for(const mutate of[p=>p.capture.frames[0].endedAtMs=null,p=>p.capture.frames[0].nativeFrameIdAfter++,p=>p.stages[0].endedAtMs=null,p=>p.target='arbitrary',p=>p.limits.bytes++,p=>p.passes[0].quality='high',p=>p.capture.frames.reverse(),p=>p.capture.frames[1]=structuredClone(p.capture.frames[0]),p=>p.stages[1].name='vehicle-0']){const p=clone();mutate(p);assert.throws(()=>probe.validateStartupStageRoutines(p,STARTUP_ROUTINE_TARGETS[0]));}
    const getter=clone();Object.defineProperty(getter.capture.frames[0].rows[0],'calls',{get(){throw Error('getter invoked');},enumerable:true});assert.throws(()=>probe.validateStartupStageRoutines(getter,STARTUP_ROUTINE_TARGETS[0]),e=>!/getter invoked/.test(e.message));
    const identity={buildId:'b',sourceSnapshotId:'s',helperSha256:'h',lifecycleControls:false,startupRoutines:STARTUP_ROUTINE_TARGETS[0]};const receipt={...identity,schemaVersion:1,attemptId:'8e9e7e15-6011-438d-96a2-53be43f17792',kind:'startup',outcome:'resolved',mode:'diagnostic',atMs:100,timeOrigin:1000,observerErrors:[],samples:[],terminal:{},startupStageRoutines:raw};validateReceipt(receipt,identity);assert.throws(()=>validateReceipt({...receipt,kind:'state'},identity));assert.throws(()=>validateReceipt({...receipt,startupRoutines:null},identity));assert.ok(Buffer.byteLength(JSON.stringify(receipt))<2*1024*1024);assert.ok(Buffer.byteLength(JSON.stringify(raw))<probe.STARTUP_LIMITS.bytes);
  }finally{f.dispose();}
});
test('new pack contains38 exact inputs and keeps old routine/core byteidentical',async()=>{
  const path=new URL('.',import.meta.url),id=await helperIdentity(path.pathname.slice(1));assert.equal(Object.keys(id.files).length,38);
  for(const file of['routine-cost.mjs','routine-cost-core.mjs'])assert.deepEqual(await readFile(new URL(file,import.meta.url)),await readFile(new URL('../../../startup-stage-export/helper/v17/'+file,import.meta.url)));
});
test('16pass/304stage cap keeps bounded truthful prefix and never substitutes original options',()=>{
  const f=fixture();try{let at=0;
    for(let p=0;p<17;p++){const o={};assert.equal(probe.registerStartupOptions(f.game,o),o);probe.startupPassStarted(o,++at);
      for(let i=0;i<19;i++){const name=['vehicle-0','vehicle-1','vehicle-2','vehicle-keyed-0','vehicle-keyed-1','vehicle-keyed-2','current-off','current-on','night-0-off','night-0-on','night-1-off','night-1-on','night-2-off','night-2-on','day-0-off','day-0-on','day-1-off','day-1-on','restore'][i];probe.startupStageStarted(o,i,name,++at);probe.startupStageSaved(o,i,++at,false);}
      probe.startupPassFinished(o,++at,'complete');}
    f.owner.dispose('startup-resolved');const p=f.owner.snapshot();assert.equal(p.passCount,17);assert.equal(p.passes.length,16);assert.equal(p.stages.length,304);assert.equal(p.overflow,true);assert.equal(p.complete,false);probe.validateStartupStageRoutines(p,STARTUP_ROUTINE_TARGETS[0]);assert.ok(Buffer.byteLength(JSON.stringify(p))<probe.STARTUP_LIMITS.bytes);
  }finally{f.dispose();}
});
test('sameScene recursion and options reentry preserve original native work but cannot become complete',()=>{
  const f=fixture();try{const o={};probe.registerStartupOptions(f.game,o);probe.startupPassStarted(o,1);probe.startupStageStarted(o,0,'vehicle-0',2);const t=probe.startupRenderBegin(o,3);
    const reentrant={};assert.equal(probe.registerStartupOptions(f.game,reentrant),reentrant);let entered=false;const obs=f.scene.onBeforeRenderObservable.add(()=>{if(!entered){entered=true;f.scene.render();}});f.scene.render();f.scene.onBeforeRenderObservable.remove(obs);probe.startupRenderEnd(t,4,true);
    probe.startupStageSaved(o,0,5,false);probe.startupPassFinished(o,6,'complete');f.owner.dispose('startup-resolved');const p=f.owner.snapshot();assert.equal(entered,true);assert.equal(p.capture.frames[0].nativeFrameIdAfter,p.capture.frames[0].frameId+2);assert.equal(p.complete,false);assert.ok(p.errors>0);probe.validateStartupStageRoutines(p,STARTUP_ROUTINE_TARGETS[0]);
  }finally{f.dispose();}
});
test('owner retirement during native render and fresh sameGame generation reject late source callbacks',()=>{
  const f=fixture();try{const o={};probe.registerStartupOptions(f.game,o);probe.startupPassStarted(o,1);probe.startupStageStarted(o,0,'vehicle-0',2);const t=probe.startupRenderBegin(o,3);f.owner.dispose();
    const old=f.owner.snapshot();f.game.renderHealth.generation++;f.game.startupAbort=new AbortController();const fresh=probe.createStartupStageRoutines(f.game,{target:STARTUP_ROUTINE_TARGETS[0]});
    probe.startupRenderEnd(t,4,true);probe.startupStageSaved(o,0,5,false);assert.deepEqual(f.owner.snapshot(),old);assert.equal(fresh.snapshot().active,true);fresh.dispose();assert.equal(fresh.snapshot().remainingRoutineHooks,0);
  }finally{f.dispose();}
});
test('descriptor preflight failure is atomic, getters stay uncalled and later calls do not retry instrumentation',()=>{
  const f=fixture();const before=Object.getOwnPropertyDescriptor(f.scene,'getActiveMeshCandidates');let reads=0;const primary=false;
  try{Object.defineProperty(f.scene,'getActiveMeshCandidates',{configurable:true,get(){reads++;throw primary;}});const o={};probe.registerStartupOptions(f.game,o);probe.startupPassStarted(o,1);probe.startupStageStarted(o,0,'vehicle-0',2);
    assert.equal(probe.startupRenderBegin(o,3),null);assert.equal(reads,0);const errors=f.owner.snapshot().errors;assert.equal(probe.startupRenderBegin(o,4),null);assert.equal(f.owner.snapshot().errors,errors);assert.throws(()=>f.scene.render(),e=>e===primary);
    f.owner.dispose();const p=f.owner.snapshot();assert.equal(p.remainingRoutineHooks,0);assert.ok(p.errors>0);probe.validateStartupStageRoutines(p,STARTUP_ROUTINE_TARGETS[0]);
  }finally{if(before)Object.defineProperty(f.scene,'getActiveMeshCandidates',before);else delete f.scene.getActiveMeshCandidates;f.dispose();}
});
test('cross-pass clock rollback retires only diagnostic state and retains a valid partial prefix',()=>{
  const f=fixture();try{const a={},b={};probe.registerStartupOptions(f.game,a);probe.startupPassStarted(a,10);probe.startupStageStarted(a,0,'vehicle-0',11);probe.startupStageSaved(a,0,12,false);probe.startupPassFinished(a,13,'complete');
    assert.equal(probe.registerStartupOptions(f.game,b),b);probe.startupPassStarted(b,9);const p=f.owner.snapshot();assert.equal(p.reason,'observer-error');assert.equal(p.active,false);assert.equal(p.passes[1].startedAtMs,null);assert.equal(p.complete,false);assert.equal(f.game.disposed,false);assert.equal(f.game.ready,false);probe.validateStartupStageRoutines(p,STARTUP_ROUTINE_TARGETS[0]);
  }finally{f.dispose();}
});
test('actual overlay exports the startup trace once before UI continuation and original stage summary stays present',async()=>{
  // Reuse the complete pre-existing DOM/transport fixture body; only inject
  // the new diagnostic binding/flag. Never import its test registration.
  const file=await readFile(new URL('./preparation-summary.test.mjs',import.meta.url),'utf8'),ast=ts.createSourceFile('fixture.mjs',file,ts.ScriptTarget.Latest,true);
  let body=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='overlayFixture').getText(ast);
  for(const[from,to]of[['observeOperation, observePreparationResult, createAttemptQueue','createStartupStageRoutines, observeOperation, observePreparationResult, createAttemptQueue'],['startupLatency: false, bufferLifecycle:','startupRoutines: "first-medium-vehicle-0", startupLatency: false, bufferLifecycle:'],["projectShaderInventory() { throw Error('default-off shader inventory'); }",'projectShaderInventory']]){assert.equal(body.split(from).length,2);body=body.replace(from,to);}
  const modules=await Promise.all(['startup-observer','attempt-queue','browser-clock','transit-clock','startup-latency','buffer-lifecycle','lifecycle-controls','shader-attribution'].map(name=>import('./'+name+'.mjs')));
  const dependencies={readFile,join,directory:dirname(fileURLToPath(import.meta.url)),webcrypto,sha256,createStartupStageRoutines:probe.createStartupStageRoutines,
    observeOperation:modules[0].observeOperation,observePreparationResult:modules[0].observePreparationResult,createAttemptQueue:modules[1].createAttemptQueue,installBrowserClock:modules[2].installBrowserClock,createPlannedBenchmark:modules[3].createPlannedBenchmark,
    observeStartupLatency:modules[4].observeStartupLatency,observeBufferLifecycle:modules[5].observeBufferLifecycle,createLifecycleControls:modules[6].createLifecycleControls,createVisibilityAnchor:modules[6].createVisibilityAnchor,projectShaderInventory:modules[7].projectShaderInventory};
  const overlay=await new Function(...Object.keys(dependencies),body+';return overlayFixture;')(...Object.values(dependencies))();
  const f=fixture(null);try{Object.assign(f.game,{avatars:new Map(),adaptive:{state:{}},gpu:{},renderErrorCount:0,assetLoadErrorCount:0,compilationProfile:{snapshot:()=>({active:true,metrics:{}})}});
    f.game.renderHealth.snapshot=()=>({phase:f.game.ready?'ready':'preparing',valid:f.game.ready,rendererId:1,generation:1,errorCount:0,pendingOperations:0});
    f.game.prepareLighting=async()=>{const value=await run(f);return{...value.result,qualities:[{quality:'medium',finalPass:true,status:'complete',elapsedMs:value.result.elapsedMs,activeElapsedMs:value.result.activeElapsedMs,pausedMs:0,failureStep:null,stageCount:19}],stages:value.result.stages.map(s=>({...s,passQuality:'medium'}))};};
    const result=await overlay.observeStartup(f.game,{dataset:{}},async()=>{await f.game.prepareLighting();f.game.ready=true;return 42;});overlay.events.push('UI-continuation');assert.equal(result,42);
    const raw=overlay.raw();assert.equal(raw.mode,'diagnostic');assert.equal(raw.startupRoutines,STARTUP_ROUTINE_TARGETS[0]);assert.equal(raw.startupStageRoutines.complete,true);assert.equal(raw.preparationStages.capturedCount,19);assert.equal(raw.startupStageRoutines.remainingRoutineHooks,0);assert.equal(overlay.intervals.size,0);
    assert.ok(overlay.events.indexOf('terminal-raw')<overlay.events.indexOf('UI-continuation'));assert.ok(raw.samples.every(s=>!Object.hasOwn(s,'startupStageRoutines')));
    for(let i=0;i<100&&overlay.requests.length===0;i++)await new Promise(setImmediate);assert.equal(overlay.requests.length,1);
  }finally{f.dispose();}
});
