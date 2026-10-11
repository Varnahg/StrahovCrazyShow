import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AvatarAnimator } from '../../../client/animation';
import { AvatarPrimitivePool, createAvatarRig } from '../../../client/avatar-renderer';
import { DEFAULT_AVATAR } from '../../../shared/types';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const series=(a:number[])=>({min:Math.min(...a),max:Math.max(...a),range:Math.max(...a)-Math.min(...a),mean:a.reduce((s,v)=>s+v,0)/a.length,maxDelta:Math.max(...a.slice(1).map((v,i)=>Math.abs(v-a[i])))});
function audit(speed:number,fps:number,kind:string) {
 const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
 const pool=new AvatarPrimitivePool(scene),rig=createAvatarRig(scene,DEFAULT_AVATAR,pool),animator=new AvatarAnimator(rig);
 const floor=(x:number,z:number)=>kind==='slope'?.12*z:kind==='stairs'?.15*Math.floor(Math.max(0,z)/.35):0;
 const hips:number[]=[],heads:number[]=[],worldHeads:number[]=[],lhands:number[]=[],rhands:number[]=[],errors:number[]=[],swingErrors:number[]=[],footY:number[]=[];let planted=0,maxRootError=0,previousPhase=0,cycles=0;
 for(let frame=0;frame<=fps*6;frame++){
  const time=frame/fps,z=speed*time,y=floor(0,z),position={x:0,y,z};rig.root.position.set(0,y,z);
  animator.update({position,yaw:0,grounded:true,groundHeight:floor},1/fps);rig.root.computeWorldMatrix(true);
  if(frame<=fps)continue;
  if(animator.phase<previousPhase)cycles++;previousPhase=animator.phase;
  for(const node of [rig.hips,rig.head,rig.leftElbow,rig.rightElbow,rig.leftFoot,rig.rightFoot])node.computeWorldMatrix(true);
  hips.push(rig.hips.getAbsolutePosition().y-y);heads.push(rig.head.getAbsolutePosition().y-y);worldHeads.push(rig.head.getAbsolutePosition().y);
  lhands.push(Vector3.TransformCoordinates(new Vector3(0,-.275,0),rig.leftElbow.getWorldMatrix()).z-z);
  rhands.push(Vector3.TransformCoordinates(new Vector3(0,-.275,0),rig.rightElbow.getWorldMatrix()).z-z);
  maxRootError=Math.max(maxRootError,Math.abs(rig.root.position.y-y));
  for(const [contact,foot]of [[animator.contacts.left,rig.leftFoot],[animator.contacts.right,rig.rightFoot]]as const){
   const actual=foot.getAbsolutePosition();footY.push(actual.y-floor(actual.x,actual.z)-rig.measurements.ankleHeight*rig.root.scaling.y);
   if(contact.planted){errors.push(Vector3.Distance(actual,new Vector3(contact.anchor.x,contact.anchor.y,contact.anchor.z)));planted++;}else swingErrors.push(Vector3.Distance(actual,new Vector3(contact.target.x,contact.target.y,contact.target.z)));
  }
 }
 const result={speed,fps,kind,hip:series(hips),head:series(heads),worldHead:series(worldHeads),leftHandForward:series(lhands),rightHandForward:series(rhands),maxRootError,maxContactError:Math.max(...errors),maxSwingError:Math.max(...swingErrors),minAnkleClearance:Math.min(...footY),plantedSamples:planted,cyclesIn5Seconds:cycles};
 rig.root.dispose();pool.dispose();scene.dispose();engine.dispose();return result;
}
const output=process.argv[2]??'.cache/locomotion-study/before.json';mkdirSync(output.slice(0,output.lastIndexOf('/')),{recursive:true});
const result={recordedAt:new Date().toISOString(),sourceSha256:createHash('sha256').update(readFileSync('client/animation.ts')).digest('hex'),note:'CPU transform/kinematic audit; no GPU, no claim of visual quality or game FPS. Hip/head heights are relative to prescribed root floor. Hand pivot is 27.5 cm below elbow.',scenarios:['flat','slope','stairs'].flatMap(kind=>[1.8,4.6,7].flatMap(speed=>[30,60,144].map(fps=>audit(speed,fps,kind))))};
writeFileSync(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.scenarios.filter(s=>s.fps===60),null,2));
