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
import {
  decodeTreeRuntimeChunk,
  VegetationController,
} from "../client/vegetation";
import { TREES } from "../shared/world";
import manifest from "../public/models/vegetation/runtime/manifest.json";
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
