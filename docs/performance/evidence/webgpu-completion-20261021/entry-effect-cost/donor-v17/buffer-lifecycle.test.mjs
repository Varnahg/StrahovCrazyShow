import test from 'node:test';
import assert from 'node:assert/strict';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';
import { Scene } from '@babylonjs/core/scene.js';
import { Mesh } from '@babylonjs/core/Meshes/mesh.js';
import { SubMesh } from '@babylonjs/core/Meshes/subMesh.js';
import { Matrix } from '@babylonjs/core/Maths/math.vector.js';
import { Observable } from '@babylonjs/core/Misc/observable.js';
import { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import { WebGPUBufferManager } from '@babylonjs/core/Engines/WebGPU/webgpuBufferManager.js';
import { WebGPUDrawContext } from '@babylonjs/core/Engines/WebGPU/webgpuDrawContext.js';
import { WebGPUMaterialContext } from '@babylonjs/core/Engines/WebGPU/webgpuMaterialContext.js';
import { WebGPUBundleList } from '@babylonjs/core/Engines/WebGPU/webgpuBundleList.js';
import { WebGPUCacheRenderPipeline } from '@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipeline.js';
import '@babylonjs/core/Meshes/instancedMesh.js';
import { observeBufferLifecycle } from './buffer-lifecycle.mjs';
import { BUFFER_LIMITS,BUFFER_EVENTS,bufferFailureTarget,validateBufferTrace } from './buffer-lifecycle-core.mjs';
import { parseBuildOptions,buildDigest,browserBuildIdentity,sha256 } from './common.mjs';
import { validateReceipt } from './receipt.mjs';
import { verifyBuildSeal } from './harness.mjs';
import { resolveBuildOverlay } from './common.mjs';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { RenderHealth } from '../../../../../client/render-health.ts';
const actualGameSource=readFileSync(new URL('../../../../../client/game.ts',import.meta.url),'utf8');
const actualGameAST=ts.createSourceFile('game.ts',actualGameSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
let healthCallback;const findHealth=node=>{if(ts.isNewExpression(node)&&node.expression.getText(actualGameAST)==='RenderHealth')healthCallback=node.arguments?.[2];ts.forEachChild(node,findHealth);};findHealth(actualGameAST);assert.ok(healthCallback&&ts.isArrowFunction(healthCallback));
const createActualHealthCallback=new Function('sessionDiagnostics','return '+ts.transpileModule('('+healthCallback.getText(actualGameAST)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText);
function fixture(options={}){
  const engine=new NullEngine(),scene=new Scene(engine),buffers=[],calls={create:0,destroy:0,write:0,submit:0};
  engine._isWebGPU=true;engine.uniqueId=1;Object.defineProperty(engine,'compatibilityMode',{value:false,configurable:true});Object.defineProperty(engine,'isWebGPU',{value:true,configurable:true});engine.currentRenderPassId=7;
  const device={createBuffer(descriptor){calls.create++;if(Object.hasOwn(options,'createThrows'))throw options.createThrows;const value={...descriptor,destroyed:false,destroy(){assert.equal(this,value);calls.destroy++;this.destroyed=true;if(Object.hasOwn(options,'destroyThrows'))throw options.destroyThrows;return options.destroyReturn;}};if(options.hardenDestroy)Object.defineProperty(value,'destroy',{writable:false,configurable:false});buffers.push(value);return value;},queue:{writeBuffer(){calls.write++;},submit(){calls.submit++;}}};
  const manager=new WebGPUBufferManager(engine,device);engine._device=device;engine._bufferManager=manager;
  for(const name of ['createVertexBuffer','createDynamicVertexBuffer','_releaseBuffer','bindBuffers'])engine[name]=WebGPUEngine.prototype[name];
  const context=new WebGPUDrawContext(manager),material=new WebGPUMaterialContext(),bundle={};context.fastBundle=bundle;
  engine._currentDrawContext=context;engine._currentMaterialContext=material;
  const cache=Object.create(WebGPUCacheRenderPipeline.prototype);cache.vertexBuffers=[];cache.indexBuffer=null;engine._cacheRenderPipeline=cache;
  engine._bundleList=new WebGPUBundleList(device);engine._snapshotRendering={play:false,record:false};
  engine._currentEffect={_pipelineContext:{shaderProcessingContext:{bufferNames:[]}}};engine._getCurrentRenderPass=()=>({});
  engine.applyStates=()=>{};engine._applyRenderPassChanges=()=>{};engine._reportDrawCall=()=>{};
  engine.bindUniformBufferBase=WebGPUEngine.prototype.bindUniformBufferBase;
  engine._ubDontInvertY=manager.createBuffer(8,72);context.setBuffer('Internals',engine._ubDontInvertY);context.resetIsDirty(material.updateId);material.isDirty=false;
  engine._counters={numBundleReuseNonCompatMode:0};
  const mesh=new Mesh('world matrix source',scene);mesh.subMeshes=[];const sub=new SubMesh(0,0,0,0,0,mesh,undefined,false);
  const game={engine,scene,disposed:false,renderHealth:{generation:1},handleRendererFailure(message){assert.equal(this,game);this.originalFailure=message;this.cleanupObserved=true;if(Object.hasOwn(options,'fatalThrows'))throw options.fatalThrows;return options.fatalReturn;},dispose(){this.originalDisposed=true;this.disposed=true;}};
  const traces=[],collector=observeBufferLifecycle(game,{enabled:true,limits:options.limits,now:()=>100+engine.frameId,signal:options.signal,onTerminal:trace=>{traces.push(trace);options.onTerminal?.(trace,game);}});
  const render=(count=0,previous=false)=>{
    scene.needsPreviousWorldMatrices=previous;
    const batch=mesh._getInstancesRenderList(sub._id);batch.renderSelf[sub._id]=true;
    batch.visibleInstances[sub._id]=Array.from({length:count},()=>({getWorldMatrix:()=>Matrix.Identity()}));
    mesh._renderWithInstances(sub,undefined,batch,undefined,engine);return batch.parent;
  };
  const fatalFor=db=>`[Buffer "BabylonWebGPUDevice${engine.uniqueId}_DataBufferUniqueId=${db.uniqueId}_CopyDst_Vertex_Storage_size${db.capacity}"] used in submit while destroyed.`;
  return{engine,scene,mesh,sub,manager,device,context,material,cache,bundle,game,collector,traces,render,buffers,calls,fatalFor,
    dispose(){collector.dispose();delete options.destroyThrows;delete options.createThrows;mesh.dispose();scene.dispose();context.dispose();manager.destroyDeferredBuffers();engine.dispose();}};
}
test('buffer diagnostic default-off does not read Game or resources',()=>{
  const unreachable=new Proxy({},{getOwnPropertyDescriptor(){throw Error('default touched');}});assert.equal(observeBufferLifecycle(unreachable),undefined);
});
test('actual native matrix current/previous roles are observed independently of2048 signature and generic owner stays unknown',()=>{
  const f=fixture();try{
    const storage=f.render(0,true),current=storage.instancesBuffer.getBuffer(),previous=storage.instancesPreviousBuffer.getBuffer();
    assert.equal(current.capacity,2048);assert.equal(previous.capacity,2048);
    const generic=f.manager.createBuffer(2048,168);f.game.handleRendererFailure(f.fatalFor(current));
    const trace=f.traces[0];validateBufferTrace(trace);
    assert.equal(trace.target.ownerObserved,true);assert.equal(trace.target.dataBufferID,current.uniqueId);
    assert.deepEqual(trace.resources.find(r=>r.dataBufferID===current.uniqueId).matrixRoles,[1]);
    assert.deepEqual(trace.resources.find(r=>r.dataBufferID===previous.uniqueId).matrixRoles,[2]);
    assert.deepEqual(trace.resources.find(r=>r.dataBufferID===generic.uniqueId).matrixRoles,[]);
    assert.ok(trace.owners.every(owner=>owner.passID===7&&owner.meshName==='world matrix source'));assert.equal(trace.coverage.encodedResourcesObserved,false);
    const matrixEvent=trace.events.find(row=>row[3]===BUFFER_EVENTS.matrixAfter);assert.equal(matrixEvent[14],0);assert.equal(matrixEvent[15],0);
    assert.equal(f.game.originalFailure,f.fatalFor(current));
  }finally{f.dispose();}
});
test('actual native resize/refcount/deferred destroy keeps same observed bundle identity without claiming its encoded resource',()=>{
  const f=fixture();try{
    let storage=f.render();const old=storage.instancesBuffer.getBuffer(),raw=old.underlyingResource;
    storage=f.render(40);const current=storage.instancesBuffer.getBuffer();assert.notEqual(current,old);assert.equal(current.capacity,4096);
    assert.equal(f.context.fastBundle,f.bundle);assert.equal(raw.destroyed,false);
    // Native reference release can leave shared VBO references; release them through the original manager.
    while(old.references>0)f.manager.releaseBuffer(old);
    assert.equal(raw.destroyed,false);const released=f.collector.snapshot().resources.find(r=>r.dataBufferID===old.uniqueId);
    assert.ok(released.releases>0);assert.equal(released.destroyCalls,0);
    f.manager.destroyDeferredBuffers();assert.equal(raw.destroyed,true);
    f.game.handleRendererFailure(f.fatalFor(old));const trace=f.traces[0],row=trace.resources.find(r=>r.dataBufferID===old.uniqueId);
    assert.equal(trace.target.actualDestroyCallObserved,true);assert.equal(row.destroyCalls,1);assert.equal(row.destroyReturned,1);
    assert.ok(trace.stats.sameBundleAcrossReplacement>0);assert.ok(trace.events.some(row=>row[3]===BUFFER_EVENTS.replacement&&row[10]>0&&row[13]===1));
    assert.equal(trace.coverage.encodedResourcesObserved,false);
  }finally{f.dispose();}
});
test('native NCM draw uses its original fast bundle path with newly supplied vertex-buffer identities',()=>{
  const f=fixture();try{
    f.render();f.render(40);const vbos=f.mesh._userInstancedBuffersStorage.renderPasses[7];
    f.engine.bindBuffers({},undefined,undefined,vbos);f.context.resetIsDirty(f.material.updateId);f.material.isDirty=false;
    assert.equal(f.engine.compatibilityMode,false);assert.equal(f.context.fastBundle,f.bundle);assert.equal(f.material.forceBindGroupCreation,false);assert.equal(f.engine._currentDrawContext,f.context);assert.equal(f.engine._currentMaterialContext,f.material);assert.equal(f.engine._currentRenderTarget,null);assert.equal(f.context.isDirty(f.material.updateId),false);assert.equal(f.context.buffers.Internals,f.engine._ubDontInvertY);assert.equal(f.context._vertexPullingEnabled,f.material.useVertexPulling);
    WebGPUEngine.prototype._draw.call(f.engine,0,0,0,3,41);
    assert.equal(f.context.fastBundle,f.bundle);assert.equal(f.engine._counters.numBundleReuseNonCompatMode,1);
    assert.equal(f.collector.snapshot().coverage.encodedResourcesObserved,false);
  }finally{f.dispose();}
});
test('generic matching target never acquires matrix ownership from signature',()=>{
  const f=fixture();try{const generic=f.manager.createBuffer(2048,168);f.game.handleRendererFailure(f.fatalFor(generic));
    assert.equal(f.traces[0].target.retained,true);assert.equal(f.traces[0].target.ownerObserved,false);assert.equal(f.traces[0].owners.length,0);
  }finally{f.dispose();}
});
test('fatal receipt seals before original cleanup without changing receiver/return or later original exception',()=>{
  const marker={},f=fixture({fatalReturn:marker,onTerminal:(_,game)=>assert.equal(game.cleanupObserved,undefined)});
  try{f.render();assert.equal(f.game.handleRendererFailure('original'),marker);assert.equal(f.traces.length,1);assert.equal(f.game.cleanupObserved,true);
    const sealed=f.collector.snapshot();f.game.handleRendererFailure('later');assert.deepEqual(f.collector.snapshot(),sealed);assert.equal(f.traces.length,1);
  }finally{f.dispose();}
});
test('actual destroy return/Promise and falsy original throw are forwarded exactly; release is not destroy',()=>{
  const original=Promise.resolve('original'),f=fixture({destroyReturn:original});
  try{const db=f.manager.createBuffer(2048,168);assert.equal(db.underlyingResource.destroy(),original);assert.equal(f.calls.destroy,1);assert.equal(f.collector.snapshot().resources[0].destroyReturned,1);
  }finally{f.dispose();}
  const g=fixture({destroyThrows:0});try{
    const db=g.manager.createBuffer(2048,168);const originalDestroy=db.underlyingResource.destroy;
    // A concrete original fake terminal failure propagates through native deferred sweep.
    g.buffers.at(-1).destroyed=false;g.manager.releaseBuffer(db);assert.throws(()=>g.manager.destroyDeferredBuffers(),error=>error===0);assert.equal(g.calls.destroy,1);
    assert.equal(typeof originalDestroy,'function');
  }finally{g.dispose();}
});
test('abort/dispose/rejoin and foreign wrapper restoration preserve immutable old trace',()=>{
  const abort=new AbortController(),f=fixture({signal:abort.signal});try{
    f.render();const original=f.manager.releaseBuffer,foreign=function(...args){return Reflect.apply(original,this,args);};f.manager.releaseBuffer=foreign;
    abort.abort();const sealed=f.collector.snapshot();assert.equal(sealed.reason,'aborted');assert.ok(sealed.issues.restoreConflicts>0);assert.equal(f.manager.releaseBuffer,foreign);
    const fresh=observeBufferLifecycle(f.game,{enabled:true});fresh.dispose();assert.equal(f.manager.releaseBuffer,foreign);assert.deepEqual(f.collector.snapshot(),sealed);
  }finally{f.dispose();}
});
test('foreign meshes/devices, unknown overrides, bounded windows and target gaps stay explicit',()=>{
  const f=fixture({limits:{resources:2,events:4,owners:1}});try{
    const otherScene=new Scene(f.engine),other=new Mesh('world foreign',otherScene);const old=other._updateInstancedBuffers;
    f.scene.onNewMeshAddedObservable.notifyObservers(other);assert.equal(other._updateInstancedBuffers,old);
    for(let i=0;i<5;i++){const db=f.manager.createBuffer(2048,168);f.manager.releaseBuffer(db);f.manager.destroyDeferredBuffers();}
    const trace=f.collector.snapshot();assert.equal(trace.resources.length,2);assert.ok(trace.history.resourceEvictions>0);assert.ok(trace.history.eventEvictions>0);
    assert.ok(Buffer.byteLength(JSON.stringify(trace))<16000);validateBufferTrace(trace);other.dispose();otherScene.dispose();
    f.engine._device={};f.collector.snapshot();f.render();assert.equal(f.collector.snapshot().reason,'device-changed');
  }finally{f.dispose();}
});
test('flag, canonical seal and distinct receipt reject absent/default/tampered identity and non-scalar traces',()=>{
  assert.equal(parseBuildOptions([]).bufferLifecycle,false);assert.equal(parseBuildOptions(['--buffer-lifecycle']).bufferLifecycle,true);assert.throws(()=>parseBuildOptions(['--buffer-lifecycle','--buffer-lifecycle']));
  const input={sourceSnapshotId:sha256('source'),helperSha256:sha256('helper'),label:'buffer',loading:'original',transforms:{},clock:null,weather:null,startupLatency:false,shaderAttribution:false,routineCost:false,bufferLifecycle:false,lifecycleControls:false,dependencies:{}};
  assert.notEqual(buildDigest(input),buildDigest({...input,bufferLifecycle:true}));const missing={...input};delete missing.bufferLifecycle;assert.throws(()=>buildDigest(missing));
  assert.throws(()=>buildDigest({...input,bufferLifecycle:1}));
  const template='export const identity=__WEBGPU_COMPLETION_IDENTITY__;',overlayBytes=Buffer.from(resolveBuildOverlay(template,input));
  const sealed={...browserBuildIdentity(input),transforms:{},snapshot:'/CPU-only',helperFiles:{},sourceFiles:0,observerSha256:'observer',overlaySha256:sha256(overlayBytes),dependencies:{}};
  const inputBytes=Buffer.from(JSON.stringify(sealed)),bundleJavaScript={'assets/test.js':Buffer.from(JSON.stringify(browserBuildIdentity(input)))},bundleFiles={'assets/test.js':sha256(bundleJavaScript['assets/test.js'])};
  const build={...sealed,buildInputSha256:sha256(inputBytes),bundleFiles},proof={inputBytes,overlayBytes,overlayTemplate:template,bundleFiles,bundleJavaScript};
  assert.doesNotThrow(()=>verifyBuildSeal(build,sealed,proof));const deleted={...build};delete deleted.bufferLifecycle;assert.throws(()=>verifyBuildSeal(deleted,sealed,proof));
  const tampered={...build,bufferLifecycle:true};tampered.buildId=buildDigest(tampered);assert.throws(()=>verifyBuildSeal(tampered,sealed,proof));
  const f=fixture();try{f.collector.dispose();const trace=f.collector.snapshot(),identity=browserBuildIdentity({...input,bufferLifecycle:true});
    const raw={schemaVersion:1,...identity,attemptId:'2cddece0-41cc-4003-90b9-be88e188744a',kind:'buffer-lifecycle',mode:'diagnostic',atMs:1,timeOrigin:0,observerErrors:[],bufferTrace:trace};
    assert.equal(validateReceipt(raw,identity),raw);assert.throws(()=>validateReceipt(raw,{...identity,bufferLifecycle:false}));assert.throws(()=>validateReceipt({...raw,bufferLifecycle:false},identity));
    assert.throws(()=>validateBufferTrace({...trace,resources:Array(BUFFER_LIMITS.resources+1).fill({})}));assert.throws(()=>validateBufferTrace({...trace,resource:f.engine}));
    assert.deepEqual(bufferFailureTarget('Buffer BabylonWebGPUDevice1_DataBufferUniqueId=37326_CopyDst_Vertex_Storage_size2048 used in submit'),{engineID:1,dataBufferID:37326,bytes:2048});
  }finally{f.dispose();}
});

test('native allocation and update throw unchanged, fatal observer cannot replace original falsy throw',()=>{
  const options={},f=fixture(options);try{
    options.createThrows=0;assert.throws(()=>f.render(),error=>error===0);
    assert.equal(f.collector.snapshot().stats.instanceThrows,1);assert.equal(f.collector.snapshot().issues.observerErrors,0);
    delete options.createThrows;f.render();options.fatalThrows=false;
    assert.throws(()=>f.game.handleRendererFailure('same original failure'),error=>error===false);
    assert.equal(f.traces.length,1);assert.equal(f.game.originalFailure,'same original failure');assert.equal(f.traces[0].reason,'renderer-failure');
  }finally{f.dispose();}
});

test('hardened raw destroy and native-method drift remain unknown without additional resource operations',()=>{
  const f=fixture({hardenDestroy:true});try{
    const db=f.manager.createBuffer(2048,168),row=f.collector.snapshot().resources[0];
    assert.equal(row.destroyHookAvailable,false);assert.ok(f.collector.snapshot().issues.unsupported>0);
    f.manager.releaseBuffer(db);f.manager.destroyDeferredBuffers();assert.equal(f.calls.destroy,1);assert.equal(f.collector.snapshot().resources[0].destroyCalls,0);
    const other=new Mesh('world override',f.scene);other._updateInstancedBuffers=()=>17;f.scene.onNewMeshAddedObservable.notifyObservers(other);
    // Register a pre-existing foreign method through a fresh owner, not a native lookalike.
    f.collector.dispose();const fresh=observeBufferLifecycle(f.game,{enabled:true});assert.ok(fresh.snapshot().stats.unknownMeshMethods>0);assert.equal(other._updateInstancedBuffers(),17);fresh.dispose();other.dispose();
  }finally{f.dispose();}
});

test('generation retirement restores old owner and never mutates a fresh rejoin or sealed receipt',()=>{
  const f=fixture();try{f.render();f.game.renderHealth.generation++;f.render();const sealed=f.collector.snapshot();assert.equal(sealed.reason,'owner-retired');
    const fresh=observeBufferLifecycle(f.game,{enabled:true});f.render();assert.ok(fresh.snapshot().stats.instanceCalls>0);f.collector.dispose();assert.equal(fresh.snapshot().active,true);assert.deepEqual(f.collector.snapshot(),sealed);fresh.dispose();
  }finally{f.dispose();}
});

test('owner window eviction is explicit for a retained matrix target even after it is observed again',()=>{
  const f=fixture({limits:{owners:1}});try{const storage=f.render(0,true),db=storage.instancesBuffer.getBuffer();f.render(0,true);f.game.handleRendererFailure(f.fatalFor(db));
    const trace=f.traces[0],row=trace.resources.find(value=>value.dataBufferID===db.uniqueId);assert.equal(trace.target.ownerObserved,true);assert.equal(trace.target.ownerRecordsRetained,false);assert.ok(row.ownerRecordsEvicted>0);assert.ok(trace.history.ownerEvictions>0);
  }finally{f.dispose();}
});

test('actual Game onFault and RenderHealth uncaptured-error chain retain numeric target before its friendly handler argument',()=>{
  const f=fixture(),events=[],nativeEvents=new EventTarget();let health,collector;try{
    f.collector.dispose();f.game.canvas={dataset:{}};f.game.renderErrorCount=0;
    // NullEngine has no native WebGPU query producer. This terminal-event
    // fixture supplies that original observable rather than accepting a
    // monitoring-unavailable setup fault before the error being tested.
    f.engine.onQueryReadErrorObservable=new Observable();
    Object.assign(f.device,{addEventListener:nativeEvents.addEventListener.bind(nativeEvents),removeEventListener:nativeEvents.removeEventListener.bind(nativeEvents),lost:new Promise(()=>{})});
    nativeEvents.addEventListener('uncapturederror',()=>events.push('existing-before'));
    const callback=createActualHealthCallback.call(f.game,{event(kind){assert.equal(kind,'render-fault');events.push('original-diagnostics');}});
    f.game.renderHealth=health=new RenderHealth(f.engine,'game',callback);
    assert.equal(health.snapshot().errorCount,0);assert.deepEqual(events,[]);
    f.game.handleRendererFailure=function(message){assert.equal(this,f.game);assert.equal(message,'Vykreslování se zastavilo. Opusť demo a spusť scénu znovu.');events.push('original-friendly-handler');this.originalFailure=message;};
    collector=observeBufferLifecycle(f.game,{enabled:true,onTerminal:trace=>{events.push('buffer-terminal');f.traces.push(trace);}});
    nativeEvents.addEventListener('uncapturederror',()=>events.push('existing-after'));
    const db=f.manager.createBuffer(2048,168),event=new Event('uncapturederror');Object.defineProperty(event,'error',{value:{message:f.fatalFor(db)}});nativeEvents.dispatchEvent(event);
    assert.deepEqual(events,['existing-before','original-diagnostics','buffer-terminal','original-friendly-handler','existing-after']);
    const trace=f.traces.at(-1);assert.equal(trace.targetSource,'render-health-first-errors');assert.equal(trace.target.dataBufferID,db.uniqueId);assert.equal(trace.target.retained,true);assert.equal(f.game.renderErrorCount,1);assert.equal(f.game.canvas.dataset.renderHealth,'invalid');
    assert.doesNotMatch(JSON.stringify(trace),/used in submit while destroyed|Opusť demo/);
  }finally{collector?.dispose();health?.dispose();f.dispose();}
});

test('firstErrors target discovery is bounded own-data only and rejects a different health generation',()=>{
  const f=fixture();try{
    const db=f.manager.createBuffer(2048,168),errors=[];Object.defineProperty(errors,'0',{get(){throw Error('foreign accessor must not run');},configurable:true});
    errors[1]={message:f.fatalFor(db),generation:999};f.game.renderHealth.firstErrors=errors;f.game.handleRendererFailure('original generic message');
    assert.equal(f.traces[0].target,null);assert.equal(f.traces[0].targetSource,'unavailable');assert.equal(f.traces[0].issues.observerErrors,0);assert.equal(f.game.originalFailure,'original generic message');
  }finally{f.dispose();}
});

test('maximal retained scalar windows fit the unchanged receipt byte cap and make old-target gaps explicit',t=>{
  const f=fixture();try{
    f.render(0,true);const trace=f.collector.snapshot(),resource=trace.resources[0],owner=trace.owners[0],event=trace.events[0];
    trace.resources=Array.from({length:BUFFER_LIMITS.resources},(_,id)=>({...resource,id:id+1,ownerIDs:Array(8).fill(999999),matrixRoles:[1,2],eventsEvicted:999999,lastSequence:999999999,lastSeenAtMs:999999999}));
    trace.owners=Array.from({length:BUFFER_LIMITS.owners},(_,id)=>({...owner,id:id+1,meshName:'world '+ 'x'.repeat(90),meshUniqueID:9999999,meshID:9999999,lastSubMeshID:9999999,lastResourceID:9999999}));
    trace.events=Array.from({length:BUFFER_LIMITS.events},()=>event.map((value,index)=>typeof value==='number'&&index<14?999999999:value));trace.active=false;
    const bytes=Buffer.byteLength(JSON.stringify(trace));t.diagnostic('maximal scalar trace bytes='+bytes);validateBufferTrace(trace);assert.ok(bytes<2*1024*1024-65536,'trace reserves64KiB envelope headroom under original2MiB receipt cap');
    const old=f.manager.createBuffer(2048,168);for(let i=0;i<BUFFER_LIMITS.resources;i++)f.manager.createBuffer(2048,168);
    f.game.handleRendererFailure(f.fatalFor(old));assert.equal(f.traces[0].target.retained,false);assert.equal(f.traces[0].target.retainedEventsComplete,false);assert.ok(f.traces[0].history.resourceEvictions>0);
  }finally{f.dispose();}
});
