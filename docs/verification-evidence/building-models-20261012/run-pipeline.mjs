import { spawn } from 'node:child_process';
import { readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const snapshotName = process.argv[2] ?? 'building-models-20261012-b1';
const prefixes = new Map([['building-models-20261012-b1', ''], ['building-models-20261012-b2', 'b2-'], ['building-models-20261012-b3', 'b3-']]);
if (!prefixes.has(snapshotName)) throw new Error('Unknown building checkpoint');
const prefix = prefixes.get(snapshotName);
const snapshot = resolve(root, '.cache/performance-snapshot', snapshotName);
const manifest = JSON.parse(await readFile(resolve(snapshot, 'source-manifest.json'), 'utf8'));
const report = { sourceSnapshotId: manifest.snapshotId, files: Object.keys(manifest.files).length, startedAt: new Date().toISOString(), results: [] };
await copyFile(resolve(snapshot, 'source-manifest.json'), resolve(import.meta.dirname, prefix + 'source-manifest.json'));
for (const script of ['test', 'build', 'test:integration']) {
  const start = Date.now();
  console.log('Starting pnpm ' + script);
  const child = spawn('pnpm', [script], { cwd: snapshot, shell: true, windowsHide: true,
    env: {...process.env, VITE_SOURCE_SNAPSHOT_ID: manifest.snapshotId} });
  let output = '';
  child.stdout.on('data', c => output += c);
  child.stderr.on('data', c => output += c);
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  const name = script.replaceAll(':', '-');
  await writeFile(resolve(import.meta.dirname, prefix + name + '.log'), output);
  report.results.push({ command: 'pnpm ' + script, code, pid: child.pid, elapsedMs: Date.now() - start,
    completedAt: new Date().toISOString(), summary: output.split('\n').filter(line => /tests |pass |fail |duration|success|PASS|built in/.test(line)).slice(-12) });
  await writeFile(resolve(import.meta.dirname, prefix + 'pipeline.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.results.at(-1)));
  if (code !== 0) { process.exitCode = 1; break; }
}
