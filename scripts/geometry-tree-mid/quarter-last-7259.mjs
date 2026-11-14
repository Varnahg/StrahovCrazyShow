import assert from "node:assert/strict";
import { readFileSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readGlb, sha256 } from "../geometry-b6-south/reduce.mjs";
import { encodeParts } from "../trees-20261026-r6-far/publish.mjs";
import { decodeTreePrototype, treePrototypeFoliageRanks } from "../../client/tree-asset-decode.ts";
import { decodeTreeClusterGeometry } from "../../client/tree-cluster-geometry.ts";
import { parseTreeClusterBank } from "../../shared/tree-cluster-types.ts";
import { sourceCardOrder } from "../geometry-tree-far/triangle-cards.mjs";
import { quarterDir } from "./quarter.mjs";

export const referenceCardsMode = "reference-cards";
export const lastTreeId = "catalog-4314257259";
export const lastTreeEvidence = "_bmad-output/implementation-artifacts/tree-quarter-7259-20261114/";
const outputDir = join(quarterDir, "rollout", lastTreeId + "-" + referenceCardsMode);
const json = path => JSON.parse(readFileSync(path, "utf8"));
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const buffer = bytes => Uint8Array.from(bytes).buffer;
const count = parts => parts.reduce((sum, part) => sum + part.indices.length / 3, 0);
const allChannels = ["color", "opacity", "normalGL", "roughness"];
const atlasSize = 2048;

function pin(asset, path = "public" + asset.url) {
  const bytes = readFileSync(path);
  assert.equal(bytes.length, asset.bytes, path);
  assert.equal(sha256(bytes), asset.sha256, path);
  return bytes;
}

function describe(url, bytes) {
  return { url, bytes: bytes.length, sha256: sha256(bytes) };
}

function packRole(bytes, role) {
  const { doc, accessor } = readGlb(bytes);
  const node = doc.nodes.find(node => node.extras.role === role);
  const primitive = doc.meshes[node.mesh].primitives[0];
  const read = i => ({ definition: doc.accessors[i], bytes: accessor(i).bytes });
  return { name: node.name, extras: node.extras, attributes: Object.fromEntries(
    Object.entries(primitive.attributes).map(([name, i]) => [name, read(i)])), indices: read(primitive.indices) };
}

function quadAt(part, offset) {
  const indices = Array.from(part.indices.subarray(offset, offset + 6));
  const vertices = [...new Set(indices)];
  assert.equal(vertices.length, 4);
  const uv = (i, axis) => part.uvs[2 * i + axis];
  const extents = [0, 1].map(axis => {
    const values = [...new Set(vertices.map(i => uv(i, axis)))].sort((a, b) => a - b);
    assert.equal(values.length, 2);
    return values;
  });
  const [[u, U], [v, V]] = extents;
  const ordered = [[u, v], [U, v], [u, V], [U, V]].map(([x, y]) =>
    vertices.find(i => uv(i, 0) === x && uv(i, 1) === y));
  assert.ok(ordered.every(Number.isInteger));
  const winding = indices.slice(0, 3).map(i => ordered.indexOf(i)).map(i => [i % 2, i >> 1]);
  const [[a, b], [c, d], [e, f]] = winding;
  const flip = (c - a) * (f - b) - (e - a) * (d - b) < 0;
  const positions = ordered.map(i => Array.from(part.positions.subarray(i * 3, i * 3 + 3)));
  const normals = ordered.map(i => Array.from(part.normals.subarray(i * 3, i * 3 + 3)));
  const rank = Math.round(part.colors[ordered[0] * 4 + 3] * 65535);
  assert.ok(ordered.every(i => Math.round(part.colors[i * 4 + 3] * 65535) === rank));
  return { rect: [u, v, U, V], positions, normals, rank, flip, indices: indices.map(i => ordered.indexOf(i)) };
}

function appendCard(out, card, rect, triangle) {
  const { positions, normals, rank } = card;
  const [x, y, w, h] = rect;
  const first = out.positions.length / 3;
  const corners = triangle ? [[0, 0], [2, 0], [0, 2]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (const [index, [u, v]] of corners.entries()) {
    // The authored cards are almost planar (at most 0.451 mm of closure
    // error). The affine fit shares that error between the four corners.
    out.positions.push(...(triangle ? positions[0].map((a, k) => {
      const b = positions[1][k], c = positions[2][k], d = positions[3][k];
      return a + (b + c - a - d) / 4 + u * (b + d - a - c) / 2 + v * (c + d - a - b) / 2;
    }) : positions[index]));
    const normal = triangle ? normals[0].map((a, k) => a + u * (normals[1][k] - a) + v * (normals[2][k] - a)) : normals[index];
    const length = Math.hypot(...normal);
    out.normals.push(...normal.map(value => value / length));
    out.uvs.push((x + u * w) / atlasSize, (y + v * h) / atlasSize);
    out.colors.push(65535, 65535, 65535, rank);
  }
  const indices = triangle ? (card.flip ? [0, 2, 1] : [0, 1, 2]) : card.indices;
  out.indices.push(...indices.map(i => first + i));
}

function packLeaves(output, identity) {
  const count = output.positions.length / 3;
  const attribute = (data, type, Kind = Float32Array) => ({
    definition: { count, type, componentType: Kind === Float32Array ? 5126 : 5123,
      ...(Kind === Uint16Array ? { normalized: true } : {}) },
    bytes: Buffer.from(Kind.from(data).buffer),
  });
  assert.ok(count <= 65536);
  const position = attribute(output.positions, "VEC3");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const [i, value] of new Float32Array(position.bytes.buffer).entries()) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], value);
    max[axis] = Math.max(max[axis], value);
  }
  Object.assign(position.definition, { min, max });
  return { name: identity.name, extras: identity.extras, attributes: {
    POSITION: position, NORMAL: attribute(output.normals, "VEC3"),
    TEXCOORD_0: attribute(output.uvs, "VEC2"), COLOR_0: attribute(output.colors, "VEC4", Uint16Array),
  }, indices: { definition: { type: "SCALAR", componentType: 5123, count: output.indices.length },
    bytes: Buffer.from(Uint16Array.from(output.indices).buffer) } };
}

export function buildLastTree(mode) {
  assert.ok(["--plan", "--write", "--verify"].includes(mode));
  assert.match(realpathSync(quarterDir), /^D:[\\/]/i);
  const id = lastTreeId;
  const base = json("shared/data/assets/geometry-release-20261111.json").trees;
  const source = JSON.parse(pin(base));
  const prototype = source.prototypes[id];
  const original = prototype.lods.map(file => pin(file));
  const midDir = ".cache/geometry-release-20261111/tree-mid-all/candidate";
  const midReceipt = json(join(midDir, "receipt.json"));
  assert.deepEqual(midReceipt.source, base);
  const mid = JSON.parse(pin(midReceipt.catalog, join(midDir, "catalog.json"))).prototypes[id];
  const midModel = pin(mid.lods[1], join(midDir, id + "-lod1.glb"));
  const midPlacement = pin(mid.midCluster.placements, join(midDir, id + "-mid.bin"));
  const exact = decodeTreePrototype(buffer(midModel), id, mid, 1);
  const bankFile = source.banks[mid.midCluster.bankId ?? prototype.farCluster.bankId];
  const bank = parseTreeClusterBank(JSON.parse(pin(bankFile)));
  assert.equal(bank.alphaCutoff, .2);
  assert.equal(bank.normalMapStrength, 1);
  const cluster = decodeTreeClusterGeometry(buffer(midPlacement), bank, {
    groupCount: mid.midCluster.groupCount, exactRanks: [],
  });
  const baseline = [...exact, { ...cluster, role: "foliage" }];
  const far = decodeTreePrototype(buffer(original[2]), id, prototype, 2);
  const farCluster = prototype.farCluster;
  assert.deepEqual(treePrototypeFoliageRanks(baseline), treePrototypeFoliageRanks([...far, {
    ...decodeTreeClusterGeometry(buffer(pin(farCluster.placements)), bank, {
      groupCount: farCluster.groupCount, exactRanks: treePrototypeFoliageRanks(far),
    }), role: "foliage",
  }]));

  const previousDir = join(quarterDir, "rollout", id + "-branches-fit");
  const previous = json(join(previousDir, "candidate.json"));
  const previousModels = previous.rows.map(row => pin(row.descriptor, join(previousDir, id + "-lod" + row.lod + ".glb")));
  const textureDir = join(quarterDir, "d");
  const { tiles, size } = json(join(textureDir, "atlas-plan.json"));
  assert.equal(size, atlasSize);
  assert.deepEqual(allChannels, Object.keys(previous.textures));
  for (const channel of allChannels) pin(previous.textures[channel], join(textureDir, channel + ".png"));
  const atlasRects = new Map(tiles.map(tile => [tile.rect.join(","), tile.pixels]));
  const freeCells = [];
  for (let y = 0; y < atlasSize; y += 64) for (let x = 0; x < atlasSize; x += 64)
    if (!tiles.some(({ pixels: [u, v] }) => (x >> 9) === (u >> 9) && (y >> 9) === (v >> 9))) freeCells.push([x + 16, y + 16]);
  const shared = sourceCardOrder(midPlacement, bank);
  const defs = bank.prototypes.flatMap(prototype => prototype.cards);
  const cells = new Map([...new Set(shared)].sort((a, b) => a - b).map((index, order) => {
    const uv = defs[index].uvs;
    const [destX, destY] = freeCells[order];
    return [index, { x: Math.floor((uv[0] + uv[4]) * 16) * 32,
      y: Math.floor((uv[1] + uv[5]) * 16) * 32, destX, destY }];
  }));
  assert.equal(shared.length * 6, cluster.indices.length);
  const authored = exact.find(part => part.role === "foliage");
  const wood = packRole(previousModels[1], "wood");
  const before = count(baseline), budget = Math.floor(before / 4);
  assert.equal(before, previous.rows[1].before);
  assert.equal(budget, previous.rows[1].budget);
  const leafBudget = budget - wood.indices.definition.count / 3;
  assert.ok(authored.indices.length / 6 + shared.length * 2 <= leafBudget);
  const out = { positions: [], normals: [], uvs: [], colors: [], indices: [] };
  for (let i = 0; i < authored.indices.length; i += 6) {
    const card = quadAt(authored, i);
    const rect = atlasRects.get(card.rect.join(","));
    assert.ok(rect, "Missing authored leaf rectangle");
    appendCard(out, card, rect, true);
  }
  for (const [i, index] of shared.entries()) {
    const card = quadAt(cluster, i * 6);
    const { x, y, destX, destY } = cells.get(index);
    const [u, v, U, V] = card.rect.map(value => value * 1024);
    assert.ok(u >= x && v >= y && U <= x + 32 && V <= y + 32, "Shared UV leaves its original cell");
    appendCard(out, card, [destX + u - x, destY + v - y, U - u, V - v], false);
  }

  const bytes = encodeParts([wood, packLeaves(out, packRole(original[1], "foliage"))]);
  assert.deepEqual(packRole(bytes, "wood"), wood);
  const models = [previousModels[0], bytes];
  const rows = models.map((model, lod) => {
    assert.deepEqual(readGlb(model).doc.nodes, readGlb(original[lod]).doc.nodes);
    const decoded = decodeTreePrototype(buffer(model), id, prototype, lod);
    assert.deepEqual(treePrototypeFoliageRanks(decoded), treePrototypeFoliageRanks(baseline));
    const row = previous.rows[lod], after = count(decoded);
    assert.ok(after <= row.budget);
    return { ...row, after, leaf: after - row.wood, descriptor: {
      ...describe("/models/vegetation/tree-quarter-" + id + "-qa/" + id + "-lod" + lod + ".glb", model),
      meshNames: row.descriptor.meshNames,
    } };
  });
  assert.deepEqual(rows[0], previous.rows[0]);
  const plan = { size: atlasSize, base: previous.textures, shared: bank.textures,
    tiles: [...cells.values()], opacityCutoff: bank.alphaCutoff, originalNormalLevel: .45 };
  const summary = { id, reference: { model: mid.lods[1], placements: mid.midCluster.placements, bank: bankFile },
    cards: { authored: authored.indices.length / 6, shared: shared.length, tiles: cells.size },
    rows: rows.map(({ lod, before, budget, after, wood, leaf, descriptor }) =>
      ({ lod, before, budget, after, wood, leaf, sha256: descriptor.sha256 })) };
  console.log(JSON.stringify(summary));
  if (mode === "--plan") return;
  if (mode === "--write") mkdirSync(outputDir);
  const emit = (file, payload) => {
    const path = join(outputDir, file);
    if (mode === "--write") writeFileSync(path, payload, { flag: "wx" });
    else assert.ok(readFileSync(path).equals(payload), path);
  };
  emit("candidate-geometry.json", encode({ id, family: prototype.family, source: base, textures: previous.textures, ...summary, rows }));
  emit("atlas-plan.json", encode(plan));
  for (const [lod, model] of models.entries()) emit(id + "-lod" + lod + ".glb", model);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assert.equal(process.argv.length, 3);
  buildLastTree(process.argv[2]);
}
