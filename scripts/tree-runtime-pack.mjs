import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const input = "public/models/vegetation/realistic/strahov-individual-trees.glb";
const dir = "public/models/vegetation/runtime";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bytes = await fs.readFile(input);
const jsonLength = bytes.readUInt32LE(12);
const source = JSON.parse(bytes.subarray(20, 20 + jsonLength));
const bin = bytes.subarray(28 + jsonLength);
await fs.mkdir(dir, { recursive: true });
const manifest = {
  version: 1,
  source: input,
  sourceSha256: sha(bytes),
  sourceBytes: bytes.length,
  bootstrap: "/models/vegetation/runtime/far.glb",
  trees: {},
  textureBytes: 0,
  materialNames: source.materials.map((m) => m.name),
};
const selectedNodes = source.nodes.filter((n) => /__lod2__/.test(n.name));
const output = structuredClone(source);
output.nodes = [];
output.meshes = [];
output.accessors = [];
output.bufferViews = [];
const chunks = [];
let offset = 0;
const viewMap = new Map(),
  accessorMap = new Map();
function view(id) {
  if (viewMap.has(id)) return viewMap.get(id);
  const original = source.bufferViews[id];
  const copy = structuredClone(original);
  const padding = (4 - (offset % 4)) % 4;
  if (padding) {
    chunks.push(Buffer.alloc(padding));
    offset += padding;
  }
  const payload = bin.subarray(
    original.byteOffset ?? 0,
    (original.byteOffset ?? 0) + original.byteLength,
  );
  copy.byteOffset = offset;
  copy.buffer = 0;
  chunks.push(payload);
  offset += payload.length;
  const result = output.bufferViews.length;
  output.bufferViews.push(copy);
  viewMap.set(id, result);
  return result;
}
function accessor(id) {
  if (accessorMap.has(id)) return accessorMap.get(id);
  const copy = structuredClone(source.accessors[id]);
  copy.bufferView = view(copy.bufferView);
  const result = output.accessors.length;
  output.accessors.push(copy);
  accessorMap.set(id, result);
  return result;
}
for (const node of selectedNodes) {
  const mesh = structuredClone(source.meshes[node.mesh]);
  for (const primitive of mesh.primitives) {
    for (const key of Object.keys(primitive.attributes))
      primitive.attributes[key] = accessor(primitive.attributes[key]);
    primitive.indices = accessor(primitive.indices);
  }
  output.nodes.push({ ...node, mesh: output.meshes.length });
  output.meshes.push(mesh);
}
for (const image of output.images) {
  manifest.textureBytes += source.bufferViews[image.bufferView].byteLength;
  image.bufferView = view(image.bufferView);
}
output.scenes = [
  { name: "All independent far trees", nodes: output.nodes.map((_, i) => i) },
];
output.scene = 0;
let packed = Buffer.concat(chunks);
if (packed.length % 4)
  packed = Buffer.concat([packed, Buffer.alloc(4 - (packed.length % 4))]);
output.buffers = [{ byteLength: packed.length }];
let json = Buffer.from(JSON.stringify(output));
if (json.length % 4)
  json = Buffer.concat([json, Buffer.alloc(4 - (json.length % 4), 32)]);
const header = Buffer.alloc(20);
header.writeUInt32LE(0x46546c67);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(28 + json.length + packed.length, 8);
header.writeUInt32LE(json.length, 12);
header.writeUInt32LE(0x4e4f534a, 16);
const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(packed.length);
binHeader.writeUInt32LE(0x004e4942, 4);
const bootstrap = Buffer.concat([header, json, binHeader, packed]);
await fs.writeFile(dir + "/far.glb", bootstrap);
manifest.bootstrapBytes = bootstrap.length;
manifest.bootstrapSha256 = sha(bootstrap);
manifest.bootstrapMeshes = output.meshes.length;
for (const node of source.nodes) {
  const match = /^tree__(.+)__lod([01])__(bark|leaves)$/.exec(node.name);
  if (!match) continue;
  const [_, id, lod] = match;
  manifest.trees[id] ??= {};
  manifest.trees[id][lod] ??= { primitives: [] };
  const primitive = source.meshes[node.mesh].primitives[0];
  const entry = {
    name: node.name,
    material: primitive.material,
    attributes: {},
    indices: null,
  };
  for (const [key, accessorId] of [
    ...Object.entries(primitive.attributes),
    ["indices", primitive.indices],
  ]) {
    const a = source.accessors[accessorId],
      v = source.bufferViews[a.bufferView];
    if (v.byteStride || a.sparse)
      throw new Error("Unexpected interleaved or sparse tree accessor");
    const typeSize = { 5126: 4, 5125: 4, 5123: 2 }[a.componentType];
    const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const start = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const data = bin.subarray(start, start + a.count * typeSize * components);
    const info = {
      componentType: a.componentType,
      count: a.count,
      components,
      sha256: sha(data),
      bytes: data,
    };
    if (key === "indices") entry.indices = info;
    else entry.attributes[key] = info;
  }
  manifest.trees[id][lod].primitives.push(entry);
}
for (const [id, levels] of Object.entries(manifest.trees))
  for (const [lod, entry] of Object.entries(levels)) {
    const payloads = [];
    let cursor = 0;
    for (const primitive of entry.primitives)
      for (const a of [
        ...Object.values(primitive.attributes),
        primitive.indices,
      ]) {
        const pad = (4 - (cursor % 4)) % 4;
        if (pad) {
          payloads.push(Buffer.alloc(pad));
          cursor += pad;
        }
        a.byteOffset = cursor;
        a.byteLength = a.bytes.length;
        payloads.push(a.bytes);
        cursor += a.bytes.length;
        delete a.bytes;
      }
    let metadata = Buffer.from(
      JSON.stringify({
        version: 1,
        id,
        lod: Number(lod),
        primitives: entry.primitives,
      }),
    );
    if (metadata.length % 4)
      metadata = Buffer.concat([
        metadata,
        Buffer.alloc(4 - (metadata.length % 4), 32),
      ]);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(metadata.length);
    const binary = Buffer.concat([size, metadata, ...payloads]);
    const filename = `${id}-lod${lod}.tree`;
    await fs.writeFile(dir + "/" + filename, binary);
    levels[lod] = {
      url: "/models/vegetation/runtime/" + filename,
      bytes: binary.length,
      sha256: sha(binary),
      meshes: entry.primitives.length,
      triangles: entry.primitives.reduce((n, p) => n + p.indices.count / 3, 0),
    };
  }
await fs.writeFile(
  dir + "/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    sourceBytes: bytes.length,
    bootstrapBytes: bootstrap.length,
    bootstrapMeshes: output.meshes.length,
    textureBytes: manifest.textureBytes,
    independentTrees: Object.keys(manifest.trees).length,
    detailChunks: Object.values(manifest.trees).reduce(
      (n, x) => n + Object.keys(x).length,
      0,
    ),
  }),
);
