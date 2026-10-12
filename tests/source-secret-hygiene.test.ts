import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const scanner = resolve(
  import.meta.dirname,
  "../scripts/check-source-secrets.mjs",
);
// Synthetically assembled; never commit a key-shaped literal in the test source.
const candidate = "AI" + "za" + "Q".repeat(35);
const git = (root: string, ...args: string[]) => {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, "fixture Git command failed");
};
const fixture = (t: { after: (fn: () => void) => void }, repository = true) => {
  const root = mkdtempSync(join(tmpdir(), "source-secret-guard-"));
  assert.equal(
    dirname(resolve(root)),
    resolve(tmpdir()),
    "fixture cleanup stays in the temporary directory",
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (repository) git(root, "init", "--quiet");
  return root;
};
const write = (root: string, name: string, content: string | Buffer) => {
  const path = join(root, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
};
const scan = (root: string, extra: string[] = []) => {
  const result = spawnSync(
    process.execPath,
    [scanner, "--root", root, ...extra],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.error, undefined, "scanner process must start");
  assert.ok(
    !(result.stdout + result.stderr).includes(candidate),
    "scanner diagnostics must never print key values",
  );
  return result;
};

test("detects tracked and untracked HTML candidates with CRLF and no final newline", (t) => {
  const root = fixture(t);
  write(
    root,
    "tracked.html",
    `first\r\n<script src="https://maps.googleapis.com/maps/api/js?key=${candidate}"></script>\r\n`,
  );
  git(root, "add", "--", "tracked.html");
  write(root, "docs/new snapshot.html", `clean\nclean\nkey=${candidate}`);
  const result = scan(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"tracked\.html":2: Google API key candidate/);
  assert.match(
    result.stderr,
    /"docs\/new snapshot\.html":3: Google API key candidate/,
  );
  assert.match(result.stdout, /2 candidate locations/);
  assert.ok(!result.stderr.includes("<script"), "no source excerpts");
});

test("accepts sanitized references and clean code without dependencies or docs fixtures", (t) => {
  const root = fixture(t);
  write(
    root,
    "source.html",
    '<script data-src="https://maps.googleapis.com/maps/api/js?key=[REDACTED]"></script>',
  );
  write(root, "code.ts", "export const value = 1;\n");
  const result = scan(root);
  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.match(result.stdout, /Scanned 2 recognized text files/);
  assert.match(result.stdout, /not history or all secret types/);
});

test("includes tracked ignored files and env files but excludes untracked ignored and binary formats", (t) => {
  const root = fixture(t);
  write(root, ".gitignore", "ignored/\n");
  write(root, "ignored/tracked.json", `{\"key\":\"${candidate}\"}`);
  git(root, "add", "--force", "--", "ignored/tracked.json");
  write(root, "ignored/untracked.html", candidate);
  write(root, "asset.glb", candidate);
  write(root, ".env.example", `EXAMPLE=${candidate}`);
  const result = scan(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /"ignored\/tracked\.json":1/);
  assert.match(result.stderr, /"\.env\.example":1/);
  assert.ok(!result.stderr.includes("untracked.html"));
  assert.ok(!result.stderr.includes("asset.glb"));
  assert.match(result.stdout, /1 other-format entries excluded/);
});

test("redacts key-shaped filenames as well as file contents", (t) => {
  const root = fixture(t);
  write(root, `${candidate}.txt`, candidate);
  const result = scan(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /\[REDACTED_GOOGLE_API_KEY\]\.txt/);
});

test("fails closed when a tracked recognized source cannot be read", (t) => {
  const root = fixture(t);
  write(root, "missing.html", "clean");
  git(root, "add", "--", "missing.html");
  rmSync(join(root, "missing.html"));
  const result = scan(root);
  assert.equal(result.status, 2);
  assert.match(
    result.stderr,
    /Cannot scan recognized text file "missing\.html"; scan incomplete/,
  );
  assert.ok(!result.stdout.includes("Scanned"));
});

test("fails closed for unsupported binary content in a recognized text format", (t) => {
  const root = fixture(t);
  write(root, "binary.txt", Buffer.from(`\0${candidate}`));
  const result = scan(root);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Cannot scan recognized text file "binary\.txt"/);
});

test("reports inventory and invocation failures without raw command errors", (t) => {
  const root = fixture(t, false);
  const result = scan(root);
  assert.equal(result.status, 2);
  assert.equal(
    result.stderr.trim(),
    "Git source inventory failed; scan incomplete.",
  );
  const invalid = scan(root, [candidate]);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /^Usage:/);
});
