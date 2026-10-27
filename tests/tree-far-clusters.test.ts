import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
// @ts-ignore Offline authoring helper is intentionally native ESM.
import { buildRankClusterPlan } from '../scripts/trees-20261026-far/rank-clusters.mjs';
// @ts-ignore Explicit offline probe; importing it must never read production files.
import { extractRankSubset, prepareB5FarSample } from '../scripts/trees-20261026-far/prepare.mjs';

function fixture(mid = false) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [], ranks: number[] = [];
  const atlas: any = { id: 'LeafSet024', atlasMetres: [.4, .4], parts: [], components: [] };
  const branches = [{ id: 17, parent: 3, points: [[0,0,0], [0,0,.5], [0,0,1]], radii: [.01,.01,.01] }];
  const parts = [
    { sourcePartIndex: 90, rank: 12000, branchId: 17, branchT: .2, anchor: [0,0,.2], partId: 'leaf-a', supportRadius: .01 },
    { sourcePartIndex: 4, rank: 12000, branchId: 17, branchT: .4, anchor: [0,0,.4], partId: 'leaf-b', supportRadius: .01 },
    { sourcePartIndex: 30, rank: 50000, branchId: 17, branchT: .6, anchor: [0,0,.6], partId: 'leaf-c', supportRadius: .01 },
  ];
  for (const [leaf, part] of parts.entries()) {
    const left = .05 + leaf * .3, right = left + .2, bottom = .1, top = .3;
    atlas.components.push({ id: leaf, cutoutHullUvBlender: [[left,bottom],[right,bottom],[right,top],[left,top]] });
    atlas.parts.push({ id: part.partId, componentId: leaf, attachmentUvBlender: [left,bottom], axisTipUvBlender: [left,top] });
    const uv = [bottom,(bottom+top)/2,top].flatMap(y => [[left,y],[right,y]]);
    const base = positions.length / 3, selected = mid ? [0,1,5,4] : [0,1,2,3,4,5];
    for (const index of selected) {
      const [u,v] = uv[index], x = (u-left)*.4, y = (v-bottom)*.4, bend = .015*.08*Math.sin(Math.PI*Math.max(0,Math.min(1,y/.08)));
      positions.push(...(leaf === 1 ? [bend,x,part.anchor[2]+y] : [x,-bend,part.anchor[2]+y]));
      uvs.push(u,v); ranks.push(part.rank);
    }
    const triangles = mid ? [0,1,2,0,2,3] : [0,1,3,0,3,2,2,3,5,2,5,4];
    indices.push(...triangles.map(index => index + base));
  }
  return { source: { sourceTreeId: 'ipr-crown-014', prototypeId: 'own-broadleaf', sourceRootXZ: [-67.59,-60.96], trunkRadius: .484,
    coordinateSpace: 'root-local-blender-z-up', geometrySha256: 'a'.repeat(64), metadataSha256: 'b'.repeat(64) },
    geometry: { positions, uvs, indices, ranks }, parts, branches, atlas };
}

test('rank/UV join identifies all original leaves and anchors independently of metadata order', () => {
  const input = fixture(), before = structuredClone(input), plan = buildRankClusterPlan(input);
  assert.deepEqual(input, before, 'planning never edits source positions, indices, UV, anchors or metadata');
  assert.equal(plan.coverage.photographicParts, 3); assert.equal(plan.coverage.rankGroups, 2);
  assert.deepEqual(plan.groups.map((g: any) => g.components.map((c: any) => c.sourcePartIndex)), [[4,90],[30]]);
  assert.deepEqual(plan.source.sourceRootXZ, [-67.59,-60.96]); assert.equal(plan.source.trunkRadius, .484);
  for (const group of plan.groups) for (const component of group.components) {
    const row = input.parts.find(part => part.sourcePartIndex === component.sourcePartIndex)!;
    assert.equal(component.partId, row.partId); assert.deepEqual(component.anchor, row.anchor);
    assert.equal(component.branchId, 17, 'actual ID is used although branch array index is zero');
    assert.equal(component.branchT, row.branchT); assert.equal(component.sourceVertices.length, 6);
    assert.ok(component.maximumMetricResidualMetres < 1e-12);
  }
  input.parts.reverse(); assert.deepEqual(buildRankClusterPlan(input), plan);
  assert.deepEqual(buildRankClusterPlan(input), buildRankClusterPlan(input));
});

test('vertex permutation cannot change the UV/metadata join or geometric projection frame', () => {
  const input = fixture(), original = buildRankClusterPlan(input), n = input.geometry.ranks.length;
  const rearranged = structuredClone(input), g = rearranged.geometry;
  g.positions = []; g.uvs = []; g.ranks = [];
  for (let vertex = n-1; vertex >= 0; vertex--) {
    g.positions.push(...input.geometry.positions.slice(vertex*3,vertex*3+3));
    g.uvs.push(...input.geometry.uvs.slice(vertex*2,vertex*2+2)); g.ranks.push(input.geometry.ranks[vertex]);
  }
  g.indices = input.geometry.indices.map(vertex => n-1-vertex);
  const result = buildRankClusterPlan(rearranged);
  assert.deepEqual(result.coverage, original.coverage);
  for (const [i, group] of result.groups.entries()) {
    assert.deepEqual(group.components.map((c: any) => [c.sourcePartIndex,c.partId,c.anchor]), original.groups[i].components.map((c: any) => [c.sourcePartIndex,c.partId,c.anchor]));
    assert.deepEqual(group.onePlane, original.groups[i].onePlane);
    assert.deepEqual(group.splitPlanes, original.groups[i].splitPlanes);
  }
});

test('orientation split partitions whole leaves once, retains rank and encloses exact source vertices', () => {
  const input = fixture(), plan = buildRankClusterPlan(input);
  assert.equal(plan.groups[0].splitPlanes.length, 2); assert.equal(plan.groups[1].splitPlanes.length, 1);
  for (const group of plan.groups) for (const variant of [group.onePlane, group.splitPlanes]) {
    const rows = variant.flatMap((p: any) => p.sourcePartIndices);
    assert.equal(new Set(rows).size, rows.length); assert.deepEqual(rows.toSorted((a:number,b:number)=>a-b), group.components.map((c:any)=>c.sourcePartIndex));
    for (const plane of variant) {
      const dot = (a:number[],b:number[]) => a.reduce((sum,value,i)=>sum+value*b[i],0);
      for (const axis of [plane.right,plane.up,plane.normal]) assert.ok(Math.abs(dot(axis,axis)-1)<1e-12);
      assert.ok(Math.abs(dot(plane.right,plane.up))<1e-12);
      for (const component of group.components.filter((c:any)=>plane.sourcePartIndices.includes(c.sourcePartIndex))) for (const vertex of component.sourceVertices) {
        const relative = input.geometry.positions.slice(vertex*3,vertex*3+3).map((value,i)=>value-plane.anchor[i]);
        const projected = [dot(relative,plane.right),dot(relative,plane.up),dot(relative,plane.normal)];
        for (const axis of [0,1]) assert.ok(projected[axis]>=plane.bounds[0][axis]-1e-12 && projected[axis]<=plane.bounds[1][axis]+1e-12);
        assert.ok(projected[2]>=plane.depthRange[0]-1e-12 && projected[2]<=plane.depthRange[1]+1e-12);
      }
    }
  }
  assert.deepEqual(plan.coverage.seasonPartCounts, {'0':0,'0.25':2,'0.5':2,'0.75':2,'1':3});
});

test('full R5 MID corners and source near retain the same component identities and season counts', () => {
  const near = buildRankClusterPlan(fixture()), mid = buildRankClusterPlan(fixture(true));
  assert.equal(mid.coverage.sourceVertices, 12); assert.equal(mid.coverage.sourceTriangles, 6);
  assert.deepEqual(mid.coverage.seasonPartCounts, near.coverage.seasonPartCounts);
  assert.deepEqual(mid.groups.map((g:any)=>[g.rank,g.components.map((c:any)=>c.sourcePartIndex)]), near.groups.map((g:any)=>[g.rank,g.components.map((c:any)=>c.sourcePartIndex)]));
});

test('rejects missing, duplicate and ambiguous source metadata instead of assigning by order', () => {
  const missing = fixture(); missing.parts.pop(); assert.throws(()=>buildRankClusterPlan(missing),/Missing\/duplicate/);
  const duplicate = fixture(); duplicate.parts.push({...duplicate.parts[0]}); assert.throws(()=>buildRankClusterPlan(duplicate),/duplicate/);
  const ambiguous = fixture(); ambiguous.parts.push({...ambiguous.parts[0],sourcePartIndex:123}); assert.throws(()=>buildRankClusterPlan(ambiguous),/Ambiguous/);
  const absent = fixture(); absent.parts.push({...absent.parts[0],sourcePartIndex:123,rank:65534}); assert.throws(()=>buildRankClusterPlan(absent),/missing physical/);
  const atlas = fixture(); atlas.atlas.parts.push({...atlas.atlas.parts[0],id:'different-name-same-UV'}); assert.throws(()=>buildRankClusterPlan(atlas),/ambiguous UV/);
});

test('rejects corrupt UV, ranks, indices, physical scale and unsupported source assumptions', () => {
  const cases: [string,(value:ReturnType<typeof fixture>)=>void,RegExp][] = [
    ['nonfinite', f=>{f.geometry.positions[0]=NaN;},/Nonfinite/],
    ['mixed-rank', f=>{f.geometry.ranks[0]=50000;},/mixed-rank/],
    ['index', f=>{f.geometry.indices[0]=99999;},/index/],
    ['UV shape', f=>{f.geometry.uvs[0]+=.001;},/footprint/],
    ['source scale', f=>{f.geometry.positions[0]+=.01;},/metric/],
    ['axis anchor', f=>{f.parts[0].anchor[2]+=.01;},/anchor\/radius/],
    ['missing branch', f=>{f.parts[0].branchId=999;},/Missing source branch/],
    ['radius', f=>{f.parts[0].supportRadius=.1;},/anchor\/radius/],
    ['unknown coordinates', f=>{f.source.coordinateSpace='gltf-y-up';},/coordinate space/],
    ['missing pin', f=>{f.source.metadataSha256='';},/pinned/],
  ];
  for (const [name, corrupt, expected] of cases) {const f=fixture();corrupt(f);assert.throws(()=>buildRankClusterPlan(f),expected,name);}
});

test('small rank subset keeps original accessor references and explicitly converts glTF coordinates', () => {
  const input=fixture(true), positions:number[]=[],uvs:number[]=[],colors:number[]=[];
  for(let i=0;i<input.geometry.ranks.length;i++) {
    const [x,y,z]=input.geometry.positions.slice(i*3,i*3+3);positions.push(x,z,-y);
    uvs.push(input.geometry.uvs[i*2],1-input.geometry.uvs[i*2+1]);colors.push(65535,65535,65535,input.geometry.ranks[i]);
  }
  const original={positions:Float32Array.from(positions),uvs:Float32Array.from(uvs),colors:Uint16Array.from(colors),indices:Uint16Array.from(input.geometry.indices)};
  const subset=extractRankSubset(original,[12000]);
  assert.equal(subset.geometry.ranks.length,8);assert.equal(subset.geometry.indices.length,12);
  assert.deepEqual(subset.sourceTriangles,[0,1,2,3]);assert.equal(new Set(subset.sourceVertices).size,8);
  for(const [local,source] of subset.sourceVertices.entries()) {
    assert.deepEqual(subset.geometry.positions.slice(local*3,local*3+3),[original.positions[source*3],-original.positions[source*3+2],original.positions[source*3+1]]);
    assert.deepEqual(subset.geometry.uvs.slice(local*2,local*2+2),[original.uvs[source*2],1-original.uvs[source*2+1]]);
  }
  const plan=buildRankClusterPlan({...input,geometry:subset.geometry,parts:input.parts.filter(part=>part.rank===12000)});
  assert.equal(plan.coverage.photographicParts,2);assert.equal(plan.coverage.rankGroups,1);
  assert.throws(()=>extractRankSubset(original,[12345]),/absent/);
  assert.throws(()=>extractRankSubset(original,[12000,12000]),/selected ranks/);
  const broken={...original,colors:Uint16Array.from(original.colors)};broken.colors[0]=0;
  assert.throws(()=>extractRankSubset(broken,[12000]),/rank RGB/);
});

test('import from an empty working directory neither reads private cache nor writes outputs', () => {
  const base=path.resolve('.cache/trees-far-clusters-20261026/test-fixtures');fs.mkdirSync(base,{recursive:true});
  const directory=fs.mkdtempSync(path.join(base,'portable-'));
  try {
    const modules=['rank-clusters.mjs','prepare.mjs'].map(name=>new URL('../scripts/trees-20261026-far/'+name,import.meta.url).href);
    const result=spawnSync(process.execPath,['--input-type=module','-e',`for(const file of ${JSON.stringify(modules)}) await import(file);`],{cwd:directory,encoding:'utf8'});
    assert.equal(result.status,0,result.stderr); assert.deepEqual(fs.readdirSync(directory),[]);
    assert.throws(()=>prepareB5FarSample({root:directory}),/ENOENT/,'explicit probe fails instead of inventing missing production sources');
    assert.deepEqual(fs.readdirSync(directory),[]);
  } finally {
    const resolved=path.resolve(directory);assert.ok(resolved.startsWith(base+path.sep));fs.rmSync(resolved,{recursive:true,force:true});
  }
});
