/** Pure assembly. No implicit IO; inherited conifer descriptors are references. */
import {createHash} from 'node:crypto';
import {readSeasonalGlb,seasonalAccessorBytes,splitSeasonalGlb,verifySeasonalSplit} from '../tree-seasonal-stream.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function auditWhole(bytes){
 const glb=readSeasonalGlb(bytes),rows=[];
 if(glb.json.nodes.length!==6)throw Error('Expected six B5 meshes');
 const seen=new Set();
 for(const node of glb.json.nodes){
  const e=node.extras,lod=e?.lod,role=e?.role,name=`own-broadleaf__lod${lod}__${role}`;
  if(![0,1,2].includes(lod)||!['wood','foliage'].includes(role)||node.name!==name||seen.has(name)||e.archetypeId!=='own-broadleaf'||e.sourceTreeId!=='ipr-crown-014'||node.matrix||node.translation||node.rotation||node.scale)throw Error('B5 source identity mismatch');
  seen.add(name);const p=glb.json.meshes[node.mesh]?.primitives;
  if(p?.length!==1||p[0].material!==undefined||(p[0].mode??4)!==4)throw Error('Expected geometry-only triangle primitive');
  const primitive=p[0],expected=['POSITION','NORMAL','TEXCOORD_0',...(role==='foliage'?['COLOR_0']:[])];
  if(Object.keys(primitive.attributes).length!==expected.length||expected.some(k=>!(k in primitive.attributes)))throw Error('Unexpected attributes');
  const count=glb.json.accessors[primitive.attributes.POSITION].count,accessors={};
  for(const semantic of [...expected,'indices']){
   const index=semantic==='indices'?primitive.indices:primitive.attributes[semantic],a=glb.json.accessors[index];
   if(semantic!=='indices'&&a.count!==count)throw Error('Attribute count mismatch');
   if(semantic==='COLOR_0'&&(a.componentType!==5123||a.type!=='VEC4'||a.normalized!==true))throw Error('Rank must remain normalized uint16');
   if(semantic==='indices'&&(![5123,5125].includes(a.componentType)||a.type!=='SCALAR'||a.count%3))throw Error('Invalid triangle indices');
   if(['POSITION','NORMAL','TEXCOORD_0'].includes(semantic)&&(a.componentType!==5126||a.type!==(semantic==='TEXCOORD_0'?'VEC2':'VEC3')))throw Error('Expected exact Float32 attributes');
   const raw=seasonalAccessorBytes(glb,index);accessors[semantic]={componentType:a.componentType,type:a.type,count:a.count,normalized:a.normalized??false,bytes:raw.length,sha256:sha(raw)};
  }
  const positions=seasonalAccessorBytes(glb,primitive.attributes.POSITION),bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  for(let i=0;i<count;i++)for(let k=0;k<3;k++){const n=positions.readFloatLE(i*12+k*4);if(!Number.isFinite(n))throw Error('Nonfinite position');bounds[0][k]=Math.min(bounds[0][k],n);bounds[1][k]=Math.max(bounds[1][k],n);}
  const pos=glb.json.accessors[primitive.attributes.POSITION];if(JSON.stringify(pos.min)!==JSON.stringify(bounds[0])||JSON.stringify(pos.max)!==JSON.stringify(bounds[1]))throw Error('Position bounds stale');
  const ranks=new Set();if(role==='foliage'){
   const colors=seasonalAccessorBytes(glb,primitive.attributes.COLOR_0);
   for(let i=0;i<colors.length;i+=8){if([0,2,4].some(k=>colors.readUInt16LE(i+k)!==65535))throw Error('Nonwhite rank RGB');const rank=colors.readUInt16LE(i+6);if(rank<1||rank>65534)throw Error('Invalid rank');ranks.add(rank);}
   const a=glb.json.accessors[primitive.indices],raw=seasonalAccessorBytes(glb,primitive.indices),stride=a.componentType===5123?2:4;let previous=-1;
   for(let i=0;i<a.count;i+=3){const indices=[0,1,2].map(k=>stride===2?raw.readUInt16LE((i+k)*stride):raw.readUInt32LE((i+k)*stride));if(indices.some(n=>n>=count))throw Error('Index outside vertices');const values=indices.map(index=>colors.readUInt16LE(index*8+6));if(values.some(n=>n!==values[0])||values[0]<previous)throw Error('Rank triangle/prefix mismatch');previous=values[0];}
  }
  rows.push({name,lod,role,vertices:count,triangles:glb.json.accessors[primitive.indices].count/3,ranks:ranks.size,bounds,accessors});
 }
 return rows;
}

export function packagePilot({wholeBytes,r5Whole,r5Streamed}){
 if(r5Whole.version!==2||r5Streamed.version!==3||JSON.stringify(r5Whole.placements)!==JSON.stringify(r5Streamed.placements))throw Error('R5 source contract mismatch');
 const rows=auditWhole(wholeBytes),whole=structuredClone(r5Whole),streamed=structuredClone(r5Streamed);
 const source=whole.prototypes['own-broadleaf'];if(source.sourceTreeId!=='ipr-crown-014'||source.lodProfile!=='full-coverage')throw Error('Expected accepted B5 source');
 source.lods=source.lods.map((lod,i)=>({url:'/models/vegetation/seasonal-r6/own-broadleaf.glb',bytes:wholeBytes.length,sha256:sha(wholeBytes),meshNames:[`own-broadleaf__lod${i}__wood`,`own-broadleaf__lod${i}__foliage`]}));
 whole.usage='R6 authored B5 crown pilot; unchanged R5 conifer; explicit application selection';
 streamed.usage='R6 B5 per-LOD geometry pilot; unchanged R5 conifer references; explicit application selection';
 streamed.prototypes['own-broadleaf']=structuredClone(source);
 const files=[],splitAudits=[];
 for(const lod of [0,1,2]){
  const bytes=splitSeasonalGlb(wholeBytes,'own-broadleaf',source,lod),url=`/models/vegetation/seasonal-r6-streamed/own-broadleaf-lod${lod}.glb`;
  streamed.prototypes['own-broadleaf'].lods[lod]={...source.lods[lod],url,bytes:bytes.length,sha256:sha(bytes)};
  files.push({lod,url,bytes});splitAudits.push({lod,...verifySeasonalSplit(wholeBytes,bytes,source.lods[lod].meshNames)});
 }
 // Equality, not a regenerated substitute, is the contract for the B6 pilot.
 if(JSON.stringify(whole.prototypes['own-conifer'])!==JSON.stringify(r5Whole.prototypes['own-conifer'])||JSON.stringify(streamed.prototypes['own-conifer'])!==JSON.stringify(r5Streamed.prototypes['own-conifer']))throw Error('Conifer reference changed');
 return{whole,streamed,files,audit:{meshes:rows,splitAudits,coniferPolicy:'unchanged R5 descriptors and URLs; no copied conifer bytes'}};
}
