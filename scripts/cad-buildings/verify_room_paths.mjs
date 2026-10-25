// Run with tsx: the movement implementation is the ACTUAL production Actor.
import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import RAPIER from '@dimforge/rapier3d-compat';
import {Actor,Simulation,initPhysics,CHARACTER_RADIUS,CHARACTER_HALF_HEIGHT} from '../../shared/simulation.ts';
import {CAD_BUILDINGS} from '../../shared/cad-buildings.ts';
import {cadLocalToWorld,cadWorldToLocal,transformCadPositions} from '../../shared/cad-building-geometry.ts';
import {FIXED_DT} from '../../shared/netcode.ts';
import {argumentsMap,required,sha256,writeReport,profileSettings,doorApproachGeometry,fixedOpeningSpec,makeScene,requireCoverageDoorState,applyCoverageDoorState,doorStateAssumption,requireNativeDoorPhysics,createDoorInteractionProbe,doorRuntimeSha256,SERVER_DOOR_EYE_OFFSET} from './rapier_model.mjs';
import {fixedOpeningCoverage} from './verify_doors.mjs';
import {supportAt,assertLiveController,forbidRecovery,walkActorLeg,sourceManifest} from './verify_world_paths.ts';

const need=(condition,message)=>{if(!condition)throw new Error(message);};
const finitePoint=p=>p&&Array.isArray(p.cad)&&p.cad.length===2&&[...p.cad,p.height].every(Number.isFinite);
const samePoint=(a,b)=>Math.hypot(a.cad[0]-b.cad[0],a.cad[1]-b.cad[1])<1e-6&&Math.abs(a.height-b.height)<1e-6;
const firstRoomDoor=room=>room.path.slice(1).find(p=>p.sourceDoorId&&p.sourceDoorId!==room.door.id)?.sourceDoorId??room.door.id;

/** Candidate tours must be embedded in this hash-identified native model.
 * External route coordinates, support overrides and alternative capsules are
 * not accepted. A room proof starts at a real door, not an arbitrary interior. */
export function validateRoomTours(building,identity,roomFilter,doorMode,interactionMode) {
  const {model}=building,settings=identity.settings;
  need(interactionMode===undefined||interactionMode==='actor-interaction','Unknown room interaction mode');
  need(!interactionMode||doorMode===undefined||doorMode==='closed-default','Actor interaction proof cannot assume open-all doors');
  const assumption=interactionMode?doorStateAssumption(model,'closed-default'):requireCoverageDoorState(model,doorMode);
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
    need(path.every(p=>p.sourceDoorId===undefined||source.doorIds?.includes(p.sourceDoorId)&&doors.get(p.sourceDoorId)?.floor===source.floor&&!fixedOpeningSpec(doors.get(p.sourceDoorId))),
      'Room point references a foreign or fixed native door');
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
  return {context:{building,identity},proofMode:interactionMode??'conditional-geometry',doorStateAssumption:assumption,rooms:selected,expectedRooms:rooms.length,
    unselectedRooms:rooms.filter(r=>!selected.includes(r)).map(r=>r.id),allExtraTargets:rooms.flatMap(r=>r.extra.map(p=>({roomId:r.id,...p})))};
}

/** Only native candidate collision geometry is installed. Movement remains
 * the production Actor and its current KCC. No terrain/traffic/world claim is
 * made: this adapter exists so a not-yet-published export can be accepted. */
export function createNativeActorRuntime(building,settings) {
  const model={...building.model,parts:building.model.parts.map(part=>({...part,
    positions:Array.from(transformCadPositions(part.positions,building.placement))}))};
  const scene=makeScene(RAPIER,model,settings,building.placement),actors=new Map();
  let disposed=false;
  const runtime={world:scene.world,actors,walkingColliders:scene.ignoredColliders,groundColliders:new Set(),doorPhysics:scene.doorPhysics,
    doorCapsules(){return Simulation.prototype.doorCapsules.call(runtime);},
    doorObstacles(){return [];}, // Native candidate adapter has no car or traffic entities.
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
  const sim=createRuntime(),results=[];let active,interactions;
  const interactive=validated.proofMode==='actor-interaction';
  let roomPhysics,closedStates,definitionsBySource;
  const idle={x:0,z:0,yaw:0,jump:false,seq:0};
  const support=(point,reference)=>supportAt(sim,point,reference,validated,capsule);
  const supportError=(point,value)=>!value?'No actual native support':
    Math.abs(value.height-building.placement.translation.y-point.floor)>.15?'Candidate reference differs from actual supporting surface':null;
  try {
    if(interactive){
      need(JSON.stringify(validated.doorStateAssumption)===JSON.stringify(doorStateAssumption(building.model,'closed-default')),'Stale or incomplete room closed-default state');
      roomPhysics=requireNativeDoorPhysics(sim,building.model);
      closedStates=[...roomPhysics.definitions.keys()].map(id=>({id,open:false}));
      definitionsBySource=new Map([...roomPhysics.definitions.values()].map(d=>[d.definition.sourceDoorId,d]));
    }
    else applyCoverageDoorState(sim,building.model,validated.doorStateAssumption);
    need(Math.abs(sim.world.timestep-settings.dt)<1e-8&&sim.world.gravity.y===-settings.gravity,'Native world physics differs from Actor profile');sim.tick(0);
    for(const room of validated.rooms) {
      const row={id:room.id,floor:room.source.floor,usage:room.source.usage,sourceDoorId:room.door.id,
        setup:null,legs:[],reachedPointIndices:[],sourceUnresolved:room.unresolved,
        extraTargets:room.extra.map(p=>({...p,status:'not-verified',reason:p.reason})),passed:false,actorInteractionsVerified:false,error:null};
      results.push(row);
      if(interactive){
        interactions?.dispose();
        need(sim.actors.size===0,'Independent room setup cannot reset doors around a live Actor');
        // Explicit setup BETWEEN independent tours. No live Actor is moved or
        // has a door state reset underneath it; the static native scene is reused.
        roomPhysics.applyStates(closedStates);
        interactions=createDoorInteractionProbe(roomPhysics,settings,sim.doorCapsules.bind(sim),sim.doorObstacles?.bind(sim));
        row.initialDoorState={mode:'closed-default',allLeavesClosed:true,doors:roomPhysics.size};
        row.doorInteractions=interactions.events;row.interactionManeuvers=interactions.maneuvers;row.interactionPolicy=interactions.policy;
      }
      const initial=support(room.start,room.door.bottom),error=supportError(room.start,initial);
      if(error){row.error=error;continue;}
      active='cad-room:'+room.id;
      const actor=sim.add(active,{x:initial.x,y:initial.capsuleFloor+footOffset+.08,z:initial.z});
      let sequence=0,frames=0;
      try {
        assertLiveController(actor,settings);forbidRecovery(actor);
        const tick=(x,z,jump=false)=>{actor.step({...idle,x,z,jump,seq:++sequence},settings.dt);sim.tick(0);interactions?.advance();frames++;};
        for(let i=0;i<80;i++)tick(0,0);
        const overlaps=[];
        sim.world.intersectionsWithShape(actor.position,{x:0,y:0,z:0,w:1},actor.collider.shape,c=>{overlaps.push(sim.partForCollider?.(c.handle)??c.handle);return true;},
          undefined,undefined,actor.collider,actor.body,c=>!sim.walkingColliders.has(c.handle));
        const setupError=actor.position.y-initial.capsuleFloor-footOffset;
        row.setup={position:{...actor.position},grounded:actor.grounded,setupError,overlaps,support:initial};
        if(!actor.grounded||Math.abs(setupError)>=.1||overlaps.length){row.error='Invalid actual Actor room start';continue;}
        if(interactions){
          const physics=sim.doorPhysics,sourceChoices=[...new Set([firstRoomDoor(room),...room.path.map(p=>p.sourceDoorId).filter(Boolean)])];
          // A later cubicle can swing across the initial entry stance too.
          // Prepare it while the source-derived entry pose is still reachable;
          // its opening/closing remains ordinary shared-authority interaction.
          const firstSource=sourceChoices.find(id=>id!==room.door.id&&definitionsBySource.has(id)&&
            !physics.guardChange(definitionsBySource.get(id).id,true,sim.doorCapsules(),sim.doorObstacles?.()??[]).allowed)??firstRoomDoor(room);
          const first=definitionsBySource.get(firstSource),entry=definitionsBySource.get(room.door.id);
          const prep={status:'not-needed',sourceDoorId:room.door.id,intendedSourceDoorId:firstSource,
            selectionBasis:'First annotated tour door whose opening sweep intersects the actual initial capsule; otherwise the first upcoming door',
            sourceEntities:room.door.sourceEntities??[],
            provenance:'Optional bounded stance on the same side of the native entry closed plane; every move uses actual Actor input',
            maximumDisplacement:.14,planningMargin:.02,arrivalTolerance:.01,attempted:[],returnedToFirstMandatoryPoint:false};
          row.entryPreparation=prep;
          if(first&&entry&&first.id!==entry.id&&!physics.guardChange(first.id,true,sim.doorCapsules(),sim.doorObstacles?.()??[]).allowed){
            prep.status='unavailable';
            const from={...actor.position},center=entry.closedPosition,normal={x:Math.sin(entry.closedRotationY),z:Math.cos(entry.closedRotationY)};
            const signed=(from.x-center.x)*normal.x+(from.z-center.z)*normal.z,side=Math.sign(signed);
            prep.from=from;prep.sourcePlane={center:{...center},normal,side};
            for(const standOff of [.36,.34,.32]){
              if(!side||Math.abs(signed)<=standOff||Math.abs(signed)-standOff>.14||standOff<settings.radius+settings.offset+entry.halfExtents.z+.01)continue;
              const target={x:center.x+side*normal.x*standOff,z:center.z+side*normal.z*standOff};
              if(Math.hypot(target.x-from.x,target.z-from.z)>.14)continue;
              const local=cadWorldToLocal({x:target.x,y:0,z:target.z},building.placement),point={x:local.x,z:local.z,floor:room.door.bottom};
              const measured=support(point,point.floor),problem=supportError(point,measured);
              const candidate={standOff,target,support:measured,problem};prep.attempted.push(candidate);
              if(problem)continue;
              const pose={...target,y:measured.capsuleFloor+footOffset},hits=[];
              sim.world.intersectionsWithShape(pose,{x:0,y:0,z:0,w:1},actor.collider.shape,c=>{hits.push(c.handle);return true;},undefined,undefined,actor.collider,actor.body,c=>!sim.walkingColliders.has(c.handle));
              candidate.overlaps=hits;if(hits.length)continue;
              // Exclude only the identified supporting floor(s) from a horizontal
              // clearance sweep; ordinary movement still collides with all floors.
              const floorHandles=new Set([initial.collider,initial.capsuleCollider,measured.collider,measured.capsuleCollider]);
              const sweep=sim.world.castShape(from,{x:0,y:0,z:0,w:1},{x:target.x-from.x,y:0,z:target.z-from.z},actor.collider.shape,settings.offset,1,true,
                undefined,undefined,actor.collider,actor.body,c=>!sim.walkingColliders.has(c.handle)&&!floorHandles.has(c.handle));
              candidate.clearSweep=!sweep;if(sweep)continue;
              const planned=sim.doorCapsules().map(p=>p.id===actor.id?{...p,current:pose,next:pose,skin:(p.skin??settings.offset)+.02}:p);
              candidate.openingGuard=physics.guardChange(first.id,true,planned,sim.doorObstacles?.()??[]);
              if(!candidate.openingGuard.allowed)continue;
              if(!physics.lineOfSight({...pose,y:pose.y+SERVER_DOOR_EYE_OFFSET},first.id,false,actor.collider))continue;
              prep.target=target;prep.standOff=standOff;prep.support=measured;
              prep.movement=walkActorLeg(actor,target,measured.capsuleFloor,settings,tick,undefined,
                {beforeMove:(a,t)=>interactions.beforeMove(a,t)},.01);
              if(!prep.movement.passed){prep.status='blocked';row.error='Bounded source entry preparation movement failed';break;}
              prep.opening=walkActorLeg(actor,target,measured.capsuleFloor,settings,tick,undefined,
                {beforeMove:(a,t)=>interactions.beforeMove(a,t,firstSource)},.01);
              prep.status=prep.opening.passed&&physics.isOpen(first.id)?'completed':'blocked';
              if(prep.status!=='completed')row.error='Actual opening from the prepared stance was rejected';
              break;
            }
            if(prep.status==='blocked')continue;
          }
        }
        for(const [index,point] of room.path.entries()) {
          const measured=support(point,point.floor),problem=supportError(point,measured);
          if(problem){row.legs.push({pointIndex:index,target:point,support:measured,passed:false,error:problem});row.error=problem;break;}
          const target=cadLocalToWorld({x:point.x,y:point.floor,z:point.z},building.placement),trail=[];let legFrames=0;
          // No jump permission for furnished interior tours or arbitrary grid
          // points. The exact current Actor performs every movement frame.
          // The first short normalOffset prefix must not consume the only safe
          // opening stance for the next annotated cubicle door.
          const intended=index===0?firstRoomDoor(room):point.sourceDoorId;
          const interaction=interactions?{beforeMove:(actor,target)=>interactions.beforeMove(actor,target,intended)}:undefined;
          const leg=walkActorLeg(actor,target,measured.capsuleFloor,settings,(x,z,jump)=>{tick(x,z,jump);if(++legFrames%15===0)trail.push({...actor.position});},undefined,interaction);
          const contacts=[];
          for(let i=0;i<actor.controller.numComputedCollisions();i++){
            const contact=actor.controller.computedCollision(i);
            contacts.push({part:sim.partForCollider?.(contact.collider?.handle)??null,normal:{...contact.normal1},point:{...contact.witness1}});
          }
          row.legs.push({...leg,pointIndex:index,target:point,support:measured,contacts,trail});
          if(!leg.passed){row.error='Continuous room leg blocked or unsupported';break;}
          row.reachedPointIndices.push(index);
          if(index===0&&row.entryPreparation)row.entryPreparation.returnedToFirstMandatoryPoint=true;
        }
        row.passed=row.reachedPointIndices.length===room.path.length&&room.unresolved.length===0;
        row.actorInteractionsVerified=interactive&&row.passed;
        if(!row.passed&&!row.error)row.error='Candidate audit still has unresolved room targets';
        row.frames=frames;
      } catch(error){row.error=error instanceof Error?error.message:String(error);}
      finally {sim.remove(active);active=undefined;}
    }
  } finally {if(active)sim.remove(active);interactions?.dispose();sim.dispose();}
  const passed=results.filter(row=>row.passed).length;
  const tourStatus=passed===validated.expectedRooms&&validated.unselectedRooms.length===0?'pass':'partial';
  return {...identity,building:building.id,placement:building.placement,
    proofMode:validated.proofMode??'conditional-geometry',doorStateAssumption:validated.doorStateAssumption,initialDoorState:interactive?validated.doorStateAssumption:null,
    actorInteractionsVerified:interactive&&tourStatus==='pass',doorRuntimeSha256:doorRuntimeSha256(),
    doorInteractions:interactive?results.flatMap(row=>(row.doorInteractions??[]).map(event=>({roomId:row.id,...event}))):[],
    scope:'Actual production Actor/KCC on this native candidate model only; no published-world, terrain, GPU or network claim',
    status:tourStatus==='pass'&&!validated.allExtraTargets.length?(!interactive&&validated.doorStateAssumption.states.length?'conditional-pass':'pass'):'partial',tourStatus,
    expectedRooms:validated.expectedRooms,selectedRooms:results.length,passedRooms:passed,
    unselectedRooms:validated.unselectedRooms,unverifiedExtraTargets:validated.allExtraTargets.map(p=>({...p,status:'not-verified'})),
    results,limits:[interactive?'Each independent tour resets all leaves closed before adding its Actor; only shared authority requests change doors during the continuous tour. This is CPU interaction-policy proof, not multiplayer or human camera acceptance.':
      'Interactive leaves are open only under the explicit recorded state assumption; room coverage does not prove interaction reach, LOS or occupied-sweep clearance.',
      'One fresh Actor starts at each annotated room doorway; room tours do not prove reachability from outside the building.',
      'All candidate points, including the return, require continuous actual movement; recovery and between-point teleports are forbidden.',
      'Source heights are query references only. Actual support is measured for setup and each arrival.',
      'Extra shower centres remain explicit unverified targets; ordinary apron/sink access never proves passage through their narrow partitions.']};
}

export async function verifyRoomPaths(args) {
  const allowed=new Set(['--model','--glb','--output','--room','--door-state','--interaction-mode']);for(const key of args.keys())need(allowed.has(key),'Unknown argument '+key);
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
  const validated=validateRoomTours(building,identity,args.get('--room'),args.get('--door-state'),args.get('--interaction-mode'));
  await initPhysics();
  const report=replayRoomTours(validated,()=>createNativeActorRuntime(building,settings));
  need(before.sha256===sourceManifest().sha256,'Actor/world inputs changed during room proof');
  need(sha256(readFileSync(modelPath))===identity.modelCollisionSha256&&sha256(readFileSync(glbPath))===identity.modelGlbSha256,'Candidate asset changed during room proof');
  return {...report,modelPath:relative(process.cwd(),modelPath),sourceManifest:before,recordedAt:new Date().toISOString()};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {const args=argumentsMap(),output=required(args,'--output');verifyRoomPaths(args).then(report=>{
    writeReport(output,report);console.log(JSON.stringify({status:report.status,tourStatus:report.tourStatus,rooms:report.expectedRooms,passed:report.passedRooms,unverifiedExtraTargets:report.unverifiedExtraTargets.length}));
    process.exitCode=['pass','conditional-pass'].includes(report.status)?0:2;
  }).catch(error=>{console.error(error);process.exitCode=1;});}catch(error){console.error(error);process.exitCode=1;}
}
