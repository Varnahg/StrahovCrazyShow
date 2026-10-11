/** Read every authored GLB without rewriting it. Source IPR tiles remain offline
 * references and have their separate immutable-source audit. This is structural
 * QA, not a claim that an unsurveyed building is an exact real-world replica. */
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { join, relative, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
const root = resolve(import.meta.dirname, "..");
const files = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (e.name.endsWith(".glb")) files.push(p);
  }
}
await walk(join(root, "public/models"));
const reports = [],
  errors = [];
const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const components = {
  5120: [1, "getInt8"],
  5121: [1, "getUint8"],
  5122: [2, "getInt16"],
  5123: [2, "getUint16"],
  5125: [4, "getUint32"],
  5126: [4, "getFloat32"],
};
for (const file of files.sort()) {
  const name = relative(root, file).replaceAll("\\", "/");
  try {
    const bytes = await readFile(file);
    if (
      bytes.toString("ascii", 0, 4) !== "glTF" ||
      bytes.readUInt32LE(4) !== 2 ||
      bytes.readUInt32LE(8) !== bytes.length
    )
      throw Error("Invalid GLB 2 header/length");
    let json, binary;
    for (let offset = 12; offset < bytes.length;) {
      const length = bytes.readUInt32LE(offset),
        kind = bytes.readUInt32LE(offset + 4);
      if (offset + 8 + length > bytes.length)
        throw Error("Truncated GLB chunk");
      const chunk = bytes.subarray(offset + 8, offset + 8 + length);
      if (kind === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
      if (kind === 0x004e4942) binary = chunk;
      offset += 8 + length;
    }
    if (!json || !binary) throw Error("Missing JSON/BIN");
    const view = new DataView(
      binary.buffer,
      binary.byteOffset,
      binary.byteLength,
    );
    function accessor(id) {
      const a = json.accessors[id],
        b = json.bufferViews[a.bufferView];
      if (a.sparse)
        throw Error("Sparse accessor requires explicit audit support");
      const [size, method] = components[a.componentType] ?? [];
      const width = widths[a.type];
      if (!size || !width || b.buffer !== 0)
        throw Error("Unsupported accessor");
      const start = (b.byteOffset ?? 0) + (a.byteOffset ?? 0);
      const stride = b.byteStride ?? size * width;
      if (start + (a.count - 1) * stride + size * width > binary.length)
        throw Error("Accessor outside binary");
      return {
        count: a.count,
        width,
        get: (i, c = 0) => view[method](start + i * stride + c * size, true),
      };
    }
    let vertices = 0,
      triangles = 0,
      degenerateTriangles = 0,
      normalOpposedTriangles = 0,
      trianglesWithNormals = 0,
      primitives = 0;
    const minimum = [Infinity, Infinity, Infinity],
      maximum = [-Infinity, -Infinity, -Infinity];
    for (const mesh of json.meshes ?? [])
      for (const primitive of mesh.primitives) {
        if ((primitive.mode ?? 4) !== 4) throw Error("Non-triangle primitive");
        const p = accessor(primitive.attributes.POSITION);
        const normal =
          primitive.attributes.NORMAL === undefined
            ? null
            : accessor(primitive.attributes.NORMAL);
        const ix =
          primitive.indices === undefined ? null : accessor(primitive.indices);
        const n = ix?.count ?? p.count;
        if (p.width !== 3 || n % 3) throw Error("Malformed triangles");
        for (const id of Object.values(primitive.attributes)) {
          const a = accessor(id);
          if (a.count !== p.count) throw Error("Attribute count mismatch");
          for (let i = 0; i < a.count; i++)
            for (let c = 0; c < a.width; c++)
              if (!Number.isFinite(a.get(i, c)))
                throw Error("Non-finite attribute");
        }
        for (let i = 0; i < p.count; i++)
          for (let c = 0; c < 3; c++) {
            minimum[c] = Math.min(minimum[c], p.get(i, c));
            maximum[c] = Math.max(maximum[c], p.get(i, c));
          }
        const at = (i) => (ix ? ix.get(i) : i);
        for (let i = 0; i < n; i += 3) {
          const ids = [at(i), at(i + 1), at(i + 2)];
          if (
            ids.some((id) => !Number.isInteger(id) || id < 0 || id >= p.count)
          )
            throw Error("Index out of range");
          const a = [0, 1, 2].map((c) => p.get(ids[1], c) - p.get(ids[0], c));
          const b = [0, 1, 2].map((c) => p.get(ids[2], c) - p.get(ids[0], c));
          const cross = [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
          ];
          const area = Math.hypot(...cross);
          if (cross.every((v) => Math.abs(v) < 1e-12)) degenerateTriangles++;
          if (normal && area > 1e-12) {
            const average = [0, 1, 2].map((c) =>
              ids.reduce((sum, id) => sum + normal.get(id, c), 0),
            );
            const length = Math.hypot(...average);
            if (length > 1e-8) {
              trianglesWithNormals++;
              // Report substantial disagreement; this is not a closed-volume
              // outward test and never silently rewrites an original source.
              if (
                cross.reduce((sum, v, c) => sum + v * average[c], 0) /
                  (area * length) <
                -0.01
              )
                normalOpposedTriangles++;
            }
          }
        }
        vertices += p.count;
        triangles += n / 3;
        primitives++;
      }
    for (const image of json.images ?? []) {
      if (image.uri && !image.uri.startsWith("data:")) {
        if (/^https?:/.test(image.uri))
          throw Error("Runtime external image URL");
        await stat(resolve(dirname(file), decodeURIComponent(image.uri)));
      } else if (image.bufferView !== undefined) {
        const b = json.bufferViews[image.bufferView];
        if (!b.byteLength || (b.byteOffset ?? 0) + b.byteLength > binary.length)
          throw Error("Missing embedded image");
      }
    }
    reports.push({
      file: name,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      meshes: json.meshes?.length ?? 0,
      nodes: json.nodes?.length ?? 0,
      primitives,
      vertices,
      triangles,
      degenerateTriangles,
      trianglesWithNormals,
      normalOpposedTriangles,
      localBounds: { minimum, maximum },
      materials: json.materials?.length ?? 0,
      images: json.images?.length ?? 0,
      status: "structural-pass",
    });
  } catch (error) {
    errors.push({ file: name, error: String(error) });
  }
}
const output = {
  capturedAt: new Date().toISOString(),
  scope:
    "Every public/models/**/*.glb; immutable IPR .bin/.jpg references audited separately",
  interpretation:
    "Bounds are mesh-local, before glTF node transforms. Degenerates are reported without silently rewriting source meshes. Geometry QA does not establish photographic likeness or physical ground contact.",
  files: reports.length,
  bytes: reports.reduce((s, r) => s + r.bytes, 0),
  triangles: reports.reduce((s, r) => s + r.triangles, 0),
  degenerateTriangles: reports.reduce((s, r) => s + r.degenerateTriangles, 0),
  normalOpposedTriangles: reports.reduce(
    (s, r) => s + r.normalOpposedTriangles,
    0,
  ),
  models: reports,
  errors,
};
await mkdir(join(root, "docs/model-review"), { recursive: true });
await writeFile(
  join(root, "docs/model-review/authored-glb-audit.json"),
  JSON.stringify(output, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    files: output.files,
    bytes: output.bytes,
    triangles: output.triangles,
    degenerateTriangles: output.degenerateTriangles,
    normalOpposedTriangles: output.normalOpposedTriangles,
    errors,
  }),
);
if (errors.length) process.exitCode = 1;
