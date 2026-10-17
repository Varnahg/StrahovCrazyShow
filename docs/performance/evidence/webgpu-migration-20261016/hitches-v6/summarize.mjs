import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const report = JSON.parse(readFileSync('report.json','utf8'));
const layout = subject => JSON.stringify({cap:subject.cap,receiveShadows:subject.receiveShadows,lights:subject.ordered.map(({type,falloff,shadow,filter,filteringQuality,priority})=>({type,falloff,shadow,filter,filteringQuality,priority}))});
const compact = row => ({ label:row.label,at:row.at,daylight:row.daylight,sunAltitude:row.sunAltitude,moonAltitude:row.moonAltitude,moonFraction:row.moonFraction,
  sunIntensity:row.sunIntensity,celestialShadows:row.celestialShadows,b6:row.b6,camera:row.camera,leafDepths:row.leafDepths,
  subjects:row.subjects.map(s=>({role:s.role,attached:s.attached,active:s.active,drawn:s.drawn,shadowDrawPasses:s.shadowDrawPasses,instance:s.instance,cap:s.cap,receiveShadows:s.receiveShadows,
    lights:s.ordered.map(l=>`${l.type}/fall${l.falloff}/shadow${l.shadow}/filter${l.filter}/q${l.filteringQuality}/priority${l.priority}`),effectId:s.effect?.id,definesSha:s.effect?.definesSha,lightDefines:s.effect?.lightDefines}))});
const summary = report.results.map(result=>({ now:result.nowIso,night:result.nightAnchor,ownership:result.ownership,
  startup:Object.values(result.startup.stages).map(compact), b6:result.b6.map(row=>({...compact(row),matches:row.subjects.map(s=>({role:s.role,
    layout:Object.entries(result.startup.stages).filter(([_,r])=>r.subjects.some(old=>old.role===s.role&&old.drawn&&layout(old)===layout(s))).map(([stage])=>stage),
    defines:Object.entries(result.startup.stages).filter(([_,r])=>r.subjects.some(old=>old.role===s.role&&old.drawn&&old.effect?.definesSha===s.effect?.definesSha)).map(([stage])=>stage)}))})),
  navigation:compact(result.navigationView), entry:compact(result.entryView), restore:compact(result.restore), reuse:result.reuse, finalRestore:compact(result.finalRestore) }));
for (const s of summary) {
  assert.ok(s.startup.every(row=>row.sunIntensity===0&&!row.b6));
  assert.ok(s.b6.every(row=>row.sunIntensity>0&&row.celestialShadows==='none'&&row.b6));
  assert.ok(s.b6.every(row=>row.matches.slice(0,2).every(match=>!match.layout.length&&!match.defines.length)));
  assert.ok(s.b6.every(row=>row.subjects.filter(subject=>subject.instance&&subject.drawn).length===8));
  assert.equal(s.navigation.subjects.filter(subject=>subject.instance&&subject.drawn).length,4);
  assert.ok(s.navigation.subjects.filter(subject=>subject.instance&&subject.drawn).every(subject=>subject.role.includes('reception-counter')));
  assert.equal(s.entry.subjects.filter(subject=>subject.instance&&subject.drawn).length,8);
  assert.equal(s.entry.subjects.filter(subject=>subject.instance&&subject.shadowDrawPasses.length).length,7);
  const streetPoint=s.startup.find(row=>row.label==='night-1-off').subjects[0].lights.find(light=>light.startsWith('PointLight/'));
  for (const row of s.b6) assert.equal(row.subjects[0].lights.find(light=>light.startsWith('PointLight/')),streetPoint,'POINT name alone is not a different layout');
  assert.ok(s.reuse.main.every(row=>row.sameDefines&&row.beforeId===row.afterId));
  assert.ok(s.reuse.disposedAfterRestore.every(row=>row.disposed));
}
writeFileSync('summary.json',JSON.stringify(summary,null,2)+'\n');
for (const s of summary) {
  console.log('NOW',s.now,'NIGHT',s.night);
  for(const row of s.startup) console.log(row.label,'key',row.sunIntensity,'celestial',row.celestialShadows,'resident',row.subjects[0].lights.join(','));
  for(const row of s.b6) console.log(JSON.stringify({label:row.label,key:row.sunIntensity,shadow:row.celestialShadows,
    layout:row.subjects[0].lights,drawnRegular:row.subjects.filter(x=>x.instance&&x.drawn).map(x=>x.role),residentMatches:row.matches.slice(0,2)}));
  console.log('NAV DRAWN',s.navigation.subjects.filter(x=>x.drawn).map(x=>x.role));
  console.log('ENTRY COVERAGE',JSON.stringify({main:s.entry.subjects.filter(x=>x.instance&&x.drawn).map(x=>x.role),shadow:s.entry.subjects.filter(x=>x.instance&&x.shadowDrawPasses.length).map(x=>x.role)}));
  console.log('REUSE',JSON.stringify({main:s.reuse.main,oldDepths:s.reuse.beforeRestore.leafDepths,
    disposal:s.reuse.disposedAfterRestore,newDepths:s.reuse.afterRestore.leafDepths,uniqueMainEffects:new Set(s.reuse.main.map(row=>row.beforeId)).size,ownership:s.ownership}));
}
