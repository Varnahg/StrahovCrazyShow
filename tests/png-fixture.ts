import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";

/** Read the pinned original RGBA8 test fixtures without rewriting image data.
 * This verifies source texels/UVs; it is not a GPU upload or rendered-pixel test. */
export function pngFixture(data: Buffer) {
  assert.equal(data.toString("hex", 0, 8), "89504e470d0a1a0a");
  assert.equal(data[24], 8);
  assert.equal(data[25], 6);
  assert.equal(data[28], 0);
  const width = data.readUInt32BE(16),
    height = data.readUInt32BE(20),
    stride = width * 4,
    chunks: Buffer[] = [];
  for (let position = 8; position < data.length;) {
    const length = data.readUInt32BE(position);
    if (data.toString("ascii", position + 4, position + 8) === "IDAT")
      chunks.push(data.subarray(position + 8, position + 8 + length));
    position += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks)),
    pixels = new Uint8Array(stride * height);
  assert.equal(raw.length, height * (stride + 1));
  const paeth = (a: number, b: number, c: number) => {
    const p = a + b - c,
      pa = Math.abs(p - a),
      pb = Math.abs(p - b),
      pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0,
        b = y ? pixels[(y - 1) * stride + x] : 0,
        c = y && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const correction =
        filter === 0
          ? 0
          : filter === 1
            ? a
            : filter === 2
              ? b
              : filter === 3
                ? Math.floor((a + b) / 2)
                : paeth(a, b, c);
      pixels[y * stride + x] =
        (raw[y * (stride + 1) + x + 1] + correction) & 255;
    }
  }
  const clampX = (x: number) => Math.max(0, Math.min(width - 1, x));
  const clampY = (y: number) => Math.max(0, Math.min(height - 1, y));
  return {
    width,
    height,
    nearest(u: number, v: number, invertY = true) {
      const x = clampX(Math.floor(u * width)),
        y = clampY(Math.floor((invertY ? 1 - v : v) * height)),
        index = (y * width + x) * 4;
      return Array.from(pixels.slice(index, index + 4));
    },
    bilinearChannel(u: number, v: number, channel: number, invertY = true) {
      const px = clampX(u * width - 0.5),
        py = clampY((invertY ? 1 - v : v) * height - 0.5),
        x = Math.floor(px),
        y = Math.floor(py),
        fx = px - x,
        fy = py - y;
      const at = (a: number, b: number) =>
        pixels[(clampY(b) * width + clampX(a)) * 4 + channel] / 255;
      return (
        at(x, y) * (1 - fx) * (1 - fy) +
        at(x + 1, y) * fx * (1 - fy) +
        at(x, y + 1) * (1 - fx) * fy +
        at(x + 1, y + 1) * fx * fy
      );
    },
  };
}
