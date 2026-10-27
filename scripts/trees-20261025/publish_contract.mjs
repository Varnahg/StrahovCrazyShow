// Read the actual audited pilot exports; never guess URLs or choose a variant.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('../../',import.meta.url));
const dir=path.join(root,'public/models/vegetation/seasonal');
const audit=JSON.parse(fs.readFileSync(path.join(dir,'pilot-manifest.json')));
const out={version:2,units:'metres',rankEncoding:'uint16-normalized',coordinateSpace:'root-local glTF Y-up; placement is separate',
  usage:'pilot candidates only; explicit runtime selection required',prototypes:{},placements:[]};
for(const v of audit.variants){
  const file=path.join(dir,v.export.file),bytes=fs.readFileSync(file);
  if(createHash('sha256').update(bytes).digest('hex')!==v.export.sha256)throw Error('Stale GLB '+v.id);
  if(v.foliage.lods.some(l=>l.ranks.some(r=>r<=0||r>=65535)||l.retainedAtFractions===undefined))throw Error('Unvalidated rank spread '+v.id);
  out.prototypes[v.id]={sourceTreeId:v.sourceTreeId,family:v.kind==='broadleaf'?'deciduous-broadleaf':'evergreen-conifer',
    nominalHeight:v.nominalHeight,nominalCrownDiameter:v.nominalCrownDiameter,trunkRadius:v.trunkRadius,
    dimensionBasis:'source catalogue estimates; anatomy interpreted for realism, not botanical identification',
    lods:[0,1,2].map(lod=>({url:'/models/vegetation/seasonal/'+v.export.file,bytes:bytes.length,sha256:v.export.sha256,
      meshNames:[`${v.id}__lod${lod}__wood`,`${v.id}__lod${lod}__foliage`]}))};
  let placement=out.placements.find(p=>p.sourceTreeId===v.sourceTreeId);
  if(!placement){placement={sourceTreeId:v.sourceTreeId,sourceRootXZ:v.sourceRootXZ,positionUncertaintyMetres:v.sourcePositionUncertaintyMetres,
    prototypeCandidates:[],selectedPrototypeId:null};out.placements.push(placement);}
  placement.prototypeCandidates.push(v.id);
}
fs.writeFileSync(path.join(dir,'runtime-contract.json'),JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({prototypes:Object.keys(out.prototypes),placements:out.placements}));
