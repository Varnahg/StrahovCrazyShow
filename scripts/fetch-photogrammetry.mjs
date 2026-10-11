/** Preserve IPR's original highest-detail Strahov geometry and JPEG atlases.
 * No generated replacement textures, mesh decimation or Google content. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir='public/models/photogrammetry/ipr2023';
const research='.cache/photogrammetry-research';
const plan=JSON.parse(await readFile(`${research}/strahov-leaves.json`,'utf8'));
const item=JSON.parse(await readFile(`${research}/mesh-item.json`,'utf8'));
if(item.access!=='public'||!/^<p>CC BY<\/p>$/.test(item.licenseInfo.replaceAll('\\/','/')))
 throw new Error('The public CC BY source declaration has changed; inspect it before import.');
await mkdir(dir,{recursive:true});
await mkdir('docs/photogrammetry',{recursive:true});
await writeFile('docs/photogrammetry/ipr-source-item.json',JSON.stringify(item,null,2));
await writeFile('docs/photogrammetry/ipr-source-layer.json',await readFile(`${research}/3d_mesh-metadata.json`));
const nodes=[];
// Finest leaves are archived first. Lower source levels remain separate and
// cannot overwrite the master. Levels 12--15 are useful later for distance LOD.
const all=[...plan.leaves];
const ids=new Set(all.map(n=>n.id));
for(const leaf of plan.leaves){
 let parent=leaf.parentNode;
 while(parent&&!ids.has(parent.id)){
  const n=JSON.parse(await readFile(`${research}/node-${parent.id}.json`,'utf8'));
  if(n.level<12)break;
  ids.add(n.id);all.push(n);parent=n.parentNode;
 }
}
let done=0,totalBytes=0;
const sha=b=>createHash('sha256').update(b).digest('hex');
async function download(url,file){
 try{return await readFile(file);}catch{}
 let error;
 for(let i=0;i<4;i++){
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(45000)});
   if(!r.ok)throw new Error(`${r.status} ${url}`);
   const b=Buffer.from(await r.arrayBuffer());await writeFile(file,b);return b;
  }catch(e){error=e;await new Promise(r=>setTimeout(r,1000*(i+1)));}
 }
 throw error;
}
const queue=all.slice();
await Promise.all(Array.from({length:8},async()=>{
 while(queue.length){
  const n=queue.shift();if(!n.geometryData?.length)continue;
  if(n.geometryData.length!==1||n.textureData?.length!==1)throw new Error('Unsupported multi-resource node '+n.id);
  const prefix=`${plan.source}/nodes/${n.id}`;
  const [geometry,texture]=await Promise.all([
   download(`${prefix}/geometries/0`,`${dir}/${n.id}.bin`),
   download(`${prefix}/textures/0`,`${dir}/${n.id}.jpg`),
  ]);
  const count=geometry.readUInt32LE(0);
  if(count%3||geometry.length<8+count*20||texture[0]!==255||texture[1]!==216)throw new Error('Invalid original resource '+n.id);
  nodes.push({id:n.id,level:n.level,center:n.obb?.center??n.mbs.slice(0,3),radius:n.mbs[3],children:n.children?.filter(c=>ids.has(c.id)).map(c=>c.id)??[],parent:n.parentNode?.id,vertices:count,triangles:count/3,geometry:`/models/photogrammetry/ipr2023/${n.id}.bin`,texture:`/models/photogrammetry/ipr2023/${n.id}.jpg`,geometrySha256:sha(geometry),textureSha256:sha(texture),geometryBytes:geometry.length,textureBytes:texture.length});
  totalBytes+=geometry.length+texture.length;done++;
  if(done%100===0)console.log(JSON.stringify({done,total:all.length,bytes:totalBytes}));
 }
}));
nodes.sort((a,b)=>Number(a.id)-Number(b.id));
const manifest={schemaVersion:1,provider:'IPR Praha',license:'CC BY',attribution:'datový podklad © IPR Praha',source:plan.source,sourceItem:plan.item,capture:'summer 2023',description:'Actual aerial photogrammetric mesh; original highest-detail geometry and JPEG atlases preserved. Static vegetation is part of the scan, not randomly cloned trees. This is historical imagery, not a 2026 survey.',horizontalCRS:'EPSG:3857',verticalCRS:'Baltic 1957 / Bpv',origin:plan.origin,mercatorOrigin:plan.mercatorOrigin,metresPerMercatorUnit:plan.cos,worldHeightReference:326.392,bounds:plan.bounds,highestDetailLevel:16,leafCount:plan.leafCount,downloadedAt:new Date().toISOString(),sourceItemSha256:sha(await readFile(`${research}/mesh-item.json`)),nodes};
await writeFile(`${dir}/manifest.json`,JSON.stringify(manifest));
await writeFile('shared/data/photogrammetry.json',JSON.stringify(manifest));
console.log(JSON.stringify({done,totalBytes,highestTriangles:nodes.filter(n=>n.level===16).reduce((s,n)=>s+n.triangles,0),manifest:`${dir}/manifest.json`}));
