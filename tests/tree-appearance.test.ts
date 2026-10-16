import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { ShaderLanguage } from "@babylonjs/core/Materials/shaderLanguage";
import { TREES } from "../shared/world";
import { TREE_RECONSTRUCTIONS } from "../shared/vegetation";
import {
  decodeTreeRuntimeChunk,
  VegetationController,
} from "../client/vegetation";
import {
  applyTreeCrownShading,
  configureTreeMaterial,
  deriveTreeCrownNormals,
  TREE_LEAF_TRANSLUCENCY,
} from "../client/tree-appearance";
import { TreeWindPlugin } from "../client/tree-wind";
import manifest from "../public/models/vegetation/runtime/manifest.json";

function detail(id: string, lod: 0 | 1) {
  const entry = (
    manifest.trees as Record<string, Record<number, { url: string }>>
  )[id][lod];
  const bytes = readFileSync("public" + entry.url);
  return decodeTreeRuntimeChunk(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  ).primitives.find((p) => p.name.endsWith("__leaves"))!;
}
function createMesh(scene: Scene, id: string, lod: 0 | 1) {
  const primitive = detail(id, lod),
    mesh = new Mesh(primitive.name, scene),
    data = new VertexData();
  data.positions = primitive.positions;
  data.normals = primitive.normals;
  data.uvs = primitive.uvs;
  data.indices = primitive.indices;
  data.applyToMesh(mesh);
  return mesh;
}

test("derived crown normals are finite outward unit vectors in every source far crown", () => {
  const bytes = readFileSync("public" + manifest.bootstrap),
    length = bytes.readUInt32LE(12),
    json = JSON.parse(bytes.subarray(20, 20 + length).toString()),
    bin = bytes.subarray(28 + length);
  const attr = (id: number) => {
    const a = json.accessors[id],
      v = json.bufferViews[a.bufferView];
    return new Float32Array(
      bin.buffer,
      bin.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0),
      a.count * 3,
    );
  };
  let checked = 0;
  for (const source of json.meshes.filter((m: any) =>
    m.name.endsWith("__leaves"),
  )) {
    const id = /^tree__(.+)__lod2__/.exec(source.name)![1],
      ref = TREE_RECONSTRUCTIONS.find((t) => t.id === id)!;
    const p = source.primitives[0],
      positions = attr(p.attributes.POSITION),
      normals = attr(p.attributes.NORMAL),
      original = normals.slice(),
      result = deriveTreeCrownNormals(positions, normals, ref);
    assert.deepEqual(
      normals,
      original,
      "source normals must remain byte-identical",
    );
    const volume = deriveTreeCrownNormals(
      positions,
      new Float32Array(normals.length),
      ref,
    );
    for (let i = 0; i < result.length; i += 3) {
      assert.ok(
        Math.abs(Math.hypot(result[i], result[i + 1], result[i + 2]) - 1) <
          1e-6,
      );
      assert.ok(
        result[i] * volume[i] +
          result[i + 1] * volume[i + 1] +
          result[i + 2] * volume[i + 2] >
          0.9,
        "lighting normals remain oriented toward the source crown envelope",
      );
    }
    checked++;
  }
  assert.equal(checked, 109);
});

test("streamed near/mid shading changes only normal buffers once and owns no permanent geometry cache", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    ref = TREE_RECONSTRUCTIONS.find((t) => t.id === "ipr-crown-026")!;
  try {
    for (const lod of [0, 1] as const) {
      const mesh = createMesh(scene, ref.id, lod),
        geometry = mesh.geometry!,
        positions = mesh.getVerticesData(VertexBuffer.PositionKind),
        uvs = mesh.getVerticesData(VertexBuffer.UVKind),
        indices = mesh.getIndices(),
        sourceNormals = mesh.getVerticesData(VertexBuffer.NormalKind),
        bounds = mesh.getBoundingInfo().boundingBox.extendSize.clone();
      assert.equal(applyTreeCrownShading(mesh, ref), true);
      assert.equal(
        mesh.geometry,
        geometry,
        "independent source mesh must not clone its full geometry",
      );
      assert.equal(mesh.getVerticesData(VertexBuffer.PositionKind), positions);
      assert.equal(mesh.getVerticesData(VertexBuffer.UVKind), uvs);
      assert.equal(mesh.getIndices(), indices);
      assert.notEqual(
        mesh.getVerticesData(VertexBuffer.NormalKind),
        sourceNormals,
      );
      assert.deepEqual(mesh.getBoundingInfo().boundingBox.extendSize, bounds);
      const derived = mesh.getVerticesData(VertexBuffer.NormalKind);
      assert.equal(applyTreeCrownShading(mesh, ref), false);
      assert.equal(mesh.getVerticesData(VertexBuffer.NormalKind), derived);
      mesh.dispose(false, false);
      assert.equal(geometry.isDisposed(), true);
      assert.equal(scene.geometries.length, 0);
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("LOD eviction releases derived buffers and preserves shared foliage materials", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    ref = TREE_RECONSTRUCTIONS.find((t) => t.id === "ipr-crown-026")!,
    material = new PBRMaterial("shared leaves", scene);
  try {
    const mesh = createMesh(scene, ref.id, 0);
    mesh.material = material;
    applyTreeCrownShading(mesh, ref);
    const geometry = mesh.geometry!;
    const controller = Object.create(VegetationController.prototype) as any;
    controller.detailCache = new Map([
      [ref.id + ":0", 0],
      ...Array.from(
        { length: 32 },
        (_, i) => ["protected" + i + ":0", i + 1] as const,
      ),
    ]);
    controller.treeGroups = [
      { id: ref.id, active: 2, desired: 2, lods: [[mesh], [], []] },
    ];
    controller.trees = [mesh];
    controller.stats = {};
    controller.trimDetailCache();
    assert.equal(geometry.isDisposed(), true);
    assert.equal(scene.geometries.length, 0);
    assert.equal(controller.detailCache.size, 32);
    assert.equal(controller.trees.length, 0);
    assert.ok(scene.materials.includes(material));
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("foliage retains source alpha/PBR channels and adds bounded non-emissive transmission", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new PBRMaterial("CC0 photographic green leaves", scene);
  try {
    const albedo = RawTexture.CreateRGBATexture(
        new Uint8Array([80, 100, 30, 255]),
        1,
        1,
        scene,
      ),
      normal = RawTexture.CreateRGBATexture(
        new Uint8Array([128, 128, 255, 255]),
        1,
        1,
        scene,
      ),
      roughness = RawTexture.CreateRGBATexture(
        new Uint8Array([255, 200, 0, 255]),
        1,
        1,
        scene,
      );
    material.albedoTexture = albedo;
    material.bumpTexture = normal;
    material.metallicTexture = roughness;
    assert.equal(configureTreeMaterial(material), true);
    assert.equal(material.albedoTexture, albedo);
    assert.equal(material.bumpTexture, normal);
    assert.equal(material.metallicTexture, roughness);
    assert.equal(material.alphaCutOff, 0.5);
    assert.equal(material.transparencyMode, PBRMaterial.PBRMATERIAL_ALPHATEST);
    assert.equal(material.twoSidedLighting, false);
    assert.deepEqual(material.emissiveColor.asArray(), [0, 0, 0]);
    assert.equal(material.emissiveTexture, null);
    assert.equal(
      material.subSurface.translucencyIntensity,
      TREE_LEAF_TRANSLUCENCY,
    );
    assert.ok(TREE_LEAF_TRANSLUCENCY > 0 && TREE_LEAF_TRANSLUCENCY < 0.2);
    assert.equal(material.subSurface.translucencyColorTexture, albedo);
    const bark = new PBRMaterial("CC0 photographic bark", scene);
    assert.equal(configureTreeMaterial(bark), false);
    assert.equal(bark.subSurface.isTranslucencyEnabled, false);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("wind refreshes frozen-material uniforms and keeps the inverse-transpose normal/tangent hooks", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new PBRMaterial("leaves", scene),
    state = { time: 0, x: 2, z: -3 },
    plugin = new TreeWindPlugin(material, state),
    calls: unknown[] = [];
  try {
    const buffer = {
      updateFloat3: (...args: unknown[]) => calls.push(args),
    } as any;
    material.freeze();
    plugin.hardBindForSubMesh(buffer, scene, engine, null as any);
    state.time = 3;
    plugin.hardBindForSubMesh(buffer, scene, engine, null as any);
    assert.deepEqual(calls, [
      ["cleanTreeWind", 0, 2, -3],
      ["cleanTreeWind", 3, 2, -3],
    ]);
    assert.equal(plugin.registerForExtraEvents, true);
    const code = plugin.getCustomCode("vertex")!.CUSTOM_VERTEX_UPDATE_POSITION;
    assert.match(code, /normalUpdated\.y-dot\(treeShear,normalUpdated\.xz\)/);
    assert.match(code, /tangentUpdated\.x\+treeShear\.x\*tangentUpdated\.y/);
    const native = plugin.getCustomCode(
      "vertex",
      ShaderLanguage.WGSL,
    )!.CUSTOM_VERTEX_UPDATE_POSITION;
    assert.match(native, /normalUpdated\.y-dot\(treeShear,normalUpdated\.xz\)/);
    assert.match(native, /tangentUpdated\.x\+treeShear\.x\*tangentUpdated\.y/);
    assert.match(native, /tangentUpdated\.w\)/);
    // An arbitrary perpendicular normal/tangent stays perpendicular under the
    // vertical shear used by the shader, including the derivative at both ends.
    for (const y of [0, 1.5, 3, 7, 9.99, 10, 14]) {
      const t = Math.max(0, Math.min(1, (y - 1.5) / 8.5)),
        dx = (0.02 * 6 * t * (1 - t)) / 8.5,
        dz = (-0.03 * 6 * t * (1 - t)) / 8.5;
      const n = [1, 2 - dx - dz * 3, 3],
        tangent = [2 - dx, -1, -dz];
      assert.ok(
        Math.abs(n[0] * tangent[0] + n[1] * tangent[1] + n[2] * tangent[2]) <
          1e-10,
      );
    }
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("normal shading cannot alter surveyed placements or add draw calls", () => {
  assert.equal(TREES.length, 109);
  const source = readFileSync("client/vegetation.ts", "utf8");
  assert.equal(
    (
      source.match(
        /applyTreeCrownShading\(mesh, placement\.reconstruction\)/g,
      ) ?? []
    ).length,
    2,
    "bootstrap and streamed details share shading",
  );
  assert.equal(
    (source.match(/new TreeWindPlugin/g) ?? []).length,
    1,
    "shared material plugin, never per-tree material",
  );
});
