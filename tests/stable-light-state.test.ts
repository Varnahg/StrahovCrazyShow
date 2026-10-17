import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { SpotLight } from "@babylonjs/core/Lights/spotLight";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import {
  StandardMaterial,
  StandardMaterialDefines,
} from "@babylonjs/core/Materials/standardMaterial";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { PBRMaterialDefines } from "@babylonjs/core/Materials/PBR/pbrBaseMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { PrepareDefinesForLights } from "@babylonjs/core/Materials/materialHelper.functions";
import { StableLightState } from "../client/stable-light-state";

const ids = (objects: readonly { uniqueId: number }[]) =>
  objects.map((object) => object.uniqueId);

function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.activeCamera = new FreeCamera("observer", new Vector3(0, 1, -4), scene);
  const ambient = new HemisphericLight("ambient", Vector3.Up(), scene);
  const sun = new DirectionalLight("sun", Vector3.Down(), scene);
  const streetA = new PointLight("street A", Vector3.Zero(), scene);
  const streetB = new PointLight("street B", Vector3.One(), scene);
  streetB.setEnabled(false);
  const beam = new SpotLight(
    "local beam",
    Vector3.Zero(),
    Vector3.Forward(),
    0.8,
    2,
    scene,
  );
  beam.setEnabled(false);
  const stable = new StableLightState(scene);
  t.after(() => {
    stable.dispose();
    scene.dispose();
    engine.dispose();
  });
  return { engine, scene, ambient, sun, streetA, streetB, beam, stable };
}

function receiver(scene: Scene, pbr = false) {
  const mesh = MeshBuilder.CreateBox("receiver", {}, scene);
  mesh.material = pbr
    ? new PBRMaterial("pbr", scene)
    : new StandardMaterial("standard", scene);
  mesh.receiveShadows = true;
  return mesh;
}

function lightDefines(scene: Scene, mesh: Mesh, pbr: boolean) {
  const defines = pbr
    ? new PBRMaterialDefines()
    : new StandardMaterialDefines();
  PrepareDefinesForLights(scene, mesh, defines, true, 4);
  return defines.toString();
}

for (const pbr of [false, true]) {
  test(`${pbr ? "PBR" : "Standard"} equivalent lighting returns identical actual Babylon defines after toggles and street swaps`, (t) => {
    const { scene, ambient, sun, streetA, streetB, beam, stable } = fixture(t);
    const mesh = receiver(scene, pbr);
    stable.update();
    const initial = lightDefines(scene, mesh, pbr);
    const membership = new Set(ids(mesh.lightSources));
    // Babylon appends a re-enabled light to the mesh, although scene.lights has
    // not changed order. The actual dependency helper then emits other slots.
    streetA.setEnabled(false);
    ambient.setEnabled(false);
    streetA.setEnabled(true);
    ambient.setEnabled(true);
    assert.notEqual(lightDefines(scene, mesh, pbr), initial);
    // Same enabled set after multiple changes in one frame is also supported.
    stable.update();
    assert.equal(lightDefines(scene, mesh, pbr), initial);
    assert.deepEqual(new Set(ids(mesh.lightSources)), membership);
    for (let cycle = 0; cycle < 6; cycle++) {
      streetA.setEnabled(false);
      streetB.setEnabled(true);
      beam.setEnabled(true);
      stable.update();
      assert.deepEqual(
        new Set(ids(mesh.lightSources)),
        new Set(ids([ambient, sun, streetB, beam])),
      );
      beam.setEnabled(false);
      streetB.setEnabled(false);
      streetA.setEnabled(true);
      stable.update();
      assert.equal(lightDefines(scene, mesh, pbr), initial);
      assert.equal(streetA.intensity, 1);
      assert.equal(beam.isEnabled(), false);
    }
  });
}

test("material caps, null slots and custom shaders preserve their exact existing light selection", (t) => {
  const { scene, stable } = fixture(t);
  const standard = receiver(scene);
  (standard.material as StandardMaterial).maxSimultaneousLights = 2;
  const pbr = receiver(scene, true);
  (pbr.material as PBRMaterial).maxSimultaneousLights = 2;
  const multi = receiver(scene);
  const small = new StandardMaterial("two slots", scene);
  small.maxSimultaneousLights = 2;
  multi.material = new MultiMaterial("mixed", scene);
  (multi.material as MultiMaterial).subMaterials = [
    new PBRMaterial("four slots", scene),
    small,
  ];
  const nullPart = receiver(scene);
  nullPart.material = new MultiMaterial("null fallback unknown", scene);
  (nullPart.material as MultiMaterial).subMaterials = [
    new StandardMaterial("known", scene),
    null,
  ];
  const custom = receiver(scene);
  custom.material = new ShaderMaterial("custom", scene, "unused");
  const noMaterial = receiver(scene);
  noMaterial.material = null;
  const frozen = receiver(scene);
  frozen.material!.freeze();
  const meshes = [standard, pbr, multi, nullPart, custom, noMaterial, frozen];
  const lists = meshes.map((mesh) => ids(mesh.lightSources));
  stable.update();
  for (let i = 0; i < meshes.length; i++)
    assert.deepEqual(ids(meshes[i].lightSources), lists[i]);
  assert.equal(stable.stats.skipped, meshes.length);
});

test("new and replaced meshes are canonical before deferred callbacks; steady movement visits no meshes; disposal removes observers", async (t) => {
  const { scene, stable, streetA } = fixture(t);
  const mesh = receiver(scene);
  stable.update();
  await new Promise((resolve) => setTimeout(resolve, 0));
  stable.update(); // consume Babylon's deferred onNewMeshAdded notification
  const visits = stable.stats.visits;
  const revisions = stable.stats.revisions;
  for (let frame = 0; frame < 100; frame++) {
    streetA.position.x += 1;
    streetA.intensity = frame / 100;
    stable.update();
  }
  assert.equal(stable.stats.visits, visits);
  assert.equal(stable.stats.revisions, revisions);
  const expected = ids(mesh.lightSources);
  mesh.dispose();
  const replacement = receiver(scene);
  stable.update();
  assert.deepEqual(ids(replacement.lightSources), expected);
  const afterReplacement = stable.stats.visits;
  const added = receiver(scene);
  stable.update();
  assert.ok(stable.stats.visits > afterReplacement);
  assert.deepEqual(ids(added.lightSources), expected);
  stable.dispose();
  const afterDispose = { ...stable.stats };
  receiver(scene);
  await new Promise((resolve) => setTimeout(resolve, 0));
  stable.update();
  assert.deepEqual(stable.stats, afterDispose);
});

test("shadow and falloff variants receive stable slots while caster membership and map identity remain untouched", (t) => {
  const { scene, streetA, streetB, beam, stable } = fixture(t);
  // Four lights including two points with distinct shadow/falloff definitions.
  beam.setEnabled(false);
  streetB.setEnabled(true);
  streetB.falloffType = 1;
  const mesh = receiver(scene);
  const generator = new ShadowGenerator(128, streetB);
  generator.getShadowMap()!.renderList = [mesh];
  const map = generator.getShadowMap();
  const casters = ids(map!.renderList!);
  stable.update();
  const initial = lightDefines(scene, mesh, false);
  streetA.setEnabled(false);
  stable.update();
  streetA.setEnabled(true);
  stable.update();
  assert.equal(lightDefines(scene, mesh, false), initial);
  assert.equal(generator.getShadowMap(), map);
  assert.deepEqual(ids(map!.renderList!), casters);
  assert.equal(streetB.shadowEnabled, true);
});

test("removing lights and disposing the controller unregisters its effective-state observers", (t) => {
  const { scene, stable, streetA, sun } = fixture(t);
  receiver(scene);
  stable.update();
  const activeObservers = (light: PointLight | DirectionalLight) =>
    light.onEffectiveEnabledStateChangedObservable.observers.filter(
      (observer) => !observer._willBeUnregistered,
    ).length;
  assert.equal(activeObservers(streetA), 1);
  scene.removeLight(streetA);
  assert.equal(activeObservers(streetA), 0);
  stable.update();
  assert.equal(activeObservers(sun), 1);
  stable.dispose();
  stable.dispose();
  assert.equal(activeObservers(sun), 0);
  streetA.dispose();
});
