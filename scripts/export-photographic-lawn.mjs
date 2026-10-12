import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..'),base=path.join(root,'assets/sources/vegetation/grass_medium_01');
const sourcePath=path.join(base,'derived/grass-authored-v2-study.json');
const sourceBytes=fs.readFileSync(sourcePath),source=JSON.parse(sourceBytes);
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const before=hash(sourceBytes),sourceBlend=hash(fs.readFileSync(path.join(base,'derived/grass-authored-v2-study.blend')));
const out=path.join(root,'.cache/photographic-lawn-export');fs.mkdirSync(out,{recursive:true});
const levels=[['highest',5,1,0,0],['near',3,1,.00045,4],['medium',2,2,.0013,8],['far',2,4,.003,12]];
let randomState=0x20261011;
const random=()=>{randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;return(randomState>>>0)/4294967296;};
const roots=[];
for(let attempt=0;roots.length<42&&attempt<42000;attempt++){const p=[(random()-.5)*.078,(random()-.5)*.078];if(roots.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>=.006))roots.push(p);}
assert.equal(roots.length,42);
const geometries={},audits=[];
function interpolate(values,indices,weights,size){return Array.from({length:size},(_,axis)=>indices.reduce((sum,index,j)=>sum+values[index*size+axis]*weights[j],0));}
let leafNumber=0;
const leafTransforms=source.tufts.flatMap(tuft=>tuft.bladeReferences.map(ref=>{
 const rootIndex=ref.vertexStart+2,old=[tuft.positions[rootIndex*3],tuft.positions[rootIndex*3+2]],target=roots[leafNumber++];
 return{sourceTuft:tuft.id,blade:ref.blade,translation:[target[0]-old[0],0,target[1]-old[1]],root:target};
}));
function adaptiveRows(tuft,ref,geometryTolerance,uvPixelTolerance){
 if(!geometryTolerance)return Array.from({length:17},(_,i)=>i);
 const kept=new Set([0,16]);
 const split=(a,b)=>{let worst=1,chosen=-1;for(let row=a+1;row<b;row++){const t=(row-a)/(b-a);for(const col of [0,2,4]){const x=ref.vertexStart+a*5+col,y=ref.vertexStart+b*5+col,z=ref.vertexStart+row*5+col;
 const positionError=Math.hypot(...[0,1,2].map(k=>tuft.positions[x*3+k]*(1-t)+tuft.positions[y*3+k]*t-tuft.positions[z*3+k]));
 const uvError=Math.hypot(...[0,1].map(k=>tuft.uvs[x*2+k]*(1-t)+tuft.uvs[y*2+k]*t-tuft.uvs[z*2+k]))*8192;
 const score=Math.max(positionError/geometryTolerance,uvError/uvPixelTolerance);if(score>worst){worst=score;chosen=row;}}}if(chosen>=0){kept.add(chosen);split(a,chosen);split(chosen,b);}};
 split(0,16);return [...kept].sort((a,b)=>a-b);
}
for(const[name,cross,leafStride,geometryTolerance,uvPixelTolerance]of levels){
 const g={positions:[],normals:[],uvs:[],indices:[],sourceVertexIndices:[],leaves:[]};
 let sourceVertexOffset=0,leafId=0,maxPositionError=0,maxUVError=0,maxNormalAngle=0;
 for(const tuft of source.tufts){
  for(const ref of tuft.bladeReferences){
   const originalLeafId=leafId++,transform=leafTransforms[originalLeafId];
   if(originalLeafId%leafStride!==0)continue;
   const rows=adaptiveRows(tuft,ref,geometryTolerance,uvPixelTolerance),segments=rows.length-1,cols=cross===5?[0,1,2,3,4]:cross===3?[0,2,4]:[0,4];
   const offset=g.positions.length/3;
   for(const row of rows)for(const col of cols){
    const index=ref.vertexStart+row*5+col;
    g.positions.push(...tuft.positions.slice(index*3,index*3+3).map((v,a)=>v+transform.translation[a]));
    g.normals.push(...tuft.normals.slice(index*3,index*3+3));g.uvs.push(...tuft.uvs.slice(index*2,index*2+2));g.sourceVertexIndices.push(sourceVertexOffset+index);
   }
   for(let row=0;row<segments;row++)for(let col=0;col<cross-1;col++){const a=offset+row*cross+col,b=a+1,c=a+cross,d=c+1;g.indices.push(a,c,b,b,c,d);}
   g.leaves.push({sourceTuft:tuft.id,sourceBlade:ref.blade,vertexStart:offset,vertexCount:rows.length*cols.length,retainedSourceRows:rows,sourceLeafId:originalLeafId,tipType:ref.tipType});
   // Compare every original high vertex against the actual derived triangle at
   // its surface parameter; reports interpolation error, not only retained IDs.
   for(let row=0;row<=16;row++)for(let col=0;col<5;col++){
    const ri=Math.max(0,Math.min(segments-1,rows.findIndex((r,i)=>r>=row&&i>0)-1)),c=col/4*(cross-1),ci=Math.min(cross-2,Math.floor(c)),v=(row-rows[ri])/(rows[ri+1]-rows[ri]),u=c-ci;
    const a=offset+ri*cross+ci,b=a+1,cc=a+cross,d=cc+1;
    const ids=u+v<=1?[a,cc,b]:[b,cc,d],weights=u+v<=1?[1-u-v,v,u]:[1-v,1-u,u+v-1];
    const sourceIndex=ref.vertexStart+row*5+col;
    const point=interpolate(g.positions,ids,weights,3),uv=interpolate(g.uvs,ids,weights,2),normal=interpolate(g.normals,ids,weights,3);
    maxPositionError=Math.max(maxPositionError,Math.hypot(...point.map((value,axis)=>value-(tuft.positions[sourceIndex*3+axis]+transform.translation[axis]))));
    maxUVError=Math.max(maxUVError,Math.hypot(...uv.map((value,axis)=>value-tuft.uvs[sourceIndex*2+axis])));
    const length=Math.hypot(...normal),dot=normal.reduce((n,v,a)=>n+v/length*tuft.normals[sourceIndex*3+a],0);maxNormalAngle=Math.max(maxNormalAngle,Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI);
   }
  }
  sourceVertexOffset+=tuft.positions.length/3;
 }
 g.triangles=g.indices.length/3;g.longitudinalSegments="UV-aware adaptive source rows";g.crossSectionVertices=cross;
 assert.ok(g.triangles>0);assert.equal(g.leaves.length,Math.ceil(42/leafStride));assert.ok(g.positions.every(Number.isFinite));assert.ok(g.indices.every(i=>i>=0&&i<g.positions.length/3));
 geometries[name]=g;audits.push({name,triangles:g.triangles,vertices:g.positions.length/3,sourceLeaves:g.leaves.length,leafStride,sourceRowsPerLeaf:g.leaves.map(l=>l.retainedSourceRows.length),maximumShapeErrorMetres:maxPositionError,maximumUVErrorAtOriginal8192Pixels:maxUVError*8192,maximumInterpolatedNormalErrorDegrees:maxNormalAngle,UVPixelsEdited:false});
}
const data={schemaVersion:1,geometrySource:'Authored v2 highest; separate UV-aware sampled-row and whole-leaf LODs, no master edits',sourceGeometrySha256:before,sourceBlendSha256:sourceBlend,sourcePixelsModified:false,units:'metres',macroLeafCount:42,macroRootAreaMetres:.078,rootRedistribution:'Uniform blue-noise roots, whole-leaf translations only; no deformation or invented specimen survey',leafTransforms,levels:geometries};
data.runtimeGeometryId=hash(Buffer.from(JSON.stringify(data)));
fs.writeFileSync(path.join(out,'grass-render-candidate.json'),JSON.stringify(data)+'\n');
const report={status:'passed',sourceGeometrySha256:before,sourceBlendSha256:sourceBlend,sourceUnchanged:hash(fs.readFileSync(sourcePath))===before,masterRetained:true,levels:audits,bytes:fs.statSync(path.join(out,'grass-render-candidate.json')).size,performanceClaim:false};
assert.ok(report.sourceUnchanged);fs.writeFileSync(path.join(out,'geometry-export-audit.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
