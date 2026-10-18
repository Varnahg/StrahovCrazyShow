import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate} from 'node:timers/promises';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {MaterialDefines} from '@babylonjs/core/Materials/materialDefines.js';
import {Observable} from '@babylonjs/core/Misc/observable.js';
import {NullEngine} from '@babylonjs/core/Engines/nullEngine.js';
const stock=MaterialDefines.prototype.toString;
const originalSource=fs.readFileSync(new URL('./preimages/Materials/materialDefines.js',import.meta.url),'utf8');
assert.equal(createHash('sha256').update(originalSource).digest('hex'),'43a75f4ae32d48c9f23a815f8f2996e895ce3e8d3574f4a04504ee00444916f4');
const {MaterialDefines:OriginalDefines}=await import('data:text/javascript;base64,'+Buffer.from(originalSource).toString('base64'));
function capture(){const original=globalThis.WeakRef,owners=[],watches=[];globalThis.WeakRef=class extends original{constructor(value){super(value);if(value.entries instanceof Map&&value.observers){if(!owners.includes(value))owners.push(value);}else watches.push(this);}};return{owners,watches,restore(){globalThis.WeakRef=original;}};}
function device(){let resolve,reject;const lost=new Promise((yes,no)=>{resolve=yes;reject=no;});return{lost,resolve,reject};}
function engine(d=device()){return{isWebGPU:true,isDisposed:false,_device:d,_contextWasLost:false,onDisposeObservable:new Observable(),onContextLostObservable:new Observable(),onContextRestoredObservable:new Observable(),dispose(){this.isDisposed=true;this.onDisposeObservable.notifyObservers(this);}};}
function defines(id=1){const d=new MaterialDefines();d.Z=id;d.A=true;d.rebuild();return d;}
const serialize=(d,e)=>MaterialDefines._SerializeForEngine(d,e);
function size(owner){return{entries:owner.entries.size,units:owner.units};}
function assertAccounting(owner){const entries=[...owner.entries];assert.ok(entries.length<=64);assert.equal(owner.units,entries.reduce((n,[k,v])=>{assert.equal(typeof k,'string');assert.equal(typeof v,'string');return n+k.length+v.length;},0));assert.ok(owner.units<=262144);}

test('public API is pure; actual adapter reads custom method once with zero args and captured stock identity',()=>{
 assert.equal(typeof MaterialDefines._SerializeForEngine,'function');
 const e=engine(),c=capture();try{
 const d=defines();assert.equal(Reflect.apply(stock,d,['ignored',e]),stock.call(d));assert.equal(c.owners.length,0);
 assert.equal(serialize(d,e),d.toString());assert.equal(c.owners.length,1);assert.equal(c.owners[0].entries.size,1);
 let reads=0,calls=0;const sentinel={get then(){throw Error('do not inspect return');}};
 Object.defineProperty(d,'toString',{configurable:true,get(){reads++;return function(...args){calls++;assert.equal(this,d);assert.deepEqual(args,[]);return sentinel;};}});
 assert.equal(serialize(d,e),sentinel);assert.equal(reads,1);assert.equal(calls,1);
 for(const value of [undefined,null,false,0,new Error('custom')]){Object.defineProperty(d,'toString',{configurable:true,value:function(...args){assert.equal(args.length,0);throw value;}});let caught=false;try{serialize(d,e);}catch(error){caught=true;assert.equal(error,value);}assert.equal(caught,true);}
 delete d.toString;let wrapped=0;MaterialDefines.prototype.toString=function(...args){wrapped++;assert.equal(args.length,0);return Reflect.apply(stock,this,[]);};
 const before=size(c.owners[0]);assert.equal(serialize(defines(98),e),stock.call(defines(98)));assert.equal(wrapped,1);assert.deepEqual(size(c.owners[0]),before);
 }finally{MaterialDefines.prototype.toString=stock;e.dispose();c.restore();}
});

test('shared raw loop preserves exact getter order, late keys, repeated reads and falsy throws even on cache hits',()=>{
 const e=engine(),c=capture();try{
 function specimen(thrown=false){const events=[],keys=['Z','A'];const d=Object.create(MaterialDefines.prototype);Object.defineProperty(d,'_keys',{get(){events.push('keys');return new Proxy(keys,{get(t,p,r){events.push('key:'+String(p));return Reflect.get(t,p,r);}});}});Object.defineProperty(d,'Z',{get(){events.push('Z');if(thrown)throw false;keys.push('B');return 7;}});Object.defineProperty(d,'A',{get(){events.push('A');return true;}});Object.defineProperty(d,'B',{get(){events.push('B');return -1;}});return{d,events};}
 for(let pass=0;pass<2;pass++){const a=specimen(),b=specimen();assert.equal(serialize(a.d,e),OriginalDefines.prototype.toString.call(b.d));assert.deepEqual(a.events,b.events);}
 const a=specimen(true),b=specimen(true);for(const [d,fn]of [[a.d,()=>serialize(a.d,e)],[b.d,()=>OriginalDefines.prototype.toString.call(b.d)]]){let caught=false;try{fn();}catch(error){caught=true;assert.equal(error,false);}assert.ok(caught);}assert.deepEqual(a.events,b.events);
 }finally{e.dispose();c.restore();}
});

test('an actual owner hit skips canonical sorting only after fresh original value reads; public method remains pure',()=>{
 const e=engine(),d=defines(),c=capture(),sort=Array.prototype.sort;let sorts=0,reads=0;Object.defineProperty(d,'Z',{get(){reads++;return 1;}});Array.prototype.sort=function(...args){sorts++;return Reflect.apply(sort,this,args);};try{serialize(d,e);assert.equal(sorts,1);serialize(d,e);assert.equal(sorts,1);assert.equal(reads,2);stock.call(d);assert.equal(sorts,2);assert.equal(reads,3);}finally{Array.prototype.sort=sort;e.dispose();c.restore();}
});

test('memo does not alter material descriptors, clone/equality/rebuild, and a throwing method getter precedes owner acquisition',()=>{
 const e=engine(),c=capture();try{const d=defines(),clone=new MaterialDefines();clone.Z=0;clone.A=false;clone.rebuild();d.cloneTo(clone);const before=Object.getOwnPropertyDescriptors(d),keys=d._keys.slice();assert.ok(d.isEqual(clone));serialize(d,e);serialize(d,e);assert.deepEqual(Object.getOwnPropertyDescriptors(d),before);assert.deepEqual(d._keys,keys);assert.ok(d.isEqual(clone));d.reset();assert.equal(serialize(d,e),OriginalDefines.prototype.toString.call(d));d.EXTRA=2;d.rebuild();assert.equal(serialize(d,e),OriginalDefines.prototype.toString.call(d));const e2=engine();let count=0;Object.defineProperty(d,'toString',{get(){count++;throw 0;}});let caught=false;try{serialize(d,e2);}catch(value){caught=true;assert.equal(value,0);}assert.ok(caught);assert.equal(count,1);assert.equal(c.owners.length,1);e2.dispose();}finally{e.dispose();c.restore();}
});

test('separate engines own bounded FIFO caches; hits do not reorder and unchanged/unknown/oversized blocks do not evict',()=>{
 const a=engine(),b=engine(),c=capture();try{
 for(let i=0;i<64;i++)serialize(defines(i),a);serialize(defines(0),b);const [oa,ob]=c.owners;assert.equal(oa.entries.size,64);assert.equal(ob.entries.size,1);const first=oa.entries.keys().next().value;
 serialize(defines(0),a);serialize(defines(64),a);assert.equal(oa.entries.has(first),false);assert.equal(ob.entries.has(first),true);
 const before=size(oa);for(const item of [{_keys:[]},{_keys:['A','Z'],A:true,Z:3},{_keys:['Z','A'],Z:'x+y',A:true},{_keys:['Z','A'],Z:'1'.repeat(40000),A:true}]){Object.setPrototypeOf(item,MaterialDefines.prototype);assert.equal(serialize(item,a),stock.call(item));assert.deepEqual(size(oa),before);}
 for(let i=0;i<100;i++){const d=new MaterialDefines();for(let n=159;n>=0;n--)d['KEY'+n]=i+n;d.rebuild();serialize(d,a);assertAccounting(oa);}assertAccounting(ob);assert.ok(oa.entries.size<64,'combined-unit cap exercised');
 const other=size(ob);a.dispose();assert.deepEqual(size(oa),{entries:0,units:0});assert.deepEqual(size(ob),other);assert.equal(oa.engine,null);assert.equal(oa.device,null);assert.equal(oa.watches,null);assert.equal(oa.observers.length,0);assert.equal(serialize(defines(1),b),stock.call(defines(1)));
 }finally{a.dispose();b.dispose();c.restore();}
});

test('WebGL, unknown, uninitialized, disposed and unsupported WeakRef stay pure without registrations',()=>{
 const c=capture();try{for(const e of [undefined,{},engine(null),{...engine(),isWebGPU:false},{...engine(),isDisposed:true}])assert.equal(serialize(defines(),e),stock.call(defines()));assert.equal(c.owners.length,0);
 const e=engine(),saved=globalThis.WeakRef;globalThis.WeakRef=undefined;try{serialize(defines(),e);}finally{globalThis.WeakRef=saved;}assert.equal(e.onDisposeObservable.observers.length,0);
 }finally{c.restore();}
});

test('two actual NullEngine lifecycles with explicit device IO tokens never share memo or disposal',async()=>{
 const a=new NullEngine(),b=new NullEngine(),c=capture();try{a._isWebGPU=true;b._isWebGPU=true;a._device=device();b._device=device();serialize(defines(),a);serialize(defines(),b);assert.equal(c.owners.length,2);const[oa,ob]=c.owners;assert.notEqual(oa.entries,ob.entries);assert.deepEqual([...oa.entries],[...ob.entries]);a.dispose();await setImmediate();assert.equal(oa.disposed,true);assert.equal(oa.entries.size,0);assert.equal(ob.active,true);assert.equal(ob.entries.size,1);serialize(defines(2),b);assert.equal(ob.entries.size,2);b.dispose();await setImmediate();assert.equal(ob.entries.size,0);assert.equal(ob.observers.length,0);}finally{a.dispose();b.dispose();c.restore();}
});

test('direct device loss and rejection deactivate only their generation with doNotHandleContextLost behavior',async()=>{
 const a=engine(),b=engine(),c=capture();try{serialize(defines(),a);serialize(defines(),b);const[oa,ob]=c.owners;const before=size(ob);a._device.resolve({reason:'destroyed'});await setImmediate();assert.equal(oa.active,false);assert.deepEqual(size(oa),{entries:0,units:0});assert.deepEqual(size(ob),before);serialize(defines(2),a);assert.equal(oa.entries.size,0);
 a._device=device();serialize(defines(3),a);assert.equal(oa.entries.size,1);assert.equal(oa.active,true);a._device.reject(new Error('lost query'));await setImmediate();assert.equal(oa.active,false);assert.equal(oa.entries.size,0);
 }finally{a.dispose();b.dispose();c.restore();}
});

test('device replacement, stale loss, context events and A→B→A reentry invalidate old leases without duplicate subscriptions',async()=>{
 const da=device(),db=device(),e=engine(da),c=capture();let subscriptions=0;const original=da.lost.then;da.lost.then=function(...args){subscriptions++;return Reflect.apply(original,this,args);};try{
 serialize(defines(),e);const owner=c.owners[0];const initial=owner.epoch;
 const outer=defines(2);Object.defineProperty(outer,'Z',{get(){e._device=db;serialize(defines(3),e);e._device=da;serialize(defines(4),e);return 2;}});assert.equal(serialize(outer,e),stock.call(defines(2)));assert.ok(owner.epoch>initial);assert.equal(subscriptions,1);assert.equal(owner.entries.size,1);assert.ok([...owner.entries.keys()][0].includes('Z 4'));
 e._device=db;serialize(defines(5),e);const before=size(owner);da.resolve({reason:'old'});await setImmediate();assert.deepEqual(size(owner),before);assert.equal(owner.active,true);
 e.onContextLostObservable.notifyObservers(e);assert.equal(owner.active,false);assert.equal(owner.entries.size,0);e.onContextRestoredObservable.notifyObservers(e);serialize(defines(6),e);assert.equal(owner.entries.size,0,'same lost device remains inactive');e._device=device();serialize(defines(7),e);assert.equal(owner.entries.size,1);
 }finally{e.dispose();c.restore();}
});

test('getter disposal/device change and reentrant observation cannot hit or repopulate an obsolete owner',async()=>{
 const e=engine(),c=capture();try{serialize(defines(),e);const owner=c.owners[0],old=e._device;const d=defines();Object.defineProperty(d,'Z',{get(){e.dispose();return 1;}});assert.equal(serialize(d,e),stock.call(defines()));assert.deepEqual(size(owner),{entries:0,units:0});assert.equal(owner.watch,null);assert.equal(owner.engine,null);old.resolve({reason:'late'});await setImmediate();assert.equal(owner.entries.size,0);
 const e2=engine();serialize(defines(),e2);const o2=c.owners[1];const d2=defines(2);Object.defineProperty(d2,'Z',{get(){e2._device=device();return 2;}});serialize(d2,e2);assert.equal(o2.entries.size,0);serialize(defines(3),e2);assert.equal(o2.entries.size,1);e2.dispose();
 const e3=engine();Object.defineProperty(e3._device,'lost',{get(){e3.dispose();return new Promise(()=>{});}});serialize(defines(),e3);const o3=c.owners[2];assert.equal(o3.disposed,true);assert.equal(o3.watch,null);assert.equal(o3.device,null);assert.equal(o3.engine,null);
 }finally{e.dispose();c.restore();}
});

test('pending callbacks retain only weak cells and disposal removes own observers without removing another owner',async()=>{
 const e=engine(),c=capture(),other=()=>{};e.onDisposeObservable.add(other);const lost=e._device;try{serialize(defines(),e);const owner=c.owners[0],watch=owner.watch;assert.equal(watch.owner instanceof WeakRef,true);assert.equal(watch.device instanceof WeakRef,true);assert.deepEqual(Object.keys(watch).sort(),['device','lost','owner']);e.dispose();await new Promise(resolve=>setTimeout(resolve,0));assert.equal(e.onDisposeObservable.observers.filter(o=>o.callback===other).length,1);assert.equal(e.onContextLostObservable.observers.length,0);assert.equal(e.onContextRestoredObservable.observers.length,0);assert.equal(owner.engine,null);assert.equal(owner.device,null);assert.equal(owner.watch,null);assert.equal(owner.watches,null);assert.deepEqual(size(owner),{entries:0,units:0});lost.reject(new Error('late consumed'));await setImmediate();assert.equal(owner.entries.size,0);
 }finally{e.dispose();c.restore();}
});

test('observer or lost access failures use clean canonical fallback and do not alter raw getter throws',()=>{
 const c=capture();try{const e=engine();e.onContextLostObservable.add=()=>{throw Error('registration');};assert.equal(serialize(defines(),e),stock.call(defines()));assert.equal(c.owners[0].disposed,true);
 const e2=engine();Object.defineProperty(e2._device,'lost',{get(){throw Error('device read');}});assert.equal(serialize(defines(),e2),stock.call(defines()));assert.equal(c.owners[1].active,false);const d=defines();Object.defineProperty(d,'Z',{get(){throw null;}});let caught=false;try{serialize(d,e2);}catch(error){caught=true;assert.equal(error,null);}assert.equal(caught,true);e2.dispose();
 }finally{c.restore();}
});

test('a previously registered throwing disposal observer keeps its exception after memo cleanup',()=>{
 const e=engine(),c=capture(),sentinel=new Error('external disposal');const h=e.onDisposeObservable.add(()=>{throw sentinel;});try{serialize(defines(),e);const owner=c.owners[0];assert.throws(()=>e.dispose(),error=>error===sentinel);assert.equal(owner.disposed,true);assert.deepEqual(size(owner),{entries:0,units:0});assert.equal(owner.engine,null);assert.equal(owner.device,null);}finally{e.onDisposeObservable.remove(h);c.restore();}
});

test('replacement device during restored observer notification is suspended, not permanently marked lost',()=>{
 const e=engine(),c=capture();try{e.onContextRestoredObservable.add(()=>serialize(defines(2),e));serialize(defines(),e);const owner=c.owners[0];e._contextWasLost=true;e.onContextLostObservable.notifyObservers(e);e._device=device();e.onContextRestoredObservable.notifyObservers(e);assert.equal(owner.entries.size,0);e._contextWasLost=false;serialize(defines(3),e);assert.equal(owner.active,true);assert.equal(owner.watch.lost,false);assert.equal(owner.entries.size,1);}finally{e.dispose();c.restore();}
});

test('source ownership callback factories have no strong outer capture and public namespace remains unchanged',async()=>{
 const module=await import('@babylonjs/core/Materials/materialDefines.js');assert.deepEqual(Object.keys(module),['MaterialDefines']);const source=fs.readFileSync(createRequire(import.meta.url).resolve('@babylonjs/core/Materials/materialDefines.js'),'utf8');
 assert.match(source,/function defineMemoObserver\(weakOwner, event\)/);assert.match(source,/function defineMemoDeviceLost\(watch\)/);assert.match(source,/watch = \{ owner: new WeakRef\(owner\), device: new WeakRef\(device\), lost: false \}/);assert.doesNotMatch(source,/LastCreatedEngine|LastCreatedScene|RenderHealth/);
});
