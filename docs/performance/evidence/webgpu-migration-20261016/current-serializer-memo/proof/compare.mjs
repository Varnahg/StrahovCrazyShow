import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url)), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['reference-wgsl-1-report.json', 'owner-wgsl-1-report.json'];
const bytes = paths.map(path => fs.readFileSync(join(root, path)));
const normalize = buffer => JSON.parse(buffer).results.map(result => {
  const { memo, memoCleanup, ...unchanged } = result;
  return unchanged;
});
const a = normalize(bytes[0]), m = normalize(bytes[1]);
assert.equal(a.length, 11); assert.deepEqual(m, a, 'All current actual non-owner WGSL/layout/defines/Effect/uniform/callback/cleanup results stay exact');
const record = { inputs: Object.fromEntries(paths.map((path, i) => [path, sha(bytes[i])])), results: a.length,
  states: a.reduce((sum, result) => sum + result.states.length, 0), exact: true,
  ignored: ['Top-level finishedAt, which is outside results', 'Only result.memo/result.memoCleanup owner-specific observation fields'],
  scope: 'Current reference versus current owner actual full non-owner result objects. No timing comparison or GPU proof.' };
fs.writeFileSync(join(root, 'parity-comparison.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify(record));
