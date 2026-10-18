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
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { MultiMaterial } from "@babylonjs/core/Materials/multiMaterial";
import { SubMesh } from "@babylonjs/core/Meshes/subMesh";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  createSkyFirstOpaqueComparator,
  createSkyFirstMaterialComparator,
  readNativeLod,
} from "../client/opaque-sort";
import { applyArtLighting } from "../client/art-lighting";
import type { AtmosphereSky } from "../client/atmosphere-sky";
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

test("material-first actual PBR dispatch groups shared materials and reduces real mustRebind without changing draw membership", async () => {
  const { engine, scene, draws, box, sky } = setup();
  new DirectionalLight("real light", new Vector3(0, -1, 1), scene);
  const shared = new PBRMaterial("shared opaque A", scene);
  const other = new PBRMaterial("opaque B", scene);
  for (const material of [shared, other]) {
    material.metallic = 0;
    material.roughness = 0.6;
  }
  const far = box("far-shared", 60),
    middle = box("middle-other", 20),
    near = box("near-shared", 5);
  far.material = near.material = shared;
  middle.material = other;
  const opaque = [near, middle, far];
  const originals = [shared, other].map((material) => {
    const host = material as unknown as {
      _mustRebind: (...args: unknown[]) => boolean;
    };
    return { host, method: host._mustRebind };
  });
  let rebinds = 0;
  try {
    scene.setRenderingOrder(0, createSkyFirstOpaqueComparator(scene, sky));
    await warm(scene);
    for (const { host, method } of originals)
      host._mustRebind = function (...args) {
        const value = Reflect.apply(method, this, args);
        if (value) rebinds++;
        return value;
      };
    draws.length = 0;
    scene.render();
    const baselineOrder = draws.slice(),
      baselineRebinds = rebinds;
    assert.deepEqual(baselineOrder, [
      "sky",
      "near-shared",
      "middle-other",
      "far-shared",
    ]);
    const before = opaque.map((mesh) => ({
      pose: pose(mesh),
      effect: mesh.subMeshes[0].effect,
      defines: mesh.subMeshes[0].effect!.defines,
    }));
    scene.setRenderingOrder(0, createSkyFirstMaterialComparator(scene, sky));
    draws.length = 0;
    rebinds = 0;
    scene.render();
    assert.deepEqual(draws, [
      "sky",
      "far-shared",
      "near-shared",
      "middle-other",
    ]);
    assert.deepEqual([...draws].sort(), [...baselineOrder].sort());
    assert.ok(
      rebinds < baselineRebinds,
      `actual mustRebind ${baselineRebinds} -> ${rebinds}`,
    );
    for (const [i, mesh] of opaque.entries()) {
      assert.deepEqual(pose(mesh), before[i].pose);
      assert.equal(mesh.subMeshes[0].effect, before[i].effect);
      assert.equal(mesh.subMeshes[0].effect!.defines, before[i].defines);
      assert.ok(mesh.subMeshes[0].effect!.isReady());
    }
  } finally {
    for (const { host, method } of originals) host._mustRebind = method;
    scene.dispose();
    engine.dispose();
  }
});

test("pure current-pass MultiMaterial keys never call cache-resetting material/default/LOD/readiness/transform access", () => {
  const { engine, scene, box, sky } = setup();
  const first = new StandardMaterial("first", scene),
    second = new StandardMaterial("second", scene);
  const root = new MultiMaterial("base multi", scene);
  root.subMaterials = [second, first];
  const replacement = new MultiMaterial("override multi", scene);
  replacement.subMaterials = [first, second];
  const mesh = box("multi geometry", 12);
  mesh.material = root;
  mesh.releaseSubMeshes();
  const a = new SubMesh(0, 0, mesh.getTotalVertices(), 0, 18, mesh),
    b = new SubMesh(1, 0, mesh.getTotalVertices(), 18, 18, mesh);
  const pass = engine.createRenderPassId("pure override"),
    previousPass = engine.currentRenderPassId;
  mesh.setMaterialForRenderPass(pass, replacement);
  let resets = 0;
  const undo: (() => void)[] = [];
  const trap = (object: object, key: string) => {
    const host = object as Record<string, unknown>,
      own = Object.getOwnPropertyDescriptor(host, key);
    Object.defineProperty(host, key, {
      configurable: true,
      value: () => {
        throw Error("Comparator called " + key);
      },
    });
    undo.push(() => {
      if (own) Object.defineProperty(host, key, own);
      else Reflect.deleteProperty(host, key);
    });
  };
  try {
    for (const sub of [a, b]) {
      const original = sub.resetDrawCache;
      sub.resetDrawCache = function (...args) {
        resets++;
        return Reflect.apply(original, this, args);
      };
      undo.push(() => {
        sub.resetDrawCache = original;
      });
      for (const key of ["getMaterial", "getBoundingInfo"]) trap(sub, key);
    }
    for (const key of [
      "getLOD",
      "isReady",
      "getWorldMatrix",
      "computeWorldMatrix",
    ])
      trap(mesh, key);
    const compare = createSkyFirstMaterialComparator(scene, sky),
      materials = scene.materials.length;
    engine.currentRenderPassId = previousPass;
    assert.ok(compare(a, b) > 0, "native child1 precedes child0");
    engine.currentRenderPassId = pass;
    assert.ok(
      compare(a, b) < 0,
      "pass override reverses the declared effective children",
    );
    a.materialIndex = 99;
    b.materialIndex = -1;
    assert.ok(Number.isFinite(compare(a, b)));
    replacement.subMaterials = [null, null];
    a.materialIndex = 0;
    b.materialIndex = 1;
    assert.ok(
      compare(a, b) < 0,
      "null child uses deterministic container/submesh fallback",
    );
    assert.equal(
      scene.materials.length,
      materials,
      "no default material allocation",
    );
    assert.equal(resets, 0);
  } finally {
    for (const restore of undo.reverse()) restore();
    engine.currentRenderPassId = previousPass;
    engine.releaseRenderPassId(pass);
    scene.dispose();
    engine.dispose();
  }
});

test("actual camera-pass override and MultiMaterial children bind in material-first order without extra invalidation", async () => {
  const { engine, scene, camera, box, sky } = setup();
  const first = new StandardMaterial("child first", scene),
    second = new StandardMaterial("child second", scene);
  first.disableLighting = second.disableLighting = true;
  const base = new MultiMaterial("base", scene);
  base.subMaterials = [second, first];
  const override = new MultiMaterial("camera override", scene);
  override.subMaterials = [first, second];
  const mesh = box("multi", 10);
  mesh.material = base;
  mesh.releaseSubMeshes();
  const a = new SubMesh(0, 0, mesh.getTotalVertices(), 0, 18, mesh),
    b = new SubMesh(1, 0, mesh.getTotalVertices(), 18, 18, mesh);
  const bound: string[] = [];
  first.onBindObservable.add(() => bound.push(first.name));
  second.onBindObservable.add(() => bound.push(second.name));
  let resets = 0;
  const originals = [a.resetDrawCache, b.resetDrawCache];
  try {
    mesh.setMaterialForRenderPass(camera.renderPassId, override);
    scene.setRenderingOrder(0, createSkyFirstMaterialComparator(scene, sky));
    await warm(scene);
    for (const [i, sub] of [a, b].entries())
      sub.resetDrawCache = function (...args) {
        resets++;
        return Reflect.apply(originals[i], this, args);
      };
    bound.length = 0;
    scene.render();
    assert.deepEqual(bound, ["child first", "child second"]);
    assert.equal(resets, 0);
    const effects = [a.effect, b.effect];
    assert.ok(effects.every((e) => e?.isReady()));
    mesh.setMaterialForRenderPass(camera.renderPassId, undefined);
    await warm(scene);
    resets = 0;
    bound.length = 0;
    scene.render();
    assert.deepEqual(bound, ["child first", "child second"]);
    assert.equal(resets, 0);
    assert.equal(a.getMaterial(false), second);
    assert.equal(b.getMaterial(false), first);
    assert.ok(a.effect?.isReady() && b.effect?.isReady());
  } finally {
    a.resetDrawCache = originals[0];
    b.resetDrawCache = originals[1];
    scene.dispose();
    engine.dispose();
  }
});

test("material-first preserves actual alpha, transparent and shadow dispatch while keeping sky first", async () => {
  const { engine, scene, draws, box, sky } = setup();
  const near = box("opaque near", 5),
    far = box("opaque far", 25);
  const alphaNear = box("alpha near", 8),
    alphaFar = box("alpha far", 32);
  alphaNear.material!.alpha = alphaFar.material!.alpha = 0.4;
  const cutout = box("cutout", 12),
    texture = RawTexture.CreateRGBATexture(
      new Uint8Array([255, 255, 255, 255]),
      1,
      1,
      scene,
    );
  texture.hasAlpha = true;
  (cutout.material as StandardMaterial).diffuseTexture = texture;
  cutout.material!.transparencyMode = Material.MATERIAL_ALPHATEST;
  const light = new DirectionalLight("sun", new Vector3(0, -1, 1), scene);
  light.position.set(10, 20, -10);
  const shadow = new ShadowGenerator(128, light);
  for (const mesh of [near, far, cutout]) {
    mesh.receiveShadows = true;
    shadow.addShadowCaster(mesh, false);
  }
  const shadowDraws: string[] = [];
  shadow.onBeforeShadowMapRenderMeshObservable.add((mesh) =>
    shadowDraws.push(mesh.name),
  );
  const outsideOpaque = (values: string[]) =>
    values.filter((x) => x.startsWith("alpha") || x === "cutout");
  try {
    scene.setRenderingOrder(0, createSkyFirstOpaqueComparator(scene, sky));
    await warm(scene);
    draws.length = 0;
    shadowDraws.length = 0;
    scene.render();
    const alpha = outsideOpaque(draws),
      targets = shadowDraws.slice();
    assert.ok(targets.length > 0, "real shadow pass executed");
    scene.setRenderingOrder(0, createSkyFirstMaterialComparator(scene, sky));
    draws.length = 0;
    shadowDraws.length = 0;
    scene.render();
    assert.deepEqual(outsideOpaque(draws), alpha);
    assert.deepEqual(shadowDraws, targets);
    assert.equal(
      draws.filter((x) => x === "sky" || x.startsWith("opaque"))[0],
      "sky",
    );
    assert.ok(draws.indexOf("alpha far") < draws.indexOf("alpha near"));
  } finally {
    shadow.dispose();
    scene.dispose();
    engine.dispose();
  }
});

test("material-first preserves native LOD/instance membership, custom selector calls and geometry transforms", async () => {
  const { engine, scene, camera, draws, box, sky } = setup();
  const master = box("master", 0),
    lod = box("lod", 0);
  master.position.setAll(0);
  lod.position.setAll(0);
  master.isVisible = lod.isVisible = false;
  master.addLODLevel(15, lod);
  for (const [name, z, mask] of [
    ["near", 5, 0x0fffffff],
    ["far", 30, 0x0fffffff],
    ["hidden", 2, 0],
  ] as const) {
    const i = master.createInstance(name);
    i.position.set(10, 2, z);
    i.layerMask = mask;
    i.isVisible = true;
  }
  box("opaque middle", 12);
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
    draws.length = 0;
    scene.render();
    const membership = [...draws].sort(),
      before = scene.meshes.map(pose);
    scene.setRenderingOrder(0, createSkyFirstMaterialComparator(scene, sky));
    draws.length = 0;
    scene.render();
    assert.deepEqual([...draws].sort(), membership);
    assert.equal(draws[0], "sky");
    assert.equal(lodCalls, afterEvaluation);
    assert.deepEqual(scene.meshes.map(pose), before);
    let selectors = 0,
      atEvaluation = 0;
    scene.customLODSelector = (mesh) => {
      selectors++;
      return mesh;
    };
    scene.onAfterActiveMeshesEvaluationObservable.add(() => {
      atEvaluation = selectors;
    });
    camera.position.z = 40;
    camera.setTarget(new Vector3(10, 2, 0));
    scene.render();
    assert.equal(selectors, atEvaluation);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

test("material-first factories add no observers or caches and deterministic ties preserve authored depth state", () => {
  const { engine, scene, box, sky } = setup();
  const a = box("same-depth-a", 10),
    b = box("same-depth-b", 10);
  b.material = a.material;
  a.material!.zOffset = -3;
  a.material!.zOffsetUnits = -4;
  const before = {
    evaluation: scene.onAfterActiveMeshesEvaluationObservable.observers.length,
    dispose: scene.onDisposeObservable.observers.length,
    alpha: a.material!.alpha,
    depth: a.material!.disableDepthWrite,
    offset: a.material!.zOffset,
    units: a.material!.zOffsetUnits,
  };
  try {
    for (let i = 0; i < 20; i++) {
      const compare = createSkyFirstMaterialComparator(scene, sky);
      assert.ok(compare(a.subMeshes[0], b.subMeshes[0]) < 0);
      assert.ok(compare(sky.subMeshes[0], a.subMeshes[0]) < 0);
    }
    assert.deepEqual(
      {
        evaluation:
          scene.onAfterActiveMeshesEvaluationObservable.observers.length,
        dispose: scene.onDisposeObservable.observers.length,
        alpha: a.material!.alpha,
        depth: a.material!.disableDepthWrite,
        offset: a.material!.zOffset,
        units: a.material!.zOffsetUnits,
      },
      before,
    );
    const noMaterial = box("no material", 20);
    noMaterial.material = null;
    const count = scene.materials.length;
    createSkyFirstMaterialComparator(scene, sky)(
      noMaterial.subMeshes[0],
      a.subMeshes[0],
    );
    assert.equal(scene.materials.length, count);
  } finally {
    scene.dispose();
    engine.dispose();
  }
});

for (const isWebGPU of [false, true]) {
  test(`actual ArtLighting initialization selects ${isWebGPU ? "material-first for WebGPU" : "near-to-far for WebGL"} opaque dispatch`, async () => {
    const engine = new NullEngine(),
      scene = new Scene(engine);
    scene.useRightHandedSystem = true;
    const camera = new FreeCamera(
      "routing camera",
      new Vector3(10, 2, 0),
      scene,
    );
    camera.setTarget(new Vector3(10, 2, 1));
    scene.activeCamera = camera;
    const shared = new StandardMaterial("shared first", scene),
      other = new StandardMaterial("other second", scene);
    shared.disableLighting = other.disableLighting = true;
    const draws: string[] = [];
    for (const [name, z, material] of [
      ["far-shared", 60, shared],
      ["middle-other", 20, other],
      ["near-shared", 5, shared],
    ] as const) {
      const mesh = MeshBuilder.CreateBox(name, {}, scene);
      mesh.position.set(10, 2, z);
      mesh.material = material;
      mesh.onBeforeBindObservable.add(() => draws.push(name));
    }
    const context = {
      scene,
      sun: new DirectionalLight("sun", Vector3.Down(), scene),
      ambient: new HemisphericLight("ambient", Vector3.Up(), scene),
      lamps: new StandardMaterial("lamps", scene),
      lights: [],
      clouds: [],
      quality: "low",
    };
    // Keep asynchronous sky texture IO out of this routing regression. The
    // initializer still owns the real backdrop mesh and its disposal observer;
    // all queued draws use real, ready Babylon materials, not fake readiness.
    const skyMaterial = new StandardMaterial("routing sky", scene);
    skyMaterial.disableLighting = true;
    skyMaterial.disableDepthWrite = true;
    skyMaterial.backFaceCulling = false;
    let skyUpdates = 0,
      skyDisposals = 0;
    const atmosphere = {
      material: skyMaterial,
      update: () => skyUpdates++,
      dispose: () => {
        skyDisposals++;
        skyMaterial.dispose();
      },
    } as unknown as AtmosphereSky;
    const input = {
      atmosphere,
      sun: { x: 0, y: 1, z: 0, altitude: 1, daylight: 1 },
      instant: Date.parse("2026-10-18T10:00:00Z"),
      player: { x: 10, y: 2, z: 0 },
      dt: 0.01,
    };
    const flag = Object.getOwnPropertyDescriptor(engine, "isWebGPU");
    const restoreFlag = () => {
      if (flag) Object.defineProperty(engine, "isWebGPU", flag);
      else Reflect.deleteProperty(engine, "isWebGPU");
    };
    try {
      Object.defineProperty(engine, "isWebGPU", {
        configurable: true,
        get: () => isWebGPU,
      });
      applyArtLighting(context, input);
      restoreFlag();
      const backdrop = scene.getMeshByName("atmosphere backdrop");
      assert.ok(backdrop instanceof Mesh);
      assert.equal(backdrop.material, atmosphere.material);
      backdrop.onBeforeBindObservable.add(() => draws.push("backdrop"));
      // Updating lighting does not replace the initializer's selected ordering.
      applyArtLighting(context, input);
      assert.equal(skyUpdates, 2);
      assert.equal(
        scene.meshes.filter((mesh) => mesh.name === "atmosphere backdrop")
          .length,
        1,
      );
      await warm(scene);
      draws.length = 0;
      scene.render();
      assert.deepEqual(
        draws,
        isWebGPU
          ? ["backdrop", "far-shared", "near-shared", "middle-other"]
          : ["backdrop", "near-shared", "middle-other", "far-shared"],
      );
    } finally {
      restoreFlag();
      scene.dispose();
      engine.dispose();
      assert.equal(skyDisposals, 1);
    }
  });
}
