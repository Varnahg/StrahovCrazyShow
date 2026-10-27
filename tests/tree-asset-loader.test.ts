import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { RawTexture } from "@babylonjs/core/Materials/Textures/rawTexture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { GLTFFileLoader } from "@babylonjs/loaders/glTF/glTFFileLoader";
import { TreeAssetLoader, decodeTreePrototype, decodeTreeRuntimeChunk, readTreeGlb } from "../client/tree-asset-loader";
import { TreeRenderer, TREE_DETAIL_CACHE_LIMIT } from "../client/tree-renderer";
import { parseTreePilotManifest, parseLegacyTreeManifest, type TreePrototype } from "../shared/tree-asset-types";
import { getTreeSeasonState } from "../shared/tree-season";
import { TREES } from "../shared/world";
import { treeTrunkCollision } from "../shared/vegetation";
import legacy from "../public/models/vegetation/runtime/manifest.json";
import barkSource from "../shared/data/assets/tree-bark-material.json";

const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const asBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
const source = TREES.find(t => t.reconstruction?.appearance === "broadleaf") ?? TREES.find(t => t.reconstruction?.appearance !== "conifer")!;
const prototypeId = "test-broadleaf";
test("source bark descriptor stays identical to the public provenance and original channels", () => {
  const original = JSON.parse(readFileSync("public/models/vegetation/realistic/texture-manifest.json", "utf8"));
  assert.deepEqual(barkSource, original.assets.find((asset: any) => asset.id === "Bark012"));
  for (const channel of Object.values(barkSource.channels)) {
    const bytes = readFileSync("public" + channel.url);
    assert.equal(bytes.length, channel.bytes); assert.equal(hash(bytes), channel.sha256);
  }
});
function fixture() {
  const chunks: Uint8Array[] = [], views: any[] = [], accessors: any[] = [], nodes: any[] = [], meshes: any[] = []; let offset = 0;
  const append = (data: Float32Array | Uint16Array, type: string, normalized = false) => {
    const bytes = new Uint8Array(data.buffer); const padding = new Uint8Array((4 - bytes.length % 4) % 4);
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length }); chunks.push(bytes, padding); offset += bytes.length + padding.length;
    const components: Record<string, number> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
    accessors.push({ bufferView: views.length - 1, componentType: data instanceof Float32Array ? 5126 : 5123, count: data.length / components[type], type, ...(normalized ? { normalized: true } : {}) }); return accessors.length - 1;
  };
  for (let lod = 0; lod < 3; lod++) for (const role of ["wood", "foliage"]) {
    const name = `${prototypeId}__lod${lod}__${role}`;
    const attributes: any = {
      POSITION: append(new Float32Array([0,0,0, 1,0,0, 0,1,0, 0,0,1, 1,0,1, 0,1,1]), "VEC3"),
      NORMAL: append(new Float32Array([0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,1]), "VEC3"),
      TEXCOORD_0: append(new Float32Array([0,0, 1,0, 0,1, 0,0, 1,0, 0,1]), "VEC2"),
    };
    if (role === "foliage") attributes.COLOR_0 = append(new Uint16Array([65535,65535,65535,1, 65535,65535,65535,1, 65535,65535,65535,1, 65535,65535,65535,65534, 65535,65535,65535,65534, 65535,65535,65535,65534]), "VEC4", true);
    const indices = append(new Uint16Array([0,1,2,3,4,5]), "SCALAR");
    nodes.push({ name, mesh: meshes.length, extras: { role, materialKey: role === "wood" ? "Bark012" : "LeafSet024", lod, archetypeId: prototypeId, sourceTreeId: source.osmId } });
    meshes.push({ name, primitives: [{ attributes, indices }] });
  }
  const json = { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes, buffers: [{ byteLength: offset }], bufferViews: views, accessors };
  function encode() {
    const text = Buffer.from(JSON.stringify(json)), jsonPadding = Buffer.alloc((4-text.length%4)%4, 32), bin = Buffer.concat(chunks);
    const out = Buffer.alloc(28 + text.length + jsonPadding.length + bin.length);
    out.writeUInt32LE(0x46546c67,0); out.writeUInt32LE(2,4); out.writeUInt32LE(out.length,8); out.writeUInt32LE(text.length+jsonPadding.length,12); out.writeUInt32LE(0x4e4f534a,16); text.copy(out,20); jsonPadding.copy(out,20+text.length);
    const at=20+text.length+jsonPadding.length; out.writeUInt32LE(bin.length,at);out.writeUInt32LE(0x004e4942,at+4);bin.copy(out,at+8);return out;
  }
  const bytes=encode(), file={url:"/models/vegetation/seasonal/test.glb",bytes:bytes.length,sha256:hash(bytes)};
  const prototype:TreePrototype={sourceTreeId:source.osmId,family:"deciduous-broadleaf",nominalHeight:8,nominalCrownDiameter:4,trunkRadius:treeTrunkCollision(source).radius,lods:[0,1,2].map(lod=>({...file,meshNames:[`${prototypeId}__lod${lod}__wood`,`${prototypeId}__lod${lod}__foliage`]}))};
  const manifest={version:2,units:"metres",rankEncoding:"uint16-normalized",prototypes:{[prototypeId]:prototype},placements:[{sourceTreeId:source.osmId,sourceRootXZ:[source.x,source.z],prototypeCandidates:[prototypeId],selectedPrototypeId:null}]};
  return {json,encode,bytes,file,prototype,manifest};
}

test("v2 validates every LOD/role, normalized rank, bounds and identity before allocation", () => {
  const f=fixture(), parsed=parseTreePilotManifest(f.manifest); assert.equal(Object.keys(parsed.prototypes).length,1);
  const parts=decodeTreePrototype(asBuffer(f.bytes),prototypeId,f.prototype);assert.equal(parts.length,6);assert.equal(parts[1].colors![3],Math.fround(1/65535));
  f.json.nodes[5].extras.sourceTreeId="wrong";
  assert.throws(()=>decodeTreePrototype(asBuffer(f.encode()),prototypeId,f.prototype),/extras/);
  f.json.nodes[5].extras.sourceTreeId=source.osmId;
  f.json.accessors.at(-2)!.normalized=false;
  assert.throws(()=>decodeTreePrototype(asBuffer(f.encode()),prototypeId,f.prototype),/normalized/);
  const invalid=structuredClone(f.manifest); invalid.placements.push(invalid.placements[0]); assert.throws(()=>parseTreePilotManifest(invalid),/Duplicate/);
  const invalidUrl:any=structuredClone(f.manifest);invalidUrl.prototypes[prototypeId].lods[0].url="https://example.com/tree.glb";assert.throws(()=>parseTreePilotManifest(invalidUrl),/URL/);
});

test("v1 rejects malformed late primitives and unsupported accessors, retaining exact valid buffers", () => {
  parseLegacyTreeManifest(legacy);
  const entry=Object.values(legacy.trees)[0]["0"],bytes=readFileSync("public"+entry.url),buffer=asBuffer(bytes);
  const valid=decodeTreeRuntimeChunk(buffer);assert.ok(valid.primitives.length);
  const length=bytes.readUInt32LE(0),meta=JSON.parse(bytes.subarray(4,4+length).toString()), last=meta.primitives.at(-1);
  const old=last.indices.componentType;last.indices.componentType=5121;
  const edited=Buffer.from(bytes),json=Buffer.from(JSON.stringify(meta));assert.ok(json.length<=length);edited.fill(32,4,4+length);json.copy(edited,4);
  assert.throws(()=>decodeTreeRuntimeChunk(asBuffer(edited)),/attribute type/);last.indices.componentType=old;
  const f=fixture();f.json.bufferViews.at(-1)!.byteLength=1;assert.throws(()=>readTreeGlb(asBuffer(f.encode())),/bounds/);
});

test("identical requests coalesce; integrity and response caps fail without retained cache", async t => {
  const f=fixture(),loader=new TreeAssetLoader();let calls=0;
  t.mock.method(globalThis,"fetch",async()=>{calls++;return new Response(f.bytes);});
  const first=loader.asset(f.file),second=loader.asset(f.file);assert.equal(first,second);
  assert.equal(await first,await second);assert.equal(calls,1);assert.equal(loader.stats.pending,0);
  await loader.asset(f.file);assert.equal(calls,2,"completed buffers are not retained by loader");
  await assert.rejects(loader.asset({...f.file,sha256:"0".repeat(64)}),/SHA/);
  await assert.rejects(loader.bytes(f.file.url,1),/budget/);loader.dispose();
  assert.throws(()=>loader.asset(f.file),/disposed/);
});

test("synchronous transport rejection does not remain in the coalescing registry",async t=>{
  const loader=new TreeAssetLoader(),f=fixture();let calls=0;
  t.mock.method(globalThis,"fetch",()=>{calls++;throw Error("transport failed");});
  await assert.rejects(loader.asset(f.file),/transport/);await assert.rejects(loader.asset(f.file),/transport/);
  assert.equal(calls,2);assert.equal(loader.stats.pending,0);loader.dispose();
});

test("HTTP-compatible integrity still rejects corruption and aborts cooperative hashing", async t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "crypto")!;
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: {} });
  t.after(() => Object.defineProperty(globalThis, "crypto", descriptor));
  const data = new Uint8Array(1024 * 1024 + 7).fill(37), loader = new TreeAssetLoader();
  const file = { url: "/models/vegetation/hash-fixture.bin", bytes: data.length, sha256: hash(data) };
  t.after(() => loader.dispose());
  t.mock.method(globalThis, "fetch", async () => new Response(data));
  assert.equal((await loader.asset(file)).byteLength, data.length);
  data[100] ^= 1;
  await assert.rejects(loader.asset(file), /SHA-256 mismatch/);
  data[100] ^= 1;
  const pending = loader.asset(file), cancel = setTimeout(() => loader.dispose(), 0);
  try { await assert.rejects(pending, error => error instanceof DOMException && error.name === "AbortError"); }
  finally { clearTimeout(cancel); }
  assert.equal(loader.stats.bytesFetched, data.length * 3, "abort při hashování následuje po úplném fetch");
  assert.equal(loader.stats.pending, 0);
});

test("photographic PBR factory shares source maps and keeps opacity/rank/normal conventions",async t=>{
  const engine=new NullEngine(),scene=new Scene(engine),renderer=new TreeRenderer(scene),r=renderer as any;scene.useRightHandedSystem=true;
  t.after(()=>{renderer.dispose();scene.dispose();engine.dispose();});
  const requests:{url:string;gamma:boolean}[]=[];
  t.mock.method(r,"texture",async(file:any,gamma:boolean)=>{requests.push({url:file.url,gamma});const texture=RawTexture.CreateRGBATexture(new Uint8Array([128,128,255,255]),1,1,scene);texture.gammaSpace=gamma;r.textures.add(texture);return texture;});
  const material=await r.pilotMaterial("LeafSet024");assert.equal(await r.pilotMaterial("LeafSet024"),material);assert.equal(requests.length,4);
  assert.equal(requests.filter(r=>r.gamma).length,1);assert.ok(requests.find(r=>r.gamma)!.url.endsWith("_Color.jpg"));
  assert.equal(material.alpha,1);assert.equal(material.transparencyMode,PBRMaterial.PBRMATERIAL_ALPHATEST);assert.equal(material.opacityTexture.getAlphaFromRGB,true);
  assert.equal(material.twoSidedLighting,true);assert.equal(material.invertNormalMapX,false);assert.equal(material.invertNormalMapY,true);
  assert.equal(material.bumpTexture.level, .45, "raw leaf normal strength matches the native material");
  assert.equal(material.useRoughnessFromMetallicTextureAlpha,false);assert.equal(material.useRoughnessFromMetallicTextureGreen,true);assert.equal(material.useMetallnessFromMetallicTextureBlue,false);
  assert.equal(material.subSurface.translucencyColorTexture,null);assert.equal(material.subSurface.useAlbedoToTintTranslucency,true);
  assert.equal(renderer.litterMaterials?.leafMaterial, material);
  assert.equal(renderer.litterMaterials?.twigMaterial, undefined);
  assert.equal(requests.length, 4, "borrowing ground maps never fetches additional textures");
  for (const key of ["Bark012", "fir_tree_01"]) assert.equal((await r.pilotMaterial(key)).bumpTexture.level, .45);
  const owned=[...r.textures];renderer.dispose();assert.ok(owned.every(texture=>!scene.textures.includes(texture)));
  assert.equal(renderer.litterMaterials, undefined, "disposed owners cannot lend their resources");
  assert.ok(scene.textures.every(texture=>texture.name.startsWith("data:EnvironmentBRDFTexture")),"PBR's scene-shared BRDF remains scene-owned");assert.equal(scene.materials.length,0);
});

test("raw normal calibration never modifies a borrowed legacy bark material", async t => {
  const engine = new NullEngine(), scene = new Scene(engine), renderer = new TreeRenderer(scene), r = renderer as any;
  t.after(() => { renderer.dispose(); scene.dispose(); engine.dispose(); });
  const legacy = new PBRMaterial("legacy Bark012", scene);
  legacy.bumpTexture = RawTexture.CreateRGBATexture(new Uint8Array([128,128,255,255]), 1, 1, scene);
  legacy.bumpTexture.level = .73; r.sharedTreeMaterials.push(legacy);
  t.mock.method(r, "texture", () => { throw Error("borrowed material must not fetch textures"); });
  assert.equal(await r.pilotMaterial("Bark012"), legacy);
  assert.equal(legacy.bumpTexture.level, .73);
});

for (const rejected of ["http", "length"] as const) {
  test(`rejected ${rejected} response cancels its body without cancelling a peer or poisoning retry`, async t => {
    const data = new Uint8Array([1, 2, 3, 4]), loader = new TreeAssetLoader();
    const file = { url: "/models/vegetation/rejected.glb", bytes: data.length, sha256: hash(data) };
    const peer = { ...file, url: "/models/vegetation/peer.glb" };
    let cancelled = 0, requests = 0, reads = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { reads++; controller.enqueue(data); },
      cancel() { cancelled++; },
    }, { highWaterMark: 0 });
    t.after(async () => { loader.dispose(); await body.cancel().catch(() => {}); });
    t.mock.method(globalThis, "fetch", async (url: unknown) => {
      if (url === peer.url) return new Response(data);
      return ++requests === 1
        ? new Response(body, rejected === "http" ? { status: 503 } : { headers: { "content-length": "5" } })
        : new Response(data);
    });
    const bad = loader.asset(file), good = loader.asset(peer);
    assert.equal(loader.asset(file), bad, "jedno tělo vlastní společný in-flight požadavek");
    await assert.rejects(bad, rejected === "http" ? /Tree HTTP 503/ : /exceeds budget/);
    assert.equal(cancelled, 1, "odmítnuté otevřené tělo musí být zrušené");
    assert.equal(reads, 0, "odmítnutí hlaviček nesmí číst ani alokovat tělo");
    assert.equal(body.locked, false);
    assert.deepEqual(new Uint8Array(await good), data);
    assert.equal(loader.disposed, false);
    assert.deepEqual(new Uint8Array(await loader.asset(file)), data);
    assert.equal(requests, 2); assert.equal(loader.stats.pending, 0);
  });
}

test("response cancellation failure cannot replace the original HTTP error", async t => {
  const loader = new TreeAssetLoader(); t.after(() => loader.dispose()); let cancelled = 0;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; throw Error("cleanup failed"); } });
  t.mock.method(globalThis, "fetch", async () => new Response(body, { status: 503 }));
  await assert.rejects(loader.bytes("/models/vegetation/rejected.glb", 4), /Tree HTTP 503/);
  assert.equal(cancelled, 1); assert.equal(body.locked, false); assert.equal(loader.stats.pending, 0);
});

test("known HTTP failure settles even while underlying cancellation remains pending", async t => {
  const loader = new TreeAssetLoader(); t.after(() => loader.dispose());
  let finishCancel!: () => void, cancelled = 0, failure: unknown;
  const cancellation = new Promise<void>(resolve => { finishCancel = resolve; });
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled++; return cancellation; } });
  t.mock.method(globalThis, "fetch", async () => new Response(body, { status: 503 }));
  const observed = loader.bytes("/models/vegetation/pending-cancel.glb", 4).catch(error => { failure = error; });
  try {
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(cancelled, 1);
    assert.ok(failure instanceof Error && /Tree HTTP 503/.test(failure.message), "cleanup nesmí zadržet již známou chybu");
    assert.equal(loader.stats.pending, 0); assert.equal(body.locked, false);
  } finally { finishCancel(); await observed; }
});

test("stream readers release their locks after success, overflow and source failure", async t => {
  const loader = new TreeAssetLoader(); t.after(() => loader.dispose());
  for (const outcome of ["success", "overflow", "failure"] as const) {
    const failure = Error("source read failed"); let cancelled = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        if (outcome === "failure") controller.error(failure);
        else { controller.enqueue(new Uint8Array([1, 2, 3, 4])); if (outcome === "success") controller.close(); }
      }, cancel() { cancelled++; },
    });
    t.mock.method(globalThis, "fetch", async () => new Response(body));
    const request = loader.bytes("/models/vegetation/" + outcome + ".glb", outcome === "overflow" ? 3 : 4);
    if (outcome === "success") assert.equal((await request).byteLength, 4);
    else await assert.rejects(request, outcome === "overflow" ? /exceeds budget/ : error => error === failure);
    assert.equal(cancelled, outcome === "overflow" ? 1 : 0);
    assert.equal(body.locked, false, outcome); assert.equal(loader.stats.pending, 0);
  }
});

test("dispose aborts coalesced fetches and a late ignored-abort response cannot allocate",async t=>{
  const f=fixture(),loader=new TreeAssetLoader();let finish!:(r:Response)=>void,signal:AbortSignal|undefined;
  let cancelled=0;const body=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(f.bytes);},cancel(){cancelled++;}});
  t.after(async()=>{await body.cancel().catch(()=>{});});
  t.mock.method(globalThis,"fetch",async(_url:unknown,init?:RequestInit)=>{signal=init?.signal??undefined;return new Promise<Response>(r=>finish=r);});
  const request=loader.asset(f.file);loader.dispose();assert.ok(signal?.aborted);finish(new Response(body));await assert.rejects(request,/disposed/);assert.equal(loader.stats.pending,0);
  assert.equal(cancelled,1,"opožděná odpověď po dispose nesmí ponechat otevřené tělo");assert.equal(body.locked,false);
});

test("owned Babylon import succeeds and cleans a partial import rejection without touching peer assets",async t=>{
  const f=fixture(),engine=new NullEngine(),scene=new Scene(engine),loader=new TreeAssetLoader();scene.useRightHandedSystem=true;
  t.after(()=>{loader.dispose();scene.dispose();engine.dispose();});
  t.mock.method(globalThis,"fetch",async()=>new Response(f.bytes));
  await assert.rejects(loader.importLegacy(scene,f.file,{materialNames:[],treeIds:[source.osmId]}),/bootstrap tree node/);
  assert.equal(scene.meshes.length,0,"source identity validation precedes the Babylon importer");
  const container=await loader.importLegacy(scene,f.file);assert.equal(container.meshes.length,7);container.dispose();assert.equal(scene.meshes.length,0);
  const peer=new Mesh("unrelated peer",scene),peerMaterial=new PBRMaterial("unrelated material",scene);peer.material=peerMaterial;
  t.mock.method(GLTFFileLoader.prototype,"loadAssetContainerAsync",async function(this:GLTFFileLoader){
    const mesh=new Mesh("partial tree",scene),data=new VertexData();data.positions=[0,0,0,1,0,0,0,1,0];data.indices=[0,1,2];data.applyToMesh(mesh);
    const material=new PBRMaterial("partial tree material",scene);mesh.material=material;
    this.onMeshLoadedObservable.notifyObservers(mesh);this.onMaterialLoadedObservable.notifyObservers(material);
    throw Error("Injected image decode rejection after mesh allocation");
  });
  await assert.rejects(loader.importLegacy(scene,f.file),/image decode rejection/);
  assert.deepEqual(scene.meshes,[peer]);assert.deepEqual(scene.materials,[peerMaterial]);assert.equal(scene.geometries.length,0);
});

test("late pilot and every LOD obey latest winter/absence state with local normals and shared root", async t=>{
  const f=fixture(),engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  const renderer=new TreeRenderer(scene,{treePilot:{manifestUrl:"/models/vegetation/seasonal/test.json",selections:{[source.osmId]:prototypeId}}}),r=renderer as any;
  t.after(()=>{renderer.dispose();scene.dispose();engine.dispose();});
  for(const key of ["Bark012","LeafSet024"])r.materials.set(key,new PBRMaterial(key,scene));
  let finish!:(r:Response)=>void;
  t.mock.method(globalThis,"fetch",async()=>new Promise<Response>(resolve=>finish=resolve));
  const pending=r.loadPilot(parseTreePilotManifest(f.manifest),[source.osmId]);
  const input={time:1,quality:"high",player:{x:source.x,y:0,z:source.z},wind:{x:0,z:0,speed:0},season:getTreeSeasonState(Date.UTC(2026,0,15))};
  renderer.update(input);finish(new Response(f.bytes));await pending;
  const group=r.treeGroups[0];assert.equal(group.root.position.x,source.x);assert.equal(group.root.position.z,source.z);
  const litterSource = renderer.litterSources()[0];
  assert.equal(litterSource.id, source.osmId); assert.equal(litterSource.family, group.family); assert.equal(litterSource.seed, group.seed);
  assert.equal(litterSource.crownRadius, (source.reconstruction?.crownDiameter ?? source.crownDiameter ?? source.size) / 2);
  renderer.setTreeTransform(source.osmId, { x: source.x + 1, y: group.root.position.y, z: source.z + 2 });
  assert.deepEqual(renderer.litterSources()[0], { ...litterSource, x: source.x + 1, z: source.z + 2 });
  assert.equal(litterSource.x, source.x, "borrowed source snapshots do not mutate after transforms");
  assert.deepEqual(renderer.stats.treeSeason, { sampledAt: input.season.sampledAt, source: input.season.source, phaseDay: input.season.phaseDay });
  assert.equal(renderer.stats.treePilot, undefined, "a generic one-source asset must not claim the named two-tree comparison");
  for(const lod of [0,1,2])for(const mesh of group.lods[lod])if(mesh.metadata.treeRole==="foliage") {assert.equal(mesh.subMeshes[0].indexCount,0);assert.equal(mesh.isEnabled(),false);assert.equal(mesh.hasVertexAlpha,false);assert.equal(mesh.material.alpha,1);assert.equal(mesh.metadata.treeNormalSource,"authored-local");}
  renderer.update({...input,time:1.01,season:undefined}); // no LOD cadence required for season change
  assert.equal(renderer.stats.treeSeason, undefined);
  assert.ok(group.lods[2].find((m:any)=>m.metadata.treeRole==="foliage").isEnabled());
  renderer.update({...input,time:1.2,season:undefined});assert.equal(group.active,0);
  for(const lod of [0,1,2])assert.equal(group.lods[lod][1].subMeshes[0].indexCount,6);
  renderer.update({...input,time:1.21});assert.equal(group.lods[0][1].isEnabled(),false);
  renderer.update({...input,time:1.5,player:{x:source.x+1000,y:0,z:source.z}});assert.equal(group.active,2);assert.equal(group.lods[2][1].isEnabled(),false);
  assert.equal(renderer.stats.rankEnabledTreeInstances,1);assert.equal(renderer.stats.legacyTreeInstances,0);
  renderer.dispose();assert.equal(scene.meshes.length,0);assert.equal(scene.geometries.length,0);
});

test("invalid final LOD allocates no partial meshes; hard cache reservations block additional fetches",async t=>{
  const f=fixture(),engine=new NullEngine(),scene=new Scene(engine),renderer=new TreeRenderer(scene,{treePilot:{manifestUrl:"/models/vegetation/seasonal/test.json",selections:{[source.osmId]:prototypeId}}}),r=renderer as any;
  t.after(()=>{renderer.dispose();scene.dispose();engine.dispose();});
  f.json.nodes[5].extras.role="wood";const bytes=f.encode();const manifest:any=structuredClone(f.manifest);for(const lod of manifest.prototypes[prototypeId].lods){lod.bytes=bytes.length;lod.sha256=hash(bytes);}
  t.mock.method(globalThis,"fetch",async()=>new Response(bytes));
  await assert.rejects(r.loadPilot(parseTreePilotManifest(manifest),[source.osmId]),/extras/);assert.equal(scene.meshes.length,0);assert.equal(scene.materials.length,0);
  r.treeRuntime=parseLegacyTreeManifest(legacy);r.treeGroups=[{id:source.osmId,x:source.x,z:source.z,active:2,desired:0,pilot:false,lods:[[],[],[]]}];
  for(let i=0;i<TREE_DETAIL_CACHE_LIMIT;i++)r.reservations.set("reserved"+i,1);
  r.startDetailLoads();assert.equal(r.loadingTrees.size,0);assert.equal(r.loader.stats.requests,1);
  r.treeGroups=[];
});

test("custom pilot keeps the pinned native glTF front-facing convention for identical buffers", async t => {
  const f = fixture();
  t.mock.method(globalThis, "fetch", async () => new Response(f.bytes));
  for (const rightHanded of [true, false]) {
    const engine = new NullEngine(), scene = new Scene(engine); scene.useRightHandedSystem = rightHanded;
    const nativeLoader = new TreeAssetLoader();
    const renderer = new TreeRenderer(scene, { treePilot: { manifestUrl: "/models/vegetation/seasonal/test.json", selections: { [source.osmId]: prototypeId } } });
    const r = renderer as any;
    try {
      const native = await nativeLoader.importLegacy(scene, f.file);
      for (const key of ["Bark012", "LeafSet024"]) r.materials.set(key, new PBRMaterial(key, scene));
      await r.loadPilot(parseTreePilotManifest(f.manifest), [source.osmId]);
      for (const mesh of r.treeGroups[0].lods.flat()) {
        const original = native.meshes.find(candidate => candidate.name === mesh.name)!;
        assert.ok(original instanceof Mesh); assert.equal(mesh.sideOrientation, original.sideOrientation);
        assert.deepEqual(mesh.getVerticesData("position"), original.getVerticesData("position"));
        assert.deepEqual(mesh.getIndices(), original.getIndices(), "orientation correction never rewrites authored indices");
      }
      native.dispose();
    } finally { renderer.dispose(); nativeLoader.dispose(); scene.dispose(); engine.dispose(); }
  }
});

test("published pilot contract and actual immutable GLBs satisfy the runtime decoder",()=>{
  assert.equal(readTreeGlb(asBuffer(readFileSync("public"+legacy.bootstrap))).json.nodes.length,legacy.bootstrapMeshes);
  const contract=parseTreePilotManifest(JSON.parse(readFileSync("public/models/vegetation/seasonal/runtime-contract.json","utf8")));
  const engine=new NullEngine(),scene=new Scene(engine),renderer=new TreeRenderer(scene);
  try { for(const prefix of ["own","mtree"])(renderer as any).validatePilot(contract,{"ipr-crown-014":prefix+"-broadleaf","ipr-b6-north-conifer":prefix+"-conifer"}); }
  finally { renderer.dispose();scene.dispose();engine.dispose(); }
  for(const [id,p]of Object.entries(contract.prototypes)){
    const bytes=readFileSync("public"+p.lods[0].url);assert.equal(bytes.length,p.lods[0].bytes);assert.equal(hash(bytes),p.lods[0].sha256);
    const parts=decodeTreePrototype(asBuffer(bytes),id,p);assert.equal(parts.filter(p=>p.role==="wood").length,3);
    for(const part of parts)if(part.colors){const ranks=new Set<number>();for(let i=3;i<part.colors.length;i+=4)ranks.add(Math.round(part.colors[i]*65535));assert.ok(Math.max(...ranks)>60000,"ranks span normalized range, not 1..N");}
  }
});
