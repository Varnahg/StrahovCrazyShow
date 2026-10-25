import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import {initPhysics} from '../../shared/simulation.ts';
import {profileSettings} from './rapier_model.mjs';
import {validateRoomTours,createNativeActorRuntime,replayRoomTours} from './verify_room_paths.mjs';

await initPhysics();
const settings=profileSettings('current');
const identity={profile:'current',settings,modelCollisionSha256:'fixture-model',modelGlbSha256:'fixture-glb',actorSourceSha256:'fixture-actor'};
function box(id,lo,hi,role='wall'){
  const[x0,y0,z0]=lo,[x1,y1,z1]=hi;
  const p=[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]];
  return {id,floor:'n01',role,positions:p.flat(),indices:[[0,1,2,3],[4,7,6,5],[0,4,5,1],[3,2,6,7],[0,3,7,4],[1,5,6,2]].flatMap(([a,b,c,d])=>[a,b,c,a,c,d])};
}
function fixture(){
  const path=[{cad:[0,-.45],height:0,label:'door-inside',sourceDoorId:'entry'},
    {cad:[0,-2],height:0,label:'before-desk'},{cad:[0,-.45],height:0,label:'door-inside',sourceDoorId:'entry'}];
  const model={id:'fixture',cadOrigin:[0,0],glbSha256:identity.modelGlbSha256,
    parts:[box('floor',[-3,-.2,-2],[3,0,2],'slab')],
    doors:[{id:'entry',floor:'n01',hinge:[-.3125,0],closedEnd:[.3125,0],depth:.12,bottom:0,top:2.1}],
    roomWalkPaths:[{floor:'n01',roomId:'101',usage:'bedroom',usageBasis:'Native fixture classification',doorIds:['entry'],
      walkPathStatus:'candidate-only',requiresActualController:true,walkPathRadius:.27,walkPath:path,walkPathUnresolved:[],walkExtraTargets:[]}]};
  return {id:'fixture',model,placement:{translation:{x:0,y:40,z:0},yaw:0},glbSha256:identity.modelGlbSha256,
    site:{sourceCollisionSha256:identity.modelCollisionSha256}};
}
function runtimeFactory(building,options={}){
  const counts={added:0,removed:0,disposed:0,liveAtDispose:null};
  return {counts,create(){
    const runtime=createNativeActorRuntime(building,settings),add=runtime.add.bind(runtime),remove=runtime.remove.bind(runtime),dispose=runtime.dispose.bind(runtime),tick=runtime.tick.bind(runtime);
    let ticks=0,trapped=false,visitedWc=false,openedWc=false;
    runtime.add=(...args)=>{counts.added++;return add(...args);};
    runtime.remove=id=>{counts.removed++;return remove(id);};
    runtime.dispose=()=>{counts.liveAtDispose=runtime.actors.size;counts.disposed++;return dispose();};
    runtime.tick=()=>{
      ticks++;
      if(options.recovery&&ticks===100)runtime.actors.values().next().value.setPosition({x:1,y:41,z:0});
      if(options.trapReturn&&!trapped&&[...runtime.actors.values()].some(a=>a.position.x>1.9)){
        runtime.world.createCollider(RAPIER.ColliderDesc.cuboid(.01,1.5,2).setTranslation(1,41.5,0));trapped=true;
      }
      if(options.trapRetreat&&[...runtime.actors.values()].some(a=>a.position.x>.7))visitedWc=true;
      if(options.trapRetreat&&visitedWc&&!trapped&&[...runtime.actors.values()].some(a=>a.position.x<-.4&&a.position.z>.4)){
        runtime.world.createCollider(RAPIER.ColliderDesc.cuboid(.45,1.5,.02).setTranslation(-.5,41.5,.65));trapped=true;
      }
      if(options.trapOpeningRetreat){
        if(runtime.doorPhysics.isOpen('b06:wc1'))openedWc=true;
        if(openedWc&&!runtime.doorPhysics.isOpen('b06:wc1')&&!trapped&&[...runtime.actors.values()].some(a=>a.position.z<.05)){
          runtime.world.createCollider(RAPIER.ColliderDesc.cuboid(.45,1.5,.02).setTranslation(-.5,41.5,.35));trapped=true;
        }
      }
      tick();
    };
    return runtime;
  }};
}

test('actual Actor completes and returns through every native room point with full cleanup',()=>{
  const building=fixture(),before=JSON.stringify(building),runtime=runtimeFactory(building);
  const report=replayRoomTours(validateRoomTours(building,identity),runtime.create);
  assert.equal(report.status,'pass');assert.equal(report.passedRooms,1);
  assert.deepEqual(report.results[0].reachedPointIndices,[0,1,2]);
  assert.ok(report.results[0].legs.every(l=>l.traversal==='walk'&&l.support&&l.grounded));
  assert.deepEqual(runtime.counts,{added:1,removed:1,disposed:1,liveAtDispose:0});
  assert.equal(JSON.stringify(building),before);
});

test('interactive room coverage requires an explicit open assumption and retains shared placed door physics',()=>{
  const building=fixture();building.id=building.model.id='b06';
  building.placement.yaw=.38;building.placement.translation.x=12;
  building.model.interactiveDoors=[{id:'b06:entry',buildingId:'b06',floor:'n01',sourceDoorId:'entry',renderPartIds:['native-leaf'],collisionPartIds:[],
    hingeModel:{x:0,y:.015,z:.3125},closedPose:{position:{x:0,y:1.0475,z:0},rotationY:Math.PI/2},
    collider:{halfExtents:{x:.3125,y:1.0325,z:.019}},handleModel:{x:.019,y:1,z:-.2},openAngle:Math.PI/2,defaultOpen:false}];
  assert.throws(()=>validateRoomTours(building,identity),/explicit/);
  const validated=validateRoomTours(building,identity,undefined,'all-interactive-open'),runtime=runtimeFactory(building);
  const report=replayRoomTours(validated,runtime.create);
  assert.equal(report.status,'conditional-pass',JSON.stringify(report));assert.equal(report.tourStatus,'pass');
  assert.equal(report.actorInteractionsVerified,false);assert.equal(report.doorStateAssumption.states[0].open,true);
  assert.equal(runtime.counts.added,1);assert.equal(runtime.counts.liveAtDispose,0);
  const stale=structuredClone(validated);stale.doorStateAssumption.states=[];
  assert.throws(()=>replayRoomTours(stale,runtimeFactory(building).create),/incomplete/);
});

function twoWcFixture(){
  const b=fixture();b.id=b.model.id='b06';
  const cad=(x,z)=>[-z,-x],point=(x,z,sourceDoorId)=>({cad:cad(x,z),height:0,label:'fixture-access',...(sourceDoorId?{sourceDoorId}:{})});
  b.model.parts=[box('floor',[-1.3,-.2,-1.3],[1.3,0,1.7],'slab'),
    box('corridor-left',[-1.05,0,-1.2],[-.95,2.5,1.5]),box('cubicle-back',[1.05,0,-1.2],[1.15,2.5,.65]),
    box('front-top',[-.04,0,.6],[.04,2.5,1.5]),box('front-middle',[-.04,0,-.26],[.04,2.5,0]),box('front-bottom',[-.04,0,-1.2],[.04,2.5,-.86]),
    box('partition-top',[.04,0,.6],[1.05,2.5,.65]),box('partition-between',[.04,0,-.05],[1.05,2.5,0]),box('partition-bottom',[.04,0,-.91],[1.05,2.5,-.86])];
  b.model.doors=[{id:'entry',floor:'n01',hinge:cad(-.9,1.35),closedEnd:cad(-.1,1.35),depth:.12,bottom:0,top:2.1},
    ...[['wc1',0],['wc2',-.86]].map(([id,z])=>({id,floor:'n01',hinge:cad(0,z),closedEnd:cad(0,z+.6),depth:.12,bottom:0,top:2.1}))];
  b.model.interactiveDoors=b.model.doors.map((d,index)=>({id:'b06:'+d.id,buildingId:'b06',floor:'n01',sourceDoorId:d.id,renderPartIds:[d.id+'-leaf'],collisionPartIds:[],
    hingeModel:{x:index?0:-.9,y:.015,z:index===0?1.35:index===1?0:-.86},
    closedPose:{position:{x:index?0:-.5,y:1.0475,z:index===0?1.35:index===1?.3:-.56},rotationY:index?-Math.PI/2:0},
    collider:{halfExtents:{x:index?.3:.4,y:1.0325,z:.019}},handleModel:{x:index?0:-.22,y:1,z:index===0?1.35:index===1?.48:-.38},
    openAngle:index?-Math.PI/2:Math.PI/2,defaultOpen:false}));
  Object.assign(b.model.roomWalkPaths[0],{usage:'wc',doorIds:['entry','wc1','wc2'],walkPath:[
    point(-.5,.9,'entry'),point(-.5,.3,'wc1'),point(.45,.3,'wc1'),point(.75,.3),point(.45,.3,'wc1'),point(-.5,.3,'wc1'),
    point(-.5,-.56,'wc2'),point(.45,-.56,'wc2'),point(.75,-.56),point(-.5,-.56,'wc2'),point(-.5,.9,'entry')]});
  return b;
}

test('a narrow two-WC room requires real opening, visited-trail retreat and safe closing instead of open-all',()=>{
  const b=twoWcFixture(),before=JSON.stringify(b),conditionalRuntime=runtimeFactory(b);
  const conditional=replayRoomTours(validateRoomTours(b,identity,undefined,'all-interactive-open'),conditionalRuntime.create);
  assert.equal(conditional.status,'partial');assert.equal(conditional.results[0].legs.at(-1).pointIndex,6);
  const runtime=runtimeFactory(b),report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create);
  assert.equal(report.status,'pass',JSON.stringify(report));assert.equal(report.proofMode,'actor-interaction');assert.equal(report.actorInteractionsVerified,true);
  const row=report.results[0];assert.deepEqual(row.reachedPointIndices,b.model.roomWalkPaths[0].walkPath.map((_,i)=>i));
  assert.equal(row.initialDoorState.mode,'closed-default');assert.ok(row.interactionManeuvers.some(m=>m.completed));
  assert.ok(row.doorInteractions.some(e=>e.doorId==='b06:wc1'&&e.requestedOpen===false&&e.result.status==='changed'&&e.guard.allowed));
  const changed=new Set();let last=-Infinity;
  for(const e of row.doorInteractions){
    assert.ok(e.tick-last>=row.interactionPolicy.minimumIntervalFrames);last=e.tick;
    if(e.result.status==='changed'){const key=e.intent.leg+':'+e.doorId;assert.ok(!changed.has(key));changed.add(key);}
  }
  assert.ok(row.legs.some(l=>l.interactionDetourFrames>0));assert.ok(row.legs.every(l=>l.traversal==='walk'));
  for(const m of row.interactionManeuvers)assert.ok(m.points.every(p=>p.visitedAtTick<=m.plannedAtTick));
  assert.deepEqual(runtime.counts,{added:1,removed:1,disposed:1,liveAtDispose:0});
  assert.equal(JSON.stringify(b),before,'Interaction planning must not change the native geometry or mandatory tour points');
});

test('a new obstruction on the measured retreat remains partial and cannot trigger an unsafe close or teleport',()=>{
  const b=twoWcFixture(),runtime=runtimeFactory(b,{trapRetreat:true});
  const report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'partial');assert.ok(row.interactionManeuvers.some(m=>!m.completed));assert.ok(!row.reachedPointIndices.includes(6));
  assert.ok(!row.doorInteractions.some(e=>e.doorId==='b06:wc1'&&e.requestedOpen===false&&e.result.status==='changed'));
  assert.equal(runtime.counts.disposed,1);assert.equal(runtime.counts.liveAtDispose,0);
});

test('interaction mode keeps independent tours closed initially and rejects mixed/open or foreign-door evidence',()=>{
  const b=twoWcFixture();b.model.roomWalkPaths.push({...structuredClone(b.model.roomWalkPaths[0]),roomId:'102'});
  assert.throws(()=>validateRoomTours(b,identity,undefined,'all-interactive-open','actor-interaction'),/cannot assume/);
  assert.throws(()=>validateRoomTours(b,identity,undefined,undefined,'invented'),/Unknown/);
  const runtime=runtimeFactory(b),report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create);
  assert.equal(report.passedRooms,2,JSON.stringify(report));assert.ok(report.results.every(r=>r.initialDoorState.allLeavesClosed));
  assert.ok(report.results.every(r=>r.doorInteractions.find(e=>e.doorId==='b06:wc1')?.requestedOpen===true));
  assert.equal(runtime.counts.added,2);assert.equal(runtime.counts.removed,2);assert.equal(runtime.counts.disposed,1);
  b.model.roomWalkPaths[0].walkPath[1].sourceDoorId='foreign';assert.throws(()=>validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),/foreign/);
});

function tightEntryFixture(){
  const b=twoWcFixture(),d=b.model.doors[0],definition=b.model.interactiveDoors[0];
  d.hinge=[-1.05,.95];d.closedEnd=[-1.05,.15];d.sourceEntities=['native-entry-fixture'];
  definition.hingeModel={x:-.95,y:.015,z:1.05};definition.closedPose.position={x:-.55,y:1.0475,z:1.05};definition.handleModel={x:-.27,y:1,z:1.05};
  const path=b.model.roomWalkPaths[0].walkPath;
  path[0]={cad:[-.65,.55],height:0,label:'door-inside',sourceDoorId:'entry'};path[path.length-1]={...path[0],cad:[...path[0].cad]};
  return b;
}

function reopenFixture(){
  const b=twoWcFixture(),p=(x,z,sourceDoorId)=>({cad:[-z,-x],height:0,label:'fixture-access',...(sourceDoorId?{sourceDoorId}:{})});
  b.model.roomWalkPaths[0].walkPath=[p(-.5,.9,'entry'),p(-.5,-.1),p(-.5,.3,'wc1'),p(.45,.3,'wc1'),p(.75,.3),p(-.5,.3,'wc1'),p(-.5,.9,'entry')];
  return b;
}

test('a previously opened and safely closed WC reopens after an actual retreat to its visited safe stance',()=>{
  const b=reopenFixture(),runtime=runtimeFactory(b),report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'pass',JSON.stringify(report));
  assert.deepEqual(row.reachedPointIndices,b.model.roomWalkPaths[0].walkPath.map((_,i)=>i));
  assert.deepEqual(row.doorInteractions.filter(e=>e.doorId==='b06:wc1'&&e.result.status==='changed').map(e=>e.requestedOpen),[true,false,true]);
  const maneuver=row.interactionManeuvers.find(m=>m.requestedOpen===true);
  assert.ok(maneuver?.completed);assert.ok(maneuver.points.every(p=>p.visitedAtTick<=maneuver.plannedAtTick));
  assert.ok(row.legs.some(l=>l.interactionDetourFrames>0));assert.ok(row.legs.every(l=>l.traversal==='walk'));
  assert.equal(runtime.counts.liveAtDispose,0);
});

test('an obstructed retreat for reopening cannot fabricate a successful open or a room PASS',()=>{
  const b=reopenFixture(),runtime=runtimeFactory(b,{trapOpeningRetreat:true});
  const report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'partial');assert.ok(row.interactionManeuvers.some(m=>m.requestedOpen===true&&!m.completed));
  assert.equal(row.doorInteractions.filter(e=>e.doorId==='b06:wc1'&&e.requestedOpen&&e.result.status==='changed').length,1);
  assert.ok(!row.reachedPointIndices.includes(3));assert.equal(runtime.counts.liveAtDispose,0);
});

test('opening can continue backwards along visited points before resuming past the open leaf tip',()=>{
  const b=twoWcFixture(),p=(x,z,sourceDoorId)=>({cad:[-z,-x],height:0,label:'fixture-access',...(sourceDoorId?{sourceDoorId}:{})});
  b.model.parts=b.model.parts.filter(p=>!['floor','corridor-left'].includes(p.id));
  b.model.parts.push(box('floor',[-2.5,-.2,-1.3],[1.3,0,1.7],'slab'),box('corridor-left',[-2.55,0,-1.2],[-2.45,2.5,1.5]));
  b.model.doors[0].hinge[1]=2.2;b.model.doors[0].closedEnd[1]=1.4;
  const d=b.model.interactiveDoors[0];d.hingeModel.x=-2.2;d.closedPose.position.x=-1.8;d.handleModel.x=-1.52;
  b.model.roomWalkPaths[0].walkPath=[p(-1.8,.9,'entry'),p(-1.8,-.1,'wc2'),p(-.9,-.2),p(-.5,-.1),
    p(-.5,.3,'wc1'),p(.45,.3,'wc1'),p(.75,.3),p(-.5,.3,'wc1'),p(-1.8,.9,'entry')];
  const runtime=runtimeFactory(b),report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'pass',JSON.stringify(report));
  const maneuver=row.interactionManeuvers.find(m=>m.requestedOpen&&m.points.length>m.changeAfterPoint);
  assert.ok(maneuver?.completed);assert.ok(maneuver.finishedAtTick>maneuver.changedAtTick);
  assert.ok(maneuver.points.every(p=>p.visitedAtTick<=maneuver.plannedAtTick));
  assert.equal(row.reachedPointIndices.length,b.model.roomWalkPaths[0].walkPath.length);assert.equal(runtime.counts.liveAtDispose,0);
});

test('an initially occluded native handle can be opened later from a physically reached visible stance',()=>{
  const b=twoWcFixture(),p=(x,z,sourceDoorId)=>({cad:[-z,-x],height:0,label:'fixture-access',...(sourceDoorId?{sourceDoorId}:{})});
  b.model.parts=b.model.parts.filter(p=>!['floor','corridor-left'].includes(p.id));
  b.model.parts.push(box('floor',[-1.3,-.2,-1.3],[1.3,0,3.7],'slab'),box('corridor-left',[-1.05,0,-1.2],[-.95,2.5,3.5]),
    box('handle-occluder',[-.18,0,.95],[-.08,2.5,2.7]));
  b.model.doors[0].hinge[0]=-3.35;b.model.doors[0].closedEnd[0]=-3.35;
  const d=b.model.interactiveDoors[0];d.hingeModel.z=d.closedPose.position.z=d.handleModel.z=3.35;
  b.model.roomWalkPaths[0].walkPath=[p(-.5,2.9,'entry'),p(-.5,.3,'wc1'),p(.45,.3,'wc1'),p(.75,.3),p(-.5,.3,'wc1'),p(-.5,2.9,'entry')];
  const runtime=runtimeFactory(b),report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'pass',JSON.stringify(report));
  const denied=row.doorInteractions.find(e=>e.result.reason==='occluded'),opened=row.doorInteractions.find(e=>e.doorId==='b06:wc1'&&e.requestedOpen&&e.result.status==='changed');
  assert.ok(denied&&opened);assert.ok(opened.tick>denied.tick);assert.ok(Math.hypot(opened.position.x-denied.position.x,opened.position.z-denied.position.z)>.15);
  assert.ok(row.doorInteractions.length<=12);assert.equal(runtime.counts.liveAtDispose,0);
});

test('a tight initial stance is physically prepared from the native entry plane before opening the first WC',()=>{
  const b=tightEntryFixture(),runtime=runtimeFactory(b),before=JSON.stringify(b);
  const report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'pass',JSON.stringify(report));const prep=row.entryPreparation;
  assert.equal(prep.status,'completed');assert.ok(prep.movement.passed&&prep.movement.frames>0);assert.equal(prep.movement.arrivalTolerance,.01);
  assert.equal(prep.opening.passed,true);assert.ok(prep.standOff>=.32&&prep.standOff<=.36);
  assert.ok(Math.hypot(prep.target.x-prep.from.x,prep.target.z-prep.from.z)<=.14);
  assert.deepEqual(prep.sourceEntities,['native-entry-fixture']);assert.equal(prep.returnedToFirstMandatoryPoint,true);
  assert.ok(prep.attempted.some(p=>p.clearSweep&&p.overlaps.length===0&&p.openingGuard?.allowed));
  assert.equal(row.reachedPointIndices.length,b.model.roomWalkPaths[0].walkPath.length);
  assert.equal(JSON.stringify(b),before);assert.ok(row.interactionManeuvers.some(m=>m.completed));
});

test('entry preparation can serve a later annotated cubicle whose swing intersects the initial capsule',()=>{
  const b=tightEntryFixture(),original=b.model.roomWalkPaths[0].walkPath;
  b.model.roomWalkPaths[0].walkPath=[original[0],...original.slice(6,10),original[0],...original.slice(1,6),original.at(-1)];
  const runtime=runtimeFactory(b),report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'pass',JSON.stringify(report));
  assert.equal(b.model.roomWalkPaths[0].walkPath[1].sourceDoorId,'wc2');assert.equal(row.entryPreparation.intendedSourceDoorId,'wc1');
  assert.equal(row.entryPreparation.status,'completed');assert.ok(row.entryPreparation.movement.frames>0);
  assert.equal(row.reachedPointIndices.length,b.model.roomWalkPaths[0].walkPath.length);assert.equal(runtime.counts.liveAtDispose,0);
});

test('overlap in a source-derived preparation stance never becomes a movement PASS',()=>{
  const b=tightEntryFixture();b.model.parts.push(box('preparation-obstruction',[-.95,0,.94],[0,2.5,.98]));
  const runtime=runtimeFactory(b),report=replayRoomTours(validateRoomTours(b,identity,undefined,undefined,'actor-interaction'),runtime.create),row=report.results[0];
  assert.equal(report.status,'partial');assert.equal(row.entryPreparation.status,'unavailable');
  assert.ok(row.entryPreparation.attempted.some(p=>p.overlaps?.length));assert.equal(row.entryPreparation.movement,undefined);
  assert.equal(row.actorInteractionsVerified,false);assert.equal(runtime.counts.liveAtDispose,0);
});

test('furniture is an actual collision and a candidate tour can route around it',()=>{
  for(const around of [false,true]){
    const building=fixture();building.model.parts.push(box('cabinet',[1,0,-.4],[1.5,1.5,.4],'interior-furniture/storage'));
    const room=building.model.roomWalkPaths[0];
    if(around){
      const p=(x,z)=>({cad:[-z,-x],height:0,label:'furniture-corner'});
      room.walkPath=[room.walkPath[0],p(.5,-1),p(2,-1),p(2,0),p(2,-1),p(.5,-1),room.walkPath[0]];
    }
    const runtime=runtimeFactory(building),report=replayRoomTours(validateRoomTours(building,identity),runtime.create);
    assert.equal(report.status,around?'pass':'partial');
    if(!around)assert.ok(report.results[0].legs.at(-1).contacts.some(c=>c.part?.id==='cabinet'));
    assert.equal(runtime.counts.removed,1);assert.equal(runtime.counts.disposed,1);
  }
});

test('a blocked return does not become a room PASS after the far target was reached',()=>{
  const building=fixture(),runtime=runtimeFactory(building,{trapReturn:true});
  const report=replayRoomTours(validateRoomTours(building,identity),runtime.create);
  assert.equal(report.status,'partial');assert.equal(report.passedRooms,0);
  assert.deepEqual(report.results[0].reachedPointIndices,[0,1]);
  assert.equal(report.results[0].legs.at(-1).passed,false);
  assert.equal(runtime.counts.liveAtDispose,0);
});

test('missing support and Actor recovery cannot manufacture continuous room proof',()=>{
  for(const recovery of [false,true]){
    const building=fixture();if(!recovery)building.model.parts=[box('small-floor',[-1,-.2,-2],[.8,0,2],'slab')];
    const runtime=runtimeFactory(building,{recovery}),report=replayRoomTours(validateRoomTours(building,identity),runtime.create);
    assert.equal(report.status,'partial');assert.equal(report.passedRooms,0);
    assert.match(report.results[0].error,recovery?/Forbidden Actor teleport/:/support/);
    assert.deepEqual(runtime.counts,{added:1,removed:1,disposed:1,liveAtDispose:0});
  }
});

test('actual supporting furniture at the wrong height cannot replace the room floor reference',()=>{
  const building=fixture();building.model.parts.push(box('raised-platform',[1.7,0,-.5],[2.3,.4,.5],'interior-furniture/storage'));
  const runtime=runtimeFactory(building),report=replayRoomTours(validateRoomTours(building,identity),runtime.create);
  assert.equal(report.status,'partial');assert.match(report.results[0].error,/reference differs/);
});

test('a source-normal offset is physically walked from the canonical native approach',()=>{
  const building=fixture();building.model.doors[0].normalOffset=.06;
  const runtime=runtimeFactory(building),report=replayRoomTours(validateRoomTours(building,identity),runtime.create);
  assert.equal(report.status,'pass');assert.ok(report.results[0].legs[0].frames>0);
  assert.ok(Math.abs(report.results[0].setup.position.x-.39)<.02);
});

test('subset and extra shower targets remain visibly partial even when selected ordinary tours pass',()=>{
  const building=fixture(),first=building.model.roomWalkPaths[0];
  first.walkExtraTargets=[{cad:[0,-2.5],height:.055,label:'shower-centre',reason:'Actual CAD neck .50m is narrower than the .54m capsule'}];
  building.model.roomWalkPaths.push({...structuredClone(first),roomId:'102'});
  const runtime=runtimeFactory(building),report=replayRoomTours(validateRoomTours(building,identity,'n01:101'),runtime.create);
  assert.equal(report.expectedRooms,2);assert.equal(report.selectedRooms,1);assert.equal(report.passedRooms,1);
  assert.equal(report.status,'partial');assert.deepEqual(report.unselectedRooms,['n01:102']);
  assert.equal(report.unverifiedExtraTargets.length,2);assert.ok(report.unverifiedExtraTargets.every(p=>p.status==='not-verified'));
});

test('identity, profile, native door, return, height and finite coordinates are validated before physics',()=>{
  for(const change of [
    b=>{b.site.sourceCollisionSha256='other';},b=>{b.model.glbSha256='other';},
    b=>{b.model.roomWalkPaths[0].walkPath[0].sourceDoorId='made-up';},
    b=>{b.model.roomWalkPaths[0].walkPath.pop();},
    b=>{b.model.roomWalkPaths[0].walkPath[1].height=3;},
    b=>{b.model.roomWalkPaths[0].walkPath[1].cad[0]=NaN;},
    b=>{b.model.roomWalkPaths[0].walkPath[1].support={height:0,capsuleFootHeight:1};},
    b=>{b.model.doors[0].openingClassification='fixed-paired-door-leaf';},
  ]){const b=fixture();change(b);assert.throws(()=>validateRoomTours(b,identity));}
  assert.throws(()=>validateRoomTours(fixture(),{...identity,profile:'cad-compact'}),/current Actor/);
  assert.throws(()=>validateRoomTours(fixture(),{...identity,settings:{...settings,radius:.42}}),/settings mismatch/);
});
