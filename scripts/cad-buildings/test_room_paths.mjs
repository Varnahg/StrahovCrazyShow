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
    let ticks=0,trapped=false;
    runtime.add=(...args)=>{counts.added++;return add(...args);};
    runtime.remove=id=>{counts.removed++;return remove(id);};
    runtime.dispose=()=>{counts.liveAtDispose=runtime.actors.size;counts.disposed++;return dispose();};
    runtime.tick=()=>{
      ticks++;
      if(options.recovery&&ticks===100)runtime.actors.values().next().value.setPosition({x:1,y:41,z:0});
      if(options.trapReturn&&!trapped&&[...runtime.actors.values()].some(a=>a.position.x>1.9)){
        runtime.world.createCollider(RAPIER.ColliderDesc.cuboid(.01,1.5,2).setTranslation(1,41.5,0));trapped=true;
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
