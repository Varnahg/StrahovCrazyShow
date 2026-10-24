import fs from "node:fs";
import assert from "node:assert/strict";
import {setImmediate as turn} from "node:timers/promises";
import {NullEngine} from "@babylonjs/core/Engines/nullEngine";
import {InternalTexture,InternalTextureSource} from "@babylonjs/core/Materials/Textures/internalTexture";
import {Scene} from "@babylonjs/core/scene";
import {FreeCamera} from "@babylonjs/core/Cameras/freeCamera";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {StandardMaterial} from "@babylonjs/core/Materials/standardMaterial";
import {DirectionalLight} from "@babylonjs/core/Lights/directionalLight";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Light} from "@babylonjs/core/Lights/light";
import {AuthoredLightPreparation} from "../../../client/authored-light-preparation";
import {CinematicAtmosphere} from "../../../client/cinematic";
import {GltfLightBudget} from "../../../client/gltf-light-budget";
import {StableLightState} from "../../../client/stable-light-state";
import {VehicleLighting} from "../../../client/vehicle-lighting";
import {PlayerFlashlight} from "../../../client/flashlight";
import {prepareLightVariants} from "../../../client/light-preparation";
import {prepareRenderQualities} from "../../../client/render-quality-preparation";
import {MANUAL_HARDWARE_SCALING} from "../../../shared/render-quality";
import {arePreparationEffectsReady} from "../../../client/strict-material-preparation";
import {applyArtLighting} from "../../../client/art-lighting";
import {selectLightingPreview} from "../../../client/lighting-preview";
import {sunState,moonState} from "../../../shared/weather";
import {clampOrbitPitch} from "../../../client/camera-look";
import {sources,gameClass,methodProof,sha} from "./production";
import "../../../client/render-shaders";

/** CPU terminal IO only, same seams as the existing authored factory test. */
class IOEngine extends NullEngine {
  override createCanvas(width:number,height:number):any {
    const gradient={addColorStop(){}};const canvas:any={width,height,remove(){}};
    const context=new Proxy({canvas,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:(text:string)=>({width:text.length*8})} as any,{get:(target,key)=>key in target?target[key]:()=>{},set:(target,key,value)=>{target[key]=value;return true;}});
    canvas.getContext=()=>context;return canvas;
  }
  override updateDynamicTexture(texture:InternalTexture,..._args:any[]){texture.isReady=true;}
  override createRawCubeTexture(...args:Parameters<NullEngine["createRawCubeTexture"]>){const texture=new InternalTexture(this,InternalTextureSource.CubeRaw);texture.isCube=texture.isReady=true;texture.width=texture.height=texture.baseWidth=texture.baseHeight=args[1];texture.generateMipMaps=args[4]??false;texture.samplingMode=args[6]??3;return texture;}
  override updateRawCubeTexture(..._args:any[]){}
}
const spawn={x:110,y:-2.1440000534057617,z:12};
const b6Pose={x:6.9229,y:2.6183,z:-30.5524};
const night=Date.parse("2026-10-23T22:00:00Z");
export async function probe(storage:"native-null-mono"|"webgpu-perpass-branch") {
  methodProof.length=0;
  const engine=new IOEngine({renderWidth:256,renderHeight:256,textureSize:1,deterministicLockstep:false,lockstepMaxSteps:4});engine.getCaps().textureLOD=true;engine.getCaps().instancedArrays=true;
  const scene=new Scene(engine);scene.useRightHandedSystem=true;scene.fogMode=Scene.FOGMODE_EXP;scene.fogDensity=.0018;
  const budget=new GltfLightBudget(scene);let product:Awaited<ReturnType<typeof sources>>|undefined;
  let callback:(()=>void)|undefined,game:any,beam:VehicleLighting|undefined,torch:PlayerFlashlight|undefined,stable:StableLightState|undefined,cinematic:CinematicAtmosphere|undefined;
  const report:any={storage,actualEngineIsWebGPU:engine.isWebGPU,gameRoutingIsWebGPU:true,language:"GLSL",scope:"finite original producers/Game stage chain; no GPU/WGSL/pixels/performance proof",stages:[],replays:[],seams:["synthetic canvas and texture upload","partial B6 constructor: original light statements, no structural geometry","actual sink GLB and two original floor0 placements","one original road bus recipe","synthetic local rig/camera collision and two Standard calibration casters","manual original render-loop pump","synthetic sky terminal atmosphere with actual astronomy"]};
  try {
    product=await sources(scene);const target=product.target;
    if(storage==="webgpu-perpass-branch")for(const mesh of target)(mesh as any)._instanceDataStorage.useMonoDataStorageRenderPass=false;
    const camera=new FreeCamera("probe actual pass",new Vector3(spawn.x,spawn.y+2,spawn.z+8),scene);camera.maxZ=1000;scene.activeCamera=camera;
    const sun=new DirectionalLight("celestial",Vector3.Down(),scene),ambient=new HemisphericLight("sky",Vector3.Up(),scene);
    const car=new TransformNode("car calibration root",scene),parked=new TransformNode("parked calibration root",scene);car.position.set(spawn.x,spawn.y-.8,spawn.z);car.setEnabled(false);
    const root=new TransformNode("local presentation seam",scene),elbow=new TransformNode("elbow presentation seam",scene);elbow.parent=root;elbow.position.y=1.3;elbow.rotation.x=-Math.PI/2;root.position.set(spawn.x,spawn.y-.8,spawn.z);
    const actor={position:{...spawn},yaw:0,vehicle:false},rig={root,rightElbow:elbow,eyeHeight:1.63,bodyHeight:1.8,measurements:{legSpacing:.105},target:{id:"local",vehicle:false}};
    const lights=[0,1].map(i=>{const l=new PointLight("mapped lamp seam "+i,new Vector3(spawn.x+i,spawn.y+3,spawn.z+3),scene);l.falloffType=Light.FALLOFF_STANDARD;l.range=22;return l;});
    for(const [i,pos] of [spawn,b6Pose].entries()){const box=MeshBuilder.CreateBox("calibration caster "+i,{size:.5},scene);box.position.set(pos.x,pos.y+1,pos.z-3);box.material=new StandardMaterial("calibration caster material "+i,scene);box.metadata={probeCalibrationCaster:true};}
    cinematic=new CinematicAtmosphere(scene,camera,sun);stable=new StableLightState(scene);beam=new VehicleLighting(scene);torch=new PlayerFlashlight(scene);
    const skyMaterial=new StandardMaterial("sky terminal IO",scene);skyMaterial.disableLighting=true;skyMaterial.disableDepthWrite=true;skyMaterial.backFaceCulling=false;
    let stage="",draws:any[]=[],selection:any=null,programs=0;
    const originalProgram=engine.createShaderProgram;engine.createShaderProgram=function(...args){programs++;return Reflect.apply(originalProgram,this,args);};
    class ObservedAuthored extends AuthoredLightPreparation {override begin(){const stop=super.begin();selection={...this.selection};return()=>{stop();selection=null;};}}
    const routing={isWebGPU:true,get currentRenderPassId(){return engine.currentRenderPassId;},set currentRenderPassId(v){engine.currentRenderPassId=v;},runRenderLoop(next:()=>void){assert.equal(callback,undefined);callback=next;},stopRenderLoop(next:()=>void){if(callback===next)callback=undefined;},getHardwareScalingLevel:()=>engine.getHardwareScalingLevel(),setHardwareScalingLevel:(s:number)=>engine.setHardwareScalingLevel(s)};
    const Game=gameClass({AuthoredLightPreparation:ObservedAuthored,PlayerFlashlight,Vector3,MeshBuilder,prepareLightVariants,prepareRenderQualities,MANUAL_HARDWARE_SCALING,arePreparationEffectsReady:()=>arePreparationEffectsReady(engine),selectLightingPreview:(mode:any)=>selectLightingPreview(mode,night),applyArtLighting,clampOrbitPitch,performance,window:{setTimeout,clearTimeout},document:{hidden:false,addEventListener(){},removeEventListener(){},pointerLockElement:null}});
    const requested=Object.freeze({quality:"medium",revision:7,hardwareScaling:1});
    game=Object.assign(new Game(),{engine:routing,scene,camera,sun,ambient,lights,lamps:new StandardMaterial("lamp IO",scene),clouds:[],car,parkedCar:parked,vehicleLighting:beam,flashlight:torch,cinematic,stableLights:stable,gltfLightBudget:budget,b6Reality:product.b6,actor,localId:"local",avatars:new Map([["local",rig]]),quality:"medium",adaptive:{state:requested},profile:Object.freeze({preset:4}),weather:Object.freeze({cloud:.86,rain:0,wind:.9}),timeOverride:night,flashlightOn:false,disposed:false,rendererFailed:false,firstPerson:false,yaw:Math.PI,pitch:.28,distance:8,cameraArm:20,vehicleCameraSnap:true,sim:{cameraDistance:(a:Vector3,b:Vector3)=>Vector3.Distance(a,b)},renderHealth:{snapshot:()=>({errorCount:0,pendingPreparationOperations:0,phase:"preparing"})},compilationProfile:{setStage(v:string){stage=v;}},skyWeather:{atmosphere:{material:skyMaterial,update(){},dispose(){}},update:({instant}:{instant:number})=>({sun:sunState(instant),moon:moonState(instant),wind:{x:0,z:0}})},localAvatarPresentation:{update:()=>({visible:true,cameraLight:false,resetAnimation:false})},updateAvatarPresentation(){}});
    const ids=new WeakMap<object,number>();let id=0;const objectId=(o:any)=>o?(ids.get(o)??(ids.set(o,++id),id)):null;
    const effects=new Map<number,WeakRef<any>>();
    for(const source of target){const original=(source as any)._processRendering;(source as any)._processRendering=function(...args:any[]){if(engine.currentRenderPassId===camera.renderPassId){const batch=args[4];draws.push({source:source.uniqueId,hardware:args[5],visibleInstances:batch?.visibleInstances?.[args[1]._id]?.map((x:any)=>x.uniqueId)??null,renderSelf:batch?.renderSelf?.[args[1]._id]??null});}return Reflect.apply(original,this,args);};}
    const captureFamily=(mesh:Mesh)=>{
      const wrapper=(mesh.subMeshes[0] as any)?._drawWrappers?.[camera.renderPassId],effect=wrapper?.effect,context=effect?._pipelineContext;
      if(effect)effects.set(effect.uniqueId,new WeakRef(effect));
      const bufferKinds=mesh.getVerticesDataKinds();
      return {
        source:mesh.uniqueId,name:mesh.name,material:mesh.material?.name,parent:mesh.parent?.name??null,parentEnabled:mesh.parent?.isEnabled()??null,
        ownEnabled:mesh.isEnabled(false),enabled:mesh.isEnabled(),decl:mesh.metadata?.authoredLightReceiver,registered:scene.meshes.includes(mesh),sourceVisible:mesh.isVisible,receiveShadows:mesh.receiveShadows,
        batch:draws.filter(d=>d.source===mesh.uniqueId),
        instances:mesh.instances.map(i=>({id:i.uniqueId,registered:scene.meshes.includes(i),enabled:i.isEnabled(),attached:i.metadata?.b6PreparationAttachment?.attached??null,always:i.alwaysSelectAsActiveMesh})),
        mono:(mesh as any)._instanceDataStorage.useMonoDataStorageRenderPass,bufferKinds,
        buffers:bufferKinds.map(k=>{const b=mesh.getVertexBuffer(k)!;return{kind:k,type:b.type,normalized:b.normalized,divisor:b.instanceDivisor};}),
        geometryKinds:mesh.getVerticesDataKinds(true),geometryBuffers:mesh.getVerticesDataKinds(true).map(k=>{const b=mesh.getVertexBuffer(k,true)!;return{kind:k,type:b.type,divisor:b.instanceDivisor};}),
        effectId:effect?.uniqueId??null,contextId:objectId(context),disposed:effect?.isDisposed??null,defines:effect?.defines??null,definesSha:effect?sha(effect.defines):null,
        keySha:effect?sha(effect._key):null,keyLength:effect?effect._key.length:null,cacheSame:effect?(engine as any)._compiledEffects[effect._key]===effect:null,
      };
    };
    const capture=(label:string)=>({label,stage,quality:game.quality,programs,selection:selection?{...selection}:null,pose:{...actor.position},camera:camera.position.asArray(),
      lights:scene.lights.filter(l=>l.isEnabled()).map(l=>({id:l.uniqueId,name:l.name,type:l.getTypeID(),shadow:l.shadowEnabled,falloff:l.falloffType})),families:target.map(captureFamily)});
    const stageRows:any[]=[],stageMap=new Map<string,any>();
    const draw=()=>{
      budget.prepareFrame();stable!.update();draws=[];engine.beginFrame();scene.render();engine.endFrame();
      const key=game.quality+"/"+stage,row=capture(stage);stageMap.set(key,row);
      if(stageRows.at(-1)?.key===key)stageRows[stageRows.length-1]={...row,key};else stageRows.push({...row,key});
    };
    report.factory={asset:product.asset,placements:product.placements,sign:product.sign,targets:target.map(m=>({id:m.uniqueId,name:m.name,material:m.material?.name,vertices:m.getTotalVertices(),indices:m.getTotalIndices(),instances:m.instances.length}))};
    game.updateWorldPresentation(actor.position);game.updateCameraFollow(new Vector3(spawn.x,spawn.y,spawn.z),rig.eyeHeight,1);
    let done=false;const pending=game.prepareLighting(draw);pending.then(()=>done=true,()=>done=true);
    const stopAt=performance.now()+35000;
    while(!done&&performance.now()<stopAt){callback?.();await turn();}
    assert.ok(done,"finite whole preparation completed inside diagnostic guard");report.preparation=await pending;report.stages=stageRows.slice();report.uniqueStageCount=stageMap.size;report.restored=capture("after preparation");
    await turn();engine.beginFrame();engine.endFrame();await turn();
    report.effectsAfterDeferred=[...effects].map(([effectId,weak])=>{const effect=weak.deref();return{effectId,collected:!effect,disposed:effect?.isDisposed??null,cacheSame:effect?(engine as any)._compiledEffects[effect._key]===effect:null};});
    actor.position={...b6Pose};root.position.set(b6Pose.x,b6Pose.y-.8,b6Pose.z);game.yaw=.0084;game.pitch=-.012;
    for(const quality of ["low","medium"] as const){game.applyRenderQuality(quality,MANUAL_HARDWARE_SCALING[quality]);game.updateWorldPresentation(actor.position);game.updateCameraFollow(new Vector3(b6Pose.x,b6Pose.y,b6Pose.z),rig.eyeHeight,1);
      for(const on of [false,true,false,true]){game.flashlightOn=on;game.updateRenderEnvironment(actor.position,rig,false,0,0,night,on);stage="replay-"+(on?"on":"off");const before=programs;let last:any;
        for(let n=0;n<3;n++){draw();await turn();last=capture(stage);}report.replays.push({...last,newPrograms:programs-before});}
    }
    // Separate explicit diagnostic front views. The actual recorded B6 pose
    // above is retained even when a particular finite subset lies off-camera.
    // Do not call a zero-draw replay cache reuse. These views use the real world
    // transforms and camera-directed first-person flashlight path, no receiver
    // flags, material/geometry/light-policy edits or extra readiness calls.
    report.frontViews=[];
    const sink=target[0].instances[0],road=target[3].instances[0];
    for(const [view,instance,visibleSources] of [["sink-front",sink,target.slice(0,3)],["road-front",road,[target[3]]]] as const){
      instance.computeWorldMatrix(true);const center=instance.getBoundingInfo().boundingBox.centerWorld.clone();
      actor.position={x:center.x,y:center.y+.8,z:center.z-4};root.position.set(actor.position.x,actor.position.y-.8,actor.position.z);game.firstPerson=true;
      for(const quality of ["low","medium"] as const){
        game.applyRenderQuality(quality,MANUAL_HARDWARE_SCALING[quality]);game.updateWorldPresentation(actor.position);
        camera.position.set(center.x,center.y+.2,center.z-4);camera.setTarget(center);camera.getViewMatrix(true);
        for(const on of [false,true,false,true]){
          game.flashlightOn=on;game.updateRenderEnvironment(actor.position,rig,true,0,0,night,on);stage=`${view}-${on?"on":"off"}`;
          const before=programs,frames:any[]=[];
          for(let n=0;n<3;n++){draw();frames.push(capture(stage));await turn();}
          report.frontViews.push({view,quality,on,newPrograms:programs-before,expectedSources:visibleSources.map(x=>x.uniqueId),frames});
        }
      }
    }
    report.final=capture("final");report.methods=methodProof.slice();
    return report;
  }finally{
    game?.cancelLightPreparation?.();torch?.dispose();beam?.dispose();stable?.dispose();cinematic?.dispose();product?.dispose();budget.dispose();scene.dispose();engine.dispose();assert.equal(callback,undefined,"original loop released");assert.equal(scene.meshes.length,0);
  }
}

export function writeProbe(report:unknown,name:string){const dir=process.env.RECEIVER_CHAIN_REPORT_DIR;if(!dir)return;assert.match(dir,/receiver-stage-chain/);fs.writeFileSync(`${dir}/${name}.json`,JSON.stringify(report,null,2)+"\n",{flag:"wx"});}
