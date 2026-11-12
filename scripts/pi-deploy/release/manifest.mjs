import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const repos = {
  game: "ghcr.io/varnahg/strahovcrazyshow-game",
  tools: "ghcr.io/varnahg/strahovcrazyshow-rag-tools",
  db: "docker.io/pgvector/pgvector",
};
export const dbDigest = "sha256:215ae4d47393a980e9ef7ff7760f7dad53ec3e84bceb9fbd45cef34e50b5ba0f";

export async function createManifest(commit, digests, readManifest, measureUnpacked) {
  if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Neplatné SHA vydání");
  if (digests.db !== dbDigest) throw new Error("Neshoda očekávaného PostgreSQL digestu");
  const images = {};
  const measured = new Map();
  for (const [kind, repo] of Object.entries(repos)) {
    if (!digestPattern.test(digests[kind])) throw new Error(`Neplatný digest ${kind}`);
    const ref = `${repo}@${digests[kind]}`;
    const { schemaVersion, layers } = await readManifest(ref);
    if (schemaVersion !== 2 || !Array.isArray(layers) || layers.length === 0) {
      throw new Error(`Vydání ${kind} musí obsahovat vrstvy jednoho ARM64 obrazu`);
    }
    const layerSizes = [];
    for (const { digest, size, mediaType } of layers) {
      if (!digestPattern.test(digest) || !Number.isSafeInteger(size) || size <= 0 ||
          !/^application\/(?:vnd\.oci\.image\.layer\.v1\.tar(?:\+gzip)?|vnd\.docker\.image\.rootfs\.diff\.tar(?:\.gzip)?)$/.test(mediaType)) {
        throw new Error(`Neplatný deskriptor vrstvy ${kind}`);
      }
      let layer = measured.get(digest);
      if (!layer) {
        const unpacked = mediaType.endsWith("gzip") ? await measureUnpacked(`${repo}@${digest}`) : size;
        if (!Number.isSafeInteger(unpacked) || unpacked <= 0) throw new Error(`Neplatná rozbalená velikost ${digest}`);
        layer = { digest, compressed: size, unpacked };
        measured.set(digest, layer);
      } else if (size !== layer.compressed) {
        throw new Error(`Nekonzistentní velikost vrstvy ${digest}`);
      }
      layerSizes.push(layer);
    }
    images[kind] = { ref, layers: layerSizes };
  }
  return { version: 1, platform: "linux/arm64", commit, images };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifest = await createManifest(process.env.RELEASE_COMMIT, {
    game: process.env.RELEASE_GAME_DIGEST,
    tools: process.env.RELEASE_TOOLS_DIGEST,
    db: dbDigest,
  }, async (ref) => JSON.parse((await exec("oras", ["manifest", "fetch", ref], { timeout: 60_000 })).stdout),
  async (ref) => Number((await exec("bash", ["-o", "pipefail", "-c",
    'oras blob fetch --output - "$1" | gzip -dc | wc -c', "measure-layer", ref],
  { timeout: 600_000 })).stdout.trim()));
  await writeFile(process.argv[2], JSON.stringify(manifest) + "\n", { flag: "wx" });
}
