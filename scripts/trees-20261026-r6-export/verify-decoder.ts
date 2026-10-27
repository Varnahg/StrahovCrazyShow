import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseTreePilotManifest} from '../../shared/tree-asset-types';
import {decodeTreePrototype} from '../../client/tree-asset-loader';
const cache='.cache/trees-r6-export-20261026',rows=[];
for(const folder of['seasonal-r6','seasonal-r6-streamed']){
 const raw=JSON.parse(readFileSync(`public/models/vegetation/${folder}/runtime-contract.json`,'utf8')),manifest=parseTreePilotManifest(raw);
 for(const[id,prototype]of Object.entries(manifest.prototypes)){
  for(const lod of manifest.version===2?[undefined]:[0,1,2]as const){
   const descriptor=prototype.lods[lod??0],bytes=readFileSync('public'+descriptor.url);
   if(bytes.length!==descriptor.bytes||createHash('sha256').update(bytes).digest('hex')!==descriptor.sha256)throw Error('Descriptor integrity mismatch');
   const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)as ArrayBuffer;
   const parts=decodeTreePrototype(buffer,id,prototype,lod);
   if(parts.length!==(lod===undefined?6:2))throw Error('LOD primitive count mismatch');
   rows.push({version:manifest.version,id,lod:lod??'whole',url:descriptor.url,parts:parts.map(p=>({name:p.name,vertices:p.positions.length/3,triangles:p.indices.length/3,ranks:p.colors?new Set(Array.from(p.colors).filter((_,i)=>i%4===3)).size:0}))});
  }
 }
}
writeFileSync(cache+'/decoder-report.json',JSON.stringify({productionDecoder:true,assets:rows},null,2)+'\n');
console.log(JSON.stringify({productionDecoder:true,assets:rows.length,primitives:rows.reduce((n,r)=>n+r.parts.length,0)}));
