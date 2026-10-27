import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildShapePlan,B5_BRANCH3_EDITS,applyTransform,segmentDistance} from './shape-plan.mjs';
const cache='.cache/trees-r6-shape-20261026/';
const pins={
 axes:['.cache/trees-pilot-20261025/own-broadleaf-axes.json','0351435a583ad136e09ad93a99bb2e997c48a67e36c99ca80eaa5e5b042147a8'],
 metadata:['.cache/trees-pilot-20261025/r4-optimized/models/pilot-manifest.json','8dc3f4554dc729d7baa67a54a5c78e7d524b0888d8ebdbe60fbae5ccf283f2f6'],
 wood:['.cache/trees-r5-authoring-20261025/prepared.json','f1c66fb2fb8d392f0a6fb9f28a291d92930f37dac2dbe118d57adba91b484460'],
 native:['assets/blender/vegetation/seasonal-r5/r5-full-coverage-pilots.blend','9ac77f6b319de92d7dcb32e165e9ce59ad4e172507fcfa90bbec3c772e39d152'],
 atlas:['shared/data/tree-leaf-components.json','022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3'],
 glb:['public/models/vegetation/seasonal-r5/own-broadleaf.glb','9113d99327c52fc7de197cf8857b562a8ad25fa375db39905299a4722b433df7'],
};
const source={};
for(const [key,[path,sha256]] of Object.entries(pins)) {const bytes=fs.readFileSync(path);if(createHash('sha256').update(bytes).digest('hex')!==sha256)throw Error('Source changed '+key);source[key]={path,sha256,bytes:bytes.length};}
const axes=JSON.parse(fs.readFileSync(source.axes.path)),metadata=JSON.parse(fs.readFileSync(source.metadata.path)).variants.find(v=>v.id==='own-broadleaf');
const plan=buildShapePlan(axes.axes,3,B5_BRANCH3_EDITS),byBranch=new Map();for(const t of plan.transforms)for(const id of t.branchIds)byBranch.set(id,t);
if(byBranch.size!==732)throw Error('Unexpected subtree');
const parts=metadata.foliage.componentMetadata;
for(const t of plan.transforms)t.photographicParts=parts.filter(p=>t.branchIds.includes(p.branchId)).length;
const selected=parts.filter(p=>byBranch.has(p.branchId));
if(selected.length!==10256)throw Error('Unexpected foliage population');
// Broad-phase audit of substantial structural axes. Excludes the direct
// supporting parent and proximal 10% junction zones, where overlap is intended.
const structural=axes.axes.filter(b=>b.depth<=2);
function crossings(candidate){const found=[];
 for(let i=0;i<structural.length;i++)for(let j=i+1;j<structural.length;j++){
  const a=structural[i],b=structural[j];if(!byBranch.has(a.id)&&!byBranch.has(b.id)||a.parent===b.id||b.parent===a.id)continue;
  const ta=candidate&&byBranch.get(a.id),tb=candidate&&byBranch.get(b.id);
  const ap=ta?a.points.map(p=>applyTransform(ta,p)):a.points,bp=tb?b.points.map(p=>applyTransform(tb,p)):b.points;
  let worst;
  for(let x=1;x<ap.length-1;x++)for(let y=1;y<bp.length-1;y++){
   const q=segmentDistance(ap[x],ap[x+1],bp[y],bp[y+1]);
   const ra=a.radii[x]*(1-q.s)+a.radii[x+1]*q.s,rb=b.radii[y]*(1-q.t)+b.radii[y+1]*q.t;
   if(Math.min(ra,rb)<.015)continue;
   const penetration=ra+rb-q.distance;if(penetration>0&&(!worst||penetration>worst.penetration))worst={a:a.id,b:b.id,penetration,distance:q.distance,radii:[ra,rb]};
  }if(worst)found.push(worst);
 }return found;
}
const originalCrossings=crossings(false),candidateCrossings=crossings(true),oldPairs=new Set(originalCrossings.map(c=>[c.a,c.b].join('/')));
const output={...plan,inputPins:source,sourceTreeId:axes.sourceTreeId,sourceRootXZ:axes.sourceRootXZ,trunkRadius:axes.trunkRadius,botanicalSpecies:null,
 counts:{allBranches:axes.axes.length,selectedParentAndSubtree:733,movingBranches:byBranch.size,allPhotographicParts:parts.length,movingPhotographicParts:selected.length,movingRanks:new Set(selected.map(p=>p.rank)).size},
 structuralCrossingAudit:{method:'Source centreline capsule screen; depth<=2, smaller radius>=15mm, excludes first segment and direct supporting parent; not complete mesh self-intersection proof',original:originalCrossings,candidate:candidateCrossings,newPairs:candidateCrossings.filter(c=>!oldPairs.has([c.a,c.b].join('/')))}};
fs.mkdirSync(cache,{recursive:true});fs.writeFileSync(cache+'plan.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify({counts:output.counts,crossings:output.structuralCrossingAudit},null,2));
