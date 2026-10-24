import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
import {createHash} from "node:crypto";
import {Script} from "node:vm";
import {Mesh} from "@babylonjs/core/Meshes/mesh";
import {MeshBuilder} from "@babylonjs/core/Meshes/meshBuilder";
import {VertexData} from "@babylonjs/core/Meshes/mesh.vertexData";
import {VertexBuffer} from "@babylonjs/core/Buffers/buffer";
import {PBRMaterial} from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {DynamicTexture} from "@babylonjs/core/Materials/Textures/dynamicTexture";
import {Color3} from "@babylonjs/core/Maths/math.color";
import {Vector3,Matrix} from "@babylonjs/core/Maths/math.vector";
import {TransformNode} from "@babylonjs/core/Meshes/transformNode";
import {PointLight} from "@babylonjs/core/Lights/pointLight";
import {Light} from "@babylonjs/core/Lights/light";
import {LoadAssetContainerAsync} from "@babylonjs/core/Loading/sceneLoader";
import {attachWorldAssetNode,getWorldAssetRoot} from "../../../client/world-asset-identity";
import {B6_ASSET_MANIFEST,B6_PROP_PLACEMENTS} from "../../../shared/b6-props";
import {B6_LAYOUT,B6_ENTRY_PACK,B6_STAIR_CORES} from "../../../shared/b6-interior";
import {renderBudget} from "../../../shared/render-quality";
import {buildRoadDetailPlan} from "../../../shared/road-details";
import {groundHeight,drapeTriangles} from "../../../shared/terrain";
import {STREET_SURFACE_Y} from "../../../shared/streets";
import type {Scene} from "@babylonjs/core/scene";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/loaders/glTF";

export const sha=(value:string|Uint8Array)=>createHash("sha256").update(value).digest("hex");
const read=(path:string)=>fs.readFileSync(new URL("../../../"+path,import.meta.url),"utf8");
function compile(body:string,env:Record<string,unknown>,result:string) {
  const js=ts.transpileModule(body,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  return new Script(`(env)=>{const {${Object.keys(env).join(",")}}=env;${js};return ${result};}`).runInThisContext()(env);
}
export const methodProof:{file:string;name:string;sha256:string}[]=[];
export function gameClass(env:Record<string,unknown>) {
  const source=read("client/game.ts"),tree=ts.createSourceFile("game.ts",source,ts.ScriptTarget.Latest,true);
  const cls=tree.statements.find((n):n is ts.ClassDeclaration=>ts.isClassDeclaration(n)&&n.name?.text==="Game")!;
  const names=["prepareLighting","prepareLightingVariants","isMeshReadyForCamera","updateWorldPresentation","updateRenderEnvironment","applyRenderQuality","updateCameraFollow","alignVehicleCamera","footFirstPerson","applyPreparationView","preparationPosition","refreshStartupPreparationView","startupPreparationCoverage"];
  const methods=names.map(name=>{const node=cls.members.find(n=>n.name?.getText(tree)===name)!;assert.ok(node,name);const text=node.getText(tree);methodProof.push({file:"client/game.ts",name,sha256:sha(text)});return text;});
  return compile(`class ProbeGame {${methods.join("\n")}}`,env,"ProbeGame");
}

/** Exact method bodies and original data; only data breadth/constructor geometry is narrowed. */
export async function sources(scene:Scene) {
  const source=read("client/b6-reality.ts"),tree=ts.createSourceFile("b6.ts",source,ts.ScriptTarget.Latest,true);
  const cls=tree.statements.find((n):n is ts.ClassDeclaration=>ts.isClassDeclaration(n)&&n.name?.text==="B6RealityController")!;
  const members=cls.members.filter(n=>ts.isPropertyDeclaration(n)||["loadProps","attachToBuilding","update","dispose","interiorLightEnabled"].includes(n.name?.getText(tree)??""));
  const ctor=cls.members.find(ts.isConstructorDeclaration)!;
  const lightStart=ctor.body!.statements.findIndex(n=>n.getText(tree).startsWith("this.light = new PointLight"));assert.ok(lightStart>=0);
  const light=ctor.body!.statements.slice(lightStart).map(n=>n.getText(tree)).join("\n");
  const distance=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==="distanceToBounds")!;
  assert.ok(distance);
  for(const member of members) if(!ts.isPropertyDeclaration(member))methodProof.push({file:"client/b6-reality.ts",name:member.name!.getText(tree),sha256:sha(member.getText(tree))});
  const asset=B6_ASSET_MANIFEST.assets.find(x=>x.id==="sink")!;assert.ok(asset);
  const placements=B6_PROP_PLACEMENTS.filter(x=>x.asset===asset.id&&x.level===0).slice(0,2);assert.equal(placements.length,2);
  const constants=tree.statements.filter(n=>ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>["B6_ENTRY_VISIBILITY_BOUNDS","B6_CONSTRUCTION_BOUNDS"].includes(d.name.getText(tree))));assert.equal(constants.length,2);
  const B6=compile(`${distance.getText(tree)}\n${constants.map(n=>n.getText(tree)).join("\n")}class FiniteB6 {constructor(private scene:any,private options:any){${light}}${members.map(n=>n.getText(tree)).join("\n")}}`,
    {Mesh,PointLight,Color3,Light,Vector3,Matrix,LoadAssetContainerAsync,attachWorldAssetNode,B6_LAYOUT,B6_ENTRY_PACK,B6_STAIR_CORES,renderBudget,B6_ASSET_MANIFEST:{...B6_ASSET_MANIFEST,assets:[asset]},B6_PROP_PLACEMENTS:placements},"FiniteB6");
  const b6=new B6(scene,{assetSource:(url:string)=>new Uint8Array(fs.readFileSync("public"+url))});
  const root=getWorldAssetRoot(scene,{key:"building:53929057",sourceId:"53929057",kind:"building"} as any,{x:8,y:B6_LAYOUT.foundationOffset,z:-55});b6.attachToBuilding(root);await b6.loadProps();assert.deepEqual(b6.stats.errors,[]);assert.equal(b6.sources.length,3);
  const roadSource=read("client/road-details.ts"),roadTree=ts.createSourceFile("road.ts",roadSource,ts.ScriptTarget.Latest,true);
  const body=roadTree.statements.filter(n=>!ts.isImportDeclaration(n)).map(n=>n.getText(roadTree).replace(/^export /,"")).join("\n");
  const plan=buildRoadDetailPlan(),sign=plan.signs.find(x=>x.kind==="bus"&&x.name==="Stadion Strahov"&&x.routes==="143 · 149")!;assert.ok(sign,"exact original Stadion Strahov bus recipe remains present");
  const build=compile(body,{Mesh,MeshBuilder,VertexData,VertexBuffer,TransformNode,PBRMaterial,DynamicTexture,Color3,groundHeight,drapeTriangles,STREET_SURFACE_Y,buildRoadDetailPlan:()=>({...plan,paint:[],signs:[sign]})},"buildRoadDetails");
  const previous=Object.getOwnPropertyDescriptor(globalThis,"document");
  try{Object.defineProperty(globalThis,"document",{value:{},configurable:true});build(scene);}finally{if(previous)Object.defineProperty(globalThis,"document",previous);else Reflect.deleteProperty(globalThis,"document");}
  const road=scene.meshes.filter((x):x is Mesh=>x instanceof Mesh&&x.metadata?.authoredLightReceiver==="road-sign-face");assert.equal(road.length,1);
  const target:Mesh[]=[...b6.sources,...road];
  return {b6,root,target,placements,sign,asset,update:(player:any,quality:string)=>b6.update({player,quality}),dispose:()=>b6.dispose()};
}
