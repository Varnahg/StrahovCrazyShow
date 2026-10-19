import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {SourceMap} from 'node:module';
import {createHash} from 'node:crypto';
const root=import.meta.dirname, run=resolve(root,process.argv[2]??'run-01');
assert(run.startsWith(root+'/')||run.startsWith(root+'\\'));
const dist=join(root,'snapshot/dist'), hash=b=>createHash('sha256').update(b).digest('hex');
const cpu=JSON.parse(readFileSync(join(run,'cpu-profile.json'))),ui=JSON.parse(readFileSync(join(run,'benchmark.json'))),t=cpu.trace;
const expected=JSON.parse(readFileSync(join(root,'dist-manifest.json'))),identity=JSON.parse(readFileSync(join(root,'build-identity.json')));
assert.equal(cpu.status,'captured');assert.equal(cpu.reason,'benchmark-end');assert.equal(cpu.sampleInterval,16);
assert(t.samples.length>0&&t.samples.length<=2000);assert(cpu.stoppedAtMs>cpu.startedAtMs);assert.equal(ui.sourceSnapshotId,identity.source);
const batches=readFileSync(join(run,'session.jsonl'),'utf8').trim().split(/\r?\n/).map(s=>JSON.parse(s));
const records=batches.flatMap(b=>b.records??[]);assert(records.length>0);
for(let i=1;i<records.length;i++)assert.equal(records[i].seq,records[i-1].seq+1,'Raw sequence gap');
// Recorder estimates origin as Date.now()-performance.now(), while sampler uses
// performance.timeOrigin. Compare their provenance with a bounded tolerance;
// all event/sample brackets below use the same performance.now() realm directly.
const recorderOrigin=records.find(r=>r.kind==='session-start').data.timeOrigin;
const originDeltaMs=recorderOrigin-cpu.timeOrigin;
assert(Math.abs(originDeltaMs)<=5,'Recorder estimated origin differs materially');
for(const b of batches)if(b.source)assert.equal(b.source.buildSnapshotId,identity.source);
const maps=new Map(),bundleChecks={};
const frames=t.frames.map(frame=>{
 const resource=t.resources[frame.resourceId];if(!resource||!frame.line||!frame.column)return{...frame,resource,mapped:false};
 const url=new URL(resource);if(url.origin!=='http://127.0.0.1:4206')return{...frame,resource,mapped:false};
 const file=url.pathname.slice(1);if(!expected[file]||!expected[file+'.map'])return{...frame,resource,mapped:false};
 if(!maps.has(file)){const js=readFileSync(join(dist,file)),b=readFileSync(join(dist,file+'.map'));assert.equal(hash(js),expected[file]);assert.equal(hash(b),expected[file+'.map']);bundleChecks[file]={js:hash(js),map:hash(b)};maps.set(file,new SourceMap(JSON.parse(b)));}
 const e=maps.get(file).findEntry(frame.line-1,frame.column-1);
 return{...frame,resource,mapped:!!e.originalSource,source:e.originalSource,originalName:e.name,lineOriginal:e.originalLine+1,columnOriginal:e.originalColumn+1};
});
function chain(s){const ids=[],seen=new Set();let id=s.stackId;while(id!==undefined){assert(Number.isInteger(id)&&id>=0&&id<t.stacks.length&&!seen.has(id));seen.add(id);const f=t.stacks[id];assert(Number.isInteger(f.frameId)&&frames[f.frameId]);ids.push(f.frameId);id=f.parentId;}return ids;}
for(let i=0;i<t.samples.length;i++){const s=t.samples[i];assert(Number.isFinite(s.timestamp));if(i)assert(s.timestamp>=t.samples[i-1].timestamp);chain(s);}
function rank(samples){const leaf=new Map(),inclusive=new Map(),stacks=new Map();let withoutStack=0;for(const s of samples){const ids=chain(s);if(!ids.length){withoutStack++;continue;}for(const id of new Set(ids))inclusive.set(id,(inclusive.get(id)??0)+1);leaf.set(ids[0],(leaf.get(ids[0])??0)+1);const key=ids.join(',');stacks.set(key,(stacks.get(key)??0)+1);}const ranked=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([id,samples])=>({samples,frame:frames[id]}));return{samples:samples.length,withoutStack,leaf:ranked(leaf),inclusive:ranked(inclusive),stacks:[...stacks].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([key,samples])=>({samples,frames:key.split(',').map(Number).map(id=>frames[id])}))};}
const inCapture=r=>r.atMs>=cpu.startedAtMs&&r.atMs<=cpu.stoppedAtMs;
const phases=['skyWeather','artLighting','carLighting','vehicleLighting','flashlight','vegetation','transit','precipitation','surfaces','cinematic'];
const environments=records.filter(r=>r.kind==='environment-work'&&inCapture(r)).map(r=>{const d=r.data;let start=d.startedAtMs;return{seq:r.seq,...d,phaseSamples:phases.map(phase=>{const end=start+d.phasesMs[phase],selected=t.samples.filter(s=>s.timestamp>=start&&s.timestamp<end),out={phase,start,end,profile:rank(selected)};start=end;return out;})};});
const gaps=t.samples.slice(1).map((s,i)=>s.timestamp-t.samples[i].timestamp).sort((a,b)=>a-b);
const result={source:identity.source,sessionId:batches.find(b=>b.sessionId)?.sessionId,records:records.length,capture:{id:cpu.id,timeOrigin:cpu.timeOrigin,recorderEstimatedOrigin:recorderOrigin,originDeltaMs,startedAtMs:cpu.startedAtMs,stoppedAtMs:cpu.stoppedAtMs,samples:t.samples.length},interval:{requestedMs:cpu.sampleInterval,min:gaps[0],median:gaps[Math.floor(gaps.length/2)],max:gaps.at(-1),belowHalf:gaps.filter(v=>v<8).length},benchmark:ui,bundleChecks,environments,hitches:records.filter(r=>r.kind==='frame-hitch'&&inCapture(r)),wholeCapture:rank(t.samples),frames,scope:'Best-effort JS stack presence only. Counts or counts times requested interval are NOT duration or CPU share. Stackless samples do not identify idle, GC or GPU. Source coordinates identify function definitions, not instruction pointers. Diagnostic build/profile overhead; not plain FPS A/B.'};
writeFileSync(join(run,'cpu-summary.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({source:result.source,capture:result.capture,interval:result.interval,environmentCount:environments.length,wholeCapture:result.wholeCapture.leaf.slice(0,15),bundleChecks},null,2));
