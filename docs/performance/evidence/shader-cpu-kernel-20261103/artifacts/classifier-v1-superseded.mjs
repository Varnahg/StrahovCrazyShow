import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { ownedPath } from './kernel.mjs';

export function summarize(profile) {
  const nodes = new Map(profile.nodes.map(node => [node.id, node])), parent = new Map();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const categories = {}, self = new Map();
  let totalUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const sample = profile.samples[i], delta = profile.timeDeltas[i]; totalUs += delta;
    const frames = []; for (let id = sample; id; id = parent.get(id)) frames.push(nodes.get(id).callFrame);
    const has = fn => frames.some(fn), named = name => has(f => f.functionName === name);
    let category = 'other';
    if (frames[0].functionName === '(garbage collector)') category = 'gc';
    else if (named('finalizeShaders')) category = 'finalize';
    else if (named('postProcessor')) category = 'post';
    else if (has(f => /shaderCode(?:Node|ConditionNode|TestNode)\.js$/.test(f.url))) category = 'walk+callbacks';
    else if (has(f => ['MoveCursor', 'MoveCursorWithinIf', 'BuildExpression', 'BuildSubExpression', 'ExtractOperation'].includes(f.functionName))) category = 'parse-tree+expressions';
    else if (has(f => /shaderCodeCursor\.js$/.test(f.url))) category = 'cursor';
    else if (named('ProcessIncludes')) category = 'includes';
    else if (named('preProcessShaderCode')) category = 'preProcess';
    else if (named('ProcessShaderConversion') || named('EvaluatePreProcessors')) category = 'generic-residual';
    categories[category] = (categories[category] ?? 0) + delta;
    const f = frames[0], key = `${f.url}:${f.lineNumber + 1}:${f.functionName}`;
    self.set(key, (self.get(key) ?? 0) + delta);
  }
  return { scope: 'Statistical Node CPU samples for entire process including imports/fixture/warmup and hashing. Categories are disjoint by deepest relevant phase; callback nesting excluded from includes. Not exact wall-clock phase timing.',
    samples: profile.samples.length, totalSampledMs: totalUs / 1000,
    categories: Object.entries(categories).map(([category, us]) => ({ category, ms: us / 1000, percent: us / totalUs * 100 })).sort((a, b) => b.ms - a.ms),
    topSelf: [...self.entries()].map(([location, us]) => ({ location, ms: us / 1000 })).sort((a, b) => b.ms - a.ms).slice(0, 30) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2); assert.ok(input && output);
  const result = summarize(JSON.parse(await readFile(input, 'utf8')));
  await writeFile(ownedPath(output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result.categories));
}
