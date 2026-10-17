import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { Light } from "@babylonjs/core/Lights/light";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Effect } from "@babylonjs/core/Materials/effect";
import "./client/render-shaders";
import { TreeWindPlugin } from "./client/tree-wind";
import { configureTreeMaterial } from "./client/tree-appearance";
import { createWebGpuShadowDepthWrapper } from "./client/webgpu-shadow-readiness";
import { StableLightState } from "./client/stable-light-state";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const describe = (effect: Effect | undefined | null) => effect ? {
  id: effect.uniqueId, disposed: effect.isDisposed,
  refCount: (effect as any)._refCount,
  keySha256: hash((effect as any)._key ?? ""),
  definesSha256: hash(effect.defines),
  lightDefines: effect.defines.split("\n").filter(line => /^#define (LIGHT\d|POINTLIGHT\d|DIRLIGHT\d|SPOTLIGHT\d|HEMILIGHT\d)/.test(line)),
  vertexSha256: hash(effect.vertexSourceCodeBeforeMigration ?? ""),
} : null;

async function run(kind: "pbr-leaf" | "shader-control") {
  const engine = new NullEngine({ renderWidth: 64, renderHeight: 64, textureSize: 32, deterministicLockstep: false, lockstepMaxSteps: 1 });
  const scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("CPU observer", new Vector3(0, 2, -4), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  scene.activeCamera = camera;
  const mesh = MeshBuilder.CreateBox("representative leaf receiver/caster", {}, scene);
  mesh.position.y = 1;
  mesh.receiveShadows = true;
  const hemi = new HemisphericLight("ambient", Vector3.Up(), scene);
  const sun = new DirectionalLight("celestial", new Vector3(-1, -2, 1), scene);
  sun.position = new Vector3(4, 8, -4);
  const streetA = new PointLight("street A", new Vector3(1, 3, 1), scene);
  const streetB = new PointLight("street B", new Vector3(-1, 3, -1), scene);
  const torch = new SpotLight("F local torch", new Vector3(0, 2, -3), Vector3.Forward(), .72, 64, scene);
  torch.falloffType = Light.FALLOFF_STANDARD;
  torch.range = 24;
  torch.renderPriority = 10;
  torch.setEnabled(false);
  const generators = [new ShadowGenerator(32, sun), new ShadowGenerator(32, torch)];
  for (const generator of generators) {
    generator.getShadowMap()!.renderList = [mesh];
    generator.bias = .0007;
    generator.normalBias = .015;
  }
  // NullEngine.createTexture explicitly returns a ready dummy texture; unlike
  // createRawTexture, which never marks its result ready. No network/image/GPU.
  const texture = new Texture("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB5kAAAAASUVORK5CYII=", scene, false, false, Texture.NEAREST_SAMPLINGMODE);
  assert.equal(texture.isReady(), true);
  texture.hasAlpha = true;
  let material: PBRMaterial | ShaderMaterial;
  if (kind === "pbr-leaf") {
    const leaf = new PBRMaterial("proof leaves", scene);
    leaf.albedoTexture = texture;
    assert.equal(configureTreeMaterial(leaf), true);
    new TreeWindPlugin(leaf, { time: 0, x: 1, z: 0 });
    material = leaf;
  } else {
    // Control of the pinned ShaderMaterial contract, not a claim that this
    // illustrative legacy shader is still produced by current C5 vegetation.
    material = new ShaderMaterial("uniform wind control", scene, {
      vertexSource: "attribute vec3 position; attribute vec3 normal; uniform mat4 world; uniform mat4 viewProjection; uniform float windTime; varying vec3 vNormal; void main(){vec4 worldPosition=world*vec4(position+vec3(sin(windTime)*.01,0.,0.),1.);vNormal=mat3(world)*normal;gl_Position=viewProjection*worldPosition;}",
      fragmentSource: "precision highp float; varying vec3 vNormal; void main(){gl_FragColor=vec4(abs(normalize(vNormal)),1.);}",
    }, { attributes: ["position", "normal"], uniforms: ["world", "viewProjection", "windTime"], needAlphaTesting: true });
    material.setFloat("windTime", 0);
  }
  mesh.material = material;
  // Select the production WebGPU wrapper guard. Return immediately to genuine
  // NullEngine GLSL material/effect machinery: no fake WGSL compilation claim.
  (engine as any)._isWebGPU = true;
  const wrapper = createWebGpuShadowDepthWrapper(material, scene, kind === "shader-control" ? {
    remappedVariables: ["worldPos", "worldPosition", "vNormalW", "vNormal"],
  } : undefined);
  (engine as any)._isWebGPU = false;
  material.shadowDepthWrapper = wrapper;
  const stable = new StableLightState(scene);
  const sub = mesh.subMeshes![0];
  const mainPass = camera.renderPassId;
  const states: any[] = [], events: any[] = [], draws: any[] = [];
  const observedDepths = new Map<number, Effect>();
  let stage = "setup", renderCalls = 0;
  const depthEntry = (generator: ShadowGenerator) => (wrapper as any)._subMeshToDepthWrapper.mm.get(sub)?.get(generator);
  const observeDepths = () => {
    for (const generator of generators) {
      const effect = depthEntry(generator)?.mainDrawWrapper.effect as Effect | undefined;
      if (effect) observedDepths.set(effect.uniqueId, effect);
    }
  };
  const snapshot = (label: string) => {
    observeDepths();
    const state = { label, renderCalls, activeMeshes: scene.getActiveMeshes().length, torchEnabled: torch.isEnabled(), streetBEnabled: streetB.isEnabled(),
      lightTypes: mesh.lightSources.map(light => light.getClassName()),
      trackedBase: describe((wrapper as any)._subMeshToEffect.get(sub)?.[0]),
      mainBase: describe(sub._getDrawWrapper(mainPass)?.effect),
      depths: generators.map((generator, index) => {
        const entry = depthEntry(generator);
        return { generator: index === 0 ? "sun" : "torch", pass: generator.getShadowMap()!.renderPassId,
          token: entry?.token ?? null, effect: describe(entry?.mainDrawWrapper.effect) };
      }),
      savedDepths: [...observedDepths.values()].map(describe),
    };
    states.push(state); return state;
  };
  const observer = material.onEffectCreatedObservable.add(({ effect, subMesh }) => {
    if (subMesh !== sub) return;
    events.push({ stage, pass: engine.currentRenderPassId, base: describe(effect),
      previousDepths: [...observedDepths.values()].map(describe) });
  });
  const drawn = mesh.onAfterRenderObservable.add(() => {
    draws.push({ stage, pass: engine.currentRenderPassId, effectId: sub.effect?.uniqueId });
  });
  const setF = (enabled: boolean) => {
    torch.setEnabled(enabled); streetB.setEnabled(!enabled); stable.update();
  };
  const settle = async (fn: () => boolean, label: string) => {
    for (let iteration = 0; iteration < 50; iteration++) {
      scene.incrementRenderId();
      if (fn()) return;
      await setImmediate();
    }
    throw Error(`Readiness did not settle: ${label}`);
  };
  const prepare = async () => {
    engine.currentRenderPassId = mainPass;
    await settle(() => material.isReadyForSubMesh(mesh, sub, false), `${stage}/main`);
    for (const generator of generators) {
      engine.currentRenderPassId = generator.getShadowMap()!.renderPassId;
      await settle(() => generator.isReady(sub, false, false), `${stage}/shadow`);
      observeDepths();
    }
    engine.currentRenderPassId = mainPass;
  };
  const render = () => { engine.currentRenderPassId = mainPass; scene.render(); renderCalls++; };
  let result: any;
  try {
    stage = "initial-off"; setF(false); await prepare(); render(); snapshot(stage);
    stage = "on-preparation"; setF(true); await prepare();
    const prepared = snapshot(stage);
    if (kind === "pbr-leaf") {
      assert.equal(material.needAlphaTestingForMesh(mesh), true);
      assert.match(sub._getDrawWrapper(mainPass)!.effect!.vertexSourceCodeBeforeMigration, /cleanTreeWind/);
      assert.equal(wrapper.doNotInjectCode, false);
    }
    const preparedRefs = generators.map(generator => depthEntry(generator).mainDrawWrapper.effect as Effect);
    stage = "return-off-before-render"; setF(false); snapshot(stage);
    assert.ok(preparedRefs.every(effect => !effect.isDisposed), "enabling/disabling alone has not disposed the prepared effects");
    stage = "off-render"; render();
    const afterOffRender = snapshot(stage);
    assert.ok(draws.some(draw => draw.stage === "off-render" && draw.pass === mainPass), "the actual OFF main draw ran");
    const immediateDisposal = preparedRefs.map(describe);
    assert.ok(immediateDisposal.every(effect => effect?.disposed === (kind === "pbr-leaf")), "the OFF draw is the observed disposal boundary");
    stage = "off-settled-render"; await prepare(); render(); snapshot(stage);
    stage = "on-again"; setF(true); await prepare();
    const repeated = snapshot(stage);
    const comparison = {
      mainBaseSameOnReturn: prepared.mainBase?.id === repeated.mainBase?.id,
      preparedDepthsImmediatelyAfterOffRender: immediateDisposal,
      offRenderDepthIdentities: afterOffRender.depths.map((entry: any) => entry.effect?.id ?? null),
      onDepthIdsBefore: prepared.depths.map((entry: any) => entry.effect?.id ?? null),
      onDepthIdsAfter: repeated.depths.map((entry: any) => entry.effect?.id ?? null),
      onTokensBefore: prepared.depths.map((entry: any) => entry.token),
      onTokensAfter: repeated.depths.map((entry: any) => entry.token),
    };
    if (kind === "pbr-leaf") {
      assert.notEqual(states[0].mainBase.id, prepared.mainBase.id);
      assert.ok(prepared.mainBase.lightDefines.some((line: string) => line.includes("SPOTLIGHT")));
      assert.deepEqual(comparison.onTokensBefore.map((token: string, i: number) => token === comparison.onTokensAfter[i]), [false, false]);
      assert.ok(preparedRefs.every(effect => effect.isDisposed), "prepared PBR depth variants were disposed by return to OFF");
    } else {
      assert.equal(states[0].mainBase.id, prepared.mainBase.id);
      assert.deepEqual(comparison.onDepthIdsBefore, comparison.onDepthIdsAfter);
      assert.deepEqual(comparison.onTokensBefore, comparison.onTokensAfter);
      assert.ok(preparedRefs.every(effect => !effect.isDisposed));
    }
    result = { kind, wrapperClass: wrapper.constructor.name, mainPass, states, events, draws, comparison,
      limitations: "Actual NullEngine GLSL Effects/materials/wrappers/Scene.render and shadow generators. Representative mesh, NullEngine ready dummy texture; no real world asset, WGSL compiler, GPU, pipeline descriptors or timing proof." };
  } catch (error) {
    writeFileSync(`case-${kind}-failed.json`, JSON.stringify({ kind, stage, mainPass, states, events, draws, error: String(error) }, null, 2) + "\n");
    throw error;
  } finally {
    material.onEffectCreatedObservable.remove(observer);
    mesh.onAfterRenderObservable.remove(drawn);
    stable.dispose(); wrapper.dispose(); scene.dispose(); engine.dispose();
  }
  return result;
}

const startedAt = new Date().toISOString(), start = performance.now(), cpu = process.cpuUsage();
const results = [];
try {
  for (const kind of ["pbr-leaf", "shader-control"] as const) results.push(await run(kind));
  const report = { startedAt, endedAt: new Date().toISOString(), wallMs: performance.now() - start,
    cpu: process.cpuUsage(cpu), results, passed: true };
  writeFileSync("report.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ startedAt, endedAt: report.endedAt, wallMs: report.wallMs, cpu: report.cpu,
    results: results.map(({ kind, wrapperClass, comparison }) => ({ kind, wrapperClass, comparison })), passed: true }, null, 2));
} catch (error) {
  writeFileSync("report-failed.json", JSON.stringify({ startedAt, endedAt: new Date().toISOString(), results, error: String(error) }, null, 2) + "\n");
  throw error;
}
