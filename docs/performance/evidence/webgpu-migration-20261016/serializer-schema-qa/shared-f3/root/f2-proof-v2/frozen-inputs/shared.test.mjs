import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
const text=fs.readFileSync(new URL('./candidate/Materials/materialDefines.js',import.meta.url),'utf8');const debug=text+'\nexport const inspectSchema = key=>defineSchemas.get(key); export const inspectInterns = ()=>({entries:defineSchemaInterns.slice(),units:defineSchemaInternUnits});';
const F=await import('data:text/javascript;base64,'+Buffer.from(debug).toString('base64'));
const fresh=(names=['Z','A'],value=1)=>{const d=new F.MaterialDefines();d._keys=names.slice();for(const n of names)d[n]=value;return d;};
function accounting(){const x=F.inspectInterns();assert.ok(x.entries.length<=32);assert.equal(x.units,x.entries.reduce((n,e)=>n+e.units,0));assert.ok(x.units<=262144);for(const e of x.entries){assert.ok(Object.isFrozen(e)&&Object.isFrozen(e.schema)&&Object.isFrozen(e.schema.names)&&Object.isFrozen(e.schema.order));assert.deepEqual(Object.keys(e.schema),['names','order','validNames']);assert.ok(e.schema.names.length<=1024);assert.equal(e.units,e.schema.names.reduce((n,k)=>n+k.length,0));assert.ok(e.units<=32768);assert.ok(e.schema.names.every(n=>typeof n==='string'));}return x;}
test('fresh instances share only identical complete immutable name schemas and skip repeated full canonical sorts',()=>{
 const a=fresh(),b=fresh();a.toString();const first=F.inspectSchema(a);let sorts=0;const previous=Array.prototype.sort;Array.prototype.sort=function(...args){sorts++;return Reflect.apply(previous,this,args);};try{b.toString();assert.equal(sorts,0);assert.equal(F.inspectSchema(b),first);}finally{Array.prototype.sort=previous;}
 const permuted=fresh(['A','Z']);permuted.toString();assert.notEqual(F.inspectSchema(permuted),first,'Ordered observed sequence must match, not just a set');
 const changed=fresh(['Z','AA']);changed.toString();assert.notEqual(F.inspectSchema(changed),first);accounting();
});
test('index count and combined-name-unit bounds, FIFO churn and still-live weak pointers are honest',()=>{
 const kept=[];for(let i=0;i<80;i++){const d=fresh(['COMMON','LAST_'+i]);d.toString();kept.push(d);accounting();}
 const old=F.inspectSchema(kept[0]);assert.ok(old);assert.ok(!F.inspectInterns().entries.some(e=>e.schema===old));assert.equal(kept[0].toString(),'#define COMMON 1\n#define LAST_0 1\n');assert.equal(F.inspectSchema(kept[0]),old,'Eviction does not invalidate a live weak-key pointer');
 for(let i=0;i<20;i++){const d=fresh(['K'+i+'X'.repeat(16000),'A']);d.toString();kept.push(d);accounting();}
 assert.ok(F.inspectInterns().entries.length<32,'Name-unit limit exercised');assert.ok(kept.map(d=>F.inspectSchema(d)).filter(Boolean).length>32,'Strong-index bound is not a total live-schema/heap bound');
});
test('unsafe/duplicate/object/late-key paths remain fallback and add no constructor or keys reads',()=>{
 const sentinel=new Error('constructor must not read'),a=fresh();Object.defineProperty(a,'constructor',{get(){throw sentinel;}});assert.doesNotThrow(()=>a.toString());
 const b=fresh();b.toString();b.Z='1\n#define EXTRA 2';assert.equal(b.toString(),'#define A 1\n#define EXTRA 2\n#define Z 1\n');
 const repeated=fresh(['Z','Z']);repeated.toString();assert.equal(F.inspectSchema(repeated),undefined);accounting();
});
test('same-instance nested calls cannot publish fragments/values or corrupt outer shared lookup',()=>{
 const d=new F.MaterialDefines();d._keys=['Z','A'];d.A=1;let nested=false,reads=0;Object.defineProperty(d,'Z',{get(){reads++;if(!nested){nested=true;assert.equal(d.toString(),'#define A 1\n#define Z 2\n');nested=false;}return 2;}});
 for(let i=0;i<3;i++)assert.equal(d.toString(),'#define A 1\n#define Z 2\n');assert.equal(reads,6);const schema=F.inspectSchema(d);assert.deepEqual(Object.keys(schema),['names','order','validNames']);accounting();
});
