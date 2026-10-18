import fs from 'node:fs';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url)), fixture = join(root, 'fixture');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
let revision = 1; while (fs.existsSync(join(root, `validation-${revision}.json`))) revision++;
const runs = [], record = join(root, `validation-${revision}.json`), changes = JSON.parse(fs.readFileSync(join(root, 'runtime-changes.json'))).changes;
function verify() {
  const input = JSON.parse(fs.readFileSync(join(root, 'input-manifest.json')));
  for (const [path, expected] of Object.entries(input.currentPackages)) {
    const change = changes.find(change => change.path === path);
    assert.equal(sha(fs.readFileSync(join(fixture, 'node_modules', path))), change?.sha256 ?? expected, 'Sandbox drift: ' + path);
    assert.equal(sha(fs.readFileSync(join(input.current, 'node_modules', path))), expected, 'Readonly source dependency drift: ' + path);
  }
  for (const change of changes) assert.equal(sha(fs.readFileSync(join(root, 'candidate/node_modules', change.path))), change.sha256);
}
verify();
function run(label, args, cwd = root, env = {}) {
  const path = `${label}-${revision}.log`, startedAt = new Date().toISOString();
  assert.ok(!fs.existsSync(join(root, path)));
  const result = spawnSync(process.execPath, args, { cwd, encoding: 'utf8', timeout: 120000, maxBuffer: 12 * 1024 * 1024,
    env: { ...process.env, TSX_DISABLE_CACHE: '1', ...env } });
  const output = result.stdout + result.stderr;
  fs.writeFileSync(join(root, path), output, { flag: 'wx' });
  runs.push({ label, args, cwd, env, startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, error: result.error?.message ?? null,
    passed: Number(output.match(/(?:# pass |ℹ pass )(\d+)/)?.[1] ?? 0), failed: Number(output.match(/(?:# fail |ℹ fail )(\d+)/)?.[1] ?? 0), log: path, sha256: sha(output) });
  fs.writeFileSync(record, JSON.stringify({ revision, runs }, null, 2) + '\n');
  console.log(JSON.stringify(runs.at(-1)));
  if (result.status !== 0 || result.error) process.exit(1);
}
run('owner', ['--test', 'owner.test.mjs']);
for (const mode of ['reference', 'owner']) for (const [file, kind] of [['tests/material-defines-serialization.test.ts', 'class'], ['tests/material-defines-wgsl-order.test.ts', 'wgsl']]) {
  run(`${mode}-${kind}`, ['--import', '../node_modules/tsx/dist/loader.mjs', '--import', '../reference-loader.mjs', '--test', '--test-concurrency=1', '--test-timeout=60000', file], fixture,
    { OWNER_MODE: mode, OWNER_RECEIPT: `${mode}-${kind}-${revision}-source.json`, DEFINE_ORDER_REPORT: join(root, `${mode}-${kind}-${revision}-report.json`) });
}
run('types', ['types.mjs']);
verify();
const artifacts = {};
function walk(dir, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isSymbolicLink() || entry.name === 'manifest.json' || /^manifest-\d+\.json$/.test(entry.name)) continue;
    if (entry.isDirectory()) walk(join(dir, entry.name), path); else artifacts[path] = sha(fs.readFileSync(join(dir, entry.name)));
  }
}
walk(root);
const testRuns = runs.filter(run => run.label !== 'types');
const manifest = { schemaVersion: 1, task: 'webgpu-memo-current-proof-20261019', revision,
  files: Object.fromEntries(changes.map(change => ['candidate/node_modules/' + change.path, change.sha256])),
  tests: { passed: testRuns.reduce((sum, run) => sum + run.passed, 0), failed: testRuns.reduce((sum, run) => sum + run.failed, 0), exitCode: 0, runs: testRuns },
  types: runs.at(-1), artifacts, inverse: '4/4 current source files byte-exact inverse verified',
  scope: 'Current baseline transplant only, unchanged owner64/262144. Correctness/NullEngine WGSL/layout/lifecycle; no CPU statistical benchmark, build, install, real GPU or production acceptance.' };
fs.writeFileSync(join(root, `manifest-${revision}.json`), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
fs.writeFileSync(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ manifestSha256: sha(fs.readFileSync(join(root, 'manifest.json'))), files: manifest.files, tests: manifest.tests.passed, artifacts: Object.keys(artifacts).length }));
