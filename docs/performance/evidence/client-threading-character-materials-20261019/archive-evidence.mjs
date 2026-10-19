import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
import {join,resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const root=import.meta.dirname, repo=resolve(root,'../..');
const out=join(repo,'docs/performance/evidence/client-threading-character-materials-20261019');
const helper=join(repo,'.cache/client-threading-character-material-init-20261019');
mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(readFileSync(join(root,'validation-manifest.json')));
for(const s of Object.values(manifest.snapshots)) {
 const m=JSON.parse(readFileSync(join(s.path,'source-manifest.json')));
 assert.equal(m.snapshotId,s.source);
 for(const[p,expected]of Object.entries(m.files))assert.equal(sha(readFileSync(join(s.path,p))),expected,p);
}
const copy=(from,to)=>writeFileSync(join(out,to),readFileSync(from));
for(const name of ['red.txt','green.txt','targeted-final.txt','typecheck-initial.txt','research.md','manifest.json','baseline-character-materials.ts','runtime.diff'])copy(join(helper,name),'cpu-'+name);
for(const name of ['validation-manifest.json','build-identity.json','served-verified.json','prepare.mjs','prepare-serve.mjs','run-check.ps1','gpu-at-editor.txt'])copy(join(root,name),name);
for(const name of readdirSync(join(root,'logs'))) {
 const b=readFileSync(join(root,'logs',name));
 if(name.endsWith('.log'))writeFileSync(join(out,name+'.gz'),gzipSync(b));else writeFileSync(join(out,name),b);
}
for(const kind of ['clean','combined'])copy(join(root,kind,'source-manifest.json'),kind+'-source-manifest.json');
const session='e0a7fc0c-6986-4a75-8904-8f4d3fc2b69a';
const raw=readFileSync(join(root,'combined/.cache/game-diagnostics',session+'.jsonl'));
const records=raw.toString('utf8').trim().split(/\r?\n/).flatMap(line=>JSON.parse(line).records??[]).sort((a,b)=>a.seq-b.seq);
records.forEach((r,i)=>assert.equal(r.seq,i));
const ready=records.filter(r=>r.kind==='game-ready'),dispose=records.filter(r=>r.kind==='game-dispose');
assert.equal(ready.length,2,'Two actual Game starts');assert.equal(dispose.length,2,'Two owned Game teardowns');
const benchmark=JSON.parse(readFileSync(join(out,'gpu-benchmark.json')));
assert.equal(benchmark.sourceSnapshotId,manifest.snapshots.combined.source);assert.equal(benchmark.renderHealth.valid,true);
const errors=records.filter(r=>/error|failure/.test(r.kind));
writeFileSync(join(out,'gpu-session.jsonl.gz'),gzipSync(raw));
const runtime=JSON.parse(readFileSync(join(root,'live/runtime.json')));
const summary={source:manifest.snapshots.combined.source,cleanSource:manifest.snapshots.clean.source,session,records:records.length,rawSha256:sha(raw),rawBytes:raw.length,ready,dispose,errorRecords:errors,benchmark:{date:benchmark.date,health:benchmark.renderHealth,avatars:benchmark.avatars,ambient:benchmark.ambient,quality:benchmark.quality,viewport:benchmark.viewport,renderResolution:benchmark.renderResolution,averageFps:benchmark.averageFps,p95FrameMs:benchmark.p95FrameMs,p99FrameMs:benchmark.p99FrameMs,scope:'Single visual/health smoke, different scene/time from baseline. Not matched FPS acceptance.'},visualChecks:['six editor presets','face eyes/glasses/beard/hair recolor','game medium daylight and walking','editor recreation after Game disposal','second Game entry and teardown'],limits:['No pixel-difference baseline; visual smoke plus CPU parameter/define parity.','One actual GPU multiplayer relation; no3session worker or FPS acceptance.','No worker architecture shipped; redundant material initialization scans reduced.','Default fullclean test had two4s readiness timeouts under load; focused and bounded full rerun passed with identical source/timeouts.'],runtime};
writeFileSync(join(out,'gpu-summary.json'),JSON.stringify(summary,null,2)+'\n');
const files={};for(const name of readdirSync(out).sort())if(name!=='evidence-manifest.json')files[name]={sha256:sha(readFileSync(join(out,name))),bytes:readFileSync(join(out,name)).length};
writeFileSync(join(out,'evidence-manifest.json'),JSON.stringify({createdUTC:new Date().toISOString(),files},null,2)+'\n');
console.log(JSON.stringify({files:Object.keys(files).length,source:summary.source,records:records.length,ready:ready.length,dispose:dispose.length,errorRecords:errors.length,rawSha256:summary.rawSha256},null,2));
