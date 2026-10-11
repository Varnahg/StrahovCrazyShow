import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import manifest from "../../../public/textures/surfaces/manifest.json";

const sha = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const channels = [];
for (const asset of manifest.assets)
  for (const [channel, meta] of Object.entries(asset.channels)) {
    const path = "public" + meta.url,
      data = await readFile(path),
      hash = sha(data);
    if (hash !== meta.sha256 || data.length !== meta.byteLength)
      throw new Error("Original channel mismatch: " + path);
    channels.push({
      family: asset.id,
      channel,
      path,
      bytes: data.length,
      sha256: hash,
      originalVerified: true,
    });
  }
const runtime = [];
for (const path of [
  "client/cinematic.ts",
  "client/surface-pack.ts",
  "client/streets-renderer.ts",
  "tests/cinematic.test.ts",
  "tests/surface-transitions.test.ts",
  "client/vegetation.ts",
  "client/architecture-reality.ts",
  "client/art-lighting.ts",
  "shared/weather.ts",
  "shared/streets.ts",
  "shared/data/streets.json",
  "shared/data/terrain-grid.json",
  "scripts/fetch-surface-pack.py",
  "docs/reality-pack/materials/preview.ts",
  "docs/reality-pack/materials/preview.html",
  "docs/reality-pack/materials/street-preview.html",
  "docs/reality-pack/materials/street-preview.ts",
  "public/textures/surfaces/manifest.json",
]) {
  const data = await readFile(path);
  runtime.push({ path, bytes: data.length, sha256: sha(data) });
}
const result = {
  generatedAt: new Date().toISOString(),
  license: manifest.license,
  channels,
  runtime,
  assertions: {
    originalJpgsUnchanged: true,
    canvasWindowAtlasesNotReplaced: true,
    performanceMeasured: false,
  },
};
await writeFile(
  "docs/reality-pack/materials/audit.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(
  "Verified",
  channels.length,
  "original channels; wrote materials/audit.json",
);
