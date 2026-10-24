import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { InternalTexture, InternalTextureSource } from "@babylonjs/core/Materials/Textures/internalTexture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { createWebGpuShadowDepthWrapper } from "../client/webgpu-shadow-readiness";
import { configureTreeMaterial } from "../client/tree-appearance";
import { TreeWindPlugin } from "../client/tree-wind";
import type { Effect } from "@babylonjs/core/Materials/effect";

test("actual cached per-pass PBR and native last-notified base preserve independent shadow ownership across the observed main notification", async context => {
  const engine = new NullEngine(), scene = new Scene(engine);
  Reflect.get(engine, "_features").supportShadowSamplers = true; // actual WebGPU capability, not NullEngine WebGL1 fallback
  engine.createDepthStencilTexture = function (this: NullEngine, size: any, options: any) {
    const texture = new InternalTexture(this, InternalTextureSource.DepthStencil);
    texture.width = texture.baseWidth = typeof size === "number" ? size : size.width;
    texture.height = texture.baseHeight = typeof size === "number" ? size : size.height;
    texture.isReady = true; texture.format = options?.depthTextureFormat ?? 14;
    return texture; // terminal allocation IO only; real ShadowGenerator retains filter/recipe/readiness
  } as typeof engine.createDepthStencilTexture;
  const camera = new FreeCamera("main", new Vector3(0, 2, -4), scene);
  scene.activeCamera = camera;
  new HemisphericLight("ambient", Vector3.Up(), scene);
  const light = new SpotLight("actual car PCF", new Vector3(0, 2, -2), new Vector3(0, -0.1, 1), 0.8, 2, scene);
  light.range = 32;
  const material = new PBRMaterial("authored leaves", scene);
  const texture = RawTexture.CreateRGBATexture(new Uint8Array([255, 255, 255, 128]), 1, 1, scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  texture.hasAlpha = true; texture.getInternalTexture()!.isReady = true; // terminal NullEngine upload completion only
  material.albedoTexture = texture;
  assert.equal(configureTreeMaterial(material), true);
  new TreeWindPlugin(material, { time: 1, x: 0, z: 1.8 });
  const mesh = CreateBox("real wind/alpha leaf recipe", {}, scene); mesh.position.z = 3;
  mesh.material = material; mesh.receiveShadows = true;
  mesh.metadata = { vegetation: "tree", windDeformed: true, depthCaster: "alpha-test" };
  // Select the production wrapper/patch while NullEngine supplies terminal GLSL
  // pipeline IO. No browser, WGSL device or rendered-pixel claim is made.
  Reflect.set(engine, "_isWebGPU", true);
  const wrapper = createWebGpuShadowDepthWrapper(material, scene);
  Reflect.set(engine, "_isWebGPU", false);
  material.shadowDepthWrapper = wrapper;
  const generator = new ShadowGenerator(256, light);
  generator.usePercentageCloserFiltering = true; generator.filteringQuality = ShadowGenerator.QUALITY_LOW;
  generator.normalBias = 0.015; generator.getShadowMap()!.renderList = [mesh];
  assert.equal(generator.filter, ShadowGenerator.FILTER_PCF);
  const shadowPass = generator.getShadowMap()!.renderPassId, mainPass = camera.renderPassId;
  const oldGet = engine.getColorWrite, oldSet = engine.setColorWrite, oldCreate = engine.createEffect;
  const masks: number[] = [];
  Reflect.set(engine, "_cacheRenderPipeline", { setWriteMask(value: number) { masks.push(value); } });
  engine.getColorWrite = WebGPUEngine.prototype.getColorWrite;
  engine.setColorWrite = WebGPUEngine.prototype.setColorWrite;
  engine.createEffect = WebGPUEngine.prototype.createEffect as typeof engine.createEffect;
  const sub = mesh.subMeshes![0];
  const map = () => Reflect.get(wrapper, "_subMeshToEffect") as Map<unknown, [Effect, number]>;
  const depth = () => wrapper.getEffect(sub, generator, shadowPass)!.effect!;
  const step = (shadow: boolean) => {
    engine.currentRenderPassId = shadow ? shadowPass : mainPass;
    engine.setColorWrite(!shadow); scene.incrementRenderId();
    return shadow ? generator.isReady(sub, false, false) : material.isReadyForSubMesh(mesh, sub, false);
  };
  const settle = async (shadow: boolean) => {
    for (let n = 0; n < 80; n++) { if (step(shadow)) return; await setImmediate(); }
    assert.fail("actual PBR/shadow Effect did not settle");
  };
  try {
    assert.notEqual(shadowPass, mainPass);
    await settle(true);
    const first = depth(), firstBase = map().get(sub)![0];
    assert.equal(map().get(sub)![1], shadowPass);
    assert.match(first.defines, /^#define DEPTHPREPASS$/m);
    assert.equal(engine.getColorWrite(), false);
    assert.equal(Reflect.get(engine, "_colorWrite"), true, "abstract cached field does not describe native WebGPU color write");
    await settle(false);
    const mainBase = map().get(sub)![0];
    assert.equal(map().get(sub)![1], mainPass);
    assert.notEqual(mainBase, firstBase); assert.equal(first.isDisposed, false, "main notification cannot release an independent shadow pass entry");
    assert.doesNotMatch(mainBase.defines, /^#define DEPTHPREPASS$/m);
    await settle(true);
    const second = depth();
    assert.equal(sub._getDrawWrapper(shadowPass)!.effect, firstBase, "native cached shadow pass retains its own prepared base");
    assert.equal(map().get(sub)![0], mainBase, "stable PBR readiness did not notify the global map again");
    assert.equal(second, first); assert.match(second.defines, /^#define DEPTHPREPASS$/m);
    assert.equal(engine.getColorWrite(), false);
    for (let n = 0; n < 3; n++) { assert.equal(step(true), true); assert.equal(depth(), second); }
    context.diagnostic(JSON.stringify({ scope: "CPU native state/Effect lifetime; terminal GLSL IO, no GPU pixels", shadowPass, mainPass,
      firstBase: firstBase.uniqueId, mainBase: mainBase.uniqueId, firstDepth: first.uniqueId, secondDepth: second.uniqueId, masks: masks.length }));
  } finally {
    wrapper.dispose(); generator.dispose();
    engine.getColorWrite = oldGet; engine.setColorWrite = oldSet; engine.createEffect = oldCreate;
    scene.dispose(); engine.dispose();
  }
});
