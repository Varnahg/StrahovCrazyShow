/** Actual current-protocol clients, valid sequential commands, measured on isolated loopback. */
import { Client, type Room } from '@colyseus/sdk';
import { access, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { DEFAULT_PROFILE } from '../shared/types';
import { PROTOCOL_VERSION } from '../shared/netcode';
import { MotionDecoder } from '../shared/motion-codec';
import { ScriptTimelineClient, type ScriptAuthority } from './timeline-client';

const endpoint = process.argv[2] || 'http://127.0.0.1:2570';
const count = Number(process.argv[3] || 30);
const seconds = Number(process.argv[4] || 30);
const layout = process.argv[5] || 'crowded';
const output = process.argv[6];
const warmupSeconds = Number(process.argv[7] || (layout === 'distributed' ? 50 : 3));
const expectedPopulation = Number(process.argv[8] || count);
const stopFile = process.argv[9] ? resolve(process.argv[9]) : undefined;
if (new URL(endpoint).port === '2567') throw new Error('The shared development server must not be load-tested.');
if (!Number.isInteger(count) || count < 1 || count > 100 || seconds < 10 || !['crowded', 'distributed'].includes(layout)) throw new Error('Invalid count, duration or layout.');
if (!Number.isInteger(expectedPopulation) || expectedPopulation < count || expectedPopulation > count + 1) throw new Error('Expected population must be the bot cohort or the cohort plus one browser observer.');
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const quant = (a: number[], p: number) => a.length ? [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)] : null;
const rounded = (n: number | null) => n === null ? null : Math.round(n * 1000) / 1000;
type Bot = {
  id: string;
  room: Room;
  inputs: ScriptTimelineClient;
  inputCommands: number;
  seq: number;
  ack: number;
  lastRows: number;
  sent: Map<number, number>;
  position: { x: number; y: number; z: number };
  startPosition?: { x: number; y: number; z: number };
  pathLength: number;
  bytesDown: number;
  bytesUp: number;
  motionBytes: number[];
  motionTimes: number[];
  motionTicks: number[];
  motionServerTimes: number[];
  inputTimes: number[];
  ackAges: number[];
  ackTimes: number[];
  ackLag: number[];
  resyncs: number;
  resyncEvents: {
    time: number;
    serverTime: number;
    reason: string;
    inputEpoch: number;
    seq: number;
    ack: number;
  }[];
  maxBuffered: number;
  minPlayers: number;
  maxPlayers: number;
  errors: string[];
};
const sdk = new Client(endpoint), bots: Bot[] = [];
let recording = false, stopped = false, pulse: ReturnType<typeof setTimeout> | undefined;
const source = JSON.parse(await readFile(resolve('source-manifest.json'), 'utf8'));
const harnessSha256 = createHash('sha256').update(await readFile(import.meta.filename)).digest('hex');
const harnessProvenance = process.env.STRAHOV_PERF_HARNESS_METADATA ? JSON.parse(process.env.STRAHOV_PERF_HARNESS_METADATA) : null;
if (harnessProvenance && (harnessProvenance.harnessSha256 !== harnessSha256 || harnessProvenance.sourceSnapshotId !== source.snapshotId || resolve(harnessProvenance.harnessPath) !== resolve(import.meta.filename))) throw new Error('The executing network harness differs from the wrapper provenance.');
const initialHealth = await (await fetch(endpoint + '/api/health')).json() as any;
if (!initialHealth.ok) throw new Error('Dedicated server health check failed. Population is verified through authenticated motion messages.');
const worldIds = new Set<string>();
let rawLength = 0;
try {
  for (let i = 0; i < count; i++) {
    const response = await fetch(endpoint + '/api/session', { method: 'POST', body: JSON.stringify({ mode: 'multiplayer', profile: { ...DEFAULT_PROFILE, nickname: 'audit-' + String(i + 1).padStart(3, '0'), avatar: { ...DEFAULT_PROFILE.avatar, preset: i % 6, shirt: ['#d6f26b', '#bfa4d4', '#e6bc84', '#72a7a0'][i % 4] } } }) });
    if (!response.ok) throw new Error('Session issue failed HTTP ' + response.status + ': ' + await response.text());
    const session = await response.json() as any;
    worldIds.add(session.worldId);
    const room = await sdk.joinById(session.worldId, { token: session.token, protocol: PROTOCOL_VERSION });
    const inputs = new ScriptTimelineClient({
      send: (batch) => room.send("inputs", batch),
      onSend: (batch, now) => {
        for (const input of batch) bot.sent.set(input.seq, now);
        bot.seq = batch.at(-1)!.seq;
        if (recording) {
          bot.inputTimes.push(now);
          bot.inputCommands += batch.length;
          bot.maxBuffered = Math.max(
            bot.maxBuffered,
            (bot.room as any).connection.transport.ws.bufferedAmount || 0,
          );
        }
      },
    });
    const bot: Bot = {
      id: session.id,
      room,
      inputs,
      inputCommands: 0,
      seq: 0,
      ack: 0,
      lastRows: 0,
      sent: new Map(),
      position: { x: 22, y: 1, z: -14 },
      pathLength: 0,
      bytesDown: 0,
      bytesUp: 0,
      motionBytes: [],
      motionTimes: [],
      motionTicks: [],
      motionServerTimes: [],
      inputTimes: [],
      ackAges: [],
      ackTimes: [],
      ackLag: [],
      resyncs: 0,
      resyncEvents: [],
      maxBuffered: 0,
      minPlayers: Infinity,
      maxPlayers: 0,
      errors: [],
    };
    bots.push(bot);
    room.onMessage('*', () => {});
    room.onError((code, message) => bot.errors.push(String(code) + ': ' + message));
    const conn = (room as any).connection, originalMessage = conn.events.onmessage, originalSend = conn.send.bind(conn);
    conn.events.onmessage = (event: any) => { rawLength = event.data.byteLength; if (recording) bot.bytesDown += rawLength; originalMessage(event); };
    conn.send = (data: any) => { if (recording) bot.bytesUp += data.byteLength; originalSend(data); };
    const motion = new MotionDecoder();
    room.onMessage('motion', (wire: unknown) => {
      const packet = motion.decode(wire);
      if (!packet) { bot.errors.push('Motion baseline/sequence rejected'); return; }
      bot.lastRows = packet.rows.length;
      if (!recording) return;
      bot.motionBytes.push(rawLength); bot.motionTimes.push(performance.now()); bot.motionTicks.push(packet.tick); bot.motionServerTimes.push(packet.time);
      bot.minPlayers = Math.min(bot.minPlayers, packet.rows.length); bot.maxPlayers = Math.max(bot.maxPlayers, packet.rows.length);
    });
    room.onMessage("authoritative", (authority: ScriptAuthority) => {
      const epochChanged =
        bot.inputs.authority?.inputEpoch !== authority.inputEpoch;
      if (!bot.inputs.acceptAuthority(authority)) return;
      if (epochChanged) {
        bot.sent.clear();
        bot.seq = authority.ack;
        bot.ack = authority.ack;
      }
      const next = authority.state.position;
      if (recording) {
        bot.pathLength += Math.hypot(
          next.x - bot.position.x,
          next.z - bot.position.z,
        );
        if (authority.ack > bot.ack && bot.sent.has(authority.ack)) {
          const observedAt = performance.now();
          bot.ackAges.push(observedAt - bot.sent.get(authority.ack)!);
          bot.ackTimes.push(observedAt);
        }
        bot.ackLag.push(Math.max(0, bot.seq - authority.ack));
        if (authority.resync) {
          bot.resyncs++;
          bot.resyncEvents.push({
            time: Date.now(),
            serverTime: authority.time,
            reason: authority.resyncReason || "unspecified",
            inputEpoch: authority.inputEpoch,
            seq: bot.seq,
            ack: authority.ack,
          });
        }
      }
      bot.ack = authority.ack;
      bot.position = next;
      for (const seq of bot.sent.keys())
        if (seq <= authority.ack) bot.sent.delete(seq);
    });
    room.onMessage('notice', (message: unknown) => bot.errors.push(String(message)));
  }
  if (worldIds.size !== 1) throw new Error('Clients were split into multiple worlds.');
  const joinedHealth = await (await fetch(endpoint + '/api/health')).json() as any;
  if (bots.length !== count) throw new Error('Not all requested clients authenticated and joined.');
  const movementStart = performance.now();
  function move() {
    if (stopped) return;
    const now = performance.now();
    // The production timeline resolves wall time into bounded future slots;
    // callbacks never replay a backlog of historical movement intentions.
    const t = (now - movementStart) / 1000;
    bots.forEach((bot, index) => {
      let x: number, z: number;
      if (layout === "distributed") {
        const tx = 26 + (index % 20) * 12 + Math.sin(t * 0.8 + index) * 2;
        const tz = [8, 12, 22, 26, 30][Math.floor(index / 20) % 5];
        const dx = tx - bot.position.x,
          dz = tz - bot.position.z;
        // Reach the open spine first, then spread through it. No teleport or privileged API.
        if (bot.position.z < 5 && Math.abs(dz) > 1) {
          x = 0;
          z = 1;
        } else {
          const n = Math.max(1, Math.hypot(dx, dz));
          x = dx / n;
          z = dz / n;
        }
      } else {
        x = Math.sin((t * Math.PI) / 2 + index * 0.03) * 0.7;
        z = Math.cos((t * Math.PI) / 2 + index * 0.03) * 0.7;
      }
      bot.inputs.step({
        x,
        z,
        yaw: Math.atan2(x, z),
        jump: false,
        run: layout === "distributed" && t < warmupSeconds,
        vehicle: false,
      });
    });
    pulse = setTimeout(
      move,
      Math.max(1, 1000 / 30 - (performance.now() - now)),
    );
  }
  move();
  console.log(JSON.stringify({status: 'harness-ready', endpoint, count, expectedPopulation, layout, protocol: PROTOCOL_VERSION, snapshotId: source.snapshotId, warmupSeconds, seconds, stopFile, harnessSha256}));
  await sleep(warmupSeconds * 1000);
  if (bots.some(bot => bot.lastRows !== expectedPopulation)) throw new Error('Authenticated motion population differs from the declared cohort/browser total; do not benchmark a non-isolated or incomplete world.');
  for (const bot of bots) bot.startPosition = {...bot.position};
  recording = true;
  const startedAt = Date.now(), start = performance.now();
  const deadline = start + seconds * 1000;
  let stopReason: 'deadline' | 'stop-file' = 'deadline';
  console.log(JSON.stringify({status: 'recording-started', startedAt, requestedDurationMs: seconds * 1000, stopFile}));
  while (performance.now() < deadline) {
    if (stopFile) {
      try {
        await access(stopFile);
        stopReason = 'stop-file';
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    await sleep(Math.max(0, Math.min(200, deadline - performance.now())));
  }
  const elapsed = performance.now() - start, endedAt = Date.now();
  recording = false; stopped = true; clearTimeout(pulse);
  const monitor = bots[0], gaps = monitor.motionTimes.slice(1).map((time, i) => time - monitor.motionTimes[i]);
  const inputGaps = monitor.inputTimes.slice(1).map((time, i) => time - monitor.inputTimes[i]);
  const n = monitor.motionTicks.length;
  const tickHz = n > 1 ? (monitor.motionTicks[n - 1] - monitor.motionTicks[0]) / ((monitor.motionTimes[n - 1] - monitor.motionTimes[0]) / 1000) : 0;
  const serverTickHz = n > 1 ? (monitor.motionTicks[n - 1] - monitor.motionTicks[0]) / ((monitor.motionServerTimes[n - 1] - monitor.motionServerTimes[0]) / 1000) : 0;
  const positions = bots.map(bot => ({id: bot.id, ...bot.position, pathMetres: rounded(bot.pathLength)}));
  const report = {
    capturedAt: new Date().toISOString(), sourceSnapshotId: source.snapshotId, sourceManifest: resolve('source-manifest.json'), node: process.version, endpoint,
    harnessPath: resolve(import.meta.filename), harnessSha256, harnessProvenance,
    context: 'Real Colyseus clients and production server code executed through tsx, isolated Windows loopback, no emulated Internet latency or loss. Not a GPU/FPS test. Session issuance limits preserved.',
    metricsNote: 'Bytes are serialized binary Colyseus application messages, excluding WS/IP/TCP/TLS framing. Ack age measures send-to-authority for a transmitted slot resolved by world time; it does not prove that the server accepted that slot and is not RTT or input-to-photon. Ack lag includes intentional future lead. Input command Hz counts actual transmitted commands. CPU is recorded by separate non-patching Node preload.',
    count, expectedPopulation, authenticatedRooms: bots.length, layout, worldIds: [...worldIds], initialHealth, joinedHealth, startedAt, endedAt, durationMs: rounded(elapsed), warmupSeconds,
    requestedDurationMs: seconds * 1000, stopFile, stopReason,
    minRowsPerMotion: Math.min(...bots.map(bot => bot.minPlayers)), maxRowsPerMotion: Math.max(...bots.map(bot => bot.maxPlayers)),
    tickHzObserved: rounded(tickHz), tickHzServerClock: rounded(serverTickHz), motionHz: rounded(n / (elapsed / 1000)),
    motionGapMedianMs: rounded(quant(gaps, .5)), motionGapP95Ms: rounded(quant(gaps, .95)), motionGapP99Ms: rounded(quant(gaps, .99)), motionGapMaxMs: rounded(Math.max(...gaps)),
    inputBatchHz: rounded(monitor.inputTimes.length / (elapsed / 1000)), inputCommandHz: rounded(monitor.inputCommands / (elapsed / 1000)), inputBatchGapP95Ms: rounded(quant(inputGaps, .95)),
    monitorMotionBytesMedian: quant(monitor.motionBytes, .5), monitorMotionBytesP95: quant(monitor.motionBytes, .95),
    monitorDownKBps: rounded(monitor.bytesDown / (elapsed / 1000) / 1000), monitorUpKBps: rounded(monitor.bytesUp / (elapsed / 1000) / 1000),
    aggregateDownKBps: rounded(bots.reduce((sum, bot) => sum + bot.bytesDown, 0) / (elapsed / 1000) / 1000), aggregateUpKBps: rounded(bots.reduce((sum, bot) => sum + bot.bytesUp, 0) / (elapsed / 1000) / 1000),
    ackAgeMedianMs: rounded(quant(bots.flatMap(bot => bot.ackAges), .5)), ackAgeP95Ms: rounded(quant(bots.flatMap(bot => bot.ackAges), .95)), ackAgeP99Ms: rounded(quant(bots.flatMap(bot => bot.ackAges), .99)), ackLagCommandsP95: quant(bots.flatMap(bot => bot.ackLag), .95),
    resyncsDuringMeasurement: bots.reduce((sum, bot) => sum + bot.resyncs, 0), resyncReasons: bots.flatMap(bot => bot.resyncEvents).reduce((counts, event) => { counts[event.reason] = (counts[event.reason] || 0) + 1; return counts; }, {} as Record<string, number>), resyncEvents: bots.flatMap(bot => bot.resyncEvents.map(event => ({id: bot.id, ...event}))), maxBufferedBytes: Math.max(...bots.map(bot => bot.maxBuffered)),
    movingClients: bots.filter(bot => bot.pathLength > 1).length, pathMetresMedian: rounded(quant(bots.map(bot => bot.pathLength), .5)),
    spatialExtent: {minX: Math.min(...positions.map(p => p.x)), maxX: Math.max(...positions.map(p => p.x)), minZ: Math.min(...positions.map(p => p.z)), maxZ: Math.max(...positions.map(p => p.z))},
    positions, errors: bots.flatMap(bot => bot.errors.map(error => ({id: bot.id, error}))),
    lifetimeInputTimelines: bots.map(bot => ({id: bot.id, producer: bot.inputs.snapshot(), serverQueue: bot.inputs.authority?.network?.queue})),
    rawMonitor: {motionTimes: monitor.motionTimes, motionTicks: monitor.motionTicks, motionServerTimes: monitor.motionServerTimes, motionBytes: monitor.motionBytes, inputTimes: monitor.inputTimes, inputCommands: monitor.inputCommands, ackAges: monitor.ackAges, ackTimes: monitor.ackTimes, ackLag: monitor.ackLag, resyncEvents: monitor.resyncEvents},
  };
  if (output) await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  const {positions: _positions, rawMonitor: _raw, lifetimeInputTimelines: _timelines, ...summary} = report;
  console.log(JSON.stringify(summary));
} finally {
  stopped = true; clearTimeout(pulse);
  bots.forEach(bot => bot.inputs.dispose());
  await Promise.allSettled(bots.map(bot => bot.room.leave()));
  console.log(JSON.stringify({status: 'disconnected', authenticatedConnectionsStillOpen: bots.filter(bot => (bot.room as any).connection.isOpen).length, health: await (await fetch(endpoint + '/api/health')).json()}));
}
