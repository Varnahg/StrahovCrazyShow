import fs from "node:fs";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {Script} from "node:vm";
import {setImmediate as turn,setTimeout as pause} from "node:timers/promises";
import ts from "typescript";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {Scene} from "@babylonjs/core/scene";
import {FreeCamera} from "@babylonjs/core/Cameras/freeCamera";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {ShadowGenerator} from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import {AvatarPrimitivePool,createAvatarRig} from "../../../client/avatar-renderer";
import {AvatarLodController} from "../../../client/avatar-lod";
import {AvatarAnimator} from "../../../client/animation";
import {applyAvatarPreset} from "../../../client/avatar-presets";
import {PlayerFlashlight} from "../../../client/flashlight";
import {GltfLightBudget} from "../../../client/gltf-light-budget";
import {StableLightState} from "../../../client/stable-light-state";
import {writeVector3} from "../../../client/transform-updates";
import {DEFAULT_AVATAR,DEFAULT_PROFILE} from "../../../shared/types";
import "../../../client/render-shaders";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

const sha=(s:string)=>createHash("sha256").update(s).digest("hex");
// NullEngine URL textures already expose synthetic ready IO. Preserve native
// RawTexture metadata/data, changing only its missing terminal upload readiness.
class IOEngine extends NullEngine {
  override createRawTexture(...args:Parameters<NullEngine["createRawTexture"]>){const t=super.createRawTexture(...args);t.isReady=true;return t;}
}
function originalGame() {
  const source=fs.readFileSync(new URL("../../../client/game.ts",import.meta.url),"utf8"),tree=ts.createSourceFile("game.ts",source,ts.ScriptTarget.Latest,true);
  const cls=tree.statements.find((n):n is ts.ClassDeclaration=>ts.isClassDeclaration(n)&&n.name?.text==="Game")!;
  const names=["makeAvatar","updatePlayers","setProfile","updateAvatarPresentation"];
  const methods=names.map(name=>{const n=cls.members.find(n=>n.name?.getText(tree)===name)!;assert.ok(n,name);return{name,text:n.getText(tree),sha256:sha(n.getText(tree))};});
  const js=ts.transpileModule(`class OriginalMethods{${methods.map(n=>n.text).join("\n")}}`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const make=new Script(`(env)=>{const {createAvatarRig,AvatarLodController,AvatarAnimator,Vector3,writeVector3}=env;${js};return OriginalMethods;}`).runInThisContext();
  return{Game:make({createAvatarRig,AvatarLodController,AvatarAnimator,Vector3,writeVector3}),methods:methods.map(({text,...m})=>m)};
}
export async function withRenderPass<T>(engine:{currentRenderPassId:number},pass:number,work:()=>Promise<T>):Promise<T>{
  const previous=engine.currentRenderPassId;
  try{engine.currentRenderPassId=pass;return await work();}finally{engine.currentRenderPassId=previous;}
}
export async function probe(targeted:boolean,boneTexture=false) {
  const engine=new IOEngine({renderWidth:256,renderHeight:256,textureSize:1,deterministicLockstep:false,lockstepMaxSteps:4});engine.getCaps().instancedArrays=true;
  // Same native Skeleton constructor decision as pinned WebGPU caps. This is
  // an explicit capability seam, not engine.isWebGPU or a shader-define patch.
  if(boneTexture){engine.getCaps().textureFloat=true;engine.getCaps().maxVertexTextureImageUnits=16;}
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera("finite actual native camera",new Vector3(0,2,-5),scene);camera.setTarget(new Vector3(0,1,0));scene.activeCamera=camera;
  new HemisphericLight("finite ambient",Vector3.Up(),scene);
  const pool=new AvatarPrimitivePool(scene),torch=new PlayerFlashlight(scene),budget=new GltfLightBudget(scene),stable=new StableLightState(scene);
  const {Game,methods}=originalGame();
  const profile={...DEFAULT_PROFILE,avatar:applyAvatarPreset(4,DEFAULT_AVATAR)};
  const player={...profile,id:"local",x:0,y:.8,z:0,yaw:0,speed:0,vehicle:false,grounded:true};
  const game:any=Object.assign(new Game(),{scene,avatarPool:pool,avatars:new Map(),localId:"local",localPlayer:player,profile,disposed:false,rendererFailed:false,actor:{vehicle:false,grounded:true},camera,quality:"low",flashlightOn:false,sim:{floorHeight:()=>0},snapshots:{remove(){}},labels:{remove(){}},contactShadows:{remove(){},set(){}}});
  let phase="create",generator:ShadowGenerator|undefined,pass:number|undefined;
  const identities=new WeakMap<object,number>();let next=0;
  const id=(o:any)=>o?(identities.get(o)??(identities.set(o,++next),next)):null;
  const knownEffects=new Map<number,WeakRef<any>>();
  const effectRow=(effect:any)=>{
    if(!effect)return null;knownEffects.set(effect.uniqueId,new WeakRef(effect));
    return{id:effect.uniqueId,context:id(effect._pipelineContext),keySha:sha(effect._key),keyLength:effect._key.length,defines:effect.defines,refCount:effect._refCount,disposed:effect.isDisposed,cacheSame:(engine as any)._compiledEffects[effect._key]===effect};
  };
  const compiler:any[]=[],effectRequests:any[]=[],draws:any[]=[];
  const originalProgram=engine.createShaderProgram;
  engine.createShaderProgram=function(...args){compiler.push({phase,context:id(args[0]),vertexSha:sha(args[1]),fragmentSha:sha(args[2]),definesSha:sha(args[3]??"")});return Reflect.apply(originalProgram,this,args);};
  const originalEffect=engine.createEffect;
  engine.createEffect=function(...args){const result=Reflect.apply(originalEffect,this,args);effectRequests.push({phase,family:typeof args[0]==="string"?args[0]:"object-input",effect:effectRow(result)});return result;};
  const watched=new WeakSet<object>();
  const rig=()=>game.avatars.get("local");
  const watch=()=>{for(const mesh of rig().skinnedBody.near){if(watched.has(mesh))continue;watched.add(mesh);const original=mesh._processRendering;mesh._processRendering=function(...args:any[]){draws.push({phase,mesh:mesh.uniqueId,pass:engine.currentRenderPassId,effect:effectRow(args[2]),instanced:args[5]});return Reflect.apply(original,this,args);};}};
  const snapshot=(label:string)=>({label,phase,torchEnabled:torch.beam.light.isEnabled(),shadowEnabled:torch.beam.light.shadowEnabled,pass,currentPass:engine.currentRenderPassId,root:rig().root.uniqueId,preset:rig().target.avatar.preset,lod:rig().lod.level,registeredMeshes:scene.meshes.length,
    near:rig().skinnedBody.near.map((mesh:any)=>({id:mesh.uniqueId,name:mesh.name,material:mesh.material?.name,skeleton:mesh.skeleton?.uniqueId??null,boneTextureRequested:mesh.skeleton?.useTextureToStoreBoneMatrices,boneTextureUsed:mesh.skeleton?.isUsingTextureForMatrices,influencers:mesh.numBoneInfluencers,enabled:mesh.isEnabled(),registered:scene.meshes.includes(mesh),shadowDepthWrapper:!!mesh.material?.shadowDepthWrapper,submeshes:mesh.subMeshes.map((s:any)=>({id:s._id,main:effectRow(s._drawWrappers?.[camera.renderPassId]?.effect),shadow:pass===undefined?null:effectRow(s._drawWrappers?.[pass]?.effect)}))}))});
  const effectLifecycle=()=>[...knownEffects].map(([effectId,weak])=>{const e=weak.deref();return{effectId,collected:!e,refCount:e?._refCount??null,disposed:e?.isDisposed??null,cacheSame:e?(engine as any)._compiledEffects[e._key]===e:null,keySha:e?sha(e._key):null};});
  const draw=async(label:string,on:boolean,count=1)=>{
    phase=label;game.flashlightOn=on;
    for(let frame=0;frame<count;frame++){
      const own=rig();game.updateAvatarPresentation("local",own,new Vector3(0,0,0),1/60,true);
      torch.update(own,camera,on,false,"low");watch();budget.prepareFrame();stable.update();engine.beginFrame();scene.render();engine.endFrame();await turn();
      const current=torch.beam.light.getShadowGenerator() as ShadowGenerator|null;
      if(current){generator=current;pass=(current.getShadowMap() as any)._objectRenderer._renderPassIds[0];}
    }
  };
  const firstWindow=async(label:string)=>{
    const before=compiler.length;await draw(label,true,3);
    const programs=compiler.slice(before),shadowContexts=new Set(effectRequests.filter(r=>r.phase===label&&r.family==="shadowMap").map(r=>r.effect?.context));
    return{...snapshot(label),programs:programs.length,newShadowPrograms:programs.filter(p=>shadowContexts.has(p.context)).length,draws:draws.filter(d=>d.phase===label),effectRequests:effectRequests.filter(r=>r.phase===label)};
  };
  const report:any={targeted,boneTexture,productionPreparation:true,caps:{textureFloat:engine.getCaps().textureFloat,maxVertexTextureImageUnits:engine.getCaps().maxVertexTextureImageUnits},scope:"Actual Game edit/local presenter + native two rigs/GLSL; no world/WGSL/device/image/performance proof",methods,actualEngineIsWebGPU:engine.isWebGPU,seams:["NullEngine URL texture IO and explicit RawTexture terminal readiness",...(boneTexture?["explicit native bone texture capability branch before Skeleton construction"]:[]),"finite ambient light/camera/flat floor and no world/contact-shadow geometry","bounded original native frame pumping"],snapshots:[]};
  try {
    game.updatePlayers([player]);watch();report.snapshots.push(snapshot("created Mia"));
    await draw("Mia prepared/on",true,8);assert.ok(generator&&pass!==undefined,"original player beam created actual native shadow map");
    report.miaOn=snapshot("Mia prepared/on");report.miaDraws=draws.filter(d=>d.phase==="Mia prepared/on");
    await draw("Mia off",false,3);report.miaOff=snapshot("Mia off");
    const old=rig(),oldRoot=old.root;report.beforeEditLifecycle=effectLifecycle();
    phase="original Game profile edit";game.setProfile({...profile,avatar:applyAvatarPreset(1,DEFAULT_AVATAR)});watch();
    report.edit={oldRoot:oldRoot.uniqueId,oldRootDisposed:oldRoot.isDisposed(),newRoot:rig().root.uniqueId,sameGenerator:torch.beam.light.getShadowGenerator()===generator,oldNear:old.skinnedBody.near.map((m:any)=>({id:m.uniqueId,disposed:m.isDisposed(),submeshes:m.subMeshes.length}))};
    report.snapshots.push(snapshot("Robin created/off before base frame"));
    // Native DrawWrapper deferred disposal waits for immediate then endFrame.
    // These are ordinary OFF base frames; no isReady/getEffect warm-up probes.
    await pause(0);await draw("Robin normal off/base",false,5);report.beforeFirstOn=snapshot("Robin off after base");report.afterEditLifecycle=effectLifecycle();
    if(targeted){
      const saved=engine.currentRenderPassId;report.targeted={savedPass:saved,shadowPass:pass,calls:0,ready:[],lightEnabledBefore:torch.beam.light.isEnabled()};
      phase="explicit targeted preparation";
      try{await withRenderPass(engine,pass!,async()=>{
        for(const mesh of rig().skinnedBody.near)for(const sub of mesh.subMeshes){
          let ready=false;
          for(let attempt=0;attempt<16&&!ready;attempt++){report.targeted.calls++;ready=generator!.isReady(sub,false,mesh.material?.needAlphaBlendingForMesh(mesh)??false);if(!ready)await turn();}
          assert.ok(ready,"bounded original native own-submesh readiness settles");report.targeted.ready.push({mesh:mesh.uniqueId,sub:sub._id,ready});
        }
      });}finally{report.targeted.restoredPass=engine.currentRenderPassId;report.targeted.lightEnabledAfter=torch.beam.light.isEnabled();}
      report.afterTargeted=snapshot("Robin off after explicit targeted experiment");
    }
    report.firstOn=await firstWindow("Robin first on");
    await draw("Robin off after first",false,3);report.repeatOn=await firstWindow("Robin repeat on");
    report.compiler=compiler;report.effectRequests=effectRequests;report.finalLifecycle=effectLifecycle();report.nativeFilter=generator!.filter;report.poisson=generator!.usePoissonSampling;report.supportShadowSamplers=(engine as any)._features.supportShadowSamplers;
    return report;
  }finally{
    engine.createEffect=originalEffect;engine.createShaderProgram=originalProgram;
    torch.dispose();for(const a of game.avatars.values())a.root.dispose(false,false);game.avatars.clear();pool.dispose();stable.dispose();budget.dispose();scene.dispose();engine.dispose();
    assert.equal(scene.meshes.length,0);assert.equal(scene.materials.length,0);
  }
}
export function writeReport(report:any){const dir=process.env.AVATAR_SHADOW_REPORT_DIR;if(!dir)return;assert.match(dir,/avatar-shadow/);fs.writeFileSync(`${dir}/${report.boneTexture?"bone-texture":"default-null"}-${report.targeted?"targeted":"lazy"}.json`,JSON.stringify(report,null,2)+"\n",{flag:"wx"});}
