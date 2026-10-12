import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import {
  campusSurfaceArt,
  campusExposure,
  configureCampusGrade,
  CampusSurfaceArtPlugin,
} from "../client/cinematic-art";

test("campus artistic surfaces keep bounded physical-scale variation without added resources", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  for (const kind of [
    "asphalt",
    "concrete",
    "plaster",
    "grass",
    "paving",
    "sett",
    "gravel",
  ]) {
    const art = campusSurfaceArt(kind)!;
    assert.ok(art.variation >= 0 && art.variation <= 0.2);
    assert.ok(art.fineMetres > 3 && art.coarseMetres >= 11);
    assert.ok(art.saturation >= 0.6 && art.saturation <= 1);
    assert.ok(art.roughnessVariation < 0.06);
    const material = new PBRMaterial(kind, scene);
    const before = {
      meshes: scene.meshes.length,
      textures: scene.textures.length,
      lights: scene.lights.length,
    };
    const plugin = new CampusSurfaceArtPlugin(material, art);
    assert.deepEqual(
      {
        meshes: scene.meshes.length,
        textures: scene.textures.length,
        lights: scene.lights.length,
      },
      before,
    );
    assert.equal(material.metadata.addedArtDrawCalls, 0);
    assert.equal(material.metadata.originalTextureChannelsUnmodified, true);
    assert.equal(plugin.isCompatible(ShaderLanguage.GLSL), true);
    assert.equal(plugin.getCustomCode("fragment", ShaderLanguage.WGSL), null);
    const shader = Object.values(plugin.getCustomCode("fragment")!).join("\n");
    assert.match(shader, /vPositionW/);
    assert.doesNotMatch(shader, /texture2D|textureLod|gl_Position|discard/);
  }
  scene.dispose();
  engine.dispose();
});

test("cinematic grade remains shared with every quality and never changes time/weather", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  configureCampusGrade(scene.imageProcessingConfiguration);
  const config = scene.imageProcessingConfiguration;
  assert.equal(config.colorCurvesEnabled, true);
  assert.equal(config.colorCurves!.shadowsHue, 216);
  assert.ok(config.colorCurves!.highlightsDensity < 10);
  assert.equal(config.applyByPostProcess, false);
  assert.equal(campusExposure(1), 1.08);
  assert.ok(Math.abs(campusExposure(0) - 1.18) < 1e-12);
  assert.ok(Math.abs(campusExposure(NaN) - 1.18) < 1e-12);
  assert.ok(Math.abs(campusExposure(-1) - 1.18) < 1e-12);
  assert.equal(campusExposure(2), 1.08);
  scene.dispose();
  engine.dispose();
});
