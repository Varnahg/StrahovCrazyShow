import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { setImmediate as immediate, setTimeout as delay } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { SceneLoader, LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { GLTFFileLoader, GLTFLoaderState } from "@babylonjs/loaders/glTF/glTFFileLoader";
import { registerGLTFExtension, unregisterGLTFExtension } from "@babylonjs/loaders/glTF/2.0/glTFLoaderExtensionRegistry";
import "@babylonjs/loaders/glTF";
import { GltfLightBudget } from "./client/gltf-light-budget";
import "./client/render-shaders";

const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const require = createRequire(import.meta.url), loaderRequire = createRequire(require.resolve("@babylonjs/loaders/package.json"));
const core = realpathSync(require.resolve("@babylonjs/core/package.json"));
assert.equal(core, realpathSync(loaderRequire.resolve("@babylonjs/core/package.json")));
const inputs: Record<string, string> = {};
for (const name of ["@babylonjs/core/scene.pure.js", "@babylonjs/core/Materials/materialHelper.functions.js",
  "@babylonjs/core/Materials/PBR/pbrBaseMaterial.pure.js", "@babylonjs/loaders/glTF/2.0/glTFLoader.pure.js"])
  inputs[name] = hash(readFileSync(require.resolve(name)));
assert.equal(inputs["@babylonjs/core/Materials/materialHelper.functions.js"], "a6d21d15070f52d3a94ec7fd40eb22356a76a723165ce05afa67dbeded0e88ac");
const reports: any[] = [];
const startedAt = new Date().toISOString();
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
async function bounded<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Deadline: " + label)), 3000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
function tinyGlb() {
  const binary = Buffer.alloc(44);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((value, i) => binary.writeFloatLE(value, i * 4));
  [0, 1, 2].forEach((value, i) => binary.writeUInt16LE(value, 36 + i * 2));
  const json = Buffer.from(JSON.stringify({ asset: { version: "2.0" }, scene: 0,
    scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ name: "imported-default" }], buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }] }));
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 32); json.copy(padded);
  const bytes = Buffer.alloc(28 + padded.length + binary.length);
  bytes.writeUInt32LE(0x46546c67, 0); bytes.writeUInt32LE(2, 4); bytes.writeUInt32LE(bytes.length, 8);
  bytes.writeUInt32LE(padded.length, 12); bytes.writeUInt32LE(0x4e4f534a, 16); padded.copy(bytes, 20);
  const at = 20 + padded.length; bytes.writeUInt32LE(binary.length, at); bytes.writeUInt32LE(0x004e4942, at + 4); binary.copy(bytes, at + 8);
  return new Uint8Array(bytes);
}

type Mode = "late-observer" | "early-capture" | "declared-seven" | "declared-forty-two";
async function scenario(mode: Mode, checkBeforeRepair: boolean) {
  const engine = new NullEngine(), scene = new Scene(engine);
  const camera = new FreeCamera("bounded capture camera", new Vector3(0, 1, -5), scene);
  camera.setTarget(new Vector3(0, 1, 0)); scene.activeCamera = camera;
  const mesh = MeshBuilder.CreateBox("one owned receiver", {}, scene); mesh.position.y = 1;
  for (let i = 0; i < 42; i++) new DirectionalLight("registered " + i, Vector3.Down(), scene).setEnabled(i < 2);
  const guard = new GltfLightBudget(scene), entered = deferred(), release = deferred();
  const events: any[] = [], effects: any[] = [], detaches: (() => void)[] = [];
  let phase = "setup", own: PBRMaterial | undefined, container: Awaited<ReturnType<typeof LoadAssetContainerAsync>> | undefined;
  let loading: ReturnType<typeof LoadAssetContainerAsync> | undefined;
  const event = (name: string, more: Record<string, unknown> = {}) => events.push({ order: events.length, name, phase,
    cap: own?.maxSimultaneousLights ?? null, ready: guard.stats.loaderReady, active: guard.stats.activeLoaders,
    tracked: guard.stats.trackedMaterials, ...more });
  const observe = <T>(observable: { add(cb: (value: T) => void): any; remove(value: any): void }, callback: (value: T) => void) => {
    const observer = observable.add(callback); detaches.push(() => observable.remove(observer));
  };
  observe<any>(scene.onNewMaterialAddedObservable, material => { if (material === own) event("scene-added-own"); });
  const extension = "TEST_budget_capture_order";
  registerGLTFExtension(extension, false, () => ({ name: extension, enabled: true,
    onReady() { phase = "awaited-ready-gap"; event("extension-onReady-enter"); entered.resolve(); return release.promise; }, dispose() {} }));
  observe<any>(SceneLoader.OnPluginActivatedObservable, plugin => {
    if (!(plugin instanceof GLTFFileLoader)) return;
    observe<any>(plugin.onMaterialLoadedObservable, material => {
      if (material.getScene() !== scene || material.name !== "imported-default") return;
      assert.equal(own, undefined);
      phase = "material-loaded-callback";
      own = new PBRMaterial("own non-glTF PBR", scene); mesh.material = own;
      assert.ok(scene.materials.includes(own), "own material is registered, unlike imported AssetContainer material");
      event("own-created", { importedCap: material.maxSimultaneousLights });
      observe<any>(own.onEffectCreatedObservable, ({ effect }) => {
        effects.push({ phase, cap: own!.maxSimultaneousLights, id: effect.uniqueId, defines: effect.defines, ready: effect.isReady() });
      });
      if (mode === "early-capture") { guard.prepareFrame(); event("explicit-early-prepareFrame"); }
      if (mode.startsWith("declared-")) {
        assert.equal(guard.declareBudget(own, mode === "declared-seven" ? 7 : 42), true);
        event("explicit-declareBudget");
      }
    });
    observe<any>(plugin.onLoaderStateChangedObservable, state => event("loader-state", { state, stateName: GLTFLoaderState[state] }));
    observe<any>(plugin.onCompleteObservable, () => event("loader-complete"));
  });
  const row: any = { mode, checkBeforeRepair, events, effects, registeredLights: 42, enabledLights: 2 };
  reports.push(row);
  async function readiness(label: string) {
    phase = label;
    for (let i = 0; i < 24; i++) {
      scene.incrementRenderId();
      // Same public mesh readiness and temporary camera pass as Game.isMeshReadyForCamera.
      const previousPass = engine.currentRenderPassId;
      let ready: boolean, effect: any, defines: any;
      try {
        engine.currentRenderPassId = camera.renderPassId;
        ready = mesh.isReady(true);
        const wrapper = mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)!;
        effect = wrapper.effect; defines = wrapper.defines;
      } finally { engine.currentRenderPassId = previousPass; }
      if (ready && effect?.isReady() && defines.MAXLIGHTCOUNT === own!.maxSimultaneousLights &&
        effect.defines.includes("#define MAXLIGHTCOUNT " + own!.maxSimultaneousLights + "\n")) {
        const sample = { label, cap: own!.maxSimultaneousLights, maxLightCount: defines.MAXLIGHTCOUNT,
          lightCount: defines.LIGHTCOUNT, pass: camera.renderPassId, id: effect.uniqueId, defines: effect.defines };
        event("readiness-ready", { effect: effect.uniqueId, maxLightCount: defines.MAXLIGHTCOUNT });
        return sample;
      }
      await immediate();
    }
    throw Error("Readiness did not settle: " + label);
  }
  try {
    const bytes = tinyGlb(); row.asset = { bytes: bytes.length, sha256: hash(bytes) };
    phase = "load-start";
    loading = LoadAssetContainerAsync(bytes, scene, { pluginExtension: ".glb" });
    void loading.catch(() => {});
    await bounded(Promise.race([entered.promise, loading.then(() => { throw Error("Loader escaped the READY gate"); })]), "enter READY gap");
    assert.ok(own); assert.equal(own.maxSimultaneousLights, 42); assert.equal(guard.stats.loaderReady, 0);
    assert.equal(guard.stats.activeLoaders, 1);
    // Let the actual Scene.SetImmediate notification run while READY is held.
    await delay(5); event("after-deferred-scene-observer");
    const creation = events.findIndex(e => e.name === "own-created"),
      inflation = events.findIndex(e => e.name === "extension-onReady-enter"),
      delivery = events.findIndex(e => e.name === "scene-added-own");
    assert.ok(creation >= 0 && inflation > creation && delivery > inflation);
    assert.equal(events[creation].cap, 4); assert.equal(events[delivery].cap, 42);
    if (checkBeforeRepair) row.before = await bounded(readiness("readiness-before-prepareFrame"), "pre-repair effect");
    phase = "prepareFrame"; guard.prepareFrame(); event("after-prepareFrame");
    const expected = mode === "early-capture" ? 4 : mode === "declared-seven" ? 7 : 42;
    assert.equal(own.maxSimultaneousLights, expected);
    row.after = await bounded(readiness("readiness-after-prepareFrame"), "post-repair effect");
    assert.equal(row.after.lightCount, 2);
    if (row.before) {
      assert.equal(row.before.lightCount, 2);
      assert.equal(row.before.cap, 42);
      assert.equal(row.before.pass, row.after.pass);
      assert.equal(row.before.id === row.after.id, expected === 42);
      const beforeLines = row.before.defines.split("\n"), afterLines = row.after.defines.split("\n");
      row.defineDifference = { beforeOnly: beforeLines.filter((line: string) => !afterLines.includes(line)),
        afterOnly: afterLines.filter((line: string) => !beforeLines.includes(line)) };
    } else assert.ok(effects.every(e => e.cap === 4), "proper prepare-before-check never requests the inflated variant");
    let drawn = false;
    observe<any>(mesh.onAfterRenderObservable, () => {
      if (engine.currentRenderPassId === camera.renderPassId) drawn = true;
    });
    phase = "actual-render"; scene.render();
    assert.equal(drawn, true);
    assert.equal(mesh.subMeshes[0]._getDrawWrapper(camera.renderPassId)?.effect?.uniqueId, row.after.id);
    row.actualMainDrawAfterRepair = true;
    phase = "release-ready"; release.resolve(); container = await bounded(loading, "load completion");
    assert.ok(container.materials.some(material => material instanceof PBRMaterial));
    await delay(5); guard.prepareFrame(); event("after-READY-COMPLETE");
    assert.equal(guard.stats.loaderReady, 1); assert.equal(guard.stats.activeLoaders, 0);
    assert.equal(own.maxSimultaneousLights, expected);
    row.final = { cap: own.maxSimultaneousLights, stats: { ...guard.stats } };
    row.pass = true;
  } catch (error) { row.error = String(error); throw error; }
  finally {
    release.resolve();
    try { if (!container && loading) container = await bounded(loading, "cleanup loader"); }
    finally {
      for (const detach of detaches.reverse()) detach();
      unregisterGLTFExtension(extension); container?.dispose(); guard.dispose(); scene.dispose(); engine.dispose();
      row.cleanup = { sceneDisposed: scene.isDisposed, engineDisposed: engine.isDisposed, activeLoaders: guard.stats.activeLoaders };
      assert.equal(scene.isDisposed, true); assert.equal(engine.isDisposed, true);
    }
  }
}

for (const [mode, check] of [["late-observer", true], ["early-capture", true], ["early-capture", false],
  ["declared-seven", true], ["declared-forty-two", true]] as const)
  test(mode + " / pre-repair readiness=" + check, { timeout: 10000 }, () => scenario(mode, check));

after(() => {
  for (const [name, sha256] of Object.entries(inputs)) assert.equal(hash(readFileSync(require.resolve(name))), sha256);
  writeFileSync(new URL("report.json", import.meta.url), JSON.stringify({ startedAt, endedAt: new Date().toISOString(),
    sourceSnapshotId: "bf28a56507b6b0650d214169c8cf94aa3b2d8abc4012a8b098e4e1366340c8c0",
    core, inputs, dependenciesUnchanged: true, results: reports, limits: ["Controlled async ordering via real glTF extension and native deferred Scene observer.",
      "NullEngine/GLSL readiness and Effect identity; not GPU work or production timing attribution.",
      "42 registered lights, only2 enabled; unlike WebGPU this NullEngine fixture has no UBO-capability clamp.",
      "Own PBR creation in materialLoaded callback models a foreign producer; no runtime material setter/guard patch."] }, null, 2) + "\n");
});
