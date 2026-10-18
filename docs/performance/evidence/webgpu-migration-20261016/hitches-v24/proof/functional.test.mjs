import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DefineMemo} from './memo-owner.mjs';
import {MaterialDefines,RawMaterialDefines,canonicalResult} from './reference-harness.mjs';
const {blocks}=JSON.parse(fs.readFileSync(new URL('mixed-blocks.json',import.meta.url)));
function memoClass(owner){return class extends RawMaterialDefines{toString(...args){return owner.convert(Reflect.apply(RawMaterialDefines.prototype.toString,this,args));}}}
function instance(Type,block){const d=new Type();Object.assign(d,block.values);const active=block.text.trimEnd().split('\n').map(line=>line.split(' ')[1]);d._keys=[...active,...Object.keys(d).filter(k=>!k.startsWith('_')&&!active.includes(k))];return d;}
function invariant(owner){const s=owner.snapshot(),entries=owner.inspect();assert.ok(s.retainedEntries<=s.maxEntries);assert.ok(s.retainedCodeUnits<=s.maxCodeUnits);assert.equal(entries.length,s.retainedEntries);assert.equal(entries.reduce((n,e)=>n+e.key.length+e.value.length,0),s.retainedCodeUnits);assert.ok(entries.every(e=>typeof e.key==='string'&&typeof e.value==='string'));}
const text=n=>`#define Z ${n}\n#define A\n`;

test('complete baseline fifty mixed states retain exact reference bytes through the unchanged raw loop',()=>{
  const owner=new DefineMemo(canonicalResult),Type=memoClass(owner);
  try{assert.equal(blocks.length,50);assert.equal(new Set(blocks.map(b=>b.kind)).size,10);
    for(let pass=0;pass<3;pass++)for(const block of blocks){const d=instance(Type,block),raw=instance(RawMaterialDefines,block),before=Object.getOwnPropertyDescriptors(d);assert.equal(raw.toString(),block.text);assert.equal(d.toString(),block.canonical);assert.equal(d.toString(),canonicalResult(block.text));assert.deepEqual(Object.getOwnPropertyDescriptors(d),before);invariant(owner);}
    assert.ok(owner.snapshot().hits>0);assert.equal(owner.snapshot().evictions,0);
  }finally{owner.dispose();assert.equal(owner.snapshot().retainedCodeUnits,0)}
});
test('FIFO entry cap does not refresh on hit and preserves exact keys',()=>{
  const owner=new DefineMemo(canonicalResult,{maxEntries:2,maxCodeUnits:2000});
  owner.convert(text(1));owner.convert(text(2));owner.convert(text(1));owner.convert(text(3));
  assert.deepEqual(owner.inspect().map(e=>e.key),[text(2),text(3)]);assert.equal(owner.snapshot().evictions,1);
  const miss=owner.snapshot().misses;owner.convert(text(1));assert.equal(owner.snapshot().misses,miss+1);invariant(owner);owner.dispose();
});
test('combined key+output cap, exact boundary, oversized entry and empty caps',()=>{
  const a=text(1),cost=a.length+canonicalResult(a).length,owner=new DefineMemo(canonicalResult,{maxEntries:64,maxCodeUnits:cost});
  owner.convert(a);assert.equal(owner.snapshot().retainedCodeUnits,cost);
  const before=owner.inspect();const big=text(123456789);assert.equal(owner.convert(big),canonicalResult(big));assert.deepEqual(owner.inspect(),before);assert.equal(owner.snapshot().evictions,0);
  owner.convert(text(2));assert.equal(owner.snapshot().evictions,1);invariant(owner);owner.dispose();
  for(const limits of [{maxEntries:0,maxCodeUnits:1000},{maxEntries:64,maxCodeUnits:0}]){const none=new DefineMemo(canonicalResult,limits);none.convert(a);assert.equal(none.snapshot().retainedEntries,0);none.dispose()}
  for(const limits of [{maxEntries:-1},{maxEntries:1.5},{maxCodeUnits:Infinity},{maxCodeUnits:NaN}])assert.throws(()=>new DefineMemo(canonicalResult,limits),RangeError);
});
test('unknown, sorted, empty and oversized results never store or evict',()=>{
  const owner=new DefineMemo(canonicalResult);owner.convert(text(1));const entries=owner.inspect();
  const unknown=['', '#define A\n', '#define Z\n#define A 1+2\n', '#define Z\n#define A\n#define A\n', '#define Z\r\n', '#define Z\u2028\n', '#define GL_X 1\n', '#define A(x) x\n', '#define A 1e999\n', 'x'.repeat(32769)];
  for(const raw of unknown)for(let i=0;i<2;i++){assert.equal(owner.convert(raw),canonicalResult(raw));assert.deepEqual(owner.inspect(),entries);invariant(owner)}
  for(const block of blocks)assert.equal(owner.convert(block.canonical),block.canonical);
  assert.deepEqual(owner.inspect(),entries);owner.dispose();
});
test('prefix, numeric, reserved, mutated and near-limit differential corpus stays byte exact',()=>{
  const owner=new DefineMemo(canonicalResult);let seed=0x31415926;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const values=['',' 0',' -0',' +.5',' 1.',' 1e308',' 1e309',' 01',' 0x1',' B',' 1//x',' 1\t',' 1\u0000'];const names=['A','A0','A_','a','_','Z','GL_X','constructor','A__B','defined','Ä'];
  for(let i=0;i<2048;i++){let raw='';for(let j=0,n=1+random()%12;j<n;j++)raw+='#define '+names[random()%names.length]+values[random()%values.length]+'\n';assert.equal(owner.convert(raw),canonicalResult(raw));if(i%7===0)assert.equal(owner.convert(raw),canonicalResult(raw));invariant(owner)}
  const exact='#define Z\n#define '+'A'.repeat(32768-19)+'\n';assert.equal(exact.length,32768);assert.notEqual(owner.convert(exact),exact);assert.equal(owner.convert(exact),canonicalResult(exact));
  const rows=Array.from({length:1024},(_,i)=>'#define M'+(1024-i)+'\n').join('');for(const raw of [rows,rows+'#define EXTRA\n',exact.replace('Z','ZZ')])assert.equal(owner.convert(raw),canonicalResult(raw));invariant(owner);owner.dispose();
});
test('clear/dispose, independent owners, immutable caps and primitive retention',()=>{
  const a=new DefineMemo(canonicalResult),b=new DefineMemo(canonicalResult);a.convert(text(1));assert.equal(b.snapshot().retainedEntries,0);b.convert(text(2));a.clear();assert.equal(a.snapshot().retainedEntries,0);assert.equal(b.snapshot().retainedEntries,1);
  assert.throws(()=>{a.maxEntries=500},TypeError);assert.throws(()=>{a.maxCodeUnits=Infinity},TypeError);
  a.dispose();a.dispose();assert.equal(a.convert(text(3)),canonicalResult(text(3)));assert.equal(a.snapshot().retainedEntries,0);invariant(b);b.dispose();
});
test('getters, exact falsy throw identities and later mutation run even on hits',()=>{
  const owner=new DefineMemo(canonicalResult),Type=memoClass(owner),d=new Type();let reads=[],value='0.5';d._keys=['Z','A'];Object.defineProperty(d,'Z',{get(){reads.push('Z');return true}});Object.defineProperty(d,'A',{get(){reads.push('A');return value}});
  for(let i=0;i<3;i++){assert.equal(d.toString(),'#define A 0.5\n#define Z\n');assert.deepEqual(reads.splice(0),['Z','A'])}assert.equal(owner.snapshot().hits,2);
  value='1+2';assert.equal(d.toString(),'#define Z\n#define A 1+2\n');assert.deepEqual(reads.splice(0),['Z','A']);
  for(const error of [undefined,null,0,false,new Error('sentinel')]){const x=new Type();x._keys=['Z','A'];let reached=false;Object.defineProperty(x,'Z',{get(){throw error}});Object.defineProperty(x,'A',{get(){reached=true;return true}});const count=owner.snapshot().calls;let caught=false;try{x.toString()}catch(actual){caught=true;assert.equal(actual,error)}assert.ok(caught);assert.equal(reached,false);assert.equal(owner.snapshot().calls,count)}owner.dispose();
});
test('reentry has no provisional outer entry and uses completed exact raw strings',()=>{
  const owner=new DefineMemo(canonicalResult),Type=memoClass(owner),d=new Type();d._keys=['Z','A'];let nested=false,throwOuter=false,reads=[];const sentinel={message:'outer'};
  Object.defineProperty(d,'Z',{get(){reads.push('Z');if(nested)return 1;nested=true;try{assert.equal(d.toString(),'#define A 0.5\n#define Z 1\n')}finally{nested=false}if(throwOuter)throw sentinel;return 2}});Object.defineProperty(d,'A',{get(){reads.push('A');return '0.5'}});
  assert.equal(d.toString(),'#define A 0.5\n#define Z 2\n');assert.deepEqual(reads.splice(0),['Z','Z','A','A']);assert.equal(owner.snapshot().retainedEntries,2);
  assert.equal(d.toString(),'#define A 0.5\n#define Z 2\n');assert.equal(owner.snapshot().hits,2);assert.deepEqual(reads.splice(0),['Z','Z','A','A']);
  throwOuter=true;const entries=owner.inspect();assert.throws(()=>d.toString(),e=>e===sentinel);assert.deepEqual(reads,['Z','Z','A']);assert.deepEqual(owner.inspect(),entries);owner.dispose();
});
test('late keys and clone/equality remain controlled by the original class',()=>{
  const owner=new DefineMemo(canonicalResult),Type=memoClass(owner),make=C=>{const d=new C();d._keys=['Z','A'];Object.defineProperty(d,'Z',{get(){d._keys.push('LATE');d.LATE=1;return true}});d.A='0.5';return d;};const a=make(MaterialDefines),b=make(Type);
  for(let i=0;i<3;i++){assert.equal(b.toString(),a.toString());assert.deepEqual(b._keys,a._keys)}
  const c=new Type();c.Z=true;c.A=1;c.rebuild();const clone=new Type();c.cloneTo(clone);const before=c._keys.slice();c.toString();assert.ok(c.isEqual(clone));assert.deepEqual(c._keys,before);owner.dispose();
});
test('miss-only and cap-plus-one churn stay bounded and never return a different value',()=>{
  for(const count of [65,129]){const owner=new DefineMemo(canonicalResult);for(let cycle=0;cycle<3;cycle++)for(let i=0;i<count;i++){assert.equal(owner.convert(text(i)),canonicalResult(text(i)));invariant(owner)}assert.equal(owner.snapshot().hits,0);assert.ok(owner.snapshot().evictions>0);owner.dispose();}
});
