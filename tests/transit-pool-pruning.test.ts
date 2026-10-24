import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { AssetContainer } from "@babylonjs/core/assetContainer";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { InstancedMesh } from "@babylonjs/core/Meshes/instancedMesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { groundRotation } from "../shared/terrain-entities";
import { groundHeight } from "../shared/terrain";
import { b6EntranceHeight } from "../shared/b6-interior";
import { commonEntranceHeight } from "../shared/landmark-reality";
import {
  transitStatus,
  passengerSupportHeight,
  type TransitFrame,
  type TransitPassenger,
} from "../shared/transit";
import { DEFAULT_AVATAR } from "../shared/types";
import {
  AvatarPrimitivePool,
  createAvatarRig,
} from "../client/avatar-renderer";
import { AvatarAnimator } from "../client/animation";
import { AvatarLodController } from "../client/avatar-lod";
import { applyAvatarPreset } from "../client/avatar-presets";
import type { CharacterMaterials } from "../client/character-materials";
import type {
  TransitRenderer,
  TransitRenderInput,
} from "../client/transit-renderer";
import busManifest from "../shared/data/assets/transit-manifest.json";
import carManifest from "../shared/data/assets/vehicles-manifest.json";

// Execute the entire current production class, including field initialization,
// constructor, both loader guards and teardown. Only feed and asset IO are replaced.
const source = ts.createSourceFile(
  "transit-renderer.ts",
  readFileSync(
    new URL("../client/transit-renderer.ts", import.meta.url),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const rendererClass = source.statements.find(
  (node): node is ts.ClassDeclaration =>
    ts.isClassDeclaration(node) && node.name?.text === "TransitRenderer",
)!;
assert.ok(rendererClass);
const compiled = ts.transpileModule(rendererClass.getText(source), {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.CommonJS,
  },
}).outputText;
const makeRenderer = new Script(`(function(env) {
  const { TransformNode, Mesh, MeshBuilder, LoadAssetContainerAsync,
    StandardMaterial, DynamicTexture, Texture, Color3, Quaternion,
    groundRotation, groundHeight, b6EntranceHeight, commonEntranceHeight, passengerSupportHeight,
    sampleTransit, AvatarPrimitivePool, createAvatarRig, AvatarAnimator,
    AvatarLodController, acquireCarPack, CAR_PACK_MANIFEST, busManifest } = env;
  const exports = {};
  ${compiled}
  return exports.TransitRenderer;
})`).runInThisContext();

type PassengerVisual = {
  rig: ReturnType<typeof createAvatarRig>;
  animation: AvatarAnimator;
  lod: AvatarLodController;
};
type RendererState = {
  pool: AvatarPrimitivePool;
  passengers: Map<string, PassengerVisual>;
  busSources: Mesh[];
  busLowSources: Mesh[];
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

function passenger(id: string, x = 0): TransitPassenger {
  return {
    id,
    tripId: "fixture-trip",
    destination: "fixture",
    stopId: "fixture-stop",
    position: { x, y: groundHeight(x, 0), z: 0 },
    yaw: 0,
    speed: 0,
    atEntrance: false,
    opacity: 1,
    avatar: { ...applyAvatarPreset(3, DEFAULT_AVATAR), glasses: true },
  };
}

function fixture(t: TestContext, holdAssets = false) {
  const engine = new NullEngine(),
    scene = new Scene(engine);
  const camera = new FreeCamera("transit test camera", new Vector3(), scene);
  const frame: TransitFrame = {
    buses: [],
    traffic: [],
    passengers: [],
    status: transitStatus(Date.UTC(2026, 9, 20)),
  };
  const buses = [0, 1].map((index) => {
    const container = new AssetContainer(scene);
    const mesh = MeshBuilder.CreateBox(`Body fixture ${index}`, {}, scene);
    const material = new StandardMaterial(`bus fixture ${index}`, scene);
    mesh.material = material;
    container.meshes.push(mesh);
    container.materials.push(material);
    return { container, mesh, ready: deferred<AssetContainer>() };
  });
  let releases = 0,
    samples = 0;
  let groundFault: number | undefined;
  const car = {
    pack: { setQuality() {} },
    release() {
      releases++;
    },
  };
  const carReady = deferred<typeof car>();
  let busIndex = 0;
  const Renderer = makeRenderer({
    TransformNode,
    Mesh,
    MeshBuilder,
    StandardMaterial,
    DynamicTexture,
    Texture,
    Color3,
    Quaternion,
    groundRotation,
    groundHeight,
    b6EntranceHeight,
    commonEntranceHeight,
    passengerSupportHeight,
    AvatarPrimitivePool,
    createAvatarRig,
    AvatarAnimator,
    AvatarLodController,
    busManifest,
    CAR_PACK_MANIFEST: carManifest,
    sampleTransit() {
      samples++;
      return frame;
    },
    LoadAssetContainerAsync() {
      return buses[busIndex++].ready.promise;
    },
    acquireCarPack() {
      return carReady.promise;
    },
  }) as typeof TransitRenderer;
  const renderer = new Renderer(scene, (x, z) => {
    if (groundFault === x) {
      groundFault = undefined;
      throw new Error("interrupted ground update");
    }
    return groundHeight(x, z);
  });
  const state = renderer as unknown as RendererState;
  const sweptIds: string[][] = [];
  const prune = state.pool.pruneUnused.bind(state.pool);
  const sweeps = t.mock.method(state.pool, "pruneUnused", () => {
    sweptIds.push([...state.passengers.keys()]);
    return prune();
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    renderer.dispose();
  };
  t.after(() => {
    dispose();
    scene.dispose();
    engine.dispose();
  });
  const completeAssets = () => {
    for (const bus of buses) bus.ready.resolve(bus.container);
    carReady.resolve(car);
  };
  if (!holdAssets) completeAssets();
  return {
    scene,
    renderer,
    state,
    frame,
    buses,
    sweptIds,
    sweeps,
    dispose,
    completeAssets,
    get releases() {
      return releases;
    },
    get samples() {
      return samples;
    },
    failNextGround(x = 0) {
      groundFault = x;
    },
    update(options: Partial<TransitRenderInput> = {}) {
      renderer.update({
        now: Date.UTC(2026, 9, 20),
        dt: 1 / 60,
        quality: "low",
        player: { x: 0, y: groundHeight(0, 0), z: 0 },
        ...options,
      });
    },
    view(distance: number) {
      camera.position.set(0, groundHeight(0, 0), -distance);
      camera.computeWorldMatrix();
    },
    npc(id: string) {
      const npc = state.passengers.get(id);
      assert.ok(npc, `missing passenger ${id}`);
      return npc;
    },
  };
}

function resources(npc: PassengerVisual) {
  const instance = npc.rig.root
    .getChildMeshes()
    .find(
      (mesh): mesh is InstancedMesh =>
        mesh instanceof InstancedMesh && mesh.name.endsWith(" glasses frames"),
    )!;
  const body = npc.rig.skinnedBody!.near.find(
    (mesh) => mesh.metadata?.characterSurface === "skin",
  )!;
  assert.ok(instance);
  assert.ok(body?.material);
  return {
    instance,
    source: instance.sourceMesh,
    body,
    material: body.material,
  };
}

test("empty and not-yet-loaded transit never sweep; first construction sweeps once after all NPCs", async (t) => {
  const f = fixture(t, true);
  f.update();
  assert.equal(f.samples, 0);
  f.completeAssets();
  await f.renderer.ready;
  f.update();
  f.update();
  assert.equal(f.sweeps.mock.callCount(), 0);
  f.frame.passengers = [passenger("A"), passenger("B", 1)];
  f.view(2);
  f.update();
  assert.deepEqual(f.sweptIds, [["A", "B"]]);
  assert.equal(f.renderer.counts.passengers, 2);
  const sources = f.scene.meshes.filter((mesh) =>
    mesh.name.startsWith("avatar source "),
  ) as Mesh[];
  assert.ok(sources.length > 0);
  assert.ok(
    sources.every((mesh) => mesh.instances.length > 0),
    "construction leftovers are pruned",
  );
  const a = f.npc("A"),
    b = f.npc("B");
  for (let i = 0; i < 24; i++) {
    f.frame.passengers[0].position.x += 0.01;
    f.frame.passengers[0].yaw += 0.02;
    f.update();
  }
  assert.equal(f.npc("A"), a);
  assert.equal(f.npc("B"), b);
  assert.equal(f.sweeps.mock.callCount(), 1);
  assert.ok(Number.isFinite(a.rig.leftKnee.rotation.x));
});

test("stable near/medium/far/hidden and opacity changes retain the same live details without sweeping", async (t) => {
  const f = fixture(t);
  await f.renderer.ready;
  f.frame.passengers = [passenger("A")];
  f.view(2);
  f.update();
  const npc = f.npc("A"),
    owned = resources(npc);
  const near = npc.rig.root
    .getChildMeshes()
    .filter((mesh) => f.scene.meshes.includes(mesh));
  for (const [distance, opacity, level, visible] of [
    [20, 1, "medium", true],
    [80, 1, "far", true],
    [80, 0, "far", false],
    [2, 0.005, "near", false],
    [2, 0.02, "near", true],
    [2, 0.5, "near", true],
  ] as const) {
    f.view(distance);
    f.frame.passengers[0].opacity = opacity;
    f.update();
    assert.equal(npc.lod.level, level);
    assert.equal(npc.rig.root.isEnabled(), visible);
    assert.equal(npc.lod.counts.registered > 0, visible);
    assert.equal(owned.instance.isDisposed(), false);
    assert.equal(owned.source.isDisposed(), false);
    assert.ok(f.scene.materials.includes(owned.material));
    assert.equal(f.sweeps.mock.callCount(), 1);
  }
  assert.ok(
    near.every((mesh) => f.scene.meshes.includes(mesh) && mesh.isEnabled()),
  );
  assert.equal(resources(npc).material, owned.material);
});

for (const survivor of ["near", "medium", "far", "hidden"] as const) {
  test(`removing a shared owner preserves the ${survivor} rig, then last removal prunes and recreation is live`, async (t) => {
    const f = fixture(t);
    await f.renderer.ready;
    f.frame.passengers = [passenger("A"), passenger("B")];
    f.view(2);
    f.update();
    const a = f.npc("A"),
      b = f.npc("B");
    const owned = resources(b);
    assert.equal(resources(a).source, owned.source);
    assert.equal(resources(a).material, owned.material);
    f.view(survivor === "near" ? 2 : survivor === "medium" ? 20 : 80);
    if (survivor === "hidden") f.frame.passengers[1].opacity = 0;
    f.update();
    const proxy = b.rig.root
      .getChildMeshes()
      .find(
        (mesh): mesh is InstancedMesh =>
          mesh instanceof InstancedMesh &&
          mesh.name.endsWith(" far silhouette"),
      );
    f.frame.passengers.shift();
    f.update();
    assert.equal(a.rig.root.isDisposed(), true);
    assert.equal(f.npc("B"), b);
    assert.equal(f.sweeps.mock.callCount(), 2);
    assert.equal(owned.source.isDisposed(), false);
    assert.equal(owned.body.isDisposed(), false);
    assert.ok(f.scene.materials.includes(owned.material));
    if (proxy) {
      assert.equal(proxy.isDisposed(), false);
      assert.equal(proxy.sourceMesh.isDisposed(), false);
      assert.ok(f.scene.materials.includes(proxy.material!));
    }
    if (survivor === "far" || survivor === "hidden")
      assert.equal(f.scene.meshes.includes(owned.body), false);
    f.view(2);
    f.frame.passengers[0].opacity = 1;
    f.update();
    assert.ok(f.scene.meshes.includes(owned.instance));
    assert.ok(f.scene.meshes.includes(owned.body));
    assert.equal(owned.instance.isEnabled(), true);
    assert.equal(f.sweeps.mock.callCount(), 2);
    f.frame.passengers = [];
    f.update();
    assert.equal(f.sweeps.mock.callCount(), 3);
    assert.equal(owned.instance.isDisposed(), true);
    assert.equal(owned.source.isDisposed(), true);
    assert.equal(f.scene.materials.includes(owned.material), false);
    if (proxy) assert.equal(proxy.sourceMesh.isDisposed(), true);
    f.frame.passengers = [passenger("B")];
    f.update();
    const replacement = resources(f.npc("B"));
    assert.notEqual(replacement.source, owned.source);
    assert.notEqual(replacement.material, owned.material);
    assert.equal(replacement.instance.isDisposed(), false);
    assert.equal(replacement.source.isDisposed(), false);
    assert.ok(f.scene.materials.includes(replacement.material));
    assert.equal(f.sweeps.mock.callCount(), 4);
  });
}

test("same-count identity replacement and multiple mutations each sweep only once at the end", async (t) => {
  const f = fixture(t);
  await f.renderer.ready;
  f.view(2);
  f.frame.passengers = [passenger("A"), passenger("B", 1)];
  f.update();
  const a = f.npc("A"),
    b = f.npc("B");
  f.frame.passengers = [passenger("C"), passenger("B", 1)];
  f.update();
  assert.equal(a.rig.root.isDisposed(), true);
  assert.equal(f.npc("B"), b);
  assert.deepEqual(f.sweptIds[1], ["B", "C"]);
  const c = f.npc("C");
  f.frame.passengers = [passenger("D"), passenger("E", 1), passenger("F", 2)];
  f.update();
  assert.equal(b.rig.root.isDisposed(), true);
  assert.equal(c.rig.root.isDisposed(), true);
  assert.deepEqual(f.sweptIds, [
    ["A", "B"],
    ["B", "C"],
    ["D", "E", "F"],
  ]);
  f.update();
  assert.equal(f.sweeps.mock.callCount(), 3);
});

test("pending cleanup survives a real rig creation followed by an interrupted update", async (t) => {
  const f = fixture(t);
  await f.renderer.ready;
  f.view(2);
  f.frame.passengers = [passenger("A")];
  f.failNextGround();
  assert.throws(() => f.update(), /interrupted ground update/);
  const npc = f.npc("A");
  assert.equal(npc.rig.root.isDisposed(), false);
  assert.equal(f.sweeps.mock.callCount(), 0);
  f.update();
  assert.equal(f.npc("A"), npc);
  assert.equal(f.sweeps.mock.callCount(), 1);
  f.update();
  assert.equal(f.sweeps.mock.callCount(), 1);
});

test("pending cleanup survives removal followed by an interrupted update of the unchanged survivor", async (t) => {
  const f = fixture(t);
  await f.renderer.ready;
  f.view(2);
  f.frame.passengers = [passenger("A"), passenger("B", 1)];
  f.update();
  const removed = f.npc("A"),
    survivor = f.npc("B");
  f.frame.passengers.shift();
  f.failNextGround(1);
  assert.throws(() => f.update(), /interrupted ground update/);
  assert.equal(removed.rig.root.isDisposed(), true);
  assert.equal(f.renderer.counts.passengers, 1);
  assert.equal(f.sweeps.mock.callCount(), 1);
  f.update();
  assert.equal(f.npc("B"), survivor);
  assert.ok(f.scene.materials.includes(resources(survivor).material));
  assert.equal(f.sweeps.mock.callCount(), 2);
  f.update();
  assert.equal(f.sweeps.mock.callCount(), 2);
});

test("a partially completed real prune retries on a stable frame and clears pending only after success", async (t) => {
  const f = fixture(t);
  await f.renderer.ready;
  f.frame.passengers = [passenger("A")];
  f.view(2);
  f.update();
  const unused = resources(f.npc("A"));
  const materials = (
    f.state.pool as unknown as {
      characterMaterials: CharacterMaterials;
    }
  ).characterMaterials;
  const pruneMaterials = materials.prune.bind(materials);
  let fail = true;
  t.mock.method(
    materials,
    "prune",
    (used: Parameters<CharacterMaterials["prune"]>[0]) => {
      pruneMaterials(used);
      if (fail) {
        fail = false;
        throw new Error("interrupted real prune");
      }
    },
  );
  f.frame.passengers = [];
  assert.throws(() => f.update(), /interrupted real prune/);
  assert.equal(unused.source.isDisposed(), true);
  assert.equal(f.scene.materials.includes(unused.material), false);
  assert.equal(f.renderer.counts.passengers, 0);
  const attempts = f.sweeps.mock.callCount();
  f.update();
  assert.equal(f.sweeps.mock.callCount(), attempts + 1);
  f.update();
  assert.equal(f.sweeps.mock.callCount(), attempts + 1);
});

test("full dispose releases live and detached rigs and the pool even with cleanup pending", async (t) => {
  const f = fixture(t);
  await f.renderer.ready;
  f.frame.passengers = [passenger("A"), passenger("B", 1)];
  f.view(80);
  f.update();
  f.frame.passengers[1].opacity = 0;
  f.update();
  const people = [f.npc("A"), f.npc("B")];
  const owned = people.map(resources);
  f.frame.passengers.push(passenger("C", 2));
  f.failNextGround(2);
  assert.throws(() => f.update(), /interrupted ground update/);
  people.push(f.npc("C"));
  const meshes = people.flatMap((npc) => npc.rig.root.getChildMeshes());
  const sources = [...f.state.busSources, ...f.state.busLowSources];
  assert.equal(sources.length, 2);
  const samples = f.samples,
    sweeps = f.sweeps.mock.callCount();
  f.dispose();
  assert.ok(people.every((npc) => npc.rig.root.isDisposed()));
  assert.ok(meshes.every((mesh) => mesh.isDisposed()));
  assert.ok(owned.every((r) => r.source.isDisposed() && r.body.isDisposed()));
  assert.ok(owned.every((r) => !f.scene.materials.includes(r.material)));
  assert.ok(sources.every((mesh) => mesh.isDisposed()));
  assert.equal(
    f.scene.meshes.some((mesh) =>
      /^(avatar source |avatar LOD source)/.test(mesh.name),
    ),
    false,
  );
  assert.deepEqual(f.renderer.counts, { buses: 0, passengers: 0, cars: 0 });
  assert.equal(f.releases, 1);
  f.update();
  assert.equal(f.samples, samples);
  assert.equal(f.sweeps.mock.callCount(), sweeps);
});

test("loaders completed after dispose release their containers and handle without reviving the renderer", async (t) => {
  const f = fixture(t, true);
  f.frame.passengers = [passenger("late")];
  f.dispose();
  f.completeAssets();
  await f.renderer.ready;
  assert.ok(f.buses.every((bus) => bus.mesh.isDisposed()));
  assert.equal(f.state.busSources.length, 0);
  assert.equal(f.state.busLowSources.length, 0);
  assert.equal(f.releases, 1);
  f.update();
  assert.equal(f.samples, 0);
  assert.equal(f.sweeps.mock.callCount(), 0);
  assert.equal(f.renderer.counts.passengers, 0);
});

test("actual NPC renderer stands on native B6 landing instead of legacy entrance height", async (t) => {
  const f = fixture(t), p = passenger("native-b6");
  await f.renderer.ready;
  p.position = {x: -4.91535, y: 0, z: -77.63486};
  f.frame.passengers = [p];
  f.update({player: p.position});
  assert.ok(Math.abs(f.npc(p.id).rig.root.position.y - 2.1962777093118495) < 1e-5);
});
