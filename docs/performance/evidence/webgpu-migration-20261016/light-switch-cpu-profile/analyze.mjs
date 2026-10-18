import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {SourceMap} from 'node:module';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,run=join(root,'run-01'),dist=join(root,'candidate-v2/dist'),hash=b=>createHash('sha256').update(b).digest('hex');
const cpu=JSON.parse(readFileSync(join(run,'cpu-profile.json'))),ui=JSON.parse(readFileSync(join(run,'benchmark.json'))),t=cpu.trace;
assert.equal(cpu.status,'captured');assert.equal(cpu.reason,'benchmark-end');assert.equal(cpu.sampleInterval,16);assert.ok(t.samples.length>0&&t.samples.length<=2000);assert.ok(cpu.stoppedAtMs>cpu.startedAtMs);
const records=readFileSync(join(run,'session.jsonl'),'utf8').trim().split(/\r?\n/).flatMap(line=>JSON.parse(line).records??[]);
assert.ok(records.length>0);for(let i=1;i<records.length;i++)assert.equal(records[i].seq,records[i-1].seq+1,'Raw sequence gap');
const expected=JSON.parse(readFileSync(join(root,'v2-dist-manifest.json'))),maps=new Map(),bundleChecks={};
function mapFrame(frame){
 const resource=t.resources[frame.resourceId];if(!resource||!frame.line||!frame.column)return{...frame,resource,mapped:false};
 const url=new URL(resource);if(url.origin!=='http://127.0.0.1:4200')return{...frame,resource,mapped:false};
 const file=url.pathname.slice(1);if(!expected[file]||!expected[file+'.map'])return{...frame,resource,mapped:false};
 if(!maps.has(file)){
  const js=readFileSync(join(dist,file)),b=readFileSync(join(dist,file+'.map'));assert.equal(hash(js),expected[file]);assert.equal(hash(b),expected[file+'.map']);bundleChecks[file]={js:hash(js),map:hash(b)};maps.set(file,new SourceMap(JSON.parse(b)));
 }
 const entry=maps.get(file).findEntry(frame.line-1,frame.column-1);
 return{...frame,resource,mapped:!!entry.originalSource,source:entry.originalSource,originalName:entry.name,lineOriginal:entry.originalLine+1,columnOriginal:entry.originalColumn+1};
}
const frames=t.frames.map(mapFrame);
function chain(sample){
 const result=[],seen=new Set();let id=sample.stackId;
 while(id!==undefined){assert.ok(Number.isInteger(id)&&id>=0&&id<t.stacks.length);assert.ok(!seen.has(id),'Stack cycle');seen.add(id);const s=t.stacks[id];assert.ok(Number.isInteger(s.frameId)&&frames[s.frameId]);result.push(s.frameId);id=s.parentId;}
 return result;
}
for(let i=0;i<t.samples.length;i++){const s=t.samples[i];assert.ok(Number.isFinite(s.timestamp));if(i)assert.ok(s.timestamp>=t.samples[i-1].timestamp);chain(s);}
function rank(samples){
 const inclusive=new Map(),leaf=new Map(),stacks=new Map();let withoutStack=0;
 for(const sample of samples){const ids=chain(sample);if(!ids.length){withoutStack++;continue;}for(const id of new Set(ids))inclusive.set(id,(inclusive.get(id)??0)+1);leaf.set(ids[0],(leaf.get(ids[0])??0)+1);const key=ids.join(',');stacks.set(key,(stacks.get(key)??0)+1);}
 const ranked=m=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([id,samples])=>({samples,frame:frames[id]}));
 return{samples:samples.length,withoutStack,leaf:ranked(leaf),inclusive:ranked(inclusive),stacks:[...stacks].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([key,samples])=>({samples,frames:key.split(',').map(id=>frames[Number(id)])}))};
}
const switches=records.filter(r=>r.kind==='light-switch-mesh-sample').map(r=>{
 const start=r.data.atMs,end=r.atMs;assert.ok(end>=start);const selected=t.samples.filter(s=>s.timestamp>=start&&s.timestamp<=end);
 return{seq:r.seq,reason:r.data.timing.reason,start,end,bracketMs:end-start,mainDrawCpuMs:r.data.timing.mainDrawCpuMs,completed:r.data.timing.completed,counts:r.data.timing.counts,profile:rank(selected)};
});
const gaps=t.samples.slice(1).map((s,i)=>s.timestamp-t.samples[i].timestamp),sortedGaps=[...gaps].sort((a,b)=>a-b);
const intervalEvidence={requestedMs:cpu.sampleInterval,minGapMs:sortedGaps[0],medianGapMs:sortedGaps[Math.floor(sortedGaps.length/2)],maxGapMs:sortedGaps.at(-1),gapsBelowHalfInterval:gaps.filter(x=>x<cpu.sampleInterval/2).length,note:'Observed samples are not uniformly spaced: counts and count×16ms must not be interpreted as CPU duration or a percentage of CPU time.'};
const timelines=switches.map(w=>({reason:w.reason,start:w.start,end:w.end,samples:t.samples.filter(s=>s.timestamp>=w.start&&s.timestamp<=w.end).map(s=>({atMs:s.timestamp,relativeMs:s.timestamp-w.start,frames:chain(s).map(id=>frames[id])}))}));
const result={source:ui.sourceSnapshotId,records:records.length,capture:{id:cpu.id,timeOrigin:cpu.timeOrigin,startedAtMs:cpu.startedAtMs,stoppedAtMs:cpu.stoppedAtMs,interval:cpu.sampleInterval,samples:t.samples.length},intervalEvidence,benchmark:{fps:ui.averageFps,p95:ui.p95FrameMs,p99:ui.p99FrameMs,max:Math.max(...ui.frameIntervalsMs),over100:ui.frameIntervalsMs.filter(x=>x>=100).length,viewport:ui.viewport,renderResolution:ui.renderResolution,avatars:ui.avatars,ambient:ui.ambient,health:ui.renderHealth,renderer:ui.renderer},bundleChecks,switches,timelines,wholeCapture:rank(t.samples),frames,scope:'Observed JS CPU stacks; observer/profiler/policy overhead, irregular sample intervals. Event brackets span light-switch sample begin through export, not exact per-mesh preparation intervals. Stack counts are presence/frequency evidence, never CPU duration/share. No GPU/idle inference from missing samples, no clean FPS A/B claim.'};
writeFileSync(join(run,'cpu-summary.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({capture:result.capture,switches:switches.map(s=>({reason:s.reason,bracketMs:s.bracketMs,completed:s.completed,samples:s.profile.samples,leaf:s.profile.leaf.slice(0,4),inclusive:s.profile.inclusive.slice(0,5)}))},null,2));
