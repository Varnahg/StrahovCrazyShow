import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import {MorphTargetManager} from "@babylonjs/core/Morph/morphTargetManager";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Vector3, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { VehicleLighting } from "../client/vehicle-lighting";
import manifest from "../shared/data/assets/vehicles-manifest.json";
import { applyArtLighting } from "../client/art-lighting";
import { sunState, moonState } from "../shared/weather";
import {localPreparation,settleLocal} from "./fixtures/avatar-shadow-preparation/local-preparation";

test("local OFF shadow quality uses exact current native maps without light or caster changes",async t=>{
  const f=localPreparation(t);await settleLocal(f);
  const light=f.torch.beam.light,generator=light.getShadowGenerator() as ShadowGenerator;
  const flags=[light.isEnabled(),light.intensity,light.shadowEnabled],old=generator.getShadowMap()!;
  const originalCasterList=old.renderList;
  for(const [quality,size]of [["high",512],["medium",256],["low",128]] as const){
    await settleLocal(f,quality);const map=generator.getShadowMap()!;
    assert.equal(generator.mapSize,size);assert.deepEqual([light.isEnabled(),light.intensity,light.shadowEnabled],flags);
    assert.equal(map.renderList?.length??0,originalCasterList?.length??0,"OFF preparation never scans/selects world casters");
    for(const mesh of f.rig.skinnedBody!.near)assert.ok((mesh.subMeshes[0] as any)._drawWrappers[map.renderPassId]?.effect);
  }
  assert.equal(light.getShadowGenerator(),generator);assert.equal(generator.bias,.0007);assert.equal(generator.normalBias,.015);assert.equal(generator.filteringQuality,ShadowGenerator.QUALITY_LOW);
});

test("local pending work spends at most3 calls in32 batches and does not restart exhausted identity",async t=>{
  const f=localPreparation(t);await settleLocal(f);
  const generator=f.torch.beam.light.getShadowGenerator() as ShadowGenerator,original=generator.isReady,newRig=f.add(1);
  let calls=0;generator.isReady=()=>{calls++;return false;};
  try{
    for(let i=0;i<32;i++){
      const before=calls,status=f.torch.beam.prepareLocalShadow(newRig.root,newRig.skinnedBody!.near,"low");
      assert.equal(calls-before,3);assert.equal(status,i===31?"unavailable":"pending");
    }
    assert.equal(calls,96);
    const work=(f.torch.beam as any).localShadowWork;
    for(let i=0;i<20;i++)assert.equal(f.torch.beam.prepareLocalShadow(newRig.root,newRig.skinnedBody!.near,"low"),"unavailable");
    assert.equal(calls,96);assert.equal((f.torch.beam as any).localShadowWork,work);
    newRig.skinnedBody!.near[0].material=new PBRMaterial("new actual opaque identity",f.scene);
    assert.equal(f.torch.beam.prepareLocalShadow(newRig.root,newRig.skinnedBody!.near,"low"),"pending");assert.equal(calls,99);
  }finally{generator.isReady=original;}
});

test("completed local preparation has no new native calls, work allocations or scene scans",async t=>{
  const f=localPreparation(t);await settleLocal(f);
  const beam=f.torch.beam,generator=beam.light.getShadowGenerator() as ShadowGenerator,original=generator.isReady;
  const work=(beam as any).localShadowWork,descriptor=Object.getOwnPropertyDescriptor(f.scene,"meshes")!;
  const map=generator.getShadowMap(),textureCount=f.scene.textures.length,observers=f.scene.onNewTextureAddedObservable.observers.length;
  generator.isReady=()=>{assert.fail("completed preparation may not ask readiness again");};
  Object.defineProperty(f.scene,"meshes",{configurable:true,get(){assert.fail("completed preparation may not scan scene meshes");}});
  try{for(let i=0;i<100;i++){assert.equal(beam.prepareLocalShadow(f.rig.root,f.rig.skinnedBody!.near,"low"),"ready");assert.equal((beam as any).localShadowWork,work);}}
  finally{Object.defineProperty(f.scene,"meshes",descriptor);generator.isReady=original;}
  assert.equal(generator.getShadowMap(),map);assert.equal(f.scene.textures.length,textureCount);assert.equal(f.scene.onNewTextureAddedObservable.observers.length,observers);
});

test("local preparation rejects unsupported and foreign targets without pretending ready",async t=>{
  const f=localPreparation(t);await settleLocal(f);const beam=f.torch.beam,near=f.rig.skinnedBody!.near,mesh=near[0],material=mesh.material as PBRMaterial;
  const before=(beam as any).localShadowWork;
  material.alpha=.5;assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unsupported");material.alpha=1;
  assert.equal(beam.prepareLocalShadow(f.rig.root,[near[0],near[0],near[2]],"low"),"unsupported");
  assert.equal(beam.prepareLocalShadow(f.rig.root,near.slice(0,2),"low"),"unsupported");
  const skeleton=mesh.skeleton;mesh.skeleton=null;assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unsupported");mesh.skeleton=skeleton;
  const morph=new MorphTargetManager(f.scene);mesh.morphTargetManager=morph;assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unsupported");mesh.morphTargetManager=null;morph.dispose();
  const instance=mesh.createInstance("unsupported own instance");assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unsupported");instance.dispose();
  const wrapper=new ShadowDepthWrapper(material,f.scene,{standalone:true,doNotInjectCode:true});material.shadowDepthWrapper=wrapper;
  assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unsupported");material.shadowDepthWrapper=null;wrapper.dispose();
  mesh.computeBonesUsingShaders=false;assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unsupported");mesh.computeBonesUsingShaders=true;
  const generator=beam.light.getShadowGenerator() as ShadowGenerator,pass=generator.getShadowMap()!.renderPassId;
  mesh.setMaterialForRenderPass(pass,new PBRMaterial("foreign pass override",f.scene));assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unsupported");mesh.setMaterialForRenderPass(pass,undefined);
  const ownGet=beam.light.getShadowGenerator;beam.light.getShadowGenerator=()=>null;
  try{assert.equal(beam.prepareLocalShadow(f.rig.root,near,"low"),"unavailable");assert.equal((beam as any).localShadowWork,undefined);}finally{beam.light.getShadowGenerator=ownGet;}
  assert.notEqual((beam as any).localShadowWork,before);
  const car=new VehicleLighting(f.scene);t.after(()=>car.dispose());const textures=f.scene.textures.length;
  assert.equal(car.prepareLocalShadow(f.rig.root,near,"low"),"unavailable");assert.equal(car.light.getShadowGenerator(),null);assert.equal(f.scene.textures.length,textures);
});

test("local stale callback preserves newer owner without recursively spending another batch",async t=>{
  const f=localPreparation(t);await settleLocal(f);const beam=f.torch.beam,generator=beam.light.getShadowGenerator() as ShadowGenerator,original=generator.isReady;
  const old=f.add(1),next=f.add(4),pass=f.engine.currentRenderPassId;let calls=0,entered=false;
  generator.isReady=function(...args){calls++;if(!entered){entered=true;assert.equal(beam.prepareLocalShadow(next.root,next.skinnedBody!.near,"low"),"pending");}return Reflect.apply(original,this,args);};
  try{
    assert.equal(beam.prepareLocalShadow(old.root,old.skinnedBody!.near,"low"),"unavailable");assert.equal(calls,1);assert.equal(f.engine.currentRenderPassId,pass);
    assert.equal((beam as any).localShadowWork.owner,next.root);assert.equal((beam as any).localShadowWork.batches,0);
    assert.equal(beam.prepareLocalShadow(next.root,next.skinnedBody!.near,"low"),"ready");assert.equal(calls,4);
  }finally{generator.isReady=original;}
});

test("local same-owner reentry, native falsy throw, map replacement and dispose always restore pass",async t=>{
  const f=localPreparation(t);await settleLocal(f);const beam=f.torch.beam,generator=beam.light.getShadowGenerator() as ShadowGenerator,original=generator.isReady;
  const next=f.add(1),pass=f.engine.currentRenderPassId;let inner=0;
  generator.isReady=function(...args){inner++;assert.equal(beam.prepareLocalShadow(next.root,next.skinnedBody!.near,"low"),"pending");return Reflect.apply(original,this,args);};
  assert.equal(beam.prepareLocalShadow(next.root,next.skinnedBody!.near,"low"),"ready");assert.equal(inner,3);assert.equal(f.engine.currentRenderPassId,pass);generator.isReady=original;
  for(const failure of [undefined,null,false,0,""]){
    const another=f.add(1);generator.isReady=()=>{throw failure;};
    assert.throws(()=>beam.prepareLocalShadow(another.root,another.skinnedBody!.near,"low"),value=>value===failure);assert.equal(f.engine.currentRenderPassId,pass);
    assert.equal(beam.prepareLocalShadow(another.root,another.skinnedBody!.near,"low"),"unavailable");
  }
  generator.isReady=original;
  const last=f.add(4);let resize=true;
  generator.isReady=function(...args){const value=Reflect.apply(original,this,args);if(resize){resize=false;generator.mapSize=512;}return value;};
  assert.equal(beam.prepareLocalShadow(last.root,last.skinnedBody!.near,"low"),"unavailable");assert.equal(f.engine.currentRenderPassId,pass);
  generator.isReady=original;assert.equal(beam.prepareLocalShadow(last.root,last.skinnedBody!.near,"low"),"ready");
  assert.equal(beam.prepareLocalShadow(undefined,undefined,"low"),"unavailable");assert.equal((beam as any).localShadowWork,undefined);
  last.root.dispose(false,false);assert.equal(beam.prepareLocalShadow(last.root,last.skinnedBody!.near,"low"),"unavailable");
  beam.dispose();assert.equal((beam as any).localShadowWork,undefined);assert.equal(beam.prepareLocalShadow(f.rig.root,f.rig.skinnedBody!.near,"low"),"unavailable");
});

test("local configuration throws restore pass once and disposed callback owners are released",async t=>{
  const f=localPreparation(t),beam=f.torch.beam,pass=f.engine.currentRenderPassId,original=(beam as any).configureShadow;
  let calls=0;const failure=false;
  (beam as any).configureShadow=()=>{calls++;f.engine.currentRenderPassId=pass+500;throw failure;};
  assert.throws(()=>beam.prepareLocalShadow(f.rig.root,f.rig.skinnedBody!.near,"low"),value=>value===failure);
  assert.equal(f.engine.currentRenderPassId,pass);assert.equal(beam.prepareLocalShadow(f.rig.root,f.rig.skinnedBody!.near,"low"),"unavailable");assert.equal(calls,1);
  (beam as any).configureShadow=original;await settleLocal(f,"medium");
  const generator=beam.light.getShadowGenerator() as ShadowGenerator,native=generator.isReady,next=f.add(1);
  generator.isReady=function(...args){const result=Reflect.apply(native,this,args);next.root.dispose(false,false);return result;};
  try{assert.equal(beam.prepareLocalShadow(next.root,next.skinnedBody!.near,"medium"),"unavailable");assert.equal(f.engine.currentRenderPassId,pass);assert.equal((beam as any).localShadowWork,undefined);}
  finally{generator.isReady=native;}
});

function fixture(
  t: import("node:test").TestContext,
  kind: "vehicle" | "player" = "vehicle",
) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("test observer", new Vector3(0, 3, -8), scene);
  scene.activeCamera = camera;
  const root = new TransformNode("physical vehicle root", scene),
    lighting = new VehicleLighting(scene, kind);
  t.after(() => {
    lighting.dispose();
    scene.dispose();
    engine.dispose();
  });
  return { engine, scene, root, lighting };
}
function box(
  scene: Scene,
  name: string,
  x: number,
  y: number,
  z: number,
  size = 1,
) {
  const mesh = MeshBuilder.CreateBox(name, { size }, scene);
  mesh.position.set(x, y, z);
  mesh.material = new StandardMaterial(name + " opaque material", scene);
  mesh.metadata = { depthCaster: "opaque" };
  return mesh;
}
function selection(scene: Scene, lighting: VehicleLighting) {
  scene.incrementRenderId();
  const generator = lighting.light.getShadowGenerator() as ShadowGenerator;
  const map = generator.getShadowMap()!;
  assert.ok(
    map.getCustomRenderList,
    "actual current render target must retain draw-time culling after resize",
  );
  const candidates = map.renderList!;
  return map.getCustomRenderList!(0, candidates, candidates.length)!;
}

test("model-derived beam follows translation, 90 degree yaw, pitch and parent transforms in actual world metres", (t) => {
  const { scene, root, lighting } = fixture(t);
  const origin = manifest.lights.frontCentres
    .reduce((sum, p) => sum.add(Vector3.FromArray(p)), Vector3.Zero())
    .scale(0.5);
  origin.z += 0.025;
  root.position.set(10, 2, 30);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
  lighting.update(root, 1, true, "low");
  assert.ok(
    Vector3.Distance(
      lighting.light.position,
      new Vector3(10 + origin.z, 2 + origin.y, 30 - origin.x),
    ) < 1e-5,
  );
  const norm = Math.sqrt(1.01);
  assert.ok(
    Vector3.Distance(
      lighting.light.direction,
      new Vector3(1 / norm, -0.1 / norm, 0),
    ) < 1e-6,
  );
  root.rotationQuaternion = root.rotationQuaternion.multiply(
    Quaternion.RotationAxis(Vector3.Right(), Math.PI / 6),
  );
  lighting.update(root, 1, true, "low");
  const c = Math.cos(Math.PI / 6),
    s = Math.sin(Math.PI / 6);
  assert.ok(
    Vector3.Distance(
      lighting.light.position,
      new Vector3(
        10 + s * origin.y + c * origin.z,
        2 + c * origin.y - s * origin.z,
        30 - origin.x,
      ),
    ) < 1e-5,
  );
  assert.ok(
    Vector3.Distance(
      lighting.light.direction,
      new Vector3((c - 0.1 * s) / norm, (-0.1 * c - s) / norm, 0),
    ) < 1e-6,
  );
  const parent = new TransformNode("pose parent", scene);
  parent.position.set(-5, 3, 7);
  parent.rotationQuaternion = Quaternion.RotationAxis(
    Vector3.Up(),
    -Math.PI / 2,
  );
  root.parent = parent;
  root.position.set(1, 2, 4);
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI / 2);
  lighting.update(root, 1, true, "low");
  assert.ok(
    Vector3.Distance(
      lighting.light.position,
      new Vector3(-9 + origin.x, 5 + origin.y, 8 + origin.z),
    ) < 1e-5,
  );
  assert.ok(
    Vector3.Distance(
      lighting.light.direction,
      new Vector3(0, -0.1 / norm, 1 / norm),
    ) < 1e-6,
  );
  assert.equal(
    lighting.light.parent,
    null,
    "already transformed world pose must not get parent-transformed twice",
  );
});

test("day, parking and invalid input disable the bounded beam; steady updates never repeat whole-scene light resync", (t) => {
  const { scene, root, lighting } = fixture(t),
    object = box(scene, "resync observer", 0, 0, 10);
  let resync = 0;
  const original = object._resyncLightSource;
  object._resyncLightSource = function (light) {
    resync++;
    return original.call(this, light);
  };
  for (const value of [0, -0.5, NaN, Infinity]) {
    lighting.update(root, value, true, "low");
    assert.equal(lighting.light.isEnabled(), false);
    assert.equal(lighting.light.intensity, 0);
  }
  assert.equal(resync, 0);
  lighting.update(root, 1, true, "low");
  assert.ok(
    resync > 0 && resync <= 2,
    "Babylon may resync both parent-enabled and explicit enabled state on one transition",
  );
  const steady = resync;
  for (let frame = 0; frame < 30; frame++)
    lighting.update(root, 1, true, "low");
  assert.equal(resync, steady);
  assert.equal(lighting.light.range, 32);
  assert.equal(lighting.light.intensity, 1.6);
  lighting.update(root, 1, false, "high");
  assert.equal(lighting.light.isEnabled(), false);
  assert.equal(lighting.light.intensity, 0);
  assert.equal(lighting.light.shadowEnabled, false);
});

test("medium and high use one 256/512 shadow target, low has no pass, and resized maps keep the real culling callback", (t) => {
  const { scene, root, lighting } = fixture(t);
  box(scene, "front occluder", 0, 0.6, 8);
  lighting.update(root, 1, true, "low");
  assert.equal(lighting.light.getShadowGenerator(), null);
  assert.equal(lighting.light.shadowEnabled, false);
  lighting.update(root, 1, true, "medium");
  const shadow = lighting.light.getShadowGenerator() as ShadowGenerator;
  assert.equal(shadow.mapSize, 256);
  assert.ok(
    selection(scene, lighting).some((mesh) => mesh.name === "front occluder"),
  );
  lighting.update(root, 1, true, "high");
  assert.equal(lighting.light.getShadowGenerator(), shadow);
  assert.equal(shadow.mapSize, 512);
  assert.ok(
    selection(scene, lighting).some((mesh) => mesh.name === "front occluder"),
  );
  lighting.update(root, 1, true, "low");
  assert.equal(lighting.light.shadowEnabled, false);
  assert.deepEqual(selection(scene, lighting), []);
  lighting.update(root, 1, true, "medium");
  assert.equal(shadow.mapSize, 256);
  assert.ok(
    selection(scene, lighting).some((mesh) => mesh.name === "front occluder"),
  );
  lighting.update(root, 1, true, "unknown");
  assert.equal(lighting.light.shadowEnabled, false);
});

test("off/on reuses configured shadows without a second global light-dirty pass or an off light slot", (t) => {
  const { scene, root, lighting } = fixture(t, "player");
  const receiver = box(scene, "torch receiver", 0, 0.6, 8);
  new HemisphericLight("ambient", Vector3.Up(), scene);
  new DirectionalLight("key", Vector3.Down(), scene);
  new PointLight("street", new Vector3(1, 4, 8), scene);
  receiver.receiveShadows = true;
  lighting.update(root, 1, true, "low");
  const shadow = lighting.light.getShadowGenerator() as ShadowGenerator;
  const map = shadow.getShadowMap()!;
  const candidates = map.renderList;
  let shadowModeDirties = 0,
    receiverDirties = 0;
  const markLight = lighting.light._markMeshesAsLightDirty.bind(lighting.light);
  lighting.light._markMeshesAsLightDirty = () => {
    shadowModeDirties++;
    markLight();
  };
  const markReceiver = receiver._markSubMeshesAsLightDirty.bind(receiver);
  receiver._markSubMeshesAsLightDirty = (disposed) => {
    receiverDirties++;
    markReceiver(disposed);
  };
  for (let toggle = 0; toggle < 6; toggle++) {
    lighting.update(root, 1, false, "high");
    assert.equal(lighting.light.isEnabled(), false);
    assert.equal(lighting.light.intensity, 0);
    assert.equal(receiver.lightSources.length, 3);
    assert.ok(!receiver.lightSources.includes(lighting.light));
    assert.equal(lighting.light.shadowEnabled, true);
    assert.equal(shadow.mapSize, 128, "off quality cannot resize an unused map");
    lighting.update(root, 1, true, "low");
    assert.equal(receiver.lightSources.length, 4);
    assert.ok(receiver.lightSources.includes(lighting.light));
    assert.equal(shadow.getShadowMap(), map);
    assert.equal(map.renderList, candidates);
  }
  assert.equal(shadowModeDirties, 0);
  assert.equal(
    receiverDirties,
    12,
    "only the necessary light membership transitions dirty shaders",
  );
});

test("shadow candidates reuse storage while empty transitions and moved/reenabled casters remain current", (t) => {
  const { scene, root, lighting } = fixture(t, "player");
  const moving = box(scene, "moving caster", 0, 0.6, 8);
  const hidden = box(scene, "hidden caster", 0, 0.6, 9);
  hidden.setEnabled(false);
  lighting.update(root, 1, true, "low");
  const shadow = lighting.light.getShadowGenerator() as ShadowGenerator;
  const candidates = shadow.getShadowMap()!.renderList!;
  assert.ok(selection(scene, lighting).includes(moving));
  assert.ok(!selection(scene, lighting).includes(hidden));
  let dirties = 0;
  const markReceiver = moving._markSubMeshesAsLightDirty.bind(moving);
  moving._markSubMeshesAsLightDirty = (disposed) => {
    dirties++;
    markReceiver(disposed);
  };
  // A refresh with casters at the next location leaves shadow defines alone.
  root.position.z += 3;
  lighting.update(root, 1, true, "low");
  assert.equal(shadow.getShadowMap()!.renderList, candidates);
  assert.equal(dirties, 0);
  root.position.x = 100;
  lighting.update(root, 1, true, "low");
  assert.equal(candidates.length, 0);
  assert.equal(
    dirties,
    1,
    "empty shadow map must invalidate its receiver defines",
  );
  root.position.x = 0;
  lighting.update(root, 1, true, "low");
  assert.ok(candidates.length > 0);
  assert.equal(
    dirties,
    2,
    "restored shadow map must invalidate its receiver defines",
  );
  assert.equal(shadow.getShadowMap()!.renderList, candidates);
  lighting.update(root, 1, false, "low");
  moving.position.x = 100;
  hidden.setEnabled(true);
  lighting.update(root, 1, true, "low");
  assert.deepEqual(selection(scene, lighting).map((mesh) => mesh.name), [
    "hidden caster",
  ]);
  lighting.update(root, 1, true, "high");
  assert.notEqual(shadow.getShadowMap()!.renderList, candidates);
  assert.deepEqual(selection(scene, lighting).map((mesh) => mesh.name), [
    "hidden caster",
  ]);
});

test("actual shadow frustum rejects behind/lateral/far/glass/faded/disabled casters while retaining crossing large bounds", (t) => {
  const { scene, root, lighting } = fixture(t);
  box(scene, "inside", 0, 0.6, 8);
  box(scene, "behind", 0, 0.6, -8);
  box(scene, "lateral", 12, 0.6, 3);
  box(scene, "far", 0, 0.6, 50);
  const glass = box(scene, "glass", 0, 0.6, 6);
  glass.material!.alpha = 0.34;
  const faded = box(scene, "faded", 0, 0.6, 7);
  faded.visibility = 0.4;
  const inactive = box(scene, "inactive", 0, 0.6, 9);
  inactive.setEnabled(false);
  const noCaster = box(scene, "ground marked no caster", 0, 0.6, 5);
  noCaster.metadata.depthCaster = false;
  const crossing = MeshBuilder.CreateBox(
    "crossing far plane",
    { width: 2, height: 2, depth: 22 },
    scene,
  );
  crossing.position.set(0, 0.6, 40);
  crossing.material = new StandardMaterial("crossing opaque", scene);
  crossing.metadata = { depthCaster: "opaque" };
  lighting.update(root, 1, true, "medium");
  assert.deepEqual(
    selection(scene, lighting)
      .map((mesh) => mesh.name)
      .sort(),
    ["crossing far plane", "inside"],
  );
  // Candidate pooling must not wait 250 ms when an existing visible LOD is enabled.
  inactive.setEnabled(true);
  assert.ok(selection(scene, lighting).includes(inactive));
  // The same broad phase covers turning; draw-time projection must be current.
  root.rotationQuaternion = Quaternion.RotationAxis(Vector3.Up(), Math.PI);
  lighting.update(root, 1, true, "medium");
  assert.deepEqual(
    selection(scene, lighting).map((mesh) => mesh.name),
    ["behind"],
  );
});

test("reactivation, low-to-shadow return, large pose changes and new meshes invalidate stale broad phase immediately", (t) => {
  const { scene, root, lighting } = fixture(t);
  box(scene, "old location", 0, 0.6, 8);
  lighting.update(root, 1, true, "high");
  assert.equal(selection(scene, lighting)[0].name, "old location");
  const later = box(scene, "newly added", 0, 0.6, 12);
  lighting.update(root, 1, true, "high");
  assert.ok(selection(scene, lighting).includes(later));
  lighting.update(root, 1, false, "high");
  root.position.x = 100;
  box(scene, "new location", 100, 0.6, 8);
  lighting.update(root, 1, true, "high");
  assert.deepEqual(
    selection(scene, lighting).map((mesh) => mesh.name),
    ["new location"],
  );
  lighting.update(root, 1, true, "low");
  root.position.x = 0;
  lighting.update(root, 1, true, "high");
  assert.ok(
    selection(scene, lighting).some((mesh) => mesh.name === "old location"),
  );
  root.position.x = 100;
  lighting.update(root, 1, true, "high");
  assert.deepEqual(
    selection(scene, lighting).map((mesh) => mesh.name),
    ["new location"],
  );
});

test("wind depth ownership and disposal are safe, idempotent and do not delete a replacement owner's wrapper", (t) => {
  const { scene, root, lighting } = fixture(t),
    leaf = box(scene, "wind alpha leaf", 0, 0.6, 8);
  const material = new ShaderMaterial(
    "test wind alpha shader",
    scene,
    "unused-in-state-test",
    { needAlphaTesting: true },
  );
  leaf.material = material;
  leaf.metadata = { depthCaster: "alpha-test", windDeformed: true };
  lighting.update(root, 1, true, "high");
  assert.ok(selection(scene, lighting).includes(leaf));
  const owned = material.shadowDepthWrapper!;
  assert.ok(owned);
  let ownedDisposals = 0;
  const original = owned.dispose.bind(owned);
  owned.dispose = () => {
    ownedDisposals++;
    original();
  };
  const replacement = new ShadowDepthWrapper(material, scene);
  material.shadowDepthWrapper = replacement;
  lighting.dispose();
  lighting.dispose();
  lighting.update(root, 1, true, "high");
  assert.equal(ownedDisposals, 1);
  assert.equal(material.shadowDepthWrapper, replacement);
  assert.equal(lighting.light.isDisposed(), true);
  assert.ok(!scene.lights.includes(lighting.light));
  replacement.dispose();
  material.shadowDepthWrapper = null;
});

test("exact 02:00 moonless night frees zero celestial key so hemisphere, two streets and headlight fit four material slots", (t) => {
  const { scene, root, lighting } = fixture(t),
    instant = Date.parse("2026-10-11T00:00:00Z");
  const sampleObject = box(scene, "four light slots", 0, 0.5, 8);
  const pbr = new PBRMaterial("actual four-slot PBR", scene);
  pbr.maxSimultaneousLights = 4;
  sampleObject.material = pbr;
  const sun = new DirectionalLight("celestial", Vector3.Down(), scene),
    ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
  const lamps = [0, 6].map((x, i) => {
    const light = new PointLight("street" + i, new Vector3(x, 4, 8), scene);
    light.range = 22;
    light.setEnabled(false);
    return light;
  });
  const sample = applyArtLighting(
    {
      scene,
      sun,
      ambient,
      lamps: new StandardMaterial("emissive fixtures", scene),
      lights: lamps,
      clouds: [],
      quality: "high",
    },
    {
      sun: sunState(instant),
      moon: moonState(instant),
      instant,
      player: { x: 0, y: 0, z: 8 },
      weather: { cloud: 1, rain: 0, wind: 0 },
      dt: 0.1,
    },
  );
  lighting.update(root, sample.night, true, "low");
  assert.equal(sun.intensity, 0);
  assert.equal(sun.isEnabled(), false);
  assert.equal(sample.moonlight, 0);
  assert.equal(sample.sunlight, 0);
  const active = sampleObject.lightSources.filter((light) => light.isEnabled());
  assert.equal(active.length, 4);
  assert.ok(
    active.includes(ambient) &&
      active.includes(lamps[0]) &&
      active.includes(lamps[1]) &&
      active.includes(lighting.light),
  );
  assert.ok(
    sampleObject.lightSources.length <= pbr.maxSimultaneousLights,
    "no enabled practical light is beyond the material's four-light shader cap",
  );
});
