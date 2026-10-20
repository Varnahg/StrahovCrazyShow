import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import {
  SceneLoader,
  LoadAssetContainerAsync,
} from "@babylonjs/core/Loading/sceneLoader";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  GLTFFileLoader,
} from "@babylonjs/loaders/glTF/glTFFileLoader";
import {
  registerGLTFExtension,
  unregisterGLTFExtension,
} from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry";
import { GltfLightBudget } from "../client/gltf-light-budget";
import { StableLightState } from "../client/stable-light-state";
import "@babylonjs/loaders/glTF";
import "../client/render-shaders";

const emptyGltf =
  "data:" +
  JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{}] });
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 5));
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function fixture(t: TestContext, enabled = 5) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const material = new StandardMaterial("existing", scene);
  const camera = new FreeCamera("camera", new Vector3(0, 1, -5), scene);
  camera.setTarget(new Vector3(0, 1, 0));
  scene.activeCamera = camera;
  const mesh = MeshBuilder.CreateBox("receiver", {}, scene);
  mesh.position.y = 1;
  mesh.material = material;
  for (let index = 0; index < 43; index++)
    new DirectionalLight("light-" + index, Vector3.Down(), scene).setEnabled(
      index < enabled,
    );
  t.after(() => {
    scene.dispose();
    engine.dispose();
  });
  return { scene, material, mesh };
}
const beforeRender = (scene: Scene) =>
  scene.onBeforeRenderObservable.notifyObservers(scene);

test("prepareFrame raises the automatic cap before stable ordering on four-to-five light transitions", (t) => {
  const { scene, material, mesh } = fixture(t, 4);
  const budget = new GltfLightBudget(scene);
  const stable = new StableLightState(scene);
  t.after(() => { stable.dispose(); budget.dispose(); });
  // Same classes isolate the ordering contract: a newly enabled high-priority
  // fifth source must be included before the stabilizer records the revision.
  const fifth = scene.lights[4];
  fifth.renderPriority = 10;
  budget.prepareFrame();
  stable.update();
  assert.equal(material.maxSimultaneousLights, 4);
  fifth.setEnabled(true);
  budget.prepareFrame();
  stable.update();
  assert.equal(material.maxSimultaneousLights, 5);
  assert.equal(mesh.lightSources[0], fifth);
  assert.equal(mesh.lightSources.length, 5);
  const visits = budget.stats.visits;
  beforeRender(scene);
  budget.prepareFrame();
  stable.update();
  assert.equal(budget.stats.visits, visits, "idle fallback must not sweep materials again");
  assert.equal(mesh.lightSources[0], fifth);
});
async function loadEmpty(scene: Scene) {
  const container = await LoadAssetContainerAsync(emptyGltf, scene, {
    pluginExtension: ".gltf",
  });
  container.dispose();
  await flush();
}
function triangleGltf() {
  const binary = Buffer.alloc(44);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, index) =>
    binary.writeFloatLE(value, index * 4),
  );
  [0, 1, 2].forEach((value, index) =>
    binary.writeUInt16LE(value, 36 + index * 2),
  );
  return (
    "data:" +
    JSON.stringify({
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [
        {
          primitives: [
            { attributes: { POSITION: 0 }, indices: 1, material: 0 },
          ],
        },
      ],
      materials: [{ name: "imported-default" }],
      buffers: [
        {
          byteLength: binary.length,
          uri:
            "data:application/octet-stream;base64," + binary.toString("base64"),
        },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 6 },
      ],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
        { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      ],
    })
  );
}

test("real empty glTF proves the existing-material4→43 rewrite and guard restores a safe5 without mesh/material callbacks", async (t) => {
  const unprotected = fixture(t),
    guarded = fixture(t);
  assert.equal(unprotected.material.maxSimultaneousLights, 4);
  await loadEmpty(unprotected.scene);
  assert.equal(
    unprotected.material.maxSimultaneousLights,
    43,
    "installed loader counts disabled lights too",
  );
  const guard = new GltfLightBudget(guarded.scene);
  await loadEmpty(guarded.scene);
  assert.equal(guarded.material.maxSimultaneousLights, 5);
  assert.equal(guard.stats.loaderStarts, 1);
  assert.equal(guard.stats.activeLoaders, 0);
  assert.ok(guard.stats.inflationRepairs >= 1);
  const writes = guard.stats.writes;
  const visits = guard.stats.visits;
  for (let i = 0; i < 20; i++)
    guarded.scene.onBeforeRenderObservable.notifyObservers(guarded.scene);
  assert.equal(
    guard.stats.writes,
    writes,
    "stable budgets do not dirty shaders on every frame",
  );
  assert.equal(
    guard.stats.visits,
    visits,
    "completed loads leave no idle material sweep",
  );
  guard.dispose();
});

test("beforeRender repairs the awaited-extension gap before READY and actual defines retain all five enabled lights", async (t) => {
  const { scene, material, mesh } = fixture(t);
  const guard = new GltfLightBudget(scene),
    entered = deferred<void>(),
    release = deferred<void>();
  const name = "TEST_light_budget_delayed_ready";
  registerGLTFExtension(name, false, () => ({
    name,
    enabled: true,
    onReady() {
      entered.resolve();
      return release.promise;
    },
    dispose() {},
  }));
  let loading: ReturnType<typeof LoadAssetContainerAsync> | undefined;
  t.after(async () => {
    release.resolve();
    if (loading)
      await loading.then(
        (container) => container.dispose(),
        () => {},
      );
    unregisterGLTFExtension(name);
    guard.dispose();
  });
  loading = LoadAssetContainerAsync(emptyGltf, scene, {
    pluginExtension: ".gltf",
  });
  await entered.promise;
  assert.equal(
    material.maxSimultaneousLights,
    43,
    "rewrite occurs before the awaited extension and READY",
  );
  assert.equal(guard.stats.loaderReady, 0);
  const before = guard.stats.visits;
  scene.onBeforeRenderObservable.notifyObservers(scene);
  assert.ok(
    guard.stats.visits > before,
    "active loader still forces a sweep before READY",
  );
  assert.equal(material.maxSimultaneousLights, 5);
  for (let frame = 0; frame < 3; frame++) {
    scene.render();
    await flush();
  }
  const defines = mesh.subMeshes[0].materialDefines as unknown as Record<
    string,
    unknown
  >;
  assert.equal(defines.MAXLIGHTCOUNT, 5);
  assert.equal(defines.LIGHTCOUNT, 5);
  assert.equal(
    mesh.lightSources.filter((light) => light.isEnabled()).length,
    5,
  );
  release.resolve();
  const container = await loading;
  container.dispose();
  await flush();
  assert.equal(guard.stats.activeLoaders, 0);
});

test("idle frames skip material visits while explicit update remains a force sweep", (t) => {
  const { scene } = fixture(t);
  const guard = new GltfLightBudget(scene);
  t.after(() => guard.dispose());
  guard.update();
  const visits = guard.stats.visits,
    writes = guard.stats.writes;
  for (let frame = 0; frame < 100; frame++) beforeRender(scene);
  assert.equal(guard.stats.visits, visits);
  assert.equal(guard.stats.writes, writes);
  assert.equal(guard.stats.skippedFrames, 100);
  guard.update();
  assert.equal(guard.stats.visits, visits + guard.stats.trackedMaterials);
});

test("enabled counts, inherited enable state and reparenting refresh automatic caps", (t) => {
  const { scene, material } = fixture(t, 2);
  const guard = new GltfLightBudget(scene);
  t.after(() => guard.dispose());
  beforeRender(scene);
  const light = (index: number) =>
    scene.lights.find((l) => l.name === "light-" + index)!;
  light(2).setEnabled(true);
  beforeRender(scene);
  assert.equal(guard.stats.enabledLights, 3);
  assert.equal(material.maxSimultaneousLights, 4);
  light(3).setEnabled(true);
  light(4).setEnabled(true);
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 5);
  const disabledParent = new TransformNode("disabled-light-parent", scene);
  disabledParent.setEnabled(false);
  light(4).parent = disabledParent;
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 4);
  disabledParent.setEnabled(true);
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 5);
  disabledParent.setEnabled(false);
  light(4).parent = null;
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 5);
  light(4).setEnabled(false);
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 4);
});

test("new materials and same-count material/light replacements are caught before deferred add callbacks", (t) => {
  const { scene, material } = fixture(t);
  const guard = new GltfLightBudget(scene);
  t.after(() => guard.dispose());
  guard.update();
  const fresh = new StandardMaterial("synchronous-new", scene);
  beforeRender(scene);
  assert.equal(fresh.maxSimultaneousLights, 5);
  const count = scene.materials.length;
  material.dispose();
  const replacement = new StandardMaterial("synchronous-replacement", scene);
  assert.equal(scene.materials.length, count);
  const visits = guard.stats.visits;
  beforeRender(scene);
  assert.ok(guard.stats.visits > visits);
  assert.equal(replacement.maxSimultaneousLights, 5);
  // Disabled-for-disabled replacement changes neither registered nor enabled
  // counts. The synchronous removal event still invalidates the topology.
  const disabled = scene.lights.find((l) => !l.isEnabled())!;
  disabled.dispose();
  new DirectionalLight(
    "replacement-disabled",
    Vector3.Down(),
    scene,
  ).setEnabled(false);
  const sweeps = guard.stats.fullSweeps;
  beforeRender(scene);
  assert.equal(guard.stats.fullSweeps, sweeps + 1);
  assert.equal(guard.stats.registeredLights, 43);
  assert.equal(guard.stats.enabledLights, 5);
});

test("frozen automatic and explicit budgets retry after unfreeze without another scene change", (t) => {
  const { scene, material } = fixture(t, 4);
  const guard = new GltfLightBudget(scene);
  t.after(() => guard.dispose());
  guard.update();
  material.freeze();
  scene.lights.find((l) => l.name === "light-4")!.setEnabled(true);
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 4);
  assert.equal(guard.stats.deferredMaterials, 1);
  const sweeps = guard.stats.fullSweeps;
  material.unfreeze();
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 5);
  assert.equal(guard.stats.fullSweeps, sweeps);
  assert.equal(guard.stats.deferredMaterials, 0);
  material.freeze();
  assert.equal(guard.declareBudget(material, 2), false);
  material.unfreeze();
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 2);
  assert.equal(guard.stats.deferredMaterials, 0);
});

test("invalid initial caps and rejected writes retry only their material until recovery", (t) => {
  const { scene, material } = fixture(t);
  const invalid = new StandardMaterial("invalid-initial", scene);
  invalid.maxSimultaneousLights = Number.NaN;
  let cap = 4;
  let setterBehavior: "throw" | "ignore" | "accept" = "throw";
  Object.defineProperty(material, "maxSimultaneousLights", {
    configurable: true,
    get: () => cap,
    set: (value: number) => {
      if (setterBehavior === "throw")
        throw new Error("fixture setter rejected");
      if (setterBehavior === "accept") cap = value;
    },
  });
  const guard = new GltfLightBudget(scene);
  t.after(() => guard.dispose());
  beforeRender(scene);
  assert.equal(guard.stats.deferredMaterials, 2);
  assert.equal(guard.stats.writeErrors, 1);
  const visits = guard.stats.visits,
    sweeps = guard.stats.fullSweeps;
  setterBehavior = "ignore";
  beforeRender(scene);
  assert.equal(guard.stats.deferredMaterials, 2);
  assert.equal(guard.stats.writeErrors, 2);
  assert.equal(guard.stats.visits, visits + 2);
  setterBehavior = "accept";
  invalid.maxSimultaneousLights = 4;
  beforeRender(scene);
  assert.equal(guard.stats.visits, visits + 4);
  assert.equal(guard.stats.fullSweeps, sweeps);
  assert.equal(material.maxSimultaneousLights, 5);
  assert.equal(invalid.maxSimultaneousLights, 5);
  assert.equal(guard.stats.deferredMaterials, 0);
  const recoveredVisits = guard.stats.visits;
  beforeRender(scene);
  assert.equal(guard.stats.visits, recoveredVisits);
});

test("idle owner writes stay untouched and are captured before light changes or loader inflation", async (t) => {
  const { scene, material } = fixture(t);
  const high = new StandardMaterial("owner-high", scene);
  const guard = new GltfLightBudget(scene);
  t.after(() => guard.dispose());
  guard.update();
  const visits = guard.stats.visits;
  material.maxSimultaneousLights = 2;
  high.maxSimultaneousLights = 8;
  beforeRender(scene);
  assert.equal(guard.stats.visits, visits);
  assert.equal(material.maxSimultaneousLights, 2);
  assert.equal(high.maxSimultaneousLights, 8);
  scene.lights.find((l) => !l.isEnabled())!.setEnabled(true);
  beforeRender(scene);
  assert.equal(material.maxSimultaneousLights, 2);
  assert.equal(high.maxSimultaneousLights, 8);
  high.maxSimultaneousLights = 9;
  await loadEmpty(scene);
  assert.equal(material.maxSimultaneousLights, 2);
  assert.equal(high.maxSimultaneousLights, 9);
});

test("removal and disposal clear deferred invalid/frozen materials and frame observers", async (t) => {
  const { scene, material } = fixture(t, 4);
  await flush();
  const beforeObservers = scene.onBeforeRenderObservable.observers.length;
  const guard = new GltfLightBudget(scene);
  guard.update();
  material.freeze();
  scene.lights.find((l) => !l.isEnabled())!.setEnabled(true);
  beforeRender(scene);
  assert.equal(guard.stats.deferredMaterials, 1);
  scene.removeMaterial(material);
  assert.equal(guard.stats.deferredMaterials, 0);
  scene.addMaterial(material);
  beforeRender(scene);
  assert.equal(guard.stats.deferredMaterials, 1);
  material.dispose();
  assert.equal(guard.stats.deferredMaterials, 0);
  const invalid = new StandardMaterial("deferred-invalid", scene);
  invalid.maxSimultaneousLights = Number.NaN;
  beforeRender(scene);
  assert.equal(guard.stats.deferredMaterials, 1);
  guard.dispose();
  guard.dispose();
  assert.equal(guard.stats.deferredMaterials, 0);
  assert.equal(guard.stats.trackedMaterials, 0);
  const visits = guard.stats.visits;
  await flush();
  beforeRender(scene);
  assert.equal(guard.stats.visits, visits);
  assert.equal(
    scene.onBeforeRenderObservable.observers.length,
    beforeObservers,
  );
});

test("disposal during a rejected material write cannot reinsert a deferred resource", (t) => {
  const { scene, material } = fixture(t);
  const guard = new GltfLightBudget(scene);
  Object.defineProperty(material, "maxSimultaneousLights", {
    configurable: true,
    get: () => 4,
    set: () => {
      guard.dispose();
      throw new Error("fixture disposal during setter");
    },
  });
  beforeRender(scene);
  assert.equal(guard.stats.writeErrors, 1);
  assert.equal(guard.stats.deferredMaterials, 0);
  assert.equal(guard.stats.trackedMaterials, 0);
  const visits = guard.stats.visits;
  beforeRender(scene);
  assert.equal(guard.stats.visits, visits);
});

test("real imported materials are captured at original default before inflation and survive temporary container membership", async (t) => {
  const { scene } = fixture(t);
  const guard = new GltfLightBudget(scene);
  const observed: number[] = [];
  const hook = SceneLoader.OnPluginActivatedObservable.add((plugin) => {
    if (plugin instanceof GLTFFileLoader)
      plugin.onMaterialLoadedObservable.add((material) => {
        if (material.getScene() === scene)
          observed.push((material as StandardMaterial).maxSimultaneousLights);
      });
  });
  t.after(() => {
    SceneLoader.OnPluginActivatedObservable.remove(hook);
    guard.dispose();
  });
  const container = await LoadAssetContainerAsync(triangleGltf(), scene, {
    pluginExtension: ".gltf",
  });
  t.after(() => container.dispose());
  assert.deepEqual(observed, [4]);
  const imported = container.materials[0] as StandardMaterial;
  assert.equal(imported.maxSimultaneousLights, 5);
  container.addAllToScene();
  guard.update();
  container.removeAllFromScene();
  container.addAllToScene();
  guard.update();
  new DirectionalLight("sixth enabled", Vector3.Down(), scene);
  guard.update();
  assert.equal(
    imported.maxSimultaneousLights,
    6,
    "temporary removal must not reinterpret applied automatic5 as a fixed owner5",
  );
});

test("concurrent own loaders repair only their scene; foreign empty load keeps its native behavior", async (t) => {
  const own = fixture(t),
    foreign = fixture(t, 2);
  const guard = new GltfLightBudget(own.scene);
  await Promise.all([
    loadEmpty(own.scene),
    loadEmpty(own.scene),
    loadEmpty(foreign.scene),
  ]);
  assert.equal(own.material.maxSimultaneousLights, 5);
  assert.equal(foreign.material.maxSimultaneousLights, 43);
  assert.equal(guard.stats.loaderStarts, 2);
  assert.equal(guard.stats.activeLoaders, 0);
  guard.dispose();
});

test("fixed low/high/default declarations and independent owner changes survive loader inflation", async (t) => {
  const { scene, material } = fixture(t);
  const low = new StandardMaterial("fixed-low", scene);
  low.maxSimultaneousLights = 2;
  const high = new StandardMaterial("fixed-high", scene);
  high.maxSimultaneousLights = 8;
  const guard = new GltfLightBudget(scene);
  assert.equal(guard.declareBudget(material, 4), true);
  await loadEmpty(scene);
  assert.equal(material.maxSimultaneousLights, 4);
  assert.equal(low.maxSimultaneousLights, 2);
  assert.equal(high.maxSimultaneousLights, 8);
  high.maxSimultaneousLights = 9;
  guard.update();
  await loadEmpty(scene);
  assert.equal(high.maxSimultaneousLights, 9);
  assert.ok(guard.stats.ownerChanges >= 1);
  const plugin = new GLTFFileLoader();
  const original = plugin.loadAsync;
  plugin.loadAsync = function () {
    return new Promise<void>(() => {});
  };
  SceneLoader.OnPluginActivatedObservable.notifyObservers(plugin);
  plugin.loadAsync(
    scene,
    { json: { asset: { version: "2.0" } }, bin: null },
    "",
  );
  assert.equal(guard.declareBudget(material, 43), true);
  guard.update();
  assert.equal(
    material.maxSimultaneousLights,
    43,
    "an explicit owner write equal to the loader ceiling is not clamped",
  );
  plugin.dispose();
  plugin.loadAsync = original;
  assert.equal(guard.declareBudget(material, -1), false);
  guard.dispose();
});

test("entrypoint bridge preserves this/arguments/Promise identity and restores own and inherited descriptors", async (t) => {
  const { scene } = fixture(t);
  const guard = new GltfLightBudget(scene),
    plugin = new GLTFFileLoader();
  const result = deferred<void>();
  const seen: unknown[] = [];
  const original = function (this: GLTFFileLoader, ...args: unknown[]) {
    seen.push(this, ...args);
    return result.promise;
  };
  Object.defineProperty(plugin, "loadAsync", {
    configurable: true,
    enumerable: true,
    writable: true,
    value: original,
  });
  const descriptor = Object.getOwnPropertyDescriptor(plugin, "loadAsync");
  assert.equal(Object.hasOwn(plugin, "importMeshAsync"), false);
  SceneLoader.OnPluginActivatedObservable.notifyObservers(plugin);
  const data = { json: { asset: { version: "2.0" } }, bin: null };
  const returned = plugin.loadAsync(scene, data, "root/");
  assert.equal(returned, result.promise);
  assert.deepEqual(seen, [plugin, scene, data, "root/"]);
  result.resolve();
  plugin.onCompleteObservable.notifyObservers();
  await flush();
  assert.deepEqual(
    Object.getOwnPropertyDescriptor(plugin, "loadAsync"),
    descriptor,
  );
  assert.equal(Object.hasOwn(plugin, "importMeshAsync"), false);
  assert.equal(guard.stats.activeLoaders, 0);
  plugin.dispose();
  guard.dispose();
});

test("rejection/disposal restore owned descriptors without clobbering another wrapper, and unwrappable entries are explicit", async (t) => {
  const { scene } = fixture(t);
  const guard = new GltfLightBudget(scene);
  const plugin = new GLTFFileLoader();
  const failure = new Error("fixture rejection");
  const original = () => Promise.reject(failure);
  plugin.loadAsync = original;
  SceneLoader.OnPluginActivatedObservable.notifyObservers(plugin);
  await assert.rejects(
    plugin.loadAsync(
      scene,
      { json: { asset: { version: "2.0" } }, bin: null },
      "",
    ),
    (error) => error === failure,
  );
  await flush();
  assert.equal(plugin.loadAsync, original);
  assert.equal(guard.stats.activeLoaders, 0);
  const next = new GLTFFileLoader();
  SceneLoader.OnPluginActivatedObservable.notifyObservers(next);
  const otherOwner = () => Promise.resolve();
  next.loadAsync = otherOwner;
  const sealed = new GLTFFileLoader();
  const sealedReturn = Promise.resolve();
  Object.defineProperty(sealed, "loadAsync", {
    configurable: false,
    writable: false,
    value: () => sealedReturn,
  });
  Object.preventExtensions(sealed);
  SceneLoader.OnPluginActivatedObservable.notifyObservers(sealed);
  assert.equal(
    sealed.loadAsync(
      scene,
      { json: { asset: { version: "2.0" } }, bin: null },
      "",
    ),
    sealedReturn,
  );
  assert.ok(guard.stats.unwrappedEntryPoints >= 5);
  guard.dispose();
  guard.dispose();
  assert.equal(next.loadAsync, otherOwner);
  plugin.dispose();
  next.dispose();
});

test("two scene guards share one bridge and lifecycle; frozen materials remain untouched", async (t) => {
  const first = fixture(t),
    second = fixture(t, 2);
  await flush();
  const before = SceneLoader.OnPluginActivatedObservable.observers.length;
  const a = new GltfLightBudget(first.scene),
    b = new GltfLightBudget(second.scene);
  assert.equal(
    SceneLoader.OnPluginActivatedObservable.observers.length,
    before + 1,
  );
  first.material.freeze();
  await Promise.all([loadEmpty(first.scene), loadEmpty(second.scene)]);
  assert.equal(first.material.maxSimultaneousLights, 43);
  assert.ok(a.stats.skippedFrozenVisits > 0);
  assert.equal(second.material.maxSimultaneousLights, 4);
  first.material.unfreeze();
  a.update();
  assert.equal(first.material.maxSimultaneousLights, 5);
  a.dispose();
  await flush();
  assert.equal(
    SceneLoader.OnPluginActivatedObservable.observers.length,
    before + 1,
  );
  b.dispose();
  await flush();
  assert.equal(
    SceneLoader.OnPluginActivatedObservable.observers.length,
    before,
  );
});
