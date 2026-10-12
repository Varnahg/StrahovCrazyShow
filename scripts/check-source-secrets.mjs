/**
 * Narrow, dependency-free guard for Google API key candidates in current source.
 * Scans tracked and untracked/nonignored files with the text extensions below,
 * including archived HTML. It does not scan history, ignored untracked files,
 * unknown/binary formats, archives or submodules, and cannot verify key validity.
 * GitHub secret scanning remains necessary for historical/provider coverage.
 * Usage: node scripts/check-source-secrets.mjs [--root <repository>]
 */
import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";
import { createInterface } from "node:readline";

const textExtensions = new Set([
  ".c",
  ".cc",
  ".cjs",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".graphql",
  ".h",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsonc",
  ".jsonl",
  ".jsx",
  ".kt",
  ".less",
  ".log",
  ".lua",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".php",
  ".ps1",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsv",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);
const textNames = new Set([
  ".gitattributes",
  ".gitignore",
  ".gitmodules",
  ".npmrc",
  ".nvmrc",
  ".prettierignore",
  "dockerfile",
  "makefile",
]);
const candidatePattern = /AIza[0-9A-Za-z_-]{35}/g;

// Even a file name can contain sensitive text or terminal control characters.
const safePath = (file) =>
  JSON.stringify(file.replace(candidatePattern, "[REDACTED_GOOGLE_API_KEY]"));
const isText = (file) => {
  const name = basename(file).toLowerCase();
  return (
    textExtensions.has(extname(name)) ||
    textNames.has(name) ||
    name === ".env" ||
    name.startsWith(".env.")
  );
};
const git = (root, args) => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0)
    throw new Error("Git source inventory failed; scan incomplete.");
  return result.stdout;
};

async function scanFile(root, file) {
  const path = resolve(root, file);
  const fromRoot = relative(root, path);
  if (
    isAbsolute(fromRoot) ||
    fromRoot === ".." ||
    fromRoot.startsWith("../") ||
    fromRoot.startsWith("..\\")
  )
    throw new Error(
      "Source inventory contains an invalid path; scan incomplete.",
    );
  try {
    // Do not follow links outside the source inventory or silently ignore errors.
    if (!(await lstat(path)).isFile()) throw new Error("not a regular file");
    const input = createReadStream(path, { encoding: "utf8" });
    const lines = createInterface({ input, crlfDelay: Infinity });
    let lineNumber = 0;
    const findings = [];
    try {
      for await (const line of lines) {
        lineNumber++;
        if (line.includes("\0")) throw new Error("unsupported text encoding");
        // Only a location is retained; no secret or surrounding source text.
        candidatePattern.lastIndex = 0;
        if (candidatePattern.test(line)) findings.push(lineNumber);
      }
    } finally {
      lines.close();
      input.destroy();
    }
    return findings;
  } catch {
    throw new Error(
      `Cannot scan recognized text file ${safePath(file)}; scan incomplete.`,
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 0 && (args.length !== 2 || args[0] !== "--root"))
    throw new Error(
      "Usage: node scripts/check-source-secrets.mjs [--root <repository>]",
    );
  const requestedRoot = resolve(args[1] ?? process.cwd());
  const root = resolve(
    git(requestedRoot, ["rev-parse", "--show-toplevel"]).trim(),
  );
  const files = [
    ...new Set(
      git(root, [
        "ls-files",
        "-z",
        "--cached",
        "--others",
        "--exclude-standard",
      ])
        .split("\0")
        .filter(Boolean),
    ),
  ].sort();
  let scanned = 0;
  let locations = 0;
  for (const file of files) {
    if (!isText(file)) continue;
    const findings = await scanFile(root, file);
    scanned++;
    for (const line of findings) {
      console.error(`${safePath(file)}:${line}: Google API key candidate`);
      locations++;
    }
  }
  console.log(
    `Scanned ${scanned} recognized text files; ${files.length - scanned} other-format entries excluded; ${locations} candidate locations.`,
  );
  console.log(
    "Scope: current tracked + nonignored untracked text files; not history or all secret types.",
  );
  return locations ? 1 : 0;
}

try {
  process.exitCode = await main();
} catch (error) {
  // Errors are generated here; never forward Git stderr, file content or stacks.
  console.error(error.message);
  process.exitCode = 2;
}
