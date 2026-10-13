import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import {
  CinematicAtmosphere,
  applyWindowSkyReflection,
  solarShadowsEnabled,
  skyReflectionData,
  snappedShadowFocus,
  shadowCasterKind,
} from "../client/cinematic";
import { SurfacePack, surfaceTexturePlan } from "../client/surface-pack";

test("PBR channel scales retain metres, rectangular concrete and authored paving joints", () => {
  const asphalt = surfaceTexturePlan({
    surfaceKind: "asphalt",
    uvMetresPerRepeat: 4,
  })!;
  assert.equal(asphalt.uScale, 4 / 2.5);
  assert.equal(asphalt.vScale, 4 / 2.5);
  const grass = surfaceTexturePlan({
    surfaceKind: "grass",
    uvMetresPerRepeat: 5,
  })!;
  assert.equal(grass.family.id, "Grass001");
  assert.equal(grass.uScale, 5 / 1.4);
  assert.equal(grass.vScale, 5 / 1.4);
  const pavement = surfaceTexturePlan({
    surfaceKind: "concrete",
    surface: "paving",
    uvMetresPerRepeat: 4,
  })!;
  assert.equal(pavement.retainPavingJoints, false);
  assert.equal(pavement.family.id, "PavingStones112");
  assert.equal(pavement.uScale, 4 / 2.4);
  assert.equal(pavement.vScale, 4 / 2.4);
  const concrete = surfaceTexturePlan({
    surfaceKind: "concrete",
    uvMetresPerRepeat: 4,
  })!;
  assert.equal(concrete.vScale, 4 / 0.55);
  assert.equal(
    surfaceTexturePlan({ surfaceKind: "sett", uvMetresPerRepeat: 4 })!.family
      .id,
    "PavingStones036",
  );
  assert.equal(
    surfaceTexturePlan({ surfaceKind: "plaster", nightWindows: true }),
    null,
  );
  assert.equal(
    surfaceTexturePlan({ surfaceKind: "plaster", containsWindows: true }),
    null,
  );
});

test("real material conversion preserves tint/joints and never treats grayscale roughness as metal", () => {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  const source = new StandardMaterial("paving", scene);
  source.metadata = {
    surfaceKind: "concrete",
    surface: "paving",
    uvMetresPerRepeat: 4,
    preserveAuthoredPavingJoints: true,
  };
  source.diffuseColor.set(0.6, 0.55, 0.5);
  source.diffuseTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([220, 220, 215, 255]),
    1,
    1,
    scene,
  );
  const mesh = MeshBuilder.CreateBox("pavement", {}, scene);
  const multi = new MultiMaterial("shared paved surfaces", scene);
  multi.subMaterials = [source];
  mesh.material = multi;
  const pack = new SurfacePack(scene);
  pack.update(0, "high", 0);
  const pbr = multi.subMaterials[0] as PBRMaterial;
  assert.ok(pbr instanceof PBRMaterial);
  assert.equal(pbr.albedoTexture, source.diffuseTexture);
  assert.ok(pbr.albedoColor.equals(source.diffuseColor));
  assert.equal(pbr.bumpTexture!.gammaSpace, false);
  assert.equal(pbr.metallicTexture!.gammaSpace, false);
  assert.equal(pbr.useRoughnessFromMetallicTextureGreen, true);
  assert.equal(pbr.useMetallnessFromMetallicTextureBlue, false);
  assert.equal(pbr.useAmbientOcclusionFromMetallicTextureRed, false);
  assert.equal(pbr.metallic, 0);
  pack.dispose();
  assert.equal(multi.subMaterials[0], source);
  assert.equal(source.name, "paving");
  scene.dispose();
  engine.dispose();
});

test("paved and stone surfaces use matching real channels and return to their dry tint after rain", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  const meshes = ["paving", "sett", "gravel"].map((kind) => {
    const mesh = MeshBuilder.CreateBox(kind, {}, scene),
      material = new StandardMaterial(kind, scene);
    material.metadata = { surfaceKind: kind, uvMetresPerRepeat: 4 };
    mesh.material = material;
    return mesh;
  });
  const pack = new SurfacePack(scene);
  pack.update(1, "high", 0);
  const expected = ["PavingStones112", "PavingStones036", "Gravel012"];
  const dry = meshes.map((mesh) =>
    (mesh.material as PBRMaterial).albedoColor.clone(),
  );
  meshes.forEach((mesh, index) => {
    const material = mesh.material as PBRMaterial;
    assert.equal(material.metadata.materialFamily, expected[index]);
    for (const texture of [
      material.albedoTexture,
      material.bumpTexture,
      material.metallicTexture,
    ])
      assert.ok(texture?.name?.includes(expected[index]));
    assert.equal(material.metadata.authoredPavingJoints, false);
  });
  pack.update(0.1, "high", 2);
  meshes.forEach((mesh) =>
    assert.ok(((mesh.material as PBRMaterial).roughness??0) >= 0.75),
  );
  pack.update(0.1, "high", 0);
  meshes.forEach((mesh, index) =>
    assert.ok((mesh.material as PBRMaterial).albedoColor.equals(dry[index])),
  );
  pack.dispose();
  scene.dispose();
  engine.dispose();
});

test("sky cubemap stores linear colours once and matches each hemisphere", () => {
  const top = new Color3(0.5, 0.5, 0.5),
    horizon = new Color3(0.8, 0.8, 0.8);
  const data = skyReflectionData(top, horizon, 32);
  assert.equal(data.faces.length, 6);
  const middle = (16 * 32 + 16) * 4;
  assert.ok(
    Math.abs(data.faces[2][middle] / 255 - top.toLinearSpace().r) < 0.01,
  );
  assert.ok(data.faces[3][middle] < data.faces[2][middle]);
  for (const face of data.faces) assert.equal(face.length, 32 * 32 * 4);
  assert.ok(data.polynomial.xx.length() > 0);
  const night = skyReflectionData(
    new Color3(0.08, 0.12, 0.2),
    new Color3(0.2, 0.25, 0.3),
  );
  assert.ok(night.faces[2][middle] < data.faces[2][middle] / 5);
});

test("shadow projection is stable for sub-texel motion including the solar zenith", () => {
  const a = snappedShadowFocus(
    { x: 0, y: 0, z: 0 },
    { x: 0, y: -1, z: 0 },
    512,
  );
  const b = snappedShadowFocus(
    { x: 0.01, y: 0, z: 0.01 },
    { x: 0, y: -1, z: 0 },
    512,
  );
  assert.ok(a.focus.equalsWithEpsilon(b.focus, 1e-8));
  for (const direction of [
    Vector3.Down(),
    new Vector3(0.2, -0.5, 0.4),
    Vector3.Zero(),
  ]) {
    const value = snappedShadowFocus({ x: 19, y: 4, z: -17 }, direction, 1024);
    assert.ok(Number.isFinite(value.focus.length()));
    assert.ok(Math.abs(value.direction.length() - 1) < 1e-9);
  }
});

test("shadow metadata rejects ground, transparent glass and arbitrary custom sky shaders", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const box = MeshBuilder.CreateBox(
    "cloud-shaped physical building",
    {},
    scene,
  );
  box.material = new StandardMaterial("solid", scene);
  box.metadata = { depthCaster: "opaque" };
  assert.equal(shadowCasterKind(box), "opaque");
  box.metadata.depthCaster = false;
  assert.equal(shadowCasterKind(box), false);
  box.metadata.depthCaster = "opaque";
  box.material.alpha = 0.32;
  assert.equal(shadowCasterKind(box), false);
  const shader = new ShaderMaterial("leaf wind", scene, "unused", {
    needAlphaTesting: true,
  });
  box.material = shader;
  box.metadata.depthCaster = "alpha-test";
  assert.equal(shadowCasterKind(box), "alpha-test");
  box.metadata = {};
  assert.equal(shadowCasterKind(box), false);
  box.dispose();
  assert.equal(shadowCasterKind(box), false);
  scene.dispose();
  engine.dispose();
});

test("B6 Fresnel reflection preserves warm masks/alpha and night never keeps solar shadows", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const glass = new StandardMaterial("B6 glass", scene);
  glass.alpha = 0.32;
  glass.metadata = {
    realityGlass: true,
    block: 6,
    nightWindows: true,
    windowStyle: "clear",
  };
  glass.emissiveTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([200, 155, 90, 255]),
    1,
    1,
    scene,
  );
  glass.emissiveTexture.level = 0.7;
  const mask = glass.emissiveTexture;
  const environment = RawTexture.CreateRGBATexture(
    new Uint8Array([90, 110, 150, 255]),
    1,
    1,
    scene,
  );
  assert.equal(applyWindowSkyReflection(glass, environment), true);
  assert.equal(glass.alpha, 0.32);
  assert.equal(glass.emissiveTexture, mask);
  assert.equal(mask.level, 0.7);
  assert.equal(glass.useEmissiveAsIllumination, true);
  assert.ok(glass.reflectionFresnelParameters.isEnabled);
  assert.equal(glass.reflectionTexture, environment);
  assert.equal(solarShadowsEnabled(1, -0.7, 1), true);
  assert.equal(solarShadowsEnabled(0, -0.7, 0.08), false);
  assert.equal(solarShadowsEnabled(1, 0.3, 1), false);
  const other = new StandardMaterial("B4 opaque window", scene);
  other.metadata = { realityGlass: true, block: 4 };
  assert.equal(applyWindowSkyReflection(other, environment), false);
  assert.equal(other.reflectionTexture, null);
  scene.dispose();
  engine.dispose();
});

// NullEngine has no raw cube upload; only that GPU resource is stubbed. Camera
// attachment and pipeline lifecycle below are the actual Babylon implementation.
class ReflectionTestEngine extends NullEngine {
  override createRawCubeTexture(...args: Parameters<NullEngine["createRawCubeTexture"]>) {
    const texture = new InternalTexture(this, InternalTextureSource.CubeRaw);
    texture.isCube = texture.isReady = true;
    texture.width = texture.height = texture.baseWidth = texture.baseHeight = args[1];
    return texture;
  }
}

test("cinematic quality creates one complete postprocess chain per activation and keeps it for medium/high", (t) => {
  const engine = new ReflectionTestEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("pipeline observer", new Vector3(0, 3, -5), scene);
  scene.activeCamera = camera;
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  const atmosphere = new CinematicAtmosphere(scene, camera, sun);
  t.after(() => { atmosphere.dispose(); scene.dispose(); engine.dispose(); });
  const manager = scene.postProcessRenderPipelineManager;
  const attach = manager.attachCamerasToRenderPipeline.bind(manager);
  let attachments = 0;
  manager.attachCamerasToRenderPipeline = (...args) => {
    attachments++;
    return attach(...args);
  };
  const update = (quality: string) => atmosphere.update({
    dt: 0, player: { x: 0, y: 0, z: 0 }, quality, cloud: 0, daylight: 1,
  });
  update("medium");
  assert.equal(attachments, 1, "configuration must attach only the final chain");
  const postProcesses = camera._postProcesses.filter(Boolean);
  assert.ok(postProcesses.length > 0);
  assert.equal(scene.imageProcessingConfiguration.applyByPostProcess, false);
  assert.equal(scene.imageProcessingConfiguration.isEnabled, false);
  update("high");
  assert.equal(attachments, 1);
  assert.deepEqual(camera._postProcesses.filter(Boolean), postProcesses);
  assert.equal(atmosphere.stats.shadowMapSize, 2048);
  update("low");
  assert.equal(camera._postProcesses.filter(Boolean).length, 0);
  assert.equal(atmosphere.stats.bloomWeight, 0);
  update("medium");
  assert.equal(attachments, 2);
  assert.equal(camera._postProcesses.filter(Boolean).length, postProcesses.length);
  assert.equal(atmosphere.stats.shadowMapSize, 1024);
});
