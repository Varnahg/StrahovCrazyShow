import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import RAPIER from "@dimforge/rapier3d-compat";
import earcut from "earcut";
import {TERRAIN_PATCH} from "../shared/terrain-patches";
import {groundHeight,legacyGroundHeight,sourceGroundHeight,buildingBaseHeight,createTerrainTiles,terrainCollisionData,drapeTriangles} from "../shared/terrain";
import {BUILDINGS,GROUND_RECTS,TERRAIN_COVERAGE} from "../shared/world";
import {Simulation,initPhysics} from "../shared/simulation";
import {B6_ENTRY_PAVING,streetSurfaceAt,isStreetSurface} from "../shared/streets";
import {B6_LAYOUT,b6EntranceHeight} from "../shared/b6-interior";
const idle={x:0,z:0,yaw:0,jump:false,seq:0};
test("north court plane is a local reconstruction backed by original red ground and preserves raw DMR bytes",()=>{
  assert.equal(createHash('sha256').update(readFileSync('shared/data/terrain-grid.json')).digest('hex'),TERRAIN_PATCH.rawTerrainSha256);
  assert.equal(TERRAIN_PATCH.measured,false);assert.equal(TERRAIN_PATCH.planeEvidence.sourceIPR2023RedTriangles,156);
  assert.ok(TERRAIN_PATCH.planeEvidence.sourceIPRPlaneMinusDMRPlaneRangeM.every(v=>Math.abs(v)<.071));
  const points=TERRAIN_PATCH.court.points as[number,number][],data=drapeTriangles(points,earcut(points.flat(),[],2));
  for(let i=0;i<data.positions.length;i+=3){const[x,y,z]=data.positions.slice(i,i+3),[a,b,c]=TERRAIN_PATCH.targetPlane;assert.ok(Math.abs(y-(a*x+b*z+c))<1e-7,'all clipped sport vertices must be on the same source-supported plane');}
  assert.ok(Math.abs(legacyGroundHeight(4,-137.6)-groundHeight(4,-137.6))>.8,'the actual reported one-metre bump must be removed');
  assert.notEqual(sourceGroundHeight(4,-137.6),groundHeight(4,-137.6));
});
test("all building foundations and outside source terrain stay at their prior elevations",()=>{
  const changes=[];
  for(const building of BUILDINGS){const values=building.points.map(([x,z])=>legacyGroundHeight(x,z)).sort((a,b)=>a-b),i=Math.floor(values.length/2),before=values.length%2?values[i]:(values[i-1]+values[i])/2,after=buildingBaseHeight(building.points);if(Math.abs(after-before)>1e-7)changes.push({id:building.id,before,after});}
  assert.deepEqual(changes,[],'a foundation change requires coordinated archive work');
  for(let x=-40;x<=40;x+=1.37)for(let z=-165;z<=-95;z+=1.31){const b=TERRAIN_PATCH.bounds;if(x<b.minX||x>b.maxX||z<b.minZ||z>b.maxZ)assert.equal(groundHeight(x,z),legacyGroundHeight(x,z));}
});
test("canonical court breaklines are identical in terrain collider, sampler and draped surfaces",async()=>{
  await initPhysics();const world=new RAPIER.World({x:0,y:-18,z:0}),collision=terrainCollisionData(createTerrainTiles(GROUND_RECTS,TERRAIN_COVERAGE));
  world.createCollider(RAPIER.ColliderDesc.trimesh(collision.vertices,collision.indices,RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES));world.step();
  try{
    let count=0;for(let x=-23.71;x<27.8;x+=.77)for(let z=-147.81;z<-108.1;z+=.79){const ray=new RAPIER.Ray({x,y:40,z},{x:0,y:-1,z:0}),hit=world.castRay(ray,80,true);assert.ok(hit,`terrain gap at ${x},${z}; sampler=${groundHeight(x,z)}`);assert.ok(Math.abs(40-hit.timeOfImpact-groundHeight(x,z))<.00005,`patch sampler/collider mismatch ${x},${z}`);count++;}assert.ok(count>3000);
    const points:[number,number][]=[[-22,-145],[26,-145],[26,-110],[-22,-110]],drape=drapeTriangles(points,[0,1,2,0,2,3],.018);
    for(let i=0;i<drape.indices.length;i+=3){const p=drape.indices.slice(i,i+3).map(j=>drape.positions.slice(j*3,j*3+3)),x=p.reduce((s,v)=>s+v[0],0)/3,z=p.reduce((s,v)=>s+v[2],0)/3,y=p.reduce((s,v)=>s+v[1],0)/3;assert.ok(Math.abs(y-groundHeight(x,z)-.018)<1e-6);}
  }finally{world.free();}
});
test("whole-world character crosses the repaired north court and apron without jump, teleport or resting vibration",async()=>{
  await initPhysics();const sim=new Simulation(),actor=sim.add('north-court',{x:-19,y:groundHeight(-19,-128)+.9,z:-128});actor.setPosition=()=>assert.fail('court walking cannot teleport');
  try{
    for(let tick=0;tick<20;tick++){actor.step(idle);sim.tick(0);}
    for(const[x,z]of[[ -10,-128],[0,-128],[15,-128],[25,-128],[15,-128],[0,-128]]as[number,number][]){let reached=false;for(let tick=0;tick<600;tick++){const dx=x-actor.position.x,dz=z-actor.position.z,d=Math.hypot(dx,dz);if(d<.13){reached=true;break;}actor.step({...idle,x:dx/d,z:dz/d});sim.tick(0);assert.ok(actor.position.y-groundHeight(actor.position.x,actor.position.z)>.7);}assert.ok(reached,JSON.stringify(actor.position));}
    const resting=[];for(let tick=0;tick<180;tick++){actor.step(idle);sim.tick(0);if(tick>30)resting.push(actor.position.y);}assert.ok(Math.max(...resting)-Math.min(...resting)<.003);
  }finally{sim.dispose();}
});
test("source-informed B6 paving joins the mapped west footway to the existing north stairs without a straight grass strip",async()=>{
  assert.equal(B6_ENTRY_PAVING.measured,false);assert.equal(B6_ENTRY_PAVING.sourceOsmWayId,"25920440");
  assert.equal(createHash('sha256').update(readFileSync('shared/data/streets.json')).digest('hex'),B6_ENTRY_PAVING.sourceStreetSha256);
  const points=B6_ENTRY_PAVING.points as[number,number][];
  for(let segment=1;segment<points.length;segment++)for(let i=0;i<=20;i++){const t=i/20,x=points[segment-1][0]*(1-t)+points[segment][0]*t,z=points[segment-1][1]*(1-t)+points[segment][1]*t;assert.ok(streetSurfaceAt(x,z),`connector gap at${x},${z}`);}
  assert.equal(streetSurfaceAt(-4.85,-87),undefined,'do not invent a straight road-to-door walkway across the lawn');
  await initPhysics();const sim=new Simulation(),actor=sim.add('entry-paving',{x:-9.537,y:groundHeight(-9.537,-89.279)+.9,z:-89.279});actor.setPosition=()=>assert.fail('paved entry route cannot teleport');
  const route=[...points,[B6_LAYOUT.entry.x,-77.35],[B6_LAYOUT.entry.x,-73]]as[number,number][];
  try{
    for(let tick=0;tick<30;tick++){actor.step(idle);sim.tick(0);}
    for(const[x,z]of[...route,...route.slice(0,-1).reverse()]as[number,number][]){let reached=false;for(let tick=0;tick<700;tick++){const dx=x-actor.position.x,dz=z-actor.position.z,d=Math.hypot(dx,dz);if(d<.13){reached=true;break;}actor.step({...idle,x:dx/d,z:dz/d});sim.tick(0);const foot=b6EntranceHeight(actor.position.x,actor.position.z)??(actor.position.z>B6_LAYOUT.entry.z?B6_LAYOUT.foundationOffset:groundHeight(actor.position.x,actor.position.z));assert.ok(actor.position.y>foot+.65);}assert.ok(reached,`paved approach blocked ${x},${z}: ${JSON.stringify(actor.position)}`);}
  }finally{sim.dispose();}
});
test("optional paved edge margin keeps prior point semantics and clears grass only close to real edges",()=>{
  for(let x=-25;x<25;x+=1.17)for(let z=-100;z<-65;z+=1.31)assert.equal(isStreetSurface(x,z,0),streetSurfaceAt(x,z)!==undefined);
  assert.equal(streetSurfaceAt(-3.4,-81.8),undefined);assert.equal(isStreetSurface(-3.4,-81.8,.35),true,'grass clearance reaches15cm beyond the actual connector edge');
  assert.equal(isStreetSurface(-3.1,-81.8,.35),false,'45cm away is outside the35cm clearance');
  assert.equal(isStreetSurface(8,-55,.35),false,'building/cutout interiors do not turn into paving merely because a buffer is requested');
});
