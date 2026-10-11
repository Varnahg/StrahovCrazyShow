import { writeFileSync, mkdirSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { b6AuthoredStairPixels, B6_STAIR_MATERIALS } from "../shared/b6-stair-materials";
// Small deterministic RGBA PNG encoder, so these authored patterns remain
// reproducible without Blender or platform-specific image dependencies.
function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const value of data) {
    crc ^= value;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer) {
  const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
mkdirSync("public/models/b6", { recursive: true });
for (const kind of ["striped-corridor", "terrazzo-tread"] as const) {
  const size = 512, pixels = b6AuthoredStairPixels(kind, size);
  const scan = Buffer.alloc(size * (size * 4 + 1));
  for (let row = 0; row < size; row++) scan.set(pixels.subarray(row * size * 4, (row + 1) * size * 4), row * (size * 4 + 1) + 1);
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const path = "public" + B6_STAIR_MATERIALS[kind].texture;
  writeFileSync(path, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", header), chunk("IDAT", deflateSync(scan)), chunk("IEND", Buffer.alloc(0))]));
  console.log(path);
}
