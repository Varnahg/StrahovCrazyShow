import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { createB4PanelMaterial } from "../client/b4-panel-material";
import { B4_FACADE_PLAN } from "../shared/b4-facade-plan";
import { surfaceTexturePlan } from "../client/surface-pack";

function readNativeMaterial(level: "near" | "highest") {
  const bytes = readFileSync(
    `public/models/architecture/b4-facade/b4-facade-panels-${level}.glb`,
  );
  assert.equal(bytes.readUInt32LE(0), 0x46546c67);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  const gltf = JSON.parse(
    bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
  );
  assert.equal(gltf.materials.length, 1);
  return gltf.materials[0].pbrMetallicRoughness as {
    baseColorFactor: number[];
    metallicFactor?: number;
    roughnessFactor?: number;
    baseColorTexture?: unknown;
    metallicRoughnessTexture?: unknown;
  };
}

test("B4 material uses the source shade as linear, rough nonmetallic albedo with no invented surface maps", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const initialMaterials = scene.materials.length;
  const material = createB4PanelMaterial(scene);
  try {
    assert.ok(material instanceof PBRMaterial);
    assert.equal(
      material.metadata.sourceColorSRGB,
      B4_FACADE_PLAN.material.neutralShadeHex,
    );
    // Independent exact sRGB decode from the already-authored #a3a7a4 shade.
    const expected = [
      0.3662525955988395, 0.386429433787049, 0.3712376804741491,
    ];
    material.albedoColor
      .asArray()
      // Babylon's exact transfer uses rounded scalar constants; its error is
      // below 1e-9, unlike the visibly different default gamma-2.2 conversion.
      .forEach((value, i) => assert.ok(Math.abs(value - expected[i]) < 1e-8));
    assert.equal(material.roughness, 0.84);
    assert.equal(material.metallic, 0);
    assert.equal(material.environmentIntensity, 0.7);
    assert.equal(material.directIntensity, 1);
    assert.equal(material.disableLighting, false);
    assert.equal(material.alpha, 1);
    assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_OPAQUE);
    assert.equal(material.backFaceCulling, true);
    assert.deepEqual(material.emissiveColor.asArray(), [0, 0, 0]);
    for (const texture of [
      material.albedoTexture,
      material.bumpTexture,
      material.metallicTexture,
      material.emissiveTexture,
      material.ambientTexture,
      material.reflectionTexture,
    ])
      assert.equal(texture, null);
    assert.equal(
      surfaceTexturePlan(material.metadata),
      null,
      "no claim that unknown panel cladding is concrete or plaster",
    );
    assert.equal(
      scene.lights.length,
      0,
      "the material does not create a fill light",
    );
    const lut = material.environmentBRDFTexture;
    assert.ok(lut);
    assert.match(lut.name, /^data:EnvironmentBRDFTexture\d+$/);
    assert.equal((lut as Texture).url, lut.name);
    assert.deepEqual(
      scene.textures,
      [lut],
      "only Babylon's embedded shared BRDF lookup is present",
    );
    const second = createB4PanelMaterial(scene);
    assert.equal(
      second.environmentBRDFTexture,
      lut,
      "do not allocate another lookup per material",
    );
    assert.deepEqual(scene.textures, [lut]);
    second.dispose();
    material.dispose();
    assert.equal(scene.materials.length, initialMaterials);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("runtime B4 albedo and roughness match both existing Blender-native GLB materials", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const material = createB4PanelMaterial(scene);
  try {
    for (const level of ["near", "highest"] as const) {
      const authored = readNativeMaterial(level);
      assert.equal(authored.baseColorTexture, undefined);
      assert.equal(authored.metallicRoughnessTexture, undefined);
      material.albedoColor
        .asArray()
        .forEach((value, i) =>
          assert.ok(
            Math.abs(value - authored.baseColorFactor[i]) < 1e-6,
            `${level} linear albedo ${i}`,
          ),
        );
      assert.equal(authored.baseColorFactor[3], material.alpha);
      assert.equal(authored.metallicFactor ?? 1, material.metallic);
      assert.ok(
        Math.abs((authored.roughnessFactor ?? 1) - material.roughness!) < 1e-6,
      );
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
