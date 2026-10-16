import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { ShaderStore } from "@babylonjs/core/Engines/shaderStore";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRBaseMaterial } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import {
  ShadowDepthWrapper,
  type IIOptionShadowDepthMaterial,
} from "@babylonjs/core/Materials/shadowDepthWrapper";
import type {
  Effect,
  IEffectCreationOptions,
} from "@babylonjs/core/Materials/effect";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import {
  Initialize,
  Process,
  ProcessIncludes,
  Finalize,
} from "@babylonjs/core/Engines/Processors/shaderProcessor";
import type { _IProcessingOptions } from "@babylonjs/core/Engines/Processors/shaderProcessingOptions";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import "@babylonjs/core/ShadersWGSL/pbr.vertex";
import "@babylonjs/core/ShadersWGSL/pbr.fragment";
import "@babylonjs/core/ShadersWGSL/default.vertex";
import "@babylonjs/core/ShadersWGSL/default.fragment";
import "../client/render-shaders";
import { TreeWindPlugin } from "../client/tree-wind";

type Kind = "pbr" | "standard" | "custom";
type Sources = { vertexSource: string; fragmentSource: string };
type Capture = {
  source: Sources;
  options: IEffectCreationOptions;
  disposals: number;
  effect: Effect;
};
const baseDefines = [
  "#define NORMAL",
  "#define ALPHATEST",
  "#define METALLICWORKFLOW",
  "#define NUM_BONE_INFLUENCERS 0",
];
const shadowCases = [
  {
    name: "directional normal bias",
    float: 1,
    distance: 0,
    normal: 1,
    soft: 0,
  },
  { name: "soft alpha", float: 1, distance: 0, normal: 0, soft: 1 },
  {
    name: "packed point without normal bias",
    float: 0,
    distance: 1,
    normal: 0,
    soft: 0,
  },
] as const;

function options(
  language: ShaderLanguage,
  defines: string[],
): _IProcessingOptions {
  return {
    defines,
    indexParameters: {
      maxSimultaneousLights: 0,
      maxSimultaneousMorphTargets: 0,
    },
    isFragment: false,
    shouldUseHighPrecisionShader: true,
    supportsUniformBuffers: true,
    shadersRepository: ShaderStore.GetShadersRepository(language),
    includesShadersStore: ShaderStore.GetIncludesShadersStore(language),
    processor: null,
    processingContext: null,
    version: "100",
    platformName: "WEBGPU",
    isNDCHalfZRange: true,
    useReverseDepthBuffer: false,
  };
}

function expanded(code: string, language: ShaderLanguage) {
  let result: string | undefined;
  ProcessIncludes(code, options(language, []), (value) => {
    result = value;
  });
  assert.notEqual(
    result,
    undefined,
    "all includes are registered; no asynchronous HTTP fallback",
  );
  return result!;
}

/** Real material, wrapper, source templates and processing. Only the final GPU
 * effect creation is captured, so missing declarations cannot hide behind NullEngine. */
function fixture(
  kind: Kind,
  language: ShaderLanguage,
  wrapperOptions?: IIOptionShadowDepthMaterial,
) {
  const engine = new NullEngine();
  (engine as unknown as { _isWebGPU: boolean })._isWebGPU =
    language === ShaderLanguage.WGSL;
  const scene = new Scene(engine);
  const previous = [PBRBaseMaterial.ForceGLSL, StandardMaterial.ForceGLSL];
  PBRBaseMaterial.ForceGLSL = StandardMaterial.ForceGLSL = false;
  const material =
    kind === "pbr"
      ? new PBRMaterial("wind tree", scene)
      : kind === "standard"
        ? new StandardMaterial("standard caster", scene)
        : new ShaderMaterial(
            "custom wind caster",
            scene,
            {},
            { shaderLanguage: language },
          );
  [PBRBaseMaterial.ForceGLSL, StandardMaterial.ForceGLSL] = previous;
  const mesh = MeshBuilder.CreateBox("caster", {}, scene);
  mesh.material = material;
  const subMesh = mesh.subMeshes[0];
  const native = language === ShaderLanguage.WGSL;
  let source: Sources;
  if (kind === "custom") {
    source = native
      ? {
          vertexSource:
            "attribute position:vec3f;\nattribute normal:vec3f;\n@vertex\nfn main(input:VertexInputs)->FragmentInputs {\nvar worldPosition=vec4f(vertexInputs.position,1.0);\nvar vNormal=vertexInputs.normal;\n#define CUSTOM_VERTEX_UPDATE_WORLDPOS\nvertexOutputs.position=worldPosition;\n}",
          fragmentSource:
            "@fragment\nfn main(input:FragmentInputs)->FragmentOutputs {\nvar alpha:f32=0.7;\nif(alpha<0.5){discard;}\n#define CUSTOM_FRAGMENT_BEFORE_FOG\nfragmentOutputs.color=vec4f(1.0);\n}",
        }
      : {
          vertexSource:
            "void main() {\nvec4 worldPosition=vec4(0.0);\nvec3 vNormal=vec3(1.0);\n#define CUSTOM_VERTEX_UPDATE_WORLDPOS\ngl_Position=worldPosition;\n}",
          fragmentSource:
            "void main() {\nfloat alpha=0.7;\nif(alpha<0.5){discard;}\n#define CUSTOM_FRAGMENT_BEFORE_FOG\ngl_FragColor=vec4(1.0);\n}",
        };
  } else {
    const store = ShaderStore.GetShadersStore(language),
      name = kind === "pbr" ? "pbr" : "default";
    source = {
      vertexSource: expanded(store[name + "VertexShader"], language),
      fragmentSource: expanded(store[name + "PixelShader"], language),
    };
    if (kind === "pbr") {
      const wind = new TreeWindPlugin(material as PBRMaterial, {
        time: 0,
        x: 1,
        z: 2,
      });
      const code = wind.getCustomCode(
        "vertex",
        language,
      )!.CUSTOM_VERTEX_UPDATE_POSITION;
      source.vertexSource = source.vertexSource
        .replace(
          "#define CUSTOM_VERTEX_UPDATE_POSITION",
          code + "\n#define CUSTOM_VERTEX_UPDATE_POSITION",
        )
        .replace(
          "#define CUSTOM_VERTEX_DEFINITIONS",
          (native
            ? "uniform cleanTreeWind:vec3f;"
            : "uniform vec3 cleanTreeWind;") +
            "\n#define CUSTOM_VERTEX_DEFINITIONS",
        );
    }
  }
  const original = {
    shaderLanguage: language,
    isReady: () => true,
    vertexSourceCodeBeforeMigration: source.vertexSource,
    fragmentSourceCodeBeforeMigration: source.fragmentSource,
    defines: baseDefines.join("\n"),
    getUniformNames: () => ["world"],
    getAttributesNames: () => ["position", "normal"],
    getUniformBuffersNames: () => [],
    getSamplers: () => [],
    getIndexParameters: () => ({
      maxSimultaneousLights: 0,
      maxSimultaneousMorphTargets: 0,
    }),
  } as unknown as Effect;
  const wrapper = new ShadowDepthWrapper(material, scene, wrapperOptions);
  const captures: Capture[] = [];
  const originalCreate = engine.createEffect;
  engine.createEffect = ((source: Sources, options: IEffectCreationOptions) => {
    const entry = { source, options, disposals: 0 } as Capture;
    entry.effect = {
      isReady: () => true,
      dispose: () => {
        entry.disposals++;
      },
    } as unknown as Effect;
    captures.push(entry);
    return entry.effect;
  }) as typeof engine.createEffect;
  const notify = (effect = original) =>
    material.onEffectCreatedObservable.notifyObservers({ effect, subMesh });
  notify();
  return {
    engine,
    scene,
    material,
    mesh,
    subMesh,
    wrapper,
    captures,
    source,
    original,
    notify,
    generate(defines: string[], generator = {} as ShadowGenerator) {
      assert.equal(
        wrapper.isReadyForSubMesh(subMesh, defines, generator, false, 0),
        true,
      );
      return captures.at(-1)!;
    },
    dispose() {
      wrapper.dispose();
      engine.createEffect = originalCreate;
      scene.dispose();
      engine.dispose();
    },
  };
}

function nativeOutput(capture: Capture) {
  const context = new WebGPUShaderProcessingContext(ShaderLanguage.WGSL);
  const processing = options(
    ShaderLanguage.WGSL,
    capture.options.defines!.split("\n"),
  );
  processing.processor = new WebGPUShaderProcessorWGSL();
  processing.processingContext = context;
  Initialize(processing);
  let output: { vertexCode: string; fragmentCode: string } | undefined;
  Process(capture.source.vertexSource, processing, (vertex) => {
    processing.isFragment = true;
    Process(capture.source.fragmentSource, processing, (fragment) => {
      output = Finalize(vertex, fragment, processing);
    });
  });
  assert.ok(output);
  return {
    ...output,
    uniforms: context.leftOverUniforms.map(({ name }) => name),
  };
}

const remaps = {
  remappedVariables: ["worldPos", "worldPosition", "vNormalW", "vNormal"],
};
test("native normal defaults survive empty or world-only explicit remaps", () => {
  for (const remappedVariables of [[], ["worldPos", "worldPos"]]) {
    const f = fixture("standard", ShaderLanguage.WGSL, { remappedVariables });
    try {
      const result = nativeOutput(
        f.generate([
          "#define SM_FLOAT 1",
          "#define SM_USEDISTANCE 0",
          "#define SM_NORMALBIAS 1",
          "#define SM_SOFTTRANSPARENTSHADOW 0",
          "#define SM_DIRECTIONINLIGHTDATA 1",
        ]),
      );
      assert.doesNotMatch(
        result.vertexCode,
        /\bdot\(vNormalW,|worldPos\.xyz-vNormalW\*/,
      );
      assert.match(result.vertexCode, /dot\(vertexOutputs\.vNormalW,/);
    } finally {
      f.dispose();
    }
  }
});
for (const kind of ["pbr", "standard", "custom"] as const)
  for (const scenario of shadowCases)
    test(`${kind} native shadow has valid declarations for ${scenario.name}`, () => {
      const f = fixture(
        kind,
        ShaderLanguage.WGSL,
        kind === "custom" ? remaps : undefined,
      );
      try {
        const capture = f.generate([
          `#define SM_FLOAT ${scenario.float}`,
          `#define SM_USEDISTANCE ${scenario.distance}`,
          `#define SM_NORMALBIAS ${scenario.normal}`,
          `#define SM_SOFTTRANSPARENTSHADOW ${scenario.soft}`,
          "#define SM_DIRECTIONINLIGHTDATA 1",
          "#define SM_DEPTHCLAMP 0",
          "#define SM_DEPTHTEXTURE 1",
          "#define SM_ESM 0",
        ]);
        assert.equal(capture.options.shaderLanguage, ShaderLanguage.WGSL);
        const result = nativeOutput(capture);
        assert.doesNotMatch(
          result.vertexCode,
          /\bdot\(vNormalW,|worldPos\.xyz-vNormalW\*/,
        );
        assert.ok(result.uniforms.includes("biasAndScaleSM"));
        assert.ok(result.uniforms.includes("depthValuesSM"));
        if (scenario.normal || scenario.distance)
          assert.ok(result.uniforms.includes("lightDataSM"));
        if (scenario.soft) {
          assert.ok(result.uniforms.includes("softTransparentShadowSM"));
          assert.match(result.fragmentCode, /fn bayerDither8\(/);
          assert.match(result.fragmentCode, /bayerDither8\(floor/);
        }
        if (!scenario.float) {
          assert.match(result.fragmentCode, /fn pack\(/);
          assert.match(result.fragmentCode, /=pack\(depthSM\)/);
        }
        if (kind === "custom") {
          assert.match(
            result.fragmentCode.replace(/\s+/g, ""),
            /if\(alpha<0\.5\)\{discard;\}/,
          );
          if (scenario.normal) assert.match(result.vertexCode, /dot\(vNormal,/);
        }
        if (kind === "pbr") assert.match(result.vertexCode, /treeDisplacement/);
        assert.doesNotMatch(
          result.vertexCode + result.fragmentCode,
          /<!doctype|<html|\bundefined\b|uniform vec[234]|varying vec[234]/,
        );
      } finally {
        f.dispose();
      }
    });

// Generated once from unmodified pinned 9.30 with these exact source fixtures.
// The patch must preserve both GLSL injection and explicit custom remapping.
const glslDigests: Record<Kind, string> = {
  pbr: "8753dc86e3530a198e2d361ea94228738762afc5f231c58c2636ad451949b077",
  standard: "0adb4ac1602b7ebfad02c3f0e599d0e9d5c329a2cd0f84438b4155bbcf3b68d2",
  custom: "5338b89b7289f959bee2728e0424e7323c053644b92fe46e55825cc278061fe1",
};
for (const kind of ["pbr", "standard", "custom"] as const)
  test(`${kind} GLSL shadow source and bindings remain byte-identical`, () => {
    const f = fixture(
      kind,
      ShaderLanguage.GLSL,
      kind === "custom" ? remaps : undefined,
    );
    try {
      const { source, options } = f.generate([
        "#define SM_FLOAT 1",
        "#define SM_NORMALBIAS 1",
      ]);
      const digest = createHash("sha256")
        .update(
          JSON.stringify({
            source: {
              vertexSource: source.vertexSource,
              fragmentSource: source.fragmentSource,
            },
            options,
          }),
        )
        .digest("hex");
      assert.equal(digest, glslDigests[kind]);
    } finally {
      f.dispose();
    }
  });

for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL])
  test(`doNotInjectCode preserves the supplied sources in language ${language}`, () => {
    const f = fixture("custom", language, { ...remaps, doNotInjectCode: true });
    try {
      const capture = f.generate(["#define SM_FLOAT 1"]);
      assert.equal(capture.source.vertexSource, f.source.vertexSource);
      assert.equal(capture.source.fragmentSource, f.source.fragmentSource);
      assert.deepEqual(capture.options.uniformsNames, ["world"]);
    } finally {
      f.dispose();
    }
  });

test("native wrapper retains per-generator cache and releases invalidated effects once", () => {
  const f = fixture("custom", ShaderLanguage.WGSL, remaps);
  try {
    const generator = {} as ShadowGenerator;
    const first = f.generate(["#define SM_FLOAT 1"], generator);
    assert.equal(f.generate(["#define SM_FLOAT 1"], generator), first);
    assert.equal(f.captures.length, 1);
    assert.equal(
      f.wrapper.getEffect(f.subMesh, generator, 1)?.effect,
      first.effect,
    );
    f.notify({ ...f.original } as Effect);
    assert.equal(first.disposals, 1);
    const second = f.generate(["#define SM_FLOAT 1"], generator);
    assert.equal(f.captures.length, 2);
    f.mesh.dispose();
    assert.equal(second.disposals, 1);
    f.wrapper.dispose();
    f.notify({ ...f.original } as Effect);
    assert.equal(f.captures.length, 2);
    assert.equal(first.disposals, 1);
    assert.equal(second.disposals, 1);
  } finally {
    f.dispose();
  }
});
