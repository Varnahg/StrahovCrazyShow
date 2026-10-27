import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Pure JavaScript authoring helper.
import {buildCrownPlan,transformAxes,CROWN_EDITS,applyTransform} from '../scripts/trees-20261026-r6-crown/plan.mjs';
// @ts-expect-error Existing immutable R6 helper.
import {B5_BRANCH3_EDITS,sample} from '../scripts/trees-20261026-r6/shape-plan.mjs';
function fixture(){
 const branches:any[]=[{id:0,parent:null,attachmentT:0,depth:0,points:[[0,0,0],[0,0,10]],radii:[.5,.1]}];
 for(let id=1;id<=8;id++){
  const parent={id,parent:0,attachmentT:id/10,depth:1,points:[[0,0,id],[6,0,id+4]],radii:[.2,.01]};branches.push(parent);
  const edits=id===3?B5_BRANCH3_EDITS:CROWN_EDITS[id];
  edits.forEach((edit:any,index:number)=>{
   const t=.08+.076*index,p=sample(parent,t),end=p.map((v:number,k:number)=>v+[.5,.8,.4][k]);
   const child={id:edit.id,parent:id,attachmentT:t,depth:2,points:[p,end],radii:[.05,.005]};branches.push(child);
   const anchor=sample(child,.5);branches.push({id:edit.id+1,parent:edit.id,attachmentT:.5,depth:3,points:[anchor,anchor.map((v:number,k:number)=>v+[.2,.1,.3][k])],radii:[.005,.002]});
  });
 }
 return branches;
}
test('crown has 96 disjoint complete transforms and untouched primary axes',()=>{
 const a=fixture(),before=JSON.stringify(a),p=buildCrownPlan(a),updated=transformAxes(a,p);
 assert.equal(p.transforms.length,96);assert.equal(new Set(p.transforms.flatMap((t:any)=>t.branchIds)).size,192);
 for(let id=0;id<=8;id++)assert.deepEqual(updated.find((b:any)=>b.id===id),a.find(b=>b.id===id));
 assert.equal(JSON.stringify(a),before);
 assert.deepEqual(p,buildCrownPlan([...a].reverse()));
});
test('96 new anchors and all descendant junctions match updated source axes',()=>{
 const a=fixture(),p=buildCrownPlan(a),updated=transformAxes(a,p),by=new Map(updated.map((b:any)=>[b.id,b]));
 for(const b of updated){if(b.parent===null)continue;const anchor=sample(by.get(b.parent),b.attachmentT);assert.ok(Math.hypot(...anchor.map((v:number,i:number)=>v-b.points[0][i]))<1e-10);}
});
test('accepted branch3 matrices survive unchanged; group layouts are distinct',()=>{
 const p=buildCrownPlan(fixture());assert.deepEqual(p.transforms.filter((t:any)=>t.parentId===3).map(({id,t,yaw,elevation,group}:any)=>({id,t,yaw,elevation,group})),B5_BRANCH3_EDITS);
 assert.deepEqual(p.parents.map((p:any)=>p.groupCount),[3,4,3,2,3,4,2,3]);
 assert.equal(new Set(p.parents.map((parent:any)=>JSON.stringify(p.transforms.filter((t:any)=>t.parentId===parent.id).map((t:any)=>t.t)))).size,8);
});
test('one delta keeps corresponding near/MID/FAR source corners consistent',()=>{
 const t=buildCrownPlan(fixture()).transforms[0],leaf=[[1,2,3],[1.1,2,3],[1,2.1,3.01],[1.1,2.1,3.01],[1,2.2,3],[1.1,2.2,3]];
 const near=leaf.map(p=>applyTransform(t,p)),corners=[0,1,5,4];
 const mid=corners.map(i=>applyTransform(t,leaf[i]));assert.deepEqual(mid,corners.map(i=>near[i]));
 assert.equal(mid.length,4);
});
