/** Change only public test-session profile input, never frozen game/runtime code. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ownPath = import.meta.filename;
const snapshot = resolve(process.argv[2]);
const args = process.argv.slice(3);
if (args.length < 5) throw new Error('Usage: node --import tsx performance-diverse.mjs SNAPSHOT ENDPOINT COUNT SECONDS LAYOUT OUTPUT [WARMUP] [TOTAL_POPULATION]');
if (new URL(args[0]).port === '2567') throw new Error('Use an isolated server.');
const source = JSON.parse(await readFile(join(snapshot, 'source-manifest.json'), 'utf8'));
const { applyAvatarPreset } = await import(pathToFileURL(join(snapshot, 'client/avatar-presets.ts')).href);
const { DEFAULT_AVATAR } = await import(pathToFileURL(join(snapshot, 'shared/types.ts')).href);
const capturePath = resolve(snapshot, args[4] + '.profiles.json');
const count = Number(args[1]);
const capture = {
  capturedAt: new Date().toISOString(), sourceSnapshotId: source.snapshotId,
  extraHarnessSha256: createHash('sha256').update(await readFile(ownPath)).digest('hex'),
  presetSourceSha256: source.files['client/avatar-presets.ts'],
  method: 'The frozen network harness is unchanged. This wrapper supplies actual complete fictional preset profiles through normal POST /api/session input. Server sanitization/authentication and input limits remain active.',
  expectedBotCount: count, issuedProfiles: [],
};
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  if (String(input) !== args[0] + '/api/session' || init?.method !== 'POST') return nativeFetch(input, init);
  const body = JSON.parse(init.body);
  const index = capture.issuedProfiles.length;
  body.profile.avatar = applyAvatarPreset(index % 6, DEFAULT_AVATAR);
  const response = await nativeFetch(input, { ...init, body: JSON.stringify(body) });
  if (response.ok) {
    const session = await response.clone().json();
    capture.issuedProfiles.push({ id: session.id, nickname: body.profile.nickname, avatar: body.profile.avatar });
    if (capture.issuedProfiles.length === count) await writeFile(capturePath, JSON.stringify(capture, null, 2) + '\n');
  }
  return response;
};
process.chdir(snapshot);
process.argv = [process.argv[0], join(snapshot, 'scripts/performance-network.ts'), ...args];
try {
  await import(pathToFileURL(join(snapshot, 'scripts/performance-network.ts')).href);
} finally {
  globalThis.fetch = nativeFetch;
  await writeFile(capturePath, JSON.stringify(capture, null, 2) + '\n');
}
