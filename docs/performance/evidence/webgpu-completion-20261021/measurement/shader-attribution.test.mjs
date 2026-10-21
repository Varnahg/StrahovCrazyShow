/** No browser/device/network. Actual current TS profiler, controlled GPU IO. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '@babylonjs/core/Misc/observable';
import { WebGpuCompilationProfile } from '../../../../../client/webgpu-compilation-profile.ts';
import { observeShaderAttribution, projectShaderInventory, ATTRIBUTION_LIMITS } from './shader-attribution.mjs';
import { parseBuildOptions, browserBuildIdentity, buildDigest } from './common.mjs';
const pending=()=>Promise.withResolvers();
const flush=()=>new Promise(setImmediate);
function fixture() {
  let infoCalls=0, time=10;
  const operations=[], seen=[];
  class Device {
    queue={submit(){}};
    createShaderModule(descriptor) {
      const job=pending(); operations.push(job);
      const module={getCompilationInfo(){infoCalls++;seen.push(this);return job.promise;}};
      return module;
    }
    createRenderPipeline(){return {};}
    createRenderPipelineAsync(){return Promise.resolve({});}
  }
  const device=new Device(), engine={isWebGPU:true,_isWebGPU:true,_isDisposed:false,_device:device,_compiledEffects:{},
    onDisposeObservable:new Observable(),onContextRestoredObservable:new Observable(),countersLastFrame:{}};
  const profile=new WebGpuCompilationProfile(engine,{now:()=>++time});
  const game={engine,compilationProfile:profile,disposed:false,scene:{meshes:[]}};
  return {game,engine,device,profile,operations,seen,counts:()=>({infoCalls}),now:()=>++time,
    dispose(){profile.dispose();}};
}
function world(f,vertex,fragment) {
  const context={stages:{vertexStage:{module:vertex},fragmentStage:{module:fragment}}};
  const effect={_pipelineContext:context,_isDisposed:false}; f.engine._compiledEffects={current:effect};
  const wrapper={effect,_wasPreviouslyUsingInstances:true};
  const batch={visibleInstances:[null],hardwareInstancedRendering:[false]};
  const mesh={name:'b6 stair source',_nodeDataStorage:{_isVisible:true,_isEnabled:true,_isParentEnabled:true},
    instances:[{_nodeDataStorage:{_isVisible:false}}],_thinInstanceDataStorage:{instancesCount:0},
    _internalAbstractMeshDataInfo:{_material:{name:'b6 terrazzo'}},
    _instanceDataStorage:{useMonoDataStorageRenderPass:false,renderPasses:{7:{batchCache:batch}}},
    subMeshes:[{_id:0,_drawWrappers:Object.assign([],{7:wrapper})}]};
  // These getters would mutate/create state in Babylon. They must never run.
  Object.defineProperty(mesh,'isVisible',{get(){throw Error('visibility getter read');}});
  Object.defineProperty(mesh.subMeshes[0],'effect',{get(){throw Error('effect getter read');}});
  mesh.isReady=()=>{throw Error('extra readiness');};mesh._getInstancesRenderList=()=>{throw Error('new batch');};
  f.game.scene.meshes=[mesh]; return {effect,context,mesh};
}
test('attribution default-off never reads a Game/engine/profile or installs hooks',()=>{
  const inaccessible=new Proxy({},{get(){throw Error('default touched Game');},getOwnPropertyDescriptor(){throw Error('default touched descriptor');}});
  assert.equal(observeShaderAttribution(inaccessible),undefined);
  assert.equal(observeShaderAttribution(inaccessible,{enabled:false}),undefined);
});
test('actual profiler keeps original module/getInfo count and validated observe Promise identity with job/role/stage mapping',async()=>{
  const f=fixture();let originalObserved;
  const native=f.profile.observe;
  f.profile.observe=function(...args){originalObserved=args[0];return Reflect.apply(native,this,args);};
  const originalInspect=f.profile.inspectShader,originalObserve=f.profile.observe,originalStage=f.profile.setStage;
  const observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  try {
    f.profile.setStage('submitted-frame');
    const vertex=f.device.createShaderModule({label:'vertex',code:'not exported'}),fragment=f.device.createShaderModule({label:'fragment',code:'not exported'});
    assert.equal(f.counts().infoCalls,2);assert.deepEqual(f.seen,[vertex,fragment]);
    assert.equal(originalObserved instanceof Promise,true);
    const model=world(f,vertex,fragment);
    f.operations[0].resolve({messages:[]});f.operations[1].resolve({messages:[]});await flush();
    observer.dispose();const snapshot=observer.snapshot();
    assert.equal(snapshot.evidenceValid,true);assert.equal(snapshot.active,false);
    assert.deepEqual(snapshot.jobs.map(row=>[row[1],row[2],snapshot.stages[row[3]],row[7]]),[[1,1,'submitted-frame',1],[2,2,'submitted-frame',1]]);
    assert.deepEqual(snapshot.mapping.effects,[[1,1,1,2,0]]);
    assert.equal(snapshot.mapping.meshes[0].regularInstances,1);assert.equal(snapshot.mapping.meshes[0].localHiddenInstances,1);
    assert.equal(snapshot.mapping.links[0].cachedVisibleBatchCount,null);assert.equal(snapshot.mapping.links[0].previouslyUsingInstances,1);
    assert.equal(snapshot.mapping.links[0].cachedHardwareInstancing,0);assert.equal(snapshot.mapping.links[0].passID,7);
    assert.equal(snapshot.mapping.links[0].materialName,'b6 terrazzo');
    assert.equal(f.profile.inspectShader,originalInspect);assert.equal(f.profile.observe,originalObserve);assert.equal(f.profile.setStage,originalStage);
    assert.equal(f.counts().infoCalls,2);assert.equal(model.mesh.subMeshes[0]._drawWrappers.length,8);
    const text=JSON.stringify(snapshot);assert.doesNotMatch(text,/not exported|"(_pipelineContext|getCompilationInfo|defines|sourceShaders)":/);
  }finally{observer.dispose();f.dispose();}
});
test('observe wrapper preserves its original return, receiver, arguments and synchronous falsy throw',async()=>{
  const f=fixture(),observed=[],returnValue={sameReturn:true};
  f.profile.observe=function(...args){observed.push({receiver:this,args});if(args[5]==='throw')throw 0;return returnValue;};
  const observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  try {
    const promise=Promise.resolve({messages:[]}),metric={};
    assert.equal(f.profile.observe(promise,'shaderValidation',metric,1,20,'vertex'),returnValue);
    assert.equal(observed[0].receiver,f.profile);assert.equal(observed[0].args[0],promise);assert.equal(observed[0].args[2],metric);
    assert.throws(()=>f.profile.observe(promise,'shaderValidation',metric,1,20,'throw'),value=>value===0);
    const other={};assert.equal(f.profile.observe.call(other,promise,'shaderPreparation',metric,1,20,'other'),returnValue);
    assert.equal(observed.at(-1).receiver,other);
    await flush();observer.dispose();const snapshot=observer.snapshot();assert.equal(snapshot.jobs[1][7],3);assert.ok(snapshot.issues.unmatchedJobs>0);
  }finally{observer.dispose();f.dispose();}
});
test('actual validated shader rejection is recorded without an extra query or replacing the original operation',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  try {
    f.device.createShaderModule({label:'fragment'});f.operations[0].reject(new Error('original compilation info failed'));
    await flush();observer.dispose();assert.equal(observer.snapshot().jobs[0][7],2);assert.equal(f.counts().infoCalls,1);
    assert.equal(f.profile.snapshot().metrics.shaderValidation.failures,1);
  }finally{observer.dispose();f.dispose();}
});
test('pending evidence seals once; abort/dispose/rejoin and late old reactions cannot mutate a new owner',async()=>{
  const f=fixture(),abort=new AbortController();const first=observeShaderAttribution(f.game,{enabled:true,signal:abort.signal,now:f.now});
  try {
    const vertex=f.device.createShaderModule({label:'vertex'});world(f,vertex,vertex);abort.abort();const sealed=first.snapshot();
    assert.equal(sealed.jobs[0][7],0);
    const second=observeShaderAttribution(f.game,{enabled:true,now:f.now});
    f.operations[0].resolve({messages:[]});await flush();assert.deepEqual(first.snapshot(),sealed);assert.equal(second.snapshot().jobs.length,0);
    f.device.createShaderModule({label:'fragment'});f.operations[1].resolve({messages:[]});await flush();second.dispose();assert.equal(second.snapshot().jobs[0][7],1);
  }finally{first.dispose();f.dispose();}
});
test('bounded overflow retains original calls and produces scalar JSON with explicit invalidity',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now,limits:{jobs:2,modules:2,links:1,meshes:1}});
  try {
    const list=[];for(let i=0;i<4;i++)list.push(f.device.createShaderModule({label:'vertex'}));world(f,list[0],list[1]);
    for(const operation of f.operations)operation.resolve({messages:[]});await flush();observer.dispose();
    const snapshot=observer.snapshot();assert.equal(f.counts().infoCalls,4);assert.equal(snapshot.jobs.length,2);assert.equal(snapshot.modules.length,2);
    assert.ok(snapshot.issues.overflow>0);assert.equal(snapshot.evidenceValid,false);assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<10000);
    assert.equal(snapshot.mapping.links.length,1);
  }finally{observer.dispose();f.dispose();}
});
test('unknown private contract/role/stage and generation drift are explicit; inherited and foreign methods restore safely',async()=>{
  const invalid=observeShaderAttribution({engine:{_isWebGPU:true},compilationProfile:{}},{enabled:true});assert.equal(invalid.snapshot().evidenceValid,false);
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  const installed=f.profile.inspectShader;
  try {
    f.profile.setStage('private arbitrary stage');f.device.createShaderModule({label:'private arbitrary role'});
    f.profile.inspectShader=function(...args){return Reflect.apply(installed,this,args);};
    const foreign=f.profile.inspectShader;f.profile.setStage('assets');assert.equal(observer.snapshot().active,false);assert.equal(f.profile.inspectShader,foreign);
    assert.ok(observer.snapshot().issues.restoreConflicts>0);assert.ok(observer.snapshot().issues.unknownRole>0);
    const fresh=observeShaderAttribution(f.game,{enabled:true,now:f.now});f.operations[0].resolve({messages:[]});await flush();fresh.dispose();
    assert.equal(f.profile.inspectShader,foreign);
  }finally{observer.dispose();f.dispose();}
  const g=fixture(),stale=observeShaderAttribution(g.game,{enabled:true,now:g.now});
  g.device.createShaderModule({label:'vertex'});g.profile.generation++;g.operations[0].resolve({messages:[]});await flush();
  assert.equal(stale.snapshot().active,false);assert.ok(stale.snapshot().issues.ownerChanged>0);g.dispose();
});
test('terminal redacts avatar/user names, does not invoke getters and bounds all existing inventory metadata',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  try {
    const vertex=f.device.createShaderModule({label:'vertex'});const model=world(f,vertex,vertex);model.mesh.name='avatar private-profile';
    f.operations[0].resolve({messages:[]});await flush();observer.dispose();assert.equal(observer.snapshot().mapping.meshes[0].name,null);
    const original={enabled:true,calls:9,limits:{maxRows:16},stages:[{name:'submitted-frame',calls:9}],
      rawDuplicates:[{id:1,fingerprint:'aabbccdd',calls:9,stages:[9],text:'secret shader',defines:'secret defines'}],
      bodyDuplicates:[],unusedDefines:{names:[{name:'PRIVATE_DEFINE'}]},sourceShaders:'not exported'};
    const projected=projectShaderInventory(original);assert.equal(projected.rawDuplicates[0].calls,9);assert.equal(projected.stages[0].name,'submitted-frame');
    assert.doesNotMatch(JSON.stringify(projected),/secret|PRIVATE_DEFINE|sourceShaders|unusedDefines/);
    assert.equal(projectShaderInventory(null),null);assert.equal(projectShaderInventory({enabled:false}),null);
  }finally{observer.dispose();f.dispose();}
});
test('new diagnostic flag is default-off, duplicate-safe and part of the canonical browser seal',()=>{
  assert.equal(parseBuildOptions([]).shaderAttribution,false);assert.equal(parseBuildOptions(['--shader-attribution']).shaderAttribution,true);
  assert.throws(()=>parseBuildOptions(['--shader-attribution','--shader-attribution']));
  const input={sourceSnapshotId:'source',helperSha256:'helper',label:'label',loading:'original',transforms:{},clock:null,weather:null,startupLatency:false,shaderAttribution:false,dependencies:{}};
  assert.notEqual(buildDigest(input),buildDigest({...input,shaderAttribution:true}));
  assert.equal(browserBuildIdentity({...input,shaderAttribution:true}).shaderAttribution,true);
  const missing={...input};delete missing.shaderAttribution;assert.throws(()=>buildDigest(missing));
});

test('maximum job cap and terminal map have a concrete scalar byte budget below one MiB',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  try {
    let vertex;
    for(let i=0;i<=ATTRIBUTION_LIMITS.jobs;i++) { const module=f.device.createShaderModule({label:'vertex'});if(i===0)vertex=module; }
    const base=world(f,vertex,vertex).mesh;
    f.game.scene.meshes=Array.from({length:ATTRIBUTION_LIMITS.meshes},()=>({...base,name:'b6 '+ 'a'.repeat(88),
      _internalAbstractMeshDataInfo:{_material:{name:'b6 '+ 'b'.repeat(88)}},subMeshes:[...base.subMeshes,...base.subMeshes]}));
    for(const operation of f.operations)operation.resolve({messages:[]});await flush();observer.dispose();
    const snapshot=observer.snapshot();assert.equal(snapshot.jobs.length,ATTRIBUTION_LIMITS.jobs);
    assert.equal(snapshot.mapping.meshes.length,ATTRIBUTION_LIMITS.meshes);assert.equal(snapshot.mapping.links.length,ATTRIBUTION_LIMITS.links);
    assert.equal(f.counts().infoCalls,ATTRIBUTION_LIMITS.jobs+1);assert.equal(snapshot.evidenceValid,false);
    assert.ok(Buffer.byteLength(JSON.stringify(snapshot))<1024*1024,'bounded attribution trace leaves receipt2MiB headroom');
  }finally{observer.dispose();f.dispose();}
});
test('inspect synchronous throw and unsupported observe promise preserve original behavior without invoking foreign then',()=>{
  const f=fixture(),failure=new Error('original inspect throw');
  f.profile.inspectShader=function(){assert.equal(this,f.profile);throw failure;};
  f.profile.observe=function(operation){return operation;};
  const observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  try {
    assert.throws(()=>f.profile.inspectShader({},'vertex'),error=>error===failure);
    let thenCalls=0;const operation={then(){thenCalls++;}};
    assert.equal(f.profile.observe(operation,'shaderValidation',f.profile.metrics.shaderValidation,1,10,'vertex'),operation);
    assert.equal(thenCalls,0);observer.dispose();assert.equal(observer.snapshot().issues.unsupportedPromise,1);
  }finally{observer.dispose();f.dispose();}
});
test('single bounded terminal scan retains late pending modules before completed submitted-frame and history within all output caps',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});
  try {
    f.profile.setStage('current-on'); const old=f.device.createShaderModule({label:'vertex'});
    f.operations[0].resolve({messages:[]}); await flush();
    f.profile.setStage('submitted-frame'); const completed=f.device.createShaderModule({label:'fragment'});
    f.operations[1].resolve({messages:[]}); await flush();
    const waiting=f.device.createShaderModule({label:'vertex'});
    const base=world(f,old,old).mesh,cache={},list=[];
    for(let index=0;index<3355;index++) {
      const module=index===3354?waiting:index<1200?old:completed;
      const effect={_pipelineContext:{stages:{vertexStage:{module},fragmentStage:{module}}},_isDisposed:false};
      cache[index]=effect;
      list.push({...base,name:index===3354?'vehicle pending':index<1200?'ground history':'car submitted',
        subMeshes:[{_id:0,_drawWrappers:Object.assign([],{7:{effect,_wasPreviouslyUsingInstances:true}})}]});
    }
    let meshSlotReads=0;
    f.game.scene.meshes=new Proxy(list,{getOwnPropertyDescriptor(target,key){
      if(/^\d+$/.test(String(key))) meshSlotReads++; return Reflect.getOwnPropertyDescriptor(target,key);
    }});
    f.engine._compiledEffects=cache; observer.dispose(); const snapshot=observer.snapshot(),mapping=snapshot.mapping;
    assert.equal(snapshot.jobs[2][7],0);assert.equal(snapshot.jobs[1][7],1);
    assert.equal(mapping.meshes[0].name,'vehicle pending');assert.equal(mapping.meshes[1].name,'car submitted');
    assert.equal(mapping.effects[0][2],snapshot.jobs[2][1]);
    assert.ok(mapping.meshes.every(mesh=>mesh.name!=='ground history'));
    assert.equal(mapping.meshes.length,ATTRIBUTION_LIMITS.meshes);
    assert.ok(mapping.links.length<=ATTRIBUTION_LIMITS.links);assert.equal(mapping.effects.length,ATTRIBUTION_LIMITS.effects);
    assert.equal(mapping.meshesScanned,3355);assert.equal(meshSlotReads,3355);
    assert.equal(mapping.cacheEntries,3355);assert.equal(mapping.boundedScanComplete,false);assert.ok(snapshot.issues.overflow>0);
    assert.equal(f.counts().infoCalls,3);
  }finally{observer.dispose();f.dispose();}
});
