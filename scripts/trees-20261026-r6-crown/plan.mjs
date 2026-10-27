/** Whole-crown authoring plan; the accepted branch-3 helper stays immutable. */
import {buildShapePlan,B5_BRANCH3_EDITS,applyTransform,segmentDistance} from '../trees-20261026-r6/shape-plan.mjs';
export {applyTransform};
// Each row is [source child ID, new attachmentT, yaw°, elevation°, group].
// Explicit authored choices, not randomness or a measured botanical species.
const rows={
 1:[[9,.10,-23,31,1],[70,.14,-55,32,1],[131,.21,35,20,1],[192,.27,27,42,1],[253,.52,-16,28,2],[314,.58,31,37,2],[375,.64,-25,20,2],[436,.69,19,33,2],[497,.85,-28,26,3],[558,.89,22,15,3],[619,.93,-14,18,3],[680,.96,29,22,3]],
 2:[[741,.12,26,32,1],[802,.18,-19,24,1],[863,.36,32,38,2],[924,.40,-27,27,2],[985,.46,17,31,2],[1046,.66,-22,22,3],[1107,.72,30,30,3],[1168,.76,-31,36,3],[1229,.80,24,18,3],[1290,.90,-20,25,4],[1351,.93,16,29,4],[1412,.96,-26,14,4]],
 4:[[2205,.16,-29,34,1],[2266,.20,21,22,1],[2327,.26,-18,17,1],[2388,.32,-25,26,1],[2449,.38,-24,31,1],[2510,.63,16,28,2],[2571,.69,-31,19,2],[2632,.74,24,12,2],[2693,.79,-19,24,2],[2754,.85,29,16,2],[2815,.91,-26,22,2],[2876,.95,18,9,2]],
 5:[[2937,.13,21,34,1],[2998,.19,-31,26,1],[3059,.25,27,31,1],[3120,.46,-18,29,2],[3181,.50,32,35,2],[3242,.55,-25,23,2],[3303,.59,19,32,2],[3364,.64,-29,26,2],[3425,.83,24,19,3],[3486,.87,-17,28,3],[3547,.91,30,20,3],[3608,.95,-23,13,3]],
 6:[[3669,.11,-24,26,1],[3730,.18,-45,5,1],[3791,.22,-19,22,1],[3852,.39,22,31,2],[3913,.45,-32,20,2],[3974,.62,18,25,3],[4035,.67,-26,12,3],[4096,.69,29,18,3],[4157,.77,-21,23,3],[4218,.88,25,10,4],[4279,.92,-30,16,4],[4340,.96,17,11,4]],
 7:[[4401,.10,29,18,1],[4462,.15,-23,9,1],[4523,.20,18,25,1],[4584,.25,-31,14,1],[4645,.29,24,20,1],[4706,.34,-18,12,1],[4767,.62,31,5,2],[4828,.69,-27,17,2],[4889,.75,21,10,2],[4950,.81,-29,8,2],[5011,.88,17,-6,2],[5072,.94,-24,4,2]],
 8:[[5133,.12,-19,15,1],[5194,.17,28,21,1],[5255,.23,-31,10,1],[5316,.29,23,18,1],[5377,.50,-25,14,2],[5438,.56,18,20,2],[5499,.63,-29,4,2],[5560,.79,31,12,3],[5621,.83,-22,6,3],[5682,.88,26,-5,3],[5743,.92,-17,8,3],[5804,.96,21,-9,3]],
};
export const CROWN_EDITS=Object.freeze(Object.fromEntries(Object.entries(rows).map(([parent,values])=>[parent,values.map(([id,t,yaw,elevation,group])=>({id,t,yaw,elevation,group}))])));
export function buildCrownPlan(branches){
 const transforms=[];const parents=[];
 for(let id=1;id<=8;id++){
  const part=buildShapePlan(branches,id,id===3?B5_BRANCH3_EDITS:CROWN_EDITS[id]);
  parents.push({id,groupCount:new Set(part.transforms.map(t=>t.group)).size,childIds:part.transforms.map(t=>t.id)});
  transforms.push(...part.transforms.map(t=>({...t,parentId:id})));
 }
 const moving=transforms.flatMap(t=>t.branchIds);
 if(new Set(moving).size!==moving.length||moving.some(id=>id>=0&&id<=8))throw Error('Subtree overlap or protected primary axis');
 return{version:1,coordinateSpace:'root-local Blender Z-up',interpretation:'Authored irregular crown, botanical species unknown',protectedAxisIds:[0,1,2,3,4,5,6,7,8],parents,transforms};
}

export function transformAxes(axes,plan){
 const byBranch=new Map(plan.transforms.flatMap(t=>t.branchIds.map(id=>[id,t])));
 return axes.map(b=>{const t=byBranch.get(b.id);return t?{...b,attachmentT:b.id===t.id?t.t:b.attachmentT,points:b.points.map(p=>applyTransform(t,p))}:structuredClone(b)});
}

export function structuralCrossings(branches,movingIds){
 const structural=branches.filter(b=>b.depth<=2),moving=new Set(movingIds),found=[];
 for(let i=0;i<structural.length;i++)for(let j=i+1;j<structural.length;j++){
  const a=structural[i],b=structural[j];if((!moving.has(a.id)&&!moving.has(b.id))||a.parent===b.id||b.parent===a.id)continue;
  let worst;
  for(let x=1;x<a.points.length-1;x++)for(let y=1;y<b.points.length-1;y++){
   const q=segmentDistance(a.points[x],a.points[x+1],b.points[y],b.points[y+1]);
   const ra=a.radii[x]*(1-q.s)+a.radii[x+1]*q.s,rb=b.radii[y]*(1-q.t)+b.radii[y+1]*q.t;
   if(Math.min(ra,rb)<.015)continue;
   const penetration=ra+rb-q.distance;if(penetration>0&&(!worst||penetration>worst.penetration))worst={a:a.id,b:b.id,penetration,distance:q.distance,radii:[ra,rb]};
  }if(worst)found.push(worst);
 }
 return found;
}
