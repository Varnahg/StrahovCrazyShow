/** Offline reconstruction of one source-identified far fender lip.
 * Only paint's three vertex channels and indices are replaced. Each retained
 * primitive and embedded image stays byte-identical, including transforms/PBR.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseGlb } from "./car-glb-reader.mjs";
import { createFarLipRecipe } from "./repair-car-far-source.mjs";
export { createFarLipRecipe } from "./repair-car-far-source.mjs";
const sha = (b) => createHash("sha256").update(b).digest("hex");
export const EXPECTED_FAR_SHA =
  "98254bb33689919998a83fd28aae77a6aa31da5826afda368f9f4c4e7f2ead58";
function encode(values, type) {
  const size = type === 5123 ? 2 : 4,
    buffer = Buffer.alloc(values.length * size);
  values.forEach((v, i) =>
    type === 5126
      ? buffer.writeFloatLE(v, i * size)
      : buffer.writeUInt16LE(v, i * size),
  );
  return buffer;
}
export function repairFarBytes(input, source) {
  if (sha(input) !== EXPECTED_FAR_SHA) throw Error("Unreviewed far input");
  if (
    source.indices.length !== 612 ||
    source.positions.length !== 184 ||
    source.normals.length !== 184 ||
    source.uv.length !== 184 ||
    [source.positions, source.normals, source.uv].some((rows, i) =>
      rows.some(
        (row) =>
          row.length !== (i === 2 ? 2 : 3) || !row.every(Number.isFinite),
      ),
    ) ||
    source.indices.some(
      (i) => !Number.isInteger(i) || i < 0 || i >= source.positions.length,
    )
  )
    throw Error("Invalid reviewed source corner payload");
  const glb = parseGlb(input),
    json = glb.json,
    node = json.nodes.find((n) => n.name === "Body:paint"),
    primitive = json.meshes[node.mesh].primitives[0];
  if (node.matrix || node.translation || node.rotation || node.scale)
    throw Error("Unreviewed paint transform");
  const position = glb.accessor(primitive.attributes.POSITION),
    normal = glb.accessor(primitive.attributes.NORMAL),
    uv = glb.accessor(primitive.attributes.TEXCOORD_0),
    indices = glb.accessor(primitive.indices).flat();
  const removed = new Set(source.removedTriangles);
  if (
    removed.size !== 129 ||
    Math.min(...removed) !== 830 ||
    Math.max(...removed) !== 958
  )
    throw Error("Unreviewed source lip range");
  const kept = indices.filter((_, i) => !removed.has(Math.floor(i / 3))),
    offset = position.length;
  const newIndices = [...kept, ...source.indices.map((i) => i + offset)];
  if (offset + source.positions.length >= 65536)
    throw Error("Reviewed UINT16 vertex limit exceeded");
  const next = {
      POSITION: [...position, ...source.positions],
      NORMAL: [...normal, ...source.normals],
      TEXCOORD_0: [...uv, ...source.uv],
    },
    replacements = new Map();
  for (const [role, values] of Object.entries(next)) {
    const a = json.accessors[primitive.attributes[role]],
      view = json.bufferViews[a.bufferView];
    if (a.componentType !== 5126 || a.byteOffset || view.byteStride)
      throw Error("Unreviewed vertex channel layout");
    replacements.set(a.bufferView, encode(values.flat(), 5126));
    a.count = values.length;
    if (a.min)
      a.min = a.min.map((_, i) => Math.min(...values.map((v) => v[i])));
    if (a.max)
      a.max = a.max.map((_, i) => Math.max(...values.map((v) => v[i])));
  }
  const ia = json.accessors[primitive.indices];
  if (
    ia.componentType !== 5123 ||
    ia.byteOffset ||
    json.bufferViews[ia.bufferView].byteStride
  )
    throw Error("Unreviewed index layout");
  replacements.set(ia.bufferView, encode(newIndices, 5123));
  ia.count = newIndices.length;
  const affectedAccessors = new Set([
    ...Object.values(primitive.attributes),
    primitive.indices,
  ]);
  for (let i = 0; i < json.accessors.length; i++)
    if (
      !affectedAccessors.has(i) &&
      replacements.has(json.accessors[i].bufferView)
    )
      throw Error("Paint shares a modified buffer view");
  const unchangedViews = [],
    chunks = [];
  let byteOffset = 0;
  for (let i = 0; i < json.bufferViews.length; i++) {
    const view = json.bufferViews[i],
      old = glb.bin.subarray(
        view.byteOffset ?? 0,
        (view.byteOffset ?? 0) + view.byteLength,
      ),
      bytes = replacements.get(i) ?? old,
      pad = -byteOffset & 3;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      byteOffset += pad;
    }
    if (!replacements.has(i))
      unchangedViews.push({ view: i, sha256: sha(old) });
    view.byteOffset = byteOffset;
    view.byteLength = bytes.length;
    chunks.push(bytes);
    byteOffset += bytes.length;
  }
  json.buffers = [{ byteLength: byteOffset }];
  let jb = Buffer.from(JSON.stringify(json));
  jb = Buffer.concat([jb, Buffer.alloc(-jb.length & 3, 32)]);
  let bin = Buffer.concat(chunks);
  bin = Buffer.concat([bin, Buffer.alloc(-bin.length & 3)]);
  const header = Buffer.alloc(20),
    bh = Buffer.alloc(8);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jb.length + bin.length, 8);
  header.writeUInt32LE(jb.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  bh.writeUInt32LE(bin.length);
  bh.writeUInt32LE(0x004e4942, 4);
  const bytes = Buffer.concat([header, jb, bh, bin]),
    output = parseGlb(bytes);
  for (const item of unchangedViews) {
    const v = output.json.bufferViews[item.view];
    if (
      sha(output.bin.subarray(v.byteOffset, v.byteOffset + v.byteLength)) !==
      item.sha256
    )
      throw Error("Unrelated buffer changed");
  }
  return {
    bytes,
    audit: {
      inputSha256: sha(input),
      outputSha256: sha(bytes),
      removedTriangles: source.removedTriangles,
      addedTriangles: source.indices.length / 3,
      triangles: 9202 - removed.size + source.indices.length / 3,
      parts: json.meshes.length,
      unchangedViews,
      sourceVertices: source.positions.length,
      retainedVertexChannelsByteIdentical: true,
      retainedTriangleIndicesUnchanged: true,
      method:
        "Replace complete identified source lip component; retain all other primitive payloads and PBR/image metadata",
    },
  };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] !== "--recipe") throw Error("Expected --recipe");
  const root = new URL("../", import.meta.url);
  const recipe = createFarLipRecipe(
    readFileSync(
      new URL("public/models/vehicles/campus-hatchback-near.glb", root),
    ),
    readFileSync(
      new URL(
        "assets/blender/vehicles/innerscene-hatchback/original-source.glb",
        root,
      ),
    ),
  );
  process.stdout.write(JSON.stringify(recipe));
}
