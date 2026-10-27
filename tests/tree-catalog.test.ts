import test from 'node:test';
import assert from 'node:assert/strict';
import { TREES } from '../shared/world';
import { treeTrunkCollision } from '../shared/vegetation';
import { groundHeight } from '../shared/terrain';
// @ts-expect-error Pure JavaScript authoring module.
import { buildTreeCatalog } from '../scripts/trees-20261026-catalog/catalog.mjs';
// @ts-expect-error Pure JavaScript authoring module.
import { createAxisFit, fitAxes, validateAxes, sampleAxis, relocateLeafComponent, prepareLeafAnchors } from '../scripts/trees-20261026-catalog/fit.mjs';

const shape = { height: 10, crownDiameter: 6, trunkRadius: .3, crownMinorRatio: .8, crownAzimuth: .3, crownOffset: [.2, -.1] };
function fixture() {
  const root = { id: 5, parent: null, attachmentT: 0, depth: 0, points: [[0,0,0],[0,0,3],[.3,.1,7]], radii: [.3,.15,.01] };
  const a = sampleAxis(root,.5).point;
  const limb = { id: 9, parent: 5, attachmentT: .5, depth: 1, points: [a,[2,1,4]], radii: [.1,.02] };
  const b = sampleAxis(limb,.4).point;
  const shoot = { id: 15, parent: 9, attachmentT: .4, depth: 2, points: [b,[2,2,5]], radii: [.02,.005] };
  const c = sampleAxis(shoot,.6).point;
  const twig = { id: 20, parent: 15, attachmentT: .6, depth: 3, points: [c,c.map((n:number,i:number)=>n+[.01,.02,.03][i]),c.map((n:number,i:number)=>n+[.25,.18,.22][i])], radii: [.005,.003,.001] };
  return [root,limb,shoot,twig];
}
const close = (a:number,b:number,tolerance=1e-11) => assert.ok(Math.abs(a-b)<tolerance,`${a} != ${b}`);
const distance = (a:number[],b:number[]) => Math.hypot(...a.map((v,i)=>v-b[i]));

test('catalog is exactly the actual shared110 sources, corrected roots, collisions and provenance', () => {
  const rows = TREES.map(tree=>({tree,collision:treeTrunkCollision(tree),rootY:groundHeight(tree.x,tree.z)}));
  const plan = buildTreeCatalog(rows);
  assert.equal(plan.count,110);
  assert.deepEqual(plan.countsByFamily,{'deciduous-broadleaf':107,'evergreen-conifer':2,'reference-bare':1});
  assert.equal(new Set(plan.placements.map((p:any)=>p.sourceTreeId)).size,110);
  for(const p of plan.placements) {
    const tree=TREES.find(t=>t.osmId===p.sourceTreeId)!;
    assert.deepEqual(p.sourceRootXZ,[tree.x,tree.z]);assert.equal(p.rootWorldY,groundHeight(tree.x,tree.z));
    assert.deepEqual(p.collision,treeTrunkCollision(tree));assert.equal(p.dimensions.trunkRadius,treeTrunkCollision(tree).radius);
    assert.deepEqual(p.reference,tree.reconstruction!.reference);assert.equal(p.botanicalSpecies,null);
    assert.equal(p.dimensions.height,tree.reconstruction!.height);assert.equal(p.dimensions.crownDiameter,tree.reconstruction!.crownDiameter);
  }
  const conifer=plan.placements.find((p:any)=>p.sourceTreeId==='ipr-b6-north-conifer');
  assert.deepEqual(conifer.sourceRootXZ,[-10.5,-76.5]);assert.equal(conifer.positionUncertaintyMetres,2);
  const bare=plan.placements.find((p:any)=>p.family==='reference-bare');
  assert.equal(bare.sourceTreeId,'ipr-b6-north-bare');assert.equal(bare.foliage,false);assert.equal(bare.authoringSource,'existing-source-bare-wood');
  assert.deepEqual(buildTreeCatalog([...rows].reverse()),plan);
  assert.throws(()=>buildTreeCatalog([...rows,rows[0]]),/duplicate/);
  const broken=structuredClone(rows[0]);broken.collision.radius+=.01;
  assert.throws(()=>buildTreeCatalog([broken]),/collision/);
});

test('identity fitting preserves every source axis point, radius and topology without mutation',()=>{
  const axes=fixture(),before=structuredClone(axes),fit=createAxisFit(shape,shape),result=fitAxes(axes,fit);
  assert.deepEqual(result.axes,axes);assert.notEqual(result.axes,axes);assert.deepEqual(axes,before);
  assert.deepEqual(fit.matrix,[[1,0,0],[0,1,0],[0,0,1]]);assert.equal(fit.radiusScale,1);
  assert.equal(result.audit.physicalLeafOffsetsScaled,false);
});

test('height, crown axes and trunk radius fit independently while every junction stays attached',()=>{
  const axes=fixture(),target={...shape,height:20,crownDiameter:3,trunkRadius:.12,crownMinorRatio:.6,crownAzimuth:-.7,crownOffset:[-.5,.2]};
  const fit=createAxisFit(shape,target),{axes:out,audit}=fitAxes([...axes].reverse(),fit);
  assert.ok(audit.fitted.maxAttachmentGap<1e-12);close(audit.fitted.rootRadius,.12);
  for(const b of out) {
    const original=axes.find(v=>v.id===b.id)!;assert.equal(b.parent,original.parent);assert.equal(b.attachmentT,original.attachmentT);
    b.points.forEach((p:number[],i:number)=>close(p[2],original.points[i][2]*2));
    b.radii.forEach((r:number,i:number)=>close(r,original.radii[i]*.4));
    if(b.parent!==null)close(distance(b.points[0],sampleAxis(out.find((v:any)=>v.id===b.parent),b.attachmentT).point),0);
  }
  assert.deepEqual(out.find((b:any)=>b.parent===null).points[0],[0,0,0]);
  const alongMajor=[Math.cos(-shape.crownAzimuth),Math.sin(-shape.crownAzimuth),0];
  const transformed=fit.matrix.map((row:number[])=>row.reduce((n,v,i)=>n+v*alongMajor[i],0));
  close(Math.hypot(...transformed),.5);
});

test('invalid axes, forged fits and disconnected or cyclic parent relationships are rejected',()=>{
  const a=fixture();a[1].points[0]=[2,0,0];assert.throws(()=>validateAxes(a),/Disconnected/);
  const b=fixture();b[1].parent=15;assert.throws(()=>validateAxes(b),/hierarchy/);
  const c=fixture();c[0].points[1]=[NaN,0,0];assert.throws(()=>validateAxes(c),/axis point/);
  const d=fixture();d[0].radii[1]=1;assert.throws(()=>validateAxes(d),/Increasing/);
  const e=fixture();e[1].id=e[0].id;assert.throws(()=>validateAxes(e),/identity/);
  assert.throws(()=>createAxisFit(shape,{...shape,height:0}),/height/);
  assert.throws(()=>createAxisFit(shape,{...shape,crownMinorRatio:2}),/minor/);
  assert.throws(()=>createAxisFit(shape,{...shape,crownOffset:[50,50]}),/Implausible/);
  const forged=createAxisFit(shape,shape);forged.matrix[0][0]=2;
  assert.throws(()=>fitAxes(fixture(),forged),/descriptor/);
  assert.throws(()=>fitAxes(fixture(),createAxisFit({...shape,trunkRadius:.5},shape)),/radius mismatch/);
});

test('leaf relocation uses rigid metric offsets even under unequal shape scales and opposite tangent',()=>{
  const source=fixture().at(-1)!,anchor=sampleAxis(source,.6).point;
  const leaf={branchId:source.id,branchT:.6,anchor,rank:1234,partId:'source-leaf',uv:[[0,0],[1,0],[1,1],[0,1]],
    positions:[[0,0,0],[.08,0,0],[.08,.12,.01],[0,.12,.01]].map(p=>p.map((v,i)=>v+anchor[i])),normals:Array.from({length:4},()=>[0,0,1])};
  const fit=createAxisFit(shape,{...shape,height:20,crownDiameter:3,trunkRadius:.1});
  const target=fitAxes(fixture(),fit).axes.find((b:any)=>b.id===source.id);
  const result=relocateLeafComponent(leaf,source,target);
  assert.equal(result.rank,leaf.rank);assert.equal(result.partId,leaf.partId);assert.deepEqual(result.uv,leaf.uv);
  for(let i=0;i<4;i++)for(let j=0;j<4;j++)close(distance(result.positions[i],result.positions[j]),distance(leaf.positions[i],leaf.positions[j]));
  result.normals.forEach((n:number[])=>close(Math.hypot(...n),1));
  const originalDot=leaf.normals[0].reduce((n,v,i)=>n+v*(leaf.positions[2][i]-leaf.positions[0][i]),0);
  close(result.normals[0].reduce((n:number,v:number,i:number)=>n+v*(result.positions[2][i]-result.positions[0][i]),0),originalDot);
  assert.deepEqual(relocateLeafComponent(leaf,source,source),leaf);
  const reversed={...source,points:source.points.map(p=>p.map((n:number)=>-n))};
  const flipped=relocateLeafComponent(leaf,source,reversed);
  for(let i=0;i<4;i++)close(distance(flipped.positions[i],flipped.anchor),distance(leaf.positions[i],leaf.anchor));
  const mid={...leaf,positions:[leaf.positions[0],leaf.positions[2],leaf.positions[3]],normals:[leaf.normals[0],leaf.normals[2],leaf.normals[3]]};
  assert.deepEqual(relocateLeafComponent(mid,source,target).positions,[result.positions[0],result.positions[2],result.positions[3]]);
  assert.throws(()=>relocateLeafComponent({...leaf,anchor:[99,0,0]},source,target),/anchor/);
  assert.throws(()=>relocateLeafComponent(leaf,source,{...target,points:target.points.map(()=>[Infinity,0,0])}),/sample point/);
});

test('new anchors use physical arc distance, deterministic rank groups and unchanged leaf-size policy',()=>{
  const axes=fixture(),anchors=prepareLeafAnchors(axes,'deciduous-broadleaf');
  assert.ok(anchors.length>=3&&anchors.length<=22);assert.deepEqual(prepareLeafAnchors([...axes].reverse(),'deciduous-broadleaf'),anchors);
  const steps=anchors.slice(1).map((p:any,i:number)=>p.distanceAlongBranchMetres-anchors[i].distanceAlongBranchMetres);
  steps.forEach((step:number)=>close(step,steps[0]));
  const groups=new Map<string,any[]>();
  for(const p of anchors) {
    assert.equal(p.branchId,20);close(distance(p.anchor,sampleAxis(axes.at(-1),p.branchT).point),0);
    assert.equal(p.physicalScalePolicy,'LeafSet024 atlas 0.4m unchanged');
    const key=JSON.stringify(p.groupKey);groups.set(key,[...(groups.get(key)??[]),p]);
  }
  for(const values of groups.values())assert.ok(values.length<=6);
  assert.deepEqual(prepareLeafAnchors(axes,'reference-bare'),[]);
  assert.throws(()=>prepareLeafAnchors(axes,'invented'),/family/);
  const larger=fitAxes(axes,createAxisFit(shape,{...shape,height:20,crownDiameter:12})).axes;
  assert.ok(prepareLeafAnchors(larger,'deciduous-broadleaf').length>=anchors.length);
});
