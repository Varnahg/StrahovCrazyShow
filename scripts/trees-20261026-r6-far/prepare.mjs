/** Explicit pinned R6 adapter. Import is side-effect free. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {readSeasonalGlb,seasonalAccessorBytes} from '../tree-seasonal-stream.mjs';
import {buildRankClusterPlan} from '../trees-20261026-far/rank-clusters.mjs';
import {buildMedoidBank} from './fit.mjs';
export const PINS=Object.freeze({
 mid:{path:'public/models/vegetation/seasonal-r6-streamed/own-broadleaf-lod1.glb',sha256:'681bcd75bcf04bf7899e36f96b9f942096c3d564e70dd6c9bec775cde4cc1a59'},
 far:{path:'public/models/vegetation/seasonal-r6-streamed/own-broadleaf-lod2.glb',sha256:'cf317cb3549da9c3c688d66b2bb300feac25f9c2eddfafc6ff7bbd395912664e'},
 delta:{path:'.cache/trees-r6-crown-20261026/source-delta.json',sha256:'aec28ce40e676a33c1068bd3e4883520411819d433578b2ac52d7cebdb0d8c56'},
 axes:{path:'.cache/trees-r6-crown-20261026/updated-axes.json',sha256:'8ddb2dd5d5e6aee513727d85b5eeee16ea520ae3d4d595b7ef0e83f78e32555c'},
 atlas:{path:'shared/data/tree-leaf-components.json',sha256:'022533e3a97b5fda8d025914e9137dd8b897dc6199a032b7df60737cf13a50a3'},
 native:{path:'assets/blender/vegetation/seasonal-r6-crown/r6-b5-crown-three-lods.blend',sha256:'1c212a55abf286894c874cd1da1b8f20b0ba30a59d02317c4180ba4580ce596c'},
 runtimeContract:{path:'public/models/vegetation/seasonal-r6-streamed/runtime-contract.json',sha256:'5491f9ea14e2ecd3d314f5e3a591b5c70e15a08029395c063d63ceb16e5981ea'},
});
export const sha=b=>createHash('sha256').update(b).digest('hex');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export function pinned(descriptor){const b=fs.readFileSync(path.join(root,descriptor.path));if(sha(b)!==descriptor.sha256)throw Error('Changed input '+descriptor.path);return b;}
function attribute(g,index){const a=g.json.accessors[index],raw=Uint8Array.from(seasonalAccessorBytes(g,index)).buffer;return a.componentType===5126?new Float32Array(raw):a.componentType===5123?new Uint16Array(raw):new Uint32Array(raw);}
export function readGeometry(bytes,lod,role){
 const glb=readSeasonalGlb(bytes),node=glb.json.nodes.find(n=>n.name===`own-broadleaf__lod${lod}__${role}`);
 if(!node||node.extras.sourceTreeId!=='ipr-crown-014'||node.matrix||node.translation||node.scale||node.rotation)throw Error('Wrong source identity');
 const p=glb.json.meshes[node.mesh].primitives[0],positions=attribute(glb,p.attributes.POSITION),normals=attribute(glb,p.attributes.NORMAL),uvs=Float64Array.from(attribute(glb,p.attributes.TEXCOORD_0)),indices=attribute(glb,p.indices);
 const colors=role==='foliage'?attribute(glb,p.attributes.COLOR_0):null,ranks=colors?new Uint16Array(colors.length/4):null;
 for(let i=0;i<positions.length;i+=3){const y=positions[i+1];positions[i+1]=-positions[i+2];positions[i+2]=y;const ny=normals[i+1];normals[i+1]=-normals[i+2];normals[i+2]=ny;}
 for(let i=1;i<uvs.length;i+=2)uvs[i]=1-uvs[i];
 if(colors)for(let i=0;i<ranks.length;i++){if(colors[i*4]!==65535||colors[i*4+1]!==65535||colors[i*4+2]!==65535)throw Error('Rank RGB changed');ranks[i]=colors[i*4+3];}
 return{positions,normals,uvs,indices,ranks};
}
const point=(array,index,n)=>Array.from(array.subarray(index*n,index*n+n));
function subset(geometry,components){
 const remap=new Map(),positions=[],normals=[],uvs=[],indices=[];
 for(const c of components)for(const at of c.sourceTriangles)for(let k=0;k<3;k++){
  const index=geometry.indices[at*3+k];if(!remap.has(index)){remap.set(index,positions.length);positions.push(point(geometry.positions,index,3));normals.push(point(geometry.normals,index,3));uvs.push(point(geometry.uvs,index,2));}indices.push(remap.get(index));
 }
 return{positions,normals,uvs,indices};
}
export function prepare(){
 const delta=JSON.parse(pinned(PINS.delta)),axes=JSON.parse(pinned(PINS.axes)),atlas=JSON.parse(pinned(PINS.atlas)).atlases.find(a=>a.id==='LeafSet024');
 if(delta.sourceTreeId!=='ipr-crown-014'||delta.leaves.length!==82100||axes.sourceTreeId!=='ipr-crown-014')throw Error('R6 source population changed');
 const geometry=readGeometry(pinned(PINS.mid),1,'foliage');
 const source={sourceTreeId:'ipr-crown-014',prototypeId:'own-broadleaf',sourceRootXZ:[-67.59,-60.96],trunkRadius:.484,coordinateSpace:'root-local-blender-z-up',geometrySha256:PINS.mid.sha256,metadataSha256:PINS.delta.sha256,axesSha256:PINS.axes.sha256};
 const clusters=buildRankClusterPlan({source,geometry,parts:delta.leaves,branches:axes.axes,atlas});
 const groups=clusters.groups.map(g=>{
  const components=[...g.components].sort((a,b)=>a.branchT-b.branchT),anchor=[0,1,2].map(k=>components.reduce((s,c)=>s+c.anchor[k],0)/components.length);
  const points=components.flatMap(c=>[...c.sourceVertices].sort((a,b)=>geometry.uvs[a*2]-geometry.uvs[b*2]||geometry.uvs[a*2+1]-geometry.uvs[b*2+1]).map(i=>point(geometry.positions,i,3)));
  return{rank:g.rank,anchor,parts:components.map(c=>({sourcePartIndex:c.sourcePartIndex,partId:c.partId})),points};
 });
 const bank=buildMedoidBank(groups,{maximumError:.15,rmsError:.07,selectionMaximumError:.06,selectionRmsError:.025}),byRank=new Map(clusters.groups.map(g=>[g.rank,g]));
 const medoids=bank.medoids.map(m=>{
  const group=byRank.get(m.sourceRank);return{...m,sourcePoints:groups.find(g=>g.rank===m.sourceRank).points,parts:group.components.map(c=>({sourcePartIndex:c.sourcePartIndex,partId:c.partId,anchor:c.anchor})),planes:group.splitPlanes.map(frame=>({...frame,geometry:subset(geometry,group.components.filter(c=>frame.sourcePartIndices.includes(c.sourcePartIndex)))}))};
 });
 const exact=bank.placements.filter(p=>p.exact).map(p=>({rank:p.rank,sourcePartIndices:p.sourcePartIndices,geometry:subset(geometry,byRank.get(p.rank).components)}));
 const planes=medoids.reduce((n,m)=>n+m.planes.length,0),instances=bank.placements.filter(p=>!p.exact).reduce((n,p)=>n+medoids[p.prototype].planes.length,0),exactParts=bank.counts.exactParts;
 const summary={...bank.counts,planes,cardInstances:instances,cardTriangles:instances*2,exactTriangles:exactParts*2,sourceTriangles:geometry.indices.length/3,placementBytes:bank.placements.length*32,expandedFoliageBytes:instances*(4*48+6*4)+exactParts*(4*48+6*4),atlas:{cell:32,padding:4,grid:32,size:1024,maps:4,gpuBaseRgba8Bytes:1024*1024*4*4,gpuFullMipRgba8Bytes:Math.round(1024*1024*4*4*4/3)}};
 const result={version:1,comparisonOnly:true,source,inputPins:PINS,configuration:bank.configuration,medoids,placements:bank.placements,exact,summary,
 limitations:['Rigid source-medoid approximation; original rank and attachment provenance retained, individual fitted anchors differ within measured residual.','Source wood/root/collider and photographic metric leaf scale unchanged.','Card projection and texture mips require independent visual acceptance.']};
 const cache=path.join(root,'.cache/trees-r6-far-20261026');fs.mkdirSync(cache,{recursive:true});
 fs.writeFileSync(path.join(cache,'prepared.json'),JSON.stringify(result)+'\n');fs.writeFileSync(path.join(cache,'preparation-summary.json'),JSON.stringify(summary,null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||process.argv[2]!=='--prepare')throw Error('Explicit --prepare required');prepare();
}
