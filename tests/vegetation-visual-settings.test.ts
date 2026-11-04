import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as turn } from "node:timers/promises";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { loadVegetation } from "../client/vegetation";
import { PhotographicGrass } from "../client/photographic-grass";
import { GroundFlowers, type FlowerPack } from "../client/ground-flowers";
import { TreeRenderer } from "../client/tree-renderer";
import { acquireGrassResources } from "../client/photo-grass-resources";
import { CANDIDATE_LOD_TRIANGLES } from "../client/photo-grass-budget";
import type { GrassRootState, PhotoGrassBatch } from "../client/photo-grass-batch";
import "../client/render-shaders";

const pack = JSON.parse(readFileSync("public/models/vegetation/grass/geometry.json", "utf8"));
const recipe = JSON.parse(readFileSync("public/models/vegetation/grass/material.json", "utf8"));
const flowerPack = JSON.parse(readFileSync("public/models/vegetation/flowers/geometry.json", "utf8")) as FlowerPack;
const off = { groundVegetation: false, trees: "far-only" } as const;
const on = { groundVegetation: true, trees: "normal" } as const;
function sceneFixture(t: TestContext) {
  const engine = new NullEngine({ renderWidth: 1280, renderHeight: 720, textureSize: 1, deterministicLockstep: false, lockstepMaxSteps: 4 });
  engine.getCaps().instancedArrays = true;
  const scene = new Scene(engine); scene.useRightHandedSystem = true;
  const camera = new FreeCamera("visual settings", new Vector3(110.5, 1, 34.5), scene); camera.setTarget(new Vector3(110.5, 0, 38));
  t.after(() => { scene.dispose(); engine.dispose(); }); return { scene, engine };
}
async function resources(scene: Scene) {
  const lease = acquireGrassResources(scene, pack, recipe, 1024, (channel, gamma) => {
    const texture = new Texture("/fixture-visual-" + channel + ".png", scene, false, false); texture.gammaSpace = gamma;
    return { texture, ready: Promise.resolve() };
  }); await lease.ready; return lease;
}
async function flowers(scene: Scene) {
  const owner = new GroundFlowers(scene, flowerPack, channel => ({ texture: new Texture("/fixture-flower-" + channel, scene, false, false), ready: Promise.resolve() }));
  await owner.ready; return owner;
}

test("cold OFF does not call grass loader or construct legacy grass, lazy ON coalesces and late OFF stays hidden", async t => {
  const { scene } = sceneFixture(t); let loads = 0, finish!: (value: PhotographicGrass) => void;
  t.mock.method(TreeRenderer.prototype, "load", async () => {});
  t.mock.method(PhotographicGrass, "load", () => { loads++; return new Promise<PhotographicGrass>(resolve => finish = resolve); });
  t.mock.method(GroundFlowers, "load", flowers);
  const vegetation = await loadVegetation(scene, { visualFeatures: off }); t.after(() => vegetation.dispose());
  assert.equal(loads, 0); assert.equal(scene.meshes.length, 0);
  assert.equal(vegetation.grassPreparationRevision, undefined); assert.equal(vegetation.beginGrassPreparation(), undefined);
  const first = vegetation.setVisualFeatures(on), second = vegetation.setVisualFeatures(on);
  assert.equal(loads, 1);
  await vegetation.setVisualFeatures(off);
  const grass = new PhotographicGrass(scene, pack, recipe, await resources(scene)); finish(grass);
  await Promise.all([first, second]);
  assert.equal(grass.shaderPreparationRevision, undefined); assert.equal(grass.stats.draws, 0);
  assert.equal(vegetation.grassPreparationRevision, undefined);
  await vegetation.setVisualFeatures(on); assert.equal(loads, 1); assert.ok(grass.shaderPreparationRevision);
  const stop = vegetation.beginGrassPreparation(); assert.ok(stop);
  await vegetation.setVisualFeatures(off); stop();
  assert.ok(scene.meshes.filter(m => m.metadata?.photoGrassPreparation || m.metadata?.flowerPreparation).every(m => !m.isEnabled()));
});

test("ground OFF suppresses grass updates and helpers while retaining resources for a later ON", async t => {
  const { scene } = sceneFixture(t), lease = await resources(scene), flower = await flowers(scene);
  const grass = new PhotographicGrass(scene, pack, recipe, lease, flower); t.after(() => grass.dispose());
  const g = grass as any, batch = g.batches.get("far") as PhotoGrassBatch;
  const root: GrassRootState = { id: 1, tileId: "visible-test", x: 110, y: 0, z: 36, seed: .5, level: "far", slot: -1, fade: { from: 1, to: 1, startedAt: 0 } };
  batch.add(root, Float32Array.from(Matrix.Identity().asArray()), 0, 0, 0); batch.flush(); g.roots.set(root.id, root); g.submittedTriangles = CANDIDATE_LOD_TRIANGLES.far;
  const stop = grass.beginShaderPreparation()!;
  const update = t.mock.method(flower, "update");
  grass.setEnabled(false); stop();
  assert.equal(batch.mesh.isEnabled(), false); assert.equal(grass.stats.draws, 0); assert.equal(grass.stats.triangles, 0);
  assert.equal(grass.stats.preparing, false); assert.equal(grass.beginShaderPreparation(), undefined);
  const snapshot = JSON.stringify(grass.stats);
  for (let i = 0; i < 10; i++) grass.update({ time: i, quality: "high", wind: { x: 1, z: 1 } });
  assert.equal(update.mock.callCount(), 0); assert.equal(JSON.stringify(grass.stats), snapshot);
  assert.equal(lease.sources.get("far")!.isDisposed(), false);
  grass.setEnabled(true); assert.equal(grass.shaderPreparationRevision, lease);
  const currentStop = grass.beginShaderPreparation()!; stop();
  assert.ok(scene.meshes.some(m => m.metadata?.photoGrassPreparation && m.isEnabled())); currentStop();
});

test("a grass request disabled during resource loading never starts a later flower request", async t => {
  const { scene } = sceneFixture(t); let enabled = true, finish!: () => Promise<void>, flowerLoads = 0;
  t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => new Response(JSON.stringify(String(input).endsWith("geometry.json") ? pack : recipe)));
  t.mock.method(PhotographicGrass.prototype as any, "loadResources", function (this: any) {
    return new Promise<void>(resolve => { finish = async () => { this.installResources(await resources(scene)); resolve(); }; });
  });
  t.mock.method(GroundFlowers, "load", async () => { flowerLoads++; throw Error("Unexpected disabled flower request"); });
  const pending = PhotographicGrass.load(scene, { isEnabled: () => enabled }); await turn();
  enabled = false; await finish(); const grass = await pending; t.after(() => grass.dispose());
  assert.equal(flowerLoads, 0); assert.equal(grass.shaderPreparationRevision, undefined);
  assert.equal(grass.stats.preparing, false); assert.equal(grass.stats.draws, 0);
});

test("failed lazy ground load can roll back to healthy OFF and retry without poisoning tree readiness", async t => {
  const { scene } = sceneFixture(t); t.mock.method(TreeRenderer.prototype, "load", async () => {});
  t.mock.method(GroundFlowers, "load", flowers);
  let attempts = 0;
  t.mock.method(PhotographicGrass, "load", async () => { attempts++; if (attempts === 1) throw Error("ground IO failed"); return new PhotographicGrass(scene, pack, recipe, await resources(scene)); });
  const vegetation = await loadVegetation(scene, { visualFeatures: off }); t.after(() => vegetation.dispose());
  await assert.rejects(vegetation.setVisualFeatures(on), /ground IO failed/); await vegetation.setVisualFeatures(off);
  assert.equal(vegetation.stats.loadError, undefined); assert.equal(vegetation.beginGrassPreparation(), undefined);
  await vegetation.setVisualFeatures(on); assert.equal(attempts, 2); assert.ok(vegetation.grassPreparationRevision);
});

test("late ground completion after owner disposal does not retain meshes or readiness", async t => {
  const { scene } = sceneFixture(t); t.mock.method(TreeRenderer.prototype, "load", async () => {});
  let finish!: (value: PhotographicGrass) => void;
  t.mock.method(PhotographicGrass, "load", () => new Promise<PhotographicGrass>(resolve => finish = resolve));
  const vegetation = await loadVegetation(scene, { visualFeatures: off });
  const pending = vegetation.setVisualFeatures(on); vegetation.dispose();
  const grass = new PhotographicGrass(scene, pack, recipe, await resources(scene)); finish(grass); await pending;
  assert.equal(grass.stats.ready, false); assert.equal(grass.shaderPreparationRevision, undefined);
});


for (const end of ["off", "disposed"] as const) {
  test("ground " + end + " before JSON completion prevents later TextureIO", async t => {
    const { scene } = sceneFixture(t);
    t.mock.method(TreeRenderer.prototype, "load", async () => {});
    const replies: (() => void)[] = []; let textureLoads = 0, flowerLoads = 0;
    t.mock.method(globalThis, "fetch", (input: Parameters<typeof fetch>[0]) => new Promise<Response>(resolve => {
      const body = String(input).endsWith("geometry.json") ? pack : recipe;
      replies.push(() => resolve(new Response(JSON.stringify(body))));
    }));
    t.mock.method(PhotographicGrass.prototype as any, "loadResources", async function (this: any) {
      textureLoads++; this.installResources(await resources(scene));
    });
    t.mock.method(GroundFlowers, "load", async (target: Scene) => { flowerLoads++; return flowers(target); });
    const vegetation = await loadVegetation(scene, { visualFeatures: off }); t.after(() => vegetation.dispose());
    const loading = vegetation.setVisualFeatures(on);
    assert.equal(replies.length, 2); assert.equal(textureLoads, 0);
    if (end === "off") await vegetation.setVisualFeatures(off); else vegetation.dispose();
    for (const reply of replies) reply(); await loading;
    assert.equal(textureLoads, 0, "Off/disposed owner must not start new texture work after JSON");
    assert.equal(flowerLoads, 0); assert.equal(vegetation.grassPreparationRevision, undefined);
    if (end === "off") {
      await Promise.all([vegetation.setVisualFeatures(on), vegetation.setVisualFeatures(on)]);
      assert.equal(textureLoads, 1, "On initializes one dormant resource owner");
      assert.equal(flowerLoads, 1); assert.equal(replies.length, 2, "retained metadata needs no repeated fetch");
      assert.ok(vegetation.grassPreparationRevision);
    } else assert.equal(scene.meshes.length, 0);
  });
}

test("dormant grass resource failure remains retryable after rollback Off", async t => {
  const { scene } = sceneFixture(t); t.mock.method(TreeRenderer.prototype, "load", async () => {});
  const replies: (() => void)[] = []; let attempts = 0;
  t.mock.method(globalThis, "fetch", (input: Parameters<typeof fetch>[0]) => new Promise<Response>(resolve => {
    replies.push(() => resolve(new Response(JSON.stringify(String(input).endsWith("geometry.json") ? pack : recipe))));
  }));
  t.mock.method(PhotographicGrass.prototype as any, "loadResources", async function (this: any) {
    if (++attempts === 1) throw Error("delayed texture failure");
    this.installResources(await resources(scene));
  });
  t.mock.method(GroundFlowers, "load", flowers);
  const vegetation = await loadVegetation(scene, { visualFeatures: off }); t.after(() => vegetation.dispose());
  const pending = vegetation.setVisualFeatures(on); await vegetation.setVisualFeatures(off);
  replies.forEach(reply => reply()); await pending;
  assert.equal(attempts, 0);
  const result = await Promise.allSettled([vegetation.setVisualFeatures(on), vegetation.setVisualFeatures(on)]);
  assert.ok(result.every(item => item.status === "rejected")); assert.equal(attempts, 1);
  await vegetation.setVisualFeatures(off); assert.equal(vegetation.stats.loadError, undefined);
  await vegetation.setVisualFeatures(on); assert.equal(attempts, 2); assert.ok(vegetation.grassPreparationRevision);
});


test("On returning at the dormant JSON boundary awaits one complete resource initialization", async t => {
  const { scene } = sceneFixture(t); t.mock.method(TreeRenderer.prototype, "load", async () => {});
  const replies: (() => void)[] = []; let textureLoads = 0, reenabling: Promise<void> | undefined;
  t.mock.method(globalThis, "fetch", (input: Parameters<typeof fetch>[0]) => new Promise<Response>(resolve => {
    replies.push(() => resolve(new Response(JSON.stringify(String(input).endsWith("geometry.json") ? pack : recipe))));
  }));
  t.mock.method(PhotographicGrass.prototype as any, "loadResources", async function (this: any) {
    textureLoads++; this.installResources(await resources(scene));
  });
  t.mock.method(GroundFlowers, "load", flowers);
  const load = PhotographicGrass.load;
  let vegetation: Awaited<ReturnType<typeof loadVegetation>>;
  t.mock.method(PhotographicGrass, "load", (target: Scene, options: { isEnabled?: () => boolean } = {}) => load(target, {
    isEnabled: () => {
      const enabled = options.isEnabled?.() ?? true;
      if (!enabled && !reenabling) queueMicrotask(() => { reenabling = vegetation.setVisualFeatures(on); });
      return enabled;
    },
  }));
  vegetation = await loadVegetation(scene, { visualFeatures: off }); t.after(() => vegetation.dispose());
  const pending = vegetation.setVisualFeatures(on); await vegetation.setVisualFeatures(off);
  replies.forEach(reply => reply()); await pending; await reenabling;
  assert.equal(textureLoads, 1); assert.ok(vegetation.grassPreparationRevision);
  assert.equal(vegetation.stats.photographicGrass?.ready, true);
  assert.equal(vegetation.stats.photographicGrass?.flowers?.ready, true);
});

for (const end of ["off", "disposed"] as const) {
  test("ground " + end + " during flower JSON starts no flower TextureIO and On can retry", async t => {
    const { scene, engine } = sceneFixture(t);
    t.mock.method(TreeRenderer.prototype, "load", async () => {});
    let finishFlowers!: () => void, reachedFlowers!: () => void, flowerRequests = 0;
    const atFlowers = new Promise<void>(resolve => reachedFlowers = resolve);
    const textures: string[] = [], createTexture = engine.createTexture.bind(engine);
    t.mock.method(engine, "createTexture", (...args: Parameters<NullEngine["createTexture"]>) => {
      textures.push(String(args[0])); return createTexture(...args);
    });
    t.mock.method(globalThis, "fetch", async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      if (url === "/models/vegetation/flowers/geometry.json" && ++flowerRequests === 1) {
        return new Promise<Response>(resolve => {
          finishFlowers = () => resolve(new Response(JSON.stringify(flowerPack))); reachedFlowers();
        });
      }
      return new Response(readFileSync("public" + url, "utf8"));
    });
    const vegetation = await loadVegetation(scene, { visualFeatures: off }); t.after(() => vegetation.dispose());
    const pending = vegetation.setVisualFeatures(on); await atFlowers;
    if (end === "off") await vegetation.setVisualFeatures(off); else vegetation.dispose();
    finishFlowers(); await pending;
    assert.equal(textures.filter(url => url.startsWith("/textures/vegetation/flowers/")).length, 0);
    assert.equal(scene.meshes.filter(mesh => mesh.metadata?.vegetation === "flowers" || mesh.metadata?.groundFlowers).length, 0);
    assert.equal(vegetation.grassPreparationRevision, undefined);
    if (end === "off") {
      await Promise.all([vegetation.setVisualFeatures(on), vegetation.setVisualFeatures(on)]);
      assert.equal(flowerRequests, 2, "one coalesced retry after the skipped JSON result");
      assert.equal(textures.filter(url => url.startsWith("/textures/vegetation/flowers/")).length, 4);
      assert.equal(textures.filter(url => url.startsWith("/textures/vegetation/grass/")).length, 5);
      assert.equal(vegetation.stats.photographicGrass?.flowers?.ready, true);
      assert.ok(vegetation.grassPreparationRevision);
    } else assert.equal(scene.meshes.length, 0);
  });
}
