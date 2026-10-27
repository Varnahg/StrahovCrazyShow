import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inflateSync, deflateRawSync, crc32 } from "node:zlib";

const importer = await import(new URL("../scripts/import-tree-materials.mjs", import.meta.url).href) as {
  imageDimensions(bytes: Buffer): { width: number; height: number; format: string };
  zipEntry(bytes: Buffer, name: string): Buffer;
  verifyTreeMaterials(): Promise<unknown>;
};
type Point = [number, number];
type MapRecord = { sourcePath: string; runtimePath: string; sourceUrl: string; url: string; bytes: number; sha256: string; colorSpace: string; providerMd5?: string };
type Asset = { id: string; license: string; atlasMetres: Point | null; sourcePixelsModified: boolean; localSpecies: null;
  technique: { value: string }; maps: Record<string, MapRecord>; metadata: { path: string; sha256: string; bytes: number }[];
  licenseEvidence: { path: string; sha256: string; bytes: number } };
type Component = { id: number; boundsPixels: number[]; sizePixels: Point; opaquePixels: number; sizeMetres: Point | null;
  exactHullPixels: Point[]; cutoutHullPixels: Point[]; cutoutHullUvBlender: Point[]; boxCoverage: number; cutoutCoverage: number; pilotEligible: boolean };
type Atlas = { id: string; opacitySha256: string; opaquePixels: number; components: Component[];
  rejectedComponents: { count: number; opaquePixels: number }; parts: { id: string; componentId: number; attachmentPixel: Point; axisTipPixel: Point; attachmentUvBlender: Point; physicalLengthMetres: number | null; sampledOpaquePixels: number; additionalIslandOpaquePixels: number }[] };
const manifestPath = "shared/data/assets/tree-materials-manifest.json";
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString("utf8")) as { assets: Asset[] };
const components = JSON.parse(readFileSync("shared/data/tree-leaf-components.json", "utf8")) as {
  materialManifestSha256: string; analysis: { sourcePixelsModified: boolean }; atlases: Atlas[];
};
const hash = (bytes: Buffer, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");

test("tree maps preserve provider bytes, lossless opacity, same dimensions and documented acquisition", async () => {
  await importer.verifyTreeMaterials();
  assert.deepEqual(manifest.assets.map(a => a.id), ["LeafSet024", "fir_tree_01"]);
  assert.equal(components.materialManifestSha256, hash(manifestBytes));
  assert.equal(components.analysis.sourcePixelsModified, false);
  for (const asset of manifest.assets) {
    assert.equal(asset.license, "CC0-1.0"); assert.equal(asset.localSpecies, null); assert.equal(asset.sourcePixelsModified, false);
    assert.deepEqual(Object.keys(asset.maps).sort(), ["color","normalGL","opacity","roughness"]);
    for (const [channel, entry] of Object.entries(asset.maps)) {
      const original = readFileSync(entry.sourcePath), runtime = readFileSync(entry.runtimePath);
      assert.deepEqual(original, runtime); assert.equal(original.length, entry.bytes); assert.equal(hash(original), entry.sha256);
      assert.equal(entry.url, "/" + entry.runtimePath.replace(/^public\//, ""));
      assert.match(entry.sourceUrl, /^https:\/\//); assert.notEqual(entry.sourceUrl, entry.url);
      assert.equal(entry.colorSpace, channel === "color" ? "sRGB" : "linear");
      const size = importer.imageDimensions(original); assert.equal(size.width, 2048); assert.equal(size.height, 2048);
      assert.equal(size.format, channel === "opacity" ? "png" : "jpg");
      if (entry.providerMd5) assert.equal(hash(original, "md5"), entry.providerMd5);
    }
    for (const record of [...asset.metadata, asset.licenseEvidence]) {
      const bytes = readFileSync(record.path); assert.equal(bytes.length, record.bytes); assert.equal(hash(bytes), record.sha256);
    }
    assert.match(readFileSync(asset.licenseEvidence.path, "utf8"), /CC0/);
  }
  assert.equal(manifest.assets[0].technique.value, "surface-photogrammetry");
  assert.deepEqual(manifest.assets[0].atlasMetres, [.4,.4]);
  assert.equal(manifest.assets[1].atlasMetres, null, "whole Fir model dimensions cannot calibrate its twig atlas");
});

/** Independent full PNG reader: preserve 16-bit RGB masks, unlike common 8-bit IO. */
function decodeOpacity(bytes: Buffer) {
  assert.deepEqual([...bytes.subarray(0,8)], [137,80,78,71,13,10,26,10]);
  const width=bytes.readUInt32BE(16), height=bytes.readUInt32BE(20), depth=bytes[24], type=bytes[25];
  assert.ok([8,16].includes(depth)); assert.ok([0,2].includes(type)); assert.equal(bytes[28],0);
  const packed: Buffer[]=[];
  for (let offset=8; offset<bytes.length;) {
    const length=bytes.readUInt32BE(offset), name=bytes.toString("ascii",offset+4,offset+8);
    const data=bytes.subarray(offset+8,offset+8+length);
    assert.equal(crc32(bytes.subarray(offset+4,offset+8+length)),bytes.readUInt32BE(offset+8+length));
    if (name==="IDAT") packed.push(data);
    offset+=length+12;
  }
  const channels=type===0?1:3, sampleBytes=depth/8, stride=channels*sampleBytes, rowBytes=width*stride;
  const data=inflateSync(Buffer.concat(packed)); assert.equal(data.length,(rowBytes+1)*height);
  let previous=Buffer.alloc(rowBytes), row=Buffer.alloc(rowBytes), offset=0;
  const mask=new Uint8Array(width*height), cutoff=depth===8?128:32768;
  for (let y=0;y<height;y++) {
    const filter=data[offset++]; assert.ok(filter<=4);
    for (let i=0;i<rowBytes;i++) {
      const left=i>=stride?row[i-stride]:0, above=previous[i], upperLeft=i>=stride?previous[i-stride]:0;
      const p=left+above-upperLeft, a=Math.abs(p-left), b=Math.abs(p-above), c=Math.abs(p-upperLeft);
      const predictor=filter===0?0:filter===1?left:filter===2?above:filter===3?Math.floor((left+above)/2):a<=b&&a<=c?left:b<=c?above:upperLeft;
      row[i]=(data[offset++]+predictor)&255;
    }
    for (let x=0;x<width;x++) {
      const i=x*stride, value=depth===8?row[i]:row.readUInt16BE(i);
      for (let ch=1;ch<channels;ch++) assert.equal(depth===8?row[i+ch]:row.readUInt16BE(i+ch*sampleBytes),value,"mask RGB channels agree");
      mask[y*width+x]=Number(value>=cutoff);
    }
    [row,previous]=[previous,row];
  }
  return {width,height,depth,mask};
}
function polygonArea(poly: Point[]) { return poly.reduce((sum,a,i)=>{const b=poly[(i+1)%poly.length];return sum+a[0]*b[1]-a[1]*b[0];},0)/2; }
function inside(poly: Point[], x: number, y: number, epsilon=1e-5) {
  return poly.every((a,i)=>{const b=poly[(i+1)%poly.length];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=-epsilon;});
}

for (const asset of manifest.assets) test(asset.id+" alpha components, conservative cutouts, UV origin and attachments match actual pixels", t=>{
  const atlas=components.atlases.find(a=>a.id===asset.id)!;
  const bytes=readFileSync(asset.maps.opacity.sourcePath), {width,height,depth,mask}=decodeOpacity(bytes);
  assert.equal(atlas.opacitySha256,hash(bytes));
  assert.equal(depth,asset.id==="LeafSet024"?8:16);
  assert.equal(mask.reduce((sum,value)=>sum+value,0),atlas.opaquePixels);
  assert.equal(atlas.opaquePixels,asset.id==="LeafSet024"?1743195:988832,"16-bit clipping cannot silently change the source mask");
  const visited=new Uint8Array(mask.length), queue=new Int32Array(mask.length);
  const raw: {count:number;bounds:number[];rowMin:Int32Array;rowMax:Int32Array}[]=[];
  for(let start=0;start<mask.length;start++) {
    if(!mask[start]||visited[start])continue;
    let head=0,tail=1,count=0,x0=width,x1=0,y0=height,y1=0;queue[0]=start;visited[start]=1;
    const rowMin=new Int32Array(height).fill(width),rowMax=new Int32Array(height).fill(-1);
    while(head<tail){const id=queue[head++],x=id%width,y=Math.floor(id/width);count++;x0=Math.min(x0,x);x1=Math.max(x1,x+1);y0=Math.min(y0,y);y1=Math.max(y1,y+1);rowMin[y]=Math.min(rowMin[y],x);rowMax[y]=Math.max(rowMax[y],x);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy,j=yy*width+xx;if(xx<0||xx>=width||yy<0||yy>=height||!mask[j]||visited[j])continue;visited[j]=1;queue[tail++]=j;}}
    raw.push({count,bounds:[x0,y0,x1,y1],rowMin,rowMax});
  }
  const accepted=raw.filter(r=>r.count>=64&&Math.min(r.bounds[2]-r.bounds[0],r.bounds[3]-r.bounds[1])>=4).sort((a,b)=>a.bounds[1]-b.bounds[1]||a.bounds[0]-b.bounds[0]);
  assert.equal(accepted.length,asset.id==="LeafSet024"?9:15);assert.equal(atlas.components.length,accepted.length);
  assert.equal(raw.reduce((n,r)=>n+r.count,0)-accepted.reduce((n,r)=>n+r.count,0),atlas.rejectedComponents.opaquePixels);
  for(const [i,source] of accepted.entries()) {
    const component=atlas.components[i];assert.equal(component.id,i);assert.equal(component.opaquePixels,source.count);assert.deepEqual(component.boundsPixels,source.bounds);
    assert.ok(component.cutoutHullPixels.length<=12);assert.ok(polygonArea(component.cutoutHullPixels)>0);assert.ok(polygonArea(component.cutoutHullUvBlender)>0);
    assert.ok(component.cutoutCoverage>0&&component.cutoutCoverage<=1);
    for(let y=source.bounds[1];y<source.bounds[3];y++)if(source.rowMax[y]>=0)for(const x of [source.rowMin[y],source.rowMax[y]+1])for(const yy of [y,y+1])
      assert.ok(inside(component.cutoutHullPixels,x,yy),`cutout ${asset.id}/${i} clips opaque pixel at ${x},${yy}`);
    for(const [j,p] of [...component.cutoutHullPixels].reverse().entries()) {
      const uv=component.cutoutHullUvBlender[j];assert.ok(Math.abs(uv[0]-p[0]/width)<1e-9);assert.ok(Math.abs(uv[1]-(1-p[1]/height))<1e-9);
      assert.ok(uv.every(v=>v>=-1e-9&&v<=1+1e-9));
    }
    if(asset.atlasMetres)assert.deepEqual(component.sizeMetres,[component.sizePixels[0]/width*.4,component.sizePixels[1]/height*.4]);else assert.equal(component.sizeMetres,null);
  }
  assert.equal(atlas.parts.length,asset.id==="LeafSet024"?9:7);
  for(const part of atlas.parts){const component=atlas.components[part.componentId];assert.equal(component.pilotEligible,true);assert.ok(part.attachmentPixel[1]>part.axisTipPixel[1]);
    for(const [x,y] of [part.attachmentPixel,part.axisTipPixel])assert.equal(mask[Math.floor(y)*width+Math.floor(x)],1,"attachment/tip uses an actual source pixel");
    assert.deepEqual(part.attachmentUvBlender,[part.attachmentPixel[0]/width,1-part.attachmentPixel[1]/height]);
    if(asset.id==="LeafSet024")assert.ok(part.physicalLengthMetres!>.11&&part.physicalLengthMetres!<.14);else assert.equal(part.physicalLengthMetres,null);
    const poly=component.cutoutHullPixels,x0=Math.max(0,Math.floor(Math.min(...poly.map(p=>p[0])))),x1=Math.min(width,Math.ceil(Math.max(...poly.map(p=>p[0]))));
    const y0=Math.max(0,Math.floor(Math.min(...poly.map(p=>p[1])))),y1=Math.min(height,Math.ceil(Math.max(...poly.map(p=>p[1]))));
    let sampled=0;for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)if(mask[y*width+x]&&inside(poly,x+.5,y+.5))sampled++;
    assert.equal(part.sampledOpaquePixels,sampled);assert.equal(part.additionalIslandOpaquePixels,sampled-component.opaquePixels);
    assert.ok(part.additionalIslandOpaquePixels<=158,"cutout cannot accidentally include an adjacent large bark/leaf part");
  }
  if(asset.id==="fir_tree_01")assert.ok(!atlas.parts.some(part=>part.componentId===0),"long bark strip is not a random foliage part");
  t.diagnostic(JSON.stringify({asset:asset.id,sourceBitDepth:depth,accepted:accepted.length,parts:atlas.parts.length,opaquePixels:atlas.opaquePixels}));
});

function oneEntryZip(name:string,data:Buffer) {
  const packed=deflateRawSync(data), n=Buffer.from(name), local=Buffer.alloc(30), central=Buffer.alloc(46), end=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(crc32(data),14);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(n.length,26);
  central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(crc32(data),16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(n.length,28);
  const body=Buffer.concat([local,n,packed]), directory=Buffer.concat([central,n]);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(body.length,16);
  return Buffer.concat([body,directory,end]);
}
test("original ZIP extraction rejects traversal, corruption, missing and truncated entries",()=>{
  const data=Buffer.from("original provider bytes"),zip=oneEntryZip("original.png",data);
  assert.deepEqual(importer.zipEntry(zip,"original.png"),data);
  assert.throws(()=>importer.zipEntry(zip,"../original.png"),/Unsafe/);
  assert.throws(()=>importer.zipEntry(zip,"missing.png"),/Missing/);
  assert.throws(()=>importer.zipEntry(zip.subarray(0,zip.length-1),"original.png"),/ZIP/);
  const corrupt=Buffer.from(zip),central=corrupt.indexOf(Buffer.from([0x50,0x4b,0x01,0x02]));corrupt.writeUInt32LE(0,central+16);
  assert.throws(()=>importer.zipEntry(corrupt,"original.png"),/checksum/);
});
