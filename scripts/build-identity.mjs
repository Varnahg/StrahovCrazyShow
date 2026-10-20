import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Hash only explicit public build inputs. Environment/private runtime state is excluded. */
export async function clientBuildIdentity(root = process.cwd()) {
  const names = [];
  async function walk(folder) {
    for (const entry of await readdir(join(root, folder), {
      withFileTypes: true,
    }).catch(() => [])) {
      const name = folder + "/" + entry.name;
      if (entry.isDirectory() && !entry.name.startsWith(".")) await walk(name);
      else if (
        entry.isFile() &&
        /\.(?:[cm]?[jt]sx?|css|json)$/.test(entry.name)
      )
        names.push(name);
    }
  }
  await walk("client");
  await walk("shared");
  for (const name of [
    "index.html",
    "package.json",
    "pnpm-lock.yaml",
    "tsconfig.json",
    "vite.config.ts",
    "scripts/build-identity.mjs",
  ])
    if (
      await readFile(join(root, name)).then(
        () => true,
        () => false,
      )
    )
      names.push(name);
  const digest = createHash("sha256");
  for (const name of names.sort()) {
    const bytes = await readFile(join(root, name));
    digest
      .update(name + "\0" + bytes.length + "\0")
      .update(bytes)
      .update("\0");
  }
  return "sha256-" + digest.digest("hex");
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--root"))
    throw new Error("Usage: build-identity.mjs [--root PATH]");
  process.stdout.write(
    await clientBuildIdentity(args[1] ? resolve(args[1]) : process.cwd()),
  );
}
