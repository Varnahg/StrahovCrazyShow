import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { TREES } from "../shared/world";
import { groundHeight } from "../shared/terrain";
import {
  TREE_RECONSTRUCTIONS,
  treeTrunkCollision,
  treeDetailLevel,
} from "../shared/vegetation";
import pack from "../public/models/vegetation/realistic/manifest.json";
import textures from "../public/models/vegetation/realistic/texture-manifest.json";
import b6Placement from "../shared/data/cad-buildings/b06-tree-placement.json";
import { TreeWindPlugin } from "../client/vegetation";
const sha = (bytes: Uint8Array) =>
  createHash("sha256").update(bytes).digest("hex");
const glbBytes = readFileSync("public" + pack.geometry);
const jsonLength = glbBytes.readUInt32LE(12);
const gltf = JSON.parse(glbBytes.subarray(20, 20 + jsonLength).toString());
const bin = glbBytes.subarray(28 + jsonLength);
function attributeBytes(primitive: any, attribute: string) {
  const a = gltf.accessors[primitive.attributes[attribute]],
    view = gltf.bufferViews[a.bufferView];
  return bin.subarray(
    (view.byteOffset ?? 0) + (a.byteOffset ?? 0),
    (view.byteOffset ?? 0) +
      (a.byteOffset ?? 0) +
      a.count * (attribute === "POSITION" ? 12 : 8),
  );
}

test("each source tree owns clean unique branch geometry, retained detail levels and an editable Blender master", () => {
  assert.equal(glbBytes.readUInt32LE(0), 0x46546c67);
  assert.equal(sha(glbBytes), pack.geometrySha256);
  assert.equal(sha(readFileSync(pack.editable)), pack.editableSha256);
  assert.ok(statSync(pack.editable).size > 1_000_000);
  assert.equal(pack.sourceTrianglesCopied, 0);
  const hashes = new Set<string>();
  for (const tree of TREES) {
    const form = TREE_RECONSTRUCTIONS.find((t) => t.id === tree.osmId)!;
    assert.ok(form);
    assert.equal(tree.reconstruction, form);
    assert.equal(
      form.botanicalSpecies,
      null,
      "do not invent botanical identification from aerial shape",
    );
    for (const lod of [0, 1, 2]) {
      const mesh = gltf.meshes.find(
        (m: any) => m.name === `tree__${tree.osmId}__lod${lod}__bark`,
      );
      assert.ok(mesh, "missing retained skeleton " + tree.osmId + "/" + lod);
      if (lod === 0)
        hashes.add(sha(attributeBytes(mesh.primitives[0], "POSITION")));
      const leafMesh = gltf.meshes.find(
        (m: any) => m.name === `tree__${tree.osmId}__lod${lod}__leaves`,
      );
      assert.equal(!!leafMesh, form.appearance !== "bare");
    }
  }
  assert.equal(
    hashes.size,
    TREES.length,
    "scaled copies cannot masquerade as unique source trees",
  );
});

test("all photographic material channels preserve official CC0 bytes and alpha silhouettes", () => {
  assert.equal(textures.license, "CC0-1.0");
  for (const asset of textures.assets) {
    assert.match(asset.source, /ambientcg\.com/);
    for (const channel of Object.values(asset.channels)) {
      const source = readFileSync("public" + channel.url);
      assert.equal(sha(source), channel.sha256);
    }
  }
  const leaf = textures.assets.find((t) => t.id === "LeafSet001")!;
  assert.ok(leaf.channels.opacity);
  const material = gltf.materials.find((m: any) => /green leaves/.test(m.name));
  assert.ok(material.pbrMetallicRoughness.baseColorTexture);
  assert.ok(material.normalTexture);
  assert.equal(material.doubleSided, true);
  assert.equal(
    material.alphaMode,
    "BLEND",
    "runtime explicitly changes the exported Blender dither material to alpha-test",
  );
});

test("reference interpretation stays auditable, roots use native terrain and collision radius matches authored trunk", () => {
  for (const tree of TREES) {
    const shape = tree.reconstruction!;
    if(tree.osmId===b6Placement.treeId){
      assert.deepEqual({x:shape.x,z:shape.z},b6Placement.originalPosition,'the authored source pack is preserved');
      assert.deepEqual({x:tree.x,z:tree.z},{x:-10.5,z:-76.5},'only the identified B6 tree uses the independently documented crown correction');
    }else{
      assert.equal(shape.x, tree.x);
      assert.equal(shape.z, tree.z);
    }
    assert.equal(shape.reference.crownCaptureDate, "2024-06-08");
    assert.equal(shape.radialOutline.length, 16);
    assert.ok(shape.radialOutline.every((n) => n >= 0.35 && n <= 1.08));
    assert.ok(Number.isFinite(groundHeight(tree.x, tree.z)));
    const collider = treeTrunkCollision(tree);
    assert.equal(collider.radius, shape.trunkRadius);
    assert.equal(collider.x, tree.x);
    assert.equal(collider.z, tree.z);
    assert.ok(collider.height > 0 && collider.height <= shape.height);
  }
  assert.equal(
    TREES.find((t) => t.osmId === "ipr-b6-north-bare")!.reconstruction!
      .appearance,
    "bare",
  );
  assert.equal(
    TREES.find((t) => t.osmId === "ipr-b6-south-conifer")!.reconstruction!
      .appearance,
    "conifer",
  );
});

test("detail reductions retain every tree, and wind deformation is a PBR shader extension rather than remeshing", () => {
  for (const quality of ["low", "medium", "high"]) {
    assert.equal(treeDetailLevel(0, quality), 0);
    assert.equal(treeDetailLevel(50, quality), 1);
    assert.equal(treeDetailLevel(500, quality), 2);
  }
  const code = TreeWindPlugin.prototype.getCustomCode.call(
    {} as TreeWindPlugin,
    "vertex",
  )!;
  assert.match(code.CUSTOM_VERTEX_UPDATE_POSITION, /positionUpdated\.xz/);
  assert.match(code.CUSTOM_VERTEX_UPDATE_POSITION, /cleanTreeWind\.yz/);
  assert.match(code.CUSTOM_VERTEX_UPDATE_POSITION, /smoothstep\(1\.5/);
});
