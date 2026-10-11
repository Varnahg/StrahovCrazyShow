import {Engine} from "@babylonjs/core/Engines/engine";
import {Scene} from "@babylonjs/core/scene";
import {ArcRotateCamera} from "@babylonjs/core/Cameras/arcRotateCamera";
import {Vector3} from "@babylonjs/core/Maths/math.vector";
import {Color3,Color4} from "@babylonjs/core/Maths/math.color";
import {HemisphericLight} from "@babylonjs/core/Lights/hemisphericLight";
import {DirectionalLight} from "@babylonjs/core/Lights/directionalLight";
import {B6RealityController} from "../../../client/b6-reality";
import {B6_STAIR_CORES,B6_STAIR_MESHES,B6_LAYOUT,B6_ROOM_AREAS} from "../../../shared/b6-interior";
const canvas=document.querySelector<HTMLCanvasElement>("#preview")!,engine=new Engine(canvas,true),scene=new Scene(engine);
scene.useRightHandedSystem=true;scene.clearColor=new Color4(.28,.34,.36,1);
const camera=new ArcRotateCamera("stair inspection",0,1,8,Vector3.Zero(),scene);
camera.minZ=.04;camera.maxZ=500;camera.fov=1.05;camera.attachControl(canvas,true);
const sky=new HemisphericLight("soft interior inspection fill",Vector3.Up(),scene);
sky.intensity=1.15;sky.groundColor=new Color3(.7,.64,.56);
const sun=new DirectionalLight("daylight from west windows",new Vector3(.8,-.5,.3),scene);sun.intensity=.7;
const b6=new B6RealityController(scene);
const y=B6_LAYOUT.foundationOffset;
const views:Record<string,{eye:[number,number,number];target:[number,number,number];floor:number}>={
  entry:{eye:[-8.2,1.8,-88],target:[-4.85,y+1.1,-78.5],floor:-1},
  "entry-side":{eye:[-11,2.1,-80],target:[-4.85,y+1.25,-78.2],floor:-1},
  corridor:{eye:[5.4,y+1.65,-71.8],target:[1.8,y+1.9,-76.8],floor:0},
  half:{eye:[1.1,y+3.25,-77.6],target:[7.8,y+3.4,-69.6],floor:1},
  landing:{eye:[5.0,y+4.7,-71.65],target:[1.7,y+4.2,-75.8],floor:1},
  south:{eye:[5.4,y+1.65,-31.3],target:[1.8,y+1.9,-36.3],floor:0},
  cutaway:{eye:[-20,y+38,-57],target:[4,y+3,-55],floor:0},
};
let current="corridor";
function view(key:string){current=key in views?key:"corridor";const v=views[current];camera.setTarget(Vector3.FromArray(v.target));camera.setPosition(Vector3.FromArray(v.eye));}
const select=document.querySelector<HTMLSelectElement>("#view")!;
select.addEventListener("change",()=>view(select.value));select.value=new URLSearchParams(location.search).get("view")??"corridor";view(select.value);
engine.runRenderLoop(()=>{
  const v=views[current];b6.update({player:current.startsWith("entry")?{x:-4.85,y:.82,z:-88}:{x:3,y:y+v.floor*3+.82,z:current==="south"?-34:-75},quality:"high",floor:v.floor});
  scene.render();
});
await b6.loadProps();
document.querySelector<HTMLOutputElement>("#metrics")!.textContent=JSON.stringify({ready:true,renderer:engine.getGlInfo().renderer,cores:B6_STAIR_CORES.length,physicalStairMeshes:B6_STAIR_MESHES.length,triangles:B6_STAIR_MESHES.reduce((sum,m)=>sum+m.indices.length/3,0),illustrativeBedrooms:B6_ROOM_AREAS.filter(r=>r.kind==="bedroom").length,measurements:false,photoIdentity:"B3 typology; B6 plan"},null,2);
canvas.dataset.ready="true";
window.addEventListener("resize",()=>engine.resize());
window.addEventListener("pagehide",()=>{engine.stopRenderLoop();b6.dispose();scene.dispose();engine.dispose();},{once:true});
