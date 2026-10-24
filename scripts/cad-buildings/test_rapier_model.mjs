import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { loadRapier, makeScene, profileSettings, doorApproachGeometry } from './rapier_model.mjs';
import { fixedGlazingHit, fixedGlazingCoverage, verifyDoors } from './verify_doors.mjs';
import { verifyRoutes } from './verify_routes.mjs';

const R=await loadRapier(process.env.CAD_MODEL_DEPENDENCY_ROOT);
async function fixtureFiles(files, run) {
  const parent=resolve('.cache/cad-buildings-20261024/b01-build');
  mkdirSync(parent,{recursive:true});
  const directory=mkdtempSync(join(parent,'rapier-fixture-')),written=[];
  try {
    const paths={};
    for(const [name,content] of Object.entries(files)) {
      assert.equal(name, name.replace(/[/\\]/g,''));
      const path=join(directory,name);writeFileSync(path,content);written.push(path);paths[name]=path;
    }
    return await run(paths,directory);
  } finally {
    for(const path of written)unlinkSync(path);
    rmdirSync(directory);
  }
}
function box(id,min,max,role='wall') {
  const [x0,y0,z0]=min,[x1,y1,z1]=max;
  const points=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],
                [x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  const faces=[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]];
  return {id,role,positions:points.flat(),indices:faces.flatMap(([a,b,c,d])=>[a,b,c,a,c,d])};
}
function model(gap=null) {
  const parts=[box('floor',[-3,-.2,-3],[3,0,3],'slab')];
  if(gap!==null)parts.push(box('wall-left',[-.1,0,-3],[.1,3,-gap/2]),box('wall-right',[-.1,0,gap/2],[.1,3,3]));
  return {cadOrigin:[0,0],parts};
}
function passage(profile,gap) {
  const scene=makeScene(R,model(gap),profileSettings(profile));
  try {
    const walker=scene.walker({x:-1,z:0,floor:0});
    assert.equal(walker.settle().setupValid,true);
    const result=walker.moveTo({x:1,z:0,floor:0});walker.dispose();
    assert.equal(scene.world.bodies.len(),0);
    return result;
  } finally { scene.free(); }
}

test('Podlaha a známá volná trasa jsou skutečně průchozí',()=>{
  const scene=makeScene(R,model(),profileSettings('cad-candidate'));
  try {
    assert.ok(Math.abs(scene.floorAt({x:0,z:0},0).height)<1e-6);
    assert.equal(scene.floorAt({x:4,z:0},0),null);
    const walker=scene.walker({x:-1,z:0,floor:0});
    assert.equal(walker.settle().setupValid,true);
    assert.equal(walker.moveTo({x:1,z:0,floor:0}).passed,true);
    walker.dispose();walker.dispose();assert.equal(scene.world.bodies.len(),0);
  } finally { scene.free(); }
  scene.free();assert.throws(()=>scene.walker({x:0,z:0,floor:0}),/počátek/);
});

test('Nedostatečně široký portál není falešný PASS',()=>{
  const blocked=passage('cad-candidate',0.58);
  assert.equal(blocked.passed,false);assert.ok(blocked.remaining>0.2);
  assert.ok(blocked.contacts.some(contact=>contact.part.startsWith('wall-')));
  const compact=passage('cad-compact',0.58);
  assert.equal(compact.passed,true);
});

test('Postava ve stěně má neplatný počáteční stav',()=>{
  const scene=makeScene(R,model(0.8),profileSettings('cad-compact'));
  try {
    const walker=scene.walker({x:0,z:1,floor:0}),setup=walker.settle();
    assert.equal(setup.setupValid,false);assert.ok(setup.overlaps.includes('wall-right'));
    walker.dispose();
  } finally { scene.free(); }
});

test('Dosažení XY cíle po pádu nenahradí podlahovou podporu',()=>{
  const scene=makeScene(R,model(),profileSettings('cad-compact'));
  try {
    const walker=scene.walker({x:1,z:0,floor:0});assert.equal(walker.settle().setupValid,true);
    const leg=walker.moveTo({x:4,z:0,floor:0});
    assert.equal(leg.passed,false);assert.ok(leg.footError < -0.5);
    walker.dispose();
  } finally { scene.free(); }
});

test('Podpora kapsle u nosu schodu není výška paprsku pod jejím středem',()=>{
  const value=model();value.parts.push(box('step',[0,0,-2],[2,.15,2],'stair'));
  const scene=makeScene(R,value,profileSettings('cad-compact'));
  try {
    // Střed leží ještě před čelem; oblý konec kapsle již spočívá na hraně.
    const point={x:-.10,z:0},support=scene.floorAt(point,0);
    assert.ok(support.height<.001);
    const walker=scene.walker({...point,floor:support.height,support});
    assert.equal(walker.settle().setupValid,true);
    const upper={x:.6,z:0},upperSupport=scene.floorAt(upper,.15);
    assert.equal(walker.moveTo({...upper,floor:upperSupport.height,support:upperSupport}).passed,true);
    assert.equal(walker.moveTo({...point,floor:support.height,support}).passed,true);
    walker.dispose();
  } finally {scene.free();}
});

test('Vadné konstrukční indexy se odmítnou před fyzikou',()=>{
  const value=model();value.parts[0].indices[0]=500;
  assert.throws(()=>makeScene(R,value,profileSettings('cad-compact')),/konstrukční část/);
});

test('Uzavřené fasádní prosklení blokuje postavu a vyžaduje skutečnou skleněnou výplň',()=>{
  const value=model();value.parts.push(box('pane',[-.004,.045,-.455],[.004,2.055,.455],'facade-glass'));
  const scene=makeScene(R,value,profileSettings('cad-compact'));
  try {
    assert.equal(fixedGlazingHit(scene,{x:-.5,z:0},{x:.5,z:0},1).part,'pane');
    assert.equal(fixedGlazingHit(scene,{x:.5,z:0},{x:-.5,z:0},1).part,'pane');
    assert.equal(fixedGlazingHit(scene,{x:-.5,z:1},{x:.5,z:1},1),null);
    const walker=scene.walker({x:-1,z:0,floor:0});assert.equal(walker.settle().setupValid,true);
    const leg=walker.moveTo({x:1,z:0,floor:0});
    assert.equal(leg.passed,false);assert.ok(leg.contacts.some(contact=>contact.part==='pane'));
    walker.dispose();
  } finally {scene.free();}
  const wallOnly=makeScene(R,model(0),profileSettings('cad-compact'));
  try {assert.equal(fixedGlazingHit(wallOnly,{x:-.5,z:0},{x:.5,z:0},1),null);}
  finally {wallOnly.free();}
});

test('Pevné prosklení musí pokrýt celý otvor ve skutečném ostění',()=>{
  const door={hinge:[-.9,0],closedEnd:[.9,0],bottom:0,top:2.1,floor:'n02'};
  function check(parts) {
    return fixedGlazingCoverage({local:([x,y])=>({x:-y,z:-x}),model:{parts:parts.map(part=>({...part,floor:'n02'}))}},door);
  }
  const full=check([box('pane',[-.004,.045,-.855],[.004,2.055,.855],'facade-glass')]);
  assert.equal(full.passed,true);assert.ok(full.missingArea<1e-9);
  const stripe=check([box('stripe',[-.004,.045,-.025],[.004,2.055,.025],'facade-glass')]);
  assert.equal(stripe.passed,false);assert.ok(stripe.missingArea>3);
  const misplaced=check([box('away',[.25,.045,-.855],[.258,2.055,.855],'facade-glass')]);
  assert.equal(misplaced.passed,false);assert.equal(misplaced.coveredArea,0);
  // Two panels leave a hole away from the center ray. Overlapping faces must
  // not be summed twice and used to conceal the missing surface elsewhere.
  const partial=[box('left',[-.004,.045,-.855],[.004,2.055,.30],'facade-glass'),
    box('right',[-.004,.045,.65],[.004,2.055,.855],'facade-glass')];
  const hole=check([...partial,...partial]);
  assert.equal(hole.passed,false);assert.ok(Math.abs(hole.missingArea-.35*1.99)<1e-8);
});

test('Dveřní přejímka odmítne neúplné prosklení i při zásahu středového paprsku',async()=>{
  const variants=[
    {id:'full',passed:true,parts:[box('pane',[-.004,.045,-.855],[.004,2.055,.855],'facade-glass')]},
    {id:'stripe',passed:false,parts:[box('stripe',[-.004,.045,-.025],[.004,2.055,.025],'facade-glass')]},
    {id:'off-center-hole',passed:false,parts:[box('left',[-.004,.045,-.855],[.004,2.055,.30],'facade-glass'),
      box('right',[-.004,.045,.65],[.004,2.055,.855],'facade-glass')]},
  ];
  for(const variant of variants) {
    const value=model();value.id='fixture';
    value.parts.push(...variant.parts.map(part=>({...part,floor:'n02'})));
    value.doors=[{id:variant.id,floor:'n02',hinge:[-.9,0],closedEnd:[.9,0],depth:.1,bottom:0,top:2.1,
      openingClassification:'facade-opening-unconfirmed-access'}];
    await fixtureFiles({'model.json':JSON.stringify(value)},async paths=>{
      const args=new Map([['--model',paths['model.json']],['--profile','cad-compact']]);
      if(process.env.CAD_MODEL_DEPENDENCY_ROOT)args.set('--dependency-root',process.env.CAD_MODEL_DEPENDENCY_ROOT);
      const report=await verifyDoors(args);
      assert.equal(report.status,variant.passed?'pass':'issues',variant.id);
      assert.equal(report.cases,2);assert.equal(report.protectedGlazing,variant.passed?2:0);
      for(const row of report.results) {
        assert.ok(row.protection,'Obě strany musí zasáhnout sklo i v negativní fixture');
        assert.equal(row.passed,variant.passed,variant.id);
        assert.equal(row.category,variant.passed?'fixed-glazing':'missing-glazing');
      }
    });
  }
});

test('Vadný vstup overrides se odmítne ještě před načítáním fyzikálního modelu',async()=>{
  await fixtureFiles({'invalid.json':'{'},async(paths,directory)=>{
    const args=new Map([['--model',join(directory,'absent-model.json')],['--profile','cad-compact'],
      ['--access-overrides',paths['invalid.json']]]);
    await assert.rejects(()=>verifyRoutes(args),SyntaxError);
    const missing=join(directory,'absent-overrides.json');args.set('--access-overrides',missing);
    await assert.rejects(()=>verifyRoutes(args),error=>error.code==='ENOENT'&&error.path===missing);
  });
});

test('Sjednocení šikmých překřížených trojúhelníků zachová skutečnou díru i po otočení ostění',()=>{
  const crossed=[[[0,0],[1,0],[.5,1]],[[0,1],[1,1],[.5,0]]];
  for(const angle of [0,.713]) {
    const c=Math.cos(angle),s=Math.sin(angle),door={hinge:[0,0],closedEnd:[1.11*c,1.11*s],
      bottom:0,top:1.11,floor:'n02',normalOffset:.07};
    const local=([x,y])=>({x:-y,z:-x});
    function coverage(triangles) {
      const vertices=triangles.flatMap(triangle=>triangle.map(([u,v])=>{
        const along=u+.055,p=local([c*along-s*.07,s*along+c*.07]);return [p.x,v+.055,p.z];
      }));
      return fixedGlazingCoverage({local,model:{parts:[{id:'edited-pane',role:'facade-glass',floor:'n02',
        positions:vertices.flat(),indices:vertices.map((_,i)=>i)}]}},door);
    }
    const hole=coverage([...crossed,...crossed.map(triangle=>[...triangle].reverse())]);
    assert.equal(hole.passed,false);assert.ok(Math.abs(hole.coveredArea-.75)<1e-9);
    assert.ok(Math.abs(hole.missingArea-.25)<1e-9);
    const full=coverage([[[0,0],[1,0],[1,1]],[[0,0],[1,1],[0,1]]]);
    assert.equal(full.passed,true);assert.ok(Math.abs(full.coveredArea-1)<1e-9);
  }
});

test('Uvolnění scény odstraní i nepředanou aktivní postavu',()=>{
  const scene=makeScene(R,model(),profileSettings('cad-compact'));
  const walker=scene.walker({x:0,z:0,floor:0});walker.settle();
  assert.equal(scene.world.bodies.len(),1);
  scene.free();assert.throws(()=>walker.moveTo({x:1,z:0,floor:0}));walker.dispose();
});

test('Mělký prostor zkrátí přístup kapsle před skutečnou zadní stěnou',()=>{
  const value=model();value.parts.push(box('rear',[.6623,0,-1],[.8,3,1]),
    box('jamb-left',[0,0,-1],[.1,3,-.35]),box('jamb-right',[0,0,.35],[.1,3,1]));
  const scene=makeScene(R,value,profileSettings('cad-compact'));
  const door={id:'bay',hinge:[.35,0],closedEnd:[-.35,0],bottom:0,depth:.1,normalOffset:.05,
    approachBoundaryCad:[null,[0,-.6623]]};
  try {
    const regular=doorApproachGeometry(scene,{...door,approachBoundaryCad:undefined});
    const bounded=doorApproachGeometry(scene,door);
    assert.ok(bounded.distances[1]<regular.distances[1]);
    assert.ok(.6623-bounded.points[1].x>=scene.settings.radius+scene.settings.offset+.0099);
    const sides=bounded.points.map(point=>({...point,floor:0}));
    for(const direction of [0,1]) {
      const walker=scene.walker(sides[direction]);assert.equal(walker.settle().setupValid,true);
      assert.equal(walker.moveTo(sides[1-direction]).passed,true);walker.dispose();
    }
    const walker=scene.walker(sides[0]);walker.settle();
    assert.equal(walker.moveTo({...regular.points[1],floor:0}).passed,false);
    walker.dispose();
    const flipped=doorApproachGeometry(scene,{...door,hinge:door.closedEnd,closedEnd:door.hinge,
      normalOffset:-.05,approachBoundaryCad:[door.approachBoundaryCad[1],null]});
    assert.ok(Math.abs(flipped.points[0].x-bounded.points[1].x)<1e-9);
    assert.throws(()=>doorApproachGeometry(scene,{...door,approachBoundaryCad:[null,[.1,-.6623]]}),/normále/);
  } finally {scene.free();}
});
