/** Matched stationary render cohort: normal authenticated idle SDK peers.
 * Unlike the moving performance-network route, these peers send normal neutral
 * timeline input and retain their authoritative spawn/idle pose. No privileged position API,
 * server mutation, browser/GPU or public HTTP population query. Run only after
 * the browser is ready, then settle all new avatar work before measuring. */
import { Client } from '@colyseus/sdk';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const snapshot = resolve(process.argv[2]), output = resolve(process.argv[3]);
const seconds = Number(process.argv[4] ?? 900), endpoint = 'http://127.0.0.1:2597';
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 3600) throw Error('Expected10..3600 seconds');
const source = JSON.parse(await readFile(join(snapshot, 'source-manifest.json'), 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const imports = {};
for (const file of ['shared/types.ts', 'shared/netcode.ts', 'shared/motion-codec.ts', 'shared/vehicle.ts', 'client/avatar-presets.ts',
  'scripts/timeline-client.ts', 'client/network-input-buffer.ts', 'client/network-timeline.ts', 'shared/input-timeline.ts']) {
  const bytes = await readFile(join(snapshot, file)), entry = source.files[file];
  if (hash(bytes) !== (typeof entry === 'string' ? entry : entry?.sha256)) throw Error('Snapshot import drift: ' + file);
  imports[file] = hash(bytes);
}
const from = file => import(pathToFileURL(join(snapshot, file)).href);
const { DEFAULT_PROFILE, DEFAULT_AVATAR } = await from('shared/types.ts');
const { PROTOCOL_VERSION } = await from('shared/netcode.ts');
const { MotionDecoder } = await from('shared/motion-codec.ts');
const { applyAvatarPreset } = await from('client/avatar-presets.ts');
const { ScriptTimelineClient } = await from('scripts/timeline-client.ts');
await mkdir(output);
const peers = [], errors = [], worlds = new Set(), samples = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let stopping = false, overflow = 0, recording = false, pulse;
function issue(value) { if (errors.length < 32) errors.push(value); else overflow++; }
const proof = () => ({ sourceSnapshotId: source.snapshotId, imports, endpoint, protocol: PROTOCOL_VERSION,
  scriptSha256: hashBytes, worldIds: [...worlds], expectedPopulation: 3, atUTC: new Date().toISOString(),
  peers: peers.map(({ room, decoder, inputs, ...data }) => data), errors, overflow,
  scope: 'Two actual stationary authenticated SDK sessions plus one browser, normal production neutral input timeline. Counts/positions are private authenticated protocol evidence. This is not a network load test or proof of GPU visibility/nearLOD; confirm all3 rendered actors in the browser.' });
const hashBytes = hash(await readFile(import.meta.filename));
try {
  for (let index = 0; index < 2; index++) {
    const profile = { ...DEFAULT_PROFILE, nickname: ['Stationary Alex QA', 'Stationary Robin QA'][index],
      avatar: applyAvatarPreset(index, DEFAULT_AVATAR) };
    const response = await fetch(endpoint + '/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'multiplayer', profile }) });
    if (!response.ok) throw Error('Session rejected HTTP' + response.status);
    const session = await response.json(); worlds.add(session.worldId);
    const room = await new Client(endpoint).joinById(session.worldId, { token: session.token, protocol: PROTOCOL_VERSION });
    const peer = { room, decoder: new MotionDecoder(), inputs: new ScriptTimelineClient({ send: batch => room.send('inputs', batch) }), preset: index, avatar: profile.avatar,
      rows: null, minRows: null, maxRows: null, motionMessages: 0, authorityMessages: 0,
      resyncs: 0, firstPosition: null, lastPosition: null, maxHorizontalDriftMetres: 0, disconnected: false };
    peers.push(peer);
    room.onMessage('*', () => {});
    room.onMessage('motion', wire => {
      const packet = peer.decoder.decode(wire);
      if (!packet) { issue('Motion baseline rejected'); return; }
      peer.rows = packet.rows.length;
      if (!recording) return;
      peer.motionMessages++;
      peer.minRows = Math.min(peer.minRows ?? Infinity, peer.rows);
      peer.maxRows = Math.max(peer.maxRows ?? 0, peer.rows);
    });
    room.onMessage('authoritative', value => {
      peer.inputs.acceptAuthority(value);
      const p = value?.state?.position;
      if (!p || ![p.x, p.y, p.z].every(Number.isFinite)) { issue('Invalid authority pose'); return; }
      peer.lastPosition = { x: p.x, y: p.y, z: p.z };
      if (!recording) return;
      peer.authorityMessages++;
      if (value.resync) peer.resyncs++;
      peer.firstPosition ??= peer.lastPosition;
      peer.maxHorizontalDriftMetres = Math.max(peer.maxHorizontalDriftMetres,
        Math.hypot(p.x - peer.firstPosition.x, p.z - peer.firstPosition.z));
    });
    room.onError(code => issue('SDK code' + code));
    room.onLeave(code => { if (!stopping) issue('Unexpected leave code' + code); });
  }
  pulse = setInterval(() => {
    try {
      for (const peer of peers) if (peer.inputs.authority)
        peer.inputs.step({ x: 0, z: 0, yaw: 0, run: false, jump: false, vehicle: false });
    } catch { issue('Neutral input pump failed'); }
  }, 1000 / 30);
  await sleep(3000);
  if (worlds.size !== 1 || peers.some(p => p.rows !== 3 || !p.lastPosition)) throw Error('Need exactly3 actual sessions in one isolated world');
  recording = true;
  await writeFile(join(output, 'ready.json'), JSON.stringify(proof(), null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ ready: true, sourceSnapshotId: source.snapshotId, worldCount: worlds.size, population: peers.map(p => p.rows) }));
  const end = performance.now() + seconds * 1000;
  while (performance.now() < end) {
    try { await access(join(output, 'STOP')); break; } catch {}
    if (samples.length < 3600) samples.push({ atUTC: new Date().toISOString(), rows: peers.map(p => p.rows), positions: peers.map(p => p.lastPosition) });
    else overflow++;
    await sleep(1000);
  }
} catch (error) { issue('Cohort stopped: ' + (error?.name ?? 'Error')); process.exitCode = 1; }
finally {
  stopping = true;
  clearInterval(pulse);
  for (const peer of peers) {
    peer.inputs.dispose();
    try { await peer.room.leave(true); peer.disconnected = true; }
    catch { issue('Consented leave failed'); process.exitCode = 1; }
  }
  const result = { ...proof(), samples };
  await writeFile(join(output, 'final.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ stopped: true, disconnected: peers.map(p => p.disconnected), errors, overflow }));
}
