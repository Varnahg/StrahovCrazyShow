import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { stage, sources, ownedPath, root, hash } from './stage.mjs';
import { runner, identity, uniqueEffects } from './runner.mjs';
import { captureCorpus } from '../shader-cpu-kernel-20261103/fixtures.mjs';

function interleave(cases) {
  const groups = [...new Set(cases.map(item => item.shader))].map(shader => cases.filter(item => item.shader === shader));
  const result = [];
  for (let index = 0; result.length < cases.length; index++) for (const group of groups) if (group[index]) result.push(group[index]);
  return result;
}
function sample(owner, cases, expected, sweeps, scenario) {
  const rows = [], snapshots = []; let pairMs = 0, resetMs = 0;
  if (scenario === 'warm-lookup') {
    owner.cache?.reset();
    for (const item of cases) owner.run(item);
  }
  const harnessAt = performance.now();
  for (let sweep = 0; sweep < sweeps; sweep++) {
    if (scenario !== 'warm-lookup' && scenario !== 'cold-miss') {
      const at = performance.now(); owner.cache?.reset(); resetMs += performance.now() - at;
    }
    for (const item of cases) {
      if (scenario === 'cold-miss') {
        const at = performance.now(); owner.cache?.reset(); resetMs += performance.now() - at;
      }
      const result = owner.run(item); pairMs += result.elapsedMs;
      rows.push({ sweep, case: item.name, elapsedMs: result.elapsedMs });
      // Outside the kernel timer, but retained in separately named harnessWallMs.
      assert.equal(identity(result), expected.get(item.name), item.name);
    }
    snapshots.push(owner.cache?.snapshot() ?? null);
  }
  return { pairMs, resetMs, combinedCpuMs: pairMs + resetMs,
    harnessWallMs: performance.now() - harnessAt, rows, snapshots };
}
async function fileFacts() {
  const files = ['stage.mjs', 'runner.mjs', 'benchmark.mjs'];
  const results = [];
  for (const name of files) { const path = fileURLToPath(new URL(name, import.meta.url)), bytes = await readFile(path);
    results.push({ path, bytes: bytes.length, sha256: hash(bytes) }); }
  for (const path of ['tests/shader-syntax-cache-native.test.ts', 'docs/performance/evidence/shader-cpu-kernel-20261103/fixtures.mjs',
    'node_modules/@babylonjs/core/Engines/Processors/shaderCodeNode.js', 'node_modules/@babylonjs/core/Engines/Processors/shaderCodeCursor.js',
    'node_modules/@babylonjs/core/Engines/Processors/shaderCodeConditionNode.js', 'node_modules/@babylonjs/core/Engines/Processors/shaderCodeTestNode.js',
    'node_modules/@babylonjs/core/Engines/Processors/Expressions/shaderDefineExpression.js',
    'node_modules/@babylonjs/core/Engines/WebGPU/webgpuShaderProcessorsWGSL.pure.js',
    'node_modules/@babylonjs/core/Engines/WebGPU/webgpuShaderProcessingContext.js']) {
    const bytes = await readFile(join(root, path)); results.push({ path, bytes: bytes.length, sha256: hash(bytes) });
  }
  return results;
}
function parse(args) {
  const result = { rounds: 5, sweeps: 3 };
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    assert.ok(value && ['--out', '--rounds', '--sweeps', '--scenario'].includes(key), 'invalid argument');
    if (key === '--out') result.out = ownedPath(value);
    else if (key === '--scenario') { assert.ok(['first-sweep', 'warm-lookup', 'cold-miss', 'eviction', 'oversized', 'disabled'].includes(value)); result.scenario = value; }
    else { const n = Number(value); assert.ok(Number.isInteger(n) && n >= 1 && n <= 50); result[key.slice(2)] = n; }
  }
  assert.ok(result.out, '--out required'); return result;
}
export async function benchmark(options) {
  assert.equal(resolve(process.cwd()), root);
  assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
  await mkdir(options.out);
  const manifest = await stage(join(options.out, 'modules')), filesBefore = await fileFacts();
  const original = await import(pathToFileURL(manifest.baselineModule).href), candidate = await import(pathToFileURL(manifest.candidateModule).href);
  const corpus = await captureCorpus(), cases = uniqueEffects(corpus), reference = runner(original);
  assert.equal(cases.length, 24);
  const expected = new Map(), parity = [];
  const parityCandidate = runner(candidate, { enabled: true });
  try {
    for (const item of corpus) {
      const a = reference.run(item), b = parityCandidate.run(item), value = identity(a);
      assert.equal(identity(b), value, item.name); expected.set(item.name, value);
      parity.push({ name: item.name, shader: item.shader, defines: item.defines, indexParameters: item.indexParameters, outputSha256: value });
    }
  } finally { parityCandidate.dispose(); }
  const settings = {
    'first-sweep': { enabled: true }, 'warm-lookup': { enabled: true }, 'cold-miss': { enabled: true },
    eviction: { enabled: true, maxEntries: 2 }, oversized: { enabled: true, maxNodes: 1 }, disabled: { enabled: false },
  };
  const results = [];
  try {
    for (const [scenario, cacheOptions] of Object.entries(settings)) {
      if (options.scenario && options.scenario !== scenario) continue;
      const list = scenario === 'eviction' ? interleave(cases) : cases;
      const enabled = runner(candidate, cacheOptions);
      try {
        // Warm both generated paths and the existing global expression cache.
        // Each measured first-sweep still begins with an explicitly empty AST cache.
        for (let warm = 0; warm < 2; warm++) for (const item of list) { reference.run(item); enabled.run(item); }
        for (let round = 0; round < options.rounds; round++) {
          const order = round % 2 ? ['candidate', 'baseline'] : ['baseline', 'candidate'];
          const row = { scenario, cacheOptions, round, order };
          for (const variant of order) row[variant] = sample(variant === 'baseline' ? reference : enabled,
            list, expected, options.sweeps, scenario);
          results.push(row);
          console.log(JSON.stringify({ scenario, round, order, baselineMs: row.baseline.combinedCpuMs,
            candidateMs: row.candidate.combinedCpuMs, ratio: row.candidate.combinedCpuMs / row.baseline.combinedCpuMs }));
        }
      } finally { enabled.dispose(); }
    }
    const after = await sources(); assert.equal(after.patchSha256, manifest.patchSha256);
    assert.deepEqual(await fileFacts(), filesBefore, 'no measured source changes during A/B');
    const executedScenarios = [...new Set(results.map(row => row.scenario))];
    const report = { schemaVersion: 1, executedScenarios, createdAt: new Date().toISOString(), node: process.version,
      cpu: { model: os.cpus()[0]?.model, logicalProcessors: os.cpus().length }, options, manifest, files: filesBefore,
      gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      scope: 'CPU-only exact pinned WGSL pair and processingContext parity. No GPU/game FPS claim. Symmetric JIT/expression-cache warmup; cold refers to AST cache, not fresh browser/process.',
      timing: { pairMs: 'Initialize through Finalize including lookup/admission/counting/freezing/eviction; context creation, result serialization and validation hashing excluded',
        resetMs: 'explicit lease reset costs; baseline no-op branch clock recorded equivalently', combinedCpuMs: 'pairMs + resetMs, disjoint',
        harnessWallMs: 'outer wall including output validation and snapshots; inclusive, never add to pairMs' },
      scenarios: { 'first-sweep': '24 unique native Effect+defines cases; empty AST cache at EACH sweep',
        'warm-lookup': 'explicit hot lookup upper-bound kernel scenario; repeated Effects would already hit native Effect cache in a real game',
        'cold-miss': 'reset before EACH pair; measures admission/freezing worst case without inter-Effect reuse',
        eviction: 'same unique cases interleaved by raw family, only 2 retained entries; includes LRU eviction',
        oversized: 'maxNodes=1 rejects all nonempty trees; no retained syntax', disabled: 'lease exists but opt-in is disabled' },
      parity, uniqueEffectCases: cases.length, results,
      dependencyIncident: 'Unexpected pnpm exec auto-reconcile occurred before measurement. Root audit confirmed only core processor JS/d.ts changed plus unrelated Vite package metadata; these staged original/candidate CPU paths use identical audited helper bytes. No pnpm is invoked here.' };
    await writeFile(join(options.out, 'results.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ status: 'pass', executedScenarios, scenarios: executedScenarios.length, rounds: options.rounds, out: options.out }));
    return report;
  } finally { corpus.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await benchmark(parse(process.argv.slice(2)));
