import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GroundCoverMaterialPlugin } from "../client/ground-cover-material";
import {
  CampusSurfaceArtPlugin,
  campusSurfaceArt,
} from "../client/cinematic-art";
import {
  PHOTOGRAMMETRY_WINDOW_FACADES,
  PhotogrammetryNightPlugin,
} from "../client/photogrammetry-lighting";

/** Real PBR hooks, shader-store includes, preprocessing and uniform layout.
 * Only pipeline creation stays NullEngine: this is NOT driver WGSL validation. */
class NativeProcessingEngine extends NullEngine {
  readonly sources: { vertex: string; fragment: string; defines: string }[] =
    [];
  constructor(native = true) {
    super();
    this._isWebGPU = native;
    this._webGLVersion = 2;
    this._shaderPlatformName = native ? "WEBGPU" : "WEBGL2";
    this.getCaps().standardDerivatives = true;
  }
  override _getShaderProcessor(language: ShaderLanguage) {
    return this.isWebGPU
      ? new WebGPUShaderProcessorWGSL()
      : super._getShaderProcessor(language);
  }
  override _getShaderProcessingContext(language: ShaderLanguage) {
    return this.isWebGPU
      ? new WebGPUShaderProcessingContext(language)
      : super._getShaderProcessingContext(language);
  }
  override createShaderProgram(
    ...args: Parameters<NullEngine["createShaderProgram"]>
  ) {
    this.sources.push({ vertex: args[1], fragment: args[2], defines: args[3] });
    return super.createShaderProgram(...args);
  }
}

function fixture(native = true) {
  const engine = new NativeProcessingEngine(native);
  const scene = new Scene(engine);
  new FreeCamera("surface test", new Vector3(0, 1, -5), scene);
  const mesh = MeshBuilder.CreateBox("surface", {}, scene);
  const material = new PBRMaterial("surface", scene);
  material.metallic = 0;
  material.roughness = 0.6;
  material.albedoColor.set(0.22, 0.31, 0.46);
  mesh.material = material;
  return {
    engine,
    scene,
    mesh,
    material,
    dispose() {
      scene.dispose();
      engine.dispose();
    },
  };
}

function uniformData(
  plugin: MaterialPluginBase,
  f: ReturnType<typeof fixture>,
) {
  const buffer = new UniformBuffer(f.engine);
  for (const uniform of plugin.getUniforms(f.material.shaderLanguage).ubo!)
    buffer.addUniform(uniform.name, uniform.size!);
  buffer.create();
  try {
    plugin.bindForSubMesh(buffer, f.scene, f.engine, f.mesh.subMeshes[0]);
    return Array.from(buffer.getData());
  } finally {
    buffer.dispose();
  }
}

// Compare the authored arithmetic, not shader declaration syntax. This leaves
// every numeric literal/operator/swizzle intact, including the rain factor.
function arithmetic(code: string) {
  return code
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\b(?:uniforms|fragmentInputs|scene)\./g, "")
    .replace(/\bvec([234])f\b/g, "vec$1")
    .replace(/\b(?:let|var|float|vec[234])\s+(?=\w+\s*=)/g, "")
    .replace(/\s+/g, "");
}

const kinds = [
  "asphalt",
  "concrete",
  "plaster",
  "grass",
  "paving",
  "sett",
  "gravel",
];

test("grass/soil blend passes real PBR shader processing with normal and roughness hooks", async () => {
  for (const native of [false, true])
    for (const soilBase of [false, true]) {
      const f = fixture(native);
      try {
        const color = RawTexture.CreateRGBATexture(
          new Uint8Array([112, 96, 74, 255]),
          1,
          1,
          f.scene,
        );
        const normal = RawTexture.CreateRGBATexture(
          new Uint8Array([128, 128, 255, 255]),
          1,
          1,
          f.scene,
        );
        normal.gammaSpace = false;
        f.material.albedoTexture = color;
        f.material.bumpTexture = normal;
        f.material.metallicTexture = normal;
        new GroundCoverMaterialPlugin(f.material, soilBase, {
          maps: { color, normal, roughness: normal },
          repeat: 1.299996018409729,
          tint: [1.15, 1.1, 0.96],
          normalStrength: 0.33,
          darken: 0.18,
          smooth: 0.23,
        });
        await f.material.forceCompilationAsync(f.mesh);
        assert.equal(f.engine.sources.length, 1);
        assert.match(
          f.engine.sources[0].defines,
          /^#define TEXTURE_REPETITION_MODE 2$/m,
        );
        const { fragment } = f.engine.sources[0];
        assert.match(fragment, /groundHash/);
        assert.match(fragment, /groundTBN/);
        assert.match(fragment, /groundOtherRoughness/);
        assert.match(fragment, /_texRepTriangleGrid/);
        assert.match(fragment, /_texRepLoadRot2x2/);
        assert.match(fragment, /groundCompressGrass/);
        for (const name of ["Albedo", "Normal", "Roughness"])
          assert.match(
            fragment,
            new RegExp("TEXRD\\(groundOther" + name + ","),
          );
        for (const sampler of [
          "albedoSampler",
          "bumpSampler",
          "reflectivitySampler",
        ])
          assert.match(fragment, new RegExp("TEXRD\\(" + sampler + ","));
        assert.doesNotMatch(fragment, /texture(?:2D|Sample)\(groundOther/);
        assert.match(
          fragment,
          /metallicRoughness.g=mix\(metallicRoughness.g,groundMixedRoughness,groundBlend\)/,
        );
        assert.ok(
          fragment.indexOf("groundMixedRoughness") <
            fragment.indexOf(
              native
                ? "fn reflectivityBlock"
                : "reflectivityOutParams reflectivityBlock",
            ),
        );
        if (native) {
          assert.match(fragment, /@fragment/);
          assert.match(fragment, /groundCoverConfig\s*:\s*vec4f/);
          assert.match(
            fragment,
            /fragmentInputs.vPositionW.xz\/uniforms.groundCoverConfig.y/,
          );
          assert.doesNotMatch(
            fragment,
            /sampler2D|texture2D\(|uniform vec|dFdx\(/,
          );
          const hexSampler = fragment.slice(
            fragment.indexOf("fn _texRepSample("),
            fragment.indexOf("fn TEXRD("),
          );
          assert.equal(
            (hexSampler.match(/textureSampleGrad\(/g) ?? []).length,
            3,
            "exactly three native samples per channel, no fallback or Voronoi path",
          );
          assert.doesNotMatch(hexSampler, /textureSample\(/);
        } else {
          assert.match(fragment, /uniform sampler2D groundOtherAlbedo/);
          assert.match(fragment, /#define TEXRD\(s,uv\) _texRepSample\(s,uv\)/);
        }
        await f.material.forceCompilationAsync(f.mesh);
        assert.equal(
          f.engine.sources.length,
          1,
          "stable field and wetness reuse the compiled effect",
        );
      } finally {
        f.dispose();
      }
    }
});

test("native surface PBR keeps calibrated uniforms, wet material factors and both arithmetic recipes", () => {
  const f = fixture();
  try {
    for (const kind of kinds)
      for (const preserve of [false, true]) {
        const art = campusSurfaceArt(kind)!;
        const material = new PBRMaterial(`${kind}:${preserve}`, f.scene);
        material.albedoColor.set(0.22, 0.31, 0.46);
        material.roughness = 0.23;
        const plugin = new CampusSurfaceArtPlugin(material, art, preserve);
        assert.equal(material.shaderLanguage, ShaderLanguage.WGSL);
        assert.deepEqual(
          plugin.getUniforms(ShaderLanguage.WGSL).ubo,
          plugin.getUniforms(ShaderLanguage.GLSL).ubo,
        );
        assert.equal(
          plugin.getUniforms(ShaderLanguage.WGSL).fragment,
          undefined,
        );
        const expected = [
          art.saturation,
          art.variation,
          art.coarseMetres,
          art.fineMetres,
          ...art.sourceMean,
          preserve ? 1 : art.nearDetail,
          preserve ? 1 : art.farDetail,
          art.roughnessVariation,
          0,
          0,
        ];
        assert.deepEqual(uniformData(plugin, f), expected.map(Math.fround));
        assert.deepEqual(material.albedoColor.asArray(), [0.22, 0.31, 0.46]);
        assert.equal(material.roughness, 0.23);
        assert.equal(material.metadata.originalTextureChannelsUnmodified, true);
        const glsl = plugin.getCustomCode("fragment", ShaderLanguage.GLSL)!;
        const wgsl = plugin.getCustomCode("fragment", ShaderLanguage.WGSL)!;
        assert.equal(
          arithmetic(wgsl.CUSTOM_FRAGMENT_BEFORE_LIGHTS),
          arithmetic(glsl.CUSTOM_FRAGMENT_BEFORE_LIGHTS),
        );
        assert.equal(
          arithmetic(wgsl.CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS ?? ""),
          arithmetic(glsl.CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS ?? ""),
        );
        assert.equal(plugin.getCustomCode("vertex", ShaderLanguage.WGSL), null);
        assert.equal(
          plugin.getCustomCode("fragment", 9 as ShaderLanguage),
          null,
        );
        material.dispose();
      }
  } finally {
    f.dispose();
  }
});

test("real PBR WGSL processing retains cross-function variation and prunes noise for plaster", async () => {
  for (const kind of ["asphalt", "plaster"]) {
    const f = fixture();
    try {
      new CampusSurfaceArtPlugin(f.material, campusSurfaceArt(kind)!);
      const before = {
        meshes: f.scene.meshes.length,
        textures: f.scene.textures.length,
        lights: f.scene.lights.length,
      };
      await f.material.forceCompilationAsync(f.mesh);
      assert.equal(f.engine.sources.length, 1);
      const { vertex, fragment } = f.engine.sources[0];
      assert.match(vertex, /@vertex/);
      assert.match(fragment, /@fragment/);
      assert.match(fragment, /campusArtSettings\s*:\s*vec4f/);
      assert.match(
        fragment,
        /scene\.vEyePosition\.xyz-fragmentInputs\.vPositionW/,
      );
      assert.match(
        fragment,
        /uniforms\.campusArtDetail\.rgb\*uniforms\.vAlbedoColor\.rgb/,
      );
      assert.doesNotMatch(
        fragment,
        /uniform vec[234] campus|GL_OES_standard_derivatives/,
      );
      if (kind === "asphalt") {
        assert.match(fragment, /var<private> campusArtVariation: f32 = 0\.5/);
        assert.match(
          fragment,
          /q \+= vec3f\(dot\(q,q\.yzx\+vec3f\(19\.19\)\)\)/,
        );
        assert.match(
          fragment,
          /metallicRoughness\.g=clamp\(metallicRoughness\.g\+/,
        );
        assert.equal(
          fragment.match(/campusArtVariation=campusArtNoise\(/g)?.length,
          1,
        );
        assert.ok(
          fragment.indexOf("var<private> campusArtVariation") <
            fragment.indexOf("fn reflectivityBlock"),
        );
      } else {
        assert.doesNotMatch(
          fragment,
          /campusArtVariation|campusArtHash|campusArtNoise/,
        );
      }
      assert.deepEqual(
        {
          meshes: f.scene.meshes.length,
          textures: f.scene.textures.length,
          lights: f.scene.lights.length,
        },
        before,
      );
      await f.material.forceCompilationAsync(f.mesh);
      assert.equal(
        f.engine.sources.length,
        1,
        "stable recipe reuses the existing effect",
      );
    } finally {
      f.dispose();
    }
  }
});

test("photogrammetry WGSL preserves every source-facade mask and occupancy expression", () => {
  const f = fixture();
  try {
    const plugin = new PhotogrammetryNightPlugin(
      f.material,
      PHOTOGRAMMETRY_WINDOW_FACADES,
      { night: 1, activity: 0.6, disposed: false },
    );
    const glsl = plugin.getCustomCode("fragment", ShaderLanguage.GLSL)!;
    const wgsl = plugin.getCustomCode("fragment", ShaderLanguage.WGSL)!;
    const glslMask = glsl.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION.replace(
      /vec3 photoNormal=normalize\(cross\(dFdx\(vPositionW\),dFdy\(vPositionW\)\)\);/,
      "",
    );
    assert.equal(
      arithmetic(wgsl.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION),
      arithmetic(glslMask),
    );
    assert.match(
      wgsl.CUSTOM_FRAGMENT_MAIN_BEGIN,
      /dpdx\(fragmentInputs\.vPositionW\)/,
    );
    assert.match(
      wgsl.CUSTOM_FRAGMENT_MAIN_BEGIN,
      /dpdy\(fragmentInputs\.vPositionW\)/,
    );
    assert.doesNotMatch(
      wgsl.CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION,
      /dpdx|dpdy|textureSample/,
    );
    assert.equal(wgsl.CUSTOM_FRAGMENT_EXTENSION, undefined);
    assert.equal(plugin.getUniforms(ShaderLanguage.WGSL).fragment, undefined);
    assert.equal(f.material.metadata.simulatedNightWindows, true);
  } finally {
    f.dispose();
  }
});

test("real photogrammetry WGSL places derivatives before discards and preserves facade cache identities", async () => {
  const f = fixture();
  const state = { night: 1, activity: 0.6, disposed: false };
  const texture = RawTexture.CreateRGBATexture(
    new Uint8Array([41, 46, 53, 255]),
    1,
    1,
    f.scene,
  );
  texture.gammaSpace = true;
  texture.uOffset = 0.125;
  texture.vOffset = 0.25;
  try {
    f.material.albedoTexture = texture;
    f.material.unlit = true;
    // Include an alpha-discard variant: the normal derivative must remain at
    // MAIN_BEGIN even when the later material block can discard fragments.
    texture.hasAlpha = true;
    f.material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    const plugin = new PhotogrammetryNightPlugin(
      f.material,
      [PHOTOGRAMMETRY_WINDOW_FACADES[0]],
      state,
    );
    await f.material.forceCompilationAsync(f.mesh);
    const source = f.engine.sources[0].fragment;
    assert.match(source, /photoNightSettings\s*:\s*vec2f/);
    const main = source.slice(source.indexOf("fn main("));
    assert.ok(
      main.indexOf("dpdx(fragmentInputs.vPositionW)") <
        main.indexOf("albedoOpacityBlock("),
    );
    assert.match(main, /let photoSource = albedoTexture\.rgb/);
    assert.match(main, /finalEmissive \+= vec3f\(1\.0,0\.61,0\.28\)/);
    assert.deepEqual(uniformData(plugin, f), [1, Math.fround(0.6), 0, 0]);
    state.night = 0.25;
    assert.equal(uniformData(plugin, f)[0], 0.25);
    state.disposed = true;
    assert.equal(uniformData(plugin, f)[0], 0);
    assert.equal(f.material.albedoTexture, texture);
    assert.equal(texture.uOffset, 0.125);
    assert.equal(texture.vOffset, 0.25);

    const other = new PBRMaterial("other facade", f.scene);
    other.albedoTexture = texture;
    other.unlit = true;
    other.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    new PhotogrammetryNightPlugin(
      other,
      [PHOTOGRAMMETRY_WINDOW_FACADES[1]],
      state,
    );
    f.mesh.material = other;
    await other.forceCompilationAsync(f.mesh);
    assert.equal(
      f.engine.sources.length,
      2,
      "different facade constants need different cached effects",
    );
    assert.notEqual(f.engine.sources[1].fragment, source);
  } finally {
    f.dispose();
  }
});
