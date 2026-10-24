import type {TestContext} from "node:test";
import assert from "node:assert/strict";
import {setImmediate as turn} from "node:timers/promises";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {FreeCamera} from "@babylonjs/core/Cameras/freeCamera";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {AvatarPrimitivePool,createAvatarRig} from "../../../client/avatar-renderer";
import {AvatarLodController} from "../../../client/avatar-lod";
import {applyAvatarPreset} from "../../../client/avatar-presets";
import {PlayerFlashlight} from "../../../client/flashlight";
import {DEFAULT_AVATAR} from "../../../shared/types";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

export function localPreparation(t:TestContext){
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera("own preparation caller",new Vector3(0,2,-5),scene);scene.activeCamera=camera;
  const pool=new AvatarPrimitivePool(scene),torch=new PlayerFlashlight(scene),rigs:ReturnType<typeof createAvatarRig>[]=[];
  const add=(preset=4)=>{const config=applyAvatarPreset(preset,DEFAULT_AVATAR),rig=createAvatarRig(scene,config,pool,"actual local "+preset);new AvatarLodController(scene,pool,rig,config);rigs.push(rig);return rig;};
  const rig=add();
  t.after(()=>{torch.dispose();for(const r of rigs)r.root.dispose(false,false);pool.dispose();scene.dispose();engine.dispose();});
  return{engine,scene,camera,pool,torch,rig,add};
}
export async function settleLocal(f:ReturnType<typeof localPreparation>,quality="low"){
  for(let i=0;i<12;i++){
    const status=f.torch.beam.prepareLocalShadow(f.rig.root,f.rig.skinnedBody!.near,quality);
    if(status==="ready")return;
    assert.equal(status,"pending");await turn();
  }
  assert.fail("bounded native local preparation settled");
}
