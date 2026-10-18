import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration";
import { ImageProcessingConfigurationDefines } from "@babylonjs/core/Materials/imageProcessingConfiguration.defines";
import { ThinImageProcessingPostProcess } from "@babylonjs/core/PostProcesses/thinImageProcessingPostProcess";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { WebGPUShaderProcessorWGSL } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL";
import { WebGPUShaderProcessingContext } from "@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext";
import "../client/render-shaders";

const CHILDREN = ["VIGNETTEBLENDMODEMULTIPLY", "VIGNETTEBLENDMODEOPAQUE", "SAMPLER3DGREENDEPTH", "SAMPLER3DBGRMAP"] as const;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));
const publicValues = (value: object) => Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith("_")));

test("inactive configuration and postprocess mismatch lose history and reactivate both vignette modes and LUT channels", () => {
  const engine = new NullEngine(), scene = new Scene(engine);
  const texture = new RawTexture(new Uint8Array(64), 4, 4, 5, scene, false, false);
  let count = 0;
  try {
    for (const post of [false, true]) for (const apply of [false, true])
      for (const enabled of [false, true]) for (const mode of [0, 1])
        for (const green of [false, true]) for (const bgr of [false, true]) {
          const config = new ImageProcessingConfiguration();
          config.vignetteEnabled = true; config.vignetteBlendMode = mode;
          config.colorGradingEnabled = true; config.colorGradingTexture = texture;
          config.colorGradingWithGreenDepth = green; config.colorGradingBGR = bgr;
          config.applyByPostProcess = post; config.isEnabled = true;
          const warm = new ImageProcessingConfigurationDefines();
          config.prepareDefines(warm, post);
          const active = publicValues(warm);
          assert.equal(warm.VIGNETTEBLENDMODEMULTIPLY, mode === 0);
          assert.equal(warm.VIGNETTEBLENDMODEOPAQUE, mode !== 0);
          assert.equal(warm.SAMPLER3DGREENDEPTH, green);
          assert.equal(warm.SAMPLER3DBGRMAP, bgr);
          config.applyByPostProcess = apply; config.isEnabled = enabled;
          const fresh = new ImageProcessingConfigurationDefines();
          config.prepareDefines(fresh, post); config.prepareDefines(warm, post);
          assert.deepEqual(publicValues(warm), publicValues(fresh), "identical final configuration must not depend on prior active processing");
          if (post !== apply || !enabled) {
            for (const name of CHILDREN) assert.equal(warm[name], false, name);
            assert.equal(warm.VIGNETTE, false); assert.equal(warm.COLORGRADING, false); assert.equal(warm.IMAGEPROCESSING, false);
          } else assert.deepEqual(publicValues(warm), active);
          config.applyByPostProcess = post; config.isEnabled = true;
          config.prepareDefines(warm, post); assert.deepEqual(publicValues(warm), active);
          count++;
        }
  } finally { texture.dispose(); scene.dispose(); engine.dispose(); }
  assert.equal(count, 64);
});

/** Real material recipes, includes and processor layout. Only pipeline/texture
 * IO stays NullEngine; this is not hardware WGSL or pixel validation. */
class ProcessingEngine extends NullEngine {
  readonly sources = new Map<unknown, { vertex: string; fragment: string }>();
  readonly prefixes = new Map<unknown, string[]>();
  constructor(native: boolean) {
    super(); this._isWebGPU = native; this._webGLVersion = 2;
    this._shaderPlatformName = native ? "WEBGPU" : "WEBGL2";
    this.getCaps().standardDerivatives = true; this.getCaps().textureLOD = true;
  }
  override _getShaderProcessor(language: ShaderLanguage) {
    if (!this.isWebGPU) return super._getShaderProcessor(language);
    const processor: any = new WebGPUShaderProcessorWGSL(), convert = processor._convertDefinesToConst, prefixes = this.prefixes;
    processor._convertDefinesToConst = function (...args: unknown[]) {
      const result = Reflect.apply(convert, this, args), context = this._webgpuProcessingContext;
      assert.ok(typeof result === "string");
      const list = prefixes.get(context) ?? []; list.push(result); prefixes.set(context, list); return result;
    };
    return processor;
  }
  override _getShaderProcessingContext(language: ShaderLanguage) {
    return this.isWebGPU ? new WebGPUShaderProcessingContext(language) : super._getShaderProcessingContext(language);
  }
  override createShaderProgram(...args: Parameters<NullEngine["createShaderProgram"]>) {
    this.sources.set(args[0], { vertex: args[1], fragment: args[2] });
    return super.createShaderProgram(...args);
  }
}
function stripGenerated(source: string, prefix?: string) {
  if (!prefix) return source;
  const at = source.indexOf(prefix); assert.ok(at >= 0); assert.equal(source.indexOf(prefix, at + prefix.length), -1);
  return source.slice(0, at) + source.slice(at + prefix.length);
}
function capture(engine: ProcessingEngine, effect: any, material?: any) {
  assert.ok(effect?.isReady()); const source = engine.sources.get(effect.getPipelineContext())!; assert.ok(source);
  const prefixes = engine.prefixes.get(effect._processingContext) ?? []; if (engine.isWebGPU) assert.equal(prefixes.length, 2);
  return {
    defines: effect.defines,
    body: { vertex: stripGenerated(source.vertex, prefixes[0]), fragment: stripGenerated(source.fragment, prefixes[1]) },
    layout: {
      processing: json(effect._processingContext), attributes: effect.getAttributesNames(), uniforms: effect.getUniformNames(),
      samplers: effect.getSamplers(), uniformBuffers: json(effect._uniformBuffersNames),
      materialLocations: material ? json(material._uniformBuffer._uniformLocations) : null,
      materialSizes: material ? json(material._uniformBuffer._uniformSizes) : null,
    },
  };
}
async function untilReady(action: () => void, ready: () => boolean) {
  const deadline = performance.now() + 4000;
  do { action(); await turn(); } while (!ready() && performance.now() < deadline);
  assert.equal(ready(), true);
}

for (const native of [false, true]) for (const kind of ["standard", "pbr"] as const)
  test(`${native ? "WGSL" : "GLSL"} ${kind}: fresh inactive submesh reuses the preloaded receiver's Effect and layout`, async () => {
    const engine = new ProcessingEngine(native), scene = new Scene(engine);
    new FreeCamera("camera", new Vector3(0, 0, -5), scene); new HemisphericLight("sky", Vector3.Up(), scene);
    const material = kind === "standard" ? new StandardMaterial("actual Standard", scene) : new PBRMaterial("actual PBR", scene);
    const warm = MeshBuilder.CreateBox("preloaded", {}, scene); warm.material = material;
    const cold = warm.clone("fresh", null, true)!; cold.setEnabled(false);
    const drawn = new Set<string>(); for (const mesh of [warm, cold]) mesh.onAfterRenderObservable.add(() => drawn.add(mesh.name));
    const draw = (mesh: typeof warm) => untilReady(() => { drawn.clear(); engine.beginFrame(); scene.render(); engine.endFrame(); }, () => drawn.has(mesh.name) && !!mesh.subMeshes[0].effect?.isReady());
    try {
      await draw(warm); assert.match(capture(engine, warm.subMeshes[0].effect, material).defines, /^#define VIGNETTEBLENDMODEMULTIPLY$/m);
      scene.imageProcessingConfiguration.isEnabled = false; await draw(warm);
      const oldEffect = warm.subMeshes[0].effect!, old = capture(engine, oldEffect, material), before = engine.sources.size;
      warm.setEnabled(false); cold.setEnabled(true); await draw(cold);
      const freshEffect = cold.subMeshes[0].effect!, fresh = capture(engine, freshEffect, material);
      assert.deepEqual(old.body, fresh.body); assert.deepEqual(old.layout, fresh.layout);
      assert.equal(engine.sources.size - before, 0, "no new program for identical inactive processing");
      assert.equal(freshEffect, oldEffect); assert.equal(freshEffect.getPipelineContext(), oldEffect.getPipelineContext());
      assert.equal(fresh.defines, old.defines);
    } finally { scene.dispose(); engine.dispose(); }
  });

for (const native of [false, true])
  test(`${native ? "WGSL" : "GLSL"} postprocess retains active modes, LUT orientation and disabled FROMLINEARSPACE gamma`, async () => {
    const engine = new ProcessingEngine(native), scene = new Scene(engine), config = new ImageProcessingConfiguration();
    const texture = new RawTexture(new Uint8Array(64), 4, 4, 5, scene, false, false);
    config.colorGradingEnabled = true; config.colorGradingTexture = texture; config.vignetteEnabled = true;
    const process = new ThinImageProcessingPostProcess("actual IP", engine, { imageProcessingConfiguration: config, shaderLanguage: native ? ShaderLanguage.WGSL : ShaderLanguage.GLSL });
    let fresh: ThinImageProcessingPostProcess | undefined;
    const snapshot = async (wrapper = process) => { await untilReady(() => {}, () => wrapper.isReady()); return capture(engine, wrapper.effect); };
    try {
      let active: ReturnType<typeof capture> | undefined;
      for (const mode of [0, 1]) for (const green of [false, true]) for (const bgr of [false, true]) {
        config.vignetteBlendMode = mode; config.colorGradingWithGreenDepth = green; config.colorGradingBGR = bgr;
        active = await snapshot(); assert.match(active.defines, /#define VIGNETTE;/); assert.match(active.defines, /#define COLORGRADING;/);
        assert.equal(active.defines.includes("#define VIGNETTEBLENDMODEMULTIPLY;"), mode === 0);
        assert.equal(active.defines.includes("#define VIGNETTEBLENDMODEOPAQUE;"), mode !== 0);
        assert.equal(active.defines.includes("#define SAMPLER3DGREENDEPTH;"), green);
        assert.equal(active.defines.includes("#define SAMPLER3DBGRMAP;"), bgr);
      }
      config.isEnabled = false; const disabled = await snapshot();
      assert.match(disabled.defines, /FROMLINEARSPACE/); assert.doesNotMatch(disabled.defines, /#define IMAGEPROCESSING;/);
      assert.match(disabled.body.fragment, /applyImageProcessing/); assert.match(disabled.body.fragment, /toGammaSpace|pow/);
      const freshConfig = new ImageProcessingConfiguration(); freshConfig.isEnabled = false;
      fresh = new ThinImageProcessingPostProcess("fresh inactive IP", engine, { imageProcessingConfiguration: freshConfig, shaderLanguage: native ? ShaderLanguage.WGSL : ShaderLanguage.GLSL });
      assert.deepEqual(await snapshot(fresh), disabled, "inactive postprocess must not retain prior vignette/LUT mode flags");
      config.isEnabled = true; assert.deepEqual(await snapshot(), active, "reactivation restores exact source and bindings");
    } finally { fresh?.dispose(); process.dispose(); texture.dispose(); scene.dispose(); engine.dispose(); }
  });
