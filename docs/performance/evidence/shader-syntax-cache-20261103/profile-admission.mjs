import { readFile, writeFile } from 'node:fs/promises';
import { ownedPath } from './stage.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw Error('profile-admission.mjs INPUT.cpuprofile NEW_CACHE_OUTPUT.json');
const profile = JSON.parse(await readFile(input, 'utf8'));
const nodes = new Map(profile.nodes.map(node => [node.id, node])), parent = new Map();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
const byPhase = {}, self = new Map();
for (let i = 0; i < profile.samples.length; i++) {
  const stack = [];
  for (let id = profile.samples[i]; id; id = parent.get(id)) stack.push(nodes.get(id).callFrame);
  const url = stack.find(frame => /shaderProcessor\.(candidate|original)\.mjs$/.test(frame.url))?.url;
  if (!url) continue;
  const variant = url.includes('.candidate.') ? 'candidate' : 'baseline';
  const has = name => stack.some(frame => frame.functionName === name);
  let category = 'other-processing';
  if (has('FreezeShaderSyntax')) category = 'freeze+census';
  else if (has('ParseShaderSource') || has('MoveCursor') || stack.some(frame => /shaderCodeCursor\.js$/.test(frame.url))) category = 'parse';
  else if (stack.some(frame => /shaderCode(Node|ConditionNode|TestNode)\.js$/.test(frame.url))) category = 'walk';
  else if (has('postProcessor')) category = 'post';
  else if (has('finalizeShaders')) category = 'finalize';
  else if (has('ProcessShaderConversion') || has('EvaluatePreProcessors')) category = 'generic-other';
  else if (has('ProcessIncludes')) category = 'include';
  const key = variant + ':' + category, ms = profile.timeDeltas[i] / 1000;
  byPhase[key] = (byPhase[key] ?? 0) + ms;
  const frame = stack[0], location = variant + ':' + frame.url + ':' + frame.functionName;
  self.set(location, (self.get(location) ?? 0) + ms);
}
const result = {
  scope: 'Statistical entire-process profile, including parity/warmup. Equal pair invocations do not imply equal parse counts: candidate warmup can hit its cache. Only samples with original/candidate processor ancestors are classified. Not normalized strict cold A/B, GPU time or whole-game FPS.',
  byPhase, topSelf: [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([location, ms]) => ({ location, ms })),
};
await writeFile(ownedPath(output), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(byPhase));
