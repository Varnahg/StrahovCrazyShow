// Run with tsx: the movement implementation is the ACTUAL production Actor.
import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import RAPIER from '@dimforge/rapier3d-compat';
import {Actor,Simulation,initPhysics,CHARACTER_RADIUS,CHARACTER_HALF_HEIGHT} from '../../shared/simulation.ts';
import {CAD_BUILDINGS} from '../../shared/cad-buildings.ts';
import {cadLocalToWorld,transformCadPositions} from '../../shared/cad-building-geometry.ts';
import {FIXED_DT} from '../../shared/netcode.ts';
import {argumentsMap,required,sha256,writeReport,profileSettings,doorApproachGeometry,fixedOpeningSpec,makeScene} from './rapier_model.mjs';
import {fixedOpeningCoverage} from './verify_doors.mjs';
import {supportAt,assertLiveController,forbidRecovery,walkActorLeg,sourceManifest} from './verify_world_paths.ts';

const need=(condition,message)=>{if(!condition)throw new Error(message);};
const finitePoint=p=>p&&Array.isArray(p.cad)&&p.cad.length===2&&[...p.cad,p.height].every(Number.isFinite);
const samePoint=(a,b)=>Math.hypot(a.cad[0]-b.cad[0],a.cad[1]-b.cad[1])<1e-6&&Math.abs(a.height-b.height)<1e-6;

/** Candidate tours must be embedded in this hash-identified native model.
 * External route coordinates, support overrides and alternative capsules are
 * not accepted. A room proof starts at a real door, not an arbitrary interior. */
export function validateRoomTours(building,identity,roomFilter) {
  const {model}=building,settings=identity.settings;
  need(identity.profile==='current','Room proof requires the current Actor profile');
  const current=profileSettings('current');
  need(Object.keys(current).every(k=>settings?.[k]===current[k]),'Room controller settings mismatch');
  need(model.id===building.id&&model.glbSha256===identity.modelGlbSha256&&
    building.site.sourceCollisionSha256===identity.modelCollisionSha256,'Native room identity mismatch');
  need(Array.isArray(model.roomWalkPaths)&&model.roomWalkPaths.length>0,'Native model has no roomWalkPaths');
  need(Array.isArray(model.doors)&&Array.isArray(model.parts),'Native model lacks door/collision annotations');
  const local=([x,y])=>({x:-(y-model.cadOrigin[1]),z:-(x-model.cadOrigin[0])});
  const doors=new Map(model.doors.map(door=>[door.id,door]));
  need(doors.size===model.doors.length,'Duplicate native door ID');
  for(const door of model.doors)if(fixedOpeningSpec(door)) {
    need(fixedOpeningCoverage({local,model},door).passed,'Native fixed opening is not physically protected: '+door.id);
  }
  const ids=new Set(),rooms=[];
  for(const source of model.roomWalkPaths) {
    const id=source.floor+':'+source.roomId;
    need(typeof source.floor==='string'&&typeof source.roomId==='string'&&!ids.has(id),'Invalid/duplicate native room ID');ids.add(id);
    need(['bedroom','bathroom','wc'].includes(source.usage)&&typeof source.usageBasis==='string'&&source.usageBasis.trim(),'Unclassified room tour');
    need(source.walkPathStatus==='candidate-only'&&source.requiresActualController===true,'Room tour lacks truthful candidate status');
    need(source.walkPathRadius>=settings.radius+settings.offset&&Number.isFinite(source.walkPathRadius),'Room candidate radius is smaller than the actual capsule');
    const path=source.walkPath;
    need(Array.isArray(path)&&path.length>=2&&path.every(finitePoint),'Invalid or empty room tour');
    need(samePoint(path[0],path.at(-1)),'Room tour omits the physical return to its entry');
    need(path.every(p=>p.support===undefined),'Candidate support overrides are forbidden');
    const door=doors.get(path[0].sourceDoorId);
    need(door&&door.floor===source.floor&&!fixedOpeningSpec(door)&&source.doorIds?.includes(door.id),'Room start is not its native open door');
    need(path.every(p=>Math.abs(p.height-door.bottom)<=.25&&Math.hypot(p.cad[0]-path[0].cad[0],p.cad[1]-path[0].cad[1])<=20),
      'Room tour leaves its bounded native door/storey envelope');
    const approaches=doorApproachGeometry({local,settings},door).points;
    const ranked=approaches.map(p=>({...p,distance:Math.hypot(p.cad[0]-path[0].cad[0],p.cad[1]-path[0].cad[1])})).sort((a,b)=>a.distance-b.distance);
    // Furnishing candidates used CAD midpoints. Preserve the small measured
    // jamb normalOffset by starting at the canonical approach and walking the
    // offset to the first candidate; never teleport over this prefix.
    need(ranked[0].distance<=.15,'Room start differs from its native door approach');
    const extra=source.walkExtraTargets??[],unresolved=source.walkPathUnresolved??[];
    need(Array.isArray(extra)&&extra.every(p=>finitePoint(p)&&typeof p.reason==='string'&&p.reason.trim()),'Invalid extra room targets');
    need(Array.isArray(unresolved),'Invalid unresolved candidate list');
    rooms.push({id,source,door,start:{...ranked[0],floor:door.bottom},path:path.map(p=>({...p,...local(p.cad),floor:p.height})),extra,unresolved});
  }
  const selected=roomFilter?rooms.filter(room=>room.id===roomFilter):rooms;
  need(selected.length>0,'Selected room does not exist in native tours');
  return {context:{building,identity},rooms:selected,expectedRooms:rooms.length,
    unselectedRooms:rooms.filter(r=>!selected.includes(r)).map(r=>r.id),allExtraTargets:rooms.flatMap(r=>r.extra.map(p=>({roomId:r.id,...p})))};
}

/** Only native candidate collision geometry is installed. Movement remains
 * the production Actor and its current KCC. No terrain/traffic/world claim is
 * made: this adapter exists so a not-yet-published export can be accepted. */
export function createNativeActorRuntime(building,settings) {
  const model={...building.model,parts:building.model.parts.map(part=>({...part,
    positions:Array.from(transformCadPositions(part.positions,building.placement))}))};
  const scene=makeScene(RAPIER,model,settings),actors=new Map();
  let disposed=false;
  const runtime={world:scene.world,actors,walkingColliders:new Set(),groundColliders:new Set(),
    add(id,position){need(!disposed&&!actors.has(id),'Invalid native Actor lifecycle');const actor=new Actor(runtime,id,position);actors.set(id,actor);return actor;},
    remove(id){Simulation.prototype.remove.call(runtime,id);},
    tick(){need(!disposed,'Native scene is disposed');scene.world.step();},
    partForCollider(handle){const p=scene.parts.get(handle);return p?{id:p.id,floor:p.floor,role:p.role}:null;},
    dispose(){if(disposed)return;for(const id of [...actors.keys()])runtime.remove(id);disposed=true;scene.free();},
  };
  return runtime;
}

export function replayRoomTours(validated,createRuntime) {
  const {building,identity}=validated.context,settings=identity.settings;
  const capsule=new RAPIER.Capsule(settings.halfHeight,settings.radius),footOffset=settings.radius+settings.halfHeight+settings.offset;
  const sim=createRuntime(),results=[];let active;
  const idle={x:0,z:0,yaw:0,jump:false,seq:0};
  const support=(point,reference)=>supportAt(sim,point,reference,validated,capsule);
  const supportError=(point,value)=>!value?'No actual native support':
    Math.abs(value.height-building.placement.translation.y-point.floor)>.15?'Candidate reference differs from actual supporting surface':null;
  try {
    need(Math.abs(sim.world.timestep-settings.dt)<1e-8&&sim.world.gravity.y===-settings.gravity,'Native world physics differs from Actor profile');sim.tick(0);
    for(const room of validated.rooms) {
      const row={id:room.id,floor:room.source.floor,usage:room.source.usage,sourceDoorId:room.door.id,
        setup:null,legs:[],reachedPointIndices:[],sourceUnresolved:room.unresolved,
        extraTargets:room.extra.map(p=>({...p,status:'not-verified',reason:p.reason})),passed:false,error:null};
      results.push(row);
      const initial=support(room.start,room.door.bottom),error=supportError(room.start,initial);
      if(error){row.error=error;continue;}
      active='cad-room:'+room.id;
      const actor=sim.add(active,{x:initial.x,y:initial.capsuleFloor+footOffset+.08,z:initial.z});
      let sequence=0,frames=0;
      try {
        assertLiveController(actor,settings);forbidRecovery(actor);
        const tick=(x,z,jump=false)=>{actor.step({...idle,x,z,jump,seq:++sequence},settings.dt);sim.tick(0);frames++;};
        for(let i=0;i<80;i++)tick(0,0);
        const overlaps=[];
        sim.world.intersectionsWithShape(actor.position,{x:0,y:0,z:0,w:1},actor.collider.shape,c=>{overlaps.push(sim.partForCollider?.(c.handle)??c.handle);return true;},
          undefined,undefined,actor.collider,actor.body);
        const setupError=actor.position.y-initial.capsuleFloor-footOffset;
        row.setup={position:{...actor.position},grounded:actor.grounded,setupError,overlaps,support:initial};
        if(!actor.grounded||Math.abs(setupError)>=.1||overlaps.length){row.error='Invalid actual Actor room start';continue;}
        for(const [index,point] of room.path.entries()) {
          const measured=support(point,point.floor),problem=supportError(point,measured);
          if(problem){row.legs.push({pointIndex:index,target:point,support:measured,passed:false,error:problem});row.error=problem;break;}
          const target=cadLocalToWorld({x:point.x,y:point.floor,z:point.z},building.placement),trail=[];let legFrames=0;
          // No jump permission for furnished interior tours or arbitrary grid
          // points. The exact current Actor performs every movement frame.
          const leg=walkActorLeg(actor,target,measured.capsuleFloor,settings,(x,z,jump)=>{tick(x,z,jump);if(++legFrames%15===0)trail.push({...actor.position});});
          const contacts=[];
          for(let i=0;i<actor.controller.numComputedCollisions();i++){
            const contact=actor.controller.computedCollision(i);
            contacts.push({part:sim.partForCollider?.(contact.collider?.handle)??null,normal:{...contact.normal1},point:{...contact.witness1}});
          }
          row.legs.push({...leg,pointIndex:index,target:point,support:measured,contacts,trail});
          if(!leg.passed){row.error='Continuous room leg blocked or unsupported';break;}
          row.reachedPointIndices.push(index);
        }
        row.passed=row.reachedPointIndices.length===room.path.length&&room.unresolved.length===0;
        if(!row.passed&&!row.error)row.error='Candidate audit still has unresolved room targets';
        row.frames=frames;
      } catch(error){row.error=error instanceof Error?error.message:String(error);}
      finally {sim.remove(active);active=undefined;}
    }
  } finally {if(active)sim.remove(active);sim.dispose();}
  const passed=results.filter(row=>row.passed).length;
  const tourStatus=passed===validated.expectedRooms&&validated.unselectedRooms.length===0?'pass':'partial';
  return {...identity,building:building.id,placement:building.placement,
    scope:'Actual production Actor/KCC on this native candidate model only; no published-world, terrain, GPU or network claim',
    status:tourStatus==='pass'&&!validated.allExtraTargets.length?'pass':'partial',tourStatus,
    expectedRooms:validated.expectedRooms,selectedRooms:results.length,passedRooms:passed,
    unselectedRooms:validated.unselectedRooms,unverifiedExtraTargets:validated.allExtraTargets.map(p=>({...p,status:'not-verified'})),
    results,limits:['One fresh Actor starts at each annotated room doorway; room tours do not prove reachability from outside the building.',
      'All candidate points, including the return, require continuous actual movement; recovery and between-point teleports are forbidden.',
      'Source heights are query references only. Actual support is measured for setup and each arrival.',
      'Extra shower centres remain explicit unverified targets; ordinary apron/sink access never proves passage through their narrow partitions.']};
}

export async function verifyRoomPaths(args) {
  const allowed=new Set(['--model','--glb','--output','--room']);for(const key of args.keys())need(allowed.has(key),'Unknown argument '+key);
  const modelPath=resolve(required(args,'--model')),glbPath=resolve(args.get('--glb')??modelPath.replace(/\.json$/i,'.glb'));
  const before=sourceManifest(),modelBytes=readFileSync(modelPath),glbBytes=readFileSync(glbPath),model=JSON.parse(modelBytes);
  need(model.glbSha256===sha256(glbBytes),'Candidate GLB identity mismatch');
  const registered=CAD_BUILDINGS.find(b=>b.id===model.id);need(registered,'Native candidate has no current building placement');
  const settings=profileSettings('current');
  need(settings.radius===CHARACTER_RADIUS&&settings.halfHeight===CHARACTER_HALF_HEIGHT&&settings.dt===FIXED_DT,'Current Actor constants changed');
  const identity={profile:'current',settings,modelCollisionSha256:sha256(modelBytes),modelGlbSha256:sha256(glbBytes),
    actorSourceSha256:sha256(readFileSync('shared/simulation.ts')),validatorSha256:sha256(readFileSync(fileURLToPath(import.meta.url))),
    rapierHelperSha256:sha256(readFileSync(new URL('./rapier_model.mjs',import.meta.url)))};
  const building={id:model.id,model,placement:registered.placement,glbSha256:model.glbSha256,site:{sourceCollisionSha256:identity.modelCollisionSha256}};
  const validated=validateRoomTours(building,identity,args.get('--room'));
  await initPhysics();
  const report=replayRoomTours(validated,()=>createNativeActorRuntime(building,settings));
  need(before.sha256===sourceManifest().sha256,'Actor/world inputs changed during room proof');
  need(sha256(readFileSync(modelPath))===identity.modelCollisionSha256&&sha256(readFileSync(glbPath))===identity.modelGlbSha256,'Candidate asset changed during room proof');
  return {...report,modelPath:relative(process.cwd(),modelPath),sourceManifest:before,recordedAt:new Date().toISOString()};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {const args=argumentsMap(),output=required(args,'--output');verifyRoomPaths(args).then(report=>{
    writeReport(output,report);console.log(JSON.stringify({status:report.status,tourStatus:report.tourStatus,rooms:report.expectedRooms,passed:report.passedRooms,unverifiedExtraTargets:report.unverifiedExtraTargets.length}));
    process.exitCode=report.status==='pass'?0:2;
  }).catch(error=>{console.error(error);process.exitCode=1;});}catch(error){console.error(error);process.exitCode=1;}
}
