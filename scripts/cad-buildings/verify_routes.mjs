// Přenositelné ověření celých schodišťových tras v obou směrech.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argumentsMap, required, openModel, writeReport } from './rapier_model.mjs';

export function routePath(scene,flights,access={}) {
  const path=[];
  const shifted=point=>point.map((value,i)=>value+(access.offsetCad?.[i]??0));
  for(const flight of flights) {
    const a=scene.local(shifted(flight.a)),b=scene.local(shifted(flight.b));
    const length=Math.hypot(b.x-a.x,b.z-a.z),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
    if(!Number.isFinite(length)||length<=0)throw new Error('Neplatné rameno '+flight.id);
    path.push({x:a.x-dx*0.4,z:a.z-dz*0.4,floor:flight.bottom,edge:'lower',flight:flight.id});
    path.push({x:b.x+dx*0.4,z:b.z+dz*0.4,floor:flight.top,edge:'upper',flight:flight.id});
  }
  if(access.lowerApproachCad)path[0]={...path[0],...scene.local(access.lowerApproachCad)};
  if(access.upperApproachCad)path[path.length-1]={...path.at(-1),...scene.local(access.upperApproachCad)};
  if(access.viaCad?.length) {
    if(flights.length!==1)throw new Error('Portálové mezibody podporují samostatné rameno');
    path.splice(1,0,...access.viaCad.map(point=>({...scene.local(point),floor:null,edge:'portal-via',flight:flights[0].id})));
  }
  return path;
}

export async function verifyRoutes(args) {
  const allowed=new Set(['--model','--output','--dependency-root','--actor-source','--profile','--speed','--route','--access-overrides','--door-state']);
  for(const key of args.keys())if(!allowed.has(key))throw new Error('Neznámý argument '+key);
  const accessOverrides=args.has('--access-overrides')?JSON.parse(readFileSync(resolve(args.get('--access-overrides')),'utf8')):{};
  const {scene,metadata}=await openModel(args);
  const results=[];
  try {
    const groups=new Map();
    for(const flight of scene.model.stairs??[]) {
      const id=flight.routeId??flight.id;
      if(args.has('--route')&&!id.includes(args.get('--route')))continue;
      if(!groups.has(id))groups.set(id,[]);
      groups.get(id).push(flight);
    }
    if(!groups.size)throw new Error('Žádná vybraná schodišťová trasa');
    for(const [id,flights] of groups) {
      flights.sort((a,b)=>(a.routeIndex??0)-(b.routeIndex??0));
      if(flights.some((f,i)=>f.routeId&&(f.routeIndex!==i||f.routeSegmentCount!==flights.length)))throw new Error('Neúplná trasa '+id);
      const access=accessOverrides[id]??flights[0].routeAccessPath??{};
      const forward=routePath(scene,flights,access);
      for(const direction of ['up','down']) {
        const path=direction==='up'?forward:[...forward].reverse();
        const walker=scene.walker(path[0]);
        try {
          const setup=walker.settle(),legs=[];
          if(setup.setupValid)for(const target of path.slice(1)) {
            const leg=walker.moveTo(target);legs.push(leg);
            if(!leg.passed)break;
          }
          results.push({id,direction,...setup,path,accessPath:access,legs,
            passed:setup.setupValid&&legs.length===path.length-1&&legs.every(leg=>leg.passed)});
        } finally { walker.dispose(); }
      }
    }
  } finally { scene.free(); }
  return {scope:'Celé stavební schodišťové trasy; samostatná CPU scéna; při deklarovaných otevřených dveřích jde o podmíněné geometrické pokrytí, interakce se ověřují zvlášť',...metadata,accessOverrides,
    cases:results.length,passed:results.filter(r=>r.passed).length,results};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const args=argumentsMap();
  const output=required(args,'--output');
  verifyRoutes(args).then(report=>{
    writeReport(output,report);
    console.log(JSON.stringify({cases:report.cases,passed:report.passed,failed:report.results.filter(r=>!r.passed).map(r=>({
      id:r.id,direction:r.direction,setupValid:r.setupValid,remaining:r.legs.at(-1)?.remaining,footError:r.legs.at(-1)?.footError}))}));
    process.exitCode=report.cases===report.passed?0:1;
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
