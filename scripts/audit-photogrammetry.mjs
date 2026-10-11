import {readFile,writeFile} from 'node:fs/promises';
const m=JSON.parse(await readFile('shared/data/photogrammetry.json','utf8'));
const cos=m.metresPerMercatorUnit;
const nodes=m.nodes.filter(n=>n.level===16&&Math.hypot((n.center[0]-m.mercatorOrigin.x)*cos-8,-(n.center[1]-m.mercatorOrigin.y)*cos+55)<90);
let roofBounds={minX:Infinity,maxX:-Infinity,minZ:Infinity,maxZ:-Infinity,minY:Infinity,maxY:-Infinity},vertices=0;
const probes=[[22,-14],[-4.85,-85],[8,-55],[25,-9],[-95,-55]],hits=probes.map(()=>[]);
for(const n of nodes){
 const b=await readFile('public'+n.geometry),d=new DataView(b.buffer,b.byteOffset,b.byteLength),count=d.getUint32(0,true);
 const vertex=i=>[(n.center[0]+d.getFloat32(8+i*12,true)-m.mercatorOrigin.x)*cos,n.center[2]+d.getFloat32(16+i*12,true)-m.worldHeightReference,-(n.center[1]+d.getFloat32(12+i*12,true)-m.mercatorOrigin.y)*cos];
 for(let i=0;i<count;i+=3){
  const p=[vertex(i),vertex(i+1),vertex(i+2)];vertices+=3;
  for(let j=0;j<probes.length;j++){
   const [x,z]=probes[j],[a,b,c]=p,den=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
   if(Math.abs(den)<1e-10)continue;
   const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/den,v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/den;
   if(u>=-1e-5&&v>=-1e-5&&u+v<=1.00001)hits[j].push(u*a[1]+v*b[1]+(1-u-v)*c[1]);
  }
  for(const [x,y,z]of p){
   if(x>-3&&x<20&&z>-94&&z<-15&&y>17&&y<23){roofBounds.minX=Math.min(roofBounds.minX,x);roofBounds.maxX=Math.max(roofBounds.maxX,x);roofBounds.minZ=Math.min(roofBounds.minZ,z);roofBounds.maxZ=Math.max(roofBounds.maxZ,z);roofBounds.minY=Math.min(roofBounds.minY,y);roofBounds.maxY=Math.max(roofBounds.maxY,y);}
  }
 }
}
const report={license:m.license,highestLeaves:m.leafCount,highestTriangles:m.nodes.filter(n=>n.level===16).reduce((s,n)=>s+n.triangles,0),checkedNodes:nodes.length,vertices,roofBounds,probes:probes.map((p,i)=>({xz:p,heights:[...new Set(hits[i].map(y=>Math.round(y*1000)/1000))].sort((a,b)=>a-b)}))};
await writeFile('docs/photogrammetry/source-coordinate-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
