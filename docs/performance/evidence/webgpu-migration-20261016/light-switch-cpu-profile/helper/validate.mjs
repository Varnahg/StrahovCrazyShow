import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const base = dirname(fileURLToPath(import.meta.url));
const dependencies = 'C:/Users/rezac/.codex/worktrees/webgpu-comparison/StrahovCrazyShow/.cache/webgpu-hitch-validation-20261017/light-switch-profile-v1/node_modules';
const files = ['client/qa-cpu-profile.ts', 'tests/qa-cpu-profile.test.ts'];
const runs = [
  ['tests', [`${dependencies}/tsx/dist/cli.mjs`, '--test', '--test-reporter=tap', join(base, files[1])]],
  ['types', [`${dependencies}/typescript/bin/tsc`, '--noEmit', '--strict', '--skipLibCheck', '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'bundler', '--lib', 'ES2022,DOM', '--types', 'node', '--typeRoots', `${dependencies}/@types`, ...files.map(file => join(base, file))]],
];
const results = {};
for (const [name, args] of runs) {
  const result = spawnSync(process.execPath, args, { encoding: 'utf8', cwd: base });
  const log = result.stdout + result.stderr;
  writeFileSync(join(base, `${name}.log`), log);
  results[name] = { exitCode: result.status, command: [process.execPath, ...args] };
  if (name === 'tests') Object.assign(results[name], {
    passed: Number(log.match(/# pass (\d+)/)?.[1] ?? 0),
    failed: Number(log.match(/# fail (\d+)/)?.[1] ?? 0),
  });
}
const sha = file => createHash('sha256').update(readFileSync(join(base, file))).digest('hex');
const manifest = {
  schemaVersion: 1, task: 'webgpu-cpu-helper-20261019',
  files: Object.fromEntries(files.map(file => [file, sha(file)])),
  tests: results.tests, types: results.types,
  artifacts: Object.fromEntries(['tests.log', 'types.log', 'validate.mjs'].map(file => [file, sha(file)])),
  limits: { sampleInterval: 16, maxBufferSize: 2000, captureCount: 1, retainedDomExports: 1 },
  scope: 'Copied QA helper only; no Game hook, GPU, browser, server, build or production modification.',
};
writeFileSync(join(base, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ files: manifest.files, tests: results.tests, types: results.types }, null, 2));
if (Object.values(results).some(result => result.exitCode !== 0)) process.exitCode = 1;
