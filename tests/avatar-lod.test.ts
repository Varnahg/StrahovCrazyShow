import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import type { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";

function context() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene);
  return {
    engine,
    scene,
    pool,
    add(index = 0) {
      const config = applyAvatarPreset(index, DEFAULT_AVATAR);
      const rig = createAvatarRig(scene, config, pool, "person " + index);
      const lod = new AvatarLodController(scene, pool, rig, config);
      return { config, rig, lod };
    },
    dispose() {
      pool.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
const at = (distance: number, quality = "low") => ({
  distance,
  quality,
  position: { x: 0, y: 0, z: 0 },
  yaw: 0,
});
const registeredChildren = (
  scene: Scene,
  root: ReturnType<typeof createAvatarRig>["root"],
) => scene.meshes.filter((mesh) => mesh.isDescendantOf(root));

test("LOD changes actual scene traversal candidates and returns every original detail nearby", () => {
  const c = context(),
    { rig, lod } = c.add();
  const full = rig.root
    .getChildMeshes()
    .filter((mesh) => mesh.metadata?.avatarBodyLod !== "medium");
  assert.ok(
    full.length <= 32,
    "continuous anatomy replaces rigid limb parts instead of adding them",
  );
  assert.equal(lod.update(at(2)).level, "near");
  assert.equal(registeredChildren(c.scene, rig.root).length, full.length);
  assert.equal(lod.update(at(20)).level, "medium");
  // Near eyes now use one instanced surface in place of six primitive layers.
  // Keep an absolute medium traversal/triangle budget, not a ratio that rewards
  // the old inflated near count and penalizes removing five near-only parts.
  assert.ok(lod.counts.registered <= 8 && lod.counts.registered < full.length);
  assert.ok(lod.counts.mediumTriangles < lod.counts.nearTriangles * 0.5);
  assert.ok(
    !registeredChildren(c.scene, rig.root).some((mesh) =>
      / (eye|glasses rim|thumb)$/.test(mesh.name),
    ),
  );
  assert.ok(
    registeredChildren(c.scene, rig.root).some((mesh) =>
      mesh.name.endsWith(" face medium"),
    ),
  );
  assert.ok(
    registeredChildren(c.scene, rig.root)
      .filter((mesh) => mesh.metadata?.skinnedAnatomy)
      .every((mesh) => mesh.metadata?.avatarBodyLod === "medium"),
  );
  assert.equal(lod.update(at(80)).level, "far");
  assert.equal(registeredChildren(c.scene, rig.root).length, 1);
  for (const mesh of full) {
    assert.equal(
      c.scene.meshes.includes(mesh),
      false,
      "hidden detail must leave the per-frame scene scan",
    );
    assert.equal(mesh.isEnabled(false), false);
    assert.equal(
      mesh.isDisposed(),
      false,
      "near geometry is reversibly retained",
    );
  }
  assert.equal(lod.update(at(3)).resetAnimation, true);
  assert.equal(registeredChildren(c.scene, rig.root).length, full.length);
  assert.ok(
    full.every((mesh) => mesh.isEnabled() && c.scene.meshes.includes(mesh)),
  );
  assert.equal(lod.update(at(3)).resetAnimation, false);
  rig.root.dispose();
  c.dispose();
});

test("distance hysteresis prevents boundary flutter and quality expands detail distances", () => {
  const c = context(),
    { rig, lod } = c.add();
  assert.equal(lod.update(at(9.9)).level, "near");
  for (const distance of [10.1, 9.99, 11.99, 10.01])
    assert.equal(lod.update(at(distance)).level, "near");
  assert.equal(lod.update(at(12.1)).level, "medium");
  for (const distance of [12, 10.01, 11])
    assert.equal(lod.update(at(distance)).level, "medium");
  assert.equal(lod.update(at(9.9)).level, "near");
  assert.equal(lod.update(at(45)).level, "far");
  for (const distance of [39.9, 36.01, 38])
    assert.equal(lod.update(at(distance)).level, "far");
  assert.equal(lod.update(at(35.9)).level, "medium");
  assert.equal(lod.update({ ...at(300), forceNear: true }).level, "near");
  assert.equal(lod.update(at(20, "high")).level, "near");
  assert.equal(lod.update(at(Number.NaN)).level, "near");
  rig.root.dispose();
  c.dispose();
});

test("glasses remain shared identity geometry in medium and never add a far proxy box", () => {
  const c = context();
  for (let preset = 0; preset < 6; preset++) {
    const config = {
      ...applyAvatarPreset(preset, DEFAULT_AVATAR),
      glasses: true,
    };
    const rig = createAvatarRig(
      c.scene,
      config,
      c.pool,
      `glasses identity ${preset}`,
    );
    const copy = createAvatarRig(
      c.scene,
      config,
      c.pool,
      `glasses copy ${preset}`,
    );
    const plainConfig = { ...config, glasses: false };
    const plain = createAvatarRig(
      c.scene,
      plainConfig,
      c.pool,
      `without glasses ${preset}`,
    );
    const lod = new AvatarLodController(c.scene, c.pool, rig, config);
    const plainLod = new AvatarLodController(
      c.scene,
      c.pool,
      plain,
      plainConfig,
    );
    const frame = rig.head
      .getChildMeshes()
      .find((mesh) => mesh.name.endsWith(" glasses frames")) as InstancedMesh;
    const copyFrame = copy.head
      .getChildMeshes()
      .find((mesh) => mesh.name.endsWith(" glasses frames")) as InstancedMesh;
    assert.equal(frame.getTotalIndices() / 3, 720);
    assert.equal(frame.sourceMesh, copyFrame.sourceMesh);
    assert.equal(frame.sourceMesh.geometry, copyFrame.sourceMesh.geometry);
    assert.equal(lod.counts.medium, plainLod.counts.medium + 1);
    for (const distance of [0, 20, 100, 20, 0]) {
      lod.update(at(distance));
      plainLod.update(at(distance));
      assert.equal(
        frame.isEnabled(),
        distance !== 100,
        `preset ${preset} at ${distance}m`,
      );
      assert.equal(c.scene.meshes.includes(frame), distance !== 100);
      assert.equal(frame.isDisposed(), false);
      assert.equal(frame.parent, rig.head);
      assert.equal(frame.sourceMesh, copyFrame.sourceMesh);
    }
    assert.equal(lod.counts.farTriangles, plainLod.counts.farTriangles);
    assert.ok(lod.counts.farTriangles <= 204);
    const source = frame.sourceMesh;
    rig.root.dispose();
    c.pool.pruneUnused();
    assert.equal(source.isDisposed(), false);
    assert.equal(copyFrame.isEnabled(), true);
    copy.root.dispose();
    plain.root.dispose();
    c.pool.pruneUnused();
    assert.equal(source.isDisposed(), true);
  }
  c.dispose();
});

test("far proxy preserves palette, height and positions for all six distinct presets", () => {
  const c = context();
  const maxima: number[] = [];
  for (let index = 0; index < 6; index++) {
    const { config, rig, lod } = c.add(index);
    rig.root.computeWorldMatrix(true);
    // Skinned body bounds deliberately cover raised hands. They are culling
    // margins, not the rest height used by the far silhouette.
    const originalBounds = rig.root
      .getChildMeshes()
      .filter((mesh) => !mesh.metadata?.skinnedAnatomy)
      .map((mesh) => {
        mesh.computeWorldMatrix(true);
        return mesh.getBoundingInfo().boundingBox;
      });
    const fullTop = Math.max(
      ...originalBounds.map((box) => box.maximumWorld.y),
    );
    const point = { x: 141, y: 3, z: -72 };
    lod.update({ ...at(200), position: point, yaw: 1.1 });
    assert.deepEqual(rig.root.position.asArray(), [point.x, point.y, point.z]);
    assert.equal(rig.root.rotation.y, 1.1);
    const proxy = registeredChildren(c.scene, rig.root)[0] as InstancedMesh;
    proxy.computeWorldMatrix(true);
    assert.ok(
      Math.abs(
        proxy.getBoundingInfo().boundingBox.maximumWorld.y - point.y - fullTop,
      ) < 0.0001,
    );
    maxima.push(fullTop);
    assert.equal(proxy.parent, rig.root);
    assert.ok(proxy.getTotalIndices() / 3 <= 384);
    const colors = proxy.sourceMesh.getVerticesData(VertexBuffer.ColorKind)!;
    for (const hex of [
      config.skin,
      config.hair,
      config.shirt,
      config.trousers,
    ]) {
      const color = hex
        .match(/[0-9a-f]{2}/gi)!
        .map((value) => parseInt(value, 16) / 255);
      assert.ok(
        Array.from({ length: colors.length / 4 }, (_, i) => i * 4).some((i) =>
          color.every((v, j) => Math.abs(colors[i + j] - v) < 1e-6),
        ),
        "missing identity colour " + hex,
      );
    }
    rig.root.dispose();
  }
  assert.ok(maxima[1] > maxima[2], "preset height difference survives far LOD");
  c.dispose();
});

test("far geometry is closed, finite, non-pickable and vertex-coloured", () => {
  const c = context(),
    { rig, lod } = c.add(5);
  lod.update(at(100));
  const proxy = registeredChildren(c.scene, rig.root)[0] as InstancedMesh;
  const positions = proxy.sourceMesh.getVerticesData(
    VertexBuffer.PositionKind,
  )!;
  const indices = proxy.sourceMesh.getIndices()!;
  assert.ok([...positions].every(Number.isFinite));
  assert.equal(proxy.isPickable, false);
  assert.equal(proxy.sourceMesh.hasVertexAlpha, false);
  // Weld coincident per-face vertices when checking the boxes' surface edges.
  // Keep each 24-vertex closed piece distinct, including intentional overlaps.
  for (let offset = 0; offset < indices.length; offset += 36) {
    const edges = new Map<string, number>();
    const vertex = (i: number) =>
      Array.from(positions.slice(i * 3, i * 3 + 3))
        .map((v) => v.toFixed(6))
        .join(",");
    for (let i = offset; i < offset + 36; i += 3)
      for (const [a, b] of [
        [indices[i], indices[i + 1]],
        [indices[i + 1], indices[i + 2]],
        [indices[i + 2], indices[i]],
      ]) {
        const va = vertex(a),
          vb = vertex(b),
          key = va < vb ? va + "/" + vb : vb + "/" + va;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    assert.ok([...edges.values()].every((count) => count === 2));
  }
  rig.root.dispose();
  c.dispose();
});

test("100 online avatar identities remain represented with shared cached far geometry", () => {
  const c = context();
  const people = Array.from({ length: 100 }, (_, index) => c.add(index % 6));
  const nearCount = people.reduce((sum, p) => sum + p.lod.counts.near, 0);
  const nearSceneMeshes = c.scene.meshes.length;
  for (const [index, person] of people.entries())
    person.lod.update({ ...at(200), position: { x: index * 2, y: 0, z: 8 } });
  const proxies = people.map(
    (person) =>
      registeredChildren(c.scene, person.rig.root)[0] as InstancedMesh,
  );
  assert.equal(proxies.length, 100);
  assert.equal(new Set(proxies).size, 100);
  assert.ok(proxies.every((mesh) => mesh.isEnabled() && mesh.isVisible));
  assert.equal(new Set(proxies.map((mesh) => mesh.sourceMesh)).size, 6);
  assert.equal(
    people.reduce((sum, p) => sum + p.lod.counts.registered, 0),
    100,
  );
  console.info(
    JSON.stringify({
      nearInstances100: nearCount,
      nearSceneMeshes,
      farInstances100: proxies.length,
      farSceneMeshes: c.scene.meshes.length,
      sharedFarSources100: new Set(proxies.map((mesh) => mesh.sourceMesh)).size,
      presets: people
        .slice(0, 6)
        .map((p) => ({ preset: p.config.preset, ...p.lod.counts })),
    }),
  );
  // One disappearing identity must not dispose a shared source used by others.
  const shared = proxies[0].sourceMesh;
  people[0].rig.root.dispose();
  assert.equal(shared.isDisposed(), false);
  assert.ok(proxies[6].isEnabled());
  for (const person of people.slice(1)) person.rig.root.dispose();
  assert.equal(
    c.scene.meshes.filter((mesh) => mesh.name.startsWith("avatar LOD source"))
      .length,
    0,
  );
  c.dispose();
});

test("vehicle/first-person visibility hides every LOD and reentry restores the same identity", () => {
  const c = context(),
    { rig, lod } = c.add();
  for (const distance of [2, 20, 100]) {
    lod.update({ ...at(distance), visible: false });
    assert.equal(registeredChildren(c.scene, rig.root).length, 0);
    assert.equal(rig.root.isEnabled(), false);
    lod.update({ ...at(distance), visible: true });
    assert.ok(registeredChildren(c.scene, rig.root).length >= 1);
    assert.equal(rig.root.isEnabled(), true);
  }
  rig.root.dispose();
  c.dispose();
});

test("medium IK uses accumulated elapsed time at 30 Hz; far IK stops and near returns safely", () => {
  const c = context(),
    { rig, lod } = c.add();
  const animator = new AvatarAnimator(rig);
  lod.update(at(20));
  let calls = 0,
    elapsed = 0;
  for (let frame = 0; frame < 120; frame++) {
    const dt = lod.animationDelta(1 / 120);
    if (dt) {
      calls++;
      elapsed += dt;
      animator.update({ position: { x: 0, y: 0, z: frame / 30 }, yaw: 0 }, dt);
    }
  }
  assert.equal(calls, 30);
  assert.ok(Math.abs(elapsed - 1) < 1e-9);
  lod.update(at(100));
  assert.equal(lod.animationDelta(1 / 30), 0);
  const result = lod.update(at(1));
  assert.equal(result.resetAnimation, true);
  animator.reset();
  animator.update(
    { position: new Vector3(0, 0, 10), yaw: 0.2 },
    lod.animationDelta(1 / 60),
  );
  assert.equal(animator.gait, "idle");
  assert.ok(Number.isFinite(rig.leftKnee.rotation.x));
  rig.root.dispose();
  c.dispose();
});

test("Babylon active-mesh evaluation renders a far instance whose cached source is invisible", () => {
  const c = context(),
    { rig, lod } = c.add();
  const camera = new FreeCamera("audit view", new Vector3(0, 1, -5), c.scene);
  camera.setTarget(new Vector3(0, 0.8, 0));
  new HemisphericLight("audit light", Vector3.Up(), c.scene);
  lod.update(at(100));
  const proxy = registeredChildren(c.scene, rig.root)[0] as InstancedMesh;
  assert.equal(proxy.sourceMesh.isVisible, false);
  c.scene.render();
  assert.ok(c.scene.getActiveMeshes().data.includes(proxy));
  assert.ok(!c.scene.getActiveMeshes().data.includes(proxy.sourceMesh));
  lod.update(at(2));
  c.scene.render();
  assert.ok(
    !c.scene
      .getActiveMeshes()
      .data.slice(0, c.scene.getActiveMeshes().length)
      .includes(proxy),
  );
  rig.root.dispose();
  c.dispose();
});
