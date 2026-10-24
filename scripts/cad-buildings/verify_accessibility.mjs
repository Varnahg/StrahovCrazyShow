// Dosažitelnost dveřních bodů: mřížka hledá cestu, PASS vydá až souvislá jízda kapsle.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argumentsMap, required, openModel, sha256, writeReport, doorApproachGeometry, fixedOpeningSpec } from './rapier_model.mjs';
import { routePath } from './verify_routes.mjs';
import { fixedOpeningProtection } from './verify_doors.mjs';

const finitePoint = p => p && [p.x,p.z,p.floor].every(Number.isFinite);
const samePoint = (a,b) => a && b && ['x','z','floor'].every(k => a[k]===null ? b[k]===null : Number.isFinite(a[k])&&Number.isFinite(b[k])&&Math.abs(a[k]-b[k])<1e-6);
const canonical = value => JSON.stringify(value && typeof value==='object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,JSON.parse(canonical(value[k]))])) : value);
const footHeight = p => p.support?.capsuleFootHeight ?? p.floor;
const doorNode = (id,side) => `door:${id}:side:${side}`;
const routeNode = (id,side) => `route:${id}:${side===0?'lower':'upper'}`;

export function validateReportIdentity(report,metadata,label) {
  for (const key of ['modelCollisionSha256','modelGlbSha256','actorSourceSha256','profile']) {
    if (typeof metadata[key]!=='string'||!metadata[key]||report[key]!==metadata[key]) throw new Error(`${label}: neshodná identita ${key}`);
  }
  if (canonical(report.settings)!==canonical(metadata.settings)) throw new Error(`${label}: neshodné nastavení kapsle`);
  if (!Array.isArray(report.results)) throw new Error(`${label}: chybí výsledky`);
}

function successfulLeg(leg,target,settings) {
  if (!leg?.passed || !samePoint(leg.target,target) || !Number.isInteger(leg.frames) || leg.frames<0 ||
      !leg.finish || ![leg.finish.x,leg.finish.y,leg.finish.z,leg.remaining].every(Number.isFinite)) return false;
  const remaining=Math.hypot(leg.finish.x-target.x,leg.finish.z-target.z);
  if (remaining>=.08 || Math.abs(remaining-leg.remaining)>1e-6) return false;
  if (target.floor===null) return true; // pouze vnitřní mezibod celé ověřené schodišťové trasy
  const error=leg.finish.y-footHeight(target)-settings.radius-settings.halfHeight-settings.offset;
  return Number.isFinite(leg.footError)&&Math.abs(error)<.10&&Math.abs(error-leg.footError)<1e-6;
}

function successfulRun(row,path,settings) {
  return row.passed===true && row.setupValid===true && Number.isFinite(row.initialFootError) &&
    Math.abs(row.initialFootError)<.07 && Array.isArray(row.overlaps)&&row.overlaps.length===0 &&
    Array.isArray(row.legs)&&row.legs.length===path.length-1 && row.legs.every((leg,i)=>successfulLeg(leg,path[i+1],settings));
}

// Reporty dodávají pouze doložené portály. Souřadnice kontrolujeme proti anotacím
// téhož modelu; graf nikdy neodvozuje místnosti ani další stavební geometrii.
export function prepareEvidence(scene,metadata,doorReport,routeReport) {
  validateReportIdentity(doorReport,metadata,'Dveře');
  validateReportIdentity(routeReport,metadata,'Schody');
  if (!Array.isArray(scene.model.doors)||!scene.model.doors.length) throw new Error('Model potřebuje vlastní dveřní anotace; původní CAD se nepoužívá');
  if (doorReport.doorSourceMode!=='native-model-annotations'||doorReport.doorSourceSha256!==metadata.modelCollisionSha256) throw new Error('Dveřní report není odvozen ze stejného nativního modelu');
  const nodes=[],links=[],excluded=[],sourceFailures=[];
  const doorRows=new Map();
  for (const row of doorReport.results) {
    const key=`${row.id}:${row.direction}`;
    if (!row.id||![0,1].includes(row.direction)||doorRows.has(key)) throw new Error('Neplatný nebo duplicitní dveřní výsledek');
    doorRows.set(key,row);
  }
  const doorIds=new Set();
  for (const door of scene.model.doors) {
    if (!door.id||doorIds.has(door.id)) throw new Error('Neplatná nebo duplicitní dveřní anotace');
    doorIds.add(door.id);
    const rows=[0,1].map(d=>doorRows.get(`${door.id}:${d}`));
    if (rows.some(row=>!row)) throw new Error('Neúplný dveřní report: '+door.id);
    const {points:expected}=doorApproachGeometry(scene,door);
    const sides=[rows[0].start,rows[0].target];
    if (!samePoint(rows[1].start,sides[1])||!samePoint(rows[1].target,sides[0]) || sides.some((p,i)=>!p||Math.hypot(p.x-expected[i].x,p.z-expected[i].z)>1e-6)) throw new Error('Dveřní body neodpovídají modelu: '+door.id);
    for(const point of sides) {
      const support=scene.floorAt(point,door.bottom),height=support?.height??null;
      const actualFoot=support?.capsuleFootHeight??height;
      if((height===null?point.floor!==null:!Number.isFinite(point.floor)||Math.abs(point.floor-height)>1e-6)||
          (actualFoot!==null&&(!Number.isFinite(footHeight(point))||Math.abs(footHeight(point)-actualFoot)>1e-6))) {
        throw new Error('Podpůrná výška dveřního bodu neodpovídá anotované úrovni: '+door.id);
      }
    }
    const fixed=fixedOpeningSpec(door);
    if (fixed) {
      const proof=fixedOpeningProtection(scene,door);
      const reported=rows.every((row,side)=>proof.hits[side]&&row.passed&&row.category===fixed.category&&row.testKind===fixed.testKind&&row.coverage?.passed&&
        row.coverage.role===fixed.role&&row.protection?.part===proof.hits[side]?.part&&row.protection?.role===fixed.role&&
        Number.isFinite(row.protection?.distance)&&Math.abs(row.protection.distance-proof.hits[side].distance)<1e-5);
      if(!proof.passed||!reported)throw new Error('Neověřená pevná výplň: '+door.id);
      excluded.push({id:door.id,category:fixed.exclusionCategory,protectionVerified:true,role:fixed.role});
      continue;
    }
    for (let side=0;side<2;side++) {
      const point=sides[side],id=doorNode(door.id,side);
      if (!finitePoint(point)) {
        if (point?.floor!==null) throw new Error('Neplatná výška dveřního bodu: '+id);
        excluded.push({id,doorId:door.id,category:door.accessConfirmed===true?'external-pending-terrain':'unclassified-missing-support'});
      } else nodes.push({id,point,target:true,doorId:door.id,classification:door.accessConfirmed===true?'documented-exterior-door':'interior-door-point'});
    }
    for (const row of rows) {
      const path=[row.start,row.target],run={...row,legs:row.leg?[row.leg]:[]};
      if (row.category==='passed'&&successfulRun(run,path,scene.settings)) links.push({from:doorNode(door.id,row.direction),to:doorNode(door.id,1-row.direction),path,source:'verified-door'});
      else sourceFailures.push({kind:'door',id:door.id,direction:row.direction,category:row.category});
    }
  }
  if (doorRows.size!==doorIds.size*2) throw new Error('Report obsahuje cizí dveře');
  const groups=new Map(),routeRows=new Map();
  for (const flight of scene.model.stairs??[]) {
    const id=flight.routeId??flight.id;
    if (!groups.has(id)) groups.set(id,[]);
    groups.get(id).push(flight);
  }
  for (const row of routeReport.results) {
    const key=`${row.id}:${row.direction}`;
    if (!row.id||!['up','down'].includes(row.direction)||routeRows.has(key)) throw new Error('Neplatný nebo duplicitní schodišťový výsledek');
    routeRows.set(key,row);
  }
  for (const [id,flights] of groups) {
    flights.sort((a,b)=>(a.routeIndex??0)-(b.routeIndex??0));
    if (flights.some((f,i)=>f.routeId&&(f.routeIndex!==i||f.routeSegmentCount!==flights.length))) throw new Error('Neúplná schodišťová anotace: '+id);
    const forward=routePath(scene,flights,routeReport.accessOverrides?.[id]??flights[0].routeAccessPath??{});
    if (!finitePoint(forward[0])||!finitePoint(forward.at(-1))) throw new Error('Schody nemají konečnou nástupní výšku');
    nodes.push({id:routeNode(id,0),point:forward[0],target:false},{id:routeNode(id,1),point:forward.at(-1),target:false});
    const completed=[];
    for (const direction of ['up','down']) {
      const row=routeRows.get(`${id}:${direction}`),path=direction==='up'?forward:[...forward].reverse();
      if (!row||!Array.isArray(row.path)||row.path.length!==path.length||row.path.some((p,i)=>!samePoint(p,path[i]))) throw new Error('Schodišťový report neodpovídá modelu: '+id);
      if (successfulRun(row,path,scene.settings)) completed.push(direction);
      else sourceFailures.push({kind:'stair',id,direction});
    }
    if(completed.length) {
      // A complete successful run also proves arrival at its intermediate
      // landings. Expose those branch points without inventing another entry.
      // Null-height portal waypoints remain inside their original route edge.
      const indices=forward.map((point,index)=>finitePoint(point)?index:null).filter(index=>index!==null);
      const waypointId=index=>index===0?routeNode(id,0):index===forward.length-1?routeNode(id,1):`route:${id}:waypoint:${index}`;
      for(const index of indices.slice(1,-1))nodes.push({id:waypointId(index),point:forward[index],target:false});
      for(const direction of completed) {
        const ordered=direction==='up'?indices:[...indices].reverse();
        for(let i=1;i<ordered.length;i++) {
          const from=ordered[i-1],to=ordered[i];
          const path=forward.slice(Math.min(from,to),Math.max(from,to)+1);
          if(direction==='down')path.reverse();
          links.push({from:waypointId(from),to:waypointId(to),path,source:'verified-stair'});
        }
      }
    }
  }
  if (routeRows.size!==groups.size*2) throw new Error('Report obsahuje cizí schodiště');
  return {nodes,links,excluded,sourceFailures};
}

const DEFAULTS={spacing:.75,connectorRadius:1.6,levelTolerance:.035,maxNodes:30000,maxCandidates:100000,maxSweeps:150000,maxMoves:40000};
function optionsFor(options) {
  const value={...DEFAULTS,...options};
  for (const key of Object.keys(DEFAULTS)) if (!Number.isFinite(value[key])||value[key]<=0) throw new Error('Neplatná mez probe: '+key);
  if (value.spacing<.15||value.spacing>2||value.connectorRadius<value.spacing||value.connectorRadius>4||value.levelTolerance>.05) throw new Error('Nevhodné rozlišení probe');
  for (const key of ['maxNodes','maxCandidates','maxSweeps','maxMoves']) if (!Number.isSafeInteger(value[key])) throw new Error('Rozpočet musí být celé číslo');
  return value;
}

// Mřížka je jen optimistický plán. Všechny body a hrany přijaté jako dosažitelné
// později navštíví jedna nepřerušovaná postava od výslovného vstupu.
export function probeAccessibility(scene,evidence,seeds,options={}) {
  const config=optionsFor(options),anchors=new Map(),levels=[];
  if (!Array.isArray(seeds)||!seeds.length||new Set(seeds).size!==seeds.length) throw new Error('Je nutný neprázdný seznam různých vstupních bodů');
  const stats={candidatePoints:0,acceptedPoints:0,sweeps:0,moves:0,restarts:0,plannerLimited:false,proofLimited:false};
  const pose={x:0,y:0,z:0,w:1},capsule=new scene.R.Capsule(scene.settings.halfHeight,scene.settings.radius);
  const offset=scene.settings.radius+scene.settings.halfHeight+scene.settings.offset;
  const position=p=>({x:p.x,y:footHeight(p)+offset,z:p.z});
  function levelFor(height) {
    let index=levels.findIndex(v=>Math.abs(v-height)<=config.levelTolerance);
    if(index<0){index=levels.length;levels.push(height);}return index;
  }
  for (const anchor of evidence.nodes) {
    if (!anchor.id||anchors.has(anchor.id)||!finitePoint(anchor.point)) throw new Error('Neplatný nebo opakovaný bod');
    anchors.set(anchor.id,{...anchor,level:levelFor(anchor.point.floor)});
  }
  if (seeds.some(id=>!anchors.has(id))) throw new Error('Vstupní ID není doložený dveřní/schodišťový bod');
  const linkMap=new Map();
  for (const link of evidence.links) {
    const a=anchors.get(link.from),b=anchors.get(link.to);
    if (!a||!b||!Array.isArray(link.path)||link.path.length<2||!samePoint(link.path[0],a.point)||!samePoint(link.path.at(-1),b.point)) throw new Error('Nekonzistentní doložený portál');
    if(!linkMap.has(link.from))linkMap.set(link.from,[]);linkMap.get(link.from).push(link);
  }
  const targets=[...anchors.values()].filter(a=>a.target),bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(const part of scene.model.parts) if(['slab','stair','stair-landing'].includes(part.role)) for(let i=0;i<part.positions.length;i+=3) {
    bounds[0]=Math.min(bounds[0],part.positions[i]);bounds[1]=Math.min(bounds[1],part.positions[i+2]);
    bounds[2]=Math.max(bounds[2],part.positions[i]);bounds[3]=Math.max(bounds[3],part.positions[i+2]);
  }
  if(!bounds.every(Number.isFinite))throw new Error('Model nemá podpůrnou konstrukci');
  const candidates=new Map(),edgeCache=new Map();
  function candidate(id,x,z,reference,level,anchor=null) {
    if(candidates.has(id))return candidates.get(id);
    if(stats.candidatePoints>=config.maxCandidates||stats.acceptedPoints>=config.maxNodes){stats.plannerLimited=true;return null;}
    stats.candidatePoints++;
    let node=null;
    if(x>=bounds[0]&&z>=bounds[1]&&x<=bounds[2]&&z<=bounds[3]) {
      const support=scene.floorAt({x,z},reference);
      if(support&&Math.abs(support.height-reference)<=config.levelTolerance) {
        const point={x,z,floor:support.height,support};let blocked=false;
        scene.world.intersectionsWithShape(position(point),pose,capsule,()=>{blocked=true;return false;});
        if(!blocked){node={id,point,level,anchor};stats.acceptedPoints++;}
      }
    }
    candidates.set(id,node);return node;
  }
  const anchorAt=id=>{const a=anchors.get(id);return candidate(id,a.point.x,a.point.z,a.point.floor,a.level,a);};
  const gridAt=(level,ix,iz)=>candidate(`grid:${level}:${ix}:${iz}`,ix*config.spacing,iz*config.spacing,levels[level],level);
  const nearbyAnchors=(node)=>[...anchors.values()].filter(a=>a.level===node.level&&Math.hypot(a.point.x-node.point.x,a.point.z-node.point.z)<=config.connectorRadius);
  function planningEdge(a,b) {
    const key=[a.id,b.id].sort().join('|');if(edgeCache.has(key))return edgeCache.get(key);
    if(stats.sweeps>=config.maxSweeps){stats.plannerLimited=true;return false;}stats.sweeps++;
    const p=position(a.point),q=position(b.point),velocity={x:q.x-p.x,y:q.y-p.y,z:q.z-p.z};
    const distance=Math.hypot(velocity.x,velocity.z);
    let clear=Math.abs(a.point.floor-b.point.floor)<=config.levelTolerance;
    if(clear&&distance>1e-8) {
      const hit=scene.world.castShape(p,pose,velocity,capsule,Math.max(0,scene.settings.offset-.003),1,true);
      if(hit&&hit.time_of_impact<1-1e-6)clear=false;
      const samples=Math.ceil(distance/.15);
      for(let i=1;clear&&i<samples;i++) {
        const t=i/samples,reference=a.point.floor+(b.point.floor-a.point.floor)*t;
        const support=scene.floorAt({x:p.x+velocity.x*t,z:p.z+velocity.z*t},reference);
        if(!support||Math.abs(support.height-reference)>config.levelTolerance)clear=false;
      }
    }
    edgeCache.set(key,clear);return clear;
  }
  const parents=new Map(),nodes=new Map(),queue=[],seedFailures=[];
  for(const id of seeds) {
    const node=anchorAt(id);
    if(!node){seedFailures.push({id,category:'invalid-entry-anchor'});continue;}
    nodes.set(id,node);parents.set(id,null);queue.push(id);
  }
  function visit(from,to,waypoints,source) {
    if(!to||parents.has(to.id))return;
    nodes.set(to.id,to);parents.set(to.id,{from:from.id,to:to.id,waypoints,source});queue.push(to.id);
  }
  for(let cursor=0;cursor<queue.length;cursor++) {
    const node=nodes.get(queue[cursor]);
    for(const link of linkMap.get(node.id)??[])visit(node,anchorAt(link.to),link.path.slice(1),link.source);
    for(const a of nearbyAnchors(node)) {
      if(a.id===node.id||parents.has(a.id))continue;
      const target=anchorAt(a.id);if(target&&planningEdge(node,target))visit(node,target,[target.point],'capsule-grid-connector');
    }
    const ix=Math.round(node.point.x/config.spacing),iz=Math.round(node.point.z/config.spacing);
    const reach=node.anchor?Math.ceil(config.connectorRadius/config.spacing):1;
    for(let dx=-reach;dx<=reach;dx++)for(let dz=-reach;dz<=reach;dz++) {
      if(!node.anchor&&dx===0&&dz===0)continue;
      const id=`grid:${node.level}:${ix+dx}:${iz+dz}`;if(parents.has(id))continue;
      const x=(ix+dx)*config.spacing,z=(iz+dz)*config.spacing;
      if(node.anchor&&Math.hypot(x-node.point.x,z-node.point.z)>config.connectorRadius)continue;
      const target=gridAt(node.level,ix+dx,iz+dz);
      if(target&&planningEdge(node,target))visit(node,target,[target.point],'capsule-grid');
    }
  }
  // Prune to the paths of requested door points. DFS reuses one actual walker,
  // so a long shared corridor is not replayed once for every room.
  const needed=new Set(seeds.filter(id=>parents.has(id))),children=new Map();
  for(const target of targets) {
    let id=target.id;
    if(!parents.has(id))continue;
    while(id&&!needed.has(id)){needed.add(id);id=parents.get(id)?.from;}
  }
  for(const id of needed) {
    const edge=parents.get(id);if(!edge)continue;
    if(!children.has(edge.from))children.set(edge.from,[]);children.get(edge.from).push(id);
  }
  const reached=new Map(),failures=[],proofSessions=[];let walker=null,session=0;
  const targetIds=new Set(targets.map(t=>t.id));
  function closeWalker(){if(walker){walker.dispose();walker=null;}}
  function mark(id,seed,proof) {if(targetIds.has(id)&&!reached.has(id))reached.set(id,{seed,session,afterStep:proofSessions.at(-1).steps.length,...proof});}
  function move(waypoints,context) {
    const legs=[];
    function record(result) {proofSessions.at(-1).steps.push({...result,context});return result;}
    for(const point of waypoints) {
      if(stats.moves>=config.maxMoves){stats.proofLimited=true;return record({passed:false,reason:'move-budget',legs});}
      stats.moves++;const leg=walker.moveTo(point);
      legs.push({target:point,passed:leg.passed,finish:leg.finish,remaining:leg.remaining,footError:leg.footError});
      if(!leg.passed)return record({passed:false,reason:'continuous-capsule-blocked',context,legs});
    }
    return record({passed:true,legs});
  }
  function restart(seed,target=seed) {
    closeWalker();session++;stats.restarts++;
    walker=scene.walker(nodes.get(seed).point);const setup=walker.settle();
    proofSessions.push({session,seed,start:nodes.get(seed).point,setup,steps:[]});
    if(!setup.setupValid){failures.push({seed,target,reason:'entry-settle-failed',setup});return false;}
    const chain=[];let id=target;
    while(id!==seed){const edge=parents.get(id);if(!edge)throw new Error('Strom ztratil vlastní vstup');chain.push(edge);id=edge.from;}
    for(const edge of chain.reverse()) {
      const result=move(edge.waypoints,{from:edge.from,to:edge.to,recovery:true});
      if(!result.passed){failures.push(result);return false;}
    }
    return true;
  }
  try {
    for(const seed of seeds.filter(id=>parents.has(id)&&!parents.get(id))) {
      if(stats.proofLimited||!restart(seed))continue;
      mark(seed,seed,{kind:'entry-settle'});
      const stack=[{id:seed,cursor:0}];
      while(stack.length&&!stats.proofLimited) {
        const frame=stack.at(-1),next=(children.get(frame.id)??[])[frame.cursor++];
        if(next) {
          const edge=parents.get(next),result=move(edge.waypoints,{from:edge.from,to:edge.to});
          if(result.passed){mark(next,seed,{kind:'continuous-from-entry',lastLeg:result.legs.at(-1)});stack.push({id:next,cursor:0});}
          else {failures.push(result);if(!restart(seed,frame.id))break;}
        } else {
          stack.pop();if(!stack.length)break;
          const edge=parents.get(frame.id),reverse=[nodes.get(edge.from).point,...edge.waypoints].reverse().slice(1);
          const result=move(reverse,{from:frame.id,to:edge.from,return:true});
          if(!result.passed){failures.push(result);if(!restart(seed,edge.from))break;}
        }
      }
      closeWalker();
    }
  } finally {closeWalker();}
  const results=targets.map(target=>({id:target.id,doorId:target.doorId,classification:target.classification,point:target.point,
    category:reached.has(target.id)?'reachable':parents.has(target.id)?'candidate-path-not-verified':candidates.has(target.id)&&!candidates.get(target.id)?'invalid-door-anchor':'not-reached-in-grid',
    passed:reached.has(target.id),proof:reached.get(target.id)??null}));
  const excluded=evidence.excluded??[];
  const pending=excluded.filter(row=>!['fixed-facade-glazing','fixed-paired-door-leaf'].includes(row.category)||!row.protectionVerified);
  return {scope:'Souvislá dosažitelnost dveřních bodů od výslovně zadaných vstupů; samostatná CPU kapsle, bez hry a venkovního terénu',
    status:results.length>0&&results.every(row=>row.passed)&&!pending.length&&!seedFailures.length?'pass':'partial',
    options:config,seeds,cases:results.length,passed:reached.size,results,excluded,seedFailures,failures,stats,proofSessions,
    sourceFailures:evidence.sourceFailures??[],
    limits:['Nejde o počet ani pokrytí všech místností.',
      'Nenalezená cesta při konečném rozlišení není důkaz neexistence cesty; vyžaduje jemnější probe nebo posouzení konkrétního bodu.',
      'Mřížka a sweep jsou pouze plán. PASS vyžaduje souvislé kroky skutečného controlleru od uvedeného vstupu.',
      'Přístup k externím dveřím přes chybějící terén není ověřen.']};
}

export async function verifyAccessibility(args) {
  const allowed=new Set(['--model','--output','--dependency-root','--actor-source','--profile','--speed','--door-report','--route-report','--seeds','--spacing','--max-nodes','--max-candidates','--max-sweeps','--max-moves']);
  for(const key of args.keys())if(!allowed.has(key))throw new Error('Neznámý argument '+key);
  const {scene,metadata}=await openModel(args);
  try {
    const read=key=>{const bytes=readFileSync(resolve(required(args,key)));return {value:JSON.parse(bytes),sha256:sha256(bytes)};};
    const doors=read('--door-report'),routes=read('--route-report'),seedInput=read('--seeds');
    const evidence=prepareEvidence(scene,metadata,doors.value,routes.value),options={};
    for(const [flag,name] of [['--spacing','spacing'],['--max-nodes','maxNodes'],['--max-candidates','maxCandidates'],['--max-sweeps','maxSweeps'],['--max-moves','maxMoves']])if(args.has(flag))options[name]=Number(args.get(flag));
    const report=probeAccessibility(scene,evidence,seedInput.value,options);
    return {...metadata,...report,inputSha256:{doors:doors.sha256,routes:routes.sha256,seeds:seedInput.sha256,
      validator:sha256(readFileSync(fileURLToPath(import.meta.url))),rapierHelper:sha256(readFileSync(new URL('./rapier_model.mjs',import.meta.url)))}};
  } finally {scene.free();}
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const args=argumentsMap(),output=required(args,'--output');
  verifyAccessibility(args).then(report=>{writeReport(output,report);console.log(JSON.stringify({status:report.status,cases:report.cases,passed:report.passed,stats:report.stats,excluded:report.excluded}));process.exitCode=report.status==='pass'?0:2;})
    .catch(error=>{console.error(error);process.exitCode=1;});
}
