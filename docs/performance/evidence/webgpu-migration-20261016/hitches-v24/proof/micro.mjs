import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{DefineMemo}from'./memo-owner.mjs';import{RawMaterialDefines,canonicalResult}from'./reference-harness.mjs';
import{beginOwner,endOwner}from'./owner-control.mjs';
const [mode,run]=process.argv.slice(2);assert.ok(['reference','memo'].includes(mode));assert.match(run,/^[0-9]{2}$/);
const Module=await import('./modules-v2/'+mode+'.mjs'),originalBlocks=JSON.parse(fs.readFileSync(new URL('mixed-blocks.json',import.meta.url))).blocks;
const hash=x=>createHash('sha256').update(x).digest('hex');let seed=0x5a17c0de;const random=()=>seed=(Math.imul(seed,1664525)+1013904223)>>>0;
const mixed=originalBlocks.map(b=>({...b}));for(let i=mixed.length-1;i>0;i--){const j=random()%(i+1);[mixed[i],mixed[j]]=[mixed[j],mixed[i]];}
const unique=Array.from({length:129},(_,i)=>{const b=mixed[i%mixed.length];return{...b,text:b.text+`#define MEMO_PROOF_VALUE ${i}\n`,values:{...b.values,MEMO_PROOF_VALUE:i},canonical:canonicalResult(b.text+`#define MEMO_PROOF_VALUE ${i}\n`)}});
function make(Type,b){const d=new Type();Object.assign(d,b.values);const active=b.text.trimEnd().split('\n').map(x=>x.split(' ')[1]);d._keys=[...active,...Object.keys(d).filter(k=>!k.startsWith('_')&&!active.includes(k))];return d;}
const report={mode,run,startedAt:new Date().toISOString(),scope:'Independent raw/helper/full Node scopes; baseline captured values with active order reconstructed, false keys appended. Mixed/churn ordering synthetic, not production hitrate. Full rebuilds raw string each call.',workloads:[]};
const phases=['raw','helper','full'];const shift=Number(run)%3;phases.push(...phases.splice(0,shift));
let checksum=0;
for(const [name,blocks,repetitions,cold]of [['mixed-warm',mixed,16,false],['mixed-cold',mixed,8,true],['cap-plus-churn',unique,4,false]]){
 const row={name,blocks:blocks.length,codeUnits:blocks.reduce((n,b)=>n+b.text.length,0),inputSha:hash(blocks.map(b=>b.text).join('\0')),repetitions,phases:[]};report.workloads.push(row);
 for(const phase of phases){
  const owner=phase==='full'?beginOwner():new DefineMemo(canonicalResult),instances=blocks.map(b=>make(phase==='raw'?RawMaterialDefines:Module.MaterialDefines,b));
  const call=(i)=>phase==='raw'?instances[i].toString():phase==='helper'?(mode==='memo'?owner.convert(blocks[i].text):canonicalResult(blocks[i].text)):instances[i].toString();
  try{
   for(let i=0;i<blocks.length;i++){assert.equal(Reflect.apply(RawMaterialDefines.prototype.toString,instances[i],[]),blocks[i].text);assert.equal(call(i),phase==='raw'?blocks[i].text:canonicalResult(blocks[i].text));}
   owner.clear();
   // Warmup is explicit and not a measurement. Cold batches clear each sweep;
   // warm/churn keep their own bounded owner after this setup.
   for(let j=0;j<2;j++)for(let i=0;i<blocks.length;i++)checksum+=call(i).length;
   const before=owner.snapshot(),batches=[];
   for(let batch=0;batch<5;batch++){
    const start=performance.now();
    for(let iteration=0;iteration<repetitions;iteration++){if(cold)owner.clear();for(let i=0;i<blocks.length;i++)checksum+=call(i).length;}
    batches.push({calls:blocks.length*repetitions,ms:performance.now()-start});
   }
   row.phases.push({phase,batches,before,after:owner.snapshot()});
  }finally{if(phase==='full')endOwner(owner);else owner.dispose();assert.equal(owner.snapshot().retainedCodeUnits,0);assert.equal(owner.snapshot().retainedEntries,0)}
 }
}
// All unique values per sweep, beyond both caps: no predicted hot working set.
const edgeOwner=new DefineMemo(canonicalResult),edgeRows=[];for(const name of ['unknown','near-limit','unique-misses']){
 const blocks=name==='unknown'?Array.from({length:40},(_,i)=>`#define Z\n#define A ${i}+2\n`):name==='near-limit'?[`#define Z\n#define ${'A'.repeat(32768-19)}\n`]:Array.from({length:129},(_,i)=>`#define Z ${i}\n#define A\n`);
 edgeOwner.clear();const before=edgeOwner.snapshot(),samples=[];
 for(let batch=0;batch<5;batch++){const start=performance.now();for(let i=0;i<blocks.length;i++){const raw=name==='unique-misses'?blocks[i].replace(`Z ${i}`,`Z ${batch*129+i}`):blocks[i];checksum+=(mode==='memo'?edgeOwner.convert(raw):canonicalResult(raw)).length;}samples.push({calls:blocks.length,ms:performance.now()-start});}
 edgeRows.push({name,samples,before,after:edgeOwner.snapshot()});
}
edgeOwner.dispose();report.edgeHelpers=edgeRows;report.checksum=checksum;report.finishedAt=new Date().toISOString();assert.ok(checksum>0);
fs.writeFileSync(new URL(`micro-${run}-${mode}.json`,import.meta.url),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({mode,run,workloads:report.workloads.map(w=>({name:w.name,phases:w.phases.map(p=>({phase:p.phase,ms:p.batches.reduce((n,b)=>n+b.ms,0)}))}))}));
