import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Material } from "@babylonjs/core/Materials/material";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  createSkyFirstOpaqueComparator,
  readNativeLod,
} from "../client/opaque-sort";
import "../client/render-shaders";

function setup() {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  const camera = new FreeCamera("camera", new Vector3(10, 2, 0), scene);
  camera.setTarget(new Vector3(10, 2, 1));
  camera.minZ = 0.1;
  scene.activeCamera = camera;
  const draws: string[] = [];
  const box = (name: string, z: number) => {
    const mesh = MeshBuilder.CreateBox(name, {}, scene);
    mesh.position.set(10, 2, z);
    const material = new StandardMaterial(name + " material", scene);
    material.disableLighting = true;
    mesh.material = material;
    mesh.onBeforeBindObservable.add(() => draws.push(name));
    return mesh;
  };
  const sky = box("sky", 0);
  sky.infiniteDistance = true;
  sky.scaling.setAll(500);
  sky.material!.backFaceCulling = false;
  sky.material!.disableDepthWrite = true;
  return { engine, scene, camera, draws, box, sky };
}
async function warm(scene: Scene) {
  for (let i = 0; i < 3; i++) {
    scene.render();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}
const pose = (mesh: AbstractMesh) => ({
  position: mesh.position.asArray(),
  rotation: mesh.rotation.asArray(),
  quaternion: mesh.rotationQuaternion?.asArray(),
  scaling: mesh.scaling.asArray(),
  world: Array.from(mesh.getWorldMatrix().asArray()),
});

test("actual opaque dispatch is sky first then near to far, with frame-cache invalidation and untouched alpha queues", async () => {
  const { engine, scene, camera, draws, box, sky } = setup();
  const far = box("far", 60),
    middle = box("middle", 20),
    near = box("near", 5);
  const alphaNear = box("alpha-near", 15),
    alphaFar = box("alpha-far", 35);
  alphaNear.material!.alpha = alphaFar.material!.alpha = 0.4;
  const cutoutA = box("cutout-a", 40),
    cutoutB = box("cutout-b", 10);
  const alphaTexture = RawTexture.CreateRGBATexture(
    new Uint8Array([255, 255, 255, 255]),
    1,
    1,
    scene,
  );
  alphaTexture.hasAlpha = true;
  for (const mesh of [cutoutA, cutoutB]) {
    const m = mesh.material as StandardMaterial;
    m.diffuseTexture = alphaTexture;
    m.transparencyMode = Material.MATERIAL_ALPHATEST;
  }
  try {
    await warm(scene);
    draws.length = 0;
    scene.render();
    const alphaBefore = draws.filter(
      (name) => name.startsWith("alpha-") || name.startsWith("cutout-"),
    );
    scene.setRenderingOrder(0, createSkyFirstOpaqueComparator(scene, sky));
    draws.length = 0;
    scene.render();
    assert.deepEqual(
      draws.filter((name) => ["sky", "near", "middle", "far"].includes(name)),
      ["sky", "near", "middle", "far"],
    );
    assert.deepEqual(
      draws.filter(
        (name) => name.startsWith("alpha-") || name.startsWith("cutout-"),
      ),
      alphaBefore,
    );
    assert.ok(draws.indexOf("alpha-far") < draws.indexOf("alpha-near"));
    camera.position.z = 100;
    camera.setTarget(new Vector3(10, 2, 0));
    draws.length = 0;
    scene.render();
    assert.deepEqual(
      draws.filter((name) => ["sky", "near", "middle", "far"].includes(name)),
      ["sky", "far", "middle", "near"],
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("native instance LOD draw groups sort by active instance centres, excluding layerMask0 and without extra getLOD or world changes", async () => {
  const { engine, scene, camera, draws, box, sky } = setup();
  const master = box("lod-near", 0);
  master.position.setAll(0);
  master.isVisible = false;
  const medium = box("lod-medium", 0);
  medium.position.setAll(0);
  medium.isVisible = false;
  const far = box("lod-far", 0);
  far.position.setAll(0);
  far.isVisible = false;
  master.addLODLevel(10, medium);
  master.addLODLevel(40, far);
  for (const [name, z, mask] of [
    ["near-instance", 4, 0x0fffffff],
    ["medium-instance", 22, 0x0fffffff],
    ["medium-instance-2", 32, 0x0fffffff],
    ["far-instance", 80, 0x0fffffff],
    ["hidden-shadow-proxy", 1, 0],
  ] as const) {
    const instance = master.createInstance(name);
    instance.position.set(10, 2, z);
    instance.isVisible = true;
    instance.layerMask = mask;
  }
  const occluder = box("occluder", 12),
    midOccluder = box("middle-occluder", 50);
  let lodCalls = 0,
    afterEvaluation = 0;
  master.onLODLevelSelection = () => {
    lodCalls++;
  };
  scene.onAfterActiveMeshesEvaluationObservable.add(() => {
    afterEvaluation = lodCalls;
  });
  try {
    scene.setRenderingOrder(0, createSkyFirstOpaqueComparator(scene, sky));
    await warm(scene);
    const meshes = [...scene.meshes];
    const before = meshes.map(pose);
    draws.length = 0;
    scene.render();
    assert.deepEqual(draws, [
      "sky",
      "lod-near",
      "occluder",
      "lod-medium",
      "middle-occluder",
      "lod-far",
    ]);
    assert.equal(
      lodCalls,
      afterEvaluation,
      "comparator never invokes getLOD/preActivate again",
    );
    assert.deepEqual(meshes.map(pose), before);
    assert.ok(
      scene
        .getActiveMeshes()
        .data.slice(0, scene.getActiveMeshes().length)
        .every((m) => m.name !== "hidden-shadow-proxy"),
    );
    camera.position.z = 100;
    camera.setTarget(new Vector3(10, 2, 0));
    draws.length = 0;
    scene.render();
    assert.ok(draws.indexOf("lod-medium") < draws.indexOf("middle-occluder"));
    assert.ok(draws.indexOf("lod-far") > draws.indexOf("middle-occluder"));
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("readonly public LOD selection agrees with actual Babylon distance, exact boundaries, screen coverage and orthographic modes", () => {
  const { engine, scene, camera, box } = setup();
  const master = box("master", 0),
    medium = box("medium", 0),
    far = box("far", 0);
  master.position.setAll(0);
  medium.position.setAll(0);
  far.position.setAll(0);
  master.addLODLevel(10, medium);
  master.addLODLevel(40, far);
  const instance = master.createInstance("selection");
  instance.isVisible = true;
  try {
    camera.position.setAll(0);
    camera.setTarget(new Vector3(0, 0, 1));
    camera.getViewMatrix(true);
    camera.getProjectionMatrix(true);
    for (const z of [0, 5, 10, 10.001, 39.999, 40, 40.001, 100]) {
      instance.position.set(0, 0, z);
      instance.computeWorldMatrix(true);
      assert.equal(
        readNativeLod(
          master,
          camera,
          instance.getBoundingInfo().boundingSphere,
        ),
        instance.getLOD(camera),
      );
    }
    for (const level of [...master.getLODLevels()])
      master.removeLODLevel(level.mesh);
    master.useLODScreenCoverage = true;
    master.addLODLevel(0.1, medium);
    master.addLODLevel(0.01, far);
    for (const z of [1, 5, 10, 30, 100]) {
      instance.position.z = z;
      instance.computeWorldMatrix(true);
      assert.equal(
        readNativeLod(
          master,
          camera,
          instance.getBoundingInfo().boundingSphere,
        ),
        instance.getLOD(camera),
      );
    }
    master.useLODScreenCoverage = false;
    for (const level of [...master.getLODLevels()])
      master.removeLODLevel(level.mesh);
    master.addLODLevel(10, medium);
    master.addLODLevel(40, far);
    camera.mode = Camera.ORTHOGRAPHIC_CAMERA;
    camera.minZ = 50;
    assert.equal(
      readNativeLod(master, camera, instance.getBoundingInfo().boundingSphere),
      instance.getLOD(camera),
    );
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("arbitrary custom LOD selection uses deterministic safe fallback without invoking the selector from sorting", async () => {
  const { engine, scene, draws, box, sky } = setup();
  box("far", 60);
  box("near", 5);
  let calls = 0,
    afterEvaluation = 0;
  scene.customLODSelector = (mesh) => {
    calls++;
    return mesh;
  };
  scene.onAfterActiveMeshesEvaluationObservable.add(() => {
    afterEvaluation = calls;
  });
  try {
    scene.setRenderingOrder(0, createSkyFirstOpaqueComparator(scene, sky));
    await warm(scene);
    draws.length = 0;
    scene.render();
    assert.equal(draws[0], "sky");
    assert.equal(calls, afterEvaluation);
    assert.deepEqual(new Set(draws), new Set(["sky", "far", "near"]));
  } finally {
    scene.dispose();
    engine.dispose();
  }
});
