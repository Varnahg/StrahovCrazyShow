import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { PointLight } from "@babylonjs/core/Lights/pointLight";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { B6RealityController } from "../client/b6-reality";
import { VehicleLighting } from "../client/vehicle-lighting";
import { getWorldAssetRoot } from "../client/world-asset-identity";
import { osmAssetIdentity } from "../shared/world-asset-identity";
import { B6_LAYOUT } from "../shared/b6-interior";

const stairPosition = { x: 0.9067, y: 4.12, z: -36.4246 };
const identity = osmAssetIdentity("building", "way", "B6-render-regression");

function closeVector(actual: Vector3, expected: Vector3, message: string) {
  assert.ok(
    Vector3.Distance(actual, expected) < 0.0001,
    `${message}: ${actual.toString()} != ${expected.toString()}`,
  );
}

async function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("B6 observer", new Vector3(1, 5, -36), scene);
  scene.activeCamera = camera;
  const root = getWorldAssetRoot(scene, identity, {
    x: 8,
    y: B6_LAYOUT.foundationOffset,
    z: -55,
  });
  const controller = new B6RealityController(scene);
  controller.attachToBuilding(root);
  const children = root.getChildMeshes();
  const light = scene.lights.find(
    (item) => item.name === "b6 nearest corridor fixture fill",
  )! as PointLight;
  const beam = new VehicleLighting(scene, "player");
  t.after(() => {
    beam.dispose();
    controller.dispose();
    scene.dispose();
    engine.dispose();
  });
  // Drive the real 250ms caster refresh deterministically, without elapsed-time
  // assertions or a render loop. Keep actual bounds/frustum/caster code intact.
  let now = 1000;
  t.mock.method(performance, "now", () => now);
  const refreshBeam = (quality = "high") => {
    now += 300;
    beam.updateFromPose(camera.position, Vector3.Forward(), true, quality);
    const shadow = beam.light.getShadowGenerator() as ShadowGenerator;
    const map = shadow.getShadowMap()!;
    const candidates = map.renderList!;
    return map.getCustomRenderList!(0, candidates, candidates.length)!;
  };
  const settleTransforms = () => {
    scene.incrementRenderId();
    root.computeWorldMatrix();
    for (const mesh of children) mesh.computeWorldMatrix();
  };
  controller.update({ player: stairPosition, quality: "high" });
  refreshBeam();
  await new Promise<void>((resolve) => setImmediate(resolve));
  settleTransforms();
  return {
    engine,
    scene,
    camera,
    root,
    controller,
    children,
    light,
    beam,
    refreshBeam,
    settleTransforms,
  };
}

test("walking in B6 does not invalidate its static pivot or amplify the actual torch caster traversal", async (t) => {
  const f = await fixture(t);
  const attached = [...f.scene.meshes];
  const memberships = new Map(
    attached.map((mesh) => [mesh, [...mesh.lightSources]]),
  );
  const resources = f.children.map((mesh) => ({
    mesh,
    material: mesh.material,
    positions: mesh.getVertexBuffer("position"),
    indices: mesh.getIndices(),
    assetKey: mesh.metadata.assetKey,
  }));
  const casters = [...f.refreshBeam()];
  assert.ok(casters.length > 0, "the real shadow selection must be exercised");
  let rootUpdates = 0,
    childUpdates = 0;
  f.root.onAfterWorldMatrixUpdateObservable.add(() => rootUpdates++);
  for (const mesh of f.children)
    mesh.onAfterWorldMatrixUpdateObservable.add(() => childUpdates++);
  const add = t.mock.method(f.scene, "addMesh");
  const remove = t.mock.method(f.scene, "removeMesh");
  const renderId = f.scene.getRenderId();

  for (let step = 1; step <= 3; step++) {
    f.controller.update({
      player: { ...stairPosition, z: stairPosition.z + step * 0.4 },
      quality: "high",
    });
    assert.deepEqual(
      f.refreshBeam(),
      casters,
      "unchanged beam and geometry retain the same casters",
    );
  }

  assert.equal(
    f.scene.getRenderId(),
    renderId,
    "no intervening render hides an invalidation",
  );
  assert.deepEqual(
    { rootUpdates, childUpdates },
    { rootUpdates: 0, childUpdates: 0 },
    "a stationary editable pivot must not force sibling/parent recomputation during walking",
  );
  assert.equal(add.mock.callCount(), 0);
  assert.equal(remove.mock.callCount(), 0);
  assert.deepEqual(f.scene.meshes, attached);
  for (const mesh of attached)
    assert.deepEqual(mesh.lightSources, memberships.get(mesh));
  for (const item of resources) {
    assert.equal(item.mesh.material, item.material);
    assert.equal(item.mesh.getVertexBuffer("position"), item.positions);
    assert.equal(item.mesh.getIndices(), item.indices);
    assert.equal(item.mesh.metadata.assetKey, item.assetKey);
  }
});

test("same-render B6 pivot translation, rotation and scale preserve world geometry and the fill's world position", async (t) => {
  const f = await fixture(t);
  const sample = f.scene.meshes.find((mesh) => mesh.parent === f.root)!;
  const vertex = Vector3.FromArray(sample.getVerticesData("position")!);
  const initialPoint = Vector3.TransformCoordinates(
    vertex,
    sample.worldMatrixFromCache,
  );
  const initialOrigin = f.root.position.clone();
  const localPoint = initialPoint.subtract(initialOrigin);
  const renderId = f.scene.getRenderId();
  const poses = [
    { position: new Vector3(11, 2.5, -52), yaw: 0, scale: Vector3.One() },
    { position: initialOrigin, yaw: Math.PI / 2, scale: Vector3.One() },
    {
      position: new Vector3(9, 2, -54),
      yaw: 0.7,
      scale: new Vector3(1.2, 0.8, 0.7),
    },
  ];

  for (const [index, pose] of poses.entries()) {
    f.root.position.copyFrom(pose.position);
    f.root.rotation.y = pose.yaw;
    f.root.scaling.copyFrom(pose.scale);
    const player = { ...stairPosition, z: stairPosition.z + (index + 1) * 0.4 };
    f.controller.update({ player, quality: "high" });
    f.refreshBeam();
    // Independent scalar S -> Y-rotation -> T oracle, not the implementation's inverse.
    const x = localPoint.x * pose.scale.x,
      y = localPoint.y * pose.scale.y;
    const z = localPoint.z * pose.scale.z,
      cos = Math.cos(pose.yaw),
      sin = Math.sin(pose.yaw);
    const expected = new Vector3(
      pose.position.x + x * cos + z * sin,
      pose.position.y + y,
      pose.position.z - x * sin + z * cos,
    );
    closeVector(
      Vector3.TransformCoordinates(vertex, sample.worldMatrixFromCache),
      expected,
      "edited geometry",
    );
    f.light.computeTransformedInformation();
    closeVector(
      f.light.getAbsolutePosition(),
      new Vector3(8, 7.15, player.z),
      "authored fill target",
    );
    assert.equal(f.light.range, 12);
    assert.equal(f.light.intensity, 0.9);
    assert.equal(f.scene.getRenderId(), renderId);
  }
});

test("actual B6 detach/reattach at every quality retains mesh, light and source identities", async (t) => {
  const f = await fixture(t);
  const unrelated = MeshBuilder.CreateBox("foreign scene object", {}, f.scene);
  const routes = [
    stairPosition,
    { x: 3, y: 5.62, z: -74.5 },
    { x: 8, y: 8.62, z: -55 },
    { x: -4.5, y: 2.62, z: -74 },
  ];
  for (const quality of ["low", "medium", "high"])
    for (const player of routes) {
      f.controller.update({ player, quality });
      f.refreshBeam(quality);
      const visible = new Set(
        f.scene.meshes.filter((mesh) => mesh !== unrelated),
      );
      const lightMembers = new Map(
        [...visible].map((mesh) => [mesh, new Set(mesh.lightSources)]),
      );
      assert.ok(visible.size > 0);
      f.controller.update({
        player: { x: 300, y: player.y, z: player.z },
        quality,
      });
      assert.deepEqual(
        f.scene.meshes,
        [unrelated],
        "controller detaches only its own distant geometry",
      );
      assert.equal(f.controller.interiorLightEnabled, false);
      f.controller.update({ player, quality });
      f.refreshBeam(quality);
      assert.deepEqual(
        new Set(f.scene.meshes.filter((mesh) => mesh !== unrelated)),
        visible,
      );
      assert.equal(
        new Set(f.scene.meshes).size,
        f.scene.meshes.length,
        "re-entry must not duplicate meshes",
      );
      for (const mesh of visible) {
        assert.deepEqual(new Set(mesh.lightSources), lightMembers.get(mesh));
        assert.equal(mesh.metadata.assetKey, identity.key);
        assert.equal(mesh.metadata.sourceId, identity.sourceId);
      }
    }
});

test("same-render controller reparent, repeated attach and disposal preserve foreign ownership", async (t) => {
  const f = await fixture(t);
  const foreign = MeshBuilder.CreateBox("independent object", {}, f.scene);
  const replacement = new TransformNode("replacement B6 pivot", f.scene);
  replacement.metadata = { ...f.root.metadata };
  replacement.position.set(-20, 4, 7);
  replacement.rotation.y = -0.7;
  const worldPoints = f.children.map((mesh) =>
    Vector3.TransformCoordinates(
      Vector3.FromArray(mesh.getVerticesData("position")!),
      mesh.worldMatrixFromCache,
    ),
  );
  const renderId = f.scene.getRenderId();
  for (let pass = 0; pass < 2; pass++) {
    f.controller.attachToBuilding(replacement);
    f.controller.update({ player: stairPosition, quality: "high" });
    f.refreshBeam();
    f.children.forEach((mesh, index) => {
      closeVector(
        Vector3.TransformCoordinates(
          Vector3.FromArray(mesh.getVerticesData("position")!),
          mesh.worldMatrixFromCache,
        ),
        worldPoints[index],
        "reparent retains authored geometry",
      );
      assert.equal(mesh.parent, replacement);
      assert.equal(mesh.metadata.assetKey, identity.key);
    });
    assert.equal(f.light.parent, replacement);
    f.light.computeTransformedInformation();
    closeVector(
      f.light.getAbsolutePosition(),
      new Vector3(8, 7.15, stairPosition.z),
      "reparented fill",
    );
    assert.equal(f.scene.getRenderId(), renderId);
  }
  const materialCount = f.scene.materials.length;
  f.controller.dispose();
  f.controller.dispose();
  await new Promise<void>((resolve) => setImmediate(resolve));
  f.controller.update({ player: stairPosition, quality: "low" });
  assert.deepEqual(f.scene.meshes, [foreign]);
  assert.ok(f.children.every((mesh) => mesh.isDisposed()));
  assert.equal(f.light.isDisposed(), true);
  assert.ok(f.scene.materials.length < materialCount);
  assert.equal(foreign.isDisposed(), false);
  assert.equal(
    replacement.isDisposed(),
    false,
    "controller does not own the editable asset root",
  );
  assert.deepEqual(
    f.refreshBeam(),
    [],
    "disposed B6 casters are removed; the unlit foreign mesh is not a caster",
  );
  f.beam.dispose();
  f.beam.dispose();
  assert.deepEqual(f.scene.meshes, [foreign]);
});

type ScalarPose = {
  position: { x: number; y: number; z: number };
  yaw: number;
  scale: { x: number; y: number; z: number };
};

// Independent scalar S -> yaw -> T composition. Never use the root's matrix,
// inverse, or Babylon's matrix multiplication to calculate the expected point.
function scalarTransform(
  point: { x: number; y: number; z: number },
  pose: ScalarPose,
) {
  const x = point.x * pose.scale.x;
  const y = point.y * pose.scale.y;
  const z = point.z * pose.scale.z;
  const cos = Math.cos(pose.yaw);
  const sin = Math.sin(pose.yaw);
  return new Vector3(
    pose.position.x + x * cos + z * sin,
    pose.position.y + y,
    pose.position.z - x * sin + z * cos,
  );
}

function setPose(node: TransformNode, pose: ScalarPose) {
  node.position.copyFromFloats(
    pose.position.x,
    pose.position.y,
    pose.position.z,
  );
  node.rotation.y = pose.yaw;
  node.scaling.copyFromFloats(pose.scale.x, pose.scale.y, pose.scale.z);
}

test("B6 reads same-render edits through two ancestors without a stale fill transform", async (t) => {
  const f = await fixture(t);
  const sample = f.scene.meshes.find((mesh) => mesh.parent === f.root)!;
  const vertex = Vector3.FromArray(sample.getVerticesData("position")!);
  const initialPoint = Vector3.TransformCoordinates(
    vertex,
    sample.worldMatrixFromCache,
  );
  const rootPose: ScalarPose = {
    position: f.root.position.clone(),
    yaw: 0,
    scale: { x: 1, y: 1, z: 1 },
  };
  const localPoint = initialPoint.subtract(f.root.position);
  const ancestor = new TransformNode("B6 top ancestor", f.scene);
  const parent = new TransformNode("B6 direct parent", f.scene);
  parent.parent = ancestor;
  f.root.parent = parent;
  ancestor.computeWorldMatrix(true);
  parent.computeWorldMatrix(true);
  f.settleTransforms();
  const renderId = f.scene.getRenderId();
  const poses: [ScalarPose, ScalarPose][] = [
    [
      {
        position: { x: 2, y: 1, z: -3 },
        yaw: 0.35,
        scale: { x: 0.9, y: 1.2, z: 1.1 },
      },
      {
        position: { x: -1, y: 2, z: 4 },
        yaw: -0.4,
        scale: { x: 1.1, y: 0.8, z: 0.7 },
      },
    ],
    [
      {
        position: { x: -3, y: -0.5, z: 2 },
        yaw: -0.25,
        scale: { x: 1.2, y: 0.9, z: 0.8 },
      },
      {
        position: { x: -1, y: 2, z: 4 },
        yaw: -0.4,
        scale: { x: 1.1, y: 0.8, z: 0.7 },
      },
    ],
  ];
  for (const [index, [ancestorPose, parentPose]] of poses.entries()) {
    setPose(ancestor, ancestorPose);
    // The second edit touches only the top ancestor: neither the direct parent
    // nor the B6 root has a dirty local transform to substitute for recursion.
    if (index === 0) setPose(parent, parentPose);
    const player = { ...stairPosition, z: stairPosition.z + (index + 1) * 0.4 };
    const worldPoint = (point: { x: number; y: number; z: number }) =>
      scalarTransform(
        scalarTransform(scalarTransform(point, rootPose), parentPose),
        ancestorPose,
      );
    f.controller.update({ player, quality: "high" });
    // Check before the torch can synchronize anything and conceal stale reads.
    closeVector(
      Vector3.TransformCoordinates(Vector3.Zero(), f.root.worldMatrixFromCache),
      worldPoint(Vector3.Zero()),
      "B6 observes the complete ancestor chain in the same render ID",
    );
    closeVector(
      worldPoint(f.light.position),
      new Vector3(8, 7.15, player.z),
      "fill scalar world target",
    );
    f.refreshBeam();
    closeVector(
      Vector3.TransformCoordinates(vertex, sample.worldMatrixFromCache),
      worldPoint(localPoint),
      "geometry follows both ancestor S/R/T edits",
    );
    assert.equal(f.scene.getRenderId(), renderId);
  }
});

test("B6 preserves the frozen pivot contract and resumes same-render edits after unfreeze", async (t) => {
  const f = await fixture(t);
  const sample = f.scene.meshes.find((mesh) => mesh.parent === f.root)!;
  const vertex = Vector3.FromArray(sample.getVerticesData("position")!);
  const initialPoint = Vector3.TransformCoordinates(
    vertex,
    sample.worldMatrixFromCache,
  );
  const localPoint = initialPoint.subtract(f.root.position);
  const frozenPose: ScalarPose = {
    position: f.root.position.clone(),
    yaw: 0,
    scale: { x: 1, y: 1, z: 1 },
  };
  const editedPose: ScalarPose = {
    position: { x: 10, y: 1.8, z: -53 },
    yaw: 0.45,
    scale: { x: 1.2, y: 0.7, z: 0.9 },
  };
  f.root.freezeWorldMatrix();
  f.settleTransforms();
  const renderId = f.scene.getRenderId();
  let rootUpdates = 0;
  f.root.onAfterWorldMatrixUpdateObservable.add(() => rootUpdates++);
  setPose(f.root, editedPose);
  const check = (pose: ScalarPose, step: number) => {
    const player = { ...stairPosition, z: stairPosition.z + step * 0.4 };
    f.controller.update({ player, quality: "high" });
    closeVector(
      Vector3.TransformCoordinates(Vector3.Zero(), f.root.worldMatrixFromCache),
      scalarTransform(Vector3.Zero(), pose),
      "effective pivot before the torch refresh",
    );
    closeVector(
      scalarTransform(f.light.position, pose),
      new Vector3(8, 7.15, player.z),
      "fill follows the effective frozen/unfrozen transform",
    );
    f.refreshBeam();
    closeVector(
      Vector3.TransformCoordinates(vertex, sample.worldMatrixFromCache),
      scalarTransform(localPoint, pose),
      "geometry follows the effective frozen/unfrozen transform",
    );
    assert.equal(f.scene.getRenderId(), renderId);
  };
  check(frozenPose, 1);
  assert.equal(f.root.isWorldMatrixFrozen, true);
  assert.equal(
    rootUpdates,
    0,
    "reading a frozen pivot must not thaw or recompute it",
  );
  f.root.unfreezeWorldMatrix();
  check(editedPose, 2);
  assert.equal(f.root.isWorldMatrixFrozen, false);
  const nextPose: ScalarPose = {
    position: { x: 7, y: 2.1, z: -56 },
    yaw: -0.3,
    scale: { x: 0.8, y: 1.1, z: 1.2 },
  };
  setPose(f.root, nextPose);
  check(nextPose, 3);
  assert.equal(f.root.isWorldMatrixFrozen, false);
});
