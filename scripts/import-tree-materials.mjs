/** Original provider bytes only. No image conversion, crop, tint or model load.
 * node scripts/import-tree-materials.mjs --download | --verify
 * Archives stay in the task cache; the published maps are independently pinned.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync, crc32 } from "node:zlib";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const TREE_MATERIAL_MANIFEST = "shared/data/assets/tree-materials-manifest.json";
const SOURCE = "assets/sources/trees/20261025";
const RUNTIME = "public/textures/trees/20261025";
const CACHE = ".cache/trees-materials-20261025";
const MAX_DOWNLOAD_BYTES = 64 * 1024 * 1024;
const AGENT = "StrahovCrazyShow-tree-material-import/1.0 (Powered by Poly Haven)";
export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const md5 = bytes => createHash("md5").update(bytes).digest("hex");
const json = value => JSON.stringify(value, null, 2) + "\n";
const portable = (root, file) => relative(root, file).replaceAll("\\", "/");
const safeFile = value => typeof value === "string" && /^[a-zA-Z0-9_-]+\.(jpg|png)$/.test(value);

export function imageDimensions(bytes) {
  if (bytes.length >= 26 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), format: "png", bitDepth: bytes[24], colorType: bytes[25] };
  }
  if (bytes[0] !== 255 || bytes[1] !== 216) throw Error("Expected original PNG or JPEG");
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset++] !== 255) throw Error("Invalid JPEG marker");
    while (bytes[offset] === 255) offset++;
    const marker = bytes[offset++], length = bytes.readUInt16BE(offset);
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3), format: "jpg", bitDepth: bytes[offset + 2] };
    if (marker === 218 || marker === 217 || length < 2 || offset + length > bytes.length) break;
    offset += length;
  }
  throw Error("JPEG dimensions unavailable");
}

/** Read exactly one named entry; never extract archive paths to the filesystem. */
export function zipEntry(bytes, filename) {
  if (!safeFile(filename)) throw Error("Unsafe requested archive member");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--)
    if (bytes.readUInt32LE(i) === 0x06054b50 && i + 22 + bytes.readUInt16LE(i + 20) === bytes.length) { end = i; break; }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6)) throw Error("Unsupported ZIP directory");
  const count = bytes.readUInt16LE(end + 10), size = bytes.readUInt32LE(end + 12), start = bytes.readUInt32LE(end + 16);
  if (count === 65535 || start + size > end) throw Error("Invalid/ZIP64 directory");
  let offset = start, found;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > start + size || bytes.readUInt32LE(offset) !== 0x02014b50) throw Error("Invalid ZIP entry");
    const flags = bytes.readUInt16LE(offset + 8), method = bytes.readUInt16LE(offset + 10), crc = bytes.readUInt32LE(offset + 16);
    const packed = bytes.readUInt32LE(offset + 20), unpacked = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28), extraLength = bytes.readUInt16LE(offset + 30), commentLength = bytes.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (next > start + size) throw Error("Truncated ZIP entry");
    const name = bytes.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (name === filename) {
      if (found || flags & 1 || ![0,8].includes(method) || unpacked > MAX_DOWNLOAD_BYTES) throw Error("Ambiguous/unsupported ZIP member");
      const local = bytes.readUInt32LE(offset + 42);
      if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50) throw Error("Invalid ZIP local header");
      const localNameLength = bytes.readUInt16LE(local + 26), localExtra = bytes.readUInt16LE(local + 28);
      if (bytes.toString("utf8", local + 30, local + 30 + localNameLength) !== name) throw Error("ZIP member names disagree");
      const dataStart = local + 30 + localNameLength + localExtra;
      if (dataStart + packed > start) throw Error("ZIP member outside data section");
      const data = bytes.subarray(dataStart, dataStart + packed);
      found = method === 0 ? Buffer.from(data) : inflateRawSync(data, { maxOutputLength: MAX_DOWNLOAD_BYTES });
      if (found.length !== unpacked || crc32(found) !== crc) throw Error("ZIP member checksum/size mismatch");
    }
    offset = next;
  }
  if (!found) throw Error("Missing original archive member " + filename);
  return found;
}

async function optionalFile(path) {
  try { return await readFile(path); } catch (error) { if (error.code !== "ENOENT") throw error; }
}
async function preserve(path, bytes) {
  const existing = await optionalFile(path);
  if (existing) { if (!existing.equals(bytes)) throw Error("Refusing to replace different original bytes: " + path); return; }
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes, { flag: "wx" });
}
async function download(url, expectedBytes, expectedHash, algorithm = "sha256") {
  const response = await fetch(url, { headers: { "User-Agent": AGENT }, signal: AbortSignal.timeout(120000) });
  if (!response.ok) throw Error("Source HTTP " + response.status + ": " + url);
  if (Number(response.headers.get("content-length")) > MAX_DOWNLOAD_BYTES) throw Error("Source download exceeds bound");
  const chunks = []; let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length; if (length > MAX_DOWNLOAD_BYTES) throw Error("Source stream exceeds bound"); chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (expectedBytes != null && bytes.length !== expectedBytes) throw Error("Provider byte length changed: " + url);
  if (expectedHash && createHash(algorithm).update(bytes).digest("hex") !== expectedHash) throw Error("Provider/source hash changed: " + url);
  return bytes;
}
async function metadata(root, id, name, url) {
  const path = resolve(root, SOURCE, id, name), existing = await optionalFile(path), bytes = existing ?? await download(url);
  if (!existing) await preserve(path, bytes);
  return { data: JSON.parse(bytes), record: { url, path: portable(root, path), sha256: sha256(bytes), bytes: bytes.length } };
}
function verifyDimensions(bytes, filename) {
  const size = imageDimensions(bytes);
  if (size.width !== 2048 || size.height !== 2048) throw Error("Unexpected 2K atlas dimensions: " + filename);
  return size;
}

export async function importTreeMaterials(root = ROOT) {
  root = resolve(root);
  const previousBytes = await optionalFile(resolve(root, TREE_MATERIAL_MANIFEST));
  const previous = previousBytes ? JSON.parse(previousBytes) : undefined;
  const assets = [];
  for (const id of ["LeafSet024", "fir_tree_01"]) {
    const old = previous?.assets.find(asset => asset.id === id), maps = {}, archives = [];
    const importedAt = old?.importedAt ?? new Date().toISOString();
    let source, technique, attribution, metadataRecords, atlasMetres;
    if (id === "LeafSet024") {
      const meta = await metadata(root, id, "metadata-v3.json", "https://ambientcg.com/api/v3/assets?id=LeafSet024&include=technique,dimensions,downloads,maps,url,title");
      const entry = meta.data.assets?.find(asset => asset.id === id);
      if (entry?.technique !== "surface-photogrammetry" || entry.dimensions?.width !== 40 || entry.dimensions?.height !== 40 ||
          !["color","normal","roughness","opacity"].every(channel => entry.maps.includes(channel))) throw Error("Changed LeafSet024 source contract");
      source = entry.url; technique = { providerField: "technique", value: entry.technique, label: "Surface Photogrammetry" };
      attribution = "ambientCG / Lennart Demes"; atlasMetres = [0.4, 0.4]; metadataRecords = [meta.record];
      for (const [variant, expectedSize, channels] of [
        ["2K-JPG", 15211530, [["color","Color"],["normalGL","NormalGL"],["roughness","Roughness"]]],
        ["2K-PNG", 48645223, [["opacity","Opacity"]]],
      ]) {
        const descriptor = entry.downloads.find(item => item.attributes === variant && item.extension === "zip");
        const url = "https://ambientcg.com/get?file=" + id + "_" + variant + ".zip";
        if (descriptor?.url !== url || descriptor.size !== expectedSize) throw Error("Changed ambientCG archive descriptor");
        const archivePath = resolve(root, CACHE, "downloads", id + "_" + variant + ".zip");
        let bytes = await optionalFile(archivePath);
        const pin = old?.archives.find(item => item.variant === variant)?.sha256;
        if (!bytes) { bytes = await download(url, expectedSize, pin); await preserve(archivePath, bytes); }
        if (bytes.length !== expectedSize || (pin && sha256(bytes) !== pin)) throw Error("Cached archive differs from source pin");
        archives.push({ variant, url, bytes: bytes.length, sha256: sha256(bytes), cachePath: portable(root, archivePath) });
        for (const [channel, suffix] of channels) {
          const filename = id + "_" + variant + "_" + suffix + (variant.endsWith("PNG") ? ".png" : ".jpg");
          maps[channel] = await publishMap(root, id, channel, filename, zipEntry(bytes, filename), { archive: variant, member: filename, url });
        }
      }
    } else {
      const info = await metadata(root, id, "provider-info.json", "https://api.polyhaven.com/info/" + id);
      const files = await metadata(root, id, "provider-files.json", "https://api.polyhaven.com/files/" + id);
      if (info.data.type !== 2 || String(info.data.authors?.["Rob Tuytel"]).toLowerCase() !== "photography" ||
          !info.data.authors?.["Rico Cilliers"]) throw Error("Changed Fir source author/type contract");
      source = "https://polyhaven.com/a/" + id;
      technique = { providerField: "authors", value: "Photography: Rob Tuytel; Modeling: Rico Cilliers", label: "Photographic source maps; exact capture technique not published" };
      attribution = "Rob Tuytel (photography), Rico Cilliers (modeling), Poly Haven";
      atlasMetres = null; metadataRecords = [info.record, files.record];
      for (const [channel, key, format] of [["color","twig_diff","jpg"],["normalGL","twig_nor_gl","jpg"],["roughness","twig_rough","jpg"],["opacity","twig_alpha","png"]]) {
        const entry = files.data[key]?.["2k"]?.[format], filename = id + "_" + key + "_2k." + format;
        const url = "https://dl.polyhaven.org/file/ph-assets/Models/" + format + "/2k/" + id + "/" + filename;
        if (entry?.url !== url || !Number.isSafeInteger(entry.size) || entry.size <= 0 || !/^[a-f0-9]{32}$/.test(entry.md5)) throw Error("Invalid Fir map descriptor");
        const originalPath = resolve(root, SOURCE, id, filename);
        const bytes = await optionalFile(originalPath) ?? await download(url, entry.size, entry.md5, "md5");
        if (bytes.length !== entry.size || md5(bytes) !== entry.md5) throw Error("Fir original bytes differ from provider");
        maps[channel] = await publishMap(root, id, channel, filename, bytes, { url, providerMd5: entry.md5 });
      }
    }
    const licenseUrl = id === "LeafSet024" ? "https://docs.ambientcg.com/license/" : "https://polyhaven.com/license";
    const licensePath = resolve(root, SOURCE, id, "license.html");
    const licenseBytes = await optionalFile(licensePath) ?? await download(licenseUrl);
    if (!licenseBytes.toString("utf8").includes("CC0")) throw Error("Missing CC0 source license statement");
    await preserve(licensePath, licenseBytes);
    assets.push({ id, source, license: "CC0-1.0", licenseUrl, attribution, importedAt, technique,
      licenseEvidence: { path: portable(root, licensePath), sha256: sha256(licenseBytes), bytes: licenseBytes.length },
      metadata: metadataRecords, archives, atlasPixels: [2048,2048], atlasMetres,
      physicalScaleBasis: atlasMetres ? "Provider dimensions 40x40 centimetres describe the complete atlas; component dimensions derive from pixel bounds." : "Unknown twig scale; whole model dimensions must not be used as the atlas scale.",
      localSpecies: null, sourcePixelsModified: false, normalConvention: "OpenGL", maps });
  }
  const manifest = { schemaVersion: 1, purpose: "Source-backed generic tree foliage; no botanical identification of Strahov trees", assets };
  await mkdir(dirname(resolve(root, TREE_MATERIAL_MANIFEST)), { recursive: true });
  await writeFile(resolve(root, TREE_MATERIAL_MANIFEST), json(manifest));
  await verifyTreeMaterials(root);
  return manifest;
}
async function publishMap(root, id, channel, filename, bytes, origin) {
  if (!safeFile(filename)) throw Error("Unsafe map filename");
  const size = verifyDimensions(bytes, filename);
  if (channel === "opacity" && size.format !== "png") throw Error("Opacity must preserve original lossless PNG");
  const sourcePath = resolve(root, SOURCE, id, filename), runtimePath = resolve(root, RUNTIME, id, filename);
  await preserve(sourcePath, bytes); await preserve(runtimePath, bytes);
  return { ...origin, sourceUrl: origin.url, sourcePath: portable(root, sourcePath), runtimePath: portable(root, runtimePath),
    url: "/" + portable(root, runtimePath).replace(/^public\//, ""), sha256: sha256(bytes), bytes: bytes.length,
    ...size, colorSpace: channel === "color" ? "sRGB" : "linear", semantic: channel === "opacity" ? "grayscale opacity, not PNG alpha channel" : channel };
}
export async function verifyTreeMaterials(root = ROOT) {
  const manifest = JSON.parse(await readFile(resolve(root, TREE_MATERIAL_MANIFEST), "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.assets.length !== 2) throw Error("Invalid tree source manifest");
  for (const asset of manifest.assets) {
    for (const entry of [...asset.metadata, asset.licenseEvidence]) {
      const bytes = await readFile(resolve(root, entry.path));
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw Error("Source evidence hash changed: " + entry.path);
    }
    for (const channel of ["color","normalGL","roughness","opacity"]) {
      const entry = asset.maps[channel];
      for (const path of [entry.sourcePath,entry.runtimePath]) {
        const bytes = await readFile(resolve(root, path));
        if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw Error("Original map hash changed: " + path);
        verifyDimensions(bytes, path);
      }
    }
  }
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--download","--verify"].includes(args[0])) throw Error("Use --download or --verify; no implicit import");
  const manifest = await (args[0] === "--download" ? importTreeMaterials() : verifyTreeMaterials());
  console.log(json({ status: "verified-original-bytes", assets: manifest.assets.map(asset => asset.id), manifest: TREE_MATERIAL_MANIFEST }));
}
