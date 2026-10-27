import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {placementBytes} from '../trees-20261026-r6-far/publish.mjs';
import {fitToExistingBank} from './population.mjs';
import {read,writeJson,writeImmutable,loadRun,selectedRows,parseArgs} from './io.mjs';
export function fitSourceFar(run,row){
 const directory=`${run.cache}/${row.sourceTreeId}`,prepared=read(directory+'/prepared.json');
 if(prepared.reuseAcceptedPilot||row.family!=='deciduous-broadleaf')return;
 const groups=read(directory+'/far-groups.json'),bank=read('public/models/vegetation/seasonal-r6-far/bank-source.json');
 const placements=fitToExistingBank(groups,bank),exact=placements.filter(p=>p.exact),output=`${run.public}/${row.sourceTreeId}/placements.bin`;
 const file=writeImmutable(output,placementBytes(placements));
 const report={runId:run.id,sourceTreeId:row.sourceTreeId,groupCount:groups.length,placements,exactFallbackRanks:exact.map(p=>p.rank),file,
  counts:{parts:groups.reduce((n,g)=>n+g.parts.length,0),exactGroups:exact.length,exactParts:exact.reduce((n,p)=>n+p.sourcePartIndices.length,0)},bankSha256:bank.bankSha256};
 writeJson(directory+'/far-fit.json',report);return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=parseArgs('--fit');if(!args.run||!args.id)throw Error('Require --run and --id');const run=loadRun(args.run);
 for(const row of selectedRows(run,args.id)){const r=fitSourceFar(run,row);if(r)console.log(JSON.stringify({id:row.sourceTreeId,...r.counts}));}
}
