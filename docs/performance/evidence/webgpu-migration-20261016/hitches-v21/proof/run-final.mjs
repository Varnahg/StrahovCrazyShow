import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const root = dirname(fileURLToPath(import.meta.url));
const hash = data => createHash('sha256').update(data).digest('hex');
const sourceFiles = ['proof.test.ts', 'trace.ts', 'native-engine.ts', 'types.mjs'];
const sources = Object.fromEntries(sourceFiles.map(path => [path, hash(fs.readFileSync(resolve(root, path)))]));
const runs = [];
for (const run of ['05', '06', '07', 'types-02']) {
  const args = run.startsWith('types') ? ['types.mjs'] : ['--import', './node_modules/tsx/dist/loader.mjs', '--test', '--test-concurrency=1', '--test-timeout=30000', 'proof.test.ts'];
  const startedAt = new Date().toISOString();
  const child = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, TSX_DISABLE_CACHE: '1' } });
  const log = run.startsWith('types') ? `${run}.log` : `run-${run}.log`;
  fs.writeFileSync(resolve(root, log), child.stdout + child.stderr, { flag: 'wx' });
  const report = run.startsWith('types') ? null : `report-run-${run}.json`;
  if (report && fs.existsSync(resolve(root, 'report.json'))) fs.copyFileSync(resolve(root, 'report.json'), resolve(root, report), fs.constants.COPYFILE_EXCL);
  runs.push({ run, startedAt, finishedAt: new Date().toISOString(), executable: process.execPath, args, cwd: root, status: child.status, signal: child.signal, error: child.error?.message ?? null, log, logSha256: hash(fs.readFileSync(resolve(root, log))), report, reportSha256: report ? hash(fs.readFileSync(resolve(root, report))) : null, sources });
  fs.writeFileSync(resolve(root, 'final-runs.json'), JSON.stringify({ runs }, null, 2) + '\n');
  console.log(JSON.stringify({ run, status: child.status, error: child.error?.message ?? null, log }));
  if (child.status !== 0 || child.error) { process.exitCode = 1; break; }
}
