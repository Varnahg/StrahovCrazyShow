import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine";
import { Scene } from "@babylonjs/core/scene";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial";
import {
  decodeTreeRuntimeChunk,
  VegetationController,
  attachAuthoredTreeMesh,
} from "../client/vegetation";
import { TREES } from "../shared/world";
import manifest from "../public/models/vegetation/runtime/manifest.json";
import b6Placement from "../shared/data/cad-buildings/b06-tree-placement.json";
import { groundHeight } from "../shared/terrain";
import { treeTrunkCollision } from "../shared/vegetation";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const master = readFileSync(manifest.source);
const masterLength = master.readUInt32LE(12);
const masterJson = JSON.parse(
  master.subarray(20, 20 + masterLength).toString(),
);
const masterBin = master.subarray(28 + masterLength);
function attributeBytes(json: any, bin: Uint8Array, id: number) {
  const a = json.accessors[id],
    v = json.bufferViews[a.bufferView];
  const components = (
    { SCALAR: 1, VEC2: 2, VEC3: 3 } as Record<string, number>
  )[a.type];
  const bytes = a.count * components * (a.componentType === 5123 ? 2 : 4);
  const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return bin.subarray(start, start + bytes);
}
test("streamed independent tree details retain every exact authored position, normal, UV and index", () => {
  assert.equal(sha(master), manifest.sourceSha256);
  for (const tree of TREES)
    for (const lod of [0, 1]) {
      const entry = (manifest.trees as Record<string, any>)[tree.osmId][lod];
      const binary = readFileSync("public" + entry.url);
      assert.equal(sha(binary), entry.sha256);
      const chunk = decodeTreeRuntimeChunk(
        binary.buffer.slice(
          binary.byteOffset,
          binary.byteOffset + binary.byteLength,
        ),
      );
      assert.equal(chunk.id, tree.osmId);
      assert.equal(chunk.lod, lod);
      for (const primitive of chunk.primitives) {
        const original = masterJson.meshes.find(
          (m: any) => m.name === primitive.name,
        ).primitives[0];
        for (const [name, values] of [
          ["POSITION", primitive.positions],
          ["NORMAL", primitive.normals],
          ["TEXCOORD_0", primitive.uvs],
        ] as const)
          assert.equal(
            sha(
              new Uint8Array(
                values.buffer,
                values.byteOffset,
                values.byteLength,
              ),
            ),
            sha(
              attributeBytes(masterJson, masterBin, original.attributes[name]),
            ),
          );
        assert.equal(
          sha(
            new Uint8Array(
              primitive.indices.buffer,
              primitive.indices.byteOffset,
              primitive.indices.byteLength,
            ),
          ),
          sha(attributeBytes(masterJson, masterBin, original.indices)),
        );
      }
    }
});
test("bootstrap includes all independent far crowns with original photographic channels and no hidden high meshes", () => {
  const bytes = readFileSync("public" + manifest.bootstrap),
    length = bytes.readUInt32LE(12);
  assert.equal(sha(bytes), manifest.bootstrapSha256);
  const json = JSON.parse(bytes.subarray(20, 20 + length).toString()),
    bin = bytes.subarray(28 + length);
  assert.ok(json.meshes.every((mesh: any) => mesh.name.includes("__lod2__")));
  for (const tree of TREES)
    assert.ok(
      json.meshes.some(
        (m: any) => m.name === `tree__${tree.osmId}__lod2__bark`,
      ),
    );
  for (let i = 0; i < json.images.length; i++) {
    const a = json.bufferViews[json.images[i].bufferView],
      b = masterJson.bufferViews[masterJson.images[i].bufferView];
    assert.equal(
      sha(bin.subarray(a.byteOffset, a.byteOffset + a.byteLength)),
      sha(masterBin.subarray(b.byteOffset, b.byteOffset + b.byteLength)),
    );
  }
  assert.ok(bytes.length < master.length * 0.45);
});
test("independent transform API refreshes frozen tree geometry and world bounds", () => {
  const engine = new NullEngine(),
    scene = new Scene(engine),
    root = new TransformNode("source tree", scene),
    mesh = new Mesh("branch", scene);
  const data = new VertexData();
  data.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  data.indices = [0, 1, 2];
  data.applyToMesh(mesh);
  mesh.parent = root;
  mesh.computeWorldMatrix(true);
  mesh.freezeWorldMatrix();
  const controller = Object.create(
    VegetationController.prototype,
  ) as VegetationController;
  (controller as any).treeGroups = [
    {
      id: "source-id",
      x: 0,
      z: 0,
      root,
      lods: [[mesh], [], []],
      active: 0,
      desired: 0,
    },
  ];
  assert.equal(
    controller.setTreeTransform(
      "source-id",
      { x: 10, y: 2, z: 4 },
      Math.PI / 2,
    ),
    true,
  );
  const vertex = Vector3.TransformCoordinates(
    new Vector3(1, 0, 0),
    mesh.getWorldMatrix(),
  );
  assert.ok(Math.abs(vertex.x - 10) < 1e-6);
  assert.ok(Math.abs(vertex.y - 2) < 1e-6);
  assert.ok(Math.abs(vertex.z - 3) < 1e-6);
  assert.ok(mesh.getBoundingInfo().boundingBox.minimumWorld.x >= 9.99999);
  assert.equal(root.isWorldMatrixFrozen, false);
  assert.equal(
    controller.setTreeTransform("missing", { x: 0, y: 0, z: 0 }),
    false,
  );
  scene.dispose();
  engine.dispose();
});

test("actual B6 conifer bootstrap and streamed LOD vertices share the corrected trunk placement", async (t) => {
  const placement=TREES.find(tree=>tree.osmId===b6Placement.treeId)!;
  assert.ok(placement);
  const engine=new NullEngine(),scene=new Scene(engine);scene.useRightHandedSystem=true;
  t.after(()=>{scene.dispose();engine.dispose();});
  const position={x:placement.x,y:groundHeight(placement.x,placement.z),z:placement.z};
  const root=new TransformNode('current shared B6 placement',scene);
  root.position.set(position.x,position.y,position.z);
  const bytes=readFileSync('public'+manifest.bootstrap);
  // Real published GLB and actual Babylon node transforms, but only this
  // tree's two meshes and no image materials/GPU rendering are loaded.
  const names=['bark','leaves'].map(part=>`tree__${placement.osmId}__lod2__${part}`);
  const loaded=await ImportMeshAsync(new Uint8Array(bytes),scene,{
    pluginExtension:'.glb',meshNames:names,pluginOptions:{gltf:{skipMaterials:true}},
  });
  const far=loaded.meshes.filter((mesh):mesh is Mesh=>mesh instanceof Mesh&&mesh.getTotalVertices()>0);
  assert.equal(far.length,2);
  function assertPlacement(mesh:Mesh,expected:typeof position,yaw=0) {
    const vertices=mesh.getVerticesData(VertexBuffer.PositionKind)!;
    const minimum=[Infinity,Infinity,Infinity],maximum=[-Infinity,-Infinity,-Infinity];
    let nearestRoot=Infinity;
    for(let i=0;i<vertices.length;i+=3){
      const local=new Vector3(vertices[i],vertices[i+1],vertices[i+2]);
      const world=Vector3.TransformCoordinates(local,mesh.getWorldMatrix());
      const wanted=[expected.x+Math.cos(yaw)*local.x+Math.sin(yaw)*local.z,
        expected.y+local.y,expected.z-Math.sin(yaw)*local.x+Math.cos(yaw)*local.z];
      for(const [axis,value] of [world.x,world.y,world.z].entries()){
        assert.ok(Math.abs(value-wanted[axis])<2e-5,`${mesh.name}: vertex ${i/3}/${axis}`);
        minimum[axis]=Math.min(minimum[axis],value);maximum[axis]=Math.max(maximum[axis],value);
      }
      if(local.y<.2)nearestRoot=Math.min(nearestRoot,Math.hypot(world.x-expected.x,world.z-expected.z));
    }
    const bounds=mesh.getBoundingInfo().boundingBox;
    // Yaw-zero transformed AABBs are exact extrema of every authored vertex.
    if(yaw===0)for(const [axis,key] of ['x','y','z'].entries()){
      assert.ok(Math.abs(bounds.minimumWorld[key as 'x']-minimum[axis])<3e-5);
      assert.ok(Math.abs(bounds.maximumWorld[key as 'x']-maximum[axis])<3e-5);
    }
    if(mesh.name.endsWith('__bark'))assert.ok(nearestRoot<treeTrunkCollision(placement).radius+.05);
    assert.ok(mesh.isWorldMatrixFrozen);
  }
  for(const mesh of far){
    assert.ok(Math.abs(mesh.position.x-b6Placement.originalPosition.x)<1e-4);
    assert.ok(Math.abs(mesh.position.z-b6Placement.originalPosition.z)<1e-4);
    mesh.computeWorldMatrix(true);mesh.freezeWorldMatrix();
    attachAuthoredTreeMesh(mesh,root);assertPlacement(mesh,position);
  }
  const trunk=treeTrunkCollision(placement);
  assert.deepEqual({x:trunk.x,z:trunk.z},{x:root.position.x,z:root.position.z});
  const controller=Object.create(VegetationController.prototype) as VegetationController;
  const group={id:placement.osmId,x:placement.x,z:placement.z,root,lods:[[],[],far] as Mesh[][],active:2,desired:0};
  Object.assign(controller,{scene,disposed:false,treeRuntime:manifest,treeGroups:[group],trees:[...far],
    player:{x:placement.x,z:placement.z},loadingTrees:new Set(),failedTrees:new Set(),loadControllers:new Set(),
    sharedTreeMaterials:manifest.materialNames.map(name=>new PBRMaterial(name,scene)),detailCache:new Map(),stats:{}});
  t.mock.method(globalThis,'fetch',async (url:unknown)=>{
    assert.ok(typeof url==='string'&&url.includes(placement.osmId));
    return new Response(readFileSync('public'+url));
  });
  for(const lod of [0,1]){
    group.desired=lod;
    (controller as any).startDetailLoads();
    for(let tick=0;tick<100&&(controller as any).loadingTrees.size;tick++)await new Promise(resolve=>setTimeout(resolve,0));
    assert.equal((controller as any).loadingTrees.size,0);
    assert.equal((controller as any).failedTrees.size,0);
    assert.equal(group.lods[lod].length,2);
    for(const mesh of group.lods[lod])assertPlacement(mesh,{x:root.position.x,y:root.position.y,z:root.position.z});
    if(lod===0){
      // The next detail load must attach to the CURRENT root, not resurrect
      // the old glTF/source location after an independent editor transform.
      assert.equal(controller.setTreeTransform(placement.osmId,{...position,x:position.x+1}),true);
      for(const existing of [...far,...group.lods[0]])assertPlacement(existing,{...position,x:position.x+1});
    }
  }
  assert.equal((controller as any).loadControllers.size,0);
});
