import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Pure JavaScript authoring helper.
import {rigidFit,transformPoint,buildMedoidBank} from '../scripts/trees-20261026-r6-far/fit.mjs';
// @ts-expect-error Explicit authoring module is side-effect free on import.
import {placementBytes} from '../scripts/trees-20261026-r6-far/publish.mjs';
const points=[[.01,.02,.03],[.13,.02,.01],[.1,.16,.03],[.02,.17,.05]];
const matrix=[0,-1,0,1,0,0,0,0,1];
function group(rank:number,rotation=matrix,shift=[2,3,4],stretch=1){return{rank,anchor:shift,parts:[{partId:'a',sourcePartIndex:rank}],points:points.map(p=>transformPoint(rotation,p.map(v=>v*stretch)).map((v:number,i:number)=>v+shift[i]))};}
test('rigid fit recovers arbitrary and 180-degree proper rotations without scaling',()=>{
 for(const m of [matrix,[1,0,0,0,-1,0,0,0,-1]]){const f=rigidFit(points,points.map(p=>transformPoint(m,p)));assert.ok(f.maximum<1e-10);f.matrix.forEach((n:number,i:number)=>assert.ok(Math.abs(n-m[i])<1e-10));}
 assert.ok(rigidFit(points,points.map(p=>p.map(v=>v*2))).maximum>.05);
});
test('bank retains original ranks, anchor pivots and complete parts with deterministic medoids',()=>{
 const input=[group(1),group(2,[1,0,0,0,1,0,0,0,1],[7,8,9]),group(3)],copy=JSON.stringify(input);
 const a=buildMedoidBank(input);assert.equal(a.counts.medoids,1);assert.equal(a.counts.exactGroups,0);assert.equal(a.counts.parts,3);assert.deepEqual(a,buildMedoidBank([...input].reverse()));assert.equal(JSON.stringify(input),copy);
 for(const p of a.placements){const source=input.find(g=>g.rank===p.rank)!;assert.deepEqual(p.anchor,source.anchor);assert.deepEqual(p.sourcePartIndices,[source.rank]);}
});
test('bounded bank keeps an unrepresentable source group as exact geometry',()=>{
 const a=buildMedoidBank([group(1),group(2,matrix,[2,3,4],3)],{maxPerPattern:1,maximumError:.01,rmsError:.005});assert.equal(a.counts.medoids,1);assert.equal(a.counts.exactGroups,1);assert.equal(a.counts.parts,2);assert.equal(a.placements.filter((p:any)=>p.prototype===null).length,1);
});
test('different photographed part sequences never reuse a prototype; duplicate provenance fails',()=>{
 const a=group(1),b=group(2);b.parts[0].partId='b';assert.equal(buildMedoidBank([a,b]).counts.medoids,2);
 b.parts[0].sourcePartIndex=1;assert.throws(()=>buildMedoidBank([a,b]),/Duplicate/);assert.throws(()=>rigidFit(points,[[NaN,0,0]]));
});
test('compact record preserves rank and glTF rigid axes; fallback is an explicit sentinel',()=>{
 const rows=[{rank:1,prototype:3,exact:false,anchor:[1,2,3],quaternionWxyz:[Math.SQRT1_2,0,0,Math.SQRT1_2]},{rank:9,prototype:null,exact:true,anchor:[0,0,0],quaternionWxyz:[1,0,0,0]}];
 const bytes=placementBytes(rows);assert.equal(bytes.length,64);assert.equal(bytes.readUInt16LE(2),3);assert.equal(bytes.readUInt16LE(34),65535);assert.deepEqual([4,8,12].map(i=>bytes.readFloatLE(i)),[1,3,-2]);assert.ok(Math.abs(bytes.readFloatLE(20)-Math.SQRT1_2)<1e-7);assert.throws(()=>placementBytes([...rows].reverse()),/Invalid/);
});
