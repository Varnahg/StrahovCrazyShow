import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const root=import.meta.dirname,hash=b=>createHash('sha256').update(b).digest('hex'),rows=[];
for(const run of ['native-day13-normal1','native-day13-reference2','native-day13-normal2']){
 const s=JSON.parse(readFileSync(join(root,'async-'+run+'-summary.json'))),raw=readFileSync(join(root,'async-'+run+'-session.jsonl'));
 assert.equal(hash(raw),s.sha256);const records=raw.toString().trim().split('\n').map(JSON.parse).flatMap(b=>b.records??[]);assert.ok(records.every((r,i)=>r.seq===i));
 const windows=[];for(const name of ['golden','first-f','day']){const path=run+'-'+name+'-benchmark.json',bytes=readFileSync(join(root,path)),b=JSON.parse(bytes);assert.equal(b.sourceSnapshotId,s.snapshotId);assert.equal(b.renderHealth.valid,true);assert.equal(b.renderErrorCount,0);assert.equal(b.assetLoadErrorCount,0);windows.push({name,path,sha256:hash(bytes),fps:b.averageFps,p95:b.p95FrameMs,p99:b.p99FrameMs,maxFrameMs:Math.max(...b.frameIntervalsMs),modules:b.compilation.end.metrics.shaderModule.calls-b.compilation.start.metrics.shaderModule.calls,sync:b.compilation.end.metrics.syncPipeline.calls-b.compilation.start.metrics.syncPipeline.calls,ambient:b.ambient,sceneView:b.sceneView,viewport:b.viewport,renderResolution:b.renderResolution,quality:b.quality,avatars:b.avatars,presentationRate:b.presentationRate,weatherAtStart:b.weatherAtStart,weatherAtEnd:b.weatherAtEnd});}
 rows.push({run,snapshotId:s.snapshotId,rawSha256:s.sha256,records:records.length,startupMs:s.startupMs,preparationMs:s.preparation.elapsedMs,stages:s.preparation.stages.map(x=>x.stage),dayStageMs:s.preparation.stages.filter(x=>x.stage.startsWith('day-')).reduce((a,x)=>a+x.elapsedMs,0),prepStatus:s.preparation.status,errors:s.errors,dispose:s.dispose,windows,benchmarkStarts:records.filter(r=>r.kind==='benchmark-start'),browserState:records.filter(r=>r.kind==='browser-state')});
}
writeFileSync(join(root,'native-day13-audit.json'),JSON.stringify({scope:'UI window exports are authoritative. Native raw has no benchmark-end/action markers; no exact raw window attribution. Startup, ambient and cadence differences are explicit. This is not final renderer/FPS acceptance.',rows},null,2)+'\n');
console.log(JSON.stringify(rows.map(r=>({run:r.run,startupMs:r.startupMs,prep:r.preparationMs,day:r.dayStageMs,records:r.records,windows:r.windows.map(({name,modules,sync,maxFrameMs})=>({name,modules,sync,maxFrameMs}))}))));
