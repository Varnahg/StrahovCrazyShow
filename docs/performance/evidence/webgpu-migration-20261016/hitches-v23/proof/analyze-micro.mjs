import fs from 'node:fs';
import assert from 'node:assert/strict';
import { RawMaterialDefines } from './variants/records-harness.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url),'utf8'));
const stats=xs=>{const a=[...xs].sort((a,b)=>a-b),i=a.length>>1;return{n:a.length,min:a[0],median:a.length%2?a[i]:(a[i-1]+a[i])/2,max:a.at(-1)};};
const summary={scope:'pure Node micro benchmark; independent non-additive raw/helper/full scopes, no renderer or production extrapolation',variants:{}};
for(const variant of ['records','lines','indexed']){const runs=read('micro-runs.json').records.filter(r=>r.variant===variant);summary.variants[variant]={perRun:runs.map(r=>{const x=read(`micro-${r.run}-${variant}.json`);return{run:r.run,phases:Object.fromEntries(['raw','helper','full'].map(phase=>[phase,stats(x.samples.filter(s=>s.phase===phase).map(s=>s.msPerCall))]))};}),perKind:Object.fromEntries(['pbr','standard','surface'].map(kind=>[kind,Object.fromEntries(['raw','helper','full'].map(phase=>[phase,stats(runs.flatMap(r=>read(`micro-${r.run}-${variant}.json`).samples.filter(s=>s.phase===phase&&s.kind===kind).map(s=>s.msPerCall)))]))]))};}
const corpus=read('actual-raw-corpus.json'),blocks=read('actual-blocks.json').blocks;let exactRecordedRaw=0;
for(const b of blocks){const d=new RawMaterialDefines();Object.assign(d,b.values);d.rebuild();if(corpus.records.some(row=>row.text===d.toString()))exactRecordedRaw++;}
summary.corpus={calls:corpus.calls,unique:corpus.unique,omitted:corpus.omitted,retainedBytesUtf16:corpus.retainedBytesUtf16,exactRecordedRawOf9:exactRecordedRaw,frequencyOnlyBestPossibleReuseFraction:(corpus.calls-corpus.unique)/corpus.calls,note:'Upper bound with all9 keys retained, NOT bounded LRU hitrate or game hitrate. No sequence retained; input+output text payload can approach twice raw bytes plus JS/Map overhead; real scenes/material histories absent.'};
fs.writeFileSync(new URL('micro-summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
