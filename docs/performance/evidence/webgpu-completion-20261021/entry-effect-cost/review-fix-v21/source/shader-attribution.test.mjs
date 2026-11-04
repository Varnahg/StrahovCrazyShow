/** No browser/device/network. Actual current TS profiler, controlled GPU IO. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Observable } from '@babylonjs/core/Misc/observable';
import { ShadowDepthWrapper } from '@babylonjs/core/Materials/shadowDepthWrapper';
import { MultiMaterial } from '@babylonjs/core/Materials/multiMaterial';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
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
    assert.equal(snapshot.jobTraceComplete,true);assert.equal(snapshot.evidenceValid,false);assert.equal(snapshot.active,false);
    assert.equal(snapshot.lifetime.coverage.unlinkedFinalModules,2,'direct device fixture has no original Effect owner scope');
    assert.deepEqual(snapshot.jobs.map(row=>[row[1],row[2],snapshot.stages[row[3]],row[7]]),[[1,1,'submitted-frame',1],[2,2,'submitted-frame',1]]);
    assert.deepEqual(snapshot.mapping.effects,[[1,1,1,2,0,-1]]);
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
    assert.equal(snapshot.jobTraceComplete,false);assert.ok(snapshot.issues.traceOverflow>0);
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
  const input={sourceSnapshotId:'source',helperSha256:'helper',label:'label',loading:'original',transforms:{},clock:null,weather:null,startupLatency:false,shaderAttribution:false,routineCost:false,bufferLifecycle:false,lifecycleControls:false,dependencies:{}};
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

/** Actual installed constructor, effect-created ownership, MapMap/_makeEffect,
 * DrawWrapper construction/replacement/alias and disposal. Only engine IO is fake. */
async function pinnedShadow(f) {
  let creations=0,contexts=0;
  f.engine.currentRenderPassId=0;
  f.engine.createDrawContext=()=>{contexts++;return{reset(){},dispose(){}};};
  f.engine.createMaterialContext=()=>({});
  f.game.scene.getEngine=()=>f.engine;
  const makeEffect=()=>{
    creations++;
    const vertex=f.device.createShaderModule({label:'vertex'}),fragment=f.device.createShaderModule({label:'fragment'});
    const effect={_pipelineContext:{stages:{vertexStage:{module:vertex},fragmentStage:{module:fragment}}},_isReady:true,_isDisposed:false,isDisposed:false,
      isReady:()=>true,dispose(){this._isDisposed=this.isDisposed=true;},shaderLanguage:1,defines:'',
      vertexSourceCodeBeforeMigration:'@vertex fn main() {}',fragmentSourceCodeBeforeMigration:'@fragment fn main() {}',
      getUniformNames:()=>[],getAttributesNames:()=>[],getUniformBuffersNames:()=>[],getSamplers:()=>[],getIndexParameters:()=>({})};
    f.engine._compiledEffects[creations]=effect;return effect;
  };
  f.engine.createEffect=makeEffect;
  const base=makeEffect();for(const operation of f.operations)operation.resolve({messages:[]});await flush();
  const material={name:'car shadow material',onEffectCreatedObservable:new Observable()};
  const mesh=world(f,base._pipelineContext.stages.vertexStage.module,base._pipelineContext.stages.fragmentStage.module).mesh;
  mesh.name='vehicle caster';mesh.onDisposeObservable=new Observable();mesh._internalAbstractMeshDataInfo._material=material;
  const sub=mesh.subMeshes[0];sub.getMesh=()=>mesh;sub._getDrawWrapper=()=>({defines:null});sub._drawWrappers=[];
  const shadow=new ShadowDepthWrapper(material,f.game.scene,{doNotInjectCode:true});material.shadowDepthWrapper=shadow;
  material.onEffectCreatedObservable.notifyObservers({effect:base,subMesh:sub});
  const generator={};f.profile.setStage('submitted-frame');
  const depth=shadow._makeEffect(sub,[],generator,0);
  const alias=shadow.getEffect(sub,generator,7);
  return{shadow,material,mesh,sub,generator,base,depth,alias,makeEffect,counts:()=>({creations,contexts})};
}
function pinnedMultiMaterials(child){
  const engine=new NullEngine(),scene=new Scene(engine),main=new MultiMaterial('ground main',scene),pass=new MultiMaterial('car per pass',scene);
  pass.subMaterials=[child];
  assert.equal(Object.hasOwn(pass,'subMaterials'),false);assert.equal(Object.hasOwn(pass,'_subMaterials'),true);
  for(const material of [main,pass])Object.defineProperty(material,'subMaterials',{configurable:true,get(){throw Error('public MultiMaterial getter');}});
  return{main,pass,dispose(){for(const material of [main,pass]){delete material.subMaterials;material.subMaterials=[];}scene.dispose();engine.dispose();}};
}
test('actual pinned shadow ownership maps pending main/pass aliases beyond history without getEffect/readiness or new IO',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now,limits:{meshes:2,links:3}});
  let model,multi;
  try{
    model=await pinnedShadow(f);
    const entry=model.shadow._subMeshToDepthWrapper.mm.get(model.sub).get(model.generator);
    assert.equal(entry.mainDrawWrapper,entry.drawWrapper[0]);assert.notEqual(entry.mainDrawWrapper,entry.drawWrapper[7]);
    assert.equal(entry.mainDrawWrapper.effect,model.depth);assert.equal(model.alias.effect,model.depth);
    assert.equal(model.shadow._subMeshToEffect.get(model.sub)[0],model.base);
    multi=pinnedMultiMaterials(model.material);
    model.mesh._internalAbstractMeshDataInfo._material=multi.main;
    model.mesh._internalAbstractMeshDataInfo._materialForRenderPass=Object.assign([],{7:multi.pass});
    model.sub.materialIndex=0;
    const baseWrapper={effect:model.base,_wasPreviouslyUsingInstances:true};
    const history=Array.from({length:512},()=>({...model.mesh,name:'ground history',
      _internalAbstractMeshDataInfo:{_material:{name:'ground history'}},subMeshes:[{_id:0,_drawWrappers:Object.assign([],{0:baseWrapper})}]}));
    f.game.scene.meshes=[...history,model.mesh];
    // Own overrides must never be used: only native Map reads/data slots are allowed.
    model.shadow._subMeshToEffect.get=()=>{throw Error('map override');};
    model.shadow._subMeshToDepthWrapper.mm.get=()=>{throw Error('map override');};
    model.shadow.getEffect=model.shadow.isReadyForSubMesh=model.shadow._makeEffect=()=>{throw Error('mutating shadow API');};
    model.sub.getMesh=model.sub._getDrawWrapper=model.mesh.isReady=()=>{throw Error('mutating mesh API');};
    model.depth.isReady=()=>{throw Error('readiness API');};
    const before=model.counts(),queries=f.counts().infoCalls;observer.dispose();const snapshot=observer.snapshot(),mapping=snapshot.mapping;
    assert.deepEqual(model.counts(),before);assert.equal(f.counts().infoCalls,queries);
    assert.equal(snapshot.jobTraceComplete,true);assert.equal(snapshot.evidenceValid,false);assert.ok(snapshot.issues.mappingOverflow>0);assert.equal(snapshot.issues.traceOverflow,0);
    assert.equal(mapping.meshes[0].name,'vehicle caster');assert.equal(mapping.meshesScanned,513);
    const shadowLinks=mapping.links.filter(link=>link.shadowWrapperID);
    assert.deepEqual(shadowLinks.map(link=>link.sourceKind),['shadow-main','shadow-pass-alias']);
    assert.deepEqual(shadowLinks.map(link=>link.aliasPassIDs),[[0],[7]]);
    assert.equal(shadowLinks[0].generatorID,shadowLinks[1].generatorID);assert.equal(shadowLinks[0].effectID,shadowLinks[1].effectID);
    assert.equal(shadowLinks[0].shadowOwnerMatches,1);assert.equal(mapping.effects[0][5],1,'pending validation may already have ready Effect data flag');
    assert.deepEqual(mapping.pendingModuleCoverage,{observed:2,linked:2,unlinked:0});assert.equal(mapping.links.length,3);
    assert.equal(mapping.legacySubMaterialSlots,0);assert.equal(mapping.unknownSlots,0);
    assert.doesNotMatch(JSON.stringify(snapshot),/vertexSourceCodeBeforeMigration|depthDefines|"token"|@vertex/);
  }finally{
    // Restore test-only poison before actual class disposal.
    if(model){delete model.shadow._subMeshToDepthWrapper.mm.get;delete model.shadow._subMeshToEffect.get;model.shadow.dispose();}
    multi?.dispose();observer.dispose();f.dispose();
  }
});
test('actual effect-created map exposes new hot-swap base before submesh adoption and native disposal removes shadow ownership',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});let model;
  try{
    model=await pinnedShadow(f);
    const next=model.makeEffect();
    model.material.onEffectCreatedObservable.notifyObservers({effect:next,subMesh:model.sub});
    assert.equal(model.shadow._subMeshToEffect.get(model.sub)[0],next);
    assert.equal(model.shadow._subMeshToDepthWrapper.mm.size,0);assert.equal(model.depth.isDisposed,true);
    assert.equal(model.sub._drawWrappers.length,0);
    observer.dispose();const snapshot=observer.snapshot(),links=snapshot.mapping.links;
    assert.equal(snapshot.jobTraceComplete,true);assert.equal(links[0].sourceKind,'shadow-original-base');
    assert.equal(links[0].generatorID,0);assert.equal(links[0].passID,0);
    assert.equal(snapshot.mapping.effects[links[0].effectID-1][2],snapshot.jobs[4][1]);
    const sealed=observer.snapshot();model.shadow.dispose();assert.equal(model.shadow._subMeshToEffect.size,0);
    for(const operation of f.operations)operation.resolve({messages:[]});await flush();assert.deepEqual(observer.snapshot(),sealed);
    const rejoin=observeShaderAttribution(f.game,{enabled:true,now:f.now});rejoin.dispose();
    assert.equal(rejoin.snapshot().mapping.links.length,0);
  }finally{model?.shadow.dispose();observer.dispose();f.dispose();}
});
test('native shadow map drift and existing scan caps stay explicit while valid original job trace remains separate',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now,limits:{meshScan:1}});let model;
  try{
    model=await pinnedShadow(f);
    model.shadow._subMeshToDepthWrapper.set(model.sub,{},model.shadow._subMeshToDepthWrapper.get(model.sub,model.generator));
    observer.dispose();const snapshot=observer.snapshot();
    assert.equal(snapshot.mapping.shadowEntriesScanned,1);assert.ok(snapshot.issues.mappingOverflow>0);
    assert.equal(snapshot.jobTraceComplete,true);assert.equal(snapshot.mapping.boundedScanComplete,false);
    const fresh=observeShaderAttribution(f.game,{enabled:true,now:f.now});
    let foreignCalls=0;model.shadow._subMeshToEffect={get(){foreignCalls++;throw Error('foreign map');}};
    fresh.dispose();const drift=fresh.snapshot();assert.equal(foreignCalls,0);assert.ok(drift.mapping.unknownSlots>0);
    assert.equal(drift.jobTraceComplete,true);assert.equal(drift.mapping.boundedScanComplete,false);
    model.shadow._subMeshToEffect=new Map();
    const partial=observeShaderAttribution(f.game,{enabled:true,now:f.now});
    f.device.createShaderModule({label:'vertex'});
    f.game.scene.meshes=new Proxy([model.mesh],{getOwnPropertyDescriptor(){throw Error('mapping-only slot failure');}});
    partial.dispose();const failedMap=partial.snapshot();
    assert.equal(failedMap.issues.mappingErrors,1);assert.equal(failedMap.mapping,null);
    assert.equal(failedMap.jobTraceComplete,true);assert.equal(failedMap.evidenceValid,false);assert.equal(failedMap.jobs.length,1);
  }finally{model?.shadow.dispose();observer.dispose();f.dispose();}
});
test('actual MultiMaterial missing backing data stays explicitly unknown without public getter calls or false ownership',async()=>{
  const f=fixture(),observer=observeShaderAttribution(f.game,{enabled:true,now:f.now});let model,multi;
  try{
    model=await pinnedShadow(f);multi=pinnedMultiMaterials(model.material);
    model.mesh._internalAbstractMeshDataInfo._material=multi.pass;model.sub.materialIndex=0;
    delete multi.pass._subMaterials;
    observer.dispose();const snapshot=observer.snapshot();
    assert.equal(snapshot.jobTraceComplete,true);assert.equal(snapshot.evidenceValid,false);
    assert.ok(snapshot.mapping.unknownSlots>0);assert.equal(snapshot.mapping.shadowSubMeshLookups,0);
    assert.deepEqual(snapshot.mapping.pendingModuleCoverage,{observed:2,linked:0,unlinked:2});
  }finally{model?.shadow.dispose();multi?.dispose();observer.dispose();f.dispose();}
});
