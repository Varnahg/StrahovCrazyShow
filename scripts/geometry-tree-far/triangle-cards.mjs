import assert from "node:assert/strict";

const oldTile = 32, newTile = 64, atlasSize = 2048;
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const directions = Array.from({ length: 24 }, (_, i) => {
  const angle = i * 2 * Math.PI / 24;
  return [Math.cos(angle), Math.sin(angle)];
});

function enclose(points, box) {
  const offsets = directions.map(([x, y]) => Math.max(...points.map(p => x * p[0] + y * p[1])) + .9);
  const intersect = (a, b) => {
    const [x, y] = directions[a], [u, v] = directions[b], divisor = x * v - y * u;
    return [(offsets[a] * v - y * offsets[b]) / divisor, (x * offsets[b] - offsets[a] * u) / divisor];
  };
  let bestArea = Infinity, best;
  for (let a = 0; a < 24; a++) for (let b = a + 1; b < Math.min(24, a + 12); b++)
    for (let c = b + 1; c < Math.min(24, b + 12); c++) {
      if (a + 24 - c >= 12) continue;
      const triangle = [intersect(a, b), intersect(b, c), intersect(c, a)];
      const area = Math.abs(cross(...triangle)) / 2;
      if (area >= bestArea) continue;
      const bounds = [0, 1].map(axis => [
        Math.floor(Math.min(0, ...triangle.map(p => p[axis]), box[axis][0])),
        Math.ceil(Math.max(32, ...triangle.map(p => p[axis]), box[axis][1])),
      ]);
      if (bounds.some(([low, high]) => high - low > 60)) continue;
      bestArea = area;
      best = { triangle, bounds };
    }
  assert.ok(best, "Nenalezený obal alfa masky");
  return best;
}

/** Remaps the existing 32px tiles to isolated 64px cells with empty opacity
 * outside the source tile. The triangle lies in the original card plane. */
export function prepareTriangleAtlas(bank, atlas) {
  assert.equal(atlas.width, 1024);
  assert.equal(atlas.height, 1024);
  const opacity = { width: atlasSize, height: atlasSize, data: new Uint8Array(atlasSize ** 2) };
  const tiles = [], cards = [], sourceCells = new Set();
  let i = 0;
  const prototypes = bank.prototypes.map(p => ({ id: p.id, cards: p.cards.map(card => {
    const uv = card.uvs;
    const x = Math.floor((uv[0] + uv[4]) * 512 / oldTile) * oldTile;
    const y = Math.floor((uv[1] + uv[5]) * 512 / oldTile) * oldTile;
    const cell = x + y * 1024;
    assert.ok(!sourceCells.has(cell), "Původní dlaždice se překrývají");
    sourceCells.add(cell);
    const u = uv[0] * 1024 - x, v = uv[1] * 1024 - y;
    const du = (uv[2] - uv[0]) * 1024, dv = (uv[7] - uv[1]) * 1024;
    assert.ok(Math.abs(du) > 1 && Math.abs(dv) > 1 && uv[2] === uv[4] && uv[1] === uv[3] && uv[0] === uv[6] && uv[5] === uv[7]);
    const bounds = [[Math.min(u, u + du), Math.max(u, u + du)], [Math.min(v, v + dv), Math.max(v, v + dv)]];
    const support = [];
    for (let row = 0; row < oldTile; row++) for (let col = 0; col < oldTile; col++) {
      if (col + .5 < bounds[0][0] - 1 || col + .5 > bounds[0][1] + 1 ||
          row + .5 < bounds[1][0] - 1 || row + .5 > bounds[1][1] + 1) continue;
      if (atlas.data[(y + row) * 1024 + x + col] >= bank.alphaCutoff * 255 * .65)
        support.push([col + .5, row + .5]);
    }
    assert.ok(support.length, "Prázdná maska karty");
    const { triangle, bounds: enclosing } = enclose(support, bounds);
    if (Math.sign(cross(...triangle)) !== Math.sign(du * dv)) [triangle[1], triangle[2]] = [triangle[2], triangle[1]];
    const offset = enclosing.map(([a, b]) => Math.floor((newTile - (b - a)) / 2) - a);
    const destX = (i % 32) * newTile + offset[0], destY = Math.floor(i / 32) * newTile + offset[1];
    const local = triangle.map(([a, b]) => [(a - u) / du, (b - v) / dv]);
    const triangleUV = triangle.flatMap(([a, b]) => [(a + destX) / atlasSize, (b + destY) / atlasSize]);
    const areaRatio = Math.abs(cross(...local)) / 2;
    const positions = local.flatMap(([s, t]) => [0, 1, 2].map(axis =>
      card.positions[axis] + s * (card.positions[3 + axis] - card.positions[axis])
      + t * (card.positions[9 + axis] - card.positions[axis])));
    const normals = [...card.normals.slice(0, 3), ...card.normals.slice(0, 3), ...card.normals.slice(0, 3)];
    for (let row = 0; row < oldTile; row++) {
      const start = (y + row) * 1024 + x;
      opacity.data.set(atlas.data.subarray(start, start + oldTile), (destY + row) * atlasSize + destX);
    }
    cards.push({ local, uv: triangleUV, areaRatio });
    tiles.push({ x, y, destX, destY });
    i++;
    return { positions, normals, uvs: triangleUV };
  }) }));
  assert.ok(tiles.length <= 1024);
  return { prototypes, cards, opacity, tiles };
}

export function sourceCardOrder(placements, bank) {
  const starts = [];
  let offset = 0;
  for (const p of bank.prototypes) {
    starts.push(offset);
    offset += p.cards.length;
  }
  const order = [];
  for (let i = 0; i < placements.length; i += 32) {
    const id = placements.readUInt16LE(i + 2);
    if (id !== 65535)
      for (let card = 0; card < bank.prototypes[id].cards.length; card++) order.push(starts[id] + card);
  }
  return order;
}

/** Offline reconstruction works from the actual emitted recipe and atlas UVs.
 * Runtime reconstructs the same positions directly from the triangle bank. */
export function triangulatedProof(quads, recipe, order, triangles) {
  const count = recipe.length / 12;
  const positions = new Float32Array(count * 9), uvs = new Float32Array(count * 6);
  const colors = new Float32Array(count * 12), indices = new Uint32Array(count * 3);
  let areaBefore = 0, areaAfter = 0;
  function area(points, base, opposite) {
    const a = [0, 1, 2].map(k => points[base + 3 + k] - points[base + k]);
    const b = [0, 1, 2].map(k => points[base + opposite + k] - points[base + k]);
    return Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]);
  }
  for (let i = 0; i < count; i++) {
    const source = recipe.readUInt32LE(i * 12);
    const triangle = triangles.cards[order[source]];
    const base = source * 12;
    const scale = 1 + recipe[i * 12 + 4] / 128;
    for (let vertex = 0; vertex < 3; vertex++) {
      const [s, t] = triangle.local[vertex];
      for (let axis = 0; axis < 3; axis++) {
        const a = quads.positions[base + axis], b = quads.positions[base + 3 + axis], d = quads.positions[base + 9 + axis];
        positions[i * 9 + vertex * 3 + axis] = a + scale * (s * (b - a) + t * (d - a))
          + (1 - scale) * (quads.positions[base + 6 + axis] - a) / 2
          + recipe.readInt16LE(i * 12 + 6 + axis * 2) / 1000;
      }
      colors.set(quads.colors.subarray(source * 16, source * 16 + 4), i * 12 + vertex * 4);
      indices[i * 3 + vertex] = i * 3 + vertex;
    }
    uvs.set(triangle.uv, i * 6);
    areaAfter += area(positions, i * 9, 6) / 2;
  }
  for (let i = 0; i < order.length; i++) areaBefore += area(quads.positions, i * 12, 9);
  return { role: "foliage", atlas: true, positions, uvs, colors, indices, areaBefore, areaAfter };
}
