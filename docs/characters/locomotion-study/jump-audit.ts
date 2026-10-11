/** Aligned Actor/KCC comparison, distinct from the earlier Game-lag probe. */
import { readFileSync,writeFileSync,mkdirSync } from "node:fs";
import {createHash} from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Matrix,Vector3 } from "@babylonjs/core/Maths/math.vector";
import { AvatarPrimitivePool,createAvatarRig } from "../../../client/avatar-renderer";
import { AvatarAnimator } from "../../../client/animation";
import { AvatarAnimator as P3Animator } from "./animation-p3";
import { DEFAULT_AVATAR } from "../../../shared/types";
import { createJumpClip } from "../../../tests/helpers/jump-animation-fixture";

const clip=await createJumpClip({mode:"run",jumpTick:94});
const engine=new NullEngine(),scene=new Scene(engine),pool=new AvatarPrimitivePool(scene);
const rigs=[createAvatarRig(scene,DEFAULT_AVATAR,pool,"P3"),createAvatarRig(scene,DEFAULT_AVATAR,pool,"repaired")];
const animators=[new P3Animator(rigs[0]),new AvatarAnimator(rigs[1])],samples=[];
try {
  for(const frame of clip.frames) {
    const poses=rigs.map((rig,index)=>{
      rig.root.position.set(frame.position.x,frame.position.y,frame.position.z);
      animators[index].update({...frame,groundHeight:(x,z)=>clip.floorHeight(x,z,frame.position.y)},1/60);
      const inverse=Matrix.Invert(rig.root.computeWorldMatrix(true));
      const local=(node:typeof rig.hips)=>{node.computeWorldMatrix(true);return Vector3.TransformCoordinates(node.getAbsolutePosition(),inverse).asArray();};
      return {pelvis:local(rig.hips),left:{hip:local(rig.left),knee:local(rig.leftKnee),ankle:local(rig.leftFoot)},right:{hip:local(rig.right),knee:local(rig.rightKnee),ankle:local(rig.rightFoot)},planted:[animators[index].contacts.left.planted,animators[index].contacts.right.planted]};
    });
    samples.push({...frame,poses});
  }
  const inputs=["client/animation.ts","docs/characters/locomotion-study/animation-p3.ts","tests/helpers/jump-animation-fixture.ts","tests/jump-animation.test.ts","shared/simulation.ts"];
  const result={scope:"Actual Actor.step + stepRigidWorld; position/yaw/grounded/vertical captured after the same tick. Aligned reference, not Game's one-tick presentation lag. CPU FK only, no GPU/FPS.",order:["P3","repair"],inputs:Object.fromEntries(inputs.map(path=>[path,createHash("sha256").update(readFileSync(path)).digest("hex")])),events:{takeoff:clip.takeoff,apex:clip.apex,landing:clip.landing},minimumAirPelvis:[0,1].map(i=>Math.min(...samples.slice(clip.takeoff,clip.landing).map(s=>s.poses[i].pelvis[1]))),apex:samples[clip.apex],firstGrounded:samples[clip.landing],samples};
  const directory="docs/verification-evidence/jump-animation-20261011";
  mkdirSync(directory,{recursive:true});writeFileSync(directory+"/aligned-cpu-audit.json",JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({events:result.events,minimumAirPelvis:result.minimumAirPelvis,apex:result.apex,firstGrounded:result.firstGrounded}));
} finally {for(const rig of rigs)rig.root.dispose();pool.dispose();scene.dispose();engine.dispose();clip.dispose();}
