import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import {
  Initialize,
  Process,
  Finalize,
} from "@babylonjs/core/Engines/Processors/shaderProcessor";
import type { _IProcessingOptions } from "@babylonjs/core/Engines/Processors/shaderProcessingOptions";
import type { Color3 } from "@babylonjs/core/Maths/math.color";
import type {
  Vector2,
  Vector3,
  Vector4,
} from "@babylonjs/core/Maths/math.vector";
import type { Weather } from "../shared/weather";
import { SkyWeatherController } from "../client/sky-weather";
import { Effect } from "@babylonjs/core/Materials/effect";

test("both shader paths use spherical layers, exclude below-horizon clouds and taper the solar quad edge", () => {
  for (const store of [Effect.ShadersStore, ShaderStore.ShadersStoreWGSL]) {
    for (const fragment of ["strahovAtmosphere", "strahovSun", "strahovMoon"]) {
      const shader = store[`${fragment}FragmentShader`];
      assert.match(shader, /shell \/ \(sqrt\(ry \* ry \+ shell\) \+ ry\)/);
      assert.doesNotMatch(shader, /max\(direction.y,\s*\.085\)/);
      assert.match(shader, /direction.y <= 0.0/);
      assert.match(shader, /atmosphereHaze/);
    }
    assert.match(
      store.strahovSunFragmentShader,
      /1.0-smoothstep\(4.5,6.0,radius\)/,
    );
  }
});

function fixture(native: boolean, reverseDepth = false) {
  const engine = new NullEngine();
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU = native;
  engine.useReverseDepthBuffer = reverseDepth;
  const scene = new Scene(engine);
  const controller = new SkyWeatherController(scene);
  const materials = scene.materials.filter(
    (material): material is ShaderMaterial =>
      material instanceof ShaderMaterial,
  );
  assert.equal(materials.length, 3);
  return {
    engine,
    scene,
    controller,
    materials,
    dispose() {
      controller.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}

function uniformSnapshot(material: ShaderMaterial) {
  const values = material as unknown as {
    _floats: Record<string, number>;
    _vectors2: Record<string, Vector2>;
    _vectors3: Record<string, Vector3>;
    _vectors4: Record<string, Vector4>;
    _colors3: Record<string, Color3>;
    _matrices3x3: Record<string, Float32Array>;
  };
  const vectors = (input: Record<string, { asArray(): number[] }>) =>
    Object.fromEntries(
      Object.entries(input).map(([name, value]) => [name, value.asArray()]),
    );
  return {
    name: material.name,
    floats: { ...values._floats },
    vectors2: vectors(values._vectors2),
    vectors3: vectors(values._vectors3),
    vectors4: vectors(values._vectors4),
    colors3: vectors(values._colors3),
    matrices3x3: Object.fromEntries(
      Object.entries(values._matrices3x3).map(([name, value]) => [
        name,
        [...value],
      ]),
    ),
    uniforms: material.options.uniforms,
    samplers: material.options.samplers,
    depthWrite: !material.disableDepthWrite,
    backFaceCulling: material.backFaceCulling,
    blend: material.needAlphaBlending(),
    textures: material.getActiveTextures().map((texture) => ({
      name: texture.name,
      gammaSpace: texture.gammaSpace,
      wrapU: texture.wrapU,
      wrapV: texture.wrapV,
      sampling: texture.getInternalTexture()?.samplingMode,
      mipmaps: texture.getInternalTexture()?.generateMipMaps,
    })),
  };
}

test("native sky and celestial materials preserve GLSL host uniforms, textures, geometry and cleanup", () => {
  const reference = fixture(false),
    native = fixture(true);
  try {
    assert.ok(
      reference.materials.every(
        (material) => material.options.shaderLanguage === ShaderLanguage.GLSL,
      ),
    );
    assert.ok(
      native.materials.every(
        (material) => material.options.shaderLanguage === ShaderLanguage.WGSL,
      ),
    );
    for (const [index, instant] of [
      Date.parse("2026-10-16T00:00:00Z"),
      Date.parse("2026-10-16T05:20:00Z"),
      Date.parse("2026-10-16T11:00:00Z"),
      Date.parse("2026-10-16T16:30:00Z"),
      Date.parse("2026-10-26T22:00:00Z"),
    ].entries()) {
      const input = {
        instant,
        dt: 0.016,
        player: { x: 110 + index * 11, y: 3, z: 12 - index * 7 },
        quality: index % 2 ? "low" : "high",
        weather: {
          wind: 6,
          windDirection: 250,
          cloud: index / 5,
          rain: index / 2,
        } as Weather,
      };
      const refState = reference.controller.update(input);
      const nativeState = native.controller.update(input);
      assert.deepEqual(nativeState, refState);
      const atmosphereInput = {
        instant,
        dt: input.dt,
        quality: input.quality,
        player: input.player,
        sun: refState.sun,
        moon: refState.moon,
        cloud: input.weather.cloud,
        rain: input.weather.rain,
        cloudWind: { x: 5, z: -3 },
        cloudLayers: { low: 0.3, mid: 0.6, high: 0.2 },
      };
      reference.controller.atmosphere.update(atmosphereInput);
      native.controller.atmosphere.update(atmosphereInput);
      assert.deepEqual(
        native.materials.map(uniformSnapshot),
        reference.materials.map(uniformSnapshot),
      );
      const geometry = (value: typeof native) =>
        value.scene.meshes.map((mesh) => ({
          name: mesh.name,
          enabled: mesh.isEnabled(),
          position: mesh.position.asArray(),
          scale: mesh.scaling.asArray(),
          rotation: mesh.rotationQuaternion?.asArray(),
          applyFog: mesh.applyFog,
        }));
      assert.deepEqual(geometry(native), geometry(reference));
    }
    native.controller.dispose();
    reference.controller.dispose();
    assert.equal(native.scene.textures.length, 0);
    assert.equal(reference.scene.textures.length, 0);
    assert.equal(native.scene.materials.length, 0);
  } finally {
    native.scene.dispose();
    native.engine.dispose();
    reference.scene.dispose();
    reference.engine.dispose();
  }
});

function processNativePair(
  vertex: string,
  fragment: string,
  reverseDepth: boolean,
  fog: boolean,
) {
  const context = new WebGPUShaderProcessingContext(ShaderLanguage.WGSL);
  const options: _IProcessingOptions = {
    defines: fog ? ["#define FOG"] : [],
    indexParameters: {},
    isFragment: false,
    shouldUseHighPrecisionShader: true,
    supportsUniformBuffers: true,
    shadersRepository: "",
    includesShadersStore: ShaderStore.IncludesShadersStoreWGSL,
    processor: new WebGPUShaderProcessorWGSL(),
    processingContext: context,
    version: "100",
    platformName: "WEBGPU",
    isNDCHalfZRange: true,
    useReverseDepthBuffer: reverseDepth,
  };
  let code: { vertexCode: string; fragmentCode: string } | undefined;
  Initialize(options);
  Process(vertex, options, (vertexCode) => {
    options.isFragment = true;
    Process(fragment, options, (fragmentCode) => {
      code = Finalize(vertexCode, fragmentCode, options);
    });
  });
  assert.ok(code);
  return { code, context };
}

test("all native sky stages produce matching Babylon uniform/sampler interfaces and retain engine Y transform", () => {
  for (const reverse of [false, true]) {
    const f = fixture(true, reverse);
    try {
      for (const [vertexName, fragmentName, materialName] of [
        ["strahovAtmosphere", "strahovAtmosphere", "art:atmosphere-sky"],
        ["strahovCelestial", "strahovSun", "sky:solar-disc"],
        ["strahovCelestial", "strahovMoon", "sky:lunar-disc"],
      ]) {
        const material = f.materials.find(
          (entry) => entry.name === materialName,
        )!;
        for (const fog of [false, true]) {
          const { code, context } = processNativePair(
            ShaderStore.ShadersStoreWGSL[`${vertexName}VertexShader`],
            ShaderStore.ShadersStoreWGSL[`${fragmentName}FragmentShader`],
            reverse,
            fog,
          );
          assert.deepEqual(
            context.leftOverUniforms.map((entry) => entry.name).sort(),
            [...new Set(material.options.uniforms)].sort(),
          );
          assert.deepEqual(
            Object.keys(context.availableTextures).sort(),
            [...material.options.samplers].sort(),
          );
          assert.deepEqual(
            Object.keys(context.availableSamplers).sort(),
            material.options.samplers.map((name) => `${name}Sampler`).sort(),
          );
          assert.doesNotMatch(
            code.vertexCode + code.fragmentCode,
            /uniform vec[234]|varying vec[234]|attribute vec[234]|gl_Position|gl_FragColor|texture2D\(/,
          );
          assert.doesNotMatch(
            code.fragmentCode,
            /diagnostic\s*\(\s*off\s*,\s*derivative_uniformity/,
          );
          assert.equal(
            (code.vertexCode.match(/return vertexOutputs;/g) ?? []).length,
            1,
          );
          assert.ok(
            code.vertexCode.indexOf("internals.yFactor_") <
              code.vertexCode.indexOf("return vertexOutputs;"),
          );
          assert.match(code.fragmentCode, /textureSample\(/);
          if (fragmentName === "strahovAtmosphere")
            assert.equal(
              context.leftOverUniforms.find(
                (entry) => entry.name === "worldToCatalog",
              )?.type,
              "mat3x3f",
            );
        }
      }
      for (const material of f.materials.filter(
        (entry) => entry.name !== "art:atmosphere-sky",
      ))
        assert.equal(
          uniformSnapshot(material).floats.farDepth,
          reverse ? 0.000001 : 0.999999,
        );
    } finally {
      f.dispose();
    }
  }
  // Native processing verifies generated interfaces; only a real WebGPU device
  // validates WGSL typing/uniformity and the rendered clouds, star atlas and limb.
});

test("the existing nine-value celestial matrix keeps Babylon native UBO column padding", () => {
  const writes: unknown[][] = [];
  const matrix = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const align = (
    UniformBuffer.prototype as unknown as {
      _updateMatrix3x3ForUniform(name: string, value: Float32Array): void;
    }
  )._updateMatrix3x3ForUniform;
  align.call(
    {
      updateUniform: (name: string, value: Float32Array, count: number) =>
        writes.push([name, [...value].slice(0, count), count]),
    } as unknown as UniformBuffer,
    "worldToCatalog",
    matrix,
  );
  assert.deepEqual(writes, [
    ["worldToCatalog", [1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0], 12],
  ]);
  assert.deepEqual([...matrix], [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
