/** Re-run only the two review regressions against the exact historical190 bytes. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const directory = dirname(fileURLToPath(import.meta.url)), root = resolve(directory, '../../../../..');
const digest = value => createHash('sha256').update(value).digest('hex');
let source = await readFile(join(root, 'client/game.ts'), 'utf8');
const removeOnce = text => {
  const count = source.split(text).length - 1;
  if (count !== 1) throw new Error('Historical source reverse-transform drift: ' + count);
  source = source.replace(text, '');
};
removeOnce('      [...this.avatars].filter(([id]) => id !== this.localId).map(([id, avatar]) => [id, avatar.target.x, avatar.target.y,\n' +
  '        avatar.target.z, avatar.target.yaw, avatar.target.vehicle, avatar.target.grounded]),\n');
removeOnce('      [...this.avatars].filter(([id]) => id !== this.localId).map(([id, avatar]) => [id, avatar.lod.level, avatar.root.isEnabled()]),\n');
removeOnce('    // Existing peers can move while loading. Apply only already-accepted target\n' +
  '    // presentation; the ordinary gameplay loop still owns timeline sampling.\n' +
  '    if (this.startupPreparationSnapshot) for (const [id, avatar] of this.avatars) {\n' +
  '      if (id === this.localId) continue;\n' +
  '      const target = avatar.target;\n' +
  '      this.updateAvatarPresentation(id, avatar, new Vector3(target.x, target.y - 0.8, target.z), 0, !target.vehicle);\n' +
  '    }\n');
removeOnce('            if (budget && budget.remaining() <= 0) throw new Error("Startup view submitted-frame budget exhausted");\n');
source = source.replace('            if (this.startupPreparationSnapshot?.authority?.vehicle !== true) {\n',
  '            if (this.startupPreparationSnapshot?.authority?.vehicle !== true) {\n' +
  '              if (budget && budget.remaining() <= 0) throw new Error("Startup view submitted-frame budget exhausted");\n');
const expected = JSON.parse(await readFile(join(directory, 'verification-before-remote190.json'), 'utf8')).after['client/game.ts'];
if (digest(source) !== expected) throw new Error('Historical source SHA mismatch; refusing an approximate red reproduction');
const fixture = join(directory, 'before-remote-game.fixture');
await writeFile(fixture, source);
const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', '--test-reporter=tap', '--test-name-pattern',
  'known remote motion|synchronous observer stall', 'tests/game-webgpu-startup.test.ts'],
{ cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GAME_STARTUP_SOURCE: fixture } });
const output = (result.stdout ?? '') + (result.stderr ?? '');
await writeFile(join(directory, 'remote-deadline-red-exact.tap'), output);
const proof = { sourceSha256: expected, testSha256: digest(await readFile(join(root, 'tests/game-webgpu-startup.test.ts'))),
  exit: result.status, tests: Number(output.match(/# tests (\d+)/)?.[1]), failures: Number(output.match(/# fail (\d+)/)?.[1]),
  logSha256: digest(output), scope: 'CPU only; exact historical Game source, current targeted review regressions; no GPU/build/server' };
await writeFile(join(directory, 'remote-deadline-red-exact.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof, null, 2));
if (result.status !== 1 || proof.tests !== 2 || proof.failures !== 2 || !output.includes('new accepted remote target') || !output.includes('Missing expected rejection'))
  process.exitCode = 1;
