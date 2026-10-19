import test from 'node:test';import assert from 'node:assert/strict';import{fixture,ready}from'./fixture.mjs';

test('same actual base/source/ABI shares real engine Effect while draw/material contexts remain separate',async t=>{
 const f=await fixture();t.after(f.dispose);const w=f.wrapper(),a=f.mesh(),b=f.mesh();
 const one=await ready(w._makeEffect(a.sub,f.depth,f.generator,0)),two=await ready(w._makeEffect(b.sub,f.depth,f.generator,0));
 assert.equal(one,two);assert.equal(one._refCount,2);const left=w.getEffect(a.sub,f.generator,0),right=w.getEffect(b.sub,f.generator,0);assert.notEqual(left,right);assert.notEqual(left.drawContext,right.drawContext);assert.notEqual(left.materialContext,right.materialContext);
 const alias=w.getEffect(a.sub,f.generator,7);assert.notEqual(alias,left);assert.equal(alias.effect,one);assert.equal(one._refCount,2);assert.notEqual(alias.drawContext,left.drawContext);
 a.mesh.dispose();assert.equal(one.isDisposed,false);assert.equal(one._refCount,1);assert.equal(w.getEffect(a.sub,f.generator,0),null);assert.equal(alias.effect,null);
 b.mesh.dispose();assert.equal(one.isDisposed,true);assert.equal(one._refCount,0);assert.equal(f.engine._compiledEffects[one._key],undefined);
 for(const context of [left.drawContext,right.drawContext,alias.drawContext])assert.equal(f.contexts.find(x=>x.context===context).releases(),1);
});

test('depth replacement balances real cache references and failed acquisition preserves old entry',async t=>{
 const f=await fixture();t.after(f.dispose);const w=f.wrapper(),a=f.mesh(),b=f.mesh();const old=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));await ready(w._makeEffect(b.sub,f.depth,f.generator,0));
 const next=await ready(w._makeEffect(a.sub,[...f.depth,'#define DEPTHPREPASS'],f.generator,0));assert.notEqual(next,old);assert.equal(old._refCount,1);assert.equal(next._refCount,1);
 const create=f.engine.createEffect;f.engine.createEffect=()=>{throw new Error('creation failure');};assert.throws(()=>w._makeEffect(a.sub,['#define FAIL'],f.generator,0),/creation failure/);f.engine.createEffect=create;
 assert.equal(w.getEffect(a.sub,f.generator,0).effect,next);assert.equal(w._makeEffect(a.sub,[...f.depth,'#define DEPTHPREPASS'],f.generator,0),next);
 const back=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));assert.equal(back,old);assert.equal(old._refCount,2);assert.equal(next._refCount,0);assert.equal(next.isDisposed,true);
 w.dispose();assert.equal(old._refCount,0);assert.equal(old.isDisposed,true);w.dispose();assert.equal(old._refCount,0);
});

test('base replacement releases only its owner and disposed wrappers cannot recreate entries',async t=>{
 const f=await fixture();t.after(f.dispose);const w=f.wrapper(),a=f.mesh(),b=f.mesh();const old=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));await ready(w._makeEffect(b.sub,f.depth,f.generator,0));
 const newer=await f.base();f.notify(a.sub,newer);assert.equal(old._refCount,1);assert.equal(w.getEffect(a.sub,f.generator,0),null);
 const next=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));assert.notEqual(next,old);w.dispose();assert.equal(old.isDisposed,true);assert.equal(next.isDisposed,true);assert.equal(newer.isDisposed,false);assert.equal(f.original.isDisposed,false);
 f.notify(a.sub,newer);assert.equal(w._subMeshToEffect.size,0);assert.equal(w._makeEffect(a.sub,f.depth,f.generator,0),null);assert.equal(w.isReadyForSubMesh(a.sub,f.depth,f.generator,false,0),false);
});

test('complete source and ordered ABI/index parameters isolate actual engine programs',async t=>{
 const changes=[
  ['vertex source',e=>{e._vertexSourceCodeBeforeMigration+='\n// changed vertex';}],
  ['fragment source',e=>{e._fragmentSourceCodeBeforeMigration+='\n// changed fragment';}],
  ['attribute order',e=>{e._attributesNames=['normal','position'];},e=>{e._attributesNames=['position','normal'];}],
  ['uniform order',e=>{e._uniformsNames=['view','world'];},e=>{e._uniformsNames=['world','view'];}],
  ['UBO order',e=>{e._uniformBuffersNamesList=['Material','Scene'];},e=>{e._uniformBuffersNamesList=['Scene','Material'];}],
  ['sampler order',e=>{e._samplerList=['secondSampler','firstSampler'];},e=>{e._samplerList=['firstSampler','secondSampler'];}],
  ['index value',e=>{e._indexParameters={count:2};}],
  ['index primitive type',e=>{e._indexParameters={count:'1'};}],
  ['index property order',e=>{e._indexParameters={other:0,count:1};},e=>{e._indexParameters={count:1,other:0};}],
 ];
 for(const[name,change,initialize]of changes)await t.test(name,async t=>{
  const f=await fixture();t.after(f.dispose);initialize?.(f.original);const w=f.wrapper(),a=f.mesh(),first=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));change(f.original);const b=f.mesh(),second=await ready(w._makeEffect(b.sub,f.depth,f.generator,0));
  assert.notEqual(first,second);assert.equal(first._refCount,1);assert.equal(second._refCount,1);
 });
});

test('generator entries share only within the wrapper; distinct wrapper and original Effect identities remain isolated',async t=>{
 const f=await fixture();t.after(f.dispose);const w=f.wrapper(),other=f.wrapper(),a=f.mesh();
 const first=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));const secondGenerator={};assert.equal(await ready(w._makeEffect(a.sub,f.depth,secondGenerator,2)),first);assert.equal(first._refCount,2);
 const separate=await ready(other._makeEffect(a.sub,f.depth,f.generator,0));assert.notEqual(separate,first);w._deleteDepthWrapperEffect(a.sub);assert.equal(first.isDisposed,true);assert.equal(separate.isDisposed,false);
});

test('injected source and remapping options are compared exactly; language has its own token namespace',async t=>{
 const f=await fixture({options:{remappedVariables:['worldPos','worldPosition']}});t.after(f.dispose);const options={remappedVariables:['worldPos','worldPosition']},w=f.wrapper(options),a=f.mesh();
 const first=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));const before=f.creates.at(-1);options.remappedVariables=['worldPos','differentPosition'];const b=f.mesh(),second=await ready(w._makeEffect(b.sub,f.depth,f.generator,0));
 assert.notEqual(first,second);assert.notEqual(before.base.vertexSource,f.creates.at(-1).base.vertexSource);options.doNotInjectCode=true;const c=f.mesh(),third=await ready(w._makeEffect(c.sub,f.depth,f.generator,0));assert.notEqual(third,second);
 const call=f.creates.at(-1),token=w._getDepthProgramToken(f.original,call.base.vertexSource,call.base.fragmentSource,call.options,'fallback');
 assert.notEqual(w._getDepthProgramToken(f.original,call.base.vertexSource,call.base.fragmentSource,{...call.options,shaderLanguage:1},'fallback'),token);
});

test('unsupported index descriptors retain unique legacy per-entry tokens without coercing descriptor values',async t=>{
 const f=await fixture();t.after(f.dispose);let reads=0;const parameters={};Object.defineProperty(parameters,'unused',{get(){reads++;return 1;}});f.original._indexParameters=parameters;
 const w=f.wrapper(),a=f.mesh(),b=f.mesh();const first=await ready(w._makeEffect(a.sub,f.depth,f.generator,0)),second=await ready(w._makeEffect(b.sub,f.depth,f.generator,0));assert.notEqual(first,second);assert.equal(reads,0);
});

test('retirement during synchronous engine creation releases its acquired Effect and cannot revive maps',async t=>{
 const f=await fixture();t.after(f.dispose);const w=f.wrapper(),a=f.mesh(),create=f.engine.createEffect;let acquired;
 f.engine.createEffect=function(...args){acquired=Reflect.apply(create,this,args);w.dispose();return acquired;};
 assert.equal(w._makeEffect(a.sub,f.depth,f.generator,0),null);assert.equal(acquired.isDisposed,true);assert.equal(acquired._refCount,0);assert.equal(f.engine._compiledEffects[acquired._key],undefined);assert.equal(w._subMeshToDepthWrapper.mm.size,0);await new Promise(r=>setTimeout(r,5));
});

test('forced engine release does not double-decrement revoked leases; a disposed base is refused',async t=>{
 const f=await fixture();t.after(f.dispose);const w=f.wrapper(),a=f.mesh(),effect=await ready(w._makeEffect(a.sub,f.depth,f.generator,0));effect.dispose(true);w.dispose();assert.equal(effect._refCount,0);
 const next=f.wrapper(),b=f.mesh();f.original.dispose(true);assert.equal(next._makeEffect(b.sub,f.depth,f.generator,0),null);
});

test('WebGL keeps historical unique tokens and replacement/wrapper-disposal behavior',async t=>{
 const f=await fixture({gpu:false});t.after(f.dispose);const w=f.wrapper(),a=f.mesh(),b=f.mesh();const first=await ready(w._makeEffect(a.sub,f.depth,f.generator,0)),second=await ready(w._makeEffect(b.sub,f.depth,f.generator,0));assert.notEqual(first,second);
 await ready(w._makeEffect(a.sub,[...f.depth,'#define DEPTHPREPASS'],f.generator,0));assert.equal(first.isDisposed,false,'Historical WebGL replacement retains its previous Effect');w.dispose();assert.equal(second.isDisposed,false,'Historical WebGL wrapper disposal only detaches observers');
});
