/** Pure catalogue authoring. Population decisions are labelled artistic,
 * deterministic and separate from the photographic parts' physical scale. */
import {sampleAxis, validateAxes} from '../trees-20261026-catalog/fit.mjs';
import {rigidFit} from '../trees-20261026-r6-far/fit.mjs';
const length=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
export function stableHash(text){let h=2166136261;for(const c of String(text))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
/** FNV suffix hashes are correlated; avalanche independently labelled channels
 * before using them for a bounded angular jitter or photographic leaf roll. */
export function orientationChannels(seed,branchId,ordinal){
 const uniform=channel=>{let x=stableHash(`${seed}:${branchId}:${ordinal}:${channel}`);x^=x>>>16;x=Math.imul(x,0x7feb352d);x^=x>>>15;x=Math.imul(x,0x846ca68b);x^=x>>>16;return(x>>>0)/0xffffffff;};
 return {componentOrdinal:ordinal,angularJitter:uniform('azimuth'),independentRoll:uniform('roll')};
}
export function densityRatio(fit){
 const x=fit.target.crownDiameter/fit.source.crownDiameter,y=x*fit.target.crownMinorRatio/fit.source.crownMinorRatio,z=fit.target.height/fit.source.height;
 const ratio=(x*y+x*z+y*z)/3;if(!Number.isFinite(ratio)||ratio<=0)throw Error('Invalid artistic area ratio');return ratio;
}
export function metricGroups(axes,{family,seed,partIds}){
 validateAxes(axes);
 if(!Array.isArray(partIds)||!partIds.length||new Set(partIds).size!==partIds.length)throw Error('Invalid photographic part IDs');
 if(!['deciduous-broadleaf','evergreen-conifer'].includes(family))throw Error('Invalid family');
 const broad=family==='deciduous-broadleaf',spacing=broad?.028:.10,minDepth=broad?3:2,groups=[];let ordinal=0;
 for(const b of [...axes].sort((a,b)=>a.id-b.id)){
  if(b.depth<minDepth)continue;
  const cumulative=[0];for(let i=1;i<b.points.length;i++)cumulative.push(cumulative.at(-1)+length(b.points[i],b.points[i-1]));
  const total=cumulative.at(-1),usable=total*.76,count=Math.min(128,Math.floor(usable/spacing));
  // No forced minimum: a twig shorter than the physical spacing gets no leaf.
  let group=null,lo,hi,groupIndex=0;
  for(let i=0;i<count;i++){
   const distance=total*.22+usable*(i+.5)/count;let segment=0;
   while(segment+1<cumulative.length-1&&cumulative[segment+1]<distance)segment++;
   const fraction=(distance-cumulative[segment])/(cumulative[segment+1]-cumulative[segment]);
   const branchT=(segment+fraction)/(b.points.length-1),sample=sampleAxis(b,branchT),anchor=sample.point;
   let nextLo=lo?lo.map((v,k)=>Math.min(v,anchor[k])):[...anchor],nextHi=hi?hi.map((v,k)=>Math.max(v,anchor[k])):[...anchor];
   if(!group||!broad||group.parts.length===6||length(nextLo,nextHi)>.39){
    group={id:`${b.id}:${groupIndex++}`,branchId:b.id,parts:[]};groups.push(group);nextLo=[...anchor];nextHi=[...anchor];
   }
   group.parts.push({sourcePartIndex:ordinal,partId:partIds[ordinal%partIds.length],branchId:b.id,branchT,anchor,tangent:sample.tangent,supportRadius:sample.radius,
    orientationSeed:stableHash(`${seed}:${b.id}:${i}`),...(broad?orientationChannels(seed,b.id,i):{}),physicalLengthMetres:broad?null:.22+.13*stableHash(`${seed}:twig:${b.id}:${i}`)/0xffffffff});
   ordinal++;lo=nextLo;hi=nextHi;
  }
 }
 for(const g of groups)g.anchor=[0,1,2].map(k=>g.parts.reduce((n,p)=>n+p.anchor[k],0)/g.parts.length);
 return groups;
}
/** Bounded spatial round-robin: preserve extremal groups, distribute the rest
 * over the whole crown, never resize/move a selected group to fill a hole. */
export function selectPopulation(groups,maxParts,seed){
 if(!Array.isArray(groups)||!groups.length||!Number.isSafeInteger(maxParts)||maxParts<1)throw Error('Invalid population budget');
 const ids=new Set();for(const g of groups){if(ids.has(g.id)||!g.parts.length||g.parts.length>6||g.anchor.length!==3||!g.anchor.every(Number.isFinite))throw Error('Invalid source group');ids.add(g.id);}
 const ordered=[...groups].sort((a,b)=>a.id.localeCompare(b.id,'en')),total=ordered.reduce((n,g)=>n+g.parts.length,0);
 if(total<=maxParts)return {groups:ordered,audit:{candidateParts:total,selectedParts:total,budget:maxParts,extremeBudgetOverride:false}};
 const lo=[0,1,2].map(k=>Math.min(...ordered.map(g=>g.anchor[k]))),hi=[0,1,2].map(k=>Math.max(...ordered.map(g=>g.anchor[k])));
 const selected=new Map();for(let k=0;k<3;k++)for(const sign of [-1,1]){const best=ordered.reduce((a,b)=>sign*b.anchor[k]>sign*a.anchor[k]?b:a);selected.set(best.id,best);}
 let used=[...selected.values()].reduce((n,g)=>n+g.parts.length,0),effectiveBudget=Math.max(maxParts,used);
 const bins=new Map();for(const g of ordered){if(selected.has(g.id))continue;const cell=g.anchor.map((n,k)=>Math.min(3,Math.floor(4*(n-lo[k])/Math.max(hi[k]-lo[k],1e-9)))).join(':');if(!bins.has(cell))bins.set(cell,[]);bins.get(cell).push(g);}
 const rows=[...bins].sort(([a],[b])=>a.localeCompare(b,'en')).map(([,v])=>v.sort((a,b)=>stableHash(`${seed}:${a.id}`)-stableHash(`${seed}:${b.id}`)||a.id.localeCompare(b.id,'en')));
 let round=0,remaining=true;while(remaining){remaining=false;for(const row of rows){const g=row[round];if(!g)continue;remaining=true;if(used+g.parts.length<=effectiveBudget){selected.set(g.id,g);used+=g.parts.length;}}round++;}
 return {groups:[...selected.values()].sort((a,b)=>a.id.localeCompare(b.id,'en')),audit:{candidateParts:total,selectedParts:used,budget:maxParts,effectiveBudget,extremeBudgetOverride:effectiveBudget!==maxParts}};
}
export function assignRanks(groups,seed){
 if(groups.length<1||groups.length>65534)throw Error('Too many seasonal groups');
 const order=[...groups].sort((a,b)=>stableHash(`${seed}:rank:${a.id}`)-stableHash(`${seed}:rank:${b.id}`)||a.id.localeCompare(b.id,'en'));
 return order.map((g,i)=>({...structuredClone(g),rank:1+Math.round(i*65533/Math.max(1,order.length-1))})).sort((a,b)=>a.rank-b.rank);
}
export function pruneAxes(axes,groups){
 validateAxes(axes);const byId=new Map(axes.map(b=>[b.id,b])),kept=new Set(axes.filter(b=>b.depth<=2).map(b=>b.id));
 for(const g of groups)for(const part of g.parts){let id=part.branchId;while(id!==null){const b=byId.get(id);if(!b)throw Error('Missing supporting branch');kept.add(id);id=b.parent;}}
 const result=axes.filter(b=>kept.has(b.id)).map(b=>structuredClone(b));validateAxes(result);return result;
}
/** Match against the frozen source bank. Never select new medoids/texels. */
export function fitToExistingBank(groups,sourceBank){
 if(sourceBank.coordinateSpace!=='root-local-blender-z-up'||sourceBank.fit?.scale!==1)throw Error('Wrong frozen medoid bank');
 const patterns=new Map();for(const p of sourceBank.prototypes){const key=p.parts.map(v=>v.partId).join('|');if(!patterns.has(key))patterns.set(key,[]);patterns.get(key).push(p);}
 const seen=new Set();return [...groups].sort((a,b)=>a.rank-b.rank).map(g=>{
  if(!Number.isSafeInteger(g.rank)||g.rank<1||g.rank>65534||seen.has(g.rank)||g.points.length!==4*g.parts.length)throw Error('Invalid target rank group');seen.add(g.rank);
  const target=g.points.map(p=>p.map((v,k)=>v-g.anchor[k])),candidates=patterns.get(g.parts.map(p=>p.partId).join('|'))??[];let best;
  for(const p of candidates){const f=rigidFit(p.points.map(v=>v.map((n,k)=>n-p.anchor[k])),target);if(!best||f.rms<best.rms-1e-12||Math.abs(f.rms-best.rms)<1e-12&&p.id<best.prototype)best={...f,prototype:p.id};}
  const exact=!best||best.maximum>sourceBank.fit.maximumError||best.rms>sourceBank.fit.rmsError;
  return {rank:g.rank,anchor:[...g.anchor],prototype:exact?null:best.prototype,exact,sourcePartIndices:g.parts.map(p=>p.sourcePartIndex),
    matrix:best?.matrix??[1,0,0,0,1,0,0,0,1],quaternionWxyz:best?.quaternionWxyz??[1,0,0,0],maximumError:best?.maximum??null,rmsError:best?.rms??null};
 });
}
