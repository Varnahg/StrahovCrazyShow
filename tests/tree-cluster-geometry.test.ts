import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTreeClusterBank, TREE_CLUSTER_EXACT } from "../shared/tree-cluster-types";
import { decodeTreeClusterGeometry } from "../client/tree-cluster-geometry";
import { createTreeSeasonGeometryPlan, treeSeasonIndexCount } from "../client/tree-season-geometry";

const square = () => ({ positions: [-.1, -.05, 0, .1, -.05, 0, .1, .05, 0, -.1, .05, 0], normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], uvs: [.1, .1, .2, .1, .2, .2, .1, .2] });
function sourceBank() {
  const descriptor = (name: string) => ({ url: `/textures/trees/cluster/${name}.png`, bytes: 100, sha256: "a".repeat(64) });
  return { version: 1, coordinateSpace: "gltf-y-up", units: "metres", prototypes: [{ id: 0, cards: [square()] }, { id: 1, cards: [square(), square()] }],
    textures: { color: descriptor("color"), opacity: descriptor("opacity"), normalGL: descriptor("normal"), roughness: descriptor("roughness") } };
}
type RecordInput = { rank: number; prototype?: number; anchor?: number[]; quaternion?: number[] };
function records(rows: RecordInput[]) {
  const buffer = new ArrayBuffer(rows.length * 32), view = new DataView(buffer);
  rows.forEach((row, i) => {
    view.setUint16(i * 32, row.rank, true); view.setUint16(i * 32 + 2, row.prototype ?? 0, true);
    [...(row.anchor ?? [0, 0, 0]), ...(row.quaternion ?? [0, 0, 0, 1])].forEach((n, j) => view.setFloat32(i * 32 + 4 + j * 4, n, true));
  });
  return buffer;
}
const close = (a: number, b: number, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} != ${b}`);

test("compact groups retain metre scale, rigid winding/normals, rank and independent fallback coverage", () => {
  const source = sourceBank(), bank = parseTreeClusterBank(source), payload = records([
    { rank: 10, anchor: [2, 3, 4], quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] },
    { rank: 30000, prototype: 1 }, { rank: 65000, prototype: TREE_CLUSTER_EXACT },
  ]);
  const original = payload.slice(0), output = decodeTreeClusterGeometry(payload, bank, { groupCount: 3, exactRanks: [65000] });
  assert.equal(output.cardGroups, 2); assert.equal(output.exactGroups, 1);
  assert.equal(output.positions.length, 36); assert.equal(output.indices.length, 18);
  [2, 2.95, 4.1].forEach((n, i) => close(output.positions[i], n));
  [1, 0, 0].forEach((n, i) => close(output.normals[i], n));
  close(Math.hypot(...[0, 1, 2].map(k => output.positions[3 + k] - output.positions[k])), .2);
  close(Math.hypot(...[0, 1, 2].map(k => output.positions[9 + k] - output.positions[k])), .1);
  const edgeA = [0, 1, 2].map(k => output.positions[3 + k] - output.positions[k]), edgeB = [0, 1, 2].map(k => output.positions[6 + k] - output.positions[k]);
  assert.ok(edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1] > 0); // Rotated CCW normal is +X.
  assert.deepEqual(payload, original); assert.deepEqual(bank.prototypes[0].cards[0].uvs, source.prototypes[0].cards[0].uvs);
  const plan = createTreeSeasonGeometryPlan(output.indices, output.colors);
  assert.deepEqual([...plan.ranks], [10, 30000]);
  assert.equal(treeSeasonIndexCount(plan, 0), 0); assert.equal(treeSeasonIndexCount(plan, .1), 6); assert.equal(treeSeasonIndexCount(plan, 1), 18);
  assert.equal(output.sourceBytes, 96); assert.equal(output.geometryBytes, 612);
});

test("bank parser copies and freezes cards; rejects invalid identity, channels and geometric data", () => {
  const source = sourceBank(), parsed = parseTreeClusterBank(source);
  source.prototypes[0].cards[0].positions[0] = 0;
  assert.equal(parsed.prototypes[0].cards[0].positions[0], -.1); assert.ok(Object.isFrozen(parsed.prototypes[0].cards[0].positions));
  const mutations: ((bank: ReturnType<typeof sourceBank>) => void)[] = [
    b => { b.version = 2; }, b => { b.coordinateSpace = "blender-z-up"; }, b => { b.prototypes[1].id = 0; },
    b => { b.prototypes[0].cards = []; }, b => { b.prototypes[0].cards.push(square(), square()); },
    b => { b.prototypes[0].cards[0].positions[0] = NaN; }, b => { delete b.prototypes[0].cards[0].positions[0]; },
    b => { b.prototypes[0].cards[0].positions[6] += .1; }, b => { b.prototypes[0].cards[0].normals[2] = -1; },
    b => { b.prototypes[0].cards[0].uvs.fill(0); }, b => { b.prototypes[0].cards[0].uvs[0] = 2; },
    b => { b.textures.normalGL.url = "/textures/trees/../secret.png"; }, b => { b.textures.color.sha256 = "bad"; },
    b => { b.textures.opacity.bytes = Infinity; },
  ];
  for (const mutate of mutations) { const bank = sourceBank(); mutate(bank); assert.throws(() => parseTreeClusterBank(bank)); }
});

test("derived atlas calibration is explicit and bounded independently of original leaf maps", () => {
  assert.equal(parseTreeClusterBank(sourceBank()).alphaCutoff, .5);
  const bank = parseTreeClusterBank({ ...sourceBank(), alphaCutoff: .2, normalMapStrength: 1 });
  assert.equal(bank.alphaCutoff, .2); assert.equal(bank.normalMapStrength, 1);
  for (const value of [NaN, Infinity, -.1, 0, 1, "0.2"])
    assert.throws(() => parseTreeClusterBank({ ...sourceBank(), alphaCutoff: value }));
  for (const value of [NaN, -1, 3]) assert.throws(() => parseTreeClusterBank({ ...sourceBank(), normalMapStrength: value }));
});

test("no missing or duplicate seasonal group is accepted as successful compact geometry", () => {
  const bank = parseTreeClusterBank(sourceBank());
  for (const rows of [[{ rank: 0 }], [{ rank: 65535 }], [{ rank: 20 }, { rank: 10 }], [{ rank: 10 }, { rank: 10 }],
    [{ rank: 10, prototype: 3 }], [{ rank: 10, anchor: [Infinity, 0, 0] }], [{ rank: 10, quaternion: [0, 0, 0, 0] }],
    [{ rank: 10, quaternion: [0, 0, 0, 1.001] }], [{ rank: 10, prototype: TREE_CLUSTER_EXACT }]])
    assert.throws(() => decodeTreeClusterGeometry(records(rows), bank, { groupCount: rows.length, exactRanks: [] }));
  assert.throws(() => decodeTreeClusterGeometry(records([{ rank: 10 }]), bank, { groupCount: 1, exactRanks: [10] }));
  assert.throws(() => decodeTreeClusterGeometry(records([{ rank: 10 }]), bank, { groupCount: 1, exactRanks: [11] }));
  assert.throws(() => decodeTreeClusterGeometry(records([{ rank: 10 }]), bank, { groupCount: 2, exactRanks: [] }));
  assert.throws(() => decodeTreeClusterGeometry(new ArrayBuffer(0), bank, { groupCount: 65535, exactRanks: [] }));
  const empty = decodeTreeClusterGeometry(records([{ rank: 10, prototype: TREE_CLUSTER_EXACT }]), bank, { groupCount: 1, exactRanks: [10] });
  assert.equal(empty.indices.length, 0); assert.equal(empty.geometryBytes, 0); assert.equal(empty.exactGroups, 1);
});

test("index width switches only when the actual expanded vertices exceed uint16 capacity", () => {
  const bank = parseTreeClusterBank(sourceBank());
  for (const count of [16384, 16385]) {
    const output = decodeTreeClusterGeometry(records(Array.from({ length: count }, (_, i) => ({ rank: i + 1 }))), bank, { groupCount: count, exactRanks: [] });
    assert.equal(output.indices instanceof Uint16Array, count === 16384);
    assert.equal(output.indices.at(-2), count * 4 - 2); assert.equal(output.indices.at(-1), count * 4 - 1);
  }
});
