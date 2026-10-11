import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { disableZeroWeightCarClearCoat } from "../client/car-material-budget";
import { acquireCarPack, CAR_PACK_MANIFEST } from "../client/car-pack";
import "../client/render-shaders";

test("only exactly zero untextured coat is disabled; nonzero weights and all coat texture roles survive", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new PBRMaterial("coat boundary", scene);
  const texture = RawTexture.CreateRGBATexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    scene,
  );
  try {
    for (const weight of [0.55, 0.15, 0.3, -0.1, NaN]) {
      material.clearCoat.isEnabled = true;
      material.clearCoat.intensity = weight;
      assert.equal(disableZeroWeightCarClearCoat(material), false);
      assert.equal(material.clearCoat.isEnabled, true);
    }
    material.clearCoat.intensity = 0;
    for (const key of [
      "texture",
      "textureRoughness",
      "bumpTexture",
      "tintTexture",
    ] as const) {
      material.clearCoat[key] = texture;
      assert.equal(disableZeroWeightCarClearCoat(material), false);
      material.clearCoat[key] = null;
    }
    assert.equal(disableZeroWeightCarClearCoat(material), true);
    assert.equal(material.clearCoat.isEnabled, false);
    assert.equal(disableZeroWeightCarClearCoat(material), false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("actual loaded GLB keeps paint/lens coats and removes zero-weight CLEARCOAT shader define", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  scene.useDelayedTextureLoading = true;
  scene.texturesEnabled = false;
  const lease = await acquireCarPack(scene, {
    assetSources: Object.fromEntries(
      CAR_PACK_MANIFEST.lods.map((lod) => [
        lod.level,
        new Uint8Array(readFileSync("public" + lod.url)),
      ]),
    ),
  });
  const rig = lease.pack.createRig("coat-render");
  lease.pack.setQuality("high");
  const camera = new FreeCamera("camera", new Vector3(0, 2, 7), scene);
  camera.setTarget(new Vector3(0, 0.6, 0));
  scene.activeCamera = camera;
  new HemisphericLight("sky", Vector3.Up(), scene);
  try {
    const materials = new Set(
      [...lease.pack.templates.values()].flatMap((parts) =>
        [...parts.values()].map((part) => part.source.material as PBRMaterial),
      ),
    );
    const zero = [...materials].filter(
      (m) => m.metadata.zeroWeightClearCoatDisabled,
    );
    assert.equal(zero.length, 15);
    assert.ok(
      zero.every((m) => m.clearCoat.intensity === 0 && !m.clearCoat.isEnabled),
    );
    const bytes = readFileSync("public" + CAR_PACK_MANIFEST.lods[0].url);
    const source = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    const weights = new Map<string, number>(
      source.materials.map((m: any) => [
        m.name,
        m.extensions?.KHR_materials_clearcoat?.clearcoatFactor ?? 0,
      ]),
    );
    for (const material of materials) {
      const weight = weights.get(material.name) ?? 0;
      if (weight > 0) {
        assert.equal(material.clearCoat.isEnabled, true);
        assert.equal(material.clearCoat.intensity, weight);
      }
    }
    for (let i = 0; i < 3; i++) {
      scene.render();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const near = lease.pack.templates.get("near")!;
    const black = [...near.values()].find(
      (p) => p.source.material?.name === "black.001",
    )!.source;
    const paint = [...near.values()].find(
      (p) => p.source.material?.metadata.vehiclePaint,
    )!.source;
    assert.ok(
      black.subMeshes[0].effect && paint.subMeshes[0].effect,
      "real PBR effect preparation ran",
    );
    assert.doesNotMatch(
      black.subMeshes[0].effect!.defines,
      /#define CLEARCOAT(?:\s|$)/,
    );
    assert.match(
      paint.subMeshes[0].effect!.defines,
      /#define CLEARCOAT(?:\s|$)/,
    );
    assert.equal(
      (paint.material as PBRMaterial).clearCoat.intensity,
      0.550000011920929,
    );
  } finally {
    rig.dispose();
    lease.release();
    scene.dispose();
    engine.dispose();
  }
});
