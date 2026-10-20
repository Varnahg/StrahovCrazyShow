import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createReadStream } from "node:fs";
import { lstat, readFile } from "node:fs/promises";
import { canonicalJson, digest, problem } from "./store.mjs";
import { execute } from "./github.mjs";

const execFileAsync = promisify(execFile);
export const slash = (value) => value.replaceAll("\\", "/");
const normal = (value) => slash(value).replace(/\/$/, "").toLowerCase();
export function inScope(file, scopes) {
  return scopes.some(
    (scope) =>
      normal(file) === normal(scope) ||
      (scope.endsWith("/") && normal(file).startsWith(`${normal(scope)}/`)),
  );
}
export const overlap = (a, b) =>
  normal(a) === normal(b) ||
  normal(a).startsWith(`${normal(b)}/`) ||
  normal(b).startsWith(`${normal(a)}/`);
export const git = async (cwd, ...args) =>
  (await execute("git", ["-C", cwd, ...args], { cwd })).stdout;
export const nul = (text) => text.split("\0").filter(Boolean);
export const samePath = (a, b) => normal(path.resolve(a)) === normal(path.resolve(b));

export function parseDirty(text) {
  const records = text.split("\0"),
    paths = [];
  for (let i = 0; i < records.length; i++) {
    if (!records[i]) continue;
    if (records[i].length < 4)
      throw problem("GIT_STATUS", "Invalid porcelain status record");
    paths.push(records[i].slice(3));
    if (/[RC]/.test(records[i].slice(0, 2))) {
      if (!records[i + 1])
        throw problem("GIT_STATUS", "Incomplete rename record");
      paths.push(records[++i]);
    }
  }
  return [...new Set(paths)].sort();
}

export async function safePath(root, relative) {
  if (
    typeof relative !== "string" ||
    !relative ||
    relative.startsWith("/") ||
    /[\\:\x00-\x1f]/.test(relative) ||
    relative
      .split("/")
      .some(
        (part) =>
          part === ".." || part === "." || part.toLowerCase() === ".git",
      )
  )
    throw problem("UNSAFE_PATH", `Unsafe checkout path: ${relative}`);
  const parts = relative.replace(/\/$/, "").split("/");
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if (error.code === "ENOENT") break;
      throw error;
    }
    if (stat.isSymbolicLink())
      throw problem(
        "UNSAFE_PATH",
        `Symlink/junction is not an authorized output: ${relative}`,
      );
    if (!stat.isFile() && !stat.isDirectory())
      throw problem("UNSAFE_PATH", `Nonregular checkout output: ${relative}`);
  }
  return path.join(root, ...parts);
}

async function hashFile(file) {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest("hex");
}

export async function ignoredSnapshot(root) {
  const files = nul(
    await git(
      root,
      "ls-files",
      "--others",
      "--ignored",
      "--exclude-standard",
      "-z",
    ),
  );
  const result = {};
  for (const file of files.sort()) {
    const absolute = await safePath(root, file),
      stat = await lstat(absolute);
    if (!stat.isFile())
      throw problem(
        "UNSAFE_PATH",
        `Ignored output is not a regular file: ${file}`,
      );
    result[file] = {
      sha256: await hashFile(absolute),
      mode: stat.mode & 0o777,
    };
  }
  return result;
}

export async function auditScope(root, scopes, baselineIgnored = {}) {
  const changed = parseDirty(
    await git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all"),
  );
  const ignored = await ignoredSnapshot(root);
  const ignoredChanges = [
    ...new Set([...Object.keys(ignored), ...Object.keys(baselineIgnored)]),
  ].filter(
    (file) =>
      canonicalJson(ignored[file] ?? null) !==
      canonicalJson(baselineIgnored[file] ?? null),
  );
  const all = [...new Set([...changed, ...ignoredChanges])];
  for (const file of all) {
    if (!inScope(file, scopes))
      throw problem(
        "SCOPE_VIOLATION",
        `Changed path outside reserved task scopes: ${file}`,
      );
    await safePath(root, file);
  }
  for (const scope of scopes) await safePath(root, scope);
  return { changed, ignoredChanges, ignored };
}

export async function workingSnapshot(root) {
  const ignored = await ignoredSnapshot(root);
  const files = parseDirty(
    await git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all"),
  );
  const result = { ...ignored };
  for (const file of files) {
    const absolute = await safePath(root, file);
    try {
      const stat = await lstat(absolute);
      result[file] = {
        sha256: await hashFile(absolute),
        mode: stat.mode & 0o777,
      };
    } catch (error) {
      if (error.code === "ENOENT") result[file] = null;
      else throw error;
    }
  }
  return result;
}

export function assertStageScope(before, after, allowed) {
  for (const file of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (
      (canonicalJson(before[file] ?? null) !==
        canonicalJson(after[file] ?? null) ||
        Object.hasOwn(before, file) !== Object.hasOwn(after, file)) &&
      !inScope(file, allowed)
    )
      throw problem(
        "STAGE_SCOPE",
        `This stage changed another owner's path: ${file}`,
      );
  }
}

export async function sourceIdentity(root, baseSha, scopes) {
  const tracked = await git(
    root,
    "--literal-pathspecs",
    "diff",
    "--binary",
    "--no-ext-diff",
    "--no-textconv",
    "--no-renames",
    baseSha,
    "--",
    ...scopes,
  );
  const untracked = nul(
    await git(root, "ls-files", "--others", "--exclude-standard", "-z"),
  ).filter((file) => inScope(file, scopes));
  const changed = nul(
    await git(
      root,
      "--literal-pathspecs",
      "diff",
      "--name-only",
      "-z",
      "--no-renames",
      baseSha,
      "--",
      ...scopes,
    ),
  );
  const files = [...new Set([...changed, ...untracked])].sort(),
    entries = [];
  const indexModes = new Map(
    nul(
      await git(
        root,
        "--literal-pathspecs",
        "ls-files",
        "--stage",
        "-z",
        "--",
        ...scopes,
      ),
    ).map((record) => {
      const separator = record.indexOf("\t");
      return [record.slice(separator + 1), record.slice(0, 6)];
    }),
  );
  let display = tracked;
  for (const file of files) {
    const absolute = await safePath(root, file);
    let stat;
    try {
      stat = await lstat(absolute);
    } catch (error) {
      if (error.code === "ENOENT") {
        entries.push({ file, deleted: true });
        continue;
      }
      throw error;
    }
    const bytes = await readFile(absolute);
    entries.push({
      file,
      mode: stat.mode & 0o111 ? "100755" : "100644",
      indexMode:
        indexModes.get(file) ?? (stat.mode & 0o111 ? "100755" : "100644"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    if (untracked.includes(file)) {
      // Use Git's native unified/binary diff without staging a temporary index.
      try {
        display += (
          await execFileAsync(
            "git",
            [
              "diff",
              "--no-index",
              "--binary",
              "--no-ext-diff",
              "--no-textconv",
              "--",
              "/dev/null",
              file,
            ],
            {
              cwd: root,
              windowsHide: true,
              encoding: "utf8",
              timeout: 30_000,
              maxBuffer: 32 * 1024 * 1024,
            },
          )
        ).stdout;
      } catch (error) {
        if (
          error.code === 1 &&
          typeof error.stdout === "string" &&
          error.stdout.startsWith("diff --git ")
        )
          display += error.stdout;
        else throw error;
      }
    }
  }
  const identity = { baseSha, files: entries };
  return { digest: digest(identity), baseSha, diff: display, identity };
}
