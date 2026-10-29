/** Explicit local build/serve CLI. No browser automation, API process spawning,
 * resource-claim takeover, or termination of any process by port. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve, join, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { sha256, inside, verifySnapshot, helperIdentity, transformUI, transformLoading, directoryHashes, previewPort, backendPort, parseBuildOptions,
  canonicalJSON, canonicalBuildInput, buildDigest, browserBuildIdentity, resolveBuildOverlay } from './common.mjs';
import { MAX_RECEIPT_BYTES, authorizeReceiptRequest, saveReceipt } from './receipt.mjs';
import { validateClockConfig } from './transit-clock.mjs';
import { loadWeatherInput, verifyBuiltWeather, serveWeatherFixture } from './weather-fixture.mjs';

const helperDirectory = dirname(fileURLToPath(import.meta.url));
const root = resolve(helperDirectory, '../../../../..');
const validation = join(root, '.cache/webgpu-completion-20261021/validation');
const writeNew = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
async function dependencyIdentity(snapshot) {
  const require = createRequire(join(snapshot, 'package.json'));
  const files = ['@babylonjs/core/package.json', '@babylonjs/core/Materials/materialDefines.js',
    '@babylonjs/core/Materials/shadowDepthWrapper.js', '@babylonjs/core/Materials/Textures/texture.pure.js',
    '@babylonjs/core/Materials/drawWrapper.js', '@babylonjs/core/Materials/material.pure.js', '@babylonjs/core/Materials/effect.pure.js',
    '@babylonjs/core/Materials/multiMaterial.pure.js', '@babylonjs/core/Materials/effect.functions.js',
    '@babylonjs/core/Engines/webgpuEngine.pure.js', '@babylonjs/core/Engines/WebGPU/webgpuPipelineContext.js',
    '@babylonjs/core/Lights/Shadows/shadowGenerator.js', '@babylonjs/core/Lights/light.js', '@babylonjs/core/Engines/abstractEngine.pure.js',
    '@babylonjs/core/scene.pure.js', '@babylonjs/core/Meshes/mesh.pure.js', '@babylonjs/core/Meshes/transformNode.pure.js',
    '@babylonjs/core/Materials/PBR/pbrBaseMaterial.pure.js', '@babylonjs/core/Materials/standardMaterial.pure.js',
    '@babylonjs/core/Rendering/objectRenderer.js', '@babylonjs/core/Misc/observable.js',
    '@babylonjs/core/Buffers/buffer.pure.js','@babylonjs/core/Buffers/dataBuffer.js','@babylonjs/core/Meshes/WebGPU/webgpuDataBuffer.js',
    '@babylonjs/core/Engines/WebGPU/webgpuBufferManager.js',
    '@babylonjs/core/Engines/WebGPU/webgpuDrawContext.js','@babylonjs/core/Engines/WebGPU/webgpuCacheRenderPipeline.js',
    '@babylonjs/core/Engines/WebGPU/webgpuBundleList.js','@babylonjs/core/Meshes/instancedMesh.pure.js','@babylonjs/core/Meshes/subMesh.pure.js',
    '@babylonjs/core/Layers/thinSelectionOutlineLayer.js'];
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
/** Pure metadata-to-emitted-browser binding, before choosing optional branches.
 * This is drift detection, not authentication against rewriting all bundles. */
export function verifyBuildSeal(identity, input, { inputBytes, overlayBytes, overlayTemplate, bundleFiles, bundleJavaScript }) {
  if (identity.buildId !== buildDigest(identity) || input.buildId !== buildDigest(input) ||
      canonicalBuildInput(identity) !== canonicalBuildInput(input)) throw new Error('Canonical build digest/input differs');
  if (sha256(inputBytes) !== identity.buildInputSha256) throw new Error('Sealed build-input bytes changed');
  for (const key of ['snapshot', 'sourceFiles', 'helperFiles', 'observerSha256', 'dependencies'])
    if (canonicalJSON(identity[key]) !== canonicalJSON(input[key])) throw new Error('Sealed build metadata differs: ' + key);
  if (sha256(overlayBytes) !== identity.overlaySha256 || identity.overlaySha256 !== input.overlaySha256 ||
      !overlayBytes.equals(Buffer.from(resolveBuildOverlay(overlayTemplate, input))))
    throw new Error('Sealed browser overlay identity differs');
  if (canonicalJSON(bundleFiles) !== canonicalJSON(identity.bundleFiles)) throw new Error('Immutable built bytes changed');
  let matched = false;
  for (const [file, bytes] of Object.entries(bundleJavaScript)) {
    if (!file.endsWith('.js') || sha256(bytes) !== bundleFiles[file]) throw new Error('Verified browser JavaScript differs');
    if (bytes.includes(Buffer.from(identity.buildId))) matched = true;
  }
  if (!matched) throw new Error('Canonical build identity absent from verified emitted browser JavaScript');
}
export function verifyBuildInputs(identity, { source, helper, clockBytes, weather, transforms, dependencies }) {
  verifyBuildContract(identity, source, clockBytes);
  if (helper.sha256 !== identity.helperSha256 || canonicalJSON(helper.files) !== canonicalJSON(identity.helperFiles))
    throw new Error('Verified helper branch differs');
  if (identity.sourceFiles !== Object.keys(source.files).length || identity.observerSha256 !== helper.files['startup-observer.mjs'])
    throw new Error('Verified source/helper proof fields differ');
  if (buildDigest({ ...identity, sourceSnapshotId: source.snapshotId, helperSha256: helper.sha256,
    weather: weather ?? null, transforms, dependencies }) !== identity.buildId) throw new Error('Verified weather/transform/dependency build inputs differ');
}
function transformedInputs(originalUI, originalCSS, loading) {
  const ui = transformUI(originalUI), css = transformLoading(originalCSS, loading);
  return { ui, css, transforms: {
    ui: { file: 'client/ui.tsx', before: sha256(originalUI), after: sha256(ui),
      scope: 'Build-only CRLF normalization, import and one observeStartup call in place of original await g.start; original source untouched' },
    loading: { file: 'client/style.css', variant: loading, before: sha256(originalCSS), after: sha256(css),
      scope: loading === 'original' ? 'Byte-identical original CSS' : 'Only .loading background #eff3e6 to rgba(239,243,230,.96); isolated diagnostic, not accepted runtime repair' },
  } };
}
export async function loadBuild(input) {
  const directory = inside(validation, resolve(input));
  const identity = JSON.parse(await readFile(join(directory, 'identity.json'), 'utf8'));
  const inputBytes = await readFile(join(directory, 'build-input.json')), sealedInput = JSON.parse(inputBytes.toString('utf8'));
  const helper = await helperIdentity(helperDirectory), bundleFiles = await directoryHashes(join(directory, 'dist'));
  const bundleJavaScript = {};
  for (const file of Object.keys(bundleFiles).filter(file => file.endsWith('.js')))
    bundleJavaScript[file] = await readFile(inside(join(directory, 'dist'), join(directory, 'dist', file)));
  verifyBuildSeal(identity, sealedInput, { inputBytes, bundleFiles, bundleJavaScript,
    overlayBytes: await readFile(join(directory, 'resolved-overlay.mjs')), overlayTemplate: await readFile(join(helperDirectory, 'qa-overlay.mjs'), 'utf8') });
  const source = await verifySnapshot(identity.snapshot);
  const clockBytes = identity.clock ? await readFile(join(directory, 'clock-config.json')) : undefined;
  const weather = await verifyBuiltWeather(directory, identity.weather);
  const transformed = transformedInputs(await readFile(join(identity.snapshot, 'client/ui.tsx'), 'utf8'),
    await readFile(join(identity.snapshot, 'client/style.css'), 'utf8'), identity.loading);
  verifyBuildInputs(identity, { source, helper, clockBytes, weather: weather?.specification, transforms: transformed.transforms,
    dependencies: await dependencyIdentity(identity.snapshot) });
  if (sha256(await readFile(join(directory, 'transformed-ui.tsx'))) !== sha256(transformed.ui) ||
      sha256(await readFile(join(directory, 'transformed-style.css'))) !== sha256(transformed.css))
    throw new Error('Sealed transformed source artifacts differ');
  return { directory, identity };
}
export async function run(command, input, output, label, option = 'original', ...extra) {
  if (command === 'build') {
    const options = parseBuildOptions([option, ...extra]);
    const { loading, clockFile } = options;
    if (!input || !output || !/^[a-z0-9-]+$/.test(label ?? '')) throw new Error('build SNAPSHOT OUTPUT LABEL [original|translucent]');
    const snapshot = inside(join(root, '.cache'), resolve(input));
    const source = await verifySnapshot(snapshot), helper = await helperIdentity(helperDirectory);
    const weather = options.weatherFile ? await loadWeatherInput(options.weatherFile, validation) : undefined;
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
    const { ui: transformedUI, css: transformedCSS, transforms } = transformedInputs(await readFile(join(snapshot, 'client/ui.tsx'), 'utf8'),
      await readFile(join(snapshot, 'client/style.css'), 'utf8'), loading);
    const dependencies = await dependencyIdentity(snapshot);
    const browserIdentity = browserBuildIdentity({ label, sourceSnapshotId: source.snapshotId, helperSha256: helper.sha256,
      loading, transforms, clock: clock ?? null, weather: weather?.specification ?? null, startupLatency: options.startupLatency, shaderAttribution: options.shaderAttribution, routineCost: options.routineCost,bufferLifecycle:options.bufferLifecycle, lifecycleControls: options.lifecycleControls, dependencies });
    const directory = await freshDirectory(output);
    const overlay = resolveBuildOverlay(await readFile(join(helperDirectory, 'qa-overlay.mjs'), 'utf8'), { ...browserIdentity, transforms });
    const observer = await readFile(join(helperDirectory, 'startup-observer.mjs'), 'utf8');
    const attempts = await readFile(join(helperDirectory, 'attempt-queue.mjs'), 'utf8');
    const transitClock = await readFile(join(helperDirectory, 'transit-clock.mjs'), 'utf8');
    const startupLatency = await readFile(join(helperDirectory, 'startup-latency.mjs'), 'utf8');
    const lifecycleControls = await readFile(join(helperDirectory, 'lifecycle-controls.mjs'), 'utf8');
    const entryRender = await readFile(join(helperDirectory, 'entry-render-cost.mjs'), 'utf8');
    const entryClasses = 'export { Game } from ' + JSON.stringify(join(snapshot, 'client/game.ts').replaceAll(String.fromCharCode(92), '/')) + ';export { Scene } from "@babylonjs/core/scene.js";export { GltfLightBudget } from ' + JSON.stringify(join(snapshot, 'client/gltf-light-budget.ts').replaceAll(String.fromCharCode(92), '/')) + ';export { StableLightState } from ' + JSON.stringify(join(snapshot, 'client/stable-light-state.ts').replaceAll(String.fromCharCode(92), '/')) + ';';
    const routineCore = await readFile(join(helperDirectory, 'routine-cost-core.mjs'), 'utf8');
    const routineCost = (await readFile(join(helperDirectory, 'routine-cost.mjs'), 'utf8'))
      .replace("'./routine-cost-core.mjs'", "'virtual:webgpu-completion-routine-core'");
    const bufferCore=await readFile(join(helperDirectory,'buffer-lifecycle-core.mjs'),'utf8');
    const bufferLifecycle=(await readFile(join(helperDirectory,'buffer-lifecycle.mjs'),'utf8'))
      .replace("'./buffer-lifecycle-core.mjs'","'virtual:webgpu-completion-buffer-core'");
    const shaderAttribution = (await readFile(join(helperDirectory, 'shader-attribution.mjs'), 'utf8'))
      .replace("'./shader-lifetime.mjs'", "'virtual:webgpu-completion-shader-lifetime'");
    const shaderLifetime = await readFile(join(helperDirectory, 'shader-lifetime.mjs'), 'utf8');
    const browserClock = (await readFile(join(helperDirectory, 'browser-clock.mjs'), 'utf8'))
      .replace("'./transit-clock.mjs'", "'virtual:webgpu-completion-clock'");
    await writeFile(join(directory, 'transformed-ui.tsx'), transformedUI, { flag: 'wx' });
    await writeFile(join(directory, 'transformed-style.css'), transformedCSS, { flag: 'wx' });
    await writeFile(join(directory, 'resolved-overlay.mjs'), overlay, { flag: 'wx' });
    if (clockBytes) await writeFile(join(directory, 'clock-config.json'), clockBytes, { flag: 'wx' });
    if (weather) {
      await writeFile(join(directory, 'weather-source.json'), weather.sourceBytes, { flag: 'wx' });
      await writeFile(join(directory, 'weather-emitted.json'), weather.emittedBytes, { flag: 'wx' });
    }
    await writeNew(join(directory, 'build-input.json'), { ...browserIdentity, snapshot, sourceFiles: Object.keys(source.files).length,
      helperFiles: helper.files, transforms, overlaySha256: sha256(overlay), observerSha256: sha256(observer), dependencies });
    const buildInputSha256 = sha256(await readFile(join(directory, 'build-input.json')));
    const { build, loadConfigFromFile, mergeConfig } = await import('vite');
    const config = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(snapshot, 'vite.config.ts'), snapshot, undefined, undefined, 'native');
    if (!config) throw new Error('Original production configuration unavailable');
    const virtual = '\0virtual:webgpu-completion-qa', virtualObserver = '\0virtual:webgpu-completion-observer', virtualAttempts = '\0virtual:webgpu-completion-attempts';
    const virtualClock = '\0virtual:webgpu-completion-clock', virtualBrowserClock = '\0virtual:webgpu-completion-browser-clock';
    const virtualLatency = '\0virtual:webgpu-completion-startup-latency', virtualAttribution = '\0virtual:webgpu-completion-shader-attribution';
    const virtualLifetime = '\0virtual:webgpu-completion-shader-lifetime';
    const virtualRoutine = '\0virtual:webgpu-completion-routine-cost', virtualRoutineCore = '\0virtual:webgpu-completion-routine-core';
    const virtualBuffer='\0virtual:webgpu-completion-buffer-lifecycle',virtualBufferCore='\0virtual:webgpu-completion-buffer-core';
    const virtualLifecycle = '\0virtual:webgpu-completion-lifecycle-controls';
    let uiHits = 0, cssHits = 0;
    await build(mergeConfig(config.config, {
      root: snapshot, configFile: false, cacheDir: join(directory, '.vite'),
      define: { 'import.meta.env.VITE_SOURCE_SNAPSHOT_ID': JSON.stringify(source.snapshotId), 'import.meta.env.VITE_MULTIPLAYER_URL': JSON.stringify('') },
      build: { outDir: join(directory, 'dist'), emptyOutDir: false, copyPublicDir: false, sourcemap: true },
      plugins: [{ name: 'explicit-webgpu-completion-qa', enforce: 'pre',
        resolveId(id) {
          if (id === 'virtual:webgpu-completion-entry-render') return '\0virtual:webgpu-completion-entry-render';
          if (id === 'virtual:webgpu-completion-entry-classes') return '\0virtual:webgpu-completion-entry-classes';
          if (id === 'virtual:webgpu-completion-qa') return virtual;
          if (id === 'virtual:webgpu-completion-observer') return virtualObserver;
          if (id === 'virtual:webgpu-completion-attempts') return virtualAttempts;
          if (id === 'virtual:webgpu-completion-clock') return virtualClock;
          if (id === 'virtual:webgpu-completion-browser-clock') return virtualBrowserClock;
          if (id === 'virtual:webgpu-completion-startup-latency') return virtualLatency;
          if (id === 'virtual:webgpu-completion-shader-attribution') return virtualAttribution;
          if (id === 'virtual:webgpu-completion-shader-lifetime') return virtualLifetime;
          if (id === 'virtual:webgpu-completion-routine-cost') return virtualRoutine;
          if (id === 'virtual:webgpu-completion-routine-core') return virtualRoutineCore;
          if(id==='virtual:webgpu-completion-buffer-lifecycle')return virtualBuffer;
          if(id==='virtual:webgpu-completion-buffer-core')return virtualBufferCore;
          if (id === 'virtual:webgpu-completion-lifecycle-controls') return virtualLifecycle;
          if (id === 'virtual:webgpu-completion-simulation') return join(snapshot, 'shared/simulation.ts').replaceAll('\\', '/');
        },
        load(id) {
          if (id === '\0virtual:webgpu-completion-entry-render') return entryRender;
          if (id === '\0virtual:webgpu-completion-entry-classes') return entryClasses;
          if (id === virtual) return overlay;
          if (id === virtualObserver) return observer;
          if (id === virtualAttempts) return attempts;
          if (id === virtualClock) return transitClock;
          if (id === virtualBrowserClock) return browserClock;
          if (id === virtualLatency) return startupLatency;
          if (id === virtualAttribution) return shaderAttribution;
          if (id === virtualLifetime) return shaderLifetime;
          if (id === virtualRoutine) return routineCost;
          if (id === virtualRoutineCore) return routineCore;
          if(id===virtualBuffer)return bufferLifecycle;
          if(id===virtualBufferCore)return bufferCore;
          if (id === virtualLifecycle) return lifecycleControls;
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
    if (options.weatherFile && JSON.stringify((await loadWeatherInput(options.weatherFile, validation)).specification) !== JSON.stringify(weather.specification))
      throw new Error('Weather input changed during build');
    if ((await helperIdentity(helperDirectory)).sha256 !== helper.sha256) throw new Error('Helper changed during build');
    if (JSON.stringify(await dependencyIdentity(snapshot)) !== JSON.stringify(dependencies)) throw new Error('Selected dependency bytes changed during build');
    const identity = { schemaVersion: 1, ...browserIdentity, snapshot, sourceFiles: Object.keys(source.files).length,
      helperFiles: helper.files, transforms, transformHits: { ui: uiHits, css: cssHits },
      overlaySha256: sha256(overlay), observerSha256: sha256(observer), dependencies, buildInputSha256,
      bundleFiles: await directoryHashes(join(directory, 'dist')), builtAt: new Date().toISOString(),
      limitation: 'No GPU acceptance from build. Browser exports buildId; sidecar binds that ID to actual bundle hashes. Public assets served from exact verified original snapshot, no mutation/copy.' };
    await writeNew(join(directory, 'identity.json'), identity);
    await loadBuild(directory);
    console.log(JSON.stringify({ directory, identity }, null, 2));
  } else if (command === 'inspect') {
    console.log(JSON.stringify(await loadBuild(input), null, 2));
  } else if (command === 'serve') {
    if (extra.length) throw new Error('Unexpected serve options; weather/latency are immutable build options');
    const port = previewPort(label ?? process.env.STRAHOV_WEBGPU_QA_PORT ?? '4211');
    const apiPort = backendPort(option === 'original' ? process.env.STRAHOV_WEBGPU_QA_API_PORT ?? '2596' : option);
    if (port === apiPort) throw new Error('Preview and API must use distinct owned ports');
    const origin = 'http://127.0.0.1:' + port;
    const { directory, identity } = await loadBuild(input), runDirectory = await freshDirectory(output);
    if (identity.clock && apiPort === 2596) throw new Error('Clock QA cannot use the immutable baseline API2596');
    const weather = await verifyBuiltWeather(directory, identity.weather);
    const { preview } = await import('vite'), { default: express } = await import('express');
    const publicFiles = express.static(join(identity.snapshot, 'public'), { maxAge: 0, etag: true, immutable: false });
    const server = await preview({ root: identity.snapshot, configFile: false, build: { outDir: join(directory, 'dist') },
      plugins: [{ name: 'owned-webgpu-completion-receipts', configurePreviewServer(previewServer) {
        previewServer.middlewares.use(async (req, res, next) => {
          if (serveWeatherFixture(req, res, weather?.emittedBytes)) return;
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
  } else throw new Error('Usage: build SNAPSHOT OUTPUT LABEL [original|translucent] [ABS_CLOCK_JSON] [--clock ABS_JSON] [--weather ABS_JSON] [--startup-latency] [--shader-attribution] [--routine-cost] [--buffer-lifecycle] | inspect BUILD | serve BUILD RUN_OUTPUT [PORT] [API_PORT]');
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await run(...process.argv.slice(2));
