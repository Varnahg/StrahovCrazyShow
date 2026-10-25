import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const SOURCE = "assets/sources/terrain/brown_mud";
const RUNTIME = "public/textures/terrain";
export const TERRAIN_CHANNELS = Object.freeze({
  color: ["Diffuse", 501955],
  normalgl: ["nor_gl", 1011780],
  roughness: ["Rough", 340815],
});
export const digest = (bytes, algorithm = "sha256") =>
  createHash(algorithm).update(bytes).digest("hex");
export function validateTerrainFile(bytes, entry, expectedBytes) {
  if (bytes.byteLength !== expectedBytes || entry.size !== expectedBytes)
    throw new Error("Unexpected original brown_mud byte length");
  if (digest(bytes, "md5") !== entry.md5.toLowerCase())
    throw new Error("Original brown_mud MD5 mismatch");
  if (bytes[0] !== 255 || bytes[1] !== 216 || bytes[2] !== 255)
    throw new Error("Original terrain channel is not JPEG");
  return digest(bytes);
}
async function download(url) {
  const response = await fetch(url, {
    headers: { "User-Agent": "StrahovCrazyShow-source-import/1.0" },
  });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
export async function importTerrainMaterials(root = ROOT) {
  const urls = {
    files: "https://api.polyhaven.com/files/brown_mud",
    info: "https://api.polyhaven.com/info/brown_mud",
  };
  const [filesBytes, infoBytes] = await Promise.all([
    download(urls.files),
    download(urls.info),
  ]);
  const files = JSON.parse(filesBytes),
    info = JSON.parse(infoBytes);
  const repeat = Number(info.dimensions?.[0]) / 1000;
  if (
    !Number.isFinite(repeat) ||
    Math.abs(repeat - 1.299996018409729) > 0.000001 ||
    info.authors?.["Rob Tuytel"] !== "All"
  )
    throw new Error("Changed soil source metadata");
  await mkdir(path.join(root, SOURCE), { recursive: true });
  await mkdir(path.join(root, RUNTIME), { recursive: true });
  await writeFile(path.join(root, SOURCE, "files.json"), filesBytes);
  await writeFile(path.join(root, SOURCE, "info.json"), infoBytes);
  const channels = {};
  for (const [channel, [sourceKey, expectedBytes]] of Object.entries(
    TERRAIN_CHANNELS,
  )) {
    const entry = files[sourceKey]?.["1k"]?.jpg;
    if (
      !entry?.url?.startsWith(
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brown_mud/",
      )
    )
      throw new Error("Unexpected terrain download origin");
    const filename = new URL(entry.url).pathname.split("/").at(-1);
    if (!/^brown_mud_[a-z_]+_1k\.jpg$/.test(filename))
      throw new Error("Unexpected terrain filename");
    const bytes = await download(entry.url),
      sha256 = validateTerrainFile(bytes, entry, expectedBytes);
    await writeFile(path.join(root, SOURCE, filename), bytes);
    await writeFile(path.join(root, RUNTIME, filename), bytes);
    channels[channel] = {
      url: "/textures/terrain/" + filename,
      sourceUrl: entry.url,
      sourcePath: SOURCE + "/" + filename,
      byteLength: bytes.length,
      md5: entry.md5,
      sha256,
    };
  }
  const manifest = {
    schemaVersion: 1,
    provider: "Poly Haven",
    license: "CC0-1.0",
    licenseUrl: "https://polyhaven.com/license",
    assets: [
      {
        id: "brown_mud",
        kind: "soil",
        author: "Rob Tuytel",
        source: "https://polyhaven.com/a/brown_mud",
        importedAt: new Date().toISOString(),
        metresPerRepeat: repeat,
        metresPerRepeatV: Number(info.dimensions[1]) / 1000,
        providerDimensionsMillimetres: info.dimensions,
        scaleProvenance:
          "Poly Haven API dimensions in millimetres divided by 1000; scale string 1,3m confirms the unit",
        technique:
          "Original photographic generic soil texture; not a Strahov scan; source bytes unchanged",
        normalConvention: "OpenGL",
        api: {
          files: {
            url: urls.files,
            path: SOURCE + "/files.json",
            sha256: digest(filesBytes),
          },
          info: {
            url: urls.info,
            path: SOURCE + "/info.json",
            sha256: digest(infoBytes),
          },
        },
        channels,
      },
    ],
  };
  const target = path.join(
    root,
    "shared/data/assets/terrain-materials-manifest.json",
  );
  await writeFile(target, JSON.stringify(manifest, null, 2) + "\n");
  for (const entry of Object.values(channels))
    if (
      digest(await readFile(path.join(root, "public", entry.url))) !==
      entry.sha256
    )
      throw new Error("Published terrain byte mismatch");
  return manifest;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  importTerrainMaterials()
    .then((manifest) => console.log(JSON.stringify(manifest)))
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
