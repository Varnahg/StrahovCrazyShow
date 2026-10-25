// Sdílená izolovaná CPU přejímka stavebního modelu. Nespouští hru ani GPU.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { register } from 'tsx/esm/api';
import RAPIER from '@dimforge/rapier3d-compat';

// Plain Node .mjs CLIs load the SAME TypeScript implementation as Simulation.
// Do not reimplement the hinge, collider or occupied-door sweep in this adapter.
const [physicsModule,doorModule,serverModule]=await (async()=>{
  // A separate tsImport namespace for each dependency would instantiate a
  // second Rapier WASM runtime. Load canonical ESM URLs under one temporary
  // loader, then unregister our hook (an outer tsx CLI remains independent).
  const unregister=register();
  try{return await Promise.all(['../../shared/cad-door-physics.ts','../../shared/cad-doors.ts','../../server/door-interactions.ts']
    .map(path=>import(new URL(path,import.meta.url).href)));}finally{await unregister();}
})();
const {CadDoorPhysics}=physicsModule;
const {placeCadDoorDefinition,cadDoorDefinitionsById,cadDoorCollisionPartIds,CadDoorStateStore,cadDoorPose,CAD_DOOR_INTERACTION_RANGE}=doorModule;
const {SERVER_DOOR_EYE_OFFSET}=serverModule;
export {SERVER_DOOR_EYE_OFFSET};
const IDENTITY_PLACEMENT={translation:{x:0,y:0,z:0},yaw:0};

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function doorRuntimeSha256() {
  return sha256(JSON.stringify(['../../shared/cad-doors.ts','../../shared/cad-door-physics.ts','../../server/door-interactions.ts']
    .map(path=>[path,sha256(readFileSync(new URL(path,import.meta.url)))])));
}
export function argumentsMap(argv = process.argv.slice(2)) {
  const args = new Map();
  if (argv.length % 2) throw new Error('Argumenty mají tvar --název hodnota');
  for (let i=0;i<argv.length;i+=2) {
    if (!argv[i].startsWith('--') || args.has(argv[i])) throw new Error('Neplatný nebo opakovaný argument: '+argv[i]);
    args.set(argv[i],argv[i+1]);
  }
  return args;
}
export function required(args,key) {
  const value=args.get(key);
  if (!value) throw new Error('Chybí argument '+key);
  return value;
}
export function profileSettings(profile,speed=4.6) {
  const bodies={current:[0.25,0.55,0.10],'cad-candidate':[0.28,0.52,0.10],'cad-compact':[0.25,0.55,0.10],'cad-plan':[0.25,0.55,0.10]};
  if (!bodies[profile] || !Number.isFinite(speed) || speed<=0 || speed>10) throw new Error('Neplatný profil/rychlost');
  const [radius,halfHeight,autostepWidth]=bodies[profile];
  return {radius,halfHeight,autostepWidth,offset:0.02,autostepHeight:profile==='cad-plan'?0.24:0.22,snap:0.25,gravity:18,dt:1/60,speed};
}

export function doorApproachGeometry(scene,door) {
  const dx=door.closedEnd[0]-door.hinge[0],dy=door.closedEnd[1]-door.hinge[1],width=Math.hypot(dx,dy);
  if(!(width>0)||![width,door.bottom,door.depth,door.normalOffset??0].every(Number.isFinite)||door.depth<0) {
    throw new Error('Neplatná dveřní geometrie '+door.id);
  }
  const normalCad=[-dy/width,dx/width];
  const centerCad=door.hinge.map((value,i)=>(value+door.closedEnd[i])/2+normalCad[i]*(door.normalOffset??0));
  const standard=door.depth/2+scene.settings.radius+scene.settings.offset+.12;
  const boundaries=door.approachBoundaryCad??[null,null];
  if(!Array.isArray(boundaries)||boundaries.length!==2)throw new Error('Neplatné meze přístupu '+door.id);
  const distances=[-1,1].map((sign,side)=>{
    const boundary=boundaries[side];if(boundary===null)return standard;
    if(!Array.isArray(boundary)||boundary.length!==2||!boundary.every(Number.isFinite))throw new Error('Neplatná mez přístupu '+door.id);
    const delta=boundary.map((value,i)=>value-centerCad[i]);
    if(Math.abs((delta[0]*dx+delta[1]*dy)/width)>1e-4)throw new Error('Mez přístupu neleží na normále otvoru '+door.id);
    // Zakončení mělkého prostoru omezuje tělo kapsle, nikoli jen její střed.
    // Původní ostění ani zadní uzávěr se kvůli testu neposouvají.
    const available=sign*(delta[0]*normalCad[0]+delta[1]*normalCad[1])-scene.settings.radius-scene.settings.offset-.01;
    if(!(available>.05))throw new Error('Za otvorem není místo pro zadanou přístupovou kapsli '+door.id);
    return Math.min(standard,available);
  });
  const points=[-1,1].map((sign,side)=>{
    const cad=centerCad.map((value,i)=>value+sign*distances[side]*normalCad[i]);
    return {cad,...scene.local(cad)};
  });
  return {width,normalCad,centerCad,distances,points};
}

const FIXED_OPENINGS=Object.freeze({
  'facade-opening-unconfirmed-access':Object.freeze({role:'facade-glass',category:'fixed-glazing',missingCategory:'missing-glazing',
    exclusionCategory:'fixed-facade-glazing',testKind:'fixed-facade-protection'}),
  'fixed-paired-door-leaf':Object.freeze({role:'fixed-door-leaf',category:'fixed-door-leaf',missingCategory:'missing-fixed-door-leaf',
    exclusionCategory:'fixed-paired-door-leaf',testKind:'fixed-door-leaf-protection'}),
});
/** One classification contract for physical protection, graph and world proof. */
export function fixedOpeningSpec(door) { return FIXED_OPENINGS[door.openingClassification]??null; }

export function nativeDoorDefinitions(model,placement=IDENTITY_PLACEMENT) {
  const raw=model.interactiveDoors??[];
  if(!Array.isArray(raw))throw new Error('Invalid native interactiveDoors');
  const definitions=raw.map(definition=>placeCadDoorDefinition(definition,placement));
  cadDoorDefinitionsById(definitions);
  const claimed=new Set();
  for(const door of definitions) {
    const source=model.doors?.find(item=>item.id===door.definition.sourceDoorId);
    if(model.id!==door.definition.buildingId||!source||source.floor!==door.definition.floor||fixedOpeningSpec(source)||claimed.has(source.id))
      throw new Error('Interactive definition has no unique movable native opening: '+door.id);
    claimed.add(source.id);
  }
  if(model.interactiveDoors!==undefined&&model.doors?.some(door=>!fixedOpeningSpec(door)&&!claimed.has(door.id)))
    throw new Error('Native movable opening omitted from interactive definitions');
  return definitions;
}
export function doorStateAssumption(model,mode='closed-default') {
  if(!['closed-default','all-interactive-open'].includes(mode))throw new Error('Unknown door-state assumption');
  const definitions=nativeDoorDefinitions(model);
  return {mode,doorDefinitionSha256:sha256(JSON.stringify(model.interactiveDoors??[])),
    states:definitions.map(door=>({id:door.id,open:mode==='all-interactive-open'})),
    actorInteractionsVerified:false,purpose:mode==='all-interactive-open'?'conditional-geometric-coverage':'closed-default-geometry'};
}
export function requireCoverageDoorState(model,mode) {
  if((model.interactiveDoors?.length??0)>0&&mode!=='all-interactive-open')
    throw new Error('Interactive coverage requires explicit --door-state all-interactive-open; this does not prove interactions');
  return doorStateAssumption(model,mode??'closed-default');
}
export function applyCoverageDoorState(runtime,model,assumption) {
  const expected=requireCoverageDoorState(model,assumption?.mode);
  if(JSON.stringify(expected)!==JSON.stringify(assumption))throw new Error('Stale or incomplete door-state assumption');
  if(expected.states.length) {
    requireNativeDoorPhysics(runtime,model);
    // Full physics snapshot may contain another building's definitions. Only
    // this explicit, recorded native coverage set changes here.
    for(const state of expected.states)runtime.doorPhysics.apply(state.id,state.open);
  }
  return expected;
}
export function requireNativeDoorPhysics(runtime,model) {
  if(!runtime.doorPhysics)throw new Error('Interactive native model requires shared CadDoorPhysics');
  for(const definition of nativeDoorDefinitions(model)) {
    const actual=runtime.doorPhysics.definitions.get(definition.id)?.definition;
    if(JSON.stringify(actual)!==JSON.stringify(definition.definition))throw new Error('Runtime door definition differs from native model');
  }
  return runtime.doorPhysics;
}

/** Shared authority checks at the CURRENT Actor position. This is CPU policy
 * evidence, not transport/latency or a simulated human camera claim. */
export function createDoorInteractionProbe(physics,settings,capsules,obstacles) {
  if(!physics)throw new Error('Missing shared door physics');
  const definitions=[...physics.definitions.values()];
  if(definitions.some(door=>physics.isOpen(door.id)))throw new Error('Interaction probe requires closed-default state');
  const identity={worldEpoch:'cad-route-proof',definitionHash:sha256(JSON.stringify(definitions.map(d=>d.definition)))};
  const store=new CadDoorStateStore(definitions,identity),events=[],maneuvers=[];
  const activeHandles=new Map(definitions.flatMap(door=>physics.collidersFor(door.id).map(c=>[c.handle,door.id])));
  const bySource=new Map(definitions.map(door=>[door.definition.sourceDoorId,door.id]));
  let tick=0,requestId=0,disposed=false;
  const probes=actor=>capsules?.()??[{id:actor.id,current:actor.position,next:actor.body?.nextTranslation()??actor.position,
    radius:settings.radius,halfHeight:settings.halfHeight,skin:settings.offset}];
  const request=(actor,id,open,intent=null)=>{
    if(disposed)throw new Error('Interaction probe disposed');
    const p={...actor.position},eye={x:p.x,y:p.y+SERVER_DOOR_EYE_OFFSET,z:p.z};
    let guard=null;
    const result=store.request({...identity,requestId:++requestId,doorId:id,open,expectedRevision:store.get(id)?.revision??0},{
      actor:{id:actor.id,position:p,eye,vehicle:actor.vehicle===true},tick,nowMs:tick*settings.dt*1000,
      canSee:(door,state)=>physics.lineOfSight(eye,door.id,state.open,actor.collider),
      canChange:(door,_from,to)=>(guard=physics.guardChange(door.id,to,probes(actor),obstacles?.()??[])).allowed,
      apply:(doorId,state)=>physics.apply(doorId,state),
    });
    const event={tick,actorId:actor.id,position:p,doorId:id,requestedOpen:open,result,guard,intent};events.push(event);return event;
  };
  const interval=Math.ceil(.26/settings.dt),maxAttempts=8,maxStanceAttempts=2,stanceDistance=.15,maxRetreats=2,maxTrail=256;
  let lastAttempt=-Infinity,leg=null,legIndex=0,trail=[],trailActor;
  const inRange=(actorPosition,id)=>{
    const handle=cadDoorPose(physics.definitions.get(id),physics.isOpen(id)).handle;
    return Math.hypot(actorPosition.x-handle.x,actorPosition.y-handle.y,actorPosition.z-handle.z)<=CAD_DOOR_INTERACTION_RANGE;
  };
  const leafBlocksLeg=(actor,from,target,handle)=>{
    const velocity={x:target.x-from.x,y:0,z:target.z-from.z};
    return !!physics.world.castShape(from,{x:0,y:0,z:0,w:1},velocity,actor.collider.shape,settings.offset,1,true,
      undefined,undefined,actor.collider,actor.body,c=>c.handle===handle);
  };
  const desiredLegClear=(actor,from,target,id,open)=>!leafBlocksLeg(actor,from,target,physics.collidersFor(id)[open?1:0].handle);
  const continuationClear=(actor,from,target,id,open)=>{
    if(!desiredLegClear(actor,from,target,id,open))return false;
    const [closed,opened]=physics.collidersFor(id),desired=open?opened:closed,excluded=open?closed:opened;
    const active=c=>c.handle!==excluded.handle&&(c.handle===desired.handle||
      !physics.options.ignoredColliders.has(c.handle)&&physics.isActiveCollider(c));
    // Ignore only measured horizontal support contacts in this planning sweep,
    // as in entry preparation. Actual Actor walking still tests every surface.
    const supportHandles=new Set();
    for(const point of [from,{...target,y:from.y}]){
      const hit=physics.world.castRayAndGetNormal(new RAPIER.Ray(point,{x:0,y:-1,z:0}),settings.radius+settings.halfHeight+.25,
        false,undefined,undefined,actor.collider,actor.body,active);
      if(hit?.normal.y>.5)supportHandles.add(hit.collider.handle);
    }
    return !physics.world.castShape(from,{x:0,y:0,z:0,w:1},{x:target.x-from.x,y:0,z:target.z-from.z},actor.collider.shape,settings.offset,1,true,
      undefined,undefined,actor.collider,actor.body,c=>active(c)&&!supportHandles.has(c.handle));
  };
  const plannedChangeClear=(actor,position,id,open)=>{
    const hypothetical=probes(actor).map(p=>p.id===actor.id?{...p,current:position,next:position,skin:(p.skin??settings.offset)+.02}:p);
    return physics.guardChange(id,open,hypothetical,obstacles?.()??[]).allowed;
  };
  const prepareRetreat=(actor,target,id,open)=>{
    if(leg.retreatCount>=maxRetreats)return false;
    const clearCache=new Map(),clearFrom=index=>{
      if(!clearCache.has(index))clearCache.set(index,continuationClear(actor,trail[index].position,target,id,open));
      return clearCache.get(index);
    };
    for(let i=trail.length-2;i>=0;i--){
      const candidate=trail[i].position;
      if(!inRange(candidate,id)||!plannedChangeClear(actor,candidate,id,open))continue;
      const eye={x:candidate.x,y:candidate.y+SERVER_DOOR_EYE_OFFSET,z:candidate.z};
      if(!physics.lineOfSight(eye,id,physics.isOpen(id),actor.collider))continue;
      // The safe handle stance need not have a direct path past the opened
      // tip. Continue backwards along the SAME visited trail until one does.
      // Each additional segment must clear the desired leaf before planning it.
      let resumeIndex=i;
      while(open&&!clearFrom(resumeIndex)&&resumeIndex>0&&
        desiredLegClear(actor,trail[resumeIndex].position,trail[resumeIndex-1].position,id,open))resumeIndex--;
      if(!clearFrom(resumeIndex))continue;
      // Reuse the measured path in reverse, not a straight shortcut through a
      // wall. Every waypoint was reached by this same Actor in this session.
      const points=trail.slice(resumeIndex).reverse().map(p=>({position:{...p.position},visitedAtTick:p.tick}));
      const changeAfterPoint=trail.length-i;
      const maneuver={id:maneuvers.length+1,actorId:actor.id,doorId:id,plannedAtTick:tick,
        reason:'retreat-along-visited-trail-for-safe-'+(open?'open':'close'),requestedOpen:open,originalTarget:{...target},points,changeAfterPoint,completed:false};
      maneuvers.push(maneuver);leg.retreat={doorId:id,open,points,index:0,changeAfterPoint,changed:false,trailIndex:resumeIndex,maneuver};leg.retreatCount++;return true;
    }
    return false;
  };
  const attempt=(actor,id,open,kind,target)=>{
    const key=id+':'+open,attempts=leg.attempts.get(key)??[],p=actor.position;
    if(attempts.length>=maxAttempts||leg.changed.has(id))return;
    // A hidden handle may become visible after ordinary walking. Log the first
    // real rejection, then wait for visibility rather than exhaust the leg's
    // request budget or idle on cooldown in front of the occluding partition.
    if(attempts.at(-1)?.result.reason==='occluded'&&!physics.lineOfSight(
      {x:p.x,y:p.y+SERVER_DOOR_EYE_OFFSET,z:p.z},id,physics.isOpen(id),actor.collider))return;
    if(attempts.filter(e=>Math.hypot(p.x-e.position.x,p.y-e.position.y,p.z-e.position.z)<stanceDistance).length>=maxStanceAttempts)return;
    if(tick-lastAttempt<interval)return {wait:true,reason:'interaction-cooldown'};
    lastAttempt=tick;
    const event=request(actor,id,open,{kind,leg:leg.index,target:{...target},sourceDoorId:physics.definitions.get(id).definition.sourceDoorId});
    attempts.push(event);leg.attempts.set(key,attempts);
    if(event.result.status==='changed'){leg.changed.add(id);return {wait:true,reason:'door-state-changed'};}
  };
  return {events,maneuvers,policy:{minimumIntervalFrames:interval,maxAttemptsPerDoorStatePerLeg:maxAttempts,maxAttemptsPerDoorStatePerStance:maxStanceAttempts,stanceDistance,maxStateChangesPerDoorPerLeg:1,maxRetreatsPerLeg:maxRetreats,maxTrailPoints:maxTrail},
    request,advance(){tick++;},
    beforeMove(actor,target,sourceDoorId) {
      if(disposed)throw new Error('Interaction probe disposed');
      if(![actor.position.x,actor.position.y,actor.position.z,target.x,target.z].every(Number.isFinite))throw new Error('Invalid Actor interaction target/pose');
      const key=[actor.id,target.x,target.z,sourceDoorId??''].join('|');
      const newLeg=!leg||leg.key!==key;
      if(newLeg)leg={key,index:++legIndex,attempts:new Map(),changed:new Set(),retreatCount:0,retreat:null};
      if(trailActor!==actor.id){trail=[];trailActor=actor.id;}
      const p=actor.position;
      if(leg.retreat){
        const retreat=leg.retreat;
        const stop=retreat.changed?retreat.points.length:retreat.changeAfterPoint;
        while(retreat.index<stop&&Math.hypot(p.x-retreat.points[retreat.index].position.x,p.z-retreat.points[retreat.index].position.z)<.01)retreat.index++;
        if(retreat.index<stop)return {target:retreat.points[retreat.index].position,reason:'visited-trail-retreat',maneuverId:retreat.maneuver.id};
        // Every state change goes through a real request at the ACTUAL returned
        // position; the hypothetical candidate check above never mutates state.
        if(!retreat.changed&&desiredLegClear(actor,p,retreat.points[retreat.index]?.position??target,retreat.doorId,retreat.open)){
          const decision=attempt(actor,retreat.doorId,retreat.open,(retreat.open?'open-blocking-closed':'close-blocking-open')+'-leaf-after-retreat',target);
          if(physics.isOpen(retreat.doorId)===retreat.open){
            retreat.changed=true;retreat.maneuver.changedAtTick=tick;
          }
          if(decision)return decision;
        }
        if(retreat.changed){
          if(retreat.index<retreat.points.length)return {target:retreat.points[retreat.index].position,reason:'visited-trail-retreat',maneuverId:retreat.maneuver.id};
          retreat.maneuver.completed=true;retreat.maneuver.finishedAtTick=tick;
          trail=trail.slice(0,retreat.trailIndex+1);leg.retreat=null;
        }else {retreat.maneuver.error='Safe '+(retreat.open?'open':'close')+' was rejected at the actual retreat position';leg.retreat=null;}
      }
      if(!trail.length||Math.hypot(p.x-trail.at(-1).position.x,p.y-trail.at(-1).position.y,p.z-trail.at(-1).position.z)>=(newLeg?1e-5:.07)){
        trail.push({tick,position:{...p}});if(trail.length>maxTrail)trail.shift();
      }
      const velocity={x:target.x-p.x,y:0,z:target.z-p.z};
      // A native door approach is an explicit interaction target: request as
      // soon as the CURRENT actor is in range, before walking into its sweep.
      // Arbitrary grid legs may open a blocking closed leaf, or safely close a
      // blocking open leaf only when its closed pose leaves the leg clear.
      const intended=bySource.get(sourceDoorId);
      const hit=physics.world.castShape(p,{x:0,y:0,z:0,w:1},velocity,actor.collider.shape,settings.offset,1,true,
        undefined,undefined,actor.collider,actor.body,c=>activeHandles.has(c.handle)&&physics.isActiveCollider(c));
      const blocking=hit&&activeHandles.get(hit.collider.handle);
      if(blocking&&physics.isOpen(blocking)&&!leg.changed.has(blocking)&&desiredLegClear(actor,p,target,blocking,false)&&inRange(p,blocking)){
        const guard=physics.guardChange(blocking,false,probes(actor),obstacles?.()??[]);
        if(!guard.allowed&&prepareRetreat(actor,target,blocking,false))return {wait:true,reason:'plan-visited-trail-retreat'};
        if(guard.allowed)return attempt(actor,blocking,false,'close-blocking-open-leaf',target);
      }
      const id=intended&&!physics.isOpen(intended)?intended:blocking&&!physics.isOpen(blocking)?blocking:null;
      if(!id||!inRange(p,id)||leg.changed.has(id))return;
      if(!physics.guardChange(id,true,probes(actor),obstacles?.()??[]).allowed&&prepareRetreat(actor,target,id,true))
        return {wait:true,reason:'plan-visited-trail-retreat'};
      return attempt(actor,id,true,intended===id?'open-native-intended-door':'open-blocking-closed-leaf',target);
    },
    dispose(){if(disposed)return;disposed=true;trail=[];leg=null;store.dispose();},
  };
}
export async function loadRapier(dependencyRoot=process.cwd()) {
  const require=createRequire(resolve(dependencyRoot,'package.json'));
  if(require.resolve('@dimforge/rapier3d-compat')!==createRequire(import.meta.url).resolve('@dimforge/rapier3d-compat'))
    throw new Error('Native proof and shared door physics must use the same installed Rapier');
  // require() selects a second CJS WASM singleton. Shared TypeScript uses the
  // ESM singleton; both world and ColliderDesc must belong to that instance.
  await RAPIER.init();
  return RAPIER;
}

// Static model.parts are already in the caller's chosen space. The optional
// placement puts native MODEL-space door definitions into that same space;
// createNativeActorRuntime transforms static vertices once before calling us.
export function makeScene(R,model,settings,placement=IDENTITY_PLACEMENT) {
  if(R.World!==RAPIER.World)throw new Error('Mixed Rapier runtimes are not supported');
  if (!Array.isArray(model.cadOrigin) || model.cadOrigin.length!==2 || !model.cadOrigin.every(Number.isFinite)) throw new Error('Neplatný CAD počátek');
  if (!model.parts?.length) throw new Error('Model nemá konstrukční části');
  const ids=new Set();
  for (const part of model.parts) {
    if (!part.id || ids.has(part.id) || !Array.isArray(part.positions) || part.positions.length%3 ||
        !Array.isArray(part.indices) || !part.indices.length || part.indices.length%3 ||
        !part.positions.every(Number.isFinite) || !part.indices.every(i=>Number.isInteger(i)&&i>=0&&i<part.positions.length/3)) {
      throw new Error('Neplatná konstrukční část '+part.id);
    }
    ids.add(part.id);
  }
  const definitions=nativeDoorDefinitions(model,placement),movingParts=cadDoorCollisionPartIds(definitions);
  for(const part of model.parts)if(movingParts.has(part.id)&&part.role==='fixed-door-leaf')throw new Error('Fixed paired leaf cannot be removed from collision');
  const world=new R.World({x:0,y:-settings.gravity,z:0});world.timestep=settings.dt;
  const parts=new Map();const walkers=new Set();
  const ignoredColliders=new Set();let doorPhysics;
  try {
    for(const part of model.parts) {
      if(movingParts.has(part.id))continue;
      const collider=world.createCollider(R.ColliderDesc.trimesh(Float32Array.from(part.positions),Uint32Array.from(part.indices),R.TriMeshFlags.FIX_INTERNAL_EDGES));
      parts.set(collider.handle,part);
    }
    doorPhysics=new CadDoorPhysics(world,definitions,{ignoredColliders});
    for(const door of definitions)for(const collider of doorPhysics.collidersFor(door.id))
      parts.set(collider.handle,{id:door.id,role:'interactive-door-leaf',floor:door.definition.floor});
    world.step();
  } catch(error) { world.free();throw error; }
  const local=([x,y])=>({x:-(y-model.cadOrigin[1]),z:-(x-model.cadOrigin[0])});
  const supports=c=>['slab','stair','stair-landing','canopy'].includes(parts.get(c.handle)?.role);
  const footOffset=settings.radius+settings.halfHeight+settings.offset;
  const capsule=new R.Capsule(settings.halfHeight,settings.radius);
  const expectedFloor=point=>point.support?.capsuleFootHeight??point.floor;
  let freed=false;
  const activeCollider=c=>!ignoredColliders.has(c.handle)&&doorPhysics.isActiveCollider(c);
  return {
    R,world,model,settings,parts,local,doorPhysics,ignoredColliders,activeCollider,
    floorAt(point,reference) {
      const hit=world.castRayAndGetNormal(new R.Ray({x:point.x,y:reference+0.65,z:point.z},{x:0,y:-1,z:0}),1.30,false,
        undefined,undefined,undefined,undefined,supports);
      if(!hit||hit.normal.y<=0.5)return null;
      const height=reference+0.65-hit.timeOfImpact;
      // Nášlap pod středem není kontaktní výškou oblého konce kapsle u nosu
      // schodu. Svislý sweep měří tutéž kapsli i odstup jako skutečný controller.
      const castY=height+footOffset+0.4;
      const support=world.castShape({x:point.x,y:castY,z:point.z},{x:0,y:0,z:0,w:1},
        {x:0,y:-1,z:0},capsule,settings.offset,0.8,true,undefined,undefined,undefined,undefined,supports);
      const capsuleFootHeight=support?castY-support.time_of_impact-footOffset:null;
      return {height,part:parts.get(hit.collider.handle)?.id,
        ...(support&&support.normal1.y>0.5&&Math.abs(capsuleFootHeight-height)<=settings.autostepHeight+0.02
          ?{capsuleFootHeight,capsuleSupportPart:parts.get(support.collider.handle)?.id}:{})};
    },
    walker(start) {
      if(freed || ![start.x,start.z,start.floor].every(Number.isFinite)) throw new Error('Neplatný počátek postavy');
      const body=world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x,expectedFloor(start)+footOffset+0.08,start.z));
      const collider=world.createCollider(R.ColliderDesc.capsule(settings.halfHeight,settings.radius),body);
      const controller=world.createCharacterController(settings.offset);
      controller.enableAutostep(settings.autostepHeight,settings.autostepWidth,false);
      controller.enableSnapToGround(settings.snap);controller.setSlideEnabled(true);world.step();
      let grounded=false,vertical=0,contacts=[],disposed=false;
      const step=(dx,dz)=>{
        if(disposed)throw new Error('Postava již byla odstraněna');
        if(grounded)vertical=-0.3;
        vertical=Math.max(-20,vertical-settings.gravity*settings.dt);
        controller.computeColliderMovement(collider,{x:dx,y:vertical*settings.dt,z:dz},undefined,undefined,c=>c.handle!==collider.handle&&activeCollider(c));
        const delta=controller.computedMovement(),p=body.translation();contacts=[];
        for(let i=0;i<controller.numComputedCollisions();i++) {
          const hit=controller.computedCollision(i);
          contacts.push({part:parts.get(hit.collider?.handle)?.id,point:{...hit.witness1},normal:{...hit.normal1}});
        }
        grounded=controller.computedGrounded();if(grounded&&vertical<0)vertical=0;
        body.setNextKinematicTranslation({x:p.x+delta.x,y:p.y+delta.y,z:p.z+delta.z});world.step();
      };
      const walker={
        id:'native-probe-'+body.handle,body,collider,vehicle:false,get position(){return {...body.translation()};},
        settle() {
          for(let i=0;i<75;i++)step(0,0);
          const settled={...body.translation()},overlaps=[];
          world.intersectionsWithShape(settled,{x:0,y:0,z:0,w:1},collider.shape,c=>{overlaps.push(parts.get(c.handle)?.id);return true;},undefined,undefined,collider,undefined,activeCollider);
          const initialFootError=settled.y-expectedFloor(start)-footOffset;
          return {setupValid:Math.abs(initialFootError)<0.07&&overlaps.length===0&&grounded,initialFootError,
            initialRayFootError:settled.y-start.floor-footOffset,overlaps,settled};
        },
        moveTo(target) {
          if(disposed)throw new Error('Postava již byla odstraněna');
          if(![target.x,target.z].every(Number.isFinite) || (target.floor!==null&&!Number.isFinite(target.floor))) throw new Error('Neplatný cíl trasy');
          const origin={...body.translation()},trail=[];
          const budget=Math.ceil(Math.hypot(target.x-origin.x,target.z-origin.z)/settings.speed/settings.dt)+120;
          let passed=false,frame=0;
          for(;frame<budget;frame++) {
            const p=body.translation(),distance=Math.hypot(target.x-p.x,target.z-p.z);
            const amount=Math.min(settings.speed*settings.dt,distance);
            step(distance>1e-7?(target.x-p.x)/distance*amount:0,distance>1e-7?(target.z-p.z)/distance*amount:0);
            const q=body.translation();if(frame%20===0)trail.push({...q});
            if(Math.hypot(target.x-q.x,target.z-q.z)<0.08&&(target.floor===null||Math.abs(q.y-expectedFloor(target)-footOffset)<0.10)&&grounded){passed=true;break;}
          }
          const finish={...body.translation()};
          return {target,passed,frames:frame,finish,remaining:Math.hypot(target.x-finish.x,target.z-finish.z),
            footError:target.floor===null?null:finish.y-expectedFloor(target)-footOffset,
            rayFootError:target.floor===null?null:finish.y-target.floor-footOffset,contacts,trail};
        },
        dispose() {
          if(disposed)return;
          world.removeCharacterController(controller);world.removeRigidBody(body);disposed=true;walkers.delete(walker);
        },
      };
      walkers.add(walker);return walker;
    },
    free() {
      if(freed)return;
      for(const walker of [...walkers])walker.dispose();
      doorPhysics.dispose();
      world.free();freed=true;
    },
  };
}

export async function openModel(args) {
  const bytes=readFileSync(resolve(required(args,'--model'))),model=JSON.parse(bytes);
  const actor=readFileSync(resolve(args.get('--actor-source')??'shared/simulation.ts'),'utf8');
  if(!actor.includes('CHARACTER_RADIUS = 0.25')||!actor.includes('CHARACTER_HALF_HEIGHT = 0.55')||!actor.includes('enableAutostep(0.22, 0.1, false)')) {
    throw new Error('Actor kontrakt se změnil; přejímku je nutné znovu odvodit');
  }
  const profile=required(args,'--profile'),settings=profileSettings(profile,Number(args.get('--speed')??4.6));
  const R=await loadRapier(args.get('--dependency-root'));
  const assumption=doorStateAssumption(model,args.get('--door-state')??'closed-default'),scene=makeScene(R,model,settings);
  try {if(args.has('--door-state'))applyCoverageDoorState(scene,model,assumption);}catch(error){scene.free();throw error;}
  return {scene,metadata:{profile,settings,modelGlbSha256:model.glbSha256,doorStateAssumption:assumption,doorRuntimeSha256:doorRuntimeSha256(),
    modelCollisionSha256:sha256(bytes),actorSourceSha256:sha256(actor),validatorScope:'samostatný Rapier; bez hry, terénu, sítě a GPU'}};
}
export function writeReport(path,report) {
  const target=resolve(path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2));
}
