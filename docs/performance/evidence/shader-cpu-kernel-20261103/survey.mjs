import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { captureCorpus } from './fixtures.mjs';
import { createKernel, outputIdentity, ownedPath, sha256 } from './kernel.mjs';

/** Untimed input/structure census only. No cache or altered processing path. */
export async function survey(directory) {
  directory = ownedPath(directory); await mkdir(directory);
  const url = import.meta.resolve('@babylonjs/core/Engines/Processors/shaderProcessor.js');
  const original = await readFile(new URL(url), 'utf8');
  const anchor = '    // Recompose\n    return rootNode.process(preprocessors, options, preProcessorsFromCode);';
  assert.equal(original.split(anchor).length, 2);
  let text = original.replace(/from "(\.[^"]+)"/g, (_m, specifier) => 'from ' + JSON.stringify(new URL(specifier, url).href));
  text = text.replace(anchor, '    __observe?.(sourceCode, rootNode);\n' + anchor);
  text += '\nexport let __observe; export function __setObserver(value) { __observe = value; }\n';
  const path = join(directory, 'shaderProcessor.survey.mjs'); await writeFile(path, text, { flag: 'wx' });
  const module = await import(pathToFileURL(path).href), measured = createKernel(module), baseline = createKernel();
  const entries = new Map(), evaluations = [], uniqueEffects = new Map();
  let caseName = '', shader = '', effectKey = '', defineHash = '', role = 0;
  module.__setObserver((source, root) => {
    let entry = entries.get(source);
    if (!entry) {
      let nodes = 0, operators = 0, textUnits = 0;
      const expression = node => { if (!node) return; operators++; for (const key of ['define', 'operand', 'testValue']) textUnits += typeof node[key] === 'string' ? node[key].length : 0;
        expression(node.leftOperand); expression(node.rightOperand); };
      const walk = node => { nodes++; for (const key of ['line', 'additionalDefineKey', 'additionalDefineValue']) textUnits += typeof node[key] === 'string' ? node[key].length : 0;
        expression(node.testExpression); for (const child of node.children) walk(child); };
      walk(root);
      entry = { sourceSha256: sha256(source), sourceUnits: source.length, nodes, operators, nodeStringUnits: textUnits, uses: 0, cases: [] };
      entries.set(source, entry);
    }
    entry.uses++; entry.cases.push(caseName + ':' + (role++ ? 'fragment' : 'vertex'));
    evaluations.push({ case: caseName, shader, effectKey, defineHash, sourceSha256: entry.sourceSha256 });
  });
  const corpus = await captureCorpus();
  try {
    for (const fixture of corpus) {
      caseName = fixture.name; shader = fixture.shader; role = 0;
      // Native createEffect uses vertex+fragment+defines; global defines are
      // identical for this corpus. Do not count repeated kernel calls as new
      // Effects that would bypass the engine's existing cache.
      defineHash = sha256(fixture.defines.join('\n'));
      effectKey = fixture.shader + '+' + fixture.shader + '@' + defineHash;
      const output = outputIdentity(measured.run(fixture));
      assert.equal(output, outputIdentity(baseline.run(fixture)), fixture.name);
      const prior = uniqueEffects.get(effectKey);
      if (prior) assert.equal(prior.output, output, 'same native Effect key must have identical output');
      else uniqueEffects.set(effectKey, { shader: fixture.shader, defineHash, output,
        sourcePair: [sha256(fixture.vertex), sha256(fixture.fragment)], firstCase: fixture.name });
    }
    const data = [...entries.values()].map(entry => ({ ...entry,
      distinctEffectKeys: [...new Set(evaluations.filter(row => row.sourceSha256 === entry.sourceSha256).map(row => row.effectKey))],
      distinctDefineBlocks: new Set(evaluations.filter(row => row.sourceSha256 === entry.sourceSha256).map(row => row.defineHash)).size }));
    const result = { scope: 'Untimed exact-string census of this 32-case synthetic native-material corpus. Not the browser full-game set or a measured cache speedup. Node/string counts are bounds proxies, not JS heap bytes.',
      originalSha256: sha256(original), instrumentedSha256: sha256(text),
      evaluations: evaluations.length, exactUniqueInputs: data.length, reusableEvaluationsAfterFirstUse: evaluations.length - data.length,
      uniqueNativeEffectKeys: uniqueEffects.size, duplicateNativeEffectCases: corpus.length - uniqueEffects.size,
      uniqueDefineBlocks: new Set([...uniqueEffects.values()].map(row => row.defineHash)).size,
      uniqueRawSourcePairs: new Set([...uniqueEffects.values()].map(row => row.sourcePair.join(':'))).size,
      firstSweepUniqueEffectEvaluations: uniqueEffects.size * 2,
      reuseAcrossDistinctEffectsAfterFirstInput: uniqueEffects.size * 2 - data.length,
      effectKeyScope: 'shader family + exact defines; all global flags fixed, pinned store sources; repeated identical Effect keys removed before reuse estimate',
      totalUniqueSourceUnits: data.reduce((sum, e) => sum + e.sourceUnits, 0), totalUniqueNodes: data.reduce((sum, e) => sum + e.nodes, 0),
      totalUniqueOperators: data.reduce((sum, e) => sum + e.operators, 0), totalUniqueNodeStringUnits: data.reduce((sum, e) => sum + e.nodeStringUnits, 0),
      entries: data, effects: [...uniqueEffects.values()], order: evaluations };
    await writeFile(join(directory, 'survey.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify({ evaluations: result.evaluations, unique: result.exactUniqueInputs, repeated: result.reusableEvaluationsAfterFirstUse,
      uniqueEffectKeys: result.uniqueNativeEffectKeys, firstUniqueEffectEvaluations: result.firstSweepUniqueEffectEvaluations,
      interEffectReuse: result.reuseAcrossDistinctEffectsAfterFirstInput,
      sourceUnits: result.totalUniqueSourceUnits, nodes: result.totalUniqueNodes, operators: result.totalUniqueOperators }));
    return result;
  } finally { module.__setObserver(undefined); entries.clear(); corpus.dispose(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await survey(process.argv[2]);
