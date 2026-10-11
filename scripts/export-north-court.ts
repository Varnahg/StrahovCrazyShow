import {mkdirSync,writeFileSync,readFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import type {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {buildCampusExteriorPlan,NORTH_COURT_STYLE} from "../shared/campus-exterior";
import {createCampusExterior} from "../client/campus-exterior";
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const plan=buildCampusExteriorPlan(),controller=createCampusExterior(scene,plan),key="court:osm:way:293949920",root=controller.assetRoots.find(root=>root.metadata.key===key)!;
const origin={x:root.position.x,y:root.position.y,z:root.position.z};
const parts=root.getChildMeshes().map(mesh=>{
  const positions=mesh.getVerticesData('position')!,normals=mesh.getVerticesData('normal')!,local:number[]=[],n:number[]=[];
  const matrix=mesh.computeWorldMatrix(true);
  for(let i=0;i<positions.length;i+=3){const p=Vector3.TransformCoordinates(Vector3.FromArray(positions,i),matrix),normal=Vector3.TransformNormal(Vector3.FromArray(normals,i),matrix).normalize();local.push(p.x-origin.x,p.y-origin.y,p.z-origin.z);n.push(...normal.asArray());}
  const indices=Array.from(mesh.getIndices()!);
  for(let i=0;i<indices.length;i+=3){const a=Vector3.FromArray(local,indices[i]*3),b=Vector3.FromArray(local,indices[i+1]*3),c=Vector3.FromArray(local,indices[i+2]*3),normal=Vector3.FromArray(n,indices[i]*3);if(Vector3.Dot(Vector3.Cross(b.subtract(a),c.subtract(a)),normal)<0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
  const material=mesh.material as PBRMaterial;
  return{name:mesh.name,lod:mesh.metadata.lod,positions:local,normals:n,uvs:Array.from(mesh.getVerticesData('uv')!),indices,material:{name:material.name,color:material.albedoColor.asArray(),roughness:material.roughness,metallic:material.metallic,alpha:material.alpha}};
});
const triangles=parts.reduce((sum,p)=>sum+p.indices.length/3,0),signatures=new Set<string>();let duplicates=0;
for(const part of parts)for(let i=0;i<part.indices.length;i+=3){const vertices=part.indices.slice(i,i+3).map(index=>part.positions.slice(index*3,index*3+3).map(v=>v.toFixed(7)).join(',')).sort();const sig=vertices.join('|');if(signatures.has(sig))duplicates++;signatures.add(sig);}
if(duplicates)throw Error('North court has exact duplicated opaque triangles: '+duplicates);
const files=['shared/campus-exterior.ts','client/campus-exterior.ts','shared/terrain.ts','shared/terrain-patches.ts','shared/data/north-court-style.json','shared/data/north-court-terrain-patch.json'];
const output={schemaVersion:1,identity:root.metadata,origin,style:NORTH_COURT_STYLE,parts,triangles,exactDuplicateTriangles:duplicates,sourceHashes:Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(file)).digest('hex')])),note:'Exact highest runtime source geometry. No photo atlas, trees, cars or guessed fence/gate geometry.'};
mkdirSync('assets/blender/north-court',{recursive:true});writeFileSync('assets/blender/north-court/source-plan.json',JSON.stringify(output)+'\n');
console.log(JSON.stringify({parts:parts.length,triangles,duplicates,origin}));controller.dispose();scene.dispose();engine.dispose();
