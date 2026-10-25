/** Reproducible CC0 source acquisition. Large masters stay in the D work cache;
 * only the source manifest and original 1K material channels belong to Git.
 * Run explicitly: node scripts/import-ground-flowers.mjs --download
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname, basename, relative } from "node:path";

const root = resolve(import.meta.dirname, ".."), asset = "dandelion_01";
const source = resolve(root, "assets/sources/vegetation", asset);
const cache = resolve(root, ".cache/terrain-flowers-20261025/source-highest");
const hash = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const portable = (path) => relative(root, path).replaceAll("\\", "/");
function imageDimensions(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  if (bytes[0] !== 255 || bytes[1] !== 216) return undefined;
  for (let offset = 2; offset + 8 < bytes.length;) {
    if (bytes[offset++] !== 255) throw Error("Invalid JPEG marker");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++];
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
      return [bytes.readUInt16BE(offset + 5), bytes.readUInt16BE(offset + 3)];
    if (marker === 218 || marker === 217) break;
    const length = bytes.readUInt16BE(offset); if (length < 2) throw Error("Invalid JPEG segment"); offset += length;
  }
  throw Error("JPEG has no dimensions");
}
async function get(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "StrahovCrazyShow-ground-flower-import/1.0 (Powered by Poly Haven)" },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw Error(`Source HTTP ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
function validateEntry(entry) {
  const url = new URL(entry?.url);
  if (url.origin !== "https://dl.polyhaven.org" || !url.pathname.startsWith("/file/ph-assets/Models/") ||
      !url.pathname.includes("/dandelion_01/") || !Number.isSafeInteger(entry.size) || entry.size <= 0 || entry.size > 100 * 1024 * 1024 ||
      !/^[a-f0-9]{32}$/.test(entry.md5)) throw Error("Invalid official flower source descriptor");
}
async function acquire(entry, path, purpose) {
  validateEntry(entry);
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  if (!bytes) {
    bytes = await get(entry.url);
    if (bytes.length !== entry.size || hash(bytes, "md5") !== entry.md5)
      throw Error("Downloaded source differs from provider bytes/hash: " + entry.url);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes, { flag: "wx" });
  }
  if (bytes.length !== entry.size || hash(bytes, "md5") !== entry.md5)
    throw Error("Existing source differs from provider bytes/hash: " + path);
  console.log(`${purpose}: ${basename(path)} (${bytes.length} B)`);
  return { path: portable(path), purpose, url: entry.url, bytes: bytes.length, md5: entry.md5, sha256: hash(bytes), pixelDimensions: imageDimensions(bytes) };
}

if (process.argv.slice(2).some((arg) => !["--download", "--derive"].includes(arg))) throw Error("Unknown argument");
if (process.argv.includes("--download")) {
  const [infoBytes, filesBytes] = await Promise.all([
    get("https://api.polyhaven.com/info/" + asset), get("https://api.polyhaven.com/files/" + asset),
  ]);
  const info = JSON.parse(infoBytes), files = JSON.parse(filesBytes), blend = files.blend?.["8k"]?.blend;
  if (info.type !== 2 || !blend || info.max_resolution?.[0] !== 8192 || info.files_hash !== "1aaae5d9ce759a84e3b9d381821c8647cefa7a85")
    throw Error("Unexpected source asset schema; review provider changes before importing");
  await mkdir(source, { recursive: true });
  const downloaded = [await acquire(blend, resolve(cache, basename(blend.url)), "preserved-highest")];
  for (const [name, entry] of Object.entries(blend.include)) {
    if (name !== "textures/" + basename(name)) throw Error("Unexpected source dependency path");
    downloaded.push(await acquire(entry, resolve(cache, name), "preserved-highest"));
  }
  for (const [channel, format] of [["Diffuse", "jpg"], ["Alpha", "png"], ["nor_gl", "jpg"], ["arm", "jpg"]]) {
    const entry = files[channel]?.["1k"]?.[format];
    downloaded.push(await acquire(entry, resolve(source, "original-1k", basename(entry.url)), "original-runtime-reference"));
  }
  await writeFile(resolve(source, "provider-info.json"), infoBytes);
  await writeFile(resolve(source, "provider-files.json"), filesBytes);
  const manifest = {
    schemaVersion: 1, asset, source: "https://polyhaven.com/a/" + asset,
    license: "CC0-1.0", licenseUrl: "https://polyhaven.com/license", authors: info.authors,
    importedAt: new Date().toISOString(), providerFilesRevisionSha1: info.files_hash,
    metadata: { infoSha256: hash(infoBytes), filesSha256: hash(filesBytes) },
    sourceDimensionsMillimetres: info.dimensions, sourceCatalogTriangles: info.polycount,
    sourceMaxResolution: info.max_resolution,
    interpretation: "Sparse small yellow flowers; generic visual interpretation, not a Strahov botanical observation. Catalog bounds describe the entire source asset, not one plant.",
    cachePolicy: "Preserved 8K master and dependencies stay in .cache on D; reproduce with this importer. Never commit or silently substitute the complete catalog scene as runtime geometry.",
    files: downloaded,
  };
  await writeFile(resolve(source, "source-manifest.json"), json(manifest));
  console.log(json({ status: "source-verified", files: downloaded.length, bytes: downloaded.reduce((n, f) => n + f.bytes, 0),
    manifest: portable(resolve(source, "source-manifest.json")), runtimePublished: false }));
}

function components(mesh) {
  const parents = Array.from({ length: mesh.triangles }, (_, i) => i), vertices = new Map();
  const find = (i) => parents[i] === i ? i : (parents[i] = find(parents[i]));
  for (let t = 0; t < mesh.triangles; t++) for (let v = 0; v < 3; v++) {
    const key = mesh.positions.slice(t * 9 + v * 3, t * 9 + v * 3 + 3).map(n => n.toFixed(7)).join(",");
    if (vertices.has(key)) parents[find(t)] = find(vertices.get(key)); else vertices.set(key, t);
  }
  const result = new Map();
  for (let t = 0; t < mesh.triangles; t++) { const id = find(t); if (!result.has(id)) result.set(id, []); result.get(id).push(t); }
  return [...result.values()].map((triangles, id) => {
    const corners = triangles.flatMap(t => [t * 3, t * 3 + 1, t * 3 + 2]);
    const bounds = (data, stride, axis) => [Math.min(...corners.map(i => data[i * stride + axis])), Math.max(...corners.map(i => data[i * stride + axis]))];
    return { id, triangles, corners, z: bounds(mesh.positions, 3, 2), u: bounds(mesh.uvs, 2, 0), v: bounds(mesh.uvs, 2, 1) };
  });
}
function nativeSubset(mesh, groups) {
  const result = { positions: [], normals: [], uvs: [], indices: [] };
  for (const c of groups) for (const i of c.corners) {
    result.positions.push(mesh.positions[i * 3], mesh.positions[i * 3 + 2], -mesh.positions[i * 3 + 1]);
    result.normals.push(mesh.normals[i * 3], mesh.normals[i * 3 + 2], -mesh.normals[i * 3 + 1]);
    result.uvs.push(mesh.uvs[i * 2], 1 - mesh.uvs[i * 2 + 1]);
    result.indices.push(result.indices.length);
  }
  return result;
}
function solve3(matrix, rhs) {
  const rows = matrix.map((row, i) => [...row, rhs[i]]);
  for (let i = 0; i < 3; i++) {
    let pivot = i; for (let j = i + 1; j < 3; j++) if (Math.abs(rows[j][i]) > Math.abs(rows[pivot][i])) pivot = j;
    [rows[i], rows[pivot]] = [rows[pivot], rows[i]];
    const scale = rows[i][i]; if (Math.abs(scale) < 1e-10) throw Error("Degenerate flower UV projection");
    for (let j = i; j < 4; j++) rows[i][j] /= scale;
    for (let k = 0; k < 3; k++) if (k !== i) { const factor = rows[k][i]; for (let j = i; j < 4; j++) rows[k][j] -= factor * rows[i][j]; }
  }
  return rows.map(row => row[3]);
}
function flatHead(mesh, head) {
  const uv = head.corners.map(i => [1, mesh.uvs[i * 2], mesh.uvs[i * 2 + 1]]);
  const matrix = [0, 1, 2].map(i => [0, 1, 2].map(j => uv.reduce((n, row) => n + row[i] * row[j], 0)));
  const fits = [0, 1, 2].map(axis => solve3(matrix, [0, 1, 2].map(j => uv.reduce((n, row, k) => n + row[j] * mesh.positions[head.corners[k] * 3 + axis], 0))));
  const point = (u, v) => fits.map(f => f[0] + f[1] * u + f[2] * v);
  const du = fits.map(f => f[1]), dv = fits.map(f => f[2]);
  let n = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
  const length = Math.hypot(...n); n = n.map(v => v / length);
  if (n[2] < 0) n = n.map(v => -v);
  const result = { positions: [], normals: [], uvs: [], indices: [0, 1, 2, 0, 2, 3] };
  for (const [u, v] of [[head.u[0], head.v[0]], [head.u[1], head.v[0]], [head.u[1], head.v[1]], [head.u[0], head.v[1]]]) {
    const p = point(u, v); result.positions.push(p[0], p[2], -p[1]); result.normals.push(n[0], n[2], -n[1]); result.uvs.push(u, 1 - v);
  }
  const errors = head.corners.map((i, k) => Math.hypot(...point(uv[k][1], uv[k][2]).map((v, axis) => v - mesh.positions[i * 3 + axis])));
  return { geometry: result, maximumDeviationMetres: Math.max(...errors), rmsDeviationMetres: Math.sqrt(errors.reduce((n, e) => n + e * e, 0) / errors.length) };
}
if (process.argv.includes("--derive")) {
  const inputPath = resolve(root, ".cache/terrain-flowers-20261025/source-extract.json"), inputBytes = await readFile(inputPath);
  const extracted = JSON.parse(inputBytes), manifest = JSON.parse(await readFile(resolve(source, "source-manifest.json"), "utf8"));
  const mesh = extracted.meshes.find(m => m.name === "dandelion_01_a_LOD3");
  if (!mesh || mesh.triangles !== 260) throw Error("Source topology changed; inspect before deriving");
  const groups = components(mesh);
  const heads = groups.filter(c => c.u[0] > .58 && c.u[1] < .80 && c.v[0] > .74);
  if (heads.length !== 2) throw Error("Expected two isolated original yellow flower heads");
  const head = heads.sort((a, b) => b.z[1] - a.z[1])[0];
  const stem = groups.filter(c => c.v[0] > .83 && c.v[1] < .87).sort((a, b) => b.z[1] - a.z[1])[0];
  const leaves = groups.filter(c => c.z[1] < .05).slice(0, 2);
  if (head.triangles.length !== 24 || stem?.triangles.length !== 14 || leaves.length !== 2) throw Error("Unexpected selected source components");
  const selected = [head, stem, ...leaves], near = nativeSubset(mesh, selected), projection = flatHead(mesh, head), far = nativeSubset(mesh, [stem]);
  const offset = far.positions.length / 3;
  for (const key of ["positions", "normals", "uvs"]) far[key].push(...projection.geometry[key]);
  far.indices.push(...projection.geometry.indices.map(i => i + offset));
  const levels = { near, far };
  for (const g of Object.values(levels)) {
    g.triangles = g.indices.length / 3;
    if (![...g.positions, ...g.normals, ...g.uvs].every(Number.isFinite)) throw Error("Nonfinite derived flower geometry");
  }
  const textureOut = resolve(root, "public/textures/vegetation/flowers"), modelOut = resolve(root, "public/models/vegetation/flowers");
  await mkdir(textureOut, { recursive: true }); await mkdir(modelOut, { recursive: true });
  const textures = {};
  for (const [channel, suffix] of [["albedo", "diff_1k.jpg"], ["alpha", "alpha_1k.png"], ["normal", "nor_gl_1k.jpg"], ["arm", "arm_1k.jpg"]]) {
    const entry = manifest.files.find(f => f.purpose === "original-runtime-reference" && f.path.endsWith(suffix));
    const bytes = await readFile(resolve(root, entry.path));
    if (hash(bytes) !== entry.sha256) throw Error("Original channel hash mismatch");
    if (JSON.stringify(imageDimensions(bytes)) !== "[1024,1024]") throw Error("Unexpected original runtime atlas dimensions");
    const file = basename(entry.path); await writeFile(resolve(textureOut, file), bytes);
    textures[channel] = { file, bytes: bytes.length, sha256: hash(bytes), gamma: channel === "albedo" };
  }
  const audit = { sourceMasterSha256: extracted.sourceMasterSha256, sourceComponentGeometrySha256: hash(Buffer.from(json(nativeSubset(mesh, selected)))), sourceObject: mesh.name,
    sourceComponents: selected.map(c => ({ id: c.id, sourceTriangles: c.triangles })), sourcePixelsModified: false,
    omittedSourceModifiers: mesh.modifiers, interpretation: manifest.interpretation,
    near: "One original head, its original curved stem and two original leaves; native UV/split normals, no rescale, translation or source modifier evaluation.",
    far: "Same original stem; one UV-fit photographic head plane; basal leaves omitted. Not a source-exact flower at this LOD.",
    farHeadMaximumDeviationMetres: projection.maximumDeviationMetres, farHeadRmsDeviationMetres: projection.rmsDeviationMetres };
  // A fitted FAR card can extend beyond the curved source, including its
  // transparent corners. Bounds must contain BOTH submitted representations.
  let radius = 0, height = 0;
  for (const g of Object.values(levels)) for (let i = 0; i < g.positions.length; i += 3) {
    radius = Math.max(radius, Math.hypot(g.positions[i], g.positions[i + 2]));
    height = Math.max(height, g.positions[i + 1]);
  }
  const headDiameter = Math.max(...[0, 1].map(axis => Math.max(...head.corners.map(i => mesh.positions[i * 3 + axis])) - Math.min(...head.corners.map(i => mesh.positions[i * 3 + axis]))));
  const pack = { schemaVersion: 1, asset, source: manifest.source, license: manifest.license, units: "metres", height, radius, headDiameter,
    textureWidth: 1024, textureHeight: 1024, textures, levels, audit };
  pack.runtimeGeometryId = hash(Buffer.from(json(pack)));
  await writeFile(resolve(modelOut, "geometry.json"), json(pack));
  await writeFile(resolve(source, "derived-components.json"), json({ ...audit, rawSelectedGeometry: nativeSubset(mesh, selected) }));
  await writeFile(resolve(source, "derivation-audit.json"), json({ ...audit, extractionArtifactSha256: hash(inputBytes), runtimeGeometryId: pack.runtimeGeometryId, height, radius, triangles: Object.fromEntries(Object.entries(levels).map(([k, g]) => [k, g.triangles])) }));
  console.log(json({ status: "derived-not-visually-accepted", triangles: Object.fromEntries(Object.entries(levels).map(([k, g]) => [k, g.triangles])), height, radius, maximumDeviationMetres: projection.maximumDeviationMetres }));
}
if (process.argv.length === 2) console.log("Use --download for original sources or --derive after the headless extraction; no action by default.");
