import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import reference from '../shared/data/tree-reconstruction.json';
import placement from '../shared/data/cad-buildings/b06-tree-placement.json';
const directory='public/models/vegetation/seasonal/';
const manifest=JSON.parse(fs.readFileSync(directory+'pilot-manifest.json','utf8'));
const contract=JSON.parse(fs.readFileSync(directory+'runtime-contract.json','utf8'));
const hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
type Point=[number,number,number];
const sub=(a:Point,b:Point):Point=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:Point,b:Point)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
function triangleDistance(p:Point,a:Point,b:Point,c:Point){
  // Independent point-to-triangle closest-point regions, using exported
  // float32 vertices, not the generator's pre-export BVH distance.
  const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a);
  const cross:Point=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  if(dot(cross,cross)<1e-24){
    // Native MTree manifold has collapsed terminal triangles. Their segments
    // remain valid distance candidates; 0/0 must not poison the whole query.
    const segment=(s:Point,t:Point)=>{const d=sub(t,s),q=sub(p,s),length=dot(d,d);const u=length?Math.max(0,Math.min(1,dot(q,d)/length)):0;
      return Math.hypot(q[0]-d[0]*u,q[1]-d[1]*u,q[2]-d[2]*u);};
    return Math.min(segment(a,b),segment(b,c),segment(c,a));
  }
  const d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return Math.hypot(...ap);
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);if(d3>=0&&d4<=d3)return Math.hypot(...bp);
  const edge=(start:Point,d:Point,t:number)=>Math.hypot(p[0]-start[0]-d[0]*t,p[1]-start[1]-d[1]*t,p[2]-start[2]-d[2]*t);
  const vc=d1*d4-d3*d2;if(vc<=0&&d1>=0&&d3<=0)return edge(a,ab,d1/(d1-d3));
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);if(d6>=0&&d5<=d6)return Math.hypot(...cp);
  const vb=d5*d2-d1*d6;if(vb<=0&&d2>=0&&d6<=0)return edge(a,ac,d2/(d2-d6));
  const va=d3*d6-d5*d4;if(va<=0&&d4-d3>=0&&d5-d6>=0)return edge(b,sub(c,b),(d4-d3)/(d4-d3+d5-d6));
  const denom=va+vb+vc;if(Math.abs(denom)<1e-24)return Math.min(Math.hypot(...ap),Math.hypot(...bp),Math.hypot(...cp));
  const v=vb/denom,w=vc/denom;
  return Math.hypot(ap[0]-ab[0]*v-ac[0]*w,ap[1]-ab[1]*v-ac[1]*w,ap[2]-ab[2]*v-ac[2]*w);
}
function glb(file:string){
  const bytes=fs.readFileSync(directory+file);assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const n=bytes.readUInt32LE(12),json=JSON.parse(bytes.subarray(20,20+n).toString()),bin=bytes.subarray(28+n);
  function values(i:number){const a=json.accessors[i],v=json.bufferViews[a.bufferView],size=({SCALAR:1,VEC2:2,VEC3:3,VEC4:4}as const)[a.type as 'SCALAR'];
    assert.ok(!v.byteStride,'explicit packed pilot attributes');const start=(v.byteOffset??0)+(a.byteOffset??0),count=a.count*size;
    return Array.from({length:count},(_,k)=>a.componentType===5126?bin.readFloatLE(start+k*4):a.componentType===5123?bin.readUInt16LE(start+k*2):bin.readUInt32LE(start+k*4));}
  return {bytes,json,values};
}
test('pilot freezes source maps, dimensions and identities without publishing duplicate placements',()=>{
  assert.equal(manifest.variants.length,4);assert.equal(contract.version,2);assert.equal(contract.placements.length,2);
  for(const input of manifest.inputs.inputs)assert.equal(hash(fs.readFileSync(input.source)),input.sha256,input.source);
  for(const item of contract.placements){assert.equal(item.selectedPrototypeId,null);assert.equal(item.prototypeCandidates.length,2);}
  for(const v of manifest.variants){const source=reference.trees.find(t=>t.id===v.sourceTreeId)!;assert.ok(source);
    assert.equal(v.nominalHeight,source.height);assert.equal(v.nominalCrownDiameter,source.crownDiameter);assert.equal(v.trunkRadius,source.trunkRadius);
    assert.deepEqual(v.sourceRootXZ,v.kind==='conifer'?[placement.position.x,placement.position.z]:[source.x,source.z]);
    assert.ok(v.foliage.maxAnchorToWoodDistanceMetres<.04);
    assert.ok(Number.isInteger(v.foliage.rejectedNonAttachedCandidates)&&v.foliage.rejectedNonAttachedCandidates>=0);
    assert.equal(v.foliage.photographicPartCount,v.foliage.anatomicalCandidateCount,'no rank-cap truncation of accepted anatomical parts');
    assert.equal(v.foliage.componentMetadata.length,v.foliage.photographicPartCount);
    assert.ok(v.foliage.maximumGroupAnchorSpanMetres<.4,'drop groups are small shoots, not entire structural branches');
    const partsByGroup=new Map<number,number>();for(const p of v.foliage.componentMetadata)partsByGroup.set(p.rank,(partsByGroup.get(p.rank)??0)+1);
    assert.equal(partsByGroup.size,v.foliage.allComponentCount);
    assert.ok([...partsByGroup.values()].every(n=>n<=v.foliage.maximumPartsPerGroup));
    if(v.generator==='own')assert.ok(v.anatomy.maxAttachmentGap<1e-8);
    if(v.kind==='broadleaf')assert.ok(v.foliage.componentLengthRange[1]<.14);else assert.ok(v.foliage.componentLengthRange[1]<=.350001);
  }
});
test('photographic attachment anchors meet actual exported near wood across the whole rank range',()=>{
  for(const variant of manifest.variants){
    const {json,values}=glb(variant.export.file);
    const node=json.nodes.find((n:any)=>n.extras?.role==='wood'&&n.extras.lod===0);
    const primitive=json.meshes[node.mesh].primitives[0],position=values(primitive.attributes.POSITION),indices=values(primitive.indices);
    const point=(i:number):Point=>[position[i*3],position[i*3+1],position[i*3+2]];
    const cell=.25,grid=new Map<string,number[]>();
    for(let i=0;i<indices.length;i+=3){const a=point(indices[i]),b=point(indices[i+1]),c=point(indices[i+2]);
      const lo=a.map((x,k)=>Math.floor(Math.min(x,b[k],c[k])/cell)),hi=a.map((x,k)=>Math.floor(Math.max(x,b[k],c[k])/cell));
      for(let x=lo[0];x<=hi[0];x++)for(let y=lo[1];y<=hi[1];y++)for(let z=lo[2];z<=hi[2];z++){
        const key=`${x},${y},${z}`,bucket=grid.get(key);if(bucket)bucket.push(i);else grid.set(key,[i]);}
    }
    const metadata=variant.foliage.componentMetadata;
    for(let sample=0;sample<64;sample++){
      const source=metadata[Math.floor(sample*(metadata.length-1)/63)],p:Point=[source.anchor[0],source.anchor[2],-source.anchor[1]];
      const base=p.map(v=>Math.floor(v/cell)),candidates=new Set<number>();
      for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)for(const i of grid.get(`${base[0]+x},${base[1]+y},${base[2]+z}`)??[])candidates.add(i);
      let distance=Infinity;for(const i of candidates)distance=Math.min(distance,triangleDistance(p,point(indices[i]),point(indices[i+1]),point(indices[i+2])));
      assert.ok(distance<.04,`${variant.id} rank ${source.rank} actual wood distance ${distance}`);
      assert.ok(distance<=Math.max(.008,source.supportRadius+.005)+.00001,
        `${variant.id} rank ${source.rank} is attached within its actual supporting twig radius (distance ${distance})`);
    }
  }
});
test('actual GLB has three complete geometry-only LODs and stable uint16 ranks for whole components',()=>{
  for(const v of manifest.variants){const {bytes,json,values}=glb(v.export.file);assert.equal(hash(bytes),v.export.sha256);assert.equal(bytes.length,v.export.bytes);
    assert.equal(json.images?.length??0,0);assert.equal(json.materials?.length??0,0);
    const master=new Set<number>();let previousTriangles=Infinity;
    for(let lod=0;lod<3;lod++){
      const nodes=json.nodes.filter((n:any)=>n.extras?.lod===lod);assert.equal(nodes.length,2);let total=0;
      for(const node of nodes){assert.equal(node.extras.sourceTreeId,v.sourceTreeId);assert.equal(node.extras.archetypeId,v.id);assert.ok(!node.translation&&!node.rotation&&!node.scale&&!node.matrix,'root-local identity transforms');
        const p=json.meshes[node.mesh].primitives[0],positions=values(p.attributes.POSITION),indices=values(p.indices);
        assert.ok(positions.every(Number.isFinite));assert.ok(indices.every(i=>i>=0&&i<positions.length/3));total+=indices.length/3;
        assert.ok(p.attributes.NORMAL!==undefined&&p.attributes.TEXCOORD_0!==undefined);
        if(node.extras.role==='foliage'){
          const a=json.accessors[p.attributes.COLOR_0];assert.equal(a.componentType,5123);assert.equal(a.normalized,true);
          const color=values(p.attributes.COLOR_0),ranks=new Set<number>();let prior=0;
          for(let i=0;i<indices.length;i+=3){const rs=indices.slice(i,i+3).map(index=>color[index*4+3]);assert.equal(rs[0],rs[1]);assert.equal(rs[0],rs[2]);assert.ok(rs[0]>=prior);prior=rs[0];ranks.add(rs[0]);}
          for(let i=0;i<color.length;i+=4){assert.deepEqual(color.slice(i,i+3),[65535,65535,65535]);assert.ok(color[i+3]>0&&color[i+3]<65535);}
          assert.ok(Math.min(...ranks)<1000&&Math.max(...ranks)>64500,'ranks span the whole phase range');
          for(const fraction of [.25,.5,.75]){const actual=[...ranks].filter(r=>r<=Math.floor(fraction*65535)).length/ranks.size;assert.ok(Math.abs(actual-fraction)<.07,`${v.id}/${lod} phase ${fraction}: ${actual}`);}
          for(const fraction of [.25,.5,.75]){const count=v.foliage.lods[lod].retainedPartsAtFractions[String(fraction)];
            assert.ok(Math.abs(count/v.foliage.lods[lod].photographicParts-fraction)<.07,'part-weighted phase distribution');}
          if(lod===0)for(const rank of ranks)master.add(rank);else for(const rank of ranks)assert.ok(master.has(rank));
          assert.equal(ranks.size,v.foliage.lods[lod].components);
        }
      }
      assert.ok(total<previousTriangles,'LOD reduces real triangles without increasing cards');previousTriangles=total;
    }
  }
});
test('actual own wood LOD removes subpixel branches while preserving bounded retained junction curves',()=>{
  for(const v of manifest.variants.filter((x:any)=>x.generator==='own')){
    const wood=v.export.meshes.filter((m:any)=>m.role==='wood');assert.equal(wood.length,3);
    assert.ok(wood[2].triangles<wood[0].triangles*.15,`${v.id} far wood reduction`);
    assert.ok(wood[2].triangles<wood[1].triangles*.5,`${v.id} far/mid wood reduction`);
    for(const a of v.anatomy.lods){assert.equal(a.junctionsPreserved,true);assert.ok(a.maxAcceptedCurveErrorMetres<=a.curveDeviationBudgetMetres+1e-10);}
    assert.ok(v.anatomy.lods[2].retainedBranches<v.anatomy.lods[0].retainedBranches);
  }
});
test('exported metric root radius and all LOD extents preserve the source collision and nominal dimensions',()=>{
  for(const v of manifest.variants){const {json,values}=glb(v.export.file);
    const wood=json.nodes.find((n:any)=>n.extras?.role==='wood'&&n.extras.lod===0);
    const positions=values(json.meshes[wood.mesh].primitives[0].attributes.POSITION);let rootRadius=0,rootVertices=0;
    for(let i=0;i<positions.length;i+=3)if(Math.abs(positions[i+1])<.08){rootRadius=Math.max(rootRadius,Math.hypot(positions[i],positions[i+2]));rootVertices++;}
    assert.ok(rootVertices>=3);assert.ok(Math.abs(rootRadius-v.trunkRadius)<.001,`${v.id} actual radius ${rootRadius}`);
    for(let lod=0;lod<3;lod++){
      const meshes=v.export.meshes.filter((m:any)=>m.name.includes(`__lod${lod}__`));
      const lo=[0,1,2].map(axis=>Math.min(...meshes.map((m:any)=>m.bounds[0][axis]))),hi=[0,1,2].map(axis=>Math.max(...meshes.map((m:any)=>m.bounds[1][axis])));
      assert.ok(Math.abs(hi[1]-v.nominalHeight)<.45,`${v.id}/${lod} height`);
      assert.ok(Math.abs(Math.max(hi[0]-lo[0],hi[2]-lo[2])-v.nominalCrownDiameter)<.5,`${v.id}/${lod} crown`);
      assert.ok(lo[1]>-.08,'root is not translated below its placement');
    }
  }
});
test('native master and every generator dependency match the emitted audit',()=>{
  assert.equal(hash(fs.readFileSync(manifest.nativeMaster.file)),manifest.nativeMaster.sha256);
  for(const [name,digest]of Object.entries(manifest.generatorSha256))assert.equal(hash(fs.readFileSync('scripts/trees-20261025/'+name)),digest,name);
  assert.equal(manifest.renderParameters.summerLeafAmount,1);assert.equal(manifest.renderParameters.bareLeafAmount,0);
  assert.equal(manifest.renderParameters.springRenderProduced,false);
});
test('runtime v2 contract resolves only actual meshes and shared files with audited geometry hashes',()=>{
  assert.equal(contract.rankEncoding,'uint16-normalized');
  for(const [id,p]of Object.entries(contract.prototypes)as [string,any][]){assert.equal(p.lods.length,3);
    const v=manifest.variants.find((x:any)=>x.id===id);assert.ok(v);
    for(let lod=0;lod<3;lod++){const entry=p.lods[lod];assert.equal(entry.sha256,v.export.sha256);assert.equal(entry.bytes,v.export.bytes);
      assert.equal(entry.url,'/models/vegetation/seasonal/'+v.export.file);
      assert.deepEqual(entry.meshNames,[`${id}__lod${lod}__wood`,`${id}__lod${lod}__foliage`]);}
  }
});
