/** Owns only local ports 4209/2595 and immutable files under the assigned cache.
 * Commands: build SNAPSHOT LABEL | create-campaign ID | serve BUILD_DIRECTORY CAMPAIGN_FILE SLOT | inspect BUILD_DIRECTORY
 * No browser automation, CDP, source editing, or replacement game renderer. */
import { readFile, mkdir, writeFile, open } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import net from 'node:net';
import { sha256, inside, writeNewJSON, verifySnapshot, harnessIdentity, transformUI } from './common.mjs';
import { createCampaign, readCampaign, startCampaignRun, beginAttempt, recordAttempt, recoverExport } from './campaign.mjs';
import { stopOwned } from './lifecycle.mjs';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../../../../..');
const cache = resolve(root, '.cache/performance-transit-measure-20261020');
const scenario = JSON.parse(await readFile(join(directory, 'scenario.json'), 'utf8'));
const require = createRequire(join(root, 'package.json'));
const [command, input, label, slot] = process.argv.slice(2);
const previewPort = 4209, apiPort = 2595, origin = `http://127.0.0.1:${previewPort}`;

async function assertPortFree(port) {
  const probe = net.createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
}
async function directoryHashes(directory) {
  const { readdir } = await import('node:fs/promises');
  const files = {};
  async function walk(path, prefix = '') {
    for (const entry of (await readdir(path, {withFileTypes: true})).sort((a, b) => a.name.localeCompare(b.name))) {
      const key = prefix + entry.name;
      if (entry.isDirectory()) await walk(join(path, entry.name), key + '/');
      else files[key] = sha256(await readFile(join(path, entry.name)));
    }
  }
  await walk(directory);
  return files;
}
async function loadBuild(input) {
  const buildDirectory = inside(cache, resolve(input));
  const identity = JSON.parse(await readFile(join(buildDirectory, 'identity.json'), 'utf8'));
  if ((await harnessIdentity(directory)).sha256 !== identity.harnessSha256) throw new Error('Harness changed since build');
  if (JSON.stringify(await directoryHashes(join(buildDirectory, 'dist'))) !== JSON.stringify(identity.bundleFiles))
    throw new Error('Built client bytes changed');
  return {buildDirectory, identity};
}

if (command === 'build') {
  if (!input || !/^[a-z0-9-]+$/.test(label ?? '')) throw new Error('build SNAPSHOT LABEL');
  const snapshot = resolve(input);
  if (!snapshot.startsWith(resolve(root, '.cache') + '\\') && !snapshot.startsWith(resolve(root, '.cache') + '/'))
    throw new Error('Expected immutable snapshot under this worktree cache');
  const source = await verifySnapshot(snapshot), harness = await harnessIdentity(directory);
  const buildDirectory = inside(cache, resolve(cache, 'builds', label + '-' + Date.now()));
  await mkdir(buildDirectory, {recursive: true});
  const originalUI = await readFile(join(snapshot, 'client/ui.tsx'), 'utf8');
  const transformedUI = transformUI(originalUI);
  const identity = {
    schemaVersion: 1, label, sourceSnapshotId: source.snapshotId, sourceFiles: Object.keys(source.files).length,
    snapshot, harnessSha256: harness.sha256, harnessFiles: harness.files, scenarioSha256: harness.files['scenario.json'],
    injection: {file: 'client/ui.tsx', before: sha256(originalUI), after: sha256(transformedUI),
      edits: ['prepend import installTransitQA from virtual:transit-qa', 'call installTransitQA(g) after exact game-ready setReady(true)'],
      normalization: 'Build-only CRLF to LF; original frozen source bytes remain unchanged'},
    publicAssets: 'Served read-only from this exact verified snapshot public/; Vite copyPublicDir=false avoids duplicating immutable assets',
  };
  await writeFile(join(buildDirectory, 'transformed-ui.tsx'), transformedUI, {flag: 'wx'});
  const overlay = (await readFile(join(directory, 'qa-overlay.mjs'), 'utf8'))
    .replace('__TRANSIT_QA_SCENARIO__', JSON.stringify(scenario))
    .replace('__TRANSIT_QA_IDENTITY__', JSON.stringify({label, sourceSnapshotId: source.snapshotId, harnessSha256: harness.sha256}));
  identity.overlayResolvedSha256 = sha256(overlay);
  await writeFile(join(buildDirectory, 'resolved-overlay.mjs'), overlay, {flag: 'wx'});
  const { build, loadConfigFromFile, mergeConfig } = await import('vite');
  // Native Node24 config loading avoids an unowned node_modules/.vite-temp write.
  const configuration = await loadConfigFromFile({command: 'build', mode: 'production'}, join(snapshot, 'vite.config.ts'), snapshot, undefined, undefined, 'native');
  if (!configuration) throw new Error('Expected production Vite configuration');
  const virtual = '\0virtual:transit-qa';
  const virtualConditions = '\0virtual:transit-qa-conditions';
  const virtualDelivery = '\0virtual:transit-qa-delivery';
  const conditions = await readFile(join(directory, 'conditions.mjs'), 'utf8');
  const delivery = await readFile(join(directory, 'attempt-delivery.mjs'), 'utf8');
  await build(mergeConfig(configuration.config, {
    root: snapshot, configFile: false, cacheDir: join(buildDirectory, '.vite'),
    define: {'import.meta.env.VITE_SOURCE_SNAPSHOT_ID': JSON.stringify(source.snapshotId), 'import.meta.env.VITE_MULTIPLAYER_URL': JSON.stringify('')},
    build: {outDir: join(buildDirectory, 'dist'), emptyOutDir: false, copyPublicDir: false, sourcemap: true},
    plugins: [{name: 'transit-measurement-qa', enforce: 'pre',
      resolveId(id) { if (id === 'virtual:transit-qa') return virtual; if (id === 'virtual:transit-qa-conditions') return virtualConditions; if (id === 'virtual:transit-qa-delivery') return virtualDelivery; },
      load(id) { if (id === virtual) return overlay; if (id === virtualConditions) return conditions; if (id === virtualDelivery) return delivery; },
      transform(source, id) { if (id.replaceAll('\\', '/') === join(snapshot, 'client/ui.tsx').replaceAll('\\', '/')) return transformUI(source); },
    }],
  }));
  await verifySnapshot(snapshot);
  identity.bundleFiles = await directoryHashes(join(buildDirectory, 'dist'));
  identity.builtAt = new Date().toISOString();
  identity.dependencies = Object.fromEntries(['@babylonjs/core', '@colyseus/sdk', 'vite', 'tsx'].map(name => {
    const file = require.resolve(name + '/package.json');
    return [name, require(file).version];
  }));
  await writeNewJSON(join(buildDirectory, 'identity.json'), identity);
  console.log(JSON.stringify({buildDirectory, identity}, null, 2));
} else if (command === 'inspect') {
  const {buildDirectory, identity} = await loadBuild(input);
  console.log(JSON.stringify({buildDirectory, identity}, null, 2));
} else if (command === 'create-campaign') {
  console.log(JSON.stringify({campaignFile: await createCampaign(cache, input)}));
} else if (command === 'recover-export') {
  console.log(JSON.stringify({recovered: await recoverExport(await readCampaign(input, cache), label, slot)}));
} else if (command === 'serve') {
  const {buildDirectory, identity} = await loadBuild(input);
  await verifySnapshot(identity.snapshot);
  await assertPortFree(apiPort);
  await assertPortFree(previewPort);
  const campaign = await readCampaign(label, cache);
  const run = await startCampaignRun(campaign, slot, join(buildDirectory, 'identity.json'), identity);
  const runDirectory = run.directory;
  const log = await open(join(runDirectory, 'server.log'), 'wx');
  const api = spawn(process.execPath, ['--import', 'tsx', join(identity.snapshot, 'server/index.ts')], {
    cwd: identity.snapshot, env: {...process.env, HOST: '127.0.0.1', PORT: String(apiPort), STATIC_DIR: undefined},
    windowsHide: true, stdio: ['ignore', log.fd, log.fd],
  });
  let preview, shuttingDown = false, peersPreparing, shutdown;
  const peers = [];
  const sockets = new Set();
  function stop() {
    return shutdown ??= (async () => {
      shuttingDown = true;
      try {
        const report = await stopOwned({peers, api, preview, sockets});
        await writeNewJSON(join(runDirectory, 'cleanup.json'), {...report, finishedAt: new Date().toISOString()});
        return report;
      } catch (error) {
        await writeNewJSON(join(runDirectory, 'cleanup.json'), {...error.report, error: String(error), finishedAt: new Date().toISOString()});
        throw error;
      } finally { await log.close(); }
    })();
  }
  const signalStop = () => stop().catch(error => { console.error(error); process.exitCode = 1; });
  process.once('SIGINT', signalStop);
  process.once('SIGTERM', signalStop);
  try {
    for (let n = 0; ; n++) {
      if (api.exitCode !== null) throw new Error('API exited; inspect ' + join(runDirectory, 'server.log'));
      try { if ((await fetch(`http://127.0.0.1:${apiPort}/api/health`)).ok) break; } catch {}
      if (n > 100) throw new Error('API readiness timeout');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    const { Client } = await import('@colyseus/sdk');
    const { PROTOCOL_VERSION } = await import('tsx/esm/api').then(async ({tsImport}) =>
      tsImport(pathToFileURL(join(identity.snapshot, 'shared/netcode.ts')).href, import.meta.url));
    const sdk = new Client(`http://127.0.0.1:${apiPort}`);
    async function preparePeers() {
      if (peers.length === scenario.peers.length) return;
      if (peers.length) throw new Error('Partial peer setup; preserve evidence and restart server');
      for (const profile of scenario.peers) {
        const response = await fetch(`http://127.0.0.1:${apiPort}/api/session`, {
          method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({mode: 'multiplayer', profile}),
        });
        if (!response.ok) throw new Error('SDK peer session failed: ' + response.status);
        const session = await response.json();
        const room = await sdk.joinById(session.worldId, {token: session.token, protocol: PROTOCOL_VERSION});
        // A dropped QA peer is a failed condition, never an invisible new cohort.
        room.reconnection.enabled = false;
        const evidence = {id: session.id, worldId: session.worldId, sessionId: room.sessionId,
          profile, connectedAt: new Date().toISOString(), messages: {}, connected: true};
        room.onMessage('*', type => evidence.messages[type] = (evidence.messages[type] ?? 0) + 1);
        room.onLeave(() => evidence.connected = false);
        peers.push({room, evidence});
      }
    }
    const { preview: createPreview } = await import('vite');
    const { default: express } = await import('express');
    const publicFiles = express.static(join(identity.snapshot, 'public'), {maxAge: 0, etag: true, immutable: false});
    preview = await createPreview({root: identity.snapshot, configFile: false, build: {outDir: join(buildDirectory, 'dist')},
      plugins: [{name: 'local-transit-qa-endpoints', configurePreviewServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/weather') {
            res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
            return res.end(JSON.stringify(scenario.weather));
          }
          if (!req.url?.startsWith('/__transit-qa/')) return publicFiles(req, res, next);
          res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
          const reply = (status, body) => res.writeHead(status).end(JSON.stringify(body));
          if (!['127.0.0.1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return reply(403, {error: 'Loopback only'});
          if (req.method === 'GET' && req.url === '/__transit-qa/status')
            return reply(200, {...identity, context: run.start, apiPid: api.pid, peers: peers.map(p => p.evidence)});
          if (req.method !== 'POST' || req.headers.origin !== origin || req.headers['content-type'] !== 'application/json')
            return reply(403, {error: 'Same-origin JSON POST required'});
          try {
            let bytes = 0; const chunks = [];
            for await (const chunk of req) { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) throw new Error('Result too large'); chunks.push(chunk); }
            const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (req.url === '/__transit-qa/prepare') {
              peersPreparing ??= preparePeers();
              await peersPreparing;
              return reply(200, {context: run.start, peers: peers.map(p => p.evidence)});
            }
            if (req.url === '/__transit-qa/begin') return reply(201, await beginAttempt(run, data.attemptId, data.mode));
            if (req.url === '/__transit-qa/stop') {
              if (data.startId !== run.start.startId || data.campaignId !== run.start.campaignId) throw new Error('Stop identity mismatch');
              reply(202, {stopping: true});
              setImmediate(signalStop);
              return;
            }
            if (req.url !== '/__transit-qa/attempt') return reply(404, {error: 'Not found'});
            const received = await recordAttempt(run, data, identity,
              peers.map(p => ({...p.evidence, connected: p.evidence.connected && p.room.connection?.isOpen === true})));
            return reply(received.accepted ? 201 : 422, received);
          } catch (error) { return reply(400, {error: String(error)}); }
        });
      }}], preview: {host: '127.0.0.1', port: previewPort, strictPort: true, proxy: {
        '/api': {target: `http://127.0.0.1:${apiPort}`, changeOrigin: false},
        '/realtime': {target: `http://127.0.0.1:${apiPort}`, ws: true, rewrite: path => path.replace(/^\/realtime/, '')},
      }},
    });
    preview.httpServer.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    await writeNewJSON(join(runDirectory, 'processes.json'), {owner: 'perftransit-01a155b2-measure-helper',
      harnessPid: process.pid, apiPid: api.pid, origin, apiPort, buildDirectory, context: run.start, sourceSnapshotId: identity.sourceSnapshotId});
    console.log(JSON.stringify({origin, runDirectory, harnessPid: process.pid, apiPid: api.pid,
      instructions: 'Root CUA: open URL, enter normal multiplayer FIRST, then press Připravit scénář. Buttons save exclusive raw result files.'}));
    await new Promise((resolve, reject) => api.once('exit', code => shuttingDown ? resolve() : reject(new Error('API exited: ' + code))));
  } finally { await stop(); }
} else throw new Error('Usage: harness.mjs build SNAPSHOT LABEL | create-campaign ID | serve BUILD_DIRECTORY CAMPAIGN_FILE SLOT | inspect BUILD_DIRECTORY');
