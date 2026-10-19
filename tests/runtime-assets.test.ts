import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const script = join(root, "scripts/check-runtime-assets.mjs");
const cache = join(root, ".cache/docker-packaging-tests");
const pointer =
  "version https://git-lfs.github.com/spec/v1\n" +
  `oid sha256:${"a".repeat(64)}\nsize 1048576\n`;

async function fixture(run: (directory: string) => Promise<void>) {
  await mkdir(cache, { recursive: true });
  const directory = await mkdtemp(join(cache, "assets-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function check(directory: string) {
  return spawnSync(process.execPath, [script, directory], {
    cwd: root,
    encoding: "utf8",
    timeout: 10000,
  });
}

test("runtime asset check accepts actual binary files and ordinary text", async () => {
  await fixture(async (directory) => {
    await mkdir(join(directory, "models"));
    await writeFile(
      join(directory, "models/real.glb"),
      Buffer.from("glTF\0binary"),
    );
    await writeFile(
      join(directory, "credits.txt"),
      "Source file example:\n" + pointer,
    );
    await writeFile(join(directory, "empty.txt"), "");
    const result = check(directory);
    assert.equal(result.status, 0, result.stderr || String(result.error));
    assert.match(result.stdout, /checked 3 files; no Git LFS pointers/);
  });
});

test("runtime asset check reports every nested LFS pointer and the recovery command", async () => {
  await fixture(async (directory) => {
    await mkdir(join(directory, "models/nested"), { recursive: true });
    await writeFile(join(directory, "models/a.glb"), pointer);
    await writeFile(
      join(directory, "models/nested/b.glb"),
      pointer.replaceAll("\n", "\r\n"),
    );
    const result = check(directory);
    assert.equal(result.status, 1, String(result.error));
    assert.match(result.stderr, /Unresolved Git LFS pointers/);
    assert.match(result.stderr, /models\/a\.glb/);
    assert.match(result.stderr, /models\/nested\/b\.glb/);
    assert.match(result.stderr, /git lfs pull/);
    assert.equal(result.stdout, "");
  });
});

test("runtime asset check fails when the public directory is missing", async () => {
  await fixture(async (directory) => {
    const result = check(join(directory, "missing-public"));
    assert.equal(result.status, 1, String(result.error));
    assert.match(result.stderr, /ENOENT/);
    assert.equal(result.stdout, "");
  });
});
