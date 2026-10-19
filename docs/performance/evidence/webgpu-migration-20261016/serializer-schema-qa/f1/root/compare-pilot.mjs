import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
const root=import.meta.dirname,results=[];
for(const p of ['assets','public'])assert.equal(realpathSync(join(root,'reference',p)),realpathSync(join(root,'candidate-v1',p)));
for(const run of ['a1','m1','a2','m2','a3']){
 const dir=join(root,'runs',run),s=JSON.parse(readFileSync(join(dir,'summary.json'))),b=JSON.parse(readFileSync(join(dir,'benchmark.json'))),rows=readFileSync(join(dir,'session.jsonl'),'utf8').trim().split(/\r?\n/).map(JSON.parse),records=rows.flatMap(x=>x.records??[]);
 assert.equal(rows[0].source.buildSnapshotId,s.source);assert.equal(b.sourceSnapshotId,s.source);assert.equal(records[0].seq,0);for(let i=1;i<records.length;i++)assert.equal(records[i].seq,records[i-1].seq+1);
 assert.equal(s.health,true);assert.equal(b.renderHealth.end.pendingOperations,0);assert.equal(s.avatars,1);assert.deepEqual(s.viewport,{height:650,width:1528});assert.deepEqual(s.renderResolution,{height:500,width:1175});assert.equal(s.quality,'low');assert.equal(s.lightingInstant,1792447200000);assert.equal(s.delta.shaderModule,0);assert.equal(s.delta.shaderPreparation,0);
 const expectedAmbient={buses:0,cars:0,passengers:run==='m1'?2:0};assert.deepEqual(s.ambient,expectedAmbient);
 const flat=records.filter(r=>r.kind==='frame-window').flatMap(r=>r.data.frameMs),ui=b.frameIntervalsMs.map(x=>Math.round(x*10)/10);let matches=0;for(let i=0;i<=flat.length-ui.length;i++)if(ui.every((v,j)=>Math.abs(v-flat[i+j])<0.001))matches++;assert.equal(matches,1,run+' complete UI/raw match');
 const mode=records.find(r=>r.kind==='mode-change'&&r.data.mode==='multi'),ready=records.find(r=>r.kind==='game-ready'),start=s.benchmarkStart[0].atMs;assert.ok(mode&&ready&&ready.atMs>=mode.atMs);
 const browserStates=records.filter(r=>r.kind==='browser-state');assert.ok(browserStates.length);for(const r of browserStates){assert.equal(r.data.visibility,'visible');assert.equal(r.data.focused,true);}
 const hitches=records.filter(r=>r.kind==='frame-hitch'&&r.atMs>=start&&r.atMs<start+10500).map(r=>({atMs:r.atMs-start,frameMs:r.data.frameMs,previousFrame:r.data.previousFrame,currentCpuMs:r.data.currentCpuMs}));
 results.push({...s,comparable:run!=='m1',exclusion:run==='m1'?'Two simulated passengers versus zero in all controls; preserved, not used as same-load evidence.':null,startupModeToReadyMs:ready.atMs-mode.atMs,readyIdleMs:start-ready.atMs,uiRawMatches:matches,browserStates,hitches,weatherAtStart:b.weatherAtStart,weatherAtEnd:b.weatherAtEnd,gpu:Object.fromEntries(['before','after'].map(p=>[p,JSON.parse(readFileSync(join(dir,'gpu-'+p+'.json')))]))});
}
for(const r of results){assert.deepEqual(r.weatherAtStart,results[0].weatherAtStart);assert.deepEqual(r.weatherAtEnd,results[0].weatherAtEnd);}
const report={decision:'Hold F1 from native integration: matched A2/M2/A3 has fewer >=100ms intervals but a larger first render CPU peak. M2 is the second browser run of the same F1 implementation.',matched:['a2','m2','a3'],results,scope:'Descriptive Low first-drive pilot. M1 load mismatch retained; no causal percent, Medium/three-peer or final migration acceptance. No detailed profiler.'};writeFileSync(join(root,'comparison.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(results.map(r=>({run:r.run,comparable:r.comparable,fps:r.fps,p95:r.p95,p99:r.p99,max:r.max,over100:r.over100,startup:r.startupModeToReadyMs})),null,2));
