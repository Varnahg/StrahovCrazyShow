import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ExtractHighlightsPostProcess } from "@babylonjs/core/PostProcesses/extractHighlightsPostProcess";
import { EffectWrapper } from "@babylonjs/core/Materials/effectRenderer";
import { Effect } from "@babylonjs/core/Materials/effect";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import "@babylonjs/core/Shaders/extractHighlights.fragment";
import "@babylonjs/core/Shaders/postprocess.vertex";
import "@babylonjs/core/ShadersWGSL/extractHighlights.fragment";
import "@babylonjs/core/ShadersWGSL/postprocess.vertex";
import {
  campusSurfaceArt,
  campusExposure,
  configureCampusGrade,
  CampusSurfaceArtPlugin,
  campusBloomExtractionWeight,
  softenCampusBloomShader,
  installCampusBloomExtraction,
} from "../client/cinematic-art";

test("captured HDR sky no longer becomes a full-strength bloom plateau at the threshold", () => {
  // Real v3b GPU frame4285, .cache/.../bloom-gpu-v3b.json in research evidence.
  // SHA256 f19a264f158a808386dd5e13dbd7fc54c93cc1bd0f770f4f6e0f0514beb50c58.
  const threshold = 0.9816156625747681,
    exposure = 1.0800000429153442;
  const source = [0.82080078125, 0.9501953125, 1.052734375];
  const luma =
    (source[0] * 0.2126 + source[1] * 0.7152 + source[2] * 0.0722) * exposure;
  assert.ok(luma > threshold && luma - threshold < 0.023);
  const weight = campusBloomExtractionWeight(luma, threshold);
  assert.ok(weight > 0.02 && weight < 0.04);
  assert.ok(
    source[1] + source[1] * weight * 0.1 < 1,
    "near-threshold sky does not clip to a cyan/white card after merge",
  );
  assert.ok(
    source[1] + source[1] * 0.1 > 1,
    "original full-colour step reproduces the captured clipping mechanism",
  );
  assert.ok(
    campusBloomExtractionWeight(4, threshold) > 0.7,
    "HDR practical lights still bloom",
  );
  for (const boundary of [threshold - 0.08, threshold, threshold + 0.08]) {
    const before = campusBloomExtractionWeight(boundary - 1e-7, threshold);
    const after = campusBloomExtractionWeight(boundary + 1e-7, threshold);
    assert.ok(Math.abs(after - before) < 1e-6, "no binary extraction edge");
  }
  let previous = 0;
  for (let brightness = 0; brightness < 8; brightness += 0.01) {
    const current = campusBloomExtractionWeight(brightness, threshold);
    assert.ok(current >= previous && current <= 1);
    previous = current;
  }
});

test("both pinned extraction shaders retain UV/sampling/alpha and receive only the continuous response", () => {
  for (const [store, native] of [
    [Effect.ShadersStore, false],
    [ShaderStore.ShadersStoreWGSL, true],
  ] as const) {
    const original = store.extractHighlightsPixelShader;
    const result = softenCampusBloomShader("fragment", original);
    assert.match(result, /campusBloomWeight\(luma,/);
    assert.match(result, /shoulder \* shoulder \/ 0.32/);
    assert.doesNotMatch(result, /step\((?:uniforms\.)?threshold,\s*luma\)/);
    assert.match(
      result,
      native
        ? /textureSample\(textureSampler,textureSamplerSampler,input.vUV\)/
        : /texture2D\(textureSampler,vUV\)/,
    );
    assert.equal(
      store.extractHighlightsPixelShader,
      original,
      "global stock shader is never changed",
    );
    assert.equal(
      softenCampusBloomShader("vertex", store.postprocessVertexShader),
      store.postprocessVertexShader,
    );
  }
  assert.throws(
    () => softenCampusBloomShader("fragment", "unknown shader"),
    /verified 9.30/,
  );
});

test("actual owned extractor compiles with a distinct cache key and releases its unique processing hook", async () => {
  const engine = new NullEngine();
  const owned = new ExtractHighlightsPostProcess("owned", {
    engine,
    size: 1,
    blockCompilation: true,
  });
  const original = new ExtractHighlightsPostProcess("unrelated stock", {
    engine,
    size: 1,
    blockCompilation: true,
  });
  const remove = installCampusBloomExtraction(owned);
  const processing = (
    EffectWrapper as unknown as {
      _GetShaderCodeProcessing(name: string): unknown;
    }
  )._GetShaderCodeProcessing;
  try {
    assert.ok(processing(owned.name));
    assert.equal(processing(original.name), undefined);
    owned.updateEffect();
    original.updateEffect();
    await Promise.all(
      [owned, original].map(
        (post) =>
          new Promise<void>((resolve) =>
            post.getEffect().executeWhenCompiled(() => resolve()),
          ),
      ),
    );
    assert.notEqual(owned.getEffect(), original.getEffect());
    assert.match(owned.getEffect().fragmentSourceCode, /campusBloomWeight/);
    assert.match(owned.getEffect().defines, /CAMPUS_BLOOM_SOFT_KNEE_V1/);
    assert.doesNotMatch(
      original.getEffect().fragmentSourceCode,
      /campusBloomWeight/,
    );
    owned.dispose();
    assert.equal(processing(owned.name), undefined);
    remove();
    assert.equal(processing(original.name), undefined);
  } finally {
    remove();
    owned.dispose();
    original.dispose();
    engine.dispose();
  }
});

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
    assert.equal(plugin.isCompatible(ShaderLanguage.WGSL), true);
    assert.ok(plugin.getCustomCode("fragment", ShaderLanguage.WGSL));
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
