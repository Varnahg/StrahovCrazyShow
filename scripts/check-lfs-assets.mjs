import { spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep, win32 } from "node:path";

const headerLimit = 1024;

function parseRoot(args) {
  if (args.length === 0) return resolve(process.cwd());
  if (args.length === 2 && args[0] === "--root" && args[1] && !args[1].startsWith("--")) {
    return resolve(args[1]);
  }
  throw new Error("Invalid arguments. Usage: node scripts/check-lfs-assets.mjs [--root DIR]");
}

// Never relay subprocess output on failure: a parser diagnostic could contain
// asset bytes. Git/LFS only inspects local state; no transfer or checkout runs.
function git(root, args, label, input, allowedStatuses = [0]) {
  const result = spawnSync("git", ["-C", root, ...args], {
    input,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.signal || !allowedStatuses.includes(result.status)) {
    throw new Error(`${label} failed (${result.error?.code ?? result.signal ?? `exit ${result.status}`})`);
  }
  return result;
}

function inventory(root) {
  const output = git(root, ["lfs", "ls-files", "--json", "HEAD"], "Git LFS HEAD inventory").stdout;
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Git LFS inventory returned invalid JSON");
  }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object" ||
      !(parsed.files === null || Array.isArray(parsed.files))) {
    throw new Error("Invalid Git LFS inventory: files must be an array or null");
  }
  return parsed.files ?? [];
}

function isInside(root, path) {
  const fromRoot = relative(root, path);
  return fromRoot !== "" && fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot);
}

function assetPath(root, name) {
  if (typeof name !== "string" || name.length === 0 || name.includes("\0") ||
      name.includes("\\") || win32.parse(name).root || isAbsolute(name) ||
      name.split("/").some((part) => part === "" || part === "." || part === "..") ||
      (process.platform === "win32" && name.includes(":"))) {
    throw new Error("invalid relative inventory path");
  }
  const path = resolve(root, name);
  if (!isInside(root, path)) throw new Error("asset path escapes the checkout root");
  if (!lstatSync(path).isFile()) throw new Error("asset must be a regular file, not a directory or symbolic link");
  const realPath = realpathSync(path);
  if (!isInside(root, realPath)) throw new Error("asset path resolves outside the checkout root");
  return realPath;
}

function readHeader(path) {
  // O_NOFOLLOW prevents a last-component symlink race where supported;
  // O_NONBLOCK avoids waiting on a special file substituted after lstat.
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const before = fstatSync(fd);
    if (!before.isFile()) throw new Error("asset must be a regular file");
    const header = Buffer.alloc(Math.min(headerLimit, before.size));
    let bytesRead = 0;
    while (bytesRead < header.length) {
      const count = readSync(fd, header, bytesRead, header.length - bytesRead, bytesRead);
      if (count === 0) throw new Error("asset changed while reading its header");
      bytesRead += count;
    }
    const after = fstatSync(fd);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) {
      throw new Error("asset changed while reading its header");
    }
    return { size: before.size, header };
  } finally {
    closeSync(fd);
  }
}

function checkAsset(root, file) {
  if (!file || typeof file !== "object" || Array.isArray(file)) {
    throw new Error("invalid inventory file entry");
  }
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error("invalid declared asset size in inventory");
  }
  const { size, header } = readHeader(assetPath(root, file.name));
  // Only complete small files go to the official parser. Empty materialized
  // assets are valid; Git LFS also treats empty input as its empty pointer.
  if (size > 0 && size <= headerLimit) {
    const result = git(root, ["lfs", "pointer", "--check", "--stdin", "--no-strict"],
      "Git LFS pointer check", header, [0, 1]);
    if (result.status === 0) throw new Error("unmaterialized Git LFS pointer");
    if (result.stderr.trim()) throw new Error("Git LFS pointer check failed");
  }
  if (size !== file.size) {
    throw new Error(`size mismatch: expected ${file.size} bytes, found ${size}`);
  }
}

function main() {
  const root = realpathSync(parseRoot(process.argv.slice(2)));
  if (!statSync(root).isDirectory()) throw new Error("Root must be a directory");
  const topLevel = git(root, ["rev-parse", "--show-toplevel"], "Git repository root check").stdout.replace(/\r?\n$/, "");
  if (realpathSync(topLevel) !== root) throw new Error("Root must be the Git checkout root directory");
  const files = inventory(root);
  let failures = 0;
  for (const [index, file] of files.entries()) {
    try {
      checkAsset(root, file);
    } catch (error) {
      failures += 1;
      const name = typeof file?.name === "string" ? file.name : `inventory entry ${index + 1}`;
      console.error(`${name}: ${error.message}`);
    }
  }
  if (failures) {
    console.error(`LFS asset preflight: checked ${files.length} files; ${failures} failed.`);
    return 1;
  }
  console.log(`LFS asset preflight: ${files.length} files ready (size and pointer checks; no checksum validation).`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`LFS asset preflight failed: ${error.message}`);
  process.exitCode = 1;
}
