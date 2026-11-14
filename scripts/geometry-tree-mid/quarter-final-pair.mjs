import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { triangleMasks, treeMasks } from "../geometry-tree-far/masks.mjs";

export const finalPairEvidence = "_bmad-output/implementation-artifacts/tree-quarter-final-pair-20261113/";
export const finalPairModes = ["pair-fit", "pair-turn", "pair-season", "pair-azimuth", "pair-balance"];
export const finalPairFolder = /-pair-(?:fit|turn|season|azimuth|balance)$/;
export const finalPairIds = ["catalog-ipr-crown-019", "catalog-4314257259"];
export const finalPairCutoff = (id, mode) => id === finalPairIds[0] ? (mode === "pair-fit" ? .22 : .20) : .27;

export function balancePairSeason(parts, id, mode) {
  const crown019 = id === finalPairIds[0];
  const yaw = 5*Math.PI/6+.15;
  for (let card=0;card<parts.positions.length/9;card++) {
    const start = card*9;
    const early = parts.ranks[card*12+3] <= 32767;
    const facing = Math.abs(parts.normals[start]*Math.sin(yaw)+parts.normals[start+2]*Math.cos(yaw));
    const adjacentYaw = Math.PI/2+.15;
    const adjacent = Math.abs(parts.normals[start]*Math.sin(adjacentYaw)+parts.normals[start+2]*Math.cos(adjacentYaw));
    const scale = crown019 ? (early ? .90 : 1.12) : !early ? 1.03
      : mode === "pair-balance" ? 1 + .29*adjacent**8 - .42*facing**8
      : mode === "pair-azimuth" ? 1 + .13*adjacent**6 - .25*facing**6 : 1-.17*facing*facing;
    for (let axis=0;axis<3;axis++) {
      const at = start+axis;
      const pivot = .5*parts.positions[at]+.25*(parts.positions[at+3]+parts.positions[at+6]);
      for (let offset=0;offset<9;offset+=3) parts.positions[at+offset]=pivot+scale*(parts.positions[at+offset]-pivot);
    }
  }
}

export function finalPairTargets() {
  const previous = JSON.parse(readFileSync("_bmad-output/implementation-artifacts/tree-quarter-autumn-20261113/release-autumn.json", "utf8"));
  assert.deepEqual(previous.autumnRun.reviewed.filter(id => !previous.accepted.includes(id)).sort(), [...finalPairIds].sort());
  return { previous, targets: finalPairIds };
}

/** Preserve every rank while exchanging planar cards by marginal coverage. */
export function fitPairCards(parts, initial, wood, reference, views, maps, budget, cutoff, turning) {
  const { positions, normals, uvs, ranks } = parts;
  const n = ranks.length;
  const transforms = [[1,0], [.78,0], [1.25,0], ...(turning ? [[1,-.44], [1,.44]] : [])];
  const mesh = {
    positions: new Float32Array(positions.length*transforms.length),
    normals: new Float32Array(normals.length*transforms.length),
    uvs: new Float32Array(uvs.length*transforms.length),
    ranks: new Uint16Array(n*transforms.length),
  };
  for (const [variant,[scale,yaw]] of transforms.entries()) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let card=0;card<n;card++) {
      const start=card*9, end=(variant*n+card)*9;
      // The opaque tile is the first half of both triangle legs. Its center
      // lies one quarter of each leg from the first vertex.
      const pivot = [0,1,2].map(i => .5*positions[start+i]+.25*(positions[start+i+3]+positions[start+i+6]));
      for (let j=0;j<3;j++) {
        const from=start+3*j, to=end+3*j;
        const x=positions[from]-pivot[0], z=positions[from+2]-pivot[2];
        mesh.positions.set([pivot[0]+scale*(c*x+s*z),pivot[1]+scale*(positions[from+1]-pivot[1]),pivot[2]+scale*(c*z-s*x)],to);
        mesh.normals.set([c*normals[from]+s*normals[from+2],normals[from+1],c*normals[from+2]-s*normals[from]],to);
      }
      mesh.uvs.set(uvs.subarray(card*6,card*6+6),(variant*n+card)*6);
      mesh.ranks[variant*n+card]=ranks[card];
    }
  }
  const masks = triangleMasks(mesh.positions,mesh.uvs,views,maps.atlas,cutoff);
  const seasons = [32767,65534];
  const states = views.map(view => seasons.map(rank => {
    const target=treeMasks(reference,view,maps.baseline,maps.leaf,.2,rank);
    const cover=Uint16Array.from(treeMasks([wood],view,maps.atlas,maps.leaf,.5,0));
    let area=0, missing=0, added=0;
    for(let i=0;i<target.length;i++) {
      area+=target[i];
      missing+=Number(target[i]&&!cover[i]);
      added+=Number(!target[i]&&cover[i]);
    }
    assert.ok(area>0);
    return {target,cover,area,missing,added};
  }));
  const selected=new Set(), active=new Map();
  const cardGroups=new Map();
  for(let i=0;i<n;i++) {
    if(!cardGroups.has(ranks[i])) cardGroups.set(ranks[i],[]);
    cardGroups.get(ranks[i]).push(i);
  }

  function visit(index, action) {
    for (const [v,pixels] of masks[index].entries()) for(let s=0;s<seasons.length;s++) {
      if(mesh.ranks[index]<=seasons[s]) action(states[v][s],pixels,s);
    }
  }
  function change(index, sign) {
    visit(index,(state,pixels)=>{
      const {target,cover}=state;
      for(const pixel of pixels) {
        if(cover[pixel]===(sign===1?0:1)) {
          if(target[pixel]) state.missing-=sign;
          else state.added+=sign;
        }
        cover[pixel]+=sign;
      }
    });
  }
  function gain(index, sign) {
    let value=0;
    visit(index,(state,pixels,s)=>{
      let on=0, off=0;
      const {target,cover,area,missing,added}=state;
      for(const pixel of pixels) if(cover[pixel]===(sign===1?0:1)) {
        if(target[pixel]) on++;
        else off++;
      }
      const scarcity=1+5*Math.max(0,missing/area-.15);
      const excess=.8+8*Math.max(0,added/area-.13);
      value+=sign*(scarcity*on-excess*off)/area*(s===0?2:1);
    });
    return value;
  }
  function keep(index) {
    const rank=mesh.ranks[index];
    selected.add(index);
    active.set(rank,(active.get(rank)??0)+1);
    change(index,1);
  }
  function drop(index) {
    const rank=mesh.ranks[index];
    selected.delete(index);
    active.set(rank,active.get(rank)-1);
    change(index,-1);
  }
  for(const index of initial) keep(index);
  for(let round=0;round<3;round++) {
    for(const index of [...selected]) {
      const rank=mesh.ranks[index];
      drop(index);
      let best=index, bestScore=gain(index,1);
      for(const card of cardGroups.get(rank)) for(let k=0;k<transforms.length;k++) {
        const option=card+k*n;
        if(selected.has(option)||transforms.some((_,v)=>selected.has(card+v*n))) continue;
        const score=gain(option,1);
        if(score>bestScore+1e-9) { best=option; bestScore=score; }
      }
      keep(best);
    }
    const removable=[...selected].filter(i=>active.get(mesh.ranks[i])>1)
      .map(i=>[i,gain(i,-1)]).sort((a,b)=>b[1]-a[1]);
    const additions=Array.from(ranks.keys()).filter(i=>transforms.every((_,v)=>!selected.has(i+v*n)))
      .map(i=>[i,gain(i,1)]).sort((a,b)=>b[1]-a[1]);
    let out=0;
    for(const [index] of additions.slice(0,Math.max(500,budget-selected.size))) {
      if(transforms.some((_,v)=>selected.has(index+v*n))) continue;
      let removed;
      if(selected.size===budget) {
        while(out<removable.length) {
          const [i]=removable[out++];
          if(selected.has(i)&&active.get(mesh.ranks[i])>1) {removed=i;drop(i);break;}
        }
        if(removed===undefined) break;
      }
      if(gain(index,1)>Math.max(0,removed===undefined?0:gain(removed,1))+1e-9) keep(index);
      else if(removed!==undefined) keep(removed);
    }
  }
  assert.ok(selected.size<=budget && [...cardGroups.keys()].every(rank=>active.get(rank)>0));
  return { parts:mesh, selected:[...selected].sort((a,b)=>a-b) };
}
