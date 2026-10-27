import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TreeRenderer, treeDetailForProjection, TREE_DETAIL_BYTES_LIMIT, TREE_DETAIL_CACHE_LIMIT, TREE_PILOT_BYTES_LIMIT } from "../client/tree-renderer";
import { decodeTreePrototype } from "../client/tree-asset-loader";
import { parseTreePilotManifest, type TreeAssetFile, type TreePrototype } from "../shared/tree-asset-types";
import { TREES } from "../shared/world";
import { treeTrunkCollision, treeDetailLevel } from "../shared/vegetation";
import { getTreeSeasonState } from "../shared/tree-season";
// @ts-ignore Offline exporter is a native Node ESM module, not client code.
import { encodeSeasonalGlb, readSeasonalGlb, splitSeasonalGlb, verifySeasonalSplit } from "../scripts/tree-seasonal-stream.mjs";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const asBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const source = TREES.find(tree => tree.osmId === "ipr-crown-014")!;
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise<void>(resolve => setImmediate(resolve)); };
const input = (overrides: Record<string, unknown> = {}) => ({ time: 1, quality: "high", player: { x: source.x, y: 0, z: source.z }, wind: { x: 0, z: 0, speed: 0 }, ...overrides });

test("full MID profile is explicit and scales its thresholds with the real projection", () => {
  for(const quality of ["low","medium","high"])for(const distance of [0,5,7,9,13,21,29,39,74,99,134,200])
    assert.equal(treeDetailForProjection(distance,quality,undefined,3),treeDetailLevel(distance,quality),"legacy policy ignores new projection parameters");
  for(const [quality,near] of [["low",6],["medium",8],["high",12]] as const){
    assert.equal(treeDetailForProjection(near-.01,quality,"full-coverage"),0);
    assert.equal(treeDetailForProjection(near,quality,"full-coverage"),1);
    assert.equal(treeDetailForProjection(near*1.9,quality,"full-coverage",2),0);
    assert.equal(treeDetailForProjection(near*2,quality,"full-coverage",2),1);
  }
  assert.equal(treeDetailForProjection(150,"high","full-coverage"),2);
  assert.equal(treeDetailForProjection(150,"high","full-coverage",2),1);
  for(const invalid of [NaN,Infinity,0,-1])assert.equal(treeDetailForProjection(9,"medium","full-coverage",invalid),1);
  const raw=fixture().manifest; const id=Object.keys(raw.prototypes)[0];
  (raw.prototypes[id] as any).lodProfile="full-coverage";
  assert.equal(parseTreePilotManifest(raw).prototypes[id].lodProfile,"full-coverage");
  (raw.prototypes[id] as any).lodProfile="invented";
  assert.throws(()=>parseTreePilotManifest(raw),/LOD profile/);
});

test("actual renderer protects a nearby third-person camera and responds to FOV without changing legacy", t => {
  const engine=new NullEngine({renderWidth:1280,renderHeight:720,textureSize:1,deterministicLockstep:false,lockstepMaxSteps:4});
  const scene=new Scene(engine);scene.useRightHandedSystem=true;
  const camera=new FreeCamera("tree camera",new Vector3(source.x-3,2,source.z),scene);camera.fov=.85;
  const renderer=new TreeRenderer(scene),r=renderer as any,group=r.createGroup(source.osmId);
  t.after(()=>{renderer.dispose();scene.dispose();engine.dispose();});
  group.pilot=true;r.treeGroups.push(group);
  const update=(time:number)=>renderer.update(input({time,quality:"medium",player:{x:source.x-40,y:0,z:source.z}}));
  update(1);assert.equal(group.desired,1,"legacy still uses its historical player distance");
  group.lodProfile="full-coverage";update(2);assert.equal(group.desired,0,"close camera is protected even when player is 40m away");
  camera.position.x=source.x-10;update(3);assert.equal(group.desired,1);
  camera.fov=.42;update(4);assert.equal(group.desired,0,"real narrow-FOV projection requests more geometry");
  camera.fov=.85;camera.position.x=source.x+20;update(5);assert.equal(group.desired,0,"a tree between camera and player remains in the near segment");
  group.lodProfile=undefined;update(6);assert.equal(group.desired,1);
});

function fixture(tree = source) {
  const id = "stream-" + tree.osmId, chunks: Buffer[] = [], accessors: any[] = [], meshes: any[] = [], nodes: any[] = []; let offset = 0;
  // One deliberately shared source view: splitting must extract accessor ranges,
  // not duplicate this entire three-LOD BIN in every output file.
  const append = (data: Float32Array | Uint16Array, type: string, normalized = false) => {
    const raw = Buffer.from(data.buffer), index = accessors.length, components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    accessors.push({ bufferView: 0, byteOffset: offset, componentType: data instanceof Float32Array ? 5126 : 5123, count: data.length / components[type], type, extras: { source: "synthetic-preserve" }, ...(normalized ? { normalized: true } : {}), ...(type === "VEC3" ? { min: [0, 0, 0], max: [1, 1, 1] } : {}) });
    const pad = Buffer.alloc((4 - raw.length % 4) % 4); chunks.push(raw, pad); offset += raw.length + pad.length; return index;
  };
  for (const lod of [0, 1, 2]) for (const role of ["wood", "foliage"]) {
    const name = `${id}__lod${lod}__${role}`;
    const attributes: Record<string, number> = {
      POSITION: append(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, lod / 10]), "VEC3"),
      NORMAL: append(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), "VEC3"),
      TEXCOORD_0: append(new Float32Array([0, 0, 1, 0, 0, 1]), "VEC2"),
    };
    if (role === "foliage") attributes.COLOR_0 = append(new Uint16Array([65535,65535,65535,42000,65535,65535,65535,42000,65535,65535,65535,42000]), "VEC4", true);
    const indices = append(new Uint16Array([0, 1, 2]), "SCALAR");
    nodes.push({ name, mesh: meshes.length, extras: { role, materialKey: role === "wood" ? "Bark012" : "LeafSet024", lod, archetypeId: id, sourceTreeId: tree.osmId, preserved: { a: 1 } } });
    meshes.push({ name, extras: { authored: true }, primitives: [{ attributes, indices }] });
  }
  const json = { asset: { version: "2.0", generator: "synthetic streaming regression" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, accessors, bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: offset, extras: { preservedView: true } }], buffers: [{ byteLength: offset }] };
  const original = encodeSeasonalGlb(json, Buffer.concat(chunks)) as Buffer;
  const prototype: TreePrototype = { sourceTreeId: tree.osmId, family: "deciduous-broadleaf", nominalHeight: 10, nominalCrownDiameter: 5, trunkRadius: treeTrunkCollision(tree).radius,
    lods: [0,1,2].map(lod => ({ url: "/models/vegetation/seasonal/" + id + ".glb", bytes: original.length, sha256: hash(original), meshNames: [`${id}__lod${lod}__wood`, `${id}__lod${lod}__foliage`] })) };
  const files = [0,1,2].map(lod => splitSeasonalGlb(original, id, prototype, lod) as Buffer);
  const streamed: TreePrototype = { ...prototype, lods: files.map((bytes, lod) => ({ ...prototype.lods[lod], url: `/models/vegetation/seasonal-streamed/${id}-lod${lod}.glb`, bytes: bytes.length, sha256: hash(bytes) })) };
  const manifest = { version: 3, units: "metres", rankEncoding: "uint16-normalized", prototypes: { [id]: streamed }, placements: [{ sourceTreeId: tree.osmId, sourceRootXZ: [tree.x, tree.z], prototypeCandidates: [id], selectedPrototypeId: null }] };
  return { tree, id, prototype, streamed, original, files, manifest };
}

function harness(t: any, fixtures = [fixture()]) {
  const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = true;
  const selections = Object.fromEntries(fixtures.map(f => [f.tree.osmId, f.id]));
  const renderer = new TreeRenderer(scene, { treePilot: { manifestUrl: "/models/vegetation/seasonal-streamed/test.json", selections } }), r = renderer as any;
  for (const key of ["Bark012", "LeafSet024"]) r.materials.set(key, new PBRMaterial(key, scene));
  const manifest = parseTreePilotManifest({ ...fixtures[0].manifest, prototypes: Object.assign({}, ...fixtures.map(f => f.manifest.prototypes)), placements: fixtures.flatMap(f => f.manifest.placements) });
  const byUrl = new Map(fixtures.flatMap(f => f.streamed.lods.map((file, lod) => [file.url, asBuffer(f.files[lod])] as const)));
  const calls: string[] = [];
  t.mock.method(r.loader, "asset", async (file: TreeAssetFile) => { calls.push(file.url); assert.ok(byUrl.has(file.url)); return byUrl.get(file.url)!; });
  t.after(() => { renderer.dispose(); scene.dispose(); engine.dispose(); });
  return { engine, scene, renderer, r, manifest, selections, byUrl, calls, load: () => r.loadPilot(manifest, Object.keys(selections)) };
}

test("full-coverage detail admission uses camera focus before distant-player candidates consume the byte budget", async t => {
  const fixtures=[source,...TREES.filter(tree=>tree!==source).slice(0,2)].map(fixture);
  for(const f of fixtures){Object.assign(f.streamed,{lodProfile:"full-coverage"});Object.assign(f.streamed.lods[0],{bytes:TREE_DETAIL_BYTES_LIMIT/2});}
  const h=harness(t,fixtures);await h.load();
  const camera=new FreeCamera("third person priority",new Vector3(10,2,0),h.scene);camera.fov=.85;
  for(const [i,[x,z]] of [[9,.25],[0,1],[0,2]].entries())h.renderer.setTreeTransform(fixtures[i].tree.osmId,{x,y:0,z});
  const pending:{url:string;reject:(reason:Error)=>void}[]=[];
  t.mock.method(h.r.loader,"asset",(file:TreeAssetFile)=>new Promise<ArrayBuffer>((_resolve,reject)=>pending.push({url:file.url,reject})));
  h.renderer.update(input({player:{x:0,y:0,z:0}}));
  assert.ok(h.r.treeGroups.every((group:any)=>group.desired===0));
  assert.deepEqual(pending.map(p=>p.url),[fixtures[0].streamed.lods[0].url,fixtures[1].streamed.lods[0].url]);
  assert.equal(h.renderer.stats.treeDetailReservedBytes,TREE_DETAIL_BYTES_LIMIT);
  h.renderer.update(input({time:1.2,player:{x:0,y:0,z:0}}));assert.equal(pending.length,2);
  h.renderer.dispose();for(const request of pending)request.reject(new DOMException("test retirement","AbortError"));await settle();
  assert.equal(h.renderer.stats.treeDetailReservedBytes,0);
});

test("per-LOD exporter retains raw accessor values/metadata and excludes even shared-view foreign LOD bytes", () => {
  const f = fixture(), original = readSeasonalGlb(f.original);
  for (const lod of [0,1,2] as const) {
    const result = verifySeasonalSplit(f.original, f.files[lod], f.prototype.lods[lod].meshNames);
    assert.equal(result.accessorComparisons, 9); assert.ok(result.binBytes < original.bin.length / 2);
    const parts = decodeTreePrototype(asBuffer(f.files[lod]), f.id, f.streamed, lod);
    assert.equal(parts.length, 2); assert.ok(parts.every(p => p.lod === lod));
    assert.throws(() => decodeTreePrototype(asBuffer(f.files[lod]), f.id, f.streamed, ((lod + 1) % 3) as 0|1|2), /identity/);
  }
  assert.throws(() => decodeTreePrototype(asBuffer(f.original), f.id, f.streamed, 2), /identity/);
  const invalid: any = structuredClone(f.manifest); invalid.prototypes[f.id].lods[1] = invalid.prototypes[f.id].lods[0];
  assert.throws(() => parseTreePilotManifest(invalid), /mesh names|separate/);
  const unreferenced = readSeasonalGlb(f.files[2]); unreferenced.json.accessors.push(unreferenced.json.accessors[0]);
  assert.throws(() => decodeTreePrototype(asBuffer(encodeSeasonalGlb(unreferenced.json, unreferenced.bin)), f.id, f.streamed, 2), /unused/);
});

test("v3 validates known complete catalogue, roots, separate files and far budget before any geometry IO", t => {
  const h = harness(t), f = fixture();
  assert.deepEqual(h.r.validatePilot(h.manifest, h.selections), [source.osmId]);
  const full = { ...f.manifest, prototypes: {} as Record<string, TreePrototype>, placements: [] as any[] }, all: Record<string, string> = {};
  for (const tree of TREES) {
    const id = "known-" + tree.osmId;
    full.prototypes[id] = { ...f.streamed, sourceTreeId: tree.osmId, trunkRadius: treeTrunkCollision(tree).radius,
      lods: f.streamed.lods.map((file, lod) => ({ ...file, url: `/models/vegetation/seasonal-streamed/${id}-lod${lod}.glb`, meshNames: [`${id}__lod${lod}__wood`, `${id}__lod${lod}__foliage`] })) };
    full.placements.push({ sourceTreeId: tree.osmId, sourceRootXZ: [tree.x, tree.z], prototypeCandidates: [id], selectedPrototypeId: null }); all[tree.osmId] = id;
  }
  assert.equal(h.r.validatePilot(parseTreePilotManifest(full), all).length, 110);
  full.placements[0].sourceRootXZ[0] += 1;
  assert.throws(() => h.r.validatePilot(parseTreePilotManifest(full), h.selections), /mismatch/);
  const oversized: any = structuredClone(h.manifest); oversized.prototypes[f.id].lods[2].bytes = TREE_PILOT_BYTES_LIMIT + 1;
  assert.throws(() => h.r.validatePilot(oversized, h.selections), /budget/); assert.equal(h.calls.length, 0);
  const duplicate: any = structuredClone(f.manifest); duplicate.prototypes[f.id].lods[1] = { ...duplicate.prototypes[f.id].lods[1], url: duplicate.prototypes[f.id].lods[0].url };
  assert.throws(() => parseTreePilotManifest(duplicate), /separate/);
});

test("v3 initial load is far only; late detail obeys current season, quality and transformed root", async t => {
  const h = harness(t), f = fixture(); await h.load();
  assert.deepEqual(h.calls, [f.streamed.lods[2].url]);
  const group = h.r.treeGroups[0]; assert.deepEqual(group.lods.map((m: Mesh[]) => m.length), [0,0,2]);
  let finish!: (value: ArrayBuffer) => void;
  t.mock.method(h.r.loader, "asset", (file: TreeAssetFile) => { h.calls.push(file.url); return new Promise<ArrayBuffer>(resolve => finish = resolve); });
  h.renderer.update(input()); assert.equal(h.r.loadingTrees.size, 1); assert.equal(h.renderer.stats.treeDetailReservedBytes, f.streamed.lods[0].bytes);
  const moved = { x: source.x + 5, y: group.root.position.y + 1, z: source.z + 7 };
  assert.ok(h.renderer.setTreeTransform(source.osmId, moved, .8));
  const winter = getTreeSeasonState(Date.UTC(2026, 0, 15));
  h.renderer.update(input({ time: 1.2, quality: "low", player: { x: source.x + 1000, y: 0, z: source.z }, season: winter }));
  finish(asBuffer(f.files[0])); await settle();
  assert.equal(group.active, 2); assert.equal(h.renderer.stats.treeDetailReservedBytes, 0);
  for (const mesh of group.lods[0]) {
    assert.equal(mesh.parent, group.root); assert.equal(mesh.isEnabled(), false); assert.equal(mesh.hasVertexAlpha, false);
    assert.deepEqual(mesh.getWorldMatrix().asArray(), group.root.getWorldMatrix().asArray());
    if (mesh.metadata.treeRole === "foliage") assert.equal(mesh.subMeshes[0].indexCount, 0);
  }
  h.renderer.update(input({ time: 1.4, player: moved, season: winter })); assert.equal(group.active, 0); assert.equal(group.lods[0][1].isEnabled(), false);
  h.renderer.update(input({ time: 1.41, player: moved })); assert.equal(group.lods[0][1].subMeshes[0].indexCount, 3); assert.equal(group.lods[0][1].isEnabled(), true);
  assert.equal(h.renderer.stats.treePilotSourceBytes, f.streamed.lods[0].bytes + f.streamed.lods[2].bytes);
  assert.equal(h.renderer.litterMaterials?.leafMaterial, group.lods[0][1].material);
});

test("initial far queue and detail queue are each bounded to two; detail priority and distance drive order", async t => {
  const fixtures = [source, ...TREES.filter(tree => tree !== source).slice(0,2)].map(fixture), h = harness(t, fixtures);
  const pending: { url: string; finish: (buffer: ArrayBuffer) => void }[] = [];
  t.mock.method(h.r.loader, "asset", (file: TreeAssetFile) => new Promise<ArrayBuffer>(finish => pending.push({ url: file.url, finish })));
  const loading = h.load(); await settle(); assert.equal(pending.length, 2);
  pending[0].finish(h.byUrl.get(pending[0].url)!); await settle(); assert.equal(pending.length, 3);
  pending[1].finish(h.byUrl.get(pending[1].url)!); pending[2].finish(h.byUrl.get(pending[2].url)!); await loading;
  pending.length = 0;
  const groups = h.r.treeGroups;
  groups[0].x = 15; groups[0].z = 0; groups[0].desired = 1;
  groups[1].x = 5; groups[1].z = 0; groups[1].desired = 0;
  groups[2].x = 2; groups[2].z = 0; groups[2].desired = 0;
  h.r.player.set(0,0,0); h.r.startDetailLoads(); assert.equal(pending.length, 2); assert.equal(h.r.loadingTrees.size, 2);
  assert.equal(pending[0].url, groups[2].stream.prototype.lods[0].url); assert.equal(pending[1].url, groups[1].stream.prototype.lods[0].url);
  pending[0].finish(h.byUrl.get(pending[0].url)!); await settle(); assert.equal(pending.length, 3); assert.equal(pending[2].url, groups[0].stream.prototype.lods[1].url);
  assert.equal(h.r.detailCache.size + h.r.reservations.size, 3, "settled cache entry does not also retain its reservation");
  pending[1].finish(h.byUrl.get(pending[1].url)!); pending[2].finish(h.byUrl.get(pending[2].url)!); await settle();
  assert.equal(h.r.loadingTrees.size, 0); assert.equal(h.r.reservations.size, 0);
});

test("hard cache reservations retain far fallback; eviction frees geometry but preserves shared materials", async t => {
  const h = harness(t), f = fixture(); await h.load(); const group = h.r.treeGroups[0]; group.desired = 0;
  for (let i = 0; i < TREE_DETAIL_CACHE_LIMIT; i++) h.r.reservations.set("peer:" + i, 1);
  h.r.startDetailLoads(); assert.equal(h.calls.length, 1); assert.equal(group.active, 2);
  h.r.reservations.clear(); h.r.reservations.set("peer", TREE_DETAIL_BYTES_LIMIT);
  h.r.startDetailLoads(); assert.equal(h.calls.length, 1); h.r.reservations.clear();
  h.r.startDetailLoads(); await settle(); assert.equal(group.active, 0); assert.equal(h.r.detailCache.size, 1);
  const detail = [...group.lods[0]], material = detail[1].material, geometryCount = h.scene.geometries.length;
  group.desired = 2; h.r.applyVisibility(); h.r.trimDetailCache(0, TREE_DETAIL_BYTES_LIMIT);
  assert.equal(h.r.detailCache.size, 0); assert.equal(h.r.detailBytes.size, 0); assert.ok(detail.every(mesh => mesh.isDisposed()));
  assert.equal(h.scene.geometries.length, geometryCount - 2); assert.ok(h.scene.materials.includes(material));
  assert.equal(h.renderer.stats.treePilotSourceBytes, f.streamed.lods[2].bytes); assert.equal(group.active, 2);
});

test("failed partial detail allocation disposes both role meshes, preserves far and releases reservation", async t => {
  const h = harness(t); await h.load(); const group = h.r.treeGroups[0], original = h.r.describe.bind(h.r);
  t.mock.method(h.r, "describe", (mesh: Mesh, ...args: any[]) => { if (mesh.name.includes("__lod0__foliage")) throw Error("injected partial allocation"); return original(mesh, ...args); });
  group.desired = 0;
  // Block fallback to inspect the failed transaction without a succeeding mid.
  h.r.failedTrees.add(group.id + ":1"); h.r.startDetailLoads(); await settle();
  assert.equal(group.active, 2); assert.deepEqual(group.lods.map((meshes: Mesh[]) => meshes.length), [0,0,2]);
  assert.equal(h.scene.meshes.length, 2); assert.equal(h.scene.geometries.length, 2); assert.equal(h.scene.materials.length, 2);
  assert.equal(h.r.reservations.size, 0); assert.equal(h.r.loadingTrees.size, 0); assert.equal(h.r.detailCache.size, 0);
  assert.match(h.renderer.stats.loadError!, /partial allocation/);
});

test("legacy and v3 share two detail slots and an old legacy rejection cannot poison replacement", async t => {
  const f = fixture(), h = harness(t), legacyGroup = h.r.createGroup(source.osmId);
  legacyGroup.desired = 0; h.r.treeGroups.push(legacyGroup);
  const legacyFile = { url: "/models/vegetation/runtime/old-detail.bin", bytes: 64, sha256: "0".repeat(64) };
  h.r.treeRuntime = { trees: { [source.osmId]: { 0: legacyFile } } };
  let rejectOld!: (error: Error) => void;
  const original = h.r.loader.asset.bind(h.r.loader);
  t.mock.method(h.r.loader, "asset", (file: TreeAssetFile) => file.url === legacyFile.url ? new Promise<ArrayBuffer>((_, reject) => rejectOld = reject) : original(file));
  h.r.startDetailLoads(); assert.equal(h.r.loadingTrees.size, 1);
  h.r.failedTrees.add(source.osmId + ":1");
  await h.load(); assert.equal(h.r.treeGroups[0], legacyGroup); assert.equal(h.r.failedTrees.has(source.osmId + ":1"), false);
  rejectOld(Error("old generation failure")); await settle();
  assert.equal(h.r.failedTrees.has(source.osmId + ":0"), false); assert.equal(legacyGroup.active, 0);
  assert.equal(h.renderer.stats.loadError, undefined); assert.ok(h.calls.includes(f.streamed.lods[0].url));

  const peer = h.r.createGroup(TREES.find(tree => tree.osmId !== source.osmId)!.osmId);
  peer.desired = 0; peer.x = 0; peer.z = 0; h.r.treeGroups.push(peer);
  h.r.treeRuntime.trees[peer.id] = { 0: legacyFile };
  legacyGroup.desired = 1; legacyGroup.x = 1; legacyGroup.z = 0;
  const pending: ((value: ArrayBuffer) => void)[] = [];
  t.mock.method(h.r.loader, "asset", () => new Promise<ArrayBuffer>(resolve => pending.push(resolve)));
  h.r.startDetailLoads(); assert.equal(h.r.loadingTrees.size, 2); assert.equal(pending.length, 2);
  assert.ok(h.r.loadingTrees.has(peer.id + ":0")); assert.ok(h.r.loadingTrees.has(source.osmId + ":1"));
  h.renderer.dispose(); for (const finish of pending) finish(new ArrayBuffer(0)); await settle();
  assert.equal(h.r.loadingTrees.size, 0);
});

test("wood-only far preloads declared foliage material for later detail without geometry IO", async t => {
  const f = fixture(), prototype: any = f.streamed;
  prototype.lods[2] = { ...prototype.lods[2], meshNames: [`${f.id}__lod2__wood`] };
  f.files[2] = splitSeasonalGlb(f.original, f.id, prototype, 2);
  prototype.lods[2] = { ...prototype.lods[2], bytes: f.files[2].length, sha256: hash(f.files[2]) };
  const h = harness(t, [f]), keys: string[] = [];
  h.r.materials.get("LeafSet024").dispose(); h.r.materials.delete("LeafSet024");
  t.mock.method(h.r, "pilotMaterial", async (key: string) => {
    keys.push(key); if (!h.r.materials.has(key)) h.r.materials.set(key, new PBRMaterial(key, h.scene)); return h.r.materials.get(key);
  });
  await h.load(); assert.deepEqual(keys, ["Bark012", "LeafSet024"]); assert.equal(h.calls.length, 1);
  const group = h.r.treeGroups[0]; assert.equal(group.lods[2].length, 1);
  group.desired = 0; h.r.startDetailLoads(); await settle();
  assert.equal(group.active, 0); assert.equal(group.lods[0][1].material, h.r.materials.get("LeafSet024")); assert.equal(keys.length, 2);
});

test("oversized or corrupt near can use mid; corruption allocates no partial geometry", async t => {
  const h = harness(t), f = fixture(); await h.load(); const group = h.r.treeGroups[0];
  const original = h.r.loader.asset.bind(h.r.loader);
  t.mock.method(h.r.loader, "asset", (file: TreeAssetFile) => file.url === f.streamed.lods[0].url ? Promise.resolve(new ArrayBuffer(32)) : original(file));
  group.desired = 0; h.r.startDetailLoads(); await settle();
  assert.equal(group.active, 1); assert.equal(group.lods[0].length, 0); assert.equal(h.scene.geometries.length, 4);
  assert.ok(h.r.failedTrees.has(group.id + ":0")); assert.equal(h.r.reservations.size, 0);
  assert.equal(h.renderer.stats.treeDetailCacheBytes, f.streamed.lods[1].bytes);
});

test("dispose aborts detail fetch; even ignored abort response creates no new meshes", async t => {
  const h = harness(t), f = fixture(); await h.load(); const group = h.r.treeGroups[0];
  // Restore real fetch ownership after the synthetic far setup.
  t.mock.restoreAll();
  let finish!: (response: Response) => void, signal: AbortSignal | undefined;
  t.mock.method(globalThis, "fetch", async (_: unknown, options?: RequestInit) => { signal = options?.signal ?? undefined; return new Promise<Response>(resolve => finish = resolve); });
  group.desired = 0; h.r.startDetailLoads(); assert.equal(h.r.loadingTrees.size, 1);
  h.renderer.dispose(); assert.ok(signal?.aborted); finish(new Response(asBuffer(f.files[0]))); await settle();
  assert.equal(h.scene.meshes.length, 0); assert.equal(h.scene.geometries.length, 0); assert.equal(h.r.reservations.size, 0); assert.equal(h.r.loadingTrees.size, 0); assert.equal(h.r.loader.stats.pending, 0);
});

test("actual streamed export is byte-identical to every referenced R4 accessor", () => {
  const original = parseTreePilotManifest(JSON.parse(readFileSync("public/models/vegetation/seasonal/runtime-contract.json", "utf8")));
  const streamed = parseTreePilotManifest(JSON.parse(readFileSync("public/models/vegetation/seasonal-streamed/runtime-contract.json", "utf8")));
  assert.equal(streamed.version, 3); assert.deepEqual(streamed.placements, original.placements);
  for (const [id, prototype] of Object.entries(streamed.prototypes)) {
    const sourceBytes = readFileSync("public" + original.prototypes[id].lods[0].url);
    for (const lod of [0,1,2] as const) {
      const file = prototype.lods[lod], bytes = readFileSync("public" + file.url);
      assert.equal(bytes.length, file.bytes); assert.equal(hash(bytes), file.sha256);
      assert.equal(verifySeasonalSplit(sourceBytes, bytes, file.meshNames).accessorComparisons, 9);
      const parts = decodeTreePrototype(asBuffer(bytes), id, prototype, lod); assert.equal(parts.length, 2);
    }
  }
});
