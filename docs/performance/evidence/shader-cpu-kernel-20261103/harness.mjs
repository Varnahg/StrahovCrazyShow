import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import { captureCorpus } from './fixtures.mjs';
import { createKernel, instrumentedModule, outputIdentity, ownedPath, root, sha256 } from './kernel.mjs';

const integer = (text, label, max = 1000) => { const n = Number(text); assert.ok(Number.isInteger(n) && n >= 1 && n <= max, label); return n; };
function args(raw) {
  const out = { iterations: 12, rounds: 5, mode: 'paired' };
  for (let i = 0; i < raw.length; i += 2) {
    const [key, value] = [raw[i], raw[i + 1]];
    assert.ok(['--out', '--iterations', '--rounds', '--mode'].includes(key) && value, 'Unknown/missing argument ' + key);
    if (key === '--out') out.directory = ownedPath(value);
    if (key === '--iterations') out.iterations = integer(value, key);
    if (key === '--rounds') out.rounds = integer(value, key, 100);
    if (key === '--mode') { assert.ok(['paired', 'native', 'instrumented'].includes(value)); out.mode = value; }
  }
  assert.ok(out.directory, '--out NEW_RESERVED_DIRECTORY required'); return out;
}
const files = ['fixtures.mjs', 'kernel.mjs', 'harness.mjs', 'kernel.test.mjs', 'profile-summary.mjs'];
const dependencyFiles = [
  'Engines/Processors/shaderProcessor.js', 'Engines/Processors/shaderCodeNode.js', 'Engines/Processors/shaderCodeCursor.js',
  'Engines/Processors/shaderCodeConditionNode.js', 'Engines/Processors/shaderCodeTestNode.js',
  'Engines/Processors/Expressions/shaderDefineExpression.js', 'Engines/WebGPU/webgpuShaderProcessorsWGSL.pure.js',
  'Engines/WebGPU/webgpuShaderProcessor.js', 'Engines/WebGPU/webgpuShaderProcessingContext.js',
  'Engines/webgpuEngine.pure.js', 'Materials/effect.pure.js', 'Materials/effect.functions.js',
];
async function sourceIdentity() {
  const entries = [];
  for (const name of files) {
    const url = new URL(name, import.meta.url), bytes = await readFile(url);
    entries.push({ path: fileURLToPath(url), sha256: sha256(bytes), bytes: bytes.length });
  }
  for (const name of dependencyFiles) {
    const path = join(root, 'node_modules/@babylonjs/core', name), bytes = await readFile(path);
    entries.push({ path, sha256: sha256(bytes), bytes: bytes.length });
  }
  for (const name of ['pnpm-lock.yaml', 'patches/@babylonjs__core@9.30.0.patch']) {
    const bytes = await readFile(join(root, name)); entries.push({ path: name, sha256: sha256(bytes), bytes: bytes.length });
  }
  return entries;
}
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
function accumulate(out, row) {
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'number') out[key] = (out[key] ?? 0) + value;
    else if (value && typeof value === 'object') accumulate(out[key] ??= {}, value);
  }
}
function measure(kernel, corpus, iterations, timed) {
  const rows = [], total = {}, hashes = new Set();
  for (let iteration = 0; iteration < iterations; iteration++) for (const fixture of corpus) {
    const result = kernel.run(fixture);
    // Hashing/snapshot serialization are outside each reported WGSL pair time.
    hashes.add(outputIdentity(result));
    rows.push({ case: fixture.name, iteration, elapsedMs: result.elapsedMs });
    if (timed) accumulate(total, result.timings);
  }
  return { rows, totalPairMs: rows.reduce((sum, row) => sum + row.elapsedMs, 0),
    instrumentation: timed ? total : null, uniqueOutputHashes: hashes.size };
}
export async function run(options) {
  assert.equal(resolve(process.cwd()), root, 'canonical repository cwd required');
  assert.equal(execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(), 'main');
  assert.equal(JSON.parse(await readFile(join(root, 'node_modules/@babylonjs/core/package.json'), 'utf8')).version, '9.30.0');
  await mkdir(options.directory);
  const sourceBefore = await sourceIdentity();
  const diagnostic = options.mode !== 'native' ? await instrumentedModule(join(options.directory, 'instrumented')) : null;
  const plain = createKernel(), instrumented = diagnostic ? createKernel(diagnostic.module, true) : null;
  const corpus = await captureCorpus();
  try {
    const parity = [];
    for (const fixture of corpus) {
      const baseline = plain.run(fixture), candidate = instrumented?.run(fixture);
      if (candidate) assert.equal(outputIdentity(candidate), outputIdentity(baseline), 'full WGSL + binding context parity: ' + fixture.name);
      assert.ok(baseline.context.availableBuffers.Internals, 'normal pureMode=false engine must inject Internals');
      parity.push({ name: fixture.name, shader: fixture.shader, shaderLanguage: fixture.shaderLanguage,
        defines: fixture.defines, indexParameters: fixture.indexParameters, attributes: fixture.attributes,
        sourceSha256: [sha256(fixture.vertex), sha256(fixture.fragment)], sourceChars: [fixture.vertex.length, fixture.fragment.length],
        outputChars: [baseline.vertexCode.length, baseline.fragmentCode.length], outputSha256: outputIdentity(baseline),
        customAfterIncludes: typeof fixture.processCodeAfterIncludes === 'function', bindingContext: baseline.context });
    }
    // Prime the native expression cache and JIT identically; all samples retained.
    for (let warm = 0; warm < 2; warm++) for (const fixture of corpus) { plain.run(fixture); instrumented?.run(fixture); }
    const pairs = [];
    const heapBefore = process.memoryUsage();
    for (let round = 0; round < options.rounds; round++) {
      const order = options.mode === 'paired' ? (round % 2 ? ['instrumented', 'native'] : ['native', 'instrumented']) : [options.mode];
      const result = { round, order };
      for (const mode of order) result[mode] = measure(mode === 'native' ? plain : instrumented, corpus, options.iterations, mode !== 'native');
      pairs.push(result);
      console.log(JSON.stringify({ round, order, nativeMs: result.native?.totalPairMs, instrumentedMs: result.instrumented?.totalPairMs }));
    }
    const sourceAfter = await sourceIdentity();
    assert.deepEqual(sourceAfter, sourceBefore, 'harness/pinned inputs must remain byte-identical');
    const report = { schemaVersion: 1, createdAt: new Date().toISOString(), options, node: process.version,
      cpu: { model: os.cpus()[0]?.model, logicalProcessors: os.cpus().length }, gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      scope: 'CPU-only actual pinned Initialize/Process(vertex)/Process(fragment)/Finalize. Native material/shadow defines captured with NullEngine; no GPU compilation, rendering or whole-game FPS claim.',
      contract: { pureMode: false, shaderLanguage: 1, supportsUniformBuffers: true, version: '100', platformName: 'WEBGPU',
        isNDCHalfZRange: true, useReverseDepthBuffer: false, useExactSrgbConversions: false, drawBuffersExtension: true,
        materialLightsLimit: 4, actualNullEngineMaterials: true, imageReadinessStubbed: true, floatVertexAttributes: true,
        vertexFragmentSameSynchronousTurn: true },
      timingScopes: { totalPairMs: 'Initialize through Finalize; context/output serialization and output hashing excluded',
        includeMs: 'outer include expansion inclusive of nested includes; synchronous callback/conversion time excluded',
        parseMs: 'new root + cursor normalization + MoveCursor/expression construction', cursorMs: 'source split + cursor normalization, nested in parse',
        moveMs: 'MoveCursor including recursive expression construction, nested in parse', expressionMs: 'BuildExpression, nested in MoveCursor/parse',
        walkMs: 'root.process including dynamic condition evaluation and processor callbacks',
        callbackMs: 'varyingCheck and declaration processors nested in walk; init/preProcess/post/finalize separate',
        overhead: 'instrumented timings include observer clock/wrapper overhead; paired native timings quantify aggregate perturbation' },
      sources: sourceBefore, diagnosticSource: diagnostic?.provenance ?? null, parity, pairs,
      memory: { before: heapBefore, after: process.memoryUsage(), scope: 'process snapshots without forced GC; not allocation attribution or retained cache size' } };
    await save(join(options.directory, 'results.json'), report);
    console.log(JSON.stringify({ status: 'pass', cases: corpus.length, mode: options.mode, rounds: options.rounds, output: join(options.directory, 'results.json') }));
    return report;
  } finally { corpus.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run(args(process.argv.slice(2)));
