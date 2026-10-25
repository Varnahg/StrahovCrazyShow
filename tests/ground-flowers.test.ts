import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Material } from "@babylonjs/core/Materials/material";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { GroundFlowers, FLOWER_LIMITS, projectedFlowerLevel, validateFlowerPack, type FlowerPack } from "../client/ground-flowers";
import { createGroundFlowerPlacement, FLOWER_CACHE_LIMIT } from "../client/ground-flower-placement";
import { groundHeight } from "../shared/terrain";
import { sampleGroundCover, type GroundCoverSample } from "../shared/ground-cover";
import { PhotographicGrass } from "../client/photographic-grass";
import { acquireGrassResources } from "../client/photo-grass-resources";
import { CANDIDATE_GRASS_LIMITS, type CandidateQuality } from "../client/photo-grass-budget";

const pack = JSON.parse(readFileSync("public/models/vegetation/flowers/geometry.json", "utf8")) as FlowerPack;
const source = JSON.parse(readFileSync("assets/sources/vegetation/dandelion_01/source-manifest.json", "utf8"));
const fullCover: typeof sampleGroundCover = (_x, _z, out = {} as GroundCoverSample) => Object.assign(out, { variation: .5, grassDensity: 1, wear: 0, flowerDensity: 1 });
const dependencies = { cover: fullCover, allowed: () => true, height: groundHeight, normal: () => ({ x: 0, y: 1, z: 0 }) };
function fixture(t: TestContext) {
  const engine = new NullEngine({ renderWidth: 1260, renderHeight: 702, textureSize: 1, deterministicLockstep: false, lockstepMaxSteps: 4 });
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const x = 110.5, z = 34.5, y = groundHeight(x, z);
  const camera = new FreeCamera("fixed flower CPU view", new Vector3(x, y + 1.1, z), scene);
  camera.fov = .8; camera.minZ = .05; camera.setTarget(new Vector3(x, y, z + 3));
  let disposedTextures = 0;
  const flowers = new GroundFlowers(scene, pack, (channel) => {
    // NullEngine TextureIO adapter: ready backing texture, no browser/GPU.
    const texture = new Texture("/fixture-flower-" + channel + ".png", scene, false, false); texture.onDisposeObservable.addOnce(() => disposedTextures++);
    return { texture, ready: Promise.resolve() };
  }, createGroundFlowerPlacement(pack.radius, dependencies));
  t.after(() => { flowers.dispose(); scene.dispose(); engine.dispose(); });
  const frame = (time: number, quality: CandidateQuality = "medium") => flowers.update({ time, quality, wind: { x: 3, z: -2 }, focus: { x, y, z } });
  return { engine, scene, camera, flowers, x, y, z, frame, disposedTextures: () => disposedTextures };
}

test("small flower asset preserves original atlas bytes and records honest component/LOD derivation", () => {
  validateFlowerPack(pack);
  assert.equal(pack.levels.near.triangles, 60); assert.equal(pack.levels.far.triangles, 16);
  assert.ok(pack.height > .15 && pack.height < .17); assert.ok(pack.radius < .11);
  const audit = JSON.parse(readFileSync("assets/sources/vegetation/dandelion_01/derivation-audit.json", "utf8"));
  assert.equal(audit.runtimeGeometryId, pack.runtimeGeometryId);
  assert.ok(audit.farHeadMaximumDeviationMetres > .006 && audit.farHeadMaximumDeviationMetres < .008);
  assert.ok(audit.omittedSourceModifiers.some((m: { type: string }) => m.type === "DISPLACE"));
  for (const entry of Object.values(pack.textures)) {
    const bytes = readFileSync("public/textures/vegetation/flowers/" + entry.file);
    const original = source.files.find((f: { path: string }) => f.path.endsWith(entry.file));
    assert.equal(bytes.length, entry.bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
    assert.equal(createHash("md5").update(bytes).digest("hex"), original.md5);
    assert.deepEqual(original.pixelDimensions, [1024, 1024]);
    assert.deepEqual(bytes, readFileSync(original.path));
  }
  assert.equal(source.license, "CC0-1.0"); assert.match(source.interpretation, /not a Strahov botanical/);
  const invalid = structuredClone(pack); invalid.height = 50; assert.throws(() => validateFlowerPack(invalid));
});

test("flower roots are stable, terrain anchored, masked and retain whole-footprint hard exclusions", () => {
  let coverCalls = 0;
  const cover: typeof sampleGroundCover = (x, z, out) => { coverCalls++; return fullCover(x, z, out); };
  const p = createGroundFlowerPlacement(pack.radius, { ...dependencies, cover });
  const first = p.candidate(2, 3)!; assert.ok(first); assert.equal(p.candidate(2, 3), first); assert.equal(coverCalls, 1);
  assert.equal(first.matrix[12], Math.fround(first.x)); assert.equal(first.matrix[13], Math.fround(groundHeight(first.x, first.z) + .0025));
  const blocked = createGroundFlowerPlacement(pack.radius, { ...dependencies, allowed: (x, z) => Math.hypot(x - first.x, z - first.z) < .02 });
  assert.equal(blocked.candidate(2, 3), null, "centre alone cannot approve a footprint crossing a path");
  const masked = createGroundFlowerPlacement(pack.radius, { ...dependencies, cover: (x, z, out) => Object.assign(fullCover(x, z, out), { flowerDensity: 0 }) });
  assert.equal(masked.candidate(2, 3), null);
  for (let i = 0; i < FLOWER_CACHE_LIMIT + 10; i++) p.candidate(i, 0);
  assert.equal(p.size, FLOWER_CACHE_LIMIT); assert.deepEqual(p.candidate(2, 3), first, "eviction cannot change a world root");
  p.dispose(); blocked.dispose(); masked.dispose(); assert.equal(p.size, 0);
});

test("flower LOD uses the head projection with hysteresis and rejects invalid inputs", () => {
  assert.equal(projectedFlowerLevel(.03, 1, 702, .8), "near");
  assert.equal(projectedFlowerLevel(.03, 8, 702, .8), "far");
  assert.equal(projectedFlowerLevel(.03, 80, 702, .8), null);
  assert.equal(projectedFlowerLevel(.03, 0, 702, .8), null);
  const distance = .03 * 702 / (2 * Math.tan(.4) * 5.5);
  assert.equal(projectedFlowerLevel(.03, distance, 702, .8), "far");
  assert.equal(projectedFlowerLevel(.03, distance, 702, .8, "near"), "near");
});

test("actual thin batches stay bounded across tiers and stable views do not upload again", async t => {
  const f = fixture(t); await f.flowers.ready;
  const materialCount = f.scene.materials.length, textureCount = f.scene.textures.length;
  let uploads = 0;
  let closest: number | undefined;
  for (const b of (f.flowers as any).batches.values()) {
    const original = b.mesh.thinInstanceBufferUpdated.bind(b.mesh);
    b.mesh.thinInstanceBufferUpdated = (...args: [string]) => { uploads++; original(...args); };
  }
  for (const [stage, quality] of (["high", "low", "medium"] as const).entries()) {
    for (let i = 0; i < 20; i++) {
      f.frame(stage * 2 + i * .1, quality);
      if (quality === "low" && i === 0) assert.ok((f.flowers as any).roots.has(closest), "downgrade preserves the closest requested flower");
    }
    if (quality === "high") closest = [...(f.flowers as any).roots.values()]
      .sort((a: any, b: any) => Math.hypot(a.x - f.x, a.z - f.z) - Math.hypot(b.x - f.x, b.z - f.z))[0].id;
    const s = f.flowers.stats;
    assert.ok(s.instances > 0); assert.ok(s.instances <= FLOWER_LIMITS[quality].roots);
    assert.ok(s.triangles <= FLOWER_LIMITS[quality].triangles); assert.ok(s.draws <= 2); assert.equal(s.preparing, false);
    let actual = 0;
    for (const b of (f.flowers as any).batches.values()) {
      actual += b.mesh.thinInstanceCount * b.mesh.getTotalIndices() / 3;
      for (const r of b.roots) assert.ok(b.mesh.getBoundingInfo().boundingBox.minimum.y <= r.y && b.mesh.getBoundingInfo().boundingBox.maximum.y >= r.y + pack.height);
    }
    assert.equal(actual, s.triangles);
  }
  const before = uploads; for (let i = 0; i < 30; i++) f.frame(10 + i * .1);
  assert.equal(uploads, before); assert.ok(f.flowers.stats.cachedTiles <= FLOWER_CACHE_LIMIT);
  assert.equal(f.scene.materials.length, materialCount); assert.equal(f.scene.textures.length, textureCount);
});

test("grass and flower transitions share the existing whole vegetation triangle cap", async t => {
  t.mock.method(performance, "now", () => 0);
  const f = fixture(t); await f.flowers.ready;
  const grassPack = JSON.parse(readFileSync("public/models/vegetation/grass/geometry.json", "utf8"));
  const recipe = JSON.parse(readFileSync("public/models/vegetation/grass/material.json", "utf8"));
  const lease = acquireGrassResources(f.scene, grassPack, recipe, 1024, () => new Texture(null, f.scene));
  const grass = new PhotographicGrass(f.scene, grassPack, recipe, lease, f.flowers);
  try {
    for (let i = 0; i < 160; i++) {
      const quality = i < 80 ? "high" : "low";
      grass.update({ time: i * .03, quality, wind: { x: 0, z: 0 }, focus: { x: f.x, y: f.y, z: f.z } });
      const actual = f.scene.meshes.filter(m => m.isEnabled() && m.isVisible && (m.metadata?.groundFlowers || m.metadata?.photographicGrass))
        .reduce((n, m) => n + m.getTotalIndices() / 3 * (m as import("@babylonjs/core/Meshes/mesh").Mesh).thinInstanceCount, 0);
      assert.equal(grass.stats.triangles, actual); assert.ok(actual <= CANDIDATE_GRASS_LIMITS[quality].triangles);
    }
    assert.ok(grass.stats.flowers!.instances > 0); assert.ok(grass.stats.instances > 0);
    const live = [...(f.flowers as any).batches.values()].map((b: any) => b.mesh.getVertexBuffer("world0"));
    const stop = grass.beginShaderPreparation()!, newer = grass.beginShaderPreparation()!; stop();
    const helper = f.scene.meshes.find(m => m.metadata?.flowerPreparation)!;
    assert.equal(helper.isEnabled(), true); newer(); assert.equal(helper.isEnabled(), false);
    assert.deepEqual([...(f.flowers as any).batches.values()].map((b: any) => b.mesh.getVertexBuffer("world0")), live);
  } finally { grass.dispose(); }
  assert.equal(f.disposedTextures(), 4); assert.equal(f.flowers.stats.ready, false);
});

test("flower selection holds subpixel translation but preserves live uniforms and accumulated motion", async t => {
  const f = fixture(t); await f.flowers.ready;
  for (let i = 0; i < 20; i++) f.frame(i * .1);
  assert.ok(f.flowers.stats.instances > 0); assert.equal(f.flowers.stats.preparing, false);
  const internal = f.flowers as any, origin = f.camera.position.clone(), focus = { x: f.x, y: f.y, z: f.z };
  const select = t.mock.method(internal, "select"); let uploads = 0;
  for (const batch of internal.batches.values()) {
    const original = batch.mesh.thinInstanceBufferUpdated.bind(batch.mesh);
    t.mock.method(batch.mesh, "thinInstanceBufferUpdated", (...args: [string]) => { uploads++; return original(...args); });
  }
  for (let frame = 0; frame < 120; frame++) {
    const dx = frame % 2 === 0 ? .00001 : -.00001;
    f.camera.position.x = origin.x + dx; focus.x = f.x + dx;
    f.flowers.update({ time: 3 + frame / 60, quality: "medium", wind: { x: 3, z: -2 }, focus });
    assert.equal(f.flowers.stats.preparing, false);
    assert.equal(internal.wind.viewerX, f.camera.globalPosition.x); assert.equal(internal.wind.focusX, focus.x);
  }
  assert.equal(select.mock.callCount(), 0); assert.equal(uploads, 0);
  f.camera.position.x = origin.x + .0021; focus.x = f.x + .0021;
  f.flowers.update({ time: 5.1, quality: "medium", wind: { x: 3, z: -2 }, focus });
  assert.equal(select.mock.callCount(), 1);
  // Projection is exact, but ordinary updates retain the existing .15s cadence.
  f.camera.minZ += .001;
  f.flowers.update({ time: 5.101, quality: "medium", wind: { x: 3, z: -2 }, focus });
  assert.equal(select.mock.callCount(), 1);
  f.flowers.update({ time: 5.26, quality: "medium", wind: { x: 3, z: -2 }, focus });
  assert.equal(select.mock.callCount(), 2);
});

test("PhotographicGrass.load attaches live source-masked flowers in the fixed B6 rear view", async t => {
  t.mock.method(performance, "now", () => 0);
  const engine = new NullEngine({ renderWidth: 1260, renderHeight: 702, textureSize: 1, deterministicLockstep: false, lockstepMaxSteps: 4 });
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const x = 36, z = -64, y = groundHeight(x, z);
  const camera = new FreeCamera("fixed rear B6 loader proof", new Vector3(x, y + 1.7, z), scene);
  camera.fov = .8; camera.minZ = .05;
  camera.setTarget(new Vector3(29.24, groundHeight(29.24, z) + .05, z));
  const initialCameraPosition = camera.position.clone();
  const requested: string[] = [], loadedTextures: string[] = [];
  const expected = ["/models/vegetation/grass/geometry.json", "/models/vegetation/grass/material.json", "/models/vegetation/flowers/geometry.json"];
  // Replace only the HTTP boundary. Production load methods, resource owners,
  // material construction, source placement, selection and budgets all run.
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = String(input); assert.ok(expected.includes(url), "Unexpected asset request: " + url);
    requested.push(url);
    return new Response(readFileSync("public" + url, "utf8"), { headers: { "Content-Type": "application/json" } });
  });
  const createTexture = engine.createTexture.bind(engine);
  t.mock.method(engine, "createTexture", (...args: Parameters<NullEngine["createTexture"]>) => {
    const url = String(args[0]);
    if (url.startsWith("/textures/vegetation/")) {
      assert.ok(readFileSync("public" + url).length > 0);
      loadedTextures.push(url);
    }
    // NullEngine supplies ready backing textures and the real async onLoad
    // callback. No Texture class, loader or plant controller is substituted.
    return createTexture(...args);
  });
  let grass: PhotographicGrass | undefined;
  try {
    grass = await PhotographicGrass.load(scene);
    assert.deepEqual(requested.slice().sort(), expected.slice().sort());
    assert.equal(loadedTextures.filter(url => url.startsWith("/textures/vegetation/flowers/")).length, 4);
    assert.equal(loadedTextures.filter(url => url.startsWith("/textures/vegetation/grass/")).length, 5);
    assert.equal(grass.stats.ready, true); assert.equal(grass.stats.flowers?.ready, true);
    for (let frame = 0; frame < 1000; frame++) {
      grass.update({ time: frame / 60, quality: "medium", wind: { x: 1, z: 0 }, focus: { x, y, z } });
      assert.ok(grass.stats.triangles <= CANDIDATE_GRASS_LIMITS.medium.triangles);
      if (!grass.stats.preparing && !grass.stats.transitionRoots) break;
    }
    assert.equal(grass.stats.preparing, false); assert.equal(grass.stats.pendingTiles, 0);
    assert.ok(grass.stats.instances > 0); assert.ok(grass.stats.flowers!.instances > 0);
    const submitted = scene.meshes.filter(mesh => mesh.isEnabled() && mesh.isVisible && (mesh.metadata?.groundFlowers || mesh.metadata?.photographicGrass));
    const actualTriangles = submitted.reduce((total, mesh) => total + mesh.getTotalIndices() / 3 *
      (mesh as import("@babylonjs/core/Meshes/mesh").Mesh).thinInstanceCount, 0);
    assert.equal(grass.stats.triangles, actualTriangles);
    const flowerMeshes = submitted.filter(mesh => mesh.metadata?.groundFlowers);
    const positions = flowerMeshes.flatMap(mesh => (mesh as import("@babylonjs/core/Meshes/mesh").Mesh).thinInstanceGetWorldMatrices());
    assert.equal(positions.length, grass.stats.flowers!.instances);
    assert.ok(positions.every(matrix => sampleGroundCover(matrix.m[12], matrix.m[14]).flowerDensity > 0));
    assert.deepEqual(camera.position, initialCameraPosition);
  } finally { grass?.dispose(); scene.dispose(); engine.dispose(); }
});

test("flower preparation owns an actual isolated thin draw and cleanup is idempotent", async t => {
  const f = fixture(t); await f.flowers.ready;
  const stop = f.flowers.beginPreparation(), helper = (f.flowers as any).helper.mesh;
  assert.equal(helper.thinInstanceCount, 1); assert.notEqual(helper.geometry, (f.flowers as any).sources.get("far").geometry);
  assert.equal(helper.sideOrientation, Material.CounterClockWiseSideOrientation);
  let thinDraws = 0; const draw = helper._renderWithThinInstances;
  helper._renderWithThinInstances = function (...args: unknown[]) { thinDraws++; return Reflect.apply(draw, this, args); };
  for (let i = 0; i < 6; i++) { f.scene.render(); await new Promise(resolve => setImmediate(resolve)); }
  assert.ok(thinDraws > 0, "CPU branch proof only, never GPU acceptance");
  assert.match(helper.subMeshes[0].effect.defines, /#define THIN_INSTANCES/);
  stop(); assert.equal(helper.isEnabled(), false); assert.equal(helper.isDisposed(), false);
  f.flowers.dispose(); stop(); f.flowers.dispose(); assert.equal(f.disposedTextures(), 4);
  assert.equal(helper.isDisposed(), true);
});

test("partial texture construction failure disposes only owned sources", t => {
  const f = fixture(t); let created = 0, disposed = 0; const before = f.scene.meshes.length;
  assert.throws(() => new GroundFlowers(f.scene, pack, () => {
    if (++created === 3) throw Error("source texture fixture failure");
    const texture = new Texture(null, f.scene); texture.onDisposeObservable.addOnce(() => disposed++);
    return { texture, ready: Promise.resolve() };
  }), /fixture failure/);
  assert.equal(disposed, 2); assert.equal(f.scene.meshes.length, before);
});

test("failed preparation clone releases its partial geometry and can retry", async t => {
  const f = fixture(t); await f.flowers.ready;
  const source = (f.flowers as any).sources.get("far"), clone = source.clone.bind(source), before = f.scene.meshes.length;
  let partial: import("@babylonjs/core/Meshes/mesh").Mesh | undefined;
  source.clone = (...args: unknown[]) => { partial = clone(...args); partial!.makeGeometryUnique = () => { throw Error("fixture unique geometry failure"); }; return partial; };
  assert.throws(() => f.flowers.beginPreparation(), /fixture unique geometry failure/);
  assert.ok(partial!.isDisposed()); assert.equal(f.scene.meshes.length, before); assert.equal(f.disposedTextures(), 0);
  source.clone = clone; const stop = f.flowers.beginPreparation(); stop();
});

test("scene disposal aborts flower geometry loading before any late resources can be installed", async t => {
  const engine = new NullEngine(), scene = new Scene(engine);
  t.mock.method(globalThis, "fetch", (_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener("abort", () => reject(Error("fixture aborted")), { once: true });
  }));
  const pending = GroundFlowers.load(scene); scene.dispose();
  await assert.rejects(pending, /fixture aborted/);
  assert.equal(scene.meshes.length, 0); engine.dispose();
});
