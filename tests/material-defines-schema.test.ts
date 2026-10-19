import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {pathToFileURL} from "node:url";
import {candidate, oracle} from "./fixtures/serializer-schema/installed.ts";
const A=(await import(pathToFileURL(oracle).href)).MaterialDefines,B=(await import(pathToFileURL(candidate).href)).MaterialDefines;
type Factory=(C:any,trace:string[],sentinel:Error)=>{o:any,before?:(n:number)=>void};
const cases:Array<{name:string,make:Factory}>=[];const add=(name:string,make:Factory)=>cases.push({name,make});
function basic(C:any,entries:Array<[PropertyKey,unknown]>){const o=new C();o._keys=entries.map(([k])=>k);for(const[k,v]of entries)Object.defineProperty(o,k,{value:v,writable:true,configurable:true,enumerable:true});return o;}
function exercise(C:any,make:Factory){const trace:string[]=[],sentinel=new Error('exact sentinel');const f=make(C,trace,sentinel),o=f.o,results=[];for(let n=0;n<3;n++){f.before?.(n);let value,error;try{value=C.prototype.toString.call(o);}catch(e){assert.ok(e instanceof Error);error={name:e.name,message:e.message,sentinel:e===sentinel};}results.push({value,error});}return{results,trace};}
for(const value of [true,false,null,undefined,0,-0,1,-1,1.25,1e21,NaN,Infinity,-Infinity,'','0','01','-0','+1','1.','1e+3','1\n','1\r','1\u2028','1\u2029','1\n#define A 2',0n,1n,Symbol('truthy')])add('literal '+String(value).replaceAll('\n','\\n'),C=>({o:basic(C,[['Z',value],['A',true]])}));
for(const key of ['A__B','GL_A','WEBGPU','defined','false','constructor','__proto__','toString','A\n#define B','Å'])add('unsafe key '+key,C=>({o:basic(C,[[key,1],['A',true]])}));
add('duplicate emitted and nonemitted names',C=>{const o=basic(C,[['Z',true],['A',1]]);o._keys=['Z','A','Z'];return{o,before:n=>{o.Z=n===1?false:true;}};});
add('same-length same-prefix key mutation must verify every index',C=>{const o=basic(C,[['C',3],['B',2],['A',1]]);return{o,before:n=>{o._keys=n===1?['C','A','B']:['C','B','A'];}};});
add('original keys getter/proxy access order', (C,trace)=>{const o=basic(C,[['B',2],['A',1]]),array=['B','A'];Object.defineProperty(o,'_keys',{configurable:true,get(){trace.push('keys');return new Proxy(array,{get(t,p){trace.push('array:'+String(p));if(p===Symbol.iterator)throw new Error('must not iterate');return Reflect.get(t,p);}});}});for(const k of array)Object.defineProperty(o,k,{configurable:true,get(){trace.push('value:'+k);return k==='A'?1:2;}});return{o};});
add('non-array length coercion and no constructor reads',(C,trace,sentinel)=>{const o=basic(C,[['B',2],['A',1]]);o._keys={0:'B',1:'A',length:{valueOf(){trace.push('length-coercion');return 2;}}};Object.defineProperty(o,'constructor',{get(){throw sentinel;}});return{o};});
add('property key coercion inline hints',(C,trace)=>{let calls=0;const prop={[Symbol.toPrimitive](hint:string){trace.push('key:'+hint);if(++calls%2===1)return 'Z';return 'A';}};const o=basic(C,[['Z',1],['B',2]]);o._keys=[prop,'B'];return{o};});
add('symbol key false is omitted without coercion',(C)=>{const symbol=Symbol('key'),o=basic(C,[[symbol,false],['A',1]]);return{o};});
add('symbol key true preserves concat TypeError',(C)=>{const symbol=Symbol('key'),o=basic(C,[[symbol,true],['A',1]]);return{o};});
add('truthy object value never coerced',(C,trace,sentinel)=>{const value={[Symbol.toPrimitive](){trace.push('unexpected-value-coercion');throw sentinel;}};return{o:basic(C,[['Z',value],['A',1]])};});
add('getter throw identity and order',(C,trace,sentinel)=>{const o=basic(C,[['B',2],['A',1]]);Object.defineProperty(o,'B',{get(){trace.push('B');throw sentinel;}});Object.defineProperty(o,'A',{get(){trace.push('A');return 1;}});return{o};});
add('getter changes following key array',(C,trace)=>{const o=basic(C,[['B',2],['C',3],['A',1]]);let n=0;o._keys=['A','B'];Object.defineProperty(o,'A',{get(){trace.push('A');o._keys=++n%2?['A','C']:['A','B'];return n;}});return{o};});
add('reentrant serializer with distinct inner shape',(C,trace)=>{const o=basic(C,[['B',2],['C',3],['A',1]]);let depth=0;o._keys=['B','A'];Object.defineProperty(o,'A',{get(){trace.push('A:'+depth);if(depth===0){const previous=o._keys;depth++;o._keys=['C','A'];try{trace.push('inner:'+C.prototype.toString.call(o));}finally{o._keys=previous;depth--;}}return depth+1;}});return{o};});
add('too many inactive names still canonicalizes small active block',C=>{const entries=Array.from({length:1025},(_,i):[PropertyKey,unknown]=>['K'+i,false]);entries.push(['Z',1],['A',1]);return{o:basic(C,entries)};});
add('combined-name bound does not truncate active tail',C=>{const entries=Array.from({length:900},(_,i):[PropertyKey,unknown]=>['LONG_INACTIVE_PROPERTY_'+i+'x'.repeat(25),false]);entries.push(['Z',1],['A',1]);return{o:basic(C,entries)};});
add('overlong numeric value preserves raw ordering',C=>({o:basic(C,[['Z','0.'+'0'.repeat(32770)],['A',1]])}));
function initializationProbe(file:string,empty:boolean){let source=readFileSync(file,'utf8').replace('export class MaterialDefines','class MaterialDefines');const marker='const MAX_CHARS =';assert.equal(source.split(marker).length,2);source=source.replace(marker,`let earlyResult;try { const early=new MaterialDefines();${empty?'':'early._keys=["A"];early.A=1;'}earlyResult={value:early.toString()}; } catch(error) {earlyResult={name:error.name,message:error.message};}\n`+marker);return new Function(source+'\nreturn earlyResult;')();}

test("schema fastpath preserves the52-case public serializer differential corpus",()=>{assert.equal(cases.length,52);for(const c of cases)assert.deepEqual(exercise(B,c.make),exercise(A,c.make),c.name);});
test("serializer preserves empty and nonempty partial-initialization boundaries",()=>{for(const empty of [true,false])assert.deepEqual(initializationProbe(candidate,empty),initializationProbe(oracle,empty));});
