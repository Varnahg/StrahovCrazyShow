import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { AuthoredLightPreparation } from "../client/authored-light-preparation";

function fixture(t: TestContext) {
  const engine = new NullEngine(), scene = new Scene(engine);
  engine.getCaps().instancedArrays = true;
  const camera = new FreeCamera("unchanged camera", new Vector3(0, 2, -5), scene);
  camera.setTarget(new Vector3(0, 1, 0)); scene.activeCamera = camera;
  const material = new PBRMaterial("actual source material", scene);
  const helpers: AuthoredLightPreparation[] = [];
  const helper = () => { const value = new AuthoredLightPreparation(scene); helpers.push(value); return value; };
  const source = (kind = "b6-prop-source", hidden = true) => {
    const mesh = CreateBox("technical name is irrelevant", {}, scene);
    mesh.material = material; mesh.metadata = { authoredLightReceiver: kind };
    mesh.isVisible = !hidden; mesh.computeWorldMatrix(true); return mesh;
  };
  const instance = (mesh: ReturnType<typeof source>, absent = true) => {
    const root = new TransformNode("actual world parent", scene), node = mesh.createInstance("actual world instance");
    node.parent = root; node.position.set(100, 1, 100); node.isVisible = true;
    node.metadata = { b6Reality: true, b6PreparationAttachment: { attached: !absent } };
    node.computeWorldMatrix(true);
    if (absent) { node.setEnabled(false); scene.removeMesh(node); }
    return node;
  };
  t.after(() => { try { for (const value of helpers) value.dispose(); } finally { scene.dispose(); engine.dispose(); } });
  return { engine, scene, camera, material, helper, source, instance };
}

test("declared B6 receiver borrows the real absent disabled instance and restores exact Scene membership", t => {
  const f = fixture(t), source = f.source(), instance = f.instance(source);
  const original = [...f.scene.meshes], geometry = source.geometry, material = source.material;
  const pose = instance.getWorldMatrix().clone(), helper = f.helper(), release = helper.begin();
  assert.equal(helper.selection.selected, 1);
  assert.equal(source.isVisible, false, "hidden source is never made into a proxy draw");
  assert.equal(instance.isEnabled(), true); assert.equal(instance.alwaysSelectAsActiveMesh, true);
  assert.equal(f.scene.meshes.filter(mesh => mesh === instance).length, 1);
  assert.equal(source.geometry, geometry); assert.equal(instance.material, material);
  assert.deepEqual(instance.getWorldMatrix().asArray(), pose.asArray());
  assert.equal(instance.metadata.b6PreparationAttachment.attached, false, "helper cannot commit B6 controller state");
  release(); release(); assert.deepEqual(f.scene.meshes, original);
  assert.equal(instance.isEnabled(false), false); assert.equal(instance.alwaysSelectAsActiveMesh, false);
  assert.equal(source.instances[0], instance);
});

test("actual native Scene/PBR instance batch prepares useInstances without changing the hidden source", async t => {
  const f = fixture(t), source = f.source(), instance = f.instance(source);
  await f.material.forceCompilationAsync(source, { useInstances: true });
  const native = source._processRendering, batches: { instanced: boolean; visible: unknown[] | null }[] = [];
  source._processRendering = function(...args: Parameters<typeof native>) {
    batches.push({ instanced: args[5], visible: args[4].visibleInstances[args[1]._id] });
    return Reflect.apply(native, this, args);
  };
  const originalCamera = f.camera.position.clone(), release = f.helper().begin();
  f.scene.render();
  assert.ok(batches.some(row => row.instanced && row.visible?.includes(instance)), "original draw must see a real hardware-instance batch");
  assert.ok(f.scene.getActiveMeshes().data.slice(0, f.scene.getActiveMeshes().length).includes(instance));
  assert.equal(source.isVisible, false); assert.deepEqual(f.camera.position, originalCamera);
  release(); source._processRendering = native;
});

for (const storage of ["mono", "per-pass"] as const)
  test(`declared receiver is selected again after native ${storage} draw`, async t => {
    const f = fixture(t), source = f.source(), instance = f.instance(source), helper = f.helper();
    // NullEngine remains GLSL; select the actual WebGPU storage branch explicitly.
    if (storage === "per-pass") (source as any)._instanceDataStorage.useMonoDataStorageRenderPass = false;
    const native = source._processRendering;
    let nativeInstanceDraws = 0;
    source._processRendering = function (...args) {
      if (args[5] && args[4].visibleInstances[args[1]._id]?.includes(instance)) nativeInstanceDraws++;
      return Reflect.apply(native, this, args);
    };
    const release = helper.begin();
    await f.material.forceCompilationAsync(source, { useInstances: true });
    f.scene.render();
    assert.ok(nativeInstanceDraws > 0, "first original draw must create a hardware instance batch");
    assert.ok(source.getVerticesDataKinds().includes("world0"), "native matrix overlay must exist after the real draw");
    assert.equal(source.getVerticesDataKinds(true).includes("world0"), false);
    release();
    assert.equal(instance.isEnabled(false), false);
    assert.equal(f.scene.meshes.includes(instance), false);
    const again = helper.begin();
    assert.deepEqual(helper.selection, { selected: 1, unsupported: 0 });
    const before = nativeInstanceDraws;
    f.scene.render();
    assert.ok(nativeInstanceDraws > before, "reacquired lease must reach the original native instance batch");
    again(); source._processRendering = native;
    assert.equal(instance.isEnabled(false), false);
    assert.equal(f.scene.meshes.includes(instance), false);
    assert.equal(source.isVisible, false);
  });

test("genuine instanced geometry named world0 remains explicitly unsupported", t => {
  const f = fixture(t), source = f.source(); f.instance(source);
  source.setVerticesBuffer(new VertexBuffer(f.engine, new Float32Array([1, 0, 0, 0]), "world0", false, false, 4, true));
  assert.ok(source.getVerticesDataKinds(true).includes("world0"));
  assert.equal(source.getVertexBuffer("world0", true)!.getInstanceDivisor(), 1);
  const helper = f.helper(); helper.begin();
  assert.deepEqual(helper.selection, { selected: 0, unsupported: 1 });
});

test("road-face instances and enabled stadium glass use producer declarations while unrelated and disabled tiers stay untouched", t => {
  const f = fixture(t), road = f.source("road-sign-face"), sign = f.instance(road, false);
  const stadium = f.source("stadium-glass", false), near = f.source("stadium-glass", false), unrelated = f.source("elsewhere", false);
  near.setEnabled(false); const helper = f.helper(), release = helper.begin();
  assert.equal(helper.selection.selected, 2); assert.equal(sign.alwaysSelectAsActiveMesh, true);
  assert.equal(stadium.alwaysSelectAsActiveMesh, true); assert.equal(near.alwaysSelectAsActiveMesh, false);
  assert.equal(unrelated.alwaysSelectAsActiveMesh, false); release();
  assert.equal(sign.isEnabled(), true); assert.ok(f.scene.meshes.includes(sign));
});

test("independent source geometries/materials/light memberships are conservatively retained with no proxy allocation", t => {
  const f = fixture(t), a = f.source(), b = f.source(), ia = f.instance(a), ib = f.instance(b);
  const lamp = new PointLight("actual ordered membership", new Vector3(0, 4, 0), f.scene); lamp.includedOnlyMeshes = [a];
  const resources = [f.scene.meshes.length, f.scene.geometries.length, f.scene.materials.length, f.scene.transformNodes.length];
  const helper = f.helper(), release = helper.begin(); assert.equal(helper.selection.selected, 2);
  assert.notDeepEqual(a.lightSources, b.lightSources); assert.equal(ia.alwaysSelectAsActiveMesh, true); assert.equal(ib.alwaysSelectAsActiveMesh, true);
  assert.deepEqual([f.scene.meshes.length, f.scene.geometries.length, f.scene.materials.length, f.scene.transformNodes.length], [resources[0] + 2, ...resources.slice(1)]);
  release(); assert.deepEqual([f.scene.meshes.length, f.scene.geometries.length, f.scene.materials.length, f.scene.transformNodes.length], resources);
});

test("missing instances, source LOD, opposite determinant and deformation paths remain explicitly unsupported", t => {
  const f = fixture(t), empty = f.source(), lod = f.source(), mirrored = f.source(), skinned = f.source(), morph = f.source(), thin = f.source();
  f.instance(lod); const lodMesh = CreateBox("actual LOD", {}, f.scene); lod.addLODLevel(10, lodMesh);
  const opposite = f.instance(mirrored); opposite.scaling.x = -1; opposite.computeWorldMatrix(true);
  f.instance(skinned); skinned.skeleton = new Skeleton("native skeleton", "native", f.scene);
  f.instance(morph); morph.morphTargetManager = new MorphTargetManager(f.scene);
  f.instance(thin); thin.thinInstanceAddSelf(false);
  const helper = f.helper(); helper.begin(); assert.equal(helper.selection.selected, 0); assert.ok(helper.selection.unsupported >= 6);
  assert.equal(empty.instances.length, 0); assert.equal(opposite.isEnabled(), false);
});

test("unknown attachment, parent-disabled, camera-masked and degenerate instances never masquerade as covered", t => {
  const f = fixture(t), nodes = [f.instance(f.source()), f.instance(f.source()), f.instance(f.source()), f.instance(f.source())];
  nodes[0].metadata = {}; nodes[1].parent!.setEnabled(false); nodes[2].layerMask = 0; nodes[3].scaling.x = 0;
  const helper = f.helper(); helper.begin(); assert.equal(helper.selection.selected, 0); assert.ok(helper.selection.unsupported >= 4);
  for (const node of nodes) assert.equal(node.isEnabled(false), false);
});

test("normal B6 takeover survives metadata replacement and true-to-false takeover is not undone", t => {
  for (const removedAgain of [false, true]) {
    const f = fixture(t), node = f.instance(f.source()), producer = node.metadata.b6PreparationAttachment, helper = f.helper(), release = helper.begin();
    node.metadata = { externalReplacement: true };
    // The actual controller retains this original producer scalar object.
    producer.attached = true;
    if (removedAgain) { node.setEnabled(false); f.scene.removeMesh(node); producer.attached = false; }
    release(); assert.equal(node.isEnabled(false), !removedAgain); assert.equal(f.scene.meshes.includes(node), !removedAgain);
    assert.equal(node.alwaysSelectAsActiveMesh, false); assert.deepEqual(node.metadata, { externalReplacement: true });
  }
});

test("foreign enable and registration writes are preserved independently of owned frustum flag", t => {
  const f = fixture(t), node = f.instance(f.source()), release = f.helper().begin();
  f.scene.removeMesh(node); f.scene.addMesh(node); node.setEnabled(false); node.setEnabled(true); node.alwaysSelectAsActiveMesh = false;
  release(); assert.equal(node.isEnabled(false), true); assert.ok(f.scene.meshes.includes(node)); assert.equal(node.alwaysSelectAsActiveMesh, false);
});

test("nested generations, disposed concrete parents and acquisition exceptions release only their own mutations", t => {
  const f = fixture(t), first = f.instance(f.source()), source = f.source(), second = f.instance(source), helper = f.helper();
  const old = helper.begin(), current = helper.begin(); old(); assert.equal(first.isEnabled(), true); current(); assert.equal(first.isEnabled(false), false);
  const failure = { original: true }, original = source.getVerticesDataKinds; source.getVerticesDataKinds = () => { throw failure; };
  assert.throws(() => helper.begin(), value => value === failure); assert.equal(first.isEnabled(false), false); assert.ok(!f.scene.meshes.includes(first)); source.getVerticesDataKinds = original;
  const release = helper.begin(); second.parent!.dispose(); assert.doesNotThrow(release); assert.equal(second.isDisposed(), true);
});

test("reentrant begin during a real enable notification cannot let the old acquisition disable the newer lease", t => {
  const f = fixture(t), node = f.instance(f.source()), helper = f.helper(); let replacement: (() => void) | undefined, once = false;
  const observer = node.onEnabledStateChangedObservable.add(value => { if (value && !once) { once = true; replacement = helper.begin(); } });
  const old = helper.begin(); old(); assert.equal(node.isEnabled(), true); replacement!();
  assert.equal(node.isEnabled(false), false); assert.equal(node.alwaysSelectAsActiveMesh, false); assert.ok(!f.scene.meshes.includes(node));
  node.onEnabledStateChangedObservable.remove(observer);
});


test("unsupported hardware instancing and registered custom instanced attributes do not claim the target draw variant", t => {
  const f = fixture(t), source = f.source(), node = f.instance(source), helper = f.helper();
  f.engine.getCaps().instancedArrays = false;
  helper.begin(); assert.equal(helper.selection.selected, 0); assert.equal(helper.selection.unsupported, 1); assert.equal(node.isEnabled(false), false);
  f.engine.getCaps().instancedArrays=true;source.registerInstancedBuffer("customColor",4);helper.begin();assert.equal(helper.selection.selected,0);assert.equal(helper.selection.unsupported,1);
});

test("reentrant frustum flag setter preserves the newer concrete lease and frees the old generation", t => {
  const f = fixture(t), node = f.instance(f.source()), helper = f.helper();let flag = false, once = false, latest: (() => void) | undefined;
  Object.defineProperty(node,"alwaysSelectAsActiveMesh",{configurable:true,get:()=>flag,set(value:boolean){flag=value;if(value&&!once){once=true;latest=helper.begin();}}});
  const old=helper.begin();old();assert.equal(node.isEnabled(),true);assert.equal(flag,true);latest!();assert.equal(flag,false);assert.equal(node.isEnabled(false),false);assert.ok(!f.scene.meshes.includes(node));
});

test("borrowed restoration continues after an exact falsy enable throw and removes every owned registration", t => {
  for(const failure of [undefined,false,0]){
    const f=fixture(t), a=f.instance(f.source()), b=f.instance(f.source()), release=f.helper().begin(), original=a.setEnabled;
    a.setEnabled=function(value:boolean){if(!value)throw failure;return Reflect.apply(original,this,[value]);};
    let threw=false;try{release();}catch(error){threw=true;assert.equal(error,failure);}assert.equal(threw,true);
    assert.ok(!f.scene.meshes.includes(a));assert.ok(!f.scene.meshes.includes(b));assert.equal(a.alwaysSelectAsActiveMesh,false);assert.equal(b.alwaysSelectAsActiveMesh,false);assert.equal(b.isEnabled(false),false);
    a.setEnabled=original;a.setEnabled(false);
  }
});

test("duplicate foreign registration is unknown ownership and cannot disable the foreign owner's concrete node", t => {
  const f=fixture(t), node=f.instance(f.source()), release=f.helper().begin();f.scene.addMesh(node);release();
  assert.equal(f.scene.meshes.filter(mesh=>mesh===node).length,2);assert.equal(node.isEnabled(false),true);assert.equal(node.alwaysSelectAsActiveMesh,false);
  f.scene.removeMesh(node);f.scene.removeMesh(node);
});

test("helper disposal and original Scene disposal retire all borrowed concrete resources without touching replacements", t => {
  const f=fixture(t), source=f.source(), old=f.instance(source), helper=f.helper();const release=helper.begin();helper.dispose();release();
  assert.equal(old.isEnabled(false),false);assert.ok(!f.scene.meshes.includes(old));const replacement=f.instance(source);helper.begin();assert.equal(replacement.isEnabled(false),false);
  const other=f.helper(), stop=other.begin();f.scene.dispose();assert.doesNotThrow(stop);assert.doesNotThrow(()=>other.dispose());
});


test("release native false callback can transfer all later mixed receiver mutations to a newer complete lease",t=>{
  const f=fixture(t),node=f.instance(f.source()),legacy=CreateBox("later legacy receiver",{},f.scene),helper=f.helper();legacy.material=f.material;legacy.metadata={sourcePack:"outdoor-artifacts"};f.material.metadata={sourcePack:"outdoor-artifacts"};
  let once=false,latest:(()=>void)|undefined;const observer=node.onEnabledStateChangedObservable.add(value=>{if(!value&&!once){once=true;latest=helper.begin();}});
  const release=helper.begin();assert.equal(legacy.alwaysSelectAsActiveMesh,true);release();
  assert.ok(latest);assert.equal(legacy.alwaysSelectAsActiveMesh,true,"old release cannot overwrite the new scope's inherited true");assert.equal(node.isEnabled(),true);assert.ok(f.scene.meshes.includes(node));
  latest();assert.equal(legacy.alwaysSelectAsActiveMesh,false);assert.equal(node.isEnabled(false),false);assert.ok(!f.scene.meshes.includes(node));node.onEnabledStateChangedObservable.remove(observer);
});

test("release rechecks producer takeover after the original native false callback before registry removal",t=>{
  const f=fixture(t),node=f.instance(f.source()),producer=node.metadata.b6PreparationAttachment,helper=f.helper();let once=false;
  const observer=node.onEnabledStateChangedObservable.add(value=>{if(!value&&!once){once=true;node.setEnabled(true);producer.attached=true;}});
  const release=helper.begin();release();assert.equal(producer.attached,true);assert.equal(node.isEnabled(),true);assert.equal(f.scene.meshes.filter(mesh=>mesh===node).length,1);node.onEnabledStateChangedObservable.remove(observer);
});

test("acquire native true callback that externally disables the candidate cannot advertise drawable coverage",t=>{
  const f=fixture(t),node=f.instance(f.source()),helper=f.helper();const original=[...f.scene.meshes];
  const observer=node.onEnabledStateChangedObservable.add(value=>{if(value)node.setEnabled(false);});
  assert.throws(()=>helper.begin(),/changed during acquisition/);assert.equal(node.isEnabled(false),false);assert.equal(node.alwaysSelectAsActiveMesh,false);assert.deepEqual(f.scene.meshes,original);node.onEnabledStateChangedObservable.remove(observer);
});


test("a newer reentrant begin during replacement is not superseded when the older begin resumes",t=>{
  const f=fixture(t),node=f.instance(f.source()),helper=f.helper();let once=false,latest:(()=>void)|undefined;
  const observer=node.onEnabledStateChangedObservable.add(value=>{if(!value&&!once){once=true;latest=helper.begin();}});
  helper.begin();const olderRequest=helper.begin();assert.ok(latest);olderRequest();assert.equal(node.isEnabled(),true);assert.equal(node.alwaysSelectAsActiveMesh,true);
  latest();assert.equal(node.isEnabled(false),false);assert.equal(node.alwaysSelectAsActiveMesh,false);assert.ok(!f.scene.meshes.includes(node));node.onEnabledStateChangedObservable.remove(observer);
});


test("native registry removal callback transfers a fresh absent baseline and restores original Scene order",t=>{
  const f=fixture(t),node=f.instance(f.source()),helper=f.helper(),original=[...f.scene.meshes];let once=false,latest:(()=>void)|undefined;
  const observer=f.scene.onMeshRemovedObservable.add(mesh=>{if(mesh===node&&!once){once=true;latest=helper.begin();}});
  const release=helper.begin();release();assert.ok(latest);assert.equal(node.isEnabled(),true);assert.equal(f.scene.meshes.filter(mesh=>mesh===node).length,1);
  latest();assert.equal(node.isEnabled(false),false);assert.equal(node.alwaysSelectAsActiveMesh,false);assert.deepEqual(f.scene.meshes,original);f.scene.onMeshRemovedObservable.remove(observer);
});

test("disposed helper adds no concrete retention beyond the exact deferred native Observable control",async()=>{
  if(typeof global.gc!=="function"){
    // pnpm test / normal tsx has no expose-gc flag. Isolate only this actual
    // native GC fixture in a child, preserving normal runner portability.
    const command=["--expose-gc","--import","tsx","--test","--test-reporter=tap","--test-name-pattern=^disposed helper adds no concrete retention beyond the exact deferred native Observable control$",fileURLToPath(import.meta.url)];
    const childEnvironment={...process.env};delete childEnvironment.NODE_TEST_CONTEXT;
    const child=spawnSync(process.execPath,command,{cwd:process.cwd(),env:childEnvironment,encoding:"utf8",timeout:30000,maxBuffer:4*1024*1024});
    const output=(child.stdout??"")+(child.stderr??"");assert.equal(child.status,0,output.slice(-4000));
    assert.match(output,/^# tests 1$/m);assert.match(output,/^# pass 1$/m);assert.match(output,/^# fail 0$/m);assert.match(output,/^# skipped 0$/m);
    console.log("Exact native GC child (not skipped):\n"+output);return;
  }
  assert.equal(typeof global.gc,"function");
  const setup=(mode:string)=>{
    const engine=new NullEngine(),scene=new Scene(engine),material=new PBRMaterial("controlled material",scene),source=CreateBox("controlled source",{},scene),parent=new TransformNode("controlled parent",scene);
    engine.getCaps().instancedArrays=true;source.material=material;source.isVisible=false;source.metadata={authoredLightReceiver:"b6-prop-source"};const node=source.createInstance("controlled world instance");node.parent=parent;node.isVisible=true;node.metadata={b6PreparationAttachment:{attached:false}};node.setEnabled(false);scene.removeMesh(node);
    let helper:AuthoredLightPreparation|undefined,release:(()=>void)|undefined;
    if(!["no-helper","native-observer","native-deferred-removal"].includes(mode))helper=new AuthoredLightPreparation(scene);
    if(mode==="native-observer")scene.onMeshRemovedObservable.add(()=>{});
    if(mode==="native-deferred-removal"){const observer=scene.onMeshRemovedObservable.add(()=>{});scene.onMeshRemovedObservable.remove(observer);}
    if(mode==="begin-no-retained-release"||mode==="begin-retained-release")release=helper!.begin();
    const refs=[source,node,material,parent].map(value=>new WeakRef(value));helper?.dispose();release?.();scene.dispose();engine.dispose();return{mode,engine,scene,helper,release:mode==="begin-retained-release"?release:undefined,refs};
  };
  const states=["no-helper","helper-without-begin","begin-no-retained-release","begin-retained-release","native-observer","native-deferred-removal"].map(setup);
  for(let turn=0;turn<25;turn++){await new Promise(resolve=>setImmediate(resolve));global.gc!();}
  for(const state of states){
    const nativeRetained=["begin-no-retained-release","begin-retained-release","native-deferred-removal"].includes(state.mode);
    assert.deepEqual(state.refs.map(ref=>ref.deref()!==undefined),[nativeRetained,false,false,false],state.mode);
    if(nativeRetained){
      const source=state.refs[0].deref() as unknown as {_nodeDataStorage:{_isDisposed:boolean};_geometry:unknown;_internalAbstractMeshDataInfo:{_material:unknown};subMeshes:unknown[]};
      assert.equal((state.scene.onMeshRemovedObservable as unknown as {_eventState:{lastReturnValue:unknown}})._eventState.lastReturnValue,source,"native skipped deferred observer retains original eventData");
      assert.equal(source._nodeDataStorage._isDisposed,true);assert.equal(source._geometry,null);assert.equal(source._internalAbstractMeshDataInfo._material,null);assert.equal(source.subMeshes.length,0,"no existing submesh pipeline slots survive on this disposed Mesh");
    }
    if(state.helper)assert.equal((state.helper as unknown as {leases:Map<unknown,unknown>}).leases.size,0);
    assert.doesNotThrow(()=>state.release?.());assert.doesNotThrow(()=>state.helper?.dispose());
  }
  // This is a controlled CPU reachability comparison, not zero retention or a
  // claim about native deferred GPU destruction / VRAM / browser lifetime.
});
