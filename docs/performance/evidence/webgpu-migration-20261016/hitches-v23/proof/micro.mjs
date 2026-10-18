import fs from 'node:fs';
import assert from 'node:assert/strict';
const [variant,run]=process.argv.slice(2);assert.ok(['records','lines','indexed'].includes(variant));
const module=await import('./variants/'+variant+'-harness.mjs'),source=JSON.parse(fs.readFileSync(new URL('./actual-blocks.json',import.meta.url),'utf8'));
const blocks=source.blocks.map(block=>{const d=new module.MaterialDefines(),raw=new module.RawMaterialDefines();Object.assign(d,block.values);Object.assign(raw,block.values);d.rebuild();raw.rebuild();const text=raw.toString();assert.equal(d.toString(),block.expected);assert.equal(module.canonicalResult(text),block.expected);return{...block,d,raw,text};});
let checksum=0;const call=(phase,b)=>phase==='raw'?b.raw.toString():phase==='helper'?module.canonicalResult(b.text):b.d.toString();
for(let i=0;i<100;i++)for(const b of blocks)for(const phase of ['raw','helper','full'])checksum^=call(phase,b).length;
const samples=[],phases=['raw','helper','full'],startedAt=new Date().toISOString(),loops=256;
for(let batch=0;batch<5;batch++)for(let offset=0;offset<3;offset++){const phase=phases[(batch+offset+Number(run))%3];for(const b of blocks){const start=performance.now();for(let i=0;i<loops;i++)checksum^=call(phase,b).length;const durationMs=performance.now()-start;samples.push({batch,phase,kind:b.kind,state:b.state,calls:loops,totalMs:durationMs,msPerCall:durationMs/loops});}}
const result={variant,run,node:process.version,startedAt,finishedAt:new Date().toISOString(),loops,samples,checksum,limit:'Synchronous Node pure-function/actual class microbenchmark on recorded material value blocks; no GPU or production speedup claim'};
fs.writeFileSync(new URL(`micro-${run}-${variant}.json`,import.meta.url),JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({variant,run,samples:samples.length,checksum}));
