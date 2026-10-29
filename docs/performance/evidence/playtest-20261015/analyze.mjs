// Reproduce this evidence from the immutable local JSONL archive; no writes.
// node docs/performance/evidence/playtest-20261015/analyze.mjs <archive.jsonl>
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { summarizeDiagnosticFiles } from '../../../../scripts/diagnostics-report.mjs';
const file=process.argv[2];
if(!file)throw Error('Pass the archived gameplay JSONL, not a live directory');
const bytes=fs.readFileSync(file),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
assert.equal(sha256,'6c540c3700bbd1c26a9cf0455275916a085fbbc3c4fbaa403c129c8f8954b0c4');
const rows=bytes.toString().trim().split('\n').map(JSON.parse);
const records=rows.flatMap(x=>x.records??[]),byKind=k=>records.filter(x=>x.kind===k);
const start=byKind('session-start')[0],origin=start.data.timeOrigin;
const utc=ms=>new Date(origin+ms).toISOString();
const foreground=d=>!['hidden','transition'].includes(d.visibility)&&!d.afterVisibilityChange&&d.context?.visibility!=='hidden'&&d.context?.visible!==false;
const windows=byKind('frame-window').filter(r=>foreground(r.data));
const samples=ws=>ws.flatMap(r=>r.data.frameMs);
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const quantile=(s,p)=>s[Math.ceil(s.length*p)-1]??null;
function distribution(values){const s=[...values].sort((a,b)=>a-b);return{count:s.length,totalMs:sum(s),fps:s.length?1000*s.length/sum(s):null,p50Ms:quantile(s,.5),p95Ms:quantile(s,.95),p99Ms:quantile(s,.99),maxMs:s.at(-1)??null,thresholds:Object.fromEntries([50,100,250,500,1000].map(n=>['atLeast'+n+'Ms',s.filter(x=>x>=n).length]))};}
const frame=distribution(samples(windows));
const report=await summarizeDiagnosticFiles([file]);
assert.equal(frame.count,report.performance.frames);
assert.equal(frame.p95Ms,report.performance.p95FrameMs);
assert.equal(frame.p99Ms,report.performance.p99FrameMs);
assert.ok(Math.abs(frame.fps-report.performance.averageFps)<1e-9);
assert.equal(frame.thresholds.atLeast50Ms,report.performance.thresholds.atLeast50Ms);
const phases={};for(const r of windows)for(const [key,value]of Object.entries(r.data.phaseTotals))phases[key]=(phases[key]??0)+value;
const phaseTotal=sum(Object.values(phases));
const hitches=byKind('frame-hitch').filter(r=>foreground(r.data)&&r.data.frameMs>1000);
assert.equal(hitches.length,frame.thresholds.atLeast1000Ms);
const corrections=byKind('network-correction'),large=corrections.filter(r=>r.data.correctionMetres>=.35&&!r.data.respawn&&!r.data.modeChanged);
const countBy=xs=>xs.reduce((a,k)=>(a[k]=(a[k]??0)+1,a),{});
const b6=windows.filter(r=>r.data.context?.zone?.startsWith('b6:'));
const qualityChanges=[];let previous;
for(const r of windows){const rendering=r.data.context.rendering;const key=JSON.stringify(rendering);if(key!==previous){qualityChanges.push({seq:r.seq,contextAtMs:r.data.contextAtMs,rendering});previous=key;}}
const gpu=windows.flatMap(r=>r.data.gpuMs).filter(x=>Number.isFinite(x)&&x>=0).sort((a,b)=>a-b);
const maxChanges=[];let old=-Infinity;
for(const r of windows){const c=r.data.context?.network?.server?.clock;if(c&&c.cpuMaxMs>old){maxChanges.push({seq:r.seq,contextAtMs:r.data.contextAtMs,cpuMaxMs:c.cpuMaxMs,elapsedMaxMs:c.elapsedMaxMs});old=c.cpuMaxMs;}}
const longtask=byKind('longtask').sort((a,b)=>b.data.duration-a.data.duration)[0];
const probes=byKind('network-round-trip');
const {fps:unusedFrameRate,...rawRttDistribution}=distribution(probes.map(x=>x.data.rawRoundTripMs));
const result={
 provenance:{sessionId:rows[0].sessionId,sha256,bytes:bytes.length,source:rows[0].source,records:records.length,batches:rows.filter(x=>x.type==='batch').length,sequenceGaps:records.slice(1).filter((r,i)=>r.seq!==records[i].seq+1).length,sourceIds:[...new Set(rows.filter(x=>x.source).map(x=>x.source.contentSha256))]},
 lifecycle:{readyAtMs:byKind('game-ready')[0].atMs,readyUTC:utc(byKind('game-ready')[0].atMs),disposeAtMs:byKind('game-dispose')[0].atMs,disposeUTC:utc(byKind('game-dispose')[0].atMs),modes:byKind('mode-change').map(x=>x.data.mode),browser:byKind('browser-state').map(r=>({atMs:r.atMs,...r.data})),actions:byKind('action').map(r=>({atMs:r.atMs,action:r.data.action,vehicle:r.data.vehicle})),sessionEndRecorded:byKind('session-end').length>0},
 foreground:frame,excluded:report.excludedVisibilityPerformance,
 sampledContextGroups:{scope:'Window-level sampled context, not exact per-frame zone or quality boundaries; not a controlled A/B comparison',b6:distribution(samples(b6)),outside:distribution(samples(windows.filter(r=>r.data.context.zone==='outside'))),qualityChanges},
 measuredCallbackPhases:Object.fromEntries(Object.entries(phases).map(([k,v])=>[k,{totalMs:v,meanPerFrameMs:v/frame.count,share:v/phaseTotal}])),
 longFrames:{count:hitches.length,intervalSumMs:sum(hitches.map(r=>r.data.frameMs)),precedingCallbackMs:sum(hitches.map(r=>r.data.previousFrame?.cpuMs??0)),precedingRenderMs:sum(hitches.map(r=>r.data.previousFrame?.phases.render??0)),precedingEnvironmentMs:sum(hitches.map(r=>r.data.previousFrame?.phases.environment??0)),incidents:hitches.map(r=>({seq:r.seq,fromMs:r.data.intervalStartMs,toMs:r.data.intervalEndMs,frameMs:r.data.frameMs,previousCpuMs:r.data.previousFrame?.cpuMs,previousPhases:r.data.previousFrame?.phases,zone:r.data.context?.zone,position:r.data.context?.position,vehicle:r.data.context?.vehicle,rendering:r.data.context?.rendering}))},
 gpu:{scope:'Fresh asynchronous query samples; null is unavailable, not zero. GPU model not recorded by client.',samples:gpu.length,meanMs:sum(gpu)/gpu.length,p95Ms:quantile(gpu,.95),p99Ms:quantile(gpu,.99),maxMs:gpu.at(-1)},
 network:{...report.network,largeWithoutRespawnOrModeChange:{atLeast035m:large.length,atLeast1m:large.filter(r=>r.data.correctionMetres>=1).length,atLeast5m:large.filter(r=>r.data.correctionMetres>=5).length,atLeast10m:large.filter(r=>r.data.correctionMetres>=10).length},largest:large.sort((a,b)=>b.data.correctionMetres-a.data.correctionMetres).slice(0,5).map(r=>({seq:r.seq,atMs:r.atMs,utc:utc(r.atMs),...r.data})),waitReasons:countBy(byKind('network-timeline-wait').map(x=>x.data.reason)),waitScope:'Throttled events, not episode counts or durations',probes:{count:probes.length,contaminated:probes.filter(x=>x.data.contaminated).length,rawMs:rawRttDistribution},lastSampledContext:windows.at(-1).data.context.network},
 serverClock:{...report.serverClock,observedLifetimeMaxIncreases:maxChanges,scopeOfMaxIncreases:'Client observation times, not exact server callback timestamps. cpuMs measures wall time inside callback, not processor utilization.'},
 teardown:{longtaskSeq:longtask.seq,startMs:longtask.data.startTime,durationMs:longtask.data.duration,scope:'Overlaps leaving game/dispose; not included in frame windows. Inner disposal attribution is unprofiled.'},
 recorder:{measuredMs:sum(windows.map(r=>r.data.recorderCpuMs)),meanPerFrameMs:sum(windows.map(r=>r.data.recorderCpuMs))/frame.count,maxMeasuredMs:Math.max(...windows.map(r=>r.data.recorderMaxMs)),scope:'Recorder self-time excludes all transport/browser overhead'},
 errors:report.errors.map(r=>({seq:r.seq,kind:r.kind,source:r.data.source,status:r.data.responseStatus})),
 limits:['No pixels/video, selected GPU identity, lighting-preview/flashlight/camera state or inner render/shader phases.','One multiplayer run; no solo/rejoin proof.','Hitch/longtask/LoAF events overlap and must not be summed as independent gameplay freezes.','Single changing route/quality run; not a comparable FPS A/B benchmark.','Page remains open after game-dispose; no session-end is expected yet.']
};
console.log(JSON.stringify(result,null,2));
