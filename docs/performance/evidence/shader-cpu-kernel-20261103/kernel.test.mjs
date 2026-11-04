import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { captureCorpus } from './fixtures.mjs';
import { createKernel, instrumentedModule, outputIdentity, cacheRoot } from './kernel.mjs';
import { summarize } from './profile-summary.mjs';

test('actual Standard/PBR/shadow WGSL and binding contexts match instrumented native path', async t => {
  await mkdir(cacheRoot, { recursive: true });
  const directory = await mkdtemp(join(cacheRoot, 'test-'));
  const corpus = await captureCorpus(); t.after(() => corpus.dispose());
  const native = createKernel(), { module } = await instrumentedModule(join(directory, 'source'));
  const measured = createKernel(module, true);
  assert.equal(corpus.length, 32);
  assert.deepEqual([...new Set(corpus.map(c => c.shader))].sort(), ['default', 'pbr', 'shadowMap']);
  for (const fixture of corpus) {
    assert.equal(fixture.shaderLanguage, 1);
    assert.equal(fixture.indexParameters.maxSimultaneousMorphTargets, 0);
    if (fixture.shader !== 'shadowMap') assert.equal(fixture.indexParameters.maxSimultaneousLights, 4);
    const a = native.run(fixture), b = measured.run(fixture);
    assert.equal(outputIdentity(a), outputIdentity(b), fixture.name);
    assert.ok(a.context.availableBuffers.Internals);
    assert.equal(b.timings.includeCalls, 2);
    assert.equal(b.timings.evaluations, 2);
    assert.ok(b.timings.expressions > 0 && b.timings.expressionMs <= b.timings.moveMs);
    assert.ok(b.timings.cursorMs + b.timings.moveMs <= b.timings.parseMs);
    assert.ok(b.timings.walkMs >= 0 && b.timings.includeMs >= 0);
  }
  const fixture = { ...corpus.find(c => c.shader === 'pbr'), attributeKinds: { position: 3, normal: -3 } };
  assert.equal(outputIdentity(native.run(fixture)), outputIdentity(measured.run(fixture)), 'nonfloat context changes retained');
  assert.throws(() => measured.run({ ...fixture, vertex: fixture.vertex + '\n#include<missingKernelFixture>' }), /network fallback prohibited/);
  assert.equal(outputIdentity(native.run(fixture)), outputIdentity(measured.run(fixture)), 'failed include cannot poison later pass');
});

test('statistical profile classification separates nested include/parse/walk/finalize', () => {
  const node = (id, functionName, url, children = []) => ({ id, callFrame: { functionName, url, lineNumber: 0 }, children });
  const profile = { nodes: [node(1, 'ProcessIncludes', 'shaderProcessor.js', [2, 4, 6, 7, 9]),
    node(2, 'MoveCursor', 'shaderProcessor.js', [3]), node(3, 'BuildExpression', 'shaderProcessor.js'),
    node(4, 'process', 'shaderCodeNode.js', [5]), node(5, 'textureProcessor', 'webgpuShaderProcessorsWGSL.pure.js'),
    node(6, 'finalizeShaders', 'webgpuShaderProcessorsWGSL.pure.js'),
    node(7, 'ProcessShaderConversion', 'shaderProcessor.js', [8]), node(8, 'PreparePreProcessors', 'shaderProcessor.js'),
    node(9, '', 'materialPluginManager.pure.js')], samples: [1, 3, 5, 6, 8, 9], timeDeltas: [1000, 2000, 3000, 4000, 5000, 6000] };
  const result = summarize(profile);
  assert.equal(result.totalSampledMs, 21);
  assert.deepEqual(Object.fromEntries(result.categories.map(c => [c.category, c.ms])),
    { 'after-includes-callback': 6, 'generic-residual': 5, finalize: 4, 'walk+callbacks': 3, 'parse-tree+expressions': 2, includes: 1 });
});
