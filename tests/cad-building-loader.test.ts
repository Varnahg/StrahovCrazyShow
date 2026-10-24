import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { osmAssetIdentity } from "../shared/world-asset-identity";
import { loadCadBuildings, type CadBuildingAsset } from "../client/cad-buildings";
import { Script } from "node:vm";
import ts from "typescript";
import { readGameSource } from "./helpers/game-source";

const asset: CadBuildingAsset = {
  id: "b01", identity: osmAssetIdentity("building", "way", "53929063"),
  url: "/models/cad-buildings/b01.glb?v=fixture", glbSha256: "fixture",
  sourceRecipeSha256: "fixture-recipe",
  placement: { translation: { x: 11, y: 4.2, z: -7 }, yaw: Math.PI / 2 },
};
function sceneFixture(t: import("node:test").TestContext) {
  const engine = new NullEngine();
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  t.after(() => { scene.dispose(); engine.dispose(); });
  return scene;
}
function containerFixture(scene: Scene, descriptor = asset) {
  const container = new AssetContainer(scene);
  const nativeRoot = new TransformNode(descriptor.identity.key, scene);
  nativeRoot.metadata = { gltf: { extras: {
    buildingId: descriptor.id, sourceRecipeSha256: descriptor.sourceRecipeSha256,
  } } };
  const mesh = MeshBuilder.CreateBox("native-piece", {}, scene);
  mesh.position.set(2, 1, 3); mesh.parent = nativeRoot;
  mesh.metadata = { gltf: { extras: { floorId: "n01", role: "wall" } } };
  const material = new StandardMaterial("native-material", scene);
  material.diffuseColor.set(0.23, 0.41, 0.52); mesh.material = material;
  container.transformNodes.push(nativeRoot); container.meshes.push(mesh);
  container.materials.push(material); container.rootNodes.push(nativeRoot);
  container.removeAllFromScene();
  let disposals = 0;
  const originalDispose = container.dispose.bind(container);
  container.dispose = () => { disposals++; originalDispose(); };
  return { container, nativeRoot, mesh, material, disposals: () => disposals };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("CAD loader zachová native geometrii, materiál a jediný world transform", async (t) => {
  const scene = sceneFixture(t), native = containerFixture(scene);
  const controller = await loadCadBuildings(scene, [asset], {
    loadContainer: async (url, receivedScene) => {
      assert.equal(url, asset.url); assert.equal(receivedScene, scene);
      return native.container;
    },
  });
  const actual = Vector3.TransformCoordinates(Vector3.Zero(), native.mesh.computeWorldMatrix(true));
  assert.ok(Vector3.Distance(actual, new Vector3(14, 5.2, -9)) < 1e-5, JSON.stringify({ actual,
    nativeParent: native.nativeRoot.parent?.name,
    pivot: scene.getTransformNodeByName("cad-building:b01")?.position,
    root: scene.getTransformNodeByName("world-asset:" + asset.identity.key)?.position }));
  assert.deepEqual(controller.stats, { buildings: 1, meshes: 1, materials: 1 });
  assert.equal(native.mesh.metadata.gltf.extras.role, "wall");
  assert.equal(native.mesh.metadata.assetKey, asset.identity.key);
  assert.equal(native.mesh.receiveShadows, true);
  assert.equal(native.material.diffuseColor.r, 0.23);
  controller.dispose(); controller.dispose();
  assert.equal(native.disposals(), 1);
  assert.equal(scene.meshes.length, 0); assert.equal(scene.transformNodes.length, 0);
  assert.equal(scene.materials.includes(native.material), false);
});

test("chybná identita nebo původ modelu se odmítne a uklidí", async (t) => {
  for (const field of ["buildingId", "sourceRecipeSha256"]) {
    const scene = sceneFixture(t), native = containerFixture(scene);
    native.nativeRoot.metadata.gltf.extras[field] = "wrong";
    await assert.rejects(loadCadBuildings(scene, [asset], {
      loadContainer: async () => native.container,
    }), /identitu a původ/);
    assert.equal(native.disposals(), 1); assert.equal(scene.meshes.length, 0);
    assert.equal(scene.transformNodes.length, 0);
  }
});

test("selhání dalšího modelu uklidí i již připojený první model", async (t) => {
  const scene = sceneFixture(t), native = containerFixture(scene);
  await assert.rejects(loadCadBuildings(scene, [asset, { ...asset, id: "b02" }], {
    loadContainer: async (url) => {
      if (scene.getTransformNodeByName("cad-building:b01")) throw new Error("download failed");
      assert.equal(url, asset.url); return native.container;
    },
  }), /download failed/);
  assert.equal(native.disposals(), 1); assert.equal(scene.transformNodes.length, 0);
});

test("zrušené načítání zlikviduje pozdní container bez připojení ke scéně", async (t) => {
  const scene = sceneFixture(t), native = containerFixture(scene), pending = deferred<AssetContainer>();
  const abort = new AbortController();
  const operation = loadCadBuildings(scene, [asset], { signal: abort.signal, loadContainer: () => pending.promise });
  abort.abort(); pending.resolve(native.container);
  await assert.rejects(operation, /zrušeno/);
  assert.equal(native.disposals(), 1); assert.equal(scene.meshes.length, 0);
  assert.equal(scene.transformNodes.length, 0);
});

test("dispose scény během čekání i po dokončení nezanechá vlastněný container", async (t) => {
  const scene = sceneFixture(t), pending = deferred<AssetContainer>();
  const operation = loadCadBuildings(scene, [asset], { loadContainer: () => pending.promise });
  // Separate scene models the late IO result without adding anything to an
  // already disposed Babylon scene while constructing this fixture.
  const lateScene = sceneFixture(t), late = containerFixture(lateScene);
  scene.dispose(); pending.resolve(late.container);
  await assert.rejects(operation, /zrušeno/); assert.equal(late.disposals(), 1);
  const liveScene = sceneFixture(t), live = containerFixture(liveScene);
  const controller = await loadCadBuildings(liveScene, [asset], { loadContainer: async () => live.container });
  liveScene.dispose(); controller.dispose(); assert.equal(live.disposals(), 1);
});

test("už zrušený vstup nezahájí IO a levotočivá scéna se nepřijme", async (t) => {
  const scene = sceneFixture(t), abort = new AbortController(); abort.abort();
  let calls = 0;
  await assert.rejects(loadCadBuildings(scene, [asset], {
    signal: abort.signal, loadContainer: async () => { calls++; throw new Error("unexpected IO"); },
  }), /zrušeno/);
  assert.equal(calls, 0);
  scene.useRightHandedSystem = false;
  await assert.rejects(loadCadBuildings(scene, [asset]), /pravotočivou/);
});

const gameSource = readGameSource();
const startupMembers = gameSource.selectMembers([
  "assertStartupActive", "disposeStartupAsset", "disposeStartupAssets",
  "trackStartupAsset", "loadCadBuildingsForStartup",
]);
const startupCode = ts.transpileModule(
  `class CadStartup { ${startupMembers.map(node => node.getText(gameSource.source)).join("\n")} }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
const StartupHarness = new Script(`(function(environment) {
  const {CAD_BUILDINGS, sessionDiagnostics} = environment;
  ${startupCode}; return CadStartup;
})`).runInThisContext()({ CAD_BUILDINGS: [asset], sessionDiagnostics: { event() {} } });
function startupFixture(scene: Scene) {
  return Object.assign(new StartupHarness(), {
    scene, canvas: { dataset: {} }, startupAssets: new Set(), startupAbort: new AbortController(),
    disposed: false, rendererFailed: false,
    renderHealth: { guard: (operation: Promise<unknown>) => operation,
      snapshot: () => ({ phase: "starting", errorCount: 0, firstErrors: [] }) },
  });
}

test("skutečný Game CAD startup propaguje chybu a nepředstírá připravenou budovu", async (t) => {
  const game = startupFixture(sceneFixture(t));
  await assert.rejects(game.loadCadBuildingsForStartup(async () => { throw new Error("unavailable model"); }), /unavailable model/);
  assert.equal(game.cadBuildings, undefined);
  assert.equal(game.canvas.dataset.cadStage, undefined);
  assert.equal(game.startupAssets.size, 0);
});

test("skutečný Game převezme vlastnictví jen za aktivního startupu", async (t) => {
  const scene = sceneFixture(t), game = startupFixture(scene), native = containerFixture(scene);
  await game.loadCadBuildingsForStartup((received: Scene, assets: CadBuildingAsset[], options: {signal: AbortSignal}) =>
    loadCadBuildings(received, assets, { ...options, loadContainer: async () => native.container }));
  assert.equal(game.canvas.dataset.cadStage, "ready");
  assert.equal(game.startupAssets.size, 0); assert.equal(game.cadBuildings.stats.meshes, 1);
  game.cadBuildings.dispose(); assert.equal(native.disposals(), 1);
  const lateGame = startupFixture(sceneFixture(t)), pending = deferred<import("../client/cad-buildings").CadBuildingsController>();
  let disposed = 0;
  const operation = lateGame.loadCadBuildingsForStartup(() => pending.promise);
  lateGame.disposed = true; lateGame.startupAbort.abort();
  pending.resolve({ stats: { buildings: 1, meshes: 1, materials: 1 }, dispose() { disposed++; } });
  await assert.rejects(operation, { name: "AbortError" });
  assert.equal(disposed, 1); assert.equal(lateGame.cadBuildings, undefined);
  assert.equal(lateGame.startupAssets.size, 0);
});

test("Game čeká na kritický CAD gate mimo catch volitelných náhrad", () => {
  const start = gameSource.selectMembers(["start"])[0];
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "loadCadBuildingsForStartup") calls.push(node);
    ts.forEachChild(node, visit);
  };
  visit(start); assert.equal(calls.length, 1);
  assert.ok(ts.isAwaitExpression(calls[0].parent), "Model musí být skutečně awaitovaný před hraním");
  for (let node: ts.Node | undefined = calls[0].parent; node && node !== start; node = node.parent)
    assert.ok(!ts.isTryStatement(node) || !node.catchClause, "Chybu modelu nesmí spolknout volitelná záloha");
});
