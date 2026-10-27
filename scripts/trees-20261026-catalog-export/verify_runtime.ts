import { readFileSync } from 'node:fs';
import { TREES } from '../../shared/world';
import { treeTrunkCollision } from '../../shared/vegetation';
import { parseTreePilotManifest, type TreeLod } from '../../shared/tree-asset-types';
import { parseTreeClusterBank } from '../../shared/tree-cluster-types';
import { decodeTreePrototype } from '../../client/tree-asset-loader';
import { decodeTreeClusterGeometry } from '../../client/tree-cluster-geometry';
// @ts-expect-error Authoring CLI helpers.
import { ROOT,loadRun,selectedRows,parseArgs,writeJson,read,pinned,info } from './io.mjs';
// @ts-expect-error Pure catalogue assembly and explicit receipt loading.
import { assembleManifest,completedEntries } from './publish.mjs';

const bytes=(file:{url:string;bytes:number;sha256:string})=>{
  pinned({path:'public'+file.url,bytes:file.bytes,sha256:file.sha256});
  return Uint8Array.from(readFileSync(ROOT+'/public'+file.url)).buffer;
};
const ranks=(parts:ReturnType<typeof decodeTreePrototype>)=>{
  const found=new Set<number>();for(const part of parts)if(part.colors)for(const index of part.indices)found.add(Math.round(part.colors[index*4+3]*65535));
  return [...found].sort((a,b)=>a-b);
};
const args=parseArgs('--verify');if(!args.run||!args.ids)throw Error('Require --run and --ids');
// Historical asset verification intentionally uses today's production decoder.
// It validates frozen inputs and output hashes, never regenerates old geometry.
const run=loadRun(args.run,{verifyCode:false}),rows=args.ids==='all'?selectedRows(run,'all'):args.ids.split(',').map((id:string)=>selectedRows(run,id)[0]);
const far=read('public/models/vegetation/seasonal-r6-far/pilot-manifest.json');
const assembled=assembleManifest({...run.catalog,count:rows.length,placements:rows},completedEntries(run,rows),far.bank);
const manifest=parseTreePilotManifest(assembled.manifest),bank=parseTreeClusterBank(JSON.parse(new TextDecoder().decode(bytes(far.bank))));
const result=[];
for(const placement of manifest.placements){
  const source=TREES.find(t=>t.osmId===placement.sourceTreeId);if(!source||source.x!==placement.sourceRootXZ[0]||source.z!==placement.sourceRootXZ[1])throw Error('Runtime source root mismatch');
  const id=placement.prototypeCandidates[0],prototype=manifest.prototypes[id];if(prototype.trunkRadius!==treeTrunkCollision(source).radius)throw Error('Runtime collision radius mismatch');
  const decoded=[0,1,2].map(lod=>decodeTreePrototype(bytes(prototype.lods[lod]),id,prototype,lod as TreeLod));
  const near=ranks(decoded[0]),mid=ranks(decoded[1]),exact=ranks(decoded[2]);
  if(JSON.stringify(near)!==JSON.stringify(mid))throw Error('Near/MID rank coverage mismatch');
  let cards;
  if(prototype.farCluster){
    cards=decodeTreeClusterGeometry(bytes(prototype.farCluster.placements),bank,{groupCount:prototype.farCluster.groupCount,exactRanks:exact});
    const all=new Set(exact);for(const index of cards.indices)all.add(Math.round(cards.colors[index*4+3]*65535));
    if(JSON.stringify([...all].sort((a,b)=>a-b))!==JSON.stringify(mid))throw Error('Full FAR rank coverage differs from MID');
  }else if(prototype.family==='evergreen-conifer'&&JSON.stringify(exact)!==JSON.stringify(mid))throw Error('Conifer FAR must preserve every original MID twig rank');
  result.push({sourceTreeId:source.osmId,prototypeId:id,lodParts:decoded.map(p=>p.length),rankGroups:mid.length,cardTriangles:cards?cards.indices.length/3:0,exactFarTriangles:decoded[2].reduce((n,p)=>n+p.indices.length/3,0),runtimeDecoderPass:true});
}
const verifier=info('scripts/trees-20261026-catalog-export/verify_runtime.ts');
writeJson(run.cache+'/runtime-audit-'+(args.ids==='all'?'all':args.ids.replaceAll(',','_'))+'-'+verifier.sha256.slice(0,12)+'.json',{runId:run.id,verifier,sourceCount:result.length,results:result,blenderEvidence:'complete.json per source; this audit independently uses the production runtime decoders',gpuEvidence:false});
console.log(JSON.stringify({sourceCount:result.length,status:'PASS'}));
