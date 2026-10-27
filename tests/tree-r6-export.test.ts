import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {decodeTreePrototype} from '../client/tree-asset-loader';
import {parseTreePilotManifest} from '../shared/tree-asset-types';
// @ts-expect-error Pure offline JavaScript modules.
import {packagePilot,auditWhole} from '../scripts/trees-20261026-r6-export/package.mjs';
// @ts-expect-error Existing pure GLB packing/splitting helpers.
import {encodeSeasonalGlb,splitSeasonalGlb,readSeasonalGlb,seasonalAccessorBytes} from '../scripts/tree-seasonal-stream.mjs';
const sha=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
const arrayBuffer=(b:Uint8Array)=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)as ArrayBuffer;
function source(id='own-broadleaf',tree='ipr-crown-014'){
 const chunks:Buffer[]=[],accessors:any[]=[],views:any[]=[],nodes:any[]=[],meshes:any[]=[];let offset=0;
 const add=(data:Float32Array|Uint16Array,type:string,normalized=false,bounds=false)=>{
  const bytes=Buffer.from(data.buffer),components=type==='VEC3'?3:type==='VEC4'?4:type==='VEC2'?2:1,index=accessors.length;
  views.push({buffer:0,byteOffset:offset,byteLength:bytes.length});
  const a:any={bufferView:views.length-1,byteOffset:0,componentType:data instanceof Float32Array?5126:5123,type,count:data.length/components};
  if(normalized)a.normalized=true;
  if(bounds){a.min=[0,1,2].map(k=>Math.min(...Array.from(data).filter((_,i)=>i%3===k)));a.max=[0,1,2].map(k=>Math.max(...Array.from(data).filter((_,i)=>i%3===k)));}
  accessors.push(a);const pad=(4-bytes.length%4)%4;chunks.push(bytes,Buffer.alloc(pad));offset+=bytes.length+pad;return index;
 };
 for(const lod of[0,1,2])for(const role of['wood','foliage']){
  const name=`${id}__lod${lod}__${role}`,positions=new Float32Array([-1,0,0,0,0,0,-1,1,0, 1,0,.1,2,0,.1,1,1,.1]);
  const attributes:any={POSITION:add(positions,'VEC3',false,true),NORMAL:add(new Float32Array(Array.from({length:6},()=>[.000012345,0,1]).flat()),'VEC3'),TEXCOORD_0:add(new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),'VEC2')};
  if(role==='foliage')attributes.COLOR_0=add(new Uint16Array([42000,42000,42000,42001,42001,42001].flatMap(rank=>[65535,65535,65535,rank])),'VEC4',true);
  const indices=add(new Uint16Array([0,1,2,3,4,5]),'SCALAR');
  nodes.push({name,mesh:meshes.length,extras:{lod,role,archetypeId:id,sourceTreeId:tree,materialKey:role==='wood'?'Bark012':id==='own-conifer'?'fir_tree_01':'LeafSet024'}});
  meshes.push({name,primitives:[{attributes,indices,mode:4}]});
 }
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,accessors,bufferViews:views,buffers:[{byteLength:offset}]};
 const bytes=encodeSeasonalGlb(json,Buffer.concat(chunks))as Buffer;
 const prototype={sourceTreeId:tree,family:id==='own-conifer'?'evergreen-conifer':'deciduous-broadleaf',nominalHeight:13,nominalCrownDiameter:17,trunkRadius:.484,lodProfile:'full-coverage',lods:[0,1,2].map(lod=>({url:`/models/vegetation/seasonal-r5/${id}.glb`,bytes:bytes.length,sha256:sha(bytes),meshNames:[`${id}__lod${lod}__wood`,`${id}__lod${lod}__foliage`]}))};
 const splits=[0,1,2].map(lod=>splitSeasonalGlb(bytes,id,prototype,lod)as Buffer);
 const streamed={...prototype,lods:prototype.lods.map((file,lod)=>({...file,url:`/models/vegetation/seasonal-r5-streamed/${id}-lod${lod}.glb`,bytes:splits[lod].length,sha256:sha(splits[lod])}))};
 return{bytes,prototype,streamed,splits};
}
function fixture(){const b=source(),c=source('own-conifer','ipr-b6-north-conifer');const placements=[{sourceTreeId:'ipr-crown-014',sourceRootXZ:[-67.59,-60.96],prototypeCandidates:['own-broadleaf'],selectedPrototypeId:null},{sourceTreeId:'ipr-b6-north-conifer',sourceRootXZ:[-10.5,-76.5],prototypeCandidates:['own-conifer'],selectedPrototypeId:null}];
 return{b,c,whole:{version:2,units:'metres',rankEncoding:'uint16-normalized',prototypes:{'own-broadleaf':b.prototype,'own-conifer':c.prototype},placements},streamed:{version:3,units:'metres',rankEncoding:'uint16-normalized',prototypes:{'own-broadleaf':b.streamed,'own-conifer':c.streamed},placements}};
}
test('packages only B5 and retains every R5 conifer descriptor and root without input mutation',()=>{
 const f=fixture(),before=JSON.stringify(f);const result=packagePilot({wholeBytes:f.b.bytes,r5Whole:f.whole,r5Streamed:f.streamed});
 assert.equal(result.files.length,3);assert.ok(result.files.every((x:any)=>x.url.includes('own-broadleaf')));
 assert.deepEqual(result.whole.prototypes['own-conifer'],f.c.prototype);assert.deepEqual(result.streamed.prototypes['own-conifer'],f.c.streamed);
 assert.deepEqual(result.whole.placements,f.whole.placements);assert.equal(JSON.stringify(f),before);
 assert.equal(result.audit.splitAudits.reduce((n:number,x:any)=>n+x.accessorComparisons,0),27);
});
test('production decoder reads both whole pilots and six LOD chunks with adjacent full-range ranks',()=>{
 const f=fixture(),r=packagePilot({wholeBytes:f.b.bytes,r5Whole:f.whole,r5Streamed:f.streamed});
 const whole=parseTreePilotManifest(r.whole),streamed=parseTreePilotManifest(r.streamed);
 for(const [id,bytes,splits]of[['own-broadleaf',f.b.bytes,r.files.map((x:any)=>x.bytes)],['own-conifer',f.c.bytes,f.c.splits]]as const){
  assert.equal(decodeTreePrototype(arrayBuffer(bytes),id,whole.prototypes[id]).length,6);
  for(const lod of[0,1,2]as const){const parts=decodeTreePrototype(arrayBuffer(splits[lod]),id,streamed.prototypes[id],lod);assert.equal(parts.length,2);const colors=parts.find(p=>p.role==='foliage')!.colors!;assert.deepEqual([...new Set(Array.from(colors).filter((_,i)=>i%4===3).map(v=>Math.round(v*65535)))],[42000,42001]);}
 }
});
test('split preserves raw tiny normal components, winding indices and new bounds byte-for-byte',()=>{
 const f=fixture(),r=packagePilot({wholeBytes:f.b.bytes,r5Whole:f.whole,r5Streamed:f.streamed});const original=readSeasonalGlb(f.b.bytes);
 for(const file of r.files){const split=readSeasonalGlb(file.bytes);for(const node of split.json.nodes){const oldNode=original.json.nodes.find((n:any)=>n.name===node.name),a=original.json.meshes[oldNode.mesh].primitives[0],b=split.json.meshes[node.mesh].primitives[0];for(const key of['POSITION','NORMAL','TEXCOORD_0'])assert.deepEqual(seasonalAccessorBytes(original,a.attributes[key]),seasonalAccessorBytes(split,b.attributes[key]));assert.deepEqual(seasonalAccessorBytes(original,a.indices),seasonalAccessorBytes(split,b.indices));assert.equal(seasonalAccessorBytes(split,b.attributes.NORMAL).readFloatLE(0),Math.fround(.000012345));}}
});
test('rejects rank quantization, nonwhite RGB, mixed rank triangles and stale bounds',()=>{
 const f=fixture();const corrupt=(mutate:(g:any)=>void)=>{const g=readSeasonalGlb(f.b.bytes);g.bin=Buffer.from(g.bin);mutate(g);return encodeSeasonalGlb(g.json,g.bin);};
 const colorIndex=(g:any)=>g.json.meshes[1].primitives[0].attributes.COLOR_0;
 assert.throws(()=>auditWhole(corrupt(g=>{g.json.accessors[colorIndex(g)].componentType=5121})),/uint16/);
 assert.throws(()=>auditWhole(corrupt(g=>{seasonalAccessorBytes(g,colorIndex(g)).writeUInt16LE(65534,0)})),/Nonwhite/);
 assert.throws(()=>auditWhole(corrupt(g=>{seasonalAccessorBytes(g,colorIndex(g)).writeUInt16LE(42002,14)})),/triangle/);
 assert.throws(()=>auditWhole(corrupt(g=>{g.json.accessors[g.json.meshes[0].primitives[0].attributes.POSITION].max[0]=99})),/bounds/);
});
