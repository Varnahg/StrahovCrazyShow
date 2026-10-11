/** Read GLB geometry without an engine or a GPU. Sparse/compressed data requires
 * an explicit implementation and must never be silently interpreted here. */
export function parseGlb(bytes) {
  if (
    bytes.toString("ascii", 0, 4) !== "glTF" ||
    bytes.readUInt32LE(4) !== 2 ||
    bytes.readUInt32LE(8) !== bytes.length
  )
    throw Error("Invalid GLB header");
  let json, bin;
  for (let o = 12; o < bytes.length;) {
    const l = bytes.readUInt32LE(o),
      k = bytes.readUInt32LE(o + 4);
    if (o + 8 + l > bytes.length) throw Error("Truncated chunk");
    if (k === 0x4e4f534a) json = JSON.parse(bytes.subarray(o + 8, o + 8 + l));
    if (k === 0x004e4942) bin = bytes.subarray(o + 8, o + 8 + l);
    o += 8 + l;
  }
  const view = new DataView(bin.buffer, bin.byteOffset, bin.byteLength),
    widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 },
    types = {
      5126: [4, "getFloat32"],
      5125: [4, "getUint32"],
      5123: [2, "getUint16"],
      5121: [1, "getUint8"],
    };
  return {
    json,
    bin,
    accessor(id) {
      const a = json.accessors[id];
      if (a.sparse) throw Error("Sparse accessor requires explicit support");
      const b = json.bufferViews[a.bufferView],
        [size, get] = types[a.componentType],
        width = widths[a.type],
        start = (b.byteOffset ?? 0) + (a.byteOffset ?? 0),
        stride = b.byteStride ?? size * width;
      if (start + (a.count - 1) * stride + size * width > bin.length)
        throw Error("Accessor out of bounds");
      return Array.from({ length: a.count }, (_, i) =>
        Array.from({ length: width }, (_, c) =>
          view[get](start + i * stride + c * size, true),
        ),
      );
    },
  };
}
