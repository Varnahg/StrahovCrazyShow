import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const align4 = n => (n + 3) - (n + 3) % 4;
const sizes = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const componentBytes = { 5123: 2, 5125: 4, 5126: 4 };
const integer = (value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw Error("Invalid GLB range");
  return value;
};

/** Narrow geometry-only exporter. It never runs Blender or interprets geometry. */
export function readSeasonalGlb(input) {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 28 || bytes.length > 128 * 1024 * 1024 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error("Invalid seasonal GLB header");
  const jsonLength = bytes.readUInt32LE(12), binHeader = 20 + jsonLength;
  if (jsonLength % 4 || binHeader + 8 > bytes.length || bytes.readUInt32LE(16) !== 0x4e4f534a || bytes.readUInt32LE(binHeader + 4) !== 0x004e4942 || bytes.readUInt32LE(binHeader) !== bytes.length - binHeader - 8) throw Error("Invalid seasonal GLB chunks");
  const json = JSON.parse(bytes.subarray(20, binHeader).toString("utf8")), bin = bytes.subarray(binHeader + 8);
  if (json.asset?.version !== "2.0" || json.buffers?.length !== 1 || json.buffers[0].uri !== undefined || json.buffers[0].byteLength > bin.length || bin.length - json.buffers[0].byteLength > 3 ||
    !Array.isArray(json.nodes) || !Array.isArray(json.meshes) || !Array.isArray(json.accessors) || !Array.isArray(json.bufferViews) ||
    json.scenes?.length !== 1 || (json.scene ?? 0) !== 0 || json.scenes[0].nodes?.length !== json.nodes.length || new Set(json.scenes[0].nodes).size !== json.nodes.length || json.scenes[0].nodes.some(n => !json.nodes[n]) ||
    ["images", "textures", "materials", "animations", "skins", "cameras", "extensionsUsed", "extensionsRequired"].some(key => json[key]?.length)) throw Error("Expected flat geometry-only seasonal GLB");
  return { json, bin };
}

export function seasonalAccessorBytes(glb, index) {
  const accessor = glb.json.accessors[integer(index, 0, glb.json.accessors.length - 1)];
  const view = glb.json.bufferViews[integer(accessor.bufferView, 0, glb.json.bufferViews.length - 1)];
  if (view.buffer !== 0 || view.byteStride !== undefined || view.extensions || accessor.sparse || accessor.extensions || !sizes[accessor.type] || !componentBytes[accessor.componentType]) throw Error("Unsupported seasonal accessor");
  const offset = integer(view.byteOffset ?? 0, 0, glb.bin.length), viewLength = integer(view.byteLength, 1, glb.bin.length);
  const localOffset = integer(accessor.byteOffset ?? 0, 0, viewLength), length = integer(accessor.count, 1, glb.bin.length) * sizes[accessor.type] * componentBytes[accessor.componentType];
  if (offset + viewLength > glb.json.buffers[0].byteLength || localOffset + length > viewLength || (offset + localOffset) % componentBytes[accessor.componentType]) throw Error("Seasonal accessor outside buffer view");
  return glb.bin.subarray(offset + localOffset, offset + localOffset + length);
}

export function encodeSeasonalGlb(json, bin) {
  const text = Buffer.from(JSON.stringify(json)), jsonLength = align4(text.length), binLength = align4(bin.length);
  const out = Buffer.alloc(28 + jsonLength + binLength);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonLength, 12); out.writeUInt32LE(0x4e4f534a, 16); out.fill(32, 20, 20 + jsonLength); text.copy(out, 20);
  out.writeUInt32LE(binLength, 20 + jsonLength); out.writeUInt32LE(0x004e4942, 24 + jsonLength); bin.copy(out, 28 + jsonLength);
  return out;
}

/** Copy each referenced accessor once, even if the source has a shared view.
 * This avoids retaining unrelated LOD bytes inside an otherwise needed view.
 * Only structural indices/offsets change; all value bytes and semantic metadata
 * (including normalized, bounds, extras, node/mesh extras) remain identical. */
export function splitSeasonalGlb(input, prototypeId, prototype, lod) {
  integer(lod, 0, 2);
  const original = readSeasonalGlb(input), expected = new Set(prototype.lods[lod].meshNames);
  const nodes = original.json.nodes.filter(node => expected.has(node.name));
  if (nodes.length !== expected.size || new Set(nodes.map(node => node.name)).size !== nodes.length) throw Error("Missing/duplicate seasonal LOD nodes");
  const accessors = [], bufferViews = [], meshes = [], remap = new Map(), chunks = []; let offset = 0;
  const copyAccessor = oldIndex => {
    if (remap.has(oldIndex)) return remap.get(oldIndex);
    const source = original.json.accessors[oldIndex], raw = seasonalAccessorBytes(original, oldIndex), view = original.json.bufferViews[source.bufferView];
    const padding = Buffer.alloc(align4(raw.length) - raw.length);
    const newIndex = accessors.length; remap.set(oldIndex, newIndex);
    bufferViews.push({ ...structuredClone(view), buffer: 0, byteOffset: offset, byteLength: raw.length });
    accessors.push({ ...structuredClone(source), bufferView: bufferViews.length - 1, byteOffset: 0 });
    chunks.push(raw, padding); offset += raw.length + padding.length;
    return newIndex;
  };
  const outputNodes = nodes.map(node => {
    const extras = node.extras;
    if (extras?.lod !== lod || extras.archetypeId !== prototypeId || extras.sourceTreeId !== prototype.sourceTreeId || node.children?.length || node.skin !== undefined || node.camera !== undefined || node.extensions) throw Error("Seasonal LOD node identity/hierarchy mismatch");
    const mesh = structuredClone(original.json.meshes[integer(node.mesh, 0, original.json.meshes.length - 1)]);
    if (mesh.primitives?.length !== 1) throw Error("Expected one seasonal primitive per role");
    for (const primitive of mesh.primitives) {
      if ((primitive.mode ?? 4) !== 4 || primitive.material !== undefined || primitive.extensions || primitive.targets || !primitive.attributes) throw Error("Unsupported seasonal primitive");
      primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes).map(([key, value]) => [key, copyAccessor(value)]));
      primitive.indices = copyAccessor(primitive.indices);
    }
    const newNode = { ...structuredClone(node), mesh: meshes.length }; meshes.push(mesh); return newNode;
  });
  const bin = Buffer.concat(chunks);
  const json = { ...structuredClone(original.json),
    scene: 0, scenes: [{ ...structuredClone(original.json.scenes[0]), nodes: outputNodes.map((_, index) => index) }],
    nodes: outputNodes, meshes, accessors, bufferViews, buffers: [{ ...structuredClone(original.json.buffers[0]), byteLength: bin.length }] };
  const bytes = encodeSeasonalGlb(json, bin);
  verifySeasonalSplit(input, bytes, prototype.lods[lod].meshNames);
  return bytes;
}

const accessorMetadata = accessor => { const { bufferView, byteOffset, ...semantic } = accessor; return semantic; };
const viewMetadata = view => { const { buffer, byteOffset, byteLength, ...semantic } = view; return semantic; };
const equalJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function verifySeasonalSplit(input, output, names) {
  const original = readSeasonalGlb(input), split = readSeasonalGlb(output), expected = new Set(names), referenced = new Set();
  if (split.json.nodes.length !== expected.size || split.json.meshes.length !== expected.size || split.json.nodes.some(node => !expected.has(node.name))) throw Error("Unexpected split LOD population");
  let comparisons = 0;
  for (const node of split.json.nodes) {
    const sourceNode = original.json.nodes.find(value => value.name === node.name);
    if (!sourceNode || !equalJson({ ...sourceNode, mesh: node.mesh }, node)) throw Error("Split node metadata changed");
    const sourceMesh = original.json.meshes[sourceNode.mesh], mesh = split.json.meshes[node.mesh];
    if (!equalJson({ ...sourceMesh, primitives: mesh.primitives }, mesh)) throw Error("Split mesh metadata changed");
    for (let p = 0; p < mesh.primitives.length; p++) {
      const source = sourceMesh.primitives[p], primitive = mesh.primitives[p];
      if (!equalJson({ ...source, attributes: primitive.attributes, indices: primitive.indices }, primitive) || !equalJson(Object.keys(source.attributes), Object.keys(primitive.attributes))) throw Error("Split primitive metadata changed");
      for (const semantic of [...Object.keys(primitive.attributes), "indices"]) {
        const oldIndex = semantic === "indices" ? source.indices : source.attributes[semantic];
        const index = semantic === "indices" ? primitive.indices : primitive.attributes[semantic]; referenced.add(index);
        const oldAccessor = original.json.accessors[oldIndex], accessor = split.json.accessors[index];
        if (!equalJson(accessorMetadata(oldAccessor), accessorMetadata(accessor)) ||
          !equalJson(viewMetadata(original.json.bufferViews[oldAccessor.bufferView]), viewMetadata(split.json.bufferViews[accessor.bufferView])) ||
          !seasonalAccessorBytes(original, oldIndex).equals(seasonalAccessorBytes(split, index))) throw Error("Split accessor bytes/metadata changed");
        comparisons++;
      }
    }
  }
  const views = new Set([...referenced].map(index => split.json.accessors[index].bufferView));
  if (referenced.size !== split.json.accessors.length || views.size !== split.json.bufferViews.length) throw Error("Unreferenced split accessor/view");
  let end = 0;
  for (const view of split.json.bufferViews) {
    if (view.byteOffset !== end) throw Error("Unreferenced split BIN padding");
    end += align4(view.byteLength);
  }
  if (end !== split.bin.length) throw Error("Unreferenced split BIN bytes");
  return { accessorComparisons: comparisons, binBytes: split.bin.length };
}

export async function exportSeasonalTrees({ root = process.cwd(), input = "public/models/vegetation/seasonal/runtime-contract.json", output = "public/models/vegetation/seasonal-streamed" } = {}) {
  const inputPath = path.resolve(root, input), outputPath = path.resolve(root, output), publicPath = path.resolve(root, "public");
  if (!outputPath.startsWith(publicPath + path.sep) || outputPath === path.dirname(inputPath)) throw Error("Output must be a separate public directory");
  const sourceBytes = await readFile(inputPath), original = JSON.parse(sourceBytes.toString("utf8"));
  if (original.version !== 2 || original.units !== "metres" || original.rankEncoding !== "uint16-normalized") throw Error("Exporter requires immutable seasonal v2 input");
  const contract = structuredClone(original); contract.version = 3;
  contract.usage = "per-LOD geometry streaming; pilot candidates only; explicit runtime selection required";
  const evidence = { version: 1, input: path.relative(root, inputPath).replaceAll("\\", "/"), inputSha256: hash(sourceBytes), files: [] };
  await mkdir(outputPath, { recursive: true });
  for (const [id, prototype] of Object.entries(original.prototypes)) {
    if (!/^[A-Za-z0-9_-]+$/.test(id) || prototype.lods?.length !== 3 || prototype.lods.some(file => file.url !== prototype.lods[0].url || file.bytes !== prototype.lods[0].bytes || file.sha256 !== prototype.lods[0].sha256)) throw Error("Invalid immutable seasonal prototype");
    const source = prototype.lods[0];
    if (!/^\/models\/vegetation\/[A-Za-z0-9_./-]+\.glb$/.test(source.url) || source.url.split("/").some(part => part === ".." || part === ".")) throw Error("Invalid seasonal input URL");
    const bytes = await readFile(path.join(publicPath, source.url.slice(1)));
    if (bytes.length !== source.bytes || hash(bytes) !== source.sha256) throw Error("Seasonal source integrity mismatch");
    for (const lod of [0, 1, 2]) {
      const split = splitSeasonalGlb(bytes, id, prototype, lod), resultPath = path.join(outputPath, `${id}-lod${lod}.glb`);
      const descriptor = { url: "/" + path.relative(publicPath, resultPath).replaceAll("\\", "/"), bytes: split.length, sha256: hash(split), meshNames: [...prototype.lods[lod].meshNames] };
      await writeFile(resultPath, split);
      contract.prototypes[id].lods[lod] = descriptor;
      evidence.files.push({ prototypeId: id, lod, source, ...descriptor, ...verifySeasonalSplit(bytes, await readFile(resultPath), descriptor.meshNames) });
    }
  }
  // Check the source contract again before publishing the manifest last.
  if (hash(await readFile(inputPath)) !== evidence.inputSha256) throw Error("Seasonal source contract changed during export");
  const contractBytes = Buffer.from(JSON.stringify(contract, null, 2) + "\n");
  await writeFile(path.join(outputPath, "runtime-contract.json"), contractBytes);
  evidence.outputContractSha256 = hash(contractBytes);
  await writeFile(path.join(outputPath, "export-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length > 2) throw Error("Use the fixed R4 input and seasonal-streamed destination; no CLI path overrides");
  const evidence = await exportSeasonalTrees();
  console.log(JSON.stringify({ inputSha256: evidence.inputSha256, outputContractSha256: evidence.outputContractSha256, files: evidence.files.length,
    accessorComparisons: evidence.files.reduce((sum, file) => sum + file.accessorComparisons, 0), bytes: evidence.files.reduce((sum, file) => sum + file.bytes, 0) }, null, 2));
}
