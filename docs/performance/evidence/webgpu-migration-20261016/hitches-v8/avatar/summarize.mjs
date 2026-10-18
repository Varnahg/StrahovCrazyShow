import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
const report=JSON.parse(readFileSync(new URL('report.json',import.meta.url),'utf8'));
assert.equal(report.passed,true);assert.equal(report.comparisons.length,6);
const byLabel=label=>report.rows.find(row=>row.label===label);
const rows=report.rows.map(row=>({label:row.label,attached:row.parts.filter(p=>p.attached).length,drawn:row.parts.filter(p=>p.drawn).length,readyVisible:row.parts.filter(p=>p.drawn).every(p=>p.effect.ready&&p.textures.every(t=>t.ready)),uniqueEffects:[...new Set(row.parts.filter(p=>p.drawn).map(p=>p.effect.id))],ordered:row.parts.find(p=>p.drawn)?.lightNames.map(name=>row.lights.find(light=>light.name===name)),rig:row.rig,camera:row.camera}));
for(const on of [false,true]){
  const reference=byLabel('reference-B6-day-'+on);
  for(const prefix of ['A-B6-lights-spawn-camera-','B-day-spawn-point1-','reference-reentry-']){
    const row=byLabel(prefix+on);
    for(let i=0;i<reference.parts.length;i++)if(reference.parts[i].drawn){assert.equal(row.parts[i].drawn,true);assert.equal(reference.parts[i].effect.defines,row.parts[i].effect.defines);assert.equal(reference.parts[i].effect.id,row.parts[i].effect.id);}
  }
  const lit=reference.parts.filter(p=>p.drawn);
  assert.ok(lit.every(p=>p.cap===4));
  assert.ok(lit.every(p=>p.effect.defines.includes('#define SHADOW0\n')===on));
}
assert.equal(byLabel('hidden-near').parts.filter(p=>p.attached).length,0);
assert.equal(byLabel('hidden-near').parts.filter(p=>p.drawn).length,0);
assert.ok(report.cleanup.rawTextureReferences.every(t=>t.references===0));
const summary={sourceSnapshotId:report.sourceSnapshotId,startedAt:report.startedAt,endedAt:report.endedAt,passed:true,rows,comparisons:report.comparisons.map(c=>({reference:c.reference,variant:c.variant,sameFullDefines:c.sameFullDefines,sameEffect:c.sameEffect,drawn:c.drawn.length})),intensityOnly:report.intensityOnly,ownership:report.ownership,rawUploadIO:report.rawUploadIO,cleanup:report.cleanup,limits:report.limitations};
writeFileSync(new URL('summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({passed:true,rows:rows.map(r=>({label:r.label,drawn:r.drawn,effects:r.uniqueEffects})),comparisons:summary.comparisons,rawUploadCount:report.rawUploadIO.length,cleanup:report.cleanup},null,2));
