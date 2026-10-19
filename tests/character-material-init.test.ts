import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import {
  CharacterMaterials,
  type CharacterSurface,
} from "../client/character-materials";
import { EYE_PALETTES } from "../client/avatar-eyes";
import { StudentHairTintPlugin } from "../client/avatar-hair";
import calibration from "../client/data/student-hair-calibration.json";

const roughness: Record<CharacterSurface, number> = {
  skin: 0.53, hair: 0.54, "strands-short02": 0.76, "strands-short04": 0.76,
  beard: 0.9, cloth: 0.88, denim: 0.94, leather: 0.56, eye: 0.14,
  ocular: 0.3, iris: 0.22, metal: 0.37, rubber: 0.86,
};
const surfaces = Object.keys(roughness) as CharacterSurface[];
const color = "#6b4c36";

function fixture(t: TestContext) {
  const engine = new NullEngine(), scene = new Scene(engine),
    materials = new CharacterMaterials(scene);
  t.after(() => { materials.dispose(); scene.dispose(); engine.dispose(); });
  return { engine, scene, materials };
}

function foreignDraws(scene: Scene) {
  const material = new PBRMaterial("unrelated", scene);
  let reads = 0;
  const meshes = Array.from({ length: 16 }, (_, index) => {
    const mesh = MeshBuilder.CreateBox(`foreign ${index}`, {}, scene);
    mesh.material = material;
    const subMesh = mesh.subMeshes[0], getMaterial = subMesh.getMaterial;
    // Both a primary draw and a second pass exercise the actual Babylon loop.
    subMesh._getDrawWrapper(0, true);
    subMesh._getDrawWrapper(1, true);
    subMesh.getMaterial = function (...args: Parameters<typeof getMaterial>) {
      reads++;
      return getMaterial.apply(this, args);
    };
    return mesh;
  });
  return { material, meshes, reads: () => reads, reset: () => { reads = 0; } };
}

test("new character materials traverse foreign draw wrappers at most once before sharing", async (t) => {
  for (const surface of surfaces) await t.test(surface, (t) => {
    const { scene, materials } = fixture(t), foreign = foreignDraws(scene);
    foreign.reset();
    const material = materials.get(color, surface), reads = foreign.reads();
    t.diagnostic(`${surface}: ${reads} foreign material reads for 32 draw wrappers`);
    assert.ok(reads <= 32, `${surface}: ${reads} reads exceed one traversal of 32 foreign wrappers`);
    assert.equal(material.blockDirtyMechanism, false);
    assert.equal(scene.blockMaterialDirtyMechanism, false);
    assert.ok(foreign.meshes.every((mesh) => mesh.material === foreign.material && !mesh.isDisposed()));
    foreign.reset();
    assert.equal(materials.get(color.toUpperCase(), surface), material);
    assert.equal(foreign.reads(), 0, "cache hits must neither reconfigure nor traverse");
  });
});

test("all character surfaces retain values, textures, plugins and first-ready defines", async (t) => {
  const { engine, scene, materials } = fixture(t);
  new FreeCamera("material camera", new Vector3(0, 0, -4), scene);
  // NullEngine has no driver or image decoder. Enable the derivative capability
  // and mark its CPU raw-texture placeholders ready to inspect PBR defines only.
  engine.getCaps().standardDerivatives = true;
  for (const surface of surfaces) {
    const material = materials.get(color, surface),
      strands = surface === "strands-short02" || surface === "strands-short04",
      fabric = surface === "cloth" || surface === "denim",
      micro = surface === "skin" || surface === "beard" ? "skin"
        : fabric ? "cloth" : surface === "hair" ? "hair" : undefined;
    assert.deepEqual(material.albedoColor.asArray(),
      (surface === "ocular" ? Color3.White() : Color3.FromHexString(color).toLinearSpace()).asArray(), surface);
    assert.equal(material.metallic, surface === "metal" ? 0.65 : 0, surface);
    assert.equal(material.roughness, roughness[surface], surface);
    assert.equal(material.environmentIntensity, surface === "eye" ? 0.9 : 0.65, surface);
    assert.equal(material.metadata.characterSurface, surface);
    assert.equal(material.metadata.paletteColor, color);
    assert.equal(material.alpha, surface === "beard" ? 0.42 : 1, surface);
    assert.equal(material.needAlphaBlending(), surface === "beard", surface);
    assert.equal(material.clearCoat.isEnabled, surface === "skin" || surface === "ocular", surface);
    assert.equal(material.sheen.isEnabled, fabric, surface);
    assert.equal(material.blockDirtyMechanism, false);
    if (surface === "skin") {
      assert.equal(material.clearCoat.intensity, 0.055);
      assert.equal(material.clearCoat.roughness, 0.5);
    }
    if (fabric) {
      assert.equal(material.sheen.intensity, 0.12);
      assert.equal(material.sheen.roughness, 0.85);
      assert.deepEqual(material.sheen.color.asArray(), [0.38, 0.38, 0.38]);
    }
    if (micro) {
      const texture = material.bumpTexture as Texture;
      assert.equal(texture.name, `authored ${micro} analytical normal`);
      assert.equal(texture.gammaSpace, false);
      assert.equal(texture.level, micro === "hair" ? 0.12 : 0.035);
      assert.equal(texture.uScale, micro === "skin" ? 3 : micro === "cloth" ? 4 : 1);
      assert.equal(texture.uScale, texture.vScale);
      assert.equal(texture.wrapU, Texture.WRAP_ADDRESSMODE);
      assert.equal(texture.wrapV, Texture.WRAP_ADDRESSMODE);
    }
    if (strands) {
      const style = surface === "strands-short02" ? "short02" : "short04";
      assert.equal(material.albedoTexture!.name, `/models/characters/student-hair/${style}/diffuse.png`);
      assert.equal(material.albedoTexture!.gammaSpace, true);
      assert.equal(material.albedoTexture!.hasAlpha, true);
      assert.equal(material.albedoTexture!.level, calibration.styles[style].luminanceScale);
      assert.equal(material.bumpTexture?.name ?? null, style === "short02" ? "/models/characters/student-hair/short02/normal.png" : null);
      if (material.bumpTexture) {
        assert.equal(material.bumpTexture.gammaSpace, false);
        assert.equal(material.bumpTexture.level, 0.4);
      }
      assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_ALPHATEST);
      assert.equal(material.useAlphaFromAlbedoTexture, true);
      assert.equal(material.alphaCutOff, 0.42);
      assert.equal(material.forceDepthWrite, true);
      assert.equal(material.backFaceCulling, false);
      assert.equal(material.twoSidedLighting, true);
      assert.equal(material.metadata.hairStyle, style);
      assert.equal(material.metadata.originalAtlasAlpha, true);
      assert.equal(material.metadata.hairTint, "source-relative-luminance");
      const plugin = material.pluginManager!.getPlugin("StrahovStudentHairTint");
      assert.ok(plugin instanceof StudentHairTintPlugin);
      for (const language of [ShaderLanguage.GLSL, ShaderLanguage.WGSL])
        assert.match(plugin.getCustomCode("fragment", language)!.CUSTOM_FRAGMENT_UPDATE_ALBEDO, /studentHairShade/);
    }
    if (surface === "ocular") {
      assert.equal(material.albedoTexture!.name, "/models/characters/student-eyes/brown.png");
      assert.equal(material.albedoTexture!.gammaSpace, true);
      assert.equal(material.albedoTexture!.hasAlpha, false);
      assert.equal(material.indexOfRefraction, 1.376);
      assert.equal(material.clearCoat.indexOfRefraction, 1.376);
      assert.equal(material.clearCoat.intensity, 1);
      assert.equal(material.clearCoat.roughness, 0.08);
      assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_OPAQUE);
      assert.equal(material.metadata.eyeAtlas, "brown");
    }
    if (strands || surface === "ocular") assert.equal(material.metadata.sourceLicense, "CC0-1.0");
    if (surface === "beard") assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_ALPHABLEND);
    const mesh = MeshBuilder.CreateBox(surface, {}, scene);
    mesh.material = material;
    for (const texture of material.getActiveTextures()) texture.getInternalTexture()!.isReady = true;
    await material.forceCompilationAsync(mesh);
    scene.incrementRenderId();
    const subMesh = mesh.subMeshes[0];
    assert.equal(material.isReadyForSubMesh(mesh, subMesh), true, surface);
    const defines = subMesh.materialDefines as unknown as Record<string, unknown>;
    for (const [key, expected] of Object.entries({
      ALBEDO: strands || surface === "ocular", BUMP: !!micro || surface === "strands-short02",
      ALPHATEST: strands, ALPHABLEND: surface === "beard",
      CLEARCOAT: surface === "skin" || surface === "ocular", SHEEN: fabric,
      TWOSIDEDLIGHTING: strands, METALLICWORKFLOW: true,
    })) assert.equal(defines[key], expected, `${surface} ${key}`);
  }
});

test("character cache retains shared textures through prune and releases them once on dispose", (t) => {
  const { scene, materials } = fixture(t);
  const original = surfaces.map((surface) => materials.get(color, surface));
  for (const surface of surfaces) {
    const first = materials.get(color, surface), recolored = materials.get("#aabbcc", surface);
    assert.notEqual(first, recolored);
    assert.equal(materials.get("#AABBCC", surface), recolored);
    assert.equal(first.bumpTexture, recolored.bumpTexture);
    assert.equal(first.albedoTexture, recolored.albedoTexture);
  }
  assert.equal(materials.get(color, "skin").bumpTexture, materials.get(color, "beard").bumpTexture);
  assert.equal(materials.get(color, "cloth").bumpTexture, materials.get(color, "denim").bumpTexture);
  for (const { color, atlas } of EYE_PALETTES)
    assert.equal(materials.get(color, "ocular").albedoTexture!.name, `/models/characters/student-eyes/${atlas}.png`);
  const owned = scene.materials.filter((material) => material.name.startsWith("character "));
  const textures = [...new Set(owned.flatMap((material) => material.getActiveTextures()))];
  assert.equal(textures.length, 9, "three micro normals, three hair maps, three eye atlases");
  const disposed = new Set<unknown>();
  const onDisposed = (item: unknown) => {
    assert.ok(!disposed.has(item), "each resource is released once");
    disposed.add(item);
  };
  for (const material of owned) material.onDisposeObservable.add(() => onDisposed(material));
  for (const texture of textures) texture.onDisposeObservable.add(() => onDisposed(texture));
  materials.prune(new Set(original));
  assert.ok(original.every((material) => scene.materials.includes(material)));
  assert.ok(textures.every((texture) => !disposed.has(texture) && scene.textures.includes(texture)));
  materials.prune(new Set());
  assert.ok(owned.every((material) => disposed.has(material)));
  for (let index = 0; index < surfaces.length; index++) {
    const recreated = materials.get(color, surfaces[index]);
    assert.notEqual(recreated, original[index]);
    assert.equal(recreated.bumpTexture, original[index].bumpTexture);
    assert.equal(recreated.albedoTexture, original[index].albedoTexture);
  }
  materials.dispose();
  assert.ok(textures.every((texture) => disposed.has(texture) && !scene.textures.includes(texture)));
  assert.equal(scene.materials.filter((material) => material.name.startsWith("character ")).length, 0);
  materials.dispose();
  const renewed = materials.get(color, "skin");
  assert.notEqual(renewed.bumpTexture, original[0].bumpTexture);
  assert.equal(renewed.blockDirtyMechanism, false);
});

test("later edits invalidate every consumer after initial material configuration", async (t) => {
  const { engine, scene, materials } = fixture(t);
  engine.getCaps().standardDerivatives = true;
  new FreeCamera("invalidation camera", new Vector3(0, 0, -4), scene);
  const material = materials.get(color, "skin");
  material.bumpTexture!.getInternalTexture()!.isReady = true;
  const meshes = ["first", "second"].map((name) => {
    const mesh = MeshBuilder.CreateBox(name, {}, scene);
    mesh.material = material;
    return mesh;
  });
  for (const mesh of meshes) {
    await material.forceCompilationAsync(mesh);
    scene.incrementRenderId();
    assert.equal(material.isReadyForSubMesh(mesh, mesh.subMeshes[0]), true);
    assert.equal(mesh.subMeshes[0].materialDefines!.isDirty, false);
  }
  const foreign = foreignDraws(scene);
  foreign.reset();
  material.bumpTexture = null;
  assert.equal(foreign.reads(), 32, "late setter resumes the actual Babylon traversal");
  for (const mesh of meshes) {
    assert.equal(mesh.subMeshes[0].materialDefines!.isDirty, true);
    await material.forceCompilationAsync(mesh);
    scene.incrementRenderId();
    assert.equal(material.isReadyForSubMesh(mesh, mesh.subMeshes[0]), true);
    assert.equal((mesh.subMeshes[0].materialDefines as unknown as { BUMP: boolean }).BUMP, false);
  }
  assert.equal(material.blockDirtyMechanism, false);
  assert.equal(scene.blockMaterialDirtyMechanism, false);
});
