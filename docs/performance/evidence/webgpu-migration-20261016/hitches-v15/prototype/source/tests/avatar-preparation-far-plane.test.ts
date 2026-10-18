import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import "@babylonjs/core/Meshes/instancedMesh";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { AvatarPreparationFarPlane } from "../client/avatar-preparation-far-plane";

function fixture(t: import("node:test").TestContext, rightHanded = true) {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  const camera = new FreeCamera("original perspective", new Vector3(0, 1, 8), scene);
  camera.minZ = .08; camera.maxZ = 1100; camera.fov = .85;
  camera.setTarget(new Vector3(0, 1, 0)); scene.activeCamera = camera;
  const scope = new AvatarPreparationFarPlane(camera);
  const rig = (z = 0) => {
    const root = new TransformNode("actual rig root", scene), mesh = MeshBuilder.CreateBox("attached part", {}, scene);
    root.position.z = z; mesh.parent = root; mesh.position.y = 1;
    return { root, mesh };
  };
  t.after(() => { scope.restore(); scene.dispose(); engine.dispose(); });
  return { engine, scene, camera, scope, rig };
}
function state(camera: FreeCamera) {
  const view = Array.from(camera.getViewMatrix().m), projection = Array.from(camera.getProjectionMatrix().m);
  return { position: camera.position.asArray(), rotation: camera.rotation.asArray(), quaternion: camera.rotationQuaternion,
    up: camera.upVector.asArray(), target: camera.getTarget().asArray(), focal: (camera as any)._initialFocalDistance,
    reference: (camera as any)._referencePoint.asArray(), fov: camera.fov, minZ: camera.minZ, maxZ: camera.maxZ,
    pass: camera.renderPassId, mode: camera.mode, fovMode: camera.fovMode, view, projection };
}

for (const rightHanded of [true, false]) test(`actual perspective bounds union retains multiple rigs (${rightHanded ? "RH" : "LH"})`, t => {
  const f = fixture(t, rightHanded), local = f.rig(), remote = f.rig(-20), before = state(f.camera);
  f.camera.setTarget = () => assert.fail("far scope must never call setTarget");
  f.scope.apply([local]); const localFar = f.camera.maxZ;
  assert.ok(localFar < 1100); assert.ok(localFar > 8);
  f.scope.apply([local, remote]); const unionFar = f.camera.maxZ;
  assert.ok(unionFar > localFar + 19);
  const during = state(f.camera);
  assert.deepEqual({ ...during, maxZ: before.maxZ, projection: before.projection }, before);
  for (const { mesh } of [local, remote]) {
    const view = f.camera.getViewMatrix();
    for (const corner of mesh.getBoundingInfo().boundingBox.vectorsWorld) {
      const p = Vector3.TransformCoordinates(corner, view), depth = rightHanded ? -p.z : p.z;
      assert.ok(depth <= unionFar - f.camera.minZ + 1e-12, "full conservative corners retained");
    }
  }
  f.scope.restore(); f.scope.restore(); assert.deepEqual(state(f.camera), before);
});

test("authored skinned envelope and attached regular instance bounds survive unchanged", t => {
  const f = fixture(t), a = f.rig();
  a.mesh.skeleton = new Skeleton("real skeleton owner", "skeleton", f.scene);
  a.mesh.setBoundingInfo(new BoundingInfo(new Vector3(-.9, -.15, -4), new Vector3(.9, 2.2, 4)));
  const bounds = a.mesh.getBoundingInfo();
  const source = MeshBuilder.CreateBox("pooled source outside rig", {}, f.scene);
  const instance = source.createInstance("attached regular instance"); instance.parent = a.root; instance.position.z = -12;
  f.scope.apply([a]);
  assert.ok(f.camera.maxZ > 20); assert.equal(a.mesh.getBoundingInfo(), bounds);
  assert.equal(bounds.boundingBox.minimum.z, -4); assert.equal(bounds.boundingBox.maximum.z, 4);
  const envelopeFar = f.camera.maxZ;
  f.scene.removeMesh(instance); f.scope.apply([a]); assert.ok(f.camera.maxZ < envelopeFar);
  assert.ok(f.camera.maxZ > 12, "authored envelope not recomputed from small bind-pose box");
});

test("detached, hidden, disabled, foreign-layer and disposed parts cannot force a false remote envelope", t => {
  const f = fixture(t), local = f.rig(), detached = f.rig(-100), hidden = f.rig(-200), disabled = f.rig(-300), layer = f.rig(-400), dead = f.rig(-500);
  f.scope.apply([local]); const expected = f.camera.maxZ;
  f.scene.removeMesh(detached.mesh); hidden.mesh.isVisible = false; disabled.root.setEnabled(false);
  layer.mesh.layerMask = 0; dead.root.dispose();
  f.scope.apply([local, detached, hidden, disabled, layer, dead]); assert.equal(f.camera.maxZ, expected);
  local.mesh.visibility = 0; f.scope.apply([local]); assert.equal(f.camera.maxZ, 1100);
});

test("empty, nonfinite, behind-camera, distant and incompatible inputs fall back to original full view", t => {
  const f = fixture(t), a = f.rig();
  f.scope.apply([a]); f.scope.apply([]); assert.equal(f.camera.maxZ, 1100);
  a.mesh.setBoundingInfo(new BoundingInfo(new Vector3(NaN, 0, 0), Vector3.One()));
  f.scope.apply([a]); assert.equal(f.camera.maxZ, 1100);
  const behind = f.rig(30), distant = f.rig(-2000);
  f.scope.apply([behind]); assert.equal(f.camera.maxZ, 1100);
  f.scope.apply([distant]); assert.equal(f.camera.maxZ, 1100);
  for (const value of [0, -1, NaN, Infinity]) { f.camera.minZ = value; f.scope.apply([behind]); assert.equal(f.camera.maxZ, 1100); }
  f.camera.minZ = .08; f.camera.mode = 1; f.scope.apply([behind]); assert.equal(f.camera.maxZ, 1100);
  f.camera.mode = 0; f.scene.activeCamera = null; f.scope.apply([behind]); assert.equal(f.camera.maxZ, 1100);
});

test("real mesh inspection failures propagate after previous stage maxZ was restored", t => {
  const f = fixture(t), a = f.rig(), error = new Error("owned bounds failed");
  f.scope.apply([a]); assert.ok(f.camera.maxZ < 1100);
  a.mesh.getBoundingInfo = () => { throw error; };
  assert.throws(() => f.scope.apply([a]), caught => caught === error);
  assert.equal(f.camera.maxZ, 1100); f.scope.restore(); assert.equal(f.camera.maxZ, 1100);
});
