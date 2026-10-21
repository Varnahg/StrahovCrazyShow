/** Exact historical192 Game source + current frame-boundary regression tests. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const sha = value => createHash('sha256').update(value).digest('hex');
const fixture = join(directory, 'before-frame-latch-game.fixture'), source = await readFile(fixture);
const expected = JSON.parse(await readFile(join(directory, 'verification-before-frame-latch192.json'), 'utf8')).after['client/game.ts'];
if (sha(source) !== expected) throw new Error('Historical192 source fixture drift');
const test = join(root, 'tests/game-webgpu-startup.test.ts'), before = sha(await readFile(test));
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-name-pattern',
  'finite remote frame', test], { cwd: root, encoding: 'utf8', windowsHide: true,
  env: { ...process.env, GAME_STARTUP_SOURCE: fixture } });
const output = (result.stdout ?? '') + (result.stderr ?? '');
await writeFile(join(directory, 'frame-latch-red-exact.tap'), output);
const controls = [...output.matchAll(/# (\{"status"[^\n]+\})/g)].map(match => JSON.parse(match[1]));
const stable = before === sha(await readFile(test));
const proof = { sourceSha256: expected, testSha256: before, stable, exit: result.status,
  tests: Number(output.match(/# tests (\d+)/)?.[1]), failures: Number(output.match(/# fail (\d+)/)?.[1]),
  controls, logSha256: sha(output), scope: 'Actual Game/RenderStartup controlled CPU scheduling; no GPU/network/FPS measurement' };
await writeFile(join(directory, 'frame-latch-red-exact.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
if (!stable || result.status !== 1 || proof.tests !== 2 || proof.failures !== 1 || controls.length !== 2 ||
    controls[0].status !== 'ready' || controls[0].draws !== 2 || controls[1].failure !== 'RenderStartupTimeoutError' || controls[1].draws !== 600)
  process.exitCode = 1;
