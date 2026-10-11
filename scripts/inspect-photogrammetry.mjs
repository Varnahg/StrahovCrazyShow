/** Inspect only public, explicitly CC BY IPR metadata; no credentials. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const cache = '.cache/photogrammetry-research';
await mkdir(cache, { recursive: true });
const base = 'https://tiles.arcgis.com/tiles/SBTXIEUGWbqzUecw/arcgis/rest/services/praha2023_merged_WM/SceneServer/layers/0';
const origin = {lat:50.08065,lon:14.39175};
const R=6378137, cos=Math.cos(origin.lat*Math.PI/180);
const ox=origin.lon*Math.PI/180*R, oy=Math.log(Math.tan(Math.PI/4+origin.lat*Math.PI/360))*R;
const bounds={minX:-500,maxX:440,minZ:-270,maxZ:340};
const seen=new Set(), leaves=[], histogram={};
let fetched=0;
async function json(url, file) {
  try { return JSON.parse(await readFile(file,'utf8')); } catch {}
  const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`${response.status} ${url}`);
  const data=await response.json();if(data.error)throw new Error(JSON.stringify(data.error));
  await writeFile(file,JSON.stringify(data));return data;
}
function intersects(mbs) {
  const x=(mbs[0]-ox)*cos,z=-(mbs[1]-oy)*cos,r=mbs[3]*cos;
  return Math.hypot(Math.max(bounds.minX-x,0,x-bounds.maxX),Math.max(bounds.minZ-z,0,z-bounds.maxZ))<=r;
}
let queue=[{id:'root'}];
while(queue.length){
 const batch=queue.splice(0,8);
 const nodes=await Promise.all(batch.map(async ref=>{
  if(seen.has(ref.id))return null; seen.add(ref.id);
  if(ref.mbs&&!intersects(ref.mbs))return null;
  const data=await json(`${base}/nodes/${ref.id}?f=json`,`${cache}/node-${ref.id}.json`);fetched++;
  return data;
 }));
 for(const node of nodes){
  if(!node||!intersects(node.mbs))continue;
  histogram[node.level]=(histogram[node.level]??0)+1;
  if(node.children?.length) queue.push(...node.children);
  else leaves.push(node);
 }
 if(fetched%80<8)console.log(JSON.stringify({fetched,queued:queue.length,leaves:leaves.length}));
}
const report={source:base,item:'https://www.arcgis.com/home/item.html?id=92d2d376599c4fd2b6600ed46db7402e',license:'CC BY',attribution:'datový podklad © IPR Praha',capture:'summer 2023',origin,mercatorOrigin:{x:ox,y:oy},cos,bounds,fetched,histogram,leafCount:leaves.length,leaves};
await writeFile(`${cache}/strahov-leaves.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({fetched,histogram,leafCount:leaves.length,sample:leaves[0]}));
