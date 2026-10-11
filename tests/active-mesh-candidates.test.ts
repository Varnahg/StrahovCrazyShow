import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { EnabledMeshCandidates } from "../client/active-mesh-candidates";
import "../client/render-shaders";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const original = scene.getActiveMeshCandidates;
  const names = () => {
    const source = scene.getActiveMeshCandidates();
    return source.data.slice(0, source.length).map((mesh) => mesh.name);
  };
  return { engine, scene, original, names };
}

test("effective enabled cache keeps scene order and invisible masters through own, ancestor and reparent changes", () => {
  const { engine, scene, original, names } = fixture();
  const a = MeshBuilder.CreateBox("a", {}, scene);
  const invisible = MeshBuilder.CreateBox("invisible master", {}, scene);
  invisible.isVisible = false;
  const b = MeshBuilder.CreateBox("b", {}, scene);
  const parent = new TransformNode("parent", scene);
  const other = new TransformNode("disabled parent", scene);
  b.parent = parent;
  other.setEnabled(false);
  const cache = new EnabledMeshCandidates(scene, original);
  assert.deepEqual(names(), ["a", "invisible master", "b"]);
  const reused = scene.getActiveMeshCandidates().data;
  assert.equal(scene.getActiveMeshCandidates().data, reused);
  parent.setEnabled(false);
  a.setEnabled(false);
  assert.deepEqual(names(), ["invisible master"]);
  parent.setEnabled(true);
  assert.deepEqual(names(), ["invisible master", "b"]);
  b.parent = other;
  assert.deepEqual(names(), ["invisible master"]);
  b.parent = null;
  a.setEnabled(true);
  assert.deepEqual(names(), ["a", "invisible master", "b"]);
  invisible.visibility = 0;
  invisible.layerMask = 0;
  assert.deepEqual(names(), ["a", "invisible master", "b"]);
  cache.dispose();
  assert.equal(scene.getActiveMeshCandidates, original);
  assert.equal(
    a.onEffectiveEnabledStateChangedObservable.hasObservers(),
    false,
  );
  assert.equal(
    b.onEffectiveEnabledStateChangedObservable.hasObservers(),
    false,
  );
  scene.dispose();
  engine.dispose();
});

test("same-task new/remove/stream replacement cannot miss meshes before deferred notifications and disposal releases listeners", async () => {
  const { engine, scene, original, names } = fixture();
  const first = MeshBuilder.CreateBox("first", {}, scene);
  const cache = new EnabledMeshCandidates(scene, original);
  assert.deepEqual(names(), ["first"]);
  const streamed = MeshBuilder.CreateBox("streamed detail", {}, scene);
  assert.deepEqual(names(), ["first", "streamed detail"]);
  streamed.setEnabled(false);
  assert.deepEqual(names(), ["first"]);
  first.dispose();
  MeshBuilder.CreateBox("replacement", {}, scene);
  assert.deepEqual(names(), ["replacement"]);
  const removed = MeshBuilder.CreateBox(
    "removed before notification",
    {},
    scene,
  );
  removed.dispose();
  await nextTask();
  assert.deepEqual(names(), ["replacement"]);
  assert.equal(
    removed.onEffectiveEnabledStateChangedObservable.hasObservers(),
    false,
  );
  scene.removeMesh(streamed);
  assert.equal(
    streamed.onEffectiveEnabledStateChangedObservable.hasObservers(),
    false,
  );
  scene.addMesh(streamed);
  streamed.setEnabled(true);
  assert.deepEqual(names(), ["replacement", "streamed detail"]);
  const callback = scene.getActiveMeshCandidates;
  cache.dispose();
  cache.dispose();
  assert.equal(scene.getActiveMeshCandidates, original);
  assert.equal(callback().data, scene.meshes);
  await nextTask();
  assert.equal(
    streamed.onEffectiveEnabledStateChangedObservable.hasObservers(),
    false,
  );
  scene.dispose();
  engine.dispose();
});

test("preexisting or later custom candidate providers retain ownership", () => {
  const { engine, scene, original } = fixture();
  MeshBuilder.CreateBox("visible", {}, scene);
  const custom = () => ({ data: [], length: 0 });
  scene.getActiveMeshCandidates = custom;
  const refused = new EnabledMeshCandidates(scene, original);
  assert.equal(scene.getActiveMeshCandidates, custom);
  refused.dispose();
  assert.equal(scene.getActiveMeshCandidates, custom);
  scene.getActiveMeshCandidates = original;
  const cache = new EnabledMeshCandidates(scene, original);
  scene.getActiveMeshCandidates = custom;
  cache.dispose();
  assert.equal(scene.getActiveMeshCandidates, custom);
  scene.dispose();
  engine.dispose();
});

test("actual native rendering retains instance LOD, thin instances, disabled sources and dynamic view/parent transitions", async () => {
  const { engine, scene, original } = fixture();
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("camera", new Vector3(0, 2, 0), scene);
  camera.setTarget(new Vector3(0, 2, 20));
  scene.activeCamera = camera;
  const material = new StandardMaterial("unlit", scene);
  material.disableLighting = true;
  const draws: string[] = [];
  const box = (name: string, z: number) => {
    const mesh = MeshBuilder.CreateBox(name, {}, scene);
    mesh.position.set(0, 2, z);
    mesh.material = material;
    mesh.onBeforeBindObservable.add(() => draws.push(name));
    return mesh;
  };
  const master = box("near master", 0);
  const far = box("far master", 0);
  master.isVisible = far.isVisible = false;
  master.addLODLevel(15, far);
  const near = master.createInstance("near instance");
  near.isVisible = true;
  near.position.set(0, 2, 5);
  const distant = master.createInstance("far instance");
  distant.isVisible = true;
  distant.position.set(0, 2, 30);
  const mirror = master.createInstance("negative determinant instance");
  mirror.isVisible = true;
  mirror.position.set(2, 2, 8);
  mirror.scaling.x = -1;
  const parent = new TransformNode("dynamic root", scene);
  near.parent = parent;
  const thin = box("thin mesh", 8);
  thin.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(Matrix.Identity().asArray()),
    16,
    true,
  );
  const floor = box("entry steps", 12);
  floor.scaling.set(3, 0.2, 3);
  const disabled = box("disabled remote detail", 8);
  disabled.setEnabled(false);
  const light = new DirectionalLight("sun", new Vector3(0, -1, 0.2), scene);
  light.position.set(0, 20, 15);
  light.shadowFrustumSize = 100;
  light.shadowMinZ = 0.1;
  light.shadowMaxZ = 100;
  const shadows = new ShadowGenerator(128, light);
  shadows.getShadowMap()!.renderList = [
    master,
    far,
    near,
    distant,
    mirror,
    thin,
    floor,
    disabled,
  ];
  const shadowDraws: string[] = [];
  shadows.onBeforeShadowMapRenderMeshObservable.add((mesh) =>
    shadowDraws.push(mesh.name),
  );
  const cache = new EnabledMeshCandidates(scene, original);
  const cached = scene.getActiveMeshCandidates;
  async function capture(provider: Scene["getActiveMeshCandidates"]) {
    scene.getActiveMeshCandidates = provider;
    for (let i = 0; i < 3; i++) {
      scene.render();
      await nextTask();
    }
    draws.length = 0;
    shadowDraws.length = 0;
    scene.render();
    const active = scene.getActiveMeshes();
    return {
      draws: [...draws],
      shadowDraws: [...shadowDraws],
      active: active.data.slice(0, active.length).map((m) => m.name),
      indices: scene.getActiveIndices(),
    };
  }
  for (const transition of [
    () => {},
    () => {
      parent.setEnabled(false);
      disabled.setEnabled(true);
    },
    () => {
      parent.setEnabled(true);
      master.setEnabled(false);
    },
    () => {
      master.setEnabled(true);
      near.position.z = 40;
      distant.position.z = 7;
    },
    () => {
      camera.position.z = 50;
      camera.setTarget(new Vector3(0, 2, 0));
    },
  ]) {
    transition();
    const baseline = await capture(original);
    const candidate = await capture(cached);
    assert.deepEqual(candidate, baseline);
    assert.ok(candidate.draws.length > 0);
    assert.ok(candidate.shadowDraws.length > 0);
  }
  cache.dispose();
  scene.dispose();
  engine.dispose();
});
