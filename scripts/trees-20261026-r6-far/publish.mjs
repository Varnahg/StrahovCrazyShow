/** Explicit packaging of the accepted native atlas and source-derived records. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {encodeSeasonalGlb,readSeasonalGlb,seasonalAccessorBytes} from '../tree-seasonal-stream.mjs';
import {PINS,pinned,sha} from './prepare.mjs';
import {transformPoint} from './fit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),cache=path.join(root,'.cache/trees-r6-far-20261026'),output=path.join(root,'public/models/vegetation/seasonal-r6-far');
const convert=p=>[p[0],p[2],-p[1]],typed=(values,kind)=>kind===5126?new Float32Array(values):kind===5123?new Uint16Array(values):new Uint32Array(values);
function sourceWood(){const g=readSeasonalGlb(pinned(PINS.far)),n=g.json.nodes.find(n=>n.name==='own-broadleaf__lod2__wood'),p=g.json.meshes[n.mesh].primitives[0];return{name:n.name,extras:n.extras,attributes:Object.fromEntries(Object.entries(p.attributes).map(([key,index])=>[key,{definition:structuredClone(g.json.accessors[index]),bytes:seasonalAccessorBytes(g,index)}])),indices:{definition:structuredClone(g.json.accessors[p.indices]),bytes:seasonalAccessorBytes(g,p.indices)}};}
function attributes(geometry,ranks,name,materialKey){
 const position=geometry.positions.flatMap(convert),normal=geometry.normals.flatMap(convert),uv=geometry.uvs.flatMap(p=>[p[0],1-p[1]]),count=geometry.positions.length;
 const item=(values,type,componentType,normalized=false)=>({definition:{type,componentType,count:values.length/({VEC2:2,VEC3:3,VEC4:4,SCALAR:1}[type]),...(normalized?{normalized:true}:{})},bytes:Buffer.from(typed(values,componentType).buffer)});
 const a={POSITION:item(position,'VEC3',5126),NORMAL:item(normal,'VEC3',5126),TEXCOORD_0:item(uv,'VEC2',5126)};
 const rounded=new Float32Array(position),lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let i=0;i<rounded.length;i++){const k=i%3;lo[k]=Math.min(lo[k],rounded[i]);hi[k]=Math.max(hi[k],rounded[i]);}a.POSITION.definition.min=lo;a.POSITION.definition.max=hi;
 if(ranks)a.COLOR_0=item(ranks.flatMap(r=>[65535,65535,65535,r]),'VEC4',5123,true);
 return{name,extras:{archetypeId:'own-broadleaf',sourceTreeId:'ipr-crown-014',sourceRootXZ:[-67.59,-60.96],trunkRadius:.484,lod:2,role:'foliage',materialKey},attributes:a,indices:item(geometry.indices,'SCALAR',count>65535?5125:5123)};
}
export function encodeParts(parts){
 const chunks=[],bufferViews=[],accessors=[],nodes=[],meshes=[];let offset=0;
 const add=item=>{const definition={...item.definition,bufferView:bufferViews.length,byteOffset:0};bufferViews.push({buffer:0,byteOffset:offset,byteLength:item.bytes.length});accessors.push(definition);chunks.push(item.bytes);offset+=item.bytes.length;const pad=(4-offset%4)%4;if(pad){chunks.push(Buffer.alloc(pad));offset+=pad;}return accessors.length-1;};
 for(const p of parts){nodes.push({name:p.name,mesh:meshes.length,extras:p.extras});meshes.push({name:p.name,primitives:[{mode:4,attributes:Object.fromEntries(Object.entries(p.attributes).map(([key,value])=>[key,add(value)])),indices:add(p.indices)}]});}
 const bin=Buffer.concat(chunks);return encodeSeasonalGlb({asset:{version:'2.0',generator:'Strahov R6 FAR source-medoid packaging'},scene:0,scenes:[{nodes:nodes.map((_,i)=>i)}],nodes,meshes,accessors,bufferViews,buffers:[{byteLength:bin.length}]},bin);
}
function concatenate(rows){const g={positions:[],normals:[],uvs:[],indices:[]},ranks=[];for(const row of rows){const start=g.positions.length;g.positions.push(...row.geometry.positions);g.normals.push(...row.geometry.normals);g.uvs.push(...row.geometry.uvs);g.indices.push(...row.geometry.indices.map(i=>i+start));ranks.push(...row.geometry.positions.map(()=>row.rank));}return{g,ranks};}
export function placementBytes(placements){
 const result=Buffer.alloc(placements.length*32);let previous=0;
 for(let i=0;i<placements.length;i++){const p=placements[i];if(!Number.isSafeInteger(p.rank)||p.rank<=previous||p.rank>65534||p.anchor.length!==3||p.quaternionWxyz.length!==4||![...p.anchor,...p.quaternionWxyz].every(Number.isFinite)||Math.abs(Math.hypot(...p.quaternionWxyz)-1)>1e-6)throw Error('Invalid rigid placement');previous=p.rank;
  result.writeUInt16LE(p.rank,i*32);result.writeUInt16LE(p.exact?65535:p.prototype,i*32+2);convert(p.anchor).forEach((n,k)=>result.writeFloatLE(n,i*32+4+k*4));const [w,x,y,z]=p.quaternionWxyz;[x,z,-y,w].forEach((n,k)=>result.writeFloatLE(n,i*32+16+k*4));
 }return result;
}
export function publish(){
 const data=JSON.parse(fs.readFileSync(path.join(cache,'prepared.json'))),b=JSON.parse(fs.readFileSync(path.join(cache,'bank-blender.json'))),native=JSON.parse(fs.readFileSync(path.join(cache,'native-report.json')));
 if(sha(fs.readFileSync(path.join(cache,'prepared.json')))!==native.prepared.sha256)throw Error('Native/prepared checkpoint differs');
 const textures=Object.fromEntries(Object.entries(b.maps).map(([key,p])=>{const bytes=fs.readFileSync(path.join(root,p.path));if(sha(bytes)!==p.sha256||bytes.length!==p.bytes)throw Error('Atlas changed');return[key,{url:'/'+p.path.replace(/^public\//,''),bytes:p.bytes,sha256:p.sha256}];}));
 const bank={version:1,coordinateSpace:'gltf-y-up',units:'metres',alphaCutoff:.2,normalMapStrength:1,prototypes:b.prototypes.map(p=>({id:p.id,cards:p.cards.map(c=>({positions:c.positions.flatMap(convert),normals:c.normals.flatMap(convert),uvs:c.uvs.flatMap(uv=>[uv[0],1-uv[1]])}))})),textures};
 const exact=concatenate(data.exact),exactParts=[sourceWood(),...(exact.g.positions.length?[attributes(exact.g,exact.ranks,'own-broadleaf__lod2__foliage','LeafSet024')]:[])];
 const cardRows=[];
 for(const p of data.placements)if(!p.exact)for(const card of b.prototypes[p.prototype].cards)cardRows.push({rank:p.rank,geometry:{positions:card.positions.map(point=>transformPoint(p.matrix,point).map((v,k)=>v+p.anchor[k])),normals:card.normals.map(n=>transformPoint(p.matrix,n)),uvs:card.uvs,indices:[0,1,2,0,2,3]}});
 const cards=concatenate(cardRows);fs.mkdirSync(output,{recursive:true});const written={};
 for(const [name,bytes]of [['bank.json',Buffer.from(JSON.stringify(bank)+'\n')],['placements.bin',placementBytes(data.placements)],['own-broadleaf-lod2-exact.glb',encodeParts(exactParts)],['own-broadleaf-far-comparison.glb',encodeParts([...exactParts,attributes(cards.g,cards.ranks,'own-broadleaf__lod2__cards','LeafSet024-r6-far')])]]){fs.writeFileSync(path.join(output,name),bytes);written[name]={url:'/models/vegetation/seasonal-r6-far/'+name,bytes:bytes.length,sha256:sha(bytes)};}
 const manifest={version:1,purpose:'R6 B5 compact FAR candidate; explicit runtime selection',sourceTreeId:data.source.sourceTreeId,sourceRootXZ:data.source.sourceRootXZ,trunkRadius:data.source.trunkRadius,coordinateSpace:'gltf-y-up',units:'metres',bank:written['bank.json'],placements:{...written['placements.bin'],recordBytes:32,count:data.placements.length,rankEncoding:'uint16',sentinelExact:65535},exactGeometry:{...written['own-broadleaf-lod2-exact.glb'],meshNames:exactParts.map(p=>p.name)},exactFallbackRanks:data.placements.filter(p=>p.exact).map(p=>p.rank),comparisonGeometry:written['own-broadleaf-far-comparison.glb'],counts:data.summary,fit:data.configuration};
 fs.writeFileSync(path.join(output,'pilot-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 const runtime=JSON.parse(pinned(PINS.runtimeContract)),originalConifer=JSON.stringify(runtime.prototypes['own-conifer']),originalPlacements=JSON.stringify(runtime.placements),originalDetails=JSON.stringify(runtime.prototypes['own-broadleaf'].lods.slice(0,2));
 runtime.version=4;runtime.usage='R6 shared FAR cluster bank; unchanged R6 near/MID and R5 conifer';runtime.banks={'r6-broadleaf':written['bank.json']};
 runtime.prototypes['own-broadleaf'].lods[2]={...written['own-broadleaf-lod2-exact.glb'],meshNames:exactParts.map(p=>p.name)};
 runtime.prototypes['own-broadleaf'].farCluster={bankId:'r6-broadleaf',placements:written['placements.bin'],groupCount:data.placements.length};
 if(JSON.stringify(runtime.prototypes['own-conifer'])!==originalConifer||JSON.stringify(runtime.placements)!==originalPlacements||JSON.stringify(runtime.prototypes['own-broadleaf'].lods.slice(0,2))!==originalDetails)throw Error('Unchanged runtime references altered');
 fs.writeFileSync(path.join(output,'runtime-contract.json'),JSON.stringify(runtime,null,2)+'\n');
 for(const m of data.medoids)if(m.parts.map(p=>p.partId).join('|')!==m.pattern)throw Error('Medoid point/part correspondence changed');
 const sources={version:1,purpose:'Frozen authoring fixture; never fetched by runtime',sourceTreeId:data.source.sourceTreeId,coordinateSpace:'root-local-blender-z-up',units:'metres',bankSha256:written['bank.json'].sha256,fit:data.configuration,prototypes:data.medoids.map(m=>({id:m.id,sourceRank:m.sourceRank,anchor:m.anchor,parts:m.parts,points:m.sourcePoints}))};
 const sourceBytes=Buffer.from(JSON.stringify(sources)+'\n');fs.writeFileSync(path.join(output,'bank-source.json'),sourceBytes);written['bank-source.json']={url:'/models/vegetation/seasonal-r6-far/bank-source.json',bytes:sourceBytes.length,sha256:sha(sourceBytes)};
 const budget={sharedBankSourceBytes:written['bank.json'].bytes,sharedTextureSourceBytes:Object.values(textures).reduce((n,t)=>n+t.bytes,0),perSourceFarBytes:written['placements.bin'].bytes+written['own-broadleaf-lod2-exact.glb'].bytes,expandedFoliageBytes:data.summary.expandedFoliageBytes,sharedTextureGpuFullMipsEstimate:data.summary.atlas.gpuFullMipRgba8Bytes,sourceParts:data.summary.parts,sourceRankGroups:data.summary.groups};
 fs.writeFileSync(path.join(cache,'publish-report.json'),JSON.stringify({files:written,budget,manifestSha256:sha(fs.readFileSync(path.join(output,'pilot-manifest.json'))),runtimeContractSha256:sha(fs.readFileSync(path.join(output,'runtime-contract.json')))},null,2)+'\n');console.log(JSON.stringify(budget,null,2));return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){if(process.argv.length!==3||process.argv[2]!=='--publish')throw Error('Explicit --publish required');publish();}
