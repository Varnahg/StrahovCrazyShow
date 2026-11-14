import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readGlb, sha256 } from "../geometry-b6-south/reduce.mjs";
import { encodeParts } from "../trees-20261026-r6-far/publish.mjs";
import { decodeTreePrototype, treePrototypeFoliageRanks } from "../../client/tree-asset-decode.ts";
import { decodeTreeClusterGeometry } from "../../client/tree-cluster-geometry.ts";
import { parseTreeClusterBank } from "../../shared/tree-cluster-types.ts";
import { cameraViews, maskError, opacityPng, treeMasks } from "../geometry-tree-far/masks.mjs";

const cache = ".cache/geometry-release-20261111";
export const quarterDir = join(cache,"tree-quarter-20261113");
const midDir = join(cache,"tree-mid-all/candidate");
const pin = (file, path = "public" + file.url) => {
  const data = readFileSync(path);
  assert.equal(data.length,file.bytes,path);
  assert.equal(sha256(data),file.sha256,path);
  return data;
};
const json = b => JSON.parse(b.toString("utf8"));
const buffer = b => Uint8Array.from(b).buffer;
const triangles = parts => parts.reduce((n,p)=>n+p.indices.length/3,0);

function role(raw, name) {
  const {doc,accessor} = readGlb(raw);
  const node = doc.nodes.find(n=>n.extras.role===name);
  const p = doc.meshes[node.mesh].primitives[0];
  const read = i => ({definition:doc.accessors[i],bytes:accessor(i).bytes,data:accessor(i).data});
  return {name:node.name,extras:node.extras,
    attributes:Object.fromEntries(Object.entries(p.attributes).map(([k,i])=>[k,read(i)])),indices:read(p.indices)};
}

/** Connected leaf cards stay intact. Each seasonal rank keeps at least one card.
 * Within each rank, large and spatially distinct cards take precedence. */
export function retainCards(leaf, budget, maxScale = 1, fitGroup = false) {
  const indices = leaf.indices.data, xyz = leaf.attributes.POSITION.data, color = leaf.attributes.COLOR_0.data;
  const parents = Int32Array.from({length:xyz.length/3},(_,i)=>i);
  const root = i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
  for(let i=0;i<indices.length;i+=3){
    const a=root(indices[i]);parents[root(indices[i+1])]=a;parents[root(indices[i+2])]=a;
  }
  const cards=new Map(), groups=new Map();
  const area=(a,b,c)=>{
    const x=xyz[b*3]-xyz[a*3],y=xyz[b*3+1]-xyz[a*3+1],z=xyz[b*3+2]-xyz[a*3+2];
    const u=xyz[c*3]-xyz[a*3],v=xyz[c*3+1]-xyz[a*3+1],w=xyz[c*3+2]-xyz[a*3+2];
    return Math.hypot(y*w-z*v,z*u-x*w,x*v-y*u);
  };
  for(let i=0;i<indices.length;i+=3){
    const a=indices[i],b=indices[i+1],c=indices[i+2],key=root(a),rank=color[a*4+3];
    assert.equal(rank,color[b*4+3]);assert.equal(rank,color[c*4+3]);
    if(!cards.has(key))cards.set(key,{rank,offsets:[],vertices:new Set(),area:0});
    const card=cards.get(key);assert.equal(rank,card.rank);
    card.offsets.push(i);card.vertices.add(a);card.vertices.add(b);card.vertices.add(c);card.area+=area(a,b,c);
  }
  for(const card of cards.values()){
    assert.ok(card.offsets.length===2||card.offsets.length===4,"Unexpected leaf-card topology");
    card.center=[0,0,0];
    for(const v of card.vertices) for(let k=0;k<3;k++) card.center[k]+=xyz[v*3+k]/card.vertices.size;
    if(!groups.has(card.rank))groups.set(card.rank,[]);
    groups.get(card.rank).push(card);
  }
  const keep=new Set(),remaining=[];
  let count=0;
  const add=card=>{keep.add(card);count+=card.offsets.length;};
  for(const list of groups.values()){
    list.sort((a,b)=>b.area-a.area||a.offsets[0]-b.offsets[0]);
    const [first,...rest]=list;add(first);
    for(const card of rest){
      const distance=Math.hypot(...card.center.map((x,k)=>x-first.center[k]));
      card.score=card.area*(1+Math.min(1,distance*2))/card.offsets.length;
      remaining.push(card);
    }
  }
  assert.ok(count<=budget,"Budget cannot retain all seasonal ranks");
  remaining.sort((a,b)=>b.score-a.score||a.offsets[0]-b.offsets[0]);
  for(const card of remaining)if(count+card.offsets.length<=budget)add(card);
  const offsets=[...keep].flatMap(c=>c.offsets).sort((a,b)=>a-b);
  const replacement=new Map();
  if(maxScale>1)for(const list of groups.values()){
    const chosen=list.filter(c=>keep.has(c));
    const total=list.reduce((n,c)=>n+c.area,0), retained=chosen.reduce((n,c)=>n+c.area,0);
    const scale=Math.min(maxScale,Math.sqrt(total/retained));
    const limits = Array(3).fill(0).map(()=>[Infinity,-Infinity]);
    if(fitGroup)for(const c of list)for(const v of c.vertices)for(let k=0;k<3;k++){
      limits[k][0]=Math.min(limits[k][0],xyz[v*3+k]);
      limits[k][1]=Math.max(limits[k][1],xyz[v*3+k]);
    }
    for(const c of chosen){
      let scaleToFit=scale;
      if(fitGroup)for(const v of c.vertices)for(let k=0;k<3;k++){
        const delta=xyz[v*3+k]-c.center[k];
        const [lo,hi]=limits[k], slack=(hi-lo)*.24+.04;
        if(delta!==0)scaleToFit=Math.min(scaleToFit,((delta>0?hi+slack:lo-slack)-c.center[k])/delta);
      }
      for(const v of c.vertices)
        replacement.set(v,c.center.map((x,k)=>Math.fround(x+(xyz[v*3+k]-x)*scaleToFit)));
    }
  }
  const vertices=[],lookup=new Map(),compact=[];
  for(const off of offsets)for(let k=0;k<3;k++){
    const v=indices[off+k];
    if(!lookup.has(v)){lookup.set(v,vertices.length);vertices.push(v);}
    compact.push(lookup.get(v));
  }
  const attributes=Object.fromEntries(Object.entries(leaf.attributes).map(([key,a])=>{
    const width=a.data.length/a.definition.count, stride=a.bytes.length/a.definition.count;
    const bytes=Buffer.alloc(vertices.length*stride);
    vertices.forEach((v,i)=>{
      a.bytes.copy(bytes,i*stride,v*stride,(v+1)*stride);
      if(key==="POSITION")replacement.get(v)?.forEach((x,k)=>bytes.writeFloatLE(x,i*stride+k*4));
    });
    const definition={...a.definition,count:vertices.length};
    if(definition.min||definition.max){
      definition.min=Array(width).fill(Infinity);definition.max=Array(width).fill(-Infinity);
      for(const v of vertices)for(let k=0;k<width;k++){
        const value=replacement.get(v)?.[k]??a.data[v*width+k];
        definition.min[k]=Math.min(definition.min[k],value);
        definition.max[k]=Math.max(definition.max[k],value);
      }
    }
    return [key,{bytes,definition}];
  }));
  const result=vertices.length<=65536?Uint16Array.from(compact):Uint32Array.from(compact);
  return {...leaf,attributes,indices:{bytes:Buffer.from(result.buffer),definition:{type:"SCALAR",componentType:result.BYTES_PER_ELEMENT===2?5123:5125,count:result.length}}};
}

async function main(){
  const [mode,variant,slug,...extra]=process.argv.slice(2);
  assert(["--dry-run","--write","--verify"].includes(mode)&&["a","b","c"].includes(variant)&&["018","061","012"].includes(slug));
  assert(!extra.length);
  assert.match(realpathSync(cache),/^D:[\\/]/i);
  const id="catalog-ipr-crown-"+slug, dir=join(quarterDir,variant);
  const release=json(readFileSync("shared/data/assets/geometry-release-20261111.json"));
  const catalog=json(pin(release.trees)),p=catalog.prototypes[id];
  const midReceipt=json(readFileSync(join(midDir,"receipt.json")));
  assert.deepEqual(midReceipt.source,release.trees);
  const mid=json(pin(midReceipt.catalog,join(midDir,"catalog.json"))).prototypes[id];
  const bank=parseTreeClusterBank(json(pin(catalog.banks[p.farCluster.bankId])));
  const midCards=decodeTreeClusterGeometry(buffer(pin(mid.midCluster.placements,join(midDir,id+"-mid.bin"))),bank,
    {groupCount:mid.midCluster.groupCount,exactRanks:[]});
  const leafMaterial=json(readFileSync("shared/data/assets/tree-materials-manifest.json")).assets.find(m=>m.id==="LeafSet024");
  const leafMap=opacityPng(pin(leafMaterial.maps.opacity)), atlas=opacityPng(pin(bank.textures.opacity));
  const rows=[];
  const emit=(name,b)=>{
    const file=join(dir,name);
    if(mode==="--write")writeFileSync(file,b,{flag:"wx"});
    else if(mode==="--verify")assert.ok(readFileSync(file).equals(b),name+" is not reproducible");
  };
  for(const lod of [0,1]){
    const source=pin(p.lods[lod]), baseline=lod===0?decodeTreePrototype(buffer(source),id,p,lod):
      [...decodeTreePrototype(buffer(pin(mid.lods[1],join(midDir,id+"-lod1.glb"))),id,mid,lod),{...midCards,role:"foliage",atlas:true}];
    const before=triangles(baseline), budget=Math.floor(before/4);
    const woodFile=join(dir,slug+"-lod"+lod+"-wood.glb"),woodBytes=readFileSync(woodFile),wood=role(woodBytes,"wood"),sourceWood=role(source,"wood");
    assert.deepEqual(wood.extras,sourceWood.extras);
    assert.deepEqual(wood.attributes.POSITION.definition.min,sourceWood.attributes.POSITION.definition.min);
    assert.deepEqual(wood.attributes.POSITION.definition.max,sourceWood.attributes.POSITION.definition.max);
    const remaining=budget-wood.indices.definition.count/3;
    const leaves=retainCards(role(source,"foliage"),remaining,
      {a:[1,1],b:[1.45,1.55],c:[1.9,2.2]}[variant][lod],variant==="c");
    const glb=encodeParts([wood,leaves]), output=decodeTreePrototype(buffer(glb),id,p,lod);
    const sourceParts=decodeTreePrototype(buffer(source),id,p,lod);
    const ranks=parts=>treePrototypeFoliageRanks(parts).sort((a,b)=>a-b);
    assert.deepEqual(ranks(output),ranks(sourceParts));
    assert.deepEqual(ranks(output),ranks(baseline));
    const after=triangles(output);
    assert.ok(after<=budget);
    assert.deepEqual(readGlb(glb).doc.nodes,readGlb(source).doc.nodes);
    const points=Float32Array.from(sourceParts.flatMap(p=>Array.from(p.positions)));
    const samples=Array.from({length:6},(_,i)=>[i*Math.PI/3+(lod?0.15:0),i%2?0.10:0,lod?45:18]);
    const views=cameraViews(points,samples);
    const checks=views.flatMap((v,i)=>[0,32767,65534].map(rank=>{
      const original=treeMasks(baseline,v,atlas,leafMap,bank.alphaCutoff,rank);
      const candidate=treeMasks(output,v,atlas,leafMap,bank.alphaCutoff,rank);
      return {view:i,rank,...maskError(original,candidate)};
    }));
    const worst={missing:Math.max(...checks.map(c=>c.missingRatio)),added:Math.max(...checks.map(c=>c.addedRatio))};
    const name=slug+"-lod"+lod+".glb";
    const descriptor={url:"/models/vegetation/tree-quarter-qa/"+name,bytes:glb.length,sha256:sha256(glb),meshNames:p.lods[lod].meshNames};
    rows.push({id,lod,before,budget,after,wood:wood.indices.definition.count/3,leaves:leaves.indices.definition.count/3,
      source:p.lods[lod],baseline:lod===1?mid.lods[1]:p.lods[0],baselineCluster:lod===1?mid.midCluster:undefined,
      woodSha256:sha256(woodBytes),ranks:ranks(output).length,vertices:output.reduce((n,p)=>n+p.positions.length/3,0),
      worst,checks,pass:worst.missing<=.12&&worst.added<=.12,descriptor});
    emit(name,glb);
  }
  const receipt={variant,id,source:release.trees,node:process.version,rows};
  emit(slug+".json",Buffer.from(JSON.stringify(receipt,null,2)+"\n"));
  console.log(JSON.stringify(rows.map(({checks,...r})=>r)));
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
