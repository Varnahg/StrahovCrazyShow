import { open, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const pointerHeader =
  /^version https:\/\/git-lfs\.github\.com\/spec\/v1(?:\r?\n|$)/;

async function checkRuntimeAssets(directory) {
  const pointers = [];
  let files = 0;
  // Read only the header: public contains more than a gigabyte of model data.
  const prefix = Buffer.alloc(128);
  async function walk(folder) {
    const entries = await readdir(folder, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile()) {
        const file = await open(path, "r");
        try {
          const { bytesRead } = await file.read(prefix, 0, prefix.length, 0);
          if (pointerHeader.test(prefix.toString("utf8", 0, bytesRead)))
            pointers.push(relative(directory, path).replaceAll("\\", "/"));
          files++;
        } finally {
          await file.close();
        }
      }
    }
  }
  await walk(directory);
  if (pointers.length) {
    throw new Error(
      `Unresolved Git LFS pointers in ${directory}:\n` +
        pointers
          .sort()
          .map((path) => `  ${path}`)
          .join("\n") +
        "\nRun git lfs install and git lfs pull in the checkout, then build again.",
    );
  }
  return files;
}

try {
  if (process.argv.length > 3)
    throw new Error(
      "Usage: node scripts/check-runtime-assets.mjs [public-directory]",
    );
  const directory = resolve(process.argv[2] ?? "public");
  const files = await checkRuntimeAssets(directory);
  console.log(`Runtime assets: checked ${files} files; no Git LFS pointers.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
