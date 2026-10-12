import "../../../client/render-shaders";
import {Engine} from "@babylonjs/core/Engines/engine";
import {Scene} from "@babylonjs/core/scene";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {Vector3,Matrix,Quaternion} from "@babylonjs/core/Maths/math.vector";
import {Color3,Color4} from "@babylonjs/core/Maths/math.color";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {Material} from "@babylonjs/core/Materials/material";
import {MaterialPluginBase} from "@babylonjs/core/Materials/materialPluginBase";
import {Texture} from "@babylonjs/core/Materials/Textures/texture";
import {LoadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {DirectionalLight} from "@babylonjs/core/Lights/directionalLight";
import type {UniformBuffer} from "@babylonjs/core/Materials/uniformBuffer";
import {sunState,moonState} from "../../../shared/weather";
import {sampleArtLighting} from "../../../client/art-lighting";
import {grassSource} from "../../../.cache/grass-realism-study/baseline-geometry";
import {createGrassMaterial} from "../../../.cache/grass-realism-study/baseline-material";
import {studyPoints} from "./scatter";
import {projectStudyBeds,STUDY_BEDS} from "./bed-projection";
import {configureSourceGrassMaterial} from "./source-material";
import {createSourceTuftMesh,compareSourceTuftAttributes} from "./source-geometry";

const canvas=document.querySelector<HTMLCanvasElement>("#view")!,report=document.querySelector<HTMLElement>("#report")!;
const query=new URLSearchParams(location.search),asset=query.get("asset")==="grass_medium_01"?"grass_medium_01":"grass_medium_02";
const profile=asset==="grass_medium_01"&&["short","authored","authored-v2"].includes(query.get("profile")??"")?query.get("profile")!:"medium";
const short=profile!=="medium",authored=profile.startsWith("authored"),distribution=query.get("distribution")==="lawn"?"lawn":"grid",scatterSeed=0x51a6b6;
const sourceRoot=asset==="grass_medium_01"?"/candidates/grass_medium_01/source-highest":"/source",resolution=asset==="grass_medium_01"?"8k":"4k";
const sourceURL=asset==="grass_medium_01"?`/candidates/grass_medium_01/derived/grass-${profile==="medium"?"mowed":profile}-study.json`:"/derived/grass-mowed-study.json";
const assetSelect=document.querySelector<HTMLSelectElement>("#asset")!;assetSelect.value=asset;assetSelect.addEventListener("change",()=>{const url=new URL(location.href);url.searchParams.set("asset",assetSelect.value);location.href=url.href;});
for(const[id,value]of[["profile",profile],["distribution",distribution]]){const select=document.querySelector<HTMLSelectElement>(`#${id}`)!;select.value=value;select.addEventListener("change",()=>{const url=new URL(location.href);url.searchParams.set(id,select.value);location.href=url.href;});}
(document.querySelector("#profile")as HTMLSelectElement).disabled=asset!=="grass_medium_01";
(document.querySelector('#shading option[value="native"]')as HTMLOptionElement).disabled=authored;
const engine=new Engine(canvas,true,{powerPreference:"high-performance",preserveDrawingBuffer:true,stencil:true});
const scene=new Scene(engine);scene.useRightHandedSystem=true;
const camera=new ArcRotateCamera("study camera",-Math.PI/2,1.18,4.3,new Vector3(0,.05,0),scene);camera.minZ=.01;camera.lowerRadiusLimit=.25;camera.upperRadiusLimit=12;camera.wheelPrecision=55;camera.attachControl(canvas,true);
const sun=new DirectionalLight("same physical key for both beds",new Vector3(.4,-1,.2),scene),ambient=new HemisphericLight("same hemisphere",Vector3.Up(),scene);
const state={time:0,windX:4,windZ:0,playerX:0,playerY:1,playerZ:3,range:99};
let shading="pbr";
let errorCount=0;const textureErrors:string[]=[];
engine.onEffectErrorObservable.add(event=>{errorCount++;console.error(event);});
const textures=new Map<string,Texture>();
function texture(path:string,gamma:boolean){const key=path+gamma;if(textures.has(key))return textures.get(key)!;const t=new Texture(path,scene,false,false,Texture.TRILINEAR_SAMPLINGMODE,undefined,(_message)=>textureErrors.push(path));t.gammaSpace=gamma;t.wrapU=t.wrapV=Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=8;textures.set(key,t);return t;}
const source=await fetch(sourceURL).then(r=>{if(!r.ok)throw Error("Study geometry unavailable: "+sourceURL);return r.json();});
const authorRecipe=asset==="grass_medium_01"?await fetch("/candidates/grass_medium_01/author-material-recipe.json").then(r=>r.json()):null;
const points=studyPoints(distribution,short,source.tufts.length,scatterSeed);
const variantCounts=Array<number>(source.tufts.length).fill(0);for(const point of points)variantCounts[point.variant]++;
const selectedVariantCounts=source.tufts.map((t:any,i:number)=>({id:t.id,count:variantCounts[i]}));
const albedo=texture(`${sourceRoot}/textures/${asset}_diff_${resolution}.jpg`,true),alpha=texture(`${sourceRoot}/textures/${asset}_alpha_${resolution}.png`,false),normal=texture(`${sourceRoot}/textures/${asset}_nor_gl_${resolution}.jpg`,false),arm=texture(`${sourceRoot}/textures/${asset}_arm_${resolution}.jpg`,false);
const normalStrength=source.normalStrength??.7;
alpha.getAlphaFromRGB=true;normal.level=normalStrength;
const sourceMaps={albedo,alpha,normal,arm};
class StudyWind extends MaterialPluginBase{
 constructor(material:PBRMaterial,private height:number){super(material,"CacheOnlySourceGrassWind",220,{},true,true);}
 override getUniforms(){return {ubo:[{name:"studyWind",size:4,type:"vec4"}],vertex:"uniform vec4 studyWind;"};}
 override bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat4("studyWind",state.time,state.windX,state.windZ,this.height);}
 override getCustomCode(type:string){return type==="vertex"?{CUSTOM_VERTEX_UPDATE_WORLDPOS:`float h=clamp((positionUpdated.y+0.002)/studyWind.w,0.0,1.0);float gust=sin(studyWind.x*.85+worldPos.x*1.7+worldPos.z*1.1)*.55+sin(studyWind.x*1.9+worldPos.z*2.1)*.22;worldPos.xz+=studyWind.yz*gust*h*h*.004;vPositionW=worldPos.xyz;`}:null;}
}
class StudyCoverage extends MaterialPluginBase{
 constructor(material:PBRMaterial){super(material,"CacheOnlyOriginalBlackAtlasCoverage",225,{},true,true);}
 override getUniforms(){return{ubo:[{name:"studyCoverage",size:1,type:"float"}],fragment:"uniform float studyCoverage;"};}
 override bindForSubMesh(buffer:UniformBuffer){buffer.updateFloat("studyCoverage",shading==="coverage"?1:0);}
 override getCustomCode(type:string){return type==="fragment"?{CUSTOM_FRAGMENT_UPDATE_ALBEDO:`
 #if defined(ALBEDO) && defined(OPACITY)
 if(studyCoverage>0.5){float coverage=clamp(getLuminance(opacityMap.rgb),0.45,1.0);
 #ifdef GAMMAALBEDO
 surfaceAlbedo=vAlbedoColor.rgb*toLinearSpace(clamp(albedoTexture.rgb/coverage,0.0,1.0))*albedoInfos.y;
 #else
 surfaceAlbedo=vAlbedoColor.rgb*clamp(albedoTexture.rgb/coverage,0.0,1.0)*albedoInfos.y;
 #endif
 }
 #endif
 `}:null;}
}
const groundMaterial=new PBRMaterial("generic common ground; identical for both beds",scene);
groundMaterial.albedoTexture=texture("/public/textures/surfaces/Grass001_1K-JPG_Color.jpg",true);groundMaterial.bumpTexture=texture("/public/textures/surfaces/Grass001_1K-JPG_NormalGL.jpg",false);groundMaterial.bumpTexture.level=.3;groundMaterial.metallicTexture=texture("/public/textures/surfaces/Grass001_1K-JPG_Roughness.jpg",false);groundMaterial.metallic=0;groundMaterial.roughness=1;groundMaterial.useRoughnessFromMetallicTextureAlpha=false;groundMaterial.useRoughnessFromMetallicTextureGreen=true;groundMaterial.useMetallnessFromMetallicTextureBlue=false;
groundMaterial.specularIntensity=.27;
for(const map of[groundMaterial.albedoTexture,groundMaterial.bumpTexture,groundMaterial.metallicTexture])if(map instanceof Texture)map.uScale=map.vScale=2/1.4;
for(const x of[-1.25,1.25]){const ground=MeshBuilder.CreateGround("same two-metre study plane",{width:2,height:2},scene);ground.position.x=x;ground.material=groundMaterial;ground.receiveShadows=true;}
const baseline=grassSource(scene,createGrassMaterial(scene,state));baseline.isVisible=true;
function matrices(centre:number,pick:(i:number)=>boolean){const data:number[]=[];for(const[i,point]of points.entries())if(pick(i)){const matrix=Matrix.Compose(new Vector3(1,1,1),Quaternion.RotationYawPitchRoll(point.yaw,0,0),new Vector3(centre+point.x,0,point.z));data.push(...matrix.asArray());}return new Float32Array(data);}
const baselineMatrices=matrices(-1.25,()=>true);for(let i=0;i<baselineMatrices.length;i+=16){for(const index of[0,1,2,4,5,6,8,9,10])baselineMatrices[i+index]*=.12;}baseline.thinInstanceSetBuffer("matrix",baselineMatrices,16,true);
const meshes:Mesh[]=[];
const nativeMeshes:Mesh[]=[],nativeChecks:any[]=[];let nativeLoading=false,nativeError="";
for(const[variant,tuft]of source.tufts.entries()){
 const mesh=createSourceTuftMesh(scene,tuft),material=new PBRMaterial("original masked PBR "+tuft.id,scene);
 configureSourceGrassMaterial(material,sourceMaps,authorRecipe,"pbr");new StudyWind(material,tuft.targetExtentMetres);new StudyCoverage(material);mesh.material=material;mesh.thinInstanceSetBuffer("matrix",matrices(1.25,i=>points[i].variant===variant),16,true);meshes.push(mesh);
}
async function ensureNative(){
 if(nativeMeshes.length||nativeLoading)return;
 nativeLoading=true;
 try{const container=await LoadAssetContainerAsync(`${sourceRoot}/${asset}_${resolution}.gltf`,scene);container.addAllToScene();
  for(const mesh of container.meshes.filter(m=>m.getTotalVertices()>0)as Mesh[]){const variant=source.tufts.findIndex((t:any)=>t.id===mesh.name),tuft=source.tufts[variant];if(!tuft){mesh.setEnabled(false);continue;}
   nativeChecks.push(compareSourceTuftAttributes(mesh,tuft));
   mesh.parent=null;mesh.position.setAll(0);mesh.scaling.setAll(1);mesh.rotation.setAll(0);mesh.rotationQuaternion=Quaternion.Identity();mesh.makeGeometryUnique();mesh.setVerticesData("position",tuft.positions,true);mesh.thinInstanceSetBuffer("matrix",matrices(1.25,i=>points[i].variant===variant),16,true);
   const m=mesh.material as PBRMaterial,loaderIrradiance=m.forceIrradianceInFragment,nativeMaps={albedo:m.albedoTexture as Texture,alpha,normal:m.bumpTexture as Texture,arm:m.metallicTexture as Texture};configureSourceGrassMaterial(m,nativeMaps,authorRecipe,"pbr");m.forceIrradianceInFragment=loaderIrradiance;nativeMaps.normal.level=normalStrength;mesh.setEnabled(false);nativeMeshes.push(mesh);
  }
 }catch(error){nativeError=String(error);}finally{nativeLoading=false;}
}
async function setShading(mode:string){
 if(mode==="native"&&authored)mode="author-material";
 shading=mode;(document.querySelector("#shading")as HTMLSelectElement).value=mode;
 if(mode==="native"){state.windX=0;(document.querySelector("#wind")as HTMLSelectElement).value="0";await ensureNative();}
 for(const mesh of meshes){
  mesh.setEnabled(mode!=="native");const m=mesh.material as PBRMaterial;configureSourceGrassMaterial(m,sourceMaps,authorRecipe,mode);
  mesh.sideOrientation=mode==="clockwise"?Material.ClockWiseSideOrientation:Material.CounterClockWiseSideOrientation;
 }
 for(const mesh of nativeMeshes)mesh.setEnabled(mode==="native");
 for(const t of[albedo,alpha,normal,arm]){t.vScale=mode==="flip-v"?-1:1;t.vOffset=mode==="flip-v"?1:0;}
}
await setShading(query.get("shading")==="author-material"&&authorRecipe?"author-material":"pbr");
document.querySelector("#shading")!.addEventListener("change",()=>setShading((document.querySelector("#shading")as HTMLSelectElement).value));
const rulerMat=new PBRMaterial("10cm reference ruler",scene);rulerMat.albedoColor=Color3.FromHexString("#d8d8d0").toLinearSpace();rulerMat.metallic=0;rulerMat.roughness=.8;
const ruler=MeshBuilder.CreateBox("true 30cm ruler",{width:.006,height:.3,depth:.006},scene);ruler.position.set(2.32,.15,-.7);ruler.material=rulerMat;
for(const y of[0,.1,.2,.3]){const tick=MeshBuilder.CreateBox("10cm tick",{width:.05,height:.003,depth:.006},scene);tick.position.set(2.32,y,-.7);tick.material=rulerMat;}
function lighting(){const mode=(document.querySelector("#light")as HTMLSelectElement).value,time=Date.parse(mode==="night"?"2026-10-11T00:00:00Z":"2026-10-11T10:00:00Z"),s=sunState(time),m=moonState(time),sample=sampleArtLighting(s.altitude,mode==="cloudy"?.9:.2,0,m.altitude,m.fraction);sun.direction.set(-s.x,-s.y,-s.z).normalize();sun.diffuse.copyFrom(sample.key);sun.intensity=sample.sunlight*1.3+sample.moonlight;sun.setEnabled(sun.intensity>0);ambient.diffuse.copyFrom(sample.ambient);ambient.intensity=sample.ambientIntensity;scene.clearColor=new Color4(sample.horizon.r,sample.horizon.g,sample.horizon.b,1);}
document.querySelector("#light")!.addEventListener("change",lighting);lighting();
document.querySelector("#wind")!.addEventListener("change",()=>state.windX=Number((document.querySelector("#wind")as HTMLSelectElement).value));
document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button=>button.onclick=()=>{camera.setTarget(new Vector3(button.dataset.view==="both"?0:1.25,.06,0));camera.alpha=-Math.PI/2;camera.beta=button.dataset.view==="side"?1.49:1.18;camera.radius=button.dataset.view==="near"?.62:button.dataset.view==="side"?1.1:button.dataset.view==="far"?6:4.3;});
const bedProjections=[Vector3.Zero(),Vector3.Zero()];
const bedLabels=STUDY_BEDS.map(b=>document.querySelector<HTMLElement>('[data-bed="'+b.id+'"]')!);
bedLabels[1].textContent=authored?"Autorské listy · původní fotografický atlas":"Původní Poly Haven trsy · fotografický atlas";
function updateBedLabels(){const width=engine.getRenderWidth(),height=engine.getRenderHeight(),bounds=canvas.getBoundingClientRect();projectStudyBeds(scene.getTransformMatrix(),camera.viewport.toGlobal(width,height),bedProjections);for(let i=0;i<bedLabels.length;i++){const p=bedProjections[i],visible=p.z>=0&&p.z<=1&&p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height;bedLabels[i].hidden=!visible;if(visible){bedLabels[i].style.left=(bounds.left+p.x/width*bounds.width)+"px";bedLabels[i].style.top=(bounds.top+p.y/height*bounds.height)+"px";}}}
engine.runRenderLoop(()=>{state.time+=Math.min(.05,engine.getDeltaTime()/1000);scene.render();updateBedLabels();});window.addEventListener("resize",()=>engine.resize());
const publish=()=>{const active=shading==="native"&&nativeMeshes.length?nativeMeshes:meshes,m=active[0].material as PBRMaterial;const status={bedProjection:STUDY_BEDS.map((bed,i)=>({id:bed.id,world:bed.point.asArray(),renderPixels:bedProjections[i].asArray(),visible:!bedLabels[i].hidden})),studyOnly:true,productionIntegrated:false,asset,profile:authored?profile+"-highest-photographic-leaf":short?"original-short-LOD0":"medium",distribution,scatterSeed,scatterMinimumDistanceMetres:distribution==="lawn"?(short?.023:.048):null,selectedVariantCounts,sourceTextureResolution:source.sourceTextureResolution??4096,sourceHeightUnscaled:source.sourceHeightUnscaled??false,normalStrength,ready:!nativeLoading&&(shading!=="native"||!nativeError)&&textureErrors.length===0&&[...textures.values()].every(t=>t.isReady())&&active.every(m=>m.isReady(true)),shaderErrors:errorCount,textureErrors,nativeLoading,nativeError,nativeChecks,renderer:engine.getGlInfo().renderer,shading,authorMaterialRecipe:shading==="author-material"?authorRecipe:null,translucencyColorTextureURL:(m.subSurface.translucencyColorTexture as Texture|null)?.url,IBLAlbedoTint:m.subSurface.useAlbedoToTintTranslucency,geometryAuthored:!!source.geometryAuthored,actualTranslucency:m.subSurface.isTranslucencyEnabled?m.subSurface.translucencyIntensity:0,actualMetallicF0Factor:m.metallicF0Factor,actualSpecularIntensity:m.specularIntensity,AOFromARMRed:m.useAmbientOcclusionFromMetallicTextureRed,sourceAlbedoTintLinear:m.albedoColor.asArray(),sourceSideOrientation:active[0].sideOrientation,twoSidedLighting:m.twoSidedLighting,normalMapXInverted:m.invertNormalMapX,normalMapYInverted:m.invertNormalMapY,forceIrradianceInFragment:m.forceIrradianceInFragment,bumpLevel:m.bumpTexture?.level,bumpPresent:!!m.bumpTexture,armPresent:!!m.metallicTexture,sourceMetallicFactor:m.metallic,sourceRoughnessFactor:m.roughness,roughnessFromGreen:m.useRoughnessFromMetallicTextureGreen,roughnessFromAlpha:m.useRoughnessFromMetallicTextureAlpha,ground:{metallic:groundMaterial.metallic,roughnessFactor:groundMaterial.roughness,roughnessFromGreen:groundMaterial.useRoughnessFromMetallicTextureGreen,metalFromBlue:groundMaterial.useMetallnessFromMetallicTextureBlue,specularIntensity:groundMaterial.specularIntensity},textureMapping:[m.albedoTexture,m.opacityTexture,m.bumpTexture,m.metallicTexture].filter((t):t is Texture=>t instanceof Texture).map(t=>({url:t.url,invertY:t.invertY,uScale:t.uScale,vScale:t.vScale,vOffset:t.vOffset,gamma:t.gammaSpace,hardwareSRGB:t.getInternalTexture()?._useSRGBBuffer})),highestSourceTriangles:source.highestTriangles,allOriginalHighestTriangles:source.allAuthorLOD0Triangles??source.highestTriangles,sourceDrawnPotentialTriangles:active.reduce((n,m)=>n+m.getTotalIndices()/3*m.thinInstanceCount,0),baselineTrianglesPerClump:baseline.getTotalIndices()/3,sourceTrianglesPerClump:source.tufts.map((t:any)=>t.triangles),targetHeightsMetres:source.tufts.map((t:any)=>t.targetExtentMetres),rootEmbeddingMetres:.002,alphaMode:"ALPHATEST original PNG",alphaTestReady:m.needAlphaTesting(),alphaBlend:m.needAlphaBlending(),alphaGamma:alpha.gammaSpace,alphaCutoff:.45,drawnClumps:baselineMatrices.length/16,sourceInstances:active.reduce((n,m)=>n+m.thinInstanceCount,0),groundStudyOnly:"flat identical planes; no native terrain, street or placement edits",distanceLOD:"highest only pending visual review",performanceClaim:false};report.textContent=JSON.stringify(status,null,2);(window as any).__grassStudy=status;};const publishTimer=setInterval(publish,500);publish();
window.addEventListener("pagehide",()=>{clearInterval(publishTimer);engine.stopRenderLoop();scene.dispose();engine.dispose();},{once:true});
(window as any).__grassStudyApi={setShading,meshes,scene};
