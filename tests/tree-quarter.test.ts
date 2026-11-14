import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { decodeTreePrototype, treePrototypeFoliageRanks } from "../client/tree-asset-decode";
import { parseTreePilotManifest, type TreeAssetFile } from "../shared/tree-asset-types";
import { parseTreeClusterBank } from "../shared/tree-cluster-types";
import rollout from "../shared/data/assets/tree-quarter-rollout-20261113.json";
// @ts-expect-error The offline asset CLI is an untyped ES module.
import { retainCards } from "../scripts/geometry-tree-mid/quarter.mjs";
// @ts-expect-error The offline acceptance CLI is an untyped ES module.
import { silhouetteGroup, silhouettePass } from "../scripts/geometry-tree-mid/quarter-acceptance.mjs";

test("group tolerance requires both the peak and the mean in each season", () => {
  const check = (missing: number, added = 0) => ({ area: 1000, missing, added });
  const group = (first: ReturnType<typeof check>, rest: ReturnType<typeof check>) =>
    silhouetteGroup([first, rest, rest, rest, rest, rest]);
  assert.ok(group(check(200, 20), check(144)).pass);
  assert.equal(group(check(201, 20), check(144)).pass, false);
  assert.equal(group(check(200, 19), check(144)).pass, false);
  assert.ok(group(check(210, 200), check(210, 200)).pass);
});

test("silhouette accepts the original limit or an inclusive five-point difference", () => {
  const pass = (missing: number, added: number) => silhouettePass({ area: 1000, missing, added });
  assert.ok(pass(150, 0));
  assert.ok(pass(201, 251));
  assert.ok(pass(251, 201));
  assert.equal(pass(201, 252), false);
  assert.equal(pass(252, 201), false);
  assert.equal(pass(176, 21), false);
});

function fixture() {
  // Two cards in the first seasonal rank and one in the second.
  const position = new Float32Array(36);
  const color = new Uint16Array(48).fill(65535);
  for (let card = 0; card < 3; card++) {
    const x = card * 3;
    position.set([x, 0, 0, x + 1, 0, 0, x + 1, 1, 0, x, 1, 0], card * 12);
    for (let v = 0; v < 4; v++) color[(card * 4 + v) * 4 + 3] = card < 2 ? 120 : 950;
  }
  const data = Uint16Array.from([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
  return {
    attributes: {
      POSITION: { definition: { count: 12, min: [0, 0, 0], max: [7, 1, 0] }, data: position, bytes: Buffer.from(position.buffer) },
      COLOR_0: { definition: { count: 12 }, data: color, bytes: Buffer.from(color.buffer) },
    },
    indices: { data },
  };
}

test("the quarter budget keeps whole cards and never deletes a seasonal rank", () => {
  const leaf = fixture();
  const output = retainCards(leaf, 4, 1.5, true);
  assert.equal(output.indices.definition.count, 12);
  const data = output.attributes.COLOR_0.bytes as Buffer;
  const ranks = Array.from({ length: 8 }, (_, i) => data.readUInt16LE(i * 8 + 6));
  assert.deepEqual(ranks, [120, 120, 120, 120, 950, 950, 950, 950]);
  assert.equal(leaf.indices.data.length, 18);
  assert.throws(() => retainCards(leaf, 3), /seasonal ranks/);
});

test("the released 4314257259 uses verified quarter exports and preserves seasonal coverage", () => {
  const pinned = (file: TreeAssetFile) => {
    const bytes = readFileSync(new URL("../public" + file.url, import.meta.url));
    assert.equal(bytes.length, file.bytes, file.url);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), file.sha256, file.url);
    return bytes;
  };
  const id = "catalog-4314257259";
  const catalog = parseTreePilotManifest(JSON.parse(pinned(rollout).toString("utf8")));
  const { banks } = catalog;
  assert.ok(banks);
  assert.equal(Object.keys(catalog.prototypes).length, 110);
  assert.ok(Object.values(catalog.prototypes).every(({ lods }) =>
    lods.slice(0, 2).every(file => file.url.includes("/quarter-20261113/"))));
  const tree = catalog.prototypes[id];
  assert.deepEqual(catalog.placements.find(p => p.sourceTreeId === "4314257259")?.sourceRootXZ, [-37.42, 243.72]);
  assert.equal(tree.lods[2].sha256, "716aff068f9c959e7559fc1daefe47a25d47ceec4afff6b33de36899f67f5b2b");
  assert.equal(tree.midCluster, undefined);
  const ranks = ([0, 1] as const).map(lod => {
    const file = tree.lods[lod];
    assert.equal(file.leafBankId, lod === 0 ? "quarter-leaf-050" : "quarter-leaf-4314257259");
    const bank = parseTreeClusterBank(JSON.parse(pinned(banks[file.leafBankId!]).toString("utf8")));
    assert.equal(bank.alphaCutoff, .5);
    for (const texture of Object.values(bank.textures)) pinned(texture);
    const parts = decodeTreePrototype(Uint8Array.from(pinned(file)).buffer, id, tree, lod);
    assert.deepEqual(parts.map(part => part.name), file.meshNames);
    assert.ok(parts.reduce((sum, part) => sum + part.indices.length / 3, 0) <= [39143, 22357][lod]);
    return treePrototypeFoliageRanks(parts);
  });
  assert.equal(ranks[0].length, 3214);
  assert.deepEqual(ranks[0], ranks[1]);
});
