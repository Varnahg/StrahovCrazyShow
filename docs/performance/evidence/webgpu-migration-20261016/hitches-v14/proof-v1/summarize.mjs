import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const report=JSON.parse(readFileSync(new URL('report.json',import.meta.url),'utf8'));assert.equal(report.passed,true);assert.equal(report.cases.length,7);
const cases=report.cases.map(c=>{
  assert.equal(c.passed,true);assert.equal(c.rows.length,17);assert.equal(c.comparisons.length,10);assert.ok(c.cleanup.rawTextureReferences.every(t=>t.references===0));
  const rows=c.rows.filter(r=>r.projection).map(r=>({label:r.label,drawn:r.parts.filter(p=>p.drawn).length,uniqueEffects:[...new Set(r.parts.filter(p=>p.drawn).map(p=>p.effect.id))].length,vertices:r.projection.reduce((n,p)=>n+p.vertices,0),clipped:r.projection.reduce((n,p)=>n+p.clippedVertices,0),clippedBounds:r.projection.reduce((n,p)=>n+p.clippedBounds,0),skinned:r.projection.filter(p=>p.skinned).length,morphed:r.projection.filter(p=>p.morphed).length,fit:r.fit,world:r.world,leafShadowEffect:r.leafShadowEffect??null}));
  for(const row of rows.filter(r=>!r.label.startsWith('B6')))assert.equal(row.clipped,0);
  for(const on of [false,true]){const far=rows.find(r=>r.label==='far-only-'+on),fov=rows.find(r=>r.label==='fov-only-'+on),narrow=rows.find(r=>r.label==='narrow-first-'+on);assert.equal(far.fit.fov,.85);assert.ok(far.fit.far<1100);assert.equal(fov.fit.far,1100);assert.ok(fov.world.main.includes('representative far world receiver'));assert.ok(!far.world.main.includes('representative far world receiver'));assert.ok(!narrow.world.main.includes('representative far world receiver'));if(on){assert.ok(narrow.world.shadow.includes('representative shadow-only wind leaf'));assert.ok(narrow.world.effectEvents.some(e=>e.kind==='shadow-base'));assert.ok(narrow.leafShadowEffect!==null);}}
  return{spec:c.spec,config:c.config,rows,restores:c.restores,ownership:c.ownership,cleanup:c.cleanup};
});
const summary={passed:true,startedAt:report.startedAt,endedAt:report.endedAt,presetCases:7,captures:119,comparisons:70,cases,limitations:report.cases[0].limitations};writeFileSync(new URL('summary.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(cases.map(c=>({name:c.spec.name,views:c.rows.map(r=>({label:r.label,drawn:r.drawn,vertices:r.vertices,clipped:r.clipped,bounds:r.clippedBounds,worldMain:r.world.main.length,worldShadow:r.world.shadow.length}))})),null,2));
