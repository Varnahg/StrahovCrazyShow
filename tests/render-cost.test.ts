import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  captureRenderCostInventory,
  renderMeshIdentity,
} from "../client/render-cost";
import "@babylonjs/core/Meshes/instancedMesh";
import "@babylonjs/core/Meshes/thinInstanceMesh";
import "../client/render-shaders";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
function fixture(t: TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("camera", new Vector3(0, 2, -10), scene);
  camera.setTarget(new Vector3(0, 2, 10));
  scene.activeCamera = camera;
  const material = new StandardMaterial("fixture", scene);
  material.disableLighting = true;
  const box = (name: string, x = 0) => {
    const mesh = MeshBuilder.CreateBox(name, {}, scene);
    mesh.position.set(x, 2, 10);
    mesh.material = material;
    return mesh;
  };
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return { scene, material, box };
}

test("inventory separates the real last active list from enabled scene geometry and never forces renderer state", async (t) => {
  const { scene, material, box } = fixture(t);
  const inside = box("inside");
  inside.freezeWorldMatrix();
  box("outside", 1000);
  const disabled = box("disabled");
  disabled.setEnabled(false);
  const source = box("instance-source");
  source.isVisible = false;
  const instance = source.createInstance("instance");
  instance.position.set(2, 2, 10);
  instance.isVisible = true;
  const thin = box("thin", -2);
  thin.thinInstanceSetBuffer(
    "matrix",
    new Float32Array(Matrix.Identity().asArray()),
    16,
    true,
  );
  material.maxSimultaneousLights = 43;
  new DirectionalLight("enabled", Vector3.Down(), scene);
  const off = new DirectionalLight("disabled-light", Vector3.Down(), scene);
  off.setEnabled(false);
  for (let frame = 0; frame < 3; frame++) {
    scene.render();
    await flush();
  }
  const active = scene.getActiveMeshes();
  const expectedNames = active.data
    .slice(0, active.length)
    .map((mesh) => mesh.name);
  assert.deepEqual(
    new Set(expectedNames),
    new Set([inside.name, instance.name, thin.name]),
  );
  const restore: (() => void)[] = [];
  for (const mesh of scene.meshes) {
    const world = mesh.computeWorldMatrix,
      ready = mesh.isReady;
    mesh.computeWorldMatrix = () => {
      throw Error("inventory changed matrices");
    };
    mesh.isReady = () => {
      throw Error("inventory queried readiness");
    };
    restore.push(() => {
      mesh.computeWorldMatrix = world;
      mesh.isReady = ready;
    });
    for (const sub of mesh.subMeshes ?? []) {
      const get = sub.getMaterial;
      sub.getMaterial = () => {
        throw Error("inventory reset material draw cache");
      };
      restore.push(() => {
        sub.getMaterial = get;
      });
    }
  }
  try {
    const report = captureRenderCostInventory(scene);
    assert.equal(report.enabledVisibleGeometryMeshes, 4);
    assert.equal(report.active.geometryMeshes, 3);
    assert.equal(report.active.frozenWorldMatrices, 1);
    assert.equal(report.active.regularInstances, 1);
    assert.equal(report.active.meshesWithThinInstances, 1);
    assert.equal(report.active.thinInstances, 1);
    assert.equal(report.active.potentialSubmeshes, 3);
    assert.deepEqual(
      new Set(report.active.meshes.map((mesh) => mesh.name)),
      new Set(expectedNames),
    );
    assert.equal(
      report.active.meshes.find((mesh) => mesh.name === instance.name)
        ?.sourceMesh,
      source.name,
    );
    assert.equal(report.maxSimultaneousLights.max, 43);
    const group = report.materialLightGroups.find(
      (group) => group.materialId === material.uniqueId,
    )!;
    assert.equal(group.enabledMeshes, 4);
    assert.equal(group.activeMeshes, 3);
    assert.deepEqual(group.enabledLightSourcesHistogram, { "1": 4 });
    assert.equal(group.maxSimultaneousLights, 43);
    assert.equal(report.enabledLights, 1);
  } finally {
    for (const reset of restore.reverse()) reset();
  }
});

test("actual material caps and declared MultiMaterial assignments remain separate from enabled light counts", (t) => {
  const { scene, material, box } = fixture(t);
  material.maxSimultaneousLights = 43;
  const other = new StandardMaterial("other", scene);
  other.maxSimultaneousLights = 8;
  const left = box("left"),
    right = box("right");
  right.material = other;
  const merged = Mesh.MergeMeshes(
    [left, right],
    true,
    true,
    undefined,
    false,
    true,
  )!;
  new DirectionalLight("enabled", Vector3.Down(), scene);
  for (let index = 0; index < 42; index++)
    new DirectionalLight("off-" + index, Vector3.Down(), scene).setEnabled(
      false,
    );
  scene.getActiveMeshes().push(merged); // explicit cached active membership fixture
  const before = captureRenderCostInventory(scene);
  assert.equal(before.lights, 43);
  assert.equal(before.enabledLights, 1);
  assert.equal(before.maxSimultaneousLights.min, 8);
  assert.equal(before.maxSimultaneousLights.max, 43);
  assert.equal(before.maxSimultaneousLights.histogram["43"], 1);
  assert.equal(before.maxSimultaneousLights.histogram["8"], 1);
  assert.equal(before.maxSimultaneousLights.histogram.unavailable, 1);
  for (const assigned of [material, other]) {
    const group = before.materialLightGroups.find(
      (group) => group.materialId === assigned.uniqueId,
    )!;
    assert.equal(group.enabledMeshes, 1);
    assert.equal(group.activeMeshes, 1);
    assert.equal(group.minEnabledLightSources, 1);
    assert.equal(group.maxEnabledLightSources, 1);
  }
  material.maxSimultaneousLights = 4;
  const after = captureRenderCostInventory(scene);
  assert.equal(after.maxSimultaneousLights.min, 4);
  assert.equal(after.maxSimultaneousLights.max, 8);
  assert.equal(
    before.maxSimultaneousLights.max,
    43,
    "earlier inventory is a value snapshot, not live material references",
  );
});

test("on-demand details have bounded output with complete aggregates and technical source inheritance", (t) => {
  const { scene, box } = fixture(t);
  const parent = new TransformNode("asset-root", scene);
  parent.metadata = { sourcePack: "architecture-reality" };
  for (let index = 0; index < 7; index++) {
    const mesh = box("long-" + index + "x".repeat(150));
    mesh.parent = parent;
    scene.getActiveMeshes().push(mesh);
  }
  const result = captureRenderCostInventory(scene, { detailLimit: 2 });
  assert.equal(result.active.geometryMeshes, 7);
  assert.equal(result.active.meshes.length, 2);
  assert.equal(result.active.detailsOmitted, 5);
  assert.ok(
    result.active.meshes.every(
      (mesh) =>
        mesh.source === "architecture-reality" && mesh.name.length <= 96,
    ),
  );
  const first = scene.meshes[0];
  first.metadata = { sourcePack: "own-source" };
  assert.equal(renderMeshIdentity(first).source, "own-source");
  assert.equal(result.active.meshes[0].source, "architecture-reality");
  assert.equal(
    captureRenderCostInventory(scene, { detailLimit: 0 }).active.detailsOmitted,
    7,
  );
});
