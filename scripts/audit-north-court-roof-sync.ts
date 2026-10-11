/** Read-only archive sync audit after the shared terrain clipping repair. */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {BUILDINGS} from "../shared/world";
import {buildingBaseHeight} from "../shared/terrain";
import {buildArchitectureReality} from "../client/architecture-reality";
import {createCampusExterior} from "../client/campus-exterior";
type RecordedPart={name:string;sourcePack:string;positions:number[];normals:number[];indices:number[]};
type RecordedModel={identity:{sourceId:string};origin:{x:number;y:number;z:number};parts:RecordedPart[]};
const path='assets/blender/buildings/source-plan.json',bytes=readFileSync(path),archive=JSON.parse(bytes.toString())as{models:RecordedModel[]};
const model=archive.models.find(model=>model.identity.sourceId==='7645350')!,recorded=model.parts.filter(part=>part.sourcePack==='campus-exterior');
const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
const architecture=buildArchitectureReality({scene,buildings:BUILDINGS.filter(building=>building.id==='7645350'),baseElevation:(_x,_z,building)=>buildingBaseHeight(building.points)});
const exterior=createCampusExterior(scene),root=exterior.assetRoots.find(root=>root.metadata.sourceId==='7645350')!;
const results=[];
for(const part of recorded){
  const mesh=root.getChildMeshes().find(mesh=>mesh.name===part.name)!;
  if(!mesh)throw Error('Missing fresh roof part '+part.name);
  const data=mesh.getVerticesData('position')!,normals=mesh.getVerticesData('normal')!,matrix=mesh.computeWorldMatrix(true);let maxPositionError=0,maxNormalError=0;
  for(let i=0;i<data.length;i+=3){
    const fresh=Vector3.TransformCoordinates(Vector3.FromArray(data,i),matrix),normal=Vector3.TransformNormal(Vector3.FromArray(normals,i),matrix).normalize();
    const expected=new Vector3(part.positions[i]+model.origin.x,part.positions[i+1]+model.origin.y,part.positions[i+2]+model.origin.z);
    maxPositionError=Math.max(maxPositionError,Vector3.Distance(fresh,expected));maxNormalError=Math.max(maxNormalError,Vector3.Distance(normal,Vector3.FromArray(part.normals,i)));
  }
  const indices=Array.from(mesh.getIndices()!);
  for(let i=0;i<indices.length;i+=3){const a=Vector3.FromArray(data,indices[i]*3),b=Vector3.FromArray(data,indices[i+1]*3),c=Vector3.FromArray(data,indices[i+2]*3),normal=Vector3.FromArray(normals,indices[i]*3);if(Vector3.Dot(Vector3.Cross(b.subtract(a),c.subtract(a)),normal)<0)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];}
  const sameIndices=JSON.stringify(indices)===JSON.stringify(part.indices);
  if(maxPositionError>1e-6||maxNormalError>1e-6||!sameIndices)throw Error('Market roof archive drift '+JSON.stringify({name:part.name,maxPositionError,maxNormalError,sameIndices}));
  results.push({name:part.name,triangles:indices.length/3,maxPositionError,maxNormalError,sameIndices});
}
if(results.length!==2)throw Error('Expected both Market roof + roof seam archive parts');
const report={recordedAt:new Date().toISOString(),sourceId:'7645350',archiveSourcePlanSha256:createHash('sha256').update(bytes).digest('hex'),sourcePlanBytesUnchanged:readFileSync(path).equals(bytes),matchesFreshRuntimeGeometry:true,parts:results,foundationArchiveRefreshRequired:false};
mkdirSync('docs/reality-pack/terrain/court-repair',{recursive:true});writeFileSync('docs/reality-pack/terrain/court-repair/market-roof-sync-audit.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));exterior.dispose();architecture.dispose();scene.dispose();engine.dispose();
