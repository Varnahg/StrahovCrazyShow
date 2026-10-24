// Sdílená izolovaná CPU přejímka stavebního modelu. Nespouští hru ani GPU.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
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
  const bodies={current:[0.42,0.38,0.20],'cad-candidate':[0.28,0.52,0.10],'cad-compact':[0.25,0.55,0.10],'cad-plan':[0.25,0.55,0.10]};
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
export async function loadRapier(dependencyRoot=process.cwd()) {
  const require=createRequire(resolve(dependencyRoot,'package.json'));
  const R=require('@dimforge/rapier3d-compat');
  await R.init();
  return R;
}

export function makeScene(R,model,settings) {
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
  const world=new R.World({x:0,y:-settings.gravity,z:0});world.timestep=settings.dt;
  const parts=new Map();const walkers=new Set();
  try {
    for(const part of model.parts) {
      const collider=world.createCollider(R.ColliderDesc.trimesh(Float32Array.from(part.positions),Uint32Array.from(part.indices),R.TriMeshFlags.FIX_INTERNAL_EDGES));
      parts.set(collider.handle,part);
    }
    world.step();
  } catch(error) { world.free();throw error; }
  const local=([x,y])=>({x:-(y-model.cadOrigin[1]),z:-(x-model.cadOrigin[0])});
  const supports=c=>['slab','stair','stair-landing'].includes(parts.get(c.handle)?.role);
  const footOffset=settings.radius+settings.halfHeight+settings.offset;
  const capsule=new R.Capsule(settings.halfHeight,settings.radius);
  const expectedFloor=point=>point.support?.capsuleFootHeight??point.floor;
  let freed=false;
  return {
    R,world,model,settings,parts,local,
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
        controller.computeColliderMovement(collider,{x:dx,y:vertical*settings.dt,z:dz},undefined,undefined,c=>c.handle!==collider.handle);
        const delta=controller.computedMovement(),p=body.translation();contacts=[];
        for(let i=0;i<controller.numComputedCollisions();i++) {
          const hit=controller.computedCollision(i);
          contacts.push({part:parts.get(hit.collider?.handle)?.id,point:{...hit.witness1},normal:{...hit.normal1}});
        }
        grounded=controller.computedGrounded();if(grounded&&vertical<0)vertical=0;
        body.setNextKinematicTranslation({x:p.x+delta.x,y:p.y+delta.y,z:p.z+delta.z});world.step();
      };
      const walker={
        settle() {
          for(let i=0;i<75;i++)step(0,0);
          const settled={...body.translation()},overlaps=[];
          world.intersectionsWithShape(settled,{x:0,y:0,z:0,w:1},collider.shape,c=>{overlaps.push(parts.get(c.handle)?.id);return true;},undefined,undefined,collider);
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
      world.free();freed=true;
    },
  };
}

export async function openModel(args) {
  const bytes=readFileSync(resolve(required(args,'--model'))),model=JSON.parse(bytes);
  const actor=readFileSync(resolve(args.get('--actor-source')??'shared/simulation.ts'),'utf8');
  if(!actor.includes('CHARACTER_RADIUS = 0.42')||!actor.includes('CHARACTER_HALF_HEIGHT = 0.38')||!actor.includes('enableAutostep(0.22, 0.2, false)')) {
    throw new Error('Actor kontrakt se změnil; přejímku je nutné znovu odvodit');
  }
  const profile=required(args,'--profile'),settings=profileSettings(profile,Number(args.get('--speed')??4.6));
  const R=await loadRapier(args.get('--dependency-root'));
  return {scene:makeScene(R,model,settings),metadata:{profile,settings,modelGlbSha256:model.glbSha256,
    modelCollisionSha256:sha256(bytes),actorSourceSha256:sha256(actor),validatorScope:'samostatný Rapier; bez hry, terénu, sítě a GPU'}};
}
export function writeReport(path,report) {
  const target=resolve(path);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,JSON.stringify(report,null,2));
}
