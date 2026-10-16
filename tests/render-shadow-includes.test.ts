import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import {
  ProcessIncludes,
  _FunctionContainer,
} from "@babylonjs/core/Engines/Processors/shaderProcessor";
import type { _IProcessingOptions } from "@babylonjs/core/Engines/Processors/shaderProcessingOptions";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Material } from "@babylonjs/core/Materials/material";
import { ShadowDepthWrapper } from "@babylonjs/core/Materials/shadowDepthWrapper";
import type {
  Effect,
  IEffectCreationOptions,
} from "@babylonjs/core/Materials/effect";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import "../client/render-shaders";

const shadowIncludes = [
  "shadowMapVertexExtraDeclaration",
  "shadowMapVertexNormalBias",
  "shadowMapVertexMetric",
  "shadowMapFragmentSoftTransparentShadow",
  "shadowMapFragment",
  "shadowMapFragmentExtraDeclaration",
] as const;
type Sources = { vertexSource: string; fragmentSource: string };

/** Run the actual wrapper, replacing only effect compilation. No GPU exists.
 * The original material keeps an explicit language, independent of its engine. */
function wrapperSources(language: ShaderLanguage): Sources {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const material = new Material("shadow source", scene);
  const mesh = MeshBuilder.CreateBox("shadow caster", {}, scene);
  mesh.material = material;
  const subMesh = mesh.subMeshes[0];
  const wrapper = new ShadowDepthWrapper(material, scene);
  const glsl = language === ShaderLanguage.GLSL;
  const original = {
    shaderLanguage: language,
    isReady: () => true,
    vertexSourceCodeBeforeMigration: glsl
      ? "void main() {\n#define CUSTOM_VERTEX_UPDATE_WORLDPOS\n}"
      : "@vertex\nfn main() {\n#define CUSTOM_VERTEX_UPDATE_WORLDPOS\n}",
    fragmentSourceCodeBeforeMigration: glsl
      ? "void main() {\n#define CUSTOM_FRAGMENT_BEFORE_FOG\n}"
      : "@fragment\nfn main() {\n#define CUSTOM_FRAGMENT_BEFORE_FOG\n}",
    defines: "#define SHADOWS\n#define SHADOW0\n#define ALPHATEST",
    getUniformNames: () => ["world"],
    getAttributesNames: () => ["position", "normal"],
    getUniformBuffersNames: () => [],
    getSamplers: () => ["diffuseSampler"],
    getIndexParameters: () => ({}),
  } as unknown as Effect;
  let captured: Sources | undefined;
  const create = engine.createEffect;
  engine.createEffect = ((
    sources: Sources,
    options: IEffectCreationOptions,
  ) => {
    assert.equal(options.shaderLanguage, language);
    assert.ok(options.defines?.includes("#define ALPHATEST"));
    assert.ok(options.uniformsNames.includes("biasAndScaleSM"));
    captured = sources;
    return { isReady: () => true, dispose() {} } as unknown as Effect;
  }) as typeof engine.createEffect;
  try {
    material.onEffectCreatedObservable.notifyObservers({
      effect: original,
      subMesh,
    });
    // The wrapper uses the generator only as its per-generator cache key.
    assert.equal(
      wrapper.isReadyForSubMesh(
        subMesh,
        ["#define SM_FLOAT 1"],
        {} as ShadowGenerator,
        false,
        0,
      ),
      true,
    );
    assert.ok(captured);
    return captured;
  } finally {
    engine.createEffect = create;
    wrapper.dispose();
    scene.dispose();
    engine.dispose();
  }
}

async function expand(
  sources: Sources,
  language: ShaderLanguage,
  includes = ShaderStore.GetIncludesShadersStore(language),
) {
  const requests: string[] = [];
  const oldLoadFile = _FunctionContainer.loadFile;
  // A real network callback is asynchronous. This models Vite's successful
  // HTML fallback without opening a port or touching any source/dependency.
  _FunctionContainer.loadFile = (url, success) => {
    requests.push(url);
    queueMicrotask(() => success("<!doctype html><html>SPA fallback</html>"));
    return { abort() {} } as ReturnType<typeof oldLoadFile>;
  };
  const options: _IProcessingOptions = {
    defines: [],
    indexParameters: {},
    isFragment: false,
    shouldUseHighPrecisionShader: true,
    supportsUniformBuffers: true,
    shadersRepository: ShaderStore.GetShadersRepository(language),
    includesShadersStore: { ...includes },
    processor: null,
    version: "200",
    platformName: "WEBGPU",
    processingContext: null,
    isNDCHalfZRange: true,
    useReverseDepthBuffer: false,
  };
  try {
    const process = (source: string) =>
      new Promise<string>((resolve) =>
        ProcessIncludes(source, options, resolve),
      );
    // Babylon's include processor has shared traversal state; keep stages serial.
    const vertex = await process(sources.vertexSource);
    const fragment = await process(sources.fragmentSource);
    return { requests, vertex, fragment };
  } finally {
    _FunctionContainer.loadFile = oldLoadFile;
  }
}

for (const [label, language] of [
  ["GLSL", ShaderLanguage.GLSL],
  ["WGSL", ShaderLanguage.WGSL],
] as const) {
  test(`${label} shadow wrapper includes are registered before any lazy shadow generator`, async () => {
    const store = ShaderStore.GetIncludesShadersStore(language);
    for (const name of shadowIncludes)
      assert.equal(
        typeof store[name],
        "string",
        `${label} ${name} must be bundled`,
      );
    const sources = wrapperSources(language);
    const output = await expand(sources, language);
    assert.deepEqual(
      output.requests,
      [],
      "a local shader must never fall through to SPA HTTP",
    );
    for (const code of [output.vertex, output.fragment]) {
      assert.doesNotMatch(code, /<!doctype|<html|\bundefined\b|#include\s*</i);
      assert.match(code, /depthValuesSM|biasAndScaleSM/);
    }
    // Check the sixth declaration independently too. Babylon 9.30's native WGSL
    // wrapper does not inject it via its GLSL-only /void main/ replacement.
    const declaration = await expand(
      {
        vertexSource: store.shadowMapFragmentExtraDeclaration,
        fragmentSource: "",
      },
      language,
    );
    assert.deepEqual(declaration.requests, []);
    assert.match(declaration.vertex, /vDepthMetricSM/);
    assert.doesNotMatch(
      declaration.vertex,
      /<!doctype|<html|\bundefined\b|#include\s*</i,
    );
  });
}

test("missing GLSL shadow includes reproduce five HTML substitutions rather than a valid shader", async () => {
  const incomplete = { ...ShaderStore.IncludesShadersStore };
  for (const name of shadowIncludes.slice(0, 5)) delete incomplete[name];
  const output = await expand(
    wrapperSources(ShaderLanguage.GLSL),
    ShaderLanguage.GLSL,
    incomplete,
  );
  assert.deepEqual(
    output.requests,
    shadowIncludes
      .slice(0, 5)
      .map(
        (name) => `${ShaderStore.ShadersRepository}ShadersInclude/${name}.fx`,
      ),
  );
  assert.equal(
    (`${output.vertex}\n${output.fragment}`.match(/<!doctype html>/g) ?? [])
      .length,
    5,
  );
});
