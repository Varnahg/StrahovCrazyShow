import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const checker = resolve(import.meta.dirname, "../scripts/check-lfs-assets.mjs");

// The original recovery tests stay byte-identical. These additional fixtures
// exercise gaps found by independent review, without importing a test module.
function fixture(t: TestContext, trailingSpace = false) {
  const base = mkdtempSync(join(tmpdir(), "strahov-lfs-review-"));
  assert.equal(dirname(resolve(base)), resolve(tmpdir()));
  t.after(() => {
    assert.equal(dirname(resolve(base)), resolve(tmpdir()));
    rmSync(base, { recursive: true, force: true, maxRetries: 3 });
  });
  const root = join(base, trailingSpace ? "checkout " : "checkout");
  mkdirSync(root);
  const config = join(base, "empty-gitconfig");
  writeFileSync(config, "");
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(GIT_|NODE_OPTIONS$)/i.test(key))),
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: config,
    GIT_LFS_SKIP_SMUDGE: "1", GIT_TERMINAL_PROMPT: "0",
  };
  function git(args: string[], input?: string) {
    const result = spawnSync("git", ["-C", root, ...args], {
      env, input, encoding: "utf8", windowsHide: true, timeout: 15_000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  git(["init", "--quiet", "--template="]);
  git(["config", "user.name", "LFS review fixture"]);
  git(["config", "user.email", "lfs-review@example.invalid"]);
  git(["config", "core.hooksPath", join(base, "no-hooks")]);
  return {
    root,
    git,
    check() {
      return spawnSync(process.execPath, [checker, "--root", root], {
        env, encoding: "utf8", windowsHide: true, timeout: 15_000,
      });
    },
    commit() { git(["commit", "--quiet", "--allow-empty", "--no-gpg-sign", "-m", "fixture"]); },
  };
}

for (const size of [64, 1024]) {
  test(`accepts a materialized non-pointer ${size}-byte LFS asset`, (t) => {
    const repo = fixture(t);
    const bytes = Buffer.alloc(size, 0x42);
    const pointer = `version https://git-lfs.github.com/spec/v1\noid sha256:${createHash("sha256").update(bytes).digest("hex")}\nsize ${size}\n`;
    const oid = repo.git(["hash-object", "-w", "--stdin"], pointer);
    repo.git(["update-index", "--add", "--cacheinfo", "100644", oid, "small.bin"]);
    repo.commit();
    writeFileSync(join(repo.root, "small.bin"), bytes);
    const result = repo.check();
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /1 files ready/);
    assert.deepEqual(readFileSync(join(repo.root, "small.bin")), bytes);
  });
}

test("preserves a trailing space in a valid POSIX checkout path", { skip: process.platform === "win32" }, (t) => {
  const repo = fixture(t, true);
  repo.commit();
  const result = repo.check();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /0 files ready/);
});
