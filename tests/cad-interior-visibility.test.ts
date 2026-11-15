import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { cadEntryZones, cadInteriorAt, cadMeshRole, createCadInteriorVisibility, configureCadWindowGlass } from "../client/cad-interior-visibility";
import { loadCadBuildings } from "../client/cad-buildings";
import { CAD_BUILDINGS } from "../shared/cad-buildings";
import { cadLocalToWorld } from "../shared/cad-building-geometry";
import surfaceRepair from "../shared/data/assets/cad-surface-repair-20261114.json";

const building = CAD_BUILDINGS[1];
const zones = cadEntryZones(building.site, building.model.interactiveDoors!);
const entry = zones.find(zone => zone.id === "b06:n01-door-12E1")!;
const atEntry = (depth: number) => ({ x: entry.center.x + depth * entry.nx,
  y: entry.center.y, z: entry.center.z + depth * entry.nz });
function fixture(t: import("node:test").TestContext) {
  const engine = new NullEngine(), scene = new Scene(engine);
  scene.useRightHandedSystem = true;
  t.after(() => { scene.dispose(); engine.dispose(); });
  const pivot = new TransformNode("cad", scene);
  pivot.position.copyFromFloats(building.placement.translation.x, building.placement.translation.y, building.placement.translation.z);
  pivot.rotation.y = building.placement.yaw;
  return { scene, pivot };
}

test("skutečný B6 vstup odliší venkovní přístřešek, práh, interiér a střechu", () => {
  assert.ok(entry);
  assert.equal(cadInteriorAt(building.site, atEntry(-1)), undefined);
  assert.equal(cadInteriorAt(building.site, atEntry(1))?.floor, "n01");
  assert.equal(cadInteriorAt(building.site, { ...atEntry(1), y: 100 }), undefined);
  assert.ok(zones.length < 30 && zones.length > 1);
});

test("venku pouze otevřený výřez, uvnitř původní celek, žádné duplikované trojúhelníky", t => {
  const { scene, pivot } = fixture(t), mesh = new Mesh("furniture", scene);
  mesh.parent = pivot; mesh.metadata = { gltf: { extras: { role: "interior-furniture/storage" } } };
  const a = atEntry(1), b = atEntry(8);
  const positions = [a.x, a.y, a.z, a.x + .1, a.y, a.z, a.x, a.y + .1, a.z,
    b.x, b.y, b.z, b.x + .1, b.y, b.z, b.x, b.y + .1, b.z];
  mesh.setVerticesData(VertexBuffer.PositionKind, positions);
  mesh.setVerticesData(VertexBuffer.UVKind, [0,0,1,0,0,1,0,0,1,0,0,1]);
  mesh.setIndices([3,4,5,0,1,2]);
  const visibility = createCadInteriorVisibility(pivot, [mesh], building.site, building.placement, [entry], []);
  const slice = scene.meshes.find(m => m.metadata?.cadEntrySlice) as Mesh;
  assert.ok(slice); assert.equal(slice.geometry, mesh.geometry);
  assert.equal(mesh.isEnabled(), false); assert.equal(slice.isEnabled(), false);
  assert.equal(visibility.stats.interiorTriangles, 2);
  visibility.setDoorStates([{ id: entry.id, open: true }]);
  assert.equal(mesh.isEnabled(), false); assert.equal(slice.isEnabled(), true);
  assert.equal(slice.subMeshes[0].indexCount, 3);
  assert.equal(visibility.stats.enabledPotentialTriangles, 1);
  const sub = slice.subMeshes[0];
  assert.deepEqual(Array.from(slice.getIndices()!.slice(sub.indexStart, sub.indexStart + sub.indexCount)), [0,1,2]);
  visibility.update(cadLocalToWorld(atEntry(1), building.placement));
  assert.equal(mesh.isEnabled(), true); assert.equal(slice.isEnabled(), false);
  assert.equal(visibility.stats.enabledPotentialTriangles, 2);
  assert.deepEqual(Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!), positions);
  visibility.setDoorStates([{ id: entry.id, open: false }]);
  visibility.update(cadLocalToWorld(atEntry(-1), building.placement));
  assert.equal(visibility.stats.enabledPotentialTriangles, 0);
  visibility.dispose(); visibility.dispose();
  assert.equal(slice.isDisposed(), true); assert.equal(mesh.isEnabled(), true);
  assert.equal(mesh.getTotalIndices(), 6);
});

test("CAD sklo je neprůhledné s PBR odrazem; zachová odstín a textury", t => {
  const { scene } = fixture(t), glass = new PBRMaterial("B06 / glass", scene);
  glass.alpha = .28; glass.albedoColor.set(.22,.35,.38);
  configureCadWindowGlass(glass);
  assert.equal(glass.alpha, 1); assert.equal(glass.needAlphaBlending(), false);
  assert.equal(glass.needAlphaTesting(), false);
  assert.equal(glass.subSurface.isRefractionEnabled, false);
  assert.deepEqual(glass.albedoColor.asArray(), [.22,.35,.38]);
  assert.ok(glass.roughness! > 0 && glass.roughness! < 1);
  const wood = new PBRMaterial("wood", scene); wood.alpha=.4;
  configureCadWindowGlass(wood); assert.equal(wood.alpha,.4);
});

test("finální B6 GLB: 383280 interiérových tris mimo scénu, dveře a výřezy se obnoví", async t => {
  const { scene } = fixture(t);
  const bytes = readFileSync("public" + surfaceRepair.b06.url);
  assert.equal(bytes.toString("ascii",0,4), "glTF", "vyžaduje skutečný LFS model");
  const json = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
  const controller = await loadCadBuildings(scene, [building], { loadContainer: async url => {
    assert.equal(url, `${surfaceRepair.b06.url}?v=${surfaceRepair.b06.sha256}`);
    // Skutečný Babylon import geometrie; image/GPU ověřuje následný Edge průchod.
    const container = await LoadAssetContainerAsync(new Uint8Array(bytes), scene,
      { pluginExtension: ".glb", pluginOptions: { gltf: { skipMaterials: true } } });
    const materials = json.materials.map((m: {name: string}) => new PBRMaterial(m.name,scene));
    for (const mesh of container.meshes) {
      if (!mesh.getTotalVertices()) continue;
      const match = /_primitive(\d+)$/.exec(mesh.name);
      const name = match ? mesh.name.slice(0, match.index) : mesh.name;
      const node = json.nodes.find((n: {name:string}) => n.name === name);
      assert.ok(node, mesh.name);
      mesh.material = materials[json.meshes[node.mesh].primitives[match ? Number(match[1]) : 0].material];
    }
    container.materials.push(...materials);
    return container;
  }});
  const interiors = scene.meshes.filter(m => !m.metadata?.cadEntrySlice && cadMeshRole(m).startsWith("interior-"));
  assert.equal(interiors.length,200);
  assert.equal(interiors.reduce((sum,m)=>sum+m.getTotalIndices()/3,0),383280);
  assert.ok(interiors.every(m=>!m.isEnabled()));
  const shells = scene.meshes.filter(m=>m.getTotalVertices()>0 && ["wall","slab","stair","window-glass"].includes(cadMeshRole(m)));
  assert.ok(shells.length>20 && shells.every(m=>m.isEnabled()));
  const stats = controller.visibility[0];
  assert.equal(stats.enabledPotentialTriangles,0);
  controller.setDoorStates([{id:entry.id,open:true}]);
  // Hlavní vestibul nemá v prvních 4 m vybavení; jeho shell je trvale přítomný.
  assert.ok(stats.enabledPotentialTriangles < stats.interiorTriangles * .05,
    JSON.stringify(stats));
  const outsideTriangles = stats.enabledPotentialTriangles;
  const furnishedZone = scene.meshes.find(m=>m.metadata?.cadEntrySlice)!.metadata.cadEntryDoors[0];
  controller.setDoorStates([{id:furnishedZone,open:true}]);
  assert.ok(stats.enabledPotentialTriangles > 0 && stats.enabledPotentialTriangles < stats.interiorTriangles * .05);
  controller.setDoorStates([{id:furnishedZone,open:false}]);
  controller.updateVisibility(cadLocalToWorld(atEntry(1),building.placement));
  assert.ok(interiors.every(m=>m.isEnabled()));
  assert.equal(stats.enabledPotentialTriangles,stats.interiorTriangles);
  const internalBatch = scene.meshes.find(m=>m.metadata?.cadDoorBatch && m.metadata.cadVisibilityGroup === "")!;
  controller.updateVisibility(cadLocalToWorld(atEntry(-1),building.placement));
  assert.equal(internalBatch.isEnabled(),false);
  const internalId = internalBatch.metadata.cadDoorIds[0];
  const before = Array.from(internalBatch.getVerticesData(VertexBuffer.PositionKind)!);
  controller.setDoorStates([{id:internalId,open:true}]);
  const after = Array.from(internalBatch.getVerticesData(VertexBuffer.PositionKind)!);
  assert.notDeepEqual(after,before);
  assert.equal(stats.enabledPotentialTriangles,outsideTriangles);
  controller.updateVisibility(cadLocalToWorld(atEntry(1),building.placement));
  assert.equal(internalBatch.isEnabled(),true);
  assert.deepEqual(Array.from(internalBatch.getVerticesData(VertexBuffer.PositionKind)!),after);
  t.diagnostic(JSON.stringify({ ...stats, openMainEntryTriangles: outsideTriangles }));
  controller.dispose();
  assert.equal(scene.meshes.length,0);
});
