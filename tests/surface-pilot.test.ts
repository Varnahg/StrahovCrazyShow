import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import type { UniformBuffer } from "@babylonjs/core/Materials/uniformBuffer";
import { SurfacePack, surfaceTexturePlan } from "../client/surface-pack";
import {
  campusSurfaceArt,
  CampusSurfaceArtPlugin,
} from "../client/cinematic-art";

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return scene;
}

test("surface aliases and unknown overrides keep the selected family's weather response", (t) => {
  const scene = fixture(t);
  const cases = [
    {
      surfaceKind: "gravel",
      surface: "compacted",
      kind: "gravel",
      roughness: 0.96,
      darken: 0.18,
    },
    { surfaceKind: "compacted", kind: "gravel", roughness: 0.96, darken: 0.18 },
    {
      surfaceKind: "grass",
      surface: "unclassified",
      kind: "grass",
      roughness: 0.98,
      darken: 0.05,
    },
    {
      surfaceKind: "concrete",
      surface: "paving_stones",
      kind: "paving",
      roughness: 0.77,
      darken: 0.1,
    },
  ];
  const meshes = cases.map((data, i) => {
    const material = new StandardMaterial(`source:${i}`, scene);
    material.metadata = { ...data, uvMetresPerRepeat: 4 };
    const mesh = MeshBuilder.CreateBox(`surface:${i}`, {}, scene);
    mesh.material = material;
    assert.equal(surfaceTexturePlan(material.metadata)?.kind, data.kind);
    return mesh;
  });
  const pack = new SurfacePack(scene);
  t.after(() => pack.dispose());
  pack.update(1, "high", 0);
  const dry = meshes.map((mesh) =>
    (mesh.material as PBRMaterial).albedoColor.clone(),
  );
  for (const quality of ["low", "medium", "high"]) {
    pack.update(0.1, quality, 2);
    meshes.forEach((mesh, i) => {
      const material = mesh.material as PBRMaterial;
      assert.equal(material.metadata.materialSurfaceKind, cases[i].kind);
      assert.ok(Math.abs(material.roughness! - cases[i].roughness) < 1e-9);
      assert.ok(
        material.albedoColor.equalsWithEpsilon(
          dry[i].scale(1 - cases[i].darken),
          1e-9,
        ),
      );
    });
    pack.update(0.1, quality, 0);
    meshes.forEach((mesh, i) =>
      assert.ok((mesh.material as PBRMaterial).albedoColor.equals(dry[i])),
    );
  }
});

test("source detail compression is resource-free and preserves an authored joint map", (t) => {
  const scene = fixture(t);
  const art = campusSurfaceArt("paving")!;
  const material = new PBRMaterial("source joints", scene);
  const before = {
    textures: scene.textures.length,
    meshes: scene.meshes.length,
    lights: scene.lights.length,
  };
  const plugin = new CampusSurfaceArtPlugin(material, art, true);
  const uniforms = new Map<string, number[]>();
  const buffer = {
    updateFloat4: (name: string, ...values: number[]) =>
      uniforms.set(name, values),
    updateFloat2: (name: string, ...values: number[]) =>
      uniforms.set(name, values),
  } as unknown as UniformBuffer;
  plugin.bindForSubMesh(buffer);
  assert.equal(uniforms.get("campusArtDetail")![3], 1);
  assert.equal(uniforms.get("campusArtResponse")![0], 1);
  assert.deepEqual(
    {
      textures: scene.textures.length,
      meshes: scene.meshes.length,
      lights: scene.lights.length,
    },
    before,
  );
  assert.equal(material.metadata.surfaceDetailPreserved, true);
  const shader = Object.values(plugin.getCustomCode("fragment")!).join("\n");
  assert.doesNotMatch(shader, /texture2D|textureLod|sampler|discard/);
  // Weather changes the material albedo factor; do not fade distant wet roads
  // toward an unchanging dry RGB value or apply a second gamma conversion.
  assert.match(shader, /campusArtDetail\.rgb\*vAlbedoColor\.rgb/);
  assert.doesNotMatch(shader, /toLinearSpace|pow\(/);
});

test("disposal restores nested shared materials and leaves borrowed authored textures alone", (t) => {
  const scene = fixture(t);
  const source = new StandardMaterial("original paving", scene);
  source.metadata = {
    surfaceKind: "paving",
    uvMetresPerRepeat: 4,
    preserveAuthoredPavingJoints: true,
  };
  const borrowed = RawTexture.CreateRGBATexture(
    new Uint8Array([160, 155, 145, 255]),
    1,
    1,
    scene,
  );
  source.diffuseTexture = borrowed;
  const inner = new MultiMaterial("inner", scene);
  inner.subMaterials = [source, null];
  const outer = new MultiMaterial("outer", scene);
  outer.subMaterials = [inner, source];
  const first = MeshBuilder.CreateBox("first", {}, scene);
  const second = MeshBuilder.CreateBox("second", {}, scene);
  first.material = outer;
  second.material = source;
  const pack = new SurfacePack(scene);
  pack.update(1, "high", 0);
  const converted = second.material as PBRMaterial;
  assert.equal(inner.subMaterials[0], converted);
  assert.equal(outer.subMaterials[1], converted);
  const textureCount = scene.textures.length;
  pack.dispose();
  assert.equal(inner.subMaterials[0], source);
  assert.equal(outer.subMaterials[1], source);
  assert.equal(second.material, source);
  assert.equal(source.name, "original paving");
  assert.equal(inner.subMaterials[1], null);
  assert.equal(source.diffuseTexture, borrowed);
  assert.ok(scene.textures.includes(borrowed));
  assert.equal(scene.textures.length, textureCount - 2);
  pack.dispose();
});

test("plaster keeps existing channels and shared cache through quality changes and release", (t) => {
  const scene = fixture(t);
  scene.useRightHandedSystem = true;
  const sources = ["first plaster", "second plaster"].map((name) => {
    const source = new StandardMaterial(name, scene);
    source.metadata = { surfaceKind: "plaster", uvMetresPerRepeat: 3 };
    return source;
  });
  const meshes = sources.map((source, i) => {
    const mesh = MeshBuilder.CreateBox(`wall:${i}`, {}, scene);
    mesh.material = source;
    return mesh;
  });
  // PBR initializes Babylon's shared environment BRDF lookup independently of
  // SurfacePack. Include that baseline and an already authored PBR material.
  const authored = new PBRMaterial("authored model", scene);
  const authoredMesh = MeshBuilder.CreateBox("authored model", {}, scene);
  authoredMesh.material = authored;
  const priorTextures = scene.textures.length;
  const pack = new SurfacePack(scene);
  pack.update(1, "medium", 0);
  assert.equal(authoredMesh.material, authored);
  const materials = meshes.map((mesh) => mesh.material as PBRMaterial);
  assert.equal(scene.textures.length - priorTextures, 3);
  const [first, second] = materials;
  for (const field of [
    "albedoTexture",
    "bumpTexture",
    "metallicTexture",
  ] as const) {
    assert.equal(first[field], second[field]);
    assert.equal(first[field]!.getTextureMatrix().m[0], 3);
  }
  assert.equal(first.albedoTexture!.gammaSpace, true);
  assert.equal(first.bumpTexture!.gammaSpace, false);
  assert.equal(first.metallicTexture!.gammaSpace, false);
  assert.equal(first.bumpTexture!.level, 0.32);
  assert.equal(first.invertNormalMapX, false);
  assert.equal(first.invertNormalMapY, true);
  assert.equal(first.metadata.normalMapConvention, "OpenGL");
  const dry = first.albedoColor.clone();
  pack.update(0.1, "low", 2);
  assert.equal(first.disableBumpMap, true);
  assert.equal(first.roughness, 1);
  assert.ok(first.albedoColor.equals(dry)); // Wall plaster is not wettable road.
  pack.update(0.1, "high", 0);
  assert.equal(first.disableBumpMap, false);
  const visits = pack.stats.meshVisits;
  const updates = pack.stats.materialUpdates;
  for (let i = 0; i < 120; ++i) pack.update(1 / 60, "high", 0);
  assert.equal(pack.stats.meshVisits, visits);
  assert.equal(pack.stats.materialUpdates, updates);
  assert.equal(scene.textures.length - priorTextures, 3);
  pack.dispose();
  assert.equal(scene.textures.length, priorTextures);
  meshes.forEach((mesh, i) => assert.equal(mesh.material, sources[i]));
  assert.ok(materials.every((material) => !scene.materials.includes(material)));
  pack.dispose();
});

test("quiet plaster reuses a noise-free shader while retaining normal/roughness source detail", (t) => {
  const scene = fixture(t);
  const art = campusSurfaceArt("plaster")!;
  const plugin = new CampusSurfaceArtPlugin(
    new PBRMaterial("wall", scene),
    art,
  );
  const second = new CampusSurfaceArtPlugin(
    new PBRMaterial("other wall", scene),
    art,
  );
  const code = plugin.getCustomCode("fragment")!;
  assert.equal(code, second.getCustomCode("fragment"));
  assert.equal(Object.isFrozen(code), true);
  assert.doesNotMatch(
    Object.values(code).join("\n"),
    /campusArtNoise|campusArtHash|metallicRoughness|texture2D|textureLod|sampler/,
  );
  const uniforms = new Map<string, number[]>();
  plugin.bindForSubMesh({
    updateFloat4: (name: string, ...values: number[]) =>
      uniforms.set(name, values),
    updateFloat2: (name: string, ...values: number[]) =>
      uniforms.set(name, values),
  } as unknown as UniformBuffer);
  assert.equal(uniforms.get("campusArtDetail")![3], 0.68);
  assert.equal(uniforms.get("campusArtResponse")![0], 0.52);
  // Source deviation is compressed around its own mean; it is not blurred,
  // inverted, recoloured toward a foreign mean or used as a normal-map level.
  for (const detail of [0.68, 0.52]) {
    for (const sample of [0.2, 0.6, 0.9]) {
      const mean = art.sourceMean[0];
      const compressed = mean + (sample - mean) * detail;
      assert.equal(Math.sign(compressed - mean), Math.sign(sample - mean));
      assert.ok(Math.abs(compressed - mean) < Math.abs(sample - mean));
    }
  }
  const asphalt = new CampusSurfaceArtPlugin(
    new PBRMaterial("road", scene),
    campusSurfaceArt("asphalt")!,
  );
  assert.match(
    Object.values(asphalt.getCustomCode("fragment")!).join("\n"),
    /campusArtNoise/,
  );
});
