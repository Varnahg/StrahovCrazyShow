// Diagnostika skutečných dveřních průchodů; chybějící venkovní terén není PASS.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { argumentsMap, required, openModel, sha256, writeReport, doorApproachGeometry, fixedOpeningSpec, createDoorInteractionProbe } from './rapier_model.mjs';

export function fixedOpeningHit(scene,start,target,height,role) {
  if(!['facade-glass','fixed-door-leaf'].includes(role))throw new Error('Neplatná role pevné výplně');
  const dx=target.x-start.x,dz=target.z-start.z,distance=Math.hypot(dx,dz);
  if(!Number.isFinite(height)||!(distance>0))throw new Error('Neplatná zkouška pevné výplně');
  const hit=scene.world.castRayAndGetNormal(new scene.R.Ray({x:start.x,y:height,z:start.z},
    {x:dx/distance,y:0,z:dz/distance}),distance,false,undefined,undefined,undefined,undefined,
    collider=>scene.parts.get(collider.handle)?.role===role);
  return hit?{part:scene.parts.get(hit.collider.handle).id,role,distance:hit.timeOfImpact}:null;
}
export const fixedGlazingHit=(scene,start,target,height)=>fixedOpeningHit(scene,start,target,height,'facade-glass');

function clippedPolygon(points,bounds) {
  let polygon=points;
  for(const [axis,limit,sign] of [[0,bounds[0],1],[0,bounds[2],-1],[1,bounds[1],1],[1,bounds[3],-1]]) {
    const output=[];
    for(let i=0;i<polygon.length;i++) {
      const a=polygon[i],b=polygon[(i+1)%polygon.length],da=(a[axis]-limit)*sign,db=(b[axis]-limit)*sign;
      if(da>=0)output.push(a);
      if((da<0&&db>0)||(da>0&&db<0)) {
        const t=da/(da-db);output.push(a.map((value,j)=>value+(b[j]-value)*t));
      }
    }
    polygon=output;
  }
  return polygon;
}

function coveredArea(polygons) {
  const edges=polygons.flatMap(polygon=>polygon.map((a,i)=>[a,polygon[(i+1)%polygon.length]]));
  const cuts=edges.flatMap(([a])=>[a[1]]);
  // Between vertices AND edge intersections all interval endpoints are linear
  // with fixed ordering. Midpoint integration therefore gives the exact union
  // area, including overlapping front/back faces, holes and edited fragments.
  for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++) {
    const [a,b]=edges[i],[c,d]=edges[j],u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]];
    const cross=(p,q)=>p[0]*q[1]-p[1]*q[0],den=cross(u,v);
    if(Math.abs(den)<1e-12)continue;
    const delta=[c[0]-a[0],c[1]-a[1]],t=cross(delta,v)/den,s=cross(delta,u)/den;
    if(t>0&&t<1&&s>0&&s<1)cuts.push(a[1]+t*u[1]);
  }
  const levels=cuts.sort((a,b)=>a-b).filter((value,i,values)=>!i||value-values[i-1]>1e-9);
  let area=0;
  for(let i=1;i<levels.length;i++) {
    const y=(levels[i-1]+levels[i])/2,intervals=[];
    for(const polygon of polygons) {
      const xs=[];
      for(let k=0;k<polygon.length;k++) {
        const a=polygon[k],b=polygon[(k+1)%polygon.length];
        if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]));
      }
      if(xs.length>=2)intervals.push([Math.min(...xs),Math.max(...xs)]);
    }
    intervals.sort((a,b)=>a[0]-b[0]);let width=0,end=-Infinity;
    for(const [a,b] of intervals){width+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}
    area+=width*(levels[i]-levels[i-1]);
  }
  return area;
}

export function fixedOpeningCoverage(scene,door,spec=fixedOpeningSpec(door)) {
  if(!spec||!['facade-glass','fixed-door-leaf'].includes(spec.role))throw new Error('Chybí klasifikace pevné výplně');
  const dx=door.closedEnd[0]-door.hinge[0],dy=door.closedEnd[1]-door.hinge[1],width=Math.hypot(dx,dy);
  const bounds=[.055,door.bottom+.055,width-.055,door.top-.055];
  if(![...bounds,width,door.normalOffset??0].every(Number.isFinite)||!(bounds[2]>bounds[0]&&bounds[3]>bounds[1]))throw new Error('Neplatný rozsah pevné výplně');
  const normal=[-dy/width,dx/width],base=scene.local(door.hinge.map((value,i)=>value+normal[i]*(door.normalOffset??0)));
  const tangent={x:-dy/width,z:-dx/width},polygons=[];
  for(const part of scene.model.parts??[]) {
    if(part.role!==spec.role||part.floor!==door.floor)continue;
    for(let i=0;i<part.indices.length;i+=3) {
      const triangle=[];let inPlane=true;
      for(const index of part.indices.slice(i,i+3)) {
        const x=part.positions[index*3]-base.x,y=part.positions[index*3+1],z=part.positions[index*3+2]-base.z;
        if(Math.abs(-tangent.z*x+tangent.x*z)>.02)inPlane=false;
        triangle.push([tangent.x*x+tangent.z*z,y]);
      }
      if(inPlane) {
        const polygon=clippedPolygon(triangle,bounds);
        if(polygon.length>=3)polygons.push(polygon);
      }
    }
  }
  const expectedArea=(bounds[2]-bounds[0])*(bounds[3]-bounds[1]),actualArea=coveredArea(polygons);
  const missingArea=Math.max(0,expectedArea-actualArea);
  return {passed:missingArea<=Math.max(1e-6,expectedArea*1e-6),expectedArea,coveredArea:actualArea,missingArea,
    role:spec.role,frameMargin:.055,planeTolerance:.02,scope:'Pokrytí plochy otvoru skutečnými kolizními trojúhelníky odpovídající pevné výplně v ostění'};
}
export const fixedGlazingCoverage=(scene,door)=>fixedOpeningCoverage(scene,door,{role:'facade-glass'});

export function fixedOpeningProtection(scene,door) {
  const spec=fixedOpeningSpec(door);if(!spec)throw new Error('Otvor není pevná výplň');
  const {points}=doorApproachGeometry(scene,door),coverage=fixedOpeningCoverage(scene,door,spec);
  const hits=[0,1].map(side=>fixedOpeningHit(scene,points[side],points[1-side],(door.bottom+door.top)/2,spec.role));
  return {...spec,coverage,hits,passed:coverage.passed&&hits.every(Boolean)};
}

/** Independent closed/open cases start at the same measured approach. Within
 * each case one capsule moves continuously; no reset across a blocked portal. */
export function interactiveDoorPassage(scene,door,start,target) {
  const definition=[...scene.doorPhysics.definitions.values()].find(item=>item.definition.sourceDoorId===door.id);
  if(!definition)throw new Error('No interactive definition for '+door.id);
  const id=definition.id,physics=scene.doorPhysics;
  for(const entry of physics.definitions.values())if(physics.isOpen(entry.id))throw new Error('Door cases require closed-default state');
  const run=operation=>{const walker=scene.walker(start);try{return operation(walker,walker.settle());}finally{walker.dispose();}};
  const closed=run((walker,setup)=>{
    const leg=setup.setupValid?walker.moveTo(target):null;
    return {...setup,leg,blocked:!!leg&&!leg.passed&&leg.contacts.some(contact=>contact.part===id)};
  });
  const interaction=run((walker,setup)=>{
    if(!setup.setupValid)return {setup,verified:false};
    const probe=createDoorInteractionProbe(physics,scene.settings);
    try {const event=probe.request(walker,id,true);return {setup,event,verified:event.result.status==='changed'};}
    finally {probe.dispose();}
  });
  physics.apply(id,false);
  const stateAssumption={mode:'single-interactive-open',doorId:id,actorInteractionsVerified:false,
    states:[...physics.definitions.keys()].map(key=>({id:key,open:key===id})),purpose:'conditional-geometric-passage'};
  let opened;
  try {
    physics.apply(id,true);
    opened=run((walker,setup)=>{
      if(!setup.setupValid)return {...setup,passed:false};
      const center={x:(start.x+target.x)/2,z:(start.z+target.z)/2};
      const support=scene.floorAt(center,door.bottom),middle={...center,floor:support?.height??null,support};
      const toPortal=walker.moveTo(middle);
      const occupied=toPortal.passed?physics.guardChange(id,false,[{id:walker.id,current:walker.position,next:walker.body.nextTranslation(),
        radius:scene.settings.radius,halfHeight:scene.settings.halfHeight,skin:scene.settings.offset}]):null;
      const leg=toPortal.passed?walker.moveTo(target):toPortal;
      return {...setup,toPortal,closeOccupiedGuard:occupied,leg,
        passed:leg.passed&&occupied?.allowed===false&&occupied.reason==='occupied'};
    });
  } finally {physics.apply(id,false);}
  return {...opened,closedBlocking:closed,interactionAttempt:interaction,doorPhysicsId:id,stateAssumption,
    testKind:'interactive-door-closed-open-guard',passed:closed.blocked&&opened.passed===true,
    interactionVerified:interaction.verified};
}

export async function verifyDoors(args) {
  const allowed=new Set(['--model','--output','--dependency-root','--actor-source','--profile','--speed','--recipe','--door']);
  for(const key of args.keys())if(!allowed.has(key))throw new Error('Neznámý argument '+key);
  const {scene,metadata}=await openModel(args);
  const results=[];let doorSourceMode='native-model-annotations',doorSourceSha256=metadata.modelCollisionSha256;
  try {
    let doors=scene.model.doors;
    if(!doors) {
      const bytes=readFileSync(resolve(required(args,'--recipe'))),recipe=JSON.parse(bytes);
      if(recipe.buildingId!==scene.model.id||JSON.stringify(recipe.cadOrigin)!==JSON.stringify(scene.model.cadOrigin))throw new Error('Receptura patří jinému modelu');
      doors=recipe.floors.flatMap(floor=>(floor.doors??[]).map(door=>({...door,floor:floor.id})));
      doorSourceMode='private-derived-recipe';doorSourceSha256=sha256(bytes);
    }
    if(args.has('--door'))doors=doors.filter(door=>door.id.includes(args.get('--door')));
    if(!doors.length)throw new Error('Žádné vybrané dveře');
    for(const door of doors) {
      const {width,points}=doorApproachGeometry(scene,door);
      const sides=points.map(point=>{
        const support=scene.floorAt(point,door.bottom);
        return {...point,floor:support?.height??null,support};
      });
      const fixed=fixedOpeningSpec(door),proof=fixed?fixedOpeningProtection(scene,door):null;
      for(const direction of [0,1]) {
        const start=sides[direction],target=sides[1-direction];
        const row={id:door.id,floor:door.floor,direction,width,openingBottom:door.bottom,start,target};
        if(fixed) {
          const protection=proof.hits[direction],coverage=proof.coverage;
          const passed=!!protection&&coverage.passed;
          results.push({...row,testKind:fixed.testKind,protection,coverage,
            category:passed?fixed.category:fixed.missingCategory,passed});continue;
        }
        if(start.floor===null||target.floor===null) {
          results.push({...row,category:'missing-model-floor',setupValid:false,passed:false});continue;
        }
        if([...scene.doorPhysics.definitions.values()].some(item=>item.definition.sourceDoorId===door.id)) {
          const proof=interactiveDoorPassage(scene,door,start,target);
          results.push({...row,...proof,category:proof.passed?'passed':!proof.setupValid?'invalid-start':'blocked'});continue;
        }
        const walker=scene.walker(start);
        try {
          const setup=walker.settle();
          if(!setup.setupValid) {
            results.push({...row,...setup,category:'invalid-start',passed:false});continue;
          }
          const leg=walker.moveTo(target);
          results.push({...row,...setup,leg,category:leg.passed?'passed':'blocked',passed:leg.passed});
        } finally { walker.dispose(); }
      }
    }
  } finally { scene.free(); }
  const categories={};for(const row of results)categories[row.category]=(categories[row.category]??0)+1;
  const interactions=results.filter(row=>row.testKind==='interactive-door-closed-open-guard');
  return {scope:'Přímé průchody měřenými dveřmi; neplatný start vyžaduje posouzení skutečné přístupové trasy',...metadata,
    interactiveCases:interactions.length,interactionVerified:interactions.filter(row=>row.interactionVerified).length,
    interactionStatus:interactions.every(row=>row.interactionVerified)?'pass':'partial',
    coverageQualification:interactions.length?'Conditional single-door-open geometry; independent current-position interaction attempts are reported separately':'static-native-geometry',
    doorSourceMode,doorSourceSha256,cases:results.length,passed:categories.passed??0,categories,
    protectedGlazing:categories['fixed-glazing']??0,
    protectedDoorLeaves:categories['fixed-door-leaf']??0,
    status:categories.blocked||categories['missing-glazing']||categories['missing-fixed-door-leaf']?'issues':categories['invalid-start']||categories['missing-model-floor']||interactions.some(row=>!row.interactionVerified)?'partial':'pass',results};
}

if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])) {
  const args=argumentsMap(),output=required(args,'--output');
  verifyDoors(args).then(report=>{
    writeReport(output,report);
    console.log(JSON.stringify({cases:report.cases,passed:report.passed,categories:report.categories,status:report.status,
      blocked:report.results.filter(r=>r.category==='blocked').map(r=>({id:r.id,direction:r.direction,width:r.width,
        remaining:r.leg.remaining,footError:r.leg.footError,contacts:[...new Set(r.leg.contacts.map(c=>c.part))]}))}));
    process.exitCode=report.status==='pass'?0:report.status==='partial'?2:1;
  }).catch(error=>{console.error(error);process.exitCode=1;});
}
