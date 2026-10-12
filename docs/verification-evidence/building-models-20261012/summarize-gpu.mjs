import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
const folder=import.meta.dirname;
const sample=async(file)=>{const data=JSON.parse(await readFile(join(folder,file),'utf8'));return {file,date:data.date,sourceSnapshotId:data.sourceSnapshotId,avatars:data.avatars,quality:data.quality,viewport:data.viewport,renderResolution:data.renderResolution,gpu:data.gpu,durationSeconds:data.durationSeconds,frames:data.frames,fps:data.averageFps,p95FrameMs:data.p95FrameMs,p99FrameMs:data.p99FrameMs,renderErrorCount:data.renderErrorCount,assetLoadErrorCount:data.assetLoadErrorCount,sceneView:data.sceneView,triangles:data.triangles,drawCalls:data.drawCalls,frameWork:data.frameWork,frameBreakdownMs:data.frameBreakdownMs};};
const samples=await Promise.all(['one-day-medium-full.json','thirty-day-medium-a-full.json','thirty-day-medium-b-full.json','b4-north-day-before-material-full.json'].map(sample));
const excluded=await sample('mixed-cohort-excluded.json');
const network=JSON.parse(await readFile(join(folder,'network-29.json'),'utf8'));
const profiles=JSON.parse(await readFile(join(folder,'network-29.json.profiles.json'),'utf8'));
const distinctPresets=new Set(profiles.issuedProfiles.map(p=>JSON.stringify(p.avatar))).size;
for(const result of samples){if(result.sourceSnapshotId!==network.sourceSnapshotId||result.renderErrorCount||result.assetLoadErrorCount)throw new Error('Unexpected source/errors in '+result.file);}
for(const result of samples.filter(s=>s.file.startsWith('thirty-'))){if(result.avatars!==30)throw new Error('Invalid crowd sample');}
const report={sourceSnapshotId:network.sourceSnapshotId,gpuClaim:'Intel UHD630 only; not GeForce, not 60 FPS, no matched A/B speed claim',samples,excluded:[{...excluded,reason:'Report contains 1 avatar after the 29-session cohort ended; excluded from thirty-session range'}],network:{count:network.count,expectedPopulation:network.expectedPopulation,distinctPresets,worldIds:network.worldIds,durationMs:network.durationMs,minRowsPerMotion:network.minRowsPerMotion,maxRowsPerMotion:network.maxRowsPerMotion,resyncs:network.resyncsDuringMeasurement,errors:network.errors,stopReason:network.stopReason},visualFinding:'B4 neutral panels use StandardMaterial while adjacent facades use PBR; dark north facade is pending the separately scoped material correction.'};
await writeFile(join(folder,'gpu-summary.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({samples:samples.map(s=>({file:s.file,avatars:s.avatars,fps:s.fps,p95:s.p95FrameMs,p99:s.p99FrameMs})),network:report.network,excluded:report.excluded.map(s=>({file:s.file,avatars:s.avatars,reason:s.reason}))}));
