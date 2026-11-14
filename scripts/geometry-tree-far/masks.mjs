import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

/** The two pinned opacity sources use non-interlaced 8-bit grayscale or RGB PNG. */
export function opacityPng(bytes) {
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const channels = { 0: 1, 2: 3 }[bytes[25]];
  assert.ok(width && height && width <= 4096 && height <= 4096 && channels);
  assert.equal(bytes[24], 8);
  assert.equal(bytes[28], 0);
  const chunks = [];
  for (let off = 8; off < bytes.length;) {
    const length = bytes.readUInt32BE(off);
    assert.ok(off + length + 12 <= bytes.length);
    if (bytes.toString("ascii", off + 4, off + 8) === "IDAT")
      chunks.push(bytes.subarray(off + 8, off + 8 + length));
    off += length + 12;
  }
  const packed = inflateSync(Buffer.concat(chunks)), stride = width * channels;
  assert.equal(packed.length, (stride + 1) * height);
  const raw = new Uint8Array(stride * height), data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = y * stride, src = y * (stride + 1), filter = packed[src];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const i = row + x, a = x >= channels ? raw[i - channels] : 0;
      const b = y ? raw[i - stride] : 0, c = y && x >= channels ? raw[i - stride - channels] : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const prediction = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1
        : pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      raw[i] = packed[src + 1 + x] + prediction;
    }
    for (let x = 0; x < width; x++) {
      const i = row + x * channels;
      data[y * width + x] = channels === 1 ? raw[i] : Math.round((raw[i] + raw[i + 1] + raw[i + 2]) / 3);
    }
  }
  return { width, height, data };
}

const f = 798 / (2 * Math.tan(.85 / 2));
export function cameraViews(positions, samples) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    min[axis] = Math.min(min[axis], positions[i]);
    max[axis] = Math.max(max[axis], positions[i]);
  }
  const center = min.map((value, i) => (value + max[i]) / 2);
  const radius = Math.hypot(...max.map((value, i) => value - center[i]));
  return samples.map(([yaw, pitch, distance]) => {
    assert.ok(distance > radius);
    const size = Math.ceil((radius + 1) * f / (distance - radius) * 2);
    const s = Math.sin(yaw), c = Math.cos(yaw), p = Math.sin(pitch), q = Math.cos(pitch);
    return { yaw, pitch, distance, size, center, s, c, p, q };
  });
}
function project(positions, view) {
  const out = new Float32Array(positions.length);
  const { center, distance, size, s, c, p, q } = view;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] - center[0], y = positions[i + 1] - center[1], z = positions[i + 2] - center[2];
    const horizontal = s * x + c * z;
    const invZ = 1 / (distance - q * horizontal - p * y);
    out[i] = size / 2 + (c * x - s * z) * f * invZ;
    out[i + 1] = size / 2 - (q * y - p * horizontal) * f * invZ;
    out[i + 2] = invZ;
  }
  return out;
}

/** Tight square for the same projection, with an explicit border. */
export function cropTreeView(view, positions, padding = 12) {
  const points = project(positions, { ...view, size: 0 });
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (let i = 0; i < points.length; i += 3) {
    assert.ok(points[i + 2] > 0);
    left = Math.min(left, points[i]); right = Math.max(right, points[i]);
    top = Math.min(top, points[i + 1]); bottom = Math.max(bottom, points[i + 1]);
  }
  // Retain the optical center and pixel phase of the original square.
  let size = 2 * Math.ceil(Math.max(-left, right, -top, bottom) + padding);
  if (size % 2 !== view.size % 2) size++;
  return { ...view, size };
}

/** Pixel lists for one primitive per leaf card, in fixed order. */
export function triangleMasks(positions, uv, views, map, cutoff) {
  assert.equal(positions.length % 9, 0);
  const count = positions.length / 9;
  const output = Array.from({ length: count }, () => []);
  for (const view of views) {
    const projected = project(positions, view);
    for (let card = 0; card < count; card++) {
      const pixels = [], i = card * 3;
      triangle(projected, uv, i, i + 1, i + 2, view, map, cutoff, pixel => pixels.push(pixel));
      output[card].push(Int32Array.from(pixels));
    }
  }
  return output;
}

/** Perspective-correct UVs and bilinear opacity at the atlas base level. */
function triangle(projected, uv, a, b, c, view, map, cutoff, emit) {
  const x = projected[a * 3], y = projected[a * 3 + 1];
  const bx = projected[b * 3] - x, by = projected[b * 3 + 1] - y;
  const cx = projected[c * 3] - x, cy = projected[c * 3 + 1] - y;
  const determinant = bx * cy - by * cx;
  if (Math.abs(determinant) < 1e-9) return;
  const size = view.size;
  const xMin = Math.max(0, Math.ceil(x + Math.min(0, bx, cx) - .5));
  const xMax = Math.min(size - 1, Math.floor(x + Math.max(0, bx, cx) - .5));
  const yMin = Math.max(0, Math.ceil(y + Math.min(0, by, cy) - .5));
  const yMax = Math.min(size - 1, Math.floor(y + Math.max(0, by, cy) - .5));
  const ia = projected[a * 3 + 2], ib = projected[b * 3 + 2], ic = projected[c * 3 + 2];
  for (let py = yMin; py <= yMax; py++) for (let px = xMin; px <= xMax; px++) {
    const dx = px + .5 - x, dy = py + .5 - y;
    const v = (dx * cy - dy * cx) / determinant, w = (bx * dy - by * dx) / determinant;
    const u = 1 - v - w;
    if (u < -1e-7 || v < -1e-7 || w < -1e-7) continue;
    if (map) {
      const iz = u * ia + v * ib + w * ic;
      const tu = (u * ia * uv[2 * a] + v * ib * uv[2 * b] + w * ic * uv[2 * c]) / iz;
      const tv = (u * ia * uv[2 * a + 1] + v * ib * uv[2 * b + 1] + w * ic * uv[2 * c + 1]) / iz;
      const tx = Math.min(map.width - 1, Math.max(0, tu * map.width - .5));
      const ty = Math.min(map.height - 1, Math.max(0, tv * map.height - .5));
      const ix = Math.floor(tx), iy = Math.floor(ty), fx = tx - ix, fy = ty - iy;
      const jx = Math.min(ix + 1, map.width - 1), jy = Math.min(iy + 1, map.height - 1);
      const alpha = (1 - fy) * ((1 - fx) * map.data[iy * map.width + ix] + fx * map.data[iy * map.width + jx])
        + fy * ((1 - fx) * map.data[jy * map.width + ix] + fx * map.data[jy * map.width + jx]);
      if (alpha < cutoff * 255) continue;
    }
    emit(py * size + px);
  }
}

export function cardMasks(positions, uv, views, map, cutoff) {
  const count = positions.length / 12, masks = Array.from({ length: count }, () => []);
  for (const view of views) {
    const points = project(positions, view);
    const marker = new Int32Array(view.size ** 2).fill(-1);
    for (let i = 0; i < count; i++) {
      const a = i * 4, pixels = [];
      const emit = pixel => {
        if (marker[pixel] === i) return;
        marker[pixel] = i;
        pixels.push(pixel);
      };
      triangle(points, uv, a, a + 1, a + 2, view, map, cutoff, emit);
      triangle(points, uv, a, a + 2, a + 3, view, map, cutoff, emit);
      masks[i].push(Int32Array.from(pixels));
    }
  }
  return masks;
}

export function treeMasks(parts, view, atlas, leaf, cutoff, threshold) {
  const mask = new Uint8Array(view.size ** 2);
  for (const part of parts) {
    const p = project(part.positions, view);
    const map = part.role === "wood" ? null : part.atlas ? atlas : leaf;
    const cut = part.atlas ? cutoff : .5;
    for (let i = 0; i < part.indices.length; i += 3) {
      const a = part.indices[i];
      if (part.colors && Math.round(part.colors[a * 4 + 3] * 65535) > threshold) continue;
      triangle(p, part.uvs, a, part.indices[i + 1], part.indices[i + 2], view, map, cut, pixel => { mask[pixel] = 1; });
    }
  }
  return mask;
}

export function maskError(before, after) {
  let area = 0, missing = 0, added = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i]) {
      area++;
      if (!after[i]) missing++;
    } else if (after[i]) added++;
  }
  assert.ok(area);
  return { area, missing, added, missingRatio: missing / area, addedRatio: added / area };
}
