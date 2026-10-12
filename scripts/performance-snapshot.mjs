/** Freeze source, assets and tests; verify every byte before/after copying.
 * Historical IPR references may be reused from a previous verified snapshot.
 * Authored gameplay assets and editable Blender masters are always copied. */
import {
  cp,
  mkdir,
  readdir,
  readFile,
  writeFile,
  symlink,
  stat,
  realpath,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join, sep, dirname } from "node:path";

const root = resolve(import.meta.dirname, "..");
const name =
  process.argv[2] || new Date().toISOString().replaceAll(/[:.]/g, "-");
const validName = (value) => /^[a-zA-Z0-9-]+$/.test(value);
if (!validName(name))
  throw new Error("Snapshot name must contain letters, digits or hyphens.");
const snapshotBase = join(root, ".cache/performance-snapshot");
const target = join(snapshotBase, name);
const entries = [
  "client",
  "server",
  "shared",
  "public",
  "assets",
  "scripts",
  "tests",
  // Static serialized source used by the stadium archive regression. Evolving
  // verification reports and the remaining documentation stay outside runtime.
  "docs/reality-pack/landmarks/geometry-source.json",
  // Fixed native-authoring audit fixtures consumed by the model regressions.
  // They bind the shipped Blender masters/GLBs; live verification reports do
  // not belong in a frozen runtime snapshot.
  "docs/reality-pack/building-window-kit-20261012/blender-export-audit.json",
  "docs/reality-pack/b4-facade-panels-20261012/blender-export-audit.json",
  "docs/building-modeling-20261012/references/market-kit-blender-audit.json",
  "index.html",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vite.config.ts",
];
const referencePrefix = "public/models/photogrammetry/";
// Editor backups and Python bytecode are local artifacts, absent from a clone.
const generatedArtifact = (file) =>
  /(^|[\\/])__pycache__([\\/]|$)|\.blend[12]$|\.py[cod]$/.test(file);
const reuseName =
  process.argv[3] === "--reuse-ipr-from" ? process.argv[4] : undefined;
if (process.argv[3] && !reuseName)
  throw new Error(
    "Usage: performance-snapshot.mjs NAME [--reuse-ipr-from EXISTING-SNAPSHOT]",
  );
if (reuseName && (!validName(reuseName) || reuseName === name))
  throw new Error("Invalid reference snapshot.");

async function hashes(base) {
  const files = [];
  async function walk(file, directory) {
    if (generatedArtifact(file)) return;
    if (directory) {
      for (const e of await readdir(join(base, file), {
        withFileTypes: true,
      })) {
        const next = join(file, e.name);
        const directory =
          e.isDirectory() ||
          (e.isSymbolicLink() && (await stat(join(base, next))).isDirectory());
        await walk(next, directory);
      }
    } else files.push(file);
  }
  for (const entry of entries)
    await walk(entry, (await stat(join(base, entry))).isDirectory());
  files.sort();
  let cursor = 0;
  const values = new Array(files.length);
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      while (cursor < files.length) {
        const i = cursor++,
          file = files[i];
        values[i] = [
          file.replaceAll("\\", "/"),
          createHash("sha256")
            .update(await readFile(join(base, file)))
            .digest("hex"),
        ];
      }
    }),
  );
  return Object.fromEntries(values);
}

await mkdir(snapshotBase, { recursive: true });
await mkdir(target, { recursive: false });
const before = await hashes(root);
let referenceReuse;
if (reuseName) {
  const previousRoot = join(snapshotBase, reuseName);
  const previousManifestBytes = await readFile(
    join(previousRoot, "source-manifest.json"),
  );
  const previous = JSON.parse(previousManifestBytes.toString("utf8"));
  const originals = Object.entries(before).filter(([file]) =>
    file.startsWith(referencePrefix),
  );
  if (
    !originals.length ||
    originals.some(([file, sha]) => previous.files[file] !== sha)
  )
    throw new Error(
      "Historical reference bytes differ from the previous frozen source.",
    );
  const referenceRoot = await realpath(
    join(previousRoot, "public/models/photogrammetry"),
  );
  if (!referenceRoot.startsWith(snapshotBase + sep))
    throw new Error("Reference root escaped the snapshot directory.");
  referenceReuse = {
    snapshotId: previous.snapshotId,
    sourceManifestSha256: createHash("sha256")
      .update(previousManifestBytes)
      .digest("hex"),
    root: referenceRoot,
    files: originals.length,
    method:
      "Directory junction to previous immutable historical IPR reference only; every file remains included in before/after/frozen hashes. Do not run asset generators against audit snapshots.",
  };
}
await Promise.all(
  entries.map(async (entry) => {
    await mkdir(dirname(join(target, entry)), { recursive: true });
    return cp(join(root, entry), join(target, entry), {
      recursive: true,
      filter: (source) =>
        !generatedArtifact(source) &&
        (!referenceReuse ||
          source !== join(root, "public/models/photogrammetry")),
    });
  }),
);
if (referenceReuse)
  await symlink(
    referenceReuse.root,
    join(target, "public/models/photogrammetry"),
    "junction",
  );
const [after, frozen] = await Promise.all([hashes(root), hashes(target)]);
if (
  JSON.stringify(before) !== JSON.stringify(after) ||
  JSON.stringify(before) !== JSON.stringify(frozen)
)
  throw new Error(
    "Sources changed while freezing. Preserve this failed attempt and use a fresh snapshot name.",
  );
await symlink(
  join(root, "node_modules"),
  join(target, "node_modules"),
  "junction",
);
const manifest = {
  capturedAt: new Date().toISOString(),
  sourceRoot: root,
  snapshotRoot: target,
  snapshotId: createHash("sha256").update(JSON.stringify(frozen)).digest("hex"),
  method:
    "Live hashes before and after source/asset/test copy exactly match frozen hashes. Dependencies share node_modules; package and lock identify versions. Historical reference reuse, when present, is declared separately.",
  ...(referenceReuse ? { referenceReuse } : {}),
  files: frozen,
};
await writeFile(
  join(target, "source-manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    snapshotRoot: target,
    snapshotId: manifest.snapshotId,
    files: Object.keys(frozen).length,
    reusedReferenceFiles: referenceReuse?.files ?? 0,
  }),
);
