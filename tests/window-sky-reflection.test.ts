import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { buildArchitectureReality } from "../client/architecture-reality";
import { applyWindowSkyReflection } from "../client/cinematic";

test("real exterior window palette reflects one shared sky without opening opaque buildings", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  try {
    buildArchitectureReality({ scene, buildings: [] });
    const sky = RawTexture.CreateRGBATexture(
      new Uint8Array([110, 130, 150, 255]),
      1,
      1,
      scene,
    );
    const windows = scene.materials.filter(
      (m): m is StandardMaterial =>
        m instanceof StandardMaterial && m.metadata?.exteriorOnlyGlass === true,
    );
    assert.equal(
      windows.length,
      6,
      "three authored styles in simulated day/night variants",
    );
    const counts = [
      scene.materials.length,
      scene.textures.length,
      scene.meshes.length,
    ];
    for (const glass of windows) {
      const diffuse = glass.diffuseTexture,
        emissive = glass.emissiveTexture,
        opacity = glass.opacityFresnelParameters;
      assert.equal(applyWindowSkyReflection(glass, sky), true);
      assert.equal(glass.reflectionTexture, sky);
      assert.equal(glass.alpha, 1);
      assert.ok(!glass.needAlphaBlending());
      assert.equal(glass.opacityFresnelParameters, opacity);
      assert.equal(glass.diffuseTexture, diffuse);
      assert.equal(glass.emissiveTexture, emissive);
      assert.ok(glass.reflectionFresnelParameters?.isEnabled);
      if (glass.metadata.nightWindows)
        assert.equal(glass.metadata.simulatedOccupancy, true);
    }
    assert.deepEqual(
      [scene.materials.length, scene.textures.length, scene.meshes.length],
      counts,
    );
    const throughWindows = scene.materials.filter(
      (m): m is StandardMaterial =>
        m instanceof StandardMaterial &&
        m.metadata?.block === 6 &&
        m.metadata?.realityGlass,
    );
    assert.equal(throughWindows.length, 6);
    for (const glass of throughWindows) {
      const alpha = glass.alpha;
      assert.equal(glass.metadata.exteriorOnlyGlass, false);
      assert.equal(applyWindowSkyReflection(glass, sky), true);
      assert.equal(glass.alpha, alpha);
      assert.ok(glass.opacityFresnelParameters?.isEnabled);
    }
    for (const material of scene.materials)
      if (
        material instanceof StandardMaterial &&
        !material.metadata?.realityGlass &&
        !material.metadata?.exteriorOnlyGlass
      ) {
        assert.equal(applyWindowSkyReflection(material, sky), false);
        assert.equal(
          material.reflectionTexture,
          null,
          "whole facade atlases must not become glass",
        );
      }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
