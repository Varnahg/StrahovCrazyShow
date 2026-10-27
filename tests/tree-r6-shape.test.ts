import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Pure authoring module is intentionally JavaScript.
import {applyTransform, buildShapePlan, sample, segmentDistance} from '../scripts/trees-20261026-r6/shape-plan.mjs';
const fixture=[
  {id:50,parent:null,attachmentT:0,points:[[0,0,0],[0,0,10]]},
  {id:90,parent:50,attachmentT:.2,points:[[0,0,2],[2,0,3]]},
  {id:7,parent:90,attachmentT:.5,points:[[1,0,2.5],[1,2,3]]},
  {id:14,parent:50,attachmentT:.8,points:[[0,0,8],[-1,0,9]]},
];
const edits=[{id:90,t:.3,yaw:35,elevation:20,group:1},{id:14,t:.9,yaw:-20,elevation:15,group:2}];
const close=(a:number[],b:number[])=>assert.ok(Math.hypot(...a.map((v,i)=>v-b[i]))<1e-10);
test('complete stable subtree coverage uses IDs rather than array order',()=>{
 const frozen=JSON.stringify(fixture),p=buildShapePlan(fixture,50,edits);
 assert.deepEqual(p,buildShapePlan([...fixture].reverse(),50,edits));
 assert.deepEqual(p.transforms.map((t:any)=>t.branchIds),[[7,90],[14]]);assert.equal(JSON.stringify(fixture),frozen);
});
test('parent anchors and descendant junctions remain attached after rigid transforms',()=>{
 const t=buildShapePlan(fixture,50,edits).transforms[0];
 close(applyTransform(t,fixture[1].points[0]),sample(fixture[0],.3));
 close(applyTransform(t,fixture[2].points[0]),applyTransform(t,sample(fixture[1],.5)));
});
test('rotation preserves distances and handedness of complete leaf geometry',()=>{
 const t=buildShapePlan(fixture,50,edits).transforms[0];const p=[[.8,.2,2.5],[.9,.3,2.6],[1,.1,2.7]],q=p.map(v=>applyTransform(t,v));
 for(let i=0;i<3;i++)for(let j=0;j<3;j++)assert.ok(Math.abs(Math.hypot(...p[i].map((v,k)=>v-p[j][k]))-Math.hypot(...q[i].map((v:number,k:number)=>v-q[j][k])))<1e-12);
 const r=t.rotation;const det=r[0][0]*(r[1][1]*r[2][2]-r[1][2]*r[2][1])-r[0][1]*(r[1][0]*r[2][2]-r[1][2]*r[2][0])+r[0][2]*(r[1][0]*r[2][1]-r[1][1]*r[2][0]);assert.ok(Math.abs(det-1)<1e-12);
});
test('rejects missing children, cycles, detached supports and invalid parameters',()=>{
 assert.throws(()=>buildShapePlan(fixture,50,edits.slice(0,1)),/exactly/);
 assert.throws(()=>buildShapePlan([...fixture,{...fixture[0]}],50,edits),/Duplicate/);
 assert.throws(()=>buildShapePlan(fixture.map(b=>b.id===50?{...b,parent:7}:b),50,edits),/cycle/);
 assert.throws(()=>buildShapePlan(fixture.map(b=>b.id===90?{...b,points:[[1,0,2],[2,0,3]]}:b),50,edits),/Detached/);
 assert.throws(()=>buildShapePlan(fixture,50,edits.map(e=>({...e,t:1.1}))),/sample/);
});
test('crossing distance detects intersections, parallel clearance and degenerate segments',()=>{
 assert.equal(segmentDistance([0,0,0],[2,0,0],[1,-1,0],[1,1,0]).distance,0);
 assert.equal(segmentDistance([0,0,0],[2,0,0],[0,0,3],[2,0,3]).distance,3);
 assert.equal(segmentDistance([0,0,0],[0,0,0],[0,0,3],[2,0,3]).distance,3);
});
