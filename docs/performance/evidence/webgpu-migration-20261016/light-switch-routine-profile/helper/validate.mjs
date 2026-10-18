import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const base = dirname(fileURLToPath(import.meta.url));
const dependencies = join(base, 'node_modules');
const files = ['client/qa-routine-profile.ts', 'tests/qa-routine-profile.test.ts'];
let run = 1;
while (existsSync(join(base, `tests-${run}.log`))) run++;
const jobs = [
  ['tests', [`${dependencies}/tsx/dist/cli.mjs`, '--test', '--test-reporter=tap', join(base, files[1])]],
  ['types', [`${dependencies}/typescript/bin/tsc`, '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--lib', 'ES2022,DOM', '--types', 'node', '--typeRoots', `${dependencies}/@types`, ...files.map(file => join(base, file))]],
];
const sha = file => createHash('sha256').update(readFileSync(join(base, file))).digest('hex');
const results = {}, artifacts = {};
for (const [name, args] of jobs) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: base });
  const log = result.stdout + result.stderr, path = `${name}-${run}.log`;
  writeFileSync(join(base, path), log);
  results[name] = { exitCode: result.status, log: path, command: [process.execPath, ...args] };
  artifacts[path] = sha(path);
  if (name === 'tests') Object.assign(results[name], { passed: Number(log.match(/# pass (\d+)/)?.[1] ?? 0), failed: Number(log.match(/# fail (\d+)/)?.[1] ?? 0) });
}
const manifest = { schemaVersion: 1, task: 'webgpu-routine-helper-20261019',
  files: Object.fromEntries(files.map(file => [file, sha(file)])), ...results,
  artifacts: { ...artifacts, 'validate.mjs': sha('validate.mjs') },
  limits: { targets: 8, selectedDepth: 32 },
  scope: 'Copied QA helper only. CPU/NullEngine lifecycle and descriptor verification; not GPU or production performance evidence.',
};
writeFileSync(join(base, `manifest-${run}.json`), JSON.stringify(manifest, null, 2) + '\n');
writeFileSync(join(base, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ run, files: manifest.files, tests: results.tests, types: results.types }, null, 2));
if (Object.values(results).some(result => result.exitCode !== 0)) process.exitCode = 1;
