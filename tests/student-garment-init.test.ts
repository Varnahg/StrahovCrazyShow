import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { AvatarPrimitivePool, createAvatarRig } from "../client/avatar-renderer";
import type { AvatarRig } from "../client/avatar-renderer";
import { installStudentGarments } from "../client/avatar-garments";
import { applyAvatarPreset } from "../client/avatar-presets";
import { DEFAULT_AVATAR } from "../shared/types";

function garmentMeshes(rig: AvatarRig) {
  return [...rig.skinnedBody!.near, ...rig.skinnedBody!.medium].filter(
    (mesh) => mesh.metadata?.studentGarment,
  );
}

test("new garment materials avoid repeated traversal of foreign draw wrappers and preserve all six preset values", () => {
  const engine = new NullEngine(), scene = new Scene(engine),
    pool = new AvatarPrimitivePool(scene), foreign = new PBRMaterial("foreign", scene);
  let foreignVisits = 0;
  const meshes = Array.from({ length: 16 }, (_, i) => {
    const mesh = MeshBuilder.CreateBox("unrelated " + i, {}, scene);
    mesh.material = foreign;
    const subMesh = mesh.subMeshes![0], getMaterial = subMesh.getMaterial;
    subMesh._getDrawWrapper(0, true);
    subMesh.getMaterial = function (...args: Parameters<typeof getMaterial>) {
      foreignVisits++;
      return getMaterial.apply(this, args);
    };
    return mesh;
  });
  try {
    for (let index = 0; index < 6; index++) {
      const config = applyAvatarPreset(index, DEFAULT_AVATAR),
        rig = createAvatarRig(scene, config, pool, "initialise " + index, { studentGarments: false });
      try {
        const skeleton = rig.skinnedBody!.skeleton, head = rig.head.getChildMeshes();
        foreignVisits = 0;
        const result = installStudentGarments(scene, rig, config);
        // Sixteen real foreign draw wrappers, two new garment materials. Public
        // batch leaves one final markDirty scan per new material; stock does 11.
        assert.ok(foreignVisits <= 32, "configuration should scan each foreign wrapper at most once per new material");
        assert.equal(rig.skinnedBody!.skeleton, skeleton);
        assert.deepEqual(rig.head.getChildMeshes(), head);
        const garments = garmentMeshes(rig);
        assert.equal(garments.length, 4);
        for (const part of ["upper", "trousers"] as const) {
          const pair = garments.filter((mesh) => mesh.metadata.garmentPart === part);
          assert.equal(pair[0].material, pair[1].material);
          const material = pair[0].material;
          assert.ok(material instanceof PBRMaterial);
          const color = part === "upper" ? config.shirt : config.trousers;
          assert.deepEqual(material.albedoColor.asArray(), Color3.FromHexString(color).toLinearSpace().asArray());
          assert.equal(material.metallic, 0);
          assert.equal(material.roughness, part === "trousers" ? 0.94 : 0.88);
          assert.equal(material.ambientTextureStrength, 0.45);
          assert.equal(material.useAmbientInGrayScale, true);
          assert.equal(material.environmentIntensity, 0.65);
          assert.equal(material.alpha, 1);
          assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_OPAQUE);
          assert.equal(material.blockDirtyMechanism, false);
          assert.equal(material.sheen.isEnabled, true);
          assert.equal(material.sheen.intensity, 0.14);
          assert.equal(material.sheen.roughness, 0.85);
          assert.deepEqual(material.metadata, {
            paletteColor: color, characterSurface: part === "trousers" ? "denim" : "cloth",
            source: "MakeHuman system clothing", license: "CC0-1.0", asset: result.family,
          });
          for (const [texture, file] of [[material.bumpTexture, "normal.png"], [material.ambientTexture, "ao.png"]] as const) {
            assert.ok(texture);
            assert.equal(texture.name, `/models/characters/student-garments/${result.family}/${file}`);
            assert.equal(texture.gammaSpace, false);
            assert.equal(texture.hasAlpha, false);
          }
          assert.equal(material.bumpTexture!.level, 0.65);
        }
        assert.ok(meshes.every((mesh) => mesh.material === foreign && !mesh.isDisposed()));
      } finally { rig.root.dispose(); }
    }
  } finally { pool.dispose(); scene.dispose(); engine.dispose(); }
});

test("garment cache shares geometry, materials and textures and releases only the last mesh owner", () => {
  const engine = new NullEngine(), scene = new Scene(engine), pool = new AvatarPrimitivePool(scene),
    config = applyAvatarPreset(0, DEFAULT_AVATAR),
    first = createAvatarRig(scene, config, pool, "first", { studentGarments: false }),
    second = createAvatarRig(scene, config, pool, "second", { studentGarments: false });
  try {
    installStudentGarments(scene, first, config);
    installStudentGarments(scene, second, config);
    const a = garmentMeshes(first), b = garmentMeshes(second);
    for (let i = 0; i < 4; i++) {
      assert.equal(a[i].material, b[i].material);
      assert.equal(a[i].geometry, b[i].geometry);
    }
    const materials = [...new Set(b.map((mesh) => mesh.material as PBRMaterial))],
      normal = materials[0].bumpTexture!, ao = materials[0].ambientTexture!;
    let releases = 0;
    materials.forEach((material) => material.onDisposeObservable.add(() => releases++));
    first.root.dispose();
    assert.equal(releases, 0);
    assert.ok(materials.every((material) => scene.materials.includes(material)));
    second.root.dispose();
    assert.equal(releases, 2);
    assert.ok(materials.every((material) => !scene.materials.includes(material)));
    assert.ok(scene.textures.includes(normal) && scene.textures.includes(ao));
    const renewed = createAvatarRig(scene, config, pool, "renewed", { studentGarments: false });
    try {
      installStudentGarments(scene, renewed, config);
      const material = garmentMeshes(renewed)[0].material as PBRMaterial;
      assert.ok(!materials.includes(material));
      assert.equal(material.bumpTexture, normal);
      assert.equal(material.ambientTexture, ao);
    } finally { renewed.root.dispose(); }
    assert.equal(scene.materials.filter((material) => material.name.startsWith("CC0 student garment")).length, 0);
  } finally {
    if (!first.root.isDisposed()) first.root.dispose();
    if (!second.root.isDisposed()) second.root.dispose();
    pool.dispose(); scene.dispose(); engine.dispose();
  }
});
