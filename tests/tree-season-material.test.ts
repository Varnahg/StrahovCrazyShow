import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { TreeSeasonMaterialPlugin, setTreeSeasonMaterialState } from "../client/tree-season-material";
import { getTreeSeasonState } from "../shared/tree-season";
import { createWebGpuShadowDepthWrapper } from "../client/webgpu-shadow-readiness";
import "../client/render-shaders";

class ProcessingEngine extends NullEngine {
  programs = 0;
  constructor() { super(); this._webGLVersion = 2; this._shaderPlatformName = "WEBGL2"; this.getCaps().standardDerivatives = true; }
  override createShaderProgram(...args: Parameters<NullEngine["createShaderProgram"]>) { this.programs++; return super.createShaderProgram(...args); }
}

test("real PBR effect carries raw rank while vertex/material alpha remain opaque and photographic maps stay owned", async () => {
  const engine = new ProcessingEngine(), scene = new Scene(engine);
  new FreeCamera("fixed season material camera", new Vector3(0, 1, -3), scene);
  const mesh = MeshBuilder.CreateBox("ranked leaves", {}, scene), material = new PBRMaterial("source foliage", scene);
  const albedo = new Texture("/fixture/leaf-color-alpha.png", scene), normal = new Texture("/fixture/leaf-normal.png", scene), roughness = new Texture("/fixture/leaf-arm.png", scene);
  albedo.hasAlpha = true; material.albedoTexture = albedo; material.bumpTexture = normal; material.metallicTexture = roughness;
  material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST; material.alphaCutOff = .5;
  mesh.material = material;
  const colors = new Uint16Array(mesh.getTotalVertices() * 4).fill(65535);
  for (let vertex = 0; vertex < mesh.getTotalVertices(); vertex++) colors[vertex * 4 + 3] = vertex < 12 ? 1 : 65534;
  const source = colors.slice();
  mesh.setVerticesBuffer(new VertexBuffer(engine, colors, VertexBuffer.ColorKind, { stride: 4, size: 4, type: VertexBuffer.UNSIGNED_SHORT, normalized: true }));
  const plugin = new TreeSeasonMaterialPlugin(material), autumn = getTreeSeasonState(Date.UTC(2026, 9, 25));
  setTreeSeasonMaterialState(mesh, "deciduous-broadleaf", autumn.groups["deciduous-broadleaf"]);
  try {
    const sub = mesh.subMeshes[0];
    for (let i = 0; i < 60 && !material.isReadyForSubMesh(mesh, sub, false); i++) await turn();
    assert.ok(sub.effect?.isReady());
    const defines = sub.materialDefines!.toString(), effect = sub.effect!, programs = engine.programs;
    assert.match(defines, /^#define VERTEXCOLOR$/m); assert.doesNotMatch(defines, /^#define VERTEXALPHA$/m);
    assert.match(defines, /^#define ALPHATEST$/m); assert.doesNotMatch(defines, /^#define ALPHABLEND$/m);
    assert.match(effect.vertexSourceCode, /vTreeSeasonRanks*=s*color.a/);
    // WebGL delegates #if evaluation to the driver, so the saved GLSL still
    // contains inactive opacity code. Prove its guard AND actual owner flags,
    // rather than pretending NullEngine removed that text or compiled on GPU.
    assert.ok(effect.fragmentSourceCode.includes("#if defined(VERTEXALPHA) || defined(INSTANCESCOLOR) && defined(INSTANCES)\nalpha*=vColor.a;\n#endif"));
    assert.doesNotMatch(defines, /^#define (INSTANCESCOLOR|INSTANCES)$/m);
    assert.equal(material.needAlphaBlendingForMesh(mesh), false); assert.equal(material.needAlphaTestingForMesh(mesh), true);
    const normalized = mesh.getVerticesData(VertexBuffer.ColorKind)!;
    assert.ok(Math.abs(normalized[3] - 1 / 65535) < 1e-8);
    assert.ok(Math.abs(normalized[normalized.length - 1] - 65534 / 65535) < 1e-7);
    assert.match(effect.fragmentSourceCode, /treeLuma=dot\(surfaceAlbedo/);
    assert.match(effect.fragmentSourceCode, /surfaceAlbedo=mix\(surfaceAlbedo,treeWarm/);
    assert.equal(material.alpha, 1); assert.equal(mesh.hasVertexAlpha, false);
    assert.deepEqual(colors, source); assert.equal(material.albedoTexture, albedo); assert.equal(material.bumpTexture, normal); assert.equal(material.metallicTexture, roughness);
    material.freeze();
    const winter = getTreeSeasonState(Date.UTC(2027, 0, 15));
    setTreeSeasonMaterialState(mesh, "evergreen-conifer", winter.groups["evergreen-conifer"]);
    assert.ok(material.isReadyForSubMesh(mesh, sub, false)); assert.equal(sub.effect, effect); assert.equal(engine.programs, programs);
    const writes: unknown[][] = [], ubo = { updateFloat3: (...args: unknown[]) => writes.push(args) } as unknown as UniformBuffer;
    plugin.hardBindForSubMesh(ubo, scene, engine, sub);
    assert.deepEqual(writes[0], ["treeSeason", winter.groups["evergreen-conifer"].maturity, winter.groups["evergreen-conifer"].senescence, 0]);
    mesh.metadata.treeSeason = undefined; plugin.hardBindForSubMesh(ubo, scene, engine, sub);
    assert.deepEqual(writes[1], ["treeSeason", 1, 0, 0]);
  } finally { scene.dispose(); engine.dispose(); }
});

test("shared season material binds each clone independently and both native languages keep the same UBO", () => {
  const engine = new NullEngine(), scene = new Scene(engine), material = new PBRMaterial("shared", scene);
  const a = MeshBuilder.CreateBox("deciduous", {}, scene);
  a.material = material; const plugin = new TreeSeasonMaterialPlugin(material);
  const phenology = { leafAmount: .5, maturity: .8, senescence: .9, litterPotential: .5 };
  a.metadata = { sourceId: "shared-prototype" };
  setTreeSeasonMaterialState(a, "deciduous-conifer", phenology);
  const b = a.clone("evergreen")!; assert.equal(a.metadata, b.metadata, "fixture exercises Babylon's actual shared metadata");
  setTreeSeasonMaterialState(b, "evergreen-conifer", phenology);
  assert.notEqual(a.metadata, b.metadata); assert.equal(b.metadata.sourceId, "shared-prototype");
  const aState = a.metadata.treeSeason, bState = b.metadata.treeSeason;
  const writes: unknown[][] = [], ubo = { updateFloat3: (...args: unknown[]) => writes.push(args) } as unknown as UniformBuffer;
  try {
    plugin.hardBindForSubMesh(ubo, scene, engine, a.subMeshes[0]); plugin.hardBindForSubMesh(ubo, scene, engine, b.subMeshes[0]);
    assert.deepEqual(writes, [["treeSeason", .8, .9, 1], ["treeSeason", .8, .9, 0]]);
    setTreeSeasonMaterialState(a, "deciduous-conifer", { ...phenology, senescence: 0 });
    assert.equal(a.metadata.treeSeason, aState); assert.equal(b.metadata.treeSeason, bState); assert.notEqual(aState, bState);
    assert.deepEqual(plugin.getUniforms(ShaderLanguage.WGSL).ubo, plugin.getUniforms(ShaderLanguage.GLSL).ubo);
    assert.equal(plugin.getUniforms(ShaderLanguage.WGSL).fragment, undefined);
    assert.equal(plugin.getClassName(), "TreeSeasonMaterialPlugin");
  } finally { scene.dispose(); engine.dispose(); }
});

test("pilot transmission uses current albedo once through actual PBR and shadow effects while legacy keeps its source tint", async () => {
  const engine = new ProcessingEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("fixed transmission view", new Vector3(0, 1, -4), scene); camera.setTarget(Vector3.Zero());
  const light = new DirectionalLight("transmission sun", new Vector3(0, -1, 1), scene);
  const shadow = new ShadowGenerator(64, light), pass = shadow.getShadowMap()!.renderPassId;
  const source = RawTexture.CreateRGBATexture(new Uint8Array([24, 180, 60, 255]), 1, 1, scene); source.hasAlpha = true;
  // NullEngine.createRawTexture retains bytes but has no upload completion.
  // Only this texture IO boundary is adapted; PBR/depth effects are real.
  source.getInternalTexture()!.isReady = true;
  const owners = [false, true].map(tintDirectTranslucency => {
    const mesh = MeshBuilder.CreateBox(tintDirectTranslucency ? "pilot" : "legacy", {}, scene);
    const material = new PBRMaterial(mesh.name, scene); mesh.material = material;
    material.albedoTexture = source; material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHATEST;
    material.alphaCutOff = .5; material.maxSimultaneousLights = 1; material.backFaceCulling = false;
    material.subSurface.isTranslucencyEnabled = true; material.subSurface.translucencyIntensity = .12;
    material.subSurface.translucencyColorTexture = tintDirectTranslucency ? null : source;
    material.subSurface.useAlbedoToTintTranslucency = tintDirectTranslucency;
    const colors = new Float32Array(mesh.getTotalVertices() * 4).fill(1);
    for (let i = 3; i < colors.length; i += 4) colors[i] = 32768 / 65535;
    mesh.setVerticesData(VertexBuffer.ColorKind, colors);
    setTreeSeasonMaterialState(mesh, "deciduous-broadleaf", getTreeSeasonState(Date.UTC(2026, 9, 25)).groups["deciduous-broadleaf"]);
    const plugin = new TreeSeasonMaterialPlugin(material, { tintDirectTranslucency });
    const wrapper = createWebGpuShadowDepthWrapper(material, scene); material.shadowDepthWrapper = wrapper;
    shadow.addShadowCaster(mesh);
    return { mesh, material, plugin, wrapper, tintDirectTranslucency };
  });
  try {
    for (let i = 0; i < 20; i++) {
      for (const { material, mesh } of owners) material.isReadyForSubMesh(mesh, mesh.subMeshes[0], false);
      scene.render(); await turn();
    }
    for (const { mesh, material, wrapper, tintDirectTranslucency } of owners) {
      const sub = mesh.subMeshes[0], effect = sub.effect!;
      assert.ok(effect?.isReady(), JSON.stringify({ owner: mesh.name, textureReady: source.isReady() }));
      const defines = sub.materialDefines!.toString(), fragment = effect.fragmentSourceCode;
      assert.match(defines, /^#define SS_TRANSLUCENCY$/m);
      assert.equal(/^#define STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT$/m.test(defines), tintDirectTranslucency);
      assert.equal(/^#define SS_TRANSLUCENCYCOLOR_TEXTURE$/m.test(defines), !tintDirectTranslucency);
      // GLSL retains both preprocessor branches for the driver. This exact pair
      // proves the pinned regex matched the actual expanded PBR light include.
      const branch = /#ifdef STRAHOV_TREE_DIRECT_TRANSLUCENCY_TINT\s+diffuseTransmissionBase\s*\+=\s*info\.diffuseTransmission\s*\*\s*surfaceAlbedo\s*\*\s*shadow;\s*#else\s+diffuseTransmissionBase\s*\+=\s*info\.diffuseTransmission\s*\*\s*shadow;\s*#endif/g;
      assert.equal([...fragment.matchAll(branch)].length, 1, "one actual light slot receives the guarded substitution");
      assert.match(fragment, /finalDiffuse\s*\*=\s*surfaceAlbedo;[\s\S]*finalDiffuse\s*\+=\s*diffuseTransmissionBase;/);
      assert.match(fragment, /#ifdef SS_ALBEDOFORTRANSLUCENCYTINT\s+refractionIrradiance\.rgb\s*\*=\s*surfaceAlbedo\.rgb;/);
      assert.equal(material.needAlphaBlendingForMesh(mesh), false); assert.equal(material.needAlphaTestingForMesh(mesh), true);
      assert.equal(mesh.hasVertexAlpha, false); assert.equal(material.alpha, 1);
      const depth = wrapper.getEffect(sub, shadow, pass)?.effect;
      assert.ok(depth, "actual derived depth effect exists");
      assert.ok(depth.isReady(), "actual derived depth effect is ready");
      assert.match(depth.fragmentSourceCode, /if\s*\(alpha\s*<\s*ALPHATESTVALUE\)\s*discard;/);
      assert.doesNotMatch(depth.defines, /^#define VERTEXALPHA$/m);
      assert.equal(material.albedoTexture, source);
      material.freeze(); const programs = engine.programs;
      setTreeSeasonMaterialState(mesh, "deciduous-broadleaf", getTreeSeasonState(Date.UTC(2027, 6, 15)).groups["deciduous-broadleaf"]);
      assert.ok(material.isReadyForSubMesh(mesh, sub, false)); assert.equal(sub.effect, effect); assert.equal(engine.programs, programs);
    }
    for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
      assert.deepEqual(owners[0].plugin.getCustomCode("fragment", language), owners[1].plugin.getCustomCode("fragment", language));
      assert.deepEqual(owners[0].plugin.getUniforms(language), owners[1].plugin.getUniforms(language));
    }
  } finally { for (const owner of owners) owner.wrapper.dispose(); scene.dispose(); engine.dispose(); }
});
