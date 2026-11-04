import { mkdir, readFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as canonical from '../render-next-20261102/harness/common.mjs';

const here = import.meta.dirname;
const donorDirectory = join(here, '../webgpu-completion-20261021/measurement');
function replaceOnce(source, marker, replacement) {
  if (source.split(marker).length !== 2) throw new Error('Routine donor transform drift: ' + marker.slice(0, 70));
  return source.replace(marker, replacement);
}
// Serialized into the diagnostic donor only; never installed in production.
function recordMaterialCost(profile, index, receiver, elapsed) {
  if (index < 4 || index > 7) return;
  let receiverRows = profile.materialOwners.get(receiver), row = receiverRows?.[index];
  if (row) { row.calls++; row.inclusiveMs += elapsed; return; }
  if (profile.materialRows.size >= 256) { profile.materialOmitted.calls++; profile.materialOmitted.inclusiveMs += elapsed; return; }
  const scalar = (object, key) => {
    const value = object && Object.getOwnPropertyDescriptor(object, key)?.value;
    return typeof value === 'string' ? value.slice(0, 160) : typeof value === 'boolean' || typeof value === 'number' && Number.isFinite(value) ? value : null;
  };
  const materialId = scalar(receiver, 'uniqueId');
  if (!Number.isSafeInteger(materialId) || materialId < 0) throw new Error('Material uniqueId missing');
  const key = index + ':' + materialId;
  row = profile.materialRows.get(key);
  if (!row) {
    const metadata = {};
    for (const key of ['materialKey', 'treeClusterBank', 'sourcePixelsModified', 'sourcePack', 'buildingId', 'assetId', 'vehiclePaint', 'treeNormalSource']) {
      const value = scalar(Object.getOwnPropertyDescriptor(receiver, 'metadata')?.value, key);
      if (value !== null) metadata[key] = value;
    }
    row = { routine: profile.ids[index], materialId, name: scalar(receiver, 'name'),
      className: String(receiver.getClassName?.() ?? 'unknown').slice(0, 80), metadata, calls: 0, inclusiveMs: 0 };
    profile.materialRows.set(key, row);
  }
  if (!receiverRows) { receiverRows = []; profile.materialOwners.set(receiver, receiverRows); }
  receiverRows[index] = row;
  row.calls++; row.inclusiveMs += elapsed;
}
export function transformDonor(name, source) {
  if (source.includes('materialRowLimit: 256') || source.includes('function recordMaterialCost')) throw new Error('Donor already transformed');
  if (name === 'routine-cost-core.mjs') {
    let output = replaceOnce(source, 'export class RoutineCallProfile {',
      recordMaterialCost.toString() + '\nexport class RoutineCallProfile {\n  materialRows = new Map(); materialOwners = new WeakMap(); materialOmitted = { calls: 0, inclusiveMs: 0 };');
    output = replaceOnce(output, 'row.inclusiveMs += elapsed; row.selfSelectedMs += Math.max(0, elapsed - node.childMs);',
      'row.inclusiveMs += elapsed; row.selfSelectedMs += Math.max(0, elapsed - node.childMs);\n          try { recordMaterialCost(this, index, receiver, elapsed); } catch { this.fail(frame); }');
    return output;
  }
  if (name === 'routine-cost.mjs') return replaceOnce(source, 'return { schemaVersion: 1, scope: ROUTINE_SCOPE,',
    'return { materialRowLimit: 256, materialRows: core ? [...core.materialRows.values()].map(row => ({ ...row, metadata: { ...row.metadata } })) : [], materialOmitted: { ...(core?.materialOmitted ?? { calls: 0, inclusiveMs: 0 }) }, schemaVersion: 1, scope: ROUTINE_SCOPE,');
  throw new Error('Unexpected donor');
}
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
export async function finishDiagnosticServe(identity, run, operation, { read = extraInputs, save = canonical.saveNew, exists = canonical.exists } = {}) {
  let failure, validationError, actual;
  try { await operation(); } catch (error) { failure = error; }
  try { actual = await read(); assertExtra(identity.diagnostic.files, actual); } catch (error) { validationError = error; }
  const record = { finishedAt: new Date().toISOString(), extraInputsValidated: !validationError,
    expected: identity.diagnostic.files, actual: actual ?? null,
    serveError: failure ? String(failure) : null, validationError: validationError ? String(validationError) : null };
  // A failed canonical preflight may not create its run directory.
  const path = await exists(run) ? join(run, 'diagnostic-cleanup.json') : join(run, '../..', basename(run) + '-diagnostic-cleanup.json');
  let saveError;
  try { await save(path, record); } catch (error) { saveError = error; }
  const errors = [failure, validationError, saveError].filter(Boolean);
  if (errors.length) throw new AggregateError(errors, 'Diagnostic serve/validation/cleanup failed');
}
async function build() {
  const started = performance.now();
  await mkdir(canonical.cache, { recursive: true }); await mkdir(canonical.buildDir);
  try {
    const inputs = await canonical.readInputs(), files = await extraInputs();
    await canonical.saveNew(join(canonical.buildDir, 'inputs-before.json'), { ...inputs, diagnosticFiles: files });
    const original = await readFile(join(canonical.root, 'client/game.ts'), 'utf8');
    const transformed = transformGame(original);
    const donors = {};
    for (const name of ['routine-cost.mjs', 'routine-cost-core.mjs']) {
      const source = await readFile(join(donorDirectory, name), 'utf8');
      donors[name] = { source, transformed: transformDonor(name, source) };
    }
    const diagnostic = { kind: 'routine-cost', routineCost: true, files,
      helperHash: canonical.hash(JSON.stringify(files)), sourceSnapshotId: inputs.sourceHash,
      transform: { file: 'client/game.ts', before: canonical.hash(original), after: canonical.hash(transformed) },
      donorTransforms: Object.fromEntries(Object.entries(donors).map(([name, value]) => [name,
        { before: canonical.hash(value.source), after: canonical.hash(value.transformed) }])) };
    for (const key of Object.keys(process.env)) if (/^VITE_/i.test(key)) delete process.env[key];
    const { build: viteBuild, loadConfigFromFile, mergeConfig } = await import('vite');
    const loaded = await loadConfigFromFile({ command: 'build', mode: 'production' }, join(canonical.root, 'vite.config.ts'), canonical.root, undefined, undefined, 'native');
    if (!loaded) throw new Error('Missing production Vite configuration');
    let hits = 0; const donorHits = Object.fromEntries(Object.keys(donors).map(name => [name, 0]));
    await viteBuild(mergeConfig(loaded.config, {
      root: canonical.root, configFile: false, envFile: false, publicDir: false, cacheDir: join(canonical.buildDir, '.vite'),
      define: { 'import.meta.env.VITE_SOURCE_SNAPSHOT_ID': JSON.stringify(inputs.sourceHash),
        'import.meta.env.VITE_MULTIPLAYER_URL': JSON.stringify(canonical.origin + '/realtime'),
        __ROUTINE_DIAGNOSTIC_IDENTITY__: JSON.stringify(diagnostic) },
      build: { outDir: canonical.dist, emptyOutDir: false, copyPublicDir: false },
      plugins: [{ name: 'owned-eight-frame-routine-diagnostic', enforce: 'pre',
        resolveId(id) { if (id === 'virtual:gameplay-routine') return join(here, 'browser.mjs'); },
        transform(code, id) {
          const path = id.split('?')[0].replaceAll('\\', '/');
          for (const [name, donor] of Object.entries(donors)) if (path === join(donorDirectory, name).replaceAll('\\', '/')) {
            if (canonical.hash(code) !== diagnostic.donorTransforms[name].before) throw new Error('Donor preimage changed');
            donorHits[name]++; return { code: donor.transformed, map: null };
          }
          if (path !== join(canonical.root, 'client/game.ts').replaceAll('\\', '/')) return;
          if (canonical.hash(code) !== diagnostic.transform.before) throw new Error('Game transform preimage changed');
          hits++; return { code: transformGame(code), map: null };
        },
        generateBundle() { if (hits !== 1 || Object.values(donorHits).some(count => count !== 1)) throw new Error('Diagnostic transform hit count mismatch'); },
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
  const run = canonical.runDirectory(name);
  const identity = await canonical.json(join(canonical.buildDir, 'identity.json')); await verifyExtra(identity);
  await finishDiagnosticServe(identity, run, async () => (await import('../render-next-20261102/harness/run.mjs')).serve(name));
}
async function main() {
  const [command, name, ...extra] = process.argv.slice(2);
  if (command === '--help') { console.log('Set STRAHOV_SHADER_CANDIDATE=candidate13. run.mjs --build | --serve run1. Serve also requires STRAHOV_PERF_WEATHER_FIXTURE.'); return; }
  if (process.env.STRAHOV_SHADER_CANDIDATE !== 'candidate13') throw new Error('This one-off diagnostic owns only candidate13 output');
  if (extra.length || !((command === '--build' && name === undefined) || (command === '--serve' && name))) throw new Error('Use --build or --serve run1');
  canonical.assertCanonicalMain();
  if (command === '--build') await build(); else await serve(name);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
