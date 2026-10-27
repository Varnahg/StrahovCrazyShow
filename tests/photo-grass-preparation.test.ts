import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as turn, setTimeout as pause } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Light } from "@babylonjs/core/Lights/light";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { PhotographicGrass } from "../client/photographic-grass";
import { acquireGrassResources, type GrassResources } from "../client/photo-grass-resources";
import { PhotoGrassBatch, type GrassRootState } from "../client/photo-grass-batch";
import { VegetationController } from "../client/vegetation";
import { TreeRenderer } from "../client/tree-renderer";
import { VehicleLighting } from "../client/vehicle-lighting";
import { StableLightState } from "../client/stable-light-state";
import "../client/render-shaders";

const pack = JSON.parse(readFileSync(new URL("../public/models/vegetation/grass/geometry.json", import.meta.url), "utf8"));
const recipe = JSON.parse(readFileSync(new URL("../public/models/vegetation/grass/material.json", import.meta.url), "utf8"));

async function fixture(t: import("node:test").TestContext) {
  // Explicit CPU thin-branch capability/TextureIO adapter, never GPU evidence.
  const engine = new NullEngine({ renderWidth:128, renderHeight:128, textureSize:1, deterministicLockstep:false, lockstepMaxSteps:4 });
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const camera = new FreeCamera("far from preparation root", new Vector3(110, 5, 20), scene); camera.setTarget(new Vector3(110,0,12)); scene.activeCamera = camera;
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const point = new PointLight("mapped POINT", new Vector3(0,3,2), scene); point.falloffType = Light.FALLOFF_STANDARD; point.range = 22; point.setEnabled(false);
  const car = new TransformNode("car", scene), beam = new VehicleLighting(scene), stable = new StableLightState(scene);
  let textureLoads = 0, textureDisposals = 0, materialDisposals = 0, programs = 0, thinCalls = 0;
  const createProgram = engine.createShaderProgram;
  engine.createShaderProgram = function (...args) { programs++; return Reflect.apply(createProgram,this,args); };
  const leases: GrassResources[] = [];
  const acquire = () => {
    const lease = acquireGrassResources(scene,pack,recipe,1024,(channel,gamma)=>{
      textureLoads++; const texture = new Texture("/textures/vegetation/grass/"+pack.textures.files[channel].file,scene,false,false); texture.gammaSpace=gamma; texture.onDisposeObservable.add(()=>textureDisposals++); return {texture,ready:Promise.resolve()};
    }); leases.push(lease); return lease;
  };
  const resources = acquire(); await resources.ready;
  assert.ok(Object.values(resources.maps).every(texture=>texture.isReady()));
  for(const material of new Set(Object.values(resources.materials))) material.onDisposeObservable.add(()=>materialDisposals++);
  const grass = new PhotographicGrass(scene,pack,recipe,resources);
  const helpers = () => scene.meshes.filter(mesh=>mesh.metadata?.photoGrassPreparation);
  const helper = () => { const meshes=helpers(); assert.equal(meshes.length,1); return meshes[0] as import("@babylonjs/core/Meshes/mesh").Mesh; };
  const frame = () => { stable.update(); engine.beginFrame(); scene.render(); engine.endFrame(); };
  const deferred = async () => { await pause(0);await turn();engine.beginFrame();engine.endFrame();await turn(); };
  const render = async () => { for(let i=0;i<8;i++){frame();await turn();} };
  const observeThin = (mesh: any) => { const method=mesh._renderWithThinInstances; mesh._renderWithThinInstances=function(...args:unknown[]){thinCalls++;return Reflect.apply(method,this,args);}; };
  const snapshot = () => JSON.stringify({stats:grass.stats, roots:[...(grass as any).roots],selected:(grass as any).selected,wanted:[...(grass as any).wanted],transitions:[...(grass as any).transitions],wind:resources.wind,batches:[...(grass as any).batches.values()].map((b:PhotoGrassBatch)=>({roots:b.roots,bytes:b.allocatedBytes,enabled:b.mesh.isEnabled()}))});
  t.after(async()=>{grass.dispose();for(const lease of leases)lease.release();await deferred();beam.dispose();stable.dispose();scene.dispose();engine.dispose();});
  return {engine,scene,camera,resources,grass,acquire,helpers,helper,frame,render,deferred,observeThin,snapshot,counts:()=>({textureLoads,textureDisposals,materialDisposals,programs,thinCalls}),lighting(n:number){point.setEnabled(n===1);point.intensity=n?.7:0;beam.update(car,1,true,"low");stable.update();}};
}

test("retained actual FAR helper has unique geometry, fade0/ownwind and a real thin draw outside camera frustum",async t=>{
  const f=await fixture(t), before=f.snapshot(), source=f.resources.sources.get("far")!, kinds=source.getVerticesDataKinds().slice();
  const stop=f.grass.beginShaderPreparation()!;const mesh=f.helper();f.observeThin(mesh);
  assert.notEqual(mesh.geometry,source.geometry);assert.equal(mesh.material,f.resources.materials.far);assert.equal(mesh.thinInstanceCount,1);assert.equal(mesh.alwaysSelectAsActiveMesh,true);assert.notEqual(mesh.metadata.photoGrassWind,f.resources.wind);
  const fadeData = mesh.getVertexBuffer("photoGrassFade")!.getData();
  assert.ok(fadeData instanceof Float32Array);
  assert.deepEqual(Array.from(fadeData).slice(0,4),[0,0,0,.5]);
  f.lighting(0);await f.render();assert.ok(f.counts().thinCalls>0);assert.equal(mesh.isInFrustum(Frustum.GetPlanes(f.scene.getTransformMatrix())),false);
  const effect=mesh.subMeshes[0]._getDrawWrapper(f.camera.renderPassId)!.effect!;
  assert.ok(effect.isReady());assert.match(effect.defines,/^#define INSTANCES$/m);assert.match(effect.defines,/^#define THIN_INSTANCES$/m);assert.ok(effect.getAttributesNames().includes("photoGrassFade"));
  stop();stop();await f.deferred();assert.equal(mesh.isEnabled(),false);assert.equal(mesh.isDisposed(),false);assert.equal(effect.isDisposed,false);assert.equal(f.snapshot(),before);assert.deepEqual(source.getVerticesDataKinds(),kinds);assert.equal(f.counts().materialDisposals,0);assert.equal(f.counts().textureDisposals,0);
});

test("retained owner keeps both actual low mapped-light variants reusable through delayed cleanup",async t=>{
  const f=await fixture(t), stop=f.grass.beginShaderPreparation()!, mesh=f.helper(),effects:unknown[]=[];
  for(const n of [0,1]){f.lighting(n);await f.render();const effect=mesh.subMeshes[0]._getDrawWrapper(f.camera.renderPassId)!.effect!;assert.match(effect.defines,/^#define LIGHT_FALLOFF_STANDARD0$/m);assert.equal(/^#define LIGHT_FALLOFF_STANDARD1$/m.test(effect.defines),n===1);effects.push(effect);}
  stop();await f.deferred();assert.equal(mesh.isEnabled(),false);
  const ordinary=new PhotoGrassBatch("far",f.resources);ordinary.mesh.makeGeometryUnique();ordinary.mesh.alwaysSelectAsActiveMesh=true;
  const root:GrassRootState={id:1,tileId:"actual-batch-test",x:0,y:0,z:0,seed:.25,level:"far",slot:-1,fade:{from:1,to:1,startedAt:0}};
  ordinary.add(root,Float32Array.from(Matrix.Identity().asArray()),0,0,0);ordinary.flush();
  try{const programs=f.counts().programs;for(const n of [0,1]){f.lighting(n);await f.render();assert.equal(ordinary.mesh.subMeshes[0]._getDrawWrapper(f.camera.renderPassId)!.effect,effects[n]);}assert.equal(f.counts().programs,programs);}
  finally{ordinary.dispose();}
});

test("generation tokens make old deactivation harmless across newer activation and resource replacement",async t=>{
  const f=await fixture(t), first=f.grass.beginShaderPreparation()!, old=f.helper(), second=f.grass.beginShaderPreparation()!;
  first();assert.equal(old.isEnabled(),true);second();assert.equal(old.isEnabled(),false);
  const oldStop=f.grass.beginShaderPreparation()!, replacement=f.acquire();await replacement.ready;
  const original=f.resources.release;let releaseChecked=false;
  f.resources.release=()=>{assert.equal(old.isDisposed(),true,"preparation disposed before oldlease release");releaseChecked=true;original();};
  const oldRevision=f.grass.shaderPreparationRevision;(f.grass as any).installResources(replacement);assert.ok(releaseChecked);assert.notEqual(f.grass.shaderPreparationRevision,oldRevision);
  const newStop=f.grass.beginShaderPreparation()!, current=f.helper();assert.notEqual(current,old);oldStop();first();second();assert.equal(current.isEnabled(),true);newStop();assert.equal(current.isEnabled(),false);
  assert.equal(f.counts().materialDisposals,0);assert.equal(f.counts().textureDisposals,0);assert.equal(f.counts().textureLoads,5);
});

test("actual vegetation delegates only activation/revision and disposal owns the retained helper",async t=>{
  const f=await fixture(t);
  // This helper-lifetime fixture must never start production tree IO. Keep the
  // real controller/renderer constructors and disposal, with a failing IO guard.
  const loadTrees=t.mock.method(TreeRenderer.prototype,"load",()=>{assert.fail("helper ownership fixture must not load the production tree catalogue");});
  const vegetation=new VegetationController(f.scene,{skipLegacyGrass:true});
  t.after(()=>vegetation.dispose());
  (vegetation as any).photographicGrass=f.grass;
  const revision=vegetation.grassPreparationRevision as {grass?:object;litter?:object}|undefined;
  assert.ok(revision,"actual controller publishes its composite preparation revision");
  // Compare identities as booleans: an assertion failure must not expand the
  // entire cyclic GrassResources/Babylon Scene graph into a diagnostic diff.
  assert.ok(revision.grass===f.grass.shaderPreparationRevision,"composite revision retains the actual grass resource owner");
  assert.equal(revision.litter,undefined,"this fixture has no loaded tree litter");
  assert.ok(vegetation.grassPreparationRevision===revision,"unchanged owners retain one stable composite identity");
  assert.equal(vegetation.stats.treeInstances,0);assert.equal(vegetation.stats.grassTiles,0);
  const stop=vegetation.beginGrassPreparation()!,mesh=f.helper();assert.equal(mesh.isEnabled(),true);
  vegetation.dispose();stop();assert.equal(mesh.isDisposed(),true);assert.equal(vegetation.beginGrassPreparation(),undefined);assert.equal(f.grass.beginShaderPreparation(),undefined);assert.equal(f.grass.shaderPreparationRevision,undefined);assert.equal(vegetation.grassPreparationRevision,undefined);vegetation.dispose();
  assert.equal(loadTrees.mock.callCount(),0);
});

test("scene disposal cancels every retained owner and later deactivation is inert",async t=>{
  const f=await fixture(t), stop=f.grass.beginShaderPreparation()!,mesh=f.helper();f.scene.dispose();stop();stop();assert.equal(mesh.isDisposed(),true);assert.equal(f.grass.beginShaderPreparation(),undefined);
});

test("failed initialization disposes only its partial clone and can be retried",async t=>{
  for(const duringConstructor of [false,true]){
    const f=await fixture(t), before=f.scene.meshes.length, clone=f.resources.clone.bind(f.resources), error={duringConstructor};let captured:import("@babylonjs/core/Meshes/mesh").Mesh|undefined;
    f.resources.clone=(level,name)=>{const mesh=clone(level,name);captured=mesh;if(duringConstructor)mesh.freezeWorldMatrix=()=>{throw error;};else mesh.makeGeometryUnique=()=>{throw error;};return mesh;};
    assert.throws(()=>f.grass.beginShaderPreparation(),value=>value===error);assert.ok(captured?.isDisposed());assert.equal(f.scene.meshes.length,before);assert.equal(f.counts().materialDisposals,0);assert.equal(f.counts().textureDisposals,0);
    f.resources.clone=clone;const stop=f.grass.beginShaderPreparation()!;assert.equal(f.helper().isEnabled(),true);stop();
  }
});

test("init and cancellation do not overwrite live batch buffers or roots",async t=>{
  const f=await fixture(t), live=(f.grass as any).batches.get("far") as PhotoGrassBatch;
  const root:GrassRootState={id:2,tileId:"live",x:0,y:0,z:0,seed:.3,level:"far",slot:-1,fade:{from:1,to:1,startedAt:0}};live.add(root,Float32Array.from(Matrix.Identity().asArray()),0,0,0);live.flush();
  const before=f.snapshot(), geometry=live.mesh.geometry, buffers=["world0","world1","world2","world3","photoGrassFade"].map(k=>live.mesh.getVertexBuffer(k));
  const stop=f.grass.beginShaderPreparation()!;f.lighting(0);await f.render();stop();await f.deferred();assert.equal(f.snapshot(),before);assert.equal(live.mesh.geometry,geometry);for(const[i,k]of["world0","world1","world2","world3","photoGrassFade"].entries())assert.equal(live.mesh.getVertexBuffer(k),buffers[i]);
});
