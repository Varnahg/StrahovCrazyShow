import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
const original=fs.readFileSync(new URL('./preimages/materialDefines.js',import.meta.url),'utf8'),candidate=fs.readFileSync(new URL('./candidate/Materials/materialDefines.js',import.meta.url),'utf8');
const load=async(source,debug=false)=>import('data:text/javascript;base64,'+Buffer.from(source+(debug?'\nexport const inspectSchema = key => defineSchemas.get(key);':'')).toString('base64'));
const A=await load(original),F=await load(candidate,true);
function object(C,entries){const d=new C.MaterialDefines();for(const[k,v]of entries)Object.defineProperty(d,k,{value:v,writable:true,enumerable:true,configurable:true});d._keys=entries.map(([k])=>k);return d;}
const both=(entries)=>{const a=object(A,entries),f=object(F,entries);for(let i=0;i<3;i++)assert.equal(f.toString(),a.toString());return f;};
test('all nine previously captured actual material value blocks remain exact across cold/hot/value toggles',()=>{
 const corpus=JSON.parse(fs.readFileSync(new URL('./actual-blocks.json',import.meta.url)));assert.equal(corpus.blocks.length,9);
 for(const block of corpus.blocks){const a=object(A,Object.entries(block.values)),f=object(F,Object.entries(block.values));for(let i=0;i<4;i++){assert.equal(f.toString(),a.toString());if(i===1){a._keys.reverse();f._keys.reverse();}}}
});
test('actual finite numeric/string/false corpus and 4096 deterministic value/key mutations stay exact',()=>{
 const values=[true,false,null,undefined,0,-0,1,-1,Number.MIN_VALUE,Number.MAX_VALUE,.25,'0','-0','+1.00e-2','.5','1.','1e+2','1\n','1\r','1\n#define EXTRA 2','1e999','Infinity',NaN,Infinity,'','01',1n,Symbol('value'),{},()=>1];
 for(let i=0;i<4096;i++)both([['Z'+(i%13),values[i%values.length]],['A',values[(i*7+3)%values.length]],['M_'+(i%7),values[(i*11+1)%values.length]]]);
 const a=object(A,[['Z',1],['A',true]]),f=object(F,[['Z',1],['A',true]]);
 for(let i=0;i<1024;i++){a.Z=f.Z=values[i%values.length];if(i%5===0){a._keys.reverse();f._keys.reverse();}assert.equal(f.toString(),a.toString());}
});
test('hot schema skips canonical Set/sort yet retains no values/results and bounds names metadata',()=>{
 const f=object(F,[['Z',1],['A',true]]);f.toString();const schema=F.inspectSchema(f);assert.deepEqual(Object.keys(schema),['names','order','validNames']);assert.ok(Object.isFrozen(schema)&&Object.isFrozen(schema.names)&&Object.isFrozen(schema.order));
 let sorts=0;const prior=Array.prototype.sort;Array.prototype.sort=function(...args){sorts++;return Reflect.apply(prior,this,args);};try{f.Z=2;assert.equal(f.toString(),'#define A\n#define Z 2\n');assert.equal(sorts,0);}finally{Array.prototype.sort=prior;}
 const many=object(F,Array.from({length:1025},(_,i)=>['K'+i,true]));many.toString();assert.equal(F.inspectSchema(many),undefined);
 const long=object(F,[['Z',true],['A'.repeat(32768),true]]);long.toString();assert.equal(F.inspectSchema(long),undefined);
});
test('reserved/duplicate/opaque/multiline and exact limits use whole raw fallback',()=>{
 for(const name of ['A__B','GL_X','defined','constructor','WEBGPU','A\n#define B','Ä','A B','A\r','A\n'])both([['Z',true],[name,1]]);
 for(const value of ['1\n#define A 2','1\n','1\r\n','0x10','1u','1 // comment','1\t','+01'])both([['Z',value],['B',true]]);
 const a=object(A,[['Z',true],['A',1]]),f=object(F,[['Z',true],['A',1]]);a._keys=f._keys=['Z','A','Z'];assert.equal(f.toString(),a.toString());
 for(const size of [1024,1025])both(Array.from({length:size},(_,i)=>['M'+(size-i),true]));
 const exact='#define Z\n#define '+'A'.repeat(32768-19)+'\n';for(const text of [exact,exact.replace('Z','ZZ')]){const key=text.slice(8,-1);both([[key,true]]);}
});
function traced(C,mode){const trace=[],d=Object.create(C.MaterialDefines.prototype),keys=['Z','A'];let nested=false;
 Object.defineProperty(d,'_keys',{get(){trace.push('keys');return new Proxy(keys,{get(t,p,r){trace.push('key:'+String(p));return Reflect.get(t,p,r);}});}});
 Object.defineProperty(d,'Z',{get(){trace.push('Z');if(mode==='late'&&keys.length===2)keys.push('B');if(mode==='throw')throw false;if(mode==='reentry'&&!nested){nested=true;trace.push('nested:'+d.toString());nested=false;}return 1;}});
 Object.defineProperty(d,'A',{get(){trace.push('A');return true;}});Object.defineProperty(d,'B',{get(){trace.push('B');return -1;}});return{d,trace};}
test('exact mutable keys/getter/length access traces, falsy throw and same-instance reentrance',()=>{
 for(const mode of ['stable','late','throw','reentry']){const a=traced(A,mode),f=traced(F,mode);for(let i=0;i<3;i++){let av,fv,ae,fe;try{av=a.d.toString();}catch(e){ae=e;}try{fv=f.d.toString();}catch(e){fe=e;}assert.equal(fv,av);assert.equal(fe,ae);assert.deepEqual(f.trace,a.trace);a.trace.length=f.trace.length=0;}}
});
test('property key ToPropertyKey and inline formatting coercion preserve order and original throw identity',()=>{
 function specimen(C,throwAt=0){const trace=[],d=Object.create(C.MaterialDefines.prototype);let n=0;const failure={sentinel:true};const key={[Symbol.toPrimitive](hint){trace.push('coerce:'+hint+':'+(++n));if(n===throwAt)throw failure;return hint==='string'?'VALUE':'Z';}};d._keys=[key,'A'];Object.defineProperty(d,'VALUE',{get(){trace.push('value');return 7;}});Object.defineProperty(d,'A',{get(){trace.push('A');return true;}});return{d,trace,failure};}
 for(const at of [0,1,2]){const a=specimen(A,at),f=specimen(F,at);let ar,fr,ae,fe;try{ar=a.d.toString();}catch(e){ae=e;}try{fr=f.d.toString();}catch(e){fe=e;}assert.equal(fr,ar);if(at){assert.equal(ae,a.failure);assert.equal(fe,f.failure);}assert.deepEqual(f.trace,a.trace);}
 const s=Symbol('key');for(const value of [false,true]){const a=object(A,[[s,value]]),f=object(F,[[s,value]]);if(value){assert.throws(()=>a.toString(),TypeError);assert.throws(()=>f.toString(),TypeError);}else assert.equal(f.toString(),a.toString());}
});
test('cached names never bypass current values/getters, unsafe mutation or clone/reset equality',()=>{
 const a=object(A,[['Z',1],['A',true]]),f=object(F,[['Z',1],['A',true]]);f.toString();let n=0;const sentinel=new Error('getter');Object.defineProperty(f,'Z',{get(){n++;throw sentinel;}});assert.throws(()=>f.toString(),e=>e===sentinel);assert.equal(n,1);
 const f2=object(F,[['Z',1],['A',true]]),clone=new F.MaterialDefines();clone.Z=0;clone.A=false;clone.rebuild();f2.cloneTo(clone);assert.ok(f2.isEqual(clone));f2.toString();const before=Object.getOwnPropertyDescriptors(f2),keys=f2._keys.slice();f2.toString();assert.deepEqual(Object.getOwnPropertyDescriptors(f2),before);assert.deepEqual(f2._keys,keys);f2.reset();a.reset();assert.equal(f2.toString(),a.toString());
});
test('early partial-module empty call has no new TDZ; nonempty old TDZ and primitive receiver fallback persist',async()=>{
 const marker='// Project QA: bounded flat-literal serialization only.';
 for(const empty of [true,false])for(const[source,expected]of[[original,'a'],[candidate,'f']]){const inject=`globalThis.__early_${expected} = (()=>{const d=new MaterialDefines();${empty?'':"d.Z=1;d._keys=['Z'];"}try{return {result:d.toString()};}catch(e){return {error:e.name};}})();\n`;await load(source.replace(marker,inject+marker));}
 assert.equal(globalThis.__early_a.error,'ReferenceError');assert.equal(globalThis.__early_f.error,'ReferenceError');
 const emptyA=await load(original.replace(marker,"export const early = new MaterialDefines().toString();\n"+marker));const emptyF=await load(candidate.replace(marker,"export const early = new MaterialDefines().toString();\n"+marker));assert.equal(emptyA.early,'');assert.equal(emptyF.early,'');
 for(const value of [null,undefined,1,'s']){let a,f;try{Reflect.apply(A.MaterialDefines.prototype.toString,value,[]);}catch(e){a=e;}try{Reflect.apply(F.MaterialDefines.prototype.toString,value,[]);}catch(e){f=e;}assert.equal(f?.name,a?.name);assert.equal(f?.message,a?.message);}
});
