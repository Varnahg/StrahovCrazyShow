import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { TreeLitter, TREE_LITTER_LIMITS, TREE_LITTER_CACHE_LIMIT, TREE_LITTER_LIFT, type TreeLitterSource } from "../client/tree-litter";
import { TreeWindPlugin } from "../client/tree-wind";
import { VehicleLighting } from "../client/vehicle-lighting";
import { GltfLightBudget } from "../client/gltf-light-budget";
import { TREES, BUILDINGS, MAP } from "../shared/world";
import { groundHeight } from "../shared/terrain";
import { placementClassifier } from "../shared/vegetation";
import { isStreetSurface } from "../shared/streets";
import { getTreeSeasonState } from "../shared/tree-season";
import components from "../shared/data/tree-leaf-components.json";
import "../client/render-shaders";

const winter = getTreeSeasonState(Date.UTC(2026, 0, 15), "demo"), summer = getTreeSeasonState(Date.UTC(2026, 6, 15), "demo");
function descriptor(id: string): TreeLitterSource {
  const source = TREES.find(t => t.osmId === id)!; assert.ok(source);
  let seed = 0; for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0;
  return { id, x: source.x, z: source.z, crownRadius: source.reconstruction!.crownDiameter / 2, seed,
    family: source.reconstruction!.appearance === "conifer" ? "evergreen-conifer" : source.reconstruction!.appearance === "bare" ? "reference-bare" : "deciduous-broadleaf" };
}
const source = descriptor("ipr-crown-014");
function fixture(t: TestContext, twig = true) {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 1, deterministicLockstep: false, lockstepMaxSteps: 4 });
  (engine as any)._webGLVersion = 2; (engine as any)._shaderPlatformName = "WEBGL2"; engine.getCaps().standardDerivatives = true;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const camera = new FreeCamera("fixed litter CPU view", new Vector3(source.x, groundHeight(source.x, source.z) + 1.7, source.z - 2), scene);
  camera.setTarget(new Vector3(source.x, groundHeight(source.x, source.z), source.z)); camera.minZ = .05;
  new HemisphericLight("common source light", Vector3.Up(), scene);
  const maps: Texture[] = []; let disposedMaps = 0;
  const material = (name: string) => {
    const m = new PBRMaterial(name, scene);
    const texture = (channel: string) => { const tx = new Texture("/fixture/" + name + "-" + channel + ".png", scene, false, false); tx.onDisposeObservable.add(() => disposedMaps++); maps.push(tx); return tx; };
    m.albedoTexture = texture("color"); m.opacityTexture = texture("opacity"); m.opacityTexture.getAlphaFromRGB = true;
    m.bumpTexture = texture("normal"); m.metallicTexture = texture("roughness"); m.alphaCutOff = .5;
    new TreeWindPlugin(m, { time: 0, x: 2, z: 0 });
    return m;
  };
  const leafMaterial = material("leaf"), twigMaterial = twig ? material("twig") : undefined;
  const load = t.mock.method(engine, "createTexture");
  const litter = new TreeLitter(scene, { leafMaterial, twigMaterial });
  let time = 0;
  const player = { x: source.x, y: groundHeight(source.x, source.z), z: source.z };
  const update = (quality = "medium", season = winter, increment = .25) => {
    litter.update({ time: time += increment, quality, player, season });
    const limit = TREE_LITTER_LIMITS[quality as keyof typeof TREE_LITTER_LIMITS];
    assert.ok(litter.stats.activeItems <= limit.items); assert.ok(litter.stats.triangles <= limit.triangles);
    assert.ok(litter.stats.activePatches <= limit.patches); assert.ok(litter.stats.cachedPatches <= TREE_LITTER_CACHE_LIMIT);
  };
  const warm = (quality = "medium", season = winter) => {
    for (let i = 0; i < 100; i++) { const before = litter.stats.generatedPatches; update(quality, season); assert.ok(litter.stats.generatedPatches - before <= 1); if (litter.stats.ready && !litter.stats.preparing) return; }
    assert.fail("Bounded litter selection must settle: " + JSON.stringify(litter.stats));
  };
  t.after(() => { litter.dispose(); scene.dispose(); engine.dispose(); });
  return { engine, scene, camera, maps, leafMaterial, twigMaterial, litter, player, update, warm, load, disposedMaps: () => disposedMaps };
}
const patches = (f: ReturnType<typeof fixture>) => f.scene.meshes.filter(m => m.metadata?.treeLitter && !m.metadata.litterPreparation);

test("actual source crown scatter is deterministic, terrain draped, hard-excluded and uses direct top-left UV", t => {
  const a = fixture(t), b = fixture(t); a.litter.setTrees([source]); b.litter.setTrees([source]); a.warm(); b.warm();
  assert.ok(a.litter.stats.activeItems > 0); assert.equal(a.load.mock.callCount(), 0);
  const ma = patches(a)[0], mb = patches(b)[0]; assert.ok(ma && mb);
  for (const kind of [VertexBuffer.PositionKind, VertexBuffer.NormalKind, VertexBuffer.UVKind, VertexBuffer.ColorKind])
    assert.deepEqual(ma.getVerticesData(kind), mb.getVerticesData(kind));
  assert.deepEqual(ma.getIndices(), mb.getIndices());
  const p = ma.getVerticesData(VertexBuffer.PositionKind)!, uv = ma.getVerticesData(VertexBuffer.UVKind)!, n = ma.getVerticesData(VertexBuffer.NormalKind)!;
  const allowed = placementClassifier(BUILDINGS, MAP.paths).tree;
  for (let i = 0; i < p.length; i += 3) {
    assert.ok(allowed(p[i], p[i + 2])); assert.equal(isStreetSurface(p[i], p[i + 2]), false);
    assert.ok(Math.hypot(p[i] - source.x, p[i + 2] - source.z) <= source.crownRadius + 1e-4);
    const lift = p[i + 1] - groundHeight(p[i], p[i + 2]); assert.ok(lift >= TREE_LITTER_LIFT - 1e-4 && lift <= TREE_LITTER_LIFT + .0021);
    assert.ok(n[i + 1] > 0);
  }
  const atlas = components.atlases.find(a => a.id === "LeafSet024")!;
  for (let item = 0; item < p.length / 15; item++) {
    const start = item * 10, u0 = uv[start], v0 = uv[start + 1], u1 = uv[start + 4], v1 = uv[start + 5];
    const component = atlas.components.find(c => Math.abs(c.boundsPixels[0] / 2048 - u0) < 1e-7 && Math.abs(c.boundsPixels[1] / 2048 - v0) < 1e-7 && Math.abs(c.boundsPixels[2] / 2048 - u1) < 1e-7 && Math.abs(c.boundsPixels[3] / 2048 - v1) < 1e-7);
    assert.ok(component, "UV must address the original top-left pixel box, not its vertical mirror");
    assert.equal(uv[start + 8], Math.fround((u0 + u1) / 2));
  }
  assert.equal(ma.metadata.sourceTreeId, source.id); assert.equal(ma.metadata.shadowCaster, false); assert.equal(ma.metadata.depthCaster, false);
  assert.equal(ma.receiveShadows, true); assert.equal(ma.hasVertexAlpha, false);
});

test("tier/season prefixes obey actual draw caps and stationary warm frames never rebuild or upload", t => {
  const f = fixture(t); f.litter.setTrees(TREES.map(t => descriptor(t.osmId))); f.warm("high");
  assert.ok(f.litter.stats.activeItems > 0);
  const internal = f.litter as any, generate = t.mock.method(internal, "geometry");
  const buffers = new Map(patches(f).map(m => [m.uniqueId, m.geometry!.getIndexBuffer()]));
  for (const quality of ["low", "medium", "high"] as const) {
    f.warm(quality);
    const actual = patches(f).filter(m => m.isEnabled()).reduce((n, m) => n + m.subMeshes[0].indexCount / 3, 0);
    assert.equal(f.litter.stats.triangles, actual);
  }
  const before = generate.mock.callCount();
  for (let i = 0; i < 120; i++) { f.litter.setTrees(TREES.map(t => descriptor(t.osmId))); f.update("high", winter, 1 / 60); }
  assert.equal(generate.mock.callCount(), before); assert.equal(f.litter.stats.preparing, false);
  for (const mesh of patches(f)) if (buffers.has(mesh.uniqueId)) assert.equal(mesh.geometry!.getIndexBuffer(), buffers.get(mesh.uniqueId));
  f.litter.setTrees([source]); f.warm("high", summer); assert.equal(f.litter.stats.activeItems, 0);
  const meshes = patches(f).slice(); f.warm("high", winter); assert.ok(f.litter.stats.activeItems > 0); assert.deepEqual(patches(f), meshes);
});

test("tiny positive seasonal supply and excluded crowns cannot create an endless warm preparation", t => {
  const f = fixture(t), neutral = { ...source, seed: 0 };
  const tiny = getTreeSeasonState(Date.UTC(2026, 4, 1, 12), "demo");
  assert.ok(tiny.groups["deciduous-broadleaf"].litterPotential > 0);
  f.litter.setTrees([neutral]); for (let i = 0; i < 40; i++) f.update("high", tiny);
  assert.equal(f.litter.stats.generatedPatches, 0); assert.equal(f.litter.stats.preparing, false);
  const allowed = placementClassifier(BUILDINGS, MAP.paths).tree;
  const building = BUILDINGS.find(b => {
    const x = b.points.reduce((sum, p) => sum + p[0], 0) / b.points.length, z = b.points.reduce((sum, p) => sum + p[1], 0) / b.points.length;
    return [[0, 0], [-2, -2], [2, -2], [2, 2], [-2, 2]].every(([dx, dz]) => !allowed(x + dx, z + dz));
  })!; assert.ok(building);
  const x = building.points.reduce((sum, p) => sum + p[0], 0) / building.points.length, z = building.points.reduce((sum, p) => sum + p[1], 0) / building.points.length;
  f.player.x = x; f.player.z = z; f.camera.position.set(x, groundHeight(x, z) + 2, z);
  f.litter.setTrees([{ id: "fixture-blocked-building", x, z, seed: 0, crownRadius: 1, family: "deciduous-broadleaf" }]);
  f.warm(); const generated = f.litter.stats.generatedPatches; assert.equal(generated, 1);
  for (let i = 0; i < 40; i++) f.update();
  assert.equal(f.litter.stats.generatedPatches, generated); assert.equal(f.litter.stats.activeItems, 0); assert.equal(f.litter.stats.preparing, false);
});

test("bounded cache eviction regenerates the same source geometry and source removal disposes it", t => {
  const f = fixture(t), sources = TREES.filter(t => t.reconstruction?.appearance === "broadleaf").map(t => descriptor(t.osmId));
  f.litter.setTrees(sources); f.warm("high");
  const first = patches(f).find(m => m.metadata.sourceTreeId === source.id)!; assert.ok(first);
  const expected = Array.from(first.getVerticesData(VertexBuffer.PositionKind)!);
  let max = 0;
  for (const tree of sources.slice(0, 35)) {
    Object.assign(f.player, { x: tree.x, y: groundHeight(tree.x, tree.z), z: tree.z });
    f.camera.position.set(tree.x, f.player.y + 2, tree.z - 2); f.warm("high"); max = Math.max(max, f.litter.stats.cachedPatches);
  }
  assert.equal(max, TREE_LITTER_CACHE_LIMIT); assert.equal(first.isDisposed(), true);
  Object.assign(f.player, { x: source.x, y: groundHeight(source.x, source.z), z: source.z });
  f.camera.position.set(source.x, f.player.y + 2, source.z - 2); f.warm("high");
  const rebuilt = patches(f).find(m => m.metadata.sourceTreeId === source.id)!;
  assert.ok(rebuilt); assert.deepEqual(Array.from(rebuilt.getVerticesData(VertexBuffer.PositionKind)!), expected);
  f.litter.setTrees([]); assert.equal(rebuilt.isDisposed(), true); assert.equal(f.litter.stats.cachedPatches, 0); assert.equal(f.litter.stats.triangles, 0);
});

test("conifer sources use only small twig atlas components and reference-bare has no invented litter", t => {
  const f = fixture(t), conifer = descriptor("ipr-b6-north-conifer");
  Object.assign(f.player, { x: conifer.x, y: groundHeight(conifer.x, conifer.z), z: conifer.z }); f.camera.position.set(conifer.x, f.player.y + 2, conifer.z - 2);
  f.litter.setTrees([conifer]); f.warm(); assert.ok(f.litter.stats.activeItems > 0);
  const mesh = patches(f)[0], p = mesh.getVerticesData(VertexBuffer.PositionKind)!, uv = mesh.getVerticesData(VertexBuffer.UVKind)!;
  assert.equal(mesh.metadata.kind, "twig"); assert.equal(mesh.metadata.sourceFamily, "evergreen-conifer");
  const atlas = components.atlases.find(a => a.id === "fir_tree_01")!;
  for (let i = 0; i < p.length / 15; i++) {
    const a = i * 15, u = i * 10;
    assert.ok(Math.hypot(p[a + 6] - p[a], p[a + 8] - p[a + 2]) < .15);
    assert.ok([4, 8].some(id => { const b = atlas.components.find(c => c.id === id)!.boundsPixels; return Math.abs(uv[u] - b[0] / 2048) < 1e-7 && Math.abs(uv[u + 1] - b[1] / 2048) < 1e-7; }));
  }
  f.litter.setTrees([{ ...source, family: "reference-bare" }]); f.warm(); assert.equal(f.litter.stats.activeItems, 0);
  const noTwig = fixture(t, false); noTwig.litter.setTrees([conifer]); noTwig.warm(); assert.equal(noTwig.litter.stats.activeItems, 0); assert.equal(noTwig.litter.stats.generatedPatches, 0);
});

test("preparation retains actual PBR branches, lease ownership and ordinary live frustum culling", async t => {
  const f = fixture(t), token = f.litter.preparationRevision;
  const stop = f.litter.beginPreparation(), newer = f.litter.beginPreparation(); stop();
  const helpers = f.scene.meshes.filter(m => m.metadata?.litterPreparation); assert.equal(helpers.length, 2); assert.ok(helpers.every(m => m.isEnabled()));
  for (let i = 0; i < 8; i++) { f.scene.render(); await turn(); }
  for (const mesh of helpers) {
    assert.ok(mesh.subMeshes[0].effect?.isReady()); const defines = mesh.subMeshes[0].materialDefines!.toString();
    for (const attribute of ["NORMAL", "UV1", "VERTEXCOLOR"]) assert.match(defines, new RegExp("^#define " + attribute + "$", "m"));
    assert.match(defines, /^#define ALPHATEST$/m);
    assert.doesNotMatch(defines, /^#define (VERTEXALPHA|ALPHABLEND|INSTANCES)$/m);
    assert.equal((mesh.material as PBRMaterial).pluginManager!.getPlugin("StrahovCleanTreeWind"), null);
  }
  newer(); assert.ok(helpers.every(m => !m.isEnabled())); assert.equal(f.litter.preparationRevision, token);
  f.litter.setTrees([source]); f.warm(); for (let i = 0; i < 5; i++) { f.scene.render(); await turn(); }
  const patch = patches(f)[0], helper = helpers.find(m => m.metadata.kind === "leaf")!;
  assert.equal(patch.subMeshes[0].materialDefines!.toString(), helper.subMeshes[0].materialDefines!.toString());
  f.camera.position.set(source.x, f.player.y + 3, source.z - 20); f.camera.setTarget(new Vector3(source.x, f.player.y + 3, source.z - 30));
  const planes = Frustum.GetPlanes(f.camera.getViewMatrix().multiply(f.camera.getProjectionMatrix()));
  assert.equal(patch.isInFrustum(planes), false, "renderer culling remains live without rebuilding scatter");
});

test("borrowed maps survive dispose, late readiness, source shutdown and partial construction failure", async t => {
  const f = fixture(t), sourceTextureCount = f.scene.textures.length;
  for (const map of f.maps) assert.ok(map.isReady());
  const materials = f.scene.materials.filter(m => m.metadata?.treeLitter);
  f.litter.setTrees([source]); f.warm(); f.litter.dispose(); f.litter.dispose();
  assert.equal(f.litter.preparationRevision, undefined); assert.equal(patches(f).length, 0);
  assert.equal(f.disposedMaps(), 0); assert.equal(f.scene.textures.length, sourceTextureCount);
  assert.ok(materials.every(m => !f.scene.materials.includes(m))); assert.ok(f.scene.materials.includes(f.leafMaterial));
  let ready = false; for (const map of f.maps) t.mock.method(map, "isReady", () => ready);
  const pending = new TreeLitter(f.scene, { leafMaterial: f.leafMaterial }); pending.setTrees([source]);
  pending.update({ time: 1, quality: "medium", player: f.player, season: winter }); assert.equal(pending.stats.ready, false);
  const stop = pending.beginPreparation(); pending.dispose(); ready = true; stop();
  pending.update({ time: 2, quality: "medium", player: f.player, season: winter });
  assert.equal(pending.stats.ready, false); assert.equal(pending.stats.cachedPatches, 0); assert.equal(f.disposedMaps(), 0);
  const attached = new TreeLitter(f.scene, { leafMaterial: f.leafMaterial });
  f.leafMaterial.dispose(false, false); assert.equal(attached.preparationRevision, undefined); assert.equal(f.disposedMaps(), 0);
  await turn();
  const other = fixture(t), baseline = other.scene.materials.length, meshes = other.scene.meshes.length;
  (other.twigMaterial!.opacityTexture as Texture).vScale = 2;
  assert.throws(() => new TreeLitter(other.scene, { leafMaterial: other.leafMaterial, twigMaterial: other.twigMaterial }), /top-left/);
  assert.equal(other.scene.materials.length, baseline); assert.equal(other.scene.meshes.length, meshes); assert.equal(other.disposedMaps(), 0);
});

test("leased prewarm follows the camera before cadence gates and prepares the real spotlight receiver branch", async t => {
  const f = fixture(t), beam = new VehicleLighting(f.scene, "player"), budget = new GltfLightBudget(f.scene);
  const stop = f.litter.beginPreparation(), helpers = f.scene.meshes.filter(m => m.metadata?.litterPreparation);
  const buffers = helpers.map(m => m.geometry!.getIndexBuffer());
  try {
    for (const [stage, x, z] of [[0, source.x, source.z - 2], [1, source.x + 30, source.z + 15]]) {
      f.camera.position.set(x, groundHeight(source.x, source.z) + 2, z);
      f.camera.setTarget(new Vector3(x + 1, f.camera.position.y - .3, z + 2));
      // The second call is within the ordinary selection cadence. Preparation
      // still follows this exact camera, with no static-patch rebuild.
      f.litter.update({ time: 1 + stage * .001, quality: "medium", player: f.player });
      const direction = new Vector3(1, -.3, 2).normalize();
      beam.updateFromPose(f.camera.globalPosition, direction, true, "low");
      for (let i = 0; i < 8; i++) { budget.prepareFrame(); f.scene.render(); await turn(); }
      const planes = Frustum.GetPlanes(f.camera.getViewMatrix().multiply(f.camera.getProjectionMatrix()));
      for (const helper of helpers) {
        const delta = helper.position.subtract(f.camera.globalPosition), distance = delta.length();
        assert.ok(distance > 1 && distance < 1.5); assert.ok(Vector3.Dot(delta.normalize(), direction) > .98);
        assert.ok(helper.isInFrustum(planes));
        assert.ok(Vector3.Distance(helper.getBoundingInfo().boundingBox.centerWorld, f.camera.globalPosition) < 1.5);
        assert.ok(helper.lightSources.includes(beam.light));
        assert.match(helper.subMeshes[0].materialDefines!.toString(), /^#define SPOTLIGHT\d+$/m);
      }
    }
    assert.deepEqual(helpers.map(m => m.geometry!.getIndexBuffer()), buffers);
    assert.equal(f.litter.stats.generatedPatches, 0);
    stop(); const fixed = helpers.map(m => m.position.asArray());
    f.camera.position.x += 10; f.litter.update({ time: 2, quality: "medium", player: f.player });
    assert.deepEqual(helpers.map(m => m.position.asArray()), fixed); assert.ok(helpers.every(m => !m.isEnabled()));
  } finally { stop(); budget.dispose(); beam.dispose(); }
});

test("source validation is transactional and source/quality metadata cannot trigger texture requests", t => {
  const f = fixture(t); f.litter.setTrees([source]); f.warm(); const first = patches(f)[0];
  for (const sources of [[source, source], [{ ...source, id: 1 as never }], [{ ...source, id: "" }], [{ ...source, crownRadius: NaN }], [{ ...source, seed: Infinity }], [{ ...source, family: "oak" as never }]])
    assert.throws(() => f.litter.setTrees(sources), RangeError);
  assert.equal(first.isDisposed(), false);
  f.litter.update({ time: NaN, quality: "high", player: f.player, season: winter }); assert.equal(first.isDisposed(), false);
  const moved = { ...source, x: source.x + .5 }; f.litter.setTrees([moved]); assert.equal(first.isDisposed(), true); f.warm();
  assert.ok(patches(f).every(m => m.metadata.sourceTreeId === moved.id)); assert.equal(f.load.mock.callCount(), 0);
});
