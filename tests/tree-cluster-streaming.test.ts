import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { parseTreePilotManifest, type TreeAssetFile, type TreePrototype } from "../shared/tree-asset-types";
import { decodeTreePrototype, treePrototypeFoliageRanks, uniqueTreeSourceBytes } from "../client/tree-asset-loader";
import { TreeRenderer, TREE_PILOT_BYTES_LIMIT } from "../client/tree-renderer";
import { TREES } from "../shared/world";
import { treeTrunkCollision } from "../shared/vegetation";
import { getTreeSeasonState } from "../shared/tree-season";
// @ts-ignore Native offline encoder; no runtime module dependency.
import { encodeSeasonalGlb } from "../scripts/tree-seasonal-stream.mjs";

const hash = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
const arrayBuffer = (data: Uint8Array) => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
const file = (url: string, data: Uint8Array): TreeAssetFile => ({ url, bytes: data.length, sha256: hash(data) });

function fixture(count = 1, exact = true) {
  const byUrl = new Map<string, Uint8Array>();
  const add = (url: string, bytes: Uint8Array) => { byUrl.set(url, bytes); return file(url, bytes); };
  const textures = Object.fromEntries(["color", "opacity", "normalGL", "roughness"].map((semantic, i) =>
    [semantic, add(`/textures/trees/test-cluster/${semantic}.png`, new Uint8Array([i, 1, 2, 3]))]));
  const bankJson = { version: 1, coordinateSpace: "gltf-y-up", units: "metres", alphaCutoff: .2, normalMapStrength: .75,
    prototypes: [{ id: 0, cards: [{ positions: [-.2,0,0, .2,0,0, .2,.2,0, -.2,.2,0], normals: [0,0,1,0,0,1,0,0,1,0,0,1], uvs: [0,0,1,0,1,1,0,1] }] }], textures };
  const bankFile = add("/models/vegetation/test-cluster/bank.json", Buffer.from(JSON.stringify(bankJson)));
  const placements = new Uint8Array(exact ? 64 : 32), view = new DataView(placements.buffer);
  for (let i = 0; i < (exact ? 2 : 1); i++) {
    view.setUint16(i * 32, i ? 40000 : 10000, true); view.setUint16(i * 32 + 2, i ? 65535 : 0, true);
    view.setFloat32(i * 32 + 8, 2, true); view.setFloat32(i * 32 + 28, 1, true);
  }
  const placementFile = add("/models/vegetation/test-cluster/placements.bin", placements);
  const selected = TREES.filter(tree => tree.reconstruction?.appearance !== "conifer").slice(0, count);
  const prototypes: Record<string, TreePrototype> = {}, selections: Record<string, string> = {};
  for (const tree of selected) {
    const id = "cluster-" + tree.osmId;
    const lods = [0,1,2].map(lod => {
      const accessors: any[] = [], bufferViews: any[] = [], nodes: any[] = [], meshes: any[] = [], chunks: Buffer[] = []; let offset = 0;
      const append = (data: Float32Array | Uint16Array, type: string, components: number, normalized = false) => {
        const raw = Buffer.from(data.buffer), padding = Buffer.alloc((4 - raw.length % 4) % 4);
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: raw.length }); chunks.push(raw, padding); offset += raw.length + padding.length;
        accessors.push({ bufferView: bufferViews.length - 1, componentType: data instanceof Float32Array ? 5126 : 5123, count: data.length / components, type, ...(normalized ? { normalized: true } : {}) });
        return accessors.length - 1;
      };
      for (const role of ["wood", ...(lod !== 2 || exact ? ["foliage"] : [])]) {
        const name = `${id}__lod${lod}__${role}`;
        const attributes: Record<string, number> = {
          POSITION: append(new Float32Array([0,0,0,1,0,0,0,1,0]), "VEC3", 3),
          NORMAL: append(new Float32Array([0,0,1,0,0,1,0,0,1]), "VEC3", 3),
          TEXCOORD_0: append(new Float32Array([0,0,1,0,0,1]), "VEC2", 2),
        };
        if (role === "foliage") attributes.COLOR_0 = append(new Uint16Array([65535,65535,65535,40000,65535,65535,65535,40000,65535,65535,65535,40000]), "VEC4", 4, true);
        const indices = append(new Uint16Array([0,1,2]), "SCALAR", 1);
        nodes.push({ name, mesh: meshes.length, extras: { role, lod, archetypeId: id, sourceTreeId: tree.osmId, materialKey: role === "wood" ? "Bark012" : "LeafSet024" } });
        meshes.push({ name, primitives: [{ attributes, indices }] });
      }
      const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews, buffers: [{ byteLength: offset }] };
      const descriptor = add(`/models/vegetation/test-cluster/${id}-${lod}.glb`, encodeSeasonalGlb(json, Buffer.concat(chunks)));
      return { ...descriptor, meshNames: nodes.map(n => n.name) };
    });
    prototypes[id] = { sourceTreeId: tree.osmId, family: "deciduous-broadleaf", nominalHeight: 8, nominalCrownDiameter: 4,
      trunkRadius: treeTrunkCollision(tree).radius, lods, farCluster: { bankId: "shared", placements: placementFile, groupCount: exact ? 2 : 1 } };
    selections[tree.osmId] = id;
  }
  const manifest = { version: 4, units: "metres", rankEncoding: "uint16-normalized", banks: { shared: bankFile }, prototypes,
    placements: selected.map(tree => ({ sourceTreeId: tree.osmId, sourceRootXZ: [tree.x, tree.z], prototypeCandidates: [selections[tree.osmId]], selectedPrototypeId: null })) };
  return { manifest, byUrl, bankJson, bankFile, placementFile, selected, selections, textures, add };
}

function harness(t: TestContext, f = fixture()) {
  const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true;
  const renderer = new TreeRenderer(scene, { treePilot: { manifestUrl: "/models/vegetation/test-cluster/runtime-contract.json", selections: f.selections } }), r = renderer as any;
  for (const key of ["Bark012", "LeafSet024"]) r.materials.set(key, new PBRMaterial(key, scene));
  const calls: string[] = [], textureCalls: { file: TreeAssetFile; gamma: boolean }[] = [];
  t.mock.method(globalThis, "fetch", async (url: unknown) => {
    calls.push(String(url)); const bytes = f.byUrl.get(String(url));
    assert.ok(bytes, "fixture has requested asset: " + url); return new Response(arrayBuffer(bytes));
  });
  t.mock.method(r, "texture", async (asset: TreeAssetFile, gamma: boolean) => {
    textureCalls.push({ file: asset, gamma }); await r.loader.asset(asset);
    if (!r.alive()) throw new DOMException("retired texture", "AbortError");
    const texture = RawTexture.CreateRGBATexture(new Uint8Array([128,128,255,255]), 1, 1, scene);
    texture.gammaSpace = gamma; r.textures.add(texture); return texture;
  });
  t.after(() => { renderer.dispose(); scene.dispose(); engine.dispose(); });
  const load = () => { const manifest = parseTreePilotManifest(f.manifest); r.validatePilot(manifest, f.selections); return r.loadPilot(manifest, Object.keys(f.selections)); };
  return { ...f, scene, engine, renderer, r, calls, textureCalls, load };
}

test("v4 descriptors reject unknown banks, bad record lengths, older-version extensions and conflicting identities", () => {
  const f = fixture(); assert.equal(parseTreePilotManifest(f.manifest).version, 4);
  const id = Object.keys(f.manifest.prototypes)[0];
  for (const change of [
    (m: any) => m.prototypes[id].farCluster.bankId = "unknown",
    (m: any) => m.prototypes[id].farCluster.groupCount = 1,
    (m: any) => m.version = 3,
    (m: any) => m.banks.shared.url = "https://example.com/bank.json",
  ]) { const m = structuredClone(f.manifest); change(m); assert.throws(() => parseTreePilotManifest(m)); }
  assert.equal(uniqueTreeSourceBytes([f.bankFile, f.bankFile]), f.bankFile.bytes);
  assert.throws(() => uniqueTreeSourceBytes([f.bankFile, { ...f.bankFile, sha256: "0".repeat(64) }]), /Conflicting/);
});

test("v4 shares bank/maps once, expands only FAR, preserves exact fallback/detail/litter and unique source accounting", async t => {
  const h = harness(t, fixture(2)); await h.load();
  assert.equal(h.calls.filter(url => url === h.bankFile.url).length, 1);
  assert.equal(h.textureCalls.length, 4); assert.equal(h.r.clusterBanks.size, 1); assert.equal(h.r.clusterMaterials.size, 1);
  assert.ok(h.calls.every(url => !/-[01]\.glb$/.test(url)), "no initial detail IO");
  const sourceFiles = [...Object.values(h.manifest.prototypes).map(p => p.lods[2]), h.bankFile, h.placementFile];
  assert.equal(h.renderer.stats.treePilotSourceBytes, uniqueTreeSourceBytes(sourceFiles));
  assert.equal(h.renderer.stats.treeTextureSourceBytes, 16);
  const original = h.r.materials.get("LeafSet024"), groups = h.r.treeGroups;
  for (const group of groups) {
    assert.deepEqual(group.lods.map((lod: Mesh[]) => lod.length), [0,0,3]);
    const fallback = group.lods[2].find((mesh: Mesh) => mesh.name.endsWith("__foliage"));
    const cluster = group.lods[2].find((mesh: Mesh) => mesh.metadata.treeClusterBank);
    assert.equal(fallback.material, original); assert.notEqual(cluster.material, original);
    assert.equal(cluster.material.alphaCutOff, .2); assert.equal(cluster.material.bumpTexture.level, .75);
    assert.equal(cluster.getTotalIndices(), 6); assert.equal(cluster.hasVertexAlpha, false);
  }
  assert.equal(h.renderer.litterMaterials!.leafMaterial, original);
  const winter = getTreeSeasonState(Date.UTC(2026,0,15));
  h.renderer.update({ time: 1, quality: "high", player: { x: groups[0].x, y: 0, z: groups[0].z }, wind: { x:0,z:0,speed:0 }, season: winter });
  await settle();
  for (const group of groups) for (const mesh of group.lods.flat() as Mesh[]) if (mesh.metadata.treeRole === "foliage") {
    assert.equal(mesh.isEnabled(), false); assert.equal(mesh.subMeshes[0].indexCount, 0);
    if (mesh.metadata.detailLevel < 2) assert.equal(mesh.material, original);
  }
  assert.equal(h.textureCalls.length, 4, "late detail does no material IO");
  const ownedTextures = [...h.r.textures], ownedMaterials = [...h.r.clusterMaterials.values()];
  h.renderer.dispose();
  assert.equal(h.scene.meshes.length, 0); assert.equal(h.scene.geometries.length, 0);
  assert.ok(ownedTextures.every(texture => !h.scene.textures.includes(texture)));
  assert.ok(ownedMaterials.every(material => !h.scene.materials.includes(material)));
  assert.equal(h.renderer.stats.treePilotSourceBytes, 0);
});

test("baked FAR normal calibration remains one rather than inheriting raw material strength", async t => {
  const f = fixture(); f.bankJson.normalMapStrength = 1;
  f.manifest.banks.shared = f.add(f.bankFile.url, Buffer.from(JSON.stringify(f.bankJson)));
  const h = harness(t, f); await h.load();
  assert.equal([...h.r.clusterMaterials.values()][0].bumpTexture.level, 1);
});

test("v4 fallback coverage is independently decoded; missing, duplicated or unreferenced ranks allocate no meshes", async t => {
  for (const replacement of [30000, 10000]) {
    const f = fixture(), placements = new Uint8Array(f.byUrl.get(f.placementFile.url)!);
    new DataView(placements.buffer).setUint16(32, replacement, true);
    const updated = f.add(f.placementFile.url, placements);
    (Object.values(f.manifest.prototypes)[0] as any).farCluster.placements = updated;
    const h = harness(t, f); await assert.rejects(h.load(), /rank|fallback/);
    assert.equal(h.scene.meshes.length, 0); assert.equal(h.r.clusterMaterials.size, 0); assert.equal(h.textureCalls.length, 0);
  }
});

test("v4 bank maps are budgeted before map/geometry IO and checked by SHA before publication", async t => {
  const f = fixture();
  for (const map of Object.values(f.bankJson.textures) as TreeAssetFile[]) (map as any).bytes = 32 * 1024 * 1024;
  f.manifest.banks.shared = f.add(f.bankFile.url, Buffer.from(JSON.stringify(f.bankJson)));
  const h = harness(t, f); await assert.rejects(h.load(), /byte budget/);
  assert.deepEqual(h.calls, [h.bankFile.url]); assert.equal(h.scene.meshes.length, 0);
  assert.ok(uniqueTreeSourceBytes(Object.values(f.bankJson.textures) as TreeAssetFile[]) > TREE_PILOT_BYTES_LIMIT);
});

test("v4 corrupt atlas or partial mesh allocation cleans only staged resources and preserves the existing tree", async t => {
  for (const fail of ["texture", "mesh"]) {
    const h = harness(t), source = h.selected[0], group = h.r.createGroup(source.osmId);
    const peer = new Mesh("legacy retained", h.scene); peer.parent = group.root;
    group.lods[2] = [peer]; h.r.treeGroups = [group]; h.r.trees = [peer];
    if (fail === "texture") h.byUrl.set(h.textures.opacity.url, new Uint8Array([9,9,9,9]));
    else {
      const describe = h.r.describe.bind(h.r);
      t.mock.method(h.r, "describe", (mesh: Mesh, ...args: any[]) => {
        if (mesh.name.endsWith("cluster-foliage")) throw Error("partial cluster allocation");
        return describe(mesh, ...args);
      });
    }
    await assert.rejects(h.load(), fail === "texture" ? /SHA/ : /partial cluster/);
    assert.equal(peer.isDisposed(), false); assert.deepEqual(h.scene.meshes, [peer]);
    assert.equal(h.r.clusterMaterials.size, 0); assert.equal(h.r.clusterBanks.size, 0); assert.equal(h.r.textures.size, 0);
    assert.equal(h.r.materials.size, 2, "pre-existing detail/litter pool remains owned");
  }
});

test("v4 dispose during delayed bank IO cannot publish resources even if transport ignores abort", async t => {
  const h = harness(t); let finish!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => finish = resolve));
  const pending = h.load(); h.renderer.dispose();
  finish(new Response(arrayBuffer(h.byUrl.get(h.bankFile.url)!)));
  await assert.rejects(pending, /disposed/);
  assert.equal(h.scene.meshes.length, 0); assert.equal(h.r.clusterBanks.size, 0); assert.equal(h.r.clusterMaterials.size, 0);
});

test("v4 failed replacement bank does not dispose maps borrowed from the committed atlas", async t => {
  const h = harness(t, fixture(2)); await h.load();
  const oldMeshes = [...h.scene.meshes], oldTextures = [...h.r.textures], oldMaterial = [...h.r.clusterMaterials.values()][0];
  const next = structuredClone(h.bankJson), opacity = h.add("/textures/trees/test-cluster/failed-opacity.png", new Uint8Array([4,3,2,1]));
  next.textures.opacity = opacity;
  const second = h.add("/models/vegetation/test-cluster/second-bank.json", Buffer.from(JSON.stringify(next)));
  (h.manifest.banks as Record<string, TreeAssetFile>).second = second;
  (Object.values(h.manifest.prototypes)[1] as any).farCluster.bankId = "second";
  h.byUrl.set(opacity.url, new Uint8Array([9,9,9,9]));
  await assert.rejects(h.load(), /SHA/);
  assert.deepEqual(h.scene.meshes, oldMeshes);
  assert.ok(oldMeshes.every(mesh => !mesh.isDisposed()));
  assert.ok(oldTextures.every(texture => h.scene.textures.includes(texture)));
  assert.equal(h.r.textures.size, 4); assert.equal(h.r.clusterMaterials.size, 1);
  assert.equal([...h.r.clusterMaterials.values()][0], oldMaterial);
});

test("v4 disposal during atlas IO drains staged promises and leaves no geometry or texture owner", { timeout: 5000 }, async t => {
  const h = harness(t);
  const pending: ((response: Response) => void)[] = [];
  let reachedAtlas!: () => void;
  const atAtlas = new Promise<void>(resolve => reachedAtlas = resolve);
  t.mock.method(globalThis, "fetch", async (url: unknown) => String(url).startsWith("/textures/")
    ? new Promise<Response>(resolve => { pending.push(resolve); if (pending.length === 4) reachedAtlas(); })
    : new Response(arrayBuffer(h.byUrl.get(String(url))!)));
  const loading = h.load();
  await Promise.race([atAtlas, loading.then(() => { throw Error("Atlas IO was not reached"); })]);
  assert.equal(pending.length, 4);
  h.renderer.dispose();
  for (const finish of pending) finish(new Response(new Uint8Array([0,1,2,3])));
  await assert.rejects(loading, /disposed|retired/);
  assert.equal(h.r.loader.stats.pending, 0); assert.equal(h.r.textures.size, 0);
  assert.equal(h.scene.meshes.length, 0); assert.equal(h.scene.geometries.length, 0);
  assert.equal(h.r.clusterBanks.size, 0); assert.equal(h.r.clusterMaterials.size, 0);
});

test("v4 wood-only fallback permits complete card coverage and still preloads original detail foliage", async t => {
  const h = harness(t, fixture(1, false)); await h.load();
  const group = h.r.treeGroups[0]; assert.equal(group.lods[2].length, 2);
  const id = Object.keys(h.manifest.prototypes)[0], p = h.manifest.prototypes[id];
  assert.deepEqual(treePrototypeFoliageRanks(decodeTreePrototype(arrayBuffer(h.byUrl.get(p.lods[2].url)!), id, p, 2)), []);
  group.desired = 0; h.r.startDetailLoads(); await settle();
  assert.equal(group.active, 0); assert.equal(group.lods[0][1].material, h.renderer.litterMaterials!.leafMaterial);
});
