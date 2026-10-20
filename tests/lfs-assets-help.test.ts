import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const checkout = resolve(import.meta.dirname, "..");
const checker = join(checkout, "scripts/check-lfs-assets.mjs");
const helpFlags = ["--help", "-h"];

function fixture(t: TestContext) {
  const tempRoot = resolve(tmpdir());
  const prefix = "strahov-lfs-help-";
  const base = mkdtempSync(join(tempRoot, prefix));
  t.after(() => {
    assert.equal(dirname(resolve(base)), tempRoot);
    assert.ok(basename(base).startsWith(prefix));
    rmSync(base, { recursive: true, force: true, maxRetries: 3 });
  });
  return base;
}

function run(args: string[], cwd: string, emptyPath = false) {
  // Windows treats Path/PATH as the same variable. Remove every spelling
  // before setting an empty PATH, plus inherited Git state and Node preloads.
  const env = Object.fromEntries(Object.entries(process.env).filter(
    ([key]) => !/^(GIT_|NODE_OPTIONS$)/i.test(key) && !(emptyPath && /^PATH$/i.test(key)),
  ));
  if (emptyPath) env.PATH = "";
  const result = spawnSync(process.execPath, [checker, ...args], {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
  assert.equal(result.error, undefined, "CLI must start and finish");
  assert.equal(result.signal, null, "CLI must exit normally");
  return result;
}

for (const flag of helpFlags) {
  for (const outsideCheckout of [false, true]) {
    for (const emptyPath of [false, true]) {
      test(`${flag} shows help ${outsideCheckout ? "outside Git" : "in the checkout"} with ${emptyPath ? "empty" : "inherited"} PATH`, (t) => {
        const cwd = outsideCheckout ? fixture(t) : checkout;
        const result = run([flag], cwd, emptyPath);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(result.stderr, "");
        assert.match(result.stdout, /usage:.*check-lfs-assets\.mjs/i);
        assert.match(result.stdout, /--help/);
        assert.match(result.stdout, /-h\b/);
        assert.match(result.stdout, /--root\s+(?:DIR|PATH)/);
        assert.match(result.stdout, /default[^\n]*current working directory/i);
        assert.match(result.stdout, /must be the Git checkout root/i);
        assert.match(result.stdout, /--root[^\n]*checkout[^\n]*instead/i);
        assert.match(result.stdout, /file sizes/i);
        assert.match(result.stdout, /unmaterialized LFS pointers/i);
        assert.match(result.stdout, /no checksum validation/i);
        assert.match(result.stdout, /no assets are downloaded/i);
        assert.match(result.stdout, /only argument/i);
      });
    }
  }
}

const invalidArgs = [
  ["--unknown"],
  ["--root"],
  ["unexpected-positional"],
  ["--help", "-h"],
  ["-h", "--help"],
  ...helpFlags.flatMap((flag) => [
    [flag, "--root", checkout],
    ["--root", checkout, flag],
    [flag, "--unknown"],
    ["--unknown", flag],
    [flag, "unexpected-positional"],
    ["unexpected-positional", flag],
    [flag, flag],
  ]),
];

for (const args of invalidArgs) {
  test(`rejects invalid or mixed help arguments: ${args.join(" ")}`, (t) => {
    const result = run(args, fixture(t), true);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Invalid arguments\. Usage:/);
    assert.match(result.stderr, /check-lfs-assets\.mjs \[--root DIR\]/);
  });
}
