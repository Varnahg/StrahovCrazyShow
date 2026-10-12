import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import assert from "node:assert/strict";

const root=path.resolve(import.meta.dirname,".."),source=path.join(root,"assets/sources/vegetation/grass_medium_01/derived/leaf-planes-v2");
const input=process.argv.includes("--from-bake")?path.join(root,".cache/photographic-leaf-export"):source;
const manifest=JSON.parse(fs.readFileSync(path.join(input,"leaf-manifest.json"),"utf8"));
const out=path.join(root,".cache/photographic-leaf-export/runtime");fs.mkdirSync(out,{recursive:true});
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
assert.equal(hash(fs.readFileSync(path.join(root,"assets/sources/vegetation/grass_medium_01/derived/grass-authored-v2-study.blend"))),manifest.masterSha256);
const sourceFlat=manifest.geometries.flat,far={positions:[],normals:[],uvs:[],indices:[],triangles:0,leafCount:0,sourceLeafIds:[],materialChannel:"flat"};
for(let leaf=0;leaf<42;leaf+=4){
 const offset=far.positions.length/3;
 far.positions.push(...sourceFlat.positions.slice(leaf*12,leaf*12+12));far.normals.push(...sourceFlat.normals.slice(leaf*12,leaf*12+12));far.uvs.push(...sourceFlat.uvs.slice(leaf*8,leaf*8+8));far.indices.push(offset,offset+1,offset+2,offset,offset+2,offset+3);far.sourceLeafIds.push(leaf);
}
far.triangles=far.indices.length/3;far.leafCount=far.sourceLeafIds.length;
const channelNames={albedo:"albedo",alpha:"alpha",normal:"normal",normalBent:"normal-bent",arm:"arm"};
const textures={width:1024,height:512,originalSourcePixelsModified:false,derivedAtlas:true,files:{}};
for(const [key,channel] of Object.entries(channelNames)){
 const entry=manifest.channels[channel],file="lawn-leaf-v2-"+channel+".png";
 // Permanent source package keeps the actual derived atlas bytes, not cache links.
 const bytes=fs.readFileSync(path.join(input,entry.file));assert.equal(hash(bytes),entry.sha256);
 fs.writeFileSync(path.join(out,file),bytes);textures.files[key]={file,sha256:entry.sha256,bytes:bytes.length};
}
const levels={near:{...manifest.geometries.bent,leafCount:42,sourceLeafIds:Array.from({length:42},(_,i)=>i),materialChannel:"bent"},medium:{...sourceFlat,leafCount:42,sourceLeafIds:Array.from({length:42},(_,i)=>i),materialChannel:"flat"},far};
assert.deepEqual(Object.values(levels).map(g=>g.triangles),[168,84,22]);
const pack={schemaVersion:2,representation:"individual-photographic-leaf-planes",units:"metres",sourceGeometrySha256:manifest.sourceGeometrySha256,sourceBlendSha256:manifest.masterSha256,sourceURL:manifest.sourceURL,license:manifest.license,originalSourcePixelsModified:false,highestSource:{path:"assets/sources/vegetation/grass_medium_01/derived/grass-uv-aware-render-pack.json",triangles:5376,unchanged:true},textures,levels};
pack.runtimeGeometryId=hash(Buffer.from(JSON.stringify(pack)));
fs.writeFileSync(path.join(out,"geometry.json"),JSON.stringify(pack)+"\n");
fs.writeFileSync(path.join(out,"export-audit.json"),JSON.stringify({status:"staged",runtimeGeometryId:pack.runtimeGeometryId,sourceBlendSha256:pack.sourceBlendSha256,atlas:[1024,512],sharedAcrossAllQualities:true,levels:Object.fromEntries(Object.entries(levels).map(([name,g])=>[name,{triangles:g.triangles,leaves:g.leafCount,sourceLeafIds:g.sourceLeafIds}])),textureBytes:Object.values(textures.files).reduce((n,file)=>n+file.bytes,0),productionPerformanceClaim:false},null,2)+"\n");
console.log("Staged source-derived leaf runtime:",out);
