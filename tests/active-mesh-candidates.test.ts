import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Skeleton } from "@babylonjs/core/Bones/skeleton";
import { MorphTargetManager } from "@babylonjs/core/Morph/morphTargetManager";
import { BoundingInfo } from "@babylonjs/core/Culling/boundingInfo";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import { EnabledMeshCandidates } from "../client/active-mesh-candidates";
import { TreeWindPlugin } from "../client/tree-wind";
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
  floor.metadata = { staticCandidate: true };
  floor.freezeWorldMatrix();
  const disabled = box("disabled remote detail", 8);
  disabled.metadata = { staticCandidate: true };
  disabled.freezeWorldMatrix();
  disabled.setEnabled(false);
  const outside = box("static outside camera", 8);
  outside.position.x = 900;
  outside.metadata = { staticCandidate: true };
  outside.freezeWorldMatrix();
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
  const cache = new EnabledMeshCandidates(scene, original, {
    isStaticMesh: (mesh) => mesh.metadata?.staticCandidate === true,
  });
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
    scene.getActiveMeshCandidates = cached;
    cache.setStaticFrustumEnabled(false);
    const compatible = await capture(cached);
    assert.deepEqual(compatible, baseline);
    cache.setStaticFrustumEnabled(true);
    const candidate = await capture(cached);
    assert.deepEqual(candidate, baseline);
    assert.ok(cache.stats.lastRenderRejected >= 1);
    assert.ok(candidate.draws.length > 0);
    assert.ok(candidate.shadowDraws.length > 0);
  }
  cache.dispose();
  scene.dispose();
  engine.dispose();
});

function staticFixture(t: import("node:test").TestContext) {
  const base = fixture();
  const { scene, engine } = base;
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("static-camera", new Vector3(0, 2, 0), scene);
  camera.setTarget(new Vector3(0, 2, 20));
  scene.activeCamera = camera;
  const material = new StandardMaterial("static-material", scene);
  material.disableLighting = true;
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  const box = (name: string, x = 500, updatable = false) => {
    const mesh = MeshBuilder.CreateBox(name, { updatable }, scene);
    mesh.position.set(x, 2, 10);
    mesh.material = material;
    mesh.metadata = { staticCandidate: true };
    mesh.freezeWorldMatrix();
    return mesh;
  };
  return { ...base, camera, material, box };
}
const attestedStatic = (mesh: Mesh) => mesh.metadata?.staticCandidate === true;
function evaluationCandidates(scene: Scene, mutate?: () => void) {
  scene.updateTransformMatrix();
  scene.onBeforeActiveMeshesEvaluationObservable.notifyObservers(scene);
  mutate?.();
  const result = scene.getActiveMeshCandidates();
  const names = result.data.slice(0, result.length).map((mesh) => mesh.name);
  scene.onAfterActiveMeshesEvaluationObservable.notifyObservers(scene);
  return names;
}

test("static clipping needs explicit opt-in/attestation and retains native-render stats across later diagnostic queries", async (t) => {
  const { scene, original, camera, box, names } = staticFixture(t);
  const inside = box("inside", 0),
    outside = box("outside"),
    unknown = box("unattested", 600);
  unknown.metadata = null;
  const cache = new EnabledMeshCandidates(scene, original, {
    isStaticMesh: attestedStatic,
  });
  assert.deepEqual(evaluationCandidates(scene), [
    inside.name,
    outside.name,
    unknown.name,
  ]);
  assert.equal(cache.stats.lastRenderBypassReason, "disabled");
  cache.setStaticFrustumEnabled(true);
  assert.deepEqual(
    names(),
    [inside.name, outside.name, unknown.name],
    "outside native evaluation never consumes old frustum",
  );
  assert.equal(cache.stats.bypassReason, "outside-evaluation");
  for (let i = 0; i < 3; i++) {
    scene.render();
    await nextTask();
  }
  assert.equal(cache.stats.lastRenderSource, 3);
  assert.equal(cache.stats.lastRenderOutput, 2);
  assert.equal(cache.stats.lastRenderRejected, 1);
  const last = {
    source: cache.stats.lastRenderSource,
    output: cache.stats.lastRenderOutput,
    rejected: cache.stats.lastRenderRejected,
  };
  camera.position.x = 500;
  camera.setTarget(new Vector3(500, 2, 20));
  assert.deepEqual(names(), [inside.name, outside.name, unknown.name]);
  assert.deepEqual(
    {
      source: cache.stats.lastRenderSource,
      output: cache.stats.lastRenderOutput,
      rejected: cache.stats.lastRenderRejected,
    },
    last,
  );
  scene.render();
  const active = scene.getActiveMeshes();
  assert.ok(active.data.slice(0, active.length).includes(outside));
  assert.ok(!active.data.slice(0, active.length).includes(inside));
  cache.dispose();
  const unowned = new EnabledMeshCandidates(scene, original, {
    earlyStaticFrustum: true,
  });
  assert.equal(unowned.setStaticFrustumEnabled(true), false);
  assert.deepEqual(evaluationCandidates(scene), [
    inside.name,
    outside.name,
    unknown.name,
  ]);
  assert.equal(unowned.stats.lastRenderBypassReason, "unattested");
  unowned.dispose();
});

test("unsafe dynamic, instance, LOD, skinning, morph, wind, shared or uncertain bounds stay native candidates", (t) => {
  const { scene, original, box } = staticFixture(t);
  const safe = box("safe-static");
  const dynamic = box("unfrozen");
  dynamic.unfreezeWorldMatrix();
  const invisible = box("invisible-master");
  invisible.isVisible = false;
  const instanced = box("instance-source");
  const instance = instanced.createInstance("instance");
  const thin = box("thin");
  thin.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(Matrix.Identity().asArray()),
    16,
    true,
  );
  const lod = box("lod");
  lod.addLODLevel(20, box("lod-model"));
  const skinned = box("skinned");
  skinned.skeleton = new Skeleton("s", "s", scene);
  const morph = box("morph");
  morph.morphTargetManager = new MorphTargetManager(scene);
  const windy = box("windy");
  const windMaterial = new PBRMaterial("wind", scene);
  new TreeWindPlugin(windMaterial, { time: 0, x: 0, z: 0 });
  windy.material = windMaterial;
  const shader = box("custom-vertex-shader");
  shader.material = new ShaderMaterial("custom", scene, "unused", {});
  const updatable = box("updatable", 500, true);
  const locked = box("locked-bounds");
  locked.getBoundingInfo().isLocked = true;
  const invalid = box("invalid-bounds");
  invalid.setBoundingInfo(
    new BoundingInfo(new Vector3(NaN, 0, 0), new Vector3(NaN, 1, 1)),
  );
  const always = box("always");
  always.alwaysSelectAsActiveMesh = true;
  const shared = box("shared");
  const clone = shared.clone("shared-clone")!;
  const billboard = box("billboard");
  billboard.billboardMode = Mesh.BILLBOARDMODE_ALL;
  const cache = new EnabledMeshCandidates(scene, original, {
    earlyStaticFrustum: true,
    isStaticMesh: attestedStatic,
  });
  const names = evaluationCandidates(scene);
  assert.ok(!names.includes(safe.name));
  for (const mesh of [
    dynamic,
    invisible,
    instanced,
    instance,
    thin,
    lod,
    skinned,
    morph,
    windy,
    shader,
    updatable,
    locked,
    invalid,
    always,
    shared,
    clone,
    billboard,
  ])
    assert.ok(names.includes(mesh.name), mesh.name);
  assert.equal(cache.stats.staticRejected, 1);
  assert.ok(cache.stats.unsafeStatic >= 16);
  cache.dispose();
});

test("local/parent transform, geometry and material changes cannot reuse stale eligibility or bounds", (t) => {
  const { scene, original, material, box } = staticFixture(t);
  const mesh = box("mutable-after-attestation");
  const cache = new EnabledMeshCandidates(scene, original, {
    earlyStaticFrustum: true,
    isStaticMesh: attestedStatic,
  });
  assert.deepEqual(evaluationCandidates(scene), []);
  mesh.position.x = 0;
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  assert.equal(
    cache.stats.unsafeStatic,
    1,
    "frozen flag alone cannot hide dirty transform",
  );
  mesh.unfreezeWorldMatrix();
  mesh.freezeWorldMatrix();
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  assert.equal(cache.stats.staticTests, 1);
  mesh.unfreezeWorldMatrix();
  mesh.position.x = 500;
  mesh.freezeWorldMatrix();
  const parent = new TransformNode("changed-parent", scene);
  parent.computeWorldMatrix(true);
  mesh.parent = parent;
  assert.deepEqual(
    evaluationCandidates(scene),
    [mesh.name],
    "reparent is not a certified unchanged world matrix",
  );
  mesh.unfreezeWorldMatrix();
  mesh.freezeWorldMatrix();
  assert.deepEqual(evaluationCandidates(scene), []);
  parent.position.x = -500;
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  parent.computeWorldMatrix(true);
  assert.deepEqual(
    evaluationCandidates(scene),
    [mesh.name],
    "parent version changed even once its own matrix is clean",
  );
  mesh.unfreezeWorldMatrix();
  mesh.freezeWorldMatrix();
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  mesh.parent = null;
  mesh.unfreezeWorldMatrix();
  mesh.position.x = 500;
  mesh.freezeWorldMatrix();
  const positions = mesh.getVerticesData("position")!.slice();
  for (let index = 0; index < positions.length; index += 3)
    positions[index] -= 500;
  mesh.setVerticesData("position", positions, false);
  assert.deepEqual(
    evaluationCandidates(scene),
    [mesh.name],
    "new immutable geometry reads its new bounds",
  );
  assert.equal(cache.stats.staticTests, 1);
  mesh.setVerticesData("position", positions, true);
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  assert.equal(cache.stats.unsafeStatic, 1);
  mesh.setVerticesData("position", positions, false);
  mesh.material = new ShaderMaterial(
    "uncertain-deformation",
    scene,
    "unused",
    {},
  );
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  assert.equal(cache.stats.unsafeStatic, 1);
  mesh.material = material;
  assert.equal(evaluationCandidates(scene).length, 1);
  assert.equal(
    cache.stats.unsafeStatic,
    1,
    "recreated geometry bounds can still carry identity while frozen world is translated",
  );
  mesh.refreshBoundingInfo();
  assert.equal(evaluationCandidates(scene).length, 1);
  assert.equal(cache.stats.staticTests, 1);
  cache.dispose();
});

test("changed frustum/camera, multicamera, custom LOD and clipping bypass retain complete enabled source", (t) => {
  const { scene, original, camera, box } = staticFixture(t);
  const mesh = box("outside"),
    second = new FreeCamera("second", new Vector3(500, 2, 0), scene);
  second.setTarget(new Vector3(500, 2, 20));
  const cache = new EnabledMeshCandidates(scene, original, {
    earlyStaticFrustum: true,
    isStaticMesh: attestedStatic,
  });
  assert.deepEqual(evaluationCandidates(scene), []);
  assert.deepEqual(
    evaluationCandidates(scene, () => {
      scene.activeCamera = second;
    }),
    [mesh.name],
  );
  assert.equal(cache.stats.bypassReason, "camera");
  scene.activeCamera = camera;
  assert.deepEqual(
    evaluationCandidates(scene, () => {
      scene.setTransformMatrix(Matrix.Identity(), Matrix.Identity());
    }),
    [mesh.name],
  );
  assert.equal(cache.stats.bypassReason, "frustum");
  scene.activeCameras = [camera, second];
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  assert.equal(cache.stats.bypassReason, "camera");
  scene.activeCameras = [];
  scene.skipFrustumClipping = true;
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  assert.equal(cache.stats.bypassReason, "clipping");
  scene.skipFrustumClipping = false;
  scene.customLODSelector = (candidate) => candidate;
  assert.deepEqual(evaluationCandidates(scene), [mesh.name]);
  assert.equal(cache.stats.bypassReason, "selector");
  cache.dispose();
});

test("static opt-in retains foreign-provider ownership, releases observers and cannot filter after disposal", async (t) => {
  const { scene, original, box } = staticFixture(t);
  box("outside");
  const observables = [
    scene.onBeforeActiveMeshesEvaluationObservable,
    scene.onAfterActiveMeshesEvaluationObservable,
  ];
  const before = observables.map((observable) => observable.observers.length);
  const cache = new EnabledMeshCandidates(scene, original, {
    earlyStaticFrustum: true,
    isStaticMesh: attestedStatic,
  });
  const retained = scene.getActiveMeshCandidates;
  assert.deepEqual(evaluationCandidates(scene), []);
  const custom = () => ({ data: [] as Mesh[], length: 0 });
  scene.getActiveMeshCandidates = custom;
  assert.equal(cache.setStaticFrustumEnabled(true), false);
  scene.onBeforeActiveMeshesEvaluationObservable.notifyObservers(scene);
  assert.equal(retained().data, scene.meshes);
  assert.equal(cache.stats.bypassReason, "provider");
  cache.dispose();
  cache.dispose();
  assert.equal(scene.getActiveMeshCandidates, custom);
  assert.equal(retained().data, scene.meshes);
  assert.equal(cache.stats.bypassReason, "disposed");
  await nextTask();
  assert.deepEqual(
    observables.map((observable) => observable.observers.length),
    before,
  );
  scene.getActiveMeshCandidates = original;
  const failingAttestation = new EnabledMeshCandidates(scene, original, {
    earlyStaticFrustum: true,
    isStaticMesh: () => {
      throw new Error("fixture");
    },
  });
  assert.deepEqual(evaluationCandidates(scene), ["outside"]);
  assert.equal(failingAttestation.stats.attestationErrors, 1);
  failingAttestation.dispose();
});

test("early static rejection preserves actual transparent draw order across camera changes and same-task mesh replacement", async (t) => {
  const { scene, original, camera, material, box } = staticFixture(t);
  material.alpha = 0.4;
  const left = box("transparent-left", -1),
    right = box("transparent-right", 1);
  const far = box("outside-transparent", 700);
  const cache = new EnabledMeshCandidates(scene, original, {
    isStaticMesh: attestedStatic,
  });
  const drawn: string[] = [];
  for (const mesh of [left, right, far])
    mesh.onBeforeBindObservable.add(() => drawn.push(mesh.name));
  async function capture(enabled: boolean) {
    cache.setStaticFrustumEnabled(enabled);
    for (let frame = 0; frame < 3; frame++) {
      scene.render();
      await nextTask();
    }
    drawn.length = 0;
    scene.render();
    const active = scene.getActiveMeshes();
    return {
      draws: [...drawn],
      active: active.data.slice(0, active.length).map((mesh) => mesh.name),
      indices: scene.getActiveIndices(),
    };
  }
  for (const reverse of [false, true]) {
    if (reverse) {
      camera.position.z = 20;
      camera.setTarget(new Vector3(0, 2, 0));
    }
    const baseline = await capture(false),
      filtered = await capture(true);
    assert.deepEqual(filtered, baseline);
    assert.equal(filtered.draws.length, 2);
    assert.equal(cache.stats.lastRenderRejected, 1);
  }
  far.dispose();
  const replacement = box("same-task-replacement", 800);
  const visible = box("same-task-visible", 0);
  assert.deepEqual(evaluationCandidates(scene), [
    left.name,
    right.name,
    visible.name,
  ]);
  assert.equal(cache.stats.staticRejected, 1);
  replacement.setEnabled(false);
  visible.setEnabled(false);
  assert.deepEqual(evaluationCandidates(scene), [left.name, right.name]);
  visible.setEnabled(true);
  assert.deepEqual(evaluationCandidates(scene), [
    left.name,
    right.name,
    visible.name,
  ]);
  cache.dispose();
});
