/** Explicit local build/serve CLI. No browser automation, API process spawning,
 * resource-claim takeover, or termination of any process by port. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { sha256, inside, verifySnapshot, helperIdentity, transformUI, transformLoading, directoryHashes, previewPort, backendPort } from './common.mjs';
import { MAX_RECEIPT_BYTES, authorizeReceiptRequest, saveReceipt } from './receipt.mjs';
import { validateClockConfig } from './transit-clock.mjs';

const helperDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(helperDirectory, '../../../../..');
const validation = join(root, '.cache/webgpu-completion-20261021/validation');
const writeNew = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
async function dependencyIdentity(snapshot) {
  const require = createRequire(join(snapshot, 'package.json'));
  const files = ['@babylonjs/core/package.json', '@babylonjs/core/Materials/materialDefines.js',
    '@babylonjs/core/Materials/shadowDepthWrapper.js', '@babylonjs/core/Materials/Textures/texture.pure.js'];
  const dependencies = {};
  for (const name of files) dependencies[name] = sha256(await readFile(require.resolve(name)));
  const appCore = require.resolve('@babylonjs/core/package.json');
  const loaderRequire = createRequire(require.resolve('@babylonjs/loaders/package.json'));
  if (loaderRequire.resolve('@babylonjs/core/package.json') !== appCore) throw new Error('App/loaders core identity differs');
  return dependencies;
}
async function freshDirectory(input) {
  const directory = inside(validation, resolve(input));
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory);
  return directory;
}
/** Pure negative-fixture target: verifying files alone is insufficient if the
 * sidecar then names another source or supplies different embedded clock data. */
export function verifyBuildContract(identity, source, clockBytes) {
  if (source.snapshotId !== identity.sourceSnapshotId) throw new Error('Build sourceSnapshotId differs from verified manifest');
  if (!identity.clock) return;
  if (!Buffer.isBuffer(clockBytes) || sha256(clockBytes) !== identity.clock.configSha256)
    throw new Error('Clock config bytes changed');
  const verified = validateClockConfig(JSON.parse(clockBytes.toString('utf8')));
  const embedded = validateClockConfig(identity.clock.config);
  if (sha256(JSON.stringify(verified)) !== identity.clock.configId || JSON.stringify(embedded) !== JSON.stringify(verified))
    throw new Error('Embedded clock config content/identity differs from verified bytes');
  const simulation = source.files['shared/simulation.ts'];
  if ((typeof simulation === 'string' ? simulation : simulation?.sha256) !== identity.clock.simulationSourceSha256)
    throw new Error('Clock Simulation source differs from verified manifest');
}
export async function loadBuild(input) {
  const directory = inside(validation, resolve(input));
  const identity = JSON.parse(await readFile(join(directory, 'identity.json'), 'utf8'));
  if ((await helperIdentity(helperDirectory)).sha256 !== identity.helperSha256) throw new Error('Helper changed since build');
  if (JSON.stringify(await directoryHashes(join(directory, 'dist'))) !== JSON.stringify(identity.bundleFiles))
    throw new Error('Immutable built bytes changed');
  const source = await verifySnapshot(identity.snapshot);
  const clockBytes = identity.clock ? await readFile(join(directory, 'clock-config.json')) : undefined;
  verifyBuildContract(identity, source, clockBytes);
  return { directory, identity };
}
export async function run(command, input, output, label, option = 'original', clockFile) {
  if (command === 'build') {
    const loading = option;
    if (!input || !output || !/^[a-z0-9-]+$/.test(label ?? '')) throw new Error('build SNAPSHOT OUTPUT LABEL [original|translucent]');
    const snapshot = inside(join(root, '.cache'), resolve(input));
    const source = await verifySnapshot(snapshot), helper = await helperIdentity(helperDirectory);
    let clock, clockBytes, clockPath;
    if (clockFile) {
      if (!isAbsolute(clockFile)) throw new Error('Clock config must be an explicit absolute file');
      clockPath = inside(validation, clockFile); clockBytes = await readFile(clockPath);
      const config = validateClockConfig(JSON.parse(clockBytes.toString('utf8')));
      const simulationEntry = source.files['shared/simulation.ts'];
      if (!simulationEntry) throw new Error('Clock build requires manifest Simulation source');
      clock = { config, configSha256: sha256(clockBytes), configId: sha256(JSON.stringify(config)),
        simulationSourceSha256: typeof simulationEntry === 'string' ? simulationEntry : simulationEntry.sha256 };
    }
    const originalUI = await readFile(join(snapshot, 'client/ui.tsx'), 'utf8'), transformedUI = transformUI(originalUI);
    const originalCSS = await readFile(join(snapshot, 'client/style.css'), 'utf8'), transformedCSS = transformLoading(originalCSS, loading);
    const transforms = {
      ui: { file: 'client/ui.tsx', before: sha256(originalUI), after: sha256(transformedUI),
        scope: 'Build-only CRLF normalization, import and one observeStartup call in place of original await g.start; original source untouched' },
      loading: { file: 'client/style.css', variant: loading, before: sha256(originalCSS), after: sha256(transformedCSS),
        scope: loading === 'original' ? 'Byte-identical original CSS' : 'Only .loading background #eff3e6 to rgba(239,243,230,.96); isolated diagnostic, not accepted runtime repair' },
    };
    const browserIdentity = { label, sourceSnapshotId: source.snapshotId, helperSha256: helper.sha256, loading, clock: clock ?? null,
      buildId: sha256(JSON.stringify({ source: source.snapshotId, helper: helper.sha256, label, transforms, clock: clock ?? null })) };
    const directory = await freshDirectory(output);
    const overlay = (await readFile(join(helperDirectory, 'qa-overlay.mjs'), 'utf8')).replace('__WEBGPU_COMPLETION_IDENTITY__', JSON.stringify(browserIdentity));
    const observer = await readFile(join(helperDirectory, 'startup-observer.mjs'), 'utf8');
    const attempts = await readFile(join(helperDirectory, 'attempt-queue.mjs'), 'utf8');
    const transitClock = await readFile(join(helperDirectory, 'transit-clock.mjs'), 'utf8');
    const browserClock = (await readFile(join(helperDirectory, 'browser-clock.mjs'), 'utf8'))
      .replace("'./transit-clock.mjs'", "'virtual:webgpu-completion-clock'");
    await writeFile(join(directory, 'transformed-ui.tsx'), transformedUI, { flag: 'wx' });
    await writeFile(join(directory, 'transformed-style.css'), transformedCSS, { flag: 'wx' });
    await writeFile(join(directory, 'resolved-overlay.mjs'), overlay, { flag: 'wx' });
    if (clockBytes) await writeFile(join(directory, 'clock-config.json'), clockBytes, { flag: 'wx' });
    const dependencies = await dependencyIdentity(snapshot);
    await writeNew(join(directory, 'build-input.json'), { ...browserIdentity, snapshot, sourceFiles: Object.keys(source.files).length,
      helperFiles: helper.files, transforms, overlaySha256: sha256(overlay), observerSha256: sha256(observer), dependencies });
    const { build, loadConfigFromFile, mergeConfig } = await import('vite');
    const config = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(snapshot, 'vite.config.ts'), snapshot, undefined, undefined, 'native');
    if (!config) throw new Error('Original production configuration unavailable');
    const virtual = '\0virtual:webgpu-completion-qa', virtualObserver = '\0virtual:webgpu-completion-observer', virtualAttempts = '\0virtual:webgpu-completion-attempts';
    const virtualClock = '\0virtual:webgpu-completion-clock', virtualBrowserClock = '\0virtual:webgpu-completion-browser-clock';
    let uiHits = 0, cssHits = 0;
    await build(mergeConfig(config.config, {
      root: snapshot, configFile: false, cacheDir: join(directory, '.vite'),
      define: { 'import.meta.env.VITE_SOURCE_SNAPSHOT_ID': JSON.stringify(source.snapshotId), 'import.meta.env.VITE_MULTIPLAYER_URL': JSON.stringify('') },
      build: { outDir: join(directory, 'dist'), emptyOutDir: false, copyPublicDir: false, sourcemap: true },
      plugins: [{ name: 'explicit-webgpu-completion-qa', enforce: 'pre',
        resolveId(id) {
          if (id === 'virtual:webgpu-completion-qa') return virtual;
          if (id === 'virtual:webgpu-completion-observer') return virtualObserver;
          if (id === 'virtual:webgpu-completion-attempts') return virtualAttempts;
          if (id === 'virtual:webgpu-completion-clock') return virtualClock;
          if (id === 'virtual:webgpu-completion-browser-clock') return virtualBrowserClock;
          if (id === 'virtual:webgpu-completion-simulation') return join(snapshot, 'shared/simulation.ts').replaceAll('\\', '/');
        },
        load(id) {
          if (id === virtual) return overlay;
          if (id === virtualObserver) return observer;
          if (id === virtualAttempts) return attempts;
          if (id === virtualClock) return transitClock;
          if (id === virtualBrowserClock) return browserClock;
        },
        transform(code, id) {
          const file = id.split('?')[0].replaceAll('\\', '/');
          if (file === join(snapshot, 'client/ui.tsx').replaceAll('\\', '/')) {
            if (sha256(code) !== transforms.ui.before) throw new Error('UI preimage mismatch');
            uiHits++; return { code: transformUI(code), map: null };
          }
          if (file === join(snapshot, 'client/style.css').replaceAll('\\', '/')) {
            if (sha256(code) !== transforms.loading.before) throw new Error('CSS preimage mismatch');
            cssHits++; return { code: transformLoading(code, loading), map: null };
          }
        },
        generateBundle() { if (uiHits !== 1 || cssHits !== 1) throw new Error('Exact transform hit count mismatch: ' + uiHits + '/' + cssHits); },
      }],
    }));
    await verifySnapshot(snapshot);
    if (clockPath && sha256(await readFile(clockPath)) !== clock.configSha256) throw new Error('Clock input changed during build');
    if ((await helperIdentity(helperDirectory)).sha256 !== helper.sha256) throw new Error('Helper changed during build');
    if (JSON.stringify(await dependencyIdentity(snapshot)) !== JSON.stringify(dependencies)) throw new Error('Selected dependency bytes changed during build');
    const identity = { schemaVersion: 1, ...browserIdentity, snapshot, sourceFiles: Object.keys(source.files).length,
      helperFiles: helper.files, transforms, transformHits: { ui: uiHits, css: cssHits },
      overlaySha256: sha256(overlay), observerSha256: sha256(observer), dependencies,
      bundleFiles: await directoryHashes(join(directory, 'dist')), builtAt: new Date().toISOString(),
      limitation: 'No GPU acceptance from build. Browser exports buildId; sidecar binds that ID to actual bundle hashes. Public assets served from exact verified original snapshot, no mutation/copy.' };
    await writeNew(join(directory, 'identity.json'), identity);
    console.log(JSON.stringify({ directory, identity }, null, 2));
  } else if (command === 'inspect') {
    console.log(JSON.stringify(await loadBuild(input), null, 2));
  } else if (command === 'serve') {
    const port = previewPort(label ?? process.env.STRAHOV_WEBGPU_QA_PORT ?? '4211');
    const apiPort = backendPort(option === 'original' ? process.env.STRAHOV_WEBGPU_QA_API_PORT ?? '2596' : option);
    if (port === apiPort) throw new Error('Preview and API must use distinct owned ports');
    const origin = 'http://127.0.0.1:' + port;
    const { directory, identity } = await loadBuild(input), runDirectory = await freshDirectory(output);
    if (identity.clock && apiPort === 2596) throw new Error('Clock QA cannot use the immutable baseline API2596');
    const { preview } = await import('vite'), { default: express } = await import('express');
    const publicFiles = express.static(join(identity.snapshot, 'public'), { maxAge: 0, etag: true, immutable: false });
    const server = await preview({ root: identity.snapshot, configFile: false, build: { outDir: join(directory, 'dist') },
      plugins: [{ name: 'owned-webgpu-completion-receipts', configurePreviewServer(previewServer) {
        previewServer.middlewares.use(async (req, res, next) => {
          if (!req.url?.startsWith('/__webgpu-completion/')) return publicFiles(req, res, next);
          res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
          const reply = (status, value) => res.writeHead(status).end(JSON.stringify(value));
          if (req.url !== '/__webgpu-completion/receipt') return reply(404, { error: 'Not found' });
          if (!authorizeReceiptRequest(req, origin)) return reply(403, { error: 'Same-origin loopback JSON POST required' });
          try {
            let count = 0; const chunks = [];
            for await (const chunk of req) {
              count += chunk.length;
              if (count > MAX_RECEIPT_BYTES) return reply(413, { error: 'Receipt too large; download backup retained' });
              chunks.push(chunk);
            }
            const result = await saveReceipt(join(runDirectory, 'receipts'), Buffer.concat(chunks), identity);
            return reply(result.repeated ? 200 : 201, result);
          } catch (error) { return reply(400, { error: String(error.message ?? error) }); }
        });
      } }],
      preview: { host: '127.0.0.1', port, strictPort: true, proxy: {
        '/api': { target: 'http://127.0.0.1:' + apiPort, changeOrigin: false },
        '/realtime': { target: 'http://127.0.0.1:' + apiPort, ws: true, rewrite: path => path.replace(/^\/realtime/, '') },
      } },
    });
    await writeNew(join(runDirectory, 'identity.json'), { ...identity, origin, apiPort, servedAt: new Date().toISOString(),
      bundleIdentitySha256: sha256(JSON.stringify(identity.bundleFiles)), receiptScope: 'Immutable raw attempts; persistence is not performance acceptance' });
    const sockets = new Set();
    server.httpServer.on('connection', socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
    let close;
    const stop = () => close ??= (async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
      await writeNew(join(runDirectory, 'cleanup.json'), { ownPreviewStopped: true, stoppedAt: new Date().toISOString(), apiOwnedOrStopped: false });
    })();
    process.once('SIGINT', () => { void stop().catch(error => { console.error(error); process.exitCode = 1; }); });
    process.once('SIGTERM', () => { void stop().catch(error => { console.error(error); process.exitCode = 1; }); });
    console.log(JSON.stringify({ origin, apiPort, directory, runDirectory, buildId: identity.buildId,
      instructions: 'Root owns resource claims, the explicit API port, browser/GPU and eventual shutdown. This process owns only its preview; Ctrl+C closes only its own server/sockets.' }));
  } else throw new Error('Usage: build SNAPSHOT OUTPUT LABEL [original|translucent] [ABS_CLOCK_JSON] | inspect BUILD | serve BUILD RUN_OUTPUT [PORT] [API_PORT]');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await run(...process.argv.slice(2));
