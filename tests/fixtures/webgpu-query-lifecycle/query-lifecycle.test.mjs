import test from 'node:test';
import assert from 'node:assert/strict';
import {rig,flush,turn,WebGPUEngine,WebGPUDurationMeasure} from './fixture.mjs';
import {RenderHealth} from '../../../client/render-health.ts';
const methods=['readValues','readValue','readTwoValuesAndSubtract'];
for(const method of methods){
  test(`${method}: native success, copy semantics, pool reuse, valid zero`,async()=>{
    const r=rig({values:[0n,0n,40n,50n]}),q=r.query();
    const first=q[method](0);r.maps[0].map.resolve();const value=await first;
    if(method==='readValues'){
      assert.deepEqual([...value],[0n,0n,40n,50n]);new BigUint64Array(r.maps[0].range)[0]=999n;assert.equal(value[0],0n);
    }else assert.equal(value,0);
    const count=r.buffers.length,second=q[method](0);r.maps.at(-1).map.resolve();await second;
    assert.equal(r.buffers.length,count);assert.equal(r.maps[0].unmaps,2);
    q.dispose();q.dispose();assert.equal(r.queries[0].destroys,1);
    assert.equal(r.releases.length,2);assert.equal(new Set(r.releases).size,2);
  });
  for(const retire of ['dispose','engine-dispose','engine-id','engine-device','device-loss']){
    test(`${method}: ${retire} pending completion is null and never re-pools`,async()=>{
      const r=rig(),q=r.query(),operation=q[method]();
      if(retire==='dispose')q.dispose();else if(retire==='engine-dispose')r.engine._isDisposed=true;
      else if(retire==='engine-id')r.engine.uniqueId++;else if(retire==='engine-device')r.engine._device={};
      else {r.loss.resolve({reason:'destroyed',message:'test'});await flush();}
      r.maps[0].map.resolve();assert.equal(await operation,null);q.dispose();
      assert.equal(r.releases.filter(b=>b===r.maps[0]).length,1);assert.equal(r.maps[0].unmaps,1);
      const before=r.calls.length;assert.equal(await q[method](),null);assert.equal(r.calls.length,before);
    });
  }
  test(`${method}: active rejection preserves falsy identity through cleanup throw`,async()=>{
    for(const error of [0,false,undefined,new Error('original map')]){
      const r=rig(),q=r.query(),p=q[method]();r.fault({stage:'unmap',error:new Error('cleanup')});r.maps[0].map.reject(error);
      try{await p;assert.fail('must reject');}catch(actual){assert.equal(actual,error);}
      r.fault(undefined);q.dispose();assert.equal(r.releases.filter(b=>b===r.maps[0]).length,1);
    }
  });
}
for(const stage of ['encoder','resolve','copy','finish','submit','map','range','unmap']){
  test(`native synchronous ${stage} error retains identity and releases borrowed ownership`,async()=>{
    const error=new Error(stage),r=rig(),q=r.query();r.fault({stage,error});const p=q.readValue();
    if(stage==='range'||stage==='unmap')r.maps[0].map.resolve();
    await assert.rejects(p,e=>e===error);r.fault(undefined);q.dispose();
    assert.equal(r.releases.length,2);assert.equal(new Set(r.releases).size,2);
  });
}
test('single-buffer backpressure and multiple in-flight maps preserve original counts',async()=>{
  const r=rig(),q=r.query(false),one=q.readValue();assert.equal(await q.readValue(),null);
  r.maps[0].map.resolve();await one;const next=q.readValue();r.maps.at(-1).map.resolve();await next;q.dispose();
  assert.equal(r.buffers.length,2);
  const s=rig(),multi=s.query(),a=multi.readValue(),b=multi.readValue();s.maps[1].map.resolve();s.maps[0].map.resolve();await Promise.all([a,b]);multi.dispose();
  assert.equal(s.buffers.length,3);assert.equal(s.releases.length,3);
});
test('native first-query/count/copy byte semantics and borrow allocation error',async()=>{
  const r=rig(),q=r.query(),p=q.readValues(2,3);r.maps[0].map.resolve();await p;
  assert.ok(r.calls.some(row=>Array.isArray(row)&&row[0]==='resolveArgs'&&row[1]===2&&row[2]===3));
  assert.ok(r.calls.some(row=>Array.isArray(row)&&row[0]==='copyBytes'&&row[1]===24));q.dispose();
  const s=rig(),other=s.query(),error=new Error('destination allocation');s.fault({stage:'createBuffer2',error});await assert.rejects(other.readValue(),e=>e===error);s.fault(undefined);other.dispose();assert.equal(s.releases.length,1);
});
test('dispose attempts all pending/pool/query releases once even with falsy cleanup failure',async()=>{
  const r=rig(),q=r.query(),a=q.readValue(),b=q.readValue();r.fault({stage:'unmap',error:0});
  assert.throws(()=>q.dispose(),e=>e===0);q.dispose();r.fault(undefined);r.maps.forEach(b=>b.map.resolve());assert.deepEqual(await Promise.all([a,b]),[null,null]);
  assert.equal(r.queries[0].destroys,1);assert.equal(r.releases.length,3);assert.ok(r.maps.every(b=>b.unmaps===1));
});
test('partial constructor allocation failure releases earlier native resources',()=>{
  for(const stage of ['createBuffer1','createBuffer2']){
    const error=new Error(stage),r=rig({fault:{stage,error}});assert.throws(()=>r.query(false),e=>e===error);
    assert.equal(r.queries[0].destroys,1);assert.equal(r.releases.length,stage==='createBuffer1'?0:1);
  }
});
test('one loss reaction per device and no QuerySet/engine in shared state',()=>{
  const r=rig(),a=r.query(),b=r.query();assert.equal(r.lossReactions(),1);
  assert.equal(a._lossState,b._lossState);assert.deepEqual(a._lossState,{lost:false});a.dispose();b.dispose();
});
test('timestamp frame/pass null has no sample and real zero remains a sample',async()=>{
  const r=rig({values:[0n,0n]}),t=r.timestamp(),samples=[];
  t.endPass(0,{_addDuration:(...args)=>samples.push(args)});r.maps[0].map.resolve();await flush();assert.deepEqual(samples,[[8,0]]);
  const encoder={writeTimestamp(){}};t.startFrame(encoder);t.endFrame(encoder);r.maps.at(-1).map.resolve();await flush();assert.equal(t.gpuFrameTimeCounter.count,1);
  t.endPass(0,{_addDuration:(...args)=>samples.push(args)});t.dispose();r.maps.at(-1).map.resolve();await flush();assert.equal(samples.length,1);
  const m=new WebGPUDurationMeasure(r.engine,r.device,r.manager);assert.equal(await m.stop({}),null);m.dispose();
});
test('timestamp disable/re-enable cannot reset or write a newer frame cycle',async()=>{
  const r=rig(),t=r.timestamp(),encoder={writeTimestamp(){}};t.startFrame(encoder);t.endFrame(encoder);const old=r.maps[0];
  t.enable=false;t.enable=true;t.startFrame(encoder);t.endFrame(encoder);const next=r.maps[1];
  old.map.resolve();await flush();assert.equal(t._measureDurationState,2);assert.equal(t.gpuFrameTimeCounter.count,0);
  next.map.resolve();await flush();assert.equal(t._measureDurationState,0);assert.equal(t.gpuFrameTimeCounter.count,1);t.dispose();
});
test('known retired timestamp and occlusion owners encode no new query work or stale result',async()=>{
  const r=rig(),t=r.timestamp(),o=r.occlusion(),index=o.createQuery();o._lastBuffer=new BigUint64Array([99n]);
  r.loss.resolve({reason:'destroyed'});await flush();
  const encoder={writeTimestamp(){assert.fail('retired timestamp write');}},descriptor={timestampWrites:{}};
  t.startFrame(encoder);t.endFrame(encoder);t.startPass(descriptor,0);assert.equal(descriptor.timestampWrites,undefined);
  assert.equal(o.hasQueries,false);assert.equal(o.isQueryResultAvailable(index),false);assert.equal(o.getQueryResult(index),-1);
  const m=t._measureDuration;m.start(encoder);assert.equal(await m.stop(encoder),null);m.startPass(descriptor,0);assert.equal(descriptor.timestampWrites,undefined);
  assert.equal(r.maps.length,0);t.dispose();o.dispose();
});
test('active frame/pass errors use the native engine event and create no unhandled child',async()=>{
  const r=rig(),t=r.timestamp(),received=[],unhandled=[];assert.ok(r.engine.onQueryReadErrorObservable);
  r.engine.onQueryReadErrorObservable.add(event=>received.push(event));const listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);
  try{
    const error=new Error('active map');t.endPass(0,{_addDuration(){assert.fail('failed read is not sample');}});r.maps[0].map.reject(error);await turn();
    assert.equal(received[0].error,error);assert.equal(received[0].source,'timestamp-pass');
    const encoder={writeTimestamp(){}};t.startFrame(encoder);t.endFrame(encoder);r.maps.at(-1).map.reject(false);await turn();
    assert.equal(received[1].error,false);assert.equal(received[1].source,'timestamp-frame');assert.deepEqual(unhandled,[]);t.dispose();
  }finally{process.off('unhandledRejection',listener);}
});
for(const first of ['loss','map'])test(`native pass consumer handles ${first}-first race without fake sample`,async()=>{
  const r=rig(),t=r.timestamp(),events=[],samples=[],unhandled=[];r.engine.onQueryReadErrorObservable.add(e=>events.push(e));
  const listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);
  try{
    t.endPass(0,{_addDuration:(...args)=>samples.push(args)});const error=new Error('map abort');
    if(first==='loss'){r.loss.resolve({reason:'destroyed'});await flush();r.maps[0].map.reject(error);}else{r.maps[0].map.reject(error);await turn();r.loss.resolve({reason:'destroyed'});}
    await turn();assert.equal(events.length,first==='map'?1:0);if(events.length)assert.equal(events[0].error,error);
    assert.deepEqual(samples,[]);assert.deepEqual(unhandled,[]);t.dispose();
  }finally{process.off('unhandledRejection',listener);}
});
test('native event observer throw cannot reject the internal consumer chain',async()=>{
  const r=rig(),t=r.timestamp(),unhandled=[];r.engine.onQueryReadErrorObservable.add(()=>{throw new Error('foreign observer');});
  const listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);
  try{t.endPass(0,{_addDuration(){assert.fail();}});r.maps[0].map.reject(new Error('map'));await turn();assert.deepEqual(unhandled,[]);t.dispose();}finally{process.off('unhandledRejection',listener);}
});
for(const before of [true,false])for(const mode of ['throw','skip'])test(`fatal query broadcast reaches Health with foreign ${mode} ${before?'before':'after'} owner`,async()=>{
  const r=rig(),t=r.timestamp(),error=new Error('actual native read rejection'),unhandled=[];
  const foreign=(_event,state)=>{if(mode==='throw')throw new Error('foreign diagnostics');state.skipNextObservers=true;};
  if(before)r.engine.onQueryReadErrorObservable.add(foreign);
  const health=new RenderHealth(r.engine,'game');assert.equal(health.markReady(),true);
  if(!before)r.engine.onQueryReadErrorObservable.add(foreign);
  const guarded=health.guard(new Promise(()=>{})),rejection=assert.rejects(guarded,e=>e===error),listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);
  try{t.endPass(0,{_addDuration(){assert.fail();}});r.maps[0].map.reject(error);await rejection;await turn();assert.equal(health.snapshot().phase,'invalid');assert.equal(health.snapshot().counts.render,1);assert.deepEqual(unhandled,[]);}
  finally{process.off('unhandledRejection',listener);t.dispose();health.dispose();}
});
test('query broadcast keeps native masks, scope, callback identity, once and cleanup during dispatch',()=>{
  const r=rig(),observable=r.engine.onQueryReadErrorObservable,scope={name:'receiver'},calls=[];
  function callback(event,state){assert.equal(this,scope);assert.equal(event.error,0);assert.equal(state.userInfo,'info');calls.push('scoped');}
  observable.add(callback,1,false,scope);observable.add(()=>calls.push('masked'),2);
  observable.addOnce(()=>calls.push('once'));
  observable.notifyObservers({error:0,source:'occlusion'},1,undefined,undefined,'info');
  observable.notifyObservers({error:0,source:'occlusion'},1,undefined,undefined,'info');
  assert.deepEqual(calls,['scoped','once','scoped']);assert.equal(observable.removeCallback(callback,scope),true);
  observable.clear();observable.add(()=>{calls.push('clear');observable.clear();});observable.add(()=>assert.fail('cleared observer delivered'));
  r.engine._reportQueryReadError('occlusion',0);assert.equal(calls.at(-1),'clear');
});
test('occlusion replacement ignores old data/rejection and cleans current ownership',async()=>{
  const r=rig(),o=r.occlusion(),timers=[],original=setTimeout;globalThis.setTimeout=(callback,ms)=>{assert.equal(ms,1000);timers.push(callback);return 1;};
  try{
    o._retrieveQueryBuffer();const old=r.maps[0];o.createQuery();o.createQuery();o.createQuery();o._retrieveQueryBuffer();const current=r.maps[1];
    old.map.resolve();await flush();assert.equal(o._lastBuffer,null);
    current.map.resolve();await flush();assert.deepEqual([...o._lastBuffer],[20n,30n,40n,50n]);
    timers.forEach(f=>f());o.dispose();assert.equal(o.hasQueries,false);assert.equal(o.isQueryResultAvailable(0),false);
  }finally{globalThis.setTimeout=original;}
});
test('occlusion active rejection reports exact error, disposal and old rejection are consumed',async()=>{
  const r=rig(),o=r.occlusion(),events=[],unhandled=[];r.engine.onQueryReadErrorObservable.add(e=>events.push(e));
  const listener=e=>unhandled.push(e);process.on('unhandledRejection',listener);
  try{o._retrieveQueryBuffer();const error=new Error('occlusion map');r.maps[0].map.reject(error);await turn();assert.equal(events[0].error,error);assert.equal(events[0].source,'occlusion');
    // A failed single-buffer owner is terminal in the application. A separate
    // live owner verifies disposal during its actual pending map.
    const next=rig(),nextOwner=next.occlusion();nextOwner._retrieveQueryBuffer();nextOwner.dispose();next.maps[0].map.reject(error);await turn();assert.equal(events.length,1);assert.deepEqual(unhandled,[]);o.dispose();
  }finally{process.off('unhandledRejection',listener);}
});
test('actual native pass error invalidates actual RenderHealth, original guard reason and endFrame veto',async()=>{
  const r=rig(),t=r.timestamp(),error=new Error('native active query failure');let submissions=0;
  r.engine.endFrame=()=>{submissions++;};
  const health=new RenderHealth(r.engine,'game');assert.equal(health.markReady(),true);
  const guarded=health.guard(new Promise(()=>{})),rejection=assert.rejects(guarded,e=>e===error);
  t.endPass(0,{_addDuration(){assert.fail('failure must not be timing data');}});r.maps[0].map.reject(error);await rejection;await turn();
  const state=health.snapshot();assert.equal(state.phase,'invalid');assert.equal(state.counts.render,1);assert.match(state.firstErrors[0].message,/GPU query timestamp-pass: native active query failure/);
  r.engine.endFrame();assert.equal(submissions,0);t.dispose();health.dispose();
});
test('disposed health and retired pass cannot fault the next engine generation',async()=>{
  const r=rig(),t=r.timestamp(),oldHealth=new RenderHealth(r.engine,'game');
  t.endPass(0,{_addDuration(){assert.fail();}});oldHealth.dispose();t.dispose();
  const next=rig(),health=new RenderHealth(next.engine,'game');assert.equal(health.markReady(),true);
  r.maps[0].map.reject(new Error('old pending'));await turn();assert.equal(health.snapshot().valid,true);health.dispose();
});
test('read beginning after engine/device replacement does no encoder work',async()=>{
  for(const replace of ['id','device']){
    const r=rig(),q=r.query();if(replace==='id')r.engine.uniqueId++;else r.engine._device={};
    const before=r.calls.length,operation=q.readValue(),after=r.calls.length;
    // Complete erroneously started terminal IO too, so the original red case
    // fails on behavior instead of hanging on its own intentionally held map.
    r.maps.forEach(buffer=>buffer.map.resolve());
    assert.equal(await operation,null);assert.equal(after,before);q.dispose();
  }
});
test('dispose still attempts all owned resources after query destroy or release throws',async()=>{
  for(const stage of ['queryDestroy','release']){
    const r=rig(),q=r.query(),a=q.readValue(),b=q.readValue(),error=new Error(stage);r.fault({stage,error});
    assert.throws(()=>q.dispose(),e=>e===error);q.dispose();assert.equal(r.releases.length,3);assert.equal(r.queries[0].destroys,1);
    r.fault(undefined);r.maps.forEach(b=>b.map.resolve());assert.deepEqual(await Promise.all([a,b]),[null,null]);assert.equal(r.releases.length,3);
  }
});
test('constructor failure identity is preserved when partial cleanup also throws',()=>{
  const r=rig(),original=r.device.createQuerySet;r.device.createQuerySet=function(d){const q=original.call(this,d);q.destroy=()=>{throw new Error('secondary cleanup');};return q;};
  r.fault({stage:'createBuffer2',error:0});assert.throws(()=>r.query(false),e=>e===0);assert.equal(r.releases.length,1);
});
test('engine disposal attempts existing steps in order, both query owners, clear and exact falsy failure',()=>{
  const r=rig(),e=r.engine,order=[];e.hideLoadingUI=()=>{order.push('hide');};
  e._timestampQuery={dispose(){order.push('timestamp');throw false;}};e._occlusionQuery={dispose(){order.push('occlusion');}};
  e._mainTexture={destroy(){order.push('main');}};e._depthTexture={destroy(){order.push('depth');}};
  e._textureHelper={destroyDeferredTextures(){order.push('textures');}};e._bufferManager={destroyDeferredBuffers(){order.push('buffers');}};
  e._device={destroy(){order.push('device');}};e.onDisposeObservable.add(()=>order.push('super'));e.onQueryReadErrorObservable.add(()=>{});
  assert.throws(()=>WebGPUEngine.prototype.dispose.call(e),error=>error===false);
  assert.deepEqual(order,['hide','timestamp','occlusion','main','depth','textures','buffers','device','super']);assert.equal(e.onQueryReadErrorObservable.hasObservers(),false);
});
