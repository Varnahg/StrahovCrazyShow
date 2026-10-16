import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { Effect } from "@babylonjs/core/Materials/effect";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { WebGPUShaderProcessorGLSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsGLSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import {
  Initialize,
  Process,
  Finalize,
} from "@babylonjs/core/Engines/Processors/shaderProcessor";
import type { _IProcessingOptions } from "@babylonjs/core/Engines/Processors/shaderProcessingOptions";
import { createAtmosphereSky } from "../client/atmosphere-sky";
import "../client/sky-weather";

type Glslang = {
  compileGLSL(source: string, stage: "vertex" | "fragment"): Uint32Array;
};
type Tint = { convertSpirV2WGSL(code: Uint32Array): string };

/** Execute the exact vendored compiler wrappers in a Node context. No browser,
 * GPU, network, file output, or rewritten shader grammar is involved. */
async function loadCompiler<T>(name: "glslang" | "twgsl"): Promise<T> {
  const path = fileURLToPath(
    new URL(`../public/tools/webgpu-9.30/${name}.js`, import.meta.url),
  );
  const wasm = fileURLToPath(
    new URL(`../public/tools/webgpu-9.30/${name}.wasm`, import.meta.url),
  );
  const module = { exports: {} as unknown };
  const sandbox: Record<string, unknown> = {
    module,
    exports: module.exports,
    require: createRequire(path),
    __dirname: dirname(path),
    __filename: path,
    process,
    console,
    setTimeout,
    clearTimeout,
    Buffer,
    TextDecoder,
    WebAssembly,
    ArrayBuffer,
    Uint8Array,
    Uint8ClampedArray,
    Uint32Array,
  };
  runInNewContext(readFileSync(path, "utf8"), sandbox, { filename: path });
  // The shipped glslang wrapper is browser-oriented and does not implement
  // Node file loading. Inject bytes through Emscripten's wasmBinary option;
  // retain the library's own initialization and conversion wrapper unchanged.
  const instantiate = sandbox.Module as (
    options: Record<string, unknown>,
  ) => unknown;
  assert.equal(typeof instantiate, "function");
  const wasmBinary = readFileSync(wasm);
  sandbox.Module = (options: Record<string, unknown>) =>
    instantiate({ ...options, wasmBinary });
  assert.equal(typeof module.exports, "function");
  return (module.exports as (path: string) => Promise<T>)(wasm);
}

function processPair(vertex: string, fragment: string) {
  const options: _IProcessingOptions = {
    defines: [],
    indexParameters: {},
    isFragment: false,
    shouldUseHighPrecisionShader: true,
    supportsUniformBuffers: true,
    shadersRepository: "",
    includesShadersStore: Effect.IncludesShadersStore,
    processor: new WebGPUShaderProcessorGLSL(),
    processingContext: new WebGPUShaderProcessingContext(ShaderLanguage.GLSL),
    version: "100",
    platformName: "WEBGPU",
    isNDCHalfZRange: true,
    useReverseDepthBuffer: false,
  };
  let output: { vertexCode: string; fragmentCode: string } | undefined;
  Initialize(options);
  Process(vertex, options, (vertexCode) => {
    options.isFragment = true;
    Process(fragment, options, (fragmentCode) => {
      output = Finalize(vertexCode, fragmentCode, options);
    });
  });
  assert.ok(
    output,
    "these shader-store sources have no asynchronous external includes",
  );
  return output;
}

test("actual sky, sun and moon shaders pass the pinned Babylon GLSL→SPIR-V→WGSL CPU pipeline", async () => {
  const glslang = await loadCompiler<Glslang>("glslang");
  const tint = await loadCompiler<Tint>("twgsl");
  for (const [vertexName, fragmentName] of [
    ["strahovAtmosphere", "strahovAtmosphere"],
    ["strahovCelestial", "strahovSun"],
    ["strahovCelestial", "strahovMoon"],
  ]) {
    const code = processPair(
      Effect.ShadersStore[`${vertexName}VertexShader`],
      Effect.ShadersStore[`${fragmentName}FragmentShader`],
    );
    for (const stage of ["vertex", "fragment"] as const) {
      const spirv = glslang.compileGLSL(
        `#version 450\n${code[`${stage}Code`]}`,
        stage,
      );
      assert.ok(spirv.length > 0, `${fragmentName}/${stage} produced SPIR-V`);
      const wgsl = tint.convertSpirV2WGSL(spirv);
      assert.match(
        wgsl,
        new RegExp(`@${stage}\\b`),
        `${fragmentName}/${stage} produced WGSL`,
      );
      assert.doesNotMatch(
        wgsl,
        /diagnostic\s*\(\s*off\s*,\s*derivative_uniformity/,
      );
      if (stage === "fragment")
        assert.match(
          wgsl,
          /textureSample\(/,
          "implicit mip filtering survives conversion",
        );
    }
  }
  // Translation is CPU evidence only. Browser WGSL validation and the rendered
  // horizon, cloud edges and lunar limb remain separate real-GPU acceptance.
});

test("cloud and star textures retain mipmaps, trilinear filtering and their wrap modes", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const atmosphere = createAtmosphereSky(scene, "low");
  try {
    const noise = scene.textures.find(
      (texture) => texture.name === "atmosphere:periodic-cloud-noise",
    ) as Texture;
    const stars = scene.textures.find(
      (texture) => texture.name === "atmosphere:HYG-v4.1-bright-stars",
    ) as Texture;
    for (const texture of [noise, stars]) {
      assert.ok(texture);
      assert.equal(texture.getInternalTexture()?.generateMipMaps, true);
      assert.equal(texture.samplingMode, Texture.TRILINEAR_SAMPLINGMODE);
      assert.equal(texture.gammaSpace, false);
      assert.equal(texture.wrapU, Texture.WRAP_ADDRESSMODE);
    }
    assert.equal(noise.wrapV, Texture.WRAP_ADDRESSMODE);
    assert.equal(stars.wrapV, Texture.CLAMP_ADDRESSMODE);
  } finally {
    atmosphere.dispose();
    scene.dispose();
    engine.dispose();
  }
});
