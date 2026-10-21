import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,current,previous,hasRaw,trackedFields} from './fixture.mjs';

test('full native cold Mesh.render records current and previous handles; growth rerecords instead of replaying destroyed buffers',t=>{
  const f=fixture();t.after(()=>f.dispose());let storage=f.draw(1);const old=current(storage),oldPrevious=previous(storage),bundle=f.context().fastBundle;
  assert.equal(old.capacity,2048);assert.equal(old.references,1);assert.equal(f.terminal.bundles.length,1);assert.ok(hasRaw(bundle,old)&&hasRaw(bundle,oldPrevious));
  storage=f.draw(40);const next=current(storage),nextPrevious=previous(storage);assert.equal(next.capacity,4096);assert.equal(nextPrevious.capacity,4096);assert.equal(old.references,0);assert.equal(oldPrevious.references,0);
  f.sweep();assert.equal(old.underlyingResource.destroyed,true);assert.equal(oldPrevious.underlyingResource.destroyed,true);
  assert.notEqual(f.context().fastBundle,bundle);assert.equal(f.terminal.bundles.length,2);assert.ok(hasRaw(f.context().fastBundle,next)&&hasRaw(f.context().fastBundle,nextPrevious));
  assert.equal(hasRaw(f.context().fastBundle,old),false);const stable=f.context().fastBundle;f.draw(40);assert.equal(f.context().fastBundle,stable);assert.equal(f.terminal.bundles.length,2);assert.equal(f.engine._counters.numBundleReuseNonCompatMode,1);
});

test('stable native draws retain bundle and do not alter context, bindings, indirect or UBO-slot lifecycle',t=>{
  const f=fixture();t.after(()=>f.dispose());f.draw();const dc=f.context(),bundle=dc.fastBundle,buffers=dc.buffers,indirect=dc.indirectDrawBuffer,groups=dc.bindGroups,material=f.engine._currentMaterialContext;
  const meshUBO=f.engine._bufferManager.createBuffer(16,72);dc.setBuffer('Mesh',meshUBO);dc.resetIsDirty(material.updateId);
  let resets=0,disposals=0,releases=0;for(const [name,add]of [['reset',()=>resets++],['dispose',()=>disposals++],['_releaseUniformBufferSlots',()=>releases++]]){const original=dc[name];dc[name]=function(...args){add();return Reflect.apply(original,this,args);};}
  f.draw();assert.equal(dc.fastBundle,bundle);f.draw(40);assert.notEqual(dc.fastBundle,bundle);assert.equal(f.context(),dc);assert.equal(dc.buffers,buffers);assert.equal(dc.buffers.Mesh,meshUBO);assert.equal(dc.indirectDrawBuffer,indirect);assert.equal(indirect.destroyed,undefined);assert.equal(dc.bindGroups,groups);assert.equal(f.engine._currentMaterialContext,material);assert.deepEqual([resets,disposals,releases],[0,0,0]);f.engine._bufferManager.releaseBuffer(meshUBO);
});

test('later actual DrawContext and temporary SubMesh shadow override invalidate lazily after another context grows storage',t=>{
  const f=fixture();t.after(()=>f.dispose());f.draw();const main=f.context(),mainBundle=main.fastBundle,shadow=f.wrapper();f.draw(1,{override:shadow});const shadowBundle=shadow.drawContext.fastBundle;assert.notEqual(main,shadow.drawContext);
  f.draw(40);f.sweep();assert.notEqual(main.fastBundle,mainBundle);assert.equal(shadow.drawContext.fastBundle,shadowBundle);
  f.draw(40,{override:shadow});assert.notEqual(shadow.drawContext.fastBundle,shadowBundle);assert.ok(hasRaw(shadow.drawContext.fastBundle,current(f.storage())));assert.equal(f.sub._drawWrapperOverride,null);
});

test('separate native render passes keep separate storage, invalidate their own changed matrix identities and keep stable reuse',t=>{
  const f=fixture();t.after(()=>f.dispose());const first=f.draw(),a=current(first),one=f.context();const second=f.draw(1,{passID:8}),b=current(second),two=f.context(),twoBundle=two.fastBundle;assert.notEqual(a,b);assert.notEqual(one,two);
  f.draw(40,{passID:7});assert.equal(current(second),b);f.draw(1,{passID:8});assert.equal(two.fastBundle,twoBundle);f.draw(40,{passID:8});assert.notEqual(two.fastBundle,twoBundle);assert.ok(hasRaw(two.fastBundle,current(second)));
});

test('first previous matrices at unchanged capacity replace current and previous identities without disturbing ready Effect',t=>{
  const f=fixture({previous:false});t.after(()=>f.dispose());const storage=f.draw(),old=current(storage),bundle=f.context().fastBundle,effect=f.engine._currentEffect;assert.equal(storage.instancesPreviousBuffer,undefined);
  f.scene.needsPreviousWorldMatrices=true;f.draw();assert.equal(current(storage).capacity,2048);assert.equal(previous(storage).capacity,2048);assert.notEqual(current(storage),old);assert.notEqual(f.context().fastBundle,bundle);assert.ok(hasRaw(f.context().fastBundle,current(storage)));assert.equal(f.context()._regularInstancePreviousBufferId,previous(storage).uniqueId);assert.equal(f.engine._currentEffect,effect);f.sweep();assert.equal(old.underlyingResource.destroyed,true);
});

test('no-effect native preparation grows resources without touching an unrelated draw cache; next actual draw still validates identity',t=>{
  const f=fixture();t.after(()=>f.dispose());f.draw();const dc=f.context(),bundle=dc.fastBundle,fields=trackedFields(dc).map(key=>[key,dc[key]]);f.register(40);const batch=f.mesh._getInstancesRenderList(f.sub._id);
  for(const [fill,effect]of [[undefined,undefined],[0,undefined],[undefined,f.effect]]){f.mesh._renderWithInstances(f.sub,fill,batch,effect,f.engine);assert.equal(dc.fastBundle,bundle);assert.deepEqual(trackedFields(dc).map(key=>[key,dc[key]]),fields);}
  f.draw(40);assert.notEqual(dc.fastBundle,bundle);assert.ok(hasRaw(dc.fastBundle,current(f.storage())));
});

test('unknown current or previous DataBuffer IDs never authorize a cached replay, including repeated null identities',t=>{
  for(const role of ['current','previous'])for(const unknown of [null,undefined]){const f=fixture();try{f.draw();const db=role==='current'?current(f.storage()):previous(f.storage()),id=db.uniqueId,old=f.context().fastBundle;db.uniqueId=unknown;f.draw();const first=f.context().fastBundle;assert.notEqual(first,old);f.draw();assert.notEqual(f.context().fastBundle,first);db.uniqueId=id;}finally{f.dispose();}}
});

test('disposed current buffer in a frozen native branch cannot replay a cached old raw handle',t=>{
  const f=fixture();t.after(()=>f.dispose());f.draw();const old=current(f.storage()),bundle=f.context().fastBundle;f.storage().instancesBuffer.dispose();f.mesh._instanceDataStorage.isFrozen=true;f.draw();assert.notEqual(f.context().fastBundle,bundle);assert.equal(hasRaw(f.context().fastBundle,old),false);f.sweep();assert.equal(old.underlyingResource.destroyed,true);
});

test('valid zero DataBuffer identity is cached as a scalar and stable draw reuse is retained',t=>{
  const f=fixture();t.after(()=>f.dispose());f.draw();const db=current(f.storage()),id=db.uniqueId;db.uniqueId=0;f.draw();const bundle=f.context().fastBundle;assert.equal(f.context()._regularInstanceCurrentBufferId,0);f.draw();assert.equal(f.context().fastBundle,bundle);db.uniqueId=id;
});

test('original material dirty and outside-draw context reset still invalidate normally without resource/effect replacement',t=>{
  const f=fixture();t.after(()=>f.dispose());f.draw();const dc=f.context(),effect=f.engine._currentEffect,db=current(f.storage()),first=dc.fastBundle;f.engine._currentMaterialContext.isDirty=true;f.draw();assert.notEqual(dc.fastBundle,first);
  const second=dc.fastBundle;dc.reset();f.draw();assert.notEqual(dc.fastBundle,second);assert.equal(current(f.storage()),db);assert.equal(f.engine._currentEffect,effect);const stable=dc.fastBundle;f.draw();assert.equal(dc.fastBundle,stable);
});

test('actual native terminal draw and allocation exceptions keep exact original falsy values and resource refcounts',t=>{
  const options={},f=fixture(options);t.after(()=>f.dispose());options.drawThrows=false;assert.throws(()=>f.draw(),error=>error===false);delete options.drawThrows;f.draw();const old=current(f.storage());options.createThrows=0;assert.throws(()=>f.draw(40),error=>error===0);assert.equal(old.references,0);assert.equal(f.context()._regularInstanceCurrentBufferId,old.uniqueId);
});

test('WebGPU compatibility mode is unchanged and never installs regular-instance bundle bookkeeping',t=>{
  const f=fixture({mode:'cm'});t.after(()=>f.dispose());f.draw();f.draw(40);assert.deepEqual(trackedFields(f.context()),[]);assert.equal(f.terminal.bundles.length,0);assert.equal(f.engine._counters.numBundleCreationNonCompatMode,0);assert.ok(f.pass.resources.includes(current(f.storage()).underlyingResource));
});

test('actual NullEngine WebGL native mesh path stays without WebGPU context bookkeeping',t=>{
  const f=fixture({mode:'webgl'});t.after(()=>f.dispose());f.draw();f.draw(40);assert.equal(f.engine.isWebGPU,false);assert.equal(f.context(),undefined);assert.equal(f.storage().instancesBufferSize,4096);assert.equal(f.storage().instancesData.byteLength,4096);assert.equal(f.mesh._instanceDataStorage.useMonoDataStorageRenderPass,true);
});

test('vertex-pulling native path is explicitly unchanged; this pin fix does not claim its storage-refresh defect',t=>{
  const f=fixture({pulling:true});t.after(()=>f.dispose());f.draw();const old=current(f.storage()),bundle=f.context().fastBundle,dc=f.context();assert.equal(dc.buffers.world0,old);
  f.draw(40);assert.deepEqual(trackedFields(dc),[]);assert.equal(dc.fastBundle,bundle);assert.equal(dc.buffers.world0,old);assert.notEqual(current(f.storage()),old);
});
