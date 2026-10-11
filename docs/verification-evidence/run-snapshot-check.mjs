import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { resolve, join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

const baseFolder = dirname(fileURLToPath(import.meta.url));
const root = resolve(baseFolder, '../..');
const snapshotName = process.argv[4] || 'integrated-20261010-d';
const expected = {
  'integrated-20261010-b': '84760d988d1f08877fc4d6c6f996cd582270513d5d6f401c80d53997f5f01b04',
  'integrated-20261010-c': '6266b25246d63114d66f553d3c06cb82c367800a830e15b2b79e34604a01fc91',
  'integrated-20261010-d': '6bac5a55ce9f8a07885fd07de125fca0299ef7b2e4b893ded45bbc0eb962d062',
}[snapshotName];
if (!expected) throw new Error('Unknown frozen snapshot');
const folder = join(baseFolder, snapshotName);
const snapshot = join(root, '.cache/performance-snapshot', snapshotName);
const manifest = JSON.parse(readFileSync(join(snapshot, 'source-manifest.json'), 'utf8'));
const hash = data => createHash('sha256').update(data).digest('hex');
const mode = process.argv[2] || 'verify';
const label = process.argv[3] || mode;
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Invalid evidence label');
mkdirSync(folder, { recursive: true });
function verify() {
  const errors = [];
  for (const [file, digest] of Object.entries(manifest.files)) {
    const path = join(snapshot, file);
    if (!existsSync(path) || hash(readFileSync(path)) !== digest) errors.push(file);
  }
  const snapshotId = hash(JSON.stringify(manifest.files));
  if (snapshotId !== expected || manifest.snapshotId !== expected) errors.push('snapshot-id');
  return { checkedUtc: new Date().toISOString(), expectedSnapshotId: expected, snapshotId, fileCount: Object.keys(manifest.files).length, errors };
}
function testFiles() {
  const out = {};
  const directory = join(snapshot, 'tests');
  if (!existsSync(directory)) return out;
  const walk = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else out[relative(snapshot, full).replaceAll('\\', '/')] = hash(readFileSync(full));
    }
  };
  walk(directory);
  return out;
}
const before = verify();
writeFileSync(join(folder, `${label}-source-check.json`), JSON.stringify(before, null, 2) + '\n');
if (before.errors.length) throw new Error('Frozen runtime sources no longer match: ' + before.errors.join(', '));
if (mode === 'verify') {
  console.log(JSON.stringify({ ...before, testFiles: testFiles() }, null, 2));
} else {
  const command = { test: 'pnpm test', build: 'pnpm build', integration: 'pnpm test:integration' }[mode];
  if (!command) throw new Error('Unknown check mode');
  const stdout = join(folder, `${label}.stdout.log`), stderr = join(folder, `${label}.stderr.log`);
  writeFileSync(stdout, ''); writeFileSync(stderr, '');
  const start = performance.now(), startedUtc = new Date().toISOString();
  const child = spawn('cmd.exe', ['/d', '/s', '/c', command], { cwd: snapshot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => { appendFileSync(stdout, chunk); process.stdout.write(chunk); });
  child.stderr.on('data', chunk => { appendFileSync(stderr, chunk); process.stderr.write(chunk); });
  const result = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (exitCode, signal) => resolve({ exitCode, signal }));
  });
  const after = verify(), tests = testFiles();
  const testCount = mode === 'test' ? Number(readFileSync(stdout, 'utf8').match(/tests (\d+)/)?.[1] || 0) : undefined;
  const evidence = { command, cwd: snapshot, startedUtc, finishedUtc: new Date().toISOString(), durationMs: performance.now() - start,
    ...result, snapshotId: expected, runtimeFileCount: before.fileCount, runtimeSourceVerificationBefore: before, runtimeSourceVerificationAfter: after,
    testSourceFiles: tests, testSourceId: hash(JSON.stringify(tests)), stdout, stderr, node: process.version, timezone: 'Europe/Prague', testCount,
    verificationPassed: result.exitCode === 0 && !after.errors.length && (mode !== 'test' || testCount > 0) };
  writeFileSync(join(folder, `${label}.result.json`), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ command, exitCode: result.exitCode, durationMs: evidence.durationMs, runtimeUnchanged: !after.errors.length }));
  process.exitCode = result.exitCode ?? 1;
}
