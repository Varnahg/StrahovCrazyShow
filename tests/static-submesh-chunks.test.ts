import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import sourceFixture from "./fixtures/static-ground-source.json";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import {
  chunkStaticMesh,
  staticChunkSource,
} from "../client/static-submesh-chunks";
import { installStaticSubmeshShadowCull } from "../client/static-submesh-shadows";
import {
  CinematicAtmosphere,
  shadowBoundsIntersectFrustum,
  shadowCasterKind,
} from "../client/cinematic";
import { VehicleLighting } from "../client/vehicle-lighting";
import { buildTerrain } from "../client/terrain-renderer";
import { buildStreets } from "../client/streets-renderer";
import { buildLandcover } from "../client/vegetation";
import { buildCampusExteriorPlan } from "../shared/campus-exterior";
import { terrainMeshData, createTerrainTiles } from "../shared/terrain";
import { GROUND_RECTS, TERRAIN_COVERAGE } from "../shared/world";
import "../client/render-shaders";
import "@babylonjs/core/Shaders/shadowMap.vertex";
import "@babylonjs/core/Shaders/shadowMap.fragment";

class CpuEngine extends NullEngine {
  override createRawCubeTexture(
    ...args: Parameters<NullEngine["createRawCubeTexture"]>
  ) {
    const t = new InternalTexture(this, InternalTextureSource.CubeRaw);
    t.isCube = true;
    t.width = t.height = t.baseWidth = t.baseHeight = args[1];
    t.isReady = true;
    return t;
  }
}
const hash = (data: Uint32Array | Float32Array) =>
  createHash("sha256")
    .update(new Uint8Array(data.buffer, data.byteOffset, data.byteLength))
    .digest("hex");
function fixture() {
  const engine = new CpuEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("camera", new Vector3(3, 4, 10), scene);
  camera.setTarget(new Vector3(3, 0, 3));
  scene.activeCamera = camera;
  return { engine, scene, camera };
}
function floor(scene: Scene, xs = [202, 2, -202]) {
  const mesh = new Mesh("three original floor patches", scene),
    data = new VertexData();
  const positions: number[] = [],
    uvs: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  for (const x of xs) {
    const n = positions.length / 3;
    positions.push(x, 0, 2, x + 2, 0, 2, x + 2, 0.4, 4, x, 0.4, 4);
    uvs.push(x / 4, 0.5, (x + 2) / 4, 0.5, (x + 2) / 4, 1, x / 4, 1);
    colors.push(...Array.from({ length: 4 }, () => [0.3, 0.4, 0.5, 1]).flat());
    indices.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  Object.assign(data, {
    positions,
    normals,
    uvs,
    colors,
    indices: new Uint16Array(indices),
  });
  data.applyToMesh(mesh);
  const material = new StandardMaterial("original floor material", scene);
  material.disableLighting = true;
  mesh.material = material;
  mesh.metadata = { depthCaster: "opaque", originalPolicy: "retained" };
  mesh.freezeWorldMatrix();
  return mesh;
}
function restored(mesh: Mesh) {
  const source = staticChunkSource(mesh)!,
    now = mesh.getIndices()!,
    out = new Uint32Array(now.length),
    seen = new Uint8Array(source.sourceTriangles.length);
  for (let i = 0; i < source.sourceTriangles.length; i++) {
    const n = source.sourceTriangles[i];
    assert.equal(seen[n], 0);
    seen[n] = 1;
    out.set([now[i * 3], now[i * 3 + 1], now[i * 3 + 2]], n * 3);
  }
  assert.ok(seen.every((v) => v === 1));
  return out;
}
async function warm(scene: Scene) {
  for (let i = 0; i < 3; i++) {
    scene.render();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test("static chunks retain original VBO identities, every attribute bit, winding/index master, index width, roots and floor bounds", () => {
  const { engine, scene } = fixture();
  const mesh = floor(scene);
  mesh.unfreezeWorldMatrix();
  mesh.position.set(13, 2, 5);
  mesh.rotation.y = 0.2;
  mesh.freezeWorldMatrix();
  const geometry = mesh.geometry,
    material = mesh.material,
    world = Array.from(mesh.getWorldMatrix().asArray()),
    bounds = mesh.getBoundingInfo().boundingBox;
  const beforeBounds = [
    ...bounds.minimumWorld.asArray(),
    ...bounds.maximumWorld.asArray(),
  ];
  const data = Object.fromEntries(
    mesh.getVerticesDataKinds().map((kind) => [
      kind,
      {
        buffer: mesh.getVertexBuffer(kind),
        hash: hash(new Float32Array(mesh.getVerticesData(kind)!)),
      },
    ]),
  );
  const indices = new Uint32Array(mesh.getIndices()!);
  try {
    const source = chunkStaticMesh(mesh)!;
    assert.equal(mesh.geometry, geometry);
    assert.equal(mesh.material, material);
    assert.equal(mesh.parent, null);
    assert.equal(mesh.subMeshes.length, 3);
    assert.ok(mesh.getIndices() instanceof Uint16Array);
    assert.equal(hash(source.indices), hash(indices));
    assert.equal(hash(restored(mesh)), hash(indices));
    for (const kind of mesh.getVerticesDataKinds()) {
      assert.equal(mesh.getVertexBuffer(kind), data[kind].buffer);
      assert.equal(
        hash(new Float32Array(mesh.getVerticesData(kind)!)),
        data[kind].hash,
      );
    }
    assert.deepEqual(Array.from(mesh.getWorldMatrix().asArray()), world);
    const after = mesh.getBoundingInfo().boundingBox;
    assert.deepEqual(
      [...after.minimumWorld.asArray(), ...after.maximumWorld.asArray()],
      beforeBounds,
    );
    assert.equal(mesh.metadata.depthCaster, "opaque");
    assert.equal(mesh.metadata.originalPolicy, "retained");
    assert.equal(chunkStaticMesh(mesh), source);
    assert.throws(() => chunkStaticMesh(mesh, 64), /cannot change/);
    mesh.dispose(false, false);
    assert.equal(staticChunkSource(mesh), undefined);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("shared geometry is rejected before mutation; single-cell geometry retains original index stream", () => {
  const { engine, scene } = fixture();
  const mesh = floor(scene),
    clone = mesh.clone("shared clone", null, true)!;
  const before = hash(new Uint32Array(mesh.getIndices()!));
  try {
    assert.throws(() => chunkStaticMesh(clone), /noninstanced/);
    assert.equal(hash(new Uint32Array(mesh.getIndices()!)), before);
    clone.dispose(false, false);
    const single = floor(scene, [2]);
    const singleBefore = hash(new Uint32Array(single.getIndices()!));
    chunkStaticMesh(single, 1000);
    assert.equal(hash(new Uint32Array(single.getIndices()!)), singleBefore);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("actual terrain builder keeps canonical floor triangles and bounds while native main dispatch clips distant static chunks", async () => {
  const { engine, scene } = fixture();
  try {
    const canonical = terrainMeshData(
      createTerrainTiles(GROUND_RECTS, TERRAIN_COVERAGE),
    );
    const { mesh } = buildTerrain({
      scene,
      rects: GROUND_RECTS,
      bounds: TERRAIN_COVERAGE,
    });
    assert.equal(
      hash(new Float32Array(mesh.getVerticesData("position")!)),
      hash(new Float32Array(canonical.positions)),
    );
    assert.equal(
      hash(new Float32Array(mesh.getVerticesData("normal")!)),
      hash(new Float32Array(canonical.normals)),
    );
    assert.equal(
      hash(new Float32Array(mesh.getVerticesData("uv")!)),
      hash(new Float32Array(canonical.uvs)),
    );
    assert.equal(
      hash(restored(mesh)),
      hash(new Uint32Array(canonical.indices)),
    );
    assert.equal(shadowCasterKind(mesh), false);
    const patches = floor(scene);
    chunkStaticMesh(patches);
    const drawn: number[] = [];
    patches.onBeforeRenderObservable.add((m) => {
      drawn.push(m.getTotalIndices());
    });
    await warm(scene);
    drawn.length = 0;
    scene.render();
    assert.equal(
      drawn.length,
      1,
      "normal Scene dispatches only the close patch, not the whole spanning mesh",
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("all twelve actual terrain/road/landcover outputs preserve their pre-chunk buffers and every original primitive", (context) => {
  const { engine, scene } = fixture();
  // The historical fixture retains the pre-CAD geometry hashes. CAD cutouts
  // and source entrance grades intentionally changed those inputs; compare
  // chunking to the actual builders' independent input snapshots instead.
  const delta = sourceFixture.terrain20261025;
  const names = new Set([
    ...sourceFixture.sources.map((source) => source.name),
    ...delta.addedMeshNames,
  ]);
  const originals = new Map<
    string,
    {
      mesh: Mesh;
      geometry: Mesh["geometry"];
      vertices: number;
      indices: Uint32Array;
      attributes: Map<
        string,
        { buffer: ReturnType<Mesh["getVertexBuffer"]>; values: Float32Array }
      >;
    }
  >();
  const freeze = Mesh.prototype.freezeWorldMatrix;
  // Each of these builders freezes its completed geometry immediately before
  // calling chunkStaticMesh. Capture before the chunker can alter or record it.
  const capture = context.mock.method(
    Mesh.prototype,
    "freezeWorldMatrix",
    function (this: Mesh, ...args: Parameters<Mesh["freezeWorldMatrix"]>) {
      const result = freeze.apply(this, args);
      if (names.has(this.name)) {
        assert.equal(
          staticChunkSource(this),
          undefined,
          this.name + " capture precedes chunking",
        );
        assert.equal(
          originals.has(this.name),
          false,
          this.name + " captured exactly once",
        );
        originals.set(this.name, {
          mesh: this,
          geometry: this.geometry,
          vertices: this.getTotalVertices(),
          indices: new Uint32Array(this.getIndices()!),
          attributes: new Map(
            this.getVerticesDataKinds().map((kind) => [
              kind,
              {
                buffer: this.getVertexBuffer(kind),
                values: new Float32Array(this.getVerticesData(kind)!),
              },
            ]),
          ),
        });
      }
      return result;
    },
  );
  try {
    buildTerrain({ scene, rects: GROUND_RECTS, bounds: TERRAIN_COVERAGE });
    buildLandcover(
      scene,
      new Set(buildCampusExteriorPlan().courts.map((court) => court.osmId)),
    );
    buildStreets({ scene, lights: [] });
    capture.mock.restore();
    assert.equal(names.size, 12);
    assert.deepEqual([...originals.keys()].sort(), [...names].sort());
    assert.deepEqual(
      scene.meshes
        .filter((mesh) => staticChunkSource(mesh as Mesh))
        .map((mesh) => mesh.name)
        .sort(),
      [...names].sort(),
    );
    for (const [name, expected] of originals) {
      const mesh = scene.getMeshByName(name) as Mesh;
      assert.equal(mesh, expected.mesh);
      assert.equal(mesh.geometry, expected.geometry);
      assert.equal(mesh.getTotalVertices(), expected.vertices);
      assert.equal(mesh.getTotalIndices(), expected.indices.length);
      const source = staticChunkSource(mesh);
      assert.ok(source, name + " retains source master");
      assert.equal(
        hash(source.indices),
        hash(expected.indices),
        name + " original master",
      );
      assert.equal(
        hash(restored(mesh)),
        hash(expected.indices),
        name + " exact original triangles/winding",
      );
      assert.deepEqual(
        mesh.getVerticesDataKinds().sort(),
        [...expected.attributes.keys()].sort(),
      );
      for (const [kind, attribute] of expected.attributes) {
        const data = new Float32Array(mesh.getVerticesData(kind)!);
        assert.equal(
          mesh.getVertexBuffer(kind),
          attribute.buffer,
          name + " " + kind + " buffer identity",
        );
        assert.equal(data.length, attribute.values.length);
        assert.equal(hash(data), hash(attribute.values), name + " " + kind);
      }
    }
    // Separate, current-input witnesses. The old pre-K5 snapshots above are
    // historical data, never stamped as if they described today's CAD terrain.
    for (const expected of [
      ...delta.soilSplit,
      { name: delta.referenceGrass.name, ...delta.referenceGrass.after },
    ]) {
      const actual = originals.get(expected.name)!;
      assert.equal(actual.vertices, expected.vertices, expected.name);
      assert.equal(
        actual.indices.length / 3,
        expected.triangles,
        expected.name,
      );
      assert.equal(
        hash(actual.indices),
        expected.indexValueSha256,
        expected.name,
      );
      for (const [kind, fixtureKey] of [
        ["position", "positions"],
        ["normal", "normals"],
        ["uv", "uvs"],
      ] as const) {
        const values = actual.attributes.get(kind)!.values,
          witness = expected.attributes[fixtureKey];
        assert.equal(values.length, witness.count, expected.name + " " + kind);
        assert.equal(
          hash(values),
          witness.float32Sha256,
          expected.name + " " + kind,
        );
      }
    }
    const grass = originals.get(delta.referenceGrass.name)!;
    // This is a campus-wide draped material layer. Its large elevation range
    // used to trigger the generic opaque-caster fallback, despite its 2.5 mm
    // offset above the canonical terrain. Keep the real mesh visible/receiving.
    const groundMesh = grass.mesh,
      metadata = groundMesh.metadata;
    const groundBounds = groundMesh.getBoundingInfo().boundingBox;
    assert.ok(
      groundBounds.maximumWorld.y - groundBounds.minimumWorld.y > 0.12,
      "actual landcover is tall enough to reproduce the former caster fallback",
    );
    assert.equal(metadata.shadowCaster, false);
    assert.equal(shadowCasterKind(groundMesh), false);
    assert.equal(groundMesh.isVisible, true);
    assert.equal(groundMesh.isEnabled(), true);
    assert.notEqual(
      metadata.receiveShadows,
      false,
      "normal shadow receiving remains enabled by Cinematic policy",
    );
    assert.equal(
      groundMesh.material!.disableDepthWrite,
      false,
      "not a depth-write workaround",
    );
    try {
      groundMesh.metadata = { ...metadata, shadowCaster: undefined };
      assert.equal(
        shadowCasterKind(groundMesh),
        "opaque",
        "without producer metadata this exact source mesh casts onto itself",
      );
    } finally {
      groundMesh.metadata = metadata;
    }
    assert.equal(shadowCasterKind(groundMesh), false);
    const before = delta.referenceGrass.before,
      after = delta.referenceGrass.after;
    assert.equal(
      after.vertices - before.vertices,
      delta.referenceGrass.addedVertices,
    );
    assert.equal(
      after.triangles - before.triangles,
      delta.referenceGrass.addedTriangles,
    );
    assert.deepEqual(
      grass.mesh.metadata.sourceFootprints
        .filter((source: { referenceId?: string }) => source.referenceId)
        .map((source: { id: string }) => source.id),
      delta.referenceGrass.referenceIds,
    );
    for (const [kind, fixtureKey] of [
      ["position", "positions"],
      ["normal", "normals"],
      ["uv", "uvs"],
    ] as const) {
      const witness = before.attributes[fixtureKey];
      assert.equal(
        hash(grass.attributes.get(kind)!.values.slice(0, witness.count)),
        witness.float32Sha256,
        "all original landcover " +
          kind +
          " bytes retained before the two appended references",
      );
    }
    assert.equal(
      hash(grass.indices.slice(0, before.triangles * 3)),
      before.indexValueSha256,
      "all original landcover indices retained before the two appended references",
    );
  } finally {
    capture.mock.restore();
    scene.dispose();
    engine.dispose();
  }
});

test("actual explicit shadow dispatch skips hidden tagged chunks and preserves every untagged callback result", async () => {
  const { engine, scene } = fixture(),
    mesh = floor(scene);
  chunkStaticMesh(mesh);
  const sun = new DirectionalLight("sun", new Vector3(0, -1, 0.1), scene);
  sun.position.set(3, 20, 3);
  sun.shadowFrustumSize = 20;
  sun.shadowMinZ = 0.1;
  sun.shadowMaxZ = 50;
  sun.autoCalcShadowZBounds = false;
  sun.autoUpdateExtends = false;
  const gen = new ShadowGenerator(128, sun),
    map = gen.getShadowMap()!;
  map.renderList = [mesh];
  let draws = 0;
  gen.onBeforeShadowMapRenderMeshObservable.add(() => draws++);
  try {
    await warm(scene);
    draws = 0;
    scene.render();
    assert.equal(
      draws,
      3,
      "explicit shadow list naively draws all three chunks",
    );
    installStaticSubmeshShadowCull(gen, shadowBoundsIntersectFrustum, 0.05);
    draws = 0;
    scene.render();
    assert.equal(
      draws,
      1,
      "same actual pass keeps close chunk and rejects both remote chunks",
    );
    const untagged = floor(scene);
    assert.equal(
      gen.customAllowRendering(untagged.subMeshes[0]),
      true,
      "untagged objects are never spatially filtered by this helper",
    );
    const instance = mesh.createInstance("future tagged source instance");
    instance.isVisible = true;
    instance.layerMask = 0;
    assert.ok(
      mesh.subMeshes.every((sub) => gen.customAllowRendering(sub)),
      "instanced sources retain original dispatch; their template bounds cannot be used to cull instances",
    );
    const oldPolicy = new ShadowGenerator(128, sun);
    oldPolicy.customAllowRendering = () => false;
    installStaticSubmeshShadowCull(
      oldPolicy,
      shadowBoundsIntersectFrustum,
      0.05,
    );
    assert.equal(oldPolicy.customAllowRendering(untagged.subMeshes[0]), false);
    oldPolicy.dispose();
  } finally {
    gen.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("Cinematic solar and 256/512 headlight generators install the tagged-only filter without changing caster policy", async () => {
  const { engine, scene, camera } = fixture(),
    mesh = floor(scene);
  chunkStaticMesh(mesh);
  const sun = new DirectionalLight("sun", new Vector3(0, -1, 0.1), scene);
  sun.intensity = 1;
  const atmosphere = new CinematicAtmosphere(scene, camera, sun);
  const root = new TransformNode("car", scene),
    headlight = new VehicleLighting(scene);
  try {
    atmosphere.update({
      dt: 0,
      player: { x: 3, y: 0, z: 3 },
      quality: "low",
      cloud: 0.4,
      daylight: 1,
    });
    await warm(scene);
    const solar = sun.getShadowGenerator()! as ShadowGenerator;
    assert.equal(mesh.metadata.depthCaster, "opaque");
    const solarVisible = mesh.subMeshes.filter((sub) =>
      solar.customAllowRendering(sub),
    );
    assert.equal(solarVisible.length, 1);
    headlight.update(root, 1, true, "medium");
    const spot = headlight.light.getShadowGenerator()! as ShadowGenerator;
    const callback = spot.customAllowRendering;
    assert.equal(typeof callback, "function");
    headlight.update(root, 1, true, "high");
    assert.equal(spot.customAllowRendering, callback);
    assert.equal(spot.mapSize, 512);
    headlight.update(root, 1, true, "low");
    assert.equal(headlight.light.shadowEnabled, false);
    const untagged = floor(scene);
    assert.equal(callback(untagged.subMeshes[0]), true);
    assert.equal(solar.customAllowRendering(untagged.subMeshes[0]), true);
  } finally {
    headlight.dispose();
    root.dispose();
    atmosphere.dispose();
    scene.dispose();
    engine.dispose();
  }
});
