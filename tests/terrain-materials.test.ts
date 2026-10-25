import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import manifest from "../shared/data/assets/terrain-materials-manifest.json";
import { surfaceTexturePlan, SurfacePack } from "../client/surface-pack";
import {
  GroundCoverMaterialPlugin,
  GROUND_SOIL_RESPONSE,
} from "../client/ground-cover-material";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import type { Effect } from "@babylonjs/core/Materials/effect";
import { Constants } from "@babylonjs/core/Engines/constants";
const hash = (bytes: Buffer, kind = "sha256") =>
  createHash(kind).update(bytes).digest("hex");

class UboEngine extends NullEngine {
  constructor() {
    super();
    this._webGLVersion = 2;
  }
}

test("SurfacePack dry/rain/dry updates the actual blended-layer UBO for grass and soil", (t) => {
  const engine = new UboEngine(),
    scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  const meshes = ["grass", "soil"].map((kind) => {
    const material = new StandardMaterial(kind, scene);
    material.metadata = { surfaceKind: kind, uvMetresPerRepeat: 4 };
    const mesh = MeshBuilder.CreateGround(kind, {}, scene);
    mesh.material = material;
    return mesh;
  });
  const pack = new SurfacePack(scene);
  const buffers: UniformBuffer[] = [];
  t.after(() => {
    for (const buffer of buffers) buffer.dispose();
    pack.dispose();
    scene.dispose();
    engine.dispose();
  });
  pack.update(1, "high", 0);
  const rows = meshes.map((mesh, index) => {
    const material = mesh.material as PBRMaterial;
    assert.equal(
      material.textureRepetitionMode,
      Constants.TEXTURE_REPETITION_HEX_TILING,
    );
    assert.deepEqual(material.textureRepetitionHexTilingParams, [0, 0, 7, 0.5]);
    const plugin =
      material.pluginManager?.getPlugin<GroundCoverMaterialPlugin>(
        "SourceGroundCover",
      );
    assert.ok(
      plugin,
      "plugin must be installed by the actual SurfacePack conversion",
    );
    const buffer = new UniformBuffer(engine);
    assert.equal(
      buffer.useUbo,
      true,
      "exercise std140 data, not Effect float-call fallback",
    );
    for (const uniform of plugin.getUniforms().ubo)
      buffer.addUniform(uniform.name, uniform.size);
    buffer.create();
    // Only the sampler sink is inert; all uniform layout/writes use Babylon's real UBO.
    buffer.bindToEffect(
      { setTexture() {} } as unknown as Effect,
      "GroundCover",
    );
    buffers.push(buffer);
    return {
      material,
      plugin,
      buffer,
      dry: material.albedoColor.clone(),
      soilBase: index === 1,
    };
  });
  for (const rain of [0, 2, 0]) {
    pack.update(0.1, "high", rain);
    const wet = rain / 2;
    for (const { material, plugin, buffer, dry, soilBase } of rows) {
      plugin.bindForSubMesh(buffer);
      const values = Array.from(buffer.getData());
      const otherDarken = soilBase ? 0.05 : GROUND_SOIL_RESPONSE.darken;
      const otherSmooth = soilBase ? 0.02 : GROUND_SOIL_RESPONSE.smooth;
      assert.deepEqual(
        values.slice(0, 4),
        [
          Number(soilBase),
          soilBase ? 1.4 : manifest.assets[0].metresPerRepeat,
          soilBase ? 0.28 : GROUND_SOIL_RESPONSE.normalStrength,
          wet,
        ].map(Math.fround),
      );
      assert.deepEqual(
        values.slice(8, 10),
        [otherDarken, otherSmooth].map(Math.fround),
      );
      assert.deepEqual(
        values.slice(12, 16),
        [0.057231, 0.10811, 0.018593, 0.81].map(Math.fround),
      );
      assert.deepEqual(
        values.slice(16, 20),
        [0.8, 0.55, 3.7 ** 2, 64 ** 2].map(Math.fround),
      );
      const profile = values.slice(16, 20);
      const detailAt = (distance: number) => {
        const f = Math.max(
          0,
          Math.min(1, (distance ** 2 - profile[2]) / (profile[3] - profile[2])),
        );
        return profile[0] + (profile[1] - profile[0]) * f * f * (3 - 2 * f);
      };
      assert.ok(Math.abs(detailAt(0) - 0.8) < 1e-7);
      assert.ok(Math.abs(detailAt(3.7) - 0.8) < 1e-7);
      assert.ok(detailAt(20) > 0.79 && detailAt(20) < 0.8);
      assert.ok(Math.abs(detailAt(64) - 0.55) < 1e-7);
      assert.ok(
        material.albedoColor.equalsWithEpsilon(
          dry.scale(1 - wet * (soilBase ? GROUND_SOIL_RESPONSE.darken : 0.05)),
          1e-9,
        ),
      );
      assert.equal(
        material.roughness,
        1 - wet * (soilBase ? GROUND_SOIL_RESPONSE.smooth : 0.02),
      );
      // Independently evaluate the shader response from the uploaded wetness/coefficients.
      assert.ok(
        Math.abs(1 - values[3] * values[8] - (1 - wet * otherDarken)) < 1e-7,
      );
      assert.ok(
        Math.abs(1 - values[3] * values[9] - (1 - wet * otherSmooth)) < 1e-7,
      );
    }
  }
});

test("small original photographic channels match API MD5, SHA, copies and physical scale", () => {
  const asset = manifest.assets[0];
  assert.equal(asset.id, "brown_mud");
  assert.equal(asset.author, "Rob Tuytel");
  assert.equal(manifest.license, "CC0-1.0");
  assert.ok(Math.abs(asset.metresPerRepeat - 1.299996018409729) < 1e-12);
  for (const [key, entry] of Object.entries(asset.channels)) {
    const original = fs.readFileSync(entry.sourcePath),
      runtime = fs.readFileSync(path.join("public", entry.url));
    assert.deepEqual(runtime, original);
    assert.equal(original.length, entry.byteLength);
    assert.equal(hash(original), entry.sha256);
    assert.equal(hash(original, "md5"), entry.md5, key);
  }
  for (const source of Object.values(asset.api))
    assert.equal(hash(fs.readFileSync(source.path)), source.sha256);
  assert.equal(
    surfaceTexturePlan({ surfaceKind: "soil", uvMetresPerRepeat: 4 })?.uScale,
    4 / asset.metresPerRepeat,
  );
  assert.equal(
    surfaceTexturePlan({ surfaceKind: "gravel", surface: "dirt" })?.kind,
    "soil",
  );
  assert.equal(
    surfaceTexturePlan({ surfaceKind: "gravel", surface: "fine_gravel" })?.kind,
    "gravel",
  );
});

test("ground materials share textures across tiers and restore/dispose only their owned resources", (t) => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  const originals = ["grass", "soil"].map((kind) => {
    const m = new StandardMaterial(kind, scene);
    m.metadata = { surfaceKind: kind, uvMetresPerRepeat: 4 };
    return m;
  });
  const meshes = originals.map((m, i) => {
    const mesh = MeshBuilder.CreateGround("ground" + i, {}, scene);
    mesh.material = m;
    return mesh;
  });
  const pack = new SurfacePack(scene);
  t.after(() => {
    pack.dispose();
    scene.dispose();
    engine.dispose();
  });
  pack.update(1, "high", 0);
  const count = scene.textures.length,
    materials = meshes.map((m) => m.material),
    updates = pack.stats.materialUpdates;
  const borrowed = scene.textures.filter(
    (texture) => !texture.name.startsWith("/textures/"),
  );
  assert.equal((materials[0] as PBRMaterial).metadata.groundCoverBase, "grass");
  assert.equal((materials[1] as PBRMaterial).metadata.groundCoverBase, "soil");
  pack.update(0.1, "high", 0);
  assert.equal(pack.stats.materialUpdates, updates);
  for (const tier of ["low", "medium", "high"]) {
    pack.update(0.1, tier, 2);
    assert.equal(scene.textures.length, count);
    assert.equal(meshes[1].material, materials[1]);
    for (const material of materials as PBRMaterial[]) {
      assert.equal(
        material.textureRepetitionMode,
        Constants.TEXTURE_REPETITION_HEX_TILING,
      );
      assert.deepEqual(
        material.textureRepetitionHexTilingParams,
        [0, 0, 7, 0.5],
      );
      assert.equal(material.metadata.groundTextureFetches, 18);
    }
    assert.ok(
      Math.abs(
        (materials[1] as PBRMaterial).roughness! -
          (1 - GROUND_SOIL_RESPONSE.smooth),
      ) < 1e-9,
    );
  }
  pack.dispose();
  assert.equal(meshes[0].material, originals[0]);
  assert.equal(meshes[1].material, originals[1]);
  assert.deepEqual(
    scene.textures,
    borrowed,
    "only the scene-owned BRDF lookup survives owned texture disposal",
  );
});

test("two-source shader owns no maps, preserves world UV and mirrors blend equations in both languages", (t) => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    m = new PBRMaterial("blend", scene);
  const map = RawTexture.CreateRGBATexture(
    new Uint8Array([128, 128, 255, 255]),
    1,
    1,
    scene,
  );
  const source = {
    maps: { color: map, normal: map, roughness: map },
    repeat: 1.299996018409729,
    tint: [1, 1, 1],
    normalStrength: 0.33,
    darken: 0.18,
    smooth: 0.23,
  };
  const plugin = new GroundCoverMaterialPlugin(m, false, source);
  const samplers: string[] = [];
  plugin.getSamplers(samplers);
  assert.deepEqual(
    samplers,
    ["groundOtherAlbedo", "groundOtherNormal", "groundOtherRoughness"],
    "anti-tiling reuses the same three opposite samplers",
  );
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  const calls = new Map<string, number[]>(),
    buffer = {
      updateFloat4: (n: string, ...v: number[]) => calls.set(n, v),
      updateFloat3: (n: string, ...v: number[]) => calls.set(n, v),
      updateFloat2: (n: string, ...v: number[]) => calls.set(n, v),
      setTexture: () => {},
    } as unknown as UniformBuffer;
  plugin.setWetness(Infinity);
  plugin.bindForSubMesh(buffer);
  assert.equal(calls.get("groundCoverConfig")![3], 0);
  for (const lang of [ShaderLanguage.GLSL, ShaderLanguage.WGSL]) {
    const code = Object.values(plugin.getCustomCode("fragment", lang)!).join(
      "\n",
    );
    assert.match(code, /groundField\(/);
    assert.match(code, /vPositionW.xz/);
    assert.match(code, /groundMixedRoughness/);
    assert.match(code, /cotangent_frame/);
    for (const sampler of ["Albedo", "Normal", "Roughness"])
      assert.match(code, new RegExp("TEXRD\\(groundOther" + sampler + "[,)]"));
    assert.doesNotMatch(code, /texture(?:2D|Sample)\(groundOther/);
    assert.match(
      code,
      /groundCompressGrass\(surfaceAlbedo,(?:uniforms\.)?vAlbedoColor.rgb,groundDetail\)/,
    );
    assert.match(
      code,
      /groundCompressGrass\(groundRaw,groundOtherFactor,groundDetail\)/,
    );
    assert.match(code, /groundSoil\(groundRaw,groundValue.x\)/);
    assert.match(code, /groundSoil\(surfaceAlbedo,groundValue.x\)/);
    assert.doesNotMatch(code, /discard|alpha\s*=|gl_FragDepth/);
    assert.match(code, /374761393u/);
    assert.match(code, /1274126177u/);
  }
  m.dispose(false, false);
  assert.equal(scene.textures.includes(map), true);
});
