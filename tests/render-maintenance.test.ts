import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Frustum } from "@babylonjs/core/Maths/math.frustum";
import {
  CinematicAtmosphere,
  shadowBoundsIntersectFrustum,
} from "../client/cinematic";
import { SurfacePack } from "../client/surface-pack";
import { captureRenderCostInventory } from "../client/render-cost";
import {
  InternalTexture,
  InternalTextureSource,
} from "@babylonjs/core/Materials/Textures/internalTexture";

// NullEngine implements raw 2D textures but not raw cube upload. Supply only
// that GPU resource stub; every scene/light/matrix/list below is real Babylon.
class CpuSceneEngine extends NullEngine {
  override createRawCubeTexture(
    ...args: Parameters<NullEngine["createRawCubeTexture"]>
  ) {
    const texture = new InternalTexture(this, InternalTextureSource.CubeRaw);
    texture.isCube = true;
    texture.width =
      texture.height =
      texture.baseWidth =
      texture.baseHeight =
        args[1];
    texture.isReady = true;
    return texture;
  }
}

function fixture(t: import("node:test").TestContext) {
  const engine = new CpuSceneEngine(),
    scene = new Scene(engine);
  scene.useDelayedTextureLoading = true;
  scene.useRightHandedSystem = true;
  const camera = new UniversalCamera("camera", new Vector3(0, 3, -5), scene);
  camera.setTarget(Vector3.Zero());
  scene.activeCamera = camera;
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return { scene, camera };
}
const turn = () => new Promise<void>((resolve) => setTimeout(resolve, 5));

test("surface maintenance visits changed meshes only and still catches async/material reassignment", async (t) => {
  const { scene } = fixture(t);
  const pack = new SurfacePack(scene);
  const source = new StandardMaterial("asphalt", scene);
  source.metadata = { surfaceKind: "asphalt", uvMetresPerRepeat: 4 };
  const meshes = Array.from({ length: 120 }, (_, i) => {
    const mesh = MeshBuilder.CreateBox("late pavement " + i, {}, scene);
    mesh.material = source;
    return mesh;
  });
  await turn();
  pack.update(1, "high", 2);
  assert.ok(meshes.every((mesh) => mesh.material instanceof PBRMaterial));
  assert.equal(new Set(meshes.map((mesh) => mesh.material)).size, 1);
  const wet = (meshes[0].material as PBRMaterial).albedoColor.clone();
  const first = { ...pack.stats };
  for (let i = 0; i < 120; i++) pack.update(1 / 60, "high", 2);
  assert.equal(
    pack.stats.meshVisits,
    first.meshVisits,
    "steady scene must not rescan 120 meshes",
  );
  assert.equal(
    pack.stats.materialUpdates,
    first.materialUpdates,
    "unchanged rain/quality must not rewrite PBR uniforms",
  );
  const replacement = new StandardMaterial("replacement plaster", scene);
  replacement.metadata = { surfaceKind: "plaster" };
  meshes[0].material = replacement;
  pack.update(1, "low", 0);
  assert.ok(meshes[0].material instanceof PBRMaterial);
  assert.equal((meshes[0].material as PBRMaterial).disableBumpMap, true);
  assert.equal(pack.stats.meshVisits - first.meshVisits, 1);
  assert.ok(!(meshes[1].material as PBRMaterial).albedoColor.equals(wet));
  const shared = new MultiMaterial("late shared multi", scene);
  shared.subMaterials = [source, replacement];
  const late = MeshBuilder.CreateBox("async multi", {}, scene);
  late.material = shared;
  await turn();
  pack.update(1, "high", 2);
  assert.ok(
    shared.subMaterials.every((material) => material instanceof PBRMaterial),
  );
  assert.equal((shared.subMaterials[1] as PBRMaterial).disableBumpMap, false);
  const addedObserverCount = scene.onNewMeshAddedObservable.observers.length;
  pack.dispose();
  await turn();
  assert.equal(
    scene.onNewMeshAddedObservable.observers.length,
    addedObserverCount - 1,
  );
  assert.equal(meshes[0].material, replacement);
  assert.equal(shared.subMaterials[0], source);
  assert.equal(shared.subMaterials[1], replacement);
});

test("shadow draw callback uses actual light frustum, keeps crossing boxes and switches disabled LOD immediately", (t) => {
  const { scene, camera } = fixture(t);
  const sun = new DirectionalLight("sun", new Vector3(0, -1, 0.00001), scene);
  sun.intensity = 1;
  const material = new StandardMaterial("opaque", scene);
  const box = (name: string, x: number, width = 2) => {
    const mesh = MeshBuilder.CreateBox(
      name,
      { width, height: 4, depth: 4 },
      scene,
    );
    mesh.position.set(x, 2, 0);
    mesh.material = material;
    mesh.metadata = { depthCaster: "opaque" };
    mesh.computeWorldMatrix(true);
    return mesh;
  };
  const inside = box("inside", 0),
    outside = box("outside but within 85m", 70),
    crossing = box("crossing", 38, 12);
  const lod = box("new LOD", 0);
  lod.setEnabled(false);
  const atmosphere = new CinematicAtmosphere(scene, camera, sun);
  t.after(() => atmosphere.dispose());
  const input = {
    dt: 0,
    player: { x: 0, y: 0, z: 0 },
    quality: "low",
    cloud: 0,
    daylight: 1,
  };
  atmosphere.update(input);
  const generator = sun.getShadowGenerator()!;
  const filter = () => {
    scene.incrementRenderId();
    const map = generator.getShadowMap()!;
    return [
      ...map.getCustomRenderList!(0, map.renderList!, map.renderList!.length)!,
    ];
  };
  const names = () =>
    filter()
      .map((mesh) => mesh.name)
      .sort();
  assert.deepEqual(names(), [inside.name, crossing.name].sort());
  assert.equal(atmosphere.stats.shadowFrustumRejected, 1);
  assert.equal(atmosphere.stats.shadowInactiveRejected, 1);
  inside.setEnabled(false);
  lod.setEnabled(true);
  assert.deepEqual(names(), [lod.name, crossing.name].sort());
  atmosphere.update({
    ...input,
    player: { x: 70, y: 0, z: 0 },
    quality: "high",
  });
  assert.ok(
    generator.getShadowMap()!.getCustomRenderList,
    "map resize must preserve culling callback",
  );
  assert.deepEqual(names(), [outside.name, crossing.name].sort());
  const visits = atmosphere.stats.selectionMeshVisits;
  for (let i = 0; i < 20; i++)
    atmosphere.update({ ...input, quality: "high", dt: 0.1, daylight: 0 });
  assert.equal(
    atmosphere.stats.selectionMeshVisits,
    visits,
    "night does not rebuild solar caster lists",
  );
  assert.equal(sun.shadowEnabled, false);
  assert.deepEqual(filter(), []);
  atmosphere.update({ ...input, quality: "high" });
  assert.equal(sun.shadowEnabled, true);
  assert.ok(filter().includes(lod), "dawn must refresh immediately");
});

test("conservative shadow AABB culling agrees with real Babylon frusta and protects wind margin", (t) => {
  const { scene, camera } = fixture(t);
  const sun = new DirectionalLight("sun", new Vector3(0.3, -0.7, 0.5), scene);
  const atmosphere = new CinematicAtmosphere(scene, camera, sun);
  t.after(() => atmosphere.dispose());
  atmosphere.update({
    dt: 0,
    player: { x: 0, y: 0, z: 0 },
    quality: "low",
    cloud: 0,
    daylight: 1,
  });
  const planes = Frustum.GetPlanes(
    sun.getShadowGenerator()!.getTransformMatrix(),
  );
  for (let x = -90; x <= 90; x += 5) {
    for (let z = -90; z <= 90; z += 5) {
      const point = new Vector3(x, 4, z);
      assert.equal(
        shadowBoundsIntersectFrustum(point, point, planes),
        Frustum.IsPointInFrustum(point, planes),
      );
    }
  }
  const plane = planes[2];
  const edge = plane.normal.scale(-plane.d).subtract(plane.normal.scale(0.25));
  assert.equal(shadowBoundsIntersectFrustum(edge, edge, [plane]), false);
  assert.equal(shadowBoundsIntersectFrustum(edge, edge, [plane], 0.5), true);
});

test("glass maintenance catches late B6 material once and removes its scene observers", async (t) => {
  const { scene, camera } = fixture(t);
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  const atmosphere = new CinematicAtmosphere(scene, camera, sun);
  const glass = new StandardMaterial("late B6 glazing", scene);
  glass.metadata = { realityGlass: true, block: 6 };
  glass.alpha = 0.32;
  const exterior = new StandardMaterial("late opaque facade glazing", scene);
  exterior.metadata = { exteriorOnlyGlass: true };
  await turn();
  const input = {
    dt: 0.1,
    player: { x: 0, y: 0, z: 0 },
    quality: "low",
    cloud: 0,
    daylight: 0,
  };
  atmosphere.update(input);
  assert.equal(glass.reflectionTexture, scene.environmentTexture);
  assert.equal(exterior.reflectionTexture, scene.environmentTexture);
  assert.ok(!exterior.needAlphaBlending());
  const count = atmosphere.stats.glassVisits;
  for (let i = 0; i < 20; i++) atmosphere.update(input);
  assert.equal(atmosphere.stats.glassVisits, count);
  assert.equal(glass.alpha, 0.32);
  const added = scene.onNewMaterialAddedObservable.observers.length;
  atmosphere.dispose();
  await turn();
  assert.equal(scene.onNewMaterialAddedObservable.observers.length, added - 1);
  assert.equal(glass.reflectionTexture, null);
  assert.equal(exterior.reflectionTexture, null);
});

test("structural render inventory separates shared geometry, disabled LOD and light assignments", (t) => {
  const { scene } = fixture(t);
  const material = new StandardMaterial("shared", scene);
  const source = MeshBuilder.CreateBox("geometry source", {}, scene);
  source.material = material;
  source.isVisible = false;
  const active = source.createInstance("visible instance");
  active.isVisible = true;
  const hidden = source.createInstance("disabled LOD");
  hidden.isVisible = true;
  hidden.setEnabled(false);
  const light = new DirectionalLight(
    "disabled source light",
    Vector3.Down(),
    scene,
  );
  light.setEnabled(false);
  const cost = captureRenderCostInventory(scene);
  assert.equal(cost.registeredMeshes, 3);
  assert.equal(cost.uniqueGeometries, 1);
  assert.equal(cost.uniqueGeometryTriangles, 12);
  assert.equal(cost.enabledPotentialTriangles, 12);
  assert.equal(cost.enabledVisibleGeometryMeshes, 1);
  assert.equal(cost.hiddenGeometryMeshes, 2);
  assert.equal(cost.enabledRegularInstances, 1);
  assert.equal(cost.enabledDistinctMaterials, 1);
  assert.equal(cost.materialLightAssignmentGroups, 1);
  assert.equal(cost.enabledLights, 0);
});
