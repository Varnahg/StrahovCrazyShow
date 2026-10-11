import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { DEFAULT_AVATAR } from "../../shared/types";
import { applyAvatarPreset, AVATAR_PRESETS } from "../../client/avatar-presets";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../../client/avatar-renderer";

const engine = new NullEngine();
const scene = new Scene(engine);
const pool = new AvatarPrimitivePool(scene);
const summaries: object[] = [];
const topology = new Set<string>();
for (let index = 0; index < AVATAR_PRESETS.length; index++) {
  const config = applyAvatarPreset(index, {
    ...DEFAULT_AVATAR,
    badge: "Strahovský kurýr",
  });
  assert.equal(
    config.badge,
    "Strahovský kurýr",
    "Preset selection preserves earned cosmetics",
  );
  const rig = createAvatarRig(scene, config, pool);
  rig.root.computeWorldMatrix(true);
  const meshes = rig.root.getChildMeshes();
  for (const mesh of meshes) mesh.computeWorldMatrix(true);
  const { min, max } = rig.root.getHierarchyBoundingVectors(true);
  assert.ok(
    min.y >= -0.01 && min.y <= 0.02,
    `Preset ${index} must stand at y=0: ${min.y}`,
  );
  assert.ok(
    max.y >= 1.45 && max.y <= 1.75,
    `Preset ${index} fits a roughly 1.6m character: ${max.y}`,
  );
  assert.ok(
    max.x - min.x <= 0.86,
    `Preset ${index} must not have an excessive width`,
  );
  assert.notEqual(
    rig.arm,
    rig.rightArm,
    "Both arms have independent animation pivots",
  );
  assert.ok(
    meshes.some((mesh) => mesh.name.endsWith("badge")),
    "Cosmetic badge is represented",
  );
  topology.add(meshes.map((mesh) => mesh.name).join("|"));
  const triangles = meshes.reduce(
    (sum, mesh) => sum + mesh.getTotalIndices() / 3,
    0,
  );
  assert.ok(
    triangles < 10_000,
    `Preset ${index} should remain inexpensive: ${triangles}`,
  );
  summaries.push({
    preset: AVATAR_PRESETS[index].name,
    parts: meshes.length,
    triangles,
    height: Number(max.y.toFixed(3)),
    width: Number((max.x - min.x).toFixed(3)),
  });
  rig.root.dispose(false, false);
}
assert.equal(
  topology.size,
  6,
  "Each preset has a genuinely distinct silhouette/topology",
);

const identicalA = createAvatarRig(scene, DEFAULT_AVATAR, pool, "A");
const identicalB = createAvatarRig(scene, DEFAULT_AVATAR, pool, "B");
const headA = identicalA.root
  .getChildMeshes()
  .find((mesh) => mesh.name === "A head");
const headB = identicalB.root
  .getChildMeshes()
  .find((mesh) => mesh.name === "B head");
assert.ok(headA && headB);
assert.equal(
  headA.geometry,
  headB.geometry,
  "Different avatar instances share geometry",
);
identicalA.root.dispose(false, false);
identicalB.root.dispose(false, false);

for (let value = 0; value < 80; value++) {
  const color = `#${(0x337700 + value).toString(16)}`;
  const rig = createAvatarRig(scene, { ...DEFAULT_AVATAR, shirt: color }, pool);
  rig.root.dispose(false, false);
  pool.pruneUnused();
  assert.equal(
    scene.meshes.length,
    0,
    "Colour edits release unused pooled source meshes",
  );
  assert.equal(
    scene.materials.length,
    0,
    "Colour edits release unused preview materials",
  );
}
console.log(
  JSON.stringify(
    {
      passed: true,
      presets: summaries,
      sharedGeometry: true,
      colourEditCleanup: true,
    },
    null,
    2,
  ),
);
pool.dispose();
scene.dispose();
engine.dispose();
