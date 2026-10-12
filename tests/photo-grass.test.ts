import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PhotographicGrass } from "../client/photographic-grass";
import {
  PhotoGrassBatch,
  type GrassRootState,
} from "../client/photo-grass-batch";
import { acquireGrassResources } from "../client/photo-grass-resources";
import {
  allocateGrassBudget,
  projectedLeafLevel,
  grassFocusDistance,
  grassRootId,
  CANDIDATE_GRASS_LIMITS,
  CANDIDATE_LOD_TRIANGLES,
  GRASS_LEVELS,
} from "../client/photo-grass-budget";
import { createPhotoGrassPlacement } from "../client/photo-grass-placement";
import {
  createPhotoGrassWindState,
  PhotoGrassWind,
} from "../client/photo-grass-wind";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import {
  grassVisibility,
  setGrassVisibility,
} from "../client/photo-grass-transition";
import { BUILDINGS, MAP } from "../shared/world";
import { placementClassifier } from "../shared/vegetation";
import { groundHeight, groundNormal } from "../shared/terrain";
import { isStreetSurface } from "../shared/streets";

const pack = JSON.parse(
  readFileSync("public/models/vegetation/grass/geometry.json", "utf8"),
);
const recipe = JSON.parse(
  readFileSync("public/models/vegetation/grass/material.json", "utf8"),
);
function fixture() {
  const engine = new NullEngine({
      renderWidth: 1280,
      renderHeight: 720,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
    }),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const x = 110.5,
    z = 34.5,
    y = groundHeight(x, z),
    camera = new UniversalCamera(
      "production leaf grass",
      new Vector3(x, y + 1.7, z),
      scene,
    );
  camera.minZ = 0.05;
  camera.fov = 0.8;
  camera.setTarget(new Vector3(x, y, z + 3));
  scene.render();
  const resources = acquireGrassResources(
      scene,
      pack,
      recipe,
      1024,
      () => new Texture(null, scene),
    ),
    grass = new PhotographicGrass(scene, pack, recipe, resources);
  return {
    engine,
    scene,
    camera,
    resources,
    grass,
    x,
    y,
    z,
    dispose() {
      grass.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
}
function submitted(scene: Scene) {
  return scene.meshes.filter(
    (mesh) => mesh.isEnabled() && mesh.metadata?.photographicGrass,
  );
}

test("accepted leaf derivatives match source hashes and far retains complete photographed leaves", () => {
  const sha = (path: string) =>
    createHash("sha256").update(readFileSync(path)).digest("hex");
  assert.equal(pack.schemaVersion, 2);
  assert.equal(
    pack.sourceBlendSha256,
    sha(
      "assets/sources/vegetation/grass_medium_01/derived/grass-authored-v2-study.blend",
    ),
  );
  assert.equal(
    pack.sourceGeometrySha256,
    sha(
      "assets/sources/vegetation/grass_medium_01/derived/grass-uv-aware-render-pack.json",
    ),
  );
  assert.deepEqual(
    GRASS_LEVELS.map((level) => pack.levels[level].triangles),
    [168, 84, 22],
  );
  assert.deepEqual([pack.textures.width, pack.textures.height], [1024, 512]);
  for (const entry of Object.values(pack.textures.files) as {
    file: string;
    sha256: string;
  }[])
    assert.equal(
      sha("public/textures/vegetation/grass/" + entry.file),
      entry.sha256,
    );
  const far = pack.levels.far,
    medium = pack.levels.medium;
  assert.equal(far.sourceLeafIds.length, 11);
  for (const [i, id] of far.sourceLeafIds.entries()) {
    assert.deepEqual(
      far.positions.slice(i * 12, i * 12 + 12),
      medium.positions.slice(id * 12, id * 12 + 12),
    );
    assert.deepEqual(
      far.uvs.slice(i * 8, i * 8 + 8),
      medium.uvs.slice(id * 8, id * 8 + 8),
    );
  }
});

test("root budget counts all three LODs without limiting coverage to draw-count tiles", () => {
  for (const quality of ["low", "medium", "high"] as const) {
    const demands = Array.from({ length: 16000 }, (_, i) => ({
        id: i,
        score: i,
        level: "far" as const,
      })),
      before = JSON.stringify(demands),
      result = allocateGrassBudget(demands, quality),
      limit = CANDIDATE_GRASS_LIMITS[quality];
    assert.ok(result.length > limit.draws * 160);
    assert.ok(
      result.reduce((n, r) => n + CANDIDATE_LOD_TRIANGLES[r.level], 0) <=
        limit.triangles,
    );
    assert.equal(JSON.stringify(demands), before);
    assert.deepEqual(allocateGrassBudget(demands, quality), result);
    assert.equal(
      limit.textureSize,
      1024,
      "High shares the actual atlas; no pretend upsampling",
    );
  }
  assert.equal(projectedLeafLevel(1, 720, 0.8), "near");
  assert.equal(projectedLeafLevel(3, 720, 0.8), "medium");
  assert.equal(projectedLeafLevel(10, 720, 0.8), "far");
  assert.equal(projectedLeafLevel(50, 720, 0.8), null);
  assert.notEqual(
    projectedLeafLevel(2, 360, 0.8),
    projectedLeafLevel(2, 1440, 0.8),
  );
});

test("five atlas maps, two materials and LOD geometry are shared while controller wind ownership stays separate", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  let created = 0;
  const factory = () => {
      created++;
      return new Texture(null, scene);
    },
    a = acquireGrassResources(scene, pack, recipe, 1024, factory),
    b = acquireGrassResources(scene, pack, recipe, 2048, factory);
  assert.equal(created, 5);
  assert.equal(a.textureSize, 1024);
  assert.equal(b.textureHeight, 512);
  assert.equal(a.maps.albedo, b.maps.albedo);
  assert.equal(a.material, b.material);
  assert.notEqual(a.materials.near, a.materials.medium);
  assert.equal(a.materials.medium, a.materials.far);
  assert.notEqual(a.wind, b.wind);
  const ma = a.clone("near", "ownerA"),
    mb = b.clone("near", "ownerB");
  assert.equal(ma.geometry, mb.geometry);
  assert.equal(ma.metadata.photoGrassWind, a.wind);
  assert.equal(mb.metadata.photoGrassWind, b.wind);
  a.release();
  assert.ok(ma.isDisposed());
  assert.equal(mb.isDisposed(), false);
  assert.ok(scene.textures.includes(b.maps.alpha));
  b.release();
  assert.equal(scene.meshes.length, 0);
  assert.deepEqual(
    scene.textures,
    [scene.environmentBRDFTexture],
    "Scene-owned BRDF survives an individual grass lease",
  );
  scene.dispose();
  assert.equal(scene.textures.length, 0);
  engine.dispose();
});

test("source exclusions, world-metre placement and bounded cache survive eviction", () => {
  const placement = createPhotoGrassPlacement(),
    classifier = placementClassifier(BUILDINGS, MAP.paths),
    tile = placement.tile(110, 34),
    before = Array.from(tile.matrices);
  assert.ok(tile.count > 100);
  for (let i = 0; i < tile.count; i++) {
    const a = tile.matrices.subarray(i * 16, i * 16 + 16),
      x = tile.x + a[12],
      z = tile.z + a[14],
      n = groundNormal(x, z);
    assert.equal(classifier.grass(x, z), true);
    assert.equal(isStreetSurface(x, z, 0.35), false);
    assert.ok(Math.abs(a[13] - groundHeight(x, z) - 0.0025) < 2e-5);
    for (const offset of [0, 4, 8])
      assert.ok(
        Math.abs(Math.hypot(a[offset], a[offset + 1], a[offset + 2]) - 1) <
          1e-6,
      );
    assert.ok(Math.hypot(a[4] - n.x, a[5] - n.y, a[6] - n.z) < 1e-5);
  }
  assert.equal(placement.classify(333.5, -109.5), false);
  assert.ok(placement.tile(333, -110).count >= 30);
  assert.equal(placement.mayContainGrass(333, -110), true);
  for (let i = 0; i < 180; i++) placement.tile(-800 - i, -800);
  assert.ok(placement.cacheSize <= 128);
  assert.deepEqual(Array.from(placement.tile(110, 34).matrices), before);
  placement.dispose();
  assert.equal(placement.cacheSize, 0);
});

test("batch append uploads the new count, compaction keeps native matrix snapshots and world bounds accurate", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    resources = acquireGrassResources(
      scene,
      pack,
      recipe,
      1024,
      () => new Texture(null, scene),
    ),
    batch = new PhotoGrassBatch("near", resources);
  const roots = [0, 1, 2].map((i) => ({
    id: i,
    tileId: "test",
    x: 110 + i,
    y: 2,
    z: 34,
    seed: 0.1 + i * 0.2,
    level: "near" as const,
    slot: 0,
    fade: { from: 0, to: 1, startedAt: 1 },
  }));
  const matrix = new Float32Array(Matrix.Identity().asArray());
  matrix[13] = 2;
  try {
    batch.add(roots[0], matrix, 0, 110, 34);
    batch.flush();
    assert.equal(batch.mesh.thinInstanceGetWorldMatrices().length, 1);
    const buffer = (batch.mesh as any)._thinInstanceDataStorage.matrixBuffer,
      original = buffer.updateDirectly.bind(buffer),
      counts: number[] = [];
    buffer.updateDirectly = (
      data: Float32Array,
      offset: number,
      count: number,
    ) => {
      counts.push(count);
      return original(data, offset, count);
    };
    batch.add(roots[1], matrix, 0, 111, 34);
    batch.flush();
    assert.equal(
      counts.at(-1),
      2,
      "New matrices must be uploaded before the new draw count is used",
    );
    assert.equal(batch.mesh.thinInstanceGetWorldMatrices().length, 2);
    assert.equal(batch.mesh.thinInstanceGetWorldMatrices()[1].m[12], 111);
    batch.add(roots[2], matrix, 0, 112, 34);
    batch.flush();
    batch.remove(roots[0]);
    batch.flush();
    assert.equal(batch.roots[0], roots[2]);
    assert.equal(batch.mesh.thinInstanceGetWorldMatrices().length, 2);
    assert.equal(batch.mesh.thinInstanceGetWorldMatrices()[0].m[12], 112);
    const bounds = batch.mesh.getBoundingInfo().boundingBox;
    assert.ok(bounds.minimumWorld.x > 110.5 && bounds.maximumWorld.x < 112.5);
    assert.ok(bounds.minimumWorld.z > 33.5 && bounds.maximumWorld.z < 34.5);
    assert.equal(
      batch.mesh.subMeshes[0].indexCount,
      pack.levels.near.indices.length,
    );
    assert.equal(
      batch.mesh.getVertexBuffer("photoGrassFade")!.getIsInstanced(),
      true,
    );
  } finally {
    batch.dispose();
    resources.release();
    scene.dispose();
    engine.dispose();
  }
});

test("production renderer batches many world tiles, retains meshes/roots and stays under caps through movement and high→low", () => {
  const f = fixture();
  let meshes: number[] = [];
  const seenIds = new Set<number>();
  let largestTileCount = 0;
  try {
    for (let frame = 0; frame < 180; frame++) {
      const quality = frame < 60 ? "medium" : frame < 120 ? "high" : "low",
        time = 1 + frame / 30;
      f.camera.position.x = f.x + Math.sin(frame * 0.035) * 0.6;
      f.camera.position.z = f.z + frame * 0.012;
      f.camera.position.y = f.y + (frame >= 60 && frame < 120 ? 0.45 : 1.7);
      f.camera.setTarget(
        new Vector3(f.camera.position.x, f.y, f.camera.position.z + 3),
      );
      f.grass.update({
        time,
        quality,
        wind: { x: 3, z: 0 },
        focus: { x: f.x, y: f.y, z: f.z + 1 },
      });
      const drawn = submitted(f.scene),
        limits = CANDIDATE_GRASS_LIMITS[quality];
      assert.ok(drawn.length <= 3 && drawn.length <= limits.draws);
      assert.equal(drawn.length, f.grass.stats.draws);
      assert.equal(
        drawn.reduce(
          (n, m) =>
            n + (m.getTotalIndices() / 3) * (m as any).thinInstanceCount,
          0,
        ),
        f.grass.stats.triangles,
      );
      assert.ok(f.grass.stats.triangles <= limits.triangles);
      largestTileCount = Math.max(largestTileCount, f.grass.stats.activeTiles);
      assert.ok(f.grass.stats.cachedTiles <= 256);
      assert.equal(f.grass.stats.textureResolution, 1024);
      assert.equal(f.grass.stats.textureHeight, 512);
      assert.equal("visibleLeaves" in f.grass.stats, false);
      const all = f.scene.meshes
        .filter((mesh) => mesh.metadata?.photographicGrass)
        .map((mesh) => mesh.uniqueId);
      if (!meshes.length) meshes = all;
      else
        assert.deepEqual(all, meshes, "No per-tile or per-frame mesh creation");
      for (const id of (f.grass as any).roots.keys()) seenIds.add(id);
    }
    assert.ok(
      largestTileCount > 12,
      "Coverage is no longer capped by twelve single-tile draws",
    );
    assert.ok(seenIds.size > 1000);
    assert.equal(f.scene.meshes.length, 6);
    assert.equal(f.resources.wind.windX, 3);
    assert.equal(f.resources.wind.focusX, f.x);
    assert.ok(f.grass.stats.submittedLeaves > 0);
  } finally {
    f.dispose();
  }
});

test("stationary frames finish fades without uploading every instance each frame; a camera turn preserves common root identities", () => {
  const f = fixture();
  try {
    f.grass.update({ time: 1, quality: "medium", wind: { x: 0, z: 0 } });
    const before = new Map<number, GrassRootState>((f.grass as any).roots);
    let uploads = 0;
    for (const mesh of submitted(f.scene)) {
      const original = (mesh as any).thinInstanceBufferUpdated.bind(mesh);
      (mesh as any).thinInstanceBufferUpdated = (kind: string) => {
        uploads++;
        original(kind);
      };
    }
    for (let frame = 1; frame <= 20; frame++)
      f.grass.update({
        time: 1 + frame / 60,
        quality: "medium",
        wind: { x: frame / 10, z: 0 },
      });
    assert.equal(uploads, 0);
    assert.equal(f.grass.stats.transitionRoots, 0);
    assert.equal(f.resources.wind.windX, 2);
    f.camera.setTarget(new Vector3(f.x + 0.2, f.y, f.z + 3));
    f.grass.update({ time: 2, quality: "medium", wind: { x: 2, z: 0 } });
    let common = 0;
    for (const [id, root] of (f.grass as any).roots as Map<
      number,
      GrassRootState
    >) {
      if (before.has(id)) {
        assert.equal(root, before.get(id));
        common++;
      }
    }
    assert.ok(common > 100);
  } finally {
    f.dispose();
  }
});

function deferredTextureScene() {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    pending: { url: string; resolve(): void; reject(): void }[] = [];
  const original = engine.createTexture.bind(engine);
  engine.createTexture = ((...args: any[]) => {
    // Control the five owned atlas loads, not Babylon's scene-owned BRDF.
    if (!String(args[0]).includes("lawn-leaf-v2-"))
      return (original as any)(...args);
    const success = args[5],
      failure = args[6];
    args[5] = null;
    args[6] = null;
    const texture = (original as any)(...args);
    texture.isReady = false;
    pending.push({
      url: args[0],
      resolve() {
        texture.isReady = true;
        success?.(texture);
      },
      reject() {
        failure?.("controlled texture failure");
      },
    });
    return texture;
  }) as any;
  return { engine, scene, pending };
}
test("shared pending atlas readiness/failure cannot be bypassed by a cache hit", async () => {
  const { engine, scene, pending } = deferredTextureScene(),
    a = new PhotographicGrass(scene, pack, recipe),
    b = new PhotographicGrass(scene, pack, recipe);
  const first = (a as any).loadResources().then(
    () => null,
    (error: Error) => error.message,
  );
  let finished = false;
  const second = (b as any).loadResources().then(
    () => {
      finished = true;
      return null;
    },
    (error: Error) => error.message,
  );
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(finished, false);
  assert.equal(a.stats.ready, false);
  assert.equal(b.stats.ready, false);
  assert.equal(pending.length, 5);
  pending[0].reject();
  for (const item of pending.slice(1)) item.resolve();
  assert.deepEqual(await Promise.all([first, second]), [
    "controlled texture failure",
    "controlled texture failure",
  ]);
  a.dispose();
  b.dispose();
  scene.dispose();
  engine.dispose();
});
test("repeated resource cycles and disposal during pending loading release maps and observers", async () => {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  acquireGrassResources(
    scene,
    pack,
    recipe,
    1024,
    () => new Texture(null, scene),
  ).release();
  await new Promise((r) => setTimeout(r, 0));
  const before = scene.onDisposeObservable.observers.length;
  for (let i = 0; i < 20; i++)
    acquireGrassResources(
      scene,
      pack,
      recipe,
      1024,
      () => new Texture(null, scene),
    ).release();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(scene.onDisposeObservable.observers.length, before);
  assert.equal(scene.meshes.length, 0);
  assert.deepEqual(scene.textures, [scene.environmentBRDFTexture]);
  scene.dispose();
  assert.equal(scene.textures.length, 0);
  engine.dispose();
  const pending = deferredTextureScene(),
    grass = new PhotographicGrass(pending.scene, pack, recipe),
    load = (grass as any).loadResources();
  grass.dispose();
  await load;
  assert.equal(grass.stats.ready, false);
  assert.equal(pending.scene.meshes.length, 0);
  assert.deepEqual(pending.scene.textures, [
    pending.scene.environmentBRDFTexture,
  ]);
  pending.scene.dispose();
  assert.equal(pending.scene.textures.length, 0);
  pending.engine.dispose();
});

test("fixed capsule range protects third-person foreground/player grass and root IDs do not collide", () => {
  assert.equal(grassFocusDistance(0, 0, 0, 0, 0, 12), 0);
  assert.equal(grassFocusDistance(0, 12, 0, 0, 0, 12), 0);
  assert.equal(grassFocusDistance(3, 6, 0, 0, 0, 12), 3);
  const ids = new Set<number>();
  for (let x = -10; x < 10; x++)
    for (let z = -10; z < 10; z++)
      for (let i = 0; i < 160; i++) {
        const id = grassRootId(x, z, i);
        assert.equal(ids.has(id), false);
        ids.add(id);
      }
  const a = { from: 1, to: 1, startedAt: 0 };
  setGrassVisibility(a, 0, 1);
  const midway = grassVisibility(a, 1.075);
  setGrassVisibility(a, 1, 1.075);
  assert.equal(grassVisibility(a, 1.075), midway);
  assert.equal(grassVisibility(a, 1.23), 1);
});

test("shared PBR hard bind uses each owner's current world-space fade and wind", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    material = new PBRMaterial("shared leaf wind", scene),
    fallback = createPhotoGrassWindState();
  new PhotoGrassWind(material, fallback);
  const a = MeshBuilder.CreateBox("ownerA", {}, scene),
    b = MeshBuilder.CreateBox("ownerB", {}, scene);
  a.material = b.material = material;
  a.metadata = { photoGrassWind: { ...fallback, viewerX: 11, windX: 2 } };
  b.metadata = { photoGrassWind: { ...fallback, viewerX: 27, windX: 5 } };
  const ubo = (material as any)._uniformBuffer,
    original3 = ubo.updateFloat3,
    original4 = ubo.updateFloat4,
    views: number[] = [],
    winds: number[] = [];
  ubo.updateFloat3 = (name: string, _time: number, x: number) => {
    if (name === "photoGrassWind") winds.push(x);
  };
  ubo.updateFloat4 = (name: string, x: number) => {
    if (name === "photoGrassView") views.push(x);
  };
  try {
    (material as any)._callbackPluginEventHardBindForSubMesh({
      subMesh: a.subMeshes[0],
    });
    (material as any)._callbackPluginEventHardBindForSubMesh({
      subMesh: b.subMeshes[0],
    });
    assert.deepEqual(views, [11, 27]);
    assert.deepEqual(winds, [2, 5]);
  } finally {
    ubo.updateFloat3 = original3;
    ubo.updateFloat4 = original4;
    scene.dispose();
    engine.dispose();
  }
});
