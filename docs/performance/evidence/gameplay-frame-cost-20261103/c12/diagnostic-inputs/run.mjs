import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as canonical from '../render-next-20261102/harness/common.mjs';

const here = import.meta.dirname;
export const marker = '  startBenchmark() {\n    if (!this.ready || this.disposed || this.rendererFailed) return false;';
export function transformGame(source) {
  const normalized = source.replaceAll('\r\n', '\n');
  if (normalized.includes('virtual:gameplay-routine') || normalized.split(marker).length !== 2)
    throw new Error('Expected exactly one original startBenchmark guard');
  return 'import { startRoutineCapture } from "virtual:gameplay-routine";\n' +
    normalized.replace(marker, marker + '\n    return startRoutineCapture(this);');
}
const files = ['run.mjs', 'browser.mjs', 'routine.test.mjs', 'README.md'];
export async function extraInputs() {
  const entries = files.map(name => [name, join(here, name)]);
  for (const name of ['routine-cost.mjs', 'routine-cost-core.mjs'])
    entries.push(['donor/' + name, join(here, '../webgpu-completion-20261021/measurement', name)]);
  return Object.fromEntries(await Promise.all(entries.map(async ([name, path]) => [name, await canonical.fileHash(path)])));
}
export function assertExtra(expected, actual) {
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Routine diagnostic input changed');
}
async function verifyExtra(identity) {
  if (identity.diagnostic?.kind !== 'routine-cost' || identity.diagnostic.routineCost !== true)
    throw new Error('Not a routine diagnostic build');
  assertExtra(identity.diagnostic.files, await extraInputs());
}
async function build() {
  const started = performance.now();
  await mkdir(canonical.cache, { recursive: true }); await mkdir(canonical.buildDir);
  try {
    const inputs = await canonical.readInputs(), files = await extraInputs();
    await canonical.saveNew(join(canonical.buildDir, 'inputs-before.json'), { ...inputs, diagnosticFiles: files });
    const original = await readFile(join(canonical.root, 'client/game.ts'), 'utf8');
    const transformed = transformGame(original);
    const diagnostic = { kind: 'routine-cost', routineCost: true, files,
      helperHash: canonical.hash(JSON.stringify(files)), sourceSnapshotId: inputs.sourceHash,
      transform: { file: 'client/game.ts', before: canonical.hash(original), after: canonical.hash(transformed) } };
    for (const key of Object.keys(process.env)) if (/^VITE_/i.test(key)) delete process.env[key];
    const { build: viteBuild, loadConfigFromFile, mergeConfig } = await import('vite');
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(canonical.root, 'vite.config.ts'), canonical.root, undefined, undefined, 'native');
    if (!loaded) throw new Error('Missing production Vite configuration');
    let hits = 0;
    await viteBuild(mergeConfig(loaded.config, {
      root: canonical.root, configFile: false, envFile: false, publicDir: false, cacheDir: join(canonical.buildDir, '.vite'),
      define: { 'import.meta.env.VITE_SOURCE_SNAPSHOT_ID': JSON.stringify(inputs.sourceHash),
        'import.meta.env.VITE_MULTIPLAYER_URL': JSON.stringify(canonical.origin + '/realtime'),
        __ROUTINE_DIAGNOSTIC_IDENTITY__: JSON.stringify(diagnostic) },
      build: { outDir: canonical.dist, emptyOutDir: false, copyPublicDir: false },
      plugins: [{ name: 'owned-eight-frame-routine-diagnostic', enforce: 'pre',
        resolveId(id) { if (id === 'virtual:gameplay-routine') return join(here, 'browser.mjs'); },
        transform(code, id) {
          if (id.split('?')[0].replaceAll('\\', '/') !== join(canonical.root, 'client/game.ts').replaceAll('\\', '/')) return;
          if (canonical.hash(code) !== diagnostic.transform.before) throw new Error('Game transform preimage changed');
          hits++; return { code: transformGame(code), map: null };
        },
        generateBundle() { if (hits !== 1) throw new Error('Game transform hit count: ' + hits); },
      }],
    }));
    const after = await canonical.readInputs(); canonical.assertInputIdentity(inputs, after);
    assertExtra(files, await extraInputs());
    await canonical.saveNew(join(canonical.buildDir, 'identity.json'), {
      schemaVersion: 1, createdAt: new Date().toISOString(), inputs, diagnostic,
      buildElapsedMs: performance.now() - started, bundleFiles: await canonical.treeHashes(canonical.dist),
      clientBuildId: loaded.config.define?.['import.meta.env.VITE_CLIENT_BUILD_ID'] ?? null,
      hashAfterDurationMs: after.hashDurationMs,
      method: 'Diagnostic build-only startBenchmark interception; eight actual renders; original canonical source and assets unchanged',
    });
  } catch (error) {
    await canonical.saveNew(join(canonical.buildDir, 'failure.json'), { at: new Date().toISOString(), error: String(error) }); throw error;
  }
}
async function serve(name) {
  canonical.runDirectory(name);
  const identity = await canonical.verifyBuild(); await verifyExtra(identity);
  try { await (await import('../render-next-20261102/harness/run.mjs')).serve(name); }
  finally { await verifyExtra(identity); }
}
async function main() {
  const [command, name, ...extra] = process.argv.slice(2);
  if (command === '--help') { console.log('Set STRAHOV_SHADER_CANDIDATE=candidate12. run.mjs --build | --serve run1. Serve also requires STRAHOV_PERF_WEATHER_FIXTURE.'); return; }
  if (process.env.STRAHOV_SHADER_CANDIDATE !== 'candidate12') throw new Error('This one-off diagnostic owns only candidate12 output');
  if (extra.length || !((command === '--build' && name === undefined) || (command === '--serve' && name))) throw new Error('Use --build or --serve run1');
  canonical.assertCanonicalMain();
  if (command === '--build') await build(); else await serve(name);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
