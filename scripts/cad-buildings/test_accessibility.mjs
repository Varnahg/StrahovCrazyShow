import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRapier,makeScene,profileSettings,doorApproachGeometry } from './rapier_model.mjs';
import { prepareEvidence,probeAccessibility,validateReportIdentity } from './verify_accessibility.mjs';
import { routePath } from './verify_routes.mjs';

const R=await loadRapier(process.env.CAD_MODEL_DEPENDENCY_ROOT);
const settings=profileSettings('cad-compact');
function box(id,min,max,role='wall') {
  const [x0,y0,z0]=min,[x1,y1,z1]=max;
  const points=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  return {id,role,positions:points.flat(),indices:[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]].flatMap(([a,b,c,d])=>[a,b,c,a,c,d])};
}
const floor=(id='floor',height=0)=>box(id,[-3,height-.2,-2.5],[3,height,2.5],'slab');
const anchor=(id,x,z=0,height=0,target=true)=>({id,point:{x,z,floor:height},target});
function run(parts,nodes=[anchor('entry',-2,0,0,false),anchor('destination',2)],options={}) {
  const scene=makeScene(R,{cadOrigin:[0,0],parts},settings);
  try {
    const report=probeAccessibility(scene,{nodes,links:[],excluded:[]},['entry'],{spacing:1,...options});
    assert.equal(scene.world.bodies.len(),0,'Probe musí odstranit všechny vytvořené postavy');
    return report;
  } finally {scene.free();}
}

test('Spojená podlaha má souvislý fyzický důkaz od vstupu',()=>{
  const report=run([floor()]);
  assert.equal(report.status,'pass');assert.equal(report.passed,1);
  assert.equal(report.results[0].proof.seed,'entry');
  assert.ok(report.stats.moves>0);
  const proof=report.results[0].proof,session=report.proofSessions.find(s=>s.session===proof.session);
  assert.equal(session.setup.setupValid,true);
  assert.ok(session.steps.slice(0,proof.afterStep).every(step=>step.passed));
});

test('Tenká stěna odděluje dva platné body a nedává falešný PASS',()=>{
  const report=run([floor(),box('divider',[-.01,0,-2.5],[.01,3,2.5])]);
  assert.equal(report.status,'partial');assert.equal(report.passed,0);
  assert.equal(report.results[0].category,'not-reached-in-grid');
});

test('Skutečná kapsle najde a projde cestu kolem překážky',()=>{
  const report=run([floor(),box('obstacle',[-.1,0,-.85],[.1,3,.85])]);
  assert.equal(report.status,'pass');assert.equal(report.passed,1);
  assert.ok(report.stats.moves>=4,'Přímá trasa přes překážku nesmí být použita');
});

test('Stejné XY v jiném podlaží není spojení bez schodů',()=>{
  const report=run([floor(),floor('upper',3)], [anchor('entry',-2,0,0,false),anchor('upper-target',-2,0,3)]);
  assert.equal(report.passed,0);assert.equal(report.status,'partial');
});

test('Chybějící podlaha a omezený rozpočet se nepřijmou jako průchod',()=>{
  const gap=run([box('left',[-3,-.2,-2.5],[-.5,0,2.5],'slab'),box('right',[.5,-.2,-2.5],[3,0,2.5],'slab')]);
  assert.equal(gap.passed,0);
  const limited=run([floor()],[anchor('entry',-2,0,0,false),anchor('destination',2)],{maxMoves:1});
  assert.equal(limited.status,'partial');assert.equal(limited.stats.proofLimited,true);assert.equal(limited.passed,0);
});

test('Ani doložená hrana nepřeskočí aktuální zeď bez souvislého přehrání',()=>{
  const nodes=[anchor('entry',-2,0,0,false),anchor('target',2)];
  const scene=makeScene(R,{cadOrigin:[0,0],parts:[floor(),box('wall',[-.01,0,-2.5],[.01,3,2.5])]},settings);
  try {
    const report=probeAccessibility(scene,{nodes,links:[{from:'entry',to:'target',path:nodes.map(n=>n.point),source:'verified-door'}]},['entry'],{spacing:1});
    assert.equal(report.passed,0);assert.equal(report.results[0].category,'candidate-path-not-verified');
    assert.ok(report.failures.some(f=>f.reason==='continuous-capsule-blocked'));
    assert.equal(scene.world.bodies.len(),0);
  } finally {scene.free();}
});

const metadata={modelCollisionSha256:'collision-fixture',modelGlbSha256:'glb-fixture',actorSourceSha256:'actor-fixture',profile:'cad-compact',settings};
function reports(scene,door) {
  const sides=doorApproachGeometry(scene,door).points.map(p=>{
    const support=scene.floorAt(p,door.bottom);return {...p,floor:support?.height??null,support};
  });
  const results=[0,1].map(direction=>{
    const start=sides[direction],target=sides[1-direction];
    if(start.floor===null||target.floor===null)return {id:door.id,direction,start,target,category:'missing-model-floor',passed:false};
    const walker=scene.walker(start);
    try {const setup=walker.settle(),leg=walker.moveTo(target);return {id:door.id,direction,start,target,...setup,leg,category:leg.passed?'passed':'blocked',passed:setup.setupValid&&leg.passed};}
    finally {walker.dispose();}
  });
  return [{...metadata,doorSourceMode:'native-model-annotations',doorSourceSha256:metadata.modelCollisionSha256,results},{...metadata,results:[],accessOverrides:{}}];
}

function stairReport(scene,id,flights) {
  const forward=routePath(scene,flights,flights[0].routeAccessPath??{});
  return {...metadata,accessOverrides:{},results:['up','down'].map(direction=>{
    const path=direction==='up'?forward:[...forward].reverse(),walker=scene.walker(path[0]);
    try {
      const setup=walker.settle(),legs=[];
      if(setup.setupValid)for(const point of path.slice(1)){const leg=walker.moveTo(point);legs.push(leg);if(!leg.passed)break;}
      return {id,direction,path,...setup,legs,passed:setup.setupValid&&legs.length===path.length-1&&legs.every(leg=>leg.passed)};
    } finally {walker.dispose();}
  })};
}

test('Report jiného modelu, profilu nebo fyziky se odmítne',()=>{
  const report={...metadata,results:[]};
  validateReportIdentity(report,metadata,'fixture');
  for(const key of ['modelCollisionSha256','modelGlbSha256','actorSourceSha256','profile'])assert.throws(()=>validateReportIdentity({...report,[key]:'other'},metadata,'fixture'),/identita/);
  assert.throws(()=>validateReportIdentity({...report,settings:{...settings,radius:.42}},metadata,'fixture'),/nastavení/);
});

test('Dveřní report musí souhlasit s anotací a skutečně úspěšnými kroky',()=>{
  const door={id:'door',floor:'n01',hinge:[-.45,0],closedEnd:[.45,0],bottom:0,top:2.1,depth:.12};
  const scene=makeScene(R,{cadOrigin:[0,0],parts:[floor()],doors:[door],stairs:[]},settings);
  try {
    const [doors,routes]=reports(scene,door),evidence=prepareEvidence(scene,metadata,doors,routes);
    assert.equal(evidence.links.length,2);assert.equal(evidence.nodes.length,2);
    const damaged=structuredClone(doors);damaged.results[0].leg.passed=false;
    assert.equal(prepareEvidence(scene,metadata,damaged,routes).links.length,1);
    const shifted=structuredClone(doors);shifted.results[0].start.x+=.2;
    assert.throws(()=>prepareEvidence(scene,metadata,shifted,routes),/body neodpovídají/);
    assert.throws(()=>prepareEvidence(scene,metadata,{...doors,results:doors.results.slice(0,1)},routes),/Neúplný/);
    assert.equal(scene.world.bodies.len(),0);
  } finally {scene.free();}
});

test('Mělký prostor používá shodný zkrácený přístup v reportu i globální evidenci',()=>{
  const door={id:'shallow-door',floor:'n01',hinge:[-.45,0],closedEnd:[.45,0],bottom:0,top:2.1,depth:.12,
    approachBoundaryCad:[null,[0,.65]]};
  const parts=[floor(),box('rear-wall',[-.75,0,-1],[-.65,3,1]),
    box('left-jamb',[-.06,0,-2.5],[.06,3,-.45]),box('right-jamb',[-.06,0,.45],[.06,3,2.5])];
  const scene=makeScene(R,{cadOrigin:[0,0],parts,doors:[door],stairs:[]},settings);
  try {
    const approaches=doorApproachGeometry(scene,door);
    assert.ok(approaches.distances[1]<approaches.distances[0]);
    const [doorReport,routes]=reports(scene,door);
    assert.ok(doorReport.results.every(row=>row.passed),'Oba zkrácené lokální průchody musí fyzicky projít');
    const evidence=prepareEvidence(scene,metadata,doorReport,routes);
    assert.equal(evidence.links.length,2);
    const result=probeAccessibility(scene,evidence,['door:shallow-door:side:0'],{spacing:.5});
    assert.equal(result.status,'pass');assert.equal(result.passed,2);
    const [stale]=reports(scene,{...door,approachBoundaryCad:undefined});
    assert.throws(()=>prepareEvidence(scene,metadata,stale,routes),/Dveřní body neodpovídají/);
    assert.equal(scene.world.bodies.len(),0);
  } finally {scene.free();}
});

test('Samostatně průchozí dveře v oddělené místnosti nejsou dosažitelné od vstupu',()=>{
  const doors=[{id:'left',floor:'n01',hinge:[-.45,2],closedEnd:[.45,2],bottom:0,top:2.1,depth:.12},
    {id:'right',floor:'n01',hinge:[-.45,-2],closedEnd:[.45,-2],bottom:0,top:2.1,depth:.12}];
  const scene=makeScene(R,{cadOrigin:[0,0],parts:[floor(),box('divider',[-.01,0,-2.5],[.01,3,2.5])],doors,stairs:[]},settings);
  try {
    const [first,routes]=reports(scene,doors[0]),[second]=reports(scene,doors[1]);
    const doorReport={...first,results:[...first.results,...second.results]};
    assert.equal(doorReport.results.filter(row=>row.passed).length,4,'Všechny lokální průchody musí opravdu projít');
    const evidence=prepareEvidence(scene,metadata,doorReport,routes);
    const result=probeAccessibility(scene,evidence,['door:left:side:0'],{spacing:1});
    assert.equal(result.cases,4);assert.equal(result.passed,2);assert.equal(result.status,'partial');
    assert.ok(result.results.filter(row=>row.doorId==='right').every(row=>!row.passed));
  } finally {scene.free();}
});

test('Platný průchod ve stejném XY o patro výše nepatří k dolním dveřím',()=>{
  const door={id:'door',floor:'n01',hinge:[-.45,0],closedEnd:[.45,0],bottom:0,top:2.1,depth:.12};
  const scene=makeScene(R,{cadOrigin:[0,0],parts:[floor(),floor('upper',3)],doors:[door],stairs:[]},settings);
  try {
    const [wrongLevel,routes]=reports(scene,{...door,bottom:3,top:5.1});
    assert.ok(wrongLevel.results.every(row=>row.passed),'Horní kontrolní průchod musí být fyzicky platný');
    assert.throws(()=>prepareEvidence(scene,metadata,wrongLevel,routes),/výška dveřního bodu neodpovídá/);
  } finally {scene.free();}
});

test('Prosklení, doložený exteriér bez terénu a neurčený otvor zůstávají odlišené',()=>{
  const door={id:'external',floor:'n01',hinge:[-1,3],closedEnd:[1,3],bottom:0,top:2.1,depth:.12,accessConfirmed:true};
  const scene=makeScene(R,{cadOrigin:[0,0],parts:[floor()],doors:[door],stairs:[]},settings);
  try {
    const [doors,routes]=reports(scene,door);
    let evidence=prepareEvidence(scene,metadata,doors,routes);
    assert.ok(evidence.excluded.some(e=>e.category==='external-pending-terrain'));
    door.accessConfirmed=false;evidence=prepareEvidence(scene,metadata,doors,routes);
    assert.ok(evidence.excluded.some(e=>e.category==='unclassified-missing-support'));
    door.openingClassification='facade-opening-unconfirmed-access';
    const protectedDoors={...doors,results:doors.results.map(row=>({...row,category:'fixed-glazing',passed:true,coverage:{passed:true}}))};
    evidence=prepareEvidence(scene,metadata,protectedDoors,routes);
    assert.equal(evidence.nodes.length,0);assert.equal(evidence.links.length,0);
    assert.equal(evidence.excluded[0].category,'fixed-facade-glazing');assert.equal(evidence.excluded[0].protectionVerified,true);
  } finally {scene.free();}
});

test('Ověřená schodišťová trasa spojí podlaží až po souvislém přehrání',()=>{
  const parts=[box('lower',[-3,-.2,-1.5],[-1,0,1.5],'slab'),box('upper',[1,1,-1.5],[3,1.2,1.5],'slab')];
  for(let i=0;i<10;i++)parts.push(box('step-'+i,[-1+i*.2,-.2,-.7],[-1+(i+1)*.2,(i+1)*.12,.7],'stair'));
  const doors=[{id:'upper-door',floor:'n02',hinge:[-.45,-2],closedEnd:[.45,-2],bottom:1.2,top:3.3,depth:.12}];
  const stairs=[{id:'flight',routeId:'entry-stair',routeIndex:0,routeSegmentCount:1,a:[0,1],b:[0,-1],bottom:0,top:1.2,
    routeAccessPath:{viaCad:[[0,0]]}}];
  const scene=makeScene(R,{cadOrigin:[0,0],parts,doors,stairs},settings);
  try {
    const [doorReport]=reports(scene,doors[0]),routeReport=stairReport(scene,'entry-stair',stairs);
    assert.ok(routeReport.results.every(row=>row.passed),'Fixture sama musí mít skutečně průchozí schodiště');
    const evidence=prepareEvidence(scene,metadata,doorReport,routeReport);
    assert.equal(evidence.nodes.filter(node=>node.id.includes(':waypoint:')).length,0,'Null-height mezibod nesmí být samostatná kotva');
    assert.ok(evidence.links.filter(link=>link.source==='verified-stair').every(link=>link.path.length===3&&link.path[1].floor===null),
      'Null-height portál musí zůstat uvnitř úplné původní hrany v obou směrech');
    const report=probeAccessibility(scene,evidence,['route:entry-stair:lower'],{spacing:1});
    assert.equal(report.status,'pass');assert.equal(report.passed,2);
    assert.ok(report.proofSessions.some(session=>session.steps.some(step=>step.context.to==='route:entry-stair:upper'&&step.passed)));
    const incomplete=structuredClone(routeReport);incomplete.results[0].legs=[];
    const withheld=prepareEvidence(scene,metadata,doorReport,incomplete);
    const blocked=probeAccessibility(scene,withheld,['route:entry-stair:lower'],{spacing:1});
    assert.equal(blocked.passed,0,'Bez úspěšné celé trasy se podlaží nesmí spojit');
    assert.equal(scene.world.bodies.len(),0);
  } finally {scene.free();}
});

test('Dveřní odbočka z mezipodesty je dosažitelná z obou konců celé ověřené trasy',()=>{
  const parts=[box('lower',[-3,-.2,-.8],[-1,0,.8],'slab'),
    box('middle-branch',[0,.4,-.8],[1,.6,3],'stair-landing'),
    box('upper',[2,1,-.8],[4,1.2,.8],'slab')];
  for(let i=0;i<5;i++) {
    parts.push(box('lower-step-'+i,[-1+i*.2,-.2,-.7],[-1+(i+1)*.2,(i+1)*.12,.7],'stair'));
    parts.push(box('upper-step-'+i,[1+i*.2,.4,-.7],[1+(i+1)*.2,.6+(i+1)*.12,.7],'stair'));
  }
  const door={id:'middle-door',floor:'middle',hinge:[-2,-.15],closedEnd:[-2,-.85],bottom:.6,top:2.7,depth:.12};
  const stairs=[{id:'first',routeId:'two-flights',routeIndex:0,routeSegmentCount:2,a:[0,1],b:[0,0],bottom:0,top:.6},
    {id:'second',routeId:'two-flights',routeIndex:1,routeSegmentCount:2,a:[0,-1],b:[0,-2],bottom:.6,top:1.2}];
  const scene=makeScene(R,{cadOrigin:[0,0],parts,doors:[door],stairs},settings);
  try {
    const [doorReport]=reports(scene,door),routeReport=stairReport(scene,'two-flights',stairs);
    assert.ok(routeReport.results.every(row=>row.passed),'Oba směry celé fixture trasy musí fyzicky projít');
    const evidence=prepareEvidence(scene,metadata,doorReport,routeReport);
    for(const side of ['lower','upper']) {
      const report=probeAccessibility(scene,evidence,['route:two-flights:'+side],{spacing:.5});
      assert.equal(report.passed,2,'Odbočka z mezipodesty musí mít skutečnou návaznost od '+side);
      assert.equal(report.status,'pass');
    }
    const unfinished=structuredClone(routeReport);unfinished.results[0].legs.pop();
    const withheld=prepareEvidence(scene,metadata,doorReport,unfinished);
    assert.equal(withheld.links.filter(link=>link.source==='verified-stair'&&link.path.at(-1).floor>link.path[0].floor).length,0,
      'Ani úspěšný první úsek neúplného up reportu nesmí dodat dílčí hranu');
    assert.equal(probeAccessibility(scene,withheld,['route:two-flights:lower'],{spacing:.5}).passed,0);
    assert.equal(probeAccessibility(scene,withheld,['route:two-flights:upper'],{spacing:.5}).passed,2,
      'Samostatný kompletně ověřený down směr musí zůstat použitelný');
    unfinished.results[1].passed=false;
    const noCompletedDirection=prepareEvidence(scene,metadata,doorReport,unfinished);
    assert.equal(noCompletedDirection.links.filter(link=>link.source==='verified-stair').length,0);
    assert.equal(noCompletedDirection.nodes.filter(node=>node.id.includes(':waypoint:')).length,0);
    assert.equal(scene.world.bodies.len(),0);
  } finally {scene.free();}
});

test('Výjimka během souvislého přehrání odstraní živou postavu',()=>{
  const scene=makeScene(R,{cadOrigin:[0,0],parts:[floor()]},settings),createWalker=scene.walker;
  scene.walker=start=>{const walker=createWalker(start);return {...walker,moveTo(){throw new Error('fixture interruption');}};};
  try {
    assert.throws(()=>probeAccessibility(scene,{nodes:[anchor('entry',-2,0,0,false),anchor('target',2)],links:[]},['entry'],{spacing:1}),/fixture interruption/);
    assert.equal(scene.world.bodies.len(),0);
  } finally {scene.free();}
});
