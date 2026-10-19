import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
const root=import.meta.dirname,results=[];
for(const p of ['assets','public','node_modules'])assert.equal(realpathSync(join(root,'reference',p)),realpathSync(join(root,'candidate-v1',p)),p+' same actual runtime input');
for(const run of ['a1','m1','a2']){
 const dir=join(root,'runs',run),s=JSON.parse(readFileSync(join(dir,'summary.json'))),b=JSON.parse(readFileSync(join(dir,'benchmark.json'))),rows=readFileSync(join(dir,'session.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse),records=rows.flatMap(x=>x.records??[]);
 assert.equal(rows[0].source.buildSnapshotId,s.source);assert.equal(b.sourceSnapshotId,s.source);assert.equal(records[0].seq,0);for(let i=1;i<records.length;i++)assert.equal(records[i].seq,records[i-1].seq+1);
 assert.equal(s.health,true);assert.equal(b.renderHealth.end.pendingOperations,0);assert.equal(s.avatars,1);assert.deepEqual(s.ambient,{buses:0,cars:0,passengers:0});assert.deepEqual(s.viewport,{height:650,width:1528});assert.deepEqual(s.renderResolution,{height:500,width:1175});assert.equal(s.quality,'low');assert.equal(s.lightingInstant,1792447200000);assert.equal(s.delta.shaderModule,0);assert.equal(s.delta.shaderPreparation,0);
 const rawFrames=records.filter(r=>r.kind==='frame-window').flatMap(r=>r.data.frameMs),ui=b.frameIntervalsMs.map(x=>Math.round(x*10)/10);let matches=0;for(let i=0;i<=rawFrames.length-ui.length;i++)if(ui.every((v,j)=>Math.abs(v-rawFrames[i+j])<0.001))matches++;assert.equal(matches,1,run+' complete UI/raw match');
 const mode=records.find(r=>r.kind==='mode-change'&&r.data.mode==='multi'),ready=records.find(r=>r.kind==='game-ready');assert.ok(mode&&ready&&ready.atMs>=mode.atMs);
 const lease=records.filter(r=>r.kind==='receiver-lease-summary');assert.equal(lease.length,run==='m1'?1:0);
 const browserStates=records.filter(r=>r.kind==='browser-state');assert.ok(browserStates.length>0);for(const state of browserStates){assert.equal(state.data.visibility,'visible');assert.equal(state.data.focused,true);}
 results.push({...s,startupModeToReadyMs:ready.atMs-mode.atMs,readyIdleMs:s.benchmarkStart[0].atMs-ready.atMs,uiRawMatches:matches,browserStates,leaseSummary:lease[0]?.data??null,weatherAtStart:b.weatherAtStart,weatherAtEnd:b.weatherAtEnd,gpu:Object.fromEntries(['before','after'].map(p=>[p,JSON.parse(readFileSync(join(dir,'gpu-'+p+'.json')))]))});
}
for(const r of results){assert.deepEqual(r.weatherAtStart,results[0].weatherAtStart);assert.deepEqual(r.weatherAtEnd,results[0].weatherAtEnd);}
const report={decision:'Do not integrate the range-only lease into native runtime: no demonstrated whole-production benefit. All three runs and clock/trajectory limits retained.',results,scope:'One uninstrumented A/M/A Low pilot, not statistical significance, Medium/2040x986/three-peer or image/shadow acceptance. M has one bounded existing-recorder summary, no detailed profiler. Source tests and runtime input identity are pinned.'};
writeFileSync(join(root,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(results.map(r=>({run:r.run,fps:r.fps,p95:r.p95,p99:r.p99,max:r.max,over100:r.over100,startupMs:r.startupModeToReadyMs,readyIdleMs:r.readyIdleMs,lease:r.leaseSummary})),null,2));
