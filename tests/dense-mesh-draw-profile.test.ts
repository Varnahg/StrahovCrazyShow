import assert from "node:assert/strict";
import test from "node:test";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Scene } from "@babylonjs/core/scene";
import { DenseMeshDrawProfile } from "../client/dense-mesh-draw-profile";
import "../client/render-shaders";

function fixture() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 2, -10), scene);
  camera.setTarget(new Vector3(0, 2, 0));
  scene.activeCamera = camera;
  engine.currentRenderPassId = camera.renderPassId;
  let time = 0;
  return {
    engine,
    scene,
    camera,
    at(value: number) {
      time = value;
    },
    now: () => time,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}

test("records the material Babylon resolves before readiness and the preBind time on real box renders", async () => {
  const { scene, engine, at, now, dispose } = fixture();
  const ready = MeshBuilder.CreateBox("ready mesh", {}, scene);
  const blocked = MeshBuilder.CreateBox("not ready mesh", {}, scene);
  const child = new StandardMaterial("used child", scene);
  const wait = new StandardMaterial("material compiling", scene);
  const multi = new MultiMaterial("unused container name", scene);
  multi.subMaterials = [child];
  ready.material = multi;
  blocked.material = wait;
  child.disableLighting = wait.disableLighting = true;
  for (let frame = 0; frame < 3; frame++) {
    scene.render();
    await new Promise<void>((resolve) => setTimeout(resolve, 5));
  }
  const readiness = child.isReadyForSubMesh.bind(child);
  child.isReadyForSubMesh = (...args) => {
    at(110);
    return readiness(...args);
  };
  wait.isReadyForSubMesh = () => {
    at(137);
    return false;
  };
  ready.onBeforeBindObservable.add(() => at(115));
  ready.onAfterRenderObservable.add(() => at(117));

  const original = Mesh.prototype.render;
  const profile = new DenseMeshDrawProfile(scene, now);
  try {
    profile.beginFrame(100);
    at(101);
    scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
    at(104);
    assert.equal(ready.render(ready.subMeshes[0], false), ready);
    at(118);
    assert.equal(blocked.render(blocked.subMeshes[0], false), blocked);
    at(139);
    scene.onAfterDrawPhaseObservable.notifyObservers(scene);
    const frame = profile.endFrame();
    const snapshot = profile.summarize(frame);
    assert.equal(frame.mainDrawMs, 38);
    assert.equal(frame.meshCalls, 2);
    assert.equal(frame.selectedCalls, 2);
    assert.equal(frame.boundCalls, 1);
    assert.equal(frame.drawCalls, 1);
    assert.equal(frame.meshRenderMs, 32);
    assert.equal(frame.unattributedMainDrawMs, 6);
    assert.equal(snapshot.topAttempts[0].mesh.name, "not ready mesh");
    assert.equal(snapshot.topAttempts[0].material?.name, "material compiling");
    assert.equal(snapshot.topAttempts[0].durationMs, 19);
    assert.equal(snapshot.topAttempts[0].bindStartOffsetMs, null);
    const drawn = snapshot.topAttempts[1];
    assert.equal(drawn.material?.name, "used child");
    assert.equal(drawn.startOffsetMs, 4);
    assert.equal(drawn.bindStartOffsetMs, 10);
    assert.equal(drawn.durationMs, 13);
    assert.equal(drawn.draws, 1);
    assert.equal(frame.meshHookIntact, true);
  } finally {
    profile.dispose();
    assert.equal(Mesh.prototype.render, original);
    assert.ok(!Object.hasOwn(engine, "drawElementsType"));
    dispose();
  }
});

test("retains one previous frame and reports nested calls, exceptions and full buffers explicitly", () => {
  const { scene, at, now, dispose } = fixture();
  const a = MeshBuilder.CreateBox("outer", {}, scene);
  const b = MeshBuilder.CreateBox("nested", {}, scene);
  const c = MeshBuilder.CreateBox("overflow", {}, scene);
  const material = new StandardMaterial("draw material", scene);
  a.material = b.material = c.material = material;
  const failure = new Error("scene failure");
  const original = Mesh.prototype.render;
  Mesh.prototype.render = function (subMesh, alpha) {
    subMesh.getMaterial();
    if (this === a) {
      at(6);
      b.render(b.subMeshes[0], alpha);
      at(15);
    } else if (this === b) {
      at(11);
    } else {
      at(19);
      throw failure;
    }
    return this;
  };
  const profile = new DenseMeshDrawProfile(scene, now, 2);
  try {
    profile.beginFrame(0);
    scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
    at(4);
    a.render(a.subMeshes[0], false);
    at(16);
    assert.throws(
      () => c.render(c.subMeshes[0], false),
      (error) => error === failure,
    );
    at(21);
    const first = profile.endFrame();
    assert.equal(first.incompletePhases, 1);
    assert.equal(first.meshCalls, 3);
    assert.equal(first.recordedCalls, 2);
    assert.equal(first.droppedCalls, 1);
    assert.equal(first.nestedCalls, 1);
    assert.equal(first.failedCalls, 1);
    assert.equal(first.meshRenderMs, 14);
    assert.equal(first.meshMaterialMs, 11);

    profile.beginFrame(25);
    profile.endFrame();
    const details = profile.summarize(first);
    assert.equal(details.topAttempts[0].durationMs, 11);
    assert.equal(details.topAttempts[0].selfMs, 6);
    assert.equal(details.topAttempts[1].durationMs, 5);
    assert.equal(details.topAttempts[1].mesh.name, "nested");
  } finally {
    profile.dispose();
    Mesh.prototype.render = original;
    dispose();
  }
});

test("filters unrelated scenes and passes, and anonymizes avatar resources in the retained detail", () => {
  const { scene, engine, camera, at, now, dispose } = fixture();
  const otherScene = new Scene(engine);
  const foreign = MeshBuilder.CreateBox("foreign scene mesh", {}, otherScene);
  const avatar = MeshBuilder.CreateBox("personal avatar mesh", {}, scene);
  avatar.parent = new TransformNode("avatar account-secret", scene);
  avatar.material = new StandardMaterial("personal appearance material", scene);
  const original = Mesh.prototype.render;
  Mesh.prototype.render = function (subMesh) {
    subMesh.getMaterial();
    at(now() + 3);
    return this;
  };
  const profile = new DenseMeshDrawProfile(scene, now);
  try {
    profile.beginFrame(0);
    scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
    foreign.render(foreign.subMeshes[0], false);
    engine.currentRenderPassId = camera.renderPassId + 1;
    avatar.render(avatar.subMeshes[0], false);
    engine.currentRenderPassId = camera.renderPassId;
    avatar.render(avatar.subMeshes[0], false);
    scene.onAfterDrawPhaseObservable.notifyObservers(scene);
    const result = profile.summarize(profile.endFrame());
    assert.equal(result.meshCalls, 1);
    assert.equal(result.meshRenderMs, 3);
    assert.equal(result.unattributedMainDrawMs, 6);
    assert.equal(result.topAttempts[0].mesh.name, "avatar");
    assert.equal(result.topAttempts[0].material?.name, "avatar material");
    assert.doesNotMatch(
      JSON.stringify(result),
      /personal|account-secret|foreign scene mesh/,
    );
  } finally {
    profile.dispose();
    Mesh.prototype.render = original;
    otherScene.dispose();
    dispose();
  }
});
