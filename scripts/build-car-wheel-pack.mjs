/** Retain archived J body/PBR/images except the source-restored far fender lip. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseGlb as parse } from "./car-glb-reader.mjs";
import { createFarLipRecipe, repairFarBytes } from "./repair-car-far.mjs";
const root = new URL(
    "../assets/blender/vehicles/innerscene-hatchback/",
    import.meta.url,
  ),
  sha = (b) => createHash("sha256").update(b).digest("hex"),
  reports = [];
const nearMasterSha256 = sha(
  await readFile(
    new URL(
      "../public/models/vehicles/campus-hatchback-near.glb",
      import.meta.url,
    ),
  ),
);
const baselineShas = {
  medium: "09abe7339544c6fa8e6bfa8a612c8a793e9542ba3bb14cf4d95c35e59db305c8",
  far: "b8426d57160e691484e3f87f0ce96b5b515fdc3305732cdd07d3c5c0bf16223a",
};
for (const level of ["medium", "far"]) {
  const original = await readFile(
      new URL("lod-baseline-j/" + level + ".glb", root),
    ),
    replacement = await readFile(
      new URL("campus-hatchback-" + level + "-wheels.glb", root),
    ),
    base = parse(original),
    wheels = parse(replacement),
    json = base.json;
  if (sha(original) !== baselineShas[level])
    throw Error("Archived J body baseline changed");
  const materialsBefore = JSON.stringify(json.materials),
    nodesBefore = JSON.stringify(json.nodes),
    images = json.images.map((i) => {
      const v = json.bufferViews[i.bufferView];
      return Buffer.from(
        base.bin.subarray(
          v.byteOffset ?? 0,
          (v.byteOffset ?? 0) + v.byteLength,
        ),
      );
    });
  const accessors = [],
    views = [],
    chunks = [],
    viewCache = new Map(),
    accessorCache = new Map();
  let offset = 0;
  function putView(data, target) {
    const key = String(target) + ":" + sha(data);
    if (viewCache.has(key)) return viewCache.get(key);
    const pad = -offset & 3;
    if (pad) {
      chunks.push(Buffer.alloc(pad));
      offset += pad;
    }
    const id = views.length;
    views.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: data.length,
      ...(target ? { target } : {}),
    });
    chunks.push(data);
    offset += data.length;
    viewCache.set(key, id);
    return id;
  }
  function put(values, type, componentType = 5126) {
    const size = componentType === 5123 ? 2 : 4,
      width = { SCALAR: 1, VEC2: 2, VEC3: 3 }[type],
      b = Buffer.alloc(values.length * width * size),
      method =
        componentType === 5126
          ? "writeFloatLE"
          : componentType === 5123
            ? "writeUInt16LE"
            : "writeUInt32LE";
    let o = 0;
    for (const row of values)
      for (const v of row) {
        b[method](v, o);
        o += size;
      }
    const key = type + ":" + componentType + ":" + sha(b);
    if (accessorCache.has(key)) return accessorCache.get(key);
    const id = accessors.length,
      view = putView(b, type === "SCALAR" ? 34963 : 34962),
      a = { bufferView: view, componentType, count: values.length, type };
    if (type === "VEC3") {
      a.min = [0, 1, 2].map((i) =>
        values.reduce((s, v) => Math.min(s, v[i]), Infinity),
      );
      a.max = [0, 1, 2].map((i) =>
        values.reduce((s, v) => Math.max(s, v[i]), -Infinity),
      );
    }
    accessors.push(a);
    accessorCache.set(key, id);
    return id;
  }
  const parts = [];
  for (let mi = 0; mi < json.meshes.length; mi++) {
    const node = json.nodes.find((n) => n.mesh === mi),
      sourceNode = node.name.startsWith("Wheel")
        ? wheels.json.nodes.find((n) => n.name === node.name)
        : null;
    if (node.name.startsWith("Wheel") && !sourceNode)
      throw Error("Missing replacement " + node.name);
    if (
      sourceNode &&
      JSON.stringify(node.translation) !==
        JSON.stringify(sourceNode.translation)
    )
      throw Error("Pivot changed " + node.name);
    for (let pi = 0; pi < json.meshes[mi].primitives.length; pi++) {
      const before = json.meshes[mi].primitives[pi],
        model = sourceNode ? wheels : base,
        source = sourceNode
          ? wheels.json.meshes[sourceNode.mesh].primitives[pi]
          : before;
      if (
        model.json.materials[source.material].name !==
        json.materials[before.material].name
      )
        throw Error("Material mapping changed");
      const p = model.accessor(source.attributes.POSITION),
        n = model.accessor(source.attributes.NORMAL),
        uv = model.accessor(source.attributes.TEXCOORD_0),
        ix = model.accessor(source.indices);
      parts.push({
        node: node.name,
        replaced: Boolean(sourceNode),
        triangles: ix.length / 3,
      });
      const replaced = {
        ...before,
        attributes: {
          POSITION: put(p, "VEC3"),
          NORMAL: put(n, "VEC3"),
          TEXCOORD_0: put(uv, "VEC2"),
        },
        indices: put(ix, "SCALAR", p.length < 65536 ? 5123 : 5125),
      };
      json.meshes[mi].primitives[pi] = replaced;
    }
  }
  json.images.forEach((image, i) => (image.bufferView = putView(images[i])));
  json.accessors = accessors;
  json.bufferViews = views;
  json.buffers = [{ byteLength: offset }];
  if (
    JSON.stringify(json.materials) !== materialsBefore ||
    JSON.stringify(json.nodes) !== nodesBefore
  )
    throw Error("Baseline material/node changed");
  let jb = Buffer.from(JSON.stringify(json));
  jb = Buffer.concat([jb, Buffer.alloc(-jb.length & 3, 32)]);
  let bin = Buffer.concat(chunks);
  bin = Buffer.concat([bin, Buffer.alloc(-bin.length & 3)]);
  const head = Buffer.alloc(20),
    binHead = Buffer.alloc(8);
  head.writeUInt32LE(0x46546c67);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + jb.length + bin.length, 8);
  head.writeUInt32LE(jb.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  binHead.writeUInt32LE(bin.length);
  binHead.writeUInt32LE(0x004e4942, 4);
  const assembled = Buffer.concat([head, jb, binHead, bin]);
  const farRecipe =
    level === "far"
      ? createFarLipRecipe(
          await readFile(
            new URL(
              "../public/models/vehicles/campus-hatchback-near.glb",
              import.meta.url,
            ),
          ),
          await readFile(new URL("original-source.glb", root)),
        )
      : null;
  const farFold = farRecipe ? repairFarBytes(assembled, farRecipe) : null;
  const result = farFold?.bytes ?? assembled;
  if (farFold) {
    const paint = parts.find((p) => p.node === "Body:paint");
    paint.triangles +=
      farFold.audit.addedTriangles - farFold.audit.removedTriangles.length;
    paint.sourceFenderRestored = true;
  }
  await writeFile(
    new URL(
      "../public/models/vehicles/campus-hatchback-" + level + ".glb",
      import.meta.url,
    ),
    result,
  );
  reports.push({
    level,
    inputSha256: sha(original),
    replacementWheelSha256: sha(replacement),
    outputSha256: sha(result),
    inputBytes: original.length,
    outputBytes: result.length,
    triangles:
      farFold?.audit.triangles ?? parts.reduce((s, p) => s + p.triangles, 0),
    parts,
    nodesUnchanged: true,
    materialsUnchanged: true,
    imagesUnchanged: true,
    farFenderRepair: farFold?.audit ?? null,
  });
}
await writeFile(
  new URL("../docs/vehicles/wheel-repair-pack-audit.json", import.meta.url),
  JSON.stringify({ capturedAt: new Date().toISOString(), reports }, null, 2) +
    "\n",
);
await writeFile(
  new URL("../docs/vehicles/lod-audit.json", import.meta.url),
  JSON.stringify(
    reports.map((r) => ({
      level: r.level,
      triangles: r.triangles,
      parts: r.parts.length,
      bytes: r.outputBytes,
      sha256: r.outputSha256,
      wheelCentresUnchanged: true,
      nearMasterSha256,
    })),
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify(
    reports.map(({ parts, ...r }) => r),
    null,
    2,
  ),
);
