import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const freezer = await readFile(
  new URL("../scripts/performance-snapshot.mjs", import.meta.url),
);
// These real static inputs are read by diagnostics-report and feedback-
// deployment regressions after the full test tree has been frozen.
const consumerInputs = [
  "docs/performance/evidence/diagnostic-identity-20261020/input.jsonl",
  "Dockerfile",
  "compose.yaml",
];
const consumerBytes = Object.fromEntries(await Promise.all(
  consumerInputs.map(async file => [file, await readFile(new URL("../" + file, import.meta.url))] as const),
));
const prerequisites = [
  "AGENTS.md",
  "docs/agents/bmad-policy.md",
  ".agents/skills/bmad-build/step-02-plan.md",
  ".agents/skills/bmad-build/spec-template.md",
  "patches/@babylonjs__core@9.30.0.patch",
  "patches/nested/additional.patch",
  ...consumerInputs,
];
const excluded = [
  "docs/verification.md",
  "docs/agents/current-work.md",
  "docs/performance/evidence/diagnostic-identity-20261020/live-report.json",
  "docs/performance/evidence/diagnostic-identity-20261020/unrelated.jsonl",
  ".agents/skills/unrelated/SKILL.md",
  "assets/blender/master.blend1",
  "assets/__pycache__/cached.pyc",
];
const reference = "public/models/photogrammetry/tile.bin";
const sha = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
type Fixture = { root: string; inputs: Record<string, Buffer> };
type Manifest = {
  snapshotId: string;
  files: Record<string, string>;
  referenceReuse?: {
    snapshotId: string;
    sourceManifestSha256: string;
    root: string;
    files: number;
  };
};

async function fixture(t: TestContext): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), "strahov-freezer-"));
  assert.equal(dirname(root), resolve(tmpdir()));
  assert.ok(basename(root).startsWith("strahov-freezer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputs: Record<string, Buffer> = {
    "client/game.ts": Buffer.from("export const game = true;\n"),
    "server/index.ts": Buffer.from("export const server = true;\n"),
    "shared/world.ts": Buffer.from("export const world = true;\n"),
    [reference]: Buffer.from([0, 255, 13, 10, 7]),
    "assets/blender/master.blend": Buffer.from("small authored master\n"),
    "scripts/performance-snapshot.mjs": freezer,
    "tests/preserved.test.ts": Buffer.from("export const regression = true;\n"),
    "docs/reality-pack/landmarks/geometry-source.json": Buffer.from("{}\n"),
    "docs/reality-pack/building-window-kit-20261012/blender-export-audit.json":
      Buffer.from("{}\n"),
    "docs/reality-pack/b4-facade-panels-20261012/blender-export-audit.json":
      Buffer.from("{}\n"),
    "docs/building-modeling-20261012/references/market-kit-blender-audit.json":
      Buffer.from("{}\n"),
    "index.html": Buffer.from("<!doctype html><title>Fixture</title>\n"),
    "package.json": Buffer.from('{"type":"module"}\n'),
    "pnpm-lock.yaml": Buffer.from("lockfileVersion: '9.0'\n"),
    "pnpm-workspace.yaml": Buffer.from(
      "patchedDependencies:\n  '@babylonjs/core@9.30.0': patches/@babylonjs__core@9.30.0.patch\n",
    ),
    "tsconfig.json": Buffer.from("{}\n"),
    "vite.config.ts": Buffer.from("export default {};\n"),
  };
  for (const file of prerequisites)
    inputs[file] = consumerBytes[file] ?? Buffer.from("Statický fixture: " + file + "\r\n");
  for (const [file, bytes] of Object.entries(inputs)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), bytes);
  }
  for (const file of excluded) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), "excluded mutable/local fixture\n");
  }
  await mkdir(join(root, "node_modules"));
  await writeFile(
    join(root, "node_modules/dependency.txt"),
    "shared fixture\n",
  );
  return { root, inputs };
}

const snapshot = (f: Fixture, name: string) =>
  join(f.root, ".cache/performance-snapshot", name);
async function manifest(f: Fixture, name: string): Promise<Manifest> {
  return JSON.parse(
    await readFile(join(snapshot(f, name), "source-manifest.json"), "utf8"),
  );
}
async function run(
  f: Fixture,
  name: string,
  options: { reuse?: string; preload?: string } = {},
) {
  const args = [
    ...(options.preload
      ? ["--import", pathToFileURL(options.preload).href]
      : []),
    "scripts/performance-snapshot.mjs",
    name,
    ...(options.reuse ? ["--reuse-ipr-from", options.reuse] : []),
  ];
  try {
    const result = await execute(process.execPath, args, {
      cwd: f.root,
      windowsHide: true,
      encoding: "utf8",
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    const result = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    if (typeof result.code !== "number") throw error;
    return {
      code: result.code,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  }
}
async function capture(f: Fixture, name: string) {
  const result = await run(f, name);
  assert.equal(result.code, 0, result.stderr);
  return manifest(f, name);
}

test("snapshot CLI copies and hashes static regression/build prerequisites without live documentation", async (t) => {
  const f = await fixture(t);
  const recorded = await capture(f, "complete");
  const expected = Object.fromEntries(
    Object.keys(f.inputs)
      .sort()
      .map((file) => [file, sha(f.inputs[file])]),
  );
  assert.deepEqual(recorded.files, expected);
  assert.equal(recorded.snapshotId, sha(JSON.stringify(expected)));
  for (const file of prerequisites) {
    assert.deepEqual(
      await readFile(join(snapshot(f, "complete"), file)),
      f.inputs[file],
    );
    assert.equal(recorded.files[file], sha(f.inputs[file]), file);
  }
  assert.equal(
    recorded.files["scripts/performance-snapshot.mjs"],
    sha(freezer),
  );
  assert.equal(
    recorded.files["tests/preserved.test.ts"],
    sha(f.inputs["tests/preserved.test.ts"]),
  );
  for (const file of excluded) {
    assert.equal(recorded.files[file], undefined, file);
    await assert.rejects(access(join(snapshot(f, "complete"), file)), {
      code: "ENOENT",
    });
  }
  assert.equal(
    await realpath(join(snapshot(f, "complete"), "node_modules")),
    await realpath(join(f.root, "node_modules")),
  );
  await writeFile(
    join(f.root, "node_modules/dependency.txt"),
    "same shared directory\n",
  );
  assert.equal(
    await readFile(
      join(snapshot(f, "complete"), "node_modules/dependency.txt"),
      "utf8",
    ),
    "same shared directory\n",
  );
});

test("each static prerequisite changes future source identity while earlier snapshots remain immutable", async (t) => {
  const f = await fixture(t),
    first = await capture(f, "original");
  const firstManifest = await readFile(
    join(snapshot(f, "original"), "source-manifest.json"),
  );
  for (const [index, file] of prerequisites.entries()) {
    const changed = Buffer.concat([
      f.inputs[file],
      Buffer.from("changed input\n"),
    ]);
    await writeFile(join(f.root, file), changed);
    const next = await capture(f, "changed-" + index);
    assert.notEqual(next.snapshotId, first.snapshotId, file);
    assert.equal(next.files[file], sha(changed), file);
    assert.deepEqual(
      await readFile(join(snapshot(f, "original"), file)),
      f.inputs[file],
    );
    assert.deepEqual(
      await readFile(join(snapshot(f, "original"), "source-manifest.json")),
      firstManifest,
    );
    await writeFile(join(f.root, file), f.inputs[file]);
  }
  assert.equal((await capture(f, "restored")).snapshotId, first.snapshotId);
});

test("snapshot CLI refuses an existing name without overwriting any frozen bytes", async (t) => {
  const f = await fixture(t);
  await capture(f, "immutable");
  const frozenManifest = await readFile(
    join(snapshot(f, "immutable"), "source-manifest.json"),
  );
  await writeFile(join(f.root, "AGENTS.md"), "later input\n");
  const result = await run(f, "immutable");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /EEXIST/);
  assert.deepEqual(
    await readFile(join(snapshot(f, "immutable"), "source-manifest.json")),
    frozenManifest,
  );
  assert.deepEqual(
    await readFile(join(snapshot(f, "immutable"), "AGENTS.md")),
    f.inputs["AGENTS.md"],
  );
});

for (const file of ["AGENTS.md", ...consumerInputs])
test(`snapshot CLI rejects ${file} mutation during copying before publishing a manifest`, async (t) => {
  const f = await fixture(t);
  const preload = join(f.root, "mutate-freezer.mjs");
  await writeFile(
    preload,
    `
import fsPromises from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { join, resolve } from "node:path";
const input = join(import.meta.dirname, ${JSON.stringify(file)});
const original = fsPromises.cp;
let changed = false;
fsPromises.cp = async function(source, ...args) {
  const result = await Reflect.apply(original, this, [source, ...args]);
  if (!changed && resolve(String(source)) === input) {
    changed = true;
    await fsPromises.writeFile(input, "deterministic mutation after copy\\n");
    process.stderr.write("fixture mutation after static input copy\\n");
  }
  return result;
};
syncBuiltinESMExports();
`,
  );
  const result = await run(f, "interrupted", { preload });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /fixture mutation after static input copy/);
  assert.match(result.stderr, /Sources changed while freezing/);
  assert.equal((await stat(snapshot(f, "interrupted"))).isDirectory(), true);
  await assert.rejects(
    access(join(snapshot(f, "interrupted"), "source-manifest.json")),
    { code: "ENOENT" },
  );
  await assert.rejects(
    access(join(snapshot(f, "interrupted"), "node_modules")),
    { code: "ENOENT" },
  );
  assert.deepEqual(
    await readFile(join(snapshot(f, "interrupted"), file)),
    f.inputs[file],
  );
  const retry = await capture(f, "fresh-attempt");
  assert.equal(
    retry.files[file],
    sha("deterministic mutation after copy\n"),
  );
  await assert.rejects(
    access(join(snapshot(f, "interrupted"), "source-manifest.json")),
    { code: "ENOENT" },
  );
});

test("snapshot CLI rejects each missing consumer input and preserves earlier complete snapshots", async (t) => {
  const f = await fixture(t), original = await capture(f, "before-missing");
  const originalManifest = await readFile(join(snapshot(f, "before-missing"), "source-manifest.json"));
  for (const [index, file] of consumerInputs.entries()) {
    await rm(join(f.root, file));
    try {
      const name = "missing-" + index, result = await run(f, name);
      assert.notEqual(result.code, 0, file);
      assert.match(result.stderr, /ENOENT/);
      await assert.rejects(access(join(snapshot(f, name), "source-manifest.json")), { code: "ENOENT" });
      await assert.rejects(access(join(snapshot(f, name), "node_modules")), { code: "ENOENT" });
      assert.deepEqual(await readFile(join(snapshot(f, "before-missing"), file)), f.inputs[file]);
      assert.deepEqual(await readFile(join(snapshot(f, "before-missing"), "source-manifest.json")), originalManifest);
    } finally { await writeFile(join(f.root, file), f.inputs[file]); }
  }
  assert.equal((await capture(f, "after-restored")).snapshotId, original.snapshotId);
});

test("snapshot CLI reuses only byte-matching historical IPR references through the previous snapshot", async (t) => {
  const f = await fixture(t),
    original = await capture(f, "reference-source");
  const sourceManifest = await readFile(
    join(snapshot(f, "reference-source"), "source-manifest.json"),
  );
  const result = await run(f, "reference-reuse", { reuse: "reference-source" });
  assert.equal(result.code, 0, result.stderr);
  const reused = await manifest(f, "reference-reuse");
  assert.deepEqual(reused.files, original.files);
  assert.equal(reused.snapshotId, original.snapshotId);
  assert.equal(reused.referenceReuse?.snapshotId, original.snapshotId);
  assert.equal(
    reused.referenceReuse?.sourceManifestSha256,
    sha(sourceManifest),
  );
  assert.equal(reused.referenceReuse?.files, 1);
  assert.equal(
    await realpath(
      join(snapshot(f, "reference-reuse"), "public/models/photogrammetry"),
    ),
    await realpath(
      join(snapshot(f, "reference-source"), "public/models/photogrammetry"),
    ),
  );
  await writeFile(join(f.root, reference), Buffer.from([9, 8, 7]));
  const rejected = await run(f, "reference-mismatch", {
    reuse: "reference-source",
  });
  assert.notEqual(rejected.code, 0);
  assert.match(rejected.stderr, /Historical reference bytes differ/);
  await assert.rejects(
    access(join(snapshot(f, "reference-mismatch"), "source-manifest.json")),
    { code: "ENOENT" },
  );
  assert.deepEqual(
    await readFile(join(snapshot(f, "reference-source"), reference)),
    f.inputs[reference],
  );
});
