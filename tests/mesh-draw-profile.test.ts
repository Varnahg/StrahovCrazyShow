import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshDrawProfile } from "../client/mesh-draw-profile";
import "@babylonjs/core/Meshes/instancedMesh";
import "../client/render-shaders";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
function fixture(t: TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 2, -10), scene);
  camera.setTarget(new Vector3(0, 2, 10));
  scene.activeCamera = camera;
  let time = 0,
    reads = 0;
  const material = new StandardMaterial("default-fixture", scene);
  material.disableLighting = true;
  const mesh = (name: string, source = "fixture-source") => {
    const mesh = MeshBuilder.CreateBox(name, {}, scene);
    mesh.position.set(0, 2, 10);
    mesh.material = material;
    mesh.metadata = { sourcePack: source };
    return mesh;
  };
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return {
    engine,
    scene,
    mesh,
    material,
    at: (value: number) => {
      time = value;
    },
    now: () => {
      reads++;
      return time;
    },
    reads: () => reads,
  };
}
function complete(
  mesh: Mesh,
  material: StandardMaterial,
  at: (n: number) => void,
  start: number,
  bind: number,
  end: number,
) {
  at(start);
  mesh.onBeforeRenderObservable.notifyObservers(mesh);
  at(bind);
  mesh.onBeforeBindObservable.notifyObservers(mesh);
  material.onBindObservable.notifyObservers(mesh);
  at(end);
  mesh.onAfterRenderObservable.notifyObservers(mesh);
}

test("sampled completed chains attribute preparation/bind CPU to effective material and source; idle never reads the clock", (t) => {
  const { scene, mesh, material, at, now, reads } = fixture(t);
  const a = mesh("mesh-a"),
    b = mesh("mesh-b", "other-source");
  const other = new StandardMaterial("effective-child", scene);
  const multi = new MultiMaterial("declared-container", scene);
  multi.subMaterials = [material, other];
  b.material = multi;
  const profile = new MeshDrawProfile(scene, now);
  t.after(() => profile.dispose());
  profile.beginFrame();
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  complete(a, material, at, 1, 3, 7);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  assert.equal(profile.endFrame(), null);
  assert.equal(reads(), 0);
  at(0);
  profile.beginFrame("periodic");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  complete(a, material, at, 1, 3, 7);
  complete(b, other, at, 8, 10, 15);
  at(20);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const result = profile.endFrame()!;
  assert.equal(result.reason, "periodic");
  assert.equal(result.mainDrawCpuMs, 20);
  assert.deepEqual(result.completed, {
    calls: 2,
    cpuMs: 13,
    preparationMs: 4,
    bindDrawMs: 9,
  });
  assert.deepEqual(
    result.topMeshes.map((g) => g.name),
    ["mesh-b", "mesh-a"],
  );
  assert.ok(result.topMaterials.some((g) => g.name === "effective-child"));
  assert.ok(!result.topMaterials.some((g) => g.name === "declared-container"));
  assert.equal(result.counts.unknownMaterials, 0);
  assert.equal(result.topSources[0].source, "other-source");
  const used = reads();
  profile.beginFrame();
  complete(a, material, at, 30, 40, 50);
  assert.equal(profile.endFrame(), null);
  assert.equal(reads(), used);
  assert.equal(result.completed.calls, 2);
});

test("early returns and ambiguous same-mesh/nested chains cannot borrow a later completion", (t) => {
  const { scene, mesh, material, at, now } = fixture(t);
  const a = mesh("early-return"),
    b = mesh("completed");
  const profile = new MeshDrawProfile(scene, now);
  t.after(() => profile.dispose());
  profile.beginFrame("action");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  at(1);
  a.onBeforeRenderObservable.notifyObservers(a); // native readiness returns false
  complete(a, material, at, 1000, 1001, 1002); // ambiguous, omitted in this phase
  complete(b, material, at, 1003, 1005, 1008);
  at(1009);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const first = profile.endFrame()!;
  assert.equal(first.completed.cpuMs, 5);
  assert.equal(first.completed.calls, 1);
  assert.equal(first.counts.abandoned, 1);
  assert.equal(first.counts.ambiguousSkipped, 1);
  assert.deepEqual(
    first.topMeshes.map((g) => g.name),
    [b.name],
  );
  profile.beginFrame("next");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  at(1010);
  a.onBeforeRenderObservable.notifyObservers(a);
  complete(b, material, at, 1011, 1012, 1013); // nested b abandons outer a
  at(1014);
  a.onBeforeBindObservable.notifyObservers(a);
  a.onAfterRenderObservable.notifyObservers(a);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const nested = profile.endFrame()!;
  assert.equal(nested.completed.cpuMs, 2);
  assert.equal(nested.counts.abandoned, 1);
  profile.beginFrame("recovered");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  complete(a, material, at, 1020, 1022, 1024);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  assert.equal(profile.endFrame()!.completed.cpuMs, 4);
});

test("foreign render passes, interrupted phases, removed resources and unmatched events do not become completed CPU", (t) => {
  const { engine, scene, mesh, material, at, now } = fixture(t);
  const a = mesh("interrupted");
  const profile = new MeshDrawProfile(scene, now);
  t.after(() => profile.dispose());
  const mainPass = engine.currentRenderPassId;
  profile.beginFrame("interrupt");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  at(1);
  a.onBeforeRenderObservable.notifyObservers(a);
  engine.currentRenderPassId = mainPass + 100;
  complete(a, material, at, 10, 20, 30);
  engine.currentRenderPassId = mainPass;
  a.onAfterRenderObservable.notifyObservers(a);
  const interrupted = profile.endFrame()!;
  assert.equal(interrupted.completed.calls, 0);
  assert.equal(interrupted.counts.abandoned, 1);
  assert.equal(interrupted.counts.incompletePhases, 1);
  profile.beginFrame("removed");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  at(31);
  a.onBeforeRenderObservable.notifyObservers(a);
  scene.removeMesh(a);
  at(100);
  a.onAfterRenderObservable.notifyObservers(a);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const removed = profile.endFrame()!;
  assert.equal(removed.completed.calls, 0);
  assert.equal(removed.counts.abandoned, 1);
  a.dispose();
});

test("top eight and time budget are bounded while omitted costs retain exact measured totals", (t) => {
  const { scene, mesh, material, at, now } = fixture(t);
  const meshes = Array.from({ length: 12 }, (_, i) =>
    mesh("mesh-" + i, "source-" + i),
  );
  const profile = new MeshDrawProfile(scene, now);
  t.after(() => profile.dispose());
  profile.beginFrame("many");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  for (let i = 0; i < meshes.length; i++)
    complete(meshes[i], material, at, i * 20, i * 20 + 1, i * 20 + i + 2);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const top = profile.endFrame()!;
  assert.equal(top.topMeshes.length, 8);
  assert.equal(top.topSources.length, 8);
  assert.equal(top.topMeshes[0].name, "mesh-11");
  assert.equal(
    top.topMeshes.reduce((sum, g) => sum + g.cpuMs, 0) +
      top.omitted.meshes.cpuMs,
    top.completed.cpuMs,
  );
  assert.equal(top.omitted.meshes.calls, 4);
  profile.beginFrame("budget");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  for (let i = 0; i < 2060; i++)
    complete(meshes[0], material, at, i * 3, i * 3 + 1, i * 3 + 2);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const budget = profile.endFrame()!;
  assert.equal(budget.completed.calls, 2048);
  assert.equal(budget.counts.budgetSkipped, 12);
  assert.equal(budget.completed.cpuMs, 4096);
});

test("real Babylon mesh.render observer order yields effective MultiMaterial children and omits not-ready attempts", async (t) => {
  const { scene, mesh, material, now } = fixture(t);
  const first = mesh("first"),
    second = mesh("second");
  const other = new StandardMaterial("second-material", scene);
  other.disableLighting = true;
  second.material = other;
  const merged = Mesh.MergeMeshes(
    [first, second],
    true,
    true,
    undefined,
    false,
    true,
  )!;
  merged.metadata = { sourcePack: "merged-fixture" };
  const profile = new MeshDrawProfile(scene, now);
  t.after(() => profile.dispose());
  for (let i = 0; i < 3; i++) {
    scene.render();
    await flush();
  }
  profile.beginFrame("actual-render");
  scene.render();
  const actual = profile.endFrame()!;
  assert.equal(actual.completed.calls, 2);
  assert.deepEqual(
    new Set(actual.topMaterials.map((g) => g.name)),
    new Set([material.name, other.name]),
  );
  const ready = material.isReadyForSubMesh.bind(material);
  let fail = true;
  material.isReadyForSubMesh = (...args) =>
    fail ? (fail = false) : ready(...args);
  profile.beginFrame("actual-early-return");
  scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
  merged.render(merged.subMeshes[0], false);
  merged.render(merged.subMeshes[0], false);
  scene.onAfterDrawPhaseObservable.notifyObservers(scene);
  const incomplete = profile.endFrame()!;
  assert.equal(incomplete.completed.calls, 0);
  assert.equal(incomplete.counts.abandoned, 1);
  assert.equal(incomplete.counts.ambiguousSkipped, 1);
});

test("incremental and same-task additions are observed; unknown material and repeated disposal are explicit", async (t) => {
  const { scene, mesh, material, at, now } = fixture(t);
  const stable = mesh("stable");
  const originals = [
    scene.onNewMeshAddedObservable,
    scene.onMeshRemovedObservable,
    scene.onNewMaterialAddedObservable,
    scene.onMaterialRemovedObservable,
    scene.onBeforeDrawPhaseObservable,
    scene.onAfterDrawPhaseObservable,
    stable.onBeforeRenderObservable,
    stable.onBeforeBindObservable,
    stable.onAfterRenderObservable,
    material.onBindObservable,
  ];
  const before = originals.map((o) => o.observers.length);
  for (let n = 0; n < 3; n++) {
    const profile = new MeshDrawProfile(scene, now);
    const added = mesh("same-task");
    profile.beginFrame("added");
    scene.onBeforeDrawPhaseObservable.notifyObservers(scene);
    complete(added, material, at, 1, 2, 3);
    at(4);
    stable.onBeforeRenderObservable.notifyObservers(stable);
    at(5);
    stable.onBeforeBindObservable.notifyObservers(stable);
    at(6);
    stable.onAfterRenderObservable.notifyObservers(stable); // no observed effective bind
    scene.onAfterDrawPhaseObservable.notifyObservers(scene);
    const result = profile.endFrame()!;
    assert.equal(result.completed.calls, 2);
    assert.equal(result.counts.unknownMaterials, 1);
    assert.ok(result.topMaterials.some((g) => g.kind === "unknown"));
    profile.dispose();
    profile.dispose();
    added.dispose();
    await flush();
    assert.deepEqual(
      originals.map((o) => o.observers.length),
      before,
    );
  }
});
