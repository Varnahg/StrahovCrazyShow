import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildCrownPlan,transformAxes,structuralCrossings} from './plan.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const base='.cache/trees-r6-crown-20261026/';fs.mkdirSync(base,{recursive:true});
const acceptedBytes=fs.readFileSync('.cache/trees-r6-shape-20261026/artifact-manifest.json');
if(sha(acceptedBytes)!=='d845397e1b48cdc106d611aab31b70123115333956136a8ff95b49e4e8f1f417')throw Error('Accepted R6 checkpoint changed');
const accepted=JSON.parse(acceptedBytes);
for(const row of accepted.files.filter(r=>r.path.startsWith('scripts/trees-20261026-r6/')||r.path==='.cache/trees-r6-shape-20261026/plan.json')){if(sha(fs.readFileSync(row.path))!==row.sha256)throw Error('Accepted helper changed '+row.path);}
const previous=JSON.parse(fs.readFileSync('.cache/trees-r6-shape-20261026/plan.json'));
const inputPins=structuredClone(previous.inputPins);
for(const p of Object.values(inputPins)){const b=fs.readFileSync(p.path);if(b.length!==p.bytes||sha(b)!==p.sha256)throw Error('Input changed '+p.path);}
for(const path of ['scripts/trees-20261026-r6/shape-plan.mjs','scripts/trees-20261026-r6/candidate.py','scripts/trees-20261026-r6/native_common.py','.cache/trees-r6-shape-20261026/plan.json','scripts/trees-20261025/lod_geometry.py','scripts/trees-20261025/skeleton.py']){const b=fs.readFileSync(path);inputPins[path]={path,bytes:b.length,sha256:sha(b)};}
const source=JSON.parse(fs.readFileSync(inputPins.axes.path)),plan=buildCrownPlan(source.axes),transformed=transformAxes(source.axes,plan);
if(plan.transforms.length!==96||plan.transforms.flatMap(t=>t.branchIds).length!==5856)throw Error('Crown coverage changed');
const originalCrossings=structuralCrossings(source.axes,plan.transforms.map(t=>t.id)),candidateCrossings=structuralCrossings(transformed,plan.transforms.map(t=>t.id));
const oldPairs=new Set(originalCrossings.map(c=>[c.a,c.b].join('/')));
const result={...plan,inputPins,sourceTreeId:source.sourceTreeId,sourceRootXZ:source.sourceRootXZ,trunkRadius:source.trunkRadius,botanicalSpecies:null,
 structuralCrossingAudit:{method:'Centreline capsule screen, depth<=2, smaller radius>=15mm, excludes first segments and direct parent; not complete self-intersection proof',original:originalCrossings,candidate:candidateCrossings,newPairs:candidateCrossings.filter(c=>!oldPairs.has([c.a,c.b].join('/')))}};
fs.writeFileSync(base+'plan.json',JSON.stringify(result,null,2)+'\n');
fs.writeFileSync(base+'updated-axes.json',JSON.stringify({...source,axes:transformed,geometryRevision:'R6-crown',transformPlan:base+'plan.json',botanicalSpecies:null})+'\n');
console.log(JSON.stringify({groups:plan.parents.map(p=>[p.id,p.groupCount]),crossings:result.structuralCrossingAudit},null,2));
