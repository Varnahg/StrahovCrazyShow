import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { TreeRenderer } from "../client/tree-renderer";
import type { TreeAssetFile } from "../shared/tree-asset-types";
import { TREES } from "../shared/world";
import { treeTrunkCollision } from "../shared/vegetation";
import { getTreeSeasonState } from "../shared/tree-season";
import legacy from "../public/models/vegetation/runtime/manifest.json";
// @ts-ignore Native offline encoder; no browser dependency.
import { encodeSeasonalGlb } from "../scripts/tree-seasonal-stream.mjs";

const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const buffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const settle = async () => { for (let i = 0; i < 14; i++) await new Promise<void>(resolve => setImmediate(resolve)); };

/** Tiny actual GLBs for all known source identities; no private cache or large
 * authoring assets. FAR cards go through the same v4 bank/placement decoder. */
function catalogFixture() {
  const files = new Map<string, Uint8Array>();
  const add = (url: string, bytes: Uint8Array): TreeAssetFile => {
    files.set(url, bytes); return { url, bytes: bytes.length, sha256: sha(bytes) };
  };
  const maps = Object.fromEntries(["color", "opacity", "normalGL", "roughness"].map((key, i) =>
    [key, add(`/textures/trees/catalog-test/${key}.png`, new Uint8Array([i, 0, 0, 255]))]));
  const bank = add("/models/vegetation/catalog-test/bank.json", Buffer.from(JSON.stringify({
    version: 1, units: "metres", coordinateSpace: "gltf-y-up", textures: maps,
    prototypes: [{ id: 0, cards: [{ positions: [0,0,0,1,0,0,1,1,0,0,1,0], normals: [0,0,1,0,0,1,0,0,1,0,0,1], uvs: [0,0,1,0,1,1,0,1] }] }],
  })));
  const prototypes: Record<string, any> = {}, placements: any[] = [];
  for (const source of TREES) {
    const id = "catalog-" + source.osmId;
    const lods = [0,1,2].map(lod => {
      const chunks: Buffer[] = [], bufferViews: any[] = [], accessors: any[] = [], meshes: any[] = [], nodes: any[] = [];
      let offset = 0;
      const append = (values: Float32Array | Uint16Array, type: string, components: number, normalized = false) => {
        const bytes = Buffer.from(values.buffer), pad = Buffer.alloc((4 - bytes.length % 4) % 4);
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }); chunks.push(bytes, pad); offset += bytes.length + pad.length;
        accessors.push({ bufferView: bufferViews.length - 1, componentType: values instanceof Float32Array ? 5126 : 5123, count: values.length / components, type, ...(normalized ? { normalized: true } : {}) });
        return accessors.length - 1;
      };
      for (const role of lod === 2 ? ["wood"] : ["wood", "foliage"]) {
        const name = `${id}__lod${lod}__${role}`;
        const attributes: Record<string, number> = {
          POSITION: append(new Float32Array([0,0,0,1,0,0,0,1,0]), "VEC3", 3),
          NORMAL: append(new Float32Array([0,0,1,0,0,1,0,0,1]), "VEC3", 3),
          TEXCOORD_0: append(new Float32Array([0,0,1,0,0,1]), "VEC2", 2),
        };
        if (role === "foliage") attributes.COLOR_0 = append(new Uint16Array([65535,65535,65535,10000,65535,65535,65535,10000,65535,65535,65535,10000]), "VEC4", 4, true);
        const indices = append(new Uint16Array([0,1,2]), "SCALAR", 1);
        nodes.push({ name, mesh: meshes.length, extras: { role, lod, archetypeId: id, sourceTreeId: source.osmId, materialKey: role === "wood" ? "Bark012" : "LeafSet024" } });
        meshes.push({ name, primitives: [{ attributes, indices }] });
      }
      const bytes = encodeSeasonalGlb({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, bufferViews, accessors, buffers: [{ byteLength: offset }] }, Buffer.concat(chunks));
      return { ...add(`/models/vegetation/catalog-test/${id}-${lod}.glb`, bytes), meshNames: nodes.map(node => node.name) };
    });
    const records = new Uint8Array(32), view = new DataView(records.buffer);
    view.setUint16(0, 10000, true); view.setFloat32(8, 2, true); view.setFloat32(28, 1, true);
    prototypes[id] = { sourceTreeId: source.osmId, family: "deciduous-broadleaf", nominalHeight: 8, nominalCrownDiameter: 5,
      trunkRadius: treeTrunkCollision(source).radius, lods,
      farCluster: { bankId: "shared", placements: add(`/models/vegetation/catalog-test/${id}.bin`, records), groupCount: 1 } };
    placements.push({ sourceTreeId: source.osmId, sourceRootXZ: [source.x, source.z], prototypeCandidates: [id], selectedPrototypeId: null });
  }
  const manifest = { version: 4, units: "metres", rankEncoding: "uint16-normalized", banks: { shared: bank }, prototypes, placements };
  const publish = () => add("/models/vegetation/catalog-test/runtime-contract.json", Buffer.from(JSON.stringify(manifest)));
  return { files, add, manifest, catalog: publish(), publish };
}

function harness(t: TestContext, f = catalogFixture(), extraOptions: Record<string, unknown> = {}) {
  const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true;
  const renderer = new TreeRenderer(scene, { treeCatalog: f.catalog, ...extraOptions }), r = renderer as any;
  for (const key of ["Bark012", "LeafSet024"]) r.materials.set(key, new PBRMaterial(key, scene));
  const calls: string[] = []; let legacyLoads = 0;
  const fetchFixture = async (url: unknown) => {
    calls.push(String(url)); const bytes = f.files.get(String(url)); assert.ok(bytes, "known fixture: " + url);
    return new Response(buffer(bytes));
  };
  t.mock.method(globalThis, "fetch", fetchFixture);
  t.mock.method(r, "texture", async (file: TreeAssetFile, gamma: boolean) => {
    await r.loader.asset(file);
    if (!r.alive()) throw new DOMException("disposed catalogue texture", "AbortError");
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([128,128,255,255]), 1, 1, scene);
    texture.gammaSpace = gamma; r.textures.add(texture); return texture;
  });
  t.mock.method(r, "loadLegacy", async () => {
    legacyLoads++;
    assert.equal(r.treeGroups.length, 0, "full fallback starts without partially committed catalogue groups");
    for (const source of TREES) {
      const group = r.createGroup(source.osmId), mesh = new Mesh("legacy " + source.osmId, scene);
      mesh.parent = group.root; mesh.metadata = { treeRole: "wood", detailLevel: 2 };
      group.lods[2].push(mesh); r.treeGroups.push(group); r.trees.push(mesh);
    }
    r.stats.bootstrapBytes = legacy.bootstrapBytes;
  });
  t.after(() => { renderer.dispose(); scene.dispose(); engine.dispose(); });
  return { ...f, renderer, r, engine, scene, calls, fetchFixture, legacyLoads: () => legacyLoads };
}

test("complete integrity catalog resolves all source selections once and skips legacy bootstrap", async t => {
  const h = harness(t), first = h.renderer.load(); assert.equal(h.renderer.load(), first);
  await first;
  assert.equal(h.legacyLoads(), 0); assert.equal(h.renderer.stats.bootstrapBytes, 0);
  assert.equal(h.renderer.stats.treeInstances, TREES.length); assert.equal(h.renderer.stats.rankEnabledTreeInstances, TREES.length);
  assert.equal(h.renderer.stats.legacyTreeInstances, 0); assert.equal(h.renderer.stats.loadError, undefined);
  assert.equal(h.calls.filter(url => url === h.catalog.url).length, 1);
  assert.ok(h.calls.every(url => !url.includes("/runtime/") && !/-[01]\.glb$/.test(url)));
  assert.equal(Object.keys(h.r.selections).length, TREES.length); assert.equal(Object.isFrozen(h.r.selections), true);
  for (const source of TREES) assert.equal(h.r.selections[source.osmId], "catalog-" + source.osmId);
});

test("partial, unknown and ambiguous catalogs retain a complete legacy population and report rejection", async t => {
  for (const kind of ["partial", "unknown", "ambiguous"]) {
    const f = catalogFixture(), first = f.manifest.placements[0], id = first.prototypeCandidates[0];
    if (kind === "partial") { f.manifest.placements.pop(); delete f.manifest.prototypes["catalog-" + TREES.at(-1)!.osmId]; }
    if (kind === "unknown") { first.sourceTreeId = "unknown-source"; f.manifest.prototypes[id].sourceTreeId = "unknown-source"; }
    if (kind === "ambiguous") {
      const second = id + "-other"; f.manifest.prototypes[second] = structuredClone(f.manifest.prototypes[id]);
      f.manifest.prototypes[second].lods = f.manifest.prototypes[second].lods.map((file: any, lod: number) => ({ ...file, meshNames: file.meshNames.map((name: string) => name.replace(id, second)) }));
      first.prototypeCandidates.push(second);
    }
    f.catalog = f.publish(); const h = harness(t, f); await h.renderer.load();
    assert.equal(h.legacyLoads(), 1); assert.equal(h.renderer.stats.treeInstances, TREES.length);
    assert.equal(h.renderer.stats.legacyTreeInstances, TREES.length); assert.equal(h.renderer.stats.rankEnabledTreeInstances, 0);
    assert.ok(h.renderer.stats.loadError); assert.deepEqual(h.calls, [h.catalog.url]);
  }
});

test("catalog and QA pilot are mutually exclusive before IO; invalid catalog integrity also falls back", async t => {
  const f = catalogFixture(), source = TREES[0];
  const mixed = harness(t, f, { treePilot: { manifestUrl: f.catalog.url, selections: { [source.osmId]: "catalog-" + source.osmId } } });
  await mixed.renderer.load(); assert.equal(mixed.calls.length, 0); assert.equal(mixed.legacyLoads(), 1);
  assert.match(mixed.renderer.stats.loadError!, /mutually exclusive/);
  const invalid = harness(t, catalogFixture(), { treeCatalog: { ...f.catalog, sha256: "0".repeat(64) } });
  await invalid.renderer.load(); assert.equal(invalid.legacyLoads(), 1); assert.match(invalid.renderer.stats.loadError!, /SHA/);
});

test("failed last-source mesh staging rolls back every new group before complete legacy fallback", async t => {
  const h = harness(t), describe = h.r.describe.bind(h.r), last = TREES.at(-1)!.osmId;
  t.mock.method(h.r, "describe", (mesh: Mesh, group: any, ...args: any[]) => {
    if (group.id === last && mesh.name.endsWith("cluster-foliage")) throw Error("last-source allocation failure");
    return describe(mesh, group, ...args);
  });
  await h.renderer.load(); assert.equal(h.legacyLoads(), 1);
  assert.equal(h.scene.meshes.length, TREES.length); assert.equal(h.scene.geometries.length, 0);
  assert.equal(h.r.clusterBanks.size, 0); assert.equal(h.r.clusterMaterials.size, 0); assert.equal(h.r.textures.size, 0);
  assert.equal(h.renderer.stats.legacyTreeInstances, TREES.length); assert.equal(h.renderer.stats.bootstrapBytes, legacy.bootstrapBytes);
  assert.match(h.renderer.stats.loadError!, /last-source/);
});

test("failure while applying a fully published catalog clears it before whole legacy fallback", async t => {
  const h = harness(t), visibility = h.r.applyVisibility.bind(h.r); let injected = false;
  t.mock.method(h.r, "applyVisibility", () => {
    if (!injected && h.r.treeGroups.length === TREES.length && h.r.treeGroups.every((group: any) => group.pilot)) {
      injected = true; throw Error("catalog first visibility failure");
    }
    return visibility();
  });
  await h.renderer.load();
  assert.equal(injected, true); assert.equal(h.legacyLoads(), 1);
  assert.equal(h.scene.meshes.length, TREES.length); assert.equal(h.scene.geometries.length, 0);
  assert.equal(h.renderer.stats.legacyTreeInstances, TREES.length); assert.equal(h.renderer.stats.rankEnabledTreeInstances, 0);
  assert.match(h.renderer.stats.loadError!, /first visibility/);
});

test("late catalog detail obeys current winter and transformed source root", async t => {
  const h = harness(t); await h.renderer.load(); const source = TREES[0], group = h.r.treeGroups.find((g: any) => g.id === source.osmId);
  const near = group.stream.prototype.lods[0]; let finish!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", (url: unknown) => String(url) === near.url ? new Promise<Response>(resolve => finish = resolve) : h.fetchFixture(url));
  group.desired = 0; h.r.startDetailLoads();
  const moved = { x: source.x + 2, y: group.root.position.y + 1, z: source.z + 3 };
  h.renderer.setTreeTransform(source.osmId, moved, .5);
  h.renderer.update({ time: 1, quality: "low", player: { x: 10000, y: 0, z: 10000 }, wind: { x:0,z:0,speed:0 }, season: getTreeSeasonState(Date.UTC(2026,0,15)) });
  finish(new Response(buffer(h.files.get(near.url)!))); await settle();
  assert.equal(group.active, 2); assert.equal(group.lods[0].length, 2);
  for (const mesh of group.lods[0] as Mesh[]) {
    assert.equal(mesh.parent, group.root); assert.equal(mesh.isEnabled(), false);
    assert.deepEqual(mesh.getWorldMatrix().asArray(), group.root.getWorldMatrix().asArray());
    if (mesh.metadata.treeRole === "foliage") assert.equal(mesh.subMeshes[0].indexCount, 0);
  }
  assert.equal(h.legacyLoads(), 0);
});

test("catalog descriptor is copied before awaiting a mutable caller's response", async t => {
  const h = harness(t), url = h.catalog.url, bytes = h.files.get(url)!;
  let finish!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", (requested: unknown) => String(requested) === url
    ? new Promise<Response>(resolve => finish = resolve) : h.fetchFixture(requested));
  const loading = h.renderer.load();
  Object.assign(h.catalog, { url: "https://invalid.example/catalog.json", bytes: 1, sha256: "0".repeat(64) });
  finish(new Response(buffer(bytes))); await loading;
  assert.equal(h.legacyLoads(), 0); assert.equal(h.renderer.stats.rankEnabledTreeInstances, TREES.length);
  assert.equal(h.renderer.stats.loadError, undefined);
});

test("disposal during catalog fetch does not start legacy fallback or publish late meshes", async t => {
  const h = harness(t); let finish!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => finish = resolve));
  const loading = h.renderer.load(); h.renderer.dispose();
  finish(new Response(buffer(h.files.get(h.catalog.url)!))); await loading;
  assert.equal(h.legacyLoads(), 0); assert.equal(h.scene.meshes.length, 0); assert.equal(h.r.loader.stats.pending, 0);
});
