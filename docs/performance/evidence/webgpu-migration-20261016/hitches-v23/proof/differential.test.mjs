import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as records from './variants/records-harness.mjs';
import * as lines from './variants/lines-harness.mjs';
import * as indexed from './variants/indexed-harness.mjs';
const variants={records,lines,indexed}, input=JSON.parse(fs.readFileSync(new URL('./actual-blocks.json',import.meta.url),'utf8'));
const compare=text=>{const expected=records.canonicalResult(text);for(const [name,variant]of Object.entries(variants))assert.equal(variant.canonicalResult(text),expected,name+' '+JSON.stringify(text).slice(0,160));};
const instance=(Module,values)=>{const d=new Module.MaterialDefines();Object.assign(d,values);d.rebuild();return d;};
test('actual material value blocks keep full and raw/helper outputs identical',()=>{
  for(const block of input.blocks){const raw=new records.RawMaterialDefines();Object.assign(raw,block.values);raw.rebuild();const text=raw.toString();compare(text);for(const module of Object.values(variants)){const d=instance(module,block.values),before=Object.getOwnPropertyDescriptors(d);assert.equal(d.toString(),block.expected);assert.equal(module.canonicalResult(text),block.expected);assert.deepEqual(Object.getOwnPropertyDescriptors(d),before);}}
});
test('unique ASCII identifier prefixes sort identically with absent or numeric values',()=>{
  const names=['A','A0','A00','A9','AA','AZ','A_','A_a','Z','_','_0','_A','_a','a','a0','aA','aZ','a_','aa','z'];
  for(let rotation=0;rotation<names.length;rotation++)for(const value of ['', ' -0',' +1.00e-2',' .5',' 1.']){
    const rows=names.slice(rotation).concat(names.slice(0,rotation)).map((name,index)=>'#define '+name+(index%2?value:'')+'\n');const text=rows.join('');compare(text);
    const expected=names.slice().sort().map(name=>rows.find(row=>row==='#define '+name+'\n'||row.startsWith('#define '+name+' '))).join('');assert.equal(lines.canonicalResult(text),expected);
  }
});
test('numeric edge spellings and every whole-block opaque fallback agree',()=>{
  const values=['0','-0','+0','1.','01','-01','.5','+.5','-.5','1e2','1E+2','1e-999','1e309','1e308','1.7976931348623157e308','1.7976931348623159e308','5e-324','0x1','1n','1u','Infinity','NaN','true','false','1+2','1/**/','1 //x','\\','1 ',' 1','1\t','1\r','1\u2028','1\u2029','1\u0085'];
  for(const value of values)compare('#define Z\n#define A '+value+'\n');
  for(const name of ['','0A','A-B','Ä','GL_A','A__B','defined','true','WEBGPU','WEBGL1','NATIVE','IS_NDC_HALF_ZRANGE','USE_REVERSE_DEPTHBUFFER','USE_EXACT_SRGB_CONVERSIONS',...Object.getOwnPropertyNames(Object.prototype)])compare('#define Z\n#define '+name+' 1\n');
  for(const suffix of ['#define A\n#define A\n','#define A\n#define A 1\n','#define A(x) x\n','#if A\n#define B\n#endif\n','#undef Z\n','#define A\n\n','#define A\r\n','#define A\u0000\n','#define A\uD800\n'])compare('#define Z\n'+suffix);
  for(const text of ['', '\n', '#define Z', '#define Z\r', '#define Z\n '])compare(text);
});
test('exact char and row bounds preserve fallback, including validation at final row',()=>{
  const rows=Array.from({length:1024},(_,i)=>'#define M'+(1024-i)+'\n').join('');compare(rows);compare(rows+'#define EXTRA\n');compare(rows+'#bad\n');
  const exact='#define Z\n#define '+'A'.repeat(32768-19)+'\n';assert.equal(exact.length,32768);for(const text of [exact,exact.replace('Z','ZZ'),exact.slice(0,-1),exact.slice(0,-2)+'!\n'])compare(text);
  assert.notEqual(lines.canonicalResult(exact),exact);assert.equal(lines.canonicalResult(exact.replace('Z','ZZ')),exact.replace('Z','ZZ'));
});
test('deterministic generated and mutated blocks match actual reference function',()=>{
  let seed=0x5a17c0de;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};const chars='AZ_az09';
  for(let i=0;i<4096;i++){const rows=[];for(let j=0,n=1+random()%24;j<n;j++){let name='AZ_az'[random()%5];for(let k=0,m=random()%7;k<m;k++)name+=chars[random()%chars.length];rows.push('#define '+name+(random()%3?' '+['0','-1','+.5','1e-9','01','1e999'][random()%6]:'')+'\n');}const text=rows.join('');compare(text);if(i%4===0){const at=random()%text.length;compare(text.slice(0,at)+['\r','\t','\n','/',' ','(', '\u2028'][random()%7]+text.slice(at+1));}}
});
test('same original getters, late key mutation and falsy throws remain observable',()=>{
  for(const module of Object.values(variants)){
    const d=new module.MaterialDefines(),reads=[];d._keys=['Z','A'];Object.defineProperty(d,'Z',{get(){reads.push('Z');d._keys.push('LATE');d.LATE=1;return true;}});Object.defineProperty(d,'A',{get(){reads.push('A');return '0.5';}});assert.equal(d.toString(),'#define A 0.5\n#define LATE 1\n#define Z\n');assert.deepEqual(reads,['Z','A']);assert.deepEqual(d._keys,['Z','A','LATE']);
    for(const error of [undefined,null,0,false,new Error('sentinel')]){const e=new module.MaterialDefines();e._keys=['Z','A'];let reached=false;Object.defineProperty(e,'Z',{get(){throw error;}});Object.defineProperty(e,'A',{get(){reached=true;return true;}});let caught=false;try{e.toString();}catch(actual){caught=true;assert.equal(actual,error);}assert.ok(caught);assert.equal(reached,false);}
  }
});
