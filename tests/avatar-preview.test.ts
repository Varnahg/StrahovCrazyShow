import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  AvatarPreviewModel,
  avatarPreviewMeshesReady,
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { DEFAULT_AVATAR } from "../shared/types";
import { applyAvatarPreset } from "../client/avatar-presets";

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const config = applyAvatarPreset(0, DEFAULT_AVATAR);
  const model = new AvatarPreviewModel(scene, config);
  t.after(() => {
    model.dispose();
    scene.dispose();
    engine.dispose();
  });
  return { scene, config, model };
}

test("same-value updates keep every rig, geometry, material and skeleton without rebuilding", (t) => {
  const { scene, config, model } = fixture(t);
  const rig = model.rig;
  const geometryIds = scene.geometries.map((item) => item.uniqueId);
  const materialIds = scene.materials.map((item) => item.uniqueId);
  for (let edit = 0; edit < 10; edit++)
    assert.equal(model.update({ ...config }), false);
  assert.equal(model.rig, rig);
  assert.deepEqual(
    scene.geometries.map((item) => item.uniqueId),
    geometryIds,
  );
  assert.deepEqual(
    scene.materials.map((item) => item.uniqueId),
    materialIds,
  );
  assert.equal(model.stats.builds, 1);
  assert.equal(scene.skeletons.length, 1);
  // A caller mutating its config in place must still be detected.
  config.face = config.face === 1 ? 0 : 1;
  assert.equal(model.update(config), true);
  assert.notEqual(model.rig, rig);
});

test("face and colour edits retain existing skinned buffers and unchanged garment materials instead of recreating them", (t) => {
  const { scene, config, model } = fixture(t);
  const before = model.rig.skinnedBody!.near;
  const geometries = before.map((mesh) => (mesh as Mesh).geometry);
  const garment = before.find(
    (mesh) => mesh.metadata?.garmentPart === "upper",
  )!;
  const unchanged = garment.material;
  const oldSkeleton = model.rig.skinnedBody!.skeleton;
  assert.equal(model.update({ ...config, face: 0.75, hair: "#504535" }), true);
  const after = model.rig.skinnedBody!.near;
  assert.equal(after.length, before.length);
  for (let i = 0; i < after.length; i++) {
    assert.equal((after[i] as Mesh).geometry, geometries[i]);
    assert.equal(geometries[i]!.isDisposed(), false);
  }
  assert.equal(
    after.find((mesh) => mesh.metadata?.garmentPart === "upper")!.material,
    unchanged,
  );
  assert.ok(before.every((mesh) => mesh.isDisposed()));
  assert.ok(!scene.skeletons.includes(oldSkeleton));
  assert.equal(scene.skeletons.length, 1);
});

test("the old dispose-before-replace order really destroys cached body geometry", (t) => {
  const { scene, config } = fixture(t);
  const pool = new AvatarPrimitivePool(scene);
  const first = createAvatarRig(
    scene,
    { ...config, preset: 1 },
    pool,
    "isolated causal rig",
  );
  const original = (first.skinnedBody!.near[0] as Mesh).geometry!;
  first.root.dispose(false, false);
  assert.equal(original.isDisposed(), true);
  const second = createAvatarRig(
    scene,
    { ...config, preset: 1 },
    pool,
    "isolated causal rig",
  );
  assert.notEqual((second.skinnedBody!.near[0] as Mesh).geometry, original);
  second.root.dispose(false, false);
  pool.dispose();
});

test("many edits prune old colours and leave one rig; final teardown releases textures, meshes and skeletons", (t) => {
  const { scene, config, model } = fixture(t);
  const initial = {
    meshes: scene.meshes.length,
    materials: scene.materials.length,
    textures: scene.textures.length,
  };
  for (let edit = 0; edit < 16; edit++) {
    model.update({
      ...config,
      face: edit / 20,
      shirt: `#${(0x304050 + edit * 0x030201).toString(16)}`,
    });
    assert.equal(scene.skeletons.length, 1);
    assert.equal(scene.meshes.length, initial.meshes);
    assert.equal(scene.materials.length, initial.materials);
    assert.equal(scene.textures.length, initial.textures);
  }
  model.dispose();
  model.dispose();
  assert.equal(scene.meshes.length, 0);
  assert.equal(scene.skeletons.length, 0);
  assert.equal(model.update(config), false);
  // Garment texture atlases belong to the scene cache, unlike pool textures.
  scene.dispose();
  assert.equal(scene.textures.length, 0);
});

test("readiness checks only displayed meshes; every visible mesh is checked even when another is unready", (t) => {
  const { model } = fixture(t);
  const meshes = model.rig.root.getChildMeshes();
  const expected = meshes.filter(
    (mesh) => mesh.isEnabled() && mesh.isVisible && mesh.visibility > 0,
  );
  const visited: number[] = [];
  for (const mesh of meshes)
    mesh.isReady = () => {
      visited.push(mesh.uniqueId);
      return false;
    };
  assert.equal(avatarPreviewMeshesReady(meshes), false);
  assert.deepEqual(
    visited,
    expected.map((mesh) => mesh.uniqueId),
  );
  assert.ok(
    visited.length < meshes.length,
    "hidden medium LODs are not compiled just to display a near-only preview",
  );
});
