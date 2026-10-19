import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const checker = resolve(import.meta.dirname, "../scripts/check-lfs-assets.mjs");
const contentMarker = "LFS_FIXTURE_CONTENT_MUST_NOT_APPEAR_IN_DIAGNOSTICS";
const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");

const write = (file: string, contents: string | Buffer) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
};

// Do not inherit a caller's Git repository, filters, hooks, or Node preload.
// Every repository is temporary and has its own identity; no LFS transfer runs.
const isolatedEnv = (base: string): NodeJS.ProcessEnv => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(GIT_|NODE_OPTIONS$)/i.test(key),
    ),
  );
  return {
    ...env,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: join(base, "empty-gitconfig"),
    GIT_LFS_SKIP_SMUDGE: "1",
    GIT_TERMINAL_PROMPT: "0",
  };
};

const fixture = (t: TestContext, repository = true) => {
  const base = mkdtempSync(join(tmpdir(), "strahov-lfs-preflight-"));
  assert.equal(dirname(resolve(base)), resolve(tmpdir()));
  t.after(() => {
    assert.equal(dirname(resolve(base)), resolve(tmpdir()));
    rmSync(base, { recursive: true, force: true, maxRetries: 3 });
  });
  const root = join(base, "repository with spaces");
  mkdirSync(root);
  write(join(base, "empty-gitconfig"), "");
  const env = isolatedEnv(base);
  const git = (args: string[], input?: string | Buffer) => {
    const result = spawnSync("git", ["-C", root, ...args], {
      env,
      input,
      encoding: "utf8",
      windowsHide: true,
      timeout: 15_000,
    });
    assert.equal(result.error, undefined, "fixture Git process must start");
    assert.equal(result.status, 0, `fixture Git ${args[0]}: ${result.stderr}`);
    return result.stdout;
  };
  const stage = (name: string, contents: string | Buffer) => {
    const oid = git(["hash-object", "-w", "--stdin"], contents).trim();
    git(["update-index", "--add", "--cacheinfo", "100644", oid, name]);
  };
  const commit = () =>
    git(["commit", "--quiet", "--no-gpg-sign", "-m", "LFS fixture"]);
  const inventory = () => JSON.parse(git(["lfs", "ls-files", "--json", "HEAD"]));
  if (repository) {
    git(["init", "--quiet", "--template="]);
    git(["config", "user.name", "LFS fixture"]);
    git(["config", "user.email", "lfs-fixture@example.invalid"]);
    git(["config", "core.hooksPath", join(base, "no-hooks")]);
    const attributes = "* -text\n*.bin filter=lfs diff=lfs merge=lfs -text\n";
    write(join(root, ".gitattributes"), attributes);
    stage(".gitattributes", attributes);
  }
  return { base, root, env, git, stage, commit, inventory };
};
type Fixture = ReturnType<typeof fixture>;

const pointer = (bytes: Buffer, eol = "\n") =>
  [
    "version https://git-lfs.github.com/spec/v1",
    `oid sha256:${sha256(bytes)}`,
    `size ${bytes.length}`,
    "",
  ].join(eol);

const asset = (repo: Fixture, name = "assets/model.bin", size = 2048) => {
  const bytes = Buffer.alloc(size, 0x5a);
  bytes.write(contentMarker.slice(0, size));
  repo.stage(name, pointer(bytes));
  write(join(repo.root, name), bytes);
  return { name, bytes };
};

const run = (
  repo: Fixture,
  args = ["--root", repo.root],
  env: NodeJS.ProcessEnv = repo.env,
  cwd = repo.base,
) => {
  const result = spawnSync(process.execPath, [checker, ...args], {
    cwd,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: 15_000,
  });
  assert.equal(result.error, undefined, "preflight process must start and finish");
  assert.equal(result.signal, null, "preflight must exit normally");
  const output = result.stdout + result.stderr;
  assert.ok(!output.includes(contentMarker), "diagnostics must not print asset contents");
  return { ...result, output };
};
const fileCount = (output: string, count: number) => {
  assert.match(
    output,
    new RegExp(`(?:\\b${count}\\b[^\\n]*\\bfiles?\\b|\\bfiles?\\b[^\\n]*\\b${count}\\b)`, "i"),
  );
};
const success = (result: ReturnType<typeof run>, count: number) => {
  assert.equal(result.status, 0, result.output);
  fileCount(result.output, count);
};
const failure = (result: ReturnType<typeof run>, reason: RegExp, name?: string) => {
  assert.notEqual(result.status, 0, "unready assets or incomplete inventory must fail");
  assert.match(result.output, reason);
  if (name) {
    assert.ok(result.output.includes(name), `diagnostic must identify ${name}: ${result.output}`);
  }
};

// Override only the external LFS inventory command for impossible/malformed
// upstream output. Git executes this shell helper on both Git for Windows and
// POSIX; ordinary scenarios above/below use the installed Git LFS binary.
const inventoryEnv = (repo: Fixture, output: string, exitCode = 0) => {
  const bin = join(repo.base, "git-exec");
  mkdirSync(bin, { recursive: true });
  const quoted = `'${output.replaceAll("'", "'\\''")}'`;
  writeFileSync(
    join(bin, "git-lfs"),
    `#!/bin/sh\nprintf '%s\\n' ${quoted}\nexit ${exitCode}\n`,
    { mode: 0o755 },
  );
  return { ...repo.env, GIT_EXEC_PATH: bin };
};

test("accepts materialized files with spaces and Unicode without a local LFS cache", (t) => {
  const repo = fixture(t);
  const item = asset(repo, "assets/žluťoučký model.bin");
  repo.commit();
  const files = repo.inventory().files;
  assert.equal(files.length, 1);
  assert.equal(files[0].name, item.name);
  assert.equal(files[0].downloaded, false);
  success(run(repo), 1);
  assert.deepEqual(readFileSync(join(repo.root, item.name)), item.bytes);
  assert.equal(repo.inventory().files[0].downloaded, false, "preflight must not fill the cache");
});

test("defaults to the current checkout and reports an empty committed inventory", (t) => {
  const repo = fixture(t);
  repo.commit();
  assert.deepEqual(repo.inventory().files ?? [], []);
  success(run(repo, [], repo.env, repo.root), 0);
});

test("accepts the documented files:null representation of an empty inventory", (t) => {
  const repo = fixture(t);
  repo.commit();
  success(run(repo, undefined, inventoryEnv(repo, '{"files":null}')), 0);
});

for (const [label, eol] of [["LF", "\n"], ["CRLF", "\r\n"]]) {
  test(`rejects a ${label} pointer even when its length equals the declared asset size`, (t) => {
    const repo = fixture(t);
    let size = 1;
    while (Buffer.byteLength(pointer(Buffer.alloc(size), eol)) !== size) {
      size = Buffer.byteLength(pointer(Buffer.alloc(size), eol));
    }
    const bytes = Buffer.alloc(size);
    const name = "assets/unmaterialized model.bin";
    const text = pointer(bytes, eol);
    repo.stage(name, pointer(bytes));
    write(join(repo.root, name), text);
    repo.commit();
    repo.git(["lfs", "pointer", "--check", "--stdin", "--no-strict"], text);
    assert.equal(repo.inventory().files[0].checkout, true, "size alone misleadingly reports checkout=true");
    failure(run(repo), /pointer/i, name);
    assert.equal(readFileSync(join(repo.root, name), "utf8"), text);
  });
}

test("rejects a missing working file even when its LFS cache object exists", (t) => {
  const repo = fixture(t);
  const item = asset(repo);
  repo.commit();
  const oid = sha256(item.bytes);
  const cache = join(repo.root, ".git", "lfs", "objects", oid.slice(0, 2), oid.slice(2, 4), oid);
  write(cache, item.bytes);
  rmSync(join(repo.root, item.name));
  assert.equal(repo.inventory().files[0].downloaded, true);
  failure(run(repo), /missing|not found|ENOENT/i, item.name);
  assert.equal(existsSync(join(repo.root, item.name)), false, "preflight must not checkout an asset");
  assert.deepEqual(readFileSync(cache), item.bytes);
});

test("reports each mismatched path in a multiple-file inventory", (t) => {
  const repo = fixture(t);
  const first = asset(repo, "assets/short.bin");
  const second = asset(repo, "assets/long.bin");
  repo.commit();
  write(join(repo.root, first.name), first.bytes.subarray(0, first.bytes.length - 1));
  write(join(repo.root, second.name), Buffer.concat([second.bytes, Buffer.from([0])]));
  const result = run(repo);
  failure(result, /size|length/i, first.name);
  failure(result, /size|length/i, second.name);
  fileCount(result.output, 2);
});

test("uses HEAD declarations when a staged pointer claims the changed file size", (t) => {
  const repo = fixture(t);
  const item = asset(repo);
  repo.commit();
  const changed = Buffer.concat([item.bytes, Buffer.from([1, 2, 3])]);
  repo.stage(item.name, pointer(changed));
  write(join(repo.root, item.name), changed);
  assert.equal(repo.inventory().files[0].size, item.bytes.length);
  const index = readFileSync(join(repo.root, ".git", "index"));
  failure(run(repo), /size|length/i, item.name);
  assert.deepEqual(readFileSync(join(repo.root, ".git", "index")), index);
});

test("rejects a directory occupying an asset path", (t) => {
  const repo = fixture(t);
  const item = asset(repo);
  repo.commit();
  rmSync(join(repo.root, item.name));
  mkdirSync(join(repo.root, item.name));
  failure(run(repo), /regular|directory|file type/i, item.name);
});

test("rejects an asset escaping the checkout through a directory link", (t) => {
  const repo = fixture(t);
  const item = asset(repo, "linked/model.bin");
  repo.commit();
  rmSync(join(repo.root, item.name));
  rmdirSync(join(repo.root, "linked"));
  const outside = join(repo.base, "outside");
  write(join(outside, "model.bin"), item.bytes);
  symlinkSync(outside, join(repo.root, "linked"), process.platform === "win32" ? "junction" : "dir");
  failure(run(repo), /outside|escape|symbolic|symlink|path/i, item.name);
});

test("does not claim checksum validation for a same-size non-pointer file", (t) => {
  const repo = fixture(t);
  const item = asset(repo);
  repo.commit();
  write(join(repo.root, item.name), Buffer.alloc(item.bytes.length, 0x42));
  success(run(repo), 1);
});

test("fails closed when HEAD does not exist", (t) => {
  const repo = fixture(t);
  failure(run(repo), /HEAD|Git|inventory|repository/i);
});

test("fails closed for a root outside a Git repository", (t) => {
  const repo = fixture(t, false);
  failure(run(repo), /Git|inventory|repository/i);
});

test("fails closed for a missing root", (t) => {
  const repo = fixture(t, false);
  failure(run(repo, ["--root", join(repo.base, "missing")]), /root|directory|ENOENT|not found/i);
});

for (const args of [["--unknown"], ["--root"], ["unexpected-positional"]]) {
  test(`rejects invalid arguments: ${args.join(" ")}`, (t) => {
    const repo = fixture(t, false);
    failure(run(repo, args), /usage|argument|option|--root/i);
  });
}

for (const invalid of ["not JSON", "{}", '{"files":{}}']) {
  test(`fails closed for malformed inventory: ${invalid}`, (t) => {
    const repo = fixture(t);
    repo.commit();
    failure(run(repo, undefined, inventoryEnv(repo, invalid)), /JSON|inventory|files|invalid/i);
  });
}

test("fails closed when Git LFS exits unsuccessfully", (t) => {
  const repo = fixture(t);
  repo.commit();
  failure(run(repo, undefined, inventoryEnv(repo, "LFS fixture failure", 7)), /LFS|Git|inventory/i);
});

test("rejects unsafe relative inventory paths before accessing outside files", (t) => {
  const repo = fixture(t);
  repo.commit();
  const bytes = Buffer.from(contentMarker);
  write(join(repo.base, "outside.bin"), bytes);
  const name = "../outside.bin";
  const json = JSON.stringify({ files: [{
    name,
    size: bytes.length,
    oid: sha256(bytes),
    oid_type: "sha256",
    version: "https://git-lfs.github.com/spec/v1",
    checkout: true,
    downloaded: false,
  }] });
  failure(run(repo, undefined, inventoryEnv(repo, json)), /path|relative|outside|invalid/i, name);
});
